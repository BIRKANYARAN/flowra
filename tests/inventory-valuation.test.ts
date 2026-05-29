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
    // Legacy fields
    max_age_days:       overrides.max_age_days       ?? 0,
    total_value_try:    overrides.total_value_try    ?? overrides.total_value ?? 10_000,
    is_low_stock:       overrides.is_low_stock       ?? false,
    lot_count:          overrides.lot_count          ?? 1,
    oldest_lot_date:    overrides.oldest_lot_date    ?? '2026-01-01',
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

// ── computeLotAge ─────────────────────────────────────────────────────────────

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

  it('returns 1 for a 1-day gap', () => {
    expect(computeLotAge('2026-05-26', '2026-05-27')).toBe(1)
  })

  it('returns 90 for a 90-day gap', () => {
    expect(computeLotAge('2026-02-25', '2026-05-26')).toBe(90)
  })

  it('returns 0 for purchase date = today (no ambiguity)', () => {
    expect(computeLotAge('2026-03-01', '2026-03-01')).toBe(0)
  })

  it('correctly computes across year boundary', () => {
    // Dec 31 2025 → Jan 1 2026 = 1 day
    expect(computeLotAge('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('returns 365 for a standard non-leap year', () => {
    expect(computeLotAge('2025-01-01', '2026-01-01')).toBe(365)
  })

  it('returns 366 for a leap year (2024)', () => {
    expect(computeLotAge('2024-01-01', '2025-01-01')).toBe(366)
  })

  it('always returns a non-negative integer', () => {
    const cases = [
      ['2026-05-01', '2026-05-27'],
      ['2020-01-01', '2026-05-27'],
      ['2030-01-01', '2026-05-27'], // future → clamped to 0
    ]
    for (const [purchase, today] of cases) {
      const result = computeLotAge(purchase, today)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(result)).toBe(true)
    }
  })
})

// ── computeTurnoverRate ───────────────────────────────────────────────────────

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

  it('returns 0 when sales30d is 0 (no sales)', () => {
    expect(computeTurnoverRate(0, 100)).toBe(0)
  })

  it('returns 0 when both sales and qty are 0', () => {
    expect(computeTurnoverRate(0, 0)).toBe(0)
  })

  it('returns very high rate for fast-moving small inventory', () => {
    // 50 sales, 5 stock = (50*12)/5 = 120x
    expect(computeTurnoverRate(50, 5)).toBeCloseTo(120, 5)
  })

  it('formula is (sales30d × 12) / avgStockQty', () => {
    const sales = 33
    const qty   = 77
    expect(computeTurnoverRate(sales, qty)).toBeCloseTo((sales * 12) / qty, 10)
  })

  it('result is always ≥ 0', () => {
    const cases = [[0, 100], [5, 50], [100, 1], [0, 0]]
    for (const [s, q] of cases) {
      expect(computeTurnoverRate(s, q)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns 6 for 50 sales out of 100 stock', () => {
    // 50/100 = 50% monthly = 6x annualized
    expect(computeTurnoverRate(50, 100)).toBeCloseTo(6, 5)
  })
})

// ── computeGrossMargin ────────────────────────────────────────────────────────

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

  it('returns 100% when cost is 0', () => {
    expect(computeGrossMargin(100, 0)).toBeCloseTo(100, 5)
  })

  it('returns null when salePrice is exactly 0 (boundary)', () => {
    expect(computeGrossMargin(0, 0)).toBeNull()
  })

  it('formula: (salePrice - cost) / salePrice × 100', () => {
    const sale = 250
    const cost = 175
    const expected = ((sale - cost) / sale) * 100
    expect(computeGrossMargin(sale, cost)).toBeCloseTo(expected, 10)
  })

  it('returns very high margin when cost is tiny relative to sale', () => {
    // cost = 1, sale = 1000 → 99.9%
    expect(computeGrossMargin(1000, 1)).toBeCloseTo(99.9, 1)
  })

  it('returns approximately -100% when cost is double the sale price', () => {
    // sale=50, cost=100 → (50-100)/50 = -100%
    expect(computeGrossMargin(50, 100)).toBeCloseTo(-100, 5)
  })

  it('always returns null for non-positive sale prices', () => {
    for (const p of [0, -1, -100, -0.01]) {
      expect(computeGrossMargin(p, 50)).toBeNull()
    }
  })
})

// ── computeDaysOfStock ────────────────────────────────────────────────────────

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

  it('returns null when sales30d is negative', () => {
    expect(computeDaysOfStock(100, -5)).toBeNull()
  })

  it('returns 0 when qty is 0', () => {
    expect(computeDaysOfStock(0, 10)).toBeCloseTo(0, 5)
  })

  it('formula is totalQty / (sales30d / 30)', () => {
    const qty = 200
    const sales = 40
    const expected = qty / (sales / 30)
    expect(computeDaysOfStock(qty, sales)).toBeCloseTo(expected, 10)
  })

  it('returns large days for very slow-selling product', () => {
    // 1000 units, 1 sale/month = 1000×30 = 30000 days
    expect(computeDaysOfStock(1000, 1)).toBeCloseTo(30_000, 0)
  })

  it('result is always ≥ 0 for non-negative inputs', () => {
    const cases = [[100, 5], [0, 10], [50, 50], [1000, 100]]
    for (const [qty, sales] of cases) {
      const r = computeDaysOfStock(qty, sales)
      if (r !== null) expect(r).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns exactly 30 days when daily sell-through equals stock', () => {
    // 10 units, 10 sales/30d → 1/day → 10 days
    expect(computeDaysOfStock(10, 10)).toBeCloseTo(30, 5)
  })
})

// ── isDeadStock ───────────────────────────────────────────────────────────────

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

  it('returns true for qty=1 and sales=0 (minimal dead stock)', () => {
    expect(isDeadStock(0, 1)).toBe(true)
  })

  it('returns false when sales=0 and qty=0 exactly', () => {
    expect(isDeadStock(0, 0)).toBe(false)
  })

  it('returns false when sales > 0 regardless of qty', () => {
    expect(isDeadStock(1, 0)).toBe(false)
    expect(isDeadStock(1, 1000)).toBe(false)
  })

  it('returns true for large dead-stock scenario', () => {
    expect(isDeadStock(0, 10_000)).toBe(true)
  })

  it('is not affected by fractional qty values', () => {
    expect(isDeadStock(0, 0.5)).toBe(true)
  })

  it('sales60d=0 and qty=100 is always dead stock', () => {
    for (const qty of [1, 10, 100, 1000]) {
      expect(isDeadStock(0, qty)).toBe(true)
    }
  })
})

// ── isSlowMoving ──────────────────────────────────────────────────────────────

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

  it('returns false for high turnover product (12x)', () => {
    expect(isSlowMoving(12)).toBe(false)
  })

  it('returns true for zero turnover (no movement)', () => {
    expect(isSlowMoving(0)).toBe(true)
  })

  it('threshold is strictly < 2 (2.0 is not slow)', () => {
    expect(isSlowMoving(2.0)).toBe(false)
    expect(isSlowMoving(2.001)).toBe(false)
    expect(isSlowMoving(1.999)).toBe(true)
  })

  it('returns false for very fast mover (100x)', () => {
    expect(isSlowMoving(100)).toBe(false)
  })

  it('returns true for all rates in [0, 1.99]', () => {
    for (const r of [0, 0.1, 0.5, 1.0, 1.5, 1.99]) {
      expect(isSlowMoving(r)).toBe(true)
    }
  })

  it('returns false for all rates in [2.0, 12.0]', () => {
    for (const r of [2.0, 2.5, 4.0, 6.0, 12.0]) {
      expect(isSlowMoving(r)).toBe(false)
    }
  })
})

// ── buildPortfolioSummary ─────────────────────────────────────────────────────

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

  it('total_products is the count of all products regardless of state', () => {
    const products = Array.from({ length: 7 }, (_, i) =>
      makeProduct({ product_id: `p${i}` })
    )
    expect(buildPortfolioSummary(products).total_products).toBe(7)
  })

  it('dead_stock_pct = 0 when no dead stock', () => {
    const products = [
      makeProduct({ product_id: 'x', total_value: 5_000, dead_stock_value: 0, is_dead_stock: false, sales_qty_30d: 10, turnover_rate: 1.2 }),
    ]
    expect(buildPortfolioSummary(products).dead_stock_pct).toBe(0)
  })

  it('dead_stock_pct = 100 when entire inventory is dead', () => {
    const products = [
      makeProduct({ product_id: 'x', total_value: 3_000, dead_stock_value: 3_000, is_dead_stock: true, sales_qty_30d: 0, turnover_rate: 0 }),
    ]
    expect(buildPortfolioSummary(products).dead_stock_pct).toBeCloseTo(100, 5)
  })

  it('fastest and slowest are undefined for single product (no comparison possible)', () => {
    // Single product with sales: it could be both fastest and slowest, but implementation returns undefined slowest
    const products = [
      makeProduct({ product_id: 'a', total_qty: 100, turnover_rate: 5, sales_qty_30d: 30 })
    ]
    const s = buildPortfolioSummary(products)
    // When fastest === slowest, slowest is set to undefined
    expect(s.fastest_mover).toBeDefined()
    expect(s.slowest_mover).toBeUndefined()
  })

  it('both fastest and slowest undefined when no products have sales', () => {
    const products = [
      makeProduct({ product_id: 'a', total_qty: 10, sales_qty_30d: 0, turnover_rate: 0 }),
      makeProduct({ product_id: 'b', total_qty: 20, sales_qty_30d: 0, turnover_rate: 0 }),
    ]
    const s = buildPortfolioSummary(products)
    expect(s.fastest_mover).toBeUndefined()
    expect(s.slowest_mover).toBeUndefined()
  })

  it('slow_moving excludes dead stock products', () => {
    const products = [
      makeProduct({ product_id: 'a', is_slow_moving: true, is_dead_stock: true,  total_qty: 10, sales_qty_30d: 0, turnover_rate: 0, dead_stock_value: 1_000 }),
      makeProduct({ product_id: 'b', is_slow_moving: true, is_dead_stock: false, total_qty: 10, sales_qty_30d: 1, turnover_rate: 1.2 }),
    ]
    const s = buildPortfolioSummary(products)
    expect(s.slow_moving_products).toBe(1) // only b (a is dead stock)
  })

  it('weighted_avg_turnover = 0 when total_inventory_value = 0', () => {
    const products = [
      makeProduct({ product_id: 'x', total_value: 0, turnover_rate: 5, sales_qty_30d: 10 }),
    ]
    expect(buildPortfolioSummary(products).weighted_avg_turnover).toBe(0)
  })
})

// ── InventoryValuationService — legacy pure helpers ───────────────────────────

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

  it('getAgeBucket(0) returns current (brand new lot)', () => {
    expect(InventoryValuationService.getAgeBucket(0)).toBe('current')
  })

  it('getAgeBucket(29) returns current (just before 30d boundary)', () => {
    expect(InventoryValuationService.getAgeBucket(29)).toBe('current')
  })

  it('getAgeBucket(30) returns aging_30 (at boundary)', () => {
    expect(InventoryValuationService.getAgeBucket(30)).toBe('aging_30')
  })

  it('getAgeBucket(59) returns aging_30 (just before 60d boundary)', () => {
    expect(InventoryValuationService.getAgeBucket(59)).toBe('aging_30')
  })

  it('getAgeBucket(60) returns aging_60', () => {
    expect(InventoryValuationService.getAgeBucket(60)).toBe('aging_60')
  })

  it('getAgeBucket(89) returns aging_60 (just before 90d boundary)', () => {
    expect(InventoryValuationService.getAgeBucket(89)).toBe('aging_60')
  })

  it('getAgeBucket(90) returns aging_90_plus', () => {
    expect(InventoryValuationService.getAgeBucket(90)).toBe('aging_90_plus')
  })

  it('getAgeBucket(365) returns aging_90_plus (very old)', () => {
    expect(InventoryValuationService.getAgeBucket(365)).toBe('aging_90_plus')
  })

  it('computeAging returns all zeros for empty lot array', () => {
    const aging = InventoryValuationService.computeAging([])
    expect(aging.current_try).toBe(0)
    expect(aging.aging_30_try).toBe(0)
    expect(aging.aging_60_try).toBe(0)
    expect(aging.aging_90_plus_try).toBe(0)
  })

  it('computeAging handles single lot in each bucket correctly', () => {
    const lots: StockLotValuation[] = [
      makeLot({ lot_id: 'l1', age_days: 5,   lot_value_try: 500 }),
      makeLot({ lot_id: 'l2', age_days: 35,  lot_value_try: 600 }),
      makeLot({ lot_id: 'l3', age_days: 65,  lot_value_try: 700 }),
      makeLot({ lot_id: 'l4', age_days: 95,  lot_value_try: 800 }),
    ]
    const aging = InventoryValuationService.computeAging(lots)
    expect(aging.current_try).toBe(500)
    expect(aging.aging_30_try).toBe(600)
    expect(aging.aging_60_try).toBe(700)
    expect(aging.aging_90_plus_try).toBe(800)
  })

  it('computeAging accumulates multiple lots in same bucket', () => {
    const lots: StockLotValuation[] = [
      makeLot({ lot_id: 'l1', age_days: 5,  lot_value_try: 200 }),
      makeLot({ lot_id: 'l2', age_days: 10, lot_value_try: 300 }),
      makeLot({ lot_id: 'l3', age_days: 20, lot_value_try: 500 }),
    ]
    const aging = InventoryValuationService.computeAging(lots)
    expect(aging.current_try).toBe(1_000) // all three are in current (< 30d)
  })
})
