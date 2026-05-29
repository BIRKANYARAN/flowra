// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cash-position.service.ts
//
// Cash Position Tracker — current cash position, idle cash analysis, and
// treasury recommendations for Turkish SMEs.
//
// Data sources:
//   balance_sheet_snapshots  → cash_and_equivalents_try (latest row)
//   sales                    → monthly revenue + unpaid balance for DSO
//   expenses                 → monthly expenses + unpaid balance for DPO
//
// Key metrics:
//   - Cash adequacy ratio (months of expenses covered)
//   - Days cash on hand
//   - Idle cash above reserve threshold
//   - 6-month forward cash projection
//   - Float gap (DSO vs DPO)
//   - Idle cash return opportunity at 8% p.a. (TR T-bill proxy)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CashPositionReport {
  as_of_date: string

  // Current position
  cash_balance: number | null           // from balance_sheet_snapshots
  min_cash_reserve: number              // 2× avg monthly expenses
  idle_cash: number                     // cash - reserve (can be negative)

  // Adequacy
  cash_adequacy_months: number | null
  cash_adequacy: ReturnType<typeof classifyCashAdequacy>
  days_cash_on_hand: number | null
  days_cash_classification: ReturnType<typeof classifyDaysCashOnHand>

  // Operational context
  avg_monthly_expenses: number
  avg_monthly_revenue: number
  avg_monthly_net_burn: number          // expenses - revenue (positive = burning)

  // Forward projection (6 months)
  projections: Array<{
    month: string                       // YYYY-MM
    projected_cash: number
    is_run_out: boolean
  }>
  cash_runway_months: number | null

  // Float analysis
  dso_days: number | null
  dpo_days: number | null
  float_gap: number | null              // in TRY
  float_position: ReturnType<typeof classifyFloatPosition>

  // Opportunity
  idle_cash_return_monthly: number | null   // potential at 8% annual (Turkish T-bill proxy)

  narrative: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Cash Balance Analysis
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute minimum operating cash reserve.
 * Typically 2 months of average monthly expenses.
 * Returns monthlyExpenses * reserveMonths (default 2).
 */
export function computeMinCashReserve(monthlyExpenses: number, reserveMonths = 2): number {
  return round2(monthlyExpenses * reserveMonths)
}

/**
 * Compute idle cash: cashBalance - minCashReserve.
 * Negative = cash deficit vs reserve target.
 */
export function computeIdleCash(cashBalance: number, minCashReserve: number): number {
  return round2(cashBalance - minCashReserve)
}

/**
 * Compute cash adequacy ratio: cashBalance / monthlyExpenses.
 * Returns null if monthlyExpenses === 0.
 * Tells you how many months of expenses the cash covers.
 */
export function computeCashAdequacyRatio(
  cashBalance: number,
  monthlyExpenses: number,
): number | null {
  if (monthlyExpenses === 0) return null
  return round2(cashBalance / monthlyExpenses)
}

/**
 * Classify cash adequacy.
 * 'critical': < 1 month of expenses
 * 'low': 1–2 months
 * 'adequate': 2–4 months
 * 'comfortable': 4–6 months
 * 'excess': > 6 months (cash drag — may be underinvested)
 * 'insufficient_data': null
 */
export function classifyCashAdequacy(
  months: number | null,
): 'critical' | 'low' | 'adequate' | 'comfortable' | 'excess' | 'insufficient_data' {
  if (months === null) return 'insufficient_data'
  if (months < 1) return 'critical'
  if (months < 2) return 'low'
  if (months < 4) return 'adequate'
  if (months <= 6) return 'comfortable'
  return 'excess'
}

// ─────────────────────────────────────────────────────────────────────────────
// Forward Cash Projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Project cash position N months forward.
 * startingCash: current cash balance
 * monthlyNetBurn: average net burn per month (positive = burning cash, negative = generating)
 * scheduledInflows: optional array of scheduled inflow amounts by month offset [0..N-1]
 * scheduledOutflows: optional array of scheduled outflow amounts by month offset [0..N-1]
 *
 * Returns array of { monthOffset, projectedCash } for months 1..N.
 * Stops projecting (marks with isRunOut=true) when projectedCash < 0.
 */
export function projectCashPosition(
  startingCash: number,
  monthlyNetBurn: number,
  months: number,
  scheduledInflows?: number[],
  scheduledOutflows?: number[],
): Array<{ monthOffset: number; projectedCash: number; isRunOut: boolean }> {
  const result: Array<{ monthOffset: number; projectedCash: number; isRunOut: boolean }> = []
  let current = startingCash
  let alreadyRunOut = false

  for (let i = 0; i < months; i++) {
    if (alreadyRunOut) {
      result.push({ monthOffset: i + 1, projectedCash: current, isRunOut: true })
      continue
    }
    const inflow = scheduledInflows?.[i] ?? 0
    const outflow = scheduledOutflows?.[i] ?? 0
    current = round2(current - monthlyNetBurn + inflow - outflow)
    const isRunOut = current < 0
    if (isRunOut) alreadyRunOut = true
    result.push({ monthOffset: i + 1, projectedCash: current, isRunOut })
  }

  return result
}

/**
 * Find cash runway from projected positions.
 * Returns months until first runOut, or null if never runs out in projection window.
 */
export function findCashRunway(
  projections: Array<{ monthOffset: number; projectedCash: number; isRunOut: boolean }>,
): number | null {
  for (const p of projections) {
    if (p.isRunOut) return p.monthOffset
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Idle Cash Opportunity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute potential return on idle cash if invested at given annualized rate.
 * monthlyReturn = idleCash * (annualRate / 12)
 * Returns null if idleCash <= 0.
 */
export function computeIdleCashReturn(idleCash: number, annualRate: number): number | null {
  if (idleCash <= 0) return null
  return round2(idleCash * (annualRate / 12))
}

/**
 * Compute float optimization opportunity.
 * floatGap = avgDailyRevenue * (dsoDays - dpoDays)
 * Positive = company is financing its customers more than suppliers finance it.
 * Returns null if any input is null.
 */
export function computeFloatGap(
  dsoDays: number | null,
  dpoDays: number | null,
  avgDailyRevenue: number | null,
): number | null {
  if (dsoDays === null || dpoDays === null || avgDailyRevenue === null) return null
  return round2(avgDailyRevenue * (dsoDays - dpoDays))
}

/**
 * Classify float position.
 * 'positive_float': DPO > DSO (suppliers finance longer than receivables take)
 * 'neutral': DPO ≈ DSO (within 5 days)
 * 'negative_float': DSO > DPO (company finances customers more)
 * 'no_data': any null input
 */
export function classifyFloatPosition(
  dsoDays: number | null,
  dpoDays: number | null,
): 'positive_float' | 'neutral' | 'negative_float' | 'no_data' {
  if (dsoDays === null || dpoDays === null) return 'no_data'
  const diff = dpoDays - dsoDays
  if (Math.abs(diff) <= 5) return 'neutral'
  if (diff > 0) return 'positive_float'
  return 'negative_float'
}

// ─────────────────────────────────────────────────────────────────────────────
// Treasury Metrics
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute cash conversion efficiency: operatingCashFlow / netIncome.
 * High ratio (> 1) = good quality earnings.
 * Returns null if netIncome === 0.
 */
export function computeCashConversionEfficiency(
  operatingCashFlow: number,
  netIncome: number,
): number | null {
  if (netIncome === 0) return null
  return round2(operatingCashFlow / netIncome)
}

/**
 * Compute days cash on hand: cashBalance / (annualExpenses / 365).
 * Returns null if annualExpenses === 0.
 */
export function computeDaysCashOnHand(
  cashBalance: number,
  annualExpenses: number,
): number | null {
  if (annualExpenses === 0) return null
  return round2(cashBalance / (annualExpenses / 365))
}

/**
 * Classify days cash on hand.
 * 'critical': < 15 days
 * 'low': 15–30 days
 * 'adequate': 30–60 days
 * 'strong': 60–90 days
 * 'very_strong': > 90 days
 * 'insufficient_data': null
 */
export function classifyDaysCashOnHand(
  days: number | null,
): 'critical' | 'low' | 'adequate' | 'strong' | 'very_strong' | 'insufficient_data' {
  if (days === null) return 'insufficient_data'
  if (days < 15) return 'critical'
  if (days < 30) return 'low'
  if (days < 60) return 'adequate'
  if (days <= 90) return 'strong'
  return 'very_strong'
}

/**
 * Generate Turkish cash position narrative.
 */
export function generateCashPositionNarrative(
  adequacy: ReturnType<typeof classifyCashAdequacy>,
  daysCash: number | null,
  idleCash: number,
  floatPosition: ReturnType<typeof classifyFloatPosition>,
): string {
  const parts: string[] = []

  // Adequacy message
  switch (adequacy) {
    case 'critical':
      parts.push('Nakit pozisyonu kritik seviyede: mevcut giderlerinizi karşılamak için 1 aydan az nakit bulunuyor.')
      break
    case 'low':
      parts.push('Nakit rezerviniz düşük: 1-2 aylık gider karşılığı nakit mevcut.')
      break
    case 'adequate':
      parts.push('Nakit pozisyonu yeterli seviyede: 2-4 aylık gider güvencesi sağlanmış.')
      break
    case 'comfortable':
      parts.push('Nakit pozisyonu rahat: 4-6 aylık gider karşılığı rezerv mevcut.')
      break
    case 'excess':
      parts.push('Nakit fazlası var: 6 aydan fazla gider karşılığı nakit tutulması getiri kaybına yol açabilir.')
      break
    case 'insufficient_data':
      parts.push('Nakit yeterliliği değerlendirilemedi: veri yetersiz.')
      break
  }

  // Days cash message
  if (daysCash !== null) {
    parts.push(`Nakit, ${Math.round(daysCash)} günlük giderleri karşılayacak kapasitede.`)
  }

  // Idle cash message
  if (idleCash > 0) {
    parts.push(`Minimum rezervin üzerinde ${idleCash.toLocaleString('tr-TR')} TL atıl nakit bulunuyor; kısa vadeli yatırım değerlendirilebilir.`)
  } else if (idleCash < 0) {
    parts.push(`Nakit, minimum rezervin ${Math.abs(idleCash).toLocaleString('tr-TR')} TL altında: rezerv açığı kapatılmalı.`)
  }

  // Float position message
  switch (floatPosition) {
    case 'positive_float':
      parts.push('Float pozisyonu avantajlı: tedarikçiler alacaklılardan daha uzun vadeli ödeme sağlıyor.')
      break
    case 'neutral':
      parts.push('Tahsilat ve ödeme süreleri dengeli.')
      break
    case 'negative_float':
      parts.push('Negatif float: müşterilere sağlanan vade, tedarikçilerden alınan vadeden uzun. Tahsilat süreleri kısaltılmalı.')
      break
    case 'no_data':
      break
  }

  return parts.join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Build list of 6 calendar months ending with the current month, newest first. */
function buildMonthSlots(now: Date): Array<{ year: number; month: number; key: string }> {
  const slots = []
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const key = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key })
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

/** Add N months to a YYYY-MM string */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class CashPositionService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(
    companyId: string,
    now: Date = new Date(),
  ): Promise<CashPositionReport> {
    const slots = buildMonthSlots(now)
    const newestSlot = slots[0]
    const oldestSlot = slots[slots.length - 1]
    const { from: windowFrom } = monthRange(oldestSlot.year, oldestSlot.month)
    const { to: windowTo }     = monthRange(newestSlot.year, newestSlot.month)
    const today = now.toISOString().slice(0, 10)

    // ── Parallel DB fetches ────────────────────────────────────────────────────
    const [
      cashResult,
      salesResult,
      expenseResult,
      unpaidSalesResult,
      unpaidExpensesResult,
    ] = await Promise.allSettled([
      // 1. Latest cash balance
      this.supabase
        .from('balance_sheet_snapshots')
        .select('cash_and_equivalents_try, as_of_date')
        .eq('company_id', companyId)
        .order('as_of_date', { ascending: false })
        .limit(1),

      // 2. Sales last 6 months
      this.supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      // 3. Expenses last 6 months
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // 4. Unpaid/partial sales for DSO numerator
      this.supabase
        .from('sales')
        .select('total_try, partial_amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'paid'),

      // 5. Unpaid expenses for DPO numerator
      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'paid'),
    ])

    // ── Cash balance ───────────────────────────────────────────────────────────
    const cashRow = cashResult.status === 'fulfilled'
      ? (cashResult.value?.data?.[0] ?? null)
      : null
    const cash_balance: number | null = cashRow?.cash_and_equivalents_try != null
      ? Number(cashRow.cash_and_equivalents_try)
      : null

    // ── Monthly aggregates ─────────────────────────────────────────────────────
    const revByMonth: Record<string, number> = {}
    const expByMonth: Record<string, number> = {}
    for (const slot of slots) {
      revByMonth[slot.key] = 0
      expByMonth[slot.key] = 0
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

    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const key = (row.expense_date as string).slice(0, 7)
        if (key in expByMonth) {
          expByMonth[key] = round2(expByMonth[key] + (Number(row.amount_try) || 0))
        }
      }
    }

    // Use the 3 most recent months for averages
    const recentSlots = slots.slice(0, 3)
    const count = recentSlots.length || 1
    const avg_monthly_revenue = round2(
      recentSlots.reduce((s, sl) => s + (revByMonth[sl.key] ?? 0), 0) / count,
    )
    const avg_monthly_expenses = round2(
      recentSlots.reduce((s, sl) => s + (expByMonth[sl.key] ?? 0), 0) / count,
    )
    const avg_monthly_net_burn = round2(avg_monthly_expenses - avg_monthly_revenue)

    // ── Cash metrics ───────────────────────────────────────────────────────────
    const min_cash_reserve = computeMinCashReserve(avg_monthly_expenses)
    const idle_cash = cash_balance !== null
      ? computeIdleCash(cash_balance, min_cash_reserve)
      : computeIdleCash(0, min_cash_reserve)
    const cash_adequacy_months = cash_balance !== null
      ? computeCashAdequacyRatio(cash_balance, avg_monthly_expenses)
      : null
    const cash_adequacy = classifyCashAdequacy(cash_adequacy_months)

    const annual_expenses = round2(avg_monthly_expenses * 12)
    const days_cash_on_hand = cash_balance !== null
      ? computeDaysCashOnHand(cash_balance, annual_expenses)
      : null
    const days_cash_classification = classifyDaysCashOnHand(days_cash_on_hand)

    // ── Forward projection (6 months) ─────────────────────────────────────────
    const startingCash = cash_balance ?? 0
    const rawProjections = projectCashPosition(startingCash, avg_monthly_net_burn, 6)
    const projections = rawProjections.map(p => ({
      month: addMonths(newestSlot.key, p.monthOffset),
      projected_cash: p.projectedCash,
      is_run_out: p.isRunOut,
    }))
    const cash_runway_months = findCashRunway(rawProjections)

    // ── DSO ────────────────────────────────────────────────────────────────────
    let dso_days: number | null = null
    if (
      unpaidSalesResult.status === 'fulfilled' &&
      unpaidSalesResult.value?.data &&
      avg_monthly_revenue > 0
    ) {
      const unpaidBalance = unpaidSalesResult.value.data.reduce((s: number, r: { total_try: unknown; partial_amount_try: unknown }) => {
        const total   = Number(r.total_try) || 0
        const partial = Number(r.partial_amount_try) || 0
        return s + (total - partial)
      }, 0)
      dso_days = round2(unpaidBalance / (avg_monthly_revenue / 30))
    }

    // ── DPO ────────────────────────────────────────────────────────────────────
    let dpo_days: number | null = null
    if (
      unpaidExpensesResult.status === 'fulfilled' &&
      unpaidExpensesResult.value?.data &&
      avg_monthly_expenses > 0
    ) {
      const unpaidExpenseBalance = unpaidExpensesResult.value.data.reduce((s: number, r: { amount_try: unknown }) => {
        return s + (Number(r.amount_try) || 0)
      }, 0)
      dpo_days = round2(unpaidExpenseBalance / (avg_monthly_expenses / 30))
    }

    // ── Float ──────────────────────────────────────────────────────────────────
    const avg_daily_revenue = avg_monthly_revenue > 0 ? round2(avg_monthly_revenue / 30) : null
    const float_gap = computeFloatGap(dso_days, dpo_days, avg_daily_revenue)
    const float_position = classifyFloatPosition(dso_days, dpo_days)

    // ── Idle cash return at 8% annual (Turkish T-bill proxy) ──────────────────
    const idle_cash_return_monthly = computeIdleCashReturn(idle_cash, 0.08)

    // ── Narrative ──────────────────────────────────────────────────────────────
    const narrative = generateCashPositionNarrative(
      cash_adequacy,
      days_cash_on_hand,
      idle_cash,
      float_position,
    )

    return {
      as_of_date: today,
      cash_balance,
      min_cash_reserve,
      idle_cash,
      cash_adequacy_months,
      cash_adequacy,
      days_cash_on_hand,
      days_cash_classification,
      avg_monthly_expenses,
      avg_monthly_revenue,
      avg_monthly_net_burn,
      projections,
      cash_runway_months,
      dso_days,
      dpo_days,
      float_gap,
      float_position,
      idle_cash_return_monthly,
      narrative,
    }
  }
}
