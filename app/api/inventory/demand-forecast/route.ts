// ─────────────────────────────────────────────────────────────────────────────
// GET /api/inventory/demand-forecast
//
// Returns { report: DemandForecastReport } for the authenticated company.
// Auth: manager+ required.
//
// Query params:
//   period_months  — number of trailing months to analyze (default 6)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }             from '@/lib/api-auth'
import { DemandForecastService }      from '@/lib/services/inventory/demand-forecast.service'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase } = auth

  // Manager+ required
  const { data: member } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .is('deleted_at', null)
    .maybeSingle()

  if (member?.role !== 'admin' && member?.role !== 'manager') {
    return NextResponse.json(
      { error: 'Bu rapor için yönetici veya müdür yetkisi gereklidir.', code: 'FORBIDDEN' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const periodMonths = Math.min(
    24,
    Math.max(1, parseInt(searchParams.get('period_months') ?? '6', 10) || 6),
  )

  try {
    const service = new DemandForecastService(supabase)
    const report = await service.getReport(companyId, periodMonths)
    return NextResponse.json({ report })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
