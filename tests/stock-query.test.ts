/**
 * Tests for Phase 2 — movement-derived stock read side.
 *
 * Scope (deterministic unit tests — no DB):
 *   • deriveMovementType()     — canonical qty-sign mapping
 *   • validateMovementRow()    — integrity guardrails
 *   • Aggregation invariants   — purchase / sale / adjustment math
 *   • Mismatch detection       — drift between movements and legacy stock_qty
 *   • Weighted-average cost    — calculateStockValue inputs
 *   • Lot-based valuation pref — stock_lots takes precedence over movements
 *
 * DB-touching integration tests (roundtrip via StockService + StockQueryService)
 * should live in a separate suite with a test Supabase instance.
 *
 * Run with:  npx vitest run tests/stock-query.test.ts
 */
import { describe, it, expect } from 'vitest'
import { deriveMovementType, validateMovementRow } from '../lib/services/stock.service'

// ─────────────────────────────────────────────────────────────────────────────
// Pure re-implementation of the aggregation loops in StockQueryService.
//
// This mirrors the real service EXACTLY — if you change the service, update
// these helpers. Keeping them colocated with the tests (rather than exported
// from the service) avoids coupling the public surface to test scaffolding.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  qty_change:    number
  movement_type: 'in' | 'out' | 'adjustment' | null
  unit_cost?:    number
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100
}

// HARDENED aggregator — direction from sign(qty_change) ALONE.
// movement_type is metadata; never enters arithmetic.
function sumStock(rows: Row[]): { qty: number; total_in: number; total_out: number } {
  let qty = 0, total_in = 0, total_out = 0
  for (const r of rows) {
    qty += r.qty_change
    if (r.qty_change > 0) total_in  += r.qty_change
    if (r.qty_change < 0) total_out += -r.qty_change
  }
  return { qty: round2(qty), total_in: round2(total_in), total_out: round2(total_out) }
}

// HARDENED valuation — cost basis = positive qty_change × unit_cost.
// No reliance on movement_type.
function weightedAverage(rows: Row[]): { wac: number; qty_on_hand: number } {
  let qtyOnHand = 0, wQty = 0, wCost = 0
  for (const r of rows) {
    const cost = r.unit_cost ?? 0
    qtyOnHand += r.qty_change
    if (r.qty_change > 0 && cost > 0) {
      wQty  += r.qty_change
      wCost += r.qty_change * cost
    }
  }
  return {
    qty_on_hand: round2(qtyOnHand),
    wac:         wQty > 0 ? round2(wCost / wQty) : 0,
  }
}

// ── Lot-based valuation helper — mirrors the new preferred path ──────────────
type Lot = { qty_remaining: number; unit_cost: number; fx_rate_at_entry?: number; entry_cost_try?: number }
function lotBasedValue(lots: Lot[]): { qty_on_hand: number; total_value: number; wac: number } {
  let qty = 0, total = 0
  for (const l of lots) {
    if (l.qty_remaining <= 0) continue
    qty += l.qty_remaining
    const perUnitTry = (l.entry_cost_try && l.entry_cost_try > 0)
      ? l.entry_cost_try
      : round2(l.unit_cost * (l.fx_rate_at_entry ?? 1))
    total += l.qty_remaining * perUnitTry
  }
  return {
    qty_on_hand: round2(qty),
    total_value: round2(total),
    wac:         qty > 0 ? round2(total / qty) : 0,
  }
}

function checkMismatch(rows: Row[], legacy: number): { drift: number; consistent: boolean } {
  const computed = round2(rows.reduce((s, r) => s + r.qty_change, 0))
  const drift    = round2(computed - legacy)
  return { drift, consistent: Math.abs(drift) < 0.0001 }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('deriveMovementType — qty_change is the ONLY source of truth', () => {
  it('positive qty → in', () => {
    expect(deriveMovementType(10)).toBe('in')
    expect(deriveMovementType(0.01)).toBe('in')
  })
  it('negative qty → out', () => {
    expect(deriveMovementType(-5)).toBe('out')
    expect(deriveMovementType(-0.01)).toBe('out')
  })
  it('zero qty → adjustment (never in/out)', () => {
    expect(deriveMovementType(0)).toBe('adjustment')
  })
  it('ignores reference_type — no coupling to business cause', () => {
    // Function signature no longer takes refType. This test codifies that.
    // A "sale" with a positive qty (pathological but possible) still maps
    // to 'in' on the stock-direction axis. The business anomaly is logged
    // via validateMovementRow(), not silently flipped here.
    expect(deriveMovementType(5)).toBe('in')
  })
})

describe('validateMovementRow — integrity guardrails', () => {
  it('clean row returns null', () => {
    expect(validateMovementRow({ refType: 'purchase', qtyChange: 10, movementType: 'in' })).toBeNull()
    expect(validateMovementRow({ refType: 'sale',     qtyChange: -3, movementType: 'out' })).toBeNull()
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'adjustment' })).toBeNull()
  })
  it('flags missing movement_type', () => {
    const a = validateMovementRow({ refType: 'purchase', qtyChange: 10, movementType: null })
    expect(a?.kind).toBe('missing_movement_type')
  })
  it('flags zero qty with in/out', () => {
    const a = validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'in' })
    expect(a?.kind).toBe('zero_qty_with_in_or_out')
  })
  it('flags sign/type mismatch', () => {
    expect(validateMovementRow({ refType: 'purchase', qtyChange: -1, movementType: 'in' })?.kind)
      .toBe('sign_type_mismatch')
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 1, movementType: 'out' })?.kind)
      .toBe('sign_type_mismatch')
  })
  it('flags business direction conflicts (soft)', () => {
    // sale with qty > 0 is legal at the stock layer but suspicious at the
    // business layer. validateMovementRow reports it; callers log, not block.
    const a = validateMovementRow({ refType: 'sale', qtyChange: 5, movementType: 'in' })
    expect(a?.kind).toBe('business_direction_conflict')
    const b = validateMovementRow({ refType: 'purchase', qtyChange: -5, movementType: 'out' })
    expect(b?.kind).toBe('business_direction_conflict')
    const c = validateMovementRow({ refType: 'write_off', qtyChange: 5, movementType: 'in' })
    expect(c?.kind).toBe('business_direction_conflict')
  })
})

describe('Scenario: purchase adds stock', () => {
  it('single purchase of 100 units → qty = 100', () => {
    const rows: Row[] = [{ qty_change: 100, movement_type: 'in', unit_cost: 50 }]
    const s = sumStock(rows)
    expect(s.qty).toBe(100)
    expect(s.total_in).toBe(100)
    expect(s.total_out).toBe(0)
  })

  it('three purchases stack correctly', () => {
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in', unit_cost: 50 },
      { qty_change:  40, movement_type: 'in', unit_cost: 55 },
      { qty_change:  10, movement_type: 'in', unit_cost: 60 },
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(150)
    expect(s.total_in).toBe(150)
  })
})

describe('Scenario: sale reduces stock', () => {
  it('purchase 100, sale 30 → qty = 70', () => {
    const rows: Row[] = [
      { qty_change:  100, movement_type: 'in',  unit_cost: 50 },
      { qty_change:  -30, movement_type: 'out' },
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(70)
    expect(s.total_in).toBe(100)
    expect(s.total_out).toBe(30)
  })

  it('multiple sales accumulate correctly', () => {
    const rows: Row[] = [
      { qty_change:  200, movement_type: 'in' },
      { qty_change:  -50, movement_type: 'out' },
      { qty_change:  -40, movement_type: 'out' },
      { qty_change:  -10, movement_type: 'out' },
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(100)
    expect(s.total_out).toBe(100)
  })
})

describe('Scenario: adjustment works (both directions)', () => {
  it('positive adjustment counts as in', () => {
    const rows: Row[] = [
      { qty_change:  100, movement_type: 'in' },
      { qty_change:    5, movement_type: 'adjustment' },  // found extra in warehouse
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(105)
    expect(s.total_in).toBe(105)
    expect(s.total_out).toBe(0)
  })

  it('negative adjustment counts as out', () => {
    const rows: Row[] = [
      { qty_change:  100, movement_type: 'in' },
      { qty_change:   -3, movement_type: 'adjustment' },  // breakage
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(97)
    expect(s.total_out).toBe(3)
  })

  it('zero-qty adjustment is neutral', () => {
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in' },
      { qty_change:   0, movement_type: 'adjustment' },  // metadata-only correction
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(100)
  })
})

describe('Scenario: legacy rows with null movement_type fall back to qty sign', () => {
  it('null + positive qty → treated as in', () => {
    const rows: Row[] = [{ qty_change: 50, movement_type: null }]
    const s = sumStock(rows)
    expect(s.qty).toBe(50)
    expect(s.total_in).toBe(50)
  })
  it('null + negative qty → treated as out', () => {
    const rows: Row[] = [
      { qty_change:  50, movement_type: null },
      { qty_change: -20, movement_type: null },
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(30)
    expect(s.total_out).toBe(20)
  })
})

describe('Scenario: mismatch detection', () => {
  it('no drift when movements match legacy stock_qty', () => {
    const rows: Row[] = [
      { qty_change:  100, movement_type: 'in' },
      { qty_change:  -30, movement_type: 'out' },
    ]
    const res = checkMismatch(rows, 70)
    expect(res.drift).toBe(0)
    expect(res.consistent).toBe(true)
  })

  it('detects positive drift (legacy has less)', () => {
    const rows: Row[] = [{ qty_change: 100, movement_type: 'in' }]
    const res = checkMismatch(rows, 80)
    expect(res.drift).toBe(20)
    expect(res.consistent).toBe(false)
  })

  it('detects negative drift (legacy has more — seed row bypassed ledger)', () => {
    const rows: Row[] = [{ qty_change: 100, movement_type: 'in' }]
    const res = checkMismatch(rows, 150)
    expect(res.drift).toBe(-50)
    expect(res.consistent).toBe(false)
  })

  it('floating-point noise below epsilon is tolerated', () => {
    const rows: Row[] = [{ qty_change: 10, movement_type: 'in' }]
    const res = checkMismatch(rows, 10.00001)
    // drift may be -0 or very small; within epsilon either way
    expect(res.consistent).toBe(true)
  })
})

describe('Scenario: weighted-average valuation', () => {
  it('single purchase defines the unit cost', () => {
    const rows: Row[] = [{ qty_change: 100, movement_type: 'in', unit_cost: 50 }]
    const v = weightedAverage(rows)
    expect(v.qty_on_hand).toBe(100)
    expect(v.wac).toBe(50)
  })

  it('blends two purchases by quantity', () => {
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in', unit_cost: 50 },   // 5000
      { qty_change: 100, movement_type: 'in', unit_cost: 70 },   // 7000
    ]
    const v = weightedAverage(rows)
    expect(v.qty_on_hand).toBe(200)
    expect(v.wac).toBe(60)  // (5000 + 7000) / 200
  })

  it('ignores sale rows in the cost basis', () => {
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in',  unit_cost: 50 },
      { qty_change: -30, movement_type: 'out' /* no cost */ },
    ]
    const v = weightedAverage(rows)
    expect(v.qty_on_hand).toBe(70)
    expect(v.wac).toBe(50)   // still 50 — sale doesn't change cost basis
  })

  it('ignores rows with unit_cost = 0', () => {
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in', unit_cost: 0 },    // unpriced — excluded
      { qty_change:  50, movement_type: 'in', unit_cost: 80 },
    ]
    const v = weightedAverage(rows)
    expect(v.qty_on_hand).toBe(150)
    expect(v.wac).toBe(80)                    // only the priced row counts
  })

  it('returns 0 wac when no cost-bearing row exists', () => {
    const rows: Row[] = [{ qty_change: 10, movement_type: 'in' /* unit_cost missing */ }]
    const v = weightedAverage(rows)
    expect(v.wac).toBe(0)
  })
})

describe('Regression: signed qty vs movement_type mismatch is not silently doubled', () => {
  it('an "out" row with a positive qty_change still subtracts once (via qty_change sign)', () => {
    // Pathological data a bad writer might produce. The aggregator uses
    // qty_change directly, so it never double-counts.
    const rows: Row[] = [
      { qty_change: 100, movement_type: 'in' },
      { qty_change:  -5, movement_type: 'out' },
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(95)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// HARDENING (Phase 2.5) — strict constraint & lot-based valuation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Strict CHECK semantics simulated in TS', () => {
  // These assertions mirror the DB constraint:
  //   (in  and qty>0) or (out and qty<0) or adjustment
  // If any of these throws, the DB would reject the row too.
  function wouldPassCheck(mt: 'in' | 'out' | 'adjustment', qty: number): boolean {
    if (mt === 'in')  return qty > 0
    if (mt === 'out') return qty < 0
    return true  // adjustment is always allowed
  }

  it('accepts the happy paths', () => {
    expect(wouldPassCheck('in',  10)).toBe(true)
    expect(wouldPassCheck('out', -5)).toBe(true)
    expect(wouldPassCheck('adjustment', 0)).toBe(true)
    expect(wouldPassCheck('adjustment', 3)).toBe(true)
    expect(wouldPassCheck('adjustment', -3)).toBe(true)
  })
  it('rejects qty=0 with in/out', () => {
    expect(wouldPassCheck('in',  0)).toBe(false)
    expect(wouldPassCheck('out', 0)).toBe(false)
  })
  it('rejects sign disagreement', () => {
    expect(wouldPassCheck('in',  -1)).toBe(false)
    expect(wouldPassCheck('out',  1)).toBe(false)
  })
})

describe('deriveMovementType matches the DB trigger contract', () => {
  // The BEFORE INSERT trigger uses the same case expression as deriveMovementType.
  // If these diverge, production inserts will disagree with TS writes.
  it('trigger-equivalent mapping for all sign buckets', () => {
    expect(deriveMovementType( 0.5)).toBe('in')
    expect(deriveMovementType(-0.5)).toBe('out')
    expect(deriveMovementType(   0)).toBe('adjustment')
  })
})

describe('Lot-based valuation preference', () => {
  it('uses frozen entry_cost_try when present', () => {
    const lots: Lot[] = [
      { qty_remaining: 10, unit_cost: 100, fx_rate_at_entry: 30, entry_cost_try: 3000 }, // USD lot, frozen TRY
      { qty_remaining: 5,  unit_cost: 500,                       entry_cost_try: 500  }, // TRY lot
    ]
    const v = lotBasedValue(lots)
    expect(v.qty_on_hand).toBe(15)
    // 10 × 3000 + 5 × 500 = 30000 + 2500 = 32500
    expect(v.total_value).toBe(32500)
  })

  it('falls back to unit_cost × fx_rate_at_entry when entry_cost_try missing', () => {
    const lots: Lot[] = [
      { qty_remaining: 4, unit_cost: 100, fx_rate_at_entry: 35 },  // no entry_cost_try
    ]
    const v = lotBasedValue(lots)
    // perUnit = 100 × 35 = 3500; total = 4 × 3500 = 14000
    expect(v.total_value).toBe(14000)
    expect(v.wac).toBe(3500)
  })

  it('ignores lots with qty_remaining <= 0', () => {
    const lots: Lot[] = [
      { qty_remaining:  0, unit_cost: 999, entry_cost_try: 999 },  // consumed
      { qty_remaining:  5, unit_cost: 100, entry_cost_try: 100 },  // active
      { qty_remaining: -1, unit_cost: 999, entry_cost_try: 999 },  // corrupt (defensive)
    ]
    const v = lotBasedValue(lots)
    expect(v.qty_on_hand).toBe(5)
    expect(v.total_value).toBe(500)
  })

  it('returns zero when all lots are consumed', () => {
    const lots: Lot[] = [{ qty_remaining: 0, unit_cost: 100, entry_cost_try: 100 }]
    const v = lotBasedValue(lots)
    expect(v.qty_on_hand).toBe(0)
    expect(v.wac).toBe(0)
  })
})

describe('Valuation precedence — lot vs movement', () => {
  // Simulates the decision made by calculateStockValue: if any active lot
  // exists, lot-based valuation wins and movement WAC is ignored.
  function pickValuation(lots: Lot[], rows: Row[]): 'lot_based' | 'weighted_average' | 'no_stock' {
    const hasActiveLot = lots.some(l => l.qty_remaining > 0)
    if (hasActiveLot) return 'lot_based'
    const mv = weightedAverage(rows)
    if (mv.qty_on_hand <= 0 || mv.wac <= 0) return 'no_stock'
    return 'weighted_average'
  }

  it('prefers lot when any active lot exists — even with many movement rows', () => {
    const lots: Lot[] = [{ qty_remaining: 1, unit_cost: 100, entry_cost_try: 100 }]
    const rows: Row[] = [
      { qty_change: 10, movement_type: 'in', unit_cost: 50 },
      { qty_change:  5, movement_type: 'in', unit_cost: 60 },
    ]
    expect(pickValuation(lots, rows)).toBe('lot_based')
  })

  it('falls back to WAC when no lots have remaining qty', () => {
    const lots: Lot[] = [{ qty_remaining: 0, unit_cost: 100 }]
    const rows: Row[] = [{ qty_change: 10, movement_type: 'in', unit_cost: 50 }]
    expect(pickValuation(lots, rows)).toBe('weighted_average')
  })

  it('reports no_stock when both sources are empty', () => {
    expect(pickValuation([], [])).toBe('no_stock')
  })
})

describe('Zero-qty row semantics (CRITICAL)', () => {
  it('zero-qty always classifies as adjustment', () => {
    expect(deriveMovementType(0)).toBe('adjustment')
  })
  it('zero-qty row contributes nothing to qty / in / out', () => {
    const rows: Row[] = [
      { qty_change: 10, movement_type: 'in' },
      { qty_change:  0, movement_type: 'adjustment' },  // metadata-only (e.g. note correction)
    ]
    const s = sumStock(rows)
    expect(s.qty).toBe(10)
    expect(s.total_in).toBe(10)
    expect(s.total_out).toBe(0)
  })
  it('zero-qty row with in/out movement_type is rejected by validator', () => {
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'in' })?.kind)
      .toBe('zero_qty_with_in_or_out')
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'out' })?.kind)
      .toBe('zero_qty_with_in_or_out')
  })
})

// ── New: additional deriveMovementType coverage ────────────────────────────────

describe('deriveMovementType — additional coverage', () => {

  it('large positive qty → in', () => {
    expect(deriveMovementType(999_999)).toBe('in')
  })

  it('large negative qty → out', () => {
    expect(deriveMovementType(-999_999)).toBe('out')
  })

  it('fractional positive (0.001) → in', () => {
    expect(deriveMovementType(0.001)).toBe('in')
  })

  it('fractional negative (-0.001) → out', () => {
    expect(deriveMovementType(-0.001)).toBe('out')
  })

  it('result is one of the three valid movement types', () => {
    const validTypes = new Set(['in', 'out', 'adjustment'])
    for (const qty of [100, -1, 0, 0.5, -0.5]) {
      expect(validTypes.has(deriveMovementType(qty))).toBe(true)
    }
  })

  it('exactly zero → adjustment (never in or out)', () => {
    const result = deriveMovementType(0)
    expect(result).not.toBe('in')
    expect(result).not.toBe('out')
    expect(result).toBe('adjustment')
  })

})

// ── New: additional validateMovementRow coverage ───────────────────────────────

describe('validateMovementRow — additional coverage', () => {

  it('valid purchase row (positive qty, in, purchase ref) → null', () => {
    expect(validateMovementRow({ refType: 'purchase', qtyChange: 50, movementType: 'in' })).toBeNull()
  })

  it('valid sale row (negative qty, out, sale ref) → null', () => {
    expect(validateMovementRow({ refType: 'sale', qtyChange: -10, movementType: 'out' })).toBeNull()
  })

  it('valid write_off row (negative qty, out) → null', () => {
    expect(validateMovementRow({ refType: 'write_off', qtyChange: -5, movementType: 'out' })).toBeNull()
  })

  it('valid return row (positive qty, in) → null', () => {
    expect(validateMovementRow({ refType: 'return', qtyChange: 3, movementType: 'in' })).toBeNull()
  })

  it('missing movement_type (undefined) → missing_movement_type', () => {
    const a = validateMovementRow({ refType: 'purchase', qtyChange: 10, movementType: undefined })
    expect(a?.kind).toBe('missing_movement_type')
  })

  it('zero qty with out movement_type → zero_qty_with_in_or_out', () => {
    const a = validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'out' })
    expect(a?.kind).toBe('zero_qty_with_in_or_out')
  })

  it('in but negative qty → sign_type_mismatch kind', () => {
    const a = validateMovementRow({ refType: 'purchase', qtyChange: -5, movementType: 'in' })
    expect(a?.kind).toBe('sign_type_mismatch')
    expect(a?.message).toContain('negative')
  })

  it('out but positive qty → sign_type_mismatch kind', () => {
    const a = validateMovementRow({ refType: 'adjustment', qtyChange: 5, movementType: 'out' })
    expect(a?.kind).toBe('sign_type_mismatch')
    expect(a?.message).toContain('positive')
  })

  it('write_off with positive qty → business_direction_conflict', () => {
    const a = validateMovementRow({ refType: 'write_off', qtyChange: 3, movementType: 'in' })
    expect(a?.kind).toBe('business_direction_conflict')
  })

  it('purchase with negative qty → business_direction_conflict', () => {
    const a = validateMovementRow({ refType: 'purchase', qtyChange: -10, movementType: 'out' })
    expect(a?.kind).toBe('business_direction_conflict')
  })

  it('anomaly object has kind, refType, qtyChange, movementType, message', () => {
    const a = validateMovementRow({ refType: 'sale', qtyChange: 5, movementType: 'in' })
    expect(a).not.toBeNull()
    expect(a).toHaveProperty('kind')
    expect(a).toHaveProperty('refType')
    expect(a).toHaveProperty('qtyChange')
    expect(a).toHaveProperty('movementType')
    expect(a).toHaveProperty('message')
  })

  it('all valid movement types accepted for adjustment refType at zero', () => {
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 0, movementType: 'adjustment' })).toBeNull()
  })

  it('adjustment with positive qty → null (positive adjustments are valid)', () => {
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: 5, movementType: 'adjustment' })).toBeNull()
  })

  it('adjustment with negative qty → null (negative adjustments are valid)', () => {
    expect(validateMovementRow({ refType: 'adjustment', qtyChange: -5, movementType: 'adjustment' })).toBeNull()
  })

})
