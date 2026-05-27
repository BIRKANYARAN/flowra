// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/expense-anomaly?days=90
//
// Returns ExpenseAnomalyReport — statistical anomaly detection for expenses.
// Uses z-score, IQR, and duplicate detection to flag unusual expenses.
//
// Query params:
//   ?days=90   — analysis window in days (default: 90)
//
// Returns:
//   { report: ExpenseAnomalyReport }
//
// Auth: manager+ (resolveApiAuth).
// Cache: revalidate every 1800 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 1800

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { ExpenseAnomalyService } from '@/lib/services/finance/expense-anomaly.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const daysParam = req.nextUrl.searchParams.get('days')
  const days = daysParam ? Math.max(7, Math.min(365, parseInt(daysParam, 10) || 90)) : 90

  try {
    const service = new ExpenseAnomalyService(supabase)
    const report  = await service.getReport(companyId, days)
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
