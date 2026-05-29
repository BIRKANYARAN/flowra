// ── /api/commercial/customer-segment-profitability ───────────────────────────
// GET — Returns CustomerSegmentReport: revenue, COGS, gross margin, and
//       profit contribution broken down by customer type/segment.
// Access: manager+ only.
// Cache: revalidate every 3600 seconds (1 hour).

export const dynamic = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerSegmentProfitabilityService } from '@/lib/services/commercial/customer-segment-profitability.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerSegmentProfitabilityService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-segment-profitability]', err)
    return apiError(ctx, 'Müşteri segment kârlılık analizi hesaplanamadı', 500)
  }
}
