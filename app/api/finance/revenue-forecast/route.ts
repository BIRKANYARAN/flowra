// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/revenue-forecast
//
// 3-month forward revenue forecast — blended trend + seasonal + pipeline.
//
// Returns:
//   { report: RevenueForecastReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds (1 hour).
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { RevenueForecastService }       from '@/lib/services/finance/revenue-forecast.service'
import { REQUEST_ID_HEADER }            from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await RevenueForecastService.getReport(companyId, supabase)
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
