/**
 * Sales Target Service — unit tests
 *
 * Covers all pure computation functions exported from the service.
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAttainmentPct,
  computeRevenuePace,
  computeRequiredDailyRevenue,
  classifyAttainment,
  computeVarianceToTarget,
  computeGrowthVsPriorYear,
  buildMonthlyTargetActuals,
  computeYtdSummary,
  computeRunRateProjection,
  classifyYtdPerformance,
  computeBestMonth,
  computeWorstMonth,
  computeConsecutiveAboveTarget,
  generateTargetNarrative,
  type TargetPeriod,
  type TargetActual,
} from '../lib/services/commercial/sales-target.service'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTargetActual(
  year_month: string,
  actual_revenue: number,
  target_revenue: number | null = null,
  actual_units = 0,
  target_units: number | null = null,
  actual_deals = 0,
  target_deals: number | null = null,
): TargetActual {
  return {
    year_month,
    target_revenue,
    actual_revenue,
    target_units,
    actual_units,
    target_deals,
    actual_deals,
  }
}

function makeActualsMap(
  entries: Array<[string, { revenue: number; units: number; deals: number }]>,
): Map<string, { revenue: number; units: number; deals: number }> {
  return new Map(entries)
}

// ── computeAttainmentPct ──────────────────────────────────────────────────────

describe('computeAttainmentPct', () => {
  it('1. basic calculation: 80 / 100 = 80%', () => {
    expect(computeAttainmentPct(80, 100)).toBe(80)
  })

  it('2. over-target: 120 / 100 = 120%', () => {
    expect(computeAttainmentPct(120, 100)).toBe(120)
  })

  it('3. exactly on target: 100 / 100 = 100%', () => {
    expect(computeAttainmentPct(100, 100)).toBe(100)
  })

  it('4. null target returns null', () => {
    expect(computeAttainmentPct(80, null)).toBeNull()
  })

  it('5. zero target returns null', () => {
    expect(computeAttainmentPct(80, 0)).toBeNull()
  })

  it('6. zero actual: 0 / 100 = 0%', () => {
    expect(computeAttainmentPct(0, 100)).toBe(0)
  })

  it('7. fractional result: 50 / 300 ≈ 16.67%', () => {
    const result = computeAttainmentPct(50, 300)
    expect(result).toBeCloseTo(16.67, 1)
  })

  it('8. large numbers: 1_000_000 / 1_000_000 = 100%', () => {
    expect(computeAttainmentPct(1_000_000, 1_000_000)).toBe(100)
  })
})

// ── computeRevenuePace ────────────────────────────────────────────────────────

describe('computeRevenuePace', () => {
  it('9. mid-month projection: 15k in 15 days, 30-day month, 100k target → 100%', () => {
    // pace = (15000 / 15) * 30 = 30000; attainment = 30000 / 30000 = 100
    expect(computeRevenuePace(15_000, 30_000, 15, 30)).toBeCloseTo(100)
  })

  it('10. ahead of pace: 20k in 15 days, 30k target, 30-day month', () => {
    // pace = (20000 / 15) * 30 = 40000; attainment = 40000 / 30000 ≈ 133.33%
    const result = computeRevenuePace(20_000, 30_000, 15, 30)
    expect(result).toBeCloseTo(133.33, 1)
  })

  it('11. behind pace: 5k in 20 days, 30k target, 30-day month', () => {
    // pace = (5000 / 20) * 30 = 7500; attainment = 7500 / 30000 = 25%
    expect(computeRevenuePace(5_000, 30_000, 20, 30)).toBeCloseTo(25)
  })

  it('12. null target returns null', () => {
    expect(computeRevenuePace(10_000, null, 15, 30)).toBeNull()
  })

  it('13. zero target returns null', () => {
    expect(computeRevenuePace(10_000, 0, 15, 30)).toBeNull()
  })

  it('14. dayOfMonth === 0 returns null', () => {
    expect(computeRevenuePace(10_000, 30_000, 0, 30)).toBeNull()
  })

  it('15. first day of month: 1k in 1 day, 30k target, 30-day month → 100%', () => {
    // pace = (1000 / 1) * 30 = 30000; attainment = 30000 / 30000 = 100%
    expect(computeRevenuePace(1_000, 30_000, 1, 30)).toBeCloseTo(100)
  })

  it('16. last day of month (day 31 of 31): actual = target → 100%', () => {
    // pace = (30000 / 31) * 31 = 30000; attainment = 30000 / 30000 = 100%
    expect(computeRevenuePace(30_000, 30_000, 31, 31)).toBeCloseTo(100)
  })

  it('17. 31-day month, 28 days elapsed, on track', () => {
    // pace = (28000 / 28) * 31 = 31000; attainment = 31000 / 30000 ≈ 103.33%
    const result = computeRevenuePace(28_000, 30_000, 28, 31)
    expect(result).toBeCloseTo(103.33, 1)
  })
})

// ── computeRequiredDailyRevenue ───────────────────────────────────────────────

describe('computeRequiredDailyRevenue', () => {
  it('18. standard under-target: 10k remaining, 10 days → 1000/day', () => {
    expect(computeRequiredDailyRevenue(20_000, 10_000, 10)).toBe(1_000)
  })

  it('19. over-target returns 0', () => {
    expect(computeRequiredDailyRevenue(20_000, 25_000, 5)).toBe(0)
  })

  it('20. exactly on target with remaining days returns 0', () => {
    expect(computeRequiredDailyRevenue(20_000, 20_000, 5)).toBe(0)
  })

  it('21. null target returns null', () => {
    expect(computeRequiredDailyRevenue(null, 10_000, 5)).toBeNull()
  })

  it('22. zero remaining days, under target → returns 0', () => {
    expect(computeRequiredDailyRevenue(20_000, 10_000, 0)).toBe(0)
  })

  it('23. zero remaining days, over target → returns 0', () => {
    expect(computeRequiredDailyRevenue(20_000, 25_000, 0)).toBe(0)
  })

  it('24. zero actual: full target remaining over 20 days', () => {
    expect(computeRequiredDailyRevenue(20_000, 0, 20)).toBe(1_000)
  })

  it('25. fractional result', () => {
    const result = computeRequiredDailyRevenue(10_000, 1_000, 3)
    expect(result).toBeCloseTo(3_000)
  })
})

// ── classifyAttainment ────────────────────────────────────────────────────────

describe('classifyAttainment', () => {
  it('26. null → no_target', () => {
    expect(classifyAttainment(null)).toBe('no_target')
  })

  it('27. 105% → exceeded', () => {
    expect(classifyAttainment(105)).toBe('exceeded')
  })

  it('28. 120% → exceeded', () => {
    expect(classifyAttainment(120)).toBe('exceeded')
  })

  it('29. 104.9% → on_track', () => {
    expect(classifyAttainment(104.9)).toBe('on_track')
  })

  it('30. 90% → on_track', () => {
    expect(classifyAttainment(90)).toBe('on_track')
  })

  it('31. 89.9% → at_risk', () => {
    expect(classifyAttainment(89.9)).toBe('at_risk')
  })

  it('32. 70% → at_risk', () => {
    expect(classifyAttainment(70)).toBe('at_risk')
  })

  it('33. 69.9% → behind', () => {
    expect(classifyAttainment(69.9)).toBe('behind')
  })

  it('34. 50% → behind', () => {
    expect(classifyAttainment(50)).toBe('behind')
  })

  it('35. 49.9% → critical', () => {
    expect(classifyAttainment(49.9)).toBe('critical')
  })

  it('36. 0% → critical', () => {
    expect(classifyAttainment(0)).toBe('critical')
  })

  it('37. exact boundary 105 → exceeded', () => {
    expect(classifyAttainment(105)).toBe('exceeded')
  })

  it('38. exact boundary 90 → on_track', () => {
    expect(classifyAttainment(90)).toBe('on_track')
  })

  it('39. exact boundary 70 → at_risk', () => {
    expect(classifyAttainment(70)).toBe('at_risk')
  })

  it('40. exact boundary 50 → behind', () => {
    expect(classifyAttainment(50)).toBe('behind')
  })
})

// ── computeVarianceToTarget ───────────────────────────────────────────────────

describe('computeVarianceToTarget', () => {
  it('41. positive variance: actual > target', () => {
    expect(computeVarianceToTarget(120, 100)).toBe(20)
  })

  it('42. negative variance: actual < target', () => {
    expect(computeVarianceToTarget(80, 100)).toBe(-20)
  })

  it('43. zero variance: actual = target', () => {
    expect(computeVarianceToTarget(100, 100)).toBe(0)
  })

  it('44. null target returns null', () => {
    expect(computeVarianceToTarget(80, null)).toBeNull()
  })

  it('45. zero actual', () => {
    expect(computeVarianceToTarget(0, 50)).toBe(-50)
  })

  it('46. zero target returns 0', () => {
    expect(computeVarianceToTarget(0, 0)).toBe(0)
  })
})

// ── computeGrowthVsPriorYear ──────────────────────────────────────────────────

describe('computeGrowthVsPriorYear', () => {
  it('47. positive growth: 120 vs 100 → 20%', () => {
    expect(computeGrowthVsPriorYear(120, 100)).toBe(20)
  })

  it('48. negative growth: 80 vs 100 → -20%', () => {
    expect(computeGrowthVsPriorYear(80, 100)).toBe(-20)
  })

  it('49. no growth: same revenue → 0%', () => {
    expect(computeGrowthVsPriorYear(100, 100)).toBe(0)
  })

  it('50. null prior returns null', () => {
    expect(computeGrowthVsPriorYear(100, null)).toBeNull()
  })

  it('51. zero prior returns null', () => {
    expect(computeGrowthVsPriorYear(100, 0)).toBeNull()
  })

  it('52. prior is undefined-like (null)', () => {
    expect(computeGrowthVsPriorYear(0, null)).toBeNull()
  })

  it('53. large growth: 1M vs 500k → 100%', () => {
    expect(computeGrowthVsPriorYear(1_000_000, 500_000)).toBe(100)
  })
})

// ── buildMonthlyTargetActuals ─────────────────────────────────────────────────

describe('buildMonthlyTargetActuals', () => {
  it('54. empty targets and empty actuals → empty array', () => {
    const result = buildMonthlyTargetActuals([], makeActualsMap([]))
    expect(result).toHaveLength(0)
  })

  it('55. targets with no actuals: actual fields default to 0', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 1, revenue_target: 10_000, unit_target: null, deal_target: null },
    ]
    const result = buildMonthlyTargetActuals(targets, makeActualsMap([]))
    expect(result).toHaveLength(1)
    expect(result[0].year_month).toBe('2025-01')
    expect(result[0].target_revenue).toBe(10_000)
    expect(result[0].actual_revenue).toBe(0)
  })

  it('56. actuals with no target: target fields are null', () => {
    const actuals = makeActualsMap([['2025-02', { revenue: 5_000, units: 10, deals: 3 }]])
    const result = buildMonthlyTargetActuals([], actuals)
    expect(result).toHaveLength(1)
    expect(result[0].year_month).toBe('2025-02')
    expect(result[0].target_revenue).toBeNull()
    expect(result[0].actual_revenue).toBe(5_000)
  })

  it('57. join: matching year_month merges data', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 3, revenue_target: 20_000, unit_target: 100, deal_target: 50 },
    ]
    const actuals = makeActualsMap([['2025-03', { revenue: 18_000, units: 90, deals: 45 }]])
    const result = buildMonthlyTargetActuals(targets, actuals)
    expect(result).toHaveLength(1)
    expect(result[0].target_revenue).toBe(20_000)
    expect(result[0].actual_revenue).toBe(18_000)
    expect(result[0].target_units).toBe(100)
    expect(result[0].actual_units).toBe(90)
    expect(result[0].target_deals).toBe(50)
    expect(result[0].actual_deals).toBe(45)
  })

  it('58. sorted chronologically', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 3, revenue_target: 20_000, unit_target: null, deal_target: null },
      { year: 2025, month: 1, revenue_target: 10_000, unit_target: null, deal_target: null },
    ]
    const result = buildMonthlyTargetActuals(targets, makeActualsMap([]))
    expect(result[0].year_month).toBe('2025-01')
    expect(result[1].year_month).toBe('2025-03')
  })

  it('59. mixed: some months have targets, some have only actuals', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 1, revenue_target: 10_000, unit_target: null, deal_target: null },
    ]
    const actuals = makeActualsMap([
      ['2025-01', { revenue: 9_000, units: 0, deals: 5 }],
      ['2025-02', { revenue: 11_000, units: 0, deals: 7 }],
    ])
    const result = buildMonthlyTargetActuals(targets, actuals)
    expect(result).toHaveLength(2)
    const jan = result.find(r => r.year_month === '2025-01')
    const feb = result.find(r => r.year_month === '2025-02')
    expect(jan?.target_revenue).toBe(10_000)
    expect(feb?.target_revenue).toBeNull()
  })

  it('60. month zero-padding: month 5 → 2025-05', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 5, revenue_target: 5_000, unit_target: null, deal_target: null },
    ]
    const result = buildMonthlyTargetActuals(targets, makeActualsMap([]))
    expect(result[0].year_month).toBe('2025-05')
  })

  it('61. month 12 formats correctly → 2025-12', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 12, revenue_target: 15_000, unit_target: null, deal_target: null },
    ]
    const result = buildMonthlyTargetActuals(targets, makeActualsMap([]))
    expect(result[0].year_month).toBe('2025-12')
  })
})

// ── computeYtdSummary ─────────────────────────────────────────────────────────

describe('computeYtdSummary', () => {
  it('62. empty array → all zeros and nulls', () => {
    const result = computeYtdSummary([], '2025-06')
    expect(result.ytd_actual_revenue).toBe(0)
    expect(result.ytd_target_revenue).toBeNull()
    expect(result.ytd_attainment_pct).toBeNull()
    expect(result.ytd_variance).toBeNull()
    expect(result.months_exceeded).toBe(0)
    expect(result.months_on_track).toBe(0)
    expect(result.months_behind).toBe(0)
  })

  it('63. sums YTD actual revenue correctly', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, 10_000),
      makeTargetActual('2025-02', 12_000, 10_000),
      makeTargetActual('2025-03', 8_000, 10_000),
    ]
    const result = computeYtdSummary(rows, '2025-03')
    expect(result.ytd_actual_revenue).toBe(30_000)
  })

  it('64. sums YTD target revenue correctly', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, 10_000),
      makeTargetActual('2025-02', 12_000, 10_000),
    ]
    const result = computeYtdSummary(rows, '2025-06')
    expect(result.ytd_target_revenue).toBe(20_000)
  })

  it('65. filters months after currentYearMonth', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, 10_000),
      makeTargetActual('2025-02', 12_000, 10_000),
      makeTargetActual('2025-03', 8_000, 10_000),
    ]
    const result = computeYtdSummary(rows, '2025-02')
    expect(result.ytd_actual_revenue).toBe(22_000)
    expect(result.ytd_target_revenue).toBe(20_000)
  })

  it('66. includes currentYearMonth itself', () => {
    const rows = [makeTargetActual('2025-06', 15_000, 12_000)]
    const result = computeYtdSummary(rows, '2025-06')
    expect(result.ytd_actual_revenue).toBe(15_000)
  })

  it('67. counts months_exceeded (attainment >= 105%)', () => {
    const rows = [
      makeTargetActual('2025-01', 11_000, 10_000),  // 110% → exceeded
      makeTargetActual('2025-02', 10_500, 10_000),  // 105% → exceeded
      makeTargetActual('2025-03', 9_500, 10_000),   // 95%  → on_track
    ]
    const result = computeYtdSummary(rows, '2025-03')
    expect(result.months_exceeded).toBe(2)
  })

  it('68. counts months_on_track (90% <= attainment < 105%)', () => {
    const rows = [
      makeTargetActual('2025-01', 9_000, 10_000),  // 90% → on_track
      makeTargetActual('2025-02', 9_500, 10_000),  // 95% → on_track
    ]
    const result = computeYtdSummary(rows, '2025-02')
    expect(result.months_on_track).toBe(2)
  })

  it('69. counts months_behind (attainment < 90%)', () => {
    const rows = [
      makeTargetActual('2025-01', 8_000, 10_000),  // 80% → at_risk → behind
      makeTargetActual('2025-02', 4_000, 10_000),  // 40% → critical → behind
    ]
    const result = computeYtdSummary(rows, '2025-02')
    expect(result.months_behind).toBe(2)
  })

  it('70. null target months: excluded from target sum', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, null),
      makeTargetActual('2025-02', 10_000, 20_000),
    ]
    const result = computeYtdSummary(rows, '2025-02')
    expect(result.ytd_target_revenue).toBe(20_000)
    expect(result.ytd_actual_revenue).toBe(20_000)
  })

  it('71. ytd_attainment_pct calculation', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, 10_000),
      makeTargetActual('2025-02', 12_000, 10_000),
    ]
    const result = computeYtdSummary(rows, '2025-02')
    // actual=22k, target=20k → 110%
    expect(result.ytd_attainment_pct).toBeCloseTo(110)
  })

  it('72. ytd_variance calculation', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000, 10_000),
      makeTargetActual('2025-02', 8_000, 10_000),
    ]
    const result = computeYtdSummary(rows, '2025-02')
    // actual=18k, target=20k → variance=-2k
    expect(result.ytd_variance).toBe(-2_000)
  })
})

// ── computeRunRateProjection ──────────────────────────────────────────────────

describe('computeRunRateProjection', () => {
  it('73. basic run-rate: 60k in 6 months → 10k/month → 120k annual', () => {
    const result = computeRunRateProjection(60_000, 6, null)
    expect(result.monthly_run_rate).toBe(10_000)
    expect(result.annualized_projection).toBe(120_000)
    expect(result.vs_full_year_target_pct).toBeNull()
  })

  it('74. with full year target: 120k projection vs 100k target → 120%', () => {
    const result = computeRunRateProjection(60_000, 6, 100_000)
    expect(result.vs_full_year_target_pct).toBeCloseTo(120)
  })

  it('75. zero months elapsed returns zero run-rate', () => {
    const result = computeRunRateProjection(0, 0, null)
    expect(result.monthly_run_rate).toBe(0)
    expect(result.annualized_projection).toBe(0)
  })

  it('76. zero actual revenue', () => {
    const result = computeRunRateProjection(0, 3, 120_000)
    expect(result.monthly_run_rate).toBe(0)
    expect(result.annualized_projection).toBe(0)
    expect(result.vs_full_year_target_pct).toBe(0)
  })

  it('77. null full year target → vs_full_year_target_pct is null', () => {
    const result = computeRunRateProjection(50_000, 5, null)
    expect(result.vs_full_year_target_pct).toBeNull()
  })

  it('78. annualized = monthly_run_rate × 12', () => {
    const result = computeRunRateProjection(120_000, 12, null)
    expect(result.annualized_projection).toBe(result.monthly_run_rate * 12)
  })

  it('79. 1 month elapsed: run-rate = ytd revenue', () => {
    const result = computeRunRateProjection(25_000, 1, null)
    expect(result.monthly_run_rate).toBe(25_000)
    expect(result.annualized_projection).toBe(300_000)
  })
})

// ── classifyYtdPerformance ────────────────────────────────────────────────────

describe('classifyYtdPerformance', () => {
  it('80. null attainment → no_target', () => {
    expect(classifyYtdPerformance(null, 3, null)).toBe('no_target')
  })

  it('81. 105% → outperforming', () => {
    expect(classifyYtdPerformance(105, 3, null)).toBe('outperforming')
  })

  it('82. 130% → outperforming', () => {
    expect(classifyYtdPerformance(130, 6, 'improving')).toBe('outperforming')
  })

  it('83. 104.9% → on_track', () => {
    expect(classifyYtdPerformance(104.9, 3, null)).toBe('on_track')
  })

  it('84. 90% → on_track', () => {
    expect(classifyYtdPerformance(90, 3, null)).toBe('on_track')
  })

  it('85. 89.9% → slightly_behind', () => {
    expect(classifyYtdPerformance(89.9, 3, null)).toBe('slightly_behind')
  })

  it('86. 75% → slightly_behind', () => {
    expect(classifyYtdPerformance(75, 3, null)).toBe('slightly_behind')
  })

  it('87. 74.9% → behind', () => {
    expect(classifyYtdPerformance(74.9, 3, null)).toBe('behind')
  })

  it('88. 50% → behind', () => {
    expect(classifyYtdPerformance(50, 3, null)).toBe('behind')
  })

  it('89. 49.9% → critical', () => {
    expect(classifyYtdPerformance(49.9, 3, null)).toBe('critical')
  })

  it('90. 0% → critical', () => {
    expect(classifyYtdPerformance(0, 3, null)).toBe('critical')
  })

  it('91. trend parameter does not affect result (reserved for future)', () => {
    const r1 = classifyYtdPerformance(80, 3, 'improving')
    const r2 = classifyYtdPerformance(80, 3, 'declining')
    expect(r1).toBe(r2)
  })
})

// ── computeBestMonth ──────────────────────────────────────────────────────────

describe('computeBestMonth', () => {
  it('92. empty array returns null', () => {
    expect(computeBestMonth([])).toBeNull()
  })

  it('93. single month returns that month', () => {
    const rows = [makeTargetActual('2025-01', 5_000)]
    expect(computeBestMonth(rows)?.year_month).toBe('2025-01')
  })

  it('94. returns month with highest actual_revenue', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000),
      makeTargetActual('2025-02', 30_000),
      makeTargetActual('2025-03', 20_000),
    ]
    expect(computeBestMonth(rows)?.year_month).toBe('2025-02')
  })

  it('95. includes months with zero revenue', () => {
    const rows = [
      makeTargetActual('2025-01', 0),
      makeTargetActual('2025-02', 5_000),
    ]
    expect(computeBestMonth(rows)?.year_month).toBe('2025-02')
  })

  it('96. returns first match when tied', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000),
      makeTargetActual('2025-02', 10_000),
    ]
    // First encountered in reduce
    const result = computeBestMonth(rows)
    expect(result?.actual_revenue).toBe(10_000)
  })
})

// ── computeWorstMonth ─────────────────────────────────────────────────────────

describe('computeWorstMonth', () => {
  it('97. empty array returns null', () => {
    expect(computeWorstMonth([])).toBeNull()
  })

  it('98. all months have zero revenue → null (no data)', () => {
    const rows = [makeTargetActual('2025-01', 0), makeTargetActual('2025-02', 0)]
    expect(computeWorstMonth(rows)).toBeNull()
  })

  it('99. single month with revenue returns that month', () => {
    const rows = [makeTargetActual('2025-01', 5_000)]
    expect(computeWorstMonth(rows)?.year_month).toBe('2025-01')
  })

  it('100. returns month with lowest non-zero actual_revenue', () => {
    const rows = [
      makeTargetActual('2025-01', 10_000),
      makeTargetActual('2025-02', 30_000),
      makeTargetActual('2025-03', 5_000),
    ]
    expect(computeWorstMonth(rows)?.year_month).toBe('2025-03')
  })

  it('101. skips months with zero revenue', () => {
    const rows = [
      makeTargetActual('2025-01', 0),
      makeTargetActual('2025-02', 15_000),
      makeTargetActual('2025-03', 20_000),
    ]
    expect(computeWorstMonth(rows)?.year_month).toBe('2025-02')
  })
})

// ── computeConsecutiveAboveTarget ─────────────────────────────────────────────

describe('computeConsecutiveAboveTarget', () => {
  it('102. empty array → 0', () => {
    expect(computeConsecutiveAboveTarget([])).toBe(0)
  })

  it('103. no targets → 0', () => {
    const rows = [makeTargetActual('2025-01', 10_000, null)]
    expect(computeConsecutiveAboveTarget(rows)).toBe(0)
  })

  it('104. all months above target → full streak', () => {
    const rows = [
      makeTargetActual('2025-01', 11_000, 10_000),
      makeTargetActual('2025-02', 12_000, 10_000),
      makeTargetActual('2025-03', 10_500, 10_000),
    ]
    expect(computeConsecutiveAboveTarget(rows)).toBe(3)
  })

  it('105. streak breaks in the middle (gap in most recent months)', () => {
    const rows = [
      makeTargetActual('2025-01', 11_000, 10_000),  // above
      makeTargetActual('2025-02', 8_000, 10_000),   // below — breaks streak from recent end
      makeTargetActual('2025-03', 11_000, 10_000),  // above (most recent)
    ]
    // From most recent: Mar=above(1), Feb=below(break) → streak=1
    expect(computeConsecutiveAboveTarget(rows)).toBe(1)
  })

  it('106. most recent month below target → 0', () => {
    const rows = [
      makeTargetActual('2025-01', 11_000, 10_000),
      makeTargetActual('2025-02', 8_000, 10_000),
    ]
    expect(computeConsecutiveAboveTarget(rows)).toBe(0)
  })

  it('107. exactly 100% attainment counts as above', () => {
    const rows = [makeTargetActual('2025-01', 10_000, 10_000)]
    expect(computeConsecutiveAboveTarget(rows)).toBe(1)
  })

  it('108. 99.9% does not count', () => {
    const rows = [makeTargetActual('2025-01', 9_999, 10_000)]
    expect(computeConsecutiveAboveTarget(rows)).toBe(0)
  })

  it('109. streak from 2 most recent months', () => {
    const rows = [
      makeTargetActual('2025-01', 8_000, 10_000),  // below
      makeTargetActual('2025-02', 11_000, 10_000), // above
      makeTargetActual('2025-03', 12_000, 10_000), // above
    ]
    expect(computeConsecutiveAboveTarget(rows)).toBe(2)
  })
})

// ── generateTargetNarrative ───────────────────────────────────────────────────

describe('generateTargetNarrative', () => {
  it('110. outperforming → Turkish success message', () => {
    const result = generateTargetNarrative('outperforming', 110, 3, 6)
    expect(result).toBe('YTD performansı hedeflerin üzerinde — başarılı bir dönem.')
  })

  it('111. on_track → Turkish on-track message', () => {
    const result = generateTargetNarrative('on_track', 95, 0, 4)
    expect(result).toBe('Satış hedeflerine büyük ölçüde ulaşılıyor — izleme devam etmeli.')
  })

  it('112. slightly_behind → Turkish recoverable message', () => {
    const result = generateTargetNarrative('slightly_behind', 80, 0, 5)
    expect(result).toBe('Hafif geride kalınıyor — kalan dönemde telafi edilebilir düzeyde.')
  })

  it('113. behind → Turkish action-needed message', () => {
    const result = generateTargetNarrative('behind', 60, 0, 5)
    expect(result).toBe('Hedeflerin belirgin şekilde gerisinde — aksiyona gerek var.')
  })

  it('114. critical → Turkish urgent intervention message', () => {
    const result = generateTargetNarrative('critical', 30, 0, 3)
    expect(result).toBe('Kritik: Satış hedeflerine ulaşmak için ivedi müdahale gerekiyor.')
  })

  it('115. no_target → Turkish no-target message', () => {
    const result = generateTargetNarrative('no_target', null, 0, 0)
    expect(result).toBe('Satış hedefi tanımlanmamış — performans değerlendirmesi mümkün değil.')
  })

  it('116. all narratives are non-empty strings', () => {
    const statuses = ['outperforming', 'on_track', 'slightly_behind', 'behind', 'critical', 'no_target'] as const
    for (const s of statuses) {
      const r = generateTargetNarrative(s, null, 0, 0)
      expect(typeof r).toBe('string')
      expect(r.length).toBeGreaterThan(0)
    }
  })

  it('117. consecutive months above target does not change narrative text', () => {
    const r1 = generateTargetNarrative('outperforming', 110, 0, 6)
    const r2 = generateTargetNarrative('outperforming', 110, 5, 6)
    expect(r1).toBe(r2)
  })
})

// ── Integration-style tests ───────────────────────────────────────────────────

describe('integration: buildMonthlyTargetActuals + computeYtdSummary', () => {
  it('118. full year with mixed performance', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 1, revenue_target: 100_000, unit_target: null, deal_target: null },
      { year: 2025, month: 2, revenue_target: 100_000, unit_target: null, deal_target: null },
      { year: 2025, month: 3, revenue_target: 100_000, unit_target: null, deal_target: null },
    ]
    const actuals = makeActualsMap([
      ['2025-01', { revenue: 110_000, units: 0, deals: 0 }],
      ['2025-02', { revenue: 95_000, units: 0, deals: 0 }],
      ['2025-03', { revenue: 80_000, units: 0, deals: 0 }],
    ])
    const monthlyRows = buildMonthlyTargetActuals(targets, actuals)
    const ytd = computeYtdSummary(monthlyRows, '2025-03')

    expect(ytd.ytd_actual_revenue).toBe(285_000)
    expect(ytd.ytd_target_revenue).toBe(300_000)
    expect(ytd.ytd_attainment_pct).toBeCloseTo(95)
    expect(ytd.ytd_variance).toBe(-15_000)
    expect(ytd.months_exceeded).toBe(1)   // Jan: 110%
    expect(ytd.months_on_track).toBe(1)   // Feb: 95%
    expect(ytd.months_behind).toBe(1)     // Mar: 80% → at_risk
  })

  it('119. computeBestMonth and computeWorstMonth on joined data', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 1, revenue_target: 50_000, unit_target: null, deal_target: null },
      { year: 2025, month: 2, revenue_target: 50_000, unit_target: null, deal_target: null },
      { year: 2025, month: 3, revenue_target: 50_000, unit_target: null, deal_target: null },
    ]
    const actuals = makeActualsMap([
      ['2025-01', { revenue: 20_000, units: 0, deals: 0 }],
      ['2025-02', { revenue: 70_000, units: 0, deals: 0 }],
      ['2025-03', { revenue: 45_000, units: 0, deals: 0 }],
    ])
    const rows = buildMonthlyTargetActuals(targets, actuals)
    expect(computeBestMonth(rows)?.year_month).toBe('2025-02')
    expect(computeWorstMonth(rows)?.year_month).toBe('2025-01')
  })

  it('120. computeConsecutiveAboveTarget with joined data', () => {
    const targets: TargetPeriod[] = [
      { year: 2025, month: 1, revenue_target: 10_000, unit_target: null, deal_target: null },
      { year: 2025, month: 2, revenue_target: 10_000, unit_target: null, deal_target: null },
      { year: 2025, month: 3, revenue_target: 10_000, unit_target: null, deal_target: null },
      { year: 2025, month: 4, revenue_target: 10_000, unit_target: null, deal_target: null },
    ]
    const actuals = makeActualsMap([
      ['2025-01', { revenue: 9_000, units: 0, deals: 0 }],   // below
      ['2025-02', { revenue: 11_000, units: 0, deals: 0 }],  // above
      ['2025-03', { revenue: 12_000, units: 0, deals: 0 }],  // above
      ['2025-04', { revenue: 13_000, units: 0, deals: 0 }],  // above
    ])
    const rows = buildMonthlyTargetActuals(targets, actuals)
    // 3 consecutive from most recent
    expect(computeConsecutiveAboveTarget(rows)).toBe(3)
  })
})
