// ── /api/commercial/sales-velocity ───────────────────────────────────────────
// GET — Returns multi-timeframe sales velocity report for the company.
// Access: manager+ only.

export const dynamic   = 'force-dynamic'
export const revalidate = 300  // 5-min cache

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SalesVelocityTrendsService } from '@/lib/services/commercial/sales-velocity-trends.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new SalesVelocityTrendsService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[sales-velocity]', err)
    return apiError(ctx, 'Satış hız analizi hesaplanamadı', 500)
  }
}
