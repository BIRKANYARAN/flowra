import { NextRequest, NextResponse } from 'next/server'
import { PCLEEngine }        from '@/lib/services/pcle/pcle.engine'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/partners/pcle/distribute?net_income=X&board_retained=X&dividend_requested=X
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const params            = req.nextUrl.searchParams
    const net_income        = parseFloat(params.get('net_income')         ?? '0') || 0
    const board_retained    = parseFloat(params.get('board_retained')     ?? '0') || 0
    const dividend_requested= parseFloat(params.get('dividend_requested') ?? '0') || 0
    const available_cash    = parseFloat(params.get('available_cash')     ?? '0') || 0

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
