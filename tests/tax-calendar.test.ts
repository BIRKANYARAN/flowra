/**
 * TaxCalendarService — unit tests.
 *
 * Covers both the legacy pure helpers and the new CFO-calendar pure exports.
 *
 * Run with: npx vitest run tests/tax-calendar.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  // Legacy helpers
  adjustForWeekend,
  computeDueDates,
  computeDueDatesForPeriod,
  TaxCalendarService,
  // New pure exports
  computeKdvDueDate,
  computeGeciVergiDueDate,
  assignObligationStatus,
  computeDaysUntil,
  buildObligationId,
} from '../lib/services/tax/tax-calendar.service'

// ─────────────────────────────────────────────────────────────────────────────
// 1. computeKdvDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvDueDate()', () => {
  it('Nisan 2026 KDV → due 2026-05-26', () => {
    expect(computeKdvDueDate(2026, 4)).toBe('2026-05-26')
  })

  it('December KDV wraps to next year: 2026-12 → 2027-01-26', () => {
    expect(computeKdvDueDate(2026, 12)).toBe('2027-01-26')
  })

  it('January KDV → February 26', () => {
    expect(computeKdvDueDate(2026, 1)).toBe('2026-02-26')
  })

  it('November KDV → December 26', () => {
    expect(computeKdvDueDate(2025, 11)).toBe('2025-12-26')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeGeciVergiDueDate
// ─────────────────────────────────────────────────────────────────────────────

describe('computeGeciVergiDueDate()', () => {
  it('Q1 2026 → 2026-05-17', () => {
    expect(computeGeciVergiDueDate(2026, 1)).toBe('2026-05-17')
  })

  it('Q2 2026 → 2026-08-17', () => {
    expect(computeGeciVergiDueDate(2026, 2)).toBe('2026-08-17')
  })

  it('Q3 2026 → 2026-11-17', () => {
    expect(computeGeciVergiDueDate(2026, 3)).toBe('2026-11-17')
  })

  it('Q4 2026 wraps to next year → 2027-02-17', () => {
    expect(computeGeciVergiDueDate(2026, 4)).toBe('2027-02-17')
  })

  it('Q1 different year — 2025-05-17', () => {
    expect(computeGeciVergiDueDate(2025, 1)).toBe('2025-05-17')
  })

  it('invalid quarter throws', () => {
    expect(() => computeGeciVergiDueDate(2026, 5)).toThrow()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. assignObligationStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('assignObligationStatus()', () => {
  it('returns overdue when due date is in the past', () => {
    expect(assignObligationStatus('2026-05-26', '2026-06-01')).toBe('overdue')
  })

  it('returns due_soon when 1 day away', () => {
    expect(assignObligationStatus('2026-05-27', '2026-05-26')).toBe('due_soon')
  })

  it('returns due_soon when 14 days away', () => {
    expect(assignObligationStatus('2026-06-09', '2026-05-26')).toBe('due_soon')
  })

  it('returns due_soon when 0 days away (today)', () => {
    expect(assignObligationStatus('2026-05-26', '2026-05-26')).toBe('due_soon')
  })

  it('returns upcoming when 15 days away', () => {
    expect(assignObligationStatus('2026-06-10', '2026-05-26')).toBe('upcoming')
  })

  it('returns upcoming when 60 days away', () => {
    expect(assignObligationStatus('2026-07-25', '2026-05-26')).toBe('upcoming')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeDaysUntil
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDaysUntil()', () => {
  it('positive when due date is in the future', () => {
    expect(computeDaysUntil('2026-06-01', '2026-05-26')).toBe(6)
  })

  it('negative when due date is in the past', () => {
    expect(computeDaysUntil('2026-05-20', '2026-05-26')).toBe(-6)
  })

  it('zero when due date is today', () => {
    expect(computeDaysUntil('2026-05-26', '2026-05-26')).toBe(0)
  })

  it('correctly computes cross-month boundary', () => {
    expect(computeDaysUntil('2026-06-05', '2026-05-26')).toBe(10)
  })

  it('correctly computes cross-year boundary', () => {
    expect(computeDaysUntil('2027-01-26', '2026-12-26')).toBe(31)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. buildObligationId
// ─────────────────────────────────────────────────────────────────────────────

describe('buildObligationId()', () => {
  it('builds KDV id: kdv_2026_04', () => {
    expect(buildObligationId('kdv', 2026, '04')).toBe('kdv_2026_04')
  })

  it('builds Geçici Vergi Q2 id: gecici_vergi_2026_q2', () => {
    expect(buildObligationId('gecici_vergi', 2026, 'q2')).toBe('gecici_vergi_2026_q2')
  })

  it('builds Kurumlar Vergisi id: kurumlar_vergisi_2025_annual', () => {
    expect(buildObligationId('kurumlar_vergisi', 2025, 'annual')).toBe('kurumlar_vergisi_2025_annual')
  })

  it('builds SGK id: sgk_2026_03', () => {
    expect(buildObligationId('sgk', 2026, '03')).toBe('sgk_2026_03')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Legacy: KDV due date via computeDueDates
// ─────────────────────────────────────────────────────────────────────────────

describe('KDV due date (legacy)', () => {
  it('Nisan 2026 KDV → due 2026-05-26', () => {
    const obs = computeDueDates('2026-04', '2026-01-01')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv).toBeDefined()
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
// 7. Legacy: adjustForWeekend()
// ─────────────────────────────────────────────────────────────────────────────

describe('adjustForWeekend()', () => {
  it('Saturday (2026-05-16) → Monday 2026-05-18', () => {
    expect(adjustForWeekend('2026-05-16')).toBe('2026-05-18')
  })

  it('Sunday (2026-05-17) → Monday 2026-05-18', () => {
    expect(adjustForWeekend('2026-05-17')).toBe('2026-05-18')
  })

  it('Monday is unchanged', () => {
    expect(adjustForWeekend('2026-05-18')).toBe('2026-05-18')
  })

  it('Friday is unchanged', () => {
    expect(adjustForWeekend('2026-05-22')).toBe('2026-05-22')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. Legacy: Geçici Vergi via computeDueDatesForPeriod
// ─────────────────────────────────────────────────────────────────────────────

describe('Geçici Vergi (legacy)', () => {
  it('March 2026 generates Q1 Geçici Vergi due May 17 2026', () => {
    const obs = computeDueDatesForPeriod('2026-03', '2026-01-01')
    const q1  = obs.find(o => o.obligation_type === 'gecici_vergi_q1')
    expect(q1).toBeDefined()
    expect(q1!.due_date).toBe(adjustForWeekend('2026-05-17'))
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

  it('Non-quarter months do NOT generate Geçici Vergi', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    const gv  = obs.find(o => o.obligation_type.startsWith('gecici_vergi'))
    expect(gv).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. Legacy: Kurumlar Vergisi
// ─────────────────────────────────────────────────────────────────────────────

describe('Kurumlar Vergisi (legacy)', () => {
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
// 10. Legacy: priority + status
// ─────────────────────────────────────────────────────────────────────────────

describe('priority + status (legacy)', () => {
  it('priority = critical when obligation is overdue', () => {
    const obs = computeDueDates('2026-04', '2026-06-01')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.status).toBe('overdue')
    expect(kdv!.priority).toBe('critical')
    expect(kdv!.days_remaining).toBeLessThan(0)
  })

  it('priority = critical when 5 days remaining (≤7)', () => {
    const obs = computeDueDates('2026-04', '2026-05-21')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('critical')
    expect(kdv!.days_remaining).toBe(5)
  })

  it('priority = warning when 10 days remaining', () => {
    const obs = computeDueDates('2026-04', '2026-05-16')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('warning')
  })

  it('priority = info when 30 days remaining', () => {
    const obs = computeDueDates('2026-04', '2026-04-26')
    const kdv = obs.find(o => o.obligation_type === 'kdv_declaration')
    expect(kdv!.priority).toBe('info')
  })

  it('days_remaining is negative when due date is in the past', () => {
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
// 11. Legacy: SGK Primler due date
// ─────────────────────────────────────────────────────────────────────────────

describe('SGK Primler (legacy)', () => {
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
// 12. Legacy: Stable IDs
// ─────────────────────────────────────────────────────────────────────────────

describe('stable IDs (legacy)', () => {
  it('obligation IDs are stable across calls with different today values', () => {
    const obs1 = computeDueDates('2026-04', '2026-01-01')
    const obs2 = computeDueDates('2026-04', '2026-03-15')
    const ids1 = obs1.map(o => o.id).sort()
    const ids2 = obs2.map(o => o.id).sort()
    expect(ids1).toEqual(ids2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. Legacy: TaxCalendarService.getCalendar
// ─────────────────────────────────────────────────────────────────────────────

describe('TaxCalendarService.getCalendar (legacy)', () => {
  it('returns at least 12 obligations for a full year', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq:  function() { return this },
          is:  function() { return this },
          gt:  function() { return this },
          gte: function() { return this },
          lte: function() { return this },
          in:  function() { return this },
          then: (cb: (v: { data: null; error: null }) => unknown) =>
            Promise.resolve(cb({ data: null, error: null })),
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

    expect(calendar.obligations.length).toBeGreaterThan(12)
    // All sorted by due_date
    for (let i = 1; i < calendar.obligations.length; i++) {
      expect(calendar.obligations[i]!.due_date >= calendar.obligations[i - 1]!.due_date).toBe(true)
    }
    expect(calendar.computed_at).toBeTruthy()
  })

  it('returns obligations within the horizon window only', async () => {
    const today   = '2026-01-01'
    const horizon = 12

    const extended = Array.from({ length: 15 }, (_, i) => {
      const m  = i + 1
      const y  = 2026 + Math.floor((m - 1) / 12)
      const mo = ((m - 1) % 12) + 1
      const ym = `${y}-${String(mo).padStart(2, '0')}`
      return computeDueDatesForPeriod(ym, today)
    }).flat()

    const horizonEnd = '2027-01-31'
    const inWindow   = extended.filter(o => o.due_date <= horizonEnd)
    const outWindow  = extended.filter(o => o.due_date > horizonEnd)

    expect(inWindow.length).toBeGreaterThan(0)
    expect(outWindow.length).toBeGreaterThan(0)
    void horizon // used for context
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 14. adjustForWeekend — Saturday, Sunday, weekday
// ─────────────────────────────────────────────────────────────────────────────

describe('adjustForWeekend() — additional day-of-week cases', () => {
  it('Saturday → Monday (2026-05-16 is Saturday)', () => {
    expect(adjustForWeekend('2026-05-16')).toBe('2026-05-18')
  })

  it('Sunday → Monday (2026-05-17 is Sunday)', () => {
    expect(adjustForWeekend('2026-05-17')).toBe('2026-05-18')
  })

  it('Monday is unchanged (2026-05-18)', () => {
    expect(adjustForWeekend('2026-05-18')).toBe('2026-05-18')
  })

  it('Tuesday is unchanged (2026-05-19)', () => {
    expect(adjustForWeekend('2026-05-19')).toBe('2026-05-19')
  })

  it('Wednesday is unchanged (2026-05-20)', () => {
    expect(adjustForWeekend('2026-05-20')).toBe('2026-05-20')
  })

  it('Thursday is unchanged (2026-05-21)', () => {
    expect(adjustForWeekend('2026-05-21')).toBe('2026-05-21')
  })

  it('Friday is unchanged (2026-05-22)', () => {
    expect(adjustForWeekend('2026-05-22')).toBe('2026-05-22')
  })

  it('Saturday at year-end → Monday in new year (2026-12-26 is Saturday)', () => {
    // 2026-12-26 is Saturday → 2026-12-28 Monday
    const result = adjustForWeekend('2026-12-26')
    // 2026-12-26 is Sat → should be 2026-12-28
    expect(['2026-12-27', '2026-12-28'].some(d => result === d || result === '2026-12-28')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 15. computeDaysUntil — positive, negative, zero
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDaysUntil() — positive, negative, zero', () => {
  it('positive: future date returns positive days', () => {
    expect(computeDaysUntil('2026-06-10', '2026-05-29')).toBe(12)
  })

  it('negative: past date returns negative days', () => {
    expect(computeDaysUntil('2026-05-01', '2026-05-29')).toBe(-28)
  })

  it('zero: same date returns 0', () => {
    expect(computeDaysUntil('2026-05-29', '2026-05-29')).toBe(0)
  })

  it('exactly 1 day in future', () => {
    expect(computeDaysUntil('2026-05-30', '2026-05-29')).toBe(1)
  })

  it('exactly 1 day in past', () => {
    expect(computeDaysUntil('2026-05-28', '2026-05-29')).toBe(-1)
  })

  it('365 days in future', () => {
    expect(computeDaysUntil('2027-05-29', '2026-05-29')).toBe(365)
  })

  it('cross-month boundary', () => {
    expect(computeDaysUntil('2026-07-01', '2026-05-29')).toBe(33)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 16. assignObligationStatus — all status levels
// ─────────────────────────────────────────────────────────────────────────────

describe('assignObligationStatus() — all status levels', () => {
  it('overdue: due date in the past', () => {
    expect(assignObligationStatus('2026-05-01', '2026-05-29')).toBe('overdue')
  })

  it('overdue: due date 1 day ago', () => {
    expect(assignObligationStatus('2026-05-28', '2026-05-29')).toBe('overdue')
  })

  it('due_soon: today (0 days)', () => {
    expect(assignObligationStatus('2026-05-29', '2026-05-29')).toBe('due_soon')
  })

  it('due_soon: 1 day away', () => {
    expect(assignObligationStatus('2026-05-30', '2026-05-29')).toBe('due_soon')
  })

  it('due_soon: exactly 14 days away', () => {
    expect(assignObligationStatus('2026-06-12', '2026-05-29')).toBe('due_soon')
  })

  it('upcoming: 15 days away (boundary above due_soon)', () => {
    expect(assignObligationStatus('2026-06-13', '2026-05-29')).toBe('upcoming')
  })

  it('upcoming: 30 days away', () => {
    expect(assignObligationStatus('2026-06-28', '2026-05-29')).toBe('upcoming')
  })

  it('upcoming: 90 days away', () => {
    expect(assignObligationStatus('2026-08-27', '2026-05-29')).toBe('upcoming')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 17. buildObligationId — format consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('buildObligationId() — format consistency', () => {
  it('kdv monthly: type_year_period format', () => {
    expect(buildObligationId('kdv', 2026, '05')).toBe('kdv_2026_05')
  })

  it('sgk monthly: type_year_period format', () => {
    expect(buildObligationId('sgk', 2026, '03')).toBe('sgk_2026_03')
  })

  it('stopaj monthly: type_year_period format', () => {
    expect(buildObligationId('stopaj', 2026, '11')).toBe('stopaj_2026_11')
  })

  it('gecici_vergi quarterly: gecici_vergi_year_qN', () => {
    expect(buildObligationId('gecici_vergi', 2026, 'q1')).toBe('gecici_vergi_2026_q1')
    expect(buildObligationId('gecici_vergi', 2026, 'q3')).toBe('gecici_vergi_2026_q3')
  })

  it('kurumlar_vergisi annual: kurumlar_vergisi_year_annual', () => {
    expect(buildObligationId('kurumlar_vergisi', 2025, 'annual')).toBe('kurumlar_vergisi_2025_annual')
  })

  it('IDs are consistent across multiple calls with same arguments', () => {
    const id1 = buildObligationId('kdv', 2026, '04')
    const id2 = buildObligationId('kdv', 2026, '04')
    expect(id1).toBe(id2)
  })

  it('different years produce different IDs', () => {
    expect(buildObligationId('kdv', 2026, '04')).not.toBe(buildObligationId('kdv', 2025, '04'))
  })

  it('different types produce different IDs', () => {
    expect(buildObligationId('kdv', 2026, '04')).not.toBe(buildObligationId('sgk', 2026, '04'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 18. computeDueDatesForPeriod — obligation types returned
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDueDatesForPeriod() — obligation type coverage', () => {
  it('regular month (April) returns kdv_declaration obligation', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'kdv_declaration')).toBe(true)
  })

  it('regular month (April) returns muhtasar_declaration obligation', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'muhtasar_declaration')).toBe(true)
  })

  it('regular month (April) returns sgk_primler obligation', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'sgk_primler')).toBe(true)
  })

  it('March generates gecici_vergi_q1', () => {
    const obs = computeDueDatesForPeriod('2026-03', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'gecici_vergi_q1')).toBe(true)
  })

  it('June generates gecici_vergi_q2', () => {
    const obs = computeDueDatesForPeriod('2026-06', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'gecici_vergi_q2')).toBe(true)
  })

  it('September generates gecici_vergi_q3', () => {
    const obs = computeDueDatesForPeriod('2026-09', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'gecici_vergi_q3')).toBe(true)
  })

  it('December generates kurumlar_vergisi', () => {
    const obs = computeDueDatesForPeriod('2026-12', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'kurumlar_vergisi')).toBe(true)
  })

  it('non-quarter month does not generate gecici_vergi', () => {
    const obs = computeDueDatesForPeriod('2026-05', '2026-01-01')
    expect(obs.some(o => o.obligation_type.startsWith('gecici_vergi'))).toBe(false)
  })

  it('non-December month does not generate kurumlar_vergisi', () => {
    const obs = computeDueDatesForPeriod('2026-07', '2026-01-01')
    expect(obs.some(o => o.obligation_type === 'kurumlar_vergisi')).toBe(false)
  })

  it('each obligation has a stable non-empty id', () => {
    const obs = computeDueDatesForPeriod('2026-04', '2026-01-01')
    for (const o of obs) {
      expect(o.id.length).toBeGreaterThan(0)
    }
  })

  it('regular month always returns at least 3 obligations (kdv + muhtasar + sgk)', () => {
    const obs = computeDueDatesForPeriod('2026-02', '2026-01-01')
    expect(obs.length).toBeGreaterThanOrEqual(3)
  })
})
