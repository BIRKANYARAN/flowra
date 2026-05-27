// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cashflow-waterfall
//
// Returns both the 3-month bridge waterfall and the 12-month forward projection.
//
// Query params:
//   ?scenario=base|conservative|optimistic  (default: base)
//     → controls the 12-month forward projection scenario
//
// Returns:
//   { report: CashflowWaterfallReport, projection: CashflowWaterfallProjection }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CashflowWaterfallService } from '@/lib/services/finance/cashflow-waterfall.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const scenarioRaw = req.nextUrl.searchParams.get('scenario') ?? 'base'
  const scenario =
    scenarioRaw === 'conservative' || scenarioRaw === 'optimistic'
      ? scenarioRaw
      : 'base'

  try {
    const [report, projection] = await Promise.all([
      CashflowWaterfallService.getReport(companyId, supabase),
      CashflowWaterfallService.getProjection(companyId, supabase, scenario),
    ])
    return NextResponse.json(
      { report, projection },
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
