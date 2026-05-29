/**
 * Tests for lib/services/finance/budget-variance.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/budget-variance.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeVariance,
  computeVariancePct,
  isFavorableVariance,
  buildBudgetLine,
  buildBudgetPeriod,
  computeYtdVariance,
  findLargestVariance,
  findOverBudgetCategories,
  classifyBudgetPerformance,
  deriveBudgetFromPrior,
  computeBudgetTrend,
  computeRunRate,
  classifyRevenueVariance,
  classifyExpenseVariance,
  computeFullYearForecast,
  computeBudgetAttainment,
  computePaceAdjustedBudget,
  classifyPaceVsBudget,
  computeTotalVariance,
  findLargestVarianceItem,
  computeVarianceHealthScore,
  classifyVarianceHealth,
  generateVarianceNarrative,
  type BudgetLine,
  type BudgetPeriod,
} from '../lib/services/finance/budget-variance.service'

// ═══════════════════════════════════════════════════════════════════════════
// 1. computeVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('computeVariance', () => {
  it('1. returns positive when actual > budget', () => {
    expect(computeVariance(120, 100)).toBe(20)
  })

  it('2. returns negative when actual < budget', () => {
    expect(computeVariance(80, 100)).toBe(-20)
  })

  it('3. returns zero when actual equals budget', () => {
    expect(computeVariance(100, 100)).toBe(0)
  })

  it('4. handles zero budget', () => {
    expect(computeVariance(50, 0)).toBe(50)
  })

  it('5. handles negative actual (e.g. refund)', () => {
    expect(computeVariance(-10, 100)).toBe(-110)
  })

  it('6. handles fractional values', () => {
    expect(computeVariance(100.5, 100)).toBeCloseTo(0.5)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. computeVariancePct
// ═══════════════════════════════════════════════════════════════════════════

describe('computeVariancePct', () => {
  it('7. returns correct pct when actual > budget', () => {
    expect(computeVariancePct(120, 100)).toBeCloseTo(20)
  })

  it('8. returns correct pct when actual < budget', () => {
    expect(computeVariancePct(80, 100)).toBeCloseTo(-20)
  })

  it('9. returns 0 when budget is 0 (not NaN)', () => {
    const result = computeVariancePct(50, 0)
    expect(result).toBe(0)
    expect(Number.isNaN(result)).toBe(false)
  })

  it('10. returns 0 when actual equals budget', () => {
    expect(computeVariancePct(100, 100)).toBeCloseTo(0)
  })

  it('11. handles large overage correctly', () => {
    expect(computeVariancePct(0, 100)).toBeCloseTo(-100)
  })

  it('12. returns 50% for 150 vs 100', () => {
    expect(computeVariancePct(150, 100)).toBeCloseTo(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. isFavorableVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('isFavorableVariance', () => {
  it('13. revenue with positive variance → favorable', () => {
    expect(isFavorableVariance('revenue', 1000)).toBe(true)
  })

  it('14. revenue with negative variance → unfavorable', () => {
    expect(isFavorableVariance('revenue', -500)).toBe(false)
  })

  it('15. revenue with zero variance → favorable (met budget)', () => {
    expect(isFavorableVariance('revenue', 0)).toBe(true)
  })

  it('16. sales category treated as revenue — positive → favorable', () => {
    expect(isFavorableVariance('sales', 200)).toBe(true)
  })

  it('17. income category treated as revenue — positive → favorable', () => {
    expect(isFavorableVariance('income', 100)).toBe(true)
  })

  it('18. expense with negative variance → favorable (under budget)', () => {
    expect(isFavorableVariance('salary', -200)).toBe(true)
  })

  it('19. expense with positive variance → unfavorable (over budget)', () => {
    expect(isFavorableVariance('rent', 500)).toBe(false)
  })

  it('20. expense with zero variance → favorable (on budget)', () => {
    expect(isFavorableVariance('marketing', 0)).toBe(true)
  })

  it('21. cogs treated as expense — positive → unfavorable', () => {
    expect(isFavorableVariance('cogs', 1000)).toBe(false)
  })

  it('22. case-insensitive revenue detection', () => {
    expect(isFavorableVariance('REVENUE', 100)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. buildBudgetLine
// ═══════════════════════════════════════════════════════════════════════════

describe('buildBudgetLine', () => {
  it('23. builds correct line for revenue above budget', () => {
    const line = buildBudgetLine('revenue', 100_000, 120_000)
    expect(line.category).toBe('revenue')
    expect(line.budget_try).toBe(100_000)
    expect(line.actual_try).toBe(120_000)
    expect(line.variance_try).toBe(20_000)
    expect(line.variance_pct).toBeCloseTo(20)
    expect(line.is_favorable).toBe(true)
  })

  it('24. builds correct line for revenue below budget', () => {
    const line = buildBudgetLine('revenue', 100_000, 80_000)
    expect(line.variance_try).toBe(-20_000)
    expect(line.variance_pct).toBeCloseTo(-20)
    expect(line.is_favorable).toBe(false)
  })

  it('25. builds correct line for expense below budget (favorable)', () => {
    const line = buildBudgetLine('salary', 50_000, 45_000)
    expect(line.variance_try).toBe(-5_000)
    expect(line.is_favorable).toBe(true)
  })

  it('26. builds correct line for expense above budget (unfavorable)', () => {
    const line = buildBudgetLine('rent', 10_000, 12_000)
    expect(line.variance_try).toBe(2_000)
    expect(line.variance_pct).toBeCloseTo(20)
    expect(line.is_favorable).toBe(false)
  })

  it('27. zero budget returns variance_pct = 0', () => {
    const line = buildBudgetLine('other', 0, 5_000)
    expect(line.variance_pct).toBe(0)
  })

  it('28. equal actual and budget gives zero variance', () => {
    const line = buildBudgetLine('marketing', 20_000, 20_000)
    expect(line.variance_try).toBe(0)
    expect(line.variance_pct).toBeCloseTo(0)
    expect(line.is_favorable).toBe(true) // expense at budget = favorable
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. buildBudgetPeriod
// ═══════════════════════════════════════════════════════════════════════════

describe('buildBudgetPeriod', () => {
  const budgetData = [
    { category: 'revenue',   amount_try: 200_000 },
    { category: 'salary',    amount_try: 50_000 },
    { category: 'rent',      amount_try: 20_000 },
  ]

  const actualData = [
    { category: 'revenue',   amount_try: 220_000 },
    { category: 'salary',    amount_try: 48_000 },
    { category: 'rent',      amount_try: 22_000 },
  ]

  it('29. sets correct period string', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.period).toBe('2026-05')
  })

  it('30. aggregates total_budget_revenue correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.total_budget_revenue).toBe(200_000)
  })

  it('31. aggregates total_actual_revenue correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.total_actual_revenue).toBe(220_000)
  })

  it('32. aggregates total_budget_expenses correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.total_budget_expenses).toBe(70_000) // 50k + 20k
  })

  it('33. aggregates total_actual_expenses correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.total_actual_expenses).toBe(70_000) // 48k + 22k
  })

  it('34. computes budget_net_income correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.budget_net_income).toBe(130_000) // 200k - 70k
  })

  it('35. computes actual_net_income correctly', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.actual_net_income).toBe(150_000) // 220k - 70k
  })

  it('36. net_income_variance_try = actual - budget', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.net_income_variance_try).toBeCloseTo(20_000)
  })

  it('37. is_net_income_favorable = true when actual > budget net income', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.is_net_income_favorable).toBe(true)
  })

  it('38. is_net_income_favorable = false when actual < budget net income', () => {
    const budgetHigh = [
      { category: 'revenue', amount_try: 300_000 },
      { category: 'salary',  amount_try: 30_000 },
    ]
    const p = buildBudgetPeriod('2026-05', budgetHigh, actualData)
    expect(p.is_net_income_favorable).toBe(false)
  })

  it('39. handles category in actual but not in budget (defaults budget to 0)', () => {
    const budgetNoRent = [{ category: 'revenue', amount_try: 200_000 }]
    const p = buildBudgetPeriod('2026-05', budgetNoRent, actualData)
    const rentLine = p.lines.find(l => l.category === 'rent')
    expect(rentLine).toBeDefined()
    expect(rentLine!.budget_try).toBe(0)
    expect(rentLine!.actual_try).toBe(22_000)
  })

  it('40. builds correct number of lines', () => {
    const p = buildBudgetPeriod('2026-05', budgetData, actualData)
    expect(p.lines).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. computeYtdVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('computeYtdVariance', () => {
  function makePeriod(
    period: string,
    budgetRev: number,
    actualRev: number,
    budgetExp: number,
    actualExp: number,
  ): BudgetPeriod {
    const budgetNet = budgetRev - budgetExp
    const actualNet = actualRev - actualExp
    return {
      period,
      lines: [],
      total_budget_revenue:   budgetRev,
      total_actual_revenue:   actualRev,
      total_budget_expenses:  budgetExp,
      total_actual_expenses:  actualExp,
      budget_net_income:      budgetNet,
      actual_net_income:      actualNet,
      net_income_variance_try: actualNet - budgetNet,
      net_income_variance_pct: budgetNet !== 0 ? ((actualNet - budgetNet) / Math.abs(budgetNet)) * 100 : 0,
      is_net_income_favorable: actualNet >= budgetNet,
    }
  }

  it('41. aggregates revenue correctly across two periods', () => {
    const p1 = makePeriod('2026-01', 100_000, 110_000, 60_000, 58_000)
    const p2 = makePeriod('2026-02', 100_000,  90_000, 60_000, 65_000)
    const ytd = computeYtdVariance([p1, p2])
    expect(ytd.ytd_budget_revenue).toBe(200_000)
    expect(ytd.ytd_actual_revenue).toBe(200_000)
  })

  it('42. aggregates expenses correctly', () => {
    const p1 = makePeriod('2026-01', 100_000, 110_000, 60_000, 58_000)
    const p2 = makePeriod('2026-02', 100_000,  90_000, 60_000, 65_000)
    const ytd = computeYtdVariance([p1, p2])
    expect(ytd.ytd_budget_expenses).toBe(120_000)
    expect(ytd.ytd_actual_expenses).toBe(123_000)
  })

  it('43. computes revenue variance pct correctly', () => {
    const p1 = makePeriod('2026-01', 100_000, 110_000, 60_000, 58_000)
    const ytd = computeYtdVariance([p1])
    expect(ytd.ytd_revenue_variance_pct).toBeCloseTo(10)
  })

  it('44. returns 0 ytd_revenue_variance_pct when no budget revenue', () => {
    const p1 = makePeriod('2026-01', 0, 50_000, 0, 30_000)
    const ytd = computeYtdVariance([p1])
    expect(ytd.ytd_revenue_variance_pct).toBe(0)
  })

  it('45. handles empty periods array', () => {
    const ytd = computeYtdVariance([])
    expect(ytd.ytd_budget_revenue).toBe(0)
    expect(ytd.ytd_actual_revenue).toBe(0)
    expect(ytd.ytd_revenue_variance_pct).toBe(0)
  })

  it('46. computes net income variance pct across multiple periods', () => {
    const p1 = makePeriod('2026-01', 100_000, 120_000, 60_000, 60_000)
    const ytd = computeYtdVariance([p1])
    // ytd net budget = 40k, actual = 60k → +50%
    expect(ytd.ytd_net_income_variance_pct).toBeCloseTo(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. findLargestVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('findLargestVariance', () => {
  it('47. returns null for empty array', () => {
    expect(findLargestVariance([])).toBeNull()
  })

  it('48. returns null when all lines are favorable', () => {
    const lines: BudgetLine[] = [
      buildBudgetLine('revenue', 100, 110),  // favorable
      buildBudgetLine('salary', 50, 45),     // favorable
    ]
    expect(findLargestVariance(lines)).toBeNull()
  })

  it('49. finds the single unfavorable line', () => {
    const lines: BudgetLine[] = [
      buildBudgetLine('revenue', 100_000, 110_000), // favorable
      buildBudgetLine('rent', 20_000, 25_000),      // unfavorable +5k
    ]
    const result = findLargestVariance(lines)
    expect(result?.category).toBe('rent')
  })

  it('50. finds the largest by absolute variance among unfavorable', () => {
    const lines: BudgetLine[] = [
      buildBudgetLine('salary', 50_000, 60_000),   // +10k unfavorable
      buildBudgetLine('rent', 20_000, 35_000),      // +15k unfavorable — largest
      buildBudgetLine('marketing', 10_000, 14_000), // +4k unfavorable
    ]
    const result = findLargestVariance(lines)
    expect(result?.category).toBe('rent')
  })

  it('51. does not return favorable lines even if larger absolute value', () => {
    const lines: BudgetLine[] = [
      buildBudgetLine('revenue', 100_000, 200_000), // +100k favorable
      buildBudgetLine('rent', 20_000, 25_000),      // +5k unfavorable
    ]
    const result = findLargestVariance(lines)
    expect(result?.category).toBe('rent')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. findOverBudgetCategories
// ═══════════════════════════════════════════════════════════════════════════

describe('findOverBudgetCategories', () => {
  it('52. returns empty array when no unfavorable lines', () => {
    const lines = [buildBudgetLine('salary', 50_000, 45_000)]
    expect(findOverBudgetCategories(lines)).toHaveLength(0)
  })

  it('53. excludes unfavorable lines below threshold (default 10%)', () => {
    const lines = [buildBudgetLine('rent', 10_000, 10_800)] // +8% — under threshold
    expect(findOverBudgetCategories(lines)).toHaveLength(0)
  })

  it('54. includes unfavorable lines above threshold', () => {
    const lines = [buildBudgetLine('marketing', 10_000, 11_500)] // +15% — over threshold
    const result = findOverBudgetCategories(lines)
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('marketing')
  })

  it('55. respects custom threshold', () => {
    const lines = [
      buildBudgetLine('salary', 50_000, 57_000),   // +14%
      buildBudgetLine('software', 10_000, 11_000),  // +10%
    ]
    // threshold 15% → neither qualifies
    expect(findOverBudgetCategories(lines, 15)).toHaveLength(0)
    // threshold 10% → salary qualifies (14% > 10%)
    expect(findOverBudgetCategories(lines, 10)).toHaveLength(1)
  })

  it('56. revenue line favorable does not appear even if high positive variance', () => {
    const lines = [buildBudgetLine('revenue', 100_000, 150_000)] // +50% but favorable
    expect(findOverBudgetCategories(lines)).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. classifyBudgetPerformance
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyBudgetPerformance', () => {
  it('57. returns no_budget when budget = 0', () => {
    expect(classifyBudgetPerformance(0, 50_000)).toBe('no_budget')
  })

  it('58. returns excellent when actual ≥ budget × 1.10', () => {
    // Use 110_001 to avoid floating point boundary: 100_000 * 1.10 = 110000.00000000001
    expect(classifyBudgetPerformance(100_000, 110_001)).toBe('excellent')
    expect(classifyBudgetPerformance(100_000, 115_000)).toBe('excellent')
  })

  it('59. returns on_track when actual ≥ budget × 0.95 and < × 1.10', () => {
    expect(classifyBudgetPerformance(100_000, 95_000)).toBe('on_track')
    expect(classifyBudgetPerformance(100_000, 100_000)).toBe('on_track')
    expect(classifyBudgetPerformance(100_000, 109_000)).toBe('on_track')
  })

  it('60. returns slight_miss when actual ≥ budget × 0.85 and < × 0.95', () => {
    expect(classifyBudgetPerformance(100_000, 90_000)).toBe('slight_miss')
    expect(classifyBudgetPerformance(100_000, 85_000)).toBe('slight_miss')
  })

  it('61. returns miss when actual ≥ budget × 0.70 and < × 0.85', () => {
    expect(classifyBudgetPerformance(100_000, 75_000)).toBe('miss')
    expect(classifyBudgetPerformance(100_000, 70_000)).toBe('miss')
  })

  it('62. returns significant_miss when actual < budget × 0.70', () => {
    expect(classifyBudgetPerformance(100_000, 69_000)).toBe('significant_miss')
    expect(classifyBudgetPerformance(100_000, 0)).toBe('significant_miss')
  })

  it('63. returns no_budget for zero budget', () => {
    expect(classifyBudgetPerformance(0, 0)).toBe('no_budget')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 10. deriveBudgetFromPrior
// ═══════════════════════════════════════════════════════════════════════════

describe('deriveBudgetFromPrior', () => {
  const prior = [
    { category: 'revenue', amount_try: 100_000 },
    { category: 'salary',  amount_try: 40_000 },
    { category: 'rent',    amount_try: 10_000 },
  ]

  it('64. applies default 5% growth rate', () => {
    const result = deriveBudgetFromPrior(prior)
    expect(result[0].amount_try).toBeCloseTo(105_000)
    expect(result[1].amount_try).toBeCloseTo(42_000)
    expect(result[2].amount_try).toBeCloseTo(10_500)
  })

  it('65. applies custom growth rate correctly', () => {
    const result = deriveBudgetFromPrior(prior, 10)
    expect(result[0].amount_try).toBeCloseTo(110_000)
  })

  it('66. preserves categories', () => {
    const result = deriveBudgetFromPrior(prior)
    expect(result.map(r => r.category)).toEqual(['revenue', 'salary', 'rent'])
  })

  it('67. handles zero growth rate (1.0 multiplier)', () => {
    const result = deriveBudgetFromPrior(prior, 0)
    expect(result[0].amount_try).toBeCloseTo(100_000)
  })

  it('68. handles empty prior actuals', () => {
    const result = deriveBudgetFromPrior([])
    expect(result).toHaveLength(0)
  })

  it('69. handles negative growth rate (decline scenario)', () => {
    const result = deriveBudgetFromPrior(prior, -5)
    expect(result[0].amount_try).toBeCloseTo(95_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 11. computeBudgetTrend
// ═══════════════════════════════════════════════════════════════════════════

describe('computeBudgetTrend', () => {
  function makePeriodWithNetVar(period: string, netVarPct: number): BudgetPeriod {
    return {
      period,
      lines: [],
      total_budget_revenue: 100_000,
      total_actual_revenue: 100_000,
      total_budget_expenses: 60_000,
      total_actual_expenses: 60_000,
      budget_net_income: 40_000,
      actual_net_income: 40_000 * (1 + netVarPct / 100),
      net_income_variance_try: 40_000 * (netVarPct / 100),
      net_income_variance_pct: netVarPct,
      is_net_income_favorable: netVarPct >= 0,
    }
  }

  it('70. returns insufficient_data for single period', () => {
    expect(computeBudgetTrend([makePeriodWithNetVar('2026-01', 5)])).toBe('insufficient_data')
  })

  it('71. returns insufficient_data for empty periods', () => {
    expect(computeBudgetTrend([])).toBe('insufficient_data')
  })

  it('72. returns improving when last period variance_pct > first by >5pp', () => {
    const periods = [
      makePeriodWithNetVar('2026-01', -10),
      makePeriodWithNetVar('2026-02', 5),   // +15pp diff
    ]
    expect(computeBudgetTrend(periods)).toBe('improving')
  })

  it('73. returns declining when last period variance_pct < first by >5pp', () => {
    const periods = [
      makePeriodWithNetVar('2026-01', 10),
      makePeriodWithNetVar('2026-02', 0),   // -10pp diff
    ]
    expect(computeBudgetTrend(periods)).toBe('declining')
  })

  it('74. returns stable when difference is within 5pp', () => {
    const periods = [
      makePeriodWithNetVar('2026-01', 5),
      makePeriodWithNetVar('2026-02', 8),  // +3pp diff
    ]
    expect(computeBudgetTrend(periods)).toBe('stable')
  })

  it('75. returns stable when difference is exactly 5pp (boundary)', () => {
    const periods = [
      makePeriodWithNetVar('2026-01', 0),
      makePeriodWithNetVar('2026-02', 5),  // exactly +5pp — not > 5
    ]
    expect(computeBudgetTrend(periods)).toBe('stable')
  })

  it('76. uses first and last period (not sequential pairwise)', () => {
    const periods = [
      makePeriodWithNetVar('2026-01', -20),
      makePeriodWithNetVar('2026-02', -5),
      makePeriodWithNetVar('2026-03', 10), // last vs first: +30pp → improving
    ]
    expect(computeBudgetTrend(periods)).toBe('improving')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 12. computeRunRate
// ═══════════════════════════════════════════════════════════════════════════

describe('computeRunRate', () => {
  it('77. annualizes correctly for 6 months', () => {
    const result = computeRunRate(600_000, 360_000, 6)
    expect(result.run_rate_revenue).toBeCloseTo(1_200_000)
    expect(result.run_rate_expenses).toBeCloseTo(720_000)
    expect(result.run_rate_net_income).toBeCloseTo(480_000)
  })

  it('78. annualizes correctly for 1 month', () => {
    const result = computeRunRate(100_000, 70_000, 1)
    expect(result.run_rate_revenue).toBeCloseTo(1_200_000)
    expect(result.run_rate_expenses).toBeCloseTo(840_000)
  })

  it('79. handles 12 months elapsed (= YTD is full year)', () => {
    const result = computeRunRate(1_200_000, 840_000, 12)
    expect(result.run_rate_revenue).toBeCloseTo(1_200_000)
    expect(result.run_rate_net_income).toBeCloseTo(360_000)
  })

  it('80. run_rate_net_income = revenue - expenses', () => {
    const result = computeRunRate(120_000, 80_000, 3)
    expect(result.run_rate_net_income).toBeCloseTo(
      result.run_rate_revenue - result.run_rate_expenses,
    )
  })

  it('81. handles zero months elapsed (defaults to 1 to avoid division by zero)', () => {
    const result = computeRunRate(100_000, 60_000, 0)
    expect(Number.isFinite(result.run_rate_revenue)).toBe(true)
    expect(result.run_rate_revenue).toBeCloseTo(1_200_000)
  })

  it('82. handles zero revenue (early stage)', () => {
    const result = computeRunRate(0, 50_000, 3)
    expect(result.run_rate_revenue).toBeCloseTo(0)
    expect(result.run_rate_net_income).toBeCloseTo(-200_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 13. Integration: full period with mixed favorable/unfavorable lines
// ═══════════════════════════════════════════════════════════════════════════

describe('Integration: full period analysis', () => {
  const budgetData = [
    { category: 'revenue',   amount_try: 500_000 },
    { category: 'salary',    amount_try: 120_000 },
    { category: 'rent',      amount_try: 30_000 },
    { category: 'marketing', amount_try: 25_000 },
    { category: 'software',  amount_try: 10_000 },
  ]

  const actualData = [
    { category: 'revenue',   amount_try: 480_000 }, // -4%: unfavorable
    { category: 'salary',    amount_try: 115_000 }, // -4.2%: favorable (under budget)
    { category: 'rent',      amount_try: 35_000 },  // +16.7%: unfavorable (over budget)
    { category: 'marketing', amount_try: 20_000 },  // -20%: favorable (under budget)
    { category: 'software',  amount_try: 10_000 },  // on budget: favorable
  ]

  // budget_net_income = 500k - (120k+30k+25k+10k) = 500k - 185k = 315k
  // actual_net_income = 480k - (115k+35k+20k+10k) = 480k - 180k = 300k

  const period = buildBudgetPeriod('2026-05', budgetData, actualData)

  it('83. period has correct number of lines', () => {
    expect(period.lines).toHaveLength(5)
  })

  it('84. revenue line is unfavorable (actual < budget)', () => {
    const revLine = period.lines.find(l => l.category === 'revenue')!
    expect(revLine.is_favorable).toBe(false)
    expect(revLine.variance_try).toBe(-20_000)
  })

  it('85. salary line is favorable (under budget)', () => {
    const salLine = period.lines.find(l => l.category === 'salary')!
    expect(salLine.is_favorable).toBe(true)
    expect(salLine.variance_try).toBe(-5_000)
  })

  it('86. rent line is unfavorable (over budget)', () => {
    const rentLine = period.lines.find(l => l.category === 'rent')!
    expect(rentLine.is_favorable).toBe(false)
    expect(rentLine.variance_try).toBe(5_000)
  })

  it('87. budget_net_income = 500k - 185k = 315k', () => {
    expect(period.budget_net_income).toBe(315_000)
  })

  it('88. actual_net_income = 480k - 180k = 300k', () => {
    expect(period.actual_net_income).toBe(300_000)
  })

  it('89. is_net_income_favorable = false (300k < 315k)', () => {
    expect(period.is_net_income_favorable).toBe(false)
  })

  it('90. classifies performance correctly (300k / 315k ≈ 95.2% → on_track)', () => {
    const perf = classifyBudgetPerformance(period.budget_net_income, period.actual_net_income)
    expect(perf).toBe('on_track')
  })

  it('91. findLargestVariance: revenue abs variance (20k) > rent abs variance (5k)', () => {
    const largest = findLargestVariance(period.lines)
    expect(largest?.category).toBe('revenue')
    expect(Math.abs(largest!.variance_try)).toBe(20_000)
  })

  it('92. findOverBudgetCategories finds rent (16.7% > 10% threshold)', () => {
    const overBudget = findOverBudgetCategories(period.lines)
    const cats = overBudget.map(l => l.category)
    expect(cats).toContain('rent')
  })

  it('93. revenue NOT in over-budget categories (|variance_pct|=4% < 10% threshold)', () => {
    const overBudget = findOverBudgetCategories(period.lines)
    const cats = overBudget.map(l => l.category)
    expect(cats).not.toContain('revenue')
  })

  it('94. YTD from single period matches period totals', () => {
    const ytd = computeYtdVariance([period])
    expect(ytd.ytd_actual_revenue).toBe(period.total_actual_revenue)
    expect(ytd.ytd_actual_expenses).toBe(period.total_actual_expenses)
  })

  it('95. run rate for 5 months elapsed projects correctly', () => {
    const rr = computeRunRate(
      period.total_actual_revenue,
      period.total_actual_expenses,
      5,
    )
    expect(rr.run_rate_revenue).toBeCloseTo((480_000 / 5) * 12)
    expect(rr.run_rate_expenses).toBeCloseTo((180_000 / 5) * 12)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 14. classifyRevenueVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyRevenueVariance', () => {
  it('96. returns no_budget for null', () => {
    expect(classifyRevenueVariance(null)).toBe('no_budget')
  })

  it('97. returns favorable when >= 5%', () => {
    expect(classifyRevenueVariance(5)).toBe('favorable')
    expect(classifyRevenueVariance(10)).toBe('favorable')
    expect(classifyRevenueVariance(50)).toBe('favorable')
  })

  it('98. returns on_track when within (-5, 5)', () => {
    expect(classifyRevenueVariance(0)).toBe('on_track')
    expect(classifyRevenueVariance(-4.9)).toBe('on_track')
    expect(classifyRevenueVariance(4.9)).toBe('on_track')
  })

  it('99. returns minor_shortfall for [-15, -5]', () => {
    // -5 is NOT > -5, so falls into minor_shortfall (on_track requires > -5)
    expect(classifyRevenueVariance(-5)).toBe('minor_shortfall')
    expect(classifyRevenueVariance(-5.1)).toBe('minor_shortfall')
    expect(classifyRevenueVariance(-14.9)).toBe('minor_shortfall')
  })

  it('100. returns major_shortfall for [-25, -15)', () => {
    // -15 is NOT > -15, so it falls into major_shortfall
    expect(classifyRevenueVariance(-15)).toBe('major_shortfall')
    expect(classifyRevenueVariance(-15.1)).toBe('major_shortfall')
    expect(classifyRevenueVariance(-24.9)).toBe('major_shortfall')
  })

  it('101. returns critical_shortfall when <= -25%', () => {
    // -25 is NOT > -25, so it falls into critical_shortfall
    expect(classifyRevenueVariance(-25)).toBe('critical_shortfall')
    expect(classifyRevenueVariance(-25.1)).toBe('critical_shortfall')
    expect(classifyRevenueVariance(-100)).toBe('critical_shortfall')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 15. classifyExpenseVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyExpenseVariance', () => {
  it('102. returns no_budget for null', () => {
    expect(classifyExpenseVariance(null)).toBe('no_budget')
  })

  it('103. returns under_budget when <= -5%', () => {
    expect(classifyExpenseVariance(-5)).toBe('under_budget')
    expect(classifyExpenseVariance(-10)).toBe('under_budget')
    expect(classifyExpenseVariance(-50)).toBe('under_budget')
  })

  it('104. returns on_track within (-5, 5)', () => {
    expect(classifyExpenseVariance(0)).toBe('on_track')
    expect(classifyExpenseVariance(-4.9)).toBe('on_track')
    expect(classifyExpenseVariance(4.9)).toBe('on_track')
  })

  it('105. returns minor_overrun for [5, 15)', () => {
    expect(classifyExpenseVariance(5)).toBe('minor_overrun')
    expect(classifyExpenseVariance(14.9)).toBe('minor_overrun')
  })

  it('106. returns major_overrun for [15, 25)', () => {
    expect(classifyExpenseVariance(15)).toBe('major_overrun')
    expect(classifyExpenseVariance(24.9)).toBe('major_overrun')
  })

  it('107. returns critical_overrun when >= 25%', () => {
    expect(classifyExpenseVariance(25)).toBe('critical_overrun')
    expect(classifyExpenseVariance(50)).toBe('critical_overrun')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 16. computeFullYearForecast
// ═══════════════════════════════════════════════════════════════════════════

describe('computeFullYearForecast', () => {
  it('108. returns null when monthsElapsed = 0', () => {
    expect(computeFullYearForecast(500_000, 0)).toBeNull()
  })

  it('109. extrapolates correctly for 5 months', () => {
    expect(computeFullYearForecast(500_000, 5)).toBeCloseTo((500_000 / 5) * 12)
  })

  it('110. returns same value for 12 months', () => {
    expect(computeFullYearForecast(1_200_000, 12)).toBeCloseTo(1_200_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 17. computeBudgetAttainment
// ═══════════════════════════════════════════════════════════════════════════

describe('computeBudgetAttainment', () => {
  it('111. returns null when budget = 0', () => {
    expect(computeBudgetAttainment(50_000, 0)).toBeNull()
  })

  it('112. returns 100 when actual = budget', () => {
    expect(computeBudgetAttainment(100_000, 100_000)).toBeCloseTo(100)
  })

  it('113. caps at 200% for extremely large actuals', () => {
    expect(computeBudgetAttainment(1_000_000, 100_000)).toBeCloseTo(200)
  })

  it('114. returns 50 when actual is half of budget', () => {
    expect(computeBudgetAttainment(50_000, 100_000)).toBeCloseTo(50)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 18. computePaceAdjustedBudget
// ═══════════════════════════════════════════════════════════════════════════

describe('computePaceAdjustedBudget', () => {
  it('115. returns null when monthsElapsed < 0', () => {
    expect(computePaceAdjustedBudget(1_200_000, -1)).toBeNull()
  })

  it('116. returns 0 when monthsElapsed = 0', () => {
    expect(computePaceAdjustedBudget(1_200_000, 0)).toBeCloseTo(0)
  })

  it('117. returns half of annual budget at 6 months', () => {
    expect(computePaceAdjustedBudget(1_200_000, 6)).toBeCloseTo(600_000)
  })

  it('118. returns full budget at 12 months', () => {
    expect(computePaceAdjustedBudget(1_200_000, 12)).toBeCloseTo(1_200_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 19. classifyPaceVsBudget
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyPaceVsBudget', () => {
  it('119. returns no_data when paceAdjustedBudget is null', () => {
    expect(classifyPaceVsBudget(500_000, null)).toBe('no_data')
  })

  it('120. returns ahead when ytdActual >= paceAdjustedBudget * 1.05', () => {
    expect(classifyPaceVsBudget(105_000, 100_000)).toBe('ahead')
    expect(classifyPaceVsBudget(110_000, 100_000)).toBe('ahead')
  })

  it('121. returns on_pace within [0.95, 1.05)', () => {
    expect(classifyPaceVsBudget(100_000, 100_000)).toBe('on_pace')
    expect(classifyPaceVsBudget(95_000, 100_000)).toBe('on_pace')
    expect(classifyPaceVsBudget(104_999, 100_000)).toBe('on_pace')
  })

  it('122. returns behind within [0.80, 0.95)', () => {
    expect(classifyPaceVsBudget(90_000, 100_000)).toBe('behind')
    expect(classifyPaceVsBudget(80_000, 100_000)).toBe('behind')
  })

  it('123. returns significantly_behind when < 0.80', () => {
    expect(classifyPaceVsBudget(79_999, 100_000)).toBe('significantly_behind')
    expect(classifyPaceVsBudget(0, 100_000)).toBe('significantly_behind')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 20. computeTotalVariance
// ═══════════════════════════════════════════════════════════════════════════

describe('computeTotalVariance', () => {
  it('124. sums actuals and budgets correctly', () => {
    const items = [
      { actual: 100, budget: 90 },
      { actual: 200, budget: 210 },
    ]
    const result = computeTotalVariance(items)
    expect(result.total_actual).toBe(300)
    expect(result.total_budget).toBe(300)
    expect(result.total_variance).toBe(0)
  })

  it('125. returns null total_variance_pct when total_budget = 0', () => {
    const items = [{ actual: 100, budget: 0 }]
    const result = computeTotalVariance(items)
    expect(result.total_variance_pct).toBeNull()
  })

  it('126. handles empty items array', () => {
    const result = computeTotalVariance([])
    expect(result.total_actual).toBe(0)
    expect(result.total_budget).toBe(0)
    expect(result.total_variance).toBe(0)
    expect(result.total_variance_pct).toBeNull()
  })

  it('127. computes variance pct correctly', () => {
    const items = [{ actual: 120, budget: 100 }]
    const result = computeTotalVariance(items)
    expect(result.total_variance_pct).toBeCloseTo(20)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 21. findLargestVarianceItem
// ═══════════════════════════════════════════════════════════════════════════

describe('findLargestVarianceItem', () => {
  it('128. returns null for empty array', () => {
    expect(findLargestVarianceItem([])).toBeNull()
  })

  it('129. returns sole item for single-element array', () => {
    const items = [{ label: 'rent', variance: 5000 }]
    expect(findLargestVarianceItem(items)).toEqual(items[0])
  })

  it('130. returns item with largest absolute variance', () => {
    const items = [
      { label: 'rent', variance: 5000 },
      { label: 'salary', variance: -15000 },
      { label: 'marketing', variance: 3000 },
    ]
    expect(findLargestVarianceItem(items)?.label).toBe('salary')
  })

  it('131. handles negative variances (largest absolute)', () => {
    const items = [
      { label: 'a', variance: -1000 },
      { label: 'b', variance: 500 },
    ]
    expect(findLargestVarianceItem(items)?.label).toBe('a')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 22. computeVarianceHealthScore
// ═══════════════════════════════════════════════════════════════════════════

describe('computeVarianceHealthScore', () => {
  it('132. returns 100 for empty classifications', () => {
    expect(computeVarianceHealthScore([])).toBe(100)
  })

  it('133. deducts 20 for each critical_shortfall', () => {
    expect(computeVarianceHealthScore(['critical_shortfall'])).toBe(80)
    expect(computeVarianceHealthScore(['critical_shortfall', 'critical_shortfall'])).toBe(60)
  })

  it('134. deducts 20 for critical_overrun', () => {
    expect(computeVarianceHealthScore(['critical_overrun'])).toBe(80)
  })

  it('135. deducts 10 for major_shortfall or major_overrun', () => {
    expect(computeVarianceHealthScore(['major_shortfall'])).toBe(90)
    expect(computeVarianceHealthScore(['major_overrun'])).toBe(90)
  })

  it('136. deducts 5 for minor_shortfall or minor_overrun', () => {
    expect(computeVarianceHealthScore(['minor_shortfall'])).toBe(95)
    expect(computeVarianceHealthScore(['minor_overrun'])).toBe(95)
  })

  it('137. floors at 0 for many critical issues', () => {
    const many = Array(10).fill('critical_overrun')
    expect(computeVarianceHealthScore(many)).toBe(0)
  })

  it('138. mixed: critical + major + minor', () => {
    const score = computeVarianceHealthScore(['critical_shortfall', 'major_overrun', 'minor_shortfall'])
    expect(score).toBe(100 - 20 - 10 - 5) // 65
  })

  it('139. on_track and favorable classifications do not deduct', () => {
    expect(computeVarianceHealthScore(['on_track', 'favorable', 'under_budget'])).toBe(100)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 23. classifyVarianceHealth
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyVarianceHealth', () => {
  it('140. returns healthy for score >= 80', () => {
    expect(classifyVarianceHealth(100)).toBe('healthy')
    expect(classifyVarianceHealth(80)).toBe('healthy')
  })

  it('141. returns moderate for score >= 60 and < 80', () => {
    expect(classifyVarianceHealth(79)).toBe('moderate')
    expect(classifyVarianceHealth(60)).toBe('moderate')
  })

  it('142. returns concerning for score >= 40 and < 60', () => {
    expect(classifyVarianceHealth(59)).toBe('concerning')
    expect(classifyVarianceHealth(40)).toBe('concerning')
  })

  it('143. returns critical for score < 40', () => {
    expect(classifyVarianceHealth(39)).toBe('critical')
    expect(classifyVarianceHealth(0)).toBe('critical')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 24. generateVarianceNarrative
// ═══════════════════════════════════════════════════════════════════════════

describe('generateVarianceNarrative', () => {
  it('144. returns Turkish no-budget message when hasBudget = false', () => {
    const result = generateVarianceNarrative('healthy', 10, -5, false)
    expect(result).toContain('Bütçe verisi bulunamadı')
  })

  it('145. healthy narrative mentions sağlıklı', () => {
    const result = generateVarianceNarrative('healthy', 5, -3, true)
    expect(result).toContain('sağlıklı')
  })

  it('146. moderate narrative mentions orta', () => {
    const result = generateVarianceNarrative('moderate', -8, 8, true)
    expect(result).toContain('orta')
  })

  it('147. concerning narrative mentions endişe', () => {
    const result = generateVarianceNarrative('concerning', -20, 20, true)
    expect(result).toContain('endişe')
  })

  it('148. critical narrative mentions kritik', () => {
    const result = generateVarianceNarrative('critical', -30, 30, true)
    expect(result).toContain('kritik')
  })

  it('149. includes revenue variance info when revenueVariancePct is provided', () => {
    const result = generateVarianceNarrative('healthy', 10, null, true)
    expect(result).toContain('Gelir')
  })

  it('150. includes expense variance info when expenseVariancePct is provided', () => {
    const result = generateVarianceNarrative('healthy', null, -5, true)
    expect(result).toContain('Giderler')
  })
})
