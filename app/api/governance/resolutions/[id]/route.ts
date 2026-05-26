import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { ResolutionsService }        from '@/lib/services/governance/resolutions.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth
    const resolution = await ResolutionsService.getById(params.id, companyId, supabase)
    if (!resolution) return apiError(ctx, 'Bulunamadı', 404, 'NOT_FOUND')
    return NextResponse.json({ resolution })
  } catch (e) {
    return apiError(ctx, 'Karar alınamadı', 500, 'DB_READ_FAILED')
  }
}
