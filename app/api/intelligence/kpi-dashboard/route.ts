// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/kpi-dashboard
//
// Executive KPI Dashboard — returns the full KpiDashboardReport.
// Auth: any authenticated company member.
// Cached: 5 minutes (revalidate: 300).
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic   = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { KpiTrackerService }         from '@/lib/services/intelligence/kpi-tracker.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const report = await KpiTrackerService.getReport(companyId, supabase)

    return NextResponse.json(report)
  } catch (e) {
    console.error('[kpi-dashboard]', e)
    return apiError(ctx, 'KPI raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
