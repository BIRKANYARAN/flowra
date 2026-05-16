import { NextRequest, NextResponse } from 'next/server'
import { createClient }     from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { ReconciliationService } from '@/lib/services/ledger/reconciliation.service'

export const dynamic = 'force-dynamic'

// GET /api/reconciliation?period_id=&as_of=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const params   = req.nextUrl.searchParams
    const periodId = params.get('period_id') ?? undefined
    const asOf     = params.get('as_of')     ?? undefined

    const report = await ReconciliationService.check(companyId, supabase, { periodId, asOf })
    return NextResponse.json(report)
  } catch (e) {
    console.error('[reconciliation] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
