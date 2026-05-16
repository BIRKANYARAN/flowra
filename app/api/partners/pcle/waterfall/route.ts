import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { WaterfallService }  from '@/lib/services/waterfall.service'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/waterfall?available_cash=X
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const available_cash = parseFloat(req.nextUrl.searchParams.get('available_cash') ?? '0')

    const [waterfall, projections] = await Promise.all([
      WaterfallService.compute(authData.user.id, companyId, available_cash, supabase),
      WaterfallService.getCapitalReturnProjections(authData.user.id, companyId, supabase),
    ])

    return NextResponse.json({ waterfall, projections })
  } catch (e) {
    console.error('[partners/pcle/waterfall] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
