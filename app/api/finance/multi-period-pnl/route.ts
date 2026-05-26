// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/multi-period-pnl
//
// Multi-Period P&L Comparison — side-by-side P&L for up to 6 periods.
//
// Query params:
//   periods   comma-separated YYYY-MM or YYYY values (required, max 6)
//             e.g. ?periods=2026-05,2026-04,2026-03
//
// Returns:
//   { report: MultiPeriodPnlReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { MultiPeriodPnlService }     from '@/lib/services/finance/multi-period-pnl.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

/** Parse a period string like 'YYYY-MM' or 'YYYY' into { year, month? } */
function parsePeriod(s: string): { year: number; month?: number } | null {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(s)
  if (monthMatch) {
    const year  = parseInt(monthMatch[1], 10)
    const month = parseInt(monthMatch[2], 10)
    if (year < 2000 || year > 2100 || month < 1 || month > 12) return null
    return { year, month }
  }

  const yearMatch = /^(\d{4})$/.exec(s)
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10)
    if (year < 2000 || year > 2100) return null
    return { year }
  }

  return null
}

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const url     = new URL(req.url)
  const rawList = url.searchParams.get('periods')

  if (!rawList) {
    return NextResponse.json(
      { error: 'periods parameter is required (comma-separated YYYY-MM or YYYY)', code: 'MISSING_PARAM' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const rawPeriods = rawList.split(',').map(s => s.trim()).filter(Boolean)

  if (rawPeriods.length === 0 || rawPeriods.length > 6) {
    return NextResponse.json(
      { error: 'periods must contain 1–6 entries', code: 'INVALID_PARAM' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const parsed: Array<{ year: number; month?: number }> = []
  for (const raw of rawPeriods) {
    const p = parsePeriod(raw)
    if (!p) {
      return NextResponse.json(
        { error: `Invalid period format: "${raw}" — expected YYYY-MM or YYYY`, code: 'INVALID_PARAM' },
        { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }
    parsed.push(p)
  }

  try {
    const report = await MultiPeriodPnlService.getReport(companyId, supabase, parsed)

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
