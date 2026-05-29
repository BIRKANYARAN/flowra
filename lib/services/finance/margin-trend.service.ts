// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/margin-trend.service.ts
//
// Profit Margin Trend Decomposition
//
// Tracks gross margin, EBITDA margin, and net margin across 12 months,
// decomposes margin drivers (COGS changes, OpEx changes, revenue mix).
//
// Pure functions exported for testing:
//   computeEbitdaMargin   — ebitda / revenue × 100; null if revenue = 0
//   computeMarginDelta    — current - prior; null if either is null
//   classifyMarginTrend   — expanding | contracting | stable | insufficient_data
//   computeCogsRatio      — cogs / revenue × 100; null if revenue = 0
//   computeOpexRatio      — opex / revenue × 100; null if revenue = 0
//
// Class: MarginTrendService
//   getReport(companyId): Promise<MarginTrendReport>
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarginPeriod {
  period_key:   string
  period_label: string
  revenue_try:      number
  cogs_try:         number
  gross_profit_try: number
  opex_try:         number
  ebitda_try:       number
  net_income_try:   number

  gross_margin_pct:  number | null
  ebitda_margin_pct: number | null
  net_margin_pct:    number | null
  cogs_ratio_pct:    number | null
  opex_ratio_pct:    number | null

  gross_margin_delta:  number | null    // vs prior period
  ebitda_margin_delta: number | null
  net_margin_delta:    number | null

  gross_margin_trend: 'expanding' | 'contracting' | 'stable' | 'insufficient_data'
}

export interface MarginTrendReport {
  periods: MarginPeriod[]           // last 12 months
  current: MarginPeriod | null      // most recent period
  trailing_12m_avg_gross_margin: number | null
  trailing_12m_avg_net_margin:   number | null
  best_gross_margin_period:  string | null
  worst_gross_margin_period: string | null
  overall_gross_margin_trend: 'expanding' | 'contracting' | 'stable' | 'insufficient_data'
  margin_drivers: Array<{
    driver: 'cogs_increase' | 'cogs_decrease' | 'opex_increase' | 'opex_decrease' | 'revenue_growth' | 'revenue_decline'
    impact_try: number
    description: string   // Turkish
  }>
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

function periodBounds(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    from: `${periodKey}-01`,
    to:   `${periodKey}-${String(lastDay).padStart(2, '0')}`,
  }
}

function lastNMonthKeys(n: number): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

// ── Expense types excluded from OpEx (non-operating) ─────────────────────────
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
 * Compute EBITDA margin: ebitda / revenue × 100.
 * Returns null if revenue = 0.
 */
export function computeEbitdaMargin(
  ebitdaTry: number,
  revenueTry: number,
): number | null {
  if (revenueTry === 0) return null
  return (ebitdaTry / revenueTry) * 100
}

/**
 * Compute margin expansion/contraction vs prior period.
 * Returns null if either margin is null.
 */
export function computeMarginDelta(
  currentMarginPct: number | null,
  priorMarginPct: number | null,
): number | null {
  if (currentMarginPct === null || priorMarginPct === null) return null
  return currentMarginPct - priorMarginPct
}

/**
 * Classify margin trend direction.
 * delta > +1%: 'expanding'
 * delta < -1%: 'contracting'
 * within ±1%: 'stable'
 * null: 'insufficient_data'
 */
export function classifyMarginTrend(
  delta: number | null,
): 'expanding' | 'contracting' | 'stable' | 'insufficient_data' {
  if (delta === null) return 'insufficient_data'
  if (delta > 1)  return 'expanding'
  if (delta < -1) return 'contracting'
  return 'stable'
}

/**
 * Compute COGS ratio: cogs / revenue × 100.
 * Returns null if revenue = 0.
 */
export function computeCogsRatio(
  cogsTry: number,
  revenueTry: number,
): number | null {
  if (revenueTry === 0) return null
  return (cogsTry / revenueTry) * 100
}

/**
 * Compute opex ratio: opex / revenue × 100.
 * Returns null if revenue = 0.
 */
export function computeOpexRatio(
  opexTry: number,
  revenueTry: number,
): number | null {
  if (revenueTry === 0) return null
  return (opexTry / revenueTry) * 100
}

// ── Raw period data ───────────────────────────────────────────────────────────

interface RawPeriodData {
  revenue: number
  cogs:    number
  opex:    number
}

// ── Service class ─────────────────────────────────────────────────────────────

export class MarginTrendService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  /**
   * Fetch revenue, COGS (via sale_item_allocations), and OpEx for a month range.
   */
  private async fetchPeriodData(
    companyId: string,
    from: string,
    to: string,
  ): Promise<RawPeriodData> {
    // ── 1. Revenue ─────────────────────────────────────────────────────────────
    const salesQ = this.supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')

    // ── 2. Sale IDs for COGS lookup ────────────────────────────────────────────
    const saleIdsQ = this.supabase
      .from('sales')
      .select('id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to)
      .not('payment_status', 'eq', 'cancelled')
      .limit(5000)

    // ── 3. Expenses ────────────────────────────────────────────────────────────
    const expQ = this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    const [salesRes, saleIdsRes, expRes] = await Promise.all([salesQ, saleIdsQ, expQ])

    // Revenue
    const revenue = (salesRes.data ?? []).reduce(
      (s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0),
      0,
    )

    // COGS via sale_item_allocations
    let cogs = 0
    const saleIds = (saleIdsRes.data ?? []).map((r: { id: string }) => r.id)
    if (saleIds.length > 0) {
      const saleItemsRes = await this.supabase
        .from('sale_items')
        .select('id')
        .eq('company_id', companyId)
        .in('sale_id', saleIds)
        .limit(10000)

      const saleItemIds = (saleItemsRes.data ?? []).map((si: { id: string }) => si.id)
      if (saleItemIds.length > 0) {
        const allocRes = await this.supabase
          .from('sale_item_allocations')
          .select('qty_allocated, cost_price_try, stock_lots(cost_price_try)')
          .eq('company_id', companyId)
          .in('sale_item_id', saleItemIds)
          .limit(20000)

        for (const r of (allocRes.data ?? [])) {
          const lot      = r.stock_lots as { cost_price_try?: number } | null
          const unitCost = r.cost_price_try !== null && r.cost_price_try !== undefined
            ? Number(r.cost_price_try)
            : (lot?.cost_price_try !== undefined ? Number(lot.cost_price_try) : 0)
          cogs += Number(r.qty_allocated ?? 0) * unitCost
        }
      }
    }

    // OpEx: exclude financing, tax, and interest
    let opex = 0
    for (const row of (expRes.data ?? [])) {
      const t      = String(row.expense_type ?? '')
      const amount = Number(row.amount_try ?? 0)
      if (NON_OPEX_TYPES.has(t)) continue
      opex += amount
    }

    return { revenue, cogs, opex }
  }

  /**
   * Build a MarginPeriod from raw data and optional prior margin values.
   */
  private buildPeriod(
    periodKey: string,
    raw: RawPeriodData,
    priorGrossMargin: number | null,
    priorEbitdaMargin: number | null,
    priorNetMargin: number | null,
  ): MarginPeriod {
    const { revenue, cogs, opex } = raw
    const grossProfit = revenue - cogs
    const ebitda      = grossProfit - opex

    // Net income: ebt = ebitda, tax = 20% if positive
    const tax       = ebitda > 0 ? ebitda * 0.20 : 0
    const netIncome = ebitda - tax

    const gross_margin_pct  = revenue > 0 ? (grossProfit / revenue) * 100 : null
    const ebitda_margin_pct = computeEbitdaMargin(ebitda, revenue)
    const net_margin_pct    = revenue > 0 ? (netIncome / revenue) * 100 : null
    const cogs_ratio_pct    = computeCogsRatio(cogs, revenue)
    const opex_ratio_pct    = computeOpexRatio(opex, revenue)

    const gross_margin_delta  = computeMarginDelta(gross_margin_pct, priorGrossMargin)
    const ebitda_margin_delta = computeMarginDelta(ebitda_margin_pct, priorEbitdaMargin)
    const net_margin_delta    = computeMarginDelta(net_margin_pct, priorNetMargin)

    return {
      period_key:       periodKey,
      period_label:     periodLabel(periodKey),
      revenue_try:      revenue,
      cogs_try:         cogs,
      gross_profit_try: grossProfit,
      opex_try:         opex,
      ebitda_try:       ebitda,
      net_income_try:   netIncome,
      gross_margin_pct,
      ebitda_margin_pct,
      net_margin_pct,
      cogs_ratio_pct,
      opex_ratio_pct,
      gross_margin_delta,
      ebitda_margin_delta,
      net_margin_delta,
      gross_margin_trend: classifyMarginTrend(gross_margin_delta),
    }
  }

  /**
   * Get margin trend report for the last 12 months.
   */
  async getReport(companyId: string): Promise<MarginTrendReport> {
    const periodKeys = lastNMonthKeys(12)

    // Fetch all 12 months in parallel
    const rawDataArr = await Promise.all(
      periodKeys.map(pk => {
        const { from, to } = periodBounds(pk)
        return this.fetchPeriodData(companyId, from, to)
      }),
    )

    // Build periods with deltas (each vs its prior)
    const periods: MarginPeriod[] = []
    for (let i = 0; i < periodKeys.length; i++) {
      const raw     = rawDataArr[i]
      const priorRaw = i > 0 ? rawDataArr[i - 1] : null

      // Compute prior margins
      let priorGross: number | null  = null
      let priorEbitda: number | null = null
      let priorNet: number | null    = null

      if (priorRaw) {
        const pGross = priorRaw.revenue - priorRaw.cogs
        priorGross  = priorRaw.revenue > 0 ? (pGross / priorRaw.revenue) * 100 : null
        const pEbitda = pGross - priorRaw.opex
        priorEbitda = priorRaw.revenue > 0 ? (pEbitda / priorRaw.revenue) * 100 : null
        const pTax  = pEbitda > 0 ? pEbitda * 0.20 : 0
        const pNet  = pEbitda - pTax
        priorNet    = priorRaw.revenue > 0 ? (pNet / priorRaw.revenue) * 100 : null
      }

      periods.push(this.buildPeriod(periodKeys[i], raw, priorGross, priorEbitda, priorNet))
    }

    const current = periods.length > 0 ? periods[periods.length - 1] : null

    // ── Trailing 12m averages ─────────────────────────────────────────────────
    const grossMargins = periods
      .map(p => p.gross_margin_pct)
      .filter((v): v is number => v !== null)
    const netMargins = periods
      .map(p => p.net_margin_pct)
      .filter((v): v is number => v !== null)

    const trailing_12m_avg_gross_margin = grossMargins.length > 0
      ? grossMargins.reduce((a, b) => a + b, 0) / grossMargins.length
      : null
    const trailing_12m_avg_net_margin = netMargins.length > 0
      ? netMargins.reduce((a, b) => a + b, 0) / netMargins.length
      : null

    // ── Best / worst gross margin periods ─────────────────────────────────────
    let bestKey:  string | null = null
    let worstKey: string | null = null
    let bestVal  = -Infinity
    let worstVal =  Infinity
    for (const p of periods) {
      if (p.gross_margin_pct !== null) {
        if (p.gross_margin_pct > bestVal)  { bestVal  = p.gross_margin_pct; bestKey  = p.period_key }
        if (p.gross_margin_pct < worstVal) { worstVal = p.gross_margin_pct; worstKey = p.period_key }
      }
    }

    // ── Overall trend: first 3 months vs last 3 months ────────────────────────
    let overall_gross_margin_trend: MarginTrendReport['overall_gross_margin_trend'] = 'insufficient_data'
    if (periods.length >= 6) {
      const first3 = periods.slice(0, 3)
        .map(p => p.gross_margin_pct)
        .filter((v): v is number => v !== null)
      const last3 = periods.slice(-3)
        .map(p => p.gross_margin_pct)
        .filter((v): v is number => v !== null)

      if (first3.length >= 2 && last3.length >= 2) {
        const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length
        const avgLast  = last3.reduce((a, b) => a + b, 0)  / last3.length
        overall_gross_margin_trend = classifyMarginTrend(avgLast - avgFirst)
      }
    }

    // ── Margin drivers: compare most recent vs 3 months ago ──────────────────
    type DriverEntry = {
      driver: 'cogs_increase' | 'cogs_decrease' | 'opex_increase' | 'opex_decrease' | 'revenue_growth' | 'revenue_decline'
      impact_try: number
      description: string
    }
    const margin_drivers: DriverEntry[] = []

    if (periods.length >= 4) {
      const recent = periods[periods.length - 1]
      const prior3 = periods[periods.length - 4]

      const cogsDiff    = recent.cogs_try - prior3.cogs_try
      const opexDiff    = recent.opex_try - prior3.opex_try
      const revenueDiff = recent.revenue_try - prior3.revenue_try

      const candidates: DriverEntry[] = []

      if (revenueDiff !== 0) {
        candidates.push({
          driver:      revenueDiff > 0 ? 'revenue_growth' : 'revenue_decline',
          impact_try:  Math.abs(revenueDiff),
          description: revenueDiff > 0
            ? `Ciro ${_fmtK(Math.abs(revenueDiff))} artışı brüt marjı destekledi`
            : `Ciro ${_fmtK(Math.abs(revenueDiff))} düşüşü marj baskısı yarattı`,
        })
      }

      if (cogsDiff !== 0) {
        candidates.push({
          driver:      cogsDiff > 0 ? 'cogs_increase' : 'cogs_decrease',
          impact_try:  Math.abs(cogsDiff),
          description: cogsDiff > 0
            ? `SMM ${_fmtK(Math.abs(cogsDiff))} artışı brüt marjı daralttı`
            : `SMM ${_fmtK(Math.abs(cogsDiff))} düşüşü brüt marjı genişletti`,
        })
      }

      if (opexDiff !== 0) {
        candidates.push({
          driver:      opexDiff > 0 ? 'opex_increase' : 'opex_decrease',
          impact_try:  Math.abs(opexDiff),
          description: opexDiff > 0
            ? `Operasyonel giderler ${_fmtK(Math.abs(opexDiff))} artarak EBITDA marjını daralttı`
            : `Operasyonel giderler ${_fmtK(Math.abs(opexDiff))} azalarak EBITDA marjını genişletti`,
        })
      }

      // Sort by absolute impact descending, take top 3
      candidates.sort((a, b) => b.impact_try - a.impact_try)
      margin_drivers.push(...candidates.slice(0, 3))
    }

    return {
      periods,
      current,
      trailing_12m_avg_gross_margin,
      trailing_12m_avg_net_margin,
      best_gross_margin_period:  bestKey,
      worst_gross_margin_period: worstKey,
      overall_gross_margin_trend,
      margin_drivers,
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _fmtK(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M₺`
  if (value >= 1_000)     return `${(value / 1_000).toFixed(0)}K₺`
  return `${value.toFixed(0)}₺`
}
