// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/simulation/runway
//
// Monthly cash runway projection over a configurable horizon.
// READ-ONLY — zero DB writes.
//
// Query params:
//   months   number   horizon (1–24, default 12)
//   from     YYYY-MM-DD  period start for current metrics (default: this month start)
//   to       YYYY-MM-DD  period end (default: today)
//
// Response: RunwayForecast (see lib/finance/cfo-metrics.ts)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  computeCashMetrics,
  computeReceivableMetrics,
  computeRunwayForecast,
  BURN_EXPENSE_TYPES,
} from '@/lib/finance/cfo-metrics'
import { resolveApiAuth } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url     = new URL(req.url)
  const now     = new Date()
  const today   = now.toISOString().slice(0, 10)
  const year    = now.getFullYear()
  const mon     = String(now.getMonth() + 1).padStart(2, '0')
  const from    = url.searchParams.get('from') ?? `${year}-${mon}-01`
  const to      = url.searchParams.get('to')   ?? today
  const rawM    = parseInt(url.searchParams.get('months') ?? '12', 10)
  const horizon = Math.min(24, Math.max(1, isFinite(rawM) ? rawM : 12))

  const trail3Start = new Date(now)
  trail3Start.setMonth(trail3Start.getMonth() - 3)
  const trail3 = trail3Start.toISOString().slice(0, 10)

  try {
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

      // Use sale_date (business invoice date) not created_at (DB insertion time)
      supabase.from('sales').select('total_try:total')
        .eq('company_id', companyId).is('deleted_at', null)
        .gte('sale_date', from).lte('sale_date', to),

      // Active recurring burn expenses — for projected monthly commitment
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
        sale_date:   String(r.sale_date ?? ''),
        due_date:    r.due_date ? String(r.due_date) : null,
        amount_paid: r.amount_paid != null ? Number(r.amount_paid) : null,
      })),
      today,
    })

    // Monthly recurring commitment (takes max of trailing avg vs. committed)
    const FREQ_FACTOR: Record<string, number> = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
    const recurringMonthlyCommit = (recurringActiveRes.data ?? []).reduce((s, r) => {
      const amtTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
      return s + amtTry * (FREQ_FACTOR[r.frequency as string] ?? 0)
    }, 0)

    const monthlyBurn = Math.max(cashMetrics.monthly_burn_rate, recurringMonthlyCommit)

    // Conservative collection assumption: expect 70% of overdue to arrive in month 1
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
        taxObligation: 0,   // caller can inject via params in the future
        months: horizon,
      },
      now,
    )

    return NextResponse.json({
      ...forecast,
      inputs: {
        starting_cash:     cashMetrics.distributable_cash,
        monthly_burn:      monthlyBurn,
        outstanding_total: receivableMetrics.total_outstanding,
        horizon_months:    horizon,
      },
    })
  } catch (err) {
    console.error('[simulation/runway] error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Runway hesaplanamadı', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
