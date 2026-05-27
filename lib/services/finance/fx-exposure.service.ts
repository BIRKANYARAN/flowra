// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/fx-exposure.service.ts
//
// Multi-Currency FX Exposure Analysis
//
// Computes unrealized FX gains/losses on sales and purchases/expenses
// denominated in foreign currency, and estimates hedging needs.
//
// Key rules:
//   • Only non-TRY currencies are considered exposures.
//   • Revenue: sales with currency != 'TRY' in the analysis window.
//   • Expenses: expenses with currency != 'TRY' in the analysis window.
//   • current_rate: most recent exchange_rate from sales or expenses for that
//     currency within the period (proxy for current market rate).
//   • Unrealized G/L = (current_rate - entry_rate) × foreign_amount
//       positive = gain (TRY weakened vs foreign)
//       negative = loss (TRY strengthened vs foreign)
//   • If no multi-currency data exists, returns an empty report with
//     total_exposure_ratio_pct = 0.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Pure exported helpers ──────────────────────────────────────────────────────

/**
 * Compute FX gain/loss on a single foreign-currency position.
 *
 * gain  when current_rate > entry_rate (TRY weakened → foreign worth more in TRY)
 * loss  when current_rate < entry_rate (TRY strengthened)
 */
export function computeFxGainLoss(
  foreignAmount: number,
  entryRateTry: number,
  currentRateTry: number,
): number {
  return round2((currentRateTry - entryRateTry) * foreignAmount)
}

/**
 * Compute FX exposure ratio.
 * Returns 0 if totalRevenueTry is 0 to avoid division by zero.
 */
export function computeFxExposureRatio(
  foreignRevenueTry: number,
  totalRevenueTry: number,
): number {
  if (totalRevenueTry === 0) return 0
  return round2((foreignRevenueTry / totalRevenueTry) * 100)
}

/**
 * Classify FX exposure risk based on exposure percentage.
 *   <10%   → 'minimal'
 *   10-30% → 'moderate'
 *   30-60% → 'elevated'
 *   >60%   → 'high'
 */
export function classifyFxExposureRisk(
  exposureRatioPct: number,
): 'minimal' | 'moderate' | 'elevated' | 'high' {
  if (exposureRatioPct < 10)  return 'minimal'
  if (exposureRatioPct < 30)  return 'moderate'
  if (exposureRatioPct <= 60) return 'elevated'
  return 'high'
}

/**
 * Compute natural hedge ratio: foreign expenses / foreign revenue × 100.
 * Close to 100 = naturally hedged (revenues and expenses cancel out).
 * Returns null if foreignRevenueTry is 0 (no revenue to hedge against).
 */
export function computeNaturalHedgeRatio(
  foreignExpensesTry: number,
  foreignRevenueTry: number,
): number | null {
  if (foreignRevenueTry === 0) return null
  return round2((foreignExpensesTry / foreignRevenueTry) * 100)
}

/**
 * Estimate net FX exposure (hedging need) in TRY terms.
 *   positive = net receiver of FX (revenue > expenses in foreign)
 *   negative = net payer of FX
 */
export function computeNetFxExposure(
  foreignRevenueTry: number,
  foreignExpensesTry: number,
): number {
  return round2(foreignRevenueTry - foreignExpensesTry)
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CurrencyExposure {
  currency: string                    // 'USD' | 'EUR' | 'GBP' | 'OTHER'
  revenue_foreign: number             // in foreign currency units
  revenue_try: number                 // at entry rate
  expenses_foreign: number
  expenses_try: number
  avg_entry_rate: number
  current_rate: number | null         // from most recent transaction as proxy
  unrealized_gain_loss_try: number | null
  net_exposure_try: number
  exposure_ratio_pct: number
  natural_hedge_ratio_pct: number | null
  risk_level: 'minimal' | 'moderate' | 'elevated' | 'high'
}

export interface FxExposureReport {
  as_of_date: string
  period_months: number              // analysis window
  total_revenue_try: number
  foreign_revenue_try: number
  total_exposure_ratio_pct: number
  currencies: CurrencyExposure[]
  total_unrealized_gl_try: number | null
  total_net_exposure_try: number
  largest_exposure_currency: string | null
  hedging_recommendation: string     // Turkish text
}

// ── Hedging recommendation ─────────────────────────────────────────────────────

function hedgingRecommendation(exposureRatioPct: number): string {
  if (exposureRatioPct < 10)  return 'FX riski düşük. Mevcut yapı yeterli.'
  if (exposureRatioPct < 30)  return 'Orta düzey FX maruziyeti. Doğal hedging oranına dikkat edin.'
  if (exposureRatioPct <= 60) return 'Yüksek FX maruziyeti. Kurumsal hedging değerlendirilebilir.'
  return 'Kritik FX maruziyeti. Döviz yönetimi stratejisi acilen gerekli.'
}

// ── Service class ──────────────────────────────────────────────────────────────

export class FxExposureService {

  constructor(private supabase: AnyClient) {}

  async getReport(
    companyId: string,
    periodMonths = 6,
  ): Promise<FxExposureReport> {
    const today    = new Date().toISOString().slice(0, 10)
    const fromDate = (() => {
      const d = new Date()
      d.setMonth(d.getMonth() - periodMonths)
      return d.toISOString().slice(0, 10)
    })()

    // ── Parallel queries ───────────────────────────────────────────────────────

    // Sales in period with non-TRY currency
    const salesPromise = this.supabase
      .from('sales')
      .select('currency, total, total_try, fx_rate_try, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('currency', 'TRY')
      .gte('sale_date', fromDate)
      .lte('sale_date', today)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // All sales in period for total_revenue_try
    const totalRevenuePromise = this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', today)
      .not('payment_status', 'eq', 'cancelled')
      .limit(10000)

    // Expenses in period with non-TRY currency
    const expensesPromise = this.supabase
      .from('expenses')
      .select('currency, amount, amount_try, fx_rate, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .neq('currency', 'TRY')
      .gte('expense_date', fromDate)
      .lte('expense_date', today)
      .limit(5000)

    const [salesRes, totalRevRes, expensesRes] = await Promise.allSettled([
      salesPromise,
      totalRevenuePromise,
      expensesPromise,
    ])

    const salesRows = salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []
    const totalRevRows = totalRevRes.status === 'fulfilled' ? (totalRevRes.value.data ?? []) : []
    const expensesRows = expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []

    // Total revenue (TRY) for the period
    const totalRevenueTry = totalRevRows.reduce((s: number, r: { total_try: number | null }) =>
      s + Number(r.total_try ?? 0), 0)

    // If no foreign currency activity, return empty report
    if (salesRows.length === 0 && expensesRows.length === 0) {
      return {
        as_of_date: today,
        period_months: periodMonths,
        total_revenue_try: totalRevenueTry,
        foreign_revenue_try: 0,
        total_exposure_ratio_pct: 0,
        currencies: [],
        total_unrealized_gl_try: null,
        total_net_exposure_try: 0,
        largest_exposure_currency: null,
        hedging_recommendation: hedgingRecommendation(0),
      }
    }

    // ── Aggregate per currency ─────────────────────────────────────────────────

    type CcyData = {
      revenue_foreign: number
      revenue_try: number
      expenses_foreign: number
      expenses_try: number
      // For weighted avg entry rate on revenue side
      sum_rate_x_foreign: number
      // Track most recent transaction date and rate
      latest_sale_date: string
      latest_sale_rate: number | null
      latest_exp_date: string
      latest_exp_rate: number | null
    }

    const byCurrency = new Map<string, CcyData>()

    function ensureCcy(ccy: string): CcyData {
      if (!byCurrency.has(ccy)) {
        byCurrency.set(ccy, {
          revenue_foreign: 0,
          revenue_try: 0,
          expenses_foreign: 0,
          expenses_try: 0,
          sum_rate_x_foreign: 0,
          latest_sale_date: '',
          latest_sale_rate: null,
          latest_exp_date: '',
          latest_exp_rate: null,
        })
      }
      return byCurrency.get(ccy)!
    }

    for (const row of (salesRows as Array<{
      currency: string
      total: number | null
      total_try: number | null
      fx_rate_try: number | null
      sale_date: string | null
    }>)) {
      const ccy = String(row.currency ?? '').toUpperCase()
      if (!ccy || ccy === 'TRY') continue

      const normalizedCcy = ['USD', 'EUR', 'GBP'].includes(ccy) ? ccy : 'OTHER'
      const d = ensureCcy(normalizedCcy)

      const foreignAmt = Number(row.total ?? 0)
      const tryAmt     = Number(row.total_try ?? 0)
      const rate       = Number(row.fx_rate_try ?? 0)

      d.revenue_foreign += foreignAmt
      d.revenue_try     += tryAmt
      if (rate > 0) d.sum_rate_x_foreign += rate * foreignAmt

      const saleDate = String(row.sale_date ?? '')
      if (saleDate > d.latest_sale_date && rate > 0) {
        d.latest_sale_date = saleDate
        d.latest_sale_rate = rate
      }
    }

    for (const row of (expensesRows as Array<{
      currency: string
      amount: number | null
      amount_try: number | null
      fx_rate: number | null
      expense_date: string | null
    }>)) {
      const ccy = String(row.currency ?? '').toUpperCase()
      if (!ccy || ccy === 'TRY') continue

      const normalizedCcy = ['USD', 'EUR', 'GBP'].includes(ccy) ? ccy : 'OTHER'
      const d = ensureCcy(normalizedCcy)

      const foreignAmt = Number(row.amount ?? 0)
      const tryAmt     = Number(row.amount_try ?? 0)
      const rate       = Number(row.fx_rate ?? 0)

      d.expenses_foreign += foreignAmt
      d.expenses_try     += tryAmt

      const expDate = String(row.expense_date ?? '')
      if (expDate > d.latest_exp_date && rate > 0) {
        d.latest_exp_date = expDate
        d.latest_exp_rate = rate
      }
    }

    // ── Build CurrencyExposure array ───────────────────────────────────────────

    const foreignRevenueTry = Array.from(byCurrency.values()).reduce(
      (s, d) => s + d.revenue_try, 0,
    )

    const totalExposureRatioPct = computeFxExposureRatio(foreignRevenueTry, totalRevenueTry)

    const currencies: CurrencyExposure[] = []

    for (const [ccy, d] of byCurrency) {
      // Skip currencies with zero activity
      if (d.revenue_foreign === 0 && d.expenses_foreign === 0) continue

      // Weighted average entry rate
      const avgEntryRate = d.revenue_foreign > 0 && d.sum_rate_x_foreign > 0
        ? round2(d.sum_rate_x_foreign / d.revenue_foreign)
        : 0

      // Current rate = most recent transaction rate (sale or expense), whichever is later
      let currentRate: number | null = null
      if (d.latest_sale_date >= d.latest_exp_date && d.latest_sale_rate !== null) {
        currentRate = d.latest_sale_rate
      } else if (d.latest_exp_rate !== null) {
        currentRate = d.latest_exp_rate
      } else if (d.latest_sale_rate !== null) {
        currentRate = d.latest_sale_rate
      }

      // Unrealized G/L: based on revenue_foreign (receivable positions)
      // (current_rate - avg_entry_rate) × revenue_foreign
      const unrealizedGl = (currentRate !== null && avgEntryRate > 0 && d.revenue_foreign > 0)
        ? computeFxGainLoss(d.revenue_foreign, avgEntryRate, currentRate)
        : null

      const netExposureTry    = computeNetFxExposure(d.revenue_try, d.expenses_try)
      const exposureRatioPct  = computeFxExposureRatio(d.revenue_try, totalRevenueTry)
      const naturalHedgeRatio = computeNaturalHedgeRatio(d.expenses_try, d.revenue_try)
      const riskLevel         = classifyFxExposureRisk(exposureRatioPct)

      currencies.push({
        currency: ccy,
        revenue_foreign: round2(d.revenue_foreign),
        revenue_try: round2(d.revenue_try),
        expenses_foreign: round2(d.expenses_foreign),
        expenses_try: round2(d.expenses_try),
        avg_entry_rate: avgEntryRate,
        current_rate: currentRate,
        unrealized_gain_loss_try: unrealizedGl,
        net_exposure_try: netExposureTry,
        exposure_ratio_pct: exposureRatioPct,
        natural_hedge_ratio_pct: naturalHedgeRatio,
        risk_level: riskLevel,
      })
    }

    // Sort: largest revenue_try first
    currencies.sort((a, b) => b.revenue_try - a.revenue_try)

    const largestExposureCurrency = currencies.length > 0 ? currencies[0].currency : null

    // Total unrealized G/L: sum non-null values; null if all null
    const glValues = currencies.map(c => c.unrealized_gain_loss_try).filter((v): v is number => v !== null)
    const totalUnrealizedGl = glValues.length > 0
      ? round2(glValues.reduce((s, v) => s + v, 0))
      : null

    const totalNetExposureTry = round2(currencies.reduce((s, c) => s + c.net_exposure_try, 0))

    return {
      as_of_date: today,
      period_months: periodMonths,
      total_revenue_try: round2(totalRevenueTry),
      foreign_revenue_try: round2(foreignRevenueTry),
      total_exposure_ratio_pct: totalExposureRatioPct,
      currencies,
      total_unrealized_gl_try: totalUnrealizedGl,
      total_net_exposure_try: totalNetExposureTry,
      largest_exposure_currency: largestExposureCurrency,
      hedging_recommendation: hedgingRecommendation(totalExposureRatioPct),
    }
  }
}
