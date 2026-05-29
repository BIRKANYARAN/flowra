// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/debt-maturity.service.ts
//
// Debt Maturity Ladder — Cash-flow planning tool for partner loan obligations.
//
// Maps all partner loan tranches across six time buckets, computes weighted
// average maturity, refinancing risk, maturity cliffs, and per-partner
// concentration metrics.
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export interface MaturityBucket {
  label: string
  bucket_key: 'overdue' | 'days_0_30' | 'days_31_90' | 'days_91_180' | 'days_181_365' | 'over_1_year'
  days_from: number
  days_to: number
  principal_try: number
  interest_try: number
  total_try: number
  tranche_count: number
}

export interface PartnerDebtSchedule {
  partner_id: string
  partner_name: string
  total_outstanding_try: number
  total_interest_try: number
  next_payment_date: string | null
  next_payment_amount: number
  tranches: Array<{
    tranche_id: string
    outstanding_try: number
    interest_rate_annual_pct: number
    expected_repayment_date: string | null
    days_to_maturity: number | null
    is_overdue: boolean
  }>
}

export interface MaturityCliff {
  date: string
  amount_try: number
  pct_of_total: number
  partner_names: string[]
}

export interface DebtMaturityReport {
  total_outstanding_try: number
  total_interest_projected_try: number
  weighted_avg_maturity_months: number | null
  refinancing_risk: ReturnType<typeof classifyRefinancingRisk>
  maturity_ladder: MaturityBucket[]
  partner_schedules: PartnerDebtSchedule[]
  maturity_cliffs: MaturityCliff[]
  debt_service_30d: number
  debt_service_90d: number
  debt_service_180d: number
  concentration_by_partner: Array<{
    partner_id: string
    partner_name: string
    outstanding_try: number
    pct_of_total: number
  }>
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute days between today and a target date.
 * Returns null if repaymentDateStr is null/empty.
 * Returns negative number when the date is in the past (overdue).
 */
export function computeDaysToMaturity(
  todayStr: string,
  repaymentDateStr: string | null,
): number | null {
  if (!repaymentDateStr) return null
  const [ty, tm, td] = todayStr.substring(0, 10).split('-').map(Number)
  const [ry, rm, rd] = repaymentDateStr.substring(0, 10).split('-').map(Number)
  const today = new Date(ty, tm - 1, td)
  const repay = new Date(ry, rm - 1, rd)
  const diffMs = repay.getTime() - today.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Classify a tranche into one of six maturity bucket keys.
 * null days_to_maturity = no due date → treated as over_1_year.
 */
export function classifyMaturityBucket(
  daysToMaturity: number | null,
): MaturityBucket['bucket_key'] {
  if (daysToMaturity === null) return 'over_1_year'
  if (daysToMaturity < 0) return 'overdue'
  if (daysToMaturity <= 30) return 'days_0_30'
  if (daysToMaturity <= 90) return 'days_31_90'
  if (daysToMaturity <= 180) return 'days_91_180'
  if (daysToMaturity <= 365) return 'days_181_365'
  return 'over_1_year'
}

/**
 * Compute daily interest rate from annual percentage.
 * e.g. 12% annual → 0.12 / 365
 */
export function computeDailyInterestRate(annualRatePct: number): number {
  return annualRatePct / 100 / 365
}

/**
 * Compute estimated interest accrued from now until maturity.
 * Returns 0 if daysToMaturity is null or negative (overdue/no due date).
 * Uses simple interest: principal × daily_rate × days.
 */
export function computeEstimatedInterestToMaturity(
  principalTry: number,
  annualRatePct: number,
  daysToMaturity: number | null,
): number {
  if (daysToMaturity === null || daysToMaturity <= 0) return 0
  const dailyRate = computeDailyInterestRate(annualRatePct)
  return round2(principalTry * dailyRate * daysToMaturity)
}

/** Bucket metadata (label, day ranges). */
const BUCKET_META: Array<{
  bucket_key: MaturityBucket['bucket_key']
  label: string
  days_from: number
  days_to: number
}> = [
  { bucket_key: 'overdue',       label: 'Vadesi geçmiş', days_from: -999999, days_to: -1      },
  { bucket_key: 'days_0_30',     label: '0-30 gün',      days_from: 0,       days_to: 30      },
  { bucket_key: 'days_31_90',    label: '31-90 gün',     days_from: 31,      days_to: 90      },
  { bucket_key: 'days_91_180',   label: '91-180 gün',    days_from: 91,      days_to: 180     },
  { bucket_key: 'days_181_365',  label: '181-365 gün',   days_from: 181,     days_to: 365     },
  { bucket_key: 'over_1_year',   label: '1 yıldan uzun', days_from: 366,     days_to: 999999  },
]

/**
 * Build the 6-bucket maturity ladder from a list of enriched tranches.
 * Each tranche must already have days_to_maturity computed.
 */
export function buildMaturityLadder(
  tranches: Array<{
    tranche_id: string
    outstanding_try: number
    interest_rate_annual_pct: number
    expected_repayment_date: string | null
    days_to_maturity: number | null
  }>,
): MaturityBucket[] {
  // Initialise accumulators
  const accum: Record<
    MaturityBucket['bucket_key'],
    { principal: number; interest: number; count: number }
  > = {
    overdue:      { principal: 0, interest: 0, count: 0 },
    days_0_30:    { principal: 0, interest: 0, count: 0 },
    days_31_90:   { principal: 0, interest: 0, count: 0 },
    days_91_180:  { principal: 0, interest: 0, count: 0 },
    days_181_365: { principal: 0, interest: 0, count: 0 },
    over_1_year:  { principal: 0, interest: 0, count: 0 },
  }

  for (const t of tranches) {
    const key = classifyMaturityBucket(t.days_to_maturity)
    const interest = computeEstimatedInterestToMaturity(
      t.outstanding_try,
      t.interest_rate_annual_pct,
      t.days_to_maturity,
    )
    accum[key].principal += t.outstanding_try
    accum[key].interest  += interest
    accum[key].count     += 1
  }

  return BUCKET_META.map(meta => {
    const a = accum[meta.bucket_key]
    const principal = round2(a.principal)
    const interest  = round2(a.interest)
    return {
      label:         meta.label,
      bucket_key:    meta.bucket_key,
      days_from:     meta.days_from,
      days_to:       meta.days_to,
      principal_try: principal,
      interest_try:  interest,
      total_try:     round2(principal + interest),
      tranche_count: a.count,
    }
  })
}

/**
 * Compute total debt service (principal + projected interest) for tranches
 * maturing within the next N days.
 * Overdue tranches (days_to_maturity < 0) are NOT included.
 * Tranches with null days are NOT included.
 */
export function computeDebtServiceNextDays(
  tranches: Array<{
    outstanding_try: number
    interest_rate_annual_pct: number
    days_to_maturity: number | null
  }>,
  days: number,
): number {
  let total = 0
  for (const t of tranches) {
    if (t.days_to_maturity === null) continue
    if (t.days_to_maturity < 0) continue
    if (t.days_to_maturity > days) continue
    const interest = computeEstimatedInterestToMaturity(
      t.outstanding_try,
      t.interest_rate_annual_pct,
      t.days_to_maturity,
    )
    total += t.outstanding_try + interest
  }
  return round2(total)
}

/**
 * Compute debt concentration by partner.
 * Returns Map<partner_id, pct_of_total> where pct is 0-100.
 * Returns empty map if total outstanding is 0.
 */
export function computeDebtConcentrationByPartner(
  partnerSchedules: PartnerDebtSchedule[],
): Map<string, number> {
  const result = new Map<string, number>()
  const total = partnerSchedules.reduce((s, p) => s + p.total_outstanding_try, 0)
  if (total <= 0) return result
  for (const p of partnerSchedules) {
    result.set(p.partner_id, round2((p.total_outstanding_try / total) * 100))
  }
  return result
}

/**
 * Classify refinancing risk based on how much debt matures within 90 days.
 * Returns 'no_debt' if total outstanding is 0.
 */
export function classifyRefinancingRisk(
  totalOutstanding: number,
  dueIn90Days: number,
): 'critical' | 'high' | 'moderate' | 'low' | 'no_debt' {
  if (totalOutstanding <= 0) return 'no_debt'
  const ratio = dueIn90Days / totalOutstanding
  if (ratio > 0.5) return 'critical'
  if (ratio > 0.3) return 'high'
  if (ratio > 0.15) return 'moderate'
  return 'low'
}

/**
 * Compute weighted average maturity (WAM) in months.
 * WAM = Σ(principal × days_to_maturity) / Σ(principal), for non-null, non-negative days.
 * Returns null if no tranches have a known future maturity.
 * Result is expressed in months (days / 30).
 */
export function computeWeightedAverageMaturity(
  tranches: Array<{ outstanding_try: number; days_to_maturity: number | null }>,
): number | null {
  let weightedSum = 0
  let totalPrincipal = 0

  for (const t of tranches) {
    if (t.days_to_maturity === null || t.days_to_maturity < 0) continue
    weightedSum    += t.outstanding_try * t.days_to_maturity
    totalPrincipal += t.outstanding_try
  }

  if (totalPrincipal <= 0) return null
  const wamDays = weightedSum / totalPrincipal
  return round2(wamDays / 30)
}

/**
 * Detect maturity cliff events: single dates where ≥ cliffThresholdPct (default 20%)
 * of total outstanding debt falls due.
 */
export function detectMaturityCliffs(
  tranches: Array<{
    outstanding_try: number
    expected_repayment_date: string | null
    partner_name: string
  }>,
  totalOutstanding: number,
  cliffThresholdPct: number = 0.2,
): MaturityCliff[] {
  if (totalOutstanding <= 0) return []

  // Group by date
  const byDate = new Map<
    string,
    { amount: number; partners: Set<string> }
  >()

  for (const t of tranches) {
    if (!t.expected_repayment_date) continue
    const date = t.expected_repayment_date.substring(0, 10)
    const entry = byDate.get(date) ?? { amount: 0, partners: new Set() }
    entry.amount += t.outstanding_try
    entry.partners.add(t.partner_name)
    byDate.set(date, entry)
  }

  const cliffs: MaturityCliff[] = []
  for (const [date, { amount, partners }] of byDate.entries()) {
    const pct = amount / totalOutstanding
    if (pct >= cliffThresholdPct) {
      cliffs.push({
        date,
        amount_try:    round2(amount),
        pct_of_total:  round2(pct * 100),
        partner_names: Array.from(partners).sort(),
      })
    }
  }

  // Sort by date ascending
  cliffs.sort((a, b) => a.date.localeCompare(b.date))
  return cliffs
}

// ── Service class ─────────────────────────────────────────────────────────────

export class DebtMaturityService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<DebtMaturityReport> {
    const today = new Date().toISOString().substring(0, 10)

    // Fetch active tranches
    const { data: trancheRows, error: trancheErr } = await this.supabase
      .from('partner_loan_tranches')
      .select('id, partner_id, principal_try, total_repaid_try, interest_rate_annual_pct, expected_repayment_date, status')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (trancheErr) {
      throw new Error(`Tranche verisi alınamadı: ${trancheErr.message}`)
    }

    // Fetch partner names
    const { data: partnerRows, error: partnerErr } = await this.supabase
      .from('partners')
      .select('id, name')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (partnerErr) {
      throw new Error(`Ortak verisi alınamadı: ${partnerErr.message}`)
    }

    const partnerNameMap = new Map<string, string>()
    for (const p of (partnerRows ?? [])) {
      const row = p as { id: string; name: string }
      partnerNameMap.set(row.id, row.name ?? 'Ortak')
    }

    // Build enriched tranche list
    interface EnrichedTranche {
      tranche_id: string
      partner_id: string
      partner_name: string
      outstanding_try: number
      interest_rate_annual_pct: number
      expected_repayment_date: string | null
      days_to_maturity: number | null
      is_overdue: boolean
    }

    const enriched: EnrichedTranche[] = []

    for (const row of (trancheRows ?? [])) {
      const r = row as Record<string, unknown>
      const principal  = Number(r.principal_try)   || 0
      const repaid     = Number(r.total_repaid_try) || 0
      const outstanding = round2(principal - repaid)
      if (outstanding <= 0) continue

      const rateRaw = r.interest_rate_annual_pct != null ? Number(r.interest_rate_annual_pct) : 0
      const annualRate = isNaN(rateRaw) ? 0 : rateRaw

      const dueDateRaw = r.expected_repayment_date as string | null
      const dueDate = dueDateRaw ? dueDateRaw.substring(0, 10) : null
      const dtm = computeDaysToMaturity(today, dueDate)

      enriched.push({
        tranche_id:              r.id as string,
        partner_id:              r.partner_id as string,
        partner_name:            partnerNameMap.get(r.partner_id as string) ?? 'Ortak',
        outstanding_try:         outstanding,
        interest_rate_annual_pct: annualRate,
        expected_repayment_date: dueDate,
        days_to_maturity:        dtm,
        is_overdue:              dtm !== null && dtm < 0,
      })
    }

    // ── Maturity ladder ───────────────────────────────────────────────────────

    const maturityLadder = buildMaturityLadder(enriched)

    // ── Aggregates ────────────────────────────────────────────────────────────

    const totalOutstanding = round2(
      enriched.reduce((s, t) => s + t.outstanding_try, 0),
    )

    const totalInterest = round2(
      enriched.reduce(
        (s, t) => s + computeEstimatedInterestToMaturity(t.outstanding_try, t.interest_rate_annual_pct, t.days_to_maturity),
        0,
      ),
    )

    const wam = computeWeightedAverageMaturity(
      enriched.map(t => ({ outstanding_try: t.outstanding_try, days_to_maturity: t.days_to_maturity })),
    )

    const dueIn90Days = computeDebtServiceNextDays(
      enriched.map(t => ({
        outstanding_try:          t.outstanding_try,
        interest_rate_annual_pct: t.interest_rate_annual_pct,
        days_to_maturity:         t.days_to_maturity,
      })),
      90,
    )
    // For risk classification use just principal component in 90d window
    const principalDueIn90 = enriched
      .filter(t => t.days_to_maturity !== null && t.days_to_maturity >= 0 && t.days_to_maturity <= 90)
      .reduce((s, t) => s + t.outstanding_try, 0)

    const refinancingRisk = classifyRefinancingRisk(totalOutstanding, principalDueIn90)

    // ── Debt service windows ──────────────────────────────────────────────────

    const debtService30d  = computeDebtServiceNextDays(
      enriched.map(t => ({ outstanding_try: t.outstanding_try, interest_rate_annual_pct: t.interest_rate_annual_pct, days_to_maturity: t.days_to_maturity })),
      30,
    )
    const debtService90d  = computeDebtServiceNextDays(
      enriched.map(t => ({ outstanding_try: t.outstanding_try, interest_rate_annual_pct: t.interest_rate_annual_pct, days_to_maturity: t.days_to_maturity })),
      90,
    )
    const debtService180d = computeDebtServiceNextDays(
      enriched.map(t => ({ outstanding_try: t.outstanding_try, interest_rate_annual_pct: t.interest_rate_annual_pct, days_to_maturity: t.days_to_maturity })),
      180,
    )

    // ── Partner schedules ─────────────────────────────────────────────────────

    const partnerMap = new Map<
      string,
      {
        partner_name: string
        tranches: EnrichedTranche[]
      }
    >()

    for (const t of enriched) {
      const entry = partnerMap.get(t.partner_id) ?? {
        partner_name: t.partner_name,
        tranches: [],
      }
      entry.tranches.push(t)
      partnerMap.set(t.partner_id, entry)
    }

    const partnerSchedules: PartnerDebtSchedule[] = []

    for (const [partnerId, { partner_name, tranches }] of partnerMap.entries()) {
      const totalPartnerOutstanding = round2(
        tranches.reduce((s, t) => s + t.outstanding_try, 0),
      )
      const totalPartnerInterest = round2(
        tranches.reduce(
          (s, t) => s + computeEstimatedInterestToMaturity(t.outstanding_try, t.interest_rate_annual_pct, t.days_to_maturity),
          0,
        ),
      )

      // Next payment: earliest future maturity
      const futureTranches = tranches
        .filter(t => t.expected_repayment_date !== null && t.days_to_maturity !== null && t.days_to_maturity >= 0)
        .sort((a, b) => (a.expected_repayment_date ?? '').localeCompare(b.expected_repayment_date ?? ''))

      const nextTranche = futureTranches[0] ?? null
      const nextPaymentDate = nextTranche?.expected_repayment_date ?? null
      const nextPaymentAmount = nextTranche
        ? round2(
            nextTranche.outstanding_try +
            computeEstimatedInterestToMaturity(nextTranche.outstanding_try, nextTranche.interest_rate_annual_pct, nextTranche.days_to_maturity),
          )
        : 0

      partnerSchedules.push({
        partner_id:            partnerId,
        partner_name,
        total_outstanding_try: totalPartnerOutstanding,
        total_interest_try:    totalPartnerInterest,
        next_payment_date:     nextPaymentDate,
        next_payment_amount:   nextPaymentAmount,
        tranches: tranches.map(t => ({
          tranche_id:               t.tranche_id,
          outstanding_try:          t.outstanding_try,
          interest_rate_annual_pct: t.interest_rate_annual_pct,
          expected_repayment_date:  t.expected_repayment_date,
          days_to_maturity:         t.days_to_maturity,
          is_overdue:               t.is_overdue,
        })),
      })
    }

    // Sort partner schedules by total outstanding descending
    partnerSchedules.sort((a, b) => b.total_outstanding_try - a.total_outstanding_try)

    // ── Concentration ─────────────────────────────────────────────────────────

    const concentrationMap = computeDebtConcentrationByPartner(partnerSchedules)
    const concentrationByPartner = partnerSchedules.map(p => ({
      partner_id:      p.partner_id,
      partner_name:    p.partner_name,
      outstanding_try: p.total_outstanding_try,
      pct_of_total:    concentrationMap.get(p.partner_id) ?? 0,
    }))

    // ── Maturity cliffs ───────────────────────────────────────────────────────

    const maturityCliffs = detectMaturityCliffs(
      enriched.map(t => ({
        outstanding_try:         t.outstanding_try,
        expected_repayment_date: t.expected_repayment_date,
        partner_name:            t.partner_name,
      })),
      totalOutstanding,
    )

    return {
      total_outstanding_try:        totalOutstanding,
      total_interest_projected_try: totalInterest,
      weighted_avg_maturity_months: wam,
      refinancing_risk:             refinancingRisk,
      maturity_ladder:              maturityLadder,
      partner_schedules:            partnerSchedules,
      maturity_cliffs:              maturityCliffs,
      debt_service_30d:             debtService30d,
      debt_service_90d:             debtService90d,
      debt_service_180d:            debtService180d,
      concentration_by_partner:     concentrationByPartner,
    }
  }
}
