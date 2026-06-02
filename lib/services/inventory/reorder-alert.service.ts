// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/reorder-alert.service.ts
//
// Inventory Reorder Alert System — low stock detection + reorder suggestions.
//
// Logic:
//   out_of_stock : current_qty ≤ 0
//   critical     : current_qty ≤ reorder_point_qty (and point > 0)
//   low          : current_qty ≤ reorder_point_qty × 1.5 (and > reorder_point_qty)
//   adequate     : current_qty > reorder_point_qty × 1.5
//   no_threshold : reorder_point_qty is null
//
// Average daily consumption: sum(qty_sold) / 30 over last 30 days of sales.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface StockLevel {
  product_id: string
  product_name: string
  product_sku: string | null
  current_qty: number               // sum of remaining stock_lots
  reorder_point_qty: number | null  // from product_reorder_thresholds, null if not set
  reorder_qty: number | null
  lead_time_days: number | null
  avg_daily_consumption: number | null  // computed from last 30 days of sales
  days_of_stock_remaining: number | null  // current_qty / avg_daily_consumption
}

export type AlertLevel = 'out_of_stock' | 'critical' | 'low' | 'adequate' | 'no_threshold'

export interface ReorderAlert {
  product_id: string
  product_name: string
  product_sku: string | null
  current_qty: number
  reorder_point_qty: number | null
  reorder_qty: number | null
  alert_level: AlertLevel
  days_of_stock_remaining: number | null
  avg_daily_consumption: number | null
  suggested_order_qty: number | null   // reorder_qty OR 2×avg_daily_consumption×14 if no threshold
  urgency_label: string                // Turkish: 'Stok Bitti' | 'Kritik' | 'Düşük' | 'Yeterli' | 'Eşik Yok'
  action_required: boolean
}

export interface ReorderAlertReport {
  alerts: ReorderAlert[]             // all products, sorted by alert_level severity then by days_remaining
  out_of_stock_count: number
  critical_count: number
  low_count: number
  total_products_tracked: number
  products_without_threshold: number  // products with stock but no reorder threshold set
  as_of_date: string
}

// ── Alert level severity order (lower index = more severe) ───────────────────

const SEVERITY_ORDER: AlertLevel[] = ['out_of_stock', 'critical', 'low', 'adequate', 'no_threshold']

// ── Pure helpers (exported for testing) ──────────────────────────────────────

export function assignAlertLevel(
  currentQty: number,
  reorderPoint: number | null,
): AlertLevel {
  if (currentQty <= 0) return 'out_of_stock'
  if (reorderPoint === null) return 'no_threshold'
  if (reorderPoint <= 0) return 'adequate'
  if (currentQty <= reorderPoint) return 'critical'
  if (currentQty <= reorderPoint * 1.5) return 'low'
  return 'adequate'
}

export function computeDaysRemaining(
  currentQty: number,
  avgDailyConsumption: number | null,
): number | null {
  if (avgDailyConsumption === null || avgDailyConsumption <= 0) return null
  return Math.floor(currentQty / avgDailyConsumption)
}

export function computeSuggestedOrderQty(
  reorderQty: number | null,
  avgDailyConsumption: number | null,
): number | null {
  // Prefer explicit reorder_qty
  if (reorderQty !== null && reorderQty > 0) return reorderQty
  // Fall back: 2 × avg_daily_consumption × 14 days
  if (avgDailyConsumption !== null && avgDailyConsumption > 0) {
    return Math.ceil(avgDailyConsumption * 14 * 2)
  }
  return null
}

export function sortAlerts(alerts: ReorderAlert[]): ReorderAlert[] {
  return [...alerts].sort((a, b) => {
    const aSev = SEVERITY_ORDER.indexOf(a.alert_level)
    const bSev = SEVERITY_ORDER.indexOf(b.alert_level)
    if (aSev !== bSev) return aSev - bSev
    // Within same level, sort by days_remaining ascending (null last)
    const aDays = a.days_of_stock_remaining ?? Infinity
    const bDays = b.days_of_stock_remaining ?? Infinity
    return aDays - bDays
  })
}

const URGENCY_LABELS: Record<AlertLevel, string> = {
  out_of_stock: 'Stok Bitti',
  critical:     'Kritik',
  low:          'Düşük',
  adequate:     'Yeterli',
  no_threshold: 'Eşik Yok',
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ReorderAlertService {

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<ReorderAlertReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(new Date(today + 'T00:00:00').getTime() - 30 * 86_400_000)
      .toISOString()
      .slice(0, 10)

    // Parallel: products, stock lots, reorder thresholds, 30-day consumption
    const [productsRes, stockRes, thresholdsRes, consumptionRes] = await Promise.allSettled([
      supabase
        .from('products')
        .select('id, name, sku')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('name'),

      supabase
        .from('stock_lots')
        .select('product_id, qty_remaining')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      supabase
        .from('product_reorder_thresholds')
        .select('product_id, reorder_point_qty, reorder_qty, lead_time_days')
        .eq('company_id', companyId),

      supabase
        .from('sale_items')
        .select('product_id, qty, sales!inner(company_id, sale_date, deleted_at)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', thirtyDaysAgo)
        .lte('sales.sale_date', today),
    ])

    // Extract data safely
    const rawProducts = (productsRes.status === 'fulfilled' ? (productsRes.value.data ?? []) : []) as Array<{
      id: string; name: string; sku: string | null
    }>

    const rawStock = (stockRes.status === 'fulfilled' ? (stockRes.value.data ?? []) : []) as Array<{
      product_id: string; qty_remaining: number
    }>

    const rawThresholds = (thresholdsRes.status === 'fulfilled' ? (thresholdsRes.value.data ?? []) : []) as Array<{
      product_id: string; reorder_point_qty: number; reorder_qty: number; lead_time_days: number
    }>

    const rawConsumption = (consumptionRes.status === 'fulfilled' ? (consumptionRes.value.data ?? []) : []) as Array<{
      product_id: string; qty: number
    }>

    // ── Build lookup maps ────────────────────────────────────────────────────

    // Stock: sum qty_remaining per product
    const stockByProduct = new Map<string, number>()
    for (const lot of rawStock) {
      const prev = stockByProduct.get(lot.product_id) ?? 0
      stockByProduct.set(lot.product_id, prev + (lot.qty_remaining ?? 0))
    }

    // Thresholds
    const thresholdByProduct = new Map(rawThresholds.map(t => [t.product_id, t]))

    // Consumption: sum qty_sold per product
    const consumptionByProduct = new Map<string, number>()
    for (const item of rawConsumption) {
      const prev = consumptionByProduct.get(item.product_id) ?? 0
      consumptionByProduct.set(item.product_id, prev + (item.qty ?? 0))
    }

    // ── Build alerts ─────────────────────────────────────────────────────────

    const alerts: ReorderAlert[] = rawProducts.map(product => {
      const currentQty    = stockByProduct.get(product.id) ?? 0
      const threshold     = thresholdByProduct.get(product.id)
      const reorderPoint  = threshold ? threshold.reorder_point_qty : null
      const reorderQty    = threshold ? threshold.reorder_qty : null
      const leadTimeDays  = threshold ? threshold.lead_time_days : null
      const totalSold30   = consumptionByProduct.get(product.id) ?? 0
      const avgDaily      = totalSold30 > 0 ? totalSold30 / 30 : null

      void leadTimeDays // available in StockLevel but not ReorderAlert — kept for future use

      const alertLevel         = assignAlertLevel(currentQty, reorderPoint)
      const daysRemaining      = computeDaysRemaining(currentQty, avgDaily)
      const suggestedOrderQty  = computeSuggestedOrderQty(reorderQty, avgDaily)
      const urgencyLabel       = URGENCY_LABELS[alertLevel]
      const actionRequired     = alertLevel === 'out_of_stock' || alertLevel === 'critical' || alertLevel === 'low'

      return {
        product_id:               product.id,
        product_name:             product.name,
        product_sku:              product.sku,
        current_qty:              currentQty,
        reorder_point_qty:        reorderPoint,
        reorder_qty:              reorderQty,
        alert_level:              alertLevel,
        days_of_stock_remaining:  daysRemaining,
        avg_daily_consumption:    avgDaily,
        suggested_order_qty:      suggestedOrderQty,
        urgency_label:            urgencyLabel,
        action_required:          actionRequired,
      }
    })

    const sorted = sortAlerts(alerts)

    return {
      alerts:                     sorted,
      out_of_stock_count:         sorted.filter(a => a.alert_level === 'out_of_stock').length,
      critical_count:             sorted.filter(a => a.alert_level === 'critical').length,
      low_count:                  sorted.filter(a => a.alert_level === 'low').length,
      total_products_tracked:     sorted.length,
      products_without_threshold: sorted.filter(a => a.alert_level === 'no_threshold').length,
      as_of_date:                 today,
    }
  }
}
