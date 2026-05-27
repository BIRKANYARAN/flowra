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

// ── DB service ────────────────────────────────────────────────────────────────

export const ScenarioComparisonService = {
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
