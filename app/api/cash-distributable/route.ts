// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cash-distributable
//
// Thin wrapper around lib/finance/financial-core.ts#getDistributableCash().
// Auth + company resolution here; all query logic is in the shared core.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }        from '@/lib/supabase-server'
import { resolveCompanyId }    from '@/lib/resolve-company'
import { getDistributableCash } from '@/lib/finance/financial-core'

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

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
    const url  = new URL(req.url)
    const now  = new Date()
    const year = now.getFullYear()
    const mon  = String(now.getMonth() + 1).padStart(2, '0')
    const from = parseDate(url.searchParams.get('from')) ?? `${year}-${mon}-01`
    const to   = parseDate(url.searchParams.get('to'))   ?? now.toISOString().slice(0, 10)

    const result = await getDistributableCash(companyId, { from, to })
    return NextResponse.json({ ...result, period: { from, to } })
  } catch (err) {
    console.error('[cash-distributable]', err instanceof Error ? err.message : String(err))
    return NextResponse.json(
      { error: 'Dağıtılabilir nakit hesaplanamadı', code: 'INTERNAL_ERROR' },
      { status: 500 },
    )
  }
}
