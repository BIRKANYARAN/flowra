/**
 * Phase 3 — Cost Engine pure-math tests.
 *
 * Scope (deterministic, no DB):
 *   • allocate() kernel        — by_quantity / by_value / mixed methods
 *   • Penny-perfect reconciliation — Σ allocated_cost_try == Σ amount_try
 *   • Multi-currency landed cost via amount_try snapshots (caller's job to convert)
 *   • Edge cases: zero overhead, single line, free-goods (zero base value)
 *   • Final unit cost identity: final_unit_cost_try * qty ≈ final_total_try
 *
 * Run with:  npx vitest run tests/cost-engine.test.ts
 *
 * Why no DB roundtrip here?
 *   The allocation kernel is the financial brain. We test it in isolation so
 *   regressions are surfaced even when no Supabase instance is available.
 *   PurchaseService.finalize() is exercised by the integration suite
 *   (separate file + test DB) — its behavior depends on idempotency keys,
 *   FIFO lot creation, and movement_type triggers, which are DB-resident.
 */
import { describe, it, expect } from 'vitest'
import { allocate, _round4 } from '../lib/services/cost.service'
import type { CostAllocationMethod } from '../types'

const round4 = _round4

// Σ helper used in many invariants
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

describe('allocate() — by_quantity', () => {
  it('splits a single overhead equally per qty unit', () => {
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 2, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 8, unit_price: 50  },
    ]
    const costs = [{ amount_try: 100, allocation_method: 'by_quantity' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)

    // 100 split across 10 units → 20 (qty 2) and 80 (qty 8)
    expect(r.per_line_alloc_try[0]).toBe(20)
    expect(r.per_line_alloc_try[1]).toBe(80)
    expect(round4(sum(r.per_line_alloc_try))).toBe(100)
  })

  it('treats expensive low-qty and cheap high-qty equivalently', () => {
    // by_quantity ignores price — 1 unit at $1000 carries the same overhead
    // share as 1 unit at $1
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 1, unit_price: 1000 },
      { id: 'b', product_id: 'P2', quantity: 1, unit_price: 1    },
    ]
    const costs = [{ amount_try: 50, allocation_method: 'by_quantity' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(25)
    expect(r.per_line_alloc_try[1]).toBe(25)
  })
})

describe('allocate() — by_value', () => {
  it('splits proportionally to (qty × unit_price × fx)', () => {
    // Total value: (2*100) + (8*50) = 200 + 400 = 600
    // Overhead 60 → 60 * (200/600)=20 and 60 * (400/600)=40
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 2, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 8, unit_price: 50  },
    ]
    const costs = [{ amount_try: 60, allocation_method: 'by_value' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(20)
    expect(r.per_line_alloc_try[1]).toBe(40)
    expect(round4(sum(r.per_line_alloc_try))).toBe(60)
  })

  it('honors purchase fx_rate when computing line value (USD purchase)', () => {
    // Lines priced in USD; purchase fx 30 TRY/USD
    // Line A: 1 * 10 * 30 = 300 TRY
    // Line B: 1 * 30 * 30 = 900 TRY
    // Total value 1200; overhead 120 → 30 to A, 90 to B
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 1, unit_price: 10 },
      { id: 'b', product_id: 'P2', quantity: 1, unit_price: 30 },
    ]
    const costs = [{ amount_try: 120, allocation_method: 'by_value' as CostAllocationMethod }]
    const r = allocate(30, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(30)
    expect(r.per_line_alloc_try[1]).toBe(90)
  })
})

describe('allocate() — mixed methods on the same purchase', () => {
  it('accumulates by_value + by_quantity into the same per-line bucket', () => {
    // Lines:  A qty=2 @ 100 = 200,   B qty=8 @ 50 = 400  (total value 600)
    // Cost 1: 60 by_value     → A:20, B:40
    // Cost 2: 100 by_quantity → A:20 (qty 2/10), B:80 (qty 8/10)
    // Sum:    A:40, B:120
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 2, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 8, unit_price: 50  },
    ]
    const costs = [
      { amount_try: 60,  allocation_method: 'by_value'    as CostAllocationMethod },
      { amount_try: 100, allocation_method: 'by_quantity' as CostAllocationMethod },
    ]
    const r = allocate(1, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(40)
    expect(r.per_line_alloc_try[1]).toBe(120)
    expect(round4(sum(r.per_line_alloc_try))).toBe(160)
    expect(r.total_overhead_try).toBe(160)
  })
})

describe('allocate() — penny-perfect reconciliation', () => {
  it('Σ allocations equals Σ amount_try EXACTLY (3-line rounding residual)', () => {
    // 100 TRY split by_quantity across 3 equal lines = 33.3333…
    // Without residual handling we would lose 0.0001 TRY.
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 1, unit_price: 1 },
      { id: 'b', product_id: 'P2', quantity: 1, unit_price: 1 },
      { id: 'c', product_id: 'P3', quantity: 1, unit_price: 1 },
    ]
    const costs = [{ amount_try: 100, allocation_method: 'by_quantity' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)
    expect(round4(sum(r.per_line_alloc_try))).toBe(100)
    // First two lines hit normal 4dp rounding; last line absorbs the residual.
    expect(r.per_line_alloc_try[0]).toBe(33.3333)
    expect(r.per_line_alloc_try[1]).toBe(33.3333)
    expect(r.per_line_alloc_try[2]).toBe(33.3334)
  })

  it('handles awkward by_value splits without losing fractional cents', () => {
    // Overhead 7.0001 TRY split by value across two lines with weight 1:2
    // Expected: ≈ 2.3334 + ≈ 4.6667 = 7.0001
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 1, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 1, unit_price: 200 },
    ]
    const costs = [{ amount_try: 7.0001, allocation_method: 'by_value' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)
    expect(round4(sum(r.per_line_alloc_try))).toBe(7.0001)
  })
})

describe('allocate() — multi-currency landed cost (amount_try snapshot)', () => {
  // The kernel takes amount_try (already converted) — currency conversion
  // happens at write time. We only verify the snapshot is respected.
  it('USD shipping cost converted to TRY at write time is used as-is', () => {
    // $50 shipping × 30 TRY/USD = 1500 TRY (caller's responsibility)
    // Single line: full amount lands on it.
    const lines = [{ id: 'a', product_id: 'P1', quantity: 5, unit_price: 100 }]
    const costs = [{ amount_try: 1500, allocation_method: 'by_value' as CostAllocationMethod }]
    const r = allocate(30, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(1500)
    // base = 5 × 100 × 30 = 15000; final = 15000 + 1500 = 16500; per unit = 3300
    expect(r.total_base_try).toBe(15000)
    expect(round4(r.per_line_base_try[0] + r.per_line_alloc_try[0])).toBe(16500)
  })
})

describe('allocate() — edge cases', () => {
  it('zero overhead → all per-line allocations are zero', () => {
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 2, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 8, unit_price: 50  },
    ]
    const r = allocate(1, lines, [])
    expect(r.per_line_alloc_try).toEqual([0, 0])
    expect(r.total_overhead_try).toBe(0)
  })

  it('single line absorbs the entire overhead', () => {
    const lines = [{ id: 'a', product_id: 'P1', quantity: 5, unit_price: 100 }]
    const costs = [
      { amount_try: 250, allocation_method: 'by_value' as CostAllocationMethod },
      { amount_try: 75,  allocation_method: 'by_quantity' as CostAllocationMethod },
    ]
    const r = allocate(1, lines, costs)
    expect(r.per_line_alloc_try[0]).toBe(325)
  })

  it('free-goods (all unit_price = 0) under by_value falls back to equal split', () => {
    // Σ value = 0 → equal split is the only sane option to preserve Σ.
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 3, unit_price: 0 },
      { id: 'b', product_id: 'P2', quantity: 7, unit_price: 0 },
    ]
    const costs = [{ amount_try: 100, allocation_method: 'by_value' as CostAllocationMethod }]
    const r = allocate(1, lines, costs)
    expect(round4(sum(r.per_line_alloc_try))).toBe(100)
    // Equal split — both lines get 50 (residual on last makes 50 + 50 exact)
    expect(r.per_line_alloc_try[0]).toBe(50)
    expect(r.per_line_alloc_try[1]).toBe(50)
  })

  it('rejects empty lines', () => {
    expect(() => allocate(1, [], [])).toThrow(/satır/i)
  })

  it('rejects negative or zero fx_rate', () => {
    const lines = [{ id: 'a', product_id: 'P1', quantity: 1, unit_price: 1 }]
    expect(() => allocate(0, lines, [])).toThrow(/fx_rate/i)
    expect(() => allocate(-1, lines, [])).toThrow(/fx_rate/i)
  })

  it('rejects negative overhead amounts (data integrity guard)', () => {
    const lines = [{ id: 'a', product_id: 'P1', quantity: 1, unit_price: 1 }]
    expect(() =>
      allocate(1, lines, [{ amount_try: -1, allocation_method: 'by_value' }])
    ).toThrow(/maliyet/i)
  })
})

describe('Final unit cost identity (the value that lands on stock_lots)', () => {
  it('final_unit_cost_try * qty ≈ final_total_try (within 4dp)', () => {
    // Mixed scenario:
    //   purchase fx 30, line A 2 @ 100, line B 5 @ 40
    //   shipping 600 by_quantity (200/400 split? actually 600 * 2/7 and 5/7)
    //   tax 120 by_value      (base A=6000, B=6000 → equal 60/60)
    const lines = [
      { id: 'a', product_id: 'P1', quantity: 2, unit_price: 100 },
      { id: 'b', product_id: 'P2', quantity: 5, unit_price: 40  },
    ]
    const costs = [
      { amount_try: 600, allocation_method: 'by_quantity' as CostAllocationMethod },
      { amount_try: 120, allocation_method: 'by_value'    as CostAllocationMethod },
    ]
    const r = allocate(30, lines, costs)

    // Verify per-line invariant
    for (let i = 0; i < lines.length; i++) {
      const finalTotal = round4(r.per_line_base_try[i] + r.per_line_alloc_try[i])
      const perUnit    = round4(finalTotal / lines[i].quantity)
      const reconstructed = round4(perUnit * lines[i].quantity)
      // Allow 1 cent (0.01) tolerance for the rounded perUnit × qty roundtrip
      expect(Math.abs(reconstructed - finalTotal)).toBeLessThanOrEqual(0.01)
    }
  })
})
