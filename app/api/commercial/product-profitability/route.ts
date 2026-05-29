// ── /api/commercial/product-profitability ─────────────────────────────────────
// GET — Returns ProductProfitabilityReport: per-product P&L and profitability.
// Query params:
//   months  (optional, default 6) — analysis window in months
// Access: manager+ only.

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError } from '@/lib/api-utils'
import { ProductProfitabilityService } from '@/lib/services/commercial/product-profitability.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase, ctx } = auth

  const monthsParam = req.nextUrl.searchParams.get('months')
  const periodMonths = monthsParam
    ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6))
    : 6

  try {
    const service = new ProductProfitabilityService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    console.error('[product-profitability]', err)
    return apiError(ctx, 'Ürün karlılık raporu hesaplanamadı', 500)
  }
}
