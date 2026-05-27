// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/kpi-scorecard?period=2025-01
//
// KPI Scorecard — Target vs Actual comparison.
// Auth: resolveApiAuth, manager+
// Cache: revalidate: 300
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { reqCtx, apiError }            from '@/lib/api-utils'
import { KpiScorecardService }         from '@/lib/services/intelligence/kpi-scorecard.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    // Optional ?period=YYYY-MM
    const period = req.nextUrl.searchParams.get('period') ?? undefined

    const service  = new KpiScorecardService(supabase)
    const scorecard = await service.getScorecard(companyId, period)

    return NextResponse.json(scorecard)
  } catch (e) {
    console.error('[kpi-scorecard]', e)
    return apiError(ctx, 'KPI skorkartı alınamadı', 500, 'DB_READ_FAILED')
  }
}
