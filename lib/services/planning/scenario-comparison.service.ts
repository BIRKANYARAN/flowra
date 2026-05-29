// ─────────────────────────────────────────────────────────────────────────────
// Scenario Comparison Engine
// Computes side-by-side metrics for saved simulation scenarios.
//
// Table: simulation_scenarios
//   id, name, inputs (JSONB), summary (JSONB), monthly_breakdown (JSONB),
//   is_baseline, created_at, tags
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScenarioMetric {
  key:              string
  label:            string           // Turkish
  unit:             'TRY' | '%' | 'ay' | 'x'
  higher_is_better: boolean
}

export interface ScenarioComparisonRow {
  metric_key:       string
  values:           Record<string, number | null>   // scenario_id → value
  best_scenario_id: string | null
  baseline_deltas:  Record<string, number | null>   // delta vs baseline; null if no baseline
}

export interface ScenarioSnapshot {
  id:               string
  name:             string
  is_baseline:      boolean
  created_at:       string
  tags:             string[]
  // Key metrics extracted from summary JSONB
  projected_revenue_12m:   number | null
  projected_net_income:    number | null
  breakeven_month:         number | null   // month index (1-12) or null
  runway_months:           number | null
  debt_clearance_month:    number | null
  peak_dsr:                number | null
  implied_cagr_pct:        number | null
}

export interface ScenarioComparisonReport {
  company_id:               string
  scenarios:                ScenarioSnapshot[]
  baseline_id:              string | null
  comparison_rows:          ScenarioComparisonRow[]
  recommended_scenario_id:  string | null
  recommendation_reason:    string    // Turkish
  computed_at:              string
}

// ── Metric definitions ────────────────────────────────────────────────────────

export const COMPARISON_METRICS: ScenarioMetric[] = [
  { key: 'projected_revenue_12m',  label: '12 Ay Tahmini Gelir',       unit: 'TRY', higher_is_better: true  },
  { key: 'projected_net_income',   label: 'Tahmini Net Kâr',            unit: 'TRY', higher_is_better: true  },
  { key: 'breakeven_month',        label: 'Başabaş Ayı',                unit: 'ay',  higher_is_better: false },
  { key: 'runway_months',          label: 'Nakit Pisti (ay)',            unit: 'ay',  higher_is_better: true  },
  { key: 'peak_dsr',               label: 'Maks. Borç Servis Oranı',    unit: 'x',   higher_is_better: false },
  { key: 'implied_cagr_pct',       label: 'İma Edilen YBBO',            unit: '%',   higher_is_better: true  },
]

// ── Pure helper functions ─────────────────────────────────────────────────────

/**
 * Safe extraction of metrics from a scenario's summary JSONB.
 * Returns partial ScenarioSnapshot fields without throwing on malformed data.
 */
export function extractMetricsFromSummary(
  summary: Record<string, unknown> | null,
): Partial<ScenarioSnapshot> {
  if (!summary || typeof summary !== 'object') return {}

  function num(v: unknown): number | null {
    if (v === null || v === undefined) return null
    const n = Number(v)
    return isFinite(n) ? n : null
  }

  function posInt(v: unknown): number | null {
    const n = num(v)
    return n !== null && n >= 1 ? Math.round(n) : null
  }

  // Extract monthly_revenues if present for CAGR
  const monthlyRevs = summary['monthly_revenues']
  let month1Rev: number | null = null
  let month12Rev: number | null = null
  if (Array.isArray(monthlyRevs) && monthlyRevs.length >= 12) {
    month1Rev  = num(monthlyRevs[0])
    month12Rev = num(monthlyRevs[11])
  } else if (Array.isArray(monthlyRevs) && monthlyRevs.length >= 2) {
    month1Rev  = num(monthlyRevs[0])
    month12Rev = num(monthlyRevs[monthlyRevs.length - 1])
  }

  const totalRevenue = num(summary['total_revenue'] ?? summary['projected_revenue_12m'] ?? summary['revenue_12m'])
  const netIncome    = num(summary['total_net_income'] ?? summary['net_income'] ?? summary['projected_net_income'])
  const runway       = num(summary['runway_months'] ?? summary['cash_runway_months'])
  const peakDsr      = num(summary['peak_dsr'] ?? summary['avg_dsr'] ?? summary['max_dsr'])
  const breakevenM   = posInt(summary['breakeven_month'])
  const debtClear    = posInt(summary['debt_clearance_month'])

  const cagr = computeImpliedCagr(month1Rev, month12Rev)

  return {
    projected_revenue_12m:  totalRevenue,
    projected_net_income:   netIncome,
    breakeven_month:        breakevenM,
    runway_months:          runway,
    debt_clearance_month:   debtClear,
    peak_dsr:               peakDsr,
    implied_cagr_pct:       cagr,
  }
}

/**
 * Given a list of scenario IDs and their metric values, find the best scenario.
 * Null values are excluded from consideration.
 */
export function findBestScenario(
  scenarioIds: string[],
  values:      Record<string, number | null>,
  higherIsBetter: boolean,
): string | null {
  if (scenarioIds.length === 0) return null

  let bestId:    string | null = null
  let bestValue: number | null = null

  for (const id of scenarioIds) {
    const v = values[id] ?? null
    if (v === null) continue
    if (
      bestValue === null ||
      (higherIsBetter ? v > bestValue : v < bestValue)
    ) {
      bestValue = v
      bestId    = id
    }
  }

  return bestId
}

/**
 * Compute delta of value vs baseline as a percentage.
 * Returns null if either is missing, or baseline is 0 (avoid div-by-zero).
 */
export function computeBaselineDelta(
  value:         number | null,
  baselineValue: number | null,
): number | null {
  if (value === null || baselineValue === null) return null
  if (baselineValue === 0) return null
  return ((value - baselineValue) / Math.abs(baselineValue)) * 100
}

/**
 * Compute implied annual CAGR from month 1 to month 12 projected revenue.
 * Formula: (m12 / m1)^(1/1) − 1  (12 months = 1 year; so exponent = 1)
 * Returns percentage (e.g., 21 for 21%), or null if inputs invalid.
 */
export function computeImpliedCagr(
  month1Revenue:  number | null,
  month12Revenue: number | null,
): number | null {
  if (month1Revenue === null || month12Revenue === null) return null
  if (month1Revenue === 0) return null
  // 12 months = 1 year, so CAGR = (end/start)^(1/1) − 1
  const ratio = month12Revenue / month1Revenue
  if (ratio <= 0) return null
  // Use (ratio)^(12/12) - 1 = ratio - 1
  return (ratio - 1) * 100
}

/**
 * Build a Turkish recommendation reason string for the recommended scenario.
 */
export function buildRecommendationReason(
  scenario:     ScenarioSnapshot | null,
  allScenarios: ScenarioSnapshot[],
): string {
  if (!scenario) {
    if (allScenarios.length === 0) {
      return 'Karşılaştırma için senaryo bulunamadı.'
    }
    return 'Hiçbir senaryo baskın değil — tüm senaryolar yüksek risk içeriyor. En iyi net kârlı senaryo gösterilmektedir.'
  }

  const parts: string[] = []
  parts.push(`"${scenario.name}" senaryosu önerilmektedir.`)

  if (scenario.projected_net_income !== null && scenario.projected_net_income > 0) {
    parts.push(`12 aylık net kâr tahmini ₺${Math.round(scenario.projected_net_income).toLocaleString('tr-TR')} ile en yüksek.`)
  }

  if (scenario.runway_months !== null && scenario.runway_months > 6) {
    parts.push(`Nakit pisti ${Math.round(scenario.runway_months)} ay ile yeterli.`)
  }

  if (scenario.peak_dsr !== null && scenario.peak_dsr < 0.7) {
    parts.push(`Maks. borç servis oranı ${(scenario.peak_dsr * 100).toFixed(0)}% ile kontrol altında.`)
  }

  if (scenario.implied_cagr_pct !== null) {
    parts.push(`İma edilen yıllık büyüme: %${scenario.implied_cagr_pct.toFixed(1)}.`)
  }

  return parts.join(' ')
}

// ── Core report builder ───────────────────────────────────────────────────────

/**
 * Build ScenarioSnapshot from a DB row.
 * Merges DB-level fields with extracted summary metrics.
 */
function rowToSnapshot(row: {
  id:               string
  name:             string
  is_baseline:      boolean | null
  created_at:       string
  tags:             unknown
  summary:          Record<string, unknown> | null
  monthly_breakdown?: unknown[] | null
}): ScenarioSnapshot {
  const extracted = extractMetricsFromSummary(row.summary)

  // Also try to compute CAGR from monthly_breakdown if not in summary
  let impliedCagr = extracted.implied_cagr_pct ?? null
  if (impliedCagr === null && Array.isArray(row.monthly_breakdown) && row.monthly_breakdown.length >= 12) {
    const m1  = (row.monthly_breakdown[0]  as Record<string, unknown>)?.revenue
    const m12 = (row.monthly_breakdown[11] as Record<string, unknown>)?.revenue
    impliedCagr = computeImpliedCagr(
      m1 != null ? Number(m1) : null,
      m12 != null ? Number(m12) : null,
    )
  }

  return {
    id:                    row.id,
    name:                  row.name,
    is_baseline:           row.is_baseline ?? false,
    created_at:            row.created_at,
    tags:                  Array.isArray(row.tags) ? (row.tags as string[]) : [],
    projected_revenue_12m: extracted.projected_revenue_12m ?? null,
    projected_net_income:  extracted.projected_net_income  ?? null,
    breakeven_month:       extracted.breakeven_month       ?? null,
    runway_months:         extracted.runway_months         ?? null,
    debt_clearance_month:  extracted.debt_clearance_month  ?? null,
    peak_dsr:              extracted.peak_dsr              ?? null,
    implied_cagr_pct:      impliedCagr,
  }
}

/**
 * Find the recommended scenario:
 *   - Candidates: runway_months > 6 AND peak_dsr < 0.7
 *   - If no candidates: pick max net_income from all
 *   - Returns { id, reason }
 */
function selectRecommendation(scenarios: ScenarioSnapshot[]): {
  id:     string | null
  reason: string
} {
  if (scenarios.length === 0) {
    return { id: null, reason: 'Karşılaştırma için senaryo bulunamadı.' }
  }

  const candidates = scenarios.filter(
    s =>
      (s.runway_months !== null ? s.runway_months > 6 : true) &&
      (s.peak_dsr      !== null ? s.peak_dsr      < 0.7 : true),
  )

  const pool = candidates.length > 0 ? candidates : scenarios

  // Pick max net income from pool
  let best: ScenarioSnapshot | null = null
  for (const s of pool) {
    if (
      best === null ||
      (s.projected_net_income !== null &&
        (best.projected_net_income === null ||
          s.projected_net_income > best.projected_net_income))
    ) {
      best = s
    }
  }

  const noDominant = candidates.length === 0
  return {
    id:     best?.id ?? null,
    reason: buildRecommendationReason(
      best,
      scenarios,
    ) + (noDominant ? '' : ''),
  }
}

/**
 * Build the full ScenarioComparisonReport from a list of snapshots.
 * Pure — no DB calls, fully testable.
 */
export function buildComparisonReport(
  companyId: string,
  snapshots: ScenarioSnapshot[],
): ScenarioComparisonReport {
  const baseline   = snapshots.find(s => s.is_baseline) ?? null
  const baselineId = baseline?.id ?? null

  const scenarioIds = snapshots.map(s => s.id)

  const comparisonRows: ScenarioComparisonRow[] = COMPARISON_METRICS.map(metric => {
    const values: Record<string, number | null> = {}
    for (const s of snapshots) {
      values[s.id] = ((s as unknown) as Record<string, number | null>)[metric.key] ?? null
    }

    const bestId = findBestScenario(scenarioIds, values, metric.higher_is_better)

    const baselineDeltas: Record<string, number | null> = {}
    if (baselineId) {
      const baseVal = values[baselineId] ?? null
      for (const id of scenarioIds) {
        baselineDeltas[id] = id === baselineId
          ? null
          : computeBaselineDelta(values[id] ?? null, baseVal)
      }
    }

    return {
      metric_key:       metric.key,
      values,
      best_scenario_id: bestId,
      baseline_deltas:  baselineDeltas,
    }
  })

  const { id: recommendedId, reason } = selectRecommendation(snapshots)

  return {
    company_id:              companyId,
    scenarios:               snapshots,
    baseline_id:             baselineId,
    comparison_rows:         comparisonRows,
    recommended_scenario_id: recommendedId,
    recommendation_reason:   reason,
    computed_at:             new Date().toISOString(),
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// NEW EXPORTS: Multi-Scenario Comparison Engine
// ScenarioSummary, rank/recommend/delta/risk functions, ScenarioComparisonService class
// ═════════════════════════════════════════════════════════════════════════════

// ── ScenarioSummary ──────────────────────────────────────────────────────────

export interface ScenarioSummary {
  id:                   string
  name:                 string
  total_revenue:        number
  total_net_income:     number
  net_margin_pct:       number | null
  runway_months:        number | null
  break_even_month:     number | null
  peak_cash:            number
  min_cash:             number
  debt_clearance_month: number | null
  is_baseline:          boolean
}

// ── computeScenarioRank ───────────────────────────────────────────────────────

/**
 * Rank a scenario among all scenarios. Rank 1 = best.
 *
 * Composite score weights:
 *   revenue:  descending sort × 0.25
 *   margin:   descending sort × 0.30
 *   runway:   descending sort × 0.25
 *   risk:     ascending min_cash (higher = less risk) × 0.20
 *
 * Returns 1-indexed rank from 1 to N.
 */
export function computeScenarioRank(
  scenario:     ScenarioSummary,
  allScenarios: ScenarioSummary[],
): number {
  const n = allScenarios.length
  if (n === 0) return 1

  // Build sorted indices for each dimension (descending = higher is better, position 0 = best)
  const byRevenue = [...allScenarios].sort((a, b) => b.total_revenue - a.total_revenue)
  const byMargin  = [...allScenarios].sort((a, b) => {
    const ma = a.net_margin_pct ?? -Infinity
    const mb = b.net_margin_pct ?? -Infinity
    return mb - ma
  })
  const byRunway  = [...allScenarios].sort((a, b) => {
    const ra = a.runway_months ?? -Infinity
    const rb = b.runway_months ?? -Infinity
    return rb - ra
  })
  const byRisk    = [...allScenarios].sort((a, b) => b.min_cash - a.min_cash)

  // 1-indexed positions
  const revPos     = byRevenue.findIndex(s => s.id === scenario.id) + 1
  const marginPos  = byMargin.findIndex(s  => s.id === scenario.id) + 1
  const runwayPos  = byRunway.findIndex(s  => s.id === scenario.id) + 1
  const riskPos    = byRisk.findIndex(s    => s.id === scenario.id) + 1

  const compositeScore =
    revPos    * 0.25 +
    marginPos * 0.30 +
    runwayPos * 0.25 +
    riskPos   * 0.20

  // Rank all scenarios by composite score, then find this scenario's rank
  const scored = allScenarios.map(s => {
    const rp = byRevenue.findIndex(x => x.id === s.id) + 1
    const mp = byMargin.findIndex(x  => x.id === s.id) + 1
    const wp = byRunway.findIndex(x  => x.id === s.id) + 1
    const kp = byRisk.findIndex(x    => x.id === s.id) + 1
    return { id: s.id, score: rp * 0.25 + mp * 0.30 + wp * 0.25 + kp * 0.20 }
  }).sort((a, b) => a.score - b.score)

  void compositeScore // suppress unused warning — used indirectly via scored
  return scored.findIndex(s => s.id === scenario.id) + 1
}

// ── recommendScenario ─────────────────────────────────────────────────────────

/**
 * Returns the ID of the recommended scenario, or null if empty.
 *
 * Logic:
 *   1. Filter: runway_months >= 6 AND min_cash >= 0  (solvent scenarios only)
 *   2. Among solvent: pick highest net_margin_pct
 *   3. If no solvent: pick highest min_cash  (least bad)
 *   4. Tie-break: pick highest total_revenue
 */
export function recommendScenario(scenarios: ScenarioSummary[]): string | null {
  if (scenarios.length === 0) return null

  const solvent = scenarios.filter(
    s =>
      (s.runway_months === null || s.runway_months >= 6) &&
      s.min_cash >= 0,
  )

  const pool = solvent.length > 0 ? solvent : scenarios

  // Compare function: among pool, prefer higher margin; tie-break by revenue
  const best = pool.reduce<ScenarioSummary | null>((acc, s) => {
    if (acc === null) return s

    if (solvent.length > 0) {
      // Solvent path: maximize net_margin_pct
      const aMargin = acc.net_margin_pct ?? -Infinity
      const sMargin = s.net_margin_pct   ?? -Infinity
      if (sMargin > aMargin) return s
      if (sMargin === aMargin && s.total_revenue > acc.total_revenue) return s
      return acc
    } else {
      // Insolvent path: maximize min_cash
      if (s.min_cash > acc.min_cash) return s
      if (s.min_cash === acc.min_cash && s.total_revenue > acc.total_revenue) return s
      return acc
    }
  }, null)

  return best?.id ?? null
}

// ── computeScenarioDelta ──────────────────────────────────────────────────────

/**
 * Compute delta between a comparison scenario and a baseline.
 */
export function computeScenarioDelta(
  baseline:   ScenarioSummary,
  comparison: ScenarioSummary,
): {
  revenue_delta:         number
  revenue_delta_pct:     number | null
  net_income_delta:      number
  net_income_delta_pct:  number | null
  runway_delta_months:   number | null
  is_revenue_better:     boolean
  is_margin_better:      boolean
  is_runway_better:      boolean
} {
  const revenue_delta     = comparison.total_revenue    - baseline.total_revenue
  const net_income_delta  = comparison.total_net_income - baseline.total_net_income

  const revenue_delta_pct = baseline.total_revenue !== 0
    ? ((revenue_delta / Math.abs(baseline.total_revenue)) * 100)
    : null

  const net_income_delta_pct = baseline.total_net_income !== 0
    ? ((net_income_delta / Math.abs(baseline.total_net_income)) * 100)
    : null

  const runway_delta_months =
    comparison.runway_months !== null && baseline.runway_months !== null
      ? comparison.runway_months - baseline.runway_months
      : null

  const compMargin  = comparison.net_margin_pct ?? null
  const baseMargin  = baseline.net_margin_pct   ?? null
  const is_margin_better =
    compMargin !== null && baseMargin !== null
      ? compMargin > baseMargin
      : false

  return {
    revenue_delta,
    revenue_delta_pct,
    net_income_delta,
    net_income_delta_pct,
    runway_delta_months,
    is_revenue_better: revenue_delta > 0,
    is_margin_better,
    is_runway_better:  runway_delta_months !== null ? runway_delta_months > 0 : false,
  }
}

// ── computeRiskAdjustedReturn ─────────────────────────────────────────────────

/**
 * Risk-adjusted return.
 *   = (netIncome / max(1, totalCapital)) × max(0.1, 1 + minCash / max(1, totalCapital))
 *
 * Returns null when totalCapital === 0.
 */
export function computeRiskAdjustedReturn(
  netIncome:    number,
  minCash:      number,
  totalCapital: number,
): number | null {
  if (totalCapital === 0) return null
  const capital     = Math.max(1, totalCapital)
  const baseReturn  = netIncome / capital
  const penalty     = Math.max(0.1, 1 + minCash / capital)
  return baseReturn * penalty
}

// ── classifyScenarioRisk ──────────────────────────────────────────────────────

/**
 * Classify scenario risk level based on min cash and runway.
 *
 *   critical:  minCash < 0 OR runwayMonths < 3
 *   high:      minCash < 50_000 OR runwayMonths < 6
 *   moderate:  minCash < 200_000 OR runwayMonths < 12
 *   low:       else
 */
export function classifyScenarioRisk(
  minCash:      number,
  runwayMonths: number | null,
): 'low' | 'moderate' | 'high' | 'critical' {
  if (minCash < 0 || (runwayMonths !== null && runwayMonths < 3)) return 'critical'
  if (minCash < 50_000 || (runwayMonths !== null && runwayMonths < 6)) return 'high'
  if (minCash < 200_000 || (runwayMonths !== null && runwayMonths < 12)) return 'moderate'
  return 'low'
}

// ── ScenarioComparisonService class ──────────────────────────────────────────

type RiskLevel = ReturnType<typeof classifyScenarioRisk>
type DeltaResult = ReturnType<typeof computeScenarioDelta>

export class ScenarioComparisonService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Build a full multi-scenario comparison report.
   */
  async getReport(
    companyId:   string,
    scenarioIds?: string[],
  ): Promise<{
    scenarios: Array<{
      scenario:           ScenarioSummary
      rank:               number
      risk:               RiskLevel
      is_recommended:     boolean
      delta_from_baseline: DeltaResult | null
    }>
    recommended_id: string | null
    baseline_id:    string | null
    comparison_axes: {
      best_revenue_scenario: string | null
      best_margin_scenario:  string | null
      best_runway_scenario:  string | null
      safest_scenario:       string | null
    }
  }> {
    // ── Fetch scenarios from DB ────────────────────────────────────────────────
    let query = this.supabase
      .from('simulation_scenarios')
      .select('id, name, summary, monthly_breakdown, is_baseline, created_at, updated_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('is_baseline', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(5)

    if (scenarioIds && scenarioIds.length > 0) {
      query = this.supabase
        .from('simulation_scenarios')
        .select('id, name, summary, monthly_breakdown, is_baseline, created_at, updated_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('id', scenarioIds.slice(0, 5))
        .order('is_baseline', { ascending: false })
        .order('updated_at', { ascending: false })
    }

    const { data, error } = await query
    if (error) throw new Error(`[ScenarioComparisonService] DB error: ${error.message}`)

    const rows = (data ?? []) as Array<{
      id:                string
      name:              string
      summary:           Record<string, unknown> | null
      monthly_breakdown: unknown[] | null
      is_baseline:       boolean | null
      created_at:        string
      updated_at:        string
    }>

    // ── Build ScenarioSummary from each row ───────────────────────────────────
    const summaries: ScenarioSummary[] = rows.map(row => {
      const s = row.summary ?? {}

      function num(v: unknown): number {
        const n = Number(v)
        return isFinite(n) ? n : 0
      }
      function numOrNull(v: unknown): number | null {
        if (v === null || v === undefined) return null
        const n = Number(v)
        return isFinite(n) ? n : null
      }

      const totalRevenue   = num(s['total_revenue_try'] ?? s['total_revenue'] ?? s['projected_revenue_12m'])
      const totalNetIncome = num(s['net_income_try']    ?? s['total_net_income'] ?? s['net_income'])

      const netMarginPct: number | null =
        totalRevenue > 0
          ? numOrNull(s['net_margin_pct']) ?? ((totalNetIncome / totalRevenue) * 100)
          : numOrNull(s['net_margin_pct'])

      // Compute min/peak cash from monthly_breakdown or summary
      let peakCash = num(s['peak_cash_try'] ?? s['peak_cash'])
      let minCash  = num(s['min_cash_try']  ?? s['min_cash'])

      if (Array.isArray(row.monthly_breakdown) && row.monthly_breakdown.length > 0) {
        const cashValues: number[] = []
        for (const entry of row.monthly_breakdown as Record<string, unknown>[]) {
          const cv = entry['cash'] ?? entry['cash_balance'] ?? entry['cash_try'] ?? entry['closing_cash']
          if (cv !== undefined && cv !== null) {
            const n = Number(cv)
            if (isFinite(n)) cashValues.push(n)
          }
        }
        if (cashValues.length > 0) {
          peakCash = Math.max(...cashValues)
          minCash  = Math.min(...cashValues)
        }
      }

      return {
        id:                   row.id,
        name:                 row.name,
        total_revenue:        totalRevenue,
        total_net_income:     totalNetIncome,
        net_margin_pct:       netMarginPct,
        runway_months:        numOrNull(s['runway_months'] ?? s['cash_runway_months']),
        break_even_month:     numOrNull(s['break_even_month'] ?? s['breakeven_month']),
        peak_cash:            peakCash,
        min_cash:             minCash,
        debt_clearance_month: numOrNull(s['debt_clearance_month']),
        is_baseline:          row.is_baseline ?? false,
      }
    })

    // ── Compute derived fields ────────────────────────────────────────────────
    const recommendedId = recommendScenario(summaries)
    const baseline      = summaries.find(s => s.is_baseline) ?? null
    const baselineId    = baseline?.id ?? null

    const result = summaries.map(s => ({
      scenario:            s,
      rank:                computeScenarioRank(s, summaries),
      risk:                classifyScenarioRisk(s.min_cash, s.runway_months),
      is_recommended:      s.id === recommendedId,
      delta_from_baseline: baseline && s.id !== baselineId
        ? computeScenarioDelta(baseline, s)
        : null,
    }))

    // ── Comparison axes ───────────────────────────────────────────────────────
    const bestRevenue = summaries.reduce<ScenarioSummary | null>(
      (acc, s) => (acc === null || s.total_revenue > acc.total_revenue) ? s : acc, null,
    )
    const bestMargin = summaries.reduce<ScenarioSummary | null>((acc, s) => {
      const am = acc?.net_margin_pct ?? -Infinity
      const sm = s.net_margin_pct    ?? -Infinity
      return sm > am ? s : acc
    }, null)
    const bestRunway = summaries.reduce<ScenarioSummary | null>((acc, s) => {
      const ar = acc?.runway_months ?? -Infinity
      const sr = s.runway_months    ?? -Infinity
      return sr > ar ? s : acc
    }, null)
    const safest = summaries.reduce<ScenarioSummary | null>(
      (acc, s) => (acc === null || s.min_cash > acc.min_cash) ? s : acc, null,
    )

    return {
      scenarios:       result,
      recommended_id:  recommendedId,
      baseline_id:     baselineId,
      comparison_axes: {
        best_revenue_scenario: bestRevenue?.id ?? null,
        best_margin_scenario:  bestMargin?.id  ?? null,
        best_runway_scenario:  bestRunway?.id  ?? null,
        safest_scenario:       safest?.id      ?? null,
      },
    }
  }
}

// ── Original object-style DB service (used by existing route) ────────────────

export const ScenarioComparisonServiceLegacy = {
  /**
   * Load scenarios from DB and build comparison report.
   * @param companyId  Company UUID
   * @param supabase   Authenticated Supabase client
   * @param ids        Optional list of specific scenario IDs to compare
   * @param max        Maximum number of scenarios (default 5)
   */
  async getReport(
    companyId: string,
    supabase:  SupabaseClient,
    ids?:      string[],
    max = 5,
  ): Promise<ScenarioComparisonReport> {
    let query = supabase
      .from('simulation_scenarios')
      .select('id, name, inputs, summary, monthly_breakdown, is_baseline, created_at, tags')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('is_baseline', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(max)

    if (ids && ids.length > 0) {
      query = (supabase
        .from('simulation_scenarios')
        .select('id, name, inputs, summary, monthly_breakdown, is_baseline, created_at, tags')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('id', ids.slice(0, max))
        .order('is_baseline', { ascending: false })
        .order('updated_at', { ascending: false })) as typeof query
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`[scenario-comparison] DB error: ${error.message}`)
    }

    const snapshots = (data ?? []).map(row => rowToSnapshot(row as Parameters<typeof rowToSnapshot>[0]))

    return buildComparisonReport(companyId, snapshots)
  },
}
