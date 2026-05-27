// ── ProductProfitabilityService — True product profitability waterfall ────────
//
// Computes a per-product waterfall:
//   Revenue → COGS → Gross Profit → Attributed OpEx → Contribution Margin
//
// OpEx is attributed proportionally to each product's revenue share.
// Break-even units = attributed_opex / (avg_unit_price - avg_unit_cost).
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProfitabilityTier = 'star' | 'profitable' | 'marginal' | 'loss_maker'

export interface ProductWaterfall {
  product_id: string
  product_name: string
  category?: string
  period_months: number
  // Volume
  units_sold: number
  order_count: number
  avg_unit_price: number
  avg_unit_cost: number | null
  // Waterfall
  revenue: number
  cogs: number
  gross_profit: number
  gross_margin_pct: number | null
  attributed_opex: number
  contribution_margin: number
  contribution_margin_pct: number | null
  // Break-even
  breakeven_units: number | null
  // Classification
  tier: ProfitabilityTier
  revenue_share_pct: number
}

export interface ProductProfitabilityReport {
  company_id: string
  period_months: number
  analysis_from: string
  analysis_to: string
  products: ProductWaterfall[]
  // Portfolio
  total_revenue: number
  total_cogs: number
  total_gross_profit: number
  total_attributed_opex: number
  total_contribution_margin: number
  portfolio_gross_margin_pct: number | null
  portfolio_contribution_margin_pct: number | null
  // Tier counts
  star_count: number
  profitable_count: number
  marginal_count: number
  loss_maker_count: number
  computed_at: string
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

/**
 * computeAttributedOpex
 * Returns the share of total opex attributed to a product based on revenue share.
 * @param revenueShare  fraction 0-1 (e.g. 0.3 = 30% of company revenue)
 * @param totalOpex     total company operating expenses in the period
 */
export function computeAttributedOpex(
  revenueShare: number,
  totalOpex: number,
): number {
  return revenueShare * totalOpex
}

/**
 * computeContributionMargin
 * Gross profit minus attributed operating expenses.
 */
export function computeContributionMargin(
  grossProfit: number,
  attributedOpex: number,
): number {
  return grossProfit - attributedOpex
}

/**
 * classifyProfitabilityTier
 * Star:        contribution_margin_pct >= 30%
 * Profitable:  15% <= pct < 30%
 * Marginal:    0% <= pct < 15% (including exactly 0 and null)
 * Loss-maker:  pct < 0%
 */
export function classifyProfitabilityTier(
  contributionMarginPct: number | null,
): ProfitabilityTier {
  if (contributionMarginPct === null) return 'marginal'
  if (contributionMarginPct >= 30)   return 'star'
  if (contributionMarginPct >= 15)   return 'profitable'
  if (contributionMarginPct >= 0)    return 'marginal'
  return 'loss_maker'
}

/**
 * computeBreakevenUnits
 * Fixed cost / (unit price - unit cost).
 * Returns null when:
 *   - unit cost is unknown
 *   - price <= cost (no positive contribution per unit)
 *   - attributed opex is 0 → returns 0 (no fixed cost to cover)
 */
export function computeBreakevenUnits(
  attributedOpex: number,
  avgUnitPrice: number,
  avgUnitCost: number | null,
): number | null {
  if (avgUnitCost === null) return null
  const unitContribution = avgUnitPrice - avgUnitCost
  if (unitContribution <= 0) return null
  if (attributedOpex === 0) return 0
  return attributedOpex / unitContribution
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

function isoDateMonthsBack(today: string, months: number): string {
  const d = new Date(today)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

// Raw DB row types
interface SaleItemRow {
  product_id:   string | null
  product_name: string | null
  unit_price:   number | null
  qty:          number | null
  line_total:   number | null
  sale_id:      string | null
  // joined from products
  category?:    string | null
}

interface AllocationRow {
  sale_id:        string | null
  product_id:     string | null
  qty_allocated:  number | null
  cost_price_try: number | null
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ProductProfitabilityService {
  static async getReport(
    companyId: string,
    supabase: AnySupabase,
    opts?: { months?: number; today?: string },
  ): Promise<ProductProfitabilityReport> {
    const periodMonths = opts?.months ?? 12
    const today        = opts?.today ?? new Date().toISOString().slice(0, 10)
    const fromDate     = isoDateMonthsBack(today, periodMonths)

    // ── 1. Sale items in the period (with product info) ───────────────────────
    // We join sale_items → sales to filter by date + company + validity
    let saleItems: SaleItemRow[] = []
    try {
      const { data, error } = await supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          unit_price,
          qty,
          line_total,
          sale_id,
          products(category),
          sales!inner(sale_date, deleted_at, is_proforma, company_id)
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', today)

      if (!error && data) {
        saleItems = (data as Array<Record<string, unknown>>).map(r => ({
          product_id:   r.product_id   as string | null,
          product_name: r.product_name as string | null,
          unit_price:   Number(r.unit_price ?? 0),
          qty:          Number(r.qty ?? 0),
          line_total:   Number(r.line_total ?? 0),
          sale_id:      r.sale_id as string | null,
          category:     (r.products as Record<string, unknown> | null)?.category as string | null,
        }))
      }
    } catch {
      saleItems = []
    }

    // ── 2. FIFO cost allocations in the period ────────────────────────────────
    // sale_item_allocations stores frozen cost per lot allocation.
    let allocations: AllocationRow[] = []
    try {
      const { data, error } = await supabase
        .from('sale_item_allocations')
        .select('sale_id, product_id, qty_allocated, cost_price_try')
        .eq('company_id', companyId)

      if (!error && data) {
        allocations = data as AllocationRow[]
      }
    } catch {
      allocations = []
    }

    // ── 3. Operating expenses in the period ───────────────────────────────────
    let totalOpex = 0
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', fromDate)
        .lte('expense_date', today)

      if (!error && data) {
        totalOpex = (data as Array<{ amount: number | null }>)
          .reduce((s, r) => s + Number(r.amount ?? 0), 0)
      }
    } catch {
      totalOpex = 0
    }

    // ── 4. Aggregate per product ──────────────────────────────────────────────

    // Build allocation lookup: sale_id+product_id → COGS
    const allocMap = new Map<string, number>()
    for (const a of allocations) {
      if (!a.sale_id || !a.product_id) continue
      const key  = `${a.sale_id}__${a.product_id}`
      const prev = allocMap.get(key) ?? 0
      allocMap.set(key, prev + Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0))
    }

    // Aggregate sale items per product
    interface ProductAccum {
      product_id:   string
      product_name: string
      category:     string | undefined
      units_sold:   number
      order_count:  number
      revenue:      number
      cogs:         number
      // for weighted avg calculations
      price_qty:    number   // Σ(unit_price × qty)
      cost_qty:     number   // Σ(cogs per item)
      cost_units:   number   // units where we have COGS data
    }

    const productMap = new Map<string, ProductAccum>()

    for (const item of saleItems) {
      // Use product_id as key, fallback to product_name
      const pid   = item.product_id ?? `__name__${item.product_name ?? 'unknown'}`
      const pname = item.product_name?.trim() || 'Bilinmeyen Ürün'
      const qty   = Number(item.qty ?? 0)
      const price = Number(item.unit_price ?? 0)
      const lineTotal = Number(item.line_total ?? 0) || price * qty

      // COGS from allocation
      const allocKey  = `${item.sale_id}__${item.product_id}`
      const lineCogs  = item.product_id && item.sale_id ? (allocMap.get(allocKey) ?? 0) : 0

      const prev = productMap.get(pid) ?? {
        product_id:   pid,
        product_name: pname,
        category:     item.category ?? undefined,
        units_sold:   0,
        order_count:  0,
        revenue:      0,
        cogs:         0,
        price_qty:    0,
        cost_qty:     0,
        cost_units:   0,
      }

      productMap.set(pid, {
        ...prev,
        units_sold:  prev.units_sold  + qty,
        order_count: prev.order_count + 1,
        revenue:     prev.revenue     + lineTotal,
        cogs:        prev.cogs        + lineCogs,
        price_qty:   prev.price_qty   + price * qty,
        cost_qty:    prev.cost_qty    + lineCogs,
        cost_units:  lineCogs > 0 ? prev.cost_units + qty : prev.cost_units,
      })
    }

    // ── 5. Build waterfall per product ────────────────────────────────────────

    const totalRevenue = Array.from(productMap.values()).reduce((s, p) => s + p.revenue, 0)

    const products: ProductWaterfall[] = Array.from(productMap.values()).map(p => {
      const revenueShare = totalRevenue > 0 ? p.revenue / totalRevenue : 0
      const attributedOpex = computeAttributedOpex(revenueShare, totalOpex)

      const grossProfit  = p.revenue - p.cogs
      const grossMarginPct = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : null

      const contributionMargin    = computeContributionMargin(grossProfit, attributedOpex)
      const contributionMarginPct = p.revenue > 0 ? (contributionMargin / p.revenue) * 100 : null

      const tier = classifyProfitabilityTier(contributionMarginPct)

      const avgUnitPrice = p.units_sold > 0 ? p.price_qty / p.units_sold : 0
      const avgUnitCost  = p.cost_units > 0 ? p.cost_qty  / p.cost_units  : null

      const breakevenUnits = computeBreakevenUnits(attributedOpex, avgUnitPrice, avgUnitCost)

      return {
        product_id:              p.product_id,
        product_name:            p.product_name,
        category:                p.category,
        period_months:           periodMonths,
        units_sold:              p.units_sold,
        order_count:             p.order_count,
        avg_unit_price:          avgUnitPrice,
        avg_unit_cost:           avgUnitCost,
        revenue:                 p.revenue,
        cogs:                    p.cogs,
        gross_profit:            grossProfit,
        gross_margin_pct:        grossMarginPct,
        attributed_opex:         attributedOpex,
        contribution_margin:     contributionMargin,
        contribution_margin_pct: contributionMarginPct,
        breakeven_units:         breakevenUnits,
        tier,
        revenue_share_pct:       revenueShare * 100,
      }
    })

    // Sort descending by contribution_margin
    products.sort((a, b) => b.contribution_margin - a.contribution_margin)

    // ── 6. Portfolio totals ───────────────────────────────────────────────────

    const totalCogs               = products.reduce((s, p) => s + p.cogs, 0)
    const totalGrossProfit        = products.reduce((s, p) => s + p.gross_profit, 0)
    const totalAttributedOpex     = products.reduce((s, p) => s + p.attributed_opex, 0)
    const totalContributionMargin = products.reduce((s, p) => s + p.contribution_margin, 0)

    const portfolioGrossMarginPct = totalRevenue > 0
      ? (totalGrossProfit / totalRevenue) * 100
      : null
    const portfolioContributionMarginPct = totalRevenue > 0
      ? (totalContributionMargin / totalRevenue) * 100
      : null

    const starCount        = products.filter(p => p.tier === 'star').length
    const profitableCount  = products.filter(p => p.tier === 'profitable').length
    const marginalCount    = products.filter(p => p.tier === 'marginal').length
    const lossMakerCount   = products.filter(p => p.tier === 'loss_maker').length

    return {
      company_id:                      companyId,
      period_months:                   periodMonths,
      analysis_from:                   fromDate,
      analysis_to:                     today,
      products,
      total_revenue:                   totalRevenue,
      total_cogs:                      totalCogs,
      total_gross_profit:              totalGrossProfit,
      total_attributed_opex:           totalAttributedOpex,
      total_contribution_margin:       totalContributionMargin,
      portfolio_gross_margin_pct:      portfolioGrossMarginPct,
      portfolio_contribution_margin_pct: portfolioContributionMarginPct,
      star_count:                      starCount,
      profitable_count:                profitableCount,
      marginal_count:                  marginalCount,
      loss_maker_count:                lossMakerCount,
      computed_at:                     new Date().toISOString(),
    }
  }
}
