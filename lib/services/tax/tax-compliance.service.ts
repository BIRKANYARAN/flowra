// ─────────────────────────────────────────────────────────────────────────────
// lib/services/tax/tax-compliance.service.ts
//
// Tax Compliance Dashboard — pure functions + TaxComplianceService class.
//
// Tracks all Turkish tax obligations (KDV, Geçici Vergi, Kurumlar Vergisi, SGK),
// computes a compliance health score 0-100, and returns a structured dashboard.
//
// Pure functions are exported for direct use and unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeKdvDueDate, computeGeciVergiDueDate, adjustForWeekend } from './tax-calendar.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function trMonth(m1: number): string {
  return TR_MONTHS[(m1 - 1)] ?? ''
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaxObligation {
  obligation_id: string          // e.g. 'kdv_2025_01', 'gecici_2025_q2'
  obligation_type: 'kdv' | 'gecici_vergi' | 'kurumlar_vergisi' | 'sgk'
  period_label: string           // "Ocak 2025 KDV"
  due_date: string               // ISO date YYYY-MM-DD
  amount_try: number | null      // computed or null if not yet calculable
  status: 'on_time' | 'upcoming_7d' | 'upcoming_30d' | 'overdue' | 'not_due' | 'paid'
  days_until_due: number         // negative if overdue
  is_blocking: boolean           // overdue = blocking
}

export interface TaxComplianceDashboard {
  as_of_date: string
  compliance_score: number
  compliance_status: 'compliant' | 'attention' | 'risk' | 'critical'
  obligations: TaxObligation[]
  total_pending_try: number           // sum of unpaid obligations with known amounts
  overdue_count: number
  next_due_obligation: TaxObligation | null
  kdv_ytd_paid_try: number            // estimated YTD KDV paid
  corporate_tax_provision_try: number // YTD provision
}

// ── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Compute KDV net obligation: output_vat - input_vat.
 * Returns 0 if result is negative (KDV credit, not obligation).
 */
export function computeKdvNetObligation(
  outputVatTry: number,
  inputVatTry: number,
): number {
  return Math.max(0, outputVatTry - inputVatTry)
}

/**
 * Compute corporate tax provision for a period.
 * net_income × 0.20 if net_income > 0, else 0.
 */
export function computeCorporateTaxProvision(netIncomeTry: number): number {
  if (netIncomeTry <= 0) return 0
  return netIncomeTry * 0.20
}

/**
 * Compute Geçici Vergi: net_income_ytd × 0.20 × quarterly_fraction,
 * minus prior payments.
 *
 * quarterly_fraction: Q1=0.25, Q2=0.50, Q3=0.75, Q4=1.00
 * Returns cumulative less prior payments; floored at 0.
 */
export function computeGeciVergi(
  netIncomeYtd: number,
  quarter: 1 | 2 | 3 | 4,
  priorPayments: number,
): number {
  const fractions: Record<1 | 2 | 3 | 4, number> = { 1: 0.25, 2: 0.50, 3: 0.75, 4: 1.00 }
  const fraction = fractions[quarter]
  const cumulative = netIncomeYtd * 0.20 * fraction
  return Math.max(0, cumulative - priorPayments)
}

/**
 * Compute compliance health score 0-100.
 * For each obligation: on_time=100, upcoming_7d=80, upcoming_30d=60, overdue=0, not_due=ignored.
 * Weighted by obligation amount (larger = more weight).
 * Empty array → 100 (no obligations = perfect compliance).
 */
export function computeComplianceScore(
  obligations: Array<{
    status: 'on_time' | 'upcoming_7d' | 'upcoming_30d' | 'overdue' | 'not_due'
    amount_try: number
  }>,
): number {
  // Filter out not_due — they don't affect the score
  const relevant = obligations.filter(o => o.status !== 'not_due')
  if (relevant.length === 0) return 100

  const scoreForStatus = (status: string): number => {
    switch (status) {
      case 'on_time':     return 100
      case 'upcoming_7d': return 80
      case 'upcoming_30d': return 60
      case 'overdue':     return 0
      default:            return 100
    }
  }

  // Weight by amount; if all amounts are 0, weight equally
  const totalWeight = relevant.reduce((s, o) => s + Math.max(0, o.amount_try), 0)

  if (totalWeight === 0) {
    // Equal weight
    const sum = relevant.reduce((s, o) => s + scoreForStatus(o.status), 0)
    return Math.round(sum / relevant.length)
  }

  const weightedSum = relevant.reduce((s, o) => {
    const weight = Math.max(0, o.amount_try)
    return s + scoreForStatus(o.status) * weight
  }, 0)

  return Math.round(weightedSum / totalWeight)
}

/**
 * Classify compliance status from score.
 * compliant ≥80, attention 60-79, risk 40-59, critical <40
 */
export function classifyComplianceStatus(
  score: number,
): 'compliant' | 'attention' | 'risk' | 'critical' {
  if (score >= 80) return 'compliant'
  if (score >= 60) return 'attention'
  if (score >= 40) return 'risk'
  return 'critical'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function dateDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function classifyStatus(
  daysUntil: number,
): 'on_time' | 'upcoming_7d' | 'upcoming_30d' | 'overdue' | 'not_due' {
  if (daysUntil < 0)    return 'overdue'
  if (daysUntil <= 7)   return 'upcoming_7d'
  if (daysUntil <= 30)  return 'upcoming_30d'
  return 'not_due'
}

// ── TaxComplianceService ──────────────────────────────────────────────────────

export class TaxComplianceService {
  constructor(private supabase: AnyClient) {}

  /**
   * Build TaxComplianceDashboard for the given company.
   * Fetches sales and expense data to compute KDV obligations,
   * derives net income for Geçici Vergi, and assembles the obligation list.
   */
  async getDashboard(companyId: string): Promise<TaxComplianceDashboard> {
    const today = new Date().toISOString().slice(0, 10)
    const currentYear = parseInt(today.slice(0, 4), 10)
    const currentMonth = parseInt(today.slice(5, 7), 10)
    const currentYM = today.slice(0, 7)

    // ── Fetch sales for KDV (current year) ───────────────────────────────────
    const { data: salesData } = await this.supabase
      .from('sales')
      .select('kdv_total, total_try, sale_date')
      .eq('company_id', companyId)
      .gte('sale_date', `${currentYear}-01-01`)
      .lte('sale_date', `${currentYear}-12-31`)
      .is('deleted_at', null)

    // ── Fetch expenses for input VAT estimation ───────────────────────────────
    const { data: expensesData } = await this.supabase
      .from('expenses')
      .select('amount_try, expense_date, category')
      .eq('company_id', companyId)
      .gte('expense_date', `${currentYear}-01-01`)
      .lte('expense_date', `${currentYear}-12-31`)
      .is('deleted_at', null)

    // ── Aggregate KDV per month ───────────────────────────────────────────────
    const monthlyOutputVat = new Map<string, number>()
    const monthlyInputVat  = new Map<string, number>()

    for (const sale of (salesData ?? [])) {
      const ym = (sale.sale_date as string).slice(0, 7)
      monthlyOutputVat.set(ym, (monthlyOutputVat.get(ym) ?? 0) + Number(sale.kdv_total ?? 0))
    }

    // Estimate input VAT: deductible expense categories × 20%
    const deductibleCategories = new Set([
      'general', 'rent', 'utilities', 'marketing', 'logistics', 'software', 'equipment', 'salary',
    ])

    for (const exp of (expensesData ?? [])) {
      const ym = (exp.expense_date as string).slice(0, 7)
      const cat = exp.category as string
      if (deductibleCategories.has(cat)) {
        const inputVat = Number(exp.amount_try ?? 0) * 0.20
        monthlyInputVat.set(ym, (monthlyInputVat.get(ym) ?? 0) + inputVat)
      }
    }

    // ── Compute YTD net income (revenue - cogs - expenses) ───────────────────
    // Simplified: revenue from sales, minus deductible expenses
    const ytdRevenue = (salesData ?? [])
      .reduce((s, sale) => s + Number(sale.total_try ?? 0), 0)

    const ytdDeductibleExpenses = (expensesData ?? [])
      .filter(e => deductibleCategories.has(e.category as string))
      .reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

    // Estimate COGS as 60% of revenue (common approximation when cogs not available)
    const ytdCogs = ytdRevenue * 0.60
    const ytdNetIncome = Math.max(0, ytdRevenue - ytdCogs - ytdDeductibleExpenses)

    // Current quarter
    const currentQuarter = Math.ceil(currentMonth / 3) as 1 | 2 | 3 | 4

    // ── Build obligations list ────────────────────────────────────────────────
    const obligations: TaxObligation[] = []

    // KDV — last 3 months (generate obligations for past 3 months that may be due)
    for (let i = 2; i >= 0; i--) {
      const date = new Date()
      date.setDate(1)
      date.setMonth(date.getMonth() - i)
      const year  = date.getFullYear()
      const month = date.getMonth() + 1
      const ym    = `${year}-${String(month).padStart(2, '0')}`

      // KDV is filed on 26th of FOLLOWING month
      const rawDue  = computeKdvDueDate(year, month)
      const dueDate = adjustForWeekend(rawDue)
      const daysUntil = dateDiff(today, dueDate)
      const status  = classifyStatus(daysUntil)

      const outputVat = monthlyOutputVat.get(ym) ?? 0
      const inputVat  = monthlyInputVat.get(ym) ?? 0
      const amount    = computeKdvNetObligation(outputVat, inputVat)

      obligations.push({
        obligation_id:   `kdv_${year}_${String(month).padStart(2, '0')}`,
        obligation_type: 'kdv',
        period_label:    `${trMonth(month)} ${year} KDV`,
        due_date:        dueDate,
        amount_try:      amount,
        status:          status === 'not_due' && daysUntil < 0 ? 'overdue' : status,
        days_until_due:  daysUntil,
        is_blocking:     daysUntil < 0,
      })
    }

    // SGK — current month (due 28th of same month)
    {
      const rawSgkDue = toYMD(currentYear, currentMonth, 28)
      const sgkDue    = adjustForWeekend(rawSgkDue)
      const daysUntil = dateDiff(today, sgkDue)
      const status    = classifyStatus(daysUntil)
      obligations.push({
        obligation_id:   `sgk_${currentYM}`,
        obligation_type: 'sgk',
        period_label:    `${trMonth(currentMonth)} ${currentYear} SGK`,
        due_date:        sgkDue,
        amount_try:      null, // manual
        status:          status === 'not_due' && daysUntil < 0 ? 'overdue' : status,
        days_until_due:  daysUntil,
        is_blocking:     daysUntil < 0,
      })
    }

    // Geçici Vergi — Q1, Q2, Q3 of current year (Q4 → Feb next year)
    for (const q of [1, 2, 3] as const) {
      const rawDue    = computeGeciVergiDueDate(currentYear, q)
      const dueDate   = adjustForWeekend(rawDue)
      const daysUntil = dateDiff(today, dueDate)
      const status    = classifyStatus(daysUntil)

      // Only compute amount if the quarter period has passed
      const qEndMonth = q * 3
      const qEndYM    = `${currentYear}-${String(qEndMonth).padStart(2, '0')}`
      let amount: number | null = null
      if (qEndYM <= currentYM) {
        amount = computeGeciVergi(ytdNetIncome, q, 0)
      }

      obligations.push({
        obligation_id:   `gecici_${currentYear}_q${q}`,
        obligation_type: 'gecici_vergi',
        period_label:    `${currentYear} Q${q} Geçici Vergi`,
        due_date:        dueDate,
        amount_try:      amount,
        status:          status === 'not_due' && daysUntil < 0 ? 'overdue' : status,
        days_until_due:  daysUntil,
        is_blocking:     daysUntil < 0,
      })
    }

    // Kurumlar Vergisi — April 30 of next year (for current year)
    {
      const rawKvDue  = toYMD(currentYear + 1, 4, 30)
      const kvDue     = adjustForWeekend(rawKvDue)
      const daysUntil = dateDiff(today, kvDue)
      const status    = classifyStatus(daysUntil)

      const kvAmount = computeCorporateTaxProvision(ytdNetIncome)

      obligations.push({
        obligation_id:   `kurumlar_vergisi_${currentYear}`,
        obligation_type: 'kurumlar_vergisi',
        period_label:    `${currentYear} Yılı Kurumlar Vergisi`,
        due_date:        kvDue,
        amount_try:      kvAmount,
        status:          status === 'not_due' && daysUntil < 0 ? 'overdue' : status,
        days_until_due:  daysUntil,
        is_blocking:     daysUntil < 0,
      })
    }

    // Sort by due_date ascending
    obligations.sort((a, b) => a.due_date.localeCompare(b.due_date))

    // ── Compute summary fields ────────────────────────────────────────────────

    const unpaidObligations = obligations.filter(o => o.status !== 'paid')

    const scoreObligations = unpaidObligations.map(o => ({
      status: o.status as 'on_time' | 'upcoming_7d' | 'upcoming_30d' | 'overdue' | 'not_due',
      amount_try: o.amount_try ?? 0,
    }))

    const complianceScore  = computeComplianceScore(scoreObligations)
    const complianceStatus = classifyComplianceStatus(complianceScore)

    const totalPendingTry = unpaidObligations.reduce(
      (s, o) => s + (o.amount_try ?? 0),
      0,
    )

    const overdueCount = obligations.filter(o => o.status === 'overdue').length

    const nextDueObligation = obligations.find(
      o => o.status !== 'paid' && o.days_until_due >= 0,
    ) ?? null

    // YTD KDV paid estimate: sum of positive KDV obligations for months already filed
    const kdvYtdPaidTry = obligations
      .filter(o => o.obligation_type === 'kdv' && o.due_date < today)
      .reduce((s, o) => s + (o.amount_try ?? 0), 0)

    const corporateTaxProvisionTry = computeCorporateTaxProvision(ytdNetIncome)

    void currentQuarter // suppress lint — available for future use

    return {
      as_of_date:                 today,
      compliance_score:           complianceScore,
      compliance_status:          complianceStatus,
      obligations,
      total_pending_try:          Math.round(totalPendingTry * 100) / 100,
      overdue_count:              overdueCount,
      next_due_obligation:        nextDueObligation,
      kdv_ytd_paid_try:           Math.round(kdvYtdPaidTry * 100) / 100,
      corporate_tax_provision_try: Math.round(corporateTaxProvisionTry * 100) / 100,
    }
  }
}
