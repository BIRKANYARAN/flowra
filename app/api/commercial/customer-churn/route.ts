// ── /api/commercial/customer-churn ────────────────────────────────────────────
// GET — Returns CustomerChurnReport: rule-based churn risk scoring for B2B customers.
// Access: manager+ access.
// Cache: revalidate every 3600 seconds (1 hour).

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerChurnService } from '@/lib/services/commercial/customer-churn.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerChurnService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-churn]', err)
    return apiError(ctx, 'Müşteri churn riski hesaplanamadı', 500)
  }
}
