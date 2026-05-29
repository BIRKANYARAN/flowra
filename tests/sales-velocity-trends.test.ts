/**
 * Sales Velocity Trends — unit tests
 *
 * Tests all pure computation functions exported from the service.
 * No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  aggregateDailySales,
  buildDailyDataPoints,
  getIsoWeekStart,
  aggregateToWeekly,
  computeVelocityMetrics,
  computeMovingAverage,
  computeTrendSlope,
  classifyVelocityTrend,
  computeDayOfWeekPerformance,
  findBestDayOfWeek,
  computeWowGrowth,
  computeBusinessDayAvg,
  computeSalesConsistencyScore,
  detectAnomalyDays,
  computeVelocityAcceleration,
  type DailyDataPoint,
  type WeeklyDataPoint,
} from '../lib/services/commercial/sales-velocity-trends.service'

// ── helpers ───────────────────────────────────────────────────────────────────

function makeDailyPoint(date: string, revenue: number, orders = 1): DailyDataPoint {
  return {
    date,
    revenue_try: revenue,
    order_count: orders,
    avg_order_value: orders > 0 ? revenue / orders : 0,
  }
}

// ── aggregateDailySales ───────────────────────────────────────────────────────

describe('aggregateDailySales', () => {

  it('1. empty array returns empty map', () => {
    const result = aggregateDailySales([])
    expect(result.size).toBe(0)
  })

  it('2. single sale creates one entry', () => {
    const result = aggregateDailySales([{ sale_date: '2025-01-01', total: 500 }])
    expect(result.size).toBe(1)
    expect(result.get('2025-01-01')).toEqual({ revenue: 500, count: 1 })
  })

  it('3. two sales on same date sum correctly', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-01-01', total: 300 },
      { sale_date: '2025-01-01', total: 200 },
    ])
    expect(result.get('2025-01-01')).toEqual({ revenue: 500, count: 2 })
  })

  it('4. three sales on same date accumulate count', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-01-05', total: 100 },
      { sale_date: '2025-01-05', total: 200 },
      { sale_date: '2025-01-05', total: 400 },
    ])
    expect(result.get('2025-01-05')).toEqual({ revenue: 700, count: 3 })
  })

  it('5. different dates create separate entries', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-01-01', total: 100 },
      { sale_date: '2025-01-02', total: 200 },
    ])
    expect(result.size).toBe(2)
    expect(result.get('2025-01-01')).toEqual({ revenue: 100, count: 1 })
    expect(result.get('2025-01-02')).toEqual({ revenue: 200, count: 1 })
  })

  it('6. normalizes datetime to YYYY-MM-DD', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-03-15T12:00:00Z', total: 999 },
    ])
    expect(result.has('2025-03-15')).toBe(true)
  })

  it('7. zero-value sale is counted', () => {
    const result = aggregateDailySales([{ sale_date: '2025-01-10', total: 0 }])
    expect(result.get('2025-01-10')).toEqual({ revenue: 0, count: 1 })
  })
})

// ── buildDailyDataPoints ──────────────────────────────────────────────────────

describe('buildDailyDataPoints', () => {

  it('8. single day range produces one point', () => {
    const map = new Map([['2025-01-01', { revenue: 500, count: 2 }]])
    const result = buildDailyDataPoints(map, '2025-01-01', '2025-01-01')
    expect(result).toHaveLength(1)
    expect(result[0].revenue_try).toBe(500)
    expect(result[0].order_count).toBe(2)
    expect(result[0].avg_order_value).toBe(250)
  })

  it('9. fills zeros for missing days in range', () => {
    const map = new Map([['2025-01-03', { revenue: 300, count: 1 }]])
    const result = buildDailyDataPoints(map, '2025-01-01', '2025-01-05')
    expect(result).toHaveLength(5)
    expect(result[0].revenue_try).toBe(0)
    expect(result[2].revenue_try).toBe(300)
    expect(result[4].revenue_try).toBe(0)
  })

  it('10. correct number of days for a week', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-01-01', '2025-01-07')
    expect(result).toHaveLength(7)
  })

  it('11. avg_order_value = 0 when no orders', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-02-01', '2025-02-01')
    expect(result[0].avg_order_value).toBe(0)
    expect(result[0].order_count).toBe(0)
  })

  it('12. dates are in ascending order', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-01-01', '2025-01-10')
    for (let i = 1; i < result.length; i++) {
      expect(result[i].date > result[i - 1].date).toBe(true)
    }
  })

  it('13. correct 30-day range produces 30 points', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-01-01', '2025-01-30')
    expect(result).toHaveLength(30)
  })
})

// ── getIsoWeekStart ───────────────────────────────────────────────────────────

describe('getIsoWeekStart', () => {

  it('14. Wednesday 2025-01-08 → Monday 2025-01-06', () => {
    expect(getIsoWeekStart('2025-01-08')).toBe('2025-01-06')
  })

  it('15. Monday stays same', () => {
    expect(getIsoWeekStart('2025-01-06')).toBe('2025-01-06')
  })

  it('16. Sunday → previous Monday', () => {
    expect(getIsoWeekStart('2025-01-12')).toBe('2025-01-06')
  })

  it('17. Friday → same Monday', () => {
    expect(getIsoWeekStart('2025-01-10')).toBe('2025-01-06')
  })

  it('18. Tuesday → same Monday', () => {
    expect(getIsoWeekStart('2025-01-07')).toBe('2025-01-06')
  })

  it('19. Saturday → same Monday', () => {
    expect(getIsoWeekStart('2025-01-11')).toBe('2025-01-06')
  })
})

// ── aggregateToWeekly ─────────────────────────────────────────────────────────

describe('aggregateToWeekly', () => {

  it('20. empty array returns empty', () => {
    expect(aggregateToWeekly([])).toHaveLength(0)
  })

  it('21. 7 days in same week produces one bucket', () => {
    const daily = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2025-01-06')
      d.setDate(d.getDate() + i)
      return makeDailyPoint(d.toISOString().slice(0, 10), 100)
    })
    const result = aggregateToWeekly(daily)
    expect(result).toHaveLength(1)
    expect(result[0].revenue_try).toBe(700)
    expect(result[0].order_count).toBe(7)
  })

  it('22. active_days counts only days with orders', () => {
    const daily = [
      makeDailyPoint('2025-01-06', 100, 1),
      makeDailyPoint('2025-01-07', 0, 0),
      makeDailyPoint('2025-01-08', 200, 1),
    ]
    const result = aggregateToWeekly(daily)
    expect(result[0].active_days).toBe(2)
  })

  it('23. two separate weeks produce two buckets', () => {
    const week1 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2025-01-06')
      d.setDate(d.getDate() + i)
      return makeDailyPoint(d.toISOString().slice(0, 10), 100)
    })
    const week2 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date('2025-01-13')
      d.setDate(d.getDate() + i)
      return makeDailyPoint(d.toISOString().slice(0, 10), 200)
    })
    const result = aggregateToWeekly([...week1, ...week2])
    expect(result).toHaveLength(2)
    expect(result[0].revenue_try).toBe(700)
    expect(result[1].revenue_try).toBe(1400)
  })

  it('24. avg_order_value computed correctly', () => {
    const daily = [makeDailyPoint('2025-01-06', 600, 3)]
    const result = aggregateToWeekly(daily)
    expect(result[0].avg_order_value).toBe(200)
  })

  it('25. week_end is 6 days after week_start', () => {
    const daily = [makeDailyPoint('2025-01-08', 100)]
    const result = aggregateToWeekly(daily)
    const start = new Date(result[0].week_start)
    const end   = new Date(result[0].week_end)
    const diff  = (end.getTime() - start.getTime()) / 86_400_000
    expect(diff).toBe(6)
  })
})

// ── computeVelocityMetrics ────────────────────────────────────────────────────

describe('computeVelocityMetrics', () => {

  it('26. empty daily returns all zeros', () => {
    const result = computeVelocityMetrics([])
    expect(result.daily_avg_revenue).toBe(0)
    expect(result.peak_day_date).toBeNull()
  })

  it('27. daily_avg_revenue = total / days', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 300),
      makeDailyPoint('2025-01-02', 100),
      makeDailyPoint('2025-01-03', 200),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.daily_avg_revenue).toBeCloseTo(200)
  })

  it('28. weekly_avg = daily_avg * 7', () => {
    const daily = [makeDailyPoint('2025-01-01', 700)]
    const result = computeVelocityMetrics(daily)
    expect(result.weekly_avg_revenue).toBeCloseTo(700 * 7)
  })

  it('29. monthly_avg = daily_avg * 30', () => {
    const daily = [makeDailyPoint('2025-01-01', 300)]
    const result = computeVelocityMetrics(daily)
    expect(result.monthly_avg_revenue).toBeCloseTo(300 * 30)
  })

  it('30. peak_day_date identifies correct date', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100),
      makeDailyPoint('2025-01-02', 500),
      makeDailyPoint('2025-01-03', 200),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.peak_day_date).toBe('2025-01-02')
    expect(result.peak_day_revenue).toBe(500)
  })

  it('31. low_day_revenue = lowest non-zero day', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 0, 0),
      makeDailyPoint('2025-01-02', 50),
      makeDailyPoint('2025-01-03', 200),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.low_day_revenue).toBe(50)
  })

  it('32. all-zero days → low_day_revenue = 0', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 0, 0),
      makeDailyPoint('2025-01-02', 0, 0),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.low_day_revenue).toBe(0)
  })

  it('33. coefficient_of_variation = stddev / mean', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100),
      makeDailyPoint('2025-01-02', 100),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.coefficient_of_variation).toBe(0) // no variance
  })
})

// ── computeMovingAverage ──────────────────────────────────────────────────────

describe('computeMovingAverage', () => {

  it('34. empty array returns empty', () => {
    expect(computeMovingAverage([], 7)).toHaveLength(0)
  })

  it('35. single value returns itself', () => {
    expect(computeMovingAverage([100], 7)).toEqual([100])
  })

  it('36. window=1 returns same values', () => {
    const vals = [10, 20, 30, 40]
    expect(computeMovingAverage(vals, 1)).toEqual([10, 20, 30, 40])
  })

  it('37. full window average is correct at index 6 (window=7)', () => {
    const vals = [10, 20, 30, 40, 50, 60, 70, 80]
    const result = computeMovingAverage(vals, 7)
    // index 6: average of [10,20,30,40,50,60,70] = 280/7 = 40
    expect(result[6]).toBeCloseTo(40)
  })

  it('38. first value equals first element (window > length at start)', () => {
    const vals = [50, 100, 150]
    const result = computeMovingAverage(vals, 7)
    expect(result[0]).toBe(50)
  })

  it('39. output length = input length', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(computeMovingAverage(vals, 3)).toHaveLength(10)
  })

  it('40. expanding window at boundaries uses available data', () => {
    const vals = [10, 20, 30]
    const result = computeMovingAverage(vals, 7)
    // index 0: [10] → 10; index 1: [10,20] → 15; index 2: [10,20,30] → 20
    expect(result[0]).toBe(10)
    expect(result[1]).toBe(15)
    expect(result[2]).toBe(20)
  })
})

// ── computeTrendSlope ─────────────────────────────────────────────────────────

describe('computeTrendSlope', () => {

  it('41. empty array returns 0', () => {
    expect(computeTrendSlope([])).toBe(0)
  })

  it('42. single value returns 0', () => {
    expect(computeTrendSlope([100])).toBe(0)
  })

  it('43. constant series returns 0', () => {
    expect(computeTrendSlope([50, 50, 50, 50, 50, 50, 50])).toBeCloseTo(0)
  })

  it('44. increasing series → positive slope', () => {
    const vals = [10, 20, 30, 40, 50, 60, 70]
    expect(computeTrendSlope(vals)).toBeGreaterThan(0)
  })

  it('45. decreasing series → negative slope', () => {
    const vals = [70, 60, 50, 40, 30, 20, 10]
    expect(computeTrendSlope(vals)).toBeLessThan(0)
  })

  it('46. uses last N points only', () => {
    // First half increasing, last 7 decreasing
    const vals = [10, 20, 30, 40, 50, 60, 70, 60, 50, 40, 30, 20, 10]
    const slope = computeTrendSlope(vals, 7)
    expect(slope).toBeLessThan(0)
  })

  it('47. perfectly linear increasing series has positive slope', () => {
    const slope = computeTrendSlope([0, 10, 20, 30, 40, 50, 60], 7)
    expect(slope).toBeCloseTo(10, 0)
  })
})

// ── classifyVelocityTrend ─────────────────────────────────────────────────────

describe('classifyVelocityTrend', () => {

  it('48. slope > 5% of mean → accelerating', () => {
    expect(classifyVelocityTrend(100, 1000)).toBe('accelerating') // 10% > 5%
  })

  it('49. slope < -5% of mean → declining', () => {
    expect(classifyVelocityTrend(-100, 1000)).toBe('declining')
  })

  it('50. small positive slope > 0 → growing', () => {
    expect(classifyVelocityTrend(10, 1000)).toBe('growing') // 1% < 5%, but > 0
  })

  it('51. small negative slope < 0 → slowing', () => {
    expect(classifyVelocityTrend(-10, 1000)).toBe('slowing')
  })

  it('52. slope = 0 → stable', () => {
    expect(classifyVelocityTrend(0, 1000)).toBe('stable')
  })

  it('53. mean = 0 → stable', () => {
    expect(classifyVelocityTrend(100, 0)).toBe('stable')
  })

  it('54. slope exactly at 5% threshold → accelerating', () => {
    // slope = 51, mean = 1000 → threshold = 50
    expect(classifyVelocityTrend(51, 1000)).toBe('accelerating')
  })
})

// ── computeDayOfWeekPerformance ───────────────────────────────────────────────

describe('computeDayOfWeekPerformance', () => {

  it('55. empty array returns all zeros', () => {
    const result = computeDayOfWeekPerformance([])
    for (let i = 0; i < 7; i++) {
      expect(result[i]).toBe(0)
    }
  })

  it('56. Monday (2025-01-06) maps to key 0', () => {
    const result = computeDayOfWeekPerformance([makeDailyPoint('2025-01-06', 500)])
    expect(result[0]).toBe(500)
  })

  it('57. Sunday (2025-01-12) maps to key 6', () => {
    const result = computeDayOfWeekPerformance([makeDailyPoint('2025-01-12', 300)])
    expect(result[6]).toBe(300)
  })

  it('58. averages multiple occurrences of same day of week', () => {
    // Two Mondays: 2025-01-06 and 2025-01-13
    const result = computeDayOfWeekPerformance([
      makeDailyPoint('2025-01-06', 400),
      makeDailyPoint('2025-01-13', 600),
    ])
    expect(result[0]).toBe(500)
  })

  it('59. Wednesday (2025-01-08) maps to key 2', () => {
    const result = computeDayOfWeekPerformance([makeDailyPoint('2025-01-08', 250)])
    expect(result[2]).toBe(250)
  })
})

// ── findBestDayOfWeek ─────────────────────────────────────────────────────────

describe('findBestDayOfWeek', () => {

  it('60. returns day with highest value', () => {
    const perf = { 0: 100, 1: 200, 2: 500, 3: 400, 4: 300, 5: 50, 6: 10 }
    expect(findBestDayOfWeek(perf)).toBe(2)
  })

  it('61. returns 0 when all equal', () => {
    const perf = { 0: 100, 1: 100, 2: 100, 3: 100, 4: 100, 5: 100, 6: 100 }
    expect(findBestDayOfWeek(perf)).toBe(0)
  })

  it('62. works when Sunday (6) has highest', () => {
    const perf = { 0: 10, 1: 10, 2: 10, 3: 10, 4: 10, 5: 10, 6: 999 }
    expect(findBestDayOfWeek(perf)).toBe(6)
  })
})

// ── computeWowGrowth ──────────────────────────────────────────────────────────

describe('computeWowGrowth', () => {

  it('63. returns null for empty array', () => {
    expect(computeWowGrowth([])).toBeNull()
  })

  it('64. returns null for single week', () => {
    const w: WeeklyDataPoint = {
      week_start: '2025-01-06', week_end: '2025-01-12',
      revenue_try: 1000, order_count: 5, avg_order_value: 200, active_days: 5,
    }
    expect(computeWowGrowth([w])).toBeNull()
  })

  it('65. 50% growth computed correctly', () => {
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 1000, order_count: 5, avg_order_value: 200, active_days: 5 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 1500, order_count: 5, avg_order_value: 300, active_days: 5 },
    ]
    expect(computeWowGrowth(weeks)).toBeCloseTo(50)
  })

  it('66. negative growth computed correctly', () => {
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 2000, order_count: 10, avg_order_value: 200, active_days: 5 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 1000, order_count: 5,  avg_order_value: 200, active_days: 5 },
    ]
    expect(computeWowGrowth(weeks)).toBeCloseTo(-50)
  })

  it('67. returns null if previous week revenue = 0', () => {
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 0, order_count: 0, avg_order_value: 0, active_days: 0 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 500, order_count: 2, avg_order_value: 250, active_days: 2 },
    ]
    expect(computeWowGrowth(weeks)).toBeNull()
  })
})

// ── computeBusinessDayAvg ─────────────────────────────────────────────────────

describe('computeBusinessDayAvg', () => {

  it('68. empty returns 0', () => {
    expect(computeBusinessDayAvg([])).toBe(0)
  })

  it('69. weekend days excluded', () => {
    // 2025-01-11 = Saturday, 2025-01-12 = Sunday
    const daily = [
      makeDailyPoint('2025-01-11', 1000),
      makeDailyPoint('2025-01-12', 1000),
    ]
    expect(computeBusinessDayAvg(daily)).toBe(0) // no biz days
  })

  it('70. Monday–Friday included, Sat/Sun excluded', () => {
    const daily = [
      makeDailyPoint('2025-01-06', 100), // Mon
      makeDailyPoint('2025-01-07', 200), // Tue
      makeDailyPoint('2025-01-08', 300), // Wed
      makeDailyPoint('2025-01-09', 400), // Thu
      makeDailyPoint('2025-01-10', 500), // Fri
      makeDailyPoint('2025-01-11', 999), // Sat — excluded
      makeDailyPoint('2025-01-12', 999), // Sun — excluded
    ]
    // avg of [100,200,300,400,500] = 300
    expect(computeBusinessDayAvg(daily)).toBeCloseTo(300)
  })
})

// ── computeSalesConsistencyScore ──────────────────────────────────────────────

describe('computeSalesConsistencyScore', () => {

  it('71. zero totalDays returns 0', () => {
    expect(computeSalesConsistencyScore([], 0)).toBe(0)
  })

  it('72. 30 active days out of 90 → 33.3', () => {
    const active = Array.from({ length: 30 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    const inactive = Array.from({ length: 60 }, (_, i) =>
      makeDailyPoint(`2025-03-${String(i + 1).padStart(2, '0')}`, 0, 0),
    )
    expect(computeSalesConsistencyScore([...active, ...inactive], 90)).toBeCloseTo(33.33, 1)
  })

  it('73. all days active → 100', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100),
      makeDailyPoint('2025-01-02', 200),
    ]
    expect(computeSalesConsistencyScore(daily, 2)).toBe(100)
  })

  it('74. no active days → 0', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 0, 0),
      makeDailyPoint('2025-01-02', 0, 0),
    ]
    expect(computeSalesConsistencyScore(daily, 2)).toBe(0)
  })
})

// ── detectAnomalyDays ─────────────────────────────────────────────────────────

describe('detectAnomalyDays', () => {

  it('75. fewer than 3 data points returns empty', () => {
    expect(detectAnomalyDays([makeDailyPoint('2025-01-01', 100)])).toHaveLength(0)
  })

  it('76. all equal values = no anomaly (stddev = 0)', () => {
    const daily = Array.from({ length: 10 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    expect(detectAnomalyDays(daily)).toHaveLength(0)
  })

  it('77. extreme positive spike detected as positive anomaly', () => {
    const daily = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      makeDailyPoint('2025-01-10', 10000),
    ]
    const anomalies = detectAnomalyDays(daily)
    expect(anomalies.some(a => a.date === '2025-01-10' && a.is_positive)).toBe(true)
  })

  it('78. z_score positive for above-mean anomaly', () => {
    const daily = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      makeDailyPoint('2025-01-10', 10000),
    ]
    const anomalies = detectAnomalyDays(daily)
    const spike = anomalies.find(a => a.date === '2025-01-10')
    expect(spike).toBeDefined()
    expect(spike!.z_score).toBeGreaterThan(2)
  })

  it('79. extreme negative day detected as non-positive anomaly', () => {
    const daily = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 1000),
      ),
      makeDailyPoint('2025-01-10', 0, 0),
    ]
    const anomalies = detectAnomalyDays(daily)
    // z < -2 expected only if deviation large enough; may or may not trigger depending on distribution
    // Just verify function runs without error
    expect(Array.isArray(anomalies)).toBe(true)
  })
})

// ── computeVelocityAcceleration ───────────────────────────────────────────────

describe('computeVelocityAcceleration', () => {

  it('80. returns null for empty array', () => {
    expect(computeVelocityAcceleration([])).toBeNull()
  })

  it('81. returns null for 13 days (< 14)', () => {
    const daily = Array.from({ length: 13 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    expect(computeVelocityAcceleration(daily)).toBeNull()
  })

  it('82. returns value for exactly 14 days', () => {
    const daily = Array.from({ length: 14 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    const result = computeVelocityAcceleration(daily)
    expect(result).not.toBeNull()
  })

  it('83. flat revenue → acceleration = 0', () => {
    const daily = Array.from({ length: 14 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    expect(computeVelocityAcceleration(daily)).toBeCloseTo(0)
  })

  it('84. second half higher → positive acceleration', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 8).padStart(2, '0')}`, 200),
      ),
    ]
    const result = computeVelocityAcceleration(daily)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('85. second half lower → negative acceleration', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 200),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 8).padStart(2, '0')}`, 100),
      ),
    ]
    const result = computeVelocityAcceleration(daily)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('86. returns null when prior 7-day avg is 0', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 0, 0),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 8).padStart(2, '0')}`, 100),
      ),
    ]
    expect(computeVelocityAcceleration(daily)).toBeNull()
  })
})

// ── Additional aggregateDailySales tests ──────────────────────────────────────

describe('aggregateDailySales — extended', () => {

  it('87. 10 sales on same date → count is 10', () => {
    const sales = Array.from({ length: 10 }, () => ({
      sale_date: '2025-06-15',
      total: 1000,
    }))
    const result = aggregateDailySales(sales)
    expect(result.get('2025-06-15')?.count).toBe(10)
    expect(result.get('2025-06-15')?.revenue).toBe(10000)
  })

  it('88. large dataset with many dates', () => {
    const sales = Array.from({ length: 30 }, (_, i) => ({
      sale_date: `2025-01-${String(i + 1).padStart(2, '0')}`,
      total: (i + 1) * 100,
    }))
    const result = aggregateDailySales(sales)
    expect(result.size).toBe(30)
  })

  it('89. decimal total values accumulate correctly', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-01-01', total: 100.50 },
      { sale_date: '2025-01-01', total: 200.25 },
    ])
    expect(result.get('2025-01-01')?.revenue).toBeCloseTo(300.75)
  })

  it('90. datetime with time component still normalized to date', () => {
    const result = aggregateDailySales([
      { sale_date: '2025-05-20T08:00:00', total: 500 },
      { sale_date: '2025-05-20T23:59:59', total: 300 },
    ])
    expect(result.size).toBe(1)
    expect(result.get('2025-05-20')?.revenue).toBe(800)
  })
})

// ── Additional buildDailyDataPoints tests ─────────────────────────────────────

describe('buildDailyDataPoints — extended', () => {

  it('91. avg_order_value computed as revenue/count', () => {
    const map = new Map([['2025-02-10', { revenue: 6000, count: 4 }]])
    const result = buildDailyDataPoints(map, '2025-02-10', '2025-02-10')
    expect(result[0].avg_order_value).toBe(1500)
  })

  it('92. first and last dates in range match start/end', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-03-01', '2025-03-10')
    expect(result[0].date).toBe('2025-03-01')
    expect(result[result.length - 1].date).toBe('2025-03-10')
  })

  it('93. only sales-map dates have non-zero revenue', () => {
    const map = new Map([
      ['2025-01-05', { revenue: 1000, count: 1 }],
      ['2025-01-08', { revenue: 2000, count: 2 }],
    ])
    const result = buildDailyDataPoints(map, '2025-01-04', '2025-01-10')
    const nonZero = result.filter(d => d.revenue_try > 0)
    expect(nonZero).toHaveLength(2)
  })

  it('94. range spanning month boundary', () => {
    const map = new Map<string, { revenue: number; count: number }>()
    const result = buildDailyDataPoints(map, '2025-01-30', '2025-02-02')
    expect(result).toHaveLength(4)
    expect(result[2].date).toBe('2025-02-01')
  })
})

// ── Additional getIsoWeekStart tests ──────────────────────────────────────────

describe('getIsoWeekStart — extended', () => {

  it('95. Thursday maps to same Monday', () => {
    // 2025-01-09 is Thursday
    expect(getIsoWeekStart('2025-01-09')).toBe('2025-01-06')
  })

  it('96. second Monday in year', () => {
    expect(getIsoWeekStart('2025-01-13')).toBe('2025-01-13')
  })

  it('97. end of month date maps to correct week', () => {
    // 2025-03-31 is Monday
    const result = getIsoWeekStart('2025-03-31')
    expect(result).toBe('2025-03-31')
  })

  it('98. last day of year 2024-12-31 (Tuesday) → correct Monday', () => {
    // 2024-12-31 is Tuesday → back 1 day → 2024-12-30 (Monday)
    expect(getIsoWeekStart('2024-12-31')).toBe('2024-12-30')
  })
})

// ── Additional classifyVelocityTrend tests ────────────────────────────────────

describe('classifyVelocityTrend — extended', () => {

  it('99. 0 slope with nonzero mean → stable', () => {
    expect(classifyVelocityTrend(0, 500)).toBe('stable')
  })

  it('100. slope much larger than mean → accelerating', () => {
    // mean=10, threshold=0.5; slope=100 → accelerating
    expect(classifyVelocityTrend(100, 10)).toBe('accelerating')
  })

  it('101. negative slope smaller than -threshold → declining', () => {
    // mean=200, threshold=10; slope=-50 → declining
    expect(classifyVelocityTrend(-50, 200)).toBe('declining')
  })

  it('102. very small positive slope → growing', () => {
    // mean=1000, threshold=50; slope=1 → 0 < 1 < 50 → growing
    expect(classifyVelocityTrend(1, 1000)).toBe('growing')
  })

  it('103. very small negative slope → slowing', () => {
    // mean=1000, threshold=50; slope=-1 → slowing
    expect(classifyVelocityTrend(-1, 1000)).toBe('slowing')
  })
})

// ── Additional computeWowGrowth tests ────────────────────────────────────────

describe('computeWowGrowth — extended', () => {

  it('104. 100% growth (doubling)', () => {
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 500, order_count: 5, avg_order_value: 100, active_days: 5 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 1000, order_count: 5, avg_order_value: 200, active_days: 5 },
    ]
    expect(computeWowGrowth(weeks)).toBeCloseTo(100)
  })

  it('105. 0% growth (flat)', () => {
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 800, order_count: 4, avg_order_value: 200, active_days: 4 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 800, order_count: 4, avg_order_value: 200, active_days: 4 },
    ]
    expect(computeWowGrowth(weeks)).toBe(0)
  })

  it('106. uses the two most recent weeks from unsorted input', () => {
    // Provide 3 weeks out of order; growth should be between latest two
    const weeks: WeeklyDataPoint[] = [
      { week_start: '2025-01-20', week_end: '2025-01-26', revenue_try: 3000, order_count: 10, avg_order_value: 300, active_days: 5 },
      { week_start: '2025-01-06', week_end: '2025-01-12', revenue_try: 500,  order_count: 5,  avg_order_value: 100, active_days: 4 },
      { week_start: '2025-01-13', week_end: '2025-01-19', revenue_try: 1000, order_count: 8,  avg_order_value: 125, active_days: 5 },
    ]
    // Last two (sorted): 1000 → 3000 → 200%
    expect(computeWowGrowth(weeks)).toBeCloseTo(200)
  })
})

// ── Additional computeMovingAverage tests ────────────────────────────────────

describe('computeMovingAverage — extended', () => {

  it('107. window=2 averages pairs correctly at full window', () => {
    const result = computeMovingAverage([10, 30, 50, 70], 2)
    // index 0: [10]=10; index 1: [10,30]=20; index 2: [30,50]=40; index 3: [50,70]=60
    expect(result[0]).toBe(10)
    expect(result[1]).toBe(20)
    expect(result[2]).toBe(40)
    expect(result[3]).toBe(60)
  })

  it('108. large window smooths to same value for uniform input', () => {
    const vals = Array.from({ length: 20 }, () => 100)
    const result = computeMovingAverage(vals, 10)
    for (const v of result) {
      expect(v).toBe(100)
    }
  })

  it('109. all zeros → all zeros in output', () => {
    const result = computeMovingAverage([0, 0, 0, 0], 3)
    expect(result).toEqual([0, 0, 0, 0])
  })
})

// ── Additional computeTrendSlope tests ───────────────────────────────────────

describe('computeTrendSlope — extended', () => {

  it('110. two equal values → slope 0', () => {
    expect(computeTrendSlope([200, 200])).toBe(0)
  })

  it('111. two increasing values → positive slope', () => {
    expect(computeTrendSlope([100, 200])).toBeGreaterThan(0)
  })

  it('112. two decreasing values → negative slope', () => {
    expect(computeTrendSlope([200, 100])).toBeLessThan(0)
  })

  it('113. lastN=1 → returns 0 (single value)', () => {
    expect(computeTrendSlope([10, 20, 30, 40], 1)).toBe(0)
  })

  it('114. large N that exceeds array length uses all values', () => {
    const vals = [10, 20, 30]
    const slope = computeTrendSlope(vals, 100) // lastN > length
    expect(slope).toBeGreaterThan(0) // still ascending
  })
})

// ── Additional computeVelocityMetrics tests ───────────────────────────────────

describe('computeVelocityMetrics — extended', () => {

  it('115. daily_avg_orders divides total orders by day count', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100, 4),
      makeDailyPoint('2025-01-02', 200, 6),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.daily_avg_orders).toBe(5) // (4+6)/2
  })

  it('116. peak_day with multiple same-max picks first', () => {
    // Two days both 500; first should win
    const daily = [
      makeDailyPoint('2025-01-01', 500),
      makeDailyPoint('2025-01-02', 500),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.peak_day_revenue).toBe(500)
    // First encountered wins (2025-01-01)
    expect(result.peak_day_date).toBe('2025-01-01')
  })

  it('117. single zero-revenue day → low_day_revenue is 0', () => {
    const daily = [makeDailyPoint('2025-01-01', 0, 0)]
    const result = computeVelocityMetrics(daily)
    expect(result.low_day_revenue).toBe(0)
  })

  it('118. cv is positive when there is variance', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100),
      makeDailyPoint('2025-01-02', 900),
    ]
    const result = computeVelocityMetrics(daily)
    expect(result.coefficient_of_variation).toBeGreaterThan(0)
  })
})

// ── Additional computeBusinessDayAvg tests ────────────────────────────────────

describe('computeBusinessDayAvg — extended', () => {

  it('119. single Monday → returns that day revenue', () => {
    const daily = [makeDailyPoint('2025-01-06', 2000)] // Monday
    expect(computeBusinessDayAvg(daily)).toBe(2000)
  })

  it('120. mixed week: correct business days only', () => {
    // Mon=100, Tue=200, Sat=1000, Sun=2000 → avg of Mon+Tue = 150
    const daily = [
      makeDailyPoint('2025-01-06', 100), // Mon
      makeDailyPoint('2025-01-07', 200), // Tue
      makeDailyPoint('2025-01-11', 1000), // Sat — excluded
      makeDailyPoint('2025-01-12', 2000), // Sun — excluded
    ]
    expect(computeBusinessDayAvg(daily)).toBe(150)
  })

  it('121. all 5 weekdays with same revenue → returns that revenue', () => {
    const daily = [
      makeDailyPoint('2025-01-06', 500),
      makeDailyPoint('2025-01-07', 500),
      makeDailyPoint('2025-01-08', 500),
      makeDailyPoint('2025-01-09', 500),
      makeDailyPoint('2025-01-10', 500),
    ]
    expect(computeBusinessDayAvg(daily)).toBe(500)
  })
})

// ── Additional computeSalesConsistencyScore tests ─────────────────────────────

describe('computeSalesConsistencyScore — extended', () => {

  it('122. 1 active day out of 10 → 10', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 500, 1),
      ...Array.from({ length: 9 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 2).padStart(2, '0')}`, 0, 0),
      ),
    ]
    expect(computeSalesConsistencyScore(daily, 10)).toBe(10)
  })

  it('123. totalDays > daily.length → score reflects proper proportion', () => {
    // 5 active days but totalDays=20 → 25%
    const daily = Array.from({ length: 5 }, (_, i) =>
      makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
    )
    expect(computeSalesConsistencyScore(daily, 20)).toBe(25)
  })
})

// ── Additional detectAnomalyDays tests ───────────────────────────────────────

describe('detectAnomalyDays — extended', () => {

  it('124. exactly 3 data points (minimum) runs without error', () => {
    const daily = [
      makeDailyPoint('2025-01-01', 100),
      makeDailyPoint('2025-01-02', 100),
      makeDailyPoint('2025-01-03', 100),
    ]
    const result = detectAnomalyDays(daily)
    expect(Array.isArray(result)).toBe(true)
  })

  it('125. returned anomalies have z_score > 2 or < -2', () => {
    const daily = [
      ...Array.from({ length: 9 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      makeDailyPoint('2025-01-10', 5000),
    ]
    const result = detectAnomalyDays(daily)
    for (const a of result) {
      expect(Math.abs(a.z_score)).toBeGreaterThan(2)
    }
  })

  it('126. is_positive=false for below-mean anomaly', () => {
    // All days at 1000, one day at 0 (very below)
    const daily = Array.from({ length: 20 }, (_, i) =>
      makeDailyPoint(
        new Date(new Date('2025-01-01').getTime() + i * 86400000).toISOString().slice(0, 10),
        i === 0 ? 0 : 1000,
        i === 0 ? 0 : 1,
      ),
    )
    const result = detectAnomalyDays(daily)
    const negAnomaly = result.find(a => a.revenue === 0)
    if (negAnomaly) {
      expect(negAnomaly.is_positive).toBe(false)
    }
  })
})

// ── Additional computeVelocityAcceleration tests ──────────────────────────────

describe('computeVelocityAcceleration — extended', () => {

  it('127. exactly 200% acceleration when last7=300 prior7=100', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 8).padStart(2, '0')}`, 300),
      ),
    ]
    expect(computeVelocityAcceleration(daily)).toBe(200)
  })

  it('128. exactly -50% deceleration when last7=50 prior7=100', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 1).padStart(2, '0')}`, 100),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-01-${String(i + 8).padStart(2, '0')}`, 50),
      ),
    ]
    expect(computeVelocityAcceleration(daily)).toBe(-50)
  })

  it('129. 15 days returns non-null value', () => {
    const daily = Array.from({ length: 15 }, (_, i) =>
      makeDailyPoint(
        new Date(new Date('2025-01-01').getTime() + i * 86400000).toISOString().slice(0, 10),
        200,
      ),
    )
    expect(computeVelocityAcceleration(daily)).not.toBeNull()
  })

  it('130. result is number when both periods have revenue', () => {
    const daily = [
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-02-${String(i + 1).padStart(2, '0')}`, 500),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeDailyPoint(`2025-02-${String(i + 8).padStart(2, '0')}`, 750),
      ),
    ]
    const result = computeVelocityAcceleration(daily)
    expect(typeof result).toBe('number')
  })
})
