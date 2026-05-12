/**
 * FAZ 18 — Satış Akışı: business-logic unit tests
 *
 * Tests the pure analytics functions in sales-flow/page.tsx:
 *   1. computeStockValue()    — sum of qty_remaining × entry_cost_try
 *   2. computePipelineValue() — total of sent + accepted proformas
 *   3. computeGrossProfit()   — revenue − cogs
 *   4. computeGrossMargin()   — gross profit as percentage; 0 when revenue = 0
 *   5. computeUnpaidTotal()   — sum of non-paid sales
 *   6. fmt()                  — money formatter (exported from SalesFlowClient)
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/sales-flow-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'
import { fmt } from '../app/dashboard/sales-flow/SalesFlowClient'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from sales-flow/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

interface StockLot {
  qty_remaining:  number
  entry_cost_try: number
}

interface Proforma {
  id:            string
  customer_name: string | null
  status:        'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
  total:         number | null
  currency:      string | null
  created_at:    string | null
  updated_at:    string | null
}

interface Sale {
  id:             string
  customer_name:  string | null
  total_try:      number | null
  cost_try:       number | null
  payment_status: string | null
  created_at:     string | null
}

function computeStockValue(lots: StockLot[]): number {
  return lots.reduce((s, l) => s + (Number(l.qty_remaining) || 0) * (Number(l.entry_cost_try) || 0), 0)
}

function computePipelineValue(proformas: Proforma[]): number {
  return proformas
    .filter(p => p.status === 'sent' || p.status === 'accepted')
    .reduce((s, p) => s + (Number(p.total) || 0), 0)
}

function computeGrossProfit(revenue: number, cogs: number): number {
  return revenue - cogs
}

function computeGrossMargin(revenue: number, cogs: number): number {
  if (revenue <= 0) return 0
  return ((revenue - cogs) / revenue) * 100
}

function computeUnpaidTotal(sales: Sale[]): number {
  return sales
    .filter(s => s.payment_status !== 'paid')
    .reduce((s, r) => s + (Number(r.total_try) || 0), 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makePf(status: Proforma['status'], total: number | null = 1000): Proforma {
  return { id: crypto.randomUUID(), customer_name: 'Test', status, total, currency: 'TRY', created_at: null, updated_at: null }
}

function makeSale(total_try: number, cost_try: number, payment_status: string): Sale {
  return { id: crypto.randomUUID(), customer_name: 'Test', total_try, cost_try, payment_status, created_at: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeStockValue
// ─────────────────────────────────────────────────────────────────────────────

describe('computeStockValue()', () => {
  it('returns 0 for empty lots', () => {
    expect(computeStockValue([])).toBe(0)
  })

  it('computes value for a single lot', () => {
    // 10 units × ₺50 = ₺500
    expect(computeStockValue([{ qty_remaining: 10, entry_cost_try: 50 }])).toBe(500)
  })

  it('sums across multiple lots', () => {
    const lots = [
      { qty_remaining: 5,  entry_cost_try: 100 },  // 500
      { qty_remaining: 20, entry_cost_try: 25  },  // 500
    ]
    expect(computeStockValue(lots)).toBe(1000)
  })

  it('treats falsy qty_remaining as 0', () => {
    const lots = [{ qty_remaining: 0, entry_cost_try: 999 }]
    expect(computeStockValue(lots)).toBe(0)
  })

  it('treats falsy entry_cost_try as 0', () => {
    const lots = [{ qty_remaining: 100, entry_cost_try: 0 }]
    expect(computeStockValue(lots)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computePipelineValue
// ─────────────────────────────────────────────────────────────────────────────

describe('computePipelineValue()', () => {
  it('returns 0 for empty proformas', () => {
    expect(computePipelineValue([])).toBe(0)
  })

  it('sums sent + accepted totals only', () => {
    const pfs = [
      makePf('draft',     500),  // excluded
      makePf('sent',      1000), // included
      makePf('accepted',  2000), // included
      makePf('rejected',  800),  // excluded
      makePf('converted', 300),  // excluded
    ]
    expect(computePipelineValue(pfs)).toBe(3000)
  })

  it('returns 0 when all statuses are excluded', () => {
    const pfs = [makePf('draft'), makePf('rejected'), makePf('converted')]
    expect(computePipelineValue(pfs)).toBe(0)
  })

  it('handles null total as 0', () => {
    const pfs = [makePf('sent', null), makePf('accepted', null)]
    expect(computePipelineValue(pfs)).toBe(0)
  })

  it('handles only sent proformas', () => {
    const pfs = [makePf('sent', 500), makePf('sent', 700)]
    expect(computePipelineValue(pfs)).toBe(1200)
  })

  it('handles only accepted proformas', () => {
    const pfs = [makePf('accepted', 400)]
    expect(computePipelineValue(pfs)).toBe(400)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeGrossProfit
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGrossProfit()', () => {
  it('subtracts cogs from revenue', () => {
    expect(computeGrossProfit(10000, 6000)).toBe(4000)
  })

  it('returns 0 when revenue equals cogs', () => {
    expect(computeGrossProfit(5000, 5000)).toBe(0)
  })

  it('returns negative profit when cogs exceed revenue', () => {
    expect(computeGrossProfit(3000, 5000)).toBe(-2000)
  })

  it('returns full revenue when cogs is 0', () => {
    expect(computeGrossProfit(8000, 0)).toBe(8000)
  })

  it('handles zero revenue', () => {
    expect(computeGrossProfit(0, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeGrossMargin
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGrossMargin()', () => {
  it('returns 0 when revenue is 0', () => {
    expect(computeGrossMargin(0, 0)).toBe(0)
  })

  it('returns 0 when revenue is negative', () => {
    expect(computeGrossMargin(-100, 0)).toBe(0)
  })

  it('computes 50% margin correctly', () => {
    expect(computeGrossMargin(1000, 500)).toBeCloseTo(50, 5)
  })

  it('computes 100% margin when cogs is 0', () => {
    expect(computeGrossMargin(1000, 0)).toBeCloseTo(100, 5)
  })

  it('computes 0% margin when revenue equals cogs', () => {
    expect(computeGrossMargin(1000, 1000)).toBeCloseTo(0, 5)
  })

  it('returns negative margin when cogs exceed revenue', () => {
    expect(computeGrossMargin(1000, 1500)).toBeCloseTo(-50, 5)
  })

  it('computes 25% margin', () => {
    expect(computeGrossMargin(4000, 3000)).toBeCloseTo(25, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeUnpaidTotal
// ─────────────────────────────────────────────────────────────────────────────

describe('computeUnpaidTotal()', () => {
  it('returns 0 for empty sales', () => {
    expect(computeUnpaidTotal([])).toBe(0)
  })

  it('sums all non-paid sales', () => {
    const sales = [
      makeSale(1000, 500, 'unpaid'),   // included
      makeSale(2000, 800, 'partial'),  // included
      makeSale(3000, 1000, 'paid'),    // excluded
      makeSale(500,  200, 'overdue'),  // included
    ]
    expect(computeUnpaidTotal(sales)).toBe(3500)
  })

  it('returns 0 when all sales are paid', () => {
    const sales = [makeSale(500, 200, 'paid'), makeSale(800, 300, 'paid')]
    expect(computeUnpaidTotal(sales)).toBe(0)
  })

  it('handles null total_try as 0', () => {
    const sales: Sale[] = [
      { id: '1', customer_name: null, total_try: null, cost_try: 0, payment_status: 'unpaid', created_at: null },
    ]
    expect(computeUnpaidTotal(sales)).toBe(0)
  })

  it('includes overdue sales', () => {
    const sales = [makeSale(1200, 400, 'overdue')]
    expect(computeUnpaidTotal(sales)).toBe(1200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. fmt() — imported from SalesFlowClient
// ─────────────────────────────────────────────────────────────────────────────

describe('fmt()', () => {
  it('formats small amounts without suffix', () => {
    // < 10_000 → no suffix
    const result = fmt(9999)
    expect(result).toContain('₺')
    expect(result).not.toContain('K')
    expect(result).not.toContain('M')
  })

  it('formats amounts >= 10_000 with K suffix', () => {
    const result = fmt(50000)
    expect(result).toContain('K')
    expect(result).not.toContain('M')
  })

  it('formats amounts >= 1_000_000 with M suffix', () => {
    const result = fmt(2_500_000)
    expect(result).toContain('M')
  })

  it('formats zero', () => {
    const result = fmt(0)
    expect(result).toContain('₺')
    expect(result).not.toContain('K')
  })

  it('formats negative amounts with minus sign', () => {
    const result = fmt(-5000)
    expect(result).toContain('−')
    expect(result).toContain('₺')
  })

  it('formats large negative amounts with K suffix and minus sign', () => {
    const result = fmt(-50000)
    expect(result).toContain('−')
    expect(result).toContain('K')
  })
})
