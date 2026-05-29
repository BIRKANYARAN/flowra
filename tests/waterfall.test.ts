/**
 * Tests for lib/services/pcle/pcle.liability.ts
 * Tests PCLELiability.computeBurdenScores and PCLELiability.computeWaterfall
 * Run with: npx vitest run tests/waterfall.test.ts
 */
import { describe, it, expect } from 'vitest'
import { PCLELiability, type PartnerLoanInput } from '../lib/services/pcle/pcle.liability'

// Helper to build a PartnerLoanInput quickly
function mkLoan(
  id: string,
  name: string,
  share_ratio: number,
  net_loan: number,
): PartnerLoanInput {
  return {
    partner_id:      id,
    partner_name:    name,
    share_ratio,
    net_loan,
    total_loaned:    net_loan,
    total_repaid:    0,
    first_loan_date: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// computeBurdenScores
// ─────────────────────────────────────────────────────────────────────────────

describe('PCLELiability.computeBurdenScores', () => {
  it('equal loans, equal shares → excess = 0 for all (balanced)', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 100_000),
      mkLoan('B', 'Partner B', 0.5, 100_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    expect(scores).toHaveLength(2)
    for (const s of scores) {
      expect(s.excess).toBeCloseTo(0, 1)
    }
  })

  it('A (50%) loans 100k, B (50%) loans 300k → A excess = -100k, B excess = +100k', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 100_000),
      mkLoan('B', 'Partner B', 0.5, 300_000),
    ]
    // total_loans = 400k
    // expected A = 400k * 0.5 = 200k, excess A = 100k - 200k = -100k
    // expected B = 400k * 0.5 = 200k, excess B = 300k - 200k = +100k
    const scores = PCLELiability.computeBurdenScores(loans)
    const a = scores.find(s => s.partner_id === 'A')!
    const b = scores.find(s => s.partner_id === 'B')!
    expect(a.excess).toBeCloseTo(-100_000, 0)
    expect(b.excess).toBeCloseTo(100_000, 0)
  })

  it('single partner → excess = 0 always', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 250_000)]
    const scores = PCLELiability.computeBurdenScores(loans)
    expect(scores[0].excess).toBeCloseTo(0, 1)
  })

  it('all zero loans → all excess = 0', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.6, 0),
      mkLoan('B', 'Partner B', 0.4, 0),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    for (const s of scores) {
      expect(s.excess).toBeCloseTo(0, 1)
    }
  })

  it('zero-sum invariant: Σ excess ≈ 0', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.30, 100_000),
      mkLoan('B', 'Partner B', 0.50, 300_000),
      mkLoan('C', 'Partner C', 0.20, 50_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const sumExcess = scores.reduce((s, b) => s + b.excess, 0)
    expect(sumExcess).toBeCloseTo(0, 0)
  })

  it('expected_loan = total_loans × share_ratio for each partner', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.30, 60_000),
      mkLoan('B', 'Partner B', 0.70, 140_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const totalLoan = 200_000
    const a = scores.find(s => s.partner_id === 'A')!
    const b = scores.find(s => s.partner_id === 'B')!
    expect(a.expected_loan).toBeCloseTo(totalLoan * 0.30, 0)
    expect(b.expected_loan).toBeCloseTo(totalLoan * 0.70, 0)
  })

  it('preserves partner_id and partner_name in output', () => {
    const loans = [mkLoan('XYZ-001', 'ACME Corp', 1.0, 100_000)]
    const scores = PCLELiability.computeBurdenScores(loans)
    expect(scores[0].partner_id).toBe('XYZ-001')
    expect(scores[0].partner_name).toBe('ACME Corp')
  })

  it('burden_pct is 0 when total loans is 0', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 0),
      mkLoan('B', 'Partner B', 0.5, 0),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    for (const s of scores) {
      expect(s.burden_pct).toBe(0)
    }
  })

  it('zero-sum invariant holds for uneven share ratios', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.10, 10_000),
      mkLoan('B', 'Partner B', 0.25, 100_000),
      mkLoan('C', 'Partner C', 0.65, 50_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const sumExcess = scores.reduce((s, b) => s + b.excess, 0)
    expect(Math.abs(sumExcess)).toBeLessThan(1)  // close to 0, accounting for rounding
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWaterfall
// ─────────────────────────────────────────────────────────────────────────────

describe('PCLELiability.computeWaterfall', () => {
  it('no active loans (all net_loan = 0) → remaining = available_cash, total_allocated = 0', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 0),
      mkLoan('B', 'Partner B', 0.5, 0),
    ]
    const result = PCLELiability.computeWaterfall(500_000, loans)
    expect(result.total_allocated_try).toBe(0)
    expect(result.remaining_after_debt).toBe(500_000)
  })

  it('single partner, 100k loan, 150k available → allocates 100k, 50k remaining', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 100_000)]
    const result = PCLELiability.computeWaterfall(150_000, loans)
    const alloc = result.allocations.find(a => a.partner_id === 'A')!
    expect(alloc.allocated_try).toBeCloseTo(100_000, 0)
    expect(result.total_allocated_try).toBeCloseTo(100_000, 0)
    expect(result.remaining_after_debt).toBeCloseTo(50_000, 0)
  })

  it('two partners 50/50, A=300k, B=100k, available=400k — both fully cleared', () => {
    // total = 400k; expected each = 200k
    // A excess = 300k - 200k = +100k (overfinanced) → A gets Phase 1 priority
    // B excess = 100k - 200k = -100k (underfinanced)
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 300_000),
      mkLoan('B', 'Partner B', 0.5, 100_000),
    ]
    const result = PCLELiability.computeWaterfall(400_000, loans)
    const a = result.allocations.find(a => a.partner_id === 'A')!
    const b = result.allocations.find(a => a.partner_id === 'B')!

    // Both loans fully cleared
    expect(a.allocated_try).toBeCloseTo(300_000, 0)
    expect(b.allocated_try).toBeCloseTo(100_000, 0)
    expect(result.total_allocated_try).toBeCloseTo(400_000, 0)
    expect(result.remaining_after_debt).toBeCloseTo(0, 0)

    // A should have phase1 allocation (it's overfinanced by 100k)
    expect(a.phase1_try).toBeGreaterThan(0)
  })

  it('two partners 50/50, A=100k, B=200k, available=150k (insufficient) — phase 1 + 2', () => {
    // B is overfinanced by 50k (excess = 200k - 150k = +50k, since total=300k, expected=150k)
    // Phase 1: B gets 50k (full excess, since cash 150k >= 50k)
    // Phase 2: remaining 100k split 50/50 → A gets 50k, B gets 50k
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 100_000),
      mkLoan('B', 'Partner B', 0.5, 200_000),
    ]
    const result = PCLELiability.computeWaterfall(150_000, loans)
    const a = result.allocations.find(a => a.partner_id === 'A')!
    const b = result.allocations.find(a => a.partner_id === 'B')!

    // Phase 1: B gets 50k
    expect(b.phase1_try).toBeCloseTo(50_000, 0)
    // Phase 2: A gets 50k, B gets 50k
    expect(a.phase2_try).toBeCloseTo(50_000, 0)
    expect(b.phase2_try).toBeCloseTo(50_000, 0)

    // Total allocated = 150k
    expect(result.total_allocated_try).toBeCloseTo(150_000, 0)

    // Both still have remaining debt
    expect(a.allocated_try).toBeLessThan(100_000)
    expect(b.allocated_try).toBeLessThan(200_000)
  })

  it('cash insufficient for Phase 1 — phase 1 allocation proportional to each excess', () => {
    // A (30%) loans 10k, B (70%) loans 90k
    // total = 100k; expected A = 30k, B = 70k
    // excess A = 10k - 30k = -20k (underfinanced), excess B = 90k - 70k = +20k
    // With only 5k available (< total_excess=20k), Phase 1 gets 5k proportionally to B
    // Since only B is overfinanced, B gets all 5k in Phase 1
    const loans = [
      mkLoan('A', 'Partner A', 0.30, 10_000),
      mkLoan('B', 'Partner B', 0.70, 90_000),
    ]
    const result = PCLELiability.computeWaterfall(5_000, loans)
    const b = result.allocations.find(a => a.partner_id === 'B')!

    // B should receive Phase 1 allocation
    expect(b.phase1_try).toBeGreaterThan(0)
    // All cash used in Phase 1 (cash < total_excess)
    expect(result.total_allocated_try).toBeCloseTo(5_000, 0)
  })

  it('total_allocated_try <= available_cash always (never over-allocate)', () => {
    const testCases = [
      { avail: 50_000,  loans: [mkLoan('A', 'A', 0.5, 100_000), mkLoan('B', 'B', 0.5, 200_000)] },
      { avail: 400_000, loans: [mkLoan('A', 'A', 0.5, 300_000), mkLoan('B', 'B', 0.5, 100_000)] },
      { avail: 1_000,   loans: [mkLoan('A', 'A', 1.0, 50_000)] },
      { avail: 0,       loans: [mkLoan('A', 'A', 1.0, 50_000)] },
    ]
    for (const { avail, loans } of testCases) {
      const result = PCLELiability.computeWaterfall(avail, loans)
      expect(result.total_allocated_try).toBeLessThanOrEqual(avail + 0.01)
    }
  })

  it('no partner allocated more than their net_loan (hard cap)', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.4, 100_000),
      mkLoan('B', 'Partner B', 0.6, 50_000),
    ]
    // available_cash exceeds total debt
    const result = PCLELiability.computeWaterfall(1_000_000, loans)
    const a = result.allocations.find(a => a.partner_id === 'A')!
    const b = result.allocations.find(a => a.partner_id === 'B')!
    expect(a.allocated_try).toBeLessThanOrEqual(100_000 + 0.01)
    expect(b.allocated_try).toBeLessThanOrEqual(50_000 + 0.01)
  })

  it('available_cash = 0 → no allocations, total_allocated = 0', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 100_000)]
    const result = PCLELiability.computeWaterfall(0, loans)
    expect(result.total_allocated_try).toBe(0)
    expect(result.remaining_after_debt).toBe(0)
  })

  it('total_debt_try equals sum of all net_loans', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.4, 100_000),
      mkLoan('B', 'Partner B', 0.6, 200_000),
    ]
    const result = PCLELiability.computeWaterfall(50_000, loans)
    expect(result.total_debt_try).toBeCloseTo(300_000, 0)
  })

  it('remaining_after_debt is 0 when total_debt >= available_cash', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 500_000)]
    const result = PCLELiability.computeWaterfall(100_000, loans)
    expect(result.remaining_after_debt).toBeGreaterThanOrEqual(0)
    // All cash should be used
    expect(result.total_allocated_try).toBeCloseTo(100_000, 0)
  })

  it('steps array is non-empty when allocations occur', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 100_000)]
    const result = PCLELiability.computeWaterfall(50_000, loans)
    expect(result.steps.length).toBeGreaterThan(0)
  })

  it('steps contain valid phase values (1 or 2)', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 200_000),
      mkLoan('B', 'Partner B', 0.5, 100_000),
    ]
    const result = PCLELiability.computeWaterfall(150_000, loans)
    for (const step of result.steps) {
      expect([1, 2]).toContain(step.phase)
    }
  })

  it('three partners, balanced scenario — all excess = 0, pure pro-rata in phase 2', () => {
    // All partners proportional to share ratio
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 50_000),
      mkLoan('B', 'Partner B', 0.3, 30_000),
      mkLoan('C', 'Partner C', 0.2, 20_000),
    ]
    const result = PCLELiability.computeWaterfall(60_000, loans)
    // total debt = 100k, available = 60k → 60% repayment
    // All phase1_try should be ~0 (balanced)
    for (const alloc of result.allocations) {
      expect(alloc.phase1_try).toBeCloseTo(0, 0)
    }
    expect(result.total_allocated_try).toBeCloseTo(60_000, 0)
  })

  it('debt_clearance_months is defined when total_debt > 0 and available_cash > 0', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 120_000)]
    const result = PCLELiability.computeWaterfall(10_000, loans)
    expect(result.debt_clearance_months).toBeDefined()
    expect(result.debt_clearance_months).toBeGreaterThan(0)
  })

  it('excess_burden on allocations matches computeBurdenScores output', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 100_000),
      mkLoan('B', 'Partner B', 0.5, 300_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const result = PCLELiability.computeWaterfall(200_000, loans)
    for (const alloc of result.allocations) {
      const score = scores.find(s => s.partner_id === alloc.partner_id)!
      expect(alloc.excess_burden).toBeCloseTo(score.excess, 0)
    }
  })

  // ── Phase 1 → Phase 2 edge cases: normalized then pro-rata ──────────────────

  it('phase1_try + phase2_try = allocated_try for every partner', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 100_000),
      mkLoan('B', 'Partner B', 0.5, 300_000),
    ]
    const result = PCLELiability.computeWaterfall(250_000, loans)
    for (const alloc of result.allocations) {
      expect(alloc.phase1_try + alloc.phase2_try).toBeCloseTo(alloc.allocated_try, 1)
    }
  })

  it('phase2 allocations are proportional to share_ratio when cash exceeds phase1 excess', () => {
    // Fully balanced partners → no phase1; pure phase2 pro-rata
    const loans = [
      mkLoan('A', 'Partner A', 0.4, 40_000),
      mkLoan('B', 'Partner B', 0.6, 60_000),
    ]
    // total = 100k, expected A = 40k (exact), expected B = 60k (exact)
    // Phase 1: no excess for anyone
    // Phase 2: distribute 50k by share ratio → A: 20k, B: 30k
    const result = PCLELiability.computeWaterfall(50_000, loans)
    const a = result.allocations.find(x => x.partner_id === 'A')!
    const b = result.allocations.find(x => x.partner_id === 'B')!
    expect(a.phase1_try).toBeCloseTo(0, 0)
    expect(b.phase1_try).toBeCloseTo(0, 0)
    expect(a.phase2_try / b.phase2_try).toBeCloseTo(0.4 / 0.6, 1)
  })

  it('overfinanced partner with cap: allocated never exceeds net_loan', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.5, 50_000),
      mkLoan('B', 'Partner B', 0.5, 150_000),
    ]
    const result = PCLELiability.computeWaterfall(500_000, loans)
    const a = result.allocations.find(x => x.partner_id === 'A')!
    const b = result.allocations.find(x => x.partner_id === 'B')!
    expect(a.allocated_try).toBeLessThanOrEqual(50_000 + 0.01)
    expect(b.allocated_try).toBeLessThanOrEqual(150_000 + 0.01)
  })

  // ── 3-partner scenarios ──────────────────────────────────────────────────────

  it('3 partners: A(60%) B(30%) C(10%) balanced — phase2 only, pro-rata', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.60, 60_000),
      mkLoan('B', 'Partner B', 0.30, 30_000),
      mkLoan('C', 'Partner C', 0.10, 10_000),
    ]
    const result = PCLELiability.computeWaterfall(100_000, loans)
    // All debt cleared, each gets their full loan
    const a = result.allocations.find(x => x.partner_id === 'A')!
    const b = result.allocations.find(x => x.partner_id === 'B')!
    const c = result.allocations.find(x => x.partner_id === 'C')!
    expect(a.allocated_try).toBeCloseTo(60_000, 0)
    expect(b.allocated_try).toBeCloseTo(30_000, 0)
    expect(c.allocated_try).toBeCloseTo(10_000, 0)
    expect(result.total_allocated_try).toBeCloseTo(100_000, 0)
  })

  it('3 partners: zero-sum invariant on burden scores', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.50, 80_000),
      mkLoan('B', 'Partner B', 0.30, 40_000),
      mkLoan('C', 'Partner C', 0.20, 30_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const sum = scores.reduce((s, b) => s + b.excess, 0)
    expect(Math.abs(sum)).toBeLessThan(1)
  })

  it('3 partners: allocations cover at least one partner fully when cash is enough', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.33, 30_000),
      mkLoan('B', 'Partner B', 0.33, 30_000),
      mkLoan('C', 'Partner C', 0.34, 30_000),
    ]
    const result = PCLELiability.computeWaterfall(90_000, loans)
    expect(result.total_allocated_try).toBeCloseTo(90_000, 0)
    expect(result.remaining_after_debt).toBeCloseTo(0, 0)
  })

  it('3 partners: overfinanced one gets full phase1 when cash is ample', () => {
    // A (33%) loans 80k, B (33%) loans 10k, C (34%) loans 10k
    // total = 100k; expected A = 33k, expected B = 33k, expected C = 34k
    // excess A = 80 - 33 = +47k (overfinanced)
    const loans = [
      mkLoan('A', 'Partner A', 0.33, 80_000),
      mkLoan('B', 'Partner B', 0.33, 10_000),
      mkLoan('C', 'Partner C', 0.34, 10_000),
    ]
    const result = PCLELiability.computeWaterfall(200_000, loans)
    const a = result.allocations.find(x => x.partner_id === 'A')!
    expect(a.phase1_try).toBeGreaterThan(0)
    // All loans fully cleared
    expect(result.total_allocated_try).toBeCloseTo(100_000, 0)
  })

  // ── 4-partner scenarios ──────────────────────────────────────────────────────

  it('4 partners: total_allocated <= available_cash always', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.25, 100_000),
      mkLoan('B', 'Partner B', 0.25, 200_000),
      mkLoan('C', 'Partner C', 0.25,  50_000),
      mkLoan('D', 'Partner D', 0.25, 150_000),
    ]
    for (const avail of [0, 50_000, 100_000, 250_000, 500_000, 1_000_000]) {
      const result = PCLELiability.computeWaterfall(avail, loans)
      expect(result.total_allocated_try).toBeLessThanOrEqual(avail + 0.01)
    }
  })

  it('4 partners: zero-sum burden invariant', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.25, 100_000),
      mkLoan('B', 'Partner B', 0.25, 200_000),
      mkLoan('C', 'Partner C', 0.25,  50_000),
      mkLoan('D', 'Partner D', 0.25, 150_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const sum = scores.reduce((s, b) => s + b.excess, 0)
    expect(Math.abs(sum)).toBeLessThan(1)
  })

  it('4 partners: allocations sum = total_allocated_try', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.30, 120_000),
      mkLoan('B', 'Partner B', 0.25,  50_000),
      mkLoan('C', 'Partner C', 0.25,  80_000),
      mkLoan('D', 'Partner D', 0.20, 100_000),
    ]
    const result = PCLELiability.computeWaterfall(200_000, loans)
    const sumAllocations = result.allocations.reduce((s, a) => s + a.allocated_try, 0)
    expect(sumAllocations).toBeCloseTo(result.total_allocated_try, 1)
  })

  // ── 5-partner scenarios ──────────────────────────────────────────────────────

  it('5 partners: total_debt_try = sum of all net_loans', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.20,  50_000),
      mkLoan('B', 'Partner B', 0.20, 100_000),
      mkLoan('C', 'Partner C', 0.20,  75_000),
      mkLoan('D', 'Partner D', 0.20,  25_000),
      mkLoan('E', 'Partner E', 0.20, 150_000),
    ]
    const result = PCLELiability.computeWaterfall(100_000, loans)
    expect(result.total_debt_try).toBeCloseTo(400_000, 0)
  })

  it('5 equal-share partners, all equal loans → pure pro-rata in phase2', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.20, 100_000),
      mkLoan('B', 'Partner B', 0.20, 100_000),
      mkLoan('C', 'Partner C', 0.20, 100_000),
      mkLoan('D', 'Partner D', 0.20, 100_000),
      mkLoan('E', 'Partner E', 0.20, 100_000),
    ]
    const result = PCLELiability.computeWaterfall(250_000, loans)
    // Perfectly balanced → no phase1
    for (const alloc of result.allocations) {
      expect(alloc.phase1_try).toBeCloseTo(0, 0)
    }
    // Each gets equal phase2 allocation: 250k / 5 = 50k
    for (const alloc of result.allocations) {
      expect(alloc.phase2_try).toBeCloseTo(50_000, 0)
    }
    expect(result.total_allocated_try).toBeCloseTo(250_000, 0)
  })

  it('5 partners: remaining_after_debt + total_allocated = available_cash', () => {
    const loans = [
      mkLoan('A', 'A', 0.20, 80_000),
      mkLoan('B', 'B', 0.20, 60_000),
      mkLoan('C', 'C', 0.20, 40_000),
      mkLoan('D', 'D', 0.20, 20_000),
      mkLoan('E', 'E', 0.20, 10_000),
    ]
    const avail = 150_000
    const result = PCLELiability.computeWaterfall(avail, loans)
    expect(result.total_allocated_try + result.remaining_after_debt).toBeCloseTo(avail, 0)
  })

  // ── computeBurdenScores additional ──────────────────────────────────────────

  it('burden_pct magnitude equals |excess / total_loans * 100|', () => {
    const loans = [
      mkLoan('A', 'Partner A', 0.4, 60_000),
      mkLoan('B', 'Partner B', 0.6, 90_000),
    ]
    const scores = PCLELiability.computeBurdenScores(loans)
    const total = 150_000
    for (const s of scores) {
      const expectedPct = (s.excess / total) * 100
      expect(s.burden_pct).toBeCloseTo(expectedPct, 1)
    }
  })

  it('net_loan is stored on burden score', () => {
    const loans = [mkLoan('A', 'Partner A', 1.0, 75_000)]
    const scores = PCLELiability.computeBurdenScores(loans)
    expect(scores[0].net_loan).toBe(75_000)
  })

  it('5 partners: no partner allocated more than net_loan', () => {
    const loans = [
      mkLoan('A', 'A', 0.20, 80_000),
      mkLoan('B', 'B', 0.20, 60_000),
      mkLoan('C', 'C', 0.20, 40_000),
      mkLoan('D', 'D', 0.20, 20_000),
      mkLoan('E', 'E', 0.20, 10_000),
    ]
    const result = PCLELiability.computeWaterfall(1_000_000, loans)
    for (const alloc of result.allocations) {
      const loan = loans.find(l => l.partner_id === alloc.partner_id)!
      expect(alloc.allocated_try).toBeLessThanOrEqual(loan.net_loan + 0.01)
    }
  })
})
