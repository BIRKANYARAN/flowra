export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/executive-summary
//
// Returns a unified ExecutiveSummary for the CEO Executive Cockpit.
// Auth: any authenticated user with a valid company.
// Response: { summary: ExecutiveSummary }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse }        from 'next/server'
import { resolveApiAuth }                   from '@/lib/api-auth'
import { reqCtx, apiError }                 from '@/lib/api-utils'
import { ExecutiveSummaryComputeService }   from '@/lib/services/intelligence/executive-summary.service'
import { REQUEST_ID_HEADER }               from '@/middleware'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response

    const { companyId, supabase } = auth

    const summary = await ExecutiveSummaryComputeService.compute(companyId, supabase)

    return NextResponse.json(
      { summary },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    console.error('[executive-summary]', err instanceof Error ? err.message : String(err))
    return apiError(ctx, 'Yönetici özeti hesaplanamadı', 500)
  }
}
