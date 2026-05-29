// ─────────────────────────────────────────────────────────────────────────────
// tests/profitability-attribution.test.ts
//
// Unit tests for all pure functions in profitability-attribution.service.ts:
//   - computeAttributionShare              (4 tests)
//   - computeAttributionMarginLift         (5 tests)
//   - computeParetoAttribution             (9 tests)
//   - computeTimeSeriesAttribution         (9 tests)
//   - computeAttributionGini               (8 tests)
//   - identifyProfitDragDimensions         (6 tests)
//   Total: 41 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeAttributionShare,
  computeAttributionMarginLift,
  computeParetoAttribution,
  computeTimeSeriesAttribution,
  computeAttributionGini,
  identifyProfitDragDimensions,
} from '../lib/services/finance/profitability-attribution.service'

// ── computeAttributionShare ───────────────────────────────────────────────────

describe('computeAttributionShare', () => {
  it('normal: returns dimensionRevenue / totalRevenue × 100', () => {
    // 25_000 / 100_000 × 100 = 25
    expect(computeAttributionShare(25_000, 100_000)).toBeCloseTo(25)
  })

  it('returns 100 when dimension equals total', () => {
    expect(computeAttributionShare(50_000, 50_000)).toBeCloseTo(100)
  })

  it('returns null when totalRevenue === 0', () => {
    expect(computeAttributionShare(1_000, 0)).toBeNull()
  })

  it('small share: 5_000 / 200_000 = 2.5%', () => {
    expect(computeAttributionShare(5_000, 200_000)).toBeCloseTo(2.5)
  })
})

// ── computeAttributionMarginLift ──────────────────────────────────────────────

describe('computeAttributionMarginLift', () => {
  it('above average → positive lift', () => {
    // 45 - 30 = 15
    expect(computeAttributionMarginLift(45, 30)).toBeCloseTo(15)
  })

  it('below average → negative lift (drag)', () => {
    // 20 - 30 = -10
    expect(computeAttributionMarginLift(20, 30)).toBeCloseTo(-10)
  })

  it('equal → zero lift', () => {
    expect(computeAttributionMarginLift(30, 30)).toBeCloseTo(0)
  })

  it('dimensionMarginPct null → null', () => {
    expect(computeAttributionMarginLift(null, 30)).toBeNull()
  })

  it('totalMarginPct null → null', () => {
    expect(computeAttributionMarginLift(30, null)).toBeNull()
  })
})

// ── computeParetoAttribution ──────────────────────────────────────────────────

describe('computeParetoAttribution', () => {
  const dims = [
    { name: 'Electronics',   revenue: 50_000, margin: 20_000 },
    { name: 'Clothing',      revenue: 30_000, margin: 12_000 },
    { name: 'Food',          revenue: 10_000, margin: 3_000  },
    { name: 'Accessories',   revenue:  5_000, margin: 1_000  },
    { name: 'Misc',          revenue:  5_000, margin: 500    },
  ]
  // Total margin: 36_500. 80% = 29_200

  it('returns sorted by margin descending', () => {
    const result = computeParetoAttribution(dims)
    expect(result[0].name).toBe('Electronics')   // highest margin: 20_000
    expect(result[1].name).toBe('Clothing')       // 12_000
    expect(result[4].name).toBe('Misc')           // lowest: 500
  })

  it('revenue_pct sums to 100', () => {
    const result = computeParetoAttribution(dims)
    const sum = result.reduce((s, r) => s + r.revenue_pct, 0)
    expect(sum).toBeCloseTo(100)
  })

  it('cumulative_revenue_pct increases monotonically', () => {
    const result = computeParetoAttribution(dims)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].cumulative_revenue_pct).toBeGreaterThan(result[i-1].cumulative_revenue_pct)
    }
  })

  it('is_pareto_80 true for top contributors covering 80% margin', () => {
    const result = computeParetoAttribution(dims)
    // Electronics=20000 (54.8%), Clothing=12000 (54.8%+32.9%=87.7%)
    // So Electronics alone has prior_cum=0 < 80 → included
    // Clothing: prior_cum = 20000/36500 × 100 ≈ 54.8% < 80 → included
    // Food: prior_cum ≈ 87.7% >= 80 → excluded
    expect(result[0].is_pareto_80).toBe(true)
    expect(result[1].is_pareto_80).toBe(true)
    expect(result[2].is_pareto_80).toBe(false)
    expect(result[3].is_pareto_80).toBe(false)
    expect(result[4].is_pareto_80).toBe(false)
  })

  it('returns empty array for empty input', () => {
    expect(computeParetoAttribution([])).toEqual([])
  })

  it('margin_pct is null when total margin is 0', () => {
    const zeroMarginDims = [
      { name: 'A', revenue: 100, margin: 0 },
      { name: 'B', revenue: 200, margin: 0 },
    ]
    const result = computeParetoAttribution(zeroMarginDims)
    result.forEach(r => expect(r.margin_pct).toBeNull())
  })

  it('single item: is_pareto_80 is true, cumulative_revenue_pct = 100', () => {
    const result = computeParetoAttribution([{ name: 'Only', revenue: 100, margin: 50 }])
    expect(result).toHaveLength(1)
    expect(result[0].is_pareto_80).toBe(true)
    expect(result[0].cumulative_revenue_pct).toBeCloseTo(100)
  })

  it('revenue_pct correct: 50_000 / 100_000 = 50%', () => {
    const result = computeParetoAttribution(dims)
    const electronics = result.find(r => r.name === 'Electronics')!
    expect(electronics.revenue_pct).toBeCloseTo(50)
  })

  it('margin_pct correct: 20_000 / 36_500 × 100 ≈ 54.8%', () => {
    const result = computeParetoAttribution(dims)
    const electronics = result.find(r => r.name === 'Electronics')!
    expect(electronics.margin_pct).toBeCloseTo((20_000 / 36_500) * 100, 1)
  })
})

// ── computeTimeSeriesAttribution ──────────────────────────────────────────────

describe('computeTimeSeriesAttribution', () => {
  const months = [
    { month: '2024-01', revenue: 100_000, gross_margin: 30_000 },  // 30%
    { month: '2024-02', revenue: 120_000, gross_margin: 40_000 },  // 33.3%
    { month: '2024-03', revenue: 80_000,  gross_margin: 15_000 },  // 18.75% — trough
    { month: '2024-04', revenue: 150_000, gross_margin: 60_000 },  // 40% — peak
    { month: '2024-05', revenue: 110_000, gross_margin: 33_000 },  // 30%
  ]

  it('returns same count as input', () => {
    const result = computeTimeSeriesAttribution(months)
    expect(result).toHaveLength(5)
  })

  it('first month revenue_mom_pct is null', () => {
    const result = computeTimeSeriesAttribution(months)
    expect(result[0].revenue_mom_pct).toBeNull()
  })

  it('first month margin_mom_pct is null', () => {
    const result = computeTimeSeriesAttribution(months)
    expect(result[0].margin_mom_pct).toBeNull()
  })

  it('second month revenue_mom_pct: (120k-100k)/100k × 100 = 20%', () => {
    const result = computeTimeSeriesAttribution(months)
    expect(result[1].revenue_mom_pct).toBeCloseTo(20)
  })

  it('is_peak_month correct: 2024-04 has highest margin_pct (40%)', () => {
    const result = computeTimeSeriesAttribution(months)
    const peak = result.find(m => m.is_peak_month)
    expect(peak?.month).toBe('2024-04')
  })

  it('is_trough_month correct: 2024-03 has lowest margin_pct (18.75%)', () => {
    const result = computeTimeSeriesAttribution(months)
    const trough = result.find(m => m.is_trough_month)
    expect(trough?.month).toBe('2024-03')
  })

  it('margin_pct: 30_000 / 100_000 × 100 = 30', () => {
    const result = computeTimeSeriesAttribution(months)
    expect(result[0].margin_pct).toBeCloseTo(30)
  })

  it('margin_mom_pct: 33.3 - 30 ≈ 3.3 for month 2', () => {
    const result = computeTimeSeriesAttribution(months)
    // feb margin_pct = 40k/120k*100 ≈ 33.33, jan = 30 → diff ≈ 3.33
    expect(result[1].margin_mom_pct).toBeCloseTo(33.33 - 30, 1)
  })

  it('returns empty array for empty input', () => {
    expect(computeTimeSeriesAttribution([])).toEqual([])
  })
})

// ── computeAttributionGini ────────────────────────────────────────────────────

describe('computeAttributionGini', () => {
  it('perfect equality (all same values) → 0', () => {
    // [10, 10, 10, 10] → Gini = 0
    const result = computeAttributionGini([10, 10, 10, 10])
    expect(result).toBeCloseTo(0, 5)
  })

  it('maximum concentration (one non-zero) → (n-1)/n for n=4', () => {
    // [0, 0, 0, 100] → sorted ascending
    // Gini = (2 × (1×0 + 2×0 + 3×0 + 4×100)) / (4 × 100) - (4+1)/4
    //      = (2 × 400) / 400 - 5/4 = 2 - 1.25 = 0.75
    const result = computeAttributionGini([0, 0, 0, 100])
    expect(result).toBeCloseTo(0.75, 2)
  })

  it('null for single value (< 2 values)', () => {
    expect(computeAttributionGini([50])).toBeNull()
  })

  it('null for empty array', () => {
    expect(computeAttributionGini([])).toBeNull()
  })

  it('null when total is 0', () => {
    expect(computeAttributionGini([0, 0, 0])).toBeNull()
  })

  it('two equal values → 0', () => {
    const result = computeAttributionGini([50, 50])
    expect(result).toBeCloseTo(0, 5)
  })

  it('two unequal values → between 0 and 1', () => {
    const result = computeAttributionGini([10, 90])
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('result always clamped to [0, 1]', () => {
    const result = computeAttributionGini([1, 10, 100, 1000])
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })
})

// ── identifyProfitDragDimensions ──────────────────────────────────────────────

describe('identifyProfitDragDimensions', () => {
  const totalRevenue = 200_000

  const dims = [
    // Significant (>5%) and well below average margin → drag
    { name: 'Electronics',   margin_pct: 10,   revenue: 60_000 },  // 30% share, margin 10 vs 30 → drag
    // Significant but above average → NOT a drag
    { name: 'Clothing',      margin_pct: 40,   revenue: 50_000 },  // 25% share, margin 40 vs 30
    // Below significance threshold → NOT a drag
    { name: 'Food',          margin_pct: 5,    revenue: 8_000  },  // 4% share < 5% threshold
    // Significant, null margin → included as drag
    { name: 'Unknown',       margin_pct: null, revenue: 40_000 },  // 20% share, null margin → drag
    // Significant but only slightly below average (not > 5 ppt drag) → NOT a drag
    { name: 'Accessories',   margin_pct: 26,   revenue: 42_000 },  // 21% share, margin 26 vs 30 = 4 ppt < 5 threshold
  ]

  const totalMarginPct = 30

  it('identifies electronics as drag (10% vs 30% avg = 20 ppt drag)', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    const names = result.map(r => r.name)
    expect(names).toContain('Electronics')
  })

  it('includes null-margin dimension as drag when above revenue threshold', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    const names = result.map(r => r.name)
    expect(names).toContain('Unknown')
  })

  it('excludes clothing (above average margin)', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    const names = result.map(r => r.name)
    expect(names).not.toContain('Clothing')
  })

  it('excludes food (below significance threshold)', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    const names = result.map(r => r.name)
    expect(names).not.toContain('Food')
  })

  it('excludes accessories (only 4 ppt below threshold, not > 5)', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    const names = result.map(r => r.name)
    expect(names).not.toContain('Accessories')
  })

  it('sorted by drag_magnitude descending (electronics has bigger drag than unknown)', () => {
    const result = identifyProfitDragDimensions(dims, totalMarginPct)
    // Electronics drag_magnitude = 30 - 10 = 20, Unknown drag_magnitude = null
    // null sorted last, so Electronics first
    expect(result[0].name).toBe('Electronics')
  })
})
