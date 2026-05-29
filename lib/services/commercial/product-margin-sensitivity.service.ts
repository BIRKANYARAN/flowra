// ── ProductMarginSensitivityService — Product-level margin sensitivity analysis ─
//
// Analyzes how changes in price, volume, and cost affect product gross margins.
// Provides what-if scenarios for Turkish SME pricing decisions.
//
// Pure helpers are exported for unit testing; no DB required.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProductBaseMetrics {
  product_id: string
  product_name: string
  avg_selling_price: number
  avg_unit_cost: number          // FIFO cost
  units_sold_monthly: number     // avg monthly
  gross_margin_try_monthly: number
  gross_margin_pct: number | null
}

export interface SensitivityResult {
  scenario_name: string
  delta_label: string            // e.g. "+10% Fiyat"
  new_selling_price: number
  new_unit_cost: number
  new_gross_margin_pct: number | null
  margin_change_pp: number | null  // new - base (percentage points)
  monthly_impact_try: number       // (new_margin - base_margin) × units
  is_positive: boolean
}

export interface ProductMarginSensitivityReport {
  products: ProductBaseMetrics[]
  standard_scenarios: SensitivityResult[]  // for top product by revenue
  risk_ranking: Array<ProductBaseMetrics & {
    margin_at_inflation: number | null
    margin_drop_pp: number | null
    risk_level: string
  }>
  portfolio_sensitivity_10pct_cost: ReturnType<typeof computePortfolioSensitivity>
  portfolio_sensitivity_20pct_cost: ReturnType<typeof computePortfolioSensitivity>
  high_risk_product_count: number
  narrative: string
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

/**
 * computeUnitGrossMargin
 * sellingPrice - unitCost (can be negative)
 */
export function computeUnitGrossMargin(sellingPrice: number, unitCost: number): number {
  return sellingPrice - unitCost
}

/**
 * computeUnitGrossMarginPct
 * (sellingPrice - unitCost) / sellingPrice × 100
 * null if sellingPrice === 0
 */
export function computeUnitGrossMarginPct(
  sellingPrice: number,
  unitCost: number,
): number | null {
  if (sellingPrice === 0) return null
  return ((sellingPrice - unitCost) / sellingPrice) * 100
}

/**
 * computeMonthlyMarginContribution
 * unitGrossMargin × monthlyUnits
 */
export function computeMonthlyMarginContribution(
  unitGrossMargin: number,
  monthlyUnits: number,
): number {
  return unitGrossMargin * monthlyUnits
}

/**
 * computePriceSensitivity
 * scenario_name: "Fiyat Değişimi"
 * delta_label: e.g. "+10% Fiyat" or "-5% Fiyat"
 */
export function computePriceSensitivity(
  basePrice: number,
  baseCost: number,
  priceChangePct: number,
  baseMonthlyUnits: number = 0,
): SensitivityResult {
  const sign = priceChangePct >= 0 ? '+' : ''
  const deltaLabel = `${sign}${priceChangePct}% Fiyat`
  const newSellingPrice = basePrice * (1 + priceChangePct / 100)
  const newUnitCost = baseCost

  const baseMarginPct = computeUnitGrossMarginPct(basePrice, baseCost)
  const newMarginPct = computeUnitGrossMarginPct(newSellingPrice, newUnitCost)
  const marginChangePp =
    newMarginPct !== null && baseMarginPct !== null
      ? newMarginPct - baseMarginPct
      : null

  const baseUnitMargin = computeUnitGrossMargin(basePrice, baseCost)
  const newUnitMargin = computeUnitGrossMargin(newSellingPrice, newUnitCost)
  const monthlyImpact = (newUnitMargin - baseUnitMargin) * baseMonthlyUnits

  return {
    scenario_name: 'Fiyat Değişimi',
    delta_label: deltaLabel,
    new_selling_price: newSellingPrice,
    new_unit_cost: newUnitCost,
    new_gross_margin_pct: newMarginPct,
    margin_change_pp: marginChangePp,
    monthly_impact_try: monthlyImpact,
    is_positive: monthlyImpact > 0,
  }
}

/**
 * computeCostSensitivity
 * scenario_name: "Maliyet Değişimi"
 * delta_label: e.g. "+15% Maliyet"
 */
export function computeCostSensitivity(
  basePrice: number,
  baseCost: number,
  costChangePct: number,
  baseMonthlyUnits: number = 0,
): SensitivityResult {
  const sign = costChangePct >= 0 ? '+' : ''
  const deltaLabel = `${sign}${costChangePct}% Maliyet`
  const newSellingPrice = basePrice
  const newUnitCost = baseCost * (1 + costChangePct / 100)

  const baseMarginPct = computeUnitGrossMarginPct(basePrice, baseCost)
  const newMarginPct = computeUnitGrossMarginPct(newSellingPrice, newUnitCost)
  const marginChangePp =
    newMarginPct !== null && baseMarginPct !== null
      ? newMarginPct - baseMarginPct
      : null

  const baseUnitMargin = computeUnitGrossMargin(basePrice, baseCost)
  const newUnitMargin = computeUnitGrossMargin(newSellingPrice, newUnitCost)
  const monthlyImpact = (newUnitMargin - baseUnitMargin) * baseMonthlyUnits

  return {
    scenario_name: 'Maliyet Değişimi',
    delta_label: deltaLabel,
    new_selling_price: newSellingPrice,
    new_unit_cost: newUnitCost,
    new_gross_margin_pct: newMarginPct,
    margin_change_pp: marginChangePp,
    monthly_impact_try: monthlyImpact,
    is_positive: monthlyImpact > 0,
  }
}

/**
 * computeVolumeSensitivity
 * new_monthly_units: baseMonthlyUnits × (1 + volumeChangePct/100)
 * monthly_impact_try: (new_monthly - base_monthly) × unit_margin
 */
export function computeVolumeSensitivity(
  basePrice: number,
  baseCost: number,
  baseMonthlyUnits: number,
  volumeChangePct: number,
): { new_monthly_units: number; monthly_impact_try: number } {
  const newMonthlyUnits = baseMonthlyUnits * (1 + volumeChangePct / 100)
  const unitMargin = computeUnitGrossMargin(basePrice, baseCost)
  const monthlyImpact = (newMonthlyUnits - baseMonthlyUnits) * unitMargin

  return {
    new_monthly_units: newMonthlyUnits,
    monthly_impact_try: monthlyImpact,
  }
}

/**
 * computeBreakevenPrice
 * price = unitCost / (1 - targetMarginPct/100)
 * null if targetMarginPct >= 100
 */
export function computeBreakevenPrice(
  unitCost: number,
  targetMarginPct: number,
): number | null {
  if (targetMarginPct >= 100) return null
  return unitCost / (1 - targetMarginPct / 100)
}

/**
 * computeBreakevenCost
 * cost = sellingPrice × (1 - targetMarginPct/100)
 * Returns 0 if result < 0
 */
export function computeBreakevenCost(
  sellingPrice: number,
  targetMarginPct: number,
): number {
  const result = sellingPrice * (1 - targetMarginPct / 100)
  return result < 0 ? 0 : result
}

/**
 * computeMarginSafetyBuffer
 * currentMarginPct - targetMarginPct
 * null if currentMarginPct is null
 */
export function computeMarginSafetyBuffer(
  currentMarginPct: number | null,
  targetMarginPct: number,
): number | null {
  if (currentMarginPct === null) return null
  return currentMarginPct - targetMarginPct
}

/**
 * buildStandardSensitivityScenarios
 * Returns 8 standard scenarios:
 *   Price: +10%, +5%, -5%, -10%
 *   Cost:  +10%, +20%
 *   Combined: Price -5% AND Cost +10%
 *   Combined: Price +5% AND Cost -5%
 */
export function buildStandardSensitivityScenarios(
  basePrice: number,
  baseCost: number,
  baseMonthlyUnits: number,
): SensitivityResult[] {
  const baseMarginPct = computeUnitGrossMarginPct(basePrice, baseCost)
  const baseUnitMargin = computeUnitGrossMargin(basePrice, baseCost)

  function makeResult(
    scenarioName: string,
    deltaLabel: string,
    newPrice: number,
    newCost: number,
  ): SensitivityResult {
    const newMarginPct = computeUnitGrossMarginPct(newPrice, newCost)
    const marginChangePp =
      newMarginPct !== null && baseMarginPct !== null
        ? newMarginPct - baseMarginPct
        : null
    const newUnitMargin = computeUnitGrossMargin(newPrice, newCost)
    const monthlyImpact = (newUnitMargin - baseUnitMargin) * baseMonthlyUnits

    return {
      scenario_name: scenarioName,
      delta_label: deltaLabel,
      new_selling_price: newPrice,
      new_unit_cost: newCost,
      new_gross_margin_pct: newMarginPct,
      margin_change_pp: marginChangePp,
      monthly_impact_try: monthlyImpact,
      is_positive: monthlyImpact > 0,
    }
  }

  return [
    // Price scenarios
    makeResult('Fiyat Değişimi', '+10% Fiyat', basePrice * 1.1, baseCost),
    makeResult('Fiyat Değişimi', '+5% Fiyat',  basePrice * 1.05, baseCost),
    makeResult('Fiyat Değişimi', '-5% Fiyat',  basePrice * 0.95, baseCost),
    makeResult('Fiyat Değişimi', '-10% Fiyat', basePrice * 0.9,  baseCost),
    // Cost inflation scenarios
    makeResult('Maliyet Değişimi', '+10% Maliyet', basePrice, baseCost * 1.1),
    makeResult('Maliyet Değişimi', '+20% Maliyet', basePrice, baseCost * 1.2),
    // Combined scenarios
    makeResult('Rekabet Baskısı', '-5% Fiyat / +10% Maliyet', basePrice * 0.95, baseCost * 1.1),
    makeResult('Optimizasyon',    '+5% Fiyat / -5% Maliyet',  basePrice * 1.05, baseCost * 0.95),
  ]
}

/**
 * rankProductsByMarginRisk
 * Ranks products by sensitivity to cost inflation.
 * risk_level based on margin_drop_pp:
 *   critical: drop > 20pp OR new_margin < 0
 *   high:     drop > 10pp OR new_margin < 10
 *   medium:   drop > 5pp
 *   low:      otherwise
 */
export function rankProductsByMarginRisk(
  products: ProductBaseMetrics[],
  costInflationPct: number,
): Array<
  ProductBaseMetrics & {
    margin_at_inflation: number | null
    margin_drop_pp: number | null
    risk_level: 'low' | 'medium' | 'high' | 'critical'
  }
> {
  return products
    .map(p => {
      const newCost = p.avg_unit_cost * (1 + costInflationPct / 100)
      const marginAtInflation = computeUnitGrossMarginPct(p.avg_selling_price, newCost)
      const marginDropPp =
        marginAtInflation !== null && p.gross_margin_pct !== null
          ? p.gross_margin_pct - marginAtInflation
          : null

      let riskLevel: 'low' | 'medium' | 'high' | 'critical'
      if (
        (marginDropPp !== null && marginDropPp > 20) ||
        (marginAtInflation !== null && marginAtInflation < 0)
      ) {
        riskLevel = 'critical'
      } else if (
        (marginDropPp !== null && marginDropPp > 10) ||
        (marginAtInflation !== null && marginAtInflation < 10)
      ) {
        riskLevel = 'high'
      } else if (marginDropPp !== null && marginDropPp > 5) {
        riskLevel = 'medium'
      } else {
        riskLevel = 'low'
      }

      return {
        ...p,
        margin_at_inflation: marginAtInflation,
        margin_drop_pp: marginDropPp,
        risk_level: riskLevel,
      }
    })
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return order[a.risk_level] - order[b.risk_level]
    })
}

/**
 * computePortfolioSensitivity
 * Apply same price/cost change to all products, compute aggregate impact.
 */
export function computePortfolioSensitivity(
  products: ProductBaseMetrics[],
  priceChangePct: number,
  costChangePct: number,
): {
  baseline_monthly_margin: number
  new_monthly_margin: number
  total_impact_try: number
  impact_pct: number | null
} {
  let baselineMonthlyMargin = 0
  let newMonthlyMargin = 0

  for (const p of products) {
    const baseUnitMargin = computeUnitGrossMargin(p.avg_selling_price, p.avg_unit_cost)
    const newPrice = p.avg_selling_price * (1 + priceChangePct / 100)
    const newCost = p.avg_unit_cost * (1 + costChangePct / 100)
    const newUnitMargin = computeUnitGrossMargin(newPrice, newCost)

    baselineMonthlyMargin += baseUnitMargin * p.units_sold_monthly
    newMonthlyMargin += newUnitMargin * p.units_sold_monthly
  }

  const totalImpact = newMonthlyMargin - baselineMonthlyMargin
  const impactPct =
    baselineMonthlyMargin !== 0 ? (totalImpact / Math.abs(baselineMonthlyMargin)) * 100 : null

  return {
    baseline_monthly_margin: baselineMonthlyMargin,
    new_monthly_margin: newMonthlyMargin,
    total_impact_try: totalImpact,
    impact_pct: impactPct,
  }
}

/**
 * computeOptimalPriceForMargin
 * price = unitCost / (1 - targetMarginPct/100)
 * If competitorPrice is provided and result > competitorPrice: return competitorPrice
 * Rounded to 2 decimals.
 */
export function computeOptimalPriceForMargin(
  unitCost: number,
  targetMarginPct: number,
  competitorPrice: number | null = null,
): number {
  if (targetMarginPct >= 100) {
    return competitorPrice !== null ? Math.round(competitorPrice * 100) / 100 : Infinity
  }
  const rawPrice = unitCost / (1 - targetMarginPct / 100)
  const cappedPrice =
    competitorPrice !== null && rawPrice > competitorPrice ? competitorPrice : rawPrice
  return Math.round(cappedPrice * 100) / 100
}

/**
 * generateSensitivityNarrative
 * Turkish narrative summarizing portfolio risk under cost inflation.
 */
export function generateSensitivityNarrative(
  highRiskCount: number,
  totalProducts: number,
  portfolioImpact: ReturnType<typeof computePortfolioSensitivity>,
  costInflationPct: number,
): string {
  if (highRiskCount === 0) {
    return 'Maliyet artışlarına karşı portföy dayanıklılığı iyi.'
  }

  const riskPart = `%${costInflationPct} maliyet artışında ${highRiskCount}/${totalProducts} ürün yüksek risk altında.`

  if (portfolioImpact.total_impact_try < 0) {
    const impact = Math.abs(Math.round(portfolioImpact.total_impact_try)).toLocaleString('tr-TR')
    return `${riskPart} ₺${impact}/ay marjinal gelir kaybı öngörülüyor.`
  }

  return riskPart
}

// ── Internal helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

function isoDateMonthsBack(today: string, months: number): string {
  const d = new Date(today)
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ProductMarginSensitivityService {
  constructor(private readonly supabase: AnySupabase) {}

  async getReport(companyId: string): Promise<ProductMarginSensitivityReport> {
    const today    = new Date().toISOString().slice(0, 10)
    const fromDate = isoDateMonthsBack(today, 3)

    // ── 1. Sale items (last 3 months) ─────────────────────────────────────────
    const [saleItemsResult, allocationsResult] = await Promise.allSettled([
      this.supabase
        .from('sale_items')
        .select(`
          product_id,
          product_name,
          unit_price,
          qty,
          sale_id,
          sales!inner(sale_date, deleted_at, is_proforma, company_id)
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', fromDate)
        .lte('sales.sale_date', today),

      this.supabase
        .from('sale_item_allocations')
        .select('sale_id, product_id, qty_allocated, cost_price_try')
        .eq('company_id', companyId),
    ])

    // ── 2. Parse sale items ───────────────────────────────────────────────────

    interface SaleItemRow {
      product_id: string | null
      product_name: string | null
      unit_price: number | null
      qty: number | null
      sale_id: string | null
    }

    const saleItems: SaleItemRow[] =
      saleItemsResult.status === 'fulfilled' && !saleItemsResult.value.error
        ? (saleItemsResult.value.data ?? []).map((r: Record<string, unknown>) => ({
            product_id:   r.product_id   as string | null,
            product_name: r.product_name as string | null,
            unit_price:   r.unit_price   as number | null,
            qty:          r.qty          as number | null,
            sale_id:      r.sale_id      as string | null,
          }))
        : []

    interface AllocationRow {
      sale_id: string | null
      product_id: string | null
      qty_allocated: number | null
      cost_price_try: number | null
    }

    const allocations: AllocationRow[] =
      allocationsResult.status === 'fulfilled' && !allocationsResult.value.error
        ? (allocationsResult.value.data ?? [])
        : []

    // ── 3. Build FIFO cost lookup: product_id → avg cost ─────────────────────

    // cost per product: Σ(qty_allocated × cost_price_try) / Σ(qty_allocated)
    const costNumerator = new Map<string, number>()
    const costDenominator = new Map<string, number>()

    for (const a of allocations) {
      if (!a.product_id) continue
      const qty  = Number(a.qty_allocated ?? 0)
      const cost = Number(a.cost_price_try ?? 0)
      costNumerator.set(a.product_id, (costNumerator.get(a.product_id) ?? 0) + qty * cost)
      costDenominator.set(a.product_id, (costDenominator.get(a.product_id) ?? 0) + qty)
    }

    // ── 4. Aggregate sale items per product ───────────────────────────────────

    interface ProductAccum {
      product_name: string
      price_qty: number   // Σ(unit_price × qty)
      total_qty: number   // Σ(qty)
      order_count: number
    }

    const productMap = new Map<string, ProductAccum>()

    for (const item of saleItems) {
      const pid = item.product_id ?? `__name__${item.product_name ?? 'unknown'}`
      const qty = Number(item.qty ?? 0)
      const price = Number(item.unit_price ?? 0)
      const pname = item.product_name?.trim() || 'Bilinmeyen Ürün'

      const prev = productMap.get(pid) ?? {
        product_name: pname,
        price_qty: 0,
        total_qty: 0,
        order_count: 0,
      }

      productMap.set(pid, {
        product_name: pname,
        price_qty: prev.price_qty + price * qty,
        total_qty: prev.total_qty + qty,
        order_count: prev.order_count + 1,
      })
    }

    // ── 5. Build ProductBaseMetrics per product ───────────────────────────────

    // Period is 3 months → monthly avg = total / 3
    const MONTHS = 3

    const products: ProductBaseMetrics[] = Array.from(productMap.entries()).map(
      ([productId, acc]) => {
        const avgSellingPrice = acc.total_qty > 0 ? acc.price_qty / acc.total_qty : 0

        const costDenom = costDenominator.get(productId) ?? 0
        const costNum   = costNumerator.get(productId) ?? 0
        const avgUnitCost = costDenom > 0 ? costNum / costDenom : 0

        const unitsSoldMonthly = acc.total_qty / MONTHS
        const unitGrossMargin  = computeUnitGrossMargin(avgSellingPrice, avgUnitCost)
        const grossMarginTryMonthly = computeMonthlyMarginContribution(unitGrossMargin, unitsSoldMonthly)
        const grossMarginPct = computeUnitGrossMarginPct(avgSellingPrice, avgUnitCost)

        return {
          product_id: productId,
          product_name: acc.product_name,
          avg_selling_price: avgSellingPrice,
          avg_unit_cost: avgUnitCost,
          units_sold_monthly: unitsSoldMonthly,
          gross_margin_try_monthly: grossMarginTryMonthly,
          gross_margin_pct: grossMarginPct,
        }
      },
    )

    // Sort by monthly margin contribution descending
    products.sort((a, b) => b.gross_margin_try_monthly - a.gross_margin_try_monthly)

    // ── 6. Standard scenarios for top product by revenue ─────────────────────

    const topProduct = products[0] ?? null
    const standardScenarios: SensitivityResult[] = topProduct
      ? buildStandardSensitivityScenarios(
          topProduct.avg_selling_price,
          topProduct.avg_unit_cost,
          topProduct.units_sold_monthly,
        )
      : []

    // ── 7. Risk ranking ───────────────────────────────────────────────────────

    const riskRanking = rankProductsByMarginRisk(products, 10)

    // ── 8. Portfolio sensitivity ──────────────────────────────────────────────

    const portfolioSensitivity10 = computePortfolioSensitivity(products, 0, 10)
    const portfolioSensitivity20 = computePortfolioSensitivity(products, 0, 20)

    // ── 9. Narrative ──────────────────────────────────────────────────────────

    const highRiskCount = riskRanking.filter(
      p => p.risk_level === 'high' || p.risk_level === 'critical',
    ).length

    const narrative = generateSensitivityNarrative(
      highRiskCount,
      products.length,
      portfolioSensitivity10,
      10,
    )

    return {
      products,
      standard_scenarios: standardScenarios,
      risk_ranking: riskRanking,
      portfolio_sensitivity_10pct_cost: portfolioSensitivity10,
      portfolio_sensitivity_20pct_cost: portfolioSensitivity20,
      high_risk_product_count: highRiskCount,
      narrative,
    }
  }
}
