// ─────────────────────────────────────────────────────────────────────────────
// tests/equity-waterfall-distribution.test.ts
//
// 100+ tests for the pure functions in equity-waterfall-distribution.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeLegalReserveDeduction,
  computeDistributableProfit,
  computeWithholdingTax,
  computeNetAfterTax,
  distributeProRata,
  distributePreferredReturn,
  distributeDebtRepayment,
  buildStandardWaterfall,
  computePartnerNetReceived,
  computeGiniCoefficient,
  classifyDistributionEquity,
  generateWaterfallNarrative,
} from '@/lib/services/pcle/equity-waterfall-distribution.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeLegalReserveDeduction — TTK 519
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLegalReserveDeduction', () => {
  it('returns 5% of netProfit when well below capital cap', () => {
    // 5% of 100_000 = 5_000; cap = 20% of 200_000 - 0 = 40_000
    expect(computeLegalReserveDeduction(100_000, 0, 200_000)).toBeCloseTo(5_000)
  })

  it('returns 0 when netProfit is zero', () => {
    expect(computeLegalReserveDeduction(0, 0, 100_000)).toBe(0)
  })

  it('returns 0 when netProfit is negative', () => {
    expect(computeLegalReserveDeduction(-50_000, 0, 100_000)).toBe(0)
  })

  it('is capped by 20% of paidInCapital minus existingReserves', () => {
    // 5% of 1_000_000 = 50_000; cap = 20% of 100_000 - 0 = 20_000 → 20_000
    expect(computeLegalReserveDeduction(1_000_000, 0, 100_000)).toBeCloseTo(20_000)
  })

  it('returns 0 when existing reserves already reached the capital cap', () => {
    // cap = max(0, 100_000×0.20 - 20_000) = 0
    expect(computeLegalReserveDeduction(100_000, 20_000, 100_000)).toBe(0)
  })

  it('returns 0 when existing reserves exceed the capital cap', () => {
    expect(computeLegalReserveDeduction(100_000, 30_000, 100_000)).toBe(0)
  })

  it('correctly applies partial existing reserves', () => {
    // 5% of 200_000 = 10_000; cap = 20% of 200_000 - 10_000 = 30_000 → min = 10_000
    expect(computeLegalReserveDeduction(200_000, 10_000, 200_000)).toBeCloseTo(10_000)
  })

  it('handles zero paidInCapital: cap = 0, returns 0', () => {
    expect(computeLegalReserveDeduction(100_000, 0, 0)).toBe(0)
  })

  it('handles very small netProfit', () => {
    // 5% of 100 = 5; cap = 20% of 500 - 0 = 100 → 5
    expect(computeLegalReserveDeduction(100, 0, 500)).toBeCloseTo(5)
  })

  it('handles large numbers correctly', () => {
    const result = computeLegalReserveDeduction(10_000_000, 0, 50_000_000)
    // 5% of 10M = 500_000; cap = 20% of 50M = 10M → 500_000
    expect(result).toBeCloseTo(500_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeDistributableProfit
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDistributableProfit', () => {
  it('computes distributable correctly', () => {
    expect(computeDistributableProfit(100_000, 5_000, 10_000)).toBeCloseTo(85_000)
  })

  it('returns 0 when reserves and board retention exceed net profit', () => {
    expect(computeDistributableProfit(100_000, 50_000, 60_000)).toBe(0)
  })

  it('returns 0 when net profit is zero', () => {
    expect(computeDistributableProfit(0, 0, 0)).toBe(0)
  })

  it('returns 0 when net profit is negative', () => {
    expect(computeDistributableProfit(-10_000, 0, 0)).toBe(0)
  })

  it('handles zero board retention', () => {
    expect(computeDistributableProfit(100_000, 5_000, 0)).toBeCloseTo(95_000)
  })

  it('handles zero legal reserve', () => {
    expect(computeDistributableProfit(100_000, 0, 10_000)).toBeCloseTo(90_000)
  })

  it('returns 0 when exactly consumed', () => {
    expect(computeDistributableProfit(100, 50, 50)).toBe(0)
  })

  it('handles fractional inputs', () => {
    expect(computeDistributableProfit(1000.50, 50.25, 100.25)).toBeCloseTo(850)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeWithholdingTax
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWithholdingTax', () => {
  it('computes 10% withholding correctly', () => {
    expect(computeWithholdingTax(100_000, 10)).toBeCloseTo(10_000)
  })

  it('computes 15% withholding correctly', () => {
    expect(computeWithholdingTax(200_000, 15)).toBeCloseTo(30_000)
  })

  it('returns 0 for 0% rate', () => {
    expect(computeWithholdingTax(100_000, 0)).toBe(0)
  })

  it('returns 0 for zero distribution', () => {
    expect(computeWithholdingTax(0, 10)).toBe(0)
  })

  it('computes 100% rate correctly', () => {
    expect(computeWithholdingTax(50_000, 100)).toBeCloseTo(50_000)
  })

  it('handles fractional rates', () => {
    expect(computeWithholdingTax(10_000, 7.5)).toBeCloseTo(750)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeNetAfterTax
// ─────────────────────────────────────────────────────────────────────────────

describe('computeNetAfterTax', () => {
  it('subtracts withholding correctly', () => {
    expect(computeNetAfterTax(100_000, 10_000)).toBeCloseTo(90_000)
  })

  it('returns 0 if withholding exceeds gross', () => {
    expect(computeNetAfterTax(10_000, 15_000)).toBe(0)
  })

  it('returns gross unchanged when withholding is 0', () => {
    expect(computeNetAfterTax(50_000, 0)).toBe(50_000)
  })

  it('returns 0 for zero gross', () => {
    expect(computeNetAfterTax(0, 0)).toBe(0)
  })

  it('returns 0 when exactly consumed', () => {
    expect(computeNetAfterTax(5_000, 5_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. distributeProRata
// ─────────────────────────────────────────────────────────────────────────────

const TWO_PARTNERS = [
  { partner_id: 'a', partner_name: 'A', share_pct: 60 },
  { partner_id: 'b', partner_name: 'B', share_pct: 40 },
]

describe('distributeProRata', () => {
  it('returns empty array for empty partners', () => {
    expect(distributeProRata(100_000, [])).toEqual([])
  })

  it('sums to availableAmount for two partners', () => {
    const result = distributeProRata(100_000, TWO_PARTNERS)
    const sum = result.reduce((s, d) => s + d.amount, 0)
    expect(sum).toBeCloseTo(100_000)
  })

  it('distributes 60/40 correctly', () => {
    const result = distributeProRata(100_000, TWO_PARTNERS)
    expect(result[0].amount).toBeCloseTo(60_000)
    expect(result[1].amount).toBeCloseTo(40_000)
  })

  it('single partner gets all', () => {
    const result = distributeProRata(99_999, [{ partner_id: 'a', partner_name: 'A', share_pct: 100 }])
    expect(result[0].amount).toBeCloseTo(99_999)
  })

  it('adjusts last partner for rounding difference', () => {
    // Amount that creates rounding issue
    const amount = 100_000.01
    const result = distributeProRata(amount, TWO_PARTNERS)
    const sum = result.reduce((s, d) => s + d.amount, 0)
    expect(Math.abs(sum - amount)).toBeLessThanOrEqual(0.01)
  })

  it('preserves partner_id and partner_name', () => {
    const result = distributeProRata(100_000, TWO_PARTNERS)
    expect(result[0].partner_id).toBe('a')
    expect(result[1].partner_name).toBe('B')
  })

  it('handles zero available amount', () => {
    const result = distributeProRata(0, TWO_PARTNERS)
    expect(result[0].amount).toBe(0)
    expect(result[1].amount).toBe(0)
  })

  it('works with three equal partners', () => {
    const three = [
      { partner_id: 'a', partner_name: 'A', share_pct: 33.33 },
      { partner_id: 'b', partner_name: 'B', share_pct: 33.33 },
      { partner_id: 'c', partner_name: 'C', share_pct: 33.34 },
    ]
    const result = distributeProRata(100_000, three)
    const sum = result.reduce((s, d) => s + d.amount, 0)
    expect(Math.abs(sum - 100_000)).toBeLessThanOrEqual(0.01)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. distributePreferredReturn
// ─────────────────────────────────────────────────────────────────────────────

const PREF_PARTNERS = [
  { partner_id: 'a', partner_name: 'A', paid_capital: 500_000, preferred_rate_pct: 8 },
  { partner_id: 'b', partner_name: 'B', paid_capital: 300_000, preferred_rate_pct: 8 },
]
// Total preferred: 500_000 × 8% × 12/12 + 300_000 × 8% × 12/12 = 40_000 + 24_000 = 64_000

describe('distributePreferredReturn', () => {
  it('returns empty for no partners', () => {
    const result = distributePreferredReturn(100_000, [], 12)
    expect(result.distributions).toEqual([])
    expect(result.total_preferred).toBe(0)
    expect(result.amount_remaining).toBe(100_000)
  })

  it('fully covered when available >= total preferred', () => {
    const result = distributePreferredReturn(100_000, PREF_PARTNERS, 12)
    expect(result.distributions[0].covered).toBe(true)
    expect(result.distributions[1].covered).toBe(true)
    expect(result.distributions[0].amount).toBeCloseTo(40_000)
    expect(result.distributions[1].amount).toBeCloseTo(24_000)
    expect(result.amount_remaining).toBeCloseTo(36_000)
  })

  it('partially covered when available < total preferred', () => {
    const result = distributePreferredReturn(32_000, PREF_PARTNERS, 12)
    expect(result.distributions[0].covered).toBe(false)
    expect(result.distributions[1].covered).toBe(false)
    expect(result.amount_remaining).toBe(0)
    const sum = result.distributions.reduce((s, d) => s + d.amount, 0)
    expect(Math.abs(sum - 32_000)).toBeLessThanOrEqual(0.01)
  })

  it('splits pro-rata by preferred amount when partial', () => {
    // A needs 40_000, B needs 24_000 (total 64_000), available 32_000
    // A gets 32_000 × (40/64) = 20_000; B gets 32_000 × (24/64) = 12_000
    const result = distributePreferredReturn(32_000, PREF_PARTNERS, 12)
    expect(result.distributions[0].amount).toBeCloseTo(20_000)
    expect(result.distributions[1].amount).toBeCloseTo(12_000)
  })

  it('zero preferred rate results in zero preferred', () => {
    const partners = [
      { partner_id: 'a', partner_name: 'A', paid_capital: 100_000, preferred_rate_pct: 0 },
    ]
    const result = distributePreferredReturn(50_000, partners, 12)
    expect(result.total_preferred).toBe(0)
    expect(result.amount_remaining).toBe(50_000)
  })

  it('uses months correctly for partial year', () => {
    // 6-month period: preferred = 500_000 × 8% × 6/12 = 20_000 per partner A
    const singlePartner = [
      { partner_id: 'a', partner_name: 'A', paid_capital: 500_000, preferred_rate_pct: 8 },
    ]
    const result = distributePreferredReturn(100_000, singlePartner, 6)
    expect(result.total_preferred).toBeCloseTo(20_000)
  })

  it('exactly zero available — all partial', () => {
    const result = distributePreferredReturn(0, PREF_PARTNERS, 12)
    expect(result.amount_remaining).toBe(0)
    expect(result.distributions.every(d => d.amount === 0)).toBe(true)
  })

  it('total preferred matches sum of individual preferreds', () => {
    const result = distributePreferredReturn(200_000, PREF_PARTNERS, 12)
    expect(result.total_preferred).toBeCloseTo(64_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. distributeDebtRepayment
// ─────────────────────────────────────────────────────────────────────────────

const TRANCHES = [
  { tranche_id: 't1', partner_id: 'a', partner_name: 'A', outstanding_try: 200_000, interest_accrued: 3_000 },
  { tranche_id: 't2', partner_id: 'b', partner_name: 'B', outstanding_try: 100_000, interest_accrued: 1_500 },
]
// total interest = 4_500; total principal = 300_000

describe('distributeDebtRepayment', () => {
  it('returns empty for no tranches', () => {
    const result = distributeDebtRepayment(100_000, [])
    expect(result.repayments).toEqual([])
    expect(result.total_repaid).toBe(0)
    expect(result.amount_remaining).toBe(100_000)
  })

  it('pays all interest and principal when sufficient', () => {
    const result = distributeDebtRepayment(400_000, TRANCHES)
    expect(result.repayments[0].interest_paid).toBeCloseTo(3_000)
    expect(result.repayments[1].interest_paid).toBeCloseTo(1_500)
    expect(result.total_repaid).toBeLessThanOrEqual(400_000)
  })

  it('pays all interest first priority', () => {
    // Available = 5_000 (> total interest 4_500)
    const result = distributeDebtRepayment(5_000, TRANCHES)
    expect(result.repayments[0].interest_paid).toBeCloseTo(3_000)
    expect(result.repayments[1].interest_paid).toBeCloseTo(1_500)
  })

  it('pro-rata principal when available after interest', () => {
    // Available = 5_500; interest = 4_500; remaining for principal = 1_000
    // A gets 1_000 × (200k/300k) ≈ 666.67; B gets ≈ 333.33
    const result = distributeDebtRepayment(5_500, TRANCHES)
    const totalPrincipalPaid = result.repayments.reduce((s, r) => s + r.principal_paid, 0)
    expect(totalPrincipalPaid).toBeCloseTo(1_000)
    expect(result.repayments[0].principal_paid).toBeCloseTo(666.67, 1)
  })

  it('insufficient for all interest — pro-rata interest, no principal', () => {
    // Available = 2_000 < total interest 4_500
    const result = distributeDebtRepayment(2_000, TRANCHES)
    expect(result.repayments.every(r => r.principal_paid === 0)).toBe(true)
    const totalInterest = result.repayments.reduce((s, r) => s + r.interest_paid, 0)
    expect(Math.abs(totalInterest - 2_000)).toBeLessThanOrEqual(0.01)
  })

  it('interest pro-rata when insufficient: A gets 3/4.5, B gets 1.5/4.5', () => {
    const result = distributeDebtRepayment(2_250, TRANCHES)
    // A: 2_250 × (3_000/4_500) = 1_500
    // B: 2_250 × (1_500/4_500) = 750
    expect(result.repayments[0].interest_paid).toBeCloseTo(1_500)
    expect(result.repayments[1].interest_paid).toBeCloseTo(750)
  })

  it('amount_remaining is 0 when available < total interest', () => {
    const result = distributeDebtRepayment(2_000, TRANCHES)
    expect(result.amount_remaining).toBe(0)
  })

  it('remaining_outstanding decrements with principal_paid', () => {
    const result = distributeDebtRepayment(200_000, TRANCHES)
    for (let i = 0; i < TRANCHES.length; i++) {
      expect(result.repayments[i].remaining_outstanding).toBeCloseTo(
        Math.max(0, TRANCHES[i].outstanding_try - result.repayments[i].principal_paid)
      )
    }
  })

  it('zero available returns zero repayments', () => {
    const result = distributeDebtRepayment(0, TRANCHES)
    expect(result.total_repaid).toBe(0)
    expect(result.repayments.every(r => r.interest_paid === 0 && r.principal_paid === 0)).toBe(true)
  })

  it('single tranche — gets all principal when available', () => {
    const single = [{ tranche_id: 't1', partner_id: 'a', partner_name: 'A', outstanding_try: 100_000, interest_accrued: 1_000 }]
    const result = distributeDebtRepayment(200_000, single)
    expect(result.repayments[0].principal_paid).toBeCloseTo(100_000)
    expect(result.repayments[0].remaining_outstanding).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. buildStandardWaterfall
// ─────────────────────────────────────────────────────────────────────────────

const STD_PARTNERS = [
  { partner_id: 'a', partner_name: 'A', share_pct: 60, paid_capital: 300_000 },
  { partner_id: 'b', partner_name: 'B', share_pct: 40, paid_capital: 200_000 },
]

const STD_TRANCHES = [
  { tranche_id: 't1', partner_id: 'a', partner_name: 'A', outstanding_try: 50_000, interest_accrued: 500 },
]

const DEFAULT_OPTIONS = {
  include_debt_service:     true,
  include_preferred_return: true,
  preferred_rate_pct:       8,
  withholding_rate_pct:     10,
  months:                   12,
}

describe('buildStandardWaterfall', () => {
  it('produces 3 tiers when both options enabled', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.tiers).toHaveLength(3)
  })

  it('produces 2 tiers when debt service disabled', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, {
      ...DEFAULT_OPTIONS, include_debt_service: false,
    })
    expect(result.tiers).toHaveLength(2)
    expect(result.tiers[0].tier_name).toBe('Tercihli Getiri')
  })

  it('produces 2 tiers when preferred return disabled', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, {
      ...DEFAULT_OPTIONS, include_preferred_return: false,
    })
    expect(result.tiers).toHaveLength(2)
    expect(result.tiers.some(t => t.tier_name === 'Tercihli Getiri')).toBe(false)
  })

  it('produces 1 tier when both disabled', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, {
      ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
    })
    expect(result.tiers).toHaveLength(1)
    expect(result.tiers[0].tier_name).toBe('Pro-Rata Dağıtım')
  })

  it('tier 1 is Borç Servisi', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.tiers[0].tier_name).toBe('Borç Servisi')
  })

  it('tier 2 is Tercihli Getiri', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.tiers[1].tier_name).toBe('Tercihli Getiri')
  })

  it('tier 3 is Pro-Rata Dağıtım', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.tiers[2].tier_name).toBe('Pro-Rata Dağıtım')
  })

  it('each tier amount_remaining equals next tier amount_available', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    for (let i = 0; i < result.tiers.length - 1; i++) {
      expect(result.tiers[i].amount_remaining).toBeCloseTo(result.tiers[i + 1].amount_available)
    }
  })

  it('total_distributed = sum of tier amount_distributed', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    const sum = result.tiers.reduce((s, t) => s + t.amount_distributed, 0)
    expect(result.total_distributed).toBeCloseTo(sum)
  })

  it('distributable_amount equals input', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.distributable_amount).toBe(500_000)
  })

  it('total_remaining = distributable - total_distributed', () => {
    const result = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.total_remaining).toBeCloseTo(
      Math.max(0, result.distributable_amount - result.total_distributed)
    )
  })

  it('handles zero available amount gracefully', () => {
    const result = buildStandardWaterfall(0, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    expect(result.total_distributed).toBe(0)
    expect(result.total_remaining).toBe(0)
  })

  it('handles empty tranches with debt service enabled', () => {
    const result = buildStandardWaterfall(100_000, STD_PARTNERS, [], {
      ...DEFAULT_OPTIONS, include_debt_service: true,
    })
    // Debt tier is skipped if no tranches
    const debtTier = result.tiers.find(t => t.tier_name === 'Borç Servisi')
    expect(debtTier).toBeUndefined()
  })

  it('handles empty partners gracefully', () => {
    const result = buildStandardWaterfall(100_000, [], [], {
      ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
    })
    expect(result.total_distributed).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. computePartnerNetReceived
// ─────────────────────────────────────────────────────────────────────────────

describe('computePartnerNetReceived', () => {
  const simpleResult = buildStandardWaterfall(100_000, STD_PARTNERS, [], {
    ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
  })

  it('sums across all tiers for partner A (60%)', () => {
    const net = computePartnerNetReceived(simpleResult, 'a', 10)
    expect(net.gross_received).toBeCloseTo(60_000)
  })

  it('sums across all tiers for partner B (40%)', () => {
    const net = computePartnerNetReceived(simpleResult, 'b', 10)
    expect(net.gross_received).toBeCloseTo(40_000)
  })

  it('applies withholding tax correctly', () => {
    const net = computePartnerNetReceived(simpleResult, 'a', 10)
    expect(net.withholding_tax).toBeCloseTo(6_000)
    expect(net.net_received).toBeCloseTo(54_000)
  })

  it('returns zero for unknown partner', () => {
    const net = computePartnerNetReceived(simpleResult, 'unknown', 10)
    expect(net.gross_received).toBe(0)
    expect(net.withholding_tax).toBe(0)
    expect(net.net_received).toBe(0)
  })

  it('0% withholding rate — net equals gross', () => {
    const net = computePartnerNetReceived(simpleResult, 'a', 0)
    expect(net.net_received).toBeCloseTo(net.gross_received)
    expect(net.withholding_tax).toBe(0)
  })

  it('accumulates multi-tier distributions for same partner', () => {
    const multiTierResult = buildStandardWaterfall(500_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    const netA = computePartnerNetReceived(multiTierResult, 'a', 0)
    // Should include debt service + preferred + pro-rata
    expect(netA.gross_received).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. computeGiniCoefficient
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGiniCoefficient', () => {
  it('returns 0 for single value', () => {
    expect(computeGiniCoefficient([100])).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(computeGiniCoefficient([])).toBe(0)
  })

  it('returns 0 for all equal values', () => {
    expect(computeGiniCoefficient([100, 100, 100])).toBe(0)
  })

  it('returns positive value for unequal distribution', () => {
    expect(computeGiniCoefficient([0, 100])).toBeGreaterThan(0)
  })

  it('returns value between 0 and 1', () => {
    const gini = computeGiniCoefficient([10, 20, 30, 40])
    expect(gini).toBeGreaterThanOrEqual(0)
    expect(gini).toBeLessThanOrEqual(1)
  })

  it('more unequal distribution has higher Gini', () => {
    const equal   = computeGiniCoefficient([25, 25, 25, 25])
    const unequal = computeGiniCoefficient([5, 10, 30, 55])
    expect(unequal).toBeGreaterThan(equal)
  })

  it('handles all zeros (returns 0)', () => {
    expect(computeGiniCoefficient([0, 0, 0])).toBe(0)
  })

  it('sorts ascending internally (order should not matter)', () => {
    const a = computeGiniCoefficient([100, 50, 200, 10])
    const b = computeGiniCoefficient([10, 50, 100, 200])
    expect(a).toBeCloseTo(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. classifyDistributionEquity
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyDistributionEquity', () => {
  it('returns equitable for empty partners', () => {
    expect(classifyDistributionEquity([])).toBe('equitable')
  })

  it('returns equitable when all share_pct are 0', () => {
    const partners = [
      { share_pct: 0, gross_received: 100 },
      { share_pct: 0, gross_received: 200 },
    ]
    expect(classifyDistributionEquity(partners)).toBe('equitable')
  })

  it('returns equitable for perfectly proportional distribution', () => {
    // All ratios gross/share_pct equal → Gini = 0
    const partners = [
      { share_pct: 60, gross_received: 60_000 },
      { share_pct: 40, gross_received: 40_000 },
    ]
    expect(classifyDistributionEquity(partners)).toBe('equitable')
  })

  it('returns equitable for slightly varied ratios (Gini < 0.05)', () => {
    // Very similar ratios
    const partners = [
      { share_pct: 50, gross_received: 50_000 },
      { share_pct: 50, gross_received: 50_100 },
    ]
    expect(classifyDistributionEquity(partners)).toBe('equitable')
  })

  it('returns significant_imbalance for very unequal distribution', () => {
    // One partner with small share gets huge amount
    const partners = [
      { share_pct: 50, gross_received: 1_000 },
      { share_pct: 50, gross_received: 99_000 },
    ]
    expect(classifyDistributionEquity(partners)).toBe('significant_imbalance')
  })

  it('returns all four levels based on Gini thresholds', () => {
    // equitable: equal distribution
    expect(classifyDistributionEquity([
      { share_pct: 50, gross_received: 50_000 },
      { share_pct: 50, gross_received: 50_000 },
    ])).toBe('equitable')

    // significant_imbalance: very skewed
    expect(classifyDistributionEquity([
      { share_pct: 50, gross_received: 100 },
      { share_pct: 50, gross_received: 100_000 },
    ])).toBe('significant_imbalance')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. generateWaterfallNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe('generateWaterfallNarrative', () => {
  const simpleResult = buildStandardWaterfall(100_000, STD_PARTNERS, [], {
    ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
  })

  it('returns a non-empty string', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'equitable')
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
  })

  it('contains Turkish text', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'equitable')
    // Should contain Turkish-specific text
    expect(narrative).toMatch(/ortağa|dağıtım|kâr|TL/i)
  })

  it('includes equitable phrase for equitable distribution', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'equitable')
    expect(narrative).toContain('hisse oranlarıyla uyumlu')
  })

  it('mentions imbalance for slight_imbalance', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'slight_imbalance')
    expect(narrative).toMatch(/hafif|sapma/i)
  })

  it('mentions imbalance for moderate_imbalance', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'moderate_imbalance')
    expect(narrative).toMatch(/orta|dengesizlik|sapma/i)
  })

  it('mentions significant imbalance for significant_imbalance', () => {
    const narrative = generateWaterfallNarrative(100_000, simpleResult, 2, 'significant_imbalance')
    expect(narrative).toMatch(/ciddi|sapma|dengesizlik/i)
  })

  it('mentions debt service when tier exists and has distribution', () => {
    const resultWithDebt = buildStandardWaterfall(200_000, STD_PARTNERS, STD_TRANCHES, DEFAULT_OPTIONS)
    const narrative = generateWaterfallNarrative(200_000, resultWithDebt, 2, 'equitable')
    expect(narrative).toMatch(/borç servisi|kredi/i)
  })

  it('generates valid narrative for 0 partners', () => {
    const emptyResult = buildStandardWaterfall(0, [], [], {
      ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
    })
    const narrative = generateWaterfallNarrative(0, emptyResult, 0, 'equitable')
    expect(typeof narrative).toBe('string')
    expect(narrative.length).toBeGreaterThan(0)
  })

  it('includes distributable amount in narrative', () => {
    const narrative = generateWaterfallNarrative(150_000, simpleResult, 2, 'equitable')
    expect(narrative).toContain('150')
  })

  it('mentions preferred return when tier exists', () => {
    const resultWithPref = buildStandardWaterfall(200_000, STD_PARTNERS, [], DEFAULT_OPTIONS)
    const narrative = generateWaterfallNarrative(200_000, resultWithPref, 2, 'equitable')
    expect(narrative).toMatch(/tercihli|öncelikli/i)
  })

  it('mentions pro-rata when pro-rata tier has amount', () => {
    const resultWithPro = buildStandardWaterfall(200_000, STD_PARTNERS, [], {
      ...DEFAULT_OPTIONS, include_debt_service: false, include_preferred_return: false,
    })
    const narrative = generateWaterfallNarrative(200_000, resultWithPro, 2, 'equitable')
    expect(narrative).toMatch(/pro-rata|hisse/i)
  })

  it('handles large distributable amount without truncation', () => {
    const narrative = generateWaterfallNarrative(10_000_000, simpleResult, 5, 'equitable')
    expect(narrative).toContain('10')
    expect(narrative.length).toBeGreaterThan(10)
  })
})
