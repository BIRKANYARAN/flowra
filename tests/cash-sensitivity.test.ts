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

// ── applyRevenueShock — positive/negative/zero shocks ────────────────────────

describe('applyRevenueShock — comprehensive shock scenarios', () => {
  it('zero base with any shock → 0', () => {
    expect(applyRevenueShock(0, 50)).toBe(0)
  })

  it('zero shock → no change', () => {
    expect(applyRevenueShock(300_000, 0)).toBe(300_000)
  })

  it('100% shock → 0 revenue', () => {
    expect(applyRevenueShock(1_000_000, 100)).toBe(0)
  })

  it('10% shock: 100_000 → 90_000', () => {
    expect(applyRevenueShock(100_000, 10)).toBe(90_000)
  })

  it('20% shock: 250_000 → 200_000', () => {
    expect(applyRevenueShock(250_000, 20)).toBe(200_000)
  })

  it('25% shock: 400_000 → 300_000', () => {
    expect(applyRevenueShock(400_000, 25)).toBe(300_000)
  })

  it('30% shock: 100_000 → 70_000', () => {
    expect(applyRevenueShock(100_000, 30)).toBe(70_000)
  })

  it('5% shock: 1_000 → 950', () => {
    expect(applyRevenueShock(1_000, 5)).toBe(950)
  })

  it('result rounds to 2dp for fractional results', () => {
    const result = applyRevenueShock(100_000, 33)
    // 100_000 * (1 - 0.33) = 67_000 exactly
    expect(result).toBeCloseTo(67_000, 1)
  })

  it('higher shock always produces lower revenue (monotone)', () => {
    const base = 500_000
    expect(applyRevenueShock(base, 30)).toBeLessThan(applyRevenueShock(base, 20))
    expect(applyRevenueShock(base, 20)).toBeLessThan(applyRevenueShock(base, 10))
  })

  it('shock result is numeric and finite', () => {
    const r = applyRevenueShock(123_456, 15)
    expect(isFinite(r)).toBe(true)
  })
})

// ── applyCollectionsDelay — formula verification ──────────────────────────────

describe('applyCollectionsDelay — formula verification', () => {
  it('delayed = daily × days; result = cash - delayed', () => {
    // 500/day × 20 days = 10_000 delayed; 80_000 - 10_000 = 70_000
    expect(applyCollectionsDelay(80_000, 500, 20)).toBe(70_000)
  })

  it('zero delay → cash unchanged', () => {
    expect(applyCollectionsDelay(50_000, 3_000, 0)).toBe(50_000)
  })

  it('zero daily avg → cash unchanged regardless of delay', () => {
    expect(applyCollectionsDelay(50_000, 0, 45)).toBe(50_000)
  })

  it('large delay can make cash negative', () => {
    // 100/day × 1000 days = 100_000 delayed; 50_000 - 100_000 = -50_000
    expect(applyCollectionsDelay(50_000, 100, 1000)).toBe(-50_000)
  })

  it('15-day delay with 2_000/day: 100_000 → 70_000', () => {
    expect(applyCollectionsDelay(100_000, 2_000, 15)).toBe(70_000)
  })

  it('30-day delay with 1_000/day: 60_000 → 30_000', () => {
    expect(applyCollectionsDelay(60_000, 1_000, 30)).toBe(30_000)
  })

  it('45-day delay with 500/day: 30_000 → 7_500', () => {
    expect(applyCollectionsDelay(30_000, 500, 45)).toBe(7_500)
  })

  it('result rounds to 2 decimal places', () => {
    const result = applyCollectionsDelay(100_000, 333.33, 3)
    // delayed = 999.99; result = 99_000.01
    expect(result).toBeCloseTo(99_000.01, 1)
  })

  it('zero cash minus any delay → negative', () => {
    expect(applyCollectionsDelay(0, 1_000, 10)).toBe(-10_000)
  })
})

// ── applyExpenseSurge — surge formula verification ───────────────────────────

describe('applyExpenseSurge — surge formula verification', () => {
  it('zero surge → expenses unchanged', () => {
    expect(applyExpenseSurge(100_000, 0)).toBe(100_000)
  })

  it('zero base expenses → 0 regardless of surge', () => {
    expect(applyExpenseSurge(0, 50)).toBe(0)
  })

  it('5% surge: 100_000 → 105_000', () => {
    expect(applyExpenseSurge(100_000, 5)).toBe(105_000)
  })

  it('10% surge: 100_000 → 110_000', () => {
    expect(applyExpenseSurge(100_000, 10)).toBe(110_000)
  })

  it('15% surge: 100_000 → 115_000', () => {
    expect(applyExpenseSurge(100_000, 15)).toBe(115_000)
  })

  it('20% surge: 100_000 → 120_000', () => {
    expect(applyExpenseSurge(100_000, 20)).toBe(120_000)
  })

  it('100% surge doubles the expenses', () => {
    expect(applyExpenseSurge(75_000, 100)).toBe(150_000)
  })

  it('higher surge always produces higher expenses', () => {
    const base = 200_000
    expect(applyExpenseSurge(base, 20)).toBeGreaterThan(applyExpenseSurge(base, 10))
  })

  it('result is always >= base (for positive surge)', () => {
    const base = 50_000
    for (const s of [0, 5, 10, 20]) {
      expect(applyExpenseSurge(base, s)).toBeGreaterThanOrEqual(base)
    }
  })

  it('result is rounded to 2dp', () => {
    const result = applyExpenseSurge(33_333.33, 7)
    const dp = String(result).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })
})

// ── computeStressedRunway — exact calculation and null cases ──────────────────

describe('computeStressedRunway — exact calculation and null cases', () => {
  it('returns null when burn <= 0', () => {
    expect(computeStressedRunway(100_000, 0)).toBeNull()
    expect(computeStressedRunway(100_000, -1)).toBeNull()
  })

  it('returns null when cash <= 0', () => {
    expect(computeStressedRunway(0, 50_000)).toBeNull()
    expect(computeStressedRunway(-1, 50_000)).toBeNull()
  })

  it('runway = cash / burn: 120_000 / 30_000 = 4 months', () => {
    expect(computeStressedRunway(120_000, 30_000)).toBe(4)
  })

  it('runway rounded to 2dp: 100_000 / 60_000 = 1.67', () => {
    expect(computeStressedRunway(100_000, 60_000)).toBe(1.67)
  })

  it('runway = 1 when cash = burn', () => {
    expect(computeStressedRunway(50_000, 50_000)).toBe(1)
  })

  it('large cash / small burn = many months', () => {
    expect(computeStressedRunway(3_650_000, 100_000)).toBe(36.5)
  })

  it('small cash / large burn = fraction of a month', () => {
    // 5_000 / 50_000 = 0.1
    expect(computeStressedRunway(5_000, 50_000)).toBe(0.1)
  })

  it('result is always non-negative when not null', () => {
    const result = computeStressedRunway(200_000, 80_000)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThanOrEqual(0)
  })

  it('very tiny runway rounds to 0', () => {
    // 10 / 1_000_000 = 0.00001 → round2 = 0
    expect(computeStressedRunway(10, 1_000_000)).toBe(0)
  })
})

// ── classifyStressImpact — all levels with exact deltas ───────────────────────

describe('classifyStressImpact — all levels with exact deltas', () => {
  it('delta = 0 → resilient', () => {
    expect(classifyStressImpact(5, 5)).toBe('resilient')
  })

  it('delta = +1 → resilient (improved)', () => {
    expect(classifyStressImpact(4, 5)).toBe('resilient')
  })

  it('delta = -0.5 → moderate', () => {
    expect(classifyStressImpact(5, 4.5)).toBe('moderate')
  })

  it('delta = -3 → moderate (at boundary >= -3)', () => {
    expect(classifyStressImpact(6, 3)).toBe('moderate')
  })

  it('delta = -3.01 → vulnerable (just below -3)', () => {
    expect(classifyStressImpact(6.01, 3)).toBe('vulnerable')
  })

  it('delta = -4 → vulnerable', () => {
    expect(classifyStressImpact(8, 4)).toBe('vulnerable')
  })

  it('delta = -6 → vulnerable (at boundary >= -6)', () => {
    expect(classifyStressImpact(10, 4)).toBe('vulnerable')
  })

  it('delta = -6.01 → critical (just below -6)', () => {
    expect(classifyStressImpact(10.01, 4)).toBe('critical')
  })

  it('delta = -10 → critical', () => {
    expect(classifyStressImpact(12, 2)).toBe('critical')
  })

  it('both null → unknown', () => {
    expect(classifyStressImpact(null, null)).toBe('unknown')
  })

  it('base null, stressed non-null → unknown', () => {
    expect(classifyStressImpact(null, 5)).toBe('unknown')
  })

  it('base non-null, stressed null → unknown', () => {
    expect(classifyStressImpact(5, null)).toBe('unknown')
  })

  it('result is always one of the five valid impact levels', () => {
    const valid = ['resilient', 'moderate', 'vulnerable', 'critical', 'unknown']
    for (const [b, s] of [[6,6],[6,4],[6,2],[6,0],[null,null]] as [number|null, number|null][]) {
      expect(valid).toContain(classifyStressImpact(b, s))
    }
  })
})
