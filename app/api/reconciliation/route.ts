import { NextRequest, NextResponse } from 'next/server'
import { ReconciliationService } from '@/lib/services/ledger/reconciliation.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/reconciliation?period_id=&as_of=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

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
