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

    // Validate that the resolution is in 'approved' state
    const existing = await ResolutionsService.getById(params.id, companyId, supabase)
    if (!existing) return apiError(ctx, 'Karar bulunamadı', 404, 'NOT_FOUND')
    if (!ResolutionsService.canImplement(existing)) {
      return apiError(ctx, 'Sadece onaylanmış kararlar uygulanabilir', 400, 'INVALID_STATE')
    }

    const body = await req.json().catch(() => ({}))
    const notes = typeof body.notes === 'string' ? body.notes : undefined

    const resolution = await ResolutionsService.implement(
      params.id,
      companyId,
      uid,
      body.linked_corporate_action_id,
      supabase,
      notes,
    )
    return NextResponse.json({ resolution })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Karar uygulanamadı'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
