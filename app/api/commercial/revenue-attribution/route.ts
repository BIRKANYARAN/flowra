// ── /api/commercial/revenue-attribution ───────────────────────────────────────
// GET — Returns RevenueAttributionReport: top customers, top products,
// expense breakdown, concentration metrics, new vs returning.
// Access: any authenticated member.

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RevenueAttributionService } from '@/lib/services/commercial/revenue-attribution.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await RevenueAttributionService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[revenue-attribution]', err)
    return apiError(ctx, 'Gelir kaynağı analizi hesaplanamadı', 500)
  }
}
