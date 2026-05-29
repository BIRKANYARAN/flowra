/**
 * Period Performance Comparison — unit tests
 *
 * Tests all pure computation functions exported from
 * lib/services/finance/period-comparison.service.ts
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeChangePct,
  computeChangeAbsolute,
  classifySignificance,
  isFavorableMetricChange,
  buildMetricComparison,
  buildPeriodMetrics,
  determineOverallTrend,
  generateComparisonHeadline,
  identifyKeyDriver,
  buildPeriodComparison,
  computeTrendStreak,
  computeCmgr,
  findBestMonth,
  findWorstMonth,
  // New spec-required functions
  computeAbsoluteChange,
  computePercentageChange,
  classifyGrowthDirection,
  computeYoyChange,
  computeMomChange,
  computeRolling3mAvg,
  computeRolling3mTotal,
  computeTrendAcceleration,
  classifyTrendMomentum,
  computeSeasonalityIndex,
  computeRunRate,
  classifyRunRateVsTarget,
  computeGrossMarginTrend,
  generatePeriodComparisonNarrative,
} from '../lib/services/finance/period-comparison.service'

// ── computeChangePct ──────────────────────────────────────────────────────────

describe('computeChangePct', () => {

  // 1
  it('1. prior = 0 → returns 0 (no Infinity/NaN)', () => {
    expect(computeChangePct(100, 0)).toBe(0)
  })

  // 2
  it('2. both 0 → returns 0', () => {
    expect(computeChangePct(0, 0)).toBe(0)
  })

  // 3
  it('3. positive change → positive percentage', () => {
    expect(computeChangePct(110, 100)).toBeCloseTo(10)
  })

  // 4
  it('4. negative change → negative percentage', () => {
    expect(computeChangePct(90, 100)).toBeCloseTo(-10)
  })

  // 5
  it('5. no change → 0%', () => {
    expect(computeChangePct(100, 100)).toBeCloseTo(0)
  })

  // 6
  it('6. 50% increase', () => {
    expect(computeChangePct(150, 100)).toBeCloseTo(50)
  })

  // 7
  it('7. 100% increase (doubling)', () => {
    expect(computeChangePct(200, 100)).toBeCloseTo(100)
  })

  // 8
  it('8. negative prior → uses absolute value in denominator', () => {
    // change = (50 - (-100)) / 100 * 100 = 150%
    expect(computeChangePct(50, -100)).toBeCloseTo(150)
  })
})

// ── computeChangeAbsolute ─────────────────────────────────────────────────────

describe('computeChangeAbsolute', () => {

  // 9
  it('9. positive change', () => {
    expect(computeChangeAbsolute(150, 100)).toBe(50)
  })

  // 10
  it('10. negative change', () => {
    expect(computeChangeAbsolute(80, 100)).toBe(-20)
  })

  // 11
  it('11. no change', () => {
    expect(computeChangeAbsolute(100, 100)).toBe(0)
  })

  // 12
  it('12. both zero', () => {
    expect(computeChangeAbsolute(0, 0)).toBe(0)
  })
})

// ── classifySignificance ──────────────────────────────────────────────────────

describe('classifySignificance', () => {

  // 13
  it('13. >10% → material', () => {
    expect(classifySignificance(15)).toBe('material')
  })

  // 14
  it('14. exactly 10% → moderate (not material)', () => {
    expect(classifySignificance(10)).toBe('moderate')
  })

  // 15
  it('15. 5% → moderate', () => {
    expect(classifySignificance(5)).toBe('moderate')
  })

  // 16
  it('16. exactly 3% → minor (not moderate)', () => {
    expect(classifySignificance(3)).toBe('minor')
  })

  // 17
  it('17. 1% → minor', () => {
    expect(classifySignificance(1)).toBe('minor')
  })

  // 18
  it('18. 0% → minor', () => {
    expect(classifySignificance(0)).toBe('minor')
  })

  // 19
  it('19. negative 15% → material (uses absolute value)', () => {
    expect(classifySignificance(-15)).toBe('material')
  })

  // 20
  it('20. negative 4% → moderate (uses absolute value)', () => {
    expect(classifySignificance(-4)).toBe('moderate')
  })

  // 21
  it('21. negative 2% → minor (uses absolute value)', () => {
    expect(classifySignificance(-2)).toBe('minor')
  })
})

// ── isFavorableMetricChange ───────────────────────────────────────────────────

describe('isFavorableMetricChange', () => {

  // 22
  it('22. revenue_try up → favorable', () => {
    expect(isFavorableMetricChange('revenue_try', 10)).toBe(true)
  })

  // 23
  it('23. revenue_try down → unfavorable', () => {
    expect(isFavorableMetricChange('revenue_try', -10)).toBe(false)
  })

  // 24
  it('24. expenses_try up → unfavorable (higher = bad)', () => {
    expect(isFavorableMetricChange('expenses_try', 10)).toBe(false)
  })

  // 25
  it('25. expenses_try down → favorable', () => {
    expect(isFavorableMetricChange('expenses_try', -10)).toBe(true)
  })

  // 26
  it('26. expense_ratio_pct up → unfavorable', () => {
    expect(isFavorableMetricChange('expense_ratio_pct', 5)).toBe(false)
  })

  // 27
  it('27. expense_ratio_pct down → favorable', () => {
    expect(isFavorableMetricChange('expense_ratio_pct', -5)).toBe(true)
  })

  // 28
  it('28. gross_profit_try up → favorable', () => {
    expect(isFavorableMetricChange('gross_profit_try', 20)).toBe(true)
  })

  // 29
  it('29. net_income_try down → unfavorable', () => {
    expect(isFavorableMetricChange('net_income_try', -5)).toBe(false)
  })

  // 30
  it('30. gross_margin_pct up → favorable', () => {
    expect(isFavorableMetricChange('gross_margin_pct', 3)).toBe(true)
  })

  // 31
  it('31. zero change → unfavorable for revenue (0 is not > 0)', () => {
    expect(isFavorableMetricChange('revenue_try', 0)).toBe(false)
  })
})

// ── buildMetricComparison ─────────────────────────────────────────────────────

describe('buildMetricComparison', () => {

  // 32
  it('32. all fields computed correctly for revenue increase', () => {
    const c = buildMetricComparison('revenue_try', 'Ciro', 110_000, 100_000)
    expect(c.metric_name).toBe('revenue_try')
    expect(c.label).toBe('Ciro')
    expect(c.current_value).toBe(110_000)
    expect(c.prior_value).toBe(100_000)
    expect(c.change_absolute).toBe(10_000)
    expect(c.change_pct).toBeCloseTo(10)
    expect(c.is_favorable).toBe(true)
    // 10% is NOT > 10, so it's moderate
    expect(c.significance).toBe('moderate')
  })

  // 33
  it('33. significance is material for >10% change', () => {
    const c = buildMetricComparison('revenue_try', 'Ciro', 125_000, 100_000)
    expect(c.change_pct).toBeCloseTo(25)
    expect(c.significance).toBe('material')
  })

  // 34
  it('34. expense increase → is_favorable = false', () => {
    const c = buildMetricComparison('expenses_try', 'Giderler', 60_000, 50_000)
    expect(c.is_favorable).toBe(false)
    expect(c.change_absolute).toBe(10_000)
  })

  // 35
  it('35. prior = 0 → change_pct = 0, no Infinity', () => {
    const c = buildMetricComparison('revenue_try', 'Ciro', 50_000, 0)
    expect(c.change_pct).toBe(0)
    expect(Number.isFinite(c.change_pct)).toBe(true)
  })

  // 36
  it('36. zero change → significance minor', () => {
    const c = buildMetricComparison('revenue_try', 'Ciro', 100_000, 100_000)
    expect(c.change_pct).toBeCloseTo(0)
    expect(c.significance).toBe('minor')
  })
})

// ── buildPeriodMetrics ────────────────────────────────────────────────────────

describe('buildPeriodMetrics', () => {

  // 37
  it('37. correct period key stored', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    expect(m.period).toBe('2025-01')
  })

  // 38
  it('38. net_income = revenue - expenses', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    expect(m.net_income_try).toBe(40_000)
  })

  // 39
  it('39. gross_profit uses COGS estimate at 40% of revenue when not provided', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    // cogs = 40_000, gross_profit = 100_000 - 40_000 = 60_000
    expect(m.gross_profit_try).toBe(60_000)
  })

  // 40
  it('40. custom COGS estimate used when provided', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10, 30_000)
    expect(m.gross_profit_try).toBe(70_000)
  })

  // 41
  it('41. gross_margin_pct = gross_profit / revenue * 100', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    // gross_profit = 60_000, margin = 60%
    expect(m.gross_margin_pct).toBeCloseTo(60)
  })

  // 42
  it('42. net_margin_pct = net_income / revenue * 100', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    // net_income = 40_000, margin = 40%
    expect(m.net_margin_pct).toBeCloseTo(40)
  })

  // 43
  it('43. expense_ratio_pct = expenses / revenue * 100', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 60_000, 10)
    expect(m.expense_ratio_pct).toBeCloseTo(60)
  })

  // 44
  it('44. revenue = 0 → margins are 0', () => {
    const m = buildPeriodMetrics('2025-01', 0, 10_000, 0)
    expect(m.gross_margin_pct).toBe(0)
    expect(m.net_margin_pct).toBe(0)
    expect(m.expense_ratio_pct).toBe(0)
  })

  // 45
  it('45. avg_monthly_revenue = revenue for single month (monthsInPeriod = 1)', () => {
    const m = buildPeriodMetrics('2025-01', 120_000, 60_000, 10)
    expect(m.avg_monthly_revenue).toBe(120_000)
  })

  // 46
  it('46. avg_monthly_revenue = revenue / months for YTD', () => {
    const m = buildPeriodMetrics('YTD-2025', 360_000, 180_000, 30, undefined, 3)
    expect(m.avg_monthly_revenue).toBe(120_000)
  })

  // 47
  it('47. avg_order_value = revenue / orderCount', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 40_000, 10)
    expect(m.avg_order_value).toBe(10_000)
  })

  // 48
  it('48. avg_order_value = 0 when orderCount = 0', () => {
    const m = buildPeriodMetrics('2025-01', 100_000, 40_000, 0)
    expect(m.avg_order_value).toBe(0)
  })
})

// ── determineOverallTrend ─────────────────────────────────────────────────────

describe('determineOverallTrend', () => {

  function makeMetrics(period: string, revenue: number, netMarginPct: number) {
    // Build metrics with known net margin: set expenses so net_income = revenue * (netMarginPct/100)
    const expenses = revenue - (revenue * netMarginPct / 100)
    return buildPeriodMetrics(period, revenue, expenses, 10)
  }

  // 49
  it('49. revenue up AND margin improved → improving', () => {
    const cur  = makeMetrics('2025-05', 120_000, 30)
    const prev = makeMetrics('2025-04', 100_000, 20)
    expect(determineOverallTrend(cur, prev)).toBe('improving')
  })

  // 50
  it('50. revenue down → declining', () => {
    const cur  = makeMetrics('2025-05', 80_000, 30)
    const prev = makeMetrics('2025-04', 100_000, 20)
    expect(determineOverallTrend(cur, prev)).toBe('declining')
  })

  // 51
  it('51. revenue up but margin degraded > 5pp → declining', () => {
    const cur  = makeMetrics('2025-05', 120_000, 10)  // 10% net margin
    const prev = makeMetrics('2025-04', 100_000, 20)  // 20% net margin — degraded 10pp
    expect(determineOverallTrend(cur, prev)).toBe('declining')
  })

  // 52
  it('52. revenue up but margin flat → stable', () => {
    const cur  = makeMetrics('2025-05', 110_000, 20)
    const prev = makeMetrics('2025-04', 100_000, 20)
    expect(determineOverallTrend(cur, prev)).toBe('stable')
  })

  // 53
  it('53. both same → stable', () => {
    const cur  = makeMetrics('2025-05', 100_000, 20)
    const prev = makeMetrics('2025-04', 100_000, 20)
    expect(determineOverallTrend(cur, prev)).toBe('stable')
  })
})

// ── generateComparisonHeadline ────────────────────────────────────────────────

describe('generateComparisonHeadline', () => {

  function makeMetrics(period: string, revenue: number, expenses: number) {
    return buildPeriodMetrics(period, revenue, expenses, 10)
  }

  // 54
  it('54. mom comparison → non-empty Turkish string', () => {
    const cur  = makeMetrics('2025-05', 120_000, 70_000)
    const prev = makeMetrics('2025-04', 100_000, 60_000)
    const h = generateComparisonHeadline('mom', cur, prev)
    expect(typeof h).toBe('string')
    expect(h.length).toBeGreaterThan(0)
  })

  // 55
  it('55. yoy comparison → non-empty Turkish string', () => {
    const cur  = makeMetrics('2025-05', 130_000, 70_000)
    const prev = makeMetrics('2024-05', 100_000, 60_000)
    const h = generateComparisonHeadline('yoy', cur, prev)
    expect(h.length).toBeGreaterThan(0)
    expect(typeof h).toBe('string')
  })

  // 56
  it('56. ytd comparison → non-empty Turkish string', () => {
    const cur  = makeMetrics('YTD-2025', 500_000, 300_000)
    const prev = makeMetrics('YTD-2024', 450_000, 270_000)
    const h = generateComparisonHeadline('ytd', cur, prev)
    expect(h.length).toBeGreaterThan(0)
  })

  // 57
  it('57. prior revenue = 0 → returns fallback string', () => {
    const cur  = makeMetrics('2025-05', 100_000, 50_000)
    const prev = makeMetrics('2025-04', 0, 0)
    const h = generateComparisonHeadline('mom', cur, prev)
    expect(h.length).toBeGreaterThan(0)
  })
})

// ── identifyKeyDriver ─────────────────────────────────────────────────────────

describe('identifyKeyDriver', () => {

  // 58
  it('58. empty comparisons → fallback string', () => {
    const result = identifyKeyDriver([])
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  // 59
  it('59. finds the most material comparison (highest |change_pct|)', () => {
    const comparisons = [
      buildMetricComparison('revenue_try',   'Ciro',    120_000, 100_000), // 20%
      buildMetricComparison('expenses_try',  'Giderler', 60_000,  50_000), // 20%
      buildMetricComparison('net_income_try','Net Gelir', 30_000, 10_000), // 200%
    ]
    const driver = identifyKeyDriver(comparisons)
    expect(driver).toContain('Net Gelir')
  })

  // 60
  it('60. returns Turkish string', () => {
    const comparisons = [
      buildMetricComparison('revenue_try', 'Ciro', 110_000, 100_000),
    ]
    const driver = identifyKeyDriver(comparisons)
    expect(typeof driver).toBe('string')
    expect(driver.length).toBeGreaterThan(0)
  })
})

// ── buildPeriodComparison ─────────────────────────────────────────────────────

describe('buildPeriodComparison', () => {

  function makeMetrics(period: string, revenue: number, expenses: number) {
    return buildPeriodMetrics(period, revenue, expenses, 10)
  }

  // 61
  it('61. all comparisons built (6 key metrics)', () => {
    const cur  = makeMetrics('2025-05', 120_000, 70_000)
    const prev = makeMetrics('2025-04', 100_000, 60_000)
    const comp = buildPeriodComparison('mom', cur, prev)
    expect(comp.comparisons.length).toBe(6)
  })

  // 62
  it('62. headline is non-empty string', () => {
    const cur  = makeMetrics('2025-05', 120_000, 70_000)
    const prev = makeMetrics('2025-04', 100_000, 60_000)
    const comp = buildPeriodComparison('mom', cur, prev)
    expect(typeof comp.headline).toBe('string')
    expect(comp.headline.length).toBeGreaterThan(0)
  })

  // 63
  it('63. comparison_type is set correctly', () => {
    const cur  = makeMetrics('2025-05', 120_000, 70_000)
    const prev = makeMetrics('2024-05', 100_000, 60_000)
    const comp = buildPeriodComparison('yoy', cur, prev)
    expect(comp.comparison_type).toBe('yoy')
  })

  // 64
  it('64. overall_trend is one of the valid values', () => {
    const cur  = makeMetrics('2025-05', 120_000, 70_000)
    const prev = makeMetrics('2025-04', 100_000, 60_000)
    const comp = buildPeriodComparison('mom', cur, prev)
    expect(['improving', 'stable', 'declining']).toContain(comp.overall_trend)
  })
})

// ── computeTrendStreak ────────────────────────────────────────────────────────

describe('computeTrendStreak', () => {

  function mkMetrics(period: string, revenue: number) {
    return buildPeriodMetrics(period, revenue, revenue * 0.5, 5)
  }

  // 65
  it('65. single entry → 0 (no streak)', () => {
    expect(computeTrendStreak([mkMetrics('2025-01', 100)])).toBe(0)
  })

  // 66
  it('66. empty array → 0', () => {
    expect(computeTrendStreak([])).toBe(0)
  })

  // 67
  it('67. three consecutive improving months → positive streak', () => {
    const series = [
      mkMetrics('2025-01', 100),
      mkMetrics('2025-02', 110),
      mkMetrics('2025-03', 120),
    ]
    expect(computeTrendStreak(series)).toBeGreaterThan(0)
  })

  // 68
  it('68. three consecutive declining months → negative streak', () => {
    const series = [
      mkMetrics('2025-01', 120),
      mkMetrics('2025-02', 110),
      mkMetrics('2025-03', 100),
    ]
    expect(computeTrendStreak(series)).toBeLessThan(0)
  })

  // 69
  it('69. mixed trend → streak breaks and returns partial count from end', () => {
    const series = [
      mkMetrics('2025-01', 100),
      mkMetrics('2025-02', 80),  // decline
      mkMetrics('2025-03', 110), // improve
      mkMetrics('2025-04', 120), // improve
    ]
    // From end: 120 > 110, 110 > 80 = both improving (streak = +2), then 80 < 100 breaks
    const streak = computeTrendStreak(series)
    expect(streak).toBeGreaterThan(0)
  })

  // 70
  it('70. exact two entries, first > second → -1 streak', () => {
    const series = [
      mkMetrics('2025-01', 100),
      mkMetrics('2025-02', 90),
    ]
    expect(computeTrendStreak(series)).toBe(-1)
  })
})

// ── computeCmgr ───────────────────────────────────────────────────────────────

describe('computeCmgr', () => {

  // 71
  it('71. first = 0 → null', () => {
    expect(computeCmgr(0, 100_000, 6)).toBeNull()
  })

  // 72
  it('72. months = 1 → null (n = 0, need at least 2 months)', () => {
    expect(computeCmgr(100_000, 120_000, 1)).toBeNull()
  })

  // 73
  it('73. months = 0 → null', () => {
    expect(computeCmgr(100_000, 120_000, 0)).toBeNull()
  })

  // 74
  it('74. correct CMGR for known 10% monthly growth over 3 months (returns fraction)', () => {
    // first = 100, last = 121, months = 3
    // CMGR = (121/100)^(1/3) - 1 ≈ 0.0656 (as fraction)
    const result = computeCmgr(100, 121, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
    expect(result!).toBeLessThan(1)
  })

  // 75
  it('75. equal first and last → CMGR = 0%', () => {
    const result = computeCmgr(100_000, 100_000, 6)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0)
  })

  // 76
  it('76. last < first → negative CMGR', () => {
    const result = computeCmgr(100_000, 50_000, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })
})

// ── findBestMonth / findWorstMonth ────────────────────────────────────────────

describe('findBestMonth', () => {

  function mkMetrics(period: string, revenue: number) {
    return buildPeriodMetrics(period, revenue, revenue * 0.5, 5)
  }

  // 77
  it('77. returns null for empty array', () => {
    expect(findBestMonth([])).toBeNull()
  })

  // 78
  it('78. returns the single entry for single-element array', () => {
    const m = mkMetrics('2025-01', 100_000)
    expect(findBestMonth([m])).toBe(m)
  })

  // 79
  it('79. returns the month with highest revenue', () => {
    const series = [
      mkMetrics('2025-01', 80_000),
      mkMetrics('2025-02', 150_000),
      mkMetrics('2025-03', 120_000),
    ]
    const best = findBestMonth(series)
    expect(best?.period).toBe('2025-02')
    expect(best?.revenue_try).toBe(150_000)
  })
})

describe('findWorstMonth', () => {

  function mkMetrics(period: string, revenue: number) {
    return buildPeriodMetrics(period, revenue, revenue * 0.5, 5)
  }

  // 80
  it('80. returns null for empty array', () => {
    expect(findWorstMonth([])).toBeNull()
  })

  // 81
  it('81. returns the single entry for single-element array', () => {
    const m = mkMetrics('2025-01', 100_000)
    expect(findWorstMonth([m])).toBe(m)
  })

  // 82
  it('82. returns the month with lowest revenue', () => {
    const series = [
      mkMetrics('2025-01', 80_000),
      mkMetrics('2025-02', 150_000),
      mkMetrics('2025-03', 40_000),
    ]
    const worst = findWorstMonth(series)
    expect(worst?.period).toBe('2025-03')
    expect(worst?.revenue_try).toBe(40_000)
  })

  // 83
  it('83. all equal → returns some entry with same revenue', () => {
    const series = [
      mkMetrics('2025-01', 100_000),
      mkMetrics('2025-02', 100_000),
    ]
    const worst = findWorstMonth(series)
    expect(worst?.revenue_try).toBe(100_000)
  })
})

// ── Integration: 6-month series ───────────────────────────────────────────────

describe('Integration: 6-month series with known growth', () => {

  // Build a 6-month series with consistent 10% MoM growth
  const series = [
    buildPeriodMetrics('2025-01', 100_000, 55_000, 10),
    buildPeriodMetrics('2025-02', 110_000, 60_500, 11),
    buildPeriodMetrics('2025-03', 121_000, 66_550, 12),
    buildPeriodMetrics('2025-04', 133_100, 73_205, 13),
    buildPeriodMetrics('2025-05', 146_410, 80_525, 14),
    buildPeriodMetrics('2025-06', 161_051, 88_578, 15),
  ]

  // 84
  it('84. CMGR is positive fraction for consistent 10% MoM growth', () => {
    const cmgr = computeCmgr(series[0].revenue_try, series[series.length - 1].revenue_try, series.length)
    expect(cmgr).not.toBeNull()
    // Returns as fraction (not percentage): ~0.08 for 10% MoM over 6 months
    expect(cmgr!).toBeGreaterThan(0)
    expect(cmgr!).toBeLessThan(1)
  })

  // 85
  it('85. trend streak is positive (all months growing)', () => {
    const streak = computeTrendStreak(series)
    expect(streak).toBeGreaterThan(0)
  })

  // 86
  it('86. best month is the last one', () => {
    const best = findBestMonth(series)
    expect(best?.period).toBe('2025-06')
  })

  // 87
  it('87. worst month is the first one', () => {
    const worst = findWorstMonth(series)
    expect(worst?.period).toBe('2025-01')
  })

  // 88
  it('88. buildPeriodComparison for last two months shows improving or stable trend', () => {
    const last  = series[series.length - 1]
    const prior = series[series.length - 2]
    const comp  = buildPeriodComparison('mom', last, prior)
    // Revenue is growing, so should be improving or stable
    expect(['improving', 'stable']).toContain(comp.overall_trend)
  })

  // 89
  it('89. revenue comparisons show positive change_pct for growing months', () => {
    const last  = series[series.length - 1]
    const prior = series[series.length - 2]
    const comp  = buildPeriodComparison('mom', last, prior)
    const revComp = comp.comparisons.find(c => c.metric_name === 'revenue_try')
    expect(revComp?.change_pct).toBeGreaterThan(0)
    expect(revComp?.is_favorable).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// NEW SPEC-REQUIRED FUNCTIONS (Batch-36)
// ═══════════════════════════════════════════════════════════════════════════

// ── computeAbsoluteChange ─────────────────────────────────────────────────────

describe('computeAbsoluteChange', () => {

  // 90
  it('90. positive result when current > prior', () => {
    expect(computeAbsoluteChange(150, 100)).toBe(50)
  })

  // 91
  it('91. negative result when current < prior', () => {
    expect(computeAbsoluteChange(80, 100)).toBe(-20)
  })

  // 92
  it('92. zero when equal', () => {
    expect(computeAbsoluteChange(100, 100)).toBe(0)
  })

  // 93
  it('93. both zero → zero', () => {
    expect(computeAbsoluteChange(0, 0)).toBe(0)
  })

  // 94
  it('94. handles fractional values', () => {
    expect(computeAbsoluteChange(100.5, 100)).toBeCloseTo(0.5)
  })
})

// ── computePercentageChange ───────────────────────────────────────────────────

describe('computePercentageChange', () => {

  // 95
  it('95. prior = 0 → null (not zero)', () => {
    expect(computePercentageChange(100, 0)).toBeNull()
  })

  // 96
  it('96. both zero → null', () => {
    expect(computePercentageChange(0, 0)).toBeNull()
  })

  // 97
  it('97. 10% growth', () => {
    expect(computePercentageChange(110, 100)).toBeCloseTo(10)
  })

  // 98
  it('98. 10% decline', () => {
    expect(computePercentageChange(90, 100)).toBeCloseTo(-10)
  })

  // 99
  it('99. exact formula: (current - prior) / |prior| × 100', () => {
    // (75 - 50) / 50 * 100 = 50
    expect(computePercentageChange(75, 50)).toBeCloseTo(50)
  })

  // 100
  it('100. negative prior uses absolute value in denominator', () => {
    // (50 - (-100)) / 100 * 100 = 150
    expect(computePercentageChange(50, -100)).toBeCloseTo(150)
  })
})

// ── classifyGrowthDirection ───────────────────────────────────────────────────

describe('classifyGrowthDirection', () => {

  // 101
  it('101. null → insufficient_data', () => {
    expect(classifyGrowthDirection(null)).toBe('insufficient_data')
  })

  // 102
  it('102. exactly 20 → growth (not strong_growth, boundary is >20)', () => {
    expect(classifyGrowthDirection(20)).toBe('growth')
  })

  // 103
  it('103. 20.1 → strong_growth', () => {
    expect(classifyGrowthDirection(20.1)).toBe('strong_growth')
  })

  // 104
  it('104. exactly 5 → flat (not growth, boundary is >5)', () => {
    expect(classifyGrowthDirection(5)).toBe('flat')
  })

  // 105
  it('105. 5.1 → growth', () => {
    expect(classifyGrowthDirection(5.1)).toBe('growth')
  })

  // 106
  it('106. exactly -5 → flat (boundary is >= -5)', () => {
    expect(classifyGrowthDirection(-5)).toBe('flat')
  })

  // 107
  it('107. -5.1 → decline', () => {
    expect(classifyGrowthDirection(-5.1)).toBe('decline')
  })

  // 108
  it('108. exactly -20 → decline (boundary is >= -20)', () => {
    expect(classifyGrowthDirection(-20)).toBe('decline')
  })

  // 109
  it('109. -20.1 → strong_decline', () => {
    expect(classifyGrowthDirection(-20.1)).toBe('strong_decline')
  })

  // 110
  it('110. 0 → flat', () => {
    expect(classifyGrowthDirection(0)).toBe('flat')
  })
})

// ── computeCmgr (new spec: fraction, not %) ───────────────────────────────────

describe('computeCmgr (new spec)', () => {

  // 111
  it('111. firstValue = 0 → null', () => {
    expect(computeCmgr(0, 100, 3)).toBeNull()
  })

  // 112
  it('112. firstValue negative → null', () => {
    expect(computeCmgr(-100, 100, 3)).toBeNull()
  })

  // 113
  it('113. months = 0 → null', () => {
    expect(computeCmgr(100, 200, 0)).toBeNull()
  })

  // 114
  it('114. months negative → null', () => {
    expect(computeCmgr(100, 200, -1)).toBeNull()
  })

  // 115
  it('115. growth scenario: 100→121 over 2 months ≈ 10% per month (as fraction ~0.10)', () => {
    // (121/100)^(1/2) - 1 ≈ 0.1
    const result = computeCmgr(100, 121, 2)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0.1, 2)
  })

  // 116
  it('116. decline scenario: result is negative fraction', () => {
    const result = computeCmgr(100, 64, 2)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  // 117
  it('117. equal first and last → 0', () => {
    const result = computeCmgr(100, 100, 6)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0)
  })
})

// ── computeYoyChange / computeMomChange ───────────────────────────────────────

describe('computeYoyChange', () => {

  // 118
  it('118. prior year = 0 → null', () => {
    expect(computeYoyChange(100, 0)).toBeNull()
  })

  // 119
  it('119. 20% growth YoY', () => {
    expect(computeYoyChange(120, 100)).toBeCloseTo(20)
  })

  // 120
  it('120. 20% decline YoY', () => {
    expect(computeYoyChange(80, 100)).toBeCloseTo(-20)
  })
})

describe('computeMomChange', () => {

  // 121
  it('121. prior month = 0 → null', () => {
    expect(computeMomChange(100, 0)).toBeNull()
  })

  // 122
  it('122. 10% MoM growth', () => {
    expect(computeMomChange(110, 100)).toBeCloseTo(10)
  })

  // 123
  it('123. 10% MoM decline', () => {
    expect(computeMomChange(90, 100)).toBeCloseTo(-10)
  })
})

// ── computeRolling3mAvg ───────────────────────────────────────────────────────

describe('computeRolling3mAvg', () => {

  // 124
  it('124. empty array → null', () => {
    expect(computeRolling3mAvg([])).toBeNull()
  })

  // 125
  it('125. 1 item → null', () => {
    expect(computeRolling3mAvg([100])).toBeNull()
  })

  // 126
  it('126. 2 items → null', () => {
    expect(computeRolling3mAvg([100, 200])).toBeNull()
  })

  // 127
  it('127. exactly 3 items → average', () => {
    expect(computeRolling3mAvg([100, 200, 300])).toBeCloseTo(200)
  })

  // 128
  it('128. more than 3 items → uses last 3 only', () => {
    // [10, 20, 100, 200, 300] — last 3 are [100, 200, 300] → avg 200
    expect(computeRolling3mAvg([10, 20, 100, 200, 300])).toBeCloseTo(200)
  })

  // 129
  it('129. all zeros → 0', () => {
    expect(computeRolling3mAvg([0, 0, 0])).toBeCloseTo(0)
  })
})

// ── computeRolling3mTotal ─────────────────────────────────────────────────────

describe('computeRolling3mTotal', () => {

  // 130
  it('130. empty array → null', () => {
    expect(computeRolling3mTotal([])).toBeNull()
  })

  // 131
  it('131. 2 items → null', () => {
    expect(computeRolling3mTotal([100, 200])).toBeNull()
  })

  // 132
  it('132. exactly 3 items → sum', () => {
    expect(computeRolling3mTotal([100, 200, 300])).toBe(600)
  })

  // 133
  it('133. more than 3 items → uses last 3 only', () => {
    expect(computeRolling3mTotal([10, 20, 100, 200, 300])).toBe(600)
  })
})

// ── computeTrendAcceleration ──────────────────────────────────────────────────

describe('computeTrendAcceleration', () => {

  // 134
  it('134. current null → null', () => {
    expect(computeTrendAcceleration(null, 10)).toBeNull()
  })

  // 135
  it('135. prior null → null', () => {
    expect(computeTrendAcceleration(10, null)).toBeNull()
  })

  // 136
  it('136. both null → null', () => {
    expect(computeTrendAcceleration(null, null)).toBeNull()
  })

  // 137
  it('137. acceleration: current > prior', () => {
    expect(computeTrendAcceleration(20, 10)).toBeCloseTo(10)
  })

  // 138
  it('138. deceleration: current < prior', () => {
    expect(computeTrendAcceleration(5, 15)).toBeCloseTo(-10)
  })

  // 139
  it('139. equal → 0', () => {
    expect(computeTrendAcceleration(10, 10)).toBeCloseTo(0)
  })
})

// ── classifyTrendMomentum ─────────────────────────────────────────────────────

describe('classifyTrendMomentum', () => {

  // 140
  it('140. null → insufficient_data', () => {
    expect(classifyTrendMomentum(null)).toBe('insufficient_data')
  })

  // 141
  it('141. > 5 → accelerating', () => {
    expect(classifyTrendMomentum(6)).toBe('accelerating')
  })

  // 142
  it('142. exactly 5 → steady (boundary: > 5 required for accelerating)', () => {
    expect(classifyTrendMomentum(5)).toBe('steady')
  })

  // 143
  it('143. 0 → steady', () => {
    expect(classifyTrendMomentum(0)).toBe('steady')
  })

  // 144
  it('144. exactly -5 → steady (boundary: >= -5)', () => {
    expect(classifyTrendMomentum(-5)).toBe('steady')
  })

  // 145
  it('145. -5.1 → decelerating', () => {
    expect(classifyTrendMomentum(-5.1)).toBe('decelerating')
  })

  // 146
  it('146. exactly -15 → decelerating (boundary: >= -15)', () => {
    expect(classifyTrendMomentum(-15)).toBe('decelerating')
  })

  // 147
  it('147. -15.1 → reversing', () => {
    expect(classifyTrendMomentum(-15.1)).toBe('reversing')
  })

  // 148
  it('148. large negative → reversing', () => {
    expect(classifyTrendMomentum(-50)).toBe('reversing')
  })
})

// ── computeSeasonalityIndex ───────────────────────────────────────────────────

describe('computeSeasonalityIndex', () => {

  // 149
  it('149. empty input → {}', () => {
    expect(computeSeasonalityIndex({})).toEqual({})
  })

  // 150
  it('150. single month with single value → index 1.0 (avg = overall avg)', () => {
    const result = computeSeasonalityIndex({ '01': [100] })
    expect(result['01']).toBeCloseTo(1.0)
  })

  // 151
  it('151. month with empty array → index 1.0', () => {
    const result = computeSeasonalityIndex({ '01': [100], '07': [] })
    expect(result['07']).toBeCloseTo(1.0)
  })

  // 152
  it('152. multi-year average: high season month has index > 1', () => {
    const result = computeSeasonalityIndex({
      '01': [100, 100],
      '07': [200, 200],  // summer double the base
    })
    expect(result['07']).toBeGreaterThan(1)
    expect(result['01']).toBeLessThan(1)
  })

  // 153
  it('153. uniform values → all indices = 1.0', () => {
    const result = computeSeasonalityIndex({
      '01': [100],
      '02': [100],
      '03': [100],
    })
    for (const key of Object.keys(result)) {
      expect(result[key]).toBeCloseTo(1.0)
    }
  })

  // 154
  it('154. all values zero → all indices = 1.0', () => {
    const result = computeSeasonalityIndex({ '01': [0, 0], '06': [0] })
    expect(result['01']).toBeCloseTo(1.0)
    expect(result['06']).toBeCloseTo(1.0)
  })
})

// ── computeRunRate ────────────────────────────────────────────────────────────

describe('computeRunRate', () => {

  // 155
  it('155. periodMonths = 0 → null', () => {
    expect(computeRunRate(100_000, 0)).toBeNull()
  })

  // 156
  it('156. periodMonths negative → null', () => {
    expect(computeRunRate(100_000, -1)).toBeNull()
  })

  // 157
  it('157. 3 months revenue × 4 = annual run rate', () => {
    expect(computeRunRate(300_000, 3)).toBeCloseTo(1_200_000)
  })

  // 158
  it('158. single month: revenue × 12', () => {
    expect(computeRunRate(100_000, 1)).toBeCloseTo(1_200_000)
  })

  // 159
  it('159. 12 months revenue = run rate (no adjustment)', () => {
    expect(computeRunRate(1_200_000, 12)).toBeCloseTo(1_200_000)
  })
})

// ── classifyRunRateVsTarget ───────────────────────────────────────────────────

describe('classifyRunRateVsTarget', () => {

  // 160
  it('160. annualTarget = 0 → no_target', () => {
    expect(classifyRunRateVsTarget(1_000_000, 0)).toBe('no_target')
  })

  // 161
  it('161. annualTarget negative → no_target', () => {
    expect(classifyRunRateVsTarget(1_000_000, -1)).toBe('no_target')
  })

  // 162
  it('162. runRate null → no_target', () => {
    expect(classifyRunRateVsTarget(null, 1_000_000)).toBe('no_target')
  })

  // 163
  it('163. runRate >= target × 1.05 → exceeding', () => {
    expect(classifyRunRateVsTarget(1_050_000, 1_000_000)).toBe('exceeding')
  })

  // 164
  it('164. runRate = target × 1.049 → on_track (just below exceeding threshold)', () => {
    expect(classifyRunRateVsTarget(1_049_000, 1_000_000)).toBe('on_track')
  })

  // 165
  it('165. runRate = target × 0.90 → on_track', () => {
    expect(classifyRunRateVsTarget(900_000, 1_000_000)).toBe('on_track')
  })

  // 166
  it('166. runRate = target × 0.89 → below (just below on_track threshold)', () => {
    expect(classifyRunRateVsTarget(890_000, 1_000_000)).toBe('below')
  })

  // 167
  it('167. runRate = target × 0.70 → below', () => {
    expect(classifyRunRateVsTarget(700_000, 1_000_000)).toBe('below')
  })

  // 168
  it('168. runRate = target × 0.69 → significantly_below', () => {
    expect(classifyRunRateVsTarget(690_000, 1_000_000)).toBe('significantly_below')
  })

  // 169
  it('169. runRate = 0 → significantly_below (target > 0)', () => {
    expect(classifyRunRateVsTarget(0, 1_000_000)).toBe('significantly_below')
  })
})

// ── computeGrossMarginTrend ───────────────────────────────────────────────────

describe('computeGrossMarginTrend', () => {

  // 170
  it('170. empty array → []', () => {
    expect(computeGrossMarginTrend([])).toEqual([])
  })

  // 171
  it('171. single period: gross_margin_pct computed, mom_change_ppt null', () => {
    const result = computeGrossMarginTrend([{ revenue: 100, cogs: 60 }])
    expect(result).toHaveLength(1)
    expect(result[0].gross_margin_pct).toBeCloseTo(40)
    expect(result[0].mom_change_ppt).toBeNull()
  })

  // 172
  it('172. revenue = 0 → gross_margin_pct null', () => {
    const result = computeGrossMarginTrend([{ revenue: 0, cogs: 0 }])
    expect(result[0].gross_margin_pct).toBeNull()
  })

  // 173
  it('173. two periods: ppt change computed correctly', () => {
    // Period 1: rev=100, cogs=40 → 60% margin
    // Period 2: rev=100, cogs=50 → 50% margin
    // ppt change = 50 - 60 = -10
    const result = computeGrossMarginTrend([
      { revenue: 100, cogs: 40 },
      { revenue: 100, cogs: 50 },
    ])
    expect(result[1].gross_margin_pct).toBeCloseTo(50)
    expect(result[1].mom_change_ppt).toBeCloseTo(-10)
  })

  // 174
  it('174. ppt null when either period has revenue=0', () => {
    const result = computeGrossMarginTrend([
      { revenue: 0, cogs: 0 },
      { revenue: 100, cogs: 50 },
    ])
    expect(result[1].mom_change_ppt).toBeNull()
  })

  // 175
  it('175. three periods: first ppt null, rest computed', () => {
    const result = computeGrossMarginTrend([
      { revenue: 100, cogs: 40 },
      { revenue: 100, cogs: 45 },
      { revenue: 100, cogs: 40 },
    ])
    expect(result[0].mom_change_ppt).toBeNull()
    expect(result[1].mom_change_ppt).not.toBeNull()
    expect(result[2].mom_change_ppt).not.toBeNull()
  })
})

// ── generatePeriodComparisonNarrative ─────────────────────────────────────────

describe('generatePeriodComparisonNarrative', () => {

  // 176
  it('176. returns non-empty string', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: 10,
      expenseChangePct: 5,
      profitChangePct: 15,
      growthDirection: 'growth',
      currentRevenue: 120_000,
      currentProfit: 40_000,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  // 177
  it('177. contains Turkish text', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: 10,
      expenseChangePct: null,
      profitChangePct: null,
      growthDirection: 'growth',
      currentRevenue: 100_000,
      currentProfit: 30_000,
    })
    // Should contain some Turkish words
    expect(result).toMatch(/[Gg]elir|[Gg]ider|[Kk]âr|₺/)
  })

  // 178
  it('178. includes ₺ symbol for profit', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: null,
      expenseChangePct: null,
      profitChangePct: null,
      growthDirection: 'insufficient_data',
      currentRevenue: 0,
      currentProfit: 0,
    })
    expect(result).toContain('₺')
  })

  // 179
  it('179. positive revenueChangePct → "artış" direction', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: 15,
      expenseChangePct: null,
      profitChangePct: null,
      growthDirection: 'growth',
      currentRevenue: 115_000,
      currentProfit: 30_000,
    })
    expect(result).toContain('artış')
  })

  // 180
  it('180. negative revenueChangePct → "azalış" direction', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: -10,
      expenseChangePct: null,
      profitChangePct: null,
      growthDirection: 'decline',
      currentRevenue: 90_000,
      currentProfit: 20_000,
    })
    expect(result).toContain('azalış')
  })

  // 181
  it('181. null revenueChangePct → falls back to revenue amount', () => {
    const result = generatePeriodComparisonNarrative({
      revenueChangePct: null,
      expenseChangePct: null,
      profitChangePct: null,
      growthDirection: 'insufficient_data',
      currentRevenue: 50_000,
      currentProfit: 10_000,
    })
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('₺')
  })
})
