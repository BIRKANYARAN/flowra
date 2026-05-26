// ══════════════════════════════════════════════════════════════════════════════
// lib/services/planning/scenario-variance.service.ts
//
// Scenario ↔ Actuals Bridge
//
// Compares saved what-if simulation scenarios against actual financial results
// for the period the scenario was created in. Makes planning accountability
// visible: "what we planned" vs "what happened."
//
// Architecture:
//   Pure kernel   computeVariance(projected, actuals, today, periodTo)
//     • No DB, no I/O — fully deterministic, fully testable.
//
//   DB-bound      ScenarioVarianceService.compareAll / compareScenario
//     • Reads simulation_scenarios table for saved scenarios.
//     • Reads FinanceService.getFinancialSummary() for actuals.
//     • Calls pure kernel for each scenario.
//
// Stored scenario shape (from WhatIfClient — what is persisted to DB):
//   inputs.sliders = { revChange, expChange, cogsChange, collDelay, debtChange, taxRateOverride }
//   summary        = { netIncome, grossMarginPct, distributable, runwayMonths }
//
// Important limitation: the summary only stores netIncome + grossMarginPct.
// Full revenue/expenses/cogs are NOT stored. The variance is therefore computed
// primarily from net_income, with gross_margin_pct used for qualitative context.
//
// The period for a scenario is derived from created_at (month the scenario was
// run in). This is the most reasonable approach since no explicit period is
// stored. The scenario represents "what we planned for that month."
// ══════════════════════════════════════════════════════════════════════════════

import { FinanceService } from '@/lib/services/finance.service'
import { periodForMonth }   from '@/lib/services/finance-rules'
import { round2 }           from '@/lib/calc'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScenarioVariance {
  scenario_id:         string
  scenario_name:       string
  scenario_created_at: string

  /** YYYY-MM-DD, derived from scenario's created_at month */
  period_from: string
  period_to:   string

  /** What the scenario predicted (extracted from stored summary) */
  projected: {
    revenue_try:       number
    cogs_try:          number
    gross_profit_try:  number
    expenses_try:      number
    net_income_try:    number
    cash_try:          number
  }

  /** What actually happened — null if no data yet (future period) */
  actuals: {
    revenue_try:       number
    cogs_try:          number
    gross_profit_try:  number
    expenses_try:      number
    net_income_try:    number
    cash_try:          number | null   // null if period not yet complete
  } | null

  /** Variance (actuals − projected) — null if no actuals */
  variance: {
    revenue_try:       number | null
    revenue_pct:       number | null   // (actuals − projected) / |projected|
    net_income_try:    number | null
    net_income_pct:    number | null
    expenses_try:      number | null
    expenses_pct:      number | null
  } | null

  accuracy_score:  number | null  // 0–100; 100 = perfect match
  verdict:         'accurate' | 'optimistic' | 'pessimistic' | 'insufficient_data'
  verdict_detail:  string         // e.g. "Gelir tahmini %18 fazla iyimser"

  actuals_available: boolean
  period_complete:   boolean      // true if period_to < today
}

// Raw row from simulation_scenarios table
interface SimulationScenarioRow {
  id:         string
  name:       string
  inputs:     Record<string, unknown>
  summary:    Record<string, unknown>
  created_at: string
}

// ── Pure kernel ───────────────────────────────────────────────────────────────

/**
 * Pure computation — testable without DB.
 *
 * Accuracy score logic:
 *   For each metric where both projected and actual exist and projected != 0:
 *     metric_error = |actual − projected| / max(|projected|, 1)
 *   accuracy_score = 100 × (1 − avg_metric_error), clamped 0–100
 *
 * Verdict (based on net_income deviation; falls back to revenue if available):
 *   accurate:          deviation within ±10%
 *   optimistic:        actual < projected by > 10% (plan was too rosy)
 *   pessimistic:       actual > projected by > 10% (reality beat plan)
 *   insufficient_data: no actuals
 */
export function computeVariance(
  projected:  ScenarioVariance['projected'],
  actuals:    ScenarioVariance['actuals'],
  today:      string,   // YYYY-MM-DD (unused in math; kept for API consistency)
  periodTo:   string,   // YYYY-MM-DD (unused in math; kept for API consistency)
): Pick<ScenarioVariance, 'variance' | 'accuracy_score' | 'verdict' | 'verdict_detail'> {
  // Suppress unused variable linting — parameters are part of the public API
  void today
  void periodTo

  if (!actuals) {
    return {
      variance:       null,
      accuracy_score: null,
      verdict:        'insufficient_data',
      verdict_detail: 'Gerçekleşen veri henüz mevcut değil',
    }
  }

  // ── Variance (actuals − projected) ──────────────────────────────────────────
  const rev_has_data = projected.revenue_try !== 0
  const rev_diff  = rev_has_data  ? round2(actuals.revenue_try    - projected.revenue_try)    : null
  const net_diff  =                  round2(actuals.net_income_try - projected.net_income_try)
  const exp_diff  = projected.expenses_try !== 0
    ? round2(actuals.expenses_try - projected.expenses_try)
    : null

  const rev_pct   = rev_diff  !== null && projected.revenue_try    !== 0
    ? round2(rev_diff  / Math.abs(projected.revenue_try))    : null
  const net_pct   = projected.net_income_try !== 0
    ? round2(net_diff  / Math.abs(projected.net_income_try)) : null
  const exp_pct   = exp_diff  !== null && projected.expenses_try   !== 0
    ? round2(exp_diff  / Math.abs(projected.expenses_try))   : null

  const variance: ScenarioVariance['variance'] = {
    revenue_try:     rev_diff,
    revenue_pct:     rev_pct,
    net_income_try:  net_diff,
    net_income_pct:  net_pct,
    expenses_try:    exp_diff,
    expenses_pct:    exp_pct,
  }

  // ── Accuracy score ───────────────────────────────────────────────────────────
  // Include only metrics where we have a meaningful projected value
  interface MetricPair { actual: number; projected: number }
  const metrics: MetricPair[] = [
    { actual: actuals.net_income_try,   projected: projected.net_income_try   },
  ]
  if (projected.revenue_try    !== 0) metrics.push({ actual: actuals.revenue_try,    projected: projected.revenue_try    })
  if (projected.expenses_try   !== 0) metrics.push({ actual: actuals.expenses_try,   projected: projected.expenses_try   })
  if (projected.cogs_try       !== 0) metrics.push({ actual: actuals.cogs_try,       projected: projected.cogs_try       })
  if (projected.gross_profit_try !== 0) metrics.push({ actual: actuals.gross_profit_try, projected: projected.gross_profit_try })

  const errors = metrics.map(m => Math.abs(m.actual - m.projected) / Math.max(Math.abs(m.projected), 1))
  const avgError      = errors.reduce((s, e) => s + e, 0) / errors.length
  const rawScore      = 100 * (1 - avgError)
  const accuracy_score = Math.max(0, Math.min(100, round2(rawScore)))

  // ── Verdict (prefer revenue; fall back to net_income) ───────────────────────
  // Use revenue if available (non-zero projected), else net_income_pct
  const primaryPct = rev_pct !== null ? rev_pct : net_pct

  let verdict: ScenarioVariance['verdict']
  let verdict_detail: string

  if (primaryPct === null) {
    verdict        = 'insufficient_data'
    verdict_detail = 'Karşılaştırma için yeterli veri yok'
  } else if (primaryPct >= -0.10 && primaryPct <= 0.10) {
    verdict        = 'accurate'
    const pctStr   = Math.abs(primaryPct * 100).toFixed(1)
    const metricTR = rev_pct !== null ? 'Gelir' : 'Net gelir'
    verdict_detail = `${metricTR} tahmini ±%${pctStr} sapmayla gerçekleşti`
  } else if (primaryPct < -0.10) {
    verdict        = 'optimistic'
    const pctStr   = Math.abs(primaryPct * 100).toFixed(1)
    const metricTR = rev_pct !== null ? 'Gelir' : 'Net gelir'
    verdict_detail = `${metricTR} tahmini %${pctStr} fazla iyimser — gerçek düşük kaldı`
  } else {
    verdict        = 'pessimistic'
    const pctStr   = (primaryPct * 100).toFixed(1)
    const metricTR = rev_pct !== null ? 'Gelir' : 'Net gelir'
    verdict_detail = `Senaryo muhafazakârdı — gerçek ${metricTR.toLowerCase()} %${pctStr} daha iyi`
  }

  return { variance, accuracy_score, verdict, verdict_detail }
}

// ── DB-bound service ──────────────────────────────────────────────────────────

export class ScenarioVarianceService {

  /**
   * Compare all saved scenarios against actuals.
   * Each scenario's period is derived from its created_at month.
   */
  static async compareAll(
    companyId: string,
    uid:       string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase:  SupabaseClient<any>,
    opts?:     { today?: string },
  ): Promise<ScenarioVariance[]> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const { data: rows, error } = await supabase
      .from('simulation_scenarios')
      .select('id, name, inputs, summary, created_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[scenario-variance] list error:', error.message)
      return []
    }

    if (!rows || rows.length === 0) return []

    // Determine which months need actuals (only complete months)
    const todayMonth = today.slice(0, 7)
    const monthSet   = new Set(
      (rows as SimulationScenarioRow[])
        .map(r => r.created_at.slice(0, 7))
        .filter(m => m < todayMonth)
    )

    const actualsMap = new Map<string, ScenarioVariance['actuals']>()
    await Promise.all(
      [...monthSet].map(async (month) => {
        try {
          const period = _safePeriodForMonth(month)
          const fs = await FinanceService.getFinancialSummary(uid, companyId, period, undefined, undefined, supabase)
          actualsMap.set(month, {
            revenue_try:      fs.revenue_try,
            cogs_try:         fs.cost_try,
            gross_profit_try: fs.gross_profit_try,
            expenses_try:     fs.expenses_total_try,
            net_income_try:   fs.net_after_tax_try,
            cash_try:         null,
          })
        } catch {
          // Non-fatal: actuals not available for this month
        }
      })
    )

    return (rows as SimulationScenarioRow[]).map(row =>
      ScenarioVarianceService._buildVariance(row, actualsMap, today)
    )
  }

  /**
   * Compare a single saved scenario against actuals.
   */
  static async compareScenario(
    companyId:  string,
    scenarioId: string,
    uid:        string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase:   SupabaseClient<any>,
    opts?:      { today?: string },
  ): Promise<ScenarioVariance | null> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const { data: row, error } = await supabase
      .from('simulation_scenarios')
      .select('id, name, inputs, summary, created_at')
      .eq('id', scenarioId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !row) return null

    const month      = (row as SimulationScenarioRow).created_at.slice(0, 7)
    const todayMonth = today.slice(0, 7)
    const actualsMap = new Map<string, ScenarioVariance['actuals']>()

    if (month < todayMonth) {
      try {
        const period = _safePeriodForMonth(month)
        const fs = await FinanceService.getFinancialSummary(uid, companyId, period, undefined, undefined, supabase)
        actualsMap.set(month, {
          revenue_try:      fs.revenue_try,
          cogs_try:         fs.cost_try,
          gross_profit_try: fs.gross_profit_try,
          expenses_try:     fs.expenses_total_try,
          net_income_try:   fs.net_after_tax_try,
          cash_try:         null,
        })
      } catch {
        // Non-fatal
      }
    }

    return ScenarioVarianceService._buildVariance(
      row as SimulationScenarioRow,
      actualsMap,
      today,
    )
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private static _buildVariance(
    row:        SimulationScenarioRow,
    actualsMap: Map<string, ScenarioVariance['actuals']>,
    today:      string,
  ): ScenarioVariance {
    const month        = row.created_at.slice(0, 7)
    const period       = _safePeriodForMonth(month)
    const todayMonth   = today.slice(0, 7)
    const periodComplete = month < todayMonth

    const summary  = (row.summary ?? {}) as Record<string, number | null>
    const projected = _extractProjected(summary)

    const actuals           = actualsMap.get(month) ?? null
    const actuals_available = actuals !== null

    const { variance, accuracy_score, verdict, verdict_detail } = computeVariance(
      projected,
      actuals,
      today,
      period.to,
    )

    return {
      scenario_id:         row.id,
      scenario_name:       row.name,
      scenario_created_at: row.created_at,
      period_from:         period.from,
      period_to:           period.to,
      projected,
      actuals,
      variance,
      accuracy_score,
      verdict,
      verdict_detail,
      actuals_available,
      period_complete:     periodComplete,
    }
  }
}

// ── Private pure helpers ──────────────────────────────────────────────────────

/**
 * Extract projected financials from stored scenario summary.
 *
 * WhatIfClient stores: { netIncome, grossMarginPct, distributable, runwayMonths }
 * We surface what we have. Revenue and expenses are 0 (not stored) unless the
 * saved summary happens to include extended fields.
 */
function _extractProjected(summary: Record<string, number | null>): ScenarioVariance['projected'] {
  const netIncome      = Number(summary.netIncome      ?? 0)
  const grossMarginPct = Number(summary.grossMarginPct ?? 0)

  // Extended fields (may or may not exist depending on future save enhancements)
  const revenue        = Number(summary.revenue    ?? 0)
  const cogs           = Number(summary.cogs       ?? Number(summary.cost ?? 0))
  const expenses       = Number(summary.expenses   ?? 0)
  // Gross profit: from explicit field, or derive from revenue × grossMarginPct
  const grossProfit    = revenue > 0 && grossMarginPct > 0
    ? round2(revenue * grossMarginPct)
    : Number(summary.grossProfit ?? 0)

  return {
    revenue_try:      round2(revenue),
    cogs_try:         round2(cogs),
    gross_profit_try: round2(grossProfit),
    expenses_try:     round2(expenses),
    net_income_try:   round2(netIncome),
    cash_try:         0,
  }
}

function _safePeriodForMonth(yyyymm: string): { from: string; to: string } {
  try {
    return periodForMonth(yyyymm)
  } catch {
    const [y, m] = yyyymm.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return {
      from: `${yyyymm}-01`,
      to:   `${yyyymm}-${String(lastDay).padStart(2, '0')}`,
    }
  }
}
