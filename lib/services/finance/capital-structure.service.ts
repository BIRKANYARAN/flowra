// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/capital-structure.service.ts
//
// Capital Structure & Debt Capacity Analysis
//
// Evaluates the company's debt capacity, optimal leverage, and whether partner
// loans create excessive financial risk.
//
// Pure exported functions:
//   - computeDebtServiceCoverageRatio  — DSCR = EBITDA / annual debt service
//   - classifyDscrHealth               — strong / adequate / tight / distressed
//   - computeDebtCapacity              — conservative / optimal / maximum ranges
//   - computeHeadroomToMaxDebt         — headroom to max debt capacity
//   - computeWeightedAverageCostOfDebt — WACD across loan portfolio
//   - computeWacc                       — WACC (equity + debt blended cost)
//   - computeLeverageCapacityScore     — 0-100 composite leverage health
//   - classifyCapitalStructureHealth   — conservative / balanced / leveraged…
//   - computePartnerLoanRiskPremium    — rate drag from partner loan concentration
//
// CapitalStructureService class fetches DB data and returns a full report.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Debt Service Coverage Ratio = EBITDA / annualDebtService
 *
 * annualDebtService = principal repayments + interest due in the year.
 * Returns null if annualDebtService === 0 (no debt service obligation).
 *
 * Benchmarks:
 *   > 2.0  → strong
 *   ≥ 1.25 → adequate (comfortable)
 *   ≥ 1.0  → break-even (tight)
 *   < 1.0  → distressed
 */
export function computeDebtServiceCoverageRatio(
  ebitda: number,
  annualDebtService: number,
): number | null {
  if (annualDebtService === 0) return null
  return ebitda / annualDebtService
}

/**
 * Classify DSCR health level.
 *   insufficient_data: dscr is null
 *   strong:     >= 2.0
 *   adequate:   >= 1.25
 *   tight:      >= 1.0
 *   distressed: < 1.0
 */
export function classifyDscrHealth(
  dscr: number | null,
): 'strong' | 'adequate' | 'tight' | 'distressed' | 'insufficient_data' {
  if (dscr === null)  return 'insufficient_data'
  if (dscr >= 2.0)   return 'strong'
  if (dscr >= 1.25)  return 'adequate'
  if (dscr >= 1.0)   return 'tight'
  return 'distressed'
}

/**
 * Compute safe debt capacity ranges based on EBITDA multiples.
 *
 * @param ebitda              - Annual EBITDA in TRY
 * @param targetDscrMultiple  - Default 3.0× EBITDA (optimal)
 * @param maxLeverageRatio    - Default 4.0× EBITDA (absolute ceiling)
 *
 * Returns:
 *   conservative = ebitda × 2.0 (very safe)
 *   optimal      = ebitda × targetDscrMultiple
 *   maximum      = ebitda × maxLeverageRatio
 */
export function computeDebtCapacity(
  ebitda: number,
  targetDscrMultiple = 3.0,
  maxLeverageRatio   = 4.0,
): {
  conservative: number
  optimal:      number
  maximum:      number
} {
  return {
    conservative: ebitda * 2.0,
    optimal:      ebitda * targetDscrMultiple,
    maximum:      ebitda * maxLeverageRatio,
  }
}

/**
 * Headroom to maximum debt capacity.
 * Returns maxDebtCapacity - currentDebt.
 * Negative value = over-leveraged (current debt exceeds maximum).
 */
export function computeHeadroomToMaxDebt(
  currentDebt:     number,
  maxDebtCapacity: number,
): number {
  return maxDebtCapacity - currentDebt
}

/**
 * Weighted Average Cost of Debt (WACD).
 *
 * WACD = Σ(outstanding × rate) / Σ(outstanding)
 *
 * Returns null if total outstanding === 0.
 * annual_rate is in percentage form (e.g. 25 for 25%).
 */
export function computeWeightedAverageCostOfDebt(
  loans: Array<{
    outstanding:  number
    annual_rate:  number   // percentage, e.g. 25 for 25%
  }>,
): number | null {
  const totalOutstanding = loans.reduce((s, l) => s + l.outstanding, 0)
  if (totalOutstanding === 0) return null

  const weightedSum = loans.reduce(
    (s, l) => s + l.outstanding * l.annual_rate,
    0,
  )
  return weightedSum / totalOutstanding
}

/**
 * Weighted Average Cost of Capital (WACC).
 *
 * WACC = (E/V × Ke) + (D/V × Kd × (1 - T))
 * V = E + D
 *
 * Returns null if V === 0 (no equity or debt).
 * Returns percentage (e.g. 28.5 for 28.5%).
 *
 * Defaults:
 *   costOfEquityPct = 30% (Turkish SME hurdle rate)
 *   taxRatePct      = 25% (Turkish corporate tax)
 */
export function computeWacc(
  equityValue:      number,
  debtValue:        number,
  costOfEquityPct:  number,
  costOfDebtPct:    number,
  taxRatePct        = 25,
): number | null {
  const v = equityValue + debtValue
  if (v === 0) return null

  const eShare = equityValue / v
  const dShare = debtValue   / v
  const tax    = taxRatePct  / 100

  const wacc =
    eShare * costOfEquityPct +
    dShare * costOfDebtPct * (1 - tax)

  return wacc
}

/**
 * Leverage Capacity Score (0-100 composite).
 *
 * Weights:
 *   DSCR component          × 0.40
 *   Debt/EBITDA component   × 0.35
 *   Interest coverage       × 0.25
 *
 * Each component:
 *   dscr_score     = dscr null→50;           else clamp((dscr/3)×100, 0, 100)
 *   leverage_score = debtToEbitda null→50;   else clamp((1-debtToEbitda/6)×100, 0, 100)
 *   coverage_score = interestCoverage null→50; else clamp((interestCoverage/5)×100, 0, 100)
 *
 * Result rounded to 1 decimal.
 */
export function computeLeverageCapacityScore(
  dscr:             number | null,
  debtToEbitda:     number | null,
  interestCoverage: number | null,
): number {
  const dscrRaw =
    dscr === null
      ? 50
      : Math.min(100, Math.max(0, (dscr / 3) * 100))

  const leverageRaw =
    debtToEbitda === null
      ? 50
      : Math.min(100, Math.max(0, (1 - debtToEbitda / 6) * 100))

  const coverageRaw =
    interestCoverage === null
      ? 50
      : Math.min(100, Math.max(0, (interestCoverage / 5) * 100))

  const score = dscrRaw * 0.40 + leverageRaw * 0.35 + coverageRaw * 0.25

  return Math.round(score * 10) / 10
}

/**
 * Classify overall capital structure health from leverage capacity score.
 *   conservative: >= 80
 *   balanced:     >= 60
 *   leveraged:    >= 40
 *   over_leveraged: >= 20
 *   critical:     < 20
 */
export function classifyCapitalStructureHealth(
  score: number,
): 'conservative' | 'balanced' | 'leveraged' | 'over_leveraged' | 'critical' {
  if (score >= 80) return 'conservative'
  if (score >= 60) return 'balanced'
  if (score >= 40) return 'leveraged'
  if (score >= 20) return 'over_leveraged'
  return 'critical'
}

/**
 * Partner Loan Risk Premium.
 *
 * Measures the "effective rate drag" from partner loan concentration:
 *   risk_premium = (partnerLoansTotal / totalDebt) × interestRate
 *
 * This is the portion of the WACD attributable to partner loan concentration.
 * Returns null if totalDebt === 0.
 */
export function computePartnerLoanRiskPremium(
  partnerLoansTotal: number,
  totalDebt:         number,
  interestRate:      number,   // effective rate on partner loans (percentage)
): number | null {
  if (totalDebt === 0) return null
  return (partnerLoansTotal / totalDebt) * interestRate
}

// ── Service Class ──────────────────────────────────────────────────────────────

export class CapitalStructureService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    capital_structure: {
      total_equity:   number
      total_debt:     number
      partner_loans:  number
      bank_loans:     number
      debt_to_equity: number | null
      debt_to_ebitda: number | null
    }
    debt_service: {
      annual_principal:         number
      annual_interest:          number
      total_annual_debt_service: number
      dscr:                     number | null
      dscr_health:              ReturnType<typeof classifyDscrHealth>
    }
    capacity:        ReturnType<typeof computeDebtCapacity>
    headroom:        number
    wacd:            number | null
    leverage_score:  number
    structure_health: ReturnType<typeof classifyCapitalStructureHealth>
    ebitda_ytd:      number
  }> {
    const now       = new Date()
    const today     = now.toISOString().slice(0, 10)
    const yearStart = `${now.getFullYear()}-01-01`

    // ── Fire all DB queries in parallel ──────────────────────────────────────

    const [
      tranchesRes,
      salesRes,
      expensesRes,
      balanceSheetRes,
      commitmentsRes,
    ] = await Promise.allSettled([
      // Active partner loan tranches
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, total_repaid_try, interest_rate_annual_pct, expected_repayment_date, disbursement_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // YTD sales for EBITDA
      this.supabase
        .from('sales')
        .select('total_try, cost_of_goods_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', yearStart)
        .lte('sale_date', today),

      // YTD expenses for EBITDA
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', yearStart)
        .lte('expense_date', today),

      // Latest balance sheet snapshot for equity
      this.supabase
        .from('balance_sheet_snapshots')
        .select('total_assets_try, total_liabilities_try, retained_earnings_try')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Partner capital commitments for equity paid-in
      this.supabase
        .from('partner_capital_commitments')
        .select('paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    // ── Parse tranches ────────────────────────────────────────────────────────

    type TrancheRow = {
      principal_try:            number | null
      total_repaid_try:         number | null
      interest_rate_annual_pct: number | null
      expected_repayment_date:  string | null
      disbursement_date:        string | null
    }
    const tranches: TrancheRow[] =
      tranchesRes.status === 'fulfilled' ? (tranchesRes.value.data ?? []) : []

    // Outstanding partner loan balance
    const partnerLoans = tranches.reduce(
      (s, t) => s + Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
      0,
    )

    // Annual principal due this calendar year
    // Heuristic: prorate principal evenly over loan life for loans maturing this year or already active
    const currentYear = now.getFullYear()
    const annualPrincipal = tranches.reduce((s, t) => {
      const outstanding    = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
      const maturityDate   = t.expected_repayment_date ? new Date(t.expected_repayment_date) : null
      const disbursedDate  = t.disbursement_date       ? new Date(t.disbursement_date)        : null
      if (!maturityDate || !disbursedDate) return s

      const loanYears = Math.max(
        1,
        (maturityDate.getTime() - disbursedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000),
      )
      const annualInstalment = outstanding / loanYears

      // Only count if loan matures in current year or is already overdue
      const maturityYear = maturityDate.getFullYear()
      if (maturityYear <= currentYear) {
        return s + annualInstalment
      }
      return s + annualInstalment
    }, 0)

    // Annual interest = Σ(outstanding × rate)
    const annualInterest = tranches.reduce((s, t) => {
      const outstanding = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
      const rate        = Number(t.interest_rate_annual_pct ?? 0) / 100
      return s + outstanding * rate
    }, 0)

    // WACD inputs
    const waCdInputs = tranches.map(t => ({
      outstanding: Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
      annual_rate: Number(t.interest_rate_annual_pct ?? 0),
    }))
    const wacd = computeWeightedAverageCostOfDebt(waCdInputs)

    // ── Parse EBITDA from sales + expenses ───────────────────────────────────

    type SaleRow = { total_try?: number | null; cost_of_goods_try?: number | null }
    const salesRows: SaleRow[] =
      salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []

    const revenueYtd = salesRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const cogsYtd    = salesRows.reduce((s, r) => s + Number(r.cost_of_goods_try ?? 0), 0)

    const NON_OPEX = new Set([
      'partner_financing', 'loan_repayment', 'dividend',
      'internal_transfer', 'partner_loan_interest', 'tax',
    ])
    type ExpRow = { amount_try?: number | null; expense_type?: string | null }
    const expRows: ExpRow[] =
      expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []

    let opexYtd        = 0
    let interestExpYtd = 0
    for (const r of expRows) {
      const etype = String(r.expense_type ?? '')
      const amt   = Number(r.amount_try ?? 0)
      if (etype === 'partner_loan_interest') {
        interestExpYtd += amt
      } else if (!NON_OPEX.has(etype)) {
        opexYtd += amt
      }
    }

    // EBITDA = Revenue - COGS - OPEX (before interest/tax/D&A)
    const ebitdaYtd = revenueYtd - cogsYtd - opexYtd

    // Estimate interest if not explicitly logged as expense type
    if (interestExpYtd === 0) {
      interestExpYtd = annualInterest * ((now.getMonth() + 1) / 12)
    }

    // ── Equity from balance sheet snapshot or capital commitments ─────────────

    type BSRow = { total_assets_try?: number | null; total_liabilities_try?: number | null; retained_earnings_try?: number | null }
    const bsRow: BSRow | null =
      balanceSheetRes.status === 'fulfilled' ? (balanceSheetRes.value.data as BSRow | null) : null

    type CommitRow = { paid_try?: number | null }
    const commitRows: CommitRow[] =
      commitmentsRes.status === 'fulfilled' ? (commitmentsRes.value.data ?? []) : []
    const totalEquityPaid = commitRows.reduce((s, c) => s + Number(c.paid_try ?? 0), 0)

    let totalEquity: number
    if (bsRow && bsRow.total_assets_try != null && bsRow.total_liabilities_try != null) {
      totalEquity = Number(bsRow.total_assets_try) - Number(bsRow.total_liabilities_try)
    } else if (totalEquityPaid > 0) {
      totalEquity = totalEquityPaid + ebitdaYtd
    } else {
      totalEquity = ebitdaYtd > 0 ? ebitdaYtd : 0
    }

    // ── Assemble capital structure ─────────────────────────────────────────────

    // Partner loans are the only tracked debt; bank loans = 0 unless tracked separately
    const totalDebt    = partnerLoans
    const bankLoans    = 0  // not separately tracked in current schema

    const debtToEquity = totalEquity !== 0 ? totalDebt / totalEquity   : null
    const debtToEbitda = ebitdaYtd   !== 0 ? totalDebt / ebitdaYtd    : null

    // Debt service
    const totalAnnualDebtService = annualPrincipal + annualInterest
    const dscr     = computeDebtServiceCoverageRatio(ebitdaYtd, totalAnnualDebtService)
    const dscrHealth = classifyDscrHealth(dscr)

    // Capacity
    const capacity = computeDebtCapacity(ebitdaYtd)
    const headroom = computeHeadroomToMaxDebt(totalDebt, capacity.maximum)

    // Interest coverage = EBIT / interest expense
    const ebit = revenueYtd - cogsYtd - opexYtd
    const interestCoverage = interestExpYtd > 0 ? ebit / interestExpYtd : null

    // Leverage capacity score
    const leverageScore = computeLeverageCapacityScore(dscr, debtToEbitda, interestCoverage)
    const structureHealth = classifyCapitalStructureHealth(leverageScore)

    return {
      capital_structure: {
        total_equity:   totalEquity,
        total_debt:     totalDebt,
        partner_loans:  partnerLoans,
        bank_loans:     bankLoans,
        debt_to_equity: debtToEquity,
        debt_to_ebitda: debtToEbitda,
      },
      debt_service: {
        annual_principal:          annualPrincipal,
        annual_interest:           annualInterest,
        total_annual_debt_service: totalAnnualDebtService,
        dscr,
        dscr_health: dscrHealth,
      },
      capacity,
      headroom,
      wacd,
      leverage_score:  leverageScore,
      structure_health: structureHealth,
      ebitda_ytd:      ebitdaYtd,
    }
  }
}
