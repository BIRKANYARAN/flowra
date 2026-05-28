// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cash-sensitivity.service.ts
//
// Cash Flow Sensitivity Analysis (Stress Testing)
//
// Stress-tests the company's cash position under 5 adverse scenarios:
//   1. Hafif Şok    — revenue -10%, no delay, expenses +5%
//   2. Orta Şok     — revenue -20%, 15-day delay, expenses +10%
//   3. Ağır Şok     — revenue -30%, 30-day delay, expenses +20%
//   4. Tahsilat Krizi — no revenue shock, 45-day delay, no expense change
//   5. Kombine Şok  — revenue -25%, 30-day delay, expenses +15%
//
// Base rates are derived from the last 3 months average (revenue + expenses).
// Current cash is estimated as last-30-day net (collections − payments).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface StressScenario {
  scenario_id: string
  scenario_name: string                  // Turkish label
  revenue_shock_pct: number              // 0 = no shock
  collections_delay_days: number
  expense_surge_pct: number
  stressed_monthly_revenue_try: number
  stressed_monthly_burn_try: number
  stressed_runway_months: number | null
  runway_delta_months: number | null     // stressed - base (negative = worse)
  stress_impact: 'resilient' | 'moderate' | 'vulnerable' | 'critical' | 'unknown'
  monthly_cash_impact_try: number        // net cash impact per month vs base
}

export interface CashSensitivityReport {
  base_monthly_revenue_try: number
  base_monthly_burn_try: number
  base_runway_months: number | null
  current_cash_try: number
  scenarios: StressScenario[]
  worst_case: StressScenario
  best_case_stressed: StressScenario    // least damaging scenario
  key_risk: string                      // Turkish: which scenario is most impactful
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Apply revenue shock: reduce revenue by shock_pct.
 * e.g. shockPct=20 means -20%
 */
export function applyRevenueShock(
  baseRevenueTry: number,
  shockPct: number,
): number {
  return round2(baseRevenueTry * (1 - shockPct / 100))
}

/**
 * Apply collections delay: reduce near-term cash by delay_days × daily_receivables_inflow.
 * Simple model: delayed_amount = daily_avg_collections × delay_days
 * The delayed amount is subtracted from the current cash balance.
 */
export function applyCollectionsDelay(
  baseCashTry: number,
  dailyAvgCollectionsTry: number,
  delayDays: number,
): number {
  const delayed = round2(dailyAvgCollectionsTry * delayDays)
  return round2(baseCashTry - delayed)
}

/**
 * Apply expense surge: increase monthly expenses by surge_pct.
 * e.g. surgePct=10 means +10%
 */
export function applyExpenseSurge(
  baseMonthlyExpensesTry: number,
  surgePct: number,
): number {
  return round2(baseMonthlyExpensesTry * (1 + surgePct / 100))
}

/**
 * Compute stressed runway: cash / stressed_monthly_burn
 * Returns null if stressed_monthly_burn <= 0
 */
export function computeStressedRunway(
  currentCashTry: number,
  stressedMonthlyBurnTry: number,
): number | null {
  if (stressedMonthlyBurnTry <= 0) return null
  if (currentCashTry <= 0) return null
  return round2(currentCashTry / stressedMonthlyBurnTry)
}

/**
 * Classify stress impact based on runway delta (stressed - base).
 *
 *   runway_delta >= 0:   'resilient'
 *   -3 to 0:             'moderate'
 *   -6 to -3:            'vulnerable'
 *   < -6:                'critical'
 *   null inputs:         'unknown'
 */
export function classifyStressImpact(
  baseRunwayMonths: number | null,
  stressedRunwayMonths: number | null,
): 'resilient' | 'moderate' | 'vulnerable' | 'critical' | 'unknown' {
  if (baseRunwayMonths === null || stressedRunwayMonths === null) return 'unknown'
  const delta = stressedRunwayMonths - baseRunwayMonths
  if (delta >= 0) return 'resilient'
  if (delta >= -3) return 'moderate'
  if (delta >= -6) return 'vulnerable'
  return 'critical'
}

// ── Impact severity order ─────────────────────────────────────────────────────

const IMPACT_ORDER: Record<StressScenario['stress_impact'], number> = {
  critical:  4,
  vulnerable: 3,
  moderate:  2,
  resilient: 1,
  unknown:   0,
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CashSensitivityService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  async getReport(companyId: string): Promise<CashSensitivityReport> {
    const now       = new Date()
    const today     = now.toISOString().slice(0, 10)

    // ── Last 3 months window ─────────────────────────────────────────────────
    const months3ago = new Date(now)
    months3ago.setMonth(months3ago.getMonth() - 3)
    const from3mo = months3ago.toISOString().slice(0, 10)

    // ── Last 30 days window ──────────────────────────────────────────────────
    const days30ago = new Date(now)
    days30ago.setDate(days30ago.getDate() - 30)
    const from30d = days30ago.toISOString().slice(0, 10)

    // ── Parallel queries ─────────────────────────────────────────────────────
    const [salesResult, expensesResult, sales30dResult, expenses30dResult] =
      await Promise.allSettled([
        // Sales last 3 months (for base revenue)
        this.supabase
          .from('sales')
          .select('sale_date, total_try, amount_paid, payment_status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', from3mo)
          .lte('sale_date', today),

        // Expenses last 3 months (for base burn)
        this.supabase
          .from('expenses')
          .select('expense_date, amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', from3mo)
          .lte('expense_date', today),

        // Sales last 30 days (for current cash estimate)
        this.supabase
          .from('sales')
          .select('sale_date, total_try, amount_paid, payment_status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', from30d)
          .lte('sale_date', today),

        // Expenses last 30 days (for current cash estimate)
        this.supabase
          .from('expenses')
          .select('expense_date, amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', from30d)
          .lte('expense_date', today),
      ])

    const sales3mo    = salesResult.status    === 'fulfilled' ? (salesResult.value.data    ?? []) : []
    const expenses3mo = expensesResult.status === 'fulfilled' ? (expensesResult.value.data ?? []) : []
    const sales30d    = sales30dResult.status    === 'fulfilled' ? (sales30dResult.value.data    ?? []) : []
    const expenses30d = expenses30dResult.status === 'fulfilled' ? (expenses30dResult.value.data ?? []) : []

    // ── Base monthly revenue (3-month avg) ───────────────────────────────────
    const totalRevenue3mo = sales3mo.reduce(
      (s, r) => s + (Number(r.total_try) || 0),
      0,
    )
    const base_monthly_revenue_try = round2(totalRevenue3mo / 3)

    // ── Base monthly burn / expenses (3-month avg) ───────────────────────────
    const totalExpenses3mo = expenses3mo.reduce(
      (s, r) => s + (Number(r.amount_try) || 0),
      0,
    )
    const base_monthly_burn_try = round2(totalExpenses3mo / 3)

    // ── Base monthly net burn for runway calculation ─────────────────────────
    // Net burn = expenses - revenue (positive = burning cash)
    const base_net_burn_try = round2(base_monthly_burn_try - base_monthly_revenue_try)

    // ── Current cash (last 30d net) ──────────────────────────────────────────
    let collections30d = 0
    for (const s of sales30d) {
      const paid =
        s.payment_status === 'paid'
          ? Number(s.total_try) || 0
          : s.payment_status === 'partial'
            ? Number(s.amount_paid) || 0
            : 0
      collections30d += paid
    }

    const payments30d = expenses30d.reduce(
      (s, e) => s + (Number(e.amount_try) || 0),
      0,
    )

    const current_cash_try = round2(Math.max(0, collections30d - payments30d))

    // ── Daily avg collections ────────────────────────────────────────────────
    const dailyAvgCollections = round2(base_monthly_revenue_try / 30)

    // ── Base runway ──────────────────────────────────────────────────────────
    // Use net burn; if net_burn <= 0 company isn't burning → null (profitable)
    const base_runway_months: number | null =
      base_net_burn_try > 0 && current_cash_try > 0
        ? round2(current_cash_try / base_net_burn_try)
        : null

    // ── Define 5 scenarios ───────────────────────────────────────────────────
    const scenarioDefs: Array<{
      id: string
      name: string
      revShockPct: number
      delayDays: number
      expSurgePct: number
    }> = [
      {
        id:           'hafif',
        name:         'Hafif Şok',
        revShockPct:  10,
        delayDays:    0,
        expSurgePct:  5,
      },
      {
        id:           'orta',
        name:         'Orta Şok',
        revShockPct:  20,
        delayDays:    15,
        expSurgePct:  10,
      },
      {
        id:           'agir',
        name:         'Ağır Şok',
        revShockPct:  30,
        delayDays:    30,
        expSurgePct:  20,
      },
      {
        id:           'tahsilat',
        name:         'Tahsilat Krizi',
        revShockPct:  0,
        delayDays:    45,
        expSurgePct:  0,
      },
      {
        id:           'kombine',
        name:         'Kombine Şok',
        revShockPct:  25,
        delayDays:    30,
        expSurgePct:  15,
      },
    ]

    // ── Compute scenarios ────────────────────────────────────────────────────
    const scenarios: StressScenario[] = scenarioDefs.map(def => {
      const stressed_monthly_revenue_try = applyRevenueShock(
        base_monthly_revenue_try,
        def.revShockPct,
      )

      const stressed_monthly_burn_try = applyExpenseSurge(
        base_monthly_burn_try,
        def.expSurgePct,
      )

      // Cash available under stress (collections delay reduces near-term cash)
      const stressed_cash = applyCollectionsDelay(
        current_cash_try,
        dailyAvgCollections,
        def.delayDays,
      )

      // Stressed net burn = stressed_expenses - stressed_revenue
      const stressed_net_burn = round2(stressed_monthly_burn_try - stressed_monthly_revenue_try)

      const stressed_runway_months = computeStressedRunway(
        Math.max(0, stressed_cash),
        stressed_net_burn,
      )

      const runway_delta_months =
        base_runway_months !== null && stressed_runway_months !== null
          ? round2(stressed_runway_months - base_runway_months)
          : base_runway_months === null && stressed_runway_months === null
            ? 0
            : null

      const stress_impact = classifyStressImpact(base_runway_months, stressed_runway_months)

      // Monthly cash impact: (stressed_revenue - stressed_burn) - (base_revenue - base_burn)
      const base_monthly_net     = round2(base_monthly_revenue_try - base_monthly_burn_try)
      const stressed_monthly_net = round2(stressed_monthly_revenue_try - stressed_monthly_burn_try)
      const monthly_cash_impact_try = round2(stressed_monthly_net - base_monthly_net)

      return {
        scenario_id:                   def.id,
        scenario_name:                 def.name,
        revenue_shock_pct:             def.revShockPct,
        collections_delay_days:        def.delayDays,
        expense_surge_pct:             def.expSurgePct,
        stressed_monthly_revenue_try,
        stressed_monthly_burn_try,
        stressed_runway_months,
        runway_delta_months,
        stress_impact,
        monthly_cash_impact_try,
      }
    })

    // ── Sort by severity (worst first) ───────────────────────────────────────
    scenarios.sort(
      (a, b) => IMPACT_ORDER[b.stress_impact] - IMPACT_ORDER[a.stress_impact],
    )

    // ── Worst / best case ────────────────────────────────────────────────────
    const worst_case = scenarios[0]
    const best_case_stressed = scenarios[scenarios.length - 1]

    // ── Key risk: Turkish description of the most impactful scenario ─────────
    const keyRiskScenario = worst_case
    let key_risk: string
    if (keyRiskScenario.stress_impact === 'unknown') {
      key_risk = 'Yeterli veri yok — stres analizi için daha fazla işlem kaydı gerekiyor.'
    } else if (keyRiskScenario.stress_impact === 'resilient') {
      key_risk = 'Tüm senaryolarda nakit pozisyonu dayanıklı görünüyor.'
    } else {
      const scenarioName = keyRiskScenario.scenario_name
      const impact       = {
        moderate:   'orta düzeyde',
        vulnerable: 'yüksek düzeyde',
        critical:   'kritik düzeyde',
      }[keyRiskScenario.stress_impact as 'moderate' | 'vulnerable' | 'critical']
      const delta = keyRiskScenario.runway_delta_months !== null
        ? `Runway ${Math.abs(keyRiskScenario.runway_delta_months).toFixed(1)} ay kısalıyor.`
        : ''
      key_risk = `${scenarioName} en ${impact} risk oluşturuyor. ${delta}`
    }

    return {
      base_monthly_revenue_try,
      base_monthly_burn_try,
      base_runway_months,
      current_cash_try,
      scenarios,
      worst_case,
      best_case_stressed,
      key_risk,
    }
  }
}
