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

// ── Additional computeAttributionShare tests ──────────────────────────────────

describe('computeAttributionShare — additional', () => {
  it('very small dimension → very small percentage', () => {
    expect(computeAttributionShare(100, 1_000_000)).toBeCloseTo(0.01)
  })

  it('dimension equals total → 100%', () => {
    expect(computeAttributionShare(75_000, 75_000)).toBeCloseTo(100)
  })

  it('dimension greater than total (not physically possible but math works)', () => {
    // 120 / 100 × 100 = 120%
    expect(computeAttributionShare(120_000, 100_000)).toBeCloseTo(120)
  })

  it('zero dimension, positive total → 0%', () => {
    expect(computeAttributionShare(0, 100_000)).toBeCloseTo(0)
  })

  it('both zero → null (totalRevenue = 0)', () => {
    expect(computeAttributionShare(0, 0)).toBeNull()
  })
})

// ── Additional computeAttributionMarginLift tests ─────────────────────────────

describe('computeAttributionMarginLift — additional', () => {
  it('both null → null', () => {
    expect(computeAttributionMarginLift(null, null)).toBeNull()
  })

  it('negative dimension margin vs positive total → large negative lift', () => {
    // -10 - 30 = -40
    expect(computeAttributionMarginLift(-10, 30)).toBeCloseTo(-40)
  })

  it('both negative: dimension less negative than total → positive lift', () => {
    // -5 - (-20) = 15
    expect(computeAttributionMarginLift(-5, -20)).toBeCloseTo(15)
  })

  it('dimension margin zero vs positive total', () => {
    expect(computeAttributionMarginLift(0, 25)).toBeCloseTo(-25)
  })

  it('large dimension margin above total → large positive lift', () => {
    expect(computeAttributionMarginLift(80, 30)).toBeCloseTo(50)
  })
})

// ── Additional computeParetoAttribution tests ─────────────────────────────────

describe('computeParetoAttribution — additional', () => {
  it('two items: higher margin is pareto_80 first', () => {
    const dims = [
      { name: 'Low',  revenue: 50_000, margin: 5_000  },
      { name: 'High', revenue: 50_000, margin: 45_000 },
    ]
    const result = computeParetoAttribution(dims)
    expect(result[0].name).toBe('High')   // sorted by margin desc
    expect(result[0].is_pareto_80).toBe(true)
  })

  it('single item with positive margin: cumulative_revenue_pct = 100', () => {
    const result = computeParetoAttribution([{ name: 'Solo', revenue: 10_000, margin: 5_000 }])
    expect(result[0].cumulative_revenue_pct).toBeCloseTo(100)
    expect(result[0].is_pareto_80).toBe(true)
  })

  it('all items equally profitable → pareto_80 covers first few', () => {
    // 5 items, each with margin 1000 and revenue 1000. Total margin=5000. 80% = 4000.
    // Each: cumulative up to i: 1000i/5000*100. Prior < 80% for first 4 items.
    const dims = Array.from({ length: 5 }, (_, i) => ({ name: `C${i}`, revenue: 1000, margin: 1000 }))
    const result = computeParetoAttribution(dims)
    // prior_cumulative for first item = 0 < 80 → true
    // for item 5: prior_cum = 4000/5000×100 = 80 → not < 80 → false
    const pareto_items = result.filter(r => r.is_pareto_80)
    expect(pareto_items.length).toBe(4)
  })

  it('item with negative margin is sorted last (lowest margin)', () => {
    const dims = [
      { name: 'Pos',  revenue: 10_000, margin: 5_000  },
      { name: 'Neg',  revenue: 10_000, margin: -1_000 },
      { name: 'Mid',  revenue: 10_000, margin: 2_000  },
    ]
    const result = computeParetoAttribution(dims)
    expect(result[result.length - 1].name).toBe('Neg')
  })

  it('revenue_pct is proportional to revenue share', () => {
    const dims = [
      { name: 'Big',   revenue: 80_000, margin: 20_000 },
      { name: 'Small', revenue: 20_000, margin: 5_000  },
    ]
    const result = computeParetoAttribution(dims)
    const big   = result.find(r => r.name === 'Big')!
    const small = result.find(r => r.name === 'Small')!
    expect(big.revenue_pct).toBeCloseTo(80)
    expect(small.revenue_pct).toBeCloseTo(20)
  })

  it('margin_pct is proportional to margin share', () => {
    const dims = [
      { name: 'X', revenue: 10_000, margin: 6_000 },
      { name: 'Y', revenue: 10_000, margin: 4_000 },
    ]
    const result = computeParetoAttribution(dims)
    const x = result.find(r => r.name === 'X')!
    const y = result.find(r => r.name === 'Y')!
    expect(x.margin_pct).toBeCloseTo(60)
    expect(y.margin_pct).toBeCloseTo(40)
  })

  it('preserves all original revenue and margin values', () => {
    const dims = [{ name: 'Alpha', revenue: 99_999, margin: 33_333 }]
    const result = computeParetoAttribution(dims)
    expect(result[0].revenue).toBe(99_999)
    expect(result[0].margin).toBe(33_333)
  })

  it('does not mutate input array order', () => {
    const dims = [
      { name: 'A', revenue: 10_000, margin: 1_000 },
      { name: 'B', revenue: 20_000, margin: 8_000 },
    ]
    const originalFirst = dims[0].name
    computeParetoAttribution(dims)
    expect(dims[0].name).toBe(originalFirst)
  })
})

// ── Additional computeTimeSeriesAttribution tests ─────────────────────────────

describe('computeTimeSeriesAttribution — additional', () => {
  it('single month: no MoM stats, is_peak and is_trough both true', () => {
    const result = computeTimeSeriesAttribution([{ month: '2024-01', revenue: 100_000, gross_margin: 30_000 }])
    expect(result).toHaveLength(1)
    expect(result[0].revenue_mom_pct).toBeNull()
    expect(result[0].margin_mom_pct).toBeNull()
    expect(result[0].is_peak_month).toBe(true)
    expect(result[0].is_trough_month).toBe(true)
  })

  it('all same margin → all months share peak status (first found wins as peak)', () => {
    const months = [
      { month: '2024-01', revenue: 100_000, gross_margin: 30_000 },
      { month: '2024-02', revenue: 100_000, gross_margin: 30_000 },
    ]
    const result = computeTimeSeriesAttribution(months)
    // Peak and trough both point to first found (since all equal, reduce keeps first tied)
    const peakCount   = result.filter(m => m.is_peak_month).length
    const troughCount = result.filter(m => m.is_trough_month).length
    expect(peakCount).toBe(1)
    expect(troughCount).toBe(1)
  })

  it('revenue_mom_pct: revenue dropped 50% → -50%', () => {
    const months = [
      { month: '2024-01', revenue: 200_000, gross_margin: 60_000 },
      { month: '2024-02', revenue: 100_000, gross_margin: 30_000 },
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result[1].revenue_mom_pct).toBeCloseTo(-50)
  })

  it('margin_mom_pct: margin % improved by 5pp', () => {
    // Jan: 30k/100k = 30%, Feb: 42k/120k = 35%
    const months = [
      { month: '2024-01', revenue: 100_000, gross_margin: 30_000 },
      { month: '2024-02', revenue: 120_000, gross_margin: 42_000 },
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result[1].margin_mom_pct).toBeCloseTo(5)
  })

  it('zero revenue month has null margin_pct', () => {
    const months = [
      { month: '2024-01', revenue: 0, gross_margin: 0 },
      { month: '2024-02', revenue: 100_000, gross_margin: 30_000 },
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result[0].margin_pct).toBeNull()
    expect(result[1].margin_pct).toBeCloseTo(30)
  })

  it('prior month has zero revenue → revenue_mom_pct is null for next month', () => {
    const months = [
      { month: '2024-01', revenue: 0, gross_margin: 0 },
      { month: '2024-02', revenue: 50_000, gross_margin: 15_000 },
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result[1].revenue_mom_pct).toBeNull()
  })

  it('zero revenue prior month margin_mom_pct: null when prior margin is null', () => {
    const months = [
      { month: '2024-01', revenue: 0, gross_margin: 0 },     // null margin
      { month: '2024-02', revenue: 100_000, gross_margin: 30_000 },  // 30%
    ]
    const result = computeTimeSeriesAttribution(months)
    // prior margin_pct = null → margin_mom_pct = null
    expect(result[1].margin_mom_pct).toBeNull()
  })

  it('correctly assigns peak to highest margin month', () => {
    const months = [
      { month: '2024-01', revenue: 100_000, gross_margin: 20_000 },  // 20%
      { month: '2024-02', revenue: 100_000, gross_margin: 50_000 },  // 50% — peak
      { month: '2024-03', revenue: 100_000, gross_margin: 35_000 },  // 35%
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result.find(m => m.is_peak_month)?.month).toBe('2024-02')
  })

  it('correctly assigns trough to lowest margin month', () => {
    const months = [
      { month: '2024-01', revenue: 100_000, gross_margin: 30_000 },  // 30%
      { month: '2024-02', revenue: 100_000, gross_margin: 10_000 },  // 10% — trough
      { month: '2024-03', revenue: 100_000, gross_margin: 25_000 },  // 25%
    ]
    const result = computeTimeSeriesAttribution(months)
    expect(result.find(m => m.is_trough_month)?.month).toBe('2024-02')
  })
})

// ── Additional computeAttributionGini tests ───────────────────────────────────

describe('computeAttributionGini — additional', () => {
  it('three equal values → 0', () => {
    expect(computeAttributionGini([100, 100, 100])).toBeCloseTo(0)
  })

  it('highly concentrated distribution → close to 1', () => {
    // [1, 1, 1, 1000] → very high gini
    const result = computeAttributionGini([1, 1, 1, 1000])
    expect(result).toBeGreaterThan(0.7)
  })

  it('two values: 90-10 split → gini between 0 and 1', () => {
    const result = computeAttributionGini([90, 10])
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(1)
    // For [10, 90] sorted: (2×(1×10 + 2×90))/(2×100) - 3/2 = (2×190)/200 - 1.5 = 1.9 - 1.5 = 0.4
    expect(result).toBeCloseTo(0.4, 2)
  })

  it('values [0, 100] → gini = 1 (max concentration for 2 elements)', () => {
    // [0, 100]: sum=100; (2×(1×0+2×100))/(2×100) - 3/2 = 400/200 - 1.5 = 2 - 1.5 = 0.5
    // Note: (n-1)/n = 1/2 = 0.5 for n=2 → max is 0.5 not 1.0
    const result = computeAttributionGini([0, 100])
    expect(result).toBeCloseTo(0.5)
  })

  it('result clamped to minimum 0 (never negative)', () => {
    const result = computeAttributionGini([10, 10])
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('large equal array → returns 0', () => {
    const values = Array.from({ length: 20 }, () => 500)
    const result = computeAttributionGini(values)
    expect(result).toBeCloseTo(0)
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

// ── Additional identifyProfitDragDimensions tests ─────────────────────────────

describe('identifyProfitDragDimensions — additional', () => {
  it('empty dimensions → empty result', () => {
    expect(identifyProfitDragDimensions([], 30)).toHaveLength(0)
  })

  it('totalMarginPct null but dimension has null margin_pct + >5% revenue → included', () => {
    const dims = [
      { name: 'Unknown', margin_pct: null, revenue: 60_000 },
    ]
    // totalRevenue = 60k, revenue_pct = 100% > 5 → null margin → include
    const result = identifyProfitDragDimensions(dims, null)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Unknown')
  })

  it('totalMarginPct null, dimension has known margin → excluded (not a drag without reference)', () => {
    const dims = [
      { name: 'KnownMargin', margin_pct: 10, revenue: 60_000 },
    ]
    // totalMarginPct null → filter: margin_pct known & totalMarginPct null → return false
    const result = identifyProfitDragDimensions(dims, null)
    expect(result).toHaveLength(0)
  })

  it('custom significance threshold respected', () => {
    // dimension at 8% revenue share, default threshold 5% → would be included
    // with threshold 10% → excluded
    const dims = [
      { name: 'Borderline', margin_pct: 5, revenue: 8_000 },
    ]
    // total revenue = 8_000, revenue_pct = 100%
    // But let's add more revenue context
    const allDims = [
      { name: 'Borderline', margin_pct: 5, revenue: 8_000 },
      { name: 'Main', margin_pct: 35, revenue: 92_000 },
    ]
    // With default 5%: Borderline = 8% share > 5%, margin 5 < 32-5=27-5=30-5=25 → drag
    const resultDefault = identifyProfitDragDimensions(allDims, 30, 5)
    const namesDefault = resultDefault.map(r => r.name)
    expect(namesDefault).toContain('Borderline')

    // With threshold 10%: 8% < 10% → excluded
    const resultHighThreshold = identifyProfitDragDimensions(allDims, 30, 10)
    const namesHigh = resultHighThreshold.map(r => r.name)
    expect(namesHigh).not.toContain('Borderline')
  })

  it('drag_magnitude is correct: totalMargin - dimensionMargin', () => {
    const dims = [
      { name: 'DragItem', margin_pct: 10, revenue: 50_000 },
    ]
    const result = identifyProfitDragDimensions(dims, 35, 5)
    // 35 - 10 = 25 drag, 10 < 35 - 5 = 30 → drag
    expect(result).toHaveLength(1)
    expect(result[0].drag_magnitude).toBeCloseTo(25)
  })

  it('revenue_pct computed correctly', () => {
    const dims = [
      { name: 'A', margin_pct: 5, revenue: 40_000 },
      { name: 'B', margin_pct: 40, revenue: 60_000 },
    ]
    const result = identifyProfitDragDimensions(dims, 30, 5)
    const a = result.find(r => r.name === 'A')!
    expect(a.revenue_pct).toBeCloseTo(40)
  })

  it('dimension exactly at total margin − 5 ppt → NOT a drag (must be < totalMargin - 5)', () => {
    // totalMarginPct = 30, dimension margin = 25 → diff = 5, condition: margin < total - 5 = 25 → 25 < 25 = false
    const dims = [
      { name: 'Borderline', margin_pct: 25, revenue: 50_000 },
    ]
    const result = identifyProfitDragDimensions(dims, 30, 5)
    expect(result).toHaveLength(0)
  })

  it('multiple drags sorted: largest drag first', () => {
    const dims = [
      { name: 'Big Drag',   margin_pct: 5,  revenue: 40_000 },  // drag = 30-5 = 25
      { name: 'Small Drag', margin_pct: 18, revenue: 30_000 },  // drag = 30-18 = 12
    ]
    const result = identifyProfitDragDimensions(dims, 30, 5)
    expect(result[0].name).toBe('Big Drag')
    expect(result[1].name).toBe('Small Drag')
  })

  it('null drag_magnitude (unknown margin) sorted after known drags', () => {
    const dims = [
      { name: 'Known Drag', margin_pct: 5,   revenue: 40_000 },   // drag = 25
      { name: 'Unknown',    margin_pct: null, revenue: 40_000 },   // null drag
    ]
    const result = identifyProfitDragDimensions(dims, 30, 5)
    expect(result[0].name).toBe('Known Drag')
    expect(result[1].name).toBe('Unknown')
  })
})

// ── Integration: cross-function consistency ────────────────────────────────────

describe('Integration: cross-function consistency', () => {
  it('pareto attribution and gini coefficient are consistent for equal distribution', () => {
    // 5 items, each with 1000 margin. Total margin = 5000, 80% = 4000.
    // prior_cum for item 5: (4×1000)/5000×100 = 80% — NOT < 80 → false
    const dims = Array.from({ length: 5 }, (_, i) => ({
      name: `Cat${i}`,
      revenue: 20_000,
      margin:  1_000,
    }))
    const pareto = computeParetoAttribution(dims)
    const gini   = computeAttributionGini(dims.map(d => d.margin))

    // All equal → gini = 0
    expect(gini).toBeCloseTo(0)
    // 5 equal items: items 1-4 have prior_cum < 80%, item 5 has prior_cum = 80% (not < 80) → 4 items in pareto
    const paretoCount = pareto.filter(p => p.is_pareto_80).length
    expect(paretoCount).toBe(4)
    expect(paretoCount).toBeLessThan(dims.length)
  })

  it('pareto attribution and gini consistent for highly concentrated distribution', () => {
    const dims = [
      { name: 'Dominant', revenue: 90_000, margin: 90_000 },
      { name: 'A',        revenue: 5_000,  margin: 2_000  },
      { name: 'B',        revenue: 3_000,  margin: 500    },
      { name: 'C',        revenue: 2_000,  margin: 100    },
    ]
    const pareto = computeParetoAttribution(dims)
    const gini   = computeAttributionGini(dims.map(d => d.margin))

    // Dominant covers > 80% → only it is pareto_80
    const paretoItems = pareto.filter(p => p.is_pareto_80)
    expect(paretoItems[0].name).toBe('Dominant')

    // High concentration → gini > 0.5
    expect(gini).toBeGreaterThan(0.5)
  })

  it('time series attribution: peak and trough months are different', () => {
    const months = [
      { month: '2024-01', revenue: 100_000, gross_margin: 25_000 },  // 25%
      { month: '2024-02', revenue: 100_000, gross_margin: 45_000 },  // 45% — peak
      { month: '2024-03', revenue: 100_000, gross_margin: 15_000 },  // 15% — trough
    ]
    const result = computeTimeSeriesAttribution(months)
    const peak   = result.find(m => m.is_peak_month)!
    const trough = result.find(m => m.is_trough_month)!
    expect(peak.month).not.toBe(trough.month)
    expect(peak.margin_pct).toBeGreaterThan(trough.margin_pct!)
  })

  it('attribution share sums to 100% across all dimensions', () => {
    const dims = [
      { name: 'A', revenue: 40_000, margin: 12_000 },
      { name: 'B', revenue: 35_000, margin: 10_000 },
      { name: 'C', revenue: 25_000, margin: 6_000  },
    ]
    const totalRevenue = dims.reduce((s, d) => s + d.revenue, 0)
    const shares = dims.map(d => computeAttributionShare(d.revenue, totalRevenue)!)
    const sum = shares.reduce((s, v) => s + v, 0)
    expect(sum).toBeCloseTo(100)
  })

  it('identifyProfitDragDimensions returns empty when all dimensions have above-average margin', () => {
    const dims = [
      { name: 'High A', margin_pct: 45, revenue: 50_000 },
      { name: 'High B', margin_pct: 40, revenue: 50_000 },
    ]
    expect(identifyProfitDragDimensions(dims, 30, 5)).toHaveLength(0)
  })

  it('all attribution functions handle large numbers consistently', () => {
    const LARGE = 10_000_000
    expect(computeAttributionShare(LARGE, LARGE * 4)).toBeCloseTo(25)
    expect(computeAttributionMarginLift(35, 28)).toBeCloseTo(7)

    const dims = Array.from({ length: 3 }, (_, i) => ({
      name: `Cat${i}`,
      revenue: LARGE,
      margin:  LARGE * (0.2 + i * 0.1),
    }))
    const pareto = computeParetoAttribution(dims)
    expect(pareto).toHaveLength(3)
  })
})
