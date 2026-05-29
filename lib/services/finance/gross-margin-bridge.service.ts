// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/gross-margin-bridge.service.ts
//
// Gross Margin Bridge Decomposition Service
//
// Decomposes the change in gross profit between two periods into:
//   1. Volume Effect  — change due to selling more/fewer units
//   2. Price Effect   — change due to revenue price changes
//   3. Cost Effect    — change due to COGS/unit cost changes
//   4. Mix Effect     — residual (product mix shifts)
//
// Pure functions exported for testing:
//   computeVolumeEffect                — Σ units_delta × prior_margin_per_unit
//   computePriceEffect                 — Σ current_units × (price_current - price_prior)
//   computeCostEffect                  — -Σ current_units × (cost_current - cost_prior)
//   computeMixEffect                   — residual
//   computeTotalGpChange               — currentGP - priorGP
//   buildGrossMarginBridge             — full bridge array
//   classifyBridgeComponentSignificance
//   computeMarginImprovementPp         — pp change in gross margin %
//   classifyGrossMarginHealth          — premium/strong/adequate/thin/critical
//   identifyDominantDriver             — largest absolute component (excl. total)
//   buildProductBridgeContributions    — per-product contribution
//   classifyMarginDynamics             — price vs cost signal
//
// Class: GrossMarginBridgeService
//   getReport(companyId): Promise<GrossMarginBridgeReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Product period data ───────────────────────────────────────────────────────

export interface ProductPeriodData {
  product_id: string
  product_name: string
  units_sold_current: number
  units_sold_prior: number
  avg_price_current: number    // revenue / units
  avg_price_prior: number
  avg_cost_current: number     // FIFO cost / units
  avg_cost_prior: number
  revenue_current: number
  revenue_prior: number
  cogs_current: number
  cogs_prior: number
  gross_profit_current: number  // revenue - cogs
  gross_profit_prior: number
  margin_pct_current: number    // gross_profit / revenue × 100
  margin_pct_prior: number
}

// ── Bridge component ──────────────────────────────────────────────────────────

export interface GrossMarginBridgeComponent {
  name: string           // Turkish component name
  component_key: 'volume' | 'price' | 'cost' | 'mix' | 'total'
  amount_try: number     // positive = margin increase, negative = decrease
  pct_of_prior_gp: number  // component / prior_gross_profit × 100 (0 if prior_gp = 0)
  is_favorable: boolean   // positive amount = favorable
  description: string    // Turkish explanation
}

// ── Product bridge contribution ───────────────────────────────────────────────

export interface ProductBridgeContribution {
  product_id: string
  product_name: string
  gp_change_try: number           // current_gp - prior_gp for this product
  gp_change_pct_of_total: number  // product_delta / total_delta × 100
  margin_pct_change_pp: number    // margin % point change
  is_top_contributor: boolean     // true if |contribution| > 20% of total change
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * computeVolumeEffect
 *
 * How much gross profit would have changed if only volume changed?
 * volume_effect = Σ (units_delta × prior_margin_per_unit) per product
 * where units_delta = current - prior, prior_margin_per_unit = prior_gp / prior_units
 */
export function computeVolumeEffect(products: ProductPeriodData[]): number {
  let total = 0
  for (const p of products) {
    if (p.units_sold_prior === 0) continue
    const priorMarginPerUnit = p.gross_profit_prior / p.units_sold_prior
    const unitsDelta = p.units_sold_current - p.units_sold_prior
    total += unitsDelta * priorMarginPerUnit
  }
  return total
}

/**
 * computePriceEffect
 *
 * Revenue impact of price changes at current volume:
 * price_effect = Σ (current_units × (price_current - price_prior)) per product
 */
export function computePriceEffect(products: ProductPeriodData[]): number {
  let total = 0
  for (const p of products) {
    total += p.units_sold_current * (p.avg_price_current - p.avg_price_prior)
  }
  return total
}

/**
 * computeCostEffect
 *
 * COGS impact of cost changes at current volume (negative = margin reduction):
 * cost_effect = -Σ (current_units × (cost_current - cost_prior)) per product
 */
export function computeCostEffect(products: ProductPeriodData[]): number {
  let total = 0
  for (const p of products) {
    total += -(p.units_sold_current * (p.avg_cost_current - p.avg_cost_prior))
  }
  return total
}

/**
 * computeMixEffect
 *
 * Residual: totalEffect - volumeEffect - priceEffect - costEffect
 * Captures shifts in product mix toward higher/lower margin products.
 */
export function computeMixEffect(
  totalEffect: number,
  volumeEffect: number,
  priceEffect: number,
  costEffect: number,
): number {
  return totalEffect - volumeEffect - priceEffect - costEffect
}

/**
 * computeTotalGpChange
 *
 * Total gross profit change between periods.
 */
export function computeTotalGpChange(
  priorGrossProfit: number,
  currentGrossProfit: number,
): number {
  return currentGrossProfit - priorGrossProfit
}

/**
 * buildGrossMarginBridge
 *
 * Constructs the full bridge decomposition.
 * Returns [volume, price, cost, mix, total] components.
 * total.amount_try == currentGrossProfit - priorGrossProfit (reconciles exactly).
 */
export function buildGrossMarginBridge(
  products: ProductPeriodData[],
  priorGrossProfit: number,
  currentGrossProfit: number,
): GrossMarginBridgeComponent[] {
  const totalEffect  = computeTotalGpChange(priorGrossProfit, currentGrossProfit)
  const volumeEffect = computeVolumeEffect(products)
  const priceEffect  = computePriceEffect(products)
  const costEffect   = computeCostEffect(products)
  const mixEffect    = computeMixEffect(totalEffect, volumeEffect, priceEffect, costEffect)

  const priorGpAbs = Math.abs(priorGrossProfit)

  function makePct(amount: number): number {
    return priorGrossProfit !== 0 ? (amount / priorGpAbs) * 100 : 0
  }

  const components: GrossMarginBridgeComponent[] = [
    {
      name: 'Hacim Etkisi',
      component_key: 'volume',
      amount_try: volumeEffect,
      pct_of_prior_gp: makePct(volumeEffect),
      is_favorable: volumeEffect > 0,
      description: volumeEffect >= 0
        ? 'Daha fazla birim satışı brüt kâra olumlu katkı sağladı.'
        : 'Azalan satış hacmi brüt kâr üzerinde olumsuz etki yarattı.',
    },
    {
      name: 'Fiyat Etkisi',
      component_key: 'price',
      amount_try: priceEffect,
      pct_of_prior_gp: makePct(priceEffect),
      is_favorable: priceEffect > 0,
      description: priceEffect >= 0
        ? 'Ortalama satış fiyatındaki artış brüt kâr marjını iyileştirdi.'
        : 'Fiyat baskısı brüt kâr marjını olumsuz etkiledi.',
    },
    {
      name: 'Maliyet Etkisi',
      component_key: 'cost',
      amount_try: costEffect,
      pct_of_prior_gp: makePct(costEffect),
      is_favorable: costEffect > 0,
      description: costEffect >= 0
        ? 'Birim maliyetlerindeki düşüş brüt kâr marjını artırdı.'
        : 'Artan birim maliyetleri brüt kâr marjını daralttı.',
    },
    {
      name: 'Karışım Etkisi',
      component_key: 'mix',
      amount_try: mixEffect,
      pct_of_prior_gp: makePct(mixEffect),
      is_favorable: mixEffect > 0,
      description: mixEffect >= 0
        ? 'Yüksek marjlı ürünlere yönelik satış karışımı değişimi olumlu katkı sağladı.'
        : 'Düşük marjlı ürünlere kayan satış karışımı brüt kârı olumsuz etkiledi.',
    },
    {
      name: 'Toplam Değişim',
      component_key: 'total',
      amount_try: totalEffect,
      pct_of_prior_gp: makePct(totalEffect),
      is_favorable: totalEffect > 0,
      description: totalEffect >= 0
        ? 'Brüt kâr dönemden döneme artış gösterdi.'
        : 'Brüt kâr dönemden döneme düşüş gösterdi.',
    },
  ]

  return components
}

/**
 * classifyBridgeComponentSignificance
 *
 * material: |amount| > 10% of prior GP
 * moderate: |amount| > 3%
 * minor: otherwise
 */
export function classifyBridgeComponentSignificance(
  amount: number,
  priorGrossProfit: number,
): 'material' | 'moderate' | 'minor' {
  if (priorGrossProfit === 0) return 'minor'
  const ratio = Math.abs(amount) / Math.abs(priorGrossProfit)
  if (ratio > 0.10) return 'material'
  if (ratio > 0.03) return 'moderate'
  return 'minor'
}

/**
 * computeMarginImprovementPp
 *
 * Gross margin improvement in percentage points.
 * Positive = improvement, negative = deterioration.
 */
export function computeMarginImprovementPp(
  currentMarginPct: number,
  priorMarginPct: number,
): number {
  return currentMarginPct - priorMarginPct
}

/**
 * classifyGrossMarginHealth
 *
 * premium  ≥ 50%
 * strong   ≥ 35%
 * adequate ≥ 20%
 * thin     ≥ 10%
 * critical < 10%
 */
export function classifyGrossMarginHealth(
  grossMarginPct: number,
): 'premium' | 'strong' | 'adequate' | 'thin' | 'critical' {
  if (grossMarginPct >= 50) return 'premium'
  if (grossMarginPct >= 35) return 'strong'
  if (grossMarginPct >= 20) return 'adequate'
  if (grossMarginPct >= 10) return 'thin'
  return 'critical'
}

/**
 * identifyDominantDriver
 *
 * Largest absolute component, excluding 'total'.
 * Returns null if no components available.
 */
export function identifyDominantDriver(
  components: GrossMarginBridgeComponent[],
): GrossMarginBridgeComponent | null {
  const drivers = components.filter(c => c.component_key !== 'total')
  if (drivers.length === 0) return null

  return drivers.reduce((max, c) =>
    Math.abs(c.amount_try) > Math.abs(max.amount_try) ? c : max,
  )
}

/**
 * buildProductBridgeContributions
 *
 * Per-product contribution to the overall GP change.
 */
export function buildProductBridgeContributions(
  products: ProductPeriodData[],
  totalGpChange: number,
): ProductBridgeContribution[] {
  return products.map(p => {
    const gpChange = p.gross_profit_current - p.gross_profit_prior
    const gpChangePctOfTotal = totalGpChange !== 0
      ? (gpChange / Math.abs(totalGpChange)) * 100
      : 0
    const marginPctChangePp = p.margin_pct_current - p.margin_pct_prior
    const isTopContributor = totalGpChange !== 0 &&
      Math.abs(gpChange / Math.abs(totalGpChange)) > 0.20

    return {
      product_id: p.product_id,
      product_name: p.product_name,
      gp_change_try: gpChange,
      gp_change_pct_of_total: gpChangePctOfTotal,
      margin_pct_change_pp: marginPctChangePp,
      is_top_contributor: isTopContributor,
    }
  })
}

/**
 * classifyMarginDynamics
 *
 * Characterizes what is driving margin changes based on price vs cost signals.
 */
export function classifyMarginDynamics(
  priceEffect: number,
  costEffect: number,
): 'margin_expansion' | 'volume_driven' | 'cost_compression' | 'price_pressure' | 'mixed' | 'neutral' {
  const isNeutral = (v: number) => Math.abs(v) < 0.01

  if (isNeutral(priceEffect) && isNeutral(costEffect)) return 'neutral'

  if (priceEffect > 0 && costEffect > 0) return 'volume_driven'
  if (priceEffect > 0 && costEffect < 0) return 'margin_expansion'
  if (priceEffect < 0 && costEffect < 0) return 'cost_compression'
  if (priceEffect < 0 && costEffect > 0) return 'price_pressure'

  return 'mixed'
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface GrossMarginBridgeReport {
  period_current: string   // YYYY-MM
  period_prior: string     // YYYY-MM

  current_gross_profit_try: number
  prior_gross_profit_try: number
  current_gross_margin_pct: number
  prior_gross_margin_pct: number
  margin_improvement_pp: number      // pp = percentage points
  margin_health: ReturnType<typeof classifyGrossMarginHealth>

  bridge_components: GrossMarginBridgeComponent[]
  dominant_driver: GrossMarginBridgeComponent | null
  margin_dynamics: ReturnType<typeof classifyMarginDynamics>

  product_contributions: ProductBridgeContribution[]
  top_contributing_products: ProductBridgeContribution[]  // |pct| > 20%
}

// ── Service class ─────────────────────────────────────────────────────────────

export class GrossMarginBridgeService {
  constructor(private readonly supabase: AnyClient) {}

  /**
   * Fetch sale items with COGS for a given YYYY-MM period.
   * Returns a map from product_id → { units, revenue, cogs, name }
   */
  private async fetchProductData(
    companyId: string,
    period: string,  // YYYY-MM
  ): Promise<Map<string, {
    name: string
    units: number
    revenue: number
    cogs: number
  }>> {
    const [year, month] = period.split('-').map(Number)
    const from = `${period}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to   = `${period}-${String(lastDay).padStart(2, '0')}`

    const result = new Map<string, { name: string; units: number; revenue: number; cogs: number }>()

    try {
      // Get sales in period
      const { data: salesData } = await this.supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('payment_status', 'eq', 'cancelled')
        .limit(5000)

      const saleIds = (salesData ?? []).map((r: { id: string }) => r.id)
      if (saleIds.length === 0) return result

      // Get sale items
      const { data: itemsData } = await this.supabase
        .from('sale_items')
        .select('id, product_id, qty, unit_price, products(name)')
        .eq('company_id', companyId)
        .in('sale_id', saleIds)
        .limit(10000)

      if (!itemsData || itemsData.length === 0) return result

      // Build item map for quick lookup
      const itemMap = new Map<string, { productId: string; qty: number; unitPrice: number; name: string }>()
      for (const item of (itemsData as unknown) as Array<{ id: string; product_id: string; qty: number; unit_price: number; products: { name: string } | null }>) {
        const name = item.products?.name ?? item.product_id
        itemMap.set(item.id, {
          productId: item.product_id,
          qty: Number(item.qty ?? 0),
          unitPrice: Number(item.unit_price ?? 0),
          name,
        })
      }

      // Get COGS via allocations
      const saleItemIds = [...itemMap.keys()]
      let cogsMap = new Map<string, number>()  // saleItemId → total cogs

      if (saleItemIds.length > 0) {
        try {
          const { data: allocData } = await this.supabase
            .from('sale_item_allocations')
            .select('sale_item_id, qty_allocated, cost_price_try, stock_lots(cost_price_try)')
            .eq('company_id', companyId)
            .in('sale_item_id', saleItemIds)
            .limit(20000)

          for (const r of (allocData ?? []) as Array<{ sale_item_id: string; qty_allocated: number; cost_price_try: number | null; stock_lots: { cost_price_try?: number } | null }>) {
            const lot      = r.stock_lots
            const unitCost = r.cost_price_try !== null && r.cost_price_try !== undefined
              ? Number(r.cost_price_try)
              : (lot?.cost_price_try !== undefined ? Number(lot.cost_price_try) : 0)
            const existing = cogsMap.get(r.sale_item_id) ?? 0
            cogsMap.set(r.sale_item_id, existing + Number(r.qty_allocated ?? 0) * unitCost)
          }
        } catch {
          // cogsMap stays empty — fallback applied below
        }
      }

      // Aggregate by product
      for (const [itemId, item] of itemMap) {
        const entry = result.get(item.productId) ?? { name: item.name, units: 0, revenue: 0, cogs: 0 }
        const revenue = item.qty * item.unitPrice
        let cogs = cogsMap.get(itemId) ?? 0

        // Fallback: 40% of revenue if no COGS data
        if (cogs === 0 && revenue > 0) {
          cogs = revenue * 0.40
        }

        entry.units   += item.qty
        entry.revenue += revenue
        entry.cogs    += cogs
        result.set(item.productId, entry)
      }
    } catch {
      // Return empty map on error
    }

    return result
  }

  /**
   * Build ProductPeriodData array from two period data maps.
   */
  private buildProductPeriodData(
    currentMap: Map<string, { name: string; units: number; revenue: number; cogs: number }>,
    priorMap: Map<string, { name: string; units: number; revenue: number; cogs: number }>,
  ): ProductPeriodData[] {
    // Union of all product IDs
    const allProductIds = new Set([...currentMap.keys(), ...priorMap.keys()])
    const products: ProductPeriodData[] = []

    for (const productId of allProductIds) {
      const cur = currentMap.get(productId) ?? { name: productId, units: 0, revenue: 0, cogs: 0 }
      const pri = priorMap.get(productId)   ?? { name: productId, units: 0, revenue: 0, cogs: 0 }

      const gpCurrent = cur.revenue - cur.cogs
      const gpPrior   = pri.revenue - pri.cogs

      products.push({
        product_id: productId,
        product_name: cur.name !== productId ? cur.name : (pri.name !== productId ? pri.name : productId),
        units_sold_current: cur.units,
        units_sold_prior:   pri.units,
        avg_price_current:  cur.units > 0 ? cur.revenue / cur.units : 0,
        avg_price_prior:    pri.units > 0 ? pri.revenue / pri.units : 0,
        avg_cost_current:   cur.units > 0 ? cur.cogs    / cur.units : 0,
        avg_cost_prior:     pri.units > 0 ? pri.cogs    / pri.units : 0,
        revenue_current:    cur.revenue,
        revenue_prior:      pri.revenue,
        cogs_current:       cur.cogs,
        cogs_prior:         pri.cogs,
        gross_profit_current: gpCurrent,
        gross_profit_prior:   gpPrior,
        margin_pct_current: cur.revenue > 0 ? (gpCurrent / cur.revenue) * 100 : 0,
        margin_pct_prior:   pri.revenue > 0 ? (gpPrior   / pri.revenue) * 100 : 0,
      })
    }

    return products
  }

  /**
   * Build and return the Gross Margin Bridge report.
   * Compares current month vs prior month.
   */
  async getReport(companyId: string): Promise<GrossMarginBridgeReport> {
    const now = new Date()
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const priorDate     = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const priorPeriod   = `${priorDate.getFullYear()}-${String(priorDate.getMonth() + 1).padStart(2, '0')}`

    const [currentMap, priorMap] = await Promise.all([
      this.fetchProductData(companyId, currentPeriod),
      this.fetchProductData(companyId, priorPeriod),
    ])

    const products = this.buildProductPeriodData(currentMap, priorMap)

    // Aggregate totals
    let currentRevenue = 0
    let priorRevenue   = 0
    let currentGP      = 0
    let priorGP        = 0

    for (const p of products) {
      currentRevenue += p.revenue_current
      priorRevenue   += p.revenue_prior
      currentGP      += p.gross_profit_current
      priorGP        += p.gross_profit_prior
    }

    const currentMarginPct = currentRevenue > 0 ? (currentGP / currentRevenue) * 100 : 0
    const priorMarginPct   = priorRevenue   > 0 ? (priorGP   / priorRevenue)   * 100 : 0

    const bridgeComponents = buildGrossMarginBridge(products, priorGP, currentGP)
    const totalGpChange    = computeTotalGpChange(priorGP, currentGP)

    const priceComp  = bridgeComponents.find(c => c.component_key === 'price')!
    const costComp   = bridgeComponents.find(c => c.component_key === 'cost')!

    const productContributions = buildProductBridgeContributions(products, totalGpChange)
    const topContributing      = productContributions.filter(c => c.is_top_contributor)

    return {
      period_current: currentPeriod,
      period_prior:   priorPeriod,

      current_gross_profit_try: currentGP,
      prior_gross_profit_try:   priorGP,
      current_gross_margin_pct: currentMarginPct,
      prior_gross_margin_pct:   priorMarginPct,
      margin_improvement_pp: computeMarginImprovementPp(currentMarginPct, priorMarginPct),
      margin_health: classifyGrossMarginHealth(currentMarginPct),

      bridge_components: bridgeComponents,
      dominant_driver:   identifyDominantDriver(bridgeComponents),
      margin_dynamics:   classifyMarginDynamics(priceComp.amount_try, costComp.amount_try),

      product_contributions: productContributions,
      top_contributing_products: topContributing,
    }
  }
}
