// ── DiscountAnalysisService — Price Elasticity & Discount Impact ──────────────
//
// Analyses discount patterns, price sensitivity, and discount impact on
// profitability for a given company over the last 3 months.
//
// Pure helpers are all exported for deterministic unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscountBucket {
  label: string          // e.g. "0-5%"
  min_pct: number
  max_pct: number
  deal_count: number
  revenue_try: number
  avg_margin_pct: number | null
  revenue_share_pct: number
}

export interface ProductDiscountProfile {
  product_id: string
  product_name: string
  avg_list_price: number
  avg_selling_price: number
  avg_discount_pct: number
  max_discount_pct: number
  min_discount_pct: number
  deal_count: number
  revenue_try: number
  margin_at_avg_discount: number | null
}

export interface DiscountAnalysisReport {
  period_label: string         // e.g. "Son 3 Ay"
  total_deals: number
  discounted_deals: number
  avg_discount_pct: number | null
  discount_frequency: number   // 0-1
  revenue_leakage_try: number
  discount_buckets: DiscountBucket[]
  product_profiles: ProductDiscountProfile[]
  most_discounted_product: ProductDiscountProfile | null
  margin_erosion_pp: number | null
  discount_health: ReturnType<typeof classifyDiscountHealth>
  narrative: string
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * computeDiscountPct
 * (listPrice - sellingPrice) / listPrice × 100; clamped to [0, 100].
 * Returns 0 if listPrice === 0.
 */
export function computeDiscountPct(listPrice: number, sellingPrice: number): number {
  if (listPrice === 0) return 0
  const raw = ((listPrice - sellingPrice) / listPrice) * 100
  return Math.max(0, Math.min(100, raw))
}

/**
 * computeRevenueImpact
 * Revenue foregone from discount: (listPrice - sellingPrice) × quantity.
 */
export function computeRevenueImpact(
  listPrice: number,
  sellingPrice: number,
  quantity: number,
): number {
  return (listPrice - sellingPrice) * quantity
}

/**
 * computeMarginAtDiscount
 * sellingPrice = listPrice × (1 - discountPct/100)
 * margin = (sellingPrice - costPrice) / sellingPrice × 100
 * Returns null if sellingPrice === 0.
 */
export function computeMarginAtDiscount(
  listPrice: number,
  discountPct: number,
  costPrice: number,
): number | null {
  const sellingPrice = listPrice * (1 - discountPct / 100)
  if (sellingPrice === 0) return null
  return ((sellingPrice - costPrice) / sellingPrice) * 100
}

/**
 * computeBreakevenDiscountPct
 * Max discount before margin reaches 0: (listPrice - costPrice) / listPrice × 100.
 * Returns null if listPrice === 0.
 */
export function computeBreakevenDiscountPct(
  listPrice: number,
  costPrice: number,
): number | null {
  if (listPrice === 0) return null
  return ((listPrice - costPrice) / listPrice) * 100
}

/**
 * classifyDiscountLevel
 * none: 0%
 * low: > 0% and <= 5%
 * moderate: > 5% and <= 15%
 * high: > 15% and <= 30%
 * excessive: > 30%
 */
export function classifyDiscountLevel(
  discountPct: number,
): 'none' | 'low' | 'moderate' | 'high' | 'excessive' {
  if (discountPct <= 0) return 'none'
  if (discountPct <= 5) return 'low'
  if (discountPct <= 15) return 'moderate'
  if (discountPct <= 30) return 'high'
  return 'excessive'
}

/**
 * buildDiscountBuckets
 * 5 buckets: 0-5% / 5-10% / 10-20% / 20-30% / 30%+
 * Deals with discount_pct = 0 go into the 0-5% bucket.
 */
export function buildDiscountBuckets(
  deals: Array<{ discount_pct: number; revenue_try: number; margin_pct: number | null }>,
  totalRevenue: number,
): DiscountBucket[] {
  const BUCKETS: Array<{ label: string; min_pct: number; max_pct: number }> = [
    { label: '0-5%',  min_pct: 0,  max_pct: 5  },
    { label: '5-10%', min_pct: 5,  max_pct: 10 },
    { label: '10-20%',min_pct: 10, max_pct: 20 },
    { label: '20-30%',min_pct: 20, max_pct: 30 },
    { label: '30%+',  min_pct: 30, max_pct: Infinity },
  ]

  return BUCKETS.map(b => {
    const matching = deals.filter(d => {
      if (b.min_pct === 0) {
        // First bucket: includes 0% discounts
        return d.discount_pct >= 0 && d.discount_pct <= b.max_pct
      }
      return d.discount_pct > b.min_pct && d.discount_pct <= b.max_pct
    })

    const deal_count = matching.length
    const revenue_try = matching.reduce((s, d) => s + d.revenue_try, 0)

    const withMargin = matching.filter(d => d.margin_pct !== null)
    const avg_margin_pct =
      withMargin.length > 0
        ? withMargin.reduce((s, d) => s + (d.margin_pct as number), 0) / withMargin.length
        : null

    const revenue_share_pct =
      totalRevenue > 0 ? (revenue_try / totalRevenue) * 100 : 0

    return {
      label: b.label,
      min_pct: b.min_pct,
      max_pct: b.max_pct === Infinity ? 100 : b.max_pct,
      deal_count,
      revenue_try,
      avg_margin_pct,
      revenue_share_pct,
    }
  })
}

/**
 * computeAvgDiscountPct
 * Revenue-weighted average: Σ(discount × revenue) / Σ(revenue).
 * Returns null if no revenue.
 */
export function computeAvgDiscountPct(
  deals: Array<{ discount_pct: number; revenue_try: number }>,
): number | null {
  const totalRev = deals.reduce((s, d) => s + d.revenue_try, 0)
  if (totalRev === 0) return null
  const weightedSum = deals.reduce((s, d) => s + d.discount_pct * d.revenue_try, 0)
  return weightedSum / totalRev
}

/**
 * computeDiscountFrequency
 * Fraction of deals with discount_pct > 0 (0–1). Returns 0 if empty.
 */
export function computeDiscountFrequency(deals: Array<{ discount_pct: number }>): number {
  if (deals.length === 0) return 0
  const discounted = deals.filter(d => d.discount_pct > 0).length
  return discounted / deals.length
}

/**
 * computeRevenueLeakage
 * Total revenue foregone: Σ (list - selling) × qty; min 0.
 */
export function computeRevenueLeakage(
  deals: Array<{ list_price: number; selling_price: number; quantity: number }>,
): number {
  const raw = deals.reduce(
    (s, d) => s + (d.list_price - d.selling_price) * d.quantity,
    0,
  )
  return Math.max(0, raw)
}

/**
 * computeMarginErosion
 * avgMarginWithDiscount - avgMarginWithoutDiscount (negative = erosion).
 * Returns null if either argument is null.
 */
export function computeMarginErosion(
  avgMarginWithDiscount: number | null,
  avgMarginWithoutDiscount: number | null,
): number | null {
  if (avgMarginWithDiscount === null || avgMarginWithoutDiscount === null) return null
  return avgMarginWithDiscount - avgMarginWithoutDiscount
}

/**
 * classifyDiscountHealth
 * critical         : avgDiscount > 25% OR marginErosion < -10 pp
 * high_concern     : avgDiscount > 15% OR marginErosion < -5 pp OR frequency > 0.7
 * moderate_concern : avgDiscount > 8%  OR frequency > 0.5
 * healthy          : otherwise
 */
export function classifyDiscountHealth(
  avgDiscountPct: number | null,
  discountFrequency: number,
  marginErosion: number | null,
): 'healthy' | 'moderate_concern' | 'high_concern' | 'critical' {
  if (
    (avgDiscountPct !== null && avgDiscountPct > 25) ||
    (marginErosion !== null && marginErosion < -10)
  ) {
    return 'critical'
  }
  if (
    (avgDiscountPct !== null && avgDiscountPct > 15) ||
    (marginErosion !== null && marginErosion < -5) ||
    discountFrequency > 0.7
  ) {
    return 'high_concern'
  }
  if (
    (avgDiscountPct !== null && avgDiscountPct > 8) ||
    discountFrequency > 0.5
  ) {
    return 'moderate_concern'
  }
  return 'healthy'
}

/**
 * findMostDiscountedProduct
 * Returns the ProductDiscountProfile with the highest avg_discount_pct.
 * Returns null if array is empty.
 */
export function findMostDiscountedProduct(
  profiles: ProductDiscountProfile[],
): ProductDiscountProfile | null {
  if (profiles.length === 0) return null
  return profiles.reduce((best, p) =>
    p.avg_discount_pct > best.avg_discount_pct ? p : best,
  )
}

/**
 * computeOptimalPricingGap
 * Headroom before margin = 0: breakevenDiscountPct - avgDiscountPct.
 * Returns null if either input is null.
 */
export function computeOptimalPricingGap(
  avgDiscountPct: number | null,
  breakevenDiscountPct: number | null,
): number | null {
  if (avgDiscountPct === null || breakevenDiscountPct === null) return null
  return breakevenDiscountPct - avgDiscountPct
}

/**
 * generateDiscountNarrative
 * Deterministic Turkish narrative based on discount health.
 */
export function generateDiscountNarrative(
  health: ReturnType<typeof classifyDiscountHealth>,
  avgDiscountPct: number | null,
  revenueLeakage: number,
  frequency: number,
): string {
  void revenueLeakage
  void frequency

  switch (health) {
    case 'healthy':
      return 'İskonto yapısı sağlıklı — fiyat disiplini korunuyor.'

    case 'moderate_concern': {
      const avg = avgDiscountPct !== null ? avgDiscountPct.toFixed(1) : '?'
      return `Ortalama %${avg} iskonto ile fiyat baskısı hissediliyor.`
    }

    case 'high_concern':
      return 'İskonto oranları yüksek — kar marjları üzerinde baskı var.'

    case 'critical':
      return 'Kritik: Aşırı iskonto politikası karlılığı tehdit ediyor.'
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

function isoDateMonthsBack(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

interface RawSaleItem {
  product_id: string | null
  product_name: string | null
  qty: number | null
  unit_price: number | null
  line_total: number | null
  sale_id: string | null
  products: { list_price: number | null; name: string | null } | null
}

interface AllocationRow {
  sale_id: string
  product_id: string
  qty_allocated: number | null
  cost_price_try: number | null
}

export class DiscountAnalysisService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<DiscountAnalysisReport> {
    const fromDate = isoDateMonthsBack(3)
    const today = new Date().toISOString().slice(0, 10)

    // ── 1. Fetch sale items (last 3 months) with product list_price ────────────
    let rawItems: RawSaleItem[] = []
    try {
      const { data, error } = await this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          qty,
          unit_price,
          line_total,
          sale_id,
          products(name, list_price),
          sales!inner(sale_date, deleted_at, company_id, is_proforma)
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', today)
        .not('product_id', 'is', null)

      if (!error && data) {
        rawItems = data as unknown as RawSaleItem[]
      }
    } catch {
      rawItems = []
    }

    // ── 2. Fetch FIFO cost allocations for COGS context ────────────────────────
    let allocations: AllocationRow[] = []
    try {
      const { data, error } = await this.supabase
        .from('sale_item_allocations')
        .select('sale_id, product_id, qty_allocated, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)

      if (!error && data) {
        allocations = data as AllocationRow[]
      }
    } catch {
      allocations = []
    }

    // Build allocation cost map: key = `${saleId}|${productId}` → total COGS
    const allocMap = new Map<string, number>()
    for (const a of allocations) {
      const key = `${a.sale_id}|${a.product_id}`
      const prev = allocMap.get(key) ?? 0
      allocMap.set(
        key,
        prev + Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0),
      )
    }

    // ── 3. Compute per-deal discount metrics ───────────────────────────────────
    interface DealRecord {
      product_id: string
      product_name: string
      list_price: number
      unit_price: number
      qty: number
      revenue_try: number
      discount_pct: number
      cost_try: number | null
      margin_pct: number | null
    }

    const deals: DealRecord[] = rawItems
      .filter(r => r.product_id != null)
      .map(r => {
        const listPrice = r.products?.list_price != null ? Number(r.products.list_price) : 0
        const unitPrice = Number(r.unit_price ?? 0)
        const qty = Number(r.qty ?? 0)
        const revenue = Number(r.line_total ?? unitPrice * qty)

        const discountPct = computeDiscountPct(listPrice, unitPrice)

        const key = `${r.sale_id}|${r.product_id}`
        const costTry = allocMap.has(key) ? allocMap.get(key)! : null

        let marginPct: number | null = null
        if (costTry !== null && revenue > 0) {
          marginPct = ((revenue - costTry) / revenue) * 100
        }

        const productName =
          r.products?.name ?? (r.product_name ? String(r.product_name) : r.product_id ?? '')

        return {
          product_id: r.product_id!,
          product_name: productName,
          list_price: listPrice,
          unit_price: unitPrice,
          qty,
          revenue_try: revenue,
          discount_pct: discountPct,
          cost_try: costTry,
          margin_pct: marginPct,
        }
      })

    // ── 4. Overall metrics ─────────────────────────────────────────────────────
    const totalRevenue = deals.reduce((s, d) => s + d.revenue_try, 0)

    const avgDiscountPct = computeAvgDiscountPct(
      deals.map(d => ({ discount_pct: d.discount_pct, revenue_try: d.revenue_try })),
    )

    const discountFrequency = computeDiscountFrequency(
      deals.map(d => ({ discount_pct: d.discount_pct })),
    )

    const revenueLeakage = computeRevenueLeakage(
      deals.map(d => ({
        list_price: d.list_price,
        selling_price: d.unit_price,
        quantity: d.qty,
      })),
    )

    const discountedDeals = deals.filter(d => d.discount_pct > 0)
    const nonDiscountedDeals = deals.filter(d => d.discount_pct === 0)

    // Revenue-weighted avg margin for discounted vs non-discounted deals
    function weightedAvgMargin(group: DealRecord[]): number | null {
      const withMargin = group.filter(d => d.margin_pct !== null)
      if (withMargin.length === 0) return null
      const totalRev = withMargin.reduce((s, d) => s + d.revenue_try, 0)
      if (totalRev === 0) return null
      return (
        withMargin.reduce((s, d) => s + (d.margin_pct as number) * d.revenue_try, 0) /
        totalRev
      )
    }

    const avgMarginDiscounted = weightedAvgMargin(discountedDeals)
    const avgMarginNoDiscount = weightedAvgMargin(nonDiscountedDeals)
    const marginErosion = computeMarginErosion(avgMarginDiscounted, avgMarginNoDiscount)

    // ── 5. Discount buckets ────────────────────────────────────────────────────
    const bucketInput = deals.map(d => ({
      discount_pct: d.discount_pct,
      revenue_try: d.revenue_try,
      margin_pct: d.margin_pct,
    }))
    const discount_buckets = buildDiscountBuckets(bucketInput, totalRevenue)

    // ── 6. Product discount profiles ──────────────────────────────────────────
    const productMap = new Map<
      string,
      {
        product_name: string
        list_prices: number[]
        selling_prices: number[]
        discount_pcts: number[]
        revenues: number[]
        margins: Array<number | null>
        cost_tries: Array<number | null>
      }
    >()

    for (const d of deals) {
      const existing = productMap.get(d.product_id)
      if (!existing) {
        productMap.set(d.product_id, {
          product_name: d.product_name,
          list_prices: [d.list_price],
          selling_prices: [d.unit_price],
          discount_pcts: [d.discount_pct],
          revenues: [d.revenue_try],
          margins: [d.margin_pct],
          cost_tries: [d.cost_try],
        })
      } else {
        existing.list_prices.push(d.list_price)
        existing.selling_prices.push(d.unit_price)
        existing.discount_pcts.push(d.discount_pct)
        existing.revenues.push(d.revenue_try)
        existing.margins.push(d.margin_pct)
        existing.cost_tries.push(d.cost_try)
      }
    }

    const product_profiles: ProductDiscountProfile[] = Array.from(
      productMap.entries(),
    ).map(([product_id, p]) => {
      const n = p.list_prices.length
      const avg_list_price = p.list_prices.reduce((s, v) => s + v, 0) / n
      const avg_selling_price = p.selling_prices.reduce((s, v) => s + v, 0) / n
      const avg_discount_pct = p.discount_pcts.reduce((s, v) => s + v, 0) / n
      const max_discount_pct = Math.max(...p.discount_pcts)
      const min_discount_pct = Math.min(...p.discount_pcts)
      const revenue_try = p.revenues.reduce((s, v) => s + v, 0)

      // Avg cost per item for margin at avg discount
      const withCost = p.cost_tries.filter(c => c !== null) as number[]
      const avgCostPerItem =
        withCost.length > 0 ? withCost.reduce((s, c) => s + c, 0) / withCost.length : null

      const margin_at_avg_discount =
        avg_list_price > 0 && avgCostPerItem !== null
          ? computeMarginAtDiscount(avg_list_price, avg_discount_pct, avgCostPerItem)
          : null

      return {
        product_id,
        product_name: p.product_name,
        avg_list_price,
        avg_selling_price,
        avg_discount_pct,
        max_discount_pct,
        min_discount_pct,
        deal_count: n,
        revenue_try,
        margin_at_avg_discount,
      }
    })

    // Sort by revenue descending
    product_profiles.sort((a, b) => b.revenue_try - a.revenue_try)

    // ── 7. Classification & narrative ─────────────────────────────────────────
    const discount_health = classifyDiscountHealth(
      avgDiscountPct,
      discountFrequency,
      marginErosion,
    )

    const narrative = generateDiscountNarrative(
      discount_health,
      avgDiscountPct,
      revenueLeakage,
      discountFrequency,
    )

    return {
      period_label: 'Son 3 Ay',
      total_deals: deals.length,
      discounted_deals: discountedDeals.length,
      avg_discount_pct: avgDiscountPct,
      discount_frequency: discountFrequency,
      revenue_leakage_try: revenueLeakage,
      discount_buckets,
      product_profiles,
      most_discounted_product: findMostDiscountedProduct(product_profiles),
      margin_erosion_pp: marginErosion,
      discount_health,
      narrative,
    }
  }
}
