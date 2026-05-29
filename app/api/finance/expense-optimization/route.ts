// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/expense-optimization
//
// Returns ExpenseOptimizationReport — expense benchmarking and cost reduction
// recommendations for the current month.
//
// Returns:
//   { report: ExpenseOptimizationReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ExpenseOptimizationService } from '@/lib/services/finance/expense-optimization.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const service = new ExpenseOptimizationService(supabase)
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
