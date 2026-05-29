/**
 * Tests for lib/services/governance/stakeholder-capital.service.ts
 *
 * Pure computation tests — no DB required.
 */
import { describe, it, expect } from 'vitest'
import {
  computeNetPosition,
  computeBurdenScore,
  classifyCapitalHealth,
} from '../lib/services/governance/stakeholder-capital.service'

// ── computeNetPosition ────────────────────────────────────────────────────────

describe('computeNetPosition', () => {
  it('returns paid minus loanOutstanding', () => {
    expect(computeNetPosition(500_000, 200_000)).toBe(300_000)
  })

  it('returns zero when paid equals loan outstanding', () => {
    expect(computeNetPosition(100_000, 100_000)).toBe(0)
  })

  it('returns negative when loan outstanding exceeds paid', () => {
    expect(computeNetPosition(50_000, 150_000)).toBe(-100_000)
  })

  it('returns paid when no loan outstanding', () => {
    expect(computeNetPosition(750_000, 0)).toBe(750_000)
  })

  it('returns negative paid when both are zero', () => {
    expect(computeNetPosition(0, 0)).toBe(0)
  })

  it('handles large values correctly', () => {
    expect(computeNetPosition(10_000_000, 3_500_000)).toBe(6_500_000)
  })
})

// ── computeBurdenScore ────────────────────────────────────────────────────────

describe('computeBurdenScore', () => {
  it('returns 0 when totalLoans is 0 (avoid division-by-zero)', () => {
    expect(computeBurdenScore(0, 0, 50)).toBe(0)
  })

  it('returns 0 when loanOutstanding is 0 but totalLoans > 0', () => {
    // loanSharePct = 0/200000 * 100 = 0; 0 - sharePct = 0 - 30 = -30
    expect(computeBurdenScore(0, 200_000, 30)).toBe(-30)
  })

  it('returns positive when partner carries disproportionate debt', () => {
    // loanSharePct = 80000/100000 * 100 = 80; burden = 80 - 50 = 30
    expect(computeBurdenScore(80_000, 100_000, 50)).toBe(30)
  })

  it('returns 0 when partner loan share equals equity share', () => {
    // loanSharePct = 50000/100000 * 100 = 50; burden = 50 - 50 = 0
    expect(computeBurdenScore(50_000, 100_000, 50)).toBe(0)
  })

  it('returns negative when partner carries proportionally less debt than equity', () => {
    // loanSharePct = 10000/100000 * 100 = 10; burden = 10 - 40 = -30
    expect(computeBurdenScore(10_000, 100_000, 40)).toBe(-30)
  })

  it('handles partner with 100% of loans', () => {
    // loanSharePct = 100000/100000 * 100 = 100; burden = 100 - 60 = 40
    expect(computeBurdenScore(100_000, 100_000, 60)).toBe(40)
  })

  it('returns 0 when totalLoans is zero regardless of loanOutstanding', () => {
    expect(computeBurdenScore(50_000, 0, 25)).toBe(0)
  })

  it('handles fractional share percentages', () => {
    // loanSharePct = 33333/100000 * 100 = 33.333; burden = 33.333 - 33.333 = ~0
    const score = computeBurdenScore(33_333, 100_000, 33.333)
    expect(Math.abs(score)).toBeLessThan(0.01)
  })
})

// ── classifyCapitalHealth ─────────────────────────────────────────────────────

describe('classifyCapitalHealth', () => {
  it('returns "critical" when both unpaid > 0 and loanOutstanding > 0', () => {
    expect(classifyCapitalHealth(50_000, 100_000, 25)).toBe('critical')
  })

  it('returns "critical" regardless of share percentage when both flags set', () => {
    expect(classifyCapitalHealth(1, 1, 0)).toBe('critical')
    expect(classifyCapitalHealth(1, 1, 100)).toBe('critical')
  })

  it('returns "attention" when unpaid > 0 but no loan outstanding', () => {
    expect(classifyCapitalHealth(50_000, 0, 25)).toBe('attention')
  })

  it('returns "attention" when unpaid is any positive amount and no loan', () => {
    expect(classifyCapitalHealth(1, 0, 50)).toBe('attention')
  })

  it('returns "healthy" when fully paid with no loan', () => {
    expect(classifyCapitalHealth(0, 0, 50)).toBe('healthy')
  })

  it('returns "healthy" when fully paid with zero share', () => {
    expect(classifyCapitalHealth(0, 0, 0)).toBe('healthy')
  })

  it('returns non-critical for large loan but zero unpaid (attention or healthy)', () => {
    const result = classifyCapitalHealth(0, 500_000, 10)
    // should not be critical since unpaid is 0
    expect(result).not.toBe('critical')
  })

  it('prioritizes critical over attention (both conditions true)', () => {
    // unpaid > 0 AND loanOutstanding > 0 → critical, not attention
    expect(classifyCapitalHealth(100, 100, 50)).toBe('critical')
  })
})
