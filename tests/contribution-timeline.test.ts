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
