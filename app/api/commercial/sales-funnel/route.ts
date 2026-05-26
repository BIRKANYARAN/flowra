// ── /api/commercial/sales-funnel ─────────────────────────────────────────────
// GET — Returns SalesFunnelReport: stage-by-stage conversion, velocity, metrics.
// Access: any authenticated member.

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { SalesFunnelService } from '@/lib/services/commercial/sales-funnel.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await SalesFunnelService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[sales-funnel]', err)
    return apiError(ctx, 'Satış hunisi analizi hesaplanamadı', 500)
  }
}
