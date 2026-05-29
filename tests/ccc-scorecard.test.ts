// ─────────────────────────────────────────────────────────────────────────────
// tests/ccc-scorecard.test.ts
//
// Unit tests for all 5 pure functions in ccc-scorecard.service.ts
// ─────────────────────────────────────────────────────────────────────────────

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
  test('0 days = 100', () => {
    expect(computeDsoScore(0)).toBe(100)
  })

  test('30 days = 80', () => {
    expect(computeDsoScore(30)).toBe(80)
  })

  test('60 days = 60', () => {
    expect(computeDsoScore(60)).toBe(60)
  })

  test('90 days = 40', () => {
    expect(computeDsoScore(90)).toBe(40)
  })

  test('120 days = 20', () => {
    expect(computeDsoScore(120)).toBe(20)
  })

  test('120+ days = 20 (clamp at minimum)', () => {
    expect(computeDsoScore(150)).toBe(20)
    expect(computeDsoScore(200)).toBe(20)
  })

  test('negative days = 100 (clamp at maximum)', () => {
    expect(computeDsoScore(-5)).toBe(100)
  })

  test('interpolation: 15 days = 90 (midpoint 0→30 segment)', () => {
    // 0d→100, 30d→80 → 15d = 100 + 0.5*(80-100) = 90
    expect(computeDsoScore(15)).toBe(90)
  })

  test('interpolation: 45 days = 70 (midpoint 30→60 segment)', () => {
    // 30d→80, 60d→60 → 45d = 80 + 0.5*(60-80) = 70
    expect(computeDsoScore(45)).toBe(70)
  })

  test('interpolation: 75 days = 50 (midpoint 60→90 segment)', () => {
    // 60d→60, 90d→40 → 75d = 60 + 0.5*(40-60) = 50
    expect(computeDsoScore(75)).toBe(50)
  })

  test('interpolation: 105 days = 30 (midpoint 90→120 segment)', () => {
    // 90d→40, 120d→20 → 105d = 40 + 0.5*(20-40) = 30
    expect(computeDsoScore(105)).toBe(30)
  })
})

// ── computeDpoScore ───────────────────────────────────────────────────────────

describe('computeDpoScore', () => {
  test('0 days = 0', () => {
    expect(computeDpoScore(0)).toBe(0)
  })

  test('30 days = 40', () => {
    expect(computeDpoScore(30)).toBe(40)
  })

  test('45 days = 70', () => {
    expect(computeDpoScore(45)).toBe(70)
  })

  test('60 days = 90', () => {
    expect(computeDpoScore(60)).toBe(90)
  })

  test('90 days = 100', () => {
    expect(computeDpoScore(90)).toBe(100)
  })

  test('90+ days = 100 (clamp at maximum)', () => {
    expect(computeDpoScore(120)).toBe(100)
    expect(computeDpoScore(180)).toBe(100)
  })

  test('negative days = 0 (clamp at minimum)', () => {
    expect(computeDpoScore(-10)).toBe(0)
  })

  test('interpolation: 15 days = 20 (midpoint 0→30 segment)', () => {
    // 0d→0, 30d→40 → 15d = 0 + 0.5*(40-0) = 20
    expect(computeDpoScore(15)).toBe(20)
  })

  test('interpolation: 37.5 days ≈ midpoint 30→45 segment', () => {
    // 30d→40, 45d→70 → t=0.5 → 40 + 0.5*(70-40) = 55
    expect(computeDpoScore(37.5)).toBe(55)
  })

  test('interpolation: 52.5 days ≈ midpoint 45→60 segment', () => {
    // 45d→70, 60d→90 → t=0.5 → 70 + 0.5*(90-70) = 80
    expect(computeDpoScore(52.5)).toBe(80)
  })

  test('interpolation: 75 days ≈ midpoint 60→90 segment', () => {
    // 60d→90, 90d→100 → t=0.5 → 90 + 0.5*(100-90) = 95
    expect(computeDpoScore(75)).toBe(95)
  })
})

// ── computeDioScore ───────────────────────────────────────────────────────────

describe('computeDioScore', () => {
  test('0 days = 100 (same curve as DSO)', () => {
    expect(computeDioScore(0)).toBe(100)
  })

  test('30 days = 80', () => {
    expect(computeDioScore(30)).toBe(80)
  })

  test('60 days = 60', () => {
    expect(computeDioScore(60)).toBe(60)
  })

  test('90 days = 40', () => {
    expect(computeDioScore(90)).toBe(40)
  })

  test('120 days = 20', () => {
    expect(computeDioScore(120)).toBe(20)
  })

  test('120+ days = 20 (clamp)', () => {
    expect(computeDioScore(999)).toBe(20)
  })

  test('mirrors DSO exactly', () => {
    const testValues = [0, 15, 30, 45, 60, 75, 90, 105, 120, 150]
    for (const v of testValues) {
      expect(computeDioScore(v)).toBe(computeDsoScore(v))
    }
  })
})

// ── computeCccEfficiencyScore ─────────────────────────────────────────────────

describe('computeCccEfficiencyScore', () => {
  test('all 100 → 100', () => {
    expect(computeCccEfficiencyScore(100, 100, 100)).toBe(100)
  })

  test('all 0 → 0', () => {
    expect(computeCccEfficiencyScore(0, 0, 0)).toBe(0)
  })

  test('weighted average: 40% DSO + 30% DPO + 30% DIO', () => {
    // DSO=80, DPO=60, DIO=70 → 0.4*80 + 0.3*60 + 0.3*70 = 32 + 18 + 21 = 71
    expect(computeCccEfficiencyScore(80, 60, 70)).toBe(71)
  })

  test('all equal: score = that value', () => {
    expect(computeCccEfficiencyScore(50, 50, 50)).toBe(50)
    expect(computeCccEfficiencyScore(75, 75, 75)).toBe(75)
  })

  test('DSO-only impact: 100/0/0 → 40', () => {
    // 0.4*100 + 0.3*0 + 0.3*0 = 40
    expect(computeCccEfficiencyScore(100, 0, 0)).toBe(40)
  })

  test('DPO-only impact: 0/100/0 → 30', () => {
    // 0.4*0 + 0.3*100 + 0.3*0 = 30
    expect(computeCccEfficiencyScore(0, 100, 0)).toBe(30)
  })

  test('DIO-only impact: 0/0/100 → 30', () => {
    // 0.4*0 + 0.3*0 + 0.3*100 = 30
    expect(computeCccEfficiencyScore(0, 0, 100)).toBe(30)
  })

  test('benchmark scenario: DSO=30d→80, DPO=45d→70, DIO=30d→80 → score', () => {
    // 0.4*80 + 0.3*70 + 0.3*80 = 32 + 21 + 24 = 77
    expect(computeCccEfficiencyScore(80, 70, 80)).toBe(77)
  })
})

// ── computeCccBenchmarkDelta ──────────────────────────────────────────────────

describe('computeCccBenchmarkDelta', () => {
  test('at benchmark → delta = 0', () => {
    expect(computeCccBenchmarkDelta(CCC_BENCHMARKS.ccc)).toBe(0)
  })

  test('above benchmark → positive delta (bad)', () => {
    expect(computeCccBenchmarkDelta(30)).toBe(15)   // 30 - 15 = 15
    expect(computeCccBenchmarkDelta(45)).toBe(30)   // 45 - 15 = 30
  })

  test('below benchmark → negative delta (good)', () => {
    expect(computeCccBenchmarkDelta(0)).toBe(-15)   // 0 - 15 = -15
    expect(computeCccBenchmarkDelta(-5)).toBe(-20)  // -5 - 15 = -20
  })

  test('default benchmark = 15', () => {
    expect(computeCccBenchmarkDelta(20)).toBe(5)    // 20 - 15 = 5
  })

  test('custom benchmark parameter', () => {
    expect(computeCccBenchmarkDelta(30, 20)).toBe(10)   // 30 - 20 = 10
    expect(computeCccBenchmarkDelta(10, 20)).toBe(-10)  // 10 - 20 = -10
    expect(computeCccBenchmarkDelta(20, 20)).toBe(0)    // 20 - 20 = 0
  })

  test('large positive delta', () => {
    expect(computeCccBenchmarkDelta(100)).toBe(85)  // 100 - 15 = 85
  })

  test('large negative delta', () => {
    expect(computeCccBenchmarkDelta(-60)).toBe(-75) // -60 - 15 = -75
  })
})
