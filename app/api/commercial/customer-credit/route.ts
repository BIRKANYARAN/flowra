// ── /api/commercial/customer-credit ──────────────────────────────────────────
// GET — Returns CustomerCreditReport: per-customer credit scores and grades.
// Access: manager+ only.

export const revalidate = 3600 // 1 hour

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerCreditService } from '@/lib/services/commercial/customer-credit.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerCreditService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-credit]', err)
    return apiError(ctx, 'Kredi skoru raporu hesaplanamadı', 500)
  }
}
