/**
 * Sales Velocity Service — pure-function tests.
 *
 * Scope (no DB — all pure function inputs):
 *   • computeDailyVelocity()    — normal / zero days → 0
 *   • computeDaysToStockout()   — normal / zero velocity → null / zero stock → 0
 *   • computeSafetyStock()      — default factor / custom factor / rounds up
 *   • computeReorderPoint()     — normal calculation
 *   • classifyStockUrgency()    — all 5 cases; null → no_movement; boundary values
 *
 * Run with:  npx vitest run tests/sales-velocity.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDailyVelocity,
  computeDaysToStockout,
  computeSafetyStock,
  computeReorderPoint,
  classifyStockUrgency,
} from '../lib/services/inventory/sales-velocity.service'

// ── computeDailyVelocity ──────────────────────────────────────────────────────

describe('computeDailyVelocity', () => {
  it('returns correct average when observationDays > 0', () => {
    expect(computeDailyVelocity(90, 30)).toBeCloseTo(3)
  })

  it('returns 0 when observationDays is 0 (no divide-by-zero)', () => {
    expect(computeDailyVelocity(100, 0)).toBe(0)
  })

  it('handles fractional velocity', () => {
    expect(computeDailyVelocity(1, 3)).toBeCloseTo(1 / 3)
  })

  it('returns 0 when totalQtySold is 0', () => {
    expect(computeDailyVelocity(0, 90)).toBe(0)
  })

  it('handles large values without precision loss', () => {
    expect(computeDailyVelocity(10000, 100)).toBe(100)
  })
})

// ── computeDaysToStockout ─────────────────────────────────────────────────────

describe('computeDaysToStockout', () => {
  it('returns correct days given current qty and velocity', () => {
    expect(computeDaysToStockout(100, 5)).toBeCloseTo(20)
  })

  it('returns null when velocity is 0 (no movement → no stockout prediction)', () => {
    expect(computeDaysToStockout(100, 0)).toBeNull()
  })

  it('returns 0 when currentQty is 0 (already out of stock)', () => {
    expect(computeDaysToStockout(0, 5)).toBe(0)
  })

  it('returns null when both qty and velocity are 0', () => {
    expect(computeDaysToStockout(0, 0)).toBeNull()
  })

  it('returns fractional days for partial stock', () => {
    expect(computeDaysToStockout(5, 2)).toBeCloseTo(2.5)
  })
})

// ── computeSafetyStock ────────────────────────────────────────────────────────

describe('computeSafetyStock', () => {
  it('computes safety stock with default safety factor 1.5', () => {
    // 2 units/day × 7 days lead × 1.5 = 21, exact integer → 21
    expect(computeSafetyStock(2, 7)).toBe(21)
  })

  it('uses custom safety factor when provided', () => {
    // 2 × 7 × 2.0 = 28
    expect(computeSafetyStock(2, 7, 2.0)).toBe(28)
  })

  it('rounds up to nearest integer (Math.ceil)', () => {
    // 1 × 3 × 1.5 = 4.5 → ceil → 5
    expect(computeSafetyStock(1, 3)).toBe(5)
  })

  it('returns 0 when velocity is 0', () => {
    expect(computeSafetyStock(0, 14)).toBe(0)
  })

  it('rounds up correctly with fractional velocity', () => {
    // 0.5 × 5 × 1.5 = 3.75 → ceil → 4
    expect(computeSafetyStock(0.5, 5)).toBe(4)
  })

  it('uses safety factor of 1.0 when explicitly passed', () => {
    // 3 × 10 × 1.0 = 30
    expect(computeSafetyStock(3, 10, 1.0)).toBe(30)
  })
})

// ── computeReorderPoint ───────────────────────────────────────────────────────

describe('computeReorderPoint', () => {
  it('computes reorder point = safety_stock + (velocity × lead_time)', () => {
    // velocity=2, lead=7, factor=1.5
    // safety_stock = ceil(2 × 7 × 1.5) = ceil(21) = 21
    // reorder_point = 21 + ceil(2 × 7) = 21 + 14 = 35
    expect(computeReorderPoint(2, 7)).toBe(35)
  })

  it('returns 0 when velocity is 0', () => {
    expect(computeReorderPoint(0, 14)).toBe(0)
  })

  it('uses custom safety factor', () => {
    // velocity=1, lead=10, factor=2.0
    // safety_stock = ceil(1 × 10 × 2.0) = 20
    // reorder_point = 20 + ceil(1 × 10) = 20 + 10 = 30
    expect(computeReorderPoint(1, 10, 2.0)).toBe(30)
  })

  it('reorder_point > safety_stock when velocity > 0', () => {
    const ss = computeSafetyStock(3, 5)
    const rp = computeReorderPoint(3, 5)
    expect(rp).toBeGreaterThan(ss)
  })
})

// ── classifyStockUrgency ──────────────────────────────────────────────────────

describe('classifyStockUrgency', () => {
  it('returns no_movement when daysToStockout is null', () => {
    expect(classifyStockUrgency(null)).toBe('no_movement')
  })

  it('returns critical for 0 days (already out of stock)', () => {
    expect(classifyStockUrgency(0)).toBe('critical')
  })

  it('returns critical for exactly 7 days (boundary)', () => {
    expect(classifyStockUrgency(7)).toBe('critical')
  })

  it('returns critical for 3 days (within critical zone)', () => {
    expect(classifyStockUrgency(3)).toBe('critical')
  })

  it('returns urgent for exactly 8 days (just above critical boundary)', () => {
    expect(classifyStockUrgency(8)).toBe('urgent')
  })

  it('returns urgent for exactly 14 days (urgent boundary)', () => {
    expect(classifyStockUrgency(14)).toBe('urgent')
  })

  it('returns urgent for 10 days (within urgent zone)', () => {
    expect(classifyStockUrgency(10)).toBe('urgent')
  })

  it('returns low for exactly 15 days (just above urgent boundary)', () => {
    expect(classifyStockUrgency(15)).toBe('low')
  })

  it('returns low for exactly 30 days (low boundary)', () => {
    expect(classifyStockUrgency(30)).toBe('low')
  })

  it('returns low for 20 days (within low zone)', () => {
    expect(classifyStockUrgency(20)).toBe('low')
  })

  it('returns healthy for exactly 31 days (just above low boundary)', () => {
    expect(classifyStockUrgency(31)).toBe('healthy')
  })

  it('returns healthy for 90 days', () => {
    expect(classifyStockUrgency(90)).toBe('healthy')
  })
})
