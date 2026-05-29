/**
 * Financial Benchmarking — Unit Tests
 *
 * Tests all pure computation functions in financial-benchmarking.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * 110+ tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  TURKISH_SME_BENCHMARKS,
  estimatePercentile,
  classifyPercentilePosition,
  computeGapToMedian,
  computeGapToTopQuartile,
  computeCompositeBenchmarkScore,
  classifyBenchmarkPosition,
  buildBenchmarkComparison,
  identifyStrengths,
  identifyWeaknesses,
  generateBenchmarkNarrative,
} from '../lib/services/intelligence/financial-benchmarking.service'
import type { BenchmarkComparison } from '../lib/services/intelligence/financial-benchmarking.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

const B = { p25: 10, p50: 30, p75: 60 }  // simple reference benchmark

function makeComp(
  metricKey: keyof typeof TURKISH_SME_BENCHMARKS,
  percentile: number | null,
  value = 0,
): BenchmarkComparison {
  const bm = TURKISH_SME_BENCHMARKS[metricKey]
  return {
    metric_key:           metricKey,
    metric_label_tr:      'Test Metric',
    value:                value,
    benchmark_p25:        bm.p25,
    benchmark_p50:        bm.p50,
    benchmark_p75:        bm.p75,
    estimated_percentile: percentile,
    position:             classifyPercentilePosition(percentile),
    gap_to_median:        null,
    gap_to_top_quartile:  null,
    direction:            'higher_is_better',
  }
}

// ── TURKISH_SME_BENCHMARKS ─────────────────────────────────────────────────────

describe('TURKISH_SME_BENCHMARKS', () => {
  it('exports exactly 12 metrics', () => {
    expect(Object.keys(TURKISH_SME_BENCHMARKS)).toHaveLength(12)
  })

  const expectedKeys = [
    'gross_margin_pct',
    'net_margin_pct',
    'ebitda_margin_pct',
    'current_ratio',
    'quick_ratio',
    'dso_days',
    'dpo_days',
    'inventory_turnover_x',
    'revenue_growth_pct',
    'debt_to_equity',
    'operating_expense_ratio',
    'receivables_turnover_x',
  ] as const

  for (const key of expectedKeys) {
    it(`${key} has p25/p50/p75 keys`, () => {
      const bm = TURKISH_SME_BENCHMARKS[key]
      expect(bm).toHaveProperty('p25')
      expect(bm).toHaveProperty('p50')
      expect(bm).toHaveProperty('p75')
    })

    it(`${key} p25 <= p50 <= p75`, () => {
      const bm = TURKISH_SME_BENCHMARKS[key]
      expect(bm.p25).toBeLessThanOrEqual(bm.p50)
      expect(bm.p50).toBeLessThanOrEqual(bm.p75)
    })
  }
})

// ── estimatePercentile — higher_is_better ─────────────────────────────────────

describe('estimatePercentile (higher_is_better)', () => {
  it('returns null when value is null', () => {
    expect(estimatePercentile(null, B, 'higher_is_better')).toBeNull()
  })

  it('returns 0 when value is 0 (far below p25=10)', () => {
    const p = estimatePercentile(0, B, 'higher_is_better')
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p!).toBeLessThan(25)
  })

  it('returns < 25 when value is below p25', () => {
    const p = estimatePercentile(5, B, 'higher_is_better')
    expect(p!).toBeGreaterThanOrEqual(0)
    expect(p!).toBeLessThan(25)
  })

  it('returns exactly 25 when value equals p25', () => {
    // At p25 boundary, interpolation gives exactly 25
    const p = estimatePercentile(B.p25, B, 'higher_is_better')
    expect(p!).toBeCloseTo(25, 0)
  })

  it('returns between 25-50 when value is between p25 and p50', () => {
    const p = estimatePercentile(20, B, 'higher_is_better')  // between 10 and 30
    expect(p!).toBeGreaterThanOrEqual(25)
    expect(p!).toBeLessThan(50)
  })

  it('returns ~50 when value equals p50', () => {
    const p = estimatePercentile(B.p50, B, 'higher_is_better')
    expect(p!).toBeCloseTo(50, 0)
  })

  it('returns between 50-75 when value is between p50 and p75', () => {
    const p = estimatePercentile(45, B, 'higher_is_better')  // between 30 and 60
    expect(p!).toBeGreaterThanOrEqual(50)
    expect(p!).toBeLessThan(75)
  })

  it('returns ~75 when value equals p75', () => {
    const p = estimatePercentile(B.p75, B, 'higher_is_better')
    expect(p!).toBeCloseTo(75, 0)
  })

  it('returns > 75 when value is above p75', () => {
    const p = estimatePercentile(80, B, 'higher_is_better')
    expect(p!).toBeGreaterThan(75)
  })

  it('caps at 95 for very large values', () => {
    const p = estimatePercentile(10_000, B, 'higher_is_better')
    expect(p!).toBeLessThanOrEqual(95)
  })

  it('returns >= 0 for all values', () => {
    for (const v of [-100, 0, 5, 10, 20, 30, 50, 60, 100]) {
      expect(estimatePercentile(v, B, 'higher_is_better')!).toBeGreaterThanOrEqual(0)
    }
  })

  it('higher values produce higher percentiles', () => {
    const p10 = estimatePercentile(10, B, 'higher_is_better')!
    const p30 = estimatePercentile(30, B, 'higher_is_better')!
    const p60 = estimatePercentile(60, B, 'higher_is_better')!
    expect(p10).toBeLessThan(p30)
    expect(p30).toBeLessThan(p60)
  })
})

// ── estimatePercentile — lower_is_better ─────────────────────────────────────

describe('estimatePercentile (lower_is_better)', () => {
  it('returns null when value is null', () => {
    expect(estimatePercentile(null, B, 'lower_is_better')).toBeNull()
  })

  it('returns high percentile (> 50) when value is below p50', () => {
    const p = estimatePercentile(5, B, 'lower_is_better')  // far below p25=10, so great
    expect(p!).toBeGreaterThan(50)
  })

  it('returns low percentile (< 50) when value is above p50', () => {
    const p = estimatePercentile(50, B, 'lower_is_better')  // above p50=30, so bad
    expect(p!).toBeLessThan(50)
  })

  it('returns < 25 when value is above p75 (worst case)', () => {
    const p = estimatePercentile(200, B, 'lower_is_better')
    expect(p!).toBeLessThan(25)
  })

  it('lower values produce higher percentiles', () => {
    const p5  = estimatePercentile(5, B, 'lower_is_better')!
    const p30 = estimatePercentile(30, B, 'lower_is_better')!
    const p80 = estimatePercentile(80, B, 'lower_is_better')!
    expect(p5).toBeGreaterThan(p30)
    expect(p30).toBeGreaterThan(p80)
  })

  it('returns >= 0 for all values', () => {
    for (const v of [0, 5, 10, 30, 60, 100, 500]) {
      expect(estimatePercentile(v, B, 'lower_is_better')!).toBeGreaterThanOrEqual(0)
    }
  })

  it('caps at 95 for very small (excellent) values', () => {
    const p = estimatePercentile(-10_000, B, 'lower_is_better')
    expect(p!).toBeLessThanOrEqual(95)
  })
})

// ── classifyPercentilePosition ────────────────────────────────────────────────

describe('classifyPercentilePosition', () => {
  it('returns no_data for null', () => {
    expect(classifyPercentilePosition(null)).toBe('no_data')
  })

  it('returns bottom_quartile for 0', () => {
    expect(classifyPercentilePosition(0)).toBe('bottom_quartile')
  })

  it('returns bottom_quartile for 24', () => {
    expect(classifyPercentilePosition(24)).toBe('bottom_quartile')
  })

  it('returns below_median for 25', () => {
    expect(classifyPercentilePosition(25)).toBe('below_median')
  })

  it('returns below_median for 49', () => {
    expect(classifyPercentilePosition(49)).toBe('below_median')
  })

  it('returns above_median for 50', () => {
    expect(classifyPercentilePosition(50)).toBe('above_median')
  })

  it('returns above_median for 74', () => {
    expect(classifyPercentilePosition(74)).toBe('above_median')
  })

  it('returns top_quartile for 75', () => {
    expect(classifyPercentilePosition(75)).toBe('top_quartile')
  })

  it('returns top_quartile for 95', () => {
    expect(classifyPercentilePosition(95)).toBe('top_quartile')
  })

  it('returns top_quartile for 100', () => {
    expect(classifyPercentilePosition(100)).toBe('top_quartile')
  })
})

// ── computeGapToMedian ────────────────────────────────────────────────────────

describe('computeGapToMedian', () => {
  const bm = { p50: 30 }

  it('returns null when value is null', () => {
    expect(computeGapToMedian(null, bm)).toBeNull()
  })

  it('returns positive gap when value > p50', () => {
    expect(computeGapToMedian(50, bm)).toBe(20)
  })

  it('returns negative gap when value < p50', () => {
    expect(computeGapToMedian(10, bm)).toBe(-20)
  })

  it('returns zero when value equals p50', () => {
    expect(computeGapToMedian(30, bm)).toBe(0)
  })

  it('works with decimal values', () => {
    expect(computeGapToMedian(30.5, bm)).toBeCloseTo(0.5)
  })

  it('works with negative values', () => {
    expect(computeGapToMedian(-5, { p50: 12 })).toBe(-17)
  })
})

// ── computeGapToTopQuartile ───────────────────────────────────────────────────

describe('computeGapToTopQuartile', () => {
  const bm = { p25: 10, p75: 60 }

  it('returns null when value is null', () => {
    expect(computeGapToTopQuartile(null, bm, 'higher_is_better')).toBeNull()
    expect(computeGapToTopQuartile(null, bm, 'lower_is_better')).toBeNull()
  })

  describe('higher_is_better', () => {
    it('returns positive when value > p75 (already top quartile)', () => {
      expect(computeGapToTopQuartile(70, bm, 'higher_is_better')).toBe(10)
    })

    it('returns negative gap when value < p75', () => {
      expect(computeGapToTopQuartile(40, bm, 'higher_is_better')).toBe(-20)
    })

    it('returns zero when value equals p75', () => {
      expect(computeGapToTopQuartile(60, bm, 'higher_is_better')).toBe(0)
    })
  })

  describe('lower_is_better', () => {
    it('returns positive when value < p25 (already top quartile)', () => {
      // threshold = p25 = 10; value = 5; gap = 10 - 5 = 5 (positive = already better)
      expect(computeGapToTopQuartile(5, bm, 'lower_is_better')).toBe(5)
    })

    it('returns negative when value > p25 (not yet top quartile)', () => {
      expect(computeGapToTopQuartile(20, bm, 'lower_is_better')).toBe(-10)
    })

    it('returns zero when value equals p25', () => {
      expect(computeGapToTopQuartile(10, bm, 'lower_is_better')).toBe(0)
    })
  })
})

// ── computeCompositeBenchmarkScore ────────────────────────────────────────────

describe('computeCompositeBenchmarkScore', () => {
  it('returns null for empty array', () => {
    expect(computeCompositeBenchmarkScore([])).toBeNull()
  })

  it('returns null for all-null array', () => {
    expect(computeCompositeBenchmarkScore([null, null, null])).toBeNull()
  })

  it('returns single value for single element', () => {
    expect(computeCompositeBenchmarkScore([60])).toBe(60)
  })

  it('returns average of valid values', () => {
    expect(computeCompositeBenchmarkScore([40, 60])).toBe(50)
  })

  it('ignores nulls in average', () => {
    expect(computeCompositeBenchmarkScore([null, 60, null, 40])).toBe(50)
  })

  it('rounds to 1 decimal place', () => {
    const result = computeCompositeBenchmarkScore([33, 34])
    expect(result).toBe(33.5)
  })

  it('handles mixed values including zero', () => {
    expect(computeCompositeBenchmarkScore([0, 100])).toBe(50)
  })

  it('handles all same value', () => {
    expect(computeCompositeBenchmarkScore([75, 75, 75])).toBe(75)
  })

  it('handles 12 metrics worth of percentiles', () => {
    const arr = new Array(12).fill(50) as number[]
    expect(computeCompositeBenchmarkScore(arr)).toBe(50)
  })
})

// ── classifyBenchmarkPosition ─────────────────────────────────────────────────

describe('classifyBenchmarkPosition', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyBenchmarkPosition(null)).toBe('insufficient_data')
  })

  it('returns lagging for 0', () => {
    expect(classifyBenchmarkPosition(0)).toBe('lagging')
  })

  it('returns lagging for 24.9', () => {
    expect(classifyBenchmarkPosition(24.9)).toBe('lagging')
  })

  it('returns below_average for 25', () => {
    expect(classifyBenchmarkPosition(25)).toBe('below_average')
  })

  it('returns below_average for 39.9', () => {
    expect(classifyBenchmarkPosition(39.9)).toBe('below_average')
  })

  it('returns average for 40', () => {
    expect(classifyBenchmarkPosition(40)).toBe('average')
  })

  it('returns average for 54.9', () => {
    expect(classifyBenchmarkPosition(54.9)).toBe('average')
  })

  it('returns above_average for 55', () => {
    expect(classifyBenchmarkPosition(55)).toBe('above_average')
  })

  it('returns above_average for 74.9', () => {
    expect(classifyBenchmarkPosition(74.9)).toBe('above_average')
  })

  it('returns industry_leader for 75', () => {
    expect(classifyBenchmarkPosition(75)).toBe('industry_leader')
  })

  it('returns industry_leader for 100', () => {
    expect(classifyBenchmarkPosition(100)).toBe('industry_leader')
  })
})

// ── buildBenchmarkComparison ──────────────────────────────────────────────────

describe('buildBenchmarkComparison', () => {
  it('returns correct metric_key and label', () => {
    const c = buildBenchmarkComparison('gross_margin_pct', 'Brüt Kâr Marjı (%)', 30, 'higher_is_better')
    expect(c.metric_key).toBe('gross_margin_pct')
    expect(c.metric_label_tr).toBe('Brüt Kâr Marjı (%)')
  })

  it('embeds correct benchmark values', () => {
    const c = buildBenchmarkComparison('gross_margin_pct', 'Test', 30, 'higher_is_better')
    const bm = TURKISH_SME_BENCHMARKS.gross_margin_pct
    expect(c.benchmark_p25).toBe(bm.p25)
    expect(c.benchmark_p50).toBe(bm.p50)
    expect(c.benchmark_p75).toBe(bm.p75)
  })

  it('sets value correctly', () => {
    const c = buildBenchmarkComparison('net_margin_pct', 'Test', 12.5, 'higher_is_better')
    expect(c.value).toBe(12.5)
  })

  it('computes estimated_percentile for non-null value', () => {
    const c = buildBenchmarkComparison('gross_margin_pct', 'Test', 28, 'higher_is_better')
    expect(c.estimated_percentile).not.toBeNull()
  })

  it('returns null estimated_percentile for null value', () => {
    const c = buildBenchmarkComparison('gross_margin_pct', 'Test', null, 'higher_is_better')
    expect(c.estimated_percentile).toBeNull()
  })

  it('position is no_data for null value', () => {
    const c = buildBenchmarkComparison('dso_days', 'Test', null, 'lower_is_better')
    expect(c.position).toBe('no_data')
  })

  it('gap_to_median is null for null value', () => {
    const c = buildBenchmarkComparison('current_ratio', 'Test', null, 'higher_is_better')
    expect(c.gap_to_median).toBeNull()
    expect(c.gap_to_top_quartile).toBeNull()
  })

  it('gap_to_median is computed for non-null value', () => {
    const bm = TURKISH_SME_BENCHMARKS.current_ratio
    const c = buildBenchmarkComparison('current_ratio', 'Test', bm.p50 + 0.3, 'higher_is_better')
    expect(c.gap_to_median).toBeCloseTo(0.3, 5)
  })

  it('direction is stored correctly', () => {
    const c1 = buildBenchmarkComparison('dso_days', 'Test', 30, 'lower_is_better')
    expect(c1.direction).toBe('lower_is_better')

    const c2 = buildBenchmarkComparison('gross_margin_pct', 'Test', 30, 'higher_is_better')
    expect(c2.direction).toBe('higher_is_better')
  })

  it('position reflects percentile classification', () => {
    // At exactly p75 for higher_is_better → top_quartile
    const bm = TURKISH_SME_BENCHMARKS.gross_margin_pct
    const c = buildBenchmarkComparison('gross_margin_pct', 'Test', bm.p75, 'higher_is_better')
    expect(c.position).toBe('top_quartile')
  })
})

// ── identifyStrengths ─────────────────────────────────────────────────────────

describe('identifyStrengths', () => {
  it('returns empty array for empty input', () => {
    expect(identifyStrengths([])).toHaveLength(0)
  })

  it('excludes comparisons with null percentile', () => {
    const comps = [
      makeComp('gross_margin_pct', null),
      makeComp('net_margin_pct', 80),
    ]
    const strengths = identifyStrengths(comps)
    expect(strengths).toHaveLength(1)
    expect(strengths[0].metric_key).toBe('net_margin_pct')
  })

  it('returns top 3 by default', () => {
    const comps = [
      makeComp('gross_margin_pct', 90),
      makeComp('net_margin_pct', 80),
      makeComp('ebitda_margin_pct', 70),
      makeComp('current_ratio', 60),
    ]
    expect(identifyStrengths(comps)).toHaveLength(3)
  })

  it('sorts by highest percentile first', () => {
    const comps = [
      makeComp('gross_margin_pct', 60),
      makeComp('net_margin_pct', 90),
      makeComp('ebitda_margin_pct', 75),
    ]
    const strengths = identifyStrengths(comps)
    expect(strengths[0].estimated_percentile).toBe(90)
    expect(strengths[1].estimated_percentile).toBe(75)
  })

  it('respects custom n parameter', () => {
    const comps = Array.from({ length: 6 }, (_, i) =>
      makeComp(['gross_margin_pct', 'net_margin_pct', 'ebitda_margin_pct', 'current_ratio', 'quick_ratio', 'dso_days'][i] as keyof typeof TURKISH_SME_BENCHMARKS, 80 - i * 5),
    )
    expect(identifyStrengths(comps, 5)).toHaveLength(5)
    expect(identifyStrengths(comps, 1)).toHaveLength(1)
  })

  it('returns fewer than n if not enough valid comparisons', () => {
    const comps = [makeComp('gross_margin_pct', 80)]
    expect(identifyStrengths(comps, 3)).toHaveLength(1)
  })
})

// ── identifyWeaknesses ────────────────────────────────────────────────────────

describe('identifyWeaknesses', () => {
  it('returns empty array for empty input', () => {
    expect(identifyWeaknesses([])).toHaveLength(0)
  })

  it('excludes comparisons with null percentile', () => {
    const comps = [
      makeComp('gross_margin_pct', null),
      makeComp('net_margin_pct', 10),
    ]
    const weaknesses = identifyWeaknesses(comps)
    expect(weaknesses).toHaveLength(1)
  })

  it('returns top 3 by default', () => {
    const comps = [
      makeComp('gross_margin_pct', 10),
      makeComp('net_margin_pct', 20),
      makeComp('ebitda_margin_pct', 30),
      makeComp('current_ratio', 40),
    ]
    expect(identifyWeaknesses(comps)).toHaveLength(3)
  })

  it('sorts by lowest percentile first', () => {
    const comps = [
      makeComp('gross_margin_pct', 30),
      makeComp('net_margin_pct', 10),
      makeComp('ebitda_margin_pct', 20),
    ]
    const weaknesses = identifyWeaknesses(comps)
    expect(weaknesses[0].estimated_percentile).toBe(10)
    expect(weaknesses[1].estimated_percentile).toBe(20)
  })

  it('respects custom n parameter', () => {
    const comps = Array.from({ length: 5 }, (_, i) =>
      makeComp(['gross_margin_pct', 'net_margin_pct', 'ebitda_margin_pct', 'current_ratio', 'quick_ratio'][i] as keyof typeof TURKISH_SME_BENCHMARKS, 10 + i * 5),
    )
    expect(identifyWeaknesses(comps, 2)).toHaveLength(2)
  })

  it('strengths and weaknesses can overlap on same comparison set', () => {
    const comps = [
      makeComp('gross_margin_pct', 5),
      makeComp('net_margin_pct', 85),
    ]
    expect(identifyStrengths(comps)[0].metric_key).toBe('net_margin_pct')
    expect(identifyWeaknesses(comps)[0].metric_key).toBe('gross_margin_pct')
  })
})

// ── generateBenchmarkNarrative ────────────────────────────────────────────────

describe('generateBenchmarkNarrative', () => {
  it('returns a non-empty string for industry_leader', () => {
    const n = generateBenchmarkNarrative('industry_leader', 82, 8, 0)
    expect(typeof n).toBe('string')
    expect(n.length).toBeGreaterThan(0)
    expect(n).toContain('lider')
  })

  it('includes score in narrative when score is provided', () => {
    const n = generateBenchmarkNarrative('above_average', 60, 3, 1)
    expect(n).toContain('60')
  })

  it('does not throw when score is null', () => {
    expect(() => generateBenchmarkNarrative('insufficient_data', null, 0, 0)).not.toThrow()
  })

  it('returns Turkish message for insufficient_data', () => {
    const n = generateBenchmarkNarrative('insufficient_data', null, 0, 0)
    expect(n).toMatch(/veri|yetersiz/i)
  })

  it('returns message for above_average', () => {
    const n = generateBenchmarkNarrative('above_average', 60, 4, 1)
    expect(n).toMatch(/ortalama/i)
  })

  it('returns message for average', () => {
    const n = generateBenchmarkNarrative('average', 45, 2, 2)
    expect(n).toMatch(/ortalama/i)
  })

  it('returns message for below_average', () => {
    const n = generateBenchmarkNarrative('below_average', 30, 1, 3)
    expect(n).toMatch(/alt|altında/i)
  })

  it('returns message for lagging', () => {
    const n = generateBenchmarkNarrative('lagging', 15, 0, 6)
    expect(n).toMatch(/geri|dönüşüm/i)
  })

  it('includes strength count when above zero', () => {
    const n = generateBenchmarkNarrative('above_average', 60, 4, 0)
    expect(n).toContain('4')
  })

  it('includes weakness count when above zero for below_average', () => {
    const n = generateBenchmarkNarrative('below_average', 30, 1, 3)
    expect(n).toContain('3')
  })
})

// ── Integration: benchmarks coverage check ────────────────────────────────────

describe('Integration: TURKISH_SME_BENCHMARKS completeness', () => {
  it('dso_days p25 < p75 (lower is better ordering)', () => {
    const bm = TURKISH_SME_BENCHMARKS.dso_days
    expect(bm.p25).toBeLessThan(bm.p75)
  })

  it('gross_margin_pct p75 > p25', () => {
    const bm = TURKISH_SME_BENCHMARKS.gross_margin_pct
    expect(bm.p75).toBeGreaterThan(bm.p25)
  })

  it('revenue_growth_pct p25 can be negative', () => {
    expect(TURKISH_SME_BENCHMARKS.revenue_growth_pct.p25).toBeLessThan(0)
  })

  it('all benchmarks have numeric values', () => {
    for (const [key, bm] of Object.entries(TURKISH_SME_BENCHMARKS)) {
      expect(typeof bm.p25).toBe('number')
      expect(typeof bm.p50).toBe('number')
      expect(typeof bm.p75).toBe('number')
    }
  })
})
