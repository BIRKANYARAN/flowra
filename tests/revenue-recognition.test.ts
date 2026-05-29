/**
 * Revenue Recognition & Accrual Tracking — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 *
 * Target: 90+ tests covering all exported functions.
 */

import { describe, it, expect } from 'vitest'
import {
  computeEarnedRevenue,
  computeUnearnedRevenue,
  classifyRecognitionStatus,
  computeRecognitionGap,
  computeCumulativeReceivables,
  computeRevenueRecognitionRate,
  computeDeferredRevenueBalance,
  computeAccrualCashDelta,
  buildMonthlyRecognition,
  classifyRevenueQualityFromRecognition,
  computeAvgCollectionLag,
  generateRecognitionNarrative,
} from '../lib/services/finance/revenue-recognition.service'

// ── computeEarnedRevenue ──────────────────────────────────────────────────────

describe('computeEarnedRevenue', () => {

  it('1. accrual_basis: fully paid → returns total_try', () => {
    expect(computeEarnedRevenue(100_000, 100_000, 'accrual_basis')).toBe(100_000)
  })

  it('2. accrual_basis: partially paid → still returns total_try', () => {
    expect(computeEarnedRevenue(100_000, 40_000, 'accrual_basis')).toBe(100_000)
  })

  it('3. accrual_basis: unpaid (paid=0) → returns total_try', () => {
    expect(computeEarnedRevenue(50_000, 0, 'accrual_basis')).toBe(50_000)
  })

  it('4. accrual_basis: zero total → 0', () => {
    expect(computeEarnedRevenue(0, 0, 'accrual_basis')).toBe(0)
  })

  it('5. cash_basis: fully paid → returns paid_amount_try', () => {
    expect(computeEarnedRevenue(100_000, 100_000, 'cash_basis')).toBe(100_000)
  })

  it('6. cash_basis: partially paid → returns paid_amount_try only', () => {
    expect(computeEarnedRevenue(100_000, 60_000, 'cash_basis')).toBe(60_000)
  })

  it('7. cash_basis: unpaid → 0', () => {
    expect(computeEarnedRevenue(80_000, 0, 'cash_basis')).toBe(0)
  })

  it('8. cash_basis: overpaid → returns paid amount (over total)', () => {
    expect(computeEarnedRevenue(100_000, 120_000, 'cash_basis')).toBe(120_000)
  })

  it('9. accrual_basis: overpaid → still returns total_try only', () => {
    expect(computeEarnedRevenue(100_000, 120_000, 'accrual_basis')).toBe(100_000)
  })

})

// ── computeUnearnedRevenue ────────────────────────────────────────────────────

describe('computeUnearnedRevenue', () => {

  it('10. accrual_basis: any scenario → 0 (fully recognized)', () => {
    expect(computeUnearnedRevenue(100_000, 40_000, 'accrual_basis')).toBe(0)
  })

  it('11. accrual_basis: unpaid → still 0', () => {
    expect(computeUnearnedRevenue(100_000, 0, 'accrual_basis')).toBe(0)
  })

  it('12. accrual_basis: overpaid → 0', () => {
    expect(computeUnearnedRevenue(100_000, 120_000, 'accrual_basis')).toBe(0)
  })

  it('13. cash_basis: fully paid → 0', () => {
    expect(computeUnearnedRevenue(100_000, 100_000, 'cash_basis')).toBe(0)
  })

  it('14. cash_basis: unpaid → total_try unearned', () => {
    expect(computeUnearnedRevenue(80_000, 0, 'cash_basis')).toBe(80_000)
  })

  it('15. cash_basis: partially paid → total - paid', () => {
    expect(computeUnearnedRevenue(100_000, 30_000, 'cash_basis')).toBe(70_000)
  })

  it('16. cash_basis: overpaid (paid > total) → 0, not negative', () => {
    expect(computeUnearnedRevenue(100_000, 120_000, 'cash_basis')).toBe(0)
  })

  it('17. cash_basis: both zero → 0', () => {
    expect(computeUnearnedRevenue(0, 0, 'cash_basis')).toBe(0)
  })

})

// ── classifyRecognitionStatus ─────────────────────────────────────────────────

describe('classifyRecognitionStatus', () => {

  // fully_recognized
  it('18. accrual + fully paid → fully_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 100_000, 'accrual_basis')).toBe('fully_recognized')
  })

  it('19. accrual + unpaid → fully_recognized (accrual always fully recognized)', () => {
    expect(classifyRecognitionStatus(100_000, 0, 'accrual_basis')).toBe('fully_recognized')
  })

  it('20. accrual + partial → fully_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 50_000, 'accrual_basis')).toBe('fully_recognized')
  })

  it('21. cash + fully paid → fully_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 100_000, 'cash_basis')).toBe('fully_recognized')
  })

  it('22. cash + paid > total (by 1) → deferred (not fully_recognized)', () => {
    expect(classifyRecognitionStatus(100_000, 100_001, 'cash_basis')).toBe('deferred')
  })

  // partially_recognized
  it('23. cash + partial payment (50%) → partially_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 50_000, 'cash_basis')).toBe('partially_recognized')
  })

  it('24. cash + small partial payment → partially_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 1, 'cash_basis')).toBe('partially_recognized')
  })

  it('25. cash + 99% paid → partially_recognized', () => {
    expect(classifyRecognitionStatus(100_000, 99_999, 'cash_basis')).toBe('partially_recognized')
  })

  // unrecognized
  it('26. cash + unpaid (0) → unrecognized', () => {
    expect(classifyRecognitionStatus(100_000, 0, 'cash_basis')).toBe('unrecognized')
  })

  it('27. cash + zero total and zero paid → fully_recognized (0 >= 0, nothing owed)', () => {
    expect(classifyRecognitionStatus(0, 0, 'cash_basis')).toBe('fully_recognized')
  })

  // deferred (overpayment)
  it('28. accrual + overpaid → deferred (takes priority)', () => {
    expect(classifyRecognitionStatus(100_000, 150_000, 'accrual_basis')).toBe('deferred')
  })

  it('29. cash + overpaid → deferred', () => {
    expect(classifyRecognitionStatus(50_000, 80_000, 'cash_basis')).toBe('deferred')
  })

  it('30. cash + large prepayment → deferred', () => {
    expect(classifyRecognitionStatus(1_000, 500_000, 'cash_basis')).toBe('deferred')
  })

})

// ── computeRecognitionGap ─────────────────────────────────────────────────────

describe('computeRecognitionGap', () => {

  it('31. accrual > cash → positive gap (outstanding AR)', () => {
    expect(computeRecognitionGap(100_000, 60_000)).toBe(40_000)
  })

  it('32. accrual < cash → negative gap (advance received)', () => {
    expect(computeRecognitionGap(60_000, 80_000)).toBe(-20_000)
  })

  it('33. equal → 0 gap', () => {
    expect(computeRecognitionGap(75_000, 75_000)).toBe(0)
  })

  it('34. both zero → 0', () => {
    expect(computeRecognitionGap(0, 0)).toBe(0)
  })

  it('35. large difference', () => {
    expect(computeRecognitionGap(1_000_000, 250_000)).toBe(750_000)
  })

})

// ── computeCumulativeReceivables ──────────────────────────────────────────────

describe('computeCumulativeReceivables', () => {

  it('36. basic running balance', () => {
    // Month 1: sales=100, cash=60 → AR=40
    // Month 2: sales=80, cash=80 → cumSales=180, cumCash=140 → AR=40
    // Month 3: sales=50, cash=100 → cumSales=230, cumCash=240 → AR=0 (floored)
    expect(computeCumulativeReceivables([100, 80, 50], [60, 80, 100])).toEqual([40, 40, 0])
  })

  it('37. floor at 0 — no negative AR', () => {
    expect(computeCumulativeReceivables([100], [200])).toEqual([0])
  })

  it('38. same length as input', () => {
    const result = computeCumulativeReceivables([1, 2, 3, 4, 5], [0, 1, 2, 3, 4])
    expect(result).toHaveLength(5)
  })

  it('39. all unpaid → AR grows each month', () => {
    const result = computeCumulativeReceivables([100, 100, 100], [0, 0, 0])
    expect(result).toEqual([100, 200, 300])
  })

  it('40. empty arrays → empty result', () => {
    expect(computeCumulativeReceivables([], [])).toEqual([])
  })

  it('41. single month fully collected → AR=0', () => {
    expect(computeCumulativeReceivables([500], [500])).toEqual([0])
  })

  it('42. single month partial → AR=remainder', () => {
    expect(computeCumulativeReceivables([500], [200])).toEqual([300])
  })

  it('43. AR stays at 0 after being cleared', () => {
    // Month 1: 100 sales, 60 cash → AR=40
    // Month 2: 0 sales, 40 cash → AR=0 (cleared)
    // Month 3: 0 sales, 0 cash → AR=0 (stays 0)
    expect(computeCumulativeReceivables([100, 0, 0], [60, 40, 0])).toEqual([40, 0, 0])
  })

  it('44. cash array shorter than sales → treat missing as 0', () => {
    const result = computeCumulativeReceivables([100, 100], [50])
    expect(result).toEqual([50, 150])
  })

})

// ── computeRevenueRecognitionRate ─────────────────────────────────────────────

describe('computeRevenueRecognitionRate', () => {

  it('45. 80k earned / 100k total → 80%', () => {
    expect(computeRevenueRecognitionRate(80_000, 100_000)).toBeCloseTo(80)
  })

  it('46. zero total → null (division guard)', () => {
    expect(computeRevenueRecognitionRate(0, 0)).toBeNull()
  })

  it('47. zero earned / non-zero total → 0%', () => {
    expect(computeRevenueRecognitionRate(0, 100_000)).toBeCloseTo(0)
  })

  it('48. fully earned → 100%', () => {
    expect(computeRevenueRecognitionRate(50_000, 50_000)).toBeCloseTo(100)
  })

  it('49. overpaid → rate > 100% (not capped)', () => {
    const result = computeRevenueRecognitionRate(120_000, 100_000)
    expect(result).toBeCloseTo(120)
  })

  it('50. non-zero earned / zero total → null', () => {
    expect(computeRevenueRecognitionRate(5_000, 0)).toBeNull()
  })

  it('51. partial: 1/3 → ~33.3%', () => {
    expect(computeRevenueRecognitionRate(33_333, 100_000)).toBeCloseTo(33.333, 1)
  })

})

// ── computeDeferredRevenueBalance ─────────────────────────────────────────────

describe('computeDeferredRevenueBalance', () => {

  it('52. single overpaid sale → balance = excess', () => {
    expect(computeDeferredRevenueBalance([{ total_try: 100_000, paid_amount_try: 120_000 }]))
      .toBe(20_000)
  })

  it('53. no over-payments → 0', () => {
    expect(computeDeferredRevenueBalance([
      { total_try: 100_000, paid_amount_try: 100_000 },
      { total_try: 50_000,  paid_amount_try: 30_000 },
    ])).toBe(0)
  })

  it('54. mix: only over-payments counted', () => {
    // sale1: 120 paid on 100 → 20 deferred
    // sale2: 80 paid on 100  → 0 (under-paid)
    // sale3: 150 paid on 100 → 50 deferred
    expect(computeDeferredRevenueBalance([
      { total_try: 100, paid_amount_try: 120 },
      { total_try: 100, paid_amount_try: 80  },
      { total_try: 100, paid_amount_try: 150 },
    ])).toBe(70)
  })

  it('55. empty array → 0', () => {
    expect(computeDeferredRevenueBalance([])).toBe(0)
  })

  it('56. exactly equal (paid = total) → 0', () => {
    expect(computeDeferredRevenueBalance([{ total_try: 50_000, paid_amount_try: 50_000 }])).toBe(0)
  })

  it('57. all overpaid → sum of excesses', () => {
    expect(computeDeferredRevenueBalance([
      { total_try: 100, paid_amount_try: 200 },
      { total_try: 100, paid_amount_try: 300 },
    ])).toBe(300)
  })

})

// ── computeAccrualCashDelta ───────────────────────────────────────────────────

describe('computeAccrualCashDelta', () => {

  it('58. basic delta calculation', () => {
    const result = computeAccrualCashDelta(600_000, 400_000, 6)
    expect(result.absolute_delta).toBe(200_000)
    expect(result.avg_monthly_delta).toBeCloseTo(200_000 / 6)
    expect(result.delta_ratio_pct).toBeCloseTo((200_000 / 600_000) * 100)
  })

  it('59. zero accrual → delta_ratio_pct = null', () => {
    const result = computeAccrualCashDelta(0, 0, 6)
    expect(result.delta_ratio_pct).toBeNull()
  })

  it('60. cash > accrual → negative delta', () => {
    const result = computeAccrualCashDelta(400_000, 500_000, 4)
    expect(result.absolute_delta).toBe(-100_000)
    expect(result.avg_monthly_delta).toBeCloseTo(-25_000)
  })

  it('61. single month period', () => {
    const result = computeAccrualCashDelta(100_000, 80_000, 1)
    expect(result.absolute_delta).toBe(20_000)
    expect(result.avg_monthly_delta).toBe(20_000)
  })

  it('62. equal accrual and cash → zero delta', () => {
    const result = computeAccrualCashDelta(200_000, 200_000, 3)
    expect(result.absolute_delta).toBe(0)
    expect(result.avg_monthly_delta).toBe(0)
    expect(result.delta_ratio_pct).toBeCloseTo(0)
  })

  it('63. zero periodMonths → avg = 0 (no division by zero)', () => {
    const result = computeAccrualCashDelta(100_000, 60_000, 0)
    expect(result.avg_monthly_delta).toBe(0)
  })

})

// ── buildMonthlyRecognition ───────────────────────────────────────────────────

describe('buildMonthlyRecognition', () => {

  it('64. basic 3-month build', () => {
    const salesByMonth = new Map([
      ['2025-01', { total_try: 100_000, paid_amount_try: 60_000 }],
      ['2025-02', { total_try: 80_000,  paid_amount_try: 80_000 }],
      ['2025-03', { total_try: 50_000,  paid_amount_try: 20_000 }],
    ])
    const paymentsByMonth = new Map([
      ['2025-01', 60_000],
      ['2025-02', 80_000],
      ['2025-03', 20_000],
    ])
    const months = ['2025-01', '2025-02', '2025-03']
    const result = buildMonthlyRecognition(salesByMonth, paymentsByMonth, months)

    expect(result).toHaveLength(3)
    expect(result[0].year_month).toBe('2025-01')
    expect(result[0].earned_revenue_accrual).toBe(100_000)
    expect(result[0].earned_revenue_cash).toBe(60_000)
    expect(result[0].cash_received).toBe(60_000)
    expect(result[0].recognition_gap).toBe(40_000)
  })

  it('65. missing month in salesByMonth → defaults to 0', () => {
    const salesByMonth = new Map([
      ['2025-01', { total_try: 100_000, paid_amount_try: 100_000 }],
    ])
    const paymentsByMonth = new Map<string, number>()
    const months = ['2025-01', '2025-02']
    const result = buildMonthlyRecognition(salesByMonth, paymentsByMonth, months)

    expect(result[1].earned_revenue_accrual).toBe(0)
    expect(result[1].earned_revenue_cash).toBe(0)
    expect(result[1].cash_received).toBe(0)
    expect(result[1].recognition_gap).toBe(0)
  })

  it('66. recognition_gap = accrual - cash for each month', () => {
    const salesByMonth = new Map([
      ['2025-06', { total_try: 200_000, paid_amount_try: 80_000 }],
    ])
    const paymentsByMonth = new Map([['2025-06', 80_000]])
    const result = buildMonthlyRecognition(salesByMonth, paymentsByMonth, ['2025-06'])

    expect(result[0].recognition_gap).toBe(120_000)
  })

  it('67. cumulative_receivables is computed correctly', () => {
    const salesByMonth = new Map([
      ['2025-01', { total_try: 100_000, paid_amount_try: 0 }],
      ['2025-02', { total_try: 100_000, paid_amount_try: 0 }],
    ])
    const paymentsByMonth = new Map([
      ['2025-01', 0],
      ['2025-02', 0],
    ])
    const result = buildMonthlyRecognition(salesByMonth, paymentsByMonth, ['2025-01', '2025-02'])

    expect(result[0].cumulative_receivables).toBe(100_000)
    expect(result[1].cumulative_receivables).toBe(200_000)
  })

  it('68. empty months → empty array', () => {
    const result = buildMonthlyRecognition(new Map(), new Map(), [])
    expect(result).toEqual([])
  })

  it('69. year_month matches input months exactly', () => {
    const months = ['2025-03', '2025-04', '2025-05']
    const result = buildMonthlyRecognition(new Map(), new Map(), months)
    expect(result.map(r => r.year_month)).toEqual(months)
  })

  it('70. paymentsByMonth different from paid_amount_try', () => {
    // payments received in a month may differ from sale paid amounts
    const salesByMonth = new Map([
      ['2025-04', { total_try: 100_000, paid_amount_try: 40_000 }],
    ])
    const paymentsByMonth = new Map([['2025-04', 55_000]])
    const result = buildMonthlyRecognition(salesByMonth, paymentsByMonth, ['2025-04'])

    expect(result[0].earned_revenue_cash).toBe(40_000)
    expect(result[0].cash_received).toBe(55_000)
  })

})

// ── classifyRevenueQualityFromRecognition ─────────────────────────────────────

describe('classifyRevenueQualityFromRecognition', () => {

  it('71. 100% rate → high_quality', () => {
    expect(classifyRevenueQualityFromRecognition(100, 0, 100_000)).toBe('high_quality')
  })

  it('72. 90% rate (boundary) → high_quality', () => {
    expect(classifyRevenueQualityFromRecognition(90, 10_000, 100_000)).toBe('high_quality')
  })

  it('73. 95% rate → high_quality', () => {
    expect(classifyRevenueQualityFromRecognition(95, 5_000, 100_000)).toBe('high_quality')
  })

  it('74. 89% rate → good_quality', () => {
    expect(classifyRevenueQualityFromRecognition(89, 11_000, 100_000)).toBe('good_quality')
  })

  it('75. 70% rate (boundary) → good_quality', () => {
    expect(classifyRevenueQualityFromRecognition(70, 30_000, 100_000)).toBe('good_quality')
  })

  it('76. 69% rate → mixed', () => {
    expect(classifyRevenueQualityFromRecognition(69, 31_000, 100_000)).toBe('mixed')
  })

  it('77. 50% rate (boundary) → mixed', () => {
    expect(classifyRevenueQualityFromRecognition(50, 50_000, 100_000)).toBe('mixed')
  })

  it('78. 49% rate → poor_quality', () => {
    expect(classifyRevenueQualityFromRecognition(49, 51_000, 100_000)).toBe('poor_quality')
  })

  it('79. 30% rate (boundary) → poor_quality', () => {
    expect(classifyRevenueQualityFromRecognition(30, 70_000, 100_000)).toBe('poor_quality')
  })

  it('80. 29% rate → uncollectable_risk', () => {
    expect(classifyRevenueQualityFromRecognition(29, 71_000, 100_000)).toBe('uncollectable_risk')
  })

  it('81. 0% rate → uncollectable_risk', () => {
    expect(classifyRevenueQualityFromRecognition(0, 100_000, 100_000)).toBe('uncollectable_risk')
  })

  it('82. null rate → uncollectable_risk', () => {
    expect(classifyRevenueQualityFromRecognition(null, 0, 0)).toBe('uncollectable_risk')
  })

})

// ── computeAvgCollectionLag ───────────────────────────────────────────────────

describe('computeAvgCollectionLag', () => {

  it('83. no paid sales → null', () => {
    expect(computeAvgCollectionLag([])).toBeNull()
  })

  it('84. all sales unpaid (null payment_date) → null', () => {
    expect(computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: null },
      { sale_date: '2025-02-01', payment_date: null },
    ])).toBeNull()
  })

  it('85. single paid sale, same day → 0 days', () => {
    expect(computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: '2025-01-01' },
    ])).toBeCloseTo(0)
  })

  it('86. single paid sale, 30 days later → 30', () => {
    expect(computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: '2025-01-31' },
    ])).toBeCloseTo(30)
  })

  it('87. average of two paid sales', () => {
    // 10 days + 20 days = avg 15 days
    const result = computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: '2025-01-11' },
      { sale_date: '2025-01-01', payment_date: '2025-01-21' },
    ])
    expect(result).toBeCloseTo(15)
  })

  it('88. mix of paid and unpaid — only paid counted', () => {
    // Only the paid sale (30 days) should be counted
    const result = computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: '2025-01-31' },
      { sale_date: '2025-02-01', payment_date: null },
    ])
    expect(result).toBeCloseTo(30)
  })

  it('89. three paid sales avg', () => {
    // 10, 20, 30 → avg 20
    const result = computeAvgCollectionLag([
      { sale_date: '2025-01-01', payment_date: '2025-01-11' },
      { sale_date: '2025-01-01', payment_date: '2025-01-21' },
      { sale_date: '2025-01-01', payment_date: '2025-01-31' },
    ])
    expect(result).toBeCloseTo(20)
  })

})

// ── generateRecognitionNarrative ──────────────────────────────────────────────

describe('generateRecognitionNarrative', () => {

  it('90. high_quality → success Turkish text', () => {
    const result = generateRecognitionNarrative('high_quality', 95, 5_000, 0)
    expect(result).toBe('Gelir tahsilatı mükemmel — nakit ve tahakkuk gelirleri örtüşüyor.')
  })

  it('91. good_quality → positive Turkish text', () => {
    const result = generateRecognitionNarrative('good_quality', 80, 20_000, 0)
    expect(result).toBe('Gelir kalitesi iyi — tahsilatlar büyük ölçüde gerçekleşiyor.')
  })

  it('92. mixed → includes rate in Turkish text', () => {
    const result = generateRecognitionNarrative('mixed', 60, 40_000, 0)
    expect(result).toContain('60')
    expect(result).toContain('tahsil')
  })

  it('93. poor_quality → warning Turkish text', () => {
    const result = generateRecognitionNarrative('poor_quality', 35, 65_000, 0)
    expect(result).toBe('Dikkat: Tahakkuk gelirlerin büyük bölümü nakit dönmüyor.')
  })

  it('94. uncollectable_risk → critical Turkish text with gap', () => {
    const result = generateRecognitionNarrative('uncollectable_risk', 10, 90_000, 0)
    expect(result).toContain('Kritik')
    expect(result).toContain('90000')
  })

  it('95. mixed with null rate → shows null formatted', () => {
    // null rate → toFixed on null would throw; test that null is handled
    const result = generateRecognitionNarrative('mixed', null, 0, 0)
    expect(result).toContain('null')
  })

  it('96. uncollectable_risk with null rate', () => {
    const result = generateRecognitionNarrative('uncollectable_risk', null, 50_000, 0)
    expect(result).toContain('Kritik')
  })

  it('97. high_quality narrative does not mention rate or gap', () => {
    const result = generateRecognitionNarrative('high_quality', 98, 2_000, 500)
    expect(result).not.toContain('98')
  })

  it('98. good_quality narrative is consistent', () => {
    const r1 = generateRecognitionNarrative('good_quality', 75, 25_000, 0)
    const r2 = generateRecognitionNarrative('good_quality', 85, 15_000, 1000)
    expect(r1).toBe(r2)
  })

  it('99. poor_quality narrative is consistent', () => {
    const r1 = generateRecognitionNarrative('poor_quality', 40, 60_000, 0)
    const r2 = generateRecognitionNarrative('poor_quality', 32, 68_000, 2000)
    expect(r1).toBe(r2)
  })

})
