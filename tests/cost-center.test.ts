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
})
