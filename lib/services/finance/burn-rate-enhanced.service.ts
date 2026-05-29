// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/burn-rate-enhanced.service.ts
//
// Cash Burn Rate Enhanced Service — scenarios, decomposition, efficiency,
// trend analysis, runway sensitivity, and Turkish narrative generation.
//
// Pure functions are fully testable without DB.
// Service class fetches 6 months of expenses, sales, and balance sheet data.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface BurnDecomposition {
  category: string
  monthly_amount: number
  pct_of_total_burn: number
  is_fixed: boolean
  trend: 'increasing' | 'stable' | 'decreasing' | null
}

export interface BurnScenario {
  name: string
  monthly_burn: number
  revenue_assumption: number
  net_burn: number
  runway_months: number | null
  months_to_profitability: number | null
}

export interface BurnRateEnhancedReport {
  monthly_gross_burn: number
  monthly_revenue: number
  monthly_net_burn: number
  cash_balance: number | null
  runway_months: number | null
  runway_health: ReturnType<typeof classifyRunwayHealth>
  burn_efficiency_ratio: number | null
  burn_efficiency: ReturnType<typeof classifyBurnEfficiency>
  burn_decomposition: BurnDecomposition[]
  burn_scenarios: BurnScenario[]
  burn_trend: Array<{ month_index: number; burn: number; rolling_avg: number | null }>
  ideal_burn_for_12_month_runway: number
  narrative: string
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute net burn: gross burn minus revenue.
 * Negative result means cash generation.
 */
export function computeNetBurn(grossBurn: number, revenue: number): number {
  return round2(grossBurn - revenue)
}

/**
 * Compute runway in months.
 * Returns null if netBurnPerMonth <= 0 (not burning cash).
 * Rounds down to 1 decimal.
 */
export function computeRunwayMonths(
  cashBalance: number,
  netBurnPerMonth: number,
): number | null {
  if (netBurnPerMonth <= 0) return null
  return Math.floor((cashBalance / netBurnPerMonth) * 10) / 10
}

/**
 * Sum all expense amounts to get gross burn.
 */
export function computeGrossBurnFromExpenses(
  expenses: Array<{ category: string; amount: number }>,
): number {
  return round2(expenses.reduce((sum, e) => sum + e.amount, 0))
}

/**
 * Group expenses by category, compute pct of total burn, classify fixed/variable.
 * Sorts by monthly_amount DESC. trend is always null (requires historical data).
 */
export function computeBurnDecomposition(
  expenses: Array<{ category: string; amount: number }>,
  totalBurn: number,
  fixedCategories: string[],
): BurnDecomposition[] {
  const byCategory: Record<string, number> = {}
  for (const e of expenses) {
    byCategory[e.category] = round2((byCategory[e.category] ?? 0) + e.amount)
  }

  const fixedSet = new Set(fixedCategories.map(c => c.toLowerCase()))

  const result: BurnDecomposition[] = Object.entries(byCategory).map(
    ([category, monthly_amount]) => ({
      category,
      monthly_amount,
      pct_of_total_burn:
        totalBurn > 0 ? round2((monthly_amount / totalBurn) * 100) : 0,
      is_fixed: fixedSet.has(category.toLowerCase()),
      trend: null,
    }),
  )

  result.sort((a, b) => b.monthly_amount - a.monthly_amount)
  return result
}

/**
 * Compute rolling average burn trend.
 * rolling_avg is null for the first (window - 1) entries.
 */
export function computeMonthlyBurnTrend(
  monthlyBurns: number[],
  window: number,
): Array<{ month_index: number; burn: number; rolling_avg: number | null }> {
  return monthlyBurns.map((burn, idx) => {
    if (idx < window - 1) {
      return { month_index: idx, burn, rolling_avg: null }
    }
    const slice = monthlyBurns.slice(idx - window + 1, idx + 1)
    const avg = round2(slice.reduce((s, v) => s + v, 0) / window)
    return { month_index: idx, burn, rolling_avg: avg }
  })
}

/**
 * Compute burn efficiency ratio: revenue / burn.
 * Returns null if monthlyBurn === 0.
 * > 1 means revenue exceeds burn (efficient); < 1 means burning cash.
 */
export function computeBurnEfficiencyRatio(
  monthlyRevenue: number,
  monthlyBurn: number,
): number | null {
  if (monthlyBurn === 0) return null
  return round2(monthlyRevenue / monthlyBurn)
}

/**
 * Classify burn efficiency ratio into 5 levels.
 */
export function classifyBurnEfficiency(
  ratio: number | null,
): 'profitable' | 'efficient' | 'neutral' | 'inefficient' | 'critical' {
  if (ratio === null) return 'critical'
  if (ratio >= 1.5) return 'profitable'
  if (ratio >= 1.0) return 'efficient'
  if (ratio >= 0.75) return 'neutral'
  if (ratio >= 0.5) return 'inefficient'
  return 'critical'
}

/**
 * Build 5 standard burn scenarios with runway and months-to-profitability.
 */
export function buildBurnScenarios(
  currentMonthlyBurn: number,
  currentMonthlyRevenue: number,
  cashBalance: number,
): BurnScenario[] {
  const scenarios: Array<{ name: string; burnMult: number; revMult: number }> = [
    { name: 'Mevcut Seyir',       burnMult: 1.0, revMult: 1.0 },
    { name: 'Gelir +20%',         burnMult: 1.0, revMult: 1.2 },
    { name: 'Gider -20%',         burnMult: 0.8, revMult: 1.0 },
    { name: 'Büyüme Senaryosu',   burnMult: 1.2, revMult: 1.4 },
    { name: 'Kriz Senaryosu',     burnMult: 1.1, revMult: 0.7 },
  ]

  return scenarios.map(({ name, burnMult, revMult }) => {
    const monthly_burn = round2(currentMonthlyBurn * burnMult)
    const revenue_assumption = round2(currentMonthlyRevenue * revMult)
    const net_burn = round2(monthly_burn - revenue_assumption)

    const runway_months =
      net_burn > 0 ? computeRunwayMonths(cashBalance, net_burn) : null

    // months_to_profitability: null if already profitable (net_burn <= 0)
    const months_to_profitability = net_burn <= 0 ? null : null // static; requires growth rate

    return {
      name,
      monthly_burn,
      revenue_assumption,
      net_burn,
      runway_months,
      months_to_profitability,
    }
  })
}

/**
 * Compute how many months to reach targetRevenue at a monthly growth rate.
 * Returns null if rate <= 0 or current >= target.
 */
export function computeMonthsToDefaultRevenue(
  currentRevenue: number,
  revenueGrowthRateMonthly: number,
  targetRevenue: number,
): number | null {
  if (revenueGrowthRateMonthly <= 0) return null
  if (currentRevenue >= targetRevenue) return null
  return round2(
    Math.log(targetRevenue / currentRevenue) /
      Math.log(1 + revenueGrowthRateMonthly),
  )
}

/**
 * Compute how runway changes if burn increases by burnDelta% and revenue
 * changes by revenueDelta%.
 */
export function computeRunwaySensitivity(
  cashBalance: number,
  baseBurn: number,
  baseRevenue: number,
  burnDelta: number,
  revenueDelta: number,
): { runway_change_months: number | null; new_runway_months: number | null } {
  const newBurn = round2(baseBurn * (1 + burnDelta))
  const newRevenue = round2(baseRevenue * (1 + revenueDelta))
  const newNetBurn = round2(newBurn - newRevenue)

  const baseNetBurn = round2(baseBurn - baseRevenue)
  const baseRunway = computeRunwayMonths(cashBalance, baseNetBurn)
  const newRunway = computeRunwayMonths(cashBalance, newNetBurn)

  const runway_change_months =
    newRunway !== null && baseRunway !== null
      ? round2(newRunway - baseRunway)
      : null

  return { runway_change_months, new_runway_months: newRunway }
}

/**
 * Classify runway health from runway months.
 */
export function classifyRunwayHealth(
  runwayMonths: number | null,
): 'strong' | 'adequate' | 'low' | 'critical' | 'no_burn' {
  if (runwayMonths === null) return 'no_burn'
  if (runwayMonths >= 18) return 'strong'
  if (runwayMonths >= 9) return 'adequate'
  if (runwayMonths >= 3) return 'low'
  return 'critical'
}

/**
 * Compute the ideal gross burn to achieve a desired runway.
 * Ideal gross burn = (cashBalance / desiredRunwayMonths) + monthlyRevenue
 */
export function computeIdealBurnForRunway(
  cashBalance: number,
  desiredRunwayMonths: number,
  monthlyRevenue: number,
): number {
  const maxNetBurn = round2(cashBalance / desiredRunwayMonths)
  return round2(maxNetBurn + monthlyRevenue)
}

/**
 * Generate a Turkish narrative summarizing the runway and burn situation.
 */
export function generateBurnNarrative(
  runwayHealth: ReturnType<typeof classifyRunwayHealth>,
  runwayMonths: number | null,
  burnEfficiency: ReturnType<typeof classifyBurnEfficiency>,
  netBurnMonthly: number,
): string {
  const runway =
    runwayMonths !== null ? Math.floor(runwayMonths).toString() : '—'

  switch (runwayHealth) {
    case 'no_burn':
      return 'Nakit yakma oranı sıfır — şirket gelir üretiyor, nakit büyüyor.'
    case 'strong':
      return `Nakit rezervi güçlü — ${runway} ay pist mevcut.`
    case 'adequate':
      return `Nakit pisti yeterli — ${runway} ay sonrası için strateji hazırlanmalı.`
    case 'low':
      return `Dikkat: Sadece ${runway} ay nakit kaldı — hızlı aksiyon gerekiyor.`
    case 'critical':
      return `Kritik: ${runway} aydan az nakit — acil finansman veya gider kesimi şart.`
  }
}

// ── Month helpers ─────────────────────────────────────────────────────────────

function buildMonthSlots(
  now: Date,
): Array<{ year: number; month: number; key: string }> {
  const slots = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key })
  }
  return slots
}

function monthRange(
  year: number,
  month: number,
): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Fixed categories ──────────────────────────────────────────────────────────

const FIXED_CATEGORIES = [
  'salary',
  'rent',
  'software',
  'utilities',
  'insurance',
  'depreciation',
]

// ── Service ───────────────────────────────────────────────────────────────────

export class BurnRateEnhancedService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<BurnRateEnhancedReport> {
    const now = new Date()
    const slots = buildMonthSlots(now)
    const oldest = slots[slots.length - 1]
    const newest = slots[0]
    const { from: windowFrom } = monthRange(oldest.year, oldest.month)
    const { to: windowTo } = monthRange(newest.year, newest.month)

    // ── Fetch data in parallel ─────────────────────────────────────────────────
    const [expenseResult, salesResult, balanceResult] =
      await Promise.allSettled([
        this.supabase
          .from('expenses')
          .select('expense_date, amount_try, category')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', windowFrom)
          .lte('expense_date', windowTo),

        this.supabase
          .from('sales')
          .select('sale_date, total_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', windowFrom)
          .lte('sale_date', windowTo),

        this.supabase
          .from('balance_sheet_snapshots')
          .select('snapshot_date, cash_and_equivalents_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('snapshot_date', { ascending: false })
          .limit(1),
      ])

    // ── Aggregate per-month ────────────────────────────────────────────────────
    const burnByMonth: Record<string, number> = {}
    const revByMonth: Record<string, number> = {}

    for (const slot of slots) {
      burnByMonth[slot.key] = 0
      revByMonth[slot.key] = 0
    }

    // Expense rows with category
    const expenseRows: Array<{
      category: string
      amount: number
      key: string
    }> = []

    if (
      expenseResult.status === 'fulfilled' &&
      expenseResult.value?.data
    ) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7)
        const amount = Number(row.amount_try) || 0
        const category = (row.category as string) ?? 'other'
        if (key in burnByMonth) {
          burnByMonth[key] = round2(burnByMonth[key] + amount)
        }
        expenseRows.push({ category, amount, key })
      }
    }

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const key = (row.sale_date as string).slice(0, 7)
        if (key in revByMonth) {
          revByMonth[key] = round2(
            revByMonth[key] + (Number(row.total_try) || 0),
          )
        }
      }
    }

    // ── Cash balance ──────────────────────────────────────────────────────────
    let cashBalance: number | null = null
    if (
      balanceResult.status === 'fulfilled' &&
      balanceResult.value?.data &&
      balanceResult.value.data.length > 0
    ) {
      const row = balanceResult.value.data[0]
      const val = Number(row.cash_and_equivalents_try)
      if (!isNaN(val)) cashBalance = val
    }

    // ── Build monthly burn array (oldest first for trend) ─────────────────────
    // slots is newest first; reverse for trend
    const slotsOldestFirst = [...slots].reverse()
    const monthlyBurns = slotsOldestFirst.map(s => burnByMonth[s.key] ?? 0)
    const monthlyRevs = slotsOldestFirst.map(s => revByMonth[s.key] ?? 0)

    // ── Averages using last 3 months (newest 3) ────────────────────────────────
    const last3Burns = monthlyBurns.slice(-3)
    const last3Revs = monthlyRevs.slice(-3)
    const avgBurn =
      last3Burns.length > 0
        ? round2(last3Burns.reduce((s, v) => s + v, 0) / last3Burns.length)
        : 0
    const avgRev =
      last3Revs.length > 0
        ? round2(last3Revs.reduce((s, v) => s + v, 0) / last3Revs.length)
        : 0

    // ── Derived metrics ────────────────────────────────────────────────────────
    const netBurn = computeNetBurn(avgBurn, avgRev)
    const runwayMonths =
      cashBalance !== null ? computeRunwayMonths(cashBalance, netBurn) : null
    const runwayHealth = classifyRunwayHealth(runwayMonths)

    const efficiencyRatio = computeBurnEfficiencyRatio(avgRev, avgBurn)
    const burnEfficiency = classifyBurnEfficiency(efficiencyRatio)

    // ── Decomposition (latest month expenses) ─────────────────────────────────
    const latestKey = slots[0].key
    const latestExpenses = expenseRows
      .filter(r => r.key === latestKey)
      .map(r => ({ category: r.category, amount: r.amount }))

    const latestBurnTotal = burnByMonth[latestKey] ?? 0
    const decomposition = computeBurnDecomposition(
      latestExpenses,
      latestBurnTotal,
      FIXED_CATEGORIES,
    )

    // ── Trend ─────────────────────────────────────────────────────────────────
    const burnTrend = computeMonthlyBurnTrend(monthlyBurns, 3)

    // ── Scenarios ─────────────────────────────────────────────────────────────
    const scenarios = buildBurnScenarios(
      avgBurn,
      avgRev,
      cashBalance ?? 0,
    )

    // ── Ideal burn for 12-month runway ────────────────────────────────────────
    const idealBurn = computeIdealBurnForRunway(
      cashBalance ?? 0,
      12,
      avgRev,
    )

    // ── Narrative ─────────────────────────────────────────────────────────────
    const narrative = generateBurnNarrative(
      runwayHealth,
      runwayMonths,
      burnEfficiency,
      netBurn,
    )

    return {
      monthly_gross_burn: avgBurn,
      monthly_revenue: avgRev,
      monthly_net_burn: netBurn,
      cash_balance: cashBalance,
      runway_months: runwayMonths,
      runway_health: runwayHealth,
      burn_efficiency_ratio: efficiencyRatio,
      burn_efficiency: burnEfficiency,
      burn_decomposition: decomposition,
      burn_scenarios: scenarios,
      burn_trend: burnTrend,
      ideal_burn_for_12_month_runway: idealBurn,
      narrative,
    }
  }
}
