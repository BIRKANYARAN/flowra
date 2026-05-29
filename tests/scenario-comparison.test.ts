/**
 * Scenario Comparison Engine — unit tests
 *
 * Tests all pure computation functions in:
 *   lib/services/finance/scenario-comparison.service.ts
 *
 * No DB or network calls — pure function tests only.
 * Target: 100+ tests
 */

import { describe, it, expect } from 'vitest'
import {
  computeGrossProfitMarginPct,
  computeNetMarginPct,
  computeEbitdaMarginPct,
  computeDeltaPct,
  computeRunwayFromCashFlow,
  computeBreakevenMonth,
  computeSensitivityImpact,
  classifyScenarioRisk,
  selectRecommendedScenario,
  computeComparisonMatrix,
  rankScenariosByMetric,
  computeScenarioSpread,
  generateComparisonNarrative,
  buildScenarioMetricsFromSummary,
  type ScenarioMetrics,
} from '../lib/services/finance/scenario-comparison.service'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<ScenarioMetrics> = {}): ScenarioMetrics {
  return {
    scenario_id:        overrides.scenario_id        ?? 'sc-1',
    scenario_name:      overrides.scenario_name      ?? 'Test Senaryo',
    is_baseline:        overrides.is_baseline        ?? false,
    total_revenue:      overrides.total_revenue      ?? 1_000_000,
    total_cogs:         overrides.total_cogs         ?? 400_000,
    gross_profit:       overrides.gross_profit       ?? 600_000,
    total_expenses:     overrides.total_expenses     ?? 200_000,
    ebitda:             overrides.ebitda             ?? 400_000,
    net_income:         overrides.net_income         ?? 300_000,
    tax_amount:         overrides.tax_amount         ?? 100_000,
    ending_cash:        overrides.ending_cash        ?? 500_000,
    break_even_month:   overrides.break_even_month   ?? null,
    runway_months:      overrides.runway_months      !== undefined ? overrides.runway_months : 24,
    peak_cash:          overrides.peak_cash          ?? 600_000,
    min_cash:           overrides.min_cash           ?? 100_000,
    gross_margin_pct:   overrides.gross_margin_pct   !== undefined ? overrides.gross_margin_pct : 60,
    net_margin_pct:     overrides.net_margin_pct     !== undefined ? overrides.net_margin_pct   : 30,
    total_debt_service: overrides.total_debt_service ?? 50_000,
    dscr_avg:           overrides.dscr_avg           !== undefined ? overrides.dscr_avg         : 2.5,
  }
}

// ── computeGrossProfitMarginPct ───────────────────────────────────────────────

describe('computeGrossProfitMarginPct', () => {

  it('1. normal: revenue 1M, cogs 400k → 60%', () => {
    expect(computeGrossProfitMarginPct(1_000_000, 400_000)).toBeCloseTo(60)
  })

  it('2. zero revenue → null', () => {
    expect(computeGrossProfitMarginPct(0, 0)).toBeNull()
  })

  it('3. zero revenue with positive cogs → null', () => {
    expect(computeGrossProfitMarginPct(0, 50_000)).toBeNull()
  })

  it('4. cogs > revenue → negative margin', () => {
    const result = computeGrossProfitMarginPct(100_000, 120_000)
    expect(result).toBeCloseTo(-20)
  })

  it('5. cogs = 0 → 100% margin', () => {
    expect(computeGrossProfitMarginPct(200_000, 0)).toBeCloseTo(100)
  })

  it('6. cogs = revenue → 0% margin', () => {
    expect(computeGrossProfitMarginPct(500_000, 500_000)).toBeCloseTo(0)
  })

  it('7. small numbers precision', () => {
    expect(computeGrossProfitMarginPct(3, 1)).toBeCloseTo(66.667)
  })

})

// ── computeNetMarginPct ───────────────────────────────────────────────────────

describe('computeNetMarginPct', () => {

  it('8. normal: 300k net / 1M revenue → 30%', () => {
    expect(computeNetMarginPct(1_000_000, 300_000)).toBeCloseTo(30)
  })

  it('9. zero revenue → null', () => {
    expect(computeNetMarginPct(0, 100_000)).toBeNull()
  })

  it('10. zero revenue and zero income → null', () => {
    expect(computeNetMarginPct(0, 0)).toBeNull()
  })

  it('11. negative net income → negative margin', () => {
    expect(computeNetMarginPct(1_000_000, -50_000)).toBeCloseTo(-5)
  })

  it('12. net income = revenue → 100%', () => {
    expect(computeNetMarginPct(500_000, 500_000)).toBeCloseTo(100)
  })

  it('13. very small net income', () => {
    expect(computeNetMarginPct(1_000_000, 1_000)).toBeCloseTo(0.1)
  })

})

// ── computeEbitdaMarginPct ────────────────────────────────────────────────────

describe('computeEbitdaMarginPct', () => {

  it('14. normal: 400k ebitda / 1M revenue → 40%', () => {
    expect(computeEbitdaMarginPct(1_000_000, 400_000)).toBeCloseTo(40)
  })

  it('15. zero revenue → null', () => {
    expect(computeEbitdaMarginPct(0, 400_000)).toBeNull()
  })

  it('16. zero revenue and zero ebitda → null', () => {
    expect(computeEbitdaMarginPct(0, 0)).toBeNull()
  })

  it('17. negative ebitda → negative margin', () => {
    expect(computeEbitdaMarginPct(1_000_000, -100_000)).toBeCloseTo(-10)
  })

  it('18. ebitda > revenue → margin > 100% (unusual but valid)', () => {
    const result = computeEbitdaMarginPct(500_000, 600_000)
    expect(result).toBeCloseTo(120)
  })

})

// ── computeDeltaPct ───────────────────────────────────────────────────────────

describe('computeDeltaPct', () => {

  it('19. positive growth: 100 → 120 = +20%', () => {
    expect(computeDeltaPct(100, 120)).toBeCloseTo(20)
  })

  it('20. decline: 100 → 80 = -20%', () => {
    expect(computeDeltaPct(100, 80)).toBeCloseTo(-20)
  })

  it('21. zero base → null', () => {
    expect(computeDeltaPct(0, 100)).toBeNull()
  })

  it('22. zero base and zero new → null', () => {
    expect(computeDeltaPct(0, 0)).toBeNull()
  })

  it('23. negative base: -100 → -50 = +50%', () => {
    // (b - a) / |a| = (-50 - (-100)) / 100 = 50%
    expect(computeDeltaPct(-100, -50)).toBeCloseTo(50)
  })

  it('24. negative base: -100 → -150 = -50%', () => {
    expect(computeDeltaPct(-100, -150)).toBeCloseTo(-50)
  })

  it('25. equal values → 0%', () => {
    expect(computeDeltaPct(500, 500)).toBeCloseTo(0)
  })

  it('26. large values', () => {
    expect(computeDeltaPct(1_000_000, 1_500_000)).toBeCloseTo(50)
  })

})

// ── computeRunwayFromCashFlow ─────────────────────────────────────────────────

describe('computeRunwayFromCashFlow', () => {

  it('27. never goes negative → null', () => {
    expect(computeRunwayFromCashFlow(100_000, [10_000, 10_000, 10_000])).toBeNull()
  })

  it('28. first month goes negative → returns 1', () => {
    expect(computeRunwayFromCashFlow(50_000, [-60_000])).toBe(1)
  })

  it('29. second month negative', () => {
    expect(computeRunwayFromCashFlow(100_000, [10_000, -120_000])).toBe(2)
  })

  it('30. exact zero at month 3 - not negative → null', () => {
    // 100k - 40k - 40k - 20k = 0 (not negative, not < 0)
    expect(computeRunwayFromCashFlow(100_000, [-40_000, -40_000, -20_000])).toBeNull()
  })

  it('31. negative at month 3', () => {
    expect(computeRunwayFromCashFlow(100_000, [-30_000, -30_000, -50_000])).toBe(3)
  })

  it('32. empty monthly flows → null', () => {
    expect(computeRunwayFromCashFlow(0, [])).toBeNull()
  })

  it('33. starting cash = 0, negative first flow → month 1', () => {
    expect(computeRunwayFromCashFlow(0, [-1])).toBe(1)
  })

  it('34. starting cash = 0, positive flows only → null', () => {
    expect(computeRunwayFromCashFlow(0, [10_000, 20_000])).toBeNull()
  })

  it('35. negative then recovers: still first negative counts', () => {
    // 100k - 120k = -20k (month 1 negative), then +200k
    expect(computeRunwayFromCashFlow(100_000, [-120_000, 200_000])).toBe(1)
  })

  it('36. exactly one month of cash, next breaks it', () => {
    expect(computeRunwayFromCashFlow(10_000, [-5_000, -5_000, -5_000])).toBe(3)
  })

})

// ── computeBreakevenMonth ─────────────────────────────────────────────────────

describe('computeBreakevenMonth', () => {

  it('37. never positive → null', () => {
    expect(computeBreakevenMonth([-1000, -2000, -3000])).toBeNull()
  })

  it('38. first month already positive → month 1', () => {
    expect(computeBreakevenMonth([100, 200])).toBe(1)
  })

  it('39. break-even at month 3', () => {
    expect(computeBreakevenMonth([-100, -50, 0])).toBe(3)
  })

  it('40. break-even at month 2', () => {
    expect(computeBreakevenMonth([-100, 10, 50])).toBe(2)
  })

  it('41. empty array → null', () => {
    expect(computeBreakevenMonth([])).toBeNull()
  })

  it('42. all negative → null', () => {
    expect(computeBreakevenMonth([-5, -4, -3, -2, -1])).toBeNull()
  })

  it('43. exactly zero at month 4', () => {
    expect(computeBreakevenMonth([-10, -5, -1, 0])).toBe(4)
  })

})

// ── computeSensitivityImpact ──────────────────────────────────────────────────

describe('computeSensitivityImpact', () => {

  it('44. basic: 1M × 0.1 × 1 = 100k', () => {
    expect(computeSensitivityImpact(1_000_000, 0.1, 1)).toBeCloseTo(100_000)
  })

  it('45. high elasticity: 1M × 0.1 × 2 = 200k', () => {
    expect(computeSensitivityImpact(1_000_000, 0.1, 2)).toBeCloseTo(200_000)
  })

  it('46. zero base → 0', () => {
    expect(computeSensitivityImpact(0, 0.5, 3)).toBeCloseTo(0)
  })

  it('47. zero factor → 0', () => {
    expect(computeSensitivityImpact(1_000_000, 0, 5)).toBeCloseTo(0)
  })

  it('48. negative factor (decline scenario)', () => {
    expect(computeSensitivityImpact(500_000, -0.2, 1.5)).toBeCloseTo(-150_000)
  })

  it('49. fractional elasticity', () => {
    expect(computeSensitivityImpact(100, 0.5, 0.5)).toBeCloseTo(25)
  })

})

// ── classifyScenarioRisk ──────────────────────────────────────────────────────

describe('classifyScenarioRisk', () => {

  it('50. low risk: runway 24, dscr 3, margin 10%', () => {
    const m = makeMetrics({ runway_months: 24, dscr_avg: 3, net_margin_pct: 10 })
    expect(classifyScenarioRisk(m)).toBe('low')
  })

  it('51. low risk at boundary: runway 13, dscr 2, margin 5', () => {
    const m = makeMetrics({ runway_months: 13, dscr_avg: 2, net_margin_pct: 5 })
    expect(classifyScenarioRisk(m)).toBe('low')
  })

  it('52. not low: runway 12 (not > 12)', () => {
    const m = makeMetrics({ runway_months: 12, dscr_avg: 3, net_margin_pct: 10 })
    expect(classifyScenarioRisk(m)).not.toBe('low')
  })

  it('53. moderate risk: runway 9, dscr 1.8, margin 2%', () => {
    const m = makeMetrics({ runway_months: 9, dscr_avg: 1.8, net_margin_pct: 2 })
    expect(classifyScenarioRisk(m)).toBe('moderate')
  })

  it('54. moderate at boundary: runway 7, dscr 1.5, margin 0', () => {
    const m = makeMetrics({ runway_months: 7, dscr_avg: 1.5, net_margin_pct: 0 })
    expect(classifyScenarioRisk(m)).toBe('moderate')
  })

  it('55. not moderate: margin < 0 → falls to high', () => {
    const m = makeMetrics({ runway_months: 9, dscr_avg: 2, net_margin_pct: -1 })
    expect(classifyScenarioRisk(m)).not.toBe('moderate')
  })

  it('56. high risk via runway > 3', () => {
    const m = makeMetrics({ runway_months: 4, dscr_avg: 0.8, net_margin_pct: -15 })
    expect(classifyScenarioRisk(m)).toBe('high')
  })

  it('57. high risk via dscr + margin', () => {
    const m = makeMetrics({ runway_months: null, dscr_avg: 1, net_margin_pct: -5 })
    expect(classifyScenarioRisk(m)).toBe('high')
  })

  it('58. very_high: null runway, null dscr', () => {
    const m = makeMetrics({ runway_months: null, dscr_avg: null, net_margin_pct: -20 })
    expect(classifyScenarioRisk(m)).toBe('very_high')
  })

  it('59. very_high: runway 2, dscr 0.5', () => {
    const m = makeMetrics({ runway_months: 2, dscr_avg: 0.5, net_margin_pct: -30 })
    expect(classifyScenarioRisk(m)).toBe('very_high')
  })

  it('60. very_high: all nulls', () => {
    const m = makeMetrics({ runway_months: null, dscr_avg: null, net_margin_pct: null })
    expect(classifyScenarioRisk(m)).toBe('very_high')
  })

  it('61. very_high: runway null, dscr 0.9 and margin -11', () => {
    const m = makeMetrics({ runway_months: null, dscr_avg: 0.9, net_margin_pct: -11 })
    expect(classifyScenarioRisk(m)).toBe('very_high')
  })

})

// ── selectRecommendedScenario ─────────────────────────────────────────────────

describe('selectRecommendedScenario', () => {

  const priorities = { profitability: 1/3, liquidity: 1/3, growth: 1/3 }

  it('62. empty array → null', () => {
    expect(selectRecommendedScenario([], priorities)).toBeNull()
  })

  it('63. single scenario → returns its id', () => {
    const s = makeMetrics({ scenario_id: 'only' })
    expect(selectRecommendedScenario([s], priorities)).toBe('only')
  })

  it('64. scenario with better net_margin wins on profitability weight', () => {
    const a = makeMetrics({ scenario_id: 'a', net_margin_pct: 10, runway_months: 12, total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', net_margin_pct: 30, runway_months: 12, total_revenue: 1_000_000 })
    const result = selectRecommendedScenario([a, b], { profitability: 0.9, liquidity: 0.05, growth: 0.05 })
    expect(result).toBe('b')
  })

  it('65. scenario with better runway wins on liquidity weight', () => {
    const a = makeMetrics({ scenario_id: 'a', net_margin_pct: 5, runway_months: 6,  total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', net_margin_pct: 5, runway_months: 24, total_revenue: 1_000_000 })
    const result = selectRecommendedScenario([a, b], { profitability: 0.05, liquidity: 0.9, growth: 0.05 })
    expect(result).toBe('b')
  })

  it('66. scenario with higher revenue wins on growth weight', () => {
    const a = makeMetrics({ scenario_id: 'a', net_margin_pct: 5, runway_months: 12, total_revenue: 500_000 })
    const b = makeMetrics({ scenario_id: 'b', net_margin_pct: 5, runway_months: 12, total_revenue: 2_000_000 })
    const result = selectRecommendedScenario([a, b], { profitability: 0.05, liquidity: 0.05, growth: 0.9 })
    expect(result).toBe('b')
  })

  it('67. null net_margin treated as 0 in normalization', () => {
    const a = makeMetrics({ scenario_id: 'a', net_margin_pct: null, runway_months: 12, total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', net_margin_pct: 10,   runway_months: 12, total_revenue: 1_000_000 })
    const result = selectRecommendedScenario([a, b], { profitability: 0.9, liquidity: 0.05, growth: 0.05 })
    expect(result).toBe('b')
  })

  it('68. null runway treated as 0 in normalization', () => {
    const a = makeMetrics({ scenario_id: 'a', runway_months: null, total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', runway_months: 12,   total_revenue: 1_000_000 })
    const result = selectRecommendedScenario([a, b], { profitability: 0.05, liquidity: 0.9, growth: 0.05 })
    expect(result).toBe('b')
  })

  it('69. all identical metrics → returns first scenario id', () => {
    const a = makeMetrics({ scenario_id: 'a', net_margin_pct: 20, runway_months: 12, total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', net_margin_pct: 20, runway_months: 12, total_revenue: 1_000_000 })
    const result = selectRecommendedScenario([a, b], priorities)
    expect(result).toBe('a')
  })

  it('70. five scenarios - scenario with best composite score wins', () => {
    const scenarios = [
      makeMetrics({ scenario_id: '1', net_margin_pct: 5,  runway_months: 6,  total_revenue: 500_000 }),
      makeMetrics({ scenario_id: '2', net_margin_pct: 10, runway_months: 9,  total_revenue: 700_000 }),
      makeMetrics({ scenario_id: '3', net_margin_pct: 15, runway_months: 12, total_revenue: 900_000 }),
      makeMetrics({ scenario_id: '4', net_margin_pct: 20, runway_months: 18, total_revenue: 1_100_000 }),
      makeMetrics({ scenario_id: '5', net_margin_pct: 25, runway_months: 24, total_revenue: 1_500_000 }),
    ]
    expect(selectRecommendedScenario(scenarios, priorities)).toBe('5')
  })

})

// ── computeComparisonMatrix ───────────────────────────────────────────────────

describe('computeComparisonMatrix', () => {

  it('71. empty scenarios → empty array', () => {
    expect(computeComparisonMatrix([])).toEqual([])
  })

  it('72. single scenario (no baseline) → empty comparisons', () => {
    const s = makeMetrics({ scenario_id: 'a', is_baseline: false })
    const result = computeComparisonMatrix([s])
    expect(result).toHaveLength(0)
  })

  it('73. baseline + 1 other → 1 comparison', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  total_revenue: 1_000_000 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, total_revenue: 1_200_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result).toHaveLength(1)
    expect(result[0].scenario_a.scenario_id).toBe('base')
    expect(result[0].scenario_b.scenario_id).toBe('opt1')
  })

  it('74. revenue_delta_pct correct: 1M → 1.2M = +20%', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  total_revenue: 1_000_000 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, total_revenue: 1_200_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].revenue_delta_pct).toBeCloseTo(20)
  })

  it('75. cash_delta: 500k → 700k = +200k', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  ending_cash: 500_000 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, ending_cash: 700_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].cash_delta).toBe(200_000)
  })

  it('76. no baseline: uses first scenario as reference', () => {
    const a = makeMetrics({ scenario_id: 'a', is_baseline: false, total_revenue: 1_000_000 })
    const b = makeMetrics({ scenario_id: 'b', is_baseline: false, total_revenue: 1_100_000 })
    const c = makeMetrics({ scenario_id: 'c', is_baseline: false, total_revenue: 1_200_000 })
    const result = computeComparisonMatrix([a, b, c])
    expect(result).toHaveLength(2)
    result.forEach(r => expect(r.scenario_a.scenario_id).toBe('a'))
  })

  it('77. runway_delta: both non-null', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  runway_months: 12 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, runway_months: 18 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].runway_delta_months).toBe(6)
  })

  it('78. runway_delta: base null → null', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  runway_months: null })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, runway_months: 12 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].runway_delta_months).toBeNull()
  })

  it('79. ebitda_delta_pct: 400k → 500k = +25%', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  ebitda: 400_000 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, ebitda: 500_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].ebitda_delta_pct).toBeCloseTo(25)
  })

  it('80. 3 scenarios with baseline → 2 comparisons', () => {
    const base = makeMetrics({ scenario_id: 'base', is_baseline: true })
    const s1   = makeMetrics({ scenario_id: 's1',   is_baseline: false })
    const s2   = makeMetrics({ scenario_id: 's2',   is_baseline: false })
    const result = computeComparisonMatrix([base, s1, s2])
    expect(result).toHaveLength(2)
  })

  it('81. zero base revenue → revenue_delta null', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  total_revenue: 0 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, total_revenue: 100_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].revenue_delta_pct).toBeNull()
  })

  it('82. negative net income delta pct', () => {
    const base  = makeMetrics({ scenario_id: 'base', is_baseline: true,  net_income: 200_000 })
    const other = makeMetrics({ scenario_id: 'opt1', is_baseline: false, net_income: 100_000 })
    const result = computeComparisonMatrix([base, other])
    expect(result[0].net_income_delta_pct).toBeCloseTo(-50)
  })

})

// ── rankScenariosByMetric ─────────────────────────────────────────────────────

describe('rankScenariosByMetric', () => {

  it('83. rank by net_income DESC', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', net_income: 100_000 }),
      makeMetrics({ scenario_id: 'b', net_income: 300_000 }),
      makeMetrics({ scenario_id: 'c', net_income: 200_000 }),
    ]
    const result = rankScenariosByMetric(scenarios, 'net_income')
    expect(result.map(s => s.scenario_id)).toEqual(['b', 'c', 'a'])
  })

  it('84. rank by ebitda DESC', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', ebitda: 50_000 }),
      makeMetrics({ scenario_id: 'b', ebitda: 200_000 }),
    ]
    const result = rankScenariosByMetric(scenarios, 'ebitda')
    expect(result[0].scenario_id).toBe('b')
  })

  it('85. rank by ending_cash DESC', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', ending_cash: 500_000 }),
      makeMetrics({ scenario_id: 'b', ending_cash: 100_000 }),
      makeMetrics({ scenario_id: 'c', ending_cash: 800_000 }),
    ]
    const result = rankScenariosByMetric(scenarios, 'ending_cash')
    expect(result.map(s => s.scenario_id)).toEqual(['c', 'a', 'b'])
  })

  it('86. null runway_months last', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', runway_months: null }),
      makeMetrics({ scenario_id: 'b', runway_months: 12 }),
      makeMetrics({ scenario_id: 'c', runway_months: 6 }),
    ]
    const result = rankScenariosByMetric(scenarios, 'runway_months')
    expect(result[result.length - 1].scenario_id).toBe('a')
    expect(result[0].scenario_id).toBe('b')
  })

  it('87. null gross_margin_pct last', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', gross_margin_pct: null }),
      makeMetrics({ scenario_id: 'b', gross_margin_pct: 40 }),
    ]
    const result = rankScenariosByMetric(scenarios, 'gross_margin_pct')
    expect(result[0].scenario_id).toBe('b')
    expect(result[1].scenario_id).toBe('a')
  })

  it('88. all nulls — still returns array of same length', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', runway_months: null }),
      makeMetrics({ scenario_id: 'b', runway_months: null }),
    ]
    const result = rankScenariosByMetric(scenarios, 'runway_months')
    expect(result).toHaveLength(2)
  })

  it('89. empty array → empty', () => {
    expect(rankScenariosByMetric([], 'net_income')).toEqual([])
  })

  it('90. does not mutate original array', () => {
    const original = [
      makeMetrics({ scenario_id: 'a', net_income: 100 }),
      makeMetrics({ scenario_id: 'b', net_income: 300 }),
    ]
    const firstId = original[0].scenario_id
    rankScenariosByMetric(original, 'net_income')
    expect(original[0].scenario_id).toBe(firstId)
  })

})

// ── computeScenarioSpread ─────────────────────────────────────────────────────

describe('computeScenarioSpread', () => {

  it('91. single scenario → null', () => {
    const s = [makeMetrics({ net_income: 100_000 })]
    expect(computeScenarioSpread(s, 'net_income')).toBeNull()
  })

  it('92. empty array → null', () => {
    expect(computeScenarioSpread([], 'net_income')).toBeNull()
  })

  it('93. two scenarios: min/max/range', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', net_income: 100_000 }),
      makeMetrics({ scenario_id: 'b', net_income: 300_000 }),
    ]
    const result = computeScenarioSpread(scenarios, 'net_income')
    expect(result).not.toBeNull()
    expect(result!.min).toBe(100_000)
    expect(result!.max).toBe(300_000)
    expect(result!.range).toBe(200_000)
  })

  it('94. CV calculation: two values 100k and 300k → CV ≈ 0.5', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', net_income: 100_000 }),
      makeMetrics({ scenario_id: 'b', net_income: 300_000 }),
    ]
    const result = computeScenarioSpread(scenarios, 'net_income')!
    // mean = 200k, stddev = 100k, CV = 100k/200k = 0.5
    expect(result.cv).toBeCloseTo(0.5)
  })

  it('95. zero mean → cv null', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', net_income: -100_000 }),
      makeMetrics({ scenario_id: 'b', net_income:  100_000 }),
    ]
    const result = computeScenarioSpread(scenarios, 'net_income')!
    expect(result.cv).toBeNull()
  })

  it('96. all same values → range 0, cv 0', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', ending_cash: 500_000 }),
      makeMetrics({ scenario_id: 'b', ending_cash: 500_000 }),
      makeMetrics({ scenario_id: 'c', ending_cash: 500_000 }),
    ]
    const result = computeScenarioSpread(scenarios, 'ending_cash')!
    expect(result.range).toBe(0)
    expect(result.cv).toBeCloseTo(0)
  })

  it('97. ending_cash spread with 3 scenarios', () => {
    const scenarios = [
      makeMetrics({ scenario_id: 'a', ending_cash: 200_000 }),
      makeMetrics({ scenario_id: 'b', ending_cash: 500_000 }),
      makeMetrics({ scenario_id: 'c', ending_cash: 800_000 }),
    ]
    const result = computeScenarioSpread(scenarios, 'ending_cash')!
    expect(result.min).toBe(200_000)
    expect(result.max).toBe(800_000)
    expect(result.range).toBe(600_000)
  })

})

// ── generateComparisonNarrative ───────────────────────────────────────────────

describe('generateComparisonNarrative', () => {

  it('98. with recommendation: mentions count and name', () => {
    const text = generateComparisonNarrative(3, 'Optimist', 'profitability', [])
    expect(text).toContain('3 senaryo')
    expect(text).toContain('Optimist')
  })

  it('99. no recommendation: fallback message', () => {
    const text = generateComparisonNarrative(2, null, 'profitability', [])
    expect(text).toContain('belirleyici bir fark bulunamadı')
  })

  it('100. very_high risk scenario: adds warning', () => {
    const risks = [{ name: 'Kötümser', risk: 'very_high' }]
    const text = generateComparisonNarrative(2, 'İyimser', 'liquidity', risks)
    expect(text).toContain('Dikkat')
    expect(text).toContain('Kötümser')
  })

  it('101. moderate risk: no Dikkat warning', () => {
    const risks = [{ name: 'Orta', risk: 'moderate' }]
    const text = generateComparisonNarrative(2, 'İyimser', 'profitability', risks)
    expect(text).not.toContain('Dikkat')
  })

  it('102. multiple very_high risks: all names mentioned', () => {
    const risks = [
      { name: 'Senaryo A', risk: 'very_high' },
      { name: 'Senaryo B', risk: 'very_high' },
    ]
    const text = generateComparisonNarrative(3, 'Best', 'liquidity', risks)
    expect(text).toContain('Senaryo A')
    expect(text).toContain('Senaryo B')
  })

  it('103. returns non-empty string always', () => {
    const text = generateComparisonNarrative(0, null, 'profitability', [])
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })

  it('104. single scenario with recommendation', () => {
    const text = generateComparisonNarrative(1, 'Tek Senaryo', 'profitability', [])
    expect(text).toContain('Tek Senaryo')
  })

  it('105. high risk does not trigger warning (only very_high does)', () => {
    const risks = [{ name: 'Riskli', risk: 'high' }]
    const text = generateComparisonNarrative(2, 'Best', 'profitability', risks)
    expect(text).not.toContain('Dikkat')
  })

})

// ── buildScenarioMetricsFromSummary ──────────────────────────────────────────

describe('buildScenarioMetricsFromSummary', () => {

  it('106. basic build: derived gross_profit correct', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 1_000_000,
      total_cogs:    400_000,
    })
    expect(m.gross_profit).toBe(600_000)
  })

  it('107. ebitda derived: gross_profit - total_expenses', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue:   1_000_000,
      total_cogs:      400_000,
      total_expenses:  200_000,
    })
    // gross_profit = 600k, ebitda = 600k - 200k = 400k
    expect(m.ebitda).toBe(400_000)
  })

  it('108. gross_margin_pct derived correctly', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 1_000_000,
      total_cogs:    600_000,
    })
    expect(m.gross_margin_pct).toBeCloseTo(40)
  })

  it('109. net_margin_pct derived correctly', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 1_000_000,
      net_income:    250_000,
    })
    expect(m.net_margin_pct).toBeCloseTo(25)
  })

  it('110. zero revenue → null margins', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 0,
      total_cogs:    0,
      net_income:    0,
    })
    expect(m.gross_margin_pct).toBeNull()
    expect(m.net_margin_pct).toBeNull()
  })

  it('111. runway_months always null', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 1_000_000,
    })
    expect(m.runway_months).toBeNull()
  })

  it('112. missing summary fields default to 0', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Empty', true, {})
    expect(m.total_revenue).toBe(0)
    expect(m.total_cogs).toBe(0)
    expect(m.net_income).toBe(0)
    expect(m.ending_cash).toBe(0)
    expect(m.tax_amount).toBe(0)
    expect(m.total_debt_service).toBe(0)
  })

  it('113. scenario_id and name set correctly', () => {
    const m = buildScenarioMetricsFromSummary('my-id', 'My Scenario', true, {})
    expect(m.scenario_id).toBe('my-id')
    expect(m.scenario_name).toBe('My Scenario')
    expect(m.is_baseline).toBe(true)
  })

  it('114. dscr_avg passed through', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      dscr_avg: 2.5,
    })
    expect(m.dscr_avg).toBe(2.5)
  })

  it('115. break_even_month passed through', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      break_even_month: 6,
    })
    expect(m.break_even_month).toBe(6)
  })

  it('116. null dscr_avg handled', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      dscr_avg: null,
    })
    expect(m.dscr_avg).toBeNull()
  })

  it('117. negative net_income produces negative margin', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 1_000_000,
      net_income:    -50_000,
    })
    expect(m.net_margin_pct).toBeCloseTo(-5)
  })

  it('118. peak_cash and min_cash passed through', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      peak_cash: 800_000,
      min_cash:  50_000,
    })
    expect(m.peak_cash).toBe(800_000)
    expect(m.min_cash).toBe(50_000)
  })

  it('119. gross_profit = revenue when cogs = 0', () => {
    const m = buildScenarioMetricsFromSummary('sc-1', 'Test', false, {
      total_revenue: 500_000,
      total_cogs:    0,
    })
    expect(m.gross_profit).toBe(500_000)
    expect(m.gross_margin_pct).toBeCloseTo(100)
  })

  it('120. is_baseline=false set correctly', () => {
    const m = buildScenarioMetricsFromSummary('sc-2', 'Opt', false, {})
    expect(m.is_baseline).toBe(false)
  })

})
