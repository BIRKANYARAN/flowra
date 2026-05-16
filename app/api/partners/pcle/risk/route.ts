import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { PCLEEngine }        from '@/lib/services/pcle/pcle.engine'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/risk?available_cash=X&net_income=X
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const params        = req.nextUrl.searchParams
    const available_cash = parseFloat(params.get('available_cash') ?? '0')
    const net_income     = parseFloat(params.get('net_income')     ?? '0')

    const state = await PCLEEngine.compute(companyId, supabase, {
      available_cash_try: available_cash,
      net_income_try:     net_income,
    })

    return NextResponse.json({
      risk_summary:         state.risk_summary,
      compliance_warnings:  state.compliance_warnings,
    })
  } catch (e) {
    console.error('[partners/pcle/risk] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
