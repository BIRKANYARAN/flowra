// Node-env tests for the pure inventory functions in inventory-turnover.service.ts
// (shrinkage rate + level, reorder alert tiers, inventory value accuracy).
import { describe, it, expect } from 'vitest'
import {
  computeShrinkageRate, classifyShrinkageLevel, computeReorderAlert, computeInventoryValueAccuracy,
} from '@/lib/services/inventory/inventory-turnover.service'

describe('computeShrinkageRate', () => {
  it('shrinkage = (expected − closing) / expected × 100, expected = open + purchases − sales', () => {
    // expected 120, closing 110 → 10/120 = 8.33%
    expect(computeShrinkageRate(100, 50, 30, 110)).toBeCloseTo(8.333, 2)
  })
  it('is zero when closing matches the expected stock', () => {
    expect(computeShrinkageRate(100, 50, 30, 120)).toBe(0)
  })
  it('is negative (overage) when closing exceeds expected', () => {
    expect(computeShrinkageRate(100, 50, 30, 130)).toBeLessThan(0)
  })
  it('returns null when expected stock is zero (undefined ratio)', () => {
    expect(computeShrinkageRate(0, 30, 30, 0)).toBeNull()
  })
})

describe('classifyShrinkageLevel', () => {
  it('maps the percentage to a tier (none ≤0 < acceptable ≤1 < elevated ≤3 < critical)', () => {
    expect(classifyShrinkageLevel(null)).toBe('insufficient_data')
    expect(classifyShrinkageLevel(-2)).toBe('none')
    expect(classifyShrinkageLevel(0)).toBe('none')
    expect(classifyShrinkageLevel(0.5)).toBe('acceptable')
    expect(classifyShrinkageLevel(1)).toBe('acceptable')
    expect(classifyShrinkageLevel(2)).toBe('elevated')
    expect(classifyShrinkageLevel(3)).toBe('elevated')
    expect(classifyShrinkageLevel(5)).toBe('critical')
  })
})

describe('computeReorderAlert', () => {
  it('tiers on current qty vs safety/reorder thresholds', () => {
    expect(computeReorderAlert(5, 20, 10)).toBe('critical')      // below safety stock
    expect(computeReorderAlert(20, 20, 10)).toBe('reorder_now')  // at reorder point
    expect(computeReorderAlert(25, 20, 10)).toBe('watch')        // ≤ 1.5× reorder point
    expect(computeReorderAlert(40, 20, 10)).toBe('healthy')      // comfortably above
  })
})

describe('computeInventoryValueAccuracy', () => {
  it('book / market × 100', () => {
    expect(computeInventoryValueAccuracy(950, 1000)).toBe(95)
  })
  it('returns null when market value is zero', () => {
    expect(computeInventoryValueAccuracy(100, 0)).toBeNull()
  })
})
