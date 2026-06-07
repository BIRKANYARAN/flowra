// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cash-distributable
//
// Returns cash-basis distributable cash for the current company.
//
// Formula:
//   payments_received       = sum paid sales by paid_at in period
//   paid_expenses           = sum expenses where payment_status = 'paid' in period,
//                             excluding loan/partner/dividend/internal flows
//   unpaid_expenses         = sum expenses where payment_status != 'paid'
//   cash_balance            = payments_received - paid_expenses
//   outstanding_obligations = unpaid_expenses + committed_upcoming (recurring next 30d)
//   cash_distributable      = max(0, cash_balance - outstanding_obligations)
//
// Additionally returns fiscal_reserves: the KDV (output VAT - input VAT) owed to
// the tax authority that is currently embedded in the distributable cash. This makes
// the CFO aware that cash_distributable includes VAT collected from customers.
//
//   net_kdv_payable  = Σ kdv_amount_try (paid sales) - Σ kdv (paid expenses)
//   truly_distributable = max(0, cash_distributable - net_kdv_payable)
//
// Query params:
//   from   YYYY-MM-DD  (optional — defaults to first day of current month)
//   to     YYYY-MM-DD  (optional — defaults to today)
//
// Response:
//   {
//     cash_distributable: number,
//     period:             { from: string, to: string },
//     breakdown: {
//       payments_received:       number,
//       paid_expenses:           number,
//       cash_balance:            number,
//       unpaid_expenses:         number,
//       committed_upcoming_try:  number,   // recurring expenses firing next 30d
//       outstanding_obligations: number,
//     },
//     fiscal_reserves: {
//       net_kdv_payable:       number,   // KDV to remit to government
//       truly_distributable:   number,   // cash_distributable minus fiscal obligations
//     }
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { computeCashPosition } from '@/lib/finance/cash'
import { round2 } from '@/lib/calc'
import { materializeRecurring } from '@/lib/services/finance-rules'
import type { RecurrenceFrequency } from '@/types'

const CASH_EXCLUDED_EXPENSE_TYPES = new Set([
  'loan_repayment',
  'partner_financing',
  'dividend',
  'internal_transfer',
])

function currentMonthRange(): { from: string; to: string } {
  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  return {
    from: `${year}-${mon}-01`,
    to:   now.toISOString().slice(0, 10),
  }
}

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url = new URL(req.url)
  const defaultPeriod = currentMonthRange()
  const from = parseDate(url.searchParams.get('from')) ?? defaultPeriod.from
  const to   = parseDate(url.searchParams.get('to'))   ?? defaultPeriod.to

  try {
    // Recurring expense look-ahead: what fires in the next 30 days?
    const today     = new Date().toISOString().slice(0, 10)
    const lookAhead = new Date()
    lookAhead.setUTCDate(lookAhead.getUTCDate() + 30)
    const lookAheadDate = lookAhead.toISOString().slice(0, 10)

    const [paidSalesRes, paidExpensesRes, unpaidExpensesRes, recurringRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total_try, kdv_amount_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .not('paid_at', 'is', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', to + 'T23:59:59Z'),
      supabase
        .from('expenses')
        .select('amount_try, expense_type, kdv')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),
      supabase
        .from('expenses')
        .select('amount_try, expense_type')   // need expense_type to filter excluded flows
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null),
      // Active recurring templates — for upcoming obligation projection
      supabase
        .from('recurring_expenses')
        // recurring_expenses has `category` (free text), not expense_type
        .select('frequency, start_date, end_date, amount, fx_rate, category, is_deductible')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .limit(200),
    ])

    const queryError = paidSalesRes.error ?? paidExpensesRes.error ?? unpaidExpensesRes.error
    if (queryError) {
      console.error('[cash-distributable] query error:', queryError.message)
      return NextResponse.json(
        { error: 'Dağıtılabilir nakit hesaplanamadı', code: 'DB_READ_FAILED', type: 'SYSTEM' },
        { status: 500 },
      )
    }

    const paymentsReceived = (paidSalesRes.data ?? []).reduce(
      (s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0,
    )
    const paidExpenses = (paidExpensesRes.data ?? []).reduce(
      (s: number, r: { amount_try: number; expense_type: string | null }) => {
        if (r.expense_type && CASH_EXCLUDED_EXPENSE_TYPES.has(r.expense_type)) return s
        return s + Number(r.amount_try ?? 0)
      },
      0,
    )
    // Mirror the same excluded-type filter applied to paidExpenses:
    // loan repayments, partner financing, dividends, and internal transfers are
    // NOT operating cash obligations — excluding them keeps the signal clean.
    const unpaidExpenses = (unpaidExpensesRes.data ?? []).reduce(
      (s: number, r: { amount_try: number; expense_type: string | null }) => {
        if (r.expense_type && CASH_EXCLUDED_EXPENSE_TYPES.has(r.expense_type)) return s
        return s + Number(r.amount_try ?? 0)
      },
      0,
    )

    // ── Recurring expense upcoming obligations ────────────────────────────────
    // Sum amounts for recurring templates that fire in [today, today+30d].
    // This captures committed expenses not yet in the expenses table (they materialize
    // on occurrence) — e.g. rent due next week, salary due in 15 days.
    // Financing-type recurring expenses (loan_repayment, dividend, etc.) are excluded —
    // same filter logic as unpaidExpenses.
    let committedUpcomingTry = 0
    for (const rec of recurringRes.data ?? []) {
      if (rec.category && CASH_EXCLUDED_EXPENSE_TYPES.has(rec.category)) continue
      try {
        const occurrences = materializeRecurring(
          {
            frequency:  rec.frequency as RecurrenceFrequency,
            start_date: rec.start_date as string,
            end_date:   rec.end_date as string | null,
          },
          { from: today, to: lookAheadDate },
        )
        const amtTry = Number(rec.amount ?? 0) * Number(rec.fx_rate ?? 1)
        committedUpcomingTry += occurrences.length * amtTry
      } catch {
        // Malformed recurring template — skip silently, don't crash distributable calc
      }
    }
    committedUpcomingTry = round2(committedUpcomingTry)

    const totalObligations = round2(unpaidExpenses + committedUpcomingTry)
    const { cashBalance, cashDistributable } = computeCashPosition({
      paymentsReceived,
      paidExpenses,
      unpaidExpenses: totalObligations,
    })

    // ── Fiscal reserves (KDV transparency) ───────────────────────────────────
    // KDV collected from customers (embedded in payments_received via total_try) is
    // NOT the company's money — it must be remitted monthly to the tax authority.
    // Exposing net_kdv_payable here prevents the CFO from treating full
    // cash_distributable as freely deployable capital.
    //
    // Note: kdv_amount_try = 0 for sales created before accounting_truth_v1.sql
    // migration (they default to 0). Post-migration rows carry the correct frozen KDV.
    // The figure may be understated on older data, but is never overstated.
    const outputKdv = (paidSalesRes.data ?? []).reduce(
      (s: number, r: { total_try: number; kdv_amount_try?: number | null }) => s + Number(r.kdv_amount_try ?? 0), 0,
    )
    const inputKdv = (paidExpensesRes.data ?? []).reduce(
      (s: number, r: { amount_try: number; expense_type: string | null; kdv?: number | null }) => {
        if (r.expense_type && CASH_EXCLUDED_EXPENSE_TYPES.has(r.expense_type)) return s
        return s + Number(r.kdv ?? 0)
      },
      0,
    )
    const netKdvPayable    = round2(Math.max(0, outputKdv - inputKdv))
    const trulyDistributable = round2(Math.max(0, cashDistributable - netKdvPayable))

    return NextResponse.json({
      cash_distributable: cashDistributable,
      period: { from, to },
      breakdown: {
        payments_received:       round2(paymentsReceived),
        paid_expenses:           round2(paidExpenses),
        cash_balance:            cashBalance,
        unpaid_expenses:         round2(unpaidExpenses),
        committed_upcoming_try:  committedUpcomingTry,
        outstanding_obligations: totalObligations,
      },
      fiscal_reserves: {
        net_kdv_payable:     netKdvPayable,
        truly_distributable: trulyDistributable,
      },
    })
  } catch (err) {
    console.error('[cash-distributable]', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Dağıtılabilir nakit hesaplanamadı', code: 'INTERNAL_ERROR', type: 'SYSTEM' },
      { status: 500 },
    )
  }
}
