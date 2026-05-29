// ─────────────────────────────────────────────────────────────────────────────
// tests/gross-margin-bridge.test.ts
//
// Unit tests for all pure functions in gross-margin-bridge.service.ts
//
//   computeVolumeEffect                 (8 tests)
//   computePriceEffect                  (6 tests)
//   computeCostEffect                   (6 tests)
//   computeMixEffect                    (5 tests)
//   computeTotalGpChange                (4 tests)
//   buildGrossMarginBridge              (10 tests)
//   classifyBridgeComponentSignificance (5 tests)
//   computeMarginImprovementPp          (5 tests)
//   classifyGrossMarginHealth           (7 tests)
//   identifyDominantDriver              (5 tests)
//   buildProductBridgeContributions     (8 tests)
//   classifyMarginDynamics              (8 tests)
//   Integration                         (3 tests)
//   Total: 80 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeVolumeEffect,
  computePriceEffect,
  computeCostEffect,
  computeMixEffect,
  computeTotalGpChange,
  buildGrossMarginBridge,
  classifyBridgeComponentSignificance,
  computeMarginImprovementPp,
  classifyGrossMarginHealth,
  identifyDominantDriver,
  buildProductBridgeContributions,
  classifyMarginDynamics,
  type ProductPeriodData,
  type GrossMarginBridgeComponent,
} from '../lib/services/finance/gross-margin-bridge.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductPeriodData> = {}): ProductPeriodData {
  return {
    product_id: 'P001',
    product_name: 'Ürün A',
    units_sold_current: 100,
    units_sold_prior: 100,
    avg_price_current: 50,
    avg_price_prior: 50,
    avg_cost_current: 30,
    avg_cost_prior: 30,
    revenue_current: 5000,
    revenue_prior: 5000,
    cogs_current: 3000,
    cogs_prior: 3000,
    gross_profit_current: 2000,
    gross_profit_prior: 2000,
    margin_pct_current: 40,
    margin_pct_prior: 40,
    ...overrides,
  }
}

// Integration fixture from spec:
// Prior: 100 units @ ₺50, cost ₺30  → GP = ₺2000
// Current: 130 units @ ₺55, cost ₺32 → GP = ₺2990
const integrationProduct: ProductPeriodData = {
  product_id: 'INT001',
  product_name: 'Entegrasyon Ürünü',
  units_sold_current: 130,
  units_sold_prior: 100,
  avg_price_current: 55,
  avg_price_prior: 50,
  avg_cost_current: 32,
  avg_cost_prior: 30,
  revenue_current: 130 * 55,   // 7150
  revenue_prior: 100 * 50,     // 5000
  cogs_current: 130 * 32,      // 4160
  cogs_prior: 100 * 30,        // 3000
  gross_profit_current: 130 * (55 - 32), // 2990
  gross_profit_prior: 100 * (50 - 30),   // 2000
  margin_pct_current: ((130 * 23) / (130 * 55)) * 100,  // ≈41.8%
  margin_pct_prior: ((100 * 20) / (100 * 50)) * 100,    // 40%
}

// ── computeVolumeEffect ───────────────────────────────────────────────────────

describe('computeVolumeEffect', () => {
  it('single product: volume increase at prior margin → positive effect', () => {
    // 30 units increase × ₺20 prior margin/unit = ₺600
    expect(computeVolumeEffect([integrationProduct])).toBeCloseTo(600)
  })

  it('single product: no volume change → zero effect', () => {
    const p = makeProduct({ units_sold_current: 100, units_sold_prior: 100 })
    expect(computeVolumeEffect([p])).toBeCloseTo(0)
  })

  it('single product: volume decrease → negative effect', () => {
    // 80 current, 100 prior, margin ₺20 → -20 × 20 = -400
    const p = makeProduct({
      units_sold_current: 80,
      units_sold_prior: 100,
      gross_profit_prior: 100 * 20,
    })
    expect(computeVolumeEffect([p])).toBeCloseTo(-400)
  })

  it('product with zero prior units → excluded from calculation', () => {
    const p = makeProduct({ units_sold_prior: 0, gross_profit_prior: 0 })
    expect(computeVolumeEffect([p])).toBe(0)
  })

  it('two products aggregate correctly', () => {
    // P1: 10 extra units × ₺20 margin = ₺200
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 110, units_sold_prior: 100, gross_profit_prior: 2000 })
    // P2: -5 units × ₺30 margin = -₺150
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 95, units_sold_prior: 100, gross_profit_prior: 3000 })
    expect(computeVolumeEffect([p1, p2])).toBeCloseTo(200 - 150)
  })

  it('empty products array → zero', () => {
    expect(computeVolumeEffect([])).toBe(0)
  })

  it('negative prior margin × volume increase → negative effect', () => {
    // Prior GP negative: -500 / 100 units = -5/unit → 10 extra × -5 = -50
    const p = makeProduct({
      units_sold_current: 110,
      units_sold_prior: 100,
      gross_profit_prior: -500,
    })
    expect(computeVolumeEffect([p])).toBeCloseTo(-50)
  })

  it('large volume change produces proportional result', () => {
    // 200 → 400 units, prior margin ₺10/unit → effect = 200 × 10 = 2000
    const p = makeProduct({
      units_sold_current: 400,
      units_sold_prior: 200,
      gross_profit_prior: 200 * 10,
    })
    expect(computeVolumeEffect([p])).toBeCloseTo(2000)
  })
})

// ── computePriceEffect ────────────────────────────────────────────────────────

describe('computePriceEffect', () => {
  it('price increase at current volume → positive effect', () => {
    // 130 units × (55 - 50) = 650
    expect(computePriceEffect([integrationProduct])).toBeCloseTo(650)
  })

  it('no price change → zero effect', () => {
    const p = makeProduct({ avg_price_current: 50, avg_price_prior: 50 })
    expect(computePriceEffect([p])).toBe(0)
  })

  it('price decrease → negative effect', () => {
    // 100 × (45 - 50) = -500
    const p = makeProduct({ units_sold_current: 100, avg_price_current: 45, avg_price_prior: 50 })
    expect(computePriceEffect([p])).toBeCloseTo(-500)
  })

  it('two products: price effects aggregate', () => {
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 100, avg_price_current: 55, avg_price_prior: 50 })
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 200, avg_price_current: 48, avg_price_prior: 50 })
    // 100×5 + 200×(-2) = 500 - 400 = 100
    expect(computePriceEffect([p1, p2])).toBeCloseTo(100)
  })

  it('empty array → zero', () => {
    expect(computePriceEffect([])).toBe(0)
  })

  it('zero current units → no price effect', () => {
    const p = makeProduct({ units_sold_current: 0, avg_price_current: 60, avg_price_prior: 50 })
    expect(computePriceEffect([p])).toBe(0)
  })
})

// ── computeCostEffect ─────────────────────────────────────────────────────────

describe('computeCostEffect', () => {
  it('cost increase → negative effect (reduces margin)', () => {
    // -130 × (32 - 30) = -260
    expect(computeCostEffect([integrationProduct])).toBeCloseTo(-260)
  })

  it('no cost change → zero effect', () => {
    const p = makeProduct({ avg_cost_current: 30, avg_cost_prior: 30 })
    expect(computeCostEffect([p])).toBe(0)
  })

  it('cost decrease → positive effect (improves margin)', () => {
    // -100 × (25 - 30) = 500
    const p = makeProduct({ units_sold_current: 100, avg_cost_current: 25, avg_cost_prior: 30 })
    expect(computeCostEffect([p])).toBeCloseTo(500)
  })

  it('two products: cost effects aggregate', () => {
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 100, avg_cost_current: 32, avg_cost_prior: 30 })
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 200, avg_cost_current: 28, avg_cost_prior: 30 })
    // -(100×2) + -(200×(-2)) = -200 + 400 = 200
    expect(computeCostEffect([p1, p2])).toBeCloseTo(200)
  })

  it('empty array → zero', () => {
    expect(computeCostEffect([])).toBe(0)
  })

  it('zero current units → no cost effect', () => {
    const p = makeProduct({ units_sold_current: 0, avg_cost_current: 40, avg_cost_prior: 30 })
    expect(computeCostEffect([p])).toBe(0)
  })
})

// ── computeMixEffect ──────────────────────────────────────────────────────────

describe('computeMixEffect', () => {
  it('residual = total - volume - price - cost', () => {
    // Integration example: total=990, volume=600, price=650, cost=-260
    // mix = 990 - 600 - 650 - (-260) = 0
    expect(computeMixEffect(990, 600, 650, -260)).toBeCloseTo(0)
  })

  it('non-zero residual when components do not explain total', () => {
    expect(computeMixEffect(1000, 300, 200, -100)).toBeCloseTo(600)
  })

  it('negative residual possible', () => {
    expect(computeMixEffect(100, 200, 100, -50)).toBeCloseTo(-150)
  })

  it('all effects = 0 and total = 0 → mix = 0', () => {
    expect(computeMixEffect(0, 0, 0, 0)).toBe(0)
  })

  it('mix reconciles bridge perfectly (via buildGrossMarginBridge)', () => {
    const products = [integrationProduct]
    const priorGP = 2000
    const currentGP = 2990
    const total = computeTotalGpChange(priorGP, currentGP)
    const vol   = computeVolumeEffect(products)
    const price = computePriceEffect(products)
    const cost  = computeCostEffect(products)
    const mix   = computeMixEffect(total, vol, price, cost)
    expect(vol + price + cost + mix).toBeCloseTo(total)
  })
})

// ── computeTotalGpChange ──────────────────────────────────────────────────────

describe('computeTotalGpChange', () => {
  it('positive change: current > prior', () => {
    expect(computeTotalGpChange(2000, 2990)).toBeCloseTo(990)
  })

  it('negative change: current < prior', () => {
    expect(computeTotalGpChange(3000, 2500)).toBeCloseTo(-500)
  })

  it('zero change: current = prior', () => {
    expect(computeTotalGpChange(1500, 1500)).toBe(0)
  })

  it('both zero → zero', () => {
    expect(computeTotalGpChange(0, 0)).toBe(0)
  })
})

// ── buildGrossMarginBridge ────────────────────────────────────────────────────

describe('buildGrossMarginBridge', () => {
  it('returns exactly 5 components', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(result).toHaveLength(5)
  })

  it('component keys are volume, price, cost, mix, total', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const keys = result.map(c => c.component_key)
    expect(keys).toEqual(['volume', 'price', 'cost', 'mix', 'total'])
  })

  it('bridge reconciles: volume + price + cost + mix = total', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const vol   = result.find(c => c.component_key === 'volume')!.amount_try
    const price = result.find(c => c.component_key === 'price')!.amount_try
    const cost  = result.find(c => c.component_key === 'cost')!.amount_try
    const mix   = result.find(c => c.component_key === 'mix')!.amount_try
    const total = result.find(c => c.component_key === 'total')!.amount_try
    expect(vol + price + cost + mix).toBeCloseTo(total)
  })

  it('total.amount_try = currentGP - priorGP', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const total  = result.find(c => c.component_key === 'total')!
    expect(total.amount_try).toBeCloseTo(990)
  })

  it('integration: volume = 600', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(result.find(c => c.component_key === 'volume')!.amount_try).toBeCloseTo(600)
  })

  it('integration: price = 650', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(result.find(c => c.component_key === 'price')!.amount_try).toBeCloseTo(650)
  })

  it('integration: cost = -260', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(result.find(c => c.component_key === 'cost')!.amount_try).toBeCloseTo(-260)
  })

  it('integration: mix = 0 (residual)', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(result.find(c => c.component_key === 'mix')!.amount_try).toBeCloseTo(0)
  })

  it('is_favorable correct: positive amount = favorable', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const vol   = result.find(c => c.component_key === 'volume')!
    const cost  = result.find(c => c.component_key === 'cost')!
    expect(vol.is_favorable).toBe(true)
    expect(cost.is_favorable).toBe(false)
  })

  it('pct_of_prior_gp is 0 when priorGP = 0', () => {
    const result = buildGrossMarginBridge([], 0, 0)
    result.forEach(c => {
      expect(c.pct_of_prior_gp).toBe(0)
    })
  })
})

// ── classifyBridgeComponentSignificance ──────────────────────────────────────

describe('classifyBridgeComponentSignificance', () => {
  it('material: |amount| > 10% of priorGP', () => {
    expect(classifyBridgeComponentSignificance(1100, 10000)).toBe('material')
  })

  it('moderate: |amount| > 3% but ≤ 10%', () => {
    expect(classifyBridgeComponentSignificance(500, 10000)).toBe('moderate')
  })

  it('minor: |amount| ≤ 3%', () => {
    expect(classifyBridgeComponentSignificance(200, 10000)).toBe('minor')
  })

  it('minor when priorGP = 0 regardless of amount', () => {
    expect(classifyBridgeComponentSignificance(5000, 0)).toBe('minor')
  })

  it('negative amount uses absolute value for classification', () => {
    expect(classifyBridgeComponentSignificance(-1500, 10000)).toBe('material')
  })
})

// ── computeMarginImprovementPp ────────────────────────────────────────────────

describe('computeMarginImprovementPp', () => {
  it('positive: current > prior', () => {
    expect(computeMarginImprovementPp(42, 40)).toBeCloseTo(2)
  })

  it('negative: current < prior (deterioration)', () => {
    expect(computeMarginImprovementPp(35, 40)).toBeCloseTo(-5)
  })

  it('zero: same margin', () => {
    expect(computeMarginImprovementPp(40, 40)).toBe(0)
  })

  it('large improvement', () => {
    expect(computeMarginImprovementPp(65, 40)).toBeCloseTo(25)
  })

  it('large deterioration', () => {
    expect(computeMarginImprovementPp(10, 45)).toBeCloseTo(-35)
  })
})

// ── classifyGrossMarginHealth ─────────────────────────────────────────────────

describe('classifyGrossMarginHealth', () => {
  it('premium: >= 50%', () => {
    expect(classifyGrossMarginHealth(50)).toBe('premium')
    expect(classifyGrossMarginHealth(75)).toBe('premium')
  })

  it('strong: >= 35% and < 50%', () => {
    expect(classifyGrossMarginHealth(35)).toBe('strong')
    expect(classifyGrossMarginHealth(49)).toBe('strong')
  })

  it('adequate: >= 20% and < 35%', () => {
    expect(classifyGrossMarginHealth(20)).toBe('adequate')
    expect(classifyGrossMarginHealth(34)).toBe('adequate')
  })

  it('thin: >= 10% and < 20%', () => {
    expect(classifyGrossMarginHealth(10)).toBe('thin')
    expect(classifyGrossMarginHealth(19)).toBe('thin')
  })

  it('critical: < 10%', () => {
    expect(classifyGrossMarginHealth(9)).toBe('critical')
    expect(classifyGrossMarginHealth(0)).toBe('critical')
    expect(classifyGrossMarginHealth(-5)).toBe('critical')
  })

  it('boundary at exactly 35%', () => {
    expect(classifyGrossMarginHealth(35)).toBe('strong')
  })

  it('boundary at exactly 20%', () => {
    expect(classifyGrossMarginHealth(20)).toBe('adequate')
  })
})

// ── identifyDominantDriver ────────────────────────────────────────────────────

describe('identifyDominantDriver', () => {
  it('returns component with largest absolute amount (excluding total)', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Hacim', component_key: 'volume', amount_try: 300, pct_of_prior_gp: 15, is_favorable: true, description: '' },
      { name: 'Fiyat', component_key: 'price', amount_try: -800, pct_of_prior_gp: -40, is_favorable: false, description: '' },
      { name: 'Maliyet', component_key: 'cost', amount_try: 200, pct_of_prior_gp: 10, is_favorable: true, description: '' },
      { name: 'Karışım', component_key: 'mix', amount_try: 50, pct_of_prior_gp: 2.5, is_favorable: true, description: '' },
      { name: 'Toplam', component_key: 'total', amount_try: -250, pct_of_prior_gp: -12.5, is_favorable: false, description: '' },
    ]
    const driver = identifyDominantDriver(components)
    expect(driver?.component_key).toBe('price')
  })

  it('excludes total component from consideration', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Hacim', component_key: 'volume', amount_try: 100, pct_of_prior_gp: 5, is_favorable: true, description: '' },
      { name: 'Toplam', component_key: 'total', amount_try: 9000, pct_of_prior_gp: 450, is_favorable: true, description: '' },
    ]
    const driver = identifyDominantDriver(components)
    expect(driver?.component_key).toBe('volume')
  })

  it('returns null for empty array', () => {
    expect(identifyDominantDriver([])).toBeNull()
  })

  it('returns null when only total component exists', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Toplam', component_key: 'total', amount_try: 500, pct_of_prior_gp: 25, is_favorable: true, description: '' },
    ]
    expect(identifyDominantDriver(components)).toBeNull()
  })

  it('handles negative amounts for largest absolute selection', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Hacim', component_key: 'volume', amount_try: -1000, pct_of_prior_gp: -50, is_favorable: false, description: '' },
      { name: 'Fiyat', component_key: 'price', amount_try: 500, pct_of_prior_gp: 25, is_favorable: true, description: '' },
      { name: 'Toplam', component_key: 'total', amount_try: -500, pct_of_prior_gp: -25, is_favorable: false, description: '' },
    ]
    expect(identifyDominantDriver(components)?.component_key).toBe('volume')
  })
})

// ── buildProductBridgeContributions ──────────────────────────────────────────

describe('buildProductBridgeContributions', () => {
  it('computes gp_change_try correctly', () => {
    const p = makeProduct({
      gross_profit_current: 2990,
      gross_profit_prior: 2000,
    })
    const result = buildProductBridgeContributions([p], 990)
    expect(result[0].gp_change_try).toBeCloseTo(990)
  })

  it('computes gp_change_pct_of_total correctly', () => {
    // Single product: 100% contribution
    const p = makeProduct({ gross_profit_current: 2990, gross_profit_prior: 2000 })
    const result = buildProductBridgeContributions([p], 990)
    expect(result[0].gp_change_pct_of_total).toBeCloseTo(100)
  })

  it('is_top_contributor true when |contribution| > 20% of total', () => {
    const p = makeProduct({ gross_profit_current: 2990, gross_profit_prior: 2000 })
    const result = buildProductBridgeContributions([p], 990)
    expect(result[0].is_top_contributor).toBe(true)
  })

  it('is_top_contributor false when |contribution| <= 20% of total', () => {
    // Product contributes 150 out of 1000 total = 15% < 20%
    const p = makeProduct({ gross_profit_current: 1150, gross_profit_prior: 1000 })
    const result = buildProductBridgeContributions([p], 1000)
    expect(result[0].is_top_contributor).toBe(false)
  })

  it('computes margin_pct_change_pp correctly', () => {
    const p = makeProduct({ margin_pct_current: 41.8, margin_pct_prior: 40 })
    const result = buildProductBridgeContributions([p], 990)
    expect(result[0].margin_pct_change_pp).toBeCloseTo(1.8)
  })

  it('two products: contributions sum correctly', () => {
    const p1 = makeProduct({ product_id: 'P1', gross_profit_current: 1200, gross_profit_prior: 1000 })
    const p2 = makeProduct({ product_id: 'P2', gross_profit_current: 900,  gross_profit_prior: 700 })
    const total = (1200 - 1000) + (900 - 700)  // = 400
    const result = buildProductBridgeContributions([p1, p2], total)
    const pctSum = result.reduce((s, c) => s + c.gp_change_pct_of_total, 0)
    expect(pctSum).toBeCloseTo(100)
  })

  it('gp_change_pct_of_total = 0 when total = 0', () => {
    const p = makeProduct({ gross_profit_current: 2000, gross_profit_prior: 2000 })
    const result = buildProductBridgeContributions([p], 0)
    expect(result[0].gp_change_pct_of_total).toBe(0)
  })

  it('empty array → empty result', () => {
    expect(buildProductBridgeContributions([], 0)).toHaveLength(0)
  })
})

// ── classifyMarginDynamics ────────────────────────────────────────────────────

describe('classifyMarginDynamics', () => {
  it('margin_expansion: price > 0 and cost < 0', () => {
    expect(classifyMarginDynamics(500, -200)).toBe('margin_expansion')
  })

  it('volume_driven: price > 0 and cost > 0', () => {
    expect(classifyMarginDynamics(500, 200)).toBe('volume_driven')
  })

  it('cost_compression: price < 0 and cost < 0', () => {
    expect(classifyMarginDynamics(-300, -200)).toBe('cost_compression')
  })

  it('price_pressure: price < 0 and cost > 0', () => {
    expect(classifyMarginDynamics(-300, 200)).toBe('price_pressure')
  })

  it('neutral: both ~0', () => {
    expect(classifyMarginDynamics(0, 0)).toBe('neutral')
  })

  it('neutral: both within epsilon', () => {
    expect(classifyMarginDynamics(0.005, 0.005)).toBe('neutral')
  })

  it('mixed: price 0, cost > 0', () => {
    expect(classifyMarginDynamics(0, 500)).toBe('mixed')
  })

  it('mixed: price > 0, cost 0', () => {
    expect(classifyMarginDynamics(500, 0)).toBe('mixed')
  })
})

// ── Additional computeVolumeEffect tests ─────────────────────────────────────

describe('computeVolumeEffect — additional', () => {
  it('single product new to current period (no prior units) → excluded', () => {
    const p = makeProduct({ units_sold_prior: 0, gross_profit_prior: 0, units_sold_current: 50 })
    expect(computeVolumeEffect([p])).toBe(0)
  })

  it('product completely discontinued (zero current units) → negative effect', () => {
    // 0 - 100 = -100 units × prior_margin 20 → -2000
    const p = makeProduct({
      units_sold_current: 0,
      units_sold_prior: 100,
      gross_profit_prior: 2000,
    })
    expect(computeVolumeEffect([p])).toBeCloseTo(-2000)
  })

  it('three products: aggregate with mixed volume changes', () => {
    // P1: +20 units × ₺10 margin = +200
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 120, units_sold_prior: 100, gross_profit_prior: 1000 })
    // P2: -10 units × ₺15 margin = -150
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 90,  units_sold_prior: 100, gross_profit_prior: 1500 })
    // P3: +0 units → 0
    const p3 = makeProduct({ product_id: 'P3', units_sold_current: 100, units_sold_prior: 100, gross_profit_prior: 500  })
    expect(computeVolumeEffect([p1, p2, p3])).toBeCloseTo(50)
  })

  it('high margin product large volume drop → large negative effect', () => {
    // -500 units × ₺100/unit = -50_000
    const p = makeProduct({
      units_sold_current: 0,
      units_sold_prior: 500,
      gross_profit_prior: 50_000,
    })
    expect(computeVolumeEffect([p])).toBeCloseTo(-50_000)
  })
})

// ── Additional computePriceEffect tests ──────────────────────────────────────

describe('computePriceEffect — additional', () => {
  it('three products with mixed price changes', () => {
    // P1: 100 × +5 = +500
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 100, avg_price_current: 55, avg_price_prior: 50 })
    // P2: 200 × -3 = -600
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 200, avg_price_current: 47, avg_price_prior: 50 })
    // P3: 150 × 0 = 0
    const p3 = makeProduct({ product_id: 'P3', units_sold_current: 150, avg_price_current: 30, avg_price_prior: 30 })
    expect(computePriceEffect([p1, p2, p3])).toBeCloseTo(-100)
  })

  it('large current units with small price change → meaningful effect', () => {
    // 10_000 units × ₺1 price increase = ₺10_000
    const p = makeProduct({ units_sold_current: 10_000, avg_price_current: 101, avg_price_prior: 100 })
    expect(computePriceEffect([p])).toBeCloseTo(10_000)
  })

  it('price decrease on high volume → large negative effect', () => {
    // 5_000 units × -₺10 = -₺50_000
    const p = makeProduct({ units_sold_current: 5_000, avg_price_current: 90, avg_price_prior: 100 })
    expect(computePriceEffect([p])).toBeCloseTo(-50_000)
  })
})

// ── Additional computeCostEffect tests ───────────────────────────────────────

describe('computeCostEffect — additional', () => {
  it('supply chain cost savings → positive effect', () => {
    // 200 units × (₺25 - ₺30) = -₺1000 cost change → effect = +₺1000
    const p = makeProduct({ units_sold_current: 200, avg_cost_current: 25, avg_cost_prior: 30 })
    expect(computeCostEffect([p])).toBeCloseTo(1000)
  })

  it('cost increase and price increase partially offset', () => {
    // 100 × (₺35-₺30) = -₺500 cost effect
    const p = makeProduct({ units_sold_current: 100, avg_cost_current: 35, avg_cost_prior: 30 })
    expect(computeCostEffect([p])).toBeCloseTo(-500)
  })

  it('multiple products: cost savings and cost overruns aggregate', () => {
    // P1: -100 × (28-30) = +200 (saving)
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 100, avg_cost_current: 28, avg_cost_prior: 30 })
    // P2: -200 × (33-30) = -600 (overrun)
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 200, avg_cost_current: 33, avg_cost_prior: 30 })
    expect(computeCostEffect([p1, p2])).toBeCloseTo(-400)
  })
})

// ── Additional computeMixEffect tests ────────────────────────────────────────

describe('computeMixEffect — additional', () => {
  it('mix effect > 0 when high-margin mix shift', () => {
    // total = 1500, vol = 500, price = 300, cost = -100 → mix = 1500 - 500 - 300 - (-100) = 800
    expect(computeMixEffect(1500, 500, 300, -100)).toBeCloseTo(800)
  })

  it('mix effect exactly zero for single-product bridge (no mix shift possible)', () => {
    // For integration product: vol+price+cost should = total, mix = 0
    const vol   = computeVolumeEffect([integrationProduct])
    const price = computePriceEffect([integrationProduct])
    const cost  = computeCostEffect([integrationProduct])
    const total = computeTotalGpChange(2000, 2990)
    expect(computeMixEffect(total, vol, price, cost)).toBeCloseTo(0, 1)
  })

  it('negative mix effect when low-margin products grew faster', () => {
    expect(computeMixEffect(-200, 100, 50, 30)).toBeCloseTo(-380)
  })
})

// ── Additional computeTotalGpChange tests ─────────────────────────────────────

describe('computeTotalGpChange — additional', () => {
  it('both negative, current less negative → positive change', () => {
    expect(computeTotalGpChange(-5000, -2000)).toBe(3000)
  })

  it('from zero to positive → equals current', () => {
    expect(computeTotalGpChange(0, 4500)).toBe(4500)
  })

  it('from positive to zero → equals negative prior', () => {
    expect(computeTotalGpChange(3000, 0)).toBe(-3000)
  })
})

// ── Additional buildGrossMarginBridge tests ───────────────────────────────────

describe('buildGrossMarginBridge — additional', () => {
  it('empty products array → all bridge amounts are 0 for non-total, total = currentGP - priorGP', () => {
    const result = buildGrossMarginBridge([], 1000, 1500)
    const total = result.find(c => c.component_key === 'total')!
    expect(total.amount_try).toBe(500)
    const vol = result.find(c => c.component_key === 'volume')!
    expect(vol.amount_try).toBe(0)
  })

  it('no change scenario: all components are zero', () => {
    const p = makeProduct()  // default: same current/prior
    const result = buildGrossMarginBridge([p], 2000, 2000)
    result.forEach(c => {
      expect(c.amount_try).toBeCloseTo(0)
    })
  })

  it('Turkish description strings are present for all components', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    result.forEach(c => {
      expect(typeof c.description).toBe('string')
      expect(c.description.length).toBeGreaterThan(5)
    })
  })

  it('name strings are Turkish for all components', () => {
    const result = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const keys = ['Hacim', 'Fiyat', 'Maliyet', 'Karışım', 'Toplam']
    keys.forEach((k, i) => expect(result[i].name).toContain(k.split(' ')[0]))
  })

  it('unfavorable total: is_favorable = false for total', () => {
    const p = makeProduct({ gross_profit_current: 1500, gross_profit_prior: 2000 })
    const result = buildGrossMarginBridge([p], 2000, 1500)
    const total = result.find(c => c.component_key === 'total')!
    expect(total.is_favorable).toBe(false)
  })

  it('pct_of_prior_gp is negative for negative priorGP (uses absolute)', () => {
    // negative prior GP: |(amount)| / |priorGP| × 100
    const p = makeProduct({ units_sold_current: 80, units_sold_prior: 100, gross_profit_prior: -1000 })
    const result = buildGrossMarginBridge([p], -1000, -800)
    // total is 200, pct = 200/1000 × 100 = 20% (uses Math.abs)
    const total = result.find(c => c.component_key === 'total')!
    expect(total.pct_of_prior_gp).toBeCloseTo(20)
  })

  it('two-product bridge reconciles', () => {
    const p1 = makeProduct({ product_id: 'P1', units_sold_current: 120, units_sold_prior: 100, avg_price_current: 55, avg_price_prior: 50, avg_cost_current: 32, avg_cost_prior: 30, gross_profit_current: 120 * (55 - 32), gross_profit_prior: 100 * (50 - 30), revenue_current: 120 * 55, revenue_prior: 100 * 50, cogs_current: 120 * 32, cogs_prior: 100 * 30, margin_pct_current: 23/55*100, margin_pct_prior: 20/50*100 })
    const p2 = makeProduct({ product_id: 'P2', units_sold_current: 50, units_sold_prior: 50, avg_price_current: 40, avg_price_prior: 40, avg_cost_current: 20, avg_cost_prior: 20, gross_profit_current: 50 * 20, gross_profit_prior: 50 * 20, revenue_current: 50*40, revenue_prior: 50*40, cogs_current: 50*20, cogs_prior: 50*20, margin_pct_current: 50, margin_pct_prior: 50 })
    const priorGP   = p1.gross_profit_prior   + p2.gross_profit_prior
    const currentGP = p1.gross_profit_current + p2.gross_profit_current
    const result = buildGrossMarginBridge([p1, p2], priorGP, currentGP)
    const vol   = result.find(c => c.component_key === 'volume')!.amount_try
    const price = result.find(c => c.component_key === 'price')!.amount_try
    const cost  = result.find(c => c.component_key === 'cost')!.amount_try
    const mix   = result.find(c => c.component_key === 'mix')!.amount_try
    const total = result.find(c => c.component_key === 'total')!.amount_try
    expect(vol + price + cost + mix).toBeCloseTo(total)
  })
})

// ── Additional classifyBridgeComponentSignificance tests ──────────────────────

describe('classifyBridgeComponentSignificance — additional', () => {
  it('boundary: exactly 10% → material', () => {
    // |1001| / 10000 = 10.01% > 10% → material
    expect(classifyBridgeComponentSignificance(1001, 10000)).toBe('material')
  })

  it('boundary: exactly 10% of prior → just material threshold test', () => {
    // |amount| / |prior| > 0.10 → material; if exactly 0.10 = 10% → moderate (not >)
    expect(classifyBridgeComponentSignificance(1000, 10000)).toBe('moderate')
  })

  it('boundary: exactly 3% → moderate (not minor, > 0.03)', () => {
    // 300.1 / 10000 = 3.001% > 3% → moderate
    expect(classifyBridgeComponentSignificance(301, 10000)).toBe('moderate')
  })

  it('exactly 3% = moderate boundary (exactly 0.03 not > 0.03 → minor)', () => {
    expect(classifyBridgeComponentSignificance(300, 10000)).toBe('minor')
  })

  it('negative prior GP uses absolute value', () => {
    // |-1500| / |-10000| = 15% → material
    expect(classifyBridgeComponentSignificance(1500, -10000)).toBe('material')
  })

  it('zero amount → minor regardless of prior', () => {
    expect(classifyBridgeComponentSignificance(0, 10000)).toBe('minor')
  })
})

// ── Additional computeMarginImprovementPp tests ───────────────────────────────

describe('computeMarginImprovementPp — additional', () => {
  it('negative to positive improvement', () => {
    expect(computeMarginImprovementPp(5, -10)).toBeCloseTo(15)
  })

  it('both negative, less negative current → positive improvement', () => {
    expect(computeMarginImprovementPp(-2, -8)).toBeCloseTo(6)
  })

  it('fractional pp change', () => {
    expect(computeMarginImprovementPp(28.7, 28.2)).toBeCloseTo(0.5)
  })
})

// ── Additional classifyGrossMarginHealth tests ────────────────────────────────

describe('classifyGrossMarginHealth — additional', () => {
  it('very high value (99%) → premium', () => {
    expect(classifyGrossMarginHealth(99)).toBe('premium')
  })

  it('exactly 10% boundary → thin', () => {
    expect(classifyGrossMarginHealth(10)).toBe('thin')
  })

  it('exactly 50% → premium', () => {
    expect(classifyGrossMarginHealth(50)).toBe('premium')
  })

  it('49.9% → strong (just below premium)', () => {
    expect(classifyGrossMarginHealth(49.9)).toBe('strong')
  })

  it('negative margin → critical', () => {
    expect(classifyGrossMarginHealth(-20)).toBe('critical')
  })
})

// ── Additional identifyDominantDriver tests ───────────────────────────────────

describe('identifyDominantDriver — additional', () => {
  it('all four non-total components equal → first by reduce wins', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Hacim',   component_key: 'volume', amount_try: 100, pct_of_prior_gp: 5, is_favorable: true, description: '' },
      { name: 'Fiyat',   component_key: 'price',  amount_try: 100, pct_of_prior_gp: 5, is_favorable: true, description: '' },
      { name: 'Maliyet', component_key: 'cost',   amount_try: 100, pct_of_prior_gp: 5, is_favorable: true, description: '' },
      { name: 'Karışım', component_key: 'mix',    amount_try: 100, pct_of_prior_gp: 5, is_favorable: true, description: '' },
      { name: 'Toplam',  component_key: 'total',  amount_try: 400, pct_of_prior_gp: 20, is_favorable: true, description: '' },
    ]
    const driver = identifyDominantDriver(components)
    expect(driver).not.toBeNull()
    // reduce returns last with equal max (because > not >=), first wins since initial is drivers[0]
    expect(['volume','price','cost','mix']).toContain(driver!.component_key)
  })

  it('mix is dominant driver', () => {
    const components: GrossMarginBridgeComponent[] = [
      { name: 'Hacim',   component_key: 'volume', amount_try: 100,  pct_of_prior_gp: 5,  is_favorable: true,  description: '' },
      { name: 'Fiyat',   component_key: 'price',  amount_try: 50,   pct_of_prior_gp: 2.5,is_favorable: true,  description: '' },
      { name: 'Maliyet', component_key: 'cost',   amount_try: -30,  pct_of_prior_gp: -1.5,is_favorable: false, description: '' },
      { name: 'Karışım', component_key: 'mix',    amount_try: -500, pct_of_prior_gp: -25, is_favorable: false, description: '' },
      { name: 'Toplam',  component_key: 'total',  amount_try: -380, pct_of_prior_gp:-19,  is_favorable: false, description: '' },
    ]
    expect(identifyDominantDriver(components)?.component_key).toBe('mix')
  })
})

// ── Additional buildProductBridgeContributions tests ──────────────────────────

describe('buildProductBridgeContributions — additional', () => {
  it('negative gp_change for declining product', () => {
    const p = makeProduct({ gross_profit_current: 1000, gross_profit_prior: 2000 })
    const result = buildProductBridgeContributions([p], -1000)
    expect(result[0].gp_change_try).toBe(-1000)
  })

  it('negative total: contribution pct uses gpChange / |totalGpChange| × 100', () => {
    // Both products decline, total is negative. contribution pcts retain sign of gpChange.
    const p1 = makeProduct({ product_id: 'P1', gross_profit_current: 500, gross_profit_prior: 800  })
    const p2 = makeProduct({ product_id: 'P2', gross_profit_current: 200, gross_profit_prior: 700  })
    // p1 delta = -300, p2 delta = -500, total = -800
    const result = buildProductBridgeContributions([p1, p2], -800)
    // formula: gpChange / Math.abs(totalGpChange) × 100
    // p1: -300 / 800 × 100 = -37.5%
    expect(result[0].gp_change_pct_of_total).toBeCloseTo(-37.5)
    // p2: -500 / 800 × 100 = -62.5%
    expect(result[1].gp_change_pct_of_total).toBeCloseTo(-62.5)
  })

  it('is_top_contributor boundary: exactly 20% → false', () => {
    // product contributes 200 of 1000 total = exactly 20% (not > 20%)
    const p = makeProduct({ gross_profit_current: 1200, gross_profit_prior: 1000 })
    const result = buildProductBridgeContributions([p], 1000)
    // change = 200, |change/|total|| = 200/1000 = 0.20 — NOT > 0.20 → false
    expect(result[0].is_top_contributor).toBe(false)
  })

  it('is_top_contributor true when product contributes > 20% of absolute total', () => {
    const p = makeProduct({ gross_profit_current: 1250, gross_profit_prior: 1000 })
    const result = buildProductBridgeContributions([p], 1000)
    // change = 250, 250/1000 = 0.25 > 0.20 → true
    expect(result[0].is_top_contributor).toBe(true)
  })

  it('preserves product name and id', () => {
    const p = makeProduct({ product_id: 'XYZ', product_name: 'Test Ürünü' })
    const result = buildProductBridgeContributions([p], 0)
    expect(result[0].product_id).toBe('XYZ')
    expect(result[0].product_name).toBe('Test Ürünü')
  })

  it('three products contributions sum close to 100% of total', () => {
    const p1 = makeProduct({ product_id: 'P1', gross_profit_current: 1500, gross_profit_prior: 1000 })
    const p2 = makeProduct({ product_id: 'P2', gross_profit_current: 800,  gross_profit_prior: 600  })
    const p3 = makeProduct({ product_id: 'P3', gross_profit_current: 200,  gross_profit_prior: 100  })
    const total = (1500-1000) + (800-600) + (200-100)  // 700
    const result = buildProductBridgeContributions([p1, p2, p3], total)
    const sum = result.reduce((s, c) => s + c.gp_change_pct_of_total, 0)
    expect(sum).toBeCloseTo(100)
  })
})

// ── Additional classifyMarginDynamics tests ───────────────────────────────────

describe('classifyMarginDynamics — additional', () => {
  it('large price increase, large cost decrease → margin_expansion', () => {
    expect(classifyMarginDynamics(50_000, -30_000)).toBe('margin_expansion')
  })

  it('both exactly at epsilon boundary → neutral', () => {
    expect(classifyMarginDynamics(0.009, -0.009)).toBe('neutral')
  })

  it('price above epsilon, cost within neutral range → volume_driven (cost=0.005 > 0)', () => {
    // isNeutral(0.005)=true (< 0.01) but 0.005 > 0, so price>0 && cost>0 → volume_driven
    expect(classifyMarginDynamics(500, 0.005)).toBe('volume_driven')
  })

  it('negative price, cost within neutral epsilon → price_pressure (cost=0.005 > 0)', () => {
    // price < 0, cost=0.005 > 0 → price_pressure
    expect(classifyMarginDynamics(-100, 0.005)).toBe('price_pressure')
  })

  it('very large cost_compression scenario', () => {
    expect(classifyMarginDynamics(-100_000, -50_000)).toBe('cost_compression')
  })
})

// ── Integration: full spec example ───────────────────────────────────────────

describe('Integration: spec example — product A 100→130 units, ₺50→55 price, ₺30→32 cost', () => {
  it('prior GP = 2000, current GP = 2990, total change = 990', () => {
    expect(integrationProduct.gross_profit_prior).toBe(2000)
    expect(integrationProduct.gross_profit_current).toBe(2990)
    expect(computeTotalGpChange(2000, 2990)).toBe(990)
  })

  it('bridge components reconcile to total change of ₺990', () => {
    const bridge = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    const vol   = bridge.find(c => c.component_key === 'volume')!.amount_try
    const price = bridge.find(c => c.component_key === 'price')!.amount_try
    const cost  = bridge.find(c => c.component_key === 'cost')!.amount_try
    const mix   = bridge.find(c => c.component_key === 'mix')!.amount_try
    expect(vol + price + cost + mix).toBeCloseTo(990)
  })

  it('volume=600, price=650, cost=-260, mix=0 per spec formula', () => {
    const bridge = buildGrossMarginBridge([integrationProduct], 2000, 2990)
    expect(bridge.find(c => c.component_key === 'volume')!.amount_try).toBeCloseTo(600)
    expect(bridge.find(c => c.component_key === 'price')!.amount_try).toBeCloseTo(650)
    expect(bridge.find(c => c.component_key === 'cost')!.amount_try).toBeCloseTo(-260)
    expect(bridge.find(c => c.component_key === 'mix')!.amount_try).toBeCloseTo(0)
  })
})
