// ── /api/commercial/customer-ltv ──────────────────────────────────────────────
// GET — Returns CustomerLtvReport: RFM scores, LTV estimates, segments, churn risk.
// Access: any authenticated member.
// Cache: revalidate every 3600 seconds (1 hour — LTV is slow-changing).

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerLtvService } from '@/lib/services/commercial/customer-ltv.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const report = await CustomerLtvService.getReport(companyId, supabase)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-ltv]', err)
    return apiError(ctx, 'Müşteri LTV analizi hesaplanamadı', 500)
  }
}
