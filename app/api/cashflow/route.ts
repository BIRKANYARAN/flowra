// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cashflow
//
// Monthly cashflow projection: 6 months historical + 6 months forward.
//
// CASH-BASIS MODEL — strict payment logic:
//   invoiced     — context only: sales total_try by created_at month (NOT cash inflow)
//   collected    — CASH inflow: paid sales total_try by paid_at month
//                  ONLY payment_status='paid' counted; partial/unpaid → receivable
//   receivable   — outstanding: invoiced this month still unpaid/partial/overdue
//   expenses     — CASH outflow: paid expenses by expense_date
//                  + recurring projections for future months ONLY (avoids double-count)
//   net          — collected − expenses  (strict cash basis)
//   cumulative   — running net from month[0]
//   is_projected — false for past/current months; true for future months
//
// Partial payments: counted as full receivable (no amount_paid column in schema).
// When a partial is fully paid, it shifts from receivable→collected in the paid_at month.
//
// Query params:
//   past_months    number  historical months to include (default 6, max 12)
//   future_months  number  forward months to project   (default 6, max 12)
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import type { CashflowMonth } from '@/types'
import { resolveApiAuth } from '@/lib/api-auth'

const CASH_EXCLUDED_EXPENSE_TYPES = new Set([
  'loan_repayment',
  'partner_financing',
  'dividend',
  'internal_transfer',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function toYM(d: Date | string): string {
  const dt = typeof d === 'string' ? new Date(d.slice(0, 10) + 'T00:00:00Z') : d
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total  = (y * 12 + (m - 1)) + n
  const ny     = Math.floor(total / 12)
  const nm     = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

function monthDiff(ymA: string, ymB: string): number {
  const [ya, ma] = ymA.split('-').map(Number)
  const [yb, mb] = ymB.split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}

/** First day of a YYYY-MM month as YYYY-MM-DD */
function ymStart(ym: string): string { return `${ym}-01` }

/** Last day of a YYYY-MM month as YYYY-MM-DD */
function ymEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const url          = new URL(req.url)
  const pastMonths   = Math.min(Math.max(Number(url.searchParams.get('past_months')   ?? 6), 1), 12)
  const futureMonths = Math.min(Math.max(Number(url.searchParams.get('future_months') ?? 6), 1), 12)

  const nowYM      = toYM(new Date())
  const startYM    = addMonths(nowYM, -pastMonths)
  const endYM      = addMonths(nowYM, futureMonths - 1)  // inclusive
  const windowSize = pastMonths + futureMonths

  try {

  // ── Build month grid ───────────────────────────────────────────────────────
  const months = new Map<string, CashflowMonth>()
  for (let i = 0; i < windowSize; i++) {
    const ym = addMonths(startYM, i)
    months.set(ym, {
      month:        ym,
      invoiced:     0,
      collected:    0,
      receivable:   0,
      expenses:     0,
      net:          0,
      cumulative:   0,
      is_projected: monthDiff(nowYM, ym) > 0,
    })
  }

  // ── 1. Invoiced context: sales by created_at month (NOT cash — context only) ─
  // This populates `invoiced` for display/analysis. It does NOT affect net or cumulative.
  // Net is strictly: collected − expenses.
  const { data: salesInvoiced } = await supabase
    .from('sales')
    .select('total_try, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('created_at', ymStart(startYM))
    .lte('created_at', ymEnd(endYM) + 'T23:59:59Z')

  for (const s of salesInvoiced ?? []) {
    const ym  = toYM(s.created_at as string)
    const row = months.get(ym)
    if (row) row.invoiced += Number(s.total_try ?? 0)
  }

  // ── 1b. Receivables by invoice month (outstanding = invoiced but not yet paid) ─
  // Shows: of what was invoiced this month, how much is still unpaid/partial/overdue.
  // Partial payments counted as full receivable (no amount_paid column in schema).
  const { data: receivableRows } = await supabase
    .from('sales')
    .select('total_try, created_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('payment_status', ['pending', 'partial', 'overdue'])
    .gte('created_at', ymStart(startYM))
    .lte('created_at', ymEnd(endYM) + 'T23:59:59Z')

  for (const s of receivableRows ?? []) {
    const ym  = toYM(s.created_at as string)
    const row = months.get(ym)
    if (row) row.receivable += Number(s.total_try ?? 0)
  }

  // ── 2. Collections by payment month (paid_at) ──────────────────────────────
  const { data: collections } = await supabase
    .from('sales')
    .select('total_try, paid_at')
    .eq('company_id', companyId)
    .eq('payment_status', 'paid')
    .is('deleted_at', null)
    .not('paid_at', 'is', null)
    .gte('paid_at', ymStart(startYM))
    .lte('paid_at', ymEnd(endYM) + 'T23:59:59Z')

  for (const c of collections ?? []) {
    const ym  = toYM(c.paid_at as string)
    const row = months.get(ym)
    if (row) row.collected += Number(c.total_try ?? 0)
  }

  // ── 3. Actual expenses by expense_date ────────────────────────────────────
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount_try, expense_date, expense_type')
    .eq('company_id', companyId)
    .eq('payment_status', 'paid')
    .is('deleted_at', null)
    .gte('expense_date', ymStart(startYM))
    .lte('expense_date', ymEnd(endYM))

  for (const e of expenses ?? []) {
    const expenseType = String(e.expense_type ?? '')
    if (expenseType && CASH_EXCLUDED_EXPENSE_TYPES.has(expenseType)) continue
    const ym  = (e.expense_date as string).slice(0, 7)
    const row = months.get(ym)
    if (row) row.expenses += Number(e.amount_try ?? 0)
  }

  // ── 4. Recurring expenses: expand into all months in the window ────────────
  const { data: recurrings } = await supabase
    .from('recurring_expenses')
    .select('id, amount, fx_rate, frequency, start_date, end_date, expense_type')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)

  for (const rec of recurrings ?? []) {
    const expenseType = String(rec.expense_type ?? '')
    if (expenseType && CASH_EXCLUDED_EXPENSE_TYPES.has(expenseType)) continue
    const recStartYM = toYM(rec.start_date as string)
    const recEndYM   = rec.end_date ? toYM(rec.end_date as string) : null
    const amtTry     = Number(rec.amount) * Number(rec.fx_rate)
    const freq       = rec.frequency as 'monthly' | 'quarterly' | 'yearly'
    const step       = freq === 'monthly' ? 1 : freq === 'quarterly' ? 3 : 12

    for (const [ym, row] of months) {
      if (monthDiff(recStartYM, ym) < 0) continue
      if (recEndYM && monthDiff(ym, recEndYM) < 0) continue
      const diff = monthDiff(recStartYM, ym)
      if (diff % step !== 0) continue

      // For past months: actual expenses are already counted from the expenses table.
      // Recurring projections are only additive for future months (and current month
      // if the actual expense hasn't been entered yet — project conservatively).
      // This avoids double-counting actual + recurring for past months.
      if (row.is_projected) {
        row.expenses += amtTry
      }
    }
  }

  // ── 5. Compute net + cumulative ────────────────────────────────────────────
  let cumulative = 0
  const result: CashflowMonth[] = []
  for (const ym of Array.from(months.keys()).sort()) {
    const row  = months.get(ym)!
    row.net    = row.collected - row.expenses
    cumulative += row.net
    row.cumulative = cumulative
    result.push(row)
  }

  return NextResponse.json(result)

  } catch (err) {
    console.error('[cashflow GET] Unexpected error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Nakit akışı hesaplanamadı', code: 'INTERNAL_ERROR', type: 'SYSTEM' }, { status: 500 })
  }
}
