/**
 * Demand Forecast Service — pure-math tests (80+ cases)
 *
 * Scope (no DB):
 *   • computeMovingAverage()
 *   • computeExponentialSmoothing()
 *   • computeForecastedDemand()
 *   • computeReorderPoint()
 *   • computeStdDeviation()
 *   • computeSafetyStock()
 *   • classifyDemandVolatility()
 *   • computeStockoutRisk()
 *   • computeOptimalOrderQuantity()
 *   • computeDemandTrend()
 *   • computeInventoryCoverage()
 *   • generateDemandForecastNarrative()
 *
 * Run with: npx vitest run tests/demand-forecast.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeMovingAverage,
  computeExponentialSmoothing,
  computeForecastedDemand,
  computeReorderPoint,
  computeStdDeviation,
  computeSafetyStock,
  classifyDemandVolatility,
  computeStockoutRisk,
  computeOptimalOrderQuantity,
  computeDemandTrend,
  computeInventoryCoverage,
  generateDemandForecastNarrative,
} from '../lib/services/inventory/demand-forecast.service'

// ── computeMovingAverage ──────────────────────────────────────────────────────

describe('computeMovingAverage', () => {
  it('returns null when values.length < periods', () => {
    expect(computeMovingAverage([10, 20], 3)).toBeNull()
  })

  it('returns null for empty array with periods > 0', () => {
    expect(computeMovingAverage([], 3)).toBeNull()
  })

  it('returns the only value for 1 value and 1 period', () => {
    expect(computeMovingAverage([50], 1)).toBe(50)
  })

  it('computes 3-period MA for [10,20,30] → 20', () => {
    expect(computeMovingAverage([10, 20, 30], 3)).toBe(20)
  })

  it('uses only last N values: [10,20,30,40,50] with periods=3 → 40', () => {
    expect(computeMovingAverage([10, 20, 30, 40, 50], 3)).toBeCloseTo(40, 5)
  })

  it('computes 2-period MA for [100,200] → 150', () => {
    expect(computeMovingAverage([100, 200], 2)).toBe(150)
  })

  it('handles zeros: [0,0,0] with periods=3 → 0', () => {
    expect(computeMovingAverage([0, 0, 0], 3)).toBe(0)
  })

  it('exact match: 5 values, periods=5 → avg of all', () => {
    expect(computeMovingAverage([2, 4, 6, 8, 10], 5)).toBe(6)
  })

  it('returns null when periods exactly exceeds length', () => {
    expect(computeMovingAverage([1, 2], 3)).toBeNull()
  })
})

// ── computeExponentialSmoothing ───────────────────────────────────────────────

describe('computeExponentialSmoothing', () => {
  it('returns empty array for empty input', () => {
    expect(computeExponentialSmoothing([])).toEqual([])
  })

  it('first value equals values[0]', () => {
    const result = computeExponentialSmoothing([100, 200, 300])
    expect(result[0]).toBe(100)
  })

  it('returns same-length array as input', () => {
    const result = computeExponentialSmoothing([10, 20, 30, 40, 50])
    expect(result).toHaveLength(5)
  })

  it('single value returns [value]', () => {
    expect(computeExponentialSmoothing([42])).toEqual([42])
  })

  it('smoothing with alpha=0.3: S1 = 0.3*200 + 0.7*100 = 130', () => {
    const result = computeExponentialSmoothing([100, 200], 0.3)
    expect(result[1]).toBeCloseTo(130, 5)
  })

  it('smoothing with alpha=1.0 returns original values', () => {
    const input = [10, 20, 30, 40]
    const result = computeExponentialSmoothing(input, 1.0)
    expect(result).toEqual(input)
  })

  it('smoothing with alpha=0.0 holds first value throughout', () => {
    const result = computeExponentialSmoothing([50, 100, 200], 0.0)
    expect(result).toEqual([50, 50, 50])
  })

  it('output is monotone increasing for monotone increasing input at alpha=0.5', () => {
    const result = computeExponentialSmoothing([10, 20, 30, 40, 50], 0.5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1])
    }
  })

  it('uses default alpha=0.3 when not provided', () => {
    const withDefault = computeExponentialSmoothing([100, 200])
    const explicit = computeExponentialSmoothing([100, 200], 0.3)
    expect(withDefault).toEqual(explicit)
  })
})

// ── computeForecastedDemand ───────────────────────────────────────────────────

describe('computeForecastedDemand', () => {
  it('returns array of correct length', () => {
    const result = computeForecastedDemand([100, 110, 121], 3)
    expect(result).toHaveLength(3)
  })

  it('returns zeros for empty smoothed values', () => {
    const result = computeForecastedDemand([], 3)
    expect(result).toEqual([0, 0, 0])
  })

  it('uses multiplier=1.0 for single smoothed value', () => {
    const result = computeForecastedDemand([100], 3)
    expect(result).toEqual([100, 100, 100])
  })

  it('clamps multiplier at 1.3 for strong growth', () => {
    // last=200, secondLast=100 → raw=2.0 → clamped to 1.3
    const result = computeForecastedDemand([100, 200], 1)
    expect(result[0]).toBeCloseTo(200 * 1.3, 5)
  })

  it('clamps multiplier at 0.7 for strong decline', () => {
    // last=10, secondLast=100 → raw=0.1 → clamped to 0.7
    const result = computeForecastedDemand([100, 10], 1)
    expect(result[0]).toBeCloseTo(10 * 0.7, 5)
  })

  it('multiplier 1.1 within range → used as-is', () => {
    // last=110, secondLast=100 → multiplier=1.1
    const result = computeForecastedDemand([100, 110], 1)
    expect(result[0]).toBeCloseTo(110 * 1.1, 4)
  })

  it('multiplier 0.9 within range → used as-is', () => {
    const result = computeForecastedDemand([100, 90], 1)
    expect(result[0]).toBeCloseTo(90 * 0.9, 4)
  })

  it('applies multiplier compounded over periods', () => {
    // last=110, secondLast=100 → multiplier=1.1
    const result = computeForecastedDemand([100, 110], 3)
    expect(result[0]).toBeCloseTo(110 * 1.1, 4)
    expect(result[1]).toBeCloseTo(110 * Math.pow(1.1, 2), 4)
    expect(result[2]).toBeCloseTo(110 * Math.pow(1.1, 3), 4)
  })

  it('returns 0 periods for forecastPeriods=0', () => {
    expect(computeForecastedDemand([100, 110], 0)).toEqual([])
  })
})

// ── computeReorderPoint ───────────────────────────────────────────────────────

describe('computeReorderPoint', () => {
  it('basic: 300 units/mo, 14 days, 50 safety → (300/30)*14 + 50 = 190', () => {
    expect(computeReorderPoint(300, 14, 50)).toBeCloseTo(190, 5)
  })

  it('zero monthly demand → safety stock only', () => {
    expect(computeReorderPoint(0, 14, 30)).toBe(30)
  })

  it('zero safety stock → only lead time demand', () => {
    expect(computeReorderPoint(300, 30, 0)).toBeCloseTo(300, 5)
  })

  it('1 day lead time: 30 units/mo → 1 unit daily → ROP=1+safety', () => {
    expect(computeReorderPoint(30, 1, 10)).toBeCloseTo(11, 5)
  })

  it('calculates correctly for 600 units/mo, 7 days, 20 safety', () => {
    // (600/30)*7 + 20 = 140 + 20 = 160
    expect(computeReorderPoint(600, 7, 20)).toBeCloseTo(160, 5)
  })
})

// ── computeStdDeviation ───────────────────────────────────────────────────────

describe('computeStdDeviation', () => {
  it('returns 0 for fewer than 2 values', () => {
    expect(computeStdDeviation([])).toBe(0)
    expect(computeStdDeviation([100])).toBe(0)
  })

  it('returns 0 for identical values [5,5,5]', () => {
    expect(computeStdDeviation([5, 5, 5])).toBe(0)
  })

  it('computes population std dev for [2,4,4,4,5,5,7,9]', () => {
    // mean=5, variance=4, stddev=2
    expect(computeStdDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 5)
  })

  it('computes std dev for [0,100] → mean=50, std=50', () => {
    expect(computeStdDeviation([0, 100])).toBeCloseTo(50, 5)
  })

  it('computes std dev for [10,20] → mean=15, std=5', () => {
    expect(computeStdDeviation([10, 20])).toBeCloseTo(5, 5)
  })
})

// ── computeSafetyStock ────────────────────────────────────────────────────────

describe('computeSafetyStock', () => {
  it('returns 0 for fewer than 2 historical values', () => {
    expect(computeSafetyStock([], 14)).toBe(0)
    expect(computeSafetyStock([100], 14)).toBe(0)
  })

  it('returns 0 when stdDev is 0 (all same values)', () => {
    expect(computeSafetyStock([100, 100, 100], 14)).toBe(0)
  })

  it('uses z=1.65 for 95% service level (default)', () => {
    // std=50, lead=9 → 1.65*50*sqrt(9) = 1.65*50*3 = 247.5
    expect(computeSafetyStock([0, 100], 9, 0.95)).toBeCloseTo(1.65 * 50 * 3, 2)
  })

  it('uses z=1.28 for 90% service level', () => {
    expect(computeSafetyStock([0, 100], 9, 0.90)).toBeCloseTo(1.28 * 50 * 3, 2)
  })

  it('uses z=2.05 for 99% service level', () => {
    expect(computeSafetyStock([0, 100], 9, 0.99)).toBeCloseTo(2.05 * 50 * 3, 2)
  })

  it('default service level is 95%', () => {
    const withDefault = computeSafetyStock([0, 100], 9)
    const explicit95 = computeSafetyStock([0, 100], 9, 0.95)
    expect(withDefault).toBeCloseTo(explicit95, 5)
  })

  it('higher service level → higher safety stock', () => {
    const ss90 = computeSafetyStock([10, 50, 30, 20], 14, 0.90)
    const ss95 = computeSafetyStock([10, 50, 30, 20], 14, 0.95)
    const ss99 = computeSafetyStock([10, 50, 30, 20], 14, 0.99)
    expect(ss99).toBeGreaterThan(ss95)
    expect(ss95).toBeGreaterThan(ss90)
  })
})

// ── classifyDemandVolatility ──────────────────────────────────────────────────

describe('classifyDemandVolatility', () => {
  it('returns "no_data" for empty array', () => {
    expect(classifyDemandVolatility([])).toBe('no_data')
  })

  it('returns "no_data" when mean is 0', () => {
    expect(classifyDemandVolatility([0, 0, 0])).toBe('no_data')
  })

  it('returns "very_stable" for cv < 0.10 ([100,101,100,99])', () => {
    // mean≈100, std≈0.7, cv≈0.007
    expect(classifyDemandVolatility([100, 101, 100, 99])).toBe('very_stable')
  })

  it('returns "stable" for cv in [0.10, 0.25)', () => {
    // mean=100, std=15, cv=0.15
    expect(classifyDemandVolatility([85, 100, 115])).toBe('stable')
  })

  it('returns "moderate" for cv in [0.25, 0.50)', () => {
    // mean=100, std=35, cv=0.35
    expect(classifyDemandVolatility([65, 100, 135])).toBe('moderate')
  })

  it('returns "volatile" for cv in [0.50, 0.75)', () => {
    // mean=100, std≈65.3, cv≈0.65
    expect(classifyDemandVolatility([20, 100, 180])).toBe('volatile')
  })

  it('returns "highly_volatile" for cv >= 0.75', () => {
    // mean=100, std=100, cv=1.0
    expect(classifyDemandVolatility([0, 100, 200])).toBe('highly_volatile')
  })

  it('returns "no_data" when all values are negative (mean <= 0)', () => {
    expect(classifyDemandVolatility([-10, -20, -30])).toBe('no_data')
  })

  it('single value with non-zero returns "very_stable" (std=0)', () => {
    expect(classifyDemandVolatility([50])).toBe('very_stable')
  })
})

// ── computeStockoutRisk ───────────────────────────────────────────────────────

describe('computeStockoutRisk', () => {
  it('returns "no_data" for empty forecasted demand', () => {
    expect(computeStockoutRisk(100, [])).toBe('no_data')
  })

  it('returns "no_data" when avg forecast is 0', () => {
    expect(computeStockoutRisk(100, [0, 0, 0])).toBe('no_data')
  })

  it('returns "critical" when stock < 1 month of demand', () => {
    // stock=50, avg forecast=100/mo → 0.5 months → critical
    expect(computeStockoutRisk(50, [100, 100, 100])).toBe('critical')
  })

  it('returns "high" when 1 <= months < 2', () => {
    // stock=150, avg=100 → 1.5 months → high
    expect(computeStockoutRisk(150, [100, 100, 100])).toBe('high')
  })

  it('returns "medium" when 2 <= months < 3', () => {
    // stock=250, avg=100 → 2.5 months → medium
    expect(computeStockoutRisk(250, [100, 100, 100])).toBe('medium')
  })

  it('returns "low" when >= 3 months', () => {
    // stock=400, avg=100 → 4 months → low
    expect(computeStockoutRisk(400, [100, 100, 100])).toBe('low')
  })

  it('returns "critical" for 0 stock', () => {
    expect(computeStockoutRisk(0, [100])).toBe('critical')
  })

  it('boundary: exactly 1 month → "high" (not critical)', () => {
    // stock=100, avg=100 → 1.0 months → high
    expect(computeStockoutRisk(100, [100])).toBe('high')
  })

  it('boundary: exactly 2 months → "medium"', () => {
    expect(computeStockoutRisk(200, [100])).toBe('medium')
  })

  it('boundary: exactly 3 months → "low"', () => {
    expect(computeStockoutRisk(300, [100])).toBe('low')
  })

  it('uses average of forecasted demand array', () => {
    // avg of [50, 150] = 100, stock=80 → 0.8 months → critical
    expect(computeStockoutRisk(80, [50, 150])).toBe('critical')
  })
})

// ── computeOptimalOrderQuantity (EOQ) ─────────────────────────────────────────

describe('computeOptimalOrderQuantity', () => {
  it('returns null when annualDemand <= 0', () => {
    expect(computeOptimalOrderQuantity(0, 50, 100)).toBeNull()
  })

  it('returns null when unitCost is 0 (H=0)', () => {
    expect(computeOptimalOrderQuantity(1000, 50, 0)).toBeNull()
  })

  it('returns null when holdingRate is 0 (H=0)', () => {
    expect(computeOptimalOrderQuantity(1000, 50, 100, 0)).toBeNull()
  })

  it('computes EOQ correctly: D=1000,S=50,C=10,H_rate=0.25 → H=2.5 → EOQ=200', () => {
    // sqrt(2*1000*50/2.5) = sqrt(40000) = 200
    const result = computeOptimalOrderQuantity(1000, 50, 10, 0.25)
    expect(result).toBeCloseTo(200, 4)
  })

  it('uses default holdingRate=0.25', () => {
    const withDefault = computeOptimalOrderQuantity(1000, 50, 10)
    const explicit = computeOptimalOrderQuantity(1000, 50, 10, 0.25)
    expect(withDefault).toBeCloseTo(explicit!, 5)
  })

  it('higher order cost → higher EOQ', () => {
    const eoq1 = computeOptimalOrderQuantity(1000, 50, 10)!
    const eoq2 = computeOptimalOrderQuantity(1000, 200, 10)!
    expect(eoq2).toBeGreaterThan(eoq1)
  })

  it('higher unit cost → lower EOQ', () => {
    const eoq1 = computeOptimalOrderQuantity(1000, 50, 10)!
    const eoq2 = computeOptimalOrderQuantity(1000, 50, 40)!
    expect(eoq2).toBeLessThan(eoq1)
  })

  it('returns positive number for valid inputs', () => {
    const result = computeOptimalOrderQuantity(500, 100, 20, 0.3)
    expect(result).toBeGreaterThan(0)
  })
})

// ── computeDemandTrend ────────────────────────────────────────────────────────

describe('computeDemandTrend', () => {
  it('returns "insufficient_data" for fewer than 3 points', () => {
    expect(computeDemandTrend([])).toBe('insufficient_data')
    expect(computeDemandTrend([100])).toBe('insufficient_data')
    expect(computeDemandTrend([100, 200])).toBe('insufficient_data')
  })

  it('returns "growing" for clearly increasing series', () => {
    expect(computeDemandTrend([10, 20, 30, 40, 50])).toBe('growing')
  })

  it('returns "declining" for clearly decreasing series', () => {
    expect(computeDemandTrend([50, 40, 30, 20, 10])).toBe('declining')
  })

  it('returns "stable" for flat series', () => {
    expect(computeDemandTrend([100, 100, 100, 100, 100])).toBe('stable')
  })

  it('returns "stable" for slightly fluctuating series', () => {
    expect(computeDemandTrend([100, 101, 99, 100, 102])).toBe('stable')
  })

  it('handles exactly 3 points: growing', () => {
    expect(computeDemandTrend([10, 50, 90])).toBe('growing')
  })

  it('handles exactly 3 points: declining', () => {
    expect(computeDemandTrend([90, 50, 10])).toBe('declining')
  })

  it('handles exactly 3 points: stable', () => {
    expect(computeDemandTrend([100, 100, 100])).toBe('stable')
  })

  it('returns "stable" when mean is 0', () => {
    expect(computeDemandTrend([0, 0, 0])).toBe('stable')
  })
})

// ── computeInventoryCoverage ──────────────────────────────────────────────────

describe('computeInventoryCoverage', () => {
  it('returns null when avgMonthlyDemand <= 0', () => {
    expect(computeInventoryCoverage(100, 0)).toBeNull()
    expect(computeInventoryCoverage(100, -5)).toBeNull()
  })

  it('returns 3 for 300 stock / 100 avg monthly demand', () => {
    expect(computeInventoryCoverage(300, 100)).toBe(3)
  })

  it('returns 0 for 0 stock', () => {
    expect(computeInventoryCoverage(0, 100)).toBe(0)
  })

  it('returns fractional months correctly (150/100=1.5)', () => {
    expect(computeInventoryCoverage(150, 100)).toBe(1.5)
  })

  it('handles large numbers', () => {
    expect(computeInventoryCoverage(10000, 2000)).toBe(5)
  })
})

// ── generateDemandForecastNarrative ──────────────────────────────────────────

describe('generateDemandForecastNarrative', () => {
  it('returns a non-empty string', () => {
    const result = generateDemandForecastNarrative(
      'Ürün A', 'growing', 'stable', 'low', 3.0,
    )
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('contains the product name', () => {
    const result = generateDemandForecastNarrative(
      'Özel Ürün', 'stable', 'moderate', 'medium', 2.0,
    )
    expect(result).toContain('Özel Ürün')
  })

  it('contains Turkish trend label for "growing"', () => {
    const result = generateDemandForecastNarrative(
      'X', 'growing', 'stable', 'low', 4.0,
    )
    expect(result).toContain('artış')
  })

  it('contains Turkish trend label for "declining"', () => {
    const result = generateDemandForecastNarrative(
      'X', 'declining', 'stable', 'low', 4.0,
    )
    expect(result).toContain('düşüş')
  })

  it('contains Turkish risk label for "critical"', () => {
    const result = generateDemandForecastNarrative(
      'X', 'stable', 'volatile', 'critical', 0.5,
    )
    expect(result).toContain('kritik')
  })

  it('handles null coverageMonths gracefully', () => {
    const result = generateDemandForecastNarrative(
      'X', 'stable', 'no_data', 'no_data', null,
    )
    expect(result).toContain('bilinmeyen')
  })

  it('mentions coverage months in output', () => {
    const result = generateDemandForecastNarrative(
      'X', 'stable', 'stable', 'low', 5.0,
    )
    expect(result).toContain('5.0')
  })
})
