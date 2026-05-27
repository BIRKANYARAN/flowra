// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/trends
//
// Financial Trend Report — 12-month KPI trend lines with momentum scoring.
//
// Returns:
//   { report: FinancialTrendsReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds (hourly — trends change slowly).
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { FinancialTrendsService } from '@/lib/services/finance/financial-trends.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  try {
    const report = await FinancialTrendsService.getReport(companyId, supabase)
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
