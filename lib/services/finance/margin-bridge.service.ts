// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/margin-bridge.service.ts
//
// Gross Margin Bridge Analysis — Price / Volume / Mix Decomposition
//
// Decomposes the change in gross profit between two periods into:
//   1. Price Effect   — change in avg selling price × prior volume
//   2. Volume Effect  — prior margin per unit × change in volume
//   3. Mix Effect     — residual = total_change − price_effect − volume_effect
//
// Pure functions exported for testing:
//   computePriceEffect           — price × qty decomposition
//   computeVolumeEffect          — volume change at prior margin
//   computeMixEffect             — residual effect
//   classifyBridgeComponent      — favorable | unfavorable | neutral
//   computeGrossProfitChangePct  — % change (null if prior = 0)
//
// Class: MarginBridgeService
//   getReport(companyId, currentPeriod?, priorPeriod?)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BridgeComponent {
  label: string                               // "Fiyat Etkisi", "Hacim Etkisi", "Karışım Etkisi"
  amount_try: number
  direction: 'favorable' | 'unfavorable' | 'neutral'
  pct_of_revenue: number                      // as % of current period revenue
}

export interface MarginBridgeReport {
  current_period_key: string
  prior_period_key: string
  current_period_label: string
  prior_period_label: string

  prior_revenue_try: number
  current_revenue_try: number
  revenue_change_try: number

  prior_gross_profit_try: number
  current_gross_profit_try: number
  gross_profit_change_try: number
  gross_profit_change_pct: number | null

  prior_gross_margin_pct: number
  current_gross_margin_pct: number

  bridge: {
    price_effect: BridgeComponent
    volume_effect: BridgeComponent
    mix_effect: BridgeComponent
  }

  dominant_driver: 'price' | 'volume' | 'mix' | 'balanced'
  narrative: string   // Turkish 1-sentence summary
}

// ── Turkish month names ───────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat',   '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs',   '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function periodLabel(periodKey: string): string {
  const [year, month] = periodKey.split('-')
  return `${MONTH_NAMES[month] ?? month} ${year}`
}

function priorMonth(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function periodBounds(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${periodKey}-01`,
    to:   `${periodKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computePriceEffect
 *
 * Price effect = change in avg selling price × prior quantity.
 * Captures the GP impact of pricing decisions, holding volume constant.
 *
 *   = (currentAvgPrice - priorAvgPrice) × priorQty
 */
export function computePriceEffect(
  currentAvgPrice: number,
  priorAvgPrice: number,
  priorQty: number,
): number {
  return (currentAvgPrice - priorAvgPrice) * priorQty
}

/**
 * computeVolumeEffect
 *
 * Volume effect = prior gross margin per unit × change in volume.
 * Captures the GP impact of selling more or fewer units, holding price constant.
 *
 *   = priorGrossMarginPerUnit × (currentQty - priorQty)
 */
export function computeVolumeEffect(
  priorGrossMarginPerUnit: number,
  currentQty: number,
  priorQty: number,
): number {
  return priorGrossMarginPerUnit * (currentQty - priorQty)
}

/**
 * computeMixEffect
 *
 * Mix effect = residual after price and volume effects.
 * Captures the GP impact of shifting product mix (e.g., more high-margin items).
 *
 *   = totalGrossProfitChange - priceEffect - volumeEffect
 */
export function computeMixEffect(
  totalGrossProfitChange: number,
  priceEffect: number,
  volumeEffect: number,
): number {
  return totalGrossProfitChange - priceEffect - volumeEffect
}

/**
 * classifyBridgeComponent
 *
 * Classifies a bridge effect as favorable, unfavorable, or neutral.
 * neutral: |effect / revenue| ≤ 1%
 * favorable: effect > 0
 * unfavorable: effect < 0
 */
export function classifyBridgeComponent(
  effectTry: number,
  totalRevenueTry: number,
): 'favorable' | 'unfavorable' | 'neutral' {
  if (totalRevenueTry === 0) return effectTry === 0 ? 'neutral' : effectTry > 0 ? 'favorable' : 'unfavorable'
  const pct = Math.abs(effectTry / totalRevenueTry) * 100
  if (pct <= 1) return 'neutral'
  return effectTry > 0 ? 'favorable' : 'unfavorable'
}

/**
 * computeGrossProfitChangePct
 *
 * Returns % change in gross profit: (current - prior) / |prior| × 100.
 * Returns null when priorGrossProfit = 0 (no meaningful base).
 */
export function computeGrossProfitChangePct(
  currentGrossProfitTry: number,
  priorGrossProfitTry: number,
): number | null {
  if (priorGrossProfitTry === 0) return null
  return ((currentGrossProfitTry - priorGrossProfitTry) / Math.abs(priorGrossProfitTry)) * 100
}

// ── Internal data types ───────────────────────────────────────────────────────

interface PeriodMetrics {
  revenue: number
  cogs:    number
  qty:     number
}

// ── Service class ─────────────────────────────────────────────────────────────

export class MarginBridgeService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Fetch period metrics: revenue, COGS (via allocations), and total qty sold.
   */
  private async fetchPeriodMetrics(
    companyId: string,
    from: string,
    to: string,
  ): Promise<PeriodMetrics> {
    let revenue = 0
    let cogs    = 0
    let qty     = 0

    // ── 1. Revenue + Qty from sale_items ──────────────────────────────────────
    try {
      const { data } = await this.supabase
        .from('sale_items')
        .select(`
          total_try,
          qty,
          sale_id,
          product_id,
          sales!inner(
            sale_date,
            deleted_at,
            is_proforma,
            company_id,
            payment_status
          )
        `)
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .not('sales.payment_status', 'eq', 'cancelled')
        .gte('sales.sale_date', from)
        .lte('sales.sale_date', to)

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of data as Array<Record<string, any>>) {
          revenue += Number(row.total_try ?? 0)
          qty     += Number(row.qty       ?? 0)
        }
      }
    } catch {
      // fallback: leave at 0
    }

    // ── 2. COGS via sale_item_allocations ─────────────────────────────────────
    try {
      const { data } = await this.supabase
        .from('sale_item_allocations')
        .select('qty_allocated, cost_price_try')
        .eq('company_id', companyId)
        .gte('created_at', from + 'T00:00:00')
        .lte('created_at', to   + 'T23:59:59')

      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const row of data as Array<Record<string, any>>) {
          cogs += Number(row.qty_allocated ?? 0) * Number(row.cost_price_try ?? 0)
        }
      }
    } catch {
      // fallback: leave at 0
    }

    return { revenue, cogs, qty }
  }

  /**
   * Build MarginBridgeReport for two periods.
   * Defaults: current month vs prior month.
   */
  async getReport(
    companyId: string,
    currentPeriod?: string,
    priorPeriod?: string,
  ): Promise<MarginBridgeReport> {
    const currentKey = currentPeriod ?? currentMonthKey()
    const priorKey   = priorPeriod   ?? priorMonth(currentKey)

    const currentBounds = periodBounds(currentKey)
    const priorBounds   = periodBounds(priorKey)

    const [current, prior] = await Promise.all([
      this.fetchPeriodMetrics(companyId, currentBounds.from, currentBounds.to),
      this.fetchPeriodMetrics(companyId, priorBounds.from,   priorBounds.to),
    ])

    // ── Derived metrics ───────────────────────────────────────────────────────

    const currentGP = current.revenue - current.cogs
    const priorGP   = prior.revenue   - prior.cogs

    const gpChange = currentGP - priorGP

    const currentAvgPrice = current.qty > 0 ? current.revenue / current.qty : 0
    const priorAvgPrice   = prior.qty   > 0 ? prior.revenue   / prior.qty   : 0

    const currentGpPerUnit = current.qty > 0 ? currentGP / current.qty : 0
    const priorGpPerUnit   = prior.qty   > 0 ? priorGP   / prior.qty   : 0
    void currentGpPerUnit   // intentionally unused in formulas (priorGpPerUnit is the anchor)

    // ── Bridge effects ────────────────────────────────────────────────────────

    const priceEffect  = computePriceEffect(currentAvgPrice, priorAvgPrice, prior.qty)
    const volumeEffect = computeVolumeEffect(priorGpPerUnit, current.qty, prior.qty)
    const mixEffect    = computeMixEffect(gpChange, priceEffect, volumeEffect)

    // ── Component labels + classify ───────────────────────────────────────────

    const revBase = current.revenue || 1  // avoid /0 in pct_of_revenue

    function makeBridgeComponent(
      label: string,
      amount: number,
    ): BridgeComponent {
      return {
        label,
        amount_try:      amount,
        direction:       classifyBridgeComponent(amount, revBase),
        pct_of_revenue:  current.revenue > 0 ? (amount / current.revenue) * 100 : 0,
      }
    }

    const bridge = {
      price_effect:  makeBridgeComponent('Fiyat Etkisi',   priceEffect),
      volume_effect: makeBridgeComponent('Hacim Etkisi',   volumeEffect),
      mix_effect:    makeBridgeComponent('Karışım Etkisi', mixEffect),
    }

    // ── Dominant driver ───────────────────────────────────────────────────────

    const absPrice  = Math.abs(priceEffect)
    const absVolume = Math.abs(volumeEffect)
    const absMix    = Math.abs(mixEffect)
    const maxEffect = Math.max(absPrice, absVolume, absMix)

    let dominant_driver: MarginBridgeReport['dominant_driver'] = 'balanced'
    if (maxEffect > 0) {
      // balanced = all within 10% of each other
      const threshold = maxEffect * 0.1
      const allClose  =
        Math.abs(absPrice  - absVolume) <= threshold &&
        Math.abs(absVolume - absMix)    <= threshold &&
        Math.abs(absPrice  - absMix)    <= threshold
      if (!allClose) {
        if (absPrice  === maxEffect) dominant_driver = 'price'
        else if (absVolume === maxEffect) dominant_driver = 'volume'
        else dominant_driver = 'mix'
      }
    }

    // ── Narrative ─────────────────────────────────────────────────────────────

    const gpChangePct = computeGrossProfitChangePct(currentGP, priorGP)
    const driverLabel: Record<MarginBridgeReport['dominant_driver'], string> = {
      price:    'fiyat',
      volume:   'hacim',
      mix:      'karışım',
      balanced: 'dengeli',
    }
    const directionLabel = gpChange >= 0 ? 'iyileşti' : 'geriledi'
    const changePctStr   = gpChangePct !== null
      ? ` (%${Math.abs(gpChangePct).toFixed(1)})`
      : ''
    const dominantAmt = dominant_driver === 'price'   ? priceEffect
                      : dominant_driver === 'volume'  ? volumeEffect
                      : dominant_driver === 'mix'     ? mixEffect
                      : gpChange
    const amtStr = `${Math.abs(dominantAmt) >= 1000
      ? (Math.abs(dominantAmt) / 1000).toFixed(1) + 'K'
      : Math.abs(dominantAmt).toFixed(0)}₺`

    const narrative =
      `${periodLabel(currentKey)} döneminde brüt kâr marjı ${directionLabel}${changePctStr} ` +
      `— ağırlıklı etken ${driverLabel[dominant_driver]} etkisi (${amtStr}).`

    // ── Margin percentages ────────────────────────────────────────────────────

    const currentGmPct = current.revenue > 0 ? (currentGP / current.revenue) * 100 : 0
    const priorGmPct   = prior.revenue   > 0 ? (priorGP   / prior.revenue)   * 100 : 0

    return {
      current_period_key:   currentKey,
      prior_period_key:     priorKey,
      current_period_label: periodLabel(currentKey),
      prior_period_label:   periodLabel(priorKey),

      prior_revenue_try:        prior.revenue,
      current_revenue_try:      current.revenue,
      revenue_change_try:       current.revenue - prior.revenue,

      prior_gross_profit_try:   priorGP,
      current_gross_profit_try: currentGP,
      gross_profit_change_try:  gpChange,
      gross_profit_change_pct:  gpChangePct,

      prior_gross_margin_pct:   priorGmPct,
      current_gross_margin_pct: currentGmPct,

      bridge,
      dominant_driver,
      narrative,
    }
  }
}
