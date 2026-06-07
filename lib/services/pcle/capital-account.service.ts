// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/capital-account.service.ts
//
// Stakeholder Capital Accounts — pure computation layer.
//
// Computes per-partner capital account statements from:
//   - partner_finance_events  (immutable PCLE event ledger)
//   - partner_loan_tranches   (outstanding loan positions)
//   - partners                (share_ratio for book equity)
//
// Accounting facts are clearly separated from hypothetical exit simulations.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface PartnerCapitalAccount {
  // Identity
  partner_id:   string
  partner_name: string
  share_ratio:  number
  is_active:    boolean

  // ── ACCOUNTING FACTS ─────────────────────────────────────────────────────

  /** Total equity contributed (sum of EQUITY_PAYMENT events) */
  equity_contributed_try:     number

  /** Total received back: distributions (DIVIDEND_PAID + COMPENSATION_PAYMENT) + LOAN_REPAYMENT */
  total_received_try:         number

  /** Components of total_received */
  distributions_received_try: number   // DIVIDEND_PAID + COMPENSATION_PAYMENT
  loan_repayments_received_try: number // LOAN_REPAYMENT events

  /** Net invested = equity_contributed − total_received */
  net_invested_try:           number

  /** Book equity = total_company_equity × share_ratio */
  book_equity_try:            number

  /** Outstanding loan balance from partner_loan_tranches */
  loan_balance_try:           number

  /** Net position = book_equity − loan_balance */
  net_position_try:           number

  // ── Used for exit simulation inputs ─────────────────────────────────────
  /** Total loans disbursed to company (LOAN_DISBURSEMENT events) */
  total_loaned_try:           number
}

export interface ExitScenario {
  valuation_multiple:      number
  enterprise_value_try:    number
  senior_claims_try:       number
  distributable_value_try: number
  per_partner: Array<{
    partner_id:        string
    partner_name:      string
    share_ratio:       number
    exit_value_try:    number
    net_exit_gain_try: number  // exit_value − net_invested (can be negative)
  }>
}

export interface CapitalAccountResult {
  accounts:             PartnerCapitalAccount[]
  total_equity_try:     number
  total_partner_debt_try: number
  computed_at:          string
}

// ── Raw DB types (internal) ────────────────────────────────────────────────────

interface PartnerRow {
  id:          string
  name:        string
  share_ratio: number
  is_active:   boolean
}

interface FinanceEventRow {
  partner_id:  string
  event_type:  string
  amount_try:  number
}

interface LoanTrancheRow {
  partner_id:      string
  outstanding_try: number
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CapitalAccountService {
  /**
   * Compute capital accounts for all partners in a company.
   *
   * @param companyId    - company UUID
   * @param supabase     - authenticated Supabase client
   * @param totalEquity  - total company equity (from BalanceSheetService or caller)
   */
  static async compute(
    companyId: string,
    supabase:  AnyClient,
    totalEquity: number,
  ): Promise<CapitalAccountResult> {

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [partnersRes, eventsRes, tranchesRes] = await Promise.all([
      supabase
        .from('partners')
        .select('id, name, share_ratio, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      supabase
        .from('partner_finance_events')
        .select('partner_id, event_type, amount_try')
        .eq('company_id', companyId),

      supabase
        .from('partner_loan_tranches')
        // outstanding_try is computed (no such column): principal_try − total_repaid_try
        .select('partner_id, principal_try, total_repaid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('status', 'repaid'),
    ])

    const partners: PartnerRow[]       = partnersRes.data  ?? []
    const events: FinanceEventRow[]    = eventsRes.data    ?? []
    const tranches: LoanTrancheRow[]   = ((tranchesRes.data ?? []) as Array<{ partner_id: string; principal_try: number; total_repaid_try: number }>)
      .map(r => ({ partner_id: r.partner_id, outstanding_try: Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)) }))

    // ── Aggregate per-partner from events ─────────────────────────────────────
    type Agg = {
      equity_contributed:       number
      distributions_received:   number   // DIVIDEND_PAID + COMPENSATION_PAYMENT
      loan_repayments_received: number   // LOAN_REPAYMENT
      total_loaned:             number   // LOAN_DISBURSEMENT
    }

    const agg = new Map<string, Agg>()
    for (const p of partners) {
      agg.set(p.id, {
        equity_contributed:       0,
        distributions_received:   0,
        loan_repayments_received: 0,
        total_loaned:             0,
      })
    }

    for (const ev of events) {
      const a = agg.get(ev.partner_id)
      if (!a) continue
      const amt = Number(ev.amount_try) || 0

      switch (ev.event_type) {
        case 'EQUITY_PAYMENT':
          a.equity_contributed += amt
          break
        case 'DIVIDEND_PAID':
        case 'COMPENSATION_PAYMENT':
          a.distributions_received += amt
          break
        case 'LOAN_REPAYMENT':
          a.loan_repayments_received += amt
          break
        case 'LOAN_DISBURSEMENT':
          a.total_loaned += amt
          break
        // EQUITY_COMMITMENT, LOAN_INTEREST_ACCRUAL, DIVIDEND_DECLARED → non-cash, skip
      }
    }

    // ── Aggregate outstanding loan balance from tranches ───────────────────────
    const loanBalanceMap = new Map<string, number>()
    for (const t of tranches) {
      const current = loanBalanceMap.get(t.partner_id) ?? 0
      loanBalanceMap.set(t.partner_id, round2(current + (Number(t.outstanding_try) || 0)))
    }

    // ── Compute total partner debt (for exit scenario senior claims) ───────────
    let totalPartnerDebt = 0
    for (const [, bal] of loanBalanceMap) {
      totalPartnerDebt = round2(totalPartnerDebt + bal)
    }

    // ── Build accounts ────────────────────────────────────────────────────────
    const accounts: PartnerCapitalAccount[] = partners.map(p => {
      const a = agg.get(p.id)!

      const equity_contributed     = round2(a.equity_contributed)
      const distributions_received = round2(a.distributions_received)
      const loan_repayments_received = round2(a.loan_repayments_received)
      const total_received         = round2(distributions_received + loan_repayments_received)
      const net_invested           = round2(equity_contributed - total_received)
      const book_equity            = round2(Number(p.share_ratio) * totalEquity)
      const loan_balance           = loanBalanceMap.get(p.id) ?? 0
      const net_position           = round2(book_equity - loan_balance)

      return {
        partner_id:                  p.id,
        partner_name:                p.name,
        share_ratio:                 Number(p.share_ratio),
        is_active:                   p.is_active,
        equity_contributed_try:      equity_contributed,
        total_received_try:          total_received,
        distributions_received_try:  distributions_received,
        loan_repayments_received_try: loan_repayments_received,
        net_invested_try:            net_invested,
        book_equity_try:             book_equity,
        loan_balance_try:            loan_balance,
        net_position_try:            net_position,
        total_loaned_try:            round2(a.total_loaned),
      }
    })

    return {
      accounts,
      total_equity_try:       totalEquity,
      total_partner_debt_try: totalPartnerDebt,
      computed_at:            new Date().toISOString(),
    }
  }

  /**
   * Compute a hypothetical exit scenario.
   *
   * THIS IS A SIMULATION — not a current valuation.
   *
   * @param accounts         - computed capital accounts
   * @param totalEquityTry   - total company equity (book value basis)
   * @param totalDebtTry     - total partner debt (senior claims)
   * @param multiple         - enterprise value as a multiple of total equity (e.g. 2.0)
   */
  static computeExitScenario(
    accounts:       PartnerCapitalAccount[],
    totalEquityTry: number,
    totalDebtTry:   number,
    multiple:       number,
  ): ExitScenario {
    const enterprise_value_try    = round2(totalEquityTry * multiple)
    const senior_claims_try       = round2(Math.max(0, totalDebtTry))
    const distributable_value_try = round2(Math.max(0, enterprise_value_try - senior_claims_try))

    const per_partner = accounts.map(acc => {
      const exit_value_try    = round2(distributable_value_try * acc.share_ratio)
      const net_exit_gain_try = round2(exit_value_try - acc.net_invested_try)
      return {
        partner_id:        acc.partner_id,
        partner_name:      acc.partner_name,
        share_ratio:       acc.share_ratio,
        exit_value_try,
        net_exit_gain_try,
      }
    })

    return {
      valuation_multiple:      multiple,
      enterprise_value_try,
      senior_claims_try,
      distributable_value_try,
      per_partner,
    }
  }
}
