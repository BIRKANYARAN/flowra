import { NextRequest, NextResponse } from 'next/server'
import { BalanceSheetService }       from '@/lib/services/balance-sheet.service'
import { resolveApiAuth } from '@/lib/api-auth'
import { reqCtx, apiError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Resolve request context before auth so catch block always has a traceable ID
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const asOfDate = req.nextUrl.searchParams.get('as_of')
      ?? new Date().toISOString().slice(0, 10)

    const balanceSheet = await BalanceSheetService.compute(
      uid, companyId, asOfDate, supabase
    )

    return NextResponse.json(balanceSheet)
  } catch (e) {
    console.error('[balance-sheet] error:', e)
    return apiError(ctx, 'Bilanço hesaplanamadı', 500, 'DB_READ_FAILED')
  }
}
