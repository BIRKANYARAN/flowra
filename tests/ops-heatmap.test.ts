/**
 * Tests for pure helper functions in ops-heatmap.service.ts.
 *
 * Covers: computeIntensity, computeWeekNumber, computeDowIndex,
 *         computeDowAvg, findBestDow, computeWeekendRatio.
 *
 * No DB, no Supabase, no HTTP — pure math only.
 *
 * Run with: npx vitest run tests/ops-heatmap.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeIntensity,
  computeWeekNumber,
  computeDowIndex,
  computeDowAvg,
  findBestDow,
  computeWeekendRatio,
} from '../lib/services/intelligence/ops-heatmap.service'
import type { DayData } from '../lib/services/intelligence/ops-heatmap.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDay(overrides: Partial<DayData>): DayData {
  return {
    date:               '2026-01-01',
    day_of_week:        0,
    week_number:        0,
    revenue:            0,
    orders:             0,
    collections:        0,
    expenses:           0,
    net_cash:           0,
    revenue_intensity:  0,
    orders_intensity:   0,
    ...overrides,
  }
}

// ── computeIntensity ──────────────────────────────────────────────────────────

describe('computeIntensity', () => {
  it('50 of 100 → 50', () => {
    expect(computeIntensity(50, 100)).toBe(50)
  })

  it('100 of 100 → 100', () => {
    expect(computeIntensity(100, 100)).toBe(100)
  })

  it('0 of 100 → 0', () => {
    expect(computeIntensity(0, 100)).toBe(0)
  })

  it('maxValue=0 guard → 0', () => {
    expect(computeIntensity(50, 0)).toBe(0)
  })

  it('25 of 100 → 25', () => {
    expect(computeIntensity(25, 100)).toBe(25)
  })

  it('value > maxValue → clamped to 100', () => {
    expect(computeIntensity(200, 100)).toBe(100)
  })

  it('0 of 0 → 0 (both zero)', () => {
    expect(computeIntensity(0, 0)).toBe(0)
  })

  // ── Additional intensity tests ──────────────────────────────────────────────

  it('1 of 1000 → 0.1', () => {
    expect(computeIntensity(1, 1000)).toBeCloseTo(0.1, 5)
  })

  it('999 of 1000 → 99.9', () => {
    expect(computeIntensity(999, 1000)).toBeCloseTo(99.9, 5)
  })

  it('negative value → 0 (clamped via Math.max(0, …))', () => {
    expect(computeIntensity(-10, 100)).toBe(0)
  })

  it('negative maxValue with positive value → clamped to 0', () => {
    // (-10 / -50) * 100 = 20, but should clamp at 100 or 0 depending on impl
    // The function uses Math.min(100, Math.max(0, ...)), negative max causes
    // a positive ratio; we just verify the result is in [0, 100]
    const r = computeIntensity(10, -50)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(100)
  })

  it('fractional result is preserved', () => {
    // 1 of 3 → 33.333...
    expect(computeIntensity(1, 3)).toBeCloseTo(33.333, 2)
  })

  it('exactly at maxValue → 100', () => {
    expect(computeIntensity(500, 500)).toBe(100)
    expect(computeIntensity(1, 1)).toBe(100)
  })

  it('large values work correctly', () => {
    expect(computeIntensity(1_000_000, 10_000_000)).toBeCloseTo(10, 5)
  })

  it('zero value with non-zero max → 0', () => {
    expect(computeIntensity(0, 9999)).toBe(0)
  })
})

// ── computeWeekNumber ─────────────────────────────────────────────────────────

describe('computeWeekNumber', () => {
  it('same day → 0', () => {
    expect(computeWeekNumber('2026-05-04', '2026-05-04')).toBe(0)
  })

  it('23 days later → week 3 (days 0-6=week0, 7-13=week1, 14-20=week2, 21-27=week3)', () => {
    // 2026-05-04 to 2026-05-27 = 23 days → floor(23/7) = 3
    expect(computeWeekNumber('2026-05-27', '2026-05-04')).toBe(3)
  })

  it('6 days later → week 0', () => {
    expect(computeWeekNumber('2026-05-10', '2026-05-04')).toBe(0)
  })

  it('7 days later → week 1', () => {
    expect(computeWeekNumber('2026-05-11', '2026-05-04')).toBe(1)
  })

  it('13 days later → week 1', () => {
    expect(computeWeekNumber('2026-05-17', '2026-05-04')).toBe(1)
  })

  it('14 days later → week 2', () => {
    expect(computeWeekNumber('2026-05-18', '2026-05-04')).toBe(2)
  })

  // ── Additional week number tests ────────────────────────────────────────────

  it('1 day after start → week 0', () => {
    expect(computeWeekNumber('2026-05-05', '2026-05-04')).toBe(0)
  })

  it('exactly 21 days later → week 3', () => {
    // floor(21/7) = 3
    expect(computeWeekNumber('2026-05-25', '2026-05-04')).toBe(3)
  })

  it('exactly 28 days later → week 4', () => {
    // floor(28/7) = 4
    expect(computeWeekNumber('2026-06-01', '2026-05-04')).toBe(4)
  })

  it('exactly 90 days later → week 12', () => {
    // floor(90/7) = 12
    expect(computeWeekNumber('2026-08-02', '2026-05-04')).toBe(12)
  })

  it('week 0 spans days 0 through 6', () => {
    const start = '2026-01-05'
    for (let d = 0; d < 7; d++) {
      const date = new Date('2026-01-05')
      date.setDate(date.getDate() + d)
      const dateStr = date.toISOString().slice(0, 10)
      expect(computeWeekNumber(dateStr, start)).toBe(0)
    }
  })

  it('week 1 spans days 7 through 13', () => {
    const start = '2026-01-05'
    for (let d = 7; d < 14; d++) {
      const date = new Date('2026-01-05')
      date.setDate(date.getDate() + d)
      const dateStr = date.toISOString().slice(0, 10)
      expect(computeWeekNumber(dateStr, start)).toBe(1)
    }
  })

  it('month boundary does not affect week arithmetic', () => {
    // Jan 28 to Feb 4 crosses month boundary: 7 days → week 1
    expect(computeWeekNumber('2026-02-04', '2026-01-28')).toBe(1)
  })

  it('year boundary does not affect week arithmetic', () => {
    // Dec 28 2025 to Jan 4 2026: 7 days → week 1
    expect(computeWeekNumber('2026-01-04', '2025-12-28')).toBe(1)
  })
})

// ── computeDowIndex ───────────────────────────────────────────────────────────

describe('computeDowIndex', () => {
  it('2026-05-25 (Monday) → 0', () => {
    expect(computeDowIndex('2026-05-25')).toBe(0)
  })

  it('2026-05-26 (Tuesday) → 1', () => {
    expect(computeDowIndex('2026-05-26')).toBe(1)
  })

  it('2026-05-27 (Wednesday) → 2', () => {
    expect(computeDowIndex('2026-05-27')).toBe(2)
  })

  it('2026-05-28 (Thursday) → 3', () => {
    expect(computeDowIndex('2026-05-28')).toBe(3)
  })

  it('2026-05-29 (Friday) → 4', () => {
    expect(computeDowIndex('2026-05-29')).toBe(4)
  })

  it('2026-05-30 (Saturday) → 5', () => {
    expect(computeDowIndex('2026-05-30')).toBe(5)
  })

  it('2026-05-31 (Sunday) → 6', () => {
    expect(computeDowIndex('2026-05-31')).toBe(6)
  })

  // ── Additional DOW tests ────────────────────────────────────────────────────

  it('all 7 days of a full week map to indices 0-6', () => {
    // Week of 2026-01-05 (Monday) to 2026-01-11 (Sunday)
    const expected = [0, 1, 2, 3, 4, 5, 6]
    const dates = [
      '2026-01-05', // Mon
      '2026-01-06', // Tue
      '2026-01-07', // Wed
      '2026-01-08', // Thu
      '2026-01-09', // Fri
      '2026-01-10', // Sat
      '2026-01-11', // Sun
    ]
    for (let i = 0; i < dates.length; i++) {
      expect(computeDowIndex(dates[i]!)).toBe(expected[i])
    }
  })

  it('result is always in [0, 6]', () => {
    const dates = [
      '2026-01-01', '2026-02-14', '2026-03-15', '2026-04-20',
      '2026-06-01', '2026-07-04', '2026-12-25',
    ]
    for (const d of dates) {
      const idx = computeDowIndex(d)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThanOrEqual(6)
    }
  })

  it('result is always an integer', () => {
    const dates = ['2026-01-01', '2026-06-15', '2026-12-31']
    for (const d of dates) {
      expect(Number.isInteger(computeDowIndex(d))).toBe(true)
    }
  })

  it('2026-01-01 (Thursday) → 3', () => {
    expect(computeDowIndex('2026-01-01')).toBe(3)
  })

  it('same day of week 7 days apart gives the same index', () => {
    expect(computeDowIndex('2026-05-25')).toBe(computeDowIndex('2026-06-01')) // Both Monday
    expect(computeDowIndex('2026-05-31')).toBe(computeDowIndex('2026-06-07')) // Both Sunday
  })
})

// ── computeDowAvg ─────────────────────────────────────────────────────────────

describe('computeDowAvg', () => {
  const days: DayData[] = [
    makeDay({ day_of_week: 0, revenue: 1000 }),
    makeDay({ day_of_week: 0, revenue: 2000 }),
    makeDay({ day_of_week: 0, revenue: 3000 }),
    makeDay({ day_of_week: 1, revenue: 500  }),
    makeDay({ day_of_week: 2, revenue: 0    }),
  ]

  it('Monday avg = (1000+2000+3000)/3 = 2000', () => {
    expect(computeDowAvg(days, 0)).toBe(2000)
  })

  it('Tuesday avg = 500', () => {
    expect(computeDowAvg(days, 1)).toBe(500)
  })

  it('Wednesday avg = 0', () => {
    expect(computeDowAvg(days, 2)).toBe(0)
  })

  it('Thursday (no data) avg = 0', () => {
    expect(computeDowAvg(days, 3)).toBe(0)
  })

  it('empty days → 0 for any dow', () => {
    expect(computeDowAvg([], 0)).toBe(0)
  })

  // ── Additional DowAvg tests ─────────────────────────────────────────────────

  it('single matching day returns that day revenue', () => {
    const single = [makeDay({ day_of_week: 4, revenue: 750 })]
    expect(computeDowAvg(single, 4)).toBe(750)
  })

  it('two days same DOW: avg of their revenues', () => {
    const twoFri = [
      makeDay({ day_of_week: 4, revenue: 200 }),
      makeDay({ day_of_week: 4, revenue: 800 }),
    ]
    expect(computeDowAvg(twoFri, 4)).toBe(500)
  })

  it('DOW = 6 (Sunday) computed correctly', () => {
    const withSunday = [
      makeDay({ day_of_week: 6, revenue: 300 }),
      makeDay({ day_of_week: 6, revenue: 700 }),
      makeDay({ day_of_week: 5, revenue: 999 }),
    ]
    expect(computeDowAvg(withSunday, 6)).toBe(500)
  })

  it('large dataset: many Mondays average is accurate', () => {
    const mondays = Array.from({ length: 13 }, (_, i) =>
      makeDay({ day_of_week: 0, revenue: (i + 1) * 100 })
    )
    // sum = 100+200+...+1300 = (13*14/2)*100 = 9100, avg = 9100/13 = 700
    const avg = computeDowAvg(mondays, 0)
    expect(avg).toBeCloseTo(9100 / 13, 5)
  })

  it('days with zero revenue included in average, not excluded', () => {
    // Three Tuesdays: 0, 0, 1500 → avg = 500
    const tuesdays = [
      makeDay({ day_of_week: 1, revenue: 0    }),
      makeDay({ day_of_week: 1, revenue: 0    }),
      makeDay({ day_of_week: 1, revenue: 1500 }),
    ]
    expect(computeDowAvg(tuesdays, 1)).toBe(500)
  })

  it('non-matching DOW returns 0 even when array has data', () => {
    // Only DOW 0 and 1 present
    expect(computeDowAvg(days, 5)).toBe(0)
    expect(computeDowAvg(days, 6)).toBe(0)
  })
})

// ── findBestDow ───────────────────────────────────────────────────────────────

describe('findBestDow', () => {
  it('[10, 20, 15, 5, 25, 8, 12] → 4 (index of 25)', () => {
    expect(findBestDow([10, 20, 15, 5, 25, 8, 12])).toBe(4)
  })

  it('all equal → first index wins (0)', () => {
    expect(findBestDow([5, 5, 5, 5, 5, 5, 5])).toBe(0)
  })

  it('last index is highest', () => {
    expect(findBestDow([1, 2, 3, 4, 5, 6, 99])).toBe(6)
  })

  it('empty array → 0 (safe default)', () => {
    expect(findBestDow([])).toBe(0)
  })

  // ── Additional findBestDow tests ────────────────────────────────────────────

  it('single element → index 0', () => {
    expect(findBestDow([42])).toBe(0)
  })

  it('first element is highest → 0', () => {
    expect(findBestDow([100, 50, 30, 20, 10, 5, 1])).toBe(0)
  })

  it('Monday (0) highest → 0', () => {
    expect(findBestDow([999, 1, 2, 3, 4, 5, 6])).toBe(0)
  })

  it('Sunday (6) highest among 7 real values', () => {
    expect(findBestDow([10, 20, 30, 40, 50, 60, 70])).toBe(6)
  })

  it('tie between two values → returns the first occurrence', () => {
    // [50, 50, 30] → first 50 is at index 0
    expect(findBestDow([50, 50, 30])).toBe(0)
  })

  it('all zeros → first index (0)', () => {
    expect(findBestDow([0, 0, 0, 0, 0, 0, 0])).toBe(0)
  })

  it('two-element array: larger at index 1', () => {
    expect(findBestDow([10, 20])).toBe(1)
  })

  it('two-element array: larger at index 0', () => {
    expect(findBestDow([20, 10])).toBe(0)
  })

  it('large values handled correctly', () => {
    expect(findBestDow([999_999, 1_000_000, 500_000])).toBe(1)
  })
})

// ── computeWeekendRatio ───────────────────────────────────────────────────────

describe('computeWeekendRatio', () => {
  it('empty array → 1.0', () => {
    expect(computeWeekendRatio([])).toBe(1.0)
  })

  it('no weekday days → 1.0 (guard)', () => {
    const onlyWeekends: DayData[] = [
      makeDay({ day_of_week: 5, revenue: 300 }),
      makeDay({ day_of_week: 6, revenue: 500 }),
    ]
    expect(computeWeekendRatio(onlyWeekends)).toBe(1.0)
  })

  it('weekday avg 1000, weekend avg 500 → ratio 0.5', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 1, revenue: 1000 }),
      makeDay({ day_of_week: 5, revenue: 500  }),
      makeDay({ day_of_week: 6, revenue: 500  }),
    ]
    expect(computeWeekendRatio(days)).toBeCloseTo(0.5, 5)
  })

  it('weekday avg 1000, weekend avg 2000 → ratio 2.0', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 5, revenue: 2000 }),
      makeDay({ day_of_week: 6, revenue: 2000 }),
    ]
    expect(computeWeekendRatio(days)).toBeCloseTo(2.0, 5)
  })

  it('weekday avg 0 (all zero revenue on weekdays) → 1.0', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 0 }),
      makeDay({ day_of_week: 5, revenue: 300 }),
    ]
    expect(computeWeekendRatio(days)).toBe(1.0)
  })

  it('no weekend days → ratio is 0 / weekday_avg', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 1, revenue: 2000 }),
    ]
    // weekendAvg = 0, weekdayAvg = 1500 → ratio = 0
    expect(computeWeekendRatio(days)).toBeCloseTo(0, 5)
  })

  // ── Additional weekend ratio tests ──────────────────────────────────────────

  it('equal weekend and weekday avg → ratio 1.0', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 500 }),
      makeDay({ day_of_week: 5, revenue: 500 }),
    ]
    expect(computeWeekendRatio(days)).toBeCloseTo(1.0, 5)
  })

  it('only one weekday and one weekend day', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 3, revenue: 400 }),
      makeDay({ day_of_week: 6, revenue: 600 }),
    ]
    // weekdayAvg = 400, weekendAvg = 600 → ratio = 600/400 = 1.5
    expect(computeWeekendRatio(days)).toBeCloseTo(1.5, 5)
  })

  it('multiple weekdays and one weekend day', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 200 }),
      makeDay({ day_of_week: 1, revenue: 400 }),
      makeDay({ day_of_week: 2, revenue: 600 }),
      makeDay({ day_of_week: 5, revenue: 300 }),
    ]
    // weekdayAvg = (200+400+600)/3 = 400, weekendAvg = 300, ratio = 300/400 = 0.75
    expect(computeWeekendRatio(days)).toBeCloseTo(0.75, 5)
  })

  it('Saturday-only weekend (no Sunday)', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 5, revenue: 2000 }),
    ]
    // weekdayAvg = 1000, weekendAvg = 2000 → ratio = 2.0
    expect(computeWeekendRatio(days)).toBeCloseTo(2.0, 5)
  })

  it('Sunday-only weekend (no Saturday)', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 6, revenue: 500 }),
    ]
    // weekdayAvg = 1000, weekendAvg = 500 → ratio = 0.5
    expect(computeWeekendRatio(days)).toBeCloseTo(0.5, 5)
  })

  it('all weekdays zero, all weekends nonzero → 1.0 (guard for weekdayAvg=0)', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 0 }),
      makeDay({ day_of_week: 1, revenue: 0 }),
      makeDay({ day_of_week: 2, revenue: 0 }),
      makeDay({ day_of_week: 5, revenue: 999 }),
      makeDay({ day_of_week: 6, revenue: 888 }),
    ]
    expect(computeWeekendRatio(days)).toBe(1.0)
  })

  it('full 7-day week with asymmetric revenues', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 100 }),
      makeDay({ day_of_week: 1, revenue: 200 }),
      makeDay({ day_of_week: 2, revenue: 300 }),
      makeDay({ day_of_week: 3, revenue: 400 }),
      makeDay({ day_of_week: 4, revenue: 500 }),
      makeDay({ day_of_week: 5, revenue: 600 }),
      makeDay({ day_of_week: 6, revenue: 700 }),
    ]
    // weekdayAvg = (100+200+300+400+500)/5 = 300
    // weekendAvg = (600+700)/2 = 650
    // ratio = 650/300 ≈ 2.1667
    expect(computeWeekendRatio(days)).toBeCloseTo(650 / 300, 4)
  })
})

// ── computeIntensity — formula clamping verification ─────────────────────────

describe('computeIntensity — formula and clamping', () => {
  it('formula: (value / maxValue) * 100', () => {
    // 40 / 80 * 100 = 50
    expect(computeIntensity(40, 80)).toBeCloseTo(50, 5)
  })

  it('75 of 200 → 37.5', () => {
    expect(computeIntensity(75, 200)).toBeCloseTo(37.5, 5)
  })

  it('value exactly maxValue → 100 (not above)', () => {
    expect(computeIntensity(250, 250)).toBe(100)
  })

  it('value 1 above maxValue → still 100 (clamped)', () => {
    expect(computeIntensity(101, 100)).toBe(100)
  })

  it('maxValue=0 with value=0 → 0 (guard)', () => {
    expect(computeIntensity(0, 0)).toBe(0)
  })

  it('maxValue=0 with value=99 → 0 (guard)', () => {
    expect(computeIntensity(99, 0)).toBe(0)
  })

  it('value=33, maxValue=100 → 33', () => {
    expect(computeIntensity(33, 100)).toBeCloseTo(33, 5)
  })

  it('result is always in [0, 100] range', () => {
    const cases = [
      [0, 0], [0, 100], [100, 100], [200, 100], [-50, 100],
      [50, 200], [1, 1000],
    ]
    for (const [v, m] of cases) {
      const r = computeIntensity(v!, m!)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(100)
    }
  })
})

// ── computeWeekNumber — formula floor(daysDiff/7) ─────────────────────────────

describe('computeWeekNumber — formula floor(daysDiff / 7)', () => {
  it('same date → 0', () => {
    expect(computeWeekNumber('2026-03-01', '2026-03-01')).toBe(0)
  })

  it('1 day later → floor(1/7) = 0', () => {
    expect(computeWeekNumber('2026-03-02', '2026-03-01')).toBe(0)
  })

  it('7 days later → floor(7/7) = 1', () => {
    expect(computeWeekNumber('2026-03-08', '2026-03-01')).toBe(1)
  })

  it('8 days later → floor(8/7) = 1', () => {
    expect(computeWeekNumber('2026-03-09', '2026-03-01')).toBe(1)
  })

  it('14 days later → floor(14/7) = 2', () => {
    expect(computeWeekNumber('2026-03-15', '2026-03-01')).toBe(2)
  })

  it('41 days later → floor(41/7) = 5', () => {
    expect(computeWeekNumber('2026-04-11', '2026-03-01')).toBe(5)
  })

  it('result is always a non-negative integer for dates from start onward', () => {
    // Use string-only date arithmetic to avoid timezone issues
    const startMs = new Date('2026-01-01').getTime()
    for (let d = 0; d < 91; d++) {
      const dateStr = new Date(startMs + d * 86_400_000).toISOString().slice(0, 10)
      const wn = computeWeekNumber(dateStr, '2026-01-01')
      expect(wn).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(wn)).toBe(true)
    }
  })
})

// ── computeDowIndex — all 7 days of the week ─────────────────────────────────

describe('computeDowIndex — all 7 weekdays', () => {
  it('Monday (2026-06-01) → 0', () => {
    expect(computeDowIndex('2026-06-01')).toBe(0)
  })

  it('Tuesday (2026-06-02) → 1', () => {
    expect(computeDowIndex('2026-06-02')).toBe(1)
  })

  it('Wednesday (2026-06-03) → 2', () => {
    expect(computeDowIndex('2026-06-03')).toBe(2)
  })

  it('Thursday (2026-06-04) → 3', () => {
    expect(computeDowIndex('2026-06-04')).toBe(3)
  })

  it('Friday (2026-06-05) → 4', () => {
    expect(computeDowIndex('2026-06-05')).toBe(4)
  })

  it('Saturday (2026-06-06) → 5', () => {
    expect(computeDowIndex('2026-06-06')).toBe(5)
  })

  it('Sunday (2026-06-07) → 6', () => {
    expect(computeDowIndex('2026-06-07')).toBe(6)
  })

  it('Monday 7 weeks later same index as original Monday', () => {
    const mon1 = computeDowIndex('2026-06-01')
    const mon2 = computeDowIndex('2026-07-20')  // also Monday
    expect(mon1).toBe(mon2)
  })
})

// ── findBestDow — edge cases and tie-breaking ─────────────────────────────────

describe('findBestDow — additional edge cases', () => {
  it('all same values → returns 0 (first occurrence wins)', () => {
    expect(findBestDow([10, 10, 10, 10, 10, 10, 10])).toBe(0)
  })

  it('single element array → 0', () => {
    expect(findBestDow([999])).toBe(0)
  })

  it('two elements: first greater → 0', () => {
    expect(findBestDow([100, 50])).toBe(0)
  })

  it('two elements: second greater → 1', () => {
    expect(findBestDow([50, 100])).toBe(1)
  })

  it('[0,0,0,0,0,0,100] → 6 (Sunday)', () => {
    expect(findBestDow([0, 0, 0, 0, 0, 0, 100])).toBe(6)
  })

  it('[100,0,0,0,0,0,0] → 0 (Monday)', () => {
    expect(findBestDow([100, 0, 0, 0, 0, 0, 0])).toBe(0)
  })

  it('tie at indices 2 and 5: first wins → 2', () => {
    expect(findBestDow([1, 2, 99, 3, 4, 99, 5])).toBe(2)
  })
})

// ── computeWeekendRatio — additional ratio verification ───────────────────────

describe('computeWeekendRatio — additional cases', () => {
  it('returns a number type', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 1000 }),
      makeDay({ day_of_week: 5, revenue: 500 }),
    ]
    expect(typeof computeWeekendRatio(days)).toBe('number')
  })

  it('ratio is always non-negative', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 0 }),
      makeDay({ day_of_week: 5, revenue: 0 }),
    ]
    expect(computeWeekendRatio(days)).toBeGreaterThanOrEqual(0)
  })

  it('all weekdays only → 0/weekdayAvg = 0', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 500 }),
      makeDay({ day_of_week: 1, revenue: 500 }),
      makeDay({ day_of_week: 2, revenue: 500 }),
      makeDay({ day_of_week: 3, revenue: 500 }),
      makeDay({ day_of_week: 4, revenue: 500 }),
    ]
    // weekendAvg = 0, weekdayAvg = 500 → ratio = 0
    expect(computeWeekendRatio(days)).toBeCloseTo(0, 5)
  })

  it('only weekend days → 1.0 (guard for no weekdays)', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 5, revenue: 800 }),
      makeDay({ day_of_week: 6, revenue: 1200 }),
    ]
    expect(computeWeekendRatio(days)).toBe(1.0)
  })

  it('weekdayAvg = weekendAvg → ratio = 1.0', () => {
    const days: DayData[] = [
      makeDay({ day_of_week: 0, revenue: 700 }),
      makeDay({ day_of_week: 5, revenue: 700 }),
    ]
    expect(computeWeekendRatio(days)).toBeCloseTo(1.0, 5)
  })
})
