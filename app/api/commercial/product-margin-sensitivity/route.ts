// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/commercial/product-margin-sensitivity
//
// Returns a product margin sensitivity analysis report:
//   - Per-product base metrics (avg price, cost, monthly units, margin)
//   - Standard what-if scenarios for top product
//   - Risk ranking under 10% cost inflation
//   - Portfolio sensitivity at 10% and 20% cost increase
//   - Turkish narrative summary
//
// Auth: manager+ authenticated company member.
// Cache: revalidate every 3600 seconds.
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ProductMarginSensitivityService } from '@/lib/services/commercial/product-margin-sensitivity.service'
import { REQUEST_ID_HEADER } from '@/middleware'
import { toErrorResponse } from '@/types/errors'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new ProductMarginSensitivityService(supabase)
    const report  = await service.getReport(companyId)

    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
