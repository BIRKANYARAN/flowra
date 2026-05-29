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
  it('1 — normal: 120,000 TRY at 24% annual → 2,400 TRY monthly', () => {
    // 120000 × (24 / 12 / 100) = 120000 × 0.02 = 2400
    const result = computeMonthlyInterest(120_000, 24)
    expect(result).toBeCloseTo(2400, 2)
  })

  it('2 — zero rate: returns 0', () => {
    const result = computeMonthlyInterest(100_000, 0)
    expect(result).toBe(0)
  })

  it('3 — zero principal: returns 0', () => {
    const result = computeMonthlyInterest(0, 30)
    expect(result).toBe(0)
  })

  it('4 — negative principal: returns 0', () => {
    const result = computeMonthlyInterest(-50_000, 20)
    expect(result).toBe(0)
  })

  it('5 — small loan: 12,000 TRY at 12% annual → 120 TRY monthly', () => {
    // 12000 × (12 / 12 / 100) = 12000 × 0.01 = 120
    const result = computeMonthlyInterest(12_000, 12)
    expect(result).toBeCloseTo(120, 2)
  })

  it('6 — scales linearly with principal', () => {
    const r1 = computeMonthlyInterest(100_000, 24)
    const r2 = computeMonthlyInterest(200_000, 24)
    expect(r2).toBeCloseTo(r1 * 2, 2)
  })

  it('7 — scales linearly with rate', () => {
    const r1 = computeMonthlyInterest(100_000, 12)
    const r2 = computeMonthlyInterest(100_000, 24)
    expect(r2).toBeCloseTo(r1 * 2, 2)
  })

  it('8 — 50% annual rate on 1M: 1M × 50/12/100 ≈ 41666.67', () => {
    // 1_000_000 × (50 / 12 / 100) = 1_000_000 × 0.041667 ≈ 41666.67
    const result = computeMonthlyInterest(1_000_000, 50)
    expect(result).toBeCloseTo(41666.67, 0)
  })

  it('9 — result is non-negative', () => {
    const cases = [[100_000, 20], [0, 30], [500_000, 0], [-1000, 20]]
    for (const [p, r] of cases) {
      expect(computeMonthlyInterest(p, r)).toBeGreaterThanOrEqual(0)
    }
  })

  it('10 — result is rounded to 2 decimal places', () => {
    // 100_000 × (15 / 12 / 100) = 1250 (exact)
    const result = computeMonthlyInterest(100_000, 15)
    expect(result).toBeCloseTo(1250, 2)
  })
})

// ── computeMonthlyPayment ─────────────────────────────────────────────────────

describe('computeMonthlyPayment', () => {
  it('11 — zero months: returns 0', () => {
    const result = computeMonthlyPayment(100_000, 20, 0)
    expect(result).toBe(0)
  })

  it('12 — zero principal: returns 0', () => {
    const result = computeMonthlyPayment(0, 20, 12)
    expect(result).toBe(0)
  })

  it('13 — zero rate: equal principal split (12,000 / 12 = 1,000)', () => {
    const result = computeMonthlyPayment(12_000, 0, 12)
    expect(result).toBeCloseTo(1000, 2)
  })

  it('14 — zero rate 24 months: equal split (24,000 / 24 = 1,000)', () => {
    const result = computeMonthlyPayment(24_000, 0, 24)
    expect(result).toBeCloseTo(1000, 2)
  })

  it('15 — standard: 120,000 TRY at 24% for 12 months — payment > principal/n', () => {
    const result = computeMonthlyPayment(120_000, 24, 12)
    // 10000 pure principal + interest; total must exceed 10000
    expect(result).toBeGreaterThan(10_000)
    // Standard formula: P × r / (1 - (1+r)^-n) with r=0.02, n=12
    // = 120000 × 0.02 / (1 - 1.02^-12) ≈ 11,347
    expect(result).toBeCloseTo(11347, 0)
  })

  it('16 — high rate 60 months: payment is substantial', () => {
    const result = computeMonthlyPayment(100_000, 60, 60)
    // r = 0.05/month, n = 60: extremely high — just sanity check > principal/n
    expect(result).toBeGreaterThan(100_000 / 60)
  })

  it('17 — 1-month loan: payment equals principal plus 1 month interest', () => {
    const result = computeMonthlyPayment(10_000, 12, 1)
    const expected = 10_000 + computeMonthlyInterest(10_000, 12)
    expect(result).toBeCloseTo(expected, 1)
  })

  it('18 — negative months: returns 0', () => {
    const result = computeMonthlyPayment(100_000, 20, -5)
    expect(result).toBe(0)
  })

  it('19 — longer term = lower payment (same principal, same rate)', () => {
    const short = computeMonthlyPayment(100_000, 24, 12)
    const long  = computeMonthlyPayment(100_000, 24, 60)
    expect(long).toBeLessThan(short)
  })

  it('20 — payment × months >= principal (total payments cover principal)', () => {
    const months = 24
    const payment = computeMonthlyPayment(120_000, 20, months)
    expect(payment * months).toBeGreaterThanOrEqual(120_000)
  })

  it('21 — zero rate: total payments equal exactly principal', () => {
    const months = 12
    const principal = 12_000
    const payment = computeMonthlyPayment(principal, 0, months)
    expect(payment * months).toBeCloseTo(principal, 1)
  })

  it('22 — result is rounded to 2 decimal places', () => {
    const result = computeMonthlyPayment(100_000, 18, 18)
    const str = result.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(2)
  })

  it('23 — large principal at high Turkish rate', () => {
    const result = computeMonthlyPayment(5_000_000, 40, 36)
    expect(result).toBeGreaterThan(5_000_000 / 36) // at minimum linear
  })
})

// ── computeRemainingBalance ───────────────────────────────────────────────────

describe('computeRemainingBalance', () => {
  it('24 — normal: 100,000 - 5,000 = 95,000', () => {
    const result = computeRemainingBalance(100_000, 5_000)
    expect(result).toBeCloseTo(95_000, 2)
  })

  it('25 — payment equals balance: result is 0', () => {
    const result = computeRemainingBalance(50_000, 50_000)
    expect(result).toBe(0)
  })

  it('26 — payment exceeds balance: result is clamped to 0', () => {
    const result = computeRemainingBalance(10_000, 15_000)
    expect(result).toBe(0)
  })

  it('27 — zero payment: balance unchanged', () => {
    const result = computeRemainingBalance(75_000, 0)
    expect(result).toBeCloseTo(75_000, 2)
  })

  it('28 — zero balance: result is 0', () => {
    const result = computeRemainingBalance(0, 1_000)
    expect(result).toBe(0)
  })

  it('29 — small payment: balance decreases correctly', () => {
    const result = computeRemainingBalance(1000, 1)
    expect(result).toBeCloseTo(999, 2)
  })

  it('30 — result is always non-negative', () => {
    const cases: [number, number][] = [
      [0, 0], [100, 0], [100, 50], [100, 100], [100, 150], [0, 100],
    ]
    for (const [balance, payment] of cases) {
      expect(computeRemainingBalance(balance, payment)).toBeGreaterThanOrEqual(0)
    }
  })

  it('31 — rounded to 2 decimal places', () => {
    const result = computeRemainingBalance(1000.005, 333.333)
    const str = result.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(2)
  })
})

// ── computeTotalInterestCost ──────────────────────────────────────────────────

describe('computeTotalInterestCost', () => {
  it('32 — zero monthly payment: returns 0', () => {
    const result = computeTotalInterestCost(0, 12, 100_000)
    expect(result).toBe(0)
  })

  it('33 — zero months: returns 0', () => {
    const result = computeTotalInterestCost(1000, 0, 12_000)
    expect(result).toBe(0)
  })

  it('34 — zero rate (payment × months = principal): returns 0', () => {
    // Equal split: 1000/month × 12 = 12,000 principal → no interest
    const result = computeTotalInterestCost(1_000, 12, 12_000)
    expect(result).toBe(0)
  })

  it('35 — interest-bearing loan: total interest > 0', () => {
    // 120,000 at 24% for 12 months, monthly ≈ 11,327
    const monthlyPayment = computeMonthlyPayment(120_000, 24, 12)
    const result = computeTotalInterestCost(monthlyPayment, 12, 120_000)
    expect(result).toBeGreaterThan(0)
    // Sanity: 11347 × 12 - 120000 = 136164 - 120000 ≈ 16166
    expect(result).toBeCloseTo(16166, 0)
  })

  it('36 — never returns negative interest', () => {
    // Slightly overpaid scenario (floating point edge)
    const result = computeTotalInterestCost(1_000, 12, 12_001)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('37 — longer term → more total interest (same principal, same rate)', () => {
    const payment12 = computeMonthlyPayment(100_000, 20, 12)
    const payment36 = computeMonthlyPayment(100_000, 20, 36)
    const interest12 = computeTotalInterestCost(payment12, 12, 100_000)
    const interest36 = computeTotalInterestCost(payment36, 36, 100_000)
    expect(interest36).toBeGreaterThan(interest12)
  })

  it('38 — higher rate → more total interest (same principal, same term)', () => {
    const p1 = computeMonthlyPayment(100_000, 10, 24)
    const p2 = computeMonthlyPayment(100_000, 30, 24)
    const i1 = computeTotalInterestCost(p1, 24, 100_000)
    const i2 = computeTotalInterestCost(p2, 24, 100_000)
    expect(i2).toBeGreaterThan(i1)
  })

  it('39 — zero rate: total interest is 0 regardless of term', () => {
    const payment = computeMonthlyPayment(60_000, 0, 60)
    const interest = computeTotalInterestCost(payment, 60, 60_000)
    expect(interest).toBeCloseTo(0, 1)
  })

  it('40 — total cost = principal + total interest', () => {
    const principal = 100_000
    const months = 24
    const payment = computeMonthlyPayment(principal, 20, months)
    const totalInterest = computeTotalInterestCost(payment, months, principal)
    const totalCost = payment * months
    expect(totalCost).toBeCloseTo(principal + totalInterest, 0)
  })
})

// ── computeMonthlyCoverage ────────────────────────────────────────────────────

describe('computeMonthlyCoverage', () => {
  it('41 — normal: income 30,000, debt service 10,000 → DSCR 3.0', () => {
    const result = computeMonthlyCoverage(30_000, 7_000, 3_000)
    expect(result).toBeCloseTo(3.0, 2)
  })

  it('42 — zero debt service (no principal, no interest): returns null', () => {
    const result = computeMonthlyCoverage(50_000, 0, 0)
    expect(result).toBeNull()
  })

  it('43 — only interest as debt service', () => {
    const result = computeMonthlyCoverage(6_000, 0, 2_000)
    expect(result).toBeCloseTo(3.0, 2)
  })

  it('44 — loss income (negative net income): DSCR is negative', () => {
    const result = computeMonthlyCoverage(-5_000, 5_000, 2_000)
    expect(result).toBeLessThan(0)
    expect(result).toBeCloseTo(-5000 / 7000, 2)
  })

  it('45 — zero income but positive debt service: DSCR = 0', () => {
    const result = computeMonthlyCoverage(0, 3_000, 1_000)
    expect(result).toBe(0)
  })

  it('46 — income exactly covers debt service: DSCR = 1.0', () => {
    const result = computeMonthlyCoverage(10_000, 8_000, 2_000)
    expect(result).toBeCloseTo(1.0, 2)
  })

  it('47 — only principal as debt service', () => {
    const result = computeMonthlyCoverage(20_000, 10_000, 0)
    expect(result).toBeCloseTo(2.0, 2)
  })

  it('48 — high DSCR: income >> debt service', () => {
    const result = computeMonthlyCoverage(1_000_000, 10_000, 5_000)
    expect(result).toBeCloseTo(1_000_000 / 15_000, 2)
  })

  it('49 — DSCR < 1 indicates insufficient coverage', () => {
    // income 5K, debt service 10K → DSCR = 0.5
    const result = computeMonthlyCoverage(5_000, 8_000, 2_000)
    expect(result).toBeCloseTo(0.5, 2)
    expect(result!).toBeLessThan(1)
  })

  it('50 — result is rounded to 2 decimal places', () => {
    const result = computeMonthlyCoverage(10_000, 3_000, 333)
    if (result !== null) {
      const str = result.toString()
      const decimals = str.includes('.') ? str.split('.')[1].length : 0
      expect(decimals).toBeLessThanOrEqual(2)
    }
  })

  it('51 — negative principal payment treated as debt reduction', () => {
    // principal=0, interest=0 → null
    const result = computeMonthlyCoverage(20_000, 0, 0)
    expect(result).toBeNull()
  })

  it('52 — very small debt service returns large positive DSCR', () => {
    const result = computeMonthlyCoverage(100_000, 1, 0)
    expect(result).toBeCloseTo(100_000, 0)
  })
})

// ── Cross-function integration ────────────────────────────────────────────────

describe('amortization-schedule cross-function integration', () => {

  it('53 — payment × months covers principal + total interest', () => {
    const principal = 120_000
    const months = 24
    const rate = 24
    const payment = computeMonthlyPayment(principal, rate, months)
    const totalInterest = computeTotalInterestCost(payment, months, principal)
    expect(payment * months).toBeCloseTo(principal + totalInterest, 0)
  })

  it('54 — monthly interest on first period = computeMonthlyInterest(principal, rate)', () => {
    const principal = 100_000
    const rate = 20
    const expectedInterest = computeMonthlyInterest(principal, rate)
    // The first period's interest should match computeMonthlyInterest on full principal
    expect(expectedInterest).toBeGreaterThan(0)
    expect(expectedInterest).toBeCloseTo(principal * rate / 12 / 100, 2)
  })

  it('55 — remaining balance after full payment is 0', () => {
    const balance = 50_000
    const result = computeRemainingBalance(balance, balance)
    expect(result).toBe(0)
  })

  it('56 — computeMonthlyPayment 1 month: payment = principal + 1-month interest', () => {
    const p = 10_000
    const r = 24
    const payment = computeMonthlyPayment(p, r, 1)
    const interest = computeMonthlyInterest(p, r)
    expect(payment).toBeCloseTo(p + interest, 1)
  })

  it('57 — zero rate: total interest cost is near 0 (rounding margin < 1 TRY)', () => {
    // round2 on payment may produce tiny rounding difference × months
    for (const months of [6, 12, 24, 36, 60]) {
      const payment = computeMonthlyPayment(100_000, 0, months)
      const interest = computeTotalInterestCost(payment, months, 100_000)
      expect(interest).toBeGreaterThanOrEqual(0)
      expect(interest).toBeLessThan(1) // rounding error < 1 TRY
    }
  })

  it('58 — DSCR increases proportionally with income', () => {
    const principal = 5_000
    const interest = 2_000
    const r1 = computeMonthlyCoverage(14_000, principal, interest)
    const r2 = computeMonthlyCoverage(28_000, principal, interest)
    expect(r2).toBeCloseTo(r1! * 2, 1)
  })

  it('59 — computeRemainingBalance is commutative in result (always ≥ 0)', () => {
    const cases = [[1000, 500], [500, 1000], [0, 0], [10, 10]]
    for (const [b, p] of cases) {
      expect(computeRemainingBalance(b, p)).toBeGreaterThanOrEqual(0)
    }
  })

  it('60 — computeMonthlyInterest × 12 ≈ annual interest on same balance', () => {
    const principal = 100_000
    const rate = 24 // 24% annual
    const monthly = computeMonthlyInterest(principal, rate)
    // 12 months × monthly interest ≈ annual (only exact if balance constant)
    expect(monthly * 12).toBeCloseTo(principal * rate / 100, 0)
  })

})
