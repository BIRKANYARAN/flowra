/**
 * Pure function tests for lib/services/pcle/pcle.liability.ts
 * Tests: computeExcessLoan, computeProRataAllocation, normalizeShareRatios
 * Run with: npx vitest run tests/pcle-waterfall-pure.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeExcessLoan,
  computeProRataAllocation,
  normalizeShareRatios,
} from '../lib/services/pcle/pcle.liability'

// ─────────────────────────────────────────────────────────────────────────────
// computeExcessLoan
// ─────────────────────────────────────────────────────────────────────────────

describe('computeExcessLoan', () => {
  it('returns positive when partner is overfinanced', () => {
    // Ahmet has ₺800K loan, total ₺1.1M, 45% share → expected ₺495K
    // excess = 800K - 495K = 305K > 0
    const excess = computeExcessLoan(800_000, 1_100_000, 45)
    expect(excess).toBeGreaterThan(0)
    expect(excess).toBeCloseTo(800_000 - 1_100_000 * 0.45, 2)
  })

  it('returns negative when partner is underfinanced', () => {
    // Mehmet has ₺300K loan, total ₺1.1M, 35% share → expected ₺385K
    // excess = 300K - 385K = -85K < 0
    const excess = computeExcessLoan(300_000, 1_100_000, 35)
    expect(excess).toBeLessThan(0)
    expect(excess).toBeCloseTo(300_000 - 1_100_000 * 0.35, 2)
  })

  it('returns zero when partner loan equals fair share exactly', () => {
    // Total ₺100K, partner has 40% share and exactly ₺40K loan
    const excess = computeExcessLoan(40_000, 100_000, 40)
    expect(excess).toBeCloseTo(0, 5)
  })

  it('returns zero when total loans is zero', () => {
    const excess = computeExcessLoan(0, 0, 50)
    expect(excess).toBe(0)
  })

  it('returns full loan amount as excess when sharePct is 0', () => {
    // Partner with 0% share but has loan → full excess
    const excess = computeExcessLoan(100_000, 500_000, 0)
    expect(excess).toBe(100_000)
  })

  it('handles 100% share pct correctly', () => {
    // Sole partner: loan = total loans → excess = 0
    const excess = computeExcessLoan(500_000, 500_000, 100)
    expect(excess).toBeCloseTo(0, 5)
  })

  it('excess sum is approximately zero-sum across all partners', () => {
    // Three partners summing to 100%
    const total = 1_100_000
    const e1 = computeExcessLoan(800_000, total, 45) // overfinanced
    const e2 = computeExcessLoan(300_000, total, 35) // underfinanced
    const e3 = computeExcessLoan(0,       total, 20) // no loan
    expect(e1 + e2 + e3).toBeCloseTo(0, 2)
  })

  it('scales linearly with total loans', () => {
    const excess1 = computeExcessLoan(800, 1_000, 45)
    const excess2 = computeExcessLoan(800_000, 1_000_000, 45)
    expect(excess2).toBeCloseTo(excess1 * 1000, 2)
  })

  it('handles decimal share percentages', () => {
    const excess = computeExcessLoan(33_333, 100_000, 33.333)
    expect(Math.abs(excess)).toBeLessThan(1)
  })

  it('works with small amounts (< ₺1)', () => {
    const excess = computeExcessLoan(0.8, 1.1, 45)
    expect(excess).toBeCloseTo(0.8 - 1.1 * 0.45, 8)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeProRataAllocation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeProRataAllocation', () => {
  it('allocates proportionally when cash is sufficient', () => {
    // Partner has 45% of active ratio (total ratio = 1), cash = ₺100K
    // entitled = 100K * 0.45/1 = 45K; cap at partnerLoan = 800K → 45K
    const alloc = computeProRataAllocation(800_000, 0.45, 1.0, 100_000)
    expect(alloc).toBeCloseTo(45_000, 2)
  })

  it('caps allocation at partner loan (hard cap)', () => {
    // Partner loan = ₺50K, but cash × ratio > loan
    const alloc = computeProRataAllocation(50_000, 0.9, 1.0, 1_000_000)
    expect(alloc).toBe(50_000)
  })

  it('returns 0 when partner loan is zero', () => {
    const alloc = computeProRataAllocation(0, 0.20, 1.0, 500_000)
    expect(alloc).toBe(0)
  })

  it('returns 0 when total active ratio is zero', () => {
    const alloc = computeProRataAllocation(100_000, 0.5, 0, 200_000)
    expect(alloc).toBe(0)
  })

  it('returns 0 when remaining cash is zero', () => {
    const alloc = computeProRataAllocation(100_000, 0.5, 1.0, 0)
    expect(alloc).toBe(0)
  })

  it('allocates full cash when only one active partner', () => {
    // Only one active partner with ratio = 1 and large loan
    const alloc = computeProRataAllocation(1_000_000, 1.0, 1.0, 500_000)
    expect(alloc).toBe(500_000)
  })

  it('normalizes ratios correctly when totalActiveRatio < 1', () => {
    // Two partners both with ratio 0.35, totalActiveRatio = 0.7
    // Each gets 0.35/0.7 = 50% of cash
    const cash   = 100_000
    const alloc1 = computeProRataAllocation(1_000_000, 0.35, 0.70, cash)
    expect(alloc1).toBeCloseTo(50_000, 2)
  })

  it('two partners share splits sum to available cash (no cap case)', () => {
    const cash          = 100_000
    const totalRatio    = 0.80  // Fatma excluded (loan=0)
    const allocAhmet    = computeProRataAllocation(800_000, 0.45, totalRatio, cash)
    const allocMehmet   = computeProRataAllocation(300_000, 0.35, totalRatio, cash)
    expect(allocAhmet + allocMehmet).toBeCloseTo(cash, 2)
  })

  it('does not over-allocate beyond partner loan', () => {
    const alloc = computeProRataAllocation(1_000, 0.99, 1.0, 1_000_000)
    expect(alloc).toBeLessThanOrEqual(1_000)
  })

  it('handles tiny amounts without floating-point explosion', () => {
    const alloc = computeProRataAllocation(0.01, 0.5, 1.0, 0.02)
    expect(alloc).toBeCloseTo(0.01, 8)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// normalizeShareRatios
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeShareRatios', () => {
  it('sums to 1 for all active partners', () => {
    const partners = [
      { share_pct: 45, loan: 800_000 },
      { share_pct: 35, loan: 300_000 },
      { share_pct: 20, loan: 0       },
    ]
    const ratios = normalizeShareRatios(partners)
    const sum    = ratios.reduce((s, r) => s + r, 0)
    expect(sum).toBeCloseTo(1, 10)
  })

  it('assigns 0 to partners with loan = 0', () => {
    const partners = [
      { share_pct: 45, loan: 800_000 },
      { share_pct: 35, loan: 300_000 },
      { share_pct: 20, loan: 0       },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios[2]).toBe(0)
  })

  it('assigns positive ratios to partners with loan > 0', () => {
    const partners = [
      { share_pct: 45, loan: 800_000 },
      { share_pct: 35, loan: 300_000 },
      { share_pct: 20, loan: 0       },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios[0]).toBeGreaterThan(0)
    expect(ratios[1]).toBeGreaterThan(0)
  })

  it('returns all zeros when all loans are zero', () => {
    const partners = [
      { share_pct: 45, loan: 0 },
      { share_pct: 35, loan: 0 },
      { share_pct: 20, loan: 0 },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios.every(r => r === 0)).toBe(true)
  })

  it('returns [1] when only one active partner', () => {
    const partners = [
      { share_pct: 45, loan: 500_000 },
      { share_pct: 35, loan: 0       },
      { share_pct: 20, loan: 0       },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios[0]).toBeCloseTo(1, 10)
    expect(ratios[1]).toBe(0)
    expect(ratios[2]).toBe(0)
  })

  it('preserves relative proportions for active partners', () => {
    // Ahmet 45, Mehmet 35 → active total = 80
    // normalized: Ahmet = 45/80 = 0.5625, Mehmet = 35/80 = 0.4375
    const partners = [
      { share_pct: 45, loan: 800_000 },
      { share_pct: 35, loan: 300_000 },
      { share_pct: 20, loan: 0       },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios[0]).toBeCloseTo(45 / 80, 10)
    expect(ratios[1]).toBeCloseTo(35 / 80, 10)
  })

  it('handles equal shares symmetrically', () => {
    const partners = [
      { share_pct: 50, loan: 100_000 },
      { share_pct: 50, loan: 100_000 },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios[0]).toBeCloseTo(0.5, 10)
    expect(ratios[1]).toBeCloseTo(0.5, 10)
  })

  it('handles single-partner array', () => {
    const partners = [{ share_pct: 100, loan: 500_000 }]
    const ratios   = normalizeShareRatios(partners)
    expect(ratios[0]).toBeCloseTo(1, 10)
  })

  it('length of output matches length of input', () => {
    const partners = [
      { share_pct: 30, loan: 100 },
      { share_pct: 30, loan: 200 },
      { share_pct: 20, loan: 0   },
      { share_pct: 20, loan: 300 },
    ]
    const ratios = normalizeShareRatios(partners)
    expect(ratios).toHaveLength(4)
  })

  it('returns all zeros for empty array', () => {
    const ratios = normalizeShareRatios([])
    expect(ratios).toHaveLength(0)
    expect(ratios.every(r => r === 0)).toBe(true)
  })
})
