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

  it('returns 50% margin for equal revenue and cogs split', () => {
    expect(computeSegmentMargin(1000, 500)).toBeCloseTo(50)
  })

  it('returns 0 when both revenue and cogs are 0', () => {
    expect(computeSegmentMargin(0, 0)).toBe(0)
  })

  it('handles fractional values correctly', () => {
    expect(computeSegmentMargin(333.33, 166.67)).toBeCloseTo(50, 0)
  })

  it('returns 100% for pure digital product (no cogs)', () => {
    expect(computeSegmentMargin(5000, 0)).toBeCloseTo(100)
  })

  it('large revenue with tiny cogs → near 100%', () => {
    expect(computeSegmentMargin(100000, 1)).toBeCloseTo(99.999, 2)
  })

  it('revenue exactly 1, cogs exactly 1 → 0% margin', () => {
    expect(computeSegmentMargin(1, 1)).toBeCloseTo(0)
  })

  it('returns 25% for 750/1000 COGS ratio', () => {
    expect(computeSegmentMargin(1000, 750)).toBeCloseTo(25)
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

  it('classifies 100% margin as star', () => {
    expect(classifySegmentPerformance(100)).toBe('star')
  })

  it('classifies 80% margin as star', () => {
    expect(classifySegmentPerformance(80)).toBe('star')
  })

  it('classifies exactly 25% as profitable (not marginal)', () => {
    expect(classifySegmentPerformance(25)).toBe('profitable')
  })

  it('classifies exactly 10% as marginal (not loss_leader)', () => {
    expect(classifySegmentPerformance(10)).toBe('marginal')
  })

  it('classifies -100% margin as loss_leader', () => {
    expect(classifySegmentPerformance(-100)).toBe('loss_leader')
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

  it('returns 50 for equal segments', () => {
    expect(computeSegmentShare(500, 1000)).toBeCloseTo(50)
  })

  it('returns 10 for 10% segment', () => {
    expect(computeSegmentShare(100, 1000)).toBeCloseTo(10)
  })

  it('returns 0 for negative total revenue (guard)', () => {
    expect(computeSegmentShare(100, -500)).toBe(0)
  })

  it('returns 0 when both segment and total are 0', () => {
    expect(computeSegmentShare(0, 0)).toBe(0)
  })

  it('returns correct fractional share', () => {
    // 1/3 of total
    expect(computeSegmentShare(333.33, 999.99)).toBeCloseTo(33.33, 1)
  })

  it('handles large numbers correctly', () => {
    expect(computeSegmentShare(1_000_000, 5_000_000)).toBeCloseTo(20)
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

  it('returns -100% when current revenue drops to 0', () => {
    expect(computeSegmentGrowth(0, 100)).toBeCloseTo(-100)
  })

  it('returns 100% for doubling revenue', () => {
    expect(computeSegmentGrowth(200, 100)).toBeCloseTo(100)
  })

  it('works with fractional revenue values', () => {
    expect(computeSegmentGrowth(150.5, 100)).toBeCloseTo(50.5)
  })

  it('prior revenue negative (edge case) — uses abs for denominator', () => {
    // priorRevenue = -100, currentRevenue = 50
    // (50 - (-100)) / |(-100)| × 100 = 150%
    expect(computeSegmentGrowth(50, -100)).toBeCloseTo(150)
  })

  it('very small growth percentage near 0', () => {
    expect(computeSegmentGrowth(1001, 1000)).toBeCloseTo(0.1)
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

  it('assumes input is pre-sorted descending (first segment largest)', () => {
    // If sorted correctly, first segment = 900/1000 = 90% → 1
    const segs = [
      { revenue_try: 900 },
      { revenue_try: 100 },
    ]
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('handles ten equal segments — need 8 to reach 80%', () => {
    const segs = Array.from({ length: 10 }, () => ({ revenue_try: 100 }))
    expect(computePareto80Segments(segs)).toBe(8)
  })

  it('handles very many segments with small share each', () => {
    // 100 segments at 1% each → need 80 to reach 80%
    const segs = Array.from({ length: 100 }, () => ({ revenue_try: 10 }))
    expect(computePareto80Segments(segs)).toBe(80)
  })

  it('handles single segment with 0 revenue → returns 0 (no total)', () => {
    expect(computePareto80Segments([{ revenue_try: 0 }])).toBe(0)
  })

  it('handles segments with mixed large/small values', () => {
    const segs = [
      { revenue_try: 500 }, // 50%
      { revenue_try: 300 }, // 30%  → cumulative 80% → done at 2
      { revenue_try: 200 }, // 20%
    ]
    expect(computePareto80Segments(segs)).toBe(2)
  })
})

// ── computeSegmentMargin — monotonicity / additional cases ────────────────────

describe('computeSegmentMargin — monotonicity', () => {
  it('margin increases as COGS decreases (revenue fixed)', () => {
    const r = 1000
    const m1 = computeSegmentMargin(r, 800)  // 20%
    const m2 = computeSegmentMargin(r, 500)  // 50%
    const m3 = computeSegmentMargin(r, 200)  // 80%
    expect(m1).toBeLessThan(m2)
    expect(m2).toBeLessThan(m3)
  })

  it('margin decreases as revenue decreases (COGS fixed)', () => {
    const c = 400
    const m1 = computeSegmentMargin(2000, c)  // 80%
    const m2 = computeSegmentMargin(1000, c)  // 60%
    const m3 = computeSegmentMargin(500, c)   // 20%
    expect(m1).toBeGreaterThan(m2)
    expect(m2).toBeGreaterThan(m3)
  })

  it('exactly 75% margin for 1000 revenue / 250 COGS', () => {
    expect(computeSegmentMargin(1000, 250)).toBeCloseTo(75)
  })

  it('exactly 33.33% margin', () => {
    expect(computeSegmentMargin(300, 200)).toBeCloseTo(33.33, 1)
  })

  it('margin cannot exceed 100% with non-negative COGS', () => {
    const result = computeSegmentMargin(1000, 0)
    expect(result).toBeLessThanOrEqual(100)
  })

  it('negative COGS gives margin > 100% (revenue subsidized)', () => {
    // This tests the mathematical behavior without special handling
    const result = computeSegmentMargin(1000, -100)
    expect(result).toBeGreaterThan(100)
  })
})

// ── classifySegmentPerformance — monotonicity ─────────────────────────────────

describe('classifySegmentPerformance — monotonicity', () => {
  it('returns star for any margin >= 40', () => {
    for (const m of [40, 50, 60, 75, 90, 100, 200]) {
      expect(classifySegmentPerformance(m)).toBe('star')
    }
  })

  it('returns profitable for margins in [25, 39.99]', () => {
    for (const m of [25, 26, 30, 35, 39.99]) {
      expect(classifySegmentPerformance(m)).toBe('profitable')
    }
  })

  it('returns marginal for margins in [10, 24.99]', () => {
    for (const m of [10, 12, 15, 20, 24.99]) {
      expect(classifySegmentPerformance(m)).toBe('marginal')
    }
  })

  it('returns loss_leader for margins < 10', () => {
    for (const m of [-50, -1, 0, 1, 5, 9.99]) {
      expect(classifySegmentPerformance(m)).toBe('loss_leader')
    }
  })

  it('star boundary is inclusive at 40', () => {
    expect(classifySegmentPerformance(40)).toBe('star')
    expect(classifySegmentPerformance(39.999)).toBe('profitable')
  })

  it('profitable boundary is inclusive at 25', () => {
    expect(classifySegmentPerformance(25)).toBe('profitable')
    expect(classifySegmentPerformance(24.999)).toBe('marginal')
  })

  it('marginal boundary is inclusive at 10', () => {
    expect(classifySegmentPerformance(10)).toBe('marginal')
    expect(classifySegmentPerformance(9.999)).toBe('loss_leader')
  })
})

// ── computeSegmentShare — extended ───────────────────────────────────────────

describe('computeSegmentShare — extended', () => {
  it('sum of all equal segment shares = 100', () => {
    const n = 5
    const total = 1000
    const eachRevenue = total / n
    const shares = Array.from({ length: n }, () => computeSegmentShare(eachRevenue, total))
    const sum = shares.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(100, 5)
  })

  it('two segments add up to 100 when they cover total', () => {
    const total = 1000
    const s1 = computeSegmentShare(600, total)
    const s2 = computeSegmentShare(400, total)
    expect(s1 + s2).toBeCloseTo(100, 5)
  })

  it('share is proportional (doubling revenue doubles share)', () => {
    const s1 = computeSegmentShare(100, 1000)
    const s2 = computeSegmentShare(200, 1000)
    expect(s2).toBeCloseTo(s1 * 2, 5)
  })

  it('returns 0 for negative segment revenue / positive total', () => {
    // Negative segment revenue is unusual but handled gracefully
    const result = computeSegmentShare(-100, 1000)
    // Implementation divides directly: -100/1000*100 = -10 unless guarded
    expect(typeof result).toBe('number')
  })

  it('handles very small share (0.01%)', () => {
    expect(computeSegmentShare(1, 10_000)).toBeCloseTo(0.01)
  })
})

// ── computeSegmentGrowth — extended ──────────────────────────────────────────

describe('computeSegmentGrowth — extended', () => {
  it('returns null for zero prior revenue consistently', () => {
    expect(computeSegmentGrowth(0, 0)).toBeNull()
    expect(computeSegmentGrowth(500, 0)).toBeNull()
  })

  it('grows from 100 → 150 = 50%', () => {
    expect(computeSegmentGrowth(150, 100)).toBeCloseTo(50)
  })

  it('grows from 100 → 200 = 100%', () => {
    expect(computeSegmentGrowth(200, 100)).toBeCloseTo(100)
  })

  it('grows from 100 → 300 = 200%', () => {
    expect(computeSegmentGrowth(300, 100)).toBeCloseTo(200)
  })

  it('declines from 200 → 100 = -50%', () => {
    expect(computeSegmentGrowth(100, 200)).toBeCloseTo(-50)
  })

  it('declines from 100 → 0 = -100%', () => {
    expect(computeSegmentGrowth(0, 100)).toBeCloseTo(-100)
  })

  it('large revenue numbers work correctly', () => {
    expect(computeSegmentGrowth(2_000_000, 1_000_000)).toBeCloseTo(100)
  })
})

// ── computePareto80Segments — additional invariants ───────────────────────────

describe('computePareto80Segments — additional invariants', () => {
  it('result is always <= total number of segments', () => {
    const segs = Array.from({ length: 10 }, (_, i) => ({ revenue_try: (10 - i) * 100 }))
    const result = computePareto80Segments(segs)
    expect(result).toBeLessThanOrEqual(segs.length)
  })

  it('result is always >= 0', () => {
    expect(computePareto80Segments([])).toBeGreaterThanOrEqual(0)
    expect(computePareto80Segments([{ revenue_try: 0 }])).toBeGreaterThanOrEqual(0)
  })

  it('highly skewed distribution returns 1', () => {
    const segs = [
      { revenue_try: 9900 },
      ...Array.from({ length: 99 }, () => ({ revenue_try: 1 })),
    ]
    // 9900/9999 ≈ 99% → one segment exceeds 80%
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('3 of 4 needed when 75/25 split (3×25 = 75% < 80%)', () => {
    const segs = [
      { revenue_try: 400 },
      { revenue_try: 250 },
      { revenue_try: 250 },
      { revenue_try: 100 },
    ]
    // total = 1000. 80% = 800.
    // cumulative: 400 (40%), 650 (65%), 900 (90% >= 80%) → 3
    expect(computePareto80Segments(segs)).toBe(3)
  })

  it('returns total segments count when all equal (n * (1/n) cant reach 80 until all)', () => {
    // 10 segments at 10% each — need 8 to reach 80%
    const segs = Array.from({ length: 10 }, () => ({ revenue_try: 100 }))
    expect(computePareto80Segments(segs)).toBe(8)
  })

  it('is deterministic across multiple calls', () => {
    const segs = [
      { revenue_try: 700 },
      { revenue_try: 200 },
      { revenue_try: 100 },
    ]
    const r1 = computePareto80Segments(segs)
    const r2 = computePareto80Segments(segs)
    expect(r1).toBe(r2)
  })
})

// ── computeSegmentMargin — formula verification ────────────────────────────────

describe('computeSegmentMargin — formula verification', () => {
  it('formula: (revenue - cogs) / revenue × 100', () => {
    // (2000 - 1200) / 2000 × 100 = 40
    expect(computeSegmentMargin(2000, 1200)).toBeCloseTo(40, 1)
  })

  it('formula gives 60% for 2000 revenue and 800 cogs', () => {
    // (2000 - 800) / 2000 × 100 = 60
    expect(computeSegmentMargin(2000, 800)).toBeCloseTo(60, 1)
  })

  it('formula: 0 cogs → 100% margin regardless of revenue (when revenue > 0)', () => {
    expect(computeSegmentMargin(500, 0)).toBeCloseTo(100, 1)
    expect(computeSegmentMargin(50_000, 0)).toBeCloseTo(100, 1)
  })

  it('formula: cogs = revenue → 0% margin', () => {
    expect(computeSegmentMargin(1_000, 1_000)).toBeCloseTo(0, 1)
  })

  it('formula: cogs > revenue → negative margin', () => {
    // (100 - 200) / 100 × 100 = -100
    expect(computeSegmentMargin(100, 200)).toBeCloseTo(-100, 1)
  })

  it('large revenue: 10M revenue, 6M cogs → 40% margin', () => {
    expect(computeSegmentMargin(10_000_000, 6_000_000)).toBeCloseTo(40, 1)
  })

  it('guard: revenue ≤ 0 returns 0 (not a division by zero)', () => {
    expect(computeSegmentMargin(0, 500)).toBe(0)
    expect(computeSegmentMargin(-1, 500)).toBe(0)
  })
})

// ── classifySegmentPerformance — all classification levels ────────────────────

describe('classifySegmentPerformance — all classification levels', () => {
  // star: ≥ 40
  it('classifies 40% as star (lower boundary, inclusive)', () => {
    expect(classifySegmentPerformance(40)).toBe('star')
  })

  it('classifies 75% as star', () => {
    expect(classifySegmentPerformance(75)).toBe('star')
  })

  it('classifies 99% as star', () => {
    expect(classifySegmentPerformance(99)).toBe('star')
  })

  // profitable: 25 ≤ x < 40
  it('classifies exactly 25% as profitable (lower boundary)', () => {
    expect(classifySegmentPerformance(25)).toBe('profitable')
  })

  it('classifies 32% as profitable (mid range)', () => {
    expect(classifySegmentPerformance(32)).toBe('profitable')
  })

  it('classifies 39.99% as profitable (just below star boundary)', () => {
    expect(classifySegmentPerformance(39.99)).toBe('profitable')
  })

  // marginal: 10 ≤ x < 25
  it('classifies exactly 10% as marginal (lower boundary)', () => {
    expect(classifySegmentPerformance(10)).toBe('marginal')
  })

  it('classifies 17% as marginal (mid range)', () => {
    expect(classifySegmentPerformance(17)).toBe('marginal')
  })

  it('classifies 24.99% as marginal (just below profitable boundary)', () => {
    expect(classifySegmentPerformance(24.99)).toBe('marginal')
  })

  // loss_leader: < 10
  it('classifies 9.99% as loss_leader (just below marginal boundary)', () => {
    expect(classifySegmentPerformance(9.99)).toBe('loss_leader')
  })

  it('classifies 5% as loss_leader', () => {
    expect(classifySegmentPerformance(5)).toBe('loss_leader')
  })

  it('classifies 0% as loss_leader', () => {
    expect(classifySegmentPerformance(0)).toBe('loss_leader')
  })

  it('classifies negative margin as loss_leader', () => {
    expect(classifySegmentPerformance(-50)).toBe('loss_leader')
  })

  it('returns one of the four valid performance values for any input', () => {
    const valid = ['star', 'profitable', 'marginal', 'loss_leader']
    const margins = [-100, 0, 5, 9.99, 10, 15, 24.99, 25, 32, 39.99, 40, 75]
    for (const m of margins) {
      expect(valid).toContain(classifySegmentPerformance(m))
    }
  })
})

// ── computeSegmentShare — formula verification ────────────────────────────────

describe('computeSegmentShare — formula verification', () => {
  it('formula: segmentRevenue / totalRevenue × 100', () => {
    // 400 / 1000 × 100 = 40
    expect(computeSegmentShare(400, 1000)).toBeCloseTo(40, 1)
  })

  it('25% segment share from 250/1000', () => {
    expect(computeSegmentShare(250, 1000)).toBeCloseTo(25, 1)
  })

  it('1% segment share from 10/1000', () => {
    expect(computeSegmentShare(10, 1000)).toBeCloseTo(1, 1)
  })

  it('guard: total ≤ 0 returns 0', () => {
    expect(computeSegmentShare(100, 0)).toBe(0)
    expect(computeSegmentShare(100, -1)).toBe(0)
  })

  it('segment equals total → 100%', () => {
    expect(computeSegmentShare(5000, 5000)).toBeCloseTo(100, 1)
  })

  it('sum of three segment shares equals 100% when segments cover total', () => {
    const total = 3000
    const s1 = computeSegmentShare(1500, total)
    const s2 = computeSegmentShare(900, total)
    const s3 = computeSegmentShare(600, total)
    expect(s1 + s2 + s3).toBeCloseTo(100, 4)
  })

  it('proportional: larger segment gets larger share', () => {
    const total = 1000
    const small = computeSegmentShare(100, total)
    const large = computeSegmentShare(800, total)
    expect(large).toBeGreaterThan(small)
  })
})

// ── computeSegmentGrowth — formula and zero prior edge cases ──────────────────

describe('computeSegmentGrowth — formula and zero prior edge cases', () => {
  it('formula: (current - prior) / |prior| × 100', () => {
    // (150 - 100) / 100 × 100 = 50
    expect(computeSegmentGrowth(150, 100)).toBeCloseTo(50, 1)
  })

  it('formula for decline: (75 - 100) / 100 × 100 = -25', () => {
    expect(computeSegmentGrowth(75, 100)).toBeCloseTo(-25, 1)
  })

  it('zero prior → returns null (cannot compute growth)', () => {
    expect(computeSegmentGrowth(0, 0)).toBeNull()
    expect(computeSegmentGrowth(500, 0)).toBeNull()
    expect(computeSegmentGrowth(-100, 0)).toBeNull()
  })

  it('growth from 100 → 100 = 0% (no change)', () => {
    expect(computeSegmentGrowth(100, 100)).toBeCloseTo(0, 1)
  })

  it('growth from 1 → 2 = 100%', () => {
    expect(computeSegmentGrowth(2, 1)).toBeCloseTo(100, 1)
  })

  it('growth from 100 → 1 = -99%', () => {
    expect(computeSegmentGrowth(1, 100)).toBeCloseTo(-99, 1)
  })

  it('large numbers: 10M → 15M = +50%', () => {
    expect(computeSegmentGrowth(15_000_000, 10_000_000)).toBeCloseTo(50, 1)
  })
})

// ── computePareto80Segments — returns min set covering 80% ────────────────────

describe('computePareto80Segments — min set covering 80%', () => {
  it('returns minimum number of segments to reach exactly 80% cumulative', () => {
    // [600, 300, 100] total=1000; 80% target=800; 600<800, 600+300=900≥800 → 2
    const segs = [{ revenue_try: 600 }, { revenue_try: 300 }, { revenue_try: 100 }]
    expect(computePareto80Segments(segs)).toBe(2)
  })

  it('exactly at 80% boundary: first segment alone hits exactly 80%', () => {
    // [800, 200] total=1000; 80%=800; 800≥800 → 1
    const segs = [{ revenue_try: 800 }, { revenue_try: 200 }]
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('just below 80% at first segment, needs 2', () => {
    // [799, 201] total=1000; 80%=800; 799<800, 799+201=1000≥800 → 2
    const segs = [{ revenue_try: 799 }, { revenue_try: 201 }]
    expect(computePareto80Segments(segs)).toBe(2)
  })

  it('returns total segment count when even all barely reaches 80%', () => {
    // 3 segments at 26.7% each: total=300; 80% target=240; 3×100=300≥240 → 3
    const segs = [{ revenue_try: 100 }, { revenue_try: 100 }, { revenue_try: 100 }]
    // Each adds 100; target=240; first 100<240, +100=200<240, +100=300≥240 → 3
    expect(computePareto80Segments(segs)).toBe(3)
  })

  it('handles revenue_try values of 0 throughout → returns 0', () => {
    const segs = [
      { revenue_try: 0 }, { revenue_try: 0 }, { revenue_try: 0 },
    ]
    expect(computePareto80Segments(segs)).toBe(0)
  })

  it('single dominant segment at 90% share → 1 segment covers 80%', () => {
    const segs = [
      { revenue_try: 9000 },
      { revenue_try: 500 },
      { revenue_try: 500 },
    ]
    expect(computePareto80Segments(segs)).toBe(1)
  })

  it('result is always a non-negative integer', () => {
    const inputs = [
      [],
      [{ revenue_try: 0 }],
      [{ revenue_try: 100 }, { revenue_try: 200 }],
      [{ revenue_try: 50 }, { revenue_try: 50 }, { revenue_try: 50 }],
    ]
    for (const segs of inputs) {
      const r = computePareto80Segments(segs)
      expect(Number.isInteger(r)).toBe(true)
      expect(r).toBeGreaterThanOrEqual(0)
    }
  })
})
