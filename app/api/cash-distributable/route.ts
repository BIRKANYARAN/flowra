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
//   outstanding_obligations = unpaid_expenses
//   cash_distributable      = max(0, cash_balance - outstanding_obligations)
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
//       outstanding_obligations: number,
//     }
//   }
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { computeCashPosition } from '@/lib/finance/cash'

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
    const [paidSalesRes, paidExpensesRes, unpaidExpensesRes] = await Promise.all([
      supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .not('paid_at', 'is', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', to + 'T23:59:59Z'),
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
        .select('amount_try, expense_type')   // need expense_type to filter excluded flows
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null),
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
    const { cashBalance, outstandingObligations, cashDistributable } = computeCashPosition({
      paymentsReceived,
      paidExpenses,
      unpaidExpenses,
    })

    return NextResponse.json({
      cash_distributable: cashDistributable,
      period: { from, to },
      breakdown: {
        payments_received:       Math.round(paymentsReceived * 100) / 100,
        paid_expenses:           Math.round(paidExpenses * 100) / 100,
        cash_balance:            cashBalance,
        unpaid_expenses:         Math.round(unpaidExpenses * 100) / 100,
        outstanding_obligations: outstandingObligations,
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
