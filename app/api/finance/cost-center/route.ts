// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cost-center
//
// Cost Center Analysis & Expense Intelligence.
// Returns a full cost center report including fixed/variable/semi-variable
// classification, contribution margin, breakeven revenue, and margin of safety.
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 1800 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse }   from 'next/server'
import { resolveApiAuth }              from '@/lib/api-auth'
import { CostCenterService }           from '@/lib/services/finance/cost-center.service'
import { REQUEST_ID_HEADER }           from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new CostCenterService(supabase)
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
