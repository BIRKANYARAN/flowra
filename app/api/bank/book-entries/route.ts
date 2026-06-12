// ── /api/bank/book-entries — read-only cash movements for reconciliation ──────
//
// Returns Flowra's BOOK cash movements as signed BookEntry[]:
//   • collections (sale paid amounts) → inflow  (+)
//   • expense payments                → outflow (−)
// Consumed client-side by reconcileBankToBook() against an uploaded bank
// statement. READ-ONLY — selects only, no writes, no DDL.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import type { BookEntry } from '@/lib/connectors/reconcile'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const from = (searchParams.get('from') ?? '').slice(0, 10) || null
  const to   = (searchParams.get('to')   ?? '').slice(0, 10) || null

  const entries: BookEntry[] = []

  // ── Collections (inflows) — sales that have been paid in part or full ───────
  let salesQ = supabase
    .from('sales')
    .select('id, customer_name, total:total, paid_amount, payment_status, sale_date, paid_at')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('payment_status', 'pending')
  if (from) salesQ = salesQ.gte('sale_date', from)
  if (to)   salesQ = salesQ.lte('sale_date', to)
  const { data: sales } = await salesQ.limit(2000)

  for (const s of (sales ?? []) as Array<Record<string, unknown>>) {
    const paid = s.payment_status === 'paid'
      ? Number(s.total ?? 0)
      : Number(s.paid_amount ?? 0)
    if (paid <= 0) continue
    entries.push({
      id:     `sale:${s.id}`,
      date:   String((s.paid_at as string) || (s.sale_date as string) || '').slice(0, 10),
      amount: Math.round(paid * 100) / 100,                 // + inflow
      label:  `Tahsilat · ${String(s.customer_name ?? '—')}`,
    })
  }

  // ── Payments (outflows) — paid expenses ─────────────────────────────────────
  let expQ = supabase
    .from('expenses')
    .select('id, title, description, amount_try, payment_status, expense_date')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('payment_status', 'paid')
  if (from) expQ = expQ.gte('expense_date', from)
  if (to)   expQ = expQ.lte('expense_date', to)
  const { data: expenses } = await expQ.limit(2000)

  for (const e of (expenses ?? []) as Array<Record<string, unknown>>) {
    const amt = Number(e.amount_try ?? 0)
    if (amt <= 0) continue
    entries.push({
      id:     `expense:${e.id}`,
      date:   String((e.expense_date as string) || '').slice(0, 10),
      amount: -Math.round(amt * 100) / 100,                 // − outflow
      label:  `Ödeme · ${String(e.title ?? e.description ?? 'Gider')}`,
    })
  }

  entries.sort((a, b) => (a.date < b.date ? 1 : -1))
  return NextResponse.json({ entries })
}
