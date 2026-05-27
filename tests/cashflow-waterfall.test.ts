/**
 * Cash Flow Waterfall Projection Service — unit tests
 *
 * Tests pure helpers:
 *   - computeNetCash               (positive, negative, zero)
 *   - computeEndingCash            (normal cases)
 *   - classifyCashPosition         (all 4 classes + edge cases)
 *   - applyScenarioMultiplier      (all 3 scenarios, multiplier verification)
 *   - findCashCrisisMonth          (never / first / last / middle / empty)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  computeNetCash,
  computeEndingCash,
  classifyCashPosition,
  applyScenarioMultiplier,
  findCashCrisisMonth,
} from '../lib/services/finance/cashflow-waterfall.service'

// ── computeNetCash ────────────────────────────────────────────────────────────

describe('computeNetCash', () => {
  it('returns positive net when inflows > outflows', () => {
    expect(computeNetCash(100_000, 60_000)).toBe(40_000)
  })

  it('returns negative net when inflows < outflows', () => {
    expect(computeNetCash(50_000, 80_000)).toBe(-30_000)
  })

  it('returns zero when inflows === outflows', () => {
    expect(computeNetCash(75_000, 75_000)).toBe(0)
  })

  it('handles zero inflows', () => {
    expect(computeNetCash(0, 20_000)).toBe(-20_000)
  })

  it('handles zero outflows', () => {
    expect(computeNetCash(30_000, 0)).toBe(30_000)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeNetCash(100.005, 0)).toBe(100.01)
  })
})

// ── computeEndingCash ─────────────────────────────────────────────────────────

describe('computeEndingCash', () => {
  it('adds positive net cash to opening', () => {
    expect(computeEndingCash(500_000, 40_000)).toBe(540_000)
  })

  it('subtracts negative net cash from opening', () => {
    expect(computeEndingCash(500_000, -30_000)).toBe(470_000)
  })

  it('returns negative when opening + net < 0', () => {
    expect(computeEndingCash(10_000, -50_000)).toBe(-40_000)
  })

  it('handles zero opening', () => {
    expect(computeEndingCash(0, 25_000)).toBe(25_000)
  })

  it('rounds to 2 decimal places', () => {
    expect(computeEndingCash(100.005, 0)).toBe(100.01)
  })
})

// ── classifyCashPosition ──────────────────────────────────────────────────────

describe('classifyCashPosition', () => {
  it('returns "negative" when ending cash is below zero', () => {
    expect(classifyCashPosition(-1, 100_000)).toBe('negative')
  })

  it('returns "negative" when ending cash is exactly negative', () => {
    expect(classifyCashPosition(-100_000, 50_000)).toBe('negative')
  })

  it('returns "tight" when 0 < ending < 1× burn', () => {
    // 50_000 ending, 100_000 burn → 0.5 months → tight
    expect(classifyCashPosition(50_000, 100_000)).toBe('tight')
  })

  it('returns "adequate" when 1× <= ending < 3× burn', () => {
    // 200_000 ending, 100_000 burn → 2 months → adequate
    expect(classifyCashPosition(200_000, 100_000)).toBe('adequate')
  })

  it('returns "adequate" at exactly 1× burn', () => {
    expect(classifyCashPosition(100_000, 100_000)).toBe('adequate')
  })

  it('returns "strong" when ending >= 3× burn', () => {
    // 300_000 ending, 100_000 burn → 3 months → strong
    expect(classifyCashPosition(300_000, 100_000)).toBe('strong')
  })

  it('returns "strong" well above 3× burn', () => {
    expect(classifyCashPosition(1_000_000, 100_000)).toBe('strong')
  })

  it('returns "strong" when avg burn is 0 and cash is positive', () => {
    expect(classifyCashPosition(100_000, 0)).toBe('strong')
  })

  it('returns "negative" when avg burn is 0 and cash is 0', () => {
    // zero cash with zero burn — ending = 0, not > 0
    expect(classifyCashPosition(0, 0)).toBe('negative')
  })

  it('returns "negative" when avg burn is 0 and cash is negative', () => {
    expect(classifyCashPosition(-1, 0)).toBe('negative')
  })
})

// ── applyScenarioMultiplier ───────────────────────────────────────────────────

describe('applyScenarioMultiplier', () => {
  const BASE_INFLOWS  = 200_000
  const BASE_OUTFLOWS = 150_000

  it('base scenario: inflows and outflows unchanged (1.0×)', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    expect(result.inflows).toBe(BASE_INFLOWS)
    expect(result.outflows).toBe(BASE_OUTFLOWS)
  })

  it('conservative scenario: inflows × 0.85', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    expect(result.inflows).toBeCloseTo(BASE_INFLOWS * 0.85, 1)
  })

  it('conservative scenario: outflows × 1.10', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    expect(result.outflows).toBeCloseTo(BASE_OUTFLOWS * 1.10, 1)
  })

  it('optimistic scenario: inflows × 1.15', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    expect(result.inflows).toBeCloseTo(BASE_INFLOWS * 1.15, 1)
  })

  it('optimistic scenario: outflows × 0.95', () => {
    const result = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    expect(result.outflows).toBeCloseTo(BASE_OUTFLOWS * 0.95, 1)
  })

  it('conservative reduces net cash vs base', () => {
    const base         = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    const conservative = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'conservative')
    const baseNet         = base.inflows - base.outflows
    const conservativeNet = conservative.inflows - conservative.outflows
    expect(conservativeNet).toBeLessThan(baseNet)
  })

  it('optimistic increases net cash vs base', () => {
    const base      = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'base')
    const optimistic = applyScenarioMultiplier(BASE_INFLOWS, BASE_OUTFLOWS, 'optimistic')
    const baseNet      = base.inflows - base.outflows
    const optimisticNet = optimistic.inflows - optimistic.outflows
    expect(optimisticNet).toBeGreaterThan(baseNet)
  })

  it('handles zero inflows and outflows', () => {
    const result = applyScenarioMultiplier(0, 0, 'conservative')
    expect(result.inflows).toBe(0)
    expect(result.outflows).toBe(0)
  })
})

// ── findCashCrisisMonth ───────────────────────────────────────────────────────

describe('findCashCrisisMonth', () => {
  it('returns null for empty array', () => {
    expect(findCashCrisisMonth([])).toBeNull()
  })

  it('returns null when cash is always positive', () => {
    expect(findCashCrisisMonth([100_000, 80_000, 90_000, 50_000])).toBeNull()
  })

  it('returns null when all values are exactly zero (not negative)', () => {
    expect(findCashCrisisMonth([0, 0, 0])).toBeNull()
  })

  it('returns 0 when first month is negative', () => {
    expect(findCashCrisisMonth([-10_000, 20_000, 30_000])).toBe(0)
  })

  it('returns last index when only last month is negative', () => {
    const arr = [100_000, 80_000, 50_000, -5_000]
    expect(findCashCrisisMonth(arr)).toBe(3)
  })

  it('returns first negative index when multiple months are negative', () => {
    const arr = [100_000, -10_000, -20_000, 50_000]
    expect(findCashCrisisMonth(arr)).toBe(1)
  })

  it('returns middle index when crisis is in the middle', () => {
    const arr = [200_000, 150_000, -5_000, 30_000, 60_000]
    expect(findCashCrisisMonth(arr)).toBe(2)
  })

  it('returns 0 for single-element array with negative value', () => {
    expect(findCashCrisisMonth([-1])).toBe(0)
  })

  it('returns null for single-element array with positive value', () => {
    expect(findCashCrisisMonth([1])).toBeNull()
  })

  it('correctly handles a 12-month array matching a typical projection', () => {
    // 10 positive months, then 2 negative
    const months = [500_000, 480_000, 460_000, 440_000, 420_000, 400_000, 380_000, 360_000, 340_000, 320_000, -10_000, -50_000]
    expect(findCashCrisisMonth(months)).toBe(10)
  })
})
