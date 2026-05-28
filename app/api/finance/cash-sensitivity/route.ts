// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/cash-sensitivity — Cash Flow Sensitivity Analysis
//
// Returns { report: CashSensitivityReport }
//
// Auth:  resolveApiAuth + company_members check, manager+ (admin or manager)
// Cache: revalidate every 1800 seconds (30 minutes)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { CashSensitivityService }    from '@/lib/services/finance/cash-sensitivity.service'
import { REQUEST_ID_HEADER }         from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── Role check: manager or admin only ──────────────────────────────────────
  const { data: memberRow, error: memberErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .single()

  if (memberErr || !memberRow) {
    return NextResponse.json(
      { error: 'Şirket üyeliği bulunamadı', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  if (memberRow.role === 'viewer') {
    return NextResponse.json(
      { error: 'Forbidden: manager or admin role required', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new CashSensitivityService(supabase)
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
