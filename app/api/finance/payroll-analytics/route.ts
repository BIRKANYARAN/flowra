// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/payroll-analytics
//
// Returns payroll analytics: salary trends, payroll-to-revenue ratio,
// SGK compliance timeline, and headcount cost efficiency.
//
// Query params:
//   ?months=12   (default: 12, max: 24)
//
// Auth: manager+ (resolveApiAuth)
// Cache: revalidate every 3600 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { PayrollAnalyticsService } from '@/lib/services/finance/payroll-analytics.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const monthsRaw = parseInt(req.nextUrl.searchParams.get('months') ?? '12', 10)
  const months    = isNaN(monthsRaw) || monthsRaw < 1 ? 12 : Math.min(monthsRaw, 24)

  try {
    const service = new PayrollAnalyticsService(supabase)
    const report  = await service.getReport(companyId, months)

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
