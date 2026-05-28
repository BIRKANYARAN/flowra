// ─────────────────────────────────────────────────────────────────────────────
// tests/cash-sensitivity.test.ts
//
// Unit tests for all 5 pure functions in cash-sensitivity.service.ts
// Min 20 tests covering normal cases, edge cases, and boundary conditions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  applyRevenueShock,
  applyCollectionsDelay,
  applyExpenseSurge,
  computeStressedRunway,
  classifyStressImpact,
} from '../lib/services/finance/cash-sensitivity.service'

// ── applyRevenueShock ─────────────────────────────────────────────────────────

describe('applyRevenueShock', () => {
  it('reduces revenue by the given shock percentage', () => {
    // 20% shock on 100_000 → 80_000
    expect(applyRevenueShock(100_000, 20)).toBe(80_000)
  })

  it('reduces revenue by 10%', () => {
    // 10% shock on 200_000 → 180_000
    expect(applyRevenueShock(200_000, 10)).toBe(180_000)
  })

  it('zero shock leaves revenue unchanged', () => {
    expect(applyRevenueShock(150_000, 0)).toBe(150_000)
  })

  it('100% shock reduces revenue to 0', () => {
    expect(applyRevenueShock(500_000, 100)).toBe(0)
  })

  it('handles zero base revenue', () => {
    expect(applyRevenueShock(0, 25)).toBe(0)
  })
})

// ── applyCollectionsDelay ─────────────────────────────────────────────────────

describe('applyCollectionsDelay', () => {
  it('subtracts delayed amount from cash', () => {
    // daily = 1_000, delay = 15 → delayed = 15_000; cash 100_000 - 15_000 = 85_000
    expect(applyCollectionsDelay(100_000, 1_000, 15)).toBe(85_000)
  })

  it('30-day delay with 500/day removes 15_000 from 50_000 base', () => {
    expect(applyCollectionsDelay(50_000, 500, 30)).toBe(35_000)
  })

  it('zero delay leaves cash unchanged', () => {
    expect(applyCollectionsDelay(80_000, 2_000, 0)).toBe(80_000)
  })

  it('zero daily avg collections leaves cash unchanged regardless of delay', () => {
    expect(applyCollectionsDelay(60_000, 0, 45)).toBe(60_000)
  })

  it('can return negative cash if delay is large', () => {
    // daily = 10_000, delay = 30 → delayed = 300_000; cash 50_000 - 300_000 = -250_000
    expect(applyCollectionsDelay(50_000, 10_000, 30)).toBe(-250_000)
  })
})

// ── applyExpenseSurge ─────────────────────────────────────────────────────────

describe('applyExpenseSurge', () => {
  it('increases expenses by the surge percentage', () => {
    // 10% surge on 100_000 → 110_000
    expect(applyExpenseSurge(100_000, 10)).toBe(110_000)
  })

  it('20% surge on 50_000 → 60_000', () => {
    expect(applyExpenseSurge(50_000, 20)).toBe(60_000)
  })

  it('zero surge leaves expenses unchanged', () => {
    expect(applyExpenseSurge(75_000, 0)).toBe(75_000)
  })

  it('handles zero base expenses', () => {
    expect(applyExpenseSurge(0, 15)).toBe(0)
  })
})

// ── computeStressedRunway ─────────────────────────────────────────────────────

describe('computeStressedRunway', () => {
  it('correctly computes runway as cash / burn', () => {
    // 120_000 / 40_000 = 3.0 months
    expect(computeStressedRunway(120_000, 40_000)).toBe(3)
  })

  it('handles non-integer runway with rounding', () => {
    // 100_000 / 30_000 = 3.333... → rounds to 3.33
    expect(computeStressedRunway(100_000, 30_000)).toBe(3.33)
  })

  it('returns null when stressed burn is zero', () => {
    expect(computeStressedRunway(100_000, 0)).toBeNull()
  })

  it('returns null when stressed burn is negative', () => {
    expect(computeStressedRunway(100_000, -5_000)).toBeNull()
  })

  it('returns null when current cash is zero or negative', () => {
    expect(computeStressedRunway(0, 50_000)).toBeNull()
  })

  it('returns null when current cash is negative', () => {
    expect(computeStressedRunway(-10_000, 50_000)).toBeNull()
  })
})

// ── classifyStressImpact ──────────────────────────────────────────────────────

describe('classifyStressImpact', () => {
  it('returns resilient when delta >= 0 (stressed runway better or equal)', () => {
    // base = 6, stressed = 6 → delta = 0 → resilient
    expect(classifyStressImpact(6, 6)).toBe('resilient')
  })

  it('returns resilient when stressed runway improves', () => {
    // base = 4, stressed = 7 → delta = +3 → resilient
    expect(classifyStressImpact(4, 7)).toBe('resilient')
  })

  it('returns moderate when delta is between -3 and 0 (exclusive)', () => {
    // base = 6, stressed = 4 → delta = -2 → moderate
    expect(classifyStressImpact(6, 4)).toBe('moderate')
  })

  it('returns moderate at boundary -3', () => {
    // base = 6, stressed = 3 → delta = -3 → moderate (>= -3)
    expect(classifyStressImpact(6, 3)).toBe('moderate')
  })

  it('returns vulnerable when delta is between -6 and -3 (exclusive)', () => {
    // base = 10, stressed = 6 → delta = -4 → vulnerable
    expect(classifyStressImpact(10, 6)).toBe('vulnerable')
  })

  it('returns vulnerable at boundary -6', () => {
    // base = 10, stressed = 4 → delta = -6 → vulnerable (>= -6)
    expect(classifyStressImpact(10, 4)).toBe('vulnerable')
  })

  it('returns critical when delta < -6', () => {
    // base = 12, stressed = 5 → delta = -7 → critical
    expect(classifyStressImpact(12, 5)).toBe('critical')
  })

  it('returns critical for a large negative delta', () => {
    // base = 20, stressed = 1 → delta = -19 → critical
    expect(classifyStressImpact(20, 1)).toBe('critical')
  })

  it('returns unknown when base runway is null', () => {
    expect(classifyStressImpact(null, 3)).toBe('unknown')
  })

  it('returns unknown when stressed runway is null', () => {
    expect(classifyStressImpact(6, null)).toBe('unknown')
  })

  it('returns unknown when both are null', () => {
    expect(classifyStressImpact(null, null)).toBe('unknown')
  })
})
