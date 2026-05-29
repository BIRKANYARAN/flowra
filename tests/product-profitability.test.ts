/**
 * Product Profitability Service — unit tests
 *
 * Tests pure computation logic of ProductProfitabilityService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeContributionMargin,
  computeContributionMarginRatio,
  computeGrossProfit,
  computeGrossMarginPct,
  computeAvgSellingPrice,
  computeAvgCostPerUnit,
  computeRevenuePerTransaction,
  computeRevenueShare,
  computeVolumeShare,
  computeMarginMixIndex,
  classifyProductTier,
  classifyProductTrend,
  computePortfolioGrossMargin,
  rankProductsByMetric,
  computeWeightedAvgMargin,
  getTopProductsByRevenue,
  computeTopNConcentration,
  generateProductProfitabilityNarrative,
} from '../lib/services/commercial/product-profitability.service'

// ── computeContributionMargin ─────────────────────────────────────────────────

describe('computeContributionMargin', () => {
  it('1. positive revenue and costs → positive margin', () => {
    expect(computeContributionMargin(100_000, 60_000)).toBe(40_000)
  })

  it('2. costs exceed revenue → negative margin', () => {
    expect(computeContributionMargin(50_000, 70_000)).toBe(-20_000)
  })

  it('3. equal revenue and costs → zero margin', () => {
    expect(computeContributionMargin(30_000, 30_000)).toBe(0)
  })

  it('4. zero variable costs → contribution equals revenue', () => {
    expect(computeContributionMargin(80_000, 0)).toBe(80_000)
  })

  it('5. zero revenue and costs → zero', () => {
    expect(computeContributionMargin(0, 0)).toBe(0)
  })
})

// ── computeContributionMarginRatio ────────────────────────────────────────────

describe('computeContributionMarginRatio', () => {
  it('6. 40k margin, 100k revenue → 40%', () => {
    expect(computeContributionMarginRatio(40_000, 100_000)).toBeCloseTo(40)
  })

  it('7. zero revenue → null', () => {
    expect(computeContributionMarginRatio(10_000, 0)).toBeNull()
  })

  it('8. negative margin → negative ratio', () => {
    expect(computeContributionMarginRatio(-20_000, 100_000)).toBeCloseTo(-20)
  })

  it('9. zero margin → 0%', () => {
    expect(computeContributionMarginRatio(0, 50_000)).toBeCloseTo(0)
  })

  it('10. full margin (margin equals revenue) → 100%', () => {
    expect(computeContributionMarginRatio(100_000, 100_000)).toBeCloseTo(100)
  })
})

// ── computeGrossProfit ────────────────────────────────────────────────────────

describe('computeGrossProfit', () => {
  it('11. revenue 200k, cogs 120k → 80k gross profit', () => {
    expect(computeGrossProfit(200_000, 120_000)).toBe(80_000)
  })

  it('12. zero cogs → gross profit equals revenue', () => {
    expect(computeGrossProfit(150_000, 0)).toBe(150_000)
  })

  it('13. cogs greater than revenue → negative gross profit', () => {
    expect(computeGrossProfit(100_000, 130_000)).toBe(-30_000)
  })

  it('14. both zero → zero', () => {
    expect(computeGrossProfit(0, 0)).toBe(0)
  })
})

// ── computeGrossMarginPct ─────────────────────────────────────────────────────

describe('computeGrossMarginPct', () => {
  it('15. 80k gross profit, 200k revenue → 40%', () => {
    expect(computeGrossMarginPct(80_000, 200_000)).toBeCloseTo(40)
  })

  it('16. zero revenue → null', () => {
    expect(computeGrossMarginPct(80_000, 0)).toBeNull()
  })

  it('17. negative gross profit → negative margin pct', () => {
    expect(computeGrossMarginPct(-30_000, 100_000)).toBeCloseTo(-30)
  })

  it('18. zero gross profit → 0%', () => {
    expect(computeGrossMarginPct(0, 100_000)).toBeCloseTo(0)
  })

  it('19. gross profit equals revenue → 100%', () => {
    expect(computeGrossMarginPct(50_000, 50_000)).toBeCloseTo(100)
  })
})

// ── computeAvgSellingPrice ────────────────────────────────────────────────────

describe('computeAvgSellingPrice', () => {
  it('20. 300k revenue, 100 units → 3000 per unit', () => {
    expect(computeAvgSellingPrice(300_000, 100)).toBe(3000)
  })

  it('21. zero units → null', () => {
    expect(computeAvgSellingPrice(300_000, 0)).toBeNull()
  })

  it('22. zero revenue, positive units → 0', () => {
    expect(computeAvgSellingPrice(0, 50)).toBe(0)
  })

  it('23. fractional result', () => {
    expect(computeAvgSellingPrice(100, 3)).toBeCloseTo(33.333, 2)
  })
})

// ── computeAvgCostPerUnit ─────────────────────────────────────────────────────

describe('computeAvgCostPerUnit', () => {
  it('24. 180k cogs, 100 units → 1800 per unit', () => {
    expect(computeAvgCostPerUnit(180_000, 100)).toBe(1800)
  })

  it('25. zero units → null', () => {
    expect(computeAvgCostPerUnit(180_000, 0)).toBeNull()
  })

  it('26. zero cogs, positive units → 0', () => {
    expect(computeAvgCostPerUnit(0, 20)).toBe(0)
  })
})

// ── computeRevenuePerTransaction ──────────────────────────────────────────────

describe('computeRevenuePerTransaction', () => {
  it('27. 500k revenue, 50 transactions → 10k per transaction', () => {
    expect(computeRevenuePerTransaction(500_000, 50)).toBe(10_000)
  })

  it('28. zero transactions → null', () => {
    expect(computeRevenuePerTransaction(500_000, 0)).toBeNull()
  })

  it('29. zero revenue, positive transactions → 0', () => {
    expect(computeRevenuePerTransaction(0, 10)).toBe(0)
  })

  it('30. single transaction', () => {
    expect(computeRevenuePerTransaction(75_000, 1)).toBe(75_000)
  })
})

// ── computeRevenueShare ───────────────────────────────────────────────────────

describe('computeRevenueShare', () => {
  it('31. 25k of 100k total → 25%', () => {
    expect(computeRevenueShare(25_000, 100_000)).toBeCloseTo(25)
  })

  it('32. zero total revenue → null', () => {
    expect(computeRevenueShare(25_000, 0)).toBeNull()
  })

  it('33. zero product revenue → 0%', () => {
    expect(computeRevenueShare(0, 100_000)).toBeCloseTo(0)
  })

  it('34. product revenue equals total → 100%', () => {
    expect(computeRevenueShare(100_000, 100_000)).toBeCloseTo(100)
  })

  it('35. small share → correct percentage', () => {
    expect(computeRevenueShare(1_000, 200_000)).toBeCloseTo(0.5)
  })
})

// ── computeVolumeShare ────────────────────────────────────────────────────────

describe('computeVolumeShare', () => {
  it('36. 30 of 100 total units → 30%', () => {
    expect(computeVolumeShare(30, 100)).toBeCloseTo(30)
  })

  it('37. zero total units → null', () => {
    expect(computeVolumeShare(30, 0)).toBeNull()
  })

  it('38. zero product units → 0%', () => {
    expect(computeVolumeShare(0, 100)).toBeCloseTo(0)
  })

  it('39. all units belong to product → 100%', () => {
    expect(computeVolumeShare(50, 50)).toBeCloseTo(100)
  })
})

// ── computeMarginMixIndex ─────────────────────────────────────────────────────

describe('computeMarginMixIndex', () => {
  it('40. revenue share 30%, volume share 20% → +10 (premium pricing)', () => {
    expect(computeMarginMixIndex(30, 20)).toBeCloseTo(10)
  })

  it('41. revenue share 10%, volume share 30% → -20 (discount pricing)', () => {
    expect(computeMarginMixIndex(10, 30)).toBeCloseTo(-20)
  })

  it('42. equal shares → 0', () => {
    expect(computeMarginMixIndex(25, 25)).toBeCloseTo(0)
  })

  it('43. null revenue share → null', () => {
    expect(computeMarginMixIndex(null, 20)).toBeNull()
  })

  it('44. null volume share → null', () => {
    expect(computeMarginMixIndex(30, null)).toBeNull()
  })

  it('45. both null → null', () => {
    expect(computeMarginMixIndex(null, null)).toBeNull()
  })
})

// ── classifyProductTier ───────────────────────────────────────────────────────

describe('classifyProductTier', () => {
  it('46. null grossMarginPct → insufficient_data', () => {
    expect(classifyProductTier(null, 20)).toBe('insufficient_data')
  })

  it('47. negative grossMarginPct → loss_leader', () => {
    expect(classifyProductTier(-5, 20)).toBe('loss_leader')
  })

  it('48. exactly 0% grossMarginPct → loss_leader is not expected; 0% is low_margin', () => {
    expect(classifyProductTier(0, 20)).toBe('low_margin')
  })

  it('49. grossMarginPct >= 40 AND revenueShare >= 10 → star', () => {
    expect(classifyProductTier(45, 15)).toBe('star')
  })

  it('50. grossMarginPct = 40 AND revenueShare = 10 → star (exact boundary)', () => {
    expect(classifyProductTier(40, 10)).toBe('star')
  })

  it('51. grossMarginPct = 39.9 (below 40) with high share → hero or workhorse, not star', () => {
    // 39.9 with share 15 → not star; 39.9 >= 30 and share >= 5 → hero
    expect(classifyProductTier(39.9, 15)).toBe('hero')
  })

  it('52. grossMarginPct >= 30 AND revenueShare >= 5 → hero', () => {
    expect(classifyProductTier(35, 8)).toBe('hero')
  })

  it('53. grossMarginPct = 30 AND revenueShare = 5 → hero (exact boundary)', () => {
    expect(classifyProductTier(30, 5)).toBe('hero')
  })

  it('54. grossMarginPct >= 15 AND revenueShare >= 1 → workhorse', () => {
    expect(classifyProductTier(25, 3)).toBe('workhorse')
  })

  it('55. grossMarginPct = 15 AND revenueShare = 1 → workhorse (exact boundary)', () => {
    expect(classifyProductTier(15, 1)).toBe('workhorse')
  })

  it('56. grossMarginPct = 5 (0-15 range) → low_margin', () => {
    expect(classifyProductTier(5, 20)).toBe('low_margin')
  })

  it('57. grossMarginPct = 14.9 (just below 15) → low_margin', () => {
    expect(classifyProductTier(14.9, 20)).toBe('low_margin')
  })

  it('58. grossMarginPct >= 40 but revenueShare < 10 → not star', () => {
    // 45% margin but only 5% share → should be hero (>= 30 and >= 5)
    expect(classifyProductTier(45, 5)).toBe('hero')
  })

  it('59. grossMarginPct >= 40 but revenueShare = null → low_margin', () => {
    expect(classifyProductTier(45, null)).toBe('low_margin')
  })

  it('60. loss_leader has priority over insufficient_data', () => {
    expect(classifyProductTier(-0.01, null)).toBe('loss_leader')
  })

  it('61. star requires BOTH high margin AND high share', () => {
    expect(classifyProductTier(50, 9.9)).not.toBe('star')
  })
})

// ── classifyProductTrend ──────────────────────────────────────────────────────

describe('classifyProductTrend', () => {
  it('62. priorRevenue null → new_product', () => {
    expect(classifyProductTrend(10_000, null)).toBe('new_product')
  })

  it('63. currentRevenue 0, priorRevenue > 0 → discontinued', () => {
    expect(classifyProductTrend(0, 50_000)).toBe('discontinued')
  })

  it('64. both zero revenue, prior 0 → new_product', () => {
    expect(classifyProductTrend(0, 0)).toBe('new_product')
  })

  it('65. +20% change → growing', () => {
    expect(classifyProductTrend(120, 100)).toBe('growing')
  })

  it('66. exactly +10% → growing (boundary > 10 means +10 is NOT growing)', () => {
    // change = (110 - 100) / 100 * 100 = 10% — boundary is strictly > 10
    expect(classifyProductTrend(110, 100)).toBe('stable')
  })

  it('67. +10.1% → growing', () => {
    expect(classifyProductTrend(110.1, 100)).toBe('growing')
  })

  it('68. 0% change → stable', () => {
    expect(classifyProductTrend(100, 100)).toBe('stable')
  })

  it('69. -5% change → stable', () => {
    expect(classifyProductTrend(95, 100)).toBe('stable')
  })

  it('70. exactly -10% change → stable (boundary: -10% to +10% is stable)', () => {
    expect(classifyProductTrend(90, 100)).toBe('stable')
  })

  it('71. -10.1% change → declining', () => {
    expect(classifyProductTrend(89.9, 100)).toBe('declining')
  })

  it('72. -20% change → declining', () => {
    expect(classifyProductTrend(80, 100)).toBe('declining')
  })

  it('73. exactly -25% change → declining (boundary)', () => {
    expect(classifyProductTrend(75, 100)).toBe('declining')
  })

  it('74. -25.1% change → rapidly_declining', () => {
    expect(classifyProductTrend(74.9, 100)).toBe('rapidly_declining')
  })

  it('75. -50% change → rapidly_declining', () => {
    expect(classifyProductTrend(50, 100)).toBe('rapidly_declining')
  })

  it('76. prior revenue 0 (new product this period, prior had 0) → new_product', () => {
    expect(classifyProductTrend(10_000, 0)).toBe('new_product')
  })
})

// ── computePortfolioGrossMargin ───────────────────────────────────────────────

describe('computePortfolioGrossMargin', () => {
  it('77. single product 40% margin → 40%', () => {
    expect(computePortfolioGrossMargin([
      { revenue: 100_000, cogs: 60_000 },
    ])).toBeCloseTo(40)
  })

  it('78. two products weighted correctly', () => {
    // Product A: 200k rev, 120k cogs (80k GP)
    // Product B: 100k rev, 80k cogs (20k GP)
    // Total: 300k rev, 100k GP → 33.33%
    expect(computePortfolioGrossMargin([
      { revenue: 200_000, cogs: 120_000 },
      { revenue: 100_000, cogs: 80_000 },
    ])).toBeCloseTo(33.333, 1)
  })

  it('79. zero total revenue → null', () => {
    expect(computePortfolioGrossMargin([
      { revenue: 0, cogs: 0 },
    ])).toBeNull()
  })

  it('80. empty array → null', () => {
    expect(computePortfolioGrossMargin([])).toBeNull()
  })

  it('81. product with negative margin reduces portfolio margin', () => {
    const result = computePortfolioGrossMargin([
      { revenue: 100_000, cogs: 40_000 },   // 60% margin
      { revenue: 100_000, cogs: 120_000 },  // -20% margin
    ])
    expect(result).toBeCloseTo(20)  // (60k - 20k) / 200k = 20%
  })
})

// ── rankProductsByMetric ──────────────────────────────────────────────────────

describe('rankProductsByMetric', () => {
  const products = [
    { name: 'A', score: 10 },
    { name: 'B', score: 30 },
    { name: 'C', score: 20 },
  ]

  it('82. descending by default', () => {
    const result = rankProductsByMetric(products, p => p.score)
    expect(result.map(p => p.name)).toEqual(['B', 'C', 'A'])
  })

  it('83. ascending when flag is true', () => {
    const result = rankProductsByMetric(products, p => p.score, true)
    expect(result.map(p => p.name)).toEqual(['A', 'C', 'B'])
  })

  it('84. null metrics go last in descending', () => {
    const withNull = [
      { name: 'A', score: 10 as number | null },
      { name: 'B', score: null as number | null },
      { name: 'C', score: 20 as number | null },
    ]
    const result = rankProductsByMetric(withNull, p => p.score)
    expect(result[result.length - 1].name).toBe('B')
  })

  it('85. null metrics go last in ascending', () => {
    const withNull = [
      { name: 'A', score: 10 as number | null },
      { name: 'B', score: null as number | null },
      { name: 'C', score: 20 as number | null },
    ]
    const result = rankProductsByMetric(withNull, p => p.score, true)
    expect(result[result.length - 1].name).toBe('B')
  })

  it('86. does not mutate original array', () => {
    const original = [...products]
    rankProductsByMetric(products, p => p.score)
    expect(products).toEqual(original)
  })

  it('87. empty array → empty array', () => {
    expect(rankProductsByMetric([], p => (p as never))).toEqual([])
  })
})

// ── computeWeightedAvgMargin ──────────────────────────────────────────────────

describe('computeWeightedAvgMargin', () => {
  it('88. single product → its margin', () => {
    expect(computeWeightedAvgMargin([
      { revenue: 100_000, gross_margin_pct: 40 },
    ])).toBeCloseTo(40)
  })

  it('89. two products equal revenue → simple average', () => {
    expect(computeWeightedAvgMargin([
      { revenue: 100_000, gross_margin_pct: 30 },
      { revenue: 100_000, gross_margin_pct: 50 },
    ])).toBeCloseTo(40)
  })

  it('90. weighted correctly by revenue', () => {
    // 200k @ 40% + 100k @ 10% = (80k + 10k) / 300k × 100 = 30%
    expect(computeWeightedAvgMargin([
      { revenue: 200_000, gross_margin_pct: 40 },
      { revenue: 100_000, gross_margin_pct: 10 },
    ])).toBeCloseTo(30)
  })

  it('91. null margins excluded from calculation', () => {
    // Only product with margin counts: 100k @ 40%
    expect(computeWeightedAvgMargin([
      { revenue: 100_000, gross_margin_pct: 40 },
      { revenue: 50_000, gross_margin_pct: null },
    ])).toBeCloseTo(40)
  })

  it('92. all null margins → null (no eligible products with revenue)', () => {
    expect(computeWeightedAvgMargin([
      { revenue: 100_000, gross_margin_pct: null },
    ])).toBeNull()
  })

  it('93. zero total revenue of eligible products → null', () => {
    expect(computeWeightedAvgMargin([
      { revenue: 0, gross_margin_pct: 40 },
    ])).toBeNull()
  })

  it('94. empty array → null', () => {
    expect(computeWeightedAvgMargin([])).toBeNull()
  })
})

// ── getTopProductsByRevenue ───────────────────────────────────────────────────

describe('getTopProductsByRevenue', () => {
  const products = [
    { revenue: 10_000 },
    { revenue: 50_000 },
    { revenue: 30_000 },
    { revenue: 70_000 },
    { revenue: 20_000 },
    { revenue: 60_000 },
  ]

  it('95. default n=5 returns top 5 by revenue desc', () => {
    const result = getTopProductsByRevenue(products)
    expect(result).toHaveLength(5)
    expect(result[0].revenue).toBe(70_000)
    expect(result[4].revenue).toBe(20_000)
  })

  it('96. custom n=3 returns top 3', () => {
    const result = getTopProductsByRevenue(products, 3)
    expect(result).toHaveLength(3)
    expect(result[0].revenue).toBe(70_000)
    expect(result[2].revenue).toBe(50_000)
  })

  it('97. fewer products than n → returns all', () => {
    const few = [{ revenue: 5_000 }, { revenue: 3_000 }]
    expect(getTopProductsByRevenue(few, 5)).toHaveLength(2)
  })

  it('98. empty array → empty array', () => {
    expect(getTopProductsByRevenue([], 5)).toHaveLength(0)
  })

  it('99. does not mutate original array', () => {
    const original = products.map(p => ({ ...p }))
    getTopProductsByRevenue(products, 3)
    expect(products).toEqual(original)
  })
})

// ── computeTopNConcentration ──────────────────────────────────────────────────

describe('computeTopNConcentration', () => {
  it('100. top 5 of 5 = 100%', () => {
    const prods = [
      { revenue: 100 }, { revenue: 80 }, { revenue: 60 }, { revenue: 40 }, { revenue: 20 },
    ]
    expect(computeTopNConcentration(prods, 5)).toBeCloseTo(100)
  })

  it('101. top 1 of equal-revenue products', () => {
    const prods = [
      { revenue: 100 }, { revenue: 100 }, { revenue: 100 }, { revenue: 100 },
    ]
    expect(computeTopNConcentration(prods, 1)).toBeCloseTo(25)
  })

  it('102. zero total revenue → null', () => {
    expect(computeTopNConcentration([{ revenue: 0 }], 5)).toBeNull()
  })

  it('103. empty array → null', () => {
    expect(computeTopNConcentration([], 5)).toBeNull()
  })

  it('104. default n=5 used when not specified', () => {
    const prods = Array.from({ length: 10 }, (_, i) => ({ revenue: (10 - i) * 10 }))
    const result = computeTopNConcentration(prods)
    expect(result).not.toBeNull()
    // Top 5 revenues: 100, 90, 80, 70, 60 = 400 of 550 total = ~72.7%
    expect(result!).toBeCloseTo(72.727, 1)
  })

  it('105. n=1 returns share of top product', () => {
    const prods = [{ revenue: 60 }, { revenue: 30 }, { revenue: 10 }]
    expect(computeTopNConcentration(prods, 1)).toBeCloseTo(60)
  })
})

// ── generateProductProfitabilityNarrative ─────────────────────────────────────

describe('generateProductProfitabilityNarrative', () => {
  it('106. zero products → insufficient data message', () => {
    const result = generateProductProfitabilityNarrative(0, 35, 2, 0)
    expect(result).toContain('yeterli ürün')
  })

  it('107. null portfolioMargin → margin data unavailable message', () => {
    const result = generateProductProfitabilityNarrative(5, null, 0, 0)
    expect(result).toContain('hesaplanamadı')
  })

  it('108. loss leaders + low margin → critical warning', () => {
    const result = generateProductProfitabilityNarrative(10, 5, 0, 3)
    expect(result).toContain('3')
    expect(result).toContain('zarar')
    expect(result).toContain('kritik')
  })

  it('109. loss leaders but decent portfolio margin → pricing warning', () => {
    const result = generateProductProfitabilityNarrative(10, 25, 0, 2)
    expect(result).toContain('2')
    expect(result).toContain('fiyatlandırma')
  })

  it('110. 3+ star products → strong portfolio message', () => {
    const result = generateProductProfitabilityNarrative(10, 40, 3, 0)
    expect(result).toContain('3')
    expect(result).toContain('yıldız')
  })

  it('111. high portfolio margin >= 30, no issues → strong margin message', () => {
    const result = generateProductProfitabilityNarrative(10, 35, 1, 0)
    expect(result).toContain('güçlü')
  })

  it('112. mid portfolio margin 15-30 → improvement opportunities message', () => {
    const result = generateProductProfitabilityNarrative(10, 20, 0, 0)
    expect(result).toContain('iyileştirme')
  })

  it('113. low portfolio margin < 15 → weak margin message', () => {
    const result = generateProductProfitabilityNarrative(10, 10, 0, 0)
    expect(result).toContain('zayıf')
  })

  it('114. boundary: exactly 10% margin with loss leaders → critical path', () => {
    const result = generateProductProfitabilityNarrative(5, 10, 0, 1)
    // portfolioMargin < 10 is false for exactly 10 → pricing warning path
    expect(result).toContain('fiyatlandırma')
  })

  it('115. portfolio margin exactly 30% → strong message', () => {
    const result = generateProductProfitabilityNarrative(5, 30, 0, 0)
    expect(result).toContain('güçlü')
  })
})
