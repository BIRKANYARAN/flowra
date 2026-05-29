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
  it('74. correct CMGR for known 10% monthly growth over 3 months', () => {
    // first = 100, last = 121 (2 periods), CMGR = (121/100)^(1/2) - 1 = 10%
    const result = computeCmgr(100, 121, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10, 1)
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
  it('84. CMGR is approximately 10% for consistent 10% MoM growth', () => {
    const cmgr = computeCmgr(series[0].revenue_try, series[series.length - 1].revenue_try, series.length)
    expect(cmgr).not.toBeNull()
    expect(cmgr!).toBeCloseTo(10, 0)
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
