// ── /api/commercial/discount-analysis ────────────────────────────────────────
// GET — Returns DiscountAnalysisReport: price elasticity & discount patterns.
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { DiscountAnalysisService } from '@/lib/services/commercial/discount-analysis.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new DiscountAnalysisService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[discount-analysis]', err)
    return apiError(ctx, 'İskonto analizi hesaplanamadı', 500)
  }
}
