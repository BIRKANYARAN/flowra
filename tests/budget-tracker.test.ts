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

  it('handles zero actual — variance is negative budget', () => {
    expect(computeBudgetVariance(0, 50_000)).toBe(-50_000)
  })

  it('handles zero budget — variance equals actual', () => {
    expect(computeBudgetVariance(30_000, 0)).toBe(30_000)
  })

  it('handles both zero — returns zero', () => {
    expect(computeBudgetVariance(0, 0)).toBe(0)
  })

  it('handles large values without precision loss', () => {
    expect(computeBudgetVariance(10_000_000, 9_500_000)).toBe(500_000)
  })

  it('handles negative actual (write-off scenario)', () => {
    expect(computeBudgetVariance(-5_000, 10_000)).toBe(-15_000)
  })

  it('rounds to 2 decimal places', () => {
    // 1000.005 - 0 = 1000.01 after round2
    const result = computeBudgetVariance(1000.005, 0)
    expect(result).toBeCloseTo(1000.01, 2)
  })

  it('small fractional values are computed correctly', () => {
    expect(computeBudgetVariance(100.25, 99.75)).toBeCloseTo(0.5, 2)
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

  it('handles 100% over budget (actual = 2× budget)', () => {
    expect(computeBudgetVariancePct(200_000, 100_000)).toBeCloseTo(100, 1)
  })

  it('handles 100% under budget (actual = 0)', () => {
    expect(computeBudgetVariancePct(0, 100_000)).toBeCloseTo(-100, 1)
  })

  it('handles small budget amounts — no division errors', () => {
    expect(computeBudgetVariancePct(110, 100)).toBeCloseTo(10, 1)
  })

  it('returns null when both actual and budget are zero', () => {
    expect(computeBudgetVariancePct(0, 0)).toBeNull()
  })

  it('computes fractional percentage correctly', () => {
    // (105 - 100) / 100 = 5%
    expect(computeBudgetVariancePct(105_000, 100_000)).toBeCloseTo(5, 2)
  })

  it('handles negative budget (unusual but possible)', () => {
    // (-50 - (-100)) / |-100| = 50/100 = 50%
    const result = computeBudgetVariancePct(-50_000, -100_000)
    expect(result).not.toBeNull()
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

  it('boundary: 5.01% revenue variance is favorable (just over threshold)', () => {
    expect(classifyBudgetAdherence(5.01, 'revenue')).toBe('favorable')
  })

  it('boundary: 15.01% revenue variance is strongly_favorable (just over threshold)', () => {
    expect(classifyBudgetAdherence(15.01, 'revenue')).toBe('strongly_favorable')
  })

  it('boundary: -5.01% revenue variance is at_risk (just over threshold)', () => {
    expect(classifyBudgetAdherence(-5.01, 'revenue')).toBe('at_risk')
  })

  it('boundary: -15.01% revenue variance is off_track (just over threshold)', () => {
    expect(classifyBudgetAdherence(-15.01, 'revenue')).toBe('off_track')
  })

  it('extreme positive expense variance (200%) is off_track', () => {
    expect(classifyBudgetAdherence(200, 'expense')).toBe('off_track')
  })

  it('extreme negative revenue variance (-200%) is off_track', () => {
    expect(classifyBudgetAdherence(-200, 'revenue')).toBe('off_track')
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

  it('no_budget items do not affect score', () => {
    expect(computeBudgetHealthScore(['no_budget', 'no_budget', 'no_budget'])).toBe(100)
  })

  it('single off_track item deducts 20, resulting in 80', () => {
    expect(computeBudgetHealthScore(['off_track'])).toBe(80)
  })

  it('single at_risk item deducts 10, resulting in 90', () => {
    expect(computeBudgetHealthScore(['at_risk'])).toBe(90)
  })

  it('5 off_track items result in 0 (100 - 5×20 = 0)', () => {
    const items = Array<'off_track'>(5).fill('off_track')
    expect(computeBudgetHealthScore(items)).toBe(0)
  })

  it('strongly_favorable bonus can partially restore score after deductions', () => {
    // 100 - 20 - 20 + 5 + 5 = 70
    expect(computeBudgetHealthScore(['off_track', 'off_track', 'strongly_favorable', 'strongly_favorable'])).toBe(70)
  })

  it('mixed list of all adherence types computes correctly', () => {
    // on_target=0, favorable=0, strongly_favorable=+5, at_risk=-10, off_track=-20, no_budget=0
    // 100 + 5 - 10 - 20 = 75
    expect(computeBudgetHealthScore(['on_target', 'favorable', 'strongly_favorable', 'at_risk', 'off_track', 'no_budget'])).toBe(75)
  })

  it('large number of at_risk items clamps to 0', () => {
    const items = Array<'at_risk'>(15).fill('at_risk')
    expect(computeBudgetHealthScore(items)).toBe(0)
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

  it('handles zero actual YTD — returns 0 pacing', () => {
    const result = computeBudgetPacing(0, 10_000, 6)
    expect(result).toBeCloseTo(0, 1)
  })

  it('handles single month elapsed correctly', () => {
    // 12_000 / (10_000 × 1) = 120%
    expect(computeBudgetPacing(12_000, 10_000, 1)).toBeCloseTo(120, 1)
  })

  it('handles 12 months elapsed (full year)', () => {
    // 120_000 / (10_000 × 12) = 100%
    expect(computeBudgetPacing(120_000, 10_000, 12)).toBeCloseTo(100, 1)
  })

  it('handles fractional results correctly (rounds to 2 decimals)', () => {
    // 100_000 / (30_000 × 3) = 111.11...%
    const result = computeBudgetPacing(100_000, 30_000, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(111.11, 1)
  })

  it('very high actual YTD produces >100 pacing', () => {
    const result = computeBudgetPacing(500_000, 10_000, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(100)
  })
})
