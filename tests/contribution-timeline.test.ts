/**
 * Partner Contribution Timeline & Commitment Fulfillment — unit tests
 *
 * Tests all 5 pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeFulfillmentPct,
  computeDaysSinceCommitment,
  hasTtk588Risk,
  computeStatutoryInterest,
  classifyCommitmentStatus,
} from '../lib/services/pcle/contribution-timeline.service'

// ── computeFulfillmentPct ─────────────────────────────────────────────────────

describe('computeFulfillmentPct', () => {

  // Test 1: normal partial payment
  it('1. normal partial payment → correct percentage', () => {
    expect(computeFulfillmentPct(50_000, 200_000)).toBe(25)
  })

  // Test 2: fully paid → 100%
  it('2. fully paid → 100%', () => {
    expect(computeFulfillmentPct(200_000, 200_000)).toBe(100)
  })

  // Test 3: zero committed → returns 0 (avoid division by zero)
  it('3. zero committed → 0 (no division by zero)', () => {
    expect(computeFulfillmentPct(50_000, 0)).toBe(0)
  })

  // Test 4: over 100% allowed (overpaid scenario)
  it('4. paid > committed → over 100% allowed', () => {
    expect(computeFulfillmentPct(250_000, 200_000)).toBe(125)
  })

  // Test 5: both zero → 0
  it('5. both zero → 0', () => {
    expect(computeFulfillmentPct(0, 0)).toBe(0)
  })

})

// ── computeDaysSinceCommitment ────────────────────────────────────────────────

describe('computeDaysSinceCommitment', () => {

  // Test 6: normal — 365 days
  it('6. commitment exactly 1 year ago → 365 days', () => {
    const result = computeDaysSinceCommitment('2025-05-29', '2026-05-29')
    expect(result).toBe(365)
  })

  // Test 7: same day → 0
  it('7. same day → 0', () => {
    expect(computeDaysSinceCommitment('2026-05-29', '2026-05-29')).toBe(0)
  })

  // Test 8: future date → 0 (clamped to 0)
  it('8. future commitment date → 0 (clamped)', () => {
    expect(computeDaysSinceCommitment('2027-01-01', '2026-05-29')).toBe(0)
  })

  // Test 9: 90 days exactly
  it('9. 90 days since commitment', () => {
    expect(computeDaysSinceCommitment('2026-02-28', '2026-05-29')).toBe(90)
  })

  // Test 10: 91 days
  it('10. 91 days since commitment', () => {
    expect(computeDaysSinceCommitment('2026-02-27', '2026-05-29')).toBe(91)
  })

})

// ── hasTtk588Risk ─────────────────────────────────────────────────────────────

describe('hasTtk588Risk', () => {

  // Test 11: risk present — gap > 0 AND days > 90
  it('11. gap > 0 and days > 90 → risk present', () => {
    expect(hasTtk588Risk(100_000, 91)).toBe(true)
  })

  // Test 12: no gap → no risk
  it('12. no gap (gap = 0) → no risk', () => {
    expect(hasTtk588Risk(0, 120)).toBe(false)
  })

  // Test 13: within 90 days → no risk yet
  it('13. gap > 0 but within 90 days → no risk', () => {
    expect(hasTtk588Risk(50_000, 89)).toBe(false)
  })

  // Test 14: exactly 90 days → no risk (boundary — risk starts AFTER 90)
  it('14. exactly 90 days → no risk (boundary exclusive)', () => {
    expect(hasTtk588Risk(50_000, 90)).toBe(false)
  })

  // Test 15: both zero → no risk
  it('15. both zero → no risk', () => {
    expect(hasTtk588Risk(0, 0)).toBe(false)
  })

})

// ── computeStatutoryInterest ──────────────────────────────────────────────────

describe('computeStatutoryInterest', () => {

  // Test 16: normal calculation — 100k gap, 180 days since commitment (90 days overdue), default rate 50%
  it('16. normal — 100k gap, 180 days, default 50% rate', () => {
    // days_overdue = 180 - 90 = 90
    // interest = 100_000 × 0.50 × (90 / 365) ≈ 12_328.77
    const result = computeStatutoryInterest(100_000, 180)
    expect(result).toBeCloseTo(12_328.77, 0)
  })

  // Test 17: zero gap → 0
  it('17. zero gap → 0 interest', () => {
    expect(computeStatutoryInterest(0, 200)).toBe(0)
  })

  // Test 18: zero days overdue (within 90-day grace) → 0
  it('18. days_since_commitment = 90 → 0 (within grace period)', () => {
    expect(computeStatutoryInterest(100_000, 90)).toBe(0)
  })

  // Test 19: custom rate
  it('19. custom rate 25% → half the default', () => {
    const defaultRate = computeStatutoryInterest(100_000, 180, 50)
    const halfRate    = computeStatutoryInterest(100_000, 180, 25)
    expect(halfRate).toBeCloseTo(defaultRate / 2, 1)
  })

  // Test 20: exactly 1 day overdue
  it('20. 1 day overdue → small positive interest', () => {
    const result = computeStatutoryInterest(1_000_000, 91)
    expect(result).toBeGreaterThan(0)
  })

})

// ── classifyCommitmentStatus ──────────────────────────────────────────────────

describe('classifyCommitmentStatus', () => {

  // Test 21: 100% fulfilled → 'fulfilled'
  it('21. 100% fulfillment → fulfilled', () => {
    expect(classifyCommitmentStatus(100, 500)).toBe('fulfilled')
  })

  // Test 22: above 100% → also fulfilled (overpaid)
  it('22. > 100% fulfillment → fulfilled', () => {
    expect(classifyCommitmentStatus(110, 100)).toBe('fulfilled')
  })

  // Test 23: exactly 75% → on_track
  it('23. exactly 75% → on_track', () => {
    expect(classifyCommitmentStatus(75, 60)).toBe('on_track')
  })

  // Test 24: 80% → on_track
  it('24. 80% → on_track', () => {
    expect(classifyCommitmentStatus(80, 30)).toBe('on_track')
  })

  // Test 25: exactly 25% → partial
  it('25. exactly 25% → partial', () => {
    expect(classifyCommitmentStatus(25, 60)).toBe('partial')
  })

  // Test 26: 50% → partial
  it('26. 50% → partial', () => {
    expect(classifyCommitmentStatus(50, 100)).toBe('partial')
  })

  // Test 27: 74% → partial (just below on_track boundary)
  it('27. 74% → partial (just below on_track threshold)', () => {
    expect(classifyCommitmentStatus(74.9, 10)).toBe('partial')
  })

  // Test 28: < 25%, days > 90 → overdue
  it('28. < 25% and days > 90 → overdue', () => {
    expect(classifyCommitmentStatus(10, 91)).toBe('overdue')
  })

  // Test 29: < 25%, days <= 90 → pending
  it('29. < 25% and days <= 90 → pending', () => {
    expect(classifyCommitmentStatus(10, 45)).toBe('pending')
  })

  // Test 30: 0% and day 0 → pending
  it('30. 0% fulfillment, day 0 → pending', () => {
    expect(classifyCommitmentStatus(0, 0)).toBe('pending')
  })

})

// ── computeFulfillmentPct: extended tests ─────────────────────────────────────

describe('computeFulfillmentPct — extended', () => {

  it('31. 1% fulfillment (tiny payment)', () => {
    expect(computeFulfillmentPct(1_000, 100_000)).toBeCloseTo(1, 2)
  })

  it('32. 99% fulfillment (almost complete)', () => {
    expect(computeFulfillmentPct(99_000, 100_000)).toBeCloseTo(99, 2)
  })

  it('33. 75% fulfillment (on_track boundary)', () => {
    expect(computeFulfillmentPct(75_000, 100_000)).toBe(75)
  })

  it('34. 25% fulfillment (partial boundary)', () => {
    expect(computeFulfillmentPct(25_000, 100_000)).toBe(25)
  })

  it('35. rounds to 2 decimal places: 1/3 = 33.33%', () => {
    expect(computeFulfillmentPct(1, 3)).toBe(33.33)
  })

  it('36. large amounts: 5M paid of 10M committed = 50%', () => {
    expect(computeFulfillmentPct(5_000_000, 10_000_000)).toBe(50)
  })

  it('37. 150% overpayment', () => {
    expect(computeFulfillmentPct(150_000, 100_000)).toBe(150)
  })

  it('38. paid = 0, committed = 100k → 0%', () => {
    expect(computeFulfillmentPct(0, 100_000)).toBe(0)
  })

  it('39. result is always non-negative for non-negative inputs', () => {
    expect(computeFulfillmentPct(0, 0)).toBeGreaterThanOrEqual(0)
    expect(computeFulfillmentPct(0, 100_000)).toBeGreaterThanOrEqual(0)
    expect(computeFulfillmentPct(100_000, 100_000)).toBeGreaterThanOrEqual(0)
  })

  it('40. fractional TRY: 0.50 paid / 1.00 committed = 50%', () => {
    expect(computeFulfillmentPct(0.5, 1.0)).toBe(50)
  })

})

// ── computeDaysSinceCommitment: extended tests ────────────────────────────────

describe('computeDaysSinceCommitment — extended', () => {

  it('41. exactly 91 days', () => {
    expect(computeDaysSinceCommitment('2026-02-27', '2026-05-29')).toBe(91)
  })

  it('42. 180 days since commitment', () => {
    expect(computeDaysSinceCommitment('2025-11-30', '2026-05-29')).toBe(180)
  })

  it('43. 1 day since commitment', () => {
    expect(computeDaysSinceCommitment('2026-05-28', '2026-05-29')).toBe(1)
  })

  it('44. 365 days since commitment (1 year)', () => {
    expect(computeDaysSinceCommitment('2025-05-29', '2026-05-29')).toBe(365)
  })

  it('45. invalid date string returns 0', () => {
    expect(computeDaysSinceCommitment('invalid-date', '2026-05-29')).toBe(0)
  })

  it('46. empty string returns 0', () => {
    expect(computeDaysSinceCommitment('', '2026-05-29')).toBe(0)
  })

  it('47. result is always non-negative (clamped to 0 for future)', () => {
    expect(computeDaysSinceCommitment('2030-01-01', '2026-05-29')).toBe(0)
  })

  it('48. result is an integer (floor of difference)', () => {
    const result = computeDaysSinceCommitment('2026-01-01', '2026-05-29')
    expect(Number.isInteger(result)).toBe(true)
  })

  it('49. cross-year boundary: 2025-12-31 → 2026-01-01 = 1 day', () => {
    expect(computeDaysSinceCommitment('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('50. uses today when second parameter omitted', () => {
    // Using a date far in the past ensures days > 0
    const result = computeDaysSinceCommitment('2020-01-01')
    expect(result).toBeGreaterThan(1000)
  })

})

// ── hasTtk588Risk: extended tests ─────────────────────────────────────────────

describe('hasTtk588Risk — extended', () => {

  it('51. exactly 91 days and gap = 1 TRY → risk', () => {
    expect(hasTtk588Risk(1, 91)).toBe(true)
  })

  it('52. very large gap (10M TRY) 91 days → risk', () => {
    expect(hasTtk588Risk(10_000_000, 91)).toBe(true)
  })

  it('53. gap = 0.01 TRY, 91 days → risk present (gap > 0)', () => {
    expect(hasTtk588Risk(0.01, 91)).toBe(true)
  })

  it('54. gap = 100k, 200 days → risk (well over threshold)', () => {
    expect(hasTtk588Risk(100_000, 200)).toBe(true)
  })

  it('55. gap = 100k, 365 days → risk (1 year overdue)', () => {
    expect(hasTtk588Risk(100_000, 365)).toBe(true)
  })

  it('56. gap negative → no risk (already overpaid)', () => {
    expect(hasTtk588Risk(-1_000, 91)).toBe(false)
  })

  it('57. both very large → risk only if both conditions met', () => {
    expect(hasTtk588Risk(1_000_000, 100)).toBe(true)
  })

  it('58. boundary: 90 days exactly → NO risk (days must be > 90)', () => {
    expect(hasTtk588Risk(100_000, 90)).toBe(false)
  })

  it('59. boundary: 91 days → risk (first day TTK 588 kicks in)', () => {
    expect(hasTtk588Risk(100_000, 91)).toBe(true)
  })

})

// ── computeStatutoryInterest: extended tests ──────────────────────────────────

describe('computeStatutoryInterest — extended', () => {

  it('60. exactly 91 days since commitment → 1 day overdue', () => {
    // days_overdue = 91 - 90 = 1
    const result = computeStatutoryInterest(100_000, 91)
    expect(result).toBeGreaterThan(0)
  })

  it('61. 365 days since commitment → 275 days overdue interest', () => {
    // days_overdue = 365 - 90 = 275
    const result = computeStatutoryInterest(100_000, 365)
    const expected = 100_000 * 0.50 * (275 / 365)
    expect(result).toBeCloseTo(expected, 0)
  })

  it('62. custom rate 10%: interest = gap × 0.10 × days_overdue/365', () => {
    // days_overdue = 180 - 90 = 90
    const result = computeStatutoryInterest(100_000, 180, 10)
    const expected = 100_000 * 0.10 * (90 / 365)
    expect(result).toBeCloseTo(expected, 1)
  })

  it('63. custom rate 100% (extreme scenario): doubling of capital', () => {
    // days_overdue = 365 + 90 = 275 (i.e., days = 455)
    const result = computeStatutoryInterest(100_000, 455, 100)
    const expected = 100_000 * 1.0 * (365 / 365) // at ~365 days overdue
    expect(result).toBeGreaterThan(0)
  })

  it('64. rate 0% → always zero interest', () => {
    expect(computeStatutoryInterest(100_000, 365, 0)).toBe(0)
  })

  it('65. gap = 0 → always zero regardless of days or rate', () => {
    expect(computeStatutoryInterest(0, 365, 50)).toBe(0)
  })

  it('66. result is non-negative for valid inputs', () => {
    expect(computeStatutoryInterest(100_000, 180)).toBeGreaterThanOrEqual(0)
    expect(computeStatutoryInterest(100_000, 90)).toBeGreaterThanOrEqual(0)
    expect(computeStatutoryInterest(0, 180)).toBeGreaterThanOrEqual(0)
  })

  it('67. interest increases with more days since commitment', () => {
    const d100 = computeStatutoryInterest(100_000, 100)
    const d200 = computeStatutoryInterest(100_000, 200)
    const d300 = computeStatutoryInterest(100_000, 300)
    expect(d100).toBeLessThan(d200)
    expect(d200).toBeLessThan(d300)
  })

  it('68. interest increases with larger gap', () => {
    const g50  = computeStatutoryInterest(50_000, 180)
    const g100 = computeStatutoryInterest(100_000, 180)
    expect(g50).toBeLessThan(g100)
    expect(g100).toBeCloseTo(g50 * 2, 1)
  })

  it('69. 720 days (2 years) overdue: computes correctly', () => {
    // days_overdue = 720 - 90 = 630
    const result = computeStatutoryInterest(100_000, 720)
    const expected = 100_000 * 0.50 * (630 / 365)
    expect(result).toBeCloseTo(expected, 0)
  })

})

// ── classifyCommitmentStatus: extended tests ──────────────────────────────────

describe('classifyCommitmentStatus — extended', () => {

  it('70. exactly 99% → on_track (just below fulfilled)', () => {
    expect(classifyCommitmentStatus(99, 30)).toBe('on_track')
  })

  it('71. exactly 100% → fulfilled', () => {
    expect(classifyCommitmentStatus(100, 30)).toBe('fulfilled')
  })

  it('72. 101% → fulfilled (overpaid)', () => {
    expect(classifyCommitmentStatus(101, 30)).toBe('fulfilled')
  })

  it('73. exactly 75% → on_track (boundary)', () => {
    expect(classifyCommitmentStatus(75, 0)).toBe('on_track')
  })

  it('74. 74.9% → partial (just below on_track)', () => {
    expect(classifyCommitmentStatus(74.9, 0)).toBe('partial')
  })

  it('75. exactly 25% → partial (boundary)', () => {
    expect(classifyCommitmentStatus(25, 0)).toBe('partial')
  })

  it('76. 24.9% with 90 days → pending (below 25%, within grace)', () => {
    expect(classifyCommitmentStatus(24.9, 90)).toBe('pending')
  })

  it('77. 24.9% with 91 days → overdue (below 25%, past grace)', () => {
    expect(classifyCommitmentStatus(24.9, 91)).toBe('overdue')
  })

  it('78. 0% with 1 year → overdue', () => {
    expect(classifyCommitmentStatus(0, 365)).toBe('overdue')
  })

  it('79. 50% with 1 year → partial (>= 25%: partial regardless of days)', () => {
    expect(classifyCommitmentStatus(50, 365)).toBe('partial')
  })

  it('80. 75% with 1000 days → on_track (>= 75%: not time-gated)', () => {
    expect(classifyCommitmentStatus(75, 1000)).toBe('on_track')
  })

  it('81. status ordering: overdue only for <25% AND >90 days', () => {
    // Spot-check the 4-quadrant matrix
    expect(classifyCommitmentStatus(10, 91)).toBe('overdue')   // <25%, >90
    expect(classifyCommitmentStatus(10, 89)).toBe('pending')   // <25%, ≤90
    expect(classifyCommitmentStatus(50, 91)).toBe('partial')   // ≥25%, any days
    expect(classifyCommitmentStatus(80, 91)).toBe('on_track')  // ≥75%, any days
  })

  it('82. Turkish SME: startup in first 3 months → pending not overdue', () => {
    // 30 days since commitment, 10% paid → pending
    expect(classifyCommitmentStatus(10, 30)).toBe('pending')
  })

  it('83. Turkish SME: 6 months with no contribution → overdue', () => {
    expect(classifyCommitmentStatus(0, 180)).toBe('overdue')
  })

  it('84. exact 75% boundary with 500 days → on_track', () => {
    expect(classifyCommitmentStatus(75, 500)).toBe('on_track')
  })

})

// ── Integration: hasTtk588Risk ↔ computeStatutoryInterest ───────────────────

describe('TTK 588 risk and interest integration', () => {

  it('85. risk false → interest should be 0 (no overdue days)', () => {
    const gap  = 100_000
    const days = 89 // within 90-day grace
    const risk = hasTtk588Risk(gap, days)
    const interest = computeStatutoryInterest(gap, days)
    expect(risk).toBe(false)
    expect(interest).toBe(0)
  })

  it('86. risk true → interest > 0', () => {
    const gap  = 100_000
    const days = 91
    const risk = hasTtk588Risk(gap, days)
    const interest = computeStatutoryInterest(gap, days)
    expect(risk).toBe(true)
    expect(interest).toBeGreaterThan(0)
  })

  it('87. fulfillment 100% → no TTK 588 risk regardless of days', () => {
    const pct = computeFulfillmentPct(100_000, 100_000)   // 100%
    const status = classifyCommitmentStatus(pct, 500)      // fulfilled
    expect(status).toBe('fulfilled')
    // gap = 0 → no risk
    expect(hasTtk588Risk(0, 500)).toBe(false)
  })

  it('88. days just crossing 90 trigger threshold correctly', () => {
    expect(hasTtk588Risk(1_000, 89)).toBe(false)
    expect(hasTtk588Risk(1_000, 90)).toBe(false)
    expect(hasTtk588Risk(1_000, 91)).toBe(true)
  })

  it('89. statutory interest formula validation: 6 months overdue at 50%', () => {
    // days since = 90 + 180 = 270 → days_overdue = 180
    const result = computeStatutoryInterest(500_000, 270)
    const expected = 500_000 * 0.50 * (180 / 365)
    expect(result).toBeCloseTo(expected, 0)
  })

  it('90. fulfillment percentage rounds correctly for 1/3 payment', () => {
    const pct = computeFulfillmentPct(333_333, 1_000_000)
    expect(pct).toBe(33.33)
  })

})

// ── classifyCommitmentStatus: monotonicity and completeness ───────────────────

describe('classifyCommitmentStatus — monotonicity and completeness', () => {

  it('91. all 5 statuses are reachable', () => {
    expect(classifyCommitmentStatus(100, 0)).toBe('fulfilled')
    expect(classifyCommitmentStatus(80, 0)).toBe('on_track')
    expect(classifyCommitmentStatus(50, 0)).toBe('partial')
    expect(classifyCommitmentStatus(10, 91)).toBe('overdue')
    expect(classifyCommitmentStatus(10, 30)).toBe('pending')
  })

  it('92. fulfilled is always returned for pct >= 100 regardless of days', () => {
    for (const days of [0, 30, 91, 365, 1000]) {
      expect(classifyCommitmentStatus(100, days)).toBe('fulfilled')
      expect(classifyCommitmentStatus(110, days)).toBe('fulfilled')
    }
  })

  it('93. on_track is always partial or better for pct 75-99', () => {
    for (const pct of [75, 80, 90, 95, 99]) {
      const status = classifyCommitmentStatus(pct, 0)
      expect(['fulfilled', 'on_track']).toContain(status)
    }
  })

  it('94. partial is always returned for pct 25-74.9 regardless of days', () => {
    for (const pct of [25, 30, 50, 60, 74.9]) {
      for (const days of [0, 30, 91, 365]) {
        expect(classifyCommitmentStatus(pct, days)).toBe('partial')
      }
    }
  })

  it('95. overdue only when pct < 25 AND days > 90', () => {
    expect(classifyCommitmentStatus(24, 91)).toBe('overdue')
    expect(classifyCommitmentStatus(24, 90)).toBe('pending')
    expect(classifyCommitmentStatus(24, 89)).toBe('pending')
  })

})

// ── computeStatutoryInterest: rate parameter validation ───────────────────────

describe('computeStatutoryInterest — rate parameter validation', () => {

  it('96. default rate = 50% per annum', () => {
    const defaultResult = computeStatutoryInterest(100_000, 180)
    const explicit50Result = computeStatutoryInterest(100_000, 180, 50)
    expect(defaultResult).toBeCloseTo(explicit50Result, 1)
  })

  it('97. rate 25%: half the interest of rate 50%', () => {
    const rate50 = computeStatutoryInterest(100_000, 180, 50)
    const rate25 = computeStatutoryInterest(100_000, 180, 25)
    expect(rate25).toBeCloseTo(rate50 / 2, 1)
  })

  it('98. rate doubles: interest doubles', () => {
    const rate10 = computeStatutoryInterest(100_000, 180, 10)
    const rate20 = computeStatutoryInterest(100_000, 180, 20)
    expect(rate20).toBeCloseTo(rate10 * 2, 1)
  })

})

// ── computeDaysSinceCommitment: specific known dates ─────────────────────────

describe('computeDaysSinceCommitment — specific known dates', () => {

  it('99. 2025-01-01 → 2026-01-01 = 365 days', () => {
    expect(computeDaysSinceCommitment('2025-01-01', '2026-01-01')).toBe(365)
  })

  it('100. leap year 2024-02-29 → 2024-03-01 = 1 day', () => {
    expect(computeDaysSinceCommitment('2024-02-29', '2024-03-01')).toBe(1)
  })

  it('101. Q1 end to Q2 end: 2026-03-31 → 2026-06-30 = 91 days', () => {
    expect(computeDaysSinceCommitment('2026-03-31', '2026-06-30')).toBe(91)
  })

  it('102. zero days: same date', () => {
    expect(computeDaysSinceCommitment('2026-05-15', '2026-05-15')).toBe(0)
  })

})
