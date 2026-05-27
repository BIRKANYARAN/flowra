/**
 * profit-distribution.test.ts — Profit Distribution Simulator unit tests
 *
 * Tests cover:
 *   - computeLegalReserveAllocation: standard 5%, already-at-cap, partial gap
 *   - computeDistributableGross: all deductions
 *   - computeDistributableNet: GVK 94 withholding
 *   - computePartnerAllocations: share-based split with tax
 *   - buildScenario: end-to-end, flags, edge cases
 *
 * Run: npx vitest run tests/profit-distribution.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeLegalReserveAllocation,
  computeDistributableGross,
  computeDistributableNet,
  computePartnerAllocations,
  buildScenario,
} from '../lib/services/pcle/profit-distribution.service'

// ── computeLegalReserveAllocation ─────────────────────────────────────────────

describe('computeLegalReserveAllocation', () => {
  it('allocates 5% of net income when reserve is empty', () => {
    // 5% of 100000 = 5000; gap = 1000000 * 0.20 - 0 = 200000 → min(5000, 200000) = 5000
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 0)).toBe(5_000)
  })

  it('returns 0 when reserve already at 20% of capital', () => {
    // existingReserve = 200000 = capital * 0.20 → gap = 0
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 200_000)).toBe(0)
  })

  it('caps at the remaining gap when gap < 5% of income', () => {
    // gap = 200000 - 195000 = 5000; proposed = 5% * 100000 = 5000 → min(5000, 5000) = 5000
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 195_000)).toBe(5_000)
  })

  it('caps allocation at gap when gap is smaller than 5% of income', () => {
    // gap = 200000 - 198000 = 2000; proposed = 5000 → capped at 2000
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 198_000)).toBe(2_000)
  })

  it('returns 0 when net income is zero', () => {
    expect(computeLegalReserveAllocation(0, 1_000_000, 0)).toBe(0)
  })

  it('returns 0 when net income is negative', () => {
    expect(computeLegalReserveAllocation(-50_000, 1_000_000, 0)).toBe(0)
  })

  it('returns 0 when reserve exceeds 20% target', () => {
    // Over-funded reserve: existing > target
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 210_000)).toBe(0)
  })
})

// ── computeDistributableGross ─────────────────────────────────────────────────

describe('computeDistributableGross', () => {
  it('subtracts legal reserve only', () => {
    // 100000 - 5000 - 0 - 0 = 95000
    expect(computeDistributableGross(100_000, 5_000, 0, 0)).toBe(95_000)
  })

  it('subtracts legal reserve and board retained', () => {
    // 100000 - 5000 - 10000 - 0 = 85000
    expect(computeDistributableGross(100_000, 5_000, 10_000, 0)).toBe(85_000)
  })

  it('subtracts all four layers', () => {
    // 100000 - 5000 - 10000 - 3000 = 82000
    expect(computeDistributableGross(100_000, 5_000, 10_000, 3_000)).toBe(82_000)
  })

  it('can return negative when deductions exceed income', () => {
    // 10000 - 5000 - 8000 - 0 = -3000
    expect(computeDistributableGross(10_000, 5_000, 8_000, 0)).toBe(-3_000)
  })

  it('returns zero when exactly balanced', () => {
    expect(computeDistributableGross(10_000, 5_000, 5_000, 0)).toBe(0)
  })
})

// ── computeDistributableNet ───────────────────────────────────────────────────

describe('computeDistributableNet', () => {
  it('applies 10% withholding — returns 90% of gross', () => {
    expect(computeDistributableNet(100_000)).toBe(90_000)
  })

  it('returns 0 for zero input', () => {
    expect(computeDistributableNet(0)).toBe(0)
  })

  it('returns 0 for negative input', () => {
    expect(computeDistributableNet(-5_000)).toBe(0)
  })

  it('handles fractional amounts with rounding', () => {
    // 33333.33 * 0.90 = 29999.997 → rounds to 30000
    expect(computeDistributableNet(33_333.33)).toBeCloseTo(29_999.997, 0)
  })
})

// ── computePartnerAllocations ─────────────────────────────────────────────────

describe('computePartnerAllocations', () => {
  it('computes correct gross, withholding, and net for a single partner', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0].gross_allocation).toBe(60_000)
    expect(result[0].withholding_tax).toBe(6_000)
    expect(result[0].net_allocation).toBe(54_000)
  })

  it('splits between two partners correctly', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
    ])
    expect(result[0].gross_allocation).toBe(60_000)
    expect(result[1].gross_allocation).toBe(40_000)
    expect(result[0].net_allocation).toBe(54_000)
    expect(result[1].net_allocation).toBe(36_000)
  })

  it('returns zero allocations when distributableGross is zero', () => {
    const result = computePartnerAllocations(0, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 100 },
    ])
    expect(result[0].gross_allocation).toBe(0)
    expect(result[0].net_allocation).toBe(0)
  })

  it('returns zero allocations when distributableGross is negative', () => {
    const result = computePartnerAllocations(-10_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 100 },
    ])
    expect(result[0].gross_allocation).toBe(0)
  })

  it('preserves partner_id and partner_name in output', () => {
    const result = computePartnerAllocations(50_000, [
      { partner_id: 'abc', partner_name: 'Birkan', share_pct: 100 },
    ])
    expect(result[0].partner_id).toBe('abc')
    expect(result[0].partner_name).toBe('Birkan')
  })
})

// ── buildScenario ─────────────────────────────────────────────────────────────

describe('buildScenario', () => {
  const partners = [
    { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
    { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
  ]

  it('builds a correct end-to-end scenario with can_distribute=true', () => {
    // income: 100000, capital: 500000, reserve: 0, boardPct: 0, compensation: 0
    // legal_reserve = 5% * 100000 = 5000
    // distributable_gross = 100000 - 5000 - 0 - 0 = 95000
    // withholding = 9500, distributable_net = 85500
    const s = buildScenario(100_000, 500_000, 0, 0, 0, partners)
    expect(s.legal_reserve_allocation).toBe(5_000)
    expect(s.distributable_gross).toBe(95_000)
    expect(s.withholding_tax).toBe(9_500)
    expect(s.distributable_net).toBe(85_500)
    expect(s.can_distribute).toBe(true)
    expect(s.ttk_509_violated).toBe(false)
  })

  it('sets can_distribute=false when distributable_net is zero', () => {
    // income very small, all consumed by reserve + unpaid compensation
    const s = buildScenario(1_000, 1_000_000, 0, 0, 1_000, partners)
    // legal_reserve = 50; board_retained = 0; distributable_gross = 1000 - 50 - 0 - 1000 = -50
    expect(s.can_distribute).toBe(false)
  })

  it('sets ttk_509_violated=true when distributable_gross is negative', () => {
    const s = buildScenario(5_000, 1_000_000, 0, 0, 10_000, partners)
    // legal_reserve = 250; distributable_gross = 5000 - 250 - 0 - 10000 = -5250
    expect(s.ttk_509_violated).toBe(true)
    expect(s.can_distribute).toBe(false)
  })

  it('sets legal_reserve_satisfied=true when existing >= 20% of capital', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    // 100000 >= 500000 * 0.20 = 100000
    expect(s.legal_reserve_satisfied).toBe(true)
    expect(s.legal_reserve_allocation).toBe(0)
  })

  it('zero income results in can_distribute=false', () => {
    const s = buildScenario(0, 1_000_000, 0, 0, 0, partners)
    expect(s.can_distribute).toBe(false)
    expect(s.distributable_net).toBe(0)
  })

  it('boardRetainedPct=20 reduces distributable correctly', () => {
    // income: 100000, board_retained = 20% = 20000
    // legal_reserve = 5000; distributable_gross = 100000 - 5000 - 20000 - 0 = 75000
    const s = buildScenario(100_000, 500_000, 0, 20, 0, partners)
    expect(s.board_retained_amount).toBe(20_000)
    expect(s.distributable_gross).toBe(75_000)
    expect(s.distributable_net).toBe(67_500)
  })

  it('includes partner allocations with correct proportions', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    // legal_reserve already satisfied → allocation = 0
    // distributable_gross = 100000 - 0 - 0 - 0 = 100000
    expect(s.partner_allocations[0].gross_allocation).toBe(60_000)
    expect(s.partner_allocations[1].gross_allocation).toBe(40_000)
  })
})
