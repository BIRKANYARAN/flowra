import { NextRequest, NextResponse } from 'next/server'
import { WaterfallService }  from '@/lib/services/waterfall.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/waterfall?available_cash=X
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const available_cash = parseFloat(req.nextUrl.searchParams.get('available_cash') ?? '0')

    const [waterfall, projections] = await Promise.all([
      WaterfallService.compute(uid, companyId, available_cash, supabase),
      WaterfallService.getCapitalReturnProjections(uid, companyId, supabase),
    ])

    return NextResponse.json({ waterfall, projections })
  } catch (e) {
    console.error('[partners/pcle/waterfall] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
