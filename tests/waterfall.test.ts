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
})
