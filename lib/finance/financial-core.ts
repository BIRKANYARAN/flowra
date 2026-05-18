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
//   • app/dashboard/finance/_tabs/OverviewTab.tsx  (server component — direct call)
//   • app/api/cfo-metrics/route.ts                (API wrapper — unchanged response shape)
//   • app/api/simulation/runway/route.ts          (API wrapper — unchanged response shape)
//
// RULE: Never import from this file in client components.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { requireAuthContext } from '@/lib/auth-context'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any
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
  'principal', 'partner_loan',
])

export async function getCashflowTimeline(
  companyId: string,
  opts?: CashflowTimelineOpts,
  clientOverride?: AnySupabase,
): Promise<CashflowTimelineResult> {
  const pastMonths   = Math.min(Math.max(opts?.pastMonths   ?? 6, 1), 12)
  const futureMonths = Math.min(Math.max(opts?.futureMonths ?? 6, 1), 12)
  const nowYM        = _toYM(new Date())
  const startYM      = _addMonths(nowYM, -pastMonths)
  const endYM        = _addMonths(nowYM, futureMonths - 1)
  const windowSize   = pastMonths + futureMonths

  const supabase = requireAuthContext(clientOverride, 'getCashflowTimeline')

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
      supabase.from('sales').select('total_try:total, sale_date')
        .eq('company_id', companyId).is('deleted_at', null)
        .gte('sale_date', _ymStart(startYM)).lte('sale_date', _ymEnd(endYM)),
      supabase.from('sales').select('total_try:total, amount_paid:paid_amount, sale_date')
        .eq('company_id', companyId).is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .gte('sale_date', _ymStart(startYM)).lte('sale_date', _ymEnd(endYM)),
      supabase.from('sales').select('total_try:total, paid_at')
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
    if (!s.sale_date) continue
    const row = months.get(_toYM(s.sale_date as string))
    if (row) row.invoiced += Number(s.total_try ?? 0)
  }
  for (const s of receivablesRes.data ?? []) {
    if (!s.sale_date) continue
    const row = months.get(_toYM(s.sale_date as string))
    if (row) row.receivable += Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
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
  'principal', 'partner_loan',
])

function r2(v: number) { return Math.round((v + Number.EPSILON) * 100) / 100 }

export async function getDistributableCash(
  companyId: string,
  period?:   Partial<CorePeriod>,
  clientOverride?: AnySupabase,
): Promise<DistributableCashResult> {
  const p   = period ?? {}
  const def = currentPeriod()
  const from = p.from ?? def.from
  const to   = p.to   ?? def.to

  const supabase = requireAuthContext(clientOverride, 'getDistributableCash')

  const [paidSalesRes, paidExpRes, unpaidExpRes] = await Promise.all([
    supabase
      .from('sales')
      .select('total_try:total')
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
      .select('amount_try, expense_type')   // include expense_type for filtering
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
  // Only count operational unpaid expenses as obligations — exclude financing flows
  // (partner loan repayments, dividends etc. are not operational obligations)
  const unpaidExpenses = (unpaidExpRes.data ?? []).reduce(
    (s: number, row: { amount_try: number; expense_type?: string | null }) =>
      CASH_EXCLUDED_TYPES.has(row.expense_type ?? '') ? s : s + Number(row.amount_try ?? 0),
    0,
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
// Canonical source for: Finance hub overview, /api/cfo-metrics

export async function getCfoMetrics(
  companyId: string,
  period?: Partial<CorePeriod>,
  clientOverride?: AnySupabase,
): Promise<CfoMetrics> {
  const supabase = requireAuthContext(clientOverride, 'getCfoMetrics')
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
    ytdExpensesRes,
    ytdSalesVatRes,
    ytdPurchaseVatRes,
    ytdExpenseVatRes,
    partnerTxRes,
    stockRes,
  ] = await Promise.all([
    // 1. All-time collected
    supabase.from('sales').select('total_try:total')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    // 2. All-time paid expenses
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    // 3. Unpaid obligations
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null),

    // 4. Period collected
    supabase.from('sales').select('total_try:total')
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

    // 7. Outstanding receivables with aging — use sale_date (business invoice date)
    supabase.from('sales').select('total_try:total, sale_date, due_date, amount_paid:paid_amount')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),

    // 8. Period invoiced — use sale_date for period attribution
    supabase.from('sales').select('total_try:total')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('sale_date', from).lte('sale_date', to),

    // 9. YTD revenue — use sale_date for period attribution
    supabase.from('sales').select('total_try:total, id')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('sale_date', ytdFrom).lte('sale_date', today),

    // 10. YTD operational expenses
    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('expense_date', ytdFrom).lte('expense_date', today),

    // 12. YTD sales VAT — kdv_amount_try now populated via accounting_truth_v1 migration
    supabase.from('sales').select('kdv_amount_try')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('sale_date', ytdFrom).lte('sale_date', today),

    // 13. YTD purchase VAT — join through purchases to filter by company_id
    supabase.from('purchase_costs').select('amount_try, purchases!inner(company_id)')
      .eq('purchases.company_id', companyId)
      .eq('cost_type', 'tax')
      .gte('created_at', ytdFrom + 'T00:00:00Z').lte('created_at', today + 'T23:59:59Z'),

    // 14. YTD expense VAT — kdv is the RATE (e.g. 18 for 18%)
    supabase.from('expenses').select('amount_try, kdv')
      .eq('company_id', companyId).is('deleted_at', null)
      .gt('kdv', 0)
      .gte('expense_date', ytdFrom).lte('expense_date', today),

    // 15. Partner transactions
    supabase.from('partner_transactions').select('tx_type, amount_try')
      .eq('company_id', companyId).is('deleted_at', null),

    // 16. Stock lots
    supabase.from('stock_lots').select('qty_remaining, cost_price_try')
      .eq('company_id', companyId).is('deleted_at', null).gt('qty_remaining', 0),
  ])

  // Phase-2 COGS — YTD-filtered via 2-step join: sale_items → sales (GAP 15 fix).
  // Step 1: collect sale_item IDs belonging to YTD sales for this company.
  // TODO: batch this query when sale_items count exceeds ~2000 rows per year.
  const ytdSaleItemsRes = await supabase
    .from('sale_items')
    .select('id')
    .eq('company_id', companyId)
    .limit(2000)
    .in('sale_id',
      // Supabase JS v2 supports subquery via chained select on the same client
      (await supabase
        .from('sales')
        .select('id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', today)
        .limit(2000)
      ).data?.map((r: { id: string }) => r.id) ?? []
    )

  // Step 2: fetch allocations for those sale_items only.
  // Prefer the denormalized cost_price_try on the allocation row (accounting_truth_v1
  // migration populates it). Fall back to the stock_lots JOIN for pre-migration rows.
  const ytdSaleItemIds = (ytdSaleItemsRes.data ?? []).map((r: { id: string }) => r.id)
  const ytdCogsRes = ytdSaleItemIds.length > 0
    ? await supabase
        .from('sale_item_allocations')
        .select('qty_allocated, cost_price_try, stock_lots!inner(cost_price_try)')
        .eq('company_id', companyId)
        .in('sale_item_id', ytdSaleItemIds)
    : { data: [], error: null }

  // Non-fatal errors: log but don't throw — pages degrade gracefully with 0 values.
  // partner_transactions and purchase_costs may not exist on all DB versions yet.
  const NON_FATAL_TABLES = ['partner_transactions', 'purchase_costs']
  const errs = [
    allTimeCollectedRes.error, allTimePaidExpensesRes.error, unpaidExpensesRes.error,
    periodCollectedRes.error, periodPaidExpensesRes.error, trailingBurnRes.error,
    outstandingRes.error, periodInvoicedRes.error, ytdRevenueRes.error,
    ytdSaleItemsRes.error, ytdCogsRes.error, ytdExpensesRes.error, ytdSalesVatRes.error,
    ytdPurchaseVatRes.error, ytdExpenseVatRes.error, partnerTxRes.error,
    stockRes.error,
  ].filter(e => {
    if (!e) return false
    const msg = (e as { message?: string }).message ?? ''
    // Suppress "relation does not exist" errors for tables added in recent migrations
    if (NON_FATAL_TABLES.some(t => msg.includes(t))) return false
    return true
  })
  if (errs.length > 0) errs.forEach(e => console.error('[financial-core/cfo]', (e as { message?: string }).message))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTimeReceived = (allTimeCollectedRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodReceived  = (periodCollectedRes.data  ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodInvoiced  = (periodInvoicedRes.data   ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytdRevenue = (ytdRevenueRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytdCogs    = (ytdCogsRes.data ?? []).reduce((s: number, r: any) => {
    const lot        = (r as { stock_lots?: { cost_price_try?: number } | null }).stock_lots
    const costPerUnit = Number((r as { cost_price_try?: number }).cost_price_try ?? lot?.cost_price_try ?? 0)
    return s + Number(r.qty_allocated ?? 0) * costPerUnit
  }, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytdOpExpenses = (ytdExpensesRes.data ?? []).reduce((s: number, r: any) => {
    const t = String((r as { expense_type?: string | null }).expense_type ?? '')
    if (t === 'partner_financing' || t === 'loan_repayment' || t === 'dividend' || t === 'internal_transfer') return s
    return s + Number(r.amount_try)
  }, 0)
  const ytdProfit = ytdRevenue - ytdCogs - ytdOpExpenses

  // salesVat from kdv_amount_try (populated by accounting_truth_v1 migration).
  // Rows without the column (pre-migration) default to 0 — safe graceful degradation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salesVat    = Math.round((ytdSalesVatRes.data ?? []).reduce((s: number, r: any) => s + Number((r as { kdv_amount_try?: number }).kdv_amount_try ?? 0), 0) * 100) / 100
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseVat = (ytdPurchaseVatRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount_try ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expenseVat  = (ytdExpenseVatRes.data ?? []).reduce((s: number, r: any) => s + Number(r.amount_try ?? 0) * Number(r.kdv ?? 0) / 100, 0)
  const kdvNet      = salesVat - purchaseVat - expenseVat

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outstanding: (outstandingRes.data ?? []).map((r: any) => ({
      amount_try:  Number(r.total_try ?? 0),
      sale_date:   String(r.sale_date ?? ''),
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
    lots: (stockRes.data ?? []) as { qty_remaining: number; cost_price_try: number }[],
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
// Canonical source for: Finance hub forecast tab, /api/simulation/runway

export async function getRunwayForecast(
  companyId: string,
  opts?: { from?: string; to?: string; months?: number; taxObligation?: number },
  clientOverride?: AnySupabase,
): Promise<RunwayForecastResponse> {
  const supabase = requireAuthContext(clientOverride, 'getRunwayForecast')
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
    supabase.from('sales').select('total_try:total')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('expenses').select('amount_try, expense_type')
      .eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null),

    supabase.from('sales').select('total_try:total')
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

    supabase.from('sales').select('total_try:total, sale_date, due_date, amount_paid:paid_amount')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),

    supabase.from('sales').select('total_try:total')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('sale_date', from).lte('sale_date', to),

    supabase.from('recurring_expenses').select('amount, fx_rate, frequency')
      .eq('company_id', companyId).eq('is_active', true).is('deleted_at', null)
      .in('expense_type', Array.from(BURN_EXPENSE_TYPES)),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTimeReceived = (allTimeCollectedRes.data ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodReceived  = (periodCollectedRes.data  ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const periodInvoiced  = (periodInvoicedRes.data   ?? []).reduce((s: number, r: any) => s + Number(r.total_try), 0)

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    outstanding: (outstandingRes.data ?? []).map((r: any) => ({
      amount_try:  Number(r.total_try ?? 0),
      sale_date:   String(r.sale_date ?? ''),
      due_date:    r.due_date ? String(r.due_date) : null,
      amount_paid: r.amount_paid != null ? Number(r.amount_paid) : null,
    })),
    today,
  })

  const FREQ_FACTOR: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recurringMonthlyCommit = (recurringActiveRes.data ?? []).reduce((s: number, r: any) => {
    const amtTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
    return s + amtTry * (FREQ_FACTOR[r.frequency as string] ?? 0)
  }, 0)

  const monthlyBurn = Math.max(cashMetrics.monthly_burn_rate, recurringMonthlyCommit)

  const forecast = computeRunwayForecast(
    {
      startingCash:            cashMetrics.distributable_cash,
      monthlyBurn,
      outstandingReceivables:  receivableMetrics.total_outstanding,
      collectionRatePct:       receivableMetrics.collection_rate_pct,
      projectedMonthlyRevenue: periodInvoiced / Math.max(1,
        (new Date(to).getTime() - new Date(from).getTime()) / (86_400_000 * 30.44)
      ),
      projectedCollectionRate: receivableMetrics.collection_rate_pct,
      taxObligation: opts?.taxObligation ?? 0,
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

// ── Quarterly report ──────────────────────────────────────────────────────────

export interface QuarterResult {
  label:          string         // "Q1 2025"
  period:         CorePeriod
  revenue:        number
  cost:           number
  gross_profit:   number
  expenses:       number
  net_profit:     number
  matrah:         number
  corporate_tax:  number
  net_after_tax:  number
  gross_margin:   number
  net_margin:     number
  gecici_vergi:     number
  gecici_due_date:  string
  is_past_quarter:  boolean
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

  const qPeriods = ([1, 2, 3, 4] as const).map(q => quarterPeriod(targetYear, q))

  const summaries = await Promise.all(
    qPeriods.map(p => {
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
    // gecici vergi = quarterly corporate tax (already computed correctly by
    // computeCorporateTax with rate_percent/100). Re-multiplying by taxRate
    // (which is 25, not 0.25) would give 25× the correct amount.
    const gecici = corTax

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
