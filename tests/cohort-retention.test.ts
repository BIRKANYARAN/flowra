/**
 * Cohort Retention Service — pure-math tests (60+ cases)
 *
 * Scope (no DB):
 *   • computeRetentionRate()
 *   • computeChurnRate()
 *   • computeAvgCohortSize()
 *   • computeAvg3mRetention()
 *   • classifyRetentionHealth()
 *
 * Run with: npx vitest run tests/cohort-retention.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeRetentionRate,
  computeChurnRate,
  computeAvgCohortSize,
  computeAvg3mRetention,
  classifyRetentionHealth,
} from '../lib/services/commercial/cohort-retention.service'

// ── computeRetentionRate ──────────────────────────────────────────────────────

describe('computeRetentionRate', () => {
  it('returns 50 for 50/100', () => {
    expect(computeRetentionRate(50, 100)).toBe(50)
  })

  it('returns 0 when cohortSize is 0', () => {
    expect(computeRetentionRate(0, 0)).toBe(0)
  })

  it('returns 0 when cohortSize is 0 even with non-zero active', () => {
    expect(computeRetentionRate(10, 0)).toBe(0)
  })

  it('returns 100 for full retention (100/100)', () => {
    expect(computeRetentionRate(100, 100)).toBe(100)
  })

  it('returns 30 for 3/10', () => {
    expect(computeRetentionRate(3, 10)).toBe(30)
  })

  it('returns 0 for 0 active in period', () => {
    expect(computeRetentionRate(0, 50)).toBe(0)
  })

  it('returns 10 for 1/10', () => {
    expect(computeRetentionRate(1, 10)).toBe(10)
  })

  it('returns 25 for 25/100', () => {
    expect(computeRetentionRate(25, 100)).toBe(25)
  })

  it('returns 75 for 75/100', () => {
    expect(computeRetentionRate(75, 100)).toBe(75)
  })

  it('handles large numbers correctly', () => {
    expect(computeRetentionRate(5000, 10000)).toBe(50)
  })

  it('returns fractional value for non-divisible numbers (1/3)', () => {
    const result = computeRetentionRate(1, 3)
    expect(result).toBeCloseTo(33.333, 2)
  })

  it('returns 200 for over-retention edge case (2x cohort active)', () => {
    // Not clamped by the function — returns raw ratio * 100
    expect(computeRetentionRate(200, 100)).toBe(200)
  })

  it('returns correct value for small cohort (2 of 4)', () => {
    expect(computeRetentionRate(2, 4)).toBe(50)
  })
})

// ── computeChurnRate ──────────────────────────────────────────────────────────

describe('computeChurnRate', () => {
  it('returns 50 for 50% retention', () => {
    expect(computeChurnRate(50)).toBe(50)
  })

  it('returns 100 for 0% retention (everyone churned)', () => {
    expect(computeChurnRate(0)).toBe(100)
  })

  it('returns 0 for 100% retention (no churn)', () => {
    expect(computeChurnRate(100)).toBe(0)
  })

  it('returns 30 for 70% retention', () => {
    expect(computeChurnRate(70)).toBe(30)
  })

  it('returns 60 for 40% retention', () => {
    expect(computeChurnRate(40)).toBe(60)
  })

  it('returns 80 for 20% retention', () => {
    expect(computeChurnRate(20)).toBe(80)
  })

  it('returns 75 for 25% retention', () => {
    expect(computeChurnRate(25)).toBe(75)
  })

  it('handles fractional retention (33.33 → ~66.67 churn)', () => {
    expect(computeChurnRate(33.33)).toBeCloseTo(66.67, 1)
  })

  it('is always 100 - retentionRate', () => {
    for (const r of [0, 10, 20, 33, 50, 60, 75, 90, 100]) {
      expect(computeChurnRate(r)).toBe(100 - r)
    }
  })

  it('returns 55 for 45% retention', () => {
    expect(computeChurnRate(45)).toBe(55)
  })
})

// ── computeAvgCohortSize ──────────────────────────────────────────────────────

describe('computeAvgCohortSize', () => {
  it('returns 0 for empty array', () => {
    expect(computeAvgCohortSize([])).toBe(0)
  })

  it('returns the single value for a one-item array', () => {
    expect(computeAvgCohortSize([{ size: 42 }])).toBe(42)
  })

  it('returns avg for two items (50+100 → 75)', () => {
    expect(computeAvgCohortSize([{ size: 50 }, { size: 100 }])).toBe(75)
  })

  it('returns avg for three items (10+20+30 → 20)', () => {
    expect(computeAvgCohortSize([{ size: 10 }, { size: 20 }, { size: 30 }])).toBe(20)
  })

  it('handles all zeros', () => {
    expect(computeAvgCohortSize([{ size: 0 }, { size: 0 }])).toBe(0)
  })

  it('handles fractional averages (1+2 → 1.5)', () => {
    expect(computeAvgCohortSize([{ size: 1 }, { size: 2 }])).toBe(1.5)
  })

  it('handles large cohorts correctly', () => {
    expect(computeAvgCohortSize([{ size: 1000 }, { size: 2000 }, { size: 3000 }])).toBe(2000)
  })

  it('ignores extra properties on objects', () => {
    const cohorts = [
      { size: 100, cohort_month: '2024-01' },
      { size: 200, cohort_month: '2024-02' },
    ] as Array<{ size: number }>
    expect(computeAvgCohortSize(cohorts)).toBe(150)
  })

  it('handles single item with size 0', () => {
    expect(computeAvgCohortSize([{ size: 0 }])).toBe(0)
  })

  it('computes correct average for mixed values (5+15+10+20 → 12.5)', () => {
    expect(
      computeAvgCohortSize([{ size: 5 }, { size: 15 }, { size: 10 }, { size: 20 }])
    ).toBe(12.5)
  })
})

// ── computeAvg3mRetention ─────────────────────────────────────────────────────

describe('computeAvg3mRetention', () => {
  it('returns 50 for [100,60,50,40] (avg of 60+50+40)', () => {
    expect(computeAvg3mRetention([100, 60, 50, 40])).toBe(50)
  })

  it('returns 60 for [100,60] — only one period beyond acquisition', () => {
    expect(computeAvg3mRetention([100, 60])).toBe(60)
  })

  it('returns 0 for only acquisition period [100]', () => {
    expect(computeAvg3mRetention([100])).toBe(0)
  })

  it('returns 0 for empty array', () => {
    expect(computeAvg3mRetention([])).toBe(0)
  })

  it('ignores periods beyond index 3 when 5 values provided', () => {
    // [100, 60, 50, 40, 10] — should still use only indexes 1,2,3
    expect(computeAvg3mRetention([100, 60, 50, 40, 10])).toBe(50)
  })

  it('returns avg of indexes 1,2 when only 3 values provided (two beyond acq)', () => {
    expect(computeAvg3mRetention([100, 80, 60])).toBeCloseTo(70, 5)
  })

  it('ignores periods beyond index 3 when 6 values provided', () => {
    expect(computeAvg3mRetention([100, 60, 50, 40, 30, 20])).toBe(50)
  })

  it('handles 0 values in retention periods (total churn after acquisition)', () => {
    expect(computeAvg3mRetention([100, 0, 0, 0])).toBe(0)
  })

  it('returns 100 if all follow-up periods are 100% retention', () => {
    expect(computeAvg3mRetention([100, 100, 100, 100])).toBe(100)
  })

  it('returns 50 when only index 1 is 50 and no more periods', () => {
    expect(computeAvg3mRetention([100, 50])).toBe(50)
  })

  it('handles fractional averages correctly', () => {
    // (30 + 60 + 90) / 3 = 60
    expect(computeAvg3mRetention([100, 30, 60, 90])).toBe(60)
  })

  it('returns avg of first 3 non-acquisition periods only (not period 4)', () => {
    // [100, 80, 70, 60, 50] — uses 80,70,60 → 70
    expect(computeAvg3mRetention([100, 80, 70, 60, 50])).toBeCloseTo(70, 5)
  })
})

// ── classifyRetentionHealth ───────────────────────────────────────────────────

describe('classifyRetentionHealth', () => {
  it('returns "strong" at exactly 60', () => {
    expect(classifyRetentionHealth(60)).toBe('strong')
  })

  it('returns "strong" above 60 (e.g. 75)', () => {
    expect(classifyRetentionHealth(75)).toBe('strong')
  })

  it('returns "strong" at 100', () => {
    expect(classifyRetentionHealth(100)).toBe('strong')
  })

  it('returns "good" at 59.9 (just below strong threshold)', () => {
    expect(classifyRetentionHealth(59.9)).toBe('good')
  })

  it('returns "good" at exactly 40', () => {
    expect(classifyRetentionHealth(40)).toBe('good')
  })

  it('returns "good" at 50', () => {
    expect(classifyRetentionHealth(50)).toBe('good')
  })

  it('returns "fair" at 39.9 (just below good threshold)', () => {
    expect(classifyRetentionHealth(39.9)).toBe('fair')
  })

  it('returns "fair" at exactly 20', () => {
    expect(classifyRetentionHealth(20)).toBe('fair')
  })

  it('returns "fair" at 30', () => {
    expect(classifyRetentionHealth(30)).toBe('fair')
  })

  it('returns "weak" at 19.9 (just below fair threshold)', () => {
    expect(classifyRetentionHealth(19.9)).toBe('weak')
  })

  it('returns "weak" at 0', () => {
    expect(classifyRetentionHealth(0)).toBe('weak')
  })

  it('returns "weak" at 1', () => {
    expect(classifyRetentionHealth(1)).toBe('weak')
  })

  it('returns "weak" at 10', () => {
    expect(classifyRetentionHealth(10)).toBe('weak')
  })

  it('boundary: 60.1 is "strong"', () => {
    expect(classifyRetentionHealth(60.1)).toBe('strong')
  })

  it('boundary: 40.1 is "good"', () => {
    expect(classifyRetentionHealth(40.1)).toBe('good')
  })

  it('boundary: 20.1 is "fair"', () => {
    expect(classifyRetentionHealth(20.1)).toBe('fair')
  })

  it('returns one of the four valid categories for any input', () => {
    const valid = new Set(['strong', 'good', 'fair', 'weak'])
    for (const pct of [0, 10, 19.9, 20, 30, 39.9, 40, 50, 59.9, 60, 80, 100]) {
      expect(valid.has(classifyRetentionHealth(pct))).toBe(true)
    }
  })
})

// ── Integration-style: computeRetentionRate + classifyRetentionHealth ─────────

describe('computeRetentionRate → classifyRetentionHealth pipeline', () => {
  it('60 active / 100 cohort → 60% → strong', () => {
    const rate = computeRetentionRate(60, 100)
    expect(classifyRetentionHealth(rate)).toBe('strong')
  })

  it('50 active / 100 cohort → 50% → good', () => {
    const rate = computeRetentionRate(50, 100)
    expect(classifyRetentionHealth(rate)).toBe('good')
  })

  it('30 active / 100 cohort → 30% → fair', () => {
    const rate = computeRetentionRate(30, 100)
    expect(classifyRetentionHealth(rate)).toBe('fair')
  })

  it('10 active / 100 cohort → 10% → weak', () => {
    const rate = computeRetentionRate(10, 100)
    expect(classifyRetentionHealth(rate)).toBe('weak')
  })

  it('0 cohort size → 0% → weak', () => {
    const rate = computeRetentionRate(0, 0)
    expect(classifyRetentionHealth(rate)).toBe('weak')
  })
})

// ── Integration: computeChurnRate validates with computeRetentionRate ─────────

describe('computeChurnRate + computeRetentionRate consistency', () => {
  it('churn + retention = 100 for full cohort', () => {
    const retention = computeRetentionRate(75, 100)
    const churn = computeChurnRate(retention)
    expect(retention + churn).toBeCloseTo(100, 10)
  })

  it('churn + retention = 100 for partial cohort', () => {
    const retention = computeRetentionRate(1, 3)
    const churn = computeChurnRate(retention)
    expect(retention + churn).toBeCloseTo(100, 10)
  })

  it('churn + retention = 100 for zero retention', () => {
    const retention = computeRetentionRate(0, 50)
    const churn = computeChurnRate(retention)
    expect(retention + churn).toBe(100)
  })
})

// ── computeAvg3mRetention edge cases ─────────────────────────────────────────

describe('computeAvg3mRetention — additional edge cases', () => {
  it('12-period array — still only uses periods 1-3', () => {
    // All later periods have 0% but should not affect avg
    const rates = [100, 80, 70, 60, 10, 5, 3, 2, 1, 0, 0, 0]
    // avg = (80+70+60)/3 = 70
    expect(computeAvg3mRetention(rates)).toBeCloseTo(70, 2)
  })

  it('period 0 = 100 always (acquisition month), does not influence avg', () => {
    const rates = [100, 50]
    const avg = computeAvg3mRetention(rates)
    expect(avg).toBe(50)
    expect(avg).not.toBe(75)  // would be 75 if period 0 included
  })

  it('single-element array (acquisition only) returns 0', () => {
    expect(computeAvg3mRetention([100])).toBe(0)
  })

  it('all periods have same retention → returns that value', () => {
    // [100, 55, 55, 55] → 55
    expect(computeAvg3mRetention([100, 55, 55, 55])).toBe(55)
  })

  it('two period array asymmetry does not include period 0', () => {
    // [100, 45] → slice(1,4) = [45] → avg = 45
    expect(computeAvg3mRetention([100, 45])).toBe(45)
  })

  it('result maps to classifyRetentionHealth correctly when strong', () => {
    const avg = computeAvg3mRetention([100, 70, 65, 60])
    // avg = (70+65+60)/3 ≈ 65 → strong
    expect(classifyRetentionHealth(avg)).toBe('strong')
  })

  it('result maps to classifyRetentionHealth correctly when weak', () => {
    const avg = computeAvg3mRetention([100, 15, 12, 10])
    // avg ≈ 12.3 → weak
    expect(classifyRetentionHealth(avg)).toBe('weak')
  })
})

// ── computeAvgCohortSize — additional edge cases ───────────────────────────────

describe('computeAvgCohortSize — additional cases', () => {
  it('six-cohort lookback — correct average', () => {
    const cohorts = [
      { size: 10 }, { size: 20 }, { size: 30 },
      { size: 40 }, { size: 50 }, { size: 60 },
    ]
    // avg = (10+20+30+40+50+60)/6 = 35
    expect(computeAvgCohortSize(cohorts)).toBe(35)
  })

  it('single cohort with very large size', () => {
    expect(computeAvgCohortSize([{ size: 100_000 }])).toBe(100_000)
  })

  it('mixed-size cohorts average does not round', () => {
    // (10+11)/2 = 10.5
    expect(computeAvgCohortSize([{ size: 10 }, { size: 11 }])).toBe(10.5)
  })
})

// ── retention + churn always sum to 100 ──────────────────────────────────────

describe('retention + churn complement property', () => {
  it('sum is exactly 100 at 0% retention', () => {
    const r = computeRetentionRate(0, 100)
    expect(r + computeChurnRate(r)).toBe(100)
  })

  it('sum is exactly 100 at 50% retention', () => {
    const r = computeRetentionRate(50, 100)
    expect(r + computeChurnRate(r)).toBe(100)
  })

  it('sum is exactly 100 at 100% retention', () => {
    const r = computeRetentionRate(100, 100)
    expect(r + computeChurnRate(r)).toBe(100)
  })

  it('sum is 100 for fractional retention (1/3 cohort)', () => {
    const r = computeRetentionRate(1, 3)
    expect(r + computeChurnRate(r)).toBeCloseTo(100, 10)
  })

  it('sum is 100 for any retention value passed directly to computeChurnRate', () => {
    for (const pct of [0, 10, 20, 33.33, 50, 60, 75, 90, 100]) {
      expect(pct + computeChurnRate(pct)).toBeCloseTo(100, 10)
    }
  })
})

// ── computeRetentionRate — 0%, 50%, 100% explicit ────────────────────────────

describe('computeRetentionRate — explicit 0%, 50%, 100% values', () => {
  it('0 active out of 100 → 0%', () => {
    expect(computeRetentionRate(0, 100)).toBe(0)
  })

  it('50 active out of 100 → 50%', () => {
    expect(computeRetentionRate(50, 100)).toBe(50)
  })

  it('100 active out of 100 → 100%', () => {
    expect(computeRetentionRate(100, 100)).toBe(100)
  })

  it('zero cohort size always returns 0', () => {
    expect(computeRetentionRate(0, 0)).toBe(0)
    expect(computeRetentionRate(5, 0)).toBe(0)
    expect(computeRetentionRate(100, 0)).toBe(0)
  })
})

// ── computeAvgCohortSize — formula verification ───────────────────────────────

describe('computeAvgCohortSize — formula sum/count', () => {
  it('formula: sum of sizes divided by count', () => {
    // (100 + 200 + 300) / 3 = 200
    expect(computeAvgCohortSize([{ size: 100 }, { size: 200 }, { size: 300 }])).toBe(200)
  })

  it('single cohort: avg equals that cohort size', () => {
    expect(computeAvgCohortSize([{ size: 77 }])).toBe(77)
  })

  it('two equal cohorts: avg equals each individual size', () => {
    expect(computeAvgCohortSize([{ size: 50 }, { size: 50 }])).toBe(50)
  })

  it('returns 0 for empty array', () => {
    expect(computeAvgCohortSize([])).toBe(0)
  })
})

// ── computeAvg3mRetention — fewer than 3 periods ─────────────────────────────

describe('computeAvg3mRetention — fewer than 3 follow-up periods', () => {
  it('no follow-up periods (only offset 0): returns 0', () => {
    expect(computeAvg3mRetention([100])).toBe(0)
  })

  it('one follow-up period: avg equals that period value', () => {
    expect(computeAvg3mRetention([100, 70])).toBe(70)
  })

  it('two follow-up periods: avg of indexes 1 and 2', () => {
    // (60 + 40) / 2 = 50
    expect(computeAvg3mRetention([100, 60, 40])).toBeCloseTo(50, 5)
  })

  it('three follow-up periods: avg of indexes 1, 2, 3', () => {
    // (90 + 60 + 30) / 3 = 60
    expect(computeAvg3mRetention([100, 90, 60, 30])).toBe(60)
  })

  it('period 0 value of 100 does not affect the avg', () => {
    const withHighAcq = computeAvg3mRetention([100, 40])
    const withLowAcq  = computeAvg3mRetention([0,   40])
    // Both should yield 40 — period 0 is always excluded
    expect(withHighAcq).toBe(40)
    expect(withLowAcq).toBe(40)
  })
})

// ── classifyRetentionHealth — all levels with exact boundaries ────────────────

describe('classifyRetentionHealth — all levels with exact boundaries', () => {
  it('exactly 60 → strong', () => {
    expect(classifyRetentionHealth(60)).toBe('strong')
  })

  it('60.0001 → strong', () => {
    expect(classifyRetentionHealth(60.0001)).toBe('strong')
  })

  it('100 → strong (maximum)', () => {
    expect(classifyRetentionHealth(100)).toBe('strong')
  })

  it('59.9999 → good (just below strong)', () => {
    expect(classifyRetentionHealth(59.9999)).toBe('good')
  })

  it('exactly 40 → good', () => {
    expect(classifyRetentionHealth(40)).toBe('good')
  })

  it('50 → good (midpoint)', () => {
    expect(classifyRetentionHealth(50)).toBe('good')
  })

  it('39.9999 → fair (just below good)', () => {
    expect(classifyRetentionHealth(39.9999)).toBe('fair')
  })

  it('exactly 20 → fair', () => {
    expect(classifyRetentionHealth(20)).toBe('fair')
  })

  it('30 → fair (midpoint)', () => {
    expect(classifyRetentionHealth(30)).toBe('fair')
  })

  it('19.9999 → weak (just below fair)', () => {
    expect(classifyRetentionHealth(19.9999)).toBe('weak')
  })

  it('0 → weak (minimum)', () => {
    expect(classifyRetentionHealth(0)).toBe('weak')
  })

  it('10 → weak', () => {
    expect(classifyRetentionHealth(10)).toBe('weak')
  })
})
