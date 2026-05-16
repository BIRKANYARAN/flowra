// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/pcle.engine.ts — PCLE Orchestrator
//
// Fetches all partner financial data and computes:
//   - Partner positions (equity + loans + distributions)
//   - Two-phase waterfall
//   - Distributable profit (4-layer safety)
//   - Risk profiles (6-dimension)
//   - Turkish compliance warnings
//
// All heavy lifting is delegated to pure context modules:
//   pcle.liability.ts | pcle.distribution.ts | pcle.equity.ts | pcle.risk.ts
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'
import { PCLELiability, type PartnerLoanInput } from './pcle.liability'
import { PCLEDistribution } from './pcle.distribution'
import { PCLEEquity } from './pcle.equity'
import { PCLERisk } from './pcle.risk'
import type { RepaymentWaterfall, DebtTranche } from '@/types/dto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export interface PartnerPosition {
  partner_id:             string
  partner_name:           string
  share_ratio:            number
  is_active:              boolean
  total_loaned_try:       number
  total_repaid_try:       number
  net_loan_try:           number
  total_capital_try:      number
  total_distributed_try:  number  // dividends + compensation
  burden_score_pct:       number  // signed: positive = overfinanced
  first_loan_date:        string | null
  days_outstanding:       number
}

export interface PCLEState {
  positions:              PartnerPosition[]
  waterfall:              RepaymentWaterfall
  distribution_layers:    ReturnType<typeof PCLEDistribution.computeDistributable>
  per_partner_distribution: ReturnType<typeof PCLEDistribution.computePerPartnerDistribution>
  risk_summary:           ReturnType<typeof PCLERisk.computePartnerRisks>
  compliance_warnings:    ReturnType<typeof PCLEDistribution.checkCompliance>
  equity_state:           ReturnType<typeof PCLEEquity.computeFromTransactions>
  available_cash_try:     number
}

export class PCLEEngine {
  /**
   * Fetch all partner data and compute full PCLE state.
   */
  static async compute(
    companyId: string,
    supabase: AnyClient,
    options: {
      available_cash_try:     number
      net_income_try?:        number  // last 12 months net income (for risk scoring)
      board_retained_try?:    number
      dividend_requested_try?:number
      paid_in_capital_try?:   number
      existing_reserves_try?: number
    },
  ): Promise<PCLEState> {
    const {
      available_cash_try,
      net_income_try        = 0,
      board_retained_try    = 0,
      dividend_requested_try = 0,
    } = options

    // ── Fetch base data ────────────────────────────────────────────────────────
    // Dual-source: legacy partner_transactions + new immutable partner_finance_events
    const [partnersRes, txRes, pcleRes] = await Promise.all([
      supabase
        .from('partners')
        .select('id, name, share_ratio, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      supabase
        .from('partner_transactions')
        .select('partner_id, tx_type, amount_try, tx_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('tx_date', { ascending: true }),

      // New PCLE immutable event ledger (partner_finance_events)
      supabase
        .from('partner_finance_events')
        .select('partner_id, event_type, amount_try, event_date')
        .eq('company_id', companyId)
        .order('event_date', { ascending: true }),
    ])

    const partners: Array<{ id: string; name: string; share_ratio: number; is_active: boolean }> =
      partnersRes.data ?? []
    const txs: Array<{ partner_id: string; tx_type: string; amount_try: number; tx_date: string }> =
      txRes.data ?? []
    const pcleEvents: Array<{ partner_id: string; event_type: string; amount_try: number; event_date: string }> =
      pcleRes.data ?? []

    // ── Aggregate per partner ──────────────────────────────────────────────────
    type Agg = {
      capital:       number
      loaned:        number
      repaid:        number
      dividend:      number
      salary:        number
      firstLoanDate: string | null
    }
    const agg = new Map<string, Agg>()
    for (const p of partners) {
      agg.set(p.id, { capital: 0, loaned: 0, repaid: 0, dividend: 0, salary: 0, firstLoanDate: null })
    }

    // Aggregate from legacy partner_transactions
    for (const tx of txs) {
      const a = agg.get(tx.partner_id)
      if (!a) continue
      const amt = Number(tx.amount_try)
      switch (tx.tx_type) {
        case 'capital_in':                              a.capital  += amt; break
        case 'loan_to_company': case 'loan_in':
          a.loaned += amt
          if (!a.firstLoanDate) a.firstLoanDate = tx.tx_date
          break
        case 'loan_repayment': case 'loan_out':         a.repaid   += amt; break
        case 'dividend':                                a.dividend += amt; break
        case 'salary': case 'board_fee':                a.salary   += amt; break
      }
    }

    // Aggregate from new PCLE immutable event ledger (partner_finance_events)
    for (const ev of pcleEvents) {
      const a = agg.get(ev.partner_id)
      if (!a) continue
      const amt = Number(ev.amount_try)
      switch (ev.event_type) {
        case 'EQUITY_PAYMENT':
          a.capital += amt; break
        case 'LOAN_DISBURSEMENT':
          a.loaned += amt
          if (!a.firstLoanDate) a.firstLoanDate = ev.event_date
          break
        case 'LOAN_REPAYMENT':
          a.repaid += amt; break
        case 'DIVIDEND_PAID':
          a.dividend += amt; break
        case 'COMPENSATION_PAYMENT':
          a.salary += amt; break
        // EQUITY_COMMITMENT, LOAN_INTEREST_ACCRUAL, DIVIDEND_DECLARED → not cash movements
      }
    }

    const today = new Date()

    // ── Build positions ────────────────────────────────────────────────────────
    const positions: PartnerPosition[] = partners.map(p => {
      const a        = agg.get(p.id)!
      const net_loan = round2(a.loaned - a.repaid)
      const days_outstanding = a.firstLoanDate
        ? Math.floor((today.getTime() - new Date(a.firstLoanDate).getTime()) / 86_400_000)
        : 0

      return {
        partner_id:            p.id,
        partner_name:          p.name,
        share_ratio:           Number(p.share_ratio),
        is_active:             p.is_active,
        total_loaned_try:      round2(a.loaned),
        total_repaid_try:      round2(a.repaid),
        net_loan_try:          round2(Math.max(0, net_loan)),
        total_capital_try:     round2(a.capital),
        total_distributed_try: round2(a.dividend + a.salary),
        burden_score_pct:      0,  // filled below
        first_loan_date:       a.firstLoanDate,
        days_outstanding,
      }
    })

    // ── Compute burden scores (needs all positions) ────────────────────────────
    const loanInputs: PartnerLoanInput[] = positions.map(p => ({
      partner_id:      p.partner_id,
      partner_name:    p.partner_name,
      share_ratio:     p.share_ratio,
      net_loan:        p.net_loan_try,
      total_loaned:    p.total_loaned_try,
      total_repaid:    p.total_repaid_try,
      first_loan_date: p.first_loan_date,
    }))

    const burdens = PCLELiability.computeBurdenScores(loanInputs)
    const burdenMap = new Map(burdens.map(b => [b.partner_id, b.burden_pct]))
    for (const pos of positions) {
      pos.burden_score_pct = burdenMap.get(pos.partner_id) ?? 0
    }

    // ── Compute waterfall ──────────────────────────────────────────────────────
    const waterfallResult = PCLELiability.computeWaterfall(available_cash_try, loanInputs)

    // Build RepaymentWaterfall DTO (compatible with existing types/dto.ts)
    const tranches: DebtTranche[] = positions
      .filter(p => p.total_loaned_try > 0)
      .map(p => {
        const status: DebtTranche['status'] =
          p.net_loan_try <= 0              ? 'repaid'
          : p.total_repaid_try > 0         ? 'partially_repaid'
          : p.days_outstanding > 365       ? 'overdue'
          : 'active'

        return {
          id:                       p.partner_id,
          partner_id:               p.partner_id,
          partner_name:             p.partner_name,
          principal_try:            p.total_loaned_try,
          interest_rate_annual_pct: 0,
          disbursement_date:        p.first_loan_date ?? today.toISOString().slice(0, 10),
          expected_repayment_date:  undefined,
          actual_repaid_try:        p.total_repaid_try,
          accrued_interest_try:     0,
          remaining_principal_try:  round2(Math.max(0, p.net_loan_try)),
          status,
          days_outstanding:         p.days_outstanding,
        }
      })

    const waterfall: RepaymentWaterfall = {
      available_cash_try,
      tranches,
      steps:                waterfallResult.steps,
      total_debt_try:       waterfallResult.total_debt_try,
      remaining_after_debt: waterfallResult.remaining_after_debt,
      debt_clearance_months:waterfallResult.debt_clearance_months,
    }

    // ── Compute distribution ───────────────────────────────────────────────────
    const capitalInByPartner = new Map(positions.map(p => [p.partner_id, p.total_capital_try]))

    const equityState = PCLEEquity.computeFromTransactions(
      partners.map(p => ({ id: p.id, name: p.name, share_ratio: Number(p.share_ratio) })),
      capitalInByPartner,
    )

    const distribution_layers = PCLEDistribution.computeDistributable({
      gross_net_income_try:   net_income_try,
      paid_in_capital_try:    options.paid_in_capital_try ?? equityState.total_paid_in_try,
      existing_reserves_try:  options.existing_reserves_try ?? 0,
      board_retained_try:     board_retained_try,
      unpaid_compensation_try: 0,  // computed from schedules in full implementation
    })

    const per_partner_distribution = PCLEDistribution.computePerPartnerDistribution(
      distribution_layers.distributable_net_try,
      partners
        .filter(p => p.is_active)
        .map(p => ({ partner_id: p.id, partner_name: p.name, share_ratio: Number(p.share_ratio) })),
    )

    // ── Compute risk ───────────────────────────────────────────────────────────
    const riskParams = positions.map(p => ({
      id:               p.partner_id,
      name:             p.partner_name,
      share_ratio:      p.share_ratio,
      net_loan:         p.net_loan_try,
      days_outstanding: p.days_outstanding,
      equity_paid:      p.total_capital_try,
    }))

    const risk_summary = PCLERisk.computePartnerRisks({
      partners:              riskParams,
      total_debt_try:        waterfallResult.total_debt_try,
      net_income_try:        net_income_try,
      monthly_debt_service:  0,  // filled when interest tracking is available
      compliance_issue_count: new Map(),
    })

    // ── Compute compliance warnings ────────────────────────────────────────────
    const compliance_warnings = PCLEDistribution.checkCompliance({
      partner_loans: positions.map(p => ({
        net_loan:        p.net_loan_try,
        first_loan_date: p.first_loan_date,
        interest_rate:   0,
      })),
      huzur_payments: [],  // filled when compensation schedules tracked
      existing_reserves_try: options.existing_reserves_try ?? 0,
      paid_in_capital_try:   options.paid_in_capital_try ?? equityState.total_paid_in_try,
      gross_net_income_try:  net_income_try,
      dividend_requested_try,
    })

    return {
      positions,
      waterfall,
      distribution_layers,
      per_partner_distribution,
      risk_summary,
      compliance_warnings,
      equity_state:      equityState,
      available_cash_try,
    }
  }
}
