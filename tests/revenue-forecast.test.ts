/**
 * Revenue Forecast — unit tests
 *
 * Tests pure computation logic of RevenueForecastService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeLinearForecast,
  computeRSquared,
  computeBlendedForecast,
  computeConfidenceInterval,
  buildSummaryLine,
} from '../lib/services/finance/revenue-forecast.service'

// ── computeLinearForecast ─────────────────────────────────────────────────────

describe('computeLinearForecast — pure', () => {

  // Test 1: ascending series extrapolates correctly
  it('1. ascending [100..150] × 1 → ~160', () => {
    const result = computeLinearForecast([100, 110, 120, 130, 140, 150], 1)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(160, 0)
  })

  // Test 2: ascending × 2
  it('2. ascending [100..150] × 2 → ~170', () => {
    const result = computeLinearForecast([100, 110, 120, 130, 140, 150], 2)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(170, 0)
  })

  // Test 3: ascending × 3
  it('3. ascending [100..150] × 3 → ~180', () => {
    const result = computeLinearForecast([100, 110, 120, 130, 140, 150], 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(180, 0)
  })

  // Test 4: flat series stays flat
  it('4. flat [100..100] × 2 → 100', () => {
    const result = computeLinearForecast([100, 100, 100, 100, 100, 100], 2)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(100, 0)
  })

  // Test 5: empty array → null
  it('5. empty array → null', () => {
    expect(computeLinearForecast([], 1)).toBeNull()
  })

  // Test 6: single element → null (need ≥2 points)
  it('6. single element → null', () => {
    expect(computeLinearForecast([100], 1)).toBeNull()
  })

  // Test 7: two elements works
  it('7. two elements → extrapolates', () => {
    const result = computeLinearForecast([100, 200], 1)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(200)
  })

  // Test 8: declining series yields a smaller forecast
  it('8. declining series → forecast < last value', () => {
    const result = computeLinearForecast([200, 180, 160, 140, 120, 100], 1)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(100)
  })

})

// ── computeRSquared ───────────────────────────────────────────────────────────

describe('computeRSquared — pure', () => {

  // Test 9: perfect fit → 1.0
  it('9. perfect fit [1,2,3] vs [1,2,3] → 1.0', () => {
    expect(computeRSquared([1, 2, 3], [1, 2, 3])).toBe(1)
  })

  // Test 10: imperfect fit → < 1.0
  it('10. imperfect fit [1,2,3] vs [2,2,2] → < 1.0', () => {
    const r2 = computeRSquared([1, 2, 3], [2, 2, 2])
    expect(r2).toBeLessThan(1)
  })

  // Test 11: constant actuals with same constant predicted → SS_tot=0 → 1.0
  it('11. constant [5,5,5] vs [5,5,5] → handle SS_tot=0 → 1.0', () => {
    expect(computeRSquared([5, 5, 5], [5, 5, 5])).toBe(1.0)
  })

  // Test 12: empty arrays → 0
  it('12. empty arrays → 0', () => {
    expect(computeRSquared([], [])).toBe(0)
  })

  // Test 13: mismatched lengths → 0
  it('13. mismatched lengths → 0', () => {
    expect(computeRSquared([1, 2, 3], [1, 2])).toBe(0)
  })

  // Test 14: R² is always in [0, 1]
  it('14. R² clamped to ≥0 for bad fit', () => {
    const r2 = computeRSquared([1, 2, 3, 4], [4, 3, 2, 1])
    expect(r2).toBeGreaterThanOrEqual(0)
    expect(r2).toBeLessThanOrEqual(1)
  })

})

// ── computeBlendedForecast ────────────────────────────────────────────────────

describe('computeBlendedForecast — pure', () => {

  // Test 15: high R² + strong seasonal → 40/40/20 blend
  it('15. high R² + strong seasonal → 40/40/20 weights', () => {
    // trend=100, seasonal=200, pipeline=300 → blended = 100×0.4 + 200×0.4 + 300×0.2 = 40+80+60=180
    const result = computeBlendedForecast(100, 200, 300, 0.8, 'strong')
    expect(result).toBeCloseTo(180, 0)
  })

  // Test 16: high R² + weak seasonal → 60/40 (trend/pipeline)
  it('16. high R² + weak seasonal → 60% trend + 40% pipeline (seasonal zeroed)', () => {
    // trend=100, seasonal=999 (ignored), pipeline=200 → 100×0.6 + 200×0.4 = 60+80=140
    const result = computeBlendedForecast(100, null, 200, 0.8, 'weak')
    expect(result).toBeCloseTo(140, 0)
  })

  // Test 17: low R² → 30/20/50 blend
  it('17. low R² → 30% trend + 20% seasonal + 50% pipeline', () => {
    // trend=100, seasonal=100, pipeline=100 → all same → 100
    const result = computeBlendedForecast(100, 100, 100, 0.5, 'strong')
    expect(result).toBeCloseTo(100, 0)
  })

  // Test 18: pipeline null → redistributed to trend + seasonal
  it('18. pipeline null → weight redistributed to trend + seasonal', () => {
    // high R² + strong seasonal → normally 40/40/20
    // pipeline null → redistribute 20% equally → 50% trend + 50% seasonal
    // trend=100, seasonal=200, pipeline=null → 100×0.5 + 200×0.5 = 150
    const result = computeBlendedForecast(100, 200, null, 0.8, 'strong')
    expect(result).toBeCloseTo(150, 0)
  })

  // Test 19: all nulls → 0
  it('19. all null inputs → 0', () => {
    const result = computeBlendedForecast(null, null, null, 0.5, 'weak')
    expect(result).toBe(0)
  })

  // Test 20: result is never negative
  it('20. negative trend but pipeline positive → result ≥ 0', () => {
    const result = computeBlendedForecast(-500, null, 100, 0.8, 'weak')
    expect(result).toBeGreaterThanOrEqual(0)
  })

})

// ── computeConfidenceInterval ─────────────────────────────────────────────────

describe('computeConfidenceInterval — pure', () => {

  // Test 21: 1000 → { low: 800, high: 1200 }
  it('21. 1000 → { low: 800, high: 1200 }', () => {
    const ci = computeConfidenceInterval(1000)
    expect(ci.low).toBe(800)
    expect(ci.high).toBe(1200)
  })

  // Test 22: 0 → { low: 0, high: 0 }
  it('22. 0 → { low: 0, high: 0 }', () => {
    const ci = computeConfidenceInterval(0)
    expect(ci.low).toBe(0)
    expect(ci.high).toBe(0)
  })

  // Test 23: 500 → { low: 400, high: 600 }
  it('23. 500 → { low: 400, high: 600 }', () => {
    const ci = computeConfidenceInterval(500)
    expect(ci.low).toBe(400)
    expect(ci.high).toBe(600)
  })

})

// ── buildSummaryLine ──────────────────────────────────────────────────────────

describe('buildSummaryLine — pure', () => {

  // Test 24: returns non-empty Turkish string
  it('24. returns non-empty Turkish string', () => {
    const result = buildSummaryLine(300000, 5.5, '2026-05')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  // Test 25: includes positive growth direction
  it('25. positive growth → contains "artış"', () => {
    const result = buildSummaryLine(300000, 5.5, '2026-05')
    expect(result).toContain('artış')
  })

  // Test 26: negative growth direction
  it('26. negative growth → contains "düşüş"', () => {
    const result = buildSummaryLine(200000, -10.3, '2026-05')
    expect(result).toContain('düşüş')
  })

})
