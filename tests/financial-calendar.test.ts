// ─────────────────────────────────────────────────────────────────────────────
// tests/financial-calendar.test.ts
//
// Unit tests for the FinancialCalendarService pure functions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  buildTaxEventsForYear,
  assignEventStatus,
  computeDaysUntil,
  buildMonthCalendar,
  sortEventsByDate,
  type CalendarEvent,
} from '../lib/services/intelligence/financial-calendar.service'

const TODAY = '2026-05-27'

// ── buildTaxEventsForYear ─────────────────────────────────────────────────────

describe('buildTaxEventsForYear', () => {

  it('returns an array of events', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    expect(Array.isArray(events)).toBe(true)
    expect(events.length).toBeGreaterThan(0)
  })

  it('contains exactly 29 total tax events (12 KDV + 12 SGK + 4 Geçici + 1 KV)', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    expect(events).toHaveLength(29)
  })

  it('contains exactly 12 KDV events', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const kdv = events.filter(e => e.type === 'tax_kdv')
    expect(kdv).toHaveLength(12)
  })

  it('contains exactly 12 SGK events', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const sgk = events.filter(e => e.type === 'tax_sgk')
    expect(sgk).toHaveLength(12)
  })

  it('contains exactly 4 Geçici Vergi events', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const gecici = events.filter(e => e.type === 'tax_gecici')
    expect(gecici).toHaveLength(4)
  })

  it('contains exactly 1 Kurumlar Vergisi event', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const kv = events.filter(e => e.type === 'tax_kv')
    expect(kv).toHaveLength(1)
  })

  it('KDV for April 2026 is due on 2026-05-26 (26th of next month)', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const aprilKdv = events.find(e => e.type === 'tax_kdv' && e.id === 'kdv-2026-04')
    expect(aprilKdv).toBeDefined()
    expect(aprilKdv!.date).toBe('2026-05-26')
  })

  it('KDV for December 2026 is due on 2027-01-26 (crosses year boundary)', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const decKdv = events.find(e => e.type === 'tax_kdv' && e.id === 'kdv-2026-12')
    expect(decKdv).toBeDefined()
    expect(decKdv!.date).toBe('2027-01-26')
  })

  it('Geçici Q1 is on 2026-05-17', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const q1 = events.find(e => e.type === 'tax_gecici' && e.id === 'gecici-2026-Q1')
    expect(q1).toBeDefined()
    expect(q1!.date).toBe('2026-05-17')
  })

  it('Geçici Q2 is on 2026-08-17', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const q2 = events.find(e => e.type === 'tax_gecici' && e.id === 'gecici-2026-Q2')
    expect(q2).toBeDefined()
    expect(q2!.date).toBe('2026-08-17')
  })

  it('Geçici Q3 is on 2026-11-17', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const q3 = events.find(e => e.type === 'tax_gecici' && e.id === 'gecici-2026-Q3')
    expect(q3).toBeDefined()
    expect(q3!.date).toBe('2026-11-17')
  })

  it('Geçici Q4 is on 2027-02-17 (next year)', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const q4 = events.find(e => e.type === 'tax_gecici' && e.id === 'gecici-2026-Q4')
    expect(q4).toBeDefined()
    expect(q4!.date).toBe('2027-02-17')
  })

  it('Kurumlar Vergisi is on 2027-04-30 (next year)', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const kv = events.find(e => e.type === 'tax_kv')
    expect(kv).toBeDefined()
    expect(kv!.date).toBe('2027-04-30')
  })

  it('all events have category "tax"', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    expect(events.every(e => e.category === 'tax')).toBe(true)
  })

  it('all events have is_blocking = true', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    expect(events.every(e => e.is_blocking === true)).toBe(true)
  })
})

// ── assignEventStatus ─────────────────────────────────────────────────────────

describe('assignEventStatus', () => {

  it('returns "due_today" when event date equals today', () => {
    expect(assignEventStatus('2026-05-27', '2026-05-27')).toBe('due_today')
  })

  it('returns "upcoming" when event date is in the future', () => {
    expect(assignEventStatus('2026-05-28', '2026-05-27')).toBe('upcoming')
  })

  it('returns "overdue" when event date is in the past', () => {
    expect(assignEventStatus('2026-05-26', '2026-05-27')).toBe('overdue')
  })

  it('returns "upcoming" for far future date', () => {
    expect(assignEventStatus('2026-12-31', '2026-05-27')).toBe('upcoming')
  })

  it('returns "overdue" for far past date', () => {
    expect(assignEventStatus('2025-01-01', '2026-05-27')).toBe('overdue')
  })
})

// ── computeDaysUntil ──────────────────────────────────────────────────────────

describe('computeDaysUntil', () => {

  it('returns 5 for 5 days in future', () => {
    expect(computeDaysUntil('2026-06-01', '2026-05-27')).toBe(5)
  })

  it('returns 0 for today', () => {
    expect(computeDaysUntil('2026-05-27', '2026-05-27')).toBe(0)
  })

  it('returns -7 for 7 days in the past', () => {
    expect(computeDaysUntil('2026-05-20', '2026-05-27')).toBe(-7)
  })

  it('returns positive for future dates', () => {
    const days = computeDaysUntil('2026-08-17', '2026-05-27')
    expect(days).toBeGreaterThan(0)
  })

  it('returns negative for past dates', () => {
    const days = computeDaysUntil('2026-01-01', '2026-05-27')
    expect(days).toBeLessThan(0)
  })
})

// ── buildMonthCalendar ────────────────────────────────────────────────────────

describe('buildMonthCalendar', () => {

  it('returns correct month_label for May 2026', () => {
    const cal = buildMonthCalendar(2026, 5, [])
    expect(cal.month_label).toBe('Mayıs 2026')
  })

  it('returns correct month_label for December 2026', () => {
    const cal = buildMonthCalendar(2026, 12, [])
    expect(cal.month_label).toBe('Aralık 2026')
  })

  it('counts events correctly', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const cal = buildMonthCalendar(2026, 5, events)
    // May 2026 should have: KDV(Apr→May26), SGK(Apr→May26), Geçici Q1(May17)
    // Plus KDV(May→Jun26) and SGK(May→Jun26) are in June, not May
    // So events falling in 2026-05: kdv-2026-04(May26), sgk-2026-04(May26), gecici-2026-Q1(May17)
    expect(cal.event_count).toBe(3)
    expect(cal.tax_events).toBe(3)
    expect(cal.accounting_events).toBe(0)
    expect(cal.partner_events).toBe(0)
  })

  it('sets is_heavy_month = true when event_count > 5', () => {
    const manyEvents: CalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      date: '2026-05-15',
      type: 'tax_kdv' as const,
      category: 'tax' as const,
      title: `Event ${i}`,
      description: '',
      status: 'upcoming' as const,
      days_until: 0,
      is_blocking: false,
    }))
    const cal = buildMonthCalendar(2026, 5, manyEvents)
    expect(cal.is_heavy_month).toBe(true)
  })

  it('sets is_heavy_month = false when event_count <= 5', () => {
    const cal = buildMonthCalendar(2026, 5, [])
    expect(cal.is_heavy_month).toBe(false)
  })

  it('only includes events from the specified month', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const cal = buildMonthCalendar(2026, 8, events)
    cal.events.forEach(e => {
      expect(e.date.startsWith('2026-08')).toBe(true)
    })
  })
})

// ── sortEventsByDate ──────────────────────────────────────────────────────────

describe('sortEventsByDate', () => {

  it('sorts events by date ASC', () => {
    const events: CalendarEvent[] = [
      { id: '2', date: '2026-08-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: '1', date: '2026-05-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: '3', date: '2026-11-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted[0].id).toBe('1')
    expect(sorted[1].id).toBe('2')
    expect(sorted[2].id).toBe('3')
  })

  it('on same date, tax events come before accounting events', () => {
    const events: CalendarEvent[] = [
      { id: 'acc', date: '2026-06-01', type: 'period_end', category: 'accounting', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'tax', date: '2026-06-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted[0].id).toBe('tax')
    expect(sorted[1].id).toBe('acc')
  })

  it('on same date, accounting events come before partner events', () => {
    const events: CalendarEvent[] = [
      { id: 'partner', date: '2026-06-01', type: 'loan_maturity', category: 'partner', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'acc',     date: '2026-06-01', type: 'period_end', category: 'accounting', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted[0].id).toBe('acc')
    expect(sorted[1].id).toBe('partner')
  })

  it('does not mutate the original array', () => {
    const events: CalendarEvent[] = [
      { id: '2', date: '2026-08-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: '1', date: '2026-05-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const original = [...events]
    sortEventsByDate(events)
    expect(events[0].id).toBe(original[0].id)
  })

  it('returns a new array (not the same reference)', () => {
    const events: CalendarEvent[] = [
      { id: '1', date: '2026-05-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted).not.toBe(events)
  })

  it('governance events come last on same date', () => {
    const events: CalendarEvent[] = [
      { id: 'gov',     date: '2026-06-01', type: 'workflow_deadline', category: 'governance', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'partner', date: '2026-06-01', type: 'loan_maturity',     category: 'partner',    title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'acc',     date: '2026-06-01', type: 'period_end',        category: 'accounting', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'tax',     date: '2026-06-01', type: 'tax_kdv',           category: 'tax',        title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted[0].id).toBe('tax')
    expect(sorted[1].id).toBe('acc')
    expect(sorted[2].id).toBe('partner')
    expect(sorted[3].id).toBe('gov')
  })

  it('handles empty array', () => {
    expect(sortEventsByDate([])).toEqual([])
  })

  it('handles single-element array', () => {
    const events: CalendarEvent[] = [
      { id: '1', date: '2026-05-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].id).toBe('1')
  })

  it('all-same-date all-same-category: order stable or consistent', () => {
    const events: CalendarEvent[] = [
      { id: 'a', date: '2026-06-01', type: 'tax_kdv', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'b', date: '2026-06-01', type: 'tax_sgk', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const sorted = sortEventsByDate(events)
    expect(sorted).toHaveLength(2)
    // Both are tax on same date — either order is fine, but result must include both
    const ids = sorted.map(e => e.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
  })
})

// ── buildTaxEventsForYear — additional edge-case tests ────────────────────────

describe('buildTaxEventsForYear — year boundaries', () => {

  it('works for year 2025', () => {
    const events = buildTaxEventsForYear(2025, '2025-01-01')
    expect(events).toHaveLength(29)
  })

  it('works for year 2030', () => {
    const events = buildTaxEventsForYear(2030, '2030-01-01')
    expect(events).toHaveLength(29)
  })

  it('December KDV for 2025 is on 2026-01-26', () => {
    const events = buildTaxEventsForYear(2025, '2025-01-01')
    const dec = events.find(e => e.id === 'kdv-2025-12')
    expect(dec).toBeDefined()
    expect(dec!.date).toBe('2026-01-26')
  })

  it('KV for 2025 is on 2026-04-30', () => {
    const events = buildTaxEventsForYear(2025, '2025-01-01')
    const kv = events.find(e => e.type === 'tax_kv')
    expect(kv).toBeDefined()
    expect(kv!.date).toBe('2026-04-30')
  })

  it('Geçici Q4 for 2025 is on 2026-02-17', () => {
    const events = buildTaxEventsForYear(2025, '2025-01-01')
    const q4 = events.find(e => e.id === 'gecici-2025-Q4')
    expect(q4).toBeDefined()
    expect(q4!.date).toBe('2026-02-17')
  })

  it('each KDV event has action_href containing /dashboard/finance', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const kdv = events.filter(e => e.type === 'tax_kdv')
    expect(kdv.every(e => e.action_href?.includes('/dashboard/finance'))).toBe(true)
  })

  it('each SGK event has action_label set', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const sgk = events.filter(e => e.type === 'tax_sgk')
    expect(sgk.every(e => typeof e.action_label === 'string' && e.action_label.length > 0)).toBe(true)
  })

  it('event IDs are unique across all 29 events', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const ids = events.map(e => e.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('January KDV due date is February 26 of same year', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const jan = events.find(e => e.id === 'kdv-2026-01')
    expect(jan).toBeDefined()
    expect(jan!.date).toBe('2026-02-26')
  })

  it('June KDV due date is July 26 of same year', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const jun = events.find(e => e.id === 'kdv-2026-06')
    expect(jun).toBeDefined()
    expect(jun!.date).toBe('2026-07-26')
  })

  it('KDV and SGK for same month share the same due date', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0')
      const kdv = events.find(e => e.id === `kdv-2026-${mm}`)
      const sgk = events.find(e => e.id === `sgk-2026-${mm}`)
      expect(kdv).toBeDefined()
      expect(sgk).toBeDefined()
      expect(kdv!.date).toBe(sgk!.date)
    }
  })

  it('Geçici Q1 title contains year and Q1', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const q1 = events.find(e => e.id === 'gecici-2026-Q1')
    expect(q1!.title).toContain('2026')
    expect(q1!.title).toContain('Q1')
  })

  it('KV event id is kv-<year>', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const kv = events.find(e => e.type === 'tax_kv')
    expect(kv!.id).toBe('kv-2026')
  })
})

// ── computeDaysUntil — additional cases ──────────────────────────────────────

describe('computeDaysUntil — edge cases', () => {

  it('works across year boundary', () => {
    expect(computeDaysUntil('2027-01-01', '2026-12-31')).toBe(1)
  })

  it('works for 365-day span', () => {
    expect(computeDaysUntil('2027-05-27', '2026-05-27')).toBe(365)
  })

  it('symmetric: reverse gives negative of forward', () => {
    const fwd = computeDaysUntil('2026-06-01', '2026-05-27')
    const rev = computeDaysUntil('2026-05-27', '2026-06-01')
    expect(fwd).toBe(-rev)
  })

  it('returns integer (no decimals)', () => {
    const days = computeDaysUntil('2026-06-15', '2026-05-27')
    expect(Number.isInteger(days)).toBe(true)
  })

  it('returns exact 1 for next day', () => {
    expect(computeDaysUntil('2026-05-28', '2026-05-27')).toBe(1)
  })

  it('returns exact -1 for previous day', () => {
    expect(computeDaysUntil('2026-05-26', '2026-05-27')).toBe(-1)
  })

  it('same date same year different month', () => {
    // May 27 to Jul 27 = exactly 61 days (May has 31: 4 remain + 30 june + 27 jul = 61)
    expect(computeDaysUntil('2026-07-27', '2026-05-27')).toBe(61)
  })
})

// ── assignEventStatus — additional edge cases ─────────────────────────────────

describe('assignEventStatus — additional', () => {

  it('tomorrow is upcoming', () => {
    expect(assignEventStatus('2026-05-28', '2026-05-27')).toBe('upcoming')
  })

  it('yesterday is overdue', () => {
    expect(assignEventStatus('2026-05-26', '2026-05-27')).toBe('overdue')
  })

  it('one year in future is upcoming', () => {
    expect(assignEventStatus('2027-05-27', '2026-05-27')).toBe('upcoming')
  })

  it('one year in past is overdue', () => {
    expect(assignEventStatus('2025-05-27', '2026-05-27')).toBe('overdue')
  })

  it('does not return completed (that is set externally)', () => {
    const s = assignEventStatus('2026-05-27', '2026-05-27')
    expect(s).not.toBe('completed')
  })

  it('only returns one of three values: upcoming, due_today, overdue', () => {
    const valid = new Set(['upcoming', 'due_today', 'overdue'])
    const cases = [
      ['2026-01-01', '2026-05-27'],
      ['2026-05-27', '2026-05-27'],
      ['2026-12-31', '2026-05-27'],
    ] as const
    for (const [eventDate, today] of cases) {
      expect(valid.has(assignEventStatus(eventDate, today))).toBe(true)
    }
  })
})

// ── buildMonthCalendar — additional tests ────────────────────────────────────

describe('buildMonthCalendar — month labels (Turkish)', () => {

  const TR_LABEL_CASES: [number, string][] = [
    [1,  'Ocak 2026'],
    [2,  'Şubat 2026'],
    [3,  'Mart 2026'],
    [4,  'Nisan 2026'],
    [5,  'Mayıs 2026'],
    [6,  'Haziran 2026'],
    [7,  'Temmuz 2026'],
    [8,  'Ağustos 2026'],
    [9,  'Eylül 2026'],
    [10, 'Ekim 2026'],
    [11, 'Kasım 2026'],
    [12, 'Aralık 2026'],
  ]

  for (const [month, expected] of TR_LABEL_CASES) {
    it(`month ${month} label is "${expected}"`, () => {
      const cal = buildMonthCalendar(2026, month, [])
      expect(cal.month_label).toBe(expected)
    })
  }

  it('year and month properties are set correctly', () => {
    const cal = buildMonthCalendar(2027, 3, [])
    expect(cal.year).toBe(2027)
    expect(cal.month).toBe(3)
  })

  it('events list is empty when no events passed', () => {
    const cal = buildMonthCalendar(2026, 6, [])
    expect(cal.events).toHaveLength(0)
    expect(cal.event_count).toBe(0)
  })

  it('filters out events from other months', () => {
    const events = buildTaxEventsForYear(2026, TODAY)
    const cal = buildMonthCalendar(2026, 1, events)
    cal.events.forEach(e => {
      expect(e.date.startsWith('2026-01')).toBe(true)
    })
  })

  it('events within month are sorted by date', () => {
    const events: CalendarEvent[] = [
      { id: 'b', date: '2026-05-26', type: 'tax_sgk', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'a', date: '2026-05-17', type: 'tax_gecici', category: 'tax', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const cal = buildMonthCalendar(2026, 5, events)
    expect(cal.events[0].id).toBe('a')
    expect(cal.events[1].id).toBe('b')
  })

  it('is_heavy_month = true at exactly 6 events', () => {
    const events: CalendarEvent[] = Array.from({ length: 6 }, (_, i) => ({
      id: `x${i}`,
      date: '2026-06-15',
      type: 'tax_kdv' as const,
      category: 'tax' as const,
      title: '',
      description: '',
      status: 'upcoming' as const,
      days_until: 0,
      is_blocking: false,
    }))
    const cal = buildMonthCalendar(2026, 6, events)
    expect(cal.is_heavy_month).toBe(true)
  })

  it('is_heavy_month = false at exactly 5 events', () => {
    const events: CalendarEvent[] = Array.from({ length: 5 }, (_, i) => ({
      id: `y${i}`,
      date: '2026-06-15',
      type: 'tax_kdv' as const,
      category: 'tax' as const,
      title: '',
      description: '',
      status: 'upcoming' as const,
      days_until: 0,
      is_blocking: false,
    }))
    const cal = buildMonthCalendar(2026, 6, events)
    expect(cal.is_heavy_month).toBe(false)
  })

  it('partner_events count is correct', () => {
    const events: CalendarEvent[] = [
      { id: 'p1', date: '2026-07-10', type: 'loan_maturity',    category: 'partner', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 'p2', date: '2026-07-20', type: 'capital_payment',  category: 'partner', title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
      { id: 't1', date: '2026-07-26', type: 'tax_kdv',          category: 'tax',     title: '', description: '', status: 'upcoming', days_until: 0, is_blocking: false },
    ]
    const cal = buildMonthCalendar(2026, 7, events)
    expect(cal.partner_events).toBe(2)
    expect(cal.tax_events).toBe(1)
    expect(cal.accounting_events).toBe(0)
    expect(cal.event_count).toBe(3)
  })
})
