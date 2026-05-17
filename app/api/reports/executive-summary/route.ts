import { NextRequest, NextResponse }          from 'next/server'
import { FinanceService }                      from '@/lib/services/finance.service'
import { TaxService }                          from '@/lib/services/tax.service'
import { BalanceSheetService }                 from '@/lib/services/balance-sheet.service'
import { CashFlowStatementService }            from '@/lib/services/cashflow-statement.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/reports/executive-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&as_of=YYYY-MM-DD
//
// Aggregates P&L + balance sheet + cash flow + tax into one JSON response.
// Used by the executive summary page and the CFO Pack endpoint.

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params = req.nextUrl.searchParams
    const now    = new Date()
    const from   = params.get('from')  ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to     = params.get('to')    ?? now.toISOString().slice(0, 10)
    const asOf   = params.get('as_of') ?? to

    const [fs, taxSummary, balanceSheet, cashFlow] = await Promise.allSettled([
      FinanceService.getFinancialSummary(uid, companyId, { from, to }),
      TaxService.getKdvNet(uid, companyId, { from, to }),
      BalanceSheetService.compute(uid, companyId, asOf, supabase),
      CashFlowStatementService.compute(uid, companyId, { from, to }, supabase),
    ])

    const pnl = fs.status === 'fulfilled' ? fs.value : null
    const tax = taxSummary.status === 'fulfilled' ? taxSummary.value : null
    const bs  = balanceSheet.status === 'fulfilled' ? balanceSheet.value : null
    const cf  = cashFlow.status === 'fulfilled' ? cashFlow.value : null

    return NextResponse.json({
      from, to, as_of: asOf,
      computed_at: new Date().toISOString(),
      income_statement: pnl ? {
        revenue:          pnl.revenue_try,
        cogs:             pnl.cost_try,
        gross_profit:     pnl.gross_profit_try,
        gross_margin_pct: pnl.revenue_try > 0 ? (pnl.gross_profit_try / pnl.revenue_try) * 100 : 0,
        expenses:         pnl.expenses_total_try,
        ebitda:           pnl.gross_profit_try - pnl.expenses_total_try,
        corporate_tax:    pnl.corporate_tax_try,
        net_income:       pnl.net_after_tax_try,
        net_margin_pct:   pnl.revenue_try > 0 ? (pnl.net_after_tax_try / pnl.revenue_try) * 100 : 0,
      } : null,
      tax_summary: tax ? {
        sales_vat:    tax.sales_vat_try,
        purchase_vat: tax.purchase_vat_try,
        expense_vat:  tax.expense_vat_try,
        net_vat:      tax.net_vat_try,
        status:       tax.net_vat_try > 0 ? 'payable' : 'carry_forward',
      } : null,
      balance_sheet: bs ? {
        total_assets:      bs.assets.total_assets_try,
        total_liabilities: bs.liabilities.total_liabilities_try,
        total_equity:      bs.equity.total_equity_try,
        is_balanced:       bs.balanced,
        cash_try:          bs.assets.cash_try,
        receivables_try:   bs.assets.receivables_try,
        inventory_try:     bs.assets.inventory_try,
      } : null,
      cash_flow: cf ? {
        operating:  cf.operating.net_operating_try,
        investing:  cf.investing.net_investing_try,
        financing:  cf.financing.net_financing_try,
        net_change: cf.net_change_try,
      } : null,
    })
  } catch (e) {
    console.error('[reports/executive-summary]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
