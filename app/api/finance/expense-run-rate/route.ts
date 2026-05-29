// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/expense-run-rate
//
// Returns ExpenseRunRateReport — tracks expense momentum and trends per
// category, projecting annual run rates and detecting momentum shifts.
//
// Returns:
//   { report: ExpenseRunRateReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ExpenseRunRateService } from '@/lib/services/finance/expense-run-rate.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new ExpenseRunRateService(supabase)
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
