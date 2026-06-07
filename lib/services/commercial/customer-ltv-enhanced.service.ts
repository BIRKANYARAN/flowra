// ── CustomerLtvEnhancedService — Enhanced Customer Lifetime Value Analytics ───
// Computes LTV metrics for B2B customers including:
//   1. Average Order Value + Purchase Frequency
//   2. Simple LTV + Margin-Adjusted LTV
//   3. LTV:CAC ratio + payback period
//   4. Customer tier classification (champion/high/mid/low)
//   5. Revenue concentration HHI
//   6. Net Revenue Retention Rate
// All pure functions are exported for unit testing.
// NO external dependencies beyond @supabase/supabase-js.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface CustomerLtvReport {
  portfolio_avg_ltv: number | null
  portfolio_median_ltv: number | null
  ltv_cac_ratio: number | null
  ltv_cac_health: ReturnType<typeof classifyLtvCacHealth>
  revenue_concentration_hhi: number | null
  revenue_concentration: ReturnType<typeof classifyRevenueConcentration>
  top_customer_revenue_pct: number | null
  net_revenue_retention_pct: number | null
  per_customer: Array<{
    customer_id: string
    customer_name: string
    total_revenue_try: number
    order_count: number
    avg_order_value: number | null
    monthly_frequency: number | null
    active_months: number
    simple_ltv: number | null
    margin_adjusted_ltv: number | null
    ltv_tier: ReturnType<typeof classifyLtvTier>
    payback_months: number | null
    payback_health: ReturnType<typeof classifyPaybackPeriod>
  }>
  narrative: string
  period_months: number
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawSale {
  customer_id: string | null
  customer_name: string | null
  sale_date: string | null
  total: number | null
}

interface RawExpense {
  amount: number | null
  expense_date: string | null
  category: string | null
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute average order value.
 * Returns null if orderCount = 0.
 */
export function computeAvgOrderValue(
  totalRevenue: number,
  orderCount: number,
): number | null {
  if (orderCount === 0) return null
  return totalRevenue / orderCount
}

/**
 * Compute purchase frequency (orders per month).
 * Returns null if activeMonths = 0.
 */
export function computePurchaseFrequency(
  orderCount: number,
  activeMonths: number,
): number | null {
  if (activeMonths === 0) return null
  return orderCount / activeMonths
}

/**
 * Compute simple LTV: avgOrderValue × purchaseFrequency × lifespanMonths.
 * Returns null if either avgOrderValue or monthlyFrequency is null.
 */
export function computeSimpleLtv(
  avgOrderValue: number | null,
  monthlyFrequency: number | null,
  lifespanMonths: number,
): number | null {
  if (avgOrderValue === null || monthlyFrequency === null) return null
  return avgOrderValue * monthlyFrequency * lifespanMonths
}

/**
 * Compute margin-adjusted LTV.
 * Returns null if simpleLtv is null.
 * = simpleLtv × grossMarginPct / 100
 */
export function computeMarginAdjustedLtv(
  simpleLtv: number | null,
  grossMarginPct: number,
): number | null {
  if (simpleLtv === null) return null
  return simpleLtv * grossMarginPct / 100
}

/**
 * Compute LTV:CAC ratio.
 * Returns null if ltv is null or cac <= 0.
 */
export function computeLtvCacRatio(
  ltv: number | null,
  cac: number,
): number | null {
  if (ltv === null || cac <= 0) return null
  return ltv / cac
}

/**
 * Classify LTV:CAC ratio health.
 * excellent: >= 5.0 (very profitable)
 * good: >= 3.0
 * acceptable: >= 1.5
 * poor: >= 1.0 (barely break-even on acquisition)
 * critical: < 1.0 (losing money on acquisition)
 * insufficient_data: null
 */
export function classifyLtvCacHealth(
  ratio: number | null,
): 'excellent' | 'good' | 'acceptable' | 'poor' | 'critical' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio >= 5.0) return 'excellent'
  if (ratio >= 3.0) return 'good'
  if (ratio >= 1.5) return 'acceptable'
  if (ratio >= 1.0) return 'poor'
  return 'critical'
}

/**
 * Classify customer tier based on LTV.
 * champion: ltv >= p75Ltv × 1.5 (far above 75th percentile)
 * high_value: ltv >= p75Ltv
 * mid_value: ltv >= p25Ltv
 * low_value: ltv < p25Ltv
 * insufficient_data: null
 */
export function classifyLtvTier(
  ltv: number | null,
  p75Ltv: number,
  p25Ltv: number,
): 'champion' | 'high_value' | 'mid_value' | 'low_value' | 'insufficient_data' {
  if (ltv === null) return 'insufficient_data'
  if (ltv >= p75Ltv * 1.5) return 'champion'
  if (ltv >= p75Ltv) return 'high_value'
  if (ltv >= p25Ltv) return 'mid_value'
  return 'low_value'
}

/**
 * Compute payback period in months (CAC / monthly margin contribution).
 * monthlyMarginContribution = avgOrderValue × frequency × grossMarginPct / 100
 * Returns null if avgOrderValue or frequency is null, or if contribution <= 0.
 */
export function computePaybackPeriod(
  cac: number,
  avgOrderValue: number | null,
  monthlyFrequency: number | null,
  grossMarginPct: number,
): number | null {
  if (avgOrderValue === null || monthlyFrequency === null) return null
  const monthlyMarginContribution = avgOrderValue * monthlyFrequency * grossMarginPct / 100
  if (monthlyMarginContribution <= 0) return null
  return cac / monthlyMarginContribution
}

/**
 * Classify payback period.
 * immediate: <= 3 months
 * fast: <= 6
 * moderate: <= 12
 * slow: <= 24
 * very_slow: > 24
 * insufficient_data: null
 */
export function classifyPaybackPeriod(
  months: number | null,
): 'immediate' | 'fast' | 'moderate' | 'slow' | 'very_slow' | 'insufficient_data' {
  if (months === null) return 'insufficient_data'
  if (months <= 3) return 'immediate'
  if (months <= 6) return 'fast'
  if (months <= 12) return 'moderate'
  if (months <= 24) return 'slow'
  return 'very_slow'
}

/**
 * Compute customer revenue concentration index (HHI for revenue).
 * HHI = Σ (revenue_i / total_revenue)²; range 0-1
 * Returns null if total revenue = 0.
 */
export function computeRevenueConcentrationHhi(
  customers: Array<{ revenue: number }>,
): number | null {
  const totalRevenue = customers.reduce((sum, c) => sum + c.revenue, 0)
  if (totalRevenue === 0) return null
  return customers.reduce((sum, c) => {
    const share = c.revenue / totalRevenue
    return sum + share * share
  }, 0)
}

/**
 * Classify revenue concentration.
 * diversified: < 0.10
 * moderate: < 0.25
 * concentrated: < 0.50
 * highly_concentrated: < 0.90
 * monopoly: >= 0.90
 * insufficient_data: null
 */
export function classifyRevenueConcentration(
  hhi: number | null,
): 'diversified' | 'moderate' | 'concentrated' | 'highly_concentrated' | 'monopoly' | 'insufficient_data' {
  if (hhi === null) return 'insufficient_data'
  if (hhi < 0.10) return 'diversified'
  if (hhi < 0.25) return 'moderate'
  if (hhi < 0.50) return 'concentrated'
  if (hhi < 0.90) return 'highly_concentrated'
  return 'monopoly'
}

/**
 * Compute net revenue retention rate (month over month for a cohort).
 * = currentMonthRevenue / priorMonthRevenue × 100 (can exceed 100 = expansion)
 * Returns null if priorMonthRevenue = 0.
 */
export function computeNetRevenueRetentionRate(
  priorMonthRevenue: number,
  currentMonthRevenue: number,
): number | null {
  if (priorMonthRevenue === 0) return null
  return (currentMonthRevenue / priorMonthRevenue) * 100
}

/**
 * Generate Turkish narrative for LTV portfolio.
 */
export function generateLtvNarrative(params: {
  avgLtv: number | null
  topCustomerPct: number
  ltvCacRatio: number | null
  portfolioHealth: ReturnType<typeof classifyLtvCacHealth>
}): string {
  const { avgLtv, topCustomerPct, ltvCacRatio, portfolioHealth } = params

  if (avgLtv === null) {
    return 'Müşteri yaşam boyu değeri hesaplamak için yeterli satış verisi bulunamadı.'
  }

  let healthText: string
  switch (portfolioHealth) {
    case 'excellent':
      healthText = 'Portföy LTV:CAC oranı mükemmel seviyede — müşteri edinme yatırımları yüksek karlılıkla geri dönüyor.'
      break
    case 'good':
      healthText = 'Portföy LTV:CAC oranı iyi seviyede — müşteri edinme maliyetleri sağlıklı bir şekilde karşılanıyor.'
      break
    case 'acceptable':
      healthText = 'Portföy LTV:CAC oranı kabul edilebilir — büyüme sürdürülebilir ancak iyileştirme fırsatları var.'
      break
    case 'poor':
      healthText = 'Portföy LTV:CAC oranı zayıf — müşteri edinme maliyetleri ancak kırılma noktasında karşılanıyor.'
      break
    case 'critical':
      healthText = "Kritik: LTV:CAC oranı 1'in altında — müşteri edinme maliyetleri geri kazanılamıyor, acil önlem gerekiyor."
      break
    case 'insufficient_data':
      healthText = 'LTV:CAC oranı hesaplanamadı — maliyet verisi yetersiz.'
      break
  }

  const avgLtvFormatted = Math.round(avgLtv).toLocaleString('tr-TR')
  const ratioText = ltvCacRatio !== null ? ` Portföy LTV:CAC oranı ${ltvCacRatio.toFixed(1)}x.` : ''

  let concentrationWarning = ''
  if (topCustomerPct >= 50) {
    concentrationWarning = ` Uyarı: En büyük müşteri toplam gelirin %${topCustomerPct.toFixed(0)}'ini oluşturuyor — yüksek gelir yoğunlaşması riski.`
  } else if (topCustomerPct >= 25) {
    concentrationWarning = ` En büyük müşteri gelirin %${topCustomerPct.toFixed(0)}'ini oluşturuyor — çeşitlendirme önerilir.`
  }

  return `Ortalama müşteri yaşam boyu değeri ${avgLtvFormatted} TRY.${ratioText} ${healthText}${concentrationWarning}`
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function customerKey(row: RawSale): string {
  if (row.customer_id) return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return 'name:Bilinmiyor'
}

function customerDisplayName(row: RawSale): string {
  return row.customer_name ?? 'Bilinmiyor'
}

function customerDisplayId(row: RawSale): string {
  return row.customer_id ?? row.customer_name ?? 'Bilinmiyor'
}

function percentile(sortedValues: number[], pct: number): number {
  if (sortedValues.length === 0) return 0
  const idx   = (pct / 100) * (sortedValues.length - 1)
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  if (lower === upper) return sortedValues[lower]
  const frac = idx - lower
  return sortedValues[lower] * (1 - frac) + sortedValues[upper] * frac
}

function medianOf(sortedValues: number[]): number | null {
  if (sortedValues.length === 0) return null
  return percentile(sortedValues, 50)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CustomerLtvEnhancedService {
  constructor(private readonly supabase: SupabaseClient<any>) {} // eslint-disable-line @typescript-eslint/no-explicit-any

  async getReport(companyId: string, periodMonths: number = 12): Promise<CustomerLtvReport> {
    const now = new Date()

    const cutoff = new Date(now)
    cutoff.setMonth(cutoff.getMonth() - periodMonths)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const [salesResult, expensesResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('customer_id, customer_name, sale_date, total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', cutoffStr)
        .order('sale_date', { ascending: true }),

      this.supabase
        .from('expenses')
        .select('amount, expense_date, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', cutoffStr)
        .in('category', ['marketing', 'sales']),
    ])

    const salesData: RawSale[] =
      salesResult.status === 'fulfilled' && salesResult.value.data
        ? (salesResult.value.data as RawSale[])
        : []

    const expensesData: RawExpense[] =
      expensesResult.status === 'fulfilled' && expensesResult.value.data
        ? (expensesResult.value.data as RawExpense[])
        : []

    if (salesData.length === 0) {
      return this.buildEmptyReport(periodMonths)
    }

    // ── Aggregate per customer ─────────────────────────────────────────────

    type CustomerAgg = {
      customer_id: string
      customer_name: string
      total_revenue: number
      order_count: number
      month_keys: Set<string>
    }

    const aggMap = new Map<string, CustomerAgg>()

    for (const row of salesData) {
      if (!row.sale_date) continue
      const key   = customerKey(row)
      const date  = new Date(row.sale_date)
      const total = Number(row.total ?? 0)

      if (!aggMap.has(key)) {
        aggMap.set(key, {
          customer_id:   customerDisplayId(row),
          customer_name: customerDisplayName(row),
          total_revenue: 0,
          order_count:   0,
          month_keys:    new Set(),
        })
      }

      const agg = aggMap.get(key)!
      agg.total_revenue += total
      agg.order_count   += 1

      const mk = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      agg.month_keys.add(mk)
    }

    // ── CAC estimation ─────────────────────────────────────────────────────
    // CAC = total marketing/sales expenses / distinct new customers in period
    // Fallback: 500 TRY if no expense data

    const totalMarketingExpenses = expensesData.reduce(
      (sum, e) => sum + Number(e.amount ?? 0),
      0,
    )
    const newCustomerCount = aggMap.size

    let cac = 500 // default fallback (Turkish SME benchmark)
    if (totalMarketingExpenses > 0 && newCustomerCount > 0) {
      cac = totalMarketingExpenses / newCustomerCount
    }

    // ── Gross margin estimate ──────────────────────────────────────────────
    // Default 30% for Turkish SMEs when no cost data available
    const grossMarginPct = 30

    // ── Per-customer LTV computation ───────────────────────────────────────

    const perCustomer: CustomerLtvReport['per_customer'] = []

    for (const [, agg] of aggMap) {
      const active_months     = Math.max(1, agg.month_keys.size)
      const avg_order_value   = computeAvgOrderValue(agg.total_revenue, agg.order_count)
      const monthly_frequency = computePurchaseFrequency(agg.order_count, active_months)

      // Lifespan: use actual active months if >= 3, else default to 12
      const lifespanMonths = active_months >= 3 ? active_months : 12

      const simple_ltv          = computeSimpleLtv(avg_order_value, monthly_frequency, lifespanMonths)
      const margin_adjusted_ltv = computeMarginAdjustedLtv(simple_ltv, grossMarginPct)

      const payback_months = computePaybackPeriod(cac, avg_order_value, monthly_frequency, grossMarginPct)
      const payback_health = classifyPaybackPeriod(payback_months)

      perCustomer.push({
        customer_id: agg.customer_id,
        customer_name: agg.customer_name,
        total_revenue_try: agg.total_revenue,
        order_count: agg.order_count,
        avg_order_value,
        monthly_frequency,
        active_months,
        simple_ltv,
        margin_adjusted_ltv,
        ltv_tier: 'insufficient_data', // placeholder — filled after percentile computation
        payback_months,
        payback_health,
      })
    }

    // ── Percentile computation for tier classification ─────────────────────

    const ltvValues = perCustomer
      .map(c => c.simple_ltv)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)

    const p75 = ltvValues.length > 0 ? percentile(ltvValues, 75) : 0
    const p25 = ltvValues.length > 0 ? percentile(ltvValues, 25) : 0

    for (const c of perCustomer) {
      c.ltv_tier = classifyLtvTier(c.simple_ltv, p75, p25)
    }

    // Sort by total revenue descending
    perCustomer.sort((a, b) => b.total_revenue_try - a.total_revenue_try)

    // ── Portfolio metrics ──────────────────────────────────────────────────

    const medianLtv = medianOf(ltvValues)
    const avgLtv    = ltvValues.length > 0
      ? ltvValues.reduce((s, v) => s + v, 0) / ltvValues.length
      : null

    const marginAdjustedLtvValues = perCustomer
      .map(c => c.margin_adjusted_ltv)
      .filter((v): v is number => v !== null)

    const portfolioAvgMarginLtv = marginAdjustedLtvValues.length > 0
      ? marginAdjustedLtvValues.reduce((s, v) => s + v, 0) / marginAdjustedLtvValues.length
      : null

    const ltvCacRatio  = computeLtvCacRatio(portfolioAvgMarginLtv ?? avgLtv, cac)
    const ltvCacHealth = classifyLtvCacHealth(ltvCacRatio)

    // ── Revenue concentration HHI ──────────────────────────────────────────

    const revenueConcentrationInput = perCustomer.map(c => ({ revenue: c.total_revenue_try }))
    const hhi           = computeRevenueConcentrationHhi(revenueConcentrationInput)
    const concentration = classifyRevenueConcentration(hhi)

    const totalRevenue       = perCustomer.reduce((s, c) => s + c.total_revenue_try, 0)
    const topCustomerRevenue = perCustomer.length > 0 ? perCustomer[0].total_revenue_try : 0
    const top_customer_revenue_pct = totalRevenue > 0
      ? (topCustomerRevenue / totalRevenue) * 100
      : null

    // ── Net Revenue Retention (last month vs prior month) ─────────────────

    const lastMonthKey = (() => {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()
    const priorMonthKey = (() => {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 2)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })()

    let lastMonthRevenue  = 0
    let priorMonthRevenue = 0

    for (const row of salesData) {
      if (!row.sale_date) continue
      const date  = new Date(row.sale_date)
      const mk    = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const total = Number(row.total ?? 0)
      if (mk === lastMonthKey)  lastMonthRevenue  += total
      if (mk === priorMonthKey) priorMonthRevenue += total
    }

    const net_revenue_retention_pct = computeNetRevenueRetentionRate(priorMonthRevenue, lastMonthRevenue)

    // ── Narrative ─────────────────────────────────────────────────────────

    const narrative = generateLtvNarrative({
      avgLtv,
      topCustomerPct: top_customer_revenue_pct ?? 0,
      ltvCacRatio,
      portfolioHealth: ltvCacHealth,
    })

    return {
      portfolio_avg_ltv: avgLtv,
      portfolio_median_ltv: medianLtv,
      ltv_cac_ratio: ltvCacRatio,
      ltv_cac_health: ltvCacHealth,
      revenue_concentration_hhi: hhi,
      revenue_concentration: concentration,
      top_customer_revenue_pct,
      net_revenue_retention_pct,
      per_customer: perCustomer,
      narrative,
      period_months: periodMonths,
    }
  }

  private buildEmptyReport(periodMonths: number): CustomerLtvReport {
    return {
      portfolio_avg_ltv: null,
      portfolio_median_ltv: null,
      ltv_cac_ratio: null,
      ltv_cac_health: classifyLtvCacHealth(null),
      revenue_concentration_hhi: null,
      revenue_concentration: classifyRevenueConcentration(null),
      top_customer_revenue_pct: null,
      net_revenue_retention_pct: null,
      per_customer: [],
      narrative: generateLtvNarrative({
        avgLtv: null,
        topCustomerPct: 0,
        ltvCacRatio: null,
        portfolioHealth: 'insufficient_data',
      }),
      period_months: periodMonths,
    }
  }
}
