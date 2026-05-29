/**
 * Tests for pure helper functions in price-optimization.service.ts
 *
 * 120+ tests covering:
 *   - computeDiscountRate
 *   - classifyDiscountLevel
 *   - computeAvgDiscountRate
 *   - computeDiscountFrequency
 *   - computeRevenueLostToDiscounts
 *   - computePriceRealizationRate
 *   - classifyPriceRealization
 *   - computeModalPrice
 *   - computePriceCoefficientOfVariation
 *   - classifyPriceConsistency
 *   - computeMinViablePrice
 *   - detectBelowFloorSales
 *   - computeOptimalPriceRecommendation
 *   - generatePriceOptimizationNarrative
 *
 * Run with: npx vitest run tests/price-optimization.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDiscountRate,
  classifyDiscountLevel,
  computeAvgDiscountRate,
  computeDiscountFrequency,
  computeRevenueLostToDiscounts,
  computePriceRealizationRate,
  classifyPriceRealization,
  computeModalPrice,
  computePriceCoefficientOfVariation,
  classifyPriceConsistency,
  computeMinViablePrice,
  detectBelowFloorSales,
  computeOptimalPriceRecommendation,
  generatePriceOptimizationNarrative,
} from '../lib/services/commercial/price-optimization.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeDiscountRate
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDiscountRate', () => {
  it('returns null when listPrice is 0', () => {
    expect(computeDiscountRate(0, 50)).toBeNull()
  })

  it('returns null when listPrice is negative', () => {
    expect(computeDiscountRate(-10, 5)).toBeNull()
  })

  it('returns 0 when prices are equal', () => {
    expect(computeDiscountRate(100, 100)).toBe(0)
  })

  it('computes 20% discount correctly', () => {
    expect(computeDiscountRate(100, 80)).toBeCloseTo(20, 5)
  })

  it('computes 50% discount correctly', () => {
    expect(computeDiscountRate(200, 100)).toBeCloseTo(50, 5)
  })

  it('computes 10% discount with fractional prices', () => {
    expect(computeDiscountRate(99.9, 89.91)).toBeCloseTo(10, 1)
  })

  it('returns negative discount when actualPrice > listPrice (price above list)', () => {
    const result = computeDiscountRate(100, 120)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('computes 100% discount when actual price is 0', () => {
    expect(computeDiscountRate(100, 0)).toBeCloseTo(100, 5)
  })

  it('handles small fractional discount', () => {
    expect(computeDiscountRate(1000, 999)).toBeCloseTo(0.1, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyDiscountLevel
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyDiscountLevel', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyDiscountLevel(null)).toBe('insufficient_data')
  })

  it('returns no_discount for 0%', () => {
    expect(classifyDiscountLevel(0)).toBe('no_discount')
  })

  it('returns no_discount for negative %', () => {
    expect(classifyDiscountLevel(-5)).toBe('no_discount')
  })

  it('returns minimal for exactly 5%', () => {
    expect(classifyDiscountLevel(5)).toBe('minimal')
  })

  it('returns minimal for 1%', () => {
    expect(classifyDiscountLevel(1)).toBe('minimal')
  })

  it('returns standard for exactly 15%', () => {
    expect(classifyDiscountLevel(15)).toBe('standard')
  })

  it('returns standard for 10%', () => {
    expect(classifyDiscountLevel(10)).toBe('standard')
  })

  it('returns standard for 5.01%', () => {
    expect(classifyDiscountLevel(5.01)).toBe('standard')
  })

  it('returns heavy for exactly 30%', () => {
    expect(classifyDiscountLevel(30)).toBe('heavy')
  })

  it('returns heavy for 20%', () => {
    expect(classifyDiscountLevel(20)).toBe('heavy')
  })

  it('returns heavy for 15.01%', () => {
    expect(classifyDiscountLevel(15.01)).toBe('heavy')
  })

  it('returns excessive for 31%', () => {
    expect(classifyDiscountLevel(31)).toBe('excessive')
  })

  it('returns excessive for 100%', () => {
    expect(classifyDiscountLevel(100)).toBe('excessive')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeAvgDiscountRate
// ─────────────────────────────────────────────────────────────────────────────
describe('computeAvgDiscountRate', () => {
  it('returns null for empty array', () => {
    expect(computeAvgDiscountRate([])).toBeNull()
  })

  it('returns null when all items have zero actualPrice and zero revenue', () => {
    const items = [
      { list_price: 100, actual_price: 0, qty: 0 },
    ]
    expect(computeAvgDiscountRate(items)).toBeNull()
  })

  it('returns null when total revenue is zero', () => {
    const items = [
      { list_price: 100, actual_price: 80, qty: 0 },
      { list_price: 200, actual_price: 160, qty: 0 },
    ]
    expect(computeAvgDiscountRate(items)).toBeNull()
  })

  it('computes simple average when all have same discount', () => {
    const items = [
      { list_price: 100, actual_price: 80, qty: 1 },
      { list_price: 200, actual_price: 160, qty: 1 },
    ]
    // both have 20% discount → avg = 20%
    const result = computeAvgDiscountRate(items)
    expect(result).toBeCloseTo(20, 2)
  })

  it('computes revenue-weighted average correctly', () => {
    // Item A: 10% discount, revenue = 1 × 90 = 90
    // Item B: 30% discount, revenue = 1 × 70 = 70
    // total revenue = 160
    // weighted = (10 × 90 + 30 × 70) / 160 = (900 + 2100) / 160 = 18.75%
    const items = [
      { list_price: 100, actual_price: 90, qty: 1 },
      { list_price: 100, actual_price: 70, qty: 1 },
    ]
    const result = computeAvgDiscountRate(items)
    expect(result).toBeCloseTo(18.75, 2)
  })

  it('weights correctly by qty × actualPrice', () => {
    // Item A: 10% off 100, qty 10 → revenue 900, weighted discount 10 × 900 = 9000
    // Item B: 50% off 100, qty 1  → revenue 50, weighted discount 50 × 50  = 2500
    // total revenue = 950
    // avg = 11500/950 ≈ 12.105%
    const items = [
      { list_price: 100, actual_price: 90, qty: 10 },
      { list_price: 100, actual_price: 50, qty: 1 },
    ]
    const result = computeAvgDiscountRate(items)
    expect(result).toBeCloseTo(11500 / 950, 2)
  })

  it('returns 0 when no discounts applied', () => {
    const items = [
      { list_price: 100, actual_price: 100, qty: 5 },
      { list_price: 200, actual_price: 200, qty: 3 },
    ]
    expect(computeAvgDiscountRate(items)).toBeCloseTo(0, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDiscountFrequency
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDiscountFrequency', () => {
  it('returns null for empty array', () => {
    expect(computeDiscountFrequency([])).toBeNull()
  })

  it('returns 100% when all items are discounted', () => {
    const items = [
      { list_price: 100, actual_price: 80 },
      { list_price: 200, actual_price: 150 },
    ]
    expect(computeDiscountFrequency(items)).toBe(100)
  })

  it('returns 0% when no items are discounted', () => {
    const items = [
      { list_price: 100, actual_price: 100 },
      { list_price: 200, actual_price: 200 },
    ]
    expect(computeDiscountFrequency(items)).toBe(0)
  })

  it('returns correct % for mixed items', () => {
    const items = [
      { list_price: 100, actual_price: 80 },  // discounted
      { list_price: 100, actual_price: 100 }, // not discounted
      { list_price: 100, actual_price: 90 },  // discounted
      { list_price: 100, actual_price: 100 }, // not discounted
    ]
    expect(computeDiscountFrequency(items)).toBe(50)
  })

  it('does not count items where actual > list as discounted', () => {
    const items = [
      { list_price: 100, actual_price: 110 }, // premium — not discounted
      { list_price: 100, actual_price: 90 },  // discounted
    ]
    expect(computeDiscountFrequency(items)).toBe(50)
  })

  it('returns 100% for single discounted item', () => {
    expect(computeDiscountFrequency([{ list_price: 100, actual_price: 50 }])).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRevenueLostToDiscounts
// ─────────────────────────────────────────────────────────────────────────────
describe('computeRevenueLostToDiscounts', () => {
  it('returns 0 for empty array', () => {
    expect(computeRevenueLostToDiscounts([])).toBe(0)
  })

  it('returns 0 when no discounts', () => {
    const items = [
      { list_price: 100, actual_price: 100, qty: 5 },
    ]
    expect(computeRevenueLostToDiscounts(items)).toBe(0)
  })

  it('clamps negative per-item loss to 0 (actual > list)', () => {
    const items = [
      { list_price: 100, actual_price: 120, qty: 3 }, // premium pricing
    ]
    expect(computeRevenueLostToDiscounts(items)).toBe(0)
  })

  it('computes loss correctly for discounted items', () => {
    const items = [
      { list_price: 100, actual_price: 80, qty: 2 },  // lost = 20 × 2 = 40
      { list_price: 200, actual_price: 150, qty: 3 }, // lost = 50 × 3 = 150
    ]
    expect(computeRevenueLostToDiscounts(items)).toBe(190)
  })

  it('handles mix of discounted and premium items', () => {
    const items = [
      { list_price: 100, actual_price: 80, qty: 1 },  // lost = 20
      { list_price: 100, actual_price: 110, qty: 1 }, // clamped to 0
    ]
    expect(computeRevenueLostToDiscounts(items)).toBe(20)
  })

  it('handles zero qty', () => {
    const items = [
      { list_price: 100, actual_price: 50, qty: 0 },
    ]
    expect(computeRevenueLostToDiscounts(items)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePriceRealizationRate
// ─────────────────────────────────────────────────────────────────────────────
describe('computePriceRealizationRate', () => {
  it('returns null when fullPriceRevenue is 0', () => {
    const items = [{ list_price: 0, actual_price: 0, qty: 10 }]
    expect(computePriceRealizationRate(items)).toBeNull()
  })

  it('returns null for empty array (fullPriceRevenue = 0)', () => {
    expect(computePriceRealizationRate([])).toBeNull()
  })

  it('returns 100% when no discounts', () => {
    const items = [
      { list_price: 100, actual_price: 100, qty: 5 },
      { list_price: 200, actual_price: 200, qty: 2 },
    ]
    expect(computePriceRealizationRate(items)).toBe(100)
  })

  it('computes correct rate with uniform 20% discount', () => {
    const items = [
      { list_price: 100, actual_price: 80, qty: 1 },
    ]
    expect(computePriceRealizationRate(items)).toBeCloseTo(80, 5)
  })

  it('computes mixed realization rate', () => {
    // Full price revenue = 100 × 1 + 200 × 1 = 300
    // Actual revenue = 80 × 1 + 200 × 1 = 280
    // Rate = 280/300 × 100 ≈ 93.33%
    const items = [
      { list_price: 100, actual_price: 80, qty: 1 },
      { list_price: 200, actual_price: 200, qty: 1 },
    ]
    expect(computePriceRealizationRate(items)).toBeCloseTo(280 / 300 * 100, 2)
  })

  it('can exceed 100% when actual > list', () => {
    const items = [{ list_price: 100, actual_price: 110, qty: 1 }]
    expect(computePriceRealizationRate(items)).toBeCloseTo(110, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyPriceRealization
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyPriceRealization', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyPriceRealization(null)).toBe('insufficient_data')
  })

  it('returns excellent for 100%', () => {
    expect(classifyPriceRealization(100)).toBe('excellent')
  })

  it('returns excellent for exactly 97%', () => {
    expect(classifyPriceRealization(97)).toBe('excellent')
  })

  it('returns good for 96%', () => {
    expect(classifyPriceRealization(96)).toBe('good')
  })

  it('returns good for exactly 92%', () => {
    expect(classifyPriceRealization(92)).toBe('good')
  })

  it('returns moderate for 91%', () => {
    expect(classifyPriceRealization(91)).toBe('moderate')
  })

  it('returns moderate for exactly 85%', () => {
    expect(classifyPriceRealization(85)).toBe('moderate')
  })

  it('returns poor for 84%', () => {
    expect(classifyPriceRealization(84)).toBe('poor')
  })

  it('returns poor for exactly 75%', () => {
    expect(classifyPriceRealization(75)).toBe('poor')
  })

  it('returns critical for 74%', () => {
    expect(classifyPriceRealization(74)).toBe('critical')
  })

  it('returns critical for 0%', () => {
    expect(classifyPriceRealization(0)).toBe('critical')
  })

  it('returns critical for negative rate', () => {
    expect(classifyPriceRealization(-5)).toBe('critical')
  })

  it('returns excellent for rate above 100%', () => {
    expect(classifyPriceRealization(105)).toBe('excellent')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeModalPrice
// ─────────────────────────────────────────────────────────────────────────────
describe('computeModalPrice', () => {
  it('returns null for empty array', () => {
    expect(computeModalPrice([])).toBeNull()
  })

  it('returns the only price when there is one element', () => {
    expect(computeModalPrice([99])).toBe(99)
  })

  it('returns the most frequent price', () => {
    expect(computeModalPrice([10, 20, 20, 30])).toBe(20)
  })

  it('returns first price on tie', () => {
    // [10, 10, 20, 20] — 10 appears first in iteration
    expect(computeModalPrice([10, 10, 20, 20])).toBe(10)
  })

  it('returns the single dominant price in longer array', () => {
    expect(computeModalPrice([100, 100, 100, 80, 90])).toBe(100)
  })

  it('handles all same prices', () => {
    expect(computeModalPrice([50, 50, 50])).toBe(50)
  })

  it('handles two distinct prices with different frequencies', () => {
    expect(computeModalPrice([5, 5, 5, 10, 10])).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePriceCoefficientOfVariation
// ─────────────────────────────────────────────────────────────────────────────
describe('computePriceCoefficientOfVariation', () => {
  it('returns null for empty array', () => {
    expect(computePriceCoefficientOfVariation([])).toBeNull()
  })

  it('returns null for single price (length < 2)', () => {
    expect(computePriceCoefficientOfVariation([100])).toBeNull()
  })

  it('returns 0 when all prices are identical', () => {
    expect(computePriceCoefficientOfVariation([50, 50, 50])).toBe(0)
  })

  it('computes CV correctly for known values', () => {
    // prices = [100, 200]: mean = 150, variance = ((50)²+(50)²)/2 = 2500, stddev = 50
    // CV = 50/150 ≈ 0.3333
    const result = computePriceCoefficientOfVariation([100, 200])
    expect(result).toBeCloseTo(50 / 150, 5)
  })

  it('handles two equal prices → CV = 0', () => {
    expect(computePriceCoefficientOfVariation([100, 100])).toBe(0)
  })

  it('returns null if mean is 0 (all-zero prices)', () => {
    expect(computePriceCoefficientOfVariation([0, 0, 0])).toBeNull()
  })

  it('computes CV for [90, 100, 110]', () => {
    // mean = 100, variance = (100 + 0 + 100)/3 = 200/3, stddev = sqrt(200/3)
    const mean = 100
    const variance = (100 + 0 + 100) / 3
    const cv = Math.sqrt(variance) / mean
    const result = computePriceCoefficientOfVariation([90, 100, 110])
    expect(result).toBeCloseTo(cv, 5)
  })

  it('returns a positive number for spread prices', () => {
    const result = computePriceCoefficientOfVariation([50, 150])
    expect(result).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyPriceConsistency
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyPriceConsistency', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyPriceConsistency(null)).toBe('insufficient_data')
  })

  it('returns very_consistent for cv = 0', () => {
    expect(classifyPriceConsistency(0)).toBe('very_consistent')
  })

  it('returns very_consistent for exactly 0.05', () => {
    expect(classifyPriceConsistency(0.05)).toBe('very_consistent')
  })

  it('returns consistent for 0.06', () => {
    expect(classifyPriceConsistency(0.06)).toBe('consistent')
  })

  it('returns consistent for exactly 0.10', () => {
    expect(classifyPriceConsistency(0.10)).toBe('consistent')
  })

  it('returns moderate_variation for 0.11', () => {
    expect(classifyPriceConsistency(0.11)).toBe('moderate_variation')
  })

  it('returns moderate_variation for exactly 0.20', () => {
    expect(classifyPriceConsistency(0.20)).toBe('moderate_variation')
  })

  it('returns high_variation for 0.21', () => {
    expect(classifyPriceConsistency(0.21)).toBe('high_variation')
  })

  it('returns high_variation for exactly 0.35', () => {
    expect(classifyPriceConsistency(0.35)).toBe('high_variation')
  })

  it('returns erratic for 0.36', () => {
    expect(classifyPriceConsistency(0.36)).toBe('erratic')
  })

  it('returns erratic for very large cv', () => {
    expect(classifyPriceConsistency(1.5)).toBe('erratic')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeMinViablePrice
// ─────────────────────────────────────────────────────────────────────────────
describe('computeMinViablePrice', () => {
  it('uses default 10% margin', () => {
    expect(computeMinViablePrice(100)).toBeCloseTo(90, 5)
  })

  it('uses custom margin of 20%', () => {
    expect(computeMinViablePrice(100, 20)).toBeCloseTo(80, 5)
  })

  it('handles 0% margin — returns listPrice', () => {
    expect(computeMinViablePrice(100, 0)).toBeCloseTo(100, 5)
  })

  it('handles 100% margin → 0', () => {
    expect(computeMinViablePrice(100, 100)).toBe(0)
  })

  it('returns 0 for zero listPrice', () => {
    expect(computeMinViablePrice(0)).toBe(0)
  })

  it('cannot return negative value when margin > 100%', () => {
    // margin > 100% would produce negative, clamp to 0
    expect(computeMinViablePrice(100, 110)).toBe(0)
  })

  it('handles fractional list price', () => {
    expect(computeMinViablePrice(99.9, 10)).toBeCloseTo(89.91, 2)
  })

  it('returns 50% of listPrice when margin is 50%', () => {
    expect(computeMinViablePrice(200, 50)).toBeCloseTo(100, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// detectBelowFloorSales
// ─────────────────────────────────────────────────────────────────────────────
describe('detectBelowFloorSales', () => {
  it('returns empty array for empty input', () => {
    expect(detectBelowFloorSales([])).toEqual([])
  })

  it('detects item below default 10% floor', () => {
    const items = [
      { actual_price: 85, list_price: 100 }, // floor = 90, 85 < 90 → below
      { actual_price: 95, list_price: 100 }, // 95 >= 90 → OK
    ]
    const result = detectBelowFloorSales(items)
    expect(result).toHaveLength(1)
    expect(result[0].actual_price).toBe(85)
  })

  it('returns empty when all items are above floor', () => {
    const items = [
      { actual_price: 91, list_price: 100 },
      { actual_price: 100, list_price: 100 },
    ]
    expect(detectBelowFloorSales(items)).toHaveLength(0)
  })

  it('uses custom margin threshold of 20%', () => {
    // floor = 100 × (1 - 0.20) = 80
    const items = [
      { actual_price: 79, list_price: 100 }, // below floor
      { actual_price: 80, list_price: 100 }, // exactly floor — NOT below
      { actual_price: 81, list_price: 100 }, // above floor
    ]
    const result = detectBelowFloorSales(items, 20)
    expect(result).toHaveLength(1)
    expect(result[0].actual_price).toBe(79)
  })

  it('preserves all original fields on returned items', () => {
    const items = [
      { actual_price: 50, list_price: 100, sale_id: 'abc', qty: 3 },
    ]
    const result = detectBelowFloorSales(items)
    expect(result[0]).toHaveProperty('sale_id', 'abc')
    expect(result[0]).toHaveProperty('qty', 3)
  })

  it('returns all items when all are below floor', () => {
    const items = [
      { actual_price: 1, list_price: 100 },
      { actual_price: 5, list_price: 100 },
    ]
    expect(detectBelowFloorSales(items)).toHaveLength(2)
  })

  it('item at exactly the floor threshold is NOT flagged as below floor', () => {
    const items = [{ actual_price: 90, list_price: 100 }] // floor = 90, exactly equal
    expect(detectBelowFloorSales(items)).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeOptimalPriceRecommendation
// ─────────────────────────────────────────────────────────────────────────────
describe('computeOptimalPriceRecommendation', () => {
  it('returns maintain_list when avgDiscount is null', () => {
    const result = computeOptimalPriceRecommendation(100, 98, 100, null)
    expect(result.strategy).toBe('maintain_list')
    expect(result.recommended_price).toBe(100)
  })

  it('returns maintain_list when avgDiscount is exactly 0', () => {
    const result = computeOptimalPriceRecommendation(100, 100, 100, 0)
    expect(result.strategy).toBe('maintain_list')
    expect(result.recommended_price).toBe(100)
  })

  it('returns maintain_list when avgDiscount is exactly 5%', () => {
    const result = computeOptimalPriceRecommendation(100, 95, 95, 5)
    expect(result.strategy).toBe('maintain_list')
    expect(result.recommended_price).toBe(100)
  })

  it('returns standardize_discount for discount just above 5% boundary', () => {
    const result = computeOptimalPriceRecommendation(100, 93, 94, 6)
    expect(result.strategy).toBe('standardize_discount')
    expect(result.recommended_price).toBeCloseTo(94, 2) // 100 × (1 - 0.06)
  })

  it('returns standardize_discount for exactly 20%', () => {
    const result = computeOptimalPriceRecommendation(100, 80, 80, 20)
    expect(result.strategy).toBe('standardize_discount')
    expect(result.recommended_price).toBeCloseTo(80, 5)
  })

  it('standardize_discount recommended price = listPrice × (1 - avgDiscount/100)', () => {
    const result = computeOptimalPriceRecommendation(200, 170, 165, 15)
    expect(result.strategy).toBe('standardize_discount')
    expect(result.recommended_price).toBeCloseTo(200 * (1 - 15 / 100), 5)
  })

  it('returns reduce_list when avgDiscount > 20%', () => {
    const result = computeOptimalPriceRecommendation(100, 75, 76, 25)
    expect(result.strategy).toBe('reduce_list')
  })

  it('reduce_list: uses max(modalPrice, avgActualPrice) when both provided', () => {
    // modalPrice=76, avgActualPrice=75 → max = 76
    const result = computeOptimalPriceRecommendation(100, 75, 76, 25)
    expect(result.recommended_price).toBe(76)
  })

  it('reduce_list: uses avgActualPrice when modalPrice is null', () => {
    const result = computeOptimalPriceRecommendation(100, 72, null, 30)
    expect(result.recommended_price).toBe(72)
  })

  it('reduce_list: falls back to listPrice when both modal and avgActual are null', () => {
    const result = computeOptimalPriceRecommendation(100, null, null, 50)
    expect(result.recommended_price).toBe(100)
  })

  it('returns a non-empty rationale string for each strategy', () => {
    const r1 = computeOptimalPriceRecommendation(100, 100, 100, 0)
    const r2 = computeOptimalPriceRecommendation(100, 90, 90, 10)
    const r3 = computeOptimalPriceRecommendation(100, 70, 70, 35)
    expect(r1.rationale.length).toBeGreaterThan(0)
    expect(r2.rationale.length).toBeGreaterThan(0)
    expect(r3.rationale.length).toBeGreaterThan(0)
  })

  it('maintain_list: negative discount still returns maintain_list', () => {
    const result = computeOptimalPriceRecommendation(100, 105, 105, -5)
    expect(result.strategy).toBe('maintain_list')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generatePriceOptimizationNarrative
// ─────────────────────────────────────────────────────────────────────────────
describe('generatePriceOptimizationNarrative', () => {
  it('returns non-empty Turkish string when both are null', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: null,
      priceRealizationPct: null,
      revenueLostToDiscounts: 0,
      belowFloorCount: 0,
      priceConsistency: 'insufficient_data',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns non-empty Turkish string for normal case', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 10,
      priceRealizationPct: 90,
      revenueLostToDiscounts: 5000,
      belowFloorCount: 2,
      priceConsistency: 'consistent',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(5)
  })

  it('mentions below-floor count when > 0', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 5,
      priceRealizationPct: 95,
      revenueLostToDiscounts: 1000,
      belowFloorCount: 7,
      priceConsistency: 'consistent',
    })
    expect(result).toContain('7')
  })

  it('returns string for high discount scenario', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 35,
      priceRealizationPct: 65,
      revenueLostToDiscounts: 50000,
      belowFloorCount: 10,
      priceConsistency: 'erratic',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('returns string for excellent price realization', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 1,
      priceRealizationPct: 99,
      revenueLostToDiscounts: 100,
      belowFloorCount: 0,
      priceConsistency: 'very_consistent',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns string with zero revenue lost', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 0,
      priceRealizationPct: 100,
      revenueLostToDiscounts: 0,
      belowFloorCount: 0,
      priceConsistency: 'very_consistent',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles erratic price consistency', () => {
    const result = generatePriceOptimizationNarrative({
      avgDiscountPct: 8,
      priceRealizationPct: 92,
      revenueLostToDiscounts: 2000,
      belowFloorCount: 0,
      priceConsistency: 'erratic',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
