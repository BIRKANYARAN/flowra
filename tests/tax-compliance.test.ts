/**
 * tax-compliance.test.ts
 *
 * Unit tests for all pure functions in lib/services/tax/tax-compliance.service.ts
 *
 * Run with: npx vitest run tests/tax-compliance.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKdvNetObligation,
  computeCorporateTaxProvision,
  computeGeciVergi,
  computeComplianceScore,
  classifyComplianceStatus,
} from '../lib/services/tax/tax-compliance.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeKdvNetObligation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvNetObligation()', () => {
  it('positive result: output > input → returns difference', () => {
    expect(computeKdvNetObligation(10_000, 3_000)).toBe(7_000)
  })

  it('exactly zero: output = input → returns 0', () => {
    expect(computeKdvNetObligation(5_000, 5_000)).toBe(0)
  })

  it('negative result: input > output → returns 0 (KDV credit)', () => {
    expect(computeKdvNetObligation(2_000, 8_000)).toBe(0)
  })

  it('both zero → returns 0', () => {
    expect(computeKdvNetObligation(0, 0)).toBe(0)
  })

  it('large values compute correctly', () => {
    expect(computeKdvNetObligation(500_000, 120_000)).toBe(380_000)
  })

  it('zero output VAT, non-zero input → returns 0 (full credit situation)', () => {
    expect(computeKdvNetObligation(0, 10_000)).toBe(0)
  })

  it('non-zero output VAT, zero input → returns full output amount', () => {
    expect(computeKdvNetObligation(8_000, 0)).toBe(8_000)
  })

  it('very large values with positive difference', () => {
    expect(computeKdvNetObligation(10_000_000, 3_000_000)).toBe(7_000_000)
  })

  it('fractional amounts: 1000.50 - 500.25 = 500.25', () => {
    const result = computeKdvNetObligation(1_000.50, 500.25)
    expect(result).toBeCloseTo(500.25, 2)
  })

  it('returns a number (not NaN)', () => {
    const result = computeKdvNetObligation(100, 50)
    expect(typeof result).toBe('number')
    expect(isNaN(result)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeCorporateTaxProvision
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTaxProvision()', () => {
  it('positive net income → 20% provision', () => {
    expect(computeCorporateTaxProvision(100_000)).toBe(20_000)
  })

  it('zero net income → 0', () => {
    expect(computeCorporateTaxProvision(0)).toBe(0)
  })

  it('negative net income → 0 (no tax on losses)', () => {
    expect(computeCorporateTaxProvision(-50_000)).toBe(0)
  })

  it('small positive net income → 20%', () => {
    expect(computeCorporateTaxProvision(1_000)).toBeCloseTo(200, 5)
  })

  it('large positive income computes correctly', () => {
    expect(computeCorporateTaxProvision(1_000_000)).toBe(200_000)
  })

  it('exactly 1 TRY net income → 0.20 provision', () => {
    expect(computeCorporateTaxProvision(1)).toBeCloseTo(0.20, 5)
  })

  it('very large net income → 20% provision', () => {
    expect(computeCorporateTaxProvision(10_000_000)).toBe(2_000_000)
  })

  it('fractional net income → fractional provision', () => {
    const result = computeCorporateTaxProvision(333.33)
    expect(result).toBeCloseTo(66.666, 2)
  })

  it('result is always non-negative', () => {
    const negativeResult = computeCorporateTaxProvision(-999_999)
    expect(negativeResult).toBe(0)
    const positiveResult = computeCorporateTaxProvision(999_999)
    expect(positiveResult).toBeGreaterThanOrEqual(0)
  })

  it('rate is exactly 20% — verify with multiple values', () => {
    const incomes = [50_000, 200_000, 750_000, 1_500_000]
    for (const income of incomes) {
      expect(computeCorporateTaxProvision(income)).toBeCloseTo(income * 0.20, 5)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. computeGeciVergi
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGeciVergi()', () => {
  const ytd = 400_000 // net income YTD

  it('Q1 → 25% fraction × 20% tax → 20,000', () => {
    // 400_000 × 0.20 × 0.25 = 20_000
    expect(computeGeciVergi(ytd, 1, 0)).toBe(20_000)
  })

  it('Q2 → 50% fraction × 20% tax → 40,000', () => {
    // 400_000 × 0.20 × 0.50 = 40_000
    expect(computeGeciVergi(ytd, 2, 0)).toBe(40_000)
  })

  it('Q3 → 75% fraction × 20% tax → 60,000', () => {
    // 400_000 × 0.20 × 0.75 = 60_000
    expect(computeGeciVergi(ytd, 3, 0)).toBe(60_000)
  })

  it('Q4 → 100% fraction × 20% tax → 80,000', () => {
    // 400_000 × 0.20 × 1.00 = 80_000
    expect(computeGeciVergi(ytd, 4, 0)).toBe(80_000)
  })

  it('prior payments deducted from cumulative amount', () => {
    // Q2 cumulative = 40_000, paid 20_000 in Q1 → remaining = 20_000
    expect(computeGeciVergi(ytd, 2, 20_000)).toBe(20_000)
  })

  it('prior payments exceed cumulative → returns 0 (no negative tax)', () => {
    // Q1 cumulative = 20_000, paid 30_000 → 0
    expect(computeGeciVergi(ytd, 1, 30_000)).toBe(0)
  })

  it('zero net income → 0 for all quarters', () => {
    expect(computeGeciVergi(0, 1, 0)).toBe(0)
    expect(computeGeciVergi(0, 4, 0)).toBe(0)
  })

  it('negative net income → 0', () => {
    expect(computeGeciVergi(-100_000, 2, 0)).toBe(0)
  })

  it('Q4 with large prior payments → floored at 0', () => {
    // Q4 cumulative = 400_000 × 0.20 × 1.00 = 80_000
    // prior payments = 80_000 → result = 0
    expect(computeGeciVergi(ytd, 4, 80_000)).toBe(0)
  })

  it('Q4 with prior payments less than cumulative → returns remainder', () => {
    // Q4 cumulative = 80_000, paid 60_000 → remaining = 20_000
    expect(computeGeciVergi(ytd, 4, 60_000)).toBe(20_000)
  })

  it('small net income Q2 with zero prior payments', () => {
    // 1000 × 0.20 × 0.50 = 100
    expect(computeGeciVergi(1_000, 2, 0)).toBe(100)
  })

  it('negative prior payments (data error) treated as reducing nothing — still floors at 0', () => {
    // If somehow priorPayments is negative, the formula may add to cumulative,
    // but the result should remain non-negative
    const result = computeGeciVergi(100_000, 1, -10_000)
    expect(result).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeComplianceScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeComplianceScore()', () => {
  it('empty array → 100 (no obligations = perfect compliance)', () => {
    expect(computeComplianceScore([])).toBe(100)
  })

  it('all on_time → 100', () => {
    expect(computeComplianceScore([
      { status: 'on_time', amount_try: 10_000 },
      { status: 'on_time', amount_try: 5_000 },
    ])).toBe(100)
  })

  it('all overdue → 0', () => {
    expect(computeComplianceScore([
      { status: 'overdue', amount_try: 10_000 },
      { status: 'overdue', amount_try: 5_000 },
    ])).toBe(0)
  })

  it('upcoming_7d → 80', () => {
    expect(computeComplianceScore([
      { status: 'upcoming_7d', amount_try: 0 },
    ])).toBe(80)
  })

  it('upcoming_30d → 60', () => {
    expect(computeComplianceScore([
      { status: 'upcoming_30d', amount_try: 0 },
    ])).toBe(60)
  })

  it('not_due obligations are excluded from score calculation', () => {
    // Only overdue obligation should affect score; not_due is ignored
    const score = computeComplianceScore([
      { status: 'overdue', amount_try: 10_000 },
      { status: 'not_due', amount_try: 100_000 },
    ])
    // Only the overdue one counts → score = 0
    expect(score).toBe(0)
  })

  it('weighted: larger overdue drags score down more than smaller on_time', () => {
    // on_time=100pts × 1000, overdue=0pts × 9000
    // weighted = (100 × 1000 + 0 × 9000) / 10000 = 10
    const score = computeComplianceScore([
      { status: 'on_time', amount_try: 1_000 },
      { status: 'overdue', amount_try: 9_000 },
    ])
    expect(score).toBe(10)
  })

  it('equal-weight (all amounts 0) averages scores', () => {
    // on_time=100, upcoming_30d=60 → avg = 80
    const score = computeComplianceScore([
      { status: 'on_time',      amount_try: 0 },
      { status: 'upcoming_30d', amount_try: 0 },
    ])
    expect(score).toBe(80)
  })

  it('only not_due obligations → 100 (all excluded, no relevant obligations)', () => {
    const score = computeComplianceScore([
      { status: 'not_due', amount_try: 50_000 },
      { status: 'not_due', amount_try: 30_000 },
    ])
    expect(score).toBe(100)
  })

  it('mix of on_time and upcoming_7d with equal amounts → 90', () => {
    // on_time=100, upcoming_7d=80 → equal weight avg = 90
    const score = computeComplianceScore([
      { status: 'on_time',     amount_try: 0 },
      { status: 'upcoming_7d', amount_try: 0 },
    ])
    expect(score).toBe(90)
  })

  it('score is always between 0 and 100 inclusive', () => {
    const cases = [
      [{ status: 'overdue' as const, amount_try: 100_000 }],
      [{ status: 'on_time' as const, amount_try: 100_000 }],
      [{ status: 'upcoming_7d' as const, amount_try: 50_000 }],
    ]
    for (const obligations of cases) {
      const score = computeComplianceScore(obligations)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })

  it('result is always an integer (Math.round applied)', () => {
    const score = computeComplianceScore([
      { status: 'on_time', amount_try: 3 },
      { status: 'overdue', amount_try: 7 },
    ])
    expect(Number.isInteger(score)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. classifyComplianceStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyComplianceStatus()', () => {
  it('score 100 → compliant', () => {
    expect(classifyComplianceStatus(100)).toBe('compliant')
  })

  it('score 80 → compliant (boundary)', () => {
    expect(classifyComplianceStatus(80)).toBe('compliant')
  })

  it('score 79 → attention (just below compliant boundary)', () => {
    expect(classifyComplianceStatus(79)).toBe('attention')
  })

  it('score 60 → attention (boundary)', () => {
    expect(classifyComplianceStatus(60)).toBe('attention')
  })

  it('score 59 → risk (just below attention boundary)', () => {
    expect(classifyComplianceStatus(59)).toBe('risk')
  })

  it('score 40 → risk (boundary)', () => {
    expect(classifyComplianceStatus(40)).toBe('risk')
  })

  it('score 39 → critical (just below risk boundary)', () => {
    expect(classifyComplianceStatus(39)).toBe('critical')
  })

  it('score 0 → critical', () => {
    expect(classifyComplianceStatus(0)).toBe('critical')
  })

  it('score 90 → compliant', () => {
    expect(classifyComplianceStatus(90)).toBe('compliant')
  })

  it('score 70 → attention (mid-range)', () => {
    expect(classifyComplianceStatus(70)).toBe('attention')
  })

  it('score 50 → risk (mid-range)', () => {
    expect(classifyComplianceStatus(50)).toBe('risk')
  })

  it('score 20 → critical (deep critical zone)', () => {
    expect(classifyComplianceStatus(20)).toBe('critical')
  })

  it('always returns one of the four valid statuses', () => {
    const validStatuses = ['compliant', 'attention', 'risk', 'critical']
    const scores = [0, 10, 39, 40, 59, 60, 79, 80, 100]
    for (const score of scores) {
      expect(validStatuses).toContain(classifyComplianceStatus(score))
    }
  })
})
