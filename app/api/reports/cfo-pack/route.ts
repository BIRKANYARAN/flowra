import { NextRequest, NextResponse }  from 'next/server'
import { FinanceService }             from '@/lib/services/finance.service'
import { TaxService }                 from '@/lib/services/tax.service'
import { BalanceSheetService }        from '@/lib/services/balance-sheet.service'
import { CashFlowStatementService }   from '@/lib/services/cashflow-statement.service'
import { PeriodService }              from '@/lib/services/period.service'
import { resolveApiAuth }             from '@/lib/api-auth'
import {
  CFO_PACK_MANIFEST,
  getRequiredReports,
  type CFOPackReport,
} from '@/lib/reports/cfo-pack-manifest'

export const dynamic = 'force-dynamic'

// GET /api/reports/cfo-pack?from=&to=&as_of=&period_id=
//
// Full CFO Package — all financial statements in one JSON response.
// The client can render this as a multi-section print view or trigger a download.
//
// Response includes:
//   manifest     — full CFO_PACK_MANIFEST
//   completeness — { total, required_total, available, required_available, pct_complete }
//   generated_at — ISO timestamp
//   period_id    — resolved period id (from param or current open period)
//   company_id   — company id
//
// Future: generate ZIP with individual PDFs (react-pdf or Puppeteer server-side).

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const params   = req.nextUrl.searchParams
    const now      = new Date()
    const from     = params.get('from')      ?? `${now.getFullYear()}-01-01`
    const to       = params.get('to')        ?? now.toISOString().slice(0, 10)
    const asOf     = params.get('as_of')     ?? to
    const periodIdParam = params.get('period_id') ?? null

    // Resolve period_id — use param if provided, otherwise look up current open period
    let periodId: string | null = periodIdParam
    if (!periodId) {
      try {
        const currentPeriod = await PeriodService.getCurrent(companyId, supabase)
        periodId = currentPeriod?.id ?? null
      } catch {
        periodId = null
      }
    }

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
      // Receivables aging buckets — use sale_date (business date) not created_at
      supabase.from('sales').select('total_try:total, amount_paid:paid_amount, sale_date, payment_status, customer_name')
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
        if (!s.sale_date) continue  // guard against missing business date
        const daysDiff = Math.round((today.getTime() - new Date(s.sale_date as string).getTime()) / 86_400_000)
        const amt = Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
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

    // ── Completeness calculation ──────────────────────────────────────────────
    // Map section availability by manifest id
    const availabilityMap: Record<string, boolean> = {
      income_statement:  pnl  !== null,
      balance_sheet:     bs   !== null,
      cash_flow:         cf   !== null,
      trial_balance:     false,           // not fetched in this route (GL-only)
      partner_capital:   false,           // not fetched here
      vat_summary:       tax  !== null,
      receivables_aging: receivables.status === 'fulfilled' && !!receivables.value.data,
      executive_summary: false,           // not fetched in this route
    }

    const required = getRequiredReports()
    const total            = CFO_PACK_MANIFEST.length
    const required_total   = required.length
    const available        = CFO_PACK_MANIFEST.filter((r: CFOPackReport) => availabilityMap[r.id]).length
    const required_available = required.filter((r: CFOPackReport) => availabilityMap[r.id]).length
    const pct_complete     = total > 0 ? Math.round((available / total) * 100) : 0

    return NextResponse.json({
      company_name: companyName,
      company_id:   companyId,
      period_id:    periodId,
      from, to, as_of: asOf,
      generated_at: new Date().toISOString(),
      manifest:     CFO_PACK_MANIFEST,
      completeness: {
        total,
        required_total,
        available,
        required_available,
        pct_complete,
      },
      sections: {
        income_statement:    pnl ?? null,
        tax_summary:         tax ?? null,
        balance_sheet:       bs  ?? null,
        cash_flow:           cf  ?? null,
        receivables_aging:   aging,
        expense_by_category: expByCategory,
      },
    })
  } catch (e) {
    console.error('[reports/cfo-pack]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
