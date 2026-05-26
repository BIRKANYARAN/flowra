// ─────────────────────────────────────────────────────────────────────────────
// lib/services/tax/tax-calendar.service.ts
//
// Turkish Tax Compliance Calendar.
//
// Computes due dates for all Turkish tax obligations across a rolling horizon
// and estimates amounts from live Flowra data where possible.
//
// Obligations tracked:
//   KDV Beyannamesi     — 26th of the following month (monthly)
//   Muhtasar Beyanname  — 26th of the following month (monthly)
//   Geçici Vergi Q1     — May 17
//   Geçici Vergi Q2     — Aug 17
//   Geçici Vergi Q3     — Nov 17
//   Kurumlar Vergisi    — April 30 of following year (annual)
//   SGK Primler         — last business day of month (simplified: 28th)
//
// Weekend adjustment: Saturday → Monday, Sunday → Monday.
// Priority: overdue or ≤7 days → critical, ≤14 days → warning, else → info.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { TaxService } from '@/lib/services/tax.service'
import { periodForMonth } from '@/lib/services/finance-rules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export type TaxObligationType =
  | 'kdv_declaration'
  | 'muhtasar_declaration'
  | 'gecici_vergi_q1'
  | 'gecici_vergi_q2'
  | 'gecici_vergi_q3'
  | 'kurumlar_vergisi'
  | 'sgk_primler'

export interface TaxObligation {
  /** Stable ID: type + YYYY-MM of the filing period */
  id: string
  obligation_type: TaxObligationType
  /** Turkish display name */
  label: string
  /** YYYY-MM-DD — adjusted for weekends */
  due_date: string
  /** e.g. "Nisan 2026" */
  filing_period: string
  /** null if not computable yet */
  estimated_amount_try: number | null
  status: 'overdue' | 'due_soon' | 'upcoming' | 'filed'
  /** negative = overdue */
  days_remaining: number
  priority: 'critical' | 'warning' | 'info'
  notes: string | null
}

export interface TaxCalendar {
  /** Next `horizon` months, sorted by due_date */
  obligations: TaxObligation[]
  overdue_count: number
  /** ≤14 days */
  due_soon_count: number
  /** Sum of known amounts */
  total_estimated_tax_try: number
  computed_at: string
}

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

function trMonth(month1: number): string {
  return TR_MONTHS[(month1 - 1)] ?? ''
}

function filingPeriodLabel(year: number, month: number): string {
  return `${trMonth(month)} ${year}`
}

// ── Weekend adjustment ────────────────────────────────────────────────────────

/**
 * If the date falls on Saturday (6) or Sunday (0), advance to Monday.
 * Input/output: YYYY-MM-DD.
 *
 * Uses UTC parsing and UTC formatting to avoid timezone shift issues.
 */
export function adjustForWeekend(dateStr: string): string {
  // Parse as UTC to avoid local timezone offsets affecting getDay()
  const [y, m, d] = dateStr.split('-').map(Number)
  // getDay() from a UTC date at noon to avoid any DST edge cases
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const dow = utcDate.getUTCDay() // 0=Sun, 6=Sat
  if (dow === 6) {
    utcDate.setUTCDate(utcDate.getUTCDate() + 2) // Sat → Mon
  } else if (dow === 0) {
    utcDate.setUTCDate(utcDate.getUTCDate() + 1) // Sun → Mon
  }
  const oy = utcDate.getUTCFullYear()
  const om = utcDate.getUTCMonth() + 1
  const od = utcDate.getUTCDate()
  return `${oy}-${String(om).padStart(2, '0')}-${String(od).padStart(2, '0')}`
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function dateDiff(from: string, to: string): number {
  // Parse as UTC dates to avoid timezone offset issues
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const a = Date.UTC(fy, fm - 1, fd)
  const b = Date.UTC(ty, tm - 1, td)
  return Math.round((b - a) / 86_400_000)
}

function toYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Add `months` months to a YYYY-MM string, returning YYYY-MM */
function addMonthsYM(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

/** Last day of a given YYYY-MM */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate() // month is 1-based → Date(y, m, 0) gives last day
}

// ── Priority + status helpers ─────────────────────────────────────────────────

function computeStatus(
  daysRemaining: number,
): 'overdue' | 'due_soon' | 'upcoming' | 'filed' {
  if (daysRemaining < 0)   return 'overdue'
  if (daysRemaining <= 14) return 'due_soon'
  return 'upcoming'
}

function computePriority(
  status: 'overdue' | 'due_soon' | 'upcoming' | 'filed',
  daysRemaining: number,
): 'critical' | 'warning' | 'info' {
  if (status === 'overdue' || daysRemaining <= 7) return 'critical'
  if (daysRemaining <= 14) return 'warning'
  return 'info'
}

// ── PURE: compute due dates for a given filing period YYYY-MM ─────────────────

/**
 * Pure: compute all TaxObligation stubs (no amounts) for a filing period YYYY-MM
 * relative to `today`.  Returns array of 0-N obligations for that period.
 */
export function computeDueDatesForPeriod(periodYM: string, today: string): TaxObligation[] {
  const [py, pm] = periodYM.split('-').map(Number)
  const obligations: TaxObligation[] = []

  // ── KDV Beyannamesi — 26th of the following month ─────────────────────────
  {
    const dueMonthTotal = py * 12 + pm // following month (1-based)
    const dueYear  = Math.floor(dueMonthTotal / 12)
    const dueMonth = (dueMonthTotal % 12) + 1 // +1 because month is 0-indexed result
    // Actually: next month after py/pm
    const nextYear  = pm === 12 ? py + 1 : py
    const nextMonth = pm === 12 ? 1 : pm + 1
    const rawDue = toYMD(nextYear, nextMonth, 26)
    void dueYear; void dueMonth // suppress lint
    const dueDate = adjustForWeekend(rawDue)
    const daysRemaining = dateDiff(today, dueDate)
    const status  = computeStatus(daysRemaining)
    obligations.push({
      id:                   `kdv_declaration_${periodYM}`,
      obligation_type:      'kdv_declaration',
      label:                'KDV Beyannamesi',
      due_date:             dueDate,
      filing_period:        filingPeriodLabel(py, pm),
      estimated_amount_try: null,
      status,
      days_remaining:       daysRemaining,
      priority:             computePriority(status, daysRemaining),
      notes:                null,
    })
  }

  // ── Muhtasar Beyanname — 26th of the following month ─────────────────────
  {
    const nextYear  = pm === 12 ? py + 1 : py
    const nextMonth = pm === 12 ? 1 : pm + 1
    const rawDue  = toYMD(nextYear, nextMonth, 26)
    const dueDate = adjustForWeekend(rawDue)
    const daysRemaining = dateDiff(today, dueDate)
    const status  = computeStatus(daysRemaining)
    obligations.push({
      id:                   `muhtasar_declaration_${periodYM}`,
      obligation_type:      'muhtasar_declaration',
      label:                'Muhtasar Beyanname',
      due_date:             dueDate,
      filing_period:        filingPeriodLabel(py, pm),
      estimated_amount_try: null,
      status,
      days_remaining:       daysRemaining,
      priority:             computePriority(status, daysRemaining),
      notes:                null,
    })
  }

  // ── SGK Primler — last business day (simplified: 28th) ───────────────────
  {
    const rawDue  = toYMD(py, pm, Math.min(28, lastDayOfMonth(py, pm)))
    const dueDate = adjustForWeekend(rawDue)
    const daysRemaining = dateDiff(today, dueDate)
    const status  = computeStatus(daysRemaining)
    obligations.push({
      id:                   `sgk_primler_${periodYM}`,
      obligation_type:      'sgk_primler',
      label:                'SGK Primleri',
      due_date:             dueDate,
      filing_period:        filingPeriodLabel(py, pm),
      estimated_amount_try: null,
      status,
      days_remaining:       daysRemaining,
      priority:             computePriority(status, daysRemaining),
      notes:                'Son iş günü (basitleştirilmiş: 28.)',
    })
  }

  // ── Geçici Vergi — only if this period is March, June, or Sept ───────────
  // Q1: filed in May (period = March)   → due May 17
  // Q2: filed in Aug (period = June)    → due Aug 17
  // Q3: filed in Nov (period = Sept)    → due Nov 17
  if (pm === 3 || pm === 6 || pm === 9) {
    const qNum  = pm === 3 ? 1 : pm === 6 ? 2 : 3
    const dueMo = pm === 3 ? 5 : pm === 6 ? 8 : 11
    const rawDue  = toYMD(py, dueMo, 17)
    const dueDate = adjustForWeekend(rawDue)
    const daysRemaining = dateDiff(today, dueDate)
    const status  = computeStatus(daysRemaining)
    const oblType: TaxObligationType = `gecici_vergi_q${qNum}` as TaxObligationType
    obligations.push({
      id:                   `${oblType}_${py}`,
      obligation_type:      oblType,
      label:                `Geçici Vergi Q${qNum}`,
      due_date:             dueDate,
      filing_period:        `${py} Q${qNum}`,
      estimated_amount_try: null,
      status,
      days_remaining:       daysRemaining,
      priority:             computePriority(status, daysRemaining),
      notes:                'Geçici vergi oranı %25',
    })
  }

  // ── Kurumlar Vergisi — April 30 of the year AFTER December ───────────────
  if (pm === 12) {
    const rawDue  = toYMD(py + 1, 4, 30)
    const dueDate = adjustForWeekend(rawDue)
    const daysRemaining = dateDiff(today, dueDate)
    const status  = computeStatus(daysRemaining)
    obligations.push({
      id:                   `kurumlar_vergisi_${py}`,
      obligation_type:      'kurumlar_vergisi',
      label:                'Kurumlar Vergisi',
      due_date:             dueDate,
      filing_period:        `${py} yılı`,
      estimated_amount_try: null,
      status,
      days_remaining:       daysRemaining,
      priority:             computePriority(status, daysRemaining),
      notes:                'Kurumlar vergisi oranı %25',
    })
  }

  return obligations
}

// ── PUBLIC: static computeDueDates ───────────────────────────────────────────

/**
 * Pure: compute all TaxObligation stubs for `referenceMonth` (YYYY-MM).
 * Used by tests and the API for quick pure computation.
 */
export function computeDueDates(referenceMonth: string, today: string): TaxObligation[] {
  return computeDueDatesForPeriod(referenceMonth, today)
}

// ── TaxCalendarService ────────────────────────────────────────────────────────

export class TaxCalendarService {
  /**
   * Compute the full tax calendar for the next `horizon` months (default 12).
   * Fetches amounts from TaxService where possible.
   */
  static async getCalendar(
    companyId: string,
    uid: string,
    supabase: AnyClient,
    opts?: { today?: string; horizon?: number },
  ): Promise<TaxCalendar> {
    const today   = opts?.today   ?? new Date().toISOString().slice(0, 10)
    const horizon = opts?.horizon ?? 12

    // Collect obligations for each month in the horizon.
    // We start from the previous month so we catch overdue monthly filings.
    const currentYM = today.slice(0, 7) // YYYY-MM

    // Gather all period months from (currentYM - 1) through (currentYM + horizon)
    const startYM = addMonthsYM(currentYM, -1)
    const endYM   = addMonthsYM(currentYM, horizon)

    const allObligations: TaxObligation[] = []
    let ym = startYM
    while (ym <= endYM) {
      const obs = computeDueDatesForPeriod(ym, today)
      for (const ob of obs) {
        allObligations.push(ob)
      }
      ym = addMonthsYM(ym, 1)
    }

    // De-duplicate by id (Geçici vergi and KV can appear once per year)
    const seen = new Set<string>()
    const deduped: TaxObligation[] = []
    for (const ob of allObligations) {
      if (!seen.has(ob.id)) {
        seen.add(ob.id)
        deduped.push(ob)
      }
    }

    // Filter to only those within the horizon window (due_date <= endYM last day)
    const endYMDate = endYM + '-31' // generous upper bound
    const filtered = deduped.filter(ob => ob.due_date <= endYMDate)

    // Sort by due_date ascending
    filtered.sort((a, b) => a.due_date.localeCompare(b.due_date))

    // ── Amount estimation ────────────────────────────────────────────────────

    // KDV: try to compute for periods that have already passed/current
    // We'll do a batch for the current month and past months in horizon
    const withAmounts = await Promise.all(
      filtered.map(ob => TaxCalendarService._estimateAmount(ob, companyId, uid, supabase, today))
    )

    const overdue_count    = withAmounts.filter(o => o.status === 'overdue').length
    const due_soon_count   = withAmounts.filter(o => o.status === 'due_soon').length
    const total_estimated  = withAmounts.reduce(
      (s, o) => s + (o.estimated_amount_try ?? 0), 0
    )

    return {
      obligations:             withAmounts,
      overdue_count,
      due_soon_count,
      total_estimated_tax_try: Math.round(total_estimated * 100) / 100,
      computed_at:             new Date().toISOString(),
    }
  }

  /** Internal: attempt amount estimation for a single obligation */
  private static async _estimateAmount(
    ob: TaxObligation,
    companyId: string,
    uid: string,
    supabase: AnyClient,
    today: string,
  ): Promise<TaxObligation> {
    try {
      // Only compute for obligations whose period is in the past or current
      const currentYM = today.slice(0, 7)

      if (ob.obligation_type === 'kdv_declaration') {
        // The filing period month is embedded in the id: kdv_declaration_YYYY-MM
        const periodYM = ob.id.replace('kdv_declaration_', '')
        if (periodYM <= currentYM) {
          const period = periodForMonth(periodYM)
          const kdv = await TaxService.getKdvNet(uid, companyId, period, undefined, supabase)
          const amount = Math.max(0, kdv.net_vat_try)
          return { ...ob, estimated_amount_try: amount }
        }
      }

      if (
        ob.obligation_type === 'gecici_vergi_q1' ||
        ob.obligation_type === 'gecici_vergi_q2' ||
        ob.obligation_type === 'gecici_vergi_q3'
      ) {
        // Estimate as 25% of YTD net income up to end of the relevant quarter
        const year = parseInt(ob.id.split('_').pop() ?? '0', 10)
        const q    = ob.obligation_type === 'gecici_vergi_q1' ? 1
                   : ob.obligation_type === 'gecici_vergi_q2' ? 2 : 3
        const periodEndMonth = q * 3
        const periodEnd = toYMD(year, periodEndMonth, lastDayOfMonth(year, periodEndMonth))
        if (periodEnd <= today) {
          const ytdPeriod = { from: `${year}-01-01`, to: periodEnd }
          const corpTax = await TaxService.getCorporateTax(uid, companyId, ytdPeriod, undefined, undefined, supabase)
          const amount = Math.max(0, Math.round(corpTax.matrah_try * 0.25 * 100) / 100)
          return { ...ob, estimated_amount_try: amount }
        }
      }

      if (ob.obligation_type === 'kurumlar_vergisi') {
        const year = parseInt(ob.filing_period.split(' ')[0] ?? '0', 10)
        const annualEnd = `${year}-12-31`
        if (annualEnd <= today) {
          const annualPeriod = { from: `${year}-01-01`, to: annualEnd }
          const corpTax = await TaxService.getCorporateTax(uid, companyId, annualPeriod, undefined, undefined, supabase)
          const amount = Math.max(0, corpTax.tax_try)
          return { ...ob, estimated_amount_try: amount }
        }
      }
    } catch {
      // Non-fatal: if estimation fails, return obligation with null amount
    }
    return ob
  }
}

// Re-export for convenience
export { toYMD }
