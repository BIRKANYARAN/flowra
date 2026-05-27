/**
 * Treasury Management — unit tests
 *
 * Tests pure computation logic of TreasuryService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCashConcentration,
  isIdleCash,
  computeRunwayMonths,
  computeObligationCoverage,
  buildRecommendations,
} from '../lib/services/finance/treasury.service'

// ── computeCashConcentration ──────────────────────────────────────────────────

describe('computeCashConcentration — pure', () => {

  // Test 1: three equal parts — largest is 100/200 = 50%
  it('1. [100, 50, 50] → 50', () => {
    expect(computeCashConcentration([100, 50, 50])).toBe(50)
  })

  // Test 2: empty array → 0
  it('2. [] → 0', () => {
    expect(computeCashConcentration([])).toBe(0)
  })

  // Test 3: single account → 100%
  it('3. [100] → 100', () => {
    expect(computeCashConcentration([100])).toBe(100)
  })

  // Test 4: all zeros → 0 (no division by zero)
  it('4. [0, 0] → 0 (total is 0, no division by zero)', () => {
    expect(computeCashConcentration([0, 0])).toBe(0)
  })

  // Test 5: dominant account
  it('5. [900, 50, 50] → 90', () => {
    expect(computeCashConcentration([900, 50, 50])).toBe(90)
  })

  // Test 6: two equal accounts
  it('6. [500, 500] → 50', () => {
    expect(computeCashConcentration([500, 500])).toBe(50)
  })

})

// ── isIdleCash ────────────────────────────────────────────────────────────────

describe('isIdleCash — pure', () => {

  // Test 7: all conditions met → true
  it('7. balance>100K, outflows<10K, days>30 → true', () => {
    expect(isIdleCash(200_000, 5_000, 35)).toBe(true)
  })

  // Test 8: balance below threshold → false
  it('8. balance<100K threshold → false', () => {
    expect(isIdleCash(50_000, 5_000, 35)).toBe(false)
  })

  // Test 9: outflows exceed 10K → false
  it('9. outflows>10K → false', () => {
    expect(isIdleCash(200_000, 15_000, 35)).toBe(false)
  })

  // Test 10: days below 30 → false
  it('10. days<30 → false', () => {
    expect(isIdleCash(200_000, 5_000, 25)).toBe(false)
  })

  // Test 11: exactly at balance boundary (100_000 is NOT > 100_000) → false
  it('11. balance exactly 100_000 (not strictly greater) → false', () => {
    expect(isIdleCash(100_000, 5_000, 35)).toBe(false)
  })

  // Test 12: exactly at outflows boundary (10_000 is NOT < 10_000) → false
  it('12. outflows exactly 10_000 (not strictly less) → false', () => {
    expect(isIdleCash(200_000, 10_000, 35)).toBe(false)
  })

  // Test 13: exactly at days boundary (30 is NOT > 30) → false
  it('13. days exactly 30 (not strictly greater) → false', () => {
    expect(isIdleCash(200_000, 5_000, 30)).toBe(false)
  })

})

// ── computeRunwayMonths ───────────────────────────────────────────────────────

describe('computeRunwayMonths — pure', () => {

  // Test 14: standard case
  it('14. 300_000 / 100_000 → 3', () => {
    expect(computeRunwayMonths(300_000, 100_000)).toBe(3)
  })

  // Test 15: zero expenses → null
  it('15. avgMonthlyExpenses=0 → null', () => {
    expect(computeRunwayMonths(300_000, 0)).toBeNull()
  })

  // Test 16: negative expenses → null (expenses ≤ 0 guard)
  it('16. negative expenses → null', () => {
    expect(computeRunwayMonths(300_000, -50_000)).toBeNull()
  })

})

// ── computeObligationCoverage ─────────────────────────────────────────────────

describe('computeObligationCoverage — pure', () => {

  // Test 17: standard case
  it('17. 300_000 / 100_000 → 3', () => {
    expect(computeObligationCoverage(300_000, 100_000)).toBe(3)
  })

  // Test 18: zero obligations → null
  it('18. obligations=0 → null', () => {
    expect(computeObligationCoverage(300_000, 0)).toBeNull()
  })

})

// ── buildRecommendations ──────────────────────────────────────────────────────

describe('buildRecommendations — pure', () => {

  // Test 19: returns array
  it('19. always returns an array', () => {
    const result = buildRecommendations(500_000, false, 0, 12)
    expect(Array.isArray(result)).toBe(true)
  })

  // Test 20: idle cash > 500K → contains mevduat recommendation
  it('20. idleCash>500K → Turkish deposit recommendation present', () => {
    const result = buildRecommendations(1_000_000, false, 600_000, 12)
    const hasMevduat = result.some(r => r.includes('mevduat') || r.includes('atıl'))
    expect(hasMevduat).toBe(true)
  })

  // Test 21: low runway ≤ 2 → critical warning
  it('21. runwayMonths=1 → critical runway warning', () => {
    const result = buildRecommendations(100_000, false, 0, 1)
    const hasCritical = result.some(r => r.toLowerCase().includes('kritik') || r.includes('runway') || r.includes('ay'))
    expect(hasCritical).toBe(true)
  })

  // Test 22: concentrated → concentration warning
  it('22. isConcentrated=true → concentration recommendation', () => {
    const result = buildRecommendations(1_000_000, true, 0, 12)
    const hasConc = result.some(r => r.includes('yoğun') || r.includes('%'))
    expect(hasConc).toBe(true)
  })

  // Test 23: everything healthy → empty (no critical issues)
  it('23. healthy params → empty array (no warnings needed)', () => {
    // large cash, not concentrated, no idle, good runway
    const result = buildRecommendations(5_000_000, false, 0, 24)
    expect(result).toHaveLength(0)
  })

  // Test 24: zero cash → negative cash warning
  it('24. totalCash=0 → negative/zero cash recommendation present', () => {
    const result = buildRecommendations(0, false, 0, null)
    expect(result.length).toBeGreaterThan(0)
  })

})
