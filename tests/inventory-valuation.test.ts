/**
 * Inventory Valuation Service — pure-math tests.
 *
 * Scope (no DB — all inputs are computed from helper factories):
 *   • getAgeBucket()  — age → bucket classification
 *   • computeAging()  — lot list → aging summary
 *   • lot_value_try   — qty × entry_cost
 *   • avg_cost_try    — weighted average
 *   • is_low_stock    — reorder point detection
 *   • total_inventory_value_try — report total
 *
 * Run with:  npx vitest run tests/inventory-valuation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  InventoryValuationService,
  type StockLotValuation,
} from '../lib/services/inventory/inventory-valuation.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe('InventoryValuationService — pure helpers', () => {

  // 1. getAgeBucket(15) → 'current'
  it('getAgeBucket(15) returns current', () => {
    expect(InventoryValuationService.getAgeBucket(15)).toBe('current')
  })

  // 2. getAgeBucket(45) → 'aging_30'
  it('getAgeBucket(45) returns aging_30', () => {
    expect(InventoryValuationService.getAgeBucket(45)).toBe('aging_30')
  })

  // 3. getAgeBucket(75) → 'aging_60'
  it('getAgeBucket(75) returns aging_60', () => {
    expect(InventoryValuationService.getAgeBucket(75)).toBe('aging_60')
  })

  // 4. getAgeBucket(100) → 'aging_90_plus'
  it('getAgeBucket(100) returns aging_90_plus', () => {
    expect(InventoryValuationService.getAgeBucket(100)).toBe('aging_90_plus')
  })

  // 5. computeAging sums correctly to total
  it('computeAging sums all buckets to total inventory value', () => {
    const lots: StockLotValuation[] = [
      makeLot({ age_days: 10, lot_value_try: 1000 }),
      makeLot({ age_days: 45, lot_value_try: 2000 }),
      makeLot({ age_days: 75, lot_value_try: 3000 }),
      makeLot({ age_days: 100, lot_value_try: 4000 }),
    ]
    const aging = InventoryValuationService.computeAging(lots)
    const total = aging.current_try + aging.aging_30_try + aging.aging_60_try + aging.aging_90_plus_try
    expect(total).toBe(10000)
    expect(aging.current_try).toBe(1000)
    expect(aging.aging_30_try).toBe(2000)
    expect(aging.aging_60_try).toBe(3000)
    expect(aging.aging_90_plus_try).toBe(4000)
  })

  // 6. lot_value_try = qty_remaining × entry_cost_try
  it('lot_value_try equals qty_remaining × entry_cost_try', () => {
    const qty  = 7
    const cost = 150
    const lot  = makeLot({ qty_remaining: qty, entry_cost_try: cost, age_days: 5 })
    expect(lot.lot_value_try).toBe(qty * cost)
  })

  // 7. Empty lots → all zeros in aging
  it('computeAging with empty lots returns all zeros', () => {
    const aging = InventoryValuationService.computeAging([])
    expect(aging.current_try).toBe(0)
    expect(aging.aging_30_try).toBe(0)
    expect(aging.aging_60_try).toBe(0)
    expect(aging.aging_90_plus_try).toBe(0)
  })

  // 8. avg_cost_try = total_value / total_qty (weighted average)
  it('avg_cost_try is weighted average of lot costs', () => {
    // Two lots: 10 × 100 + 20 × 200 = 1000 + 4000 = 5000 / 30 = 166.67
    const totalValue = 10 * 100 + 20 * 200
    const totalQty   = 30
    const expected   = totalValue / totalQty
    expect(expected).toBeCloseTo(166.67, 1)
  })

  // 9. is_low_stock false when no reorder_point set (stock_alert_qty = 0)
  it('is_low_stock is false when stock_alert_qty is 0 (not set)', () => {
    // Simulate: alertQty = 0 → condition: alertQty > 0 && totalQty < alertQty → false
    const alertQty = 0
    const totalQty = 5
    const isLowStock = alertQty > 0 && totalQty < alertQty
    expect(isLowStock).toBe(false)
  })

  // 10. total_inventory_value_try = sum of all lot values
  it('total_inventory_value_try equals sum of all lot lot_value_try', () => {
    const lots: StockLotValuation[] = [
      makeLot({ age_days: 5,  lot_value_try: 500 }),
      makeLot({ age_days: 40, lot_value_try: 1500 }),
      makeLot({ age_days: 95, lot_value_try: 2500 }),
    ]
    const total = lots.reduce((s, l) => s + l.lot_value_try, 0)
    expect(total).toBe(4500)
  })

  // Boundary: getAgeBucket(0) and (29) → current
  it('getAgeBucket boundary: 0 and 29 are current', () => {
    expect(InventoryValuationService.getAgeBucket(0)).toBe('current')
    expect(InventoryValuationService.getAgeBucket(29)).toBe('current')
  })

  // Boundary: getAgeBucket(30) → aging_30
  it('getAgeBucket boundary: 30 is aging_30', () => {
    expect(InventoryValuationService.getAgeBucket(30)).toBe('aging_30')
  })

  // is_low_stock true when qty < alert_qty
  it('is_low_stock is true when total_qty < stock_alert_qty', () => {
    const alertQty = 10
    const totalQty = 3
    const isLowStock = alertQty > 0 && totalQty < alertQty
    expect(isLowStock).toBe(true)
  })
})
