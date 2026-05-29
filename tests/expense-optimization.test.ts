/**
 * Expense Optimization Recommendations Service — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  EXPENSE_BENCHMARKS,
  computeExpenseRatioPct,
  computeOverspendPct,
  computeSavingFromBenchmark,
  generateSalaryOpportunity,
  generateSoftwareOpportunity,
  generateMarketingOpportunity,
  generateRentOpportunity,
  generateLogisticsOpportunity,
  generateGeneralOpportunity,
  buildOptimizationOpportunities,
  rankOpportunities,
  computeTotalAnnualSavingPotential,
  computeOptimizationScore,
  classifyOptimizationPotential,
  type OptimizationCategory,
  type ExpenseOptimizationOpportunity,
} from '../lib/services/finance/expense-optimization.service'

// ── EXPENSE_BENCHMARKS ────────────────────────────────────────────────────────

describe('EXPENSE_BENCHMARKS', () => {
  it('1. salary benchmark is 25%', () => {
    expect(EXPENSE_BENCHMARKS.salary).toBe(25)
  })
  it('2. rent benchmark is 5%', () => {
    expect(EXPENSE_BENCHMARKS.rent).toBe(5)
  })
  it('3. software benchmark is 2%', () => {
    expect(EXPENSE_BENCHMARKS.software).toBe(2)
  })
  it('4. marketing benchmark is 5%', () => {
    expect(EXPENSE_BENCHMARKS.marketing).toBe(5)
  })
  it('5. logistics benchmark is 4%', () => {
    expect(EXPENSE_BENCHMARKS.logistics).toBe(4)
  })
  it('6. general benchmark is 8%', () => {
    expect(EXPENSE_BENCHMARKS.general).toBe(8)
  })
  it('7. utilities benchmark is 2%', () => {
    expect(EXPENSE_BENCHMARKS.utilities).toBe(2)
  })
})

// ── computeExpenseRatioPct ────────────────────────────────────────────────────

describe('computeExpenseRatioPct', () => {
  it('8. zero revenue returns 0', () => {
    expect(computeExpenseRatioPct(100_000, 0)).toBe(0)
  })

  it('9. zero expense returns 0', () => {
    expect(computeExpenseRatioPct(0, 500_000)).toBe(0)
  })

  it('10. both zero returns 0', () => {
    expect(computeExpenseRatioPct(0, 0)).toBe(0)
  })

  it('11. 50k expense on 200k revenue = 25%', () => {
    expect(computeExpenseRatioPct(50_000, 200_000)).toBe(25)
  })

  it('12. 10k expense on 200k revenue = 5%', () => {
    expect(computeExpenseRatioPct(10_000, 200_000)).toBe(5)
  })

  it('13. expense > revenue returns >100', () => {
    expect(computeExpenseRatioPct(300_000, 200_000)).toBe(150)
  })

  it('14. fractional result is correct', () => {
    expect(computeExpenseRatioPct(3_000, 200_000)).toBeCloseTo(1.5)
  })
})

// ── computeOverspendPct ───────────────────────────────────────────────────────

describe('computeOverspendPct', () => {
  it('15. at benchmark returns 0', () => {
    expect(computeOverspendPct(25, 25)).toBe(0)
  })

  it('16. below benchmark returns 0 (clamped)', () => {
    expect(computeOverspendPct(20, 25)).toBe(0)
  })

  it('17. well below benchmark returns 0', () => {
    expect(computeOverspendPct(5, 25)).toBe(0)
  })

  it('18. above benchmark returns positive difference', () => {
    expect(computeOverspendPct(35, 25)).toBe(10)
  })

  it('19. slightly over returns small value', () => {
    expect(computeOverspendPct(6, 5)).toBe(1)
  })

  it('20. large overspend returns correct value', () => {
    expect(computeOverspendPct(50, 25)).toBe(25)
  })
})

// ── computeSavingFromBenchmark ────────────────────────────────────────────────

describe('computeSavingFromBenchmark', () => {
  it('21. at benchmark returns 0', () => {
    // salary = 25% of 200k = 50k, ratio = 25% = benchmark
    expect(computeSavingFromBenchmark(50_000, 25, 25, 200_000)).toBe(0)
  })

  it('22. below benchmark returns 0', () => {
    expect(computeSavingFromBenchmark(30_000, 15, 25, 200_000)).toBe(0)
  })

  it('23. above benchmark returns correct saving', () => {
    // actual = 60k (30%), benchmark = 25% of 200k = 50k → saving = 10k
    const saving = computeSavingFromBenchmark(60_000, 30, 25, 200_000)
    expect(saving).toBe(10_000)
  })

  it('24. zero revenue returns 0 (benchmark expense = 0, current - 0 = current but ratio check)', () => {
    // ratio 25 <= benchmark 25 → saving = 0 regardless of revenue
    expect(computeSavingFromBenchmark(0, 25, 25, 0)).toBe(0)
  })

  it('25. large overspend computes correctly', () => {
    // actual = 100k (50% of 200k), benchmark = 25% → benchmark expense = 50k → saving = 50k
    const saving = computeSavingFromBenchmark(100_000, 50, 25, 200_000)
    expect(saving).toBe(50_000)
  })

  it('26. result is non-negative (clamped to 0)', () => {
    const saving = computeSavingFromBenchmark(40_000, 20, 25, 200_000)
    expect(saving).toBeGreaterThanOrEqual(0)
  })
})

// ── generateSalaryOpportunity ─────────────────────────────────────────────────

describe('generateSalaryOpportunity', () => {
  it('27. below benchmark returns null', () => {
    // 40k payroll on 200k revenue = 20% < 25% benchmark
    expect(generateSalaryOpportunity(40_000, 200_000)).toBeNull()
  })

  it('28. at benchmark returns null', () => {
    // 50k on 200k = 25% = benchmark
    expect(generateSalaryOpportunity(50_000, 200_000)).toBeNull()
  })

  it('29. above benchmark returns opportunity', () => {
    // 60k on 200k = 30% > 25% benchmark
    const opp = generateSalaryOpportunity(60_000, 200_000)
    expect(opp).not.toBeNull()
    expect(opp!.category).toBe('salary')
  })

  it('30. opportunity has correct current_monthly_try', () => {
    const opp = generateSalaryOpportunity(60_000, 200_000)
    expect(opp!.current_monthly_try).toBe(60_000)
  })

  it('31. annual saving = monthly saving × 12', () => {
    const opp = generateSalaryOpportunity(60_000, 200_000)!
    expect(opp.estimated_annual_saving_try).toBe(opp.estimated_monthly_saving_try * 12)
  })

  it('32. effort is strategic', () => {
    const opp = generateSalaryOpportunity(60_000, 200_000)
    expect(opp!.effort).toBe('strategic')
  })

  it('33. significantly over benchmark → saving_pct = 15', () => {
    // 80k on 200k = 40% → 40 - 25 = 15 overspend → saving = 15%
    const opp = generateSalaryOpportunity(80_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(15)
  })

  it('34. slightly over benchmark → saving_pct = 10', () => {
    // 55k on 200k = 27.5% → overspend = 2.5% → saving = 10%
    const opp = generateSalaryOpportunity(55_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(10)
  })

  it('35. action_items has at least 3 items', () => {
    const opp = generateSalaryOpportunity(60_000, 200_000)!
    expect(opp.action_items.length).toBeGreaterThanOrEqual(3)
  })

  it('36. zero revenue → ratio = 0 → no opportunity', () => {
    expect(generateSalaryOpportunity(60_000, 0)).toBeNull()
  })
})

// ── generateSoftwareOpportunity ───────────────────────────────────────────────

describe('generateSoftwareOpportunity', () => {
  it('37. below ratio and below ₺10k threshold → null', () => {
    // 3k on 200k = 1.5% < 2% AND 3k < 10k
    expect(generateSoftwareOpportunity(3_000, 200_000)).toBeNull()
  })

  it('38. above 2% ratio triggers opportunity', () => {
    // 5k on 200k = 2.5% > 2%
    const opp = generateSoftwareOpportunity(5_000, 200_000)
    expect(opp).not.toBeNull()
  })

  it('39. above ₺10k triggers opportunity even if ratio ok', () => {
    // 12k on 1_000k = 1.2% < 2%, but 12k > 10k
    const opp = generateSoftwareOpportunity(12_000, 1_000_000)
    expect(opp).not.toBeNull()
  })

  it('40. category is software', () => {
    const opp = generateSoftwareOpportunity(5_000, 200_000)!
    expect(opp.category).toBe('software')
  })

  it('41. saving_pct = 25', () => {
    const opp = generateSoftwareOpportunity(5_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(25)
  })

  it('42. effort is quick_win', () => {
    const opp = generateSoftwareOpportunity(5_000, 200_000)!
    expect(opp.effort).toBe('quick_win')
  })

  it('43. estimated saving formula correct: monthly × 12 = annual', () => {
    const opp = generateSoftwareOpportunity(20_000, 200_000)!
    expect(opp.estimated_monthly_saving_try).toBeCloseTo(20_000 * 0.25)
    expect(opp.estimated_annual_saving_try).toBeCloseTo(20_000 * 0.25 * 12)
  })

  it('44. exactly at ₺10k → null (not > 10k)', () => {
    // exactly 10k, ratio = 1% < 2%: should return null since condition is > 10_000
    expect(generateSoftwareOpportunity(10_000, 1_000_000)).toBeNull()
  })
})

// ── generateMarketingOpportunity ──────────────────────────────────────────────

describe('generateMarketingOpportunity', () => {
  it('45. below benchmark ratio → null regardless of growth', () => {
    // 8k on 200k = 4% < 5%
    expect(generateMarketingOpportunity(8_000, 200_000, 3)).toBeNull()
  })

  it('46. above benchmark but high growth → null (ROI acceptable)', () => {
    // 12k on 200k = 6% > 5%, growth = 15% → no opportunity
    expect(generateMarketingOpportunity(12_000, 200_000, 15)).toBeNull()
  })

  it('47. above benchmark AND weak growth → opportunity', () => {
    // 12k on 200k = 6% > 5%, growth = 5% < 10%
    const opp = generateMarketingOpportunity(12_000, 200_000, 5)
    expect(opp).not.toBeNull()
  })

  it('48. category is marketing', () => {
    const opp = generateMarketingOpportunity(12_000, 200_000, 5)!
    expect(opp.category).toBe('marketing')
  })

  it('49. saving_pct = 18', () => {
    const opp = generateMarketingOpportunity(12_000, 200_000, 5)!
    expect(opp.potential_saving_pct).toBe(18)
  })

  it('50. effort is medium_term', () => {
    const opp = generateMarketingOpportunity(12_000, 200_000, 5)!
    expect(opp.effort).toBe('medium_term')
  })

  it('51. growth exactly 10% → null (not < 10)', () => {
    expect(generateMarketingOpportunity(12_000, 200_000, 10)).toBeNull()
  })

  it('52. negative growth triggers opportunity', () => {
    const opp = generateMarketingOpportunity(12_000, 200_000, -5)
    expect(opp).not.toBeNull()
  })
})

// ── generateRentOpportunity ───────────────────────────────────────────────────

describe('generateRentOpportunity', () => {
  it('53. below 5% benchmark → null', () => {
    // 8k on 200k = 4% < 5%
    expect(generateRentOpportunity(8_000, 200_000)).toBeNull()
  })

  it('54. at benchmark → null', () => {
    // 10k on 200k = 5%
    expect(generateRentOpportunity(10_000, 200_000)).toBeNull()
  })

  it('55. above benchmark → opportunity', () => {
    // 15k on 200k = 7.5%
    const opp = generateRentOpportunity(15_000, 200_000)
    expect(opp).not.toBeNull()
    expect(opp!.category).toBe('rent')
  })

  it('56. saving_pct = 20', () => {
    const opp = generateRentOpportunity(15_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(20)
  })

  it('57. effort is strategic', () => {
    const opp = generateRentOpportunity(15_000, 200_000)!
    expect(opp.effort).toBe('strategic')
  })

  it('58. high overspend → high confidence', () => {
    // 20k on 200k = 10% → overspend = 5% → high confidence
    const opp = generateRentOpportunity(20_000, 200_000)!
    expect(opp.confidence).toBe('high')
  })
})

// ── generateLogisticsOpportunity ─────────────────────────────────────────────

describe('generateLogisticsOpportunity', () => {
  it('59. below 4% benchmark → null', () => {
    // 6k on 200k = 3% < 4%
    expect(generateLogisticsOpportunity(6_000, 200_000)).toBeNull()
  })

  it('60. at benchmark → null', () => {
    // 8k on 200k = 4%
    expect(generateLogisticsOpportunity(8_000, 200_000)).toBeNull()
  })

  it('61. above benchmark → opportunity', () => {
    // 12k on 200k = 6% > 4%
    const opp = generateLogisticsOpportunity(12_000, 200_000)
    expect(opp).not.toBeNull()
    expect(opp!.category).toBe('logistics')
  })

  it('62. saving_pct = 15', () => {
    const opp = generateLogisticsOpportunity(12_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(15)
  })

  it('63. effort is medium_term', () => {
    const opp = generateLogisticsOpportunity(12_000, 200_000)!
    expect(opp.effort).toBe('medium_term')
  })
})

// ── generateGeneralOpportunity ────────────────────────────────────────────────

describe('generateGeneralOpportunity', () => {
  it('64. combined below 10% → null', () => {
    // 12k general + 2k utilities = 14k on 200k = 7% < 10%
    expect(generateGeneralOpportunity(12_000, 2_000, 200_000)).toBeNull()
  })

  it('65. combined at 10% → null', () => {
    // 16k + 4k = 20k on 200k = 10%
    expect(generateGeneralOpportunity(16_000, 4_000, 200_000)).toBeNull()
  })

  it('66. combined above 10% → opportunity', () => {
    // 18k + 6k = 24k on 200k = 12% > 10%
    const opp = generateGeneralOpportunity(18_000, 6_000, 200_000)
    expect(opp).not.toBeNull()
    expect(opp!.category).toBe('general')
  })

  it('67. saving_pct = 12', () => {
    const opp = generateGeneralOpportunity(18_000, 6_000, 200_000)!
    expect(opp.potential_saving_pct).toBe(12)
  })

  it('68. current_monthly_try = general + utilities', () => {
    const opp = generateGeneralOpportunity(18_000, 6_000, 200_000)!
    expect(opp.current_monthly_try).toBe(24_000)
  })

  it('69. works when utilities = 0 but general alone high', () => {
    // 25k + 0 = 25k on 200k = 12.5% > 10%
    const opp = generateGeneralOpportunity(25_000, 0, 200_000)
    expect(opp).not.toBeNull()
  })
})

// ── buildOptimizationOpportunities ───────────────────────────────────────────

describe('buildOptimizationOpportunities', () => {
  const ALL_ZERO: Record<OptimizationCategory, number> = {
    salary: 0, rent: 0, software: 0, marketing: 0,
    logistics: 0, general: 0, utilities: 0,
  }

  it('70. all zero expenses → empty array', () => {
    expect(buildOptimizationOpportunities(ALL_ZERO, 200_000)).toHaveLength(0)
  })

  it('71. all at or below benchmarks → empty array', () => {
    const expenses: Record<OptimizationCategory, number> = {
      salary:    40_000,  // 20%  < 25%
      rent:       8_000,  //  4%  < 5%
      software:   3_000,  //  1.5%< 2%
      marketing:  8_000,  //  4%  < 5%
      logistics:  6_000,  //  3%  < 4%
      general:   12_000,  //  6%  < 8%
      utilities:  2_000,  //  1%  < 2%
    }
    const result = buildOptimizationOpportunities(expenses, 200_000)
    expect(result).toHaveLength(0)
  })

  it('72. salary overspend generates salary opportunity', () => {
    const expenses = { ...ALL_ZERO, salary: 60_000 }  // 30% > 25%
    const result = buildOptimizationOpportunities(expenses, 200_000)
    expect(result.some(o => o.category === 'salary')).toBe(true)
  })

  it('73. software overspend generates software opportunity', () => {
    const expenses = { ...ALL_ZERO, software: 6_000 }  // 3% > 2%
    const result = buildOptimizationOpportunities(expenses, 200_000)
    expect(result.some(o => o.category === 'software')).toBe(true)
  })

  it('74. realistic expense breakdown generates multiple opportunities', () => {
    const expenses: Record<OptimizationCategory, number> = {
      salary:    70_000,  // 35%  > 25%
      rent:      15_000,  //  7.5%> 5%
      software:  15_000,  //  7.5%> 2%
      marketing: 15_000,  //  7.5%> 5%, growth = 3% < 10%
      logistics: 12_000,  //  6%  > 4%
      general:   20_000,  // 10%
      utilities:  5_000,  //  2.5%
    }
    // general+utilities = 12.5% > 10%, so general opp
    const result = buildOptimizationOpportunities(expenses, 200_000, 3)
    expect(result.length).toBeGreaterThanOrEqual(4)
  })

  it('75. marketing: no opportunity when growth is high', () => {
    const expenses = { ...ALL_ZERO, marketing: 15_000 }  // 7.5% > 5%
    const result = buildOptimizationOpportunities(expenses, 200_000, 20)  // 20% growth
    expect(result.some(o => o.category === 'marketing')).toBe(false)
  })

  it('76. uses default revenueGrowthPct = 0 (triggers marketing if over benchmark)', () => {
    const expenses = { ...ALL_ZERO, marketing: 15_000 }  // 7.5% > 5%, growth = 0 < 10%
    const result = buildOptimizationOpportunities(expenses, 200_000)
    expect(result.some(o => o.category === 'marketing')).toBe(true)
  })
})

// ── rankOpportunities ─────────────────────────────────────────────────────────

describe('rankOpportunities', () => {
  const makeOpp = (id: string, annual: number): ExpenseOptimizationOpportunity => ({
    id,
    category: 'general',
    title: id,
    description: '',
    current_monthly_try: 10_000,
    potential_saving_pct: 10,
    estimated_monthly_saving_try: annual / 12,
    estimated_annual_saving_try: annual,
    effort: 'quick_win',
    confidence: 'high',
    action_items: [],
  })

  it('77. sorted descending by annual saving', () => {
    const opps = [
      makeOpp('a', 10_000),
      makeOpp('b', 50_000),
      makeOpp('c', 30_000),
    ]
    const ranked = rankOpportunities(opps)
    expect(ranked.map(o => o.id)).toEqual(['b', 'c', 'a'])
  })

  it('78. empty array → empty array', () => {
    expect(rankOpportunities([])).toHaveLength(0)
  })

  it('79. single item → unchanged', () => {
    const opps = [makeOpp('solo', 5_000)]
    expect(rankOpportunities(opps)).toHaveLength(1)
  })

  it('80. does not mutate input array', () => {
    const opps = [makeOpp('a', 10_000), makeOpp('b', 50_000)]
    const original = [...opps]
    rankOpportunities(opps)
    expect(opps[0].id).toBe(original[0].id)
  })
})

// ── computeTotalAnnualSavingPotential ─────────────────────────────────────────

describe('computeTotalAnnualSavingPotential', () => {
  const makeOpp = (annual: number): ExpenseOptimizationOpportunity => ({
    id: 'x',
    category: 'general',
    title: '',
    description: '',
    current_monthly_try: 0,
    potential_saving_pct: 0,
    estimated_monthly_saving_try: 0,
    estimated_annual_saving_try: annual,
    effort: 'quick_win',
    confidence: 'high',
    action_items: [],
  })

  it('81. empty array → 0', () => {
    expect(computeTotalAnnualSavingPotential([])).toBe(0)
  })

  it('82. sums correctly', () => {
    const opps = [makeOpp(10_000), makeOpp(20_000), makeOpp(5_000)]
    expect(computeTotalAnnualSavingPotential(opps)).toBe(35_000)
  })

  it('83. single item returns its annual saving', () => {
    expect(computeTotalAnnualSavingPotential([makeOpp(48_000)])).toBe(48_000)
  })
})

// ── computeOptimizationScore ──────────────────────────────────────────────────

describe('computeOptimizationScore', () => {
  it('84. zero revenue → 100', () => {
    expect(computeOptimizationScore(50_000, 0)).toBe(100)
  })

  it('85. zero expenses on non-zero revenue → 100 (positive score)', () => {
    // score = 100 - (0 / (200k × 0.51)) × 100 = 100
    expect(computeOptimizationScore(0, 200_000)).toBe(100)
  })

  it('86. expenses exactly at optimal sum → low score but valid', () => {
    // optimal = 200k × 0.51 = 102k; actual = 102k → score = 100 - 100 = 0
    const score = computeOptimizationScore(102_000, 200_000)
    expect(score).toBeCloseTo(0, 1)
  })

  it('87. expenses below optimal → score > 0', () => {
    const score = computeOptimizationScore(51_000, 200_000)
    expect(score).toBeGreaterThan(0)
  })

  it('88. score clamped to 0 for very high expenses', () => {
    const score = computeOptimizationScore(500_000, 200_000)
    expect(score).toBe(0)
  })

  it('89. score clamped to 100 maximum', () => {
    const score = computeOptimizationScore(1_000, 200_000)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('90. half-optimal expenses → score ~50', () => {
    // actual = 51k = 50% of optimal 102k → score = 100 - 50 = 50
    const score = computeOptimizationScore(51_000, 200_000)
    expect(score).toBeCloseTo(50, 1)
  })
})

// ── classifyOptimizationPotential ─────────────────────────────────────────────

describe('classifyOptimizationPotential', () => {
  it('91. no_revenue_data when revenue = 0', () => {
    expect(classifyOptimizationPotential(100_000, 0)).toBe('no_revenue_data')
  })

  it('92. > 50k annual saving → high', () => {
    expect(classifyOptimizationPotential(60_000, 200_000)).toBe('high')
  })

  it('93. exactly 50k → high (> 50k is false, check boundary)', () => {
    // boundary: > 50k = high; 50k is not > 50k → medium
    expect(classifyOptimizationPotential(50_000, 200_000)).toBe('medium')
  })

  it('94. 50_001 → high', () => {
    expect(classifyOptimizationPotential(50_001, 200_000)).toBe('high')
  })

  it('95. 20k to 50k → medium', () => {
    expect(classifyOptimizationPotential(35_000, 200_000)).toBe('medium')
  })

  it('96. exactly 20k → medium', () => {
    expect(classifyOptimizationPotential(20_000, 200_000)).toBe('medium')
  })

  it('97. 5k to 20k → low', () => {
    expect(classifyOptimizationPotential(12_000, 200_000)).toBe('low')
  })

  it('98. exactly 5k → low', () => {
    expect(classifyOptimizationPotential(5_000, 200_000)).toBe('low')
  })

  it('99. below 5k → minimal', () => {
    expect(classifyOptimizationPotential(3_000, 200_000)).toBe('minimal')
  })

  it('100. zero saving potential → minimal', () => {
    expect(classifyOptimizationPotential(0, 200_000)).toBe('minimal')
  })
})
