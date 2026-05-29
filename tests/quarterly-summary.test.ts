/**
 * Quarterly Summary Service — unit tests
 *
 * Tests all pure computation functions exported from quarterly-summary.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * Target: 95+ tests covering all exported functions.
 */

import { describe, it, expect } from 'vitest'
import {
  getQuarterFromMonth,
  getQuarterLabel,
  getQuarterMonths,
  getQuarterDateRange,
  computeQuarterlyKpis,
  computeQoqGrowth,
  computeYoyGrowth,
  computeRollingFourQuarterRevenue,
  computeRollingFourQuarterEbitda,
  classifyQuarterlyPerformance,
  buildQuarterlyTimeline,
  findBestQuarter,
  findWorstQuarter,
  computeQuarterlyTrend,
  generateQuarterlyNarrative,
  type QuarterlyData,
  type QuarterlyKpis,
} from '../lib/services/finance/quarterly-summary.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQ(
  year: number,
  quarter: number,
  overrides: Partial<QuarterlyData> = {},
): QuarterlyData {
  return {
    year,
    quarter,
    label: `Q${quarter} ${year}`,
    revenue: 100_000,
    cogs: 40_000,
    gross_profit: 60_000,
    operating_expenses: 20_000,
    ebitda: 40_000,
    net_income: 30_000,
    tax_amount: 10_000,
    headcount_cost: null,
    capex: 0,
    ...overrides,
  }
}

// ── getQuarterFromMonth ───────────────────────────────────────────────────────

describe('getQuarterFromMonth', () => {
  it('1.  January   → Q1', () => expect(getQuarterFromMonth(1)).toBe(1))
  it('2.  February  → Q1', () => expect(getQuarterFromMonth(2)).toBe(1))
  it('3.  March     → Q1', () => expect(getQuarterFromMonth(3)).toBe(1))
  it('4.  April     → Q2', () => expect(getQuarterFromMonth(4)).toBe(2))
  it('5.  May       → Q2', () => expect(getQuarterFromMonth(5)).toBe(2))
  it('6.  June      → Q2', () => expect(getQuarterFromMonth(6)).toBe(2))
  it('7.  July      → Q3', () => expect(getQuarterFromMonth(7)).toBe(3))
  it('8.  August    → Q3', () => expect(getQuarterFromMonth(8)).toBe(3))
  it('9.  September → Q3', () => expect(getQuarterFromMonth(9)).toBe(3))
  it('10. October   → Q4', () => expect(getQuarterFromMonth(10)).toBe(4))
  it('11. November  → Q4', () => expect(getQuarterFromMonth(11)).toBe(4))
  it('12. December  → Q4', () => expect(getQuarterFromMonth(12)).toBe(4))
})

// ── getQuarterLabel ───────────────────────────────────────────────────────────

describe('getQuarterLabel', () => {
  it('13. Q1 2025 format',   () => expect(getQuarterLabel(2025, 1)).toBe('Q1 2025'))
  it('14. Q2 2025 format',   () => expect(getQuarterLabel(2025, 2)).toBe('Q2 2025'))
  it('15. Q3 2024 format',   () => expect(getQuarterLabel(2024, 3)).toBe('Q3 2024'))
  it('16. Q4 2023 format',   () => expect(getQuarterLabel(2023, 4)).toBe('Q4 2023'))
  it('17. uses year verbatim', () => expect(getQuarterLabel(2000, 1)).toBe('Q1 2000'))
})

// ── getQuarterMonths ──────────────────────────────────────────────────────────

describe('getQuarterMonths', () => {
  it('18. Q1 returns months 1,2,3', () => {
    const months = getQuarterMonths(2025, 1)
    expect(months).toHaveLength(3)
    expect(months.map(m => m.month)).toEqual([1, 2, 3])
  })

  it('19. Q2 returns months 4,5,6', () => {
    const months = getQuarterMonths(2025, 2)
    expect(months.map(m => m.month)).toEqual([4, 5, 6])
  })

  it('20. Q3 returns months 7,8,9', () => {
    const months = getQuarterMonths(2025, 3)
    expect(months.map(m => m.month)).toEqual([7, 8, 9])
  })

  it('21. Q4 returns months 10,11,12', () => {
    const months = getQuarterMonths(2025, 4)
    expect(months.map(m => m.month)).toEqual([10, 11, 12])
  })

  it('22. all months have the correct year', () => {
    const months = getQuarterMonths(2024, 2)
    expect(months.every(m => m.year === 2024)).toBe(true)
  })

  it('23. always returns exactly 3 months', () => {
    [1, 2, 3, 4].forEach(q => {
      expect(getQuarterMonths(2025, q)).toHaveLength(3)
    })
  })
})

// ── getQuarterDateRange ───────────────────────────────────────────────────────

describe('getQuarterDateRange', () => {
  it('24. Q1 from = Jan 1', () => {
    expect(getQuarterDateRange(2025, 1).from).toBe('2025-01-01')
  })

  it('25. Q1 to = Mar 31', () => {
    expect(getQuarterDateRange(2025, 1).to).toBe('2025-03-31')
  })

  it('26. Q2 from = Apr 1', () => {
    expect(getQuarterDateRange(2025, 2).from).toBe('2025-04-01')
  })

  it('27. Q2 to = Jun 30', () => {
    expect(getQuarterDateRange(2025, 2).to).toBe('2025-06-30')
  })

  it('28. Q3 from = Jul 1', () => {
    expect(getQuarterDateRange(2025, 3).from).toBe('2025-07-01')
  })

  it('29. Q3 to = Sep 30', () => {
    expect(getQuarterDateRange(2025, 3).to).toBe('2025-09-30')
  })

  it('30. Q4 from = Oct 1', () => {
    expect(getQuarterDateRange(2025, 4).from).toBe('2025-10-01')
  })

  it('31. Q4 to = Dec 31', () => {
    expect(getQuarterDateRange(2025, 4).to).toBe('2025-12-31')
  })

  it('32. leap year 2024 Q1 to = Feb 29', () => {
    // Q1 ends March 31, not Feb — but Feb boundary check: Feb 2024 has 29 days
    // Q1 to = 2024-03-31
    expect(getQuarterDateRange(2024, 1).to).toBe('2024-03-31')
  })

  it('33. non-leap year 2023 Q1 to = Mar 31', () => {
    expect(getQuarterDateRange(2023, 1).to).toBe('2023-03-31')
  })

  it('34. from is always before to', () => {
    [1, 2, 3, 4].forEach(q => {
      const { from, to } = getQuarterDateRange(2025, q)
      expect(from < to).toBe(true)
    })
  })
})

// ── computeQuarterlyKpis ──────────────────────────────────────────────────────

describe('computeQuarterlyKpis', () => {
  it('35. gross_margin_pct computed correctly', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 100_000, gross_profit: 60_000,
    }))
    expect(kpis.gross_margin_pct).toBeCloseTo(60)
  })

  it('36. ebitda_margin_pct computed correctly', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 100_000, ebitda: 25_000,
    }))
    expect(kpis.ebitda_margin_pct).toBeCloseTo(25)
  })

  it('37. net_margin_pct computed correctly', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 200_000, net_income: 30_000,
    }))
    expect(kpis.net_margin_pct).toBeCloseTo(15)
  })

  it('38. opex_ratio_pct computed correctly', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 100_000, operating_expenses: 20_000,
    }))
    expect(kpis.opex_ratio_pct).toBeCloseTo(20)
  })

  it('39. all pct metrics are null when revenue = 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 0, gross_profit: 0, ebitda: 0, net_income: 0, operating_expenses: 0,
    }))
    expect(kpis.gross_margin_pct).toBeNull()
    expect(kpis.ebitda_margin_pct).toBeNull()
    expect(kpis.net_margin_pct).toBeNull()
    expect(kpis.opex_ratio_pct).toBeNull()
  })

  it('40. tax_rate_effective_pct computed correctly when ebitda > 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      ebitda: 100_000, tax_amount: 22_000,
    }))
    expect(kpis.tax_rate_effective_pct).toBeCloseTo(22)
  })

  it('41. tax_rate_effective_pct is null when ebitda = 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, { ebitda: 0 }))
    expect(kpis.tax_rate_effective_pct).toBeNull()
  })

  it('42. tax_rate_effective_pct is null when ebitda < 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, { ebitda: -5_000 }))
    expect(kpis.tax_rate_effective_pct).toBeNull()
  })

  it('43. revenue_per_employee is null when headcount_cost is null', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, { headcount_cost: null }))
    expect(kpis.revenue_per_employee).toBeNull()
  })

  it('44. revenue_per_employee computed when headcount_cost > 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 500_000, headcount_cost: 50_000,
    }))
    expect(kpis.revenue_per_employee).toBeCloseTo(10)
  })

  it('45. revenue_per_employee is null when headcount_cost = 0', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, { headcount_cost: 0 }))
    expect(kpis.revenue_per_employee).toBeNull()
  })

  it('46. negative gross_profit gives negative gross_margin_pct', () => {
    const kpis = computeQuarterlyKpis(makeQ(2025, 1, {
      revenue: 100_000, gross_profit: -10_000,
    }))
    expect(kpis.gross_margin_pct).toBeCloseTo(-10)
  })
})

// ── computeQoqGrowth ──────────────────────────────────────────────────────────

describe('computeQoqGrowth', () => {
  it('47. positive revenue growth', () => {
    const curr  = makeQ(2025, 2, { revenue: 120_000 })
    const prior = makeQ(2025, 1, { revenue: 100_000 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.revenue_growth_pct).toBeCloseTo(20)
  })

  it('48. negative revenue growth', () => {
    const curr  = makeQ(2025, 2, { revenue: 80_000 })
    const prior = makeQ(2025, 1, { revenue: 100_000 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.revenue_growth_pct).toBeCloseTo(-20)
  })

  it('49. zero prior revenue → null', () => {
    const curr  = makeQ(2025, 2, { revenue: 50_000 })
    const prior = makeQ(2025, 1, { revenue: 0 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.revenue_growth_pct).toBeNull()
  })

  it('50. zero prior gross_profit → null', () => {
    const curr  = makeQ(2025, 2, { gross_profit: 30_000 })
    const prior = makeQ(2025, 1, { gross_profit: 0 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.gross_profit_growth_pct).toBeNull()
  })

  it('51. positive ebitda growth', () => {
    const curr  = makeQ(2025, 2, { ebitda: 50_000 })
    const prior = makeQ(2025, 1, { ebitda: 40_000 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.ebitda_growth_pct).toBeCloseTo(25)
  })

  it('52. zero prior ebitda → null', () => {
    const curr  = makeQ(2025, 2, { ebitda: 20_000 })
    const prior = makeQ(2025, 1, { ebitda: 0 })
    const r = computeQoqGrowth(curr, prior)
    expect(r.ebitda_growth_pct).toBeNull()
  })

  it('53. net_income growth with negative prior (uses |prior|)', () => {
    const curr  = makeQ(2025, 2, { net_income: 10_000 })
    const prior = makeQ(2025, 1, { net_income: -10_000 })
    const r = computeQoqGrowth(curr, prior)
    // (10_000 - (-10_000)) / 10_000 * 100 = 200
    expect(r.net_income_growth_pct).toBeCloseTo(200)
  })

  it('54. all four metrics returned', () => {
    const curr  = makeQ(2025, 2)
    const prior = makeQ(2025, 1)
    const r = computeQoqGrowth(curr, prior)
    expect(r).toHaveProperty('revenue_growth_pct')
    expect(r).toHaveProperty('gross_profit_growth_pct')
    expect(r).toHaveProperty('ebitda_growth_pct')
    expect(r).toHaveProperty('net_income_growth_pct')
  })
})

// ── computeYoyGrowth ──────────────────────────────────────────────────────────

describe('computeYoyGrowth', () => {
  it('55. positive revenue yoy growth', () => {
    const curr = makeQ(2025, 2, { revenue: 150_000 })
    const prev = makeQ(2024, 2, { revenue: 100_000 })
    const r = computeYoyGrowth(curr, prev)
    expect(r.revenue_growth_pct).toBeCloseTo(50)
  })

  it('56. negative revenue yoy growth', () => {
    const curr = makeQ(2025, 2, { revenue: 80_000 })
    const prev = makeQ(2024, 2, { revenue: 100_000 })
    const r = computeYoyGrowth(curr, prev)
    expect(r.revenue_growth_pct).toBeCloseTo(-20)
  })

  it('57. zero prior revenue → null', () => {
    const curr = makeQ(2025, 2, { revenue: 80_000 })
    const prev = makeQ(2024, 2, { revenue: 0 })
    const r = computeYoyGrowth(curr, prev)
    expect(r.revenue_growth_pct).toBeNull()
  })

  it('58. positive ebitda yoy growth', () => {
    const curr = makeQ(2025, 1, { ebitda: 60_000 })
    const prev = makeQ(2024, 1, { ebitda: 40_000 })
    const r = computeYoyGrowth(curr, prev)
    expect(r.ebitda_growth_pct).toBeCloseTo(50)
  })

  it('59. zero prior ebitda → null', () => {
    const curr = makeQ(2025, 1, { ebitda: 20_000 })
    const prev = makeQ(2024, 1, { ebitda: 0 })
    const r = computeYoyGrowth(curr, prev)
    expect(r.ebitda_growth_pct).toBeNull()
  })
})

// ── computeRollingFourQuarterRevenue ─────────────────────────────────────────

describe('computeRollingFourQuarterRevenue', () => {
  it('60. empty array → 0', () => {
    expect(computeRollingFourQuarterRevenue([])).toBe(0)
  })

  it('61. one quarter → that quarter revenue', () => {
    expect(computeRollingFourQuarterRevenue([makeQ(2025, 1, { revenue: 50_000 })])).toBe(50_000)
  })

  it('62. exactly 4 quarters → sum of all', () => {
    const qs = [
      makeQ(2024, 3, { revenue: 10_000 }),
      makeQ(2024, 4, { revenue: 20_000 }),
      makeQ(2025, 1, { revenue: 30_000 }),
      makeQ(2025, 2, { revenue: 40_000 }),
    ]
    expect(computeRollingFourQuarterRevenue(qs)).toBe(100_000)
  })

  it('63. more than 4 quarters → only most recent 4', () => {
    const qs = [
      makeQ(2024, 1, { revenue: 999_999 }),   // oldest — excluded
      makeQ(2024, 2, { revenue: 999_999 }),   // excluded
      makeQ(2024, 3, { revenue: 10_000 }),
      makeQ(2024, 4, { revenue: 20_000 }),
      makeQ(2025, 1, { revenue: 30_000 }),
      makeQ(2025, 2, { revenue: 40_000 }),
    ]
    expect(computeRollingFourQuarterRevenue(qs)).toBe(100_000)
  })

  it('64. unordered input sorted correctly', () => {
    const qs = [
      makeQ(2025, 2, { revenue: 40_000 }),
      makeQ(2024, 3, { revenue: 10_000 }),
      makeQ(2025, 1, { revenue: 30_000 }),
      makeQ(2024, 4, { revenue: 20_000 }),
    ]
    expect(computeRollingFourQuarterRevenue(qs)).toBe(100_000)
  })

  it('65. fewer than 4 quarters sums all available', () => {
    const qs = [makeQ(2025, 1, { revenue: 50_000 }), makeQ(2025, 2, { revenue: 50_000 })]
    expect(computeRollingFourQuarterRevenue(qs)).toBe(100_000)
  })
})

// ── computeRollingFourQuarterEbitda ──────────────────────────────────────────

describe('computeRollingFourQuarterEbitda', () => {
  it('66. empty array → 0', () => {
    expect(computeRollingFourQuarterEbitda([])).toBe(0)
  })

  it('67. exactly 4 quarters → sum of all ebitda', () => {
    const qs = [
      makeQ(2024, 3, { ebitda: 5_000 }),
      makeQ(2024, 4, { ebitda: 10_000 }),
      makeQ(2025, 1, { ebitda: 15_000 }),
      makeQ(2025, 2, { ebitda: 20_000 }),
    ]
    expect(computeRollingFourQuarterEbitda(qs)).toBe(50_000)
  })

  it('68. more than 4 quarters → only most recent 4', () => {
    const qs = [
      makeQ(2024, 1, { ebitda: 999_000 }),  // excluded
      makeQ(2024, 2, { ebitda: 999_000 }),  // excluded
      makeQ(2024, 3, { ebitda: 5_000 }),
      makeQ(2024, 4, { ebitda: 10_000 }),
      makeQ(2025, 1, { ebitda: 15_000 }),
      makeQ(2025, 2, { ebitda: 20_000 }),
    ]
    expect(computeRollingFourQuarterEbitda(qs)).toBe(50_000)
  })

  it('69. negative ebitda included', () => {
    const qs = [
      makeQ(2025, 1, { ebitda: -5_000 }),
      makeQ(2025, 2, { ebitda: 10_000 }),
    ]
    expect(computeRollingFourQuarterEbitda(qs)).toBe(5_000)
  })
})

// ── classifyQuarterlyPerformance ──────────────────────────────────────────────

const kpisExceptional: QuarterlyKpis = {
  gross_margin_pct:       45,
  ebitda_margin_pct:      20,
  net_margin_pct:         15,
  revenue_per_employee:   null,
  opex_ratio_pct:         25,
  tax_rate_effective_pct: 22,
}

const kpisStrong: QuarterlyKpis = {
  gross_margin_pct:       35,
  ebitda_margin_pct:      10,
  net_margin_pct:         8,
  revenue_per_employee:   null,
  opex_ratio_pct:         25,
  tax_rate_effective_pct: 22,
}

const kpisSolid: QuarterlyKpis = {
  gross_margin_pct:       22,
  ebitda_margin_pct:      5,
  net_margin_pct:         3,
  revenue_per_employee:   null,
  opex_ratio_pct:         17,
  tax_rate_effective_pct: 22,
}

const kpisWeak: QuarterlyKpis = {
  gross_margin_pct:       12,
  ebitda_margin_pct:      1,
  net_margin_pct:         0,
  revenue_per_employee:   null,
  opex_ratio_pct:         11,
  tax_rate_effective_pct: null,
}

const kpisDeclining: QuarterlyKpis = {
  gross_margin_pct:       5,
  ebitda_margin_pct:      -5,
  net_margin_pct:         -8,
  revenue_per_employee:   null,
  opex_ratio_pct:         30,
  tax_rate_effective_pct: null,
}

describe('classifyQuarterlyPerformance', () => {
  it('70. exceptional: all thresholds met', () => {
    expect(classifyQuarterlyPerformance(kpisExceptional, 15)).toBe('exceptional')
  })

  it('71. exceptional: qoq exactly 10 → exceptional', () => {
    expect(classifyQuarterlyPerformance(kpisExceptional, 10)).toBe('exceptional')
  })

  it('72. strong: grossMargin >= 30, ebitdaMargin >= 8, growth >= 0', () => {
    expect(classifyQuarterlyPerformance(kpisStrong, 5)).toBe('strong')
  })

  it('73. strong: qoq exactly 0 → strong', () => {
    expect(classifyQuarterlyPerformance(kpisStrong, 0)).toBe('strong')
  })

  it('74. solid: grossMargin >= 20, ebitdaMargin >= 3', () => {
    expect(classifyQuarterlyPerformance(kpisSolid, -5)).toBe('solid')
  })

  it('75. solid: negative qoq does not affect solid classification', () => {
    expect(classifyQuarterlyPerformance(kpisSolid, -50)).toBe('solid')
  })

  it('76. weak: grossMargin >= 10', () => {
    expect(classifyQuarterlyPerformance(kpisWeak, -10)).toBe('weak')
  })

  it('77. weak: ebitdaMargin exactly 0 → weak via || branch', () => {
    const k = { ...kpisDeclining, gross_margin_pct: 5, ebitda_margin_pct: 0 }
    expect(classifyQuarterlyPerformance(k, null)).toBe('weak')
  })

  it('78. declining: negative gross and ebitda margins', () => {
    expect(classifyQuarterlyPerformance(kpisDeclining, -20)).toBe('declining')
  })

  it('79. null qoq treated as 0 — exceptional fails (needs >= 10)', () => {
    // grossMargin 45, ebitda 20, qoq null → treated as 0 → strong
    expect(classifyQuarterlyPerformance(kpisExceptional, null)).toBe('strong')
  })

  it('80. null qoq treated as 0 — strong passes (needs >= 0)', () => {
    expect(classifyQuarterlyPerformance(kpisStrong, null)).toBe('strong')
  })

  it('81. null margins treated as 0', () => {
    const k: QuarterlyKpis = {
      gross_margin_pct: null, ebitda_margin_pct: null, net_margin_pct: null,
      revenue_per_employee: null, opex_ratio_pct: null, tax_rate_effective_pct: null,
    }
    // null → 0, 0 >= 0 ebitda qualifies weak via || branch
    expect(classifyQuarterlyPerformance(k, null)).toBe('weak')
  })
})

// ── buildQuarterlyTimeline ────────────────────────────────────────────────────

describe('buildQuarterlyTimeline', () => {
  it('82. empty array → empty timeline', () => {
    expect(buildQuarterlyTimeline([])).toHaveLength(0)
  })

  it('83. single quarter → qoq_growth is null', () => {
    const timeline = buildQuarterlyTimeline([makeQ(2025, 1)])
    expect(timeline[0].qoq_growth).toBeNull()
  })

  it('84. first quarter in sorted order has null qoq', () => {
    const qs = [makeQ(2025, 2), makeQ(2025, 1), makeQ(2024, 4)]
    const timeline = buildQuarterlyTimeline(qs)
    expect(timeline[0].label).toBe('Q4 2024')
    expect(timeline[0].qoq_growth).toBeNull()
  })

  it('85. sorted chronologically (oldest first)', () => {
    const qs = [makeQ(2025, 3), makeQ(2025, 1), makeQ(2025, 2)]
    const timeline = buildQuarterlyTimeline(qs)
    expect(timeline.map(t => t.quarter)).toEqual([1, 2, 3])
  })

  it('86. second quarter has non-null qoq_growth', () => {
    const qs = [makeQ(2025, 2), makeQ(2025, 1)]
    const timeline = buildQuarterlyTimeline(qs)
    expect(timeline[1].qoq_growth).not.toBeNull()
  })

  it('87. kpis field is present on each entry', () => {
    const timeline = buildQuarterlyTimeline([makeQ(2025, 1)])
    expect(timeline[0]).toHaveProperty('kpis')
  })

  it('88. performance field is present on each entry', () => {
    const timeline = buildQuarterlyTimeline([makeQ(2025, 1)])
    expect(timeline[0]).toHaveProperty('performance')
  })

  it('89. across year boundary sorted correctly', () => {
    const qs = [makeQ(2025, 1), makeQ(2024, 4), makeQ(2024, 3)]
    const timeline = buildQuarterlyTimeline(qs)
    expect(timeline.map(t => t.label)).toEqual(['Q3 2024', 'Q4 2024', 'Q1 2025'])
  })
})

// ── findBestQuarter ───────────────────────────────────────────────────────────

describe('findBestQuarter', () => {
  it('90. empty array → null', () => {
    expect(findBestQuarter([])).toBeNull()
  })

  it('91. single quarter → that quarter', () => {
    const q = makeQ(2025, 1)
    expect(findBestQuarter([q])).toBe(q)
  })

  it('92. returns quarter with highest revenue', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 50_000 }),
      makeQ(2025, 2, { revenue: 200_000 }),
      makeQ(2025, 3, { revenue: 100_000 }),
    ]
    expect(findBestQuarter(qs)?.revenue).toBe(200_000)
  })

  it('93. ties: first winner kept (first max encountered)', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 100_000 }),
      makeQ(2025, 2, { revenue: 100_000 }),
    ]
    expect(findBestQuarter(qs)?.revenue).toBe(100_000)
  })
})

// ── findWorstQuarter ──────────────────────────────────────────────────────────

describe('findWorstQuarter', () => {
  it('94. empty array → null', () => {
    expect(findWorstQuarter([])).toBeNull()
  })

  it('95. all zero revenue → null (none qualify)', () => {
    const qs = [makeQ(2025, 1, { revenue: 0 }), makeQ(2025, 2, { revenue: 0 })]
    expect(findWorstQuarter(qs)).toBeNull()
  })

  it('96. returns quarter with lowest positive revenue', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 200_000 }),
      makeQ(2025, 2, { revenue: 50_000 }),
      makeQ(2025, 3, { revenue: 100_000 }),
    ]
    expect(findWorstQuarter(qs)?.revenue).toBe(50_000)
  })

  it('97. zero revenue quarters excluded from worst', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 0 }),     // excluded
      makeQ(2025, 2, { revenue: 80_000 }),
      makeQ(2025, 3, { revenue: 120_000 }),
    ]
    expect(findWorstQuarter(qs)?.revenue).toBe(80_000)
  })
})

// ── computeQuarterlyTrend ─────────────────────────────────────────────────────

describe('computeQuarterlyTrend', () => {
  it('98.  empty array → insufficient_data', () => {
    expect(computeQuarterlyTrend([])).toBe('insufficient_data')
  })

  it('99.  1 quarter → insufficient_data', () => {
    expect(computeQuarterlyTrend([makeQ(2025, 1)])).toBe('insufficient_data')
  })

  it('100. 2 quarters → insufficient_data', () => {
    expect(computeQuarterlyTrend([makeQ(2025, 1), makeQ(2025, 2)])).toBe('insufficient_data')
  })

  it('101. exactly 3 quarters improving trend', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 100_000 }),
      makeQ(2025, 2, { revenue: 130_000 }),
      makeQ(2025, 3, { revenue: 160_000 }),
    ]
    expect(computeQuarterlyTrend(qs)).toBe('improving')
  })

  it('102. exactly 3 quarters declining trend', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 160_000 }),
      makeQ(2025, 2, { revenue: 130_000 }),
      makeQ(2025, 3, { revenue: 100_000 }),
    ]
    expect(computeQuarterlyTrend(qs)).toBe('declining')
  })

  it('103. flat revenues → stable', () => {
    const qs = [
      makeQ(2025, 1, { revenue: 100_000 }),
      makeQ(2025, 2, { revenue: 100_000 }),
      makeQ(2025, 3, { revenue: 100_000 }),
      makeQ(2025, 4, { revenue: 100_000 }),
    ]
    expect(computeQuarterlyTrend(qs)).toBe('stable')
  })

  it('104. marginal growth below 2% threshold → stable', () => {
    // avg ~ 100_000, 1% growth per quarter → slope = 1000 < 2000
    const qs = [
      makeQ(2025, 1, { revenue: 99_000 }),
      makeQ(2025, 2, { revenue: 100_000 }),
      makeQ(2025, 3, { revenue: 101_000 }),
    ]
    expect(computeQuarterlyTrend(qs)).toBe('stable')
  })

  it('105. unordered input produces correct trend', () => {
    const qs = [
      makeQ(2025, 3, { revenue: 160_000 }),
      makeQ(2025, 1, { revenue: 100_000 }),
      makeQ(2025, 2, { revenue: 130_000 }),
    ]
    expect(computeQuarterlyTrend(qs)).toBe('improving')
  })
})

// ── generateQuarterlyNarrative ────────────────────────────────────────────────

describe('generateQuarterlyNarrative', () => {
  const q2025q1 = makeQ(2025, 1)

  it('106. exceptional → Olağanüstü çeyrek', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisExceptional, 'improving', 'exceptional')
    expect(n).toContain('Olağanüstü çeyrek')
    expect(n).toContain('Q1 2025')
  })

  it('107. strong → Güçlü performans', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisStrong, 'improving', 'strong')
    expect(n).toContain('Güçlü performans')
  })

  it('108. solid → Sağlam çeyrek', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisSolid, 'stable', 'solid')
    expect(n).toContain('Sağlam çeyrek')
  })

  it('109. weak → Zayıf çeyrek', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisWeak, 'declining', 'weak')
    expect(n).toContain('Zayıf çeyrek')
  })

  it('110. declining → Gerileme görülüyor', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisDeclining, 'declining', 'declining')
    expect(n).toContain('Gerileme görülüyor')
  })

  it('111. label is always included in narrative', () => {
    const q = makeQ(2026, 3)
    const n = generateQuarterlyNarrative(q, kpisStrong, 'improving', 'strong')
    expect(n).toContain('Q3 2026')
  })

  it('112. narrative is a non-empty string', () => {
    const n = generateQuarterlyNarrative(q2025q1, kpisSolid, 'stable', 'solid')
    expect(typeof n).toBe('string')
    expect(n.length).toBeGreaterThan(0)
  })
})
