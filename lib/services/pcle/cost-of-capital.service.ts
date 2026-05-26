// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/cost-of-capital.service.ts
//
// Partner Loan Cost of Capital — Weighted Average Cost of Debt (WACD).
//
// Computes per-partner loan costs and an aggregate WACD across all active
// partner loan tranches for a company.
//
// Key metrics:
//   - annual_interest_try  = outstanding × annual_interest_rate
//   - monthly_interest_try = annual / 12
//   - ytd_interest_try     = annual × (days_elapsed / 365)
//   - wacd_pct             = Σ(outstanding × rate) / Σ(outstanding)
//
// Risk flags:
//   - is_zero_rate  = rate === 0 → örtülü kazanç risk (VUK/KVK 13)
//   - is_high_rate  = rate > 0.20 → unusually high
//
// Note: uses `annual_interest_rate` column (legacy name in use per schema.ts).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface PartnerLoanCost {
  partner_id: string
  partner_name: string
  outstanding_try: number
  annual_interest_rate: number       // 0–1 fraction
  annual_interest_try: number        // outstanding × rate
  monthly_interest_try: number       // annual / 12
  share_of_total_debt_pct: number    // % of total outstanding

  // YTD accrued interest
  ytd_interest_try: number           // annual × (days_elapsed / 365)

  // Warning flags
  is_zero_rate: boolean              // 0% loan — possible örtülü kazanç risk (VUK/KVK 13)
  is_high_rate: boolean              // > 20% — unusually high
}

export interface CostOfCapitalReport {
  as_of_date: string

  // Total debt
  total_outstanding_try: number
  total_annual_interest_try: number
  total_monthly_interest_try: number

  // Weighted average cost of debt (WACD)
  wacd_pct: number                   // weighted avg annual rate (0–1)

  // YTD
  ytd_interest_accrued_try: number

  // Per-partner breakdown
  partners: PartnerLoanCost[]

  // Risk flags
  zero_rate_loan_count: number       // number of 0% loans
  zero_rate_amount_try: number       // total amount at 0% — VUK/KVK 13 risk

  // Annualized projections
  annual_interest_projection_try: number

  computed_at: string
}

// ── Internal row types ─────────────────────────────────────────────────────────

interface TrancheRow {
  partner_id:          string
  outstanding_try:     number
  annual_interest_rate: number
}

interface PartnerNameRow {
  id:   string
  name: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CostOfCapitalService {

  /**
   * Fetch and compute the cost of capital report for all active partner loan tranches.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<CostOfCapitalReport> {
    const today    = opts?.today ?? new Date().toISOString().slice(0, 10)
    const yearStart = today.slice(0, 4) + '-01-01'

    // Days elapsed since year start (for YTD)
    const daysElapsed = Math.max(1, Math.round(
      (new Date(today).getTime() - new Date(yearStart).getTime()) / 86_400_000
    ))

    // ── Fetch active tranches ──────────────────────────────────────────────────
    const [tranchesRes, partnersRes] = await Promise.all([
      supabase
        .from('partner_loan_tranches')
        .select('partner_id, outstanding_try, annual_interest_rate')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('status', 'repaid')
        .gt('outstanding_try', 0),

      supabase
        .from('partners')
        .select('id, name')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const tranches: TrancheRow[]      = tranchesRes.data  ?? []
    const partnerRows: PartnerNameRow[] = partnersRes.data ?? []

    // Build partner name map
    const nameMap = new Map<string, string>()
    for (const p of partnerRows) nameMap.set(p.id, p.name)

    // Aggregate per partner (sum multiple tranches per partner)
    const partnerAgg = new Map<string, { outstanding: number; weighted_rate_sum: number; name: string }>()

    for (const t of tranches) {
      const outstanding = Number(t.outstanding_try) || 0
      const rate        = Number(t.annual_interest_rate) || 0
      const name        = nameMap.get(t.partner_id) ?? t.partner_id

      const existing = partnerAgg.get(t.partner_id)
      if (existing) {
        existing.outstanding        += outstanding
        existing.weighted_rate_sum  += outstanding * rate
      } else {
        partnerAgg.set(t.partner_id, {
          outstanding,
          weighted_rate_sum: outstanding * rate,
          name,
        })
      }
    }

    const total_outstanding_try = round2(
      Array.from(partnerAgg.values()).reduce((s, v) => s + v.outstanding, 0)
    )

    // ── Per-partner cost lines ─────────────────────────────────────────────────
    const partners: PartnerLoanCost[] = []

    for (const [partner_id, agg] of partnerAgg.entries()) {
      const outstanding          = round2(agg.outstanding)
      const effective_rate       = agg.outstanding > 0
        ? round2(agg.weighted_rate_sum / agg.outstanding * 10000) / 10000
        : 0
      const annual_interest_try  = round2(outstanding * effective_rate)
      const monthly_interest_try = round2(annual_interest_try / 12)
      const ytd_interest_try     = round2(annual_interest_try * (daysElapsed / 365))
      const share_of_total_debt_pct = total_outstanding_try > 0
        ? round2((outstanding / total_outstanding_try) * 100)
        : 0

      partners.push({
        partner_id,
        partner_name:             agg.name,
        outstanding_try:          outstanding,
        annual_interest_rate:     effective_rate,
        annual_interest_try,
        monthly_interest_try,
        share_of_total_debt_pct,
        ytd_interest_try,
        is_zero_rate:             effective_rate === 0,
        is_high_rate:             effective_rate > 0.20,
      })
    }

    // Sort by outstanding desc
    partners.sort((a, b) => b.outstanding_try - a.outstanding_try)

    // ── Aggregate totals ───────────────────────────────────────────────────────
    const total_annual_interest_try  = round2(partners.reduce((s, p) => s + p.annual_interest_try, 0))
    const total_monthly_interest_try = round2(total_annual_interest_try / 12)
    const ytd_interest_accrued_try   = round2(partners.reduce((s, p) => s + p.ytd_interest_try, 0))

    const wacd_pct = CostOfCapitalService.computeWACD(
      partners.map(p => ({ outstanding_try: p.outstanding_try, annual_interest_rate: p.annual_interest_rate }))
    )

    // Risk flags
    const zero_rate_partners = partners.filter(p => p.is_zero_rate)
    const zero_rate_loan_count = zero_rate_partners.length
    const zero_rate_amount_try = round2(zero_rate_partners.reduce((s, p) => s + p.outstanding_try, 0))

    return {
      as_of_date:                  today,
      total_outstanding_try,
      total_annual_interest_try,
      total_monthly_interest_try,
      wacd_pct,
      ytd_interest_accrued_try,
      partners,
      zero_rate_loan_count,
      zero_rate_amount_try,
      annual_interest_projection_try: total_annual_interest_try,
      computed_at:                 new Date().toISOString(),
    }
  }

  /**
   * Pure: compute weighted average cost of debt from an array of loans.
   * Returns 0 when total outstanding is 0.
   */
  static computeWACD(
    loans: Array<{ outstanding_try: number; annual_interest_rate: number }>,
  ): number {
    let totalOutstanding  = 0
    let weightedRateSum   = 0

    for (const loan of loans) {
      const outstanding = Number(loan.outstanding_try) || 0
      const rate        = Number(loan.annual_interest_rate) || 0
      totalOutstanding  += outstanding
      weightedRateSum   += outstanding * rate
    }

    if (totalOutstanding === 0) return 0
    return round2(weightedRateSum / totalOutstanding * 10000) / 10000  // 4 decimal precision
  }
}
