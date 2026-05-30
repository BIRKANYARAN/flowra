// ─────────────────────────────────────────────────────────────────────────────
// lib/services/balance-sheet.service.ts — Balance Sheet computation
//
// Produces a point-in-time Balance Sheet from existing Flowra data.
// Approximation notes:
//   - Cash is estimated from cash flows (collected sales + partner flows - expenses)
//   - Tax payable is estimated from current-period tax computation
//   - Non-current assets are not tracked (equipment, deposits → future phase)
//   - Invariant Assets = Liabilities + Equity may not be perfect due to accrual/cash mix
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import { PartnerService } from './partner.service'
import { TaxService } from './tax.service'
import { FinanceService } from './finance.service'
import type { BalanceSheet } from '@/types/dto'

// Any-typed client to avoid strict generic requirements
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ─────────────────────────────────────────────────────────────────────────────
// Pure formatting & validation helpers (no I/O, fully testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a balance sheet line amount for display.
 * Contra accounts (e.g. accumulated depreciation) are shown as negative values.
 */
export function formatBsAmount(amount: number, isContra: boolean): string {
  const value = isContra ? -Math.abs(amount) : amount
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Validate the fundamental balance sheet invariant:
 *   Assets = Liabilities + Equity
 * Returns balanced=true when |discrepancy| < 0.01 (penny tolerance).
 */
export function validateBsInvariant(
  totalAssets: number,
  totalLiabilities: number,
  totalEquity: number,
): { balanced: boolean; discrepancy: number } {
  const discrepancy = round2(totalAssets - (totalLiabilities + totalEquity))
  return { balanced: Math.abs(discrepancy) < 0.01, discrepancy }
}

/**
 * Compute the current ratio (currentAssets / currentLiabilities).
 * Returns null when currentLiabilities is zero (division-by-zero guard).
 */
export function computeCurrentRatio(currentAssets: number, currentLiabilities: number): number | null {
  if (currentLiabilities === 0) return null
  return round2(currentAssets / currentLiabilities)
}

/**
 * Compute the debt-to-equity ratio (totalLiabilities / totalEquity).
 * Returns null when totalEquity is zero or negative.
 */
export function computeDebtToEquity(totalLiabilities: number, totalEquity: number): number | null {
  if (totalEquity <= 0) return null
  return round2(totalLiabilities / totalEquity)
}

export class BalanceSheetService {
  /**
   * Compute the Balance Sheet as-of a given date for a company.
   * Uses all-time data up to `asOfDate` to build the snapshot.
   */
  static async compute(
    userId:    string,
    companyId: string,
    asOfDate:  string,   // YYYY-MM-DD
    supabase:  AnyClient,
  ): Promise<BalanceSheet> {
    const asOfTs = asOfDate + 'T23:59:59Z'

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      partnerBalances,
      receivablesResult,
      inventoryResult,
      cashInflowsResult,
      cashExpensesResult,
      partnerFlowsResult,
    ] = await Promise.all([
      // Partner balances: capital, loans, repayments, dividends
      PartnerService.getPartnerBalances(userId, companyId).catch(() => []),

      // Receivables: unpaid/partial/overdue sales up to asOfDate.
      // Use sale_date (business invoice date), not created_at (DB insertion time).
      (supabase as SupabaseClient)
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .lte('sale_date', asOfDate),

      // Inventory: FIFO stock value (qty_remaining × cost_price_try).
      // Filter by received_at (stock lot receipt date).
      (supabase as SupabaseClient)
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0)
        .lte('received_at', asOfDate),

      // Cash in: all paid sales (collected cash) up to asOfDate.
      (supabase as SupabaseClient)
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['paid', 'partial'])
        .lte('sale_date', asOfDate),

      // Cash out: all paid expenses
      (supabase as SupabaseClient)
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .lte('expense_date', asOfDate),

      // Partner cash flows: capital, loans, repayments, dividends
      (supabase as SupabaseClient)
        .from('partner_transactions')
        .select('tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('tx_date', asOfDate),
    ])

    // ── Compute receivables ───────────────────────────────────────────────────
    const receivables_try = round2(
      (receivablesResult.data ?? []).reduce((sum: number, r: { total_try: number; amount_paid: number }) => {
        const outstanding = r.total_try - (r.amount_paid ?? 0)
        return sum + Math.max(0, outstanding)
      }, 0)
    )

    // ── Compute inventory (FIFO) ──────────────────────────────────────────────
    const inventory_try = round2(
      (inventoryResult.data ?? []).reduce((sum: number, lot: { qty_remaining: number; cost_price_try: number }) =>
        sum + (Number(lot.qty_remaining) || 0) * (Number(lot.cost_price_try) || 0), 0
      )
    )

    // ── Compute cash position ─────────────────────────────────────────────────
    // Cash in from sales
    let collected_try = 0
    for (const s of (cashInflowsResult.data ?? [])) {
      if (s.payment_status === 'paid') collected_try += s.total_try
      else collected_try += (s.amount_paid ?? 0)   // partial
    }

    // Cash out from expenses
    const paid_expenses_try = (cashExpensesResult.data ?? []).reduce(
      (sum: number, e: { amount_try: number }) => sum + (e.amount_try ?? 0), 0
    )

    // Cash flows from partner transactions
    let partner_capital_in  = 0
    let partner_loans_in    = 0
    let partner_loans_out   = 0
    let partner_dividends   = 0

    for (const tx of (partnerFlowsResult.data ?? [])) {
      const amt = tx.amount_try ?? 0
      switch (tx.tx_type) {
        case 'capital_in':                          partner_capital_in += amt; break
        case 'loan_to_company': case 'loan_in':     partner_loans_in   += amt; break
        case 'loan_repayment':  case 'loan_out':    partner_loans_out  += amt; break
        case 'dividend':        case 'salary': case 'board_fee': partner_dividends += amt; break
      }
    }

    const cash_try = round2(
      collected_try
      - paid_expenses_try
      + partner_capital_in
      + partner_loans_in
      - partner_loans_out
      - partner_dividends
    )

    // ── Assets ────────────────────────────────────────────────────────────────
    const total_current_assets    = round2(Math.max(0, cash_try) + receivables_try + inventory_try)
    const total_non_current_assets = 0   // equipment not tracked yet
    const total_assets_try         = round2(total_current_assets + total_non_current_assets)

    // ── Liabilities ───────────────────────────────────────────────────────────
    const total_partner_loans_try = round2(
      (partnerBalances as Array<{ net_loan_try: number }>)
        .reduce((sum, b) => sum + Math.max(0, b.net_loan_try), 0)
    )

    // Simplified tax payable estimate (period-to-date)
    let tax_payable_try = 0
    try {
      const taxResult = await TaxService.getCorporateTax(
        userId, companyId,
        { from: asOfDate.slice(0, 4) + '-01-01', to: asOfDate },
      )
      tax_payable_try = round2(Math.max(0, taxResult.tax_try))
    } catch {
      tax_payable_try = 0
    }

    const total_current_liabilities = round2(total_partner_loans_try + tax_payable_try)
    const total_liabilities_try      = round2(total_current_liabilities)

    // ── Equity ────────────────────────────────────────────────────────────────
    const partner_capital_lines = (partnerBalances as Array<{
      partner_id:   string
      partner_name: string
      total_capital_try: number
      share_ratio:  number
    }>).map(b => ({
      partner_id:   b.partner_id,
      partner_name: b.partner_name,
      capital_try:  b.total_capital_try,
      share_ratio:  b.share_ratio,
    }))

    const total_partner_capital_try = round2(
      partner_capital_lines.reduce((sum, p) => sum + p.capital_try, 0)
    )

    // Retained earnings from closed periods (0 until period locking is active)
    const retained_earnings_try = 0

    // Current period profit from P&L (accrual basis)
    let current_period_profit_try = 0
    try {
      const summary = await FinanceService.getFinancialSummary(
        userId, companyId,
        { from: asOfDate.slice(0, 4) + '-01-01', to: asOfDate },
        supabase
      )
      current_period_profit_try = round2(summary.net_after_tax_try)
    } catch {
      current_period_profit_try = 0
    }

    const total_equity_try = round2(
      total_partner_capital_try + retained_earnings_try + current_period_profit_try
    )

    // ── Invariant check ───────────────────────────────────────────────────────
    const imbalance_try = round2(total_assets_try - (total_liabilities_try + total_equity_try))
    const balanced = Math.abs(imbalance_try) < 100   // within ₺100 tolerance

    return {
      as_of_date:  asOfDate,
      computed_at: new Date().toISOString(),
      assets: {
        cash_try:              round2(Math.max(0, cash_try)),
        receivables_try,
        inventory_try,
        other_current_try:     0,
        total_current_try:     total_current_assets,
        equipment_try:         0,
        deposits_try:          0,
        other_non_current_try: 0,
        total_non_current_try: 0,
        total_assets_try,
      },
      liabilities: {
        partner_loans_try:           total_partner_loans_try,
        tax_payable_try,
        other_current_payables_try:  0,
        total_current_try:           total_current_liabilities,
        partner_loans_long_term_try: 0,
        other_non_current_try:       0,
        total_non_current_try:       0,
        total_liabilities_try,
      },
      equity: {
        partner_capital_lines,
        total_partner_capital_try,
        retained_earnings_try,
        current_period_profit_try,
        total_equity_try,
      },
      balanced,
      imbalance_try,
    }
  }
}
