// ── /api/commercial/sales-funnel ─────────────────────────────────────────────
// GET — Returns SalesFunnelReport: proforma → sale → payment funnel analytics.
// Access: manager+ only.

export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SalesFunnelService } from '@/lib/services/commercial/sales-funnel.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  const periodMonths = Number(req.nextUrl.searchParams.get('period_months') ?? '3') || 3

  try {
    const service = new SalesFunnelService(supabase)
    const report  = await service.getReportV2(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[sales-funnel]', err)
    return apiError(ctx, 'Satış hunisi analizi hesaplanamadı', 500)
  }
}
