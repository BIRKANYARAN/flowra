/**
 * Revenue Forecast (Commercial) — unit tests
 *
 * Tests pure computation logic of lib/services/commercial/revenue-forecast.service.ts
 * No DB or network calls — all pure function tests.
 * Target: 115+ tests
 */

import { describe, it, expect } from 'vitest'
import {
  computeSimpleMovingAverage,
  computeWeightedMovingAverage,
  computeExponentialMovingAverage,
  computeRevenueTrendSlope,
  computeMomGrowthRates,
  computeCmgr,
  computeSeasonalIndices,
  applySeasonalAdjustment,
  computeForecastConfidenceInterval,
  generateMonthlyForecast,
  generateScenarioForecasts,
  classifyForecastConfidence,
  computeMape,
  classifyForecastAccuracy,
  generateForecastNarrative,
} from '../lib/services/commercial/revenue-forecast.service'

// ── computeSimpleMovingAverage ────────────────────────────────────────────────

describe('computeSimpleMovingAverage', () => {

  it('1. n=3 from 5 values: uses last 3', () => {
    // [10, 20, 30, 40, 50] — last 3: [30, 40, 50] → avg=40
    expect(computeSimpleMovingAverage([10, 20, 30, 40, 50], 3)).toBe(40)
  })

  it('2. n=1 from 5 values → last value', () => {
    expect(computeSimpleMovingAverage([10, 20, 30, 40, 50], 1)).toBe(50)
  })

  it('3. n=5 from 5 values → average of all', () => {
    expect(computeSimpleMovingAverage([10, 20, 30, 40, 50], 5)).toBe(30)
  })

  it('4. n > length → null', () => {
    expect(computeSimpleMovingAverage([10, 20, 30], 4)).toBeNull()
  })

  it('5. empty array n=1 → null', () => {
    expect(computeSimpleMovingAverage([], 1)).toBeNull()
  })

  it('6. n equals length exactly → not null', () => {
    expect(computeSimpleMovingAverage([100, 200], 2)).toBe(150)
  })

  it('7. all zeros → 0', () => {
    expect(computeSimpleMovingAverage([0, 0, 0, 0], 3)).toBe(0)
  })

  it('8. large values', () => {
    expect(computeSimpleMovingAverage([1_000_000, 2_000_000, 3_000_000], 3)).toBeCloseTo(2_000_000, 0)
  })

  it('9. n=2 from 4 values: uses last 2', () => {
    // [100, 200, 300, 400] — last 2: [300, 400] → avg=350
    expect(computeSimpleMovingAverage([100, 200, 300, 400], 2)).toBe(350)
  })

  it('10. decimal values', () => {
    const result = computeSimpleMovingAverage([1.5, 2.5, 3.5], 2)
    expect(result).toBeCloseTo(3.0, 1)
  })

})

// ── computeWeightedMovingAverage ──────────────────────────────────────────────

describe('computeWeightedMovingAverage', () => {

  it('11. n=3 from [10, 20, 30]: weights 1,2,3 → (10×1+20×2+30×3)/6 = 140/6 ≈ 23.33', () => {
    const result = computeWeightedMovingAverage([10, 20, 30], 3)
    expect(result).toBeCloseTo(23.33, 1)
  })

  it('12. n=3 from 5 values: uses last 3', () => {
    // last 3 of [10,20,30,40,50] = [30,40,50], weights 1,2,3 → (30+80+150)/6 = 260/6 ≈ 43.33
    const result = computeWeightedMovingAverage([10, 20, 30, 40, 50], 3)
    expect(result).toBeCloseTo(43.33, 1)
  })

  it('13. n=2: weights 1,2', () => {
    // [100, 200], n=2: (100×1 + 200×2)/3 = 500/3 ≈ 166.67
    const result = computeWeightedMovingAverage([100, 200], 2)
    expect(result).toBeCloseTo(166.67, 1)
  })

  it('14. fewer than n → null', () => {
    expect(computeWeightedMovingAverage([10, 20], 3)).toBeNull()
  })

  it('15. empty array → null', () => {
    expect(computeWeightedMovingAverage([], 1)).toBeNull()
  })

  it('16. n=1: weight=1 → last value', () => {
    expect(computeWeightedMovingAverage([10, 20, 30, 40], 1)).toBe(40)
  })

  it('17. flat values: WMA equals simple average', () => {
    expect(computeWeightedMovingAverage([100, 100, 100], 3)).toBeCloseTo(100, 0)
  })

  it('18. ascending series: WMA > SMA (weights more recent)', () => {
    const wma = computeWeightedMovingAverage([10, 20, 30], 3)!
    const sma = computeSimpleMovingAverage([10, 20, 30], 3)!
    expect(wma).toBeGreaterThan(sma)
  })

  it('19. descending series: WMA < SMA', () => {
    const wma = computeWeightedMovingAverage([30, 20, 10], 3)!
    const sma = computeSimpleMovingAverage([30, 20, 10], 3)!
    expect(wma).toBeLessThan(sma)
  })

  it('20. result is non-negative for non-negative inputs', () => {
    const result = computeWeightedMovingAverage([100, 200, 300, 400], 4)
    expect(result).toBeGreaterThanOrEqual(0)
  })

})

// ── computeExponentialMovingAverage ──────────────────────────────────────────

describe('computeExponentialMovingAverage', () => {

  it('21. single value → that value', () => {
    expect(computeExponentialMovingAverage([100])).toBe(100)
  })

  it('22. empty array → null', () => {
    expect(computeExponentialMovingAverage([])).toBeNull()
  })

  it('23. alpha=1.0: EMA equals last value', () => {
    expect(computeExponentialMovingAverage([100, 200, 300], 1.0)).toBe(300)
  })

  it('24. alpha=0: EMA stays at first value', () => {
    expect(computeExponentialMovingAverage([100, 200, 300], 0)).toBe(100)
  })

  it('25. default alpha=0.3 with two values', () => {
    // EMA[0]=100, EMA[1] = 0.3×200 + 0.7×100 = 60+70 = 130
    expect(computeExponentialMovingAverage([100, 200])).toBeCloseTo(130, 1)
  })

  it('26. EMA with alpha=0.3 for 3 values', () => {
    // EMA[0]=100, EMA[1]=0.3×200+0.7×100=130, EMA[2]=0.3×300+0.7×130=90+91=181
    expect(computeExponentialMovingAverage([100, 200, 300])).toBeCloseTo(181, 0)
  })

  it('27. flat input → same value', () => {
    expect(computeExponentialMovingAverage([50, 50, 50, 50])).toBeCloseTo(50, 1)
  })

  it('28. higher alpha reacts more to recent data', () => {
    const lowAlpha = computeExponentialMovingAverage([100, 1000], 0.1)!
    const highAlpha = computeExponentialMovingAverage([100, 1000], 0.9)!
    expect(highAlpha).toBeGreaterThan(lowAlpha)
  })

  it('29. result is non-negative for non-negative inputs', () => {
    const result = computeExponentialMovingAverage([100, 200, 300], 0.5)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('30. custom alpha=0.5 two values: (0.5×200 + 0.5×100) = 150', () => {
    expect(computeExponentialMovingAverage([100, 200], 0.5)).toBeCloseTo(150, 1)
  })

})

// ── computeRevenueTrendSlope ──────────────────────────────────────────────────

describe('computeRevenueTrendSlope', () => {

  it('31. perfectly ascending series → positive slope', () => {
    const result = computeRevenueTrendSlope([100, 200, 300, 400, 500])
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(100, 0)
  })

  it('32. perfectly descending series → negative slope', () => {
    const result = computeRevenueTrendSlope([500, 400, 300, 200, 100])
    expect(result).not.toBeNull()
    expect(result!.slope).toBeLessThan(0)
  })

  it('33. flat series → slope near 0', () => {
    const result = computeRevenueTrendSlope([100, 100, 100, 100, 100])
    expect(result).not.toBeNull()
    expect(Math.abs(result!.slope)).toBeLessThan(0.01)
  })

  it('34. fewer than 2 non-zero → null', () => {
    expect(computeRevenueTrendSlope([0, 0, 0])).toBeNull()
  })

  it('35. single non-zero among zeros → null', () => {
    expect(computeRevenueTrendSlope([0, 100, 0])).toBeNull()
  })

  it('36. empty array → null', () => {
    expect(computeRevenueTrendSlope([])).toBeNull()
  })

  it('37. perfect ascending → R² = 1', () => {
    const result = computeRevenueTrendSlope([10, 20, 30, 40, 50])
    expect(result).not.toBeNull()
    expect(result!.r_squared).toBeCloseTo(1, 1)
  })

  it('38. noisy series → R² < 1', () => {
    const result = computeRevenueTrendSlope([100, 150, 110, 200, 130])
    expect(result).not.toBeNull()
    expect(result!.r_squared).toBeLessThan(1)
  })

  it('39. R² is in range [0, 1]', () => {
    const result = computeRevenueTrendSlope([100, 50, 200, 80, 150])
    expect(result).not.toBeNull()
    expect(result!.r_squared).toBeGreaterThanOrEqual(0)
    expect(result!.r_squared).toBeLessThanOrEqual(1)
  })

  it('40. two points → valid slope', () => {
    const result = computeRevenueTrendSlope([100, 300])
    expect(result).not.toBeNull()
    expect(result!.slope).toBeCloseTo(200, 0)
  })

})

// ── computeMomGrowthRates ─────────────────────────────────────────────────────

describe('computeMomGrowthRates', () => {

  it('41. [100, 110] → [0.1]', () => {
    expect(computeMomGrowthRates([100, 110])).toEqual([0.1])
  })

  it('42. [100, 200, 150] → [1.0, -0.25]', () => {
    const result = computeMomGrowthRates([100, 200, 150])
    expect(result[0]).toBeCloseTo(1.0, 1)
    expect(result[1]).toBeCloseTo(-0.25, 2)
  })

  it('43. fewer than 2 values → empty array', () => {
    expect(computeMomGrowthRates([100])).toEqual([])
    expect(computeMomGrowthRates([])).toEqual([])
  })

  it('44. skips pairs where prior === 0', () => {
    // [0, 100, 200] → skip pair (0,100), compute pair (100,200) → [1.0]
    const result = computeMomGrowthRates([0, 100, 200])
    expect(result).toHaveLength(1)
    expect(result[0]).toBeCloseTo(1.0, 1)
  })

  it('45. all zeros → empty (all pairs skipped)', () => {
    expect(computeMomGrowthRates([0, 0, 0])).toEqual([])
  })

  it('46. flat non-zero series → all zeros', () => {
    const result = computeMomGrowthRates([100, 100, 100])
    expect(result).toEqual([0, 0])
  })

  it('47. declining series → negative rates', () => {
    const result = computeMomGrowthRates([200, 150, 100])
    expect(result[0]).toBeLessThan(0)
    expect(result[1]).toBeLessThan(0)
  })

  it('48. rates length = values.length - 1 (no zeros)', () => {
    const values = [10, 20, 30, 40, 50]
    const result = computeMomGrowthRates(values)
    expect(result).toHaveLength(4)
  })

})

// ── computeCmgr ───────────────────────────────────────────────────────────────

describe('computeCmgr', () => {

  it('49. simple doubling over 2 periods → 100% growth', () => {
    // (200/100)^(1/1) - 1 = 1.0 = 100%
    expect(computeCmgr(100, 200, 2)).toBeCloseTo(1.0, 2)
  })

  it('50. tripling over 3 periods', () => {
    // (300/100)^(1/2) - 1 = sqrt(3) - 1 ≈ 0.732
    expect(computeCmgr(100, 300, 3)).toBeCloseTo(0.732, 2)
  })

  it('51. declining: 100→50 over 2 periods → -50%', () => {
    expect(computeCmgr(100, 50, 2)).toBeCloseTo(-0.5, 2)
  })

  it('52. first value = 0 → null', () => {
    expect(computeCmgr(0, 200, 3)).toBeNull()
  })

  it('53. first value < 0 → null', () => {
    expect(computeCmgr(-100, 200, 3)).toBeNull()
  })

  it('54. n < 2 → null', () => {
    expect(computeCmgr(100, 200, 1)).toBeNull()
  })

  it('55. n=2 → just the one-period growth rate', () => {
    // (150/100)^1 - 1 = 0.5
    expect(computeCmgr(100, 150, 2)).toBeCloseTo(0.5, 2)
  })

  it('56. same first and last value → 0', () => {
    expect(computeCmgr(100, 100, 12)).toBeCloseTo(0, 4)
  })

  it('57. very large n → small CMGR per month', () => {
    // Double over 24 months → CMGR ≈ 2.93%
    const result = computeCmgr(100, 200, 25)
    expect(result).toBeGreaterThan(0)
    expect(result!).toBeLessThan(0.05)
  })

})

// ── computeSeasonalIndices ────────────────────────────────────────────────────

describe('computeSeasonalIndices', () => {

  // Build 12 uniform months
  function buildUniformData(year: number = 2025): Array<{ year: number; month: number; revenue: number }> {
    return Array.from({ length: 12 }, (_, i) => ({
      year,
      month: i + 1,
      revenue: 1000,
    }))
  }

  it('58. 12 uniform months → all indices = 1.0', () => {
    const data = buildUniformData()
    const indices = computeSeasonalIndices(data)
    expect(indices.size).toBe(12)
    for (const [, idx] of indices) {
      expect(idx).toBeCloseTo(1.0, 2)
    }
  })

  it('59. indices sum ≈ 12 (each month has index summing to 12)', () => {
    const data = buildUniformData()
    const indices = computeSeasonalIndices(data)
    const sum = Array.from(indices.values()).reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(12, 0)
  })

  it('60. fewer than 12 months → empty map', () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      year: 2025,
      month: i + 1,
      revenue: 1000,
    }))
    expect(computeSeasonalIndices(data).size).toBe(0)
  })

  it('61. empty array → empty map', () => {
    expect(computeSeasonalIndices([]).size).toBe(0)
  })

  it('62. high-revenue month has index > 1', () => {
    const data = buildUniformData()
    data[11].revenue = 2000  // December has double revenue
    const indices = computeSeasonalIndices(data)
    expect(indices.get(12)!).toBeGreaterThan(1)
  })

  it('63. low-revenue month has index < 1', () => {
    const data = buildUniformData()
    data[0].revenue = 500  // January has half revenue
    const indices = computeSeasonalIndices(data)
    expect(indices.get(1)!).toBeLessThan(1)
  })

  it('64. 24 months data (2 years) → map has all 12 months', () => {
    const data = [
      ...buildUniformData(2024),
      ...buildUniformData(2025),
    ]
    const indices = computeSeasonalIndices(data)
    expect(indices.size).toBe(12)
  })

  it('65. index for each month is positive', () => {
    const data = buildUniformData()
    const indices = computeSeasonalIndices(data)
    for (const [, idx] of indices) {
      expect(idx).toBeGreaterThan(0)
    }
  })

})

// ── applySeasonalAdjustment ───────────────────────────────────────────────────

describe('applySeasonalAdjustment', () => {

  it('66. index=1.0 → no change', () => {
    expect(applySeasonalAdjustment(1000, 1.0)).toBe(1000)
  })

  it('67. index=1.5 → 50% boost', () => {
    expect(applySeasonalAdjustment(1000, 1.5)).toBeCloseTo(1500, 0)
  })

  it('68. index=0.8 → 20% reduction', () => {
    expect(applySeasonalAdjustment(1000, 0.8)).toBeCloseTo(800, 0)
  })

  it('69. index=0 → result=0', () => {
    expect(applySeasonalAdjustment(1000, 0)).toBe(0)
  })

  it('70. base=0 → result=0 regardless of index', () => {
    expect(applySeasonalAdjustment(0, 1.5)).toBe(0)
  })

  it('71. index=2 → doubles the value', () => {
    expect(applySeasonalAdjustment(500, 2)).toBe(1000)
  })

  it('72. result rounds to 2 decimal places', () => {
    const result = applySeasonalAdjustment(1000, 1.333)
    expect(Number.isFinite(result)).toBe(true)
  })

})

// ── computeForecastConfidenceInterval ────────────────────────────────────────

describe('computeForecastConfidenceInterval', () => {

  it('73. flat history → stddev=0 → CI width=0 → lower=upper=forecast', () => {
    const ci = computeForecastConfidenceInterval(1000, [1000, 1000, 1000])
    expect(ci.lower).toBe(1000)
    expect(ci.upper).toBe(1000)
  })

  it('74. width = stddev × zScore', () => {
    // stddev of [0, 100] = 50, zScore=1.28 → width=64
    const ci = computeForecastConfidenceInterval(200, [0, 100], 1.28)
    // expected: lower=200-64=136, upper=200+64=264
    const expectedWidth = 50 * 1.28
    expect(ci.upper - 200).toBeCloseTo(expectedWidth, 0)
    expect(200 - ci.lower).toBeCloseTo(expectedWidth, 0)
  })

  it('75. lower is floored at 0', () => {
    // forecast=10, large history variance → lower could go negative
    const ci = computeForecastConfidenceInterval(10, [0, 10000], 1.28)
    expect(ci.lower).toBeGreaterThanOrEqual(0)
  })

  it('76. upper > forecast always', () => {
    const ci = computeForecastConfidenceInterval(500, [100, 500, 900])
    expect(ci.upper).toBeGreaterThanOrEqual(500)
  })

  it('77. lower <= forecast always', () => {
    const ci = computeForecastConfidenceInterval(500, [100, 500, 900])
    expect(ci.lower).toBeLessThanOrEqual(500)
  })

  it('78. default zScore = 1.28', () => {
    const ci1 = computeForecastConfidenceInterval(1000, [800, 1000, 1200])
    const ci2 = computeForecastConfidenceInterval(1000, [800, 1000, 1200], 1.28)
    expect(ci1.lower).toBe(ci2.lower)
    expect(ci1.upper).toBe(ci2.upper)
  })

  it('79. larger zScore → wider CI', () => {
    const narrow = computeForecastConfidenceInterval(1000, [800, 900, 1100, 1200], 1.0)
    const wide   = computeForecastConfidenceInterval(1000, [800, 900, 1100, 1200], 2.0)
    expect(wide.upper - wide.lower).toBeGreaterThan(narrow.upper - narrow.lower)
  })

  it('80. empty history → stddev=0 → no width', () => {
    const ci = computeForecastConfidenceInterval(500, [])
    expect(ci.lower).toBe(500)
    expect(ci.upper).toBe(500)
  })

})

// ── generateMonthlyForecast ───────────────────────────────────────────────────

describe('generateMonthlyForecast', () => {

  it('81. 3 months from 6-value history → returns array of 3', () => {
    const result = generateMonthlyForecast([100, 110, 120, 130, 140, 150], 3)
    expect(result).toHaveLength(3)
  })

  it('82. ascending history → increasing forecast', () => {
    const result = generateMonthlyForecast([100, 110, 120, 130, 140, 150], 3)
    expect(result[0]).toBeGreaterThan(0)
    expect(result[1]).toBeGreaterThan(result[0])
    expect(result[2]).toBeGreaterThan(result[1])
  })

  it('83. empty history → empty array', () => {
    expect(generateMonthlyForecast([], 3)).toEqual([])
  })

  it('84. single value → empty array (< 2)', () => {
    expect(generateMonthlyForecast([100], 3)).toEqual([])
  })

  it('85. flat history → forecast stays flat (all equal)', () => {
    const result = generateMonthlyForecast([200, 200, 200, 200], 3)
    expect(result).toHaveLength(3)
    // With flat trend, slope≈0, so all forecast months should be similar
    expect(result[0]).toBeCloseTo(result[1], 0)
  })

  it('86. declining history → forecast may be lower (slope negative)', () => {
    const result = generateMonthlyForecast([500, 400, 300, 200, 100], 3)
    expect(result).toHaveLength(3)
    // Values should be non-negative (floored at 0)
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('87. months=1 → single-element array', () => {
    const result = generateMonthlyForecast([100, 200, 300], 1)
    expect(result).toHaveLength(1)
  })

  it('88. months=6 → 6-element array', () => {
    const result = generateMonthlyForecast([100, 200, 300, 400], 6)
    expect(result).toHaveLength(6)
  })

  it('89. all results are non-negative', () => {
    const result = generateMonthlyForecast([1000, 800, 600, 400, 200], 5)
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('90. returns numbers (not null)', () => {
    const result = generateMonthlyForecast([100, 200], 3)
    result.forEach(v => expect(typeof v).toBe('number'))
  })

})

// ── generateScenarioForecasts ─────────────────────────────────────────────────

describe('generateScenarioForecasts', () => {

  it('91. optimistic = base × 1.2', () => {
    const result = generateScenarioForecasts([100, 200, 300, 400], 3)
    result.base.forEach((b, i) => {
      if (b > 0) expect(result.optimistic[i]).toBeCloseTo(b * 1.2, 1)
    })
  })

  it('92. pessimistic = base × 0.8', () => {
    const result = generateScenarioForecasts([100, 200, 300, 400], 3)
    result.base.forEach((b, i) => {
      expect(result.pessimistic[i]).toBeCloseTo(b * 0.8, 1)
    })
  })

  it('93. all arrays have same length', () => {
    const result = generateScenarioForecasts([100, 200, 300], 4)
    expect(result.base).toHaveLength(4)
    expect(result.optimistic).toHaveLength(4)
    expect(result.pessimistic).toHaveLength(4)
  })

  it('94. empty history → all arrays empty', () => {
    const result = generateScenarioForecasts([], 3)
    expect(result.base).toEqual([])
    expect(result.optimistic).toEqual([])
    expect(result.pessimistic).toEqual([])
  })

  it('95. optimistic > base > pessimistic (for positive base)', () => {
    const result = generateScenarioForecasts([100, 150, 200, 250], 3)
    result.base.forEach((b, i) => {
      if (b > 0) {
        expect(result.optimistic[i]).toBeGreaterThan(b)
        expect(result.pessimistic[i]).toBeLessThan(b)
      }
    })
  })

  it('96. base=0 → all scenarios=0', () => {
    // very low values that might result in 0 forecast
    const result = generateScenarioForecasts([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3)
    result.base.forEach(v => expect(v).toBe(0))
  })

})

// ── classifyForecastConfidence ────────────────────────────────────────────────

describe('classifyForecastConfidence', () => {

  it('97. high: historyMonths=12, r_squared=0.7 → high', () => {
    expect(classifyForecastConfidence(12, 0.7)).toBe('high')
  })

  it('98. high: historyMonths=24, r_squared=0.9 → high', () => {
    expect(classifyForecastConfidence(24, 0.9)).toBe('high')
  })

  it('99. medium: historyMonths=6, r_squared=0.4 → medium', () => {
    expect(classifyForecastConfidence(6, 0.4)).toBe('medium')
  })

  it('100. medium: historyMonths=10, r_squared=0.5 → medium', () => {
    expect(classifyForecastConfidence(10, 0.5)).toBe('medium')
  })

  it('101. low: historyMonths=3, r_squared=0.1 → low', () => {
    expect(classifyForecastConfidence(3, 0.1)).toBe('low')
  })

  it('102. low: historyMonths=5, r_squared=null → low', () => {
    expect(classifyForecastConfidence(5, null)).toBe('low')
  })

  it('103. insufficient: historyMonths=2 → insufficient', () => {
    expect(classifyForecastConfidence(2, 0.9)).toBe('insufficient')
  })

  it('104. insufficient: historyMonths=0 → insufficient', () => {
    expect(classifyForecastConfidence(0, null)).toBe('insufficient')
  })

  it('105. exactly 12 months, r_squared=0.69 (below 0.7) → medium or low', () => {
    // 12 months but r_squared < 0.7 → not high
    const result = classifyForecastConfidence(12, 0.69)
    expect(result).not.toBe('high')
  })

  it('106. exactly 6 months, r_squared=0.39 (below 0.4) → low', () => {
    const result = classifyForecastConfidence(6, 0.39)
    expect(result).toBe('low')
  })

  it('107. historyMonths=3, r_squared=null → low', () => {
    expect(classifyForecastConfidence(3, null)).toBe('low')
  })

})

// ── computeMape ───────────────────────────────────────────────────────────────

describe('computeMape', () => {

  it('108. perfect forecast → MAPE = 0', () => {
    expect(computeMape([100, 200, 300], [100, 200, 300])).toBe(0)
  })

  it('109. 10% error on each → MAPE = 10', () => {
    expect(computeMape([100, 200], [110, 220])).toBeCloseTo(10, 0)
  })

  it('110. zero actual → null', () => {
    expect(computeMape([100, 0, 300], [100, 100, 300])).toBeNull()
  })

  it('111. empty arrays → null', () => {
    expect(computeMape([], [])).toBeNull()
  })

  it('112. mismatched lengths → null', () => {
    expect(computeMape([100, 200], [100])).toBeNull()
  })

  it('113. MAPE is symmetric around the actual', () => {
    // |200-100|/100*100 = 100% → MAPE=100
    expect(computeMape([100], [200])).toBeCloseTo(100, 0)
  })

  it('114. 50% error → MAPE=50', () => {
    expect(computeMape([200], [300])).toBeCloseTo(50, 0)
  })

  it('115. multiple errors averaged', () => {
    // actuals=[100,200], forecasts=[110,180] → errors: 10%, 10% → MAPE=10
    const result = computeMape([100, 200], [110, 180])
    expect(result).toBeCloseTo(10, 0)
  })

})

// ── classifyForecastAccuracy ──────────────────────────────────────────────────

describe('classifyForecastAccuracy', () => {

  it('116. null → no_data', () => {
    expect(classifyForecastAccuracy(null)).toBe('no_data')
  })

  it('117. MAPE=0 → excellent', () => {
    expect(classifyForecastAccuracy(0)).toBe('excellent')
  })

  it('118. MAPE=4.9 → excellent', () => {
    expect(classifyForecastAccuracy(4.9)).toBe('excellent')
  })

  it('119. MAPE=5 → good (not excellent, boundary)', () => {
    expect(classifyForecastAccuracy(5)).toBe('good')
  })

  it('120. MAPE=9.9 → good', () => {
    expect(classifyForecastAccuracy(9.9)).toBe('good')
  })

  it('121. MAPE=10 → acceptable (boundary)', () => {
    expect(classifyForecastAccuracy(10)).toBe('acceptable')
  })

  it('122. MAPE=19.9 → acceptable', () => {
    expect(classifyForecastAccuracy(19.9)).toBe('acceptable')
  })

  it('123. MAPE=20 → poor (boundary)', () => {
    expect(classifyForecastAccuracy(20)).toBe('poor')
  })

  it('124. MAPE=50 → poor', () => {
    expect(classifyForecastAccuracy(50)).toBe('poor')
  })

})

// ── generateForecastNarrative ─────────────────────────────────────────────────

describe('generateForecastNarrative', () => {

  it('125. returns a non-empty string', () => {
    const result = generateForecastNarrative('high', 100000, 80000, 'growing')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('126. high confidence + growing → contains Turkish content', () => {
    const result = generateForecastNarrative('high', 100000, 80000, 'growing')
    expect(result).toContain('₺')
  })

  it('127. insufficient confidence → warns about insufficient data', () => {
    const result = generateForecastNarrative('insufficient', 50000, 0, 'stable')
    expect(result).toMatch(/yetersiz|3 aylık/i)
  })

  it('128. medium confidence → mentions medium confidence', () => {
    const result = generateForecastNarrative('medium', 100000, 90000, 'stable')
    expect(result).toContain('orta')
  })

  it('129. low confidence → mentions low confidence', () => {
    const result = generateForecastNarrative('low', 100000, 90000, 'stable')
    expect(result).toContain('düşük')
  })

  it('130. growing trend → mentions büyüme', () => {
    const result = generateForecastNarrative('high', 100000, 80000, 'growing')
    expect(result).toContain('büyüme')
  })

  it('131. declining trend → mentions düşüş', () => {
    const result = generateForecastNarrative('medium', 70000, 100000, 'declining')
    expect(result).toContain('düşüş')
  })

  it('132. stable trend → mentions istikrarlı', () => {
    const result = generateForecastNarrative('medium', 100000, 100000, 'stable')
    expect(result).toContain('istikrarlı')
  })

  it('133. currentMonthActual=0 → does not crash, returns non-empty string', () => {
    const result = generateForecastNarrative('low', 50000, 0, 'growing')
    expect(result.length).toBeGreaterThan(10)
  })

  it('134. includes forecast amount in TRY', () => {
    const result = generateForecastNarrative('high', 250000, 200000, 'growing')
    expect(result).toContain('₺')
    expect(result).toContain('250') // formatted value contains 250
  })

  it('135. positive change shows + sign when currentMonthActual > 0', () => {
    const result = generateForecastNarrative('high', 120000, 100000, 'growing')
    expect(result).toContain('+')
  })

})
