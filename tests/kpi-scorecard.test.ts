// tests/kpi-scorecard.test.ts
// Unit tests for lib/services/intelligence/kpi-scorecard.service.ts

import { describe, it, expect } from 'vitest'
import {
  computeAchievementPct,
  classifyAchievement,
  computeKpiTrend,
  computeScorecardHealth,
  scorecardGrade,
} from '@/lib/services/intelligence/kpi-scorecard.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeAchievementPct
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAchievementPct', () => {
  it('computes normal case: 80 / 100 = 80%', () => {
    expect(computeAchievementPct(80, 100)).toBeCloseTo(80)
  })

  it('computes over-achievement: 120 / 100 = 120%', () => {
    expect(computeAchievementPct(120, 100)).toBeCloseTo(120)
  })

  it('returns null when target is 0', () => {
    expect(computeAchievementPct(50, 0)).toBeNull()
  })

  it('returns 0 when actual is 0 and target > 0', () => {
    expect(computeAchievementPct(0, 100)).toBeCloseTo(0)
  })

  it('handles fractional values', () => {
    expect(computeAchievementPct(45, 60)).toBeCloseTo(75)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyAchievement
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyAchievement', () => {
  it('returns no_data for null', () => {
    expect(classifyAchievement(null)).toBe('no_data')
  })

  it('returns achieved for exactly 100', () => {
    expect(classifyAchievement(100)).toBe('achieved')
  })

  it('returns achieved for values above 100', () => {
    expect(classifyAchievement(115)).toBe('achieved')
  })

  it('returns near_target for 90', () => {
    expect(classifyAchievement(90)).toBe('near_target')
  })

  it('returns near_target for 99', () => {
    expect(classifyAchievement(99)).toBe('near_target')
  })

  it('returns below_target for 70', () => {
    expect(classifyAchievement(70)).toBe('below_target')
  })

  it('returns below_target for 89', () => {
    expect(classifyAchievement(89)).toBe('below_target')
  })

  it('returns at_risk for 69', () => {
    expect(classifyAchievement(69)).toBe('at_risk')
  })

  it('returns at_risk for 0', () => {
    expect(classifyAchievement(0)).toBe('at_risk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKpiTrend
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKpiTrend', () => {
  // higher_is_better: target 100, higher actual = closer to target

  it('returns improving when getting closer to target (higher_is_better)', () => {
    // oldest: 50 (dist=50), newest: 90 (dist=10) — dist shrank by 80% → improving
    const result = computeKpiTrend([50, 70, 90], 100, 'higher_is_better')
    expect(result).toBe('improving')
  })

  it('returns declining when moving away from target (higher_is_better)', () => {
    // oldest: 90 (dist=10), newest: 50 (dist=50) — dist grew 400% → declining
    const result = computeKpiTrend([90, 70, 50], 100, 'higher_is_better')
    expect(result).toBe('declining')
  })

  it('returns stable when change is within 5% (higher_is_better)', () => {
    // oldest: 80 (dist=20), newest: 81 (dist=19) — ~5% change
    const result = computeKpiTrend([80, 80, 81], 100, 'higher_is_better')
    expect(result).toBe('stable')
  })

  // lower_is_better: target 10, lower actual = closer to target

  it('returns improving when getting closer to target (lower_is_better)', () => {
    // oldest: 50 (dist=40), newest: 15 (dist=5) — dist shrank → improving
    const result = computeKpiTrend([50, 30, 15], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('returns declining when moving away from target (lower_is_better)', () => {
    // oldest: 15 (dist=5), newest: 50 (dist=40) — dist grew → declining
    const result = computeKpiTrend([15, 30, 50], 10, 'lower_is_better')
    expect(result).toBe('declining')
  })

  it('returns stable when fewer than 2 actuals provided', () => {
    expect(computeKpiTrend([], 100, 'higher_is_better')).toBe('stable')
    expect(computeKpiTrend([80], 100, 'higher_is_better')).toBe('stable')
  })

  it('uses oldest and newest when more than 3 points provided', () => {
    // oldest: 50, newest: 95 — improving
    const result = computeKpiTrend([50, 60, 75, 85, 95], 100, 'higher_is_better')
    expect(result).toBe('improving')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeScorecardHealth
// ─────────────────────────────────────────────────────────────────────────────

describe('computeScorecardHealth', () => {
  it('returns 0 for empty array', () => {
    expect(computeScorecardHealth([])).toBe(0)
  })

  it('returns 100 for all achieved', () => {
    expect(computeScorecardHealth(['achieved', 'achieved', 'achieved'])).toBe(100)
  })

  it('returns 0 for all no_data', () => {
    expect(computeScorecardHealth(['no_data', 'no_data'])).toBe(0)
  })

  it('computes average for mixed statuses', () => {
    // achieved=100, at_risk=20, no_data=0 → avg = (100+20+0)/3 ≈ 40
    const result = computeScorecardHealth(['achieved', 'at_risk', 'no_data'])
    expect(result).toBeCloseTo(40)
  })

  it('includes near_target=80 and below_target=50 correctly', () => {
    // near_target=80, below_target=50 → avg = 65
    const result = computeScorecardHealth(['near_target', 'below_target'])
    expect(result).toBeCloseTo(65)
  })

  it('all 5 statuses average correctly', () => {
    // 100+80+50+20+0 = 250 / 5 = 50
    const result = computeScorecardHealth(['achieved', 'near_target', 'below_target', 'at_risk', 'no_data'])
    expect(result).toBeCloseTo(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// scorecardGrade
// ─────────────────────────────────────────────────────────────────────────────

describe('scorecardGrade', () => {
  it('returns A for score >= 80', () => {
    expect(scorecardGrade(80)).toBe('A')
    expect(scorecardGrade(100)).toBe('A')
  })

  it('returns B for score 65-79', () => {
    expect(scorecardGrade(65)).toBe('B')
    expect(scorecardGrade(79)).toBe('B')
  })

  it('returns C for score 50-64', () => {
    expect(scorecardGrade(50)).toBe('C')
    expect(scorecardGrade(64)).toBe('C')
  })

  it('returns D for score 35-49', () => {
    expect(scorecardGrade(35)).toBe('D')
    expect(scorecardGrade(49)).toBe('D')
  })

  it('returns F for score < 35', () => {
    expect(scorecardGrade(34)).toBe('F')
    expect(scorecardGrade(0)).toBe('F')
  })
})
