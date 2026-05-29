// tests/forecast-accuracy.test.ts
// Unit tests for lib/services/planning/forecast-accuracy.service.ts pure functions

import { describe, it, expect } from 'vitest'
import {
  computeForecastError,
  computeMape,
  computeBias,
  classifyForecastAccuracy,
  classifyForecastBias,
  computeMonthlyForecastVariance,
  computeForecastImprovementTrend,
  computeHitRate,
} from '@/lib/services/planning/forecast-accuracy.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeForecastError
// ─────────────────────────────────────────────────────────────────────────────

describe('computeForecastError', () => {
  it('returns positive error when forecast > actual (overforecast)', () => {
    expect(computeForecastError(120_000, 100_000)).toBe(20_000)
  })

  it('returns negative error when forecast < actual (underforecast)', () => {
    expect(computeForecastError(80_000, 100_000)).toBe(-20_000)
  })

  it('returns zero when forecast equals actual (exact)', () => {
    expect(computeForecastError(100_000, 100_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeMape
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMape', () => {
  it('computes MAPE correctly for normal multi-month data', () => {
    // |110-100|/100 = 10%, |90-100|/100 = 10% → MAPE = 10%
    const result = computeMape([110_000, 90_000], [100_000, 100_000])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10, 2)
  })

  it('skips pairs where actual is zero to avoid division by zero', () => {
    // Skip the zero pair, only use |110-100|/100 = 10%
    const result = computeMape([110_000, 50_000], [100_000, 0])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10, 2)
  })

  it('returns null when all actuals are zero', () => {
    expect(computeMape([100, 200], [0, 0])).toBeNull()
  })

  it('computes MAPE correctly for a single valid pair', () => {
    // |115-100|/100 = 15%
    const result = computeMape([115], [100])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(15, 2)
  })

  it('returns null for empty arrays', () => {
    expect(computeMape([], [])).toBeNull()
  })

  it('returns null when arrays have different lengths', () => {
    expect(computeMape([100, 200], [100])).toBeNull()
  })

  it('handles large errors correctly (>100% MAPE)', () => {
    // |200-10|/10 = 1900%
    const result = computeMape([200], [10])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1900, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBias
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBias', () => {
  it('returns positive bias for systematic overforecasting', () => {
    // (110-100 + 120-100 + 105-100) / 3 = 11.67
    const result = computeBias([110, 120, 105], [100, 100, 100])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(11.67, 1)
  })

  it('returns negative bias for systematic underforecasting', () => {
    // (90-100 + 80-100) / 2 = -15
    const result = computeBias([90, 80], [100, 100])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-15, 2)
  })

  it('returns zero bias when forecasts equal actuals', () => {
    const result = computeBias([100, 200, 300], [100, 200, 300])
    expect(result).not.toBeNull()
    expect(result!).toBe(0)
  })

  it('returns null for empty arrays', () => {
    expect(computeBias([], [])).toBeNull()
  })

  it('returns null when arrays have different lengths', () => {
    expect(computeBias([100, 200], [100])).toBeNull()
  })

  it('returns null when first array is empty but second is not', () => {
    expect(computeBias([], [100])).toBeNull()
  })

  it('computes bias correctly for mixed over/under forecast', () => {
    // (110-100 + 90-100) / 2 = 0
    const result = computeBias([110, 90], [100, 100])
    expect(result).not.toBeNull()
    expect(result!).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyForecastAccuracy
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyForecastAccuracy', () => {
  it('returns insufficient_data for null MAPE', () => {
    expect(classifyForecastAccuracy(null)).toBe('insufficient_data')
  })

  it('returns excellent for MAPE <= 5%', () => {
    expect(classifyForecastAccuracy(0)).toBe('excellent')
    expect(classifyForecastAccuracy(3)).toBe('excellent')
    expect(classifyForecastAccuracy(5)).toBe('excellent')
  })

  it('returns good for MAPE <= 10% (and > 5%)', () => {
    expect(classifyForecastAccuracy(6)).toBe('good')
    expect(classifyForecastAccuracy(10)).toBe('good')
  })

  it('returns acceptable for MAPE <= 20% (and > 10%)', () => {
    expect(classifyForecastAccuracy(11)).toBe('acceptable')
    expect(classifyForecastAccuracy(20)).toBe('acceptable')
  })

  it('returns poor for MAPE <= 30% (and > 20%)', () => {
    expect(classifyForecastAccuracy(21)).toBe('poor')
    expect(classifyForecastAccuracy(30)).toBe('poor')
  })

  it('returns unreliable for MAPE > 30%', () => {
    expect(classifyForecastAccuracy(31)).toBe('unreliable')
    expect(classifyForecastAccuracy(100)).toBe('unreliable')
    expect(classifyForecastAccuracy(500)).toBe('unreliable')
  })

  it('boundary: exactly 5% is excellent', () => {
    expect(classifyForecastAccuracy(5)).toBe('excellent')
  })

  it('boundary: exactly 10% is good', () => {
    expect(classifyForecastAccuracy(10)).toBe('good')
  })

  it('boundary: exactly 20% is acceptable', () => {
    expect(classifyForecastAccuracy(20)).toBe('acceptable')
  })

  it('boundary: exactly 30% is poor', () => {
    expect(classifyForecastAccuracy(30)).toBe('poor')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyForecastBias
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyForecastBias', () => {
  it('returns over_forecast when normalized bias > 5%', () => {
    // bias = 10, avgActual = 100 → normalizedBias = 10% > 5%
    expect(classifyForecastBias(10, 100)).toBe('over_forecast')
  })

  it('returns under_forecast when normalized bias < -5%', () => {
    // bias = -10, avgActual = 100 → normalizedBias = -10% < -5%
    expect(classifyForecastBias(-10, 100)).toBe('under_forecast')
  })

  it('returns unbiased when normalized bias is between -5% and 5%', () => {
    // bias = 4, avgActual = 100 → normalizedBias = 4%
    expect(classifyForecastBias(4, 100)).toBe('unbiased')
    // bias = -4, avgActual = 100 → normalizedBias = -4%
    expect(classifyForecastBias(-4, 100)).toBe('unbiased')
    // bias = 0, avgActual = 100 → normalizedBias = 0%
    expect(classifyForecastBias(0, 100)).toBe('unbiased')
  })

  it('returns insufficient_data when bias is null', () => {
    expect(classifyForecastBias(null, 100)).toBe('insufficient_data')
  })

  it('returns insufficient_data when avgActual is zero', () => {
    expect(classifyForecastBias(50, 0)).toBe('insufficient_data')
  })

  it('boundary: exactly 5% normalizedBias is unbiased (not over)', () => {
    // bias = 5, avgActual = 100 → normalizedBias = 5% (not > 5%)
    expect(classifyForecastBias(5, 100)).toBe('unbiased')
  })

  it('boundary: exactly -5% normalizedBias is unbiased (not under)', () => {
    // bias = -5, avgActual = 100 → normalizedBias = -5% (not < -5%)
    expect(classifyForecastBias(-5, 100)).toBe('unbiased')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeMonthlyForecastVariance
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlyForecastVariance', () => {
  it('computes multi-month variances correctly', () => {
    const result = computeMonthlyForecastVariance([
      { month: '2025-01', forecast: 110_000, actual: 100_000 },
      { month: '2025-02', forecast: 90_000,  actual: 100_000 },
    ])

    expect(result).toHaveLength(2)

    expect(result[0].month).toBe('2025-01')
    expect(result[0].error).toBe(10_000)
    expect(result[0].error_pct).toBeCloseTo(10, 2)
    expect(result[0].is_over_forecast).toBe(true)

    expect(result[1].month).toBe('2025-02')
    expect(result[1].error).toBe(-10_000)
    expect(result[1].error_pct).toBeCloseTo(-10, 2)
    expect(result[1].is_over_forecast).toBe(false)
  })

  it('returns null error_pct when actual is zero', () => {
    const result = computeMonthlyForecastVariance([
      { month: '2025-01', forecast: 50_000, actual: 0 },
    ])
    expect(result[0].error_pct).toBeNull()
    expect(result[0].error).toBe(50_000)
    expect(result[0].is_over_forecast).toBe(true)
  })

  it('marks under_forecast correctly when actual > forecast', () => {
    const result = computeMonthlyForecastVariance([
      { month: '2025-03', forecast: 80_000, actual: 120_000 },
    ])
    expect(result[0].is_over_forecast).toBe(false)
    expect(result[0].error).toBe(-40_000)
    expect(result[0].error_pct).toBeCloseTo(-33.33, 1)
  })

  it('returns zero error for exact forecast', () => {
    const result = computeMonthlyForecastVariance([
      { month: '2025-04', forecast: 100_000, actual: 100_000 },
    ])
    expect(result[0].error).toBe(0)
    expect(result[0].error_pct).toBe(0)
    expect(result[0].is_over_forecast).toBe(false)
  })

  it('returns empty array for empty input', () => {
    expect(computeMonthlyForecastVariance([])).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeForecastImprovementTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('computeForecastImprovementTrend', () => {
  it('returns improving when second half avg absolute error < first half × 0.9', () => {
    // First half: 20%, 18%, 22%, 21% → avg ~20.25%
    // Second half: 5%, 4%, 6%, 3% → avg ~4.5% (well under 20.25 × 0.9 = 18.23%)
    const result = computeForecastImprovementTrend([
      { error_pct: 20 },
      { error_pct: 18 },
      { error_pct: 22 },
      { error_pct: 21 },
      { error_pct: 5 },
      { error_pct: 4 },
      { error_pct: 6 },
      { error_pct: 3 },
    ])
    expect(result).toBe('improving')
  })

  it('returns deteriorating when second half avg > first half avg × 1.1', () => {
    // First half: 5%, 4%, 6%, 3% → avg ~4.5%
    // Second half: 25%, 30%, 28%, 27% → avg ~27.5% (well over 4.5 × 1.1 = 4.95%)
    const result = computeForecastImprovementTrend([
      { error_pct: 5 },
      { error_pct: 4 },
      { error_pct: 6 },
      { error_pct: 3 },
      { error_pct: 25 },
      { error_pct: 30 },
      { error_pct: 28 },
      { error_pct: 27 },
    ])
    expect(result).toBe('deteriorating')
  })

  it('returns stable when second half avg is within ±10% of first half', () => {
    // Both halves around 10%
    const result = computeForecastImprovementTrend([
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
      { error_pct: 10 },
    ])
    expect(result).toBe('stable')
  })

  it('returns insufficient_data for fewer than 4 non-null months', () => {
    expect(computeForecastImprovementTrend([
      { error_pct: 10 },
      { error_pct: 5 },
      { error_pct: null },
    ])).toBe('insufficient_data')
  })

  it('returns insufficient_data for empty array', () => {
    expect(computeForecastImprovementTrend([])).toBe('insufficient_data')
  })

  it('ignores null error_pct entries in trend computation', () => {
    // 8 non-null entries, but scattered nulls
    const result = computeForecastImprovementTrend([
      { error_pct: 20 },
      { error_pct: null },
      { error_pct: 22 },
      { error_pct: null },
      { error_pct: 4 },
      { error_pct: null },
      { error_pct: 3 },
      { error_pct: null },
    ])
    // valid: [20, 22, 4, 3] → first half [20,22], second half [4,3]
    // firstAvg = 21, secondAvg = 3.5 < 21 × 0.9 → improving
    expect(result).toBe('improving')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeHitRate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeHitRate', () => {
  it('returns 100% when all months are within default 10% tolerance', () => {
    const result = computeHitRate([
      { error_pct: 5 },
      { error_pct: -3 },
      { error_pct: 9 },
      { error_pct: -10 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBe(100)
  })

  it('returns 0% when no months are within default 10% tolerance', () => {
    const result = computeHitRate([
      { error_pct: 15 },
      { error_pct: -20 },
      { error_pct: 30 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBe(0)
  })

  it('returns correct percentage for mixed hit/miss', () => {
    // 2 hits (5% and -8%), 2 misses (15% and -20%)
    const result = computeHitRate([
      { error_pct: 5 },
      { error_pct: 15 },
      { error_pct: -8 },
      { error_pct: -20 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBe(50)
  })

  it('respects custom tolerance', () => {
    // tolerance = 5%: only ±5% counts
    const result = computeHitRate([
      { error_pct: 3 },  // hit
      { error_pct: 8 },  // miss
    ], 5)
    expect(result).not.toBeNull()
    expect(result!).toBe(50)
  })

  it('returns null when all entries have null error_pct', () => {
    const result = computeHitRate([
      { error_pct: null },
      { error_pct: null },
    ])
    expect(result).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(computeHitRate([])).toBeNull()
  })

  it('ignores null entries in hit rate calculation', () => {
    // 3 entries: null, 5 (hit), 20 (miss) → 1/2 = 50%
    const result = computeHitRate([
      { error_pct: null },
      { error_pct: 5 },
      { error_pct: 20 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBe(50)
  })

  it('boundary: exactly at tolerance counts as a hit', () => {
    // tolerance = 10%, error_pct = 10 → hit
    const result = computeHitRate([{ error_pct: 10 }], 10)
    expect(result).not.toBeNull()
    expect(result!).toBe(100)
  })

  it('works with zero tolerance (exact match only)', () => {
    const result = computeHitRate([
      { error_pct: 0 },
      { error_pct: 1 },
    ], 0)
    expect(result).not.toBeNull()
    expect(result!).toBe(50)
  })
})
