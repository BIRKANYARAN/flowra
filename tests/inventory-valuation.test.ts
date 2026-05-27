/**
 * Inventory Valuation Service — pure-math tests.
 *
 * Scope (no DB — all pure function inputs):
 *   • computeLotAge()         — correct days calculation
 *   • computeTurnoverRate()   — annualized formula; returns 0 when avgQty=0
 *   • computeGrossMargin()    — %; returns null when salePrice=0
 *   • computeDaysOfStock()    — returns null when sales30d=0
 *   • isDeadStock()           — true when 0 sales + qty > 0
 *   • isSlowMoving()          — true when < 2
 *   • buildPortfolioSummary() — correct totals, correct fastest/slowest
 *
 * Run with:  npx vitest run tests/inventory-valuation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeLotAge,
  computeTurnoverRate,
  computeGrossMargin,
  computeDaysOfStock,
  isDeadStock,
  isSlowMoving,
  buildPortfolioSummary,
  InventoryValuationService,
  type ProductValuation,
  type StockLotValuation,
} from '../lib/services/inventory/inventory-valuation.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProduct(overrides: Partial<ProductValuation> = {}): ProductValuation {
  return {
    product_id:         overrides.product_id         ?? 'prod-1',
    product_name:       overrides.product_name       ?? 'Test Ürün',
    category:           overrides.category,
    total_qty:          overrides.total_qty          ?? 100,
    total_value:        overrides.total_value        ?? 10_000,
    avg_cost_try:       overrides.avg_cost_try       ?? 100,
    lots:               overrides.lots               ?? [],
    sales_qty_30d:      overrides.sales_qty_30d      ?? 20,
    sales_revenue_30d:  overrides.sales_revenue_30d  ?? 3_000,
    avg_sale_price_try: overrides.avg_sale_price_try ?? 150,
    turnover_rate:      overrides.turnover_rate      ?? 2.4,
    gross_margin_pct:   overrides.gross_margin_pct   ?? 33.3,
    days_of_stock:      overrides.days_of_stock      ?? 150,
    is_dead_stock:      overrides.is_dead_stock      ?? false,
    is_slow_moving:     overrides.is_slow_moving     ?? false,
    dead_stock_value:   overrides.dead_stock_value   ?? 0,
  }
}

// Legacy lot helper for backward-compatible tests
function makeLot(
  overrides: Partial<StockLotValuation> & { age_days: number; lot_value_try?: number; qty_remaining?: number; entry_cost_try?: number },
): StockLotValuation {
  const qty   = overrides.qty_remaining  ?? 10
  const cost  = overrides.entry_cost_try ?? 100
  const value = overrides.lot_value_try  ?? qty * cost
  return {
    lot_id:         overrides.lot_id        ?? 'lot-1',
    product_id:     overrides.product_id    ?? 'prod-1',
    product_name:   overrides.product_name  ?? 'Test Ürün',
    qty_remaining:  qty,
    entry_cost_try: cost,
    lot_value_try:  value,
    entry_date:     overrides.entry_date    ?? '2026-01-01',
    age_days:       overrides.age_days,
    age_bucket:     InventoryValuationService.getAgeBucket(overrides.age_days),
  }
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('computeLotAge', () => {
  it('returns 0 when purchase date equals today', () => {
    expect(computeLotAge('2026-05-27', '2026-05-27')).toBe(0)
  })

  it('returns correct days for a 30-day gap', () => {
    expect(computeLotAge('2026-04-27', '2026-05-27')).toBe(30)
  })

  it('returns correct days crossing a month boundary', () => {
    // Jan 15 → Mar 16 = 31 (Jan remainder) + 28 (Feb) + 16 (Mar) = 60 days in 2026
    expect(computeLotAge('2026-01-15', '2026-03-16')).toBe(60)
  })

  it('returns 0 when purchase date is in the future (clamped)', () => {
    expect(computeLotAge('2026-12-31', '2026-05-27')).toBe(0)
  })

  it('returns correct days for a full year', () => {
    expect(computeLotAge('2025-05-27', '2026-05-27')).toBe(365)
  })
})

describe('computeTurnoverRate', () => {
  it('returns 0 when avgStockQty is 0', () => {
    expect(computeTurnoverRate(100, 0)).toBe(0)
  })

  it('returns correct annualized rate: 20 sales/month, 100 stock = 2.4x', () => {
    expect(computeTurnoverRate(20, 100)).toBeCloseTo(2.4, 5)
  })

  it('returns 12 when selling entire stock in 30d (100% monthly turnover)', () => {
    expect(computeTurnoverRate(100, 100)).toBeCloseTo(12, 5)
  })

  it('returns low rate for very slow-moving product', () => {
    // 1 sale/month, 100 stock = 0.12x per year
    expect(computeTurnoverRate(1, 100)).toBeCloseTo(0.12, 5)
  })

  it('handles fractional quantities correctly', () => {
    expect(computeTurnoverRate(15.5, 50)).toBeCloseTo((15.5 * 12) / 50, 10)
  })
})

describe('computeGrossMargin', () => {
  it('returns null when salePrice is 0', () => {
    expect(computeGrossMargin(0, 50)).toBeNull()
  })

  it('returns null when salePrice is negative', () => {
    expect(computeGrossMargin(-10, 50)).toBeNull()
  })

  it('returns 50% for sale=200, cost=100', () => {
    expect(computeGrossMargin(200, 100)).toBeCloseTo(50, 5)
  })

  it('returns 0% when cost equals sale price (break-even)', () => {
    expect(computeGrossMargin(100, 100)).toBeCloseTo(0, 5)
  })

  it('returns negative margin when cost > sale price', () => {
    expect(computeGrossMargin(80, 100)).toBeCloseTo(-25, 5)
  })

  it('returns ~33.33% for typical retail margin', () => {
    expect(computeGrossMargin(150, 100)).toBeCloseTo(33.33, 1)
  })
})

describe('computeDaysOfStock', () => {
  it('returns null when sales30d is 0', () => {
    expect(computeDaysOfStock(100, 0)).toBeNull()
  })

  it('returns 150 days for 100 qty and 20 sales in 30d', () => {
    // dailySales = 20/30 ≈ 0.667, days = 100 / 0.667 ≈ 150
    expect(computeDaysOfStock(100, 20)).toBeCloseTo(150, 0)
  })

  it('returns 30 days when daily sales exactly match stock', () => {
    // 100 qty, 100 sales/30d → 1 unit/day → 100 days
    expect(computeDaysOfStock(30, 30)).toBeCloseTo(30, 5)
  })

  it('returns fractional days correctly', () => {
    const expected = 50 / (10 / 30)
    expect(computeDaysOfStock(50, 10)).toBeCloseTo(expected, 5)
  })
})

describe('isDeadStock', () => {
  it('returns true when zero sales in 60d and qty > 0', () => {
    expect(isDeadStock(0, 50)).toBe(true)
  })

  it('returns false when there are sales even with remaining stock', () => {
    expect(isDeadStock(5, 50)).toBe(false)
  })

  it('returns false when qty is 0 even with no sales', () => {
    expect(isDeadStock(0, 0)).toBe(false)
  })

  it('returns false when both sales and qty are present', () => {
    expect(isDeadStock(10, 100)).toBe(false)
  })
})

describe('isSlowMoving', () => {
  it('returns true for turnover rate of 1 (below threshold of 2)', () => {
    expect(isSlowMoving(1)).toBe(true)
  })

  it('returns true for turnover rate of 0', () => {
    expect(isSlowMoving(0)).toBe(true)
  })

  it('returns false for turnover rate exactly 2', () => {
    expect(isSlowMoving(2)).toBe(false)
  })

  it('returns false for turnover rate above 2', () => {
    expect(isSlowMoving(3.5)).toBe(false)
  })

  it('returns true for turnover rate just below threshold', () => {
    expect(isSlowMoving(1.99)).toBe(true)
  })
})

describe('buildPortfolioSummary', () => {
  it('returns zeros for empty product array', () => {
    const s = buildPortfolioSummary([])
    expect(s.total_inventory_value).toBe(0)
    expect(s.total_dead_stock_value).toBe(0)
    expect(s.dead_stock_pct).toBe(0)
    expect(s.weighted_avg_turnover).toBe(0)
    expect(s.total_products).toBe(0)
    expect(s.dead_stock_products).toBe(0)
    expect(s.slow_moving_products).toBe(0)
    expect(s.fastest_mover).toBeUndefined()
    expect(s.slowest_mover).toBeUndefined()
  })

  it('computes total_inventory_value correctly', () => {
    const products = [
      makeProduct({ product_id: 'a', total_value: 5_000, sales_qty_30d: 10, turnover_rate: 1.2 }),
      makeProduct({ product_id: 'b', total_value: 3_000, sales_qty_30d: 5,  turnover_rate: 0.6 }),
    ]
    const s = buildPortfolioSummary(products)
    expect(s.total_inventory_value).toBe(8_000)
  })

  it('computes total_dead_stock_value and dead_stock_pct', () => {
    const products = [
      makeProduct({ product_id: 'a', total_value: 4_000, dead_stock_value: 4_000, is_dead_stock: true,  sales_qty_30d: 0, turnover_rate: 0 }),
      makeProduct({ product_id: 'b', total_value: 6_000, dead_stock_value: 0,     is_dead_stock: false, sales_qty_30d: 20, turnover_rate: 4 }),
    ]
    const s = buildPortfolioSummary(products)
    expect(s.total_dead_stock_value).toBe(4_000)
    expect(s.dead_stock_pct).toBeCloseTo(40, 5)
    expect(s.dead_stock_products).toBe(1)
  })

  it('identifies fastest_mover correctly', () => {
    const fast = makeProduct({ product_id: 'fast', total_qty: 100, turnover_rate: 8, sales_qty_30d: 60 })
    const slow = makeProduct({ product_id: 'slow', total_qty: 100, turnover_rate: 1, sales_qty_30d: 8 })
    const s    = buildPortfolioSummary([fast, slow])
    expect(s.fastest_mover?.product_id).toBe('fast')
  })

  it('identifies slowest_mover correctly', () => {
    const fast = makeProduct({ product_id: 'fast', total_qty: 100, turnover_rate: 8, sales_qty_30d: 60 })
    const slow = makeProduct({ product_id: 'slow', total_qty: 100, turnover_rate: 1, sales_qty_30d: 8 })
    const s    = buildPortfolioSummary([fast, slow])
    expect(s.slowest_mover?.product_id).toBe('slow')
  })

  it('counts slow_moving_products (non-dead)', () => {
    const products = [
      makeProduct({ product_id: 'a', is_slow_moving: true,  is_dead_stock: false, total_qty: 50, sales_qty_30d: 3, turnover_rate: 0.72 }),
      makeProduct({ product_id: 'b', is_slow_moving: false, is_dead_stock: false, total_qty: 50, sales_qty_30d: 30, turnover_rate: 7.2 }),
      makeProduct({ product_id: 'c', is_slow_moving: false, is_dead_stock: true,  total_qty: 50, sales_qty_30d: 0, turnover_rate: 0, dead_stock_value: 5_000 }),
    ]
    const s = buildPortfolioSummary(products)
    expect(s.slow_moving_products).toBe(1)
  })

  it('weighted_avg_turnover is value-weighted', () => {
    const products = [
      makeProduct({ product_id: 'a', total_value: 2_000, turnover_rate: 6, sales_qty_30d: 20 }),
      makeProduct({ product_id: 'b', total_value: 8_000, turnover_rate: 1, sales_qty_30d: 8 }),
    ]
    // Weighted: (6×2000 + 1×8000) / (2000+8000) = (12000+8000)/10000 = 2.0
    const s = buildPortfolioSummary(products)
    expect(s.weighted_avg_turnover).toBeCloseTo(2.0, 5)
  })
})

// ── Legacy tests (backward compat) ───────────────────────────────────────────

describe('InventoryValuationService — legacy pure helpers', () => {
  it('getAgeBucket(15) returns current', () => {
    expect(InventoryValuationService.getAgeBucket(15)).toBe('current')
  })

  it('getAgeBucket(45) returns aging_30', () => {
    expect(InventoryValuationService.getAgeBucket(45)).toBe('aging_30')
  })

  it('computeAging sums all buckets to total inventory value', () => {
    const lots: StockLotValuation[] = [
      makeLot({ age_days: 10,  lot_value_try: 1_000 }),
      makeLot({ age_days: 45,  lot_value_try: 2_000 }),
      makeLot({ age_days: 75,  lot_value_try: 3_000 }),
      makeLot({ age_days: 100, lot_value_try: 4_000 }),
    ]
    const aging = InventoryValuationService.computeAging(lots)
    const total = aging.current_try + aging.aging_30_try + aging.aging_60_try + aging.aging_90_plus_try
    expect(total).toBe(10_000)
    expect(aging.current_try).toBe(1_000)
    expect(aging.aging_30_try).toBe(2_000)
    expect(aging.aging_60_try).toBe(3_000)
    expect(aging.aging_90_plus_try).toBe(4_000)
  })
})
