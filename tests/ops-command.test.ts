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
})

// ── classifyOpsPulse ──────────────────────────────────────────────────────────

describe('classifyOpsPulse', () => {
  it('critical: collections_overdue > 5 AND stock_critical > 3', () => {
    expect(classifyOpsPulse(10, true, 6, 4)).toBe('critical')
  })

  it('critical: exactly collections=6 AND stock=4 (boundary)', () => {
    expect(classifyOpsPulse(null, true, 6, 4)).toBe('critical')
  })

  it('not critical when only overdue threshold exceeded (stock ok)', () => {
    // overdue > 5 but stock_critical <= 3 → not critical
    const result = classifyOpsPulse(-10, false, 6, 2)
    expect(result).not.toBe('critical')
  })

  it('not critical when only stock threshold exceeded (overdue ok)', () => {
    // stock_critical > 3 but overdue <= 5 → not critical
    const result = classifyOpsPulse(-10, false, 3, 5)
    expect(result).not.toBe('critical')
  })

  it('slow: no sales today', () => {
    expect(classifyOpsPulse(5, false, 1, 0)).toBe('slow')
  })

  it('slow: revenue DoD < -20%', () => {
    expect(classifyOpsPulse(-25, true, 1, 0)).toBe('slow')
  })

  it('slow: exactly -20% DoD is NOT slow (boundary: < -20)', () => {
    // -20 is not < -20
    expect(classifyOpsPulse(-20, true, 1, 0)).not.toBe('slow')
  })

  it('strong: all DoD positive AND no stock alerts', () => {
    expect(classifyOpsPulse(15, true, 1, 0)).toBe('strong')
  })

  it('strong: DoD = 0.1 (barely positive) AND no stock', () => {
    expect(classifyOpsPulse(0.1, true, 0, 0)).toBe('strong')
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
    // Task spec: "over 100% (allowed if returns > orders)"
    expect(computeFillRate(11, 10)).toBeCloseTo(110)
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
})
