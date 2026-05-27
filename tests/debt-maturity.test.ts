/**
 * Debt Maturity Service — pure-logic unit tests
 *
 * Tests for assignMaturityBucket, computeDaysUntilDue,
 * computeRefinancingScore, and computeNext12mPct.
 *
 * Run: npx vitest run tests/debt-maturity.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  assignMaturityBucket,
  computeDaysUntilDue,
  computeRefinancingScore,
  computeNext12mPct,
} from '../lib/services/pcle/debt-maturity.service'

// ── assignMaturityBucket ──────────────────────────────────────────────────────

describe('assignMaturityBucket', () => {
  it('null → extended (undated loans are not imminent)', () => {
    expect(assignMaturityBucket(null)).toBe('extended')
  })

  it('-5 → overdue', () => {
    expect(assignMaturityBucket(-5)).toBe('overdue')
  })

  it('0 → immediate', () => {
    expect(assignMaturityBucket(0)).toBe('immediate')
  })

  it('30 → immediate (boundary)', () => {
    expect(assignMaturityBucket(30)).toBe('immediate')
  })

  it('31 → short (first day outside immediate)', () => {
    expect(assignMaturityBucket(31)).toBe('short')
  })

  it('90 → short (boundary)', () => {
    expect(assignMaturityBucket(90)).toBe('short')
  })

  it('91 → medium (first day outside short)', () => {
    expect(assignMaturityBucket(91)).toBe('medium')
  })

  it('365 → medium (boundary)', () => {
    expect(assignMaturityBucket(365)).toBe('medium')
  })

  it('366 → long (first day outside medium)', () => {
    expect(assignMaturityBucket(366)).toBe('long')
  })

  it('1095 → long (exactly 3 years)', () => {
    expect(assignMaturityBucket(1095)).toBe('long')
  })

  it('1096 → extended (> 3 years)', () => {
    expect(assignMaturityBucket(1096)).toBe('extended')
  })

  it('-1 → overdue (yesterday)', () => {
    expect(assignMaturityBucket(-1)).toBe('overdue')
  })
})

// ── computeDaysUntilDue ───────────────────────────────────────────────────────

describe('computeDaysUntilDue', () => {
  it('5 days in the future', () => {
    expect(computeDaysUntilDue('2026-06-01', '2026-05-27')).toBe(5)
  })

  it('null due date → null', () => {
    expect(computeDaysUntilDue(null, '2026-05-27')).toBeNull()
  })

  it('past due date → negative (overdue)', () => {
    expect(computeDaysUntilDue('2026-05-20', '2026-05-27')).toBe(-7)
  })

  it('same day → 0', () => {
    expect(computeDaysUntilDue('2026-05-27', '2026-05-27')).toBe(0)
  })

  it('exactly 30 days → 30', () => {
    expect(computeDaysUntilDue('2026-06-26', '2026-05-27')).toBe(30)
  })

  it('exactly 365 days from May 27 2026 → 365', () => {
    expect(computeDaysUntilDue('2027-05-27', '2026-05-27')).toBe(365)
  })
})

// ── computeRefinancingScore ───────────────────────────────────────────────────

describe('computeRefinancingScore', () => {
  it('empty tranches → 100 (no pressure)', () => {
    expect(computeRefinancingScore([])).toBe(100)
  })

  it('all tranches due immediately (≤ 30d) → score near 0', () => {
    const tranches = [
      { outstanding_try: 100_000, days: 0 },
      { outstanding_try: 50_000, days: 15 },
    ]
    expect(computeRefinancingScore(tranches)).toBe(0)
  })

  it('all tranches extended (null days) → 100', () => {
    const tranches = [
      { outstanding_try: 200_000, days: null },
      { outstanding_try: 100_000, days: null },
    ]
    expect(computeRefinancingScore(tranches)).toBe(100)
  })

  it('all tranches > 365 days → 100', () => {
    const tranches = [
      { outstanding_try: 500_000, days: 400 },
      { outstanding_try: 300_000, days: 1000 },
    ]
    expect(computeRefinancingScore(tranches)).toBe(100)
  })

  it('mix of buckets computes weighted average', () => {
    // 100k at weight 0 (≤30d) + 100k at weight 100 (>365d)
    // weighted = (0×100000 + 100×100000) / 200000 = 50
    const tranches = [
      { outstanding_try: 100_000, days: 10 },
      { outstanding_try: 100_000, days: 400 },
    ]
    expect(computeRefinancingScore(tranches)).toBe(50)
  })

  it('31-90d bucket gets weight 10', () => {
    const tranches = [{ outstanding_try: 100_000, days: 60 }]
    expect(computeRefinancingScore(tranches)).toBe(10)
  })

  it('91-180d bucket gets weight 30', () => {
    const tranches = [{ outstanding_try: 100_000, days: 120 }]
    expect(computeRefinancingScore(tranches)).toBe(30)
  })

  it('181-365d bucket gets weight 60', () => {
    const tranches = [{ outstanding_try: 100_000, days: 200 }]
    expect(computeRefinancingScore(tranches)).toBe(60)
  })

  it('zero-balance tranches are excluded', () => {
    const tranches = [
      { outstanding_try: 0, days: 5 },     // zero balance — should be excluded
      { outstanding_try: 100_000, days: 400 }, // extended → weight 100
    ]
    expect(computeRefinancingScore(tranches)).toBe(100)
  })
})

// ── computeNext12mPct ─────────────────────────────────────────────────────────

describe('computeNext12mPct', () => {
  it('all debt in 12m → 100%', () => {
    expect(computeNext12mPct(0, 0, 0, 100_000, 100_000)).toBe(100)
  })

  it('no near-term debt → 0%', () => {
    expect(computeNext12mPct(0, 0, 0, 0, 200_000)).toBe(0)
  })

  it('zero total → 0%', () => {
    expect(computeNext12mPct(0, 0, 0, 0, 0)).toBe(0)
  })

  it('50% in next 12m', () => {
    expect(computeNext12mPct(0, 0, 0, 50_000, 100_000)).toBe(50)
  })

  it('all four near-term buckets sum correctly', () => {
    // overdue=10k, immediate=20k, short=30k, medium=40k = 100k / 200k = 50%
    expect(computeNext12mPct(10_000, 20_000, 30_000, 40_000, 200_000)).toBe(50)
  })
})
