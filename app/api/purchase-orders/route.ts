// ─────────────────────────────────────────────────────────────────────────────
// /api/purchase-orders
//   GET  ?status=draft|ordered|received|cancelled  → list
//   POST                                           → create
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { checkPeriodGuard } from '@/lib/middleware/period-guard'

const VALID_STATUSES = new Set(['draft', 'ordered', 'received', 'cancelled'])

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const url    = new URL(req.url)
  const status = url.searchParams.get('status')

  let query = supabase
    .from('purchase_orders')
    .select(`
      id, supplier_name, order_date, expected_date, status,
      currency, total_try, notes, created_at,
      purchase_order_items (
        id, product_id, name, unit, quantity, unit_price, currency, sort_order
      )
    `)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('order_date', { ascending: false })

  if (status && VALID_STATUSES.has(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ orders: data ?? [], count: (data ?? []).length })
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const supplier_name = typeof body.supplier_name === 'string' ? body.supplier_name.trim() : ''
  if (!supplier_name) return NextResponse.json({ error: 'supplier_name zorunludur' }, { status: 400 })

  const order_date   = typeof body.order_date   === 'string' ? body.order_date   : new Date().toISOString().slice(0, 10)
  const expected_date = typeof body.expected_date === 'string' ? body.expected_date : null
  const currency     = typeof body.currency     === 'string' ? body.currency     : 'TRY'
  const notes        = typeof body.notes        === 'string' ? body.notes        : null
  const items: Array<{
    product_id?: string; name: string; unit: string; quantity: number; unit_price: number; currency?: string; sort_order?: number
  }> = Array.isArray(body.items) ? body.items : []

  // Period guard
  const guard = await checkPeriodGuard(companyId, order_date, supabase)
  if (guard.blocked) return NextResponse.json({ error: guard.reason, code: 'PERIOD_LOCKED' }, { status: 409 })

  // Compute total_try (simple: Σ qty × unit_price, assuming TRY for now)
  const total_try = items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)

  const { data: order, error: orderErr } = await supabase
    .from('purchase_orders')
    .insert({
      company_id: companyId, user_id: uid,
      supplier_name, order_date, expected_date,
      status: 'draft', currency, total_try, notes,
    })
    .select('id')
    .single()

  if (orderErr || !order) return NextResponse.json({ error: orderErr?.message ?? 'Kayıt başarısız' }, { status: 500 })

  // Insert line items
  if (items.length > 0) {
    const linePayload = items.map((it, idx) => ({
      purchase_order_id: order.id,
      product_id:  it.product_id ?? null,
      name:        String(it.name ?? ''),
      unit:        String(it.unit ?? 'adet'),
      quantity:    Number(it.quantity) || 1,
      unit_price:  Number(it.unit_price) || 0,
      currency:    it.currency ?? currency,
      sort_order:  it.sort_order ?? idx,
    }))
    const { error: lineErr } = await supabase.from('purchase_order_items').insert(linePayload)
    if (lineErr) console.error('[purchase-orders] items insert:', lineErr.message)
  }

  return NextResponse.json({ id: order.id }, { status: 201 })
}
