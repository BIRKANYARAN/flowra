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

  it('HHI is highest possible (10000) when one vendor has everything', () => {
    const vendors = [{ spend_try: 9999 }, { spend_try: 0 }, { spend_try: 0 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(10_000, 0)
  })

  it('HHI decreases as vendors become more equal', () => {
    const unequal = [{ spend_try: 900 }, { spend_try: 100 }]          // 82/18 → ~6820
    const equal   = [{ spend_try: 500 }, { spend_try: 500 }]          // 50/50 → 5000
    expect(computeVendorHHI(unequal)).toBeGreaterThan(computeVendorHHI(equal))
  })

  it('formula: sum of squared share percentages', () => {
    const vendors = [{ spend_try: 300 }, { spend_try: 700 }]
    const total = 1000
    const expected = (300 / total * 100) ** 2 + (700 / total * 100) ** 2
    expect(computeVendorHHI(vendors)).toBeCloseTo(expected, 5)
  })

  it('five equal vendors → HHI = 2000', () => {
    const vendors = Array.from({ length: 5 }, () => ({ spend_try: 200 }))
    expect(computeVendorHHI(vendors)).toBeCloseTo(2000, 0)
  })

  it('two vendors at 75/25 → HHI = 5625 + 625 = 6250', () => {
    const vendors = [{ spend_try: 750 }, { spend_try: 250 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(6250, 0)
  })

  it('is symmetric — order of vendors does not matter', () => {
    const v1 = [{ spend_try: 200 }, { spend_try: 800 }]
    const v2 = [{ spend_try: 800 }, { spend_try: 200 }]
    expect(computeVendorHHI(v1)).toBeCloseTo(computeVendorHHI(v2), 5)
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

  it('HHI = 0 → diversified', () => {
    expect(classifyVendorConcentration(0)).toBe('diversified')
  })

  it('HHI = 10000 (monopoly) → highly_concentrated', () => {
    expect(classifyVendorConcentration(10_000)).toBe('highly_concentrated')
  })

  it('result is always one of the 4 valid levels', () => {
    const validLevels = ['diversified', 'moderate', 'concentrated', 'highly_concentrated']
    for (const hhi of [0, 500, 1000, 1500, 2000, 2500, 3500, 4000, 7000, 10000]) {
      expect(validLevels).toContain(classifyVendorConcentration(hhi))
    }
  })

  it('mid-range values map to expected buckets', () => {
    expect(classifyVendorConcentration(750)).toBe('diversified')
    expect(classifyVendorConcentration(1750)).toBe('moderate')
    expect(classifyVendorConcentration(3000)).toBe('concentrated')
    expect(classifyVendorConcentration(5000)).toBe('highly_concentrated')
  })

  it('1499.999 → diversified, 1500.001 → moderate', () => {
    expect(classifyVendorConcentration(1499.999)).toBe('diversified')
    expect(classifyVendorConcentration(1500.001)).toBe('moderate')
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

  it('default threshold 60: value 59.99 → false', () => {
    expect(isSingleSourceDependent(59.99)).toBe(false)
  })

  it('default threshold 60: value 60.01 → true', () => {
    expect(isSingleSourceDependent(60.01)).toBe(true)
  })

  it('returns false for 0 pct regardless of threshold', () => {
    for (const t of [0, 30, 60, 90, 100]) {
      expect(isSingleSourceDependent(0, t)).toBe(false)
    }
  })

  it('high custom threshold 95: returns true only above 95', () => {
    expect(isSingleSourceDependent(94, 95)).toBe(false)
    expect(isSingleSourceDependent(95, 95)).toBe(false)
    expect(isSingleSourceDependent(95.01, 95)).toBe(true)
  })

  it('works correctly with fractional percentages', () => {
    expect(isSingleSourceDependent(60.0001, 60)).toBe(true)
    expect(isSingleSourceDependent(59.9999, 60)).toBe(false)
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

  it('0.001% → tier4 (tiny vendor)', () => {
    expect(classifyVendorTier(0.001)).toBe('tier4')
  })

  it('result is always one of the 4 valid tiers', () => {
    const validTiers = ['tier1', 'tier2', 'tier3', 'tier4']
    for (const pct of [0, 0.5, 1, 2, 5, 10, 20, 25, 50, 100]) {
      expect(validTiers).toContain(classifyVendorTier(pct))
    }
  })

  it('tier transitions at exact boundaries', () => {
    // 0.99 → tier4, 1.0 → tier3, 4.99 → tier3, 5.0 → tier2, 20.0 → tier2, 20.01 → tier1
    expect(classifyVendorTier(0.99)).toBe('tier4')
    expect(classifyVendorTier(1.00)).toBe('tier3')
    expect(classifyVendorTier(4.99)).toBe('tier3')
    expect(classifyVendorTier(5.00)).toBe('tier2')
    expect(classifyVendorTier(20.00)).toBe('tier2')
    expect(classifyVendorTier(20.01)).toBe('tier1')
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

  it('result is always ≤ total number of vendors', () => {
    const vendors = Array.from({ length: 8 }, (_, i) => ({ spend_try: (i + 1) * 100 }))
    const result  = computeVendorPareto80(vendors)
    expect(result).toBeLessThanOrEqual(vendors.length)
  })

  it('result is always ≥ 1 when there is any spend', () => {
    const vendors = [{ spend_try: 1000 }, { spend_try: 500 }]
    expect(computeVendorPareto80(vendors)).toBeGreaterThanOrEqual(1)
  })

  it('90/10 split: 1 vendor reaches 80%', () => {
    const vendors = [{ spend_try: 900 }, { spend_try: 100 }]
    expect(computeVendorPareto80(vendors)).toBe(1)
  })

  it('equal four vendors at 25% → need 4 to clear 80% (25+25+25+25=100)', () => {
    const vendors = Array.from({ length: 4 }, () => ({ spend_try: 250 }))
    // 25+25 = 50%, 50+25 = 75% (< 80%), 75+25 = 100% (≥ 80%) → 4 vendors
    expect(computeVendorPareto80(vendors)).toBe(4)
  })

  it('single vendor always returns 1 (regardless of spend amount)', () => {
    for (const spend of [1, 100, 1_000_000]) {
      expect(computeVendorPareto80([{ spend_try: spend }])).toBe(1)
    }
  })

  it('large realistic vendor mix', () => {
    // One dominant vendor at 50%, then several smaller ones
    const vendors = [
      { spend_try: 500 },  // 50%
      { spend_try: 200 },  // 20% → cumulative 70%
      { spend_try: 150 },  // 15% → cumulative 85% ≥ 80%
      { spend_try: 100 },  // 10%
      { spend_try: 50  },  // 5%
    ]
    // After sort: [500, 200, 150, 100, 50]
    // 50% → 70% → 85% → stops at 3
    expect(computeVendorPareto80(vendors)).toBe(3)
  })
})

// ── computeVendorHHI — formula deep-checks ────────────────────────────────────

describe('computeVendorHHI — formula deep-checks', () => {
  it('HHI is Σ(share_pct²) not Σ(share_fraction²)', () => {
    // Single vendor: share = 100%, so 100² = 10000 (not 1² = 1)
    expect(computeVendorHHI([{ spend_try: 1000 }])).toBeCloseTo(10000, 0)
  })

  it('20 equal vendors → HHI = 500', () => {
    const vendors = Array.from({ length: 20 }, () => ({ spend_try: 50 }))
    expect(computeVendorHHI(vendors)).toBeCloseTo(500, 0)
  })

  it('100 equal vendors → HHI = 100', () => {
    const vendors = Array.from({ length: 100 }, () => ({ spend_try: 100 }))
    expect(computeVendorHHI(vendors)).toBeCloseTo(100, 0)
  })

  it('one zero-spend vendor among many does not affect HHI', () => {
    const base = [{ spend_try: 500 }, { spend_try: 500 }]
    const withZero = [{ spend_try: 500 }, { spend_try: 500 }, { spend_try: 0 }]
    expect(computeVendorHHI(withZero)).toBeCloseTo(computeVendorHHI(base), 0)
  })

  it('HHI is commutative across vendor order permutations', () => {
    const v1 = [{ spend_try: 100 }, { spend_try: 300 }, { spend_try: 600 }]
    const v2 = [{ spend_try: 600 }, { spend_try: 100 }, { spend_try: 300 }]
    const v3 = [{ spend_try: 300 }, { spend_try: 600 }, { spend_try: 100 }]
    expect(computeVendorHHI(v1)).toBeCloseTo(computeVendorHHI(v2), 5)
    expect(computeVendorHHI(v2)).toBeCloseTo(computeVendorHHI(v3), 5)
  })

  it('50/30/20 split: 2500 + 900 + 400 = 3800', () => {
    const vendors = [{ spend_try: 500 }, { spend_try: 300 }, { spend_try: 200 }]
    expect(computeVendorHHI(vendors)).toBeCloseTo(3800, 0)
  })
})

// ── classifyVendorConcentration — full spectrum validation ─────────────────────

describe('classifyVendorConcentration — full spectrum validation', () => {
  it('HHI = 1 → diversified', () => {
    expect(classifyVendorConcentration(1)).toBe('diversified')
  })

  it('HHI = 1499 → diversified', () => {
    expect(classifyVendorConcentration(1499)).toBe('diversified')
  })

  it('HHI = 1500 → moderate', () => {
    expect(classifyVendorConcentration(1500)).toBe('moderate')
  })

  it('HHI = 2499 → moderate', () => {
    expect(classifyVendorConcentration(2499)).toBe('moderate')
  })

  it('HHI = 2500 → concentrated', () => {
    expect(classifyVendorConcentration(2500)).toBe('concentrated')
  })

  it('HHI = 3999 → concentrated', () => {
    expect(classifyVendorConcentration(3999)).toBe('concentrated')
  })

  it('HHI = 4001 → highly_concentrated', () => {
    expect(classifyVendorConcentration(4001)).toBe('highly_concentrated')
  })

  it('HHI = 9999 → highly_concentrated', () => {
    expect(classifyVendorConcentration(9999)).toBe('highly_concentrated')
  })
})

// ── isSingleSourceDependent — semantic clarity tests ──────────────────────────

describe('isSingleSourceDependent — semantic clarity tests', () => {
  it('one vendor with 100% spend → single source', () => {
    expect(isSingleSourceDependent(100)).toBe(true)
  })

  it('two vendors at 50% each → NOT single source (each below 60%)', () => {
    expect(isSingleSourceDependent(50)).toBe(false)
  })

  it('vendor at 60% is NOT single source (not strictly greater)', () => {
    expect(isSingleSourceDependent(60)).toBe(false)
  })

  it('vendor at 60.1% IS single source', () => {
    expect(isSingleSourceDependent(60.1)).toBe(true)
  })

  it('very small spend (0.1%) is never single source risk', () => {
    expect(isSingleSourceDependent(0.1)).toBe(false)
  })

  it('with threshold=50: vendor at 50% is not single source', () => {
    expect(isSingleSourceDependent(50, 50)).toBe(false)
  })

  it('with threshold=50: vendor at 51% is single source', () => {
    expect(isSingleSourceDependent(51, 50)).toBe(true)
  })
})

// ── classifyVendorTier — comprehensive coverage ────────────────────────────────

describe('classifyVendorTier — comprehensive coverage', () => {
  it('25% → tier1 (above 20% threshold)', () => {
    expect(classifyVendorTier(25)).toBe('tier1')
  })

  it('20.01% → tier1 (just above threshold)', () => {
    expect(classifyVendorTier(20.01)).toBe('tier1')
  })

  it('20.00% → tier2 (at threshold, not above)', () => {
    expect(classifyVendorTier(20.00)).toBe('tier2')
  })

  it('15% → tier2', () => {
    expect(classifyVendorTier(15)).toBe('tier2')
  })

  it('5.00% → tier2 (at lower tier2 boundary)', () => {
    expect(classifyVendorTier(5.00)).toBe('tier2')
  })

  it('4.99% → tier3', () => {
    expect(classifyVendorTier(4.99)).toBe('tier3')
  })

  it('3% → tier3', () => {
    expect(classifyVendorTier(3)).toBe('tier3')
  })

  it('1.00% → tier3 (at lower tier3 boundary)', () => {
    expect(classifyVendorTier(1.00)).toBe('tier3')
  })

  it('0.99% → tier4', () => {
    expect(classifyVendorTier(0.99)).toBe('tier4')
  })

  it('0% → tier4', () => {
    expect(classifyVendorTier(0)).toBe('tier4')
  })
})

// ── computeVendorPareto80 — count semantics ───────────────────────────────────

describe('computeVendorPareto80 — count semantics', () => {
  it('returns minimum count needed, not all vendors above 80%', () => {
    // 3 vendors at 40/30/30 — first two cover 70%, all three cover 100%
    const vendors = [{ spend_try: 400 }, { spend_try: 300 }, { spend_try: 300 }]
    // After sort desc: [400, 300, 300]
    // 40% → 70% → 100% → stops at 3 (80 not reached at 2)
    expect(computeVendorPareto80(vendors)).toBe(3)
  })

  it('1 vendor at 80% exactly → returns 1', () => {
    const vendors = [{ spend_try: 800 }, { spend_try: 200 }]
    expect(computeVendorPareto80(vendors)).toBe(1)
  })

  it('progressively dominated market: result increases as distribution evens', () => {
    const concentrated = [{ spend_try: 900 }, { spend_try: 100 }]    // 1 vendor
    const even         = [{ spend_try: 500 }, { spend_try: 500 }]    // 2 vendors
    expect(computeVendorPareto80(concentrated)).toBeLessThanOrEqual(
      computeVendorPareto80(even),
    )
  })

  it('all vendors with equal spend: result ≈ 0.8 × count', () => {
    // 5 equal vendors, each 20% → need 4 to reach 80%
    const vendors = Array.from({ length: 5 }, () => ({ spend_try: 200 }))
    expect(computeVendorPareto80(vendors)).toBe(4)
  })

  it('20 equal vendors → need 16 to reach 80%', () => {
    const vendors = Array.from({ length: 20 }, () => ({ spend_try: 100 }))
    expect(computeVendorPareto80(vendors)).toBe(16)
  })

  it('mixed: 70/20/10 split — first vendor 70% then +20% = 90% → 2 vendors needed for 80%', () => {
    const vendors = [{ spend_try: 700 }, { spend_try: 200 }, { spend_try: 100 }]
    // After sort: [700, 200, 100], total=1000
    // 700/1000=70% < 80, then 900/1000=90% ≥ 80 → needs 2 vendors
    expect(computeVendorPareto80(vendors)).toBe(2)
  })
})
