// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/inventory/purchase-analytics.service.ts
//
// Purchase Order Analytics — lead time, supplier reliability, purchase
// frequency, cost variance vs prior purchase, and optimal reorder timing.
//
// Pure helper exports allow deterministic unit testing without DB access.
//
// Schema note:
//   • purchases:      id, company_id, supplier_name, purchase_date, status,
//                     finalized_at, created_at (no received_at in purchases)
//   • purchase_items: id, purchase_id, product_id, quantity, unit_price
//   • products:       id, name, sku, company_id
//
// For lead time we use purchase_date (order start) and finalized_at (receipt
// proxy — finalized means goods have been accepted into the system).
// Status 'finalized' ≈ received. Status 'draft'/'ordered'(purchase_orders)
// maps to pending for purchases.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type LeadTimeClass = 'fast' | 'normal' | 'slow' | 'very_slow' | 'pending'

export type CostTrend = 'increasing' | 'stable' | 'decreasing' | 'insufficient_data'

export interface SupplierAnalytics {
  supplier_name: string
  total_orders: number
  total_amount_try: number
  avg_lead_time_days: number | null
  lead_time_class: LeadTimeClass
  on_time_delivery_pct: number | null  // pct of orders finalized within 30 days of purchase_date
  orders_this_month: number
  orders_last_month: number
  purchase_frequency_per_month: number
}

export interface ProductPurchaseAnalytics {
  product_id: string
  product_name: string
  sku: string | null
  total_purchases: number
  total_qty: number
  total_spent_try: number
  avg_unit_cost_try: number
  latest_unit_cost_try: number | null
  prior_unit_cost_try: number | null
  cost_variance_pct: number | null
  cost_trend: CostTrend
  last_purchase_date: string | null
  avg_lead_time_days: number | null
}

export interface PurchaseAnalyticsSummary {
  total_purchases: number
  total_spent_try: number
  avg_lead_time_days: number | null
  pending_receipts: number           // purchases with status 'draft' (not finalized)
  top_suppliers: SupplierAnalytics[] // top 5 by total_amount_try
  product_analytics: ProductPurchaseAnalytics[]  // all products with ≥1 purchase, sorted by total_spent desc
  monthly_spend: Array<{ month: string; amount_try: number; orders_count: number }> // last 6 months
  cost_variance_alerts: ProductPurchaseAnalytics[]  // products where |cost_variance_pct| > 15
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Days between order_date (purchase start) and received_at (receipt).
 * Returns null if received_at is null.
 */
export function computeLeadTimeDays(
  orderDate: string,
  receivedAt: string | null,
): number | null {
  if (!receivedAt) return null
  const start = new Date(orderDate.slice(0, 10) + 'T00:00:00')
  const end   = new Date(receivedAt.slice(0, 10) + 'T00:00:00')
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

/**
 * Cost variance percentage vs prior purchase of same product.
 * Returns null if priorCostTry is 0 or null (cannot divide).
 */
export function computeCostVariancePct(
  currentCostTry: number,
  priorCostTry: number | null,
): number | null {
  if (!priorCostTry || priorCostTry === 0) return null
  return ((currentCostTry - priorCostTry) / priorCostTry) * 100
}

/**
 * Classify lead time into a performance bucket.
 *   fast      : ≤ 7 days
 *   normal    : 8–21 days
 *   slow      : 22–45 days
 *   very_slow : > 45 days
 *   pending   : null (not yet received)
 */
export function classifyLeadTime(leadTimeDays: number | null): LeadTimeClass {
  if (leadTimeDays === null) return 'pending'
  if (leadTimeDays <= 7)    return 'fast'
  if (leadTimeDays <= 21)   return 'normal'
  if (leadTimeDays <= 45)   return 'slow'
  return 'very_slow'
}

/**
 * Compute purchase frequency in orders-per-month.
 * Formula: ordersCount × 30 / observationDays
 * Returns 0 when observationDays ≤ 0.
 */
export function computePurchaseFrequency(
  ordersCount: number,
  observationDays: number,
): number {
  if (observationDays <= 0) return 0
  return (ordersCount * 30) / observationDays
}

/**
 * Detect cost trend using the last 3 vs prior 3 purchases.
 * costs: chronological array (oldest first).
 *   increasing     : avg(last 3) > avg(prior 3) by > 5%
 *   decreasing     : avg(last 3) < avg(prior 3) by > 5%
 *   stable         : difference within ±5%
 *   insufficient_data : < 3 purchases (need at least 3 for "last 3")
 *
 * When there are exactly 3–5 purchases we compare the single last-3
 * window against earlier values (or compare within available data
 * if prior3 is shorter).
 */
export function detectCostTrend(costs: number[]): CostTrend {
  if (costs.length < 3) return 'insufficient_data'

  const last3  = costs.slice(-3)
  const prior3 = costs.slice(0, costs.length - 3)

  // If no prior data, compare within last3 (first vs last)
  if (prior3.length === 0) {
    // We have exactly 3 data points — not enough to split into two groups
    return 'insufficient_data'
  }

  const avgLast3  = last3.reduce((s, v) => s + v, 0) / last3.length
  const avgPrior3 = prior3.reduce((s, v) => s + v, 0) / prior3.length

  if (avgPrior3 === 0) return 'stable'

  const changePct = ((avgLast3 - avgPrior3) / avgPrior3) * 100

  if (changePct > 5)  return 'increasing'
  if (changePct < -5) return 'decreasing'
  return 'stable'
}

// ── Additional pure helpers ────────────────────────────────────────────────────

/**
 * Compute purchase order fulfillment rate as a percentage.
 * Returns 0 if orderedItems is 0.
 */
export function computeFulfillmentRate(
  receivedItems: number,
  orderedItems: number,
): number {
  if (orderedItems === 0) return 0
  return (receivedItems / orderedItems) * 100
}

/**
 * Compute purchase cycle time in days (order to receipt).
 * Returns null if receivedAt is null or empty.
 */
export function computePurchaseCycleTime(
  orderedAt: string,
  receivedAt: string | null,
): number | null {
  if (!receivedAt) return null
  const start = new Date(orderedAt.slice(0, 10) + 'T00:00:00')
  const end   = new Date(receivedAt.slice(0, 10) + 'T00:00:00')
  return Math.round((end.getTime() - start.getTime()) / 86_400_000)
}

export type SupplierReliabilityClass = 'excellent' | 'good' | 'fair' | 'poor'

/**
 * Classify supplier reliability based on fulfillment rate, lead time, and on-time deliveries.
 *   excellent : fulfillmentRate > 95 AND onTime/total > 0.9 AND avgLeadTimeDays < 7
 *   good      : fulfillmentRate > 85 AND onTime/total > 0.7
 *   fair      : fulfillmentRate > 70
 *   poor      : else
 */
export function classifySupplierReliability(
  fulfillmentRate: number,
  avgLeadTimeDays: number | null,
  onTimeDeliveries: number,
  totalDeliveries: number,
): SupplierReliabilityClass {
  const onTimeRatio = totalDeliveries > 0 ? onTimeDeliveries / totalDeliveries : 0

  if (
    fulfillmentRate > 95 &&
    onTimeRatio > 0.9 &&
    avgLeadTimeDays !== null &&
    avgLeadTimeDays < 7
  ) {
    return 'excellent'
  }
  if (fulfillmentRate > 85 && onTimeRatio > 0.7) {
    return 'good'
  }
  if (fulfillmentRate > 70) {
    return 'fair'
  }
  return 'poor'
}

/**
 * Compute cost efficiency index: budgetedCost / actualCost * 100.
 * Higher is better; 100 = exactly on budget; > 100 = under budget.
 * Returns 0 if actualCost is 0.
 */
export function computeCostEfficiencyIndex(
  actualCost: number,
  budgetedCost: number,
): number {
  if (actualCost === 0) return 0
  return (budgetedCost / actualCost) * 100
}

/**
 * Build a Turkish-language supplier scorecard summary string.
 * Example: "Tedarikçi ABC: %96.50 dolum | 5.20g ortalama teslimat | Mükemmel"
 */
export function buildSupplierScorecard(
  supplier: string,
  fulfillmentRate: number,
  avgLeadDays: number | null,
  reliabilityClass: string,
): string {
  const reliabilityLabel: Record<string, string> = {
    excellent: 'Mükemmel',
    good:      'İyi',
    fair:      'Orta',
    poor:      'Zayıf',
  }
  const label     = reliabilityLabel[reliabilityClass] ?? reliabilityClass
  const leadPart  = avgLeadDays !== null
    ? `${avgLeadDays.toFixed(2)}g ortalama teslimat`
    : 'Teslimat süresi bilinmiyor'
  return `Tedarikçi ${supplier}: %${fulfillmentRate.toFixed(2)} dolum | ${leadPart} | ${label}`
}

// ── Internal row shapes ────────────────────────────────────────────────────────

interface PurchaseRow {
  id:            string
  supplier_name: string
  purchase_date: string
  status:        string
  finalized_at:  string | null
  created_at:    string
}

interface PurchaseItemRow {
  id:          string
  purchase_id: string
  product_id:  string | null
  quantity:    number
  unit_price:  number
}

interface ProductRow {
  id:   string
  name: string
  sku:  string | null
}

// ── Service class ──────────────────────────────────────────────────────────────

export class PurchaseAnalyticsService {
  constructor(private supabase: AnyClient) {}

  async getSummary(companyId: string): Promise<PurchaseAnalyticsSummary> {
    // Parallel fetch: purchases + purchase_items + products
    const [purchasesRes, itemsRes, productsRes] = await Promise.all([
      this.supabase
        .from('purchases')
        .select('id, supplier_name, purchase_date, status, finalized_at, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('purchase_date', { ascending: false })
        .limit(2000),

      this.supabase
        .from('purchase_items')
        .select('id, purchase_id, product_id, quantity, unit_price')
        .limit(10000),

      this.supabase
        .from('products')
        .select('id, name, sku')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    if (purchasesRes.error) throw new Error(`PurchaseAnalyticsService: ${purchasesRes.error.message}`)

    const purchases   = (purchasesRes.data ?? []) as PurchaseRow[]
    const allItems    = (itemsRes.data    ?? []) as PurchaseItemRow[]
    const productRows = (productsRes.data ?? []) as ProductRow[]

    const productMap  = new Map(productRows.map(p => [p.id, p]))

    // Build purchase → items lookup
    const purchaseIdSet = new Set(purchases.map(p => p.id))
    const itemsByPurchase = new Map<string, PurchaseItemRow[]>()
    for (const item of allItems) {
      if (!purchaseIdSet.has(item.purchase_id)) continue
      if (!itemsByPurchase.has(item.purchase_id)) itemsByPurchase.set(item.purchase_id, [])
      itemsByPurchase.get(item.purchase_id)!.push(item)
    }

    // Compute per-purchase total_try (sum of qty × unit_price for items)
    // and lead time
    const purchaseTotals = new Map<string, number>()
    for (const [pid, items] of itemsByPurchase.entries()) {
      const total = items.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0)
      purchaseTotals.set(pid, total)
    }

    // ── Aggregate lead time ────────────────────────────────────────────────────

    const allLeadTimes: number[] = []
    for (const p of purchases) {
      const ld = computeLeadTimeDays(p.purchase_date, p.finalized_at)
      if (ld !== null) allLeadTimes.push(ld)
    }

    const avgLeadTime = allLeadTimes.length > 0
      ? Math.round(allLeadTimes.reduce((s, d) => s + d, 0) / allLeadTimes.length * 10) / 10
      : null

    const pendingReceipts = purchases.filter(p => p.status === 'draft').length

    const totalSpent = purchases.reduce((s, p) => s + (purchaseTotals.get(p.id) ?? 0), 0)

    // ── Supplier analytics ─────────────────────────────────────────────────────

    const now         = new Date()
    const thisMonth   = now.toISOString().slice(0, 7)
    const lastMonthD  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth   = lastMonthD.toISOString().slice(0, 7)
    const observDays  = 180 // 6-month window

    const bySupplier = new Map<string, PurchaseRow[]>()
    for (const p of purchases) {
      const key = (p.supplier_name ?? '').trim()
      if (!key) continue
      if (!bySupplier.has(key)) bySupplier.set(key, [])
      bySupplier.get(key)!.push(p)
    }

    const allSupplierAnalytics: SupplierAnalytics[] = []

    for (const [name, rows] of bySupplier.entries()) {
      const supplierLead: number[] = []
      let totalAmt = 0
      let ordersThisMonth  = 0
      let ordersLastMonth  = 0
      let onTimeCount      = 0
      let receivedCount    = 0

      for (const row of rows) {
        const amt = purchaseTotals.get(row.id) ?? 0
        totalAmt += amt

        const ym = row.purchase_date.slice(0, 7)
        if (ym === thisMonth)  ordersThisMonth++
        if (ym === lastMonth)  ordersLastMonth++

        const ld = computeLeadTimeDays(row.purchase_date, row.finalized_at)
        if (ld !== null) {
          supplierLead.push(ld)
          receivedCount++
          if (ld <= 30) onTimeCount++  // on-time = received within 30 days
        }
      }

      const avgLead = supplierLead.length > 0
        ? Math.round(supplierLead.reduce((s, d) => s + d, 0) / supplierLead.length * 10) / 10
        : null

      const onTimePct = receivedCount > 0
        ? Math.round((onTimeCount / receivedCount) * 1000) / 10
        : null

      const freq = computePurchaseFrequency(rows.length, observDays)

      allSupplierAnalytics.push({
        supplier_name:              name,
        total_orders:               rows.length,
        total_amount_try:           Math.round(totalAmt * 100) / 100,
        avg_lead_time_days:         avgLead,
        lead_time_class:            classifyLeadTime(avgLead),
        on_time_delivery_pct:       onTimePct,
        orders_this_month:          ordersThisMonth,
        orders_last_month:          ordersLastMonth,
        purchase_frequency_per_month: Math.round(freq * 100) / 100,
      })
    }

    allSupplierAnalytics.sort((a, b) => b.total_amount_try - a.total_amount_try)
    const topSuppliers = allSupplierAnalytics.slice(0, 5)

    // ── Product analytics ──────────────────────────────────────────────────────

    // Collect all item rows keyed by product_id, each with purchase context
    type PurchaseItemContext = {
      purchase_date: string
      finalized_at:  string | null
      unit_price:    number
      quantity:      number
    }
    const byProduct = new Map<string, PurchaseItemContext[]>()

    for (const [pid, items] of itemsByPurchase.entries()) {
      const p = purchases.find(pu => pu.id === pid)
      if (!p) continue
      for (const item of items) {
        if (!item.product_id) continue
        if (!byProduct.has(item.product_id)) byProduct.set(item.product_id, [])
        byProduct.get(item.product_id)!.push({
          purchase_date: p.purchase_date,
          finalized_at:  p.finalized_at,
          unit_price:    Number(item.unit_price),
          quantity:      Number(item.quantity),
        })
      }
    }

    const productAnalytics: ProductPurchaseAnalytics[] = []

    for (const [productId, ctxs] of byProduct.entries()) {
      const product = productMap.get(productId)
      // Sort chronologically (oldest first)
      ctxs.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date))

      const totalQty      = ctxs.reduce((s, c) => s + c.quantity, 0)
      const totalSpentP   = ctxs.reduce((s, c) => s + c.quantity * c.unit_price, 0)
      const avgUnitCost   = totalQty > 0 ? totalSpentP / totalQty : 0

      const latestCtx     = ctxs[ctxs.length - 1]
      const priorCtx      = ctxs.length > 1 ? ctxs[ctxs.length - 2] : null

      const latestCost    = latestCtx?.unit_price ?? null
      const priorCost     = priorCtx?.unit_price  ?? null
      const costVar       = computeCostVariancePct(latestCost ?? 0, priorCost)

      const costs         = ctxs.map(c => c.unit_price)
      const trend         = detectCostTrend(costs)

      const lastDate      = latestCtx?.purchase_date ?? null

      // Lead times for this product
      const productLeads: number[] = []
      for (const c of ctxs) {
        const ld = computeLeadTimeDays(c.purchase_date, c.finalized_at)
        if (ld !== null) productLeads.push(ld)
      }
      const avgProdLead = productLeads.length > 0
        ? Math.round(productLeads.reduce((s, d) => s + d, 0) / productLeads.length * 10) / 10
        : null

      productAnalytics.push({
        product_id:           productId,
        product_name:         product?.name ?? productId,
        sku:                  product?.sku  ?? null,
        total_purchases:      ctxs.length,
        total_qty:            Math.round(totalQty * 1000) / 1000,
        total_spent_try:      Math.round(totalSpentP * 100) / 100,
        avg_unit_cost_try:    Math.round(avgUnitCost * 100) / 100,
        latest_unit_cost_try: latestCost !== null ? Math.round(latestCost * 100) / 100 : null,
        prior_unit_cost_try:  priorCost  !== null ? Math.round(priorCost  * 100) / 100 : null,
        cost_variance_pct:    costVar    !== null ? Math.round(costVar * 10) / 10 : null,
        cost_trend:           trend,
        last_purchase_date:   lastDate,
        avg_lead_time_days:   avgProdLead,
      })
    }

    productAnalytics.sort((a, b) => b.total_spent_try - a.total_spent_try)

    const costVarianceAlerts = productAnalytics.filter(
      p => p.cost_variance_pct !== null && Math.abs(p.cost_variance_pct) > 15
    )

    // ── 6-month monthly spend ──────────────────────────────────────────────────

    const months6: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months6.push(d.toISOString().slice(0, 7))
    }

    const monthlyMap = new Map<string, { amount_try: number; orders_count: number }>()
    for (const m of months6) {
      monthlyMap.set(m, { amount_try: 0, orders_count: 0 })
    }

    for (const p of purchases) {
      const ym = p.purchase_date.slice(0, 7)
      if (!monthlyMap.has(ym)) continue
      const bucket  = monthlyMap.get(ym)!
      bucket.orders_count++
      bucket.amount_try += purchaseTotals.get(p.id) ?? 0
    }

    const monthlySpend = months6.map(month => {
      const b = monthlyMap.get(month)!
      return {
        month,
        amount_try:   Math.round(b.amount_try * 100) / 100,
        orders_count: b.orders_count,
      }
    })

    return {
      total_purchases:      purchases.length,
      total_spent_try:      Math.round(totalSpent * 100) / 100,
      avg_lead_time_days:   avgLeadTime,
      pending_receipts:     pendingReceipts,
      top_suppliers:        topSuppliers,
      product_analytics:    productAnalytics,
      monthly_spend:        monthlySpend,
      cost_variance_alerts: costVarianceAlerts,
    }
  }
}
