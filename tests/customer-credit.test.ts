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
})
