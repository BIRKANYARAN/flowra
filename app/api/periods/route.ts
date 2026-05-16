import { NextResponse } from 'next/server'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'

export const dynamic = 'force-dynamic'

// GET /api/periods — list accounting periods for this company
export async function GET() {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const { data, error } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, status, closed_at, locked_at, notes')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[periods] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
