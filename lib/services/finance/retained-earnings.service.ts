// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/retained-earnings.service.ts
//
// Retained Earnings Statement — formal equity roll-forward.
//
// Required for board meetings and annual reports.
// Shows the sequence:
//   Opening RE → +Net Income → -Legal Reserve (TTK 519) → -Dividends → Closing RE
//
// Data sources:
//   - Opening RE:   balance sheet as of Dec 31 prior year
//   - Net income:   FinanceService.getFinancialSummary for Jan–now
//   - Legal reserve: 5% of net income (only when net income > 0)
//   - Dividends:    workflow_instances where workflow_type = 'dividend_declaration'
//                   AND status = 'approved', extract amount from payload
//   - Cross-check:  BalanceSheetService.compute(today) → equity.total_equity_try
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import { FinanceService } from '@/lib/services/finance.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface RetainedEarningsStatement {
  period_from: string              // Jan 1 of year
  period_to: string                // current date or Dec 31

  opening_retained_earnings_try: number  // from prior year close

  // Changes during period
  net_income_try: number                  // from FinanceService
  legal_reserve_transfer_try: number      // 5% of net income (TTK 519), 0 on loss
  dividends_declared_try: number          // from approved dividend_declaration workflows
  other_adjustments_try: number           // catch-all for manual adjustments (always 0 here)

  closing_retained_earnings_try: number   // opening + net_income - legal_reserve - dividends + other

  // Cross-check with balance sheet
  balance_sheet_equity_try: number | null  // from BalanceSheetService
  discrepancy_try: number | null           // closing - balance_sheet (should be ~0)

  // Cumulative legal reserve YTD
  legal_reserve_ytd_try: number

  computed_at: string
}

export class RetainedEarningsService {
  static async getStatement(
    companyId: string,
    uid: string,
    supabase: AnyClient,
    year: number,
  ): Promise<RetainedEarningsStatement> {
    const today = new Date().toISOString().slice(0, 10)
    const periodFrom = `${year}-01-01`
    const periodTo   = today.slice(0, 4) === String(year)
      ? today
      : `${year}-12-31`

    // ── 1. Opening retained earnings: equity from Dec 31 prior year ──────────────
    let opening_retained_earnings_try = 0
    try {
      const priorYearEnd = `${year - 1}-12-31`
      const priorBS = await BalanceSheetService.compute(uid, companyId, priorYearEnd, supabase)
      // Retained earnings from prior year = retained_earnings_try + current_period_profit_try
      // (the balance sheet folds profit into equity on close)
      opening_retained_earnings_try = round2(
        priorBS.equity.retained_earnings_try + priorBS.equity.current_period_profit_try
      )
    } catch {
      opening_retained_earnings_try = 0
    }

    // ── 2. Net income for the period ─────────────────────────────────────────────
    let net_income_try = 0
    try {
      const summary = await FinanceService.getFinancialSummary(
        uid, companyId,
        { from: periodFrom, to: periodTo },
        undefined, undefined, supabase,
      )
      net_income_try = round2(summary.net_after_tax_try)
    } catch {
      net_income_try = 0
    }

    // ── 3. Legal reserve: 5% of net income only when net income > 0 (TTK 519) ───
    const legal_reserve_transfer_try = net_income_try > 0
      ? round2(net_income_try * 0.05)
      : 0

    // YTD legal reserve = same value (cumulative within year)
    const legal_reserve_ytd_try = legal_reserve_transfer_try

    // ── 4. Dividends declared: approved workflow_instances ───────────────────────
    let dividends_declared_try = 0
    try {
      const { data: workflows } = await supabase
        .from('workflow_instances')
        .select('payload, created_at')
        .eq('company_id', companyId)
        .eq('workflow_type', 'dividend_declaration')
        .eq('status', 'approved')
        .gte('created_at', `${year}-01-01T00:00:00.000Z`)
        .lte('created_at', `${year}-12-31T23:59:59.999Z`)

      for (const wf of (workflows ?? [])) {
        // payload structure may have total_try, amount_try, gross_dividend_try, etc.
        const p = (wf.payload ?? {}) as Record<string, unknown>
        const amount =
          (typeof p.total_try         === 'number' ? p.total_try : 0) ||
          (typeof p.amount_try        === 'number' ? p.amount_try : 0) ||
          (typeof p.gross_dividend_try === 'number' ? p.gross_dividend_try : 0) ||
          (typeof p.net_dividend_try  === 'number' ? p.net_dividend_try : 0)
        dividends_declared_try += Number(amount) || 0
      }
      dividends_declared_try = round2(dividends_declared_try)
    } catch {
      dividends_declared_try = 0
    }

    // ── 5. Other adjustments (always 0 for system-computed) ──────────────────────
    const other_adjustments_try = 0

    // ── 6. Closing retained earnings ─────────────────────────────────────────────
    const closing_retained_earnings_try = round2(
      opening_retained_earnings_try
      + net_income_try
      - legal_reserve_transfer_try
      - dividends_declared_try
      + other_adjustments_try
    )

    // ── 7. Cross-check with balance sheet ────────────────────────────────────────
    let balance_sheet_equity_try: number | null = null
    let discrepancy_try: number | null = null
    try {
      const bs = await BalanceSheetService.compute(uid, companyId, periodTo, supabase)
      balance_sheet_equity_try = round2(bs.equity.total_equity_try)
      discrepancy_try = round2(closing_retained_earnings_try - balance_sheet_equity_try)
    } catch {
      balance_sheet_equity_try = null
      discrepancy_try = null
    }

    return {
      period_from:                     periodFrom,
      period_to:                       periodTo,
      opening_retained_earnings_try,
      net_income_try,
      legal_reserve_transfer_try,
      dividends_declared_try,
      other_adjustments_try,
      closing_retained_earnings_try,
      balance_sheet_equity_try,
      discrepancy_try,
      legal_reserve_ytd_try,
      computed_at: new Date().toISOString(),
    }
  }
}
