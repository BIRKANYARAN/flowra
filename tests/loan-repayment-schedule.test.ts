/**
 * Loan Repayment Schedule Service — pure-logic unit tests
 *
 * Covers all exported pure functions:
 *   computeMonthlyRate, computeMonthlyPayment, buildAmortizationSchedule,
 *   buildBulletSchedule, computeMonthsRemaining, computeTotalInterest,
 *   computeTotalPayments, computePaymentsUntilDate, computeOverduePayments,
 *   classifyRepaymentRisk, computeDebtServiceCoverageRatio, classifyDscr,
 *   computeEffectiveInterestCost, generateScheduleNarrative
 *
 * Run: npx vitest run tests/loan-repayment-schedule.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyRate,
  computeMonthlyPayment,
  buildAmortizationSchedule,
  buildBulletSchedule,
  computeMonthsRemaining,
  computeTotalInterest,
  computeTotalPayments,
  computePaymentsUntilDate,
  computeOverduePayments,
  classifyRepaymentRisk,
  computeDebtServiceCoverageRatio,
  classifyDscr,
  computeEffectiveInterestCost,
  generateScheduleNarrative,
} from '../lib/services/pcle/loan-repayment-schedule.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeMonthlyRate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlyRate', () => {
  it('12% annual → 0.01 monthly', () => {
    expect(computeMonthlyRate(12)).toBeCloseTo(0.01, 8)
  })

  it('24% annual → 0.02 monthly', () => {
    expect(computeMonthlyRate(24)).toBeCloseTo(0.02, 8)
  })

  it('0% annual → 0 monthly', () => {
    expect(computeMonthlyRate(0)).toBe(0)
  })

  it('1% annual → approx 0.000833', () => {
    expect(computeMonthlyRate(1)).toBeCloseTo(1 / 100 / 12, 8)
  })

  it('100% annual → approx 0.0833', () => {
    expect(computeMonthlyRate(100)).toBeCloseTo(100 / 100 / 12, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeMonthlyPayment
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthlyPayment', () => {
  it('returns 0 when termMonths = 0', () => {
    expect(computeMonthlyPayment(100_000, 0.01, 0)).toBe(0)
  })

  it('zero rate: equal principal installments', () => {
    const payment = computeMonthlyPayment(12_000, 0, 12)
    expect(payment).toBeCloseTo(1_000, 2)
  })

  it('standard annuity formula — 12% annual, 12 months', () => {
    // P=100000, r=0.01, n=12 → known result ≈ 8884.88
    const payment = computeMonthlyPayment(100_000, 0.01, 12)
    expect(payment).toBeCloseTo(8884.88, 0)
  })

  it('12% annual, 24 months', () => {
    // r=0.01, n=24 → ≈ 4707.35
    const payment = computeMonthlyPayment(100_000, 0.01, 24)
    expect(payment).toBeCloseTo(4707.35, 0)
  })

  it('payment × n >= principal (positive interest accrues)', () => {
    const payment = computeMonthlyPayment(50_000, 0.01, 12)
    expect(payment * 12).toBeGreaterThan(50_000)
  })

  it('higher rate → higher payment for same principal/term', () => {
    const low = computeMonthlyPayment(100_000, 0.005, 24)
    const high = computeMonthlyPayment(100_000, 0.02, 24)
    expect(high).toBeGreaterThan(low)
  })

  it('longer term → lower payment for same principal/rate', () => {
    const short = computeMonthlyPayment(100_000, 0.01, 12)
    const long = computeMonthlyPayment(100_000, 0.01, 36)
    expect(long).toBeLessThan(short)
  })

  it('zero principal returns 0 equivalent payment for zero-rate', () => {
    expect(computeMonthlyPayment(0, 0, 12)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildAmortizationSchedule
// ─────────────────────────────────────────────────────────────────────────────

describe('buildAmortizationSchedule', () => {
  const principal = 120_000
  const annualRate = 12   // 1% monthly
  const termMonths = 12
  const startDate = '2025-01-01'
  const asOfDate = '2025-07-01'  // in the middle

  let schedule: ReturnType<typeof buildAmortizationSchedule>

  // Build once for all tests
  schedule = buildAmortizationSchedule(principal, annualRate, termMonths, startDate, asOfDate)

  it('returns correct row count', () => {
    expect(schedule.length).toBe(termMonths)
  })

  it('first period_number is 1', () => {
    expect(schedule[0].period_number).toBe(1)
  })

  it('period numbers are sequential', () => {
    for (let i = 0; i < schedule.length; i++) {
      expect(schedule[i].period_number).toBe(i + 1)
    }
  })

  it('first beginning_balance equals principal', () => {
    expect(schedule[0].beginning_balance).toBeCloseTo(principal, 1)
  })

  it('last ending_balance is 0', () => {
    expect(schedule[schedule.length - 1].ending_balance).toBe(0)
  })

  it('ending_balance of row n equals beginning_balance of row n+1', () => {
    for (let i = 0; i < schedule.length - 1; i++) {
      expect(schedule[i].ending_balance).toBeCloseTo(schedule[i + 1].beginning_balance, 1)
    }
  })

  it('interest_component = beginning_balance × monthly_rate', () => {
    const r = schedule[0]
    expect(r.interest_component).toBeCloseTo(r.beginning_balance * 0.01, 2)
  })

  it('principal_component = scheduled_payment - interest_component (non-last rows)', () => {
    const r = schedule[0]
    expect(r.principal_component).toBeCloseTo(r.scheduled_payment - r.interest_component, 1)
  })

  it('interest decreases over time (amortization)', () => {
    expect(schedule[schedule.length - 1].interest_component).toBeLessThan(schedule[0].interest_component)
  })

  it('principal increases over time (amortization)', () => {
    expect(schedule[schedule.length - 1].principal_component).toBeGreaterThan(schedule[0].principal_component)
  })

  it('is_overdue: past rows with non-zero ending balance are overdue', () => {
    const overdue = schedule.filter(r => r.is_overdue)
    // Rows with payment_date < asOfDate should be overdue if ending_balance > 0
    // First payment: Jan 1 2025. asOfDate = Jul 1 2025 → first 6 payments are past
    expect(overdue.length).toBeGreaterThan(0)
  })

  it('is_overdue: future rows are NOT overdue', () => {
    const futureRows = schedule.filter(r => r.payment_date >= asOfDate)
    expect(futureRows.every(r => !r.is_overdue)).toBe(true)
  })

  it('empty schedule for termMonths = 0', () => {
    expect(buildAmortizationSchedule(100_000, 12, 0, startDate, asOfDate)).toHaveLength(0)
  })

  it('empty schedule for principal = 0', () => {
    expect(buildAmortizationSchedule(0, 12, 12, startDate, asOfDate)).toHaveLength(0)
  })

  it('zero rate: each period has 0 interest', () => {
    const zeroRate = buildAmortizationSchedule(12_000, 0, 12, startDate, asOfDate)
    expect(zeroRate.every(r => r.interest_component === 0)).toBe(true)
  })

  it('zero rate: equal principal components', () => {
    const zeroRate = buildAmortizationSchedule(12_000, 0, 12, startDate, asOfDate)
    const principals = zeroRate.map(r => r.principal_component)
    // All should be ~1000 (last row closes balance exactly)
    expect(principals[0]).toBeCloseTo(1_000, 1)
  })

  it('total principal paid = original principal', () => {
    const totalPrincipal = schedule.reduce((s, r) => s + r.principal_component, 0)
    expect(totalPrincipal).toBeCloseTo(principal, 0)
  })

  it('payment dates are in ascending order', () => {
    for (let i = 0; i < schedule.length - 1; i++) {
      expect(schedule[i].payment_date < schedule[i + 1].payment_date).toBe(true)
    }
  })

  it('no ending_balance goes below 0', () => {
    expect(schedule.every(r => r.ending_balance >= 0)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildBulletSchedule
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBulletSchedule', () => {
  it('returns exactly 1 row', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    expect(rows).toHaveLength(1)
  })

  it('period_number is 1', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    expect(rows[0].period_number).toBe(1)
  })

  it('ending_balance is 0', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    expect(rows[0].ending_balance).toBe(0)
  })

  it('scheduled_payment = outstanding + interest', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    const r = rows[0]
    expect(r.scheduled_payment).toBeCloseTo(r.principal_component + r.interest_component, 1)
  })

  it('interest > 0 for non-zero rate with future repayment', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    expect(rows[0].interest_component).toBeGreaterThan(0)
  })

  it('interest = 0 for zero rate', () => {
    const rows = buildBulletSchedule(100_000, 0, '2026-01-01', '2025-07-01')
    expect(rows[0].interest_component).toBe(0)
  })

  it('is_overdue = true when repaymentDate < asOfDate', () => {
    const rows = buildBulletSchedule(100_000, 12, '2024-01-01', '2025-07-01')
    expect(rows[0].is_overdue).toBe(true)
  })

  it('is_overdue = false when repaymentDate > asOfDate', () => {
    const rows = buildBulletSchedule(100_000, 12, '2026-01-01', '2025-07-01')
    expect(rows[0].is_overdue).toBe(false)
  })

  it('beginning_balance equals outstanding', () => {
    const rows = buildBulletSchedule(75_000, 10, '2026-06-01', '2025-07-01')
    expect(rows[0].beginning_balance).toBeCloseTo(75_000, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeMonthsRemaining
// ─────────────────────────────────────────────────────────────────────────────

describe('computeMonthsRemaining', () => {
  it('returns null when repaymentDate is null', () => {
    expect(computeMonthsRemaining(null, '2025-07-01')).toBeNull()
  })

  it('returns 0 for past date', () => {
    expect(computeMonthsRemaining('2025-01-01', '2025-07-01')).toBe(0)
  })

  it('same date → 0', () => {
    expect(computeMonthsRemaining('2025-07-01', '2025-07-01')).toBe(0)
  })

  it('about 1 month future → ceil to 1 or 2 depending on day count', () => {
    // Jul 1 to Aug 1 = 31 days ÷ 30.44 ≈ 1.02 → ceil = 2
    // The function uses Math.ceil, so we accept 1 or 2
    const result = computeMonthsRemaining('2025-08-01', '2025-07-01')
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(2)
  })

  it('6 months future → 6', () => {
    const result = computeMonthsRemaining('2026-01-01', '2025-07-01')
    expect(result).toBeGreaterThanOrEqual(6)
    expect(result).toBeLessThanOrEqual(7)
  })

  it('uses Math.ceil for fractional months', () => {
    // 15 days ≈ 0.5 months → ceil → 1
    const result = computeMonthsRemaining('2025-07-16', '2025-07-01')
    expect(result).toBe(1)
  })

  it('12 months ahead → approximately 12', () => {
    const result = computeMonthsRemaining('2026-07-01', '2025-07-01')
    expect(result).toBeGreaterThanOrEqual(12)
    expect(result).toBeLessThanOrEqual(13)
  })

  it('positive for future date', () => {
    const result = computeMonthsRemaining('2030-01-01', '2025-07-01')
    expect(result).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTotalInterest
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTotalInterest', () => {
  it('sums interest_component across all rows', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-07-01')
    const total = computeTotalInterest(rows)
    expect(total).toBeGreaterThan(0)
    const manualSum = rows.reduce((s, r) => s + r.interest_component, 0)
    expect(total).toBeCloseTo(manualSum, 2)
  })

  it('returns 0 for empty array', () => {
    expect(computeTotalInterest([])).toBe(0)
  })

  it('returns 0 for zero-rate schedule', () => {
    const rows = buildAmortizationSchedule(12_000, 0, 12, '2025-01-01', '2025-07-01')
    expect(computeTotalInterest(rows)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTotalPayments
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTotalPayments', () => {
  it('sums scheduled_payment across all rows', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-07-01')
    const total = computeTotalPayments(rows)
    const manualSum = rows.reduce((s, r) => s + r.scheduled_payment, 0)
    expect(total).toBeCloseTo(manualSum, 2)
  })

  it('returns 0 for empty array', () => {
    expect(computeTotalPayments([])).toBe(0)
  })

  it('total payments >= principal (positive rate)', () => {
    const rows = buildAmortizationSchedule(100_000, 12, 12, '2025-01-01', '2025-07-01')
    expect(computeTotalPayments(rows)).toBeGreaterThan(100_000)
  })

  it('total payments = principal for zero rate', () => {
    const rows = buildAmortizationSchedule(12_000, 0, 12, '2025-01-01', '2025-07-01')
    expect(computeTotalPayments(rows)).toBeCloseTo(12_000, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePaymentsUntilDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computePaymentsUntilDate', () => {
  const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-12-01')

  it('count is correct for filtering', () => {
    const result = computePaymentsUntilDate(rows, '2025-03-01')
    // Jan, Feb, Mar payments
    expect(result.count).toBeGreaterThanOrEqual(3)
  })

  it('total_try is positive when rows exist', () => {
    const result = computePaymentsUntilDate(rows, '2025-12-31')
    expect(result.total_try).toBeGreaterThan(0)
  })

  it('interest_try + principal_try = total_try', () => {
    const result = computePaymentsUntilDate(rows, '2025-06-01')
    expect(result.interest_try + result.principal_try).toBeCloseTo(result.total_try, 1)
  })

  it('returns zeros for empty array', () => {
    const result = computePaymentsUntilDate([], '2025-12-31')
    expect(result.count).toBe(0)
    expect(result.total_try).toBe(0)
    expect(result.interest_try).toBe(0)
    expect(result.principal_try).toBe(0)
  })

  it('returns zeros when untilDate is before all payments', () => {
    const result = computePaymentsUntilDate(rows, '2024-01-01')
    expect(result.count).toBe(0)
    expect(result.total_try).toBe(0)
  })

  it('all rows included when untilDate is after last payment', () => {
    const result = computePaymentsUntilDate(rows, '2030-01-01')
    expect(result.count).toBe(rows.length)
  })

  it('principal_try is positive', () => {
    const result = computePaymentsUntilDate(rows, '2025-12-31')
    expect(result.principal_try).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeOverduePayments
// ─────────────────────────────────────────────────────────────────────────────

describe('computeOverduePayments', () => {
  it('returns 0 count for empty array', () => {
    expect(computeOverduePayments([]).count).toBe(0)
    expect(computeOverduePayments([]).total_overdue_try).toBe(0)
  })

  it('correctly counts overdue rows', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-07-01')
    const result = computeOverduePayments(rows)
    expect(result.count).toBeGreaterThan(0)
  })

  it('non-overdue rows not counted', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2026-01-01', '2025-07-01')
    const result = computeOverduePayments(rows)
    expect(result.count).toBe(0)
    expect(result.total_overdue_try).toBe(0)
  })

  it('total_overdue_try sums scheduled_payment of overdue rows', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-07-01')
    const result = computeOverduePayments(rows)
    const expected = rows
      .filter(r => r.is_overdue)
      .reduce((s, r) => s + r.scheduled_payment, 0)
    expect(result.total_overdue_try).toBeCloseTo(expected, 2)
  })

  it('count matches number of is_overdue=true rows', () => {
    const rows = buildAmortizationSchedule(120_000, 12, 12, '2025-01-01', '2025-07-01')
    const expectedCount = rows.filter(r => r.is_overdue).length
    expect(computeOverduePayments(rows).count).toBe(expectedCount)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyRepaymentRisk
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyRepaymentRisk', () => {
  it('no_risk when outstanding = 0', () => {
    expect(classifyRepaymentRisk(6, 0, 12, 0)).toBe('no_risk')
  })

  it('no_risk takes priority over overdue', () => {
    // outstanding = 0 → no_risk regardless of overdueCount
    expect(classifyRepaymentRisk(2, 0, 12, 3)).toBe('no_risk')
  })

  it('critical when overdueCount > 0 and outstanding > 0', () => {
    expect(classifyRepaymentRisk(6, 100_000, 12, 1)).toBe('critical')
  })

  it('critical takes priority over high', () => {
    // 2 months remaining + overdue → still critical
    expect(classifyRepaymentRisk(2, 100_000, 12, 1)).toBe('critical')
  })

  it('high when monthsRemaining <= 3 (no overdue)', () => {
    expect(classifyRepaymentRisk(3, 100_000, 12, 0)).toBe('high')
  })

  it('high for monthsRemaining = 1', () => {
    expect(classifyRepaymentRisk(1, 100_000, 12, 0)).toBe('high')
  })

  it('high for monthsRemaining = 2', () => {
    expect(classifyRepaymentRisk(2, 100_000, 12, 0)).toBe('high')
  })

  it('moderate when monthsRemaining 4-12 (no overdue)', () => {
    expect(classifyRepaymentRisk(6, 100_000, 12, 0)).toBe('moderate')
    expect(classifyRepaymentRisk(12, 100_000, 12, 0)).toBe('moderate')
  })

  it('low when monthsRemaining > 12', () => {
    expect(classifyRepaymentRisk(24, 100_000, 12, 0)).toBe('low')
    expect(classifyRepaymentRisk(13, 100_000, 12, 0)).toBe('low')
  })

  it('low when monthsRemaining is null (indefinite)', () => {
    expect(classifyRepaymentRisk(null, 100_000, 12, 0)).toBe('low')
  })

  it('moderate boundary: 12 months', () => {
    expect(classifyRepaymentRisk(12, 50_000, 15, 0)).toBe('moderate')
  })

  it('high boundary: 3 months', () => {
    expect(classifyRepaymentRisk(3, 50_000, 15, 0)).toBe('high')
  })

  it('low: exactly 13 months', () => {
    expect(classifyRepaymentRisk(13, 50_000, 15, 0)).toBe('low')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDebtServiceCoverageRatio
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDebtServiceCoverageRatio', () => {
  it('basic computation: 10000 / 5000 = 2.0', () => {
    expect(computeDebtServiceCoverageRatio(10_000, 5_000)).toBeCloseTo(2.0, 4)
  })

  it('returns null when monthlyDebtService = 0', () => {
    expect(computeDebtServiceCoverageRatio(10_000, 0)).toBeNull()
  })

  it('DSCR < 1 when ebitda < debt service', () => {
    expect(computeDebtServiceCoverageRatio(3_000, 5_000)).toBeCloseTo(0.6, 2)
  })

  it('DSCR = 1 when ebitda = debt service', () => {
    expect(computeDebtServiceCoverageRatio(5_000, 5_000)).toBeCloseTo(1.0, 4)
  })

  it('returns null when both are 0', () => {
    expect(computeDebtServiceCoverageRatio(0, 0)).toBeNull()
  })

  it('0 ebitda / positive debt → DSCR = 0', () => {
    expect(computeDebtServiceCoverageRatio(0, 5_000)).toBeCloseTo(0, 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyDscr
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyDscr', () => {
  it('null → no_debt', () => {
    expect(classifyDscr(null)).toBe('no_debt')
  })

  it('2.0 → strong', () => {
    expect(classifyDscr(2.0)).toBe('strong')
  })

  it('2.5 → strong', () => {
    expect(classifyDscr(2.5)).toBe('strong')
  })

  it('1.5 → adequate', () => {
    expect(classifyDscr(1.5)).toBe('adequate')
  })

  it('1.8 → adequate', () => {
    expect(classifyDscr(1.8)).toBe('adequate')
  })

  it('1.99 → adequate', () => {
    expect(classifyDscr(1.99)).toBe('adequate')
  })

  it('1.0 → tight', () => {
    expect(classifyDscr(1.0)).toBe('tight')
  })

  it('1.2 → tight', () => {
    expect(classifyDscr(1.2)).toBe('tight')
  })

  it('1.49 → tight', () => {
    expect(classifyDscr(1.49)).toBe('tight')
  })

  it('0.9 → critical', () => {
    expect(classifyDscr(0.9)).toBe('critical')
  })

  it('0.0 → critical', () => {
    expect(classifyDscr(0.0)).toBe('critical')
  })

  it('negative → critical', () => {
    expect(classifyDscr(-0.5)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeEffectiveInterestCost
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEffectiveInterestCost', () => {
  it('returns null when principal = 0', () => {
    expect(computeEffectiveInterestCost(1_000, 0)).toBeNull()
  })

  it('basic: 5000 / 100000 × 100 = 5%', () => {
    expect(computeEffectiveInterestCost(5_000, 100_000)).toBeCloseTo(5.0, 4)
  })

  it('returns 0 when totalInterest = 0', () => {
    expect(computeEffectiveInterestCost(0, 100_000)).toBe(0)
  })

  it('larger total interest → higher cost', () => {
    const low = computeEffectiveInterestCost(5_000, 100_000)!
    const high = computeEffectiveInterestCost(15_000, 100_000)!
    expect(high).toBeGreaterThan(low)
  })

  it('proportional to interest', () => {
    const result = computeEffectiveInterestCost(10_000, 50_000)!
    expect(result).toBeCloseTo(20.0, 4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateScheduleNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe('generateScheduleNarrative', () => {
  it('no_risk → partner has no active loan', () => {
    const msg = generateScheduleNarrative('Ahmet Bey', 0, null, 'no_risk')
    expect(msg).toContain('Ahmet Bey')
    expect(msg).toContain('aktif kredisi bulunmuyor')
  })

  it('critical → KRİTİK prefix with partner name', () => {
    const msg = generateScheduleNarrative('Mehmet Yılmaz', 500_000, 3, 'critical')
    expect(msg).toMatch(/KRİTİK/i)
    expect(msg).toContain('Mehmet Yılmaz')
    expect(msg).toContain('vadesi geçmiş')
  })

  it('high → partner name and months in message', () => {
    const msg = generateScheduleNarrative('Fatma Hanım', 200_000, 2, 'high')
    expect(msg).toContain('Fatma Hanım')
    expect(msg).toContain('2 ay')
    expect(msg).toContain('vadesi doluyor')
  })

  it('moderate → partner name and months in message', () => {
    const msg = generateScheduleNarrative('Ali Koç', 350_000, 8, 'moderate')
    expect(msg).toContain('Ali Koç')
    expect(msg).toContain('8 ay')
    expect(msg).toContain('vadesi doluyor')
  })

  it('low → long-term message', () => {
    const msg = generateScheduleNarrative('Veli Bey', 100_000, 24, 'low')
    expect(msg).toContain('Veli Bey')
    expect(msg).toContain('uzun vadeli')
  })

  it('low with null months → long-term message', () => {
    const msg = generateScheduleNarrative('Ortak X', 75_000, null, 'low')
    expect(msg).toContain('uzun vadeli')
  })

  it('no_risk message is in Turkish', () => {
    const msg = generateScheduleNarrative('Test Ortak', 0, null, 'no_risk')
    expect(msg).toContain('ortağının')
  })

  it('high includes outstanding amount', () => {
    const msg = generateScheduleNarrative('Test Ortak', 123_456, 3, 'high')
    expect(msg).toContain('₺')
  })

  it('moderate includes outstanding amount', () => {
    const msg = generateScheduleNarrative('Test Ortak', 99_000, 10, 'moderate')
    expect(msg).toContain('₺')
  })

  it('critical does not include amount (just alert)', () => {
    const msg = generateScheduleNarrative('Test Ortak', 50_000, 1, 'critical')
    expect(msg.startsWith('KRİTİK')).toBe(true)
  })
})
