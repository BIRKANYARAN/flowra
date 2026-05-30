// ─────────────────────────────────────────────────────────────────────────────
// tests/inventory-management.test.ts
//
// Pure-function tests for the three new helpers added to abc-analysis.service:
//   • computeRevConcentration
//   • classifyVelocity
//   • computeWeeksOfStock
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeRevConcentration,
  classifyVelocity,
  computeWeeksOfStock,
} from '../lib/services/inventory/abc-analysis.service'

// ── computeRevConcentration ──────────────────────────────────────────────────

describe('computeRevConcentration', () => {
  it('returns 0 for an empty array', () => {
    expect(computeRevConcentration([], 3)).toBe(0)
  })

  it('returns 0 when total revenue is 0', () => {
    expect(computeRevConcentration([0, 0, 0], 2)).toBe(0)
  })

  it('returns 100 when top-1 is entire revenue (single product)', () => {
    expect(computeRevConcentration([500], 1)).toBe(100)
  })

  it('returns correct % for top-1 of equal revenues', () => {
    // 4 products each 100 → top 1 = 25%
    expect(computeRevConcentration([100, 100, 100, 100], 1)).toBeCloseTo(25, 5)
  })

  it('returns correct % for top-2 of equal revenues', () => {
    // 4 × 100 → top 2 = 50%
    expect(computeRevConcentration([100, 100, 100, 100], 2)).toBeCloseTo(50, 5)
  })

  it('returns correct % for top-3 of equal revenues', () => {
    // 4 × 100 → top 3 = 75%
    expect(computeRevConcentration([100, 100, 100, 100], 3)).toBeCloseTo(75, 5)
  })

  it('handles n > array length by summing all', () => {
    // n larger than array → should use whole array → 100%
    expect(computeRevConcentration([200, 100, 50], 10)).toBeCloseTo(100, 5)
  })

  it('returns correct % for Pareto-like distribution (80/20)', () => {
    // revenues: [800, 100, 60, 40] → total 1000; top 1 = 80%
    const revenues = [800, 100, 60, 40]
    expect(computeRevConcentration(revenues, 1)).toBeCloseTo(80, 5)
  })

  it('top-2 concentration for Pareto-like distribution', () => {
    // [800, 100, 60, 40] → top 2 = 900/1000 = 90%
    const revenues = [800, 100, 60, 40]
    expect(computeRevConcentration(revenues, 2)).toBeCloseTo(90, 5)
  })

  it('returns 100 when n equals array length', () => {
    expect(computeRevConcentration([300, 200, 100], 3)).toBeCloseTo(100, 5)
  })

  it('handles n=0 by returning 0 (no products selected)', () => {
    // slice(0, 0) → empty sum → 0 / total
    expect(computeRevConcentration([100, 200, 300], 0)).toBe(0)
  })

  it('works with a single-product array at n=1', () => {
    expect(computeRevConcentration([12_345], 1)).toBeCloseTo(100, 5)
  })

  it('correctly handles floating-point revenues', () => {
    const revenues = [33.33, 33.33, 33.34]
    expect(computeRevConcentration(revenues, 1)).toBeCloseTo(33.34 / 100 * 100, 0)
  })
})

// ── classifyVelocity ─────────────────────────────────────────────────────────

describe('classifyVelocity', () => {
  // --- dead boundary ---
  it('classifies 0 as dead', () => {
    expect(classifyVelocity(0)).toBe('dead')
  })

  it('classifies exactly 0.1 as dead (boundary inclusive)', () => {
    // rule: dead ≤ 0.1 → 0.1 is dead
    expect(classifyVelocity(0.1)).toBe('dead')
  })

  it('classifies 0.05 as dead', () => {
    expect(classifyVelocity(0.05)).toBe('dead')
  })

  it('classifies value just above 0.1 as slow', () => {
    expect(classifyVelocity(0.101)).toBe('slow')
  })

  // --- slow boundary ---
  it('classifies 0.5 as slow', () => {
    expect(classifyVelocity(0.5)).toBe('slow')
  })

  it('classifies exactly 1.0 as slow (boundary: slow > 0.1, ≤ 1)', () => {
    // medium is > 1, so exactly 1 is still slow
    expect(classifyVelocity(1.0)).toBe('slow')
  })

  it('classifies value just above 1.0 as medium', () => {
    expect(classifyVelocity(1.001)).toBe('medium')
  })

  // --- medium boundary ---
  it('classifies 2 as medium', () => {
    expect(classifyVelocity(2)).toBe('medium')
  })

  it('classifies exactly 5.0 as medium (boundary: fast > 5)', () => {
    // fast is > 5, so 5 is still medium
    expect(classifyVelocity(5.0)).toBe('medium')
  })

  it('classifies value just above 5.0 as fast', () => {
    expect(classifyVelocity(5.001)).toBe('fast')
  })

  // --- fast ---
  it('classifies 8 as fast', () => {
    expect(classifyVelocity(8)).toBe('fast')
  })

  it('classifies 100 as fast', () => {
    expect(classifyVelocity(100)).toBe('fast')
  })

  it('classifies negative velocity as dead', () => {
    // Negative velocity is nonsensical; should fall through to dead (≤ 0.1)
    expect(classifyVelocity(-1)).toBe('dead')
  })
})

// ── computeWeeksOfStock ──────────────────────────────────────────────────────

describe('computeWeeksOfStock', () => {
  it('returns null when dailyVelocity is 0', () => {
    expect(computeWeeksOfStock(100, 0)).toBeNull()
  })

  it('returns null when dailyVelocity is negative', () => {
    expect(computeWeeksOfStock(100, -1)).toBeNull()
  })

  it('returns 0 weeks when stock is 0 and velocity is positive', () => {
    expect(computeWeeksOfStock(0, 2)).toBe(0)
  })

  it('computes correct weeks: 70 units / (10/day * 7 days/week) = 1 week', () => {
    expect(computeWeeksOfStock(70, 10)).toBeCloseTo(1, 5)
  })

  it('computes correct weeks: 140 units / (10/day * 7) = 2 weeks', () => {
    expect(computeWeeksOfStock(140, 10)).toBeCloseTo(2, 5)
  })

  it('computes correct weeks: 7 units / (0.5/day * 7) = 2 weeks', () => {
    expect(computeWeeksOfStock(7, 0.5)).toBeCloseTo(2, 5)
  })

  it('returns fractional weeks correctly', () => {
    // 10 units at 2/day → 10 / (2*7) = 10/14 ≈ 0.714 weeks
    const result = computeWeeksOfStock(10, 2)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10 / 14, 5)
  })

  it('handles large quantities accurately', () => {
    // 10,000 units at 5/day → 10000 / (5*7) ≈ 285.7 weeks
    const result = computeWeeksOfStock(10_000, 5)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10_000 / 35, 3)
  })

  it('formula is qty / (velocity * 7)', () => {
    const qty      = 315
    const velocity = 4.5
    const expected = qty / (velocity * 7)
    expect(computeWeeksOfStock(qty, velocity)).toBeCloseTo(expected, 8)
  })

  it('very slow velocity produces many weeks of stock', () => {
    // 200 units at 0.11/day → 200 / (0.11*7) ≈ 259.7 weeks
    const result = computeWeeksOfStock(200, 0.11)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(200)
  })

  it('returns null for zero velocity regardless of high stock', () => {
    expect(computeWeeksOfStock(999_999, 0)).toBeNull()
  })

  it('returns close to zero for tiny stock and high velocity', () => {
    // 1 unit at 100/day → 1 / 700 ≈ 0.00143 weeks
    const result = computeWeeksOfStock(1, 100)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(1 / 700, 6)
  })
})
