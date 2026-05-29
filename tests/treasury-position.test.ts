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

// ── computeCurrentRatio — extended ───────────────────────────────────────────

describe('computeCurrentRatio — extended', () => {

  it('90. large ratio when assets greatly exceed liabilities', () => {
    expect(computeCurrentRatio(5_000_000, 100_000)).toBe(50)
  })

  it('91. very small ratio when liabilities dominate', () => {
    // 1000 / 10_000_000 = 0.0001
    expect(computeCurrentRatio(1_000, 10_000_000)).toBeCloseTo(0.0001, 4)
  })

  it('92. exact 1.5 ratio (adequate boundary)', () => {
    expect(computeCurrentRatio(150_000, 100_000)).toBe(1.5)
  })

  it('93. exact 2.0 ratio (strong boundary)', () => {
    expect(computeCurrentRatio(200_000, 100_000)).toBe(2)
  })

  it('94. fractional result not rounded — raw division', () => {
    // 100_000 / 75_000 = 1.333...
    expect(computeCurrentRatio(100_000, 75_000)).toBeCloseTo(1.333, 2)
  })

})

// ── computeQuickRatio — extended ─────────────────────────────────────────────

describe('computeQuickRatio — extended', () => {

  it('95. large inventory wipes out most of the quick ratio', () => {
    // (100_000 - 90_000) / 50_000 = 0.2
    expect(computeQuickRatio(100_000, 90_000, 50_000)).toBeCloseTo(0.2, 2)
  })

  it('96. quick ratio 1.5 boundary', () => {
    // (200_000 - 50_000) / 100_000 = 1.5
    expect(computeQuickRatio(200_000, 50_000, 100_000)).toBe(1.5)
  })

  it('97. quick < current when inventory > 0', () => {
    const quick   = computeQuickRatio(300_000, 50_000, 100_000) ?? 0
    const current = computeCurrentRatio(300_000, 100_000) ?? 0
    expect(quick).toBeLessThan(current)
  })

  it('98. zero inventory makes quick ratio equal to current ratio', () => {
    const quick   = computeQuickRatio(200_000, 0, 100_000)
    const current = computeCurrentRatio(200_000, 100_000)
    expect(quick).toBe(current)
  })

})

// ── computeCashRatio — extended ───────────────────────────────────────────────

describe('computeCashRatio — extended', () => {

  it('99. very conservative: cash 10% of liabilities → 0.1', () => {
    expect(computeCashRatio(10_000, 100_000)).toBeCloseTo(0.1, 2)
  })

  it('100. cash ratio ordering: current > quick > cash for same inputs', () => {
    const assets = 300_000
    const inventory = 50_000
    const liab = 100_000
    const cash = 80_000

    const current = computeCurrentRatio(assets, liab) ?? 0
    const quick   = computeQuickRatio(assets, inventory, liab) ?? 0
    const cashR   = computeCashRatio(cash, liab) ?? 0

    expect(current).toBeGreaterThanOrEqual(quick)
    expect(quick).toBeGreaterThanOrEqual(cashR)
  })

  it('101. cash ratio matches obligation coverage concept', () => {
    // Both measure cash / obligations
    expect(computeCashRatio(500_000, 250_000)).toBeCloseTo(2, 2)
  })

})

// ── classifyLiquidityPosition — extended ─────────────────────────────────────

describe('classifyLiquidityPosition — extended', () => {

  it('102. insolvent even with very high ratio if net_liquidity < 0', () => {
    expect(classifyLiquidityPosition(10.0, -1)).toBe('insolvent')
  })

  it('103. critical when ratio exactly 0', () => {
    expect(classifyLiquidityPosition(0, 0)).toBe('critical')
  })

  it('104. strong at ratio 2.0 (exact boundary)', () => {
    expect(classifyLiquidityPosition(2.0, 100_000)).toBe('strong')
  })

  it('105. adequate just below 2.0 (1.999)', () => {
    expect(classifyLiquidityPosition(1.999, 100_000)).toBe('adequate')
  })

  it('106. tight at exactly 1.0', () => {
    expect(classifyLiquidityPosition(1.0, 50_000)).toBe('tight')
  })

  it('107. tight at 1.499', () => {
    expect(classifyLiquidityPosition(1.499, 50_000)).toBe('tight')
  })

  it('108. critical at 0.999', () => {
    expect(classifyLiquidityPosition(0.999, 50_000)).toBe('critical')
  })

  it('109. net_liquidity = 0 is NOT insolvent (needs < 0)', () => {
    expect(classifyLiquidityPosition(2.0, 0)).not.toBe('insolvent')
  })

})

// ── computeCashVelocity — extended ────────────────────────────────────────────

describe('computeCashVelocity — extended', () => {

  it('110. velocity 5 turns/month (very high turnover)', () => {
    expect(computeCashVelocity(500_000, 100_000)).toBe(5)
  })

  it('111. velocity 0.1 (cash much larger than monthly revenue)', () => {
    expect(computeCashVelocity(50_000, 500_000)).toBe(0.1)
  })

  it('112. velocity 0.5 when revenue is half of cash', () => {
    expect(computeCashVelocity(100_000, 200_000)).toBe(0.5)
  })

  it('113. large velocity with tiny cash', () => {
    // 1_000_000 / 100 = 10_000 turns
    expect(computeCashVelocity(1_000_000, 100)).toBe(10_000)
  })

})

// ── computeDaysCashOnHand — extended ──────────────────────────────────────────

describe('computeDaysCashOnHand — extended', () => {

  it('114. 14 days exactly (low boundary)', () => {
    // 14 days: cash = 14 * (expenses/30) → cash = expenses × 14/30
    const expenses = 300_000
    const cash = expenses * 14 / 30
    expect(computeDaysCashOnHand(cash, expenses)).toBeCloseTo(14, 1)
  })

  it('115. 60 days exactly (good boundary)', () => {
    const expenses = 300_000
    const cash = expenses * 60 / 30 // = 2 months of expenses
    expect(computeDaysCashOnHand(cash, expenses)).toBeCloseTo(60, 1)
  })

  it('116. 180 days (6 months) — strong position', () => {
    const expenses = 100_000
    const cash = expenses * 6  // 6 months
    expect(computeDaysCashOnHand(cash, expenses)).toBeCloseTo(180, 1)
  })

  it('117. less than 1 day when nearly depleted', () => {
    // cash = 3_000, expenses = 100_000 → 3000 / (100000/30) = 0.9 days
    expect(computeDaysCashOnHand(3_000, 100_000)).toBeCloseTo(0.9, 1)
  })

})

// ── classifyDaysCashOnHand — extended ─────────────────────────────────────────

describe('classifyDaysCashOnHand — extended', () => {

  it('118. exactly 89 days → good (not excellent)', () => {
    expect(classifyDaysCashOnHand(89)).toBe('good')
  })

  it('119. exactly 59 days → adequate (not good)', () => {
    expect(classifyDaysCashOnHand(59)).toBe('adequate')
  })

  it('120. exactly 29 days → low (not adequate)', () => {
    expect(classifyDaysCashOnHand(29)).toBe('low')
  })

  it('121. exactly 13 days → critical (not low)', () => {
    expect(classifyDaysCashOnHand(13)).toBe('critical')
  })

  it('122. very large value → excellent', () => {
    expect(classifyDaysCashOnHand(365)).toBe('excellent')
  })

  it('123. decimal value in critical zone', () => {
    expect(classifyDaysCashOnHand(5.5)).toBe('critical')
  })

})

// ── computeCashBurnRate — extended ────────────────────────────────────────────

describe('computeCashBurnRate — extended', () => {

  it('124. very large burn rate when expenses far exceed revenue', () => {
    expect(computeCashBurnRate(0, 1_000_000)).toBe(1_000_000)
  })

  it('125. cash generation: revenue 2× expenses → negative burn', () => {
    expect(computeCashBurnRate(200_000, 100_000)).toBe(-100_000)
  })

  it('126. fractional amounts', () => {
    expect(computeCashBurnRate(10_000.50, 10_500.75)).toBeCloseTo(500.25, 1)
  })

  it('127. burn rate with both zero inputs', () => {
    expect(computeCashBurnRate(0, 0)).toBe(0)
  })

})

// ── estimateRunwayFromCash — extended ─────────────────────────────────────────

describe('estimateRunwayFromCash — extended', () => {

  it('128. 12-month runway (classic startup metric)', () => {
    expect(estimateRunwayFromCash(1_200_000, 100_000)).toBe(12)
  })

  it('129. 18-month runway (healthy startup)', () => {
    expect(estimateRunwayFromCash(900_000, 50_000)).toBe(18)
  })

  it('130. null when burn = 0 (not burning)', () => {
    expect(estimateRunwayFromCash(1_000_000, 0)).toBeNull()
  })

  it('131. null when burn negative (profitable)', () => {
    expect(estimateRunwayFromCash(1_000_000, -50_000)).toBeNull()
  })

  it('132. very small burn → very long runway', () => {
    expect(estimateRunwayFromCash(1_000_000, 1_000)).toBe(1_000)
  })

})

// ── computeCashConcentrationRisk — extended ───────────────────────────────────

describe('computeCashConcentrationRisk — extended', () => {

  it('133. five equal accounts → 20% each', () => {
    const result = computeCashConcentrationRisk([100_000, 100_000, 100_000, 100_000, 100_000])
    expect(result).toBe(20)
  })

  it('134. heavily concentrated: 95% in one account', () => {
    expect(computeCashConcentrationRisk([950_000, 50_000])).toBe(95)
  })

  it('135. three accounts with 60/25/15 split', () => {
    // largest is 60_000, total = 100_000 → 60%
    expect(computeCashConcentrationRisk([60_000, 25_000, 15_000])).toBe(60)
  })

  it('136. exactly two equal accounts: 50/50', () => {
    expect(computeCashConcentrationRisk([500_000, 500_000])).toBe(50)
  })

  it('137. single zero balance → 0 (single account rule)', () => {
    expect(computeCashConcentrationRisk([0])).toBe(0)
  })

})

// ── computeWorkingCapitalTurnover — extended ──────────────────────────────────

describe('computeWorkingCapitalTurnover — extended', () => {

  it('138. high turnover: revenue 10× NWC', () => {
    // NWC = 50k, annual = 500k → 10x
    expect(computeWorkingCapitalTurnover(500_000, 100_000, 50_000)).toBe(10)
  })

  it('139. low turnover: revenue 0.5× NWC', () => {
    // NWC = 100k, annual = 50k → 0.5x
    expect(computeWorkingCapitalTurnover(50_000, 150_000, 50_000)).toBe(0.5)
  })

  it('140. null when liabilities equal assets (NWC = 0)', () => {
    expect(computeWorkingCapitalTurnover(1_000_000, 200_000, 200_000)).toBeNull()
  })

  it('141. null when liabilities exceed assets (negative NWC)', () => {
    expect(computeWorkingCapitalTurnover(1_000_000, 100_000, 200_000)).toBeNull()
  })

  it('142. zero revenue → 0 turnover', () => {
    expect(computeWorkingCapitalTurnover(0, 200_000, 100_000)).toBe(0)
  })

})

// ── computeTreasuryHealthScore — extended ─────────────────────────────────────

describe('computeTreasuryHealthScore — extended', () => {

  it('143. days=90, ratio=2.0, net_liquidity=totalCash → near max score', () => {
    const score = computeTreasuryHealthScore(90, 2.0, 100_000, 100_000)
    expect(score).toBeGreaterThan(80)
  })

  it('144. days=14, ratio=1.0, low net_liquidity → moderate score', () => {
    const score = computeTreasuryHealthScore(14, 1.0, 10_000, 200_000)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(70)
  })

  it('145. days=60, ratio=null, positive net_liquidity → partial score', () => {
    const score = computeTreasuryHealthScore(60, null, 50_000, 100_000)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('146. days=null, ratio=null, net_liquidity=0, totalCash=0 → partial base score', () => {
    // null days → raw=40, null ratio → raw=35, liquidity=0/0 → 0 → 40*0.4 + 35*0.35 = 28.25 → rounds to 28.3
    const score = computeTreasuryHealthScore(null, null, 0, 0)
    expect(score).toBeCloseTo(28.3, 0)
  })

  it('147. days=89, ratio=1.999, large net_liquidity → just below top tier but still high', () => {
    const score = computeTreasuryHealthScore(89, 1.999, 500_000, 200_000)
    // days 89 < 90 → 75 raw; ratio 1.999 < 2.0 → 75 raw
    expect(score).toBeGreaterThan(60)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('148. score is always integer (rounded to 1 decimal)', () => {
    const score = computeTreasuryHealthScore(45, 1.3, 30_000, 100_000)
    const rounded = Math.round(score * 10) / 10
    expect(score).toBe(rounded)
  })

  it('149. net_liquidity > totalCash → liquidityRaw capped at 100', () => {
    // liquidity ratio = 200_000 / 100_000 × 50 = 100 → capped at 100
    const score1 = computeTreasuryHealthScore(60, 1.5, 200_000, 100_000)
    const score2 = computeTreasuryHealthScore(60, 1.5, 1_000_000, 100_000)
    // Both should give same score since liquidityRaw is capped at 100
    expect(score1).toBe(score2)
  })

  it('150. total_cash=0 but net_liquidity > 0 → liquidityRaw = 50', () => {
    // Covers the totalCash === 0 branch (netLiquidity > 0 → raw = 50)
    const score = computeTreasuryHealthScore(null, null, 10_000, 0)
    // daysCash null → 40, ratio null → 35, liquidity → 50 → 40*0.4 + 35*0.35 + 50*0.25 = 16+12.25+12.5 = 40.75
    expect(score).toBeCloseTo(40.75, 1)
  })

})
