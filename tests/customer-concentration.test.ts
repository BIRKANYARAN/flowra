/**
 * Customer Revenue Concentration Analysis — unit tests
 *
 * Tests pure computation logic:
 *   computeHHI, classifyConcentration, classifyCustomerTier, computeHhiTrend
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeHHI,
  classifyConcentration,
  classifyCustomerTier,
  computeHhiTrend,
} from '../lib/services/commercial/customer-concentration.service'
import type { MonthlyHhi } from '../lib/services/commercial/customer-concentration.service'

// ── computeHHI ────────────────────────────────────────────────────────────────

describe('computeHHI — pure', () => {

  // Test 1: single customer monopoly → 10000
  it('returns 10000 for a single customer with 100% share', () => {
    expect(computeHHI([100])).toBe(10000)
  })

  // Test 2: two equal customers → 5000
  it('returns 5000 for two customers with 50% each', () => {
    expect(computeHHI([50, 50])).toBe(5000)
  })

  // Test 3: empty array → 0
  it('returns 0 for empty array', () => {
    expect(computeHHI([])).toBe(0)
  })

  // Test 4: four equal customers → 2500
  it('returns 2500 for four customers with 25% each', () => {
    expect(computeHHI([25, 25, 25, 25])).toBe(2500)
  })

  // Test 5: ten equal customers → 1000
  it('returns 1000 for ten customers with 10% each', () => {
    expect(computeHHI([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBeCloseTo(1000, 5)
  })

  // Test 6: asymmetric distribution
  it('correctly computes HHI for asymmetric shares (70, 20, 10)', () => {
    // 70² + 20² + 10² = 4900 + 400 + 100 = 5400
    expect(computeHHI([70, 20, 10])).toBe(5400)
  })

  // Test 7: single small customer
  it('handles single customer with small share', () => {
    // Only called with shares as % of total revenue
    // Conceptually: 1² = 1
    expect(computeHHI([1])).toBe(1)
  })

  // ── Additional: boundary values, rounding accuracy ────────────────────────

  it('returns 0 for empty shares array (no customers)', () => {
    expect(computeHHI([])).toBe(0)
  })

  it('computes HHI for 5 equal customers (20% each) → 2000', () => {
    expect(computeHHI([20, 20, 20, 20, 20])).toBeCloseTo(2000, 5)
  })

  it('computes HHI for highly skewed distribution (80, 10, 5, 5)', () => {
    // 6400 + 100 + 25 + 25 = 6550
    expect(computeHHI([80, 10, 5, 5])).toBe(6550)
  })

  it('HHI is always ≥ 0', () => {
    expect(computeHHI([33.3, 33.3, 33.4])).toBeGreaterThanOrEqual(0)
  })

  it('HHI is always ≤ 10000 (when shares sum to 100)', () => {
    expect(computeHHI([100])).toBeLessThanOrEqual(10000)
    expect(computeHHI([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])).toBeLessThanOrEqual(10000)
  })

  it('order of shares does not affect HHI (commutative)', () => {
    const hhi1 = computeHHI([70, 20, 10])
    const hhi2 = computeHHI([10, 70, 20])
    const hhi3 = computeHHI([20, 10, 70])
    expect(hhi1).toBe(hhi2)
    expect(hhi2).toBe(hhi3)
  })

  it('computes HHI for three-customer B2B portfolio (60, 30, 10)', () => {
    // 3600 + 900 + 100 = 4600
    expect(computeHHI([60, 30, 10])).toBe(4600)
  })

  it('computes HHI accurately with fractional shares', () => {
    // [33.33, 33.33, 33.34] ≈ 3 equal customers → ~3333
    const result = computeHHI([33.33, 33.33, 33.34])
    expect(result).toBeCloseTo(3333.33, 0)
  })

  it('single large + many small: dominance visible in HHI', () => {
    // 50% + 10×5% = 50²+10×5² = 2500+250 = 2750
    expect(computeHHI([50, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toBe(2750)
  })

})

// ── classifyConcentration ─────────────────────────────────────────────────────

describe('classifyConcentration — pure', () => {

  // Test 8: below 1500 → unconcentrated
  it('classifies HHI 1000 as unconcentrated', () => {
    expect(classifyConcentration(1000)).toBe('unconcentrated')
  })

  // Test 9: exactly 1500 → moderate (boundary)
  it('classifies HHI 1500 as moderate (boundary)', () => {
    expect(classifyConcentration(1500)).toBe('moderate')
  })

  // Test 10: between 1500 and 2500 → moderate
  it('classifies HHI 2000 as moderate', () => {
    expect(classifyConcentration(2000)).toBe('moderate')
  })

  // Test 11: exactly 2500 → concentrated (boundary)
  it('classifies HHI 2500 as concentrated (boundary)', () => {
    expect(classifyConcentration(2500)).toBe('concentrated')
  })

  // Test 12: above 4000 → highly_concentrated
  it('classifies HHI 3000 as concentrated', () => {
    expect(classifyConcentration(3000)).toBe('concentrated')
  })

  it('classifies HHI 5000 as highly_concentrated', () => {
    expect(classifyConcentration(5000)).toBe('highly_concentrated')
  })

  it('classifies HHI 10000 (monopoly) as highly_concentrated', () => {
    expect(classifyConcentration(10000)).toBe('highly_concentrated')
  })

  // ── Additional: all boundary transitions ─────────────────────────────────

  it('returns unconcentrated for HHI 0 (no customers — edge)', () => {
    expect(classifyConcentration(0)).toBe('unconcentrated')
  })

  it('returns unconcentrated for HHI 1499 (just below moderate boundary)', () => {
    expect(classifyConcentration(1499)).toBe('unconcentrated')
  })

  it('boundary: 1499 is unconcentrated, 1500 is moderate', () => {
    expect(classifyConcentration(1499)).toBe('unconcentrated')
    expect(classifyConcentration(1500)).toBe('moderate')
  })

  it('boundary: 2499 is moderate, 2500 is concentrated', () => {
    expect(classifyConcentration(2499)).toBe('moderate')
    expect(classifyConcentration(2500)).toBe('concentrated')
  })

  it('boundary: 3999 is concentrated, 4000 is highly_concentrated', () => {
    expect(classifyConcentration(3999)).toBe('concentrated')
    expect(classifyConcentration(4000)).toBe('highly_concentrated')
  })

  it('classifies HHI 4000 as highly_concentrated', () => {
    expect(classifyConcentration(4000)).toBe('highly_concentrated')
  })

  it('ten equal customers (HHI=1000) → unconcentrated (healthy portfolio)', () => {
    const hhi = computeHHI([10, 10, 10, 10, 10, 10, 10, 10, 10, 10])
    expect(classifyConcentration(hhi)).toBe('unconcentrated')
  })

  it('two equal customers (HHI=5000) → highly_concentrated', () => {
    const hhi = computeHHI([50, 50])
    expect(classifyConcentration(hhi)).toBe('highly_concentrated')
  })

  it('monopoly (HHI=10000) → highly_concentrated', () => {
    expect(classifyConcentration(computeHHI([100]))).toBe('highly_concentrated')
  })

})

// ── classifyCustomerTier ──────────────────────────────────────────────────────

describe('classifyCustomerTier — pure', () => {

  // Test 13: >20% → tier1
  it('classifies 25% share as tier1', () => {
    expect(classifyCustomerTier(25)).toBe('tier1')
  })

  // Test 14: 5–20% → tier2
  it('classifies 10% share as tier2', () => {
    expect(classifyCustomerTier(10)).toBe('tier2')
  })

  // Test 15: 1–5% → tier3
  it('classifies 3% share as tier3', () => {
    expect(classifyCustomerTier(3)).toBe('tier3')
  })

  // Test 16: <1% → tier4
  it('classifies 0.5% share as tier4', () => {
    expect(classifyCustomerTier(0.5)).toBe('tier4')
  })

  // Boundary tests
  it('classifies exactly 20% as tier2 (boundary)', () => {
    expect(classifyCustomerTier(20)).toBe('tier2')
  })

  it('classifies exactly 5% as tier2 (lower boundary)', () => {
    expect(classifyCustomerTier(5)).toBe('tier2')
  })

  it('classifies exactly 1% as tier3 (lower boundary)', () => {
    expect(classifyCustomerTier(1)).toBe('tier3')
  })

  it('classifies 0% as tier4', () => {
    expect(classifyCustomerTier(0)).toBe('tier4')
  })

  // ── Additional: precise boundary transitions ──────────────────────────────

  it('boundary: 20.01% is tier1, 20% is tier2', () => {
    expect(classifyCustomerTier(20.01)).toBe('tier1')
    expect(classifyCustomerTier(20)).toBe('tier2')
  })

  it('boundary: 5% is tier2, 4.99% is tier3', () => {
    expect(classifyCustomerTier(5)).toBe('tier2')
    expect(classifyCustomerTier(4.99)).toBe('tier3')
  })

  it('boundary: 1% is tier3, 0.99% is tier4', () => {
    expect(classifyCustomerTier(1)).toBe('tier3')
    expect(classifyCustomerTier(0.99)).toBe('tier4')
  })

  it('classifies 100% (monopoly customer) as tier1', () => {
    expect(classifyCustomerTier(100)).toBe('tier1')
  })

  it('classifies 50% share as tier1 (dominant customer)', () => {
    expect(classifyCustomerTier(50)).toBe('tier1')
  })

  it('classifies 0.1% share as tier4 (very small customer)', () => {
    expect(classifyCustomerTier(0.1)).toBe('tier4')
  })

  it('classifies 21% share as tier1', () => {
    expect(classifyCustomerTier(21)).toBe('tier1')
  })

  it('classifies 19.9% share as tier2', () => {
    expect(classifyCustomerTier(19.9)).toBe('tier2')
  })

  it('classifies 2% share as tier3', () => {
    expect(classifyCustomerTier(2)).toBe('tier3')
  })

})

// ── computeHhiTrend ───────────────────────────────────────────────────────────

describe('computeHhiTrend — pure', () => {

  function makeMonthly(months: string[], hhis: number[]): MonthlyHhi[] {
    return months.map((month, i) => ({
      month,
      label: month,
      hhi: hhis[i],
      level: classifyConcentration(hhis[i]),
    }))
  }

  // Test 17: insufficient data (<6 months)
  it('returns insufficient when fewer than 6 months', () => {
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03'],
      [3000, 2800, 2600],
    )
    expect(computeHhiTrend(data)).toBe('insufficient')
  })

  // Test 18: exactly 0 months → insufficient
  it('returns insufficient for empty array', () => {
    expect(computeHhiTrend([])).toBe('insufficient')
  })

  // Test 19: improving trend
  it('returns improving when last 3m avg is lower than prior 3m by >100', () => {
    // prior 3m: avg 3000; last 3m: avg 1800 → diff = -1200 → improving
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [3000, 3000, 3000, 1800, 1800, 1800],
    )
    expect(computeHhiTrend(data)).toBe('improving')
  })

  // Test 20: worsening trend
  it('returns worsening when last 3m avg is higher than prior 3m by >100', () => {
    // prior 3m: avg 1500; last 3m: avg 3000 → diff = +1500 → worsening
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [1500, 1500, 1500, 3000, 3000, 3000],
    )
    expect(computeHhiTrend(data)).toBe('worsening')
  })

  // Test 21: stable trend (difference <=100)
  it('returns stable when last 3m avg differs from prior by <=100', () => {
    // prior avg 2000; last avg 2050 → diff = +50 → stable
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 2050, 2050, 2050],
    )
    expect(computeHhiTrend(data)).toBe('stable')
  })

  // Test 22: uses last 6 months when more are provided
  it('uses only last 6 months when more than 6 provided', () => {
    // months 1–3: old data with HHI=5000 (should be ignored)
    // months 4–6: prior with HHI=2000; months 7–9: last with HHI=1800 (improving)
    const data = makeMonthly(
      ['2024-07', '2024-08', '2024-09', '2024-10', '2024-11', '2024-12',
       '2025-01', '2025-02', '2025-03'],
      [5000, 5000, 5000, 2000, 2000, 2000, 800, 800, 800],
    )
    expect(computeHhiTrend(data)).toBe('improving')
  })

  // ── Additional: boundary exactness, edge cases ────────────────────────────

  it('returns insufficient for exactly 5 months', () => {
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05'],
      [2000, 2000, 2000, 2000, 2000],
    )
    expect(computeHhiTrend(data)).toBe('insufficient')
  })

  it('returns a valid trend (not insufficient) for exactly 6 months', () => {
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 2000, 2000, 2000],
    )
    expect(computeHhiTrend(data)).not.toBe('insufficient')
  })

  it('returns stable at exactly ±100 diff boundary', () => {
    // prior avg 2000, last avg 2100 → diff = +100 → stable (not > 100)
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 2100, 2100, 2100],
    )
    expect(computeHhiTrend(data)).toBe('stable')
  })

  it('returns worsening at diff = 101 (just above stable boundary)', () => {
    // prior avg 2000, last avg 2101 → diff = 101 → worsening
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 2101, 2101, 2101],
    )
    expect(computeHhiTrend(data)).toBe('worsening')
  })

  it('returns improving at diff = -101 (just below stable boundary)', () => {
    // prior avg 2000, last avg 1899 → diff = -101 → improving
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 1899, 1899, 1899],
    )
    expect(computeHhiTrend(data)).toBe('improving')
  })

  it('sorts data by month before computing (out-of-order months)', () => {
    // Provide months in reverse order — function should sort and still compute correctly
    const data = makeMonthly(
      ['2025-06', '2025-05', '2025-04', '2025-03', '2025-02', '2025-01'],
      [1800, 1800, 1800, 3000, 3000, 3000],
    )
    // After sort: [01,02,03] avg=3000, [04,05,06] avg=1800 → improving
    expect(computeHhiTrend(data)).toBe('improving')
  })

  it('returns stable for 6 identical months (zero drift)', () => {
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2500, 2500, 2500, 2500, 2500, 2500],
    )
    expect(computeHhiTrend(data)).toBe('stable')
  })

  it('returns worsening for monopoly-approaching trend', () => {
    // prior avg 2000, last avg 8000 → diff = +6000 → worsening
    const data = makeMonthly(
      ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'],
      [2000, 2000, 2000, 8000, 8000, 8000],
    )
    expect(computeHhiTrend(data)).toBe('worsening')
  })

})
