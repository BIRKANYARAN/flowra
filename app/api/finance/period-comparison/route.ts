// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/period-comparison
//
// Returns PeriodComparisonReport — rolling MoM financial comparison including
// revenue/expense/profit changes, rolling 3-month averages, CMGR, and Turkish
// narrative.
//
// Query params:
//   months (optional): number of months in rolling window, 1-24, default 6
//
// Returns:
//   { report: PeriodComparisonReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { PeriodComparisonService }   from '@/lib/services/finance/period-comparison.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  // Parse optional months param (1-24)
  const monthsParam = req.nextUrl.searchParams.get('months')
  let months = 6
  if (monthsParam !== null) {
    const parsed = parseInt(monthsParam, 10)
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 24) {
      months = parsed
    }
  }

  try {
    const service = new PeriodComparisonService(supabase)
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
