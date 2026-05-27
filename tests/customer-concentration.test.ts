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

})
