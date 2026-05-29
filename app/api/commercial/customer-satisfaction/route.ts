// ── /api/commercial/customer-satisfaction ─────────────────────────────────────
// GET — Returns CustomerSatisfactionReport: relationship health scoring for B2B customers.
// Access: manager+ access.
// Cache: revalidate every 3600 seconds (1 hour).

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerSatisfactionService } from '@/lib/services/commercial/customer-satisfaction.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerSatisfactionService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-satisfaction]', err)
    return apiError(ctx, 'Müşteri ilişki sağlığı hesaplanamadı', 500)
  }
}
