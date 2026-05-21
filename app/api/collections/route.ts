// ── /api/collections ─────────────────────────────────────────────────────────
// GET   — list sales with payment_status (filter by ?status=unpaid|paid|all)
// PATCH — update payment_status on a sale (mark paid / unpaid / partial / overdue)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditPaymentApplied } from '@/lib/db/mutation-audit'

const ALLOWED_STATUSES = ['pending', 'paid', 'partial', 'overdue', 'cancelled'] as const
type PaymentStatus = typeof ALLOWED_STATUSES[number]

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') ?? 'all'
  const sortMode     = searchParams.get('sort') ?? ''

  try {
    let query = supabase
      .from('sales')
      .select('id, customer_name, currency, total_try:total, sale_date, created_at, due_date, amount_paid:paid_amount, proforma_id, payment_status, paid_at, proformas(proforma_no)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('sale_date', { ascending: false })
      .limit(200)

    if (statusFilter === 'unpaid') {
      // 'unpaid' is a virtual status: all rows that are not yet fully collected
      query = query.in('payment_status', ['pending', 'partial', 'overdue'])
    } else if (ALLOWED_STATUSES.includes(statusFilter as PaymentStatus)) {
      query = query.eq('payment_status', statusFilter)
    }
    // else: no filter → return all rows

    const { data, error } = await query

    if (error) {
      // payment_status column may not exist on older deployments — fall back
      // to a basic query that returns all sales as uncollected
      if (error.message.includes('payment_status')) {
        const { data: fallback } = await supabase
          .from('sales')
          .select('id, customer_name, currency, total_try:total, sale_date, created_at, proforma_id, proformas(proforma_no)')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('sale_date', { ascending: false })
          .limit(200)

        return NextResponse.json(
          (fallback ?? []).map(r => ({ ...r, payment_status: 'pending', paid_at: null }))
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let result = data ?? []

    // ── Risk sort: score = (days_since_due × 0.6) + (amount_try / 10000 × 0.4) ──
    if (sortMode === 'risk') {
      const today = new Date().toISOString().slice(0, 10)
      result = [...result].sort((a, b) => {
        const scoreOf = (r: typeof result[number]) => {
          const refDate = (r as { due_date?: string | null; sale_date?: string | null }).due_date
            ?? (r as { due_date?: string | null; sale_date?: string | null }).sale_date
            ?? ''
          const days = refDate
            ? Math.max(0, Math.round((new Date(today).getTime() - new Date((refDate as string).slice(0, 10)).getTime()) / 86_400_000))
            : 0
          const amtTry = Number((r as { total_try?: number }).total_try ?? 0)
          return days * 0.6 + (amtTry / 10000) * 0.4
        }
        return scoreOf(b) - scoreOf(a)
      })
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  try {
    const body = await req.json()
    const { id, payment_status, amount_paid, due_date } = body as {
      id?: string
      payment_status?: string
      amount_paid?: number | null
      due_date?: string | null
    }

    if (!id)
      return NextResponse.json({ error: 'id zorunludur' }, { status: 422 })

    if (!payment_status || !ALLOWED_STATUSES.includes(payment_status as PaymentStatus))
      return NextResponse.json({ error: 'Geçerli payment_status: pending | paid | partial | overdue | cancelled' }, { status: 422 })

    // Fetch current row BEFORE update — needed for audit trail old_data
    const { data: existingRow } = await supabase
      .from('sales')
      .select('paid_amount, payment_status')
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      payment_status,
      updated_at: now,
      // Set paid_at when marking as fully paid; clear it otherwise
      paid_at: payment_status === 'paid' ? now : null,
    }

    // Optional fields — only write when explicitly provided
    if (amount_paid !== undefined)
      patch.paid_amount = amount_paid != null ? Math.max(0, Number(amount_paid) || 0) : null
    if (due_date !== undefined)    patch.due_date    = due_date

    const { error } = await supabase
      .from('sales')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Fire-and-forget audit trail — payment mutations must be traceable
    auditPaymentApplied({
      userId:              uid,
      companyId,
      saleId:              id,
      previousPaidAmount:  Number(existingRow?.paid_amount ?? 0),
      newPaidAmount:       Number(patch.paid_amount ?? existingRow?.paid_amount ?? 0),
      paymentStatus:       payment_status,
      source:              'api/collections',
    })

    return NextResponse.json({ updated: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
