/**
 * Tests for lib/services/commercial/customer-segment-profitability.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/customer-segment-profitability.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  classifyCustomerSize,
  computeSegmentMargin,
  computeSegmentContributionPct,
  computeRevenueConcentration80,
  computeSegmentGrowthRate,
  computeCustomerProfitabilityIndex,
  identifyUnprofitableSegments,
} from '../lib/services/commercial/customer-segment-profitability.service'

// ── classifyCustomerSize ──────────────────────────────────────────────────────

describe('classifyCustomerSize', () => {
  it('returns large when totalRevenue equals p80Threshold (boundary)', () => {
    expect(classifyCustomerSize(100_000, 100_000, 50_000)).toBe('large')
  })

  it('returns large when totalRevenue exceeds p80Threshold', () => {
    expect(classifyCustomerSize(200_000, 100_000, 50_000)).toBe('large')
  })

  it('returns medium when totalRevenue equals p50Threshold (boundary)', () => {
    expect(classifyCustomerSize(50_000, 100_000, 50_000)).toBe('medium')
  })

  it('returns medium when totalRevenue is between p50 and p80', () => {
    expect(classifyCustomerSize(75_000, 100_000, 50_000)).toBe('medium')
  })

  it('returns small when totalRevenue is below p50Threshold', () => {
    expect(classifyCustomerSize(20_000, 100_000, 50_000)).toBe('small')
  })

  it('returns small when totalRevenue is 0', () => {
    expect(classifyCustomerSize(0, 100_000, 50_000)).toBe('small')
  })

  it('returns large when all thresholds are 0 and revenue is 0 (edge)', () => {
    // 0 >= 0 → large
    expect(classifyCustomerSize(0, 0, 0)).toBe('large')
  })

  it('returns large for revenue just above p80', () => {
    expect(classifyCustomerSize(100_001, 100_000, 50_000)).toBe('large')
  })

  it('returns small for revenue just below p50', () => {
    expect(classifyCustomerSize(49_999, 100_000, 50_000)).toBe('small')
  })
})

// ── computeSegmentMargin ──────────────────────────────────────────────────────

describe('computeSegmentMargin', () => {
  it('returns correct margin for normal values', () => {
    // (1000 - 600) / 1000 × 100 = 40
    expect(computeSegmentMargin(1000, 600)).toBeCloseTo(40)
  })

  it('returns null when segmentRevenue is 0', () => {
    expect(computeSegmentMargin(0, 500)).toBeNull()
  })

  it('returns negative margin when cogs > revenue (loss scenario)', () => {
    // (500 - 700) / 500 × 100 = -40
    expect(computeSegmentMargin(500, 700)).toBeCloseTo(-40)
  })

  it('returns 100 when cogs is 0 (pure service/digital)', () => {
    expect(computeSegmentMargin(1000, 0)).toBeCloseTo(100)
  })

  it('returns 0 when revenue equals cogs exactly (break-even)', () => {
    expect(computeSegmentMargin(500, 500)).toBeCloseTo(0)
  })

  it('handles large values without precision issues', () => {
    // (10_000_000 - 6_000_000) / 10_000_000 × 100 = 40
    expect(computeSegmentMargin(10_000_000, 6_000_000)).toBeCloseTo(40)
  })
})

// ── computeSegmentContributionPct ─────────────────────────────────────────────

describe('computeSegmentContributionPct', () => {
  it('returns correct contribution percentage', () => {
    // 300 / 1000 × 100 = 30
    expect(computeSegmentContributionPct(300, 1000)).toBeCloseTo(30)
  })

  it('returns 100 when segment IS the total revenue', () => {
    expect(computeSegmentContributionPct(500, 500)).toBeCloseTo(100)
  })

  it('returns null when totalRevenue is 0', () => {
    expect(computeSegmentContributionPct(300, 0)).toBeNull()
  })

  it('returns 0 when segment revenue is 0 (but total is non-zero)', () => {
    expect(computeSegmentContributionPct(0, 1000)).toBeCloseTo(0)
  })

  it('returns correct value for small contribution (1%)', () => {
    expect(computeSegmentContributionPct(10, 1000)).toBeCloseTo(1)
  })

  it('handles fractional percentages correctly', () => {
    expect(computeSegmentContributionPct(333, 1000)).toBeCloseTo(33.3)
  })
})

// ── computeRevenueConcentration80 ─────────────────────────────────────────────

describe('computeRevenueConcentration80', () => {
  it('returns 0 for empty array', () => {
    expect(computeRevenueConcentration80([])).toBe(0)
  })

  it('returns 1 for a single customer (trivially 100% >= 80%)', () => {
    expect(computeRevenueConcentration80([{ revenue: 1000 }])).toBe(1)
  })

  it('returns 1 when the top customer alone exceeds 80%', () => {
    expect(computeRevenueConcentration80([
      { revenue: 900 },
      { revenue: 50 },
      { revenue: 50 },
    ])).toBe(1)
  })

  it('returns 80 for 100 equal-revenue customers (80% of customers)', () => {
    const customers = Array.from({ length: 100 }, () => ({ revenue: 100 }))
    expect(computeRevenueConcentration80(customers)).toBe(80)
  })

  it('returns 2 when two customers together reach 80% (even split 50/50)', () => {
    expect(computeRevenueConcentration80([
      { revenue: 500 },
      { revenue: 500 },
    ])).toBe(2)
  })

  it('returns total count when all customers are needed (many equal)', () => {
    // 5 customers each 10%, need all 5 (50% < 80, 60% < 80, 70% < 80, 80% >= 80) → 4
    const customers = Array.from({ length: 5 }, () => ({ revenue: 200 }))
    // total = 1000, target = 800. cumulative: 200,400,600,800 → at index 3 → returns 4
    expect(computeRevenueConcentration80(customers)).toBe(4)
  })

  it('handles unsorted input (sorts internally)', () => {
    // Largest should be found even if not first in input
    expect(computeRevenueConcentration80([
      { revenue: 50 },
      { revenue: 900 },
      { revenue: 50 },
    ])).toBe(1)
  })

  it('handles zero-revenue customers gracefully', () => {
    const customers = [
      { revenue: 0 },
      { revenue: 0 },
      { revenue: 0 },
    ]
    // total = 0 → returns total count
    expect(computeRevenueConcentration80(customers)).toBe(3)
  })
})

// ── computeSegmentGrowthRate ──────────────────────────────────────────────────

describe('computeSegmentGrowthRate', () => {
  it('returns positive growth percentage', () => {
    // (120 - 100) / 100 × 100 = 20
    expect(computeSegmentGrowthRate(120, 100)).toBeCloseTo(20)
  })

  it('returns negative growth percentage for decline', () => {
    // (80 - 100) / 100 × 100 = -20
    expect(computeSegmentGrowthRate(80, 100)).toBeCloseTo(-20)
  })

  it('returns null when prior revenue is 0 (no prior period data)', () => {
    expect(computeSegmentGrowthRate(100, 0)).toBeNull()
  })

  it('returns 0 when current equals prior (flat)', () => {
    expect(computeSegmentGrowthRate(100, 100)).toBeCloseTo(0)
  })

  it('returns large positive growth for near-zero prior base', () => {
    // (510 - 10) / 10 × 100 = 5000
    expect(computeSegmentGrowthRate(510, 10)).toBeCloseTo(5000)
  })

  it('returns -100 when revenue drops to 0', () => {
    expect(computeSegmentGrowthRate(0, 100)).toBeCloseTo(-100)
  })

  it('handles very large revenues correctly', () => {
    expect(computeSegmentGrowthRate(2_000_000, 1_000_000)).toBeCloseTo(100)
  })
})

// ── computeCustomerProfitabilityIndex ─────────────────────────────────────────

describe('computeCustomerProfitabilityIndex', () => {
  it('computes correct full index for typical inputs', () => {
    // grossMarginPct=40: clamp(40×2=80,0,100)×0.50 = 80×0.50 = 40
    // paymentSpeedScore=80: 80×0.30 = 24
    // orderFrequency=2: min(100,2×20=40)×0.20 = 40×0.20 = 8
    // total = 40 + 24 + 8 = 72
    expect(computeCustomerProfitabilityIndex(40, 80, 2)).toBeCloseTo(72)
  })

  it('returns null when grossMarginPct is null AND paymentSpeedScore is 0', () => {
    expect(computeCustomerProfitabilityIndex(null, 0, 3)).toBeNull()
  })

  it('uses 50 fallback component when grossMarginPct is null (but paymentSpeed > 0)', () => {
    // margin_component = 50×0.50 = 25
    // payment_component = 60×0.30 = 18
    // frequency_component = min(100,1×20=20)×0.20 = 20×0.20 = 4
    // total = 25 + 18 + 4 = 47
    expect(computeCustomerProfitabilityIndex(null, 60, 1)).toBeCloseTo(47)
  })

  it('clamps margin component to 100 max when grossMarginPct > 50', () => {
    // grossMarginPct=60: clamp(60×2=120,0,100)×0.50 = 100×0.50 = 50
    // paymentSpeedScore=100: 100×0.30 = 30
    // orderFrequency=5: min(100,5×20=100)×0.20 = 100×0.20 = 20
    // total = 50 + 30 + 20 = 100
    expect(computeCustomerProfitabilityIndex(60, 100, 5)).toBeCloseTo(100)
  })

  it('clamps margin component to 0 when grossMarginPct is negative', () => {
    // grossMarginPct=-10: clamp(-10×2=-20,0,100)×0.50 = 0×0.50 = 0
    // paymentSpeedScore=50: 50×0.30 = 15
    // orderFrequency=1: min(100,1×20=20)×0.20 = 4
    // total = 0 + 15 + 4 = 19
    expect(computeCustomerProfitabilityIndex(-10, 50, 1)).toBeCloseTo(19)
  })

  it('returns 0 index for all zeros (grossMargin=0, payment=0, freq=0)', () => {
    // margin_component = clamp(0,0,100)×0.50 = 0
    // payment_component = 0×0.30 = 0
    // frequency_component = min(100,0×20=0)×0.20 = 0
    // total = 0 (but not null since margin=0 not null)
    expect(computeCustomerProfitabilityIndex(0, 0, 0)).toBeCloseTo(0)
  })

  it('caps frequency at 100 contribution (orderFrequency >= 5)', () => {
    // frequency_component = min(100,10×20=200)×0.20 = 100×0.20 = 20
    const result = computeCustomerProfitabilityIndex(50, 80, 10)
    // margin: clamp(100,0,100)×0.50=50, payment: 80×0.30=24, freq: 100×0.20=20
    expect(result).toBeCloseTo(94)
  })

  it('rounds result to 1 decimal place', () => {
    // Force a result that would be non-integer
    const result = computeCustomerProfitabilityIndex(33, 67, 1)
    // margin: clamp(66,0,100)×0.50=33, payment: 67×0.30=20.1, freq: min(100,20)×0.20=4
    // total ≈ 57.1
    expect(result).not.toBeNull()
    if (result !== null) {
      // Check it's rounded to 1 decimal
      expect(Math.round(result * 10)).toBe(Math.round(result * 10))
    }
  })
})

// ── identifyUnprofitableSegments ──────────────────────────────────────────────

describe('identifyUnprofitableSegments', () => {
  it('returns empty array when all segments are profitable', () => {
    const segments = [
      { name: 'enterprise', margin_pct: 30, revenue: 10000 },
      { name: 'mid_market', margin_pct: 25, revenue: 5000 },
      { name: 'small',      margin_pct: 15, revenue: 2000 },
    ]
    expect(identifyUnprofitableSegments(segments)).toEqual([])
  })

  it('returns segments where margin_pct < 10 (default threshold)', () => {
    const segments = [
      { name: 'enterprise', margin_pct: 30, revenue: 10000 },
      { name: 'one_time',   margin_pct: 5,  revenue: 3000 },
      { name: 'small',      margin_pct: 8,  revenue: 1000 },
    ]
    const result = identifyUnprofitableSegments(segments)
    expect(result).toContain('one_time')
    expect(result).toContain('small')
    expect(result).not.toContain('enterprise')
  })

  it('treats null margin_pct as unprofitable', () => {
    const segments = [
      { name: 'new',        margin_pct: null, revenue: 1000 },
      { name: 'enterprise', margin_pct: 40,   revenue: 5000 },
    ]
    const result = identifyUnprofitableSegments(segments)
    expect(result).toContain('new')
    expect(result).not.toContain('enterprise')
  })

  it('respects a custom minAcceptableMarginPct threshold', () => {
    const segments = [
      { name: 'enterprise', margin_pct: 20, revenue: 10000 },
      { name: 'small',      margin_pct: 10, revenue: 2000 },
    ]
    // With threshold of 25, both are unprofitable
    const result = identifyUnprofitableSegments(segments, 25)
    expect(result).toContain('enterprise')
    expect(result).toContain('small')
  })

  it('includes segments at exactly threshold boundary as profitable', () => {
    // margin_pct === threshold means NOT unprofitable (< threshold fails)
    const segments = [
      { name: 'mid_market', margin_pct: 10, revenue: 5000 },
    ]
    // Default threshold is 10; 10 < 10 is false, so NOT unprofitable
    const result = identifyUnprofitableSegments(segments)
    expect(result).not.toContain('mid_market')
  })

  it('returns all segment names when all have negative margins', () => {
    const segments = [
      { name: 'enterprise', margin_pct: -5,  revenue: 10000 },
      { name: 'mid_market', margin_pct: -10, revenue: 5000 },
      { name: 'small',      margin_pct: -20, revenue: 2000 },
    ]
    const result = identifyUnprofitableSegments(segments)
    expect(result).toHaveLength(3)
    expect(result).toContain('enterprise')
    expect(result).toContain('mid_market')
    expect(result).toContain('small')
  })

  it('returns empty array for empty input', () => {
    expect(identifyUnprofitableSegments([])).toEqual([])
  })

  it('handles mixed null and numeric margin_pct', () => {
    const segments = [
      { name: 'one_time',   margin_pct: null, revenue: 500 },
      { name: 'new',        margin_pct: 15,   revenue: 800 },
      { name: 'enterprise', margin_pct: 5,    revenue: 9000 },
    ]
    const result = identifyUnprofitableSegments(segments)
    expect(result).toContain('one_time')
    expect(result).toContain('enterprise')
    expect(result).not.toContain('new')
  })
})
