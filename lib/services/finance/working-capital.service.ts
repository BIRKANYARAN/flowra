// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/working-capital.service.ts
//
// Working Capital Intelligence — DSO, DPO, DIO, CCC metrics.
//
// DSO (Days Sales Outstanding):
//   Actuals method : avg(paid_at - sale_date) for sales paid in period
//   Formula method : (total_outstanding_receivables / period_revenue) × days
//
// DPO (Days Payable Outstanding):
//   Formula method : (total_unpaid_expenses / total_expenses) × days
//   (No paid_at column on expenses table — formula only)
//
// DIO (Days Inventory Outstanding):
//   Formula method : (inventory_value / period_cogs) × days
//   Returns null when no inventory data is available.
//
// CCC (Cash Conversion Cycle):
//   CCC = DSO + DIO - DPO   (DIO omitted when null)
//   Negative CCC = excellent (collected before paying)
//   Positive CCC = you finance your customers
//
// Trends: compared against prior period of equal length.
//   DSO improving = decreasing (collecting faster)
//   DPO improving = increasing (paying slower, holding cash longer)
//   ±5 days = stable
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface WorkingCapitalMetrics {
  period_from: string
  period_to: string
  days_in_period: number

  // DSO
  dso_days: number | null          // average days to collect (actuals method)
  dso_formula_days: number | null  // formula-based: (receivables/revenue)×days
  dso_trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'

  // DPO
  dpo_days: number | null
  dpo_formula_days: number | null
  dpo_trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'

  // DIO
  dio_days: number | null          // null if no inventory data

  // CCC
  ccc_days: number | null          // DSO + DIO - DPO
  ccc_grade: 'excellent' | 'good' | 'fair' | 'poor'

  // Underlying data
  total_revenue_try: number
  total_receivables_try: number    // outstanding receivables at period end
  avg_receivables_try: number      // (opening + closing receivables) / 2
  total_cogs_try: number
  total_payables_try: number       // unpaid expenses at period end
  inventory_value_try: number | null

  // Historical comparison
  prior_dso_days: number | null
  prior_dpo_days: number | null
  prior_ccc_days: number | null

  computed_at: string
}

// ── Pure helper: diff in days between two YYYY-MM-DD strings ──────────────────
function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to   + 'T00:00:00Z').getTime()
  return Math.round((b - a) / msPerDay)
}

function daysInRange(from: string, to: string): number {
  return daysBetween(from, to) + 1
}

// ── Prior period of same length ───────────────────────────────────────────────
function priorPeriod(from: string, to: string): { from: string; to: string } {
  const days = daysBetween(from, to) + 1  // length of current period
  const toDate  = new Date(from + 'T00:00:00Z')
  toDate.setDate(toDate.getDate() - 1)    // day before current period starts
  const fromDate = new Date(toDate.getTime())
  fromDate.setDate(fromDate.getDate() - (days - 1))
  return {
    from: fromDate.toISOString().slice(0, 10),
    to:   toDate.toISOString().slice(0, 10),
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

// ── Trend classification ──────────────────────────────────────────────────────
type Trend = 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'

function dsoCcTrend(current: number | null, prior: number | null): Trend {
  if (current === null || prior === null) return 'insufficient_data'
  const diff = current - prior
  if (diff < -5) return 'improving'      // collecting faster
  if (diff >  5) return 'deteriorating'  // collecting slower
  return 'stable'
}

function dpoCcTrend(current: number | null, prior: number | null): Trend {
  if (current === null || prior === null) return 'insufficient_data'
  const diff = current - prior
  if (diff >  5) return 'improving'      // paying slower = holding cash longer
  if (diff < -5) return 'deteriorating'  // paying faster = giving up float
  return 'stable'
}

// ── CCC grade ─────────────────────────────────────────────────────────────────
function cccGrade(ccc: number | null): 'excellent' | 'good' | 'fair' | 'poor' {
  if (ccc === null) return 'fair'
  if (ccc <   0) return 'excellent'
  if (ccc <  30) return 'good'
  if (ccc <  60) return 'fair'
  return 'poor'
}

// ── Core compute for one period ───────────────────────────────────────────────

interface PeriodResult {
  dso_days: number | null
  dso_formula_days: number | null
  dpo_days: number | null
  dpo_formula_days: number | null
  dio_days: number | null
  ccc_days: number | null
  total_revenue_try: number
  total_receivables_try: number
  avg_receivables_try: number
  total_cogs_try: number
  total_payables_try: number
  inventory_value_try: number | null
}

async function computePeriod(
  companyId: string,
  supabase: AnyClient,
  from: string,
  to: string,
): Promise<PeriodResult> {
  const days = daysInRange(from, to)

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    salesResult,
    paidSalesResult,
    expensesResult,
    inventoryResult,
    openingReceivablesResult,
  ] = await Promise.all([

    // All sales in period — for revenue and current receivables
    supabase
      .from('sales')
      .select('total_try, cogs, payment_status, paid_at, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),

    // Sales paid in this period (paid_at in period) — for DSO actuals method
    supabase
      .from('sales')
      .select('sale_date, paid_at, total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('payment_status', 'paid')
      .gte('paid_at', from)
      .lte('paid_at', to + 'T23:59:59.999Z'),

    // Expenses in period — for DPO
    supabase
      .from('expenses')
      .select('amount_try, payment_status, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),

    // Inventory (stock lots) at period end — for DIO
    supabase
      .from('stock_lots')
      .select('qty_remaining, cost_price_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0)
      .lte('received_at', to),

    // Opening receivables (outstanding at period start) — for avg receivables
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .lt('sale_date', from),
  ])

  const sales      = salesResult.data      ?? []
  const paidSales  = paidSalesResult.data  ?? []
  const expenses   = expensesResult.data   ?? []
  const stockLots  = inventoryResult.data  ?? []
  const openingRec = openingReceivablesResult.data ?? []

  // ── Revenue and COGS ───────────────────────────────────────────────────────
  let total_revenue_try = 0
  let total_cogs_try    = 0
  let closing_receivables = 0

  for (const s of sales) {
    total_revenue_try += Number(s.total_try) || 0
    total_cogs_try    += Number(s.cogs)      || 0
    if (['pending', 'partial', 'overdue'].includes(s.payment_status)) {
      closing_receivables += Number(s.total_try) || 0
    }
  }

  // ── Receivables ────────────────────────────────────────────────────────────
  const opening_receivables = openingRec.reduce(
    (sum: number, r: { total_try: number }) => sum + (Number(r.total_try) || 0),
    0,
  )

  const avg_receivables_try = round2((opening_receivables + closing_receivables) / 2)

  // ── DSO — actuals method ───────────────────────────────────────────────────
  let dso_days: number | null = null
  if (paidSales.length > 0) {
    const totalDays = paidSales.reduce((sum: number, s: { sale_date: string; paid_at: string }) => {
      if (!s.paid_at || !s.sale_date) return sum
      const d = daysBetween(s.sale_date, s.paid_at.slice(0, 10))
      return sum + Math.max(0, d)
    }, 0)
    dso_days = round2(totalDays / paidSales.length)
  }

  // ── DSO — formula method ───────────────────────────────────────────────────
  let dso_formula_days: number | null = null
  if (total_revenue_try > 0) {
    dso_formula_days = round2((closing_receivables / total_revenue_try) * days)
  }

  // ── Expenses ───────────────────────────────────────────────────────────────
  let total_expenses_try = 0
  let unpaid_expenses_try = 0

  for (const e of expenses) {
    const amt = Number(e.amount_try) || 0
    total_expenses_try += amt
    if (e.payment_status !== 'paid') {
      unpaid_expenses_try += amt
    }
  }

  const total_payables_try = unpaid_expenses_try

  // ── DPO — formula method ───────────────────────────────────────────────────
  let dpo_days: number | null = null
  let dpo_formula_days: number | null = null

  if (total_expenses_try > 0) {
    dpo_formula_days = round2((unpaid_expenses_try / total_expenses_try) * days)
    dpo_days = dpo_formula_days
  }

  // ── Inventory ─────────────────────────────────────────────────────────────
  const inventory_value_try = stockLots.length > 0
    ? round2(stockLots.reduce((sum: number, lot: { qty_remaining: number; cost_price_try: number }) =>
        sum + (Number(lot.qty_remaining) || 0) * (Number(lot.cost_price_try) || 0), 0
      ))
    : null

  // ── DIO ────────────────────────────────────────────────────────────────────
  let dio_days: number | null = null
  if (inventory_value_try !== null && total_cogs_try > 0) {
    dio_days = round2((inventory_value_try / total_cogs_try) * days)
  }

  // ── CCC ────────────────────────────────────────────────────────────────────
  const effectiveDso = dso_days ?? dso_formula_days
  const effectiveDpo = dpo_days ?? dpo_formula_days
  let ccc_days: number | null = null

  if (effectiveDso !== null && effectiveDpo !== null) {
    ccc_days = round2(
      effectiveDso + (dio_days ?? 0) - effectiveDpo
    )
  }

  return {
    dso_days,
    dso_formula_days,
    dpo_days,
    dpo_formula_days,
    dio_days,
    ccc_days,
    total_revenue_try:    round2(total_revenue_try),
    total_receivables_try: round2(closing_receivables),
    avg_receivables_try,
    total_cogs_try:       round2(total_cogs_try),
    total_payables_try:   round2(total_payables_try),
    inventory_value_try,
  }
}

// ── NEW: 12-Month Report types and pure exports ───────────────────────────────

export interface WorkingCapitalMonth {
  month: string         // 'YYYY-MM'
  label: string
  // CCC components
  dio_days: number | null
  dso_days: number | null
  dpo_days: number | null
  ccc_days: number | null
  // Position
  current_assets: number
  current_liabilities: number
  working_capital: number
  current_ratio: number | null
  quick_ratio: number | null
}

export interface WorkingCapitalReport {
  company_id: string
  months: WorkingCapitalMonth[]  // last 12 months
  // Current month metrics (most recent)
  current_ccc_days: number | null
  current_ratio: number | null
  quick_ratio: number | null
  working_capital: number
  // Trends
  ccc_trend: 'improving' | 'deteriorating' | 'stable' | 'insufficient'
  liquidity_trend: 'improving' | 'deteriorating' | 'stable' | 'insufficient'
  // Benchmarks
  ccc_benchmark_days: number   // 45 (healthy for Turkish SME retail)
  current_ratio_benchmark: number  // 1.5
  // Risk flags
  negative_working_capital: boolean
  high_ccc: boolean              // CCC > 60 days
  low_current_ratio: boolean     // current_ratio < 1.2
  computed_at: string
}

// ── Pure exports (all unit-testable) ─────────────────────────────────────────

/** DIO = (avg_inventory / cogs) × 30. Returns null when cogs = 0. */
export function computeDIO(avgInventory: number, cogs: number): number | null {
  if (cogs === 0) return null
  return round2((avgInventory / cogs) * 30)
}

/** DSO = (avg_receivables / revenue) × 30. Returns null when revenue = 0. */
export function computeDSO(avgReceivables: number, revenue: number): number | null {
  if (revenue === 0) return null
  return round2((avgReceivables / revenue) * 30)
}

/** DPO = (avg_payables / cogs) × 30. Returns null when cogs = 0. */
export function computeDPO(avgPayables: number, cogs: number): number | null {
  if (cogs === 0) return 0  // no COGS → assume no payables → DPO = 0
  return round2((avgPayables / cogs) * 30)
}

/** CCC = DIO + DSO - DPO. Any null DIO is treated as 0. Returns null if DSO or DPO is null. */
export function computeCCC(
  dio: number | null,
  dso: number | null,
  dpo: number | null,
): number | null {
  if (dso === null || dpo === null) return null
  return round2((dio ?? 0) + dso - dpo)
}

/** Working capital = current_assets - current_liabilities. */
export function computeWorkingCapital(currentAssets: number, currentLiabilities: number): number {
  return round2(currentAssets - currentLiabilities)
}

/** Current ratio = current_assets / current_liabilities. Returns null when liabilities = 0. */
export function computeCurrentRatio(currentAssets: number, currentLiabilities: number): number | null {
  if (currentLiabilities === 0) return null
  return round2(currentAssets / currentLiabilities)
}

/** Quick ratio = (cash + receivables) / current_liabilities. Returns null when liabilities = 0. */
export function computeQuickRatio(
  cash: number,
  receivables: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return round2((cash + receivables) / currentLiabilities)
}

/**
 * Classify CCC trend: compare avg of last 3 months vs prior 3.
 * > 3 days better (lower) = improving; > 3 days worse (higher) = deteriorating.
 * Returns 'insufficient' when fewer than 6 valid months.
 */
export function classifyCCCTrend(
  months: Array<{ ccc_days: number | null }>,
): 'improving' | 'deteriorating' | 'stable' | 'insufficient' {
  const valid = months.filter(m => m.ccc_days !== null)
  if (valid.length < 6) return 'insufficient'
  // months[0] = most recent
  const recent = valid.slice(0, 3)
  const prior  = valid.slice(3, 6)
  const avgRecent = recent.reduce((s, m) => s + m.ccc_days!, 0) / recent.length
  const avgPrior  = prior.reduce((s, m) => s + m.ccc_days!, 0) / prior.length
  const diff = avgRecent - avgPrior  // negative = getting better
  if (diff < -3) return 'improving'
  if (diff >  3) return 'deteriorating'
  return 'stable'
}

/** Classify liquidity trend from current_ratio month array. */
function classifyLiquidityTrend(
  months: Array<{ current_ratio: number | null }>,
): 'improving' | 'deteriorating' | 'stable' | 'insufficient' {
  const valid = months.filter(m => m.current_ratio !== null)
  if (valid.length < 6) return 'insufficient'
  const recent = valid.slice(0, 3)
  const prior  = valid.slice(3, 6)
  const avgRecent = recent.reduce((s, m) => s + m.current_ratio!, 0) / recent.length
  const avgPrior  = prior.reduce((s, m) => s + m.current_ratio!, 0) / prior.length
  const diff = avgRecent - avgPrior  // positive = improving
  if (diff >  0.1) return 'improving'
  if (diff < -0.1) return 'deteriorating'
  return 'stable'
}

// ── Month helpers (local, mirrors burn-rate pattern) ─────────────────────────

function monthLabelTR(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  })
}

function buildMonthSlots12(now: Date) {
  const slots = []
  for (let i = 0; i < 12; i++) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year  = d.getFullYear()
    const month = d.getMonth() + 1
    const key   = `${year}-${String(month).padStart(2, '0')}`
    slots.push({ year, month, key, label: monthLabelTR(year, month) })
  }
  return slots  // newest first
}

function monthRange12(year: number, month: number): { from: string; to: string } {
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

// ── Public API ────────────────────────────────────────────────────────────────

export class WorkingCapitalService {
  static async compute(
    companyId: string,
    _uid: string,
    supabase: AnyClient,
    period: { from: string; to: string },
    opts?: { today?: string },
  ): Promise<WorkingCapitalMetrics> {
    const { from, to } = period
    const prior = priorPeriod(from, to)

    // Compute current and prior periods in parallel
    const [current, prev] = await Promise.all([
      computePeriod(companyId, supabase, from, to),
      computePeriod(companyId, supabase, prior.from, prior.to),
    ])

    const effectiveDso = current.dso_days ?? current.dso_formula_days
    const effectivePriorDso = prev.dso_days ?? prev.dso_formula_days
    const effectiveDpo = current.dpo_days ?? current.dpo_formula_days
    const effectivePriorDpo = prev.dpo_days ?? prev.dpo_formula_days

    return {
      period_from:    from,
      period_to:      to,
      days_in_period: daysInRange(from, to),

      dso_days:         current.dso_days,
      dso_formula_days: current.dso_formula_days,
      dso_trend:        dsoCcTrend(effectiveDso, effectivePriorDso),

      dpo_days:         current.dpo_days,
      dpo_formula_days: current.dpo_formula_days,
      dpo_trend:        dpoCcTrend(effectiveDpo, effectivePriorDpo),

      dio_days:  current.dio_days,

      ccc_days:  current.ccc_days,
      ccc_grade: cccGrade(current.ccc_days),

      total_revenue_try:     current.total_revenue_try,
      total_receivables_try: current.total_receivables_try,
      avg_receivables_try:   current.avg_receivables_try,
      total_cogs_try:        current.total_cogs_try,
      total_payables_try:    current.total_payables_try,
      inventory_value_try:   current.inventory_value_try,

      prior_dso_days: effectivePriorDso,
      prior_dpo_days: effectivePriorDpo,
      prior_ccc_days: prev.ccc_days,

      computed_at: (opts?.today ?? new Date().toISOString()),
    }
  }

  /**
   * Build a 12-month WorkingCapitalReport.
   * Each month is computed independently using month-scoped queries.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<WorkingCapitalReport> {
    const slots = buildMonthSlots12(now)
    // oldest→newest window
    const oldest = slots[slots.length - 1]
    const newest = slots[0]
    const windowFrom = monthRange12(oldest.year, oldest.month).from
    const windowTo   = monthRange12(newest.year, newest.month).to

    // ── Single-window fetches ─────────────────────────────────────────────────
    const [salesRes, expensesRes, stockLotsRes] = await Promise.allSettled([
      supabase
        .from('sales')
        .select('sale_date, total_try, payment_status, amount_paid')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'deleted')
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo),

      supabase
        .from('expenses')
        .select('expense_date, amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),

      // Inventory at end-of-window (qty_remaining column per schema)
      supabase
        .from('stock_lots')
        .select('qty_remaining, entry_cost_try, company_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),
    ])

    const allSales    = (salesRes.status    === 'fulfilled' ? salesRes.value?.data    : null) ?? []
    const allExpenses = (expensesRes.status === 'fulfilled' ? expensesRes.value?.data : null) ?? []
    // stock_lots: use qty_remaining (confirmed in schema index) and entry_cost_try
    const allLots     = (stockLotsRes.status === 'fulfilled' ? stockLotsRes.value?.data : null) ?? []

    // Total current inventory value (same for all months — snapshot)
    const totalInventoryValue = allLots.reduce((s: number, lot: Record<string, unknown>) => {
      const qty  = Number(lot['qty_remaining'] ?? lot['remaining_qty'] ?? 0)
      const cost = Number(lot['entry_cost_try'] ?? lot['cost_price_try'] ?? 0)
      return s + qty * cost
    }, 0)

    // ── Per-month aggregation ─────────────────────────────────────────────────
    interface MonthAgg {
      revenue: number
      cogs: number
      receivables: number   // outstanding at month end
      payables: number      // unpaid expenses at month end
      cashCollected: number // paid amounts in month
      cashPaid: number      // paid expenses in month
    }

    const monthAgg: Record<string, MonthAgg> = {}
    for (const slot of slots) {
      monthAgg[slot.key] = { revenue: 0, cogs: 0, receivables: 0, payables: 0, cashCollected: 0, cashPaid: 0 }
    }

    for (const s of allSales) {
      const key = String(s['sale_date'] ?? '').slice(0, 7)
      if (!(key in monthAgg)) continue
      const total = Number(s['total_try']) || 0
      const paid  = Number(s['amount_paid'] ?? 0)
      const status = String(s['payment_status'] ?? 'unpaid')
      monthAgg[key].revenue += total
      // Receivable = unpaid portion of open sales
      if (status !== 'paid') {
        monthAgg[key].receivables += total - paid
      } else {
        monthAgg[key].cashCollected += total
      }
    }

    for (const e of allExpenses) {
      const key = String(e['expense_date'] ?? '').slice(0, 7)
      if (!(key in monthAgg)) continue
      const amt    = Number(e['amount_try']) || 0
      const status = String(e['payment_status'] ?? 'unpaid')
      if (status !== 'paid') {
        monthAgg[key].payables += amt
      } else {
        monthAgg[key].cashPaid += amt
      }
    }

    // Rough rolling cash estimate (cumulative from oldest to newest)
    let runningCash = 0

    // Build months array (newest first like the slots)
    // We need oldest-first for cash accumulation, then reverse
    const slotsAsc = [...slots].reverse()  // oldest first

    const monthsAsc: WorkingCapitalMonth[] = slotsAsc.map(slot => {
      const agg  = monthAgg[slot.key]!
      runningCash += agg.cashCollected - agg.cashPaid

      const cashEstimate = Math.max(0, runningCash)
      const receivables  = agg.receivables
      const inventory    = totalInventoryValue
      const payables     = agg.payables

      // Working capital position
      const current_assets      = cashEstimate + receivables + inventory
      const current_liabilities = payables
      const working_capital     = computeWorkingCapital(current_assets, current_liabilities)
      const current_ratio       = computeCurrentRatio(current_assets, current_liabilities)
      const quick_ratio         = computeQuickRatio(cashEstimate, receivables, current_liabilities)

      // CCC — use formula method (monthly, 30-day basis)
      const dso = computeDSO(receivables, agg.revenue)
      // For DIO and DPO use COGS if available — fall back to revenue proxy
      // COGS data not directly available per-month without sale_item_allocations;
      // use revenue as proxy (conservative) when cogs=0
      const cogs = agg.cogs > 0 ? agg.cogs : agg.revenue * 0.6
      const dio  = inventory > 0 && cogs > 0 ? computeDIO(inventory, cogs) : null
      const dpo  = computeDPO(payables, cogs)
      const ccc  = computeCCC(dio, dso, dpo)

      return {
        month: slot.key,
        label: slot.label,
        dio_days: dio,
        dso_days: dso,
        dpo_days: dpo,
        ccc_days: ccc,
        current_assets:      round2(current_assets),
        current_liabilities: round2(current_liabilities),
        working_capital,
        current_ratio,
        quick_ratio,
      }
    })

    // newest first
    const months = [...monthsAsc].reverse()

    const current = months[0]!
    const ccc_trend       = classifyCCCTrend(months)
    const liquidity_trend = classifyLiquidityTrend(months)

    return {
      company_id:   companyId,
      months,
      current_ccc_days:  current.ccc_days,
      current_ratio:     current.current_ratio,
      quick_ratio:       current.quick_ratio,
      working_capital:   current.working_capital,
      ccc_trend,
      liquidity_trend,
      ccc_benchmark_days:       45,
      current_ratio_benchmark:  1.5,
      negative_working_capital: current.working_capital < 0,
      high_ccc:          current.ccc_days !== null && current.ccc_days > 60,
      low_current_ratio: current.current_ratio !== null && current.current_ratio < 1.2,
      computed_at: new Date().toISOString(),
    }
  }
}
