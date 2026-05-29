// ── /api/commercial/customer-ltv-enhanced ─────────────────────────────────────
// GET — Returns CustomerLtvEnhancedReport: multi-method LTV, segment analysis,
//       CLV tier classification, portfolio stats.
// Access: manager+ only.
// Cache: revalidate every 3600 seconds (1 hour).

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { CustomerLtvEnhancedService } from '@/lib/services/commercial/customer-ltv-enhanced.service'

export async function GET(req: NextRequest) {
  const ctx  = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth

  try {
    const service = new CustomerLtvEnhancedService(supabase)
    const report  = await service.getReport(companyId)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-ltv-enhanced]', err)
    return apiError(ctx, 'Gelişmiş müşteri LTV analizi hesaplanamadı', 500)
  }
}
