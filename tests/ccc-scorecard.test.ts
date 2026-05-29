// ─────────────────────────────────────────────────────────────────────────────
// tests/ccc-scorecard.test.ts
//
// Unit tests for all 5 pure functions in ccc-scorecard.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeDsoScore,
  computeDpoScore,
  computeDioScore,
  computeCccEfficiencyScore,
  computeCccBenchmarkDelta,
  CCC_BENCHMARKS,
} from '../lib/services/finance/ccc-scorecard.service'

// ── computeDsoScore ───────────────────────────────────────────────────────────

describe('computeDsoScore', () => {
  it('0 days = 100', () => {
    expect(computeDsoScore(0)).toBe(100)
  })

  it('30 days = 80', () => {
    expect(computeDsoScore(30)).toBe(80)
  })

  it('60 days = 60', () => {
    expect(computeDsoScore(60)).toBe(60)
  })

  it('90 days = 40', () => {
    expect(computeDsoScore(90)).toBe(40)
  })

  it('120 days = 20', () => {
    expect(computeDsoScore(120)).toBe(20)
  })

  it('120+ days = 20 (clamp at minimum)', () => {
    expect(computeDsoScore(150)).toBe(20)
    expect(computeDsoScore(200)).toBe(20)
  })

  it('negative days = 100 (clamp at maximum)', () => {
    expect(computeDsoScore(-5)).toBe(100)
  })

  it('interpolation: 15 days = 90 (midpoint 0→30 segment)', () => {
    // 0d→100, 30d→80 → 15d = 100 + 0.5*(80-100) = 90
    expect(computeDsoScore(15)).toBe(90)
  })

  it('interpolation: 45 days = 70 (midpoint 30→60 segment)', () => {
    // 30d→80, 60d→60 → 45d = 80 + 0.5*(60-80) = 70
    expect(computeDsoScore(45)).toBe(70)
  })

  it('interpolation: 75 days = 50 (midpoint 60→90 segment)', () => {
    // 60d→60, 90d→40 → 75d = 60 + 0.5*(40-60) = 50
    expect(computeDsoScore(75)).toBe(50)
  })

  it('interpolation: 105 days = 30 (midpoint 90→120 segment)', () => {
    // 90d→40, 120d→20 → 105d = 40 + 0.5*(20-40) = 30
    expect(computeDsoScore(105)).toBe(30)
  })

  // ── Threshold boundary tests ────────────────────────────────────────────────

  it('exactly at 30-day boundary returns 80', () => {
    expect(computeDsoScore(30)).toBe(80)
  })

  it('exactly at 60-day boundary returns 60', () => {
    expect(computeDsoScore(60)).toBe(60)
  })

  it('exactly at 90-day boundary returns 40', () => {
    expect(computeDsoScore(90)).toBe(40)
  })

  it('one day before 30 (29d) returns a score between 80 and 100', () => {
    const s = computeDsoScore(29)
    expect(s).toBeGreaterThan(80)
    expect(s).toBeLessThanOrEqual(100)
  })

  it('one day past 120 (121d) is still clamped to 20', () => {
    expect(computeDsoScore(121)).toBe(20)
  })

  // ── Large and extreme values ────────────────────────────────────────────────

  it('very large DSO (1000 days) is clamped to 20', () => {
    expect(computeDsoScore(1000)).toBe(20)
  })

  it('very negative DSO (-100 days) is clamped to 100', () => {
    expect(computeDsoScore(-100)).toBe(100)
  })

  // ── Monotonicity ────────────────────────────────────────────────────────────

  it('score is monotonically non-increasing as DSO days increase', () => {
    const points = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 200]
    for (let i = 0; i < points.length - 1; i++) {
      expect(computeDsoScore(points[i]!)).toBeGreaterThanOrEqual(computeDsoScore(points[i + 1]!))
    }
  })

  // ── Quarter-point interpolation ─────────────────────────────────────────────

  it('7.5 days = 95 (quarter-point in 0→30 segment)', () => {
    // 0d→100, 30d→80 → t=0.25 → 100 + 0.25*(80-100) = 95
    expect(computeDsoScore(7.5)).toBe(95)
  })

  it('22.5 days = 85 (three-quarter point in 0→30 segment)', () => {
    // t = 0.75 → 100 + 0.75*(80-100) = 85
    expect(computeDsoScore(22.5)).toBe(85)
  })

  // ── Rounding ────────────────────────────────────────────────────────────────

  it('fractional days round to nearest integer score', () => {
    // All returned values should be integers (Math.round used internally)
    const testDays = [1.3, 14.7, 33.1, 57.8, 88.9, 111.5]
    for (const d of testDays) {
      expect(Number.isInteger(computeDsoScore(d))).toBe(true)
    }
  })
})

// ── computeDpoScore ───────────────────────────────────────────────────────────

describe('computeDpoScore', () => {
  it('0 days = 0', () => {
    expect(computeDpoScore(0)).toBe(0)
  })

  it('30 days = 40', () => {
    expect(computeDpoScore(30)).toBe(40)
  })

  it('45 days = 70', () => {
    expect(computeDpoScore(45)).toBe(70)
  })

  it('60 days = 90', () => {
    expect(computeDpoScore(60)).toBe(90)
  })

  it('90 days = 100', () => {
    expect(computeDpoScore(90)).toBe(100)
  })

  it('90+ days = 100 (clamp at maximum)', () => {
    expect(computeDpoScore(120)).toBe(100)
    expect(computeDpoScore(180)).toBe(100)
  })

  it('negative days = 0 (clamp at minimum)', () => {
    expect(computeDpoScore(-10)).toBe(0)
  })

  it('interpolation: 15 days = 20 (midpoint 0→30 segment)', () => {
    // 0d→0, 30d→40 → 15d = 0 + 0.5*(40-0) = 20
    expect(computeDpoScore(15)).toBe(20)
  })

  it('interpolation: 37.5 days ≈ midpoint 30→45 segment', () => {
    // 30d→40, 45d→70 → t=0.5 → 40 + 0.5*(70-40) = 55
    expect(computeDpoScore(37.5)).toBe(55)
  })

  it('interpolation: 52.5 days ≈ midpoint 45→60 segment', () => {
    // 45d→70, 60d→90 → t=0.5 → 70 + 0.5*(90-70) = 80
    expect(computeDpoScore(52.5)).toBe(80)
  })

  it('interpolation: 75 days ≈ midpoint 60→90 segment', () => {
    // 60d→90, 90d→100 → t=0.5 → 90 + 0.5*(100-90) = 95
    expect(computeDpoScore(75)).toBe(95)
  })

  // ── Threshold boundary tests ────────────────────────────────────────────────

  it('exactly at 45-day boundary returns 70', () => {
    expect(computeDpoScore(45)).toBe(70)
  })

  it('one day before 30 (29d) returns a score less than 40', () => {
    const s = computeDpoScore(29)
    expect(s).toBeLessThan(40)
    expect(s).toBeGreaterThanOrEqual(0)
  })

  it('one day past 90 (91d) is still clamped to 100', () => {
    expect(computeDpoScore(91)).toBe(100)
  })

  // ── Large and extreme values ────────────────────────────────────────────────

  it('very large DPO (999 days) is clamped to 100', () => {
    expect(computeDpoScore(999)).toBe(100)
  })

  it('very negative DPO (-999 days) is clamped to 0', () => {
    expect(computeDpoScore(-999)).toBe(0)
  })

  // ── Monotonicity ────────────────────────────────────────────────────────────

  it('score is monotonically non-decreasing as DPO days increase', () => {
    const points = [0, 10, 20, 30, 37.5, 45, 52.5, 60, 75, 90, 120, 200]
    for (let i = 0; i < points.length - 1; i++) {
      expect(computeDpoScore(points[i]!)).toBeLessThanOrEqual(computeDpoScore(points[i + 1]!))
    }
  })

  // ── Quarter-point interpolation ─────────────────────────────────────────────

  it('7.5 days = 10 (quarter-point in 0→30 segment)', () => {
    // t = 0.25 → 0 + 0.25*40 = 10
    expect(computeDpoScore(7.5)).toBe(10)
  })

  it('22.5 days = 30 (three-quarter point in 0→30 segment)', () => {
    // t = 0.75 → 0 + 0.75*40 = 30
    expect(computeDpoScore(22.5)).toBe(30)
  })

  // ── Rounding ────────────────────────────────────────────────────────────────

  it('fractional days round to nearest integer score', () => {
    const testDays = [1.3, 14.7, 33.1, 47.8, 58.9, 81.5]
    for (const d of testDays) {
      expect(Number.isInteger(computeDpoScore(d))).toBe(true)
    }
  })
})

// ── computeDioScore ───────────────────────────────────────────────────────────

describe('computeDioScore', () => {
  it('0 days = 100 (same curve as DSO)', () => {
    expect(computeDioScore(0)).toBe(100)
  })

  it('30 days = 80', () => {
    expect(computeDioScore(30)).toBe(80)
  })

  it('60 days = 60', () => {
    expect(computeDioScore(60)).toBe(60)
  })

  it('90 days = 40', () => {
    expect(computeDioScore(90)).toBe(40)
  })

  it('120 days = 20', () => {
    expect(computeDioScore(120)).toBe(20)
  })

  it('120+ days = 20 (clamp)', () => {
    expect(computeDioScore(999)).toBe(20)
  })

  it('mirrors DSO exactly', () => {
    const testValues = [0, 15, 30, 45, 60, 75, 90, 105, 120, 150]
    for (const v of testValues) {
      expect(computeDioScore(v)).toBe(computeDsoScore(v))
    }
  })

  // ── Extended mirroring and edge cases ──────────────────────────────────────

  it('negative DIO mirrors negative DSO (both return 100)', () => {
    expect(computeDioScore(-1)).toBe(100)
    expect(computeDioScore(-50)).toBe(100)
  })

  it('DIO monotonically non-increasing like DSO', () => {
    const points = [0, 15, 30, 45, 60, 75, 90, 105, 120, 200]
    for (let i = 0; i < points.length - 1; i++) {
      expect(computeDioScore(points[i]!)).toBeGreaterThanOrEqual(computeDioScore(points[i + 1]!))
    }
  })

  it('DIO returns integer scores for fractional days', () => {
    const testDays = [0.5, 12.3, 31.7, 68.1, 95.9, 119.4]
    for (const d of testDays) {
      expect(Number.isInteger(computeDioScore(d))).toBe(true)
    }
  })

  it('DIO is exactly equivalent to DSO for same input — delegated implementation', () => {
    // Explicitly verify the delegation is correct for the full range
    for (let d = 0; d <= 120; d += 5) {
      expect(computeDioScore(d)).toBe(computeDsoScore(d))
    }
  })
})

// ── computeCccEfficiencyScore ─────────────────────────────────────────────────

describe('computeCccEfficiencyScore', () => {
  it('all 100 → 100', () => {
    expect(computeCccEfficiencyScore(100, 100, 100)).toBe(100)
  })

  it('all 0 → 0', () => {
    expect(computeCccEfficiencyScore(0, 0, 0)).toBe(0)
  })

  it('weighted average: 40% DSO + 30% DPO + 30% DIO', () => {
    // DSO=80, DPO=60, DIO=70 → 0.4*80 + 0.3*60 + 0.3*70 = 32 + 18 + 21 = 71
    expect(computeCccEfficiencyScore(80, 60, 70)).toBe(71)
  })

  it('all equal: score = that value', () => {
    expect(computeCccEfficiencyScore(50, 50, 50)).toBe(50)
    expect(computeCccEfficiencyScore(75, 75, 75)).toBe(75)
  })

  it('DSO-only impact: 100/0/0 → 40', () => {
    // 0.4*100 + 0.3*0 + 0.3*0 = 40
    expect(computeCccEfficiencyScore(100, 0, 0)).toBe(40)
  })

  it('DPO-only impact: 0/100/0 → 30', () => {
    // 0.4*0 + 0.3*100 + 0.3*0 = 30
    expect(computeCccEfficiencyScore(0, 100, 0)).toBe(30)
  })

  it('DIO-only impact: 0/0/100 → 30', () => {
    // 0.4*0 + 0.3*0 + 0.3*100 = 30
    expect(computeCccEfficiencyScore(0, 0, 100)).toBe(30)
  })

  it('benchmark scenario: DSO=30d→80, DPO=45d→70, DIO=30d→80 → score', () => {
    // 0.4*80 + 0.3*70 + 0.3*80 = 32 + 21 + 24 = 77
    expect(computeCccEfficiencyScore(80, 70, 80)).toBe(77)
  })

  // ── Weight verification ─────────────────────────────────────────────────────

  it('DPO and DIO have identical weight (both 30%)', () => {
    // Swap DPO and DIO values — should give the same result
    expect(computeCccEfficiencyScore(50, 80, 20)).toBe(computeCccEfficiencyScore(50, 20, 80))
  })

  it('DSO has greater weight than DPO alone and DIO alone', () => {
    // 40% > 30%
    const dsoOnly  = computeCccEfficiencyScore(100, 0, 0)  // 40
    const dpoOnly  = computeCccEfficiencyScore(0, 100, 0)  // 30
    const dioOnly  = computeCccEfficiencyScore(0, 0, 100)  // 30
    expect(dsoOnly).toBeGreaterThan(dpoOnly)
    expect(dsoOnly).toBeGreaterThan(dioOnly)
    expect(dpoOnly).toBe(dioOnly)
  })

  it('weights sum to 100%: 100/100/100 → 100', () => {
    // 0.4 + 0.3 + 0.3 = 1.0
    expect(computeCccEfficiencyScore(100, 100, 100)).toBe(100)
  })

  // ── Grade boundary scenarios ────────────────────────────────────────────────

  it('score of exactly 80 is grade-A boundary', () => {
    // Achievable with: DSO=100, DPO=100, DIO=100/3 ≈ many combos
    // Simple: DSO=50, DPO=100, DIO=100 → 0.4*50+0.3*100+0.3*100 = 20+30+30 = 80
    expect(computeCccEfficiencyScore(50, 100, 100)).toBe(80)
  })

  it('score rounds correctly near grade boundaries', () => {
    // Fractional inputs that would produce .5 boundary
    // DSO=83.33, DPO=50, DIO=50 → 0.4*83.33 + 0.3*50 + 0.3*50 = 33.33+15+15 = 63.33 → 63
    const s = computeCccEfficiencyScore(83.33, 50, 50)
    expect(Number.isInteger(s)).toBe(true)
  })

  // ── Large/extreme values ────────────────────────────────────────────────────

  it('over 100 inputs still produce mathematically correct output', () => {
    // The function does not clamp inputs — pure math
    // 0.4*200 + 0.3*200 + 0.3*200 = 80+60+60 = 200 → Math.round(200)
    expect(computeCccEfficiencyScore(200, 200, 200)).toBe(200)
  })

  it('negative component scores produce negative efficiency score', () => {
    // edge: if caller passes negative (e.g. bug in score computation)
    expect(computeCccEfficiencyScore(-100, 0, 0)).toBe(-40)
  })
})

// ── computeCccBenchmarkDelta ──────────────────────────────────────────────────

describe('computeCccBenchmarkDelta', () => {
  it('at benchmark → delta = 0', () => {
    expect(computeCccBenchmarkDelta(CCC_BENCHMARKS.ccc)).toBe(0)
  })

  it('above benchmark → positive delta (bad)', () => {
    expect(computeCccBenchmarkDelta(30)).toBe(15)   // 30 - 15 = 15
    expect(computeCccBenchmarkDelta(45)).toBe(30)   // 45 - 15 = 30
  })

  it('below benchmark → negative delta (good)', () => {
    expect(computeCccBenchmarkDelta(0)).toBe(-15)   // 0 - 15 = -15
    expect(computeCccBenchmarkDelta(-5)).toBe(-20)  // -5 - 15 = -20
  })

  it('default benchmark = 15', () => {
    expect(computeCccBenchmarkDelta(20)).toBe(5)    // 20 - 15 = 5
  })

  it('custom benchmark parameter', () => {
    expect(computeCccBenchmarkDelta(30, 20)).toBe(10)   // 30 - 20 = 10
    expect(computeCccBenchmarkDelta(10, 20)).toBe(-10)  // 10 - 20 = -10
    expect(computeCccBenchmarkDelta(20, 20)).toBe(0)    // 20 - 20 = 0
  })

  it('large positive delta', () => {
    expect(computeCccBenchmarkDelta(100)).toBe(85)  // 100 - 15 = 85
  })

  it('large negative delta', () => {
    expect(computeCccBenchmarkDelta(-60)).toBe(-75) // -60 - 15 = -75
  })

  // ── Fractional CCC values ────────────────────────────────────────────────────

  it('fractional actual CCC days (0.5 above benchmark)', () => {
    // 15.5 - 15 = 0.5 → Math.round(0.5 * 100)/100 = 0.5
    expect(computeCccBenchmarkDelta(15.5)).toBe(0.5)
  })

  it('fractional actual CCC days (decimal below benchmark)', () => {
    // 14.75 - 15 = -0.25
    expect(computeCccBenchmarkDelta(14.75)).toBe(-0.25)
  })

  // ── Custom benchmark edge cases ──────────────────────────────────────────────

  it('benchmark of 0 → delta equals actual CCC', () => {
    expect(computeCccBenchmarkDelta(25, 0)).toBe(25)
    expect(computeCccBenchmarkDelta(-10, 0)).toBe(-10)
  })

  it('negative benchmark value', () => {
    // benchmark = -5, actual = 10 → delta = 10 - (-5) = 15
    expect(computeCccBenchmarkDelta(10, -5)).toBe(15)
  })

  it('actual equals zero, default benchmark', () => {
    expect(computeCccBenchmarkDelta(0)).toBe(-15)
  })

  it('very large actual CCC produces proportional delta', () => {
    expect(computeCccBenchmarkDelta(500)).toBe(485) // 500 - 15 = 485
  })

  // ── CCC_BENCHMARKS constant correctness ─────────────────────────────────────

  it('CCC_BENCHMARKS.ccc equals DSO + DIO - DPO', () => {
    const expected = CCC_BENCHMARKS.dso + CCC_BENCHMARKS.dio - CCC_BENCHMARKS.dpo
    expect(CCC_BENCHMARKS.ccc).toBe(expected)
  })

  it('CCC_BENCHMARKS.dso = 30', () => {
    expect(CCC_BENCHMARKS.dso).toBe(30)
  })

  it('CCC_BENCHMARKS.dpo = 45', () => {
    expect(CCC_BENCHMARKS.dpo).toBe(45)
  })

  it('CCC_BENCHMARKS.dio = 30', () => {
    expect(CCC_BENCHMARKS.dio).toBe(30)
  })

  it('CCC_BENCHMARKS.ccc = 15', () => {
    expect(CCC_BENCHMARKS.ccc).toBe(15)
  })
})

// ── New: CCC_BENCHMARKS structure validation ──────────────────────────────────

describe('CCC_BENCHMARKS — structure and field validation', () => {

  it('CCC_BENCHMARKS has dso field', () => {
    expect(CCC_BENCHMARKS).toHaveProperty('dso')
  })

  it('CCC_BENCHMARKS has dpo field', () => {
    expect(CCC_BENCHMARKS).toHaveProperty('dpo')
  })

  it('CCC_BENCHMARKS has dio field', () => {
    expect(CCC_BENCHMARKS).toHaveProperty('dio')
  })

  it('CCC_BENCHMARKS has ccc field', () => {
    expect(CCC_BENCHMARKS).toHaveProperty('ccc')
  })

  it('all benchmark values are positive numbers', () => {
    expect(CCC_BENCHMARKS.dso).toBeGreaterThan(0)
    expect(CCC_BENCHMARKS.dpo).toBeGreaterThan(0)
    expect(CCC_BENCHMARKS.dio).toBeGreaterThan(0)
    expect(CCC_BENCHMARKS.ccc).toBeGreaterThan(0)
  })

})

// ── New: DSO score behavior tests ─────────────────────────────────────────────

describe('computeDsoScore — score decreases as DSO increases', () => {

  it('score at benchmark (30d) is 80', () => {
    expect(computeDsoScore(CCC_BENCHMARKS.dso)).toBe(80)
  })

  it('score strictly decreases from 0d to 30d', () => {
    expect(computeDsoScore(0)).toBeGreaterThan(computeDsoScore(15))
    expect(computeDsoScore(15)).toBeGreaterThan(computeDsoScore(29))
    expect(computeDsoScore(29)).toBeGreaterThan(computeDsoScore(30))
  })

  it('score strictly decreases from 30d to 60d', () => {
    expect(computeDsoScore(30)).toBeGreaterThan(computeDsoScore(45))
    expect(computeDsoScore(45)).toBeGreaterThan(computeDsoScore(60))
  })

  it('score at 0d (best) is greater than score at benchmark', () => {
    expect(computeDsoScore(0)).toBeGreaterThan(computeDsoScore(CCC_BENCHMARKS.dso))
  })

  it('score decreases as DSO increases beyond benchmark', () => {
    const atBenchmark = computeDsoScore(30)
    const over = computeDsoScore(60)
    expect(atBenchmark).toBeGreaterThan(over)
  })

  it('score at 120d is minimum (20)', () => {
    expect(computeDsoScore(120)).toBe(20)
    expect(computeDsoScore(200)).toBe(20)
  })

})

// ── New: DPO score behavior tests ─────────────────────────────────────────────

describe('computeDpoScore — score increases as DPO increases', () => {

  it('score at benchmark (45d) is 70', () => {
    expect(computeDpoScore(CCC_BENCHMARKS.dpo)).toBe(70)
  })

  it('score strictly increases from 0d to 45d', () => {
    expect(computeDpoScore(0)).toBeLessThan(computeDpoScore(15))
    expect(computeDpoScore(15)).toBeLessThan(computeDpoScore(30))
    expect(computeDpoScore(30)).toBeLessThan(computeDpoScore(45))
  })

  it('score at 90d+ is maximum (100)', () => {
    expect(computeDpoScore(90)).toBe(100)
    expect(computeDpoScore(200)).toBe(100)
  })

  it('score at benchmark is greater than score at 0d', () => {
    expect(computeDpoScore(CCC_BENCHMARKS.dpo)).toBeGreaterThan(computeDpoScore(0))
  })

  it('higher DPO always means equal or higher score', () => {
    expect(computeDpoScore(60)).toBeGreaterThanOrEqual(computeDpoScore(45))
    expect(computeDpoScore(45)).toBeGreaterThanOrEqual(computeDpoScore(30))
    expect(computeDpoScore(30)).toBeGreaterThanOrEqual(computeDpoScore(15))
  })

})

// ── New: computeCccEfficiencyScore — formula coverage ────────────────────────

describe('computeCccEfficiencyScore — combined formula', () => {

  it('formula: 40% DSO + 30% DPO + 30% DIO', () => {
    // Verify by computing with known inputs
    const dso = 80, dpo = 50, dio = 60
    const expected = Math.round(dso * 0.4 + dpo * 0.3 + dio * 0.3)
    expect(computeCccEfficiencyScore(dso, dpo, dio)).toBe(expected)
  })

  it('DSO score 80, DPO score 70, DIO score 80 → 77', () => {
    // 0.4*80 + 0.3*70 + 0.3*80 = 32 + 21 + 24 = 77
    expect(computeCccEfficiencyScore(80, 70, 80)).toBe(77)
  })

  it('result is an integer (Math.round applied)', () => {
    expect(Number.isInteger(computeCccEfficiencyScore(75, 65, 55))).toBe(true)
  })

  it('increasing any component score increases efficiency score', () => {
    const base = computeCccEfficiencyScore(50, 50, 50)
    const higherDso = computeCccEfficiencyScore(80, 50, 50)
    expect(higherDso).toBeGreaterThan(base)
  })

  it('DSO has largest single-component impact (40% weight)', () => {
    const dsoImpact = computeCccEfficiencyScore(100, 0, 0)  // 40
    const dpoImpact = computeCccEfficiencyScore(0, 100, 0)  // 30
    const dioImpact = computeCccEfficiencyScore(0, 0, 100)  // 30
    expect(dsoImpact).toBeGreaterThan(dpoImpact)
    expect(dsoImpact).toBeGreaterThan(dioImpact)
  })

})

// ── New: computeCccBenchmarkDelta — actual > benchmark ───────────────────────

describe('computeCccBenchmarkDelta — actual worse than benchmark', () => {

  it('actual CCC > benchmark → positive delta (worse than benchmark)', () => {
    // benchmark = 15; actual = 30 → delta = +15 (bad)
    expect(computeCccBenchmarkDelta(30)).toBeGreaterThan(0)
  })

  it('actual CCC < benchmark → negative delta (better than benchmark)', () => {
    // benchmark = 15; actual = 5 → delta = -10 (good)
    expect(computeCccBenchmarkDelta(5)).toBeLessThan(0)
  })

  it('actual CCC = benchmark → delta = 0', () => {
    expect(computeCccBenchmarkDelta(15)).toBe(0)
  })

  it('delta = actual - benchmark (positive when actual > benchmark)', () => {
    const actual = 40
    const benchmark = CCC_BENCHMARKS.ccc   // 15
    const delta = computeCccBenchmarkDelta(actual)
    expect(delta).toBe(actual - benchmark)
  })

  it('large actual (100d) vs benchmark (15d) → delta = 85', () => {
    expect(computeCccBenchmarkDelta(100)).toBe(85)
  })

  it('negative actual (very efficient: CCC < 0) → large negative delta', () => {
    expect(computeCccBenchmarkDelta(-10)).toBe(-25)  // -10 - 15 = -25
  })

  it('custom benchmark: actual > custom_benchmark → positive delta', () => {
    // actual = 50, custom benchmark = 20 → delta = 30
    expect(computeCccBenchmarkDelta(50, 20)).toBe(30)
    expect(computeCccBenchmarkDelta(50, 20)).toBeGreaterThan(0)
  })

})
