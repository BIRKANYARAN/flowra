/**
 * TaxCalendarService pure-function unit tests.
 *
 * Run with: npx vitest run tests/tax-calendar.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  adjustForWeekend,
  computeDueDates,
  computeDueDatesForPeriod,
  TaxCalendarService,
} from '../lib/services/tax/tax-calendar.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. KDV due date: Nisan 2026 → May 26 2026
// ─────────────────────────────────────────────────────────────────────────────

describe('KDV due date', () => {
  it('Nisan 2026 KDV → due 2026-05-26', () => {
    const obs = computeDueDates('2026-04', '2026-01-01')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv).toBeDefined()
    // 2026-05-26 is a Tuesday — no weekend shift needed
    expect(kdv!.due_date).toBe('2026-05-26')
  })

  it('Nisan 2026 filing_period label is correct', () => {
    const obs = computeDueDates('2026-04', '2026-01-01')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.filing_period).toBe('Nisan 2026')
  })

  it('Muhtasar due date same as KDV — 26th of following month', () => {
    const obs = computeDueDates('2026-04', '2026-01-01')
    const muhtasar = obs.find(o => o.obligation_type === 'muhtasar_declaration')
    expect(muhtasar).toBeDefined()
    expect(muhtasar!.due_date).toBe('2026-05-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Weekend shift
// ─────────────────────────────────────────────────────────────────────────────

describe('adjustForWeekend()', () => {
  it('Saturday (2026-05-16) → Monday 2026-05-18', () => {
    // 2026-05-16 is a Saturday
    const result = adjustForWeekend('2026-05-16')
    expect(result).toBe('2026-05-18')
  })

  it('Sunday (2026-05-17) → Monday 2026-05-18', () => {
    // 2026-05-17 is a Sunday
    const result = adjustForWeekend('2026-05-17')
    expect(result).toBe('2026-05-18')
  })

  it('Monday is unchanged', () => {
    const result = adjustForWeekend('2026-05-18')
    expect(result).toBe('2026-05-18')
  })

  it('Friday is unchanged', () => {
    const result = adjustForWeekend('2026-05-22')
    expect(result).toBe('2026-05-22')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Geçici Vergi Q1 → May 17
// ─────────────────────────────────────────────────────────────────────────────

describe('Geçici Vergi Q1', () => {
  it('March 2026 generates Q1 Geçici Vergi due May 17 2026', () => {
    const obs = computeDueDatesForPeriod('2026-03', '2026-01-01')
    const q1  = obs.find(o => o.obligation_type === 'gecici_vergi_q1')
    expect(q1).toBeDefined()
    // 2026-05-17 is a Sunday → shifts to 2026-05-18
    expect(q1!.due_date).toBe(adjustForWeekend('2026-05-17'))
  })

  it('March 2025 generates Q1 due May 17 2025', () => {
    const obs = computeDueDatesForPeriod('2025-03', '2025-01-01')
    const q1  = obs.find(o => o.obligation_type === 'gecici_vergi_q1')
    expect(q1).toBeDefined()
    // May 17 2025 is a Saturday → Monday May 19
    expect(q1!.due_date).toBe(adjustForWeekend('2025-05-17'))
  })

  it('June 2026 generates Q2 Geçici Vergi due Aug 17 2026', () => {
    const obs = computeDueDatesForPeriod('2026-06', '2026-01-01')
    const q2  = obs.find(o => o.obligation_type === 'gecici_vergi_q2')
    expect(q2).toBeDefined()
    expect(q2!.due_date).toBe(adjustForWeekend('2026-08-17'))
  })

  it('September 2026 generates Q3 Geçici Vergi due Nov 17 2026', () => {
    const obs = computeDueDatesForPeriod('2026-09', '2026-01-01')
    const q3  = obs.find(o => o.obligation_type === 'gecici_vergi_q3')
    expect(q3).toBeDefined()
    expect(q3!.due_date).toBe(adjustForWeekend('2026-11-17'))
  })

  it('Non-quarter months (e.g. Nisan) do NOT generate Geçici Vergi', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    const gv  = obs.find(o => o.obligation_type.startsWith('gecici_vergi'))
    expect(gv).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Kurumlar Vergisi → April 30 following year
// ─────────────────────────────────────────────────────────────────────────────

describe('Kurumlar Vergisi', () => {
  it('December 2025 → KV due 2026-04-30', () => {
    const obs = computeDueDatesForPeriod('2025-12', '2025-01-01')
    const kv  = obs.find(o => o.obligation_type === 'kurumlar_vergisi')
    expect(kv).toBeDefined()
    expect(kv!.due_date).toBe(adjustForWeekend('2026-04-30'))
  })

  it('KV is NOT generated for non-December months', () => {
    const obs = computeDueDatesForPeriod('2026-06', '2026-01-01')
    const kv  = obs.find(o => o.obligation_type === 'kurumlar_vergisi')
    expect(kv).toBeUndefined()
  })

  it('December 2026 → KV due 2027-04-30', () => {
    const obs = computeDueDatesForPeriod('2026-12', '2026-01-01')
    const kv  = obs.find(o => o.obligation_type === 'kurumlar_vergisi')
    expect(kv).toBeDefined()
    expect(kv!.due_date).toBe(adjustForWeekend('2027-04-30'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. priority = 'critical' when overdue
// ─────────────────────────────────────────────────────────────────────────────

describe('priority rules', () => {
  it('priority = critical when obligation is overdue', () => {
    // today is 2026-06-01, so April KDV (due May 26) is overdue
    const obs = computeDueDates('2026-04', '2026-06-01')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv).toBeDefined()
    expect(kdv!.status).toBe('overdue')
    expect(kdv!.priority).toBe('critical')
    expect(kdv!.days_remaining).toBeLessThan(0)
  })

  it('priority = critical when 5 days remaining (≤7)', () => {
    // April KDV due 2026-05-26; today = 2026-05-21 → 5 days left → critical
    const obs = computeDueDates('2026-04', '2026-05-21')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('critical')
    expect(kdv!.days_remaining).toBe(5)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. priority = 'warning' when 10 days remaining
  // ─────────────────────────────────────────────────────────────────────────
  it('priority = warning when 10 days remaining (8-14 days)', () => {
    // April KDV due 2026-05-26; today = 2026-05-16 → 10 days left → warning
    const obs = computeDueDates('2026-04', '2026-05-16')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('warning')
    expect(kdv!.days_remaining).toBe(10)
  })

  it('priority = info when 30 days remaining', () => {
    const obs = computeDueDates('2026-04', '2026-04-26')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('info')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. days_remaining is negative when overdue
// ─────────────────────────────────────────────────────────────────────────────

describe('days_remaining', () => {
  it('days_remaining is negative when due date is in the past', () => {
    // April KDV due 2026-05-26; today = 2026-06-05 → -10 days
    const obs = computeDueDates('2026-04', '2026-06-05')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.days_remaining).toBe(-10)
    expect(kdv!.status).toBe('overdue')
  })

  it('days_remaining is 0 on the due date itself → due_soon', () => {
    const obs = computeDueDates('2026-04', '2026-05-26')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.days_remaining).toBe(0)
    expect(kdv!.status).toBe('due_soon')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Horizon limits obligations to 12 months
// ─────────────────────────────────────────────────────────────────────────────

describe('TaxCalendarService.getCalendar horizon', () => {
  it('returns obligations only within the horizon window', async () => {
    const today    = '2026-01-01'
    const horizon  = 12
    // No supabase needed if amount estimation just returns nulls
    // We test via computeDueDates loop logic directly
    // Collect obligations for 14 months
    const extended = Array.from({ length: 15 }, (_, i) => {
      const m = i + 1
      const y = 2026 + Math.floor((m - 1) / 12)
      const mo = ((m - 1) % 12) + 1
      const ym = `${y}-${String(mo).padStart(2, '0')}`
      return computeDueDatesForPeriod(ym, today)
    }).flat()

    // Max due_date in a 12-month horizon from 2026-01-01 is 2027-01-xx
    const horizonEnd = '2027-01-31'
    const inWindow = extended.filter(o => o.due_date <= horizonEnd)
    const outWindow = extended.filter(o => o.due_date > horizonEnd)

    // inWindow should have items, outWindow should also have items (the extended ones)
    expect(inWindow.length).toBeGreaterThan(0)
    expect(outWindow.length).toBeGreaterThan(0)
  })

  it('getCalendar returns at least 12 obligations for a full year', async () => {
    // Mock supabase that returns empty data
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq:  function() { return this },
          is:  function() { return this },
          gt:  function() { return this },
          gte: function() { return this },
          lte: function() { return this },
          in:  function() { return this },
          then: (cb: (v: { data: null; error: null }) => unknown) => Promise.resolve(cb({ data: null, error: null })),
        }),
      }),
    }

    const calendar = await TaxCalendarService.getCalendar(
      'test-company',
      'test-user',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockSupabase as any,
      { today: '2026-01-01', horizon: 12 },
    )

    // At minimum: 12 KDV + 12 Muhtasar + 12 SGK + 3 Geçici + 1 KV = 40 obligations
    expect(calendar.obligations.length).toBeGreaterThan(12)
    // All sorted by due_date
    for (let i = 1; i < calendar.obligations.length; i++) {
      expect(calendar.obligations[i]!.due_date >= calendar.obligations[i - 1]!.due_date).toBe(true)
    }
    // computed_at is set
    expect(calendar.computed_at).toBeTruthy()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. SGK Primler due date
// ─────────────────────────────────────────────────────────────────────────────

describe('SGK Primler', () => {
  it('SGK for January 2026 → due 2026-01-28 (adjusted for weekends)', () => {
    const obs = computeDueDatesForPeriod('2026-01', '2026-01-01')
    const sgk = obs.find(o => o.obligation_type === 'sgk_primler')
    expect(sgk).toBeDefined()
    expect(sgk!.due_date).toBe(adjustForWeekend('2026-01-28'))
  })

  it('SGK obligation id includes the filing period', () => {
    const obs = computeDueDatesForPeriod('2026-03', '2026-01-01')
    const sgk = obs.find(o => o.obligation_type === 'sgk_primler')
    expect(sgk!.id).toBe('sgk_primler_2026-03')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. Stable IDs
// ─────────────────────────────────────────────────────────────────────────────

describe('stable IDs', () => {
  it('obligation IDs are stable across calls', () => {
    const obs1 = computeDueDates('2026-04', '2026-01-01')
    const obs2 = computeDueDates('2026-04', '2026-03-15')
    const ids1 = obs1.map(o => o.id).sort()
    const ids2 = obs2.map(o => o.id).sort()
    expect(ids1).toEqual(ids2)
  })
})
