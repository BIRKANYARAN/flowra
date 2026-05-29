// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/tax-compliance-calendar
//
// Turkish Tax Compliance Calendar — KDV, Geçici Vergi, SGK, Kurumlar Vergisi.
// Auth: manager+ (tax data is sensitive).
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { TaxComplianceCalendarService } from '@/lib/services/finance/tax-compliance-calendar.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── manager+ role check ────────────────────────────────────────────────────
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

  const ALLOWED_ROLES = ['admin', 'manager']
  if (!ALLOWED_ROLES.includes(memberRow.role)) {
    return NextResponse.json(
      { error: 'Forbidden: manager or admin role required', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new TaxComplianceCalendarService(supabase)
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
