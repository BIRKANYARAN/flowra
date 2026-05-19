import { NextRequest, NextResponse } from 'next/server'
import { CashFlowStatementService }   from '@/lib/services/cashflow-statement.service'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

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
    return apiError(ctx, 'Nakit akış tablosu hesaplanamadı', 500, 'DB_READ_FAILED')
  }
}
