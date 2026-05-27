// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planning/variance-analysis?year=2026
//
// 3-Way Variance Analysis: Actual vs Budget vs Forecast.
//
// Returns:
//   { report: VarianceReport }
//
// Auth: any authenticated company member.
// Cache: revalidate every 300 seconds.
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { VarianceAnalysisService } from '@/lib/services/planning/variance-analysis.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const yearParam = req.nextUrl.searchParams.get('year')
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear()

  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: 'Invalid year parameter', code: 'INVALID_PARAM', type: 'VALIDATION' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const report = await VarianceAnalysisService.getReport(companyId, year, supabase)
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
