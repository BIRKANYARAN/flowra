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
})
