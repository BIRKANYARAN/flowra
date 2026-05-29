// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/fx-exposure
//
// FX Exposure & Currency Risk Analysis.
// Returns YTD multi-currency receivables/payables, net exposure,
// risk classification, hedge recommendation, and depreciation scenarios.
//
// Auth: resolveApiAuth (manager+)
// Cache: revalidate every 1800 seconds (30 min)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { FxExposureService }          from '@/lib/services/finance/fx-exposure.service'
import { REQUEST_ID_HEADER }          from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new FxExposureService(supabase)
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
