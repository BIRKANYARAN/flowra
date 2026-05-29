// ── /api/commercial/customer-credit-scoring ───────────────────────────────────
// GET — Returns CustomerCreditScoringReport: behavioral credit scores for B2B customers.
// Access: manager+ access.
// Cache: revalidate every 3600 seconds (1 hour).

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerCreditScoringService } from '@/lib/services/commercial/customer-credit-scoring.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerCreditScoringService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-credit-scoring]', err)
    return apiError(ctx, 'Müşteri kredi skoru hesaplanamadı', 500)
  }
}
