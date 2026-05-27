// ─────────────────────────────────────────────────────────────────────────────
// GET /api/finance/income-statement
//
// Formal Income Statement (Gelir Tablosu) — monthly or annual, with optional
// prior-period comparison.
//
// Query params:
//   period=2025-01          — monthly mode (YYYY-MM)
//   includePrior=true       — add prior month comparison
//   year=2025               — annual mode (overrides period)
//   includePriorYear=true   — add prior year comparison
//
// Auth:  resolveApiAuth (company_members check via middleware)
// Cache: revalidate every 3600 seconds
// ─────────────────────────────────────────────────────────────────────────────

export const revalidate = 3600

import { NextRequest, NextResponse }     from 'next/server'
import { resolveApiAuth }                from '@/lib/api-auth'
import { IncomeStatementService }        from '@/lib/services/finance/income-statement.service'
import { REQUEST_ID_HEADER }             from '@/middleware'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response
  const { companyId, supabase, ctx } = auth

  const sp             = req.nextUrl.searchParams
  const yearParam      = sp.get('year')
  const periodParam    = sp.get('period')
  const includePrior   = sp.get('includePrior') === 'true'
  const inclPriorYear  = sp.get('includePriorYear') === 'true'

  const service = new IncomeStatementService(supabase)

  try {
    if (yearParam) {
      // Annual mode
      const year = parseInt(yearParam, 10)
      if (isNaN(year) || year < 2000 || year > 2100) {
        return NextResponse.json(
          { error: 'Invalid year parameter', code: 'INVALID_PARAM', type: 'VALIDATION' },
          { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
        )
      }
      const statement = await service.getAnnualStatement(companyId, year, inclPriorYear)
      return NextResponse.json(
        { statement },
        { headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    // Monthly mode
    const period = periodParam ?? (() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })()

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return NextResponse.json(
        { error: 'Invalid period parameter (expected YYYY-MM)', code: 'INVALID_PARAM', type: 'VALIDATION' },
        { status: 400, headers: { [REQUEST_ID_HEADER]: ctx.requestId } },
      )
    }

    const statement = await service.getStatement(companyId, period, includePrior)
    return NextResponse.json(
      { statement },
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
