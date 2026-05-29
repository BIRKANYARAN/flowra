/**
 * Product Margin Sensitivity — unit tests
 *
 * Tests pure computation logic of ProductMarginSensitivityService helper functions.
 * No DB or network calls — all pure function tests.
 * Target: 100+ tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeUnitGrossMargin,
  computeUnitGrossMarginPct,
  computeMonthlyMarginContribution,
  computePriceSensitivity,
  computeCostSensitivity,
  computeVolumeSensitivity,
  computeBreakevenPrice,
  computeBreakevenCost,
  computeMarginSafetyBuffer,
  buildStandardSensitivityScenarios,
  rankProductsByMarginRisk,
  computePortfolioSensitivity,
  computeOptimalPriceForMargin,
  generateSensitivityNarrative,
  type ProductBaseMetrics,
} from '../lib/services/commercial/product-margin-sensitivity.service'

// ── computeUnitGrossMargin ────────────────────────────────────────────────────

describe('computeUnitGrossMargin — pure', () => {
  it('1. standard positive margin', () => {
    expect(computeUnitGrossMargin(100, 60)).toBe(40)
  })
  it('2. zero margin when price equals cost', () => {
    expect(computeUnitGrossMargin(50, 50)).toBe(0)
  })
  it('3. negative margin when cost exceeds price', () => {
    expect(computeUnitGrossMargin(80, 100)).toBe(-20)
  })
  it('4. zero cost', () => {
    expect(computeUnitGrossMargin(200, 0)).toBe(200)
  })
  it('5. zero price and zero cost', () => {
    expect(computeUnitGrossMargin(0, 0)).toBe(0)
  })
  it('6. fractional values', () => {
    expect(computeUnitGrossMargin(99.99, 66.66)).toBeCloseTo(33.33, 2)
  })
  it('7. large values', () => {
    expect(computeUnitGrossMargin(1_000_000, 700_000)).toBe(300_000)
  })
})

// ── computeUnitGrossMarginPct ─────────────────────────────────────────────────

describe('computeUnitGrossMarginPct — pure', () => {
  it('8. 40% margin on ₺100 price', () => {
    expect(computeUnitGrossMarginPct(100, 60)).toBeCloseTo(40, 5)
  })
  it('9. null when price is 0', () => {
    expect(computeUnitGrossMarginPct(0, 0)).toBeNull()
  })
  it('10. null when price is 0 and cost > 0', () => {
    expect(computeUnitGrossMarginPct(0, 50)).toBeNull()
  })
  it('11. 0% margin when price equals cost', () => {
    expect(computeUnitGrossMarginPct(50, 50)).toBe(0)
  })
  it('12. negative margin pct', () => {
    expect(computeUnitGrossMarginPct(80, 100)).toBeCloseTo(-25, 5)
  })
  it('13. 100% margin when cost is 0', () => {
    expect(computeUnitGrossMarginPct(100, 0)).toBe(100)
  })
  it('14. 50% margin', () => {
    expect(computeUnitGrossMarginPct(200, 100)).toBe(50)
  })
  it('15. 25% margin', () => {
    expect(computeUnitGrossMarginPct(400, 300)).toBe(25)
  })
})

// ── computeMonthlyMarginContribution ─────────────────────────────────────────

describe('computeMonthlyMarginContribution — pure', () => {
  it('16. basic multiplication', () => {
    expect(computeMonthlyMarginContribution(40, 100)).toBe(4_000)
  })
  it('17. zero units → 0', () => {
    expect(computeMonthlyMarginContribution(40, 0)).toBe(0)
  })
  it('18. negative unit margin', () => {
    expect(computeMonthlyMarginContribution(-20, 50)).toBe(-1_000)
  })
  it('19. zero unit margin', () => {
    expect(computeMonthlyMarginContribution(0, 100)).toBe(0)
  })
  it('20. fractional units', () => {
    expect(computeMonthlyMarginContribution(30, 33.3)).toBeCloseTo(999, 0)
  })
})

// ── computePriceSensitivity ───────────────────────────────────────────────────

describe('computePriceSensitivity — pure', () => {
  it('21. +10% price: new price = 110', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.new_selling_price).toBeCloseTo(110, 5)
  })
  it('22. cost unchanged on price change', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.new_unit_cost).toBe(60)
  })
  it('23. scenario_name is Fiyat Değişimi', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.scenario_name).toBe('Fiyat Değişimi')
  })
  it('24. delta_label for +10%', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.delta_label).toBe('+10% Fiyat')
  })
  it('25. delta_label for -5%', () => {
    const r = computePriceSensitivity(100, 60, -5, 100)
    expect(r.delta_label).toBe('-5% Fiyat')
  })
  it('26. is_positive true on price increase', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.is_positive).toBe(true)
  })
  it('27. is_positive false on price decrease', () => {
    const r = computePriceSensitivity(100, 60, -10, 100)
    expect(r.is_positive).toBe(false)
  })
  it('28. monthly_impact correct: (110-60 - 100-60) × 100 = 1000', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.monthly_impact_try).toBeCloseTo(1_000, 1)
  })
  it('29. margin_change_pp positive when price goes up', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.margin_change_pp).toBeGreaterThan(0)
  })
  it('30. new_gross_margin_pct computed correctly', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    // (110-60)/110 * 100 ≈ 45.45
    expect(r.new_gross_margin_pct).toBeCloseTo(45.45, 1)
  })
  it('31. zero price change → is_positive false (no change, impact = 0)', () => {
    const r = computePriceSensitivity(100, 60, 0, 100)
    expect(r.is_positive).toBe(false) // 0 is not > 0
  })
  it('32. default monthly units = 0 → monthly_impact = 0', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.monthly_impact_try).toBe(0)
  })
})

// ── computeCostSensitivity ────────────────────────────────────────────────────

describe('computeCostSensitivity — pure', () => {
  it('33. +15% cost: new cost = 69', () => {
    const r = computeCostSensitivity(100, 60, 15, 100)
    expect(r.new_unit_cost).toBeCloseTo(69, 5)
  })
  it('34. price unchanged on cost change', () => {
    const r = computeCostSensitivity(100, 60, 15, 100)
    expect(r.new_selling_price).toBe(100)
  })
  it('35. scenario_name is Maliyet Değişimi', () => {
    const r = computeCostSensitivity(100, 60, 15, 100)
    expect(r.scenario_name).toBe('Maliyet Değişimi')
  })
  it('36. delta_label for +15%', () => {
    const r = computeCostSensitivity(100, 60, 15, 100)
    expect(r.delta_label).toBe('+15% Maliyet')
  })
  it('37. delta_label for -10%', () => {
    const r = computeCostSensitivity(100, 60, -10, 100)
    expect(r.delta_label).toBe('-10% Maliyet')
  })
  it('38. is_positive false on cost increase', () => {
    const r = computeCostSensitivity(100, 60, 10, 100)
    expect(r.is_positive).toBe(false)
  })
  it('39. is_positive true on cost decrease', () => {
    const r = computeCostSensitivity(100, 60, -10, 100)
    expect(r.is_positive).toBe(true)
  })
  it('40. monthly_impact on +10% cost: (100-66 - 100-60) * 100 = -600', () => {
    const r = computeCostSensitivity(100, 60, 10, 100)
    expect(r.monthly_impact_try).toBeCloseTo(-600, 1)
  })
  it('41. margin_change_pp negative when cost goes up', () => {
    const r = computeCostSensitivity(100, 60, 10, 100)
    expect(r.margin_change_pp).toBeLessThan(0)
  })
  it('42. default monthly units = 0 → monthly_impact = 0', () => {
    const r = computeCostSensitivity(100, 60, 10)
    expect(r.monthly_impact_try).toBeCloseTo(0, 10)
  })
})

// ── computeVolumeSensitivity ──────────────────────────────────────────────────

describe('computeVolumeSensitivity — pure', () => {
  it('43. +20% volume: new_monthly_units = 120', () => {
    const r = computeVolumeSensitivity(100, 60, 100, 20)
    expect(r.new_monthly_units).toBeCloseTo(120, 5)
  })
  it('44. -50% volume: new_monthly_units = 50', () => {
    const r = computeVolumeSensitivity(100, 60, 100, -50)
    expect(r.new_monthly_units).toBeCloseTo(50, 5)
  })
  it('45. monthly_impact on +20%: 20 extra units × ₺40 margin = ₺800', () => {
    const r = computeVolumeSensitivity(100, 60, 100, 20)
    expect(r.monthly_impact_try).toBeCloseTo(800, 1)
  })
  it('46. negative monthly_impact on volume decrease', () => {
    const r = computeVolumeSensitivity(100, 60, 100, -50)
    expect(r.monthly_impact_try).toBeCloseTo(-2_000, 1)
  })
  it('47. zero base units → zero monthly impact', () => {
    const r = computeVolumeSensitivity(100, 60, 0, 50)
    expect(r.monthly_impact_try).toBe(0)
  })
  it('48. zero base units → new_monthly_units is 0', () => {
    const r = computeVolumeSensitivity(100, 60, 0, 50)
    expect(r.new_monthly_units).toBe(0)
  })
  it('49. zero volume change → monthly_impact = 0', () => {
    const r = computeVolumeSensitivity(100, 60, 100, 0)
    expect(r.monthly_impact_try).toBe(0)
  })
  it('50. negative unit margin reduces impact sign on volume increase', () => {
    // loss maker: selling 80, cost 100, unit margin = -20
    const r = computeVolumeSensitivity(80, 100, 100, 20)
    expect(r.monthly_impact_try).toBeCloseTo(-400, 1) // 20 more units × -20 = -400
  })
})

// ── computeBreakevenPrice ─────────────────────────────────────────────────────

describe('computeBreakevenPrice — pure', () => {
  it('51. null when targetMarginPct === 100', () => {
    expect(computeBreakevenPrice(60, 100)).toBeNull()
  })
  it('52. null when targetMarginPct > 100', () => {
    expect(computeBreakevenPrice(60, 110)).toBeNull()
  })
  it('53. 20% margin: price = cost / 0.8', () => {
    expect(computeBreakevenPrice(80, 20)).toBeCloseTo(100, 5)
  })
  it('54. 50% margin: price = 2 × cost', () => {
    expect(computeBreakevenPrice(50, 50)).toBeCloseTo(100, 5)
  })
  it('55. 0% margin: price = cost', () => {
    expect(computeBreakevenPrice(60, 0)).toBeCloseTo(60, 5)
  })
  it('56. 30% margin calculation', () => {
    expect(computeBreakevenPrice(70, 30)).toBeCloseTo(100, 5)
  })
  it('57. 25% margin: price = cost / 0.75', () => {
    const bep = computeBreakevenPrice(75, 25)
    expect(bep).toBeCloseTo(100, 5)
  })
  it('58. non-null for margin < 100', () => {
    expect(computeBreakevenPrice(50, 99)).not.toBeNull()
  })
})

// ── computeBreakevenCost ──────────────────────────────────────────────────────

describe('computeBreakevenCost — pure', () => {
  it('59. 20% margin target: max cost = ₺80 on ₺100 price', () => {
    expect(computeBreakevenCost(100, 20)).toBeCloseTo(80, 5)
  })
  it('60. 0% margin: max cost = price', () => {
    expect(computeBreakevenCost(100, 0)).toBeCloseTo(100, 5)
  })
  it('61. 100% margin: max cost = 0', () => {
    expect(computeBreakevenCost(100, 100)).toBe(0)
  })
  it('62. floor at 0 when result would be negative', () => {
    expect(computeBreakevenCost(100, 150)).toBe(0)
  })
  it('63. 50% margin: max cost = half of price', () => {
    expect(computeBreakevenCost(200, 50)).toBeCloseTo(100, 5)
  })
  it('64. negative margin target: cost can exceed price', () => {
    // targetMarginPct = -20 → cost = price × (1 - (-20/100)) = price × 1.2
    expect(computeBreakevenCost(100, -20)).toBeCloseTo(120, 5)
  })
})

// ── computeMarginSafetyBuffer ─────────────────────────────────────────────────

describe('computeMarginSafetyBuffer — pure', () => {
  it('65. null input → null output', () => {
    expect(computeMarginSafetyBuffer(null, 20)).toBeNull()
  })
  it('66. current 40%, target 20% → buffer = 20pp', () => {
    expect(computeMarginSafetyBuffer(40, 20)).toBe(20)
  })
  it('67. current 15%, target 20% → buffer = -5pp (below target)', () => {
    expect(computeMarginSafetyBuffer(15, 20)).toBe(-5)
  })
  it('68. current equals target → 0 buffer', () => {
    expect(computeMarginSafetyBuffer(20, 20)).toBe(0)
  })
  it('69. target 0% → buffer = current margin pct', () => {
    expect(computeMarginSafetyBuffer(35, 0)).toBe(35)
  })
  it('70. negative current margin', () => {
    expect(computeMarginSafetyBuffer(-5, 20)).toBe(-25)
  })
})

// ── buildStandardSensitivityScenarios ────────────────────────────────────────

describe('buildStandardSensitivityScenarios — pure', () => {
  const scenarios = buildStandardSensitivityScenarios(100, 60, 100)

  it('71. returns exactly 8 scenarios', () => {
    expect(scenarios).toHaveLength(8)
  })
  it('72. all scenarios have scenario_name string', () => {
    scenarios.forEach(s => expect(typeof s.scenario_name).toBe('string'))
  })
  it('73. all scenarios have delta_label string', () => {
    scenarios.forEach(s => expect(typeof s.delta_label).toBe('string'))
  })
  it('74. all scenarios have new_selling_price number', () => {
    scenarios.forEach(s => expect(typeof s.new_selling_price).toBe('number'))
  })
  it('75. all scenarios have monthly_impact_try number', () => {
    scenarios.forEach(s => expect(typeof s.monthly_impact_try).toBe('number'))
  })
  it('76. scenario 0: +10% Fiyat label', () => {
    expect(scenarios[0].delta_label).toBe('+10% Fiyat')
  })
  it('77. scenario 1: +5% Fiyat label', () => {
    expect(scenarios[1].delta_label).toBe('+5% Fiyat')
  })
  it('78. scenario 2: -5% Fiyat label', () => {
    expect(scenarios[2].delta_label).toBe('-5% Fiyat')
  })
  it('79. scenario 3: -10% Fiyat label', () => {
    expect(scenarios[3].delta_label).toBe('-10% Fiyat')
  })
  it('80. scenario 4: +10% Maliyet label', () => {
    expect(scenarios[4].delta_label).toBe('+10% Maliyet')
  })
  it('81. scenario 5: +20% Maliyet label', () => {
    expect(scenarios[5].delta_label).toBe('+20% Maliyet')
  })
  it('82. scenario 6: competitive pressure label', () => {
    expect(scenarios[6].delta_label).toBe('-5% Fiyat / +10% Maliyet')
  })
  it('83. scenario 7: optimization label', () => {
    expect(scenarios[7].delta_label).toBe('+5% Fiyat / -5% Maliyet')
  })
  it('84. price increase scenarios are positive', () => {
    expect(scenarios[0].is_positive).toBe(true)
    expect(scenarios[1].is_positive).toBe(true)
  })
  it('85. price decrease scenarios are negative', () => {
    expect(scenarios[2].is_positive).toBe(false)
    expect(scenarios[3].is_positive).toBe(false)
  })
  it('86. cost increase scenarios are negative', () => {
    expect(scenarios[4].is_positive).toBe(false)
    expect(scenarios[5].is_positive).toBe(false)
  })
  it('87. optimization scenario is positive', () => {
    expect(scenarios[7].is_positive).toBe(true)
  })
  it('88. correct price in scenario 0 (+10%)', () => {
    expect(scenarios[0].new_selling_price).toBeCloseTo(110, 5)
  })
  it('89. cost unchanged in price scenarios', () => {
    expect(scenarios[0].new_unit_cost).toBe(60)
    expect(scenarios[1].new_unit_cost).toBe(60)
  })
  it('90. price unchanged in cost scenarios', () => {
    expect(scenarios[4].new_selling_price).toBe(100)
    expect(scenarios[5].new_selling_price).toBe(100)
  })
})

// ── rankProductsByMarginRisk ──────────────────────────────────────────────────

const sampleProducts: ProductBaseMetrics[] = [
  {
    product_id: 'p1',
    product_name: 'Ürün A',
    avg_selling_price: 100,
    avg_unit_cost: 50,
    units_sold_monthly: 100,
    gross_margin_try_monthly: 5_000,
    gross_margin_pct: 50,
  },
  {
    product_id: 'p2',
    product_name: 'Ürün B',
    avg_selling_price: 100,
    avg_unit_cost: 85,
    units_sold_monthly: 80,
    gross_margin_try_monthly: 1_200,
    gross_margin_pct: 15,
  },
  {
    product_id: 'p3',
    product_name: 'Ürün C',
    avg_selling_price: 100,
    avg_unit_cost: 92,
    units_sold_monthly: 50,
    gross_margin_try_monthly: 400,
    gross_margin_pct: 8,
  },
  {
    product_id: 'p4',
    product_name: 'Ürün D',
    avg_selling_price: 100,
    avg_unit_cost: 98,
    units_sold_monthly: 30,
    gross_margin_try_monthly: 60,
    gross_margin_pct: 2,
  },
]

describe('rankProductsByMarginRisk — pure', () => {
  const ranked = rankProductsByMarginRisk(sampleProducts, 10)

  it('91. returns same count as input', () => {
    expect(ranked).toHaveLength(sampleProducts.length)
  })
  it('92. each row has margin_at_inflation field', () => {
    ranked.forEach(r => expect('margin_at_inflation' in r).toBe(true))
  })
  it('93. each row has margin_drop_pp field', () => {
    ranked.forEach(r => expect('margin_drop_pp' in r).toBe(true))
  })
  it('94. each row has risk_level field', () => {
    ranked.forEach(r => expect(typeof r.risk_level).toBe('string'))
  })
  it('95. Ürün A (50% margin) has low or medium risk at 10% cost inflation', () => {
    // new cost = 50 × 1.1 = 55, new margin = 45%, drop ≈ 5pp (floating point may push it to medium)
    const a = ranked.find(r => r.product_id === 'p1')!
    expect(['low', 'medium']).toContain(a.risk_level)
  })
  it('96. Ürün D (2% margin) has critical risk at 10% cost inflation', () => {
    const d = ranked.find(r => r.product_id === 'p4')!
    // new cost = 98 × 1.1 = 107.8 → margin goes negative → critical
    expect(d.risk_level).toBe('critical')
  })
  it('97. critical products appear before medium/high risk in sorted result', () => {
    const criticalIdx = ranked.findIndex(r => r.risk_level === 'critical')
    const medOrHighIdx = ranked.findIndex(r => r.risk_level === 'medium' || r.risk_level === 'high')
    expect(criticalIdx).toBeLessThan(medOrHighIdx)
  })
  it('98. margin_at_inflation < gross_margin_pct for cost increase', () => {
    ranked.forEach(r => {
      if (r.margin_at_inflation !== null && r.gross_margin_pct !== null) {
        expect(r.margin_at_inflation).toBeLessThan(r.gross_margin_pct)
      }
    })
  })
  it('99. multiple risk levels present in ranking', () => {
    const levels = new Set(ranked.map(r => r.risk_level))
    expect(levels.size).toBeGreaterThan(1)
  })
  it('100. product that goes to negative margin is critical', () => {
    const negativeProduct: ProductBaseMetrics = {
      product_id: 'pn',
      product_name: 'Negatif',
      avg_selling_price: 100,
      avg_unit_cost: 99,
      units_sold_monthly: 10,
      gross_margin_try_monthly: 10,
      gross_margin_pct: 1,
    }
    const result = rankProductsByMarginRisk([negativeProduct], 10)
    // new cost = 99 × 1.1 = 108.9 → margin = (100-108.9)/100 = -8.9% → critical
    expect(result[0].risk_level).toBe('critical')
  })
  it('101. margin_drop_pp is non-negative for cost increase', () => {
    ranked.forEach(r => {
      if (r.margin_drop_pp !== null) {
        expect(r.margin_drop_pp).toBeGreaterThanOrEqual(0)
      }
    })
  })
})

// ── computePortfolioSensitivity ───────────────────────────────────────────────

describe('computePortfolioSensitivity — pure', () => {
  it('102. baseline matches sum of individual contributions', () => {
    const result = computePortfolioSensitivity(sampleProducts, 0, 0)
    const expected = sampleProducts.reduce(
      (s, p) => s + (p.avg_selling_price - p.avg_unit_cost) * p.units_sold_monthly,
      0,
    )
    expect(result.baseline_monthly_margin).toBeCloseTo(expected, 2)
  })
  it('103. zero changes → total_impact = 0', () => {
    const r = computePortfolioSensitivity(sampleProducts, 0, 0)
    expect(r.total_impact_try).toBeCloseTo(0, 5)
  })
  it('104. negative total_impact on cost increase', () => {
    const r = computePortfolioSensitivity(sampleProducts, 0, 10)
    expect(r.total_impact_try).toBeLessThan(0)
  })
  it('105. positive total_impact on price increase', () => {
    const r = computePortfolioSensitivity(sampleProducts, 10, 0)
    expect(r.total_impact_try).toBeGreaterThan(0)
  })
  it('106. null impact_pct when baseline = 0', () => {
    const zeroCostProducts: ProductBaseMetrics[] = [
      {
        product_id: 'z1',
        product_name: 'Zero',
        avg_selling_price: 0,
        avg_unit_cost: 0,
        units_sold_monthly: 0,
        gross_margin_try_monthly: 0,
        gross_margin_pct: null,
      },
    ]
    const r = computePortfolioSensitivity(zeroCostProducts, 0, 0)
    expect(r.impact_pct).toBeNull()
  })
  it('107. empty products array → 0 margins', () => {
    const r = computePortfolioSensitivity([], 0, 0)
    expect(r.baseline_monthly_margin).toBe(0)
    expect(r.new_monthly_margin).toBe(0)
    expect(r.total_impact_try).toBe(0)
    expect(r.impact_pct).toBeNull()
  })
  it('108. new_monthly_margin = baseline + total_impact', () => {
    const r = computePortfolioSensitivity(sampleProducts, 0, 10)
    expect(r.new_monthly_margin).toBeCloseTo(r.baseline_monthly_margin + r.total_impact_try, 2)
  })
  it('109. impact_pct is non-null for non-zero baseline', () => {
    const r = computePortfolioSensitivity(sampleProducts, 0, 10)
    expect(r.impact_pct).not.toBeNull()
  })
  it('110. impact_pct is negative on cost increase', () => {
    const r = computePortfolioSensitivity(sampleProducts, 0, 10)
    expect(r.impact_pct).toBeLessThan(0)
  })
})

// ── computeOptimalPriceForMargin ──────────────────────────────────────────────

describe('computeOptimalPriceForMargin — pure', () => {
  it('111. 20% target margin at ₺80 cost → ₺100', () => {
    expect(computeOptimalPriceForMargin(80, 20)).toBe(100)
  })
  it('112. competitor cap applied when optimal > competitor', () => {
    expect(computeOptimalPriceForMargin(80, 20, 95)).toBe(95)
  })
  it('113. competitor cap not applied when optimal <= competitor', () => {
    expect(computeOptimalPriceForMargin(80, 20, 110)).toBe(100)
  })
  it('114. rounds to 2 decimal places', () => {
    const result = computeOptimalPriceForMargin(60, 25)
    // 60 / 0.75 = 80.00
    expect(result).toBe(80)
    const fractional = computeOptimalPriceForMargin(33, 30)
    // 33 / 0.7 = 47.142... → 47.14
    expect(Number.isFinite(fractional)).toBe(true)
    expect(fractional.toString()).toMatch(/^\d+\.\d{0,2}$|^\d+$/)
  })
  it('115. 50% target: price = 2 × cost', () => {
    expect(computeOptimalPriceForMargin(50, 50)).toBe(100)
  })
  it('116. 0% target: price = cost', () => {
    expect(computeOptimalPriceForMargin(100, 0)).toBe(100)
  })
  it('117. competitor price at exact optimal → returns competitor', () => {
    expect(computeOptimalPriceForMargin(80, 20, 100)).toBe(100)
  })
  it('118. null competitor → no cap applied', () => {
    expect(computeOptimalPriceForMargin(80, 20, null)).toBe(100)
  })
})

// ── generateSensitivityNarrative ──────────────────────────────────────────────

const zeroImpact = {
  baseline_monthly_margin: 100_000,
  new_monthly_margin: 100_000,
  total_impact_try: 0,
  impact_pct: 0,
}

const negativeImpact = {
  baseline_monthly_margin: 100_000,
  new_monthly_margin: 85_000,
  total_impact_try: -15_000,
  impact_pct: -15,
}

const positiveImpact = {
  baseline_monthly_margin: 100_000,
  new_monthly_margin: 115_000,
  total_impact_try: 15_000,
  impact_pct: 15,
}

describe('generateSensitivityNarrative — pure', () => {
  it('119. zero high risk → resilience message', () => {
    const msg = generateSensitivityNarrative(0, 10, zeroImpact, 10)
    expect(msg).toBe('Maliyet artışlarına karşı portföy dayanıklılığı iyi.')
  })
  it('120. some high risk → includes ürün count', () => {
    const msg = generateSensitivityNarrative(3, 10, zeroImpact, 10)
    expect(msg).toContain('3/10')
    expect(msg).toContain('yüksek risk')
  })
  it('121. some high risk with negative impact → includes loss amount', () => {
    const msg = generateSensitivityNarrative(3, 10, negativeImpact, 10)
    expect(msg).toContain('/ay marjinal gelir kaybı')
  })
  it('122. cost inflation pct included in risk message', () => {
    const msg = generateSensitivityNarrative(2, 5, zeroImpact, 15)
    expect(msg).toContain('%15')
  })
  it('123. positive impact does not mention loss', () => {
    const msg = generateSensitivityNarrative(2, 5, positiveImpact, 10)
    expect(msg).not.toContain('kayıp')
  })
  it('124. zero high risk always returns same message regardless of impact', () => {
    const msg1 = generateSensitivityNarrative(0, 5, negativeImpact, 10)
    const msg2 = generateSensitivityNarrative(0, 5, positiveImpact, 10)
    expect(msg1).toBe('Maliyet artışlarına karşı portföy dayanıklılığı iyi.')
    expect(msg2).toBe('Maliyet artışlarına karşı portföy dayanıklılığı iyi.')
  })
  it('125. narrative is a non-empty string', () => {
    const msg = generateSensitivityNarrative(1, 4, negativeImpact, 10)
    expect(typeof msg).toBe('string')
    expect(msg.length).toBeGreaterThan(0)
  })
  it('126. negative impact message contains TL sign', () => {
    const msg = generateSensitivityNarrative(2, 5, negativeImpact, 10)
    expect(msg).toContain('₺')
  })
})
