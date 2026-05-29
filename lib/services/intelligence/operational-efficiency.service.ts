// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/operational-efficiency.service.ts
//
// Operational Efficiency Metrics — Turkish SME Benchmarking
//
// Benchmarks key operational KPIs against Turkish SME standards:
//   - Order-to-Cash cycle
//   - Expense efficiency ratio
//   - Revenue per employee (productivity)
//   - Quote-to-order conversion rate
//   - Fulfillment cycle time
//   - Inventory accuracy
//   - On-time delivery rate
//
// All pure-function helpers are exported for unit testing.
// The OperationalEfficiencyService class handles DB queries.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeOrderToCashCycle
 *
 * Total O2C cycle = avgDaysToInvoice + avgDaysToCollect.
 * Both inputs should be >= 0.
 */
export function computeOrderToCashCycle(
  avgDaysToInvoice: number,
  avgDaysToCollect: number,
): number {
  return avgDaysToInvoice + avgDaysToCollect
}

/**
 * computeExpenseEfficiencyRatio
 *
 * opex / grossProfit × 100. null if grossProfit === 0.
 * Lower = more efficient. Turkish SME target: < 80%.
 */
export function computeExpenseEfficiencyRatio(
  operatingExpenses: number,
  grossProfit: number,
): number | null {
  if (grossProfit === 0) return null
  return (operatingExpenses / grossProfit) * 100
}

/**
 * computeRevenuePerEmployee
 *
 * totalRevenue / headcount. null if headcount === 0.
 * Turkish SME benchmark: ₺5M+ per employee = excellent.
 */
export function computeRevenuePerEmployee(
  totalRevenue: number,
  headcount: number,
): number | null {
  if (headcount === 0) return null
  return totalRevenue / headcount
}

/**
 * computeQuoteToOrderRate
 *
 * ordersConverted / totalQuotes × 100. null if totalQuotes === 0.
 */
export function computeQuoteToOrderRate(
  ordersConverted: number,
  totalQuotes: number,
): number | null {
  if (totalQuotes === 0) return null
  return (ordersConverted / totalQuotes) * 100
}

/**
 * computeFulfillmentCycleTime
 *
 * Days between purchase and delivery.
 * Returns 0 if deliveryDate <= purchaseDate.
 */
export function computeFulfillmentCycleTime(
  purchaseDate: string,
  deliveryDate: string,
): number {
  const purchase = new Date(purchaseDate).getTime()
  const delivery = new Date(deliveryDate).getTime()
  const diffMs = delivery - purchase
  if (diffMs <= 0) return 0
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * computeInventoryAccuracyRate
 *
 * correctLocations / totalItems × 100. null if totalItems === 0.
 */
export function computeInventoryAccuracyRate(
  correctLocations: number,
  totalItems: number,
): number | null {
  if (totalItems === 0) return null
  return (correctLocations / totalItems) * 100
}

/**
 * computeOnTimeDeliveryRate
 *
 * deliveredOnTime / totalDeliveries × 100. null if totalDeliveries === 0.
 */
export function computeOnTimeDeliveryRate(
  deliveredOnTime: number,
  totalDeliveries: number,
): number | null {
  if (totalDeliveries === 0) return null
  return (deliveredOnTime / totalDeliveries) * 100
}

/**
 * classifyOperationalEfficiency
 *
 * Score each available metric (null = skip):
 *   expenseRatio: <=60→5pts / <=80→3pts / <=100→1pt / else→0pts
 *   o2cDays: <=30→5pts / <=45→3pts / <=60→1pt / else→0pts
 *   quoteToOrder: >=50%→5pts / >=30%→3pts / >=15%→1pt / else→0pts
 *
 * If no metrics available → insufficient_data
 * avg points:
 *   excellent:    >= 4.5 avg
 *   good:         >= 3.0 avg
 *   average:      >= 1.5 avg
 *   below_average:>= 0.5 avg
 *   poor:         < 0.5 avg
 */
export function classifyOperationalEfficiency(
  expenseRatioPct: number | null,
  o2cDays: number | null,
  quoteToOrderRatePct: number | null,
): 'excellent' | 'good' | 'average' | 'below_average' | 'poor' | 'insufficient_data' {
  const scores: number[] = []

  if (expenseRatioPct !== null) {
    if (expenseRatioPct <= 60)       scores.push(5)
    else if (expenseRatioPct <= 80)  scores.push(3)
    else if (expenseRatioPct <= 100) scores.push(1)
    else                             scores.push(0)
  }

  if (o2cDays !== null) {
    if (o2cDays <= 30)      scores.push(5)
    else if (o2cDays <= 45) scores.push(3)
    else if (o2cDays <= 60) scores.push(1)
    else                    scores.push(0)
  }

  if (quoteToOrderRatePct !== null) {
    if (quoteToOrderRatePct >= 50)      scores.push(5)
    else if (quoteToOrderRatePct >= 30) scores.push(3)
    else if (quoteToOrderRatePct >= 15) scores.push(1)
    else                                scores.push(0)
  }

  if (scores.length === 0) return 'insufficient_data'

  const avg = scores.reduce((s, v) => s + v, 0) / scores.length

  if (avg >= 4.5) return 'excellent'
  if (avg >= 3.0) return 'good'
  if (avg >= 1.5) return 'average'
  if (avg >= 0.5) return 'below_average'
  return 'poor'
}

// ── Default benchmarks ────────────────────────────────────────────────────────

export const DEFAULT_BENCHMARKS = {
  expense_ratio_target:          80,
  o2c_target_days:               30,
  quote_to_order_target:         40,
  revenue_per_employee_target:   5_000_000,
} as const

/**
 * computeOperationalProductivityScore
 *
 * 0-100 composite score. Each metric scored vs benchmark:
 *   expense_ratio:         clamp((1 - ratio/target) × 100 + 50, 0, 100) × 0.30
 *   o2c_days:              clamp((1 - days/target) × 100 + 50, 0, 100) × 0.30
 *   quote_to_order:        clamp(rate/target × 100, 0, 100) × 0.20
 *   revenue_per_employee:  clamp(rev/target × 100, 0, 100) × 0.20
 * Null metrics: substitute with 50 (neutral).
 * Round to 1 decimal.
 */
export function computeOperationalProductivityScore(
  metrics: {
    expense_ratio_pct: number | null
    o2c_days: number | null
    quote_to_order_pct: number | null
    revenue_per_employee: number | null
  },
  benchmarks?: {
    expense_ratio_target: number
    o2c_target_days: number
    quote_to_order_target: number
    revenue_per_employee_target: number
  },
): number {
  const bm = {
    expense_ratio_target:        benchmarks?.expense_ratio_target        ?? DEFAULT_BENCHMARKS.expense_ratio_target,
    o2c_target_days:             benchmarks?.o2c_target_days             ?? DEFAULT_BENCHMARKS.o2c_target_days,
    quote_to_order_target:       benchmarks?.quote_to_order_target       ?? DEFAULT_BENCHMARKS.quote_to_order_target,
    revenue_per_employee_target: benchmarks?.revenue_per_employee_target ?? DEFAULT_BENCHMARKS.revenue_per_employee_target,
  }

  function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v))
  }

  const expenseScore = metrics.expense_ratio_pct !== null
    ? clamp((1 - metrics.expense_ratio_pct / bm.expense_ratio_target) * 100 + 50, 0, 100)
    : 50

  const o2cScore = metrics.o2c_days !== null
    ? clamp((1 - metrics.o2c_days / bm.o2c_target_days) * 100 + 50, 0, 100)
    : 50

  const quoteScore = metrics.quote_to_order_pct !== null
    ? clamp(metrics.quote_to_order_pct / bm.quote_to_order_target * 100, 0, 100)
    : 50

  const revPerEmpScore = metrics.revenue_per_employee !== null
    ? clamp(metrics.revenue_per_employee / bm.revenue_per_employee_target * 100, 0, 100)
    : 50

  const composite =
    expenseScore    * 0.30 +
    o2cScore        * 0.30 +
    quoteScore      * 0.20 +
    revPerEmpScore  * 0.20

  return Math.round(composite * 10) / 10
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface OperationalEfficiencyReport {
  metrics: {
    order_to_cash_days:            number | null
    expense_efficiency_ratio_pct:  number | null
    revenue_per_employee:          number | null
    quote_to_order_rate_pct:       number | null
  }
  benchmarks: {
    expense_ratio_target:          number
    o2c_target_days:               number
    quote_to_order_target:         number
    revenue_per_employee_target:   number
  }
  productivity_score:  number
  efficiency_class:    ReturnType<typeof classifyOperationalEfficiency>
  monthly_trend: Array<{
    month:               string
    revenue:             number
    expenses:            number
    expense_ratio_pct:   number | null
  }>
}

// ── Internal date helpers ─────────────────────────────────────────────────────

function monthRange(year: number, month: number): { from: string; to: string } {
  const from    = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to      = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// ── Service class ─────────────────────────────────────────────────────────────

export class OperationalEfficiencyService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<OperationalEfficiencyReport> {
    const now       = new Date()
    const thisYear  = now.getFullYear()
    const thisMonth = now.getMonth() + 1

    // Build last 6 month slots (newest first, then reverse for trend)
    const slots: Array<{ year: number; month: number; key: string }> = []
    for (let i = 0; i < 6; i++) {
      const d     = new Date(thisYear, thisMonth - 1 - i, 1)
      const year  = d.getFullYear()
      const month = d.getMonth() + 1
      slots.push({ year, month, key: monthKey(year, month) })
    }
    // Oldest slot for the window start
    const oldest  = slots[slots.length - 1]
    const newest  = slots[0]
    const { from: windowFrom } = monthRange(oldest.year, oldest.month)
    const { to:   windowTo   } = monthRange(newest.year, newest.month)

    // ── Parallel queries ──────────────────────────────────────────────────────

    const [
      salesResult,
      expensesResult,
      proformasResult,
      configResult,
    ] = await Promise.allSettled([

      // Sales: paid_at + sale_date for O2C, revenue grouped by month
      this.supabase
        .from('sales')
        .select('sale_date, paid_at, total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo)
        .not('payment_status', 'eq', 'cancelled'),

      // Expenses: amount_try grouped by month
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Proformas: for quote-to-order rate
      this.supabase
        .from('proformas')
        .select('id, status, converted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // App config: employee_count / headcount
      this.supabase
        .from('app_config')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'employee_count')
        .maybeSingle(),
    ])

    // ── Extract rows ──────────────────────────────────────────────────────────

    type SaleRow      = { sale_date: string; paid_at: string | null; total: number }
    type ExpenseRow   = { expense_date: string; amount_try: number }
    type ProformaRow  = { id: string; status: string | null; converted_at: string | null }

    const salesRows: SaleRow[] = salesResult.status === 'fulfilled'
      ? ((salesResult.value?.data ?? []) as SaleRow[])
      : []

    const expenseRows: ExpenseRow[] = expensesResult.status === 'fulfilled'
      ? ((expensesResult.value?.data ?? []) as ExpenseRow[])
      : []

    const proformaRows: ProformaRow[] = proformasResult.status === 'fulfilled'
      ? ((proformasResult.value?.data ?? []) as ProformaRow[])
      : []

    // Headcount from app_config (may not exist)
    let headcount: number | null = null
    if (configResult.status === 'fulfilled' && configResult.value?.data?.value != null) {
      const parsed = Number(configResult.value.data.value)
      if (!isNaN(parsed) && parsed > 0) headcount = parsed
    }

    // ── O2C: avg days from sale_date to paid_at ───────────────────────────────

    const paidSales = salesRows.filter(s => s.paid_at != null)
    let o2cDays: number | null = null

    if (paidSales.length > 0) {
      let totalDays = 0
      let validCount = 0
      for (const sale of paidSales) {
        const saleMs  = new Date(sale.sale_date).getTime()
        const paidMs  = new Date(sale.paid_at!).getTime()
        const diffDays = (paidMs - saleMs) / (1000 * 60 * 60 * 24)
        if (diffDays >= 0) {
          totalDays += diffDays
          validCount++
        }
      }
      if (validCount > 0) {
        o2cDays = Math.round(totalDays / validCount)
      }
    }

    // ── Monthly aggregations ──────────────────────────────────────────────────

    const revenueByMonth  = new Map<string, number>()
    const expensesByMonth = new Map<string, number>()

    for (const slot of slots) {
      revenueByMonth.set(slot.key, 0)
      expensesByMonth.set(slot.key, 0)
    }

    for (const sale of salesRows) {
      const key = sale.sale_date.substring(0, 7)
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + Number(sale.total ?? 0))
    }

    for (const exp of expenseRows) {
      const key = exp.expense_date.substring(0, 7)
      expensesByMonth.set(key, (expensesByMonth.get(key) ?? 0) + Number(exp.amount_try ?? 0))
    }

    // Current month metrics
    const currKey       = monthKey(thisYear, thisMonth)
    const currRevenue   = revenueByMonth.get(currKey) ?? 0
    const currExpenses  = expensesByMonth.get(currKey) ?? 0

    // Estimated COGS ≈ 40% of revenue (Turkish SME approximation when no COGS table)
    const estimatedCogs   = currRevenue * 0.40
    const grossProfit     = Math.max(0, currRevenue - estimatedCogs)
    const expenseRatioPct = computeExpenseEfficiencyRatio(currExpenses, grossProfit)

    // ── Quote-to-order rate ───────────────────────────────────────────────────

    const totalQuotes     = proformaRows.length
    const convertedCount  = proformaRows.filter(
      p => p.status === 'converted' || p.converted_at != null,
    ).length
    const quoteToOrderPct = computeQuoteToOrderRate(convertedCount, totalQuotes)

    // ── Revenue per employee ──────────────────────────────────────────────────

    const revenuePerEmployee = headcount !== null
      ? computeRevenuePerEmployee(currRevenue, headcount)
      : null

    // ── Productivity score ────────────────────────────────────────────────────

    const productivityScore = computeOperationalProductivityScore({
      expense_ratio_pct:    expenseRatioPct,
      o2c_days:             o2cDays,
      quote_to_order_pct:   quoteToOrderPct,
      revenue_per_employee: revenuePerEmployee,
    })

    // ── Efficiency class ──────────────────────────────────────────────────────

    const efficiencyClass = classifyOperationalEfficiency(
      expenseRatioPct,
      o2cDays,
      quoteToOrderPct,
    )

    // ── Monthly trend (last 6 months, oldest first) ───────────────────────────

    const monthlyTrend = [...slots].reverse().map(slot => {
      const rev  = revenueByMonth.get(slot.key)  ?? 0
      const exp  = expensesByMonth.get(slot.key) ?? 0
      const cogs = rev * 0.40
      const gp   = Math.max(0, rev - cogs)
      return {
        month:             slot.key,
        revenue:           rev,
        expenses:          exp,
        expense_ratio_pct: computeExpenseEfficiencyRatio(exp, gp),
      }
    })

    return {
      metrics: {
        order_to_cash_days:           o2cDays,
        expense_efficiency_ratio_pct: expenseRatioPct,
        revenue_per_employee:         revenuePerEmployee,
        quote_to_order_rate_pct:      quoteToOrderPct,
      },
      benchmarks: { ...DEFAULT_BENCHMARKS },
      productivity_score: productivityScore,
      efficiency_class:   efficiencyClass,
      monthly_trend:      monthlyTrend,
    }
  }
}
