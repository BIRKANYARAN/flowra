// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/tax-summary
//
// Combined VAT (KDV) + corporate tax estimate for a reporting period.
// Read-only. Nothing is written or stored.
//
// Query params:
//   from        YYYY-MM-DD  (required)
//   to          YYYY-MM-DD  (required)
//   tax_rate    number      (optional, default 25)
//
// Response:
//   {
//     period: { from, to },
//     vat: {
//       sales_vat:    number,    // output VAT collected on sales (TRY)
//       purchase_vat: number,    // input VAT paid on finalized purchases (TRY)
//       expense_vat:  number,    // input VAT paid on expenses + recurring (TRY)
//       net_vat:      number,    // sales_vat − purchase_vat − expense_vat
//       status:       "payable" | "carry_forward"
//                               // payable    → net_vat > 0 (owed to authority)
//                               // carry_forward → net_vat ≤ 0 (credit in your favour)
//     },
//     corporate: {
//       matrah:         number,  // revenue − cost − deductible_expenses
//       tax_rate:       number,  // rate used (%)
//       estimated_tax:  number,  // max(matrah,0) × tax_rate
//     }
//   }
//
// Edge cases:
//   • No sales        → sales_vat = 0, net_vat = -(purchase_vat + expense_vat)
//   • No purchases    → purchase_vat = 0
//   • Loss period     → matrah < 0, estimated_tax = 0, net_after_tax = matrah
//   • kdv = 0 rows    → VAT queries skip them via DB-level filter (gt('kdv',0))
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { contextFromHeader } from '@/lib/logger'
import { REQUEST_ID_HEADER } from '@/middleware'
import { TaxService, computeCorporateTax } from '@/lib/services/tax.service'
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
          error:  '"from" ve "to" zorunludur (YYYY-MM-DD)',
          code:   'VALIDATION_ERROR',
          type:   'BUSINESS',
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

    const period = { from, to }

    // Fire all three reads in parallel — no dependencies between them.
    const [kdvResult, gross, expResult] = await Promise.all([
      TaxService.getKdvNet(authData.user.id, companyId, period, ctx),
      FinanceService.getGrossProfit(authData.user.id, companyId, period, ctx),
      FinanceService.getOperatingExpenses(authData.user.id, companyId, period, ctx),
    ])

    const corpTax = computeCorporateTax({
      revenue_try:             gross.revenue_try,
      cost_try:                gross.cost_try,
      deductible_expenses_try: expResult.deductible_try,
      rate_percent:            taxRate,
    })

    const body = {
      period,
      vat: {
        sales_vat:    kdvResult.sales_vat_try,
        purchase_vat: kdvResult.purchase_vat_try,
        expense_vat:  kdvResult.expense_vat_try,
        net_vat:      kdvResult.net_vat_try,
        // If net_vat > 0 you owe it; ≤ 0 means you have excess credit to carry
        // forward to the next declaration period.
        status:       kdvResult.net_vat_try > 0 ? 'payable' : 'carry_forward',
      },
      corporate: {
        matrah:        corpTax.matrah_try,
        tax_rate:      corpTax.rate_percent,
        estimated_tax: corpTax.tax_try,
      },
    }

    return NextResponse.json(body, { headers: { [REQUEST_ID_HEADER]: ctx.requestId } })

  } catch (err) {
    const { body, status } = toErrorResponse(err)
    return NextResponse.json(body, { status, headers: { [REQUEST_ID_HEADER]: ctx.requestId } })
  }
}
