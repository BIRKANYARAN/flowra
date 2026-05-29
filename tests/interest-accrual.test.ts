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
  it('1 — standard: 100 000 × 20% / 365 ≈ 54.79', () => {
    const result = computeDailyInterest(100_000, 20)
    expect(result).toBeCloseTo(54.794520547945205, 6)
  })

  it('2 — zero principal returns 0', () => {
    expect(computeDailyInterest(0, 20)).toBe(0)
  })

  it('3 — zero rate returns 0', () => {
    expect(computeDailyInterest(100_000, 0)).toBe(0)
  })

  it('4 — negative principal returns 0', () => {
    expect(computeDailyInterest(-1000, 20)).toBe(0)
  })

  it('5 — negative rate returns 0', () => {
    expect(computeDailyInterest(100_000, -5)).toBe(0)
  })

  it('6 — 50% rate: 100 000 × 50% / 365 ≈ 136.99', () => {
    const result = computeDailyInterest(100_000, 50)
    expect(result).toBeCloseTo(136.9863, 2)
  })

  it('7 — floating point precision — small principal', () => {
    // 1000 × 10% / 365 ≈ 0.27397
    const result = computeDailyInterest(1_000, 10)
    expect(result).toBeCloseTo(0.27397, 4)
  })

  it('8 — scales linearly with principal', () => {
    const r1 = computeDailyInterest(50_000, 20)
    const r2 = computeDailyInterest(100_000, 20)
    expect(r2).toBeCloseTo(r1 * 2, 6)
  })

  it('9 — scales linearly with rate', () => {
    const r1 = computeDailyInterest(100_000, 10)
    const r2 = computeDailyInterest(100_000, 20)
    expect(r2).toBeCloseTo(r1 * 2, 6)
  })

  it('10 — 1% rate on 365 000 → exactly 10 per day', () => {
    const result = computeDailyInterest(365_000, 1)
    expect(result).toBeCloseTo(10, 6)
  })

  it('11 — large principal: 10M at 40%', () => {
    const result = computeDailyInterest(10_000_000, 40)
    expect(result).toBeCloseTo(10_000_000 * 0.40 / 365, 2)
  })

  it('12 — exactly 1 TRY at 100%', () => {
    const result = computeDailyInterest(1, 100)
    expect(result).toBeCloseTo(1 / 365, 8)
  })
})

// ── computeMonthlyAccrual ────────────────────────────────────────────────────

describe('computeMonthlyAccrual', () => {
  it('13 — May 2026 (31 days): 54.79 × 31 ≈ 1698.63', () => {
    const daily = computeDailyInterest(100_000, 20) // ~54.7945
    const result = computeMonthlyAccrual(daily, 2026, 5)
    expect(result).toBeCloseTo(54.7945 * 31, 0)
  })

  it('14 — February 2024 (leap year, 29 days): 54.79 × 29 ≈ 1589.0', () => {
    const daily = 54.794520547945205
    const result = computeMonthlyAccrual(daily, 2024, 2)
    expect(result).toBeCloseTo(daily * 29, 1)
  })

  it('15 — February 2026 (non-leap, 28 days): 54.79 × 28 ≈ 1534.25', () => {
    const daily = 54.794520547945205
    const result = computeMonthlyAccrual(daily, 2026, 2)
    expect(result).toBeCloseTo(daily * 28, 1)
  })

  it('16 — zero daily interest returns 0', () => {
    expect(computeMonthlyAccrual(0, 2026, 5)).toBe(0)
  })

  it('17 — April (30 days) vs March (31 days): April < March', () => {
    const daily = 100
    const april = computeMonthlyAccrual(daily, 2026, 4)
    const march = computeMonthlyAccrual(daily, 2026, 3)
    expect(april).toBe(3000)
    expect(march).toBe(3100)
    expect(april).toBeLessThan(march)
  })

  it('18 — December (31 days): 100 × 31 = 3100', () => {
    expect(computeMonthlyAccrual(100, 2026, 12)).toBe(3100)
  })

  it('19 — January always 31 days', () => {
    expect(computeMonthlyAccrual(10, 2026, 1)).toBe(310)
  })

  it('20 — June (30 days)', () => {
    expect(computeMonthlyAccrual(50, 2026, 6)).toBe(1500)
  })

  it('21 — negative daily interest returns 0', () => {
    expect(computeMonthlyAccrual(-10, 2026, 3)).toBe(0)
  })

  it('22 — February leap vs non-leap differ by 1 day', () => {
    const daily = 100
    const leap    = computeMonthlyAccrual(daily, 2024, 2) // 29 days
    const nonLeap = computeMonthlyAccrual(daily, 2026, 2) // 28 days
    expect(leap - nonLeap).toBeCloseTo(100, 2)
  })

  it('23 — result is rounded to 2 decimal places', () => {
    const result = computeMonthlyAccrual(33.333, 2026, 3) // 33.333 × 31
    const str = result.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})

// ── computeYtdAccrual ────────────────────────────────────────────────────────

describe('computeYtdAccrual', () => {
  it('24 — disbursed Jan 1, today May 27: 100 × 146 = 14600', () => {
    // Jan 1 to May 27: Jan(31) + Feb(28) + Mar(31) + Apr(30) + May(26) = 146 days
    const result = computeYtdAccrual(100, '2026-01-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('25 — disbursed Mar 15, today May 27: 100 × 73 (disbursement after Jan 1)', () => {
    // Mar 15 to May 27: rest of Mar(16) + Apr(30) + May(27) = 73 days
    const result = computeYtdAccrual(100, '2026-03-15', '2026-05-27')
    expect(result).toBe(7300)
  })

  it('26 — disbursed in prior year: YTD starts from Jan 1 of this year', () => {
    // Disbursed 2025-06-01, today 2026-05-27 → YTD starts Jan 1 2026 → 146 days
    const result = computeYtdAccrual(100, '2025-06-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('27 — zero daily interest returns 0', () => {
    expect(computeYtdAccrual(0, '2026-01-01', '2026-05-27')).toBe(0)
  })

  it('28 — disbursement in the future: returns 0', () => {
    const result = computeYtdAccrual(100, '2026-12-01', '2026-05-27')
    expect(result).toBe(0)
  })

  it('29 — same day disbursement and today returns 0', () => {
    const result = computeYtdAccrual(100, '2026-05-27', '2026-05-27')
    expect(result).toBe(0)
  })

  it('30 — disbursed Jan 1, today Jan 2: 1 day', () => {
    const result = computeYtdAccrual(100, '2026-01-01', '2026-01-02')
    expect(result).toBe(100)
  })

  it('31 — disbursed Dec 31 prior year: YTD = full year-to-date from Jan 1', () => {
    // Disbursed 2025-12-31, today 2026-05-01 → YTD from Jan 1 2026
    const result = computeYtdAccrual(100, '2025-12-31', '2026-05-01')
    // Jan(31) + Feb(28) + Mar(31) + Apr(30) = 120 days
    expect(result).toBe(12000)
  })

  it('32 — negative daily interest returns 0', () => {
    expect(computeYtdAccrual(-50, '2026-01-01', '2026-05-27')).toBe(0)
  })
})

// ── computeTotalAccrued ──────────────────────────────────────────────────────

describe('computeTotalAccrued', () => {
  it('33 — disbursed Jan 1, today May 27: 100 × 146 = 14600', () => {
    // Jan 1 to May 27 = 146 days
    const result = computeTotalAccrued(100, '2026-01-01', '2026-05-27')
    expect(result).toBe(14600)
  })

  it('34 — zero daily interest returns 0', () => {
    expect(computeTotalAccrued(0, '2026-01-01', '2026-05-27')).toBe(0)
  })

  it('35 — disbursement equals today: returns 0 (no elapsed days)', () => {
    expect(computeTotalAccrued(100, '2026-05-27', '2026-05-27')).toBe(0)
  })

  it('36 — disbursement after today: returns 0', () => {
    expect(computeTotalAccrued(100, '2026-12-01', '2026-05-27')).toBe(0)
  })

  it('37 — multi-year accrual: 365 days × 100 = 36500', () => {
    const result = computeTotalAccrued(100, '2025-05-27', '2026-05-27')
    // 2025-05-27 to 2026-05-27 = 365 days
    expect(result).toBe(36500)
  })

  it('38 — 1 day accrual', () => {
    const result = computeTotalAccrued(100, '2026-05-26', '2026-05-27')
    expect(result).toBe(100)
  })

  it('39 — 2 year accrual: 730 or 731 days (leap year check)', () => {
    // 2024-01-01 to 2026-01-01: 2024 is leap (366) + 2025 (365) = 731 days
    const result = computeTotalAccrued(1, '2024-01-01', '2026-01-01')
    expect(result).toBeGreaterThanOrEqual(730)
    expect(result).toBeLessThanOrEqual(732)
  })

  it('40 — old disbursement: 10 years accrual is very large', () => {
    const result = computeTotalAccrued(100, '2016-01-01', '2026-01-01')
    expect(result).toBeGreaterThan(300_000) // ~3650 days × 100
  })

  it('41 — negative daily interest returns 0', () => {
    expect(computeTotalAccrued(-10, '2026-01-01', '2026-05-27')).toBe(0)
  })
})

// ── hasVukRisk ───────────────────────────────────────────────────────────────

describe('hasVukRisk', () => {
  it('42 — zero rate + >50K + >365 days → true', () => {
    expect(hasVukRisk(true, 60_000, '2025-01-01', '2026-05-27')).toBe(true)
  })

  it('43 — not zero rate → false (even if other conditions met)', () => {
    expect(hasVukRisk(false, 60_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('44 — principal ≤ 50K → false (zero rate, >365 days)', () => {
    expect(hasVukRisk(true, 40_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('45 — principal exactly 50K → false (threshold is strictly > 50K)', () => {
    expect(hasVukRisk(true, 50_000, '2025-01-01', '2026-05-27')).toBe(false)
  })

  it('46 — duration < 365 days → false (zero rate, >50K)', () => {
    expect(hasVukRisk(true, 60_000, '2026-04-01', '2026-05-27')).toBe(false)
  })

  it('47 — exactly 365 days → false (must be strictly > 365)', () => {
    expect(hasVukRisk(true, 60_000, '2025-05-27', '2026-05-27')).toBe(false)
  })

  it('48 — 366 days → true', () => {
    expect(hasVukRisk(true, 60_000, '2025-05-26', '2026-05-27')).toBe(true)
  })

  it('49 — all false: not zero rate, small principal, short duration → false', () => {
    expect(hasVukRisk(false, 10_000, '2026-05-01', '2026-05-27')).toBe(false)
  })

  it('50 — principal 50_001 (just above threshold): zero rate + >365 days → true', () => {
    expect(hasVukRisk(true, 50_001, '2025-01-01', '2026-05-27')).toBe(true)
  })

  it('51 — large principal 10M, zero rate, 2 years → true', () => {
    expect(hasVukRisk(true, 10_000_000, '2024-01-01', '2026-05-27')).toBe(true)
  })

  it('52 — zero principal → false', () => {
    expect(hasVukRisk(true, 0, '2025-01-01', '2026-05-27')).toBe(false)
  })
})

// ── daysInMonth helper ───────────────────────────────────────────────────────

describe('daysInMonth', () => {
  it('53 — February 2024 (leap year) = 29', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })

  it('54 — February 2026 (non-leap) = 28', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
  })

  it('55 — January = 31', () => {
    expect(daysInMonth(2026, 1)).toBe(31)
  })

  it('56 — April = 30', () => {
    expect(daysInMonth(2026, 4)).toBe(30)
  })

  it('57 — June = 30', () => {
    expect(daysInMonth(2026, 6)).toBe(30)
  })

  it('58 — July = 31', () => {
    expect(daysInMonth(2026, 7)).toBe(31)
  })

  it('59 — November = 30', () => {
    expect(daysInMonth(2026, 11)).toBe(30)
  })

  it('60 — December = 31', () => {
    expect(daysInMonth(2026, 12)).toBe(31)
  })

  it('61 — September = 30', () => {
    expect(daysInMonth(2026, 9)).toBe(30)
  })

  it('62 — October = 31', () => {
    expect(daysInMonth(2026, 10)).toBe(31)
  })
})

// ── isLeapYear helper ────────────────────────────────────────────────────────

describe('isLeapYear', () => {
  it('63 — 2024 is a leap year', () => {
    expect(isLeapYear(2024)).toBe(true)
  })

  it('64 — 2026 is not a leap year', () => {
    expect(isLeapYear(2026)).toBe(false)
  })

  it('65 — 2000 is a leap year (divisible by 400)', () => {
    expect(isLeapYear(2000)).toBe(true)
  })

  it('66 — 1900 is not a leap year (divisible by 100 but not 400)', () => {
    expect(isLeapYear(1900)).toBe(false)
  })

  it('67 — 2028 is a leap year', () => {
    expect(isLeapYear(2028)).toBe(true)
  })

  it('68 — 2100 is not a leap year', () => {
    expect(isLeapYear(2100)).toBe(false)
  })

  it('69 — 2400 is a leap year', () => {
    expect(isLeapYear(2400)).toBe(true)
  })

  it('70 — 2023 is not a leap year', () => {
    expect(isLeapYear(2023)).toBe(false)
  })

  it('71 — odd years are never leap years', () => {
    const oddYears = [2001, 2003, 2005, 2007, 2009, 2011]
    for (const y of oddYears) {
      expect(isLeapYear(y)).toBe(false)
    }
  })
})

// ── Cross-function integration checks ───────────────────────────────────────

describe('interest accrual cross-function consistency', () => {

  it('72 — monthly accrual ≈ daily × days_in_that_month', () => {
    const daily = computeDailyInterest(500_000, 30)
    const monthly = computeMonthlyAccrual(daily, 2026, 3)
    expect(monthly).toBeCloseTo(daily * 31, 1)
  })

  it('73 — total accrued for exactly 1 year = daily × 365', () => {
    const daily = computeDailyInterest(100_000, 20)
    const total = computeTotalAccrued(daily, '2025-05-29', '2026-05-29')
    expect(total).toBeCloseTo(daily * 365, 0)
  })

  it('74 — YTD and total are equal when disbursement is in same year', () => {
    const daily = 100
    const disb = '2026-01-01'
    const today = '2026-06-01'
    const ytd   = computeYtdAccrual(daily, disb, today)
    const total = computeTotalAccrued(daily, disb, today)
    // Both start from same date (disbursement >= Jan 1)
    expect(ytd).toBeCloseTo(total, 2)
  })

  it('75 — YTD < total when disbursement was prior year', () => {
    const daily = 100
    const disbPriorYear = '2024-06-01'
    const today         = '2026-06-01'
    const ytd   = computeYtdAccrual(daily, disbPriorYear, today)
    const total = computeTotalAccrued(daily, disbPriorYear, today)
    expect(ytd).toBeLessThan(total)
  })

  it('76 — VUK risk boundary: principal 50001, 0 rate, 366 days → true', () => {
    expect(hasVukRisk(true, 50_001, '2025-05-28', '2026-05-29')).toBe(true)
  })

  it('77 — computeDailyInterest result is always non-negative', () => {
    const values = [
      [0, 0], [100, 0], [0, 20], [100_000, 50], [-100, 20],
    ] as [number, number][]
    for (const [p, r] of values) {
      expect(computeDailyInterest(p, r)).toBeGreaterThanOrEqual(0)
    }
  })

  it('78 — daysInMonth covers all 12 months of a year', () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    for (let m = 1; m <= 12; m++) {
      expect(daysInMonth(2026, m)).toBe(expected[m - 1])
    }
  })

  it('79 — computeYtdAccrual: disbursement same as today → 0', () => {
    expect(computeYtdAccrual(50, '2026-05-29', '2026-05-29')).toBe(0)
  })

  it('80 — hasVukRisk: with rate returns false immediately', () => {
    // Even if all other conditions are met, rate > 0 means no risk
    expect(hasVukRisk(false, 1_000_000, '2020-01-01', '2026-01-01')).toBe(false)
  })
})

// ── daysInMonth — all 12 months exhaustive ───────────────────────────────────

describe('daysInMonth — all 12 months exhaustive', () => {
  it('March has 31 days', () => {
    expect(daysInMonth(2026, 3)).toBe(31)
  })

  it('May has 31 days', () => {
    expect(daysInMonth(2026, 5)).toBe(31)
  })

  it('August has 31 days', () => {
    expect(daysInMonth(2026, 8)).toBe(31)
  })

  it('February 2000 (leap year divisible by 400) has 29 days', () => {
    expect(daysInMonth(2000, 2)).toBe(29)
  })

  it('February 2100 (not a leap year) has 28 days', () => {
    expect(daysInMonth(2100, 2)).toBe(28)
  })

  it('September has 30 days in any year', () => {
    expect(daysInMonth(2025, 9)).toBe(30)
    expect(daysInMonth(2026, 9)).toBe(30)
  })

  it('31-day months: Jan, Mar, May, Jul, Aug, Oct, Dec', () => {
    const months31 = [1, 3, 5, 7, 8, 10, 12]
    for (const m of months31) {
      expect(daysInMonth(2026, m)).toBe(31)
    }
  })

  it('30-day months: Apr, Jun, Sep, Nov', () => {
    const months30 = [4, 6, 9, 11]
    for (const m of months30) {
      expect(daysInMonth(2026, m)).toBe(30)
    }
  })
})

// ── isLeapYear — additional precision cases ───────────────────────────────────

describe('isLeapYear — additional precision cases', () => {
  it('2024 divisible by 4 and not 100 → leap', () => {
    expect(isLeapYear(2024)).toBe(true)
  })

  it('2100 divisible by 100 but not 400 → not leap', () => {
    expect(isLeapYear(2100)).toBe(false)
  })

  it('2000 divisible by 400 → leap', () => {
    expect(isLeapYear(2000)).toBe(true)
  })

  it('2023 not divisible by 4 → not leap', () => {
    expect(isLeapYear(2023)).toBe(false)
  })

  it('1800 divisible by 100 but not 400 → not leap', () => {
    expect(isLeapYear(1800)).toBe(false)
  })

  it('1600 divisible by 400 → leap', () => {
    expect(isLeapYear(1600)).toBe(true)
  })

  it('every 4th year from 2024 to 2036 is leap', () => {
    expect(isLeapYear(2028)).toBe(true)
    expect(isLeapYear(2032)).toBe(true)
    expect(isLeapYear(2036)).toBe(true)
  })
})

// ── computeDailyInterest — formula precision ─────────────────────────────────

describe('computeDailyInterest — formula precision', () => {
  it('formula: principal × annualRatePct / 100 / 365', () => {
    const principal = 200_000
    const rate = 36.5 // 36.5% annual
    const expected = 200_000 * (36.5 / 100) / 365
    expect(computeDailyInterest(principal, rate)).toBeCloseTo(expected, 6)
  })

  it('1% annual on 365 TRY = exactly 0.01 per day', () => {
    expect(computeDailyInterest(365, 1)).toBeCloseTo(0.01, 6)
  })

  it('100% annual on 100 TRY ≈ 0.2739 per day', () => {
    expect(computeDailyInterest(100, 100)).toBeCloseTo(100 / 365, 6)
  })

  it('scales proportionally with rate doubling', () => {
    const r10 = computeDailyInterest(100_000, 10)
    const r20 = computeDailyInterest(100_000, 20)
    expect(r20).toBeCloseTo(r10 * 2, 8)
  })

  it('scales proportionally with principal tripling', () => {
    const p100 = computeDailyInterest(100_000, 20)
    const p300 = computeDailyInterest(300_000, 20)
    expect(p300).toBeCloseTo(p100 * 3, 8)
  })
})

// ── computeMonthlyAccrual — month-specific checks ─────────────────────────────

describe('computeMonthlyAccrual — month-specific checks', () => {
  it('July has 31 days: 50 × 31 = 1550', () => {
    expect(computeMonthlyAccrual(50, 2026, 7)).toBe(1550)
  })

  it('September has 30 days: 100 × 30 = 3000', () => {
    expect(computeMonthlyAccrual(100, 2026, 9)).toBe(3000)
  })

  it('February 2000 (leap, 29 days): 10 × 29 = 290', () => {
    expect(computeMonthlyAccrual(10, 2000, 2)).toBe(290)
  })

  it('February 2100 (non-leap, 28 days): 10 × 28 = 280', () => {
    expect(computeMonthlyAccrual(10, 2100, 2)).toBe(280)
  })

  it('result equals dailyInterest × daysInMonth(year, month)', () => {
    const daily = computeDailyInterest(500_000, 25)
    for (const m of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const monthly = computeMonthlyAccrual(daily, 2026, m)
      const expectedDays = daysInMonth(2026, m)
      // round2 applied — allow 0.01 difference
      expect(monthly).toBeCloseTo(daily * expectedDays, 1)
    }
  })
})

// ── hasVukRisk — boundary & parameter sensitivity ───────────────────────────

describe('hasVukRisk — boundary & parameter sensitivity', () => {
  it('exactly 365 days is NOT risky (must be strictly >365)', () => {
    expect(hasVukRisk(true, 100_000, '2025-05-29', '2026-05-29')).toBe(false)
  })

  it('366 days IS risky when all other conditions met', () => {
    expect(hasVukRisk(true, 100_000, '2025-05-28', '2026-05-29')).toBe(true)
  })

  it('principal 50_000 exactly is NOT risky (must be strictly >50K)', () => {
    expect(hasVukRisk(true, 50_000, '2024-01-01', '2026-01-01')).toBe(false)
  })

  it('principal 50_001 IS risky when all other conditions met', () => {
    expect(hasVukRisk(true, 50_001, '2024-01-01', '2026-01-01')).toBe(true)
  })

  it('non-zero rate (isZeroRate=false) short-circuits to false', () => {
    expect(hasVukRisk(false, 999_999, '2020-01-01', '2026-01-01')).toBe(false)
  })

  it('zero principal returns false regardless of other conditions', () => {
    expect(hasVukRisk(true, 0, '2020-01-01', '2026-01-01')).toBe(false)
  })

  it('2-year loan with zero rate and large principal → true', () => {
    expect(hasVukRisk(true, 500_000, '2024-01-01', '2026-01-15')).toBe(true)
  })
})
