// ── /api/commercial/cohort-revenue ────────────────────────────────────────────
// GET — Returns CohortRevenueReport: monthly customer cohort revenue analysis.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CohortRevenueService } from '@/lib/services/commercial/cohort-revenue.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CohortRevenueService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[cohort-revenue]', err)
    return apiError(ctx, 'Kohort gelir analizi hesaplanamadı', 500)
  }
}
