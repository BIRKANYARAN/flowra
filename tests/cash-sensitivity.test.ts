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

// ── applyRevenueShock — additional boundary tests ─────────────────────────────

describe('applyRevenueShock — additional', () => {
  it('30% shock: 300_000 → 210_000', () => {
    expect(applyRevenueShock(300_000, 30)).toBe(210_000)
  })

  it('25% shock: 200_000 → 150_000', () => {
    expect(applyRevenueShock(200_000, 25)).toBe(150_000)
  })

  it('10% shock: 1_000 → 900', () => {
    expect(applyRevenueShock(1_000, 10)).toBe(900)
  })

  it('50% shock halves revenue', () => {
    const base = 80_000
    expect(applyRevenueShock(base, 50)).toBe(base / 2)
  })

  it('small shock: 1% on 100_000 → 99_000', () => {
    expect(applyRevenueShock(100_000, 1)).toBe(99_000)
  })

  it('rounds to 2 decimal places', () => {
    // 33_333.33 * (1 - 0.33) = 22_333.33
    const result = applyRevenueShock(33_333.33, 33)
    expect(typeof result).toBe('number')
    expect(result).toBeCloseTo(22_333.33, 1)
  })

  it('200% shock results in negative (over-shock)', () => {
    // While unusual, the formula handles it: 50_000 * (1 - 2.0) = -50_000
    expect(applyRevenueShock(50_000, 200)).toBe(-50_000)
  })

  it('same base with increasing shocks produces decreasing revenue', () => {
    const base = 100_000
    const shocks = [0, 10, 20, 30]
    const results = shocks.map(s => applyRevenueShock(base, s))
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThan(results[i - 1])
    }
  })
})

// ── applyCollectionsDelay — additional tests ──────────────────────────────────

describe('applyCollectionsDelay — additional', () => {
  it('45-day delay with 1_000/day: 100_000 → 55_000', () => {
    expect(applyCollectionsDelay(100_000, 1_000, 45)).toBe(55_000)
  })

  it('1-day delay removes exactly daily average', () => {
    expect(applyCollectionsDelay(200_000, 3_000, 1)).toBe(197_000)
  })

  it('delayed cash can go deeply negative', () => {
    // 5_000 cash - (10_000 * 45) = 5_000 - 450_000 = -445_000
    const result = applyCollectionsDelay(5_000, 10_000, 45)
    expect(result).toBeLessThan(0)
    expect(result).toBe(-445_000)
  })

  it('starting from 0, delay makes it more negative', () => {
    expect(applyCollectionsDelay(0, 5_000, 10)).toBe(-50_000)
  })

  it('rounding: 2.5/day, 3 days → delayed = 7.5 → rounds correctly', () => {
    const result = applyCollectionsDelay(100, 2.5, 3)
    expect(result).toBe(92.5) // 100 - 7.5
  })

  it('large base cash, tiny delay has small effect', () => {
    const result = applyCollectionsDelay(1_000_000, 100, 1)
    expect(result).toBe(999_900)
  })

  it('negative daily avg (unusual) still works arithmetically', () => {
    // delay * negative = subtracting a negative = adding
    const result = applyCollectionsDelay(100_000, -1_000, 10)
    expect(result).toBe(110_000)
  })
})

// ── applyExpenseSurge — additional tests ─────────────────────────────────────

describe('applyExpenseSurge — additional', () => {
  it('5% surge on 100_000 → 105_000', () => {
    expect(applyExpenseSurge(100_000, 5)).toBe(105_000)
  })

  it('15% surge on 200_000 → 230_000', () => {
    expect(applyExpenseSurge(200_000, 15)).toBe(230_000)
  })

  it('100% surge doubles expenses', () => {
    expect(applyExpenseSurge(50_000, 100)).toBe(100_000)
  })

  it('1% surge: 100_000 → 101_000', () => {
    expect(applyExpenseSurge(100_000, 1)).toBe(101_000)
  })

  it('50% surge on 30_000 → 45_000', () => {
    expect(applyExpenseSurge(30_000, 50)).toBe(45_000)
  })

  it('same base with increasing surges produces increasing expenses', () => {
    const base = 100_000
    const surges = [0, 5, 10, 20]
    const results = surges.map(s => applyExpenseSurge(base, s))
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeGreaterThan(results[i - 1])
    }
  })

  it('rounds to 2 decimal places', () => {
    // 33_333.33 * 1.1 = 36_666.663 → 36_666.66
    const result = applyExpenseSurge(33_333.33, 10)
    expect(result).toBeCloseTo(36_666.66, 1)
  })
})

// ── computeStressedRunway — additional tests ──────────────────────────────────

describe('computeStressedRunway — additional', () => {
  it('exactly 1 month runway', () => {
    expect(computeStressedRunway(50_000, 50_000)).toBe(1)
  })

  it('exactly 6 months runway', () => {
    expect(computeStressedRunway(300_000, 50_000)).toBe(6)
  })

  it('very small runway (0.1 months) rounds correctly', () => {
    expect(computeStressedRunway(5_000, 50_000)).toBe(0.1)
  })

  it('large cash / small burn = many months', () => {
    expect(computeStressedRunway(1_000_000, 10_000)).toBe(100)
  })

  it('1 TL cash with 10k burn → tiny runway rounded', () => {
    // 1 / 10_000 = 0.0001 → rounds to 0
    const result = computeStressedRunway(1, 10_000)
    expect(result).toBe(0) // round2(0.0001) = 0
  })

  it('cash = burn produces 1 month exactly', () => {
    expect(computeStressedRunway(75_000, 75_000)).toBe(1)
  })

  it('returns null for burn of exactly 0', () => {
    expect(computeStressedRunway(200_000, 0)).toBeNull()
  })

  it('returns null for cash of exactly 0', () => {
    expect(computeStressedRunway(0, 100_000)).toBeNull()
  })
})

// ── classifyStressImpact — additional boundary tests ─────────────────────────

describe('classifyStressImpact — additional', () => {
  it('delta of -0.01 is moderate (close to 0)', () => {
    expect(classifyStressImpact(6, 5.99)).toBe('moderate')
  })

  it('delta of -2.99 is moderate', () => {
    expect(classifyStressImpact(6, 3.01)).toBe('moderate')
  })

  it('delta of -3.01 is vulnerable', () => {
    expect(classifyStressImpact(6, 2.99)).toBe('vulnerable')
  })

  it('delta of -5.99 is vulnerable', () => {
    expect(classifyStressImpact(10, 4.01)).toBe('vulnerable')
  })

  it('delta of -6.01 is critical', () => {
    expect(classifyStressImpact(10, 3.99)).toBe('critical')
  })

  it('stressed runway = 0 and base = 5 → delta = -5 → vulnerable', () => {
    expect(classifyStressImpact(5, 0)).toBe('vulnerable')
  })

  it('both zero runway → resilient (delta = 0)', () => {
    expect(classifyStressImpact(0, 0)).toBe('resilient')
  })

  it('base null, stressed provided → unknown', () => {
    expect(classifyStressImpact(null, 5)).toBe('unknown')
  })

  it('base provided, stressed null → unknown', () => {
    expect(classifyStressImpact(8, null)).toBe('unknown')
  })

  it('high base and medium stressed → critical', () => {
    // delta = 1 - 12 = -11 → critical
    expect(classifyStressImpact(12, 1)).toBe('critical')
  })
})
