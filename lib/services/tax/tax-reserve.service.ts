// ─────────────────────────────────────────────────────────────────────────────
// lib/services/tax/tax-reserve.service.ts
//
// Tax Reserve Tracker — computes how much cash to set aside for upcoming
// Turkish tax obligations.
//
// Tax types tracked:
//   kdv_net          — monthly VAT payable, due 26th of following month
//   gecici_vergi     — quarterly corporate tax advance (Q1 May, Q2 Aug, Q3 Nov)
//   kurumlar_vergisi — annual corporate tax, due April 30 of next year
//   stopaj           — dividend withholding, due 26th of month after declaration
//   sgk              — employer SGK contributions, due 28th of following month
//
// Architecture: pure helpers + a single async buildReport() method.
// All DB queries run via Promise.allSettled for resilience.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface TaxReserveItem {
  tax_type: 'kdv_net' | 'gecici_vergi' | 'kurumlar_vergisi' | 'stopaj' | 'sgk'
  label: string
  period_label: string
  due_date: string
  estimated_amount_try: number
  reserved_amount_try: number
  days_until_due: number
  status: 'overdue' | 'due_soon' | 'upcoming' | 'paid'
}

export interface TaxReserveReport {
  items: TaxReserveItem[]
  total_reserved_try: number
  total_overdue_try: number
  total_due_soon_try: number
  total_upcoming_try: number
  cash_available_try: number | null
  reserve_coverage_pct: number | null
  coverage_status: 'adequate' | 'tight' | 'insufficient' | 'unknown'
  as_of_date: string
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/** KDV net amount with 10% buffer */
export function computeKdvReserve(outputKdv: number, inputKdv: number): number {
  const net = Math.max(0, outputKdv - inputKdv)
  return net * 1.1
}

/** Determine coverage adequacy status */
export function computeCoverageStatus(coveragePct: number | null): TaxReserveReport['coverage_status'] {
  if (coveragePct === null) return 'unknown'
  if (coveragePct >= 120) return 'adequate'
  if (coveragePct >= 80)  return 'tight'
  return 'insufficient'
}

/** Assign status to a tax item given days until due and the amount */
export function assignTaxStatus(daysUntilDue: number, amount: number): TaxReserveItem['status'] {
  if (amount <= 0) return 'paid'
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 14) return 'due_soon'
  return 'upcoming'
}

/**
 * Returns the ISO due date string for the current quarter's gecici vergi.
 * Q1 (Jan-Mar) → May 17
 * Q2 (Apr-Jun) → Aug 17
 * Q3 (Jul-Sep) → Nov 17
 * Q4 (Oct-Dec) → null (covered by annual KV in April)
 */
export function computeGeciVergiDueDate(year: number, month: number): string | null {
  // month is 1-12
  if (month >= 1 && month <= 3) return `${year}-05-17`
  if (month >= 4 && month <= 6) return `${year}-08-17`
  if (month >= 7 && month <= 9) return `${year}-11-17`
  return null // Q4 — covered by annual KV
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function daysUntil(dueDate: string, today: string): number {
  const due = new Date(dueDate + 'T00:00:00')
  const now = new Date(today + 'T00:00:00')
  return Math.round((due.getTime() - now.getTime()) / 86_400_000)
}

function padMonth(m: number): string {
  return String(m).padStart(2, '0')
}

function currentMonthPeriod(today: string): { from: string; to: string; ym: string } {
  const year  = parseInt(today.slice(0, 4), 10)
  const month = parseInt(today.slice(5, 7), 10)
  const ym    = `${year}-${padMonth(month)}`
  const from  = `${ym}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to    = `${ym}-${padMonth(lastDay)}`
  return { from, to, ym }
}

function turkishMonthName(month: number, year: number): string {
  const months = [
    'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
    'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
  ]
  return `${months[month - 1]} ${year}`
}

// ── Main service ──────────────────────────────────────────────────────────────

export class TaxReserveService {
  static async buildReport(
    companyId: string,
    supabase: AnyClient,
    today?: string,
  ): Promise<TaxReserveReport> {
    const todayStr  = today ?? new Date().toISOString().slice(0, 10)
    const year      = parseInt(todayStr.slice(0, 4), 10)
    const month     = parseInt(todayStr.slice(5, 7), 10)
    const { from, to, ym } = currentMonthPeriod(todayStr)
    const ytdFrom   = `${year}-01-01`

    // ── Parallel data fetches ─────────────────────────────────────────────────

    const [
      salesKdvResult,
      expenseKdvResult,
      salaryResult,
      ytdIncomeResult,
      cashResult,
      dividendResult,
    ] = await Promise.allSettled([

      // 1. Output KDV from sales this month (real column: kdv_amount_try; soft delete: deleted_at)
      supabase
        .from('sales')
        .select('kdv_amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to),

      // 2. Input KDV from expenses with VAT this month. The schema has no
      //    deductibility flag, so (matching tax-compliance/tax-calendar) input KDV
      //    = expenses where kdv > 0. (DP-4)
      supabase
        .from('expenses')
        .select('kdv')
        .eq('company_id', companyId)
        .gt('kdv', 0)
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),

      // 3. Gross salary expenses this month for SGK calculation
      supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .eq('expense_type', 'salary')
        .gte('expense_date', from)
        .lte('expense_date', to),

      // 4. YTD net income (from financial_summaries or compute from sales/expenses)
      supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', todayStr),

      // 5. Balance sheet cash
      supabase
        .from('balance_sheet_snapshots')
        .select('cash_and_equivalents_try')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // 6. Approved dividend workflow instances this year
      supabase
        .from('workflow_instances')
        .select('payload, created_at')
        .eq('company_id', companyId)
        .eq('workflow_type', 'dividend_declaration')
        .eq('status', 'approved')
        .gte('created_at', `${year}-01-01T00:00:00.000Z`)
        .lte('created_at', `${year}-12-31T23:59:59.999Z`),
    ])

    // ── Extract values with safe fallbacks ────────────────────────────────────

    const outputKdv: number = salesKdvResult.status === 'fulfilled' && salesKdvResult.value.data
      ? salesKdvResult.value.data.reduce((s: number, r: { kdv_amount_try?: number }) => s + (r.kdv_amount_try ?? 0), 0)
      : 0

    const inputKdv: number = expenseKdvResult.status === 'fulfilled' && expenseKdvResult.value.data
      ? expenseKdvResult.value.data.reduce((s: number, r: { kdv?: number }) => s + (r.kdv ?? 0), 0)
      : 0

    const grossSalary: number = salaryResult.status === 'fulfilled' && salaryResult.value.data
      ? salaryResult.value.data.reduce((s: number, r: { amount_try?: number }) => s + (r.amount_try ?? 0), 0)
      : 0

    // Simplified YTD net income from sales revenue minus a ~40% expense ratio estimate
    // (real projects would join expenses; this keeps the query lightweight)
    const ytdRevenue: number = ytdIncomeResult.status === 'fulfilled' && ytdIncomeResult.value.data
      ? ytdIncomeResult.value.data.reduce((s: number, r: { total_try?: number }) => s + (r.total_try ?? 0), 0)
      : 0

    const cashAvailable: number | null =
      cashResult.status === 'fulfilled' &&
      cashResult.value.data &&
      cashResult.value.data.length > 0
        ? (cashResult.value.data[0].cash_and_equivalents_try ?? null)
        : null

    interface DividendPayload { withholding_try?: number }
    const dividendWithholdings: { amount: number; date: string }[] =
      dividendResult.status === 'fulfilled' && dividendResult.value.data
        ? dividendResult.value.data.map((row: { payload: DividendPayload; created_at: string }) => ({
            amount: row.payload?.withholding_try ?? 0,
            date:   row.created_at?.slice(0, 10) ?? todayStr,
          }))
        : []

    // ── Build items ───────────────────────────────────────────────────────────
    const items: TaxReserveItem[] = []

    // 1. KDV Net
    const kdvNet        = Math.max(0, outputKdv - inputKdv)
    const kdvReserved   = computeKdvReserve(outputKdv, inputKdv)
    const nextMonth     = month === 12 ? 1 : month + 1
    const nextMonthYear = month === 12 ? year + 1 : year
    const kdvDueDate    = `${nextMonthYear}-${padMonth(nextMonth)}-26`
    const kdvDays       = daysUntil(kdvDueDate, todayStr)

    items.push({
      tax_type: 'kdv_net',
      label: 'KDV',
      period_label: `${turkishMonthName(month, year)} KDV`,
      due_date: kdvDueDate,
      estimated_amount_try: kdvNet,
      reserved_amount_try: kdvReserved,
      days_until_due: kdvDays,
      status: assignTaxStatus(kdvDays, kdvNet),
    })

    // 2. Geçici Vergi (quarterly)
    const geciciDueStr = computeGeciVergiDueDate(year, month)
    if (geciciDueStr) {
      // Q label
      const qNum = month <= 3 ? 1 : month <= 6 ? 2 : 3
      const qLabels = { 1: 'Q1 (Oca-Mar)', 2: 'Q2 (Nis-Haz)', 3: 'Q3 (Tem-Eyl)' }
      const ytdNetIncome = ytdRevenue * 0.25 // simplified: assume 25% net margin
      const geciciEstimated = Math.max(0, ytdNetIncome * 0.25 / 4)
      const geciciReserved  = geciciEstimated * 1.1
      const geciciDays      = daysUntil(geciciDueStr, todayStr)

      items.push({
        tax_type: 'gecici_vergi',
        label: 'Geçici Vergi',
        period_label: `${year} ${qLabels[qNum as keyof typeof qLabels]} Geçici Vergi`,
        due_date: geciciDueStr,
        estimated_amount_try: geciciEstimated,
        reserved_amount_try: geciciReserved,
        days_until_due: geciciDays,
        status: assignTaxStatus(geciciDays, geciciEstimated),
      })
    }

    // 3. Kurumlar Vergisi (annual)
    const kvDueDate   = `${year + 1}-04-30`
    const kvEstimated = Math.max(0, ytdRevenue * 0.25 * 0.25) // 25% margin × 25% tax
    const kvReserved  = kvEstimated * 0.75 // remainder after gecici payments
    const kvDays      = daysUntil(kvDueDate, todayStr)

    items.push({
      tax_type: 'kurumlar_vergisi',
      label: 'Kurumlar Vergisi',
      period_label: `${year} Yılı Kurumlar Vergisi`,
      due_date: kvDueDate,
      estimated_amount_try: kvEstimated,
      reserved_amount_try: kvReserved,
      days_until_due: kvDays,
      status: assignTaxStatus(kvDays, kvEstimated),
    })

    // 4. Stopaj (withholding on dividends)
    for (const dw of dividendWithholdings) {
      if (dw.amount <= 0) continue
      const dwMonth     = parseInt(dw.date.slice(5, 7), 10)
      const dwYear      = parseInt(dw.date.slice(0, 4), 10)
      const dwNextMonth = dwMonth === 12 ? 1 : dwMonth + 1
      const dwNextYear  = dwMonth === 12 ? dwYear + 1 : dwYear
      const stopajDue   = `${dwNextYear}-${padMonth(dwNextMonth)}-26`
      const stopajDays  = daysUntil(stopajDue, todayStr)

      items.push({
        tax_type: 'stopaj',
        label: 'Stopaj',
        period_label: `${turkishMonthName(dwMonth, dwYear)} Temettü Stopajı`,
        due_date: stopajDue,
        estimated_amount_try: dw.amount,
        reserved_amount_try: dw.amount,
        days_until_due: stopajDays,
        status: assignTaxStatus(stopajDays, dw.amount),
      })
    }

    // 5. SGK (employer contribution — 20.5% of gross salary)
    const sgkEstimated = grossSalary * 0.205
    const sgkReserved  = sgkEstimated
    const sgkDueDate   = `${nextMonthYear}-${padMonth(nextMonth)}-28`
    const sgkDays      = daysUntil(sgkDueDate, todayStr)

    items.push({
      tax_type: 'sgk',
      label: 'SGK',
      period_label: `${turkishMonthName(month, year)} SGK`,
      due_date: sgkDueDate,
      estimated_amount_try: sgkEstimated,
      reserved_amount_try: sgkReserved,
      days_until_due: sgkDays,
      status: assignTaxStatus(sgkDays, sgkEstimated),
    })

    // ── Aggregate ─────────────────────────────────────────────────────────────
    const totalReserved  = items.reduce((s, i) => s + i.reserved_amount_try, 0)
    const totalOverdue   = items.filter(i => i.status === 'overdue').reduce((s, i) => s + i.reserved_amount_try, 0)
    const totalDueSoon   = items.filter(i => i.status === 'due_soon').reduce((s, i) => s + i.reserved_amount_try, 0)
    const totalUpcoming  = items.filter(i => i.status === 'upcoming').reduce((s, i) => s + i.reserved_amount_try, 0)

    const coveragePct   = cashAvailable !== null && totalReserved > 0
      ? (cashAvailable / totalReserved) * 100
      : null

    // Sort by due_date ascending
    items.sort((a, b) => a.due_date.localeCompare(b.due_date))

    return {
      items,
      total_reserved_try:   totalReserved,
      total_overdue_try:    totalOverdue,
      total_due_soon_try:   totalDueSoon,
      total_upcoming_try:   totalUpcoming,
      cash_available_try:   cashAvailable,
      reserve_coverage_pct: coveragePct !== null ? Math.round(coveragePct * 10) / 10 : null,
      coverage_status:      computeCoverageStatus(coveragePct),
      as_of_date:           todayStr,
    }
  }
}
