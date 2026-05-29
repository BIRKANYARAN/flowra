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
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 0)).toBe(5_000)
  })

  it('returns 0 when reserve already at 20% of capital', () => {
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 200_000)).toBe(0)
  })

  it('caps at the remaining gap when gap < 5% of income', () => {
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 195_000)).toBe(5_000)
  })

  it('caps allocation at gap when gap is smaller than 5% of income', () => {
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 198_000)).toBe(2_000)
  })

  it('returns 0 when net income is zero', () => {
    expect(computeLegalReserveAllocation(0, 1_000_000, 0)).toBe(0)
  })

  it('returns 0 when net income is negative', () => {
    expect(computeLegalReserveAllocation(-50_000, 1_000_000, 0)).toBe(0)
  })

  it('returns 0 when reserve exceeds 20% target', () => {
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 210_000)).toBe(0)
  })

  it('works with minimal paid capital', () => {
    // 5% of 10000 = 500; target = 50000 * 0.20 = 10000; gap = 10000; min(500, 10000) = 500
    expect(computeLegalReserveAllocation(10_000, 50_000, 0)).toBe(500)
  })

  it('works when paidInCapital is 0', () => {
    // target = 0; gap = 0 - 0 = 0; returns 0
    expect(computeLegalReserveAllocation(100_000, 0, 0)).toBe(0)
  })

  it('returns 5% of income for large income when reserve near empty', () => {
    // 5% of 1_000_000 = 50_000; target = 10_000_000 * 0.20 = 2_000_000; gap = 2_000_000 > 50_000
    expect(computeLegalReserveAllocation(1_000_000, 10_000_000, 0)).toBe(50_000)
  })

  it('allocation can never exceed 5% of net income', () => {
    const income = 200_000
    const allocation = computeLegalReserveAllocation(income, 1_000_000, 0)
    expect(allocation).toBeLessThanOrEqual(income * 0.05)
  })

  it('allocation never negative', () => {
    const allocation = computeLegalReserveAllocation(50_000, 500_000, 50_000)
    expect(allocation).toBeGreaterThanOrEqual(0)
  })

  it('reserve gap exactly 0 → allocation 0', () => {
    // existing = target exactly
    expect(computeLegalReserveAllocation(1_000_000, 500_000, 100_000)).toBe(0)
  })

  it('small gap less than 5% of income → capped at gap', () => {
    // income = 100_000; 5% = 5000; target = 500_000 * 0.20 = 100_000; existing = 99_000; gap = 1000
    expect(computeLegalReserveAllocation(100_000, 500_000, 99_000)).toBe(1_000)
  })
})

// ── computeDistributableGross ─────────────────────────────────────────────────

describe('computeDistributableGross', () => {
  it('subtracts legal reserve only', () => {
    expect(computeDistributableGross(100_000, 5_000, 0, 0)).toBe(95_000)
  })

  it('subtracts legal reserve and board retained', () => {
    expect(computeDistributableGross(100_000, 5_000, 10_000, 0)).toBe(85_000)
  })

  it('subtracts all four layers', () => {
    expect(computeDistributableGross(100_000, 5_000, 10_000, 3_000)).toBe(82_000)
  })

  it('can return negative when deductions exceed income', () => {
    expect(computeDistributableGross(10_000, 5_000, 8_000, 0)).toBe(-3_000)
  })

  it('returns zero when exactly balanced', () => {
    expect(computeDistributableGross(10_000, 5_000, 5_000, 0)).toBe(0)
  })

  it('zero income with all zero deductions returns 0', () => {
    expect(computeDistributableGross(0, 0, 0, 0)).toBe(0)
  })

  it('large income with small deductions', () => {
    // 1_000_000 - 50_000 - 0 - 0 = 950_000
    expect(computeDistributableGross(1_000_000, 50_000, 0, 0)).toBe(950_000)
  })

  it('income with full board retained = 0 gross', () => {
    // board retains all income
    expect(computeDistributableGross(100_000, 0, 100_000, 0)).toBe(0)
  })

  it('unpaid compensation reduces gross distributable', () => {
    // 100_000 - 5_000 - 0 - 20_000 = 75_000
    expect(computeDistributableGross(100_000, 5_000, 0, 20_000)).toBe(75_000)
  })

  it('negative income still processes correctly', () => {
    // -50_000 - 0 - 0 - 0 = -50_000
    expect(computeDistributableGross(-50_000, 0, 0, 0)).toBe(-50_000)
  })

  it('rounding precision: fractional values', () => {
    // 100_000.50 - 5_000.25 - 0 - 0 = 95_000.25
    expect(computeDistributableGross(100_000.50, 5_000.25, 0, 0)).toBeCloseTo(95_000.25, 2)
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
    expect(computeDistributableNet(33_333.33)).toBeCloseTo(29_999.997, 0)
  })

  it('large amount retains 90%', () => {
    expect(computeDistributableNet(1_000_000)).toBe(900_000)
  })

  it('small amount', () => {
    expect(computeDistributableNet(1_000)).toBe(900)
  })

  it('very large amount', () => {
    expect(computeDistributableNet(10_000_000)).toBe(9_000_000)
  })

  it('result is always < input for positive input', () => {
    const net = computeDistributableNet(50_000)
    expect(net).toBeLessThan(50_000)
  })

  it('result is 90% of input for positive values', () => {
    const gross = 75_000
    expect(computeDistributableNet(gross)).toBeCloseTo(gross * 0.9, 2)
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

  it('returns empty array when no partners', () => {
    const result = computePartnerAllocations(100_000, [])
    expect(result).toHaveLength(0)
  })

  it('three partners with equal shares', () => {
    const result = computePartnerAllocations(300_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 33.33 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 33.33 },
      { partner_id: 'p3', partner_name: 'C', share_pct: 33.34 },
    ])
    expect(result).toHaveLength(3)
    // each gets ~33.33% of 300_000 ≈ 99_990
    expect(result[0].gross_allocation).toBeCloseTo(99_990, 0)
  })

  it('net = gross × 0.9 for all partners', () => {
    const result = computePartnerAllocations(200_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
    ])
    for (const alloc of result) {
      expect(alloc.net_allocation).toBeCloseTo(alloc.gross_allocation * 0.9, 2)
    }
  })

  it('withholding = gross × 0.10', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 100 },
    ])
    expect(result[0].withholding_tax).toBeCloseTo(result[0].gross_allocation * 0.1, 2)
  })

  it('share_pct preserved in output', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 72.5 },
    ])
    expect(result[0].share_pct).toBe(72.5)
  })

  it('sum of gross allocations approximately equals distributableGross', () => {
    const gross = 100_000
    const result = computePartnerAllocations(gross, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
    ])
    const totalGross = result.reduce((s, r) => s + r.gross_allocation, 0)
    expect(totalGross).toBeCloseTo(gross, 0)
  })
})

// ── buildScenario ─────────────────────────────────────────────────────────────

describe('buildScenario', () => {
  const partners = [
    { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
    { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
  ]

  it('builds a correct end-to-end scenario with can_distribute=true', () => {
    const s = buildScenario(100_000, 500_000, 0, 0, 0, partners)
    expect(s.legal_reserve_allocation).toBe(5_000)
    expect(s.distributable_gross).toBe(95_000)
    expect(s.withholding_tax).toBe(9_500)
    expect(s.distributable_net).toBe(85_500)
    expect(s.can_distribute).toBe(true)
    expect(s.ttk_509_violated).toBe(false)
  })

  it('sets can_distribute=false when distributable_net is zero', () => {
    const s = buildScenario(1_000, 1_000_000, 0, 0, 1_000, partners)
    expect(s.can_distribute).toBe(false)
  })

  it('sets ttk_509_violated=true when distributable_gross is negative', () => {
    const s = buildScenario(5_000, 1_000_000, 0, 0, 10_000, partners)
    expect(s.ttk_509_violated).toBe(true)
    expect(s.can_distribute).toBe(false)
  })

  it('sets legal_reserve_satisfied=true when existing >= 20% of capital', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    expect(s.legal_reserve_satisfied).toBe(true)
    expect(s.legal_reserve_allocation).toBe(0)
  })

  it('zero income results in can_distribute=false', () => {
    const s = buildScenario(0, 1_000_000, 0, 0, 0, partners)
    expect(s.can_distribute).toBe(false)
    expect(s.distributable_net).toBe(0)
  })

  it('boardRetainedPct=20 reduces distributable correctly', () => {
    const s = buildScenario(100_000, 500_000, 0, 20, 0, partners)
    expect(s.board_retained_amount).toBe(20_000)
    expect(s.distributable_gross).toBe(75_000)
    expect(s.distributable_net).toBe(67_500)
  })

  it('includes partner allocations with correct proportions', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    expect(s.partner_allocations[0].gross_allocation).toBe(60_000)
    expect(s.partner_allocations[1].gross_allocation).toBe(40_000)
  })

  it('gross_net_income is preserved in output', () => {
    const s = buildScenario(250_000, 500_000, 0, 0, 0, partners)
    expect(s.gross_net_income).toBe(250_000)
  })

  it('paid_in_capital is preserved in output', () => {
    const s = buildScenario(100_000, 750_000, 0, 0, 0, partners)
    expect(s.paid_in_capital).toBe(750_000)
  })

  it('existing_legal_reserve is preserved in output', () => {
    const s = buildScenario(100_000, 500_000, 80_000, 0, 0, partners)
    expect(s.existing_legal_reserve).toBe(80_000)
  })

  it('unpaid_compensation is preserved in output', () => {
    const s = buildScenario(100_000, 500_000, 0, 0, 15_000, partners)
    expect(s.unpaid_compensation).toBe(15_000)
  })

  it('withholding_tax = 0 when distributable_gross <= 0', () => {
    const s = buildScenario(5_000, 1_000_000, 0, 0, 10_000, partners)
    // distributable_gross < 0 → withholding = 0
    expect(s.withholding_tax).toBe(0)
  })

  it('partner_allocations length matches partners count', () => {
    const s = buildScenario(100_000, 500_000, 0, 0, 0, partners)
    expect(s.partner_allocations).toHaveLength(2)
  })

  it('no partners → empty allocations', () => {
    const s = buildScenario(100_000, 500_000, 0, 0, 0, [])
    expect(s.partner_allocations).toHaveLength(0)
  })

  it('boardRetainedPct=100 → distributable_gross = negative', () => {
    // board retains 100% → board_retained = income; distributable = income - reserve - income = -reserve
    const s = buildScenario(100_000, 500_000, 0, 100, 0, partners)
    // legal_reserve = 5000; board_retained = 100_000; gross = 100_000 - 5_000 - 100_000 = -5_000
    expect(s.distributable_gross).toBe(-5_000)
    expect(s.can_distribute).toBe(false)
    expect(s.ttk_509_violated).toBe(true)
  })

  it('boardRetainedPct=0 and full reserve satisfied → max distribution', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    // reserve satisfied, board=0, compensation=0
    expect(s.distributable_gross).toBe(100_000)
    expect(s.distributable_net).toBe(90_000)
    expect(s.can_distribute).toBe(true)
  })

  it('negative income: ttk_509_violated=true since gross < 0', () => {
    const s = buildScenario(-10_000, 500_000, 0, 0, 0, partners)
    // legal_reserve=0 (income<=0); board_retained = -10_000*0/100=0; gross = -10_000
    expect(s.ttk_509_violated).toBe(true)
  })

  it('can_distribute is false when distributable_net = 0 exactly', () => {
    // Force gross = 0 → net = 0 → can_distribute = false
    const s = buildScenario(100_000, 500_000, 0, 0, 95_000, partners)
    // legal_reserve = 5000; gross = 100000 - 5000 - 0 - 95000 = 0
    expect(s.distributable_gross).toBe(0)
    expect(s.can_distribute).toBe(false)
  })
})

// ── buildScenario — edge cases and invariants ─────────────────────────────────

describe('buildScenario — invariants', () => {
  const partners = [
    { partner_id: 'p1', partner_name: 'A', share_pct: 50 },
    { partner_id: 'p2', partner_name: 'B', share_pct: 50 },
  ]

  it('legal_reserve_satisfied is true when reserve + allocation >= 20% of capital', () => {
    // existing = 90_000; income = 200_000; 5% = 10_000; target = 100_000; gap = 10_000
    // existing + allocation = 90_000 + 10_000 = 100_000 = target
    const s = buildScenario(200_000, 500_000, 90_000, 0, 0, partners)
    expect(s.legal_reserve_satisfied).toBe(true)
  })

  it('legal_reserve_satisfied is false when existing reserve is well below target', () => {
    // existing = 0; target = 200_000; gap = 200_000; income = 100_000; 5% = 5_000 < gap
    // existing + allocation = 0 + 5_000 = 5_000 < 200_000
    const s = buildScenario(100_000, 1_000_000, 0, 0, 0, partners)
    expect(s.legal_reserve_satisfied).toBe(false)
  })

  it('distributable_gross = income - reserve - board_retained - compensation', () => {
    const income = 100_000
    const reserve = 5_000
    const boardPct = 10
    const boardAmt = income * boardPct / 100
    const compensation = 3_000
    const expected = income - reserve - boardAmt - compensation
    const s = buildScenario(income, 500_000, 0, boardPct, compensation, partners)
    expect(s.distributable_gross).toBeCloseTo(expected, 2)
  })

  it('ttk_509_violated = false when distributable_gross = 0', () => {
    // gross = 0 is not < 0
    const s = buildScenario(100_000, 500_000, 0, 0, 95_000, partners)
    expect(s.distributable_gross).toBe(0)
    expect(s.ttk_509_violated).toBe(false)
  })

  it('all partner net_allocations sum to distributable_net when share_pct sums to 100', () => {
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, partners)
    const sumNet = s.partner_allocations.reduce((acc, a) => acc + a.net_allocation, 0)
    expect(sumNet).toBeCloseTo(s.distributable_net, 1)
  })

  it('can_distribute = true iff distributable_net > 0', () => {
    const cases = [0, 10_000, 50_000, 100_000, 200_000]
    for (const income of cases) {
      const s = buildScenario(income, 500_000, 0, 0, 0, partners)
      expect(s.can_distribute).toBe(s.distributable_net > 0)
    }
  })

  it('board_retained_amount = grossNetIncome * boardRetainedPct / 100', () => {
    const s = buildScenario(100_000, 500_000, 0, 15, 0, partners)
    expect(s.board_retained_amount).toBeCloseTo(15_000, 2)
  })

  it('single partner 100% share gets all the distribution', () => {
    const singlePartner = [{ partner_id: 'p1', partner_name: 'Solo', share_pct: 100 }]
    const s = buildScenario(100_000, 500_000, 100_000, 0, 0, singlePartner)
    expect(s.partner_allocations[0].gross_allocation).toBeCloseTo(s.distributable_gross, 1)
  })

  it('distributable_net is always 0 when distributable_gross <= 0', () => {
    const s1 = buildScenario(-5_000, 500_000, 0, 0, 0, partners)
    const s2 = buildScenario(5_000, 500_000, 0, 0, 6_000, partners)
    expect(s1.distributable_net).toBe(0)
    expect(s2.distributable_net).toBe(0)
  })
})

// ── computeLegalReserveAllocation — boundary sweep ───────────────────────────

describe('computeLegalReserveAllocation — boundary sweep', () => {
  it('always non-negative across a range of inputs', () => {
    const incomes = [-100_000, -10_000, 0, 10_000, 100_000, 1_000_000]
    const capitals = [0, 100_000, 500_000, 1_000_000]
    const reserves = [0, 50_000, 200_000]

    for (const income of incomes) {
      for (const capital of capitals) {
        for (const reserve of reserves) {
          const alloc = computeLegalReserveAllocation(income, capital, reserve)
          expect(alloc).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

// ── computeDistributableNet — invariant tests ─────────────────────────────────

describe('computeDistributableNet — invariants', () => {
  it('withholding tax implied = gross - net = 10% of gross', () => {
    const gross = 50_000
    const net = computeDistributableNet(gross)
    const impliedWithholding = gross - net
    expect(impliedWithholding).toBeCloseTo(gross * 0.1, 2)
  })

  it('is idempotent: calling twice on same input returns same value', () => {
    expect(computeDistributableNet(100_000)).toBe(computeDistributableNet(100_000))
  })
})

// ── computePartnerAllocations — additional tests ──────────────────────────────

describe('computePartnerAllocations — additional', () => {
  it('withholding + net = gross for each allocation', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 70 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 30 },
    ])
    for (const alloc of result) {
      expect(alloc.withholding_tax + alloc.net_allocation).toBeCloseTo(alloc.gross_allocation, 2)
    }
  })

  it('zero gross with many partners — all get zero', () => {
    const manyPartners = Array.from({ length: 5 }, (_, i) => ({
      partner_id: `p${i}`, partner_name: `P${i}`, share_pct: 20,
    }))
    const result = computePartnerAllocations(0, manyPartners)
    for (const alloc of result) {
      expect(alloc.gross_allocation).toBe(0)
      expect(alloc.net_allocation).toBe(0)
      expect(alloc.withholding_tax).toBe(0)
    }
  })

  it('minor share_pct (1%) partner gets 1% of distributable', () => {
    const result = computePartnerAllocations(1_000_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 1 },
    ])
    expect(result[0].gross_allocation).toBeCloseTo(10_000, 2)
  })

  it('net_allocation always less than gross_allocation for positive gross', () => {
    const result = computePartnerAllocations(200_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
    ])
    for (const alloc of result) {
      if (alloc.gross_allocation > 0) {
        expect(alloc.net_allocation).toBeLessThan(alloc.gross_allocation)
      }
    }
  })

  it('returns allocations in same order as partners input', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'first', partner_name: 'First', share_pct: 60 },
      { partner_id: 'second', partner_name: 'Second', share_pct: 40 },
    ])
    expect(result[0].partner_id).toBe('first')
    expect(result[1].partner_id).toBe('second')
  })
})

// ── computeLegalReserveAllocation — cap and gap scenarios ────────────────────

describe('computeLegalReserveAllocation — cap and gap scenarios', () => {
  it('already at cap (existing = 20% of capital) returns 0', () => {
    // capital = 500_000, 20% = 100_000 → already there
    expect(computeLegalReserveAllocation(200_000, 500_000, 100_000)).toBe(0)
  })

  it('partial cap gap smaller than 5% of income — allocates gap only', () => {
    // capital = 1_000_000, target = 200_000, existing = 197_000 → gap = 3_000
    // 5% of 100_000 = 5_000, but gap is only 3_000
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 197_000)).toBe(3_000)
  })

  it('large gap — 5% of net income is limiting factor', () => {
    // capital = 2_000_000, target = 400_000, existing = 0 → gap = 400_000
    // 5% of 100_000 = 5_000 < gap → return 5_000
    expect(computeLegalReserveAllocation(100_000, 2_000_000, 0)).toBe(5_000)
  })

  it('reserve slightly above cap (existing > 20%) returns 0', () => {
    // capital = 1_000_000, target = 200_000, existing = 210_000 → gap < 0
    expect(computeLegalReserveAllocation(100_000, 1_000_000, 210_000)).toBe(0)
  })

  it('minimal income — small 5% allocation', () => {
    expect(computeLegalReserveAllocation(1_000, 500_000, 0)).toBeCloseTo(50, 1)
  })
})

// ── computeDistributableNet — GVK 94 withholding 10% ─────────────────────────

describe('computeDistributableNet — GVK 94 withholding 10%', () => {
  it('distributableNet = distributableGross × 0.90', () => {
    expect(computeDistributableNet(100_000)).toBeCloseTo(90_000)
  })

  it('gross = 0 → net = 0', () => {
    expect(computeDistributableNet(0)).toBe(0)
  })

  it('negative gross → net = 0 (no negative distribution)', () => {
    expect(computeDistributableNet(-50_000)).toBe(0)
  })

  it('withholding is 10%: gross - net = 10% of gross', () => {
    const gross = 200_000
    const net = computeDistributableNet(gross)
    expect(gross - net).toBeCloseTo(gross * 0.10, 1)
  })

  it('fractional gross rounds to 2 decimal places', () => {
    const net = computeDistributableNet(333.33)
    expect(net).toBeCloseTo(299.997, 1)
  })
})

// ── computePartnerAllocations — share-sum invariant ──────────────────────────

describe('computePartnerAllocations — share-sum invariant', () => {
  it('sum of gross_allocations ≈ distributableGross for 100% share split', () => {
    const distributableGross = 500_000
    const partners = [
      { partner_id: 'p1', partner_name: 'A', share_pct: 60 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 40 },
    ]
    const result = computePartnerAllocations(distributableGross, partners)
    const totalGross = result.reduce((s, a) => s + a.gross_allocation, 0)
    expect(totalGross).toBeCloseTo(distributableGross, 0)
  })

  it('sum of net_allocations ≈ distributableGross × 0.90 for 100% share split', () => {
    const distributableGross = 1_000_000
    const partners = [
      { partner_id: 'p1', partner_name: 'A', share_pct: 70 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 30 },
    ]
    const result = computePartnerAllocations(distributableGross, partners)
    const totalNet = result.reduce((s, a) => s + a.net_allocation, 0)
    expect(totalNet).toBeCloseTo(distributableGross * 0.90, 0)
  })

  it('withholding_tax = gross_allocation × 0.10 per partner', () => {
    const result = computePartnerAllocations(100_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 100 },
    ])
    expect(result[0].withholding_tax).toBeCloseTo(result[0].gross_allocation * 0.10, 1)
  })

  it('net_allocation = gross_allocation × 0.90 per partner', () => {
    const result = computePartnerAllocations(200_000, [
      { partner_id: 'p1', partner_name: 'A', share_pct: 50 },
      { partner_id: 'p2', partner_name: 'B', share_pct: 50 },
    ])
    for (const alloc of result) {
      expect(alloc.net_allocation).toBeCloseTo(alloc.gross_allocation * 0.90, 1)
    }
  })
})

// ── buildScenario — edge cases ────────────────────────────────────────────────

describe('buildScenario — edge cases', () => {
  const samplePartners = [
    { partner_id: 'p1', partner_name: 'Partner A', share_pct: 60 },
    { partner_id: 'p2', partner_name: 'Partner B', share_pct: 40 },
  ]

  it('zero net income → can_distribute is false', () => {
    const scenario = buildScenario(0, 1_000_000, 0, 0, 0, samplePartners)
    expect(scenario.can_distribute).toBe(false)
  })

  it('zero net income → distributable_gross is 0 or negative', () => {
    const scenario = buildScenario(0, 1_000_000, 0, 0, 0, samplePartners)
    expect(scenario.distributable_gross).toBe(0)
  })

  it('result contains distributable_net field', () => {
    const scenario = buildScenario(500_000, 1_000_000, 0, 0, 0, samplePartners)
    expect(typeof scenario.distributable_net).toBe('number')
  })

  it('distributable_net = distributableGross × 0.90 when positive', () => {
    const scenario = buildScenario(200_000, 1_000_000, 200_000, 0, 0, samplePartners)
    // reserve already at cap → legalReserve = 0, boardRetained = 0, unpaid = 0
    // distributableGross = 200_000, net = 200_000 × 0.90 = 180_000
    expect(scenario.distributable_net).toBeCloseTo(scenario.distributable_gross * 0.90, 1)
  })

  it('negative net income → ttk_509_violated is false (no distribution attempted)', () => {
    const scenario = buildScenario(-100_000, 1_000_000, 0, 0, 0, samplePartners)
    expect(scenario.can_distribute).toBe(false)
  })

  it('boardRetainedPct = 100 → distributableGross is very small or negative', () => {
    const scenario = buildScenario(100_000, 1_000_000, 0, 100, 0, samplePartners)
    expect(scenario.can_distribute).toBe(false)
  })

  it('legal_reserve_satisfied when existing >= 20% of capital', () => {
    const scenario = buildScenario(100_000, 1_000_000, 200_000, 0, 0, samplePartners)
    expect(scenario.legal_reserve_satisfied).toBe(true)
  })
})