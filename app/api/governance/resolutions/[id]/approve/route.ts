import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { ResolutionsService }        from '@/lib/services/governance/resolutions.service'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // Fetch role from company_members
    const { data: memberRow } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', uid)
      .eq('company_id', companyId)
      .maybeSingle()
    const role = (memberRow as { role?: string } | null)?.role ?? 'viewer'
    if (role !== 'admin') return apiError(ctx, 'Yetkisiz', 403, 'FORBIDDEN')

    const body     = await req.json().catch(() => ({}))
    const action   = body.action as 'approve' | 'reject' | undefined
    if (!action || !['approve','reject'].includes(action)) {
      return apiError(ctx, 'action: approve veya reject gerekli', 400, 'VALIDATION_ERROR')
    }

    const resolution = action === 'approve'
      ? await ResolutionsService.approve(params.id, companyId, uid, body.voting_outcome, supabase)
      : await ResolutionsService.reject(params.id, companyId, uid, supabase)

    return NextResponse.json({ resolution })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Karar durumu güncellenemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
