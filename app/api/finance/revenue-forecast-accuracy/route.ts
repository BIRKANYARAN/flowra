// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/revenue-forecast-accuracy
//
// Returns ForecastAccuracyReport — backtest of revenue forecast accuracy
// using SMA vs actuals over the last N months.
//
// Query params:
//   ?months=12  (default: 12, max: 24)
//
// Returns:
//   { report: ForecastAccuracyReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 3600 seconds (1 hour).
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { RevenueForecastAccuracyService } from '@/lib/services/finance/revenue-forecast-accuracy.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const url = new URL(req.url)
  const monthsParam = url.searchParams.get('months')
  const lookbackMonths = Math.min(
    24,
    Math.max(4, parseInt(monthsParam ?? '12', 10) || 12),
  )

  try {
    const service = new RevenueForecastAccuracyService(supabase)
    const report = await service.getReport(companyId, lookbackMonths)
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
