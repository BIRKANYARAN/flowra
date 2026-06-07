// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/financial-benchmarking.service.ts
//
// Financial Benchmarking — Turkish SME Industry Percentile Positioning
//
// Compares a company's financial metrics against Turkish SME benchmarks,
// producing a percentile-style positioning report.
//
// All pure functions are exported for testability.
// FinancialBenchmarkingService class handles DB orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish SME Benchmarks ────────────────────────────────────────────────────

// Turkish SME industry benchmarks (2024 data for manufacturing/trading SMEs)
export const TURKISH_SME_BENCHMARKS = {
  gross_margin_pct:        { p25: 15, p50: 28, p75: 42 },
  net_margin_pct:          { p25: 2,  p50: 8,  p75: 15 },
  ebitda_margin_pct:       { p25: 5,  p50: 12, p75: 22 },
  current_ratio:           { p25: 0.8, p50: 1.2, p75: 1.8 },
  quick_ratio:             { p25: 0.5, p50: 0.9, p75: 1.4 },
  dso_days:                { p25: 15, p50: 35, p75: 60 },    // lower is better
  dpo_days:                { p25: 15, p50: 30, p75: 50 },
  inventory_turnover_x:    { p25: 3,  p50: 6,  p75: 12 },
  revenue_growth_pct:      { p25: -5, p50: 12, p75: 30 },
  debt_to_equity:          { p25: 0.2, p50: 0.6, p75: 1.5 }, // lower is better
  operating_expense_ratio: { p25: 10, p50: 20, p75: 35 },    // lower is better
  receivables_turnover_x:  { p25: 4,  p50: 8,  p75: 18 },
} as const

// ── Percentile Positioning ────────────────────────────────────────────────────

/**
 * Estimate percentile position of a value within a benchmark distribution.
 * Uses linear interpolation between p25/p50/p75 anchor points.
 *
 * For 'higher_is_better' metrics:
 *   value < p25  → 0-25 (interpolate)
 *   value < p50  → 25-50 (interpolate)
 *   value < p75  → 50-75 (interpolate)
 *   value >= p75 → 75-100 (interpolate, cap at 95)
 *
 * For 'lower_is_better' metrics (DSO, DPO, debt_to_equity, opex_ratio):
 *   Invert: value below p25 → high percentile; value above p75 → low percentile
 *
 * Returns null if value is null.
 */
export function estimatePercentile(
  value: number | null,
  benchmark: { p25: number; p50: number; p75: number },
  direction: 'higher_is_better' | 'lower_is_better',
): number | null {
  if (value === null) return null

  const { p25, p50, p75 } = benchmark

  // For lower_is_better we invert the value axis by computing a mirrored percentile
  const effectiveValue = direction === 'lower_is_better'
    ? p25 + p75 - value   // mirror around the midpoint of p25/p75
    : value

  const effectiveP25 = direction === 'lower_is_better' ? p25 + p75 - p75 : p25  // = p25
  const effectiveP50 = direction === 'lower_is_better' ? p25 + p75 - p50 : p50
  const effectiveP75 = direction === 'lower_is_better' ? p25 + p75 - p25 : p75  // = p75

  // Re-order for lower_is_better (mirrored points are flipped)
  const lo = Math.min(effectiveP25, effectiveP75)
  const mid = effectiveP50
  const hi = Math.max(effectiveP25, effectiveP75)

  if (effectiveValue < lo) {
    // Below p25: 0-25
    const range = lo
    if (range <= 0) return 0
    const frac = Math.max(0, effectiveValue / range)
    return Math.max(0, Math.min(25, frac * 25))
  } else if (effectiveValue < mid) {
    // p25-p50: 25-50
    const range = mid - lo
    if (range <= 0) return 25
    const frac = (effectiveValue - lo) / range
    return 25 + frac * 25
  } else if (effectiveValue < hi) {
    // p50-p75: 50-75
    const range = hi - mid
    if (range <= 0) return 50
    const frac = (effectiveValue - mid) / range
    return 50 + frac * 25
  } else {
    // Above p75: 75-95
    const range = hi
    if (range <= 0) return 75
    const excess = effectiveValue - hi
    // Each additional unit above p75 adds diminishing percentile, cap at 95
    const frac = Math.min(1, excess / range)
    return Math.min(95, 75 + frac * 20)
  }
}

/**
 * Classify percentile position.
 * >= 75: 'top_quartile'
 * >= 50: 'above_median'
 * >= 25: 'below_median'
 * <  25: 'bottom_quartile'
 * null:  'no_data'
 */
export function classifyPercentilePosition(
  percentile: number | null,
): 'top_quartile' | 'above_median' | 'below_median' | 'bottom_quartile' | 'no_data' {
  if (percentile === null) return 'no_data'
  if (percentile >= 75) return 'top_quartile'
  if (percentile >= 50) return 'above_median'
  if (percentile >= 25) return 'below_median'
  return 'bottom_quartile'
}

/**
 * Compute gap to median: value - p50.
 * For 'lower_is_better': positive gap = worse than median (above p50 when you want below).
 * Returns null if value is null.
 */
export function computeGapToMedian(
  value: number | null,
  benchmark: { p50: number },
): number | null {
  if (value === null) return null
  return value - benchmark.p50
}

/**
 * Compute gap to top quartile (p75 for higher_is_better, p25 for lower_is_better).
 * Positive = already above top quartile threshold.
 * Negative = gap remaining to reach top quartile.
 * Returns null if value is null.
 */
export function computeGapToTopQuartile(
  value: number | null,
  benchmark: { p25: number; p75: number },
  direction: 'higher_is_better' | 'lower_is_better',
): number | null {
  if (value === null) return null
  const threshold = direction === 'higher_is_better' ? benchmark.p75 : benchmark.p25
  return direction === 'higher_is_better'
    ? value - threshold
    : threshold - value  // positive = better than threshold (below p25 when lower_is_better)
}

// ── Composite Benchmark Score ─────────────────────────────────────────────────

/**
 * Compute composite benchmark score (0-100).
 * Simple average of all non-null percentile estimates.
 * Returns null if no valid percentiles.
 */
export function computeCompositeBenchmarkScore(
  percentiles: Array<number | null>,
): number | null {
  const valid = percentiles.filter((p): p is number => p !== null)
  if (valid.length === 0) return null
  const avg = valid.reduce((sum, p) => sum + p, 0) / valid.length
  return Math.round(avg * 10) / 10
}

/**
 * Classify composite benchmark score.
 * 'industry_leader':    >= 75
 * 'above_average':      >= 55
 * 'average':            >= 40
 * 'below_average':      >= 25
 * 'lagging':            <  25
 * 'insufficient_data':  null
 */
export function classifyBenchmarkPosition(
  score: number | null,
): 'industry_leader' | 'above_average' | 'average' | 'below_average' | 'lagging' | 'insufficient_data' {
  if (score === null) return 'insufficient_data'
  if (score >= 75) return 'industry_leader'
  if (score >= 55) return 'above_average'
  if (score >= 40) return 'average'
  if (score >= 25) return 'below_average'
  return 'lagging'
}

// ── Benchmark Comparison ──────────────────────────────────────────────────────

/**
 * Build a single benchmark comparison for one metric.
 */
export interface BenchmarkComparison {
  metric_key:          string
  metric_label_tr:     string
  value:               number | null
  benchmark_p25:       number
  benchmark_p50:       number
  benchmark_p75:       number
  estimated_percentile: number | null
  position:            ReturnType<typeof classifyPercentilePosition>
  gap_to_median:       number | null
  gap_to_top_quartile: number | null
  direction:           'higher_is_better' | 'lower_is_better'
}

export function buildBenchmarkComparison(
  metricKey: keyof typeof TURKISH_SME_BENCHMARKS,
  metricLabelTr: string,
  value: number | null,
  direction: 'higher_is_better' | 'lower_is_better',
): BenchmarkComparison {
  const benchmark = TURKISH_SME_BENCHMARKS[metricKey]
  const percentile = estimatePercentile(value, benchmark, direction)
  return {
    metric_key:           metricKey,
    metric_label_tr:      metricLabelTr,
    value,
    benchmark_p25:        benchmark.p25,
    benchmark_p50:        benchmark.p50,
    benchmark_p75:        benchmark.p75,
    estimated_percentile: percentile,
    position:             classifyPercentilePosition(percentile),
    gap_to_median:        computeGapToMedian(value, benchmark),
    gap_to_top_quartile:  computeGapToTopQuartile(value, benchmark, direction),
    direction,
  }
}

// ── Strengths & Weaknesses ────────────────────────────────────────────────────

/**
 * Identify top N strengths (highest percentile comparisons).
 */
export function identifyStrengths(
  comparisons: BenchmarkComparison[],
  n = 3,
): BenchmarkComparison[] {
  return comparisons
    .filter(c => c.estimated_percentile !== null)
    .sort((a, b) => (b.estimated_percentile ?? 0) - (a.estimated_percentile ?? 0))
    .slice(0, n)
}

/**
 * Identify top N weaknesses (lowest percentile comparisons).
 */
export function identifyWeaknesses(
  comparisons: BenchmarkComparison[],
  n = 3,
): BenchmarkComparison[] {
  return comparisons
    .filter(c => c.estimated_percentile !== null)
    .sort((a, b) => (a.estimated_percentile ?? 0) - (b.estimated_percentile ?? 0))
    .slice(0, n)
}

/**
 * Generate Turkish benchmarking narrative.
 */
export function generateBenchmarkNarrative(
  position: ReturnType<typeof classifyBenchmarkPosition>,
  score: number | null,
  strengthCount: number,   // top_quartile count
  weaknessCount: number,   // bottom_quartile count
): string {
  const scoreStr = score !== null ? ` (skor: ${score.toFixed(1)})` : ''

  switch (position) {
    case 'industry_leader':
      return `Şirket sektör lideri konumunda${scoreStr} — ${strengthCount} metrikte üst çeyrekte, rakiplerin önünde.`
    case 'above_average':
      return `Şirket sektör ortalamasının üzerinde performans gösteriyor${scoreStr} — ${strengthCount} güçlü alan mevcut${weaknessCount > 0 ? `, ${weaknessCount} alanda iyileştirme fırsatı var` : ''}.`
    case 'average':
      return `Şirket sektör ortalamasında${scoreStr} — ${weaknessCount > 0 ? `${weaknessCount} zayıf alanda odaklanarak üst ortalamaya çıkılabilir` : 'dengeli bir performans sergileniyor'}.`
    case 'below_average':
      return `Şirket sektör ortalamasının altında${scoreStr} — ${weaknessCount} kritik alanda acil iyileştirme gerekiyor${strengthCount > 0 ? `, ${strengthCount} güçlü alan üzerine inşa edilebilir` : ''}.`
    case 'lagging':
      return `Şirket sektörün gerisinde${scoreStr} — tüm temel metriklerde kapsamlı operasyonel dönüşüm gerekiyor.`
    case 'insufficient_data':
      return 'Kıyaslama analizi için yeterli finansal veri bulunamadı.'
  }
}

// ── Report Interface ──────────────────────────────────────────────────────────

export interface FinancialBenchmarkReport {
  as_of_date: string

  // Individual metric comparisons
  comparisons: BenchmarkComparison[]

  // Composite
  composite_score:    number | null
  benchmark_position: ReturnType<typeof classifyBenchmarkPosition>

  // Strengths & weaknesses
  strengths:  BenchmarkComparison[]  // top_quartile metrics, sorted by percentile desc
  weaknesses: BenchmarkComparison[]  // bottom_quartile metrics, sorted by percentile asc

  // Count summary
  top_quartile_count:    number
  above_median_count:    number
  below_median_count:    number
  bottom_quartile_count: number

  narrative: string
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class FinancialBenchmarkingService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<FinancialBenchmarkReport> {
    const now     = new Date()
    const asOfDate = now.toISOString().slice(0, 10)

    // Date ranges
    const last12Start = new Date(now)
    last12Start.setFullYear(last12Start.getFullYear() - 1)
    const prior12Start = new Date(last12Start)
    prior12Start.setFullYear(prior12Start.getFullYear() - 1)

    const last12StartStr  = last12Start.toISOString().slice(0, 10)
    const prior12StartStr = prior12Start.toISOString().slice(0, 10)

    // Build YYYY-MM period strings for last 12 months
    const last12Periods: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      last12Periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const prior12Periods: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear() - 1, now.getMonth() - i, 1)
      prior12Periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    // ── Parallel data fetches ─────────────────────────────────────────────────

    const [
      salesLast12Result,
      salesPrior12Result,
      expensesLast12Result,
      balanceResult,
      stockLotsResult,
      partnerLoanResult,
      partnerCapitalResult,
    ] = await Promise.allSettled([
      // 1. Sales last 12 months
      this.supabase
        .from('sales')
        .select('amount, period, status, paid_at, due_date')
        .eq('company_id', companyId)
        .in('period', last12Periods),

      // 2. Sales prior 12 months (for YoY growth)
      this.supabase
        .from('sales')
        .select('amount, period')
        .eq('company_id', companyId)
        .in('period', prior12Periods),

      // 3. Expenses last 12 months
      this.supabase
        .from('expenses')
        .select('amount, period, category, expense_type')
        .eq('company_id', companyId)
        .in('period', last12Periods),

      // 4. Balance sheet snapshot — latest
      this.supabase
        .from('balance_sheet_snapshots')
        .select('current_assets, current_liabilities, cash_and_equivalents, inventory_value, accounts_receivable, accounts_payable')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 5. Stock lots for inventory
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, unit_cost, created_at')
        .eq('company_id', companyId),

      // 6. Partner loan tranches
      this.supabase
        .from('partner_loan_tranches')
        .select('remaining_balance, outstanding_balance')
        .eq('company_id', companyId)
        .eq('status', 'active'),

      // 7. Partner capital commitments
      this.supabase
        .from('partner_capital_commitments')
        .select('committed_try, paid_try')
        .eq('company_id', companyId),
    ])

    // ── Extract data gracefully ───────────────────────────────────────────────

    type SaleRow     = { amount: number; period: string; status?: string; paid_at?: string | null; due_date?: string | null }
    type ExpenseRow  = { amount: number; period: string; category?: string; expense_type?: string }
    type StockLot    = { qty_remaining: number; unit_cost: number; created_at: string }
    type LoanRow     = { remaining_balance?: number; outstanding_balance?: number }
    type CapitalRow  = { committed_try: number; paid_try?: number }

    const salesLast12  = salesLast12Result.status  === 'fulfilled' ? (salesLast12Result.value.data  as SaleRow[]   ?? []) : [] as SaleRow[]
    const salesPrior12 = salesPrior12Result.status === 'fulfilled' ? (salesPrior12Result.value.data as SaleRow[]   ?? []) : [] as SaleRow[]
    const expenses     = expensesLast12Result.status === 'fulfilled' ? (expensesLast12Result.value.data as ExpenseRow[] ?? []) : [] as ExpenseRow[]
    const balance      = balanceResult.status === 'fulfilled' ? balanceResult.value.data : null
    const stockLots    = stockLotsResult.status === 'fulfilled' ? (stockLotsResult.value.data as StockLot[] ?? []) : [] as StockLot[]
    const loans        = partnerLoanResult.status === 'fulfilled' ? (partnerLoanResult.value.data as LoanRow[] ?? []) : [] as LoanRow[]
    const capital      = partnerCapitalResult.status === 'fulfilled' ? (partnerCapitalResult.value.data as CapitalRow[] ?? []) : [] as CapitalRow[]

    // ── Derived metrics ───────────────────────────────────────────────────────

    // Revenue
    const totalRevLast12  = salesLast12.reduce((s, r) => s + (r.amount ?? 0), 0)
    const totalRevPrior12 = salesPrior12.reduce((s, r) => s + (r.amount ?? 0), 0)

    // COGS proxy: cost_entries categorised as COGS (~60% of opex for trading SME if no explicit COGS)
    const cogsExpenses = expenses.filter(e =>
      e.expense_type === 'cogs' ||
      e.category === 'cogs' ||
      e.category === 'cost_of_goods' ||
      e.category === 'purchases'
    )
    const opexExpenses = expenses.filter(e =>
      !cogsExpenses.includes(e) &&
      e.expense_type !== 'loan_repayment' &&
      e.expense_type !== 'partner_financing' &&
      e.expense_type !== 'dividend' &&
      e.category !== 'principal' &&
      e.category !== 'dividend'
    )

    const totalCogs = cogsExpenses.length > 0
      ? cogsExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)
      : expenses.reduce((s, e) => s + (e.amount ?? 0), 0) * 0.6  // fallback: 60% of total costs

    const totalOpex = opexExpenses.reduce((s, e) => s + (e.amount ?? 0), 0)

    // Margin metrics
    const grossProfit = totalRevLast12 - totalCogs
    const grossMarginPct: number | null = totalRevLast12 > 0
      ? (grossProfit / totalRevLast12) * 100
      : null

    const totalExpenses = expenses.reduce((s, e) => s + (e.amount ?? 0), 0)
    const netProfit = totalRevLast12 - totalExpenses
    const netMarginPct: number | null = totalRevLast12 > 0
      ? (netProfit / totalRevLast12) * 100
      : null

    // EBITDA margin: net margin + estimated D&A (approximated as 2% of revenue for SMEs)
    const ebitdaMarginPct: number | null = netMarginPct !== null
      ? netMarginPct + 2   // simple approximation
      : null

    // Liquidity ratios — prefer balance sheet, fall back to computed
    const currentAssets:      number | null = balance?.current_assets      ?? null
    const currentLiabilities: number | null = balance?.current_liabilities ?? null
    const currentRatio: number | null = currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0
      ? currentAssets / currentLiabilities
      : null

    const inventoryOnBalance: number | null = balance?.inventory_value ?? null
    const inventoryValue = inventoryOnBalance !== null
      ? inventoryOnBalance
      : stockLots.reduce((s, lot) => s + (lot.qty_remaining ?? 0) * (lot.unit_cost ?? 0), 0)

    const quickAssets: number | null = currentAssets !== null
      ? currentAssets - inventoryValue
      : null
    const quickRatio: number | null = quickAssets !== null && currentLiabilities !== null && currentLiabilities > 0
      ? quickAssets / currentLiabilities
      : null

    // DSO — days sales outstanding
    const arBalance: number | null = balance?.accounts_receivable ?? null
    const avgDailyRevenue = totalRevLast12 / 365
    const dsoDays: number | null = arBalance !== null && avgDailyRevenue > 0
      ? arBalance / avgDailyRevenue
      : null

    // DPO — days payables outstanding
    const apBalance: number | null = balance?.accounts_payable ?? null
    const avgDailyCogs = totalCogs / 365
    const dpoDays: number | null = apBalance !== null && avgDailyCogs > 0
      ? apBalance / avgDailyCogs
      : null

    // Inventory turnover
    const avgInventory = inventoryValue  // single snapshot as proxy
    const inventoryTurnoverX: number | null = avgInventory > 0
      ? totalCogs / avgInventory
      : null

    // Revenue growth YoY
    const revenueGrowthPct: number | null = totalRevPrior12 > 0
      ? ((totalRevLast12 - totalRevPrior12) / totalRevPrior12) * 100
      : null

    // Debt to equity
    const totalLoanOutstanding = loans.reduce(
      (s, l) => s + (l.outstanding_balance ?? l.remaining_balance ?? 0), 0,
    )
    const totalCapitalCommitted = capital.reduce(
      (s, c) => s + (c.committed_try ?? 0), 0,
    )
    const debtToEquity: number | null = totalCapitalCommitted > 0
      ? totalLoanOutstanding / totalCapitalCommitted
      : null

    // Operating expense ratio (opex / revenue)
    const operatingExpenseRatio: number | null = totalRevLast12 > 0
      ? (totalOpex / totalRevLast12) * 100
      : null

    // Receivables turnover
    const receivablesTurnoverX: number | null = arBalance !== null && arBalance > 0
      ? totalRevLast12 / arBalance
      : null

    // ── Build comparisons ─────────────────────────────────────────────────────

    const comparisons: BenchmarkComparison[] = [
      buildBenchmarkComparison('gross_margin_pct',        'Brüt Kâr Marjı (%)',          grossMarginPct,           'higher_is_better'),
      buildBenchmarkComparison('net_margin_pct',          'Net Kâr Marjı (%)',            netMarginPct,             'higher_is_better'),
      buildBenchmarkComparison('ebitda_margin_pct',       'FAVÖK Marjı (%)',              ebitdaMarginPct,          'higher_is_better'),
      buildBenchmarkComparison('current_ratio',           'Cari Oran',                    currentRatio,             'higher_is_better'),
      buildBenchmarkComparison('quick_ratio',             'Asit-Test Oranı',              quickRatio,               'higher_is_better'),
      buildBenchmarkComparison('dso_days',                'Alacak Tahsilat Süresi (gün)', dsoDays,                  'lower_is_better'),
      buildBenchmarkComparison('dpo_days',                'Borç Ödeme Süresi (gün)',      dpoDays,                  'lower_is_better'),
      buildBenchmarkComparison('inventory_turnover_x',    'Stok Devir Hızı (x)',          inventoryTurnoverX,       'higher_is_better'),
      buildBenchmarkComparison('revenue_growth_pct',      'Gelir Büyümesi (%)',            revenueGrowthPct,         'higher_is_better'),
      buildBenchmarkComparison('debt_to_equity',          'Borç/Özkaynak Oranı',          debtToEquity,             'lower_is_better'),
      buildBenchmarkComparison('operating_expense_ratio', 'Faaliyet Gider Oranı (%)',     operatingExpenseRatio,    'lower_is_better'),
      buildBenchmarkComparison('receivables_turnover_x',  'Alacak Devir Hızı (x)',        receivablesTurnoverX,     'higher_is_better'),
    ]

    // ── Composite score ───────────────────────────────────────────────────────

    const compositeScore = computeCompositeBenchmarkScore(
      comparisons.map(c => c.estimated_percentile),
    )
    const benchmarkPosition = classifyBenchmarkPosition(compositeScore)

    // ── Strengths & weaknesses ────────────────────────────────────────────────

    const strengths  = comparisons.filter(c => c.position === 'top_quartile').sort(
      (a, b) => (b.estimated_percentile ?? 0) - (a.estimated_percentile ?? 0),
    )
    const weaknesses = comparisons.filter(c => c.position === 'bottom_quartile').sort(
      (a, b) => (a.estimated_percentile ?? 0) - (b.estimated_percentile ?? 0),
    )

    // ── Count summary ─────────────────────────────────────────────────────────

    const topQuartileCount    = comparisons.filter(c => c.position === 'top_quartile').length
    const aboveMedianCount    = comparisons.filter(c => c.position === 'above_median').length
    const belowMedianCount    = comparisons.filter(c => c.position === 'below_median').length
    const bottomQuartileCount = comparisons.filter(c => c.position === 'bottom_quartile').length

    const narrative = generateBenchmarkNarrative(
      benchmarkPosition,
      compositeScore,
      topQuartileCount,
      bottomQuartileCount,
    )

    return {
      as_of_date:           asOfDate,
      comparisons,
      composite_score:      compositeScore,
      benchmark_position:   benchmarkPosition,
      strengths,
      weaknesses,
      top_quartile_count:    topQuartileCount,
      above_median_count:    aboveMedianCount,
      below_median_count:    belowMedianCount,
      bottom_quartile_count: bottomQuartileCount,
      narrative,
    }
  }
}
