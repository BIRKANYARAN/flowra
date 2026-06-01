// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/kpi-scorecard.service.ts
//
// KPI Scorecard Tracker — Target vs Actual comparison.
//
// Pure functions exported for testing:
//   computeAchievementPct   — actual / target × 100 (null if target = 0)
//   classifyAchievement     — map pct to status bucket
//   computeKpiTrend         — improving/stable/declining over last 3 actuals
//   computeScorecardHealth  — weighted average of status scores (0-100)
//   scorecardGrade          — A/B/C/D/F from score
//
// Class: KpiScorecardService
//   getScorecard(companyId, periodKey?) — assembles full KpiScorecard from DB
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type KpiUnit      = 'try' | 'pct' | 'days' | 'count'
export type KpiDirection = 'higher_is_better' | 'lower_is_better'
export type KpiStatus    = 'achieved' | 'near_target' | 'below_target' | 'at_risk' | 'no_data'
export type KpiTrend     = 'improving' | 'stable' | 'declining'
export type ScorecardGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface KpiScorecardEntry {
  kpi_key:         string              // e.g. 'revenue_monthly', 'gross_margin_pct'
  kpi_label:       string              // Turkish label
  actual_value:    number | null
  target_value:    number | null
  unit:            KpiUnit
  direction:       KpiDirection
  achievement_pct: number | null
  status:          KpiStatus
  trend:           KpiTrend
  period_key:      string
}

export interface KpiScorecard {
  period_key:     string
  period_label:   string
  health_score:   number
  grade:          ScorecardGrade
  entries:        KpiScorecardEntry[]
  achieved_count: number
  at_risk_count:  number
  no_data_count:  number
}

// ── Standard KPI definitions ──────────────────────────────────────────────────

interface KpiDef {
  key:       string
  label:     string
  unit:      KpiUnit
  direction: KpiDirection
}

const STANDARD_KPIS: KpiDef[] = [
  { key: 'revenue_monthly',   label: 'Aylık Gelir',         unit: 'try',   direction: 'higher_is_better' },
  { key: 'gross_margin_pct',  label: 'Brüt Marj',           unit: 'pct',   direction: 'higher_is_better' },
  { key: 'net_margin_pct',    label: 'Net Marj',             unit: 'pct',   direction: 'higher_is_better' },
  { key: 'dso_days',          label: 'DSO (Tahsilat Günü)',  unit: 'days',  direction: 'lower_is_better'  },
  { key: 'expense_ratio_pct', label: 'Gider Oranı',          unit: 'pct',   direction: 'lower_is_better'  },
  { key: 'cash_runway_months',label: 'Nakit Pisti (Ay)',     unit: 'count', direction: 'higher_is_better' },
]

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute achievement percentage: actual / target × 100.
 * Returns null if target is 0 (cannot divide) or either is null/undefined.
 */
export function computeAchievementPct(
  actual: number,
  target: number,
): number | null {
  if (target === 0) return null
  return (actual / target) * 100
}

/**
 * Classify achievement status from achievement percentage.
 *
 * ≥ 100  → 'achieved'
 * 90-99  → 'near_target'
 * 70-89  → 'below_target'
 * < 70   → 'at_risk'
 * null   → 'no_data'
 */
export function classifyAchievement(
  achievementPct: number | null,
): KpiStatus {
  if (achievementPct === null) return 'no_data'
  if (achievementPct >= 100)  return 'achieved'
  if (achievementPct >= 90)   return 'near_target'
  if (achievementPct >= 70)   return 'below_target'
  return 'at_risk'
}

/**
 * Compute KPI trend from the last 3 actuals (chronological, last = most recent).
 *
 * Compares how far the last actual is from the target vs how far the first
 * actual (3 periods ago) was from the target.
 *
 * improving  — last actual is closer to target by >5% relative change
 * declining  — last actual is farther from target by >5% relative change
 * stable     — change within ±5%, or fewer than 2 actuals provided
 */
export function computeKpiTrend(
  actuals:   number[],
  target:    number,
  direction: KpiDirection,
): KpiTrend {
  if (actuals.length < 2) return 'stable'

  const oldest = actuals[0]
  const newest = actuals[actuals.length - 1]

  // Distance from target: for higher_is_better → target - actual (positive = underperforming)
  // For lower_is_better → actual - target (positive = underperforming)
  const distOldest = direction === 'higher_is_better'
    ? target - oldest
    : oldest - target

  const distNewest = direction === 'higher_is_better'
    ? target - newest
    : newest - target

  // If baseline distance is essentially 0, we're on target — stable
  if (Math.abs(distOldest) < 1e-9) return 'stable'

  // Relative change in distance-from-target
  const relChange = (distNewest - distOldest) / Math.abs(distOldest)

  // Improving = distance shrank (relChange < -0.05)
  // Declining = distance grew  (relChange >  0.05)
  if (relChange < -0.05) return 'improving'
  if (relChange >  0.05) return 'declining'
  return 'stable'
}

/**
 * Compute overall scorecard health (0-100).
 * Each KPI contributes equally:
 *   achieved=100, near_target=80, below_target=50, at_risk=20, no_data=0
 * Returns average.
 */
export function computeScorecardHealth(
  statuses: KpiStatus[],
): number {
  if (statuses.length === 0) return 0

  const scoreMap: Record<KpiStatus, number> = {
    achieved:     100,
    near_target:   80,
    below_target:  50,
    at_risk:       20,
    no_data:        0,
  }

  const total = statuses.reduce((sum, s) => sum + scoreMap[s], 0)
  return total / statuses.length
}

/**
 * Convert health score to letter grade.
 * A (≥80), B (65-79), C (50-64), D (35-49), F (<35)
 */
export function scorecardGrade(score: number): ScorecardGrade {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

// ── Period helpers ────────────────────────────────────────────────────────────

function currentPeriodKey(): string {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function periodLabel(periodKey: string): string {
  try {
    const [y, m] = periodKey.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  } catch {
    return periodKey
  }
}

/** Return the YYYY-MM string for `n` months before the given period key. */
function shiftPeriod(periodKey: string, offsetMonths: number): string {
  const [y, m] = periodKey.split('-').map(Number)
  const d = new Date(y, m - 1 - offsetMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Return [from, to] date strings for a YYYY-MM period key. */
function periodDateRange(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const from   = `${periodKey}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to     = `${periodKey}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── KpiScorecardService ────────────────────────────────────────────────────────

export class KpiScorecardService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Fetch and compute a full KpiScorecard for the given company and period.
   *
   * @param companyId - UUID of the company
   * @param periodKey - YYYY-MM (defaults to current month)
   */
  async getScorecard(companyId: string, periodKey?: string): Promise<KpiScorecard> {
    const pk     = periodKey ?? currentPeriodKey()
    const { from, to } = periodDateRange(pk)

    // ── 1. Fetch kpi_targets ──────────────────────────────────────────────────
    const { data: targetsData } = await this.supabase
      .from('kpi_targets')
      .select('kpi_key, target_value, target_label, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)

    const targetMap = new Map<string, number>()
    for (const row of (targetsData ?? [])) {
      targetMap.set(row.kpi_key as string, Number(row.target_value))
    }

    // ── 2. Fetch current-period actuals ───────────────────────────────────────
    const actuals = await this.fetchActuals(companyId, from, to, pk)

    // ── 3. Fetch last 3 months of actuals for trend ───────────────────────────
    const trendActuals = await this.fetchTrendHistory(companyId, pk)

    // ── 4. Build entries ──────────────────────────────────────────────────────
    const entries: KpiScorecardEntry[] = STANDARD_KPIS.map(def => {
      const actual = actuals.get(def.key) ?? null
      const target = targetMap.has(def.key) ? targetMap.get(def.key)! : null

      const achievement_pct = (actual !== null && target !== null)
        ? computeAchievementPct(actual, target)
        : null

      const status = classifyAchievement(achievement_pct)

      // Trend: use last 3 period actuals; if not enough, stable
      const history = trendActuals.get(def.key) ?? []
      const trend   = (actual !== null && target !== null)
        ? computeKpiTrend(history, target, def.direction)
        : 'stable'

      return {
        kpi_key:        def.key,
        kpi_label:      def.label,
        actual_value:   actual,
        target_value:   target,
        unit:           def.unit,
        direction:      def.direction,
        achievement_pct,
        status,
        trend,
        period_key:     pk,
      }
    })

    // ── 5. Compute scorecard health ───────────────────────────────────────────
    const health_score = computeScorecardHealth(entries.map(e => e.status))
    const grade        = scorecardGrade(health_score)

    return {
      period_key:     pk,
      period_label:   periodLabel(pk),
      health_score:   Math.round(health_score * 10) / 10,
      grade,
      entries,
      achieved_count: entries.filter(e => e.status === 'achieved').length,
      at_risk_count:  entries.filter(e => e.status === 'at_risk').length,
      no_data_count:  entries.filter(e => e.status === 'no_data').length,
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Fetch actual KPI values for the given period.
   * Returns a Map<kpi_key, value>.
   */
  private async fetchActuals(
    companyId: string,
    from:      string,
    to:        string,
    periodKey: string,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>()

    // revenue_monthly: Σ total_try from sales in period
    const { data: salesData } = await this.supabase
      .from('sales')
      .select('total_try:total, cogs')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)

    const sales = salesData ?? []
    const revenue = sales.reduce((s: number, r: { total_try: number | null }) => s + Number(r.total_try ?? 0), 0)
    const cogs    = sales.reduce((s: number, r: { cogs: number | null }) => s + Number(r.cogs ?? 0), 0)

    result.set('revenue_monthly', revenue)

    if (revenue > 0) {
      // gross_margin_pct: (revenue - cogs) / revenue × 100
      result.set('gross_margin_pct', ((revenue - cogs) / revenue) * 100)
    }

    // Expenses for the period
    const { data: expData } = await this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    const expenses = (expData ?? []).reduce(
      (s: number, r: { amount_try: number | null }) => s + Number(r.amount_try ?? 0),
      0,
    )

    if (revenue > 0) {
      // expense_ratio_pct
      result.set('expense_ratio_pct', (expenses / revenue) * 100)

      // net_margin_pct: (revenue - cogs - expenses) / revenue × 100
      const netIncome = revenue - cogs - expenses
      result.set('net_margin_pct', (netIncome / revenue) * 100)
    }

    // dso_days: (outstanding_receivables / revenue) × 30
    const { data: receivablesData } = await this.supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('payment_status', 'paid')
      .gte('sale_date', from)
      .lte('sale_date', to)

    const receivables = (receivablesData ?? []).reduce(
      (s: number, r: { total_try: number | null }) => s + Number(r.total_try ?? 0),
      0,
    )

    if (revenue > 0) {
      result.set('dso_days', (receivables / revenue) * 30)
    }

    // cash_runway_months: current cash / avg monthly burn
    await this.fetchCashRunway(companyId, result)

    return result
  }

  /** Fetch cash position and compute runway months. */
  private async fetchCashRunway(
    companyId: string,
    result:    Map<string, number>,
  ): Promise<void> {
    // All-time collected (paid sales)
    const { data: paidSales } = await this.supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)

    const collected = (paidSales ?? []).reduce(
      (s: number, r: { total_try: number | null }) => s + Number(r.total_try ?? 0),
      0,
    )

    // All-time paid expenses (excluding non-burn types)
    const NON_BURN = new Set(['loan_repayment', 'partner_financing', 'dividend', 'internal_transfer'])
    const { data: paidExp } = await this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)

    const paidExpTotal = (paidExp ?? []).reduce(
      (s: number, r: { amount_try: number | null; expense_type: string | null }) => {
        if (r.expense_type && NON_BURN.has(r.expense_type)) return s
        return s + Number(r.amount_try ?? 0)
      },
      0,
    )

    const cashPosition = collected - paidExpTotal

    // Last 3 months burn
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
    const burnFrom = threeMonthsAgo.toISOString().slice(0, 10)

    const { data: burnData } = await this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('expense_date', burnFrom)
      .in('expense_type', ['operational', 'fixed', 'variable'])

    const burn3m    = (burnData ?? []).reduce(
      (s: number, r: { amount_try: number | null }) => s + Number(r.amount_try ?? 0),
      0,
    )
    const avgMonthlyBurn = burn3m / 3

    if (cashPosition > 0 && avgMonthlyBurn > 0) {
      result.set('cash_runway_months', cashPosition / avgMonthlyBurn)
    }
  }

  /**
   * Fetch last 3 months of actuals for trend analysis.
   * Returns Map<kpi_key, number[]> (chronological, oldest first).
   */
  private async fetchTrendHistory(
    companyId: string,
    currentPk: string,
  ): Promise<Map<string, number[]>> {
    const history = new Map<string, number[]>()

    // Fetch periods: 3 months ago, 2 months ago, 1 month ago, current
    const periods = [3, 2, 1, 0].map(offset => shiftPeriod(currentPk, offset))

    // The 4 periods are independent read-only fetches — run them concurrently
    // instead of sequentially (4 round-trips → 1 batch). Promise.all preserves
    // order, so periodActuals[i] still corresponds to periods[i].
    const periodActuals: Array<Map<string, number>> = await Promise.all(
      periods.map(pk => {
        const { from, to } = periodDateRange(pk)
        return this.fetchActuals(companyId, from, to, pk)
      }),
    )

    // Build history arrays per KPI
    for (const def of STANDARD_KPIS) {
      const vals = periodActuals
        .map(a => a.get(def.key))
        .filter((v): v is number => v !== undefined)
      if (vals.length > 0) {
        history.set(def.key, vals)
      }
    }

    return history
  }
}
