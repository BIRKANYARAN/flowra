// ─────────────────────────────────────────────────────────────────────────────
// tests/product-mix.test.ts
//
// Unit tests for the pure helper functions in product-mix.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeProductContributionMargin,
  computeProductContributionMarginRatio,
  classifyProductQuadrant,
  computeWeightedAverageMargin,
  computeMixShiftEffect,
  computeProductConcentrationRisk,
  rankProductsByProfit,
} from '../lib/services/finance/product-mix.service'

// ── computeProductContributionMargin ─────────────────────────────────────────

describe('computeProductContributionMargin', () => {
  it('returns correct CM for profitable product', () => {
    expect(computeProductContributionMargin(10_000, 6_000)).toBe(4_000)
  })

  it('returns zero when revenue equals variable costs', () => {
    expect(computeProductContributionMargin(5_000, 5_000)).toBe(0)
  })

  it('returns negative value when costs exceed revenue (loss)', () => {
    expect(computeProductContributionMargin(3_000, 5_000)).toBe(-2_000)
  })

  it('returns revenue when variable costs are zero', () => {
    expect(computeProductContributionMargin(8_000, 0)).toBe(8_000)
  })

  it('handles zero revenue with zero costs', () => {
    expect(computeProductContributionMargin(0, 0)).toBe(0)
  })
})

// ── computeProductContributionMarginRatio ─────────────────────────────────────

describe('computeProductContributionMarginRatio', () => {
  it('returns correct CM ratio for profitable product', () => {
    // (10000 - 6000) / 10000 × 100 = 40%
    expect(computeProductContributionMarginRatio(10_000, 6_000)).toBeCloseTo(40, 5)
  })

  it('returns null when revenue is zero', () => {
    expect(computeProductContributionMarginRatio(0, 0)).toBeNull()
  })

  it('returns null when revenue is zero and costs are non-zero', () => {
    expect(computeProductContributionMarginRatio(0, 500)).toBeNull()
  })

  it('returns negative ratio when costs exceed revenue', () => {
    // (3000 - 5000) / 3000 × 100 = -66.67%
    const result = computeProductContributionMarginRatio(3_000, 5_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(-66.667, 2)
  })

  it('returns 100% when variable costs are zero', () => {
    expect(computeProductContributionMarginRatio(5_000, 0)).toBeCloseTo(100, 5)
  })

  it('returns 0% when CM is zero (costs equal revenue)', () => {
    expect(computeProductContributionMarginRatio(5_000, 5_000)).toBeCloseTo(0, 5)
  })

  it('handles small revenue correctly', () => {
    // (100 - 70) / 100 × 100 = 30%
    expect(computeProductContributionMarginRatio(100, 70)).toBeCloseTo(30, 5)
  })
})

// ── classifyProductQuadrant ───────────────────────────────────────────────────

describe('classifyProductQuadrant', () => {
  it('returns star for high revenue + high margin', () => {
    expect(classifyProductQuadrant(25, 35)).toBe('star')
  })

  it('returns cash_cow for high revenue + low margin', () => {
    expect(classifyProductQuadrant(30, 20)).toBe('cash_cow')
  })

  it('returns question_mark for low revenue + high margin', () => {
    expect(classifyProductQuadrant(10, 50)).toBe('question_mark')
  })

  it('returns dog for low revenue + low margin', () => {
    expect(classifyProductQuadrant(5, 10)).toBe('dog')
  })

  it('returns dog for null margin (conservative)', () => {
    expect(classifyProductQuadrant(30, null)).toBe('dog')
  })

  it('returns dog for null margin even with high revenue share', () => {
    expect(classifyProductQuadrant(50, null)).toBe('dog')
  })

  it('boundary: exactly 20% revenue + exactly 30% margin → star', () => {
    expect(classifyProductQuadrant(20, 30)).toBe('star')
  })

  it('boundary: exactly 20% revenue + 29.99% margin → cash_cow', () => {
    expect(classifyProductQuadrant(20, 29.99)).toBe('cash_cow')
  })

  it('boundary: 19.99% revenue + exactly 30% margin → question_mark', () => {
    expect(classifyProductQuadrant(19.99, 30)).toBe('question_mark')
  })

  it('boundary: 19.99% revenue + 29.99% margin → dog', () => {
    expect(classifyProductQuadrant(19.99, 29.99)).toBe('dog')
  })

  it('returns star for very high revenue and margin', () => {
    expect(classifyProductQuadrant(80, 90)).toBe('star')
  })

  it('returns dog for near-zero revenue + negative margin', () => {
    expect(classifyProductQuadrant(1, -10)).toBe('dog')
  })
})

// ── computeWeightedAverageMargin ──────────────────────────────────────────────

describe('computeWeightedAverageMargin', () => {
  it('computes revenue-weighted average correctly', () => {
    // Product A: revenue 6000, margin 50% — weight 6000
    // Product B: revenue 4000, margin 20% — weight 4000
    // Weighted avg = (6000×50 + 4000×20) / 10000 = (300000+80000)/10000 = 38%
    const result = computeWeightedAverageMargin([
      { revenue: 6_000, margin_ratio_pct: 50 },
      { revenue: 4_000, margin_ratio_pct: 20 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(38, 5)
  })

  it('skips products with null margin', () => {
    // Only product A (revenue 8000, margin 40%) should be counted
    const result = computeWeightedAverageMargin([
      { revenue: 8_000, margin_ratio_pct: 40 },
      { revenue: 2_000, margin_ratio_pct: null },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(40, 5)
  })

  it('returns null when all margins are null', () => {
    const result = computeWeightedAverageMargin([
      { revenue: 5_000, margin_ratio_pct: null },
      { revenue: 3_000, margin_ratio_pct: null },
    ])
    expect(result).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(computeWeightedAverageMargin([])).toBeNull()
  })

  it('returns null when all valid products have zero revenue', () => {
    const result = computeWeightedAverageMargin([
      { revenue: 0, margin_ratio_pct: 30 },
      { revenue: 0, margin_ratio_pct: 50 },
    ])
    expect(result).toBeNull()
  })

  it('returns single product margin when only one valid product', () => {
    const result = computeWeightedAverageMargin([
      { revenue: 10_000, margin_ratio_pct: 45 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(45, 5)
  })

  it('handles negative margins in weighted average', () => {
    // Product A: revenue 5000, margin 60%
    // Product B: revenue 5000, margin -20%
    // Weighted avg = (5000×60 + 5000×(-20)) / 10000 = 20%
    const result = computeWeightedAverageMargin([
      { revenue: 5_000, margin_ratio_pct: 60 },
      { revenue: 5_000, margin_ratio_pct: -20 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(20, 5)
  })
})

// ── computeMixShiftEffect ─────────────────────────────────────────────────────

describe('computeMixShiftEffect', () => {
  it('returns positive effect when mix shifts to higher-margin product', () => {
    // Product A: prior 40% → current 60%, margin 50%
    // Product B: prior 60% → current 40%, margin 10%
    // A effect: (60-40)/100 × 100000 × 50/100 = 0.2 × 100000 × 0.5 = 10000
    // B effect: (40-60)/100 × 100000 × 10/100 = -0.2 × 100000 × 0.1 = -2000
    // Total = 8000
    const prior   = [
      { product_id: 'A', revenue_pct: 40, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 60, margin_ratio_pct: 10 },
    ]
    const current = [
      { product_id: 'A', revenue_pct: 60, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 40, margin_ratio_pct: 10 },
    ]
    const result = computeMixShiftEffect(prior, current, 100_000)
    expect(result).toBeCloseTo(8_000, 2)
  })

  it('returns negative effect when mix shifts to lower-margin product', () => {
    // Product A: prior 60% → current 40%, margin 50%
    // Product B: prior 40% → current 60%, margin 10%
    // A effect: (40-60)/100 × 100000 × 50/100 = -0.2 × 100000 × 0.5 = -10000
    // B effect: (60-40)/100 × 100000 × 10/100 = 0.2 × 100000 × 0.1 = 2000
    // Total = -8000
    const prior   = [
      { product_id: 'A', revenue_pct: 60, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 40, margin_ratio_pct: 10 },
    ]
    const current = [
      { product_id: 'A', revenue_pct: 40, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 60, margin_ratio_pct: 10 },
    ]
    const result = computeMixShiftEffect(prior, current, 100_000)
    expect(result).toBeCloseTo(-8_000, 2)
  })

  it('products only in current contribute zero', () => {
    // Product A is new (not in prior) — should contribute 0
    const prior   = [{ product_id: 'B', revenue_pct: 100, margin_ratio_pct: 30 }]
    const current = [
      { product_id: 'A', revenue_pct: 40, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 60, margin_ratio_pct: 30 },
    ]
    // Only B contributes: (60-100)/100 × 50000 × 30/100 = -0.4 × 50000 × 0.3 = -6000
    const result = computeMixShiftEffect(prior, current, 50_000)
    expect(result).toBeCloseTo(-6_000, 2)
  })

  it('products only in prior contribute zero', () => {
    // Product C is in prior but not current — contributes 0
    const prior   = [
      { product_id: 'A', revenue_pct: 50, margin_ratio_pct: 40 },
      { product_id: 'C', revenue_pct: 50, margin_ratio_pct: 20 },
    ]
    const current = [{ product_id: 'A', revenue_pct: 100, margin_ratio_pct: 40 }]
    // Only A contributes: (100-50)/100 × 80000 × 40/100 = 0.5 × 80000 × 0.4 = 16000
    const result = computeMixShiftEffect(prior, current, 80_000)
    expect(result).toBeCloseTo(16_000, 2)
  })

  it('returns zero when no products in common', () => {
    const prior   = [{ product_id: 'A', revenue_pct: 100, margin_ratio_pct: 40 }]
    const current = [{ product_id: 'B', revenue_pct: 100, margin_ratio_pct: 40 }]
    expect(computeMixShiftEffect(prior, current, 50_000)).toBe(0)
  })

  it('returns zero when prior is empty', () => {
    const current = [{ product_id: 'A', revenue_pct: 100, margin_ratio_pct: 40 }]
    expect(computeMixShiftEffect([], current, 50_000)).toBe(0)
  })

  it('skips products with null margin in current', () => {
    const prior   = [{ product_id: 'A', revenue_pct: 50, margin_ratio_pct: 40 }]
    const current = [{ product_id: 'A', revenue_pct: 80, margin_ratio_pct: null }]
    expect(computeMixShiftEffect(prior, current, 100_000)).toBe(0)
  })

  it('returns zero when mix is unchanged', () => {
    const mix = [
      { product_id: 'A', revenue_pct: 60, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 40, margin_ratio_pct: 20 },
    ]
    expect(computeMixShiftEffect(mix, mix, 100_000)).toBeCloseTo(0, 5)
  })
})

// ── computeProductConcentrationRisk ───────────────────────────────────────────

describe('computeProductConcentrationRisk', () => {
  it('returns zero HHI and null top share for empty array', () => {
    const result = computeProductConcentrationRisk([])
    expect(result.hhi).toBe(0)
    expect(result.top_product_share).toBeNull()
    expect(result.is_concentrated).toBe(false)
  })

  it('returns zero HHI when total revenue is zero', () => {
    const result = computeProductConcentrationRisk([
      { product_id: 'A', revenue: 0 },
    ])
    expect(result.hhi).toBe(0)
    expect(result.top_product_share).toBeNull()
    expect(result.is_concentrated).toBe(false)
  })

  it('computes HHI correctly for equal distribution', () => {
    // 4 products with 25% each → HHI = 4 × 25² = 4 × 625 = 2500
    const products = [
      { product_id: 'A', revenue: 250 },
      { product_id: 'B', revenue: 250 },
      { product_id: 'C', revenue: 250 },
      { product_id: 'D', revenue: 250 },
    ]
    const result = computeProductConcentrationRisk(products)
    expect(result.hhi).toBeCloseTo(2500, 2)
    expect(result.top_product_share).toBeCloseTo(25, 5)
    // is_concentrated: HHI = 2500, NOT > 2500, and top share = 25% NOT > 50%
    expect(result.is_concentrated).toBe(false)
  })

  it('marks concentrated when HHI exceeds 2500', () => {
    // 2 products: 60% and 40% → HHI = 60²+40² = 3600+1600 = 5200
    const products = [
      { product_id: 'A', revenue: 6_000 },
      { product_id: 'B', revenue: 4_000 },
    ]
    const result = computeProductConcentrationRisk(products)
    expect(result.hhi).toBeCloseTo(5200, 2)
    expect(result.is_concentrated).toBe(true)
  })

  it('marks concentrated when top product > 50%', () => {
    // 1 product with 100% share
    const result = computeProductConcentrationRisk([
      { product_id: 'A', revenue: 10_000 },
    ])
    expect(result.hhi).toBeCloseTo(10_000, 2)  // 100² = 10000
    expect(result.top_product_share).toBeCloseTo(100, 5)
    expect(result.is_concentrated).toBe(true)
  })

  it('returns correct top_product_share', () => {
    const products = [
      { product_id: 'A', revenue: 7_000 },
      { product_id: 'B', revenue: 2_000 },
      { product_id: 'C', revenue: 1_000 },
    ]
    const result = computeProductConcentrationRisk(products)
    expect(result.top_product_share).toBeCloseTo(70, 5)
    expect(result.is_concentrated).toBe(true)  // 70% > 50%
  })
})

// ── rankProductsByProfit ──────────────────────────────────────────────────────

describe('rankProductsByProfit', () => {
  it('ranks products by contribution_margin descending', () => {
    const products = [
      { product_id: 'C', product_name: 'C', revenue: 1000, contribution_margin: 100, margin_ratio_pct: 10,  quadrant: 'dog' as const },
      { product_id: 'A', product_name: 'A', revenue: 5000, contribution_margin: 3000, margin_ratio_pct: 60, quadrant: 'star' as const },
      { product_id: 'B', product_name: 'B', revenue: 3000, contribution_margin: 900, margin_ratio_pct: 30,  quadrant: 'question_mark' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[0].product_id).toBe('A')
    expect(ranked[1].product_id).toBe('B')
    expect(ranked[2].product_id).toBe('C')
  })

  it('assigns 1-indexed ranks', () => {
    const products = [
      { product_id: 'A', product_name: 'A', revenue: 5000, contribution_margin: 3000, margin_ratio_pct: 60, quadrant: 'star' as const },
      { product_id: 'B', product_name: 'B', revenue: 3000, contribution_margin: 900, margin_ratio_pct: 30,  quadrant: 'question_mark' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[0].rank).toBe(1)
    expect(ranked[1].rank).toBe(2)
  })

  it('places products with negative CM at the bottom', () => {
    const products = [
      { product_id: 'A', product_name: 'A', revenue: 5000, contribution_margin: 2000,  margin_ratio_pct: 40, quadrant: 'star' as const },
      { product_id: 'B', product_name: 'B', revenue: 1000, contribution_margin: -500,  margin_ratio_pct: -50, quadrant: 'dog' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[0].product_id).toBe('A')
    expect(ranked[1].product_id).toBe('B')
    expect(ranked[1].rank).toBe(2)
  })

  it('handles empty array', () => {
    expect(rankProductsByProfit([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const products = [
      { product_id: 'B', product_name: 'B', revenue: 3000, contribution_margin: 900, margin_ratio_pct: 30, quadrant: 'cash_cow' as const },
      { product_id: 'A', product_name: 'A', revenue: 5000, contribution_margin: 3000, margin_ratio_pct: 60, quadrant: 'star' as const },
    ]
    const originalOrder = products.map(p => p.product_id)
    rankProductsByProfit(products)
    expect(products.map(p => p.product_id)).toEqual(originalOrder)
  })

  it('preserves all product fields in output', () => {
    const product = {
      product_id:          'X1',
      product_name:        'Test Product',
      revenue:             10_000,
      contribution_margin: 4_000,
      margin_ratio_pct:    40,
      quadrant:            'star' as const,
    }
    const ranked = rankProductsByProfit([product])
    expect(ranked[0]).toMatchObject({ ...product, rank: 1 })
  })

  it('handles tied contribution margins', () => {
    const products = [
      { product_id: 'A', product_name: 'A', revenue: 5000, contribution_margin: 1500, margin_ratio_pct: 30, quadrant: 'star' as const },
      { product_id: 'B', product_name: 'B', revenue: 3000, contribution_margin: 1500, margin_ratio_pct: 50, quadrant: 'question_mark' as const },
    ]
    const ranked = rankProductsByProfit(products)
    // Both have CM = 1500; ranks must be 1 and 2 (order undefined for ties, but ranks assigned)
    const ranks = ranked.map(p => p.rank).sort()
    expect(ranks).toEqual([1, 2])
  })
})

// ── computeProductContributionMargin — formula (price - variableCost) ─────────

describe('computeProductContributionMargin — formula verification', () => {
  it('CM = revenue - variableCosts (positive)', () => {
    expect(computeProductContributionMargin(15_000, 9_000)).toBe(6_000)
  })

  it('CM = revenue - variableCosts (zero)', () => {
    expect(computeProductContributionMargin(5_000, 5_000)).toBe(0)
  })

  it('CM = revenue - variableCosts (negative loss)', () => {
    expect(computeProductContributionMargin(2_000, 3_500)).toBe(-1_500)
  })

  it('CM = revenue when variableCosts are zero', () => {
    expect(computeProductContributionMargin(20_000, 0)).toBe(20_000)
  })

  it('both zero → CM is zero', () => {
    expect(computeProductContributionMargin(0, 0)).toBe(0)
  })
})

// ── computeProductContributionMarginRatio — formula verification ──────────────

describe('computeProductContributionMarginRatio — formula', () => {
  it('CMR = (revenue - variableCosts) / revenue × 100', () => {
    // (8000 - 5600) / 8000 × 100 = 30%
    expect(computeProductContributionMarginRatio(8_000, 5_600)).toBeCloseTo(30, 4)
  })

  it('returns null when revenue is 0', () => {
    expect(computeProductContributionMarginRatio(0, 1_000)).toBeNull()
  })

  it('returns 100% when variable costs are zero', () => {
    expect(computeProductContributionMarginRatio(10_000, 0)).toBeCloseTo(100, 5)
  })

  it('returns negative when costs exceed revenue', () => {
    const result = computeProductContributionMarginRatio(4_000, 6_000)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('returns 0% when revenue equals variable costs', () => {
    expect(computeProductContributionMarginRatio(7_000, 7_000)).toBeCloseTo(0, 5)
  })
})

// ── classifyProductQuadrant — all 4 quadrant classifications ─────────────────

describe('classifyProductQuadrant — all four quadrant classifications', () => {
  // star: revenuePct >= 20 AND margin >= 30
  it('star: revenuePct=20, margin=30 (exact boundary)', () => {
    expect(classifyProductQuadrant(20, 30)).toBe('star')
  })

  it('star: revenuePct=50, margin=60 (clearly star)', () => {
    expect(classifyProductQuadrant(50, 60)).toBe('star')
  })

  // cash_cow: revenuePct >= 20 AND margin < 30
  it('cash_cow: revenuePct=20, margin=29 (just below margin threshold)', () => {
    expect(classifyProductQuadrant(20, 29)).toBe('cash_cow')
  })

  it('cash_cow: revenuePct=40, margin=10', () => {
    expect(classifyProductQuadrant(40, 10)).toBe('cash_cow')
  })

  // question_mark: revenuePct < 20 AND margin >= 30
  it('question_mark: revenuePct=10, margin=50', () => {
    expect(classifyProductQuadrant(10, 50)).toBe('question_mark')
  })

  it('question_mark: revenuePct=19.99, margin=30 (just below revenue threshold)', () => {
    expect(classifyProductQuadrant(19.99, 30)).toBe('question_mark')
  })

  // dog: revenuePct < 20 AND margin < 30
  it('dog: revenuePct=5, margin=10', () => {
    expect(classifyProductQuadrant(5, 10)).toBe('dog')
  })

  it('dog: null margin (conservative classification)', () => {
    expect(classifyProductQuadrant(50, null)).toBe('dog')
  })

  it('dog: negative margin', () => {
    expect(classifyProductQuadrant(15, -5)).toBe('dog')
  })

  it('star does not include revenuePct=19.99 even with high margin', () => {
    expect(classifyProductQuadrant(19.99, 40)).toBe('question_mark')
  })

  it('cash_cow does not include revenuePct=19.99', () => {
    expect(classifyProductQuadrant(19.99, 20)).toBe('dog')
  })
})

// ── computeWeightedAverageMargin — formula verification ───────────────────────

describe('computeWeightedAverageMargin — formula verification', () => {
  it('single product: result equals that product margin', () => {
    const result = computeWeightedAverageMargin([{ revenue: 5_000, margin_ratio_pct: 45 }])
    expect(result).toBeCloseTo(45, 5)
  })

  it('equal revenues: weighted avg equals simple arithmetic mean', () => {
    // revenue 5000 each; margins 20 and 40 → avg 30
    const result = computeWeightedAverageMargin([
      { revenue: 5_000, margin_ratio_pct: 20 },
      { revenue: 5_000, margin_ratio_pct: 40 },
    ])
    expect(result).toBeCloseTo(30, 5)
  })

  it('higher-revenue product skews average toward its margin', () => {
    // product A: rev 9000, margin 50%; product B: rev 1000, margin 10%
    // weighted: (9000×50 + 1000×10) / 10000 = (450000+10000)/10000 = 46
    const result = computeWeightedAverageMargin([
      { revenue: 9_000, margin_ratio_pct: 50 },
      { revenue: 1_000, margin_ratio_pct: 10 },
    ])
    expect(result).toBeCloseTo(46, 4)
  })

  it('null for empty array', () => {
    expect(computeWeightedAverageMargin([])).toBeNull()
  })

  it('null when all margin_ratio_pct are null', () => {
    expect(computeWeightedAverageMargin([
      { revenue: 1_000, margin_ratio_pct: null },
    ])).toBeNull()
  })
})

// ── computeMixShiftEffect — positive, negative, zero effects ──────────────────

describe('computeMixShiftEffect — positive/negative/zero', () => {
  it('zero when mix is identical between periods', () => {
    const mix = [
      { product_id: 'A', revenue_pct: 60, margin_ratio_pct: 50 },
      { product_id: 'B', revenue_pct: 40, margin_ratio_pct: 20 },
    ]
    expect(computeMixShiftEffect(mix, mix, 100_000)).toBeCloseTo(0, 5)
  })

  it('positive when high-margin product gains share', () => {
    // A (margin 70%) gains 20% → positive effect
    const prior   = [{ product_id: 'A', revenue_pct: 30, margin_ratio_pct: 70 }]
    const current = [{ product_id: 'A', revenue_pct: 50, margin_ratio_pct: 70 }]
    // effect = (50-30)/100 × 100000 × 70/100 = 0.2 × 100000 × 0.7 = 14000
    expect(computeMixShiftEffect(prior, current, 100_000)).toBeCloseTo(14_000, 2)
  })

  it('negative when high-margin product loses share', () => {
    const prior   = [{ product_id: 'A', revenue_pct: 50, margin_ratio_pct: 70 }]
    const current = [{ product_id: 'A', revenue_pct: 30, margin_ratio_pct: 70 }]
    // effect = (30-50)/100 × 100000 × 70/100 = -0.2 × 100000 × 0.7 = -14000
    expect(computeMixShiftEffect(prior, current, 100_000)).toBeCloseTo(-14_000, 2)
  })

  it('zero when no products in common', () => {
    const prior   = [{ product_id: 'A', revenue_pct: 100, margin_ratio_pct: 40 }]
    const current = [{ product_id: 'B', revenue_pct: 100, margin_ratio_pct: 40 }]
    expect(computeMixShiftEffect(prior, current, 50_000)).toBe(0)
  })

  it('zero when current margin is null', () => {
    const prior   = [{ product_id: 'A', revenue_pct: 40, margin_ratio_pct: 50 }]
    const current = [{ product_id: 'A', revenue_pct: 60, margin_ratio_pct: null }]
    expect(computeMixShiftEffect(prior, current, 100_000)).toBe(0)
  })
})

// ── computeProductConcentrationRisk — concentration threshold logic ────────────

describe('computeProductConcentrationRisk — threshold logic', () => {
  it('empty products: HHI=0, top_product_share=null, not concentrated', () => {
    const result = computeProductConcentrationRisk([])
    expect(result.hhi).toBe(0)
    expect(result.top_product_share).toBeNull()
    expect(result.is_concentrated).toBe(false)
  })

  it('single product with 100% share: HHI=10000, concentrated', () => {
    const result = computeProductConcentrationRisk([{ product_id: 'A', revenue: 1_000 }])
    expect(result.hhi).toBeCloseTo(10_000, 2)
    expect(result.top_product_share).toBeCloseTo(100, 5)
    expect(result.is_concentrated).toBe(true)
  })

  it('two equal products (50%/50%): HHI = 5000, concentrated (50% = not > 50, HHI < 2500?)', () => {
    // 50^2 + 50^2 = 2500+2500 = 5000 > 2500 → concentrated
    const result = computeProductConcentrationRisk([
      { product_id: 'A', revenue: 500 },
      { product_id: 'B', revenue: 500 },
    ])
    expect(result.hhi).toBeCloseTo(5_000, 2)
    expect(result.is_concentrated).toBe(true)
  })

  it('max share ≤ 50% and HHI ≤ 2500: not concentrated', () => {
    // 4 products at 25% each: HHI = 4×625 = 2500 (not > 2500) and 25% not > 50%
    const result = computeProductConcentrationRisk([
      { product_id: 'A', revenue: 250 },
      { product_id: 'B', revenue: 250 },
      { product_id: 'C', revenue: 250 },
      { product_id: 'D', revenue: 250 },
    ])
    expect(result.is_concentrated).toBe(false)
  })

  it('top_product_share equals max share percentage', () => {
    const result = computeProductConcentrationRisk([
      { product_id: 'A', revenue: 700 },
      { product_id: 'B', revenue: 300 },
    ])
    expect(result.top_product_share).toBeCloseTo(70, 5)
  })
})

// ── rankProductsByProfit — descending CM order ────────────────────────────────

describe('rankProductsByProfit — descending CM order and empty array', () => {
  it('empty array returns empty array', () => {
    expect(rankProductsByProfit([])).toEqual([])
  })

  it('products sorted by contribution_margin descending', () => {
    const products = [
      { product_id: 'C', product_name: 'C', revenue: 1_000, contribution_margin: 100, margin_ratio_pct: 10, quadrant: 'dog' as const },
      { product_id: 'A', product_name: 'A', revenue: 5_000, contribution_margin: 3_000, margin_ratio_pct: 60, quadrant: 'star' as const },
      { product_id: 'B', product_name: 'B', revenue: 3_000, contribution_margin: 900, margin_ratio_pct: 30, quadrant: 'question_mark' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[0].contribution_margin).toBeGreaterThanOrEqual(ranked[1].contribution_margin)
    expect(ranked[1].contribution_margin).toBeGreaterThanOrEqual(ranked[2].contribution_margin)
  })

  it('rank 1 is the most profitable product', () => {
    const products = [
      { product_id: 'low', product_name: 'low', revenue: 1_000, contribution_margin: 100, margin_ratio_pct: 10, quadrant: 'dog' as const },
      { product_id: 'high', product_name: 'high', revenue: 5_000, contribution_margin: 4_000, margin_ratio_pct: 80, quadrant: 'star' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[0].product_id).toBe('high')
    expect(ranked[0].rank).toBe(1)
  })

  it('negative CM products rank last', () => {
    const products = [
      { product_id: 'loss', product_name: 'loss', revenue: 1_000, contribution_margin: -200, margin_ratio_pct: -20, quadrant: 'dog' as const },
      { product_id: 'profit', product_name: 'profit', revenue: 3_000, contribution_margin: 900, margin_ratio_pct: 30, quadrant: 'cash_cow' as const },
    ]
    const ranked = rankProductsByProfit(products)
    expect(ranked[ranked.length - 1].product_id).toBe('loss')
  })

  it('does not mutate original order', () => {
    const products = [
      { product_id: 'B', product_name: 'B', revenue: 2_000, contribution_margin: 500, margin_ratio_pct: 25, quadrant: 'dog' as const },
      { product_id: 'A', product_name: 'A', revenue: 5_000, contribution_margin: 3_000, margin_ratio_pct: 60, quadrant: 'star' as const },
    ]
    rankProductsByProfit(products)
    expect(products[0].product_id).toBe('B')
  })
})
