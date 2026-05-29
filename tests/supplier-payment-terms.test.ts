/**
 * Supplier Payment Terms Analysis — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 *
 * Target: 90+ tests covering all exported functions.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAvgPaymentDays,
  computeOnTimePaymentRate,
  computeEarlyPaymentDiscount,
  computeAnnualizedDiscountReturn,
  classifyDiscountAttractiveness,
  computePaymentStretch,
  classifyPaymentBehavior,
  computeSupplierConcentration,
  computeTotalDiscountOpportunity,
  computePaymentOptimizationScore,
  classifyPaymentTermsHealth,
  generatePaymentTermsNarrative,
  type PaymentTermsProfile,
  type DiscountOpportunity,
} from '../lib/services/commercial/supplier-payment-terms.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProfile(
  overrides: Partial<PaymentTermsProfile> = {},
): PaymentTermsProfile {
  return {
    vendor_name: 'Acme Ltd',
    total_spend_try: 10_000,
    avg_payment_days: 30,
    agreed_terms_days: 30,
    early_payment_discount_pct: 2,
    on_time_payment_rate: 1,
    late_payment_count: 0,
    total_transactions: 10,
    ...overrides,
  }
}

function makeOpportunity(
  overrides: Partial<DiscountOpportunity> = {},
): DiscountOpportunity {
  return {
    vendor_name: 'Acme Ltd',
    outstanding_amount: 10_000,
    discount_pct: 2,
    discount_amount: 200,
    days_to_capture: 10,
    annualized_return_pct: 73,
    should_capture: true,
    ...overrides,
  }
}

// ── computeAvgPaymentDays ─────────────────────────────────────────────────────

describe('computeAvgPaymentDays', () => {

  it('1. empty array → null', () => {
    expect(computeAvgPaymentDays([])).toBeNull()
  })

  it('2. all unpaid (payment_date null) → null', () => {
    expect(computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: null },
      { invoice_date: '2024-02-01', payment_date: null },
    ])).toBeNull()
  })

  it('3. single paid item — same day → 0', () => {
    expect(computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: '2024-01-01' },
    ])).toBe(0)
  })

  it('4. single paid item — 10 days → 10', () => {
    expect(computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: '2024-01-11' },
    ])).toBe(10)
  })

  it('5. two paid items — avg of 10 and 20 → 15', () => {
    expect(computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: '2024-01-11' }, // 10 days
      { invoice_date: '2024-01-01', payment_date: '2024-01-21' }, // 20 days
    ])).toBe(15)
  })

  it('6. mixed paid and unpaid — averages only paid', () => {
    expect(computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: '2024-01-31' }, // 30 days
      { invoice_date: '2024-01-01', payment_date: null },
    ])).toBe(30)
  })

  it('7. three paid items — exact average', () => {
    const result = computeAvgPaymentDays([
      { invoice_date: '2024-01-01', payment_date: '2024-01-11' }, // 10
      { invoice_date: '2024-01-01', payment_date: '2024-01-21' }, // 20
      { invoice_date: '2024-01-01', payment_date: '2024-02-10' }, // 40
    ])
    expect(result).toBe(23.3)
  })

  it('8. payment before invoice → negative days', () => {
    const result = computeAvgPaymentDays([
      { invoice_date: '2024-01-10', payment_date: '2024-01-01' }, // -9 days
    ])
    expect(result).toBe(-9)
  })

  it('9. uses only the date portion of timestamps', () => {
    const result = computeAvgPaymentDays([
      { invoice_date: '2024-01-01T00:00:00Z', payment_date: '2024-01-16T23:59:59Z' },
    ])
    expect(result).toBe(15)
  })

})

// ── computeOnTimePaymentRate ──────────────────────────────────────────────────

describe('computeOnTimePaymentRate', () => {

  it('10. empty array → 0', () => {
    expect(computeOnTimePaymentRate([])).toBe(0)
  })

  it('11. all unpaid → 0', () => {
    expect(computeOnTimePaymentRate([
      { due_date: '2024-02-01', payment_date: null, invoice_date: '2024-01-01' },
      { due_date: '2024-02-15', payment_date: null, invoice_date: '2024-01-15' },
    ])).toBe(0)
  })

  it('12. all paid on time with explicit due_date → 1', () => {
    expect(computeOnTimePaymentRate([
      { due_date: '2024-01-31', payment_date: '2024-01-15', invoice_date: '2024-01-01' },
      { due_date: '2024-02-28', payment_date: '2024-02-20', invoice_date: '2024-02-01' },
    ])).toBe(1)
  })

  it('13. all paid late with explicit due_date → 0', () => {
    expect(computeOnTimePaymentRate([
      { due_date: '2024-01-15', payment_date: '2024-01-31', invoice_date: '2024-01-01' },
    ])).toBe(0)
  })

  it('14. paid exactly on due_date → on time', () => {
    expect(computeOnTimePaymentRate([
      { due_date: '2024-01-31', payment_date: '2024-01-31', invoice_date: '2024-01-01' },
    ])).toBe(1)
  })

  it('15. no due_date — paid within 30 days → on time', () => {
    expect(computeOnTimePaymentRate([
      { due_date: null, payment_date: '2024-01-31', invoice_date: '2024-01-01' },
    ])).toBe(1)
  })

  it('16. no due_date — paid exactly on day 30 → on time', () => {
    expect(computeOnTimePaymentRate([
      { due_date: null, payment_date: '2024-01-31', invoice_date: '2024-01-01' },
    ])).toBe(1)
  })

  it('17. no due_date — paid on day 31 → late', () => {
    expect(computeOnTimePaymentRate([
      { due_date: null, payment_date: '2024-02-01', invoice_date: '2024-01-01' },
    ])).toBe(0)
  })

  it('18. mixed: 2 on time, 1 late → 2/3', () => {
    const rate = computeOnTimePaymentRate([
      { due_date: '2024-01-31', payment_date: '2024-01-15', invoice_date: '2024-01-01' },
      { due_date: '2024-01-31', payment_date: '2024-01-20', invoice_date: '2024-01-01' },
      { due_date: '2024-01-15', payment_date: '2024-01-31', invoice_date: '2024-01-01' },
    ])
    expect(rate).toBeCloseTo(2 / 3, 5)
  })

  it('19. unpaid items count in denominator reducing rate', () => {
    const rate = computeOnTimePaymentRate([
      { due_date: '2024-01-31', payment_date: '2024-01-15', invoice_date: '2024-01-01' },
      { due_date: '2024-01-31', payment_date: null, invoice_date: '2024-01-01' },
    ])
    expect(rate).toBe(0.5)
  })

  it('20. all 5 paid on time → 1', () => {
    const payments = Array.from({ length: 5 }, () => ({
      due_date: '2024-02-28',
      payment_date: '2024-02-15',
      invoice_date: '2024-01-15',
    }))
    expect(computeOnTimePaymentRate(payments)).toBe(1)
  })

})

// ── computeEarlyPaymentDiscount ───────────────────────────────────────────────

describe('computeEarlyPaymentDiscount', () => {

  it('21. basic 2% on 10,000 → 200', () => {
    expect(computeEarlyPaymentDiscount(10_000, 2)).toBe(200)
  })

  it('22. 0 outstanding → 0', () => {
    expect(computeEarlyPaymentDiscount(0, 2)).toBe(0)
  })

  it('23. 0 discount pct → 0', () => {
    expect(computeEarlyPaymentDiscount(10_000, 0)).toBe(0)
  })

  it('24. 100% discount → full amount', () => {
    expect(computeEarlyPaymentDiscount(5_000, 100)).toBe(5_000)
  })

  it('25. fractional pct — 1.5% on 20,000 → 300', () => {
    expect(computeEarlyPaymentDiscount(20_000, 1.5)).toBe(300)
  })

  it('26. large amount — 2% on 1,000,000 → 20,000', () => {
    expect(computeEarlyPaymentDiscount(1_000_000, 2)).toBe(20_000)
  })

  it('27. 3% on 3,333 → approx 99.99', () => {
    expect(computeEarlyPaymentDiscount(3_333, 3)).toBeCloseTo(99.99, 1)
  })

})

// ── computeAnnualizedDiscountReturn ──────────────────────────────────────────

describe('computeAnnualizedDiscountReturn', () => {

  it('28. daysToCapture <= 0 (zero) → null', () => {
    expect(computeAnnualizedDiscountReturn(2, 0)).toBeNull()
  })

  it('29. daysToCapture < 0 → null', () => {
    expect(computeAnnualizedDiscountReturn(2, -5)).toBeNull()
  })

  it('30. 2% over 10 days → 73', () => {
    // (0.02 / 10) × 365 × 100 = 73
    expect(computeAnnualizedDiscountReturn(2, 10)).toBe(73)
  })

  it('31. 2% over 365 days → 2', () => {
    expect(computeAnnualizedDiscountReturn(2, 365)).toBeCloseTo(2, 5)
  })

  it('32. 1% over 30 days → approx 12.17', () => {
    expect(computeAnnualizedDiscountReturn(1, 30)).toBeCloseTo(12.166, 1)
  })

  it('33. 3% over 15 days → 73', () => {
    // (0.03 / 15) × 365 × 100 = 73
    expect(computeAnnualizedDiscountReturn(3, 15)).toBe(73)
  })

  it('34. single day — 2% over 1 day → very high return', () => {
    const result = computeAnnualizedDiscountReturn(2, 1)
    expect(result).toBeCloseTo(730, 0)
  })

})

// ── classifyDiscountAttractiveness ───────────────────────────────────────────

describe('classifyDiscountAttractiveness', () => {

  it('35. annualized null → false', () => {
    expect(classifyDiscountAttractiveness(null, 20)).toBe(false)
  })

  it('36. annualized exactly equals costOfCapital → false (not strictly greater)', () => {
    expect(classifyDiscountAttractiveness(20, 20)).toBe(false)
  })

  it('37. annualized > costOfCapital → true', () => {
    expect(classifyDiscountAttractiveness(73, 20)).toBe(true)
  })

  it('38. annualized below costOfCapital → false', () => {
    expect(classifyDiscountAttractiveness(10, 20)).toBe(false)
  })

  it('39. costOfCapital = 0, annualized > 0 → true', () => {
    expect(classifyDiscountAttractiveness(0.1, 0)).toBe(true)
  })

  it('40. annualized = 0, costOfCapital = 0 → false (not strictly greater)', () => {
    expect(classifyDiscountAttractiveness(0, 0)).toBe(false)
  })

  it('41. custom high cost of capital 50 — annualized 73 → true', () => {
    expect(classifyDiscountAttractiveness(73, 50)).toBe(true)
  })

  it('42. custom high cost of capital 80 — annualized 73 → false', () => {
    expect(classifyDiscountAttractiveness(73, 80)).toBe(false)
  })

})

// ── computePaymentStretch ─────────────────────────────────────────────────────

describe('computePaymentStretch', () => {

  it('43. both null → null', () => {
    expect(computePaymentStretch(null, null)).toBeNull()
  })

  it('44. actual null → null', () => {
    expect(computePaymentStretch(null, 30)).toBeNull()
  })

  it('45. agreed null → null', () => {
    expect(computePaymentStretch(30, null)).toBeNull()
  })

  it('46. same values → 0', () => {
    expect(computePaymentStretch(30, 30)).toBe(0)
  })

  it('47. actual > agreed → positive (paying late)', () => {
    expect(computePaymentStretch(45, 30)).toBe(15)
  })

  it('48. actual < agreed → negative (paying early)', () => {
    expect(computePaymentStretch(20, 30)).toBe(-10)
  })

  it('49. zero actual, non-zero agreed → negative', () => {
    expect(computePaymentStretch(0, 30)).toBe(-30)
  })

  it('50. large values — 90 vs 60 → 30', () => {
    expect(computePaymentStretch(90, 60)).toBe(30)
  })

})

// ── classifyPaymentBehavior ───────────────────────────────────────────────────

describe('classifyPaymentBehavior', () => {

  it('51. excellent: onTime 0.95, stretch null → excellent', () => {
    expect(classifyPaymentBehavior(0.95, null)).toBe('excellent')
  })

  it('52. excellent: onTime 1.0, stretch -5 → excellent', () => {
    expect(classifyPaymentBehavior(1.0, -5)).toBe('excellent')
  })

  it('53. excellent: onTime 0.95, stretch 0 → excellent', () => {
    expect(classifyPaymentBehavior(0.95, 0)).toBe('excellent')
  })

  it('54. NOT excellent: onTime 0.95, stretch 1 → good', () => {
    expect(classifyPaymentBehavior(0.95, 1)).toBe('good')
  })

  it('55. good: onTime 0.80, stretch null → good', () => {
    expect(classifyPaymentBehavior(0.80, null)).toBe('good')
  })

  it('56. good: onTime 0.90, stretch 10 → good', () => {
    expect(classifyPaymentBehavior(0.90, 10)).toBe('good')
  })

  it('57. fair: onTime 0.60 → fair', () => {
    expect(classifyPaymentBehavior(0.60, 5)).toBe('fair')
  })

  it('58. fair: onTime 0.75, stretch 20 → fair', () => {
    expect(classifyPaymentBehavior(0.75, 20)).toBe('fair')
  })

  it('59. poor: onTime 0.50 → poor', () => {
    expect(classifyPaymentBehavior(0.50, null)).toBe('poor')
  })

  it('60. poor: onTime 0.0 → poor', () => {
    expect(classifyPaymentBehavior(0.0, 60)).toBe('poor')
  })

  it('61. boundary: onTime exactly 0.80 → good not fair', () => {
    expect(classifyPaymentBehavior(0.80, 20)).toBe('good')
  })

  it('62. boundary: onTime exactly 0.60 → fair not poor', () => {
    expect(classifyPaymentBehavior(0.60, 40)).toBe('fair')
  })

})

// ── computeSupplierConcentration ──────────────────────────────────────────────

describe('computeSupplierConcentration', () => {

  it('63. empty array → 0 / 0', () => {
    const result = computeSupplierConcentration([])
    expect(result.top_vendor_pct).toBe(0)
    expect(result.hhi).toBe(0)
  })

  it('64. single vendor → 100% concentration, HHI = 1', () => {
    const result = computeSupplierConcentration([makeProfile({ total_spend_try: 10_000 })])
    expect(result.top_vendor_pct).toBe(100)
    expect(result.hhi).toBe(1)
  })

  it('65. two equal vendors → 50% top, HHI = 0.5', () => {
    const result = computeSupplierConcentration([
      makeProfile({ vendor_name: 'A', total_spend_try: 5_000 }),
      makeProfile({ vendor_name: 'B', total_spend_try: 5_000 }),
    ])
    expect(result.top_vendor_pct).toBe(50)
    expect(result.hhi).toBeCloseTo(0.5, 5)
  })

  it('66. unequal vendors — 80/20 split', () => {
    const result = computeSupplierConcentration([
      makeProfile({ vendor_name: 'A', total_spend_try: 8_000 }),
      makeProfile({ vendor_name: 'B', total_spend_try: 2_000 }),
    ])
    expect(result.top_vendor_pct).toBe(80)
    expect(result.hhi).toBeCloseTo(0.8 * 0.8 + 0.2 * 0.2, 5)
  })

  it('67. four equal vendors → 25% top, HHI = 0.25', () => {
    const profiles = ['A', 'B', 'C', 'D'].map(n =>
      makeProfile({ vendor_name: n, total_spend_try: 2_500 })
    )
    const result = computeSupplierConcentration(profiles)
    expect(result.top_vendor_pct).toBe(25)
    expect(result.hhi).toBeCloseTo(0.25, 5)
  })

  it('68. all zero spend → top_vendor_pct=0, hhi=0', () => {
    const profiles = ['A', 'B'].map(n => makeProfile({ vendor_name: n, total_spend_try: 0 }))
    const result = computeSupplierConcentration(profiles)
    expect(result.top_vendor_pct).toBe(0)
    expect(result.hhi).toBe(0)
  })

  it('69. HHI sums shares squared correctly for 3 vendors', () => {
    const profiles = [
      makeProfile({ vendor_name: 'A', total_spend_try: 6_000 }), // 0.6
      makeProfile({ vendor_name: 'B', total_spend_try: 3_000 }), // 0.3
      makeProfile({ vendor_name: 'C', total_spend_try: 1_000 }), // 0.1
    ]
    const result = computeSupplierConcentration(profiles)
    expect(result.hhi).toBeCloseTo(0.36 + 0.09 + 0.01, 5)
  })

})

// ── computeTotalDiscountOpportunity ──────────────────────────────────────────

describe('computeTotalDiscountOpportunity', () => {

  it('70. empty array → all zeros', () => {
    const result = computeTotalDiscountOpportunity([])
    expect(result.total_discount_available).toBe(0)
    expect(result.total_capturable).toBe(0)
    expect(result.capturable_count).toBe(0)
  })

  it('71. single capturable → totals equal discount_amount', () => {
    const opp = makeOpportunity({ discount_amount: 200, should_capture: true })
    const result = computeTotalDiscountOpportunity([opp])
    expect(result.total_discount_available).toBe(200)
    expect(result.total_capturable).toBe(200)
    expect(result.capturable_count).toBe(1)
  })

  it('72. single NOT capturable → total_capturable = 0', () => {
    const opp = makeOpportunity({ discount_amount: 200, should_capture: false })
    const result = computeTotalDiscountOpportunity([opp])
    expect(result.total_discount_available).toBe(200)
    expect(result.total_capturable).toBe(0)
    expect(result.capturable_count).toBe(0)
  })

  it('73. mixed — 2 capturable, 1 not', () => {
    const opps = [
      makeOpportunity({ vendor_name: 'A', discount_amount: 100, should_capture: true }),
      makeOpportunity({ vendor_name: 'B', discount_amount: 200, should_capture: false }),
      makeOpportunity({ vendor_name: 'C', discount_amount: 300, should_capture: true }),
    ]
    const result = computeTotalDiscountOpportunity(opps)
    expect(result.total_discount_available).toBe(600)
    expect(result.total_capturable).toBe(400)
    expect(result.capturable_count).toBe(2)
  })

  it('74. all capturable — sum correct', () => {
    const opps = [100, 200, 300, 400].map((d, i) =>
      makeOpportunity({ vendor_name: String(i), discount_amount: d, should_capture: true })
    )
    const result = computeTotalDiscountOpportunity(opps)
    expect(result.total_discount_available).toBe(1000)
    expect(result.total_capturable).toBe(1000)
    expect(result.capturable_count).toBe(4)
  })

  it('75. none capturable → capturable totals = 0', () => {
    const opps = [100, 200].map((d, i) =>
      makeOpportunity({ vendor_name: String(i), discount_amount: d, should_capture: false })
    )
    const result = computeTotalDiscountOpportunity(opps)
    expect(result.total_capturable).toBe(0)
    expect(result.capturable_count).toBe(0)
  })

})

// ── computePaymentOptimizationScore ──────────────────────────────────────────

describe('computePaymentOptimizationScore', () => {

  it('76. max score: onTime>=0.95, negative stretch, 80%+ capturable → 50+30+20=100', () => {
    expect(computePaymentOptimizationScore(-5, 0.96, 80)).toBe(100)
  })

  it('77. onTime=0.95 (50pts), stretch null (15pts), opp=0 (10pts) → 75', () => {
    expect(computePaymentOptimizationScore(null, 0.95, 0)).toBe(75)
  })

  it('78. onTime=0.80 → 40pts', () => {
    const score = computePaymentOptimizationScore(null, 0.80, 0)
    expect(score).toBe(40 + 15 + 10)
  })

  it('79. onTime=0.60 → 25pts', () => {
    const score = computePaymentOptimizationScore(null, 0.60, 0)
    expect(score).toBe(25 + 15 + 10)
  })

  it('80. onTime=0.30 → 10pts', () => {
    const score = computePaymentOptimizationScore(null, 0.30, 0)
    expect(score).toBe(10 + 15 + 10)
  })

  it('81. stretch = 0-5 → 25 stretch pts', () => {
    const score = computePaymentOptimizationScore(3, 0.95, 0)
    expect(score).toBe(50 + 25 + 10)
  })

  it('82. stretch = 5-15 → 15 stretch pts', () => {
    const score = computePaymentOptimizationScore(10, 0.95, 0)
    expect(score).toBe(50 + 15 + 10)
  })

  it('83. stretch > 15 → 5 stretch pts', () => {
    const score = computePaymentOptimizationScore(20, 0.95, 0)
    expect(score).toBe(50 + 5 + 10)
  })

  it('84. capturable 50-79% → 15 opp pts', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 60)
    expect(score).toBe(50 + 15 + 15)
  })

  it('85. capturable 20-49% → 10 opp pts', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 25)
    expect(score).toBe(50 + 15 + 10)
  })

  it('86. capturable < 20% → 5 opp pts', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 10)
    expect(score).toBe(50 + 15 + 5)
  })

  it('87. capturable >= 80% → 20 opp pts', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 90)
    expect(score).toBe(50 + 15 + 20)
  })

  it('88. stretch exactly 5 → bucket 0-5 (25 pts)', () => {
    const score = computePaymentOptimizationScore(5, 0.95, 0)
    expect(score).toBe(50 + 25 + 10)
  })

  it('89. stretch exactly 15 → bucket 5-15 (15 pts)', () => {
    const score = computePaymentOptimizationScore(15, 0.95, 0)
    expect(score).toBe(50 + 15 + 10)
  })

  it('90. capturable exactly 50 → 15 pts (>= 50 bucket)', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 50)
    expect(score).toBe(50 + 15 + 15)
  })

  it('91. capturable exactly 20 → 10 pts (>= 20 bucket)', () => {
    const score = computePaymentOptimizationScore(null, 0.95, 20)
    expect(score).toBe(50 + 15 + 10)
  })

  it('92. min-ish score: onTime=0.2, stretch=30, opp=5 → 10+5+5=20', () => {
    expect(computePaymentOptimizationScore(30, 0.2, 5)).toBe(20)
  })

})

// ── classifyPaymentTermsHealth ────────────────────────────────────────────────

describe('classifyPaymentTermsHealth', () => {

  it('93. score 80 → excellent', () => {
    expect(classifyPaymentTermsHealth(80)).toBe('excellent')
  })

  it('94. score 100 → excellent', () => {
    expect(classifyPaymentTermsHealth(100)).toBe('excellent')
  })

  it('95. score 60 → good', () => {
    expect(classifyPaymentTermsHealth(60)).toBe('good')
  })

  it('96. score 79 → good', () => {
    expect(classifyPaymentTermsHealth(79)).toBe('good')
  })

  it('97. score 40 → fair', () => {
    expect(classifyPaymentTermsHealth(40)).toBe('fair')
  })

  it('98. score 59 → fair', () => {
    expect(classifyPaymentTermsHealth(59)).toBe('fair')
  })

  it('99. score 39 → poor', () => {
    expect(classifyPaymentTermsHealth(39)).toBe('poor')
  })

  it('100. score 0 → poor', () => {
    expect(classifyPaymentTermsHealth(0)).toBe('poor')
  })

})

// ── generatePaymentTermsNarrative ─────────────────────────────────────────────

describe('generatePaymentTermsNarrative', () => {

  it('101. excellent health → Turkish excellent string', () => {
    const result = generatePaymentTermsNarrative('excellent', 1000, 0.97, 5)
    expect(result).toContain('mükemmel')
    expect(result).toContain('iskonto')
  })

  it('102. good health → mentions iskonto fırsatı', () => {
    const result = generatePaymentTermsNarrative('good', 500, 0.85, 3)
    expect(result).toContain('iskonto fırsatı')
  })

  it('103. good health → includes discount amount', () => {
    const result = generatePaymentTermsNarrative('good', 1_234, 0.85, 3)
    expect(result).toContain('1.234')
  })

  it('104. fair health → mentions iyileştirilebilir', () => {
    const result = generatePaymentTermsNarrative('fair', 0, 0.70, 2)
    expect(result).toContain('iyileştirilebilir')
  })

  it('105. fair health → mentions tedarikçi', () => {
    const result = generatePaymentTermsNarrative('fair', 0, 0.70, 2)
    expect(result).toContain('tedarikçi')
  })

  it('106. poor health → mentions kritik', () => {
    const result = generatePaymentTermsNarrative('poor', 0, 0.30, 1)
    expect(result).toContain('kritik')
  })

  it('107. poor health → mentions risk', () => {
    const result = generatePaymentTermsNarrative('poor', 0, 0.30, 1)
    expect(result).toContain('risk')
  })

  it('108. excellent returns non-empty string', () => {
    expect(generatePaymentTermsNarrative('excellent', 0, 1, 1).length).toBeGreaterThan(10)
  })

  it('109. all 4 levels return distinct messages', () => {
    const messages = (['excellent', 'good', 'fair', 'poor'] as const).map(h =>
      generatePaymentTermsNarrative(h, 1000, 0.9, 3)
    )
    const unique = new Set(messages)
    expect(unique.size).toBe(4)
  })

  it('110. good with zero discount → still includes fırsatı in message', () => {
    const result = generatePaymentTermsNarrative('good', 0, 0.82, 4)
    expect(result).toContain('fırsatı')
  })

})
