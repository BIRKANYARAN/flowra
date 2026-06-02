// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/sales-velocity.service.ts
//
// Product Sales Velocity & Reorder Intelligence
//
// Computes per-product sales velocity (units/day, units/week), predicts
// stock-out dates, and generates reorder recommendations with safety stock
// calculations.
//
// Rules:
//   • Observation window: default 90 days (configurable)
//   • Daily velocity = total_qty_sold / observation_days
//   • Safety stock = velocity × lead_time_days × safety_factor (default 1.5)
//   • Reorder point  = safety_stock + (velocity × lead_time_days)
//   • Reorder qty    = safety_stock × 2 (simple EOQ approximation)
//   • Lead time: avg days between purchase_date and finalized_at per product
//                (default 14 if no purchase history)
//   • Urgency: critical ≤7d, urgent 8–14d, low 15–30d, healthy >30d,
//              no_movement (velocity = 0)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface ProductVelocity {
  product_id:        string
  product_name:      string
  sku:               string | null
  current_qty:       number
  daily_velocity:    number
  weekly_velocity:   number         // daily_velocity × 7
  days_to_stockout:  number | null  // null = no movement
  stock_urgency:     'no_movement' | 'critical' | 'urgent' | 'low' | 'healthy'
  safety_stock:      number
  reorder_point:     number
  reorder_qty:       number         // safety_stock × 2
  avg_lead_time_days: number        // from purchase history; default 14
  last_sale_date:    string | null
  units_sold_30d:    number
  units_sold_90d:    number
}

export interface SalesVelocityReport {
  as_of_date:        string
  observation_days:  number
  total_products:    number
  critical_count:    number
  urgent_count:      number
  no_movement_count: number
  products:          ProductVelocity[]  // sorted by urgency, then days_to_stockout asc
  reorder_alerts:    ProductVelocity[]  // current_qty <= reorder_point
}

// ── Urgency sort order (lower = more urgent) ──────────────────────────────────

const URGENCY_ORDER: Record<ProductVelocity['stock_urgency'], number> = {
  critical:    0,
  urgent:      1,
  low:         2,
  healthy:     3,
  no_movement: 4,
}

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Compute average daily sales velocity.
 * Returns 0 when observationDays is 0 (avoids divide-by-zero).
 */
export function computeDailyVelocity(
  totalQtySold:    number,
  observationDays: number,
): number {
  if (observationDays <= 0) return 0
  return totalQtySold / observationDays
}

/**
 * Compute days until stock-out given current quantity and daily velocity.
 * Returns null when velocity = 0 (no sales → no stockout prediction).
 * Returns 0 when currentQty <= 0 (already out of stock).
 */
export function computeDaysToStockout(
  currentQty:    number,
  dailyVelocity: number,
): number | null {
  if (dailyVelocity <= 0) return null
  if (currentQty <= 0) return 0
  return currentQty / dailyVelocity
}

/**
 * Compute safety stock = velocity × lead_time_days × safety_factor.
 * Default safety_factor = 1.5 (50% buffer). Result rounded up to nearest int.
 */
export function computeSafetyStock(
  dailyVelocity:  number,
  leadTimeDays:   number,
  safetyFactor  = 1.5,
): number {
  return Math.ceil(dailyVelocity * leadTimeDays * safetyFactor)
}

/**
 * Compute reorder point = safety_stock + (velocity × lead_time_days).
 */
export function computeReorderPoint(
  dailyVelocity: number,
  leadTimeDays:  number,
  safetyFactor = 1.5,
): number {
  const safetyStock = computeSafetyStock(dailyVelocity, leadTimeDays, safetyFactor)
  return safetyStock + Math.ceil(dailyVelocity * leadTimeDays)
}

/**
 * Classify stock urgency based on days to stockout.
 *   null (no velocity): 'no_movement'
 *   ≤7 days:            'critical'
 *   8–14 days:          'urgent'
 *   15–30 days:         'low'
 *   >30 days:           'healthy'
 */
export function classifyStockUrgency(
  daysToStockout: number | null,
): 'no_movement' | 'critical' | 'urgent' | 'low' | 'healthy' {
  if (daysToStockout === null) return 'no_movement'
  if (daysToStockout <= 7)    return 'critical'
  if (daysToStockout <= 14)   return 'urgent'
  if (daysToStockout <= 30)   return 'low'
  return 'healthy'
}

// ── Service class ─────────────────────────────────────────────────────────────

export class SalesVelocityService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId:       string,
    observationDays  = 90,
  ): Promise<SalesVelocityReport> {
    const today   = new Date().toISOString().slice(0, 10)
    const d30ago  = subtractDays(today, 30)
    const dObsAgo = subtractDays(today, observationDays)

    // ── Parallel fetches ──────────────────────────────────────────────────────

    const [
      lotsRes,
      productsRes,
      salesObsRes,
      sales30dRes,
      leadTimeRes,
    ] = await Promise.all([
      // Current stock: aggregate qty_remaining per product from active lots
      this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null),

      // Products catalog
      this.supabase
        .from('products')
        .select('id, name, sku')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Sales in observation window via sale_item_allocations → sale_items → sales
      this.supabase
        .from('sale_item_allocations')
        .select('qty_allocated, sale_items!inner(product_id, sale_id, sales!inner(sale_date, company_id, deleted_at))')
        .eq('sale_items.sales.company_id', companyId)
        .is('sale_items.sales.deleted_at', null)
        .gte('sale_items.sales.sale_date', dObsAgo)
        .lte('sale_items.sales.sale_date', today),

      // Sales in last 30 days (subset for units_sold_30d)
      this.supabase
        .from('sale_item_allocations')
        .select('qty_allocated, sale_items!inner(product_id, sale_id, sales!inner(sale_date, company_id, deleted_at))')
        .eq('sale_items.sales.company_id', companyId)
        .is('sale_items.sales.deleted_at', null)
        .gte('sale_items.sales.sale_date', d30ago)
        .lte('sale_items.sales.sale_date', today),

      // Lead time: avg days between purchase_date and finalized_at per product
      this.supabase
        .from('purchases')
        .select('id, purchase_date, finalized_at, purchase_items!inner(product_id)')
        .eq('company_id', companyId)
        .eq('status', 'finalized')
        .not('finalized_at', 'is', null),
    ])

    // ── Build stock qty map per product ────────────────────────────────────────

    const stockQtyMap = new Map<string, number>()
    for (const lot of (lotsRes.data ?? []) as Array<{ product_id: string; qty_remaining: number }>) {
      const prev = stockQtyMap.get(lot.product_id) ?? 0
      stockQtyMap.set(lot.product_id, prev + Number(lot.qty_remaining ?? 0))
    }

    // ── Build products map ─────────────────────────────────────────────────────

    const productMap = new Map<string, { name: string; sku: string | null }>()
    for (const p of (productsRes.data ?? []) as Array<{ id: string; name: string; sku: string | null }>) {
      productMap.set(p.id, { name: p.name, sku: p.sku })
    }

    // ── Aggregate sales in observation window ─────────────────────────────────

    type RawSaleAlloc = {
      qty_allocated: number
      sale_items: {
        product_id: string | null
        sale_id: string
        sales: { sale_date: string; company_id: string; deleted_at: string | null }
          | Array<{ sale_date: string; company_id: string; deleted_at: string | null }>
      } | Array<{
        product_id: string | null
        sale_id: string
        sales: { sale_date: string; company_id: string; deleted_at: string | null }
          | Array<{ sale_date: string; company_id: string; deleted_at: string | null }>
      }>
    }

    // Helper to flatten Supabase inner join (may be object or array)
    function flattenSaleItem(row: RawSaleAlloc): {
      product_id: string | null
      sale_date: string | null
      qty: number
    } | null {
      const saleItemRaw = Array.isArray(row.sale_items) ? row.sale_items[0] : row.sale_items
      if (!saleItemRaw) return null
      const salesRaw = Array.isArray(saleItemRaw.sales) ? saleItemRaw.sales[0] : saleItemRaw.sales
      return {
        product_id: saleItemRaw.product_id,
        sale_date:  salesRaw?.sale_date ?? null,
        qty:        Number(row.qty_allocated ?? 0),
      }
    }

    // Observation window aggregation: product_id → { qty, last_sale_date }
    const salesObsMap = new Map<string, { qty: number; last_sale_date: string | null }>()
    for (const rawRow of (salesObsRes.data ?? []) as RawSaleAlloc[]) {
      const item = flattenSaleItem(rawRow)
      if (!item || !item.product_id) continue
      const prev = salesObsMap.get(item.product_id) ?? { qty: 0, last_sale_date: null }
      const lastDate =
        prev.last_sale_date === null ? item.sale_date
        : item.sale_date !== null && item.sale_date > prev.last_sale_date
          ? item.sale_date
          : prev.last_sale_date
      salesObsMap.set(item.product_id, {
        qty:            prev.qty + item.qty,
        last_sale_date: lastDate,
      })
    }

    // 30-day aggregation
    const sales30Map = new Map<string, number>()
    for (const rawRow of (sales30dRes.data ?? []) as RawSaleAlloc[]) {
      const item = flattenSaleItem(rawRow)
      if (!item || !item.product_id) continue
      const prev = sales30Map.get(item.product_id) ?? 0
      sales30Map.set(item.product_id, prev + item.qty)
    }

    // ── Compute lead time per product from purchase history ───────────────────

    type RawPurchase = {
      id: string
      purchase_date: string
      finalized_at:  string
      purchase_items: Array<{ product_id: string }> | { product_id: string }
    }

    const leadTimeSumMap = new Map<string, { total: number; count: number }>()
    for (const raw of (leadTimeRes.data ?? []) as RawPurchase[]) {
      if (!raw.finalized_at || !raw.purchase_date) continue
      const pDate   = new Date(raw.purchase_date + 'T00:00:00').getTime()
      const fDate   = new Date(raw.finalized_at).getTime()
      const leadDays = Math.max(0, Math.round((fDate - pDate) / 86_400_000))

      const items = Array.isArray(raw.purchase_items) ? raw.purchase_items : [raw.purchase_items]
      const seenProducts = new Set<string>()
      for (const item of items) {
        if (!item?.product_id || seenProducts.has(item.product_id)) continue
        seenProducts.add(item.product_id)
        const prev = leadTimeSumMap.get(item.product_id) ?? { total: 0, count: 0 }
        leadTimeSumMap.set(item.product_id, { total: prev.total + leadDays, count: prev.count + 1 })
      }
    }

    // ── Build all product IDs from union of lots + obs sales ──────────────────

    const allProductIds = new Set([
      ...stockQtyMap.keys(),
      ...salesObsMap.keys(),
    ])

    // ── Compute ProductVelocity for each product ───────────────────────────────

    const products: ProductVelocity[] = []

    for (const productId of allProductIds) {
      const prod = productMap.get(productId)
      if (!prod) continue   // skip products not in catalog

      const currentQty = stockQtyMap.get(productId) ?? 0

      const obs           = salesObsMap.get(productId) ?? { qty: 0, last_sale_date: null }
      const unitsSold90   = obs.qty
      const unitsSold30   = sales30Map.get(productId) ?? 0
      const lastSaleDate  = obs.last_sale_date

      // Lead time
      const ltData         = leadTimeSumMap.get(productId)
      const avgLeadTimeDays = ltData && ltData.count > 0
        ? Math.round(ltData.total / ltData.count)
        : 14   // default 14 days

      const dailyVelocity  = computeDailyVelocity(unitsSold90, observationDays)
      const weeklyVelocity = dailyVelocity * 7
      const daysToStockout = computeDaysToStockout(currentQty, dailyVelocity)
      const stockUrgency   = classifyStockUrgency(daysToStockout)
      const safetyStock    = computeSafetyStock(dailyVelocity, avgLeadTimeDays)
      const reorderPoint   = computeReorderPoint(dailyVelocity, avgLeadTimeDays)
      const reorderQty     = safetyStock * 2

      products.push({
        product_id:        productId,
        product_name:      prod.name,
        sku:               prod.sku,
        current_qty:       currentQty,
        daily_velocity:    dailyVelocity,
        weekly_velocity:   weeklyVelocity,
        days_to_stockout:  daysToStockout,
        stock_urgency:     stockUrgency,
        safety_stock:      safetyStock,
        reorder_point:     reorderPoint,
        reorder_qty:       reorderQty,
        avg_lead_time_days: avgLeadTimeDays,
        last_sale_date:    lastSaleDate,
        units_sold_30d:    unitsSold30,
        units_sold_90d:    unitsSold90,
      })
    }

    // ── Sort: critical → urgent → low → healthy → no_movement ─────────────────
    products.sort((a, b) => {
      const urgencyDiff = URGENCY_ORDER[a.stock_urgency] - URGENCY_ORDER[b.stock_urgency]
      if (urgencyDiff !== 0) return urgencyDiff
      // Secondary: days_to_stockout ascending (nulls last)
      if (a.days_to_stockout === null && b.days_to_stockout === null) return 0
      if (a.days_to_stockout === null) return 1
      if (b.days_to_stockout === null) return -1
      return a.days_to_stockout - b.days_to_stockout
    })

    // ── Build summary counts ───────────────────────────────────────────────────

    const criticalCount   = products.filter(p => p.stock_urgency === 'critical').length
    const urgentCount     = products.filter(p => p.stock_urgency === 'urgent').length
    const noMovementCount = products.filter(p => p.stock_urgency === 'no_movement').length

    // Reorder alerts: products where current_qty ≤ reorder_point
    const reorderAlerts = products.filter(p => p.current_qty <= p.reorder_point)

    return {
      as_of_date:        today,
      observation_days:  observationDays,
      total_products:    products.length,
      critical_count:    criticalCount,
      urgent_count:      urgentCount,
      no_movement_count: noMovementCount,
      products,
      reorder_alerts:    reorderAlerts,
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
