// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/analytics/kpi
//
// Single-endpoint KPI aggregation for the current company.
// All six metrics are computed in parallel via Supabase queries.
//
// Query params:
//   from  YYYY-MM-DD  period start (default: first day of current month)
//   to    YYYY-MM-DD  period end   (default: today)
//
// Response: KpiResult
//   total_revenue           — invoiced sales (total_try) in period
//   total_collected         — paid sales (total_try) in period (by paid_at)
//   outstanding_receivables — all-time unpaid/partial sales (total_try, not period-limited)
//   total_expenses          — expenses (amount_try) in period
//   net_profit              — revenue_try − cost_try − expenses (approximation from sales)
//   stock_value             — current FIFO stock value (Σ qty_remaining × cost_price_try)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { KpiResult }  from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'
import { round2 } from '@/lib/calc'

const BURN_EXPENSE_TYPES = ['operational', 'fixed', 'variable']
const CASH_EXCLUDED_EXPENSE_TYPES = new Set([
  'loan_repayment',
  'partner_financing',
  'dividend',
  'internal_transfer',
])

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url   = new URL(req.url)
  const now   = new Date()
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const today = now.toISOString().slice(0, 10)

  const from = url.searchParams.get('from') ?? `${year}-${mon}-01`
  const to   = url.searchParams.get('to')   ?? today

  // ── Date helpers for burn rate window ────────────────────────────────────
  const threeMonthsAgo = new Date(now)
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10)

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()

  try {

  // ── Parallel queries ───────────────────────────────────────────────────────
  const [
    revenueRes,
    collectedRes,
    outstandingRes,
    expensesRes,
    stockRes,
    allTimeCollectedRes,
    allTimeExpensesRes,
    lastThreeMonthsExpensesRes,
    overdueRes,
    recurringRes,
    partnerCapitalRes,
  ] = await Promise.all([

    // 1. Total revenue (invoiced) — by sale_date (business invoice date)
    // Use sale_date not created_at (DB insertion time) for correct period attribution.
    supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),

    // 2. Total collected (paid) — by paid_at date
    supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .not('paid_at', 'is', null)
      .gte('paid_at', from + 'T00:00:00Z')
      .lte('paid_at', to   + 'T23:59:59Z'),

    // 3. Outstanding receivables — all-time unpaid/partial/overdue (not period-limited)
    //    Includes amount_paid so partial payments are netted out correctly.
    supabase
      .from('sales')
      .select('total_try:total, amount_paid:paid_amount')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue']),

    // 4. Total operational expenses in period — paid only, excludes financing flows
    supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),

    // 5. Stock value: current FIFO value (all active lots)
    supabase
      .from('stock_lots')
      .select('qty_remaining, cost_price_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gt('qty_remaining', 0),

    // 6. All-time cash collected (for cash_position) — no date filter
    supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .not('paid_at', 'is', null),

    // 7. All-time expenses actually paid (for cash_position) — no date filter
    supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null),

    // 8. Last 3 months burn expenses (strict expense_type include-list)
    supabase
      .from('expenses')
      .select('amount_try')
      .eq('company_id', companyId)
      .eq('payment_status', 'paid')
      .is('deleted_at', null)
      .gte('expense_date', threeMonthsAgoStr)
      .lte('expense_date', today)
      .in('expense_type', BURN_EXPENSE_TYPES),

    // 9. Overdue receivables — unpaid/partial/overdue AND older than 30 days
    //    Includes amount_paid so partial payments are netted out correctly.
    //    Use sale_date (business invoice date) for aging — not created_at.
    supabase
      .from('sales')
      .select('total_try:total, amount_paid:paid_amount')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .lt('sale_date', thirtyDaysAgo.slice(0, 10)),

    // 10. Active recurring burn expenses for adjusted_burn_rate
    //     Uses the same strict expense_type include-list as query 8.
    supabase
      .from('recurring_expenses')
      .select('amount, fx_rate, frequency')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .in('expense_type', BURN_EXPENSE_TYPES),

    // 11. Total partner capital + loans for stock_coverage_ratio denominator
    //     capital_in + loan_to_company + loan_in (legacy alias)
    supabase
      .from('partner_transactions')
      .select('amount_try')
      .eq('company_id', companyId)
      .in('tx_type', ['capital_in', 'loan_to_company', 'loan_in'])
      .is('deleted_at', null),
  ])

  // ── Log any individual query errors (degrade gracefully — return 0 for failed metrics) ──
  const _queryErrors = [
    revenueRes.error, collectedRes.error, outstandingRes.error,
    expensesRes.error, stockRes.error, allTimeCollectedRes.error,
    allTimeExpensesRes.error, lastThreeMonthsExpensesRes.error,
    overdueRes.error, recurringRes.error, partnerCapitalRes.error,
  ].filter(Boolean)
  if (_queryErrors.length > 0) {
    _queryErrors.forEach(e =>
      console.error('[kpi GET] query error:', (e as { message?: string }).message)
    )
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────

  const totalRevenue            = (revenueRes.data                ?? []).reduce((s, r) => s + Number(r.total_try  ?? 0), 0)
  const totalCogs               = 0 // cogs column does not exist on live DB
  const totalCollected          = (collectedRes.data              ?? []).reduce((s, r) => s + Number(r.total_try  ?? 0), 0)
  const outstanding             = (outstandingRes.data            ?? []).reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number((r as { amount_paid?: number | null }).amount_paid ?? 0)), 0)
  const totalExpenses           = (expensesRes.data               ?? []).reduce((s, r) => {
    const expType = String((r as { expense_type?: string | null }).expense_type ?? '')
    if (expType && CASH_EXCLUDED_EXPENSE_TYPES.has(expType)) return s
    return s + Number(r.amount_try ?? 0)
  }, 0)
  const allTimeCollected        = (allTimeCollectedRes.data       ?? []).reduce((s, r) => s + Number(r.total_try  ?? 0), 0)
  const allTimeExpenses         = (allTimeExpensesRes.data        ?? []).reduce((s, r) => {
    const expenseType = String((r as { expense_type?: string | null }).expense_type ?? '')
    if (expenseType && CASH_EXCLUDED_EXPENSE_TYPES.has(expenseType)) return s
    return s + Number(r.amount_try ?? 0)
  }, 0)
  const lastThreeMonthsExpenses = (lastThreeMonthsExpensesRes.data ?? []).reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
  const overdueReceivables      = (overdueRes.data                ?? []).reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number((r as { amount_paid?: number | null }).amount_paid ?? 0)), 0)

  const stockValue = (stockRes.data ?? []).reduce(
    (s, l) => s + Number(l.qty_remaining ?? 0) * Number((l as { cost_price_try?: number | null }).cost_price_try ?? 0),
    0,
  )

  // PART 6: stock coverage ratio = stock_value / total_partner_capital
  const totalPartnerCapital = (partnerCapitalRes.data ?? []).reduce(
    (s, r) => s + Number((r as { amount_try: number }).amount_try ?? 0), 0,
  )
  const stockCoverageRatio: number | null = totalPartnerCapital > 0
    ? Math.round((stockValue / totalPartnerCapital) * 10000) / 10000
    : null

  // Net profit approximation: gross profit (revenue - cogs) - expenses
  const grossProfit = totalRevenue - totalCogs
  const netProfit   = grossProfit - totalExpenses

  // ── Cash position ─────────────────────────────────────────────────────────
  // all-time collected cash MINUS all-time expenses actually paid
  const cashPosition = allTimeCollected - allTimeExpenses

  // ── Burn rate (actual trailing) ───────────────────────────────────────────
  // Trailing average: last 3 months paid expenses where
  // expense_type in ('operational','fixed','variable') / 3.
  const monthlyBurnRate = lastThreeMonthsExpenses / 3

  // ── Adjusted burn rate (includes committed recurring liabilities) ─────────
  //
  // Formula:  adjusted_burn_rate = max(monthly_burn_rate, recurring_monthly_commitment)
  //
  // recurring_monthly_commitment = Σ over active recurring expenses of:
  //   monthly:   amount_try × 1       (fires every month)
  //   quarterly: amount_try × (1/3)   (fires every 3 months → 1/3 per month)
  //   yearly:    amount_try × (1/12)  (fires once a year → 1/12 per month)
  //
  // Purpose: if recurring liabilities haven't been logged as actual expenses yet
  // (e.g. invoice received but not entered), the trailing avg would understate true burn.
  // Taking max(actual, committed) gives a conservative floor.
  //
  // Validation: if monthly_burn_rate > recurring (all recurrings are already logged),
  // adjusted_burn_rate = monthly_burn_rate (no change, actuals dominate).
  const FREQ_FACTOR: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
  const recurringMonthlyCommitment = (recurringRes.data ?? []).reduce((sum, r) => {
    const amtTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
    const factor = FREQ_FACTOR[r.frequency as string] ?? 0
    return sum + amtTry * factor
  }, 0)
  const adjustedBurnRate = Math.max(monthlyBurnRate, recurringMonthlyCommitment)

  // ── Runway ────────────────────────────────────────────────────────────────
  // cash_position / adjusted_burn_rate
  // null when adjusted_burn_rate ≤ 0 (company has no meaningful cash burn)
  const runwayMonths: number | null = adjustedBurnRate > 0
    ? Math.round((cashPosition / adjustedBurnRate) * 10) / 10
    : null

  const result: KpiResult = {
    total_revenue:           round2(totalRevenue),
    total_collected:         round2(totalCollected),
    outstanding_receivables: round2(outstanding),
    overdue_receivables:     round2(overdueReceivables),
    total_expenses:          round2(totalExpenses),
    net_profit:              round2(netProfit),
    stock_value:             round2(stockValue),
    stock_coverage_ratio:    stockCoverageRatio,
    cash_position:           round2(cashPosition),
    monthly_burn_rate:       round2(monthlyBurnRate),
    adjusted_burn_rate:      round2(adjustedBurnRate),
    runway_months:           runwayMonths,
    period_from:             from,
    period_to:               to,
  }

  return NextResponse.json(result)

  } catch (err) {
    console.error('[kpi GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'KPI verileri alınamadı', code: 'INTERNAL_ERROR', type: 'SYSTEM' }, { status: 500 })
  }
}
