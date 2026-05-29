/**
 * Cash Burn Rate Enhanced — unit tests
 *
 * Tests all pure functions in burn-rate-enhanced.service.ts.
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeNetBurn,
  computeRunwayMonths,
  computeGrossBurnFromExpenses,
  computeBurnDecomposition,
  computeMonthlyBurnTrend,
  computeBurnEfficiencyRatio,
  classifyBurnEfficiency,
  buildBurnScenarios,
  computeMonthsToDefaultRevenue,
  computeRunwaySensitivity,
  classifyRunwayHealth,
  computeIdealBurnForRunway,
  generateBurnNarrative,
} from '../lib/services/finance/burn-rate-enhanced.service'

// ── computeNetBurn ────────────────────────────────────────────────────────────

describe('computeNetBurn', () => {
  it('1. positive net burn when expenses exceed revenue', () => {
    expect(computeNetBurn(100_000, 60_000)).toBe(40_000)
  })

  it('2. zero net burn when equal', () => {
    expect(computeNetBurn(50_000, 50_000)).toBe(0)
  })

  it('3. negative net burn (cash generation) when revenue > expenses', () => {
    expect(computeNetBurn(40_000, 80_000)).toBe(-40_000)
  })

  it('4. large values handled correctly', () => {
    expect(computeNetBurn(1_000_000, 750_000)).toBe(250_000)
  })

  it('5. fractional amounts rounded to 2 decimals', () => {
    expect(computeNetBurn(10_000.333, 3_000.111)).toBeCloseTo(7_000.22, 1)
  })

  it('6. zero burn zero revenue', () => {
    expect(computeNetBurn(0, 0)).toBe(0)
  })

  it('7. zero burn, some revenue → negative', () => {
    expect(computeNetBurn(0, 5_000)).toBe(-5_000)
  })
})

// ── computeRunwayMonths ───────────────────────────────────────────────────────

describe('computeRunwayMonths', () => {
  it('8. returns null when netBurnPerMonth is zero', () => {
    expect(computeRunwayMonths(100_000, 0)).toBeNull()
  })

  it('9. returns null when netBurnPerMonth is negative', () => {
    expect(computeRunwayMonths(100_000, -5_000)).toBeNull()
  })

  it('10. basic runway calculation', () => {
    expect(computeRunwayMonths(120_000, 10_000)).toBe(12)
  })

  it('11. rounds down to 1 decimal', () => {
    // 100_000 / 7_000 = 14.285... → floor to 14.2
    expect(computeRunwayMonths(100_000, 7_000)).toBe(14.2)
  })

  it('12. very small burn → large runway', () => {
    expect(computeRunwayMonths(1_000_000, 1_000)).toBe(1000)
  })

  it('13. burn equals cash balance → exactly 1 month', () => {
    expect(computeRunwayMonths(50_000, 50_000)).toBe(1)
  })

  it('14. burn larger than cash → less than 1 month', () => {
    // 10_000 / 50_000 = 0.2
    expect(computeRunwayMonths(10_000, 50_000)).toBe(0.2)
  })

  it('15. fractional result truncated not rounded up', () => {
    // 100 / 7 = 14.285... → 14.2
    expect(computeRunwayMonths(100, 7)).toBe(14.2)
  })
})

// ── computeGrossBurnFromExpenses ──────────────────────────────────────────────

describe('computeGrossBurnFromExpenses', () => {
  it('16. sums amounts correctly', () => {
    expect(
      computeGrossBurnFromExpenses([
        { category: 'salary', amount: 50_000 },
        { category: 'rent', amount: 10_000 },
        { category: 'utilities', amount: 2_000 },
      ]),
    ).toBe(62_000)
  })

  it('17. empty array returns 0', () => {
    expect(computeGrossBurnFromExpenses([])).toBe(0)
  })

  it('18. single expense', () => {
    expect(
      computeGrossBurnFromExpenses([{ category: 'rent', amount: 5_000 }]),
    ).toBe(5_000)
  })

  it('19. fractional amounts summed and rounded', () => {
    const result = computeGrossBurnFromExpenses([
      { category: 'a', amount: 100.333 },
      { category: 'b', amount: 200.667 },
    ])
    expect(result).toBeCloseTo(301, 0)
  })
})

// ── computeBurnDecomposition ──────────────────────────────────────────────────

describe('computeBurnDecomposition', () => {
  const expenses = [
    { category: 'salary', amount: 50_000 },
    { category: 'rent', amount: 10_000 },
    { category: 'marketing', amount: 15_000 },
    { category: 'salary', amount: 5_000 }, // same category, should aggregate
  ]
  const totalBurn = 80_000
  const fixedCategories = ['salary', 'rent', 'software', 'utilities']

  it('20. returns correct number of unique categories', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    expect(result).toHaveLength(3) // salary, rent, marketing
  })

  it('21. aggregates same category', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    const salary = result.find(d => d.category === 'salary')
    expect(salary?.monthly_amount).toBe(55_000)
  })

  it('22. sorted by monthly_amount DESC', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    expect(result[0].category).toBe('salary')
    expect(result[1].category).toBe('marketing')
    expect(result[2].category).toBe('rent')
  })

  it('23. pct_of_total_burn sums to ~100', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    const total = result.reduce((s, d) => s + d.pct_of_total_burn, 0)
    expect(total).toBeCloseTo(100, 0)
  })

  it('24. fixed classification correct', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    const salary = result.find(d => d.category === 'salary')
    const marketing = result.find(d => d.category === 'marketing')
    expect(salary?.is_fixed).toBe(true)
    expect(marketing?.is_fixed).toBe(false)
  })

  it('25. trend is null for all entries', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    result.forEach(d => expect(d.trend).toBeNull())
  })

  it('26. pct math — salary = 55000/80000 = 68.75%', () => {
    const result = computeBurnDecomposition(expenses, totalBurn, fixedCategories)
    const salary = result.find(d => d.category === 'salary')
    expect(salary?.pct_of_total_burn).toBeCloseTo(68.75, 1)
  })

  it('27. zero totalBurn → pct = 0', () => {
    const result = computeBurnDecomposition(
      [{ category: 'salary', amount: 1000 }],
      0,
      fixedCategories,
    )
    expect(result[0].pct_of_total_burn).toBe(0)
  })

  it('28. case-insensitive fixed category matching', () => {
    const result = computeBurnDecomposition(
      [{ category: 'Salary', amount: 1000 }],
      1000,
      ['salary'],
    )
    expect(result[0].is_fixed).toBe(true)
  })
})

// ── computeMonthlyBurnTrend ───────────────────────────────────────────────────

describe('computeMonthlyBurnTrend', () => {
  const burns = [10_000, 12_000, 11_000, 13_000, 14_000, 15_000]

  it('29. returns same length as input', () => {
    const result = computeMonthlyBurnTrend(burns, 3)
    expect(result).toHaveLength(6)
  })

  it('30. first (window-1) entries have null rolling_avg', () => {
    const result = computeMonthlyBurnTrend(burns, 3)
    expect(result[0].rolling_avg).toBeNull()
    expect(result[1].rolling_avg).toBeNull()
  })

  it('31. third entry (index 2) has first rolling_avg', () => {
    const result = computeMonthlyBurnTrend(burns, 3)
    // avg of [10k, 12k, 11k] = 11k
    expect(result[2].rolling_avg).toBeCloseTo(11_000, 0)
  })

  it('32. month_index matches array index', () => {
    const result = computeMonthlyBurnTrend(burns, 3)
    result.forEach((r, i) => expect(r.month_index).toBe(i))
  })

  it('33. burn values preserved', () => {
    const result = computeMonthlyBurnTrend(burns, 3)
    burns.forEach((b, i) => expect(result[i].burn).toBe(b))
  })

  it('34. window=1 → all entries have rolling_avg equal to burn', () => {
    const result = computeMonthlyBurnTrend([5_000, 6_000, 7_000], 1)
    result.forEach((r, i) => expect(r.rolling_avg).toBe([5_000, 6_000, 7_000][i]))
  })

  it('35. window larger than array → all null except last', () => {
    const result = computeMonthlyBurnTrend([1, 2, 3], 4)
    expect(result[0].rolling_avg).toBeNull()
    expect(result[1].rolling_avg).toBeNull()
    expect(result[2].rolling_avg).toBeNull()
  })

  it('36. correct avg for last entry', () => {
    // burns[3..5] = [13k, 14k, 15k] → avg = 14k
    const result = computeMonthlyBurnTrend(burns, 3)
    expect(result[5].rolling_avg).toBeCloseTo(14_000, 0)
  })

  it('37. empty array returns empty', () => {
    expect(computeMonthlyBurnTrend([], 3)).toHaveLength(0)
  })
})

// ── computeBurnEfficiencyRatio ────────────────────────────────────────────────

describe('computeBurnEfficiencyRatio', () => {
  it('38. returns null when monthlyBurn is 0', () => {
    expect(computeBurnEfficiencyRatio(50_000, 0)).toBeNull()
  })

  it('39. ratio < 1 when revenue < burn', () => {
    const r = computeBurnEfficiencyRatio(40_000, 100_000)
    expect(r).toBe(0.4)
  })

  it('40. ratio = 1 when equal', () => {
    expect(computeBurnEfficiencyRatio(100_000, 100_000)).toBe(1)
  })

  it('41. ratio > 1 when revenue > burn', () => {
    expect(computeBurnEfficiencyRatio(200_000, 100_000)).toBe(2)
  })

  it('42. fractional result rounded to 2 decimals', () => {
    // 100_000 / 30_000 = 3.333...
    const r = computeBurnEfficiencyRatio(100_000, 30_000)
    expect(r).toBeCloseTo(3.33, 1)
  })
})

// ── classifyBurnEfficiency ────────────────────────────────────────────────────

describe('classifyBurnEfficiency', () => {
  it('43. null → critical', () => {
    expect(classifyBurnEfficiency(null)).toBe('critical')
  })

  it('44. 0 → critical', () => {
    expect(classifyBurnEfficiency(0)).toBe('critical')
  })

  it('45. 0.49 → critical', () => {
    expect(classifyBurnEfficiency(0.49)).toBe('critical')
  })

  it('46. 0.50 → inefficient', () => {
    expect(classifyBurnEfficiency(0.5)).toBe('inefficient')
  })

  it('47. 0.74 → inefficient', () => {
    expect(classifyBurnEfficiency(0.74)).toBe('inefficient')
  })

  it('48. 0.75 → neutral', () => {
    expect(classifyBurnEfficiency(0.75)).toBe('neutral')
  })

  it('49. 0.99 → neutral', () => {
    expect(classifyBurnEfficiency(0.99)).toBe('neutral')
  })

  it('50. 1.0 → efficient', () => {
    expect(classifyBurnEfficiency(1.0)).toBe('efficient')
  })

  it('51. 1.49 → efficient', () => {
    expect(classifyBurnEfficiency(1.49)).toBe('efficient')
  })

  it('52. 1.5 → profitable', () => {
    expect(classifyBurnEfficiency(1.5)).toBe('profitable')
  })

  it('53. very high ratio → profitable', () => {
    expect(classifyBurnEfficiency(10)).toBe('profitable')
  })
})

// ── buildBurnScenarios ────────────────────────────────────────────────────────

describe('buildBurnScenarios', () => {
  const burn = 100_000
  const revenue = 60_000
  const cash = 600_000

  it('54. returns exactly 5 scenarios', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    expect(result).toHaveLength(5)
  })

  it('55. scenario 1: Mevcut Seyir — unchanged burn and revenue', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[0]
    expect(s.name).toBe('Mevcut Seyir')
    expect(s.monthly_burn).toBe(100_000)
    expect(s.revenue_assumption).toBe(60_000)
  })

  it('56. scenario 2: Gelir +20% — revenue multiplied by 1.2', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[1]
    expect(s.name).toBe('Gelir +20%')
    expect(s.revenue_assumption).toBeCloseTo(72_000, 0)
    expect(s.monthly_burn).toBe(100_000)
  })

  it('57. scenario 3: Gider -20% — burn multiplied by 0.8', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[2]
    expect(s.name).toBe('Gider -20%')
    expect(s.monthly_burn).toBeCloseTo(80_000, 0)
    expect(s.revenue_assumption).toBe(60_000)
  })

  it('58. scenario 4: Büyüme Senaryosu — burn ×1.2, revenue ×1.4', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[3]
    expect(s.name).toBe('Büyüme Senaryosu')
    expect(s.monthly_burn).toBeCloseTo(120_000, 0)
    expect(s.revenue_assumption).toBeCloseTo(84_000, 0)
  })

  it('59. scenario 5: Kriz Senaryosu — burn ×1.1, revenue ×0.7', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[4]
    expect(s.name).toBe('Kriz Senaryosu')
    expect(s.monthly_burn).toBeCloseTo(110_000, 0)
    expect(s.revenue_assumption).toBeCloseTo(42_000, 0)
  })

  it('60. net_burn = monthly_burn - revenue_assumption', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    result.forEach(s => {
      expect(s.net_burn).toBeCloseTo(s.monthly_burn - s.revenue_assumption, 1)
    })
  })

  it('61. runway_months null when net_burn <= 0', () => {
    // Scenario 3: Gider -20% → burn 80k, revenue 60k → net 20k > 0 → not null
    // Create zero-burn scenario
    const result = buildBurnScenarios(50_000, 100_000, cash)
    // all scenarios have revenue > burn in this config → net_burn < 0
    result.forEach(s => {
      if (s.net_burn <= 0) expect(s.runway_months).toBeNull()
    })
  })

  it('62. runway_months computed when net_burn > 0', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const s = result[0] // net burn = 40k, cash = 600k → 15 months
    expect(s.runway_months).not.toBeNull()
    expect(s.runway_months!).toBeCloseTo(15, 0)
  })

  it('63. scenario names are the 5 expected strings', () => {
    const result = buildBurnScenarios(burn, revenue, cash)
    const names = result.map(s => s.name)
    expect(names).toContain('Mevcut Seyir')
    expect(names).toContain('Gelir +20%')
    expect(names).toContain('Gider -20%')
    expect(names).toContain('Büyüme Senaryosu')
    expect(names).toContain('Kriz Senaryosu')
  })
})

// ── computeMonthsToDefaultRevenue ─────────────────────────────────────────────

describe('computeMonthsToDefaultRevenue', () => {
  it('64. returns null when rate <= 0', () => {
    expect(computeMonthsToDefaultRevenue(50_000, 0, 100_000)).toBeNull()
  })

  it('65. returns null when rate is negative', () => {
    expect(computeMonthsToDefaultRevenue(50_000, -0.05, 100_000)).toBeNull()
  })

  it('66. returns null when current >= target', () => {
    expect(computeMonthsToDefaultRevenue(100_000, 0.1, 100_000)).toBeNull()
  })

  it('67. returns null when current > target', () => {
    expect(computeMonthsToDefaultRevenue(120_000, 0.1, 100_000)).toBeNull()
  })

  it('68. basic doubling at 100% monthly rate = 1 month', () => {
    // log(2) / log(2) = 1
    const result = computeMonthsToDefaultRevenue(50_000, 1.0, 100_000)
    expect(result).toBeCloseTo(1, 1)
  })

  it('69. 5% monthly growth from 100k to 200k', () => {
    // log(2) / log(1.05) ≈ 14.2 months
    const result = computeMonthsToDefaultRevenue(100_000, 0.05, 200_000)
    expect(result).toBeCloseTo(14.2, 0)
  })

  it('70. small target close to current requires few months', () => {
    // 100k → 105k at 5%/month = ~1 month
    const result = computeMonthsToDefaultRevenue(100_000, 0.05, 105_000)
    expect(result).toBeCloseTo(1, 0)
  })
})

// ── computeRunwaySensitivity ──────────────────────────────────────────────────

describe('computeRunwaySensitivity', () => {
  it('71. +10% burn, 0% revenue change → shorter runway', () => {
    // base: burn=100k, rev=60k, netBurn=40k, cash=600k → 15mo
    // new: burn=110k, rev=60k, netBurn=50k, cash=600k → 12mo
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0.1, 0)
    expect(result.new_runway_months).toBeCloseTo(12, 0)
  })

  it('72. runway_change_months is negative when runway shortens', () => {
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0.1, 0)
    expect(result.runway_change_months).toBeLessThan(0)
  })

  it('73. 0% burn, +20% revenue → longer runway', () => {
    // base: netBurn=40k, cash=600k → 15mo
    // new: burn=100k, rev=72k, netBurn=28k, cash=600k → 21.4mo
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0, 0.2)
    expect(result.new_runway_months).toBeGreaterThan(15)
  })

  it('74. runway_change_months positive when runway improves', () => {
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0, 0.2)
    expect(result.runway_change_months).toBeGreaterThan(0)
  })

  it('75. new_runway_months null when net_burn becomes <= 0', () => {
    // rev increases enough to exceed burn → net burn ≤ 0
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0, 1.0)
    // new rev = 120k, burn = 100k → net = -20k → null
    expect(result.new_runway_months).toBeNull()
  })

  it('76. runway_change_months null when new runway null', () => {
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0, 1.0)
    expect(result.runway_change_months).toBeNull()
  })

  it('77. both deltas 0 → same runway as base', () => {
    // base netBurn = 40k, cash = 600k → 15 months
    const result = computeRunwaySensitivity(600_000, 100_000, 60_000, 0, 0)
    expect(result.new_runway_months).toBeCloseTo(15, 0)
    expect(result.runway_change_months).toBeCloseTo(0, 1)
  })
})

// ── classifyRunwayHealth ──────────────────────────────────────────────────────

describe('classifyRunwayHealth', () => {
  it('78. null → no_burn', () => {
    expect(classifyRunwayHealth(null)).toBe('no_burn')
  })

  it('79. 0 → critical', () => {
    expect(classifyRunwayHealth(0)).toBe('critical')
  })

  it('80. 1 → critical', () => {
    expect(classifyRunwayHealth(1)).toBe('critical')
  })

  it('81. 2.9 → critical', () => {
    expect(classifyRunwayHealth(2.9)).toBe('critical')
  })

  it('82. 3 → low', () => {
    expect(classifyRunwayHealth(3)).toBe('low')
  })

  it('83. 8.9 → low', () => {
    expect(classifyRunwayHealth(8.9)).toBe('low')
  })

  it('84. 9 → adequate', () => {
    expect(classifyRunwayHealth(9)).toBe('adequate')
  })

  it('85. 17.9 → adequate', () => {
    expect(classifyRunwayHealth(17.9)).toBe('adequate')
  })

  it('86. 18 → strong', () => {
    expect(classifyRunwayHealth(18)).toBe('strong')
  })

  it('87. 36 → strong', () => {
    expect(classifyRunwayHealth(36)).toBe('strong')
  })
})

// ── computeIdealBurnForRunway ─────────────────────────────────────────────────

describe('computeIdealBurnForRunway', () => {
  it('88. basic calculation — 12 months runway, 600k cash, 60k revenue', () => {
    // maxNetBurn = 600k / 12 = 50k, idealGross = 50k + 60k = 110k
    expect(computeIdealBurnForRunway(600_000, 12, 60_000)).toBe(110_000)
  })

  it('89. 24 months desired runway reduces ideal burn', () => {
    // maxNetBurn = 600k / 24 = 25k, idealGross = 25k + 60k = 85k
    expect(computeIdealBurnForRunway(600_000, 24, 60_000)).toBe(85_000)
  })

  it('90. zero revenue → idealGross = cash / months', () => {
    expect(computeIdealBurnForRunway(120_000, 12, 0)).toBe(10_000)
  })

  it('91. large cash balance gives more headroom', () => {
    const result = computeIdealBurnForRunway(2_400_000, 12, 100_000)
    // 2400k / 12 = 200k, + 100k = 300k
    expect(result).toBe(300_000)
  })

  it('92. 6 month runway doubles ideal net burn vs 12 months', () => {
    const ideal12 = computeIdealBurnForRunway(600_000, 12, 50_000)
    const ideal6  = computeIdealBurnForRunway(600_000, 6, 50_000)
    // ideal12 net = 50k, ideal6 net = 100k
    expect(ideal6 - ideal12).toBeCloseTo(50_000, 0)
  })
})

// ── generateBurnNarrative ─────────────────────────────────────────────────────

describe('generateBurnNarrative', () => {
  it('93. no_burn → Turkish no-burn message', () => {
    const result = generateBurnNarrative('no_burn', null, 'efficient', 0)
    expect(result).toBe(
      'Nakit yakma oranı sıfır — şirket gelir üretiyor, nakit büyüyor.',
    )
  })

  it('94. strong → includes runway months', () => {
    const result = generateBurnNarrative('strong', 24, 'profitable', 10_000)
    expect(result).toContain('24')
    expect(result).toContain('pist')
  })

  it('95. adequate → strategy message with months', () => {
    const result = generateBurnNarrative('adequate', 12, 'neutral', 20_000)
    expect(result).toContain('12')
    expect(result).toContain('strateji')
  })

  it('96. low → warning with months', () => {
    const result = generateBurnNarrative('low', 5, 'inefficient', 30_000)
    expect(result).toContain('5')
    expect(result).toContain('aksiyon')
  })

  it('97. critical → urgent message with months', () => {
    const result = generateBurnNarrative('critical', 2, 'critical', 50_000)
    expect(result).toContain('2')
    expect(result).toContain('acil')
  })

  it('98. no_burn always returns same string regardless of other params', () => {
    const a = generateBurnNarrative('no_burn', null, 'critical', 999_999)
    const b = generateBurnNarrative('no_burn', null, 'profitable', 0)
    expect(a).toBe(b)
  })

  it('99. strong message uses floor of runway months', () => {
    const result = generateBurnNarrative('strong', 18.7, 'profitable', 5_000)
    expect(result).toContain('18')
    expect(result).not.toContain('18.7')
  })

  it('100. adequate uses floor of runway months', () => {
    const result = generateBurnNarrative('adequate', 9.9, 'neutral', 10_000)
    expect(result).toContain('9')
  })

  it('101. low uses floor of runway months', () => {
    const result = generateBurnNarrative('low', 3.5, 'inefficient', 15_000)
    expect(result).toContain('3')
  })

  it('102. critical uses floor of runway months', () => {
    const result = generateBurnNarrative('critical', 1.8, 'critical', 40_000)
    expect(result).toContain('1')
  })

  it('103. returns a non-empty string for all health levels', () => {
    const levels = ['no_burn', 'strong', 'adequate', 'low', 'critical'] as const
    levels.forEach(level => {
      const months = level === 'no_burn' ? null : 6
      const result = generateBurnNarrative(level, months, 'neutral', 10_000)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
