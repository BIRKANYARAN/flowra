// ── /api/commercial/recurring-revenue ────────────────────────────────────────
// GET — Returns RecurringRevenueReport: MRR/ARR, NRR, GRR, churn, expansion.
// Access: manager+ only.

export const dynamic   = 'force-dynamic'
export const revalidate = 1800 // 30 minutes

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { RecurringRevenueService } from '@/lib/services/commercial/recurring-revenue.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new RecurringRevenueService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[recurring-revenue]', err)
    return apiError(ctx, 'Tekrarlayan gelir analizi hesaplanamadı', 500)
  }
}
