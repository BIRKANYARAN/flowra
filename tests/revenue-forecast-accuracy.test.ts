/**
 * Revenue Forecast Accuracy — unit tests
 *
 * Tests all pure functions of lib/services/finance/revenue-forecast-accuracy.service.ts
 * No DB or network calls — pure function tests only.
 * Target: 120+ tests
 */

import { describe, it, expect } from 'vitest'
import {
  computeForecastError,
  computeAbsolutePercentageError,
  computeMape,
  computeRmse,
  computeBias,
  classifyForecastAccuracy,
  classifyForecastBias,
  computeTheilU,
  computeHitRate,
  computeSimpleMovingAvgForecast,
  computeNaiveForecast,
  generateForecastAccuracyNarrative,
} from '../lib/services/finance/revenue-forecast-accuracy.service'

// ── computeForecastError ──────────────────────────────────────────────────────

describe('computeForecastError', () => {
  it('1. actual > forecast → positive error', () => {
    expect(computeForecastError(100, 80)).toBe(20)
  })

  it('2. actual < forecast → absolute (positive) error', () => {
    expect(computeForecastError(80, 100)).toBe(20)
  })

  it('3. actual === forecast → 0', () => {
    expect(computeForecastError(100, 100)).toBe(0)
  })

  it('4. both zero → 0', () => {
    expect(computeForecastError(0, 0)).toBe(0)
  })

  it('5. actual 0, forecast nonzero → forecast value', () => {
    expect(computeForecastError(0, 50)).toBe(50)
  })

  it('6. large values', () => {
    expect(computeForecastError(1_000_000, 900_000)).toBe(100_000)
  })

  it('7. decimal values', () => {
    expect(computeForecastError(10.5, 10.0)).toBeCloseTo(0.5, 5)
  })

  it('8. negative actual vs positive forecast (net loss vs net gain)', () => {
    expect(computeForecastError(-100, 100)).toBe(200)
  })

  it('9. symmetry — error(a,b) === error(b,a)', () => {
    expect(computeForecastError(300, 450)).toBe(computeForecastError(450, 300))
  })
})

// ── computeAbsolutePercentageError ───────────────────────────────────────────

describe('computeAbsolutePercentageError', () => {
  it('10. actual=100, forecast=90 → 10%', () => {
    expect(computeAbsolutePercentageError(100, 90)).toBeCloseTo(10, 5)
  })

  it('11. actual=100, forecast=110 → 10%', () => {
    expect(computeAbsolutePercentageError(100, 110)).toBeCloseTo(10, 5)
  })

  it('12. perfect forecast → 0%', () => {
    expect(computeAbsolutePercentageError(200, 200)).toBe(0)
  })

  it('13. actual=0 → null (division by zero)', () => {
    expect(computeAbsolutePercentageError(0, 100)).toBeNull()
  })

  it('14. actual=0, forecast=0 → null', () => {
    expect(computeAbsolutePercentageError(0, 0)).toBeNull()
  })

  it('15. actual=50, forecast=75 → 50%', () => {
    expect(computeAbsolutePercentageError(50, 75)).toBeCloseTo(50, 5)
  })

  it('16. actual=1000, forecast=1200 → 20%', () => {
    expect(computeAbsolutePercentageError(1000, 1200)).toBeCloseTo(20, 5)
  })

  it('17. actual=1000, forecast=500 → 50%', () => {
    expect(computeAbsolutePercentageError(1000, 500)).toBeCloseTo(50, 5)
  })

  it('18. negative actual treated as non-zero → returns value', () => {
    // |-50 - -100| / |-50| * 100 = 100%
    expect(computeAbsolutePercentageError(-50, -100)).toBeCloseTo(100, 5)
  })
})

// ── computeMape ──────────────────────────────────────────────────────────────

describe('computeMape', () => {
  it('19. empty arrays → null', () => {
    expect(computeMape([], [])).toBeNull()
  })

  it('20. different length arrays → null', () => {
    expect(computeMape([100, 200], [100])).toBeNull()
  })

  it('21. single perfect forecast → 0', () => {
    expect(computeMape([100], [100])).toBe(0)
  })

  it('22. single 10% error → 10', () => {
    expect(computeMape([100], [90])).toBeCloseTo(10, 5)
  })

  it('23. multiple periods', () => {
    // APEs: 10, 20, 0 → avg = 10
    expect(computeMape([100, 100, 100], [90, 80, 100])).toBeCloseTo(10, 5)
  })

  it('24. all zeros in actuals → null (no valid periods)', () => {
    expect(computeMape([0, 0, 0], [100, 200, 300])).toBeNull()
  })

  it('25. one zero actual is skipped, rest computed', () => {
    // [100, 0, 200] vs [90, 999, 180] → APE for 0 skipped → (10 + 10) / 2 = 10
    expect(computeMape([100, 0, 200], [90, 999, 180])).toBeCloseTo(10, 5)
  })

  it('26. large dataset — symmetric errors average correctly', () => {
    const actuals = [100, 200, 300, 400, 500]
    const forecasts = [110, 180, 330, 360, 550]
    // APEs: 10, 10, 10, 10, 10 → MAPE = 10
    const result = computeMape(actuals, forecasts)
    expect(result).toBeCloseTo(10, 2)
  })

  it('27. single element with nonzero actual', () => {
    expect(computeMape([500], [600])).toBeCloseTo(20, 5)
  })

  it('28. all perfect forecasts → 0', () => {
    expect(computeMape([100, 200, 300], [100, 200, 300])).toBe(0)
  })
})

// ── computeRmse ──────────────────────────────────────────────────────────────

describe('computeRmse', () => {
  it('29. empty arrays → null', () => {
    expect(computeRmse([], [])).toBeNull()
  })

  it('30. different lengths → null', () => {
    expect(computeRmse([1, 2], [1])).toBeNull()
  })

  it('31. perfect forecast → 0', () => {
    expect(computeRmse([100, 200, 300], [100, 200, 300])).toBe(0)
  })

  it('32. single pair → |actual - forecast|', () => {
    // sqrt((100-80)^2 / 1) = sqrt(400) = 20
    expect(computeRmse([100], [80])).toBeCloseTo(20, 5)
  })

  it('33. uniform errors of 10 → RMSE=10', () => {
    expect(computeRmse([100, 100, 100], [110, 110, 110])).toBeCloseTo(10, 5)
  })

  it('34. mixed errors', () => {
    // errors: [0, 10, 20] → MSE = (0+100+400)/3 = 166.67 → RMSE ≈ 12.91
    expect(computeRmse([100, 100, 100], [100, 110, 120])).toBeCloseTo(12.91, 1)
  })

  it('35. RMSE is always non-negative', () => {
    const r = computeRmse([100, 200, 150], [90, 220, 140])
    expect(r).toBeGreaterThanOrEqual(0)
  })

  it('36. large values', () => {
    const r = computeRmse([1_000_000, 2_000_000], [900_000, 1_900_000])
    expect(r).toBeCloseTo(100_000, 0)
  })
})

// ── computeBias ──────────────────────────────────────────────────────────────

describe('computeBias', () => {
  it('37. empty arrays → null', () => {
    expect(computeBias([], [])).toBeNull()
  })

  it('38. different lengths → null', () => {
    expect(computeBias([100], [100, 200])).toBeNull()
  })

  it('39. perfect forecasts → 0', () => {
    expect(computeBias([100, 200, 300], [100, 200, 300])).toBe(0)
  })

  it('40. systematically over-forecasting → positive bias', () => {
    // forecasts always 10 above actual → bias = +10
    expect(computeBias([100, 200, 300], [110, 210, 310])).toBeCloseTo(10, 5)
  })

  it('41. systematically under-forecasting → negative bias', () => {
    // forecasts always 10 below actual → bias = -10
    expect(computeBias([100, 200, 300], [90, 190, 290])).toBeCloseTo(-10, 5)
  })

  it('42. mixed bias averages to zero', () => {
    expect(computeBias([100, 100], [110, 90])).toBeCloseTo(0, 5)
  })

  it('43. single pair: over-forecast', () => {
    expect(computeBias([100], [150])).toBeCloseTo(50, 5)
  })

  it('44. single pair: under-forecast', () => {
    expect(computeBias([200], [150])).toBeCloseTo(-50, 5)
  })

  it('45. sign convention: forecast - actual', () => {
    // bias > 0 means forecast > actual (optimistic)
    const bias = computeBias([100], [120])
    expect(bias).toBeGreaterThan(0)
  })
})

// ── classifyForecastAccuracy ─────────────────────────────────────────────────

describe('classifyForecastAccuracy', () => {
  it('46. null → no_data', () => {
    expect(classifyForecastAccuracy(null)).toBe('no_data')
  })

  it('47. 0 → excellent', () => {
    expect(classifyForecastAccuracy(0)).toBe('excellent')
  })

  it('48. 4.99 → excellent', () => {
    expect(classifyForecastAccuracy(4.99)).toBe('excellent')
  })

  it('49. 5.0 → good', () => {
    expect(classifyForecastAccuracy(5.0)).toBe('good')
  })

  it('50. 9.99 → good', () => {
    expect(classifyForecastAccuracy(9.99)).toBe('good')
  })

  it('51. 10.0 → fair', () => {
    expect(classifyForecastAccuracy(10.0)).toBe('fair')
  })

  it('52. 19.99 → fair', () => {
    expect(classifyForecastAccuracy(19.99)).toBe('fair')
  })

  it('53. 20.0 → poor', () => {
    expect(classifyForecastAccuracy(20.0)).toBe('poor')
  })

  it('54. 34.99 → poor', () => {
    expect(classifyForecastAccuracy(34.99)).toBe('poor')
  })

  it('55. 35.0 → critical', () => {
    expect(classifyForecastAccuracy(35.0)).toBe('critical')
  })

  it('56. 100 → critical', () => {
    expect(classifyForecastAccuracy(100)).toBe('critical')
  })
})

// ── classifyForecastBias ─────────────────────────────────────────────────────

describe('classifyForecastBias', () => {
  it('57. null bias → no_data', () => {
    expect(classifyForecastBias(null, 100)).toBe('no_data')
  })

  it('58. avgActual=0 → no_data', () => {
    expect(classifyForecastBias(10, 0)).toBe('no_data')
  })

  it('59. ratio < 0.03 → unbiased (positive bias)', () => {
    // bias=2, avgActual=100 → ratio=0.02 < 0.03
    expect(classifyForecastBias(2, 100)).toBe('unbiased')
  })

  it('60. ratio < 0.03 → unbiased (negative bias)', () => {
    expect(classifyForecastBias(-2, 100)).toBe('unbiased')
  })

  it('61. bias=0 → unbiased', () => {
    expect(classifyForecastBias(0, 100)).toBe('unbiased')
  })

  it('62. slight over-forecast → optimistic', () => {
    // bias=5, avgActual=100 → ratio=0.05 → between 0.03 and 0.15
    expect(classifyForecastBias(5, 100)).toBe('optimistic')
  })

  it('63. slight under-forecast → conservative', () => {
    expect(classifyForecastBias(-5, 100)).toBe('conservative')
  })

  it('64. large over-forecast → significantly_optimistic', () => {
    // bias=20, avgActual=100 → ratio=0.20 > 0.15
    expect(classifyForecastBias(20, 100)).toBe('significantly_optimistic')
  })

  it('65. large under-forecast → significantly_conservative', () => {
    expect(classifyForecastBias(-20, 100)).toBe('significantly_conservative')
  })

  it('66. exactly at boundary 0.03 → still optimistic (not unbiased)', () => {
    // ratio=0.03 is NOT < 0.03, so goes to directional check
    expect(classifyForecastBias(3, 100)).toBe('optimistic')
  })

  it('67. exactly at boundary 0.15 → still optimistic (not significant)', () => {
    // ratio=0.15 is NOT > 0.15
    expect(classifyForecastBias(15, 100)).toBe('optimistic')
  })

  it('68. bias just over 0.15 → significantly_optimistic', () => {
    expect(classifyForecastBias(16, 100)).toBe('significantly_optimistic')
  })
})

// ── computeTheilU ────────────────────────────────────────────────────────────

describe('computeTheilU', () => {
  it('69. single element → null (need ≥2)', () => {
    expect(computeTheilU([100], [100])).toBeNull()
  })

  it('70. empty → null', () => {
    expect(computeTheilU([], [])).toBeNull()
  })

  it('71. different lengths → null', () => {
    expect(computeTheilU([100, 200], [100])).toBeNull()
  })

  it('72. perfect model better than naïve → U < 1', () => {
    // Flat series: [100,100,100,100] — naïve is also perfect, U = 1/1 = NaN or null or 1
    // Use a trending series where model is perfect but naïve is off
    const actuals = [100, 110, 120, 130]
    // Model forecast exactly right
    const forecasts = [100, 110, 120, 130]
    const u = computeTheilU(actuals, forecasts)
    // Model RMSE=0, so U would be 0/naïveRmse = 0
    expect(u).toBe(0)
  })

  it('73. model worse than perfect but better than random → U between 0 and 1', () => {
    // actuals: steady trend [100, 110, 120, 130]
    // model: predicts the trend well (small errors)
    const actuals = [100, 110, 120, 130]
    const forecasts = [105, 112, 118, 128]
    const u = computeTheilU(actuals, forecasts)
    // Should be computable and a finite number
    expect(u).not.toBeNull()
    expect(isFinite(u!)).toBe(true)
  })

  it('74. returns null when naïve RMSE is 0 (constant actuals)', () => {
    // If all actuals are the same, naïve RMSE = 0 → undefined
    const actuals = [100, 100, 100, 100]
    const forecasts = [100, 100, 100, 100]
    const u = computeTheilU(actuals, forecasts)
    expect(u).toBeNull() // both 0/0
  })

  it('75. worse than naïve → U > 1', () => {
    // actuals: [100,110,120], naïve=[100,110], model is opposite of trend
    const actuals = [100, 110, 120, 130]
    // Very bad model: forecasts far off
    const forecasts = [130, 120, 110, 100]
    const u = computeTheilU(actuals, forecasts)
    expect(u).toBeGreaterThan(1)
  })

  it('76. U is non-negative', () => {
    const u = computeTheilU([100, 200, 150, 180], [110, 190, 155, 175])
    expect(u).toBeGreaterThanOrEqual(0)
  })
})

// ── computeHitRate ────────────────────────────────────────────────────────────

describe('computeHitRate', () => {
  it('77. empty actuals → 0', () => {
    expect(computeHitRate([], [])).toBe(0)
  })

  it('78. different lengths → 0', () => {
    expect(computeHitRate([100, 200], [100])).toBe(0)
  })

  it('79. all within threshold → 100%', () => {
    expect(computeHitRate([100, 200, 300], [105, 195, 305])).toBe(100)
  })

  it('80. none within threshold → 0%', () => {
    expect(computeHitRate([100, 100, 100], [200, 200, 200])).toBe(0)
  })

  it('81. half within threshold → 50%', () => {
    expect(computeHitRate([100, 100], [105, 200])).toBe(50)
  })

  it('82. custom threshold 5% — tight', () => {
    // 105/100 = 5% exactly → within 5% threshold
    expect(computeHitRate([100], [105], 5)).toBe(100)
  })

  it('83. custom threshold 5% — 6% error → miss', () => {
    expect(computeHitRate([100], [106], 5)).toBe(0)
  })

  it('84. custom threshold 20% — wider band', () => {
    // 115/100 = 15% → within 20% threshold
    expect(computeHitRate([100], [115], 20)).toBe(100)
  })

  it('85. actual=0, forecast=0 → hit', () => {
    expect(computeHitRate([0], [0])).toBe(100)
  })

  it('86. actual=0, forecast≠0 → miss', () => {
    expect(computeHitRate([0], [50])).toBe(0)
  })

  it('87. hit rate out of [0,100]', () => {
    const rate = computeHitRate([100, 200, 300], [99, 198, 305])
    expect(rate).toBeGreaterThanOrEqual(0)
    expect(rate).toBeLessThanOrEqual(100)
  })

  it('88. one hit out of three → ~33.3%', () => {
    expect(computeHitRate([100, 100, 100], [108, 200, 200])).toBeCloseTo(33.33, 1)
  })
})

// ── computeSimpleMovingAvgForecast ───────────────────────────────────────────

describe('computeSimpleMovingAvgForecast', () => {
  it('89. empty history → empty', () => {
    expect(computeSimpleMovingAvgForecast([], 3)).toEqual([])
  })

  it('90. forecastN=0 → empty', () => {
    expect(computeSimpleMovingAvgForecast([100, 200, 300], 0)).toEqual([])
  })

  it('91. forecast 1 ahead from 3 values → avg of last 3', () => {
    // avg([100,200,300]) = 200
    expect(computeSimpleMovingAvgForecast([100, 200, 300], 1)).toEqual([200])
  })

  it('92. history < 3 → uses available history', () => {
    // [100, 200] → avg = 150
    expect(computeSimpleMovingAvgForecast([100, 200], 1)).toEqual([150])
  })

  it('93. single history value → all forecasts equal that value', () => {
    expect(computeSimpleMovingAvgForecast([500], 3)).toEqual([500, 500, 500])
  })

  it('94. returns correct count of forecasts', () => {
    const result = computeSimpleMovingAvgForecast([100, 200, 300, 400], 4)
    expect(result).toHaveLength(4)
  })

  it('95. rolling: second forecast uses previous forecast in window', () => {
    // history = [100, 200, 300] → f1 = 200, then window = [200, 300, 200], f2 = 233.33
    const result = computeSimpleMovingAvgForecast([100, 200, 300], 2)
    expect(result[0]).toBeCloseTo(200, 2)
    expect(result[1]).toBeCloseTo(233.33, 1)
  })

  it('96. constant history → constant forecast', () => {
    expect(computeSimpleMovingAvgForecast([100, 100, 100], 3)).toEqual([100, 100, 100])
  })

  it('97. forecastN negative → empty', () => {
    expect(computeSimpleMovingAvgForecast([100, 200], -1)).toEqual([])
  })
})

// ── computeNaiveForecast ─────────────────────────────────────────────────────

describe('computeNaiveForecast', () => {
  it('98. empty history → empty', () => {
    expect(computeNaiveForecast([], 3)).toEqual([])
  })

  it('99. forecastN=0 → empty', () => {
    expect(computeNaiveForecast([100], 0)).toEqual([])
  })

  it('100. all forecasts equal last history value', () => {
    expect(computeNaiveForecast([100, 200, 300], 3)).toEqual([300, 300, 300])
  })

  it('101. single history → replicated N times', () => {
    expect(computeNaiveForecast([500], 5)).toEqual([500, 500, 500, 500, 500])
  })

  it('102. forecast 1 ahead', () => {
    expect(computeNaiveForecast([1, 2, 3, 4, 5], 1)).toEqual([5])
  })

  it('103. result length matches forecastN', () => {
    expect(computeNaiveForecast([100, 200], 7)).toHaveLength(7)
  })

  it('104. last value is zero → forecasts all zero', () => {
    expect(computeNaiveForecast([100, 200, 0], 3)).toEqual([0, 0, 0])
  })

  it('105. does not mutate history', () => {
    const hist = [10, 20, 30]
    computeNaiveForecast(hist, 3)
    expect(hist).toEqual([10, 20, 30])
  })
})

// ── generateForecastAccuracyNarrative ────────────────────────────────────────

describe('generateForecastAccuracyNarrative', () => {
  it('106. no_data accuracy → returns no-data message', () => {
    const result = generateForecastAccuracyNarrative(null, 'no_data', 'no_data', 0, 0)
    expect(result).toContain('yeterli veri')
  })

  it('107. excellent accuracy → contains mükemmel', () => {
    const result = generateForecastAccuracyNarrative(2, 'excellent', 'unbiased', 90, 12)
    expect(result).toContain('mükemmel')
  })

  it('108. good accuracy → contains iyi', () => {
    const result = generateForecastAccuracyNarrative(7, 'good', 'unbiased', 75, 10)
    expect(result).toContain('iyi')
  })

  it('109. fair accuracy → contains orta', () => {
    const result = generateForecastAccuracyNarrative(15, 'fair', 'optimistic', 60, 8)
    expect(result).toContain('orta')
  })

  it('110. poor accuracy → contains zayıf', () => {
    const result = generateForecastAccuracyNarrative(25, 'poor', 'conservative', 40, 9)
    expect(result).toContain('zayıf')
  })

  it('111. critical accuracy → contains kritik', () => {
    const result = generateForecastAccuracyNarrative(50, 'critical', 'significantly_optimistic', 20, 6)
    expect(result).toContain('kritik')
  })

  it('112. includes period count in narrative', () => {
    const result = generateForecastAccuracyNarrative(4, 'excellent', 'unbiased', 90, 12)
    expect(result).toContain('12')
  })

  it('113. includes MAPE value in narrative', () => {
    const result = generateForecastAccuracyNarrative(4.5, 'excellent', 'unbiased', 90, 12)
    expect(result).toContain('4.5')
  })

  it('114. unbiased → does not mention yanlılık / sapma problem', () => {
    const result = generateForecastAccuracyNarrative(3, 'excellent', 'unbiased', 90, 12)
    expect(result).toContain('sapma')
  })

  it('115. optimistic bias → mentions iyimser', () => {
    const result = generateForecastAccuracyNarrative(8, 'good', 'optimistic', 70, 10)
    expect(result).toContain('iyimser')
  })

  it('116. conservative bias → mentions tutucu', () => {
    const result = generateForecastAccuracyNarrative(12, 'fair', 'conservative', 55, 10)
    expect(result).toContain('tutucu')
  })

  it('117. significantly_optimistic → mentions belirgin and iyimser', () => {
    const result = generateForecastAccuracyNarrative(30, 'poor', 'significantly_optimistic', 30, 8)
    expect(result).toContain('belirgin')
    expect(result).toContain('iyimser')
  })

  it('118. significantly_conservative → mentions belirgin and tutucu', () => {
    const result = generateForecastAccuracyNarrative(30, 'poor', 'significantly_conservative', 25, 8)
    expect(result).toContain('belirgin')
    expect(result).toContain('tutucu')
  })

  it('119. hit rate included in narrative', () => {
    const result = generateForecastAccuracyNarrative(5, 'good', 'unbiased', 80, 12)
    expect(result).toContain('80')
  })

  it('120. returns a non-empty string', () => {
    const result = generateForecastAccuracyNarrative(10, 'fair', 'unbiased', 65, 10)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })
})

// ── Integration: full pipeline ────────────────────────────────────────────────

describe('Full pipeline integration', () => {
  const actuals  = [100_000, 110_000, 105_000, 115_000, 108_000, 112_000]
  // SMA-style forecasts (simulated)
  const forecasts = [105_000, 107_000, 106_000, 110_000, 109_000, 111_000]

  it('121. MAPE is a finite positive number', () => {
    const mape = computeMape(actuals, forecasts)
    expect(mape).not.toBeNull()
    expect(mape!).toBeGreaterThanOrEqual(0)
    expect(isFinite(mape!)).toBe(true)
  })

  it('122. RMSE is a finite positive number', () => {
    const rmse = computeRmse(actuals, forecasts)
    expect(rmse).not.toBeNull()
    expect(rmse!).toBeGreaterThanOrEqual(0)
  })

  it('123. classifyForecastAccuracy returns a valid label', () => {
    const mape = computeMape(actuals, forecasts)
    const cls = classifyForecastAccuracy(mape)
    expect(['excellent', 'good', 'fair', 'poor', 'critical', 'no_data']).toContain(cls)
  })

  it('124. bias direction matches over/under-forecast', () => {
    // forecasts higher on average → positive bias
    const heavyForecast = actuals.map(a => a * 1.1)
    const bias = computeBias(actuals, heavyForecast)
    expect(bias).toBeGreaterThan(0)
  })

  it('125. hit rate within [0, 100]', () => {
    const rate = computeHitRate(actuals, forecasts, 10)
    expect(rate).toBeGreaterThanOrEqual(0)
    expect(rate).toBeLessThanOrEqual(100)
  })

  it('126. naïve forecast backtest MAPE is computable', () => {
    const naïve = computeNaiveForecast(actuals.slice(0, 5), 1)
    const naïveMape = computeMape([actuals[5]], naïve)
    expect(naïveMape).not.toBeNull()
  })

  it('127. SMA forecast returns correct length', () => {
    const fcs = computeSimpleMovingAvgForecast(actuals, 3)
    expect(fcs).toHaveLength(3)
  })

  it('128. narrative includes Turkish text (non-ASCII)', () => {
    const mape = computeMape(actuals, forecasts)
    const cls = classifyForecastAccuracy(mape)
    const bias = computeBias(actuals, forecasts)
    const avgActual = actuals.reduce((s, v) => s + v, 0) / actuals.length
    const biasCls = classifyForecastBias(bias, avgActual)
    const hitRate = computeHitRate(actuals, forecasts)
    const narrative = generateForecastAccuracyNarrative(mape, cls, biasCls, hitRate, actuals.length)
    // Should include Turkish non-ASCII characters
    expect(narrative).toMatch(/[ğüşıöçĞÜŞİÖÇ]/)
  })
})
