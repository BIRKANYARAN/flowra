// ─────────────────────────────────────────────────────────────────────────────
// tests/pricing-intelligence.test.ts
//
// Unit tests for all pure functions in pricing-intelligence.service.ts:
//   - computeEffectivePrice
//   - computeDiscountRate
//   - classifyDiscountDiscipline
//   - computePriceRealization
//   - computePriceVariance
//   - classifyPricingPressure
//   - computeSkuPricingHealth
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeEffectivePrice,
  computeDiscountRate,
  classifyDiscountDiscipline,
  computePriceRealization,
  computePriceVariance,
  classifyPricingPressure,
  computeSkuPricingHealth,
} from '../lib/services/finance/pricing-intelligence.service'

// ── computeEffectivePrice ─────────────────────────────────────────────────────

describe('computeEffectivePrice', () => {
  it('returns revenue / quantity for normal inputs', () => {
    expect(computeEffectivePrice(1000, 10)).toBe(100)
  })

  it('returns null when quantity is 0', () => {
    expect(computeEffectivePrice(500, 0)).toBeNull()
  })

  it('returns 0 when revenue is 0 and quantity > 0', () => {
    expect(computeEffectivePrice(0, 5)).toBe(0)
  })

  it('handles non-integer division', () => {
    expect(computeEffectivePrice(1000, 3)).toBeCloseTo(333.33, 1)
  })

  it('handles large revenue and quantity', () => {
    expect(computeEffectivePrice(1_000_000, 1000)).toBe(1000)
  })
})

// ── computeDiscountRate ───────────────────────────────────────────────────────

describe('computeDiscountRate', () => {
  it('computes correct discount rate for normal inputs', () => {
    // listPrice=200, effectivePrice=150 → 25% discount
    expect(computeDiscountRate(200, 150)).toBeCloseTo(25)
  })

  it('returns null when listPrice is 0', () => {
    expect(computeDiscountRate(0, 100)).toBeNull()
  })

  it('clamps to 0 when effectivePrice > listPrice (no negative discount)', () => {
    // effectivePrice higher than listPrice → raw negative → clamped to 0
    expect(computeDiscountRate(100, 150)).toBe(0)
  })

  it('clamps to 100 when effective price is 0 (full discount)', () => {
    expect(computeDiscountRate(200, 0)).toBe(100)
  })

  it('returns 0 when listPrice equals effectivePrice (no discount)', () => {
    expect(computeDiscountRate(100, 100)).toBe(0)
  })

  it('handles small fractional discount', () => {
    // listPrice=1000, effectivePrice=990 → 1%
    expect(computeDiscountRate(1000, 990)).toBeCloseTo(1)
  })

  it('returns 100 when effective price is negative (extreme clamping)', () => {
    // raw = (100 - (-50)) / 100 * 100 = 150% → clamped to 100
    expect(computeDiscountRate(100, -50)).toBe(100)
  })
})

// ── classifyDiscountDiscipline ────────────────────────────────────────────────

describe('classifyDiscountDiscipline', () => {
  it('returns disciplined when discount < 5%', () => {
    expect(classifyDiscountDiscipline(3)).toBe('disciplined')
  })

  it('returns disciplined at 0%', () => {
    expect(classifyDiscountDiscipline(0)).toBe('disciplined')
  })

  it('boundary at exactly 5% → moderate (not disciplined)', () => {
    expect(classifyDiscountDiscipline(5)).toBe('moderate')
  })

  it('returns moderate for 5–14.9% range', () => {
    expect(classifyDiscountDiscipline(10)).toBe('moderate')
  })

  it('returns moderate at 14.9%', () => {
    expect(classifyDiscountDiscipline(14.9)).toBe('moderate')
  })

  it('boundary at exactly 15% → aggressive', () => {
    expect(classifyDiscountDiscipline(15)).toBe('aggressive')
  })

  it('returns aggressive for 15–29.9% range', () => {
    expect(classifyDiscountDiscipline(22)).toBe('aggressive')
  })

  it('boundary at exactly 30% → distressed', () => {
    expect(classifyDiscountDiscipline(30)).toBe('distressed')
  })

  it('returns distressed above 30%', () => {
    expect(classifyDiscountDiscipline(50)).toBe('distressed')
  })

  it('returns distressed at 100%', () => {
    expect(classifyDiscountDiscipline(100)).toBe('distressed')
  })
})

// ── computePriceRealization ───────────────────────────────────────────────────

describe('computePriceRealization', () => {
  it('computes correct realization pct for normal inputs', () => {
    // 800 actual / 1000 list = 80%
    expect(computePriceRealization(800, 1000)).toBe(80)
  })

  it('returns null when listRevenue is 0', () => {
    expect(computePriceRealization(500, 0)).toBeNull()
  })

  it('returns 100% when actual equals list', () => {
    expect(computePriceRealization(1000, 1000)).toBe(100)
  })

  it('can exceed 100% when actual > list', () => {
    // over-recovery scenario
    expect(computePriceRealization(1200, 1000)).toBe(120)
  })

  it('returns 0% when actual revenue is 0', () => {
    expect(computePriceRealization(0, 1000)).toBe(0)
  })
})

// ── computePriceVariance ──────────────────────────────────────────────────────

describe('computePriceVariance', () => {
  it('computes positive variance when price increased', () => {
    // current=110, prior=100 → +10%
    expect(computePriceVariance(110, 100)).toBe(10)
  })

  it('computes negative variance when price decreased', () => {
    // current=90, prior=100 → -10%
    expect(computePriceVariance(90, 100)).toBe(-10)
  })

  it('returns 0 when prices are equal', () => {
    expect(computePriceVariance(100, 100)).toBe(0)
  })

  it('returns null when priorAvgPrice is 0', () => {
    expect(computePriceVariance(100, 0)).toBeNull()
  })

  it('handles large price increases', () => {
    // current=200, prior=100 → +100%
    expect(computePriceVariance(200, 100)).toBe(100)
  })

  it('handles fractional prices', () => {
    // current=52.50, prior=50 → +5%
    expect(computePriceVariance(52.5, 50)).toBeCloseTo(5)
  })
})

// ── classifyPricingPressure ───────────────────────────────────────────────────

describe('classifyPricingPressure', () => {
  it('returns insufficient_data when both inputs are null', () => {
    expect(classifyPricingPressure(null, null)).toBe('insufficient_data')
  })

  it('returns under_pressure when discount >= 25 and price variance <= -5', () => {
    expect(classifyPricingPressure(-10, 30)).toBe('under_pressure')
  })

  it('returns under_pressure when discount >= 25 and priceVariance is null', () => {
    expect(classifyPricingPressure(null, 25)).toBe('under_pressure')
  })

  it('returns under_pressure at exact boundary: discount=25, variance=-5', () => {
    expect(classifyPricingPressure(-5, 25)).toBe('under_pressure')
  })

  it('does NOT return under_pressure when discount < 25 even with bad variance', () => {
    // discount=24 (just under threshold) → should be compressing, not under_pressure
    expect(classifyPricingPressure(-10, 24)).toBe('compressing')
  })

  it('returns compressing when price variance < -5', () => {
    expect(classifyPricingPressure(-6, 5)).toBe('compressing')
  })

  it('returns compressing when discount >= 20', () => {
    expect(classifyPricingPressure(0, 20)).toBe('compressing')
  })

  it('returns expanding when price variance > 5', () => {
    expect(classifyPricingPressure(10, 5)).toBe('expanding')
  })

  it('returns stable when variance is between -5 and 5 and discount < 15', () => {
    expect(classifyPricingPressure(2, 10)).toBe('stable')
  })

  it('returns stable when variance is 0 and no discount data', () => {
    expect(classifyPricingPressure(0, null)).toBe('stable')
  })

  it('returns stable at variance boundaries (exactly -5 and 5)', () => {
    expect(classifyPricingPressure(-5, 5)).toBe('stable')
    expect(classifyPricingPressure(5, 5)).toBe('stable')
  })

  it('returns stable when only priceVariance is provided and it is near zero', () => {
    expect(classifyPricingPressure(1, null)).toBe('stable')
  })
})

// ── computeSkuPricingHealth ───────────────────────────────────────────────────

describe('computeSkuPricingHealth', () => {
  it('returns empty array for empty input', () => {
    expect(computeSkuPricingHealth([])).toEqual([])
  })

  it('computes correct metrics for a single item', () => {
    const items = [{
      product_id:       'p1',
      product_name:     'Ürün A',
      qty_sold:         10,
      revenue:          900,
      list_price_total: 1000,  // list = 100/unit, effective = 90/unit → 10% discount
    }]
    const result = computeSkuPricingHealth(items)
    expect(result).toHaveLength(1)
    expect(result[0].product_id).toBe('p1')
    expect(result[0].effective_price).toBeCloseTo(90)
    expect(result[0].discount_rate_pct).toBeCloseTo(10)
    expect(result[0].price_realization_pct).toBeCloseTo(90)
    expect(result[0].discipline).toBe('moderate')
  })

  it('handles zero-qty item → null effective_price and null discipline', () => {
    const items = [{
      product_id:       'p2',
      product_name:     'Ürün B',
      qty_sold:         0,
      revenue:          0,
      list_price_total: 0,
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].effective_price).toBeNull()
    expect(result[0].discount_rate_pct).toBeNull()
    expect(result[0].discipline).toBeNull()
  })

  it('classifies disciplined item (< 5% discount) correctly', () => {
    const items = [{
      product_id:       'p3',
      product_name:     'Ürün C',
      qty_sold:         100,
      revenue:          9800,
      list_price_total: 10000,  // 2% discount
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].discipline).toBe('disciplined')
  })

  it('classifies aggressive item (15-30% discount) correctly', () => {
    const items = [{
      product_id:       'p4',
      product_name:     'Ürün D',
      qty_sold:         50,
      revenue:          4000,
      list_price_total: 5000,  // 20% discount
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].discount_rate_pct).toBeCloseTo(20)
    expect(result[0].discipline).toBe('aggressive')
  })

  it('classifies distressed item (>= 30% discount) correctly', () => {
    const items = [{
      product_id:       'p5',
      product_name:     'Ürün E',
      qty_sold:         20,
      revenue:          1200,
      list_price_total: 2000,  // 40% discount
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].discount_rate_pct).toBeCloseTo(40)
    expect(result[0].discipline).toBe('distressed')
  })

  it('processes multiple items correctly', () => {
    const items = [
      {
        product_id: 'p1', product_name: 'A', qty_sold: 10,
        revenue: 1000, list_price_total: 1000,   // 0% discount
      },
      {
        product_id: 'p2', product_name: 'B', qty_sold: 10,
        revenue: 700,  list_price_total: 1000,   // 30% discount
      },
    ]
    const result = computeSkuPricingHealth(items)
    expect(result).toHaveLength(2)
    expect(result[0].discipline).toBe('disciplined')
    expect(result[1].discipline).toBe('distressed')
  })

  it('preserves product_id and product_name', () => {
    const items = [{
      product_id: 'abc-123', product_name: 'Test Ürünü',
      qty_sold: 5, revenue: 500, list_price_total: 500,
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].product_id).toBe('abc-123')
    expect(result[0].product_name).toBe('Test Ürünü')
  })

  it('null discipline when list_price_total is 0', () => {
    // list_price_total = 0 → avgListPrice = 0 → computeDiscountRate returns null
    const items = [{
      product_id: 'p6', product_name: 'Ürün F',
      qty_sold: 10, revenue: 500, list_price_total: 0,
    }]
    const result = computeSkuPricingHealth(items)
    expect(result[0].discount_rate_pct).toBeNull()
    expect(result[0].discipline).toBeNull()
  })
})
