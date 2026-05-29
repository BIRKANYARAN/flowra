import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { ResolutionsService }        from '@/lib/services/governance/resolutions.service'
import type { VotingOutcome }        from '@/lib/services/governance/resolutions.service'

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

    const body   = await req.json().catch(() => ({}))
    const action = body.action as 'approve' | 'reject' | undefined

    if (!action || !['approve', 'reject'].includes(action)) {
      return apiError(ctx, 'action: approve veya reject gerekli', 400, 'VALIDATION_ERROR')
    }

    if (action === 'approve') {
      // Validate voting_outcome when provided
      const vo = body.voting_outcome as VotingOutcome | undefined
      if (vo !== undefined) {
        if (typeof vo.total !== 'number' || vo.total <= 0) {
          return apiError(ctx, 'voting_outcome.total sıfırdan büyük olmalı', 400, 'VALIDATION_ERROR')
        }
        const sumVotes = (vo.in_favor ?? 0) + (vo.against ?? 0) + (vo.abstained ?? 0)
        if (sumVotes > vo.total) {
          return apiError(ctx, 'Oy toplamı total değerini aşamaz', 400, 'VALIDATION_ERROR')
        }
      }

      const resolution = await ResolutionsService.approve(params.id, companyId, uid, vo, supabase)
      return NextResponse.json({ resolution })
    }

    // action === 'reject'
    const resolution = await ResolutionsService.reject(
      params.id,
      companyId,
      uid,
      supabase,
      typeof body.reason === 'string' ? body.reason : undefined,
    )
    return NextResponse.json({ resolution })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Karar durumu güncellenemedi'
    return apiError(ctx, msg, 500, 'DB_WRITE_FAILED')
  }
}
