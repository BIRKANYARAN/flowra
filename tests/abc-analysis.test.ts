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
