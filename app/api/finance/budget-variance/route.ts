// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/budget-variance
//
// Returns BudgetVarianceReport — actual vs budget performance across
// revenue, expense categories, and overall P&L.
//
// Returns:
//   { report: BudgetVarianceReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { BudgetVarianceService } from '@/lib/services/finance/budget-variance.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new BudgetVarianceService(supabase)
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
