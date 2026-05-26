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
}
