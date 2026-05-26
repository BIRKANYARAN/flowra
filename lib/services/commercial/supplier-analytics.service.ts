// ── SupplierAnalyticsService — AP aging + supplier payment behavior ───────────
// Payables/supplier equivalent of customer-intelligence.service.ts.
// Pure computation — no side effects beyond the DB query.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupplierProfile {
  supplier_name: string
  total_expenses_try: number
  expense_count: number
  unpaid_try: number
  overdue_try: number
  avg_days_to_pay: number | null   // from paid expenses (expense_date → paid_at)
  last_expense_date: string | null
  expense_types: string[]           // unique expense types from this supplier
  payment_rate: number              // paid_count / total_count × 100
  risk_tier: 'low' | 'medium' | 'high' | 'critical'
}

export interface APAgingBucket {
  bucket: 'current' | 'overdue_30' | 'overdue_60' | 'overdue_90_plus'
  label: string
  total_try: number
  count: number
}

export interface SupplierAnalyticsReport {
  suppliers: SupplierProfile[]
  aging: APAgingBucket[]
  total_payables_try: number
  total_overdue_try: number
  overdue_ratio: number
  top_supplier_share: number        // top supplier as % of total spend
  hhi: number                       // concentration index 0-1
  concentration_status: 'low' | 'moderate' | 'high'
  period_label: string
}

// ── Raw expense row from DB ────────────────────────────────────────────────────

interface ExpenseRow {
  supplier_name?: string | null
  amount_try: number | null
  expense_type?: string | null
  expense_date?: string | null
  payment_status?: string | null
  paid_at?: string | null
  updated_at?: string | null
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

// ── Pure exported helpers ─────────────────────────────────────────────────────

/**
 * Bucket AP (unpaid/partial) expenses by how old they are relative to today.
 * - current:         ≤30 days old
 * - overdue_30:      31-60 days
 * - overdue_60:      61-90 days
 * - overdue_90_plus: >90 days
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function computeAPAging(expenses: any[], today: string): APAgingBucket[] {
  const buckets: Record<APAgingBucket['bucket'], APAgingBucket> = {
    current:        { bucket: 'current',        label: 'Güncel (0-30 Gün)',    total_try: 0, count: 0 },
    overdue_30:     { bucket: 'overdue_30',     label: 'Gecikmiş 31-60 Gün',   total_try: 0, count: 0 },
    overdue_60:     { bucket: 'overdue_60',     label: 'Gecikmiş 61-90 Gün',   total_try: 0, count: 0 },
    overdue_90_plus:{ bucket: 'overdue_90_plus',label: 'Gecikmiş 90+ Gün',     total_try: 0, count: 0 },
  }

  const todayMs = new Date(today).getTime()

  for (const exp of expenses) {
    const status = exp.payment_status ?? 'pending'
    if (status !== 'pending' && status !== 'partial') continue

    const expDate = exp.expense_date
    if (!expDate) continue

    const ageDays = Math.round((todayMs - new Date(expDate).getTime()) / 86_400_000)
    const amount  = Number(exp.amount_try ?? 0)

    let key: APAgingBucket['bucket']
    if (ageDays <= 30)       key = 'current'
    else if (ageDays <= 60)  key = 'overdue_30'
    else if (ageDays <= 90)  key = 'overdue_60'
    else                     key = 'overdue_90_plus'

    buckets[key].total_try += amount
    buckets[key].count++
  }

  return Object.values(buckets)
}

/**
 * Build a SupplierProfile from a group of expense rows for one supplier.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSupplierProfile(supplierName: string, expenses: any[], today: string): SupplierProfile {
  const todayMs = new Date(today).getTime()

  let totalExpensesTry = 0
  let unpaidTry        = 0
  let overdueTry       = 0
  let paidCount        = 0
  let lastExpenseDate: string | null = null
  const expenseTypesSet = new Set<string>()
  const daysToPayList: number[] = []

  for (const exp of expenses) {
    const amount  = Number(exp.amount_try ?? 0)
    const status  = exp.payment_status ?? 'pending'
    const expDate = exp.expense_date ?? null
    const expType = exp.expense_type ?? null
    const paidAt  = exp.paid_at ?? exp.updated_at ?? null

    totalExpensesTry += amount

    if (expType) expenseTypesSet.add(String(expType))

    if (expDate) {
      if (!lastExpenseDate || expDate > lastExpenseDate) lastExpenseDate = expDate
    }

    if (status === 'paid') {
      paidCount++
      // Compute days to pay if dates available
      if (expDate && paidAt) {
        const dtp = daysBetween(expDate, paidAt)
        if (dtp >= 0) daysToPayList.push(dtp)
      }
    } else {
      // pending or partial
      unpaidTry += amount

      // Check if overdue (>60 days old and still unpaid)
      if (expDate) {
        const ageDays = Math.round((todayMs - new Date(expDate).getTime()) / 86_400_000)
        if (ageDays > 60) {
          overdueTry += amount
        }
      }
    }
  }

  const totalCount  = expenses.length
  const paymentRate = totalCount > 0 ? (paidCount / totalCount) * 100 : 0
  const avgDaysToPay = avg(daysToPayList)

  // Risk tier classification
  let riskTier: SupplierProfile['risk_tier']
  if (overdueTry > 0) {
    // overdue > 0 means expenses >60 days old unpaid
    riskTier = 'critical'
  } else if (unpaidTry > 0 && paymentRate < 70) {
    riskTier = 'high'
  } else if (paymentRate < 85) {
    riskTier = 'medium'
  } else {
    riskTier = 'low'
  }

  return {
    supplier_name:       supplierName,
    total_expenses_try:  totalExpensesTry,
    expense_count:       totalCount,
    unpaid_try:          unpaidTry,
    overdue_try:         overdueTry,
    avg_days_to_pay:     avgDaysToPay,
    last_expense_date:   lastExpenseDate,
    expense_types:       Array.from(expenseTypesSet),
    payment_rate:        Math.round(paymentRate * 100) / 100,
    risk_tier:           riskTier,
  }
}

/**
 * Compute HHI (Herfindahl-Hirschman Index) for supplier spend concentration.
 * HHI = Σ(share²) where share = supplier_spend / total_spend (0-1 fractions).
 * Returns 0 if total spend is 0.
 */
export function computeHHI(suppliers: SupplierProfile[]): number {
  const total = suppliers.reduce((s, sup) => s + sup.total_expenses_try, 0)
  if (total === 0) return 0
  return suppliers.reduce((sum, sup) => {
    const share = sup.total_expenses_try / total
    return sum + share * share
  }, 0)
}

// ── Service class ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class SupplierAnalyticsService {
  static async getReport(
    companyId: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<SupplierAnalyticsReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const sixMonthsAgo = new Date(new Date(today).getTime() - 183 * 86_400_000)
      .toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('expenses')
      .select(
        'supplier_name, amount_try, expense_type, expense_date, payment_status, paid_at, updated_at',
      )
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', sixMonthsAgo)
      .order('expense_date', { ascending: true })

    if (error) throw new Error(`SupplierAnalyticsService.getReport: ${error.message}`)

    const rows = (data ?? []) as ExpenseRow[]

    // Group rows by supplier_name
    const bySupplier = new Map<string, ExpenseRow[]>()
    for (const row of rows) {
      const key = (row.supplier_name ?? '').trim() || 'Diğer Tedarikçiler'
      if (!bySupplier.has(key)) bySupplier.set(key, [])
      bySupplier.get(key)!.push(row)
    }

    // Build profiles
    const suppliers: SupplierProfile[] = []
    for (const [name, supplierRows] of bySupplier.entries()) {
      suppliers.push(buildSupplierProfile(name, supplierRows, today))
    }

    // Sort by total spend descending
    suppliers.sort((a, b) => b.total_expenses_try - a.total_expenses_try)

    // AP aging (all pending/partial expenses in the period)
    const aging = computeAPAging(rows, today)

    // Aggregates
    const totalPayablesTry = suppliers.reduce((s, sup) => s + sup.unpaid_try, 0)
    const totalOverdueTry  = suppliers.reduce((s, sup) => s + sup.overdue_try, 0)
    const overdueRatio     = totalPayablesTry > 0 ? totalOverdueTry / totalPayablesTry : 0

    const totalSpend = suppliers.reduce((s, sup) => s + sup.total_expenses_try, 0)
    const topSupplierShare = totalSpend > 0 && suppliers.length > 0
      ? (suppliers[0].total_expenses_try / totalSpend) * 100
      : 0

    const hhi = computeHHI(suppliers)
    const concentration_status: SupplierAnalyticsReport['concentration_status'] =
      hhi < 0.15 ? 'low' : hhi <= 0.25 ? 'moderate' : 'high'

    const periodLabel = `${sixMonthsAgo} – ${today}`

    return {
      suppliers,
      aging,
      total_payables_try:   totalPayablesTry,
      total_overdue_try:    totalOverdueTry,
      overdue_ratio:        Math.round(overdueRatio * 10000) / 10000,
      top_supplier_share:   Math.round(topSupplierShare * 100) / 100,
      hhi:                  Math.round(hhi * 10000) / 10000,
      concentration_status,
      period_label:         periodLabel,
    }
  }
}
