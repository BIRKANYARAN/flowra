/**
 * Turkish Tax Compliance Calendar — unit tests
 *
 * All pure function tests — no DB, no network.
 * Target: 110+ tests covering every exported function and edge case.
 */

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyKdv,
  computeKdvCarryForward,
  classifyKdvStatus,
  computeGeciciVergi,
  computeYtdGeciciVergiPaid,
  computeAnnualKvBalance,
  computeSgkEmployerContribution,
  computeStopajEstimate,
  computeKdvDueDate,
  computeGeciciVergiDueDate,
  computeSgkDueDate,
  computeDaysUntilDue,
  classifyTaxDeadlineUrgency,
  classifyTaxBurden,
  computeEffectiveTaxRate,
} from '../lib/services/finance/tax-compliance-calendar.service'

// ── computeMonthlyKdv ──────────────────────────────────────────────────────────

describe('computeMonthlyKdv', () => {

  it('1. positive output > input → positive balance (payable)', () => {
    expect(computeMonthlyKdv(10_000, 6_000)).toBe(4_000)
  })

  it('2. output < input → negative balance (credit)', () => {
    expect(computeMonthlyKdv(3_000, 8_000)).toBe(-5_000)
  })

  it('3. output === input → zero balance', () => {
    expect(computeMonthlyKdv(5_000, 5_000)).toBe(0)
  })

  it('4. zero output, zero input → zero', () => {
    expect(computeMonthlyKdv(0, 0)).toBe(0)
  })

  it('5. large numbers with decimals → rounded to 2dp', () => {
    // 18181.82 - 9090.91 = 9090.91
    expect(computeMonthlyKdv(18_181.82, 9_090.91)).toBeCloseTo(9_090.91, 2)
  })

  it('6. zero output, non-zero input → negative', () => {
    expect(computeMonthlyKdv(0, 2_000)).toBe(-2_000)
  })

  it('7. non-zero output, zero input → positive (full output due)', () => {
    expect(computeMonthlyKdv(15_000, 0)).toBe(15_000)
  })

  it('8. small fractional amounts', () => {
    expect(computeMonthlyKdv(1.50, 0.75)).toBeCloseTo(0.75, 2)
  })
})

// ── computeKdvCarryForward ────────────────────────────────────────────────────

describe('computeKdvCarryForward', () => {

  it('9. empty array → empty array', () => {
    expect(computeKdvCarryForward([])).toEqual([])
  })

  it('10. single negative month → carry equals that balance', () => {
    expect(computeKdvCarryForward([-5_000])).toEqual([-5_000])
  })

  it('11. single positive month → carry = 0 (no credit, just payable)', () => {
    expect(computeKdvCarryForward([3_000])).toEqual([0])
  })

  it('12. two negative months → accumulates credit', () => {
    const result = computeKdvCarryForward([-2_000, -3_000])
    expect(result[0]).toBe(-2_000)
    expect(result[1]).toBe(-5_000)
  })

  it('13. credit consumed by positive month — partial consumption', () => {
    // Month1: -5000 credit. Month2: +3000 → running = -2000 (still credit)
    const result = computeKdvCarryForward([-5_000, 3_000])
    expect(result[0]).toBe(-5_000)
    expect(result[1]).toBe(-2_000)
  })

  it('14. credit fully consumed by positive month → 0', () => {
    // Month1: -5000, Month2: +5000 → carry = 0
    const result = computeKdvCarryForward([-5_000, 5_000])
    expect(result[1]).toBe(0)
  })

  it('15. credit over-consumed (positive beyond credit) → capped at 0', () => {
    // Month1: -3000, Month2: +5000 → running = +2000 → capped to 0
    const result = computeKdvCarryForward([-3_000, 5_000])
    expect(result[1]).toBe(0)
  })

  it('16. all positive months → all carries = 0', () => {
    const result = computeKdvCarryForward([1_000, 2_000, 3_000])
    expect(result).toEqual([0, 0, 0])
  })

  it('17. alternating negative-positive-negative', () => {
    // -4000, +2000 → -2000; +5000 → -2000+5000=+3000 → cap 0; -1000 → -1000
    const result = computeKdvCarryForward([-4_000, 2_000, 5_000, -1_000])
    expect(result[0]).toBe(-4_000)
    expect(result[1]).toBe(-2_000)
    expect(result[2]).toBe(0)
    expect(result[3]).toBe(-1_000)
  })

  it('18. six months accumulation', () => {
    const balances = [-1_000, -1_000, -1_000, -1_000, -1_000, -1_000]
    const result = computeKdvCarryForward(balances)
    expect(result[5]).toBe(-6_000)
  })

  it('19. zero balance months do not change carry', () => {
    const result = computeKdvCarryForward([0, 0, 0])
    expect(result).toEqual([0, 0, 0])
  })
})

// ── classifyKdvStatus ─────────────────────────────────────────────────────────

describe('classifyKdvStatus', () => {

  it('20. positive balance → payable', () => {
    expect(classifyKdvStatus(5_000)).toBe('payable')
  })

  it('21. negative balance → credit', () => {
    expect(classifyKdvStatus(-3_000)).toBe('credit')
  })

  it('22. zero → nil', () => {
    expect(classifyKdvStatus(0)).toBe('nil')
  })

  it('23. very small positive → payable', () => {
    expect(classifyKdvStatus(0.01)).toBe('payable')
  })

  it('24. very small negative → credit', () => {
    expect(classifyKdvStatus(-0.01)).toBe('credit')
  })

  it('25. large positive → payable', () => {
    expect(classifyKdvStatus(1_000_000)).toBe('payable')
  })
})

// ── computeGeciciVergi ────────────────────────────────────────────────────────

describe('computeGeciciVergi', () => {

  it('26. standard 25% rate on positive profit', () => {
    expect(computeGeciciVergi(100_000)).toBe(25_000)
  })

  it('27. zero profit → 0', () => {
    expect(computeGeciciVergi(0)).toBe(0)
  })

  it('28. negative profit → 0 (no prepayment on loss)', () => {
    expect(computeGeciciVergi(-50_000)).toBe(0)
  })

  it('29. custom rate 20%', () => {
    expect(computeGeciciVergi(200_000, 0.20)).toBe(40_000)
  })

  it('30. custom rate 23% (KKEG-adjusted)', () => {
    expect(computeGeciciVergi(400_000, 0.23)).toBeCloseTo(92_000, 2)
  })

  it('31. small profit with default rate', () => {
    expect(computeGeciciVergi(1_000)).toBeCloseTo(250, 2)
  })

  it('32. fractional profit → rounded to 2dp', () => {
    // 33333.33 * 0.25 = 8333.3325 → 8333.33
    expect(computeGeciciVergi(33_333.33)).toBeCloseTo(8_333.33, 2)
  })

  it('33. exactly at zero boundary → 0', () => {
    expect(computeGeciciVergi(0, 0.25)).toBe(0)
  })
})

// ── computeYtdGeciciVergiPaid ─────────────────────────────────────────────────

describe('computeYtdGeciciVergiPaid', () => {

  it('34. empty array → 0', () => {
    expect(computeYtdGeciciVergiPaid([])).toBe(0)
  })

  it('35. single installment', () => {
    expect(computeYtdGeciciVergiPaid([25_000])).toBe(25_000)
  })

  it('36. four quarterly installments summed', () => {
    expect(computeYtdGeciciVergiPaid([10_000, 15_000, 20_000, 12_000])).toBe(57_000)
  })

  it('37. two quarters', () => {
    expect(computeYtdGeciciVergiPaid([8_000, 12_000])).toBe(20_000)
  })

  it('38. with zero installment quarters', () => {
    expect(computeYtdGeciciVergiPaid([0, 0, 5_000, 0])).toBe(5_000)
  })
})

// ── computeAnnualKvBalance ────────────────────────────────────────────────────

describe('computeAnnualKvBalance', () => {

  it('39. standard: 1M profit at 25% = 250k, minus 100k paid = 150k remaining', () => {
    expect(computeAnnualKvBalance(1_000_000, 100_000)).toBe(150_000)
  })

  it('40. prepayments exceed liability → 0 (never negative)', () => {
    expect(computeAnnualKvBalance(100_000, 200_000)).toBe(0)
  })

  it('41. zero profit → 0', () => {
    expect(computeAnnualKvBalance(0, 0)).toBe(0)
  })

  it('42. negative profit → 0', () => {
    expect(computeAnnualKvBalance(-500_000, 0)).toBe(0)
  })

  it('43. no prepayments → full liability due', () => {
    expect(computeAnnualKvBalance(400_000, 0)).toBe(100_000)
  })

  it('44. prepayments exactly match liability → 0', () => {
    expect(computeAnnualKvBalance(400_000, 100_000)).toBe(0)
  })

  it('45. custom 20% rate', () => {
    // 500_000 * 0.20 = 100_000 - 60_000 = 40_000
    expect(computeAnnualKvBalance(500_000, 60_000, 0.20)).toBe(40_000)
  })

  it('46. fractional amounts', () => {
    // 333_333.33 * 0.25 = 83_333.33 - 50_000 = 33_333.33
    expect(computeAnnualKvBalance(333_333.33, 50_000)).toBeCloseTo(33_333.33, 1)
  })
})

// ── computeSgkEmployerContribution ───────────────────────────────────────────

describe('computeSgkEmployerContribution', () => {

  it('47. 22.25% of gross salary', () => {
    expect(computeSgkEmployerContribution(100_000)).toBe(22_250)
  })

  it('48. zero salaries → 0', () => {
    expect(computeSgkEmployerContribution(0)).toBe(0)
  })

  it('49. small payroll', () => {
    // 50_000 * 0.2225 = 11_125
    expect(computeSgkEmployerContribution(50_000)).toBe(11_125)
  })

  it('50. single minimum-wage employee (TL 17,002 base for 2024)', () => {
    // 17_002 * 0.2225 ≈ 3_782.95
    expect(computeSgkEmployerContribution(17_002)).toBeCloseTo(3_782.95, 1)
  })

  it('51. large enterprise payroll', () => {
    // 10_000_000 * 0.2225 = 2_225_000
    expect(computeSgkEmployerContribution(10_000_000)).toBe(2_225_000)
  })

  it('52. result rounded to 2dp', () => {
    // 33_333.33 * 0.2225 = 7_416.67
    expect(computeSgkEmployerContribution(33_333.33)).toBeCloseTo(7_416.67, 2)
  })
})

// ── computeStopajEstimate ─────────────────────────────────────────────────────

describe('computeStopajEstimate', () => {

  it('53. 15% blended on gross salary', () => {
    expect(computeStopajEstimate(100_000)).toBe(15_000)
  })

  it('54. zero salaries → 0', () => {
    expect(computeStopajEstimate(0)).toBe(0)
  })

  it('55. custom rate 20%', () => {
    expect(computeStopajEstimate(200_000, 0.20)).toBe(40_000)
  })

  it('56. custom rate 10%', () => {
    expect(computeStopajEstimate(80_000, 0.10)).toBe(8_000)
  })

  it('57. fractional result rounded to 2dp', () => {
    // 33_333.33 * 0.15 = 4_999.9995 ≈ 5_000
    expect(computeStopajEstimate(33_333.33)).toBeCloseTo(5_000, 1)
  })

  it('58. zero blended rate → 0', () => {
    expect(computeStopajEstimate(100_000, 0)).toBe(0)
  })
})

// ── computeKdvDueDate ─────────────────────────────────────────────────────────

describe('computeKdvDueDate', () => {

  it('59. January → Feb 26 (or next Monday if weekend)', () => {
    const d = computeKdvDueDate(2024, 1)
    expect(d.getMonth() + 1).toBe(2) // February
    expect(d.getDate()).toBeGreaterThanOrEqual(26)
  })

  it('60. February → Mar 26 (or next Monday if weekend)', () => {
    const d = computeKdvDueDate(2024, 2)
    expect(d.getMonth() + 1).toBe(3) // March
  })

  it('61. March → Apr 26', () => {
    const d = computeKdvDueDate(2024, 3)
    expect(d.getMonth() + 1).toBe(4)
  })

  it('62. April → May 26', () => {
    const d = computeKdvDueDate(2024, 4)
    expect(d.getMonth() + 1).toBe(5)
  })

  it('63. May → Jun 26', () => {
    const d = computeKdvDueDate(2024, 5)
    expect(d.getMonth() + 1).toBe(6)
  })

  it('64. June → Jul 26', () => {
    const d = computeKdvDueDate(2024, 6)
    expect(d.getMonth() + 1).toBe(7)
  })

  it('65. July → Aug 26', () => {
    const d = computeKdvDueDate(2024, 7)
    expect(d.getMonth() + 1).toBe(8)
  })

  it('66. August → Sep 26', () => {
    const d = computeKdvDueDate(2024, 8)
    expect(d.getMonth() + 1).toBe(9)
  })

  it('67. September → Oct 26', () => {
    const d = computeKdvDueDate(2024, 9)
    expect(d.getMonth() + 1).toBe(10)
  })

  it('68. October → Nov 26', () => {
    const d = computeKdvDueDate(2024, 10)
    expect(d.getMonth() + 1).toBe(11)
  })

  it('69. November → Dec 26', () => {
    const d = computeKdvDueDate(2024, 11)
    expect(d.getMonth() + 1).toBe(12)
  })

  it('70. December → Jan 26 of following year', () => {
    const d = computeKdvDueDate(2024, 12)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth() + 1).toBe(1)
  })

  it('71. weekend adjustment: day falls on Saturday → Monday', () => {
    // Find a month where 26th of next month is a Saturday
    // Feb 2023 KDV → Mar 26, 2023 = Sunday → move to Monday Mar 27
    const d = computeKdvDueDate(2023, 2)
    expect(d.getDay()).not.toBe(6) // not Saturday
    expect(d.getDay()).not.toBe(0) // not Sunday
  })

  it('72. result is never a Saturday', () => {
    for (let m = 1; m <= 12; m++) {
      const d = computeKdvDueDate(2024, m)
      expect(d.getDay()).not.toBe(6)
    }
  })

  it('73. result is never a Sunday', () => {
    for (let m = 1; m <= 12; m++) {
      const d = computeKdvDueDate(2024, m)
      expect(d.getDay()).not.toBe(0)
    }
  })
})

// ── computeGeciciVergiDueDate ─────────────────────────────────────────────────

describe('computeGeciciVergiDueDate', () => {

  it('74. Q1 → May 17 (or next Monday if weekend)', () => {
    const d = computeGeciciVergiDueDate(2024, 1)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth() + 1).toBe(5) // May
    expect(d.getDate()).toBeGreaterThanOrEqual(17)
  })

  it('75. Q2 → Aug 17 (or next Monday if weekend)', () => {
    const d = computeGeciciVergiDueDate(2024, 2)
    expect(d.getMonth() + 1).toBe(8) // August
    expect(d.getDate()).toBeGreaterThanOrEqual(17)
  })

  it('76. Q3 → Nov 17 (or next Monday if weekend)', () => {
    const d = computeGeciciVergiDueDate(2024, 3)
    expect(d.getMonth() + 1).toBe(11) // November
    expect(d.getDate()).toBeGreaterThanOrEqual(17)
  })

  it('77. Q4 → Feb 17 of following year', () => {
    const d = computeGeciciVergiDueDate(2024, 4)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth() + 1).toBe(2) // February
    expect(d.getDate()).toBeGreaterThanOrEqual(17)
  })

  it('78. result is never a Saturday (all quarters, two years)', () => {
    for (const y of [2024, 2025]) {
      for (const q of [1, 2, 3, 4] as const) {
        const d = computeGeciciVergiDueDate(y, q)
        expect(d.getDay()).not.toBe(6)
      }
    }
  })

  it('79. result is never a Sunday (all quarters, two years)', () => {
    for (const y of [2024, 2025]) {
      for (const q of [1, 2, 3, 4] as const) {
        const d = computeGeciciVergiDueDate(y, q)
        expect(d.getDay()).not.toBe(0)
      }
    }
  })

  it('80. Q4 year-boundary: Q4 2023 → Feb 2024', () => {
    const d = computeGeciciVergiDueDate(2023, 4)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth() + 1).toBe(2)
  })
})

// ── computeSgkDueDate ─────────────────────────────────────────────────────────

describe('computeSgkDueDate', () => {

  it('81. January SGK → last biz day of February', () => {
    const d = computeSgkDueDate(2024, 1)
    expect(d.getMonth() + 1).toBe(2) // February
    expect(d.getDay()).not.toBe(0) // not Sunday
    expect(d.getDay()).not.toBe(6) // not Saturday
  })

  it('82. December SGK → last biz day of January next year', () => {
    const d = computeSgkDueDate(2024, 12)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth() + 1).toBe(1) // January
  })

  it('83. result is in the following month', () => {
    for (let m = 1; m <= 11; m++) {
      const d = computeSgkDueDate(2024, m)
      expect(d.getMonth() + 1).toBe(m + 1)
    }
  })

  it('84. result is always a weekday (never Saturday)', () => {
    for (let m = 1; m <= 12; m++) {
      const d = computeSgkDueDate(2024, m)
      expect(d.getDay()).not.toBe(6)
    }
  })

  it('85. result is always a weekday (never Sunday)', () => {
    for (let m = 1; m <= 12; m++) {
      const d = computeSgkDueDate(2024, m)
      expect(d.getDay()).not.toBe(0)
    }
  })

  it('86. due date is last day or close to last day of the month', () => {
    // Last biz day should be within last 5 days of the month
    const d = computeSgkDueDate(2024, 5) // June
    expect(d.getDate()).toBeGreaterThanOrEqual(26) // June has 30 days
  })
})

// ── computeDaysUntilDue ───────────────────────────────────────────────────────

describe('computeDaysUntilDue', () => {

  it('87. due tomorrow → 1', () => {
    const ref = new Date(2024, 0, 15) // Jan 15
    const due = new Date(2024, 0, 16) // Jan 16
    expect(computeDaysUntilDue(due, ref)).toBe(1)
  })

  it('88. due today → 0', () => {
    const ref = new Date(2024, 0, 15)
    const due = new Date(2024, 0, 15)
    expect(computeDaysUntilDue(due, ref)).toBe(0)
  })

  it('89. overdue yesterday → -1', () => {
    const ref = new Date(2024, 0, 15)
    const due = new Date(2024, 0, 14)
    expect(computeDaysUntilDue(due, ref)).toBe(-1)
  })

  it('90. 30 days away', () => {
    const ref = new Date(2024, 0, 1)
    const due = new Date(2024, 0, 31)
    expect(computeDaysUntilDue(due, ref)).toBe(30)
  })

  it('91. 10 days overdue', () => {
    const ref = new Date(2024, 1, 15) // Feb 15
    const due = new Date(2024, 1,  5) // Feb 5
    expect(computeDaysUntilDue(due, ref)).toBe(-10)
  })

  it('92. cross-month calculation', () => {
    const ref = new Date(2024, 0, 28) // Jan 28
    const due = new Date(2024, 1,  5) // Feb 5
    expect(computeDaysUntilDue(due, ref)).toBe(8)
  })

  it('93. cross-year calculation', () => {
    const ref = new Date(2024, 11, 28) // Dec 28
    const due = new Date(2025,  0,  5) // Jan 5
    expect(computeDaysUntilDue(due, ref)).toBe(8)
  })

  it('94. no referenceDate defaults to now (does not throw)', () => {
    const due = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    const result = computeDaysUntilDue(due)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(4) // at least 4 days (allow for time-of-day)
  })
})

// ── classifyTaxDeadlineUrgency ────────────────────────────────────────────────

describe('classifyTaxDeadlineUrgency', () => {

  it('95. -1 day → overdue', () => {
    expect(classifyTaxDeadlineUrgency(-1)).toBe('overdue')
  })

  it('96. -30 days → overdue', () => {
    expect(classifyTaxDeadlineUrgency(-30)).toBe('overdue')
  })

  it('97. 0 days → critical (due today)', () => {
    expect(classifyTaxDeadlineUrgency(0)).toBe('critical')
  })

  it('98. 1 day → critical', () => {
    expect(classifyTaxDeadlineUrgency(1)).toBe('critical')
  })

  it('99. 3 days → critical (boundary, inclusive)', () => {
    expect(classifyTaxDeadlineUrgency(3)).toBe('critical')
  })

  it('100. 4 days → urgent', () => {
    expect(classifyTaxDeadlineUrgency(4)).toBe('urgent')
  })

  it('101. 7 days → urgent (boundary)', () => {
    expect(classifyTaxDeadlineUrgency(7)).toBe('urgent')
  })

  it('102. 8 days → upcoming', () => {
    expect(classifyTaxDeadlineUrgency(8)).toBe('upcoming')
  })

  it('103. 14 days → upcoming (boundary)', () => {
    expect(classifyTaxDeadlineUrgency(14)).toBe('upcoming')
  })

  it('104. 15 days → scheduled', () => {
    expect(classifyTaxDeadlineUrgency(15)).toBe('scheduled')
  })

  it('105. 60 days → scheduled', () => {
    expect(classifyTaxDeadlineUrgency(60)).toBe('scheduled')
  })

  it('106. exactly at each boundary value', () => {
    expect(classifyTaxDeadlineUrgency(0)).toBe('critical')
    expect(classifyTaxDeadlineUrgency(3)).toBe('critical')
    expect(classifyTaxDeadlineUrgency(4)).toBe('urgent')
    expect(classifyTaxDeadlineUrgency(7)).toBe('urgent')
    expect(classifyTaxDeadlineUrgency(8)).toBe('upcoming')
    expect(classifyTaxDeadlineUrgency(14)).toBe('upcoming')
    expect(classifyTaxDeadlineUrgency(15)).toBe('scheduled')
  })
})

// ── classifyTaxBurden ─────────────────────────────────────────────────────────

describe('classifyTaxBurden', () => {

  it('107. 0% → minimal', () => {
    expect(classifyTaxBurden(0)).toBe('minimal')
  })

  it('108. 4.9% → minimal (just below 5%)', () => {
    expect(classifyTaxBurden(0.049)).toBe('minimal')
  })

  it('109. 5% → low (boundary: 5 is not < 5)', () => {
    expect(classifyTaxBurden(0.05)).toBe('low')
  })

  it('110. 9.9% → low', () => {
    expect(classifyTaxBurden(0.099)).toBe('low')
  })

  it('111. 10% → moderate (boundary)', () => {
    expect(classifyTaxBurden(0.10)).toBe('moderate')
  })

  it('112. 15% → moderate', () => {
    expect(classifyTaxBurden(0.15)).toBe('moderate')
  })

  it('113. 19.9% → moderate', () => {
    expect(classifyTaxBurden(0.199)).toBe('moderate')
  })

  it('114. 20% → high (boundary)', () => {
    expect(classifyTaxBurden(0.20)).toBe('high')
  })

  it('115. 25% → high', () => {
    expect(classifyTaxBurden(0.25)).toBe('high')
  })

  it('116. 29.9% → high', () => {
    expect(classifyTaxBurden(0.299)).toBe('high')
  })

  it('117. 30% → excessive (boundary: not < 30)', () => {
    expect(classifyTaxBurden(0.30)).toBe('excessive')
  })

  it('118. 50% → excessive', () => {
    expect(classifyTaxBurden(0.50)).toBe('excessive')
  })

  it('119. all five levels in order', () => {
    expect(classifyTaxBurden(0.01)).toBe('minimal')
    expect(classifyTaxBurden(0.07)).toBe('low')
    expect(classifyTaxBurden(0.15)).toBe('moderate')
    expect(classifyTaxBurden(0.25)).toBe('high')
    expect(classifyTaxBurden(0.40)).toBe('excessive')
  })
})

// ── computeEffectiveTaxRate ───────────────────────────────────────────────────

describe('computeEffectiveTaxRate', () => {

  it('120. zero revenue → null (avoid division by zero)', () => {
    expect(computeEffectiveTaxRate(50_000, 0)).toBeNull()
  })

  it('121. normal case: 25k taxes / 100k revenue = 25%', () => {
    expect(computeEffectiveTaxRate(25_000, 100_000)).toBeCloseTo(0.25, 4)
  })

  it('122. 0 taxes / 100k revenue = 0%', () => {
    expect(computeEffectiveTaxRate(0, 100_000)).toBe(0)
  })

  it('123. taxes exceed revenue → > 1 (unusual but valid)', () => {
    expect(computeEffectiveTaxRate(150_000, 100_000)).toBeCloseTo(1.5, 4)
  })

  it('124. small amounts: 1500 / 30_000 = 5%', () => {
    expect(computeEffectiveTaxRate(1_500, 30_000)).toBeCloseTo(0.05, 4)
  })

  it('125. result rounded to 2dp', () => {
    // 1_000 / 3_000 = 0.3333...
    const r = computeEffectiveTaxRate(1_000, 3_000)
    expect(r).not.toBeNull()
    // Should be rounded to 2dp
    expect(String(r!).replace('.', '').length).toBeLessThanOrEqual(4)
  })

  it('126. both zero → null (zero revenue)', () => {
    expect(computeEffectiveTaxRate(0, 0)).toBeNull()
  })
})
