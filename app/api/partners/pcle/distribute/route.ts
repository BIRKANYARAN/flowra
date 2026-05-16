import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase-server'
import { resolveCompanyId }  from '@/lib/resolve-company'
import { PCLEEngine }        from '@/lib/services/pcle/pcle.engine'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/distribute?net_income=X&board_retained=X&dividend_requested=X
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const params            = req.nextUrl.searchParams
    const net_income        = parseFloat(params.get('net_income')         ?? '0')
    const board_retained    = parseFloat(params.get('board_retained')     ?? '0')
    const dividend_requested= parseFloat(params.get('dividend_requested') ?? '0')
    const available_cash    = parseFloat(params.get('available_cash')     ?? '0')

    const state = await PCLEEngine.compute(companyId, supabase, {
      available_cash_try:     available_cash,
      net_income_try:         net_income,
      board_retained_try:     board_retained,
      dividend_requested_try: dividend_requested,
    })

    return NextResponse.json({
      distribution_layers:     state.distribution_layers,
      per_partner_distribution:state.per_partner_distribution,
      compliance_warnings:     state.compliance_warnings,
    })
  } catch (e) {
    console.error('[partners/pcle/distribute] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
