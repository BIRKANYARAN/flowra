// tests/budget-tracker.test.ts
// Unit tests for lib/services/planning/budget-tracker.service.ts pure functions

import { describe, it, expect } from 'vitest'
import {
  computeBudgetVariance,
  computeBudgetVariancePct,
  classifyBudgetAdherence,
  computeBudgetHealthScore,
  computeBudgetPacing,
} from '@/lib/services/planning/budget-tracker.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetVariance
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetVariance', () => {
  it('returns positive variance when actual > budget', () => {
    expect(computeBudgetVariance(120_000, 100_000)).toBe(20_000)
  })

  it('returns negative variance when actual < budget', () => {
    expect(computeBudgetVariance(80_000, 100_000)).toBe(-20_000)
  })

  it('returns zero when actual equals budget', () => {
    expect(computeBudgetVariance(100_000, 100_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetVariancePct
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetVariancePct', () => {
  it('computes positive variance percent correctly', () => {
    // (120 - 100) / 100 × 100 = 20%
    expect(computeBudgetVariancePct(120_000, 100_000)).toBeCloseTo(20, 1)
  })

  it('computes negative variance percent correctly', () => {
    // (80 - 100) / 100 × 100 = -20%
    expect(computeBudgetVariancePct(80_000, 100_000)).toBeCloseTo(-20, 1)
  })

  it('returns null when budget is zero', () => {
    expect(computeBudgetVariancePct(50_000, 0)).toBeNull()
  })

  it('returns 0 when actual equals budget', () => {
    expect(computeBudgetVariancePct(100_000, 100_000)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyBudgetAdherence
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyBudgetAdherence', () => {
  it('returns no_budget when variancePct is null', () => {
    expect(classifyBudgetAdherence(null, 'revenue')).toBe('no_budget')
    expect(classifyBudgetAdherence(null, 'expense')).toBe('no_budget')
  })

  it('returns on_target when |variance| <= 5% for revenue', () => {
    expect(classifyBudgetAdherence(3, 'revenue')).toBe('on_target')
    expect(classifyBudgetAdherence(-4, 'revenue')).toBe('on_target')
    expect(classifyBudgetAdherence(0, 'revenue')).toBe('on_target')
  })

  it('returns on_target when |variance| <= 5% for expense', () => {
    expect(classifyBudgetAdherence(5, 'expense')).toBe('on_target')
    expect(classifyBudgetAdherence(-5, 'expense')).toBe('on_target')
  })

  // Revenue: positive = favorable
  it('returns favorable when revenue is 5-15% over budget', () => {
    expect(classifyBudgetAdherence(8, 'revenue')).toBe('favorable')
    expect(classifyBudgetAdherence(15, 'revenue')).toBe('favorable')
  })

  it('returns strongly_favorable when revenue is >15% over budget', () => {
    expect(classifyBudgetAdherence(20, 'revenue')).toBe('strongly_favorable')
    expect(classifyBudgetAdherence(50, 'revenue')).toBe('strongly_favorable')
  })

  it('returns at_risk when revenue is 5-15% under budget', () => {
    expect(classifyBudgetAdherence(-8, 'revenue')).toBe('at_risk')
    expect(classifyBudgetAdherence(-15, 'revenue')).toBe('at_risk')
  })

  it('returns off_track when revenue is >15% under budget', () => {
    expect(classifyBudgetAdherence(-20, 'revenue')).toBe('off_track')
    expect(classifyBudgetAdherence(-100, 'revenue')).toBe('off_track')
  })

  // Expense: negative = favorable (under budget)
  it('returns favorable when expense is 5-15% under budget', () => {
    expect(classifyBudgetAdherence(-8, 'expense')).toBe('favorable')
    expect(classifyBudgetAdherence(-15, 'expense')).toBe('favorable')
  })

  it('returns strongly_favorable when expense is >15% under budget', () => {
    expect(classifyBudgetAdherence(-20, 'expense')).toBe('strongly_favorable')
  })

  it('returns at_risk when expense is 5-15% over budget', () => {
    expect(classifyBudgetAdherence(8, 'expense')).toBe('at_risk')
    expect(classifyBudgetAdherence(15, 'expense')).toBe('at_risk')
  })

  it('returns off_track when expense is >15% over budget', () => {
    expect(classifyBudgetAdherence(20, 'expense')).toBe('off_track')
  })

  // Boundary: exactly 5% — on_target
  it('boundary: exactly 5% variance is on_target', () => {
    expect(classifyBudgetAdherence(5, 'revenue')).toBe('on_target')
    expect(classifyBudgetAdherence(-5, 'expense')).toBe('on_target')
  })

  // Boundary: exactly 15% — favorable / at_risk
  it('boundary: exactly 15% variance is favorable or at_risk', () => {
    expect(classifyBudgetAdherence(15, 'revenue')).toBe('favorable')
    expect(classifyBudgetAdherence(-15, 'revenue')).toBe('at_risk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetHealthScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetHealthScore', () => {
  it('returns 100 for empty array (no items)', () => {
    expect(computeBudgetHealthScore([])).toBe(100)
  })

  it('deducts 20 per off_track item', () => {
    expect(computeBudgetHealthScore(['off_track', 'off_track'])).toBe(60)
  })

  it('deducts 10 per at_risk item', () => {
    expect(computeBudgetHealthScore(['at_risk', 'at_risk', 'at_risk'])).toBe(70)
  })

  it('adds 5 bonus per strongly_favorable item (clamped to 100)', () => {
    // 100 + 5 = 105, clamped to 100
    expect(computeBudgetHealthScore(['strongly_favorable'])).toBe(100)
    expect(computeBudgetHealthScore(['strongly_favorable', 'strongly_favorable'])).toBe(100)
  })

  it('bonus applies meaningfully when score was already reduced', () => {
    // 100 - 10 (at_risk) + 5 (strongly_favorable) = 95
    expect(computeBudgetHealthScore(['at_risk', 'strongly_favorable'])).toBe(95)
  })

  it('clamps to 0 when many off_track items', () => {
    const items = Array<'off_track'>(10).fill('off_track')
    expect(computeBudgetHealthScore(items)).toBe(0)
  })

  it('computes mixed scenario correctly', () => {
    // 100 - 20 (off_track) - 10 (at_risk) + 5 (strongly_favorable) = 75
    expect(computeBudgetHealthScore(['off_track', 'at_risk', 'strongly_favorable'])).toBe(75)
  })

  it('on_target and favorable items do not change score', () => {
    expect(computeBudgetHealthScore(['on_target', 'favorable', 'on_target'])).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetPacing
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetPacing', () => {
  it('computes pacing correctly for normal case', () => {
    // 60_000 actual YTD / (10_000 budget × 6 months) × 100 = 100%
    expect(computeBudgetPacing(60_000, 10_000, 6)).toBeCloseTo(100, 1)
  })

  it('returns less than 100 when behind pace', () => {
    // 40_000 / (10_000 × 6) = 66.67%
    const result = computeBudgetPacing(40_000, 10_000, 6)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(66.67, 1)
  })

  it('returns more than 100 when ahead of pace', () => {
    // 80_000 / (10_000 × 6) = 133.33%
    const result = computeBudgetPacing(80_000, 10_000, 6)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(133.33, 1)
  })

  it('returns null when months elapsed is zero', () => {
    expect(computeBudgetPacing(50_000, 10_000, 0)).toBeNull()
  })

  it('returns null when monthly budget is zero', () => {
    expect(computeBudgetPacing(50_000, 0, 6)).toBeNull()
  })

  it('returns null when both budget and months are zero', () => {
    expect(computeBudgetPacing(0, 0, 0)).toBeNull()
  })

  it('returns 100 for perfect pacing (actual = expected)', () => {
    expect(computeBudgetPacing(30_000, 10_000, 3)).toBeCloseTo(100, 1)
  })
})
