// ── /api/commercial/customer-ltv-enhanced ─────────────────────────────────────
// GET — Returns CustomerLtvReport: LTV:CAC analysis, revenue concentration HHI,
//       customer tier classification, payback period, NRR.
// Query params:
//   period_months  number (defaults to 12) — lookback window
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

  const { searchParams } = new URL(req.url)
  const periodParam = searchParams.get('period_months')
  const periodMonths = periodParam ? Math.max(1, Math.min(60, parseInt(periodParam, 10) || 12)) : 12

  try {
    const service = new CustomerLtvEnhancedService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[customer-ltv-enhanced]', err)
    return apiError(ctx, 'Gelişmiş müşteri LTV analizi hesaplanamadı', 500)
  }
}
