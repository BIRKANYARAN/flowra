// ── /api/commercial/cohort-analysis ───────────────────────────────────────────
// GET — customer revenue cohort analysis for the authenticated company.
//
// Returns:
//   { report: CohortAnalysisReport }
//
// Access: any authenticated user (admin, manager, viewer)

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CohortAnalysisService } from '@/lib/services/commercial/cohort-analysis.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await CohortAnalysisService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[cohort-analysis]', err)
    return apiError(ctx, 'Kohort analizi hesaplanamadı', 500)
  }
}
