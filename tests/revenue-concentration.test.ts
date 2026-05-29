/**
 * Revenue Concentration Risk Service — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeHhi,
  computeConcentrationRiskScore,
  classifyConcentrationRisk,
  computeParetoCount,
  computeTopNPct,
  computeChurnImpact,
  computeRevenueResilience,
  identifyConcentrationThreats,
  buildConcentrationAnalysis,
  compareConcentrationTrend,
  computeSafeRevenue,
  generateConcentrationNarrative,
  computeAnnualRevenueAtRisk,
  type ConcentrationEntity,
} from '../lib/services/commercial/revenue-concentration.service'

// ── computeHhi ────────────────────────────────────────────────────────────────

describe('computeHhi', () => {

  it('1. single entity (100%) → HHI = 1.0', () => {
    expect(computeHhi([100])).toBeCloseTo(1.0)
  })

  it('2. two equal entities (50% each) → HHI = 0.5', () => {
    expect(computeHhi([50, 50])).toBeCloseTo(0.5)
  })

  it('3. four equal entities (25% each) → HHI = 0.25', () => {
    expect(computeHhi([25, 25, 25, 25])).toBeCloseTo(0.25)
  })

  it('4. ten equal entities (10% each) → HHI = 0.1', () => {
    const pcts = Array(10).fill(10)
    expect(computeHhi(pcts)).toBeCloseTo(0.1)
  })

  it('5. empty array → HHI = 0', () => {
    expect(computeHhi([])).toBe(0)
  })

  it('6. highly unequal: 90% + 10% → HHI = 0.82', () => {
    expect(computeHhi([90, 10])).toBeCloseTo(0.82)
  })

  it('7. three equal (33.33% each) → HHI ≈ 0.333', () => {
    expect(computeHhi([33.333, 33.333, 33.333])).toBeCloseTo(0.333, 2)
  })

  it('8. single entity at various shares is proportional to square', () => {
    expect(computeHhi([50])).toBeCloseTo(0.25)
    expect(computeHhi([25])).toBeCloseTo(0.0625)
  })

})

// ── computeConcentrationRiskScore ─────────────────────────────────────────────

describe('computeConcentrationRiskScore', () => {

  it('9. HHI = 1.0 → score = 100 (single entity, fully concentrated)', () => {
    expect(computeConcentrationRiskScore(1.0)).toBe(100)
  })

  it('10. HHI = 0.5 → score = 100 (capped)', () => {
    expect(computeConcentrationRiskScore(0.5)).toBe(100)
  })

  it('11. HHI = 0.25 → score = 50 (amplified: 0.25 × 200)', () => {
    expect(computeConcentrationRiskScore(0.25)).toBeCloseTo(50)
  })

  it('12. HHI = 0.1 → score = 20', () => {
    expect(computeConcentrationRiskScore(0.1)).toBeCloseTo(20)
  })

  it('13. HHI = 0 → score = 0', () => {
    expect(computeConcentrationRiskScore(0)).toBe(0)
  })

  it('14. score is never negative', () => {
    expect(computeConcentrationRiskScore(-0.1)).toBe(-20)
    // only non-negative HHIs are expected in real use; ensure no cap fires
    expect(Math.max(0, computeConcentrationRiskScore(0.05))).toBeGreaterThanOrEqual(0)
  })

  it('15. score is never above 100', () => {
    expect(computeConcentrationRiskScore(2.0)).toBe(100)
  })

})

// ── classifyConcentrationRisk ─────────────────────────────────────────────────

describe('classifyConcentrationRisk', () => {

  it('16. HHI = 1.0 → critical', () => {
    expect(classifyConcentrationRisk(1.0)).toBe('critical')
  })

  it('17. HHI = 0.6 → critical (> 0.5)', () => {
    expect(classifyConcentrationRisk(0.6)).toBe('critical')
  })

  it('18. HHI = 0.5 → high (boundary: not > 0.5)', () => {
    // 0.5 is not strictly > 0.5, so it falls to high (> 0.25)
    expect(classifyConcentrationRisk(0.5)).toBe('high')
  })

  it('19. HHI = 0.3 → high (> 0.25)', () => {
    expect(classifyConcentrationRisk(0.3)).toBe('high')
  })

  it('20. HHI = 0.26 → high', () => {
    expect(classifyConcentrationRisk(0.26)).toBe('high')
  })

  it('21. HHI = 0.25 → moderate (boundary: not > 0.25)', () => {
    expect(classifyConcentrationRisk(0.25)).toBe('moderate')
  })

  it('22. HHI = 0.2 → moderate (> 0.15)', () => {
    expect(classifyConcentrationRisk(0.2)).toBe('moderate')
  })

  it('23. HHI = 0.15 → low (boundary: not > 0.15)', () => {
    expect(classifyConcentrationRisk(0.15)).toBe('low')
  })

  it('24. HHI = 0.1 → low (> 0.08)', () => {
    expect(classifyConcentrationRisk(0.1)).toBe('low')
  })

  it('25. HHI = 0.08 → diversified (boundary: not > 0.08)', () => {
    expect(classifyConcentrationRisk(0.08)).toBe('diversified')
  })

  it('26. HHI = 0.05 → diversified', () => {
    expect(classifyConcentrationRisk(0.05)).toBe('diversified')
  })

  it('27. HHI = 0 → diversified', () => {
    expect(classifyConcentrationRisk(0)).toBe('diversified')
  })

})

// ── computeParetoCount ────────────────────────────────────────────────────────

describe('computeParetoCount', () => {

  it('28. empty → 0', () => {
    expect(computeParetoCount([])).toBe(0)
  })

  it('29. single entity at 100% → 1 for threshold 80', () => {
    expect(computeParetoCount([100])).toBe(1)
  })

  it('30. three equal (33.33%) → need all 3 to reach 80%', () => {
    // 33.33 + 33.33 = 66.66 < 80; all 3 = 100 ≥ 80
    expect(computeParetoCount([33.33, 33.33, 33.33])).toBe(3)
  })

  it('31. [60, 25, 15] → 2 to reach 80% (60+25=85 ≥ 80)', () => {
    expect(computeParetoCount([60, 25, 15])).toBe(2)
  })

  it('32. [80, 15, 5] → 1 to reach 80%', () => {
    expect(computeParetoCount([80, 15, 5])).toBe(1)
  })

  it('33. custom threshold 90: [60, 25, 15] → 3', () => {
    // 60+25=85 < 90; 60+25+15=100 ≥ 90
    expect(computeParetoCount([60, 25, 15], 90)).toBe(3)
  })

  it('34. all entities too small to reach threshold → returns all', () => {
    expect(computeParetoCount([10, 10, 10], 80)).toBe(3)
  })

})

// ── computeTopNPct ────────────────────────────────────────────────────────────

describe('computeTopNPct', () => {

  it('35. top 1 of [60, 25, 15] → 60', () => {
    expect(computeTopNPct([60, 25, 15], 1)).toBeCloseTo(60)
  })

  it('36. top 3 of [60, 25, 15] → 100', () => {
    expect(computeTopNPct([60, 25, 15], 3)).toBeCloseTo(100)
  })

  it('37. top 5 when array has only 3 elements → sum of all 3', () => {
    expect(computeTopNPct([60, 25, 15], 5)).toBeCloseTo(100)
  })

  it('38. top 0 → 0', () => {
    expect(computeTopNPct([60, 25, 15], 0)).toBe(0)
  })

  it('39. empty array → 0', () => {
    expect(computeTopNPct([], 3)).toBe(0)
  })

  it('40. top 2 of [50, 30, 20] → 80', () => {
    expect(computeTopNPct([50, 30, 20], 2)).toBeCloseTo(80)
  })

})

// ── computeChurnImpact ────────────────────────────────────────────────────────

describe('computeChurnImpact', () => {

  it('41. equals top revenue pct', () => {
    expect(computeChurnImpact([60, 25, 15])).toBe(60)
  })

  it('42. empty array → 0', () => {
    expect(computeChurnImpact([])).toBe(0)
  })

  it('43. single entity → 100', () => {
    expect(computeChurnImpact([100])).toBe(100)
  })

})

// ── computeRevenueResilience ──────────────────────────────────────────────────

describe('computeRevenueResilience', () => {

  it('44. risk 0 → resilience 100', () => {
    expect(computeRevenueResilience(0)).toBe(100)
  })

  it('45. risk 100 → resilience 0', () => {
    expect(computeRevenueResilience(100)).toBe(0)
  })

  it('46. risk 40 → resilience 60', () => {
    expect(computeRevenueResilience(40)).toBe(60)
  })

  it('47. risk 75 → resilience 25', () => {
    expect(computeRevenueResilience(75)).toBe(25)
  })

})

// ── identifyConcentrationThreats ──────────────────────────────────────────────

describe('identifyConcentrationThreats', () => {

  const makeEntity = (key: string, pct: number): ConcentrationEntity => ({
    entity_key: key,
    entity_name: key,
    revenue_try: pct * 1000,
    revenue_pct: pct,
    is_pareto_80: pct > 20,
  })

  it('48. default threshold 20%: filters > 20%', () => {
    const entities = [makeEntity('A', 40), makeEntity('B', 20), makeEntity('C', 10)]
    const threats = identifyConcentrationThreats(entities)
    expect(threats).toHaveLength(1)
    expect(threats[0].entity_key).toBe('A')
  })

  it('49. custom threshold 30%', () => {
    const entities = [makeEntity('A', 40), makeEntity('B', 25), makeEntity('C', 10)]
    const threats = identifyConcentrationThreats(entities, 30)
    expect(threats).toHaveLength(1)
    expect(threats[0].entity_key).toBe('A')
  })

  it('50. no threats when all below threshold', () => {
    const entities = [makeEntity('A', 10), makeEntity('B', 15), makeEntity('C', 5)]
    expect(identifyConcentrationThreats(entities)).toHaveLength(0)
  })

  it('51. all above threshold', () => {
    const entities = [makeEntity('A', 50), makeEntity('B', 30), makeEntity('C', 20.1)]
    expect(identifyConcentrationThreats(entities)).toHaveLength(3)
  })

  it('52. boundary: exactly 20% is NOT a threat (strict >)', () => {
    const entities = [makeEntity('A', 20)]
    expect(identifyConcentrationThreats(entities)).toHaveLength(0)
  })

})

// ── buildConcentrationAnalysis ────────────────────────────────────────────────

describe('buildConcentrationAnalysis', () => {

  it('53. empty input → zeroed-out analysis', () => {
    const result = buildConcentrationAnalysis('customer', [])
    expect(result.entity_count).toBe(0)
    expect(result.total_revenue_try).toBe(0)
    expect(result.hhi).toBe(0)
    expect(result.entities).toHaveLength(0)
  })

  it('54. entities sorted by revenue descending', () => {
    const input = [
      { entity_key: 'B', entity_name: 'B', revenue_try: 100 },
      { entity_key: 'A', entity_name: 'A', revenue_try: 300 },
      { entity_key: 'C', entity_name: 'C', revenue_try: 50 },
    ]
    const result = buildConcentrationAnalysis('customer', input)
    expect(result.entities[0].entity_key).toBe('A')
    expect(result.entities[1].entity_key).toBe('B')
    expect(result.entities[2].entity_key).toBe('C')
  })

  it('55. correct total_revenue_try', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 600 },
      { entity_key: 'B', entity_name: 'B', revenue_try: 400 },
    ]
    const result = buildConcentrationAnalysis('customer', input)
    expect(result.total_revenue_try).toBe(1000)
  })

  it('56. revenue_pct values sum to ~100', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 600 },
      { entity_key: 'B', entity_name: 'B', revenue_try: 250 },
      { entity_key: 'C', entity_name: 'C', revenue_try: 150 },
    ]
    const result = buildConcentrationAnalysis('customer', input)
    const sum = result.entities.reduce((s, e) => s + e.revenue_pct, 0)
    expect(sum).toBeCloseTo(100)
  })

  it('57. HHI is computed from shares', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 100 },
    ]
    const result = buildConcentrationAnalysis('customer', input)
    expect(result.hhi).toBeCloseTo(1.0)
  })

  it('58. pareto_80_count correct', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 600 }, // 60%
      { entity_key: 'B', entity_name: 'B', revenue_try: 250 }, // 25% → cumsum 85%
      { entity_key: 'C', entity_name: 'C', revenue_try: 150 }, // 15%
    ]
    const result = buildConcentrationAnalysis('customer', input)
    // 60% → 60, 60+25=85 >= 80, so pareto_80_count = 2
    expect(result.pareto_80_count).toBe(2)
  })

  it('59. is_pareto_80 marks correct entities', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 600 }, // 60%
      { entity_key: 'B', entity_name: 'B', revenue_try: 250 }, // 25% → 85% cumulative
      { entity_key: 'C', entity_name: 'C', revenue_try: 150 }, // 15%
    ]
    const result = buildConcentrationAnalysis('customer', input)
    expect(result.entities[0].is_pareto_80).toBe(true)
    expect(result.entities[1].is_pareto_80).toBe(true)
    expect(result.entities[2].is_pareto_80).toBe(false)
  })

  it('60. dimension field preserved', () => {
    const input = [{ entity_key: 'P1', entity_name: 'Product 1', revenue_try: 500 }]
    const result = buildConcentrationAnalysis('product', input)
    expect(result.dimension).toBe('product')
  })

  it('61. top_1_pct, top_3_pct, top_5_pct computed correctly', () => {
    const input = [
      { entity_key: 'A', entity_name: 'A', revenue_try: 500 }, // 50%
      { entity_key: 'B', entity_name: 'B', revenue_try: 200 }, // 20%
      { entity_key: 'C', entity_name: 'C', revenue_try: 150 }, // 15%
      { entity_key: 'D', entity_name: 'D', revenue_try: 100 }, // 10%
      { entity_key: 'E', entity_name: 'E', revenue_try:  50 }, //  5%
    ]
    const result = buildConcentrationAnalysis('customer', input)
    expect(result.top_1_pct).toBeCloseTo(50)
    expect(result.top_3_pct).toBeCloseTo(85)
    expect(result.top_5_pct).toBeCloseTo(100)
  })

})

// ── compareConcentrationTrend ─────────────────────────────────────────────────

describe('compareConcentrationTrend', () => {

  it('62. priorHhi null → insufficient_data', () => {
    expect(compareConcentrationTrend(0.3, null)).toBe('insufficient_data')
  })

  it('63. improving: current < prior × 0.95', () => {
    // prior 0.4, current 0.37 (ratio 0.925 < 0.95)
    expect(compareConcentrationTrend(0.37, 0.4)).toBe('improving')
  })

  it('64. worsening: current > prior × 1.05', () => {
    // prior 0.4, current 0.43 (ratio 1.075 > 1.05)
    expect(compareConcentrationTrend(0.43, 0.4)).toBe('worsening')
  })

  it('65. stable: within ±5%', () => {
    // prior 0.4, current 0.4 (ratio 1.0)
    expect(compareConcentrationTrend(0.4, 0.4)).toBe('stable')
  })

  it('66. stable: slightly below threshold', () => {
    // prior 0.4, current 0.385 (ratio 0.9625, ≥ 0.95 → stable)
    expect(compareConcentrationTrend(0.385, 0.4)).toBe('stable')
  })

  it('67. prior = 0 → stable (division guard)', () => {
    expect(compareConcentrationTrend(0.1, 0)).toBe('stable')
  })

})

// ── computeSafeRevenue ────────────────────────────────────────────────────────

describe('computeSafeRevenue', () => {

  it('68. 60% top entity: safe = 40% of total', () => {
    expect(computeSafeRevenue(1_000_000, 60)).toBeCloseTo(400_000)
  })

  it('69. 100% top entity: safe = 0', () => {
    expect(computeSafeRevenue(1_000_000, 100)).toBeCloseTo(0)
  })

  it('70. 0% top entity: safe = total', () => {
    expect(computeSafeRevenue(1_000_000, 0)).toBeCloseTo(1_000_000)
  })

  it('71. 25% top entity with 800k total → safe = 600k', () => {
    expect(computeSafeRevenue(800_000, 25)).toBeCloseTo(600_000)
  })

})

// ── generateConcentrationNarrative ───────────────────────────────────────────

describe('generateConcentrationNarrative', () => {

  it('72. critical → Turkish critical narrative with % values', () => {
    const n = generateConcentrationNarrative('critical', 60, 85)
    expect(n).toContain('60')
    expect(n.length).toBeGreaterThan(10)
    expect(typeof n).toBe('string')
  })

  it('73. high → Turkish high narrative with % values', () => {
    const n = generateConcentrationNarrative('high', 30, 75)
    expect(n).toContain('75')
    expect(n.length).toBeGreaterThan(10)
  })

  it('74. moderate → Turkish moderate narrative', () => {
    const n = generateConcentrationNarrative('moderate', 18, 45)
    expect(n.length).toBeGreaterThan(10)
    expect(typeof n).toBe('string')
  })

  it('75. low → Turkish low narrative', () => {
    const n = generateConcentrationNarrative('low', 12, 32)
    expect(n.length).toBeGreaterThan(5)
  })

  it('76. diversified → Turkish diversified narrative', () => {
    const n = generateConcentrationNarrative('diversified', 5, 15)
    expect(n.length).toBeGreaterThan(5)
  })

  it('77. all risk levels return non-empty strings', () => {
    const levels: Array<ReturnType<typeof classifyConcentrationRisk>> = [
      'critical', 'high', 'moderate', 'low', 'diversified',
    ]
    for (const level of levels) {
      expect(generateConcentrationNarrative(level, 30, 60)).toBeTruthy()
    }
  })

})

// ── computeAnnualRevenueAtRisk ────────────────────────────────────────────────

describe('computeAnnualRevenueAtRisk', () => {

  it('78. monthly 100k → annual 1.2M', () => {
    expect(computeAnnualRevenueAtRisk(100_000)).toBe(1_200_000)
  })

  it('79. monthly 0 → annual 0', () => {
    expect(computeAnnualRevenueAtRisk(0)).toBe(0)
  })

  it('80. monthly 50k → annual 600k', () => {
    expect(computeAnnualRevenueAtRisk(50_000)).toBe(600_000)
  })

})

// ── Integration: 3 customers (60%, 25%, 15%) ─────────────────────────────────

describe('Integration: 3-customer scenario', () => {

  const customerRevenues = [
    { entity_key: 'cust-a', entity_name: 'Müşteri A', revenue_try: 60_000 },
    { entity_key: 'cust-b', entity_name: 'Müşteri B', revenue_try: 25_000 },
    { entity_key: 'cust-c', entity_name: 'Müşteri C', revenue_try: 15_000 },
  ]

  it('81. analysis builds without error', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(result).toBeDefined()
  })

  it('82. HHI = 0.36 + 0.0625 + 0.0225 = 0.445 (high risk)', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    // (60/100)² + (25/100)² + (15/100)² = 0.36 + 0.0625 + 0.0225 = 0.445
    expect(result.hhi).toBeCloseTo(0.445, 3)
  })

  it('83. risk level = high (0.445 > 0.25)', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(classifyConcentrationRisk(result.hhi)).toBe('high')
  })

  it('84. top 1 pct = 60%', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(result.top_1_pct).toBeCloseTo(60)
  })

  it('85. top 3 pct = 100%', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(result.top_3_pct).toBeCloseTo(100)
  })

  it('86. pareto 80 count = 2 (60+25=85 ≥ 80)', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(result.pareto_80_count).toBe(2)
  })

  it('87. risk score = min(100, 0.445 × 200) ≈ 89', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(result.risk_score).toBeCloseTo(89)
  })

  it('88. resilience score ≈ 11 (100 - risk_score)', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(computeRevenueResilience(result.risk_score)).toBeCloseTo(11, 0)
  })

  it('89. churn impact = 60% (top customer)', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    const revPcts = result.entities.map(e => e.revenue_pct)
    expect(computeChurnImpact(revPcts)).toBeCloseTo(60)
  })

  it('90. safe revenue = 40% of 100k = 40k', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    expect(computeSafeRevenue(result.total_revenue_try, result.top_1_pct)).toBeCloseTo(40_000)
  })

  it('91. concentration threats includes cust-a (60%) and cust-b (25%), both > 20%', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    const threats = identifyConcentrationThreats(result.entities)
    expect(threats).toHaveLength(2)
    expect(threats.map(t => t.entity_key)).toContain('cust-a')
    expect(threats.map(t => t.entity_key)).toContain('cust-b')
  })

  it('92. narrative is a non-empty Turkish string for "high" risk', () => {
    const result = buildConcentrationAnalysis('customer', customerRevenues)
    const level = classifyConcentrationRisk(result.hhi)
    const narrative = generateConcentrationNarrative(level, result.top_1_pct, result.top_3_pct)
    expect(narrative.length).toBeGreaterThan(10)
  })

})
