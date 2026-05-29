/**
 * Tests for pure helper functions in ops-command.service.ts.
 *
 * Covers: computeDodChange, computeWowChange, classifyOpsPulse,
 *         computeFillRate, computeDailyCollectionRate.
 *
 * No DB, no Supabase, no HTTP — pure math only.
 *
 * Run with: npx vitest run tests/ops-command.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeDodChange,
  computeWowChange,
  classifyOpsPulse,
  computeFillRate,
  computeDailyCollectionRate,
} from '../lib/services/intelligence/ops-command.service'

// ── computeDodChange ──────────────────────────────────────────────────────────

describe('computeDodChange', () => {
  it('positive day-over-day change', () => {
    // 150 today vs 100 yesterday = +50%
    expect(computeDodChange(150, 100)).toBeCloseTo(50)
  })

  it('negative day-over-day change', () => {
    // 80 today vs 100 yesterday = -20%
    expect(computeDodChange(80, 100)).toBeCloseTo(-20)
  })

  it('no change (same value)', () => {
    expect(computeDodChange(100, 100)).toBeCloseTo(0)
  })

  it('returns null when yesterday value is zero', () => {
    expect(computeDodChange(100, 0)).toBeNull()
  })

  it('returns null when both values are zero', () => {
    expect(computeDodChange(0, 0)).toBeNull()
  })

  it('today = 0, yesterday > 0 → -100%', () => {
    expect(computeDodChange(0, 100)).toBeCloseTo(-100)
  })

  it('large increase: 10x yesterday = +900%', () => {
    expect(computeDodChange(1000, 100)).toBeCloseTo(900)
  })

  it('fractional values: 1.5 today vs 1.0 yesterday = +50%', () => {
    expect(computeDodChange(1.5, 1.0)).toBeCloseTo(50)
  })

  it('formula is (today - yesterday) / yesterday × 100', () => {
    // 200 - 160 = 40, 40/160 × 100 = 25
    expect(computeDodChange(200, 160)).toBeCloseTo(25)
  })

  it('negative today value vs positive yesterday is allowed', () => {
    // (-50 - 100) / 100 × 100 = -150%
    expect(computeDodChange(-50, 100)).toBeCloseTo(-150)
  })

  it('very small yesterday value produces large pct', () => {
    // 100 vs 1 = +9900%
    expect(computeDodChange(100, 1)).toBeCloseTo(9900)
  })

  it('today > yesterday by exactly 1 TRY', () => {
    expect(computeDodChange(101, 100)).toBeCloseTo(1)
  })
})

// ── computeWowChange ──────────────────────────────────────────────────────────

describe('computeWowChange', () => {
  it('positive week-over-week change', () => {
    // 1200 this week vs 1000 last week = +20%
    expect(computeWowChange(1200, 1000)).toBeCloseTo(20)
  })

  it('negative week-over-week change', () => {
    // 750 this week vs 1000 last week = -25%
    expect(computeWowChange(750, 1000)).toBeCloseTo(-25)
  })

  it('no change (same value)', () => {
    expect(computeWowChange(500, 500)).toBeCloseTo(0)
  })

  it('returns null when last week value is zero', () => {
    expect(computeWowChange(500, 0)).toBeNull()
  })

  it('returns null when both weeks are zero', () => {
    expect(computeWowChange(0, 0)).toBeNull()
  })

  it('this week = 0, last week > 0 → -100%', () => {
    expect(computeWowChange(0, 1000)).toBeCloseTo(-100)
  })

  it('doubling revenue = +100%', () => {
    expect(computeWowChange(2000, 1000)).toBeCloseTo(100)
  })

  it('shares the same formula as computeDodChange (% change)', () => {
    // Both use (new - old) / old × 100
    const dodResult = computeDodChange(120, 100)
    const wowResult = computeWowChange(120, 100)
    expect(dodResult).toBeCloseTo(wowResult!)
  })

  it('handles large weekly revenues', () => {
    expect(computeWowChange(1_100_000, 1_000_000)).toBeCloseTo(10)
  })

  it('fractional values', () => {
    // 0.9 vs 1.0 = -10%
    expect(computeWowChange(0.9, 1.0)).toBeCloseTo(-10)
  })

  it('returns number not null when lastWeek > 0', () => {
    const result = computeWowChange(800, 1000)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })
})

// ── classifyOpsPulse ──────────────────────────────────────────────────────────

describe('classifyOpsPulse', () => {
  it('critical: collections_overdue > 5 AND stock_critical > 3', () => {
    expect(classifyOpsPulse(10, true, 6, 4)).toBe('critical')
  })

  it('critical: exactly collections=6 AND stock=4 (boundary)', () => {
    expect(classifyOpsPulse(null, true, 6, 4)).toBe('critical')
  })

  it('critical check runs before slow check (critical wins)', () => {
    // Even with no sales and negative DoD, critical condition dominates
    expect(classifyOpsPulse(null, false, 10, 10)).toBe('critical')
  })

  it('not critical when only overdue threshold exceeded (stock ok)', () => {
    // overdue > 5 but stock_critical <= 3 → not critical
    const result = classifyOpsPulse(-10, false, 6, 2)
    expect(result).not.toBe('critical')
  })

  it('not critical when overdue = 5 and stock = 4 (overdue not > 5)', () => {
    const result = classifyOpsPulse(10, true, 5, 4)
    expect(result).not.toBe('critical')
  })

  it('not critical when only stock threshold exceeded (overdue ok)', () => {
    // stock_critical > 3 but overdue <= 5 → not critical
    const result = classifyOpsPulse(-10, false, 3, 5)
    expect(result).not.toBe('critical')
  })

  it('not critical when overdue = 6 and stock = 3 (stock not > 3)', () => {
    const result = classifyOpsPulse(10, true, 6, 3)
    expect(result).not.toBe('critical')
  })

  it('slow: no sales today', () => {
    expect(classifyOpsPulse(5, false, 1, 0)).toBe('slow')
  })

  it('slow: revenue DoD < -20%', () => {
    expect(classifyOpsPulse(-25, true, 1, 0)).toBe('slow')
  })

  it('slow: exactly -20% DoD is NOT slow (boundary: strictly < -20)', () => {
    // -20 is not < -20
    expect(classifyOpsPulse(-20, true, 1, 0)).not.toBe('slow')
  })

  it('slow: -20.001% DoD IS slow', () => {
    expect(classifyOpsPulse(-20.001, true, 1, 0)).toBe('slow')
  })

  it('slow: very large negative DoD (-100%)', () => {
    expect(classifyOpsPulse(-100, true, 0, 0)).toBe('slow')
  })

  it('strong: all DoD positive AND no stock alerts', () => {
    expect(classifyOpsPulse(15, true, 1, 0)).toBe('strong')
  })

  it('strong: DoD = 0.1 (barely positive) AND no stock', () => {
    expect(classifyOpsPulse(0.1, true, 0, 0)).toBe('strong')
  })

  it('strong: DoD = 0 is NOT strong (not > 0)', () => {
    expect(classifyOpsPulse(0, true, 0, 0)).not.toBe('strong')
  })

  it('normal: positive DoD but stock_critical > 0', () => {
    expect(classifyOpsPulse(10, true, 0, 2)).toBe('normal')
  })

  it('normal: null DoD (no yesterday data), has sales, no critical issues', () => {
    expect(classifyOpsPulse(null, true, 2, 1)).toBe('normal')
  })

  it('normal: mixed signals — slightly negative DoD but > -20%', () => {
    expect(classifyOpsPulse(-15, true, 2, 1)).toBe('normal')
  })

  it('normal: null DoD with stock alerts', () => {
    expect(classifyOpsPulse(null, true, 0, 1)).toBe('normal')
  })

  it('normal: DoD = 0 (flat), has sales', () => {
    expect(classifyOpsPulse(0, true, 0, 0)).toBe('normal')
  })

  it('normal: DoD = -19% (not quite slow, not strong)', () => {
    expect(classifyOpsPulse(-19, true, 1, 1)).toBe('normal')
  })

  it('classifyOpsPulse produces one of 4 valid values', () => {
    const validValues = ['strong', 'normal', 'slow', 'critical']
    const result = classifyOpsPulse(5, true, 1, 0)
    expect(validValues).toContain(result)
  })
})

// ── computeFillRate ───────────────────────────────────────────────────────────

describe('computeFillRate', () => {
  it('normal fill rate: 8 of 10 = 80%', () => {
    expect(computeFillRate(8, 10)).toBeCloseTo(80)
  })

  it('perfect fill rate: 10 of 10 = 100%', () => {
    expect(computeFillRate(10, 10)).toBeCloseTo(100)
  })

  it('zero fulfilled: 0 of 10 = 0%', () => {
    expect(computeFillRate(0, 10)).toBeCloseTo(0)
  })

  it('returns 0 when ordersTotal = 0', () => {
    expect(computeFillRate(0, 0)).toBe(0)
  })

  it('returns 0 when ordersTotal = 0, even if fulfilled > 0', () => {
    expect(computeFillRate(5, 0)).toBe(0)
  })

  it('over 100% allowed: 11 of 10 = 110%', () => {
    expect(computeFillRate(11, 10)).toBeCloseTo(110)
  })

  it('result is in percentage points (not 0-1 fraction)', () => {
    const result = computeFillRate(5, 10)
    expect(result).toBeCloseTo(50)   // 50%, not 0.5
  })

  it('handles large order counts', () => {
    expect(computeFillRate(9_500, 10_000)).toBeCloseTo(95)
  })

  it('1 of 1 = 100%', () => {
    expect(computeFillRate(1, 1)).toBeCloseTo(100)
  })

  it('fractional values allowed (partial-unit orders)', () => {
    expect(computeFillRate(0.5, 1.0)).toBeCloseTo(50)
  })

  it('formula: (fulfilled / total) × 100', () => {
    const result = computeFillRate(3, 8)
    expect(result).toBeCloseTo((3 / 8) * 100)
  })
})

// ── computeDailyCollectionRate ────────────────────────────────────────────────

describe('computeDailyCollectionRate', () => {
  it('normal collection rate: 8000 of 10000 = 80%', () => {
    expect(computeDailyCollectionRate(8000, 10000)).toBeCloseTo(80)
  })

  it('full collection: 10000 of 10000 = 100%', () => {
    expect(computeDailyCollectionRate(10000, 10000)).toBeCloseTo(100)
  })

  it('no collection: 0 of 10000 = 0%', () => {
    expect(computeDailyCollectionRate(0, 10000)).toBeCloseTo(0)
  })

  it('returns null when amountDueTry = 0', () => {
    expect(computeDailyCollectionRate(0, 0)).toBeNull()
  })

  it('returns null when collected > 0 but due = 0', () => {
    expect(computeDailyCollectionRate(5000, 0)).toBeNull()
  })

  it('over-collection > 100% is allowed', () => {
    // e.g. prepayment: 12000 collected on 10000 due
    expect(computeDailyCollectionRate(12000, 10000)).toBeCloseTo(120)
  })

  it('result is in percentage points (not fraction)', () => {
    const rate = computeDailyCollectionRate(5000, 10000)
    expect(rate).toBeCloseTo(50)   // 50% not 0.5
  })

  it('handles very large TRY amounts', () => {
    expect(computeDailyCollectionRate(9_500_000, 10_000_000)).toBeCloseTo(95)
  })

  it('formula: (collected / due) × 100', () => {
    const result = computeDailyCollectionRate(3000, 8000)
    expect(result).toBeCloseTo((3000 / 8000) * 100)
  })

  it('fractional amounts produce correct percentage', () => {
    expect(computeDailyCollectionRate(1, 3)).toBeCloseTo(33.33, 1)
  })

  it('null is only returned for due = 0; positive due always returns number', () => {
    const result = computeDailyCollectionRate(100, 1)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })
})

// ── Cross-function consistency ────────────────────────────────────────────────

describe('Cross-function consistency', () => {
  it('computeDodChange and computeWowChange share the same null-guard logic', () => {
    // Both return null when denominator is 0
    expect(computeDodChange(100, 0)).toBeNull()
    expect(computeWowChange(100, 0)).toBeNull()
  })

  it('computeFillRate returns 0 on zero denominator, computeDailyCollectionRate returns null', () => {
    // Different null-guard semantics: fillRate defaults to 0, collectionRate returns null
    expect(computeFillRate(0, 0)).toBe(0)
    expect(computeDailyCollectionRate(0, 0)).toBeNull()
  })

  it('classifyOpsPulse with strong DoD and zero stock = strong pulse', () => {
    const dodChange = computeDodChange(150, 100)  // +50%
    const fillRate  = computeFillRate(10, 10)     // 100%
    expect(dodChange).toBeGreaterThan(0)
    expect(fillRate).toBe(100)
    const pulse = classifyOpsPulse(dodChange, true, 0, 0)
    expect(pulse).toBe('strong')
  })
})

// ── computeDodChange — additional precision and edge cases ────────────────────

describe('computeDodChange — additional precision and edge cases', () => {
  it('both today and yesterday are positive floats', () => {
    expect(computeDodChange(1.25, 1.00)).toBeCloseTo(25)
  })

  it('today is much smaller than yesterday → very negative result', () => {
    // (1 - 1000) / 1000 * 100 = -99.9
    expect(computeDodChange(1, 1000)).toBeCloseTo(-99.9, 1)
  })

  it('yesterday is 0.001 — avoids null (not exactly 0)', () => {
    const result = computeDodChange(1, 0.001)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(99900)
  })

  it('result sign matches direction of change', () => {
    expect(computeDodChange(200, 100)!).toBeGreaterThan(0)  // increase
    expect(computeDodChange(50,  100)!).toBeLessThan(0)     // decrease
  })

  it('negative today with positive yesterday gives negative result', () => {
    // (-100 - 200) / 200 * 100 = -150
    expect(computeDodChange(-100, 200)).toBeCloseTo(-150)
  })
})

// ── computeWowChange — additional precision and edge cases ────────────────────

describe('computeWowChange — additional precision and edge cases', () => {
  it('tripling revenue week over week = +200%', () => {
    expect(computeWowChange(3000, 1000)).toBeCloseTo(200)
  })

  it('75% drop week over week = -75%', () => {
    expect(computeWowChange(250, 1000)).toBeCloseTo(-75)
  })

  it('very small lastWeek = 0.01 avoids null guard', () => {
    const result = computeWowChange(1, 0.01)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(9900)
  })

  it('both negative values: today=-100, yesterday=-50 → +100% (increase in magnitude)', () => {
    // (-100 - (-50)) / |-50| * 100 = -50/50*100 = -100
    // Actually: (thisWeek - lastWeek) / lastWeek * 100 = (-100 - (-50)) / (-50) * 100 = -50/-50*100 = 100
    expect(computeWowChange(-100, -50)).toBeCloseTo(100)
  })

  it('result is symmetric with computeDodChange for same inputs', () => {
    const dod = computeDodChange(1200, 1000)
    const wow = computeWowChange(1200, 1000)
    expect(dod).toBeCloseTo(wow!)
  })
})

// ── classifyOpsPulse — comprehensive decision table ───────────────────────────

describe('classifyOpsPulse — comprehensive decision table', () => {
  it('critical: overdue=6, stock=4 (minimum critical thresholds)', () => {
    expect(classifyOpsPulse(50, true, 6, 4)).toBe('critical')
  })

  it('critical: overdue=100, stock=100 (maximum severity)', () => {
    expect(classifyOpsPulse(null, true, 100, 100)).toBe('critical')
  })

  it('not critical when overdue=6, stock=3 (stock threshold not met)', () => {
    expect(classifyOpsPulse(null, true, 6, 3)).not.toBe('critical')
  })

  it('not critical when overdue=5, stock=4 (overdue threshold not met)', () => {
    expect(classifyOpsPulse(null, true, 5, 4)).not.toBe('critical')
  })

  it('slow: sales DoD = -50% → very slow', () => {
    expect(classifyOpsPulse(-50, true, 0, 0)).toBe('slow')
  })

  it('slow: no sales today and DoD is null', () => {
    expect(classifyOpsPulse(null, false, 0, 0)).toBe('slow')
  })

  it('slow: no sales even with positive DoD', () => {
    // hasSalesToday=false: triggers slow before strong check
    expect(classifyOpsPulse(100, false, 0, 0)).toBe('slow')
  })

  it('strong: DoD=+1% and no stock critical items', () => {
    expect(classifyOpsPulse(1, true, 0, 0)).toBe('strong')
  })

  it('strong: DoD=+1000% and no stock (extreme growth)', () => {
    expect(classifyOpsPulse(1000, true, 0, 0)).toBe('strong')
  })

  it('normal: DoD=+10% but stock_critical=1 prevents strong', () => {
    expect(classifyOpsPulse(10, true, 0, 1)).toBe('normal')
  })

  it('normal: DoD=-19% (not quite slow) with sales', () => {
    expect(classifyOpsPulse(-19, true, 0, 0)).toBe('normal')
  })

  it('normal: DoD=0, has sales, no issues', () => {
    expect(classifyOpsPulse(0, true, 0, 0)).toBe('normal')
  })

  it('normal: DoD=null but has sales and no critical issues', () => {
    expect(classifyOpsPulse(null, true, 1, 1)).toBe('normal')
  })

  it('all 4 possible return values are correct strings', () => {
    const validValues = ['strong', 'normal', 'slow', 'critical'] as const
    const results = [
      classifyOpsPulse(10, true, 0, 0),
      classifyOpsPulse(-5, true, 0, 0),
      classifyOpsPulse(-50, true, 0, 0),
      classifyOpsPulse(null, false, 10, 10),
    ]
    for (const r of results) {
      expect(validValues).toContain(r)
    }
  })
})

// ── computeFillRate — additional precision cases ──────────────────────────────

describe('computeFillRate — additional precision cases', () => {
  it('3 of 7 = 42.857...%', () => {
    expect(computeFillRate(3, 7)).toBeCloseTo(42.86, 1)
  })

  it('returns 0 when ordersTotal is 0 regardless of fulfilled', () => {
    expect(computeFillRate(100, 0)).toBe(0)
    expect(computeFillRate(0,   0)).toBe(0)
  })

  it('fill rate increases monotonically as fulfilled increases', () => {
    const r5  = computeFillRate(5,  10)
    const r7  = computeFillRate(7,  10)
    const r10 = computeFillRate(10, 10)
    expect(r10).toBeGreaterThan(r7)
    expect(r7).toBeGreaterThan(r5)
  })

  it('negative fulfilled (returns/corrections) gives negative fill rate', () => {
    // Edge: returns reduce fulfilled count
    expect(computeFillRate(-1, 10)).toBeCloseTo(-10)
  })

  it('very large counts still work', () => {
    expect(computeFillRate(1_000_000, 1_000_000)).toBeCloseTo(100)
    expect(computeFillRate(950_000,   1_000_000)).toBeCloseTo(95)
  })
})

// ── computeDailyCollectionRate — additional precision cases ───────────────────

describe('computeDailyCollectionRate — additional precision cases', () => {
  it('1/3 collection rate ≈ 33.33%', () => {
    expect(computeDailyCollectionRate(1000, 3000)).toBeCloseTo(33.33, 1)
  })

  it('due is 0 with collected = 0 → null', () => {
    expect(computeDailyCollectionRate(0, 0)).toBeNull()
  })

  it('due is positive and collected=0 → 0% (not null)', () => {
    const result = computeDailyCollectionRate(0, 5000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0)
  })

  it('collection rate > 100% for over-collection (advance payments)', () => {
    expect(computeDailyCollectionRate(15000, 10000)).toBeCloseTo(150)
  })

  it('negative collected amount → negative rate', () => {
    // Refund scenario
    expect(computeDailyCollectionRate(-1000, 10000)).toBeCloseTo(-10)
  })

  it('result scales linearly with collected amount', () => {
    const half = computeDailyCollectionRate(5000, 10000)!
    const full = computeDailyCollectionRate(10000, 10000)!
    expect(full).toBeCloseTo(half * 2, 1)
  })

  it('1 TRY due, 1 TRY collected → 100%', () => {
    expect(computeDailyCollectionRate(1, 1)).toBeCloseTo(100)
  })
})
