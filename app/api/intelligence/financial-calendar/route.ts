// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/financial-calendar?year=2026
//
// Annual Financial Calendar — all important dates for the given year:
//   • Turkish tax deadlines (hardcoded)
//   • Accounting period close / lock / end dates
//   • Partner loan maturities and capital commitment dates
//   • Workflow deadlines
//
// Auth: any authenticated company member.
// Cache: revalidate every 3600 seconds (deadlines change daily at most).
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth } from '@/lib/api-auth'
import { FinancialCalendarService } from '@/lib/services/intelligence/financial-calendar.service'
import { REQUEST_ID_HEADER } from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const { searchParams } = new URL(req.url)
  const yearParam = searchParams.get('year')
  const currentYear = new Date().getFullYear()
  const year = yearParam ? parseInt(yearParam, 10) : currentYear

  if (isNaN(year) || year < 2020 || year > 2100) {
    return NextResponse.json(
      { error: 'Geçersiz yıl parametresi', code: 'INVALID_PARAM', type: 'VALIDATION' },
      { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
    )
  }

  try {
    const report = await FinancialCalendarService.getReport(companyId, supabase, year)
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
