// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/inventory-turnover.service.ts
//
// Inventory Turnover & Shrinkage Analysis Service
//
// Covers:
//   • Inventory turnover ratio and Days Inventory Outstanding (DIO)
//   • Shrinkage rate detection (physical count vs. book stock)
//   • Dead stock identification (items without sale for N days)
//   • Reorder point alerts (critical / reorder_now / watch / healthy)
//   • Inventory value accuracy (book vs. market)
//
// Turkish SME benchmark: 6× annual turnover for retail/wholesale
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Default benchmark ─────────────────────────────────────────────────────────

const DEFAULT_INDUSTRY_BENCHMARK = 6.0
const DEFAULT_DEAD_STOCK_DAYS    = 90

// ─────────────────────────────────────────────────────────────────────────────
// Pure exported functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute inventory turnover ratio: COGS / average inventory value.
 * Returns null when avgInventoryValue === 0 (avoids division by zero).
 */
export function computeInventoryTurnover(
  cogs: number,
  avgInventoryValue: number,
): number | null {
  if (avgInventoryValue === 0) return null
  return cogs / avgInventoryValue
}

/**
 * Compute Days Inventory Outstanding (DIO): 365 / turnoverRatio.
 * Returns null when turnoverRatio is null or 0.
 */
export function computeDaysInventoryOutstanding(
  turnoverRatio: number | null,
): number | null {
  if (turnoverRatio === null || turnoverRatio === 0) return null
  return 365 / turnoverRatio
}

/**
 * Classify turnover health relative to an industry benchmark.
 *   null               → 'insufficient_data'
 *   >= 2 × benchmark   → 'excellent'   (>= 12 for default)
 *   >= benchmark       → 'good'        (>= 6)
 *   >= benchmark × 0.5 → 'adequate'    (>= 3)
 *   >= benchmark × 0.25→ 'slow'        (>= 1.5)
 *   < benchmark × 0.25 → 'stagnant'
 */
export function classifyTurnoverHealth(
  turnoverRatio: number | null,
  industryBenchmark = DEFAULT_INDUSTRY_BENCHMARK,
): 'excellent' | 'good' | 'adequate' | 'slow' | 'stagnant' | 'insufficient_data' {
  if (turnoverRatio === null) return 'insufficient_data'
  if (turnoverRatio >= industryBenchmark * 2)    return 'excellent'
  if (turnoverRatio >= industryBenchmark)        return 'good'
  if (turnoverRatio >= industryBenchmark * 0.5)  return 'adequate'
  if (turnoverRatio >= industryBenchmark * 0.25) return 'slow'
  return 'stagnant'
}

/**
 * Compute shrinkage rate as a percentage.
 *   Expected closing stock = openingStock + purchasesUnits - salesUnits
 *   Shrinkage units        = expected - closingStock
 *   Shrinkage rate         = (shrinkageUnits / expected) × 100
 *
 * Returns null when expected === 0 (no meaningful base).
 * Negative values are valid (over-count / surplus).
 */
export function computeShrinkageRate(
  openingStock: number,
  purchasesUnits: number,
  salesUnits: number,
  closingStock: number,
): number | null {
  const expected = openingStock + purchasesUnits - salesUnits
  if (expected === 0) return null
  const shrinkageUnits = expected - closingStock
  return (shrinkageUnits / expected) * 100
}

/**
 * Classify shrinkage level.
 *   null        → 'insufficient_data'
 *   <= 0        → 'none'          (no shrinkage or over-count)
 *   0 – 1%      → 'acceptable'
 *   1% – 3%     → 'elevated'
 *   > 3%        → 'critical'
 */
export function classifyShrinkageLevel(
  shrinkagePct: number | null,
): 'none' | 'acceptable' | 'elevated' | 'critical' | 'insufficient_data' {
  if (shrinkagePct === null) return 'insufficient_data'
  if (shrinkagePct <= 0)  return 'none'
  if (shrinkagePct <= 1)  return 'acceptable'
  if (shrinkagePct <= 3)  return 'elevated'
  return 'critical'
}

/**
 * Compute dead stock value across an inventory item list.
 *
 * An item is "dead" when:
 *   • last_sale_date is null (never sold), OR
 *   • days since last_sale_date >= deadStockDays (default 90)
 */
export function computeDeadStockValue(
  items: Array<{
    product_id: string
    last_sale_date: string | null
    stock_value: number
    qty_on_hand: number
  }>,
  deadStockDays = DEFAULT_DEAD_STOCK_DAYS,
): {
  dead_stock_count: number
  dead_stock_value: number
  dead_stock_pct_of_total: number
  items: Array<{
    product_id: string
    stock_value: number
    days_since_sale: number | null
    is_dead: boolean
  }>
} {
  const today = new Date().toISOString().slice(0, 10)

  const resultItems = items.map(item => {
    let daysSinceSale: number | null = null

    if (item.last_sale_date !== null) {
      const saleMs  = new Date(item.last_sale_date + 'T00:00:00').getTime()
      const todayMs = new Date(today + 'T00:00:00').getTime()
      daysSinceSale = Math.max(0, Math.round((todayMs - saleMs) / 86_400_000))
    }

    const isDead =
      item.last_sale_date === null ||
      (daysSinceSale !== null && daysSinceSale >= deadStockDays)

    return {
      product_id:      item.product_id,
      stock_value:     item.stock_value,
      days_since_sale: daysSinceSale,
      is_dead:         isDead,
    }
  })

  const totalValue    = items.reduce((s, i) => s + i.stock_value, 0)
  const deadItems     = resultItems.filter(i => i.is_dead)
  const deadValue     = deadItems.reduce((s, i) => s + i.stock_value, 0)
  const deadPct       = totalValue === 0 ? 0 : (deadValue / totalValue) * 100

  return {
    dead_stock_count:      deadItems.length,
    dead_stock_value:      deadValue,
    dead_stock_pct_of_total: deadPct,
    items:                 resultItems,
  }
}

/**
 * Classify reorder urgency for a single product.
 *   critical:    currentQty < safetyStock
 *   reorder_now: currentQty <= reorderPoint
 *   watch:       currentQty <= reorderPoint × 1.5
 *   healthy:     else
 */
export function computeReorderAlert(
  currentQty: number,
  reorderPoint: number,
  safetyStock: number,
): 'critical' | 'reorder_now' | 'watch' | 'healthy' {
  if (currentQty < safetyStock)              return 'critical'
  if (currentQty <= reorderPoint)            return 'reorder_now'
  if (currentQty <= reorderPoint * 1.5)      return 'watch'
  return 'healthy'
}

/**
 * Compute inventory value accuracy: (bookValue / marketValue) × 100.
 * Returns null when marketValue === 0.
 * Values > 100 mean book value exceeds market (potential write-down risk).
 */
export function computeInventoryValueAccuracy(
  bookValue: number,
  marketValue: number,
): number | null {
  if (marketValue === 0) return null
  return (bookValue / marketValue) * 100
}

// ─────────────────────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────────────────────

export class InventoryTurnoverService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    turnover: {
      ratio: number | null
      dio_days: number | null
      health: ReturnType<typeof classifyTurnoverHealth>
      cogs_ytd: number
      avg_inventory_value: number
    }
    shrinkage: {
      rate_pct: number | null
      level: ReturnType<typeof classifyShrinkageLevel>
      shrinkage_units: number
      shrinkage_value: number
    }
    dead_stock: ReturnType<typeof computeDeadStockValue>
    reorder_alerts: Array<{
      product_id: string
      product_name: string
      current_qty: number
      reorder_point: number
      safety_stock: number
      alert: ReturnType<typeof computeReorderAlert>
    }>
    summary: {
      total_sku_count: number
      total_inventory_value: number
      dead_stock_value: number
      reorder_now_count: number
      critical_count: number
    }
  }> {
    const today     = new Date().toISOString().slice(0, 10)
    const yearStart = today.slice(0, 4) + '-01-01'

    // ── Parallel DB fetches ───────────────────────────────────────────────────

    const [lotsRes, productsRes, saleItemsRes, salesRes] = await Promise.all([
      // Active stock lots — inventory value base
      this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining, cost_price, cost_fx_rate, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Products catalog — stock_alert_qty IS the reorder threshold. (The table has
      // no `reorder_point`/`safety_stock_qty` columns; the old select referenced
      // those non-existent columns → query error → empty reorder data. Use the real
      // `stock_alert_qty`; safety stock has no column and defaults to 0.)
      this.supabase
        .from('products')
        .select('id, name, stock_qty, stock_alert_qty')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // YTD sale items for COGS approximation + last sale date per product
      this.supabase
        .from('sale_items')
        .select('product_id, qty, line_total, sales!inner(sale_date, company_id, deleted_at)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .gte('sales.sale_date', yearStart)
        .lte('sales.sale_date', today),

      // All-time sales for last_sale_date tracking (last 365 days is enough for dead stock)
      this.supabase
        .from('sale_items')
        .select('product_id, qty, sales!inner(sale_date, company_id, deleted_at)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .order('sales.sale_date', { ascending: false }),
    ])

    // ── Build lot maps ────────────────────────────────────────────────────────

    interface LotRow {
      product_id: string
      qty_remaining: number | null
      cost_price: number | null
      cost_fx_rate: number | null
      cost_price_try: number | null
    }

    // product_id → { totalQty, totalValue }
    const lotMap = new Map<string, { totalQty: number; totalValue: number }>()

    for (const lot of (lotsRes.data ?? []) as LotRow[]) {
      const unitCost =
        lot.cost_price_try != null && lot.cost_price_try > 0
          ? lot.cost_price_try
          : Number(lot.cost_price ?? 0) * (Number(lot.cost_fx_rate ?? 1) || 1)
      const qty  = Number(lot.qty_remaining ?? 0)
      const prev = lotMap.get(lot.product_id) ?? { totalQty: 0, totalValue: 0 }
      lotMap.set(lot.product_id, {
        totalQty:   prev.totalQty   + qty,
        totalValue: prev.totalValue + qty * unitCost,
      })
    }

    const totalInventoryValue = Array.from(lotMap.values()).reduce((s, v) => s + v.totalValue, 0)

    // ── YTD COGS from sale_items (qty × avg lot cost approximation) ───────────

    interface SaleItemRow {
      product_id: string | null
      qty: number | null
      line_total: number | null
      sales: unknown
    }

    // We approximate COGS as sum of line_total (sell-side) since we don't have a
    // direct cost-of-goods-sold field. Proper COGS would require FIFO allocation,
    // but for turnover ratio this approximation is industry-standard for SMEs.
    let cogsYtd = 0
    const ytdSalesQtyMap = new Map<string, number>()

    for (const item of (saleItemsRes.data ?? []) as SaleItemRow[]) {
      if (!item.product_id) continue
      cogsYtd += Number(item.line_total ?? 0)
      const prev = ytdSalesQtyMap.get(item.product_id) ?? 0
      ytdSalesQtyMap.set(item.product_id, prev + Number(item.qty ?? 0))
    }

    // ── Last sale date per product (all-time lookback) ────────────────────────

    interface SaleItemAllRow {
      product_id: string | null
      qty: number | null
      sales: { sale_date: string } | Array<{ sale_date: string }>
    }

    const lastSaleDateMap = new Map<string, string>()

    for (const item of (salesRes.data ?? []) as SaleItemAllRow[]) {
      if (!item.product_id) continue
      const salesRaw = Array.isArray(item.sales) ? item.sales[0] : item.sales
      const saleDate = (salesRaw as { sale_date?: string } | undefined)?.sale_date
      if (!saleDate) continue
      const existing = lastSaleDateMap.get(item.product_id)
      if (!existing || saleDate > existing) {
        lastSaleDateMap.set(item.product_id, saleDate)
      }
    }

    // ── Products ──────────────────────────────────────────────────────────────

    interface ProductRow {
      id: string
      name: string
      stock_qty: number | null
      stock_alert_qty: number | null
    }

    const products = (productsRes.data ?? []) as ProductRow[]

    // ── Turnover ──────────────────────────────────────────────────────────────

    // avg_inventory_value: use current value as a proxy (single-point snapshot)
    const avgInventoryValue = totalInventoryValue
    const turnoverRatio     = computeInventoryTurnover(cogsYtd, avgInventoryValue)
    const dioDays           = computeDaysInventoryOutstanding(turnoverRatio)
    const turnoverHealth    = classifyTurnoverHealth(turnoverRatio)

    // ── Shrinkage ─────────────────────────────────────────────────────────────

    // Opening stock: not directly available; use total lot qty as proxy for physical closing
    // Shrinkage formula requires opening, purchases, sales, physical closing.
    // We use stock_qty (products table) as physical count vs. lot sum as book.
    let totalPhysicalQty = 0
    let totalBookQty     = 0
    let avgUnitCost      = 0

    for (const prod of products) {
      const lot          = lotMap.get(prod.id)
      const bookQty      = lot?.totalQty ?? 0
      const physicalQty  = Number(prod.stock_qty ?? 0)
      totalBookQty      += bookQty
      totalPhysicalQty  += physicalQty
      if (bookQty > 0 && lot) {
        avgUnitCost += lot.totalValue / bookQty
      }
    }

    const avgUnitCostOverall = products.length > 0 ? avgUnitCost / products.length : 0

    // Shrinkage: openingStock=0, purchasesUnits=bookQty, salesUnits=ytdQtySold, closing=physicalQty
    const ytdSalesUnits  = Array.from(ytdSalesQtyMap.values()).reduce((s, v) => s + v, 0)
    const shrinkageRate  = computeShrinkageRate(0, totalBookQty + ytdSalesUnits, ytdSalesUnits, totalPhysicalQty)
    const shrinkageLevel = classifyShrinkageLevel(shrinkageRate)

    const shrinkageUnitsAbs = shrinkageRate !== null
      ? Math.max(0, (totalBookQty + ytdSalesUnits) - totalPhysicalQty)
      : 0
    const shrinkageValue = shrinkageUnitsAbs * avgUnitCostOverall

    // ── Dead stock ────────────────────────────────────────────────────────────

    const deadStockItems = products.map(prod => {
      const lot = lotMap.get(prod.id)
      return {
        product_id:     prod.id,
        last_sale_date: lastSaleDateMap.get(prod.id) ?? null,
        stock_value:    lot?.totalValue ?? 0,
        qty_on_hand:    lot?.totalQty ?? 0,
      }
    })

    const deadStockResult = computeDeadStockValue(deadStockItems)

    // ── Reorder alerts ────────────────────────────────────────────────────────

    const reorderAlerts: Array<{
      product_id: string
      product_name: string
      current_qty: number
      reorder_point: number
      safety_stock: number
      alert: ReturnType<typeof computeReorderAlert>
    }> = []

    for (const prod of products) {
      const lot          = lotMap.get(prod.id)
      const currentQty   = lot?.totalQty ?? Number(prod.stock_qty ?? 0)
      const reorderPoint = Number(prod.stock_alert_qty ?? 0)
      const safetyStock  = 0 // no safety_stock column on products; not tracked

      const alert = computeReorderAlert(currentQty, reorderPoint, safetyStock)

      reorderAlerts.push({
        product_id:   prod.id,
        product_name: prod.name,
        current_qty:  currentQty,
        reorder_point: reorderPoint,
        safety_stock: safetyStock,
        alert,
      })
    }

    // Sort: critical first, then reorder_now, watch, healthy
    const alertOrder: Record<ReturnType<typeof computeReorderAlert>, number> = {
      critical:    0,
      reorder_now: 1,
      watch:       2,
      healthy:     3,
    }
    reorderAlerts.sort((a, b) => alertOrder[a.alert] - alertOrder[b.alert])

    // ── Summary ───────────────────────────────────────────────────────────────

    const reorderNowCount = reorderAlerts.filter(a => a.alert === 'reorder_now').length
    const criticalCount   = reorderAlerts.filter(a => a.alert === 'critical').length

    return {
      turnover: {
        ratio:               turnoverRatio,
        dio_days:            dioDays,
        health:              turnoverHealth,
        cogs_ytd:            cogsYtd,
        avg_inventory_value: avgInventoryValue,
      },
      shrinkage: {
        rate_pct:        shrinkageRate,
        level:           shrinkageLevel,
        shrinkage_units: shrinkageUnitsAbs,
        shrinkage_value: shrinkageValue,
      },
      dead_stock: deadStockResult,
      reorder_alerts: reorderAlerts,
      summary: {
        total_sku_count:       products.length,
        total_inventory_value: totalInventoryValue,
        dead_stock_value:      deadStockResult.dead_stock_value,
        reorder_now_count:     reorderNowCount,
        critical_count:        criticalCount,
      },
    }
  }
}
