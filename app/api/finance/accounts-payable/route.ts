// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/accounts-payable
//
// Returns a comprehensive accounts payable analytics report.
//
// Query params:
//   period_months?: number  (default: 3, valid: 1-24)
//
// Response: { report: AccountsPayableReport }
//
// Auth: manager+ (resolveApiAuth + role check)
// Cache: revalidate = 1800 (30 minutes)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 1800

import { NextRequest, NextResponse }     from 'next/server'
import { resolveApiAuth }                from '@/lib/api-auth'
import { AccountsPayableService }        from '@/lib/services/finance/accounts-payable.service'
import { REQUEST_ID_HEADER }             from '@/middleware'

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

  // ── Parse optional period_months param ────────────────────────────────────
  const { searchParams } = new URL(req.url)
  const rawPeriod  = searchParams.get('period_months')
  let periodMonths = rawPeriod ? parseInt(rawPeriod, 10) : 3

  if (isNaN(periodMonths) || periodMonths < 1)  periodMonths = 1
  if (periodMonths > 24)                        periodMonths = 24

  try {
    const service = new AccountsPayableService(supabase)
    const report  = await service.getReport(companyId, periodMonths)

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
