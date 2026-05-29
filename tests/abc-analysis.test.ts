// ─────────────────────────────────────────────────────────────────────────────
// tests/abc-analysis.test.ts
//
// Unit tests for the pure helper functions in abc-analysis.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  assignAbcTier,
  computeTopNRevenuePct,
  abcTierToScore,
  computeInventoryEfficiency,
  classifyInventoryEfficiency,
} from '../lib/services/inventory/abc-analysis.service'

// ── assignAbcTier ─────────────────────────────────────────────────────────────

describe('assignAbcTier', () => {
  it('returns A for exactly 80% (boundary)', () => {
    expect(assignAbcTier(80)).toBe('A')
  })

  it('returns A for 0% (first product always A)', () => {
    expect(assignAbcTier(0)).toBe('A')
  })

  it('returns A for 50%', () => {
    expect(assignAbcTier(50)).toBe('A')
  })

  it('returns B for 80.001% (just over A boundary)', () => {
    expect(assignAbcTier(80.001)).toBe('B')
  })

  it('returns B for exactly 95% (boundary)', () => {
    expect(assignAbcTier(95)).toBe('B')
  })

  it('returns B for 90%', () => {
    expect(assignAbcTier(90)).toBe('B')
  })

  it('returns C for 95.001% (just over B boundary)', () => {
    expect(assignAbcTier(95.001)).toBe('C')
  })

  it('returns C for 100%', () => {
    expect(assignAbcTier(100)).toBe('C')
  })
})

// ── computeTopNRevenuePct ─────────────────────────────────────────────────────

describe('computeTopNRevenuePct', () => {
  it('returns 0 for empty array', () => {
    expect(computeTopNRevenuePct([], 1)).toBe(0)
  })

  it('returns 0 when all revenues are 0', () => {
    expect(computeTopNRevenuePct([0, 0, 0], 2)).toBe(0)
  })

  it('computes top-1 of 3 correctly', () => {
    // [600, 300, 100] total=1000  top-1=600 → 60%
    const result = computeTopNRevenuePct([600, 300, 100], 1)
    expect(result).toBeCloseTo(60, 5)
  })

  it('computes top-2 of 3 correctly', () => {
    // [600, 300, 100] total=1000  top-2=900 → 90%
    const result = computeTopNRevenuePct([600, 300, 100], 2)
    expect(result).toBeCloseTo(90, 5)
  })

  it('computes all products (n === length) = 100%', () => {
    const result = computeTopNRevenuePct([600, 300, 100], 3)
    expect(result).toBeCloseTo(100, 5)
  })

  it('clamps n > length to full array', () => {
    const result = computeTopNRevenuePct([500, 500], 10)
    expect(result).toBeCloseTo(100, 5)
  })
})

// ── abcTierToScore ────────────────────────────────────────────────────────────

describe('abcTierToScore', () => {
  it('returns 100 for A', () => {
    expect(abcTierToScore('A')).toBe(100)
  })

  it('returns 60 for B', () => {
    expect(abcTierToScore('B')).toBe(60)
  })

  it('returns 20 for C', () => {
    expect(abcTierToScore('C')).toBe(20)
  })
})

// ── computeInventoryEfficiency ────────────────────────────────────────────────

describe('computeInventoryEfficiency', () => {
  it('returns null when revenue is 0', () => {
    expect(computeInventoryEfficiency(50_000, 0)).toBeNull()
  })

  it('returns null when revenue is 0 and stock is also 0', () => {
    expect(computeInventoryEfficiency(0, 0)).toBeNull()
  })

  it('computes correctly for stock = revenue (100%)', () => {
    // 100_000 / 100_000 × 100 = 100
    expect(computeInventoryEfficiency(100_000, 100_000)).toBeCloseTo(100, 5)
  })

  it('computes correctly for under-invested case (<50)', () => {
    // 20_000 / 100_000 × 100 = 20
    expect(computeInventoryEfficiency(20_000, 100_000)).toBeCloseTo(20, 5)
  })

  it('computes correctly for over-invested case (150%)', () => {
    // 150_000 / 100_000 × 100 = 150
    expect(computeInventoryEfficiency(150_000, 100_000)).toBeCloseTo(150, 5)
  })

  it('computes correctly for excessive case (300%)', () => {
    // 300_000 / 100_000 × 100 = 300
    expect(computeInventoryEfficiency(300_000, 100_000)).toBeCloseTo(300, 5)
  })
})

// ── classifyInventoryEfficiency ───────────────────────────────────────────────

describe('classifyInventoryEfficiency', () => {
  it('returns unknown for null input', () => {
    expect(classifyInventoryEfficiency(null)).toBe('unknown')
  })

  it('returns under_invested for value < 50', () => {
    expect(classifyInventoryEfficiency(30)).toBe('under_invested')
  })

  it('returns under_invested for value just below 50 (49.99)', () => {
    expect(classifyInventoryEfficiency(49.99)).toBe('under_invested')
  })

  it('returns optimal for exactly 50 (lower boundary)', () => {
    expect(classifyInventoryEfficiency(50)).toBe('optimal')
  })

  it('returns optimal for value between 50 and 100', () => {
    expect(classifyInventoryEfficiency(75)).toBe('optimal')
  })

  it('returns optimal for exactly 100 (upper boundary)', () => {
    expect(classifyInventoryEfficiency(100)).toBe('optimal')
  })

  it('returns over_invested for value between 100 and 200 exclusive', () => {
    expect(classifyInventoryEfficiency(150)).toBe('over_invested')
  })

  it('returns over_invested for value just above 100 (100.01)', () => {
    expect(classifyInventoryEfficiency(100.01)).toBe('over_invested')
  })

  it('returns over_invested for exactly 200 (upper boundary of over_invested)', () => {
    expect(classifyInventoryEfficiency(200)).toBe('over_invested')
  })

  it('returns excessive for value just above 200 (200.01)', () => {
    expect(classifyInventoryEfficiency(200.01)).toBe('excessive')
  })

  it('returns excessive for value 500', () => {
    expect(classifyInventoryEfficiency(500)).toBe('excessive')
  })
})

// ── assignAbcTier — additional boundary precision ─────────────────────────────

describe('assignAbcTier — extended boundary checks', () => {

  // A tier: 0 to exactly 80
  it('returns A for exactly 0', () => {
    expect(assignAbcTier(0)).toBe('A')
  })

  it('returns A for 79.999 (just under 80)', () => {
    expect(assignAbcTier(79.999)).toBe('A')
  })

  it('returns A for 40 (midpoint of A range)', () => {
    expect(assignAbcTier(40)).toBe('A')
  })

  // B tier: 80.001 to exactly 95
  it('returns B for 82', () => {
    expect(assignAbcTier(82)).toBe('B')
  })

  it('returns B for 88 (midpoint of B range)', () => {
    expect(assignAbcTier(88)).toBe('B')
  })

  it('returns B for 94.999 (just under 95)', () => {
    expect(assignAbcTier(94.999)).toBe('B')
  })

  // C tier: above 95
  it('returns C for 96', () => {
    expect(assignAbcTier(96)).toBe('C')
  })

  it('returns C for 99.9', () => {
    expect(assignAbcTier(99.9)).toBe('C')
  })

  it('returns C for exactly 100', () => {
    expect(assignAbcTier(100)).toBe('C')
  })
})

// ── computeTopNRevenuePct — additional cases ──────────────────────────────────

describe('computeTopNRevenuePct — sorting assumption and precision', () => {

  // n=0 → 0% (no items taken)
  it('returns 0 for n=0', () => {
    const result = computeTopNRevenuePct([500, 300, 200], 0)
    expect(result).toBe(0)
  })

  // Single item array, top-1
  it('single item [1000], n=1 → 100%', () => {
    const result = computeTopNRevenuePct([1000], 1)
    expect(result).toBeCloseTo(100, 5)
  })

  // Two equal items, top-1 → 50%
  it('[500, 500], n=1 → 50%', () => {
    const result = computeTopNRevenuePct([500, 500], 1)
    expect(result).toBeCloseTo(50, 5)
  })

  // n > length — slice doesn't throw, uses all items
  it('n larger than array length → 100%', () => {
    const result = computeTopNRevenuePct([100, 200, 300], 100)
    expect(result).toBeCloseTo(100, 5)
  })

  // Top 3 of 5: [300, 200, 100, 80, 20] → total=700, top3=600 → 85.71%
  it('[300, 200, 100, 80, 20] top-3 → 85.71%', () => {
    const result = computeTopNRevenuePct([300, 200, 100, 80, 20], 3)
    expect(result).toBeCloseTo(85.71, 1)
  })

  // Fractional revenues
  it('[33.33, 33.33, 33.34], n=1 → 33.34%', () => {
    const result = computeTopNRevenuePct([33.34, 33.33, 33.33], 1)
    expect(result).toBeCloseTo(33.34, 1)
  })

  // All zeros → 0 regardless of n
  it('all zeros, n=2 → 0', () => {
    expect(computeTopNRevenuePct([0, 0, 0, 0], 2)).toBe(0)
  })

  // Large values don't lose precision
  it('[1_000_000, 500_000, 250_000], n=2 → 85.71%', () => {
    const result = computeTopNRevenuePct([1_000_000, 500_000, 250_000], 2)
    expect(result).toBeCloseTo(85.71, 1)
  })
})

// ── abcTierToScore — all values, type safety ──────────────────────────────────

describe('abcTierToScore — exhaustive', () => {

  it('A → 100 (integer)', () => {
    expect(abcTierToScore('A')).toBe(100)
  })

  it('B → 60 (integer)', () => {
    expect(abcTierToScore('B')).toBe(60)
  })

  it('C → 20 (integer)', () => {
    expect(abcTierToScore('C')).toBe(20)
  })

  // Verify A > B > C ordering
  it('A score > B score > C score', () => {
    expect(abcTierToScore('A')).toBeGreaterThan(abcTierToScore('B'))
    expect(abcTierToScore('B')).toBeGreaterThan(abcTierToScore('C'))
  })

  // All scores are positive
  it('all scores are positive integers', () => {
    expect(abcTierToScore('A')).toBeGreaterThan(0)
    expect(abcTierToScore('B')).toBeGreaterThan(0)
    expect(abcTierToScore('C')).toBeGreaterThan(0)
  })
})

// ── computeInventoryEfficiency — precision and special values ─────────────────

describe('computeInventoryEfficiency — additional cases', () => {

  // Very small stock vs large revenue
  it('stock=1, revenue=1_000_000 → 0.0001% (very small)', () => {
    const result = computeInventoryEfficiency(1, 1_000_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0.0001, 4)
  })

  // Very large stock vs small revenue → large ratio
  it('stock=1_000_000, revenue=100 → 1_000_000%', () => {
    const result = computeInventoryEfficiency(1_000_000, 100)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1_000_000, 0)
  })

  // Zero stock, nonzero revenue → 0%
  it('stock=0, revenue=50_000 → 0%', () => {
    const result = computeInventoryEfficiency(0, 50_000)
    expect(result).not.toBeNull()
    expect(result!).toBe(0)
  })

  // Exactly at optimal lower boundary (50%)
  it('stock=50_000, revenue=100_000 → 50% (optimal boundary)', () => {
    const result = computeInventoryEfficiency(50_000, 100_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(50, 5)
  })

  // Exactly at over_invested boundary (200%)
  it('stock=200_000, revenue=100_000 → 200%', () => {
    const result = computeInventoryEfficiency(200_000, 100_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(200, 5)
  })

  // Nonzero revenue, nonzero stock at 75% (optimal midpoint)
  it('stock=75_000, revenue=100_000 → 75%', () => {
    const result = computeInventoryEfficiency(75_000, 100_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(75, 5)
  })
})

// ── classifyInventoryEfficiency — additional mid-range values ─────────────────

describe('classifyInventoryEfficiency — extended mid-range', () => {

  // 0% → under_invested
  it('returns under_invested for 0', () => {
    expect(classifyInventoryEfficiency(0)).toBe('under_invested')
  })

  // 25% → under_invested
  it('returns under_invested for 25', () => {
    expect(classifyInventoryEfficiency(25)).toBe('under_invested')
  })

  // 50% (lower optimal boundary) → optimal
  it('returns optimal for 50 (lower boundary)', () => {
    expect(classifyInventoryEfficiency(50)).toBe('optimal')
  })

  // 60% → optimal
  it('returns optimal for 60', () => {
    expect(classifyInventoryEfficiency(60)).toBe('optimal')
  })

  // 80% → optimal
  it('returns optimal for 80', () => {
    expect(classifyInventoryEfficiency(80)).toBe('optimal')
  })

  // 100% (upper optimal boundary) → optimal
  it('returns optimal for 100 (upper boundary)', () => {
    expect(classifyInventoryEfficiency(100)).toBe('optimal')
  })

  // 101% → over_invested
  it('returns over_invested for 101', () => {
    expect(classifyInventoryEfficiency(101)).toBe('over_invested')
  })

  // 150% → over_invested
  it('returns over_invested for 150', () => {
    expect(classifyInventoryEfficiency(150)).toBe('over_invested')
  })

  // 200% → over_invested (at boundary)
  it('returns over_invested for 200', () => {
    expect(classifyInventoryEfficiency(200)).toBe('over_invested')
  })

  // 201% → excessive
  it('returns excessive for 201', () => {
    expect(classifyInventoryEfficiency(201)).toBe('excessive')
  })

  // 1000% → excessive
  it('returns excessive for 1000', () => {
    expect(classifyInventoryEfficiency(1000)).toBe('excessive')
  })

  // null always returns unknown
  it('null → unknown (no change)', () => {
    expect(classifyInventoryEfficiency(null)).toBe('unknown')
  })
})

// ── assignAbcTier — exact decimal boundary precision ─────────────────────────

describe('assignAbcTier — exact decimal boundary precision', () => {
  it('returns A for 79.9 (below the 80 boundary)', () => {
    expect(assignAbcTier(79.9)).toBe('A')
  })

  it('returns B for 80.0 (exactly at A/B boundary, rule: <=80 → A, so 80 → A)', () => {
    // Rule: <= 80 → A. So 80.0 itself is A.
    expect(assignAbcTier(80.0)).toBe('A')
  })

  it('returns B for 80.1 (just above A boundary)', () => {
    expect(assignAbcTier(80.1)).toBe('B')
  })

  it('returns B for 94.9 (just below 95 boundary)', () => {
    expect(assignAbcTier(94.9)).toBe('B')
  })

  it('returns B for 95.0 (exactly at B/C boundary, rule: <=95 → B, so 95 → B)', () => {
    // Rule: <= 95 → B. So 95.0 itself is B.
    expect(assignAbcTier(95.0)).toBe('B')
  })

  it('returns C for 95.1 (just above 95 boundary)', () => {
    expect(assignAbcTier(95.1)).toBe('C')
  })

  it('A score > B score confirms A is higher priority', () => {
    expect(abcTierToScore('A')).toBeGreaterThan(abcTierToScore('B'))
  })

  it('B score > C score confirms B is higher priority', () => {
    expect(abcTierToScore('B')).toBeGreaterThan(abcTierToScore('C'))
  })
})

// ── computeTopNRevenuePct — top-1 of many and formula verification ────────────

describe('computeTopNRevenuePct — top-1 of many and formula', () => {
  it('top-1 of a 10-item array equals first item / total × 100', () => {
    const revenues = [500, 400, 300, 200, 100, 90, 80, 70, 60, 50]
    const total = revenues.reduce((s, v) => s + v, 0)  // 1850
    const expected = (500 / total) * 100
    expect(computeTopNRevenuePct(revenues, 1)).toBeCloseTo(expected, 4)
  })

  it('top-3 of 10 uses only first 3 items in descending array', () => {
    const revenues = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]
    const total = revenues.reduce((s, v) => s + v, 0)  // 550
    const expected = (100 + 90 + 80) / total * 100
    expect(computeTopNRevenuePct(revenues, 3)).toBeCloseTo(expected, 4)
  })

  it('returns 100 when n equals array length', () => {
    expect(computeTopNRevenuePct([200, 300, 500], 3)).toBeCloseTo(100, 5)
  })

  it('two-item equal split: top-1 → 50%', () => {
    expect(computeTopNRevenuePct([1000, 1000], 1)).toBeCloseTo(50, 5)
  })

  it('formula: (sum of top-n) / total × 100', () => {
    // [600, 250, 150], n=2 → (600+250)/1000 × 100 = 85%
    expect(computeTopNRevenuePct([600, 250, 150], 2)).toBeCloseTo(85, 5)
  })
})

// ── abcTierToScore — numeric values confirmed ─────────────────────────────────

describe('abcTierToScore — numeric values confirmed', () => {
  it('A returns exactly 100', () => {
    expect(abcTierToScore('A')).toBe(100)
  })

  it('B returns exactly 60', () => {
    expect(abcTierToScore('B')).toBe(60)
  })

  it('C returns exactly 20', () => {
    expect(abcTierToScore('C')).toBe(20)
  })

  it('the difference between A and B is 40', () => {
    expect(abcTierToScore('A') - abcTierToScore('B')).toBe(40)
  })

  it('the difference between B and C is 40', () => {
    expect(abcTierToScore('B') - abcTierToScore('C')).toBe(40)
  })
})

// ── computeInventoryEfficiency — formula verification ─────────────────────────

describe('computeInventoryEfficiency — formula verification', () => {
  it('formula: (stockValue / revenue) × 100', () => {
    // 80000 / 200000 × 100 = 40
    const result = computeInventoryEfficiency(80_000, 200_000)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(40, 5)
  })

  it('result doubles when stock value doubles', () => {
    const r1 = computeInventoryEfficiency(50_000, 100_000)
    const r2 = computeInventoryEfficiency(100_000, 100_000)
    expect(r2!).toBeCloseTo(r1! * 2, 5)
  })

  it('result halves when revenue doubles', () => {
    const r1 = computeInventoryEfficiency(50_000, 100_000)
    const r2 = computeInventoryEfficiency(50_000, 200_000)
    expect(r2!).toBeCloseTo(r1! / 2, 5)
  })
})

// ── classifyInventoryEfficiency — all five levels confirmed ───────────────────

describe('classifyInventoryEfficiency — all five classification levels', () => {
  it('null input → unknown', () => {
    expect(classifyInventoryEfficiency(null)).toBe('unknown')
  })

  it('value 0 → under_invested', () => {
    expect(classifyInventoryEfficiency(0)).toBe('under_invested')
  })

  it('value 49 → under_invested', () => {
    expect(classifyInventoryEfficiency(49)).toBe('under_invested')
  })

  it('value 50 → optimal (inclusive lower bound)', () => {
    expect(classifyInventoryEfficiency(50)).toBe('optimal')
  })

  it('value 75 → optimal (midpoint)', () => {
    expect(classifyInventoryEfficiency(75)).toBe('optimal')
  })

  it('value 100 → optimal (inclusive upper bound)', () => {
    expect(classifyInventoryEfficiency(100)).toBe('optimal')
  })

  it('value 101 → over_invested (just above optimal upper bound)', () => {
    expect(classifyInventoryEfficiency(101)).toBe('over_invested')
  })

  it('value 175 → over_invested (midpoint)', () => {
    expect(classifyInventoryEfficiency(175)).toBe('over_invested')
  })

  it('value 200 → over_invested (inclusive upper bound of over_invested)', () => {
    expect(classifyInventoryEfficiency(200)).toBe('over_invested')
  })

  it('value 201 → excessive (just above over_invested upper bound)', () => {
    expect(classifyInventoryEfficiency(201)).toBe('excessive')
  })

  it('value 999 → excessive (well above boundary)', () => {
    expect(classifyInventoryEfficiency(999)).toBe('excessive')
  })
})
