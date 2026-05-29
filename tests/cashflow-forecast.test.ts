/**
 * Cash Flow Forecasting Service — unit tests
 *
 * Covers all pure functions. No DB or network calls.
 * Target: 85+ tests
 */

import { describe, it, expect } from 'vitest'
import {
  getIsoWeekStart,
  buildWeekBuckets,
  computeRiskAdjustedAmount,
  applyGrowthFactor,
  computeWeeklyInflows,
  computeWeeklyOutflows,
  buildWeeklyForecast,
  computeForecastSummary,
  classifyLiquidityOutlook,
  computeBreakevenWeeklyRevenue,
  generateForecastNarrative,
} from '../lib/services/finance/cashflow-forecast.service'
import type { WeeklyBucket } from '../lib/services/finance/cashflow-forecast.service'

// ─────────────────────────────────────────────────────────────────────────────
// getIsoWeekStart
// ─────────────────────────────────────────────────────────────────────────────

describe('getIsoWeekStart', () => {
  it('1. Monday input → same day returned', () => {
    const monday = new Date('2026-01-05') // known Monday
    const result = getIsoWeekStart(monday)
    expect(result.getDay()).toBe(1) // Monday = 1
    expect(result.getDate()).toBe(5)
  })

  it('2. Tuesday input → previous Monday', () => {
    const tuesday = new Date('2026-01-06') // Tuesday
    const result = getIsoWeekStart(tuesday)
    expect(result.getDate()).toBe(5) // Monday Jan 5
  })

  it('3. Sunday input → Monday 6 days before', () => {
    const sunday = new Date('2026-01-11') // Sunday
    const result = getIsoWeekStart(sunday)
    expect(result.getDate()).toBe(5) // Monday Jan 5
    expect(result.getDay()).toBe(1)
  })

  it('4. Wednesday input → Monday of same week', () => {
    const wednesday = new Date('2026-01-07') // Wednesday
    const result = getIsoWeekStart(wednesday)
    expect(result.getDate()).toBe(5)
  })

  it('5. Saturday input → Monday of same week', () => {
    const saturday = new Date('2026-01-10') // Saturday
    const result = getIsoWeekStart(saturday)
    expect(result.getDate()).toBe(5)
  })

  it('6. Friday input → Monday of same week', () => {
    const friday = new Date('2026-01-09')
    const result = getIsoWeekStart(friday)
    expect(result.getDate()).toBe(5)
  })

  it('7. Result time is zeroed out (midnight)', () => {
    const d = new Date('2026-01-07T15:30:00Z')
    const result = getIsoWeekStart(d)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('8. Result day is always Monday (day 1)', () => {
    // Test various days of the week
    const dates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11']
    for (const d of dates) {
      expect(getIsoWeekStart(new Date(d)).getDay()).toBe(1)
    }
  })

  it('9. Cross-month boundary: Sunday Dec 27 → Monday Dec 21', () => {
    const sunday = new Date('2026-12-27') // Sunday
    const result = getIsoWeekStart(sunday)
    expect(result.getDay()).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildWeekBuckets
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeekBuckets', () => {
  it('10. Returns exactly 13 buckets for weeks=13', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    expect(result).toHaveLength(13)
  })

  it('11. First bucket week_number is 1', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    expect(result[0].week_number).toBe(1)
  })

  it('12. Last bucket week_number is 13', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    expect(result[12].week_number).toBe(13)
  })

  it('13. week_number increments by 1 each row', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    for (let i = 0; i < 13; i++) {
      expect(result[i].week_number).toBe(i + 1)
    }
  })

  it('14. All week_start dates are Mondays', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    for (const bucket of result) {
      const d = new Date(bucket.week_start)
      expect(d.getDay()).toBe(1) // Monday
    }
  })

  it('15. All week_end dates are Sundays', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    for (const bucket of result) {
      const d = new Date(bucket.week_end)
      expect(d.getDay()).toBe(0) // Sunday
    }
  })

  it('16. week_end is 6 days after week_start', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    for (const bucket of result) {
      const start = new Date(bucket.week_start)
      const end = new Date(bucket.week_end)
      const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBe(6)
    }
  })

  it('17. Consecutive buckets are exactly 7 days apart', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    for (let i = 1; i < result.length; i++) {
      const prev = new Date(result[i - 1].week_start)
      const curr = new Date(result[i].week_start)
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffDays).toBe(7)
    }
  })

  it('18. Start of forecast is next Monday after input', () => {
    // Monday Jan 5 → next Monday is Jan 12
    const result = buildWeekBuckets(new Date('2026-01-05'), 1)
    expect(result[0].week_start).toBe('2026-01-12')
  })

  it('19. Works for weeks=1', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 1)
    expect(result).toHaveLength(1)
    expect(result[0].week_number).toBe(1)
  })

  it('20. Dates formatted as YYYY-MM-DD strings', () => {
    const result = buildWeekBuckets(new Date('2026-01-05'), 13)
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/
    for (const bucket of result) {
      expect(bucket.week_start).toMatch(isoPattern)
      expect(bucket.week_end).toMatch(isoPattern)
    }
  })

  it('21. Wednesday input: first bucket still starts next Monday', () => {
    const result = buildWeekBuckets(new Date('2026-01-07'), 1) // Wednesday Jan 7
    // current week Monday = Jan 5, next Monday = Jan 12
    expect(result[0].week_start).toBe('2026-01-12')
  })

  it('22. Sunday input: first bucket starts next Monday (tomorrow)', () => {
    const result = buildWeekBuckets(new Date('2026-01-11'), 1) // Sunday Jan 11
    // current week Monday = Jan 5, next Monday = Jan 12
    expect(result[0].week_start).toBe('2026-01-12')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRiskAdjustedAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRiskAdjustedAmount', () => {
  it('23. probability 1.0 → same amount', () => {
    expect(computeRiskAdjustedAmount(10000, 1.0)).toBe(10000)
  })

  it('24. probability 0.0 → 0', () => {
    expect(computeRiskAdjustedAmount(10000, 0.0)).toBe(0)
  })

  it('25. probability 0.5 → half amount', () => {
    expect(computeRiskAdjustedAmount(10000, 0.5)).toBe(5000)
  })

  it('26. probability 0.95 → 95% of amount', () => {
    expect(computeRiskAdjustedAmount(1000, 0.95)).toBe(950)
  })

  it('27. probability 0.70 → 70% of amount', () => {
    expect(computeRiskAdjustedAmount(1000, 0.70)).toBe(700)
  })

  it('28. Rounds to 2 decimal places', () => {
    // 100 × 0.333 = 33.3, rounded to 2dp = 33.3
    const result = computeRiskAdjustedAmount(100, 0.333)
    expect(result).toBe(33.3)
  })

  it('29. Zero amount → 0', () => {
    expect(computeRiskAdjustedAmount(0, 0.95)).toBe(0)
  })

  it('30. Large amount × probability', () => {
    expect(computeRiskAdjustedAmount(500000, 0.85)).toBe(425000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// applyGrowthFactor
// ─────────────────────────────────────────────────────────────────────────────

describe('applyGrowthFactor', () => {
  it('31. growthRate 0 → base amount unchanged', () => {
    expect(applyGrowthFactor(10000, 0, 5)).toBe(10000)
  })

  it('32. weekNumber 0 → base amount unchanged', () => {
    expect(applyGrowthFactor(10000, 0.52, 0)).toBe(10000)
  })

  it('33. growthRate 0.52, weekNumber 1 → slight increase', () => {
    // 10000 × (1 + 0.52/52 × 1) = 10000 × (1 + 0.01) = 10100
    expect(applyGrowthFactor(10000, 0.52, 1)).toBe(10100)
  })

  it('34. Clamps to 0 for negative result (negative growth rate)', () => {
    // -1000 base with high negative growth
    expect(applyGrowthFactor(0, -100, 52)).toBe(0)
  })

  it('35. Large growth rate amplifies base', () => {
    // 1000 × (1 + 52/52 × 1) = 1000 × 2 = 2000
    expect(applyGrowthFactor(1000, 52, 1)).toBe(2000)
  })

  it('36. Zero base amount → 0 regardless of growth', () => {
    expect(applyGrowthFactor(0, 0.5, 13)).toBe(0)
  })

  it('37. Rounds to 2 decimal places', () => {
    // result should be round2 of computed value
    const result = applyGrowthFactor(1000, 0.1, 3)
    const expected = Math.round((1000 * (1 + 0.1 / 52 * 3) + Number.EPSILON) * 100) / 100
    expect(result).toBe(expected)
  })

  it('38. Negative base clamped to 0 after growth', () => {
    // negative base: -100 × (1 + 0.01×1) = -101 → clamped to 0
    expect(applyGrowthFactor(-100, 0.52, 1)).toBe(0)
  })

  it('39. Result is always non-negative', () => {
    for (let w = 1; w <= 13; w++) {
      expect(applyGrowthFactor(1000, -200, w)).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWeeklyInflows
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWeeklyInflows', () => {
  it('40. Returns 2 categories', () => {
    const result = computeWeeklyInflows(100000, 0.8, 50000, 0.3)
    expect(result).toHaveLength(2)
  })

  it('41. First category is regular_collections', () => {
    const result = computeWeeklyInflows(100000, 0.8, 50000, 0.3)
    expect(result[0].category).toBe('regular_collections')
  })

  it('42. Second category is overdue_recovery', () => {
    const result = computeWeeklyInflows(100000, 0.8, 50000, 0.3)
    expect(result[1].category).toBe('overdue_recovery')
  })

  it('43. regular_collections expected_amount = avgMonthlyRevenue/4.33', () => {
    const result = computeWeeklyInflows(86600, 1.0, 0, 0)
    // 86600 / 4.33 ≈ 20000
    expect(result[0].expected_amount).toBeCloseTo(20000, 0)
  })

  it('44. regular_collections probability matches collectionRate', () => {
    const result = computeWeeklyInflows(100000, 0.75, 0, 0)
    expect(result[0].probability).toBe(0.75)
  })

  it('45. regular_collections risk_adjusted = expected × collectionRate', () => {
    const result = computeWeeklyInflows(86600, 0.8, 0, 0)
    const expected = result[0].expected_amount * 0.8
    expect(result[0].risk_adjusted_amount).toBeCloseTo(expected, 1)
  })

  it('46. overdue_recovery expected_amount = overdueReceivables × recoveryRate / 13', () => {
    const result = computeWeeklyInflows(0, 1.0, 130000, 1.0)
    // 130000 × 1.0 / 13 = 10000
    expect(result[1].expected_amount).toBeCloseTo(10000, 0)
  })

  it('47. overdue_recovery probability matches expectedRecoveryRate', () => {
    const result = computeWeeklyInflows(0, 0.8, 50000, 0.4)
    expect(result[1].probability).toBe(0.4)
  })

  it('48. Zero avgMonthlyRevenue → regular_collections expected = 0', () => {
    const result = computeWeeklyInflows(0, 0.8, 0, 0)
    expect(result[0].expected_amount).toBe(0)
    expect(result[0].risk_adjusted_amount).toBe(0)
  })

  it('49. Zero overdueReceivables → overdue_recovery amounts = 0', () => {
    const result = computeWeeklyInflows(100000, 0.8, 0, 0.3)
    expect(result[1].expected_amount).toBe(0)
    expect(result[1].risk_adjusted_amount).toBe(0)
  })

  it('50. collectionRate 1.0 → risk_adjusted equals expected for regular', () => {
    const result = computeWeeklyInflows(100000, 1.0, 0, 0)
    expect(result[0].risk_adjusted_amount).toBe(result[0].expected_amount)
  })

  it('51. All amounts are non-negative', () => {
    const result = computeWeeklyInflows(100000, 0.85, 50000, 0.3)
    for (const cat of result) {
      expect(cat.expected_amount).toBeGreaterThanOrEqual(0)
      expect(cat.risk_adjusted_amount).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeWeeklyOutflows
// ─────────────────────────────────────────────────────────────────────────────

describe('computeWeeklyOutflows', () => {
  it('52. Returns 4 categories', () => {
    const result = computeWeeklyOutflows(100000, 20000, 50000, 30000)
    expect(result).toHaveLength(4)
  })

  it('53. Categories are operating_expenses, debt_service, capex, tax_payments', () => {
    const result = computeWeeklyOutflows(100000, 20000, 50000, 30000)
    const cats = result.map(c => c.category)
    expect(cats).toContain('operating_expenses')
    expect(cats).toContain('debt_service')
    expect(cats).toContain('capex')
    expect(cats).toContain('tax_payments')
  })

  it('54. operating_expenses expected_amount = avgMonthlyExpenses/4.33', () => {
    const result = computeWeeklyOutflows(86600, 0, 0, 0)
    const opex = result.find(c => c.category === 'operating_expenses')!
    expect(opex.expected_amount).toBeCloseTo(20000, 0)
  })

  it('55. operating_expenses probability = 0.95', () => {
    const result = computeWeeklyOutflows(100000, 0, 0, 0)
    const opex = result.find(c => c.category === 'operating_expenses')!
    expect(opex.probability).toBe(0.95)
  })

  it('56. debt_service expected_amount = monthlyLoanRepayments/4.33', () => {
    const result = computeWeeklyOutflows(0, 43300, 0, 0)
    const debt = result.find(c => c.category === 'debt_service')!
    expect(debt.expected_amount).toBeCloseTo(10000, 0)
  })

  it('57. debt_service probability = 1.0', () => {
    const result = computeWeeklyOutflows(0, 10000, 0, 0)
    const debt = result.find(c => c.category === 'debt_service')!
    expect(debt.probability).toBe(1.0)
  })

  it('58. debt_service risk_adjusted_amount = expected (probability 1.0)', () => {
    const result = computeWeeklyOutflows(0, 10000, 0, 0)
    const debt = result.find(c => c.category === 'debt_service')!
    expect(debt.risk_adjusted_amount).toBe(debt.expected_amount)
  })

  it('59. capex expected_amount = plannedCapex/13', () => {
    const result = computeWeeklyOutflows(0, 0, 130000, 0)
    const capex = result.find(c => c.category === 'capex')!
    expect(capex.expected_amount).toBeCloseTo(10000, 0)
  })

  it('60. capex probability = 0.70', () => {
    const result = computeWeeklyOutflows(0, 0, 100000, 0)
    const capex = result.find(c => c.category === 'capex')!
    expect(capex.probability).toBe(0.70)
  })

  it('61. capex risk_adjusted_amount = expected × 0.70', () => {
    const result = computeWeeklyOutflows(0, 0, 130000, 0)
    const capex = result.find(c => c.category === 'capex')!
    expect(capex.risk_adjusted_amount).toBeCloseTo(capex.expected_amount * 0.70, 1)
  })

  it('62. tax_payments expected_amount = taxPaymentThisQuarter/13', () => {
    const result = computeWeeklyOutflows(0, 0, 0, 130000)
    const tax = result.find(c => c.category === 'tax_payments')!
    expect(tax.expected_amount).toBeCloseTo(10000, 0)
  })

  it('63. tax_payments probability = 1.0', () => {
    const result = computeWeeklyOutflows(0, 0, 0, 100000)
    const tax = result.find(c => c.category === 'tax_payments')!
    expect(tax.probability).toBe(1.0)
  })

  it('64. Zero taxPayment → tax_payments amounts = 0', () => {
    const result = computeWeeklyOutflows(0, 0, 0, 0)
    const tax = result.find(c => c.category === 'tax_payments')!
    expect(tax.expected_amount).toBe(0)
    expect(tax.risk_adjusted_amount).toBe(0)
  })

  it('65. All categories have non-negative amounts', () => {
    const result = computeWeeklyOutflows(100000, 20000, 50000, 30000)
    for (const cat of result) {
      expect(cat.expected_amount).toBeGreaterThanOrEqual(0)
      expect(cat.risk_adjusted_amount).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildWeeklyForecast
// ─────────────────────────────────────────────────────────────────────────────

describe('buildWeeklyForecast', () => {
  it('66. Returns 13 buckets', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    expect(result).toHaveLength(13)
  })

  it('67. Week 1 cumulative_cash = currentCash + net', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    expect(result[0].cumulative_cash).toBeCloseTo(100000 + 5000, 1)
  })

  it('68. Cumulative cash is running sum across weeks', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    let expected = 100000
    for (const bucket of result) {
      expected = Math.round((expected + 5000 + Number.EPSILON) * 100) / 100
      expect(bucket.cumulative_cash).toBeCloseTo(expected, 1)
    }
  })

  it('69. net_cashflow = weeklyInflows - weeklyOutflows', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    for (const bucket of result) {
      expect(bucket.net_cashflow).toBeCloseTo(5000, 1)
    }
  })

  it('70. is_negative = true when cumulative_cash < 0', () => {
    // currentCash = 5000, outflows > inflows each week
    const result = buildWeeklyForecast(5000, 1000, 5000, 13)
    const negBuckets = result.filter(b => b.is_negative)
    expect(negBuckets.length).toBeGreaterThan(0)
    for (const b of negBuckets) {
      expect(b.cumulative_cash).toBeLessThan(0)
    }
  })

  it('71. is_negative = false when cumulative_cash > 0', () => {
    const result = buildWeeklyForecast(1000000, 20000, 15000, 13)
    for (const bucket of result) {
      expect(bucket.is_negative).toBe(false)
    }
  })

  it('72. expected_inflows matches weeklyInflows input', () => {
    const result = buildWeeklyForecast(100000, 23456, 12345, 13)
    for (const bucket of result) {
      expect(bucket.expected_inflows).toBeCloseTo(23456, 1)
    }
  })

  it('73. expected_outflows matches weeklyOutflows input', () => {
    const result = buildWeeklyForecast(100000, 23456, 12345, 13)
    for (const bucket of result) {
      expect(bucket.expected_outflows).toBeCloseTo(12345, 1)
    }
  })

  it('74. week_number increments from 1 to 13', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    for (let i = 0; i < 13; i++) {
      expect(result[i].week_number).toBe(i + 1)
    }
  })

  it('75. All week_start dates are present as YYYY-MM-DD', () => {
    const result = buildWeeklyForecast(100000, 20000, 15000, 13)
    const pattern = /^\d{4}-\d{2}-\d{2}$/
    for (const b of result) {
      expect(b.week_start).toMatch(pattern)
      expect(b.week_end).toMatch(pattern)
    }
  })

  it('76. Zero currentCash with outflows → goes negative immediately', () => {
    const result = buildWeeklyForecast(0, 0, 10000, 13)
    expect(result[0].is_negative).toBe(true)
    expect(result[0].cumulative_cash).toBeLessThan(0)
  })

  it('77. Equal inflows and outflows → cumulative stays at currentCash', () => {
    const result = buildWeeklyForecast(50000, 10000, 10000, 13)
    for (const bucket of result) {
      expect(bucket.cumulative_cash).toBeCloseTo(50000, 1)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeForecastSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('computeForecastSummary', () => {
  // Helper to build buckets
  function makeBuckets(netCashflows: number[], currentCash = 0): WeeklyBucket[] {
    let cumulative = currentCash
    return netCashflows.map((net, i) => {
      cumulative = Math.round((cumulative + net + Number.EPSILON) * 100) / 100
      return {
        week_start: `2026-01-${String(i + 1).padStart(2, '0')}`,
        week_end: `2026-01-${String(i + 7).padStart(2, '0')}`,
        week_number: i + 1,
        expected_inflows: net > 0 ? net : 0,
        expected_outflows: net < 0 ? -net : 0,
        net_cashflow: net,
        cumulative_cash: cumulative,
        is_negative: cumulative < 0,
      }
    })
  }

  it('78. Empty buckets → all zeros and nulls', () => {
    const result = computeForecastSummary([])
    expect(result.total_inflows).toBe(0)
    expect(result.total_outflows).toBe(0)
    expect(result.first_negative_week).toBeNull()
  })

  it('79. total_inflows = sum of expected_inflows', () => {
    const buckets = buildWeeklyForecast(0, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.total_inflows).toBeCloseTo(5000 * 13, 0)
  })

  it('80. total_outflows = sum of expected_outflows', () => {
    const buckets = buildWeeklyForecast(0, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.total_outflows).toBeCloseTo(3000 * 13, 0)
  })

  it('81. net_position_change = total_inflows - total_outflows', () => {
    const buckets = buildWeeklyForecast(100000, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.net_position_change).toBeCloseTo(result.total_inflows - result.total_outflows, 1)
  })

  it('82. weeks_positive count is correct (all positive)', () => {
    const buckets = buildWeeklyForecast(1000000, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.weeks_positive).toBe(13)
    expect(result.weeks_negative).toBe(0)
  })

  it('83. weeks_negative count is correct (all negative)', () => {
    const buckets = buildWeeklyForecast(0, 0, 10000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.weeks_negative).toBe(13)
    expect(result.weeks_positive).toBe(0)
  })

  it('84. weeks_positive + weeks_negative = total weeks', () => {
    const buckets = buildWeeklyForecast(5000, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.weeks_positive + result.weeks_negative).toBe(13)
  })

  it('85. first_negative_week is null when no negative weeks', () => {
    const buckets = buildWeeklyForecast(1000000, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.first_negative_week).toBeNull()
  })

  it('86. first_negative_week = 1 when immediately negative', () => {
    const buckets = buildWeeklyForecast(0, 0, 10000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.first_negative_week).toBe(1)
  })

  it('87. worst_week_net = minimum net_cashflow', () => {
    const buckets = buildWeeklyForecast(0, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.worst_week_net).toBeCloseTo(2000, 1)
  })

  it('88. best_week_net = maximum net_cashflow', () => {
    const buckets = buildWeeklyForecast(0, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.best_week_net).toBeCloseTo(2000, 1)
  })

  it('89. min_cumulative_cash is correct', () => {
    const buckets = buildWeeklyForecast(0, 0, 10000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.min_cumulative_cash).toBeLessThan(0)
  })

  it('90. max_cumulative_cash is correct', () => {
    const buckets = buildWeeklyForecast(100000, 5000, 3000, 13)
    const result = computeForecastSummary(buckets)
    expect(result.max_cumulative_cash).toBeCloseTo(100000 + 2000 * 13, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyLiquidityOutlook
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyLiquidityOutlook', () => {
  it('91. strong: no negatives AND minCumulative >= currentCash × 0.5', () => {
    expect(classifyLiquidityOutlook(null, 60000, 100000)).toBe('strong')
  })

  it('92. strong: no negatives AND minCumulative = exactly currentCash × 0.5', () => {
    expect(classifyLiquidityOutlook(null, 50000, 100000)).toBe('strong')
  })

  it('93. stable: no negatives BUT minCumulative < currentCash × 0.5', () => {
    expect(classifyLiquidityOutlook(null, 40000, 100000)).toBe('stable')
  })

  it('94. stable: no negatives, currentCash = 0 → minCumulative >= 0', () => {
    // currentCash × 0.5 = 0, minCumulative = 0 → strong
    expect(classifyLiquidityOutlook(null, 0, 0)).toBe('strong')
  })

  it('95. cautious: firstNegativeWeek = 9 (> 8)', () => {
    expect(classifyLiquidityOutlook(9, 100, 100000)).toBe('cautious')
  })

  it('96. cautious: firstNegativeWeek = 13', () => {
    expect(classifyLiquidityOutlook(13, 100, 100000)).toBe('cautious')
  })

  it('97. at_risk: firstNegativeWeek = 5 (> 4, <= 8)', () => {
    expect(classifyLiquidityOutlook(5, 100, 100000)).toBe('at_risk')
  })

  it('98. at_risk: firstNegativeWeek = 8', () => {
    expect(classifyLiquidityOutlook(8, 100, 100000)).toBe('at_risk')
  })

  it('99. critical: firstNegativeWeek = 4 (<= 4)', () => {
    expect(classifyLiquidityOutlook(4, 100, 100000)).toBe('critical')
  })

  it('100. critical: firstNegativeWeek = 1 (<= 4)', () => {
    expect(classifyLiquidityOutlook(1, -5000, 100000)).toBe('critical')
  })

  it('101. critical: minCumulativeCash < 0', () => {
    expect(classifyLiquidityOutlook(6, -100, 100000)).toBe('critical')
  })

  it('102. critical takes precedence over at_risk when minCumulative < 0', () => {
    // firstNegativeWeek = 6 would be at_risk, but minCumulative < 0 → critical
    expect(classifyLiquidityOutlook(6, -1, 100000)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBreakevenWeeklyRevenue
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBreakevenWeeklyRevenue', () => {
  it('103. Normal case: weeklyOutflows / collectionRate', () => {
    expect(computeBreakevenWeeklyRevenue(10000, 0.8)).toBeCloseTo(12500, 1)
  })

  it('104. collectionRate = 1.0 → returns weeklyOutflows as-is', () => {
    expect(computeBreakevenWeeklyRevenue(10000, 1.0)).toBe(10000)
  })

  it('105. collectionRate = 0.0 → returns weeklyOutflows (null-safe guard)', () => {
    expect(computeBreakevenWeeklyRevenue(10000, 0.0)).toBe(10000)
  })

  it('106. collectionRate < 0 → returns weeklyOutflows (null-safe guard)', () => {
    expect(computeBreakevenWeeklyRevenue(10000, -0.5)).toBe(10000)
  })

  it('107. Zero outflows → returns 0', () => {
    expect(computeBreakevenWeeklyRevenue(0, 0.8)).toBe(0)
  })

  it('108. collectionRate 0.5 → doubles the required revenue', () => {
    expect(computeBreakevenWeeklyRevenue(5000, 0.5)).toBeCloseTo(10000, 1)
  })

  it('109. Rounds to 2 decimal places', () => {
    const result = computeBreakevenWeeklyRevenue(10000, 0.3)
    expect(result).toBeCloseTo(33333.33, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateForecastNarrative
// ─────────────────────────────────────────────────────────────────────────────

describe('generateForecastNarrative', () => {
  function makeSummary(firstNegativeWeek: number | null = null) {
    return {
      total_inflows: 500000,
      total_outflows: 400000,
      net_position_change: 100000,
      weeks_positive: firstNegativeWeek === null ? 13 : (firstNegativeWeek - 1),
      weeks_negative: firstNegativeWeek === null ? 0 : (13 - (firstNegativeWeek - 1)),
      first_negative_week: firstNegativeWeek,
      worst_week_net: -5000,
      best_week_net: 15000,
      min_cumulative_cash: firstNegativeWeek ? -10000 : 50000,
      max_cumulative_cash: 200000,
    }
  }

  it('110. strong outlook → specific Turkish text', () => {
    const result = generateForecastNarrative(100000, 'strong', makeSummary(), 50000)
    expect(result).toBe('Nakit pozisyonu güçlü — 13 haftalık projeksiyonda negatif hafta bulunmuyor.')
  })

  it('111. stable outlook → specific Turkish text', () => {
    const result = generateForecastNarrative(100000, 'stable', makeSummary(), 50000)
    expect(result).toBe('Nakit akışı dengede — önümüzdeki 13 haftada pozitif kalmaya devam ediyor.')
  })

  it('112. cautious outlook with week 9 → includes week number', () => {
    const result = generateForecastNarrative(100000, 'cautious', makeSummary(9), 50000)
    expect(result).toContain('9')
    expect(result).toContain('haftada')
    expect(result).toContain('nakit sıkışması')
  })

  it('113. at_risk outlook with week 6 → includes week number', () => {
    const result = generateForecastNarrative(100000, 'at_risk', makeSummary(6), 50000)
    expect(result).toContain('6')
    expect(result).toContain('nakit yetersizliği')
  })

  it('114. critical outlook → specific Turkish text about 4 weeks', () => {
    const result = generateForecastNarrative(100000, 'critical', makeSummary(2), 50000)
    expect(result).toBe('Kritik — önümüzdeki 4 haftada nakit açığı riski yüksek.')
  })

  it('115. Returns a non-empty string for all outlook levels', () => {
    const outlooks: ReturnType<typeof classifyLiquidityOutlook>[] = [
      'strong', 'stable', 'cautious', 'at_risk', 'critical',
    ]
    for (const outlook of outlooks) {
      const week = outlook === 'cautious' ? 9 : outlook === 'at_risk' ? 5 : null
      const result = generateForecastNarrative(100000, outlook, makeSummary(week), 50000)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })

  it('116. cautious narrative references first_negative_week from summary', () => {
    const summary = makeSummary(11)
    const result = generateForecastNarrative(100000, 'cautious', summary, 50000)
    expect(result).toContain('11')
  })

  it('117. at_risk narrative references first_negative_week from summary', () => {
    const summary = makeSummary(7)
    const result = generateForecastNarrative(100000, 'at_risk', summary, 50000)
    expect(result).toContain('7')
  })
})
