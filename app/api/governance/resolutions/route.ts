import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { reqCtx, apiError }           from '@/lib/api-utils'
import { ResolutionsService }         from '@/lib/services/governance/resolutions.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth
    const sp = req.nextUrl.searchParams

    const resolutions = await ResolutionsService.list(companyId, supabase, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: sp.get('status') as any ?? undefined,
      limit:  sp.get('limit') ? Number(sp.get('limit')) : 100,
    })
    return NextResponse.json({ resolutions })
  } catch (e) {
    return apiError(ctx, 'Kararlar alınamadı', 500, 'DB_READ_FAILED')
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json().catch(() => ({}))
    if (!body.title || !body.resolution_type || !body.resolution_date || !body.description) {
      return apiError(ctx, 'Eksik alan: title, resolution_type, resolution_date, description gerekli', 400, 'VALIDATION_ERROR')
    }

    const resolution = await ResolutionsService.create({
      companyId,
      userId:          uid,
      title:           body.title,
      resolutionType:  body.resolution_type,
      resolutionDate:  body.resolution_date,
      description:     body.description,
      votingOutcome:   body.voting_outcome,
      linkedCorporateActionId: body.linked_corporate_action_id,
      metadata:        body.metadata ?? {},
    }, supabase)
    return NextResponse.json({ resolution }, { status: 201 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Karar kaydedilemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
