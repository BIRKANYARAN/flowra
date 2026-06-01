// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/margin-trend.service.ts
//
// Margin Trend Analysis Service
//
// Tracks gross margin, operating margin, and net margin trends over 12 months,
// with anomaly detection and benchmarking against Turkish SME averages.
//
// Pure functions exported for testing.
// Class: MarginTrendService → getReport(companyId): Promise<MarginTrendReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeCogsFromAllocations } from '@/lib/finance/cogs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish SME Benchmarks ─────────────────────────────────────────────────────

export const TURKISH_SME_GROSS_MARGIN_BENCHMARK     = 28.0   // %28 typical
export const TURKISH_SME_NET_MARGIN_BENCHMARK       = 8.0    // %8 typical
export const TURKISH_SME_OPERATING_MARGIN_BENCHMARK = 12.0   // %12 typical

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MonthlyMarginPoint {
  year_month:           string         // YYYY-MM
  revenue:              number
  cogs:                 number
  operating_expenses:   number
  net_income:           number
  gross_margin_pct:     number | null  // (revenue-cogs)/revenue × 100
  operating_margin_pct: number | null  // (revenue-cogs-opex)/revenue × 100
  net_margin_pct:       number | null  // net_income/revenue × 100
}

export interface MarginTrendReport {
  monthly_points:             MonthlyMarginPoint[]
  rolling_avg_gross_margin:   Array<number | null>   // 3-month rolling
  gross_margin_trend:         ReturnType<typeof classifyMarginTrend>
  net_margin_trend:           ReturnType<typeof classifyMarginTrend>
  avg_gross_margin_pct:       number | null
  avg_net_margin_pct:         number | null
  latest_gross_margin_pct:    number | null
  latest_net_margin_pct:      number | null
  gross_margin_benchmark_gap: number | null          // vs Turkish SME benchmark
  margin_health:              ReturnType<typeof classifyMarginHealth>
  anomaly_months:             string[]               // YYYY-MM of anomalous months
  best_month:                 MonthlyMarginPoint | null
  worst_month:                MonthlyMarginPoint | null
  narrative:                  string
}

// ── Pure exported functions ────────────────────────────────────────────────────

/**
 * Gross margin: (revenue - cogs) / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeGrossMarginPct(revenue: number, cogs: number): number | null {
  if (revenue === 0) return null
  return ((revenue - cogs) / revenue) * 100
}

/**
 * Operating margin: (revenue - cogs - opex) / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeOperatingMarginPct(
  revenue: number,
  cogs: number,
  opex: number,
): number | null {
  if (revenue === 0) return null
  return ((revenue - cogs - opex) / revenue) * 100
}

/**
 * Net margin: netIncome / revenue × 100.
 * Returns null if revenue === 0.
 */
export function computeNetMarginPct(revenue: number, netIncome: number): number | null {
  if (revenue === 0) return null
  return (netIncome / revenue) * 100
}

/**
 * Margin change: currentPct - priorPct.
 * Returns null if either is null.
 */
export function computeMarginChange(
  currentPct: number | null,
  priorPct: number | null,
): number | null {
  if (currentPct === null || priorPct === null) return null
  return currentPct - priorPct
}

/**
 * Rolling average margin over a sliding window.
 * Returns a same-length array. First (window-1) entries use available non-null points.
 * Null if all values in the window are null.
 */
export function computeRollingAvgMargin(
  points: Array<number | null>,
  window: number,
): Array<number | null> {
  return points.map((_, idx) => {
    const start  = Math.max(0, idx - window + 1)
    const slice  = points.slice(start, idx + 1)
    const nonNull = slice.filter((v): v is number => v !== null)
    if (nonNull.length === 0) return null
    return nonNull.reduce((a, b) => a + b, 0) / nonNull.length
  })
}

/**
 * Population standard deviation of non-null values.
 * Returns null if fewer than 2 non-null values.
 */
export function computeStddev(values: Array<number | null>): number | null {
  const nonNull = values.filter((v): v is number => v !== null)
  if (nonNull.length < 2) return null
  const mean = nonNull.reduce((a, b) => a + b, 0) / nonNull.length
  const variance = nonNull.reduce((sum, v) => sum + (v - mean) ** 2, 0) / nonNull.length
  return Math.sqrt(variance)
}

/**
 * Detect anomaly: |current - rollingAvg| > threshold × stddev.
 * Returns false if any input is null or stddev === 0.
 */
export function detectMarginAnomaly(
  currentMargin: number | null,
  rollingAvgMargin: number | null,
  stddev: number | null,
  threshold: number = 2.0,
): boolean {
  if (
    currentMargin === null ||
    rollingAvgMargin === null ||
    stddev === null ||
    stddev === 0
  ) return false
  return Math.abs(currentMargin - rollingAvgMargin) > threshold * stddev
}

/**
 * Classify margin trend using linear regression slope on non-null values.
 * CV > 0.3 (and mean != 0) → volatile (checked before direction).
 * slope > 0.5 pp/month → expanding
 * slope < -0.5 pp/month → contracting
 * else → stable
 * < minPoints non-null → insufficient_data
 */
export function classifyMarginTrend(
  margins: Array<number | null>,
  minPoints: number = 3,
): 'expanding' | 'contracting' | 'volatile' | 'stable' | 'insufficient_data' {
  const nonNull = margins
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v !== null)

  if (nonNull.length < minPoints) return 'insufficient_data'

  const n    = nonNull.length
  const vals = nonNull.map(p => p.v)
  const idxs = nonNull.map(p => p.i)

  const mean = vals.reduce((a, b) => a + b, 0) / n

  // Coefficient of variation check (volatile)
  const stddev = Math.sqrt(vals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n)
  if (mean !== 0 && Math.abs(stddev / mean) > 0.3) return 'volatile'

  // Linear regression slope
  const meanIdx = idxs.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  for (let j = 0; j < n; j++) {
    num += (idxs[j] - meanIdx) * (vals[j] - mean)
    den += (idxs[j] - meanIdx) ** 2
  }
  const slope = den === 0 ? 0 : num / den

  if (slope > 0.5)  return 'expanding'
  if (slope < -0.5) return 'contracting'
  return 'stable'
}

/**
 * Benchmark gap: currentMargin - benchmarkPct.
 * Returns null if currentMargin is null.
 */
export function computeMarginBenchmarkGap(
  currentMargin: number | null,
  benchmarkPct: number,
): number | null {
  if (currentMargin === null) return null
  return currentMargin - benchmarkPct
}

/**
 * Classify overall margin health.
 * Priority: insufficient_data → negative → excellent → strong → adequate → thin → negative (catch-all)
 */
export function classifyMarginHealth(
  grossMarginPct: number | null,
  netMarginPct: number | null,
): 'excellent' | 'strong' | 'adequate' | 'thin' | 'negative' | 'insufficient_data' {
  if (grossMarginPct === null && netMarginPct === null) return 'insufficient_data'

  // Net margin negative check (uses netMarginPct if available; if null treat as 0 for this check)
  if (netMarginPct !== null && netMarginPct < 0) return 'negative'

  const gm = grossMarginPct ?? 0
  const nm = netMarginPct ?? 0

  if (gm >= 50 && nm >= 15) return 'excellent'
  if (gm >= 35 && nm >= 8)  return 'strong'
  if (gm >= 20 && nm >= 3)  return 'adequate'
  if (gm >= 10 || nm >= 0)  return 'thin'
  return 'negative'
}

/**
 * Month with the highest gross_margin_pct. null if all null or empty.
 */
export function findBestMarginMonth(
  points: MonthlyMarginPoint[],
): MonthlyMarginPoint | null {
  let best: MonthlyMarginPoint | null = null
  for (const p of points) {
    if (p.gross_margin_pct === null) continue
    if (best === null || p.gross_margin_pct > (best.gross_margin_pct ?? -Infinity)) {
      best = p
    }
  }
  return best
}

/**
 * Month with the lowest gross_margin_pct. null if all null or empty.
 */
export function findWorstMarginMonth(
  points: MonthlyMarginPoint[],
): MonthlyMarginPoint | null {
  let worst: MonthlyMarginPoint | null = null
  for (const p of points) {
    if (p.gross_margin_pct === null) continue
    if (worst === null || p.gross_margin_pct < (worst.gross_margin_pct ?? Infinity)) {
      worst = p
    }
  }
  return worst
}

/**
 * Average of non-null values. null if empty or all null.
 */
export function computeAverageMargin(values: Array<number | null>): number | null {
  const nonNull = values.filter((v): v is number => v !== null)
  if (nonNull.length === 0) return null
  return nonNull.reduce((a, b) => a + b, 0) / nonNull.length
}

/**
 * Generate a deterministic Turkish narrative based on health + trend.
 */
export function generateMarginNarrative(
  health: ReturnType<typeof classifyMarginHealth>,
  trend: ReturnType<typeof classifyMarginTrend>,
  latestGrossMargin: number | null,
  latestNetMargin: number | null,
  benchmarkGap: number | null,
): string {
  // Negative health takes precedence
  if (health === 'negative') {
    return 'Net kar marjı negatif — operasyonel gider yapısı acil inceleme gerektiriyor.'
  }

  if (health === 'insufficient_data') {
    return 'Marj analizi için yeterli veri bulunmuyor. Satış ve gider kayıtları tamamlandığında otomatik hesaplanacak.'
  }

  const trendText: Record<ReturnType<typeof classifyMarginTrend>, string> = {
    expanding:          'genişliyor',
    contracting:        'daralıyor',
    volatile:           'dalgalı bir seyir izliyor',
    stable:             'stabil seyrediyor',
    insufficient_data:  'değerlendirme için yeterli veri yok',
  }

  const healthLabel: Record<ReturnType<typeof classifyMarginHealth>, string> = {
    excellent:          'mükemmel',
    strong:             'güçlü',
    adequate:           'yeterli',
    thin:               'ince',
    negative:           'negatif',
    insufficient_data:  'belirsiz',
  }

  const gm  = latestGrossMargin !== null ? `%${latestGrossMargin.toFixed(1)} brüt` : null
  const nm  = latestNetMargin   !== null ? `%${latestNetMargin.toFixed(1)} net`    : null
  const marginStr = [gm, nm].filter(Boolean).join(', ')

  const benchmarkStr = benchmarkGap !== null
    ? benchmarkGap >= 0
      ? ` Türk KOBİ ortalamasının ${Math.abs(benchmarkGap).toFixed(1)} puan üzerinde.`
      : ` Türk KOBİ ortalamasının ${Math.abs(benchmarkGap).toFixed(1)} puan altında.`
    : ''

  // Special combo overrides
  if (health === 'excellent' && trend === 'expanding') {
    return `Brüt ve net kar marjları mükemmel seviyede ve genişliyor.${benchmarkStr}`
  }

  if (health === 'excellent' && trend === 'contracting') {
    return `Marjlar hâlâ mükemmel seviyede, ancak son aylarda daralma eğilimi dikkat çekiyor.${benchmarkStr}`
  }

  if (health === 'thin' && trend === 'contracting') {
    return `Marjlar inceliyor — son aylarda baskı altında.${benchmarkStr}`
  }

  if (health === 'adequate' && trend === 'stable') {
    return `Marjlar yeterli seviyede ve stabil seyrediyor.${benchmarkStr}`
  }

  if (health === 'thin' && trend === 'volatile') {
    return `Marjlar ince ve dalgalı — gelir-gider dengesinin yakından izlenmesi önerilir.${benchmarkStr}`
  }

  if (trend === 'volatile') {
    return `Marjlar dalgalı bir seyir izliyor${marginStr ? ` (${marginStr})` : ''}. Gelir ve maliyet yapısındaki değişkenlik incelenmeli.${benchmarkStr}`
  }

  // Generic fallback
  return `Kar marjları ${healthLabel[health]} seviyede ve ${trendText[trend]}${marginStr ? ` (${marginStr})` : ''}.${benchmarkStr}`
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

function monthBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${yearMonth}-01`,
    to:   `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

// Expense types that are NOT operating expenses
const NON_OPEX_TYPES = new Set([
  'partner_financing',
  'loan_repayment',
  'dividend',
  'internal_transfer',
  'partner_loan_interest',
  'tax',
])

// ── Service class ──────────────────────────────────────────────────────────────

export class MarginTrendService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<MarginTrendReport> {
    const monthKeys = lastNMonthKeys(12)

    // Fetch all months in parallel using Promise.allSettled for resilience
    const monthDataResults = await Promise.allSettled(
      monthKeys.map(ym => this.fetchMonthData(companyId, ym)),
    )

    // Build monthly points
    const monthly_points: MonthlyMarginPoint[] = monthKeys.map((ym, i) => {
      const result = monthDataResults[i]
      if (result.status === 'rejected') {
        return {
          year_month:           ym,
          revenue:              0,
          cogs:                 0,
          operating_expenses:   0,
          net_income:           0,
          gross_margin_pct:     null,
          operating_margin_pct: null,
          net_margin_pct:       null,
        }
      }
      const { revenue, cogs, opex } = result.value
      const netIncome = revenue - cogs - opex

      return {
        year_month:           ym,
        revenue,
        cogs,
        operating_expenses:   opex,
        net_income:           netIncome,
        gross_margin_pct:     computeGrossMarginPct(revenue, cogs),
        operating_margin_pct: computeOperatingMarginPct(revenue, cogs, opex),
        net_margin_pct:       computeNetMarginPct(revenue, netIncome),
      }
    })

    // Derived analytics
    const grossMargins = monthly_points.map(p => p.gross_margin_pct)
    const netMargins   = monthly_points.map(p => p.net_margin_pct)

    const rolling_avg_gross_margin = computeRollingAvgMargin(grossMargins, 3)

    const gross_margin_trend = classifyMarginTrend(grossMargins)
    const net_margin_trend   = classifyMarginTrend(netMargins)

    const avg_gross_margin_pct   = computeAverageMargin(grossMargins)
    const avg_net_margin_pct     = computeAverageMargin(netMargins)

    const latestPoint = monthly_points[monthly_points.length - 1] ?? null
    const latest_gross_margin_pct = latestPoint?.gross_margin_pct ?? null
    const latest_net_margin_pct   = latestPoint?.net_margin_pct   ?? null

    const gross_margin_benchmark_gap = computeMarginBenchmarkGap(
      latest_gross_margin_pct,
      TURKISH_SME_GROSS_MARGIN_BENCHMARK,
    )

    const margin_health = classifyMarginHealth(latest_gross_margin_pct, latest_net_margin_pct)

    // Anomaly detection: flag months where gross margin deviates > 2σ from rolling avg
    const grossStddev = computeStddev(grossMargins)
    const anomaly_months: string[] = monthly_points
      .filter((p, i) =>
        detectMarginAnomaly(
          p.gross_margin_pct,
          rolling_avg_gross_margin[i],
          grossStddev,
          2.0,
        ),
      )
      .map(p => p.year_month)

    const best_month  = findBestMarginMonth(monthly_points)
    const worst_month = findWorstMarginMonth(monthly_points)

    const narrative = generateMarginNarrative(
      margin_health,
      gross_margin_trend,
      latest_gross_margin_pct,
      latest_net_margin_pct,
      gross_margin_benchmark_gap,
    )

    return {
      monthly_points,
      rolling_avg_gross_margin,
      gross_margin_trend,
      net_margin_trend,
      avg_gross_margin_pct,
      avg_net_margin_pct,
      latest_gross_margin_pct,
      latest_net_margin_pct,
      gross_margin_benchmark_gap,
      margin_health,
      anomaly_months,
      best_month,
      worst_month,
      narrative,
    }
  }

  // ── Private: fetch one month's raw data ──────────────────────────────────────

  private async fetchMonthData(
    companyId: string,
    yearMonth: string,
  ): Promise<{ revenue: number; cogs: number; opex: number }> {
    const { from, to } = monthBounds(yearMonth)

    // 1. Revenue from sales
    const salesQ = this.supabase
      .from('sales')
      .select('total, total_try, total_cost')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')

    // 2. Sale IDs for COGS lookup
    const saleIdsQ = this.supabase
      .from('sales')
      .select('id, total_cost')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // 3. Expenses (OpEx)
    const expQ = this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    const [salesRes, saleIdsRes, expRes] = await Promise.allSettled([salesQ, saleIdsQ, expQ])

    // Revenue
    const salesData = salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []
    const revenue = salesData.reduce(
      (s: number, r: Record<string, unknown>) =>
        s + Number(r.total_try ?? r.total ?? 0),
      0,
    )

    // COGS: try sale_item_allocations first, fallback to total_cost
    let cogs = 0
    const saleRows = saleIdsRes.status === 'fulfilled' ? (saleIdsRes.value.data ?? []) : []
    const saleIds  = saleRows.map((r: Record<string, unknown>) => String(r.id))

    if (saleIds.length > 0) {
      // Try allocation-based COGS
      const saleItemsRes = await this.supabase
        .from('sale_items')
        .select('id')
        .eq('company_id', companyId)
        .in('sale_id', saleIds)
        .limit(10000)

      const saleItemIds = (saleItemsRes.data ?? []).map(
        (si: Record<string, unknown>) => String(si.id),
      )

      let cogsFromAllocations = 0
      if (saleItemIds.length > 0) {
        const allocRes = await this.supabase
          .from('sale_item_allocations')
          .select('qty_allocated, cost_price_try, stock_lots(cost_price_try)')
          .eq('company_id', companyId)
          .in('sale_item_id', saleItemIds)
          .limit(20000)

        // Shared tested COGS cost-fallback kernel (same as getCfoMetrics).
        cogsFromAllocations = computeCogsFromAllocations(allocRes.data ?? [])
      }

      if (cogsFromAllocations > 0) {
        cogs = cogsFromAllocations
      } else {
        // Fallback: sum total_cost from sales rows
        cogs = saleRows.reduce(
          (s: number, r: Record<string, unknown>) => s + Number(r.total_cost ?? 0),
          0,
        )
      }
    }

    // OpEx: exclude non-operating types
    let opex = 0
    const expData = expRes.status === 'fulfilled' ? (expRes.value.data ?? []) : []
    for (const row of expData) {
      const t      = String(row.expense_type ?? '')
      const amount = Number(row.amount_try ?? 0)
      if (NON_OPEX_TYPES.has(t)) continue
      opex += amount
    }

    return { revenue, cogs, opex }
  }
}
