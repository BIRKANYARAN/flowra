/**
 * Pure-function tests for customer analytics helpers added to
 * lib/services/commercial/cohort-retention.service.ts
 *
 * Covers:
 *   - computeEstimatedLTV
 *   - computeCustomerRiskScore
 *   - classifyCustomerSegment
 *
 * Run with: npx vitest run tests/customer-analytics-pure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeEstimatedLTV,
  computeCustomerRiskScore,
  classifyCustomerSegment,
} from '../lib/services/commercial/cohort-retention.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeEstimatedLTV
// ─────────────────────────────────────────────────────────────────────────────

describe('computeEstimatedLTV', () => {
  it('returns 0 when retentionRate is 0', () => {
    expect(computeEstimatedLTV(1000, 12, 0, 30)).toBe(0)
  })

  it('returns 0 when retentionRate is negative', () => {
    expect(computeEstimatedLTV(1000, 12, -5, 30)).toBe(0)
  })

  it('applies cap formula when retentionRate is exactly 100', () => {
    // cap: avgOrderValue * ordersPerYear * 10 * marginPct/100
    const expected = 1000 * 12 * 10 * (30 / 100)
    expect(computeEstimatedLTV(1000, 12, 100, 30)).toBeCloseTo(expected, 5)
  })

  it('applies cap formula when retentionRate exceeds 100', () => {
    const expected = 500 * 6 * 10 * (20 / 100)
    expect(computeEstimatedLTV(500, 6, 120, 20)).toBeCloseTo(expected, 5)
  })

  it('uses standard LTV formula for typical retention of 50%', () => {
    // LTV = 1000 * 12 * (0.5/0.5) * 0.25 = 12000 * 1 * 0.25 = 3000
    expect(computeEstimatedLTV(1000, 12, 50, 25)).toBeCloseTo(3000, 5)
  })

  it('uses standard LTV formula for 75% retention', () => {
    // r=0.75, r/(1-r) = 3
    // LTV = 2000 * 4 * 3 * (20/100) = 2000*4*3*0.2 = 4800
    expect(computeEstimatedLTV(2000, 4, 75, 20)).toBeCloseTo(4800, 5)
  })

  it('uses standard LTV formula for 25% retention', () => {
    // r=0.25, r/(1-r) = 1/3
    // LTV = 600 * 6 * (1/3) * (30/100) = 600*6*0.3333*0.3 = 360
    expect(computeEstimatedLTV(600, 6, 25, 30)).toBeCloseTo(360, 3)
  })

  it('returns 0 when marginPct is 0', () => {
    expect(computeEstimatedLTV(1000, 12, 60, 0)).toBe(0)
  })

  it('scales proportionally with marginPct', () => {
    const ltv10 = computeEstimatedLTV(1000, 6, 50, 10)
    const ltv20 = computeEstimatedLTV(1000, 6, 50, 20)
    expect(ltv20).toBeCloseTo(ltv10 * 2, 5)
  })

  it('scales proportionally with avgOrderValue', () => {
    const ltv1 = computeEstimatedLTV(500, 12, 60, 25)
    const ltv2 = computeEstimatedLTV(1000, 12, 60, 25)
    expect(ltv2).toBeCloseTo(ltv1 * 2, 5)
  })

  it('always returns a non-negative value', () => {
    for (const retention of [0, 10, 50, 90, 100, 110]) {
      expect(computeEstimatedLTV(1000, 12, retention, 30)).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeCustomerRiskScore
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCustomerRiskScore', () => {
  it('returns 0 for a perfectly healthy customer', () => {
    expect(computeCustomerRiskScore(0, 0, 0)).toBe(0)
  })

  it('returns 100 for worst-case inputs', () => {
    // daysSince=365 → recency=1 → 30; overdue=100000 → overdue=1 → 40; delay=90 → behavior=1 → 30
    expect(computeCustomerRiskScore(365, 100_000, 90)).toBe(100)
  })

  it('caps recency component at 30 beyond 365 days', () => {
    const score1 = computeCustomerRiskScore(365, 0, 0)
    const score2 = computeCustomerRiskScore(730, 0, 0)
    expect(score1).toBe(30)
    expect(score2).toBe(30) // capped
  })

  it('caps overdue component at 40 beyond 100000 TRY', () => {
    const score1 = computeCustomerRiskScore(0, 100_000, 0)
    const score2 = computeCustomerRiskScore(0, 999_999, 0)
    expect(score1).toBe(40)
    expect(score2).toBe(40) // capped
  })

  it('caps behavior component at 30 beyond 90 days delay', () => {
    const score1 = computeCustomerRiskScore(0, 0, 90)
    const score2 = computeCustomerRiskScore(0, 0, 180)
    expect(score1).toBe(30)
    expect(score2).toBe(30) // capped
  })

  it('recency contributes proportionally at half-year mark', () => {
    // 182.5 days ≈ 0.5 * 365 → recency=0.5 → score=15
    const score = computeCustomerRiskScore(182.5, 0, 0)
    expect(score).toBeCloseTo(15, 2)
  })

  it('overdue contributes proportionally at half maximum', () => {
    // 50000 / 100000 = 0.5 → 20
    const score = computeCustomerRiskScore(0, 50_000, 0)
    expect(score).toBeCloseTo(20, 5)
  })

  it('payment delay contributes proportionally at 45 days', () => {
    // 45/90 = 0.5 → 15
    const score = computeCustomerRiskScore(0, 0, 45)
    expect(score).toBeCloseTo(15, 5)
  })

  it('result is always in [0, 100]', () => {
    const cases = [
      [0, 0, 0],
      [365, 100_000, 90],
      [100, 30_000, 20],
      [800, 500_000, 200],
      [-10, -5, -1],
    ] as const
    for (const [d, o, p] of cases) {
      const s = computeCustomerRiskScore(d, o, p)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })

  it('negative inputs are clamped to 0 component contributions', () => {
    expect(computeCustomerRiskScore(-100, -50000, -45)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyCustomerSegment
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyCustomerSegment', () => {
  it('classifies a champion: revenue > 500K and retention > 80', () => {
    expect(classifyCustomerSegment(600_000, 50, 85)).toBe('champion')
  })

  it('classifies a champion at boundary values', () => {
    expect(classifyCustomerSegment(500_001, 10, 81)).toBe('champion')
  })

  it('does not classify as champion if revenue exactly 500K', () => {
    // >500K required, so 500K itself should not be champion
    const result = classifyCustomerSegment(500_000, 50, 85)
    expect(result).not.toBe('champion')
  })

  it('does not classify as champion if retention exactly 80', () => {
    // >80 required, so 80 itself should not be champion
    const result = classifyCustomerSegment(600_000, 50, 80)
    expect(result).not.toBe('champion')
  })

  it('classifies loyal: revenue > 100K and retention > 60', () => {
    expect(classifyCustomerSegment(200_000, 20, 70)).toBe('loyal')
  })

  it('classifies loyal at boundary values', () => {
    expect(classifyCustomerSegment(100_001, 5, 61)).toBe('loyal')
  })

  it('classifies lost: retention < 20', () => {
    expect(classifyCustomerSegment(50_000, 10, 15)).toBe('lost')
  })

  it('classifies lost even with high order count', () => {
    expect(classifyCustomerSegment(30_000, 100, 5)).toBe('lost')
  })

  it('does not classify as lost if retention exactly 20', () => {
    // <20 required
    const result = classifyCustomerSegment(50_000, 10, 20)
    expect(result).not.toBe('lost')
  })

  it('classifies new: orderCount <= 2 (when retention >= 20)', () => {
    expect(classifyCustomerSegment(10_000, 1, 50)).toBe('new')
    expect(classifyCustomerSegment(10_000, 2, 50)).toBe('new')
  })

  it('does not classify new if orderCount is 3', () => {
    const result = classifyCustomerSegment(10_000, 3, 50)
    expect(result).not.toBe('new')
  })

  it('classifies at_risk as the fallthrough segment', () => {
    expect(classifyCustomerSegment(50_000, 5, 30)).toBe('at_risk')
  })

  it('at_risk when revenue is low, orderCount > 2, retention between 20 and 60', () => {
    expect(classifyCustomerSegment(80_000, 8, 40)).toBe('at_risk')
  })

  it('champion takes priority over loyal', () => {
    // revenue > 500K, retention > 80 → champion despite also satisfying loyal
    expect(classifyCustomerSegment(700_000, 30, 90)).toBe('champion')
  })

  it('loyal takes priority over at_risk', () => {
    // revenue > 100K, retention > 60 but not champion
    expect(classifyCustomerSegment(150_000, 10, 65)).toBe('loyal')
  })

  it('lost takes priority over new', () => {
    // retention < 20, orderCount <= 2 → lost wins
    expect(classifyCustomerSegment(5_000, 2, 10)).toBe('lost')
  })

  it('new takes priority over at_risk', () => {
    // orderCount = 1, retention = 40 → new
    expect(classifyCustomerSegment(90_000, 1, 40)).toBe('new')
  })
})
