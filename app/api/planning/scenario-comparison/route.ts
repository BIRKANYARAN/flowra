// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planning/scenario-comparison
//
// Multi-scenario comparison report.
//
// Query params:
//   ids   — comma-separated scenario UUIDs (optional; if omitted: latest ≤5)
//   max   — max number of scenarios (default 5, max 5)
//
// Returns:
//   { report: ScenarioComparisonReport }
//
// Auth: manager+ (resolveApiAuth)
// Cache: force-dynamic, revalidate every 1800 seconds (30 min)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic    = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { ScenarioComparisonServiceLegacy } from '@/lib/services/planning/scenario-comparison.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const searchParams = req.nextUrl.searchParams
  const idsParam     = searchParams.get('ids')
  const maxParam     = searchParams.get('max')

  const ids: string[] | undefined = idsParam
    ? idsParam.split(',').map(s => s.trim()).filter(Boolean)
    : undefined

  const max = Math.min(
    5,
    Math.max(1, parseInt(maxParam ?? '5', 10) || 5),
  )

  try {
    const report = await ScenarioComparisonServiceLegacy.getReport(
      companyId,
      supabase,
      ids,
      max,
    )
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
