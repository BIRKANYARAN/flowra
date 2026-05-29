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

  it('returns null when both actual and reference are null', () => {
    expect(computeVariancePct(null, null)).toBeNull()
  })

  it('handles 100% positive variance (actual = 2× reference)', () => {
    expect(computeVariancePct(200, 100)).toBe(100)
  })

  it('handles 100% negative variance (actual = 0)', () => {
    expect(computeVariancePct(0, 100)).toBe(-100)
  })

  it('handles fractional result rounded to 2 decimals', () => {
    // (103 - 100) / 100 = 3.00
    expect(computeVariancePct(103, 100)).toBe(3)
  })

  it('handles very small reference value (1)', () => {
    // (11 - 1) / 1 = 1000%
    expect(computeVariancePct(11, 1)).toBe(1000)
  })

  it('returns null when reference is undefined (treated as null)', () => {
    // @ts-expect-error testing runtime behavior
    expect(computeVariancePct(110, undefined)).toBeNull()
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

  it('returns "neutral" for 0 variance on revenue metric', () => {
    expect(classifyVarianceDirection(0, false)).toBe('neutral')
  })

  it('returns "neutral" for 0 variance on cost metric', () => {
    expect(classifyVarianceDirection(0, true)).toBe('neutral')
  })

  it('returns "unfavorable" at exactly -1.0 for revenue (just at threshold)', () => {
    expect(classifyVarianceDirection(-1.0, false)).toBe('unfavorable')
  })

  it('returns "favorable" at exactly -1.0 for cost metric', () => {
    expect(classifyVarianceDirection(-1.0, true)).toBe('favorable')
  })

  it('handles large positive variance as favorable on revenue', () => {
    expect(classifyVarianceDirection(999, false)).toBe('favorable')
  })

  it('handles large negative variance as favorable on cost', () => {
    expect(classifyVarianceDirection(-999, true)).toBe('favorable')
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

  it('returns 100 for all perfect forecasts', () => {
    expect(computeForecastAccuracy([0, 0, 0])).toBe(100)
  })

  it('handles negative variance pct — uses absolute value for accuracy', () => {
    // |-10| = 10, accuracy = 90
    const result = computeForecastAccuracy([-10])
    expect(result).toBe(90)
  })

  it('clamps at 0 for negative deviation beyond 100', () => {
    // |-150| = 150, max(0, 100 - 150) = 0
    const result = computeForecastAccuracy([-150])
    expect(result).toBe(0)
  })

  it('mixed null and valid array uses only valid entries', () => {
    // [20, null, 40] → accuracies = [80, 60] → avg = 70
    const result = computeForecastAccuracy([20, null, 40])
    expect(result).toBeCloseTo(70, 1)
  })

  it('single 50% variance → accuracy = 50', () => {
    expect(computeForecastAccuracy([50])).toBe(50)
  })

  it('handles single null in an otherwise valid array correctly', () => {
    // [5, null, 15] → [95, 85] → avg = 90
    const result = computeForecastAccuracy([5, null, 15])
    expect(result).toBeCloseTo(90, 1)
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

  it('budget_vs_forecast_pct is computed independently of actual', () => {
    const cell = buildVarianceCell(null, 110, 100, false)
    // (110 - 100) / 100 = 10
    expect(cell.budget_vs_forecast_pct).toBe(10)
  })

  it('all three variances are null when budget and forecast are 0', () => {
    const cell = buildVarianceCell(100, 0, 0, false)
    expect(cell.actual_vs_budget_pct).toBeNull()
    expect(cell.actual_vs_forecast_pct).toBeNull()
    expect(cell.budget_vs_forecast_pct).toBeNull()
  })

  it('cost metric: actual > budget is unfavorable', () => {
    const cell = buildVarianceCell(120, 100, 100, true)
    expect(cell.actual_vs_budget_dir).toBe('unfavorable')
    expect(cell.actual_vs_forecast_dir).toBe('unfavorable')
  })

  it('revenue metric: actual < budget is unfavorable', () => {
    const cell = buildVarianceCell(80, 100, 100, false)
    expect(cell.actual_vs_budget_dir).toBe('unfavorable')
    expect(cell.actual_vs_forecast_dir).toBe('unfavorable')
  })

  it('exact match (actual = budget) produces neutral direction', () => {
    const cell = buildVarianceCell(100, 100, 100, false)
    // 0% variance → neutral
    expect(cell.actual_vs_budget_dir).toBe('neutral')
    expect(cell.actual_vs_forecast_dir).toBe('neutral')
  })

  it('stores actual, budget, forecast as-is', () => {
    const cell = buildVarianceCell(50_000, 45_000, 48_000, false)
    expect(cell.actual).toBe(50_000)
    expect(cell.budget).toBe(45_000)
    expect(cell.forecast).toBe(48_000)
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

  it('cost metric: sum of actuals below budget is favorable', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(40, 50, null, true),
      buildVarianceCell(40, 50, null, true),
    ]
    const ytd = aggregateYtd(cells, true)
    // 80 vs 100 → -20% → favorable for cost
    expect(ytd.actual_vs_budget_dir).toBe('favorable')
  })

  it('cost metric: sum of actuals above budget is unfavorable', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(60, 50, null, true),
      buildVarianceCell(60, 50, null, true),
    ]
    const ytd = aggregateYtd(cells, true)
    // 120 vs 100 → +20% → unfavorable for cost
    expect(ytd.actual_vs_budget_dir).toBe('unfavorable')
  })

  it('handles single cell aggregation (identity case)', () => {
    const cell = buildVarianceCell(100, 90, 95, false)
    const cells: VarianceCell[] = [cell]
    const ytd = aggregateYtd(cells, false)
    expect(ytd.actual).toBe(100)
    expect(ytd.budget).toBe(90)
    expect(ytd.forecast).toBe(95)
  })

  it('all-null actuals: ytd actual is null', () => {
    const cells: VarianceCell[] = [
      buildVarianceCell(null, 100, null, false),
      buildVarianceCell(null, 200, null, false),
    ]
    const ytd = aggregateYtd(cells, false)
    expect(ytd.actual).toBeNull()
    expect(ytd.budget).toBe(300)
  })

  it('aggregates 12 months correctly', () => {
    const cells: VarianceCell[] = Array.from({ length: 12 }, () =>
      buildVarianceCell(10_000, 10_000, 10_000, false),
    )
    const ytd = aggregateYtd(cells, false)
    expect(ytd.actual).toBe(120_000)
    expect(ytd.budget).toBe(120_000)
    expect(ytd.forecast).toBe(120_000)
    expect(ytd.actual_vs_budget_dir).toBe('neutral')
  })
})
