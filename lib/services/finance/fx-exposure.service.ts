// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/fx-exposure.service.ts
//
// FX Exposure & Currency Risk Analysis
//
// Tracks multi-currency receivables/payables for Turkish SMEs, estimates
// TRY impact of currency movements, and classifies FX risk.
//
// Pure functions exported for testing:
//   computeFxImpact               — TRY P&L from rate movement
//   computeNetFxExposure          — receivables - payables in foreign currency
//   computeFxRiskRatio            — |net exposure| / revenue × 100
//   classifyFxRisk                — 6-level classification
//   computeCurrencyDiversification — HHI + dominant currency + TRY/foreign split
//   computeScenarioFxLoss         — estimated loss under TRY depreciation
//   classifyHedgeRecommendation   — 5-level hedge action recommendation
//
// Class: FxExposureService
//   getReport(companyId)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | string

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * computeFxImpact
 *
 * TRY impact of exchange-rate movement on a foreign-currency position.
 * = foreignAmount × (currentRate - originalRate)
 * Positive = gain (TRY depreciated, foreign asset worth more in TRY)
 * Negative = loss
 */
export function computeFxImpact(
  foreignAmount: number,
  originalRate: number,   // rate at transaction time (TRY per 1 foreign unit)
  currentRate: number,    // current TRY rate
): number {
  return foreignAmount * (currentRate - originalRate)
}

/**
 * computeNetFxExposure
 *
 * Net foreign-currency exposure = receivables_foreign - payables_foreign
 * Positive = net asset (benefits when TRY depreciates)
 * Negative = net liability (hurt when TRY depreciates)
 */
export function computeNetFxExposure(
  receivables_foreign: number,
  payables_foreign: number,
): number {
  return receivables_foreign - payables_foreign
}

/**
 * computeFxRiskRatio
 *
 * |netForeignExposure| / totalRevenue × 100
 * Returns null when totalRevenue === 0
 */
export function computeFxRiskRatio(
  netForeignExposure: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (Math.abs(netForeignExposure) / totalRevenue) * 100
}

/**
 * classifyFxRisk
 *
 * insufficient_data : null
 * minimal           : < 5%
 * low               : 5–14.9%
 * moderate          : 15–29.9%
 * significant       : 30–49.9%
 * critical          : >= 50%
 */
export function classifyFxRisk(
  fxRiskRatioPct: number | null,
): 'minimal' | 'low' | 'moderate' | 'significant' | 'critical' | 'insufficient_data' {
  if (fxRiskRatioPct === null) return 'insufficient_data'
  if (fxRiskRatioPct < 5)  return 'minimal'
  if (fxRiskRatioPct < 15) return 'low'
  if (fxRiskRatioPct < 30) return 'moderate'
  if (fxRiskRatioPct < 50) return 'significant'
  return 'critical'
}

/**
 * computeCurrencyDiversification
 *
 * Computes HHI-based diversification from a list of currency amounts (in TRY).
 * HHI = sum of (share_i)^2 where share_i = amount_i / total
 * dominant_currency = largest non-TRY currency by TRY-equivalent amount
 * try_pct + foreign_pct = 100 (or both 0 if total = 0)
 */
export function computeCurrencyDiversification(
  currencies: Array<{ currency: Currency; amount_try: number }>,
): {
  hhi: number
  dominant_currency: Currency | null
  try_pct: number
  foreign_pct: number
} {
  const total = currencies.reduce((s, c) => s + Math.abs(c.amount_try), 0)

  if (total === 0) {
    return { hhi: 0, dominant_currency: null, try_pct: 0, foreign_pct: 0 }
  }

  // Aggregate by currency
  const aggregated = new Map<Currency, number>()
  for (const c of currencies) {
    aggregated.set(c.currency, (aggregated.get(c.currency) ?? 0) + Math.abs(c.amount_try))
  }

  // HHI
  let hhi = 0
  for (const amount of aggregated.values()) {
    const share = amount / total
    hhi += share * share
  }

  // Dominant non-TRY currency
  let dominant_currency: Currency | null = null
  let maxForeign = 0
  for (const [currency, amount] of aggregated.entries()) {
    if (currency !== 'TRY' && amount > maxForeign) {
      maxForeign = amount
      dominant_currency = currency
    }
  }

  const tryAmount   = aggregated.get('TRY') ?? 0
  const try_pct     = (tryAmount / total) * 100
  const foreign_pct = 100 - try_pct

  return { hhi, dominant_currency, try_pct, foreign_pct }
}

/**
 * computeScenarioFxLoss
 *
 * Estimated TRY loss if TRY depreciates by depreciationPct%.
 * = netForeignExposureTry × depreciationPct / 100 × -1
 * Positive = loss (net liability position, depreciation hurts)
 * Negative = gain (net asset position, depreciation helps)
 */
export function computeScenarioFxLoss(
  netForeignExposureTry: number,
  depreciationPct: number,
): number {
  return netForeignExposureTry * (depreciationPct / 100) * -1
}

/**
 * classifyHedgeRecommendation
 *
 * no_action       : null ratio or < 5%
 * monitor         : 5–14.9%
 * natural_hedge   : net exposure near zero (< 1 TRY absolute)
 * forward_contract: moderate (15–29.9%) or significant (30–49.9%) risk
 * urgent_hedge    : critical (>= 50%) risk
 */
export function classifyHedgeRecommendation(
  fxRiskRatioPct: number | null,
  netExposureTry: number,
): 'no_action' | 'monitor' | 'natural_hedge' | 'forward_contract' | 'urgent_hedge' {
  if (fxRiskRatioPct === null || fxRiskRatioPct < 5) return 'no_action'

  // Natural hedge: net exposure essentially zero
  if (Math.abs(netExposureTry) < 1) return 'natural_hedge'

  if (fxRiskRatioPct >= 50) return 'urgent_hedge'
  if (fxRiskRatioPct >= 15) return 'forward_contract'
  return 'monitor'
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function ytdBounds(): { from: string; to: string } {
  const now  = new Date()
  const year = now.getFullYear()
  const to   = now.toISOString().slice(0, 10)
  return { from: `${year}-01-01`, to }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class FxExposureService {
  constructor(private supabase: AnyClient) {}

  async getReport(companyId: string): Promise<{
    currencies: Array<{
      currency: Currency
      receivables_foreign: number
      payables_foreign: number
      net_exposure_foreign: number
      receivables_try: number
      payables_try: number
      net_exposure_try: number
      fx_risk_ratio_pct: number | null
    }>
    overall: {
      total_receivables_try: number
      total_payables_try: number
      net_exposure_try: number
      fx_risk_ratio_pct: number | null
      risk_class: ReturnType<typeof classifyFxRisk>
      hedge_recommendation: ReturnType<typeof classifyHedgeRecommendation>
      diversification: ReturnType<typeof computeCurrencyDiversification>
    }
    scenarios: {
      depreciation_10pct_loss: number
      depreciation_20pct_loss: number
      depreciation_30pct_loss: number
    }
    total_revenue_ytd: number
  }> {
    const { from: ytdFrom, to: ytdTo } = ytdBounds()

    // ── Parallel DB queries ──────────────────────────────────────────────────
    const [salesResult, expensesResult, allSalesResult] = await Promise.allSettled([
      // Non-TRY unpaid/partial sales = foreign receivables
      this.supabase
        .from('sales')
        .select('currency, total, fx_try, payment_status, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'cancelled')
        .neq('currency', 'TRY')
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo)
        .limit(5000),

      // Non-TRY expenses = potential payables
      this.supabase
        .from('expenses')
        .select('currency, amount, fx_rate, amount_try, payment_status, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('currency', 'TRY')
        .gte('expense_date', ytdFrom)
        .lte('expense_date', ytdTo)
        .limit(5000),

      // All YTD sales for revenue base
      this.supabase
        .from('sales')
        .select('total, fx_try, currency')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'cancelled')
        .gte('sale_date', ytdFrom)
        .lte('sale_date', ytdTo)
        .limit(10000),
    ])

    const foreignSales    = salesResult.status    === 'fulfilled' ? ((salesResult.value.data    ?? []) as Array<{
      currency: string | null; total: number | null; fx_try: number | null; payment_status: string | null; sale_date: string | null
    }>) : []
    const foreignExpenses = expensesResult.status === 'fulfilled' ? ((expensesResult.value.data ?? []) as Array<{
      currency: string | null; amount: number | null; fx_rate: number | null; amount_try: number | null; payment_status: string | null; expense_date: string | null
    }>) : []
    const allSales        = allSalesResult.status === 'fulfilled' ? ((allSalesResult.value.data ?? []) as Array<{
      total: number | null; fx_try: number | null; currency: string | null
    }>) : []

    // ── YTD revenue (all currencies in TRY equivalent) ───────────────────────
    let total_revenue_ytd = 0
    for (const s of allSales) {
      const origAmt = Number(s.total  ?? 0)
      const fxRate  = Number(s.fx_try ?? 1) || 1
      const ccy     = (s.currency ?? 'TRY')
      total_revenue_ytd += ccy === 'TRY' ? origAmt : origAmt * fxRate
    }

    // ── Aggregate receivables per currency ───────────────────────────────────
    // receivables: unpaid/partial foreign sales
    const recvMap = new Map<Currency, { foreign: number; try: number }>()
    for (const s of foreignSales) {
      if (s.payment_status === 'paid') continue  // already collected
      const ccy    = (s.currency ?? 'USD') as Currency
      const foreign = Number(s.total  ?? 0)
      const fxRate  = Number(s.fx_try ?? 1) || 1
      const tryAmt  = foreign * fxRate
      const existing = recvMap.get(ccy) ?? { foreign: 0, try: 0 }
      existing.foreign += foreign
      existing.try     += tryAmt
      recvMap.set(ccy, existing)
    }

    // ── Aggregate payables per currency ──────────────────────────────────────
    // payables: unpaid foreign expenses
    const payMap = new Map<Currency, { foreign: number; try: number }>()
    for (const e of foreignExpenses) {
      if (e.payment_status === 'paid') continue  // already settled
      const ccy     = (e.currency ?? 'USD') as Currency
      const foreign = Number(e.amount   ?? 0)
      const fxRate  = Number(e.fx_rate  ?? 1) || 1
      const tryAmt  = e.amount_try != null ? Number(e.amount_try) : foreign * fxRate
      const existing = payMap.get(ccy) ?? { foreign: 0, try: 0 }
      existing.foreign += foreign
      existing.try     += tryAmt
      payMap.set(ccy, existing)
    }

    // ── Build per-currency report ─────────────────────────────────────────────
    const allCurrencies = new Set([...recvMap.keys(), ...payMap.keys()])
    const currencyRows: Array<{
      currency: Currency
      receivables_foreign: number
      payables_foreign: number
      net_exposure_foreign: number
      receivables_try: number
      payables_try: number
      net_exposure_try: number
      fx_risk_ratio_pct: number | null
    }> = []

    for (const ccy of allCurrencies) {
      const recv = recvMap.get(ccy) ?? { foreign: 0, try: 0 }
      const pay  = payMap.get(ccy)  ?? { foreign: 0, try: 0 }

      const net_exposure_foreign = computeNetFxExposure(recv.foreign, pay.foreign)
      const net_exposure_try     = recv.try - pay.try
      const fx_risk_ratio_pct    = computeFxRiskRatio(net_exposure_try, total_revenue_ytd)

      currencyRows.push({
        currency:             ccy,
        receivables_foreign:  recv.foreign,
        payables_foreign:     pay.foreign,
        net_exposure_foreign,
        receivables_try:      recv.try,
        payables_try:         pay.try,
        net_exposure_try,
        fx_risk_ratio_pct,
      })
    }

    // ── Overall metrics ───────────────────────────────────────────────────────
    const total_receivables_try = currencyRows.reduce((s, r) => s + r.receivables_try, 0)
    const total_payables_try    = currencyRows.reduce((s, r) => s + r.payables_try,    0)
    const net_exposure_try      = total_receivables_try - total_payables_try
    const fx_risk_ratio_pct     = computeFxRiskRatio(net_exposure_try, total_revenue_ytd)
    const risk_class            = classifyFxRisk(fx_risk_ratio_pct)
    const hedge_recommendation  = classifyHedgeRecommendation(fx_risk_ratio_pct, net_exposure_try)

    // Diversification: based on ALL YTD sales revenue by currency
    const diversificationMap = new Map<Currency, number>()
    for (const s of allSales) {
      const ccy    = ((s.currency ?? 'TRY') as Currency)
      const orig   = Number(s.total   ?? 0)
      const fxRate = Number(s.fx_try  ?? 1) || 1
      const tryAmt = ccy === 'TRY' ? orig : orig * fxRate
      diversificationMap.set(ccy, (diversificationMap.get(ccy) ?? 0) + tryAmt)
    }
    const diversificationInput = Array.from(diversificationMap.entries()).map(([currency, amount_try]) => ({
      currency,
      amount_try,
    }))
    const diversification = computeCurrencyDiversification(diversificationInput)

    // ── Scenario analysis ─────────────────────────────────────────────────────
    const scenarios = {
      depreciation_10pct_loss: computeScenarioFxLoss(net_exposure_try, 10),
      depreciation_20pct_loss: computeScenarioFxLoss(net_exposure_try, 20),
      depreciation_30pct_loss: computeScenarioFxLoss(net_exposure_try, 30),
    }

    return {
      currencies: currencyRows,
      overall: {
        total_receivables_try,
        total_payables_try,
        net_exposure_try,
        fx_risk_ratio_pct,
        risk_class,
        hedge_recommendation,
        diversification,
      },
      scenarios,
      total_revenue_ytd,
    }
  }
}
