// ── tests/customer-credit-scoring.test.ts ────────────────────────────────────
// Unit tests for customer credit scoring pure functions.
// Run with: npx vitest run tests/customer-credit-scoring.test.ts

import { describe, it, expect } from 'vitest'
import {
  computeOnTimePaymentRate,
  computeAvgDaysToPay,
  computePaymentBehaviorScore,
  computeOutstandingRiskScore,
  computeOverdueRatio,
  computeOverdueRiskScore,
  computeTenureScore,
  computeOrderConsistencyScore,
  computeCreditScore,
  classifyCreditTier,
  computeSuggestedCreditLimit,
  generateCreditRecommendation,
  computePortfolioCreditRiskIndex,
  classifyPortfolioCreditRisk,
  generateCreditPortfolioNarrative,
} from '../lib/services/commercial/customer-credit-scoring.service'

// ── computeOnTimePaymentRate ──────────────────────────────────────────────────

describe('computeOnTimePaymentRate', () => {
  it('returns null when totalPaidInvoices is 0', () => {
    expect(computeOnTimePaymentRate(0, 0)).toBeNull()
  })

  it('returns 100 when all invoices paid on time', () => {
    expect(computeOnTimePaymentRate(10, 10)).toBe(100)
  })

  it('returns 50 for half on-time', () => {
    expect(computeOnTimePaymentRate(5, 10)).toBe(50)
  })

  it('returns 0 when none paid on time', () => {
    expect(computeOnTimePaymentRate(0, 10)).toBe(0)
  })

  it('returns correct pct for 3 out of 4', () => {
    expect(computeOnTimePaymentRate(3, 4)).toBe(75)
  })

  it('returns 100 when 1 of 1', () => {
    expect(computeOnTimePaymentRate(1, 1)).toBe(100)
  })

  it('handles fractional result', () => {
    expect(computeOnTimePaymentRate(1, 3)).toBeCloseTo(33.33, 1)
  })
})

// ── computeAvgDaysToPay ────────────────────────────────────────────────────────

describe('computeAvgDaysToPay', () => {
  it('returns null for empty array', () => {
    expect(computeAvgDaysToPay([])).toBeNull()
  })

  it('returns single payment days', () => {
    expect(computeAvgDaysToPay([{ days_to_pay: 5 }])).toBe(5)
  })

  it('returns average of multiple payments', () => {
    expect(computeAvgDaysToPay([{ days_to_pay: 0 }, { days_to_pay: 10 }])).toBe(5)
  })

  it('returns negative for early payments', () => {
    expect(computeAvgDaysToPay([{ days_to_pay: -5 }, { days_to_pay: -3 }])).toBe(-4)
  })

  it('returns zero when avg is zero', () => {
    expect(computeAvgDaysToPay([{ days_to_pay: -5 }, { days_to_pay: 5 }])).toBe(0)
  })

  it('handles late payments correctly', () => {
    expect(computeAvgDaysToPay([{ days_to_pay: 30 }, { days_to_pay: 60 }, { days_to_pay: 90 }])).toBe(60)
  })

  it('handles large number of payments', () => {
    const payments = Array.from({ length: 100 }, (_, i) => ({ days_to_pay: i }))
    expect(computeAvgDaysToPay(payments)).toBeCloseTo(49.5, 1)
  })
})

// ── computePaymentBehaviorScore ────────────────────────────────────────────────

describe('computePaymentBehaviorScore', () => {
  it('returns 20 (neutral) when both inputs are null', () => {
    expect(computePaymentBehaviorScore(null, null)).toBe(20)
  })

  it('returns max 40 for perfect on-time (100%) + very early payment (-15 days)', () => {
    // base: 100 * 0.30 = 30, speed bonus: +10 (< -7), total = 40
    const score = computePaymentBehaviorScore(100, -15)
    expect(score).toBe(40)
  })

  it('clamps to 40 even if raw calc exceeds 40', () => {
    const score = computePaymentBehaviorScore(100, -30)
    expect(score).toBeLessThanOrEqual(40)
  })

  it('applies -7 day boundary for speed bonus: exactly -7 gets +5 not +10', () => {
    // avgDays = -7: not < -7, but < 0 → +5
    const score = computePaymentBehaviorScore(100, -7)
    // 30 + 5 = 35
    expect(score).toBe(35)
  })

  it('applies speed bonus of +10 for avgDays < -7', () => {
    const score = computePaymentBehaviorScore(100, -8)
    expect(score).toBe(40)
  })

  it('applies speed bonus +5 for avgDays in [-7, 0)', () => {
    const score = computePaymentBehaviorScore(100, -1)
    // 30 + 5 = 35
    expect(score).toBe(35)
  })

  it('applies speed bonus +3 for avgDays in [0, 7)', () => {
    const score = computePaymentBehaviorScore(100, 3)
    // 30 + 3 = 33
    expect(score).toBe(33)
  })

  it('no speed bonus for avgDays >= 7', () => {
    const score = computePaymentBehaviorScore(100, 7)
    // 30 + 0 = 30
    expect(score).toBe(30)
  })

  it('applies penalty of -5 for avgDays > 30', () => {
    const score = computePaymentBehaviorScore(100, 31)
    // 30 + 0 - 5 = 25
    expect(score).toBe(25)
  })

  it('applies penalty of -10 for avgDays > 60', () => {
    const score = computePaymentBehaviorScore(100, 61)
    // 30 + 0 - 10 = 20
    expect(score).toBe(20)
  })

  it('clamps to 0 for very poor payment behavior', () => {
    const score = computePaymentBehaviorScore(0, 90)
    // 0 + 0 - 10 = -10 → clamped to 0
    expect(score).toBe(0)
  })

  it('handles 50% on-time + 15 days to pay', () => {
    // 50 * 0.30 = 15, no bonus, no penalty, total = 15
    const score = computePaymentBehaviorScore(50, 15)
    expect(score).toBe(15)
  })

  it('handles null onTimeRate with avgDays (uses fallback base)', () => {
    const score = computePaymentBehaviorScore(null, -10)
    // base fallback 15 + speed bonus 10 = 25
    expect(score).toBe(25)
  })

  it('handles null avgDays with onTimeRate (no bonus/penalty)', () => {
    const score = computePaymentBehaviorScore(80, null)
    // 80 * 0.30 = 24, no bonus, no penalty
    expect(score).toBe(24)
  })

  it('returns 0 minimum even with only penalty', () => {
    const score = computePaymentBehaviorScore(0, 100)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('returns at most 40', () => {
    const score = computePaymentBehaviorScore(100, -100)
    expect(score).toBeLessThanOrEqual(40)
  })
})

// ── computeOutstandingRiskScore ────────────────────────────────────────────────

describe('computeOutstandingRiskScore', () => {
  it('returns 20 when outstanding is 0', () => {
    expect(computeOutstandingRiskScore(0, 10000)).toBe(20)
  })

  it('returns 10 when avgMonthlyRevenue is null', () => {
    expect(computeOutstandingRiskScore(5000, null)).toBe(10)
  })

  it('returns 10 when avgMonthlyRevenue is 0', () => {
    expect(computeOutstandingRiskScore(5000, 0)).toBe(10)
  })

  it('returns 15 when outstanding < 0.5x monthly revenue', () => {
    expect(computeOutstandingRiskScore(4000, 10000)).toBe(15)
  })

  it('returns 10 when outstanding >= 0.5x and < 1.0x', () => {
    expect(computeOutstandingRiskScore(7000, 10000)).toBe(10)
  })

  it('returns 5 when outstanding >= 1.0x and < 2.0x', () => {
    expect(computeOutstandingRiskScore(15000, 10000)).toBe(5)
  })

  it('returns 0 when outstanding >= 2.0x', () => {
    expect(computeOutstandingRiskScore(20000, 10000)).toBe(0)
  })

  it('returns 15 at exact boundary: 0.5x - 1', () => {
    expect(computeOutstandingRiskScore(4999, 10000)).toBe(15)
  })

  it('returns 10 at exact 0.5x boundary', () => {
    // 5000 / 10000 = 0.5, not < 0.5, so → 10
    expect(computeOutstandingRiskScore(5000, 10000)).toBe(10)
  })

  it('returns 0 at exact 2.0x boundary', () => {
    expect(computeOutstandingRiskScore(20000, 10000)).toBe(0)
  })

  it('returns 5 at just below 2.0x', () => {
    expect(computeOutstandingRiskScore(19999, 10000)).toBe(5)
  })
})

// ── computeOverdueRatio ────────────────────────────────────────────────────────

describe('computeOverdueRatio', () => {
  it('returns null when totalOutstanding is 0', () => {
    expect(computeOverdueRatio(0, 0)).toBeNull()
  })

  it('returns 0 when overdueAmount is 0', () => {
    expect(computeOverdueRatio(0, 10000)).toBe(0)
  })

  it('returns 1 when all outstanding is overdue', () => {
    expect(computeOverdueRatio(10000, 10000)).toBe(1)
  })

  it('returns correct ratio for 50% overdue', () => {
    expect(computeOverdueRatio(5000, 10000)).toBe(0.5)
  })

  it('returns correct ratio for 25% overdue', () => {
    expect(computeOverdueRatio(2500, 10000)).toBe(0.25)
  })

  it('handles fractional ratio', () => {
    expect(computeOverdueRatio(1, 3)).toBeCloseTo(0.333, 3)
  })
})

// ── computeOverdueRiskScore ────────────────────────────────────────────────────

describe('computeOverdueRiskScore', () => {
  it('returns 20 for null ratio', () => {
    expect(computeOverdueRiskScore(null)).toBe(20)
  })

  it('returns 20 for 0% overdue', () => {
    expect(computeOverdueRiskScore(0)).toBe(20)
  })

  it('returns 16 for <= 10% overdue', () => {
    expect(computeOverdueRiskScore(5)).toBe(16)
  })

  it('returns 16 at exact 10% boundary', () => {
    expect(computeOverdueRiskScore(10)).toBe(16)
  })

  it('returns 12 for > 10% and <= 25% overdue', () => {
    expect(computeOverdueRiskScore(20)).toBe(12)
  })

  it('returns 12 at exact 25% boundary', () => {
    expect(computeOverdueRiskScore(25)).toBe(12)
  })

  it('returns 6 for > 25% and <= 50% overdue', () => {
    expect(computeOverdueRiskScore(40)).toBe(6)
  })

  it('returns 6 at exact 50% boundary', () => {
    expect(computeOverdueRiskScore(50)).toBe(6)
  })

  it('returns 0 for > 50% overdue', () => {
    expect(computeOverdueRiskScore(75)).toBe(0)
  })

  it('returns 0 for 100% overdue', () => {
    expect(computeOverdueRiskScore(100)).toBe(0)
  })

  it('returns 16 for 1% overdue', () => {
    expect(computeOverdueRiskScore(1)).toBe(16)
  })
})

// ── computeTenureScore ─────────────────────────────────────────────────────────

describe('computeTenureScore', () => {
  it('returns 0 for null input', () => {
    expect(computeTenureScore(null)).toBe(0)
  })

  it('returns 0 for < 90 days', () => {
    expect(computeTenureScore(89)).toBe(0)
  })

  it('returns 5 for exactly 90 days', () => {
    expect(computeTenureScore(90)).toBe(5)
  })

  it('returns 5 for 91-179 days', () => {
    expect(computeTenureScore(150)).toBe(5)
  })

  it('returns 10 for exactly 180 days', () => {
    expect(computeTenureScore(180)).toBe(10)
  })

  it('returns 10 for 181-364 days', () => {
    expect(computeTenureScore(270)).toBe(10)
  })

  it('returns 15 for exactly 365 days', () => {
    expect(computeTenureScore(365)).toBe(15)
  })

  it('returns 15 for 366-729 days', () => {
    expect(computeTenureScore(500)).toBe(15)
  })

  it('returns 20 for exactly 730 days', () => {
    expect(computeTenureScore(730)).toBe(20)
  })

  it('returns 20 for > 730 days', () => {
    expect(computeTenureScore(1000)).toBe(20)
  })

  it('returns 0 for 0 days', () => {
    expect(computeTenureScore(0)).toBe(0)
  })
})

// ── computeOrderConsistencyScore ───────────────────────────────────────────────

describe('computeOrderConsistencyScore', () => {
  it('returns 0 when totalMonthsInPeriod is 0', () => {
    expect(computeOrderConsistencyScore(5, 0)).toBe(0)
  })

  it('returns 20 for full consistency (all months have orders)', () => {
    expect(computeOrderConsistencyScore(24, 24)).toBe(20)
  })

  it('returns 10 for 50% consistency', () => {
    expect(computeOrderConsistencyScore(12, 24)).toBe(10)
  })

  it('returns 0 for 0 months with orders', () => {
    expect(computeOrderConsistencyScore(0, 24)).toBe(0)
  })

  it('caps at 20 even when monthsWithOrders > totalMonthsInPeriod', () => {
    expect(computeOrderConsistencyScore(30, 24)).toBe(20)
  })

  it('returns correct value for 1 month out of 12', () => {
    expect(computeOrderConsistencyScore(1, 12)).toBeCloseTo(1.67, 1)
  })

  it('returns proportional score for 6 of 24 months', () => {
    expect(computeOrderConsistencyScore(6, 24)).toBe(5)
  })

  it('returns 20 for 1 of 1', () => {
    expect(computeOrderConsistencyScore(1, 1)).toBe(20)
  })
})

// ── computeCreditScore ─────────────────────────────────────────────────────────

describe('computeCreditScore', () => {
  it('returns 0 for all zero inputs', () => {
    expect(computeCreditScore(0, 0, 0, 0, 0)).toBe(0)
  })

  it('returns 120 for max inputs', () => {
    expect(computeCreditScore(40, 20, 20, 20, 20)).toBe(120)
  })

  it('sums all components correctly', () => {
    expect(computeCreditScore(30, 15, 12, 10, 8)).toBe(75)
  })

  it('returns 40 for only payment behavior max', () => {
    expect(computeCreditScore(40, 0, 0, 0, 0)).toBe(40)
  })

  it('returns 20 for only outstanding risk max', () => {
    expect(computeCreditScore(0, 20, 0, 0, 0)).toBe(20)
  })

  it('handles partial scores', () => {
    expect(computeCreditScore(20, 10, 16, 15, 10)).toBe(71)
  })

  it('returns correct score for neutral scenario (20+10+20+0+0)', () => {
    expect(computeCreditScore(20, 10, 20, 0, 0)).toBe(50)
  })
})

// ── classifyCreditTier ─────────────────────────────────────────────────────────

describe('classifyCreditTier', () => {
  it('returns excellent for score >= 100', () => {
    expect(classifyCreditTier(100)).toBe('excellent')
  })

  it('returns excellent for score 120 (max)', () => {
    expect(classifyCreditTier(120)).toBe('excellent')
  })

  it('returns good for score >= 80 and < 100', () => {
    expect(classifyCreditTier(80)).toBe('good')
  })

  it('returns good for score 99', () => {
    expect(classifyCreditTier(99)).toBe('good')
  })

  it('returns fair for score >= 60 and < 80', () => {
    expect(classifyCreditTier(60)).toBe('fair')
  })

  it('returns fair for score 79', () => {
    expect(classifyCreditTier(79)).toBe('fair')
  })

  it('returns poor for score >= 40 and < 60', () => {
    expect(classifyCreditTier(40)).toBe('poor')
  })

  it('returns poor for score 59', () => {
    expect(classifyCreditTier(59)).toBe('poor')
  })

  it('returns very_poor for score < 40', () => {
    expect(classifyCreditTier(39)).toBe('very_poor')
  })

  it('returns very_poor for score 0', () => {
    expect(classifyCreditTier(0)).toBe('very_poor')
  })

  it('returns very_poor for score 1', () => {
    expect(classifyCreditTier(1)).toBe('very_poor')
  })
})

// ── computeSuggestedCreditLimit ────────────────────────────────────────────────

describe('computeSuggestedCreditLimit', () => {
  it('returns 0 for null avgMonthlyRevenue', () => {
    expect(computeSuggestedCreditLimit('excellent', null)).toBe(0)
  })

  it('returns 0 for 0 avgMonthlyRevenue', () => {
    expect(computeSuggestedCreditLimit('excellent', 0)).toBe(0)
  })

  it('returns 3x for excellent tier', () => {
    expect(computeSuggestedCreditLimit('excellent', 10000)).toBe(30000)
  })

  it('returns 2x for good tier', () => {
    expect(computeSuggestedCreditLimit('good', 10000)).toBe(20000)
  })

  it('returns 1x for fair tier', () => {
    expect(computeSuggestedCreditLimit('fair', 10000)).toBe(10000)
  })

  it('returns 0.5x for poor tier', () => {
    expect(computeSuggestedCreditLimit('poor', 10000)).toBe(5000)
  })

  it('returns 0 for very_poor tier', () => {
    expect(computeSuggestedCreditLimit('very_poor', 10000)).toBe(0)
  })

  it('returns 0 for very_poor even with high revenue', () => {
    expect(computeSuggestedCreditLimit('very_poor', 1000000)).toBe(0)
  })

  it('scales correctly with different revenue amounts', () => {
    expect(computeSuggestedCreditLimit('good', 5000)).toBe(10000)
  })
})

// ── generateCreditRecommendation ──────────────────────────────────────────────

describe('generateCreditRecommendation', () => {
  it('returns Turkish text for excellent tier, no flags', () => {
    const result = generateCreditRecommendation('excellent', false, false)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('Mükemmel')
  })

  it('returns Turkish text for good tier, no flags', () => {
    const result = generateCreditRecommendation('good', false, false)
    expect(result).toContain('İyi')
  })

  it('returns Turkish text for fair tier, no flags', () => {
    const result = generateCreditRecommendation('fair', false, false)
    expect(result).toContain('Orta')
  })

  it('returns Turkish text for poor tier, no flags', () => {
    const result = generateCreditRecommendation('poor', false, false)
    expect(result).toContain('Yüksek')
  })

  it('returns Turkish text for very_poor tier, no flags', () => {
    const result = generateCreditRecommendation('very_poor', false, false)
    expect(result).toContain('Çok yüksek')
  })

  it('appends overdue warning when hasOverdueBalance is true', () => {
    const withOverdue  = generateCreditRecommendation('good', true, false)
    const withoutOverdue = generateCreditRecommendation('good', false, false)
    expect(withOverdue).toContain('Gecikmiş')
    expect(withoutOverdue).not.toContain('Uyarı')
  })

  it('appends concentration warning when hasHighConcentration is true', () => {
    const result = generateCreditRecommendation('good', false, true)
    expect(result).toContain('yoğunlaşma')
  })

  it('includes both warnings when both flags are true', () => {
    const result = generateCreditRecommendation('fair', true, true)
    expect(result).toContain('Gecikmiş')
    expect(result).toContain('yoğunlaşma')
  })

  it('excellent + overdue produces distinct text from excellent alone', () => {
    const withFlag    = generateCreditRecommendation('excellent', true, false)
    const withoutFlag = generateCreditRecommendation('excellent', false, false)
    expect(withFlag).not.toBe(withoutFlag)
  })

  it('very_poor + all flags still returns string', () => {
    const result = generateCreditRecommendation('very_poor', true, true)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('all tiers produce distinct base texts', () => {
    const tiers = ['excellent', 'good', 'fair', 'poor', 'very_poor'] as const
    const texts = tiers.map(t => generateCreditRecommendation(t, false, false))
    const unique = new Set(texts)
    expect(unique.size).toBe(5)
  })
})

// ── computePortfolioCreditRiskIndex ───────────────────────────────────────────

describe('computePortfolioCreditRiskIndex', () => {
  it('returns null for empty array', () => {
    expect(computePortfolioCreditRiskIndex([])).toBeNull()
  })

  it('returns 0 for a perfect-score customer (120 score)', () => {
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 120, revenue_share_pct: 100 },
    ])
    expect(result).toBeCloseTo(0, 5)
  })

  it('returns 1 for a zero-score customer', () => {
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 0, revenue_share_pct: 100 },
    ])
    expect(result).toBeCloseTo(1, 5)
  })

  it('computes weighted average correctly', () => {
    // Customer A: score 120, 60% share → risk = 0
    // Customer B: score 0, 40% share → risk = 1
    // index = 0 * 0.6 + 1 * 0.4 = 0.4
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 120, revenue_share_pct: 60 },
      { credit_score: 0, revenue_share_pct: 40 },
    ])
    expect(result).toBeCloseTo(0.4, 5)
  })

  it('returns 0.5 for a customer with score 60 (half of 120)', () => {
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 60, revenue_share_pct: 100 },
    ])
    expect(result).toBeCloseTo(0.5, 5)
  })

  it('handles equal revenue shares correctly', () => {
    // Two customers: 80 and 40 score, 50% each
    // risk_80 = 1 - 80/120 = 0.333
    // risk_40 = 1 - 40/120 = 0.667
    // index = (0.333 + 0.667) / 2 = 0.5
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 80, revenue_share_pct: 50 },
      { credit_score: 40, revenue_share_pct: 50 },
    ])
    expect(result).toBeCloseTo(0.5, 5)
  })

  it('uses equal-weight fallback when all revenue_share_pct are 0', () => {
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 120, revenue_share_pct: 0 },
      { credit_score: 0, revenue_share_pct: 0 },
    ])
    // fallback equal weight: (0 + 1) / 2 = 0.5
    expect(result).toBeCloseTo(0.5, 5)
  })

  it('handles single customer with partial score', () => {
    const result = computePortfolioCreditRiskIndex([
      { credit_score: 90, revenue_share_pct: 100 },
    ])
    expect(result).toBeCloseTo(1 - 90 / 120, 5)
  })
})

// ── classifyPortfolioCreditRisk ────────────────────────────────────────────────

describe('classifyPortfolioCreditRisk', () => {
  it('returns no_data for null', () => {
    expect(classifyPortfolioCreditRisk(null)).toBe('no_data')
  })

  it('returns low for index < 0.20', () => {
    expect(classifyPortfolioCreditRisk(0.19)).toBe('low')
  })

  it('returns low for index = 0', () => {
    expect(classifyPortfolioCreditRisk(0)).toBe('low')
  })

  it('returns moderate for index = 0.20', () => {
    expect(classifyPortfolioCreditRisk(0.20)).toBe('moderate')
  })

  it('returns moderate for index < 0.40', () => {
    expect(classifyPortfolioCreditRisk(0.35)).toBe('moderate')
  })

  it('returns elevated for index = 0.40', () => {
    expect(classifyPortfolioCreditRisk(0.40)).toBe('elevated')
  })

  it('returns elevated for index < 0.60', () => {
    expect(classifyPortfolioCreditRisk(0.55)).toBe('elevated')
  })

  it('returns high for index = 0.60', () => {
    expect(classifyPortfolioCreditRisk(0.60)).toBe('high')
  })

  it('returns high for index > 0.60', () => {
    expect(classifyPortfolioCreditRisk(0.90)).toBe('high')
  })

  it('returns high for index = 1.0', () => {
    expect(classifyPortfolioCreditRisk(1.0)).toBe('high')
  })
})

// ── generateCreditPortfolioNarrative ──────────────────────────────────────────

describe('generateCreditPortfolioNarrative', () => {
  it('returns no_data message when risk is no_data', () => {
    const result = generateCreditPortfolioNarrative('no_data', 0, 0, 0)
    expect(result).toContain('yeterli')
  })

  it('returns low risk message', () => {
    const result = generateCreditPortfolioNarrative('low', 10, 7, 0)
    expect(result).toContain('düşük')
    expect(result).toContain('10')
    expect(result).toContain('7')
  })

  it('returns moderate risk message', () => {
    const result = generateCreditPortfolioNarrative('moderate', 15, 5, 2)
    expect(result).toContain('orta')
  })

  it('returns elevated risk message with very_poor count', () => {
    const result = generateCreditPortfolioNarrative('elevated', 20, 3, 5)
    expect(result).toContain('5')
  })

  it('returns high risk message', () => {
    const result = generateCreditPortfolioNarrative('high', 10, 0, 8)
    expect(result).toContain('Kritik')
  })

  it('all risk levels return distinct strings', () => {
    const risks = ['no_data', 'low', 'moderate', 'elevated', 'high'] as const
    const texts = risks.map(r => generateCreditPortfolioNarrative(r, 5, 1, 1))
    const unique = new Set(texts)
    expect(unique.size).toBe(5)
  })

  it('returns a non-empty string for all risk levels', () => {
    const risks = ['no_data', 'low', 'moderate', 'elevated', 'high'] as const
    for (const r of risks) {
      const result = generateCreditPortfolioNarrative(r, 5, 2, 1)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})
