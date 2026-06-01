// Node-env tests for the pure forecasting math in revenue-forecast.service.ts
// (OLS linear forecast, R² goodness-of-fit, ±20% confidence band). Previously
// untested.
import { describe, it, expect } from 'vitest'
import { computeLinearForecast, computeRSquared, computeConfidenceInterval } from '@/lib/services/finance/revenue-forecast.service'

describe('computeLinearForecast (OLS)', () => {
  it('extrapolates a perfectly linear series', () => {
    // slope 10, intercept 10 → next (monthsAhead 1) = 50, monthsAhead 2 = 60
    expect(computeLinearForecast([10, 20, 30, 40], 1)).toBe(50)
    expect(computeLinearForecast([10, 20, 30, 40], 2)).toBe(60)
  })
  it('returns the constant level for a flat series (zero slope)', () => {
    expect(computeLinearForecast([25, 25, 25], 1)).toBe(25)
  })
  it('returns null with fewer than 2 points', () => {
    expect(computeLinearForecast([100], 1)).toBeNull()
    expect(computeLinearForecast([], 3)).toBeNull()
  })
})

describe('computeRSquared', () => {
  it('is 1.0 for a perfect prediction', () => {
    expect(computeRSquared([10, 20, 30], [10, 20, 30])).toBe(1)
  })
  it('is 1.0 for a constant actual series (ssTot = 0)', () => {
    expect(computeRSquared([5, 5, 5], [5, 5, 5])).toBe(1)
  })
  it('clamps to 0 when residual error exceeds total variance', () => {
    // predictions worse than the mean → 1 − ssRes/ssTot < 0 → clamped to 0
    expect(computeRSquared([10, 20, 30], [30, 20, 10])).toBe(0)
  })
  it('returns 0 for empty or length-mismatched inputs', () => {
    expect(computeRSquared([], [])).toBe(0)
    expect(computeRSquared([1, 2], [1])).toBe(0)
  })
})

describe('computeConfidenceInterval (±20% band)', () => {
  it('brackets the blended forecast at 80% / 120%', () => {
    expect(computeConfidenceInterval(1000)).toEqual({ low: 800, high: 1200 })
  })
})
