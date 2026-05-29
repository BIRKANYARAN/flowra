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

// ─────────────────────────────────────────────────────────────────────────────
// Additional boundary tests: computeKdvNetObligation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvNetObligation() — extra boundary tests', () => {
  it('both arguments are floating point; result is exact', () => {
    // 0.1 + 0.2 precision check
    expect(computeKdvNetObligation(0.3, 0.1)).toBeCloseTo(0.2, 5)
  })

  it('output fractionally greater than input → positive result', () => {
    expect(computeKdvNetObligation(1000.01, 1000.00)).toBeCloseTo(0.01, 2)
  })

  it('output fractionally less than input → returns 0 (not negative)', () => {
    expect(computeKdvNetObligation(999.99, 1000.00)).toBe(0)
  })

  it('extremely large values maintain positive result', () => {
    expect(computeKdvNetObligation(1e9, 1e8)).toBe(9e8)
  })

  it('returns 0 for output=0 and input=0', () => {
    expect(computeKdvNetObligation(0, 0)).toBe(0)
  })

  it('result type is always number', () => {
    expect(typeof computeKdvNetObligation(100, 50)).toBe('number')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional boundary tests: computeCorporateTaxProvision
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTaxProvision() — extra boundary tests', () => {
  it('returns 0 for exactly 0 net income', () => {
    expect(computeCorporateTaxProvision(0)).toBe(0)
  })

  it('returns 0 for net income of -1', () => {
    expect(computeCorporateTaxProvision(-1)).toBe(0)
  })

  it('returns 0 for net income of -1e9', () => {
    expect(computeCorporateTaxProvision(-1_000_000_000)).toBe(0)
  })

  it('20% rate is always applied for positive net income', () => {
    for (const income of [1, 100, 1000, 99999]) {
      expect(computeCorporateTaxProvision(income)).toBeCloseTo(income * 0.2, 4)
    }
  })

  it('result is non-negative for any input', () => {
    const inputs = [-1e6, -1, 0, 1, 1e6]
    for (const i of inputs) {
      expect(computeCorporateTaxProvision(i)).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional boundary tests: computeGeciVergi
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGeciVergi() — extra boundary tests', () => {
  it('returns 0 when cumulative exactly equals prior payments', () => {
    // 200_000 * 0.20 * 0.25 = 10_000; if paid 10_000 already → 0
    expect(computeGeciVergi(200_000, 1, 10_000)).toBe(0)
  })

  it('Q1 with very small income', () => {
    // 100 * 0.20 * 0.25 = 5
    expect(computeGeciVergi(100, 1, 0)).toBe(5)
  })

  it('Q4 with very large income', () => {
    // 10_000_000 * 0.20 * 1.00 = 2_000_000
    expect(computeGeciVergi(10_000_000, 4, 0)).toBe(2_000_000)
  })

  it('all quarters produce strictly increasing cumulative amounts', () => {
    const income = 1_000_000
    const q1 = computeGeciVergi(income, 1, 0)
    const q2 = computeGeciVergi(income, 2, 0)
    const q3 = computeGeciVergi(income, 3, 0)
    const q4 = computeGeciVergi(income, 4, 0)
    expect(q1).toBeLessThan(q2)
    expect(q2).toBeLessThan(q3)
    expect(q3).toBeLessThan(q4)
  })

  it('Q2 cumulative minus Q1 payment equals incremental Q2 obligation', () => {
    const income = 800_000
    const q1Pay = computeGeciVergi(income, 1, 0)          // = 800k * 0.20 * 0.25 = 40k
    const q2Due = computeGeciVergi(income, 2, q1Pay)      // = 800k * 0.20 * 0.50 - 40k = 40k
    expect(q2Due).toBeCloseTo(40_000, 0)
  })

  it('floor is always 0, never negative', () => {
    const results = [
      computeGeciVergi(100_000, 1, 1_000_000),
      computeGeciVergi(0, 2, 5_000),
      computeGeciVergi(-999_999, 4, 0),
    ]
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional boundary tests: computeComplianceScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeComplianceScore() — extra boundary tests', () => {
  it('single overdue obligation of 0 TRY → score 0', () => {
    expect(computeComplianceScore([{ status: 'overdue', amount_try: 0 }])).toBe(0)
  })

  it('large variety of obligations produces a score in [0, 100]', () => {
    const obligations = [
      { status: 'on_time' as const, amount_try: 10_000 },
      { status: 'overdue' as const, amount_try: 5_000 },
      { status: 'upcoming_7d' as const, amount_try: 2_000 },
      { status: 'upcoming_30d' as const, amount_try: 1_000 },
      { status: 'not_due' as const, amount_try: 50_000 },
    ]
    const score = computeComplianceScore(obligations)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('three equal-weight obligations at different statuses → weighted avg', () => {
    // on_time=100, upcoming_7d=80, overdue=0 → all zero amounts → equal weight → avg=60
    const score = computeComplianceScore([
      { status: 'on_time', amount_try: 0 },
      { status: 'upcoming_7d', amount_try: 0 },
      { status: 'overdue', amount_try: 0 },
    ])
    expect(score).toBe(60)
  })

  it('upcoming_7d with heavy weight drags score below 100', () => {
    const score = computeComplianceScore([
      { status: 'on_time', amount_try: 1 },
      { status: 'upcoming_7d', amount_try: 9_999 },
    ])
    // Weighted: (100*1 + 80*9999) / 10000 ≈ 80.02 → 80
    expect(score).toBeCloseTo(80, 0)
  })

  it('result is always integer', () => {
    const testCases = [
      [{ status: 'on_time' as const, amount_try: 7 }],
      [{ status: 'overdue' as const, amount_try: 3 }],
      [{ status: 'upcoming_30d' as const, amount_try: 11 }, { status: 'on_time' as const, amount_try: 7 }],
    ]
    for (const obs of testCases) {
      expect(Number.isInteger(computeComplianceScore(obs))).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional boundary tests: classifyComplianceStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyComplianceStatus() — extra boundary tests', () => {
  it('score 81 → compliant', () => {
    expect(classifyComplianceStatus(81)).toBe('compliant')
  })

  it('score 61 → attention', () => {
    expect(classifyComplianceStatus(61)).toBe('attention')
  })

  it('score 41 → risk', () => {
    expect(classifyComplianceStatus(41)).toBe('risk')
  })

  it('score 1 → critical', () => {
    expect(classifyComplianceStatus(1)).toBe('critical')
  })

  it('full sweep of boundary values returns correct status', () => {
    const expectations: [number, string][] = [
      [100, 'compliant'],
      [80,  'compliant'],
      [79,  'attention'],
      [60,  'attention'],
      [59,  'risk'],
      [40,  'risk'],
      [39,  'critical'],
      [0,   'critical'],
    ]
    for (const [score, expected] of expectations) {
      expect(classifyComplianceStatus(score)).toBe(expected)
    }
  })

  it('score decremented by 1 at each boundary flips the status', () => {
    expect(classifyComplianceStatus(80)).toBe('compliant')
    expect(classifyComplianceStatus(79)).toBe('attention')
    expect(classifyComplianceStatus(60)).toBe('attention')
    expect(classifyComplianceStatus(59)).toBe('risk')
    expect(classifyComplianceStatus(40)).toBe('risk')
    expect(classifyComplianceStatus(39)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. computeKdvNetObligation — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvNetObligation() — extended cases', () => {
  it('very large output and small input → correct difference', () => {
    expect(computeKdvNetObligation(1_000_000, 1)).toBe(999_999)
  })

  it('both zero → 0', () => {
    expect(computeKdvNetObligation(0, 0)).toBe(0)
  })

  it('output is 0, input is positive → 0 (never negative)', () => {
    expect(computeKdvNetObligation(0, 50_000)).toBe(0)
  })

  it('output by 1 more than input → returns 1', () => {
    expect(computeKdvNetObligation(10_001, 10_000)).toBe(1)
  })

  it('fractional values — output 1000.50, input 500.25 → 500.25', () => {
    expect(computeKdvNetObligation(1000.50, 500.25)).toBeCloseTo(500.25, 1)
  })

  it('input exceeds output by large margin → clamped to 0', () => {
    expect(computeKdvNetObligation(100, 99_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. computeCorporateTaxProvision — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCorporateTaxProvision() — extended cases', () => {
  it('net income of 1 → 0.20', () => {
    expect(computeCorporateTaxProvision(1)).toBeCloseTo(0.20, 5)
  })

  it('net income of 1_000_000 → 200_000', () => {
    expect(computeCorporateTaxProvision(1_000_000)).toBe(200_000)
  })

  it('net income of exactly 0 → returns 0 (floor at zero)', () => {
    expect(computeCorporateTaxProvision(0)).toBe(0)
  })

  it('negative net income of -1 → returns 0', () => {
    expect(computeCorporateTaxProvision(-1)).toBe(0)
  })

  it('very negative income → 0', () => {
    expect(computeCorporateTaxProvision(-9_999_999)).toBe(0)
  })

  it('fractional income → fraction of 0.20', () => {
    expect(computeCorporateTaxProvision(1_234.56)).toBeCloseTo(246.912, 2)
  })

  it('rate is exactly 20%', () => {
    // Verify the rate by checking 100 → 20
    expect(computeCorporateTaxProvision(100)).toBeCloseTo(20, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. computeGeciVergi — extended cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGeciVergi() — extended cases', () => {
  it('Q1: income=0, no prior → 0', () => {
    expect(computeGeciVergi(0, 1, 0)).toBe(0)
  })

  it('Q4 with equal prior payments → 0 (already fully paid)', () => {
    // YTD income 100k, Q4 fraction=1.0 → cumulative = 100k*0.20 = 20k
    // prior payments = 20k → result = 0
    expect(computeGeciVergi(100_000, 4, 20_000)).toBe(0)
  })

  it('Q4 with over-payment → 0 (floored, not negative)', () => {
    expect(computeGeciVergi(100_000, 4, 25_000)).toBe(0)
  })

  it('Q2 fraction is 0.50: income=200k → cumulative=20k, prior=5k → 15k', () => {
    // 200k * 0.20 * 0.50 = 20k; minus 5k = 15k
    expect(computeGeciVergi(200_000, 2, 5_000)).toBe(15_000)
  })

  it('Q3 fraction is 0.75: income=400k → cumulative=60k, prior=0 → 60k', () => {
    // 400k * 0.20 * 0.75 = 60k
    expect(computeGeciVergi(400_000, 3, 0)).toBe(60_000)
  })

  it('negative net income → cumulative ≤ 0 → always returns 0', () => {
    expect(computeGeciVergi(-500_000, 1, 0)).toBe(0)
  })

  it('zero income → all quarters return 0', () => {
    expect(computeGeciVergi(0, 1, 0)).toBe(0)
    expect(computeGeciVergi(0, 2, 0)).toBe(0)
    expect(computeGeciVergi(0, 3, 0)).toBe(0)
    expect(computeGeciVergi(0, 4, 0)).toBe(0)
  })

  it('Q1 cumulative = 25% × 20% = 5% of income', () => {
    // 1_000 * 0.20 * 0.25 = 50
    expect(computeGeciVergi(1_000, 1, 0)).toBeCloseTo(50, 5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. computeComplianceScore — extended weight-based edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeComplianceScore() — extended weight-based cases', () => {
  it('single on_time obligation → 100', () => {
    expect(computeComplianceScore([{ status: 'on_time', amount_try: 1_000 }])).toBe(100)
  })

  it('single overdue obligation → 0', () => {
    expect(computeComplianceScore([{ status: 'overdue', amount_try: 1_000 }])).toBe(0)
  })

  it('single upcoming_7d → 80', () => {
    expect(computeComplianceScore([{ status: 'upcoming_7d', amount_try: 1_000 }])).toBe(80)
  })

  it('single upcoming_30d → 60', () => {
    expect(computeComplianceScore([{ status: 'upcoming_30d', amount_try: 1_000 }])).toBe(60)
  })

  it('only not_due obligations → 100 (all filtered out)', () => {
    expect(computeComplianceScore([
      { status: 'not_due', amount_try: 500_000 },
      { status: 'not_due', amount_try: 200_000 },
    ])).toBe(100)
  })

  it('equal amounts: on_time + overdue → 50', () => {
    // weight equally: (100 + 0) / 2 = 50
    expect(computeComplianceScore([
      { status: 'on_time', amount_try: 5_000 },
      { status: 'overdue', amount_try: 5_000 },
    ])).toBe(50)
  })

  it('heavier on_time weight → score biased towards 100', () => {
    // on_time=90000, overdue=10000 → (100*90k + 0*10k)/100k = 90
    expect(computeComplianceScore([
      { status: 'on_time', amount_try: 90_000 },
      { status: 'overdue', amount_try: 10_000 },
    ])).toBe(90)
  })

  it('heavier overdue weight → score biased towards 0', () => {
    // on_time=10000, overdue=90000 → (100*10k + 0*90k)/100k = 10
    expect(computeComplianceScore([
      { status: 'on_time', amount_try: 10_000 },
      { status: 'overdue', amount_try: 90_000 },
    ])).toBe(10)
  })

  it('all zero amounts → equal-weight average used', () => {
    // 3 obligations: on_time, upcoming_7d, overdue → (100+80+0)/3 = 60
    expect(computeComplianceScore([
      { status: 'on_time',     amount_try: 0 },
      { status: 'upcoming_7d', amount_try: 0 },
      { status: 'overdue',     amount_try: 0 },
    ])).toBe(60)
  })

  it('mixing not_due with overdue: only overdue counted → 0', () => {
    expect(computeComplianceScore([
      { status: 'not_due', amount_try: 999_999 },
      { status: 'overdue', amount_try: 1 },
    ])).toBe(0)
  })

  it('not_due mixed with on_time: only on_time counted → 100', () => {
    expect(computeComplianceScore([
      { status: 'not_due', amount_try: 999_999 },
      { status: 'on_time', amount_try: 1 },
    ])).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. classifyComplianceStatus — monotonicity and all return values
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyComplianceStatus() — monotonicity checks', () => {
  it('99 → compliant', () => {
    expect(classifyComplianceStatus(99)).toBe('compliant')
  })

  it('80 → compliant (exact lower boundary)', () => {
    expect(classifyComplianceStatus(80)).toBe('compliant')
  })

  it('79 → attention (just below compliant)', () => {
    expect(classifyComplianceStatus(79)).toBe('attention')
  })

  it('60 → attention (exact lower boundary)', () => {
    expect(classifyComplianceStatus(60)).toBe('attention')
  })

  it('59 → risk (just below attention)', () => {
    expect(classifyComplianceStatus(59)).toBe('risk')
  })

  it('40 → risk (exact lower boundary)', () => {
    expect(classifyComplianceStatus(40)).toBe('risk')
  })

  it('39 → critical (just below risk)', () => {
    expect(classifyComplianceStatus(39)).toBe('critical')
  })

  it('1 → critical', () => {
    expect(classifyComplianceStatus(1)).toBe('critical')
  })

  it('0 → critical', () => {
    expect(classifyComplianceStatus(0)).toBe('critical')
  })

  it('classifyComplianceStatus returns one of 4 valid strings', () => {
    const valid = new Set(['compliant', 'attention', 'risk', 'critical'])
    for (const score of [0, 20, 39, 40, 59, 60, 79, 80, 100]) {
      expect(valid.has(classifyComplianceStatus(score))).toBe(true)
    }
  })
})
