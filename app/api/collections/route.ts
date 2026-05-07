// ── /api/collections ─────────────────────────────────────────────────────────
// GET   — list sales with payment_status (filter by ?status=unpaid|paid|all)
// PATCH — update payment_status on a sale (mark paid / unpaid / partial / overdue)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'

const ALLOWED_STATUSES = ['unpaid', 'paid', 'partial', 'overdue'] as const
type PaymentStatus = typeof ALLOWED_STATUSES[number]

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user)
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get('status') ?? 'all'

  try {
    let query = supabase
      .from('sales')
      .select('id, customer_name, currency, total, total_try, nominal_profit, created_at, due_date, amount_paid, proforma_id, payment_status, paid_at, proformas(proforma_no)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (ALLOWED_STATUSES.includes(statusFilter as PaymentStatus)) {
      query = query.eq('payment_status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
      // payment_status column may not exist on older deployments — fall back
      // to a basic query that returns all sales as uncollected
      if (error.message.includes('payment_status')) {
        const { data: fallback } = await supabase
          .from('sales')
          .select('id, customer_name, currency, total, total_try, nominal_profit, created_at, proforma_id, proformas(proforma_no)')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(200)

        return NextResponse.json(
          (fallback ?? []).map(r => ({ ...r, payment_status: 'unpaid', paid_at: null }))
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user)
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

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
      return NextResponse.json({ error: 'Geçerli payment_status: unpaid | paid | partial | overdue' }, { status: 422 })

    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      payment_status,
      updated_at: now,
      // Set paid_at when marking as fully paid; clear it otherwise
      paid_at: payment_status === 'paid' ? now : null,
    }

    // Optional fields — only write when explicitly provided
    if (amount_paid !== undefined) patch.amount_paid = amount_paid
    if (due_date !== undefined)    patch.due_date    = due_date

    const { error } = await supabase
      .from('sales')
      .update(patch)
      .eq('id', id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ updated: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
