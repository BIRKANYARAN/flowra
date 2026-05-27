/**
 * Tests for lib/services/commercial/customer-ltv.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/customer-ltv.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeRScore,
  computeFScore,
  computeMScore,
  computeRfmSegment,
  computeChurnRisk,
  estimateLtv,
} from '../lib/services/commercial/customer-ltv.service'

// ── computeRScore ─────────────────────────────────────────────────────────────

describe('computeRScore', () => {
  it('returns 5 for 15 days (< 30)', () => {
    expect(computeRScore(15)).toBe(5)
  })

  it('returns 5 for 0 days (same day)', () => {
    expect(computeRScore(0)).toBe(5)
  })

  it('returns 4 for 45 days (30-60)', () => {
    expect(computeRScore(45)).toBe(4)
  })

  it('returns 3 for 75 days (60-90)', () => {
    expect(computeRScore(75)).toBe(3)
  })

  it('returns 2 for 120 days (90-180)', () => {
    expect(computeRScore(120)).toBe(2)
  })

  it('returns 1 for 200 days (> 180)', () => {
    expect(computeRScore(200)).toBe(1)
  })

  it('returns 1 for 365 days (> 180)', () => {
    expect(computeRScore(365)).toBe(1)
  })

  it('returns 4 for exactly 30 days (boundary)', () => {
    expect(computeRScore(30)).toBe(4)
  })

  it('returns 3 for exactly 60 days (boundary)', () => {
    expect(computeRScore(60)).toBe(3)
  })
})

// ── computeFScore ─────────────────────────────────────────────────────────────

describe('computeFScore', () => {
  it('returns 0 for 0 orders (inactive)', () => {
    expect(computeFScore(0)).toBe(0)
  })

  it('returns 1 for 1 order', () => {
    expect(computeFScore(1)).toBe(1)
  })

  it('returns 2 for 2 orders', () => {
    expect(computeFScore(2)).toBe(2)
  })

  it('returns 3 for 3 orders', () => {
    expect(computeFScore(3)).toBe(3)
  })

  it('returns 4 for 4 orders', () => {
    expect(computeFScore(4)).toBe(4)
  })

  it('returns 4 for 5 orders', () => {
    expect(computeFScore(5)).toBe(4)
  })

  it('returns 5 for 6 orders (≥6)', () => {
    expect(computeFScore(6)).toBe(5)
  })

  it('returns 5 for 10 orders (≥6)', () => {
    expect(computeFScore(10)).toBe(5)
  })
})

// ── computeMScore ─────────────────────────────────────────────────────────────

describe('computeMScore', () => {
  const breaks = [1000, 5000, 15000, 50000] // p20, p40, p60, p80

  it('returns 5 for value above p80', () => {
    expect(computeMScore(100000, breaks)).toBe(5)
  })

  it('returns 4 for value between p60 and p80', () => {
    expect(computeMScore(30000, breaks)).toBe(4)
  })

  it('returns 3 for value between p40 and p60', () => {
    expect(computeMScore(10000, breaks)).toBe(3)
  })

  it('returns 2 for value between p20 and p40', () => {
    expect(computeMScore(3000, breaks)).toBe(2)
  })

  it('returns 1 for value at or below p20', () => {
    expect(computeMScore(500, breaks)).toBe(1)
  })

  it('returns 1 when quintileBreaks is empty', () => {
    expect(computeMScore(999999, [])).toBe(1)
  })

  it('returns 1 for exactly the p20 value (not strictly greater)', () => {
    expect(computeMScore(1000, breaks)).toBe(1)
  })
})

// ── computeRfmSegment ─────────────────────────────────────────────────────────

describe('computeRfmSegment', () => {
  it('returns champions when r=5, f=5, m=5', () => {
    expect(computeRfmSegment(5, 5, 5)).toBe('champions')
  })

  it('returns champions when r=4, f=4, m=4', () => {
    expect(computeRfmSegment(4, 4, 4)).toBe('champions')
  })

  it('returns loyal when f=4, m=3 (r is moderate)', () => {
    expect(computeRfmSegment(3, 4, 3)).toBe('loyal')
  })

  it('returns at_risk when r=2, f=4, m=4 (used to be good)', () => {
    expect(computeRfmSegment(2, 4, 4)).toBe('at_risk')
  })

  it('returns at_risk when r=1, f=3, m=5', () => {
    expect(computeRfmSegment(1, 3, 5)).toBe('at_risk')
  })

  it('returns lost when r=1, f=1, m=1', () => {
    expect(computeRfmSegment(1, 1, 1)).toBe('lost')
  })

  it('returns lost when r=1, f=2, m=1', () => {
    expect(computeRfmSegment(1, 2, 1)).toBe('lost')
  })

  it('returns other for borderline case r=3, f=2, m=2', () => {
    expect(computeRfmSegment(3, 2, 2)).toBe('other')
  })
})

// ── computeChurnRisk ──────────────────────────────────────────────────────────

describe('computeChurnRisk', () => {
  it('returns uncertain for first-time customer (freq12m=1)', () => {
    expect(computeChurnRisk(100, 1, 0, 0)).toBe('uncertain')
  })

  it('returns high when >90d and frequency declining (6m < prior6m)', () => {
    expect(computeChurnRisk(100, 5, 1, 4)).toBe('high')
  })

  it('returns high when >90d and frequency declining (6m=0, prior6m=2)', () => {
    expect(computeChurnRisk(95, 3, 0, 3)).toBe('high')
  })

  it('returns medium when 60-90 days (no trend check)', () => {
    expect(computeChurnRisk(70, 4, 2, 2)).toBe('medium')
  })

  it('returns low when <60 days', () => {
    expect(computeChurnRisk(10, 6, 3, 3)).toBe('low')
  })

  it('returns low when recency is 0 days', () => {
    expect(computeChurnRisk(0, 4, 2, 2)).toBe('low')
  })

  it('returns medium (not high) when >90d but frequency stable', () => {
    // freq6m >= priorFreq6m → not declining → falls through to medium
    expect(computeChurnRisk(120, 4, 3, 2)).toBe('medium')
  })
})

// ── estimateLtv ───────────────────────────────────────────────────────────────

describe('estimateLtv', () => {
  it('uses 24-month lifespan for new customer (<= 24 months)', () => {
    // ltv = 1000 * 4 * 24 / 12 = 8000
    expect(estimateLtv(1000, 4, 12)).toBe(8000)
  })

  it('uses 36-month lifespan for veteran customer (> 24 months)', () => {
    // ltv = 1000 * 4 * 36 / 12 = 12000
    expect(estimateLtv(1000, 4, 30)).toBe(12000)
  })

  it('uses 24-month lifespan at exactly 24 months', () => {
    // 24 months exactly → not > 24 → 24-month lifespan
    expect(estimateLtv(500, 2, 24)).toBe(2000) // 500 * 2 * 24 / 12
  })

  it('returns 0 when avgOrderValue is 0', () => {
    expect(estimateLtv(0, 6, 12)).toBe(0)
  })

  it('returns 0 when frequency is 0', () => {
    expect(estimateLtv(1000, 0, 12)).toBe(0)
  })

  it('returns 0 for negative avgOrderValue', () => {
    expect(estimateLtv(-100, 3, 12)).toBe(0)
  })

  it('scales linearly with avg order value', () => {
    const ltv1 = estimateLtv(500, 6, 10)
    const ltv2 = estimateLtv(1000, 6, 10)
    expect(ltv2).toBe(ltv1 * 2)
  })
})
