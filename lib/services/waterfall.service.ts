// ─────────────────────────────────────────────────────────────────────────────
// lib/services/waterfall.service.ts — Partner Repayment Waterfall Engine
//
// DELEGATE: This service now delegates to PCLEEngine.
//
// The original "largest-first" algorithm has been replaced with the
// two-phase normalized waterfall (Phase 1: burden normalization,
// Phase 2: pro-rata by share_ratio — see pcle.liability.ts).
//
// This file is kept for backward compatibility with existing routes.
// New code should use PCLEEngine directly.
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'
import { PCLELiability, type PartnerLoanInput } from '@/lib/services/pcle/pcle.liability'
import type { RepaymentWaterfall, DebtTranche, WaterfallStep } from '@/types/dto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export class WaterfallService {
  /**
   * Pure waterfall kernel — no DB access.
   * Delegates to PCLELiability.computeWaterfall (two-phase normalized).
   */
  static computeWaterfall(
    available_cash_try: number,
    loans: PartnerLoanInput[],
  ): { steps: WaterfallStep[]; remaining_after_debt: number; total_debt: number } {
    const result = PCLELiability.computeWaterfall(available_cash_try, loans)
    return {
      steps:                result.steps,
      remaining_after_debt: result.remaining_after_debt,
      total_debt:           result.total_debt_try,
    }
  }

  /**
   * Full waterfall computation — fetches data and produces RepaymentWaterfall.
   */
  static async compute(
    _userId:            string,
    companyId:          string,
    available_cash_try: number,
    supabase:           AnyClient,
  ): Promise<RepaymentWaterfall> {
    const [partnersRes, txRes] = await Promise.all([
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
    ])

    const partners: Array<{ id: string; name: string; share_ratio: number; is_active: boolean }> =
      partnersRes.data ?? []
    const txs: Array<{ partner_id: string; tx_type: string; amount_try: number; tx_date: string }> =
      txRes.data ?? []

    type Agg = { loaned: number; repaid: number; capital: number; dividend: number; salary: number; firstLoanDate: string | null }
    const agg = new Map<string, Agg>()
    for (const p of partners) agg.set(p.id, { loaned: 0, repaid: 0, capital: 0, dividend: 0, salary: 0, firstLoanDate: null })

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

    const today = new Date()

    const loanInputs: PartnerLoanInput[] = partners.map(p => {
      const a = agg.get(p.id)!
      return {
        partner_id:      p.id,
        partner_name:    p.name,
        share_ratio:     Number(p.share_ratio),
        net_loan:        round2(Math.max(0, a.loaned - a.repaid)),
        total_loaned:    round2(a.loaned),
        total_repaid:    round2(a.repaid),
        first_loan_date: a.firstLoanDate,
      }
    })

    const result = PCLELiability.computeWaterfall(available_cash_try, loanInputs)

    const tranches: DebtTranche[] = loanInputs
      .filter(l => l.total_loaned > 0)
      .map(l => {
        const days_outstanding = l.first_loan_date
          ? Math.floor((today.getTime() - new Date(l.first_loan_date).getTime()) / 86_400_000)
          : 0

        const status: DebtTranche['status'] =
          l.net_loan <= 0      ? 'repaid'
          : l.total_repaid > 0 ? 'partially_repaid'
          : 'active'

        return {
          id:                       l.partner_id,
          partner_id:               l.partner_id,
          partner_name:             l.partner_name,
          principal_try:            l.total_loaned,
          interest_rate_annual_pct: 0,
          disbursement_date:        l.first_loan_date ?? today.toISOString().slice(0, 10),
          expected_repayment_date:  undefined,
          actual_repaid_try:        l.total_repaid,
          accrued_interest_try:     0,
          remaining_principal_try:  round2(Math.max(0, l.net_loan)),
          status,
          days_outstanding,
        }
      })

    return {
      available_cash_try,
      tranches,
      steps:                result.steps,
      total_debt_try:       result.total_debt_try,
      remaining_after_debt: result.remaining_after_debt,
      debt_clearance_months:result.debt_clearance_months,
    }
  }

  /**
   * Capital return projections per partner.
   * ROI = (total_distributed - total_invested) / total_invested * 100
   */
  static async getCapitalReturnProjections(
    _userId:   string,
    companyId: string,
    supabase:  AnyClient,
  ) {
    const [partnersRes, txRes] = await Promise.all([
      supabase
        .from('partners')
        .select('id, name')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      supabase
        .from('partner_transactions')
        .select('partner_id, tx_type, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    const partners: Array<{ id: string; name: string }> = partnersRes.data ?? []
    const txs: Array<{ partner_id: string; tx_type: string; amount_try: number }> = txRes.data ?? []

    type Agg2 = { invested: number; returned: number }
    const agg = new Map<string, Agg2>()
    for (const p of partners) agg.set(p.id, { invested: 0, returned: 0 })

    for (const tx of txs) {
      const a = agg.get(tx.partner_id)
      if (!a) continue
      const amt = Number(tx.amount_try)
      switch (tx.tx_type) {
        case 'capital_in':
        case 'loan_to_company':
        case 'loan_in':
          a.invested += amt; break
        case 'dividend':
        case 'salary':
        case 'board_fee':
        case 'loan_repayment':
        case 'loan_out':
          a.returned += amt; break
      }
    }

    return partners.map(p => {
      const a = agg.get(p.id)!
      const total_invested_try = round2(a.invested)
      const total_returned_try = round2(a.returned)
      const roi_to_date_pct    = total_invested_try > 0
        ? round2((total_returned_try / total_invested_try) * 100)
        : 0

      return {
        partner_id:               p.id,
        partner_name:             p.name,
        total_invested_try,
        total_returned_try,
        roi_to_date_pct,
        projected_clearance_date: undefined,
        irr_estimated_pct:        undefined,
      }
    })
  }
}
