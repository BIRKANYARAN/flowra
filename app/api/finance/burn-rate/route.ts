// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/burn-rate
//
// Cash Burn Rate Monitor — 6-month historical burn trend analysis.
//
// Returns:
//   { report: BurnRateReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { BurnRateService } from '@/lib/services/finance/burn-rate.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await BurnRateService.getReport(companyId, supabase)
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
