// Node-env tests for the pure pricing functions in price-optimization.service.ts
// (weighted recommended price, midpoint elasticity, revenue uplift).
import { describe, it, expect } from 'vitest'
import {
  computeRecommendedPrice, computeElasticity, computeRevenueUplift,
} from '@/lib/services/commercial/price-optimization.service'

describe('computeRecommendedPrice (weighted: revenue .40 / margin .40 / volume .20)', () => {
  it('blends all three candidates by weight', () => {
    // (100×.4 + 120×.4 + 80×.2) / 1.0 = 104
    expect(computeRecommendedPrice(100, 120, 80)).toBe(104)
  })
  it('renormalizes weights when some candidates are missing', () => {
    expect(computeRecommendedPrice(100, null, null)).toBe(100) // single candidate → itself
    // (100×.4 + 80×.2) / .6 = 28+... → (40+16)/.6 = 93.33
    expect(computeRecommendedPrice(100, null, 80)).toBeCloseTo(93.333, 2)
  })
  it('returns null when no candidate is available', () => {
    expect(computeRecommendedPrice(null, null, null)).toBeNull()
  })
})

describe('computeElasticity (midpoint arc elasticity)', () => {
  it('computes (ΔQ/midQ) / (ΔP/midP) across the price range', () => {
    // low 10/100, high 20/60 → (−40/80)/(10/15) = −0.75
    expect(computeElasticity([{ price_try: 10, units_sold: 100 }, { price_try: 20, units_sold: 60 }])).toBeCloseTo(-0.75, 2)
  })
  it('returns null with fewer than 2 valid (price>0) points', () => {
    expect(computeElasticity([{ price_try: 10, units_sold: 100 }])).toBeNull()
    expect(computeElasticity([{ price_try: 0, units_sold: 100 }, { price_try: 0, units_sold: 50 }])).toBeNull()
  })
  it('returns null when all points share the same price (ΔP = 0)', () => {
    expect(computeElasticity([{ price_try: 10, units_sold: 100 }, { price_try: 10, units_sold: 50 }])).toBeNull()
  })
})

describe('computeRevenueUplift', () => {
  it('= (recommended − current) × units', () => {
    expect(computeRevenueUplift(100, 110, 50)).toBe(500)
    expect(computeRevenueUplift(100, 90, 50)).toBe(-500) // a price cut shows negative uplift
  })
})
