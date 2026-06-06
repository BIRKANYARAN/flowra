// ── /api/dashboard/home ───────────────────────────────────────────────────────
// GET — consolidated payload for the role home dashboards (CEO / CFO / Sales).
// Returns the executive summary (KPIs, alerts, partners, situation) + chart-shaped
// aggregations (12-month trend, expense breakdown, top customers, pipeline) and the
// caller's member role (used to pick the default lens). One call powers all three
// lenses so switching between them is instant — no refetch.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { apiError, reqCtx } from '@/lib/api-utils'
import { resolveUserRole } from '@/lib/require-role'
import { ExecutiveSummaryComputeService } from '@/lib/services/intelligence/executive-summary.service'
import { HomeDashboardService } from '@/lib/services/dashboard/home-dashboard.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { uid, companyId, supabase } = auth

  try {
    const [role, summary, charts] = await Promise.all([
      resolveUserRole(uid, companyId, supabase).catch(() => null),
      ExecutiveSummaryComputeService.compute(companyId, supabase),
      HomeDashboardService.getCharts(companyId, supabase),
    ])

    return NextResponse.json(
      { role: role ?? 'viewer', summary, charts },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[dashboard/home]', err)
    return apiError(ctx, 'Kontrol paneli yüklenemedi', 500)
  }
}
