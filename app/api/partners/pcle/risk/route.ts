import { NextRequest, NextResponse } from 'next/server'
import { PCLEEngine }        from '@/lib/services/pcle/pcle.engine'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/risk?available_cash=X&net_income=X
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params        = req.nextUrl.searchParams
    const available_cash = parseFloat(params.get('available_cash') ?? '0') || 0
    const net_income     = parseFloat(params.get('net_income')     ?? '0') || 0

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
