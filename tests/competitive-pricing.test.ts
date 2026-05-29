// ─────────────────────────────────────────────────────────────────────────────
// tests/competitive-pricing.test.ts
//
// Unit tests for all pure helper functions in competitive-pricing.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computePricePositionIndex,
  classifyPricePosition,
  computePriceDispersion,
  classifyPriceDispersion,
  computePriceElasticityFromHistory,
  classifyElasticity,
  computeOptimalPricePoint,
  computeRevenueImpact,
  computePriceSegmentGap,
  computePriceTrend,
  classifyPriceTrend,
  computePricingScore,
  classifyPricingScore,
  generatePricingNarrative,
} from '../lib/services/commercial/competitive-pricing.service'

// ── computePricePositionIndex ─────────────────────────────────────────────────

describe('computePricePositionIndex', () => {
  it('returns null when historical avg price is 0', () => {
    expect(computePricePositionIndex(100, 0)).toBeNull()
  })

  it('returns null when historical avg price is negative', () => {
    expect(computePricePositionIndex(100, -10)).toBeNull()
  })

  it('returns 0 when current equals historical', () => {
    expect(computePricePositionIndex(100, 100)).toBe(0)
  })

  it('returns positive index when current > historical', () => {
    expect(computePricePositionIndex(110, 100)).toBeCloseTo(0.1)
  })

  it('returns negative index when current < historical', () => {
    expect(computePricePositionIndex(90, 100)).toBeCloseTo(-0.1)
  })

  it('returns exactly 0.20 for 20% premium', () => {
    expect(computePricePositionIndex(120, 100)).toBeCloseTo(0.2)
  })

  it('returns exactly -0.20 for 20% discount', () => {
    expect(computePricePositionIndex(80, 100)).toBeCloseTo(-0.2)
  })

  it('handles fractional prices', () => {
    expect(computePricePositionIndex(10.5, 10.0)).toBeCloseTo(0.05)
  })

  it('handles very large prices', () => {
    expect(computePricePositionIndex(1_050_000, 1_000_000)).toBeCloseTo(0.05)
  })

  it('handles very small historical price just above 0', () => {
    const result = computePricePositionIndex(2, 1)
    expect(result).toBeCloseTo(1.0)
  })
})

// ── classifyPricePosition ─────────────────────────────────────────────────────

describe('classifyPricePosition', () => {
  it('returns no_data for null index', () => {
    expect(classifyPricePosition(null)).toBe('no_data')
  })

  it('returns premium for index > 0.10', () => {
    expect(classifyPricePosition(0.11)).toBe('premium')
  })

  it('returns premium for index = 0.20', () => {
    expect(classifyPricePosition(0.20)).toBe('premium')
  })

  it('returns slightly_premium for index exactly 0.10 (boundary: >0.03)', () => {
    // 0.10 is NOT > 0.10, so it should be slightly_premium
    expect(classifyPricePosition(0.10)).toBe('slightly_premium')
  })

  it('returns slightly_premium for index = 0.05', () => {
    expect(classifyPricePosition(0.05)).toBe('slightly_premium')
  })

  it('returns slightly_premium for index = 0.04', () => {
    expect(classifyPricePosition(0.04)).toBe('slightly_premium')
  })

  it('returns market_rate for index = 0.03 (boundary)', () => {
    expect(classifyPricePosition(0.03)).toBe('market_rate')
  })

  it('returns market_rate for index = 0', () => {
    expect(classifyPricePosition(0)).toBe('market_rate')
  })

  it('returns market_rate for index = -0.03 (boundary)', () => {
    expect(classifyPricePosition(-0.03)).toBe('market_rate')
  })

  it('returns market_rate for index = -0.02', () => {
    expect(classifyPricePosition(-0.02)).toBe('market_rate')
  })

  it('returns slightly_discount for index = -0.05', () => {
    expect(classifyPricePosition(-0.05)).toBe('slightly_discount')
  })

  it('returns slightly_discount for index = -0.10 (boundary)', () => {
    expect(classifyPricePosition(-0.10)).toBe('slightly_discount')
  })

  it('returns discount for index = -0.11', () => {
    expect(classifyPricePosition(-0.11)).toBe('discount')
  })

  it('returns discount for index = -0.50', () => {
    expect(classifyPricePosition(-0.50)).toBe('discount')
  })
})

// ── computePriceDispersion ────────────────────────────────────────────────────

describe('computePriceDispersion', () => {
  it('returns 0 for empty array', () => {
    expect(computePriceDispersion([])).toBe(0)
  })

  it('returns 0 for single-element array', () => {
    expect(computePriceDispersion([100])).toBe(0)
  })

  it('returns 0 for identical prices', () => {
    expect(computePriceDispersion([100, 100, 100])).toBe(0)
  })

  it('computes population std dev correctly', () => {
    // mean = 10, deviations = [-2, -1, 0, 1, 2], variance = 10/5=2
    expect(computePriceDispersion([8, 9, 10, 11, 12])).toBeCloseTo(Math.sqrt(2))
  })

  it('handles two-element array', () => {
    // mean=10, variance = ((10-10)^2 + (10-10)^2)/2... actually [8,12]: mean=10, var=(4+4)/2=4
    expect(computePriceDispersion([8, 12])).toBeCloseTo(2)
  })

  it('handles large price values', () => {
    const prices = [1000, 1000, 1000, 1000]
    expect(computePriceDispersion(prices)).toBe(0)
  })

  it('is always non-negative', () => {
    expect(computePriceDispersion([5, 10, 15, 20, 25])).toBeGreaterThanOrEqual(0)
  })
})

// ── classifyPriceDispersion ───────────────────────────────────────────────────

describe('classifyPriceDispersion', () => {
  it('returns no_data for empty array', () => {
    expect(classifyPriceDispersion([])).toBe('no_data')
  })

  it('returns no_data for null-ish input (empty)', () => {
    expect(classifyPriceDispersion([])).toBe('no_data')
  })

  it('returns no_data when all prices are 0 (mean=0)', () => {
    expect(classifyPriceDispersion([0, 0, 0])).toBe('no_data')
  })

  it('returns tight for cv < 0.03 (identical prices)', () => {
    expect(classifyPriceDispersion([100, 100, 100, 100])).toBe('tight')
  })

  it('returns tight for cv just below 0.03', () => {
    // mean=100, std≈2 => cv=0.02
    expect(classifyPriceDispersion([98, 100, 102])).toBe('tight')
  })

  it('returns normal for cv between 0.03 and 0.08', () => {
    // mean=100, std≈5 => cv=0.05
    expect(classifyPriceDispersion([95, 100, 105])).toBe('normal')
  })

  it('returns loose for cv between 0.08 and 0.15', () => {
    // mean=100, std≈10 => cv=0.10
    expect(classifyPriceDispersion([90, 100, 110])).toBe('loose')
  })

  it('returns erratic for cv >= 0.15', () => {
    // mean=100, std≈20 => cv=0.20
    expect(classifyPriceDispersion([80, 100, 120])).toBe('erratic')
  })

  it('returns tight for single-element array (cv=0)', () => {
    expect(classifyPriceDispersion([100])).toBe('tight')
  })
})

// ── computePriceElasticityFromHistory ─────────────────────────────────────────

describe('computePriceElasticityFromHistory', () => {
  it('returns null for empty array', () => {
    expect(computePriceElasticityFromHistory([])).toBeNull()
  })

  it('returns null for single-element array', () => {
    expect(computePriceElasticityFromHistory([{ avg_price: 100, total_units: 50 }])).toBeNull()
  })

  it('returns null when price does not change', () => {
    const periods = [
      { avg_price: 100, total_units: 50 },
      { avg_price: 100, total_units: 60 },
    ]
    expect(computePriceElasticityFromHistory(periods)).toBeNull()
  })

  it('returns null when all prices are the same across multiple periods', () => {
    const periods = [
      { avg_price: 100, total_units: 50 },
      { avg_price: 100, total_units: 60 },
      { avg_price: 100, total_units: 70 },
    ]
    expect(computePriceElasticityFromHistory(periods)).toBeNull()
  })

  it('computes negative elasticity when price up, quantity down', () => {
    // Classic elastic demand
    const periods = [
      { avg_price: 100, total_units: 100 },
      { avg_price: 110, total_units: 80 },
    ]
    const result = computePriceElasticityFromHistory(periods)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('computes positive elasticity when price up, quantity also up (Giffen-like)', () => {
    const periods = [
      { avg_price: 100, total_units: 50 },
      { avg_price: 110, total_units: 60 },
    ]
    const result = computePriceElasticityFromHistory(periods)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('averages elasticities across multiple periods', () => {
    const periods = [
      { avg_price: 100, total_units: 100 },
      { avg_price: 110, total_units: 80 },
      { avg_price: 100, total_units: 100 },
    ]
    const result = computePriceElasticityFromHistory(periods)
    expect(result).not.toBeNull()
    // Should average two symmetric pairs
  })

  it('skips pairs where midpoint price is 0', () => {
    const periods = [
      { avg_price: 0, total_units: 50 },
      { avg_price: 0, total_units: 60 },
    ]
    expect(computePriceElasticityFromHistory(periods)).toBeNull()
  })
})

// ── classifyElasticity ────────────────────────────────────────────────────────

describe('classifyElasticity', () => {
  it('returns unknown for null', () => {
    expect(classifyElasticity(null)).toBe('unknown')
  })

  it('returns elastic for |e| > 1 (negative)', () => {
    expect(classifyElasticity(-1.5)).toBe('elastic')
  })

  it('returns elastic for |e| > 1 (positive)', () => {
    expect(classifyElasticity(1.5)).toBe('elastic')
  })

  it('returns inelastic for |e| = 1 (boundary)', () => {
    expect(classifyElasticity(1)).toBe('inelastic')
  })

  it('returns inelastic for |e| < 1', () => {
    expect(classifyElasticity(-0.5)).toBe('inelastic')
  })

  it('returns inelastic for e = 0', () => {
    expect(classifyElasticity(0)).toBe('inelastic')
  })

  it('returns elastic for very large absolute value', () => {
    expect(classifyElasticity(-10)).toBe('elastic')
  })
})

// ── computeOptimalPricePoint ──────────────────────────────────────────────────

describe('computeOptimalPricePoint', () => {
  it('reduces price by 5% for elastic demand', () => {
    expect(computeOptimalPricePoint(100, 'elastic')).toBeCloseTo(95)
  })

  it('increases price by 5% for inelastic demand', () => {
    expect(computeOptimalPricePoint(100, 'inelastic')).toBeCloseTo(105)
  })

  it('returns current price unchanged for unknown elasticity', () => {
    expect(computeOptimalPricePoint(100, 'unknown')).toBe(100)
  })

  it('handles fractional prices for elastic', () => {
    expect(computeOptimalPricePoint(200, 'elastic')).toBeCloseTo(190)
  })

  it('handles fractional prices for inelastic', () => {
    expect(computeOptimalPricePoint(200, 'inelastic')).toBeCloseTo(210)
  })

  it('handles zero price', () => {
    expect(computeOptimalPricePoint(0, 'elastic')).toBe(0)
    expect(computeOptimalPricePoint(0, 'inelastic')).toBe(0)
  })
})

// ── computeRevenueImpact ──────────────────────────────────────────────────────

describe('computeRevenueImpact', () => {
  it('returns 0 when current price is 0', () => {
    expect(computeRevenueImpact(0, 105, 100_000)).toBe(0)
  })

  it('returns positive impact when optimal > current', () => {
    expect(computeRevenueImpact(100, 105, 100_000)).toBeCloseTo(5_000)
  })

  it('returns negative impact when optimal < current', () => {
    expect(computeRevenueImpact(100, 95, 100_000)).toBeCloseTo(-5_000)
  })

  it('returns 0 when optimal equals current', () => {
    expect(computeRevenueImpact(100, 100, 100_000)).toBe(0)
  })

  it('returns 0 when annual revenue is 0', () => {
    expect(computeRevenueImpact(100, 105, 0)).toBe(0)
  })

  it('scales proportionally with annual revenue', () => {
    expect(computeRevenueImpact(100, 110, 1_000_000)).toBeCloseTo(100_000)
  })
})

// ── computePriceSegmentGap ────────────────────────────────────────────────────

describe('computePriceSegmentGap', () => {
  it('returns 0 for empty array', () => {
    expect(computePriceSegmentGap([])).toBe(0)
  })

  it('returns 0 for single-element array', () => {
    expect(computePriceSegmentGap([100])).toBe(0)
  })

  it('returns correct gap for two prices', () => {
    expect(computePriceSegmentGap([80, 120])).toBe(40)
  })

  it('returns correct gap for multiple prices', () => {
    expect(computePriceSegmentGap([50, 75, 100, 125, 150])).toBe(100)
  })

  it('returns 0 for all identical prices', () => {
    expect(computePriceSegmentGap([100, 100, 100])).toBe(0)
  })

  it('handles negative prices (returns absolute gap)', () => {
    // min=-10, max=10 → gap=20
    expect(computePriceSegmentGap([-10, 0, 10])).toBe(20)
  })
})

// ── computePriceTrend ─────────────────────────────────────────────────────────

describe('computePriceTrend', () => {
  it('returns null for empty array', () => {
    expect(computePriceTrend([])).toBeNull()
  })

  it('returns null for 1 data point', () => {
    expect(computePriceTrend([100])).toBeNull()
  })

  it('returns null for 2 data points', () => {
    expect(computePriceTrend([100, 110])).toBeNull()
  })

  it('returns positive slope for increasing prices', () => {
    const result = computePriceTrend([100, 110, 120])
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('returns negative slope for decreasing prices', () => {
    const result = computePriceTrend([120, 110, 100])
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('returns ~0 slope for flat prices', () => {
    const result = computePriceTrend([100, 100, 100, 100, 100])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0)
  })

  it('computes slope of 10 for linear increase by 10/month', () => {
    // [100, 110, 120] → slope should be exactly 10
    const result = computePriceTrend([100, 110, 120])
    expect(result).toBeCloseTo(10)
  })

  it('handles 12 months of data', () => {
    const prices = Array.from({ length: 12 }, (_, i) => 100 + i * 5)
    const result = computePriceTrend(prices)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })
})

// ── classifyPriceTrend ────────────────────────────────────────────────────────

describe('classifyPriceTrend', () => {
  it('returns no_data for null slope', () => {
    expect(classifyPriceTrend(null, 100)).toBe('no_data')
  })

  it('returns no_data when avgPrice <= 0', () => {
    expect(classifyPriceTrend(5, 0)).toBe('no_data')
    expect(classifyPriceTrend(5, -10)).toBe('no_data')
  })

  it('returns increasing for slope/avg > 0.02', () => {
    // slope=5, avg=100 → 0.05 > 0.02 → increasing
    expect(classifyPriceTrend(5, 100)).toBe('increasing')
  })

  it('returns decreasing for slope/avg < -0.02', () => {
    expect(classifyPriceTrend(-5, 100)).toBe('decreasing')
  })

  it('returns stable for slope/avg = 0', () => {
    expect(classifyPriceTrend(0, 100)).toBe('stable')
  })

  it('returns stable for slope/avg = 0.01 (within ±0.02)', () => {
    expect(classifyPriceTrend(1, 100)).toBe('stable')
  })

  it('returns stable for slope/avg = -0.01', () => {
    expect(classifyPriceTrend(-1, 100)).toBe('stable')
  })

  it('returns increasing for slope/avg exactly 0.02 + epsilon', () => {
    expect(classifyPriceTrend(2.1, 100)).toBe('increasing')
  })

  it('returns decreasing for slope/avg exactly -0.02 - epsilon', () => {
    expect(classifyPriceTrend(-2.1, 100)).toBe('decreasing')
  })
})

// ── computePricingScore ───────────────────────────────────────────────────────

describe('computePricingScore', () => {
  it('returns max score for tight/premium/increasing', () => {
    // 100*0.35 + 90*0.35 + 90*0.30 = 35 + 31.5 + 27 = 93.5
    expect(computePricingScore('tight', 'premium', 'increasing')).toBeCloseTo(93.5)
  })

  it('returns same score for tight/slightly_premium/increasing', () => {
    expect(computePricingScore('tight', 'slightly_premium', 'increasing')).toBeCloseTo(93.5)
  })

  it('returns correct score for normal/market_rate/stable', () => {
    // 75*0.35 + 70*0.35 + 70*0.30 = 26.25 + 24.5 + 21 = 71.75
    expect(computePricingScore('normal', 'market_rate', 'stable')).toBeCloseTo(71.75)
  })

  it('returns lowest score for erratic/discount/decreasing', () => {
    // 0*0.35 + 0*0.35 + 30*0.30 = 0 + 0 + 9 = 9
    expect(computePricingScore('erratic', 'discount', 'decreasing')).toBeCloseTo(9)
  })

  it('uses 50 fallback for no_data dispersion', () => {
    // 50*0.35 + 70*0.35 + 70*0.30 = 17.5 + 24.5 + 21 = 63
    expect(computePricingScore('no_data', 'market_rate', 'stable')).toBeCloseTo(63)
  })

  it('uses 50 fallback for no_data position', () => {
    expect(computePricingScore('normal', 'no_data', 'stable')).toBeCloseTo(26.25 + 17.5 + 21)
  })

  it('uses 50 fallback for no_data trend', () => {
    expect(computePricingScore('normal', 'market_rate', 'no_data')).toBeCloseTo(26.25 + 24.5 + 15)
  })

  it('score for loose/slightly_discount/decreasing', () => {
    // 40*0.35 + 40*0.35 + 30*0.30 = 14 + 14 + 9 = 37
    expect(computePricingScore('loose', 'slightly_discount', 'decreasing')).toBeCloseTo(37)
  })

  it('always returns a number between 0 and 100', () => {
    const score = computePricingScore('erratic', 'no_data', 'decreasing')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ── classifyPricingScore ──────────────────────────────────────────────────────

describe('classifyPricingScore', () => {
  it('returns strong for score >= 75', () => {
    expect(classifyPricingScore(75)).toBe('strong')
    expect(classifyPricingScore(90)).toBe('strong')
    expect(classifyPricingScore(100)).toBe('strong')
  })

  it('returns fair for score >= 55 and < 75', () => {
    expect(classifyPricingScore(55)).toBe('fair')
    expect(classifyPricingScore(65)).toBe('fair')
    expect(classifyPricingScore(74.9)).toBe('fair')
  })

  it('returns weak for score >= 35 and < 55', () => {
    expect(classifyPricingScore(35)).toBe('weak')
    expect(classifyPricingScore(45)).toBe('weak')
    expect(classifyPricingScore(54.9)).toBe('weak')
  })

  it('returns critical for score < 35', () => {
    expect(classifyPricingScore(34.9)).toBe('critical')
    expect(classifyPricingScore(0)).toBe('critical')
    expect(classifyPricingScore(10)).toBe('critical')
  })

  it('boundary: exactly 75 is strong', () => {
    expect(classifyPricingScore(75)).toBe('strong')
  })

  it('boundary: exactly 55 is fair', () => {
    expect(classifyPricingScore(55)).toBe('fair')
  })

  it('boundary: exactly 35 is weak', () => {
    expect(classifyPricingScore(35)).toBe('weak')
  })
})

// ── generatePricingNarrative ──────────────────────────────────────────────────

describe('generatePricingNarrative', () => {
  it('returns a non-empty string', () => {
    const result = generatePricingNarrative('Ürün A', 'market_rate', 'inelastic', 70, 5000)
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the product name', () => {
    const result = generatePricingNarrative('Laptop Pro', 'premium', 'elastic', 85, 10000)
    expect(result).toContain('Laptop Pro')
  })

  it('includes score value', () => {
    const result = generatePricingNarrative('Ürün B', 'market_rate', 'unknown', 71.75, 0)
    expect(result).toContain('72') // rounded
  })

  it('includes score label in Turkish for strong', () => {
    const result = generatePricingNarrative('Ürün B', 'premium', 'inelastic', 90, 5000)
    expect(result).toContain('güçlü')
  })

  it('includes score label in Turkish for fair', () => {
    const result = generatePricingNarrative('Ürün C', 'market_rate', 'inelastic', 65, 0)
    expect(result).toContain('orta')
  })

  it('includes score label in Turkish for weak', () => {
    const result = generatePricingNarrative('Ürün D', 'discount', 'elastic', 40, -3000)
    expect(result).toContain('zayıf')
  })

  it('includes score label in Turkish for critical', () => {
    const result = generatePricingNarrative('Ürün E', 'discount', 'elastic', 20, -10000)
    expect(result).toContain('kritik')
  })

  it('includes positive revenue impact with + sign', () => {
    const result = generatePricingNarrative('Ürün F', 'inelastic' as any, 'inelastic', 70, 5000)
    expect(result).toContain('+')
  })

  it('includes negative revenue impact without + sign', () => {
    const result = generatePricingNarrative('Ürün G', 'discount', 'elastic', 30, -5000)
    expect(result).not.toMatch(/\+-/)
  })

  it('handles zero revenue impact', () => {
    const result = generatePricingNarrative('Ürün H', 'market_rate', 'unknown', 70, 0)
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
  })

  it('mentions premium position in Turkish', () => {
    const result = generatePricingNarrative('Ürün I', 'premium', 'inelastic', 80, 1000)
    expect(result).toContain('premium')
  })

  it('mentions discount position in Turkish', () => {
    const result = generatePricingNarrative('Ürün J', 'discount', 'elastic', 30, -1000)
    expect(result).toContain('indirimli')
  })

  it('mentions no_data position in Turkish', () => {
    const result = generatePricingNarrative('Ürün K', 'no_data', 'unknown', 50, 0)
    expect(result).toContain('yetersiz veri')
  })
})

// ── Integration: classifyPriceDispersion edge cases ───────────────────────────

describe('classifyPriceDispersion edge cases', () => {
  it('handles prices with high variance correctly', () => {
    // mean=100, prices spread widely → erratic
    expect(classifyPriceDispersion([50, 75, 100, 125, 150])).toBe('erratic')
  })

  it('handles two-element tight array', () => {
    // mean=100, std=1, cv=0.01 → tight
    expect(classifyPriceDispersion([99, 101])).toBe('tight')
  })
})

// ── Integration: full pipeline ────────────────────────────────────────────────

describe('Full pricing analysis pipeline', () => {
  it('computes consistent result for a typical product', () => {
    const prices = [98, 100, 102, 101, 99]
    const periods = [
      { avg_price: 95, total_units: 100 },
      { avg_price: 100, total_units: 90 },
      { avg_price: 105, total_units: 80 },
    ]
    const monthlyPrices = [95, 100, 105]

    const currentAvg = 105
    const historicalAvg = 100
    const annualRevenue = 500_000

    const posIndex = computePricePositionIndex(currentAvg, historicalAvg)
    const posClass = classifyPricePosition(posIndex)
    const dispersion = computePriceDispersion(prices)
    const dispClass = classifyPriceDispersion(prices)
    const elasticity = computePriceElasticityFromHistory(periods)
    const elasClass = classifyElasticity(elasticity)
    const optimal = computeOptimalPricePoint(currentAvg, elasClass)
    const impact = computeRevenueImpact(currentAvg, optimal, annualRevenue)
    const slope = computePriceTrend(monthlyPrices)
    const trendClass = classifyPriceTrend(slope, historicalAvg)
    const score = computePricingScore(dispClass, posClass, trendClass)
    const scoreClass = classifyPricingScore(score)
    const narrative = generatePricingNarrative('Test Ürünü', posClass, elasClass, score, impact)

    expect(posClass).not.toBe('no_data')
    expect(dispClass).toBe('tight')
    expect(scoreClass).toBeDefined()
    expect(narrative).toContain('Test Ürünü')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('handles all no_data scenario gracefully', () => {
    const score = computePricingScore('no_data', 'no_data', 'no_data')
    // 50*0.35 + 50*0.35 + 50*0.30 = 17.5 + 17.5 + 15 = 50
    expect(score).toBeCloseTo(50)
    // 50 < 55 → 'weak'
    expect(classifyPricingScore(score)).toBe('weak')
  })

  it('segment gap works correctly in pipeline', () => {
    const allPrices = [80, 90, 100, 110, 120]
    const gap = computePriceSegmentGap(allPrices)
    expect(gap).toBe(40)
  })
})
