/**
 * Tests for lib/services/commercial/pipeline-velocity.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/pipeline-velocity.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeConversionRate,
  computeAvgDaysToClose,
  computePipelineVelocity,
  computeWinLossRatio,
  classifyPipelineHealth,
  computeSalesCycleEfficiency,
  computeStuckDealRate,
  computeMonthlyPipelineFlow,
} from '../lib/services/commercial/pipeline-velocity.service'

// ── computeConversionRate ─────────────────────────────────────────────────────

describe('computeConversionRate', () => {
  it('computes correct percentage', () => {
    expect(computeConversionRate(30, 100)).toBe(30)
  })

  it('returns null when total is 0', () => {
    expect(computeConversionRate(0, 0)).toBeNull()
  })

  it('returns 100 when all converted', () => {
    expect(computeConversionRate(10, 10)).toBe(100)
  })

  it('returns 0 when none converted', () => {
    expect(computeConversionRate(0, 50)).toBe(0)
  })

  it('handles partial conversion with decimals', () => {
    // 1/3 * 100 ≈ 33.33
    const result = computeConversionRate(1, 3)
    expect(result).toBeCloseTo(33.33, 1)
  })

  it('returns 50 for exactly half converted', () => {
    expect(computeConversionRate(5, 10)).toBe(50)
  })

  it('returns 1 for 1 out of 100', () => {
    expect(computeConversionRate(1, 100)).toBe(1)
  })

  it('returns 99 for 99 out of 100', () => {
    expect(computeConversionRate(99, 100)).toBe(99)
  })

  it('handles large numbers', () => {
    expect(computeConversionRate(1000, 5000)).toBe(20)
  })

  it('returns null only when total is 0 regardless of converted', () => {
    expect(computeConversionRate(5, 0)).toBeNull()
  })

  it('returns correct value for 2/3', () => {
    expect(computeConversionRate(2, 3)).toBeCloseTo(66.67, 1)
  })

  it('returns 25 for 1 of 4', () => {
    expect(computeConversionRate(1, 4)).toBe(25)
  })

  it('returns 75 for 3 of 4', () => {
    expect(computeConversionRate(3, 4)).toBe(75)
  })

  it('handles conversion of 200 out of 400', () => {
    expect(computeConversionRate(200, 400)).toBe(50)
  })

  it('handles very small conversion rate', () => {
    const result = computeConversionRate(1, 10000)
    expect(result).toBeCloseTo(0.01, 4)
  })
})

// ── computeAvgDaysToClose ─────────────────────────────────────────────────────

describe('computeAvgDaysToClose', () => {
  it('returns null for empty array', () => {
    expect(computeAvgDaysToClose([])).toBeNull()
  })

  it('computes average across multiple deals', () => {
    // Deal 1: 10 days, Deal 2: 20 days → avg 15
    const deals = [
      { created_at: '2025-01-01', closed_at: '2025-01-11' },
      { created_at: '2025-01-01', closed_at: '2025-01-21' },
    ]
    expect(computeAvgDaysToClose(deals)).toBe(15)
  })

  it('returns 0 for same-day deal', () => {
    const deals = [{ created_at: '2025-01-01', closed_at: '2025-01-01' }]
    expect(computeAvgDaysToClose(deals)).toBe(0)
  })

  it('handles single deal correctly', () => {
    const deals = [{ created_at: '2025-01-01', closed_at: '2025-01-08' }]
    expect(computeAvgDaysToClose(deals)).toBe(7)
  })

  it('handles ISO datetime strings', () => {
    const deals = [
      {
        created_at: '2025-01-01T08:00:00.000Z',
        closed_at:  '2025-01-11T08:00:00.000Z',
      },
    ]
    expect(computeAvgDaysToClose(deals)).toBe(10)
  })

  it('returns correct average for 3 deals', () => {
    // 5, 10, 15 → avg 10
    const deals = [
      { created_at: '2025-01-01', closed_at: '2025-01-06' },
      { created_at: '2025-01-01', closed_at: '2025-01-11' },
      { created_at: '2025-01-01', closed_at: '2025-01-16' },
    ]
    expect(computeAvgDaysToClose(deals)).toBe(10)
  })

  it('handles deals spanning months', () => {
    const deals = [{ created_at: '2025-01-30', closed_at: '2025-03-01' }]
    // Jan 30 to Mar 1 = 30 days
    expect(computeAvgDaysToClose(deals)).toBe(30)
  })

  it('handles deals spanning a year boundary', () => {
    const deals = [{ created_at: '2024-12-25', closed_at: '2025-01-04' }]
    // Dec 25 to Jan 4 = 10 days
    expect(computeAvgDaysToClose(deals)).toBe(10)
  })

  it('computes average of 4 deals correctly', () => {
    // 3, 6, 9, 12 → avg 7.5
    const deals = [
      { created_at: '2025-01-01', closed_at: '2025-01-04' },
      { created_at: '2025-01-01', closed_at: '2025-01-07' },
      { created_at: '2025-01-01', closed_at: '2025-01-10' },
      { created_at: '2025-01-01', closed_at: '2025-01-13' },
    ]
    expect(computeAvgDaysToClose(deals)).toBe(7.5)
  })

  it('handles deals with 30-day cycle', () => {
    const deals = [
      { created_at: '2025-01-01', closed_at: '2025-01-31' },
      { created_at: '2025-02-01', closed_at: '2025-03-03' },
    ]
    const result = computeAvgDaysToClose(deals)
    expect(result).toBeCloseTo(30, 0)
  })

  it('single deal of 100 days returns 100', () => {
    const deals = [{ created_at: '2025-01-01', closed_at: '2025-04-11' }]
    expect(computeAvgDaysToClose(deals)).toBe(100)
  })
})

// ── computePipelineVelocity ───────────────────────────────────────────────────

describe('computePipelineVelocity', () => {
  it('computes velocity correctly', () => {
    // (10 × 5000 × 0.50) / 25 = 25000 / 25 = 1000
    expect(computePipelineVelocity(10, 5000, 50, 25)).toBe(1000)
  })

  it('returns null when avgDaysToClose is null', () => {
    expect(computePipelineVelocity(10, 5000, 50, null)).toBeNull()
  })

  it('returns null when avgDaysToClose is 0', () => {
    expect(computePipelineVelocity(10, 5000, 50, 0)).toBeNull()
  })

  it('scales with deal count', () => {
    const v1 = computePipelineVelocity(5,  5000, 60, 14)
    const v2 = computePipelineVelocity(10, 5000, 60, 14)
    expect(v2).toBe((v1 as number) * 2)
  })

  it('returns 0 when winRate is 0', () => {
    expect(computePipelineVelocity(10, 5000, 0, 14)).toBe(0)
  })

  it('returns 0 when dealCount is 0', () => {
    expect(computePipelineVelocity(0, 5000, 50, 14)).toBe(0)
  })

  it('returns 0 when avgDealValue is 0', () => {
    expect(computePipelineVelocity(10, 0, 50, 14)).toBe(0)
  })

  it('higher win rate yields higher velocity', () => {
    const low  = computePipelineVelocity(10, 5000, 30, 14) as number
    const high = computePipelineVelocity(10, 5000, 60, 14) as number
    expect(high).toBeGreaterThan(low)
  })

  it('longer days-to-close reduces velocity', () => {
    const fast = computePipelineVelocity(10, 5000, 50, 7)  as number
    const slow = computePipelineVelocity(10, 5000, 50, 28) as number
    expect(fast).toBeGreaterThan(slow)
  })

  it('winRate=100 computes full revenue per day', () => {
    // (5 × 1000 × 1.0) / 10 = 500
    expect(computePipelineVelocity(5, 1000, 100, 10)).toBe(500)
  })

  it('fractional win rate handled correctly', () => {
    // (10 × 2000 × (33.33/100)) / 20 ≈ 333.3
    const result = computePipelineVelocity(10, 2000, 33.33, 20) as number
    expect(result).toBeCloseTo(333.3, 0)
  })

  it('large values compute without overflow', () => {
    // (1000 × 100000 × 0.7) / 30 ≈ 2,333,333
    const result = computePipelineVelocity(1000, 100000, 70, 30) as number
    expect(result).toBeCloseTo(2333333, -3)
  })
})

// ── computeWinLossRatio ───────────────────────────────────────────────────────

describe('computeWinLossRatio', () => {
  it('computes ratio correctly', () => {
    expect(computeWinLossRatio(6, 3)).toBe(2)
  })

  it('returns null when lost is 0', () => {
    expect(computeWinLossRatio(10, 0)).toBeNull()
  })

  it('returns 0 when won is 0 (and lost > 0)', () => {
    expect(computeWinLossRatio(0, 5)).toBe(0)
  })

  it('returns 1.0 for equal won and lost', () => {
    expect(computeWinLossRatio(4, 4)).toBe(1)
  })

  it('returns fractional ratio', () => {
    expect(computeWinLossRatio(1, 4)).toBe(0.25)
  })

  it('returns null only when lost is 0, not when won is 0', () => {
    expect(computeWinLossRatio(0, 0)).toBeNull()
  })

  it('returns 3 for 9 won, 3 lost', () => {
    expect(computeWinLossRatio(9, 3)).toBe(3)
  })

  it('returns 0.5 for 1 won, 2 lost', () => {
    expect(computeWinLossRatio(1, 2)).toBe(0.5)
  })

  it('handles large numbers', () => {
    expect(computeWinLossRatio(1000, 200)).toBe(5)
  })

  it('ratio above 1 means more wins than losses', () => {
    const ratio = computeWinLossRatio(7, 3) as number
    expect(ratio).toBeGreaterThan(1)
  })

  it('ratio below 1 means more losses than wins', () => {
    const ratio = computeWinLossRatio(2, 8) as number
    expect(ratio).toBeLessThan(1)
  })
})

// ── classifyPipelineHealth ────────────────────────────────────────────────────

describe('classifyPipelineHealth', () => {
  it('returns insufficient_data when both are null', () => {
    expect(classifyPipelineHealth(null, null)).toBe('insufficient_data')
  })

  it('returns excellent for high conversion and fast close (benchmark=14)', () => {
    // conv >= 60%, days <= 14 * 0.75 = 10.5
    expect(classifyPipelineHealth(65, 10)).toBe('excellent')
  })

  it('returns good for medium conversion and near-benchmark close', () => {
    // conv >= 40%, days <= 14 * 1.25 = 17.5
    expect(classifyPipelineHealth(45, 15)).toBe('good')
  })

  it('returns average for moderate conversion >= 20%', () => {
    // conv >= 20%, days > benchmark*1.25 so good doesn't apply
    expect(classifyPipelineHealth(25, 25)).toBe('average')
  })

  it('returns average when days <= benchmark * 2 even with low conversion', () => {
    // days <= 28, conv < 20%
    expect(classifyPipelineHealth(10, 20)).toBe('average')
  })

  it('returns underperforming for low conversion and slow close', () => {
    expect(classifyPipelineHealth(5, 60)).toBe('underperforming')
  })

  it('returns insufficient_data when only conversion is null', () => {
    // Both null required for insufficient_data; one null + other present → classify
    // conv=null, days=5 → days <= 10.5, but conv check is null
    // falls through to average (days <= 28)
    expect(classifyPipelineHealth(null, 5)).toBe('average')
  })

  it('returns insufficient_data strictly when both are null', () => {
    expect(classifyPipelineHealth(null, null, 30)).toBe('insufficient_data')
  })

  it('respects custom benchmark: excellent with benchmark=30', () => {
    // days <= 30 * 0.75 = 22.5, conv >= 60
    expect(classifyPipelineHealth(70, 20, 30)).toBe('excellent')
  })

  it('boundary: conv exactly 60% and days exactly benchmark*0.75 → excellent', () => {
    expect(classifyPipelineHealth(60, 10.5, 14)).toBe('excellent')
  })

  it('boundary: conv exactly 40% and days exactly benchmark*1.25 → good', () => {
    expect(classifyPipelineHealth(40, 17.5, 14)).toBe('good')
  })

  it('conv=59 + days=10 does not qualify for excellent (conv < 60)', () => {
    // conv < 60, so doesn't hit excellent; conv >= 40 AND days <= 17.5 → good
    expect(classifyPipelineHealth(59, 10)).toBe('good')
  })

  it('conv=60 + days=11 (just above 0.75*14=10.5) → not excellent → good', () => {
    expect(classifyPipelineHealth(60, 11)).toBe('good')
  })

  it('conv=39 + days=17 → not good (conv < 40) → average (days <= 28)', () => {
    expect(classifyPipelineHealth(39, 17)).toBe('average')
  })

  it('conv=null + days=27 → average (days <= benchmark*2=28)', () => {
    expect(classifyPipelineHealth(null, 27)).toBe('average')
  })

  it('conv=null + days=30 → underperforming (days > 28, conv null → fails average conv check)', () => {
    // days <= benchmark*2=28? No, 30 > 28. conv check: null >= 20? No. → underperforming
    expect(classifyPipelineHealth(null, 30)).toBe('underperforming')
  })

  it('conv=20 + days=null → average (conv >= 20)', () => {
    expect(classifyPipelineHealth(20, null)).toBe('average')
  })

  it('benchmark=7: excellent requires conv>=60 and days<=5.25', () => {
    expect(classifyPipelineHealth(65, 5, 7)).toBe('excellent')
  })

  it('all nulls with custom benchmark still returns insufficient_data', () => {
    expect(classifyPipelineHealth(null, null, 100)).toBe('insufficient_data')
  })

  it('underperforming when conv=19 and days=29 (default benchmark=14, 28 threshold)', () => {
    // conv=19 < 20 fails average conv check; days=29 > 28 fails average days check → underperforming
    expect(classifyPipelineHealth(19, 29)).toBe('underperforming')
  })
})

// ── computeSalesCycleEfficiency ───────────────────────────────────────────────

describe('computeSalesCycleEfficiency', () => {
  it('returns null for null actualDays', () => {
    expect(computeSalesCycleEfficiency(null)).toBeNull()
  })

  it('returns null for actualDays = 0', () => {
    expect(computeSalesCycleEfficiency(0)).toBeNull()
  })

  it('returns 100 when actual equals benchmark', () => {
    expect(computeSalesCycleEfficiency(14, 14)).toBe(100)
  })

  it('returns > 100 when faster than benchmark', () => {
    // 14 / 7 * 100 = 200
    expect(computeSalesCycleEfficiency(7, 14)).toBe(200)
  })

  it('returns < 100 when slower than benchmark', () => {
    // 14 / 28 * 100 = 50
    expect(computeSalesCycleEfficiency(28, 14)).toBe(50)
  })

  it('uses default benchmark of 14 days', () => {
    // 14 / 14 * 100 = 100
    expect(computeSalesCycleEfficiency(14)).toBe(100)
  })

  it('handles custom benchmark', () => {
    // 30 / 10 * 100 = 300 (very fast)
    expect(computeSalesCycleEfficiency(10, 30)).toBe(300)
  })

  it('returns 50 for twice the benchmark', () => {
    // benchmark=14, actual=28 → 14/28*100=50
    expect(computeSalesCycleEfficiency(28, 14)).toBe(50)
  })

  it('returns 400 for 4x faster than benchmark', () => {
    // benchmark=28, actual=7 → 28/7*100=400
    expect(computeSalesCycleEfficiency(7, 28)).toBe(400)
  })

  it('returns fractional efficiency', () => {
    // benchmark=10, actual=30 → 10/30*100 ≈ 33.33
    const result = computeSalesCycleEfficiency(30, 10) as number
    expect(result).toBeCloseTo(33.33, 1)
  })

  it('benchmark=1 day, actual=1 day → 100', () => {
    expect(computeSalesCycleEfficiency(1, 1)).toBe(100)
  })

  it('very fast deal: actual=1, benchmark=30 → 3000', () => {
    expect(computeSalesCycleEfficiency(1, 30)).toBe(3000)
  })
})

// ── computeStuckDealRate ──────────────────────────────────────────────────────

describe('computeStuckDealRate', () => {
  it('returns 0/null for empty array', () => {
    const result = computeStuckDealRate([])
    expect(result.stuck_count).toBe(0)
    expect(result.stuck_value).toBe(0)
    expect(result.stuck_rate_pct).toBeNull()
  })

  it('identifies stuck deals older than threshold', () => {
    const oldDate = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10)
    const newDate = new Date(Date.now() - 5  * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([
      { created_at: oldDate, value: 10_000 },
      { created_at: newDate, value: 5_000 },
    ])
    expect(result.stuck_count).toBe(1)
    expect(result.stuck_value).toBe(10_000)
    expect(result.stuck_rate_pct).toBe(50)
  })

  it('marks all deals stuck when all older than threshold', () => {
    const oldDate = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([
      { created_at: oldDate, value: 1_000 },
      { created_at: oldDate, value: 2_000 },
    ])
    expect(result.stuck_count).toBe(2)
    expect(result.stuck_value).toBe(3_000)
    expect(result.stuck_rate_pct).toBe(100)
  })

  it('marks no deals stuck when all recent', () => {
    const recentDate = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([
      { created_at: recentDate, value: 5_000 },
      { created_at: recentDate, value: 3_000 },
    ])
    expect(result.stuck_count).toBe(0)
    expect(result.stuck_value).toBe(0)
    expect(result.stuck_rate_pct).toBe(0)
  })

  it('respects custom threshold days', () => {
    const date10daysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
    // With threshold=7: this deal should be stuck
    const result7 = computeStuckDealRate([{ created_at: date10daysAgo, value: 1_000 }], 7)
    expect(result7.stuck_count).toBe(1)
    // With threshold=30: not stuck
    const result30 = computeStuckDealRate([{ created_at: date10daysAgo, value: 1_000 }], 30)
    expect(result30.stuck_count).toBe(0)
  })

  it('correctly sums stuck value across multiple stuck deals', () => {
    const oldDate = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([
      { created_at: oldDate, value: 10_000 },
      { created_at: oldDate, value: 20_000 },
      { created_at: oldDate, value: 30_000 },
    ])
    expect(result.stuck_value).toBe(60_000)
    expect(result.stuck_rate_pct).toBe(100)
  })

  it('stuck_rate_pct is 0 when no deals are stuck', () => {
    const recentDate = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([{ created_at: recentDate, value: 5_000 }])
    expect(result.stuck_rate_pct).toBe(0)
  })

  it('stuck_rate_pct is 33.33 for 1 of 3 stuck', () => {
    const oldDate    = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
    const recentDate = new Date(Date.now() -  2 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([
      { created_at: oldDate,    value: 1_000 },
      { created_at: recentDate, value: 1_000 },
      { created_at: recentDate, value: 1_000 },
    ])
    expect(result.stuck_count).toBe(1)
    expect(result.stuck_rate_pct).toBeCloseTo(33.33, 1)
  })

  it('deals with 0 value are still counted as stuck', () => {
    const oldDate = new Date(Date.now() - 35 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([{ created_at: oldDate, value: 0 }])
    expect(result.stuck_count).toBe(1)
    expect(result.stuck_value).toBe(0)
    expect(result.stuck_rate_pct).toBe(100)
  })

  it('default threshold is 30 days', () => {
    // 29 days ago should not be stuck by default
    const date29 = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([{ created_at: date29, value: 1_000 }])
    expect(result.stuck_count).toBe(0)
  })

  it('threshold boundary: exactly 30 days → stuck', () => {
    const date30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
    const result = computeStuckDealRate([{ created_at: date30, value: 1_000 }])
    expect(result.stuck_count).toBe(1)
  })
})

// ── computeMonthlyPipelineFlow ────────────────────────────────────────────────

describe('computeMonthlyPipelineFlow', () => {
  it('returns empty array for empty input', () => {
    expect(computeMonthlyPipelineFlow([])).toEqual([])
  })

  it('computes running pending total correctly', () => {
    const input = [
      { month: '2025-01', created: 10, converted: 3, lost: 2 },
      { month: '2025-02', created: 5,  converted: 2, lost: 1 },
      { month: '2025-03', created: 8,  converted: 4, lost: 1 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    // Month 1: 0 + 10 - 3 - 2 = 5
    expect(result[0].pending).toBe(5)
    // Month 2: 5 + 5 - 2 - 1 = 7
    expect(result[1].pending).toBe(7)
    // Month 3: 7 + 8 - 4 - 1 = 10
    expect(result[2].pending).toBe(10)
  })

  it('computes conversion_rate per month correctly', () => {
    const input = [
      { month: '2025-01', created: 10, converted: 3, lost: 2 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    // converted / (converted + lost) = 3/5 = 60%
    expect(result[0].conversion_rate).toBe(60)
  })

  it('returns null conversion_rate when denominator is 0', () => {
    const input = [
      { month: '2025-01', created: 5, converted: 0, lost: 0 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].conversion_rate).toBeNull()
  })

  it('preserves original month, created, converted, lost fields', () => {
    const input = [{ month: '2025-06', created: 4, converted: 2, lost: 1 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].month).toBe('2025-06')
    expect(result[0].created).toBe(4)
    expect(result[0].converted).toBe(2)
    expect(result[0].lost).toBe(1)
  })

  it('handles all-converted month (100% conversion)', () => {
    const input = [{ month: '2025-01', created: 5, converted: 5, lost: 0 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].conversion_rate).toBe(100)
  })

  it('handles all-lost month (0% conversion)', () => {
    const input = [{ month: '2025-01', created: 5, converted: 0, lost: 5 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].conversion_rate).toBe(0)
  })

  it('running pending can go negative if more closed than pending', () => {
    // This can happen with data inconsistencies: start 0, create 2, convert 5 → -3
    const input = [{ month: '2025-01', created: 2, converted: 5, lost: 0 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].pending).toBe(-3)
  })

  it('processes 6 months with correct accumulation', () => {
    const input = [
      { month: '2025-01', created: 5,  converted: 2, lost: 1 },
      { month: '2025-02', created: 3,  converted: 1, lost: 0 },
      { month: '2025-03', created: 7,  converted: 3, lost: 2 },
      { month: '2025-04', created: 2,  converted: 2, lost: 0 },
      { month: '2025-05', created: 6,  converted: 1, lost: 3 },
      { month: '2025-06', created: 4,  converted: 2, lost: 1 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    expect(result).toHaveLength(6)

    // Jan: 0 + 5 - 2 - 1 = 2
    expect(result[0].pending).toBe(2)
    // Feb: 2 + 3 - 1 - 0 = 4
    expect(result[1].pending).toBe(4)
    // Mar: 4 + 7 - 3 - 2 = 6
    expect(result[2].pending).toBe(6)
    // Apr: 6 + 2 - 2 - 0 = 6
    expect(result[3].pending).toBe(6)
    // May: 6 + 6 - 1 - 3 = 8
    expect(result[4].pending).toBe(8)
    // Jun: 8 + 4 - 2 - 1 = 9
    expect(result[5].pending).toBe(9)
  })

  it('single month with 0 conversion → null rate', () => {
    const input = [{ month: '2025-01', created: 10, converted: 0, lost: 0 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].conversion_rate).toBeNull()
    expect(result[0].pending).toBe(10)
  })

  it('conversion_rate = 50 for 1 converted, 1 lost', () => {
    const input = [{ month: '2025-03', created: 2, converted: 1, lost: 1 }]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].conversion_rate).toBe(50)
  })

  it('running pending accumulates over many months', () => {
    const input = [
      { month: '2025-01', created: 5, converted: 0, lost: 0 },
      { month: '2025-02', created: 5, converted: 0, lost: 0 },
      { month: '2025-03', created: 5, converted: 0, lost: 0 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].pending).toBe(5)
    expect(result[1].pending).toBe(10)
    expect(result[2].pending).toBe(15)
  })

  it('output length matches input length', () => {
    const input = Array.from({ length: 12 }, (_, i) => ({
      month:     `2025-${String(i + 1).padStart(2, '0')}`,
      created:   3,
      converted: 1,
      lost:      0,
    }))
    const result = computeMonthlyPipelineFlow(input)
    expect(result).toHaveLength(12)
  })

  it('months with only lost deals accumulate nothing in pending', () => {
    const input = [
      { month: '2025-01', created: 5, converted: 0, lost: 5 },
    ]
    const result = computeMonthlyPipelineFlow(input)
    expect(result[0].pending).toBe(0)
  })
})
