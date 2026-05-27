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
