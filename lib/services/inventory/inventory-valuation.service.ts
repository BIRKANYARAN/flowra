// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/inventory-valuation.service.ts
//
// FIFO inventory valuation — DERIVED read-only. Nothing is written to DB.
//
// Rules:
//   • cost_price_try (canonical) is used when positive; otherwise falls back to
//     cost_price × (cost_fx_rate || 1)
//   • lot_value_try  = qty_remaining × per_unit_try
//   • Aging from received_at (canonical receipt date) or created_at as fallback
//   • is_low_stock: qty < product.stock_alert_qty when stock_alert_qty > 0
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface StockLotValuation {
  lot_id:        string
  product_id:    string
  product_name:  string
  qty_remaining: number
  entry_cost_try: number      // frozen per-unit TRY cost
  lot_value_try:  number      // qty_remaining × entry_cost_try
  entry_date:     string      // received_at or created_at (YYYY-MM-DD)
  age_days:       number
  age_bucket:     'current' | 'aging_30' | 'aging_60' | 'aging_90_plus'
}

export interface ProductInventorySummary {
  product_id:      string
  product_name:    string
  total_qty:       number
  total_value_try: number
  avg_cost_try:    number      // total_value_try / total_qty (weighted average)
  oldest_lot_date: string
  max_age_days:    number
  lot_count:       number
  is_low_stock:    boolean     // total_qty < stock_alert_qty (if set > 0)
}

export interface InventoryValuationReport {
  as_of_date:                 string
  total_inventory_value_try:  number
  total_distinct_products:    number
  total_lots:                 number

  aging_summary: {
    current_try:       number   // lots < 30 days old
    aging_30_try:      number   // 30-60 days
    aging_60_try:      number   // 60-90 days
    aging_90_plus_try: number   // 90+ days
  }

  low_stock_count: number
  products: ProductInventorySummary[]
  lots:     StockLotValuation[]

  computed_at: string
}

// ── Service ───────────────────────────────────────────────────────────────────

export class InventoryValuationService {

  // ── Pure helpers (exported for testing) ──────────────────────────────────

  static getAgeBucket(ageDays: number): StockLotValuation['age_bucket'] {
    if (ageDays < 30)  return 'current'
    if (ageDays < 60)  return 'aging_30'
    if (ageDays < 90)  return 'aging_60'
    return 'aging_90_plus'
  }

  static computeAging(lots: StockLotValuation[]): InventoryValuationReport['aging_summary'] {
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
    const today       = opts?.today ?? new Date().toISOString().slice(0, 10)
    const todayMs     = new Date(today + 'T00:00:00').getTime()
    const computedAt  = new Date().toISOString()

    // Parallel: lots + products (for reorder/alert qty)
    const [lotsRes, productsRes] = await Promise.all([
      supabase
        .from('stock_lots')
        .select('id, product_id, qty_remaining, cost_price, cost_currency, cost_fx_rate, cost_price_try, received_at, created_at')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null)
        .order('received_at', { ascending: true }),
      supabase
        .from('products')
        .select('id, name, stock_alert_qty')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const rawLots     = (lotsRes.data ?? []) as Array<{
      id: string; product_id: string; qty_remaining: number
      cost_price: number; cost_currency: string; cost_fx_rate: number | null
      cost_price_try: number | null; received_at: string | null; created_at: string
    }>
    const rawProducts = (productsRes.data ?? []) as Array<{
      id: string; name: string; stock_alert_qty: number | null
    }>

    const productMap = new Map(rawProducts.map(p => [p.id, p]))

    // ── Build lot valuations ───────────────────────────────────────────────
    const lots: StockLotValuation[] = []

    for (const raw of rawLots) {
      // Determine per-unit TRY cost (cost_price_try is canonical when positive)
      const perUnitTry =
        raw.cost_price_try != null && raw.cost_price_try > 0
          ? raw.cost_price_try
          : raw.cost_price * (raw.cost_fx_rate ?? 1)

      const entryDateStr = (raw.received_at ?? raw.created_at ?? today).slice(0, 10)
      const entryMs      = new Date(entryDateStr + 'T00:00:00').getTime()
      const ageDays      = Math.max(0, Math.round((todayMs - entryMs) / 86_400_000))

      const product = productMap.get(raw.product_id)

      lots.push({
        lot_id:         raw.id,
        product_id:     raw.product_id,
        product_name:   product?.name ?? raw.product_id,
        qty_remaining:  raw.qty_remaining,
        entry_cost_try: perUnitTry,
        lot_value_try:  raw.qty_remaining * perUnitTry,
        entry_date:     entryDateStr,
        age_days:       ageDays,
        age_bucket:     this.getAgeBucket(ageDays),
      })
    }

    // ── Build product summaries ────────────────────────────────────────────
    const byProduct = new Map<string, StockLotValuation[]>()
    for (const lot of lots) {
      if (!byProduct.has(lot.product_id)) byProduct.set(lot.product_id, [])
      byProduct.get(lot.product_id)!.push(lot)
    }

    const products: ProductInventorySummary[] = []

    for (const [productId, productLots] of byProduct) {
      const product       = productMap.get(productId)
      const totalQty      = productLots.reduce((s, l) => s + l.qty_remaining, 0)
      const totalValue    = productLots.reduce((s, l) => s + l.lot_value_try, 0)
      const avgCost       = totalQty > 0 ? totalValue / totalQty : 0
      const alertQty      = product?.stock_alert_qty ?? 0
      const isLowStock    = alertQty > 0 && totalQty < alertQty
      const maxAge        = Math.max(...productLots.map(l => l.age_days))
      const oldestLot     = productLots.reduce(
        (oldest, l) => l.age_days > oldest.age_days ? l : oldest,
        productLots[0],
      )

      products.push({
        product_id:      productId,
        product_name:    product?.name ?? productId,
        total_qty:       totalQty,
        total_value_try: totalValue,
        avg_cost_try:    avgCost,
        oldest_lot_date: oldestLot.entry_date,
        max_age_days:    maxAge,
        lot_count:       productLots.length,
        is_low_stock:    isLowStock,
      })
    }

    // Sort: highest value first
    products.sort((a, b) => b.total_value_try - a.total_value_try)

    const totalInventoryValue  = lots.reduce((s, l) => s + l.lot_value_try, 0)
    const agingSummary         = this.computeAging(lots)
    const lowStockCount        = products.filter(p => p.is_low_stock).length

    return {
      as_of_date:                today,
      total_inventory_value_try: totalInventoryValue,
      total_distinct_products:   products.length,
      total_lots:                lots.length,
      aging_summary:             agingSummary,
      low_stock_count:           lowStockCount,
      products,
      lots,
      computed_at:               computedAt,
    }
  }
}
