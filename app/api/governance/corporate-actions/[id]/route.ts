import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { CorporateActionsService }     from '@/lib/services/governance/corporate-actions.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth
    const action = await CorporateActionsService.getById(params.id, companyId, supabase)
    if (!action) return apiError(ctx, 'Bulunamadı', 404, 'NOT_FOUND')
    return NextResponse.json({ action })
  } catch (e) {
    return apiError(ctx, 'Kurumsal aksiyon alınamadı', 500, 'DB_READ_FAILED')
  }
}
