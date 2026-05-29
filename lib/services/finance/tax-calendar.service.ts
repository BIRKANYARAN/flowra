// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/tax-calendar.service.ts
//
// Turkish Tax Obligation Calendar Service
//
// Generates a forward-looking calendar of all Turkish tax filing and payment
// obligations based on the company's current financial state and YTD figures.
//
// Obligations covered:
//   KDV (Katma Değer Vergisi)       — monthly, 26th of following month
//   Muhtasar (Stopaj)               — monthly, 26th of following month
//   Geçici Vergi (Quarterly Tax)    — Q1 May 17 / Q2 Aug 17 / Q3 Nov 17 / Q4 Feb 17
//   Kurumlar Vergisi (Corporate Tax)— annual, April 30 of following year
//   SGK (Social Security)           — monthly, last day of following month
//   Bağ-Kur (Self-employment SGK)   — monthly, last working day of month (optional)
//
// This service is NOT a duplicate of tax-compliance.service.ts which handles
// overdue status. This service builds a complete forward-looking CALENDAR.
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function trMonth(month1: number): string {
  return TR_MONTHS[(month1 - 1)] ?? String(month1)
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Public types ───────────────────────────────────────────────────────────────

export type TaxType =
  | 'kdv'
  | 'muhtasar'
  | 'gecici_vergi'
  | 'kurumlar_vergisi'
  | 'sgk'
  | 'bag_kur'

export interface TaxObligation {
  /** Unique: type_YYYY-MM e.g. "kdv_2025-06" */
  id: string
  tax_type: TaxType
  /** Turkish: "KDV Beyannamesi - Haziran 2025" */
  label: string
  /** YYYY-MM or YYYY for annual */
  filing_period: string
  /** YYYY-MM-DD */
  due_date: string
  /** 0 if unknown */
  estimated_amount_try: number
  /**
   * due_soon: ≤ 14 days to due_date (and not overdue)
   * overdue: past due_date and not paid
   * upcoming: > 14 days ahead
   * paid: isPaid = true
   */
  status: 'upcoming' | 'due_soon' | 'overdue' | 'paid'
  /** negative if overdue */
  days_until_due: number
  /** brief Turkish description */
  description: string
}

// ── Pure date helpers ─────────────────────────────────────────────────────────

/**
 * Returns the last day of a month as day number (1-31).
 * Leverages Date(year, month, 0) trick where month is 1-indexed.
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Parses YYYY-MM into [year, month] numbers.
 */
function parseYM(ym: string): [number, number] {
  const [y, m] = ym.split('-').map(Number)
  return [y, m]
}

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Compute the KDV due date for a given filing month (YYYY-MM).
 * Returns YYYY-MM-26 of the FOLLOWING month.
 */
export function computeKdvDueDate(filingMonth: string): string {
  const [y, m] = parseYM(filingMonth)
  const nextYear  = m === 12 ? y + 1 : y
  const nextMonth = m === 12 ? 1 : m + 1
  return `${nextYear}-${pad2(nextMonth)}-26`
}

/**
 * Compute Muhtasar due date — same rule as KDV: 26th of following month.
 */
export function computeMuhtasarDueDate(filingMonth: string): string {
  return computeKdvDueDate(filingMonth)
}

/**
 * Compute Geçici Vergi due date given the quarter and year.
 * quarter: 1 (May 17), 2 (Aug 17), 3 (Nov 17), 4 (Feb 17 next year)
 */
export function computeGeciciVergiDueDate(year: number, quarter: 1 | 2 | 3 | 4): string {
  switch (quarter) {
    case 1: return `${year}-05-17`
    case 2: return `${year}-08-17`
    case 3: return `${year}-11-17`
    case 4: return `${year + 1}-02-17`
  }
}

/**
 * Compute Kurumlar Vergisi due date (April 30 of year+1).
 */
export function computeKurumlarVergiDueDate(taxYear: number): string {
  return `${taxYear + 1}-04-30`
}

/**
 * Compute SGK due date (last day of following month).
 * Turkish rule: SGK premiums for month M are due by the last day of month M+1.
 */
export function computeSgkDueDate(filingMonth: string): string {
  const [y, m] = parseYM(filingMonth)
  const nextYear  = m === 12 ? y + 1 : y
  const nextMonth = m === 12 ? 1 : m + 1
  const lastDay   = lastDayOfMonth(nextYear, nextMonth)
  return `${nextYear}-${pad2(nextMonth)}-${pad2(lastDay)}`
}

/**
 * Classify obligation status based on due_date vs today.
 * - paid: isPaid = true
 * - overdue: today > due_date and not paid
 * - due_soon: ≤ 14 days to due_date (and not overdue)
 * - upcoming: > 14 days ahead
 */
export function classifyObligationStatus(
  dueDateStr: string,
  todayStr: string,
  isPaid: boolean,
): TaxObligation['status'] {
  if (isPaid) return 'paid'
  if (todayStr > dueDateStr) return 'overdue'
  const days = computeDaysUntilDue(dueDateStr, todayStr)
  if (days <= 14) return 'due_soon'
  return 'upcoming'
}

/**
 * Compute days until due (negative = overdue).
 */
export function computeDaysUntilDue(dueDateStr: string, todayStr: string): number {
  const [dy, dm, dd] = dueDateStr.split('-').map(Number)
  const [ty, tm, td] = todayStr.split('-').map(Number)
  const a = Date.UTC(ty, tm - 1, td)
  const b = Date.UTC(dy, dm - 1, dd)
  return Math.round((b - a) / 86_400_000)
}

/**
 * Estimate KDV payable: output_kdv - input_kdv (clamp at 0).
 * output_kdv = monthlySalesTry × kdvRateSales
 * input_kdv  = monthlyExpensesTry × kdvRateExpenses
 */
export function estimateKdvPayable(
  monthlySalesTry: number,
  monthlyExpensesTry: number,
  kdvRateSales: number = 0.20,
  kdvRateExpenses: number = 0.20,
): number {
  const outputKdv = monthlySalesTry * kdvRateSales
  const inputKdv  = monthlyExpensesTry * kdvRateExpenses
  return Math.max(0, round2(outputKdv - inputKdv))
}

/**
 * Estimate Geçici Vergi: cumulative quarterly calculation.
 * quarter_cumulative_income = ytd_net_income / quarters_elapsed * quarter_num
 * gecici_vergi = quarter_cumulative_income × 0.25 - previously_paid_gecici_vergi
 * Clamped at 0.
 */
export function estimateGeciciVergi(
  ytdNetIncome: number,
  quartersElapsed: number,
  previouslyPaidGeciciVergi: number = 0,
): number {
  if (quartersElapsed <= 0) return 0
  const perQuarterIncome = ytdNetIncome / quartersElapsed
  const cumulativeIncome = perQuarterIncome * quartersElapsed  // = ytdNetIncome
  const grossTax = cumulativeIncome * 0.25
  return Math.max(0, round2(grossTax - previouslyPaidGeciciVergi))
}

/**
 * Estimate SGK monthly: total gross payroll × (employer + employee rates).
 * Default: employer 20.25% + employee 14% = 34.25% total
 */
export function estimateSgkMonthly(
  grossPayrollTry: number,
  employerRatePct: number = 20.25,
  employeeRatePct: number = 14.0,
): number {
  const totalRate = (employerRatePct + employeeRatePct) / 100
  return round2(grossPayrollTry * totalRate)
}

/**
 * Add N months to a YYYY-MM string, returning YYYY-MM.
 */
function addMonths(ym: string, n: number): string {
  const [y, m] = parseYM(ym)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${pad2(nm)}`
}

/**
 * Generate the next N months of obligations starting from a given month.
 * Includes: KDV, Muhtasar, SGK for each month; Geçici Vergi at Q months;
 * Kurumlar Vergisi for December; Bağ-Kur if monthly_bag_kur_try provided.
 */
export function generateObligationCalendar(
  startMonth: string,
  lookAheadMonths: number,
  todayStr: string,
  estimates: {
    monthly_kdv_try?: number
    monthly_muhtasar_try?: number
    monthly_sgk_try?: number
    quarterly_gecici_vergi_by_quarter?: Record<1 | 2 | 3 | 4, number>
    annual_kurumlar_vergisi_try?: number
    monthly_bag_kur_try?: number
  },
): TaxObligation[] {
  const obligations: TaxObligation[] = []

  for (let i = 0; i < lookAheadMonths; i++) {
    const ym = addMonths(startMonth, i)
    const [y, m] = parseYM(ym)
    const monthLabel = `${trMonth(m)} ${y}`

    // ── KDV ──────────────────────────────────────────────────────────────────
    {
      const dueDate = computeKdvDueDate(ym)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      const amount  = estimates.monthly_kdv_try ?? 0
      obligations.push({
        id:                    `kdv_${ym}`,
        tax_type:              'kdv',
        label:                 `KDV Beyannamesi - ${monthLabel}`,
        filing_period:         ym,
        due_date:              dueDate,
        estimated_amount_try:  amount,
        status,
        days_until_due:        days,
        description:           `${monthLabel} dönemi KDV beyannamesi ve ödemesi`,
      })
    }

    // ── Muhtasar (Stopaj) ─────────────────────────────────────────────────────
    {
      const dueDate = computeMuhtasarDueDate(ym)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      const amount  = estimates.monthly_muhtasar_try ?? 0
      obligations.push({
        id:                    `muhtasar_${ym}`,
        tax_type:              'muhtasar',
        label:                 `Muhtasar Beyanname - ${monthLabel}`,
        filing_period:         ym,
        due_date:              dueDate,
        estimated_amount_try:  amount,
        status,
        days_until_due:        days,
        description:           `${monthLabel} dönemi muhtasar (stopaj) beyannamesi`,
      })
    }

    // ── SGK ──────────────────────────────────────────────────────────────────
    {
      const dueDate = computeSgkDueDate(ym)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      const amount  = estimates.monthly_sgk_try ?? 0
      obligations.push({
        id:                    `sgk_${ym}`,
        tax_type:              'sgk',
        label:                 `SGK Primleri - ${monthLabel}`,
        filing_period:         ym,
        due_date:              dueDate,
        estimated_amount_try:  amount,
        status,
        days_until_due:        days,
        description:           `${monthLabel} dönemi SGK işveren ve işçi primleri`,
      })
    }

    // ── Bağ-Kur (optional) ────────────────────────────────────────────────────
    if (estimates.monthly_bag_kur_try !== undefined && estimates.monthly_bag_kur_try > 0) {
      const dueDate = computeSgkDueDate(ym)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      obligations.push({
        id:                    `bag_kur_${ym}`,
        tax_type:              'bag_kur',
        label:                 `Bağ-Kur Primi - ${monthLabel}`,
        filing_period:         ym,
        due_date:              dueDate,
        estimated_amount_try:  estimates.monthly_bag_kur_try,
        status,
        days_until_due:        days,
        description:           `${monthLabel} dönemi Bağ-Kur (4/B) sigorta primi`,
      })
    }

    // ── Geçici Vergi — Q1 (March), Q2 (June), Q3 (September), Q4 (December) ─
    if (m === 3 || m === 6 || m === 9 || m === 12) {
      const quarter = (m === 3 ? 1 : m === 6 ? 2 : m === 9 ? 3 : 4) as 1 | 2 | 3 | 4
      const dueDate = computeGeciciVergiDueDate(y, quarter)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      const amount  = estimates.quarterly_gecici_vergi_by_quarter?.[quarter] ?? 0
      obligations.push({
        id:                    `gecici_vergi_${y}-Q${quarter}`,
        tax_type:              'gecici_vergi',
        label:                 `Geçici Vergi Q${quarter} - ${y}`,
        filing_period:         `${y}-Q${quarter}`,
        due_date:              dueDate,
        estimated_amount_try:  amount,
        status,
        days_until_due:        days,
        description:           `${y} yılı ${quarter}. dönem geçici kurumlar vergisi (oran: %25)`,
      })
    }

    // ── Kurumlar Vergisi — only in December ────────────────────────────────────
    if (m === 12) {
      const dueDate = computeKurumlarVergiDueDate(y)
      const days    = computeDaysUntilDue(dueDate, todayStr)
      const status  = classifyObligationStatus(dueDate, todayStr, false)
      const amount  = estimates.annual_kurumlar_vergisi_try ?? 0
      obligations.push({
        id:                    `kurumlar_vergisi_${y}`,
        tax_type:              'kurumlar_vergisi',
        label:                 `Kurumlar Vergisi - ${y}`,
        filing_period:         String(y),
        due_date:              dueDate,
        estimated_amount_try:  amount,
        status,
        days_until_due:        days,
        description:           `${y} yılı kurumlar vergisi beyannamesi ve ödemesi (oran: %25)`,
      })
    }
  }

  // Sort by due_date ascending
  obligations.sort((a, b) => a.due_date.localeCompare(b.due_date))

  return obligations
}

/**
 * Filter obligations by status.
 */
export function filterObligationsByStatus(
  obligations: TaxObligation[],
  status: TaxObligation['status'],
): TaxObligation[] {
  return obligations.filter(o => o.status === status)
}

/**
 * Compute total upcoming tax liability in next N days.
 * Sums estimated_amount_try for all obligations due within N days from today.
 */
export function computeUpcomingTaxLiability(
  obligations: TaxObligation[],
  daysAhead: number,
  todayStr: string,
): number {
  return round2(
    obligations
      .filter(o => {
        const days = computeDaysUntilDue(o.due_date, todayStr)
        return days >= 0 && days <= daysAhead
      })
      .reduce((s, o) => s + o.estimated_amount_try, 0),
  )
}

/**
 * Get the next due obligation (soonest upcoming or due_soon).
 * Returns the obligation with the smallest non-negative days_until_due,
 * or null if none found.
 */
export function getNextDueObligation(
  obligations: TaxObligation[],
): TaxObligation | null {
  const active = obligations.filter(
    o => o.status === 'due_soon' || o.status === 'upcoming' || o.status === 'overdue',
  )
  if (active.length === 0) return null
  // Sort by days_until_due ascending (overdue items have negative days)
  const sorted = [...active].sort((a, b) => a.days_until_due - b.days_until_due)
  // Prefer the first with days_until_due >= 0 (soonest upcoming/due_soon)
  const soonest = sorted.find(o => o.days_until_due >= 0)
  // If all are overdue, return the least-overdue (closest to 0)
  return soonest ?? sorted[sorted.length - 1] ?? null
}

// ── Report interface ───────────────────────────────────────────────────────────

export interface TaxCalendarReport {
  obligations: TaxObligation[]
  overdue_count: number
  due_soon_count: number
  total_overdue_try: number
  total_due_soon_try: number
  next_obligation: TaxObligation | null
  upcoming_30d_try: number
  upcoming_90d_try: number
  /** 100 - (overdue_count × 20) - (due_soon_count × 5), clamp [0, 100] */
  compliance_score: number
}

// ── Service class ──────────────────────────────────────────────────────────────

export class TaxCalendarService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<TaxCalendarReport> {
    const today   = new Date().toISOString().slice(0, 10)
    const now     = new Date()
    const year    = now.getFullYear()
    const month   = now.getMonth() + 1
    const startYM = `${year}-${pad2(month)}`

    // ── Month date bounds ───────────────────────────────────────────────────
    const monthStart = `${year}-${pad2(month)}-01`
    const monthEnd   = `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`

    // ── Year date bounds ────────────────────────────────────────────────────
    const yearStart  = `${year}-01-01`
    const yearEnd    = `${year}-12-31`

    // ── Fetch data from Supabase ────────────────────────────────────────────
    const [salesRes, expensesRes, payrollRes, ytdSalesRes, ytdExpensesRes] = await Promise.all([
      // Current month sales → KDV estimate
      this.supabase
        .from('sales')
        .select('total_try, kdv_amount_try')
        .eq('company_id', companyId)
        .gte('created_at', monthStart + 'T00:00:00.000Z')
        .lte('created_at', monthEnd   + 'T23:59:59.999Z'),

      // Current month expenses → input KDV offset
      this.supabase
        .from('expenses')
        .select('amount_try, kdv')
        .eq('company_id', companyId)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd)
        .gt('kdv', 0),

      // Current month payroll (salary expenses) → SGK estimate
      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .eq('expense_type', 'salary')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd),

      // YTD sales → Geçici Vergi net income estimate
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .gte('created_at', yearStart + 'T00:00:00.000Z')
        .lte('created_at', yearEnd   + 'T23:59:59.999Z'),

      // YTD expenses → Geçici Vergi net income estimate
      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd),
    ])

    // ── Compute estimates ───────────────────────────────────────────────────

    const monthlySales = round2(
      ((salesRes.data ?? []) as { total_try: number; kdv_amount_try: number }[])
        .reduce((s, r) => s + Number(r.total_try ?? 0), 0),
    )

    const monthlyExpenses = round2(
      ((expensesRes.data ?? []) as { amount_try: number; kdv: number }[])
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0),
    )

    const monthlyGrossPayroll = round2(
      ((payrollRes.data ?? []) as { amount_try: number }[])
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0),
    )

    const ytdRevenue = round2(
      ((ytdSalesRes.data ?? []) as { total_try: number }[])
        .reduce((s, r) => s + Number(r.total_try ?? 0), 0),
    )

    const ytdExpenses = round2(
      ((ytdExpensesRes.data ?? []) as { amount_try: number }[])
        .reduce((s, r) => s + Number(r.amount_try ?? 0), 0),
    )

    const ytdNetIncome = round2(ytdRevenue - ytdExpenses)

    // KDV: output - input clamped at 0
    const monthly_kdv_try = estimateKdvPayable(monthlySales, monthlyExpenses)

    // SGK: employer 20.25% + employee 14%
    const monthly_sgk_try = estimateSgkMonthly(monthlyGrossPayroll)

    // Muhtasar: typically ~15-20% of payroll, use 20% as rough estimate
    const monthly_muhtasar_try = round2(monthlyGrossPayroll * 0.20)

    // Geçici Vergi: determine current quarter
    const quartersElapsed = month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4
    const geciciVergiEstimate = estimateGeciciVergi(ytdNetIncome, quartersElapsed)
    const geciciQ = quartersElapsed as 1 | 2 | 3 | 4

    // Annual Kurumlar Vergisi: 25% of YTD net income (rough estimate)
    const annual_kurumlar_vergisi_try = Math.max(0, round2(ytdNetIncome * 0.25))

    // ── Generate 12-month calendar ──────────────────────────────────────────
    const obligations = generateObligationCalendar(
      startYM,
      12,
      today,
      {
        monthly_kdv_try,
        monthly_muhtasar_try,
        monthly_sgk_try,
        quarterly_gecici_vergi_by_quarter: {
          1: geciciQ === 1 ? geciciVergiEstimate : 0,
          2: geciciQ === 2 ? geciciVergiEstimate : 0,
          3: geciciQ === 3 ? geciciVergiEstimate : 0,
          4: geciciQ === 4 ? geciciVergiEstimate : 0,
        },
        annual_kurumlar_vergisi_try,
      },
    )

    // ── Aggregate metrics ───────────────────────────────────────────────────
    const overdueObs  = filterObligationsByStatus(obligations, 'overdue')
    const dueSoonObs  = filterObligationsByStatus(obligations, 'due_soon')

    const overdue_count    = overdueObs.length
    const due_soon_count   = dueSoonObs.length
    const total_overdue_try  = round2(overdueObs.reduce((s, o) => s + o.estimated_amount_try, 0))
    const total_due_soon_try = round2(dueSoonObs.reduce((s, o) => s + o.estimated_amount_try, 0))

    const upcoming_30d_try = computeUpcomingTaxLiability(obligations, 30, today)
    const upcoming_90d_try = computeUpcomingTaxLiability(obligations, 90, today)

    const next_obligation = getNextDueObligation(obligations)

    // Compliance score: 100 - (overdue×20) - (due_soon×5), clamped [0, 100]
    const compliance_score = Math.max(0, Math.min(100,
      100 - (overdue_count * 20) - (due_soon_count * 5),
    ))

    return {
      obligations,
      overdue_count,
      due_soon_count,
      total_overdue_try,
      total_due_soon_try,
      next_obligation,
      upcoming_30d_try,
      upcoming_90d_try,
      compliance_score,
    }
  }
}
