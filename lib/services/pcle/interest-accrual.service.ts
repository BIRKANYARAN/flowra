// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/interest-accrual.service.ts
//
// Loan Interest Accrual Report — Daily interest calculation engine.
//
// Each partner loan tranche accrues interest daily based on outstanding
// principal and the annual interest rate. This service computes accrual
// figures and checks VUK compliance risk (örtülü kazanç).
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Public types ──────────────────────────────────────────────────────────────

export interface TranchAccrual {
  tranche_id: string
  partner_id: string
  partner_name: string
  principal_try: number
  total_repaid_try: number
  outstanding_principal: number   // principal - repaid
  disbursement_date: string
  interest_rate_annual_pct: number
  // Accrual
  daily_interest_try: number
  monthly_accrual_try: number
  ytd_accrual_try: number
  total_accrued_try: number       // since disbursement
  total_paid_try: number          // from journal entries (780)
  outstanding_interest_try: number
  days_outstanding: number        // days since disbursement
  // Compliance
  is_zero_rate: boolean
  is_below_market: boolean
  vuk_risk: boolean               // zero-rate + principal > 50K + duration > 12 months
  // Status
  is_active: boolean
  expected_end_date: string | null
}

export interface InterestAccrualReport {
  company_id: string
  as_of_date: string
  market_rate_pct: number   // reference rate used (default 50%)
  tranches: TranchAccrual[]
  // Portfolio
  total_outstanding_principal: number
  total_accrued_ytd: number
  total_outstanding_interest: number
  weighted_avg_rate: number | null
  zero_rate_count: number
  vuk_risk_count: number
  // Monthly interest obligation (next month)
  next_month_interest_try: number
  computed_at: string
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Returns the number of days in a given month, handling leap years correctly.
 */
export function daysInMonth(year: number, month: number): number {
  // Using day 0 of the next month gives us the last day of the current month
  return new Date(year, month, 0).getDate()
}

/**
 * Returns true if the given year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Compute daily interest accrual.
 * Formula: principal × (annualRatePct / 100) / 365
 */
export function computeDailyInterest(
  principal: number,
  annualRatePct: number,
): number {
  if (principal <= 0 || annualRatePct <= 0) return 0
  return principal * (annualRatePct / 100) / 365
}

/**
 * Compute monthly accrual for a specific year/month.
 * Formula: dailyInterest × days_in_month(year, month)
 *
 * month is 1-based (1 = January, 12 = December).
 */
export function computeMonthlyAccrual(
  dailyInterest: number,
  year: number,
  month: number,
): number {
  if (dailyInterest <= 0) return 0
  const days = daysInMonth(year, month)
  return round2(dailyInterest * days)
}

/**
 * Compute year-to-date accrual.
 * Starts from Jan 1 of the current year OR disbursement date — whichever is later.
 * Formula: days_since_ytd_start × dailyInterest
 *
 * Both disbursementDate and today are 'YYYY-MM-DD' strings.
 */
export function computeYtdAccrual(
  dailyInterest: number,
  disbursementDate: string,
  today: string,
): number {
  if (dailyInterest <= 0) return 0

  const [ty, tm, td] = today.substring(0, 10).split('-').map(Number)
  const todayDate = new Date(ty, tm - 1, td)
  const janFirst = new Date(ty, 0, 1)

  // YTD starts from Jan 1 or disbursement date, whichever is later
  const [dy, dm, dd] = disbursementDate.substring(0, 10).split('-').map(Number)
  const disbDate = new Date(dy, dm - 1, dd)

  const ytdStart = disbDate > janFirst ? disbDate : janFirst

  if (ytdStart > todayDate) return 0

  const diffMs = todayDate.getTime() - ytdStart.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))

  return round2(dailyInterest * days)
}

/**
 * Compute total accrued interest since disbursement.
 * Formula: days_since_disbursement × dailyInterest
 *
 * Both disbursementDate and today are 'YYYY-MM-DD' strings.
 */
export function computeTotalAccrued(
  dailyInterest: number,
  disbursementDate: string,
  today: string,
): number {
  if (dailyInterest <= 0) return 0

  const [dy, dm, dd] = disbursementDate.substring(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.substring(0, 10).split('-').map(Number)

  const disbDate = new Date(dy, dm - 1, dd)
  const todayDate = new Date(ty, tm - 1, td)

  if (disbDate >= todayDate) return 0

  const diffMs = todayDate.getTime() - disbDate.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))

  return round2(dailyInterest * days)
}

/**
 * Check VUK örtülü kazanç risk.
 * Returns true if:
 *   - isZeroRate is true AND
 *   - principal > 50,000 TRY AND
 *   - duration > 365 days (> 12 months)
 */
export function hasVukRisk(
  isZeroRate: boolean,
  principalTry: number,
  disbursementDate: string,
  today: string,
): boolean {
  if (!isZeroRate) return false
  if (principalTry <= 50_000) return false

  const [dy, dm, dd] = disbursementDate.substring(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.substring(0, 10).split('-').map(Number)

  const disbDate = new Date(dy, dm - 1, dd)
  const todayDate = new Date(ty, tm - 1, td)

  const diffMs = todayDate.getTime() - disbDate.getTime()
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24))

  return days > 365
}

// ── Service class ─────────────────────────────────────────────────────────────

const DEFAULT_MARKET_RATE_PCT = 50 // Turkish Central Bank conservative estimate

export class InterestAccrualService {
  /**
   * Compute the full interest accrual report for a company.
   * Fetches all active tranches, computes daily/monthly/YTD accruals,
   * cross-references paid interest from journal entries (account 780),
   * and flags VUK compliance risks.
   */
  static async compute(
    companyId: string,
    supabase: SupabaseClient,
    today?: string,
  ): Promise<InterestAccrualReport> {
    const asOfDate = today ?? new Date().toISOString().substring(0, 10)
    const [ty, tm] = asOfDate.substring(0, 10).split('-').map(Number)

    // ── Fetch market rate from config if available ────────────────────────────
    let marketRatePct = DEFAULT_MARKET_RATE_PCT
    try {
      const { data: configRow } = await supabase
        .from('app_config')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'market_interest_rate_pct')
        .maybeSingle()

      if (configRow?.value != null) {
        const parsed = Number(configRow.value)
        if (!isNaN(parsed) && parsed > 0) marketRatePct = parsed
      }
    } catch {
      // config table may not exist — use default
    }

    // ── Fetch active tranches ─────────────────────────────────────────────────
    const { data: rows, error } = await supabase
      .from('partner_loan_tranches')
      .select(`
        id,
        partner_id,
        principal_try,
        total_repaid_try,
        disbursement_date,
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

    // ── Fetch interest payments from journal entries (account 780) ────────────
    // Account 780 = Finansman Giderleri (interest expense)
    // We sum debits minus credits to get total interest paid
    const paidByTranche: Record<string, number> = {}
    try {
      const { data: jLines } = await supabase
        .from('journal_entry_lines')
        .select('debit_try, credit_try, description, reference_id')
        .eq('company_id', companyId)
        .eq('account_code', '780')

      if (Array.isArray(jLines)) {
        // Sum total interest paid — not tranche-specific since we can't reliably
        // link journal lines to individual tranches by reference_id in all cases.
        // We'll attribute proportionally later, or accumulate for known references.
        for (const line of jLines) {
          const l = line as Record<string, unknown>
          const refId = l.reference_id as string | null
          if (refId) {
            paidByTranche[refId] =
              (paidByTranche[refId] ?? 0) +
              Number(l.debit_try ?? 0) -
              Number(l.credit_try ?? 0)
          }
        }
      }
    } catch {
      // journal lines may not exist for this company — silently continue
    }

    // ── Process tranches ──────────────────────────────────────────────────────
    const tranches: TranchAccrual[] = []

    for (const row of (rows ?? [])) {
      const r = row as Record<string, unknown>
      const trancheId = r.id as string
      const partnersJoin = r.partners as { name?: string } | null
      const partnerName = partnersJoin?.name ?? 'Ortak'
      const partnerId = r.partner_id as string

      const principal = Number(r.principal_try) || 0
      const repaid = Number(r.total_repaid_try) || 0
      const outstanding = round2(principal - repaid)

      if (outstanding < 0) continue

      // Disbursement date — required for accrual; skip if missing
      const disbRaw = r.disbursement_date as string | null
      if (!disbRaw) continue
      const disbursementDate = disbRaw.substring(0, 10)

      const expectedEndDate = r.expected_repayment_date
        ? (r.expected_repayment_date as string).substring(0, 10)
        : null

      // Interest rate: prefer interest_rate_annual_pct; fall back to annual_interest_rate (decimal)
      let ratePct: number
      if (r.interest_rate_annual_pct != null && !isNaN(Number(r.interest_rate_annual_pct))) {
        ratePct = Number(r.interest_rate_annual_pct)
      } else if (r.annual_interest_rate != null && !isNaN(Number(r.annual_interest_rate))) {
        // annual_interest_rate may be stored as a decimal (e.g. 0.20 for 20%)
        const raw = Number(r.annual_interest_rate)
        ratePct = raw <= 1 ? raw * 100 : raw
      } else {
        ratePct = 0
      }

      const isZeroRate = ratePct === 0
      const isBelowMarket = !isZeroRate && ratePct < marketRatePct * 0.5

      // Days since disbursement
      const [dy, dm, dd] = disbursementDate.split('-').map(Number)
      const [cy, cm, cd] = asOfDate.split('-').map(Number)
      const disbDate = new Date(dy, dm - 1, dd)
      const todayDate = new Date(cy, cm - 1, cd)
      const diffMs = Math.max(0, todayDate.getTime() - disbDate.getTime())
      const daysOutstanding = Math.round(diffMs / (1000 * 60 * 60 * 24))

      // Compute accruals using outstanding principal
      const dailyInterest = computeDailyInterest(outstanding, ratePct)
      const monthlyAccrual = computeMonthlyAccrual(dailyInterest, ty, tm)
      const ytdAccrual = computeYtdAccrual(dailyInterest, disbursementDate, asOfDate)
      const totalAccrued = computeTotalAccrued(dailyInterest, disbursementDate, asOfDate)

      // Interest paid from journal (780), keyed by tranche id
      const totalPaid = round2(Math.max(0, paidByTranche[trancheId] ?? 0))
      const outstandingInterest = round2(Math.max(0, totalAccrued - totalPaid))

      const vukRisk = hasVukRisk(isZeroRate, principal, disbursementDate, asOfDate)
      const isActive = (r.status as string) === 'active'

      tranches.push({
        tranche_id: trancheId,
        partner_id: partnerId,
        partner_name: partnerName,
        principal_try: principal,
        total_repaid_try: repaid,
        outstanding_principal: outstanding,
        disbursement_date: disbursementDate,
        interest_rate_annual_pct: ratePct,
        daily_interest_try: round2(dailyInterest),
        monthly_accrual_try: monthlyAccrual,
        ytd_accrual_try: ytdAccrual,
        total_accrued_try: totalAccrued,
        total_paid_try: totalPaid,
        outstanding_interest_try: outstandingInterest,
        days_outstanding: daysOutstanding,
        is_zero_rate: isZeroRate,
        is_below_market: isBelowMarket,
        vuk_risk: vukRisk,
        is_active: isActive,
        expected_end_date: expectedEndDate,
      })
    }

    // ── Portfolio totals ──────────────────────────────────────────────────────

    const totalOutstandingPrincipal = round2(
      tranches.reduce((s, t) => s + t.outstanding_principal, 0),
    )
    const totalAccruedYtd = round2(
      tranches.reduce((s, t) => s + t.ytd_accrual_try, 0),
    )
    const totalOutstandingInterest = round2(
      tranches.reduce((s, t) => s + t.outstanding_interest_try, 0),
    )

    // Weighted average rate (weighted by outstanding principal)
    let weightedAvgRate: number | null = null
    if (totalOutstandingPrincipal > 0) {
      const weightedSum = tranches.reduce(
        (s, t) => s + t.interest_rate_annual_pct * t.outstanding_principal,
        0,
      )
      weightedAvgRate = round2(weightedSum / totalOutstandingPrincipal)
    }

    const zeroRateCount = tranches.filter(t => t.is_zero_rate).length
    const vukRiskCount = tranches.filter(t => t.vuk_risk).length

    // Next month interest obligation
    const nextMonth = tm === 12 ? 1 : tm + 1
    const nextYear = tm === 12 ? ty + 1 : ty
    const nextMonthInterest = round2(
      tranches.reduce(
        (s, t) => s + computeMonthlyAccrual(t.daily_interest_try, nextYear, nextMonth),
        0,
      ),
    )

    return {
      company_id: companyId,
      as_of_date: asOfDate,
      market_rate_pct: marketRatePct,
      tranches,
      total_outstanding_principal: totalOutstandingPrincipal,
      total_accrued_ytd: totalAccruedYtd,
      total_outstanding_interest: totalOutstandingInterest,
      weighted_avg_rate: weightedAvgRate,
      zero_rate_count: zeroRateCount,
      vuk_risk_count: vukRiskCount,
      next_month_interest_try: nextMonthInterest,
      computed_at: new Date().toISOString(),
    }
  }
}
