// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/pcle/equity-waterfall-distribution.service.ts
//
// Multi-Tier Equity Waterfall Distribution Service
//
// Models how profits flow through priority layers to partners:
//   Tier 1 (optional): Borç Servisi      — debt repayment (interest-first)
//   Tier 2 (optional): Tercihli Getiri   — preferred return (annual rate × months/12)
//   Tier 3:            Pro-Rata Dağıtım  — residual split by share_pct
//
// TTK 519 legal reserve: min(netProfit × 5%, max(0, paidInCapital × 20% − existingReserves))
// GVK 94 withholding:    gross × ratePct / 100 (default 10%)
//
// Pure exported functions (no DB, fully testable in isolation):
//   computeLegalReserveDeduction
//   computeDistributableProfit
//   computeWithholdingTax
//   computeNetAfterTax
//   distributeProRata
//   distributePreferredReturn
//   distributeDebtRepayment
//   buildStandardWaterfall
//   computePartnerNetReceived
//   computeGiniCoefficient
//   classifyDistributionEquity
//   generateWaterfallNarrative
//
// Service class:
//   EquityWaterfallDistributionService.getReport(companyId, options?)
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface WaterfallTier {
  tier_number:        number
  tier_name:          string
  description:        string
  amount_available:   number  // cash entering this tier
  amount_distributed: number
  amount_remaining:   number  // passes to next tier
  distributions: Array<{
    partner_id:   string
    partner_name: string
    share_pct:    number
    amount:       number
  }>
}

export interface WaterfallResult {
  tiers:                WaterfallTier[]
  total_distributed:    number
  total_remaining:      number  // undistributed
  distributable_amount: number  // input
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure exported functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TTK 519 legal reserve deduction.
 *
 * reserve = min(netProfit × 0.05, max(0, paidInCapital × 0.20 − existingReserves))
 *
 * Returns 0 if netProfit <= 0.
 */
export function computeLegalReserveDeduction(
  netProfit: number,
  existingReserves: number,
  paidInCapital: number,
): number {
  if (netProfit <= 0) return 0
  const fivePercent    = netProfit * 0.05
  const capitalCap     = Math.max(0, paidInCapital * 0.20 - existingReserves)
  return Math.min(fivePercent, capitalCap)
}

/**
 * Distributable profit after legal reserve and board retention.
 *
 * max(0, netProfit − legalReserve − boardRetained)
 */
export function computeDistributableProfit(
  netProfit:    number,
  legalReserve: number,
  boardRetained: number,
): number {
  return Math.max(0, netProfit - legalReserve - boardRetained)
}

/**
 * GVK 94 withholding tax.
 *
 * grossDistribution × ratePct / 100
 * Default rate: 10%
 */
export function computeWithholdingTax(grossDistribution: number, ratePct: number): number {
  return grossDistribution * ratePct / 100
}

/**
 * Net amount after withholding tax.
 *
 * max(0, gross − withholdingTax)
 */
export function computeNetAfterTax(gross: number, withholdingTax: number): number {
  return Math.max(0, gross - withholdingTax)
}

/**
 * Pro-rata distribution by share_pct.
 *
 * Each partner receives: availableAmount × share_pct / 100
 * Rounded to 2 decimals; last partner absorbs rounding difference.
 */
export function distributeProRata(
  availableAmount: number,
  partners: Array<{ partner_id: string; partner_name: string; share_pct: number }>,
): Array<{ partner_id: string; partner_name: string; share_pct: number; amount: number }> {
  if (partners.length === 0) return []

  const distributions = partners.map(p => ({
    partner_id:   p.partner_id,
    partner_name: p.partner_name,
    share_pct:    p.share_pct,
    amount:       Math.round(availableAmount * p.share_pct / 100 * 100) / 100,
  }))

  // Adjust last partner for rounding difference
  const sumExceptLast = distributions.slice(0, -1).reduce((s, d) => s + d.amount, 0)
  const last = distributions[distributions.length - 1]
  last.amount = Math.round((availableAmount - sumExceptLast) * 100) / 100

  return distributions
}

/**
 * Preferred return distribution.
 *
 * Each partner's preferred = paid_capital × preferred_rate_pct/100 × months/12
 * If availableAmount >= total_preferred: fully covered
 * Else: pro-rata split of available (covered=false for all)
 */
export function distributePreferredReturn(
  availableAmount: number,
  partners: Array<{
    partner_id:         string
    partner_name:       string
    paid_capital:       number
    preferred_rate_pct: number
  }>,
  months: number,
): {
  distributions: Array<{
    partner_id:   string
    partner_name: string
    amount:       number
    covered:      boolean
  }>
  total_preferred: number
  amount_remaining: number
} {
  if (partners.length === 0) {
    return { distributions: [], total_preferred: 0, amount_remaining: availableAmount }
  }

  const preferredAmounts = partners.map(p => ({
    partner_id:   p.partner_id,
    partner_name: p.partner_name,
    preferred:    p.paid_capital * (p.preferred_rate_pct / 100) * (months / 12),
  }))

  const total_preferred = preferredAmounts.reduce((s, p) => s + p.preferred, 0)

  if (availableAmount >= total_preferred) {
    // Fully covered
    const distributions = preferredAmounts.map(p => ({
      partner_id:   p.partner_id,
      partner_name: p.partner_name,
      amount:       Math.round(p.preferred * 100) / 100,
      covered:      true,
    }))
    return {
      distributions,
      total_preferred: Math.round(total_preferred * 100) / 100,
      amount_remaining: Math.round((availableAmount - total_preferred) * 100) / 100,
    }
  }

  // Partially covered — pro-rata split by preferred amount
  const distributions = preferredAmounts.map((p, i) => {
    const share = total_preferred > 0 ? p.preferred / total_preferred : 0
    const amount = Math.round(availableAmount * share * 100) / 100
    return {
      partner_id:   p.partner_id,
      partner_name: p.partner_name,
      amount,
      covered:      false,
    }
  })

  // Adjust last for rounding
  const sumExceptLast = distributions.slice(0, -1).reduce((s, d) => s + d.amount, 0)
  if (distributions.length > 0) {
    distributions[distributions.length - 1].amount = Math.round((availableAmount - sumExceptLast) * 100) / 100
  }

  return {
    distributions,
    total_preferred:  Math.round(total_preferred * 100) / 100,
    amount_remaining: 0,
  }
}

/**
 * Debt repayment distribution: interest-first, then principal pro-rata.
 *
 * If available >= total interest: pay all interest, then principal pro-rata
 * Else: pay interest pro-rata from available, no principal
 */
export function distributeDebtRepayment(
  availableAmount: number,
  tranches: Array<{
    tranche_id:        string
    partner_id:        string
    partner_name:      string
    outstanding_try:   number
    interest_accrued:  number
  }>,
): {
  repayments: Array<{
    partner_id:            string
    partner_name:          string
    interest_paid:         number
    principal_paid:        number
    remaining_outstanding: number
  }>
  total_repaid:    number
  amount_remaining: number
} {
  if (tranches.length === 0) {
    return { repayments: [], total_repaid: 0, amount_remaining: availableAmount }
  }

  const totalInterest  = tranches.reduce((s, t) => s + t.interest_accrued, 0)
  const totalPrincipal = tranches.reduce((s, t) => s + t.outstanding_try, 0)

  let remaining = availableAmount
  const repayments: Array<{
    partner_id:            string
    partner_name:          string
    interest_paid:         number
    principal_paid:        number
    remaining_outstanding: number
  }> = []

  if (remaining >= totalInterest) {
    // Pay all interest, then principal pro-rata
    remaining -= totalInterest

    const principalAvailable = Math.min(remaining, totalPrincipal)

    for (const t of tranches) {
      const principalShare = totalPrincipal > 0 ? t.outstanding_try / totalPrincipal : 0
      const principalPaid  = Math.round(principalAvailable * principalShare * 100) / 100

      repayments.push({
        partner_id:            t.partner_id,
        partner_name:          t.partner_name,
        interest_paid:         Math.round(t.interest_accrued * 100) / 100,
        principal_paid:        principalPaid,
        remaining_outstanding: Math.round(Math.max(0, t.outstanding_try - principalPaid) * 100) / 100,
      })
    }

    // Adjust last principal for rounding
    if (repayments.length > 1) {
      const sumPrincipalExceptLast = repayments.slice(0, -1).reduce((s, r) => s + r.principal_paid, 0)
      const last = repayments[repayments.length - 1]
      last.principal_paid = Math.round(Math.max(0, principalAvailable - sumPrincipalExceptLast) * 100) / 100
      last.remaining_outstanding = Math.round(Math.max(0, tranches[tranches.length - 1].outstanding_try - last.principal_paid) * 100) / 100
    }

    const totalPrincipalPaid = repayments.reduce((s, r) => s + r.principal_paid, 0)
    const totalRepaid        = totalInterest + totalPrincipalPaid
    const amountRemaining    = Math.round(Math.max(0, availableAmount - totalRepaid) * 100) / 100

    return {
      repayments,
      total_repaid:    Math.round(totalRepaid * 100) / 100,
      amount_remaining: amountRemaining,
    }
  }

  // Insufficient for all interest — pay interest pro-rata, no principal
  for (const t of tranches) {
    const interestShare = totalInterest > 0 ? t.interest_accrued / totalInterest : 0
    const interestPaid  = Math.round(availableAmount * interestShare * 100) / 100

    repayments.push({
      partner_id:            t.partner_id,
      partner_name:          t.partner_name,
      interest_paid:         interestPaid,
      principal_paid:        0,
      remaining_outstanding: Math.round(t.outstanding_try * 100) / 100,
    })
  }

  // Adjust last interest for rounding
  if (repayments.length > 1) {
    const sumExceptLast = repayments.slice(0, -1).reduce((s, r) => s + r.interest_paid, 0)
    repayments[repayments.length - 1].interest_paid = Math.round(Math.max(0, availableAmount - sumExceptLast) * 100) / 100
  }

  const totalRepaid = repayments.reduce((s, r) => s + r.interest_paid, 0)

  return {
    repayments,
    total_repaid:    Math.round(totalRepaid * 100) / 100,
    amount_remaining: 0,
  }
}

/**
 * Build a standard multi-tier waterfall.
 *
 * Tier 1 (if include_debt_service):     "Borç Servisi"      — debt repayment
 * Tier 2 (if include_preferred_return): "Tercihli Getiri"   — preferred return
 * Tier 3:                               "Pro-Rata Dağıtım"  — residual by share_pct
 *
 * Each tier receives the remaining amount from the prior tier.
 */
export function buildStandardWaterfall(
  availableAmount: number,
  partners: Array<{
    partner_id:   string
    partner_name: string
    share_pct:    number
    paid_capital: number
  }>,
  loanTranches: Array<{
    tranche_id:       string
    partner_id:       string
    partner_name:     string
    outstanding_try:  number
    interest_accrued: number
  }>,
  options: {
    include_debt_service:     boolean
    include_preferred_return: boolean
    preferred_rate_pct:       number
    withholding_rate_pct:     number
    months:                   number
  },
): WaterfallResult {
  const tiers: WaterfallTier[] = []
  let remaining = availableAmount
  let tierNum   = 1

  // Tier 1: Borç Servisi
  if (options.include_debt_service && loanTranches.length > 0) {
    const debtResult = distributeDebtRepayment(remaining, loanTranches)
    const tierDistributions: WaterfallTier['distributions'] = []

    // Aggregate by partner
    const partnerMap = new Map<string, { partner_name: string; amount: number }>()
    for (const r of debtResult.repayments) {
      const existing = partnerMap.get(r.partner_id)
      const amount   = r.interest_paid + r.principal_paid
      if (existing) {
        existing.amount += amount
      } else {
        partnerMap.set(r.partner_id, { partner_name: r.partner_name, amount })
      }
    }

    // Find share_pct for each partner
    for (const [pid, val] of partnerMap.entries()) {
      const partner = partners.find(p => p.partner_id === pid)
      tierDistributions.push({
        partner_id:   pid,
        partner_name: val.partner_name,
        share_pct:    partner?.share_pct ?? 0,
        amount:       Math.round(val.amount * 100) / 100,
      })
    }

    tiers.push({
      tier_number:        tierNum++,
      tier_name:          'Borç Servisi',
      description:        'Ortak kredilerinin faiz ve anapara geri ödemesi',
      amount_available:   remaining,
      amount_distributed: debtResult.total_repaid,
      amount_remaining:   debtResult.amount_remaining,
      distributions:      tierDistributions,
    })

    remaining = debtResult.amount_remaining
  }

  // Tier 2: Tercihli Getiri
  if (options.include_preferred_return && partners.length > 0) {
    const prefResult = distributePreferredReturn(
      remaining,
      partners.map(p => ({
        partner_id:         p.partner_id,
        partner_name:       p.partner_name,
        paid_capital:       p.paid_capital,
        preferred_rate_pct: options.preferred_rate_pct,
      })),
      options.months,
    )

    const totalDistributed = prefResult.distributions.reduce((s, d) => s + d.amount, 0)

    tiers.push({
      tier_number:        tierNum++,
      tier_name:          'Tercihli Getiri',
      description:        `Yıllık %${options.preferred_rate_pct} tercihli getiri (${options.months} aylık dönem)`,
      amount_available:   remaining,
      amount_distributed: Math.round(totalDistributed * 100) / 100,
      amount_remaining:   prefResult.amount_remaining,
      distributions:      prefResult.distributions.map(d => {
        const partner = partners.find(p => p.partner_id === d.partner_id)
        return {
          partner_id:   d.partner_id,
          partner_name: d.partner_name,
          share_pct:    partner?.share_pct ?? 0,
          amount:       d.amount,
        }
      }),
    })

    remaining = prefResult.amount_remaining
  }

  // Tier 3: Pro-Rata Dağıtım
  const proRataDistributions = distributeProRata(remaining, partners)
  const proRataTotal         = proRataDistributions.reduce((s, d) => s + d.amount, 0)

  tiers.push({
    tier_number:        tierNum,
    tier_name:          'Pro-Rata Dağıtım',
    description:        'Kalan tutarın hisse oranına göre dağıtımı',
    amount_available:   remaining,
    amount_distributed: Math.round(proRataTotal * 100) / 100,
    amount_remaining:   0,
    distributions:      proRataDistributions,
  })

  // Totals
  const totalDistributed = tiers.reduce((s, t) => s + t.amount_distributed, 0)
  const totalRemaining   = Math.round(Math.max(0, availableAmount - totalDistributed) * 100) / 100

  return {
    tiers,
    total_distributed:    Math.round(totalDistributed * 100) / 100,
    total_remaining:      totalRemaining,
    distributable_amount: availableAmount,
  }
}

/**
 * Compute a single partner's gross/net received across all waterfall tiers.
 * Applies withholding tax on final gross.
 */
export function computePartnerNetReceived(
  waterfallResult: WaterfallResult,
  partner_id:      string,
  withholdingRatePct: number,
): {
  gross_received:  number
  withholding_tax: number
  net_received:    number
} {
  let gross = 0

  for (const tier of waterfallResult.tiers) {
    for (const dist of tier.distributions) {
      if (dist.partner_id === partner_id) {
        gross += dist.amount
      }
    }
  }

  gross = Math.round(gross * 100) / 100
  const withholdingTax = Math.round(computeWithholdingTax(gross, withholdingRatePct) * 100) / 100
  const netReceived    = computeNetAfterTax(gross, withholdingTax)

  return {
    gross_received:  gross,
    withholding_tax: withholdingTax,
    net_received:    Math.round(netReceived * 100) / 100,
  }
}

/**
 * Standard Gini coefficient.
 *
 * Returns 0 if fewer than 2 elements or all values are equal.
 */
export function computeGiniCoefficient(values: number[]): number {
  if (values.length < 2) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const n      = sorted.length
  const sum    = sorted.reduce((s, v) => s + v, 0)

  if (sum === 0) return 0

  // Standard Gini formula: G = (2 × Σ (i × x_i)) / (n × Σ x_i) − (n+1)/n
  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i]
  }

  const gini = (2 * weightedSum) / (n * sum) - (n + 1) / n

  return Math.max(0, Math.min(1, gini))
}

/**
 * Classify distribution equity based on Gini coefficient of (gross_received / share_pct) ratios.
 *
 * Gini < 0.05:  equitable
 * Gini < 0.15:  slight_imbalance
 * Gini < 0.30:  moderate_imbalance
 * Gini >= 0.30: significant_imbalance
 * If all share_pct = 0 or partners is empty: equitable
 */
export function classifyDistributionEquity(
  partners: Array<{ share_pct: number; gross_received: number }>,
): 'equitable' | 'slight_imbalance' | 'moderate_imbalance' | 'significant_imbalance' {
  if (partners.length === 0) return 'equitable'

  const validPartners = partners.filter(p => p.share_pct > 0)
  if (validPartners.length === 0) return 'equitable'

  const ratios = validPartners.map(p => p.gross_received / p.share_pct)
  const gini   = computeGiniCoefficient(ratios)

  if (gini < 0.05)  return 'equitable'
  if (gini < 0.15)  return 'slight_imbalance'
  if (gini < 0.30)  return 'moderate_imbalance'
  return 'significant_imbalance'
}

/**
 * Generate a Turkish narrative describing the waterfall outcome.
 */
export function generateWaterfallNarrative(
  distributableAmount:  number,
  result:               WaterfallResult,
  partnerCount:         number,
  distributionEquity:   ReturnType<typeof classifyDistributionEquity>,
): string {
  const fmtTRY = (v: number) => `₺${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const parts: string[] = []

  parts.push(
    `${fmtTRY(distributableAmount)} TL dağıtılabilir kâr ${partnerCount} ortağa ${result.tiers.length} kademeli waterfall yapısıyla dağıtıldı.`,
  )

  // Debt service tier
  const debtTier = result.tiers.find(t => t.tier_name === 'Borç Servisi')
  if (debtTier && debtTier.amount_distributed > 0) {
    const pct = distributableAmount > 0
      ? Math.round((debtTier.amount_distributed / distributableAmount) * 100)
      : 0
    parts.push(
      `Birinci kademede borç servisi olarak ${fmtTRY(debtTier.amount_distributed)} TL (toplam dağıtımın %${pct}'i) ortak kredilerinin geri ödenmesine ayrıldı.`,
    )
  }

  // Preferred return tier
  const prefTier = result.tiers.find(t => t.tier_name === 'Tercihli Getiri')
  if (prefTier && prefTier.amount_distributed > 0) {
    parts.push(
      `Tercihli getiri kademesinde ortaklara ${fmtTRY(prefTier.amount_distributed)} TL öncelikli pay dağıtıldı.`,
    )
  }

  // Pro-rata tier
  const proRataTier = result.tiers.find(t => t.tier_name === 'Pro-Rata Dağıtım')
  if (proRataTier && proRataTier.amount_distributed > 0) {
    parts.push(
      `Kalan ${fmtTRY(proRataTier.amount_distributed)} TL hisse oranlarına göre ortaklara pro-rata dağıtıldı.`,
    )
  }

  // Equity assessment
  if (distributionEquity === 'equitable') {
    parts.push('Dağıtım hisse oranlarıyla uyumlu.')
  } else if (distributionEquity === 'slight_imbalance') {
    parts.push('Dağıtımda hisse oranlarından hafif bir sapma gözlemlendi; bu durum tercihli getiri veya borç servisi katmanlarından kaynaklanıyor olabilir.')
  } else if (distributionEquity === 'moderate_imbalance') {
    const hasDebt = debtTier && debtTier.amount_distributed > 0
    parts.push(
      hasDebt
        ? 'Ortak kredi geri ödemeleri dağılımı hisse oranlarından önemli ölçüde saptırdı; ortaklar arası orta düzey bir dengesizlik oluştu.'
        : 'Dağıtımda hisse oranlarından orta düzeyde sapma gözlemlendi.',
    )
  } else {
    const hasDebt = debtTier && debtTier.amount_distributed > 0
    parts.push(
      hasDebt
        ? 'Yüksek ortak kredi bakiyeleri dağılımı hisse oranlarından belirgin biçimde saptırdı; ortaklar arası ciddi bir dengesizlik oluştu.'
        : 'Dağıtımda hisse oranlarından ciddi sapma gözlemlendi.',
    )
  }

  return parts.join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Service class
// ─────────────────────────────────────────────────────────────────────────────

export interface EquityWaterfallDistributionReport {
  distributable_profit_try:       number
  legal_reserve_deduction_try:    number
  board_retained_try:             number
  withholding_tax_try:            number
  waterfall_result:               WaterfallResult
  partner_net_distributions: Array<{
    partner_id:           string
    partner_name:         string
    gross_received:       number
    withholding_tax:      number
    net_received:         number
    effective_yield_pct:  number | null  // net_received / paid_capital × 100
  }>
  distribution_equity: ReturnType<typeof classifyDistributionEquity>
  narrative:           string
}

export class EquityWaterfallDistributionService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    options?: {
      board_retained_try?:      number
      include_debt_service?:    boolean
      include_preferred_return?: boolean
      preferred_rate_pct?:      number
    },
  ): Promise<EquityWaterfallDistributionReport> {
    const boardRetainedTry      = options?.board_retained_try      ?? 0
    const includeDebtService    = options?.include_debt_service    ?? true
    const includePreferred      = options?.include_preferred_return ?? true
    const preferredRatePct      = options?.preferred_rate_pct      ?? 8.0
    const withholdingRatePct    = 10.0  // GVK 94 default
    const months                = 12    // assume annual period

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      partnersRes,
      tranchesRes,
      salesRes,
      expensesRes,
      financeEventsRes,
      capitalCommitmentsRes,
    ] = await Promise.allSettled([
      this.supabase
        .from('partners')
        .select('id, name, share_pct, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this.supabase
        .from('partner_loan_tranches')
        // outstanding_try is computed (no such column): principal_try − total_repaid_try
        .select('id, partner_id, principal_try, total_repaid_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .is('deleted_at', null),

      // Derive net_profit from last 12 months sales
      this.supabase
        .from('sales')
        .select('total_try:total, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),

      this.supabase
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),

      // Existing legal reserves from LEGAL_RESERVE_SET events
      this.supabase
        .from('partner_finance_events')
        .select('amount_try, event_type')
        .eq('company_id', companyId)
        .eq('event_type', 'LEGAL_RESERVE_SET'),

      // Paid capital from partner_capital_commitments
      this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, paid_try, committed_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    // ── Partners ─────────────────────────────────────────────────────────────
    const rawPartners: Array<{ id: string; name: string; share_pct: number; is_active: boolean }> =
      partnersRes.status === 'fulfilled' ? (partnersRes.value.data ?? []) : []

    const activePartners = rawPartners.filter(p => p.is_active !== false)

    // ── Capital commitments → paid_capital per partner ────────────────────────
    const commitmentRows: Array<{ partner_id: string; paid_try: number }> =
      capitalCommitmentsRes.status === 'fulfilled'
        ? (capitalCommitmentsRes.value.data ?? [])
        : []

    const paidCapitalMap = new Map<string, number>()
    for (const c of commitmentRows) {
      paidCapitalMap.set(c.partner_id, (paidCapitalMap.get(c.partner_id) ?? 0) + Number(c.paid_try ?? 0))
    }

    // Normalize share_pct: stored as 0-1 ratio → multiply by 100
    const partners = activePartners.map(p => {
      const sharePct = Number(p.share_pct ?? 0)
      // Detect if stored as 0-1 ratio
      const normalizedShare = sharePct <= 1 && sharePct > 0 ? sharePct * 100 : sharePct
      return {
        partner_id:   p.id,
        partner_name: p.name,
        share_pct:    normalizedShare,
        paid_capital: paidCapitalMap.get(p.id) ?? 0,
      }
    })

    // ── Loan tranches ─────────────────────────────────────────────────────────
    const rawTranches: Array<{ id: string; partner_id: string; principal_try: number; total_repaid_try: number; annual_interest_rate: number | null }> =
      tranchesRes.status === 'fulfilled' ? (tranchesRes.value.data ?? []) : []

    // Build partner name lookup
    const partnerNameMap = new Map(partners.map(p => [p.partner_id, p.partner_name]))

    const loanTranches = rawTranches.map(t => {
      const annualRate = Number(t.annual_interest_rate ?? 0)
      const outstanding = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
      // Monthly interest accrual estimate: outstanding × rate / 12
      const interest = Math.round(outstanding * annualRate / 12 * 100) / 100
      return {
        tranche_id:       t.id,
        partner_id:       t.partner_id,
        partner_name:     partnerNameMap.get(t.partner_id) ?? 'Bilinmeyen Ortak',
        outstanding_try:  outstanding,
        interest_accrued: interest,
      }
    })

    // ── Net profit estimation ─────────────────────────────────────────────────
    const salesRows: Array<{ total_try: number }> =
      salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []
    const expenseRows: Array<{ amount_try: number }> =
      expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []

    const totalRevenue = salesRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const totalExpenses = expenseRows.reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
    const estimatedTax = Math.round((totalRevenue - totalExpenses) * 0.22 * 100) / 100  // 22% corporate tax estimate
    const netProfit    = Math.round(Math.max(0, totalRevenue - totalExpenses - Math.max(0, estimatedTax)) * 100) / 100

    // ── Existing legal reserves ───────────────────────────────────────────────
    const financeEventRows: Array<{ amount_try: number; event_type: string }> =
      financeEventsRes.status === 'fulfilled' ? (financeEventsRes.value.data ?? []) : []

    const existingReserves = financeEventRows.reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

    // Total paid-in capital across all partners
    const paidInCapital = partners.reduce((s, p) => s + p.paid_capital, 0)

    // ── Legal reserve & distributable profit ─────────────────────────────────
    const legalReserve        = computeLegalReserveDeduction(netProfit, existingReserves, paidInCapital)
    const distributableProfit = computeDistributableProfit(netProfit, legalReserve, boardRetainedTry)

    // ── Build waterfall ───────────────────────────────────────────────────────
    const waterfallResult = buildStandardWaterfall(
      distributableProfit,
      partners,
      loanTranches,
      {
        include_debt_service:     includeDebtService,
        include_preferred_return: includePreferred,
        preferred_rate_pct:       preferredRatePct,
        withholding_rate_pct:     withholdingRatePct,
        months,
      },
    )

    // ── Per-partner net distributions ─────────────────────────────────────────
    const partnerNetDistributions = partners.map(p => {
      const { gross_received, withholding_tax, net_received } = computePartnerNetReceived(
        waterfallResult,
        p.partner_id,
        withholdingRatePct,
      )
      const effectiveYield = p.paid_capital > 0
        ? Math.round((net_received / p.paid_capital) * 100 * 100) / 100
        : null

      return {
        partner_id:          p.partner_id,
        partner_name:        p.partner_name,
        gross_received,
        withholding_tax,
        net_received,
        effective_yield_pct: effectiveYield,
      }
    })

    // ── Total withholding ─────────────────────────────────────────────────────
    const totalWithholding = partnerNetDistributions.reduce((s, p) => s + p.withholding_tax, 0)

    // ── Distribution equity ───────────────────────────────────────────────────
    const equityInput = partners.map(p => {
      const dist = partnerNetDistributions.find(d => d.partner_id === p.partner_id)
      return {
        share_pct:     p.share_pct,
        gross_received: dist?.gross_received ?? 0,
      }
    })

    const distributionEquity = classifyDistributionEquity(equityInput)

    // ── Narrative ─────────────────────────────────────────────────────────────
    const narrative = generateWaterfallNarrative(
      distributableProfit,
      waterfallResult,
      partners.length,
      distributionEquity,
    )

    return {
      distributable_profit_try:    distributableProfit,
      legal_reserve_deduction_try: Math.round(legalReserve * 100) / 100,
      board_retained_try:          boardRetainedTry,
      withholding_tax_try:         Math.round(totalWithholding * 100) / 100,
      waterfall_result:            waterfallResult,
      partner_net_distributions:   partnerNetDistributions,
      distribution_equity:         distributionEquity,
      narrative,
    }
  }
}
