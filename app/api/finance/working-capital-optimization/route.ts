// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/working-capital-optimization
//
// Returns actionable working capital optimization recommendations with
// estimated cash impact (DSO/DPO/DIO improvement vs. Turkish SME benchmarks).
//
// Returns: { report: WorkingCapitalOptimizationReport }
//
// Auth: resolveApiAuth + company_members check, manager+
// Cache: revalidate every 3600 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse }             from 'next/server'
import { resolveApiAuth }                        from '@/lib/api-auth'
import { WorkingCapitalOptimizerService }        from '@/lib/services/finance/working-capital-optimizer.service'
import { REQUEST_ID_HEADER }                     from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { uid, companyId, supabase, ctx } = auth

  // ── Manager+ check ──────────────────────────────────────────────────────────
  const { data: memberRow, error: memberErr } = await supabase
    .from('company_members')
    .select('role')
    .eq('company_id', companyId)
    .eq('user_id', uid)
    .single()

  if (memberErr || !memberRow) {
    return NextResponse.json(
      { error: 'Company member not found', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  const role = memberRow.role as string
  if (!['admin', 'manager'].includes(role)) {
    return NextResponse.json(
      { error: 'Manager or admin role required', code: 'FORBIDDEN', type: 'AUTH' },
      { status: 403, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const service = new WorkingCapitalOptimizerService(supabase)
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
