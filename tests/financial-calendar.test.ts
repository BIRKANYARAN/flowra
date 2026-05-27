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
})
