// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/interest-rate-sensitivity.service.ts
//
// Interest Rate Sensitivity Analysis — stress tests all partner loan tranches
// under different interest rate scenarios to understand P&L and cash-flow
// sensitivity.
//
// Pure helpers are exported for direct unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ── Rate scenario definitions ─────────────────────────────────────────────────

export interface RateScenario {
  name: string            // Display name (Turkish)
  rate_delta_pct: number  // Change from current rate in percentage points
  description: string     // Turkish description
}

export const STANDARD_SCENARIOS: RateScenario[] = [
  {
    name:           'Düşük Faiz (-5%)',
    rate_delta_pct: -5,
    description:    'Faiz oranlarının 5 puan düşmesi durumu',
  },
  {
    name:           'Baz Senaryo',
    rate_delta_pct: 0,
    description:    'Mevcut faiz oranları ile devam',
  },
  {
    name:           'Yüksek Faiz (+5%)',
    rate_delta_pct: 5,
    description:    'Faiz oranlarının 5 puan artması durumu',
  },
  {
    name:           'Stres (+10%)',
    rate_delta_pct: 10,
    description:    'Ciddi faiz artışı senaryosu',
  },
  {
    name:           'Kriz (+15%)',
    rate_delta_pct: 15,
    description:    'Kriz ortamı faiz baskısı',
  },
]

// ── Public types ──────────────────────────────────────────────────────────────

export interface TrancheSensitivity {
  tranche_id:       string
  partner_id:       string
  partner_name:     string
  current_rate_pct: number  // current annual rate
  outstanding_try:  number

  // Per scenario results
  scenarios: Array<{
    scenario_name:            string
    rate_delta_pct:           number
    new_rate_pct:             number   // current + delta (clamped at 0 minimum)
    monthly_interest_try:     number   // outstanding × new_rate / 12
    annual_interest_try:      number   // monthly × 12
    rate_change_impact_try:   number   // annual_interest vs base scenario annual
  }>
}

export interface PortfolioSensitivity {
  total_outstanding_try:  number
  weighted_avg_rate_pct:  number  // Σ(outstanding × rate) / Σ(outstanding)

  scenarios: Array<{
    scenario_name:               string
    rate_delta_pct:              number
    total_annual_interest_try:   number
    total_monthly_interest_try:  number
    incremental_annual_cost_try: number          // vs base scenario
    net_income_impact_pct:       number | null   // incremental / prior_net_income × 100
    dscr_impact:                 number | null   // new interest vs EBITDA
  }>
}

export interface InterestRateSensitivityReport {
  total_outstanding_try:      number
  weighted_avg_rate_pct:      number
  base_annual_interest_try:   number
  base_monthly_interest_try:  number

  interest_coverage_ratio:    number | null
  interest_coverage_health:   ReturnType<typeof classifyInterestCoverageHealth>

  breakeven_rate_pct:         number | null
  rate_sensitivity_risk:      ReturnType<typeof classifyRateSensitivityRisk>

  tranche_sensitivities:  TrancheSensitivity[]
  portfolio_sensitivity:  PortfolioSensitivity
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute monthly interest for a tranche at given annual rate.
 * monthly = outstanding × (annualRatePct / 100) / 12
 */
export function computeMonthlyInterest(
  outstandingTry: number,
  annualRatePct: number,
): number {
  return round2(outstandingTry * (annualRatePct / 100) / 12)
}

/**
 * Compute annual interest from monthly interest.
 * annual = monthly × 12
 */
export function computeAnnualInterest(monthlyInterest: number): number {
  return round2(monthlyInterest * 12)
}

/**
 * Apply rate delta to current rate, clamped at 0% minimum.
 * result = max(0, currentRatePct + deltaPct)
 */
export function applyRateDelta(
  currentRatePct: number,
  deltaPct: number,
): number {
  return Math.max(0, currentRatePct + deltaPct)
}

/**
 * Compute weighted average interest rate across tranches.
 * WAR = Σ(outstanding × rate) / Σ(outstanding)
 * Returns 0 if total outstanding is 0.
 */
export function computeWeightedAvgRate(
  tranches: Array<{ outstanding_try: number; annual_rate_pct: number }>,
): number {
  const totalOutstanding = tranches.reduce((s, t) => s + t.outstanding_try, 0)
  if (totalOutstanding <= 0) return 0
  const weightedSum = tranches.reduce(
    (s, t) => s + t.outstanding_try * t.annual_rate_pct,
    0,
  )
  return round2(weightedSum / totalOutstanding)
}

/**
 * Build tranche sensitivity for all provided scenarios.
 * For each scenario: computes new rate, monthly interest, annual interest,
 * and rate change impact vs the base scenario (delta=0).
 */
export function buildTrancheSensitivity(
  trancheId: string,
  partnerId: string,
  partnerName: string,
  outstandingTry: number,
  currentRatePct: number,
  scenarios: RateScenario[],
): TrancheSensitivity {
  // Find base scenario annual interest for impact calculation
  const baseScenario  = scenarios.find(s => s.rate_delta_pct === 0)
  const baseNewRate   = baseScenario ? applyRateDelta(currentRatePct, 0) : currentRatePct
  const baseMonthlyi  = computeMonthlyInterest(outstandingTry, baseNewRate)
  const baseAnnuali   = computeAnnualInterest(baseMonthlyi)

  const scenarioResults = scenarios.map(scenario => {
    const newRate   = applyRateDelta(currentRatePct, scenario.rate_delta_pct)
    const monthly   = computeMonthlyInterest(outstandingTry, newRate)
    const annual    = computeAnnualInterest(monthly)
    const impact    = round2(annual - baseAnnuali)

    return {
      scenario_name:            scenario.name,
      rate_delta_pct:           scenario.rate_delta_pct,
      new_rate_pct:             newRate,
      monthly_interest_try:     monthly,
      annual_interest_try:      annual,
      rate_change_impact_try:   impact,
    }
  })

  return {
    tranche_id:       trancheId,
    partner_id:       partnerId,
    partner_name:     partnerName,
    current_rate_pct: currentRatePct,
    outstanding_try:  outstandingTry,
    scenarios:        scenarioResults,
  }
}

/**
 * Aggregate portfolio sensitivity across all tranches.
 * Sums per-scenario metrics and computes incremental costs vs base.
 */
export function buildPortfolioSensitivity(
  trancheSensitivities: TrancheSensitivity[],
  scenarios: RateScenario[],
  priorNetIncomeTry?: number,
  ebitdaTry?: number,
): PortfolioSensitivity {
  const totalOutstanding = round2(
    trancheSensitivities.reduce((s, t) => s + t.outstanding_try, 0),
  )

  const weightedAvgRate = computeWeightedAvgRate(
    trancheSensitivities.map(t => ({
      outstanding_try: t.outstanding_try,
      annual_rate_pct: t.current_rate_pct,
    })),
  )

  // Build per-scenario portfolio aggregates
  const scenarioAggregates = scenarios.map(scenario => {
    let totalAnnual  = 0
    let totalMonthly = 0

    for (const ts of trancheSensitivities) {
      const sr = ts.scenarios.find(s => s.scenario_name === scenario.name)
      if (sr) {
        totalAnnual  += sr.annual_interest_try
        totalMonthly += sr.monthly_interest_try
      }
    }

    totalAnnual  = round2(totalAnnual)
    totalMonthly = round2(totalMonthly)

    return {
      scenario_name:               scenario.name,
      rate_delta_pct:              scenario.rate_delta_pct,
      total_annual_interest_try:   totalAnnual,
      total_monthly_interest_try:  totalMonthly,
    }
  })

  // Find base scenario totals for incremental computation
  const baseAggregate = scenarioAggregates.find(s => s.rate_delta_pct === 0)
  const baseAnnual    = baseAggregate?.total_annual_interest_try ?? 0

  const portfolioScenarios = scenarioAggregates.map(agg => {
    const incremental = round2(agg.total_annual_interest_try - baseAnnual)

    const netIncomeImpactPct: number | null =
      priorNetIncomeTry !== undefined && priorNetIncomeTry !== 0
        ? round2((incremental / Math.abs(priorNetIncomeTry)) * 100)
        : null

    const dscrImpact: number | null =
      ebitdaTry !== undefined && agg.total_annual_interest_try > 0
        ? round2(ebitdaTry / agg.total_annual_interest_try)
        : null

    return {
      scenario_name:               agg.scenario_name,
      rate_delta_pct:              agg.rate_delta_pct,
      total_annual_interest_try:   agg.total_annual_interest_try,
      total_monthly_interest_try:  agg.total_monthly_interest_try,
      incremental_annual_cost_try: incremental,
      net_income_impact_pct:       netIncomeImpactPct,
      dscr_impact:                 dscrImpact,
    }
  })

  return {
    total_outstanding_try: totalOutstanding,
    weighted_avg_rate_pct: weightedAvgRate,
    scenarios:             portfolioScenarios,
  }
}

/**
 * Compute interest coverage ratio (ICR).
 * ICR = EBITDA / total annual interest
 * Returns null if annual_interest = 0 (no debt).
 */
export function computeInterestCoverageRatio(
  ebitda: number,
  totalAnnualInterest: number,
): number | null {
  if (totalAnnualInterest <= 0) return null
  return round2(ebitda / totalAnnualInterest)
}

/**
 * Classify interest coverage health based on ICR.
 * excellent: ≥ 5.0
 * good:      ≥ 3.0
 * adequate:  ≥ 2.0
 * thin:      ≥ 1.0
 * critical:  < 1.0
 * no_debt:   null coverage
 */
export function classifyInterestCoverageHealth(
  coverageRatio: number | null,
): 'excellent' | 'good' | 'adequate' | 'thin' | 'critical' | 'no_debt' {
  if (coverageRatio === null) return 'no_debt'
  if (coverageRatio >= 5.0) return 'excellent'
  if (coverageRatio >= 3.0) return 'good'
  if (coverageRatio >= 2.0) return 'adequate'
  if (coverageRatio >= 1.0) return 'thin'
  return 'critical'
}

/**
 * Identify break-even rate (rate at which net income = 0).
 * breakeven_rate = (prior_net_income + base_interest) / total_outstanding × 12 × 100
 * Returns null if outstanding = 0.
 */
export function computeBreakevenRate(
  priorNetIncomeTry: number,
  baseAnnualInterestTry: number,
  totalOutstandingTry: number,
): number | null {
  if (totalOutstandingTry <= 0) return null
  const maxAffordableAnnualInterest = priorNetIncomeTry + baseAnnualInterestTry
  // breakeven rate % = maxAffordableInterest / outstanding × 100
  return round2((maxAffordableAnnualInterest / totalOutstandingTry) * 100)
}

/**
 * Classify rate sensitivity risk based on headroom to breakeven.
 * headroom = (breakeven_rate - weighted_avg_rate) / weighted_avg_rate × 100
 * low_risk:  headroom > 50%
 * moderate:  headroom > 25%
 * elevated:  headroom > 10%
 * high_risk: headroom ≤ 10%
 * critical:  already at or above breakeven
 * no_debt:   no outstanding loans
 */
export function classifyRateSensitivityRisk(
  weightedAvgRate: number,
  breakevenRate: number | null,
  totalOutstanding: number,
): 'low_risk' | 'moderate' | 'elevated' | 'high_risk' | 'critical' | 'no_debt' {
  if (totalOutstanding <= 0) return 'no_debt'
  if (breakevenRate === null) return 'no_debt'
  if (weightedAvgRate <= 0) return 'no_debt'

  // If current rate already exceeds or equals breakeven, critical
  if (weightedAvgRate >= breakevenRate) return 'critical'

  const headroom = ((breakevenRate - weightedAvgRate) / weightedAvgRate) * 100

  if (headroom > 50) return 'low_risk'
  if (headroom > 25) return 'moderate'
  if (headroom > 10) return 'elevated'
  return 'high_risk'
}

// ── Service class ─────────────────────────────────────────────────────────────

export class InterestRateSensitivityService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<InterestRateSensitivityReport> {
    // Fetch active tranches
    const { data: trancheRows, error: trancheErr } = await this.supabase
      .from('partner_loan_tranches')
      .select('id, partner_id, principal_try, total_repaid_try, interest_rate_annual_pct, status')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .is('deleted_at', null)

    if (trancheErr) {
      throw new Error(`Tranş verisi alınamadı: ${trancheErr.message}`)
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

    // Try to fetch recent EBITDA / net income from financial data
    // We look at the last 12 months of income statement data
    const now       = new Date()
    const yearAgo   = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const fromDate  = yearAgo.toISOString().substring(0, 10)

    let priorNetIncomeTry: number | undefined
    let ebitdaTry:         number | undefined

    const { data: salesRows } = await this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .gte('invoice_date', fromDate)
      .is('deleted_at', null)

    const { data: expenseRows } = await this.supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .gte('expense_date', fromDate)
      .is('deleted_at', null)

    if (salesRows && expenseRows) {
      const totalRevenue  = (salesRows  as Array<{ total_try: number }>)
        .reduce((s, r) => s + (Number(r.total_try) || 0), 0)
      const totalExpenses = (expenseRows as Array<{ amount_try: number }>)
        .reduce((s, r) => s + (Number(r.amount_try) || 0), 0)
      priorNetIncomeTry = round2(totalRevenue - totalExpenses)
      // Use net income as proxy for EBITDA (simplified)
      ebitdaTry         = priorNetIncomeTry > 0 ? priorNetIncomeTry : undefined
    }

    // Build enriched tranche list
    interface EnrichedTranche {
      tranche_id:  string
      partner_id:  string
      partner_name: string
      outstanding_try: number
      annual_rate_pct: number
    }

    const enriched: EnrichedTranche[] = []

    for (const row of (trancheRows ?? [])) {
      const r           = row as Record<string, unknown>
      const principal   = Number(r.principal_try)    || 0
      const repaid      = Number(r.total_repaid_try)  || 0
      const outstanding = round2(principal - repaid)
      if (outstanding <= 0) continue

      const rateRaw   = r.interest_rate_annual_pct != null ? Number(r.interest_rate_annual_pct) : 0
      const annualRate = isNaN(rateRaw) ? 0 : rateRaw

      enriched.push({
        tranche_id:   r.id as string,
        partner_id:   r.partner_id as string,
        partner_name: partnerNameMap.get(r.partner_id as string) ?? 'Ortak',
        outstanding_try: outstanding,
        annual_rate_pct: annualRate,
      })
    }

    // Build tranche sensitivities
    const trancheSensitivities: TrancheSensitivity[] = enriched.map(t =>
      buildTrancheSensitivity(
        t.tranche_id,
        t.partner_id,
        t.partner_name,
        t.outstanding_try,
        t.annual_rate_pct,
        STANDARD_SCENARIOS,
      ),
    )

    // Build portfolio sensitivity
    const portfolioSensitivity = buildPortfolioSensitivity(
      trancheSensitivities,
      STANDARD_SCENARIOS,
      priorNetIncomeTry,
      ebitdaTry,
    )

    // Aggregates
    const totalOutstanding = portfolioSensitivity.total_outstanding_try
    const weightedAvgRate  = portfolioSensitivity.weighted_avg_rate_pct

    // Base scenario interest (delta = 0)
    const baseScenarioPortfolio = portfolioSensitivity.scenarios.find(
      s => s.rate_delta_pct === 0,
    )
    const baseAnnualInterest  = baseScenarioPortfolio?.total_annual_interest_try  ?? 0
    const baseMonthlyInterest = baseScenarioPortfolio?.total_monthly_interest_try ?? 0

    // Interest coverage
    const icr = ebitdaTry !== undefined
      ? computeInterestCoverageRatio(ebitdaTry, baseAnnualInterest)
      : null
    const icrHealth = classifyInterestCoverageHealth(icr)

    // Breakeven rate
    const breakevenRate = priorNetIncomeTry !== undefined
      ? computeBreakevenRate(priorNetIncomeTry, baseAnnualInterest, totalOutstanding)
      : null

    const sensitivityRisk = classifyRateSensitivityRisk(
      weightedAvgRate,
      breakevenRate,
      totalOutstanding,
    )

    return {
      total_outstanding_try:     totalOutstanding,
      weighted_avg_rate_pct:     weightedAvgRate,
      base_annual_interest_try:  baseAnnualInterest,
      base_monthly_interest_try: baseMonthlyInterest,
      interest_coverage_ratio:   icr,
      interest_coverage_health:  icrHealth,
      breakeven_rate_pct:        breakevenRate,
      rate_sensitivity_risk:     sensitivityRisk,
      tranche_sensitivities:     trancheSensitivities,
      portfolio_sensitivity:     portfolioSensitivity,
    }
  }
}
