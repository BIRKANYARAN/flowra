// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/finance/payables-management
//
// Returns a comprehensive accounts payable management report.
//
// Response: { report: PayablesManagementReport }
//
// Auth: manager+ (resolveApiAuth + role check)
// Cache: revalidate = 300 (5 minutes)
// ═══════════════════════════════════════════════════════════════════════════════

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { PayablesManagementService } from '@/lib/services/finance/payables-management.service'
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
    const service = new PayablesManagementService(supabase)
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
