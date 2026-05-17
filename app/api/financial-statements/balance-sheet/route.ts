import { NextRequest, NextResponse } from 'next/server'
import { BalanceSheetService }       from '@/lib/services/balance-sheet.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
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
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
