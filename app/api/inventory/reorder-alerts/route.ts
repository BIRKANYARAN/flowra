// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/inventory/reorder-alerts
// POST /api/inventory/reorder-alerts   — upsert reorder threshold (admin/manager)
//
// GET: Returns { report } with full ReorderAlertReport. Any member role.
// POST: Set/update a product's reorder threshold. Admin or manager required.
//   Body: { product_id, reorder_point_qty, reorder_qty, lead_time_days, notes? }
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { ReorderAlertService }        from '@/lib/services/inventory/reorder-alert.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  try {
    const report = await ReorderAlertService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  // Admin or manager required
  const { data: member } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .is('deleted_at', null)
    .maybeSingle()

  if (member?.role !== 'admin' && member?.role !== 'manager') {
    return NextResponse.json(
      { error: 'Bu işlem için yönetici veya müdür yetkisi gereklidir.', code: 'FORBIDDEN' },
      { status: 403 },
    )
  }

  let body: {
    product_id: string
    reorder_point_qty: number
    reorder_qty: number
    lead_time_days?: number
    notes?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek gövdesi.' }, { status: 400 })
  }

  const { product_id, reorder_point_qty, reorder_qty, lead_time_days, notes } = body

  if (!product_id || reorder_point_qty == null || reorder_qty == null) {
    return NextResponse.json(
      { error: 'product_id, reorder_point_qty ve reorder_qty zorunludur.' },
      { status: 422 },
    )
  }

  const record = {
    company_id:       companyId,
    product_id,
    reorder_point_qty,
    reorder_qty,
    lead_time_days:   lead_time_days ?? 7,
    notes:            notes ?? null,
    updated_at:       new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('product_reorder_thresholds')
    .upsert(record, { onConflict: 'company_id,product_id' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ threshold: data }, { status: 200 })
}
