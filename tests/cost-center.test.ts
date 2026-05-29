// ─────────────────────────────────────────────────────────────────────────────
// tests/cost-center.test.ts
//
// Unit tests for all pure functions in cost-center.service.ts:
//   - classifyExpenseBehavior           (7 tests)
//   - computeFixedCostRatio             (3 tests)
//   - computeVariableCostRatio          (3 tests)
//   - computeContributionMargin         (3 tests)
//   - computeContributionMarginRatio    (3 tests)
//   - computeBreakevenRevenue           (4 tests)
//   - computeMarginOfSafety             (5 tests)
//   - computeOperatingLeverageRatio     (4 tests)
//   - computeCostConcentrationIndex     (5 tests)
//   - classifyCostStructureHealth       (7 tests)
//   Total: 44 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  classifyExpenseBehavior,
  computeFixedCostRatio,
  computeVariableCostRatio,
  computeContributionMargin,
  computeContributionMarginRatio,
  computeBreakevenRevenue,
  computeMarginOfSafety,
  computeOperatingLeverageRatio,
  computeCostConcentrationIndex,
  classifyCostStructureHealth,
} from '../lib/services/finance/cost-center.service'

// ── classifyExpenseBehavior ───────────────────────────────────────────────────

describe('classifyExpenseBehavior', () => {
  it('rent → fixed', () => {
    expect(classifyExpenseBehavior('rent')).toBe('fixed')
  })

  it('kira (Turkish rent) → fixed', () => {
    expect(classifyExpenseBehavior('kira')).toBe('fixed')
  })

  it('salary → fixed', () => {
    expect(classifyExpenseBehavior('salary')).toBe('fixed')
  })

  it('logistics → variable', () => {
    expect(classifyExpenseBehavior('logistics')).toBe('variable')
  })

  it('komisyon (Turkish commission) → variable', () => {
    expect(classifyExpenseBehavior('komisyon')).toBe('variable')
  })

  it('marketing → semi_variable', () => {
    expect(classifyExpenseBehavior('marketing')).toBe('semi_variable')
  })

  it('unknown type → semi_variable (default)', () => {
    expect(classifyExpenseBehavior('unknown_expense_xyz')).toBe('semi_variable')
  })

  it('null → semi_variable', () => {
    expect(classifyExpenseBehavior(null)).toBe('semi_variable')
  })

  it('case-insensitive: RENT → fixed', () => {
    expect(classifyExpenseBehavior('RENT')).toBe('fixed')
  })

  it('case-insensitive: Logistics → variable', () => {
    expect(classifyExpenseBehavior('Logistics')).toBe('variable')
  })

  it('case-insensitive: MARKETING → semi_variable', () => {
    expect(classifyExpenseBehavior('MARKETING')).toBe('semi_variable')
  })
})

// ── computeFixedCostRatio ─────────────────────────────────────────────────────

describe('computeFixedCostRatio', () => {
  it('normal: 40_000 / 100_000 = 40%', () => {
    expect(computeFixedCostRatio(40_000, 100_000)).toBeCloseTo(40)
  })

  it('zero total → null', () => {
    expect(computeFixedCostRatio(10_000, 0)).toBeNull()
  })

  it('100% fixed: all costs are fixed', () => {
    expect(computeFixedCostRatio(80_000, 80_000)).toBeCloseTo(100)
  })
})

// ── computeVariableCostRatio ──────────────────────────────────────────────────

describe('computeVariableCostRatio', () => {
  it('normal: 30_000 / 150_000 = 20%', () => {
    expect(computeVariableCostRatio(30_000, 150_000)).toBeCloseTo(20)
  })

  it('zero revenue → null', () => {
    expect(computeVariableCostRatio(10_000, 0)).toBeNull()
  })

  it('zero variable costs → 0%', () => {
    expect(computeVariableCostRatio(0, 100_000)).toBeCloseTo(0)
  })
})

// ── computeContributionMargin ─────────────────────────────────────────────────

describe('computeContributionMargin', () => {
  it('profit case: 200_000 - 80_000 = 120_000', () => {
    expect(computeContributionMargin(200_000, 80_000)).toBe(120_000)
  })

  it('loss case: 50_000 - 70_000 = -20_000', () => {
    expect(computeContributionMargin(50_000, 70_000)).toBe(-20_000)
  })

  it('zero variable costs → CM equals revenue', () => {
    expect(computeContributionMargin(100_000, 0)).toBe(100_000)
  })
})

// ── computeContributionMarginRatio ────────────────────────────────────────────

describe('computeContributionMarginRatio', () => {
  it('normal: (200_000 - 80_000) / 200_000 × 100 = 60%', () => {
    expect(computeContributionMarginRatio(200_000, 80_000)).toBeCloseTo(60)
  })

  it('zero revenue → null', () => {
    expect(computeContributionMarginRatio(0, 50_000)).toBeNull()
  })

  it('variable costs equal revenue → 0%', () => {
    expect(computeContributionMarginRatio(100_000, 100_000)).toBeCloseTo(0)
  })
})

// ── computeBreakevenRevenue ───────────────────────────────────────────────────

describe('computeBreakevenRevenue', () => {
  it('normal: 60_000 / (60/100) = 100_000', () => {
    expect(computeBreakevenRevenue(60_000, 60)).toBeCloseTo(100_000)
  })

  it('null margin → null', () => {
    expect(computeBreakevenRevenue(60_000, null)).toBeNull()
  })

  it('zero margin → null', () => {
    expect(computeBreakevenRevenue(60_000, 0)).toBeNull()
  })

  it('fixed costs zero → 0', () => {
    expect(computeBreakevenRevenue(0, 50)).toBeCloseTo(0)
  })
})

// ── computeMarginOfSafety ─────────────────────────────────────────────────────

describe('computeMarginOfSafety', () => {
  it('above breakeven (positive): (150_000 - 100_000) / 150_000 × 100 = 33.33%', () => {
    expect(computeMarginOfSafety(150_000, 100_000)).toBeCloseTo(33.33, 1)
  })

  it('below breakeven (negative): (80_000 - 100_000) / 80_000 × 100 = -25%', () => {
    expect(computeMarginOfSafety(80_000, 100_000)).toBeCloseTo(-25)
  })

  it('zero actual revenue → null', () => {
    expect(computeMarginOfSafety(0, 100_000)).toBeNull()
  })

  it('null breakeven → null', () => {
    expect(computeMarginOfSafety(150_000, null)).toBeNull()
  })

  it('actual equals breakeven → 0%', () => {
    expect(computeMarginOfSafety(100_000, 100_000)).toBeCloseTo(0)
  })
})

// ── computeOperatingLeverageRatio ─────────────────────────────────────────────

describe('computeOperatingLeverageRatio', () => {
  it('normal: CM=120_000, EBIT=40_000 → DOL=3.0', () => {
    expect(computeOperatingLeverageRatio(120_000, 40_000)).toBeCloseTo(3.0)
  })

  it('zero EBIT → null', () => {
    expect(computeOperatingLeverageRatio(50_000, 0)).toBeNull()
  })

  it('negative EBIT (loss): CM=80_000, EBIT=-20_000 → DOL=-4.0', () => {
    expect(computeOperatingLeverageRatio(80_000, -20_000)).toBeCloseTo(-4.0)
  })

  it('CM equals EBIT → DOL=1.0 (no fixed costs)', () => {
    expect(computeOperatingLeverageRatio(50_000, 50_000)).toBeCloseTo(1.0)
  })
})

// ── computeCostConcentrationIndex ─────────────────────────────────────────────

describe('computeCostConcentrationIndex', () => {
  it('even 2-category split → HHI = 5000 (0.5² + 0.5² = 0.5, × 10000 = 5000)', () => {
    const cats = [
      { name: 'A', amount: 50_000 },
      { name: 'B', amount: 50_000 },
    ]
    // 0.5² + 0.5² = 0.5 → 0.5 × 10000 = 5000
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(5000)
  })

  it('monopoly (100% in one category) → HHI = 10000', () => {
    const cats = [{ name: 'rent', amount: 100_000 }]
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(10_000)
  })

  it('empty categories → 0', () => {
    expect(computeCostConcentrationIndex([])).toBe(0)
  })

  it('all zero amounts → 0', () => {
    const cats = [
      { name: 'A', amount: 0 },
      { name: 'B', amount: 0 },
    ]
    expect(computeCostConcentrationIndex(cats)).toBe(0)
  })

  it('4 equal categories → HHI = 2500 (4 × 0.25² × 10000)', () => {
    const cats = [
      { name: 'A', amount: 25_000 },
      { name: 'B', amount: 25_000 },
      { name: 'C', amount: 25_000 },
      { name: 'D', amount: 25_000 },
    ]
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(2500)
  })
})

// ── classifyCostStructureHealth ───────────────────────────────────────────────

describe('classifyCostStructureHealth', () => {
  it('both null → insufficient_data', () => {
    expect(classifyCostStructureHealth(null, null)).toBe('insufficient_data')
  })

  it('marginOfSafety = 0 → fragile (at breakeven)', () => {
    expect(classifyCostStructureHealth(60, 0)).toBe('fragile')
  })

  it('marginOfSafety < 0 → fragile (below breakeven)', () => {
    expect(classifyCostStructureHealth(50, -15)).toBe('fragile')
  })

  it('fixedRatio > 70 AND marginOfSafety < 20 → rigid', () => {
    expect(classifyCostStructureHealth(75, 10)).toBe('rigid')
  })

  it('fixedRatio < 40 AND marginOfSafety > 40 → flexible', () => {
    expect(classifyCostStructureHealth(30, 50)).toBe('flexible')
  })

  it('fixedRatio = 50, marginOfSafety = 25 → balanced', () => {
    expect(classifyCostStructureHealth(50, 25)).toBe('balanced')
  })

  it('null fixedRatio but positive marginOfSafety → balanced (not insufficient)', () => {
    expect(classifyCostStructureHealth(null, 30)).toBe('balanced')
  })

  it('fixedRatio present but marginOfSafety null — not fragile → balanced', () => {
    expect(classifyCostStructureHealth(60, null)).toBe('balanced')
  })

  it('fixedRatio exactly 70 — not > 70, cannot be rigid even with low margin', () => {
    expect(classifyCostStructureHealth(70, 10)).toBe('balanced')
  })

  it('fixedRatio = 71, marginOfSafety = 19 → rigid (both thresholds met)', () => {
    expect(classifyCostStructureHealth(71, 19)).toBe('rigid')
  })

  it('fixedRatio = 39, marginOfSafety = 41 → flexible (both thresholds met)', () => {
    expect(classifyCostStructureHealth(39, 41)).toBe('flexible')
  })

  it('fixedRatio = 40, marginOfSafety = 50 — not < 40, cannot be flexible', () => {
    expect(classifyCostStructureHealth(40, 50)).toBe('balanced')
  })

  it('marginOfSafety = 0 → fragile (boundary — exactly 0 means at breakeven)', () => {
    expect(classifyCostStructureHealth(20, 0)).toBe('fragile')
  })

  it('marginOfSafety = 1 (above breakeven) with low fixed ratio → flexible', () => {
    // marginOfSafety = 1 > 0 so not fragile, but not > 40 so not flexible by that rule
    expect(classifyCostStructureHealth(30, 1)).toBe('balanced')
  })
})

// ── classifyExpenseBehavior — extended coverage ───────────────────────────────

describe('classifyExpenseBehavior — all mapped values', () => {

  it('software → fixed', () => {
    expect(classifyExpenseBehavior('software')).toBe('fixed')
  })

  it('yazılım (Turkish software) → fixed', () => {
    expect(classifyExpenseBehavior('yazılım')).toBe('fixed')
  })

  it('insurance → fixed', () => {
    expect(classifyExpenseBehavior('insurance')).toBe('fixed')
  })

  it('sigorta (Turkish insurance) → fixed', () => {
    expect(classifyExpenseBehavior('sigorta')).toBe('fixed')
  })

  it('depreciation → fixed', () => {
    expect(classifyExpenseBehavior('depreciation')).toBe('fixed')
  })

  it('amortisman (Turkish depreciation) → fixed', () => {
    expect(classifyExpenseBehavior('amortisman')).toBe('fixed')
  })

  it('maaş (Turkish salary) → fixed', () => {
    expect(classifyExpenseBehavior('maaş')).toBe('fixed')
  })

  it('cogs → variable', () => {
    expect(classifyExpenseBehavior('cogs')).toBe('variable')
  })

  it('shipping → variable', () => {
    expect(classifyExpenseBehavior('shipping')).toBe('variable')
  })

  it('kargo (Turkish shipping) → variable', () => {
    expect(classifyExpenseBehavior('kargo')).toBe('variable')
  })

  it('commission → variable', () => {
    expect(classifyExpenseBehavior('commission')).toBe('variable')
  })

  it('lojistik (Turkish logistics) → variable', () => {
    expect(classifyExpenseBehavior('lojistik')).toBe('variable')
  })

  it('utilities → semi_variable', () => {
    expect(classifyExpenseBehavior('utilities')).toBe('semi_variable')
  })

  it('elektrik (Turkish utilities) → semi_variable', () => {
    expect(classifyExpenseBehavior('elektrik')).toBe('semi_variable')
  })

  it('pazarlama (Turkish marketing) → semi_variable', () => {
    expect(classifyExpenseBehavior('pazarlama')).toBe('semi_variable')
  })

  it('maintenance → semi_variable', () => {
    expect(classifyExpenseBehavior('maintenance')).toBe('semi_variable')
  })

  it('bakim (Turkish maintenance) → semi_variable', () => {
    expect(classifyExpenseBehavior('bakim')).toBe('semi_variable')
  })

  it('empty string → semi_variable', () => {
    expect(classifyExpenseBehavior('')).toBe('semi_variable')
  })

  it('whitespace only → semi_variable', () => {
    expect(classifyExpenseBehavior('   ')).toBe('semi_variable')
  })
})

// ── computeFixedCostRatio — extended ─────────────────────────────────────────

describe('computeFixedCostRatio — extended', () => {

  it('50% split', () => {
    expect(computeFixedCostRatio(50_000, 100_000)).toBeCloseTo(50)
  })

  it('very small ratio: 1 / 10000 = 0.01%', () => {
    expect(computeFixedCostRatio(1, 10000)).toBeCloseTo(0.01)
  })

  it('fixed costs exceed total (edge): ratio > 100', () => {
    // This can happen with rounding errors — should still compute
    expect(computeFixedCostRatio(110_000, 100_000)).toBeCloseTo(110)
  })

  it('0 fixed, non-zero total → 0%', () => {
    expect(computeFixedCostRatio(0, 100_000)).toBeCloseTo(0)
  })
})

// ── computeVariableCostRatio — extended ───────────────────────────────────────

describe('computeVariableCostRatio — extended', () => {

  it('50% of revenue is variable', () => {
    expect(computeVariableCostRatio(50_000, 100_000)).toBeCloseTo(50)
  })

  it('exceeds 100%: variable > revenue', () => {
    expect(computeVariableCostRatio(150_000, 100_000)).toBeCloseTo(150)
  })

  it('very small ratio', () => {
    expect(computeVariableCostRatio(100, 1_000_000)).toBeCloseTo(0.01)
  })
})

// ── computeContributionMargin — extended ──────────────────────────────────────

describe('computeContributionMargin — extended', () => {

  it('both zero → 0', () => {
    expect(computeContributionMargin(0, 0)).toBe(0)
  })

  it('negative revenue: -50_000 - 20_000 = -70_000', () => {
    expect(computeContributionMargin(-50_000, 20_000)).toBe(-70_000)
  })

  it('large numbers: 10M - 3M = 7M', () => {
    expect(computeContributionMargin(10_000_000, 3_000_000)).toBe(7_000_000)
  })
})

// ── computeContributionMarginRatio — extended ─────────────────────────────────

describe('computeContributionMarginRatio — extended', () => {

  it('100% margin: all revenue, no variable cost', () => {
    expect(computeContributionMarginRatio(100_000, 0)).toBeCloseTo(100)
  })

  it('negative margin: revenue < variable costs', () => {
    expect(computeContributionMarginRatio(80_000, 100_000)).toBeCloseTo(-25)
  })

  it('33.33% margin: standard case', () => {
    expect(computeContributionMarginRatio(150_000, 100_000)).toBeCloseTo(33.33, 1)
  })
})

// ── computeBreakevenRevenue — extended ───────────────────────────────────────

describe('computeBreakevenRevenue — extended', () => {

  it('50% CMR: breakeven = 2 × fixed costs', () => {
    expect(computeBreakevenRevenue(50_000, 50)).toBeCloseTo(100_000)
  })

  it('25% CMR: breakeven = 4 × fixed costs', () => {
    expect(computeBreakevenRevenue(25_000, 25)).toBeCloseTo(100_000)
  })

  it('100% CMR: breakeven = fixed costs themselves', () => {
    expect(computeBreakevenRevenue(100_000, 100)).toBeCloseTo(100_000)
  })

  it('negative CMR → returns negative breakeven (no null guard for negative)', () => {
    // -10% CMR → 50000 / (-0.10) = -500000 (computed, not null)
    expect(computeBreakevenRevenue(50_000, -10)).toBeCloseTo(-500_000)
  })
})

// ── computeMarginOfSafety — extended ─────────────────────────────────────────

describe('computeMarginOfSafety — extended', () => {

  it('large safety: 500_000 actual, 100_000 breakeven → 80%', () => {
    expect(computeMarginOfSafety(500_000, 100_000)).toBeCloseTo(80)
  })

  it('tiny safety: 101_000 actual, 100_000 breakeven → ~0.99%', () => {
    expect(computeMarginOfSafety(101_000, 100_000)).toBeCloseTo(0.99, 1)
  })

  it('breakeven = 0 with positive revenue → 100%', () => {
    expect(computeMarginOfSafety(100_000, 0)).toBeCloseTo(100)
  })
})

// ── computeOperatingLeverageRatio — extended ──────────────────────────────────

describe('computeOperatingLeverageRatio — extended', () => {

  it('CM = 2 × EBIT → DOL = 2.0', () => {
    expect(computeOperatingLeverageRatio(200_000, 100_000)).toBeCloseTo(2.0)
  })

  it('zero CM and nonzero EBIT → DOL = 0', () => {
    expect(computeOperatingLeverageRatio(0, 100_000)).toBeCloseTo(0)
  })

  it('both negative → positive ratio (double negative)', () => {
    const result = computeOperatingLeverageRatio(-100_000, -50_000)
    expect(result).toBeCloseTo(2.0)
  })
})

// ── computeCostConcentrationIndex — extended ──────────────────────────────────

describe('computeCostConcentrationIndex — extended', () => {

  it('3 equal categories → HHI = 3333.33', () => {
    const cats = [
      { name: 'A', amount: 100 },
      { name: 'B', amount: 100 },
      { name: 'C', amount: 100 },
    ]
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(10000 / 3, 0)
  })

  it('80/20 split: one dominates → HHI > 5000', () => {
    const cats = [
      { name: 'A', amount: 80_000 },
      { name: 'B', amount: 20_000 },
    ]
    // 0.8² + 0.2² = 0.64 + 0.04 = 0.68 → 6800
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(6800)
  })

  it('5 equal categories → HHI = 2000', () => {
    const cats = Array.from({ length: 5 }, (_, i) => ({ name: `Cat${i}`, amount: 1000 }))
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(2000)
  })

  it('10 equal categories → HHI = 1000 (diversified)', () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({ name: `Cat${i}`, amount: 1000 }))
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(1000)
  })

  it('one category at 0, one at 100% → HHI = 10000', () => {
    const cats = [
      { name: 'A', amount: 0 },
      { name: 'B', amount: 100_000 },
    ]
    expect(computeCostConcentrationIndex(cats)).toBeCloseTo(10000)
  })
})
