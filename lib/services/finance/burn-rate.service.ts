// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/burn-rate.service.ts
//
// Cash Burn Rate Monitor — detailed cash consumption trend analysis.
//
// For each of the last 6 calendar months:
//   gross_burn_try  = sum(expenses.amount_try) for that month
//   revenue_try     = sum(sales.total_try) for that month
//   net_burn_try    = gross_burn - revenue  (positive = burning cash)
//
// 3-month rolling average uses indices 0-2 (most recent 3 months).
//
// Burn trend:
//   accelerating  : current_month_burn > avg_3mo by >10%
//   decelerating  : current_month_burn < avg_3mo by >10%
//   stable        : within ±10%
//   insufficient_data: <3 months of data
//
// Runway = cash_balance / avg_net_burn
//   null if avg_net_burn ≤ 0 (not burning) or no cash balance data
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface MonthlyBurnData {
  month: string               // 'YYYY-MM'
  label: string               // 'Ocak 2026'
  gross_burn_try: number      // total expenses (all paid/partial/unpaid outflows)
  revenue_try: number         // total revenue
  net_burn_try: number        // gross_burn - revenue (positive = burning, negative = growing)
  cash_balance_try: number | null  // from balance sheet if available, else null
}

export interface BurnRateReport {
  months: MonthlyBurnData[]           // 6 months, newest first
  avg_monthly_burn_try: number        // 3-month rolling average of gross_burn
  avg_monthly_revenue_try: number     // 3-month rolling
  avg_net_burn_try: number            // 3-month rolling net burn
  current_month_burn_try: number      // most recent month gross burn
  current_month_revenue_try: number   // most recent month revenue
  burn_trend: 'accelerating' | 'stable' | 'decelerating' | 'insufficient_data'
  runway_estimate_months: number | null  // cash_balance / avg_net_burn (null if net burn ≤ 0 or no cash)
  peak_burn_month: string | null         // label of highest gross burn month
  peak_burn_try: number | null
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** Format a month key 'YYYY-MM' → Turkish label e.g. 'Ocak 2026' */
function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

/** Build list of 6 calendar months ending with the current month, newest first.
 *  Returns array of { year, month, key, label }.
 */
function buildMonthSlots(now: Date): Array<{ year: number; month: number; key: string; label: string }> {
  const slots = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key, label: monthLabel(year, month) })
  }
  return slots // newest first
}

/** First and last day of a month as YYYY-MM-DD strings */
function monthRange(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute burn trend from current month burn vs 3-month average.
 * Returns 'insufficient_data' if monthCount < 3.
 */
export function computeBurnTrend(
  currentBurn: number,
  avgBurn: number,
  monthCount: number,
): BurnRateReport['burn_trend'] {
  if (monthCount < 3) return 'insufficient_data'
  if (avgBurn <= 0) return 'insufficient_data'
  const ratio = currentBurn / avgBurn
  if (ratio > 1.1) return 'accelerating'
  if (ratio < 0.9) return 'decelerating'
  return 'stable'
}

/**
 * Compute runway in months.
 * Returns null if avgNetBurn ≤ 0 (not burning) or cashBalance is null/zero.
 */
export function computeRunway(
  cashBalance: number | null,
  avgNetBurn: number,
): number | null {
  if (cashBalance === null || cashBalance <= 0) return null
  if (avgNetBurn <= 0) return null
  return round2(cashBalance / avgNetBurn)
}

/**
 * Find the month with the highest gross burn.
 * Returns { month: null, try: null } for an empty array.
 */
export function findPeakBurnMonth(
  months: MonthlyBurnData[],
): { month: string | null; try: number | null } {
  if (months.length === 0) return { month: null, try: null }
  let peak = months[0]
  for (const m of months) {
    if (m.gross_burn_try > peak.gross_burn_try) peak = m
  }
  return { month: peak.label, try: peak.gross_burn_try }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BurnRateService {

  /**
   * Build a full BurnRateReport for the given company using the last 6 months.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<BurnRateReport> {
    const slots = buildMonthSlots(now)

    // ── Fetch all expenses and sales for the 6-month window in one query each ──
    const oldestSlot = slots[slots.length - 1]
    const newestSlot = slots[0]
    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to: windowTo }     = monthRange(newestSlot.year, newestSlot.month)

    const [expenseResult, salesResult] = await Promise.allSettled([
      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),
    ])

    // ── Aggregate per-month buckets ────────────────────────────────────────────
    const burnByMonth: Record<string, number> = {}
    const revByMonth:  Record<string, number> = {}

    for (const slot of slots) {
      burnByMonth[slot.key] = 0
      revByMonth[slot.key]  = 0
    }

    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7) // 'YYYY-MM'
        if (key in burnByMonth) {
          burnByMonth[key] = round2(burnByMonth[key] + (Number(row.amount_try) || 0))
        }
      }
    }

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const key = (row.sale_date as string).slice(0, 7)
        if (key in revByMonth) {
          revByMonth[key] = round2(revByMonth[key] + (Number(row.total_try) || 0))
        }
      }
    }

    // ── Build months array (newest first) ─────────────────────────────────────
    const months: MonthlyBurnData[] = slots.map(slot => {
      const gross_burn_try = burnByMonth[slot.key] ?? 0
      const revenue_try    = revByMonth[slot.key]  ?? 0
      const net_burn_try   = round2(gross_burn_try - revenue_try)
      return {
        month:            slot.key,
        label:            slot.label,
        gross_burn_try,
        revenue_try,
        net_burn_try,
        cash_balance_try: null, // balance sheet integration not wired per-month
      }
    })

    // ── 3-month rolling averages (indices 0-2 = newest 3 months) ──────────────
    const recentMonths = months.slice(0, 3)
    const monthCount   = recentMonths.length

    const avg_monthly_burn_try    = monthCount > 0
      ? round2(recentMonths.reduce((s, m) => s + m.gross_burn_try, 0) / monthCount)
      : 0
    const avg_monthly_revenue_try = monthCount > 0
      ? round2(recentMonths.reduce((s, m) => s + m.revenue_try, 0) / monthCount)
      : 0
    const avg_net_burn_try        = monthCount > 0
      ? round2(recentMonths.reduce((s, m) => s + m.net_burn_try, 0) / monthCount)
      : 0

    // ── Current month metrics ──────────────────────────────────────────────────
    const current_month_burn_try    = months[0]?.gross_burn_try ?? 0
    const current_month_revenue_try = months[0]?.revenue_try    ?? 0

    // ── Trend ─────────────────────────────────────────────────────────────────
    const burn_trend = computeBurnTrend(
      current_month_burn_try,
      avg_monthly_burn_try,
      monthCount,
    )

    // ── Runway ─────────────────────────────────────────────────────────────────
    // cash_balance_try is null at month level; would need balance sheet lookup.
    // For now we expose null — API layer or callers can enrich.
    const latestCashBalance = months[0]?.cash_balance_try ?? null
    const runway_estimate_months = computeRunway(latestCashBalance, avg_net_burn_try)

    // ── Peak burn ─────────────────────────────────────────────────────────────
    const peak = findPeakBurnMonth(months)

    return {
      months,
      avg_monthly_burn_try,
      avg_monthly_revenue_try,
      avg_net_burn_try,
      current_month_burn_try,
      current_month_revenue_try,
      burn_trend,
      runway_estimate_months,
      peak_burn_month: peak.month,
      peak_burn_try:   peak.try,
    }
  }
}
