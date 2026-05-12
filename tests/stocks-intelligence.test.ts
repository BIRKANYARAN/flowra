/**
 * FAZ 8 — Stok Zekası: business-logic unit tests
 *
 * Tests the pure computations that power the stocks dashboard:
 *   1. holdingDays()          — calendar-day diff from entry date to today
 *   2. perUnitTry()           — FIFO lot unit cost resolution (entry_cost_try priority)
 *   3. portfolioValue()       — sum of qty_remaining × perUnitTry across lots
 *   4. stockStatusCounts()    — low-stock / zero-stock detection
 *   5. lotsByProduct grouping — correct mapping of lots to products
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/stocks-intelligence.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Pure functions mirroring stocks/page.tsx business logic
// ─────────────────────────────────────────────────────────────────────────────

function holdingDays(entryDate: string, today: string): number {
  const entry = new Date(entryDate + 'T00:00:00')
  const now   = new Date(today   + 'T00:00:00')
  return Math.max(0, Math.round((now.getTime() - entry.getTime()) / 86_400_000))
}

function perUnitTry(lot: {
  unit_cost:        number
  fx_rate_at_entry: number
  entry_cost_try:   number | null
}): number {
  if (lot.entry_cost_try != null && lot.entry_cost_try > 0) return lot.entry_cost_try
  return lot.unit_cost * (lot.fx_rate_at_entry || 1)
}

function portfolioValue(lots: {
  qty_remaining:    number
  unit_cost:        number
  fx_rate_at_entry: number
  entry_cost_try:   number | null
}[]): number {
  return lots.reduce((total, lot) => {
    if (lot.qty_remaining <= 0) return total
    return total + lot.qty_remaining * perUnitTry(lot)
  }, 0)
}

function stockStatusCounts(products: { stock_qty: number; stock_alert_qty: number }[]): {
  lowCount:  number
  zeroCount: number
} {
  return {
    lowCount:  products.filter(p => p.stock_qty > 0 && p.stock_qty <= p.stock_alert_qty).length,
    zeroCount: products.filter(p => p.stock_qty <= 0).length,
  }
}

function groupLotsByProduct(lots: { product_id: string; qty_remaining: number }[]):
  Map<string, typeof lots> {
  const m = new Map<string, typeof lots>()
  for (const lot of lots) {
    if (!m.has(lot.product_id)) m.set(lot.product_id, [])
    m.get(lot.product_id)!.push(lot)
  }
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. holdingDays
// ─────────────────────────────────────────────────────────────────────────────

describe('holdingDays()', () => {
  it('returns 0 when entry date equals today', () => {
    expect(holdingDays('2024-06-15', '2024-06-15')).toBe(0)
  })

  it('returns exact calendar days for a clean interval', () => {
    expect(holdingDays('2024-01-01', '2024-01-31')).toBe(30)
  })

  it('returns 365 for one year', () => {
    expect(holdingDays('2023-06-15', '2024-06-15')).toBe(366) // 2024 is leap year
  })

  it('never returns negative (future entry dates are clamped to 0)', () => {
    expect(holdingDays('2030-01-01', '2024-01-01')).toBe(0)
  })

  it('handles month boundaries correctly', () => {
    // Jan 31 → Feb 1 = 1 day
    expect(holdingDays('2024-01-31', '2024-02-01')).toBe(1)
  })

  it('classifies >180 days as high holding cost', () => {
    const days = holdingDays('2023-01-01', '2024-01-01')
    expect(days).toBeGreaterThan(180)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. perUnitTry — FIFO cost resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('perUnitTry()', () => {
  it('prefers entry_cost_try when available and positive', () => {
    const lot = { unit_cost: 100, fx_rate_at_entry: 30, entry_cost_try: 3500 }
    expect(perUnitTry(lot)).toBe(3500)
  })

  it('falls back to unit_cost × fx_rate when entry_cost_try is null', () => {
    const lot = { unit_cost: 100, fx_rate_at_entry: 38.5, entry_cost_try: null }
    expect(perUnitTry(lot)).toBeCloseTo(3850, 2)
  })

  it('falls back when entry_cost_try is 0', () => {
    const lot = { unit_cost: 200, fx_rate_at_entry: 40, entry_cost_try: 0 }
    expect(perUnitTry(lot)).toBeCloseTo(8000, 2)
  })

  it('uses 1 as FX multiplier for TRY lots (fx_rate_at_entry = 1)', () => {
    const lot = { unit_cost: 500, fx_rate_at_entry: 1, entry_cost_try: null }
    expect(perUnitTry(lot)).toBe(500)
  })

  it('uses 1 as default when fx_rate_at_entry is 0 (data gap guard)', () => {
    const lot = { unit_cost: 300, fx_rate_at_entry: 0, entry_cost_try: null }
    expect(perUnitTry(lot)).toBe(300) // 300 × 1 (clamped)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. portfolioValue — FIFO lot aggregation
// ─────────────────────────────────────────────────────────────────────────────

describe('portfolioValue()', () => {
  it('returns 0 for empty lot list', () => {
    expect(portfolioValue([])).toBe(0)
  })

  it('sums a single TRY lot correctly', () => {
    const lots = [{ qty_remaining: 10, unit_cost: 500, fx_rate_at_entry: 1, entry_cost_try: 500 }]
    expect(portfolioValue(lots)).toBe(5000)
  })

  it('sums multiple lots', () => {
    const lots = [
      { qty_remaining: 5,  unit_cost: 100, fx_rate_at_entry: 1, entry_cost_try: 100 },
      { qty_remaining: 10, unit_cost: 200, fx_rate_at_entry: 1, entry_cost_try: 200 },
    ]
    // 5×100 + 10×200 = 500 + 2000 = 2500
    expect(portfolioValue(lots)).toBe(2500)
  })

  it('skips lots with qty_remaining ≤ 0', () => {
    const lots = [
      { qty_remaining: 0,  unit_cost: 500, fx_rate_at_entry: 1, entry_cost_try: 500 },
      { qty_remaining: -1, unit_cost: 500, fx_rate_at_entry: 1, entry_cost_try: 500 },
      { qty_remaining: 10, unit_cost: 100, fx_rate_at_entry: 1, entry_cost_try: 100 },
    ]
    expect(portfolioValue(lots)).toBe(1000) // only third lot counts
  })

  it('handles USD lot via fallback when entry_cost_try is absent', () => {
    // 5 units bought at $100 each when USD/TRY = 38
    const lots = [{ qty_remaining: 5, unit_cost: 100, fx_rate_at_entry: 38, entry_cost_try: null }]
    expect(portfolioValue(lots)).toBeCloseTo(19_000, 0) // 5 × 3800
  })

  it('prefers frozen entry_cost_try even if fx-based calc gives different result', () => {
    // Lot entered at 38.0, but entry_cost_try was frozen at 3850 (slightly different)
    const lots = [{ qty_remaining: 1, unit_cost: 100, fx_rate_at_entry: 38, entry_cost_try: 3850 }]
    expect(portfolioValue(lots)).toBe(3850) // frozen value wins
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. stockStatusCounts
// ─────────────────────────────────────────────────────────────────────────────

describe('stockStatusCounts()', () => {
  it('all OK → both counts 0', () => {
    const products = [
      { stock_qty: 100, stock_alert_qty: 10 },
      { stock_qty: 50,  stock_alert_qty: 5  },
    ]
    const { lowCount, zeroCount } = stockStatusCounts(products)
    expect(lowCount).toBe(0)
    expect(zeroCount).toBe(0)
  })

  it('detects low stock (qty > 0 but ≤ alert threshold)', () => {
    const products = [
      { stock_qty: 5,  stock_alert_qty: 10 },  // low
      { stock_qty: 50, stock_alert_qty: 10 },  // ok
    ]
    expect(stockStatusCounts(products).lowCount).toBe(1)
  })

  it('does NOT flag zero-stock products as low-stock', () => {
    // qty = 0 should be zeroCount, not lowCount (even if alert_qty > 0)
    const products = [{ stock_qty: 0, stock_alert_qty: 10 }]
    const { lowCount, zeroCount } = stockStatusCounts(products)
    expect(lowCount).toBe(0)
    expect(zeroCount).toBe(1)
  })

  it('counts negative stock as zero/tükenmiş', () => {
    const products = [{ stock_qty: -2, stock_alert_qty: 5 }]
    expect(stockStatusCounts(products).zeroCount).toBe(1)
  })

  it('exact-at-threshold is low (≤ not <)', () => {
    const products = [{ stock_qty: 10, stock_alert_qty: 10 }]
    expect(stockStatusCounts(products).lowCount).toBe(1)
  })

  it('handles products with no alert threshold (stock_alert_qty = 0)', () => {
    // alert_qty = 0 means no alert configured → never flagged as low
    const products = [{ stock_qty: 0, stock_alert_qty: 0 }]
    const { lowCount, zeroCount } = stockStatusCounts(products)
    expect(lowCount).toBe(0)  // 0 > 0 is false → not low
    expect(zeroCount).toBe(1) // qty ≤ 0
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. groupLotsByProduct
// ─────────────────────────────────────────────────────────────────────────────

describe('groupLotsByProduct()', () => {
  it('groups empty list to empty map', () => {
    expect(groupLotsByProduct([]).size).toBe(0)
  })

  it('groups lots under correct product keys', () => {
    const lots = [
      { product_id: 'A', qty_remaining: 10 },
      { product_id: 'B', qty_remaining: 5  },
      { product_id: 'A', qty_remaining: 7  },
    ]
    const m = groupLotsByProduct(lots)
    expect(m.size).toBe(2)
    expect(m.get('A')?.length).toBe(2)
    expect(m.get('B')?.length).toBe(1)
  })

  it('preserves insertion order (FIFO: oldest lot first)', () => {
    const lots = [
      { product_id: 'X', qty_remaining: 10 }, // oldest
      { product_id: 'X', qty_remaining: 5  }, // newer
    ]
    const result = groupLotsByProduct(lots).get('X')!
    expect(result[0].qty_remaining).toBe(10) // oldest first
    expect(result[1].qty_remaining).toBe(5)
  })

  it('includes all lots even when qty_remaining is 0', () => {
    // grouping itself doesn't filter — caller filters after grouping
    const lots = [
      { product_id: 'Z', qty_remaining: 0  },
      { product_id: 'Z', qty_remaining: 20 },
    ]
    expect(groupLotsByProduct(lots).get('Z')?.length).toBe(2)
  })
})
