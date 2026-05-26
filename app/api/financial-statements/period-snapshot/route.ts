import { NextRequest, NextResponse }        from 'next/server'
import { resolveApiAuth }                    from '@/lib/api-auth'
import { PeriodService }                     from '@/lib/services/period.service'
import { GeneralLedgerService }              from '@/lib/services/ledger/general-ledger.service'
import { GLBalanceSheetService }             from '@/lib/services/ledger/gl-balance-sheet.service'
import { FinanceService }                    from '@/lib/services/finance.service'
import { CashFlowStatementService }          from '@/lib/services/cashflow-statement.service'

export const dynamic = 'force-dynamic'

// GET /api/financial-statements/period-snapshot?period_id=UUID
//
// Returns a consolidated snapshot of all financial statements for a period.
// No admin role required — any authenticated company member may request their
// own company's period snapshot.
//
// Response shape:
// {
//   period:         { id, period_start, period_end, status },
//   trial_balance:  { is_balanced, imbalance_try, total_debit_try, total_credit_try },
//   income_summary: { revenue_try, expenses_try, gross_profit_try, net_income_try },
//   balance_summary:{ total_assets_try, total_liabilities_try, total_equity_try, is_balanced },
//   cash_summary:   { opening_cash_try, closing_cash_try, net_change_try },
//   readiness: {
//     trial_balance_ok, bs_balanced, period_closed, snapshot_complete,
//   },
//   generated_at: ISO string,
// }

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const periodId = req.nextUrl.searchParams.get('period_id')
    if (!periodId) {
      return NextResponse.json(
        { error: 'period_id query parameter is required' },
        { status: 400 },
      )
    }

    // Fetch the period — validate it belongs to the company
    const { data: periodRow, error: periodError } = await supabase
      .from('accounting_periods')
      .select('id, period_start, period_end, status, opening_cash_try, closing_cash_try')
      .eq('id', periodId)
      .eq('company_id', companyId)
      .maybeSingle()

    if (periodError) {
      return NextResponse.json({ error: 'Failed to load period' }, { status: 500 })
    }
    if (!periodRow) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 })
    }

    const from  = periodRow.period_start as string
    const to    = periodRow.period_end   as string

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [tbResult, bsResult, pnlResult, cfResult] = await Promise.allSettled([
      GeneralLedgerService.trialBalance(companyId, supabase, { periodId }),
      GLBalanceSheetService.compute(companyId, supabase, { asOf: to, periodId }),
      FinanceService.getFinancialSummary(uid, companyId, { from, to }),
      CashFlowStatementService.compute(uid, companyId, { from, to }, supabase),
    ])

    // ── Trial balance ─────────────────────────────────────────────────────────
    const tb = tbResult.status === 'fulfilled' ? tbResult.value : null
    const trial_balance = tb
      ? {
          is_balanced:      tb.is_balanced,
          imbalance_try:    tb.imbalance_try,
          total_debit_try:  tb.total_debit_try,
          total_credit_try: tb.total_credit_try,
        }
      : null

    // ── Balance sheet summary ─────────────────────────────────────────────────
    const bs = bsResult.status === 'fulfilled' ? bsResult.value : null
    const balance_summary = bs
      ? {
          total_assets_try:      bs.total_assets_try,
          total_liabilities_try: bs.total_liabilities_try,
          total_equity_try:      bs.total_equity_try,
          is_balanced:           bs.is_balanced,
        }
      : null

    // ── Income summary ────────────────────────────────────────────────────────
    // FinanceService.getFinancialSummary returns revenue, gross_profit, net_income, etc.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pnl = pnlResult.status === 'fulfilled' ? (pnlResult.value as any) : null
    const income_summary = pnl
      ? {
          revenue_try:      Number(pnl.revenue      ?? pnl.total_revenue      ?? 0),
          expenses_try:     Number(pnl.total_expenses ?? pnl.expenses          ?? 0),
          gross_profit_try: Number(pnl.gross_profit  ?? 0),
          net_income_try:   Number(pnl.net_income    ?? pnl.net_profit         ?? 0),
        }
      : null

    // ── Cash summary ──────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cf = cfResult.status === 'fulfilled' ? (cfResult.value as any) : null
    const opening_cash = Number(periodRow.opening_cash_try ?? 0)
    const closing_cash = cf
      ? Number(cf.closing_balance ?? cf.closing_cash ?? periodRow.closing_cash_try ?? 0)
      : Number(periodRow.closing_cash_try ?? 0)
    const cash_summary = {
      opening_cash_try: opening_cash,
      closing_cash_try: closing_cash,
      net_change_try:   closing_cash - opening_cash,
    }

    // ── Readiness flags ───────────────────────────────────────────────────────
    const trial_balance_ok = tb?.is_balanced ?? false
    const bs_balanced      = bs?.is_balanced ?? false
    const period_closed    = periodRow.status === 'closed' || periodRow.status === 'locked'
    const snapshot_complete = trial_balance_ok && bs_balanced && period_closed

    return NextResponse.json({
      period: {
        id:           periodRow.id,
        period_start: from,
        period_end:   to,
        status:       periodRow.status,
      },
      trial_balance,
      income_summary,
      balance_summary,
      cash_summary,
      readiness: {
        trial_balance_ok,
        bs_balanced,
        period_closed,
        snapshot_complete,
      },
      generated_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[period-snapshot]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
