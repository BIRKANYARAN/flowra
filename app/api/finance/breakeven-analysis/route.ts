// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/breakeven-analysis
//
// Returns breakeven analysis report: company-level and per-product breakeven
// points, safety margins, and operating leverage for cash flow planning.
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { BreakevenAnalysisService } from '@/lib/services/finance/breakeven-analysis.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new BreakevenAnalysisService(supabase)
    const report  = await service.getReport(companyId)

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
