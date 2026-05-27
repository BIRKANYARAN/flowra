/**
 * Interest Accrual Service — pure-logic unit tests
 *
 * Tests for computeDailyInterest, computeMonthlyAccrual, computeYtdAccrual,
 * computeTotalAccrued, hasVukRisk, and helper utilities.
 *
 * Run: npx vitest run tests/interest-accrual.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDailyInterest,
  computeMonthlyAccrual,
  computeYtdAccrual,
  computeTotalAccrued,
  hasVukRisk,
  daysInMonth,
  isLeapYear,
} from '../lib/services/pcle/interest-accrual.service'

// ── computeDailyInterest ─────────────────────────────────────────────────────

describe('computeDailyInterest', () => {
  it('standard: 100 000 × 20% / 365 ≈ 54.79', () => {
    const result = computeDailyInterest(100_000, 20)
    expect(result).toBeCloseTo(54.794520547945205, 6)
  })

  it('zero principal returns 0', () => {
    expect(computeDailyInterest(0, 20)).toBe(0)
  })

  it('zero rate returns 0', () => {
    expect(computeDailyInterest(100_000, 0)).toBe(0)
  })

  it('negative principal returns 0', () => {
    expect(computeDailyInterest(-1000, 20)).toBe(0)
  })

  it('negative rate returns 0', () => {
    expect(computeDailyInterest(100_000, -5)).toBe(0)
  })

  it('50% rate: 100 000 × 50% / 365 ≈ 136.99', () => {
    const result = computeDailyInterest(100_000, 50)
    expect(result).toBeCloseTo(136.9863, 2)
  })

  it('floating point precision — small principal', () => {
    // 1000 × 10% / 365 ≈ 0.27397
    const result = computeDailyInterest(1_000, 10)
    expect(result).toBeCloseTo(0.27397, 4)
  })
})

// ── computeMonthlyAccrual ────────────────────────────────────────────────────

describe('computeMonthlyAccrual', () => {
  it('May 2026 (31 days): 54.79 × 31 ≈ 1698.63', () => {
    const daily = computeDailyInterest(100_000, 20) // ~54.7945
    const result = computeMonthlyAccrual(daily, 2026, 5)
    expect(result).toBeCloseTo(54.7945 * 31, 0)
  })

  it('February 2024 (leap year, 29 days): 54.79 × 29 ≈ 1589.0', () => {
    const daily = 54.794520547945205
    const result = computeMonthlyAccrual(daily, 2024, 2)
    expect(result).toBeCloseTo(daily * 29, 1)
  })

  it('February 2026 (non-leap, 28 days): 54.79 × 28 ≈ 1534.25', () => {
    const daily = 54.794520547945205
    const result = computeMonthlyAccrual(daily, 2026, 2)
    expect(result).toBeCloseTo(daily * 28, 1)
  })

  it('zero daily interest returns 0', () => {
    expect(computeMonthlyAccrual(0, 2026, 5)).toBe(0)
  })

  it('April (30 days) vs March (31 days): April < March', () => {
    const daily = 100
    const april = computeMonthlyAccrual(daily, 2026, 4)
    const march = computeMonthlyAccrual(daily, 2026, 3)
    expect(april).toBe(3000)
    expect(march).toBe(3100)
    expect(april).toBeLessThan(march)
  })

  it('December (31 days): 100 × 31 = 3100', () => {
    expect(computeMonthlyAccrual(100, 2026, 12)).toBe(3100)
  })
})

// ── computeYtdAccrual ────────────────────────────────────────────────────────

describe('computeYtdAccrual', () => {
  it('disbursed Jan 1, today May 27: 100 × 146 = 14600', () => {
    // Jan 1 to May 27: Jan(31) + Feb(28) + Mar(31) + Apr(30) + May(26) = 146 days
    const result = computeYtdAccrual(100, '2026-01-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('disbursed Mar 15, today May 27: 100 × 73 (disbursement after Jan 1)', () => {
    // Mar 15 to May 27: rest of Mar(16) + Apr(30) + May(27) = 73 days
    const result = computeYtdAccrual(100, '2026-03-15', '2026-05-27')
    expect(result).toBe(7300)
  })

  it('disbursed in prior year: YTD starts from Jan 1 of this year', () => {
    // Disbursed 2025-06-01, today 2026-05-27 → YTD starts Jan 1 2026 → 146 days
    const result = computeYtdAccrual(100, '2025-06-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('zero daily interest returns 0', () => {
    expect(computeYtdAccrual(0, '2026-01-01', '2026-05-27')).toBe(0)
  })

  it('disbursement in the future: returns 0', () => {
    const result = computeYtdAccrual(100, '2026-12-01', '2026-05-27')
    expect(result).toBe(0)
  })
})

// ── computeTotalAccrued ──────────────────────────────────────────────────────

describe('computeTotalAccrued', () => {
  it('disbursed Jan 1, today May 27: 100 × 146 = 14600', () => {
    // Jan 1 to May 27 = 146 days
    const result = computeTotalAccrued(100, '2026-01-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('zero daily interest returns 0', () => {
    expect(computeTotalAccrued(0, '2026-01-01', '2026-05-27')).toBe(0)
  })

  it('disbursement equals today: returns 0 (no elapsed days)', () => {
    expect(computeTotalAccrued(100, '2026-05-27', '2026-05-27')).toBe(0)
  })

  it('disbursement after today: returns 0', () => {
    expect(computeTotalAccrued(100, '2026-12-01', '2026-05-27')).toBe(0)
  })

  it('multi-year accrual: 365 days × 100 = 36500', () => {
    const result = computeTotalAccrued(100, '2025-05-27', '2026-05-27')
    // 2025-05-27 to 2026-05-27 = 365 days
    expect(result).toBe(36500)
  })
})

// ── hasVukRisk ───────────────────────────────────────────────────────────────

describe('hasVukRisk', () => {
  it('zero rate + >50K + >365 days → true', () => {
    expect(hasVukRisk(true, 60_000, '2025-01-01', '2026-05-27')).toBe(true)
  })

  it('not zero rate → false (even if other conditions met)', () => {
    expect(hasVukRisk(false, 60_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('principal ≤ 50K → false (zero rate, >365 days)', () => {
    expect(hasVukRisk(true, 40_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('principal exactly 50K → false (threshold is strictly > 50K)', () => {
    expect(hasVukRisk(true, 50_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('duration < 365 days → false (zero rate, >50K)', () => {
    expect(hasVukRisk(true, 60_000, '2026-04-01', '2026-05-27')).toBe(false)
  })

  it('exactly 365 days → false (must be strictly > 365)', () => {
    expect(hasVukRisk(true, 60_000, '2025-05-27', '2026-05-27')).toBe(false)
  })

  it('366 days → true', () => {
    expect(hasVukRisk(true, 60_000, '2025-05-26', '2026-05-27')).toBe(true)
  })

  it('all false: not zero rate, small principal, short duration → false', () => {
    expect(hasVukRisk(false, 10_000, '2026-05-01', '2026-05-27')).toBe(false)
  })
})

// ── daysInMonth helper ───────────────────────────────────────────────────────

describe('daysInMonth', () => {
  it('February 2024 (leap year) = 29', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })

  it('February 2026 (non-leap) = 28', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('January = 31', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
  })

  it('April = 30', () => {
    expect(daysInMonth(2026, 4)).toBe(30)
  })
})

// ── isLeapYear helper ────────────────────────────────────────────────────────

describe('isLeapYear', () => {
  it('2024 is a leap year', () => {
    expect(isLeapYear(2024)).toBe(true)
  })

  it('2026 is not a leap year', () => {
    expect(isLeapYear(2026)).toBe(false)
  })

  it('2000 is a leap year (divisible by 400)', () => {
    expect(isLeapYear(2000)).toBe(true)
  })

  it('1900 is not a leap year (divisible by 100 but not 400)', () => {
    expect(isLeapYear(1900)).toBe(false)
  })
})
