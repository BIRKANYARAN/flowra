// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/financial-health
//
// Financial Health Scorecard — 6-dimension composite health score.
// Aggregates liquidity, profitability, receivables, efficiency, debt burden,
// and growth into a single 0-100 score for the CEO cockpit.
//
// Auth:  resolveApiAuth, manager+
// Cache: revalidate: 300
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }                    from 'next/server'
import { resolveApiAuth }                               from '@/lib/api-auth'
import { reqCtx, apiError }                             from '@/lib/api-utils'
import { FinancialHealthScorecardService }              from '@/lib/services/intelligence/financial-health-scorecard.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const service   = new FinancialHealthScorecardService(supabase)
    const scorecard = await service.getScorecard(companyId)

    return NextResponse.json({ scorecard })
  } catch (e) {
    console.error('[intelligence/financial-health]', e)
    return apiError(ctx, 'Finansal sağlık skorkartı alınamadı', 500, 'DB_READ_FAILED')
  }
}
