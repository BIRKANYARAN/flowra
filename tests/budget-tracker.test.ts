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

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetVariance — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetVariance — additional boundary tests', () => {
  it('negative actual and negative budget', () => {
    // actual=-100, budget=-50 → variance = -50
    expect(computeBudgetVariance(-100, -50)).toBeCloseTo(-50, 2)
  })

  it('returns exactly 0 for very small equal floats', () => {
    expect(computeBudgetVariance(100.01, 100.01)).toBeCloseTo(0, 2)
  })

  it('handles very large numbers without overflow', () => {
    const result = computeBudgetVariance(1e15, 1e15 - 1)
    expect(result).toBeCloseTo(1, 0)
  })

  it('result is always a number (not NaN or Infinity)', () => {
    const result = computeBudgetVariance(100_000, 50_000)
    expect(isFinite(result)).toBe(true)
    expect(isNaN(result)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetVariancePct — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetVariancePct — additional boundary tests', () => {
  it('1 actual vs 100 budget → -99%', () => {
    expect(computeBudgetVariancePct(1, 100)).toBeCloseTo(-99, 1)
  })

  it('200 actual vs 100 budget → 100%', () => {
    expect(computeBudgetVariancePct(200, 100)).toBeCloseTo(100, 1)
  })

  it('999 actual vs 1000 budget → -0.1%', () => {
    expect(computeBudgetVariancePct(999, 1000)).toBeCloseTo(-0.1, 1)
  })

  it('result is rounded to 2 decimal places', () => {
    const result = computeBudgetVariancePct(333, 1000)
    // 333/1000 = -66.7%
    const dp = String(Math.abs(result ?? 0)).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })

  it('negative actual and positive budget → large negative percent', () => {
    const result = computeBudgetVariancePct(-50_000, 100_000)
    expect(result).toBeCloseTo(-150, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyBudgetAdherence — additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyBudgetAdherence — additional edge cases', () => {
  it('0% variance → on_target for both metric types', () => {
    expect(classifyBudgetAdherence(0, 'revenue')).toBe('on_target')
    expect(classifyBudgetAdherence(0, 'expense')).toBe('on_target')
  })

  it('large positive expense variance (>15%) → off_track', () => {
    expect(classifyBudgetAdherence(50, 'expense')).toBe('off_track')
  })

  it('large negative revenue variance (<-15%) → off_track', () => {
    expect(classifyBudgetAdherence(-50, 'revenue')).toBe('off_track')
  })

  it('large positive revenue variance (>15%) → strongly_favorable', () => {
    expect(classifyBudgetAdherence(100, 'revenue')).toBe('strongly_favorable')
  })

  it('large negative expense variance (<-15%) → strongly_favorable', () => {
    expect(classifyBudgetAdherence(-100, 'expense')).toBe('strongly_favorable')
  })

  it('returns no_budget regardless of metricType when variancePct is null', () => {
    expect(classifyBudgetAdherence(null, 'revenue')).toBe('no_budget')
    expect(classifyBudgetAdherence(null, 'expense')).toBe('no_budget')
  })

  it('always returns one of the six valid adherence values', () => {
    const validAdherences = ['on_target', 'favorable', 'strongly_favorable', 'at_risk', 'off_track', 'no_budget']
    const variances = [null, -50, -15, -5, 0, 5, 15, 50]
    const types = ['revenue', 'expense'] as const
    for (const v of variances) {
      for (const t of types) {
        expect(validAdherences).toContain(classifyBudgetAdherence(v, t))
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetHealthScore — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetHealthScore — additional boundary tests', () => {
  it('single strongly_favorable item: 100 + 5 = clamped to 100', () => {
    expect(computeBudgetHealthScore(['strongly_favorable'])).toBe(100)
  })

  it('ten strongly_favorable items still clamps to 100', () => {
    const items = Array<'strongly_favorable'>(10).fill('strongly_favorable')
    expect(computeBudgetHealthScore(items)).toBe(100)
  })

  it('one off_track + one strongly_favorable: 100 - 20 + 5 = 85', () => {
    expect(computeBudgetHealthScore(['off_track', 'strongly_favorable'])).toBe(85)
  })

  it('twenty at_risk items: 100 - 20*10 = 0 clamped', () => {
    const items = Array<'at_risk'>(20).fill('at_risk')
    expect(computeBudgetHealthScore(items)).toBe(0)
  })

  it('mixed: all six types of adherence', () => {
    // on_target=0, favorable=0, strongly_favorable=+5, at_risk=-10, off_track=-20, no_budget=0
    // Score = 100 + 5 - 10 - 20 = 75
    expect(computeBudgetHealthScore([
      'on_target', 'favorable', 'strongly_favorable',
      'at_risk', 'off_track', 'no_budget',
    ])).toBe(75)
  })

  it('score is always an integer', () => {
    const items: Array<'on_target' | 'at_risk'> = ['on_target', 'at_risk']
    expect(Number.isInteger(computeBudgetHealthScore(items))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBudgetPacing — additional boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBudgetPacing — additional boundary tests', () => {
  it('very behind pace: actual=0, budget=10k, months=12 → 0%', () => {
    const result = computeBudgetPacing(0, 10_000, 12)
    expect(result).toBeCloseTo(0, 1)
  })

  it('very ahead of pace: actual=3M, budget=10k, months=1 → very large %', () => {
    const result = computeBudgetPacing(3_000_000, 10_000, 1)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(30_000, 0)
  })

  it('pacing rounds to 2 decimal places', () => {
    const result = computeBudgetPacing(1_000_000, 300_000, 3)
    // 1M / (300k * 3) = 1M / 900k ≈ 111.11%
    const dp = String(result).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })

  it('negative actual YTD results in negative pacing percentage', () => {
    const result = computeBudgetPacing(-50_000, 100_000, 3)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('returns null when only months is 0', () => {
    expect(computeBudgetPacing(100_000, 50_000, 0)).toBeNull()
  })

  it('returns null when only monthly budget is 0', () => {
    expect(computeBudgetPacing(100_000, 0, 6)).toBeNull()
  })

  it('pacing at exactly 50% pace', () => {
    // actual = 30k, budget = 10k/month, elapsed = 6 months → expected = 60k → pacing = 50%
    const result = computeBudgetPacing(30_000, 10_000, 6)
    expect(result).toBeCloseTo(50, 1)
  })
})
