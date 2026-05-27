// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/inventory-valuation.service.ts
//
// FIFO inventory valuation — turnover analysis, dead stock identification,
// gross margin per product. Operations + finance crossover.
//
// Rules:
//   • cost_price_try (canonical) used when positive; otherwise
//     cost_price × (cost_fx_rate || 1)
//   • Aging from received_at (canonical) or created_at as fallback
//   • Dead stock: qty_remaining > 0 AND zero sales in last 60 days
//   • Slow-moving: annualized turnover rate < 2
//   • Gross margin: uses avg_sale_price from last-30d sales vs FIFO cost
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface StockLotDetail {
  lot_id:         string
  purchase_date:  string          // received_at or created_at (YYYY-MM-DD)
  age_days:       number
  qty_remaining:  number
  entry_cost_try: number
  lot_value:      number          // qty_remaining × entry_cost_try
  is_old:         boolean         // age > 90 days
}

export interface ProductValuation {
  product_id:        string
  product_name:      string
  category?:         string
  // Stock position
  total_qty:         number
  total_value:       number        // FIFO book value
  avg_cost_try:      number        // weighted avg
  lots:              StockLotDetail[]
  // Sales performance
  sales_qty_30d:     number
  sales_revenue_30d: number
  avg_sale_price_try: number
  // Efficiency
  turnover_rate:     number        // annualized
  gross_margin_pct:  number | null
  days_of_stock:     number | null // total_qty / (sales_qty_30d / 30)
  // Risk
  is_dead_stock:     boolean       // zero sales 60d AND qty > 0
  is_slow_moving:    boolean       // turnover < 2 per year
  dead_stock_value:  number

  // ── Legacy fields (kept for backward compat with StockContent) ───────────
  max_age_days:    number
  total_value_try: number
  is_low_stock:    boolean
  lot_count:       number
  oldest_lot_date: string
}

export interface InventoryValuationReport {
  company_id:              string
  as_of_date:              string
  products:                ProductValuation[]
  // Portfolio summary
  total_inventory_value:   number
  total_dead_stock_value:  number
  dead_stock_pct:          number
  weighted_avg_turnover:   number
  total_products:          number
  dead_stock_products:     number
  slow_moving_products:    number
  fastest_mover?:          ProductValuation
  slowest_mover?:          ProductValuation
  computed_at:             string

  // ── Legacy fields (kept for backward compat with StockContent) ───────────
  total_lots:                 number
  total_inventory_value_try:  number
  total_distinct_products:    number
  low_stock_count:            number
  aging_summary: {
    current_try:       number
    aging_30_try:      number
    aging_60_try:      number
    aging_90_plus_try: number
  }
  lots: StockLotValuation[]
}

// ── Pure helper functions (exported for testing) ──────────────────────────────

/**
 * Compute age in days between purchaseDate and today.
 * Both dates as 'YYYY-MM-DD' strings.
 */
export function computeLotAge(purchaseDate: string, today: string): number {
  const purchaseMs = new Date(purchaseDate + 'T00:00:00').getTime()
  const todayMs    = new Date(today        + 'T00:00:00').getTime()
  return Math.max(0, Math.round((todayMs - purchaseMs) / 86_400_000))
}

/**
 * Annualized turnover rate = (sales30d × 12) / avgStockQty.
 * Returns 0 when avgStockQty is 0 (no stock on hand).
 */
export function computeTurnoverRate(sales30d: number, avgStockQty: number): number {
  if (avgStockQty <= 0) return 0
  return (sales30d * 12) / avgStockQty
}

/**
 * Gross margin % = (salePrice - cost) / salePrice × 100.
 * Returns null when salePrice is 0 (cannot divide).
 */
export function computeGrossMargin(salePrice: number, cost: number): number | null {
  if (salePrice <= 0) return null
  return ((salePrice - cost) / salePrice) * 100
}

/**
 * Days of stock = totalQty / (sales30d / 30).
 * Returns null when sales30d is 0 (infinite days of stock).
 */
export function computeDaysOfStock(totalQty: number, sales30d: number): number | null {
  if (sales30d <= 0) return null
  const dailySales = sales30d / 30
  return totalQty / dailySales
}

/**
 * True when a product has remaining stock but zero sales in the last 60 days.
 */
export function isDeadStock(sales60d: number, remainingQty: number): boolean {
  return remainingQty > 0 && sales60d === 0
}

/**
 * True when annualized turnover rate is below 2 (less than 2x per year).
 */
export function isSlowMoving(turnoverRate: number): boolean {
  return turnoverRate < 2
}

/**
 * Build portfolio-level summary from an array of product valuations.
 */
export function buildPortfolioSummary(products: ProductValuation[]): {
  total_inventory_value:   number
  total_dead_stock_value:  number
  dead_stock_pct:          number
  weighted_avg_turnover:   number
  total_products:          number
  dead_stock_products:     number
  slow_moving_products:    number
  fastest_mover?:          ProductValuation
  slowest_mover?:          ProductValuation
} {
  const total_inventory_value  = products.reduce((s, p) => s + p.total_value, 0)
  const total_dead_stock_value = products.reduce((s, p) => s + p.dead_stock_value, 0)
  const dead_stock_pct         = total_inventory_value > 0
    ? (total_dead_stock_value / total_inventory_value) * 100
    : 0
  const dead_stock_products    = products.filter(p => p.is_dead_stock).length
  const slow_moving_products   = products.filter(p => p.is_slow_moving && !p.is_dead_stock).length

  // Weighted average turnover (weight by total_value)
  const totalWeight = products.reduce((s, p) => s + p.total_value, 0)
  const weighted_avg_turnover = totalWeight > 0
    ? products.reduce((s, p) => s + p.turnover_rate * p.total_value, 0) / totalWeight
    : 0

  // Fastest/slowest among products that actually have stock
  const stockedProducts = products.filter(p => p.total_qty > 0)
  const withSales       = stockedProducts.filter(p => p.sales_qty_30d > 0)

  let fastest_mover: ProductValuation | undefined
  let slowest_mover: ProductValuation | undefined

  if (withSales.length > 0) {
    fastest_mover = withSales.reduce((a, b) => b.turnover_rate > a.turnover_rate ? b : a)
    slowest_mover = withSales.reduce((a, b) => b.turnover_rate < a.turnover_rate ? b : a)
    if (fastest_mover === slowest_mover) slowest_mover = undefined
  }

  return {
    total_inventory_value,
    total_dead_stock_value,
    dead_stock_pct,
    weighted_avg_turnover,
    total_products: products.length,
    dead_stock_products,
    slow_moving_products,
    fastest_mover,
    slowest_mover,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class InventoryValuationService {

  // ── Legacy helpers kept for backward-compatible tests ────────────────────

  static getAgeBucket(ageDays: number): 'current' | 'aging_30' | 'aging_60' | 'aging_90_plus' {
    if (ageDays < 30)  return 'current'
    if (ageDays < 60)  return 'aging_30'
    if (ageDays < 90)  return 'aging_60'
    return 'aging_90_plus'
  }

  static computeAging(lots: StockLotValuation[]): {
    current_try:       number
    aging_30_try:      number
    aging_60_try:      number
    aging_90_plus_try: number
  } {
    const summary = { current_try: 0, aging_30_try: 0, aging_60_try: 0, aging_90_plus_try: 0 }
    for (const lot of lots) {
      switch (lot.age_bucket) {
        case 'current':        summary.current_try       += lot.lot_value_try; break
        case 'aging_30':       summary.aging_30_try      += lot.lot_value_try; break
        case 'aging_60':       summary.aging_60_try      += lot.lot_value_try; break
        case 'aging_90_plus':  summary.aging_90_plus_try += lot.lot_value_try; break
      }
    }
    return summary
  }

  // ── Main report ───────────────────────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase:  AnyClient,
    opts?:     { today?: string },
  ): Promise<InventoryValuationReport> {
    const today      = opts?.today ?? new Date().toISOString().slice(0, 10)
    const computedAt = new Date().toISOString()

    // Date boundaries
    const d30ago = subtractDays(today, 30)
    const d60ago = subtractDays(today, 60)

    // Parallel fetch: lots + products + 30d sales + 60d sales (for dead stock)
    const [lotsRes, productsRes, sales30dRes, sales60dRes] = await Promise.all([
      supabase
        .from('stock_lots')
        .select('id, product_id, qty_remaining, cost_price, cost_currency, cost_fx_rate, cost_price_try, received_at, created_at')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null)
        .order('received_at', { ascending: true }),

      supabase
        .from('products')
        .select('id, name, category, cost_price, list_price, currency, stock_alert_qty')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // 30-day sales: join sale_items → sales for date filter
      supabase
        .from('sale_items')
        .select('product_id, qty, line_total, sale_id, sales!inner(sale_date, company_id, deleted_at)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', d30ago)
        .lte('sales.sale_date', today),

      // 60-day sales qty (for dead stock detection)
      supabase
        .from('sale_items')
        .select('product_id, qty, sale_id, sales!inner(sale_date, company_id, deleted_at)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', d60ago)
        .lte('sales.sale_date', today),
    ])

    // ── Build lookup maps ──────────────────────────────────────────────────

    const rawLots     = (lotsRes.data ?? []) as Array<{
      id: string; product_id: string; qty_remaining: number
      cost_price: number; cost_currency: string; cost_fx_rate: number | null
      cost_price_try: number | null; received_at: string | null; created_at: string
    }>

    const rawProducts = (productsRes.data ?? []) as Array<{
      id: string; name: string; category: string | null
      cost_price: number | null; list_price: number | null; currency: string
      stock_alert_qty: number | null
    }>
    const productMap = new Map(rawProducts.map(p => [p.id, p]))

    // 30d sales aggregation: product_id → { qty, revenue }
    const sales30d = new Map<string, { qty: number; revenue: number }>()
    for (const item of (sales30dRes.data ?? []) as Array<{
      product_id: string | null; qty: number; line_total: number
    }>) {
      if (!item.product_id) continue
      const prev = sales30d.get(item.product_id) ?? { qty: 0, revenue: 0 }
      sales30d.set(item.product_id, {
        qty:     prev.qty     + Number(item.qty ?? 0),
        revenue: prev.revenue + Number(item.line_total ?? 0),
      })
    }

    // 60d sales qty: product_id → qty
    const sales60d = new Map<string, number>()
    for (const item of (sales60dRes.data ?? []) as Array<{
      product_id: string | null; qty: number
    }>) {
      if (!item.product_id) continue
      const prev = sales60d.get(item.product_id) ?? 0
      sales60d.set(item.product_id, prev + Number(item.qty ?? 0))
    }

    // ── Build lot details per product ──────────────────────────────────────

    const lotsByProduct = new Map<string, StockLotDetail[]>()

    for (const raw of rawLots) {
      const perUnitTry =
        raw.cost_price_try != null && raw.cost_price_try > 0
          ? raw.cost_price_try
          : Number(raw.cost_price ?? 0) * (Number(raw.cost_fx_rate ?? 1) || 1)

      const purchaseDate = (raw.received_at ?? raw.created_at ?? today).slice(0, 10)
      const ageDays      = computeLotAge(purchaseDate, today)
      const qtyRemaining = Number(raw.qty_remaining ?? 0)

      const detail: StockLotDetail = {
        lot_id:         raw.id,
        purchase_date:  purchaseDate,
        age_days:       ageDays,
        qty_remaining:  qtyRemaining,
        entry_cost_try: perUnitTry,
        lot_value:      qtyRemaining * perUnitTry,
        is_old:         ageDays > 90,
      }

      if (!lotsByProduct.has(raw.product_id)) lotsByProduct.set(raw.product_id, [])
      lotsByProduct.get(raw.product_id)!.push(detail)
    }

    // ── Build product valuations ───────────────────────────────────────────

    const products: ProductValuation[] = []

    // Include products that have lots OR have had recent sales
    const allProductIds = new Set([
      ...lotsByProduct.keys(),
      ...sales30d.keys(),
    ])

    for (const productId of allProductIds) {
      const product  = productMap.get(productId)
      if (!product) continue  // skip products not in catalog

      const lots     = lotsByProduct.get(productId) ?? []
      const totalQty = lots.reduce((s, l) => s + l.qty_remaining, 0)
      const totalVal = lots.reduce((s, l) => s + l.lot_value, 0)
      const avgCost  = totalQty > 0 ? totalVal / totalQty : 0

      const s30       = sales30d.get(productId) ?? { qty: 0, revenue: 0 }
      const s60qty    = sales60d.get(productId) ?? 0
      const salesQty30  = s30.qty
      const salesRev30  = s30.revenue
      const avgSalePrice = salesQty30 > 0 ? salesRev30 / salesQty30 : 0

      // Use FIFO avg cost vs actual avg sale price for gross margin
      const grossMargin = computeGrossMargin(avgSalePrice, avgCost)

      // Turnover: use totalQty as proxy for avgStockQty (single-point approximation)
      const avgStockQty   = totalQty
      const turnoverRate  = computeTurnoverRate(salesQty30, avgStockQty)
      const daysOfStock   = computeDaysOfStock(totalQty, salesQty30)

      const dead   = isDeadStock(s60qty, totalQty)
      const slow   = !dead && isSlowMoving(turnoverRate) && totalQty > 0
      const deadVal = dead ? totalVal : 0

      // Legacy compat fields
      const alertQty    = Number(product.stock_alert_qty ?? 0)
      const maxAgeDays  = lots.length > 0 ? Math.max(...lots.map(l => l.age_days)) : 0
      const isLowStock  = alertQty > 0 && totalQty < alertQty

      products.push({
        product_id:         productId,
        product_name:       product.name,
        category:           product.category ?? undefined,
        total_qty:          totalQty,
        total_value:        totalVal,
        avg_cost_try:       avgCost,
        lots,
        sales_qty_30d:      salesQty30,
        sales_revenue_30d:  salesRev30,
        avg_sale_price_try: avgSalePrice,
        turnover_rate:      turnoverRate,
        gross_margin_pct:   grossMargin,
        days_of_stock:      daysOfStock,
        is_dead_stock:      dead,
        is_slow_moving:     slow,
        dead_stock_value:   deadVal,
        // Legacy
        max_age_days:    maxAgeDays,
        total_value_try: totalVal,
        is_low_stock:    isLowStock,
        lot_count:       lots.length,
        oldest_lot_date: lots.length > 0
          ? lots.reduce((o, l) => l.age_days > o.age_days ? l : o, lots[0]).purchase_date
          : today,
      })
    }

    // Sort: highest total_value first
    products.sort((a, b) => b.total_value - a.total_value)

    const summary      = buildPortfolioSummary(products)
    const lowStockCount = products.filter(p => p.is_low_stock).length

    // Build legacy lot list for StockContent
    const legacyLots: StockLotValuation[] = rawLots.map(raw => {
      const perUnitTry =
        raw.cost_price_try != null && raw.cost_price_try > 0
          ? raw.cost_price_try
          : Number(raw.cost_price ?? 0) * (Number(raw.cost_fx_rate ?? 1) || 1)
      const entryDateStr = (raw.received_at ?? raw.created_at ?? today).slice(0, 10)
      const ageDays      = computeLotAge(entryDateStr, today)
      const product      = productMap.get(raw.product_id)
      return {
        lot_id:         raw.id,
        product_id:     raw.product_id,
        product_name:   product?.name ?? raw.product_id,
        qty_remaining:  Number(raw.qty_remaining ?? 0),
        entry_cost_try: perUnitTry,
        lot_value_try:  Number(raw.qty_remaining ?? 0) * perUnitTry,
        entry_date:     entryDateStr,
        age_days:       ageDays,
        age_bucket:     InventoryValuationService.getAgeBucket(ageDays),
      }
    })

    const agingSummary = InventoryValuationService.computeAging(legacyLots)

    return {
      company_id: companyId,
      as_of_date: today,
      products,
      ...summary,
      computed_at: computedAt,
      // Legacy fields
      total_lots:                legacyLots.length,
      total_inventory_value_try: summary.total_inventory_value,
      total_distinct_products:   products.length,
      low_stock_count:           lowStockCount,
      aging_summary:             agingSummary,
      lots:                      legacyLots,
    }
  }
}

// ── Legacy type kept for backward-compatible tests ────────────────────────────

export interface StockLotValuation {
  lot_id:         string
  product_id:     string
  product_name:   string
  qty_remaining:  number
  entry_cost_try: number
  lot_value_try:  number
  entry_date:     string
  age_days:       number
  age_bucket:     'current' | 'aging_30' | 'aging_60' | 'aging_90_plus'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
