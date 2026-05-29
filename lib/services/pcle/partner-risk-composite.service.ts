// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/partner-risk-composite.service.ts
//
// Partner Risk Composite Scoring — 6-Dimension Engine
//
// Evaluates each partner across 6 distinct risk dimensions and produces a
// weighted composite score, risk grade, risk level, and trend classification.
//
// This is distinct from partner-risk.service.ts which uses different dimensions
// (loan_concentration, equity_gap, debt_service, loan_duration, interest_rate,
// waterfall_burden). This module focuses on:
//   1. Debt Concentration Risk     — 25%
//   2. Repayment Timeliness        — 20%
//   3. Equity Commitment Fulfillment — 20%
//   4. Liquidity Contribution      — 15%
//   5. Loan-to-Equity Ratio        — 10%
//   6. Partnership Duration Stability — 10%
//
// All pure functions are exported for unit testing.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Dimension Weights ─────────────────────────────────────────────────────────

const WEIGHTS = {
  debtConcentration:    0.25,
  repaymentTimeliness:  0.20,
  equityFulfillment:    0.20,
  liquidityContribution: 0.15,
  loanToEquity:         0.10,
  durationStability:    0.10,
} as const

// ── Pure scoring functions ────────────────────────────────────────────────────

/**
 * Dimension 1: Debt Concentration Risk (weight 25%)
 *
 * Penalizes a partner who holds a disproportionate share of total company debt.
 * share = partnerLoan / max(1, totalCompanyLoans)
 * score = max(0, 100 - share * 150)
 * 0% share → 100, 33% share → ~50.5, 66%+ share → 0 (clamped)
 */
export function scoreDebtConcentration(
  partnerLoan: number,
  totalCompanyLoans: number,
): number {
  const share = partnerLoan / Math.max(1, totalCompanyLoans)
  return Math.max(0, 100 - share * 100 * 1.5)
}

/**
 * Dimension 2: Repayment Timeliness (weight 20%)
 *
 * Scores based on on-time repayment rate plus a punctuality bonus.
 * score = (onTimeRepayments / max(1, totalRepayments)) * 70
 *       + max(0, 30 - avgDaysLate)
 * Clamped to [0, 100].
 */
export function scoreRepaymentTimeliness(
  onTimeRepayments: number,
  totalRepayments: number,
  avgDaysLate: number,
): number {
  const timelinessScore = (onTimeRepayments / Math.max(1, totalRepayments)) * 70
  const punctualityBonus = Math.max(0, 30 - avgDaysLate)
  return Math.min(100, Math.max(0, timelinessScore + punctualityBonus))
}

/**
 * Dimension 3: Equity Commitment Fulfillment (weight 20%)
 *
 * Returns (paidAmount / max(1, committedAmount)) * 100.
 * Clamped to [0, 100].
 * If committedAmount === 0, partner has no equity obligation → full score (100).
 */
export function scoreEquityFulfillment(
  paidAmount: number,
  committedAmount: number,
): number {
  if (committedAmount <= 0) return 100
  return Math.min(100, Math.max(0, (paidAmount / committedAmount) * 100))
}

/**
 * Dimension 4: Liquidity Contribution (weight 15%)
 *
 * Measures how much this partner has provided relative to their pro-rata share.
 * If no loans and no equity from anyone: returns 50 (neutral).
 * loanShare   = partnerLoansGiven / max(1, totalPartnerLoans)
 * equityShare = partnerEquityPaid / max(1, totalEquityPaid)
 * contribution = (loanShare * 0.6 + equityShare * 0.4) * 100
 * Clamped to [0, 100].
 */
export function scoreLiquidityContribution(
  partnerLoansGiven: number,
  totalPartnerLoans: number,
  partnerEquityPaid: number,
  totalEquityPaid: number,
): number {
  if (totalPartnerLoans <= 0 && totalEquityPaid <= 0) return 50
  const loanShare   = partnerLoansGiven / Math.max(1, totalPartnerLoans)
  const equityShare = partnerEquityPaid / Math.max(1, totalEquityPaid)
  const contribution = (loanShare * 0.6 + equityShare * 0.4) * 100
  return Math.min(100, Math.max(0, contribution))
}

/**
 * Dimension 5: Loan-to-Equity Ratio (weight 10%)
 *
 * A high loan-to-equity ratio signals an over-leveraged partner.
 * ratio = netLoanBalance / max(1, equityPaid)
 * score = max(0, 100 - ratio * 20)  (ratio 0 → 100, ratio 5 → 0)
 * Clamped to [0, 100].
 */
export function scoreLoanToEquityRatio(
  netLoanBalance: number,
  equityPaid: number,
): number {
  const ratio = netLoanBalance / Math.max(1, equityPaid)
  return Math.min(100, Math.max(0, 100 - ratio * 20))
}

/**
 * Dimension 6: Partnership Duration Stability (weight 10%)
 *
 * Long-standing partnerships are lower risk (more stable, proven track record).
 * score = min(100, partnershipMonths * 100 / 60)
 * 0 months → 0, 30 months → 50, 60 months → 100 (capped).
 */
export function scoreDurationStability(
  partnershipMonths: number,
): number {
  return Math.min(100, Math.max(0, (partnershipMonths * 100) / 60))
}

// ── Composite & Classification ────────────────────────────────────────────────

export interface CompositeScoreInput {
  debtConcentration:    number
  repaymentTimeliness:  number
  equityFulfillment:    number
  liquidityContribution: number
  loanToEquity:         number
  durationStability:    number
}

/**
 * Weighted average composite score.
 * Returns weighted average rounded to 1 decimal.
 */
export function computeCompositeRiskScore(
  scores: CompositeScoreInput,
): number {
  const weighted =
    scores.debtConcentration    * WEIGHTS.debtConcentration +
    scores.repaymentTimeliness  * WEIGHTS.repaymentTimeliness +
    scores.equityFulfillment    * WEIGHTS.equityFulfillment +
    scores.liquidityContribution * WEIGHTS.liquidityContribution +
    scores.loanToEquity         * WEIGHTS.loanToEquity +
    scores.durationStability    * WEIGHTS.durationStability

  return Math.round(weighted * 10) / 10
}

/**
 * Map composite score to A–F grade.
 * A: >= 80
 * B: >= 65
 * C: >= 50
 * D: >= 35
 * F: < 35
 */
export function classifyRiskGrade(
  compositeScore: number,
): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (compositeScore >= 80) return 'A'
  if (compositeScore >= 65) return 'B'
  if (compositeScore >= 50) return 'C'
  if (compositeScore >= 35) return 'D'
  return 'F'
}

/**
 * Map grade to risk level label.
 * A → low, B → moderate, C → elevated, D → high, F → critical
 */
export function classifyRiskLevel(
  grade: 'A' | 'B' | 'C' | 'D' | 'F',
): 'low' | 'moderate' | 'elevated' | 'high' | 'critical' {
  const map: Record<'A' | 'B' | 'C' | 'D' | 'F', 'low' | 'moderate' | 'elevated' | 'high' | 'critical'> = {
    A: 'low',
    B: 'moderate',
    C: 'elevated',
    D: 'high',
    F: 'critical',
  }
  return map[grade]
}

/**
 * Compute risk trend comparing current score to prior period score.
 * new_partner:    priorScore is null
 * improving:      currentScore > priorScore + 5
 * deteriorating:  currentScore < priorScore - 5
 * stable:         else
 */
export function computeRiskTrend(
  currentScore: number,
  priorScore: number | null,
): 'improving' | 'stable' | 'deteriorating' | 'new_partner' {
  if (priorScore === null) return 'new_partner'
  if (currentScore > priorScore + 5) return 'improving'
  if (currentScore < priorScore - 5) return 'deteriorating'
  return 'stable'
}

// ── Service Class ─────────────────────────────────────────────────────────────

/** DB row shapes (internal) */
interface PartnerDbRow {
  id: string
  name: string
  share_pct: number | null
  created_at: string
}

interface TrancheDbRow {
  partner_id: string
  principal_try: number
  total_repaid_try: number
}

interface CommitmentDbRow {
  partner_id: string
  committed_try: number
  paid_try: number
}

interface TxDbRow {
  partner_id: string | null
  tx_type: string
  amount_try: number
  tx_date: string
}

const DIMENSION_LABELS: Record<keyof CompositeScoreInput, string> = {
  debtConcentration:    'Borç Konsantrasyonu',
  repaymentTimeliness:  'Geri Ödeme Zamanlaması',
  equityFulfillment:    'Sermaye Taahhüdü Karşılanması',
  liquidityContribution: 'Likidite Katkısı',
  loanToEquity:         'Borç/Özkaynak Oranı',
  durationStability:    'Ortaklık Süresi İstikrarı',
}

export class PartnerRiskCompositeService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    partners: Array<{
      partner_id: string
      partner_name: string
      share_pct: number
      dimension_scores: {
        debt_concentration: number
        repayment_timeliness: number
        equity_fulfillment: number
        liquidity_contribution: number
        loan_to_equity: number
        duration_stability: number
      }
      composite_score: number
      grade: 'A' | 'B' | 'C' | 'D' | 'F'
      risk_level: ReturnType<typeof classifyRiskLevel>
      risk_trend: ReturnType<typeof computeRiskTrend>
      key_risk_factor: string
    }>
    company_summary: {
      avg_composite_score: number | null
      grade_distribution: { A: number; B: number; C: number; D: number; F: number }
      highest_risk_partner: string | null
      company_risk_level: ReturnType<typeof classifyRiskLevel>
    }
  }> {
    const [partnersRes, tranchesRes, commitmentsRes, txRes] = await Promise.allSettled([
      this.supabase
        .from('partners')
        .select('id, name, share_pct, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('name'),

      this.supabase
        .from('partner_loan_tranches')
        .select('partner_id, principal_try, total_repaid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, committed_try, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this.supabase
        .from('partner_transactions')
        .select('partner_id, tx_type, amount_try, tx_date')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const partners: PartnerDbRow[] =
      partnersRes.status === 'fulfilled' ? (partnersRes.value.data ?? []) : []
    const tranches: TrancheDbRow[] =
      tranchesRes.status === 'fulfilled' ? (tranchesRes.value.data ?? []) : []
    const commitments: CommitmentDbRow[] =
      commitmentsRes.status === 'fulfilled' ? (commitmentsRes.value.data ?? []) : []
    const txRows: TxDbRow[] =
      txRes.status === 'fulfilled' ? (txRes.value.data ?? []) : []

    // ── Pre-aggregate company-level totals ────────────────────────────────────

    // Total company debt = sum of (principal - repaid) for all active tranches
    const totalCompanyDebt = tranches.reduce(
      (s, t) => s + Math.max(0, t.principal_try - t.total_repaid_try),
      0,
    )

    // Total paid equity across all partners
    const totalEquityPaid = commitments.reduce((s, c) => s + c.paid_try, 0)

    // Total loan inflows from all partners (tx_type = 'loan_in' or 'partner_loan')
    const loanInTypes = new Set(['loan_in', 'partner_loan', 'shareholder_loan'])
    const totalLoansGiven = txRows
      .filter(t => loanInTypes.has(t.tx_type))
      .reduce((s, t) => s + t.amount_try, 0)

    // ── Per-partner scoring ───────────────────────────────────────────────────

    const now = new Date()

    const partnerResults = partners.map(p => {
      // Tranche data for this partner
      const partnerTranches = tranches.filter(t => t.partner_id === p.id)
      const partnerLoanBalance = partnerTranches.reduce(
        (s, t) => s + Math.max(0, t.principal_try - t.total_repaid_try),
        0,
      )
      const partnerTotalLoaned = partnerTranches.reduce(
        (s, t) => s + t.principal_try,
        0,
      )

      // Capital commitment data for this partner
      const partnerCommitments = commitments.filter(c => c.partner_id === p.id)
      const partnerCommittedTotal = partnerCommitments.reduce((s, c) => s + c.committed_try, 0)
      const partnerPaidTotal = partnerCommitments.reduce((s, c) => s + c.paid_try, 0)

      // Repayment data — loan repayment transactions by this partner
      const repayTypes = new Set(['loan_repayment', 'repayment', 'loan_out'])
      const partnerRepayTxs = txRows.filter(
        t => t.partner_id === p.id && repayTypes.has(t.tx_type),
      )
      // For simplicity: treat each repayment transaction as one repayment event.
      // "on time" here is approximated: we can't know exact due dates from tx alone,
      // so we use all repayments as on-time (0 avg days late) — enriched later if needed.
      const totalRepayments = partnerRepayTxs.length
      const onTimeRepayments = totalRepayments // conservative: assume all on time (no due date data)
      const avgDaysLate = 0

      // Loan transactions given (funds from partner to company)
      const partnerLoansGiven = txRows
        .filter(t => t.partner_id === p.id && loanInTypes.has(t.tx_type))
        .reduce((s, t) => s + t.amount_try, 0)

      // Partnership duration in months
      const partnerCreatedAt = new Date(p.created_at)
      const durationMs = now.getTime() - partnerCreatedAt.getTime()
      const partnershipMonths = Math.max(0, durationMs / (1000 * 60 * 60 * 24 * 30.4375))

      // ── Compute dimension scores ──────────────────────────────────────────
      const d1 = scoreDebtConcentration(partnerLoanBalance, totalCompanyDebt)
      const d2 = scoreRepaymentTimeliness(onTimeRepayments, totalRepayments, avgDaysLate)
      const d3 = scoreEquityFulfillment(partnerPaidTotal, partnerCommittedTotal)
      const d4 = scoreLiquidityContribution(
        partnerLoansGiven,
        totalLoansGiven,
        partnerPaidTotal,
        totalEquityPaid,
      )
      const d5 = scoreLoanToEquityRatio(partnerLoanBalance, partnerPaidTotal || partnerTotalLoaned)
      const d6 = scoreDurationStability(partnershipMonths)

      const dimensionScores: CompositeScoreInput = {
        debtConcentration:    d1,
        repaymentTimeliness:  d2,
        equityFulfillment:    d3,
        liquidityContribution: d4,
        loanToEquity:         d5,
        durationStability:    d6,
      }

      const compositeScore = computeCompositeRiskScore(dimensionScores)
      const grade = classifyRiskGrade(compositeScore)
      const riskLevel = classifyRiskLevel(grade)
      // No prior period data in this query — always new_partner on first run
      // In a real impl, prior snapshot would come from a separate DB query
      const riskTrend = computeRiskTrend(compositeScore, null)

      // Key risk factor: dimension with lowest score
      const dimensionEntries = Object.entries(dimensionScores) as Array<[keyof CompositeScoreInput, number]>
      const worstDimension = dimensionEntries.reduce((a, b) => b[1] < a[1] ? b : a)
      const keyRiskFactor = DIMENSION_LABELS[worstDimension[0]]

      return {
        partner_id:   p.id,
        partner_name: p.name,
        share_pct:    p.share_pct ?? 0,
        dimension_scores: {
          debt_concentration:    d1,
          repayment_timeliness:  d2,
          equity_fulfillment:    d3,
          liquidity_contribution: d4,
          loan_to_equity:        d5,
          duration_stability:    d6,
        },
        composite_score: compositeScore,
        grade,
        risk_level:   riskLevel,
        risk_trend:   riskTrend,
        key_risk_factor: keyRiskFactor,
      }
    })

    // ── Company summary ───────────────────────────────────────────────────────

    const avgCompositeScore = partnerResults.length > 0
      ? Math.round(
          (partnerResults.reduce((s, p) => s + p.composite_score, 0) / partnerResults.length) * 10,
        ) / 10
      : null

    const gradeDistribution: { A: number; B: number; C: number; D: number; F: number } = {
      A: 0, B: 0, C: 0, D: 0, F: 0,
    }
    for (const p of partnerResults) {
      gradeDistribution[p.grade] += 1
    }

    const highestRiskPartner = partnerResults.length > 0
      ? partnerResults.reduce((a, b) => b.composite_score < a.composite_score ? b : a).partner_name
      : null

    const companyGrade = avgCompositeScore !== null
      ? classifyRiskGrade(avgCompositeScore)
      : 'A'
    const companyRiskLevel = classifyRiskLevel(companyGrade)

    return {
      partners: partnerResults,
      company_summary: {
        avg_composite_score: avgCompositeScore,
        grade_distribution:  gradeDistribution,
        highest_risk_partner: highestRiskPartner,
        company_risk_level:  companyRiskLevel,
      },
    }
  }
}
