// ── vendor-concentration.test.ts ──────────────────────────────────────────────
// Unit tests for all pure helpers in vendor-concentration.service.ts.

import { describe, it, expect } from 'vitest'
import {
  computeVendorHHI,
  classifyVendorConcentration,
  isSingleSourceDependent,
  classifyVendorTier,
  computeVendorPareto80,
} from '../lib/services/commercial/vendor-concentration.service'

// ── computeVendorHHI ──────────────────────────────────────────────────────────

describe('computeVendorHHI', () => {
  it('returns 0 for empty array', () => {
    expect(computeVendorHHI([])).toBe(0)
  })

  it('returns 10000 for single vendor (monopoly)', () => {
    // One vendor with 100% share: 100² = 10000
    expect(computeVendorHHI([{ spend_try: 10_000 }])).toBeCloseTo(10_000, 0)
  })

  it('returns lower HHI for equal distribution', () => {
    // 4 equal vendors → each 25% → HHI = 4 × 625 = 2500
    const vendors = [
      { spend_try: 250 },
      { spend_try: 250 },
      { spend_try: 250 },
      { spend_try: 250 },
    ]
    expect(computeVendorHHI(vendors)).toBeCloseTo(2500, 0)
  })

  it('returns 0 when all spend values are zero', () => {
    expect(computeVendorHHI([{ spend_try: 0 }, { spend_try: 0 }])).toBe(0)
  })

  it('correctly weights unequal vendors', () => {
    // 80% + 20% → 6400 + 400 = 6800
    const vendors = [{ spend_try: 800 }, { spend_try: 200 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(6800, 0)
  })

  it('two equal vendors at 50% each → HHI = 5000', () => {
    expect(computeVendorHHI([{ spend_try: 500 }, { spend_try: 500 }])).toBeCloseTo(5000)
  })

  it('ten equal vendors at 10% each → HHI = 1000', () => {
    const vendors = Array.from({ length: 10 }, () => ({ spend_try: 100 }))
    expect(computeVendorHHI(vendors)).toBeCloseTo(1000, 0)
  })

  it('single small vendor → still monopoly (10000)', () => {
    expect(computeVendorHHI([{ spend_try: 1 }])).toBeCloseTo(10_000, 0)
  })

  it('three vendors at 60/30/10% → HHI = 3600 + 900 + 100 = 4600', () => {
    const vendors = [{ spend_try: 600 }, { spend_try: 300 }, { spend_try: 100 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(4600, 0)
  })

  it('returns value in range [0, 10000] for valid inputs', () => {
    const vendors = [{ spend_try: 700 }, { spend_try: 300 }]
    const hhi = computeVendorHHI(vendors)
    expect(hhi).toBeGreaterThanOrEqual(0)
    expect(hhi).toBeLessThanOrEqual(10000)
  })

  it('handles large spend values correctly', () => {
    const vendors = [{ spend_try: 1_000_000 }, { spend_try: 1_000_000 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(5000, 0)
  })

  it('fractional spend values', () => {
    const vendors = [{ spend_try: 333.33 }, { spend_try: 333.33 }, { spend_try: 333.34 }]
    const hhi = computeVendorHHI(vendors)
    expect(hhi).toBeCloseTo(3333, 0)
  })
})

// ── classifyVendorConcentration ───────────────────────────────────────────────

describe('classifyVendorConcentration', () => {
  it('returns diversified for HHI < 1500', () => {
    expect(classifyVendorConcentration(0)).toBe('diversified')
    expect(classifyVendorConcentration(1499)).toBe('diversified')
  })

  it('returns moderate for HHI in [1500, 2500)', () => {
    expect(classifyVendorConcentration(1500)).toBe('moderate')
    expect(classifyVendorConcentration(2000)).toBe('moderate')
    expect(classifyVendorConcentration(2499)).toBe('moderate')
  })

  it('returns concentrated for HHI in [2500, 4000)', () => {
    expect(classifyVendorConcentration(2500)).toBe('concentrated')
    expect(classifyVendorConcentration(3500)).toBe('concentrated')
    expect(classifyVendorConcentration(3999)).toBe('concentrated')
  })

  it('returns highly_concentrated for HHI >= 4000', () => {
    expect(classifyVendorConcentration(4000)).toBe('highly_concentrated')
    expect(classifyVendorConcentration(10_000)).toBe('highly_concentrated')
  })

  it('boundary: exactly 1500 → moderate', () => {
    expect(classifyVendorConcentration(1500)).toBe('moderate')
  })

  it('boundary: exactly 2500 → concentrated', () => {
    expect(classifyVendorConcentration(2500)).toBe('concentrated')
  })

  it('boundary: exactly 4000 → highly_concentrated', () => {
    expect(classifyVendorConcentration(4000)).toBe('highly_concentrated')
  })

  it('just below each boundary', () => {
    expect(classifyVendorConcentration(1499.9)).toBe('diversified')
    expect(classifyVendorConcentration(2499.9)).toBe('moderate')
    expect(classifyVendorConcentration(3999.9)).toBe('concentrated')
  })
})

// ── isSingleSourceDependent ───────────────────────────────────────────────────

describe('isSingleSourceDependent', () => {
  it('returns true when spend pct exceeds default threshold (60)', () => {
    expect(isSingleSourceDependent(61)).toBe(true)
    expect(isSingleSourceDependent(100)).toBe(true)
  })

  it('returns false when spend pct is at or below default threshold', () => {
    expect(isSingleSourceDependent(60)).toBe(false)
    expect(isSingleSourceDependent(30)).toBe(false)
    expect(isSingleSourceDependent(0)).toBe(false)
  })

  it('respects custom threshold', () => {
    expect(isSingleSourceDependent(40, 30)).toBe(true)
    expect(isSingleSourceDependent(30, 30)).toBe(false)
    expect(isSingleSourceDependent(80, 90)).toBe(false)
    expect(isSingleSourceDependent(91, 90)).toBe(true)
  })

  it('boundary: exactly at threshold → false (must exceed)', () => {
    expect(isSingleSourceDependent(60, 60)).toBe(false)
  })

  it('one unit over threshold → true', () => {
    expect(isSingleSourceDependent(60.01, 60)).toBe(true)
  })

  it('threshold of 0 → any positive pct is single source', () => {
    expect(isSingleSourceDependent(0.1, 0)).toBe(true)
    expect(isSingleSourceDependent(0, 0)).toBe(false)
  })

  it('threshold of 100 → nothing is single source risk', () => {
    expect(isSingleSourceDependent(99.9, 100)).toBe(false)
    expect(isSingleSourceDependent(100, 100)).toBe(false)
  })
})

// ── classifyVendorTier ────────────────────────────────────────────────────────

describe('classifyVendorTier', () => {
  it('returns tier1 for spend pct > 20', () => {
    expect(classifyVendorTier(21)).toBe('tier1')
    expect(classifyVendorTier(100)).toBe('tier1')
  })

  it('returns tier2 for spend pct in [5, 20]', () => {
    expect(classifyVendorTier(20)).toBe('tier2')
    expect(classifyVendorTier(10)).toBe('tier2')
    expect(classifyVendorTier(5)).toBe('tier2')
  })

  it('returns tier3 for spend pct in [1, 5)', () => {
    expect(classifyVendorTier(4.9)).toBe('tier3')
    expect(classifyVendorTier(1)).toBe('tier3')
  })

  it('returns tier4 for spend pct < 1', () => {
    expect(classifyVendorTier(0.99)).toBe('tier4')
    expect(classifyVendorTier(0)).toBe('tier4')
  })

  it('boundary: exactly 1% → tier3', () => {
    expect(classifyVendorTier(1)).toBe('tier3')
  })

  it('boundary: exactly 5% → tier2', () => {
    expect(classifyVendorTier(5)).toBe('tier2')
  })

  it('boundary: exactly 20% → tier2 (not tier1)', () => {
    expect(classifyVendorTier(20)).toBe('tier2')
  })

  it('20.01% → tier1', () => {
    expect(classifyVendorTier(20.01)).toBe('tier1')
  })

  it('4.99% → tier3 (just below tier2)', () => {
    expect(classifyVendorTier(4.99)).toBe('tier3')
  })

  it('0.99% → tier4 (just below tier3)', () => {
    expect(classifyVendorTier(0.99)).toBe('tier4')
  })

  it('50% → tier1', () => {
    expect(classifyVendorTier(50)).toBe('tier1')
  })

  it('2.5% → tier3', () => {
    expect(classifyVendorTier(2.5)).toBe('tier3')
  })
})

// ── computeVendorPareto80 ─────────────────────────────────────────────────────

describe('computeVendorPareto80', () => {
  it('returns 0 for empty array', () => {
    expect(computeVendorPareto80([])).toBe(0)
  })

  it('returns 1 for single dominant vendor (100%)', () => {
    expect(computeVendorPareto80([{ spend_try: 1000 }])).toBe(1)
  })

  it('returns correct count for even distribution', () => {
    // 10 equal vendors → each 10% → need 8 to reach 80%
    const vendors = Array.from({ length: 10 }, () => ({ spend_try: 100 }))
    expect(computeVendorPareto80(vendors)).toBe(8)
  })

  it('returns 1 when single vendor covers >80% of spend', () => {
    const vendors = [
      { spend_try: 850 },
      { spend_try: 50 },
      { spend_try: 50 },
      { spend_try: 50 },
    ]
    expect(computeVendorPareto80(vendors)).toBe(1)
  })

  it('returns 0 when all spend values are zero', () => {
    expect(computeVendorPareto80([{ spend_try: 0 }, { spend_try: 0 }])).toBe(0)
  })

  it('correctly handles two vendors at 50% each', () => {
    // 2 equal vendors → need both to reach 80%
    const vendors = [{ spend_try: 500 }, { spend_try: 500 }]
    expect(computeVendorPareto80(vendors)).toBe(2)
  })

  it('sorts internally — unordered input still gives correct result', () => {
    const vendors = [
      { spend_try: 100 },   // smallest
      { spend_try: 900 },   // largest
    ]
    // After sorting: 900 (90%) → reaches 80% in 1 vendor
    expect(computeVendorPareto80(vendors)).toBe(1)
  })

  it('exactly 80% at first vendor → returns 1', () => {
    const vendors = [
      { spend_try: 800 },
      { spend_try: 200 },
    ]
    expect(computeVendorPareto80(vendors)).toBe(1)
  })

  it('just under 80% at first vendor → returns 2', () => {
    const vendors = [
      { spend_try: 799 },
      { spend_try: 201 },
    ]
    expect(computeVendorPareto80(vendors)).toBe(2)
  })

  it('three equal vendors at ~33% each → all needed for 80%', () => {
    const vendors = [
      { spend_try: 333 },
      { spend_try: 333 },
      { spend_try: 334 },
    ]
    // 333/1000 = 33.3%, 666/1000 = 66.6%, 1000/1000 = 100% → need 3
    expect(computeVendorPareto80(vendors)).toBe(3)
  })

  it('returns all vendors when distribution is perfectly flat', () => {
    // 5 equal vendors at 20% each — need 4 to reach 80%
    const vendors = Array.from({ length: 5 }, () => ({ spend_try: 200 }))
    expect(computeVendorPareto80(vendors)).toBe(4)
  })
})
