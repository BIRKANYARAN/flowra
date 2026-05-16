import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@/lib/supabase-server'
import { resolveCompanyId }          from '@/lib/resolve-company'
import { BalanceSheetService }       from '@/lib/services/balance-sheet.service'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase  = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await resolveCompanyId(authData.user.id, supabase)
    if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })

    const asOfDate = req.nextUrl.searchParams.get('as_of')
      ?? new Date().toISOString().slice(0, 10)

    const balanceSheet = await BalanceSheetService.compute(
      authData.user.id, companyId, asOfDate, supabase
    )

    return NextResponse.json(balanceSheet)
  } catch (e) {
    console.error('[balance-sheet] error:', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
