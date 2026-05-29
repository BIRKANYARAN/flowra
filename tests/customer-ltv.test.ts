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
