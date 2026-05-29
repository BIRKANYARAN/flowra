// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/ebitda-bridge
//
// EBITDA Bridge Analysis.
// Decomposes EBITDA change between prior month and current month into
// volume, price/mix, cost, and residual effects.
//
// Auth: resolveApiAuth, manager+
// Cache: revalidate every 300 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { EbitdaBridgeService }        from '@/lib/services/finance/ebitda-bridge.service'
import { REQUEST_ID_HEADER }          from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new EbitdaBridgeService(supabase)
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
