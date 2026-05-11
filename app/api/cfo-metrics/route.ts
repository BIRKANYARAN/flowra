// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/cfo-metrics
//
// Thin wrapper around lib/finance/financial-core.ts#getCfoMetrics().
// Auth + company resolution here; all query logic is in the shared core.
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient }    from '@/lib/supabase-server'
import { resolveCompanyId } from '@/lib/resolve-company'
import { getCfoMetrics }   from '@/lib/finance/financial-core'

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
    const url   = new URL(req.url)
    const now   = new Date()
    const today = now.toISOString().slice(0, 10)
    const year  = now.getFullYear()
    const mon   = String(now.getMonth() + 1).padStart(2, '0')
    const from  = url.searchParams.get('from') ?? `${year}-${mon}-01`
    const to    = url.searchParams.get('to')   ?? today

    const metrics = await getCfoMetrics(companyId, { from, to })
    return NextResponse.json({ ...metrics, period: { from, to } })
  } catch (err) {
    console.error('[cfo-metrics] error:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'CFO metrikleri alınamadı', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
