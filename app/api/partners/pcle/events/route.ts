import { NextRequest, NextResponse } from 'next/server'
import { requireRole }       from '@/lib/require-role'
import { checkPeriodGuard }  from '@/lib/middleware/period-guard'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/events?partner_id=X&limit=50&offset=0
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params     = req.nextUrl.searchParams
    const partner_id = params.get('partner_id')
    const limit      = Math.min(parseInt(params.get('limit')  ?? '50'), 200)
    const offset     = parseInt(params.get('offset') ?? '0')

    let query = supabase
      .from('partner_finance_events')
      .select('id, partner_id, event_type, amount_try, currency, event_date, reference, description, created_at')
      .eq('company_id', companyId)
      .order('event_date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (partner_id) {
      query = query.eq('partner_id', partner_id)
    }

    const { data, error } = await query
    if (error) {
      // Table may not exist yet (migration not applied) — return empty gracefully
      console.warn('[partners/pcle/events] query error (table may not exist):', error.message)
      return NextResponse.json({ events: [], total: 0 })
    }

    return NextResponse.json({ events: data ?? [], total: (data ?? []).length })
  } catch (e) {
    console.error('[partners/pcle/events] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// POST /api/partners/pcle/events — record a new PCLE event (admin only)
export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    try {
      await requireRole(uid, companyId, 'admin', supabase)
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { partner_id, event_type, amount_try, event_date, reference, description, metadata } = body

    if (!partner_id || !event_type || amount_try == null) {
      return NextResponse.json({ error: 'partner_id, event_type, amount_try required' }, { status: 400 })
    }

    const txDate = typeof event_date === 'string' ? event_date : new Date().toISOString().slice(0, 10)
    const guard = await checkPeriodGuard(companyId, txDate, supabase)
    if (guard.blocked) {
      return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('partner_finance_events')
      .insert({
        company_id:  companyId,
        partner_id,
        event_type,
        amount_try:  Number(amount_try),
        event_date:  event_date ?? new Date().toISOString().slice(0, 10),
        reference:   reference ?? null,
        description: description ?? null,
        metadata:    metadata ?? null,
        created_by:  uid,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[partners/pcle/events POST] error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (e) {
    console.error('[partners/pcle/events POST] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
