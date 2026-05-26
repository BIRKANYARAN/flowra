// ══════════════════════════════════════════════════════════════════════════════
// GET /api/planning/variance
//
// Returns ScenarioVariance[] for all saved what-if scenarios, comparing
// stored forecasts against actual financial results.
//
// Query params:
//   ?scenario_id=<uuid>   — single scenario (returns single-item array)
//   ?today=YYYY-MM-DD     — override today for testing
//
// Auth: any authenticated company member
// ══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest }             from 'next/server'
import { resolveApiAuth }          from '@/lib/api-auth'
import { apiError, reqCtx }        from '@/lib/api-utils'
import { ScenarioVarianceService } from '@/lib/services/planning/scenario-variance.service'
import { NextResponse }            from 'next/server'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  try {
    const { searchParams } = req.nextUrl
    const scenarioId = searchParams.get('scenario_id') ?? undefined
    const today      = searchParams.get('today') ?? undefined

    let variances

    if (scenarioId) {
      const single = await ScenarioVarianceService.compareScenario(
        companyId, scenarioId, uid, supabase, { today }
      )
      variances = single ? [single] : []
    } else {
      variances = await ScenarioVarianceService.compareAll(
        companyId, uid, supabase, { today }
      )
    }

    return NextResponse.json(
      { variances, total: variances.length },
      { headers: { 'X-Request-ID': ctx.requestId } }
    )
  } catch (err) {
    console.error('[planning/variance] error:', err)
    return apiError(ctx, 'Senaryo karşılaştırması hesaplanamadı', 500)
  }
}
