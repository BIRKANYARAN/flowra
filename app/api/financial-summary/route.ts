// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/financial-summary
//
// Full P&L snapshot for a reporting period.
// ALL numbers are derived at request time — nothing is read from a stored
// aggregate column; nothing is written.
//
// Query params:
//   from        YYYY-MM-DD  (required)
//   to          YYYY-MM-DD  (required)
//   tax_rate    number      (optional, default 25 = Turkey KV rate 2024-25)
//
// Response shape (all monetary values in TRY):
//   {
//     period:                    { from, to },
//     revenue:                   number,         // Σ sales.total_try
//     cost:                      number,         // FIFO COGS from sale_item_allocations
//     gross_profit:              number,         // revenue − cost
//     expenses_total:            number,         // all expenses + recurring occurrences
//     deductible_expenses:       number,         // subset that reduces matrah
//     non_deductible_expenses:   number,         // cash cost, not tax-deductible
//     matrah:                    number,         // revenue − cost − deductible_expenses
//     tax_rate:                  number,         // corporate tax rate used (%)
//     tax:                       number,         // max(matrah,0) × tax_rate
//     net_after_tax:             number,         // matrah − tax
//   }
//
// Edge cases:
//   • No sales in period           → revenue = 0, downstream values cascade to 0
//   • Losses (matrah < 0)          → tax = 0, net_after_tax = matrah (negative)
//   • Empty expense table          → expenses = 0, matrah = gross_profit
//   • Recurring with future end_date → occurrences in [from,to] are projected
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { FinanceService } from '@/lib/services/finance.service'
import { toErrorResponse } from '@/types/errors'
import { CORPORATE_TAX_RATE_TR } from '@/lib/services/finance-rules'
import { resolveCompanyId } from '@/lib/resolve-company'

function parseDate(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return s
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'UNAUTHORIZED', type: 'SECURITY' },
      { status: 401 }
    )
  }
  const ctx = contextFromHeader(req.headers.get(REQUEST_ID_HEADER), authData.user.id)

  let companyId: string
  try { companyId = await resolveCompanyId(authData.user.id, supabase) }
  catch { return NextResponse.json({ error: 'Şirket bilgisi alınamadı', code: 'COMPANY_NOT_RESOLVED', type: 'SYSTEM' }, { status: 409 }) }

  try {
    const url  = new URL(req.url)
    const from = parseDate(url.searchParams.get('from'))
    const to   = parseDate(url.searchParams.get('to'))

    if (!from || !to) {
      return NextResponse.json(
        {
          error: '"from" ve "to" zorunludur (YYYY-MM-DD)',
          code:  'VALIDATION_ERROR',
          type:  'BUSINESS',
          fields: { from: !from, to: !to },
        },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    if (from > to) {
      return NextResponse.json(
        { error: '"from" tarihi "to" tarihinden önce olmalı', code: 'VALIDATION_ERROR', type: 'BUSINESS' },
        { status: 422, headers: { [REQUEST_ID_HEADER]: ctx.requestId } }
      )
    }

    const rawRate = url.searchParams.get('tax_rate')
    const taxRate = rawRate !== null && isFinite(Number(rawRate)) && Number(rawRate) >= 0
      ? Number(rawRate)
      : CORPORATE_TAX_RATE_TR

    // ── Compute ────────────────────────────────────────────────────────────
    const summary = await FinanceService.getFinancialSummary(
      authData.user.id,
      companyId,
      { from, to },
      { corporate_tax_rate: taxRate },
      ctx,
    )

    // ── Flat response shape (as spec'd by caller) ──────────────────────────
    const body = {
      period: summary.period,

      // P&L
      revenue:                 summary.revenue_try,
      cost:                    summary.cost_try,
      gross_profit:            summary.gross_profit_try,

      // Expenses
      expenses_total:          summary.expenses_total_try,
      deductible_expenses:     summary.deductible_expenses_try,
      non_deductible_expenses: summary.non_deductible_expenses_try,

      // Tax base + liability
      matrah:                  summary.matrah_try,
      tax_rate:                summary.corporate_tax_rate,
      tax:                     summary.corporate_tax_try,
      net_after_tax:           summary.net_after_tax_try,
    }

    return NextResponse.json(body, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
