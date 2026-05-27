// ── /api/commercial/segment-profitability ─────────────────────────────────────
// GET — Returns SegmentProfitabilityReport: revenue + margin by product category.
// Query params:
//   period       YYYY-MM (defaults to current month)
//   includePrior true | false (defaults to false)
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SegmentProfitabilityService } from '@/lib/services/commercial/segment-profitability.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const period       = searchParams.get('period')       ?? undefined
  const includePrior = searchParams.get('includePrior') === 'true'

  try {
    const service = new SegmentProfitabilityService(supabase)
    const report  = await service.getReport(companyId, period, includePrior)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[segment-profitability]', err)
    return apiError(ctx, 'Segment kârlılık analizi hesaplanamadı', 500)
  }
}
