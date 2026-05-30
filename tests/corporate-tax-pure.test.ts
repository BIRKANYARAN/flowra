// ─────────────────────────────────────────────────────────────────────────────
// tests/corporate-tax-pure.test.ts
//
// Pure function tests for:
//   computeEffectiveTaxRate
//   computeRemainingTaxLiability
//   daysUntilEvent
//   generateQuarterlySchedule
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeEffectiveTaxRate,
  computeRemainingTaxLiability,
  daysUntilEvent,
  generateQuarterlySchedule,
} from '../lib/services/tax/tax-compliance.service'

// ── computeEffectiveTaxRate ───────────────────────────────────────────────────

describe('computeEffectiveTaxRate', () => {
  it('returns 0 when grossProfit is zero', () => {
    expect(computeEffectiveTaxRate(1000, 0)).toBe(0)
  })

  it('returns 0 when grossProfit is negative', () => {
    expect(computeEffectiveTaxRate(5000, -1)).toBe(0)
  })

  it('returns 0 when grossProfit is very negative', () => {
    expect(computeEffectiveTaxRate(100_000, -500_000)).toBe(0)
  })

  it('computes 25% effective rate', () => {
    expect(computeEffectiveTaxRate(25_000, 100_000)).toBeCloseTo(25, 5)
  })

  it('computes 20% effective rate', () => {
    expect(computeEffectiveTaxRate(20_000, 100_000)).toBeCloseTo(20, 5)
  })

  it('computes fractional rate correctly', () => {
    expect(computeEffectiveTaxRate(1, 3)).toBeCloseTo(33.333, 2)
  })

  it('returns 100 when taxPaid equals grossProfit', () => {
    expect(computeEffectiveTaxRate(500, 500)).toBeCloseTo(100, 5)
  })

  it('returns 0 when taxPaid is 0 and grossProfit is positive', () => {
    expect(computeEffectiveTaxRate(0, 100_000)).toBe(0)
  })

  it('handles large numbers proportionally', () => {
    const rate = computeEffectiveTaxRate(378_750, 1_515_000)
    expect(rate).toBeCloseTo(25, 5)
  })
})

// ── computeRemainingTaxLiability ─────────────────────────────────────────────

describe('computeRemainingTaxLiability', () => {
  it('returns full estimate when no payments made', () => {
    expect(computeRemainingTaxLiability(100_000, [])).toBe(100_000)
  })

  it('subtracts a single payment', () => {
    expect(computeRemainingTaxLiability(100_000, [25_000])).toBe(75_000)
  })

  it('subtracts multiple quarterly payments', () => {
    expect(computeRemainingTaxLiability(100_000, [25_000, 25_000])).toBe(50_000)
  })

  it('subtracts all four quarterly payments', () => {
    expect(computeRemainingTaxLiability(100_000, [25_000, 25_000, 25_000, 25_000])).toBe(0)
  })

  it('floors at 0 when overpaid', () => {
    expect(computeRemainingTaxLiability(100_000, [120_000])).toBe(0)
  })

  it('floors at 0 when installments exceed estimate', () => {
    expect(computeRemainingTaxLiability(50_000, [20_000, 20_000, 20_000])).toBe(0)
  })

  it('handles zero estimate', () => {
    expect(computeRemainingTaxLiability(0, [])).toBe(0)
  })

  it('handles zero estimate with payments', () => {
    expect(computeRemainingTaxLiability(0, [10_000])).toBe(0)
  })

  it('handles fractional amounts', () => {
    expect(computeRemainingTaxLiability(378_750, [94_687.5])).toBeCloseTo(284_062.5, 2)
  })

  it('sums all installments before subtracting', () => {
    const result = computeRemainingTaxLiability(400_000, [100_000, 50_000, 25_000])
    expect(result).toBe(225_000)
  })
})

// ── daysUntilEvent ────────────────────────────────────────────────────────────

describe('daysUntilEvent', () => {
  it('returns 0 when dueDate equals today', () => {
    expect(daysUntilEvent('2025-05-30', '2025-05-30')).toBe(0)
  })

  it('returns positive number for a future event', () => {
    expect(daysUntilEvent('2025-06-15', '2025-05-30')).toBe(16)
  })

  it('returns negative number for an overdue event', () => {
    expect(daysUntilEvent('2025-05-15', '2025-05-30')).toBe(-15)
  })

  it('handles month boundary correctly', () => {
    expect(daysUntilEvent('2025-06-01', '2025-05-31')).toBe(1)
  })

  it('handles year boundary correctly', () => {
    expect(daysUntilEvent('2026-01-01', '2025-12-31')).toBe(1)
  })

  it('handles a full year difference', () => {
    expect(daysUntilEvent('2026-05-30', '2025-05-30')).toBe(365)
  })

  it('handles same month different day', () => {
    expect(daysUntilEvent('2025-05-20', '2025-05-30')).toBe(-10)
  })

  it('returns correct days for Q2 due date from today', () => {
    // Q2: May 15, today: May 30 → -15
    expect(daysUntilEvent('2025-05-15', '2025-05-30')).toBe(-15)
  })

  it('handles far future dates', () => {
    const days = daysUntilEvent('2030-05-30', '2025-05-30')
    // 5 years: 4 leap years + 1 normal = 365*5 + 1 = 1826 (or 1827 depending on leap)
    expect(days).toBeGreaterThan(1800)
  })
})

// ── generateQuarterlySchedule ─────────────────────────────────────────────────

describe('generateQuarterlySchedule', () => {
  const ANNUAL = 400_000
  const TODAY  = '2025-05-30'

  it('always returns exactly 4 quarters', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched).toHaveLength(4)
  })

  it('quarter numbers are 1, 2, 3, 4', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched.map(q => q.quarter)).toEqual([1, 2, 3, 4])
  })

  it('Q1 due date is February 15', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[0].due_date).toBe('2025-02-15')
  })

  it('Q2 due date is May 15', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[1].due_date).toBe('2025-05-15')
  })

  it('Q3 due date is August 15', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[2].due_date).toBe('2025-08-15')
  })

  it('Q4 due date is November 15', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[3].due_date).toBe('2025-11-15')
  })

  it('each quarter amount equals annualEstimate / 4', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    for (const q of sched) {
      expect(q.amount).toBe(ANNUAL / 4)
    }
  })

  it('sum of all quarter amounts equals annualEstimate', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    const total = sched.reduce((s, q) => s + q.amount, 0)
    expect(total).toBe(ANNUAL)
  })

  it('Q1 and Q2 are overdue as of 2025-05-30 (past due dates)', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[0].status).toBe('overdue')  // Feb 15
    expect(sched[1].status).toBe('overdue')  // May 15 (15 days before May 30)
  })

  it('Q3 and Q4 are pending as of 2025-05-30 (future dates)', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, TODAY)
    expect(sched[2].status).toBe('pending')  // Aug 15
    expect(sched[3].status).toBe('pending')  // Nov 15
  })

  it('works for a different year', () => {
    const sched = generateQuarterlySchedule(2026, ANNUAL, '2026-01-01')
    expect(sched[0].due_date).toBe('2026-02-15')
    expect(sched[3].due_date).toBe('2026-11-15')
  })

  it('all quarters are pending when today is before Q1 due date', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, '2025-01-01')
    for (const q of sched) {
      expect(q.status).toBe('pending')
    }
  })

  it('all quarters are overdue when today is after Q4 due date', () => {
    const sched = generateQuarterlySchedule(2025, ANNUAL, '2025-12-31')
    for (const q of sched) {
      expect(q.status).toBe('overdue')
    }
  })

  it('handles zero annualEstimate — all amounts are 0', () => {
    const sched = generateQuarterlySchedule(2025, 0, TODAY)
    for (const q of sched) {
      expect(q.amount).toBe(0)
    }
  })
})
