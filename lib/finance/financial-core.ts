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
