// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cashflow-forecast
//
// 13-Week Cash Flow Forecast — deterministic rolling cash projection.
//
// Returns:
//   { report: CashFlowForecastReport }
//
// Auth: manager+ role required.
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CashFlowForecastService } from '@/lib/services/finance/cashflow-forecast.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new CashFlowForecastService(supabase)
    const report = await service.getForecast(companyId)
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
