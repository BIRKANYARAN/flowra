/**
 * Product Margin Analysis — unit tests
 *
 * Tests the pure computation logic of ProductMarginSensitivityService.
 *
 * Run with: npx vitest run tests/product-margin.test.ts
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
} from '../lib/services/commercial/product-margin-sensitivity.service'
import type { ProductBaseMetrics } from '../lib/services/commercial/product-margin-sensitivity.service'

// ── computeUnitGrossMargin ────────────────────────────────────────────────────

describe('computeUnitGrossMargin', () => {
  it('returns sellingPrice - unitCost for normal values', () => {
    expect(computeUnitGrossMargin(100, 60)).toBe(40)
  })

  it('returns 0 when price equals cost', () => {
    expect(computeUnitGrossMargin(50, 50)).toBe(0)
  })

  it('returns negative when cost exceeds price (loss)', () => {
    expect(computeUnitGrossMargin(80, 100)).toBe(-20)
  })

  it('handles zero selling price', () => {
    expect(computeUnitGrossMargin(0, 50)).toBe(-50)
  })

  it('handles zero unit cost (100% margin)', () => {
    expect(computeUnitGrossMargin(100, 0)).toBe(100)
  })

  it('handles both zero', () => {
    expect(computeUnitGrossMargin(0, 0)).toBe(0)
  })

  it('handles large values', () => {
    expect(computeUnitGrossMargin(1_000_000, 750_000)).toBe(250_000)
  })

  it('handles fractional values', () => {
    expect(computeUnitGrossMargin(99.99, 59.99)).toBeCloseTo(40.00, 5)
  })
})

// ── computeUnitGrossMarginPct ─────────────────────────────────────────────────

describe('computeUnitGrossMarginPct', () => {
  it('returns 40 for price=100, cost=60', () => {
    expect(computeUnitGrossMarginPct(100, 60)).toBeCloseTo(40)
  })

  it('returns 0 when price equals cost', () => {
    expect(computeUnitGrossMarginPct(100, 100)).toBeCloseTo(0)
  })

  it('returns null when sellingPrice is 0 (guard against division by zero)', () => {
    expect(computeUnitGrossMarginPct(0, 50)).toBeNull()
  })

  it('returns null when both are 0', () => {
    expect(computeUnitGrossMarginPct(0, 0)).toBeNull()
  })

  it('returns negative when cost > price (loss scenario)', () => {
    // (80 - 120) / 80 × 100 = -50%
    expect(computeUnitGrossMarginPct(80, 120)).toBeCloseTo(-50)
  })

  it('returns 100% when cost is 0', () => {
    expect(computeUnitGrossMarginPct(100, 0)).toBeCloseTo(100)
  })

  it('handles very small margin (e.g. 1%)', () => {
    // price 100, cost 99 → 1%
    expect(computeUnitGrossMarginPct(100, 99)).toBeCloseTo(1)
  })

  it('handles very large prices', () => {
    expect(computeUnitGrossMarginPct(1_000_000, 500_000)).toBeCloseTo(50)
  })

  it('result is in percentage points (not decimal)', () => {
    const pct = computeUnitGrossMarginPct(200, 100)
    expect(pct).toBeCloseTo(50)   // 50% not 0.5
  })
})

// ── computeMonthlyMarginContribution ─────────────────────────────────────────

describe('computeMonthlyMarginContribution', () => {
  it('returns unitGrossMargin × monthlyUnits', () => {
    expect(computeMonthlyMarginContribution(40, 100)).toBe(4000)
  })

  it('returns 0 when monthlyUnits is 0', () => {
    expect(computeMonthlyMarginContribution(40, 0)).toBe(0)
  })

  it('returns 0 when unitGrossMargin is 0', () => {
    expect(computeMonthlyMarginContribution(0, 100)).toBe(0)
  })

  it('returns negative when unitGrossMargin is negative', () => {
    expect(computeMonthlyMarginContribution(-10, 50)).toBe(-500)
  })

  it('handles fractional units (e.g. 12.5 avg monthly)', () => {
    expect(computeMonthlyMarginContribution(40, 12.5)).toBe(500)
  })

  it('handles large monthly volumes', () => {
    expect(computeMonthlyMarginContribution(50, 10_000)).toBe(500_000)
  })
})

// ── computePriceSensitivity ───────────────────────────────────────────────────

describe('computePriceSensitivity', () => {
  it('scenario_name is always "Fiyat Değişimi"', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.scenario_name).toBe('Fiyat Değişimi')
  })

  it('delta_label uses + prefix for positive change', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.delta_label).toBe('+10% Fiyat')
  })

  it('delta_label has no prefix for negative change', () => {
    const r = computePriceSensitivity(100, 60, -5)
    expect(r.delta_label).toBe('-5% Fiyat')
  })

  it('new_selling_price = basePrice × (1 + changePct/100)', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.new_selling_price).toBeCloseTo(110)
  })

  it('new_unit_cost stays at baseCost (price change only)', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.new_unit_cost).toBe(60)
  })

  it('is_positive = true when price increases (positive impact)', () => {
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.is_positive).toBe(true)
  })

  it('is_positive = false when price decreases', () => {
    const r = computePriceSensitivity(100, 60, -10, 100)
    expect(r.is_positive).toBe(false)
  })

  it('monthly_impact_try = 0 when baseMonthlyUnits = 0', () => {
    const r = computePriceSensitivity(100, 60, 10, 0)
    expect(r.monthly_impact_try).toBe(0)
  })

  it('monthly_impact_try is positive when price increases and units > 0', () => {
    // +10 price × 100 units = +1000
    const r = computePriceSensitivity(100, 60, 10, 100)
    expect(r.monthly_impact_try).toBeCloseTo(1000)
  })

  it('margin_change_pp is positive when price increases (margin improves)', () => {
    const r = computePriceSensitivity(100, 60, 10)
    expect(r.margin_change_pp).not.toBeNull()
    expect(r.margin_change_pp!).toBeGreaterThan(0)
  })

  it('new_gross_margin_pct is null when new price is 0', () => {
    // A -100% price change would result in price=0
    const r = computePriceSensitivity(100, 60, -100)
    expect(r.new_gross_margin_pct).toBeNull()
  })
})

// ── computeCostSensitivity ────────────────────────────────────────────────────

describe('computeCostSensitivity', () => {
  it('scenario_name is always "Maliyet Değişimi"', () => {
    const r = computeCostSensitivity(100, 60, 10)
    expect(r.scenario_name).toBe('Maliyet Değişimi')
  })

  it('delta_label uses + prefix for positive cost change', () => {
    const r = computeCostSensitivity(100, 60, 15)
    expect(r.delta_label).toBe('+15% Maliyet')
  })

  it('delta_label no prefix for negative cost change', () => {
    const r = computeCostSensitivity(100, 60, -10)
    expect(r.delta_label).toBe('-10% Maliyet')
  })

  it('new_unit_cost = baseCost × (1 + changePct/100)', () => {
    const r = computeCostSensitivity(100, 60, 10)
    expect(r.new_unit_cost).toBeCloseTo(66)
  })

  it('new_selling_price stays at basePrice (cost change only)', () => {
    const r = computeCostSensitivity(100, 60, 10)
    expect(r.new_selling_price).toBe(100)
  })

  it('is_positive = false when cost increases (negative impact)', () => {
    const r = computeCostSensitivity(100, 60, 10, 100)
    expect(r.is_positive).toBe(false)
  })

  it('is_positive = true when cost decreases', () => {
    const r = computeCostSensitivity(100, 60, -10, 100)
    expect(r.is_positive).toBe(true)
  })

  it('monthly_impact_try = 0 when baseMonthlyUnits = 0', () => {
    const r = computeCostSensitivity(100, 60, 20, 0)
    expect(r.monthly_impact_try).toBeCloseTo(0)
  })

  it('20% cost increase with 100 units results in negative monthly impact', () => {
    // baseCost 60 → newCost 72, unit margin drops by 12, ×100 = -1200
    const r = computeCostSensitivity(100, 60, 20, 100)
    expect(r.monthly_impact_try).toBeCloseTo(-1200)
  })

  it('margin_change_pp is negative when cost increases', () => {
    const r = computeCostSensitivity(100, 60, 10)
    expect(r.margin_change_pp).not.toBeNull()
    expect(r.margin_change_pp!).toBeLessThan(0)
  })
})

// ── computeVolumeSensitivity ──────────────────────────────────────────────────

describe('computeVolumeSensitivity', () => {
  it('new_monthly_units = baseMonthlyUnits × (1 + changePct/100)', () => {
    const r = computeVolumeSensitivity(100, 60, 100, 20)
    expect(r.new_monthly_units).toBeCloseTo(120)
  })

  it('+20% volume with positive margin = positive monthly impact', () => {
    // unit margin = 40, extra 20 units × 40 = 800
    const r = computeVolumeSensitivity(100, 60, 100, 20)
    expect(r.monthly_impact_try).toBeCloseTo(800)
  })

  it('-20% volume = negative monthly impact', () => {
    // unit margin = 40, -20 units × 40 = -800
    const r = computeVolumeSensitivity(100, 60, 100, -20)
    expect(r.monthly_impact_try).toBeCloseTo(-800)
  })

  it('0% volume change = 0 monthly impact', () => {
    const r = computeVolumeSensitivity(100, 60, 100, 0)
    expect(r.monthly_impact_try).toBe(0)
    expect(r.new_monthly_units).toBe(100)
  })

  it('zero base volume → zero impact even with volume change', () => {
    const r = computeVolumeSensitivity(100, 60, 0, 50)
    expect(r.monthly_impact_try).toBe(0)
    expect(r.new_monthly_units).toBe(0)
  })

  it('negative margin product: volume increase makes monthly impact negative', () => {
    // selling at 80 < cost 100, unit margin = -20, +50 units × (-20) = -1000
    const r = computeVolumeSensitivity(80, 100, 100, 50)
    expect(r.monthly_impact_try).toBeCloseTo(-1000)
  })
})

// ── computeBreakevenPrice ─────────────────────────────────────────────────────

describe('computeBreakevenPrice', () => {
  it('returns cost / (1 - targetPct/100) for normal inputs', () => {
    // cost=60, target=40% → price = 60 / 0.6 = 100
    expect(computeBreakevenPrice(60, 40)).toBeCloseTo(100)
  })

  it('returns cost when targetPct is 0 (zero margin required)', () => {
    // price = cost / 1 = cost
    expect(computeBreakevenPrice(60, 0)).toBeCloseTo(60)
  })

  it('returns null when targetMarginPct >= 100 (impossible)', () => {
    expect(computeBreakevenPrice(60, 100)).toBeNull()
    expect(computeBreakevenPrice(60, 150)).toBeNull()
  })

  it('handles exactly 99% target margin', () => {
    // price = 60 / 0.01 = 6000
    expect(computeBreakevenPrice(60, 99)).toBeCloseTo(6000)
  })

  it('handles 50% target margin', () => {
    // price = 60 / 0.5 = 120
    expect(computeBreakevenPrice(60, 50)).toBeCloseTo(120)
  })

  it('handles negative target margin (below breakeven target)', () => {
    // cost=60, target=-10% → price = 60 / 1.1 ≈ 54.55
    const result = computeBreakevenPrice(60, -10)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(54.55, 1)
  })
})

// ── computeBreakevenCost ──────────────────────────────────────────────────────

describe('computeBreakevenCost', () => {
  it('returns sellingPrice × (1 - targetPct/100)', () => {
    // price=100, target=40% → cost = 100 × 0.6 = 60
    expect(computeBreakevenCost(100, 40)).toBeCloseTo(60)
  })

  it('returns 0 when target margin is 100%', () => {
    // cost = 100 × 0 = 0
    expect(computeBreakevenCost(100, 100)).toBeCloseTo(0)
  })

  it('returns sellingPrice when target margin is 0%', () => {
    // cost = 100 × 1 = 100
    expect(computeBreakevenCost(100, 0)).toBeCloseTo(100)
  })

  it('returns 0 (floored) when result would be negative', () => {
    // price=100, target=150% → cost = 100 × (1-1.5) = -50 → clamped to 0
    expect(computeBreakevenCost(100, 150)).toBe(0)
  })

  it('handles 50% target margin', () => {
    expect(computeBreakevenCost(200, 50)).toBeCloseTo(100)
  })

  it('handles very small selling price', () => {
    expect(computeBreakevenCost(1, 30)).toBeCloseTo(0.7)
  })
})

// ── computeMarginSafetyBuffer ─────────────────────────────────────────────────

describe('computeMarginSafetyBuffer', () => {
  it('returns currentMarginPct - targetMarginPct', () => {
    expect(computeMarginSafetyBuffer(45, 30)).toBeCloseTo(15)
  })

  it('returns null when currentMarginPct is null', () => {
    expect(computeMarginSafetyBuffer(null, 30)).toBeNull()
  })

  it('returns negative buffer when current < target', () => {
    expect(computeMarginSafetyBuffer(20, 30)).toBeCloseTo(-10)
  })

  it('returns 0 when current equals target', () => {
    expect(computeMarginSafetyBuffer(30, 30)).toBe(0)
  })

  it('handles negative current margin', () => {
    expect(computeMarginSafetyBuffer(-5, 20)).toBeCloseTo(-25)
  })

  it('handles zero target margin', () => {
    expect(computeMarginSafetyBuffer(25, 0)).toBeCloseTo(25)
  })
})

// ── buildStandardSensitivityScenarios ────────────────────────────────────────

describe('buildStandardSensitivityScenarios', () => {
  it('returns exactly 8 scenarios', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    expect(scenarios).toHaveLength(8)
  })

  it('first 4 scenarios are price changes', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    expect(scenarios[0].scenario_name).toBe('Fiyat Değişimi')
    expect(scenarios[1].scenario_name).toBe('Fiyat Değişimi')
    expect(scenarios[2].scenario_name).toBe('Fiyat Değişimi')
    expect(scenarios[3].scenario_name).toBe('Fiyat Değişimi')
  })

  it('next 2 scenarios are cost changes', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    expect(scenarios[4].scenario_name).toBe('Maliyet Değişimi')
    expect(scenarios[5].scenario_name).toBe('Maliyet Değişimi')
  })

  it('last 2 scenarios are combined (Rekabet/Optimizasyon)', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    expect(scenarios[6].scenario_name).toBe('Rekabet Baskısı')
    expect(scenarios[7].scenario_name).toBe('Optimizasyon')
  })

  it('price +10% scenario has positive impact when units > 0', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    expect(scenarios[0].delta_label).toBe('+10% Fiyat')
    expect(scenarios[0].is_positive).toBe(true)
  })

  it('price -10% scenario has negative impact when units > 0', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    const minus10 = scenarios.find(s => s.delta_label === '-10% Fiyat')
    expect(minus10).toBeDefined()
    expect(minus10!.is_positive).toBe(false)
  })

  it('cost +20% scenario has negative impact when units > 0', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 100)
    const plus20Cost = scenarios.find(s => s.delta_label === '+20% Maliyet')
    expect(plus20Cost).toBeDefined()
    expect(plus20Cost!.is_positive).toBe(false)
  })

  it('monthly impact = 0 when baseMonthlyUnits = 0', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 0)
    for (const s of scenarios) {
      expect(s.monthly_impact_try).toBeCloseTo(0)
    }
  })

  it('all scenarios have non-null new_gross_margin_pct when price > 0', () => {
    const scenarios = buildStandardSensitivityScenarios(100, 60, 50)
    for (const s of scenarios) {
      expect(s.new_gross_margin_pct).not.toBeNull()
    }
  })
})

// ── rankProductsByMarginRisk ──────────────────────────────────────────────────

const makeProduct = (
  id: string,
  sellingPrice: number,
  unitCost: number,
  units = 100,
): ProductBaseMetrics => ({
  product_id: id,
  product_name: id,
  avg_selling_price: sellingPrice,
  avg_unit_cost: unitCost,
  units_sold_monthly: units,
  gross_margin_try_monthly: (sellingPrice - unitCost) * units,
  gross_margin_pct: sellingPrice > 0 ? ((sellingPrice - unitCost) / sellingPrice) * 100 : null,
})

describe('rankProductsByMarginRisk', () => {
  it('critical risk: margin drop > 20pp under inflation', () => {
    // price=100, cost=70, margin=30%; +50% cost → new cost=105, new margin=-5% → drop=35pp
    const products = [makeProduct('A', 100, 70, 100)]
    const ranked = rankProductsByMarginRisk(products, 50)
    expect(ranked[0].risk_level).toBe('critical')
  })

  it('critical risk: new margin < 0 after inflation', () => {
    // price=100, cost=95, margin=5%; +20% cost → new cost=114, new margin < 0
    const products = [makeProduct('A', 100, 95, 100)]
    const ranked = rankProductsByMarginRisk(products, 20)
    expect(ranked[0].risk_level).toBe('critical')
  })

  it('low risk: small margin drop under low inflation', () => {
    // price=100, cost=30, margin=70%; +5% cost → new cost=31.5, new margin≈68.5%, drop≈1.5pp
    const products = [makeProduct('A', 100, 30, 100)]
    const ranked = rankProductsByMarginRisk(products, 5)
    expect(ranked[0].risk_level).toBe('low')
  })

  it('sorts critical before medium before low', () => {
    // critical: price=100, cost=95 → new_cost=104.5, new_margin < 0
    // medium:   price=100, cost=60 → new_cost=66, new_margin=34%, drop=6pp (> 5)
    // low:      price=100, cost=30 → new_cost=33, new_margin=67%, drop=3pp
    const products = [
      makeProduct('low',  100, 30,  100),
      makeProduct('crit', 100, 95,  100),
      makeProduct('med',  100, 60,  100),
    ]
    const ranked = rankProductsByMarginRisk(products, 10)
    const levels = ranked.map(p => p.risk_level)
    const critIdx = levels.indexOf('critical')
    const medIdx  = levels.indexOf('medium')
    const lowIdx  = levels.indexOf('low')
    expect(critIdx).toBeLessThan(lowIdx)
    expect(medIdx).toBeLessThan(lowIdx)
  })

  it('computes margin_at_inflation correctly', () => {
    // price=100, cost=60, +10% inflation → new cost=66, new margin=(100-66)/100=34%
    const products = [makeProduct('A', 100, 60, 100)]
    const ranked = rankProductsByMarginRisk(products, 10)
    expect(ranked[0].margin_at_inflation).toBeCloseTo(34)
  })

  it('handles empty products array', () => {
    const ranked = rankProductsByMarginRisk([], 10)
    expect(ranked).toHaveLength(0)
  })

  it('margin_drop_pp = base_margin - margin_at_inflation', () => {
    const products = [makeProduct('A', 100, 60, 100)]
    const ranked = rankProductsByMarginRisk(products, 10)
    // base margin = 40%, margin_at_inflation ≈ 34%, drop ≈ 6pp
    expect(ranked[0].margin_drop_pp).toBeCloseTo(6, 0)
  })
})

// ── computePortfolioSensitivity ───────────────────────────────────────────────

describe('computePortfolioSensitivity', () => {
  it('returns zero impact when no price/cost change', () => {
    const products = [makeProduct('A', 100, 60, 100)]
    const result = computePortfolioSensitivity(products, 0, 0)
    expect(result.total_impact_try).toBe(0)
    expect(result.baseline_monthly_margin).toBe(result.new_monthly_margin)
  })

  it('10% cost increase reduces portfolio margin', () => {
    const products = [makeProduct('A', 100, 60, 100)]
    const result = computePortfolioSensitivity(products, 0, 10)
    expect(result.total_impact_try).toBeLessThan(0)
  })

  it('10% price increase improves portfolio margin', () => {
    const products = [makeProduct('A', 100, 60, 100)]
    const result = computePortfolioSensitivity(products, 10, 0)
    expect(result.total_impact_try).toBeGreaterThan(0)
  })

  it('impact_pct is null when baseline_monthly_margin is 0', () => {
    // price = cost, margin = 0
    const products = [makeProduct('A', 100, 100, 100)]
    const result = computePortfolioSensitivity(products, 0, 10)
    expect(result.impact_pct).toBeNull()
  })

  it('handles empty products array → all zeros', () => {
    const result = computePortfolioSensitivity([], 10, 10)
    expect(result.baseline_monthly_margin).toBe(0)
    expect(result.new_monthly_margin).toBe(0)
    expect(result.total_impact_try).toBe(0)
    expect(result.impact_pct).toBeNull()
  })

  it('aggregates correctly across multiple products', () => {
    const products = [
      makeProduct('A', 100, 60, 100),  // base margin: 40 × 100 = 4000
      makeProduct('B', 200, 120, 50),  // base margin: 80 × 50 = 4000
    ]
    const result = computePortfolioSensitivity(products, 0, 0)
    expect(result.baseline_monthly_margin).toBe(8000)
    expect(result.new_monthly_margin).toBe(8000)
  })

  it('impact_pct calculation uses absolute baseline', () => {
    const products = [makeProduct('A', 100, 60, 100)]
    // baseline = 40 × 100 = 4000, +10% cost → new cost=66, new margin=34×100=3400
    // impact = -600, impact_pct = -600 / 4000 × 100 = -15%
    const result = computePortfolioSensitivity(products, 0, 10)
    expect(result.impact_pct).toBeCloseTo(-15)
  })
})

// ── computeOptimalPriceForMargin ──────────────────────────────────────────────

describe('computeOptimalPriceForMargin', () => {
  it('returns cost / (1 - targetPct/100) rounded to 2 decimals', () => {
    // cost=60, target=40% → price = 60/0.6 = 100.00
    expect(computeOptimalPriceForMargin(60, 40)).toBe(100)
  })

  it('returns Infinity when targetMarginPct >= 100 and no competitor price', () => {
    expect(computeOptimalPriceForMargin(60, 100)).toBe(Infinity)
  })

  it('returns competitor price when targetPct >= 100 and competitor provided', () => {
    expect(computeOptimalPriceForMargin(60, 100, 200)).toBe(200)
  })

  it('caps at competitor price when computed price > competitor', () => {
    // cost=60, target=40% → 100; competitor=90 → capped to 90
    expect(computeOptimalPriceForMargin(60, 40, 90)).toBe(90)
  })

  it('does not cap when computed price <= competitor', () => {
    // cost=60, target=40% → 100; competitor=120 → not capped
    expect(computeOptimalPriceForMargin(60, 40, 120)).toBe(100)
  })

  it('rounds to exactly 2 decimal places', () => {
    // cost=60, target=33% → price = 60/0.67 ≈ 89.55...
    const price = computeOptimalPriceForMargin(60, 33)
    expect(price).toBe(Math.round(price * 100) / 100)
    expect(String(price).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('handles 50% target margin', () => {
    // cost=50 → price = 50/0.5 = 100
    expect(computeOptimalPriceForMargin(50, 50)).toBe(100)
  })

  it('null competitor price behaves same as no competitor', () => {
    expect(computeOptimalPriceForMargin(60, 40, null)).toBe(
      computeOptimalPriceForMargin(60, 40),
    )
  })
})

// ── generateSensitivityNarrative ─────────────────────────────────────────────

describe('generateSensitivityNarrative', () => {
  const goodPortfolio = {
    baseline_monthly_margin: 10000,
    new_monthly_margin: 10000,
    total_impact_try: 0,
    impact_pct: 0,
  }
  const badPortfolio = {
    baseline_monthly_margin: 10000,
    new_monthly_margin: 7000,
    total_impact_try: -3000,
    impact_pct: -30,
  }

  it('returns resilience message when highRiskCount is 0', () => {
    const narrative = generateSensitivityNarrative(0, 10, goodPortfolio, 10)
    expect(narrative).toContain('dayanıklılığı')
  })

  it('includes risk count and total in narrative when highRiskCount > 0', () => {
    const narrative = generateSensitivityNarrative(3, 10, badPortfolio, 10)
    expect(narrative).toContain('3')
    expect(narrative).toContain('10')
  })

  it('mentions cost inflation % in narrative', () => {
    const narrative = generateSensitivityNarrative(2, 5, badPortfolio, 15)
    expect(narrative).toContain('15')
  })

  it('includes loss amount when total_impact_try < 0', () => {
    const narrative = generateSensitivityNarrative(2, 5, badPortfolio, 10)
    expect(narrative).toContain('₺')
  })

  it('does not include loss amount when impact is not negative', () => {
    const narrative = generateSensitivityNarrative(2, 5, goodPortfolio, 10)
    expect(narrative).not.toContain('₺')
  })

  it('handles single high-risk product out of one total', () => {
    const narrative = generateSensitivityNarrative(1, 1, badPortfolio, 10)
    expect(narrative).toContain('1/1')
  })
})
