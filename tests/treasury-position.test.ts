/**
 * Treasury Cash Position Service — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCurrentRatio,
  computeQuickRatio,
  computeCashRatio,
  classifyLiquidityPosition,
  computeCashVelocity,
  computeDaysCashOnHand,
  classifyDaysCashOnHand,
  computeCashBurnRate,
  estimateRunwayFromCash,
  buildCashFlowProjection,
  computeCashConcentrationRisk,
  computeWorkingCapitalTurnover,
  computeTreasuryHealthScore,
} from '../lib/services/finance/treasury-position.service'

// ── computeCurrentRatio ───────────────────────────────────────────────────────

describe('computeCurrentRatio', () => {

  it('1. null when currentLiabilities = 0', () => {
    expect(computeCurrentRatio(500_000, 0)).toBeNull()
  })

  it('2. correct ratio (2.0)', () => {
    expect(computeCurrentRatio(200_000, 100_000)).toBe(2.0)
  })

  it('3. ratio below 1 when assets < liabilities', () => {
    expect(computeCurrentRatio(50_000, 100_000)).toBe(0.5)
  })

  it('4. ratio = 1.0 when assets = liabilities', () => {
    expect(computeCurrentRatio(100_000, 100_000)).toBe(1.0)
  })

  it('5. zero assets → 0', () => {
    expect(computeCurrentRatio(0, 100_000)).toBe(0)
  })
})

// ── computeQuickRatio ─────────────────────────────────────────────────────────

describe('computeQuickRatio', () => {

  it('6. null when currentLiabilities = 0', () => {
    expect(computeQuickRatio(500_000, 100_000, 0)).toBeNull()
  })

  it('7. correctly subtracts inventory', () => {
    // (300k - 50k) / 100k = 2.5
    expect(computeQuickRatio(300_000, 50_000, 100_000)).toBe(2.5)
  })

  it('8. inventory = 0 → same as current ratio', () => {
    expect(computeQuickRatio(200_000, 0, 100_000)).toBe(2.0)
  })

  it('9. inventory exceeds assets → negative ratio', () => {
    // (50k - 100k) / 50k = -1.0
    expect(computeQuickRatio(50_000, 100_000, 50_000)).toBe(-1.0)
  })

  it('10. standard case with inventory reducing ratio', () => {
    expect(computeQuickRatio(150_000, 50_000, 100_000)).toBe(1.0)
  })
})

// ── computeCashRatio ──────────────────────────────────────────────────────────

describe('computeCashRatio', () => {

  it('11. null when currentLiabilities = 0', () => {
    expect(computeCashRatio(100_000, 0)).toBeNull()
  })

  it('12. correct ratio (0.5)', () => {
    expect(computeCashRatio(50_000, 100_000)).toBe(0.5)
  })

  it('13. ratio = 1.0 when cash equals liabilities', () => {
    expect(computeCashRatio(100_000, 100_000)).toBe(1.0)
  })

  it('14. zero cash → 0 ratio', () => {
    expect(computeCashRatio(0, 100_000)).toBe(0)
  })

  it('15. cash exceeds liabilities → ratio > 1', () => {
    expect(computeCashRatio(200_000, 100_000)).toBe(2.0)
  })
})

// ── classifyLiquidityPosition ─────────────────────────────────────────────────

describe('classifyLiquidityPosition', () => {

  it('16. insolvent when net_liquidity < 0', () => {
    expect(classifyLiquidityPosition(2.5, -1)).toBe('insolvent')
  })

  it('17. insolvent overrides strong ratio', () => {
    expect(classifyLiquidityPosition(5.0, -100)).toBe('insolvent')
  })

  it('18. strong when ratio >= 2.0 and net_liquidity >= 0', () => {
    expect(classifyLiquidityPosition(2.0, 0)).toBe('strong')
  })

  it('19. strong when ratio > 2.0', () => {
    expect(classifyLiquidityPosition(3.5, 50_000)).toBe('strong')
  })

  it('20. adequate when ratio >= 1.5 and < 2.0', () => {
    expect(classifyLiquidityPosition(1.5, 10_000)).toBe('adequate')
  })

  it('21. adequate when ratio = 1.8', () => {
    expect(classifyLiquidityPosition(1.8, 5_000)).toBe('adequate')
  })

  it('22. tight when ratio >= 1.0 and < 1.5', () => {
    expect(classifyLiquidityPosition(1.0, 1_000)).toBe('tight')
  })

  it('23. tight when ratio = 1.2', () => {
    expect(classifyLiquidityPosition(1.2, 500)).toBe('tight')
  })

  it('24. critical when ratio < 1.0 and null', () => {
    expect(classifyLiquidityPosition(null, 0)).toBe('critical')
  })

  it('25. critical when ratio = 0.8', () => {
    expect(classifyLiquidityPosition(0.8, 100)).toBe('critical')
  })
})

// ── computeCashVelocity ───────────────────────────────────────────────────────

describe('computeCashVelocity', () => {

  it('26. null when totalCash = 0', () => {
    expect(computeCashVelocity(100_000, 0)).toBeNull()
  })

  it('27. correct velocity (2.0 turns/month)', () => {
    expect(computeCashVelocity(200_000, 100_000)).toBe(2.0)
  })

  it('28. low velocity when cash is large vs revenue', () => {
    expect(computeCashVelocity(50_000, 500_000)).toBe(0.1)
  })

  it('29. velocity = 1 when revenue = cash', () => {
    expect(computeCashVelocity(100_000, 100_000)).toBe(1.0)
  })
})

// ── computeDaysCashOnHand ─────────────────────────────────────────────────────

describe('computeDaysCashOnHand', () => {

  it('30. null when monthlyOperatingExpenses = 0', () => {
    expect(computeDaysCashOnHand(100_000, 0)).toBeNull()
  })

  it('31. correct formula: cash / (expenses / 30)', () => {
    // 300k / (150k / 30) = 300k / 5k = 60 days
    expect(computeDaysCashOnHand(300_000, 150_000)).toBe(60)
  })

  it('32. 30 days when cash = monthly expenses', () => {
    expect(computeDaysCashOnHand(100_000, 100_000)).toBe(30)
  })

  it('33. 90 days when cash = 3 × monthly expenses', () => {
    expect(computeDaysCashOnHand(300_000, 100_000)).toBe(90)
  })

  it('34. less than 30 days when cash < expenses', () => {
    // 50k / (100k / 30) = 15 days
    expect(computeDaysCashOnHand(50_000, 100_000)).toBe(15)
  })
})

// ── classifyDaysCashOnHand ────────────────────────────────────────────────────

describe('classifyDaysCashOnHand', () => {

  it('35. unknown when null input', () => {
    expect(classifyDaysCashOnHand(null)).toBe('unknown')
  })

  it('36. excellent when >= 90 days', () => {
    expect(classifyDaysCashOnHand(90)).toBe('excellent')
  })

  it('37. excellent when > 90 days', () => {
    expect(classifyDaysCashOnHand(120)).toBe('excellent')
  })

  it('38. good when >= 60 and < 90', () => {
    expect(classifyDaysCashOnHand(60)).toBe('good')
  })

  it('39. good when 75 days', () => {
    expect(classifyDaysCashOnHand(75)).toBe('good')
  })

  it('40. adequate when >= 30 and < 60', () => {
    expect(classifyDaysCashOnHand(30)).toBe('adequate')
  })

  it('41. adequate when 45 days', () => {
    expect(classifyDaysCashOnHand(45)).toBe('adequate')
  })

  it('42. low when >= 14 and < 30', () => {
    expect(classifyDaysCashOnHand(14)).toBe('low')
  })

  it('43. low when 20 days', () => {
    expect(classifyDaysCashOnHand(20)).toBe('low')
  })

  it('44. critical when < 14 days', () => {
    expect(classifyDaysCashOnHand(13)).toBe('critical')
  })

  it('45. critical when 0 days', () => {
    expect(classifyDaysCashOnHand(0)).toBe('critical')
  })
})

// ── computeCashBurnRate ───────────────────────────────────────────────────────

describe('computeCashBurnRate', () => {

  it('46. positive when expenses > revenue (burning)', () => {
    expect(computeCashBurnRate(100_000, 150_000)).toBe(50_000)
  })

  it('47. negative when revenue > expenses (generating)', () => {
    expect(computeCashBurnRate(200_000, 150_000)).toBe(-50_000)
  })

  it('48. zero when revenue = expenses (break-even)', () => {
    expect(computeCashBurnRate(100_000, 100_000)).toBe(0)
  })

  it('49. zero revenue → full expenses as burn', () => {
    expect(computeCashBurnRate(0, 100_000)).toBe(100_000)
  })
})

// ── estimateRunwayFromCash ────────────────────────────────────────────────────

describe('estimateRunwayFromCash', () => {

  it('50. null when not burning (burn = 0)', () => {
    expect(estimateRunwayFromCash(100_000, 0)).toBeNull()
  })

  it('51. null when generating cash (burn < 0)', () => {
    expect(estimateRunwayFromCash(100_000, -30_000)).toBeNull()
  })

  it('52. correct runway calculation (months)', () => {
    // 300k / 50k = 6 months
    expect(estimateRunwayFromCash(300_000, 50_000)).toBe(6)
  })

  it('53. runway < 1 month when cash nearly depleted', () => {
    // 10k / 50k = 0.2 months
    expect(estimateRunwayFromCash(10_000, 50_000)).toBe(0.2)
  })

  it('54. runway proportional to cash', () => {
    expect(estimateRunwayFromCash(150_000, 50_000)).toBe(3)
  })
})

// ── buildCashFlowProjection ───────────────────────────────────────────────────

describe('buildCashFlowProjection', () => {

  it('55. returns exactly 4 items', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result).toHaveLength(4)
  })

  it('56. weeks are 1-based (1, 2, 3, 4)', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result.map(w => w.week)).toEqual([1, 2, 3, 4])
  })

  it('57. first week label is "Bu hafta"', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result[0].week_label).toBe('Bu hafta')
  })

  it('58. second week label is "Gelecek hafta"', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result[1].week_label).toBe('Gelecek hafta')
  })

  it('59. net_cash_flow = inflows - outflows', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result[0].net_cash_flow_try).toBe(10_000)
  })

  it('60. cumulative increases correctly (positive flow)', () => {
    // start=100k, net=+10k each week → 110k, 120k, 130k, 140k
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result[0].cumulative_cash_try).toBe(110_000)
    expect(result[1].cumulative_cash_try).toBe(120_000)
    expect(result[2].cumulative_cash_try).toBe(130_000)
    expect(result[3].cumulative_cash_try).toBe(140_000)
  })

  it('61. is_negative = false when cumulative > 0', () => {
    const result = buildCashFlowProjection(100_000, 50_000, 40_000)
    expect(result.every(w => !w.is_negative)).toBe(true)
  })

  it('62. is_negative = true when cumulative goes below 0', () => {
    // start=10k, net=-50k each week
    const result = buildCashFlowProjection(10_000, 0, 50_000)
    expect(result[0].is_negative).toBe(true)
  })

  it('63. negative flow reduces cumulative correctly', () => {
    // start=200k, outflows > inflows: net = -10k
    const result = buildCashFlowProjection(200_000, 40_000, 50_000)
    expect(result[0].cumulative_cash_try).toBe(190_000)
    expect(result[3].cumulative_cash_try).toBe(160_000)
  })
})

// ── computeCashConcentrationRisk ──────────────────────────────────────────────

describe('computeCashConcentrationRisk', () => {

  it('64. 0 for single account (single is not multi-account risk)', () => {
    expect(computeCashConcentrationRisk([500_000])).toBe(0)
  })

  it('65. 0 for empty array', () => {
    expect(computeCashConcentrationRisk([])).toBe(0)
  })

  it('66. 0 when all balances are zero', () => {
    expect(computeCashConcentrationRisk([0, 0, 0])).toBe(0)
  })

  it('67. 100% when one account holds all cash', () => {
    expect(computeCashConcentrationRisk([100_000, 0, 0])).toBe(100)
  })

  it('68. 50% for two equal accounts', () => {
    expect(computeCashConcentrationRisk([100_000, 100_000])).toBe(50)
  })

  it('69. correct pct for unequal accounts (75%)', () => {
    // 300k / (300k + 100k) * 100 = 75%
    expect(computeCashConcentrationRisk([300_000, 100_000])).toBe(75)
  })

  it('70. correct pct for 3 accounts', () => {
    // largest=500k, total=1000k → 50%
    expect(computeCashConcentrationRisk([500_000, 300_000, 200_000])).toBe(50)
  })
})

// ── computeWorkingCapitalTurnover ─────────────────────────────────────────────

describe('computeWorkingCapitalTurnover', () => {

  it('71. null when currentLiabilities >= currentAssets (NWC <= 0)', () => {
    expect(computeWorkingCapitalTurnover(1_000_000, 100_000, 100_000)).toBeNull()
  })

  it('72. null when currentLiabilities > currentAssets', () => {
    expect(computeWorkingCapitalTurnover(1_000_000, 50_000, 100_000)).toBeNull()
  })

  it('73. correct turnover calculation', () => {
    // annual=1200k, NWC = 200k - 100k = 100k → 12x
    expect(computeWorkingCapitalTurnover(1_200_000, 200_000, 100_000)).toBe(12)
  })

  it('74. turnover = 1 when revenue = NWC', () => {
    expect(computeWorkingCapitalTurnover(100_000, 200_000, 100_000)).toBe(1)
  })
})

// ── computeTreasuryHealthScore ────────────────────────────────────────────────

describe('computeTreasuryHealthScore', () => {

  it('75. score in [0, 100] for strong inputs', () => {
    const score = computeTreasuryHealthScore(120, 2.5, 500_000, 300_000)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('76. score in [0, 100] for critical inputs', () => {
    const score = computeTreasuryHealthScore(5, 0.5, -50_000, 100_000)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('77. null days and null ratio → score = 40+35+25 component partial', () => {
    // null days → 40*0.4=16, null ratio → 35*0.35=12.25, liquidity component
    const score = computeTreasuryHealthScore(null, null, 50_000, 100_000)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('78. negative net_liquidity lowers score vs positive', () => {
    const scorePos = computeTreasuryHealthScore(60, 1.5, 50_000, 100_000)
    const scoreNeg = computeTreasuryHealthScore(60, 1.5, -50_000, 100_000)
    expect(scorePos).toBeGreaterThan(scoreNeg)
  })

  it('79. excellent days_cash (90) gives higher score than critical (<14)', () => {
    const excellent = computeTreasuryHealthScore(90, 2.0, 100_000, 200_000)
    const critical  = computeTreasuryHealthScore(10, 0.8, -10_000, 50_000)
    expect(excellent).toBeGreaterThan(critical)
  })

  it('80. current_ratio affects score', () => {
    const strong   = computeTreasuryHealthScore(60, 2.0, 50_000, 100_000)
    const critical = computeTreasuryHealthScore(60, 0.5, 50_000, 100_000)
    expect(strong).toBeGreaterThan(critical)
  })

  it('81. score = 0 for worst possible inputs', () => {
    const score = computeTreasuryHealthScore(0, 0, -999_999, 0)
    expect(score).toBe(0)
  })
})

// ── Integration test ──────────────────────────────────────────────────────────

describe('Integration: total_cash=₺300K, expenses=₺150K/mo, revenue=₺180K/mo', () => {

  const totalCash      = 300_000
  const monthlyExpenses = 150_000
  const monthlyRevenue  = 180_000

  it('82. days_cash = 60 (300k / (150k/30))', () => {
    const days = computeDaysCashOnHand(totalCash, monthlyExpenses)
    expect(days).toBe(60)
  })

  it('83. days_cash classified as "good"', () => {
    const days = computeDaysCashOnHand(totalCash, monthlyExpenses)
    expect(classifyDaysCashOnHand(days)).toBe('good')
  })

  it('84. burn rate = -30k (generating cash)', () => {
    const burn = computeCashBurnRate(monthlyRevenue, monthlyExpenses)
    expect(burn).toBe(-30_000)
  })

  it('85. runway = null (not burning cash)', () => {
    const burn    = computeCashBurnRate(monthlyRevenue, monthlyExpenses)
    const runway  = estimateRunwayFromCash(totalCash, burn)
    expect(runway).toBeNull()
  })

  it('86. cash velocity = 0.6 turns/month', () => {
    const velocity = computeCashVelocity(monthlyRevenue, totalCash)
    expect(velocity).toBe(0.6)
  })

  it('87. 4-week projection has 4 items', () => {
    const weeklyInflows  = monthlyRevenue / 4.33
    const weeklyOutflows = monthlyExpenses / 4.33
    const proj = buildCashFlowProjection(totalCash, weeklyInflows, weeklyOutflows)
    expect(proj).toHaveLength(4)
  })

  it('88. all weeks are positive (generating cash)', () => {
    const weeklyInflows  = monthlyRevenue / 4.33
    const weeklyOutflows = monthlyExpenses / 4.33
    const proj = buildCashFlowProjection(totalCash, weeklyInflows, weeklyOutflows)
    expect(proj.every(w => !w.is_negative)).toBe(true)
  })

  it('89. cumulative cash grows each week', () => {
    const weeklyInflows  = monthlyRevenue / 4.33
    const weeklyOutflows = monthlyExpenses / 4.33
    const proj = buildCashFlowProjection(totalCash, weeklyInflows, weeklyOutflows)
    // Each week cumulative should be greater than the previous
    for (let i = 1; i < proj.length; i++) {
      expect(proj[i].cumulative_cash_try).toBeGreaterThan(proj[i - 1].cumulative_cash_try)
    }
  })
})
