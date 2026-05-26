// app/api/governance/commitments/[id]/route.ts
//
// PATCH — update status of a declared forward commitment (admin-only)
//         body: { status: 'fulfilled' | 'cancelled' }

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { CommitmentsService }        from '@/lib/services/governance/commitments.service'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req:     NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

    const { id } = await context.params
    if (!id) return apiError(ctx, 'Geçersiz ID', 400, 'VALIDATION_ERROR')

    const body   = await req.json().catch(() => ({}))
    const status = body.status as string | undefined

    if (status === 'fulfilled') {
      await CommitmentsService.fulfillCommitment(id, companyId, supabase)
    } else if (status === 'cancelled') {
      await CommitmentsService.cancelCommitment(id, companyId, supabase)
    } else {
      return apiError(ctx, "status 'fulfilled' veya 'cancelled' olmalı", 400, 'VALIDATION_ERROR')
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[commitments PATCH]', e)
    return apiError(ctx, 'Taahhüt güncellenemedi', 500, 'DB_WRITE_FAILED')
  }
}
