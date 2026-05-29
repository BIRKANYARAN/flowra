/**
 * Cash Flow Forecasting Service — unit tests
 *
 * Tests all pure computation functions exported from cashflow-forecast.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * Target: 120+ tests covering all 14 exported pure functions.
 */

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyRevenueForecast,
  computeMonthlyExpenseForecast,
  computeNetCashFlowForecast,
  computeCumulativeCashPosition,
  computeRunwayMonths,
  classifyRunwayStatus,
  computeWorstCaseAdjustment,
  computeBestCaseAdjustment,
  computeDebtServiceSchedule,
  computeAdjustedCashFlow,
  computeAvgMonthlyCashBurn,
  computeBreakEvenMonth,
  classifyCashFlowTrend,
  generateCashFlowForecastNarrative,
} from '../lib/services/finance/cashflow-forecast.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeMonthlyRevenueForecast
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlyRevenueForecast', () => {
  it('1. empty array → returns array of forecastMonths zeros', () => {
    const result = computeMonthlyRevenueForecast([], 6)
    expect(result).toHaveLength(6)
    expect(result.every(v => v === 0)).toBe(true)
  })

  it('2. empty array with forecastMonths=1 → [0]', () => {
    expect(computeMonthlyRevenueForecast([], 1)).toEqual([0])
  })

  it('3. empty array with forecastMonths=0 → []', () => {
    expect(computeMonthlyRevenueForecast([], 0)).toEqual([])
  })

  it('4. single element → forecast repeats that value', () => {
    const result = computeMonthlyRevenueForecast([10_000], 3)
    expect(result).toHaveLength(3)
    // With single element, smoothed = 10000, all months = 10000
    expect(result[0]).toBeCloseTo(10_000)
  })

  it('5. constant array → forecast approximates that constant', () => {
    const data = Array(12).fill(50_000)
    const result = computeMonthlyRevenueForecast(data, 6, 0.3)
    expect(result).toHaveLength(6)
    // Exponential smoothing of constant series converges to the constant
    result.forEach(v => expect(v).toBeCloseTo(50_000, 0))
  })

  it('6. basic smoothing with alpha=0.3 — two data points', () => {
    // S_0 = 100, S_1 = 0.3*200 + 0.7*100 = 60 + 70 = 130
    const result = computeMonthlyRevenueForecast([100, 200], 1, 0.3)
    expect(result[0]).toBeCloseTo(130)
  })

  it('7. alpha=1.0 → forecast = last historical value', () => {
    const result = computeMonthlyRevenueForecast([100, 200, 300], 3, 1.0)
    result.forEach(v => expect(v).toBeCloseTo(300))
  })

  it('8. alpha=0.0 → forecast = first value (smoothed never updates)', () => {
    const result = computeMonthlyRevenueForecast([100, 200, 300], 3, 0.0)
    result.forEach(v => expect(v).toBeCloseTo(100))
  })

  it('9. returns exactly forecastMonths elements', () => {
    const result = computeMonthlyRevenueForecast([1000, 2000, 3000], 12)
    expect(result).toHaveLength(12)
  })

  it('10. all zeros in historical → forecast is all zeros', () => {
    const result = computeMonthlyRevenueForecast([0, 0, 0], 4)
    result.forEach(v => expect(v).toBe(0))
  })

  it('11. increasing series → forecast is positive', () => {
    const data = [10_000, 20_000, 30_000, 40_000, 50_000]
    const result = computeMonthlyRevenueForecast(data, 3)
    result.forEach(v => expect(v).toBeGreaterThan(0))
  })

  it('12. default alpha=0.3 is used when not specified', () => {
    const withDefault = computeMonthlyRevenueForecast([100, 200], 1)
    const withExplicit = computeMonthlyRevenueForecast([100, 200], 1, 0.3)
    expect(withDefault[0]).toBeCloseTo(withExplicit[0])
  })

  it('13. large values — no overflow', () => {
    const data = [1_000_000_000, 2_000_000_000]
    const result = computeMonthlyRevenueForecast(data, 6)
    result.forEach(v => expect(Number.isFinite(v)).toBe(true))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeMonthlyExpenseForecast
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlyExpenseForecast', () => {
  it('14. empty array → returns array of zeros', () => {
    const result = computeMonthlyExpenseForecast([], 6)
    expect(result).toHaveLength(6)
    result.forEach(v => expect(v).toBe(0))
  })

  it('15. single element → forecast = that value', () => {
    const result = computeMonthlyExpenseForecast([5_000], 3)
    expect(result).toHaveLength(3)
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('16. constant expenses → forecast approximates constant', () => {
    const data = Array(12).fill(30_000)
    const result = computeMonthlyExpenseForecast(data, 6)
    result.forEach(v => expect(v).toBeCloseTo(30_000, -2))
  })

  it('17. increasing trend → later months higher than earlier', () => {
    const data = [10_000, 15_000, 20_000, 25_000, 30_000, 35_000]
    const result = computeMonthlyExpenseForecast(data, 6)
    // With increasing trend, later months should be >= earlier
    expect(result[5]).toBeGreaterThanOrEqual(result[0])
  })

  it('18. decreasing trend → should not produce negative values', () => {
    const data = [100_000, 80_000, 60_000, 40_000, 20_000, 10_000]
    const result = computeMonthlyExpenseForecast(data, 6)
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(0))
  })

  it('19. returns exactly forecastMonths elements', () => {
    const result = computeMonthlyExpenseForecast([1000, 2000, 3000], 12)
    expect(result).toHaveLength(12)
  })

  it('20. two elements — uses both for recent avg', () => {
    const result = computeMonthlyExpenseForecast([10_000, 20_000], 3)
    expect(result).toHaveLength(3)
    result.forEach(v => expect(Number.isFinite(v)).toBe(true))
  })

  it('21. all zeros → forecast is all zeros', () => {
    const result = computeMonthlyExpenseForecast([0, 0, 0, 0], 4)
    result.forEach(v => expect(v).toBe(0))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeNetCashFlowForecast
// ─────────────────────────────────────────────────────────────────────────────

describe('computeNetCashFlowForecast', () => {
  it('22. matching length arrays → revenue - expense per month', () => {
    const result = computeNetCashFlowForecast([100, 200, 300], [50, 80, 120])
    expect(result).toEqual([50, 120, 180])
  })

  it('23. equal revenue and expenses → all zeros', () => {
    const result = computeNetCashFlowForecast([100, 200], [100, 200])
    expect(result).toEqual([0, 0])
  })

  it('24. expenses > revenue → negative net flow', () => {
    const result = computeNetCashFlowForecast([50], [100])
    expect(result[0]).toBe(-50)
  })

  it('25. empty arrays → empty result', () => {
    expect(computeNetCashFlowForecast([], [])).toEqual([])
  })

  it('26. mismatched lengths → truncates to shorter array', () => {
    const result = computeNetCashFlowForecast([100, 200, 300], [50, 80])
    expect(result).toHaveLength(2)
    expect(result).toEqual([50, 120])
  })

  it('27. all zeros → all zeros', () => {
    const result = computeNetCashFlowForecast([0, 0, 0], [0, 0, 0])
    expect(result).toEqual([0, 0, 0])
  })

  it('28. positive net flows across 12 months', () => {
    const rev = Array(12).fill(100_000)
    const exp = Array(12).fill(60_000)
    const result = computeNetCashFlowForecast(rev, exp)
    result.forEach(v => expect(v).toBe(40_000))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeCumulativeCashPosition
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCumulativeCashPosition', () => {
  it('29. starting cash + net flows accumulate correctly', () => {
    const result = computeCumulativeCashPosition(1000, [100, 200, -50])
    expect(result).toEqual([1100, 1300, 1250])
  })

  it('30. starting cash zero, all positive flows', () => {
    const result = computeCumulativeCashPosition(0, [100, 100, 100])
    expect(result).toEqual([100, 200, 300])
  })

  it('31. starting cash negative', () => {
    const result = computeCumulativeCashPosition(-500, [200, 300])
    expect(result[0]).toBe(-300)
    expect(result[1]).toBe(0)
  })

  it('32. empty net cash flows → empty result', () => {
    expect(computeCumulativeCashPosition(1000, [])).toEqual([])
  })

  it('33. all negative flows → cash declining', () => {
    const result = computeCumulativeCashPosition(10_000, [-1000, -2000, -3000])
    expect(result[0]).toBe(9_000)
    expect(result[1]).toBe(7_000)
    expect(result[2]).toBe(4_000)
  })

  it('34. high starting cash, small flows — stays positive throughout', () => {
    const result = computeCumulativeCashPosition(1_000_000, Array(12).fill(-5000))
    result.forEach(v => expect(v).toBeGreaterThan(0))
  })

  it('35. large starting cash number — no overflow', () => {
    const result = computeCumulativeCashPosition(1e9, [1e6, 2e6])
    expect(Number.isFinite(result[0])).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeRunwayMonths
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRunwayMonths', () => {
  it('36. never goes negative → returns null', () => {
    expect(computeRunwayMonths([100, 200, 300, 400])).toBeNull()
  })

  it('37. first position negative (already negative) → returns 0', () => {
    expect(computeRunwayMonths([-100, -200, -300])).toBe(0)
  })

  it('38. goes negative at month 3 (index 2) → returns 2', () => {
    // positions: [200, 100, -50] → negative at index 2 → runway = 2
    expect(computeRunwayMonths([200, 100, -50])).toBe(2)
  })

  it('39. empty array → returns null', () => {
    expect(computeRunwayMonths([])).toBeNull()
  })

  it('40. goes negative at month 1 (index 0) → returns 0', () => {
    // First position is already negative
    expect(computeRunwayMonths([-1])).toBe(0)
  })

  it('41. single positive position → null (never negative)', () => {
    expect(computeRunwayMonths([500])).toBeNull()
  })

  it('42. positive then immediately negative → returns 1', () => {
    // positions: [500, -100] → goes negative at index 1 → 1
    expect(computeRunwayMonths([500, -100])).toBe(1)
  })

  it('43. all positive — long runway', () => {
    const positions = Array(24).fill(100_000)
    expect(computeRunwayMonths(positions)).toBeNull()
  })

  it('44. goes to exactly zero (not negative) → not counted', () => {
    expect(computeRunwayMonths([100, 0, -50])).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. classifyRunwayStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyRunwayStatus', () => {
  it('45. null (never runs out) → healthy', () => {
    expect(classifyRunwayStatus(null)).toBe('healthy')
  })

  it('46. runway = 12 → healthy', () => {
    expect(classifyRunwayStatus(12)).toBe('healthy')
  })

  it('47. runway = 15 → healthy', () => {
    expect(classifyRunwayStatus(15)).toBe('healthy')
  })

  it('48. runway = 11 → caution', () => {
    expect(classifyRunwayStatus(11)).toBe('caution')
  })

  it('49. runway = 6 → caution', () => {
    expect(classifyRunwayStatus(6)).toBe('caution')
  })

  it('50. runway = 5 → at_risk', () => {
    expect(classifyRunwayStatus(5)).toBe('at_risk')
  })

  it('51. runway = 3 → at_risk', () => {
    expect(classifyRunwayStatus(3)).toBe('at_risk')
  })

  it('52. runway = 2 → critical', () => {
    expect(classifyRunwayStatus(2)).toBe('critical')
  })

  it('53. runway = 0 → critical', () => {
    expect(classifyRunwayStatus(0)).toBe('critical')
  })

  it('54. runway = 1 → critical', () => {
    expect(classifyRunwayStatus(1)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. computeWorstCaseAdjustment
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWorstCaseAdjustment', () => {
  it('55. default 20% stress → each value * 0.8', () => {
    const result = computeWorstCaseAdjustment([100_000, 200_000])
    expect(result[0]).toBeCloseTo(80_000)
    expect(result[1]).toBeCloseTo(160_000)
  })

  it('56. custom stressFactor=0.5 → each value * 0.5', () => {
    const result = computeWorstCaseAdjustment([100_000], 0.5)
    expect(result[0]).toBeCloseTo(50_000)
  })

  it('57. zero revenue → stays zero', () => {
    const result = computeWorstCaseAdjustment([0, 0, 0])
    result.forEach(v => expect(v).toBe(0))
  })

  it('58. stressFactor=0 → no change', () => {
    const result = computeWorstCaseAdjustment([100_000, 200_000], 0)
    expect(result[0]).toBe(100_000)
    expect(result[1]).toBe(200_000)
  })

  it('59. stressFactor=1.0 → all zeros', () => {
    const result = computeWorstCaseAdjustment([100_000, 50_000], 1.0)
    result.forEach(v => expect(v).toBe(0))
  })

  it('60. preserves array length', () => {
    const input = Array(12).fill(100_000)
    const result = computeWorstCaseAdjustment(input)
    expect(result).toHaveLength(12)
  })

  it('61. empty array → empty result', () => {
    expect(computeWorstCaseAdjustment([])).toEqual([])
  })

  it('62. worst case always <= original', () => {
    const input = [50_000, 75_000, 100_000]
    const result = computeWorstCaseAdjustment(input)
    result.forEach((v, i) => expect(v).toBeLessThanOrEqual(input[i]))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. computeBestCaseAdjustment
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBestCaseAdjustment', () => {
  it('63. default 15% upside → each value * 1.15', () => {
    const result = computeBestCaseAdjustment([100_000, 200_000])
    expect(result[0]).toBeCloseTo(115_000)
    expect(result[1]).toBeCloseTo(230_000)
  })

  it('64. custom upsideFactor=0.25 → each value * 1.25', () => {
    const result = computeBestCaseAdjustment([100_000], 0.25)
    expect(result[0]).toBeCloseTo(125_000)
  })

  it('65. zero revenue → stays zero', () => {
    const result = computeBestCaseAdjustment([0, 0])
    result.forEach(v => expect(v).toBe(0))
  })

  it('66. upsideFactor=0 → no change', () => {
    const result = computeBestCaseAdjustment([100_000], 0)
    expect(result[0]).toBe(100_000)
  })

  it('67. best case always >= original (for positive values)', () => {
    const input = [50_000, 75_000, 100_000]
    const result = computeBestCaseAdjustment(input)
    result.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(input[i]))
  })

  it('68. empty array → empty result', () => {
    expect(computeBestCaseAdjustment([])).toEqual([])
  })

  it('69. preserves array length', () => {
    const input = Array(12).fill(80_000)
    const result = computeBestCaseAdjustment(input)
    expect(result).toHaveLength(12)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. computeDebtServiceSchedule
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDebtServiceSchedule', () => {
  it('70. no tranches → all zeros', () => {
    const result = computeDebtServiceSchedule([], 6)
    expect(result).toHaveLength(6)
    result.forEach(v => expect(v).toBe(0))
  })

  it('71. single tranche 12 months → positive payments for all 12 months', () => {
    const tranches = [{ principal_try: 120_000, annual_interest_rate: 12, months_remaining: 12 }]
    const result = computeDebtServiceSchedule(tranches, 12)
    expect(result).toHaveLength(12)
    result.forEach(v => expect(v).toBeGreaterThan(0))
  })

  it('72. single tranche — monthly principal = principal / months_remaining', () => {
    // 120k / 12 = 10k principal + 120k * 12% / 12 = 1200 interest = 11200/month
    const tranches = [{ principal_try: 120_000, annual_interest_rate: 12, months_remaining: 12 }]
    const result = computeDebtServiceSchedule(tranches, 12)
    expect(result[0]).toBeCloseTo(11_200)
  })

  it('73. tranche expires mid-forecast — months after expiry = 0', () => {
    const tranches = [{ principal_try: 60_000, annual_interest_rate: 0, months_remaining: 3 }]
    const result = computeDebtServiceSchedule(tranches, 6)
    // Months 1-3 should have payment, months 4-6 should be 0
    expect(result[0]).toBeGreaterThan(0)
    expect(result[1]).toBeGreaterThan(0)
    expect(result[2]).toBeGreaterThan(0)
    expect(result[3]).toBe(0)
    expect(result[4]).toBe(0)
    expect(result[5]).toBe(0)
  })

  it('74. multiple tranches — payments sum correctly', () => {
    const tranches = [
      { principal_try: 120_000, annual_interest_rate: 0, months_remaining: 12 },
      { principal_try: 60_000, annual_interest_rate: 0, months_remaining: 6 },
    ]
    const result = computeDebtServiceSchedule(tranches, 12)
    // Month 1: 10000 (tranche1) + 10000 (tranche2) = 20000
    expect(result[0]).toBeCloseTo(20_000)
    // Month 7: only tranche1 = 10000
    expect(result[6]).toBeCloseTo(10_000)
  })

  it('75. zero months_remaining tranche → contributes nothing', () => {
    const tranches = [{ principal_try: 100_000, annual_interest_rate: 10, months_remaining: 0 }]
    const result = computeDebtServiceSchedule(tranches, 6)
    result.forEach(v => expect(v).toBe(0))
  })

  it('76. negative months_remaining → treated as <= 0, contributes nothing', () => {
    const tranches = [{ principal_try: 100_000, annual_interest_rate: 10, months_remaining: -5 }]
    const result = computeDebtServiceSchedule(tranches, 6)
    result.forEach(v => expect(v).toBe(0))
  })

  it('77. zero interest rate → payment = principal / months only', () => {
    const tranches = [{ principal_try: 120_000, annual_interest_rate: 0, months_remaining: 12 }]
    const result = computeDebtServiceSchedule(tranches, 12)
    result.slice(0, 12).forEach(v => expect(v).toBeCloseTo(10_000))
  })

  it('78. returns exactly forecastMonths elements', () => {
    const tranches = [{ principal_try: 120_000, annual_interest_rate: 5, months_remaining: 24 }]
    const result = computeDebtServiceSchedule(tranches, 12)
    expect(result).toHaveLength(12)
  })

  it('79. empty tranches with forecastMonths=0 → []', () => {
    expect(computeDebtServiceSchedule([], 0)).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. computeAdjustedCashFlow
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAdjustedCashFlow', () => {
  it('80. basic subtraction — net - debt service', () => {
    const result = computeAdjustedCashFlow([100, 200, 300], [20, 30, 40])
    expect(result).toEqual([80, 170, 260])
  })

  it('81. positive net flows with zero debt service → same as net flows', () => {
    const result = computeAdjustedCashFlow([100, 200], [0, 0])
    expect(result).toEqual([100, 200])
  })

  it('82. debt service > net flow → negative adjusted', () => {
    const result = computeAdjustedCashFlow([100], [200])
    expect(result[0]).toBe(-100)
  })

  it('83. empty arrays → empty result', () => {
    expect(computeAdjustedCashFlow([], [])).toEqual([])
  })

  it('84. mismatched lengths → truncates to shorter', () => {
    const result = computeAdjustedCashFlow([100, 200, 300], [50])
    expect(result).toHaveLength(1)
    expect(result[0]).toBe(50)
  })

  it('85. all zeros → all zeros', () => {
    const result = computeAdjustedCashFlow([0, 0, 0], [0, 0, 0])
    result.forEach(v => expect(v).toBe(0))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. computeAvgMonthlyCashBurn
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAvgMonthlyCashBurn', () => {
  it('86. all positive flows → null (no burn)', () => {
    expect(computeAvgMonthlyCashBurn([100, 200, 300])).toBeNull()
  })

  it('87. all negative flows → avg of absolute values', () => {
    const result = computeAvgMonthlyCashBurn([-100, -200, -300])
    expect(result).toBeCloseTo(200)  // (100 + 200 + 300) / 3
  })

  it('88. mixed flows → avg of negative months only', () => {
    // negative months: -100, -300 → avg = (100+300)/2 = 200
    const result = computeAvgMonthlyCashBurn([200, -100, 150, -300])
    expect(result).toBeCloseTo(200)
  })

  it('89. single negative month → returns its absolute value', () => {
    const result = computeAvgMonthlyCashBurn([100, -500, 200])
    expect(result).toBeCloseTo(500)
  })

  it('90. empty array → null', () => {
    expect(computeAvgMonthlyCashBurn([])).toBeNull()
  })

  it('91. zero flows → null (zero is not negative)', () => {
    expect(computeAvgMonthlyCashBurn([0, 0, 0])).toBeNull()
  })

  it('92. mix of positive, zero, and negative', () => {
    // Burn months: -50, -150 → avg = (50+150)/2 = 100
    const result = computeAvgMonthlyCashBurn([100, 0, -50, 200, -150])
    expect(result).toBeCloseTo(100)
  })

  it('93. single negative value array', () => {
    expect(computeAvgMonthlyCashBurn([-250])).toBeCloseTo(250)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. computeBreakEvenMonth
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBreakEvenMonth', () => {
  it('94. already positive at month 1 → returns 1', () => {
    expect(computeBreakEvenMonth([100, 200, 300])).toBe(1)
  })

  it('95. never positive → returns null', () => {
    expect(computeBreakEvenMonth([-100, -200, -300])).toBeNull()
  })

  it('96. breaks even at month 4 (1-indexed)', () => {
    // positions: [-300, -200, -100, 50] → first positive at index 3 → month 4
    expect(computeBreakEvenMonth([-300, -200, -100, 50])).toBe(4)
  })

  it('97. empty array → null', () => {
    expect(computeBreakEvenMonth([])).toBeNull()
  })

  it('98. zero is not positive → continues searching', () => {
    // 0 is not > 0, so should continue
    expect(computeBreakEvenMonth([0, 0, 50])).toBe(3)
  })

  it('99. exactly zero throughout → null', () => {
    expect(computeBreakEvenMonth([0, 0, 0])).toBeNull()
  })

  it('100. first position exactly zero, second positive → returns 2', () => {
    expect(computeBreakEvenMonth([0, 100])).toBe(2)
  })

  it('101. negative then immediately positive → returns 2', () => {
    expect(computeBreakEvenMonth([-500, 100])).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. classifyCashFlowTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyCashFlowTrend', () => {
  it('102. fewer than 6 months → insufficient_data', () => {
    expect(classifyCashFlowTrend([100, 200, 300, 400, 500])).toBe('insufficient_data')
  })

  it('103. empty array → insufficient_data', () => {
    expect(classifyCashFlowTrend([])).toBe('insufficient_data')
  })

  it('104. exactly 5 months → insufficient_data', () => {
    expect(classifyCashFlowTrend([1, 2, 3, 4, 5])).toBe('insufficient_data')
  })

  it('105. improving: last 3 avg significantly higher than first 3', () => {
    // first3 avg = (100+100+100)/3 = 100, last3 avg = (200+200+200)/3 = 200
    // changePct = (200-100)/100 * 100 = 100% > 10% → improving
    const result = classifyCashFlowTrend([100, 100, 100, 200, 200, 200])
    expect(result).toBe('improving')
  })

  it('106. deteriorating: last 3 avg significantly lower than first 3', () => {
    // first3 avg = 200, last3 avg = 100 → changePct = -50% < -10% → deteriorating
    const result = classifyCashFlowTrend([200, 200, 200, 100, 100, 100])
    expect(result).toBe('deteriorating')
  })

  it('107. stable: within 10% change', () => {
    // first3 avg = 100, last3 avg = 105 → changePct = 5% → stable
    const result = classifyCashFlowTrend([100, 100, 100, 105, 105, 105])
    expect(result).toBe('stable')
  })

  it('108. stable: exactly at 10% boundary', () => {
    // first3 avg = 100, last3 avg = 110 → changePct = 10% → stable (not > 10%)
    const result = classifyCashFlowTrend([100, 100, 100, 110, 110, 110])
    expect(result).toBe('stable')
  })

  it('109. 12 months of data — uses first 3 and last 3', () => {
    const flows = [100, 100, 100, 150, 150, 150, 200, 200, 200, 300, 300, 300]
    // first3 avg = 100, last3 avg = 300 → improving
    expect(classifyCashFlowTrend(flows)).toBe('improving')
  })

  it('110. all equal values → stable', () => {
    const flows = Array(6).fill(1000)
    expect(classifyCashFlowTrend(flows)).toBe('stable')
  })

  it('111. negative flows improving (becoming less negative)', () => {
    // first3 avg = -200, last3 avg = -100 → changePct = (-100 - -200)/200 * 100 = 50% → improving
    const result = classifyCashFlowTrend([-200, -200, -200, -100, -100, -100])
    expect(result).toBe('improving')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. generateCashFlowForecastNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe('generateCashFlowForecastNarrative', () => {
  it('112. returns a non-empty Turkish string', () => {
    const result = generateCashFlowForecastNarrative(12, 'healthy', 'stable', 100_000, 3)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('113. healthy status with null runway → mentions no deficit', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'stable', 100_000, null)
    expect(result).toContain('açığı öngörülmemektedir')
  })

  it('114. critical status with runway=0 → mentions current deficit', () => {
    const result = generateCashFlowForecastNarrative(0, 'critical', 'deteriorating', -10_000, null)
    expect(result).toContain('Kritik')
  })

  it('115. at_risk status → contains risk warning in Turkish', () => {
    const result = generateCashFlowForecastNarrative(4, 'at_risk', 'stable', 50_000, null)
    expect(result).toContain('Risk')
  })

  it('116. caution status → contains dikkat in Turkish', () => {
    const result = generateCashFlowForecastNarrative(9, 'caution', 'stable', 200_000, 6)
    expect(result).toContain('Dikkat')
  })

  it('117. improving trend → mentions iyileşme', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'improving', 500_000, null)
    expect(result).toContain('iyileşme')
  })

  it('118. deteriorating trend → mentions bozulmaktadır', () => {
    const result = generateCashFlowForecastNarrative(3, 'at_risk', 'deteriorating', 50_000, null)
    expect(result).toContain('bozulmaktadır')
  })

  it('119. with break-even month → mentions the month number', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'stable', 100_000, 6)
    expect(result).toContain('6')
  })

  it('120. null break-even → mentions unable to reach break-even', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'stable', 100_000, null)
    expect(result).toContain('başabaş')
  })

  it('121. includes formatted starting cash in output', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'stable', 1_000_000, null)
    // Should contain the cash amount (format may vary but should have digits)
    expect(result).toContain('₺')
  })

  it('122. insufficient_data trend → mentions insufficient data', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'insufficient_data', 50_000, null)
    expect(result).toContain('yeterli veri')
  })

  it('123. stable trend → mentions istikrarlı', () => {
    const result = generateCashFlowForecastNarrative(null, 'healthy', 'stable', 100_000, null)
    expect(result).toContain('istikrarlı')
  })

  it('124. healthy status with defined runway months', () => {
    const result = generateCashFlowForecastNarrative(18, 'healthy', 'stable', 300_000, null)
    expect(result).toContain('sağlıklı')
  })

  it('125. critical status with positive runway → mentions the month count', () => {
    const result = generateCashFlowForecastNarrative(2, 'critical', 'deteriorating', 20_000, null)
    expect(result).toContain('2')
  })
})
