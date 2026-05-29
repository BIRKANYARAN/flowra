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

  // ── Additional: real-world inventory scenarios ────────────────────────────

  it('returns 0 when observationDays is negative (invalid window)', () => {
    expect(computeDailyVelocity(100, -1)).toBe(0)
  })

  it('computes 90-day default window correctly', () => {
    // standard observation window
    expect(computeDailyVelocity(270, 90)).toBeCloseTo(3, 5)
  })

  it('computes very low velocity (slow-moving item)', () => {
    // 1 unit sold in 90 days → ~0.011/day
    expect(computeDailyVelocity(1, 90)).toBeCloseTo(1 / 90, 6)
  })

  it('computes high velocity (fast-moving FMCG item)', () => {
    // 900 units sold in 30 days → 30/day
    expect(computeDailyVelocity(900, 30)).toBeCloseTo(30, 5)
  })

  it('returns exact integer when division is even', () => {
    expect(computeDailyVelocity(100, 10)).toBe(10)
  })

  it('returns 0 for both zero inputs', () => {
    expect(computeDailyVelocity(0, 0)).toBe(0)
  })

  it('handles single-day window (edge case)', () => {
    expect(computeDailyVelocity(5, 1)).toBe(5)
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

  // ── Additional: urgency boundaries, large values ──────────────────────────

  it('returns exactly 7 when stock = 7 × velocity (critical boundary)', () => {
    expect(computeDaysToStockout(7, 1)).toBeCloseTo(7, 5)
  })

  it('returns exactly 14 when stock = 14 × velocity (urgent boundary)', () => {
    expect(computeDaysToStockout(14, 1)).toBeCloseTo(14, 5)
  })

  it('returns exactly 30 when stock = 30 × velocity (low boundary)', () => {
    expect(computeDaysToStockout(30, 1)).toBeCloseTo(30, 5)
  })

  it('returns just above 30 when stock = 31 × velocity (healthy zone)', () => {
    expect(computeDaysToStockout(31, 1)).toBeCloseTo(31, 5)
  })

  it('returns null when velocity is negative (invalid input)', () => {
    expect(computeDaysToStockout(100, -1)).toBeNull()
  })

  it('handles very high velocity item (promotions / flash sale)', () => {
    // 10 units, 5 units/day → 2 days
    expect(computeDaysToStockout(10, 5)).toBeCloseTo(2, 5)
  })

  it('handles very large stock with moderate velocity', () => {
    // 10,000 units, 2/day → 5000 days
    expect(computeDaysToStockout(10_000, 2)).toBeCloseTo(5000, 2)
  })

  it('returns 0 for negative current qty (over-sold / data error)', () => {
    expect(computeDaysToStockout(-5, 3)).toBe(0)
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

  // ── Additional: factor boundaries, large values ───────────────────────────

  it('returns 0 when leadTimeDays is 0', () => {
    expect(computeSafetyStock(5, 0)).toBe(0)
  })

  it('returns 0 when both velocity and leadTime are 0', () => {
    expect(computeSafetyStock(0, 0)).toBe(0)
  })

  it('result is always non-negative for positive inputs', () => {
    const result = computeSafetyStock(0.1, 1, 1.5)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('ceil: 10 × 14 × 1.5 = 210 (exact, no rounding)', () => {
    expect(computeSafetyStock(10, 14, 1.5)).toBe(210)
  })

  it('ceil: 1 × 1 × 1.5 = 1.5 → ceil → 2', () => {
    expect(computeSafetyStock(1, 1, 1.5)).toBe(2)
  })

  it('safety factor 2.0 gives 33% more than 1.5 factor', () => {
    const ss15 = computeSafetyStock(4, 10, 1.5)  // 60
    const ss20 = computeSafetyStock(4, 10, 2.0)  // 80
    expect(ss20).toBeGreaterThan(ss15)
  })

  it('handles slow-moving item: 0.1 units/day × 14 days × 1.5 = 2.1 → ceil → 3', () => {
    expect(computeSafetyStock(0.1, 14, 1.5)).toBe(3)
  })

  it('scales linearly with lead time', () => {
    const ss7  = computeSafetyStock(1, 7, 1.0)   // 7
    const ss14 = computeSafetyStock(1, 14, 1.0)  // 14
    expect(ss14).toBe(ss7 * 2)
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

  // ── Additional: composition invariants ───────────────────────────────────

  it('reorder_point = safety_stock + ceil(velocity × lead)', () => {
    const v = 2, l = 10, f = 1.5
    const ss = computeSafetyStock(v, l, f)
    const rp = computeReorderPoint(v, l, f)
    expect(rp).toBe(ss + Math.ceil(v * l))
  })

  it('returns 0 when leadTimeDays is 0', () => {
    expect(computeReorderPoint(5, 0)).toBe(0)
  })

  it('increases with higher safety factor', () => {
    const rp15 = computeReorderPoint(2, 14, 1.5)
    const rp20 = computeReorderPoint(2, 14, 2.0)
    expect(rp20).toBeGreaterThan(rp15)
  })

  it('scales with velocity', () => {
    const rp1 = computeReorderPoint(1, 7)
    const rp2 = computeReorderPoint(2, 7)
    expect(rp2).toBeGreaterThan(rp1)
  })

  it('always returns an integer (result of ceil operations)', () => {
    const rp = computeReorderPoint(1.7, 9, 1.5)
    expect(Number.isInteger(rp)).toBe(true)
  })

  it('with factor=1.0: reorder_point = 2 × ceil(velocity × lead)', () => {
    // ss = ceil(v × l × 1.0) = ceil(v × l)
    // rp = ss + ceil(v × l) = 2 × ceil(v × l)
    const v = 3, l = 5
    const rp = computeReorderPoint(v, l, 1.0)
    expect(rp).toBe(2 * Math.ceil(v * l))
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

  // ── Additional: extended boundary verification ────────────────────────────

  it('returns critical for 1 day (imminent stockout)', () => {
    expect(classifyStockUrgency(1)).toBe('critical')
  })

  it('returns critical for 2 days', () => {
    expect(classifyStockUrgency(2)).toBe('critical')
  })

  it('boundary: 7 is critical, 8 is urgent', () => {
    expect(classifyStockUrgency(7)).toBe('critical')
    expect(classifyStockUrgency(8)).toBe('urgent')
  })

  it('boundary: 14 is urgent, 15 is low', () => {
    expect(classifyStockUrgency(14)).toBe('urgent')
    expect(classifyStockUrgency(15)).toBe('low')
  })

  it('boundary: 30 is low, 31 is healthy', () => {
    expect(classifyStockUrgency(30)).toBe('low')
    expect(classifyStockUrgency(31)).toBe('healthy')
  })

  it('returns healthy for 365 days (full year of stock)', () => {
    expect(classifyStockUrgency(365)).toBe('healthy')
  })

  it('returns healthy for 1000 days (overstocked)', () => {
    expect(classifyStockUrgency(1000)).toBe('healthy')
  })

  it('urgency ordering: critical < urgent < low < healthy (severity descending)', () => {
    const order = ['critical', 'urgent', 'low', 'healthy']
    const samples = [
      classifyStockUrgency(3),   // critical
      classifyStockUrgency(10),  // urgent
      classifyStockUrgency(20),  // low
      classifyStockUrgency(60),  // healthy
    ]
    expect(samples).toEqual(order)
  })
})

// ── computeDailyVelocity — additional large/zero edge cases ───────────────────

describe('computeDailyVelocity — edge cases and large values', () => {
  it('returns 0 when observationDays is 0 (zero days window)', () => {
    expect(computeDailyVelocity(500, 0)).toBe(0)
  })

  it('returns 0 when both qty and days are 0', () => {
    expect(computeDailyVelocity(0, 0)).toBe(0)
  })

  it('handles 1000 units sold over 100 days = 10/day', () => {
    expect(computeDailyVelocity(1000, 100)).toBe(10)
  })

  it('handles very large qty and large days', () => {
    expect(computeDailyVelocity(1_000_000, 365)).toBeCloseTo(2739.73, 1)
  })

  it('returns fractional velocity for odd division', () => {
    expect(computeDailyVelocity(7, 14)).toBeCloseTo(0.5, 5)
  })

  it('computes 30-day window correctly', () => {
    expect(computeDailyVelocity(60, 30)).toBe(2)
  })
})

// ── computeDaysToStockout — zero velocity = infinite stockout ─────────────────

describe('computeDaysToStockout — zero velocity and other edge cases', () => {
  it('returns null when velocity is exactly 0 (infinite stockout)', () => {
    expect(computeDaysToStockout(100, 0)).toBeNull()
  })

  it('returns null when velocity is slightly above 0 but very small... actually no, small velocity returns large value', () => {
    // 0.001 velocity → 1 unit takes 1000 days
    expect(computeDaysToStockout(1, 0.001)).toBeCloseTo(1000, 1)
  })

  it('returns 0 when currentQty is exactly 0 with positive velocity', () => {
    expect(computeDaysToStockout(0, 10)).toBe(0)
  })

  it('returns 0 for negative qty (over-sold scenario)', () => {
    expect(computeDaysToStockout(-10, 5)).toBe(0)
  })

  it('handles stockout exactly at 7.5 days (fractional critical zone)', () => {
    expect(computeDaysToStockout(15, 2)).toBeCloseTo(7.5, 5)
  })

  it('large stock with unit velocity → large days to stockout', () => {
    expect(computeDaysToStockout(365, 1)).toBeCloseTo(365, 5)
  })
})

// ── computeSafetyStock — safety factor variations ─────────────────────────────

describe('computeSafetyStock — safety factor variations', () => {
  it('safety factor 1.0 gives base coverage without buffer', () => {
    // 5 × 10 × 1.0 = 50
    expect(computeSafetyStock(5, 10, 1.0)).toBe(50)
  })

  it('safety factor 2.0 gives 2× base coverage', () => {
    // 5 × 10 × 2.0 = 100
    expect(computeSafetyStock(5, 10, 2.0)).toBe(100)
  })

  it('safety factor 0.5 reduces buffer below lead time coverage', () => {
    // 4 × 10 × 0.5 = 20
    expect(computeSafetyStock(4, 10, 0.5)).toBe(20)
  })

  it('safety factor 3.0 triples the base', () => {
    // 2 × 7 × 3.0 = 42
    expect(computeSafetyStock(2, 7, 3.0)).toBe(42)
  })

  it('default factor is 1.5', () => {
    // Explicit vs implicit should match
    expect(computeSafetyStock(4, 10)).toBe(computeSafetyStock(4, 10, 1.5))
  })

  it('result increases monotonically with safety factor', () => {
    const f1 = computeSafetyStock(3, 7, 1.0)
    const f15 = computeSafetyStock(3, 7, 1.5)
    const f2 = computeSafetyStock(3, 7, 2.0)
    expect(f15).toBeGreaterThanOrEqual(f1)
    expect(f2).toBeGreaterThanOrEqual(f15)
  })
})

// ── computeReorderPoint — formula verification ────────────────────────────────

describe('computeReorderPoint — formula: safetyStock + ceil(velocity × lead)', () => {
  it('formula holds with default factor 1.5', () => {
    const v = 3, l = 7
    const ss = computeSafetyStock(v, l)         // ceil(3 × 7 × 1.5) = ceil(31.5) = 32
    const rp = computeReorderPoint(v, l)
    expect(rp).toBe(ss + Math.ceil(v * l))        // 32 + 21 = 53
  })

  it('formula holds with factor 1.0', () => {
    const v = 5, l = 6, f = 1.0
    const ss = computeSafetyStock(v, l, f)       // ceil(5 × 6 × 1.0) = 30
    const rp = computeReorderPoint(v, l, f)
    expect(rp).toBe(ss + Math.ceil(v * l))
  })

  it('formula holds with factor 2.0', () => {
    const v = 2, l = 14, f = 2.0
    const ss = computeSafetyStock(v, l, f)
    const rp = computeReorderPoint(v, l, f)
    expect(rp).toBe(ss + Math.ceil(v * l))
  })

  it('reorder point is always >= safety stock when velocity > 0', () => {
    const ss = computeSafetyStock(2, 10, 1.5)
    const rp = computeReorderPoint(2, 10, 1.5)
    expect(rp).toBeGreaterThanOrEqual(ss)
  })

  it('returns integer for non-integer velocity', () => {
    expect(Number.isInteger(computeReorderPoint(2.3, 5, 1.5))).toBe(true)
  })
})

// ── classifyStockUrgency — all urgency levels with exact boundary values ───────

describe('classifyStockUrgency — exact boundary values for all levels', () => {
  it('0 days → critical (already stocked out)', () => {
    expect(classifyStockUrgency(0)).toBe('critical')
  })

  it('7 days → critical (≤7 boundary)', () => {
    expect(classifyStockUrgency(7)).toBe('critical')
  })

  it('8 days → urgent (just above critical boundary)', () => {
    expect(classifyStockUrgency(8)).toBe('urgent')
  })

  it('14 days → urgent (≤14 boundary)', () => {
    expect(classifyStockUrgency(14)).toBe('urgent')
  })

  it('15 days → low (just above urgent boundary)', () => {
    expect(classifyStockUrgency(15)).toBe('low')
  })

  it('30 days → low (≤30 boundary)', () => {
    expect(classifyStockUrgency(30)).toBe('low')
  })

  it('31 days → healthy (just above low boundary)', () => {
    expect(classifyStockUrgency(31)).toBe('healthy')
  })

  it('null → no_movement (zero velocity)', () => {
    expect(classifyStockUrgency(null)).toBe('no_movement')
  })

  it('500 days → healthy (very well stocked)', () => {
    expect(classifyStockUrgency(500)).toBe('healthy')
  })

  it('result is always a valid urgency string', () => {
    const valid = ['no_movement', 'critical', 'urgent', 'low', 'healthy']
    const testCases: Array<number|null> = [null, 0, 1, 7, 8, 14, 15, 30, 31, 100]
    for (const d of testCases) {
      expect(valid).toContain(classifyStockUrgency(d))
    }
  })
})
