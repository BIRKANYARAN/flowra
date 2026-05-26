// app/api/governance/commitments/route.ts
//
// GET  — return the full CommitmentsLedger for the authenticated company (admin-only)
// POST — create a new declared forward commitment (admin-only)

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { reqCtx, apiError }             from '@/lib/api-utils'
import { CommitmentsService }           from '@/lib/services/governance/commitments.service'

export const dynamic = 'force-dynamic'

// ── GET /api/governance/commitments ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', uid)
      .eq('company_id', companyId)
      .maybeSingle()
    const role = (memberRow as { role?: string } | null)?.role ?? 'viewer'
    if (role !== 'admin') return apiError(ctx, 'Yetkisiz', 403, 'FORBIDDEN')

    const sp = req.nextUrl.searchParams
    const horizon = sp.get('horizon') ? Number(sp.get('horizon')) : 365

    const ledger = await CommitmentsService.getLedger(companyId, supabase, { horizon })
    return NextResponse.json(ledger)
  } catch (e) {
    console.error('[commitments GET]', e)
    return apiError(ctx, 'Taahhüt defteri alınamadı', 500, 'DB_READ_FAILED')
  }
}

// ── POST /api/governance/commitments ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Admin-only
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', uid)
      .eq('company_id', companyId)
      .maybeSingle()
    const role = (memberRow as { role?: string } | null)?.role ?? 'viewer'
    if (role !== 'admin') return apiError(ctx, 'Yetkisiz', 403, 'FORBIDDEN')

    const body = await req.json().catch(() => ({}))
    if (!body.title || !body.due_date || !body.commitment_type) {
      return apiError(ctx, 'title, due_date ve commitment_type gerekli', 400, 'VALIDATION_ERROR')
    }

    const commitment = await CommitmentsService.createCommitment(
      companyId,
      uid,
      supabase,
      {
        title:                body.title,
        commitment_type:      body.commitment_type,
        amount_try:           body.amount_try != null ? Number(body.amount_try) : null,
        currency:             body.currency ?? 'TRY',
        due_date:             body.due_date,
        recurrence:           body.recurrence ?? null,
        recurrence_end_date:  body.recurrence_end_date ?? null,
        counterparty:         body.counterparty ?? null,
        description:          body.description ?? null,
        linked_resource_type: body.linked_resource_type ?? null,
        linked_resource_id:   body.linked_resource_id ?? null,
      },
    )

    return NextResponse.json({ commitment }, { status: 201 })
  } catch (e) {
    console.error('[commitments POST]', e)
    return apiError(ctx, 'Taahhüt kaydedilemedi', 500, 'DB_WRITE_FAILED')
  }
}
