// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/pricing-intelligence
//
// Pricing Intelligence — discount discipline & price realization analysis.
// Returns current month pricing health metrics per company.
//
// Auth:  resolveApiAuth (manager+ role implied by auth)
// Cache: revalidate every 1800 seconds (30 min)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse }          from 'next/server'
import { resolveApiAuth }                     from '@/lib/api-auth'
import { PricingIntelligenceService }         from '@/lib/services/finance/pricing-intelligence.service'
import { REQUEST_ID_HEADER }                  from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new PricingIntelligenceService(supabase)
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
