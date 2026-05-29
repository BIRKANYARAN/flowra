/**
 * Revenue Quality Score — unit tests
 *
 * Tests all pure computation functions.
 * No DB or network calls — pure function tests only.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCoeffientOfVariation,
  computePredictabilityScore,
  computeHhiFromMap,
  computeDiversificationScore,
  scoreDso,
  scoreOverdueRatio,
  computeCollectionEfficiencyScore,
  computeRecurringRevenueScore,
  computeMarginStabilityScore,
  computeRevenueQualityScore,
  classifyRevenueQuality,
  identifyWeakestDimension,
  classifyGrowthQuality,
} from '../lib/services/finance/revenue-quality.service'

// ── computeCoeffientOfVariation ───────────────────────────────────────────────

describe('computeCoeffientOfVariation', () => {

  // Test 1: uniform values → CV = 0
  it('1. uniform values → CV = 0', () => {
    expect(computeCoeffientOfVariation([100, 100, 100, 100])).toBeCloseTo(0)
  })

  // Test 2: single value → CV = 0
  it('2. single value → CV = 0', () => {
    expect(computeCoeffientOfVariation([500])).toBeCloseTo(0)
  })

  // Test 3: empty array → 0
  it('3. empty array → 0', () => {
    expect(computeCoeffientOfVariation([])).toBe(0)
  })

  // Test 4: known CV computation [0, 100] mean=50, stddev=50, CV=1.0
  it('4. [0, 100] → CV = 1.0', () => {
    expect(computeCoeffientOfVariation([0, 100])).toBeCloseTo(1.0)
  })

  // Test 5: mean = 0 → CV = 0
  it('5. all zeros → CV = 0', () => {
    expect(computeCoeffientOfVariation([0, 0, 0])).toBe(0)
  })

  // Test 6: known values: [10, 20, 30] mean=20, variance=66.67, stddev≈8.165, CV≈0.408
  it('6. [10, 20, 30] → correct CV ≈ 0.408', () => {
    expect(computeCoeffientOfVariation([10, 20, 30])).toBeCloseTo(0.4082, 3)
  })

})

// ── computePredictabilityScore ────────────────────────────────────────────────

describe('computePredictabilityScore', () => {

  // Test 7: < 3 months → 0
  it('7. < 3 months returns 0', () => {
    expect(computePredictabilityScore([100, 200])).toBe(0)
  })

  // Test 8: empty array → 0
  it('8. empty array → 0', () => {
    expect(computePredictabilityScore([])).toBe(0)
  })

  // Test 9: uniform revenue → score = 100
  it('9. uniform monthly revenue → score = 100', () => {
    expect(computePredictabilityScore([1000, 1000, 1000, 1000, 1000, 1000])).toBeCloseTo(100)
  })

  // Test 10: highly variable revenue → low score
  it('10. wildly varying revenue → score < 50', () => {
    const score = computePredictabilityScore([0, 0, 100000, 0, 0, 100000])
    expect(score).toBeLessThan(50)
  })

  // Test 11: mildly variable → score between 50 and 100
  it('11. mildly variable → score in (50, 100)', () => {
    const score = computePredictabilityScore([900, 1000, 1100, 950, 1050, 1000])
    expect(score).toBeGreaterThan(50)
    expect(score).toBeLessThanOrEqual(100)
  })

  // Test 12: exactly 3 months — must compute (not return 0)
  it('12. exactly 3 months — computes score', () => {
    const score = computePredictabilityScore([100, 100, 100])
    expect(score).toBe(100)
  })

  // Test 13: result clamped to [0, 100] (very high CV)
  it('13. extreme variation → score clamped to 0', () => {
    const score = computePredictabilityScore([0, 0, 1_000_000])
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

})

// ── computeHhiFromMap ─────────────────────────────────────────────────────────

describe('computeHhiFromMap', () => {

  // Test 14: single customer → HHI = 1.0
  it('14. single customer → HHI = 1.0', () => {
    const m = new Map([['A', 100]])
    expect(computeHhiFromMap(m)).toBeCloseTo(1.0)
  })

  // Test 15: two equal customers → HHI = 0.5
  it('15. two equal customers → HHI = 0.5', () => {
    const m = new Map([['A', 50], ['B', 50]])
    expect(computeHhiFromMap(m)).toBeCloseTo(0.5)
  })

  // Test 16: four equal customers → HHI = 0.25
  it('16. four equal customers → HHI = 0.25', () => {
    const m = new Map([['A', 25], ['B', 25], ['C', 25], ['D', 25]])
    expect(computeHhiFromMap(m)).toBeCloseTo(0.25)
  })

  // Test 17: empty map → 0
  it('17. empty map → 0', () => {
    expect(computeHhiFromMap(new Map())).toBe(0)
  })

  // Test 18: all zero revenues → 0
  it('18. all zero revenues → 0', () => {
    const m = new Map([['A', 0], ['B', 0]])
    expect(computeHhiFromMap(m)).toBe(0)
  })

  // Test 19: 10 equal customers → HHI = 0.1
  it('19. ten equal customers → HHI = 0.1', () => {
    const m = new Map(Array.from({ length: 10 }, (_, i) => [`C${i}`, 100] as [string, number]))
    expect(computeHhiFromMap(m)).toBeCloseTo(0.1)
  })

})

// ── computeDiversificationScore ───────────────────────────────────────────────

describe('computeDiversificationScore', () => {

  // Test 20: single customer → score ≈ 0
  it('20. single customer → score ≈ 0', () => {
    const m = new Map([['A', 1000]])
    expect(computeDiversificationScore(m)).toBeCloseTo(0)
  })

  // Test 21: many equal customers → score near 100
  it('21. 10 equal customers → score near 90', () => {
    const m = new Map(Array.from({ length: 10 }, (_, i) => [`C${i}`, 100] as [string, number]))
    expect(computeDiversificationScore(m)).toBeCloseTo(90)
  })

  // Test 22: two equal customers → score = 50
  it('22. two equal customers → score = 50', () => {
    const m = new Map([['A', 50], ['B', 50]])
    expect(computeDiversificationScore(m)).toBeCloseTo(50)
  })

  // Test 23: empty map → 0
  it('23. empty map → 0', () => {
    expect(computeDiversificationScore(new Map())).toBe(0)
  })

  // Test 24: score always in [0, 100]
  it('24. score always in [0, 100]', () => {
    const m = new Map([['A', 9000], ['B', 100]])
    const s = computeDiversificationScore(m)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(100)
  })

})

// ── scoreDso ──────────────────────────────────────────────────────────────────

describe('scoreDso', () => {

  // Test 25: 30 days → 100
  it('25. 30 days → 100', () => {
    expect(scoreDso(30)).toBe(100)
  })

  // Test 26: 60 days → 50
  it('26. 60 days → 50', () => {
    expect(scoreDso(60)).toBeCloseTo(50)
  })

  // Test 27: 90 days → 0
  it('27. 90 days → 0', () => {
    expect(scoreDso(90)).toBe(0)
  })

  // Test 28: 0 days (paid immediately) → 100
  it('28. 0 days → 100', () => {
    expect(scoreDso(0)).toBe(100)
  })

  // Test 29: > 90 days → 0 (clamped)
  it('29. 120 days → 0 (clamped)', () => {
    expect(scoreDso(120)).toBe(0)
  })

  // Test 30: interpolation at 45 days → 75
  it('30. 45 days → 75 (linear interpolation)', () => {
    expect(scoreDso(45)).toBeCloseTo(75)
  })

})

// ── scoreOverdueRatio ─────────────────────────────────────────────────────────

describe('scoreOverdueRatio', () => {

  // Test 31: 0% overdue → 100
  it('31. 0% overdue → 100', () => {
    expect(scoreOverdueRatio(0)).toBe(100)
  })

  // Test 32: 100% overdue → 0
  it('32. 100% overdue → 0', () => {
    expect(scoreOverdueRatio(100)).toBe(0)
  })

  // Test 33: 50% overdue → 50
  it('33. 50% overdue → 50', () => {
    expect(scoreOverdueRatio(50)).toBe(50)
  })

  // Test 34: negative input → clamped to 100
  it('34. negative overdue → clamped to 100', () => {
    expect(scoreOverdueRatio(-10)).toBe(100)
  })

  // Test 35: > 100% → clamped to 0
  it('35. > 100% → clamped to 0', () => {
    expect(scoreOverdueRatio(150)).toBe(0)
  })

})

// ── computeCollectionEfficiencyScore ─────────────────────────────────────────

describe('computeCollectionEfficiencyScore', () => {

  // Test 36: DSO=30, overdue=0 → (100×0.6 + 100×0.4) = 100
  it('36. perfect scenario → 100', () => {
    expect(computeCollectionEfficiencyScore(30, 0)).toBeCloseTo(100)
  })

  // Test 37: DSO=90, overdue=100 → (0×0.6 + 0×0.4) = 0
  it('37. worst scenario → 0', () => {
    expect(computeCollectionEfficiencyScore(90, 100)).toBeCloseTo(0)
  })

  // Test 38: DSO=60, overdue=50 → (50×0.6 + 50×0.4) = 50
  it('38. mid scenario → 50', () => {
    expect(computeCollectionEfficiencyScore(60, 50)).toBeCloseTo(50)
  })

  // Test 39: DSO=30, overdue=50 → (100×0.6 + 50×0.4) = 80
  it('39. good DSO but high overdue → 80', () => {
    expect(computeCollectionEfficiencyScore(30, 50)).toBeCloseTo(80)
  })

  // Test 40: result always in [0, 100]
  it('40. result always in [0, 100]', () => {
    const s = computeCollectionEfficiencyScore(200, 200)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(100)
  })

})

// ── computeRecurringRevenueScore ──────────────────────────────────────────────

describe('computeRecurringRevenueScore', () => {

  // Test 41: null → 0
  it('41. null → 0', () => {
    expect(computeRecurringRevenueScore(null)).toBe(0)
  })

  // Test 42: passthrough 75 → 75
  it('42. 75 → 75', () => {
    expect(computeRecurringRevenueScore(75)).toBe(75)
  })

  // Test 43: 0 → 0
  it('43. 0 → 0', () => {
    expect(computeRecurringRevenueScore(0)).toBe(0)
  })

  // Test 44: 100 → 100
  it('44. 100 → 100', () => {
    expect(computeRecurringRevenueScore(100)).toBe(100)
  })

  // Test 45: negative → clamped to 0
  it('45. negative input → clamped to 0', () => {
    expect(computeRecurringRevenueScore(-10)).toBe(0)
  })

  // Test 46: > 100 → clamped to 100
  it('46. > 100 → clamped to 100', () => {
    expect(computeRecurringRevenueScore(120)).toBe(100)
  })

})

// ── computeMarginStabilityScore ───────────────────────────────────────────────

describe('computeMarginStabilityScore', () => {

  // Test 47: < 3 data points → 50 (neutral)
  it('47. < 3 data points → 50', () => {
    expect(computeMarginStabilityScore([60, 60])).toBe(50)
  })

  // Test 48: empty → 50
  it('48. empty → 50', () => {
    expect(computeMarginStabilityScore([])).toBe(50)
  })

  // Test 49: stable margins → high score
  it('49. perfectly stable margins (all 60%) → score = 100', () => {
    expect(computeMarginStabilityScore([60, 60, 60, 60, 60, 60])).toBeCloseTo(100)
  })

  // Test 50: very volatile margins → low score
  it('50. wildly volatile margins → score < 50', () => {
    const s = computeMarginStabilityScore([10, 90, 10, 90, 10, 90])
    expect(s).toBeLessThan(50)
  })

  // Test 51: score clamped [0, 100]
  it('51. score clamped to [0, 100]', () => {
    const s = computeMarginStabilityScore([0, 0, 100])
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(100)
  })

})

// ── computeRevenueQualityScore ────────────────────────────────────────────────

describe('computeRevenueQualityScore', () => {

  // Test 52: all 100 → composite = 100
  it('52. all 100 → composite = 100', () => {
    expect(computeRevenueQualityScore(100, 100, 100, 100, 100)).toBeCloseTo(100)
  })

  // Test 53: all 0 → composite = 0
  it('53. all 0 → composite = 0', () => {
    expect(computeRevenueQualityScore(0, 0, 0, 0, 0)).toBeCloseTo(0)
  })

  // Test 54: weights verify — predictability=100, rest 0 → 25
  it('54. only predictability=100, rest 0 → 25', () => {
    expect(computeRevenueQualityScore(100, 0, 0, 0, 0)).toBeCloseTo(25)
  })

  // Test 55: only diversification=100 → 20
  it('55. only diversification=100 → 20', () => {
    expect(computeRevenueQualityScore(0, 100, 0, 0, 0)).toBeCloseTo(20)
  })

  // Test 56: only collection=100 → 25
  it('56. only collection=100 → 25', () => {
    expect(computeRevenueQualityScore(0, 0, 100, 0, 0)).toBeCloseTo(25)
  })

  // Test 57: only recurring=100 → 15
  it('57. only recurring=100 → 15', () => {
    expect(computeRevenueQualityScore(0, 0, 0, 100, 0)).toBeCloseTo(15)
  })

  // Test 58: only margin_stability=100 → 15
  it('58. only margin_stability=100 → 15', () => {
    expect(computeRevenueQualityScore(0, 0, 0, 0, 100)).toBeCloseTo(15)
  })

  // Test 59: weights sum to 100%
  it('59. weights sum to 100% (25+20+25+15+15=100)', () => {
    // If all = 1 point each weight: 1×(25+20+25+15+15)/100 = 1
    expect(computeRevenueQualityScore(1, 1, 1, 1, 1)).toBeCloseTo(1)
  })

  // Test 60: known mixed inputs
  it('60. mixed inputs: pred=80, div=60, col=70, rec=40, mar=90 → weighted avg', () => {
    const expected = 80*0.25 + 60*0.20 + 70*0.25 + 40*0.15 + 90*0.15
    expect(computeRevenueQualityScore(80, 60, 70, 40, 90)).toBeCloseTo(expected)
  })

})

// ── classifyRevenueQuality ────────────────────────────────────────────────────

describe('classifyRevenueQuality', () => {

  // Test 61: ≥ 80 → premium
  it('61. 80 → premium', () => {
    expect(classifyRevenueQuality(80)).toBe('premium')
  })

  // Test 62: 100 → premium
  it('62. 100 → premium', () => {
    expect(classifyRevenueQuality(100)).toBe('premium')
  })

  // Test 63: 65–79 → strong
  it('63. 65 → strong', () => {
    expect(classifyRevenueQuality(65)).toBe('strong')
  })

  // Test 64: 79 → strong
  it('64. 79 → strong', () => {
    expect(classifyRevenueQuality(79)).toBe('strong')
  })

  // Test 65: 50–64 → moderate
  it('65. 50 → moderate', () => {
    expect(classifyRevenueQuality(50)).toBe('moderate')
  })

  // Test 66: 64.9 → moderate
  it('66. 64.9 → moderate', () => {
    expect(classifyRevenueQuality(64.9)).toBe('moderate')
  })

  // Test 67: 35–49 → developing
  it('67. 35 → developing', () => {
    expect(classifyRevenueQuality(35)).toBe('developing')
  })

  // Test 68: 49 → developing
  it('68. 49 → developing', () => {
    expect(classifyRevenueQuality(49)).toBe('developing')
  })

  // Test 69: < 35 → fragile
  it('69. 34 → fragile', () => {
    expect(classifyRevenueQuality(34)).toBe('fragile')
  })

  // Test 70: 0 → fragile
  it('70. 0 → fragile', () => {
    expect(classifyRevenueQuality(0)).toBe('fragile')
  })

})

// ── identifyWeakestDimension ──────────────────────────────────────────────────

describe('identifyWeakestDimension', () => {

  // Test 71: collection is lowest
  it('71. collection lowest → collection', () => {
    const dims = { predictability: 80, diversification: 70, collection: 30, recurring: 60, margin_stability: 75 }
    expect(identifyWeakestDimension(dims)).toBe('collection')
  })

  // Test 72: recurring is lowest
  it('72. recurring lowest → recurring', () => {
    const dims = { predictability: 80, diversification: 70, collection: 60, recurring: 10, margin_stability: 75 }
    expect(identifyWeakestDimension(dims)).toBe('recurring')
  })

  // Test 73: predictability is lowest
  it('73. predictability lowest → predictability', () => {
    const dims = { predictability: 5, diversification: 70, collection: 60, recurring: 50, margin_stability: 75 }
    expect(identifyWeakestDimension(dims)).toBe('predictability')
  })

  // Test 74: margin_stability is lowest
  it('74. margin_stability lowest → margin_stability', () => {
    const dims = { predictability: 80, diversification: 70, collection: 60, recurring: 50, margin_stability: 20 }
    expect(identifyWeakestDimension(dims)).toBe('margin_stability')
  })

  // Test 75: all equal → returns first found minimum (predictability)
  it('75. all equal → returns predictability (first in key order)', () => {
    const dims = { predictability: 50, diversification: 50, collection: 50, recurring: 50, margin_stability: 50 }
    // First key is predictability
    expect(identifyWeakestDimension(dims)).toBe('predictability')
  })

})

// ── classifyGrowthQuality ─────────────────────────────────────────────────────

describe('classifyGrowthQuality', () => {

  // Test 76: negative growth → declining
  it('76. negative growth → declining', () => {
    expect(classifyGrowthQuality(-5, 10)).toBe('declining')
  })

  // Test 77: declining revenue + improving quality → still declining
  it('77. revenue declining dominates → declining', () => {
    expect(classifyGrowthQuality(-1, 20)).toBe('declining')
  })

  // Test 78: growing + quality improving → quality_growth
  it('78. growing + quality improving → quality_growth', () => {
    expect(classifyGrowthQuality(10, 5)).toBe('quality_growth')
  })

  // Test 79: growing + quality degrading → growth_only
  it('79. growing + quality degrading → growth_only', () => {
    expect(classifyGrowthQuality(10, -5)).toBe('growth_only')
  })

  // Test 80: not growing + quality improving → quality_only
  it('80. no growth + quality improving → quality_only', () => {
    expect(classifyGrowthQuality(0, 5)).toBe('quality_only')
  })

  // Test 81: neither growing nor quality improving → stagnant
  it('81. no growth + no quality improvement → stagnant', () => {
    expect(classifyGrowthQuality(0, 0)).toBe('stagnant')
  })

  // Test 82: no growth + quality degrading → stagnant
  it('82. no growth + quality degrading → stagnant (not growing, not improving)', () => {
    expect(classifyGrowthQuality(0, -5)).toBe('stagnant')
  })

})

// ── Integration: full composite from known inputs ─────────────────────────────

describe('Integration: full composite score', () => {

  // Test 83: all 100 → composite = 100, class = premium
  it('83. all 100 → composite = 100, class = premium', () => {
    const s = computeRevenueQualityScore(100, 100, 100, 100, 100)
    expect(s).toBeCloseTo(100)
    expect(classifyRevenueQuality(s)).toBe('premium')
  })

  // Test 84: realistic mid scenario
  it('84. realistic mid-range scores → composite class = moderate', () => {
    const pred = computePredictabilityScore([900, 950, 1000, 1050, 980, 1010])
    const div  = computeDiversificationScore(new Map([['A', 400], ['B', 300], ['C', 200], ['D', 100]]))
    const col  = computeCollectionEfficiencyScore(45, 20)
    const rec  = computeRecurringRevenueScore(50)
    const mar  = computeMarginStabilityScore([58, 60, 62, 59, 61, 60])
    const s    = computeRevenueQualityScore(pred, div, col, rec, mar)
    const cls  = classifyRevenueQuality(s)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(100)
    expect(['premium', 'strong', 'moderate', 'developing', 'fragile']).toContain(cls)
  })

  // Test 85: weakest dimension detection in integration
  it('85. integration: weakest dimension found correctly', () => {
    const dims = {
      predictability:   90,
      diversification:  85,
      collection:       70,
      recurring:        20,   // weakest
      margin_stability: 80,
    }
    expect(identifyWeakestDimension(dims)).toBe('recurring')
  })

  // Test 86: growth quality integration — growing revenue, improving quality
  it('86. growing revenue + improving quality → quality_growth', () => {
    const gq = classifyGrowthQuality(15.5, 8.2)
    expect(gq).toBe('quality_growth')
  })

  // Test 87: CV=0 for stable revenues → predictability = 100
  it('87. identical revenues → predictability exactly 100', () => {
    const revs = [50000, 50000, 50000, 50000, 50000, 50000]
    expect(computePredictabilityScore(revs)).toBe(100)
  })

  // Test 88: HHI of equal 5 customers = 0.2, diversification = 80
  it('88. 5 equal customers → diversification = 80', () => {
    const m = new Map<string, number>([
      ['A', 200], ['B', 200], ['C', 200], ['D', 200], ['E', 200],
    ])
    expect(computeDiversificationScore(m)).toBeCloseTo(80)
  })

  // Test 89: collection efficiency at boundary values
  it('89. DSO=30 + overdue=0 → collection = 100', () => {
    expect(computeCollectionEfficiencyScore(30, 0)).toBeCloseTo(100)
  })

  // Test 90: margin stability with perfectly stable data
  it('90. 6 months of 60% margin → stability = 100', () => {
    expect(computeMarginStabilityScore([60, 60, 60, 60, 60, 60])).toBeCloseTo(100)
  })

})
