/**
 * Amortization Service — pure-logic unit tests
 *
 * Tests for calculateMonthlyPayment, buildAmortizationSchedule,
 * and computeWeightedAvgRate.
 *
 * Run: npx vitest run tests/amortization.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  calculateMonthlyPayment,
  buildAmortizationSchedule,
  computeWeightedAvgRate,
  type TrancheAmortization,
} from '../lib/services/pcle/amortization.service'

// ── calculateMonthlyPayment ───────────────────────────────────────────────────

describe('calculateMonthlyPayment', () => {
  it('1 — zero interest rate: payment = principal / termMonths (linear)', () => {
    const payment = calculateMonthlyPayment(12_000, 0, 12)
    expect(payment).toBeCloseTo(1000, 2)
  })

  it('2 — zero interest, 24 months: linear division', () => {
    const payment = calculateMonthlyPayment(24_000, 0, 24)
    expect(payment).toBeCloseTo(1000, 2)
  })

  it('3 — standard PMT: ₺100 000, 12% annual, 12 months → ≈ ₺8884.88', () => {
    // Known: P=100000, r=0.01, n=12 → PMT = 8884.88
    const payment = calculateMonthlyPayment(100_000, 0.12, 12)
    expect(payment).toBeCloseTo(8884.88, 0)
  })

  it('4 — standard PMT: ₺120 000, 24% annual, 24 months → ≈ ₺6344.53', () => {
    // r=0.02, n=24 → PMT = 120000 × 0.02 × 1.02^24 / (1.02^24 − 1) ≈ 6344.53
    const payment = calculateMonthlyPayment(120_000, 0.24, 24)
    expect(payment).toBeCloseTo(6344.53, 0)
  })

  it('5 — 1-month term: payment equals full principal + 1 month interest', () => {
    // r=0.01 for 1 month: P × 0.01 × 1.01 / (1.01 - 1) = P × 1.01
    const payment = calculateMonthlyPayment(10_000, 0.12, 1)
    expect(payment).toBeCloseTo(10_100, 0)
  })

  it('6 — zero principal returns 0', () => {
    expect(calculateMonthlyPayment(0, 0.12, 12)).toBe(0)
  })

  it('7 — zero termMonths returns 0', () => {
    expect(calculateMonthlyPayment(10_000, 0.12, 0)).toBe(0)
  })

  it('8 — very low rate (near zero) returns ~principal/n', () => {
    // 0.01% annual ≈ linear
    const payment = calculateMonthlyPayment(12_000, 0.0001, 12)
    // Should be just above 1000
    expect(payment).toBeGreaterThan(1000)
    expect(payment).toBeLessThan(1001)
  })

  it('9 — higher rate results in higher monthly payment (same principal/term)', () => {
    const low  = calculateMonthlyPayment(100_000, 0.10, 24)
    const high = calculateMonthlyPayment(100_000, 0.30, 24)
    expect(high).toBeGreaterThan(low)
  })

  it('10 — longer term results in lower monthly payment (same principal/rate)', () => {
    const short = calculateMonthlyPayment(100_000, 0.12, 12)
    const long  = calculateMonthlyPayment(100_000, 0.12, 60)
    expect(long).toBeLessThan(short)
  })

  it('11 — payment × n >= principal (total paid covers principal)', () => {
    const payment = calculateMonthlyPayment(100_000, 0.20, 24)
    expect(payment * 24).toBeGreaterThanOrEqual(100_000)
  })

  it('12 — negative principal returns 0', () => {
    expect(calculateMonthlyPayment(-10_000, 0.12, 12)).toBe(0)
  })

  it('13 — negative term returns 0', () => {
    expect(calculateMonthlyPayment(10_000, 0.12, -5)).toBe(0)
  })

  it('14 — large loan at Turkish market rate (~40%)', () => {
    const payment = calculateMonthlyPayment(1_000_000, 0.40, 36)
    // r = 0.40/12 ≈ 0.0333, n=36
    expect(payment).toBeGreaterThan(1_000_000 / 36) // at least linear
    expect(payment).toBeLessThan(1_000_000) // less than full principal
  })

  it('15 — zero rate single month: payment = principal', () => {
    const payment = calculateMonthlyPayment(50_000, 0, 1)
    expect(payment).toBeCloseTo(50_000, 2)
  })

  it('16 — result is rounded to 2 decimal places', () => {
    const payment = calculateMonthlyPayment(100_000, 0.15, 18)
    const str = payment.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})

// ── buildAmortizationSchedule ─────────────────────────────────────────────────

describe('buildAmortizationSchedule', () => {
  it('17 — zero balance returns empty array', () => {
    const schedule = buildAmortizationSchedule(0, 0.12, 1000, '2026-01')
    expect(schedule).toHaveLength(0)
  })

  it('18 — zero payment returns empty array', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.12, 0, '2026-01')
    expect(schedule).toHaveLength(0)
  })

  it('19 — 3-month zero-interest schedule has correct closing balances', () => {
    // 3000 principal, 0% rate, 1000/month
    const schedule = buildAmortizationSchedule(3000, 0, 1000, '2026-01', 6)
    expect(schedule).toHaveLength(3)
    expect(schedule[0].closing_balance_try).toBeCloseTo(2000, 1)
    expect(schedule[1].closing_balance_try).toBeCloseTo(1000, 1)
    expect(schedule[2].closing_balance_try).toBeCloseTo(0, 1)
  })

  it('20 — 3-month schedule: interest in each row equals opening_balance × rate/12', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.12, 2000, '2026-01', 6)
    for (const row of schedule) {
      const expectedInterest = row.opening_balance_try * 0.01
      expect(row.interest_try).toBeCloseTo(expectedInterest, 1)
    }
  })

  it('21 — period_number starts at 1 and increments correctly', () => {
    const schedule = buildAmortizationSchedule(5000, 0, 1000, '2026-01', 10)
    schedule.forEach((row, i) => {
      expect(row.period_number).toBe(i + 1)
    })
  })

  it('22 — maxMonths cap: never exceeds 60', () => {
    // Very large loan, very small payment → would run forever if not capped
    const schedule = buildAmortizationSchedule(1_000_000, 0.01, 100, '2026-01', 100)
    expect(schedule.length).toBeLessThanOrEqual(60)
  })

  it('23 — explicit maxMonths=3 caps at 3 even if loan not paid off', () => {
    const schedule = buildAmortizationSchedule(10_000, 0, 100, '2026-01', 3)
    expect(schedule).toHaveLength(3)
  })

  it('24 — marks is_past, is_current, and future rows correctly', () => {
    // Use a fixed start month that is well in the past to ensure past rows
    // We can't know the current month statically, so we build a schedule
    // starting 2 months before now and check relative positioning.
    const now = new Date()
    const pastMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const pY = pastMonth.getFullYear()
    const pM = String(pastMonth.getMonth() + 1).padStart(2, '0')
    const startIso = `${pY}-${pM}`

    const schedule = buildAmortizationSchedule(5000, 0, 1000, startIso, 8)
    expect(schedule.length).toBeGreaterThan(0)

    // row 0 should be in the past (2 months ago)
    expect(schedule[0].is_past).toBe(true)
    expect(schedule[0].is_current).toBe(false)

    // row 1 should be 1 month ago → also past
    expect(schedule[1].is_past).toBe(true)

    // row 2 should be current month
    if (schedule.length > 2) {
      expect(schedule[2].is_current).toBe(true)
      expect(schedule[2].is_past).toBe(false)
    }

    // rows beyond current should be neither past nor current
    if (schedule.length > 3) {
      expect(schedule[3].is_past).toBe(false)
      expect(schedule[3].is_current).toBe(false)
    }
  })

  it('25 — monthly payment > outstanding: first row pays off remaining balance', () => {
    // 500 outstanding, 1000 monthly payment
    const schedule = buildAmortizationSchedule(500, 0, 1000, '2030-01', 12)
    expect(schedule).toHaveLength(1)
    expect(schedule[0].closing_balance_try).toBeCloseTo(0, 1)
  })

  it('26 — month_label is set (non-empty string)', () => {
    const schedule = buildAmortizationSchedule(3000, 0, 1000, '2026-06', 3)
    expect(schedule[0].month_label).toBeTruthy()
    expect(typeof schedule[0].month_label).toBe('string')
    // First row should be Haziran
    expect(schedule[0].month_label).toContain('Haziran')
  })

  it('27 — month_iso increments correctly', () => {
    const schedule = buildAmortizationSchedule(3000, 0, 1000, '2026-06', 3)
    expect(schedule[0].month_iso).toBe('2026-06')
    expect(schedule[1].month_iso).toBe('2026-07')
    expect(schedule[2].month_iso).toBe('2026-08')
  })

  it('28 — closing balance is non-negative throughout', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.20, 500, '2026-01', 30)
    schedule.forEach(row => {
      expect(row.closing_balance_try).toBeGreaterThanOrEqual(0)
    })
  })

  it('29 — opening balance of row n+1 equals closing balance of row n', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.12, 2000, '2026-01', 10)
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].opening_balance_try).toBeCloseTo(
        schedule[i - 1].closing_balance_try, 1
      )
    }
  })

  it('30 — zero-interest: interest_try is 0 for all rows', () => {
    const schedule = buildAmortizationSchedule(5000, 0, 1000, '2026-01', 6)
    schedule.forEach(row => {
      expect(row.interest_try).toBe(0)
    })
  })

  it('31 — with positive interest: interest decreases as balance decreases', () => {
    const schedule = buildAmortizationSchedule(50_000, 0.24, 3000, '2026-01', 20)
    if (schedule.length >= 3) {
      // Interest in row 3 should be <= row 1 (balance going down)
      expect(schedule[2].interest_try).toBeLessThanOrEqual(schedule[0].interest_try)
    }
  })

  it('32 — month_label contains Turkish month name', () => {
    const turkishMonths = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
                          'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık']
    const schedule = buildAmortizationSchedule(5000, 0, 1000, '2026-03', 5)
    schedule.forEach(row => {
      const hasMonth = turkishMonths.some(m => row.month_label.includes(m))
      expect(hasMonth).toBe(true)
    })
  })

  it('33 — year rollover: December → January month_iso increments year', () => {
    const schedule = buildAmortizationSchedule(2000, 0, 1000, '2026-12', 3)
    expect(schedule[0].month_iso).toBe('2026-12')
    expect(schedule[1].month_iso).toBe('2027-01')
  })

  it('34 — principal_try + interest_try = payment (within rounding) for non-final rows', () => {
    const payment = 2000
    const schedule = buildAmortizationSchedule(20_000, 0.12, payment, '2026-01', 15)
    // For non-last rows where balance >> payment, actual payment ≈ payment
    if (schedule.length > 2) {
      const row = schedule[0]
      expect(row.principal_try + row.interest_try).toBeCloseTo(
        Math.min(payment, row.opening_balance_try + row.interest_try), 0
      )
    }
  })
})

// ── computeWeightedAvgRate ────────────────────────────────────────────────────

function makeTranche(outstanding: number, rate: number): TrancheAmortization {
  return {
    tranche_id: Math.random().toString(),
    partner_name: 'Test Partner',
    disbursed_try: outstanding,
    outstanding_try: outstanding,
    annual_interest_rate: rate,
    monthly_payment_try: 0,
    term_months: null,
    schedule: [],
    total_interest_remaining_try: 0,
    total_payment_remaining_try: 0,
    payoff_month: null,
  }
}

describe('computeWeightedAvgRate', () => {
  it('35 — empty array returns null', () => {
    expect(computeWeightedAvgRate([])).toBeNull()
  })

  it('36 — all-zero outstanding returns null', () => {
    const tranches = [makeTranche(0, 0.12), makeTranche(0, 0.24)]
    expect(computeWeightedAvgRate(tranches)).toBeNull()
  })

  it('37 — single tranche: returns its own rate', () => {
    const tranches = [makeTranche(10_000, 0.18)]
    expect(computeWeightedAvgRate(tranches)).toBeCloseTo(0.18, 5)
  })

  it('38 — equal weights: returns arithmetic mean of rates', () => {
    const tranches = [makeTranche(10_000, 0.10), makeTranche(10_000, 0.20)]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.15, 5)
  })

  it('39 — different weights: larger balance dominates', () => {
    // 90k @ 10% + 10k @ 30% → weighted = (9000 + 3000) / 100000 = 0.12
    const tranches = [makeTranche(90_000, 0.10), makeTranche(10_000, 0.30)]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.12, 5)
  })

  it('40 — zero-balance tranches are excluded from weighting', () => {
    // Zero balance tranche should not affect the result
    const tranches = [
      makeTranche(10_000, 0.20),
      makeTranche(0, 0.50),  // should be ignored
    ]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.20, 5)
  })

  it('41 — three tranches: weighted toward largest balance', () => {
    const tranches = [
      makeTranche(80_000, 0.10),
      makeTranche(15_000, 0.20),
      makeTranche(5_000, 0.30),
    ]
    const result = computeWeightedAvgRate(tranches)
    // Dominated by 80K @ 10%
    expect(result).toBeDefined()
    expect(result!).toBeCloseTo((80_000 * 0.10 + 15_000 * 0.20 + 5_000 * 0.30) / 100_000, 4)
  })

  it('42 — result is between min and max rate', () => {
    const tranches = [makeTranche(50_000, 0.10), makeTranche(50_000, 0.40)]
    const result = computeWeightedAvgRate(tranches)
    expect(result!).toBeGreaterThanOrEqual(0.10)
    expect(result!).toBeLessThanOrEqual(0.40)
  })

  it('43 — all same rate: result equals that rate', () => {
    const tranches = [
      makeTranche(10_000, 0.25),
      makeTranche(20_000, 0.25),
      makeTranche(30_000, 0.25),
    ]
    expect(computeWeightedAvgRate(tranches)).toBeCloseTo(0.25, 5)
  })

  it('44 — zero rate tranche included when balance > 0', () => {
    const tranches = [makeTranche(100_000, 0), makeTranche(100_000, 0.20)]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.10, 5) // average of 0 and 0.20
  })
})

// ── Cross-function consistency ────────────────────────────────────────────────

describe('amortization cross-function consistency', () => {

  it('45 — calculateMonthlyPayment × termMonths >= principal', () => {
    const p = 100_000, r = 0.20, n = 24
    const payment = calculateMonthlyPayment(p, r, n)
    expect(payment * n).toBeGreaterThanOrEqual(p)
  })

  it('46 — buildAmortizationSchedule: zero-rate balance hits 0 exactly', () => {
    const schedule = buildAmortizationSchedule(6000, 0, 2000, '2026-01', 6)
    expect(schedule).toHaveLength(3)
    expect(schedule[schedule.length - 1].closing_balance_try).toBeCloseTo(0, 1)
  })

  it('47 — schedule last row closing_balance ≈ 0 for exact-fit payment', () => {
    const principal = 10_000
    const rate = 0.12
    const term = 12
    const payment = calculateMonthlyPayment(principal, rate, term)
    const schedule = buildAmortizationSchedule(principal, rate, payment, '2030-01', term)
    expect(schedule[schedule.length - 1].closing_balance_try).toBeLessThan(1)
  })

  it('48 — computeWeightedAvgRate equals single tranche rate for 1-tranche array', () => {
    const t = [makeTranche(50_000, 0.25)]
    expect(computeWeightedAvgRate(t)).toBeCloseTo(0.25, 5)
  })

  it('49 — schedule rows: sum of principal_try ≈ outstanding', () => {
    const outstanding = 5000
    const schedule = buildAmortizationSchedule(outstanding, 0, 1000, '2026-01', 6)
    const sumPrincipal = schedule.reduce((s, r) => s + r.principal_try, 0)
    expect(sumPrincipal).toBeCloseTo(outstanding, 1)
  })

  it('50 — payment at 0% rate × months = principal exactly', () => {
    const principal = 48_000
    const months = 48
    const payment = calculateMonthlyPayment(principal, 0, months)
    expect(payment * months).toBeCloseTo(principal, 0)
  })

})
