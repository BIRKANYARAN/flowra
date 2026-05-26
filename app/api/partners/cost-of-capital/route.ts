// ─────────────────────────────────────────────────────────────────────────────
// GET /api/partners/cost-of-capital
//
// Partner Loan Cost of Capital — WACD, per-partner breakdown, VUK/KVK 13 flags.
//
// Auth: any member.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { CostOfCapitalService } from '@/lib/services/pcle/cost-of-capital.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await CostOfCapitalService.getReport(companyId, supabase)
    return NextResponse.json(report, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: msg, code: 'SERVICE_ERROR', type: 'SYSTEM' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
