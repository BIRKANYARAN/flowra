// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/product-profitability?months=12
//
// Returns a per-product profitability waterfall:
//   Revenue → COGS → Gross Profit → Attributed OpEx → Contribution Margin
//
// Query params:
//   months  (optional, default 12) — analysis window in months
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds.
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ProductProfitabilityService } from '@/lib/services/commercial/product-profitability.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const monthsParam = req.nextUrl.searchParams.get('months')
  const months      = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 12)) : 12

  try {
    const report = await ProductProfitabilityService.getReport(companyId, supabase, { months })

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
