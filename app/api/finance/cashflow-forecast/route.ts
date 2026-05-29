// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cashflow-forecast
//
// Monthly multi-scenario cash flow forecast with exponential smoothing,
// debt service schedules, runway analysis, and Turkish narrative.
//
// Query params:
//   months (optional): forecast horizon in months, 1-24, default 12
//
// Returns:
//   { report: CashFlowForecastReport }
//
// Auth: manager+ role required (manager, admin, owner).
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CashFlowForecastService } from '@/lib/services/finance/cashflow-forecast.service'
import { REQUEST_ID_HEADER } from '@/middleware'

const ALLOWED_ROLES = ['manager', 'admin', 'owner'] as const

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  // Role check — manager+ only
  const userRole = (auth as { role?: string }).role
  if (userRole !== undefined && !(ALLOWED_ROLES as readonly string[]).includes(userRole)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'FORBIDDEN', type: 'SECURITY' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  // Parse optional months param (1-24)
  const monthsParam = req.nextUrl.searchParams.get('months')
  let forecastMonths = 12
  if (monthsParam !== null) {
    const parsed = parseInt(monthsParam, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
      forecastMonths = parsed
    }
  }

  try {
    const service = new CashFlowForecastService(supabase)
    const report = await service.getReport(companyId, forecastMonths)

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
