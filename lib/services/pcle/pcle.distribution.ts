// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/pcle.distribution.ts — PCLE Distribution Context
//
// Distributable profit calculation (4-layer safety + Turkish law):
//   Layer 1: gross_net_income (after tax)
//   Layer 2: - legal_reserve (TTK 519: min 5% up to 20% of capital)
//   Layer 3: - board_retained (admin decision, optional)
//   Layer 4: - unpaid_compensation (huzur hakkı due but not yet paid, TTK 394)
//           = distributable_gross
//   Layer 5: - dividend_withholding (GVK 94: 10% withholding tax)
//           = distributable_net
//
// GUARD: distributable_net < 0 → distribution BLOCKED (TTK 509)
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

export interface DistributionInputs {
  gross_net_income_try:   number  // net income after corporate tax
  paid_in_capital_try:    number  // total paid-in capital (GL 500)
  existing_reserves_try:  number  // existing legal reserves (GL 542)
  board_retained_try:     number  // admin discretionary retention (default 0)
  unpaid_compensation_try:number  // accrued but unpaid huzur hakkı
}

export interface DistributionLayers {
  gross_net_income_try:    number
  legal_reserve_try:       number   // TTK 519
  board_retained_try:      number
  unpaid_compensation_try: number
  distributable_gross_try: number
  withholding_tax_try:     number   // GVK 94: 10%
  distributable_net_try:   number
  is_distributable:        boolean  // distributable_net > 0
  block_reason:            string | null  // TTK 509 message if blocked
}

export interface PartnerDistribution {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  gross_entitlement_try: number
  withholding_try:       number
  net_entitlement_try:   number
}

export interface ComplianceWarning {
  code:     string
  rule:     string
  message:  string
  severity: 'info' | 'warning' | 'error'
}

export interface ComplianceViolation {
  rule:     string   // e.g. 'TTK_509_NO_PROFIT'
  message:  string   // Turkish language
  blocking: boolean  // true = hard block, false = warning
}

/**
 * Pure function: validates all Turkish legal rules BEFORE any distribution is allowed.
 * Returns an array of violations (empty = compliant).
 */
export function checkDistributionCompliance(params: {
  distributableNet:      number
  dividendAmount:        number
  legalReservesDone:     boolean  // true if legal reserve has been set this period
  legalReserveBalance:   number
  paidInCapital:         number
  boardDecisionRef?:     string | null  // for huzur hakkı
  isCompensationPayment: boolean
}): ComplianceViolation[] {
  const violations: ComplianceViolation[] = []
  const {
    distributableNet,
    dividendAmount,
    legalReservesDone,
    legalReserveBalance,
    paidInCapital,
    boardDecisionRef,
    isCompensationPayment,
  } = params

  // RULE 1 — TTK 509: dividendAmount > distributableNet
  if (dividendAmount > distributableNet) {
    violations.push({
      rule:     'TTK_509_NO_PROFIT',
      message:  'Dağıtılabilir net kâr yetersiz (TTK 509)',
      blocking: true,
    })
  }

  // RULE 2 — TTK 519: legal reserve not done and balance below 20% of capital
  if (!legalReservesDone && legalReserveBalance < paidInCapital * 0.20) {
    violations.push({
      rule:     'TTK_519_RESERVE_REQUIRED',
      message:  'Yasal yedek tamamlanmadan temettü dağıtılamaz (TTK 519)',
      blocking: true,
    })
  }

  // RULE 3 — TTK 394: compensation payment without board decision reference
  if (isCompensationPayment && !boardDecisionRef) {
    violations.push({
      rule:     'TTK_394_BOARD_REQUIRED',
      message:  'Huzur hakkı için Genel Kurul kararı gereklidir (TTK 394)',
      blocking: true,
    })
  }

  // RULE 4 — Negative distributable net
  if (distributableNet < 0) {
    violations.push({
      rule:     'NEGATIVE_DISTRIBUTION',
      message:  'Dönem zararında dağıtım yapılamaz',
      blocking: true,
    })
  }

  return violations
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported pure helpers — usable in tests and non-class contexts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute legal reserve required this period (TTK 519).
 * Returns 5% of periodProfit, capped so total reserves don't exceed 20% of
 * paidInCapital. Returns 0 if profit is non-positive or cap already reached.
 */
export function computeLegalReserve(
  periodProfit: number,
  existingReserves: number,
  paidInCapital: number,
): number {
  if (periodProfit <= 0) return 0
  const cap = round2(Math.max(0, paidInCapital * 0.20 - existingReserves))
  if (cap <= 0) return 0
  return round2(Math.min(periodProfit * 0.05, cap))
}

/**
 * Compute the full distributable-net waterfall.
 * Returns distributableGross, withholdingTax, distributableNet, and a blocked
 * flag (true when distributableNet < 0 — hard-blocked under TTK 509).
 */
export function computeDistributableNet(
  grossProfit: number,
  legalReserve: number,
  boardRetained: number,
  unpaidCompensation: number,
  withholdingRate: number = 0.10,
): {
  distributableGross: number
  withholdingTax: number
  distributableNet: number
  blocked: boolean
} {
  const distributableGross = round2(grossProfit - legalReserve - boardRetained - unpaidCompensation)
  const withholdingTax     = distributableGross > 0 ? round2(distributableGross * withholdingRate) : 0
  const distributableNet   = round2(distributableGross - withholdingTax)
  return {
    distributableGross,
    withholdingTax,
    distributableNet,
    blocked: distributableNet < 0,
  }
}

/**
 * Per-partner distribution: distributableNet × (sharePct / 100).
 * Returns 0 if distributableNet is 0 or negative.
 */
export function allocateDistribution(
  distributableNet: number,
  sharePct: number,
): number {
  if (distributableNet <= 0) return 0
  return round2(distributableNet * (sharePct / 100))
}

export class PCLEDistribution {
  // GVK 94 — dividend withholding rate
  static readonly WITHHOLDING_RATE = 0.10

  // TTK 519 — legal reserve parameters
  static readonly LEGAL_RESERVE_RATE    = 0.05   // 5% of net income
  static readonly LEGAL_RESERVE_CAP_PCT = 0.20   // up to 20% of paid-in capital

  /**
   * Compute 4-layer distributable profit.
   */
  static computeDistributable(inputs: DistributionInputs): DistributionLayers {
    const {
      gross_net_income_try,
      paid_in_capital_try,
      existing_reserves_try,
      board_retained_try,
      unpaid_compensation_try,
    } = inputs

    // TTK 519: legal reserve = min(5% × net_income, max(0, 20% × capital - existing))
    const reserve_cap    = round2(Math.max(0, paid_in_capital_try * this.LEGAL_RESERVE_CAP_PCT - existing_reserves_try))
    const legal_reserve  = gross_net_income_try > 0
      ? round2(Math.min(gross_net_income_try * this.LEGAL_RESERVE_RATE, reserve_cap))
      : 0

    const distributable_gross = round2(
      gross_net_income_try
      - legal_reserve
      - board_retained_try
      - unpaid_compensation_try
    )

    // GVK 94: 10% withholding tax on distributable gross
    const withholding_tax = distributable_gross > 0
      ? round2(distributable_gross * this.WITHHOLDING_RATE)
      : 0

    const distributable_net = round2(distributable_gross - withholding_tax)

    const is_distributable = distributable_net > 0.01

    let block_reason: string | null = null
    if (!is_distributable) {
      if (gross_net_income_try <= 0) {
        block_reason = 'TTK 509: Dönem kârı olmadan temettü dağıtılamaz.'
      } else {
        block_reason = 'Yasal kesintiler sonrası dağıtılabilir kâr kalmadı.'
      }
    }

    return {
      gross_net_income_try,
      legal_reserve_try:       legal_reserve,
      board_retained_try:      round2(board_retained_try),
      unpaid_compensation_try: round2(unpaid_compensation_try),
      distributable_gross_try: distributable_gross,
      withholding_tax_try:     withholding_tax,
      distributable_net_try:   distributable_net,
      is_distributable,
      block_reason,
    }
  }

  /**
   * Compute per-partner distribution entitlement.
   * Proportional to share_ratio. Withholding applied per partner.
   */
  static computePerPartnerDistribution(
    distributable_net_try: number,
    partners: Array<{ partner_id: string; partner_name: string; share_ratio: number }>,
  ): PartnerDistribution[] {
    const total_ratio = partners.reduce((s, p) => s + p.share_ratio, 0)
    if (total_ratio <= 0 || distributable_net_try <= 0) {
      return partners.map(p => ({
        partner_id:            p.partner_id,
        partner_name:          p.partner_name,
        share_ratio:           p.share_ratio,
        gross_entitlement_try: 0,
        withholding_try:       0,
        net_entitlement_try:   0,
      }))
    }

    return partners.map(p => {
      // distributable_net is already post-withholding at company level.
      // Per-partner net = distributable_net × (share_ratio / total_ratio)
      const net_entitlement = round2(distributable_net_try * (p.share_ratio / total_ratio))
      // Gross = net / (1 - withholding_rate) — for display/compliance purposes
      const gross_entitlement = round2(net_entitlement / (1 - PCLEDistribution.WITHHOLDING_RATE))
      const withholding       = round2(gross_entitlement - net_entitlement)
      return {
        partner_id:            p.partner_id,
        partner_name:          p.partner_name,
        share_ratio:           p.share_ratio,
        gross_entitlement_try: gross_entitlement,
        withholding_try:       withholding,
        net_entitlement_try:   net_entitlement,
      }
    })
  }

  /**
   * Turkish finance compliance checks.
   * Returns warnings for the CFO/Admin to review.
   */
  static checkCompliance(params: {
    partner_loans: Array<{ net_loan: number; first_loan_date: string | null; interest_rate: number }>
    huzur_payments: Array<{ board_decision_ref: string | null; amount_try: number }>
    existing_reserves_try: number
    paid_in_capital_try:   number
    gross_net_income_try:  number
    dividend_requested_try:number
    today?: Date
  }): ComplianceWarning[] {
    const warnings: ComplianceWarning[] = []
    const today = params.today ?? new Date()

    // KURAL 1 — KVK 13: Faizsiz büyük ortak borcu (örtülü kazanç riski)
    for (const loan of params.partner_loans) {
      if (loan.interest_rate === 0 && loan.net_loan > 50_000) {
        const days = loan.first_loan_date
          ? Math.floor((today.getTime() - new Date(loan.first_loan_date).getTime()) / 86_400_000)
          : 0
        if (days > 365) {
          warnings.push({
            code:     'KVK13_INTEREST_FREE',
            rule:     'KVK 13 / VUK',
            message:  `Faizsiz ortak borcu ₺${loan.net_loan.toFixed(0)} — 12 ayı aştı. Örtülü kazanç dağıtımı riski. Faiz işleyin veya borcu belgeleyin.`,
            severity: 'warning',
          })
        }
      }
    }

    // KURAL 2 — TTK 394: Huzur hakkı board kararı olmadan ödendi
    for (const hp of params.huzur_payments) {
      if (!hp.board_decision_ref && hp.amount_try > 0) {
        warnings.push({
          code:     'TTK394_NO_BOARD_REF',
          rule:     'TTK 394',
          message:  `Huzur hakkı ödemesi (₺${hp.amount_try.toFixed(0)}) için Genel Kurul kararı referansı eksik. Gider kabul edilmez riski.`,
          severity: 'warning',
        })
      }
    }

    // KURAL 3 — TTK 519: Yasal yedek yetersiz
    const required_reserve = round2(Math.max(0, params.paid_in_capital_try * 0.20 - params.existing_reserves_try))
    if (required_reserve > 0 && params.gross_net_income_try > 0) {
      const period_reserve = round2(Math.min(params.gross_net_income_try * 0.05, required_reserve))
      if (period_reserve > 0.01) {
        warnings.push({
          code:     'TTK519_RESERVE_REQUIRED',
          rule:     'TTK 519',
          message:  `Bu dönem ₺${period_reserve.toFixed(2)} yasal yedek ayrılmalı. Dönem kapanışında otomatik hesaplanacak.`,
          severity: 'info',
        })
      }
    }

    // KURAL 4 — TTK 509: Dönem kârından fazla temettü
    if (params.dividend_requested_try > params.gross_net_income_try && params.gross_net_income_try > 0) {
      warnings.push({
        code:     'TTK509_EXCESS_DIVIDEND',
        rule:     'TTK 509',
        message:  `Talep edilen temettü (₺${params.dividend_requested_try.toFixed(0)}) dönem kârını (₺${params.gross_net_income_try.toFixed(0)}) aşıyor. TTK 509 ihlali.`,
        severity: 'error',
      })
    }
    if (params.dividend_requested_try > 0 && params.gross_net_income_try <= 0) {
      warnings.push({
        code:     'TTK509_NO_PROFIT',
        rule:     'TTK 509',
        message:  'Dönem kârı olmadan temettü dağıtılamaz (TTK 509).',
        severity: 'error',
      })
    }

    return warnings
  }
}
