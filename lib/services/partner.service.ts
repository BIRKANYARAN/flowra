// ─────────────────────────────────────────────────────────────────────────────
// lib/services/partner.service.ts
//
// Partner System — Phase 6
//
// Pure kernels:
//   computeEqualization(partners, distributable) → EqualizationResult
//
// DB-bound (PartnerService):
//   getPartnerBalances(userId, ctx?)     → PartnerBalance[]
//   getLoanStatus(userId, ctx?)          → LoanStatus[]
//   calculateEqualization(userId, distributable?, ctx?) → EqualizationResult
//
// Design notes:
//   • No summary columns anywhere — every figure is derived on demand.
//   • share_ratio values are proportions (0 < r ≤ 1). The service does NOT
//     enforce that active partners sum to exactly 1.0 (service-layer concern,
//     not DB constraint).
//   • Equalization is about capital contributions (loan_in amounts).
//     baseline = MAX(total_contributed / share_ratio) — the highest per-unit
//     contributor sets the target. Under-funded partners receive equalization
//     FIRST (to bring them up to baseline) before any pro-rata split.
//     Formula: equalization_i = max(0, baseline × share_ratio_i − total_contributed_i)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase-server'
import { logger, contextFromHeader } from '@/lib/logger'
import { AppError } from '@/types/errors'
import { logAudit, logAlert } from '@/lib/audit'
import type {
  Partner,
  PartnerTransaction,
  PartnerBalance,
  LoanStatus,
  PartnerEqualizationEntry,
  EqualizationResult,
} from '@/types/index'

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

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
 *
 * Spec example (50/50, A contributed 100k, B contributed 400k):
 *   per_unit_A = 100k/0.5 = 200k,  per_unit_B = 400k/0.5 = 800k
 *   baseline   = MAX = 800k
 *   eq_A = (800k − 200k) × 0.5 = 300k   ← A is under-funded; receives equalization
 *   eq_B = (800k − 800k) × 0.5 = 0      ← B is at baseline; gets only pro-rata remainder
 *   With distributable = 300k:
 *     full equalization satisfied → remaining = 0
 *     A gets 300k,  B gets 0   ("A gets NOTHING [from pro-rata] until B [A] is balanced") ✓
 *   With distributable = 400k:
 *     A gets 300k eq + 50k pro-rata = 350k
 *     B gets 0 eq  + 50k pro-rata  =  50k
 */
export function computeEqualization(
  input: EqualizationKernelInput,
): EqualizationResult {
  const { partners, distributable = 0 } = input

  if (partners.length === 0) {
    return {
      baseline_per_unit:  0,
      total_equalization: 0,
      distributable,
      remaining_after_eq: distributable,
      entries:            [],
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
  //   eq_needed_i = max(0, (baseline - per_unit_i) × share_ratio_i)
  //              = max(0, baseline × share_ratio_i - total_contributed_try_i)
  // Under-funded partners have eq_needed > 0; at-baseline partner has 0.
  const withEqNeeded = withPerUnit.map(p => ({
    ...p,
    eq_needed: round2(Math.max(0, (baseline - p.per_unit) * p.share_ratio)),
  }))

  const totalEqNeeded = round2(withEqNeeded.reduce((s, p) => s + p.eq_needed, 0))

  // Step 4: actual equalization payouts — handle partial distributable gracefully
  let eqPayouts: number[]
  let remaining: number

  if (distributable <= 0 || totalEqNeeded === 0) {
    // Nothing to distribute, or nothing needs equalization
    eqPayouts = withEqNeeded.map(() => 0)
    remaining  = round2(Math.max(0, distributable))
  } else if (distributable >= totalEqNeeded) {
    // Full equalization satisfied; remainder goes to pro-rata
    eqPayouts = withEqNeeded.map(p => p.eq_needed)
    remaining  = round2(distributable - totalEqNeeded)
  } else {
    // Partial: distribute available proportionally among those who need equalization.
    // Last partner with eq_needed > 0 absorbs penny residual.
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
  // Last partner absorbs penny residual in the pro-rata step.
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
      equalization_amount:   eqPayout,              // actual payout from equalization step
      pro_rata_share:        proRata,
      total_payout:          round2(eqPayout + proRata),
    }
  })

  return {
    baseline_per_unit:  round2(baseline),
    total_equalization: totalEqNeeded,              // total equalization needed (informational)
    distributable:      round2(distributable),
    remaining_after_eq: remaining,
    entries,
  }
}

// ── Debt Burden Normalization Engine ─────────────────────────────────────────
//
// Ownership-normalized debt analysis for private-company treasury management.
//
// Problem: when partners contribute unequal debt relative to their ownership
// stake, the repayment should FIRST reduce the over-burdened partner's exposure
// to the company average before repaying proportionally.
//
// Algorithm:
//   1. per_unit_loan_i  = net_loan_i / share_ratio_i  (normalized debt per share unit)
//   2. weighted_avg     = Σ(net_loan_i) / Σ(share_ratio_i)  (company-wide average)
//   3. overfunding_i    = per_unit_loan_i / weighted_avg  (>1 = over-burdened)
//   4. Sort by per_unit_loan DESC → highest-burdened repaid first
//   5. equalize_step: repay until all per_unit_loans equal the NEXT partner level
//   6. repayment_recommendation_i = amount needed to bring this partner to weighted avg
//
// Example:
//   A: 30% share, 600k net_loan → per_unit = 2M
//   B: 70% share, 2.1M net_loan → per_unit = 3M
//   weighted_avg = 2.7M / 1.0 = 2.7M
//   A is under-burdened (2M < 2.7M → overfunding 0.74×)
//   B is over-burdened  (3M > 2.7M → overfunding 1.11×)
//   Repayment recommendation: repay B by (3M - 2M) × 0.7 = 700k to equalize

export interface DebtBurdenEntry {
  partner_id:                string
  partner_name:              string
  share_ratio:               number
  equity_contributed:        number   // capital_in only
  loans_given:               number   // total debt partner lent to company
  loans_repaid:              number   // total repaid so far
  net_loan:                  number   // outstanding (loans_given - loans_repaid)
  per_unit_loan:             number   // net_loan / share_ratio
  financing_multiple:        number   // net_loan / equity_contributed (0 if no equity)
  overfunding_ratio:         number   // per_unit / weighted_avg (1.0 = balanced)
  repayment_priority:        number   // 1 = first to be repaid
  equalization_repayment:    number   // TRY to repay to reach company-wide per-unit avg
}

export interface DebtBurdenSummary {
  total_loans_given:        number
  total_loans_repaid:       number
  total_outstanding:        number
  weighted_avg_per_unit:    number   // company's normalized debt burden target
  is_balanced:              boolean  // all partners within 5% of weighted avg
  equalization_needed:      number   // Σ of equalization_repayment for over-burdened
  partner_count:            number
}

export interface DebtBurdenResult {
  entries: DebtBurdenEntry[]
  summary: DebtBurdenSummary
}

export function computeDebtBurdenNormalization(input: {
  partners: Array<{
    partner_id:          string
    partner_name:        string
    share_ratio:         number
    equity_contributed:  number
    loans_given:         number
    loans_repaid:        number
  }>
}): DebtBurdenResult {
  const { partners } = input

  if (partners.length === 0) {
    return {
      entries: [],
      summary: {
        total_loans_given: 0, total_loans_repaid: 0, total_outstanding: 0,
        weighted_avg_per_unit: 0, is_balanced: true, equalization_needed: 0,
        partner_count: 0,
      },
    }
  }

  const withNet = partners.map(p => ({
    ...p,
    net_loan: round2(Math.max(0, p.loans_given - p.loans_repaid)),
  }))

  const totalOutstanding = round2(withNet.reduce((s, p) => s + p.net_loan, 0))
  const totalRatio       = withNet.reduce((s, p) => s + p.share_ratio, 0) || 1
  const weightedAvg      = totalRatio > 0 ? round2(totalOutstanding / totalRatio) : 0

  const withPerUnit = withNet.map(p => ({
    ...p,
    per_unit_loan: p.share_ratio > 0 ? round2(p.net_loan / p.share_ratio) : 0,
    financing_multiple: p.equity_contributed > 0
      ? round2(p.net_loan / p.equity_contributed)
      : p.net_loan > 0 ? Infinity : 0,
    overfunding_ratio: weightedAvg > 0
      ? round2((p.share_ratio > 0 ? p.net_loan / p.share_ratio : 0) / weightedAvg)
      : 0,
  }))

  // Sort by per_unit_loan DESC to determine repayment priority
  const sorted = [...withPerUnit].sort((a, b) => b.per_unit_loan - a.per_unit_loan)
  const priorityMap = new Map<string, number>()
  sorted.forEach((p, i) => priorityMap.set(p.partner_id, i + 1))

  let equalizationNeeded = 0
  const entries: DebtBurdenEntry[] = withPerUnit.map(p => {
    // Repayment recommendation: amount to pay back to bring per_unit to weighted avg
    const excess = Math.max(0, p.per_unit_loan - weightedAvg) * p.share_ratio
    const equalizationRepayment = round2(excess)
    equalizationNeeded += equalizationRepayment

    return {
      partner_id:             p.partner_id,
      partner_name:           p.partner_name,
      share_ratio:            p.share_ratio,
      equity_contributed:     p.equity_contributed,
      loans_given:            p.loans_given,
      loans_repaid:           p.loans_repaid,
      net_loan:               p.net_loan,
      per_unit_loan:          p.per_unit_loan,
      financing_multiple:     isFinite(p.financing_multiple) ? p.financing_multiple : 0,
      overfunding_ratio:      p.overfunding_ratio,
      repayment_priority:     priorityMap.get(p.partner_id) ?? 1,
      equalization_repayment: equalizationRepayment,
    }
  })

  const balanced = entries.every(e => Math.abs(e.overfunding_ratio - 1.0) <= 0.05)

  return {
    entries,
    summary: {
      total_loans_given:    round2(withNet.reduce((s, p) => s + p.loans_given, 0)),
      total_loans_repaid:   round2(withNet.reduce((s, p) => s + p.loans_repaid, 0)),
      total_outstanding:    totalOutstanding,
      weighted_avg_per_unit: weightedAvg,
      is_balanced:          balanced,
      equalization_needed:  round2(equalizationNeeded),
      partner_count:        partners.length,
    },
  }
}

// ── DB-bound PartnerService ───────────────────────────────────────────────────

type Ctx = ReturnType<typeof contextFromHeader>

export class PartnerService {
  // ── getPartnerBalances ──────────────────────────────────────────────────────
  static async getPartnerBalances(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<PartnerBalance[]> {
    const supabase = createClient()

    // Fetch all active partners
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

    // Fetch all non-deleted transactions for these partners
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

    // Aggregate per partner
    // Phase 4 model: equity (capital_in) is tracked separately from debt (loan_to_company).
    // Legacy tx types (loan_in → debt, loan_out → repayment) are bucketed accordingly.
    const agg = new Map<string, {
      total_capital:   number   // capital_in (equity contributions)
      total_loaned:    number   // loan_in (legacy) + loan_to_company (debt)
      total_repaid:    number   // loan_out (legacy) + loan_repayment
      total_salary:    number   // deprecated: prefer expenses table
      total_board_fee: number   // deprecated: prefer expenses table
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
        // Phase 4 canonical types
        case 'capital_in':      a.total_capital += amt; break
        case 'loan_to_company': a.total_loaned  += amt; break
        case 'loan_repayment':  a.total_repaid  += amt; break
        case 'dividend':        a.total_dividend  += amt; break
        // Legacy types (backward compat)
        case 'loan_in':   a.total_loaned    += amt; break   // treated as debt (conservative)
        case 'loan_out':  a.total_repaid    += amt; break
        case 'salary':      a.total_salary    += amt; break
        case 'board_fee':   a.total_board_fee += amt; break
        case 'huzur_hakki': a.total_salary    += amt; break  // operational comp = same bucket as salary
        case 'equalization': a.total_dividend += amt; break  // capital equalization = same bucket as dividend
      }
    }

    return partners.map(p => {
      const a = agg.get(p.id)!
      const net_loan           = round2(a.total_loaned - a.total_repaid)
      const total_distributed  = round2(a.total_salary + a.total_board_fee + a.total_dividend)
      // total_contributed = equity + loans (all money partner put into company)
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
        // capital_in + loan_to_company − loan_repayment − dividend
        // positive = company still owes partner this amount
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
    const balances = await PartnerService.getPartnerBalances(userId, companyId, ctx)
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
    const balances = await PartnerService.getPartnerBalances(userId, companyId, ctx)

    // Only active partners participate in equalization
    const active = balances.filter(b => b.is_active)

    return computeEqualization({
      partners: active.map(b => ({
        partner_id:            b.partner_id,
        partner_name:          b.partner_name,
        share_ratio:           b.share_ratio,
        // Equalization uses capital contributions (equity) ONLY — not loans.
        // Loans are repayable debt; mixing them with equity distorts the
        // per-unit baseline and can over-equalise partners who lent more.
        total_contributed_try: b.total_capital_try,
      })),
      distributable: distributable ?? 0,
    })
  }

  // ── calculateDebtBurden ─────────────────────────────────────────────────────
  static async calculateDebtBurden(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<DebtBurdenResult> {
    const balances = await PartnerService.getPartnerBalances(userId, companyId, ctx)
    const active   = balances.filter(b => b.is_active)
    return computeDebtBurdenNormalization({
      partners: active.map(b => ({
        partner_id:         b.partner_id,
        partner_name:       b.partner_name,
        share_ratio:        b.share_ratio,
        equity_contributed: b.total_capital_try,
        loans_given:        b.total_loaned_try,
        loans_repaid:       b.total_repaid_try,
      })),
    })
  }

  // ── listPartners ────────────────────────────────────────────────────────────
  static async listPartners(
    userId:    string,
    companyId: string,
    ctx?:      Ctx,
  ): Promise<Partner[]> {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (error) {
      if (ctx) void logger.error(ctx, 'partners_list_failed', { error })
      throw new AppError('DB_READ_FAILED', 'Ortaklar listelenemedi', error)
    }

    return (data ?? []) as Partner[]
  }

  // ── createPartner ───────────────────────────────────────────────────────────
  static async createPartner(
    userId:    string,
    input: { name: string; share_ratio: number; is_active?: boolean; notes?: string },
    companyId: string,
    ctx?:      Ctx,
  ): Promise<Partner> {
    if (input.share_ratio <= 0 || input.share_ratio > 1) {
      throw new AppError(
        'PARTNER_SHARE_RATIO_INVALID',
        'share_ratio 0 ile 1 arasında olmalı (örn. 0.5 = %50)',
        { received: input.share_ratio },
      )
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('partners')
      .insert({
        user_id:     userId,
        name:        input.name.trim(),
        share_ratio: input.share_ratio,
        is_active:   input.is_active ?? true,
        notes:       input.notes ?? null,
        company_id:  companyId,
      })
      .select()
      .single()

    if (error || !data) {
      if (ctx) void logger.error(ctx, 'partner_create_failed', { error })
      throw new AppError('DB_INSERT_FAILED', 'Ortak oluşturulamadı', error)
    }

    return data as Partner
  }

  // ── addTransaction ──────────────────────────────────────────────────────────
  static async addTransaction(
    userId:    string,
    partnerId: string,
    input: {
      tx_type:   string
      amount:    number
      currency:  string
      fx_rate:   number
      tx_date:   string
      notes?:    string
    },
    companyId: string,
    ctx?:      Ctx,
  ): Promise<PartnerTransaction> {
    const supabase = createClient()

    // Verify partner belongs to this company
    const { data: partner, error: pErr } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (pErr || !partner) {
      throw new AppError('PARTNER_NOT_FOUND', 'Ortak bulunamadı', { partnerId })
    }

    // Phase 4 canonical types + legacy types + Phase 7 additions (backward compat)
    const VALID_TX_TYPES = new Set([
      'capital_in', 'loan_to_company', 'loan_repayment', 'dividend',  // Phase 4 canonical
      'loan_in', 'loan_out', 'salary', 'board_fee',                    // legacy
      'huzur_hakki', 'equalization',                                   // Phase 7
    ])
    if (!VALID_TX_TYPES.has(input.tx_type)) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Geçersiz işlem tipi. Geçerli tipler: capital_in, loan_to_company, loan_repayment, dividend, huzur_hakki, equalization',
        { received: input.tx_type },
      )
    }

    if (input.amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 'Tutar sıfırdan büyük olmalı', { amount: input.amount })
    }

    if (input.fx_rate <= 0) {
      throw new AppError('VALIDATION_ERROR', 'fx_rate sıfırdan büyük olmalı', { fx_rate: input.fx_rate })
    }

    const amount_try = round2(input.amount * input.fx_rate)

    const { data, error } = await supabase
      .from('partner_transactions')
      .insert({
        partner_id:  partnerId,
        user_id:     userId,
        tx_type:     input.tx_type,
        amount:      input.amount,
        currency:    input.currency,
        fx_rate:     input.fx_rate,
        amount_try,
        tx_date:     input.tx_date,
        notes:       input.notes ?? null,
        company_id:  companyId,
      })
      .select()
      .single()

    if (error || !data) {
      if (ctx) void logger.error(ctx, 'partner_tx_create_failed', { error })
      throw new AppError('DB_INSERT_FAILED', 'İşlem kaydedilemedi', error)
    }

    const tx = data as PartnerTransaction

    logAudit({
      userId,
      companyId,
      entityType: 'partner_transaction',
      entityId:   tx.id,
      action:     'create',
      newData:    { tx_type: input.tx_type, amount: input.amount, currency: input.currency, amount_try },
    })
    if (amount_try >= 10_000) {
      logAlert({
        actorUserId: userId,
        entityType:  'partner_transaction',
        entityId:    tx.id,
        message:     `Büyük ortak işlemi: ${input.tx_type} ${amount_try.toLocaleString('tr-TR')} TRY`,
        severity:    'warning',
      })
    }

    return tx
  }

  // ── listTransactions ────────────────────────────────────────────────────────
  static async listTransactions(
    userId:    string,
    companyId: string,
    partnerId: string,
    ctx?:      Ctx,
  ): Promise<PartnerTransaction[]> {
    const supabase = createClient()

    // Verify partner belongs to this company
    const { data: partner, error: pErr } = await supabase
      .from('partners')
      .select('id')
      .eq('id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (pErr || !partner) {
      throw new AppError('PARTNER_NOT_FOUND', 'Ortak bulunamadı', { partnerId })
    }

    const { data, error } = await supabase
      .from('partner_transactions')
      .select('*')
      .eq('partner_id', partnerId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('tx_date', { ascending: false })

    if (error) {
      if (ctx) void logger.error(ctx, 'partner_tx_list_failed', { error })
      throw new AppError('DB_READ_FAILED', 'İşlemler listelenemedi', error)
    }

    return (data ?? []) as PartnerTransaction[]
  }
}
