/**
 * Payables Management Service — unit tests
 *
 * Tests all pure helpers:
 *   - computeDaysUntilDue
 *   - computeDaysOutstanding
 *   - computeOutstandingAmount
 *   - classifyPayableStatus
 *   - computeDpo
 *   - classifyDpoHealth
 *   - buildPayableAgingBuckets
 *   - computePaymentUrgencyScore
 *   - optimizePaymentSchedule
 *   - computeCashRequiredNextDays
 *   - classifyPayablesHealth
 *   - generatePayablesNarrative
 *   - buildVendorProfiles / computeVendorProfile
 *
 * No DB or network calls — all in-memory.
 * Target: 100+ tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDaysUntilDue,
  computeDaysOutstanding,
  computeOutstandingAmount,
  classifyPayableStatus,
  computeDpo,
  classifyDpoHealth,
  buildPayableAgingBuckets,
  computePaymentUrgencyScore,
  optimizePaymentSchedule,
  computeCashRequiredNextDays,
  classifyPayablesHealth,
  generatePayablesNarrative,
  buildVendorProfiles,
  computeVendorProfile,
} from '../lib/services/finance/payables-management.service'
import type { PayableItem } from '../lib/services/finance/payables-management.service'

// ── Test helpers ──────────────────────────────────────────────────────────────

function makePayable(overrides: Partial<PayableItem> = {}): PayableItem {
  return {
    id:               'p-1',
    source:           'expense',
    vendor_name:      'Test Tedarikçi',
    category:         'rent',
    amount_try:       1000,
    amount_paid_try:  0,
    outstanding_try:  1000,
    due_date:         '2026-06-15',
    created_date:     '2026-05-01',
    payment_status:   'unpaid',
    days_until_due:   17,
    days_outstanding: 28,
    ...overrides,
  }
}

// ── computeDaysUntilDue ───────────────────────────────────────────────────────

describe('computeDaysUntilDue', () => {
  it('1. returns null when dueDateStr is null', () => {
    expect(computeDaysUntilDue(null, '2026-05-29')).toBeNull()
  })

  it('2. returns 0 when due_date equals asOfDate', () => {
    expect(computeDaysUntilDue('2026-05-29', '2026-05-29')).toBe(0)
  })

  it('3. returns positive number for future due date', () => {
    expect(computeDaysUntilDue('2026-06-08', '2026-05-29')).toBe(10)
  })

  it('4. returns negative number for overdue (past due date)', () => {
    expect(computeDaysUntilDue('2026-05-19', '2026-05-29')).toBe(-10)
  })

  it('5. returns 1 for due tomorrow', () => {
    expect(computeDaysUntilDue('2026-05-30', '2026-05-29')).toBe(1)
  })

  it('6. returns -1 for due yesterday', () => {
    expect(computeDaysUntilDue('2026-05-28', '2026-05-29')).toBe(-1)
  })

  it('7. correctly handles 30 days until due', () => {
    expect(computeDaysUntilDue('2026-06-28', '2026-05-29')).toBe(30)
  })

  it('8. correctly handles 90 days overdue', () => {
    expect(computeDaysUntilDue('2026-02-28', '2026-05-29')).toBe(-90)
  })

  it('9. handles cross-year dates', () => {
    expect(computeDaysUntilDue('2027-01-01', '2026-12-31')).toBe(1)
  })
})

// ── computeDaysOutstanding ────────────────────────────────────────────────────

describe('computeDaysOutstanding', () => {
  it('10. returns 0 when same day', () => {
    expect(computeDaysOutstanding('2026-05-29', '2026-05-29')).toBe(0)
  })

  it('11. returns positive for asOfDate after createdDate', () => {
    expect(computeDaysOutstanding('2026-05-01', '2026-05-29')).toBe(28)
  })

  it('12. returns 0 (clamped) if asOfDate is before createdDate', () => {
    // Future-dated creation: clamp to 0
    expect(computeDaysOutstanding('2026-06-01', '2026-05-29')).toBe(0)
  })

  it('13. returns 1 for one day old', () => {
    expect(computeDaysOutstanding('2026-05-28', '2026-05-29')).toBe(1)
  })

  it('14. returns 30 for one month old', () => {
    expect(computeDaysOutstanding('2026-04-29', '2026-05-29')).toBe(30)
  })

  it('15. handles 365 days', () => {
    expect(computeDaysOutstanding('2025-05-29', '2026-05-29')).toBe(365)
  })
})

// ── computeOutstandingAmount ──────────────────────────────────────────────────

describe('computeOutstandingAmount', () => {
  it('16. full amount when no payment made', () => {
    expect(computeOutstandingAmount(1000, 0)).toBe(1000)
  })

  it('17. partial payment reduces outstanding', () => {
    expect(computeOutstandingAmount(1000, 400)).toBe(600)
  })

  it('18. fully paid returns 0', () => {
    expect(computeOutstandingAmount(1000, 1000)).toBe(0)
  })

  it('19. overpaid clamps to 0 (no negative)', () => {
    expect(computeOutstandingAmount(1000, 1200)).toBe(0)
  })

  it('20. zero amount returns 0', () => {
    expect(computeOutstandingAmount(0, 0)).toBe(0)
  })

  it('21. decimal precision', () => {
    expect(computeOutstandingAmount(100.50, 50.25)).toBeCloseTo(50.25)
  })
})

// ── classifyPayableStatus ─────────────────────────────────────────────────────

describe('classifyPayableStatus', () => {
  it('22. paid when outstandingAmount <= 0', () => {
    expect(classifyPayableStatus(5, 0, 'unpaid')).toBe('paid')
  })

  it('23. paid when outstandingAmount negative (overpayment)', () => {
    expect(classifyPayableStatus(5, -1, 'unpaid')).toBe('paid')
  })

  it('24. paid when originalStatus is "paid" regardless of outstanding', () => {
    expect(classifyPayableStatus(5, 500, 'paid')).toBe('paid')
  })

  it('25. no_due_date when daysUntilDue is null and outstanding > 0', () => {
    expect(classifyPayableStatus(null, 500, 'unpaid')).toBe('no_due_date')
  })

  it('26. overdue when daysUntilDue is negative', () => {
    expect(classifyPayableStatus(-1, 500, 'unpaid')).toBe('overdue')
  })

  it('27. overdue when daysUntilDue is -30', () => {
    expect(classifyPayableStatus(-30, 500, 'unpaid')).toBe('overdue')
  })

  it('28. due_soon when daysUntilDue is 0', () => {
    expect(classifyPayableStatus(0, 500, 'unpaid')).toBe('due_soon')
  })

  it('29. due_soon when daysUntilDue is 7', () => {
    expect(classifyPayableStatus(7, 500, 'unpaid')).toBe('due_soon')
  })

  it('30. due_soon at exactly 14 days', () => {
    expect(classifyPayableStatus(14, 500, 'unpaid')).toBe('due_soon')
  })

  it('31. current when daysUntilDue is 15', () => {
    expect(classifyPayableStatus(15, 500, 'unpaid')).toBe('current')
  })

  it('32. current when daysUntilDue is 60', () => {
    expect(classifyPayableStatus(60, 500, 'unpaid')).toBe('current')
  })

  it('33. paid takes priority over overdue (outstanding 0 with negative days)', () => {
    expect(classifyPayableStatus(-5, 0, 'overdue')).toBe('paid')
  })
})

// ── computeDpo ───────────────────────────────────────────────────────────────

describe('computeDpo', () => {
  it('34. returns null when avgDailyPurchases is 0', () => {
    expect(computeDpo(5000, 0)).toBeNull()
  })

  it('35. returns correct DPO for simple values', () => {
    // 3000 / 100 = 30
    expect(computeDpo(3000, 100)).toBe(30)
  })

  it('36. returns 0 when totalPayables is 0', () => {
    expect(computeDpo(0, 100)).toBe(0)
  })

  it('37. returns fractional DPO rounded to 2 decimals', () => {
    // 1000 / 30 ≈ 33.33
    expect(computeDpo(1000, 30)).toBe(33.33)
  })

  it('38. large payables result in high DPO', () => {
    // 12000 / 100 = 120
    expect(computeDpo(12000, 100)).toBe(120)
  })

  it('39. very small avgDailyPurchases gives very high DPO', () => {
    expect(computeDpo(1000, 1)).toBe(1000)
  })
})

// ── classifyDpoHealth ─────────────────────────────────────────────────────────

describe('classifyDpoHealth', () => {
  it('40. null returns insufficient_data', () => {
    expect(classifyDpoHealth(null)).toBe('insufficient_data')
  })

  it('41. 0 days is critical (< 7)', () => {
    expect(classifyDpoHealth(0)).toBe('critical')
  })

  it('42. 6 days is critical (< 7)', () => {
    expect(classifyDpoHealth(6)).toBe('critical')
  })

  it('43. exactly 7 days is adequate', () => {
    expect(classifyDpoHealth(7)).toBe('adequate')
  })

  it('44. 10 days is adequate (7-15)', () => {
    expect(classifyDpoHealth(10)).toBe('adequate')
  })

  it('45. exactly 15 days is good', () => {
    expect(classifyDpoHealth(15)).toBe('good')
  })

  it('46. 20 days is good (15-30)', () => {
    expect(classifyDpoHealth(20)).toBe('good')
  })

  it('47. exactly 30 days is excellent', () => {
    expect(classifyDpoHealth(30)).toBe('excellent')
  })

  it('48. 45 days is excellent (30-60 inclusive)', () => {
    expect(classifyDpoHealth(45)).toBe('excellent')
  })

  it('49. exactly 60 days is excellent', () => {
    expect(classifyDpoHealth(60)).toBe('excellent')
  })

  it('50. 75 days is good (60-90)', () => {
    expect(classifyDpoHealth(75)).toBe('good')
  })

  it('51. exactly 90 days is good', () => {
    expect(classifyDpoHealth(90)).toBe('good')
  })

  it('52. 100 days is adequate (90-120)', () => {
    expect(classifyDpoHealth(100)).toBe('adequate')
  })

  it('53. exactly 120 days is adequate', () => {
    expect(classifyDpoHealth(120)).toBe('adequate')
  })

  it('54. 121 days is slow (> 120)', () => {
    expect(classifyDpoHealth(121)).toBe('slow')
  })

  it('55. 200 days is slow', () => {
    expect(classifyDpoHealth(200)).toBe('slow')
  })
})

// ── buildPayableAgingBuckets ──────────────────────────────────────────────────

describe('buildPayableAgingBuckets', () => {
  it('56. empty list returns 5 buckets all zero', () => {
    const buckets = buildPayableAgingBuckets([])
    expect(buckets).toHaveLength(5)
    expect(buckets.every(b => b.count === 0 && b.total_outstanding === 0)).toBe(true)
  })

  it('57. not-yet-due item goes into bucket 0 (Vadesi Gelmemiş)', () => {
    const p = makePayable({ days_until_due: 10, outstanding_try: 500 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[0].count).toBe(1)
    expect(buckets[0].total_outstanding).toBe(500)
    expect(buckets[1].count).toBe(0)
  })

  it('58. null due_date goes into bucket 0 (not yet due)', () => {
    const p = makePayable({ days_until_due: null, outstanding_try: 300 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[0].count).toBe(1)
  })

  it('59. 1 day overdue goes into bucket 1 (0-30 days)', () => {
    const p = makePayable({ days_until_due: -1, outstanding_try: 400 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[1].count).toBe(1)
    expect(buckets[1].total_outstanding).toBe(400)
  })

  it('60. 30 days overdue is in bucket 1 (0-30)', () => {
    const p = makePayable({ days_until_due: -30, outstanding_try: 200 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[1].count).toBe(1)
  })

  it('61. 31 days overdue goes into bucket 2 (31-60 days)', () => {
    const p = makePayable({ days_until_due: -31, outstanding_try: 600 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[2].count).toBe(1)
    expect(buckets[2].total_outstanding).toBe(600)
  })

  it('62. 60 days overdue is in bucket 2 (31-60)', () => {
    const p = makePayable({ days_until_due: -60, outstanding_try: 100 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[2].count).toBe(1)
  })

  it('63. 61 days overdue goes into bucket 3 (61-90 days)', () => {
    const p = makePayable({ days_until_due: -61, outstanding_try: 700 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[3].count).toBe(1)
    expect(buckets[3].total_outstanding).toBe(700)
  })

  it('64. 91 days overdue goes into bucket 4 (90+ days)', () => {
    const p = makePayable({ days_until_due: -91, outstanding_try: 900 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets[4].count).toBe(1)
    expect(buckets[4].total_outstanding).toBe(900)
  })

  it('65. pct_of_total sums to ~100% when all items accounted', () => {
    const payables = [
      makePayable({ id: 'a', days_until_due: 10,  outstanding_try: 200 }),
      makePayable({ id: 'b', days_until_due: -10, outstanding_try: 300 }),
      makePayable({ id: 'c', days_until_due: -50, outstanding_try: 500 }),
    ]
    const buckets = buildPayableAgingBuckets(payables)
    const totalPct = buckets.reduce((s, b) => s + b.pct_of_total, 0)
    expect(totalPct).toBeCloseTo(100, 1)
  })

  it('66. pct_of_total is 0 when total outstanding is 0', () => {
    const buckets = buildPayableAgingBuckets([])
    expect(buckets.every(b => b.pct_of_total === 0)).toBe(true)
  })

  it('67. items with outstanding_try <= 0 are excluded from buckets', () => {
    const p = makePayable({ days_until_due: -10, outstanding_try: 0 })
    const buckets = buildPayableAgingBuckets([p])
    expect(buckets.every(b => b.count === 0)).toBe(true)
  })

  it('68. multiple items in same bucket aggregate correctly', () => {
    const payables = [
      makePayable({ id: 'a', days_until_due: -5, outstanding_try: 300 }),
      makePayable({ id: 'b', days_until_due: -15, outstanding_try: 700 }),
    ]
    const buckets = buildPayableAgingBuckets(payables)
    expect(buckets[1].count).toBe(2)
    expect(buckets[1].total_outstanding).toBe(1000)
  })

  it('69. bucket labels are in Turkish', () => {
    const buckets = buildPayableAgingBuckets([])
    expect(buckets[0].label).toBe('Vadesi Gelmemiş')
    expect(buckets[4].label).toBe('90+ Gün Gecikmiş')
  })
})

// ── computePaymentUrgencyScore ────────────────────────────────────────────────

describe('computePaymentUrgencyScore', () => {
  it('70. paid item returns 0', () => {
    const p = makePayable({ payment_status: 'paid', outstanding_try: 0 })
    expect(computePaymentUrgencyScore(p)).toBe(0)
  })

  it('71. no_due_date item returns 20', () => {
    const p = makePayable({ days_until_due: null, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(20)
  })

  it('72. current item (>14 days) returns 40', () => {
    const p = makePayable({ days_until_due: 30, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(40)
  })

  it('73. due_soon (14 days) returns 60', () => {
    const p = makePayable({ days_until_due: 14, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(60)
  })

  it('74. due_soon (8-14 days) returns 60', () => {
    const p = makePayable({ days_until_due: 8, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(60)
  })

  it('75. due_soon (7 days exactly) returns 70', () => {
    const p = makePayable({ days_until_due: 7, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(70)
  })

  it('76. due_soon (1 day) returns 70', () => {
    const p = makePayable({ days_until_due: 1, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(70)
  })

  it('77. due_soon (0 days) returns 70', () => {
    const p = makePayable({ days_until_due: 0, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(70)
  })

  it('78. overdue 1 day returns 90 (90 + 1/3 ≈ 90)', () => {
    const p = makePayable({ days_until_due: -1, outstanding_try: 500, payment_status: 'unpaid' })
    const score = computePaymentUrgencyScore(p)
    expect(score).toBeGreaterThanOrEqual(90)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('79. overdue 30 days returns 100 (capped)', () => {
    // 90 + min(10, 30/3) = 90 + 10 = 100
    const p = makePayable({ days_until_due: -30, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(100)
  })

  it('80. overdue 100 days returns 100 (capped)', () => {
    const p = makePayable({ days_until_due: -100, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBe(100)
  })

  it('81. score never exceeds 100', () => {
    const p = makePayable({ days_until_due: -999, outstanding_try: 500, payment_status: 'unpaid' })
    expect(computePaymentUrgencyScore(p)).toBeLessThanOrEqual(100)
  })
})

// ── optimizePaymentSchedule ───────────────────────────────────────────────────

describe('optimizePaymentSchedule', () => {
  it('82. empty payables returns zero totals', () => {
    const result = optimizePaymentSchedule([], 10000)
    expect(result.total_to_pay).toBe(0)
    expect(result.cash_remaining).toBe(10000)
    expect(result.coverage_pct).toBe(0)
  })

  it('83. selects payable when cash is sufficient', () => {
    const p = makePayable({ id: 'a', outstanding_try: 500, days_until_due: -5, payment_status: 'unpaid' })
    const result = optimizePaymentSchedule([p], 1000)
    expect(result.prioritized[0].selected).toBe(true)
    expect(result.total_to_pay).toBe(500)
    expect(result.cash_remaining).toBe(500)
  })

  it('84. skips non-overdue payable when cash is insufficient (no exception)', () => {
    // current item (not overdue, not the single-overdue exception)
    const p = makePayable({ id: 'a', outstanding_try: 1500, days_until_due: 10, payment_status: 'unpaid' })
    const result = optimizePaymentSchedule([p], 1000)
    expect(result.prioritized[0].selected).toBe(false)
    expect(result.total_to_pay).toBe(0)
  })

  it('85. sorts by urgency score (overdue before current)', () => {
    const current = makePayable({ id: 'c', outstanding_try: 200, days_until_due: 30, payment_status: 'unpaid' })
    const overdue = makePayable({ id: 'o', outstanding_try: 200, days_until_due: -5, payment_status: 'unpaid' })
    const result = optimizePaymentSchedule([current, overdue], 10000)
    expect(result.prioritized[0].id).toBe('o') // overdue first
    expect(result.prioritized[1].id).toBe('c')
  })

  it('86. selects multiple items greedily until cash exhausted', () => {
    const items = [
      makePayable({ id: 'a', outstanding_try: 300, days_until_due: -5, payment_status: 'unpaid' }),
      makePayable({ id: 'b', outstanding_try: 300, days_until_due: -3, payment_status: 'unpaid' }),
      makePayable({ id: 'c', outstanding_try: 300, days_until_due: 10, payment_status: 'unpaid' }),
    ]
    const result = optimizePaymentSchedule(items, 600)
    const selected = result.prioritized.filter(p => p.selected)
    expect(selected).toHaveLength(2)
    expect(result.total_to_pay).toBe(600)
    expect(result.cash_remaining).toBe(0)
  })

  it('87. coverage_pct is 100 when all items covered', () => {
    const p = makePayable({ id: 'a', outstanding_try: 500 })
    const result = optimizePaymentSchedule([p], 1000)
    expect(result.coverage_pct).toBe(100)
  })

  it('88. coverage_pct is 0 when no items covered', () => {
    const p = makePayable({ id: 'a', outstanding_try: 5000 })
    const result = optimizePaymentSchedule([p], 100)
    expect(result.coverage_pct).toBe(0)
  })

  it('89. paid items (outstanding 0) are not selected', () => {
    const p = makePayable({ id: 'a', outstanding_try: 0, payment_status: 'paid' })
    const result = optimizePaymentSchedule([p], 1000)
    expect(result.total_to_pay).toBe(0)
  })

  it('90. coverage_pct calculation is correct', () => {
    const items = [
      makePayable({ id: 'a', outstanding_try: 400, days_until_due: -5, payment_status: 'unpaid' }),
      makePayable({ id: 'b', outstanding_try: 600, days_until_due: 10, payment_status: 'unpaid' }),
    ]
    // Cash = 400 → can pay only item a
    const result = optimizePaymentSchedule(items, 400)
    expect(result.coverage_pct).toBe(40) // 400/1000 * 100
  })
})

// ── computeCashRequiredNextDays ───────────────────────────────────────────────

describe('computeCashRequiredNextDays', () => {
  it('91. empty list returns 0', () => {
    expect(computeCashRequiredNextDays([], 7)).toBe(0)
  })

  it('92. includes item due in exactly N days', () => {
    const p = makePayable({ days_until_due: 7, outstanding_try: 500 })
    expect(computeCashRequiredNextDays([p], 7)).toBe(500)
  })

  it('93. excludes item due in N+1 days', () => {
    const p = makePayable({ days_until_due: 8, outstanding_try: 500 })
    expect(computeCashRequiredNextDays([p], 7)).toBe(0)
  })

  it('94. includes item due today (days_until_due = 0)', () => {
    const p = makePayable({ days_until_due: 0, outstanding_try: 300 })
    expect(computeCashRequiredNextDays([p], 30)).toBe(300)
  })

  it('95. excludes overdue items (days_until_due < 0)', () => {
    const p = makePayable({ days_until_due: -5, outstanding_try: 400 })
    expect(computeCashRequiredNextDays([p], 7)).toBe(0)
  })

  it('96. excludes items with null days_until_due', () => {
    const p = makePayable({ days_until_due: null, outstanding_try: 200 })
    expect(computeCashRequiredNextDays([p], 30)).toBe(0)
  })

  it('97. sums multiple qualifying items', () => {
    const items = [
      makePayable({ id: 'a', days_until_due: 3,  outstanding_try: 100 }),
      makePayable({ id: 'b', days_until_due: 7,  outstanding_try: 200 }),
      makePayable({ id: 'c', days_until_due: 15, outstanding_try: 300 }), // excluded for 7-day
    ]
    expect(computeCashRequiredNextDays(items, 7)).toBe(300)
  })

  it('98. rounds to 2 decimal places', () => {
    const p = makePayable({ days_until_due: 5, outstanding_try: 100.555 })
    const result = computeCashRequiredNextDays([p], 7)
    expect(result.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })
})

// ── classifyPayablesHealth ────────────────────────────────────────────────────

describe('classifyPayablesHealth', () => {
  it('99. healthy when all metrics are good', () => {
    expect(classifyPayablesHealth(0, 45, 2.0)).toBe('healthy')
  })

  it('100. critical when overduePct > 30', () => {
    expect(classifyPayablesHealth(31, 45, 2.0)).toBe('critical')
  })

  it('101. critical when cashCoverageRatio < 0.5', () => {
    expect(classifyPayablesHealth(0, 45, 0.4)).toBe('critical')
  })

  it('102. critical overrides other conditions', () => {
    expect(classifyPayablesHealth(40, 200, 0.1)).toBe('critical')
  })

  it('103. concern when overduePct > 15', () => {
    expect(classifyPayablesHealth(16, 45, 2.0)).toBe('concern')
  })

  it('104. concern when cashCoverageRatio < 1.0', () => {
    expect(classifyPayablesHealth(0, 45, 0.8)).toBe('concern')
  })

  it('105. watch when overduePct > 5', () => {
    expect(classifyPayablesHealth(6, 45, 2.0)).toBe('watch')
  })

  it('106. watch when dpo > 120', () => {
    expect(classifyPayablesHealth(0, 130, 2.0)).toBe('watch')
  })

  it('107. watch when dpo is 121', () => {
    expect(classifyPayablesHealth(0, 121, 2.0)).toBe('watch')
  })

  it('108. healthy when dpo is exactly 120', () => {
    expect(classifyPayablesHealth(0, 120, 2.0)).toBe('healthy')
  })

  it('109. healthy even when dpo is null', () => {
    expect(classifyPayablesHealth(0, null, 2.0)).toBe('healthy')
  })

  it('110. exactly at concern threshold (overduePct = 15) is watch not concern', () => {
    // concern requires > 15, so exactly 15 → watch check
    expect(classifyPayablesHealth(15, 45, 2.0)).toBe('watch')
  })

  it('111. exactly at critical threshold (overduePct = 30) is concern not critical', () => {
    // critical requires > 30, so exactly 30 → concern
    expect(classifyPayablesHealth(30, 45, 2.0)).toBe('concern')
  })
})

// ── generatePayablesNarrative ─────────────────────────────────────────────────

describe('generatePayablesNarrative', () => {
  it('112. healthy returns Turkish "sağlıklı" message', () => {
    const msg = generatePayablesNarrative('healthy', 0, 45, 10000)
    expect(msg).toContain('sağlıklı')
  })

  it('113. watch returns Turkish "izlenmeli" message', () => {
    const msg = generatePayablesNarrative('watch', 1000, 130, 10000)
    expect(msg).toContain('izlenmeli')
  })

  it('114. concern returns message with overdue amount', () => {
    const msg = generatePayablesNarrative('concern', 5000, 45, 20000)
    expect(msg).toContain('tedarikçi')
    expect(msg).toContain('5')
  })

  it('115. critical returns "Kritik" Turkish message', () => {
    const msg = generatePayablesNarrative('critical', 50000, 150, 100000)
    expect(msg).toContain('Kritik')
  })

  it('116. healthy message mentions no overdue', () => {
    const msg = generatePayablesNarrative('healthy', 0, 45, 5000)
    expect(msg).toContain('vadesi geçmiş ödeme bulunmuyor')
  })

  it('117. concern message contains ₺ symbol', () => {
    const msg = generatePayablesNarrative('concern', 3000, 45, 10000)
    expect(msg).toContain('₺')
  })

  it('118. critical message mentions "acil"', () => {
    const msg = generatePayablesNarrative('critical', 80000, 200, 100000)
    expect(msg).toContain('acil')
  })

  it('119. watch message is non-empty', () => {
    const msg = generatePayablesNarrative('watch', 500, 110, 5000)
    expect(msg.length).toBeGreaterThan(0)
  })
})

// ── buildVendorProfiles ───────────────────────────────────────────────────────

describe('buildVendorProfiles', () => {
  const today = '2026-05-29'

  it('120. empty list returns empty array', () => {
    expect(buildVendorProfiles([], today)).toHaveLength(0)
  })

  it('121. single vendor creates one profile', () => {
    const p = makePayable({ vendor_name: 'Acme Ltd', outstanding_try: 1000 })
    const profiles = buildVendorProfiles([p], today)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].vendor_name).toBe('Acme Ltd')
  })

  it('122. null vendor_name is grouped as "Bilinmeyen Tedarikçi"', () => {
    const p = makePayable({ vendor_name: null, outstanding_try: 500 })
    const profiles = buildVendorProfiles([p], today)
    expect(profiles[0].vendor_name).toBe('Bilinmeyen Tedarikçi')
  })

  it('123. multiple payables for same vendor are aggregated', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'Acme Ltd', outstanding_try: 600 }),
      makePayable({ id: 'b', vendor_name: 'Acme Ltd', outstanding_try: 400 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].total_outstanding).toBe(1000)
    expect(profiles[0].payable_count).toBe(2)
  })

  it('124. different vendors create separate profiles', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'Vendor A', outstanding_try: 800 }),
      makePayable({ id: 'b', vendor_name: 'Vendor B', outstanding_try: 200 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles).toHaveLength(2)
  })

  it('125. profiles sorted by total_outstanding DESC', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'Small',  outstanding_try: 100 }),
      makePayable({ id: 'b', vendor_name: 'Large',  outstanding_try: 900 }),
      makePayable({ id: 'c', vendor_name: 'Medium', outstanding_try: 500 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles[0].vendor_name).toBe('Large')
    expect(profiles[1].vendor_name).toBe('Medium')
    expect(profiles[2].vendor_name).toBe('Small')
  })

  it('126. overdue_amount counts only overdue items', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'V', days_until_due: -10, outstanding_try: 300 }),
      makePayable({ id: 'b', vendor_name: 'V', days_until_due: 10,  outstanding_try: 700 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles[0].overdue_amount).toBe(300)
  })

  it('127. upcoming_amount counts only items due in next 30 days', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'V', days_until_due: 15, outstanding_try: 400 }),
      makePayable({ id: 'b', vendor_name: 'V', days_until_due: 45, outstanding_try: 600 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles[0].upcoming_amount).toBe(400)
  })

  it('128. oldest_payable_days is the maximum days_outstanding', () => {
    const items = [
      makePayable({ id: 'a', vendor_name: 'V', days_outstanding: 10 }),
      makePayable({ id: 'b', vendor_name: 'V', days_outstanding: 45 }),
      makePayable({ id: 'c', vendor_name: 'V', days_outstanding: 30 }),
    ]
    const profiles = buildVendorProfiles(items, today)
    expect(profiles[0].oldest_payable_days).toBe(45)
  })

  it('129. avg_payment_terms is null when no due dates', () => {
    const p = makePayable({ vendor_name: 'V', due_date: null })
    const profiles = buildVendorProfiles([p], today)
    expect(profiles[0].avg_payment_terms).toBeNull()
  })

  it('130. avg_payment_terms computed from creation to due_date', () => {
    const p = makePayable({
      vendor_name: 'V',
      due_date:    '2026-06-10',
      created_date: '2026-05-29',
    })
    const profiles = buildVendorProfiles([p], today)
    // 12 days from 2026-05-29 to 2026-06-10
    expect(profiles[0].avg_payment_terms).toBe(12)
  })
})

// ── computeVendorProfile edge cases ──────────────────────────────────────────

describe('computeVendorProfile', () => {
  const today = '2026-05-29'

  it('131. vendor with no matching payables returns zeros', () => {
    const profile = computeVendorProfile([], 'Unknown', today)
    expect(profile.total_outstanding).toBe(0)
    expect(profile.payable_count).toBe(0)
    expect(profile.overdue_amount).toBe(0)
    expect(profile.oldest_payable_days).toBe(0)
    expect(profile.avg_payment_terms).toBeNull()
  })

  it('132. vendor_name matches correctly', () => {
    const items = [
      makePayable({ vendor_name: 'Match', outstanding_try: 500 }),
      makePayable({ vendor_name: 'Other', outstanding_try: 300 }),
    ]
    const profile = computeVendorProfile(items, 'Match', today)
    expect(profile.total_outstanding).toBe(500)
    expect(profile.payable_count).toBe(1)
  })
})
