// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cashflow
//
// Thin wrapper around lib/finance/financial-core.ts#getCashflowTimeline().
// Auth + company resolution here; all query logic is in the shared core.
//
// Returns CashflowMonth[] for backward compat with CashflowChart component.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }       from '@/lib/supabase-server'
import { resolveCompanyId }   from '@/lib/resolve-company'
import { getCashflowTimeline } from '@/lib/finance/financial-core'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch {
    return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED' }, { status: 409 })
  }

  try {
    const url          = new URL(req.url)
    const pastMonths   = Math.min(Math.max(Number(url.searchParams.get('past_months')   ?? 6), 1), 12)
    const futureMonths = Math.min(Math.max(Number(url.searchParams.get('future_months') ?? 6), 1), 12)

    const result = await getCashflowTimeline(companyId, { pastMonths, futureMonths })
    // Return months array for backward compat with CashflowChart
    return NextResponse.json(result.months)
  } catch (err) {
    console.error('[cashflow GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Nakit akışı hesaplanamadı', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
