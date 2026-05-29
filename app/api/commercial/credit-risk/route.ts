// ── /api/commercial/credit-risk ────────────────────────────────────────────────
// GET — Returns CustomerCreditRiskReport: B2B credit risk scores and portfolio.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerCreditRiskService } from '@/lib/services/commercial/customer-credit-risk.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerCreditRiskService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[credit-risk]', err)
    return apiError(ctx, 'Kredi risk skoru hesaplanamadı', 500)
  }
}
