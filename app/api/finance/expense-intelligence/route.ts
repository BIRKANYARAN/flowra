// ── GET /api/finance/expense-intelligence ─────────────────────────────────────
//
// Returns ExpenseEfficiencyReport — spending efficiency, category mix,
// fixed/variable split, run-rate projections and savings opportunities.
//
// Query params:
//   ?months=3   — analysis window in months (default: 3)
//
// Returns:
//   { report: ExpenseEfficiencyReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ExpenseIntelligenceService } from '@/lib/services/finance/expense-intelligence.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const monthsParam  = req.nextUrl.searchParams.get('months')
  const periodMonths = monthsParam
    ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 3))
    : 3

  try {
    const service = new ExpenseIntelligenceService(supabase)
    const report  = await service.getReport(companyId, periodMonths)
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
