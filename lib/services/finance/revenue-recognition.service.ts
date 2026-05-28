// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/revenue-recognition.service.ts
//
// Revenue Recognition & Accrual Tracking
//
// Distinguishes three revenue bases:
//   Accrual   — confirmed/paid/partial/overdue sales (earned regardless of cash)
//   Cash      — Σ amount_paid for the same period (actually collected)
//   Deferred  — proforma/draft/unconverted sales (not yet earned)
//
// Pure functions exported for testing:
//   computeAccrualCashDiff         — accrual - cash (A/R creation proxy)
//   computeCollectionEfficiency    — cash / accrual × 100 (null if accrual = 0)
//   classifyCollectionEfficiency   — excellent / good / fair / poor / unknown
//   computeDeferredRatio           — deferred / accrual × 100
//   computeRevenueBacklog          — pipeline × (win_rate / 100)
//
// Class: RevenueRecognitionService
//   getReport(companyId, periodKey?)  → RevenueRecognitionReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { periodKeyToDateRange } from './income-statement.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Turkish month names ───────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ocak',    '02': 'Şubat', '03': 'Mart',
  '04': 'Nisan',   '05': 'Mayıs', '06': 'Haziran',
  '07': 'Temmuz',  '08': 'Ağustos', '09': 'Eylül',
  '10': 'Ekim',    '11': 'Kasım',   '12': 'Aralık',
}

function periodLabel(periodKey: string): string {
  const [year, month] = periodKey.split('-')
  return `${MONTH_NAMES[month] ?? month} ${year}`
}

function priorMonth(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueBasis {
  period_key:                   string
  period_label:                 string
  accrual_revenue_try:          number        // confirmed + paid + partial + overdue sales
  cash_revenue_try:             number        // Σ amount_paid (actually collected)
  deferred_revenue_try:         number        // proforma/draft pipeline value
  accrual_cash_diff_try:        number        // accrual - cash (A/R creation)
  collection_efficiency_pct:    number | null
  collection_efficiency_class:  'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
  deferred_ratio_pct:           number
}

export interface RevenueRecognitionReport {
  period_key:              string
  period_label:            string
  current:                 RevenueBasis
  prior_period:            RevenueBasis | null
  revenue_backlog_try:     number          // pipeline × (win_rate / 100)
  raw_pipeline_try:        number          // unadjusted proforma values
  pipeline_win_rate_pct:   number | null
  monthly_trend:           RevenueBasis[]  // last 6 months
  efficiency_trend:        'improving' | 'stable' | 'declining' | 'insufficient_data'
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute accrual-to-cash difference: accrual_revenue - cash_revenue.
 * Positive value = uncollected A/R created this period.
 */
export function computeAccrualCashDiff(
  accrualRevenueTry: number,
  cashRevenueTry: number,
): number {
  return accrualRevenueTry - cashRevenueTry
}

/**
 * Compute collection efficiency: cash_revenue / accrual_revenue × 100.
 * Returns null if accrual_revenue = 0 (division-by-zero guard).
 */
export function computeCollectionEfficiency(
  cashRevenueTry: number,
  accrualRevenueTry: number,
): number | null {
  if (accrualRevenueTry === 0) return null
  return (cashRevenueTry / accrualRevenueTry) * 100
}

/**
 * Classify collection efficiency percentage:
 *   ≥90%   → 'excellent'
 *   70–89% → 'good'
 *   50–69% → 'fair'
 *   <50%   → 'poor'
 *   null   → 'unknown'
 */
export function classifyCollectionEfficiency(
  efficiencyPct: number | null,
): 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' {
  if (efficiencyPct === null) return 'unknown'
  if (efficiencyPct >= 90) return 'excellent'
  if (efficiencyPct >= 70) return 'good'
  if (efficiencyPct >= 50) return 'fair'
  return 'poor'
}

/**
 * Compute deferred revenue ratio: deferred / accrual × 100.
 * Returns 0 if accrual_revenue = 0.
 */
export function computeDeferredRatio(
  deferredRevenueTry: number,
  accrualRevenueTry: number,
): number {
  if (accrualRevenueTry === 0) return 0
  return (deferredRevenueTry / accrualRevenueTry) * 100
}

/**
 * Compute adjusted revenue backlog: pipeline × (win_rate / 100).
 * This is forward-looking potential revenue weighted by historical win rate.
 */
export function computeRevenueBacklog(
  activePipelineTry: number,
  historicalWinRatePct: number,
): number {
  return activePipelineTry * (historicalWinRatePct / 100)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Sales statuses that count toward accrual revenue */
const ACCRUAL_STATUSES = ['confirmed', 'paid', 'partial', 'overdue', 'unpaid']

/** Sales statuses that count as pipeline / deferred */
const DEFERRED_STATUSES = ['proforma', 'draft']

interface RawPeriodData {
  accrual:  number
  cash:     number
  deferred: number
}

// ── Main service class ────────────────────────────────────────────────────────

export class RevenueRecognitionService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Fetch raw accrual, cash, and deferred figures for a date range.
   *
   * Accrual: confirmed/paid/partial/overdue sales total_try in range.
   * Cash:    Σ COALESCE(amount_paid, total_try) for paid status; amount_paid for partial.
   * Deferred: total_try of proforma/draft/unconverted sales (pipeline).
   */
  private async fetchPeriodData(
    companyId: string,
    fromDate: string,
    toDate: string,
  ): Promise<RawPeriodData> {
    // ── Accrual + cash sales (earned revenue in the period) ───────────────────
    const accrualRes = await this.supabase
      .from('sales')
      .select('total_try, amount_paid, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', fromDate)
      .lte('sale_date', toDate)
      .in('payment_status', ACCRUAL_STATUSES)
      .limit(5000)

    let accrual = 0
    let cash = 0

    for (const row of (accrualRes.data ?? [])) {
      const total = Number(row.total_try ?? 0)
      const paid  = row.amount_paid !== null && row.amount_paid !== undefined
        ? Number(row.amount_paid)
        : 0

      accrual += total

      // Cash = amount actually collected
      const status = String(row.payment_status ?? '')
      if (status === 'paid') {
        // Fully paid — collected = total_try (or amount_paid if set)
        cash += paid > 0 ? paid : total
      } else if (status === 'partial') {
        // Partial — use amount_paid directly
        cash += paid
      }
      // unpaid / overdue / confirmed → no cash collected
    }

    // ── Deferred: proforma / draft pipeline (company-level, not period-scoped) ─
    // Note: deferred is pipeline across ALL time (not bounded to period)
    // but we still filter to avoid old converted ones
    const deferredRes = await this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', DEFERRED_STATUSES)
      .limit(5000)

    const deferred = (deferredRes.data ?? []).reduce(
      (s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0),
      0,
    )

    return { accrual, cash, deferred }
  }

  /**
   * Build a RevenueBasis from raw period data.
   */
  private buildRevenueBasis(periodKey: string, data: RawPeriodData): RevenueBasis {
    const diff       = computeAccrualCashDiff(data.accrual, data.cash)
    const efficiency = computeCollectionEfficiency(data.cash, data.accrual)
    const effClass   = classifyCollectionEfficiency(efficiency)
    const deferred_ratio = computeDeferredRatio(data.deferred, data.accrual)

    return {
      period_key:                  periodKey,
      period_label:                periodLabel(periodKey),
      accrual_revenue_try:         data.accrual,
      cash_revenue_try:            data.cash,
      deferred_revenue_try:        data.deferred,
      accrual_cash_diff_try:       diff,
      collection_efficiency_pct:   efficiency,
      collection_efficiency_class: effClass,
      deferred_ratio_pct:          deferred_ratio,
    }
  }

  /**
   * Compute win rate from historical proforma conversions (inline).
   * Win rate = converted / (converted + rejected) × 100.
   * Falls back to null if insufficient data.
   */
  private async computeWinRate(companyId: string): Promise<number | null> {
    const res = await this.supabase
      .from('proformas')
      .select('status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('status', ['converted', 'rejected', 'accepted', 'approved'])
      .limit(1000)

    const rows = (res.data ?? []) as Array<{ status: string }>
    const converted = rows.filter(r => r.status === 'converted').length
    const rejected  = rows.filter(r => r.status === 'rejected').length
    const total     = converted + rejected

    if (total < 5) return null  // insufficient sample
    return (converted / total) * 100
  }

  /**
   * Derive efficiency trend from 6 months of RevenueBasis.
   * Compares last 2 months vs 2 months before that.
   */
  private classifyEfficiencyTrend(trend: RevenueBasis[]): RevenueRecognitionReport['efficiency_trend'] {
    const withData = trend.filter(b => b.collection_efficiency_pct !== null)
    if (withData.length < 3) return 'insufficient_data'

    // Last 2 months avg vs previous 2 months avg
    const recent = withData.slice(-2).map(b => b.collection_efficiency_pct as number)
    const prior  = withData.slice(-4, -2).map(b => b.collection_efficiency_pct as number)

    if (prior.length < 2) return 'insufficient_data'

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length
    const priorAvg  = prior.reduce((a, b) => a + b, 0) / prior.length

    const delta = recentAvg - priorAvg
    if (delta > 5)  return 'improving'
    if (delta < -5) return 'declining'
    return 'stable'
  }

  /**
   * Get a full RevenueRecognitionReport.
   * @param companyId  Company UUID
   * @param periodKey  "YYYY-MM" format (defaults to current month)
   */
  async getReport(
    companyId: string,
    periodKey?: string,
  ): Promise<RevenueRecognitionReport> {
    const pk = periodKey ?? currentMonthKey()
    const { start, end } = periodKeyToDateRange(pk)

    const priorKey          = priorMonth(pk)
    const { start: pStart, end: pEnd } = periodKeyToDateRange(priorKey)

    // Build last-6-months keys (oldest → newest)
    const trendKeys: string[] = []
    for (let i = 5; i >= 0; i--) {
      let k = pk
      for (let j = 0; j < i; j++) k = priorMonth(k)
      trendKeys.push(k)
    }

    // Fetch current + prior + 6-month trend + win rate in parallel
    const [
      currentData,
      priorData,
      winRate,
      ...trendDataArr
    ] = await Promise.all([
      this.fetchPeriodData(companyId, start, end),
      this.fetchPeriodData(companyId, pStart, pEnd),
      this.computeWinRate(companyId),
      ...trendKeys.map(k => {
        const { start: ts, end: te } = periodKeyToDateRange(k)
        return this.fetchPeriodData(companyId, ts, te)
      }),
    ])

    // Build bases
    const current     = this.buildRevenueBasis(pk, currentData)
    const priorBasis  = this.buildRevenueBasis(priorKey, priorData)
    const monthlyTrend: RevenueBasis[] = trendKeys.map((k, i) =>
      this.buildRevenueBasis(k, trendDataArr[i]),
    )

    // Pipeline = deferred value from current data
    const rawPipeline = current.deferred_revenue_try
    const backlog     = winRate !== null
      ? computeRevenueBacklog(rawPipeline, winRate)
      : rawPipeline  // no win rate → use raw

    const efficiencyTrend = this.classifyEfficiencyTrend(monthlyTrend)

    return {
      period_key:            pk,
      period_label:          periodLabel(pk),
      current,
      prior_period:          priorBasis,
      revenue_backlog_try:   backlog,
      raw_pipeline_try:      rawPipeline,
      pipeline_win_rate_pct: winRate,
      monthly_trend:         monthlyTrend,
      efficiency_trend:      efficiencyTrend,
    }
  }
}
