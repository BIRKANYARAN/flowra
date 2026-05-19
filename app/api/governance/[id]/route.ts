import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }   from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// ── GET /api/governance/[id] — single report with all signoffs ────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('governance_reports')
      .select(`
        *,
        governance_signoffs ( id, partner_id, partner_name, signed_by, signed_at, notes )
      `)
      .eq('id', params.id)
      .eq('company_id', companyId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Rapor bulunamadı' }, { status: 404 })
    }

    return NextResponse.json({ report: data })
  } catch (e) {
    console.error('[governance/[id] GET]', e)
    return apiError(ctx, 'Rapor alınamadı', 500, 'DB_READ_FAILED')
  }
}

// ── PATCH /api/governance/[id] — finalize report or add notes ────────────────
// Body: { action: 'finalize' | 'note', notes?: string }
//
// finalize: immutably locks the report (is_finalized = true + timestamp).
//           Once finalized, signoffs cannot be added or removed.
//           CAS guard: rejects if already finalized (409).

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body   = await req.json().catch(() => ({}))
    const action = body.action as string

    if (action === 'finalize') {
      // CAS: check current state before update
      const { data: existing } = await supabase
        .from('governance_reports')
        .select('id, is_finalized')
        .eq('id', params.id)
        .eq('company_id', companyId)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Rapor bulunamadı' }, { status: 404 })
      }
      if (existing.is_finalized) {
        return NextResponse.json({ error: 'Rapor zaten sonuçlandırıldı' }, { status: 409 })
      }

      const { data, error } = await supabase
        .from('governance_reports')
        .update({
          is_finalized: true,
          finalized_at: new Date().toISOString(),
          finalized_by: uid,
        })
        .eq('id', params.id)
        .eq('company_id', companyId)
        .eq('is_finalized', false)  // CAS — prevents race condition
        .select()
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Sonuçlandırma başarısız — eş zamanlı değişiklik algılandı' }, { status: 409 })
      }
      return NextResponse.json({ report: data })
    }

    if (action === 'note') {
      const { data, error } = await supabase
        .from('governance_reports')
        .update({ notes: body.notes ?? null })
        .eq('id', params.id)
        .eq('company_id', companyId)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ report: data })
    }

    return NextResponse.json({ error: 'Geçersiz aksiyon. finalize veya note olmalı.' }, { status: 400 })
  } catch (e) {
    console.error('[governance/[id] PATCH]', e)
    return apiError(ctx, 'Rapor güncellenemedi', 500, 'DB_WRITE_FAILED')
  }
}

// ── POST /api/governance/[id] — record partner signoff ───────────────────────
// Body: { partner_id: string, partner_name: string, notes?: string }
//
// Idempotent via upsert on (report_id, partner_id).
// Blocked if report is already finalized.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body = await req.json().catch(() => ({}))
    const { partner_id, partner_name, notes } = body

    if (!partner_id || !partner_name) {
      return NextResponse.json({ error: 'partner_id ve partner_name zorunludur' }, { status: 400 })
    }

    // Guard: report must exist, belong to this company, and not be finalized
    const { data: report } = await supabase
      .from('governance_reports')
      .select('id, is_finalized')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .single()

    if (!report) {
      return NextResponse.json({ error: 'Rapor bulunamadı' }, { status: 404 })
    }
    if (report.is_finalized) {
      return NextResponse.json({ error: 'Sonuçlandırılmış rapor imzalanamaz' }, { status: 409 })
    }

    const { data, error } = await supabase
      .from('governance_signoffs')
      .upsert({
        report_id:    params.id,
        company_id:   companyId,
        partner_id,
        partner_name,
        signed_by:    uid,
        signed_at:    new Date().toISOString(),
        notes:        notes ?? null,
      }, { onConflict: 'report_id,partner_id' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ signoff: data })
  } catch (e) {
    console.error('[governance/[id] POST]', e)
    return apiError(ctx, 'İmza kaydedilemedi', 500, 'DB_WRITE_FAILED')
  }
}
