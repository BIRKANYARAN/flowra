// ── tests/simulation-enhanced.test.ts ────────────────────────────────────────
//
// Pure function tests for the enhanced simulation helpers:
//   distributeRevenue, SEASONAL_PRESETS, computeMonthlyDSR, classifyDSR,
//   recommendScenario, findBreakEvenMonth, findRunwayEnd
//
// NOTE: Does NOT touch or import any existing simulation tests.

import { describe, it, expect } from 'vitest'
import {
  distributeRevenue,
  SEASONAL_PRESETS,
  computeMonthlyDSR,
  classifyDSR,
  recommendScenario,
  findBreakEvenMonth,
  findRunwayEnd,
} from '../lib/services/simulation.service'

// ── distributeRevenue ─────────────────────────────────────────────────────────

describe('distributeRevenue', () => {
  it('returns exactly 12 values', () => {
    const result = distributeRevenue(120_000, Array(12).fill(1))
    expect(result).toHaveLength(12)
  })

  it('sum of distributed values equals annualRevenue (uniform)', () => {
    const annualRevenue = 1_200_000
    const result = distributeRevenue(annualRevenue, Array(12).fill(1))
    const total = result.reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(annualRevenue, 1)
  })

  it('uniform weights produce equal monthly values', () => {
    const annualRevenue = 120_000
    const result = distributeRevenue(annualRevenue, Array(12).fill(1))
    // Each should be 10_000
    result.forEach(v => expect(v).toBeCloseTo(10_000, 0))
  })

  it('normalises weights — unnormalised weights still sum correctly', () => {
    // weights don't sum to 1, should still produce correct total
    const annualRevenue = 500_000
    const weights = [2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 2]  // sums to 40
    const result = distributeRevenue(annualRevenue, weights)
    const total = result.reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(annualRevenue, 1)
  })

  it('weights proportional to input weights', () => {
    const annualRevenue = 120_000
    // Double weight on month 0 vs month 11 (which has weight 1)
    const weights = [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  // sum 13 — month0 = 2/13
    const result = distributeRevenue(annualRevenue, weights)
    // Month 0 should be roughly double month 1
    expect(result[0]).toBeCloseTo(result[1] * 2, 0)
  })

  it('throws for weights array not length 12', () => {
    expect(() => distributeRevenue(100_000, Array(11).fill(1))).toThrow()
    expect(() => distributeRevenue(100_000, Array(13).fill(1))).toThrow()
  })

  it('throws when all weights are zero', () => {
    expect(() => distributeRevenue(100_000, Array(12).fill(0))).toThrow()
  })

  it('handles zero annual revenue', () => {
    const result = distributeRevenue(0, Array(12).fill(1))
    result.forEach(v => expect(v).toBe(0))
  })

  it('sum is exact even with non-round numbers', () => {
    const annualRevenue = 999_999
    const weights = [6, 6, 8, 8, 8, 8, 8, 8, 8, 10, 11, 11]
    const result = distributeRevenue(annualRevenue, weights)
    const total = result.reduce((s, v) => s + v, 0)
    expect(total).toBeCloseTo(annualRevenue, 1)
  })
})

// ── SEASONAL_PRESETS ──────────────────────────────────────────────────────────

describe('SEASONAL_PRESETS', () => {
  const presetNames = ['uniform', 'q4_heavy', 'summer_peak', 'jan_reset'] as const

  it.each(presetNames)('%s preset has exactly 12 elements', preset => {
    expect(SEASONAL_PRESETS[preset]).toHaveLength(12)
  })

  it.each(presetNames)('%s preset — all values are positive', preset => {
    SEASONAL_PRESETS[preset].forEach(w => expect(w).toBeGreaterThan(0))
  })

  it('uniform preset has identical values', () => {
    const values = SEASONAL_PRESETS['uniform']
    expect(new Set(values).size).toBe(1)
  })

  it('q4_heavy has higher weights in last two months than first two', () => {
    const w = SEASONAL_PRESETS['q4_heavy']
    const q4avg = (w[10] + w[11]) / 2
    const q1avg = (w[0] + w[1]) / 2
    expect(q4avg).toBeGreaterThan(q1avg)
  })

  it('summer_peak has highest weight in June or July (index 5 or 6)', () => {
    const w = SEASONAL_PRESETS['summer_peak']
    const max = Math.max(...w)
    const maxIdx = w.indexOf(max)
    expect([5, 6]).toContain(maxIdx)
  })

  it('jan_reset has highest weight in January (index 0)', () => {
    const w = SEASONAL_PRESETS['jan_reset']
    const max = Math.max(...w)
    expect(w[0]).toBe(max)
  })

  it('all 4 standard presets are present', () => {
    expect(Object.keys(SEASONAL_PRESETS)).toEqual(
      expect.arrayContaining(['uniform', 'q4_heavy', 'summer_peak', 'jan_reset']),
    )
  })
})

// ── computeMonthlyDSR ─────────────────────────────────────────────────────────

describe('computeMonthlyDSR', () => {
  it('zero netIncome → uses denominator=1 → capped at 2.0 when debt service >2', () => {
    // large debt service with 0 income → should cap at 2.0
    const dsr = computeMonthlyDSR(0, 5_000_000, 5_000_000)
    expect(dsr).toBe(2.0)
  })

  it('zero netIncome with small debt service → (interest+principal)/1', () => {
    const dsr = computeMonthlyDSR(0, 0.4, 0.3)  // total=0.7, denominator=max(1,0)=1
    expect(dsr).toBeCloseTo(0.7, 4)
  })

  it('normal case: (interest + principal) / netIncome', () => {
    const dsr = computeMonthlyDSR(100_000, 20_000, 10_000)
    expect(dsr).toBeCloseTo(0.3, 4)
  })

  it('returns 0 when both interest and principal are 0', () => {
    const dsr = computeMonthlyDSR(100_000, 0, 0)
    expect(dsr).toBe(0)
  })

  it('caps at 2.0 when ratio > 2', () => {
    const dsr = computeMonthlyDSR(1, 10, 10)  // 20/1 = 20 → should cap
    expect(dsr).toBe(2.0)
  })

  it('result is never > 2.0', () => {
    const dsr = computeMonthlyDSR(-500_000, 1_000_000, 1_000_000)
    expect(dsr).toBeLessThanOrEqual(2.0)
  })

  it('typical healthy case < 0.3', () => {
    const dsr = computeMonthlyDSR(500_000, 30_000, 20_000)  // 50k/500k = 0.1
    expect(dsr).toBeCloseTo(0.1, 4)
    expect(dsr).toBeLessThan(0.3)
  })
})

// ── classifyDSR ───────────────────────────────────────────────────────────────

describe('classifyDSR', () => {
  it('0.0 is healthy', () => {
    expect(classifyDSR(0.0)).toBe('healthy')
  })

  it('0.29 is healthy', () => {
    expect(classifyDSR(0.29)).toBe('healthy')
  })

  it('0.3 is strained (boundary: healthy < 0.3)', () => {
    expect(classifyDSR(0.3)).toBe('strained')
  })

  it('0.5 is strained', () => {
    expect(classifyDSR(0.5)).toBe('strained')
  })

  it('0.69 is strained', () => {
    expect(classifyDSR(0.69)).toBe('strained')
  })

  it('0.7 is critical (boundary: strained < 0.7)', () => {
    expect(classifyDSR(0.7)).toBe('critical')
  })

  it('0.85 is critical', () => {
    expect(classifyDSR(0.85)).toBe('critical')
  })

  it('0.99 is critical', () => {
    expect(classifyDSR(0.99)).toBe('critical')
  })

  it('1.0 is insolvent (boundary: critical < 1.0)', () => {
    expect(classifyDSR(1.0)).toBe('insolvent')
  })

  it('1.5 is insolvent', () => {
    expect(classifyDSR(1.5)).toBe('insolvent')
  })

  it('2.0 is insolvent', () => {
    expect(classifyDSR(2.0)).toBe('insolvent')
  })
})

// ── recommendScenario ─────────────────────────────────────────────────────────

describe('recommendScenario', () => {
  const base = { id: 'base', net_income_total: 380_000, runway_end_month: 8, max_dsr: 0.41 }
  const optimistic = { id: 'opt', net_income_total: 520_000, runway_end_month: 14, max_dsr: 0.28 }
  const pessimistic = { id: 'pess', net_income_total: 180_000, runway_end_month: 4, max_dsr: 0.73 }
  const aggressive = { id: 'agg', net_income_total: 650_000, runway_end_month: 18, max_dsr: 0.22 }

  it('picks highest net_income with runway>6 and dsr<0.7', () => {
    const id = recommendScenario([base, optimistic, pessimistic, aggressive])
    // aggressive has highest income, runway=18>6, max_dsr=0.22<0.7 → recommended
    expect(id).toBe('agg')
  })

  it('returns the only scenario if just one', () => {
    const id = recommendScenario([base])
    expect(id).toBe('base')
  })

  it('fallback: uses highest net_income if none meets criteria', () => {
    // All scenarios have dsr >= 0.7 or runway <= 6
    const s1 = { id: 'a', net_income_total: 100, runway_end_month: 3, max_dsr: 0.8 }
    const s2 = { id: 'b', net_income_total: 200, runway_end_month: 2, max_dsr: 0.9 }
    const id = recommendScenario([s1, s2])
    expect(id).toBe('b')
  })

  it('null runway_end_month counts as no runway constraint (passes runway check)', () => {
    const s1 = { id: 'a', net_income_total: 100_000, runway_end_month: null, max_dsr: 0.2 }
    const s2 = { id: 'b', net_income_total: 50_000, runway_end_month: 12, max_dsr: 0.3 }
    const id = recommendScenario([s1, s2])
    // s1 has higher income and null runway (passes), dsr=0.2 < 0.7 → s1
    expect(id).toBe('a')
  })

  it('excludes scenario with max_dsr >= 0.7 even if highest income', () => {
    const high_dsr = { id: 'risky', net_income_total: 1_000_000, runway_end_month: 24, max_dsr: 0.75 }
    const safe     = { id: 'safe',  net_income_total: 200_000,   runway_end_month: 24, max_dsr: 0.3  }
    const id = recommendScenario([high_dsr, safe])
    expect(id).toBe('safe')
  })

  it('excludes scenario with runway_end_month <= 6', () => {
    const short_run = { id: 'short', net_income_total: 999_999, runway_end_month: 6, max_dsr: 0.2 }
    const long_run  = { id: 'long',  net_income_total: 100_000, runway_end_month: 7, max_dsr: 0.3 }
    const id = recommendScenario([short_run, long_run])
    expect(id).toBe('long')
  })

  it('throws on empty array', () => {
    expect(() => recommendScenario([])).toThrow()
  })
})

// ── findBreakEvenMonth ────────────────────────────────────────────────────────

describe('findBreakEvenMonth', () => {
  it('returns null when all values are negative', () => {
    expect(findBreakEvenMonth([-100, -200, -50])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(findBreakEvenMonth([])).toBeNull()
  })

  it('returns 0 when first month is already cumulative positive', () => {
    expect(findBreakEvenMonth([500, -100, -100])).toBe(0)
  })

  it('returns correct month index when cumulative turns positive', () => {
    // cumulative: -100, -50, +50 — breakeven at index 2
    expect(findBreakEvenMonth([-100, 50, 100])).toBe(2)
  })

  it('breakeven at month index 1', () => {
    // cumulative: -100, +100 = 0 (not positive yet), then...
    // -100, 200 → cumulative at 1 = 100 > 0 → index 1
    expect(findBreakEvenMonth([-100, 200, 50])).toBe(1)
  })

  it('never breaks even with all zeros', () => {
    expect(findBreakEvenMonth([0, 0, 0])).toBeNull()
  })

  it('breakeven at last month', () => {
    // cumulative: -300, -200, -100, +1
    expect(findBreakEvenMonth([-100, -100, -100, 301])).toBe(3)
  })

  it('exact zero cumulative is not a breakeven (must be > 0)', () => {
    // cumulative at index 1: -100 + 100 = 0 (not > 0); at index 2: 0 + 50 = 50 > 0 → index 2
    expect(findBreakEvenMonth([-100, 100, 50])).toBe(2)
    // cumulative: -100, then 0 — never > 0 → null
    expect(findBreakEvenMonth([-100, 100])).toBeNull()
  })
})

// ── findRunwayEnd ─────────────────────────────────────────────────────────────

describe('findRunwayEnd', () => {
  it('returns null when all cash values are positive', () => {
    expect(findRunwayEnd([100, 200, 300])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(findRunwayEnd([])).toBeNull()
  })

  it('returns 0 when first month makes cumulative negative', () => {
    expect(findRunwayEnd([-1, 100, 100])).toBe(0)
  })

  it('returns correct index when cumulative first dips negative', () => {
    // cumulative: 100, 200, 100 — never negative → null
    expect(findRunwayEnd([100, 100, -100])).toBeNull()
    // cumulative: 100, 50, -10 → index 2
    expect(findRunwayEnd([100, -50, -60])).toBe(2)
  })

  it('runway ends at month 1', () => {
    // cumulative: 100, then 100 + (-200) = -100 → index 1
    expect(findRunwayEnd([100, -200, 50])).toBe(1)
  })

  it('all zeros → cumulative stays at 0, never negative → null', () => {
    expect(findRunwayEnd([0, 0, 0])).toBeNull()
  })

  it('large positive then large negative', () => {
    // cumulative: 1_000_000, then 1_000_000 - 2_000_000 = -1_000_000 → index 1
    expect(findRunwayEnd([1_000_000, -2_000_000])).toBe(1)
  })
})
