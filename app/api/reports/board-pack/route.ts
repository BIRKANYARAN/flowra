// ── GET /api/reports/board-pack?period=2026-04 ────────────────────────────────
//
// Sprint 5 "Document Philosophy" — board pack assembly in one action.
//
// Returns a structured JSON board package covering:
//   - executive_summary  (SituationEngine)
//   - balance_sheet      (BalanceSheetService)
//   - cash_flow          (CashFlowStatementService)
//   - period_pnl         (FinanceService)
//   - key_ratios         (computed from above)
//   - decision_alerts    (top 5 critical/warning via AlertEngine)
//   - partner_summary    (equity + loan totals per partner)
//
// Authentication: resolveApiAuth required.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse }    from 'next/server'
import { resolveApiAuth }               from '@/lib/api-auth'
import { reqCtx, apiError }             from '@/lib/api-utils'
import { BalanceSheetService }          from '@/lib/services/balance-sheet.service'
import { CashFlowStatementService }     from '@/lib/services/cashflow-statement.service'
import { FinanceService }               from '@/lib/services/finance.service'
import { PartnerEquityService }         from '@/lib/services/partner-equity.service'
import { computeSituation }             from '@/lib/engines/situation.engine'
import { evaluateAlerts }               from '@/lib/engines/alert.engine'
import type { SituationInputs }         from '@/lib/engines/situation.engine'
import type { AlertInputs }             from '@/lib/engines/alert.engine'

export const dynamic = 'force-dynamic'

// ── GET handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // ── Period resolution ─────────────────────────────────────────────────────
    // Accepts ?period=YYYY-MM; defaults to current month.
    const now    = new Date()
    const params = req.nextUrl.searchParams
    let period   = params.get('period')

    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }

    const [y, m]  = period.split('-')
    const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate()
    const from    = `${period}-01`
    const asOf    = `${period}-${String(lastDay).padStart(2, '0')}`
    const to      = asOf

    // ── Company name ──────────────────────────────────────────────────────────
    const { data: coRow } = await supabase
      .from('companies').select('name').eq('id', companyId).single()
    const companyName = coRow?.name ?? 'Şirket'

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [bsResult, cfResult, pnlResult, partnerResult] = await Promise.allSettled([
      BalanceSheetService.compute(uid, companyId, asOf, supabase),
      CashFlowStatementService.compute(uid, companyId, { from, to }, supabase),
      FinanceService.getFinancialSummary(uid, companyId, { from, to }, undefined, undefined, supabase),
      PartnerEquityService.getPartnerBalances(uid, companyId, undefined, supabase),
    ])

    const bs       = bsResult.status      === 'fulfilled' ? bsResult.value      : null
    const cf       = cfResult.status      === 'fulfilled' ? cfResult.value      : null
    const pnl      = pnlResult.status     === 'fulfilled' ? pnlResult.value     : null
    const partners = partnerResult.status === 'fulfilled' ? partnerResult.value : []

    // ── Key ratios ────────────────────────────────────────────────────────────
    const totalAssets  = bs?.assets.total_assets_try          ?? 0
    const currentAssets = bs?.assets.total_current_try        ?? 0
    const currentLiab  = bs?.liabilities.total_current_try    ?? 0
    const totalLiab    = bs?.liabilities.total_liabilities_try ?? 0
    const equity       = bs?.equity.total_equity_try           ?? 0
    const revenue      = pnl?.revenue_try                      ?? 0
    const grossProfit  = pnl?.gross_profit_try                 ?? 0
    const netIncome    = pnl?.net_after_tax_try                ?? 0

    const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : null
    const debtServiceRatio = revenue > 0
      ? (cf?.financing.net_financing_try ?? 0) / revenue : 0
    const grossMargin  = revenue > 0 ? (grossProfit / revenue) * 100 : null
    const netMargin    = revenue > 0 ? (netIncome / revenue) * 100  : null
    const leverageRatio = totalAssets > 0 ? totalLiab / totalAssets : null

    const key_ratios = {
      current_ratio:     currentRatio   !== null ? Math.round(currentRatio * 100) / 100 : null,
      dsr:               Math.round(Math.abs(debtServiceRatio) * 100) / 100,
      gross_margin_pct:  grossMargin    !== null ? Math.round(grossMargin * 10) / 10 : null,
      net_margin_pct:    netMargin      !== null ? Math.round(netMargin * 10) / 10 : null,
      leverage_ratio:    leverageRatio  !== null ? Math.round(leverageRatio * 100) / 100 : null,
    }

    // ── Situation engine ──────────────────────────────────────────────────────
    const burnRateMonthly = cf ? -cf.operating.net_operating_try : 0
    const cashRunway      = (burnRateMonthly > 0 && (bs?.assets.cash_try ?? 0) > 0)
      ? (bs!.assets.cash_try / burnRateMonthly)
      : 0
    const isProfitable    = netIncome > 0

    // Overdue ratio from partners' net_loan balances — use as proxy until AR aging computed
    const totalLoanFromPartners = partners.reduce((s, p) => s + Math.max(0, p.net_loan_try), 0)
    const maxPartnerLoan        = partners.reduce((s, p) => Math.max(s, Math.max(0, p.net_loan_try)), 0)
    const partnerLoanConc       = totalLoanFromPartners > 0 ? maxPartnerLoan / totalLoanFromPartners : 0

    const sitInputs: SituationInputs = {
      cashRunwayMonths:   cashRunway,
      isProfitable,
      netMarginPct:       netMargin !== null ? netMargin / 100 : 0,
      debtServiceRatio:   Math.abs(debtServiceRatio),
      overdueRatioPct:    0,    // AR aging not computed here — populated by alert engine separately
      maxBurdenScoreAbs:  partnerLoanConc,
    }

    const situation = computeSituation(sitInputs)

    // ── Alert engine ──────────────────────────────────────────────────────────
    const alertInputs: AlertInputs = {
      overdueCount30:           0,
      overdueTotal30:           0,
      overdueCount60:           0,
      overdueTotal60:           0,
      totalReceivables:         bs?.assets.receivables_try ?? 0,
      cashRunwayDays:           isProfitable ? -1 : cashRunway * 30,
      monthlyNetIncome:         netIncome,
      maxBurdenScoreAbs:        partnerLoanConc,
      nextTrancheDueDays:       -1,
      nextTrancheAmount:        0,
      openPeriodDaysOverdue:    -1,
      kdvPayable:               pnl?.net_vat_try ?? 0,
      taxDueDays:               -1,
      bsImbalanceTry:           bs?.imbalance_try ?? 0,
      legalReserveDeficit:      0,
      equityGapTry:             equity < 0 ? Math.abs(equity) : 0,
      equityCallOverdueDays:    -1,
      debtServiceRatio:         Math.abs(debtServiceRatio),
      partnerLoanConcentration: partnerLoanConc,
    }

    const allAlerts     = evaluateAlerts(alertInputs)
    const decisionAlerts = allAlerts
      .filter(a => a.severity === 'critical' || a.severity === 'warning')
      .slice(0, 5)

    // ── Partner summary ───────────────────────────────────────────────────────
    const partner_summary = partners.map(p => ({
      partner_id:        p.partner_id,
      partner_name:      p.partner_name,
      share_ratio:       p.share_ratio,
      equity_try:        p.total_capital_try,
      net_loan_try:      p.net_loan_try,
      total_contributed: p.total_contributed_try,
      total_distributed: p.total_distributed_try,
    }))

    // ── Response ──────────────────────────────────────────────────────────────
    return NextResponse.json({
      period,
      generated_at: new Date().toISOString(),
      company_name: companyName,
      data: {
        executive_summary: {
          status:          situation.status,
          composite_score: situation.composite,
          situation_line:  situation.situationLine,
          critical_factor: situation.criticalFactor,
          scores:          situation.scores,
        },
        balance_sheet: bs ? {
          as_of_date:        bs.as_of_date,
          total_assets:      bs.assets.total_assets_try,
          total_liabilities: bs.liabilities.total_liabilities_try,
          total_equity:      bs.equity.total_equity_try,
          cash:              bs.assets.cash_try,
          receivables:       bs.assets.receivables_try,
          inventory:         bs.assets.inventory_try,
          balanced:          bs.balanced,
          imbalance_try:     bs.imbalance_try,
        } : null,
        cash_flow: cf ? {
          period:            cf.period,
          operating:         cf.operating.net_operating_try,
          investing:         cf.investing.net_investing_try,
          financing:         cf.financing.net_financing_try,
          net_change:        cf.net_change_try,
          closing_balance:   cf.closing_balance_try,
        } : null,
        period_pnl: pnl ? {
          period:            pnl.period,
          revenue:           pnl.revenue_try,
          cogs:              pnl.cost_try,
          gross_profit:      pnl.gross_profit_try,
          expenses:          pnl.expenses_total_try,
          ebitda:            pnl.gross_profit_try - pnl.expenses_total_try,
          corporate_tax:     pnl.corporate_tax_try,
          net_income:        pnl.net_after_tax_try,
          net_vat:           pnl.net_vat_try,
        } : null,
        key_ratios,
        decision_alerts:  decisionAlerts,
        partner_summary,
        document_links: {
          balance_sheet:     `/documents/balance-sheet/${period}`,
          income_statement:  `/documents/income-statement/${period}`,
        },
      },
    })
  } catch (e) {
    console.error('[board-pack]', e)
    return apiError(ctx, 'Yönetim paketi oluşturulamadı', 500, 'BOARD_PACK_FAILED')
  }
}
