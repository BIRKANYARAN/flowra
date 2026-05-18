// ─────────────────────────────────────────────────────────────────────────────
// /api/purchase-orders/[id]
//   GET   → single order with items
//   PATCH → update status / notes / expected_date
//   DELETE → soft delete
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditFinancialMutation } from '@/lib/db/mutation-audit'

const VALID_STATUSES = new Set(['draft', 'ordered', 'received', 'cancelled'])

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth
  const { id } = await params

  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      id, supplier_name, order_date, expected_date, status,
      currency, total_try, notes, created_at, updated_at,
      purchase_order_items (
        id, product_id, name, unit, quantity, unit_price, currency, sort_order
      )
    `)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .single()

  if (error) return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth
  const { id } = await params

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) patch.status = body.status
  if (typeof body.notes === 'string')         patch.notes         = body.notes
  if (typeof body.expected_date === 'string') patch.expected_date = body.expected_date
  if (typeof body.supplier_name === 'string') patch.supplier_name = body.supplier_name.trim()

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  const { error } = await supabase
    .from('purchase_orders')
    .update(patch)
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  auditFinancialMutation('purchase', {
    userId:    uid,
    companyId,
    entityId:  id,
    action:    'update',
    newData:   patch,
    source:    'api/purchase-orders/[id]',
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth
  const { id } = await params

  const { error } = await supabase
    .from('purchase_orders')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  auditFinancialMutation('purchase', {
    userId:    uid,
    companyId,
    entityId:  id,
    action:    'delete',
    newData:   null,
    source:    'api/purchase-orders/[id]',
  })

  return NextResponse.json({ ok: true })
}
