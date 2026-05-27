// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commercial/price-optimization
//
// Price Optimization Engine — data-driven pricing analysis per product.
//
// Returns:
//   { report: PriceOptimizationReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { PriceOptimizationService } from '@/lib/services/commercial/price-optimization.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await PriceOptimizationService.getReport(companyId, supabase)
    return NextResponse.json(
      { report },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
