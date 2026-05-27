/**
 * Variance Analysis — pure computation tests.
 *
 * Scope: pure kernel functions — no DB, no I/O.
 *
 * Run with: npx vitest run tests/variance-analysis.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeVariancePct,
  classifyVarianceDirection,
  computeForecastAccuracy,
  buildVarianceCell,
  aggregateYtd,
  type VarianceCell,
} from '../lib/services/planning/variance-analysis.service'

// ── computeVariancePct ────────────────────────────────────────────────────────

describe('computeVariancePct', () => {
  it('returns 10 when actual=110, reference=100', () => {
    expect(computeVariancePct(110, 100)).toBe(10)
  })

  it('returns -10 when actual=90, reference=100', () => {
    expect(computeVariancePct(90, 100)).toBe(-10)
  })

  it('returns null when actual is null', () => {
    expect(computeVariancePct(null, 100)).toBeNull()
  })

  it('returns null when reference is null', () => {
    expect(computeVariancePct(110, null)).toBeNull()
  })

  it('returns null when reference is 0 (div by zero guard)', () => {
    expect(computeVariancePct(110, 0)).toBeNull()
  })

  it('returns 0 when actual === reference', () => {
    expect(computeVariancePct(100, 100)).toBe(0)
  })

  it('handles negative reference correctly', () => {
    // (90 - (-100)) / |-100| * 100 = (90 + 100) / 100 * 100 = 190
    expect(computeVariancePct(90, -100)).toBe(190)
  })

  it('handles large numbers with rounding', () => {
    // (1_000_000 - 900_000) / 900_000 × 100 = 11.11...
    const result = computeVariancePct(1_000_000, 900_000)
    expect(result).toBeCloseTo(11.11, 1)
  })
})

// ── classifyVarianceDirection ─────────────────────────────────────────────────

describe('classifyVarianceDirection', () => {
  it('returns "favorable" for positive variance on revenue metric', () => {
    expect(classifyVarianceDirection(10, false)).toBe('favorable')
  })

  it('returns "unfavorable" for positive variance on cost metric', () => {
    expect(classifyVarianceDirection(10, true)).toBe('unfavorable')
  })

  it('returns "favorable" for negative variance on cost metric', () => {
    expect(classifyVarianceDirection(-10, true)).toBe('favorable')
  })

  it('returns "unfavorable" for negative variance on revenue metric', () => {
    expect(classifyVarianceDirection(-10, false)).toBe('unfavorable')
  })

  it('returns "neutral" for |pct| < 1 on revenue metric', () => {
    expect(classifyVarianceDirection(0.5, false)).toBe('neutral')
  })

  it('returns "neutral" for |pct| < 1 on cost metric', () => {
    expect(classifyVarianceDirection(-0.5, true)).toBe('neutral')
  })

  it('returns "no_data" when variancePct is null', () => {
    expect(classifyVarianceDirection(null, false)).toBe('no_data')
  })

  it('returns "neutral" exactly at boundary 0.99', () => {
    expect(classifyVarianceDirection(0.99, false)).toBe('neutral')
  })

  it('returns "favorable" at exactly 1.0 for revenue', () => {
    expect(classifyVarianceDirection(1.0, false)).toBe('favorable')
  })
})

// ── computeForecastAccuracy ───────────────────────────────────────────────────

describe('computeForecastAccuracy', () => {
  it('returns correct average: [10, -5, 20] → avg(90, 95, 80) = 88.33', () => {
    const result = computeForecastAccuracy([10, -5, 20])
    expect(result).toBeCloseTo(88.33, 1)
  })

  it('returns null for empty array', () => {
    expect(computeForecastAccuracy([])).toBeNull()
  })

  it('returns null when all values are null', () => {
    expect(computeForecastAccuracy([null, null, null])).toBeNull()
  })

  it('ignores null values in the array', () => {
    // Only [10] valid → accuracy = 90
    const result = computeForecastAccuracy([10, null, null])
    expect(result).toBe(90)
  })

  it('clamps accuracy at 0 for very large deviations', () => {
    // |150| > 100, so max(0, 100 - 150) = 0
    const result = computeForecastAccuracy([150])
    expect(result).toBe(0)
  })

  it('returns 100 for perfect forecast (0% variance)', () => {
    expect(computeForecastAccuracy([0])).toBe(100)
  })
})

// ── buildVarianceCell ─────────────────────────────────────────────────────────

describe('buildVarianceCell', () => {
  it('builds correct cell for revenue metric (non-cost)', () => {
    const cell = buildVarianceCell(110, 100, 105, false)
    expect(cell.actual).toBe(110)
    expect(cell.budget).toBe(100)
    expect(cell.forecast).toBe(105)
    expect(cell.actual_vs_budget_pct).toBe(10)
    expect(cell.actual_vs_forecast_pct).toBeCloseTo(4.76, 1)
    expect(cell.actual_vs_budget_dir).toBe('favorable')
    expect(cell.actual_vs_forecast_dir).toBe('favorable')
  })

  it('builds correct cell for cost metric', () => {
    // Actual costs less than budget = favorable
    const cell = buildVarianceCell(90, 100, 100, true)
    expect(cell.actual_vs_budget_pct).toBe(-10)
    expect(cell.actual_vs_budget_dir).toBe('favorable')
  })

  it('handles null actual gracefully', () => {
    const cell = buildVarianceCell(null, 100, 105, false)
    expect(cell.actual).toBeNull()
    expect(cell.actual_vs_budget_pct).toBeNull()
    expect(cell.actual_vs_budget_dir).toBe('no_data')
    expect(cell.actual_vs_forecast_dir).toBe('no_data')
  })

  it('handles all nulls gracefully', () => {
    const cell = buildVarianceCell(null, null, null, false)
    expect(cell.actual_vs_budget_pct).toBeNull()
    expect(cell.actual_vs_forecast_pct).toBeNull()
    expect(cell.budget_vs_forecast_pct).toBeNull()
  })
})

// ── aggregateYtd ──────────────────────────────────────────────────────────────

describe('aggregateYtd', () => {
  it('sums actuals and budgets before computing variance', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(100, 110, null, false),
      buildVarianceCell(200, 220, null, false),
    ]
    const ytd = aggregateYtd(cells, false)
    // actual sum = 300, budget sum = 330
    expect(ytd.actual).toBe(300)
    expect(ytd.budget).toBe(330)
    // variance = (300 - 330) / 330 * 100 ≈ -9.09
    expect(ytd.actual_vs_budget_pct).toBeCloseTo(-9.09, 1)
    // Unfavorable because revenue metric and negative
    expect(ytd.actual_vs_budget_dir).toBe('unfavorable')
  })

  it('aggregates forecast values too', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(100, 100, 95, false),
      buildVarianceCell(200, 200, 190, false),
    ]
    const ytd = aggregateYtd(cells, false)
    expect(ytd.forecast).toBe(285)
    expect(ytd.actual).toBe(300)
  })

  it('handles partial nulls in monthly cells', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(100, null, null, false),
      buildVarianceCell(200, 180, null, false),
    ]
    const ytd = aggregateYtd(cells, false)
    expect(ytd.actual).toBe(300)
    expect(ytd.budget).toBe(180)
    expect(ytd.forecast).toBeNull()
  })

  it('returns no_data for all directions when no actual/budget', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(null, null, null, false),
    ]
    const ytd = aggregateYtd(cells, false)
    expect(ytd.actual_vs_budget_dir).toBe('no_data')
    expect(ytd.actual_vs_forecast_dir).toBe('no_data')
  })
})
