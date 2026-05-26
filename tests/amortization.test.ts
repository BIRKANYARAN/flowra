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
  it('zero interest rate: payment = principal / termMonths (linear)', () => {
    const payment = calculateMonthlyPayment(12_000, 0, 12)
    expect(payment).toBeCloseTo(1000, 2)
  })

  it('zero interest, 24 months: linear division', () => {
    const payment = calculateMonthlyPayment(24_000, 0, 24)
    expect(payment).toBeCloseTo(1000, 2)
  })

  it('standard PMT: ₺100 000, 12% annual, 12 months → ≈ ₺8884.88', () => {
    // Known: P=100000, r=0.01, n=12 → PMT = 8884.88
    const payment = calculateMonthlyPayment(100_000, 0.12, 12)
    expect(payment).toBeCloseTo(8884.88, 0)
  })

  it('standard PMT: ₺120 000, 24% annual, 24 months → ≈ ₺6344.53', () => {
    // r=0.02, n=24 → PMT = 120000 × 0.02 × 1.02^24 / (1.02^24 − 1) ≈ 6344.53
    const payment = calculateMonthlyPayment(120_000, 0.24, 24)
    expect(payment).toBeCloseTo(6344.53, 0)
  })

  it('1-month term: payment equals full principal + 1 month interest', () => {
    // r=0.01 for 1 month: P × 0.01 × 1.01 / (1.01 - 1) = P × 1.01
    const payment = calculateMonthlyPayment(10_000, 0.12, 1)
    expect(payment).toBeCloseTo(10_100, 0)
  })

  it('zero principal returns 0', () => {
    expect(calculateMonthlyPayment(0, 0.12, 12)).toBe(0)
  })

  it('zero termMonths returns 0', () => {
    expect(calculateMonthlyPayment(10_000, 0.12, 0)).toBe(0)
  })

  it('very low rate (near zero) returns ~principal/n', () => {
    // 0.01% annual ≈ linear
    const payment = calculateMonthlyPayment(12_000, 0.0001, 12)
    // Should be just above 1000
    expect(payment).toBeGreaterThan(1000)
    expect(payment).toBeLessThan(1001)
  })
})

// ── buildAmortizationSchedule ─────────────────────────────────────────────────

describe('buildAmortizationSchedule', () => {
  it('zero balance returns empty array', () => {
    const schedule = buildAmortizationSchedule(0, 0.12, 1000, '2026-01')
    expect(schedule).toHaveLength(0)
  })

  it('zero payment returns empty array', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.12, 0, '2026-01')
    expect(schedule).toHaveLength(0)
  })

  it('3-month zero-interest schedule has correct closing balances', () => {
    // 3000 principal, 0% rate, 1000/month
    const schedule = buildAmortizationSchedule(3000, 0, 1000, '2026-01', 6)
    expect(schedule).toHaveLength(3)
    expect(schedule[0].closing_balance_try).toBeCloseTo(2000, 1)
    expect(schedule[1].closing_balance_try).toBeCloseTo(1000, 1)
    expect(schedule[2].closing_balance_try).toBeCloseTo(0, 1)
  })

  it('3-month schedule: interest in each row equals opening_balance × rate/12', () => {
    const schedule = buildAmortizationSchedule(10_000, 0.12, 2000, '2026-01', 6)
    for (const row of schedule) {
      const expectedInterest = row.opening_balance_try * 0.01
      expect(row.interest_try).toBeCloseTo(expectedInterest, 1)
    }
  })

  it('period_number starts at 1 and increments correctly', () => {
    const schedule = buildAmortizationSchedule(5000, 0, 1000, '2026-01', 10)
    schedule.forEach((row, i) => {
      expect(row.period_number).toBe(i + 1)
    })
  })

  it('maxMonths cap: never exceeds 60', () => {
    // Very large loan, very small payment → would run forever if not capped
    const schedule = buildAmortizationSchedule(1_000_000, 0.01, 100, '2026-01', 100)
    expect(schedule.length).toBeLessThanOrEqual(60)
  })

  it('explicit maxMonths=3 caps at 3 even if loan not paid off', () => {
    const schedule = buildAmortizationSchedule(10_000, 0, 100, '2026-01', 3)
    expect(schedule).toHaveLength(3)
  })

  it('marks is_past, is_current, and future rows correctly', () => {
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

  it('monthly payment > outstanding: first row pays off remaining balance', () => {
    // 500 outstanding, 1000 monthly payment
    const schedule = buildAmortizationSchedule(500, 0, 1000, '2030-01', 12)
    expect(schedule).toHaveLength(1)
    expect(schedule[0].closing_balance_try).toBeCloseTo(0, 1)
  })

  it('month_label is set (non-empty string)', () => {
    const schedule = buildAmortizationSchedule(3000, 0, 1000, '2026-06', 3)
    expect(schedule[0].month_label).toBeTruthy()
    expect(typeof schedule[0].month_label).toBe('string')
    // First row should be Haziran
    expect(schedule[0].month_label).toContain('Haziran')
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
  it('empty array returns null', () => {
    expect(computeWeightedAvgRate([])).toBeNull()
  })

  it('all-zero outstanding returns null', () => {
    const tranches = [makeTranche(0, 0.12), makeTranche(0, 0.24)]
    expect(computeWeightedAvgRate(tranches)).toBeNull()
  })

  it('single tranche: returns its own rate', () => {
    const tranches = [makeTranche(10_000, 0.18)]
    expect(computeWeightedAvgRate(tranches)).toBeCloseTo(0.18, 5)
  })

  it('equal weights: returns arithmetic mean of rates', () => {
    const tranches = [makeTranche(10_000, 0.10), makeTranche(10_000, 0.20)]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.15, 5)
  })

  it('different weights: larger balance dominates', () => {
    // 90k @ 10% + 10k @ 30% → weighted = (9000 + 3000) / 100000 = 0.12
    const tranches = [makeTranche(90_000, 0.10), makeTranche(10_000, 0.30)]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.12, 5)
  })

  it('zero-balance tranches are excluded from weighting', () => {
    // Zero balance tranche should not affect the result
    const tranches = [
      makeTranche(10_000, 0.20),
      makeTranche(0, 0.50),  // should be ignored
    ]
    const result = computeWeightedAvgRate(tranches)
    expect(result).toBeCloseTo(0.20, 5)
  })
})
