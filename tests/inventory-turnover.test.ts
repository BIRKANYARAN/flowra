// ─────────────────────────────────────────────────────────────────────────────
// tests/inventory-turnover.test.ts
//
// Unit tests for pure helper functions in inventory-turnover.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeInventoryTurnover,
  computeDaysInventoryOutstanding,
  classifyTurnoverHealth,
  computeShrinkageRate,
  classifyShrinkageLevel,
  computeDeadStockValue,
  computeReorderAlert,
  computeInventoryValueAccuracy,
} from '../lib/services/inventory/inventory-turnover.service'

// ── computeInventoryTurnover ──────────────────────────────────────────────────

describe('computeInventoryTurnover', () => {
  it('returns correct ratio for normal inputs', () => {
    expect(computeInventoryTurnover(120_000, 20_000)).toBeCloseTo(6, 5)
  })

  it('returns null when avgInventoryValue is 0', () => {
    expect(computeInventoryTurnover(50_000, 0)).toBeNull()
  })

  it('returns 0 when COGS is 0 and inventory > 0', () => {
    expect(computeInventoryTurnover(0, 10_000)).toBeCloseTo(0, 5)
  })

  it('computes fractional ratio correctly', () => {
    // 15_000 / 5_000 = 3.0
    expect(computeInventoryTurnover(15_000, 5_000)).toBeCloseTo(3.0, 5)
  })
})

// ── computeDaysInventoryOutstanding ──────────────────────────────────────────

describe('computeDaysInventoryOutstanding', () => {
  it('returns 365 / ratio for normal turnover', () => {
    // ratio = 6 → 365 / 6 ≈ 60.83
    expect(computeDaysInventoryOutstanding(6)).toBeCloseTo(60.833, 2)
  })

  it('returns null when turnoverRatio is null', () => {
    expect(computeDaysInventoryOutstanding(null)).toBeNull()
  })

  it('returns null when turnoverRatio is 0', () => {
    expect(computeDaysInventoryOutstanding(0)).toBeNull()
  })

  it('returns 365 for turnover ratio of 1', () => {
    expect(computeDaysInventoryOutstanding(1)).toBeCloseTo(365, 3)
  })

  it('returns 73 for turnover ratio of 5', () => {
    expect(computeDaysInventoryOutstanding(5)).toBeCloseTo(73, 1)
  })
})

// ── classifyTurnoverHealth ────────────────────────────────────────────────────

describe('classifyTurnoverHealth', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyTurnoverHealth(null)).toBe('insufficient_data')
  })

  it('returns excellent for ratio >= 12 (2 × default benchmark)', () => {
    expect(classifyTurnoverHealth(12)).toBe('excellent')
  })

  it('returns excellent for ratio > 12', () => {
    expect(classifyTurnoverHealth(15)).toBe('excellent')
  })

  it('returns good for ratio exactly 6.0 (benchmark)', () => {
    expect(classifyTurnoverHealth(6.0)).toBe('good')
  })

  it('returns good for ratio between 6 and 12', () => {
    expect(classifyTurnoverHealth(9)).toBe('good')
  })

  it('returns adequate for ratio exactly 3.0 (0.5 × benchmark)', () => {
    expect(classifyTurnoverHealth(3.0)).toBe('adequate')
  })

  it('returns adequate for ratio between 3 and 6', () => {
    expect(classifyTurnoverHealth(4.5)).toBe('adequate')
  })

  it('returns slow for ratio exactly 1.5 (0.25 × benchmark)', () => {
    expect(classifyTurnoverHealth(1.5)).toBe('slow')
  })

  it('returns slow for ratio between 1.5 and 3', () => {
    expect(classifyTurnoverHealth(2.0)).toBe('slow')
  })

  it('returns stagnant for ratio below 1.5', () => {
    expect(classifyTurnoverHealth(1.0)).toBe('stagnant')
  })

  it('returns stagnant for ratio of 0', () => {
    expect(classifyTurnoverHealth(0)).toBe('stagnant')
  })

  it('uses custom benchmark correctly — excellent at 2× custom', () => {
    // benchmark = 4 → excellent at >= 8
    expect(classifyTurnoverHealth(8, 4)).toBe('excellent')
  })

  it('uses custom benchmark correctly — good at benchmark value', () => {
    expect(classifyTurnoverHealth(4, 4)).toBe('good')
  })

  it('uses custom benchmark correctly — adequate at 0.5× benchmark', () => {
    expect(classifyTurnoverHealth(2, 4)).toBe('adequate')
  })
})

// ── computeShrinkageRate ──────────────────────────────────────────────────────

describe('computeShrinkageRate', () => {
  it('computes shrinkage rate for normal inputs', () => {
    // opening=100, purchases=50, sales=30 → expected=120
    // closing=114 → shrinkage=6 → rate = 6/120 × 100 = 5%
    expect(computeShrinkageRate(100, 50, 30, 114)).toBeCloseTo(5, 5)
  })

  it('returns null when expected closing stock is 0', () => {
    // opening=0, purchases=0, sales=0 → expected=0
    expect(computeShrinkageRate(0, 0, 0, 0)).toBeNull()
  })

  it('returns 0 when physical count matches expected', () => {
    // opening=100, purchases=20, sales=30 → expected=90 → closing=90 → shrinkage=0
    expect(computeShrinkageRate(100, 20, 30, 90)).toBeCloseTo(0, 5)
  })

  it('returns negative value for over-count (closing > expected)', () => {
    // opening=50, purchases=10, sales=20 → expected=40 → closing=45 → shrinkage=-5
    // rate = -5/40 × 100 = -12.5%
    expect(computeShrinkageRate(50, 10, 20, 45)).toBeCloseTo(-12.5, 5)
  })

  it('handles exact boundary — expected equals positive opening only', () => {
    // opening=100, purchases=0, sales=0 → expected=100, closing=97 → rate=3%
    expect(computeShrinkageRate(100, 0, 0, 97)).toBeCloseTo(3, 5)
  })
})

// ── classifyShrinkageLevel ────────────────────────────────────────────────────

describe('classifyShrinkageLevel', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyShrinkageLevel(null)).toBe('insufficient_data')
  })

  it('returns none for 0% shrinkage', () => {
    expect(classifyShrinkageLevel(0)).toBe('none')
  })

  it('returns none for negative shrinkage (over-count)', () => {
    expect(classifyShrinkageLevel(-5)).toBe('none')
  })

  it('returns acceptable for 0.5% shrinkage', () => {
    expect(classifyShrinkageLevel(0.5)).toBe('acceptable')
  })

  it('returns acceptable for exactly 1% (boundary)', () => {
    expect(classifyShrinkageLevel(1)).toBe('acceptable')
  })

  it('returns elevated for 1.001% (just above boundary)', () => {
    expect(classifyShrinkageLevel(1.001)).toBe('elevated')
  })

  it('returns elevated for 2% shrinkage', () => {
    expect(classifyShrinkageLevel(2)).toBe('elevated')
  })

  it('returns elevated for exactly 3% (boundary)', () => {
    expect(classifyShrinkageLevel(3)).toBe('elevated')
  })

  it('returns critical for 3.001% (just above 3% boundary)', () => {
    expect(classifyShrinkageLevel(3.001)).toBe('critical')
  })

  it('returns critical for 10% shrinkage', () => {
    expect(classifyShrinkageLevel(10)).toBe('critical')
  })
})

// ── computeDeadStockValue ─────────────────────────────────────────────────────

describe('computeDeadStockValue', () => {
  it('returns all zeros for empty items array', () => {
    const result = computeDeadStockValue([])
    expect(result.dead_stock_count).toBe(0)
    expect(result.dead_stock_value).toBe(0)
    expect(result.dead_stock_pct_of_total).toBe(0)
    expect(result.items).toHaveLength(0)
  })

  it('marks never-sold items (null last_sale_date) as dead', () => {
    const result = computeDeadStockValue([
      { product_id: 'p1', last_sale_date: null, stock_value: 5000, qty_on_hand: 10 },
    ])
    expect(result.dead_stock_count).toBe(1)
    expect(result.dead_stock_value).toBe(5000)
    expect(result.items[0].is_dead).toBe(true)
    expect(result.items[0].days_since_sale).toBeNull()
  })

  it('marks items with last sale >= 90 days ago as dead', () => {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 95)
    const dateStr = ninetyDaysAgo.toISOString().slice(0, 10)

    const result = computeDeadStockValue([
      { product_id: 'p2', last_sale_date: dateStr, stock_value: 3000, qty_on_hand: 5 },
    ])
    expect(result.items[0].is_dead).toBe(true)
  })

  it('does NOT mark items sold within 90 days as dead', () => {
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 30)
    const dateStr = recentDate.toISOString().slice(0, 10)

    const result = computeDeadStockValue([
      { product_id: 'p3', last_sale_date: dateStr, stock_value: 2000, qty_on_hand: 4 },
    ])
    expect(result.items[0].is_dead).toBe(false)
  })

  it('computes dead_stock_pct_of_total correctly with multiple items', () => {
    const oldDate    = '2000-01-01'
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 10)
    const recent = recentDate.toISOString().slice(0, 10)

    const result = computeDeadStockValue([
      { product_id: 'p1', last_sale_date: oldDate,  stock_value: 4000, qty_on_hand: 8 },
      { product_id: 'p2', last_sale_date: recent,   stock_value: 6000, qty_on_hand: 12 },
    ])
    // total = 10_000, dead = 4_000 → 40%
    expect(result.dead_stock_count).toBe(1)
    expect(result.dead_stock_value).toBe(4000)
    expect(result.dead_stock_pct_of_total).toBeCloseTo(40, 3)
  })

  it('respects custom deadStockDays threshold', () => {
    const fortyfiveDaysAgo = new Date()
    fortyfiveDaysAgo.setDate(fortyfiveDaysAgo.getDate() - 45)
    const dateStr = fortyfiveDaysAgo.toISOString().slice(0, 10)

    // default 90d: NOT dead
    const result90 = computeDeadStockValue(
      [{ product_id: 'px', last_sale_date: dateStr, stock_value: 1000, qty_on_hand: 2 }],
      90,
    )
    expect(result90.items[0].is_dead).toBe(false)

    // custom 30d: dead
    const result30 = computeDeadStockValue(
      [{ product_id: 'px', last_sale_date: dateStr, stock_value: 1000, qty_on_hand: 2 }],
      30,
    )
    expect(result30.items[0].is_dead).toBe(true)
  })

  it('returns 0 pct when total inventory value is 0 (avoid divide by zero)', () => {
    const result = computeDeadStockValue([
      { product_id: 'p1', last_sale_date: null, stock_value: 0, qty_on_hand: 5 },
    ])
    expect(result.dead_stock_pct_of_total).toBe(0)
  })
})

// ── computeReorderAlert ───────────────────────────────────────────────────────

describe('computeReorderAlert', () => {
  it('returns critical when currentQty < safetyStock', () => {
    expect(computeReorderAlert(5, 20, 10)).toBe('critical')
  })

  it('returns reorder_now when currentQty < safetyStock is false but <= reorderPoint', () => {
    // safetyStock=10, reorderPoint=20, currentQty=15 → 15 >= 10 (not critical), 15 <= 20
    expect(computeReorderAlert(15, 20, 10)).toBe('reorder_now')
  })

  it('returns reorder_now when currentQty equals reorderPoint', () => {
    expect(computeReorderAlert(20, 20, 10)).toBe('reorder_now')
  })

  it('returns watch when currentQty <= reorderPoint × 1.5', () => {
    // reorderPoint=20 → 1.5× = 30 → currentQty=25
    expect(computeReorderAlert(25, 20, 10)).toBe('watch')
  })

  it('returns watch at boundary reorderPoint × 1.5', () => {
    expect(computeReorderAlert(30, 20, 10)).toBe('watch')
  })

  it('returns healthy when currentQty > reorderPoint × 1.5', () => {
    expect(computeReorderAlert(50, 20, 10)).toBe('healthy')
  })

  it('returns healthy when all thresholds are 0 and qty is positive', () => {
    expect(computeReorderAlert(1, 0, 0)).toBe('healthy')
  })
})

// ── computeInventoryValueAccuracy ─────────────────────────────────────────────

describe('computeInventoryValueAccuracy', () => {
  it('returns 100 when book equals market value', () => {
    expect(computeInventoryValueAccuracy(50_000, 50_000)).toBeCloseTo(100, 5)
  })

  it('returns null when marketValue is 0', () => {
    expect(computeInventoryValueAccuracy(10_000, 0)).toBeNull()
  })

  it('returns value > 100 when book exceeds market (overvalued)', () => {
    // book=120_000, market=100_000 → 120%
    expect(computeInventoryValueAccuracy(120_000, 100_000)).toBeCloseTo(120, 5)
  })

  it('returns value < 100 when book is below market (undervalued)', () => {
    // book=80_000, market=100_000 → 80%
    expect(computeInventoryValueAccuracy(80_000, 100_000)).toBeCloseTo(80, 5)
  })

  it('returns 0 when bookValue is 0', () => {
    expect(computeInventoryValueAccuracy(0, 100_000)).toBeCloseTo(0, 5)
  })

  it('handles fractional result correctly', () => {
    // book=1_000, market=3_000 → 33.33…%
    expect(computeInventoryValueAccuracy(1_000, 3_000)).toBeCloseTo(33.333, 2)
  })
})
