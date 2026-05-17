// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cfo-metrics
//
// Single endpoint delivering all CFO-grade financial metrics in one response.
// All queries run in parallel. Each section degrades gracefully on partial DB failure.
//
// Query params:
//   from   YYYY-MM-DD  period start (default: first day of current month)
//   to     YYYY-MM-DD  period end   (default: today)
//
// Response: CfoMetrics (see lib/finance/cfo-metrics.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'
import {
  computeCashMetrics,
  computeBurnMetrics,
  computeReceivableMetrics,
  computeTaxMetrics,
  computePartnerMetrics,
  computeStockMetrics,
  BURN_EXPENSE_TYPES,
} from '@/lib/finance/cfo-metrics'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url   = new URL(req.url)
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = url.searchParams.get('from') ?? `${year}-${mon}-01`
  const to    = url.searchParams.get('to')   ?? today

  // 3-month trailing window for burn rate
  const trail3Start = new Date(now)
  trail3Start.setMonth(trail3Start.getMonth() - 3)
  const trail3 = trail3Start.toISOString().slice(0, 10)

  // YTD window for tax estimate
  const ytdFrom = `${year}-01-01`

  try {
    const [
      // 1. All-time cash received (paid sales)
      allTimeCollectedRes,
      // 2. All-time paid expenses with expense_type
      allTimePaidExpensesRes,
      // 3. Unpaid obligations (non-financing)
      unpaidExpensesRes,
      // 4. Period: collected cash
      periodCollectedRes,
      // 5. Period: paid expenses
      periodPaidExpensesRes,
      // 6. Trailing 3-month burn (operational only)
      trailingBurnRes,
      // 7. Outstanding receivables (for aging)
      outstandingRes,
      // 8. Period invoiced total
      periodInvoicedRes,
      // 9. YTD financial summary: revenue, COGS, expenses (from financial-summary)
      // done via Supabase direct queries to avoid self-HTTP-call
      ytdRevenueRes,
      ytdCogsRes,
      ytdExpensesRes,
      // 10. Net VAT
      ytdSalesVatRes,
      ytdPurchaseVatRes,
      ytdExpenseVatRes,
      // 11. Partner transactions
      partnerTxRes,
      // 12. Stock lots
      stockRes,
    ] = await Promise.all([

      // 1. All-time collected
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null),

      // 2. All-time paid expenses (with type for filtering)
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null),

      // 3. Unpaid expenses (future obligations)
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null),

      // 4. Period collected
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .not('paid_at', 'is', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', to   + 'T23:59:59Z'),

      // 5. Period paid expenses (with type)
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),

      // 6. Trailing 3-month operational burn expenses (paid, burn types only)
      supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', trail3)
        .lte('expense_date', today)
        .in('expense_type', Array.from(BURN_EXPENSE_TYPES)),

      // 7. Outstanding receivables (unpaid/partial/overdue) with age
      // Use sale_date (business invoice date) for aging — not created_at (DB insertion time).
      supabase
        .from('sales')
        .select('total_try:total, sale_date, due_date, amount_paid:paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue']),

      // 8. Period invoiced (total_try for all sales in period by sale_date)
      // Use sale_date (business invoice date) not created_at (DB insertion time).
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to),

      // 9. YTD revenue — use sale_date for period attribution
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', today),

      // 10. YTD COGS (from sale_item_allocations — FIFO)
      // Note: sale_item_allocations has no deleted_at column; no sale_id filter possible here
      supabase
        .from('sale_item_allocations')
        .select('qty_allocated, stock_lots!inner(cost_price_try)')
        .eq('company_id', companyId),

      // 11. YTD operational expenses (for P&L matrah calculation)
      supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', today),

      // 12. YTD sales VAT — kdv_amount_try column does not exist on live DB; salesVat = 0
      supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', ytdFrom)
        .lte('sale_date', today),

      // 13. YTD finalized purchases — placeholder (no `purchases` table yet; purchase_orders has no VAT columns)
      //     Returns empty result; purchaseVat stays 0 until the purchases module is built.
      Promise.resolve({ data: [] as { id: string; fx_rate?: number | null }[], error: null }),

      // 14. YTD expense VAT
      supabase
        .from('expenses')
        .select('kdv')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', ytdFrom)
        .lte('expense_date', today),

      // 15. Partner transactions (all, non-deleted)
      supabase
        .from('partner_transactions')
        .select('tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // 16. Stock lots (current inventory)
      supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),
    ])

    // ── Log any query errors (degrade gracefully) ───────────────────────────
    const queryErrors = [
      allTimeCollectedRes.error, allTimePaidExpensesRes.error, unpaidExpensesRes.error,
      periodCollectedRes.error, periodPaidExpensesRes.error, trailingBurnRes.error,
      outstandingRes.error, periodInvoicedRes.error, ytdRevenueRes.error,
      ytdCogsRes.error, ytdExpensesRes.error, ytdSalesVatRes.error,
      ytdPurchaseVatRes.error, ytdExpenseVatRes.error, partnerTxRes.error,
      stockRes.error,
    ].filter(Boolean)
    if (queryErrors.length > 0) {
      queryErrors.forEach(e => console.error('[cfo-metrics] query error:', (e as { message?: string }).message))
    }

    // ── Aggregate raw values ────────────────────────────────────────────────

    const allTimeReceived  = (allTimeCollectedRes.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
    const periodReceived   = (periodCollectedRes.data  ?? []).reduce((s, r) => s + Number(r.total_try), 0)
    const periodInvoiced   = (periodInvoicedRes.data   ?? []).reduce((s, r) => s + Number(r.total_try), 0)

    // YTD P&L for tax estimate
    const ytdRevenue = (ytdRevenueRes.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
    const ytdCogs    = (ytdCogsRes.data ?? []).reduce((s, r) => {
      const lot = (r as { stock_lots?: { cost_price_try?: number } | null }).stock_lots
      return s + Number(r.qty_allocated ?? 0) * Number(lot?.cost_price_try ?? 0)
    }, 0)
    const ytdOpExpenses = (ytdExpensesRes.data ?? []).reduce((s, r) => {
      const t = String((r as { expense_type?: string | null }).expense_type ?? '')
      // Only deductible operational expenses go into matrah
      if (t === 'partner_financing' || t === 'loan_repayment' || t === 'dividend' || t === 'internal_transfer') return s
      return s + Number(r.amount_try)
    }, 0)
    const ytdProfit = ytdRevenue - ytdCogs - ytdOpExpenses

    // VAT net — kdv_amount_try does not exist on live DB; salesVat is 0 until a VAT column is added
    const salesVat   = 0
    void ytdSalesVatRes // fetched for query health monitoring only
    const expenseVat = (ytdExpenseVatRes.data ?? []).reduce((s, r) => s + Number(r.kdv ?? 0), 0)
    // purchaseVat is always 0 until a proper `purchases` + `purchase_items` module is added
    const purchaseVat = 0
    void ytdPurchaseVatRes // referenced above, unused now

    const kdvNet = salesVat - purchaseVat - expenseVat

    // ── Compute metric sections ─────────────────────────────────────────────

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
        amount_try: Number(r.total_try ?? 0),
        sale_date: String(r.sale_date ?? ''),
        due_date:   r.due_date ? String(r.due_date) : null,
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

    return NextResponse.json({
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
      period: { from, to },
    })
  } catch (err) {
    console.error('[cfo-metrics] error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'CFO metrikleri alınamadı', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
