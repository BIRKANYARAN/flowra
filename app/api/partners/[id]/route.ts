// ── /api/partners/[id] ────────────────────────────────────────────────────────
// PATCH  — update name / share_ratio / is_active
// DELETE — soft delete (sets deleted_at)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'
import { resolveCompanyId } from '@/lib/resolve-company'

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user)
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })

  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 422 }) }

    // Build partial patch — only update fields that were provided
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'İsim boş olamaz' }, { status: 422 })
      patch.name = name
    }

    if (body.share_ratio !== undefined) {
      const sr = Number(body.share_ratio)
      if (!Number.isFinite(sr) || sr <= 0 || sr > 1)
        return NextResponse.json({ error: 'share_ratio 0 ile 1 arasında olmalı' }, { status: 422 })
      patch.share_ratio = sr
    }

    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active)
    if (typeof body.notes === 'string') patch.notes = body.notes

    const { data, error } = await supabase
      .from('partners')
      .update(patch)
      .eq('id', params.id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data)  return NextResponse.json({ error: 'Ortak bulunamadı' }, { status: 404 })

    return NextResponse.json(data, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user)
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' }, { status: 401 })

  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const { error } = await supabase
      .from('partners')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ deleted: true }, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status })
  }
}
