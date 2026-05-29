// ── /api/commercial/rfm-segmentation ─────────────────────────────────────────
// GET — Returns RfmSegmentationReport: quintile-based RFM scores,
//       11-segment classification, and revenue-at-risk metrics.
// Access: manager+
// Cache: revalidate every 3600 seconds (1 hour — RFM is slow-changing).

export const dynamic = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RfmSegmentationService } from '@/lib/services/commercial/rfm-segmentation.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new RfmSegmentationService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[rfm-segmentation]', err)
    return apiError(ctx, 'RFM segmentasyon analizi hesaplanamadı', 500)
  }
}
