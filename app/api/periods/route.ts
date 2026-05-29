import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/periods — list accounting periods for this company
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, status, closed_at, locked_at, notes')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Return { periods: AccountingPeriod[] } — sorted newest first (done by query)
    return NextResponse.json({ periods: data ?? [] })
  } catch (e) {
    console.error('[periods] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
