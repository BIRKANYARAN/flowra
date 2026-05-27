// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/ratios
//
// Financial Ratio Trends — 12-month historical trends for 8 key ratios.
//
// Returns: FinancialRatiosReport
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds (1 hour).
// Query param: ?months=12 (default 12, max 24)
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { FinancialRatiosService } from '@/lib/services/finance/financial-ratios.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const monthsParam = req.nextUrl.searchParams.get('months')
  const months = Math.min(24, Math.max(1, parseInt(monthsParam ?? '12', 10) || 12))

  try {
    const report = await FinancialRatiosService.getReport(companyId, supabase, months)
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
