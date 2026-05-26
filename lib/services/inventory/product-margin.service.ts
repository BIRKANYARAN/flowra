// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/inventory/product-margin.service.ts
//
// Product Margin Analysis — FIFO-based gross margin per product.
//
// Revenue source  : sale_items (unit_price × quantity × line multipliers)
// COGS source     : stock_lots (average cost_price_try of remaining lots as proxy
//                   for sold lots — acceptable FIFO approximation when exact
//                   lot-allocation tracking is not available)
// Stock value     : stock_lots (qty_remaining × cost_price_try)
//
// The simplified COGS approach:
//   For each product, we compute the weighted average cost across all remaining
//   stock lots (same as the CatalogContent component does). This is a reasonable
//   proxy for the true FIFO cost of units sold during the period.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface ProductMarginData {
  product_id: string
  product_name: string
  category: string | null

  // Sales in period
  units_sold: number
  revenue_try: number

  // COGS (FIFO cost of units sold — weighted average lot cost as proxy)
  avg_fifo_cost_try: number       // average entry cost of sold lots
  total_cogs_try: number          // avg_cost × units_sold

  // Margins
  gross_margin_try: number        // revenue - cogs
  gross_margin_pct: number        // (revenue - cogs) / revenue × 100

  // Current inventory
  units_in_stock: number
  stock_value_try: number         // from stock_lots

  // Grade
  margin_grade: 'excellent' | 'good' | 'fair' | 'poor'
}

export interface ProductMarginReport {
  period_from: string
  period_to: string

  total_revenue_try: number
  total_cogs_try: number
  overall_gross_margin_pct: number

  products: ProductMarginData[]   // sorted by gross_margin_pct desc

  top_margin_product: string | null
  lowest_margin_product: string | null
  products_below_threshold_count: number  // below 10% margin

  computed_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ── Main service ───────────────────────────────────────────────────────────────

export class ProductMarginService {

  // ── Pure: grade a margin percentage ─────────────────────────────────────────

  static getMarginGrade(marginPct: number): ProductMarginData['margin_grade'] {
    if (marginPct > 40) return 'excellent'
    if (marginPct > 20) return 'good'
    if (marginPct > 10) return 'fair'
    return 'poor'
  }

  // ── Main: get product margin report ─────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    period: { from: string; to: string },
  ): Promise<ProductMarginReport> {

    // ── Parallel data fetch ──────────────────────────────────────────────────
    const [saleItemsResult, stockLotsResult, productsResult] = await Promise.all([

      // Sale items in period — joined through sales for date filter
      supabase
        .from('sale_items')
        .select('product_id, product_name, quantity, price, line_total_try, sales!inner(sale_date, company_id)')
        .eq('sales.company_id', companyId)
        .gte('sales.sale_date', period.from)
        .lte('sales.sale_date', period.to)
        .is('sales.deleted_at', null),

      // Stock lots — for FIFO cost proxy and current stock value
      supabase
        .from('stock_lots')
        .select('product_id, qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),

      // Products — for category and name fallback
      supabase
        .from('products')
        .select('id, name, category')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const rawSaleItems = (saleItemsResult.data ?? []) as Array<{
      product_id: string | null
      product_name: string
      quantity: number
      price: number
      line_total_try: number
    }>

    const stockLots = (stockLotsResult.data ?? []) as Array<{
      product_id: string
      qty_remaining: number
      cost_price_try: number | null
    }>

    const products = (productsResult.data ?? []) as Array<{
      id: string
      name: string
      category: string | null
    }>

    // ── Build product catalog lookup ─────────────────────────────────────────
    const productCatalog = new Map<string, { name: string; category: string | null }>()
    for (const p of products) {
      productCatalog.set(p.id, { name: p.name, category: p.category ?? null })
    }

    // ── Compute weighted average FIFO cost per product (from stock lots) ─────
    // sum(qty_remaining × cost_price_try) / sum(qty_remaining) = weighted avg cost
    const lotCostMap = new Map<string, { costQty: number; qty: number }>()
    const stockValueMap = new Map<string, { qty: number; value: number }>()

    for (const lot of stockLots) {
      const pid  = String(lot.product_id ?? '')
      if (!pid) continue
      const cost = Number(lot.cost_price_try ?? 0)
      const qty  = Number(lot.qty_remaining ?? 0)

      const prev = lotCostMap.get(pid) ?? { costQty: 0, qty: 0 }
      lotCostMap.set(pid, { costQty: prev.costQty + cost * qty, qty: prev.qty + qty })

      const prevVal = stockValueMap.get(pid) ?? { qty: 0, value: 0 }
      stockValueMap.set(pid, { qty: prevVal.qty + qty, value: prevVal.value + cost * qty })
    }

    // Weighted average cost per product
    const avgCostMap = new Map<string, number>()
    for (const [pid, { costQty, qty }] of lotCostMap.entries()) {
      avgCostMap.set(pid, qty > 0 ? costQty / qty : 0)
    }

    // ── Aggregate sale items by product ─────────────────────────────────────
    const productAgg = new Map<string, {
      product_name: string
      units_sold: number
      revenue_try: number
    }>()

    for (const item of rawSaleItems) {
      const pid  = String(item.product_id ?? '')
      if (!pid) continue

      const qty     = Number(item.quantity     ?? 0)
      const lineTry = Number(item.line_total_try != null ? item.line_total_try : item.price * qty || 0)

      const prev = productAgg.get(pid) ?? { product_name: item.product_name, units_sold: 0, revenue_try: 0 }
      productAgg.set(pid, {
        product_name: prev.product_name || item.product_name,
        units_sold:   prev.units_sold  + qty,
        revenue_try:  prev.revenue_try + lineTry,
      })
    }

    // ── Build ProductMarginData array ────────────────────────────────────────
    const productMargins: ProductMarginData[] = []

    for (const [pid, agg] of productAgg.entries()) {
      const catalogEntry = productCatalog.get(pid)
      const avg_fifo_cost = avgCostMap.get(pid) ?? 0
      const stockInfo     = stockValueMap.get(pid) ?? { qty: 0, value: 0 }

      const total_cogs_try  = round2(avg_fifo_cost * agg.units_sold)
      const gross_margin_try = round2(agg.revenue_try - total_cogs_try)
      const gross_margin_pct = agg.revenue_try > 0
        ? round2((gross_margin_try / agg.revenue_try) * 100)
        : 0

      productMargins.push({
        product_id:        pid,
        product_name:      catalogEntry?.name ?? agg.product_name,
        category:          catalogEntry?.category ?? null,
        units_sold:        agg.units_sold,
        revenue_try:       round2(agg.revenue_try),
        avg_fifo_cost_try: round2(avg_fifo_cost),
        total_cogs_try,
        gross_margin_try,
        gross_margin_pct,
        units_in_stock:    round2(stockInfo.qty),
        stock_value_try:   round2(stockInfo.value),
        margin_grade:      ProductMarginService.getMarginGrade(gross_margin_pct),
      })
    }

    // Sort by gross_margin_pct descending
    productMargins.sort((a, b) => b.gross_margin_pct - a.gross_margin_pct)

    // ── Totals ───────────────────────────────────────────────────────────────
    const total_revenue_try = round2(productMargins.reduce((s, p) => s + p.revenue_try, 0))
    const total_cogs_try    = round2(productMargins.reduce((s, p) => s + p.total_cogs_try, 0))
    const overall_gross_margin_pct = total_revenue_try > 0
      ? round2(((total_revenue_try - total_cogs_try) / total_revenue_try) * 100)
      : 0

    const top_margin_product    = productMargins[0]?.product_name ?? null
    const lowest_margin_product = productMargins[productMargins.length - 1]?.product_name ?? null
    const products_below_threshold_count = productMargins.filter(p => p.gross_margin_pct < 10).length

    return {
      period_from:   period.from,
      period_to:     period.to,
      total_revenue_try,
      total_cogs_try,
      overall_gross_margin_pct,
      products:      productMargins,
      top_margin_product:    productMargins.length > 0 ? top_margin_product : null,
      lowest_margin_product: productMargins.length > 1 ? lowest_margin_product : null,
      products_below_threshold_count,
      computed_at:   new Date().toISOString(),
    }
  }
}
