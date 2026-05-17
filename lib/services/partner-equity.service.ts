// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner-equity.service.ts
//
// Pure equalization kernel + equity/balance DB-bound methods.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import { logger, contextFromHeader } from '@/lib/logger'
import { AppError } from '@/types/errors'
import { round2 } from '@/lib/calc'
import type {
  PartnerBalance,
  LoanStatus,
  PartnerEqualizationEntry,
  EqualizationResult,
} from '@/types/index'

// ── Pure equalization kernel ──────────────────────────────────────────────────

export interface EqualizationKernelInput {
  /** Active partners with their equity capital contributions (capital_in only) in TRY */
  partners: Array<{
    partner_id:             string
    partner_name:           string
    share_ratio:            number
    total_contributed_try:  number   // capital_in equity contributions only — NOT loans
  }>
  /**
   * Optional pool to distribute after equalization.
   * Pass 0 (or omit) to see only the equalization picture.
   */
  distributable?: number
}

/**
 * Pure equalization kernel — no DB access, fully testable.
 *
 * Context: partners contribute capital via loans (loan_in). When distributing
 * profit, under-funded partners (who contributed less per share unit than the
 * highest contributor) receive equalization payments FIRST to bring them up to
 * the baseline before any pro-rata split of remaining funds.
 *
 * Algorithm:
 *   1. per_unit_i  = total_contributed_try_i / share_ratio_i
 *   2. baseline    = MAX(per_unit_i)   ← highest contributor sets the target
 *   3. eq_needed_i = max(0, baseline × share_ratio_i − total_contributed_try_i)
 *                  = max(0, (baseline − per_unit_i) × share_ratio_i)
 *      → under-funded partners (per_unit < baseline) have eq_needed > 0
 *      → the at-baseline partner has eq_needed = 0
 *   4. If distributable ≥ Σ eq_needed: pay full equalization, split remainder pro-rata
 *      If distributable < Σ eq_needed: pay proportionally (by eq_needed share); no pro-rata
 *   5. total_payout_i = equalization_amount_i + pro_rata_share_i
 *      Σ total_payout_i = distributable  (penny-perfect)
 */
export function computeEqualization(
  input: EqualizationKernelInput,
): EqualizationResult {
  const { partners, distributable = 0 } = input

  if (partners.length === 0) {
    return {
      baseline_per_unit:   0,
      total_equalization:  0,
      distributable,
      remaining_after_eq:  distributable,
      entries:             [],
      total_net_loans_try:      0,
      max_partner_net_loan_try: 0,
    }
  }

  // Step 1: per-unit contribution
  const withPerUnit = partners.map(p => ({
    ...p,
    per_unit: p.share_ratio > 0 ? p.total_contributed_try / p.share_ratio : 0,
  }))

  // Step 2: baseline = MAXIMUM per-unit (highest contributor sets the target)
  const baseline = Math.max(...withPerUnit.map(p => p.per_unit))

  // Step 3: equalization NEEDED per partner
  const withEqNeeded = withPerUnit.map(p => ({
    ...p,
    eq_needed: round2(Math.max(0, (baseline - p.per_unit) * p.share_ratio)),
  }))

  const totalEqNeeded = round2(withEqNeeded.reduce((s, p) => s + p.eq_needed, 0))

  // Step 4: actual equalization payouts — handle partial distributable gracefully
  let eqPayouts: number[]
  let remaining: number

  if (distributable <= 0 || totalEqNeeded === 0) {
    eqPayouts = withEqNeeded.map(() => 0)
    remaining  = round2(Math.max(0, distributable))
  } else if (distributable >= totalEqNeeded) {
    eqPayouts = withEqNeeded.map(p => p.eq_needed)
    remaining  = round2(distributable - totalEqNeeded)
  } else {
    let runningEq = 0
    const neededIndices = withEqNeeded
      .map((p, i) => ({ i, needed: p.eq_needed }))
      .filter(x => x.needed > 0)

    eqPayouts = withEqNeeded.map(() => 0)
    for (let k = 0; k < neededIndices.length; k++) {
      const { i, needed } = neededIndices[k]
      const isLast = k === neededIndices.length - 1
      const payout = isLast
        ? round2(distributable - runningEq)
        : round2(distributable * (needed / totalEqNeeded))
      eqPayouts[i] = payout
      runningEq += payout
    }
    remaining = 0
  }

  // Step 5: pro-rata split of remainder by share_ratio
  const totalRatio = partners.reduce((s, p) => s + p.share_ratio, 0) || 1
  let runningProRata = 0
  const entries: PartnerEqualizationEntry[] = withEqNeeded.map((p, i) => {
    let proRata: number
    if (remaining === 0) {
      proRata = 0
    } else if (i === withEqNeeded.length - 1) {
      proRata = round2(remaining - runningProRata)
    } else {
      proRata = round2(remaining * (p.share_ratio / totalRatio))
      runningProRata += proRata
    }
    const eqPayout = eqPayouts[i]
    return {
      partner_id:            p.partner_id,
      partner_name:          p.partner_name,
      share_ratio:           p.share_ratio,
      total_contributed_try: p.total_contributed_try,
      per_unit_contribution: round2(p.per_unit),
      equalization_amount:   eqPayout,
      pro_rata_share:        proRata,
      total_payout:          round2(eqPayout + proRata),
    }
  })

  return {
    baseline_per_unit:    round2(baseline),
    total_equalization:   totalEqNeeded,
    distributable:        round2(distributable),
    remaining_after_eq:   remaining,
    entries,
    total_net_loans_try:      0,
    max_partner_net_loan_try: 0,
  }
}

// ── DB-bound equity/balance methods ──────────────────────────────────────────

type Ctx = ReturnType<typeof contextFromHeader>

export class PartnerEquityService {
  // ── getPartnerBalances ──────────────────────────────────────────────────────
  static async getPartnerBalances(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<PartnerBalance[]> {
    const supabase = createClient()

    const { data: partners, error: pErr } = await supabase
      .from('partners')
      .select('id, name, share_ratio, is_active')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (pErr) {
      if (ctx) void logger.error(ctx, 'partner_balances_read_failed', { error: pErr })
      throw new AppError('DB_READ_FAILED', 'Ortak verileri okunamadı', pErr)
    }

    if (!partners || partners.length === 0) return []

    const partnerIds = partners.map(p => p.id)

    const { data: txs, error: txErr } = await supabase
      .from('partner_transactions')
      .select('partner_id, tx_type, amount_try')
      .eq('company_id', companyId)
      .in('partner_id', partnerIds)
      .is('deleted_at', null)

    if (txErr) {
      if (ctx) void logger.error(ctx, 'partner_tx_read_failed', { error: txErr })
      throw new AppError('DB_READ_FAILED', 'Ortak işlemleri okunamadı', txErr)
    }

    const agg = new Map<string, {
      total_capital:   number
      total_loaned:    number
      total_repaid:    number
      total_salary:    number
      total_board_fee: number
      total_dividend:  number
    }>()

    for (const p of partners) {
      agg.set(p.id, {
        total_capital:   0,
        total_loaned:    0,
        total_repaid:    0,
        total_salary:    0,
        total_board_fee: 0,
        total_dividend:  0,
      })
    }

    for (const tx of txs ?? []) {
      const a = agg.get(tx.partner_id)
      if (!a) continue
      const amt = Number(tx.amount_try)
      switch (tx.tx_type) {
        case 'capital_in':      a.total_capital += amt; break
        case 'loan_to_company': a.total_loaned  += amt; break
        case 'loan_repayment':  a.total_repaid  += amt; break
        case 'dividend':        a.total_dividend  += amt; break
        case 'loan_in':   a.total_loaned    += amt; break
        case 'loan_out':  a.total_repaid    += amt; break
        case 'salary':    a.total_salary    += amt; break
        case 'board_fee': a.total_board_fee += amt; break
      }
    }

    return partners.map(p => {
      const a = agg.get(p.id)!
      const net_loan           = round2(a.total_loaned - a.total_repaid)
      const total_distributed  = round2(a.total_salary + a.total_board_fee + a.total_dividend)
      const total_contributed  = round2(a.total_capital + a.total_loaned)
      return {
        partner_id:             p.id,
        partner_name:           p.name,
        share_ratio:            Number(p.share_ratio),
        is_active:              Boolean(p.is_active),
        total_capital_try:      round2(a.total_capital),
        total_loaned_try:       round2(a.total_loaned),
        total_repaid_try:       round2(a.total_repaid),
        net_loan_try:           net_loan,
        total_salary_try:       round2(a.total_salary),
        total_board_fee_try:    round2(a.total_board_fee),
        total_dividend_try:     round2(a.total_dividend),
        total_distributed_try:  total_distributed,
        total_contributed_try:  total_contributed,
        partner_balance_try:    round2(a.total_capital + a.total_loaned - a.total_repaid - a.total_dividend),
      } satisfies PartnerBalance
    })
  }

  // ── getLoanStatus ───────────────────────────────────────────────────────────
  static async getLoanStatus(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<LoanStatus[]> {
    const balances = await PartnerEquityService.getPartnerBalances(userId, companyId, ctx)
    return balances.map(b => ({
      partner_id:       b.partner_id,
      partner_name:     b.partner_name,
      total_loaned_try: b.total_loaned_try,
      total_repaid_try: b.total_repaid_try,
      net_loan_try:     b.net_loan_try,
      is_settled:       b.net_loan_try <= 0,
    }))
  }

  // ── calculateEqualization ───────────────────────────────────────────────────
  static async calculateEqualization(
    userId:         string,
    companyId:      string,
    distributable?: number,
    ctx?:           Ctx,
  ): Promise<EqualizationResult> {
    const balances = await PartnerEquityService.getPartnerBalances(userId, companyId, ctx)

    const active = balances.filter(b => b.is_active)

    const result = computeEqualization({
      partners: active.map(b => ({
        partner_id:            b.partner_id,
        partner_name:          b.partner_name,
        share_ratio:           b.share_ratio,
        total_contributed_try: b.total_capital_try,
      })),
      distributable: distributable ?? 0,
    })

    const partnerLoans = balances.map(b => Math.max(0, b.net_loan_try))
    result.total_net_loans_try      = round2(partnerLoans.reduce((s, v) => s + v, 0))
    result.max_partner_net_loan_try = round2(Math.max(0, ...partnerLoans))

    return result
  }
}
