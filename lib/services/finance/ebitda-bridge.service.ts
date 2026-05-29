// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/ebitda-bridge.service.ts
//
// EBITDA Bridge Analysis
//
// Decomposes the change in EBITDA between two periods into:
//   1. Volume Effect    — revenue change × prior EBITDA margin
//   2. Price/Mix Effect — gross profit change from margin shift
//   3. Cost Effect      — opex efficiency vs revenue-adjusted prior
//   4. Residual Effect  — bridge reconciliation remainder
//
// Pure functions exported for testing.
// Class: EbitdaBridgeService → getReport(companyId): Promise<EbitdaBridgeReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Non-operating expense types (excluded from OpEx) ─────────────────────────

const NON_OPEX_TYPES = new Set([
  'partner_financing',
  'loan_repayment',
  'dividend',
  'internal_transfer',
  'partner_loan_interest',
  'tax',
])

// ── EBITDA Computation ────────────────────────────────────────────────────────

/**
 * Compute EBITDA: gross_profit - operating_expenses.
 * (We exclude D&A from operating expenses since we're computing EBITDA not EBIT)
 */
export function computeEbitda(grossProfit: number, operatingExpenses: number): number {
  return grossProfit - operatingExpenses
}

/**
 * Compute EBITDA margin: ebitda / revenue * 100.
 * Returns null if revenue === 0.
 */
export function computeEbitdaMargin(ebitda: number, revenue: number): number | null {
  if (revenue === 0) return null
  return (ebitda / revenue) * 100
}

// ── Bridge Components ─────────────────────────────────────────────────────────

/**
 * Compute volume effect on EBITDA.
 * volumeEffect = priorEbitdaMarginPct/100 * (currentRevenue - priorRevenue)
 * Tells us: how much of the EBITDA change is explained by volume/revenue alone?
 * Returns null if priorEbitdaMarginPct is null.
 */
export function computeVolumeEffect(
  priorRevenue: number,
  currentRevenue: number,
  priorEbitdaMarginPct: number | null,
): number | null {
  if (priorEbitdaMarginPct === null) return null
  return (priorEbitdaMarginPct / 100) * (currentRevenue - priorRevenue)
}

/**
 * Compute price/mix effect on gross profit.
 * priceMixEffect = currentRevenue * (currentGrossMarginPct - priorGrossMarginPct) / 100
 * Tells us: how much of gross profit change came from pricing or product mix shifts?
 * Returns null if either margin is null.
 */
export function computePriceMixEffect(
  currentRevenue: number,
  priorGrossMarginPct: number | null,
  currentGrossMarginPct: number | null,
): number | null {
  if (priorGrossMarginPct === null || currentGrossMarginPct === null) return null
  return currentRevenue * (currentGrossMarginPct - priorGrossMarginPct) / 100
}

/**
 * Compute cost efficiency effect on EBITDA.
 * costEffect = -(currentOpex - (currentRevenue * priorOpexRatio))
 * where priorOpexRatio = priorOpex / priorRevenue
 * Positive = cost savings vs revenue-adjusted prior period.
 * Returns null if priorRevenue === 0.
 */
export function computeCostEffect(
  priorRevenue: number,
  priorOpex: number,
  currentRevenue: number,
  currentOpex: number,
): number | null {
  if (priorRevenue === 0) return null
  const priorOpexRatio = priorOpex / priorRevenue
  return -(currentOpex - (currentRevenue * priorOpexRatio))
}

/**
 * Compute residual/other effect (bridge reconciliation).
 * residual = (currentEbitda - priorEbitda) - volumeEffect - priceMixEffect - costEffect
 * Should be close to 0 in a fully explained bridge.
 * Returns null if any input is null.
 */
export function computeResidualEffect(
  priorEbitda: number,
  currentEbitda: number,
  volumeEffect: number | null,
  priceMixEffect: number | null,
  costEffect: number | null,
): number | null {
  if (volumeEffect === null || priceMixEffect === null || costEffect === null) return null
  return (currentEbitda - priorEbitda) - volumeEffect - priceMixEffect - costEffect
}

// ── Bridge Validation ─────────────────────────────────────────────────────────

/**
 * Compute total EBITDA change: currentEbitda - priorEbitda.
 */
export function computeEbitdaChange(priorEbitda: number, currentEbitda: number): number {
  return currentEbitda - priorEbitda
}

/**
 * Validate bridge reconciliation: sum of effects should equal total change.
 * Returns the reconciliation gap (should be ~0).
 * Returns null if any effect is null.
 */
export function validateBridgeReconciliation(
  totalChange: number,
  volumeEffect: number | null,
  priceMixEffect: number | null,
  costEffect: number | null,
  residualEffect: number | null,
): number | null {
  if (
    volumeEffect === null ||
    priceMixEffect === null ||
    costEffect === null ||
    residualEffect === null
  ) return null
  return totalChange - (volumeEffect + priceMixEffect + costEffect + residualEffect)
}

/**
 * Classify EBITDA trend.
 * 'strong_growth': change_pct >= +25%
 * 'growth': change_pct >= +10%
 * 'stable': -10% to +10%
 * 'decline': -10% to -25%
 * 'severe_decline': < -25%
 * 'turnaround': priorEbitda < 0 AND currentEbitda > 0
 * 'deterioration': priorEbitda > 0 AND currentEbitda < 0
 * 'insufficient_data': priorEbitda === 0
 *
 * Priority: turnaround > deterioration > other classifications
 */
export function classifyEbitdaTrend(
  priorEbitda: number,
  currentEbitda: number,
): 'strong_growth' | 'growth' | 'stable' | 'decline' | 'severe_decline' | 'turnaround' | 'deterioration' | 'insufficient_data' {
  // Priority checks first
  if (priorEbitda < 0 && currentEbitda > 0) return 'turnaround'
  if (priorEbitda > 0 && currentEbitda < 0) return 'deterioration'
  if (priorEbitda === 0) return 'insufficient_data'

  const changePct = ((currentEbitda - priorEbitda) / Math.abs(priorEbitda)) * 100

  if (changePct >= 25)   return 'strong_growth'
  if (changePct >= 10)   return 'growth'
  if (changePct > -10)   return 'stable'
  if (changePct >= -25)  return 'decline'
  return 'severe_decline'
}

// ── Bridge Contribution Analysis ──────────────────────────────────────────────

/**
 * Compute contribution of each bridge component as % of total EBITDA change.
 * Returns null if totalChange === 0.
 */
export function computeBridgeContributions(
  totalChange: number,
  volumeEffect: number | null,
  priceMixEffect: number | null,
  costEffect: number | null,
): {
  volume_contribution_pct: number | null
  price_mix_contribution_pct: number | null
  cost_contribution_pct: number | null
} | null {
  if (totalChange === 0) return null
  return {
    volume_contribution_pct:    volumeEffect    !== null ? (volumeEffect    / totalChange) * 100 : null,
    price_mix_contribution_pct: priceMixEffect  !== null ? (priceMixEffect  / totalChange) * 100 : null,
    cost_contribution_pct:      costEffect      !== null ? (costEffect      / totalChange) * 100 : null,
  }
}

/**
 * Identify the primary driver of EBITDA change.
 * Returns the component with the largest absolute contribution.
 * Returns 'volume' | 'price_mix' | 'cost' | 'mixed' | 'insufficient_data'
 */
export function identifyPrimaryDriver(
  volumeEffect: number | null,
  priceMixEffect: number | null,
  costEffect: number | null,
): 'volume' | 'price_mix' | 'cost' | 'mixed' | 'insufficient_data' {
  if (volumeEffect === null && priceMixEffect === null && costEffect === null) {
    return 'insufficient_data'
  }

  const absVol      = volumeEffect    !== null ? Math.abs(volumeEffect)    : -Infinity
  const absPriceMix = priceMixEffect  !== null ? Math.abs(priceMixEffect)  : -Infinity
  const absCost     = costEffect      !== null ? Math.abs(costEffect)      : -Infinity

  const maxAbs = Math.max(absVol, absPriceMix, absCost)

  if (maxAbs <= 0) return 'mixed'

  // Check if two or more are tied as the max (within 5% of each other)
  const leaders = [
    { name: 'volume'    as const, abs: absVol      },
    { name: 'price_mix' as const, abs: absPriceMix },
    { name: 'cost'      as const, abs: absCost      },
  ].filter(x => x.abs !== -Infinity && maxAbs > 0 && x.abs >= maxAbs * 0.95)

  if (leaders.length > 1) return 'mixed'

  return leaders[0]?.name ?? 'insufficient_data'
}

/**
 * Classify EBITDA margin health.
 * 'excellent': >= 25%
 * 'good': >= 15%
 * 'moderate': >= 8%
 * 'low': >= 3%
 * 'negative': < 3% (below Turkish SME sustainable minimum)
 * Returns 'insufficient_data' if null.
 */
export function classifyEbitdaMarginHealth(
  ebitdaMarginPct: number | null,
): 'excellent' | 'good' | 'moderate' | 'low' | 'negative' | 'insufficient_data' {
  if (ebitdaMarginPct === null) return 'insufficient_data'
  if (ebitdaMarginPct >= 25) return 'excellent'
  if (ebitdaMarginPct >= 15) return 'good'
  if (ebitdaMarginPct >= 8)  return 'moderate'
  if (ebitdaMarginPct >= 3)  return 'low'
  return 'negative'
}

/**
 * Generate Turkish bridge narrative.
 */
export function generateBridgeNarrative(
  trend: ReturnType<typeof classifyEbitdaTrend>,
  primaryDriver: ReturnType<typeof identifyPrimaryDriver>,
  totalChange: number,
  currentEbitdaMarginPct: number | null,
): string {
  const marginStr = currentEbitdaMarginPct !== null
    ? ` (FAVÖK marjı: %${currentEbitdaMarginPct.toFixed(1)})`
    : ''

  const changeAbs   = Math.abs(totalChange)
  const changeSign  = totalChange >= 0 ? '+' : '-'
  const changeLabel = `${changeSign}${changeAbs.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`

  if (trend === 'insufficient_data') {
    return 'FAVÖK analizi için yeterli veri bulunmuyor. Satış ve gider kayıtları tamamlandığında otomatik hesaplanacak.'
  }

  if (trend === 'turnaround') {
    return `Şirket negatif FAVÖK'ten pozitif FAVÖK'e geçiş yaptı — önemli bir iyileşme sinyali${marginStr}.`
  }

  if (trend === 'deterioration') {
    return `FAVÖK pozitiften negatife döndü (${changeLabel}). Gelir-gider dengesi acil inceleme gerektiriyor.`
  }

  const driverText: Record<ReturnType<typeof identifyPrimaryDriver>, string> = {
    volume:            'hacim değişimi',
    price_mix:         'fiyat/ürün karması',
    cost:              'maliyet verimliliği',
    mixed:             'birden fazla etken',
    insufficient_data: 'belirsiz etkenler',
  }

  const trendText: Record<string, string> = {
    strong_growth:  `güçlü büyüme kaydetti (${changeLabel})`,
    growth:         `büyüme gösterdi (${changeLabel})`,
    stable:         `stabil seyretti (${changeLabel})`,
    decline:        `geriledi (${changeLabel})`,
    severe_decline: `ciddi düşüş yaşadı (${changeLabel})`,
  }

  const driver = driverText[primaryDriver] ?? 'bilinmeyen etkenler'
  const trendDesc = trendText[trend] ?? `değişti (${changeLabel})`

  if (trend === 'severe_decline') {
    return `FAVÖK ${trendDesc}. Birincil etken: ${driver}. Önlem alınmazsa sürdürülebilirlik riski oluşabilir.`
  }

  if (trend === 'strong_growth') {
    return `FAVÖK ${trendDesc}${marginStr}. Birincil büyüme etkeni: ${driver}.`
  }

  return `FAVÖK ${trendDesc}${marginStr}. Birincil etken: ${driver}.`
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface EbitdaBridgeReport {
  as_of_date: string

  // Prior period (M-2 to M-1, i.e. 2 months ago vs last month)
  prior_period: string          // e.g. "2026-03"
  current_period: string        // e.g. "2026-04" (last full month)

  // Period financials
  prior: {
    revenue: number
    gross_profit: number
    gross_margin_pct: number | null
    opex: number
    ebitda: number
    ebitda_margin_pct: number | null
  }

  current: {
    revenue: number
    gross_profit: number
    gross_margin_pct: number | null
    opex: number
    ebitda: number
    ebitda_margin_pct: number | null
  }

  // Bridge
  bridge: {
    total_ebitda_change: number
    volume_effect: number | null
    price_mix_effect: number | null
    cost_effect: number | null
    residual_effect: number | null
    reconciliation_gap: number | null   // should be ~0
  }

  // Analysis
  trend: ReturnType<typeof classifyEbitdaTrend>
  primary_driver: ReturnType<typeof identifyPrimaryDriver>
  current_margin_health: ReturnType<typeof classifyEbitdaMarginHealth>
  contributions: ReturnType<typeof computeBridgeContributions>

  narrative: string
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function monthBounds(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${yearMonth}-01`,
    to:   `${yearMonth}-${String(lastDay).padStart(2, '0')}`,
  }
}

function toYearMonth(year: number, month: number): string {
  // month is 0-based (JS Date)
  const m = ((month % 12) + 12) % 12
  const y = year + Math.floor(month / 12)
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// ── Service class ──────────────────────────────────────────────────────────────

export class EbitdaBridgeService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<EbitdaBridgeReport> {
    const today = new Date()

    // Current = last full month (month - 1, 0-based)
    const currentYM = toYearMonth(today.getFullYear(), today.getMonth() - 1)
    // Prior = 2 months ago (month - 2, 0-based)
    const priorYM   = toYearMonth(today.getFullYear(), today.getMonth() - 2)

    const [currentResult, priorResult] = await Promise.allSettled([
      this.fetchMonthData(companyId, currentYM),
      this.fetchMonthData(companyId, priorYM),
    ])

    const currentData = currentResult.status === 'fulfilled'
      ? currentResult.value
      : { revenue: 0, cogs: 0, opex: 0 }

    const priorData = priorResult.status === 'fulfilled'
      ? priorResult.value
      : { revenue: 0, cogs: 0, opex: 0 }

    // Compute period financials
    const currentGrossProfit = currentData.revenue - currentData.cogs
    const priorGrossProfit   = priorData.revenue   - priorData.cogs

    const currentGrossMarginPct = currentData.revenue > 0
      ? (currentGrossProfit / currentData.revenue) * 100
      : null

    const priorGrossMarginPct = priorData.revenue > 0
      ? (priorGrossProfit / priorData.revenue) * 100
      : null

    const currentEbitda = computeEbitda(currentGrossProfit, currentData.opex)
    const priorEbitda   = computeEbitda(priorGrossProfit,   priorData.opex)

    const currentEbitdaMarginPct = computeEbitdaMargin(currentEbitda, currentData.revenue)
    const priorEbitdaMarginPct   = computeEbitdaMargin(priorEbitda,   priorData.revenue)

    // Bridge computation
    const totalEbitdaChange = computeEbitdaChange(priorEbitda, currentEbitda)

    const volumeEffect   = computeVolumeEffect(priorData.revenue, currentData.revenue, priorEbitdaMarginPct)
    const priceMixEffect = computePriceMixEffect(currentData.revenue, priorGrossMarginPct, currentGrossMarginPct)
    const costEffect     = computeCostEffect(priorData.revenue, priorData.opex, currentData.revenue, currentData.opex)
    const residualEffect = computeResidualEffect(priorEbitda, currentEbitda, volumeEffect, priceMixEffect, costEffect)

    const reconciliationGap = validateBridgeReconciliation(
      totalEbitdaChange,
      volumeEffect,
      priceMixEffect,
      costEffect,
      residualEffect,
    )

    // Analysis
    const trend               = classifyEbitdaTrend(priorEbitda, currentEbitda)
    const primaryDriver       = identifyPrimaryDriver(volumeEffect, priceMixEffect, costEffect)
    const currentMarginHealth = classifyEbitdaMarginHealth(currentEbitdaMarginPct)
    const contributions       = computeBridgeContributions(totalEbitdaChange, volumeEffect, priceMixEffect, costEffect)

    const narrative = generateBridgeNarrative(
      trend,
      primaryDriver,
      totalEbitdaChange,
      currentEbitdaMarginPct,
    )

    return {
      as_of_date:     today.toISOString().slice(0, 10),
      prior_period:   priorYM,
      current_period: currentYM,

      prior: {
        revenue:           priorData.revenue,
        gross_profit:      priorGrossProfit,
        gross_margin_pct:  priorGrossMarginPct,
        opex:              priorData.opex,
        ebitda:            priorEbitda,
        ebitda_margin_pct: priorEbitdaMarginPct,
      },

      current: {
        revenue:           currentData.revenue,
        gross_profit:      currentGrossProfit,
        gross_margin_pct:  currentGrossMarginPct,
        opex:              currentData.opex,
        ebitda:            currentEbitda,
        ebitda_margin_pct: currentEbitdaMarginPct,
      },

      bridge: {
        total_ebitda_change: totalEbitdaChange,
        volume_effect:       volumeEffect,
        price_mix_effect:    priceMixEffect,
        cost_effect:         costEffect,
        residual_effect:     residualEffect,
        reconciliation_gap:  reconciliationGap,
      },

      trend,
      primary_driver:       primaryDriver,
      current_margin_health: currentMarginHealth,
      contributions,
      narrative,
    }
  }

  private async fetchMonthData(
    companyId: string,
    yearMonth: string,
  ): Promise<{ revenue: number; cogs: number; opex: number }> {
    const { from, to } = monthBounds(yearMonth)

    // 1. Revenue from sales
    const salesQ = this.supabase
      .from('sales')
      .select('total_try, total_cost')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')

    // 2. Sale IDs for COGS lookup
    const saleIdsQ = this.supabase
      .from('sales')
      .select('id, total_cost')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // 3. Expenses
    const expQ = this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    const [salesRes, saleIdsRes, expRes] = await Promise.allSettled([salesQ, saleIdsQ, expQ])

    // Revenue
    const salesData = salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []
    const revenue = salesData.reduce(
      (s: number, r: Record<string, unknown>) => s + Number(r.total_try ?? 0),
      0,
    )

    // COGS: try sale_item_allocations first, fallback to total_cost, then 60% of revenue
    let cogs = 0
    const saleRows = saleIdsRes.status === 'fulfilled' ? (saleIdsRes.value.data ?? []) : []
    const saleIds  = saleRows.map((r: Record<string, unknown>) => String(r.id))

    if (saleIds.length > 0) {
      const saleItemsRes = await this.supabase
        .from('sale_items')
        .select('id')
        .eq('company_id', companyId)
        .in('sale_id', saleIds)
        .limit(10000)

      const saleItemIds = (saleItemsRes.data ?? []).map(
        (si: Record<string, unknown>) => String(si.id),
      )

      let cogsFromAllocations = 0
      if (saleItemIds.length > 0) {
        const allocRes = await this.supabase
          .from('sale_item_allocations')
          .select('qty_allocated, cost_price_try, stock_lots(cost_price_try)')
          .eq('company_id', companyId)
          .in('sale_item_id', saleItemIds)
          .limit(20000)

        for (const r of (allocRes.data ?? [])) {
          const lot      = r.stock_lots as { cost_price_try?: number } | null
          const unitCost =
            r.cost_price_try !== null && r.cost_price_try !== undefined
              ? Number(r.cost_price_try)
              : lot?.cost_price_try !== undefined
              ? Number(lot.cost_price_try)
              : 0
          cogsFromAllocations += Number(r.qty_allocated ?? 0) * unitCost
        }
      }

      if (cogsFromAllocations > 0) {
        cogs = cogsFromAllocations
      } else {
        // Fallback: sum total_cost from sales rows
        const cogsFromSales = saleRows.reduce(
          (s: number, r: Record<string, unknown>) => s + Number(r.total_cost ?? 0),
          0,
        )
        cogs = cogsFromSales > 0 ? cogsFromSales : revenue * 0.6
      }
    } else if (revenue > 0) {
      cogs = revenue * 0.6
    }

    // OpEx: exclude non-operating types
    let opex = 0
    const expData = expRes.status === 'fulfilled' ? (expRes.value.data ?? []) : []
    for (const row of expData) {
      const t      = String((row as Record<string, unknown>).expense_type ?? '')
      const amount = Number((row as Record<string, unknown>).amount_try ?? 0)
      if (NON_OPEX_TYPES.has(t)) continue
      opex += amount
    }

    return { revenue, cogs, opex }
  }
}
