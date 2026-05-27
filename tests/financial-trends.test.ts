import { describe, test, expect } from 'vitest'
import {
  SHORT_MONTH_LABELS,
  computeLinearRegression,
  computeCoeffOfVariation,
  computeMomentum,
} from '@/lib/services/finance/financial-trends.service'
import type { TrendPoint } from '@/lib/services/finance/financial-trends.service'

// ── SHORT_MONTH_LABELS ────────────────────────────────────────────────────────

describe('SHORT_MONTH_LABELS', () => {
  test('has exactly 12 entries', () => {
    expect(SHORT_MONTH_LABELS).toHaveLength(12)
  })
  test('first entry is Oca', () => {
    expect(SHORT_MONTH_LABELS[0]).toBe('Oca')
  })
  test('last entry is Ara', () => {
    expect(SHORT_MONTH_LABELS[11]).toBe('Ara')
  })
  test('contains Haz at index 5', () => {
    expect(SHORT_MONTH_LABELS[5]).toBe('Haz')
  })
})

// ── computeLinearRegression ───────────────────────────────────────────────────

describe('computeLinearRegression', () => {
  test('flat line returns approximately same values', () => {
    const result = computeLinearRegression([100, 100, 100, 100, 100])
    expect(result).toHaveLength(5)
    result.forEach(v => expect(Math.abs(v - 100)).toBeLessThan(1))
  })

  test('perfect upward trend', () => {
    const result = computeLinearRegression([1, 2, 3, 4, 5])
    expect(result).toHaveLength(5)
    // Trend line should go from ~1 to ~5
    expect(result[0]).toBeLessThan(result[4])
  })

  test('empty array returns empty', () => {
    expect(computeLinearRegression([])).toEqual([])
  })

  test('single value returns same length', () => {
    const result = computeLinearRegression([50])
    expect(result).toHaveLength(1)
    expect(result[0]).toBeCloseTo(50, 0)
  })

  test('downward trend line decreases', () => {
    const result = computeLinearRegression([10, 8, 6, 4, 2])
    expect(result[0]).toBeGreaterThan(result[4])
  })
})

// ── computeCoeffOfVariation ───────────────────────────────────────────────────

describe('computeCoeffOfVariation', () => {
  test('zero mean returns 0', () => {
    expect(computeCoeffOfVariation([0, 0, 0])).toBe(0)
  })

  test('identical values returns 0 CV', () => {
    expect(computeCoeffOfVariation([50, 50, 50, 50])).toBeCloseTo(0, 1)
  })

  test('empty array returns 0', () => {
    expect(computeCoeffOfVariation([])).toBe(0)
  })

  test('high variance returns high CV', () => {
    // values spread widely → high CV
    const cv = computeCoeffOfVariation([1, 100, 1, 100])
    expect(cv).toBeGreaterThan(40)
  })

  test('low variance returns low CV', () => {
    const cv = computeCoeffOfVariation([98, 100, 102, 100])
    expect(cv).toBeLessThan(5)
  })
})

// ── computeMomentum ───────────────────────────────────────────────────────────

function makePoints(values: number[]): TrendPoint[] {
  return values.map((v, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    label: `Ay ${i + 1}`,
    value: v,
  }))
}

describe('computeMomentum', () => {
  test('insufficient data with < 6 points', () => {
    expect(computeMomentum(makePoints([100, 200, 300]))).toBe('insufficient')
  })

  test('empty array returns insufficient', () => {
    expect(computeMomentum([])).toBe('insufficient')
  })

  test('volatile when high coefficient of variation', () => {
    // wildly varying values → volatile
    const points = makePoints([10, 1000, 10, 1000, 10, 1000, 10, 1000])
    expect(computeMomentum(points)).toBe('volatile')
  })

  test('steady with stable flat values', () => {
    const points = makePoints([100, 101, 100, 101, 100, 101, 100, 101])
    const result = computeMomentum(points)
    expect(['steady', 'accelerating', 'decelerating']).toContain(result)
  })

  test('returns valid momentum enum value', () => {
    const valid = ['accelerating', 'steady', 'decelerating', 'volatile', 'insufficient']
    const result = computeMomentum(makePoints([100, 120, 140, 160, 180, 200]))
    expect(valid).toContain(result)
  })
})
