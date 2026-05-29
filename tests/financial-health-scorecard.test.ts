/**
 * Financial Health Scorecard — Unit Tests
 *
 * Tests all pure computation functions in financial-health-scorecard.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * 110+ tests total.
 */

import { describe, it, expect } from 'vitest'
import {
  SCORECARD_WEIGHTS,
  computeLiquidityScore,
  computeProfitabilityScore,
  computeReceivablesScore,
  computeEfficiencyScore,
  computeDebtBurdenScore,
  computeGrowthScore,
  classifyDimensionStatus,
  computeCompositeScore,
  classifyOverallHealth,
  identifyWeakestDimension,
  identifyStrongestDimension,
  computeScoreTrend,
  generateScorecardNarrative,
  buildDimensionScores,
} from '../lib/services/intelligence/financial-health-scorecard.service'
import type { DimensionScore } from '../lib/services/intelligence/financial-health-scorecard.service'

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeDimScore(
  dimension: string,
  score: number,
  weight = 0.2,
): DimensionScore {
  return {
    dimension,
    score,
    weight,
    weighted_score: Math.round(score * weight * 10) / 10,
    status: classifyDimensionStatus(score),
    key_metric: '—',
    key_metric_label: 'Test',
  }
}

// ── SCORECARD_WEIGHTS ──────────────────────────────────────────────────────────

describe('SCORECARD_WEIGHTS', () => {
  it('exports an object with 6 keys', () => {
    expect(Object.keys(SCORECARD_WEIGHTS)).toHaveLength(6)
  })

  it('weights sum to exactly 1.0', () => {
    const sum = Object.values(SCORECARD_WEIGHTS).reduce((a, b) => a + b, 0)
    expect(Math.round(sum * 100) / 100).toBe(1.0)
  })

  it('has correct individual weights', () => {
    expect(SCORECARD_WEIGHTS.liquidity).toBe(0.25)
    expect(SCORECARD_WEIGHTS.profitability).toBe(0.20)
    expect(SCORECARD_WEIGHTS.receivables).toBe(0.20)
    expect(SCORECARD_WEIGHTS.efficiency).toBe(0.15)
    expect(SCORECARD_WEIGHTS.debt_burden).toBe(0.10)
    expect(SCORECARD_WEIGHTS.growth).toBe(0.10)
  })
})

// ── computeLiquidityScore ──────────────────────────────────────────────────────

describe('computeLiquidityScore', () => {
  it('both null → 50 (25+25)', () => {
    expect(computeLiquidityScore(null, null)).toBe(50)
  })

  it('runway null, currentRatio null → 50', () => {
    expect(computeLiquidityScore(null, null)).toBe(50)
  })

  it('runway >=12 → 50pts; currentRatio >=2 → 50pts = 100', () => {
    expect(computeLiquidityScore(12, 2)).toBe(100)
  })

  it('runway exactly 12 → 50pts', () => {
    expect(computeLiquidityScore(12, null)).toBe(75)
  })

  it('runway >=6 <12 → 40pts', () => {
    expect(computeLiquidityScore(6, null)).toBe(65)
    expect(computeLiquidityScore(11, null)).toBe(65)
  })

  it('runway >=3 <6 → 30pts', () => {
    expect(computeLiquidityScore(3, null)).toBe(55)
    expect(computeLiquidityScore(5.9, null)).toBe(55)
  })

  it('runway >=1 <3 → 15pts', () => {
    expect(computeLiquidityScore(1, null)).toBe(40)
    expect(computeLiquidityScore(2.9, null)).toBe(40)
  })

  it('runway <1 → 0pts', () => {
    expect(computeLiquidityScore(0, null)).toBe(25)
    expect(computeLiquidityScore(0.9, null)).toBe(25)
  })

  it('currentRatio >=2 → 50pts', () => {
    expect(computeLiquidityScore(null, 2)).toBe(75)
    expect(computeLiquidityScore(null, 5)).toBe(75)
  })

  it('currentRatio >=1.5 <2 → 40pts', () => {
    expect(computeLiquidityScore(null, 1.5)).toBe(65)
    expect(computeLiquidityScore(null, 1.9)).toBe(65)
  })

  it('currentRatio >=1.0 <1.5 → 30pts', () => {
    expect(computeLiquidityScore(null, 1.0)).toBe(55)
    expect(computeLiquidityScore(null, 1.4)).toBe(55)
  })

  it('currentRatio >=0.5 <1.0 → 15pts', () => {
    expect(computeLiquidityScore(null, 0.5)).toBe(40)
    expect(computeLiquidityScore(null, 0.9)).toBe(40)
  })

  it('currentRatio <0.5 → 0pts', () => {
    expect(computeLiquidityScore(null, 0)).toBe(25)
    expect(computeLiquidityScore(null, 0.4)).toBe(25)
  })

  it('max score = 100', () => {
    expect(computeLiquidityScore(24, 3)).toBe(100)
  })

  it('min score = 0 (all nulls → 50; explicit zeros → 0+0=0)', () => {
    expect(computeLiquidityScore(0, 0)).toBe(0)
  })
})

// ── computeProfitabilityScore ─────────────────────────────────────────────────

describe('computeProfitabilityScore', () => {
  it('both null → 50 (30+20)', () => {
    expect(computeProfitabilityScore(null, null)).toBe(50)
  })

  it('grossMargin >=50 → 60pts', () => {
    expect(computeProfitabilityScore(50, null)).toBe(80)
    expect(computeProfitabilityScore(80, null)).toBe(80)
  })

  it('grossMargin >=35 <50 → 48pts', () => {
    expect(computeProfitabilityScore(35, null)).toBe(68)
    expect(computeProfitabilityScore(49, null)).toBe(68)
  })

  it('grossMargin >=20 <35 → 36pts', () => {
    expect(computeProfitabilityScore(20, null)).toBe(56)
  })

  it('grossMargin >=10 <20 → 20pts', () => {
    expect(computeProfitabilityScore(10, null)).toBe(40)
  })

  it('grossMargin <10 → 5pts', () => {
    expect(computeProfitabilityScore(0, null)).toBe(25)
    expect(computeProfitabilityScore(9, null)).toBe(25)
  })

  it('netMargin >=15 → 40pts', () => {
    expect(computeProfitabilityScore(null, 15)).toBe(70)
    expect(computeProfitabilityScore(null, 50)).toBe(70)
  })

  it('netMargin >=8 <15 → 32pts', () => {
    expect(computeProfitabilityScore(null, 8)).toBe(62)
    expect(computeProfitabilityScore(null, 14)).toBe(62)
  })

  it('netMargin >=3 <8 → 20pts', () => {
    expect(computeProfitabilityScore(null, 3)).toBe(50)
  })

  it('netMargin >=0 <3 → 10pts', () => {
    expect(computeProfitabilityScore(null, 0)).toBe(40)
    expect(computeProfitabilityScore(null, 2.9)).toBe(40)
  })

  it('netMargin <0 → 0pts', () => {
    expect(computeProfitabilityScore(null, -1)).toBe(30)
  })

  it('max: 60+40 = 100', () => {
    expect(computeProfitabilityScore(60, 20)).toBe(100)
  })

  it('min: 5+0 = 5', () => {
    expect(computeProfitabilityScore(5, -10)).toBe(5)
  })
})

// ── computeReceivablesScore ───────────────────────────────────────────────────

describe('computeReceivablesScore', () => {
  it('both null → 50 (30+20)', () => {
    expect(computeReceivablesScore(null, null)).toBe(50)
  })

  it('DSO <=30 → 60pts', () => {
    expect(computeReceivablesScore(30, null)).toBe(80)
    expect(computeReceivablesScore(1, null)).toBe(80)
  })

  it('DSO <=60 → 45pts', () => {
    expect(computeReceivablesScore(31, null)).toBe(65)
    expect(computeReceivablesScore(60, null)).toBe(65)
  })

  it('DSO <=90 → 30pts', () => {
    expect(computeReceivablesScore(61, null)).toBe(50)
    expect(computeReceivablesScore(90, null)).toBe(50)
  })

  it('DSO <=120 → 15pts', () => {
    expect(computeReceivablesScore(91, null)).toBe(35)
    expect(computeReceivablesScore(120, null)).toBe(35)
  })

  it('DSO >120 → 0pts', () => {
    expect(computeReceivablesScore(121, null)).toBe(20)
    expect(computeReceivablesScore(200, null)).toBe(20)
  })

  it('overdue <=5 → 40pts', () => {
    expect(computeReceivablesScore(null, 5)).toBe(70)
    expect(computeReceivablesScore(null, 0)).toBe(70)
  })

  it('overdue <=15 → 32pts', () => {
    expect(computeReceivablesScore(null, 6)).toBe(62)
    expect(computeReceivablesScore(null, 15)).toBe(62)
  })

  it('overdue <=30 → 20pts', () => {
    expect(computeReceivablesScore(null, 16)).toBe(50)
    expect(computeReceivablesScore(null, 30)).toBe(50)
  })

  it('overdue <=50 → 10pts', () => {
    expect(computeReceivablesScore(null, 31)).toBe(40)
    expect(computeReceivablesScore(null, 50)).toBe(40)
  })

  it('overdue >50 → 0pts', () => {
    expect(computeReceivablesScore(null, 51)).toBe(30)
    expect(computeReceivablesScore(null, 100)).toBe(30)
  })

  it('max: 60+40 = 100', () => {
    expect(computeReceivablesScore(0, 0)).toBe(100)
  })

  it('min: 0+0 = 0', () => {
    expect(computeReceivablesScore(200, 100)).toBe(0)
  })
})

// ── computeEfficiencyScore ────────────────────────────────────────────────────

describe('computeEfficiencyScore', () => {
  it('null → 50', () => {
    expect(computeEfficiencyScore(null)).toBe(50)
  })

  it('<=0 → 100', () => {
    expect(computeEfficiencyScore(0)).toBe(100)
    expect(computeEfficiencyScore(-10)).toBe(100)
  })

  it('<=15 → 85', () => {
    expect(computeEfficiencyScore(1)).toBe(85)
    expect(computeEfficiencyScore(15)).toBe(85)
  })

  it('<=30 → 70', () => {
    expect(computeEfficiencyScore(16)).toBe(70)
    expect(computeEfficiencyScore(30)).toBe(70)
  })

  it('<=60 → 50', () => {
    expect(computeEfficiencyScore(31)).toBe(50)
    expect(computeEfficiencyScore(60)).toBe(50)
  })

  it('<=90 → 30', () => {
    expect(computeEfficiencyScore(61)).toBe(30)
    expect(computeEfficiencyScore(90)).toBe(30)
  })

  it('>90 → 10', () => {
    expect(computeEfficiencyScore(91)).toBe(10)
    expect(computeEfficiencyScore(200)).toBe(10)
  })
})

// ── computeDebtBurdenScore ────────────────────────────────────────────────────

describe('computeDebtBurdenScore', () => {
  it('both null → 50 (30+20)', () => {
    expect(computeDebtBurdenScore(null, null)).toBe(50)
  })

  it('DSR <=0.1 → 60pts', () => {
    expect(computeDebtBurdenScore(0.1, null)).toBe(80)
    expect(computeDebtBurdenScore(0, null)).toBe(80)
  })

  it('DSR <=0.2 → 48pts', () => {
    expect(computeDebtBurdenScore(0.11, null)).toBe(68)
    expect(computeDebtBurdenScore(0.2, null)).toBe(68)
  })

  it('DSR <=0.3 → 36pts', () => {
    expect(computeDebtBurdenScore(0.21, null)).toBe(56)
    expect(computeDebtBurdenScore(0.3, null)).toBe(56)
  })

  it('DSR <=0.5 → 20pts', () => {
    expect(computeDebtBurdenScore(0.31, null)).toBe(40)
    expect(computeDebtBurdenScore(0.5, null)).toBe(40)
  })

  it('DSR >0.5 → 5pts', () => {
    expect(computeDebtBurdenScore(0.51, null)).toBe(25)
    expect(computeDebtBurdenScore(1.0, null)).toBe(25)
  })

  it('loanToRev <=50 → 40pts', () => {
    expect(computeDebtBurdenScore(null, 50)).toBe(70)
    expect(computeDebtBurdenScore(null, 0)).toBe(70)
  })

  it('loanToRev <=100 → 32pts', () => {
    expect(computeDebtBurdenScore(null, 51)).toBe(62)
    expect(computeDebtBurdenScore(null, 100)).toBe(62)
  })

  it('loanToRev <=200 → 20pts', () => {
    expect(computeDebtBurdenScore(null, 101)).toBe(50)
    expect(computeDebtBurdenScore(null, 200)).toBe(50)
  })

  it('loanToRev <=400 → 10pts', () => {
    expect(computeDebtBurdenScore(null, 201)).toBe(40)
    expect(computeDebtBurdenScore(null, 400)).toBe(40)
  })

  it('loanToRev >400 → 0pts', () => {
    expect(computeDebtBurdenScore(null, 401)).toBe(30)
    expect(computeDebtBurdenScore(null, 1000)).toBe(30)
  })

  it('max: 60+40 = 100', () => {
    expect(computeDebtBurdenScore(0, 0)).toBe(100)
  })

  it('min: 5+0 = 5', () => {
    expect(computeDebtBurdenScore(1.0, 500)).toBe(5)
  })
})

// ── computeGrowthScore ────────────────────────────────────────────────────────

describe('computeGrowthScore', () => {
  it('both null → 50 (25+25)', () => {
    expect(computeGrowthScore(null, null)).toBe(50)
  })

  it('MoM >=10 → 50pts', () => {
    expect(computeGrowthScore(10, null)).toBe(75)
    expect(computeGrowthScore(50, null)).toBe(75)
  })

  it('MoM >=5 <10 → 40pts', () => {
    expect(computeGrowthScore(5, null)).toBe(65)
    expect(computeGrowthScore(9.9, null)).toBe(65)
  })

  it('MoM >=0 <5 → 30pts', () => {
    expect(computeGrowthScore(0, null)).toBe(55)
    expect(computeGrowthScore(4.9, null)).toBe(55)
  })

  it('MoM >=-5 <0 → 15pts', () => {
    expect(computeGrowthScore(-5, null)).toBe(40)
    expect(computeGrowthScore(-0.1, null)).toBe(40)
  })

  it('MoM <-5 → 0pts', () => {
    expect(computeGrowthScore(-5.1, null)).toBe(25)
    expect(computeGrowthScore(-20, null)).toBe(25)
  })

  it('YoY >=30 → 50pts', () => {
    expect(computeGrowthScore(null, 30)).toBe(75)
    expect(computeGrowthScore(null, 100)).toBe(75)
  })

  it('YoY >=15 <30 → 40pts', () => {
    expect(computeGrowthScore(null, 15)).toBe(65)
    expect(computeGrowthScore(null, 29)).toBe(65)
  })

  it('YoY >=5 <15 → 30pts', () => {
    expect(computeGrowthScore(null, 5)).toBe(55)
    expect(computeGrowthScore(null, 14)).toBe(55)
  })

  it('YoY >=0 <5 → 15pts', () => {
    expect(computeGrowthScore(null, 0)).toBe(40)
    expect(computeGrowthScore(null, 4.9)).toBe(40)
  })

  it('YoY <0 → 0pts', () => {
    expect(computeGrowthScore(null, -1)).toBe(25)
    expect(computeGrowthScore(null, -50)).toBe(25)
  })

  it('max: 50+50 = 100', () => {
    expect(computeGrowthScore(20, 50)).toBe(100)
  })

  it('min: 0+0 = 0', () => {
    expect(computeGrowthScore(-10, -10)).toBe(0)
  })
})

// ── classifyDimensionStatus ───────────────────────────────────────────────────

describe('classifyDimensionStatus', () => {
  it('>=80 → excellent', () => {
    expect(classifyDimensionStatus(80)).toBe('excellent')
    expect(classifyDimensionStatus(100)).toBe('excellent')
  })

  it('>=65 <80 → good', () => {
    expect(classifyDimensionStatus(65)).toBe('good')
    expect(classifyDimensionStatus(79)).toBe('good')
  })

  it('>=45 <65 → fair', () => {
    expect(classifyDimensionStatus(45)).toBe('fair')
    expect(classifyDimensionStatus(64)).toBe('fair')
  })

  it('>=25 <45 → poor', () => {
    expect(classifyDimensionStatus(25)).toBe('poor')
    expect(classifyDimensionStatus(44)).toBe('poor')
  })

  it('<25 → critical', () => {
    expect(classifyDimensionStatus(24)).toBe('critical')
    expect(classifyDimensionStatus(0)).toBe('critical')
  })

  it('exact boundary 80', () => {
    expect(classifyDimensionStatus(80)).toBe('excellent')
    expect(classifyDimensionStatus(79.9)).toBe('good')
  })

  it('exact boundary 45', () => {
    expect(classifyDimensionStatus(45)).toBe('fair')
    expect(classifyDimensionStatus(44.9)).toBe('poor')
  })
})

// ── computeCompositeScore ─────────────────────────────────────────────────────

describe('computeCompositeScore', () => {
  it('empty array → 0', () => {
    expect(computeCompositeScore([])).toBe(0)
  })

  it('weighted sum math: 80*0.25 + 70*0.20 = 20+14 = 34', () => {
    const dims = [
      makeDimScore('liquidity', 80, 0.25),
      makeDimScore('profitability', 70, 0.20),
    ]
    // weighted_score for each is already computed in makeDimScore
    const sum = dims.reduce((s, d) => s + d.weighted_score, 0)
    expect(computeCompositeScore(dims)).toBe(Math.round(sum * 10) / 10)
  })

  it('single dimension: 75 * 0.25 = 18.75', () => {
    const dims = [makeDimScore('liquidity', 75, 0.25)]
    expect(computeCompositeScore(dims)).toBe(18.8)
  })

  it('rounds to 1 decimal', () => {
    const dims = [makeDimScore('x', 77.7, 0.333)]
    // 77.7 * 0.333 = 25.874... → weighted_score = Math.round(77.7*0.333*10)/10 = 25.9
    // composite = 25.9
    const result = computeCompositeScore(dims)
    expect(result.toString()).toMatch(/\.\d$/)
  })

  it('all 6 dims at 50 with correct weights → 50', () => {
    const dims = buildDimensionScores({
      liquidity:     { cashRunwayMonths: null, currentRatio: null },
      profitability: { grossMarginPct: null, netMarginPct: null },
      receivables:   { dsoDays: null, overdueRevenuePct: null },
      efficiency:    { cashConversionCycleDays: null },
      debt_burden:   { debtServiceRatio: null, partnerLoanToRevenuePct: null },
      growth:        { momRevGrowthPct: null, yoyRevGrowthPct: null },
    })
    // All nulls → each dimension gets 50
    const composite = computeCompositeScore(dims)
    expect(composite).toBe(50)
  })
})

// ── classifyOverallHealth ─────────────────────────────────────────────────────

describe('classifyOverallHealth', () => {
  it('>=80 → excellent', () => {
    expect(classifyOverallHealth(80)).toBe('excellent')
    expect(classifyOverallHealth(100)).toBe('excellent')
  })

  it('>=65 <80 → good', () => {
    expect(classifyOverallHealth(65)).toBe('good')
    expect(classifyOverallHealth(79)).toBe('good')
  })

  it('>=45 <65 → fair', () => {
    expect(classifyOverallHealth(45)).toBe('fair')
    expect(classifyOverallHealth(64)).toBe('fair')
  })

  it('>=25 <45 → poor', () => {
    expect(classifyOverallHealth(25)).toBe('poor')
    expect(classifyOverallHealth(44)).toBe('poor')
  })

  it('<25 → critical', () => {
    expect(classifyOverallHealth(24)).toBe('critical')
    expect(classifyOverallHealth(0)).toBe('critical')
  })
})

// ── identifyWeakestDimension ──────────────────────────────────────────────────

describe('identifyWeakestDimension', () => {
  it('empty array → null', () => {
    expect(identifyWeakestDimension([])).toBeNull()
  })

  it('single element → that element', () => {
    const dim = makeDimScore('liquidity', 55)
    expect(identifyWeakestDimension([dim])).toBe(dim)
  })

  it('returns dimension with lowest score', () => {
    const dims = [
      makeDimScore('liquidity', 80),
      makeDimScore('growth', 30),
      makeDimScore('profitability', 60),
    ]
    expect(identifyWeakestDimension(dims)?.dimension).toBe('growth')
  })

  it('with ties → picks first occurrence', () => {
    const dims = [
      makeDimScore('a', 40),
      makeDimScore('b', 40),
    ]
    expect(identifyWeakestDimension(dims)?.dimension).toBe('a')
  })
})

// ── identifyStrongestDimension ─────────────────────────────────────────────────

describe('identifyStrongestDimension', () => {
  it('empty array → null', () => {
    expect(identifyStrongestDimension([])).toBeNull()
  })

  it('single element → that element', () => {
    const dim = makeDimScore('efficiency', 70)
    expect(identifyStrongestDimension([dim])).toBe(dim)
  })

  it('returns dimension with highest score', () => {
    const dims = [
      makeDimScore('liquidity', 80),
      makeDimScore('growth', 30),
      makeDimScore('profitability', 95),
    ]
    expect(identifyStrongestDimension(dims)?.dimension).toBe('profitability')
  })

  it('with ties → picks first occurrence', () => {
    const dims = [
      makeDimScore('x', 90),
      makeDimScore('y', 90),
    ]
    expect(identifyStrongestDimension(dims)?.dimension).toBe('x')
  })
})

// ── computeScoreTrend ─────────────────────────────────────────────────────────

describe('computeScoreTrend', () => {
  it('prior null → insufficient_data', () => {
    expect(computeScoreTrend(75, null)).toBe('insufficient_data')
    expect(computeScoreTrend(0, null)).toBe('insufficient_data')
  })

  it('current - prior > 3 → improving', () => {
    expect(computeScoreTrend(80, 76)).toBe('improving')
    expect(computeScoreTrend(50, 30)).toBe('improving')
  })

  it('prior - current > 3 → declining', () => {
    expect(computeScoreTrend(70, 74)).toBe('declining')
    expect(computeScoreTrend(50, 80)).toBe('declining')
  })

  it('within ±3 → stable', () => {
    expect(computeScoreTrend(75, 75)).toBe('stable')
    expect(computeScoreTrend(75, 72)).toBe('stable')
    expect(computeScoreTrend(75, 78)).toBe('stable')
  })

  it('exactly +3 boundary → stable', () => {
    expect(computeScoreTrend(78, 75)).toBe('stable')
  })

  it('exactly -3 boundary → stable', () => {
    expect(computeScoreTrend(72, 75)).toBe('stable')
  })

  it('delta +3.1 → improving', () => {
    expect(computeScoreTrend(78.1, 75)).toBe('improving')
  })

  it('delta -3.1 → declining', () => {
    expect(computeScoreTrend(71.9, 75)).toBe('declining')
  })
})

// ── generateScorecardNarrative ────────────────────────────────────────────────

describe('generateScorecardNarrative', () => {
  const weakest = makeDimScore('growth', 20)
  // Override dimension name-lookup via the 'growth' key
  weakest.dimension = 'growth'

  it('excellent → Turkish excellent message', () => {
    const text = generateScorecardNarrative('excellent', 85, weakest, 'stable')
    expect(text).toContain('mükemmel')
  })

  it('good → mentions weakest dimension name', () => {
    const text = generateScorecardNarrative('good', 70, weakest, 'stable')
    expect(text).toContain('Büyüme')
    expect(text).toContain('iyileştirme')
  })

  it('fair → mentions weakest dimension as focus', () => {
    const text = generateScorecardNarrative('fair', 55, weakest, 'stable')
    expect(text).toContain('Büyüme')
    expect(text).toContain('odak')
  })

  it('poor → warning tone + weakest dimension', () => {
    const text = generateScorecardNarrative('poor', 35, weakest, 'stable')
    expect(text).toContain('Dikkat')
    expect(text).toContain('Büyüme')
  })

  it('critical → critical tone + weakest dimension', () => {
    const text = generateScorecardNarrative('critical', 15, weakest, 'stable')
    expect(text).toContain('Kritik')
    expect(text).toContain('Büyüme')
  })

  it('improving trend adds trend context', () => {
    const text = generateScorecardNarrative('good', 70, weakest, 'improving')
    expect(text).toContain('yükseliş')
  })

  it('declining trend adds decline note', () => {
    const text = generateScorecardNarrative('fair', 55, weakest, 'declining')
    expect(text).toContain('düşüş')
  })

  it('stable trend adds stable note', () => {
    const text = generateScorecardNarrative('good', 70, weakest, 'stable')
    expect(text).toContain('stabil')
  })

  it('insufficient_data trend → no trend note appended (short string)', () => {
    const textWithData    = generateScorecardNarrative('good', 70, weakest, 'stable')
    const textNoData      = generateScorecardNarrative('good', 70, weakest, 'insufficient_data')
    expect(textNoData.length).toBeLessThan(textWithData.length)
  })

  it('null weakest → no crash on excellent', () => {
    const text = generateScorecardNarrative('excellent', 90, null, 'stable')
    expect(text).toContain('mükemmel')
  })

  it('null weakest + poor → graceful fallback', () => {
    const text = generateScorecardNarrative('poor', 35, null, 'stable')
    expect(text).toContain('Dikkat')
  })

  it('returns a non-empty string for all health levels', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical'] as const
    for (const level of levels) {
      const text = generateScorecardNarrative(level, 50, weakest, 'stable')
      expect(text.length).toBeGreaterThan(0)
    }
  })
})

// ── buildDimensionScores ──────────────────────────────────────────────────────

describe('buildDimensionScores', () => {
  const allNullParams = {
    liquidity:     { cashRunwayMonths: null, currentRatio: null },
    profitability: { grossMarginPct: null, netMarginPct: null },
    receivables:   { dsoDays: null, overdueRevenuePct: null },
    efficiency:    { cashConversionCycleDays: null },
    debt_burden:   { debtServiceRatio: null, partnerLoanToRevenuePct: null },
    growth:        { momRevGrowthPct: null, yoyRevGrowthPct: null },
  }

  it('returns exactly 6 dimensions', () => {
    const dims = buildDimensionScores(allNullParams)
    expect(dims).toHaveLength(6)
  })

  it('all null inputs → each dimension score = 50', () => {
    const dims = buildDimensionScores(allNullParams)
    for (const d of dims) {
      expect(d.score).toBe(50)
    }
  })

  it('all null inputs → weights sum to 1.0', () => {
    const dims = buildDimensionScores(allNullParams)
    const sum  = dims.reduce((s, d) => s + d.weight, 0)
    expect(Math.round(sum * 100) / 100).toBe(1.0)
  })

  it('dimension ids are the 6 expected keys', () => {
    const dims    = buildDimensionScores(allNullParams)
    const dimKeys = dims.map(d => d.dimension).sort()
    expect(dimKeys).toEqual(
      ['debt_burden', 'efficiency', 'growth', 'liquidity', 'profitability', 'receivables'],
    )
  })

  it('weighted_score = score × weight (rounded to 1dp)', () => {
    const dims = buildDimensionScores(allNullParams)
    for (const d of dims) {
      const expected = Math.round(d.score * d.weight * 10) / 10
      expect(d.weighted_score).toBe(expected)
    }
  })

  it('good inputs produce correct dimension scores', () => {
    const dims = buildDimensionScores({
      liquidity:     { cashRunwayMonths: 12, currentRatio: 2.0 },
      profitability: { grossMarginPct: 50, netMarginPct: 15 },
      receivables:   { dsoDays: 30, overdueRevenuePct: 5 },
      efficiency:    { cashConversionCycleDays: 0 },
      debt_burden:   { debtServiceRatio: 0.1, partnerLoanToRevenuePct: 50 },
      growth:        { momRevGrowthPct: 10, yoyRevGrowthPct: 30 },
    })
    const liq = dims.find(d => d.dimension === 'liquidity')!
    expect(liq.score).toBe(100)

    const prof = dims.find(d => d.dimension === 'profitability')!
    expect(prof.score).toBe(100)

    const eff = dims.find(d => d.dimension === 'efficiency')!
    expect(eff.score).toBe(100)
  })

  it('key_metric is set (non-empty string)', () => {
    const dims = buildDimensionScores({
      ...allNullParams,
      liquidity: { cashRunwayMonths: 6, currentRatio: 1.5 },
    })
    const liq = dims.find(d => d.dimension === 'liquidity')!
    expect(liq.key_metric).not.toBe('')
    expect(liq.key_metric).toContain('ay')
  })

  it('key_metric_label is a Turkish label for each dimension', () => {
    const dims = buildDimensionScores(allNullParams)
    for (const d of dims) {
      expect(typeof d.key_metric_label).toBe('string')
      expect(d.key_metric_label.length).toBeGreaterThan(0)
    }
  })

  it('status is set for each dimension', () => {
    const dims = buildDimensionScores(allNullParams)
    const validStatuses = ['excellent', 'good', 'fair', 'poor', 'critical']
    for (const d of dims) {
      expect(validStatuses).toContain(d.status)
    }
  })
})
