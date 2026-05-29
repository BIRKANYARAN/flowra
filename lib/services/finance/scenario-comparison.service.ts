// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/scenario-comparison.service.ts
//
// Scenario Comparison Engine
//
// Side-by-side analysis of up to 5 planning scenarios with recommendation
// logic, risk classification, and deterministic Turkish narrative generation.
//
// Pure functions exported for testing:
//   computeGrossProfitMarginPct    — gross margin %
//   computeNetMarginPct            — net margin %
//   computeEbitdaMarginPct         — EBITDA margin %
//   computeDeltaPct                — % change between two values
//   computeRunwayFromCashFlow      — months until cash < 0
//   computeBreakevenMonth          — first month cumulative profit >= 0
//   computeSensitivityImpact       — metric × factor × elasticity
//   classifyScenarioRisk           — low / moderate / high / very_high
//   selectRecommendedScenario      — weighted score recommendation
//   computeComparisonMatrix        — scenario vs baseline comparisons
//   rankScenariosByMetric          — sorted by given metric DESC
//   computeScenarioSpread          — min/max/range/CV across scenarios
//   generateComparisonNarrative    — Turkish deterministic text
//   buildScenarioMetricsFromSummary — construct ScenarioMetrics from summary
//
// Class: ScenarioComparisonService
//   getComparison(companyId, scenarioIds?)  → ScenarioComparisonReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScenarioMetrics {
  scenario_id: string
  scenario_name: string
  is_baseline: boolean
  total_revenue: number
  total_cogs: number
  gross_profit: number
  total_expenses: number
  ebitda: number
  net_income: number
  tax_amount: number
  ending_cash: number
  break_even_month: number | null   // 1-based, null if never
  runway_months: number | null      // months until cash < 0, null if never
  peak_cash: number
  min_cash: number
  gross_margin_pct: number | null
  net_margin_pct: number | null
  // From debt pressure if available:
  total_debt_service: number
  dscr_avg: number | null
}

export interface ScenarioComparison {
  scenario_a: ScenarioMetrics
  scenario_b: ScenarioMetrics
  revenue_delta_pct: number | null    // (b - a) / a × 100
  ebitda_delta_pct: number | null
  net_income_delta_pct: number | null
  cash_delta: number                  // ending_cash b - a
  runway_delta_months: number | null  // b.runway - a.runway
}

export interface ScenarioComparisonReport {
  scenarios: ScenarioMetrics[]
  comparison_matrix: ScenarioComparison[]
  recommended_scenario_id: string | null
  recommended_scenario_name: string | null
  scenario_spread: {
    net_income: ReturnType<typeof computeScenarioSpread>
    ending_cash: ReturnType<typeof computeScenarioSpread>
  }
  rankings: {
    by_profitability: ScenarioMetrics[]
    by_cash: ScenarioMetrics[]
    by_runway: ScenarioMetrics[]
  }
  narrative: string
  scenario_count: number
}

// ── Pure Functions ─────────────────────────────────────────────────────────────

/**
 * Gross profit margin %.
 * (revenue - cogs) / revenue × 100; null if revenue === 0
 */
export function computeGrossProfitMarginPct(
  revenue: number,
  cogs: number,
): number | null {
  if (revenue === 0) return null
  return ((revenue - cogs) / revenue) * 100
}

/**
 * Net margin %.
 * netIncome / revenue × 100; null if revenue === 0
 */
export function computeNetMarginPct(
  revenue: number,
  netIncome: number,
): number | null {
  if (revenue === 0) return null
  return (netIncome / revenue) * 100
}

/**
 * EBITDA margin %.
 * ebitda / revenue × 100; null if revenue === 0
 */
export function computeEbitdaMarginPct(
  revenue: number,
  ebitda: number,
): number | null {
  if (revenue === 0) return null
  return (ebitda / revenue) * 100
}

/**
 * % change from valueA to valueB.
 * (valueB - valueA) / |valueA| × 100; null if valueA === 0
 */
export function computeDeltaPct(
  valueA: number,
  valueB: number,
): number | null {
  if (valueA === 0) return null
  return ((valueB - valueA) / Math.abs(valueA)) * 100
}

/**
 * Months until running cash balance < 0.
 * Simulates cumulative from startingCash adding each monthly cash flow.
 * Returns 1-based month index of first negative balance, or null if never.
 */
export function computeRunwayFromCashFlow(
  startingCash: number,
  monthlyCashFlows: number[],
): number | null {
  let cumulative = startingCash
  for (let i = 0; i < monthlyCashFlows.length; i++) {
    cumulative += monthlyCashFlows[i]
    if (cumulative < 0) return i + 1
  }
  return null
}

/**
 * First month where cumulative profit >= 0 (1-based).
 * null if never within the provided array.
 */
export function computeBreakevenMonth(
  monthlyCumulativeProfit: number[],
): number | null {
  for (let i = 0; i < monthlyCumulativeProfit.length; i++) {
    if (monthlyCumulativeProfit[i] >= 0) return i + 1
  }
  return null
}

/**
 * Sensitivity impact.
 * baseMetric × sensitivityFactor × elasticity
 */
export function computeSensitivityImpact(
  baseMetric: number,
  sensitivityFactor: number,
  elasticity: number,
): number {
  return baseMetric * sensitivityFactor * elasticity
}

/**
 * Risk classification:
 * low:       runway > 12 AND dscr_avg >= 2 AND net_margin_pct >= 5
 * moderate:  runway > 6 AND dscr_avg >= 1.5 AND net_margin_pct >= 0
 * high:      runway > 3 OR (dscr_avg >= 1 AND net_margin_pct >= -10)
 * very_high: otherwise
 */
export function classifyScenarioRisk(
  metrics: ScenarioMetrics,
): 'low' | 'moderate' | 'high' | 'very_high' {
  const { runway_months, dscr_avg, net_margin_pct } = metrics

  // low
  if (
    runway_months !== null && runway_months > 12 &&
    dscr_avg !== null && dscr_avg >= 2 &&
    net_margin_pct !== null && net_margin_pct >= 5
  ) {
    return 'low'
  }

  // moderate
  if (
    runway_months !== null && runway_months > 6 &&
    dscr_avg !== null && dscr_avg >= 1.5 &&
    net_margin_pct !== null && net_margin_pct >= 0
  ) {
    return 'moderate'
  }

  // high
  if (
    (runway_months !== null && runway_months > 3) ||
    (dscr_avg !== null && dscr_avg >= 1 &&
     net_margin_pct !== null && net_margin_pct >= -10)
  ) {
    return 'high'
  }

  return 'very_high'
}

/**
 * Select scenario with best weighted score.
 * Weights: profitability (net_margin_pct), liquidity (runway_months), growth (total_revenue).
 * Each dimension normalized 0-1 across scenarios.
 * Returns scenario_id with highest score; null if empty.
 */
export function selectRecommendedScenario(
  scenarios: ScenarioMetrics[],
  priorities: { profitability: number; liquidity: number; growth: number },
): string | null {
  if (scenarios.length === 0) return null

  // Extract raw values
  const profitVals = scenarios.map(s => s.net_margin_pct ?? 0)
  const liquidVals = scenarios.map(s => s.runway_months ?? 0)
  const growthVals = scenarios.map(s => s.total_revenue)

  function normalize(vals: number[]): number[] {
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const range = max - min
    if (range === 0) return vals.map(() => 0)
    return vals.map(v => (v - min) / range)
  }

  const profitNorm  = normalize(profitVals)
  const liquidNorm  = normalize(liquidVals)
  const growthNorm  = normalize(growthVals)

  let bestScore = -Infinity
  let bestId: string | null = null

  for (let i = 0; i < scenarios.length; i++) {
    const score =
      priorities.profitability * profitNorm[i] +
      priorities.liquidity     * liquidNorm[i] +
      priorities.growth        * growthNorm[i]
    if (score > bestScore) {
      bestScore = score
      bestId = scenarios[i].scenario_id
    }
  }

  return bestId
}

/**
 * Compare each scenario against baseline (is_baseline = true).
 * If no baseline: compare against the first scenario.
 * Returns N-1 comparisons (or N if no baseline).
 */
export function computeComparisonMatrix(
  scenarios: ScenarioMetrics[],
): ScenarioComparison[] {
  if (scenarios.length === 0) return []

  const baselineIdx = scenarios.findIndex(s => s.is_baseline)
  const hasBaseline = baselineIdx !== -1

  const baseline = hasBaseline ? scenarios[baselineIdx] : scenarios[0]

  const comparisons: ScenarioComparison[] = []
  for (const s of scenarios) {
    if (hasBaseline && s.scenario_id === baseline.scenario_id) continue
    if (!hasBaseline && s.scenario_id === scenarios[0].scenario_id) continue

    comparisons.push({
      scenario_a: baseline,
      scenario_b: s,
      revenue_delta_pct:    computeDeltaPct(baseline.total_revenue, s.total_revenue),
      ebitda_delta_pct:     computeDeltaPct(baseline.ebitda, s.ebitda),
      net_income_delta_pct: computeDeltaPct(baseline.net_income, s.net_income),
      cash_delta:           s.ending_cash - baseline.ending_cash,
      runway_delta_months:
        s.runway_months !== null && baseline.runway_months !== null
          ? s.runway_months - baseline.runway_months
          : null,
    })
  }

  return comparisons
}

/**
 * Sort scenarios DESC by metric; null values last.
 */
export function rankScenariosByMetric(
  scenarios: ScenarioMetrics[],
  metric: keyof Pick<
    ScenarioMetrics,
    'net_income' | 'ebitda' | 'ending_cash' | 'runway_months' | 'gross_margin_pct'
  >,
): ScenarioMetrics[] {
  return [...scenarios].sort((a, b) => {
    const va = a[metric]
    const vb = b[metric]
    if (va === null && vb === null) return 0
    if (va === null) return 1   // nulls last
    if (vb === null) return -1  // nulls last
    return vb - va              // DESC
  })
}

/**
 * Min/max/range/CV across scenarios for a numeric metric.
 * Returns null if fewer than 2 scenarios.
 */
export function computeScenarioSpread(
  scenarios: ScenarioMetrics[],
  metric: keyof Pick<ScenarioMetrics, 'net_income' | 'ebitda' | 'ending_cash'>,
): { min: number; max: number; range: number; cv: number | null } | null {
  if (scenarios.length < 2) return null

  const vals = scenarios.map(s => s[metric] as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  let cv: number | null = null
  if (mean !== 0) {
    const variance = vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / vals.length
    const stddev = Math.sqrt(variance)
    cv = stddev / Math.abs(mean)
  }

  return { min, max, range, cv }
}

/**
 * Generate deterministic Turkish narrative.
 */
export function generateComparisonNarrative(
  scenarioCount: number,
  recommendedScenarioName: string | null,
  topMetric: 'profitability' | 'liquidity',
  riskLevels: Array<{ name: string; risk: string }>,
): string {
  const parts: string[] = []

  if (recommendedScenarioName) {
    parts.push(
      `${scenarioCount} senaryo karşılaştırıldı. ${recommendedScenarioName} en iyi risk/getiri dengesini sunuyor.`,
    )
  } else {
    parts.push('Senaryolar arasında belirleyici bir fark bulunamadı.')
  }

  for (const { name, risk } of riskLevels) {
    if (risk === 'very_high') {
      parts.push(`Dikkat: ${name} senaryosu yüksek risk barındırıyor.`)
    }
  }

  return parts.join(' ')
}

/**
 * Build ScenarioMetrics from a persisted summary object.
 * Derives gross_profit, ebitda, margins.
 * runway_months is null (not computable from summary alone).
 */
export function buildScenarioMetricsFromSummary(
  scenarioId: string,
  scenarioName: string,
  isBaseline: boolean,
  summary: {
    total_revenue?: number
    total_cogs?: number
    total_expenses?: number
    net_income?: number
    tax_amount?: number
    ending_cash?: number
    break_even_month?: number | null
    peak_cash?: number
    min_cash?: number
    total_debt_service?: number
    dscr_avg?: number | null
  },
): ScenarioMetrics {
  const total_revenue    = summary.total_revenue    ?? 0
  const total_cogs       = summary.total_cogs       ?? 0
  const total_expenses   = summary.total_expenses   ?? 0
  const net_income       = summary.net_income       ?? 0
  const tax_amount       = summary.tax_amount       ?? 0
  const ending_cash      = summary.ending_cash      ?? 0
  const peak_cash        = summary.peak_cash        ?? 0
  const min_cash         = summary.min_cash         ?? 0
  const total_debt_service = summary.total_debt_service ?? 0

  const gross_profit = total_revenue - total_cogs
  // ebitda = gross_profit - operating expenses (expenses excludes COGS)
  const ebitda = gross_profit - total_expenses

  const gross_margin_pct = computeGrossProfitMarginPct(total_revenue, total_cogs)
  const net_margin_pct   = computeNetMarginPct(total_revenue, net_income)

  return {
    scenario_id:      scenarioId,
    scenario_name:    scenarioName,
    is_baseline:      isBaseline,
    total_revenue,
    total_cogs,
    gross_profit,
    total_expenses,
    ebitda,
    net_income,
    tax_amount,
    ending_cash,
    break_even_month: summary.break_even_month ?? null,
    runway_months:    null,
    peak_cash,
    min_cash,
    gross_margin_pct,
    net_margin_pct,
    total_debt_service,
    dscr_avg: summary.dscr_avg ?? null,
  }
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class ScenarioComparisonService {
  constructor(private readonly supabase: AnyClient) {}

  async getComparison(
    companyId: string,
    scenarioIds?: string[],
  ): Promise<ScenarioComparisonReport> {
    // 1. Fetch saved or baseline scenarios (not deleted)
    let query = this.supabase
      .from('simulation_scenarios')
      .select('id, name, is_baseline, summary, monthly_breakdown, inputs')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_baseline.eq.true,status.eq.saved')

    const { data: rows, error } = await query

    if (error) throw new Error(`scenario-comparison: ${error.message}`)

    let scenarios: typeof rows = rows ?? []

    // 2. Filter to requested IDs (max 5)
    if (scenarioIds && scenarioIds.length > 0) {
      const ids = scenarioIds.slice(0, 5)
      scenarios = scenarios.filter((r: { id: string }) => ids.includes(r.id))
    } else {
      scenarios = scenarios.slice(0, 5)
    }

    // 3. Build ScenarioMetrics from each row
    const metrics: ScenarioMetrics[] = scenarios.map((row: {
      id: string
      name: string
      is_baseline: boolean
      summary: Record<string, unknown>
      monthly_breakdown: Array<Record<string, unknown>>
    }) => {
      const summary = (row.summary ?? {}) as {
        total_revenue?: number
        total_cogs?: number
        total_expenses?: number
        net_income?: number
        tax_amount?: number
        ending_cash?: number
        break_even_month?: number | null
        peak_cash?: number
        min_cash?: number
        total_debt_service?: number
        dscr_avg?: number | null
      }

      const monthlyBreakdown: Array<Record<string, unknown>> = Array.isArray(row.monthly_breakdown)
        ? row.monthly_breakdown
        : []

      // Compute runway from monthly cash flows if available
      const monthlyFlows = monthlyBreakdown.map(
        (m: Record<string, unknown>) => (typeof m['net_cash_flow'] === 'number' ? m['net_cash_flow'] : 0)
      )
      const startingCash = typeof summary.ending_cash === 'number' ? 0 : 0
      // Use monthly net cash flow array for runway
      const runway = monthlyFlows.length > 0
        ? computeRunwayFromCashFlow(summary.ending_cash ?? 0, monthlyFlows)
        : null

      const built = buildScenarioMetricsFromSummary(
        row.id,
        row.name,
        row.is_baseline ?? false,
        summary,
      )

      return { ...built, runway_months: runway }
    })

    // 4. Compute report components
    const compMatrix = computeComparisonMatrix(metrics)

    const recommendedId = selectRecommendedScenario(metrics, {
      profitability: 0.4,
      liquidity: 0.4,
      growth: 0.2,
    })

    const recommendedName = metrics.find(m => m.scenario_id === recommendedId)?.scenario_name ?? null

    const riskLevels = metrics.map(m => ({
      name: m.scenario_name,
      risk: classifyScenarioRisk(m),
    }))

    const topMetric: 'profitability' | 'liquidity' = 'profitability'

    const narrative = generateComparisonNarrative(
      metrics.length,
      recommendedName,
      topMetric,
      riskLevels,
    )

    return {
      scenarios:                 metrics,
      comparison_matrix:         compMatrix,
      recommended_scenario_id:   recommendedId,
      recommended_scenario_name: recommendedName,
      scenario_spread: {
        net_income:   computeScenarioSpread(metrics, 'net_income'),
        ending_cash:  computeScenarioSpread(metrics, 'ending_cash'),
      },
      rankings: {
        by_profitability: rankScenariosByMetric(metrics, 'net_income'),
        by_cash:          rankScenariosByMetric(metrics, 'ending_cash'),
        by_runway:        rankScenariosByMetric(metrics, 'runway_months'),
      },
      narrative,
      scenario_count: metrics.length,
    }
  }
}
