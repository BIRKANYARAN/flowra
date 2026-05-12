/**
 * FAZ 17 — Ürün Yönetimi: business-logic unit tests
 *
 * Tests the pure analytics functions in products/page.tsx:
 *   1. computeLotCosts()   — weighted average cost per product from active lots
 *   2. lowStockCount()     — products at or below their alert threshold
 *   3. totalActiveLots()   — sum of lotCount across all LotCostEntry values
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/product-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from products/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface LotRow {
  product_id:    string
  unit_cost:     number
  qty_remaining: number
  cost_currency: string
}

interface LotCostEntry {
  avgCost:  number
  lotCount: number
  currency: string
}

function computeLotCosts(lots: LotRow[]): Record<string, LotCostEntry> {
  const raw: Record<string, { totalCost: number; totalQty: number; lotCount: number; currency: string }> = {}
  for (const lot of lots) {
    const pid = lot.product_id
    const uc  = Number(lot.unit_cost)     || 0
    const qr  = Number(lot.qty_remaining) || 0
    if (!raw[pid]) raw[pid] = { totalCost: 0, totalQty: 0, lotCount: 0, currency: lot.cost_currency || 'TRY' }
    raw[pid].totalCost += uc * qr
    raw[pid].totalQty  += qr
    raw[pid].lotCount  += 1
  }
  const result: Record<string, LotCostEntry> = {}
  for (const [pid, c] of Object.entries(raw)) {
    result[pid] = {
      avgCost:  c.totalQty > 0 ? Math.round((c.totalCost / c.totalQty) * 100) / 100 : 0,
      lotCount: c.lotCount,
      currency: c.currency,
    }
  }
  return result
}

interface ProductStub {
  stock_qty:       number | string
  stock_alert_qty: number | string
}

function lowStockCount(products: ProductStub[]): number {
  return products.filter(p =>
    Number(p.stock_alert_qty) > 0 &&
    Number(p.stock_qty) <= Number(p.stock_alert_qty)
  ).length
}

function totalActiveLots(lotCosts: Record<string, LotCostEntry>): number {
  return Object.values(lotCosts).reduce((sum, e) => sum + e.lotCount, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeLotCosts
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLotCosts()', () => {
  it('returns empty object for no lots', () => {
    expect(computeLotCosts([])).toEqual({})
  })

  it('computes weighted average cost for a single lot', () => {
    const lots = [{ product_id: 'p1', unit_cost: 10, qty_remaining: 5, cost_currency: 'TRY' }]
    const result = computeLotCosts(lots)
    expect(result['p1'].avgCost).toBe(10)
    expect(result['p1'].lotCount).toBe(1)
    expect(result['p1'].currency).toBe('TRY')
  })

  it('computes weighted average for two lots of the same product', () => {
    // lot A: 10 units × cost 20 = 200
    // lot B: 10 units × cost 40 = 400
    // weighted avg = (200+400) / 20 = 30
    const lots = [
      { product_id: 'p1', unit_cost: 20, qty_remaining: 10, cost_currency: 'USD' },
      { product_id: 'p1', unit_cost: 40, qty_remaining: 10, cost_currency: 'USD' },
    ]
    const result = computeLotCosts(lots)
    expect(result['p1'].avgCost).toBe(30)
    expect(result['p1'].lotCount).toBe(2)
  })

  it('handles multiple products independently', () => {
    const lots = [
      { product_id: 'p1', unit_cost: 100, qty_remaining: 5,  cost_currency: 'TRY' },
      { product_id: 'p2', unit_cost: 50,  qty_remaining: 10, cost_currency: 'EUR' },
    ]
    const result = computeLotCosts(lots)
    expect(result['p1'].avgCost).toBe(100)
    expect(result['p2'].avgCost).toBe(50)
    expect(result['p2'].currency).toBe('EUR')
  })

  it('rounds to 2 decimal places', () => {
    // 1 unit × 10 + 2 units × 11 = 32 total cost / 3 qty = 10.666… → 10.67
    const lots = [
      { product_id: 'p1', unit_cost: 10, qty_remaining: 1, cost_currency: 'TRY' },
      { product_id: 'p1', unit_cost: 11, qty_remaining: 2, cost_currency: 'TRY' },
    ]
    const result = computeLotCosts(lots)
    expect(result['p1'].avgCost).toBe(10.67)
  })

  it('uses TRY as default currency when cost_currency is missing', () => {
    const lots = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { product_id: 'p1', unit_cost: 5, qty_remaining: 2, cost_currency: '' as any },
    ]
    const result = computeLotCosts(lots)
    expect(result['p1'].currency).toBe('TRY')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. lowStockCount
// ─────────────────────────────────────────────────────────────────────────────

describe('lowStockCount()', () => {
  it('returns 0 for empty products', () => {
    expect(lowStockCount([])).toBe(0)
  })

  it('counts products at or below alert threshold', () => {
    const products = [
      { stock_qty: 5,  stock_alert_qty: 10 },  // below → count
      { stock_qty: 10, stock_alert_qty: 10 },  // equal → count
      { stock_qty: 11, stock_alert_qty: 10 },  // above → skip
      { stock_qty: 0,  stock_alert_qty: 5  },  // zero stock → count
    ]
    expect(lowStockCount(products)).toBe(3)
  })

  it('excludes products with no alert threshold (alert_qty = 0)', () => {
    const products = [
      { stock_qty: 0, stock_alert_qty: 0 },   // no threshold — skip
      { stock_qty: 2, stock_alert_qty: 0 },   // no threshold — skip
    ]
    expect(lowStockCount(products)).toBe(0)
  })

  it('returns 0 when all products have sufficient stock', () => {
    const products = [
      { stock_qty: 100, stock_alert_qty: 10 },
      { stock_qty: 50,  stock_alert_qty: 5  },
    ]
    expect(lowStockCount(products)).toBe(0)
  })

  it('handles string-typed stock values (coerced via Number())', () => {
    const products = [
      { stock_qty: '3' as unknown as number, stock_alert_qty: '10' as unknown as number },
    ]
    expect(lowStockCount(products)).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. totalActiveLots
// ─────────────────────────────────────────────────────────────────────────────

describe('totalActiveLots()', () => {
  it('returns 0 for empty lotCosts', () => {
    expect(totalActiveLots({})).toBe(0)
  })

  it('sums lotCount across all products', () => {
    const lotCosts: Record<string, LotCostEntry> = {
      p1: { avgCost: 10, lotCount: 3, currency: 'TRY' },
      p2: { avgCost: 20, lotCount: 1, currency: 'USD' },
      p3: { avgCost: 5,  lotCount: 2, currency: 'TRY' },
    }
    expect(totalActiveLots(lotCosts)).toBe(6)
  })

  it('returns single product lotCount when only one product has lots', () => {
    const lotCosts: Record<string, LotCostEntry> = {
      p1: { avgCost: 15, lotCount: 4, currency: 'EUR' },
    }
    expect(totalActiveLots(lotCosts)).toBe(4)
  })
})
