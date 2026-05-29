// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/profitability-attribution
//
// Profitability Attribution Analysis report.
// Auth: resolveApiAuth + company_members check, manager+
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 3600

import { NextRequest, NextResponse }              from 'next/server'
import { resolveApiAuth }                         from '@/lib/api-auth'
import { ProfitabilityAttributionService }        from '@/lib/services/finance/profitability-attribution.service'
import { REQUEST_ID_HEADER }                      from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new ProfitabilityAttributionService(supabase)
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
