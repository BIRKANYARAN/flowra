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
})
