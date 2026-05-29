// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/payroll-analytics
//
// Returns payroll & compensation analytics:
//   - Salary/personnel cost trends
//   - Payroll-to-revenue ratio vs Turkish SME benchmarks
//   - SGK compliance timeline
//   - Headcount cost efficiency metrics
//
// Query params:
//   ?months=12   (default: 12, max: 24)
//   ?mode=legacy | personnel  (default: legacy — returns PayrollAnalyticsReport)
//
// Auth: admin only (salary data is sensitive)
// Cache: revalidate every 1800 seconds (30 min)
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic   = 'force-dynamic'
export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { PayrollAnalyticsService } from '@/lib/services/finance/payroll-analytics.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── admin-only check — salary data is sensitive ───────────────────────────
  const { data: memberRow, error: memberErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .single()

  if (memberErr || !memberRow) {
    return NextResponse.json(
      { error: 'Forbidden: company membership required', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  if (memberRow.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin role required for payroll data', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const monthsRaw = parseInt(req.nextUrl.searchParams.get('months') ?? '12', 10)
  const months    = isNaN(monthsRaw) || monthsRaw < 1 ? 12 : Math.min(monthsRaw, 24)
  const mode      = req.nextUrl.searchParams.get('mode') ?? 'legacy'

  try {
    const service = new PayrollAnalyticsService(supabase)

    if (mode === 'personnel') {
      const report = await service.getPersonnelReport(companyId)
      return NextResponse.json(
        { report },
        { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    const report = await service.getReport(companyId, months)
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
