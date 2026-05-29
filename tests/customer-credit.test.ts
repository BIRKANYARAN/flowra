// ── tests/customer-credit.test.ts ────────────────────────────────────────────
// Unit tests for customer credit scoring pure functions.
// Run with: npx vitest run tests/customer-credit.test.ts

import { describe, it, expect } from 'vitest'
import {
  computePaymentHistoryScore,
  computeRelationshipScore,
  computeOrderConsistencyScore,
  computeCreditScore,
  creditScoreToGrade,
  computeRecommendedCreditLimit,
} from '../lib/services/commercial/customer-credit.service'

// ── computePaymentHistoryScore ────────────────────────────────────────────────

describe('computePaymentHistoryScore', () => {
  it('returns 100 for no payment history', () => {
    expect(computePaymentHistoryScore(0, 0, 0, 0)).toBe(100)
  })

  it('returns max for all on-time payments (5+ on-time, bonus capped at 25)', () => {
    // Start 100, bonus min(5*5,25)=25 → 125 but clamped to 100
    expect(computePaymentHistoryScore(5, 0, 0, 0)).toBe(100)
  })

  it('on-time bonus capped at 25 regardless of more on-time payments', () => {
    expect(computePaymentHistoryScore(10, 0, 0, 0)).toBe(100)
  })

  it('penalizes late_30 payments (-5 each)', () => {
    // 100 - 5*2 + 0 = 90
    expect(computePaymentHistoryScore(0, 2, 0, 0)).toBe(90)
  })

  it('penalizes late_60 payments (-10 each)', () => {
    // 100 - 10*3 = 70
    expect(computePaymentHistoryScore(0, 0, 3, 0)).toBe(70)
  })

  it('penalizes late_90plus payments (-20 each)', () => {
    // 100 - 20*4 = 20
    expect(computePaymentHistoryScore(0, 0, 0, 4)).toBe(20)
  })

  it('clamps to 0 for all late payments', () => {
    // 100 - 20*10 = -100, clamped to 0
    expect(computePaymentHistoryScore(0, 0, 0, 10)).toBe(0)
  })

  it('applies mixed penalties and bonus correctly', () => {
    // 100 - 5*1 - 10*1 - 20*1 + min(2*5, 25) = 100 - 5 - 10 - 20 + 10 = 75
    expect(computePaymentHistoryScore(2, 1, 1, 1)).toBe(75)
  })

  it('clamps result to 100 max', () => {
    // 1 on-time: 100 + 5 = 105 → 100
    expect(computePaymentHistoryScore(1, 0, 0, 0)).toBe(100)
  })
})

// ── computeRelationshipScore ──────────────────────────────────────────────────

describe('computeRelationshipScore', () => {
  it('returns 20 for < 3 months (89 days)', () => {
    expect(computeRelationshipScore(89)).toBe(20)
  })

  it('returns 40 at boundary 90 days (3 months)', () => {
    expect(computeRelationshipScore(90)).toBe(40)
  })

  it('returns 40 for 3-6 months range (179 days)', () => {
    expect(computeRelationshipScore(179)).toBe(40)
  })

  it('returns 60 at boundary 180 days (6 months)', () => {
    expect(computeRelationshipScore(180)).toBe(60)
  })

  it('returns 60 for 6-12 months range (364 days)', () => {
    expect(computeRelationshipScore(364)).toBe(60)
  })

  it('returns 80 at boundary 365 days (12 months)', () => {
    expect(computeRelationshipScore(365)).toBe(80)
  })

  it('returns 80 for 12-24 months range (729 days)', () => {
    expect(computeRelationshipScore(729)).toBe(80)
  })

  it('returns 100 at boundary 730 days (24 months)', () => {
    expect(computeRelationshipScore(730)).toBe(100)
  })

  it('returns 100 for > 24 months (1000 days)', () => {
    expect(computeRelationshipScore(1000)).toBe(100)
  })

  it('returns 20 for 0 days (brand new customer)', () => {
    expect(computeRelationshipScore(0)).toBe(20)
  })
})

// ── computeOrderConsistencyScore ──────────────────────────────────────────────

describe('computeOrderConsistencyScore', () => {
  it('returns 0 for 0 orders per month', () => {
    expect(computeOrderConsistencyScore(0)).toBe(0)
  })

  it('returns 0 for negative orders per month', () => {
    expect(computeOrderConsistencyScore(-1)).toBe(0)
  })

  it('returns 30 for 0.5 orders per month', () => {
    expect(computeOrderConsistencyScore(0.5)).toBe(30)
  })

  it('returns 60 for 1 order per month', () => {
    expect(computeOrderConsistencyScore(1)).toBe(60)
  })

  it('returns 80 for 2 orders per month', () => {
    expect(computeOrderConsistencyScore(2)).toBe(80)
  })

  it('returns 100 for 3 orders per month', () => {
    expect(computeOrderConsistencyScore(3)).toBe(100)
  })

  it('returns 100 for 5+ orders per month', () => {
    expect(computeOrderConsistencyScore(5)).toBe(100)
  })

  it('interpolates between 0.5 and 1 (0.75 → ~45)', () => {
    const score = computeOrderConsistencyScore(0.75)
    expect(score).toBeGreaterThan(30)
    expect(score).toBeLessThan(60)
  })

  it('interpolates between 1 and 2 (1.5 → ~70)', () => {
    const score = computeOrderConsistencyScore(1.5)
    expect(score).toBeGreaterThan(60)
    expect(score).toBeLessThan(80)
  })
})

// ── computeCreditScore ────────────────────────────────────────────────────────

describe('computeCreditScore', () => {
  it('returns 100 when all components are 100', () => {
    expect(computeCreditScore(100, 100, 100, 100)).toBe(100)
  })

  it('returns 0 when all components are 0', () => {
    expect(computeCreditScore(0, 0, 0, 0)).toBe(0)
  })

  it('computes weighted average correctly — 50/50/50/50', () => {
    expect(computeCreditScore(50, 50, 50, 50)).toBe(50)
  })

  it('weights payment history at 40%', () => {
    // Only payment history = 100, rest = 0 → 40
    expect(computeCreditScore(100, 0, 0, 0)).toBe(40)
  })

  it('weights order consistency at 30%', () => {
    // Only order consistency = 100, rest = 0 → 30
    expect(computeCreditScore(0, 100, 0, 0)).toBe(30)
  })

  it('weights relationship at 20%', () => {
    // Only relationship = 100, rest = 0 → 20
    expect(computeCreditScore(0, 0, 100, 0)).toBe(20)
  })

  it('weights volume at 10%', () => {
    // Only volume = 100, rest = 0 → 10
    expect(computeCreditScore(0, 0, 0, 100)).toBe(10)
  })

  it('clamps to 0 minimum', () => {
    expect(computeCreditScore(-10, -10, -10, -10)).toBe(0)
  })

  it('clamps to 100 maximum', () => {
    expect(computeCreditScore(110, 110, 110, 110)).toBe(100)
  })
})

// ── creditScoreToGrade ────────────────────────────────────────────────────────

describe('creditScoreToGrade', () => {
  it('returns A for score >= 80', () => {
    expect(creditScoreToGrade(80)).toBe('A')
    expect(creditScoreToGrade(100)).toBe('A')
    expect(creditScoreToGrade(95)).toBe('A')
  })

  it('returns B for score 65-79', () => {
    expect(creditScoreToGrade(65)).toBe('B')
    expect(creditScoreToGrade(79)).toBe('B')
    expect(creditScoreToGrade(72)).toBe('B')
  })

  it('returns C for score 50-64', () => {
    expect(creditScoreToGrade(50)).toBe('C')
    expect(creditScoreToGrade(64)).toBe('C')
    expect(creditScoreToGrade(57)).toBe('C')
  })

  it('returns D for score 35-49', () => {
    expect(creditScoreToGrade(35)).toBe('D')
    expect(creditScoreToGrade(49)).toBe('D')
    expect(creditScoreToGrade(42)).toBe('D')
  })

  it('returns F for score < 35', () => {
    expect(creditScoreToGrade(34)).toBe('F')
    expect(creditScoreToGrade(0)).toBe('F')
    expect(creditScoreToGrade(20)).toBe('F')
  })

  it('boundary: 79 is B, 80 is A', () => {
    expect(creditScoreToGrade(79)).toBe('B')
    expect(creditScoreToGrade(80)).toBe('A')
  })

  it('boundary: 49 is D, 50 is C', () => {
    expect(creditScoreToGrade(49)).toBe('D')
    expect(creditScoreToGrade(50)).toBe('C')
  })
})

// ── computeRecommendedCreditLimit ─────────────────────────────────────────────

describe('computeRecommendedCreditLimit', () => {
  it('returns 6x avg order for grade A', () => {
    expect(computeRecommendedCreditLimit('A', 10_000)).toBe(60_000)
  })

  it('returns 4x avg order for grade B', () => {
    expect(computeRecommendedCreditLimit('B', 10_000)).toBe(40_000)
  })

  it('returns 2x avg order for grade C', () => {
    expect(computeRecommendedCreditLimit('C', 10_000)).toBe(20_000)
  })

  it('returns 1x avg order for grade D', () => {
    expect(computeRecommendedCreditLimit('D', 10_000)).toBe(10_000)
  })

  it('returns 0 for grade F', () => {
    expect(computeRecommendedCreditLimit('F', 10_000)).toBe(0)
  })

  it('returns 0 when avg order value is 0', () => {
    expect(computeRecommendedCreditLimit('A', 0)).toBe(0)
    expect(computeRecommendedCreditLimit('B', 0)).toBe(0)
  })

  it('rounds to integer', () => {
    const result = computeRecommendedCreditLimit('A', 1_333.33)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('scales linearly with avg order value for grade A', () => {
    expect(computeRecommendedCreditLimit('A', 5_000)).toBe(30_000)
    expect(computeRecommendedCreditLimit('A', 20_000)).toBe(120_000)
    expect(computeRecommendedCreditLimit('A', 50_000)).toBe(300_000)
  })

  it('scales linearly with avg order value for grade B', () => {
    expect(computeRecommendedCreditLimit('B', 5_000)).toBe(20_000)
    expect(computeRecommendedCreditLimit('B', 25_000)).toBe(100_000)
  })

  it('scales linearly with avg order value for grade C', () => {
    expect(computeRecommendedCreditLimit('C', 5_000)).toBe(10_000)
    expect(computeRecommendedCreditLimit('C', 30_000)).toBe(60_000)
  })

  it('scales linearly with avg order value for grade D', () => {
    expect(computeRecommendedCreditLimit('D', 5_000)).toBe(5_000)
    expect(computeRecommendedCreditLimit('D', 15_000)).toBe(15_000)
  })

  it('grade F always returns 0 regardless of avg order value', () => {
    expect(computeRecommendedCreditLimit('F', 1_000_000)).toBe(0)
    expect(computeRecommendedCreditLimit('F', 0)).toBe(0)
    expect(computeRecommendedCreditLimit('F', 0.01)).toBe(0)
  })

  it('handles fractional avg order values and rounds', () => {
    // A: 6 * 999.99 = 5999.94 → rounds to 5999.94 → Math.round gives 6000
    const result = computeRecommendedCreditLimit('A', 999.99)
    expect(result).toBe(Math.round(999.99 * 6))
  })

  it('A limit is exactly 1.5x B limit', () => {
    const a = computeRecommendedCreditLimit('A', 10_000)
    const b = computeRecommendedCreditLimit('B', 10_000)
    expect(a / b).toBeCloseTo(1.5)
  })

  it('B limit is exactly 2x C limit', () => {
    const b = computeRecommendedCreditLimit('B', 10_000)
    const c = computeRecommendedCreditLimit('C', 10_000)
    expect(b / c).toBe(2)
  })

  it('C limit is exactly 2x D limit', () => {
    const c = computeRecommendedCreditLimit('C', 10_000)
    const d = computeRecommendedCreditLimit('D', 10_000)
    expect(c / d).toBe(2)
  })
})

// ── computePaymentHistoryScore — extended edge cases ──────────────────────────

describe('computePaymentHistoryScore — extended', () => {
  it('single on-time payment caps at 100', () => {
    expect(computePaymentHistoryScore(1, 0, 0, 0)).toBe(100)
  })

  it('one late_30 deducts exactly 5', () => {
    expect(computePaymentHistoryScore(0, 1, 0, 0)).toBe(95)
  })

  it('one late_60 deducts exactly 10', () => {
    expect(computePaymentHistoryScore(0, 0, 1, 0)).toBe(90)
  })

  it('one late_90+ deducts exactly 20', () => {
    expect(computePaymentHistoryScore(0, 0, 0, 1)).toBe(80)
  })

  it('combination: 3 on-time + 1 late_30 → 100 - 5 + 15 = 110 clamped 100', () => {
    expect(computePaymentHistoryScore(3, 1, 0, 0)).toBe(100)
  })

  it('combination: 0 on-time + 1 late_90 → 80', () => {
    expect(computePaymentHistoryScore(0, 0, 0, 1)).toBe(80)
  })

  it('on-time bonus is exactly 5 per payment up to 5 payments', () => {
    // 2 on-time: 100 + 10 = 110 → 100
    expect(computePaymentHistoryScore(2, 0, 0, 0)).toBe(100)
  })

  it('heavy late_90 payments with no on-time fully zero out score', () => {
    // 100 - 20*5 = 0
    expect(computePaymentHistoryScore(0, 0, 0, 5)).toBe(0)
  })

  it('balanced payments produce middle-ground score', () => {
    // 100 - 5 - 10 - 20 + 25 = 90
    const score = computePaymentHistoryScore(5, 1, 1, 1)
    expect(score).toBe(90)
  })

  it('late_30 penalty only: 20 late_30 → 100 - 100 = 0', () => {
    expect(computePaymentHistoryScore(0, 20, 0, 0)).toBe(0)
  })

  it('late_60 penalty only: 10 late_60 → 100 - 100 = 0', () => {
    expect(computePaymentHistoryScore(0, 0, 10, 0)).toBe(0)
  })
})

// ── computeRelationshipScore — extended edge cases ────────────────────────────

describe('computeRelationshipScore — extended', () => {
  it('returns 20 for 1 day (new customer)', () => {
    expect(computeRelationshipScore(1)).toBe(20)
  })

  it('returns 20 for exactly 89 days', () => {
    expect(computeRelationshipScore(89)).toBe(20)
  })

  it('returns 40 for exactly 90 days', () => {
    expect(computeRelationshipScore(90)).toBe(40)
  })

  it('returns 40 for exactly 179 days', () => {
    expect(computeRelationshipScore(179)).toBe(40)
  })

  it('returns 60 for exactly 180 days', () => {
    expect(computeRelationshipScore(180)).toBe(60)
  })

  it('returns 60 for exactly 364 days', () => {
    expect(computeRelationshipScore(364)).toBe(60)
  })

  it('returns 80 for exactly 365 days (one full year)', () => {
    expect(computeRelationshipScore(365)).toBe(80)
  })

  it('returns 80 for exactly 729 days', () => {
    expect(computeRelationshipScore(729)).toBe(80)
  })

  it('returns 100 for exactly 730 days (two full years)', () => {
    expect(computeRelationshipScore(730)).toBe(100)
  })

  it('returns 100 for multi-year relationships (1460 days = 4 years)', () => {
    expect(computeRelationshipScore(1460)).toBe(100)
  })

  it('score never exceeds 100', () => {
    expect(computeRelationshipScore(9999)).toBe(100)
  })

  it('score never goes below 20', () => {
    expect(computeRelationshipScore(0)).toBe(20)
  })
})

// ── computeOrderConsistencyScore — extended edge cases ────────────────────────

describe('computeOrderConsistencyScore — extended', () => {
  it('returns 0 for exactly 0 orders per month', () => {
    expect(computeOrderConsistencyScore(0)).toBe(0)
  })

  it('returns 0 for very small negative value', () => {
    expect(computeOrderConsistencyScore(-0.001)).toBe(0)
  })

  it('returns 100 for exactly 3 orders per month', () => {
    expect(computeOrderConsistencyScore(3)).toBe(100)
  })

  it('returns 100 for > 3 orders per month', () => {
    expect(computeOrderConsistencyScore(10)).toBe(100)
    expect(computeOrderConsistencyScore(100)).toBe(100)
  })

  it('interpolates between 0 and 0.5 correctly (0.25 → 15)', () => {
    // t=0.5, y0=0, y1=30 → 15
    const score = computeOrderConsistencyScore(0.25)
    expect(score).toBe(15)
  })

  it('interpolates between 0.5 and 1 (0.75 → 45)', () => {
    // t=0.5, y0=30, y1=60 → 45
    const score = computeOrderConsistencyScore(0.75)
    expect(score).toBe(45)
  })

  it('interpolates between 1 and 2 (1.5 → 70)', () => {
    // t=0.5, y0=60, y1=80 → 70
    const score = computeOrderConsistencyScore(1.5)
    expect(score).toBe(70)
  })

  it('interpolates between 2 and 3 (2.5 → 90)', () => {
    // t=0.5, y0=80, y1=100 → 90
    const score = computeOrderConsistencyScore(2.5)
    expect(score).toBe(90)
  })

  it('score at 0.1 orders per month is between 0 and 30', () => {
    const score = computeOrderConsistencyScore(0.1)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(30)
  })

  it('score at 2.9 orders per month is very close to 100', () => {
    const score = computeOrderConsistencyScore(2.9)
    expect(score).toBeGreaterThanOrEqual(90)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ── computeCreditScore — extended edge cases ──────────────────────────────────

describe('computeCreditScore — extended', () => {
  it('returns 0 when all inputs are 0', () => {
    expect(computeCreditScore(0, 0, 0, 0)).toBe(0)
  })

  it('returns 100 when all inputs are 100', () => {
    expect(computeCreditScore(100, 100, 100, 100)).toBe(100)
  })

  it('result is always between 0 and 100', () => {
    const result = computeCreditScore(75, 60, 80, 40)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('payment history has highest weight (40%)', () => {
    const phHigh = computeCreditScore(100, 0, 0, 0)
    const ocHigh = computeCreditScore(0, 100, 0, 0)
    const relHigh = computeCreditScore(0, 0, 100, 0)
    const volHigh = computeCreditScore(0, 0, 0, 100)
    expect(phHigh).toBeGreaterThan(ocHigh)
    expect(ocHigh).toBeGreaterThan(relHigh)
    expect(relHigh).toBeGreaterThan(volHigh)
  })

  it('weights sum to 100% (100/100/100/100 → 100)', () => {
    const score = computeCreditScore(100, 100, 100, 100)
    expect(score).toBe(100)
  })

  it('typical A-grade customer: 90/80/100/60 → 84', () => {
    // 90*0.4 + 80*0.3 + 100*0.2 + 60*0.1 = 36+24+20+6 = 86
    const score = computeCreditScore(90, 80, 100, 60)
    expect(score).toBe(86)
  })

  it('typical F-grade customer: 20/10/20/5 → 15', () => {
    // 20*0.4 + 10*0.3 + 20*0.2 + 5*0.1 = 8+3+4+0.5 = 15.5 → 16
    const score = computeCreditScore(20, 10, 20, 5)
    expect(score).toBe(16)
  })

  it('rounds to nearest integer', () => {
    const score = computeCreditScore(100, 100, 100, 100)
    expect(Number.isInteger(score)).toBe(true)
  })

  it('clamps negative inputs to 0', () => {
    expect(computeCreditScore(-100, -100, -100, -100)).toBe(0)
  })

  it('clamps above-100 inputs to 100', () => {
    expect(computeCreditScore(200, 200, 200, 200)).toBe(100)
  })
})

// ── creditScoreToGrade — extended boundary tests ──────────────────────────────

describe('creditScoreToGrade — extended boundaries', () => {
  it('score 80 is A (inclusive lower bound)', () => {
    expect(creditScoreToGrade(80)).toBe('A')
  })

  it('score 100 is A (maximum)', () => {
    expect(creditScoreToGrade(100)).toBe('A')
  })

  it('score 65 is B (inclusive lower bound)', () => {
    expect(creditScoreToGrade(65)).toBe('B')
  })

  it('score 79 is B (inclusive upper bound)', () => {
    expect(creditScoreToGrade(79)).toBe('B')
  })

  it('score 50 is C (inclusive lower bound)', () => {
    expect(creditScoreToGrade(50)).toBe('C')
  })

  it('score 64 is C (inclusive upper bound)', () => {
    expect(creditScoreToGrade(64)).toBe('C')
  })

  it('score 35 is D (inclusive lower bound)', () => {
    expect(creditScoreToGrade(35)).toBe('D')
  })

  it('score 49 is D (inclusive upper bound)', () => {
    expect(creditScoreToGrade(49)).toBe('D')
  })

  it('score 34 is F (highest F)', () => {
    expect(creditScoreToGrade(34)).toBe('F')
  })

  it('score 0 is F (minimum)', () => {
    expect(creditScoreToGrade(0)).toBe('F')
  })

  it('all grade boundaries are consistent with computeCreditScore', () => {
    expect(creditScoreToGrade(computeCreditScore(100, 100, 100, 100))).toBe('A')
    expect(creditScoreToGrade(computeCreditScore(0, 0, 0, 0))).toBe('F')
  })
})
