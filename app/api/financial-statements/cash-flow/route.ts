import { NextRequest, NextResponse } from 'next/server'
import { CashFlowStatementService }   from '@/lib/services/cashflow-statement.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params = req.nextUrl.searchParams
    const now    = new Date()
    const from   = params.get('from') ?? `${now.getFullYear()}-01-01`
    const to     = params.get('to')   ?? now.toISOString().slice(0, 10)

    const statement = await CashFlowStatementService.compute(
      uid, companyId, { from, to }, supabase
    )

    return NextResponse.json(statement)
  } catch (e) {
    console.error('[cash-flow-statement] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
