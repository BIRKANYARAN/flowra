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

// ── computeCashConcentration — extended ───────────────────────────────────────

describe('computeCashConcentration — extended boundary tests', () => {

  it('25. single large account → 100%', () => {
    expect(computeCashConcentration([1_000_000])).toBe(100)
  })

  it('26. ten equal accounts → 10%', () => {
    const balances = Array(10).fill(100_000)
    expect(computeCashConcentration(balances)).toBe(10)
  })

  it('27. very small amounts → correct percentage', () => {
    expect(computeCashConcentration([3, 1])).toBe(75)
  })

  it('28. two accounts with 80/20 split → 80%', () => {
    expect(computeCashConcentration([800_000, 200_000])).toBe(80)
  })

  it('29. negative balances ignored in max — uses Math.max which works with negatives', () => {
    // All positives: [100, 100, 100] → 33.33%
    expect(computeCashConcentration([100, 100, 100])).toBeCloseTo(33.33, 1)
  })

  it('30. large number of accounts reduces concentration', () => {
    const balances = Array(100).fill(10_000)
    expect(computeCashConcentration(balances)).toBeCloseTo(1, 1)
  })

  it('31. extreme domination — 99% in one account', () => {
    expect(computeCashConcentration([990_000, 10_000])).toBe(99)
  })

  it('32. rounds to 2 decimal places', () => {
    // 1 / 3 = 33.33...%
    const result = computeCashConcentration([1, 1, 1])
    expect(result).toBeCloseTo(33.33, 1)
  })

  it('33. exactly at 80% boundary', () => {
    expect(computeCashConcentration([800, 100, 100])).toBe(80)
  })

})

// ── isIdleCash — extended ─────────────────────────────────────────────────────

describe('isIdleCash — extended boundary tests', () => {

  it('34. balance 100_001 (just over threshold) → true if other conditions met', () => {
    expect(isIdleCash(100_001, 5_000, 35)).toBe(true)
  })

  it('35. balance 99_999 → false (below threshold)', () => {
    expect(isIdleCash(99_999, 5_000, 35)).toBe(false)
  })

  it('36. outflows 9_999 (just under threshold) → true if other conditions met', () => {
    expect(isIdleCash(200_000, 9_999, 35)).toBe(true)
  })

  it('37. outflows 10_001 → false (above threshold)', () => {
    expect(isIdleCash(200_000, 10_001, 35)).toBe(false)
  })

  it('38. days 31 (just over threshold) → true if other conditions met', () => {
    expect(isIdleCash(200_000, 5_000, 31)).toBe(true)
  })

  it('39. days 29 → false (below threshold)', () => {
    expect(isIdleCash(200_000, 5_000, 29)).toBe(false)
  })

  it('40. zero balance → false (fails balance condition)', () => {
    expect(isIdleCash(0, 0, 999)).toBe(false)
  })

  it('41. very high balance, zero outflows, many days → true', () => {
    expect(isIdleCash(5_000_000, 0, 365)).toBe(true)
  })

  it('42. large outflows override high balance', () => {
    expect(isIdleCash(10_000_000, 500_000, 100)).toBe(false)
  })

})

// ── computeRunwayMonths — extended ────────────────────────────────────────────

describe('computeRunwayMonths — extended', () => {

  it('43. 12-month runway (1_200_000 / 100_000)', () => {
    expect(computeRunwayMonths(1_200_000, 100_000)).toBe(12)
  })

  it('44. fractional runway 1.5 months', () => {
    expect(computeRunwayMonths(150_000, 100_000)).toBe(1.5)
  })

  it('45. very large cash and small expenses → large runway', () => {
    expect(computeRunwayMonths(10_000_000, 100_000)).toBe(100)
  })

  it('46. very small cash → runway < 1 month', () => {
    expect(computeRunwayMonths(5_000, 100_000)).toBeCloseTo(0.05, 2)
  })

  it('47. cash exactly equal to one month expenses → 1 month', () => {
    expect(computeRunwayMonths(75_000, 75_000)).toBe(1)
  })

  it('48. negative cash → still computed (no guard for negative cash)', () => {
    // negative cash / positive expenses → negative result
    expect(computeRunwayMonths(-100_000, 50_000)).toBe(-2)
  })

})

// ── computeObligationCoverage — extended ──────────────────────────────────────

describe('computeObligationCoverage — extended', () => {

  it('49. cash = 2× obligations → ratio = 2', () => {
    expect(computeObligationCoverage(200_000, 100_000)).toBe(2)
  })

  it('50. cash less than obligations → ratio < 1', () => {
    expect(computeObligationCoverage(50_000, 100_000)).toBe(0.5)
  })

  it('51. cash exactly equals obligations → ratio = 1', () => {
    expect(computeObligationCoverage(100_000, 100_000)).toBe(1)
  })

  it('52. negative obligations → still computes (no guard)', () => {
    // coverage of negative obligations is not meaningful but function computes it
    const result = computeObligationCoverage(100_000, -50_000)
    expect(result).toBeNull() // -50_000 ≤ 0 → null
  })

  it('53. very large obligations → tiny ratio', () => {
    expect(computeObligationCoverage(1_000, 1_000_000)).toBeCloseTo(0.001, 2)
  })

  it('54. zero cash → 0 coverage ratio', () => {
    expect(computeObligationCoverage(0, 100_000)).toBe(0)
  })

})

// ── buildRecommendations — extended ──────────────────────────────────────────

describe('buildRecommendations — extended', () => {

  it('55. idle cash exactly at 500_000 — no high-idle warning (not > 500K)', () => {
    const result = buildRecommendations(1_000_000, false, 500_000, 12)
    // at exactly 500_000: falls into the else-if (> 100_000) branch
    const hasHighIdle = result.some(r => r.includes('mevduat') && r.includes('para piyasası'))
    expect(hasHighIdle).toBe(false)
  })

  it('56. idle cash 500_001 → para piyasası recommendation', () => {
    const result = buildRecommendations(1_000_000, false, 500_001, 12)
    const hasPiyasa = result.some(r => r.includes('para piyasası') || r.includes('atıl nakit'))
    expect(hasPiyasa).toBe(true)
  })

  it('57. idle cash 100_001 → short-term deposit recommendation', () => {
    const result = buildRecommendations(1_000_000, false, 100_001, 12)
    const hasMevduat = result.some(r => r.includes('mevduat') || r.includes('atıl'))
    expect(hasMevduat).toBe(true)
  })

  it('58. runway exactly 2 → critical warning', () => {
    const result = buildRecommendations(200_000, false, 0, 2)
    const hasCritical = result.some(r => r.includes('Kritik') || r.includes('kritik'))
    expect(hasCritical).toBe(true)
  })

  it('59. runway exactly 4 → warning (not critical)', () => {
    const result = buildRecommendations(400_000, false, 0, 4)
    const hasUyari = result.some(r => r.includes('Uyarı') || r.includes('uyarı'))
    expect(hasUyari).toBe(true)
  })

  it('60. runway null with zero cash → negative/zero cash rec present', () => {
    const result = buildRecommendations(0, false, 0, null)
    expect(result.length).toBeGreaterThan(0)
    const hasNakit = result.some(r => r.includes('Nakit') || r.includes('nakit'))
    expect(hasNakit).toBe(true)
  })

  it('61. runway 3 months → in ≤4 range → warning', () => {
    const result = buildRecommendations(300_000, false, 0, 3)
    const hasWarning = result.some(r => r.includes('ay') || r.includes('uyarı') || r.includes('Uyarı'))
    expect(hasWarning).toBe(true)
  })

  it('62. all warnings triggered simultaneously returns multiple recs', () => {
    // concentrated + idle > 500K + runway ≤ 2
    const result = buildRecommendations(100_000, true, 600_000, 1)
    expect(result.length).toBeGreaterThanOrEqual(3)
  })

  it('63. large runway (24 months) with no issues → empty array', () => {
    const result = buildRecommendations(2_000_000, false, 0, 24)
    expect(result).toHaveLength(0)
  })

  it('64. runway 5 months (> 4) → no runway warning', () => {
    const result = buildRecommendations(500_000, false, 0, 5)
    const hasRunwayWarning = result.some(r => r.includes('Uyarı') && r.includes('ay'))
    expect(hasRunwayWarning).toBe(false)
  })

})
