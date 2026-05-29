/**
 * AmortizationScheduleService — pure-logic unit tests
 *
 * Tests for:
 *   computeMonthlyInterest
 *   computeMonthlyPayment
 *   computeRemainingBalance
 *   computeTotalInterestCost
 *   computeMonthlyCoverage
 *
 * Run: npx vitest run tests/amortization-schedule.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyInterest,
  computeMonthlyPayment,
  computeRemainingBalance,
  computeTotalInterestCost,
  computeMonthlyCoverage,
} from '../lib/services/pcle/amortization-schedule.service'

// ── computeMonthlyInterest ────────────────────────────────────────────────────

describe('computeMonthlyInterest', () => {
  it('normal: 120,000 TRY at 24% annual → 2,400 TRY monthly', () => {
    // 120000 × (24 / 12 / 100) = 120000 × 0.02 = 2400
    const result = computeMonthlyInterest(120_000, 24)
    expect(result).toBeCloseTo(2400, 2)
  })

  it('zero rate: returns 0', () => {
    const result = computeMonthlyInterest(100_000, 0)
    expect(result).toBe(0)
  })

  it('zero principal: returns 0', () => {
    const result = computeMonthlyInterest(0, 30)
    expect(result).toBe(0)
  })

  it('negative principal: returns 0', () => {
    const result = computeMonthlyInterest(-50_000, 20)
    expect(result).toBe(0)
  })

  it('small loan: 12,000 TRY at 12% annual → 120 TRY monthly', () => {
    // 12000 × (12 / 12 / 100) = 12000 × 0.01 = 120
    const result = computeMonthlyInterest(12_000, 12)
    expect(result).toBeCloseTo(120, 2)
  })
})

// ── computeMonthlyPayment ─────────────────────────────────────────────────────

describe('computeMonthlyPayment', () => {
  it('zero months: returns 0', () => {
    const result = computeMonthlyPayment(100_000, 20, 0)
    expect(result).toBe(0)
  })

  it('zero principal: returns 0', () => {
    const result = computeMonthlyPayment(0, 20, 12)
    expect(result).toBe(0)
  })

  it('zero rate: equal principal split (12,000 / 12 = 1,000)', () => {
    const result = computeMonthlyPayment(12_000, 0, 12)
    expect(result).toBeCloseTo(1000, 2)
  })

  it('zero rate 24 months: equal split (24,000 / 24 = 1,000)', () => {
    const result = computeMonthlyPayment(24_000, 0, 24)
    expect(result).toBeCloseTo(1000, 2)
  })

  it('standard: 120,000 TRY at 24% for 12 months — payment > principal/n', () => {
    const result = computeMonthlyPayment(120_000, 24, 12)
    // 10000 pure principal + interest; total must exceed 10000
    expect(result).toBeGreaterThan(10_000)
    // Standard formula: P × r / (1 - (1+r)^-n) with r=0.02, n=12
    // = 120000 × 0.02 / (1 - 1.02^-12) ≈ 11,347
    expect(result).toBeCloseTo(11347, 0)
  })

  it('high rate 60 months: payment is substantial', () => {
    const result = computeMonthlyPayment(100_000, 60, 60)
    // r = 0.05/month, n = 60: extremely high — just sanity check > principal/n
    expect(result).toBeGreaterThan(100_000 / 60)
  })

  it('1-month loan: payment equals principal plus 1 month interest', () => {
    const result = computeMonthlyPayment(10_000, 12, 1)
    const expected = 10_000 + computeMonthlyInterest(10_000, 12)
    expect(result).toBeCloseTo(expected, 1)
  })

  it('negative months: returns 0', () => {
    const result = computeMonthlyPayment(100_000, 20, -5)
    expect(result).toBe(0)
  })
})

// ── computeRemainingBalance ───────────────────────────────────────────────────

describe('computeRemainingBalance', () => {
  it('normal: 100,000 - 5,000 = 95,000', () => {
    const result = computeRemainingBalance(100_000, 5_000)
    expect(result).toBeCloseTo(95_000, 2)
  })

  it('payment equals balance: result is 0', () => {
    const result = computeRemainingBalance(50_000, 50_000)
    expect(result).toBe(0)
  })

  it('payment exceeds balance: result is clamped to 0', () => {
    const result = computeRemainingBalance(10_000, 15_000)
    expect(result).toBe(0)
  })

  it('zero payment: balance unchanged', () => {
    const result = computeRemainingBalance(75_000, 0)
    expect(result).toBeCloseTo(75_000, 2)
  })

  it('zero balance: result is 0', () => {
    const result = computeRemainingBalance(0, 1_000)
    expect(result).toBe(0)
  })
})

// ── computeTotalInterestCost ──────────────────────────────────────────────────

describe('computeTotalInterestCost', () => {
  it('zero monthly payment: returns 0', () => {
    const result = computeTotalInterestCost(0, 12, 100_000)
    expect(result).toBe(0)
  })

  it('zero months: returns 0', () => {
    const result = computeTotalInterestCost(1000, 0, 12_000)
    expect(result).toBe(0)
  })

  it('zero rate (payment × months = principal): returns 0', () => {
    // Equal split: 1000/month × 12 = 12,000 principal → no interest
    const result = computeTotalInterestCost(1_000, 12, 12_000)
    expect(result).toBe(0)
  })

  it('interest-bearing loan: total interest > 0', () => {
    // 120,000 at 24% for 12 months, monthly ≈ 11,327
    const monthlyPayment = computeMonthlyPayment(120_000, 24, 12)
    const result = computeTotalInterestCost(monthlyPayment, 12, 120_000)
    expect(result).toBeGreaterThan(0)
    // Sanity: 11347 × 12 - 120000 = 136164 - 120000 ≈ 16166
    expect(result).toBeCloseTo(16166, 0)
  })

  it('never returns negative interest', () => {
    // Slightly overpaid scenario (floating point edge)
    const result = computeTotalInterestCost(1_000, 12, 12_001)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ── computeMonthlyCoverage ────────────────────────────────────────────────────

describe('computeMonthlyCoverage', () => {
  it('normal: income 30,000, debt service 10,000 → DSCR 3.0', () => {
    const result = computeMonthlyCoverage(30_000, 7_000, 3_000)
    expect(result).toBeCloseTo(3.0, 2)
  })

  it('zero debt service (no principal, no interest): returns null', () => {
    const result = computeMonthlyCoverage(50_000, 0, 0)
    expect(result).toBeNull()
  })

  it('only interest as debt service', () => {
    const result = computeMonthlyCoverage(6_000, 0, 2_000)
    expect(result).toBeCloseTo(3.0, 2)
  })

  it('loss income (negative net income): DSCR is negative', () => {
    const result = computeMonthlyCoverage(-5_000, 5_000, 2_000)
    expect(result).toBeLessThan(0)
    expect(result).toBeCloseTo(-5000 / 7000, 2)
  })

  it('zero income but positive debt service: DSCR = 0', () => {
    const result = computeMonthlyCoverage(0, 3_000, 1_000)
    expect(result).toBe(0)
  })

  it('income exactly covers debt service: DSCR = 1.0', () => {
    const result = computeMonthlyCoverage(10_000, 8_000, 2_000)
    expect(result).toBeCloseTo(1.0, 2)
  })

  it('only principal as debt service', () => {
    const result = computeMonthlyCoverage(20_000, 10_000, 0)
    expect(result).toBeCloseTo(2.0, 2)
  })
})
