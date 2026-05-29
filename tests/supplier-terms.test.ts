// ── supplier-terms.test.ts ────────────────────────────────────────────────────
// Unit tests for all pure helpers in supplier-terms.service.ts.
// 38+ tests covering all exported pure functions.

import { describe, it, expect } from 'vitest'
import {
  computeEarlyPaymentCost,
  classifyEarlyPaymentDecision,
  computeActualDpo,
  computeDpoOpportunity,
  classifyPaymentBehavior,
  computeSupplierTrustScore,
  computeOptimalPaymentTiming,
  computeVendorPaymentHealthScore,
} from '../lib/services/commercial/supplier-terms.service'

// ── computeEarlyPaymentCost ───────────────────────────────────────────────────

describe('computeEarlyPaymentCost', () => {
  it('returns ~36.73% for 2/10 net 30', () => {
    // (2/98) × (365/20) × 100 = 0.020408 × 18.25 × 100 ≈ 37.24
    // Exact: (2/98) × (365/20) × 100 = 2/98 × 18.25 × 100
    const result = computeEarlyPaymentCost(2, 30, 10)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(37.24, 0)
  })

  it('returns ~18.18% for 1/10 net 30', () => {
    // (1/99) × (365/20) × 100 ≈ 18.43
    const result = computeEarlyPaymentCost(1, 30, 10)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(18.43, 0)
  })

  it('returns null when standardDays equals discountDays (no float period)', () => {
    expect(computeEarlyPaymentCost(2, 10, 10)).toBeNull()
  })

  it('returns null when standardDays less than discountDays', () => {
    expect(computeEarlyPaymentCost(2, 5, 10)).toBeNull()
  })

  it('returns null when discountPct is zero', () => {
    expect(computeEarlyPaymentCost(0, 30, 10)).toBeNull()
  })

  it('returns null when discountPct is negative', () => {
    expect(computeEarlyPaymentCost(-1, 30, 10)).toBeNull()
  })

  it('higher discount percentage yields higher annualised cost', () => {
    const cost2 = computeEarlyPaymentCost(2, 30, 10)!
    const cost1 = computeEarlyPaymentCost(1, 30, 10)!
    expect(cost2).toBeGreaterThan(cost1)
  })

  it('longer float period yields lower annualised cost for same discount', () => {
    // 2/10 net 60 vs 2/10 net 30 — longer float means cost is lower
    const costNet60 = computeEarlyPaymentCost(2, 60, 10)!
    const costNet30 = computeEarlyPaymentCost(2, 30, 10)!
    expect(costNet60).toBeLessThan(costNet30)
  })

  it('returns a positive number for valid inputs', () => {
    const result = computeEarlyPaymentCost(3, 45, 5)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })
})

// ── classifyEarlyPaymentDecision ──────────────────────────────────────────────

describe('classifyEarlyPaymentDecision', () => {
  it('returns take_discount when earlyPaymentCost > borrowingRate', () => {
    // 37% cost > 25% borrowing → take the discount
    expect(classifyEarlyPaymentDecision(37, 25)).toBe('take_discount')
  })

  it('returns skip_discount when earlyPaymentCost equals borrowingRate', () => {
    expect(classifyEarlyPaymentDecision(25, 25)).toBe('skip_discount')
  })

  it('returns skip_discount when earlyPaymentCost < borrowingRate', () => {
    // 18% cost < 25% borrowing → skip the discount, borrow and wait
    expect(classifyEarlyPaymentDecision(18, 25)).toBe('skip_discount')
  })

  it('returns insufficient_data when earlyPaymentCost is null', () => {
    expect(classifyEarlyPaymentDecision(null, 25)).toBe('insufficient_data')
  })

  it('2/10 net 30 at 25% borrowing rate → take_discount', () => {
    const cost = computeEarlyPaymentCost(2, 30, 10)
    expect(classifyEarlyPaymentDecision(cost, 25)).toBe('take_discount')
  })

  it('1/10 net 30 at 25% borrowing rate → skip_discount', () => {
    const cost = computeEarlyPaymentCost(1, 30, 10)
    expect(classifyEarlyPaymentDecision(cost, 25)).toBe('skip_discount')
  })

  it('returns take_discount with very high discount cost and low borrowing rate', () => {
    expect(classifyEarlyPaymentDecision(100, 10)).toBe('take_discount')
  })
})

// ── computeActualDpo ──────────────────────────────────────────────────────────

describe('computeActualDpo', () => {
  it('returns avgPaymentDays when totalPurchases > 0', () => {
    expect(computeActualDpo(50_000, 100_000, 35)).toBe(35)
  })

  it('returns null when totalPurchases is zero', () => {
    expect(computeActualDpo(0, 0, 35)).toBeNull()
  })

  it('returns null when totalPurchases is negative', () => {
    expect(computeActualDpo(0, -1, 40)).toBeNull()
  })

  it('returns the avgPaymentDays value unchanged', () => {
    expect(computeActualDpo(10, 1000, 42.5)).toBe(42.5)
  })
})

// ── computeDpoOpportunity ─────────────────────────────────────────────────────

describe('computeDpoOpportunity', () => {
  it('returns positive cash when DPO is extended (target > current)', () => {
    // annualPurchases=3_650_000, currentDpo=30, targetDpo=45
    // = 3_650_000 / 365 × 15 = 10_000 × 15 = 150_000
    expect(computeDpoOpportunity(30, 45, 3_650_000)).toBeCloseTo(150_000, 0)
  })

  it('returns negative cash when DPO shrinks (target < current)', () => {
    expect(computeDpoOpportunity(45, 30, 3_650_000)).toBeCloseTo(-150_000, 0)
  })

  it('returns zero when target equals current', () => {
    expect(computeDpoOpportunity(45, 45, 1_000_000)).toBe(0)
  })

  it('returns zero when annualPurchases is zero', () => {
    expect(computeDpoOpportunity(30, 45, 0)).toBe(0)
  })

  it('scales linearly with annual purchases', () => {
    const half = computeDpoOpportunity(30, 45, 500_000)
    const full = computeDpoOpportunity(30, 45, 1_000_000)
    expect(full).toBeCloseTo(half * 2, 1)
  })
})

// ── classifyPaymentBehavior ───────────────────────────────────────────────────

describe('classifyPaymentBehavior', () => {
  it('returns early_payer for values < -3', () => {
    expect(classifyPaymentBehavior(-4)).toBe('early_payer')
    expect(classifyPaymentBehavior(-100)).toBe('early_payer')
  })

  it('returns on_time for boundary value -3', () => {
    expect(classifyPaymentBehavior(-3)).toBe('on_time')
  })

  it('returns on_time for values in [-3, 3]', () => {
    expect(classifyPaymentBehavior(0)).toBe('on_time')
    expect(classifyPaymentBehavior(3)).toBe('on_time')
    expect(classifyPaymentBehavior(-3)).toBe('on_time')
  })

  it('returns slightly_late for boundary value 4', () => {
    expect(classifyPaymentBehavior(4)).toBe('slightly_late')
  })

  it('returns slightly_late for values in [4, 14]', () => {
    expect(classifyPaymentBehavior(10)).toBe('slightly_late')
    expect(classifyPaymentBehavior(14)).toBe('slightly_late')
  })

  it('returns late for boundary value 15', () => {
    expect(classifyPaymentBehavior(15)).toBe('late')
  })

  it('returns late for values in [15, 30]', () => {
    expect(classifyPaymentBehavior(20)).toBe('late')
    expect(classifyPaymentBehavior(30)).toBe('late')
  })

  it('returns very_late for values > 30', () => {
    expect(classifyPaymentBehavior(31)).toBe('very_late')
    expect(classifyPaymentBehavior(90)).toBe('very_late')
  })
})

// ── computeSupplierTrustScore ─────────────────────────────────────────────────

describe('computeSupplierTrustScore', () => {
  it('returns high score for perfect payment history with enough transactions', () => {
    // avgDaysLate=0, onTimeRate=100, transactions=10
    // base = 100*0.7 + (30-0)/30*100*0.3 = 70 + 30 = 100
    expect(computeSupplierTrustScore(0, 100, 10)).toBeCloseTo(100, 1)
  })

  it('applies 0.5 confidence multiplier when transactions < 3', () => {
    // base = 100, with only 2 transactions → 100 * 0.5 = 50
    expect(computeSupplierTrustScore(0, 100, 2)).toBeCloseTo(50, 1)
  })

  it('applies 0.5 confidence multiplier for 1 transaction', () => {
    const full = computeSupplierTrustScore(0, 100, 5)
    const low  = computeSupplierTrustScore(0, 100, 1)
    expect(low).toBeCloseTo(full * 0.5, 1)
  })

  it('returns lower score for late payments', () => {
    const good = computeSupplierTrustScore(0, 100, 10)
    const bad  = computeSupplierTrustScore(20, 50, 10)
    expect(bad).toBeLessThan(good)
  })

  it('clamps to 100 (no overflow)', () => {
    expect(computeSupplierTrustScore(0, 100, 50)).toBeLessThanOrEqual(100)
  })

  it('clamps to 0 (no negative)', () => {
    // Very high avgDaysLate and zero onTimeRate
    expect(computeSupplierTrustScore(100, 0, 50)).toBeGreaterThanOrEqual(0)
  })

  it('avgDaysLate > 30 is clamped by max(0,...)', () => {
    // latePenaltyScore = max(0, (30-40)/30*100) = 0
    const score = computeSupplierTrustScore(40, 50, 10)
    // base = 50*0.7 + 0*0.3 = 35
    expect(score).toBeCloseTo(35, 1)
  })
})

// ── computeOptimalPaymentTiming ───────────────────────────────────────────────

describe('computeOptimalPaymentTiming', () => {
  it('take_discount path: returns discount_due_date as recommended when cost > borrowingRate', () => {
    // 2/10 net 30 at 10% borrowing: cost ~37% > 10% → take_discount
    const result = computeOptimalPaymentTiming('2025-01-01', 30, 10, 2, 10)
    expect(result.decision).toBe('take_discount')
    expect(result.recommended_pay_date).toBe(result.discount_due_date)
    expect(result.discount_due_date).toBe('2025-01-11')
    expect(result.standard_due_date).toBe('2025-01-31')
  })

  it('skip_discount path: returns standard_due_date as recommended when cost <= borrowingRate', () => {
    // 1/10 net 30 at 25% borrowing: cost ~18% < 25% → skip_discount
    const result = computeOptimalPaymentTiming('2025-01-01', 30, 10, 1, 25)
    expect(result.decision).toBe('skip_discount')
    expect(result.recommended_pay_date).toBe(result.standard_due_date)
    expect(result.standard_due_date).toBe('2025-01-31')
  })

  it('no discount data path: returns insufficient_data and standard due date', () => {
    const result = computeOptimalPaymentTiming('2025-03-01', 30)
    expect(result.decision).toBe('insufficient_data')
    expect(result.discount_due_date).toBeNull()
    expect(result.recommended_pay_date).toBe(result.standard_due_date)
    expect(result.standard_due_date).toBe('2025-03-31')
  })

  it('uses default borrowing rate of 25% when not provided', () => {
    // 2/10 net 30 at default 25% → take_discount (cost ~37% > 25%)
    const result = computeOptimalPaymentTiming('2025-01-01', 30, 10, 2)
    expect(result.decision).toBe('take_discount')
  })

  it('savings_if_discount is null (no invoice amount in params)', () => {
    const result = computeOptimalPaymentTiming('2025-01-01', 30, 10, 2, 10)
    expect(result.savings_if_discount).toBeNull()
  })

  it('correctly computes standard_due_date for month-end invoices', () => {
    const result = computeOptimalPaymentTiming('2025-01-31', 30)
    // 2025-01-31 + 30 days = 2025-03-02
    expect(result.standard_due_date).toBe('2025-03-02')
  })
})

// ── computeVendorPaymentHealthScore ──────────────────────────────────────────

describe('computeVendorPaymentHealthScore', () => {
  it('returns null for empty array', () => {
    expect(computeVendorPaymentHealthScore([])).toBeNull()
  })

  it('returns a number for single vendor', () => {
    const result = computeVendorPaymentHealthScore([
      { trust_score: 80, dpo: 45, on_time_rate: 90 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('averages scores across multiple vendors', () => {
    const single = computeVendorPaymentHealthScore([
      { trust_score: 80, dpo: 45, on_time_rate: 90 },
    ])!
    const double = computeVendorPaymentHealthScore([
      { trust_score: 80, dpo: 45, on_time_rate: 90 },
      { trust_score: 80, dpo: 45, on_time_rate: 90 },
    ])!
    expect(double).toBeCloseTo(single, 1)
  })

  it('clamps result to 100', () => {
    const result = computeVendorPaymentHealthScore([
      { trust_score: 100, dpo: 45, on_time_rate: 100 },
    ])
    expect(result!).toBeLessThanOrEqual(100)
  })

  it('clamps result to 0 for worst-case vendor', () => {
    const result = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 0, on_time_rate: 0 },
    ])
    expect(result!).toBeGreaterThanOrEqual(0)
  })

  it('DPO = 45 gives maximum DPO component contribution', () => {
    // dpo/45 * 60 = 60 → capped at 100... but dpo=45 → min(100, 45/45*60) = min(100,60) = 60
    const atBenchmark = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 45, on_time_rate: 0 },
    ])!
    const belowBenchmark = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 30, on_time_rate: 0 },
    ])!
    expect(atBenchmark).toBeGreaterThan(belowBenchmark)
  })

  it('DPO > 45 is capped at 100 in the dpo component', () => {
    // dpo=90 → min(100, 90/45*60) = min(100,120) = 100
    const highDpo = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 90, on_time_rate: 0 },
    ])!
    const capDpo = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 135, on_time_rate: 0 },
    ])!
    // Both should be equal since both exceed the 100 cap
    expect(highDpo).toBeCloseTo(capDpo, 1)
  })

  it('trust_score has the highest weight (0.5)', () => {
    const highTrust = computeVendorPaymentHealthScore([
      { trust_score: 100, dpo: 0, on_time_rate: 0 },
    ])!
    const highOnTime = computeVendorPaymentHealthScore([
      { trust_score: 0, dpo: 0, on_time_rate: 100 },
    ])!
    expect(highTrust).toBeGreaterThan(highOnTime)
  })
})
