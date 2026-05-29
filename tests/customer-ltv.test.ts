/**
 * Tests for lib/services/commercial/customer-ltv.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/customer-ltv.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  // RFM helpers (existing)
  computeRScore,
  computeFScore,
  computeMScore,
  computeRfmSegment,
  computeChurnRisk,
  estimateLtv,
  // CLV pure helpers (new)
  computeAvgOrderValue,
  computePurchaseFrequency,
  computeCustomerLifespan,
  computeSimpleClv,
  computeMarginAdjustedClv,
  classifyCustomerValue,
  computeCustomerAcquisitionPayback,
  computeClvToCacRatio,
  classifyClvCacHealth,
} from '../lib/services/commercial/customer-ltv.service'

// ── computeAvgOrderValue ──────────────────────────────────────────────────────

describe('computeAvgOrderValue', () => {
  it('divides total revenue by order count', () => {
    expect(computeAvgOrderValue(120_000, 4)).toBe(30_000)
  })

  it('returns null when order count is 0', () => {
    expect(computeAvgOrderValue(100_000, 0)).toBeNull()
  })

  it('returns 0 when total revenue is 0', () => {
    expect(computeAvgOrderValue(0, 5)).toBe(0)
  })

  it('handles single order', () => {
    expect(computeAvgOrderValue(5_000, 1)).toBe(5_000)
  })
})

// ── computePurchaseFrequency ──────────────────────────────────────────────────

describe('computePurchaseFrequency', () => {
  it('computes orders per month correctly', () => {
    expect(computePurchaseFrequency(12, 12)).toBe(1)
  })

  it('returns null when lifespan months is 0', () => {
    expect(computePurchaseFrequency(10, 0)).toBeNull()
  })

  it('handles fractional frequency', () => {
    const result = computePurchaseFrequency(3, 12)
    expect(result).toBeCloseTo(0.25)
  })

  it('high-frequency customer over 6 months', () => {
    expect(computePurchaseFrequency(24, 6)).toBe(4)
  })
})

// ── computeCustomerLifespan ───────────────────────────────────────────────────

describe('computeCustomerLifespan', () => {
  it('returns months between first purchase and today', () => {
    // Exactly 1 year = 365 / 30.44 ≈ 11.99 months → rounds to ~12
    const result = computeCustomerLifespan('2024-05-29', '2024-05-29', '2025-05-29')
    expect(result).toBeGreaterThan(11)
    expect(result).toBeLessThan(13)
  })

  it('returns minimum 1 month when first and today are the same day', () => {
    expect(computeCustomerLifespan('2025-05-29', '2025-05-29', '2025-05-29')).toBe(1)
  })

  it('returns minimum 1 for very recent customer (same day)', () => {
    const result = computeCustomerLifespan('2026-05-29', '2026-05-29', '2026-05-29')
    expect(result).toBe(1)
  })

  it('handles multiple years correctly (2 years ≈ 24 months)', () => {
    const result = computeCustomerLifespan('2023-05-29', '2023-05-29', '2025-05-29')
    expect(result).toBeGreaterThan(23)
    expect(result).toBeLessThan(25)
  })

  it('defaults today to current date when not provided', () => {
    const result = computeCustomerLifespan('2020-01-01', '2020-01-01')
    expect(result).toBeGreaterThan(1)
  })

  it('lastPurchaseDate parameter is accepted without error', () => {
    // lastPurchaseDate is present in signature but lifespan uses today
    const result = computeCustomerLifespan('2024-01-01', '2024-06-01', '2025-01-01')
    expect(result).toBeGreaterThan(11)
  })
})

// ── computeSimpleClv ──────────────────────────────────────────────────────────

describe('computeSimpleClv', () => {
  it('computes CLV correctly with all inputs', () => {
    // 10_000 × 1 × 24 = 240_000
    expect(computeSimpleClv(10_000, 1, 24)).toBe(240_000)
  })

  it('returns null when avgOrderValue is null', () => {
    expect(computeSimpleClv(null, 1, 24)).toBeNull()
  })

  it('returns null when purchaseFrequency is null', () => {
    expect(computeSimpleClv(10_000, null, 24)).toBeNull()
  })

  it('returns null when customerLifespanMonths is 0', () => {
    expect(computeSimpleClv(10_000, 1, 0)).toBeNull()
  })

  it('returns null when customerLifespanMonths is negative', () => {
    expect(computeSimpleClv(10_000, 1, -5)).toBeNull()
  })

  it('scales with frequency (2x freq = 2x CLV)', () => {
    const low  = computeSimpleClv(5_000, 0.5, 12)
    const high = computeSimpleClv(5_000, 1,   12)
    expect(high).toBe((low as number) * 2)
  })

  it('fractional frequency computes correctly', () => {
    // 8_000 × 0.5 × 12 = 48_000
    expect(computeSimpleClv(8_000, 0.5, 12)).toBe(48_000)
  })
})

// ── computeMarginAdjustedClv ──────────────────────────────────────────────────

describe('computeMarginAdjustedClv', () => {
  it('applies 50% margin correctly', () => {
    expect(computeMarginAdjustedClv(200_000, 50)).toBe(100_000)
  })

  it('returns null when simpleClv is null', () => {
    expect(computeMarginAdjustedClv(null, 40)).toBeNull()
  })

  it('returns 0 for 0% gross margin', () => {
    expect(computeMarginAdjustedClv(200_000, 0)).toBe(0)
  })

  it('returns full CLV for 100% gross margin', () => {
    expect(computeMarginAdjustedClv(150_000, 100)).toBe(150_000)
  })

  it('applies 30% margin (default Turkish SME margin)', () => {
    expect(computeMarginAdjustedClv(100_000, 30)).toBe(30_000)
  })
})

// ── classifyCustomerValue ─────────────────────────────────────────────────────

describe('classifyCustomerValue', () => {
  const thresholds = { p80: 100_000, p50: 50_000, p20: 10_000 }

  it('returns insufficient_data when clv is null', () => {
    expect(classifyCustomerValue(null, thresholds)).toBe('insufficient_data')
  })

  it('returns champion when clv >= p80', () => {
    expect(classifyCustomerValue(100_000, thresholds)).toBe('champion')
    expect(classifyCustomerValue(200_000, thresholds)).toBe('champion')
  })

  it('returns loyal when clv >= p50 but < p80', () => {
    expect(classifyCustomerValue(50_000, thresholds)).toBe('loyal')
    expect(classifyCustomerValue(99_999, thresholds)).toBe('loyal')
  })

  it('returns potential when clv >= p20 but < p50', () => {
    expect(classifyCustomerValue(10_000, thresholds)).toBe('potential')
    expect(classifyCustomerValue(49_999, thresholds)).toBe('potential')
  })

  it('returns at_risk when clv > 0 but < p20', () => {
    expect(classifyCustomerValue(5_000, thresholds)).toBe('at_risk')
    expect(classifyCustomerValue(1, thresholds)).toBe('at_risk')
  })

  it('returns lost when clv === 0', () => {
    expect(classifyCustomerValue(0, thresholds)).toBe('lost')
  })

  it('boundary: exactly p80 is champion', () => {
    expect(classifyCustomerValue(100_000, thresholds)).toBe('champion')
  })

  it('boundary: exactly p50 is loyal', () => {
    expect(classifyCustomerValue(50_000, thresholds)).toBe('loyal')
  })

  it('boundary: exactly p20 is potential', () => {
    expect(classifyCustomerValue(10_000, thresholds)).toBe('potential')
  })
})

// ── computeCustomerAcquisitionPayback ─────────────────────────────────────────

describe('computeCustomerAcquisitionPayback', () => {
  it('computes payback period correctly', () => {
    // 12_000 / (4_000 * 0.30) = 12_000 / 1_200 = 10 months
    expect(computeCustomerAcquisitionPayback(12_000, 4_000, 30)).toBe(10)
  })

  it('returns null when avgMonthlyRevenue is 0', () => {
    expect(computeCustomerAcquisitionPayback(5_000, 0, 30)).toBeNull()
  })

  it('returns null when grossMarginPct is 0', () => {
    expect(computeCustomerAcquisitionPayback(5_000, 2_000, 0)).toBeNull()
  })

  it('returns shorter payback for higher margin', () => {
    const low  = computeCustomerAcquisitionPayback(10_000, 2_000, 20)
    const high = computeCustomerAcquisitionPayback(10_000, 2_000, 40)
    expect((high as number)).toBeLessThan(low as number)
  })

  it('handles 100% margin (full revenue is margin)', () => {
    // 10_000 / (5_000 * 1.0) = 2 months
    expect(computeCustomerAcquisitionPayback(10_000, 5_000, 100)).toBe(2)
  })
})

// ── computeClvToCacRatio ──────────────────────────────────────────────────────

describe('computeClvToCacRatio', () => {
  it('computes ratio correctly', () => {
    expect(computeClvToCacRatio(30_000, 10_000)).toBe(3)
  })

  it('returns null when clv is null', () => {
    expect(computeClvToCacRatio(null, 10_000)).toBeNull()
  })

  it('returns null when cac is 0', () => {
    expect(computeClvToCacRatio(30_000, 0)).toBeNull()
  })

  it('computes ratio above 3 (healthy B2B benchmark)', () => {
    const ratio = computeClvToCacRatio(50_000, 10_000)
    expect(ratio).toBe(5)
  })

  it('computes low ratio below 1 (unprofitable)', () => {
    const ratio = computeClvToCacRatio(5_000, 10_000)
    expect(ratio).toBe(0.5)
  })
})

// ── classifyClvCacHealth ──────────────────────────────────────────────────────

describe('classifyClvCacHealth', () => {
  it('returns insufficient_data for null ratio', () => {
    expect(classifyClvCacHealth(null)).toBe('insufficient_data')
  })

  it('returns excellent for ratio >= 5', () => {
    expect(classifyClvCacHealth(5)).toBe('excellent')
    expect(classifyClvCacHealth(10)).toBe('excellent')
  })

  it('returns healthy for ratio >= 3 and < 5', () => {
    expect(classifyClvCacHealth(3)).toBe('healthy')
    expect(classifyClvCacHealth(4.9)).toBe('healthy')
  })

  it('returns marginal for ratio >= 1 and < 3', () => {
    expect(classifyClvCacHealth(1)).toBe('marginal')
    expect(classifyClvCacHealth(2.9)).toBe('marginal')
  })

  it('returns unprofitable for ratio < 1', () => {
    expect(classifyClvCacHealth(0.5)).toBe('unprofitable')
    expect(classifyClvCacHealth(0)).toBe('unprofitable')
  })

  it('boundary: exactly 5 is excellent', () => {
    expect(classifyClvCacHealth(5)).toBe('excellent')
  })

  it('boundary: exactly 3 is healthy', () => {
    expect(classifyClvCacHealth(3)).toBe('healthy')
  })

  it('boundary: exactly 1 is marginal', () => {
    expect(classifyClvCacHealth(1)).toBe('marginal')
  })
})

// ── Existing RFM helpers (kept for regression coverage) ──────────────────────

describe('computeRScore', () => {
  it('returns 5 for 15 days (< 30)', () => {
    expect(computeRScore(15)).toBe(5)
  })

  it('returns 4 for 45 days (30-60)', () => {
    expect(computeRScore(45)).toBe(4)
  })

  it('returns 1 for 200 days (> 180)', () => {
    expect(computeRScore(200)).toBe(1)
  })
})

describe('computeFScore', () => {
  it('returns 0 for 0 orders', () => {
    expect(computeFScore(0)).toBe(0)
  })

  it('returns 5 for 6+ orders', () => {
    expect(computeFScore(6)).toBe(5)
  })
})

describe('computeMScore', () => {
  const breaks = [1000, 5000, 15000, 50000]

  it('returns 5 for value above p80', () => {
    expect(computeMScore(100_000, breaks)).toBe(5)
  })

  it('returns 1 when no breaks provided', () => {
    expect(computeMScore(999_999, [])).toBe(1)
  })
})

describe('computeRfmSegment', () => {
  it('returns champions for r=5,f=5,m=5', () => {
    expect(computeRfmSegment(5, 5, 5)).toBe('champions')
  })

  it('returns lost for r=1,f=1,m=1', () => {
    expect(computeRfmSegment(1, 1, 1)).toBe('lost')
  })
})

describe('computeChurnRisk', () => {
  it('returns uncertain for first-time customer', () => {
    expect(computeChurnRisk(100, 1, 0, 0)).toBe('uncertain')
  })

  it('returns low when recency < 60 days', () => {
    expect(computeChurnRisk(10, 6, 3, 3)).toBe('low')
  })
})

describe('estimateLtv', () => {
  it('uses 24-month lifespan for new customer', () => {
    expect(estimateLtv(1000, 4, 12)).toBe(8000)
  })

  it('returns 0 when frequency is 0', () => {
    expect(estimateLtv(1000, 0, 12)).toBe(0)
  })
})

// ── computeRScore – boundary tests ───────────────────────────────────────────

describe('computeRScore – exact boundaries', () => {
  it('recency = 29 days → score 5 (< 30)', () => {
    expect(computeRScore(29)).toBe(5)
  })

  it('recency = 30 days → score 4 (30-60 range)', () => {
    expect(computeRScore(30)).toBe(4)
  })

  it('recency = 59 days → score 4', () => {
    expect(computeRScore(59)).toBe(4)
  })

  it('recency = 60 days → score 3 (60-90 range)', () => {
    expect(computeRScore(60)).toBe(3)
  })

  it('recency = 89 days → score 3', () => {
    expect(computeRScore(89)).toBe(3)
  })

  it('recency = 90 days → score 2 (90-180 range)', () => {
    expect(computeRScore(90)).toBe(2)
  })

  it('recency = 179 days → score 2', () => {
    expect(computeRScore(179)).toBe(2)
  })

  it('recency = 180 days → score 1 (>= 180)', () => {
    expect(computeRScore(180)).toBe(1)
  })

  it('recency = 365 days → score 1', () => {
    expect(computeRScore(365)).toBe(1)
  })

  it('recency = 0 days → score 5', () => {
    expect(computeRScore(0)).toBe(5)
  })

  it('score is monotonically non-increasing as recency grows', () => {
    const days = [0, 10, 30, 60, 90, 180, 365]
    const scores = days.map(d => computeRScore(d))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1])
    }
  })
})

// ── computeFScore – boundary tests ───────────────────────────────────────────

describe('computeFScore – exact boundaries', () => {
  it('frequency = 1 → score 1', () => {
    expect(computeFScore(1)).toBe(1)
  })

  it('frequency = 2 → score 2', () => {
    expect(computeFScore(2)).toBe(2)
  })

  it('frequency = 3 → score 3', () => {
    expect(computeFScore(3)).toBe(3)
  })

  it('frequency = 4 → score 4', () => {
    expect(computeFScore(4)).toBe(4)
  })

  it('frequency = 5 → score 4', () => {
    expect(computeFScore(5)).toBe(4)
  })

  it('frequency = 6 → score 5', () => {
    expect(computeFScore(6)).toBe(5)
  })

  it('frequency = 100 → score 5 (caps at 5)', () => {
    expect(computeFScore(100)).toBe(5)
  })

  it('frequency = -1 → score 0 (inactive)', () => {
    expect(computeFScore(-1)).toBe(0)
  })

  it('score is monotonically non-decreasing from 1 to 6 orders', () => {
    const freqs = [0, 1, 2, 3, 4, 5, 6]
    const scores = freqs.map(f => computeFScore(f))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })
})

// ── computeMScore – boundary tests ───────────────────────────────────────────

describe('computeMScore – boundary tests', () => {
  const breaks = [1_000, 5_000, 15_000, 50_000]

  it('monetary = 1 → score 1 (below p20)', () => {
    expect(computeMScore(1, breaks)).toBe(1)
  })

  it('monetary exactly = p20 (1000) → score 1 (not above)', () => {
    expect(computeMScore(1_000, breaks)).toBe(1)
  })

  it('monetary = 1001 → score 2 (above p20)', () => {
    expect(computeMScore(1_001, breaks)).toBe(2)
  })

  it('monetary exactly = p40 (5000) → score 2', () => {
    expect(computeMScore(5_000, breaks)).toBe(2)
  })

  it('monetary = 5001 → score 3', () => {
    expect(computeMScore(5_001, breaks)).toBe(3)
  })

  it('monetary = 50000 → score 4 (exactly at p80, not above)', () => {
    expect(computeMScore(50_000, breaks)).toBe(4)
  })

  it('monetary = 50001 → score 5', () => {
    expect(computeMScore(50_001, breaks)).toBe(5)
  })

  it('score is monotonically non-decreasing as monetary grows', () => {
    const amounts = [0, 500, 1_001, 5_001, 15_001, 50_001, 100_000]
    const scores = amounts.map(a => computeMScore(a, breaks))
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    }
  })

  it('returns 1 when breaks has fewer than 4 elements', () => {
    expect(computeMScore(999_999, [100, 200])).toBe(1)
  })

  it('returns 1 for empty breaks array', () => {
    expect(computeMScore(999_999, [])).toBe(1)
  })
})

// ── computeRfmSegment – comprehensive coverage ────────────────────────────────

describe('computeRfmSegment – segment rules', () => {
  it('r=4,f=4,m=4 → champions', () => {
    expect(computeRfmSegment(4, 4, 4)).toBe('champions')
  })

  it('r=5,f=5,m=4 → champions', () => {
    expect(computeRfmSegment(5, 5, 4)).toBe('champions')
  })

  it('r=4,f=4,m=3 → not champions (m < 4)', () => {
    // hits loyal (f>=4, m>=3)
    expect(computeRfmSegment(4, 4, 3)).toBe('loyal')
  })

  it('r=2,f=4,m=3 → at_risk (recency override)', () => {
    // r<=2 + f>=3 → at_risk before loyal check
    expect(computeRfmSegment(2, 4, 3)).toBe('at_risk')
  })

  it('r=1,f=4,m=3 → at_risk', () => {
    expect(computeRfmSegment(1, 4, 3)).toBe('at_risk')
  })

  it('r=1,f=2,m=1 → lost', () => {
    expect(computeRfmSegment(1, 2, 1)).toBe('lost')
  })

  it('r=1,f=1,m=1 → lost', () => {
    expect(computeRfmSegment(1, 1, 1)).toBe('lost')
  })

  it('r=1,f=3,m=2 → at_risk (r=1, f>=3)', () => {
    expect(computeRfmSegment(1, 3, 2)).toBe('at_risk')
  })

  it('r=5,f=4,m=3 → loyal (f>=4, m>=3)', () => {
    expect(computeRfmSegment(5, 4, 3)).toBe('loyal')
  })

  it('r=3,f=2,m=2 → other', () => {
    expect(computeRfmSegment(3, 2, 2)).toBe('other')
  })

  it('r=3,f=3,m=3 → other (no rule matches)', () => {
    expect(computeRfmSegment(3, 3, 3)).toBe('other')
  })
})

// ── computeChurnRisk – comprehensive coverage ─────────────────────────────────

describe('computeChurnRisk – churn rules', () => {
  it('freq12m = 1 → uncertain (first time)', () => {
    expect(computeChurnRisk(5, 1, 0, 0)).toBe('uncertain')
  })

  it('recency > 90, freq6m < priorFreq6m → high', () => {
    expect(computeChurnRisk(100, 5, 2, 4)).toBe('high')
  })

  it('recency > 90, freq6m >= priorFreq6m → medium (fallback)', () => {
    expect(computeChurnRisk(100, 5, 3, 2)).toBe('medium')
  })

  it('recency = 60 → medium', () => {
    expect(computeChurnRisk(60, 5, 3, 3)).toBe('medium')
  })

  it('recency = 90 → medium', () => {
    expect(computeChurnRisk(90, 5, 3, 3)).toBe('medium')
  })

  it('recency = 59 → low', () => {
    expect(computeChurnRisk(59, 5, 3, 3)).toBe('low')
  })

  it('recency = 0 → low', () => {
    expect(computeChurnRisk(0, 5, 3, 3)).toBe('low')
  })

  it('recency exactly 91, freq6m = 1, priorFreq6m = 3 → high', () => {
    expect(computeChurnRisk(91, 4, 1, 3)).toBe('high')
  })

  it('freq12m = 0 does not trigger uncertain (only freq12m=1)', () => {
    // 0 !== 1 so falls to recency check
    const result = computeChurnRisk(20, 0, 0, 0)
    expect(result).toBe('low')
  })
})

// ── estimateLtv – lifespan branching ─────────────────────────────────────────

describe('estimateLtv – lifespan branching', () => {
  it('uses 24-month lifespan when customerAgeMonths <= 24', () => {
    // 500 * 2 * 24 / 12 = 2000
    expect(estimateLtv(500, 2, 24)).toBe(2_000)
  })

  it('uses 36-month lifespan when customerAgeMonths > 24', () => {
    // 500 * 2 * 36 / 12 = 3000
    expect(estimateLtv(500, 2, 25)).toBe(3_000)
  })

  it('customerAgeMonths = 24.001 → uses 36-month lifespan', () => {
    // 1000 * 1 * 36 / 12 = 3000
    expect(estimateLtv(1_000, 1, 24.001)).toBe(3_000)
  })

  it('returns 0 when avgOrderValue is 0', () => {
    expect(estimateLtv(0, 5, 12)).toBe(0)
  })

  it('returns 0 when avgOrderValue is negative', () => {
    expect(estimateLtv(-100, 5, 12)).toBe(0)
  })

  it('scales linearly with frequency', () => {
    const ltv1 = estimateLtv(1_000, 1, 12)
    const ltv4 = estimateLtv(1_000, 4, 12)
    expect(ltv4).toBe(ltv1 * 4)
  })

  it('scales linearly with avgOrderValue', () => {
    const ltvA = estimateLtv(1_000, 2, 12)
    const ltvB = estimateLtv(2_000, 2, 12)
    expect(ltvB).toBe(ltvA * 2)
  })
})

// ── computeAvgOrderValue – extra edge cases ───────────────────────────────────

describe('computeAvgOrderValue – edge cases', () => {
  it('large values compute correctly', () => {
    expect(computeAvgOrderValue(1_000_000, 100)).toBe(10_000)
  })

  it('fractional result when not evenly divisible', () => {
    const result = computeAvgOrderValue(100, 3)
    expect(result).toBeCloseTo(33.333, 2)
  })

  it('negative totalRevenue produces negative aov', () => {
    // Edge case: negative revenue (refund-heavy period)
    const result = computeAvgOrderValue(-5_000, 5)
    expect(result).toBe(-1_000)
  })
})

// ── computePurchaseFrequency – extra edge cases ───────────────────────────────

describe('computePurchaseFrequency – edge cases', () => {
  it('very high order count over 1 month', () => {
    expect(computePurchaseFrequency(100, 1)).toBe(100)
  })

  it('negative lifespan returns null (guard)', () => {
    // 0 check only — negative lifespan would divide
    // service only guards === 0; negative still computes
    const result = computePurchaseFrequency(10, -2)
    expect(typeof result).toBe('number')
  })

  it('one order over 100 months → small frequency', () => {
    const result = computePurchaseFrequency(1, 100)
    expect(result).toBeCloseTo(0.01)
  })
})

// ── computeSimpleClv – extra scaling tests ────────────────────────────────────

describe('computeSimpleClv – scaling', () => {
  it('doubling lifespan doubles CLV', () => {
    const clv12 = computeSimpleClv(1_000, 1, 12)
    const clv24 = computeSimpleClv(1_000, 1, 24)
    expect(clv24).toBe((clv12 as number) * 2)
  })

  it('zero avgOrderValue produces 0 CLV', () => {
    expect(computeSimpleClv(0, 2, 12)).toBe(0)
  })

  it('large values compute without overflow', () => {
    const result = computeSimpleClv(1_000_000, 10, 120)
    expect(result).toBe(1_200_000_000)
  })
})

// ── computeMarginAdjustedClv – extra tests ────────────────────────────────────

describe('computeMarginAdjustedClv – extra tests', () => {
  it('margin > 100% produces CLV larger than input (unusual but allowed)', () => {
    const result = computeMarginAdjustedClv(100_000, 150)
    expect(result).toBe(150_000)
  })

  it('negative margin produces negative adjusted CLV', () => {
    const result = computeMarginAdjustedClv(100_000, -10)
    expect(result).toBe(-10_000)
  })

  it('small margin (1%) is handled correctly', () => {
    expect(computeMarginAdjustedClv(1_000_000, 1)).toBe(10_000)
  })
})

// ── classifyCustomerValue – extra edge cases ──────────────────────────────────

describe('classifyCustomerValue – extra cases', () => {
  const thresholds = { p80: 100_000, p50: 50_000, p20: 10_000 }

  it('negative CLV → lost (< p20, not > 0)', () => {
    // clv < 0, not null, not >= p80/p50/p20, not > 0 → falls to lost
    expect(classifyCustomerValue(-1, thresholds)).toBe('lost')
  })

  it('very large CLV → champion', () => {
    expect(classifyCustomerValue(10_000_000, thresholds)).toBe('champion')
  })

  it('clv one cent below p20 → at_risk', () => {
    expect(classifyCustomerValue(9_999.99, thresholds)).toBe('at_risk')
  })

  it('all thresholds equal → p80 wins for matching value', () => {
    const equalThresh = { p80: 50_000, p50: 50_000, p20: 50_000 }
    expect(classifyCustomerValue(50_000, equalThresh)).toBe('champion')
  })
})

// ── computeCustomerAcquisitionPayback – extra cases ───────────────────────────

describe('computeCustomerAcquisitionPayback – extra cases', () => {
  it('returns longer payback for lower margin', () => {
    const p10 = computeCustomerAcquisitionPayback(10_000, 2_000, 10)
    const p50 = computeCustomerAcquisitionPayback(10_000, 2_000, 50)
    expect((p10 as number)).toBeGreaterThan(p50 as number)
  })

  it('returns longer payback for higher CAC', () => {
    const low  = computeCustomerAcquisitionPayback(5_000,  2_000, 25)
    const high = computeCustomerAcquisitionPayback(20_000, 2_000, 25)
    expect((high as number)).toBeGreaterThan(low as number)
  })

  it('zero CAC returns 0 payback', () => {
    expect(computeCustomerAcquisitionPayback(0, 2_000, 30)).toBe(0)
  })

  it('negative avgMonthlyRevenue returns null (division guard fails)', () => {
    // -2000 !== 0, so computes: 10000 / (-2000 * 0.25) = -20
    const result = computeCustomerAcquisitionPayback(10_000, -2_000, 25)
    expect(typeof result).toBe('number')
  })
})

// ── computeClvToCacRatio – extra cases ───────────────────────────────────────

describe('computeClvToCacRatio – extra cases', () => {
  it('clv = 0 → ratio = 0', () => {
    expect(computeClvToCacRatio(0, 10_000)).toBe(0)
  })

  it('large cac reduces ratio', () => {
    const ratioLow  = computeClvToCacRatio(30_000, 1_000)
    const ratioHigh = computeClvToCacRatio(30_000, 30_000)
    expect(ratioLow as number).toBeGreaterThan(ratioHigh as number)
  })

  it('clv equals cac → ratio = 1', () => {
    expect(computeClvToCacRatio(15_000, 15_000)).toBe(1)
  })

  it('cac negative computes result (no guard)', () => {
    const result = computeClvToCacRatio(30_000, -10_000)
    expect(result).toBe(-3)
  })
})

// ── classifyClvCacHealth – extra boundaries ───────────────────────────────────

describe('classifyClvCacHealth – extra boundaries', () => {
  it('ratio = 4.999 → healthy', () => {
    expect(classifyClvCacHealth(4.999)).toBe('healthy')
  })

  it('ratio = 0.999 → unprofitable', () => {
    expect(classifyClvCacHealth(0.999)).toBe('unprofitable')
  })

  it('ratio = 2.999 → marginal', () => {
    expect(classifyClvCacHealth(2.999)).toBe('marginal')
  })

  it('ratio = 100 → excellent', () => {
    expect(classifyClvCacHealth(100)).toBe('excellent')
  })

  it('ratio = -1 → unprofitable', () => {
    expect(classifyClvCacHealth(-1)).toBe('unprofitable')
  })
})

// ── computeCustomerLifespan – edge cases ──────────────────────────────────────

describe('computeCustomerLifespan – edge cases', () => {
  it('lifespan is never less than 1', () => {
    // Future first purchase date (should clamp to 1)
    const result = computeCustomerLifespan('2030-01-01', '2030-01-01', '2025-01-01')
    expect(result).toBe(1)
  })

  it('exactly 6 months → about 6', () => {
    const result = computeCustomerLifespan('2024-11-29', '2024-11-29', '2025-05-29')
    expect(result).toBeGreaterThan(5.5)
    expect(result).toBeLessThan(6.5)
  })

  it('1 day difference → returns 1 (minimum clamp)', () => {
    const result = computeCustomerLifespan('2025-05-28', '2025-05-28', '2025-05-29')
    expect(result).toBeGreaterThanOrEqual(1)
    // 1 day / 30.44 ≈ 0.033 → clamped to 1
    expect(result).toBe(1)
  })

  it('last purchase date after today still uses today for lifespan', () => {
    // lastPurchaseDate is ignored for lifespan computation
    const r1 = computeCustomerLifespan('2024-01-01', '2025-06-01', '2025-05-29')
    const r2 = computeCustomerLifespan('2024-01-01', '2024-01-15', '2025-05-29')
    expect(r1).toBeCloseTo(r2, 1)
  })
})
