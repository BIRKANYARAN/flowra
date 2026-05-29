// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/scenario-comparison
//
// Returns a multi-scenario comparison report with recommendation logic,
// risk classification, rankings, and Turkish narrative.
//
// Query params:
//   ?ids=id1,id2,id3   (optional; up to 5 scenario UUIDs to filter)
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 300 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ScenarioComparisonService } from '@/lib/services/finance/scenario-comparison.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const idsRaw = req.nextUrl.searchParams.get('ids')

  let scenarioIds: string[] | undefined
  if (idsRaw) {
    scenarioIds = idsRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 5)

    if (scenarioIds.length === 0) scenarioIds = undefined
  }

  try {
    const service = new ScenarioComparisonService(supabase)
    const report  = await service.getComparison(companyId, scenarioIds)

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
