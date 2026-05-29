// tests/working-capital-optimizer.test.ts
// Unit tests for lib/services/finance/working-capital-optimizer.service.ts

import { describe, it, expect } from 'vitest'
import {
  computeDsoImpact,
  computeDpoImpact,
  computeDioImpact,
  computeCccImprovementPotential,
  classifyOptimizationPriority,
} from '@/lib/services/finance/working-capital-optimizer.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeDsoImpact
// cash_impact = (annual_revenue / 365) × days_reduction
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDsoImpact', () => {
  it('normal case: 365K revenue × 10 days = 10,000 TRY', () => {
    const result = computeDsoImpact(365_000, 10)
    expect(result).toBe(10_000)
  })

  it('normal case: 1,000,000 TRY revenue × 30 days', () => {
    const result = computeDsoImpact(1_000_000, 30)
    // 1_000_000 / 365 × 30 ≈ 82,192
    expect(result).toBeGreaterThan(82_000)
    expect(result).toBeLessThan(83_000)
  })

  it('zero revenue returns 0', () => {
    expect(computeDsoImpact(0, 10)).toBe(0)
  })

  it('zero days reduction returns 0', () => {
    expect(computeDsoImpact(1_000_000, 0)).toBe(0)
  })

  it('negative revenue returns 0', () => {
    expect(computeDsoImpact(-500_000, 10)).toBe(0)
  })

  it('negative days returns 0', () => {
    expect(computeDsoImpact(500_000, -5)).toBe(0)
  })

  it('730K revenue × 1 day ≈ 2,000 TRY', () => {
    const result = computeDsoImpact(730_000, 1)
    expect(result).toBe(2_000)
  })

  it('result is always a non-negative integer (Math.round applied)', () => {
    const result = computeDsoImpact(100_001, 7)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('large revenue 10M × 15 days yields expected range', () => {
    const result = computeDsoImpact(10_000_000, 15)
    // 10_000_000 / 365 × 15 ≈ 410,959
    expect(result).toBeGreaterThan(410_000)
    expect(result).toBeLessThan(412_000)
  })

  it('both negative → returns 0', () => {
    expect(computeDsoImpact(-1_000, -5)).toBe(0)
  })

  it('365K revenue × 365 days = 365,000 (full year)', () => {
    const result = computeDsoImpact(365_000, 365)
    expect(result).toBe(365_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDpoImpact
// cash_impact = (annual_purchases / 365) × days_extension
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDpoImpact', () => {
  it('normal case: 365K purchases × 15 days = 15,000 TRY', () => {
    const result = computeDpoImpact(365_000, 15)
    expect(result).toBe(15_000)
  })

  it('normal case: 730K purchases × 10 days = 20,000 TRY', () => {
    const result = computeDpoImpact(730_000, 10)
    expect(result).toBe(20_000)
  })

  it('zero purchases returns 0', () => {
    expect(computeDpoImpact(0, 20)).toBe(0)
  })

  it('zero days extension returns 0', () => {
    expect(computeDpoImpact(1_000_000, 0)).toBe(0)
  })

  it('negative purchases returns 0', () => {
    expect(computeDpoImpact(-100_000, 10)).toBe(0)
  })

  it('negative days extension returns 0', () => {
    expect(computeDpoImpact(500_000, -10)).toBe(0)
  })

  it('result is always a non-negative integer', () => {
    const result = computeDpoImpact(999_999, 30)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('large purchases 5M × 45 days yields expected range', () => {
    const result = computeDpoImpact(5_000_000, 45)
    // 5_000_000 / 365 × 45 ≈ 616,438
    expect(result).toBeGreaterThan(615_000)
    expect(result).toBeLessThan(618_000)
  })

  it('both negative → returns 0', () => {
    expect(computeDpoImpact(-500, -5)).toBe(0)
  })

  it('365K purchases × 30 days = 30,000 TRY', () => {
    expect(computeDpoImpact(365_000, 30)).toBe(30_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDioImpact
// cash_impact = (annual_cogs / 365) × days_reduction
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDioImpact', () => {
  it('normal case: 365K COGS × 5 days = 5,000 TRY', () => {
    const result = computeDioImpact(365_000, 5)
    expect(result).toBe(5_000)
  })

  it('normal case: 2M COGS × 60 days', () => {
    const result = computeDioImpact(2_000_000, 60)
    // 2_000_000 / 365 × 60 ≈ 328,767
    expect(result).toBeGreaterThan(328_000)
    expect(result).toBeLessThan(329_000)
  })

  it('zero COGS returns 0', () => {
    expect(computeDioImpact(0, 30)).toBe(0)
  })

  it('zero days returns 0', () => {
    expect(computeDioImpact(500_000, 0)).toBe(0)
  })

  it('negative COGS returns 0', () => {
    expect(computeDioImpact(-200_000, 10)).toBe(0)
  })

  it('negative days returns 0', () => {
    expect(computeDioImpact(200_000, -10)).toBe(0)
  })

  it('result is always a non-negative integer', () => {
    const result = computeDioImpact(1_234_567, 14)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('365K COGS × 365 days = 365,000 (full year)', () => {
    expect(computeDioImpact(365_000, 365)).toBe(365_000)
  })

  it('large COGS 8M × 90 days yields expected range', () => {
    const result = computeDioImpact(8_000_000, 90)
    // 8_000_000 / 365 × 90 ≈ 1,972,602
    expect(result).toBeGreaterThan(1_970_000)
    expect(result).toBeLessThan(1_975_000)
  })

  it('both negative → returns 0', () => {
    expect(computeDioImpact(-1_000, -5)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCccImprovementPotential
// sum of DSO + DPO + DIO impacts
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCccImprovementPotential', () => {
  it('sums all three components correctly', () => {
    const result = computeCccImprovementPotential(10_000, 20_000, 30_000)
    expect(result).toBe(60_000)
  })

  it('handles all zeros', () => {
    expect(computeCccImprovementPotential(0, 0, 0)).toBe(0)
  })

  it('handles single non-zero component', () => {
    expect(computeCccImprovementPotential(50_000, 0, 0)).toBe(50_000)
    expect(computeCccImprovementPotential(0, 75_000, 0)).toBe(75_000)
    expect(computeCccImprovementPotential(0, 0, 100_000)).toBe(100_000)
  })

  it('handles large values', () => {
    const result = computeCccImprovementPotential(500_000, 300_000, 200_000)
    expect(result).toBe(1_000_000)
  })

  it('sum is associative — order does not matter', () => {
    const a = computeCccImprovementPotential(10_000, 20_000, 30_000)
    const b = computeCccImprovementPotential(30_000, 10_000, 20_000)
    expect(a).toBe(b)
  })

  it('result is always a number', () => {
    const result = computeCccImprovementPotential(1, 2, 3)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })

  it('very large values do not overflow', () => {
    const result = computeCccImprovementPotential(1_000_000_000, 1_000_000_000, 1_000_000_000)
    expect(result).toBe(3_000_000_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyOptimizationPriority
// high:   cash_impact > 100K AND days_change > 10
// medium: cash_impact > 20K OR  days_change > 5
// low:    otherwise
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyOptimizationPriority', () => {
  it('returns high when both conditions met (>100K AND >10 days)', () => {
    expect(classifyOptimizationPriority(150_000, 15)).toBe('high')
    expect(classifyOptimizationPriority(200_000, 20)).toBe('high')
  })

  it('returns medium (not high) when only cash impact > 100K but days <= 10', () => {
    expect(classifyOptimizationPriority(150_000, 10)).toBe('medium')
    expect(classifyOptimizationPriority(200_000, 5)).toBe('medium')
  })

  it('returns medium (not high) when only days > 10 but cash <= 100K', () => {
    expect(classifyOptimizationPriority(50_000, 15)).toBe('medium')
    expect(classifyOptimizationPriority(100_000, 11)).toBe('medium')
  })

  it('returns medium when cash > 20K (regardless of days)', () => {
    expect(classifyOptimizationPriority(25_000, 3)).toBe('medium')
    expect(classifyOptimizationPriority(50_000, 0)).toBe('medium')
  })

  it('returns medium when days > 5 (regardless of cash)', () => {
    expect(classifyOptimizationPriority(5_000, 6)).toBe('medium')
    expect(classifyOptimizationPriority(0, 10)).toBe('medium')
  })

  it('returns low when both conditions below threshold', () => {
    expect(classifyOptimizationPriority(20_000, 5)).toBe('low')
    expect(classifyOptimizationPriority(0, 0)).toBe('low')
    expect(classifyOptimizationPriority(10_000, 3)).toBe('low')
  })

  it('boundary: exactly 100K cash AND exactly 10 days → medium (not high, requires BOTH strictly >)', () => {
    // high requires > 100K AND > 10 — at exactly 100K or 10 days, it is medium
    expect(classifyOptimizationPriority(100_000, 10)).toBe('medium')
  })

  it('boundary: exactly 20K cash → low (not medium, requires > 20K)', () => {
    expect(classifyOptimizationPriority(20_000, 3)).toBe('low')
  })

  it('boundary: exactly 5 days → low (not medium, requires > 5)', () => {
    expect(classifyOptimizationPriority(10_000, 5)).toBe('low')
  })

  it('boundary: 20,001 TRY cash → medium', () => {
    expect(classifyOptimizationPriority(20_001, 0)).toBe('medium')
  })

  it('boundary: 6 days → medium', () => {
    expect(classifyOptimizationPriority(0, 6)).toBe('medium')
  })

  it('boundary: 100,001 cash AND 11 days → high', () => {
    expect(classifyOptimizationPriority(100_001, 11)).toBe('high')
  })

  it('returns one of high | medium | low (type check)', () => {
    const validValues = ['high', 'medium', 'low']
    const cases = [
      [0, 0], [5_000, 3], [25_000, 6], [150_000, 15],
    ]
    for (const [cash, days] of cases) {
      const result = classifyOptimizationPriority(cash, days)
      expect(validValues).toContain(result)
    }
  })

  it('medium: cash=0 and days=6 qualifies via days-only condition', () => {
    expect(classifyOptimizationPriority(0, 6)).toBe('medium')
  })

  it('low: cash=19_999, days=5 → below both medium thresholds', () => {
    expect(classifyOptimizationPriority(19_999, 5)).toBe('low')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDsoImpact — additional formula precision tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDsoImpact — additional formula precision', () => {
  it('1M revenue × 1 day ≈ 2740 TRY', () => {
    // 1_000_000 / 365 × 1 ≈ 2739.726
    const result = computeDsoImpact(1_000_000, 1)
    expect(result).toBe(2740)
  })

  it('365_000 revenue × 30 days = 30_000 TRY', () => {
    expect(computeDsoImpact(365_000, 30)).toBe(30_000)
  })

  it('zero revenue with positive days → 0', () => {
    expect(computeDsoImpact(0, 100)).toBe(0)
  })

  it('positive revenue with zero days → 0', () => {
    expect(computeDsoImpact(500_000, 0)).toBe(0)
  })

  it('negative revenue → 0', () => {
    expect(computeDsoImpact(-100_000, 5)).toBe(0)
  })

  it('negative days → 0', () => {
    expect(computeDsoImpact(100_000, -1)).toBe(0)
  })

  it('result is always an integer (Math.round)', () => {
    const result = computeDsoImpact(777_777, 13)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('result is always non-negative', () => {
    expect(computeDsoImpact(999_999, 99)).toBeGreaterThanOrEqual(0)
  })

  it('2M revenue × 5 days: expected range ~27_397', () => {
    const result = computeDsoImpact(2_000_000, 5)
    expect(result).toBeGreaterThan(27_000)
    expect(result).toBeLessThan(28_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDpoImpact — additional formula precision tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDpoImpact — additional formula precision', () => {
  it('1M purchases × 1 day ≈ 2740 TRY', () => {
    const result = computeDpoImpact(1_000_000, 1)
    expect(result).toBe(2740)
  })

  it('365_000 purchases × 45 days = 45_000 TRY', () => {
    expect(computeDpoImpact(365_000, 45)).toBe(45_000)
  })

  it('zero purchases → 0', () => {
    expect(computeDpoImpact(0, 30)).toBe(0)
  })

  it('zero days → 0', () => {
    expect(computeDpoImpact(1_000_000, 0)).toBe(0)
  })

  it('negative purchases → 0', () => {
    expect(computeDpoImpact(-200_000, 10)).toBe(0)
  })

  it('negative days → 0', () => {
    expect(computeDpoImpact(200_000, -5)).toBe(0)
  })

  it('result is integer (Math.round)', () => {
    const result = computeDpoImpact(333_333, 17)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('result is non-negative', () => {
    expect(computeDpoImpact(100_000, 20)).toBeGreaterThanOrEqual(0)
  })

  it('3M purchases × 60 days: expected range ~493K', () => {
    const result = computeDpoImpact(3_000_000, 60)
    expect(result).toBeGreaterThan(490_000)
    expect(result).toBeLessThan(495_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDioImpact — additional formula precision tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDioImpact — additional formula precision', () => {
  it('365_000 COGS × 1 day = 1000 TRY', () => {
    expect(computeDioImpact(365_000, 1)).toBe(1_000)
  })

  it('730_000 COGS × 30 days = 60_000 TRY', () => {
    expect(computeDioImpact(730_000, 30)).toBe(60_000)
  })

  it('zero COGS → 0', () => {
    expect(computeDioImpact(0, 10)).toBe(0)
  })

  it('zero days → 0', () => {
    expect(computeDioImpact(500_000, 0)).toBe(0)
  })

  it('negative COGS → 0', () => {
    expect(computeDioImpact(-300_000, 10)).toBe(0)
  })

  it('negative days → 0', () => {
    expect(computeDioImpact(300_000, -10)).toBe(0)
  })

  it('result is integer', () => {
    const result = computeDioImpact(555_555, 21)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('result is non-negative', () => {
    expect(computeDioImpact(100_000, 5)).toBeGreaterThanOrEqual(0)
  })

  it('4M COGS × 90 days: expected ~986K', () => {
    const result = computeDioImpact(4_000_000, 90)
    expect(result).toBeGreaterThan(984_000)
    expect(result).toBeLessThan(988_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCccImprovementPotential — combined improvement scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCccImprovementPotential — combined scenarios', () => {
  it('all three equal components sum correctly', () => {
    expect(computeCccImprovementPotential(50_000, 50_000, 50_000)).toBe(150_000)
  })

  it('two components with one zero', () => {
    expect(computeCccImprovementPotential(25_000, 0, 75_000)).toBe(100_000)
  })

  it('all zero → 0', () => {
    expect(computeCccImprovementPotential(0, 0, 0)).toBe(0)
  })

  it('single large dso with zeros for others', () => {
    expect(computeCccImprovementPotential(500_000, 0, 0)).toBe(500_000)
  })

  it('three realistic values: 82K + 41K + 55K = 178K', () => {
    expect(computeCccImprovementPotential(82_000, 41_000, 55_000)).toBe(178_000)
  })

  it('handles undefined-like zero inputs', () => {
    // The service uses (x || 0) so passing 0 explicitly is fine
    expect(computeCccImprovementPotential(0, 0, 0)).toBe(0)
  })

  it('result is numeric and not NaN', () => {
    const result = computeCccImprovementPotential(10_000, 20_000, 30_000)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })

  it('order of arguments matters for readability, not result (commutative)', () => {
    const a = computeCccImprovementPotential(10_000, 20_000, 30_000)
    const b = computeCccImprovementPotential(30_000, 20_000, 10_000)
    expect(a).toBe(b)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyOptimizationPriority — boundary sweep
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyOptimizationPriority — comprehensive boundary sweep', () => {
  it('cash=100_001, days=11 → high', () => {
    expect(classifyOptimizationPriority(100_001, 11)).toBe('high')
  })

  it('cash=100_000, days=11 → medium (cash not strictly > 100K)', () => {
    expect(classifyOptimizationPriority(100_000, 11)).toBe('medium')
  })

  it('cash=100_001, days=10 → medium (days not strictly > 10)', () => {
    expect(classifyOptimizationPriority(100_001, 10)).toBe('medium')
  })

  it('cash=100_001, days=9 → medium (days below threshold)', () => {
    expect(classifyOptimizationPriority(100_001, 9)).toBe('medium')
  })

  it('cash=20_001, days=0 → medium (cash just above 20K)', () => {
    expect(classifyOptimizationPriority(20_001, 0)).toBe('medium')
  })

  it('cash=20_000, days=0 → low (cash exactly 20K, not above)', () => {
    expect(classifyOptimizationPriority(20_000, 0)).toBe('low')
  })

  it('cash=0, days=6 → medium (days just above 5)', () => {
    expect(classifyOptimizationPriority(0, 6)).toBe('medium')
  })

  it('cash=0, days=5 → low (days exactly 5, not above)', () => {
    expect(classifyOptimizationPriority(0, 5)).toBe('low')
  })

  it('cash=19_999, days=4 → low', () => {
    expect(classifyOptimizationPriority(19_999, 4)).toBe('low')
  })

  it('cash=500_000, days=50 → high', () => {
    expect(classifyOptimizationPriority(500_000, 50)).toBe('high')
  })

  it('cash=1_000_000, days=1 → medium (days not > 10)', () => {
    expect(classifyOptimizationPriority(1_000_000, 1)).toBe('medium')
  })

  it('result is always one of the three valid strings', () => {
    const valid = ['high', 'medium', 'low']
    for (const [cash, days] of [[0,0],[20_001,0],[100_001,11],[50_000,3]]) {
      expect(valid).toContain(classifyOptimizationPriority(cash, days))
    }
  })
})
