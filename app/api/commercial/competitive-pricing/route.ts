// ── /api/commercial/competitive-pricing ──────────────────────────────────────
// GET — Returns CompetitivePricingReport: internal pricing intelligence.
// Query params:
//   period_months  number (defaults to 12) — lookback window in months
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CompetitivePricingService } from '@/lib/services/commercial/competitive-pricing.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const { searchParams } = new URL(req.url)
  const periodParam = searchParams.get('period_months')
  const periodMonths = periodParam
    ? Math.max(1, Math.min(24, parseInt(periodParam, 10) || 12))
    : 12

  try {
    const service = new CompetitivePricingService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[competitive-pricing]', err)
    return apiError(ctx, 'Rekabetçi fiyatlandırma analizi hesaplanamadı', 500)
  }
}
