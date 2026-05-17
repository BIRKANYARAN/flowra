import { NextRequest, NextResponse }  from 'next/server'
import { resolveCompanyId }           from '@/lib/resolve-company'
import { FinanceService }             from '@/lib/services/finance.service'
import { TaxService }                 from '@/lib/services/tax.service'
import { BalanceSheetService }        from '@/lib/services/balance-sheet.service'
import { CashFlowStatementService }   from '@/lib/services/cashflow-statement.service'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/reports/cfo-pack?from=&to=&as_of=
//
// Full CFO Package — all financial statements in one JSON response.
// The client can render this as a multi-section print view or trigger a download.
//
// Future: generate ZIP with individual PDFs (react-pdf or Puppeteer server-side).

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase, ctx } = auth

    const params = req.nextUrl.searchParams
    const now    = new Date()
    const from   = params.get('from')  ?? `${now.getFullYear()}-01-01`
    const to     = params.get('to')    ?? now.toISOString().slice(0, 10)
    const asOf   = params.get('as_of') ?? to

    // Fetch company name for the header
    const { data: companyRow } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()
    const companyName = companyRow?.name ?? 'Şirket'

    const [fs, taxSummary, balanceSheet, cashFlow, receivables, expenses] = await Promise.allSettled([
      FinanceService.getFinancialSummary(uid, companyId, { from, to }),
      TaxService.getKdvNet(uid, companyId, { from, to }),
      BalanceSheetService.compute(uid, companyId, asOf, supabase),
      CashFlowStatementService.compute(uid, companyId, { from, to }, supabase),
      // Receivables aging buckets
      supabase.from('sales').select('total_try, created_at, payment_status, customer_name')
        .eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null),
      // Expense category breakdown
      supabase.from('expenses').select('expense_type, amount_try')
        .eq('company_id', companyId).is('deleted_at', null)
        .gte('expense_date', from).lte('expense_date', to),
    ])

    // Aging buckets
    const today = new Date()
    const aging: Record<string, number> = { current: 0, overdue_30: 0, overdue_60: 0, overdue_90: 0 }
    if (receivables.status === 'fulfilled' && receivables.value.data) {
      for (const s of receivables.value.data) {
        const daysDiff = Math.round((today.getTime() - new Date(s.created_at as string).getTime()) / 86_400_000)
        const amt = Number(s.total_try ?? 0)
        if (daysDiff <= 30)      aging.current    += amt
        else if (daysDiff <= 60) aging.overdue_30  += amt
        else if (daysDiff <= 90) aging.overdue_60  += amt
        else                     aging.overdue_90  += amt
      }
    }

    // Expense by category
    const expByCategory: Record<string, number> = {}
    if (expenses.status === 'fulfilled' && expenses.value.data) {
      for (const e of expenses.value.data) {
        const cat = (e.expense_type as string) ?? 'general'
        expByCategory[cat] = (expByCategory[cat] ?? 0) + Number(e.amount_try ?? 0)
      }
    }

    const pnl = fs.status === 'fulfilled' ? fs.value : null
    const tax = taxSummary.status === 'fulfilled' ? taxSummary.value : null
    const bs  = balanceSheet.status === 'fulfilled' ? balanceSheet.value : null
    const cf  = cashFlow.status === 'fulfilled' ? cashFlow.value : null

    return NextResponse.json({
      company_name: companyName,
      from, to, as_of: asOf,
      generated_at: new Date().toISOString(),
      sections: {
        income_statement: pnl ?? null,
        tax_summary:      tax ?? null,
        balance_sheet:    bs  ?? null,
        cash_flow:        cf  ?? null,
        receivables_aging: aging,
        expense_by_category: expByCategory,
      },
    })
  } catch (e) {
    console.error('[reports/cfo-pack]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
