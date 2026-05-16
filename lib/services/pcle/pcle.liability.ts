// ─────────────────────────────────────────────────────────────────────────────
// lib/services/pcle/pcle.liability.ts — PCLE Liability Context
//
// Two-phase normalized waterfall:
//   Phase 1: Overfinanced partners get priority repayment of excess burden
//   Phase 2: Pro-rata by share_ratio (iterative, cap-aware)
//
// Burden score: excess[i] = net_loan[i] - (total_loans × share_ratio[i])
// Zero-sum invariant: Σ excess = 0
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

export interface PartnerLoanInput {
  partner_id:   string
  partner_name: string
  share_ratio:  number  // 0–1 decimal (e.g. 0.30 for 30%)
  net_loan:     number  // net outstanding = total_loaned - total_repaid (>= 0)
  total_loaned: number
  total_repaid: number
  first_loan_date: string | null
}

export interface WaterfallAllocation {
  partner_id:   string
  partner_name: string
  allocated_try: number
  phase1_try:   number  // normalization allocation
  phase2_try:   number  // pro-rata allocation
  excess_burden: number // positive = overfinanced vs share, negative = underfinanced
}

export interface WaterfallResult {
  allocations:          WaterfallAllocation[]
  total_allocated_try:  number
  remaining_after_debt: number
  total_debt_try:       number
  debt_clearance_months?: number
  steps: {
    tranche_id:    string
    partner_name:  string
    component:     'principal' | 'interest_current' | 'interest_overdue' | 'dividend'
    allocated_try: number
    description:   string
    phase:         1 | 2
  }[]
}

export interface BurdenScore {
  partner_id:    string
  partner_name:  string
  net_loan:      number
  expected_loan: number  // total_loans × share_ratio
  excess:        number  // positive = overfinanced
  burden_pct:    number  // excess / total_loans (signed percentage)
}

export class PCLELiability {
  /**
   * Compute burden scores for each partner.
   * excess[i] = net_loan[i] - (total_loans × share_ratio[i])
   * Σ excess ≈ 0 (zero-sum invariant)
   */
  static computeBurdenScores(loans: PartnerLoanInput[]): BurdenScore[] {
    const total_loans = round2(loans.reduce((s, l) => s + l.net_loan, 0))
    return loans.map(l => {
      const expected_loan = round2(total_loans * l.share_ratio)
      const excess        = round2(l.net_loan - expected_loan)
      const burden_pct    = total_loans > 0 ? round2((excess / total_loans) * 100) : 0
      return {
        partner_id:   l.partner_id,
        partner_name: l.partner_name,
        net_loan:     l.net_loan,
        expected_loan,
        excess,
        burden_pct,
      }
    })
  }

  /**
   * Two-phase normalized waterfall.
   *
   * Phase 1 — Normalization:
   *   Identify overfinanced partners (excess[i] > 0).
   *   If cash >= total_excess: repay each overfinanced partner their full excess.
   *   If cash < total_excess: repay proportionally to their excess burden.
   *   After Phase 1, proceed to Phase 2 with remaining cash.
   *
   * Phase 2 — Pro-rata (iterative, cap-aware):
   *   Distribute remaining cash by share_ratio.
   *   Cap each partner at their remaining net_loan (never over-allocate).
   *   Remove exhausted partners and iterate until remaining = 0 or all clear.
   */
  static computeWaterfall(
    available_cash_try: number,
    loans: PartnerLoanInput[],
  ): WaterfallResult {
    const activeLenders = loans.filter(l => l.net_loan > 0)
    const total_debt    = round2(loans.reduce((s, l) => s + Math.max(0, l.net_loan), 0))

    if (activeLenders.length === 0 || available_cash_try <= 0) {
      return {
        allocations:          loans.map(l => ({ partner_id: l.partner_id, partner_name: l.partner_name, allocated_try: 0, phase1_try: 0, phase2_try: 0, excess_burden: 0 })),
        total_allocated_try:  0,
        remaining_after_debt: available_cash_try,
        total_debt_try:       total_debt,
        steps: [],
      }
    }

    // Working copy of remaining principal per partner
    const remaining = new Map<string, number>(
      activeLenders.map(l => [l.partner_id, l.net_loan])
    )

    const phase1_allocated = new Map<string, number>(
      loans.map(l => [l.partner_id, 0])
    )
    const phase2_allocated = new Map<string, number>(
      loans.map(l => [l.partner_id, 0])
    )

    const steps: WaterfallResult['steps'] = []
    let cash = available_cash_try

    // ── PHASE 1: Normalization ─────────────────────────────────────────────────
    const burdens      = this.computeBurdenScores(activeLenders)
    const overfinanced = burdens.filter(b => b.excess > 0.005)
    const total_excess = round2(overfinanced.reduce((s, b) => s + b.excess, 0))

    if (overfinanced.length > 0 && total_excess > 0) {
      if (cash >= total_excess) {
        // Full excess repayment
        for (const b of overfinanced) {
          const alloc = round2(Math.min(b.excess, remaining.get(b.partner_id) ?? 0))
          if (alloc <= 0) continue
          phase1_allocated.set(b.partner_id, alloc)
          remaining.set(b.partner_id, round2((remaining.get(b.partner_id) ?? 0) - alloc))
          cash = round2(cash - alloc)
          steps.push({
            tranche_id:    b.partner_id,
            partner_name:  b.partner_name,
            component:     'principal',
            allocated_try: alloc,
            description:   `${b.partner_name} — Faz 1: Aşırı yük normalizasyonu`,
            phase:         1,
          })
        }
      } else {
        // Proportional excess repayment (cash < total_excess)
        for (const b of overfinanced) {
          const proportion = b.excess / total_excess
          const alloc      = round2(Math.min(cash * proportion, remaining.get(b.partner_id) ?? 0))
          if (alloc <= 0) continue
          phase1_allocated.set(b.partner_id, alloc)
          remaining.set(b.partner_id, round2((remaining.get(b.partner_id) ?? 0) - alloc))
          steps.push({
            tranche_id:    b.partner_id,
            partner_name:  b.partner_name,
            component:     'principal',
            allocated_try: alloc,
            description:   `${b.partner_name} — Faz 1: Orantılı normalizasyon`,
            phase:         1,
          })
        }
        cash = 0
      }
    }

    // ── PHASE 2: Pro-rata (iterative, cap-aware) ──────────────────────────────
    if (cash > 0.005) {
      // Active partners still have outstanding debt after Phase 1
      const activeSet = new Set(
        [...remaining.entries()]
          .filter(([, rem]) => rem > 0.005)
          .map(([id]) => id)
      )

      // Build lookup for share ratios
      const shareMap = new Map<string, number>(
        loans.map(l => [l.partner_id, l.share_ratio])
      )

      let iterations = 0
      while (cash > 0.005 && activeSet.size > 0) {
        iterations++
        if (iterations > 50) break  // safety guard against infinite loop

        const totalRatio  = [...activeSet].reduce((s, id) => s + (shareMap.get(id) ?? 0), 0)
        if (totalRatio <= 0) break

        let allocated_this_round = 0
        for (const partnerId of [...activeSet]) {
          const ratio       = (shareMap.get(partnerId) ?? 0) / totalRatio
          const entitled    = round2(cash * ratio)
          const remainingPrincipal = remaining.get(partnerId) ?? 0
          const alloc       = round2(Math.min(entitled, remainingPrincipal))

          if (alloc <= 0) {
            activeSet.delete(partnerId)
            continue
          }

          const prev = phase2_allocated.get(partnerId) ?? 0
          phase2_allocated.set(partnerId, round2(prev + alloc))
          remaining.set(partnerId, round2(remainingPrincipal - alloc))
          allocated_this_round = round2(allocated_this_round + alloc)

          if ((remaining.get(partnerId) ?? 0) <= 0.005) {
            activeSet.delete(partnerId)
          }
        }

        cash = round2(cash - allocated_this_round)
        if (allocated_this_round < 0.005) break  // no progress, stop
      }

      // Emit Phase 2 steps (one per partner with a non-zero allocation)
      for (const loan of activeLenders) {
        const alloc = phase2_allocated.get(loan.partner_id) ?? 0
        if (alloc <= 0.005) continue
        steps.push({
          tranche_id:    loan.partner_id,
          partner_name:  loan.partner_name,
          component:     'principal',
          allocated_try: alloc,
          description:   `${loan.partner_name} — Faz 2: Pay oranına göre geri ödeme`,
          phase:         2,
        })
      }
    }

    // ── Aggregate allocations ─────────────────────────────────────────────────
    const burdenMap = new Map(this.computeBurdenScores(loans).map(b => [b.partner_id, b.excess]))

    const allocations: WaterfallAllocation[] = loans.map(l => {
      const p1 = round2(phase1_allocated.get(l.partner_id) ?? 0)
      const p2 = round2(phase2_allocated.get(l.partner_id) ?? 0)
      return {
        partner_id:    l.partner_id,
        partner_name:  l.partner_name,
        allocated_try: round2(p1 + p2),
        phase1_try:    p1,
        phase2_try:    p2,
        excess_burden: burdenMap.get(l.partner_id) ?? 0,
      }
    })

    const total_allocated_try = round2(allocations.reduce((s, a) => s + a.allocated_try, 0))

    let debt_clearance_months: number | undefined
    if (total_debt > 0 && available_cash_try > 0) {
      debt_clearance_months = Math.ceil(total_debt / available_cash_try)
    }

    return {
      allocations,
      total_allocated_try,
      remaining_after_debt: round2(Math.max(0, available_cash_try - total_allocated_try)),
      total_debt_try:       total_debt,
      debt_clearance_months,
      steps,
    }
  }
}
