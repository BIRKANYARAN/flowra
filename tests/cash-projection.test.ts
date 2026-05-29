/**
 * Cash Projection Service — unit tests
 *
 * Tests pure helpers:
 *   - assignToWeek           (correct week bucket, before/after window, exact start)
 *   - computeWeekLabel       (H1..H13)
 *   - buildWeeklyPattern     (avg from historical data, empty, zero weeks)
 *   - computeConfidence      (high/medium/low thresholds)
 *   - detectNegativeCashWeeks (correct indices, all positive, all negative)
 *   - getWeekStart           (Monday alignment)
 *   - nextMonday             (correct next Monday from various days)
 *   - addWeeks               (date arithmetic)
 *
 * No DB or network calls — all in-memory.
 */

import { describe, it, expect } from 'vitest'
import {
  assignToWeek,
  computeWeekLabel,
  buildWeeklyPattern,
  computeConfidence,
  detectNegativeCashWeeks,
  getWeekStart,
  nextMonday,
  addWeeks,
} from '../lib/services/finance/cash-projection.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build 13 consecutive Monday dates starting from a given Monday string */
function buildWeekStarts(firstMonday: string): string[] {
  return Array.from({ length: 13 }, (_, i) => addWeeks(firstMonday, i))
}

// ── getWeekStart ──────────────────────────────────────────────────────────────

describe('getWeekStart', () => {
  it('returns Monday for a Monday input', () => {
    expect(getWeekStart('2026-05-25')).toBe('2026-05-25') // Monday
  })

  it('returns Monday for a Wednesday input', () => {
    expect(getWeekStart('2026-05-27')).toBe('2026-05-25') // Mon of same week
  })

  it('returns Monday for a Sunday input', () => {
    expect(getWeekStart('2026-05-31')).toBe('2026-05-25') // Sun → previous Mon
  })

  it('returns Monday for a Saturday input', () => {
    expect(getWeekStart('2026-05-30')).toBe('2026-05-25')
  })
})

// ── nextMonday ────────────────────────────────────────────────────────────────

describe('nextMonday', () => {
  it('returns next Monday from a Wednesday', () => {
    expect(nextMonday('2026-05-27')).toBe('2026-06-01') // Wed → next Mon
  })

  it('returns next Monday from a Monday (not same day)', () => {
    expect(nextMonday('2026-05-25')).toBe('2026-06-01')
  })

  it('returns next Monday from a Sunday', () => {
    expect(nextMonday('2026-05-31')).toBe('2026-06-01')
  })

  it('returns next Monday from a Tuesday', () => {
    expect(nextMonday('2026-05-26')).toBe('2026-06-01')
  })
})

// ── addWeeks ──────────────────────────────────────────────────────────────────

describe('addWeeks', () => {
  it('adds 0 weeks (identity)', () => {
    expect(addWeeks('2026-06-01', 0)).toBe('2026-06-01')
  })

  it('adds 1 week', () => {
    expect(addWeeks('2026-06-01', 1)).toBe('2026-06-08')
  })

  it('adds 12 weeks (end of 13-week window)', () => {
    expect(addWeeks('2026-06-01', 12)).toBe('2026-08-24')
  })

  it('subtracts weeks with negative value', () => {
    expect(addWeeks('2026-06-08', -1)).toBe('2026-06-01')
  })
})

// ── assignToWeek ──────────────────────────────────────────────────────────────

describe('assignToWeek', () => {
  const firstMonday = '2026-06-01'
  const weekStarts  = buildWeekStarts(firstMonday)

  it('assigns first day of window to week 0', () => {
    expect(assignToWeek('2026-06-01', weekStarts)).toBe(0)
  })

  it('assigns mid-week date to correct week (week 0)', () => {
    expect(assignToWeek('2026-06-03', weekStarts)).toBe(0)
  })

  it('assigns last day of week 0 (Sunday) to week 0', () => {
    expect(assignToWeek('2026-06-07', weekStarts)).toBe(0)
  })

  it('assigns first day of week 1 (Monday) to week 1', () => {
    expect(assignToWeek('2026-06-08', weekStarts)).toBe(1)
  })

  it('assigns date to week 12 (last week)', () => {
    expect(assignToWeek('2026-08-24', weekStarts)).toBe(12)
  })

  it('returns -1 for date before week window', () => {
    expect(assignToWeek('2026-05-31', weekStarts)).toBe(-1)
  })

  it('assigns date far after window end to last week (12)', () => {
    // A date after the last week start stays in week 12
    expect(assignToWeek('2026-12-31', weekStarts)).toBe(12)
  })
})

// ── computeWeekLabel ─────────────────────────────────────────────────────────

describe('computeWeekLabel', () => {
  it('returns H1 for index 0', () => {
    expect(computeWeekLabel(0)).toBe('H1')
  })

  it('returns H13 for index 12', () => {
    expect(computeWeekLabel(12)).toBe('H13')
  })

  it('returns H7 for index 6', () => {
    expect(computeWeekLabel(6)).toBe('H7')
  })
})

// ── buildWeeklyPattern ────────────────────────────────────────────────────────

describe('buildWeeklyPattern', () => {
  it('returns 0 for empty records array', () => {
    expect(buildWeeklyPattern([], '2026-05-27')).toBe(0)
  })

  it('calculates average over 12 weeks', () => {
    // 12 weeks * 1000/week = 12000 total, avg = 1000
    // Use today='2026-03-09' and dates starting 11 weeks before → all 12 within window
    const today = '2026-03-09'
    const records = Array.from({ length: 12 }, (_, i) => ({
      date:   addWeeks('2025-12-15', i), // 12 Mondays: 2025-12-15 .. 2026-03-02
      amount: 1000,
    }))
    const avg = buildWeeklyPattern(records, today)
    expect(avg).toBeCloseTo(1000, 0)
  })

  it('excludes records older than 12 weeks', () => {
    const records = [
      { date: '2025-01-01', amount: 999999 }, // way in the past
      { date: '2026-05-20', amount: 1200 },
    ]
    const avg = buildWeeklyPattern(records, '2026-05-27')
    // only the 1200 record counts, divided by 12 weeks
    expect(avg).toBeCloseTo(1200 / 12, 2)
  })

  it('excludes future records (date > today)', () => {
    const records = [
      { date: '2026-06-15', amount: 50000 }, // future
      { date: '2026-05-20', amount: 600 },
    ]
    const avg = buildWeeklyPattern(records, '2026-05-27')
    expect(avg).toBeCloseTo(600 / 12, 2)
  })

  it('returns 0 when all records are outside the window', () => {
    const records = [
      { date: '2024-01-01', amount: 500 },
    ]
    expect(buildWeeklyPattern(records, '2026-05-27')).toBe(0)
  })
})

// ── computeConfidence ─────────────────────────────────────────────────────────

describe('computeConfidence', () => {
  it('returns high when 100% committed', () => {
    expect(computeConfidence(5000, 0, 3000, 0)).toBe('high')
  })

  it('returns high when >=70% committed', () => {
    // committed = 7, estimated = 3 → 70%
    expect(computeConfidence(7, 3, 0, 0)).toBe('high')
  })

  it('returns medium when 50% committed', () => {
    expect(computeConfidence(5, 5, 0, 0)).toBe('medium')
  })

  it('returns medium when 30% committed', () => {
    // committed = 3, estimated = 7 → 30%
    expect(computeConfidence(3, 7, 0, 0)).toBe('medium')
  })

  it('returns low when <30% committed', () => {
    // committed = 2, estimated = 8 → 20%
    expect(computeConfidence(2, 8, 0, 0)).toBe('low')
  })

  it('returns high for empty week (all zeros)', () => {
    expect(computeConfidence(0, 0, 0, 0)).toBe('high')
  })

  it('considers both inflow and outflow for ratio', () => {
    // committed inflow=0, committed outflow=800, estimated inflow=100, estimated outflow=100
    // total committed = 800, total estimated = 200, ratio = 80% → high
    expect(computeConfidence(0, 100, 800, 100)).toBe('high')
  })
})

// ── detectNegativeCashWeeks ───────────────────────────────────────────────────

describe('detectNegativeCashWeeks', () => {
  it('returns empty array when all weeks are positive', () => {
    const weeks = [
      { cumulative_cash: 100 },
      { cumulative_cash: 200 },
      { cumulative_cash: 50 },
    ]
    expect(detectNegativeCashWeeks(weeks)).toEqual([])
  })

  it('returns correct indices for negative weeks', () => {
    const weeks = [
      { cumulative_cash: 100 },
      { cumulative_cash: -50 },  // index 1
      { cumulative_cash: 200 },
      { cumulative_cash: -100 }, // index 3
    ]
    expect(detectNegativeCashWeeks(weeks)).toEqual([1, 3])
  })

  it('returns all indices when all weeks are negative', () => {
    const weeks = [
      { cumulative_cash: -10 },
      { cumulative_cash: -20 },
      { cumulative_cash: -5 },
    ]
    expect(detectNegativeCashWeeks(weeks)).toEqual([0, 1, 2])
  })

  it('returns empty array for empty input', () => {
    expect(detectNegativeCashWeeks([])).toEqual([])
  })

  it('treats zero cumulative as non-negative (boundary)', () => {
    const weeks = [{ cumulative_cash: 0 }]
    expect(detectNegativeCashWeeks(weeks)).toEqual([])
  })

  it('handles 13-week projection with one negative week in middle', () => {
    const weeks = Array.from({ length: 13 }, (_, i) => ({
      cumulative_cash: i === 6 ? -1 : 1000,
    }))
    expect(detectNegativeCashWeeks(weeks)).toEqual([6])
  })
})

// ── getWeekStart — additional boundary tests ──────────────────────────────────

describe('getWeekStart — additional', () => {
  it('returns same Monday for Friday input', () => {
    // 2026-05-29 is a Friday; Monday of that week is 2026-05-25
    expect(getWeekStart('2026-05-29')).toBe('2026-05-25')
  })

  it('handles month boundary — last day Dec into Jan', () => {
    // 2025-12-31 is Wednesday; Monday is 2025-12-29
    expect(getWeekStart('2025-12-31')).toBe('2025-12-29')
  })

  it('handles year boundary — first day Jan', () => {
    // 2026-01-01 is Thursday; Monday of that week is 2025-12-29
    expect(getWeekStart('2026-01-01')).toBe('2025-12-29')
  })

  it('Monday in different month is correct', () => {
    // 2026-03-02 is Monday
    expect(getWeekStart('2026-03-02')).toBe('2026-03-02')
  })

  it('Tuesday returns prior Monday', () => {
    // 2026-05-26 is Tuesday
    expect(getWeekStart('2026-05-26')).toBe('2026-05-25')
  })
})

// ── nextMonday — additional boundary tests ────────────────────────────────────

describe('nextMonday — additional', () => {
  it('returns correct next Monday from Friday', () => {
    // 2026-05-29 is Friday → next Mon = 2026-06-01
    expect(nextMonday('2026-05-29')).toBe('2026-06-01')
  })

  it('returns correct next Monday from Saturday', () => {
    // 2026-05-30 is Saturday → next Mon = 2026-06-01
    expect(nextMonday('2026-05-30')).toBe('2026-06-01')
  })

  it('year-end wraps correctly', () => {
    // 2025-12-27 is Saturday → next Mon = 2025-12-29
    expect(nextMonday('2025-12-27')).toBe('2025-12-29')
  })

  it('Thursday input returns correct next Monday', () => {
    // 2026-06-04 is Thursday → next Mon = 2026-06-08
    expect(nextMonday('2026-06-04')).toBe('2026-06-08')
  })
})

// ── addWeeks — additional tests ───────────────────────────────────────────────

describe('addWeeks — additional', () => {
  it('adds 4 weeks across a month boundary', () => {
    expect(addWeeks('2026-05-04', 4)).toBe('2026-06-01')
  })

  it('adds 13 weeks (one full 90-day window)', () => {
    expect(addWeeks('2026-06-01', 13)).toBe('2026-08-31')
  })

  it('subtracts 12 weeks', () => {
    // 2026-08-24 - 12 weeks (84 days) = 2026-06-01
    expect(addWeeks('2026-08-24', -12)).toBe('2026-06-01')
  })

  it('adds weeks across year boundary', () => {
    expect(addWeeks('2025-12-22', 2)).toBe('2026-01-05')
  })

  it('result is always a valid date string format', () => {
    const result = addWeeks('2026-01-15', 26)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── assignToWeek — additional boundary tests ──────────────────────────────────

describe('assignToWeek — additional', () => {
  const firstMonday = '2026-06-01'
  const weekStarts = Array.from({ length: 13 }, (_, i) => addWeeks(firstMonday, i))

  it('date at exact start of week 5 (index 4) → 4', () => {
    const week5Start = addWeeks(firstMonday, 4) // 2026-06-29
    expect(assignToWeek(week5Start, weekStarts)).toBe(4)
  })

  it('date one day before week 5 is still in week 4 (index 3)', () => {
    // Day before week5 start (Monday) is Sunday in week 4
    const week5Start = addWeeks(firstMonday, 4)
    const d = new Date(week5Start + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - 1)
    const dayBefore = d.toISOString().slice(0, 10)
    expect(assignToWeek(dayBefore, weekStarts)).toBe(3)
  })

  it('date one day after final week start (week 12) returns 12', () => {
    const week13Start = addWeeks(firstMonday, 12)
    const d = new Date(week13Start + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    const dayAfter = d.toISOString().slice(0, 10)
    expect(assignToWeek(dayAfter, weekStarts)).toBe(12)
  })

  it('empty weekStarts returns -1', () => {
    expect(assignToWeek('2026-06-01', [])).toBe(-1)
  })

  it('single-element weekStarts: date exactly on it → 0', () => {
    expect(assignToWeek('2026-06-01', ['2026-06-01'])).toBe(0)
  })

  it('single-element weekStarts: date before it → -1', () => {
    expect(assignToWeek('2026-05-31', ['2026-06-01'])).toBe(-1)
  })

  it('single-element weekStarts: date after it → 0', () => {
    expect(assignToWeek('2026-07-01', ['2026-06-01'])).toBe(0)
  })
})

// ── computeWeekLabel — additional tests ───────────────────────────────────────

describe('computeWeekLabel — additional', () => {
  it('returns H2 for index 1', () => {
    expect(computeWeekLabel(1)).toBe('H2')
  })

  it('returns H6 for index 5', () => {
    expect(computeWeekLabel(5)).toBe('H6')
  })

  it('returns H10 for index 9', () => {
    expect(computeWeekLabel(9)).toBe('H10')
  })

  it('all 13 labels are unique', () => {
    const labels = Array.from({ length: 13 }, (_, i) => computeWeekLabel(i))
    const uniqueLabels = new Set(labels)
    expect(uniqueLabels.size).toBe(13)
  })

  it('all labels match H{n} pattern', () => {
    for (let i = 0; i < 13; i++) {
      expect(computeWeekLabel(i)).toMatch(/^H\d+$/)
    }
  })
})

// ── buildWeeklyPattern — additional tests ─────────────────────────────────────

describe('buildWeeklyPattern — additional', () => {
  it('single record within window contributes proportionally', () => {
    // today=2026-05-27, one record at 2026-05-20 with amount 12_000 → avg = 12_000/12 = 1_000
    const result = buildWeeklyPattern(
      [{ date: '2026-05-20', amount: 12_000 }],
      '2026-05-27',
    )
    expect(result).toBeCloseTo(1_000, 2)
  })

  it('records on cutoff boundary are included (date >= cutoff)', () => {
    // Use a custom 4-week look-back for simplicity
    const today = '2026-04-01'
    const cutoff = addWeeks(today, -4) // 4 weeks ago
    // cutoff ≈ 2026-03-04 — add a record exactly on that date
    const records = [{ date: cutoff, amount: 4_000 }]
    const avg = buildWeeklyPattern(records, today, 4)
    expect(avg).toBeCloseTo(1_000, 1)
  })

  it('records exactly on today are included', () => {
    const today = '2026-05-27'
    const records = [{ date: today, amount: 6_000 }]
    const avg = buildWeeklyPattern(records, today, 6)
    expect(avg).toBeCloseTo(1_000, 2)
  })

  it('custom weeks parameter changes denominator', () => {
    const today = '2026-05-27'
    const records = [{ date: '2026-05-20', amount: 600 }]
    const avg6  = buildWeeklyPattern(records, today, 6)
    const avg12 = buildWeeklyPattern(records, today, 12)
    expect(avg6).toBeGreaterThan(avg12) // smaller denominator → larger avg
  })

  it('multiple records in window sum correctly', () => {
    const today = '2026-05-27'
    const records = [
      { date: '2026-05-01', amount: 1_200 },
      { date: '2026-05-10', amount: 2_400 },
      { date: '2026-05-20', amount: 3_600 },
    ]
    const avg = buildWeeklyPattern(records, today, 12)
    // total = 7_200, /12 = 600
    expect(avg).toBeCloseTo(600, 1)
  })
})

// ── computeConfidence — additional tests ──────────────────────────────────────

describe('computeConfidence — additional', () => {
  it('69% committed (just below high threshold) → medium', () => {
    // committed=69, estimated=31 → 69% → medium
    expect(computeConfidence(69, 31, 0, 0)).toBe('medium')
  })

  it('70% exactly → high', () => {
    expect(computeConfidence(70, 30, 0, 0)).toBe('high')
  })

  it('29% committed → low', () => {
    // committed=29, estimated=71 → 29% → low
    expect(computeConfidence(29, 71, 0, 0)).toBe('low')
  })

  it('30% exactly → medium', () => {
    expect(computeConfidence(30, 70, 0, 0)).toBe('medium')
  })

  it('100% committed and 0 estimated → high', () => {
    expect(computeConfidence(10_000, 0, 5_000, 0)).toBe('high')
  })

  it('0% committed (all estimated) → low', () => {
    expect(computeConfidence(0, 1_000, 0, 1_000)).toBe('low')
  })

  it('symmetrical: flipping inflow/outflow committed vs estimated gives same result', () => {
    // committed total = 4, estimated = 6 → 40% → medium
    const r1 = computeConfidence(4, 6, 0, 0)
    const r2 = computeConfidence(0, 0, 4, 6)
    expect(r1).toBe(r2)
  })
})

// ── detectNegativeCashWeeks — additional tests ────────────────────────────────

describe('detectNegativeCashWeeks — additional', () => {
  it('exactly -0.01 is treated as negative', () => {
    const weeks = [{ cumulative_cash: -0.01 }]
    expect(detectNegativeCashWeeks(weeks)).toEqual([0])
  })

  it('very large negative value counted', () => {
    const weeks = [
      { cumulative_cash: 1_000_000 },
      { cumulative_cash: -9_999_999 },
    ]
    expect(detectNegativeCashWeeks(weeks)).toEqual([1])
  })

  it('returns indices in ascending order', () => {
    const weeks = Array.from({ length: 13 }, (_, i) => ({
      cumulative_cash: i % 3 === 0 ? -1 : 1,
    }))
    const result = detectNegativeCashWeeks(weeks)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1])
    }
  })

  it('single positive element → empty array', () => {
    expect(detectNegativeCashWeeks([{ cumulative_cash: 1 }])).toEqual([])
  })
})
