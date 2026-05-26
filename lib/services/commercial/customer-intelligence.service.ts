// ── CustomerIntelligenceService — payment behavior analytics ─────────────────
// Computes per-customer payment profiles from historical sales data.
// Pure computation — no side effects beyond the DB query.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CustomerPaymentProfile {
  customer_name: string

  // Volume metrics
  total_sales: number
  total_revenue_try: number
  total_paid_try: number
  total_outstanding_try: number

  // Payment behavior
  avg_days_to_pay: number | null     // avg (paid_at - sale_date) for paid sales
  avg_days_overdue: number | null    // avg (paid_at - due_date) for paid+due_date sales
  on_time_rate: number               // 0-1 proportion paid on/before due_date

  // Risk signals
  overdue_sales_count: number
  overdue_amount_try: number
  last_overdue_date: string | null

  // Trend (last 90 days vs prior 90 days)
  recent_avg_days_to_pay: number | null
  trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'

  // Classification
  risk_tier: 'low' | 'medium' | 'high' | 'critical'

  // Activity
  last_sale_date: string | null
  first_sale_date: string | null
}

export interface PortfolioRisk {
  total_customers: number
  critical_count: number
  high_risk_count: number
  medium_risk_count: number
  low_risk_count: number
  portfolio_on_time_rate: number
  total_overdue_try: number
  avg_days_to_pay_portfolio: number | null
}

// ── Raw sale row from DB ───────────────────────────────────────────────────────

interface SaleRow {
  customer_name: string | null
  total_try: number | null
  paid_amount: number | null
  payment_status: string | null
  sale_date: string | null
  due_date: string | null
  paid_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
  )
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((s, n) => s + n, 0) / nums.length
}

function classifyRisk(p: Omit<CustomerPaymentProfile, 'risk_tier'>): CustomerPaymentProfile['risk_tier'] {
  if (p.overdue_amount_try > 0 && (p.avg_days_overdue ?? 0) > 30) return 'critical'
  if (p.overdue_amount_try > 0 || (p.avg_days_overdue ?? 0) > 14) return 'high'
  if (p.on_time_rate < 0.7 || (p.avg_days_to_pay ?? 0) > 45) return 'medium'
  return 'low'
}

function computeTrend(
  recentAvg: number | null,
  priorAvg: number | null,
  recentCount: number,
  priorCount: number,
): CustomerPaymentProfile['trend'] {
  if (recentCount < 2 || priorCount < 2) return 'insufficient_data'
  if (recentAvg === null || priorAvg === null) return 'insufficient_data'
  const delta = recentAvg - priorAvg
  if (delta < -5) return 'improving'
  if (delta > 5) return 'deteriorating'
  return 'stable'
}

function buildProfile(
  customerName: string,
  rows: SaleRow[],
  today: string,
): CustomerPaymentProfile {
  const todayMs = new Date(today).getTime()
  const d90Ms   = 90 * 86_400_000
  const cutRecent = new Date(todayMs - d90Ms).toISOString().slice(0, 10)
  const cutPrior  = new Date(todayMs - 2 * d90Ms).toISOString().slice(0, 10)

  let totalSales = 0
  let totalRevenue = 0
  let totalPaid = 0
  let totalOutstanding = 0

  const daysToPayAll: number[] = []
  const daysOverdueAll: number[] = []
  let onTimeCount = 0
  let withDueDatePaidCount = 0

  let overdueSalesCount = 0
  let overdueAmountTry = 0
  let lastOverdueDate: string | null = null

  const recentDaysToPay: number[] = []
  const priorDaysToPay: number[] = []

  let lastSaleDate: string | null = null
  let firstSaleDate: string | null = null

  for (const row of rows) {
    totalSales++

    const total = Number(row.total_try ?? 0)
    const paid  = Number(row.paid_amount ?? 0)
    const status = row.payment_status ?? 'pending'
    const saleDate = row.sale_date
    const paidAt   = row.paid_at
    const dueDate  = row.due_date

    totalRevenue += total

    if (status === 'paid') {
      totalPaid += total
    } else {
      totalOutstanding += total - paid
    }

    // Track sale date range
    if (saleDate) {
      if (!firstSaleDate || saleDate < firstSaleDate) firstSaleDate = saleDate
      if (!lastSaleDate  || saleDate > lastSaleDate)  lastSaleDate  = saleDate
    }

    // Overdue signals — current overdue (not-paid and past due) or payment_status='overdue'
    const isCurrentlyOverdue =
      status === 'overdue' ||
      (status !== 'paid' && dueDate !== null && dueDate !== undefined && dueDate < today)

    if (isCurrentlyOverdue) {
      overdueSalesCount++
      overdueAmountTry += total - paid
      if (dueDate && (!lastOverdueDate || dueDate > lastOverdueDate)) {
        lastOverdueDate = dueDate
      }
    }

    // Payment timing — only for fully paid sales with a known sale_date and paid_at
    if (status === 'paid' && saleDate && paidAt) {
      const dtp = daysBetween(saleDate, paidAt)
      daysToPayAll.push(dtp)

      // Trend buckets
      if (saleDate >= cutRecent) {
        recentDaysToPay.push(dtp)
      } else if (saleDate >= cutPrior) {
        priorDaysToPay.push(dtp)
      }

      // On-time check — requires due_date
      if (dueDate) {
        const daysOverdue = daysBetween(dueDate, paidAt) // positive = late
        daysOverdueAll.push(daysOverdue)
        withDueDatePaidCount++
        if (paidAt <= dueDate) onTimeCount++
      }
    }
  }

  const avgDaysToPay = avg(daysToPayAll)
  const avgDaysOverdue = avg(daysOverdueAll)
  const onTimeRate = withDueDatePaidCount > 0 ? onTimeCount / withDueDatePaidCount : 0

  const recentAvg = avg(recentDaysToPay)
  const priorAvg  = avg(priorDaysToPay)
  const trend = computeTrend(recentAvg, priorAvg, recentDaysToPay.length, priorDaysToPay.length)

  const partial: Omit<CustomerPaymentProfile, 'risk_tier'> = {
    customer_name:         customerName,
    total_sales:           totalSales,
    total_revenue_try:     totalRevenue,
    total_paid_try:        totalPaid,
    total_outstanding_try: totalOutstanding,
    avg_days_to_pay:       avgDaysToPay,
    avg_days_overdue:      avgDaysOverdue,
    on_time_rate:          onTimeRate,
    overdue_sales_count:   overdueSalesCount,
    overdue_amount_try:    overdueAmountTry,
    last_overdue_date:     lastOverdueDate,
    recent_avg_days_to_pay: recentAvg,
    trend,
    last_sale_date:  lastSaleDate,
    first_sale_date: firstSaleDate,
  }

  return { ...partial, risk_tier: classifyRisk(partial) }
}

// ── Service class ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class CustomerIntelligenceService {
  static async getProfiles(
    companyId: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<CustomerPaymentProfile[]> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('sales')
      .select(
        'customer_name, total_try:total, paid_amount, payment_status, sale_date, due_date, paid_at',
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CustomerIntelligenceService.getProfiles: ${error.message}`)

    const rows = (data ?? []) as SaleRow[]

    // Group rows by customer_name
    const byCustomer = new Map<string, SaleRow[]>()
    for (const row of rows) {
      const key = row.customer_name ?? 'Bilinmiyor'
      if (!byCustomer.has(key)) byCustomer.set(key, [])
      byCustomer.get(key)!.push(row)
    }

    const profiles: CustomerPaymentProfile[] = []
    for (const [name, customerRows] of byCustomer.entries()) {
      profiles.push(buildProfile(name, customerRows, today))
    }

    return profiles
  }

  static async getProfile(
    companyId: string,
    customerName: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<CustomerPaymentProfile | null> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('sales')
      .select(
        'customer_name, total_try:total, paid_amount, payment_status, sale_date, due_date, paid_at',
      )
      .eq('company_id', companyId)
      .eq('customer_name', customerName)
      .is('deleted_at', null)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`CustomerIntelligenceService.getProfile: ${error.message}`)

    const rows = (data ?? []) as SaleRow[]
    if (rows.length === 0) return null

    return buildProfile(customerName, rows, today)
  }

  static computePortfolioRisk(profiles: CustomerPaymentProfile[]): PortfolioRisk {
    if (profiles.length === 0) {
      return {
        total_customers: 0,
        critical_count:  0,
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count:  0,
        portfolio_on_time_rate: 0,
        total_overdue_try: 0,
        avg_days_to_pay_portfolio: null,
      }
    }

    let criticalCount  = 0
    let highCount      = 0
    let mediumCount    = 0
    let lowCount       = 0
    let totalOverdue   = 0
    const daysToPayList: number[] = []
    const onTimeRates: number[] = []

    for (const p of profiles) {
      switch (p.risk_tier) {
        case 'critical': criticalCount++;  break
        case 'high':     highCount++;      break
        case 'medium':   mediumCount++;    break
        default:         lowCount++;       break
      }
      totalOverdue += p.overdue_amount_try
      if (p.avg_days_to_pay !== null) daysToPayList.push(p.avg_days_to_pay)
      onTimeRates.push(p.on_time_rate)
    }

    const avgDtpPortfolio = avg(daysToPayList)
    const portfolioOnTimeRate = onTimeRates.length > 0
      ? onTimeRates.reduce((s, r) => s + r, 0) / onTimeRates.length
      : 0

    return {
      total_customers:           profiles.length,
      critical_count:            criticalCount,
      high_risk_count:           highCount,
      medium_risk_count:         mediumCount,
      low_risk_count:            lowCount,
      portfolio_on_time_rate:    portfolioOnTimeRate,
      total_overdue_try:         totalOverdue,
      avg_days_to_pay_portfolio: avgDtpPortfolio,
    }
  }
}
