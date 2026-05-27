// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/debt-maturity.service.ts
//
// Debt Maturity Timeline — Treasury Management Tool
//
// Computes when partner loan tranches mature over the next 36 months,
// concentration risk metrics, and a refinancing pressure score.
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export type MaturityBucket =
  | 'overdue'    // past due (days < 0)
  | 'immediate'  // ≤ 30 days
  | 'short'      // 31–90 days
  | 'medium'     // 91–365 days
  | 'long'       // 1–3 years (366–1095 days)
  | 'extended'   // > 3 years, or no due date

export interface TrancheMaturity {
  tranche_id: string
  partner_id: string
  partner_name: string
  principal_try: number
  repaid_try: number
  outstanding_try: number       // principal - repaid
  due_date: string | null
  days_until_due: number | null
  bucket: MaturityBucket
  interest_rate: number | null
}

export interface MaturityMonthBucket {
  month: string           // 'YYYY-MM'
  label: string           // 'Haz 2026'
  maturing_try: number
  tranche_count: number
  partner_ids: string[]
}

export interface DebtMaturityReport {
  company_id: string
  as_of_date: string
  tranches: TrancheMaturity[]
  // Maturity schedule (next 36 months)
  schedule: MaturityMonthBucket[]
  // Bucket totals
  overdue_try: number
  immediate_try: number    // ≤ 30d
  short_term_try: number   // 31–90d
  medium_term_try: number  // 91–365d
  long_term_try: number    // 1–3yr
  extended_try: number     // > 3yr
  undated_try: number      // no due_date set
  total_outstanding: number
  // Risk metrics
  next_12m_pct: number            // (overdue + immediate + short + medium) / total × 100
  refinancing_score: number       // 0–100
  concentration_month?: string    // month with > 30% of total maturities
  concentration_partner?: string  // partner with > 50% of maturing in next 12m
  computed_at: string
}

// ── Turkish month names ───────────────────────────────────────────────────────

const TR_MONTHS_SHORT = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

function isoMonthToLabel(monthIso: string): string {
  const [year, month] = monthIso.split('-')
  return `${TR_MONTHS_SHORT[parseInt(month, 10) - 1]} ${year}`
}

/** Add n months to a 'YYYY-MM' string → 'YYYY-MM' */
function addMonthsToIso(monthIso: string, n: number): string {
  const [y, m] = monthIso.split('-').map(Number)
  const date = new Date(y, m - 1 + n, 1)
  const yr = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  return `${yr}-${mo}`
}

/** Extract 'YYYY-MM' from a date string or ISO timestamp */
function dateToMonthIso(dateStr: string): string {
  return dateStr.substring(0, 7)
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Assign a maturity bucket based on days until due.
 * null days → 'extended' (undated = not imminent)
 */
export function assignMaturityBucket(daysUntilDue: number | null): MaturityBucket {
  if (daysUntilDue === null) return 'extended'
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 30) return 'immediate'
  if (daysUntilDue <= 90) return 'short'
  if (daysUntilDue <= 365) return 'medium'
  if (daysUntilDue <= 1095) return 'long'
  return 'extended'
}

/**
 * Compute days from today to a due date.
 * Returns null if dueDate is null/empty.
 * Returns negative number if overdue.
 */
export function computeDaysUntilDue(
  dueDate: string | null,
  today: string,
): number | null {
  if (!dueDate) return null
  // Parse as local dates (YYYY-MM-DD) to avoid timezone shifts
  const [dy, dm, dd] = dueDate.substring(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.substring(0, 10).split('-').map(Number)
  const due = new Date(dy, dm - 1, dd)
  const now = new Date(ty, tm - 1, td)
  const diffMs = due.getTime() - now.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Compute the refinancing pressure score (0–100).
 * 100 = no near-term maturities, 0 = all debt due immediately.
 *
 * Bucket weights:
 *   ≤ 30d  → 0
 *   31–90d → 10
 *   91–180d → 30
 *   181–365d → 60
 *   > 365d (or null) → 100
 */
export function computeRefinancingScore(
  tranches: Array<{ outstanding_try: number; days: number | null }>,
): number {
  const active = tranches.filter(t => t.outstanding_try > 0)
  if (active.length === 0) return 100

  const total = active.reduce((s, t) => s + t.outstanding_try, 0)
  if (total <= 0) return 100

  function bucketWeight(days: number | null): number {
    if (days === null || days > 365) return 100
    if (days > 180) return 60
    if (days > 90) return 30
    if (days > 30) return 10
    return 0  // ≤ 30d or overdue
  }

  const weightedSum = active.reduce(
    (s, t) => s + bucketWeight(t.days) * t.outstanding_try,
    0,
  )

  return round2(weightedSum / total)
}

/**
 * Compute % of total outstanding maturing within 12 months
 * (overdue + immediate + short + medium).
 */
export function computeNext12mPct(
  overdue: number,
  immediate: number,
  short: number,
  medium: number,
  total: number,
): number {
  if (total <= 0) return 0
  return round2(((overdue + immediate + short + medium) / total) * 100)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class DebtMaturityService {
  /**
   * Compute the full debt maturity report for a company.
   * Fetches all non-repaid tranches and analyses their maturity profile.
   */
  static async compute(
    companyId: string,
    supabase: SupabaseClient,
    today?: string,
  ): Promise<DebtMaturityReport> {
    const asOfDate = today ?? new Date().toISOString().substring(0, 10)

    // Fetch tranches: use principal_try and total_repaid_try as canonical columns.
    // Also attempt outstanding_try (may exist as a maintained column) for fallback.
    const { data: rows, error } = await supabase
      .from('partner_loan_tranches')
      .select(`
        id,
        partner_id,
        principal_try,
        total_repaid_try,
        expected_repayment_date,
        interest_rate_annual_pct,
        annual_interest_rate,
        status,
        partners(name)
      `)
      .eq('company_id', companyId)
      .in('status', ['active', 'partially_repaid', 'overdue'])
      .is('deleted_at', null)

    if (error) {
      throw new Error(`Tranche verisi alınamadı: ${error.message}`)
    }

    // Also try to read outstanding_try if it exists in the DB
    let outstandingMap: Record<string, number> = {}
    try {
      const { data: outRows } = await supabase
        .from('partner_loan_tranches')
        .select('id, outstanding_try')
        .eq('company_id', companyId)
        .in('status', ['active', 'partially_repaid', 'overdue'])
        .is('deleted_at', null)
      if (Array.isArray(outRows)) {
        for (const r of outRows) {
          const rec = r as Record<string, unknown>
          if (rec.outstanding_try != null) {
            outstandingMap[rec.id as string] = Number(rec.outstanding_try)
          }
        }
      }
    } catch {
      // optional column — silently ignore
    }

    const tranches: TrancheMaturity[] = []

    for (const row of (rows ?? [])) {
      const r = row as Record<string, unknown>
      const trancheId = r.id as string
      const partnersJoin = r.partners as { name?: string } | null
      const partnerName = partnersJoin?.name ?? 'Ortak'
      const partnerId = r.partner_id as string

      const principal = Number(r.principal_try) || 0
      const repaid = Number(r.total_repaid_try) || 0
      // Prefer DB-maintained outstanding_try if available; otherwise compute
      const outstanding =
        outstandingMap[trancheId] != null
          ? outstandingMap[trancheId]
          : round2(principal - repaid)

      if (outstanding <= 0) continue

      // Due date: expected_repayment_date is the canonical column
      const dueDateRaw = r.expected_repayment_date as string | null
      const dueDate = dueDateRaw ? dueDateRaw.substring(0, 10) : null

      const daysUntilDue = computeDaysUntilDue(dueDate, asOfDate)
      const bucket = assignMaturityBucket(daysUntilDue)

      // Interest rate: prefer interest_rate_annual_pct; fall back to annual_interest_rate
      const rateRaw =
        r.interest_rate_annual_pct != null
          ? Number(r.interest_rate_annual_pct) / 100
          : r.annual_interest_rate != null
          ? Number(r.annual_interest_rate)
          : null
      const interestRate = rateRaw != null && !isNaN(rateRaw) ? rateRaw : null

      tranches.push({
        tranche_id: trancheId,
        partner_id: partnerId,
        partner_name: partnerName,
        principal_try: principal,
        repaid_try: repaid,
        outstanding_try: outstanding,
        due_date: dueDate,
        days_until_due: daysUntilDue,
        bucket,
        interest_rate: interestRate,
      })
    }

    // ── Bucket totals ─────────────────────────────────────────────────────────

    let overdueTry = 0
    let immediateTry = 0
    let shortTermTry = 0
    let mediumTermTry = 0
    let longTermTry = 0
    let extendedTry = 0
    let undatedTry = 0

    for (const t of tranches) {
      switch (t.bucket) {
        case 'overdue':   overdueTry   += t.outstanding_try; break
        case 'immediate': immediateTry += t.outstanding_try; break
        case 'short':     shortTermTry += t.outstanding_try; break
        case 'medium':    mediumTermTry += t.outstanding_try; break
        case 'long':      longTermTry  += t.outstanding_try; break
        case 'extended':
          if (t.due_date === null) {
            undatedTry  += t.outstanding_try
          } else {
            extendedTry += t.outstanding_try
          }
          break
      }
    }

    const totalOutstanding = round2(
      tranches.reduce((s, t) => s + t.outstanding_try, 0),
    )

    // ── Risk metrics ──────────────────────────────────────────────────────────

    const refinancingScore = computeRefinancingScore(
      tranches.map(t => ({ outstanding_try: t.outstanding_try, days: t.days_until_due })),
    )

    const next12mPct = computeNext12mPct(
      overdueTry,
      immediateTry,
      shortTermTry,
      mediumTermTry,
      totalOutstanding,
    )

    // Concentration month: any single month > 30% of total maturities
    const currentMonth = asOfDate.substring(0, 7)
    const scheduleMap = new Map<string, { maturing_try: number; tranche_count: number; partner_ids: string[] }>()

    // Pre-populate 36 months
    for (let i = 0; i < 36; i++) {
      const m = addMonthsToIso(currentMonth, i)
      scheduleMap.set(m, { maturing_try: 0, tranche_count: 0, partner_ids: [] })
    }

    // Fill in tranches that mature in the next 36 months
    const cutoff36m = addMonthsToIso(currentMonth, 36)
    for (const t of tranches) {
      if (!t.due_date) continue
      const m = dateToMonthIso(t.due_date)
      if (m >= currentMonth && m < cutoff36m) {
        const entry = scheduleMap.get(m) ?? { maturing_try: 0, tranche_count: 0, partner_ids: [] }
        entry.maturing_try += t.outstanding_try
        entry.tranche_count += 1
        if (!entry.partner_ids.includes(t.partner_id)) {
          entry.partner_ids.push(t.partner_id)
        }
        scheduleMap.set(m, entry)
      }
    }

    // Build schedule array (only non-empty months)
    const schedule: MaturityMonthBucket[] = []
    for (const [month, entry] of scheduleMap.entries()) {
      schedule.push({
        month,
        label: isoMonthToLabel(month),
        maturing_try: round2(entry.maturing_try),
        tranche_count: entry.tranche_count,
        partner_ids: entry.partner_ids,
      })
    }
    schedule.sort((a, b) => a.month.localeCompare(b.month))

    // Find concentration month (any month > 30% of total outstanding)
    let concentrationMonth: string | undefined
    if (totalOutstanding > 0) {
      for (const s of schedule) {
        if (s.maturing_try / totalOutstanding > 0.3) {
          concentrationMonth = s.month
          break
        }
      }
    }

    // Find concentration partner in next 12m (partner with > 50% of 12m maturities)
    const cutoff12m = addMonthsToIso(currentMonth, 12)
    const partnerNext12m = new Map<string, { amount: number; name: string }>()
    for (const t of tranches) {
      if (!t.due_date) continue
      const m = dateToMonthIso(t.due_date)
      if (m >= currentMonth && m < cutoff12m) {
        const existing = partnerNext12m.get(t.partner_id) ?? { amount: 0, name: t.partner_name }
        existing.amount += t.outstanding_try
        partnerNext12m.set(t.partner_id, existing)
      }
    }
    // Also include overdue tranches in 12m concentration check
    for (const t of tranches) {
      if (t.bucket === 'overdue') {
        const existing = partnerNext12m.get(t.partner_id) ?? { amount: 0, name: t.partner_name }
        existing.amount += t.outstanding_try
        partnerNext12m.set(t.partner_id, existing)
      }
    }

    const total12m = overdueTry + immediateTry + shortTermTry + mediumTermTry
    let concentrationPartner: string | undefined
    if (total12m > 0) {
      for (const [, { amount, name }] of partnerNext12m.entries()) {
        if (amount / total12m > 0.5) {
          concentrationPartner = name
          break
        }
      }
    }

    return {
      company_id: companyId,
      as_of_date: asOfDate,
      tranches,
      schedule,
      overdue_try: round2(overdueTry),
      immediate_try: round2(immediateTry),
      short_term_try: round2(shortTermTry),
      medium_term_try: round2(mediumTermTry),
      long_term_try: round2(longTermTry),
      extended_try: round2(extendedTry),
      undated_try: round2(undatedTry),
      total_outstanding: totalOutstanding,
      next_12m_pct: next12mPct,
      refinancing_score: refinancingScore,
      concentration_month: concentrationMonth,
      concentration_partner: concentrationPartner,
      computed_at: new Date().toISOString(),
    }
  }
}
