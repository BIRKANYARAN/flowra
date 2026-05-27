// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/fx-exposure?months=6
//
// Multi-Currency FX Exposure Analysis.
// Auth: resolveApiAuth, manager+.
// Cache: revalidate every 3600s.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse }  from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { FxExposureService }          from '@/lib/services/finance/fx-exposure.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase } = auth

  const monthsParam = req.nextUrl.searchParams.get('months')
  const months      = monthsParam ? Math.max(1, Math.min(24, parseInt(monthsParam, 10) || 6)) : 6

  try {
    const service = new FxExposureService(supabase)
    const report  = await service.getReport(companyId, months)
    return NextResponse.json(report)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
