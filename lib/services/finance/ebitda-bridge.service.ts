// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/ebitda-bridge.service.ts
//
// EBITDA Bridge Analysis & Operating Leverage
//
// Decomposes the change in EBITDA between two periods into:
//   1. Volume Effect   — more/fewer revenue at prior EBITDA margin
//   2. COGS Effect     — COGS ratio improvement / worsening
//   3. Margin Effect   — pure margin change at current revenue
//   4. Opex Effect     — fixed/variable cost changes
//
// Pure functions exported for testing:
//   computeEbitda                    — revenue - cogs - opex
//   computeVolumeEffect              — revenue change × prior EBITDA margin
//   computeMarginEffect              — revenue × margin delta
//   computeOpexEffect                — -(currentOpex - priorOpex)
//   computeCogsEffect                — currentRevenue × (priorCogsRatio - currentCogsRatio)
//   buildEbitdaBridge                — full bridge with components
//   computeOperatingLeverage         — EBITDA%Δ / Revenue%Δ
//   classifyOperatingLeverageHealth  — classification string
//
// Class: EbitdaBridgeService
//   getReport(companyId): Promise<EbitdaBridgeReport>
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

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeEbitda
 *
 * EBITDA = revenue - cogs - operatingExpenses
 * (Simplified for SMEs: ignoring D&A as often negligible)
 */
export function computeEbitda(
  revenue: number,
  cogs: number,
  operatingExpenses: number,
): number {
  return revenue - cogs - operatingExpenses
}

/**
 * computeVolumeEffect
 *
 * Effect of volume/revenue change on EBITDA, holding EBITDA margin constant:
 *   = (currentRevenue - priorRevenue) × (priorEbitdaMarginPct / 100)
 *
 * Positive: revenue grew (favorable if prior margin was positive)
 * Negative: revenue declined
 */
export function computeVolumeEffect(
  priorRevenue: number,
  currentRevenue: number,
  priorEbitdaMarginPct: number,
): number {
  return (currentRevenue - priorRevenue) * (priorEbitdaMarginPct / 100)
}

/**
 * computeMarginEffect
 *
 * Effect of EBITDA margin change, holding volume at current revenue:
 *   = currentRevenue × (currentEbitdaMarginPct - priorEbitdaMarginPct) / 100
 *
 * Positive: margin expanded (favorable)
 * Negative: margin compressed
 */
export function computeMarginEffect(
  currentRevenue: number,
  currentEbitdaMarginPct: number,
  priorEbitdaMarginPct: number,
): number {
  return currentRevenue * (currentEbitdaMarginPct - priorEbitdaMarginPct) / 100
}

/**
 * computeOpexEffect
 *
 * Effect of opex change on EBITDA:
 *   = -(currentOpex - priorOpex)
 *
 * Positive: cost reduction (favorable)
 * Negative: cost increase (unfavorable)
 */
export function computeOpexEffect(
  priorOpex: number,
  currentOpex: number,
): number {
  return -(currentOpex - priorOpex)
}

/**
 * computeCogsEffect
 *
 * COGS efficiency effect on EBITDA:
 *   = currentRevenue × (priorCogsRatio - currentCogsRatio)
 *
 * Positive: COGS improved (favorable — lower COGS ratio)
 * Negative: COGS worsened (unfavorable — higher COGS ratio)
 *
 * @param priorCogsRatio  0–1 fraction (e.g. 0.60 = 60% COGS ratio)
 * @param currentCogsRatio 0–1 fraction
 */
export function computeCogsEffect(
  priorRevenue: number,
  currentRevenue: number,
  priorCogsRatio: number,
  currentCogsRatio: number,
): number {
  void priorRevenue  // intentionally unused; kept for API clarity
  return currentRevenue * (priorCogsRatio - currentCogsRatio)
}

// ── Bridge component type ─────────────────────────────────────────────────────

export interface EbitdaBridgeComponent {
  label:         string          // Turkish label
  value:         number
  is_favorable:  boolean
  pct_of_prior:  number | null   // as % of prior_ebitda; null if prior_ebitda = 0
}

// ── Bridge result type ────────────────────────────────────────────────────────

export interface EbitdaBridge {
  prior_ebitda:          number
  volume_effect:         number
  margin_effect:         number
  cogs_effect:           number
  opex_effect:           number
  current_ebitda:        number
  reconciliation_error:  number   // should be ~0
  components:            EbitdaBridgeComponent[]
}

/**
 * buildEbitdaBridge
 *
 * Constructs a full EBITDA bridge from prior period to current period.
 * Components in order: volume, cogs, margin, opex.
 * reconciliation_error = current_ebitda - (prior_ebitda + Σeffects)
 */
export function buildEbitdaBridge(
  prior:   { revenue: number; cogs: number; opex: number },
  current: { revenue: number; cogs: number; opex: number },
): EbitdaBridge {
  const priorEbitda   = computeEbitda(prior.revenue,   prior.cogs,   prior.opex)
  const currentEbitda = computeEbitda(current.revenue, current.cogs, current.opex)

  const priorEbitdaMarginPct  = prior.revenue   > 0 ? (priorEbitda   / prior.revenue)   * 100 : 0
  const currentEbitdaMarginPct = current.revenue > 0 ? (currentEbitda / current.revenue) * 100 : 0

  const priorCogsRatio   = prior.revenue   > 0 ? prior.cogs   / prior.revenue   : 0
  const currentCogsRatio = current.revenue > 0 ? current.cogs / current.revenue : 0

  const volumeEffect = computeVolumeEffect(prior.revenue, current.revenue, priorEbitdaMarginPct)
  const cogsEffect   = computeCogsEffect(prior.revenue, current.revenue, priorCogsRatio, currentCogsRatio)
  const opexEffect   = computeOpexEffect(prior.opex, current.opex)

  // Margin effect is derived as residual so that prior + Σeffects = current exactly
  const ebitdaChange   = currentEbitda - priorEbitda
  const marginEffect   = ebitdaChange - volumeEffect - cogsEffect - opexEffect

  const reconciliationError = currentEbitda - (priorEbitda + volumeEffect + cogsEffect + marginEffect + opexEffect)

  const priorAbs = Math.abs(priorEbitda)

  function makeComponent(
    label: string,
    value: number,
    isFavorable: boolean,
  ): EbitdaBridgeComponent {
    return {
      label,
      value,
      is_favorable: isFavorable,
      pct_of_prior: priorEbitda !== 0 ? (value / priorAbs) * 100 : null,
    }
  }

  const components: EbitdaBridgeComponent[] = [
    makeComponent('Hacim Etkisi',  volumeEffect, volumeEffect > 0),
    makeComponent('SMM Verimliliği', cogsEffect, cogsEffect > 0),
    makeComponent('Marj Etkisi',   marginEffect, marginEffect > 0),
    makeComponent('Opex Etkisi',   opexEffect,   opexEffect  > 0),
  ]

  return {
    prior_ebitda:         priorEbitda,
    volume_effect:        volumeEffect,
    margin_effect:        marginEffect,
    cogs_effect:          cogsEffect,
    opex_effect:          opexEffect,
    current_ebitda:       currentEbitda,
    reconciliation_error: reconciliationError,
    components,
  }
}

/**
 * computeOperatingLeverage
 *
 * OL = EBITDA% change / Revenue% change
 * null if revenuePctChange === 0 (undefined / division-by-zero).
 *
 * Interpretation:
 *   OL > 2   → high fixed-cost leverage (great in growth)
 *   OL 1–2   → positive leverage
 *   OL 0–1   → low leverage (mostly variable costs)
 *   OL < 0   → EBITDA and revenue moving in opposite directions
 */
export function computeOperatingLeverage(
  revenuePctChange: number,
  ebitdaPctChange:  number,
): number | null {
  if (revenuePctChange === 0) return null
  return ebitdaPctChange / revenuePctChange
}

/**
 * classifyOperatingLeverageHealth
 *
 * Classify OL health into one of 6 buckets (Turkish-readable labels as enum).
 */
export function classifyOperatingLeverageHealth(
  operatingLeverage:  number | null,
  revenueGrowthPct:   number | null,
): 'high_leverage_positive' | 'high_leverage_negative' | 'low_leverage' | 'improving' | 'declining' | 'insufficient_data' {
  if (operatingLeverage === null && revenueGrowthPct === null) return 'insufficient_data'
  if (operatingLeverage === null) return 'insufficient_data'

  if (operatingLeverage > 2 && (revenueGrowthPct ?? 0) > 0) {
    return 'high_leverage_positive'
  }

  if (operatingLeverage < -1) {
    return 'high_leverage_negative'
  }

  // EBITDA declining (OL < 0 or combined EBITDA decline)
  if (operatingLeverage < 0) {
    return 'declining'
  }

  if (operatingLeverage > 1) {
    return 'improving'
  }

  return 'low_leverage'
}

// ── Period data ───────────────────────────────────────────────────────────────

interface PeriodData {
  revenue: number
  cogs:    number
  opex:    number
}

// ── Report type ───────────────────────────────────────────────────────────────

export interface EbitdaBridgeReport {
  bridge:             EbitdaBridge
  operating_leverage: number | null
  leverage_health:    ReturnType<typeof classifyOperatingLeverageHealth>
  current_period: {
    revenue:           number
    cogs:              number
    opex:              number
    ebitda:            number
    ebitda_margin_pct: number | null
  }
  prior_period: {
    revenue:           number
    cogs:              number
    opex:              number
    ebitda:            number
    ebitda_margin_pct: number | null
  }
  revenue_growth_pct: number | null
  ebitda_growth_pct:  number | null
}

// ── Service class ─────────────────────────────────────────────────────────────

export class EbitdaBridgeService {
  constructor(private supabase: AnyClient) {}

  /**
   * Fetch revenue, COGS (via allocations), and OpEx for a 30-day window.
   */
  private async fetchPeriodData(
    companyId: string,
    from: string,
    to: string,
  ): Promise<PeriodData> {
    let revenue = 0
    let cogs    = 0
    let opex    = 0

    // ── 1. Revenue ─────────────────────────────────────────────────────────────
    try {
      const { data } = await this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('payment_status', 'eq', 'cancelled')

      if (data) {
        for (const row of data as Array<{ total_try: number }>) {
          revenue += Number(row.total_try ?? 0)
        }
      }
    } catch {
      // fallback: leave at 0
    }

    // ── 2. COGS via sale_item_allocations ─────────────────────────────────────
    try {
      const { data: saleIdsData } = await this.supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to)
        .not('payment_status', 'eq', 'cancelled')
        .limit(5000)

      const saleIds = (saleIdsData ?? []).map((r: { id: string }) => r.id)

      if (saleIds.length > 0) {
        const { data: saleItemsData } = await this.supabase
          .from('sale_items')
          .select('id')
          .eq('company_id', companyId)
          .in('sale_id', saleIds)
          .limit(10000)

        const saleItemIds = (saleItemsData ?? []).map((si: { id: string }) => si.id)

        if (saleItemIds.length > 0) {
          const { data: allocData } = await this.supabase
            .from('sale_item_allocations')
            .select('qty_allocated, cost_price_try, stock_lots(cost_price_try)')
            .eq('company_id', companyId)
            .in('sale_item_id', saleItemIds)
            .limit(20000)

          for (const r of (allocData ?? [])) {
            const lot      = r.stock_lots as { cost_price_try?: number } | null
            const unitCost = r.cost_price_try !== null && r.cost_price_try !== undefined
              ? Number(r.cost_price_try)
              : (lot?.cost_price_try !== undefined ? Number(lot.cost_price_try) : 0)
            cogs += Number(r.qty_allocated ?? 0) * unitCost
          }
        }
      }

      // Fallback: approximate COGS as 50% of revenue if no allocation data
      if (cogs === 0 && revenue > 0) {
        cogs = revenue * 0.5
      }
    } catch {
      if (revenue > 0) cogs = revenue * 0.5
    }

    // ── 3. OpEx (exclude non-operating types) ─────────────────────────────────
    try {
      const { data } = await this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to)

      if (data) {
        for (const row of data as Array<{ amount_try: number; expense_type: string | null }>) {
          const t = String(row.expense_type ?? '')
          if (NON_OPEX_TYPES.has(t)) continue
          opex += Number(row.amount_try ?? 0)
        }
      }
    } catch {
      // fallback: leave at 0
    }

    return { revenue, cogs, opex }
  }

  /**
   * Build EBITDA bridge report comparing current 30 days vs prior 30 days.
   */
  async getReport(companyId: string): Promise<EbitdaBridgeReport> {
    const now = new Date()

    // Current period: last 30 days
    const currentTo   = now.toISOString().slice(0, 10)
    const currentFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)

    // Prior period: same 30-day window one month ago
    const priorTo   = new Date(now.getFullYear(), now.getMonth() - 1 + 1, 0)
      .toISOString().slice(0, 10)
    const priorFrom = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      .toISOString().slice(0, 10)

    const [current, prior] = await Promise.all([
      this.fetchPeriodData(companyId, currentFrom, currentTo),
      this.fetchPeriodData(companyId, priorFrom,   priorTo),
    ])

    const currentEbitda = computeEbitda(current.revenue, current.cogs, current.opex)
    const priorEbitda   = computeEbitda(prior.revenue,   prior.cogs,   prior.opex)

    const currentEbitdaMarginPct = current.revenue > 0 ? (currentEbitda / current.revenue) * 100 : null
    const priorEbitdaMarginPct   = prior.revenue   > 0 ? (priorEbitda   / prior.revenue)   * 100 : null

    const revenueGrowthPct = prior.revenue > 0
      ? ((current.revenue - prior.revenue) / Math.abs(prior.revenue)) * 100
      : null

    const ebitdaGrowthPct = priorEbitda !== 0
      ? ((currentEbitda - priorEbitda) / Math.abs(priorEbitda)) * 100
      : null

    const operatingLeverage = computeOperatingLeverage(
      revenueGrowthPct ?? 0,
      ebitdaGrowthPct  ?? 0,
    )

    const leverageHealth = classifyOperatingLeverageHealth(
      revenueGrowthPct !== null ? operatingLeverage : null,
      revenueGrowthPct,
    )

    const bridge = buildEbitdaBridge(prior, current)

    return {
      bridge,
      operating_leverage: operatingLeverage,
      leverage_health:    leverageHealth,
      current_period: {
        revenue:           current.revenue,
        cogs:              current.cogs,
        opex:              current.opex,
        ebitda:            currentEbitda,
        ebitda_margin_pct: currentEbitdaMarginPct,
      },
      prior_period: {
        revenue:           prior.revenue,
        cogs:              prior.cogs,
        opex:              prior.opex,
        ebitda:            priorEbitda,
        ebitda_margin_pct: priorEbitdaMarginPct,
      },
      revenue_growth_pct: revenueGrowthPct,
      ebitda_growth_pct:  ebitdaGrowthPct,
    }
  }
}
