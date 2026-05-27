/**
 * Tests for pure helper functions in price-optimization.service.ts
 *
 * Covers:
 *   - computeRecommendedPrice: blended weighting, null handling
 *   - computeElasticity: midpoint elasticity, edge cases
 *   - classifyElasticity: elastic/inelastic/unknown
 *   - computeRevenueUplift: delta × units
 *
 * No DB, no Supabase, no HTTP — pure functions only.
 *
 * Run with: npx vitest run tests/price-optimization.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeRecommendedPrice,
  computeElasticity,
  classifyElasticity,
  computeRevenueUplift,
} from '../lib/services/commercial/price-optimization.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeRecommendedPrice
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRecommendedPrice', () => {
  it('blended formula: 40%×100 + 40%×120 + 20%×80 = 104', () => {
    const result = computeRecommendedPrice(100, 120, 80)
    expect(result).toBeCloseTo(104, 5)
  })

  it('all same prices: returns that price', () => {
    const result = computeRecommendedPrice(100, 100, 100)
    expect(result).toBeCloseTo(100, 5)
  })

  it('null revenue price: ignores it, redistributes weight among margin+volume', () => {
    // maxMarginPrice=120 (weight 0.40), maxVolumePrice=80 (weight 0.20)
    // total weight = 0.60
    // blended = (120×0.40 + 80×0.20) / 0.60 = (48 + 16) / 0.60 = 64 / 0.60 ≈ 106.667
    const result = computeRecommendedPrice(null, 120, 80)
    expect(result).toBeCloseTo(106.667, 2)
  })

  it('only one non-null price: returns that price', () => {
    // null revenue, margin=120, null volume → (120×0.40)/0.40 = 120
    const result = computeRecommendedPrice(null, 120, null)
    expect(result).toBeCloseTo(120, 5)
  })

  it('all null: returns null', () => {
    expect(computeRecommendedPrice(null, null, null)).toBeNull()
  })

  it('high max_revenue price shifts blended up', () => {
    // 40%×200 + 40%×100 + 20%×100 = 80 + 40 + 20 = 140
    const result = computeRecommendedPrice(200, 100, 100)
    expect(result).toBeCloseTo(140, 5)
  })

  it('max_volume only: returns that price exactly', () => {
    const result = computeRecommendedPrice(null, null, 75)
    expect(result).toBeCloseTo(75, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeElasticity
// ─────────────────────────────────────────────────────────────────────────────

describe('computeElasticity', () => {
  it('price up → volume down: returns negative elasticity', () => {
    // low: price=100, units=100; high: price=110, units=80
    // deltaP=10, deltaQ=-20, midP=105, midQ=90
    // e = (-20/90) / (10/105) = (-0.222) / (0.0952) ≈ -2.33
    const result = computeElasticity([
      { price_try: 100, units_sold: 100 },
      { price_try: 110, units_sold: 80 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('price down → volume up: returns negative elasticity', () => {
    const result = computeElasticity([
      { price_try: 80, units_sold: 120 },
      { price_try: 100, units_sold: 80 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('single price point: returns null (< 2 points)', () => {
    const result = computeElasticity([{ price_try: 100, units_sold: 100 }])
    expect(result).toBeNull()
  })

  it('empty array: returns null', () => {
    const result = computeElasticity([])
    expect(result).toBeNull()
  })

  it('all same price: returns null (zero price range)', () => {
    const result = computeElasticity([
      { price_try: 100, units_sold: 50 },
      { price_try: 100, units_sold: 80 },
      { price_try: 100, units_sold: 30 },
    ])
    expect(result).toBeNull()
  })

  it('zero price filtered out: effectively < 2 valid points → null', () => {
    const result = computeElasticity([
      { price_try: 0, units_sold: 50 },
      { price_try: 0, units_sold: 80 },
    ])
    expect(result).toBeNull()
  })

  it('three price points: uses min and max price for elasticity', () => {
    // sorted: [80,120], [100,90], [120,60]
    // low: price=80, units=120; high: price=120, units=60
    const result = computeElasticity([
      { price_try: 100, units_sold: 90 },
      { price_try: 80,  units_sold: 120 },
      { price_try: 120, units_sold: 60 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyElasticity
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyElasticity', () => {
  it('-1.5: elastic (|e| > 1)', () => {
    expect(classifyElasticity(-1.5)).toBe('elastic')
  })

  it('-0.5: inelastic (|e| < 1)', () => {
    expect(classifyElasticity(-0.5)).toBe('inelastic')
  })

  it('null: unknown', () => {
    expect(classifyElasticity(null)).toBe('unknown')
  })

  it('exactly -1.0: inelastic (boundary, |e| <= 1)', () => {
    expect(classifyElasticity(-1.0)).toBe('inelastic')
  })

  it('positive elasticity 2.0: elastic (|e| > 1)', () => {
    expect(classifyElasticity(2.0)).toBe('elastic')
  })

  it('positive elasticity 0.3: inelastic (|e| < 1)', () => {
    expect(classifyElasticity(0.3)).toBe('inelastic')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRevenueUplift
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRevenueUplift', () => {
  it('basic: (110-100) × 50 = 500', () => {
    expect(computeRevenueUplift(100, 110, 50)).toBe(500)
  })

  it('no change: (100-100) × 50 = 0', () => {
    expect(computeRevenueUplift(100, 100, 50)).toBe(0)
  })

  it('price decrease: (90-100) × 50 = -500', () => {
    expect(computeRevenueUplift(100, 90, 50)).toBe(-500)
  })

  it('zero units: always 0', () => {
    expect(computeRevenueUplift(100, 150, 0)).toBe(0)
  })

  it('large values: correct computation', () => {
    // (1500 - 1000) × 200 = 100000
    expect(computeRevenueUplift(1000, 1500, 200)).toBe(100_000)
  })
})
