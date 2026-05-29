/**
 * SKU Performance Analytics — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAvgSellingPrice,
  computeSkuGrossMarginPct,
  computeRevenueContributionPct,
  computeUnitsVelocity,
  computeStockCoverageDays,
  computeRevenueScore,
  computeMarginScore,
  computeVelocityScore,
  computeSkuCompositeScore,
  classifySkuQuadrant,
  classifySkuPerformanceTier,
  buildSkuScore,
  rankSkusByScore,
  findParetoSkus,
  computePortfolioBalanceScore,
  identifyStockoutRisk,
  computePriceRealization,
  type SkuMetrics,
  type SkuScore,
} from '../lib/services/commercial/sku-performance.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<SkuMetrics> = {}): SkuMetrics {
  return {
    product_id:               'p1',
    product_name:             'Test Product',
    sku_code:                 'SKU-001',
    revenue_try:              100_000,
    units_sold:               1_000,
    avg_selling_price:        100,
    gross_margin_try:         40_000,
    gross_margin_pct:         40,
    avg_cost_try:             60,
    revenue_contribution_pct: 20,
    units_velocity:           10,
    stock_coverage_days:      30,
    is_stockout:              false,
    ...overrides,
  }
}

// ── computeAvgSellingPrice ────────────────────────────────────────────────────

describe('computeAvgSellingPrice', () => {

  it('1. zero units → returns 0 (no NaN/Infinity)', () => {
    expect(computeAvgSellingPrice(50_000, 0)).toBe(0)
  })

  it('2. normal case → revenue / units', () => {
    expect(computeAvgSellingPrice(100_000, 1_000)).toBe(100)
  })

  it('3. single unit → equals revenue', () => {
    expect(computeAvgSellingPrice(250, 1)).toBe(250)
  })

  it('4. fractional result', () => {
    expect(computeAvgSellingPrice(100, 3)).toBeCloseTo(33.333, 2)
  })

  it('5. zero revenue and zero units → 0', () => {
    expect(computeAvgSellingPrice(0, 0)).toBe(0)
  })

})

// ── computeSkuGrossMarginPct ──────────────────────────────────────────────────

describe('computeSkuGrossMarginPct', () => {

  it('6. zero revenue → 0 (no NaN/Infinity)', () => {
    expect(computeSkuGrossMarginPct(0, 0)).toBe(0)
  })

  it('7. zero revenue with cost → 0', () => {
    expect(computeSkuGrossMarginPct(0, 5_000)).toBe(0)
  })

  it('8. 40% margin', () => {
    expect(computeSkuGrossMarginPct(100_000, 60_000)).toBe(40)
  })

  it('9. 100% margin (zero cost)', () => {
    expect(computeSkuGrossMarginPct(100_000, 0)).toBe(100)
  })

  it('10. negative margin (cost > revenue)', () => {
    expect(computeSkuGrossMarginPct(80_000, 100_000)).toBe(-25)
  })

  it('11. 50% margin', () => {
    expect(computeSkuGrossMarginPct(200_000, 100_000)).toBe(50)
  })

})

// ── computeRevenueContributionPct ─────────────────────────────────────────────

describe('computeRevenueContributionPct', () => {

  it('12. zero total revenue → 0', () => {
    expect(computeRevenueContributionPct(10_000, 0)).toBe(0)
  })

  it('13. single SKU = 100% of revenue → 100', () => {
    expect(computeRevenueContributionPct(50_000, 50_000)).toBe(100)
  })

  it('14. half of total → 50%', () => {
    expect(computeRevenueContributionPct(50_000, 100_000)).toBe(50)
  })

  it('15. small SKU', () => {
    expect(computeRevenueContributionPct(1_000, 100_000)).toBe(1)
  })

  it('16. 20% of revenue', () => {
    expect(computeRevenueContributionPct(20_000, 100_000)).toBe(20)
  })

})

// ── computeUnitsVelocity ──────────────────────────────────────────────────────

describe('computeUnitsVelocity', () => {

  it('17. 90 units in 90 days → 30/month', () => {
    expect(computeUnitsVelocity(90, 90)).toBe(30)
  })

  it('18. zero days → 0 (no Infinity)', () => {
    expect(computeUnitsVelocity(100, 0)).toBe(0)
  })

  it('19. 0 units → 0', () => {
    expect(computeUnitsVelocity(0, 90)).toBe(0)
  })

  it('20. 30 units in 90 days → 10/month', () => {
    expect(computeUnitsVelocity(30, 90)).toBeCloseTo(10)
  })

  it('21. 1 unit in 30 days → 1/month', () => {
    expect(computeUnitsVelocity(1, 30)).toBe(1)
  })

  it('22. 300 units in 90 days → 100/month', () => {
    expect(computeUnitsVelocity(300, 90)).toBeCloseTo(100)
  })

})

// ── computeStockCoverageDays ──────────────────────────────────────────────────

describe('computeStockCoverageDays', () => {

  it('23. zero stock → null', () => {
    expect(computeStockCoverageDays(0, 10)).toBeNull()
  })

  it('24. zero daily rate → null', () => {
    expect(computeStockCoverageDays(100, 0)).toBeNull()
  })

  it('25. both zero → null', () => {
    expect(computeStockCoverageDays(0, 0)).toBeNull()
  })

  it('26. 300 stock / 10 per day → 30 days', () => {
    expect(computeStockCoverageDays(300, 10)).toBe(30)
  })

  it('27. 7 stock / 1 per day → 7 days', () => {
    expect(computeStockCoverageDays(7, 1)).toBe(7)
  })

  it('28. fractional result', () => {
    expect(computeStockCoverageDays(5, 3)).toBeCloseTo(1.667, 2)
  })

})

// ── computeRevenueScore ───────────────────────────────────────────────────────

describe('computeRevenueScore', () => {

  it('29. contribution 30% → score 100 (capped)', () => {
    expect(computeRevenueScore(30)).toBe(100)
  })

  it('30. contribution 25% → score 100 (capped at exactly 100)', () => {
    expect(computeRevenueScore(25)).toBe(100)
  })

  it('31. contribution 10% → score 40', () => {
    expect(computeRevenueScore(10)).toBe(40)
  })

  it('32. contribution 5% → score 20', () => {
    expect(computeRevenueScore(5)).toBe(20)
  })

  it('33. contribution 0% → score 0', () => {
    expect(computeRevenueScore(0)).toBe(0)
  })

  it('34. contribution 50% → capped at 100', () => {
    expect(computeRevenueScore(50)).toBe(100)
  })

  it('35. contribution 15% → 60', () => {
    expect(computeRevenueScore(15)).toBe(60)
  })

})

// ── computeMarginScore ────────────────────────────────────────────────────────

describe('computeMarginScore', () => {

  it('36. margin 40% → score 40 (direct passthrough)', () => {
    expect(computeMarginScore(40)).toBe(40)
  })

  it('37. margin 100% → score 100 (not above cap)', () => {
    expect(computeMarginScore(100)).toBe(100)
  })

  it('38. margin 0% → score 0', () => {
    expect(computeMarginScore(0)).toBe(0)
  })

  it('39. margin 120% → score 100 (capped)', () => {
    expect(computeMarginScore(120)).toBe(100)
  })

  it('40. negative margin → score 0 (floor at 0)', () => {
    expect(computeMarginScore(-20)).toBe(0)
  })

  it('41. margin 50% → score 50', () => {
    expect(computeMarginScore(50)).toBe(50)
  })

})

// ── computeVelocityScore ──────────────────────────────────────────────────────

describe('computeVelocityScore', () => {

  it('42. 5 units/month → score 50', () => {
    expect(computeVelocityScore(5)).toBe(50)
  })

  it('43. 15 units/month → score 100 (capped)', () => {
    expect(computeVelocityScore(15)).toBe(100)
  })

  it('44. 10 units/month → score 100 (exactly at cap)', () => {
    expect(computeVelocityScore(10)).toBe(100)
  })

  it('45. 0 units/month → score 0', () => {
    expect(computeVelocityScore(0)).toBe(0)
  })

  it('46. 2 units/month → score 20', () => {
    expect(computeVelocityScore(2)).toBe(20)
  })

  it('47. 7.5 units/month → score 75', () => {
    expect(computeVelocityScore(7.5)).toBe(75)
  })

})

// ── computeSkuCompositeScore ──────────────────────────────────────────────────

describe('computeSkuCompositeScore', () => {

  it('48. all 100 → composite 100', () => {
    expect(computeSkuCompositeScore(100, 100, 100)).toBe(100)
  })

  it('49. all 0 → composite 0', () => {
    expect(computeSkuCompositeScore(0, 0, 0)).toBe(0)
  })

  it('50. weights sum to 1 (35+35+30)', () => {
    // 100×0.35 + 0×0.35 + 0×0.30 = 35
    expect(computeSkuCompositeScore(100, 0, 0)).toBeCloseTo(35, 5)
    // 0×0.35 + 100×0.35 + 0×0.30 = 35
    expect(computeSkuCompositeScore(0, 100, 0)).toBeCloseTo(35, 5)
    // 0×0.35 + 0×0.35 + 100×0.30 = 30
    expect(computeSkuCompositeScore(0, 0, 100)).toBeCloseTo(30, 5)
  })

  it('51. equal scores → equals each component', () => {
    expect(computeSkuCompositeScore(60, 60, 60)).toBeCloseTo(60, 5)
  })

  it('52. mixed scores with exact calculation', () => {
    // 80×0.35 + 60×0.35 + 40×0.30 = 28 + 21 + 12 = 61
    expect(computeSkuCompositeScore(80, 60, 40)).toBeCloseTo(61, 5)
  })

})

// ── classifySkuQuadrant ───────────────────────────────────────────────────────

describe('classifySkuQuadrant', () => {

  it('53. star: contribution ≥ 10% AND margin ≥ 30%', () => {
    expect(classifySkuQuadrant(15, 40)).toBe('star')
  })

  it('54. cash_cow: contribution ≥ 10% AND margin < 30%', () => {
    expect(classifySkuQuadrant(12, 20)).toBe('cash_cow')
  })

  it('55. question_mark: contribution < 10% AND margin ≥ 30%', () => {
    expect(classifySkuQuadrant(5, 35)).toBe('question_mark')
  })

  it('56. dog: contribution < 10% AND margin < 30%', () => {
    expect(classifySkuQuadrant(3, 10)).toBe('dog')
  })

  it('57. exactly on thresholds (10% contribution, 30% margin) → star', () => {
    expect(classifySkuQuadrant(10, 30)).toBe('star')
  })

  it('58. zero contribution, zero margin → dog', () => {
    expect(classifySkuQuadrant(0, 0)).toBe('dog')
  })

})

// ── classifySkuPerformanceTier ────────────────────────────────────────────────

describe('classifySkuPerformanceTier', () => {

  it('59. composite ≥ 75 → top', () => {
    expect(classifySkuPerformanceTier(80, 5)).toBe('top')
  })

  it('60. composite ≥ 50 and < 75 → core', () => {
    expect(classifySkuPerformanceTier(60, 3)).toBe('core')
  })

  it('61. composite ≥ 30 AND velocity > 0 → niche', () => {
    expect(classifySkuPerformanceTier(40, 1)).toBe('niche')
  })

  it('62. composite ≥ 30 AND velocity = 0 → underperformer', () => {
    expect(classifySkuPerformanceTier(35, 0)).toBe('underperformer')
  })

  it('63. composite < 30 → discontinued', () => {
    expect(classifySkuPerformanceTier(25, 5)).toBe('discontinued')
  })

  it('64. exactly at 75 → top', () => {
    expect(classifySkuPerformanceTier(75, 1)).toBe('top')
  })

  it('65. exactly at 50 → core', () => {
    expect(classifySkuPerformanceTier(50, 2)).toBe('core')
  })

  it('66. exactly at 30 with velocity → niche', () => {
    expect(classifySkuPerformanceTier(30, 0.1)).toBe('niche')
  })

  it('67. exactly at 30 with zero velocity → underperformer', () => {
    expect(classifySkuPerformanceTier(30, 0)).toBe('underperformer')
  })

})

// ── buildSkuScore ─────────────────────────────────────────────────────────────

describe('buildSkuScore', () => {

  it('68. builds correct product_id', () => {
    const m = makeMetrics({ product_id: 'prod-xyz' })
    const s = buildSkuScore(m)
    expect(s.product_id).toBe('prod-xyz')
  })

  it('69. revenue_score = contribution × 4 (capped)', () => {
    const m = makeMetrics({ revenue_contribution_pct: 10 })
    expect(buildSkuScore(m).revenue_score).toBe(40)
  })

  it('70. margin_score = gross_margin_pct', () => {
    const m = makeMetrics({ gross_margin_pct: 45 })
    expect(buildSkuScore(m).margin_score).toBe(45)
  })

  it('71. velocity_score = velocity × 10 capped', () => {
    const m = makeMetrics({ units_velocity: 7 })
    expect(buildSkuScore(m).velocity_score).toBe(70)
  })

  it('72. composite_score is weighted average', () => {
    // contribution 20% → revenue_score 80; margin 40% → 40; velocity 10 → 100
    // 80×0.35 + 40×0.35 + 100×0.30 = 28 + 14 + 30 = 72
    const m = makeMetrics({
      revenue_contribution_pct: 20,
      gross_margin_pct:         40,
      units_velocity:           10,
    })
    expect(buildSkuScore(m).composite_score).toBeCloseTo(72, 4)
  })

  it('73. quadrant is correctly classified', () => {
    // contribution 20% ≥ 10, margin 40% ≥ 30 → star
    const m = makeMetrics({ revenue_contribution_pct: 20, gross_margin_pct: 40 })
    expect(buildSkuScore(m).quadrant).toBe('star')
  })

  it('74. performance_tier is correctly classified', () => {
    const m = makeMetrics({ revenue_contribution_pct: 20, gross_margin_pct: 40, units_velocity: 10 })
    const s = buildSkuScore(m)
    // revenue_score=80, margin_score=40, velocity_score=100 → composite=72 → core
    expect(s.performance_tier).toBe('core')
  })

})

// ── rankSkusByScore ───────────────────────────────────────────────────────────

describe('rankSkusByScore', () => {

  function makeScore(id: string, composite: number): SkuScore {
    return {
      product_id:       id,
      revenue_score:    50,
      margin_score:     50,
      velocity_score:   50,
      composite_score:  composite,
      quadrant:         'star',
      performance_tier: 'core',
    }
  }

  it('75. sorts descending by composite_score', () => {
    const input = [makeScore('b', 40), makeScore('a', 80), makeScore('c', 60)]
    const ranked = rankSkusByScore(input)
    expect(ranked.map(s => s.product_id)).toEqual(['a', 'c', 'b'])
  })

  it('76. empty array → empty array', () => {
    expect(rankSkusByScore([])).toEqual([])
  })

  it('77. single item → returned unchanged', () => {
    const single = [makeScore('x', 55)]
    expect(rankSkusByScore(single)).toHaveLength(1)
  })

  it('78. does not mutate original array', () => {
    const input = [makeScore('b', 40), makeScore('a', 80)]
    const original = [...input]
    rankSkusByScore(input)
    expect(input[0].product_id).toBe(original[0].product_id)
  })

})

// ── findParetoSkus ────────────────────────────────────────────────────────────

describe('findParetoSkus', () => {

  it('79. minimum set covering 80% of revenue', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 60_000 }),
      makeMetrics({ product_id: 'b', revenue_try: 25_000 }),
      makeMetrics({ product_id: 'c', revenue_try: 10_000 }),
      makeMetrics({ product_id: 'd', revenue_try: 5_000 }),
    ]
    // Total = 100k. 80% = 80k. a(60) + b(25) = 85k → covers 80%
    const pareto = findParetoSkus(skus)
    expect(pareto).toHaveLength(2)
    expect(pareto.map(s => s.product_id)).toContain('a')
    expect(pareto.map(s => s.product_id)).toContain('b')
  })

  it('80. empty list → empty list', () => {
    expect(findParetoSkus([])).toEqual([])
  })

  it('81. all zero revenue → empty list', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 0 }),
      makeMetrics({ product_id: 'b', revenue_try: 0 }),
    ]
    expect(findParetoSkus(skus)).toEqual([])
  })

  it('82. custom threshold 50% with two SKUs', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 60_000 }),
      makeMetrics({ product_id: 'b', revenue_try: 40_000 }),
    ]
    // 50% of 100k = 50k. Only 'a' (60k) needed.
    const pareto = findParetoSkus(skus, 50)
    expect(pareto).toHaveLength(1)
    expect(pareto[0].product_id).toBe('a')
  })

  it('83. single SKU always returned', () => {
    const skus = [makeMetrics({ product_id: 'only', revenue_try: 100_000 })]
    expect(findParetoSkus(skus)).toHaveLength(1)
  })

})

// ── computePortfolioBalanceScore ──────────────────────────────────────────────

describe('computePortfolioBalanceScore', () => {

  it('84. single SKU → near 0 (fully concentrated)', () => {
    const skus = [makeMetrics({ product_id: 'only', revenue_try: 100_000 })]
    expect(computePortfolioBalanceScore(skus)).toBeCloseTo(0, 5)
  })

  it('85. two equal SKUs → score = 50', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 50_000 }),
      makeMetrics({ product_id: 'b', revenue_try: 50_000 }),
    ]
    // HHI = 0.5² + 0.5² = 0.5 → score = 100 × (1 - 0.5) = 50
    expect(computePortfolioBalanceScore(skus)).toBeCloseTo(50, 5)
  })

  it('86. four equal SKUs → score = 75', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 25_000 }),
      makeMetrics({ product_id: 'b', revenue_try: 25_000 }),
      makeMetrics({ product_id: 'c', revenue_try: 25_000 }),
      makeMetrics({ product_id: 'd', revenue_try: 25_000 }),
    ]
    // HHI = 4 × 0.25² = 0.25 → score = 75
    expect(computePortfolioBalanceScore(skus)).toBeCloseTo(75, 5)
  })

  it('87. empty list → 0', () => {
    expect(computePortfolioBalanceScore([])).toBe(0)
  })

  it('88. all zero revenue → 0', () => {
    const skus = [
      makeMetrics({ product_id: 'a', revenue_try: 0 }),
      makeMetrics({ product_id: 'b', revenue_try: 0 }),
    ]
    expect(computePortfolioBalanceScore(skus)).toBe(0)
  })

})

// ── identifyStockoutRisk ──────────────────────────────────────────────────────

describe('identifyStockoutRisk', () => {

  it('89. is_stockout = true → always included', () => {
    const skus = [
      makeMetrics({ product_id: 'out', is_stockout: true, stock_coverage_days: null }),
      makeMetrics({ product_id: 'ok',  is_stockout: false, stock_coverage_days: 30 }),
    ]
    const risk = identifyStockoutRisk(skus)
    expect(risk).toHaveLength(1)
    expect(risk[0].product_id).toBe('out')
  })

  it('90. coverage < threshold → included', () => {
    const skus = [
      makeMetrics({ product_id: 'low',  is_stockout: false, stock_coverage_days: 5 }),
      makeMetrics({ product_id: 'high', is_stockout: false, stock_coverage_days: 20 }),
    ]
    const risk = identifyStockoutRisk(skus, 7)
    expect(risk).toHaveLength(1)
    expect(risk[0].product_id).toBe('low')
  })

  it('91. exactly at threshold → not included', () => {
    const sku = makeMetrics({ product_id: 'exact', is_stockout: false, stock_coverage_days: 7 })
    const risk = identifyStockoutRisk([sku], 7)
    expect(risk).toHaveLength(0)
  })

  it('92. null coverage → not included (no data = not a risk signal)', () => {
    const sku = makeMetrics({ product_id: 'nodata', is_stockout: false, stock_coverage_days: null })
    const risk = identifyStockoutRisk([sku])
    expect(risk).toHaveLength(0)
  })

  it('93. empty list → empty list', () => {
    expect(identifyStockoutRisk([])).toEqual([])
  })

  it('94. default threshold is 7 days', () => {
    const skus = [
      makeMetrics({ product_id: 'a', is_stockout: false, stock_coverage_days: 6 }),
      makeMetrics({ product_id: 'b', is_stockout: false, stock_coverage_days: 8 }),
    ]
    const risk = identifyStockoutRisk(skus) // default threshold
    expect(risk).toHaveLength(1)
    expect(risk[0].product_id).toBe('a')
  })

  it('95. both stockout and low coverage → each included once', () => {
    const skus = [
      makeMetrics({ product_id: 'a', is_stockout: true,  stock_coverage_days: 3 }),
      makeMetrics({ product_id: 'b', is_stockout: false, stock_coverage_days: 4 }),
      makeMetrics({ product_id: 'c', is_stockout: false, stock_coverage_days: 10 }),
    ]
    const risk = identifyStockoutRisk(skus)
    expect(risk).toHaveLength(2)
  })

})

// ── computePriceRealization ───────────────────────────────────────────────────

describe('computePriceRealization', () => {

  it('96. null list_price → null', () => {
    expect(computePriceRealization(100, null)).toBeNull()
  })

  it('97. zero list_price → null', () => {
    expect(computePriceRealization(100, 0)).toBeNull()
  })

  it('98. perfect realization → 100%', () => {
    expect(computePriceRealization(100, 100)).toBe(100)
  })

  it('99. 80% realization (discount applied)', () => {
    expect(computePriceRealization(80, 100)).toBe(80)
  })

  it('100. over-realization (premium sold)', () => {
    expect(computePriceRealization(120, 100)).toBe(120)
  })

  it('101. avg_price 0, list_price 100 → 0% realization', () => {
    expect(computePriceRealization(0, 100)).toBe(0)
  })

  it('102. fractional result', () => {
    expect(computePriceRealization(75, 90)).toBeCloseTo(83.333, 2)
  })

})
