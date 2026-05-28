// ─────────────────────────────────────────────────────────────────────────────
// GET /api/commercial/vendor-concentration?months=6
//
// Vendor Spend Concentration Analysis — HHI-based supply-side risk report.
//
// Returns:
//   { report: VendorConcentrationReport }
//
// Auth: any authenticated company member (manager+).
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { VendorConcentrationService } from '@/lib/services/commercial/vendor-concentration.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const monthsParam = req.nextUrl.searchParams.get('months')
  const months = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10))) : 6

  try {
    const service = new VendorConcentrationService(supabase)
    const report = await service.getReport(companyId, months)
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
