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
})
