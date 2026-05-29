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

  test('accelerating when recent growth clearly outpaces prior growth', () => {
    // Prior 3 months: +1/step. Recent 3 months: +20/step. Low variance to avoid volatile.
    const points = makePoints([100, 101, 102, 103, 104, 105, 106, 126, 146, 166])
    const result = computeMomentum(points)
    expect(result).toBe('accelerating')
  })

  test('decelerating when recent growth slows vs prior', () => {
    // Prior 3 months: +20/step. Recent 3 months: +1/step. Low variance overall.
    const points = makePoints([100, 120, 140, 160, 180, 200, 220, 221, 222, 223])
    const result = computeMomentum(points)
    expect(result).toBe('decelerating')
  })

  test('exactly 6 points is not insufficient', () => {
    const points = makePoints([100, 100, 100, 100, 100, 100])
    const result = computeMomentum(points)
    expect(result).not.toBe('insufficient')
  })

  test('exactly 5 points returns insufficient', () => {
    const result = computeMomentum(makePoints([100, 100, 100, 100, 100]))
    expect(result).toBe('insufficient')
  })

  test('NaN values are filtered out — if valid count < 6 returns insufficient', () => {
    const points: TrendPoint[] = [
      { month: '2026-01', label: 'Oca', value: NaN },
      { month: '2026-02', label: 'Şub', value: 100 },
      { month: '2026-03', label: 'Mar', value: 100 },
      { month: '2026-04', label: 'Nis', value: 100 },
      { month: '2026-05', label: 'May', value: 100 },
      { month: '2026-06', label: 'Haz', value: 100 },
    ]
    // Only 5 valid points after NaN is filtered → insufficient
    expect(computeMomentum(points)).toBe('insufficient')
  })

  test('12 steady-growth points returns valid enum', () => {
    const valid = ['accelerating', 'steady', 'decelerating', 'volatile', 'insufficient']
    const result = computeMomentum(makePoints([100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210]))
    expect(valid).toContain(result)
    expect(result).not.toBe('insufficient')
    expect(result).not.toBe('volatile')
  })
})

// ── computeLinearRegression — additional precision tests ─────────────────────

describe('computeLinearRegression — precision and boundary', () => {
  test('two equal values returns [v, v]', () => {
    const result = computeLinearRegression([7, 7])
    expect(result).toHaveLength(2)
    result.forEach(v => expect(v).toBeCloseTo(7, 1))
  })

  test('exact sequence 2,4,6,8 — trend midpoints are accurate', () => {
    const result = computeLinearRegression([2, 4, 6, 8])
    expect(result).toHaveLength(4)
    // Perfect linear: trend values should equal the inputs
    expect(result[0]).toBeCloseTo(2, 0)
    expect(result[3]).toBeCloseTo(8, 0)
  })

  test('all zeros returns array of zeros', () => {
    const result = computeLinearRegression([0, 0, 0, 0])
    result.forEach(v => expect(v).toBe(0))
  })

  test('values with decimals are rounded to 2dp', () => {
    const result = computeLinearRegression([1.001, 2.002, 3.003])
    result.forEach(v => {
      const dp = String(v).split('.')[1]?.length ?? 0
      expect(dp).toBeLessThanOrEqual(2)
    })
  })

  test('large values do not lose precision', () => {
    const result = computeLinearRegression([1_000_000, 2_000_000, 3_000_000])
    expect(result[0]).toBeCloseTo(1_000_000, -2)
    expect(result[2]).toBeCloseTo(3_000_000, -2)
  })

  test('negative trend values are supported', () => {
    const result = computeLinearRegression([-10, -20, -30])
    expect(result[0]).toBeGreaterThan(result[2])
    result.forEach(v => expect(v).toBeLessThanOrEqual(0))
  })
})

// ── computeCoeffOfVariation — additional tests ────────────────────────────────

describe('computeCoeffOfVariation — additional boundary cases', () => {
  test('single value returns 0 (no variance)', () => {
    expect(computeCoeffOfVariation([42])).toBe(0)
  })

  test('two equal values returns 0', () => {
    expect(computeCoeffOfVariation([100, 100])).toBe(0)
  })

  test('result is non-negative', () => {
    const cv = computeCoeffOfVariation([10, 20, 30, 40])
    expect(cv).toBeGreaterThanOrEqual(0)
  })

  test('result is a percentage (roughly 0–200 range for normal data)', () => {
    const cv = computeCoeffOfVariation([50, 100, 150])
    expect(cv).toBeGreaterThan(0)
    expect(cv).toBeLessThan(200)
  })

  test('CV above 40 threshold for volatile detection', () => {
    // CV of [1, 100] should well exceed 40
    const cv = computeCoeffOfVariation([1, 100])
    expect(cv).toBeGreaterThan(40)
  })

  test('CV below 40 for tight cluster', () => {
    const cv = computeCoeffOfVariation([99, 100, 101, 100, 99])
    expect(cv).toBeLessThan(5)
  })

  test('array with all negative values (mean < 0) does not return 0', () => {
    // mean = -50, so still computable
    const cv = computeCoeffOfVariation([-40, -50, -60])
    expect(cv).toBeGreaterThan(0)
  })
})

// ── SHORT_MONTH_LABELS — additional entries ───────────────────────────────────

describe('SHORT_MONTH_LABELS — all entries', () => {
  test('index 1 is Şub (February)', () => {
    expect(SHORT_MONTH_LABELS[1]).toBe('Şub')
  })

  test('index 2 is Mar (March)', () => {
    expect(SHORT_MONTH_LABELS[2]).toBe('Mar')
  })

  test('index 6 is Tem (July)', () => {
    expect(SHORT_MONTH_LABELS[6]).toBe('Tem')
  })

  test('index 10 is Kas (November)', () => {
    expect(SHORT_MONTH_LABELS[10]).toBe('Kas')
  })

  test('all entries are strings of length 2-4 chars', () => {
    SHORT_MONTH_LABELS.forEach(label => {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThanOrEqual(2)
      expect(label.length).toBeLessThanOrEqual(4)
    })
  })

  test('no duplicate labels', () => {
    const unique = new Set(SHORT_MONTH_LABELS)
    expect(unique.size).toBe(12)
  })
})

// ── computeLinearRegression — more regression cases ──────────────────────────

describe('computeLinearRegression — regression quality', () => {
  test('perfect linear data fits trend exactly', () => {
    // y = 5 + 3x → values [5, 8, 11, 14, 17]
    const values = [5, 8, 11, 14, 17]
    const trend  = computeLinearRegression(values)
    values.forEach((v, i) => expect(trend[i]).toBeCloseTo(v, 0))
  })

  test('trend of constant function has slope 0', () => {
    const values = [42, 42, 42, 42, 42, 42]
    const trend  = computeLinearRegression(values)
    // All trend values should equal 42
    trend.forEach(v => expect(v).toBeCloseTo(42, 1))
  })

  test('two-point upward trend', () => {
    const trend = computeLinearRegression([0, 100])
    expect(trend[0]).toBeCloseTo(0, 0)
    expect(trend[1]).toBeCloseTo(100, 0)
  })

  test('two-point downward trend', () => {
    const trend = computeLinearRegression([100, 0])
    expect(trend[0]).toBeCloseTo(100, 0)
    expect(trend[1]).toBeCloseTo(0, 0)
  })

  test('noisy data — trend endpoints bracket data range roughly', () => {
    // General upward trend with noise
    const values = [100, 90, 110, 105, 115, 120]
    const trend  = computeLinearRegression(values)
    expect(trend[trend.length - 1]).toBeGreaterThan(trend[0])
  })

  test('returns same length as input for various sizes', () => {
    for (const n of [2, 3, 5, 10, 12]) {
      const values = Array.from({ length: n }, (_, i) => i * 10)
      expect(computeLinearRegression(values)).toHaveLength(n)
    }
  })

  test('12-point monthly trend with mixed values', () => {
    const monthly = [120, 130, 125, 140, 138, 150, 145, 160, 155, 170, 165, 180]
    const trend = computeLinearRegression(monthly)
    expect(trend).toHaveLength(12)
    // Last trend value should be higher than first (upward trend)
    expect(trend[11]).toBeGreaterThan(trend[0])
  })

  test('output values are rounded to at most 2 decimal places', () => {
    const values = [1.5, 2.5, 3.5, 4.5]
    const trend  = computeLinearRegression(values)
    trend.forEach(v => {
      const decimals = (v.toString().split('.')[1] ?? '').length
      expect(decimals).toBeLessThanOrEqual(2)
    })
  })
})

// ── computeCoeffOfVariation — distribution analysis ──────────────────────────

describe('computeCoeffOfVariation — distribution analysis', () => {
  test('returns correct CV for known dataset', () => {
    // values: [10, 20, 30] → mean=20, stddev ≈ 8.16, CV ≈ 40.8
    const cv = computeCoeffOfVariation([10, 20, 30])
    expect(cv).toBeGreaterThan(35)
    expect(cv).toBeLessThan(50)
  })

  test('two values with large spread', () => {
    const cv = computeCoeffOfVariation([0, 200])
    expect(cv).toBeGreaterThan(50)
  })

  test('100 identical values → CV = 0', () => {
    const values = new Array(100).fill(7)
    expect(computeCoeffOfVariation(values)).toBe(0)
  })

  test('seasonal data with moderate variation', () => {
    // values with CV around 20-30%
    const values = [80, 100, 90, 110, 95, 105]
    const cv = computeCoeffOfVariation(values)
    expect(cv).toBeGreaterThan(5)
    expect(cv).toBeLessThan(40)
  })

  test('result is a finite number', () => {
    const cv = computeCoeffOfVariation([1, 2, 3, 4, 5])
    expect(isFinite(cv)).toBe(true)
    expect(isNaN(cv)).toBe(false)
  })
})

// ── computeMomentum — edge cases ──────────────────────────────────────────────

describe('computeMomentum — edge cases', () => {
  test('exactly 6 points of perfect growth → not insufficient', () => {
    const pts = makePoints([100, 110, 120, 130, 140, 150])
    expect(computeMomentum(pts)).not.toBe('insufficient')
  })

  test('alternating extreme values → volatile', () => {
    const pts = makePoints([1, 10000, 1, 10000, 1, 10000])
    expect(computeMomentum(pts)).toBe('volatile')
  })

  test('flat perfect line → steady or accelerating/decelerating', () => {
    const pts = makePoints([200, 200, 200, 200, 200, 200, 200, 200])
    const valid = ['steady', 'accelerating', 'decelerating']
    expect(valid).toContain(computeMomentum(pts))
  })

  test('returns string type always', () => {
    const scenarios = [
      makePoints([]),
      makePoints([1]),
      makePoints([1, 2, 3]),
      makePoints([1, 2, 3, 4, 5, 6]),
    ]
    for (const pts of scenarios) {
      expect(typeof computeMomentum(pts)).toBe('string')
    }
  })

  test('result is one of the 5 valid enum values', () => {
    const valid = ['accelerating', 'steady', 'decelerating', 'volatile', 'insufficient']
    const pts = makePoints([50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105])
    expect(valid).toContain(computeMomentum(pts))
  })

  test('explosive growth at end → accelerating', () => {
    // Prior: slow growth +1/step, then sudden jump
    const pts = makePoints([100, 101, 102, 103, 104, 105, 106, 150, 200, 260])
    const result = computeMomentum(pts)
    expect(result).toBe('accelerating')
  })

  test('sharp deceleration at end → decelerating', () => {
    // Prior: strong growth, then nearly flat
    const pts = makePoints([100, 140, 180, 220, 260, 300, 340, 341, 342, 343])
    const result = computeMomentum(pts)
    expect(result).toBe('decelerating')
  })

  test('all same value with 6+ points → not volatile', () => {
    const pts = makePoints([500, 500, 500, 500, 500, 500, 500])
    expect(computeMomentum(pts)).not.toBe('volatile')
    expect(computeMomentum(pts)).not.toBe('insufficient')
  })
})

// ── Integration: computeLinearRegression + computeMomentum ───────────────────

describe('integration — regression + momentum consistency', () => {
  test('trend line follows data direction for accelerating series', () => {
    const values = [100, 104, 110, 120, 136, 160, 196, 248, 316, 404, 520, 668]
    const trend = computeLinearRegression(values)
    // Trend should generally go upward
    expect(trend[trend.length - 1]).toBeGreaterThan(trend[0])
  })

  test('regression + momentum both valid for standard monthly revenue', () => {
    const monthly = [250_000, 260_000, 255_000, 270_000, 280_000, 275_000,
                     290_000, 295_000, 310_000, 305_000, 320_000, 330_000]
    const trend = computeLinearRegression(monthly)
    const pts   = makePoints(monthly)
    const mom   = computeMomentum(pts)

    expect(trend).toHaveLength(12)
    expect(['accelerating', 'steady', 'decelerating', 'volatile', 'insufficient']).toContain(mom)
    expect(mom).not.toBe('insufficient')
  })

  test('CV of flat regression values is 0', () => {
    const flat  = [100, 100, 100, 100, 100]
    const trend = computeLinearRegression(flat)
    const cv    = computeCoeffOfVariation(trend)
    expect(cv).toBe(0)
  })
})

// ── SHORT_MONTH_LABELS — completeness check ──────────────────────────────────

describe('SHORT_MONTH_LABELS — completeness', () => {
  test('all 12 expected Turkish abbreviations present', () => {
    const expected = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    expect(SHORT_MONTH_LABELS).toEqual(expected)
  })

  test('is a readonly-style array (does not mutate on spread)', () => {
    const copy = [...SHORT_MONTH_LABELS]
    copy.push('extra')
    expect(SHORT_MONTH_LABELS).toHaveLength(12)
  })

  test('index 3 is Nis (April)', () => {
    expect(SHORT_MONTH_LABELS[3]).toBe('Nis')
  })

  test('index 4 is May', () => {
    expect(SHORT_MONTH_LABELS[4]).toBe('May')
  })

  test('index 7 is Ağu (August)', () => {
    expect(SHORT_MONTH_LABELS[7]).toBe('Ağu')
  })

  test('index 8 is Eyl (September)', () => {
    expect(SHORT_MONTH_LABELS[8]).toBe('Eyl')
  })

  test('index 9 is Eki (October)', () => {
    expect(SHORT_MONTH_LABELS[9]).toBe('Eki')
  })
})
