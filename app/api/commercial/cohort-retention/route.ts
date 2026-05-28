// ── /api/commercial/cohort-retention ─────────────────────────────────────────
// GET — Returns CohortRetentionReport: customer cohort retention & churn.
// Query params:
//   months  number (defaults to 6) — lookback cohort window
// Access: manager+ only.

export const revalidate = 7200 // 2 hours — cohort data changes slowly

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CohortRetentionService } from '@/lib/services/commercial/cohort-retention.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const monthsParam = searchParams.get('months')
  const lookbackMonths = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6)) : 6

  try {
    const service = new CohortRetentionService(supabase)
    const report  = await service.getReport(companyId, lookbackMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[cohort-retention]', err)
    return apiError(ctx, 'Kohort tutma analizi hesaplanamadı', 500)
  }
}
