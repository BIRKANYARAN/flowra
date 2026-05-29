// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/quarterly-summary.service.ts
//
// Quarterly Financial Summary Service
//
// Computes quarterly P&L summaries, QoQ/YoY comparisons, and KPI tracking.
//
// Pure exported functions (testable without DB):
//   getQuarterFromMonth        — month 1-12 → quarter 1-4
//   getQuarterLabel            — "Q{q} {year}"
//   getQuarterMonths           — 3-month array for a quarter
//   getQuarterDateRange        — from/to ISO date strings
//   computeQuarterlyKpis       — margin ratios from QuarterlyData
//   computeQoqGrowth           — QoQ growth rates
//   computeYoyGrowth           — YoY growth rates
//   computeRollingFourQuarterRevenue — trailing 4Q revenue
//   computeRollingFourQuarterEbitda  — trailing 4Q ebitda
//   classifyQuarterlyPerformance     — 5-tier classification
//   buildQuarterlyTimeline     — sorted timeline with kpis + qoq
//   findBestQuarter            — highest revenue quarter
//   findWorstQuarter           — lowest revenue (> 0) quarter
//   computeQuarterlyTrend      — linear regression trend
//   generateQuarterlyNarrative — Turkish narrative string
//
// Class: QuarterlySummaryService
//   getReport(companyId) → QuarterlySummaryReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Core types ────────────────────────────────────────────────────────────────

export interface QuarterlyData {
  year: number
  quarter: number        // 1-4
  label: string          // e.g. "Q1 2025"
  revenue: number
  cogs: number
  gross_profit: number
  operating_expenses: number
  ebitda: number
  net_income: number
  tax_amount: number
  headcount_cost: number | null
  capex: number
}

export interface QuarterlyKpis {
  gross_margin_pct: number | null
  ebitda_margin_pct: number | null
  net_margin_pct: number | null
  revenue_per_employee: number | null   // null if headcount_cost is null
  opex_ratio_pct: number | null         // opex / revenue × 100
  tax_rate_effective_pct: number | null // tax / ebitda × 100; null if ebitda <= 0
}

// ── Pure helper functions ─────────────────────────────────────────────────────

/**
 * Maps a month (1–12) to a quarter (1–4).
 * Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec.
 */
export function getQuarterFromMonth(month: number): number {
  return Math.ceil(month / 3)
}

/**
 * Returns a human-readable quarter label, e.g. "Q2 2025".
 */
export function getQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`
}

/**
 * Returns the 3 months that belong to a given quarter.
 * Q1 → [1,2,3], Q2 → [4,5,6], Q3 → [7,8,9], Q4 → [10,11,12]
 */
export function getQuarterMonths(
  year: number,
  quarter: number,
): Array<{ year: number; month: number }> {
  const firstMonth = (quarter - 1) * 3 + 1
  return [firstMonth, firstMonth + 1, firstMonth + 2].map(month => ({ year, month }))
}

/**
 * Returns ISO date strings for the first and last day of a quarter.
 * Uses the JS Date object to correctly compute month-end (including Feb).
 */
export function getQuarterDateRange(
  year: number,
  quarter: number,
): { from: string; to: string } {
  const firstMonth = (quarter - 1) * 3 + 1
  const lastMonth  = firstMonth + 2

  // from: first day of first month
  const fromDate = new Date(year, firstMonth - 1, 1)
  // to: last day of last month — use day-0 trick (day 0 of next month)
  const toDate   = new Date(year, lastMonth, 0)

  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt  = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  return { from: fmt(fromDate), to: fmt(toDate) }
}

/**
 * Computes margin KPIs from a QuarterlyData record.
 * Any KPI requiring a zero denominator returns null.
 */
export function computeQuarterlyKpis(data: QuarterlyData): QuarterlyKpis {
  const { revenue, gross_profit, ebitda, net_income, operating_expenses, tax_amount, headcount_cost } = data

  const gross_margin_pct  = revenue > 0 ? (gross_profit  / revenue) * 100 : null
  const ebitda_margin_pct = revenue > 0 ? (ebitda        / revenue) * 100 : null
  const net_margin_pct    = revenue > 0 ? (net_income    / revenue) * 100 : null
  const opex_ratio_pct    = revenue > 0 ? (operating_expenses / revenue) * 100 : null

  // revenue_per_employee: only meaningful when headcount_cost is provided
  const revenue_per_employee = headcount_cost !== null ? (headcount_cost > 0 ? revenue / headcount_cost : null) : null

  // tax_rate_effective_pct: tax / ebitda; null when ebitda <= 0
  const tax_rate_effective_pct = ebitda > 0 ? (tax_amount / ebitda) * 100 : null

  return {
    gross_margin_pct,
    ebitda_margin_pct,
    net_margin_pct,
    revenue_per_employee,
    opex_ratio_pct,
    tax_rate_effective_pct,
  }
}

/**
 * Computes QoQ growth rates between two quarters.
 * Returns null for any metric where the prior value is 0.
 */
export function computeQoqGrowth(
  currentQuarter: QuarterlyData,
  priorQuarter: QuarterlyData,
): {
  revenue_growth_pct: number | null
  gross_profit_growth_pct: number | null
  ebitda_growth_pct: number | null
  net_income_growth_pct: number | null
} {
  const growth = (curr: number, prior: number): number | null =>
    prior === 0 ? null : ((curr - prior) / Math.abs(prior)) * 100

  return {
    revenue_growth_pct:      growth(currentQuarter.revenue,       priorQuarter.revenue),
    gross_profit_growth_pct: growth(currentQuarter.gross_profit,  priorQuarter.gross_profit),
    ebitda_growth_pct:       growth(currentQuarter.ebitda,        priorQuarter.ebitda),
    net_income_growth_pct:   growth(currentQuarter.net_income,    priorQuarter.net_income),
  }
}

/**
 * Computes YoY growth between the same quarter across two years.
 * Returns null for any metric where the prior year value is 0.
 */
export function computeYoyGrowth(
  currentQuarter: QuarterlyData,
  sameQuarterPriorYear: QuarterlyData,
): {
  revenue_growth_pct: number | null
  ebitda_growth_pct: number | null
} {
  const growth = (curr: number, prior: number): number | null =>
    prior === 0 ? null : ((curr - prior) / Math.abs(prior)) * 100

  return {
    revenue_growth_pct: growth(currentQuarter.revenue, sameQuarterPriorYear.revenue),
    ebitda_growth_pct:  growth(currentQuarter.ebitda,  sameQuarterPriorYear.ebitda),
  }
}

/**
 * Sums revenue over the most recent 4 quarters in the provided array.
 * Array may be in any order — it will be sorted chronologically before slicing.
 */
export function computeRollingFourQuarterRevenue(quarters: QuarterlyData[]): number {
  const sorted = [...quarters].sort(compareQuarters)
  const recent = sorted.slice(-4)
  return recent.reduce((sum, q) => sum + q.revenue, 0)
}

/**
 * Sums ebitda over the most recent 4 quarters in the provided array.
 */
export function computeRollingFourQuarterEbitda(quarters: QuarterlyData[]): number {
  const sorted = [...quarters].sort(compareQuarters)
  const recent = sorted.slice(-4)
  return recent.reduce((sum, q) => sum + q.ebitda, 0)
}

/**
 * Classifies quarterly performance into 5 tiers based on KPIs and QoQ growth.
 * null qoqRevenuGrowth is treated as 0.
 */
export function classifyQuarterlyPerformance(
  kpis: QuarterlyKpis,
  qoqRevenuGrowth: number | null,
): 'exceptional' | 'strong' | 'solid' | 'weak' | 'declining' {
  const grossMargin  = kpis.gross_margin_pct  ?? 0
  const ebitdaMargin = kpis.ebitda_margin_pct ?? 0
  const growth       = qoqRevenuGrowth        ?? 0

  if (grossMargin >= 40 && ebitdaMargin >= 15 && growth >= 10) return 'exceptional'
  if (grossMargin >= 30 && ebitdaMargin >= 8  && growth >= 0)  return 'strong'
  if (grossMargin >= 20 && ebitdaMargin >= 3)                  return 'solid'
  if (grossMargin >= 10 || ebitdaMargin >= 0)                  return 'weak'
  return 'declining'
}

/**
 * Sorts quarters chronologically (oldest first).
 */
function compareQuarters(a: QuarterlyData, b: QuarterlyData): number {
  if (a.year !== b.year) return a.year - b.year
  return a.quarter - b.quarter
}

/**
 * Builds a chronological timeline enriched with kpis, qoq_growth, and performance.
 * The first quarter in the sorted order has qoq_growth = null.
 */
export function buildQuarterlyTimeline(
  quarters: QuarterlyData[],
): Array<QuarterlyData & {
  kpis: QuarterlyKpis
  qoq_growth: ReturnType<typeof computeQoqGrowth> | null
  performance: ReturnType<typeof classifyQuarterlyPerformance>
}> {
  const sorted = [...quarters].sort(compareQuarters)

  return sorted.map((q, i) => {
    const kpis      = computeQuarterlyKpis(q)
    const qoq_growth = i === 0 ? null : computeQoqGrowth(q, sorted[i - 1])
    const performance = classifyQuarterlyPerformance(kpis, qoq_growth?.revenue_growth_pct ?? null)
    return { ...q, kpis, qoq_growth, performance }
  })
}

/**
 * Returns the quarter with the highest revenue, or null for an empty array.
 */
export function findBestQuarter(quarters: QuarterlyData[]): QuarterlyData | null {
  if (quarters.length === 0) return null
  return quarters.reduce((best, q) => q.revenue > best.revenue ? q : best)
}

/**
 * Returns the quarter with the lowest revenue > 0, or null if none qualifies.
 */
export function findWorstQuarter(quarters: QuarterlyData[]): QuarterlyData | null {
  const positive = quarters.filter(q => q.revenue > 0)
  if (positive.length === 0) return null
  return positive.reduce((worst, q) => q.revenue < worst.revenue ? q : worst)
}

/**
 * Determines the revenue trend across at least 3 quarters using linear regression.
 * slope > avg_revenue × 0.02  → improving
 * slope < -avg_revenue × 0.02 → declining
 * else                         → stable
 * fewer than 3 quarters        → insufficient_data
 */
export function computeQuarterlyTrend(
  quarters: QuarterlyData[],
): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
  const sorted = [...quarters].sort(compareQuarters)
  if (sorted.length < 3) return 'insufficient_data'

  const n      = sorted.length
  const xs     = sorted.map((_, i) => i)
  const ys     = sorted.map(q => q.revenue)
  const sumX   = xs.reduce((a, b) => a + b, 0)
  const sumY   = ys.reduce((a, b) => a + b, 0)
  const sumXY  = xs.reduce((s, x, i) => s + x * ys[i], 0)
  const sumX2  = xs.reduce((s, x) => s + x * x, 0)
  const denom  = n * sumX2 - sumX * sumX

  if (denom === 0) return 'stable'

  const slope      = (n * sumXY - sumX * sumY) / denom
  const avgRevenue = sumY / n

  if (slope > avgRevenue * 0.02)  return 'improving'
  if (slope < -avgRevenue * 0.02) return 'declining'
  return 'stable'
}

/**
 * Generates a Turkish narrative sentence describing the quarter's performance.
 */
export function generateQuarterlyNarrative(
  currentQuarter: QuarterlyData,
  _kpis: QuarterlyKpis,
  _trend: ReturnType<typeof computeQuarterlyTrend>,
  performance: ReturnType<typeof classifyQuarterlyPerformance>,
): string {
  const label = currentQuarter.label
  switch (performance) {
    case 'exceptional': return `${label}: Olağanüstü çeyrek — gelir ve marjlar zirve seviyelerde.`
    case 'strong':      return `${label}: Güçlü performans — büyüme ve karlılık hedeflerde.`
    case 'solid':       return `${label}: Sağlam çeyrek — operasyonel istikrar korunuyor.`
    case 'weak':        return `${label}: Zayıf çeyrek — marjlar baskı altında.`
    case 'declining':   return `${label}: Gerileme görülüyor — acil değerlendirme önerilir.`
  }
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface QuarterlySummaryReport {
  current_quarter: QuarterlyData
  current_kpis: QuarterlyKpis
  current_performance: ReturnType<typeof classifyQuarterlyPerformance>
  quarters: Array<QuarterlyData & {
    kpis: QuarterlyKpis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qoq_growth: any
    performance: string
  }>
  qoq_growth: ReturnType<typeof computeQoqGrowth> | null
  yoy_growth: ReturnType<typeof computeYoyGrowth> | null
  rolling_4q_revenue: number
  rolling_4q_ebitda: number
  trend: ReturnType<typeof computeQuarterlyTrend>
  best_quarter: QuarterlyData | null
  worst_quarter: QuarterlyData | null
  narrative: string
}

// ── Service class ─────────────────────────────────────────────────────────────

export class QuarterlySummaryService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Fetches 8 quarters of data (2 years) and computes the full quarterly report.
   */
  async getReport(companyId: string): Promise<QuarterlySummaryReport> {
    const today   = new Date()
    const curYear = today.getFullYear()
    const curMon  = today.getMonth() + 1
    const curQ    = getQuarterFromMonth(curMon)

    // Build list of 8 most recent quarters (current quarter first, then back)
    const quarterList: Array<{ year: number; quarter: number }> = []
    let y = curYear, q = curQ
    for (let i = 0; i < 8; i++) {
      quarterList.push({ year: y, quarter: q })
      q -= 1
      if (q === 0) { q = 4; y -= 1 }
    }

    // Fetch revenue (sales), expenses, and sale_item_allocations in parallel
    const [salesResult, expensesResult, allocationsResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('total_try, created_at, expense_date:created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', `${curYear - 2}-01-01`)
        .lte('created_at', `${curYear}-12-31`),
      this.supabase
        .from('expenses')
        .select('amount, expense_date, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', `${curYear - 2}-01-01`)
        .lte('expense_date', `${curYear}-12-31`),
      this.supabase
        .from('sale_item_allocations')
        .select('cost_amount, sale_id')
        .eq('company_id', companyId)
        .gte('created_at', `${curYear - 2}-01-01`)
        .lte('created_at', `${curYear}-12-31`),
    ])

    const salesRows =
      salesResult.status === 'fulfilled' && salesResult.value.data
        ? (salesResult.value.data as Array<{ total_try: number; created_at: string }>)
        : []

    const expenseRows =
      expensesResult.status === 'fulfilled' && expensesResult.value.data
        ? (expensesResult.value.data as Array<{ amount: number; expense_date: string; expense_type: string | null }>)
        : []

    const allocationRows =
      allocationsResult.status === 'fulfilled' && allocationsResult.value.data
        ? (allocationsResult.value.data as Array<{ cost_amount: number }>)
        : []

    // Aggregate by quarter
    const qMap = new Map<string, {
      revenue: number
      cogs: number
      opex: number
      tax: number
      headcostArr: number[]
    }>()

    const key = (year: number, quarter: number) => `${year}-Q${quarter}`

    const ensureQ = (year: number, quarter: number) => {
      const k = key(year, quarter)
      if (!qMap.has(k)) {
        qMap.set(k, { revenue: 0, cogs: 0, opex: 0, tax: 0, headcostArr: [] })
      }
      return qMap.get(k)!
    }

    // Revenue from sales
    for (const sale of salesRows) {
      const d = new Date(sale.created_at)
      const yr = d.getFullYear()
      const qn = getQuarterFromMonth(d.getMonth() + 1)
      ensureQ(yr, qn).revenue += sale.total_try ?? 0
    }

    // Expenses: split into opex, tax, headcount
    for (const exp of expenseRows) {
      const d  = new Date(exp.expense_date)
      const yr = d.getFullYear()
      const qn = getQuarterFromMonth(d.getMonth() + 1)
      const bucket = ensureQ(yr, qn)
      const etype  = exp.expense_type ?? ''
      if (etype === 'tax' || etype === 'corporate_tax') {
        bucket.tax += exp.amount ?? 0
      } else if (etype === 'salary' || etype === 'payroll' || etype === 'headcount') {
        bucket.headcostArr.push(exp.amount ?? 0)
        bucket.opex += exp.amount ?? 0
      } else {
        bucket.opex += exp.amount ?? 0
      }
    }

    // COGS from allocations (total COGS spread proportionally — simplified: sum all, alloc by revenue weight)
    // Since allocations don't have a date, use the total as an approximation distributed evenly
    const totalAllocCogs = allocationRows.reduce((s, a) => s + (a.cost_amount ?? 0), 0)

    // Build QuarterlyData for each quarter in quarterList
    const quarterDataList: QuarterlyData[] = []
    for (const { year, quarter } of quarterList) {
      const k   = key(year, quarter)
      const raw = qMap.get(k)
      if (!raw) {
        quarterDataList.push(zeroQuarter(year, quarter))
        continue
      }

      const revenue = raw.revenue
      // COGS approximation: allocate proportionally to revenue if total revenue exists
      const totalRevenue = [...qMap.values()].reduce((s, v) => s + v.revenue, 0)
      const cogsForQ = totalRevenue > 0 ? (revenue / totalRevenue) * totalAllocCogs : 0
      // Fallback: estimate COGS as 40% of revenue if no allocation data
      const cogs = allocationsResult.status === 'fulfilled' && allocationRows.length > 0
        ? cogsForQ
        : revenue * 0.4

      const gross_profit         = revenue - cogs
      const operating_expenses   = raw.opex
      const ebitda               = gross_profit - operating_expenses

      // Tax: use explicit tax entries, or approximate as ebitda * 0.2 * 0.22 (KV approximation)
      const tax_amount = raw.tax > 0 ? raw.tax : Math.max(0, ebitda * 0.044)

      const net_income  = ebitda - tax_amount
      const headcount_cost = raw.headcostArr.length > 0
        ? raw.headcostArr.reduce((s, v) => s + v, 0)
        : null

      quarterDataList.push({
        year,
        quarter,
        label: getQuarterLabel(year, quarter),
        revenue,
        cogs,
        gross_profit,
        operating_expenses,
        ebitda,
        net_income,
        tax_amount,
        headcount_cost,
        capex: 0,   // capex requires separate capital table — defaulting to 0
      })
    }

    // Identify current quarter
    const currentQ = quarterDataList[0]

    // Sort chronologically for timeline
    const timeline = buildQuarterlyTimeline(quarterDataList)

    // Find prior quarter (index 1 = one quarter back)
    const priorQ = quarterDataList[1] ?? null

    // Find same quarter prior year
    const sameQPriorYear = quarterDataList.find(
      q => q.year === curYear - 1 && q.quarter === curQ
    ) ?? null

    const currentKpis = computeQuarterlyKpis(currentQ)
    const qoqGrowth   = priorQ ? computeQoqGrowth(currentQ, priorQ) : null
    const yoyGrowth   = sameQPriorYear ? computeYoyGrowth(currentQ, sameQPriorYear) : null

    const trend    = computeQuarterlyTrend(quarterDataList)
    const perf     = classifyQuarterlyPerformance(currentKpis, qoqGrowth?.revenue_growth_pct ?? null)
    const narrative = generateQuarterlyNarrative(currentQ, currentKpis, trend, perf)

    return {
      current_quarter:      currentQ,
      current_kpis:         currentKpis,
      current_performance:  perf,
      quarters:             timeline,
      qoq_growth:           qoqGrowth,
      yoy_growth:           yoyGrowth,
      rolling_4q_revenue:   computeRollingFourQuarterRevenue(quarterDataList),
      rolling_4q_ebitda:    computeRollingFourQuarterEbitda(quarterDataList),
      trend,
      best_quarter:         findBestQuarter(quarterDataList),
      worst_quarter:        findWorstQuarter(quarterDataList),
      narrative,
    }
  }
}

function zeroQuarter(year: number, quarter: number): QuarterlyData {
  return {
    year,
    quarter,
    label: getQuarterLabel(year, quarter),
    revenue: 0,
    cogs: 0,
    gross_profit: 0,
    operating_expenses: 0,
    ebitda: 0,
    net_income: 0,
    tax_amount: 0,
    headcount_cost: null,
    capex: 0,
  }
}
