// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/period-comparison
//
// Period-over-Period Comparison — YoY or MoM financial metrics.
//
// Query params:
//   type   'yoy' | 'mom'   (required)
//   year   number          (required)
//   month  number          (optional — required for month comparison)
//
// Returns:
//   { report: PeriodComparisonReport }
//
// Auth: any authenticated company member.
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

  const url  = new URL(req.url)
  const type = url.searchParams.get('type') ?? 'yoy'
  const year = parseInt(url.searchParams.get('year') ?? String(new Date().getFullYear()), 10)

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: 'Invalid year parameter', code: 'INVALID_PARAM' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    let report

    if (type === 'yoy' && url.searchParams.has('month')) {
      // Month-level YoY: specified month vs same month prior year
      const month = parseInt(url.searchParams.get('month')!, 10)
      if (isNaN(month) || month < 1 || month > 12) {
        return NextResponse.json(
          { error: 'Invalid month parameter (1–12)', code: 'INVALID_PARAM' },
          { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
        )
      }
      report = await PeriodComparisonService.getMonthComparison(companyId, year, month, supabase)
    } else {
      // Annual YoY: full year vs prior year
      report = await PeriodComparisonService.getYearComparison(companyId, year, supabase)
    }

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
