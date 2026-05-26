// ─────────────────────────────────────────────────────────────────────────────
// /api/purchase-orders/[id]/receive
//   POST — mark an order as received:
//          • status → 'received'
//          • received_by = current user
//          • received_at = now()
//          • optionally update received_quantity on items
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { auditFinancialMutation } from '@/lib/db/mutation-audit'

interface ReceiveItemPayload {
  id:                string
  received_quantity: number
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth
  const { id } = await params

  // Verify order exists and belongs to this company
  const { data: order, error: fetchErr } = await supabase
    .from('purchase_orders')
    .select('id, status')
    .eq('id', id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .single()

  if (fetchErr || !order) {
    return NextResponse.json({ error: 'Sipariş bulunamadı' }, { status: 404 })
  }

  if (order.status === 'received') {
    return NextResponse.json({ error: 'Bu sipariş zaten teslim alındı' }, { status: 409 })
  }

  if (order.status === 'cancelled') {
    return NextResponse.json({ error: 'İptal edilmiş sipariş teslim alınamaz' }, { status: 409 })
  }

  // Parse optional items received_quantity updates
  let itemUpdates: ReceiveItemPayload[] = []
  try {
    const body = await req.json().catch(() => ({})) as { items?: ReceiveItemPayload[] }
    if (Array.isArray(body.items)) {
      itemUpdates = body.items.filter(
        (it) => it && typeof it.id === 'string' && typeof it.received_quantity === 'number'
      )
    }
  } catch { /* no body — that's fine */ }

  const now = new Date().toISOString()

  // Update order status
  const { error: updateErr } = await supabase
    .from('purchase_orders')
    .update({
      status:      'received',
      received_by: uid,
      received_at: now,
      updated_at:  now,
    })
    .eq('id', id)
    .eq('company_id', companyId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Update received_quantity on individual line items (non-fatal if any fail)
  if (itemUpdates.length > 0) {
    for (const item of itemUpdates) {
      await supabase
        .from('purchase_order_items')
        .update({ received_quantity: item.received_quantity })
        .eq('id', item.id)
        .eq('purchase_order_id', id)
    }
  }

  auditFinancialMutation('purchase', {
    userId:    uid,
    companyId,
    entityId:  id,
    action:    'update',
    newData:   { status: 'received', received_by: uid, received_at: now },
    source:    'api/purchase-orders/[id]/receive',
  })

  return NextResponse.json({ ok: true, received_at: now })
}
