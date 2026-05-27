/**
 * Tests for lib/services/commercial/segment-profitability.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/segment-profitability.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeSegmentMargin,
  classifySegmentPerformance,
  computeSegmentShare,
  computeSegmentGrowth,
  computePareto80Segments,
} from '../lib/services/commercial/segment-profitability.service'

// ── computeSegmentMargin ──────────────────────────────────────────────────────

describe('computeSegmentMargin', () => {
  it('returns correct margin for normal values', () => {
    // (1000 - 600) / 1000 × 100 = 40
    expect(computeSegmentMargin(1000, 600)).toBeCloseTo(40)
  })

  it('returns 0 when revenue is 0', () => {
    expect(computeSegmentMargin(0, 500)).toBe(0)
  })

  it('returns negative margin when cogs > revenue', () => {
    // (500 - 700) / 500 × 100 = -40
    expect(computeSegmentMargin(500, 700)).toBeCloseTo(-40)
  })

  it('returns 100 when cogs is 0 (pure digital/service)', () => {
    expect(computeSegmentMargin(1000, 0)).toBeCloseTo(100)
  })

  it('returns 0 for negative revenue (guard)', () => {
    expect(computeSegmentMargin(-100, 50)).toBe(0)
  })
})

// ── classifySegmentPerformance ────────────────────────────────────────────────

describe('classifySegmentPerformance', () => {
  it('classifies 40% as star (boundary)', () => {
    expect(classifySegmentPerformance(40)).toBe('star')
  })

  it('classifies 50% as star', () => {
    expect(classifySegmentPerformance(50)).toBe('star')
  })

  it('classifies 39.9% as profitable (just below star)', () => {
    expect(classifySegmentPerformance(39.9)).toBe('profitable')
  })

  it('classifies 25% as profitable (boundary)', () => {
    expect(classifySegmentPerformance(25)).toBe('profitable')
  })

  it('classifies 30% as profitable', () => {
    expect(classifySegmentPerformance(30)).toBe('profitable')
  })

  it('classifies 24.9% as marginal (just below profitable)', () => {
    expect(classifySegmentPerformance(24.9)).toBe('marginal')
  })

  it('classifies 10% as marginal (boundary)', () => {
    expect(classifySegmentPerformance(10)).toBe('marginal')
  })

  it('classifies 15% as marginal', () => {
    expect(classifySegmentPerformance(15)).toBe('marginal')
  })

  it('classifies 9.9% as loss_leader (just below marginal)', () => {
    expect(classifySegmentPerformance(9.9)).toBe('loss_leader')
  })

  it('classifies 0% as loss_leader', () => {
    expect(classifySegmentPerformance(0)).toBe('loss_leader')
  })

  it('classifies negative margin as loss_leader', () => {
    expect(classifySegmentPerformance(-15)).toBe('loss_leader')
  })
})

// ── computeSegmentShare ───────────────────────────────────────────────────────

describe('computeSegmentShare', () => {
  it('returns correct share percentage', () => {
    // 300 / 1000 × 100 = 30
    expect(computeSegmentShare(300, 1000)).toBeCloseTo(30)
  })

  it('returns 100 when segment IS the total revenue', () => {
    expect(computeSegmentShare(500, 500)).toBeCloseTo(100)
  })

  it('returns 0 when total revenue is 0', () => {
    expect(computeSegmentShare(300, 0)).toBe(0)
  })

  it('returns 0 when segment revenue is 0', () => {
    expect(computeSegmentShare(0, 1000)).toBeCloseTo(0)
  })
})

// ── computeSegmentGrowth ──────────────────────────────────────────────────────

describe('computeSegmentGrowth', () => {
  it('returns positive growth percentage', () => {
    // (120 - 100) / 100 × 100 = 20
    expect(computeSegmentGrowth(120, 100)).toBeCloseTo(20)
  })

  it('returns negative growth percentage for decline', () => {
    // (80 - 100) / 100 × 100 = -20
    expect(computeSegmentGrowth(80, 100)).toBeCloseTo(-20)
  })

  it('returns null when prior revenue is 0', () => {
    expect(computeSegmentGrowth(100, 0)).toBeNull()
  })

  it('returns 0 when current equals prior', () => {
    expect(computeSegmentGrowth(100, 100)).toBeCloseTo(0)
  })

  it('returns large positive growth for new segment', () => {
    // 500 / 10 × 100 = 5000% (prior tiny base)
    expect(computeSegmentGrowth(510, 10)).toBeCloseTo(5000)
  })
})

// ── computePareto80Segments ───────────────────────────────────────────────────

describe('computePareto80Segments', () => {
  it('returns 0 for empty segments array', () => {
    expect(computePareto80Segments([])).toBe(0)
  })

  it('returns 1 for a single segment (trivially 100%)', () => {
    expect(computePareto80Segments([{ revenue_try: 1000 }])).toBe(1)
  })

  it('returns 1 when first segment alone exceeds 80%', () => {
    const segs = [
      { revenue_try: 900 },
      { revenue_try: 50 },
      { revenue_try: 50 },
    ]
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('returns 2 for even 50/50 split (need 2 to reach 80%+)', () => {
    const segs = [
      { revenue_try: 500 },
      { revenue_try: 500 },
    ]
    // 500/1000 = 50%, need both to exceed 80% → returns 2
    expect(computePareto80Segments(segs)).toBe(2)
  })

  it('handles skewed distribution correctly — top segment alone reaches 80%', () => {
    // Top segment 800/1000 = 80% exactly → cumulative >= target at i=0 → returns 1
    const segs = [
      { revenue_try: 800 },
      { revenue_try: 150 },
      { revenue_try: 30 },
      { revenue_try: 20 },
    ]
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('returns 4 when 4 equal segments are needed to cross 80% (each 25%)', () => {
    // Each segment = 200, total = 800. 80% target = 640.
    // cumulative: 200 (25%), 400 (50%), 600 (75%), 800 (100% ≥ 80%) → 4
    const segs = [
      { revenue_try: 200 },
      { revenue_try: 200 },
      { revenue_try: 200 },
      { revenue_try: 200 },
    ]
    expect(computePareto80Segments(segs)).toBe(4)
  })

  it('handles 5 equal segments — top 4 = 80% exactly', () => {
    const segs = Array.from({ length: 5 }, () => ({ revenue_try: 200 }))
    // Total = 1000. 4 × 200 = 800 ≥ 800 → returns 4
    expect(computePareto80Segments(segs)).toBe(4)
  })

  it('returns 0 when total revenue is 0', () => {
    const segs = [{ revenue_try: 0 }, { revenue_try: 0 }]
    expect(computePareto80Segments(segs)).toBe(0)
  })
})
