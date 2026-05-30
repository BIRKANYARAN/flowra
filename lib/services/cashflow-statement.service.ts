// ─────────────────────────────────────────────────────────────────────────────
// lib/services/cashflow-statement.service.ts — 3-section Cash Flow Statement
//
// Produces a proper GAAP-style Cash Flow Statement:
//   1. Operating: cash from core business (sales collected - expenses paid)
//   2. Investing:  cash from asset transactions (equipment, deposits)
//   3. Financing:  cash from partner transactions (loans, repayments, dividends)
//
// All amounts in TRY. Positive = cash inflow. Negative = cash outflow.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'
import type { CashFlowStatement } from '@/types/dto'
import type { Period } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ─────────────────────────────────────────────────────────────────────────────
// Pure formatting & validation helpers (no I/O, fully testable)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate the cash flow invariant:
 *   openingCash + netChange ≈ closingCash
 * Returns valid=true when |discrepancy| < 0.01.
 */
export function validateCashFlowInvariant(
  openingCash: number,
  netChange: number,
  closingCash: number,
): { valid: boolean; discrepancy: number } {
  const expected = openingCash + netChange
  const discrepancy = round2(closingCash - expected)
  return { valid: Math.abs(discrepancy) < 0.01, discrepancy }
}

/**
 * Classify cash flow health based on operating, investing, and financing sections.
 *
 * - 'strong':        operating > 0 (healthy core business, other sections don't change classification)
 * - 'growing':       operating > 0 AND investing < 0 (investing in growth)
 * - 'restructuring': operating < 0 AND financing > 0 (raising cash to cover shortfall)
 * - 'distressed':    operating < 0 AND financing < 0 (negative on both fronts)
 *
 * Note: 'growing' is a sub-case of 'strong', evaluated first for precision.
 */
export function classifyCashFlowHealth(
  operatingCF: number,
  investingCF: number,
  financingCF: number,
): 'strong' | 'growing' | 'restructuring' | 'distressed' {
  if (operatingCF > 0 && investingCF < 0) return 'growing'
  if (operatingCF > 0) return 'strong'
  if (operatingCF < 0 && financingCF > 0) return 'restructuring'
  return 'distressed'
}

const OPERATING_EXPENSE_TYPES = [
  'operational', 'fixed', 'variable', 'salary', 'rent', 'utilities',
  'marketing', 'logistics', 'software', 'general',
]

const FINANCING_EXPENSE_TYPES = [
  'partner_loan', 'dividend', 'principal', 'interest',
]

export class CashFlowStatementService {
  static async compute(
    userId:    string,
    companyId: string,
    period:    Period,
    supabase:  AnyClient,
  ): Promise<CashFlowStatement> {
    const { from, to } = period
    const toTs = to + 'T23:59:59Z'

    const [
      collectedResult,
      partialResult,
      operatingExpensesResult,
      partnerTxResult,
    ] = await Promise.all([
      // 1. Fully paid sales in period (by paid_at)
      (supabase as SupabaseClient)
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', toTs),

      // 2. Partial payments in period (paid_amount where payment_status=partial)
      // Note: no per-payment timestamp exists for partial payments — using sale_date
      // to approximate which period the partial invoice belongs to. This is conservative:
      // a partial entered in month 2 on an invoice dated month 1 will appear in month 1.
      // FIX: alias paid_amount (active column) as amount_paid for downstream reduce()
      (supabase as SupabaseClient)
        .from('sales')
        .select('amount_paid:paid_amount')
        .eq('company_id', companyId)
        .eq('payment_status', 'partial')
        .is('deleted_at', null)
        .gte('sale_date', from)
        .lte('sale_date', to),

      // 3. Paid operational expenses in period
      (supabase as SupabaseClient)
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to),

      // 4. Partner transactions in period
      (supabase as SupabaseClient)
        .from('partner_transactions')
        .select('tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('tx_date', from)
        .lte('tx_date', to),

    ])

    // ── OPERATING ─────────────────────────────────────────────────────────────

    // Cash collected from customers
    const sales_collected_try = round2(
      (collectedResult.data ?? []).reduce((s: number, r: { total_try: number }) => s + r.total_try, 0) +
      (partialResult.data ?? []).reduce((s: number, r: { amount_paid: number }) => s + (r.amount_paid ?? 0), 0)
    )

    // Separate operating vs financing expenses
    let operating_paid_try  = 0
    let interest_paid_try   = 0

    for (const e of (operatingExpensesResult.data ?? [])) {
      const amt = e.amount_try ?? 0
      if (FINANCING_EXPENSE_TYPES.includes(e.expense_type)) {
        interest_paid_try += amt
      } else {
        operating_paid_try += amt
      }
    }
    operating_paid_try = round2(operating_paid_try)
    interest_paid_try  = round2(interest_paid_try)

    const net_operating_try = round2(sales_collected_try - operating_paid_try - interest_paid_try)

    // ── INVESTING ─────────────────────────────────────────────────────────────
    // Inventory purchases are treated as investing (cash out for assets)
    // We approximate: finalized purchase count → use purchase item totals
    // For now, purchases are tracked via stock_lots; we record cash impact as 0
    // until purchase-level payment tracking is added.
    const equipment_purchases_try = 0   // equipment not tracked yet
    const net_investing_try       = round2(equipment_purchases_try)

    // ── FINANCING ─────────────────────────────────────────────────────────────
    let partner_loans_received_try = 0
    let partner_loans_repaid_try   = 0
    let dividends_paid_try         = 0
    let capital_injected_try       = 0

    for (const tx of (partnerTxResult.data ?? [])) {
      const amt = tx.amount_try ?? 0
      switch (tx.tx_type) {
        case 'capital_in':                       capital_injected_try       += amt; break
        case 'loan_to_company': case 'loan_in':  partner_loans_received_try += amt; break
        case 'loan_repayment':  case 'loan_out': partner_loans_repaid_try   += amt; break
        case 'dividend': case 'salary': case 'board_fee': dividends_paid_try += amt; break
      }
    }
    partner_loans_received_try = round2(partner_loans_received_try)
    partner_loans_repaid_try   = round2(partner_loans_repaid_try)
    dividends_paid_try         = round2(dividends_paid_try)
    capital_injected_try       = round2(capital_injected_try)

    const net_financing_try = round2(
      capital_injected_try
      + partner_loans_received_try
      - partner_loans_repaid_try
      - dividends_paid_try
    )

    // ── Summary ───────────────────────────────────────────────────────────────
    const net_change_try = round2(net_operating_try + net_investing_try + net_financing_try)

    return {
      period,
      operating: {
        net_income_try:         0,    // accrual net income (not used in direct method)
        receivables_change_try: 0,    // would require opening vs closing balance sheet
        inventory_change_try:   0,
        payables_change_try:    0,
        other_adjustments: [
          { label: 'Müşterilerden tahsilat',    amount: sales_collected_try   },
          { label: 'Faiz ve finansman ödemeleri', amount: -interest_paid_try  },
        ],
        net_operating_try,
      },
      investing: {
        equipment_purchases_try,
        other: [],
        net_investing_try,
      },
      financing: {
        partner_loans_received_try,
        partner_loans_repaid_try:  -partner_loans_repaid_try,   // shown as negative
        dividends_paid_try:        -dividends_paid_try,          // shown as negative
        capital_injected_try,
        other: interest_paid_try > 0
          ? [{ label: 'Faiz ödemeleri', amount: -interest_paid_try }]
          : [],
        net_financing_try,
      },
      net_change_try,
      opening_balance_try: 0,   // requires prior period's closing balance
      closing_balance_try: 0,   // requires opening balance
    }
  }
}

