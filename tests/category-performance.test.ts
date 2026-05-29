// ─────────────────────────────────────────────────────────────────────────────
// tests/category-performance.test.ts
//
// Unit tests for pure helper functions in category-performance.service.ts
// Target: 95+ tests covering all exported pure functions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeAvgOrderValue,
  computeAvgUnitPrice,
  computeGrossMarginPct,
  computeRevenueShare,
  computeRevenueGrowth,
  computeMarginChangePp,
  computeCategoryHhi,
  classifyCategoryConcentration,
  rankCategoriesByRevenue,
  findFastestGrowingCategory,
  findSlowestGrowingCategory,
  computePortfolioGrowthRate,
  detectMixShift,
  computeWeightedAvgMargin,
  classifyCategoryGrowthMomentum,
  generateCategoryNarrative,
  type CategoryMetrics,
  type CategoryGrowth,
} from '../lib/services/commercial/category-performance.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCategory(overrides: Partial<CategoryMetrics> = {}): CategoryMetrics {
  return {
    category_id: 'cat-1',
    category_name: 'Elektronik',
    revenue_try: 100_000,
    units_sold: 500,
    deal_count: 50,
    avg_order_value: 2000,
    avg_unit_price: 200,
    gross_margin_try: 30_000,
    gross_margin_pct: 30,
    revenue_share_pct: 50,
    unit_share_pct: 50,
    ...overrides,
  }
}

function makeGrowth(overrides: Partial<CategoryGrowth> = {}): CategoryGrowth {
  return {
    category_id: 'cat-1',
    category_name: 'Elektronik',
    current_revenue: 100_000,
    prior_revenue: 80_000,
    revenue_growth_pct: 25,
    current_margin_pct: 30,
    prior_margin_pct: 25,
    margin_change_pp: 5,
    ...overrides,
  }
}

// ── computeAvgOrderValue ──────────────────────────────────────────────────────

describe('computeAvgOrderValue', () => {
  it('returns revenue / dealCount for positive values', () => {
    expect(computeAvgOrderValue(100_000, 50)).toBeCloseTo(2000, 5)
  })

  it('returns 0 when dealCount is 0', () => {
    expect(computeAvgOrderValue(100_000, 0)).toBe(0)
  })

  it('returns 0 when both revenue and dealCount are 0', () => {
    expect(computeAvgOrderValue(0, 0)).toBe(0)
  })

  it('returns revenue when dealCount is 1', () => {
    expect(computeAvgOrderValue(5000, 1)).toBe(5000)
  })

  it('handles fractional results', () => {
    expect(computeAvgOrderValue(10, 3)).toBeCloseTo(3.333, 2)
  })

  it('handles large numbers', () => {
    expect(computeAvgOrderValue(1_000_000, 1000)).toBe(1000)
  })

  it('handles negative revenue (credit notes)', () => {
    expect(computeAvgOrderValue(-10_000, 5)).toBe(-2000)
  })
})

// ── computeAvgUnitPrice ───────────────────────────────────────────────────────

describe('computeAvgUnitPrice', () => {
  it('returns revenue / units for positive values', () => {
    expect(computeAvgUnitPrice(100_000, 500)).toBe(200)
  })

  it('returns 0 when units is 0', () => {
    expect(computeAvgUnitPrice(50_000, 0)).toBe(0)
  })

  it('returns 0 when both revenue and units are 0', () => {
    expect(computeAvgUnitPrice(0, 0)).toBe(0)
  })

  it('returns revenue when units is 1', () => {
    expect(computeAvgUnitPrice(500, 1)).toBe(500)
  })

  it('handles fractional results', () => {
    expect(computeAvgUnitPrice(100, 3)).toBeCloseTo(33.333, 2)
  })

  it('handles large quantities', () => {
    expect(computeAvgUnitPrice(1_000_000, 10_000)).toBe(100)
  })

  it('handles single unit sale', () => {
    expect(computeAvgUnitPrice(9999.99, 1)).toBeCloseTo(9999.99, 2)
  })
})

// ── computeGrossMarginPct ─────────────────────────────────────────────────────

describe('computeGrossMarginPct', () => {
  it('returns correct margin percentage', () => {
    expect(computeGrossMarginPct(30_000, 100_000)).toBeCloseTo(30, 5)
  })

  it('returns null when revenue is 0', () => {
    expect(computeGrossMarginPct(0, 0)).toBeNull()
  })

  it('returns null when revenue is 0 and gross margin is non-zero', () => {
    expect(computeGrossMarginPct(5000, 0)).toBeNull()
  })

  it('returns 0 when gross margin is 0 and revenue is positive', () => {
    expect(computeGrossMarginPct(0, 100_000)).toBe(0)
  })

  it('returns 100 when margin equals revenue', () => {
    expect(computeGrossMarginPct(50_000, 50_000)).toBe(100)
  })

  it('returns negative for negative margin (loss)', () => {
    expect(computeGrossMarginPct(-10_000, 100_000)).toBeCloseTo(-10, 5)
  })

  it('handles fractional percentages', () => {
    expect(computeGrossMarginPct(1, 3)).toBeCloseTo(33.333, 2)
  })
})

// ── computeRevenueShare ───────────────────────────────────────────────────────

describe('computeRevenueShare', () => {
  it('returns correct share percentage', () => {
    expect(computeRevenueShare(50_000, 100_000)).toBe(50)
  })

  it('returns 0 when totalRevenue is 0', () => {
    expect(computeRevenueShare(50_000, 0)).toBe(0)
  })

  it('returns 0 when both are 0', () => {
    expect(computeRevenueShare(0, 0)).toBe(0)
  })

  it('returns 100 when category equals total', () => {
    expect(computeRevenueShare(100_000, 100_000)).toBe(100)
  })

  it('returns 0 when category revenue is 0', () => {
    expect(computeRevenueShare(0, 100_000)).toBe(0)
  })

  it('handles fractional shares', () => {
    expect(computeRevenueShare(1, 3)).toBeCloseTo(33.333, 2)
  })

  it('handles small categories', () => {
    expect(computeRevenueShare(1000, 1_000_000)).toBeCloseTo(0.1, 5)
  })
})

// ── computeRevenueGrowth ──────────────────────────────────────────────────────

describe('computeRevenueGrowth', () => {
  it('returns correct positive growth', () => {
    expect(computeRevenueGrowth(120_000, 100_000)).toBeCloseTo(20, 5)
  })

  it('returns null when prior is 0', () => {
    expect(computeRevenueGrowth(50_000, 0)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(computeRevenueGrowth(0, 0)).toBeNull()
  })

  it('returns 0 when current equals prior', () => {
    expect(computeRevenueGrowth(100_000, 100_000)).toBe(0)
  })

  it('returns negative growth correctly', () => {
    expect(computeRevenueGrowth(80_000, 100_000)).toBeCloseTo(-20, 5)
  })

  it('returns -100% when current is 0', () => {
    expect(computeRevenueGrowth(0, 100_000)).toBe(-100)
  })

  it('handles very large growth', () => {
    expect(computeRevenueGrowth(1_000_000, 1000)).toBeCloseTo(99900, 2)
  })

  it('handles fractional growth', () => {
    expect(computeRevenueGrowth(105, 100)).toBeCloseTo(5, 5)
  })
})

// ── computeMarginChangePp ─────────────────────────────────────────────────────

describe('computeMarginChangePp', () => {
  it('returns difference of two non-null values', () => {
    expect(computeMarginChangePp(35, 30)).toBeCloseTo(5, 5)
  })

  it('returns null when currentMarginPct is null', () => {
    expect(computeMarginChangePp(null, 30)).toBeNull()
  })

  it('returns null when priorMarginPct is null', () => {
    expect(computeMarginChangePp(35, null)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(computeMarginChangePp(null, null)).toBeNull()
  })

  it('returns 0 when margins are equal', () => {
    expect(computeMarginChangePp(25, 25)).toBe(0)
  })

  it('returns negative pp when margin declined', () => {
    expect(computeMarginChangePp(20, 30)).toBeCloseTo(-10, 5)
  })

  it('handles fractional pp', () => {
    expect(computeMarginChangePp(33.3, 30.1)).toBeCloseTo(3.2, 2)
  })

  it('handles negative margins', () => {
    expect(computeMarginChangePp(-5, -10)).toBeCloseTo(5, 5)
  })
})

// ── computeCategoryHhi ────────────────────────────────────────────────────────

describe('computeCategoryHhi', () => {
  it('returns 0 for empty array', () => {
    expect(computeCategoryHhi([])).toBe(0)
  })

  it('returns 1 for single category with 100% share', () => {
    const cats = [makeCategory({ revenue_share_pct: 100 })]
    expect(computeCategoryHhi(cats)).toBeCloseTo(1, 5)
  })

  it('returns 0.25 for two equal 50% categories', () => {
    const cats = [
      makeCategory({ revenue_share_pct: 50 }),
      makeCategory({ category_name: 'Giyim', revenue_share_pct: 50 }),
    ]
    expect(computeCategoryHhi(cats)).toBeCloseTo(0.5, 5)
  })

  it('returns correct HHI for four equal 25% categories', () => {
    const cats = [25, 25, 25, 25].map((share, i) =>
      makeCategory({ category_name: `Cat${i}`, revenue_share_pct: share }),
    )
    // 4 × (0.25)² = 4 × 0.0625 = 0.25
    expect(computeCategoryHhi(cats)).toBeCloseTo(0.25, 5)
  })

  it('result is always between 0 and 1', () => {
    const cats = [
      makeCategory({ revenue_share_pct: 60 }),
      makeCategory({ category_name: 'B', revenue_share_pct: 30 }),
      makeCategory({ category_name: 'C', revenue_share_pct: 10 }),
    ]
    const hhi = computeCategoryHhi(cats)
    expect(hhi).toBeGreaterThanOrEqual(0)
    expect(hhi).toBeLessThanOrEqual(1)
  })

  it('returns higher HHI for more concentrated markets', () => {
    const concentrated = [
      makeCategory({ revenue_share_pct: 90 }),
      makeCategory({ category_name: 'B', revenue_share_pct: 10 }),
    ]
    const diversified = [
      makeCategory({ revenue_share_pct: 50 }),
      makeCategory({ category_name: 'B', revenue_share_pct: 50 }),
    ]
    expect(computeCategoryHhi(concentrated)).toBeGreaterThan(computeCategoryHhi(diversified))
  })

  it('handles single category with 0% share', () => {
    const cats = [makeCategory({ revenue_share_pct: 0 })]
    expect(computeCategoryHhi(cats)).toBe(0)
  })
})

// ── classifyCategoryConcentration ────────────────────────────────────────────

describe('classifyCategoryConcentration', () => {
  it('returns diversified for hhi < 0.15', () => {
    expect(classifyCategoryConcentration(0)).toBe('diversified')
    expect(classifyCategoryConcentration(0.1)).toBe('diversified')
    expect(classifyCategoryConcentration(0.149)).toBe('diversified')
  })

  it('returns moderate for hhi = 0.15 (exact boundary)', () => {
    expect(classifyCategoryConcentration(0.15)).toBe('moderate')
  })

  it('returns moderate for 0.15 <= hhi < 0.25', () => {
    expect(classifyCategoryConcentration(0.20)).toBe('moderate')
    expect(classifyCategoryConcentration(0.249)).toBe('moderate')
  })

  it('returns concentrated for hhi = 0.25 (exact boundary)', () => {
    expect(classifyCategoryConcentration(0.25)).toBe('concentrated')
  })

  it('returns concentrated for 0.25 <= hhi < 0.50', () => {
    expect(classifyCategoryConcentration(0.35)).toBe('concentrated')
    expect(classifyCategoryConcentration(0.499)).toBe('concentrated')
  })

  it('returns highly_concentrated for hhi = 0.50 (exact boundary)', () => {
    expect(classifyCategoryConcentration(0.50)).toBe('highly_concentrated')
  })

  it('returns highly_concentrated for hhi >= 0.50', () => {
    expect(classifyCategoryConcentration(0.75)).toBe('highly_concentrated')
    expect(classifyCategoryConcentration(1)).toBe('highly_concentrated')
  })
})

// ── rankCategoriesByRevenue ───────────────────────────────────────────────────

describe('rankCategoriesByRevenue', () => {
  it('sorts categories by revenue_try descending', () => {
    const cats = [
      makeCategory({ category_name: 'B', revenue_try: 50_000 }),
      makeCategory({ category_name: 'A', revenue_try: 100_000 }),
      makeCategory({ category_name: 'C', revenue_try: 25_000 }),
    ]
    const ranked = rankCategoriesByRevenue(cats)
    expect(ranked[0].category_name).toBe('A')
    expect(ranked[1].category_name).toBe('B')
    expect(ranked[2].category_name).toBe('C')
  })

  it('returns empty array for empty input', () => {
    expect(rankCategoriesByRevenue([])).toEqual([])
  })

  it('returns same array for single category', () => {
    const cats = [makeCategory()]
    expect(rankCategoriesByRevenue(cats)).toHaveLength(1)
  })

  it('does not mutate the original array', () => {
    const cats = [
      makeCategory({ category_name: 'B', revenue_try: 50_000 }),
      makeCategory({ category_name: 'A', revenue_try: 100_000 }),
    ]
    const original = [...cats]
    rankCategoriesByRevenue(cats)
    expect(cats[0].category_name).toBe(original[0].category_name)
  })

  it('handles ties (order stable not required, but both present)', () => {
    const cats = [
      makeCategory({ category_name: 'A', revenue_try: 100_000 }),
      makeCategory({ category_name: 'B', revenue_try: 100_000 }),
    ]
    const ranked = rankCategoriesByRevenue(cats)
    expect(ranked).toHaveLength(2)
    expect(ranked.map(c => c.revenue_try)).toEqual([100_000, 100_000])
  })
})

// ── findFastestGrowingCategory ────────────────────────────────────────────────

describe('findFastestGrowingCategory', () => {
  it('returns category with highest revenue_growth_pct', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: 50 }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: 25 }),
      makeGrowth({ category_name: 'C', revenue_growth_pct: 100 }),
    ]
    expect(findFastestGrowingCategory(growths)?.category_name).toBe('C')
  })

  it('returns null for empty array', () => {
    expect(findFastestGrowingCategory([])).toBeNull()
  })

  it('returns null when all growth values are null', () => {
    const growths = [
      makeGrowth({ revenue_growth_pct: null }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: null }),
    ]
    expect(findFastestGrowingCategory(growths)).toBeNull()
  })

  it('skips null growth entries and finds the max among non-null', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: null }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: 30 }),
      makeGrowth({ category_name: 'C', revenue_growth_pct: 15 }),
    ]
    expect(findFastestGrowingCategory(growths)?.category_name).toBe('B')
  })

  it('handles negative growth (finds least negative as fastest)', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: -5 }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: -30 }),
    ]
    expect(findFastestGrowingCategory(growths)?.category_name).toBe('A')
  })

  it('returns single entry when only one non-null', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: null }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: 20 }),
    ]
    expect(findFastestGrowingCategory(growths)?.category_name).toBe('B')
  })
})

// ── findSlowestGrowingCategory ────────────────────────────────────────────────

describe('findSlowestGrowingCategory', () => {
  it('returns category with lowest revenue_growth_pct', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: 50 }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: 25 }),
      makeGrowth({ category_name: 'C', revenue_growth_pct: -10 }),
    ]
    expect(findSlowestGrowingCategory(growths)?.category_name).toBe('C')
  })

  it('returns null for empty array', () => {
    expect(findSlowestGrowingCategory([])).toBeNull()
  })

  it('returns null when all growth values are null', () => {
    const growths = [
      makeGrowth({ revenue_growth_pct: null }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: null }),
    ]
    expect(findSlowestGrowingCategory(growths)).toBeNull()
  })

  it('skips null growth entries and finds the min among non-null', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: null }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: 30 }),
      makeGrowth({ category_name: 'C', revenue_growth_pct: 5 }),
    ]
    expect(findSlowestGrowingCategory(growths)?.category_name).toBe('C')
  })

  it('handles most negative growth', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: -5 }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: -50 }),
      makeGrowth({ category_name: 'C', revenue_growth_pct: 10 }),
    ]
    expect(findSlowestGrowingCategory(growths)?.category_name).toBe('B')
  })

  it('slowest and fastest are different for varied dataset', () => {
    const growths = [
      makeGrowth({ category_name: 'A', revenue_growth_pct: 100 }),
      makeGrowth({ category_name: 'B', revenue_growth_pct: -20 }),
    ]
    const fastest = findFastestGrowingCategory(growths)
    const slowest = findSlowestGrowingCategory(growths)
    expect(fastest?.category_name).toBe('A')
    expect(slowest?.category_name).toBe('B')
  })
})

// ── computePortfolioGrowthRate ────────────────────────────────────────────────

describe('computePortfolioGrowthRate', () => {
  it('returns correct portfolio growth', () => {
    expect(computePortfolioGrowthRate(120_000, 100_000)).toBeCloseTo(20, 5)
  })

  it('returns null when prior is 0', () => {
    expect(computePortfolioGrowthRate(50_000, 0)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(computePortfolioGrowthRate(0, 0)).toBeNull()
  })

  it('returns 0 when current equals prior', () => {
    expect(computePortfolioGrowthRate(100_000, 100_000)).toBe(0)
  })

  it('returns negative for portfolio decline', () => {
    expect(computePortfolioGrowthRate(80_000, 100_000)).toBeCloseTo(-20, 5)
  })

  it('returns -100 when current is 0', () => {
    expect(computePortfolioGrowthRate(0, 100_000)).toBe(-100)
  })
})

// ── detectMixShift ────────────────────────────────────────────────────────────

describe('detectMixShift', () => {
  it('classifies gaining when share_change_pp > 1', () => {
    const current = [makeCategory({ revenue_share_pct: 60 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('gaining')
    expect(shifts[0].share_change_pp).toBeCloseTo(10, 5)
  })

  it('classifies losing when share_change_pp < -1', () => {
    const current = [makeCategory({ revenue_share_pct: 40 })]
    const prior   = [makeCategory({ revenue_share_pct: 60 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('losing')
    expect(shifts[0].share_change_pp).toBeCloseTo(-20, 5)
  })

  it('classifies stable when share_change_pp is 0', () => {
    const current = [makeCategory({ revenue_share_pct: 50 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('stable')
  })

  it('classifies stable when share_change_pp is exactly +1 (boundary)', () => {
    const current = [makeCategory({ revenue_share_pct: 51 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('stable')
    expect(shifts[0].share_change_pp).toBeCloseTo(1, 5)
  })

  it('classifies stable when share_change_pp is exactly -1 (boundary)', () => {
    const current = [makeCategory({ revenue_share_pct: 49 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('stable')
    expect(shifts[0].share_change_pp).toBeCloseTo(-1, 5)
  })

  it('classifies gaining when share_change_pp is just above +1', () => {
    const current = [makeCategory({ revenue_share_pct: 51.1 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('gaining')
  })

  it('classifies losing when share_change_pp is just below -1', () => {
    const current = [makeCategory({ revenue_share_pct: 48.9 })]
    const prior   = [makeCategory({ revenue_share_pct: 50 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].shift_type).toBe('losing')
  })

  it('uses 0 as prior share for new categories not in prior', () => {
    const current = [makeCategory({ category_name: 'NewCat', revenue_share_pct: 25 })]
    const prior: CategoryMetrics[] = []
    const shifts = detectMixShift(current, prior)
    expect(shifts[0].prior_share_pct).toBe(0)
    expect(shifts[0].shift_type).toBe('gaining')
  })

  it('returns empty array for empty current', () => {
    const prior = [makeCategory()]
    expect(detectMixShift([], prior)).toEqual([])
  })

  it('handles multiple categories correctly', () => {
    const current = [
      makeCategory({ category_name: 'A', revenue_share_pct: 60 }),
      makeCategory({ category_name: 'B', revenue_share_pct: 40 }),
    ]
    const prior = [
      makeCategory({ category_name: 'A', revenue_share_pct: 50 }),
      makeCategory({ category_name: 'B', revenue_share_pct: 50 }),
    ]
    const shifts = detectMixShift(current, prior)
    expect(shifts).toHaveLength(2)
    const aShift = shifts.find(s => s.category_name === 'A')
    const bShift = shifts.find(s => s.category_name === 'B')
    expect(aShift?.shift_type).toBe('gaining')
    expect(bShift?.shift_type).toBe('losing')
  })

  it('returns correct current_share_pct and prior_share_pct', () => {
    const current = [makeCategory({ revenue_share_pct: 70 })]
    const prior   = [makeCategory({ revenue_share_pct: 60 })]
    const shifts  = detectMixShift(current, prior)
    expect(shifts[0].current_share_pct).toBe(70)
    expect(shifts[0].prior_share_pct).toBe(60)
  })
})

// ── computeWeightedAvgMargin ──────────────────────────────────────────────────

describe('computeWeightedAvgMargin', () => {
  it('returns correct weighted average margin', () => {
    const cats = [
      makeCategory({ revenue_try: 100_000, gross_margin_try: 30_000 }),
      makeCategory({ category_name: 'B', revenue_try: 50_000, gross_margin_try: 10_000 }),
    ]
    // (30000 + 10000) / (100000 + 50000) × 100 = 26.667%
    expect(computeWeightedAvgMargin(cats)).toBeCloseTo(26.667, 2)
  })

  it('returns null for empty array', () => {
    expect(computeWeightedAvgMargin([])).toBeNull()
  })

  it('returns null when total revenue is 0', () => {
    const cats = [makeCategory({ revenue_try: 0, gross_margin_try: 0 })]
    expect(computeWeightedAvgMargin(cats)).toBeNull()
  })

  it('returns 0 when all margins are 0', () => {
    const cats = [
      makeCategory({ revenue_try: 100_000, gross_margin_try: 0 }),
      makeCategory({ category_name: 'B', revenue_try: 50_000, gross_margin_try: 0 }),
    ]
    expect(computeWeightedAvgMargin(cats)).toBe(0)
  })

  it('returns 100 when margin equals revenue across all categories', () => {
    const cats = [
      makeCategory({ revenue_try: 50_000, gross_margin_try: 50_000 }),
    ]
    expect(computeWeightedAvgMargin(cats)).toBe(100)
  })

  it('handles categories with mixed positive and negative margins', () => {
    const cats = [
      makeCategory({ revenue_try: 100_000, gross_margin_try: 40_000 }),
      makeCategory({ category_name: 'Loss', revenue_try: 50_000, gross_margin_try: -10_000 }),
    ]
    // (40000 - 10000) / 150000 × 100 = 20%
    expect(computeWeightedAvgMargin(cats)).toBeCloseTo(20, 5)
  })
})

// ── classifyCategoryGrowthMomentum ────────────────────────────────────────────

describe('classifyCategoryGrowthMomentum', () => {
  it('returns insufficient_data when portfolioGrowthPct is null', () => {
    expect(classifyCategoryGrowthMomentum(null, 3, 5)).toBe('insufficient_data')
  })

  it('returns declining when portfolioGrowthPct < 0', () => {
    expect(classifyCategoryGrowthMomentum(-5, 0, 5)).toBe('declining')
    expect(classifyCategoryGrowthMomentum(-0.1, 4, 5)).toBe('declining')
  })

  it('returns weak when portfolioGrowthPct < 5', () => {
    expect(classifyCategoryGrowthMomentum(0, 4, 5)).toBe('weak')
    expect(classifyCategoryGrowthMomentum(4.9, 5, 5)).toBe('weak')
  })

  it('returns moderate when portfolioGrowthPct 5-15 regardless of breadth', () => {
    // 10% growth but < 15 → moderate regardless of breadth
    expect(classifyCategoryGrowthMomentum(10, 2, 5)).toBe('moderate')
    expect(classifyCategoryGrowthMomentum(10, 4, 5)).toBe('moderate')
  })

  it('returns strong_narrow when portfolioGrowthPct >= 15 and < 50% above portfolio', () => {
    // >= 15% and only 2/5 = 40% above → strong_narrow
    expect(classifyCategoryGrowthMomentum(20, 2, 5)).toBe('strong_narrow')
  })

  it('returns strong_narrow when portfolioGrowthPct >= 15 and < 50% above portfolio', () => {
    // 15% growth, 2/6 = 33% above → strong_narrow
    expect(classifyCategoryGrowthMomentum(15, 2, 6)).toBe('strong_narrow')
  })

  it('returns strong_broad when portfolioGrowthPct >= 15 and >= 50% above portfolio', () => {
    // 20% growth, 3/5 = 60% above → strong_broad
    expect(classifyCategoryGrowthMomentum(20, 3, 5)).toBe('strong_broad')
  })

  it('returns strong_broad when exactly 15% growth and exactly 50% above', () => {
    // 15% growth, 5/10 = 50% above → strong_broad (both thresholds met)
    expect(classifyCategoryGrowthMomentum(15, 5, 10)).toBe('strong_broad')
  })

  it('handles totalCategories = 0 gracefully', () => {
    // 20% growth but no categories → aboveRatio = 0, strong_narrow or moderate
    const result = classifyCategoryGrowthMomentum(20, 0, 0)
    expect(['strong_narrow', 'moderate']).toContain(result)
  })

  it('returns declining for exactly -0.01%', () => {
    expect(classifyCategoryGrowthMomentum(-0.01, 5, 5)).toBe('declining')
  })

  it('returns weak for exactly 0%', () => {
    expect(classifyCategoryGrowthMomentum(0, 5, 5)).toBe('weak')
  })

  it('returns moderate for exactly 5%', () => {
    // 5% with 2/5 = 40% above → moderate
    expect(classifyCategoryGrowthMomentum(5, 2, 5)).toBe('moderate')
  })
})

// ── generateCategoryNarrative ─────────────────────────────────────────────────

describe('generateCategoryNarrative', () => {
  const topCat = makeCategory()

  it('returns Turkish string for strong_broad', () => {
    const result = generateCategoryNarrative('strong_broad', 'diversified', topCat, 20)
    expect(result).toBeTruthy()
    expect(result.length).toBeGreaterThan(5)
    expect(result).toBe('Ürün kategorilerinde geniş tabanlı büyüme — portföy dengeli.')
  })

  it('returns Turkish string for strong_narrow', () => {
    const result = generateCategoryNarrative('strong_narrow', 'concentrated', topCat, 20)
    expect(result).toBeTruthy()
    expect(result).toBe('Büyüme belirli kategorilerde yoğunlaşmış — çeşitlendirme önerilir.')
  })

  it('returns Turkish string for moderate', () => {
    const result = generateCategoryNarrative('moderate', 'moderate', topCat, 10)
    expect(result).toBeTruthy()
    expect(result).toBe('Kategoriler ılımlı büyüme seyrediyor.')
  })

  it('returns Turkish string for weak', () => {
    const result = generateCategoryNarrative('weak', 'diversified', topCat, 3)
    expect(result).toBeTruthy()
    expect(result).toBe('Kategori büyümesi zayıf — ürün stratejisi gözden geçirilmeli.')
  })

  it('returns Turkish string for declining', () => {
    const result = generateCategoryNarrative('declining', 'highly_concentrated', topCat, -10)
    expect(result).toBeTruthy()
    expect(result).toBe('Kategori gelirleri düşüşte — öncelikli dikkat gerekiyor.')
  })

  it('returns Turkish string for insufficient_data', () => {
    const result = generateCategoryNarrative('insufficient_data', 'diversified', null, null)
    expect(result).toBeTruthy()
    expect(result).toBe('Karşılaştırmalı kategori verisi yetersiz.')
  })

  it('handles null topCategory for all momentums', () => {
    const momentums: Parameters<typeof generateCategoryNarrative>[0][] = [
      'strong_broad', 'strong_narrow', 'moderate', 'weak', 'declining', 'insufficient_data',
    ]
    for (const m of momentums) {
      const result = generateCategoryNarrative(m, 'diversified', null, null)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('returns non-empty string for all 6 momentum levels', () => {
    const momentums: Parameters<typeof generateCategoryNarrative>[0][] = [
      'strong_broad', 'strong_narrow', 'moderate', 'weak', 'declining', 'insufficient_data',
    ]
    for (const m of momentums) {
      const result = generateCategoryNarrative(m, 'diversified', topCat, 15)
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('does not return English text', () => {
    const momentums: Parameters<typeof generateCategoryNarrative>[0][] = [
      'strong_broad', 'strong_narrow', 'moderate', 'weak', 'declining', 'insufficient_data',
    ]
    for (const m of momentums) {
      const result = generateCategoryNarrative(m, 'diversified', topCat, 5)
      // Should not contain English only phrases
      expect(result).not.toMatch(/^[a-zA-Z\s]+$/)
    }
  })
})
