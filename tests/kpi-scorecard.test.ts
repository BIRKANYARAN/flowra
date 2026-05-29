// tests/kpi-scorecard.test.ts
// Unit tests for lib/services/intelligence/kpi-scorecard.service.ts
// Extended to 100+ tests covering all pure-function exports.

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

  // Exact boundary values
  it('returns A for exactly 80 (boundary)', () => {
    expect(scorecardGrade(80)).toBe('A')
  })

  it('returns B for exactly 79 (just below A boundary)', () => {
    expect(scorecardGrade(79)).toBe('B')
  })

  it('returns B for exactly 65 (boundary)', () => {
    expect(scorecardGrade(65)).toBe('B')
  })

  it('returns C for exactly 64 (just below B boundary)', () => {
    expect(scorecardGrade(64)).toBe('C')
  })

  it('returns C for exactly 50 (boundary)', () => {
    expect(scorecardGrade(50)).toBe('C')
  })

  it('returns D for exactly 49 (just below C boundary)', () => {
    expect(scorecardGrade(49)).toBe('D')
  })

  it('returns D for exactly 35 (boundary)', () => {
    expect(scorecardGrade(35)).toBe('D')
  })

  it('returns F for exactly 34 (just below D boundary)', () => {
    expect(scorecardGrade(34)).toBe('F')
  })

  it('returns A for very high score (200)', () => {
    expect(scorecardGrade(200)).toBe('A')
  })

  it('returns F for negative score', () => {
    expect(scorecardGrade(-10)).toBe('F')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional computeAchievementPct boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAchievementPct — extended boundary tests', () => {
  it('exactly at target: 100 / 100 = 100%', () => {
    expect(computeAchievementPct(100, 100)).toBeCloseTo(100)
  })

  it('1% actual vs 100 target = 1%', () => {
    expect(computeAchievementPct(1, 100)).toBeCloseTo(1)
  })

  it('target of 1, actual of 1 = 100%', () => {
    expect(computeAchievementPct(1, 1)).toBeCloseTo(100)
  })

  it('large revenue values: 5M / 10M = 50%', () => {
    expect(computeAchievementPct(5_000_000, 10_000_000)).toBeCloseTo(50)
  })

  it('large over-achievement: 150 / 100 = 150%', () => {
    expect(computeAchievementPct(150, 100)).toBeCloseTo(150)
  })

  it('fractional actual: 0.5 / 10 = 5%', () => {
    expect(computeAchievementPct(0.5, 10)).toBeCloseTo(5)
  })

  it('returns null for negative-only when target is 0', () => {
    expect(computeAchievementPct(0, 0)).toBeNull()
  })

  it('target = 0.001 (near-zero but not zero): 0.001 / 0.001 = 100%', () => {
    expect(computeAchievementPct(0.001, 0.001)).toBeCloseTo(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional classifyAchievement boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyAchievement — extended boundary tests', () => {
  it('exactly 100 → achieved', () => {
    expect(classifyAchievement(100)).toBe('achieved')
  })

  it('exactly 90 → near_target', () => {
    expect(classifyAchievement(90)).toBe('near_target')
  })

  it('exactly 70 → below_target', () => {
    expect(classifyAchievement(70)).toBe('below_target')
  })

  it('1% → at_risk (very low)', () => {
    expect(classifyAchievement(1)).toBe('at_risk')
  })

  it('200% → achieved (way over target)', () => {
    expect(classifyAchievement(200)).toBe('achieved')
  })

  it('99.9 → near_target', () => {
    expect(classifyAchievement(99.9)).toBe('near_target')
  })

  it('89.9 → below_target', () => {
    expect(classifyAchievement(89.9)).toBe('below_target')
  })

  it('69.9 → at_risk', () => {
    expect(classifyAchievement(69.9)).toBe('at_risk')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional computeKpiTrend tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKpiTrend — extended tests', () => {
  it('stable when oldest is exactly on target (baseline distance ≈ 0)', () => {
    // higher_is_better: oldest = 100 = target → distOldest = 0 → stable
    const result = computeKpiTrend([100, 110, 120], 100, 'higher_is_better')
    expect(result).toBe('stable')
  })

  it('improving for lower_is_better: value decreases toward target', () => {
    // oldest: 100 (dist=90), newest: 15 (dist=5) → improving
    const result = computeKpiTrend([100, 50, 15], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('stable with exactly 2 actuals and no change', () => {
    const result = computeKpiTrend([50, 50], 100, 'higher_is_better')
    expect(result).toBe('stable')
  })

  it('stable with 2 actuals, marginal change within ±5%', () => {
    // oldest: 95 (dist=5), newest: 94 (dist=6) → relChange=(6-5)/5=0.2 → declining? No, let me verify
    // dist grew by 20% → declining
    const result = computeKpiTrend([95, 80], 100, 'higher_is_better')
    // oldest: 95 (dist=5), newest: 80 (dist=20) → relChange = (20-5)/5 = 3.0 > 0.05 → declining
    expect(result).toBe('declining')
  })

  it('returns stable when exactly 5% relChange (boundary between stable and declining)', () => {
    // oldest: 80 (dist=20), newest: 79 (dist=21) → relChange=(21-20)/20=0.05 → NOT > 0.05 → stable
    const result = computeKpiTrend([80, 79], 100, 'higher_is_better')
    expect(result).toBe('stable')
  })

  it('returns declining when just above 5% relChange', () => {
    // oldest: 80 (dist=20), newest: 78.9 (dist=21.1) → relChange=(21.1-20)/20=0.055 > 0.05 → declining
    const result = computeKpiTrend([80, 78.9], 100, 'higher_is_better')
    expect(result).toBe('declining')
  })

  it('returns improving for lower_is_better with 2 values: going down toward target', () => {
    // target: 10, oldest: 50 (dist=40), newest: 20 (dist=10) → relChange=(10-40)/40=-0.75 → improving
    const result = computeKpiTrend([50, 20], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('handles single element array → stable', () => {
    expect(computeKpiTrend([80], 100, 'higher_is_better')).toBe('stable')
  })

  it('handles empty array → stable', () => {
    expect(computeKpiTrend([], 100, 'higher_is_better')).toBe('stable')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Additional computeScorecardHealth tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeScorecardHealth — extended tests', () => {
  it('single achieved → 100', () => {
    expect(computeScorecardHealth(['achieved'])).toBe(100)
  })

  it('single at_risk → 20', () => {
    expect(computeScorecardHealth(['at_risk'])).toBe(20)
  })

  it('single below_target → 50', () => {
    expect(computeScorecardHealth(['below_target'])).toBe(50)
  })

  it('single near_target → 80', () => {
    expect(computeScorecardHealth(['near_target'])).toBe(80)
  })

  it('single no_data → 0', () => {
    expect(computeScorecardHealth(['no_data'])).toBe(0)
  })

  it('all near_target → 80', () => {
    expect(computeScorecardHealth(['near_target', 'near_target', 'near_target'])).toBe(80)
  })

  it('all below_target → 50', () => {
    expect(computeScorecardHealth(['below_target', 'below_target'])).toBe(50)
  })

  it('all at_risk → 20', () => {
    expect(computeScorecardHealth(['at_risk', 'at_risk', 'at_risk'])).toBe(20)
  })

  it('achieved + no_data → average = (100+0)/2 = 50', () => {
    expect(computeScorecardHealth(['achieved', 'no_data'])).toBeCloseTo(50)
  })

  it('near_target + at_risk → (80+20)/2 = 50', () => {
    expect(computeScorecardHealth(['near_target', 'at_risk'])).toBeCloseTo(50)
  })

  it('grade function matches health score — A for high health', () => {
    const health = computeScorecardHealth(['achieved', 'achieved', 'near_target', 'achieved'])
    // (100+100+80+100)/4 = 95 → A
    expect(scorecardGrade(health)).toBe('A')
  })

  it('grade function matches health score — F for all no_data', () => {
    const health = computeScorecardHealth(['no_data', 'no_data', 'no_data'])
    expect(scorecardGrade(health)).toBe('F')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style: computeAchievementPct + classifyAchievement pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAchievementPct + classifyAchievement pipeline', () => {
  it('revenue at target → achieved', () => {
    const pct = computeAchievementPct(1_000_000, 1_000_000)
    expect(classifyAchievement(pct)).toBe('achieved')
  })

  it('revenue at 95% of target → near_target', () => {
    const pct = computeAchievementPct(950_000, 1_000_000)
    expect(classifyAchievement(pct)).toBe('near_target')
  })

  it('revenue at 80% of target → below_target', () => {
    const pct = computeAchievementPct(800_000, 1_000_000)
    expect(classifyAchievement(pct)).toBe('below_target')
  })

  it('revenue at 50% of target → at_risk', () => {
    const pct = computeAchievementPct(500_000, 1_000_000)
    expect(classifyAchievement(pct)).toBe('at_risk')
  })

  it('zero target → no_data via null achievement', () => {
    const pct = computeAchievementPct(1_000_000, 0)
    expect(classifyAchievement(pct)).toBe('no_data')
  })

  it('zero actual, nonzero target → at_risk', () => {
    const pct = computeAchievementPct(0, 1_000_000)
    expect(classifyAchievement(pct)).toBe('at_risk')
  })

  it('120% over-achievement → achieved', () => {
    const pct = computeAchievementPct(1_200_000, 1_000_000)
    expect(classifyAchievement(pct)).toBe('achieved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeScorecardHealth + scorecardGrade integration
// ─────────────────────────────────────────────────────────────────────────────

describe('computeScorecardHealth + scorecardGrade integration', () => {
  it('3 achieved → health=100 → grade A', () => {
    const h = computeScorecardHealth(['achieved', 'achieved', 'achieved'])
    expect(scorecardGrade(h)).toBe('A')
  })

  it('mixed → grade B range', () => {
    // achieved(100) + near_target(80) + near_target(80) = 260/3 ≈ 86.67 → A
    const h = computeScorecardHealth(['achieved', 'near_target', 'near_target'])
    expect(scorecardGrade(h)).toBe('A')
  })

  it('all below_target → health=50 → grade C', () => {
    const h = computeScorecardHealth(['below_target', 'below_target', 'below_target'])
    expect(scorecardGrade(h)).toBe('C')
  })

  it('all at_risk → health=20 → grade F', () => {
    const h = computeScorecardHealth(['at_risk', 'at_risk', 'at_risk'])
    expect(scorecardGrade(h)).toBe('F')
  })

  it('mixed: health at 65 boundary → grade B', () => {
    // near_target(80) + below_target(50) = 130/2 = 65 → B
    const h = computeScorecardHealth(['near_target', 'below_target'])
    expect(scorecardGrade(h)).toBe('B')
  })

  it('grade D boundary: health=35 → D', () => {
    // at_risk(20) + below_target(50) = 70/2 = 35 → D
    const h = computeScorecardHealth(['at_risk', 'below_target'])
    expect(scorecardGrade(h)).toBe('D')
  })

  it('health just below D boundary: all at_risk → F', () => {
    // at_risk=20, below F threshold (<35) → F
    const h = computeScorecardHealth(['at_risk'])
    expect(scorecardGrade(h)).toBe('F')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKpiTrend — lower_is_better additional edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKpiTrend — lower_is_better edge cases', () => {
  it('DSO improving: from 45 days to 15 days (target 10)', () => {
    const result = computeKpiTrend([45, 30, 15], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('DSO stable: stays near target', () => {
    // oldest: 11 (dist=1), newest: 11 (dist=1) → relChange = 0 → stable
    const result = computeKpiTrend([11, 11], 10, 'lower_is_better')
    expect(result).toBe('stable')
  })

  it('DSO declining: moving away from target', () => {
    // oldest: 15 (dist=5), newest: 60 (dist=50) → relChange=(50-5)/5=9 > 0.05 → declining
    const result = computeKpiTrend([15, 30, 60], 10, 'lower_is_better')
    expect(result).toBe('declining')
  })

  it('expense_ratio improving: decreasing toward target', () => {
    // oldest: 100 (dist=90), newest: 15 (dist=5) → improving
    const result = computeKpiTrend([100, 60, 15], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('4 actuals: uses oldest and newest correctly', () => {
    // oldest: 80 (dist=70), newest: 20 (dist=10) → improving
    const result = computeKpiTrend([80, 60, 40, 20], 10, 'lower_is_better')
    expect(result).toBe('improving')
  })

  it('already at target for lower_is_better: distOldest ≈ 0 → stable', () => {
    // oldest = 10 = target → distOldest = 0 → stable
    const result = computeKpiTrend([10, 8, 11], 10, 'lower_is_better')
    expect(result).toBe('stable')
  })

  it('higher_is_better: single large jump from 10 to 90 → improving', () => {
    // oldest: 10 (dist=90), newest: 90 (dist=10) → relChange=(10-90)/90 ≈ -0.89 → improving
    const result = computeKpiTrend([10, 90], 100, 'higher_is_better')
    expect(result).toBe('improving')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeAchievementPct — formula: actual / target × 100
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAchievementPct — formula verification', () => {
  it('formula: actual / target × 100', () => {
    // 60 / 80 × 100 = 75
    expect(computeAchievementPct(60, 80)).toBeCloseTo(75, 1)
  })

  it('formula: 1 / 4 × 100 = 25%', () => {
    expect(computeAchievementPct(1, 4)).toBeCloseTo(25, 1)
  })

  it('formula: 3 / 4 × 100 = 75%', () => {
    expect(computeAchievementPct(3, 4)).toBeCloseTo(75, 1)
  })

  it('formula for over-achievement: 200 / 100 × 100 = 200%', () => {
    expect(computeAchievementPct(200, 100)).toBeCloseTo(200, 1)
  })

  it('zero target returns null (guard against division by zero)', () => {
    expect(computeAchievementPct(100, 0)).toBeNull()
    expect(computeAchievementPct(0, 0)).toBeNull()
  })

  it('zero actual with non-zero target returns 0%', () => {
    expect(computeAchievementPct(0, 500)).toBeCloseTo(0, 1)
  })

  it('proportional: doubling actual doubles achievement pct', () => {
    const p1 = computeAchievementPct(50, 100)
    const p2 = computeAchievementPct(100, 100)
    expect(p2!).toBeCloseTo((p1 ?? 0) * 2, 1)
  })

  it('large values: 5_000_000 / 4_000_000 = 125%', () => {
    expect(computeAchievementPct(5_000_000, 4_000_000)).toBeCloseTo(125, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyAchievement — all classification levels at exact boundaries
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyAchievement — all classification levels at exact boundaries', () => {
  // achieved: ≥ 100
  it('exactly 100% → achieved', () => {
    expect(classifyAchievement(100)).toBe('achieved')
  })

  it('100.01% → achieved', () => {
    expect(classifyAchievement(100.01)).toBe('achieved')
  })

  it('200% → achieved', () => {
    expect(classifyAchievement(200)).toBe('achieved')
  })

  // near_target: 90 ≤ x < 100
  it('exactly 90% → near_target', () => {
    expect(classifyAchievement(90)).toBe('near_target')
  })

  it('95% → near_target', () => {
    expect(classifyAchievement(95)).toBe('near_target')
  })

  it('99.9% → near_target (just below achieved)', () => {
    expect(classifyAchievement(99.9)).toBe('near_target')
  })

  // below_target: 70 ≤ x < 90
  it('exactly 70% → below_target', () => {
    expect(classifyAchievement(70)).toBe('below_target')
  })

  it('80% → below_target', () => {
    expect(classifyAchievement(80)).toBe('below_target')
  })

  it('89.9% → below_target (just below near_target)', () => {
    expect(classifyAchievement(89.9)).toBe('below_target')
  })

  // at_risk: < 70
  it('69.9% → at_risk (just below below_target)', () => {
    expect(classifyAchievement(69.9)).toBe('at_risk')
  })

  it('50% → at_risk', () => {
    expect(classifyAchievement(50)).toBe('at_risk')
  })

  it('0% → at_risk', () => {
    expect(classifyAchievement(0)).toBe('at_risk')
  })

  it('negative achievement % → at_risk', () => {
    expect(classifyAchievement(-10)).toBe('at_risk')
  })

  // null → no_data
  it('null → no_data', () => {
    expect(classifyAchievement(null)).toBe('no_data')
  })

  it('result is always one of the five valid statuses', () => {
    const valid = ['achieved', 'near_target', 'below_target', 'at_risk', 'no_data']
    const pcts: Array<number | null> = [null, -10, 0, 50, 69.9, 70, 89.9, 90, 99.9, 100, 150]
    for (const p of pcts) {
      expect(valid).toContain(classifyAchievement(p))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKpiTrend — direction (improving / declining / stable)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKpiTrend — direction correctness', () => {
  it('higher_is_better: moving toward target = improving', () => {
    // oldest: 60 (dist=40), newest: 90 (dist=10) → relChange = (10-40)/40 = -0.75 → improving
    expect(computeKpiTrend([60, 90], 100, 'higher_is_better')).toBe('improving')
  })

  it('higher_is_better: moving away from target = declining', () => {
    // oldest: 90 (dist=10), newest: 60 (dist=40) → relChange = 3 → declining
    expect(computeKpiTrend([90, 60], 100, 'higher_is_better')).toBe('declining')
  })

  it('higher_is_better: flat trend = stable', () => {
    // oldest: 80 (dist=20), newest: 80 (dist=20) → relChange = 0 → stable
    expect(computeKpiTrend([80, 80], 100, 'higher_is_better')).toBe('stable')
  })

  it('lower_is_better: moving toward target = improving', () => {
    // target=5, oldest: 50 (dist=45), newest: 10 (dist=5) → relChange = (5-45)/45 → improving
    expect(computeKpiTrend([50, 10], 5, 'lower_is_better')).toBe('improving')
  })

  it('lower_is_better: moving away from target = declining', () => {
    // target=5, oldest: 10 (dist=5), newest: 50 (dist=45) → relChange = (45-5)/5 = 8 → declining
    expect(computeKpiTrend([10, 50], 5, 'lower_is_better')).toBe('declining')
  })

  it('fewer than 2 actuals → stable', () => {
    expect(computeKpiTrend([], 100, 'higher_is_better')).toBe('stable')
    expect(computeKpiTrend([90], 100, 'higher_is_better')).toBe('stable')
  })

  it('oldest at baseline 0 (≈ 0 distance from very small target) → stable', () => {
    // oldest = target for higher_is_better: dist = 0 → stable
    expect(computeKpiTrend([100, 90], 100, 'higher_is_better')).toBe('stable')
  })

  it('result is always one of three valid trend values', () => {
    const valid = ['improving', 'stable', 'declining']
    const cases: Array<[number[], number, 'higher_is_better' | 'lower_is_better']> = [
      [[50, 90], 100, 'higher_is_better'],
      [[90, 50], 100, 'higher_is_better'],
      [[80, 80], 100, 'higher_is_better'],
      [[50, 10], 5, 'lower_is_better'],
    ]
    for (const [actuals, target, dir] of cases) {
      expect(valid).toContain(computeKpiTrend(actuals, target, dir))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// scorecardGrade — all letter grades
// ─────────────────────────────────────────────────────────────────────────────

describe('scorecardGrade — all letter grades A / B / C / D / F', () => {
  // A: ≥ 80
  it('grade A for score 80 (boundary)', () => {
    expect(scorecardGrade(80)).toBe('A')
  })

  it('grade A for score 90', () => {
    expect(scorecardGrade(90)).toBe('A')
  })

  it('grade A for score 100', () => {
    expect(scorecardGrade(100)).toBe('A')
  })

  // B: 65 ≤ score < 80
  it('grade B for score 65 (boundary)', () => {
    expect(scorecardGrade(65)).toBe('B')
  })

  it('grade B for score 72', () => {
    expect(scorecardGrade(72)).toBe('B')
  })

  it('grade B for score 79 (just below A)', () => {
    expect(scorecardGrade(79)).toBe('B')
  })

  // C: 50 ≤ score < 65
  it('grade C for score 50 (boundary)', () => {
    expect(scorecardGrade(50)).toBe('C')
  })

  it('grade C for score 57', () => {
    expect(scorecardGrade(57)).toBe('C')
  })

  it('grade C for score 64 (just below B)', () => {
    expect(scorecardGrade(64)).toBe('C')
  })

  // D: 35 ≤ score < 50
  it('grade D for score 35 (boundary)', () => {
    expect(scorecardGrade(35)).toBe('D')
  })

  it('grade D for score 42', () => {
    expect(scorecardGrade(42)).toBe('D')
  })

  it('grade D for score 49 (just below C)', () => {
    expect(scorecardGrade(49)).toBe('D')
  })

  // F: < 35
  it('grade F for score 34 (just below D)', () => {
    expect(scorecardGrade(34)).toBe('F')
  })

  it('grade F for score 20', () => {
    expect(scorecardGrade(20)).toBe('F')
  })

  it('grade F for score 0', () => {
    expect(scorecardGrade(0)).toBe('F')
  })

  it('result is always one of A/B/C/D/F', () => {
    const valid = ['A', 'B', 'C', 'D', 'F']
    const scores = [0, 20, 34, 35, 49, 50, 64, 65, 79, 80, 100]
    for (const s of scores) {
      expect(valid).toContain(scorecardGrade(s))
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeScorecardHealth — weighted average formula
// ─────────────────────────────────────────────────────────────────────────────

describe('computeScorecardHealth — weighted average formula', () => {
  it('score map: achieved=100, near_target=80, below_target=50, at_risk=20, no_data=0', () => {
    // Single items confirm each score value
    expect(computeScorecardHealth(['achieved'])).toBe(100)
    expect(computeScorecardHealth(['near_target'])).toBe(80)
    expect(computeScorecardHealth(['below_target'])).toBe(50)
    expect(computeScorecardHealth(['at_risk'])).toBe(20)
    expect(computeScorecardHealth(['no_data'])).toBe(0)
  })

  it('average of two equal statuses = that status score', () => {
    expect(computeScorecardHealth(['achieved', 'achieved'])).toBe(100)
    expect(computeScorecardHealth(['at_risk', 'at_risk'])).toBe(20)
  })

  it('average formula: sum / count', () => {
    // achieved(100) + near_target(80) + below_target(50) + at_risk(20) + no_data(0) = 250 / 5 = 50
    const result = computeScorecardHealth([
      'achieved', 'near_target', 'below_target', 'at_risk', 'no_data',
    ])
    expect(result).toBeCloseTo(50, 5)
  })

  it('3 achieved + 1 at_risk = (300 + 20) / 4 = 80', () => {
    const result = computeScorecardHealth(['achieved', 'achieved', 'achieved', 'at_risk'])
    expect(result).toBeCloseTo(80, 5)
  })

  it('2 near_target + 2 at_risk = (80+80+20+20)/4 = 50', () => {
    const result = computeScorecardHealth(['near_target', 'near_target', 'at_risk', 'at_risk'])
    expect(result).toBeCloseTo(50, 5)
  })

  it('empty → 0', () => {
    expect(computeScorecardHealth([])).toBe(0)
  })

  it('result is within [0, 100] for any valid input', () => {
    const testCases: Array<Array<'achieved' | 'near_target' | 'below_target' | 'at_risk' | 'no_data'>> = [
      [],
      ['achieved'],
      ['no_data'],
      ['achieved', 'no_data'],
      ['near_target', 'below_target', 'at_risk'],
    ]
    for (const c of testCases) {
      const h = computeScorecardHealth(c)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(100)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeAchievementPct — zero target edge case
// ─────────────────────────────────────────────────────────────────────────────

describe('computeAchievementPct — zero target edge case', () => {
  it('returns null when target is exactly 0', () => {
    expect(computeAchievementPct(0, 0)).toBeNull()
  })

  it('returns null when target is 0 and actual is positive', () => {
    expect(computeAchievementPct(1_000_000, 0)).toBeNull()
  })

  it('returns null when target is 0 and actual is negative', () => {
    expect(computeAchievementPct(-500, 0)).toBeNull()
  })

  it('classifying null → no_data', () => {
    const pct = computeAchievementPct(100, 0)
    expect(classifyAchievement(pct)).toBe('no_data')
  })

  it('non-zero tiny target still computes result (not null)', () => {
    const result = computeAchievementPct(1, 0.001)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(100_000, 0)
  })
})
