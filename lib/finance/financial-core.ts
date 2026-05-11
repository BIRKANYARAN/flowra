// ═══════════════════════════════════════════════════════════════════════════════
// lib/finance/financial-core.ts
//
// Canonical server-side data fetchers for CFO metrics.
//
// WHY THIS EXISTS:
//   Server components cannot call their own API routes without an HTTP round-trip
//   (latency + cookie forwarding complexity). This module exposes the exact same
//   query logic as /api/cfo-metrics and /api/simulation/runway as direct async
//   functions that server components call inline.
//
//   API routes become thin wrappers:
//     getCfoMetrics()       ← /api/cfo-metrics
//     getRunwayForecast()   ← /api/simulation/runway
//
// CALLERS:
//   • app/dashboard/ceo/page.tsx         (server component — direct call)
//   • app/api/cfo-metrics/route.ts       (API wrapper — unchanged response shape)
//   • app/api/simulation/runway/route.ts (API wrapper — unchanged response shape)
//
// RULE: Never import from this file in client components.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import {
  computeCashMetrics,
  computeBurnMetrics,
  computeReceivableMetrics,
  computeTaxMetrics,
  computePartnerMetrics,
  computeStockMetrics,
  computeRunwayForecast,
  BURN_EXPENSE_TYPES,
  type CfoMetrics,
  type RunwayForecast,
} from '@/lib/finance/cfo-metrics'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'

// ── Canonical period type ─────────────────────────────────────────────────────

export interface CorePeriod {
  from: string   // YYYY-MM-DD
  to:   string   // YYYY-MM-DD
}

// ── RunwayForecastResponse — matches /api/simulation/runway response shape ────

export interface RunwayForecastResponse extends RunwayForecast {
  inputs: {
    starting_cash:     number
    monthly_burn:      number
    outstanding_total: number
    horizon_months:    number
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function currentPeriod(): CorePeriod {
  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  return {
    from: `${year}-${mon}-01`,
    to:   now.toISOString().slice(0, 10),
  }
}

// ── Cashflow timeline — matches /api/cashflow response shape ─────────────────

export interface CashflowTimelineOpts {
  pastMonths?:   number   // default 6, max 12
  futureMonths?: number   // default 6, max 12
}

/** Pressure severity for a projected month */
export interface PressureSignal {
  month:    string
  severity: 'critical' | 'warn' | 'ok'
  reasons:  string[]
}

/** Extended cashflow result with pressure analysis */
export interface CashflowTimelineResult {
  months:          import('@/types').CashflowMonth[]
  pressureSignals: PressureSignal[]
  firstDangerMonth: string | null   // first future month where cumulative < 0
  totalReceivables: number           // sum of all outstanding receivables in window
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function _toYM(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d.slice(0, 10) + 'T00:00:00Z') : d
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}
function _addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total  = (y * 12 + (m - 1)) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
function _monthDiff(ymA: string, ymB: string): number {
  const [ya, ma] = ymA.split('-').map(Number)
  const [yb, mb] = ymB.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}
function _ymStart(ym: string): string { return `${ym}-01` }
function _ymEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
const _CASH_EXCLUDED = new Set([
  'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer',
])

export async function getCashflowTimeline(
  companyId: string,
  opts?: CashflowTimelineOpts,
): Promise<CashflowTimelineResult> {
  const pastMonths   = Math.min(Math.max(opts?.pastMonths   ?? 6, 1), 12)
  const futureMonths = Math.min(Math.max(opts?.futureMonths ?? 6, 1), 12)
  const nowYM        = _toYM(new Date())
  const startYM      = _addMonths(nowYM, -pastMonths)
  const endYM        = _addMonths(nowYM, futureMonths - 1)
  const windowSize   = pastMonths + futureMonths

  const supabase = createClient()

  type MonthRow = {
    month: string; invoiced: number; collected: number; receivable: number
    expenses: number; net: number; cumulative: number; is_projected: boolean
  }
  const months = new Map<string, MonthRow>()
  for (let i = 0; i < windowSize; i++) {
    const ym = _addMonths(startYM, i)
    months.set(ym, {
      month: ym, invoiced: 0, collected: 0, receivable: 0,
      expenses: 0, net: 0, cumulative: 0, is_projected: _monthDiff(nowYM, ym) > 0,
    })
  }

  const [invoicedRes, receivablesRes, collectionsRes, expensesRes, recurringsRes] =
    await Promise.all([
      supabase.from('sales').select('total_try, created_at')
        .eq('company_id', companyId).is('deleted_at', null)
        .gte('created_at', _ymStart(startYM)).lte('created_at', _ymEnd(endYM) + 'T23:59:59Z'),
      supabase.from('sales').select('total_try, created_at')
        .eq('company_id', companyId).is('deleted_at', null)
        .in('payment_status', ['unpaid', 'partial', 'overdue'])
        .gte('created_at', _ymStart(startYM)).lte('created_at', _ymEnd(endYM) + 'T23:59:59Z'),
      supabase.from('sales').select('total_try, paid_at')
        .eq('company_id', companyId).eq('payment_status', 'paid')
        .is('deleted_at', null).not('paid_at', 'is', null)
        .gte('paid_at', _ymStart(startYM)).lte('paid_at', _ymEnd(endYM) + 'T23:59:59Z'),
      supabase.from('expenses').select('amount_try, expense_date, expense_type')
        .eq('company_id', companyId).eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', _ymStart(startYM)).lte('expense_date', _ymEnd(endYM)),
      supabase.from('recurring_expenses')
        .select('amount, fx_rate, frequency, start_date, end_date, expense_type')
        .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null),
    ])

  for (const s of invoicedRes.data ?? []) {
    const row = months.get(_toYM(s.created_at as string))
    if (row) row.invoiced += Number(s.total_try ?? 0)
  }
  for (const s of receivablesRes.data ?? []) {
    const row = months.get(_toYM(s.created_at as string))
    if (row) row.receivable += Number(s.total_try ?? 0)
  }
  for (const c of collectionsRes.data ?? []) {
    const row = months.get(_toYM(c.paid_at as string))
    if (row) row.collected += Number(c.total_try ?? 0)
  }
  for (const e of expensesRes.data ?? []) {
    const et = String(e.expense_type ?? '')
    if (et && _CASH_EXCLUDED.has(et)) continue
    const row = months.get((e.expense_date as string).slice(0, 7))
    if (row) row.expenses += Number(e.amount_try ?? 0)
  }
  for (const rec of recurringsRes.data ?? []) {
    const et = String(rec.expense_type ?? '')
    if (et && _CASH_EXCLUDED.has(et)) continue
    const recStart = _toYM(rec.start_date as string)
    const recEnd   = rec.end_date ? _toYM(rec.end_date as string) : null
    const amtTry   = Number(rec.amount) * Number(rec.fx_rate)
    const freq     = rec.frequency as 'monthly' | 'quarterly' | 'yearly'
    const step     = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12
    for (const [ym, row] of months) {
      if (!row.is_projected) continue
      if (_monthDiff(recStart, ym) < 0) continue
      if (recEnd && _monthDiff(ym, recEnd) < 0) continue
      if (_monthDiff(recStart, ym) % step !== 0) continue
      row.expenses += amtTry
    }
  }

  // Net + cumulative
  let cumulative = 0
  const result: import('@/types').CashflowMonth[] = []
  for (const ym of Array.from(months.keys()).sort()) {
    const row  = months.get(ym)!
    row.net    = r2(row.collected - row.expenses)
    cumulative = r2(cumulative + row.net)
    row.cumulative = cumulative
    result.push(row as import('@/types').CashflowMonth)
  }

  // ── Pressure analysis — projected months only ─────────────────────────────
  const pressureSignals: PressureSignal[] = []
  let firstDangerMonth: string | null = null
  let totalReceivables = 0

  for (const m of result) {
    totalReceivables += m.receivable
    if (!m.is_projected) continue

    const reasons: string[] = []
    if (m.net < 0)           reasons.push(`Negatif nakit akışı (${_fmtPressure(m.net)} TL)`)
    if (m.cumulative < 0)    reasons.push(`Kümülatif nakit ekside (${_fmtPressure(m.cumulative)} TL)`)
    if (m.receivable > 0 && m.collected === 0)
      reasons.push(`Tahsilat yok — ${_fmtPressure(m.receivable)} TL alacak bekliyor`)

    const severity: PressureSignal['severity'] = cashflowPressureSeverity(m.net, m.cumulative)

    if (severity !== 'ok') pressureSignals.push({ month: m.month, severity, reasons })
    if (m.cumulative < 0 && !firstDangerMonth) firstDangerMonth = m.month
  }

  return { months: result, pressureSignals, firstDangerMonth, totalReceivables: r2(totalReceivables) }
}

/**
 * Pure pressure severity rule:
 *   cumulative < 0 → 'critical' (overall cash depleted)
 *   net < 0        → 'warn'     (this month burns more than it earns)
 *   otherwise      → 'ok'
 */
export function cashflowPressureSeverity(net: number, cumulative: number): PressureSignal['severity'] {
  if (cumulative < 0) return 'critical'
  if (net < 0)        return 'warn'
  return 'ok'
}

function _fmtPressure(n: number): string {
  return Math.abs(n).toLocaleString('tr-TR', { maximumFractionDigits: 0 })
}

// ── Distributable cash — matches /api/cash-distributable response shape ───────

export interface DistributableCashResult {
  cash_distributable: number
  breakdown: {
    payments_received:       number
    paid_expenses:           number
    cash_balance:            number
    unpaid_expenses:         number
    outstanding_obligations: number
  }
}

const CASH_EXCLUDED_TYPES = new Set([
  'loan_repayment', 'partner_financing', 'dividend', 'internal_transfer',
])

function r2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100 }

export async function getDistributableCash(
  companyId: string,
  period?:   Partial<CorePeriod>,
): Promise<DistributableCashResult> {
  const p   = period ?? {}
  const def = currentPeriod()
  const from = p.from ?? def.from
  const to   = p.to   ?? def.to

  const supabase = createClient()

  const [paidSalesRes, paidExpRes, unpaidExpRes] = await Promise.all([
    supabase
      .from('sales')
      .select('total_try')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', from + 'T00:00:00Z')
      .lte('paid_at', to   + 'T23:59:59Z'),
    supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),
    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .neq('payment_status', 'paid')
      .is('deleted_at', null),
  ])

  const paymentsReceived = (paidSalesRes.data ?? []).reduce(
    (s: number, row: { total_try: number }) => s + Number(row.total_try ?? 0), 0,
  )
  const paidExpenses = (paidExpRes.data ?? []).reduce(
    (s: number, row: { amount_try: number; expense_type: string | null }) =>
      CASH_EXCLUDED_TYPES.has(row.expense_type ?? '') ? s : s + Number(row.amount_try ?? 0),
    0,
  )
  const unpaidExpenses = (unpaidExpRes.data ?? []).reduce(
    (s: number, row: { amount_try: number }) => s + Number(row.amount_try ?? 0), 0,
  )

  const cashBalance            = r2(paymentsReceived - paidExpenses)
  const outstandingObligations = r2(unpaidExpenses)
  const cashDistributable      = r2(Math.max(0, cashBalance - outstandingObligations))

  return {
    cash_distributable: cashDistributable,
    breakdown: {
      payments_received:       r2(paymentsReceived),
      paid_expenses:           r2(paidExpenses),
      cash_balance:            cashBalance,
      unpaid_expenses:         r2(unpaidExpenses),
      outstanding_obligations: outstandingObligations,
    },
  }
}

// ── getCfoMetrics ─────────────────────────────────────────────────────────────
//
// Returns the full CfoMetrics snapshot for a given company + period.
// Runs 16 DB queries in parallel; degrades gracefully on partial failure.
//
// Canonical source for: CEO page, /api/cfo-metrics

export async function getCfoMetrics(
  companyId: string,
  period?: Partial<CorePeriod>,
): Promise<CfoMetrics> {
  const supabase = createClient()
  const now      = new Date()
  const today    = now.toISOString().slice(0, 10)
  const year     = now.getFullYear()

  const from = period?.from ?? currentPeriod().from
  const to   = period?.to   ?? today

  // 3-month trailing window for burn rate
  const trail3Start = new Date(now)
  trail3Start.setMonth(trail3Start.getMonth() - 3)
  const trail3 = trail3Start.toISOString().slice(0, 10)

  // YTD window for tax estimate
  const ytdFrom = `${year}-01-01`

  const [
    allTimeCollectedRes,
    allTimePaidExpensesRes,
    unpaidExpensesRes,
    periodCollectedRes,
    periodPaidExpensesRes,
    trailingBurnRes,
    outstandingRes,
    periodInvoicedRes,
    ytdRevenueRes,
    ytdCogsRes,
    ytdExpensesRes,
    ytdSalesVatRes,
    ytdPurchaseVatRes,
    ytdExpenseVatRes,
    partnerTxRes,
    stockRes,
  ] = await Promise.all([
    // 1. All-time collected
    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    // 2. All-time paid expenses
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    // 3. Unpaid obligations
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null),

    // 4. Period collected
    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', from + 'T00:00:00Z').lte('paid_at', to + 'T23:59:59Z'),

    // 5. Period paid expenses
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .gte('expense_date', from).lte('expense_date', to),

    // 6. Trailing 3-month burn (operational only)
    supabase.from('expenses').select('amount_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .gte('expense_date', trail3).lte('expense_date', today)
      .in('expense_type', Array.from(BURN_EXPENSE_TYPES)),

    // 7. Outstanding receivables with aging
    supabase.from('sales').select('total_try, created_at, due_date, amount_paid')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('payment_status', ['unpaid', 'partial', 'overdue']),

    // 8. Period invoiced
    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('created_at', from + 'T00:00:00Z').lte('created_at', to + 'T23:59:59Z'),

    // 9. YTD revenue
    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('created_at', ytdFrom + 'T00:00:00Z').lte('created_at', today + 'T23:59:59Z'),

    // 10. YTD COGS (FIFO)
    supabase.from('sale_item_allocations').select('qty_allocated, stock_lots!inner(entry_cost_try)')
      .eq('company_id', companyId).is('deleted_at', null),

    // 11. YTD operational expenses
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('expense_date', ytdFrom).lte('expense_date', today),

    // 12. YTD sales VAT
    supabase.from('sales').select('kdv_total, fx_rate_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('created_at', ytdFrom + 'T00:00:00Z').lte('created_at', today + 'T23:59:59Z'),

    // 13. YTD purchase VAT
    supabase.from('purchases').select('kdv_amount_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('purchase_date', ytdFrom).lte('purchase_date', today),

    // 14. YTD expense VAT
    supabase.from('expenses').select('kdv')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('expense_date', ytdFrom).lte('expense_date', today),

    // 15. Partner transactions
    supabase.from('partner_transactions').select('tx_type, amount_try')
      .eq('company_id', companyId).is('deleted_at', null),

    // 16. Stock lots
    supabase.from('stock_lots').select('qty_remaining, entry_cost_try')
      .eq('company_id', companyId).is('deleted_at', null).gt('qty_remaining', 0),
  ])

  // Log any query errors (degrade gracefully)
  const errs = [
    allTimeCollectedRes.error, allTimePaidExpensesRes.error, unpaidExpensesRes.error,
    periodCollectedRes.error, periodPaidExpensesRes.error, trailingBurnRes.error,
    outstandingRes.error, periodInvoicedRes.error, ytdRevenueRes.error,
    ytdCogsRes.error, ytdExpensesRes.error, ytdSalesVatRes.error,
    ytdPurchaseVatRes.error, ytdExpenseVatRes.error, partnerTxRes.error,
    stockRes.error,
  ].filter(Boolean)
  if (errs.length > 0) errs.forEach(e => console.error('[financial-core/cfo]', (e as { message?: string }).message))

  // ── Aggregate ────────────────────────────────────────────────────────────────

  const allTimeReceived = (allTimeCollectedRes.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
  const periodReceived  = (periodCollectedRes.data  ?? []).reduce((s, r) => s + Number(r.total_try), 0)
  const periodInvoiced  = (periodInvoicedRes.data   ?? []).reduce((s, r) => s + Number(r.total_try), 0)

  const ytdRevenue = (ytdRevenueRes.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
  const ytdCogs    = (ytdCogsRes.data ?? []).reduce((s, r) => {
    const lot = (r as { stock_lots?: { entry_cost_try?: number } | null }).stock_lots
    return s + Number(r.qty_allocated ?? 0) * Number(lot?.entry_cost_try ?? 0)
  }, 0)
  const ytdOpExpenses = (ytdExpensesRes.data ?? []).reduce((s, r) => {
    const t = String((r as { expense_type?: string | null }).expense_type ?? '')
    if (t === 'partner_financing' || t === 'loan_repayment' || t === 'dividend' || t === 'internal_transfer') return s
    return s + Number(r.amount_try)
  }, 0)
  const ytdProfit = ytdRevenue - ytdCogs - ytdOpExpenses

  const salesVat    = (ytdSalesVatRes.data ?? []).reduce((s, r) => s + Number(r.kdv_total ?? 0) * Number(r.fx_rate_try ?? 1), 0)
  const purchaseVat = (ytdPurchaseVatRes.data ?? []).reduce((s, r) => s + Number(r.kdv_amount_try ?? 0), 0)
  const expenseVat  = (ytdExpenseVatRes.data ?? []).reduce((s, r) => s + Number(r.kdv ?? 0), 0)
  const kdvNet      = salesVat - purchaseVat - expenseVat

  // ── Compute sections ──────────────────────────────────────────────────────────

  const cashAndBurn = computeCashMetrics({
    allTimeReceived,
    allTimePaidExpenses:  (allTimePaidExpensesRes.data  ?? []) as { amount_try: number; expense_type: string | null }[],
    unpaidExpenses:       (unpaidExpensesRes.data        ?? []) as { amount_try: number; expense_type: string | null }[],
    periodReceived,
    periodPaidExpenses:   (periodPaidExpensesRes.data   ?? []) as { amount_try: number; expense_type: string | null }[],
    trailingBurnExpenses: (trailingBurnRes.data          ?? []) as { amount_try: number }[],
    trailingMonths: 3,
  })

  const burn = computeBurnMetrics(cashAndBurn.distributable_cash, cashAndBurn.monthly_burn_rate, today)

  const receivables = computeReceivableMetrics({
    periodInvoiced,
    periodCollected: periodReceived,
    outstanding: (outstandingRes.data ?? []).map(r => ({
      amount_try:  Number(r.total_try ?? 0),
      created_at:  String(r.created_at ?? ''),
      due_date:    r.due_date ? String(r.due_date) : null,
      amount_paid: r.amount_paid != null ? Number(r.amount_paid) : null,
    })),
    today,
  })

  const tax = computeTaxMetrics({
    kdvNet,
    accountingProfit: ytdProfit,
    taxRate: CORPORATE_TAX_RATE_TR,
  })

  const partner = computePartnerMetrics({
    transactions: (partnerTxRes.data ?? []) as { tx_type: string; amount_try: number }[],
  })

  const stock = computeStockMetrics({
    lots: (stockRes.data ?? []) as { qty_remaining: number; entry_cost_try: number }[],
    monthlyBurn: cashAndBurn.monthly_burn_rate,
  })

  return {
    cash: {
      true_cash_position:  cashAndBurn.true_cash_position,
      operational_cash:    cashAndBurn.operational_cash,
      restricted_cash:     cashAndBurn.restricted_cash,
      distributable_cash:  cashAndBurn.distributable_cash,
    },
    burn: {
      monthly_burn_rate:    burn.monthly_burn_rate,
      runway_months:        burn.runway_months,
      runway_days:          burn.runway_days,
      cash_exhaustion_date: burn.cash_exhaustion_date,
    },
    receivables,
    tax,
    partner,
    stock,
  }
}

// ── getRunwayForecast ─────────────────────────────────────────────────────────
//
// Returns a 12-month cash runway projection for a given company.
// Canonical source for: CEO page, /api/simulation/runway

export async function getRunwayForecast(
  companyId: string,
  opts?: { from?: string; to?: string; months?: number },
): Promise<RunwayForecastResponse> {
  const supabase = createClient()
  const now      = new Date()
  const today    = now.toISOString().slice(0, 10)
  const year     = now.getFullYear()
  const mon      = String(now.getMonth() + 1).padStart(2, '0')

  const from    = opts?.from    ?? `${year}-${mon}-01`
  const to      = opts?.to      ?? today
  const horizon = Math.min(24, Math.max(1, opts?.months ?? 12))

  const trail3Start = new Date(now)
  trail3Start.setMonth(trail3Start.getMonth() - 3)
  const trail3 = trail3Start.toISOString().slice(0, 10)

  const [
    allTimeCollectedRes,
    allTimePaidExpensesRes,
    unpaidExpensesRes,
    periodCollectedRes,
    periodPaidExpensesRes,
    trailingBurnRes,
    outstandingRes,
    periodInvoicedRes,
    recurringActiveRes,
  ] = await Promise.all([
    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', from + 'T00:00:00Z').lte('paid_at', to + 'T23:59:59Z'),

    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .gte('expense_date', from).lte('expense_date', to),

    supabase.from('expenses').select('amount_try')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null)
      .gte('expense_date', trail3).lte('expense_date', today)
      .in('expense_type', Array.from(BURN_EXPENSE_TYPES)),

    supabase.from('sales').select('total_try, created_at, due_date, amount_paid')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('payment_status', ['unpaid', 'partial', 'overdue']),

    supabase.from('sales').select('total_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('created_at', from + 'T00:00:00Z').lte('created_at', to + 'T23:59:59Z'),

    supabase.from('recurring_expenses').select('amount, fx_rate, frequency')
      .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null)
      .in('expense_type', Array.from(BURN_EXPENSE_TYPES)),
  ])

  const allTimeReceived = (allTimeCollectedRes.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
  const periodReceived  = (periodCollectedRes.data  ?? []).reduce((s, r) => s + Number(r.total_try), 0)
  const periodInvoiced  = (periodInvoicedRes.data   ?? []).reduce((s, r) => s + Number(r.total_try), 0)

  const cashMetrics = computeCashMetrics({
    allTimeReceived,
    allTimePaidExpenses:  (allTimePaidExpensesRes.data  ?? []) as { amount_try: number; expense_type: string | null }[],
    unpaidExpenses:       (unpaidExpensesRes.data        ?? []) as { amount_try: number; expense_type: string | null }[],
    periodReceived,
    periodPaidExpenses:   (periodPaidExpensesRes.data   ?? []) as { amount_try: number; expense_type: string | null }[],
    trailingBurnExpenses: (trailingBurnRes.data          ?? []) as { amount_try: number }[],
    trailingMonths: 3,
  })

  const receivableMetrics = computeReceivableMetrics({
    periodInvoiced,
    periodCollected: periodReceived,
    outstanding: (outstandingRes.data ?? []).map(r => ({
      amount_try:  Number(r.total_try ?? 0),
      created_at:  String(r.created_at ?? ''),
      due_date:    r.due_date ? String(r.due_date) : null,
      amount_paid: r.amount_paid != null ? Number(r.amount_paid) : null,
    })),
    today,
  })

  const FREQ_FACTOR: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  const recurringMonthlyCommit = (recurringActiveRes.data ?? []).reduce((s, r) => {
    const amtTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
    return s + amtTry * (FREQ_FACTOR[r.frequency as string] ?? 0)
  }, 0)

  const monthlyBurn = Math.max(cashMetrics.monthly_burn_rate, recurringMonthlyCommit)

  const forecast = computeRunwayForecast(
    {
      startingCash:            cashMetrics.distributable_cash,
      monthlyBurn,
      outstandingReceivables:  receivableMetrics.total_outstanding,
      collectionRatePct:       Math.min(70, receivableMetrics.collection_rate_pct),
      projectedMonthlyRevenue: periodInvoiced / Math.max(1,
        (new Date(to).getTime() - new Date(from).getTime()) / (86_400_000 * 30.44)
      ),
      projectedCollectionRate: receivableMetrics.collection_rate_pct,
      taxObligation: 0,
      months: horizon,
    },
    now,
  )

  return {
    ...forecast,
    inputs: {
      starting_cash:     cashMetrics.distributable_cash,
      monthly_burn:      monthlyBurn,
      outstanding_total: receivableMetrics.total_outstanding,
      horizon_months:    horizon,
    },
  }
}

// ── Quarterly report — FAZ 4 Executive Reporting ─────────────────────────────

export interface QuarterResult {
  label:          string         // "Q1 2025"
  period:         CorePeriod
  revenue:        number
  cost:           number
  gross_profit:   number
  expenses:       number
  net_profit:     number         // gross_profit - expenses
  matrah:         number         // taxable base
  corporate_tax:  number         // 25% of matrah
  net_after_tax:  number
  gross_margin:   number         // gross_profit / revenue  (0–1)
  net_margin:     number         // net_profit / revenue    (0–1)
  // Geçici Vergi
  gecici_vergi:     number       // provisional tax = 25% × matrah (per quarter)
  gecici_due_date:  string       // due date YYYY-MM-DD
  is_past_quarter:  boolean      // quarter already ended
}

export interface YtdSummary {
  revenue:       number
  gross_profit:  number
  net_profit:    number
  matrah:        number
  corporate_tax: number
  net_after_tax: number
  total_gecici:  number
}

export interface QuarterlyReportResult {
  year:     number
  quarters: QuarterResult[]
  ytd:      YtdSummary
}

const CORPORATE_TAX_RATE = 0.25

/** Geçici Vergi due dates: Q1→May 17, Q2→Aug 17, Q3→Nov 17 */
/** Turkish Geçici Vergi due date: Q1→May17, Q2→Aug17, Q3→Nov17 */
export function geciciDueDate(year: number, q: 1 | 2 | 3): string {
  const monthStr = q === 1 ? '05' : q === 2 ? '08' : '11'
  return `${year}-${monthStr}-17`
}

/** Quarter period boundaries — from first day to last day inclusive */
export function quarterPeriod(year: number, q: 1 | 2 | 3 | 4): CorePeriod {
  const starts = ['01', '04', '07', '10']
  const ends   = ['03', '06', '09', '12']
  const lastDays: Record<string, string> = { '03': '31', '06': '30', '09': '30', '12': '31' }
  const sm = starts[q - 1], em = ends[q - 1]
  return { from: `${year}-${sm}-01`, to: `${year}-${em}-${lastDays[em]}` }
}

export async function getQuarterlyReport(
  userId:    string,
  companyId: string,
  year?:     number,
): Promise<QuarterlyReportResult> {
  const { FinanceService } = await import('@/lib/services/finance.service')
  const { CORPORATE_TAX_RATE_TR } = await import('@/lib/services/finance-rules')
  const taxRate = CORPORATE_TAX_RATE_TR ?? CORPORATE_TAX_RATE

  const targetYear = year ?? new Date().getFullYear()
  const today      = new Date().toISOString().slice(0, 10)

  // Fetch all 4 quarters in parallel
  const qPeriods = ([1, 2, 3, 4] as const).map(q => quarterPeriod(targetYear, q))

  const summaries = await Promise.all(
    qPeriods.map(p => {
      // Don't query future quarters — return null
      if (p.from > today) return Promise.resolve(null)
      return FinanceService.getFinancialSummary(
        userId, companyId, p, { corporate_tax_rate: taxRate },
      ).catch(() => null)
    }),
  )

  const quarters: QuarterResult[] = summaries.map((s, i) => {
    const q      = (i + 1) as 1 | 2 | 3 | 4
    const period = qPeriods[i]
    const rev    = s?.revenue_try            ?? 0
    const cost   = s?.cost_try               ?? 0
    const gross  = s?.gross_profit_try       ?? 0
    const exp    = s?.expenses_total_try     ?? 0
    const net    = r2(gross - exp)
    const matrah = s?.matrah_try             ?? 0
    const corTax = s?.corporate_tax_try      ?? 0
    const netAt  = s?.net_after_tax_try      ?? 0
    const gecici = r2(matrah * taxRate)

    return {
      label:           `Q${q} ${targetYear}`,
      period,
      revenue:         rev,
      cost,
      gross_profit:    gross,
      expenses:        exp,
      net_profit:      net,
      matrah,
      corporate_tax:   corTax,
      net_after_tax:   netAt,
      gross_margin:    rev > 0 ? r2(gross / rev) : 0,
      net_margin:      rev > 0 ? r2(net   / rev) : 0,
      gecici_vergi:    q < 4 ? gecici : 0,
      gecici_due_date: q < 4 ? geciciDueDate(targetYear, q as 1 | 2 | 3) : '',
      is_past_quarter: period.to <= today,
    }
  })

  const ytd: YtdSummary = {
    revenue:       r2(quarters.reduce((s, q) => s + q.revenue,       0)),
    gross_profit:  r2(quarters.reduce((s, q) => s + q.gross_profit,  0)),
    net_profit:    r2(quarters.reduce((s, q) => s + q.net_profit,    0)),
    matrah:        r2(quarters.reduce((s, q) => s + q.matrah,        0)),
    corporate_tax: r2(quarters.reduce((s, q) => s + q.corporate_tax, 0)),
    net_after_tax: r2(quarters.reduce((s, q) => s + q.net_after_tax, 0)),
    total_gecici:  r2(quarters.reduce((s, q) => s + q.gecici_vergi,  0)),
  }

  return { year: targetYear, quarters, ytd }
}
