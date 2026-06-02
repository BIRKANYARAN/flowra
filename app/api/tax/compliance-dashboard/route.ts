// ── GET /api/tax/compliance-dashboard ────────────────────────────────────────
//
// Returns TaxComplianceDashboard: all Turkish tax obligations with compliance
// health score, filing statuses, and summary metrics.
//
// Auth: resolveApiAuth (admin only).
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

// force-dynamic: this route reads cookies (resolveApiAuth) so it MUST be dynamic.
// Without it, `revalidate` opts the route into caching, which conflicts with the
// cookie read and can yield a malformed/cached response that crashes the client
// island. Matches the other tax routes (/api/finance/tax-compliance, tax-calendar).
export const dynamic    = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { TaxComplianceService } from '@/lib/services/tax/tax-compliance.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service   = new TaxComplianceService(supabase)
    const dashboard = await service.getDashboard(companyId)

    return NextResponse.json(
      { dashboard },
      { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[tax/compliance-dashboard] error:', msg)
    return NextResponse.json(
      { error: 'Vergi uyum paneli hesaplanamadı', detail: msg, code: 'INTERNAL_ERROR' },
      { status: 500, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }
}
