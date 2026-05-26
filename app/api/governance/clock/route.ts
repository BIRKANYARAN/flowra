import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { GovernanceClockService }    from '@/lib/services/governance/clock.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth
    const sp = req.nextUrl.searchParams

    const obligations = await GovernanceClockService.getObligations(companyId, supabase, {
      today:   sp.get('today')   ?? undefined,
      horizon: sp.get('horizon') ? Number(sp.get('horizon')) : 90,
    })
    return NextResponse.json({ obligations })
  } catch (e) {
    return apiError(ctx, 'Takvim yüklenemedi', 500, 'DB_READ_FAILED')
  }
}
