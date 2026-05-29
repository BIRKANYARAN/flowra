import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { GovernanceClockService }    from '@/lib/services/governance/clock.service'

export const dynamic = 'force-dynamic'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
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

    const { id } = params
    if (!id) return apiError(ctx, 'id gerekli', 400, 'VALIDATION_ERROR')

    await GovernanceClockService.deleteObligation(id, companyId, uid, supabase)

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Yükümlülük silinemedi'
    // If it's a "not user-declared" or "not found" error, return 400/404
    if (msg.includes('bulunamadı')) return apiError(ctx, msg, 404, 'NOT_FOUND')
    if (msg.includes('Yalnızca')) return apiError(ctx, msg, 400, 'FORBIDDEN_SOURCE')
    return apiError(ctx, msg, 500, 'DB_DELETE_FAILED')
  }
}
