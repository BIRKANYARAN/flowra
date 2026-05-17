import { NextRequest, NextResponse } from 'next/server'
import { GeneralLedgerService } from '@/lib/services/ledger/general-ledger.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/ledger/general-ledger?period_id=&as_of=YYYY-MM-DD&from_date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params    = req.nextUrl.searchParams
    const periodId  = params.get('period_id')  ?? undefined
    const asOf      = params.get('as_of')      ?? undefined
    const fromDate  = params.get('from_date')  ?? undefined

    const gl = await GeneralLedgerService.compute(companyId, supabase, { periodId, asOf, fromDate })
    return NextResponse.json(gl)
  } catch (e) {
    console.error('[ledger/general-ledger] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
