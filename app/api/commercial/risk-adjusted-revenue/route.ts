// ── /api/commercial/risk-adjusted-revenue ────────────────────────────────────
// GET — Returns RiskAdjustedRevenueReport: expected collections view.
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RiskAdjustedRevenueService } from '@/lib/services/commercial/risk-adjusted-revenue.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new RiskAdjustedRevenueService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[risk-adjusted-revenue]', err)
    return apiError(ctx, 'Risk düzeltmeli gelir raporu hesaplanamadı', 500)
  }
}
