/**
 * FIFO Audit Service — pure-function tests.
 *
 * Scope (no DB — all pure function inputs):
 *   • isOverConsumed()          — over/equal/under
 *   • computeConsumedPct()      — 100 cap, normal, zero qty
 *   • computeCostDrift()        — positive drift, negative drift, zero entry cost (null), no drift
 *   • classifyLotHealth()       — all 4 cases; priority order (over_consumed > cost_drift)
 *   • computeIntegrityScore()   — 100 for clean, deductions, floor at 0
 *   • scoreToGrade()            — all 5 grade boundaries
 *
 * Run with:  npx vitest run tests/fifo-audit.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isOverConsumed,
  computeConsumedPct,
  computeCostDrift,
  classifyLotHealth,
  computeIntegrityScore,
  scoreToGrade,
} from '../lib/services/inventory/fifo-audit.service'

// ── isOverConsumed ────────────────────────────────────────────────────────────

describe('isOverConsumed', () => {
  it('returns true when allocated > available', () => {
    expect(isOverConsumed(100, 110)).toBe(true)
  })

  it('returns false when allocated === available', () => {
    expect(isOverConsumed(100, 100)).toBe(false)
  })

  it('returns false when allocated < available', () => {
    expect(isOverConsumed(100, 50)).toBe(false)
  })

  it('returns false when both are 0', () => {
    expect(isOverConsumed(0, 0)).toBe(false)
  })

  it('returns true when available is 0 and allocated is positive', () => {
    expect(isOverConsumed(0, 1)).toBe(true)
  })

  it('returns false for large but balanced values', () => {
    expect(isOverConsumed(1_000_000, 999_999)).toBe(false)
  })

  it('returns true when allocated is exactly 1 more than available', () => {
    expect(isOverConsumed(50, 51)).toBe(true)
  })

  it('handles fractional quantities', () => {
    expect(isOverConsumed(10.5, 10.6)).toBe(true)
    expect(isOverConsumed(10.5, 10.5)).toBe(false)
    expect(isOverConsumed(10.5, 10.4)).toBe(false)
  })
})

// ── computeConsumedPct ────────────────────────────────────────────────────────

describe('computeConsumedPct', () => {
  it('returns 0 when qtyAvailable is 0', () => {
    expect(computeConsumedPct(0, 10)).toBe(0)
  })

  it('returns 0 when nothing allocated', () => {
    expect(computeConsumedPct(100, 0)).toBe(0)
  })

  it('returns correct percentage for normal case', () => {
    expect(computeConsumedPct(100, 75)).toBeCloseTo(75)
  })

  it('returns 50 for half consumed', () => {
    expect(computeConsumedPct(200, 100)).toBeCloseTo(50)
  })

  it('returns exactly 100 when fully consumed', () => {
    expect(computeConsumedPct(100, 100)).toBe(100)
  })

  it('caps at 100 when over-consumed (110 / 100 = 110% → capped at 100)', () => {
    expect(computeConsumedPct(100, 110)).toBe(100)
  })

  it('caps at 100 even for extreme over-consumption', () => {
    expect(computeConsumedPct(10, 1000)).toBe(100)
  })

  it('returns 0 when qtyAvailable is negative (treated as <= 0)', () => {
    expect(computeConsumedPct(-1, 5)).toBe(0)
  })

  it('handles fractional quantities correctly', () => {
    expect(computeConsumedPct(3, 1.5)).toBeCloseTo(50)
  })

  it('returns correct pct for 1 of 4 consumed (25%)', () => {
    expect(computeConsumedPct(4, 1)).toBeCloseTo(25)
  })

  it('returns correct pct for 3 of 4 consumed (75%)', () => {
    expect(computeConsumedPct(4, 3)).toBeCloseTo(75)
  })

  it('returns 0 when both are 0', () => {
    expect(computeConsumedPct(0, 0)).toBe(0)
  })
})

// ── computeCostDrift ──────────────────────────────────────────────────────────

describe('computeCostDrift', () => {
  it('returns null when entry cost is 0', () => {
    expect(computeCostDrift(0, 150)).toBeNull()
  })

  it('returns 0 when entry cost equals current cost', () => {
    expect(computeCostDrift(100, 100)).toBeCloseTo(0)
  })

  it('returns positive drift when current > entry', () => {
    // (130 - 100) / 100 * 100 = 30%
    expect(computeCostDrift(100, 130)).toBeCloseTo(30)
  })

  it('returns negative drift when current < entry', () => {
    // (80 - 100) / 100 * 100 = -20%
    expect(computeCostDrift(100, 80)).toBeCloseTo(-20)
  })

  it('handles fractional entry cost correctly', () => {
    // (15 - 10) / 10 * 100 = 50%
    expect(computeCostDrift(10, 15)).toBeCloseTo(50)
  })

  it('handles very small drift', () => {
    // (101 - 100) / 100 * 100 = 1%
    expect(computeCostDrift(100, 101)).toBeCloseTo(1)
  })

  it('returns -100% when current cost is 0', () => {
    expect(computeCostDrift(100, 0)).toBeCloseTo(-100)
  })

  it('returns 100% when current is double entry cost', () => {
    expect(computeCostDrift(50, 100)).toBeCloseTo(100)
  })

  it('handles large values correctly', () => {
    // Entry 1000, current 1200 → +20%
    expect(computeCostDrift(1000, 1200)).toBeCloseTo(20)
  })

  it('returns null when entry cost is exactly 0 (null division guard)', () => {
    expect(computeCostDrift(0, 0)).toBeNull()
  })
})

// ── classifyLotHealth ─────────────────────────────────────────────────────────

describe('classifyLotHealth', () => {
  it('returns clean when no issues', () => {
    expect(classifyLotHealth(false, false, null)).toBe('clean')
  })

  it('returns clean when drift is within threshold', () => {
    expect(classifyLotHealth(false, false, 15)).toBe('clean')
  })

  it('returns clean when drift is exactly 20', () => {
    // boundary: |drift| > 20 required
    expect(classifyLotHealth(false, false, 20)).toBe('clean')
  })

  it('returns cost_drift when |drift| > 20', () => {
    expect(classifyLotHealth(false, false, 25)).toBe('cost_drift')
  })

  it('returns cost_drift for negative drift exceeding threshold', () => {
    expect(classifyLotHealth(false, false, -30)).toBe('cost_drift')
  })

  it('returns clean for drift of exactly -20', () => {
    expect(classifyLotHealth(false, false, -20)).toBe('clean')
  })

  it('returns cost_drift for drift of -21', () => {
    expect(classifyLotHealth(false, false, -21)).toBe('cost_drift')
  })

  it('returns orphaned when orphaned flag is set', () => {
    expect(classifyLotHealth(false, true, null)).toBe('orphaned')
  })

  it('returns orphaned when orphaned even with cost drift', () => {
    expect(classifyLotHealth(false, true, 50)).toBe('orphaned')
  })

  it('returns over_consumed when over-consumed', () => {
    expect(classifyLotHealth(true, false, null)).toBe('over_consumed')
  })

  it('over_consumed takes priority over orphaned', () => {
    expect(classifyLotHealth(true, true, null)).toBe('over_consumed')
  })

  it('over_consumed takes priority over cost_drift', () => {
    expect(classifyLotHealth(true, false, 50)).toBe('over_consumed')
  })

  it('over_consumed takes priority over all flags', () => {
    expect(classifyLotHealth(true, true, 50)).toBe('over_consumed')
  })

  it('returns clean when drift is null and no flags', () => {
    expect(classifyLotHealth(false, false, null)).toBe('clean')
  })

  it('returns cost_drift for very large drift values', () => {
    expect(classifyLotHealth(false, false, 500)).toBe('cost_drift')
    expect(classifyLotHealth(false, false, -999)).toBe('cost_drift')
  })
})

// ── computeIntegrityScore ─────────────────────────────────────────────────────

describe('computeIntegrityScore', () => {
  it('returns 100 when totalLots is 0', () => {
    expect(computeIntegrityScore(0, 0, 0, 0)).toBe(100)
  })

  it('returns 100 for all-clean lots', () => {
    expect(computeIntegrityScore(10, 0, 0, 0)).toBe(100)
  })

  it('deducts 20 per over-consumed lot', () => {
    expect(computeIntegrityScore(5, 2, 0, 0)).toBe(60)
  })

  it('deducts 10 per orphaned lot', () => {
    expect(computeIntegrityScore(5, 0, 3, 0)).toBe(70)
  })

  it('deducts 5 per cost-drift lot', () => {
    expect(computeIntegrityScore(10, 0, 0, 4)).toBe(80)
  })

  it('applies combined deductions', () => {
    // 100 - (1×20) - (1×10) - (2×5) = 60
    expect(computeIntegrityScore(20, 1, 1, 2)).toBe(60)
  })

  it('floors at 0 when deductions exceed 100', () => {
    expect(computeIntegrityScore(10, 6, 0, 0)).toBe(0)
  })

  it('floors at 0 for extreme deductions', () => {
    expect(computeIntegrityScore(5, 5, 5, 5)).toBe(0)
  })

  it('returns 80 for 1 over-consumed out of 10 lots', () => {
    expect(computeIntegrityScore(10, 1, 0, 0)).toBe(80)
  })

  it('returns 90 for 1 orphaned and 1 cost-drift out of 20', () => {
    // 100 - 10 - 5 = 85
    expect(computeIntegrityScore(20, 0, 1, 1)).toBe(85)
  })

  it('score is always in [0, 100]', () => {
    const cases = [
      [0, 0, 0, 0],
      [10, 10, 10, 10],
      [100, 0, 0, 0],
      [1, 0, 1, 0],
      [50, 3, 2, 4],
    ]
    for (const [total, oc, orph, cd] of cases) {
      const score = computeIntegrityScore(total, oc, orph, cd)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    }
  })
})

// ── scoreToGrade ──────────────────────────────────────────────────────────────

describe('scoreToGrade', () => {
  it('returns A for score 90', () => {
    expect(scoreToGrade(90)).toBe('A')
  })

  it('returns A for score 100', () => {
    expect(scoreToGrade(100)).toBe('A')
  })

  it('returns A for score 95', () => {
    expect(scoreToGrade(95)).toBe('A')
  })

  it('returns B for score 80', () => {
    expect(scoreToGrade(80)).toBe('B')
  })

  it('returns B for score 89', () => {
    expect(scoreToGrade(89)).toBe('B')
  })

  it('returns C for score 70', () => {
    expect(scoreToGrade(70)).toBe('C')
  })

  it('returns C for score 79', () => {
    expect(scoreToGrade(79)).toBe('C')
  })

  it('returns D for score 60', () => {
    expect(scoreToGrade(60)).toBe('D')
  })

  it('returns D for score 69', () => {
    expect(scoreToGrade(69)).toBe('D')
  })

  it('returns F for score 59', () => {
    expect(scoreToGrade(59)).toBe('F')
  })

  it('returns F for score 0', () => {
    expect(scoreToGrade(0)).toBe('F')
  })

  it('boundary: 89 is B, 90 is A', () => {
    expect(scoreToGrade(89)).toBe('B')
    expect(scoreToGrade(90)).toBe('A')
  })

  it('boundary: 79 is C, 80 is B', () => {
    expect(scoreToGrade(79)).toBe('C')
    expect(scoreToGrade(80)).toBe('B')
  })

  it('boundary: 69 is D, 70 is C', () => {
    expect(scoreToGrade(69)).toBe('D')
    expect(scoreToGrade(70)).toBe('C')
  })

  it('boundary: 59 is F, 60 is D', () => {
    expect(scoreToGrade(59)).toBe('F')
    expect(scoreToGrade(60)).toBe('D')
  })

  it('covers all possible output grades', () => {
    const inputs = [100, 90, 85, 80, 75, 70, 65, 60, 55, 0]
    const grades = inputs.map(s => scoreToGrade(s))
    expect(grades).toContain('A')
    expect(grades).toContain('B')
    expect(grades).toContain('C')
    expect(grades).toContain('D')
    expect(grades).toContain('F')
  })
})

// ── integration: computeIntegrityScore + scoreToGrade ────────────────────────

describe('integration: score → grade pipeline', () => {
  it('perfect lots → score 100 → grade A', () => {
    const score = computeIntegrityScore(10, 0, 0, 0)
    expect(scoreToGrade(score)).toBe('A')
  })

  it('one over-consumed out of 5 → score 80 → grade B', () => {
    const score = computeIntegrityScore(5, 1, 0, 0)
    expect(score).toBe(80)
    expect(scoreToGrade(score)).toBe('B')
  })

  it('severe issues → floor 0 → grade F', () => {
    const score = computeIntegrityScore(5, 5, 0, 0)
    expect(score).toBe(0)
    expect(scoreToGrade(score)).toBe('F')
  })

  it('consumed pct 0 for empty lot → isOverConsumed false', () => {
    expect(computeConsumedPct(0, 0)).toBe(0)
    expect(isOverConsumed(0, 0)).toBe(false)
    expect(classifyLotHealth(false, false, null)).toBe('clean')
  })
})
