// app/api/decisions/[id]/annotate/route.ts
//
// POST { annotation } — add or update annotation on a decision snapshot (admin only)

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { DecisionContextService }    from '@/lib/services/decision-context/decision-context.service'

export async function POST(
  req:     NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { uid, companyId, supabase } = auth
    const { id } = await context.params

    // Admin-only
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', uid)
      .maybeSingle()

    if (!member || member.role !== 'admin') {
      return apiError(ctx, 'Bu işlem için yönetici yetkisi gereklidir', 403, 'FORBIDDEN')
    }

    const body = await req.json()
    const { annotation } = body

    if (typeof annotation !== 'string' || !annotation.trim()) {
      return apiError(ctx, 'annotation zorunludur', 400, 'VALIDATION_ERROR', 'BUSINESS')
    }

    await DecisionContextService.annotate(id, companyId, uid, annotation.trim(), supabase)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/decisions annotate POST]', e)
    return apiError(ctx, 'Açıklama kaydedilemedi', 500)
  }
}
