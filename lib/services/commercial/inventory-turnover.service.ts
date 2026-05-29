// ── InventoryTurnoverService — Inventory Turnover & Slow-Moving Stock Analytics ─
// Computes inventory turnover ratio, DIO, slow-moving stock classification, and
// dead-stock valuation for Turkish SMEs. All pure helpers are exported for testing.
//
// Schema references:
//   stock_lots:             id, company_id, product_id, qty_remaining, cost_price_try,
//                           received_at, deleted_at
//   sale_item_allocations:  id, company_id, sale_item_id, lot_id, qty_allocated,
//                           cost_price, cost_currency, created_at
//   sale_items:             id, sale_id, company_id, product_id, qty
//   sales:                  id, company_id, sale_date, total_try, revenue_try
//   products:               id, company_id, name

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InventoryTurnoverReport {
  turnover_ratio: number | null
  dio_days: number | null
  turnover_health: ReturnType<typeof classifyTurnoverHealth>
  weighted_avg_age_days: number | null
  total_stock_value_try: number
  dead_stock_value_try: number
  carrying_cost_estimate_try: number
  inventory_to_revenue_ratio: number | null
  inventory_to_revenue_health: ReturnType<typeof classifyInventoryToRevenueRatio>
  inventory_concentration_pct: number | null
  slow_moving_items: Array<{
    product_id: string
    product_name: string
    qty_in_stock: number
    stock_value_try: number
    days_since_movement: number | null
    severity: ReturnType<typeof classifySlowMovingSeverity>
    coverage_days: number | null
    reorder_urgency: number
  }>
  narrative: string
  period_months: number
}

// ── Raw DB row types ──────────────────────────────────────────────────────────

interface StockLotRow {
  id: string
  product_id: string
  qty_remaining: number
  cost_price_try: number | null
  received_at: string | null
}

interface AllocationRow {
  sale_item_id: string
  qty_allocated: number
  cost_price: number
  created_at: string
  sale_items: {
    product_id: string | null
    qty: number
  } | null
}

interface ProductRow {
  id: string
  name: string
}

// ── Pure computation helpers ──────────────────────────────────────────────────

/**
 * Inventory turnover ratio = COGS / average inventory value.
 * Returns null if avgInventoryValue <= 0.
 */
export function computeInventoryTurnover(
  cogsValue: number,
  avgInventoryValue: number,
): number | null {
  if (avgInventoryValue <= 0) return null
  return cogsValue / avgInventoryValue
}

/**
 * Days Inventory Outstanding = 365 / turnover ratio.
 * Returns null if null input or turnover <= 0.
 */
export function computeDio(turnoverRatio: number | null): number | null {
  if (turnoverRatio === null || turnoverRatio <= 0) return null
  return 365 / turnoverRatio
}

/**
 * Classify inventory turnover health.
 * excellent:        >= 12x  (monthly retail-style)
 * good:             >= 6x
 * moderate:         >= 3x
 * slow:             >= 1x
 * very_slow:        < 1x
 * insufficient_data: null
 */
export function classifyTurnoverHealth(
  ratio: number | null,
): 'excellent' | 'good' | 'moderate' | 'slow' | 'very_slow' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio >= 12) return 'excellent'
  if (ratio >= 6)  return 'good'
  if (ratio >= 3)  return 'moderate'
  if (ratio >= 1)  return 'slow'
  return 'very_slow'
}

/**
 * Compute weighted average inventory age in days.
 * Weight = qty_remaining × entry_cost_try per lot.
 * Reference date is today.
 * Returns null if no lots or total weight = 0.
 */
export function computeWeightedAvgInventoryAge(
  lots: Array<{ qty_remaining: number; entry_date: string; entry_cost_try: number }>,
): number | null {
  if (lots.length === 0) return null

  const today = Date.now()
  let weightedSum = 0
  let totalWeight = 0

  for (const lot of lots) {
    const weight = lot.qty_remaining * lot.entry_cost_try
    if (weight <= 0) continue
    const entryMs  = new Date(lot.entry_date).getTime()
    const ageDays  = (today - entryMs) / (1000 * 60 * 60 * 24)
    weightedSum   += ageDays * weight
    totalWeight   += weight
  }

  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

/**
 * Identify slow-moving items — those with no allocation activity in the last
 * slowDaysThreshold days (default 90).
 */
export function identifySlowMovingItems<T extends {
  product_id: string
  product_name: string
  qty_in_stock: number
  stock_value_try: number
  last_movement_date: string | null
}>(
  items: T[],
  slowDaysThreshold = 90,
): T[] {
  const today = Date.now()
  return items.filter(item => {
    if (item.last_movement_date === null) return true
    const lastMs   = new Date(item.last_movement_date).getTime()
    const daysDiff = (today - lastMs) / (1000 * 60 * 60 * 24)
    return daysDiff >= slowDaysThreshold
  })
}

/**
 * Classify slow-moving severity based on days since last movement.
 * active:    < 30 days
 * watch:     < 60 days
 * slow:      < 90 days
 * very_slow: < 180 days
 * dead_stock: >= 180 days (or null)
 */
export function classifySlowMovingSeverity(
  daysSinceMovement: number | null,
): 'active' | 'watch' | 'slow' | 'very_slow' | 'dead_stock' {
  if (daysSinceMovement === null) return 'dead_stock'
  if (daysSinceMovement < 30)  return 'active'
  if (daysSinceMovement < 60)  return 'watch'
  if (daysSinceMovement < 90)  return 'slow'
  if (daysSinceMovement < 180) return 'very_slow'
  return 'dead_stock'
}

/**
 * Compute total dead stock value — items with >= 180 days no movement.
 */
export function computeDeadStockValue(
  items: Array<{ qty_in_stock: number; stock_value_try: number; last_movement_date: string | null }>,
): number {
  const today = Date.now()
  return items.reduce((sum, item) => {
    if (item.last_movement_date === null) return sum + item.stock_value_try
    const daysDiff = (today - new Date(item.last_movement_date).getTime()) / (1000 * 60 * 60 * 24)
    return daysDiff >= 180 ? sum + item.stock_value_try : sum
  }, 0)
}

/**
 * Compute annual carrying cost estimate.
 * Default annualCarryingRatePct = 25 (Turkish SME: interest + storage + insurance).
 */
export function computeCarryingCostEstimate(
  inventoryValue: number,
  annualCarryingRatePct = 25,
): number {
  return inventoryValue * (annualCarryingRatePct / 100)
}

/**
 * Compute inventory-to-revenue ratio (months of revenue tied up in stock).
 * Returns null if monthlyRevenue <= 0.
 */
export function computeInventoryToRevenueRatio(
  inventoryValue: number,
  monthlyRevenue: number,
): number | null {
  if (monthlyRevenue <= 0) return null
  return inventoryValue / monthlyRevenue
}

/**
 * Classify inventory-to-revenue ratio.
 * lean:              < 0.5 months
 * normal:            < 1.5 months
 * heavy:             < 3.0 months
 * overstocked:       >= 3.0 months
 * insufficient_data: null
 */
export function classifyInventoryToRevenueRatio(
  ratio: number | null,
): 'lean' | 'normal' | 'heavy' | 'overstocked' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio < 0.5) return 'lean'
  if (ratio < 1.5) return 'normal'
  if (ratio < 3.0) return 'heavy'
  return 'overstocked'
}

/**
 * Compute stock coverage days = qty_remaining / avg_daily_sales.
 * Returns null if avgDailySales <= 0. Result capped at 365.
 */
export function computeStockCoverageDays(
  qtyRemaining: number,
  avgDailySales: number,
): number | null {
  if (avgDailySales <= 0) return null
  return Math.min(365, qtyRemaining / avgDailySales)
}

/**
 * Compute reorder urgency score 0-100 based on coverage days.
 * null or 0 → 100
 * <= 7 days → 90
 * <= 14     → 70
 * <= 30     → 50
 * <= 60     → 30
 * <= 90     → 15
 * > 90      → 5
 */
export function computeReorderUrgency(coverageDays: number | null): number {
  if (coverageDays === null || coverageDays === 0) return 100
  if (coverageDays <= 7)  return 90
  if (coverageDays <= 14) return 70
  if (coverageDays <= 30) return 50
  if (coverageDays <= 60) return 30
  if (coverageDays <= 90) return 15
  return 5
}

/**
 * Generate Turkish narrative for inventory health.
 */
export function generateInventoryNarrative(params: {
  turnoverRatio: number | null
  diodays: number | null
  deadStockValue: number
  slowMovingCount: number
  totalStockValue: number
}): string {
  const { turnoverRatio, diodays, deadStockValue, slowMovingCount, totalStockValue } = params

  const turnoverPart =
    turnoverRatio !== null
      ? `Stok devir hızı ${turnoverRatio.toFixed(1)}x`
      : 'Stok devir hızı hesaplanamadı'

  const dioPart =
    diodays !== null
      ? `, ortalama ${Math.round(diodays)} günde döngü tamamlanıyor.`
      : '.'

  const slowPart =
    slowMovingCount > 0
      ? ` ${slowMovingCount} ürün hareketsiz (₺${deadStockValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ölü stok).`
      : ' Hareketsiz stok tespit edilmedi.'

  const totalPart = ` Toplam stok değeri: ₺${totalStockValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}.`

  return `${turnoverPart}${dioPart}${slowPart}${totalPart}`
}

/**
 * Compute inventory concentration — percentage of total value in top N products.
 * Returns null if total = 0.
 */
export function computeInventoryConcentration(
  items: Array<{ stock_value_try: number }>,
  topN = 5,
): number | null {
  if (items.length === 0) return null
  const total = items.reduce((sum, i) => sum + i.stock_value_try, 0)
  if (total === 0) return null

  const sorted  = [...items].sort((a, b) => b.stock_value_try - a.stock_value_try)
  const topSum  = sorted.slice(0, topN).reduce((sum, i) => sum + i.stock_value_try, 0)
  return (topSum / total) * 100
}

// ── Service ───────────────────────────────────────────────────────────────────

export class InventoryTurnoverService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string, periodMonths = 6): Promise<InventoryTurnoverReport> {
    const now      = new Date()
    const fromDate = new Date(now)
    fromDate.setMonth(fromDate.getMonth() - periodMonths)
    const fromDateStr = fromDate.toISOString().slice(0, 10)

    // ── Fetch all data in parallel ────────────────────────────────────────────
    const [lotsRes, allocsRes, productsRes, revenueRes] = await Promise.allSettled([
      // 1. Current stock lots (qty_remaining > 0, not deleted)
      this.supabase
        .from('stock_lots')
        .select('id, product_id, qty_remaining, cost_price_try, received_at')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null),

      // 2. Recent sale_item_allocations joined to sale_items for product_id
      this.supabase
        .from('sale_item_allocations')
        .select(`
          sale_item_id,
          qty_allocated,
          cost_price,
          created_at,
          sale_items!inner(product_id, qty)
        `)
        .eq('company_id', companyId)
        .gte('created_at', fromDate.toISOString()),

      // 3. Products for name lookup
      this.supabase
        .from('products')
        .select('id, name')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // 4. Revenue in period from sales
      this.supabase
        .from('sales')
        .select('revenue_try, sale_date')
        .eq('company_id', companyId)
        .gte('sale_date', fromDateStr)
        .not('revenue_try', 'is', null),
    ])

    // ── Extract data safely ───────────────────────────────────────────────────
    const lots: StockLotRow[] =
      lotsRes.status === 'fulfilled' && !lotsRes.value.error
        ? ((lotsRes.value.data ?? []) as StockLotRow[])
        : []

    const allocs: AllocationRow[] =
      allocsRes.status === 'fulfilled' && !allocsRes.value.error
        ? ((allocsRes.value.data ?? []) as unknown as AllocationRow[])
        : []

    const products: ProductRow[] =
      productsRes.status === 'fulfilled' && !productsRes.value.error
        ? ((productsRes.value.data ?? []) as ProductRow[])
        : []

    const revenueRows: Array<{ revenue_try: number }> =
      revenueRes.status === 'fulfilled' && !revenueRes.value.error
        ? ((revenueRes.value.data ?? []) as Array<{ revenue_try: number }>)
        : []

    // ── Build product name map ────────────────────────────────────────────────
    const productNameMap = new Map<string, string>()
    for (const p of products) {
      productNameMap.set(p.id, p.name)
    }

    // ── Aggregate per-product data ────────────────────────────────────────────
    // Current stock: qty and value per product
    const stockMap = new Map<string, { qty: number; value: number; lots: Array<{ qty_remaining: number; entry_date: string; entry_cost_try: number }> }>()
    for (const lot of lots) {
      const costPerUnit = Number(lot.cost_price_try ?? 0)
      const qty         = Number(lot.qty_remaining)
      const value       = qty * costPerUnit
      const entryDate   = lot.received_at ?? lot.id // fallback to id string if no date (bad data)

      const existing = stockMap.get(lot.product_id)
      if (existing) {
        existing.qty   += qty
        existing.value += value
        existing.lots.push({ qty_remaining: qty, entry_date: entryDate, entry_cost_try: costPerUnit })
      } else {
        stockMap.set(lot.product_id, {
          qty:   qty,
          value: value,
          lots:  [{ qty_remaining: qty, entry_date: entryDate, entry_cost_try: costPerUnit }],
        })
      }
    }

    // Last movement date and COGS per product from allocations
    const lastMovementMap = new Map<string, string>() // product_id → ISO date string
    const unitsSoldMap    = new Map<string, number>()  // product_id → total units sold in period
    let   totalCogs       = 0

    for (const alloc of allocs) {
      const saleItem  = alloc.sale_items
      if (!saleItem?.product_id) continue

      const productId   = saleItem.product_id
      const costAmount  = Number(alloc.cost_price ?? 0) * Number(alloc.qty_allocated ?? 0)
      totalCogs        += costAmount

      // Track last movement
      const prevLast = lastMovementMap.get(productId)
      if (!prevLast || alloc.created_at > prevLast) {
        lastMovementMap.set(productId, alloc.created_at)
      }

      // Track units sold
      const prevSold = unitsSoldMap.get(productId) ?? 0
      unitsSoldMap.set(productId, prevSold + Number(alloc.qty_allocated ?? 0))
    }

    // ── Compute totals ────────────────────────────────────────────────────────
    const totalStockValue = Array.from(stockMap.values()).reduce((s, v) => s + v.value, 0)
    const totalRevenue    = revenueRows.reduce((s, r) => s + Number(r.revenue_try ?? 0), 0)
    const monthlyRevenue  = periodMonths > 0 ? totalRevenue / periodMonths : 0

    // avgInventoryValue: approximate as current value (opening unknown without historical data)
    const avgInventoryValue = totalStockValue
    const turnoverRatio     = computeInventoryTurnover(totalCogs, avgInventoryValue)
    const dioDays           = computeDio(turnoverRatio)
    const turnoverHealth    = classifyTurnoverHealth(turnoverRatio)

    // Weighted average age across all lots
    const allLots: Array<{ qty_remaining: number; entry_date: string; entry_cost_try: number }> = []
    for (const stockInfo of stockMap.values()) {
      allLots.push(...stockInfo.lots)
    }
    const weightedAvgAgeDays = computeWeightedAvgInventoryAge(allLots)

    // ── Build per-product item list ───────────────────────────────────────────
    const today           = Date.now()
    const periodDays      = periodMonths * 30
    const avgDailyDivisor = periodDays > 0 ? periodDays : 1

    const allProductItems = Array.from(stockMap.entries()).map(([productId, stock]) => {
      const lastMovStr        = lastMovementMap.get(productId) ?? null
      const daysSinceMovement = lastMovStr
        ? (today - new Date(lastMovStr).getTime()) / (1000 * 60 * 60 * 24)
        : null
      const unitsSold         = unitsSoldMap.get(productId) ?? 0
      const avgDailySales     = unitsSold / avgDailyDivisor
      const coverageDays      = computeStockCoverageDays(stock.qty, avgDailySales)
      const reorderUrgency    = computeReorderUrgency(coverageDays)
      const severity          = classifySlowMovingSeverity(daysSinceMovement)

      return {
        product_id:          productId,
        product_name:        productNameMap.get(productId) ?? 'Bilinmeyen Ürün',
        qty_in_stock:        stock.qty,
        stock_value_try:     stock.value,
        last_movement_date:  lastMovStr,
        days_since_movement: daysSinceMovement,
        severity,
        coverage_days:       coverageDays,
        reorder_urgency:     reorderUrgency,
      }
    })

    // Slow-moving items (>= 90 days without movement)
    const slowMovingRaw = identifySlowMovingItems(allProductItems, 90)

    // Dead stock value
    const deadStockValue = computeDeadStockValue(allProductItems.map(i => ({
      qty_in_stock:         i.qty_in_stock,
      stock_value_try:      i.stock_value_try,
      last_movement_date:   i.last_movement_date,
    })))

    const carryingCostEstimate   = computeCarryingCostEstimate(totalStockValue)
    const inventoryToRevenueRatio = computeInventoryToRevenueRatio(totalStockValue, monthlyRevenue)
    const inventoryToRevenueHealth = classifyInventoryToRevenueRatio(inventoryToRevenueRatio)
    const concentrationPct        = computeInventoryConcentration(
      allProductItems.map(i => ({ stock_value_try: i.stock_value_try })),
    )

    const narrative = generateInventoryNarrative({
      turnoverRatio,
      diodays:          dioDays,
      deadStockValue,
      slowMovingCount:  slowMovingRaw.length,
      totalStockValue,
    })

    // Strip internal last_movement_date field from slow_moving_items output
    const slowMovingItems = slowMovingRaw.map(({ last_movement_date: _lmd, ...rest }) => rest)

    return {
      turnover_ratio:              turnoverRatio,
      dio_days:                    dioDays,
      turnover_health:             turnoverHealth,
      weighted_avg_age_days:       weightedAvgAgeDays,
      total_stock_value_try:       totalStockValue,
      dead_stock_value_try:        deadStockValue,
      carrying_cost_estimate_try:  carryingCostEstimate,
      inventory_to_revenue_ratio:  inventoryToRevenueRatio,
      inventory_to_revenue_health: inventoryToRevenueHealth,
      inventory_concentration_pct: concentrationPct,
      slow_moving_items:           slowMovingItems,
      narrative,
      period_months:               periodMonths,
    }
  }
}
