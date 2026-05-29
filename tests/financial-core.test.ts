/**
 * Tests for lib/finance/financial-core.ts — pure exported functions only.
 *
 * Three functions are testable without DB mocking:
 *   cashflowPressureSeverity(net, cumulative) → 'ok' | 'warn' | 'critical'
 *   geciciDueDate(year, q)                    → 'YYYY-MM-17'
 *   quarterPeriod(year, q)                    → { from, to }
 *
 * DB-dependent functions (getCashflowTimeline, getCfoMetrics, getRunwayForecast,
 * getQuarterlyReport, getDistributableCash) are integration-tested separately.
 *
 * Run with: npx vitest run tests/financial-core.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  cashflowPressureSeverity,
  geciciDueDate,
  quarterPeriod,
} from '../lib/finance/financial-core'

// ── cashflowPressureSeverity ──────────────────────────────────────────────────

describe('cashflowPressureSeverity — priority: cumulative < 0 → critical', () => {
  it('cumulative < 0, net < 0 → critical (cumulative wins)', () => {
    expect(cashflowPressureSeverity(-5_000, -1_000)).toBe('critical')
  })

  it('cumulative < 0, net > 0 → critical (cumulative still wins)', () => {
    // Even if this month is profitable, cumulative position is in deficit
    expect(cashflowPressureSeverity(3_000, -500)).toBe('critical')
  })

  it('cumulative = 0, net < 0 → warn (exactly zero is not negative)', () => {
    // cumulative is 0 — not negative, so falls through to net check
    expect(cashflowPressureSeverity(-1, 0)).toBe('warn')
  })

  it('cumulative > 0, net < 0 → warn (monthly burn but still solvent)', () => {
    expect(cashflowPressureSeverity(-10_000, 50_000)).toBe('warn')
  })

  it('cumulative > 0, net = 0 → ok (break-even month)', () => {
    expect(cashflowPressureSeverity(0, 100_000)).toBe('ok')
  })

  it('cumulative > 0, net > 0 → ok (growing)', () => {
    expect(cashflowPressureSeverity(20_000, 200_000)).toBe('ok')
  })

  it('cumulative = 0, net = 0 → ok (zero/zero boundary)', () => {
    expect(cashflowPressureSeverity(0, 0)).toBe('ok')
  })

  it('large positive values → ok', () => {
    expect(cashflowPressureSeverity(1_000_000, 5_000_000)).toBe('ok')
  })

  it('very negative cumulative → critical regardless of net sign', () => {
    expect(cashflowPressureSeverity(999_999, -1)).toBe('critical')
  })

  it('smallest negative cumulative (-0.01) → critical', () => {
    expect(cashflowPressureSeverity(0, -0.01)).toBe('critical')
  })
})

describe('cashflowPressureSeverity — warn boundary tests', () => {
  it('net = -1 (just below zero) and cumulative = 0 → warn', () => {
    expect(cashflowPressureSeverity(-1, 0)).toBe('warn')
  })

  it('net = -0.01 and cumulative = 1 → warn', () => {
    expect(cashflowPressureSeverity(-0.01, 1)).toBe('warn')
  })

  it('net = 0 and cumulative = 1 → ok (zero net is NOT warn)', () => {
    expect(cashflowPressureSeverity(0, 1)).toBe('ok')
  })

  it('net very negative (-1M) but cumulative positive → warn', () => {
    expect(cashflowPressureSeverity(-1_000_000, 10_000_000)).toBe('warn')
  })
})

describe('cashflowPressureSeverity — output always one of 3 valid values', () => {
  const cases: Array<[number, number]> = [
    [0, 0], [1, 1], [-1, -1],
    [100, -100], [-100, 100],
    [0, 1], [0, -1], [1, 0], [-1, 0],
  ]

  for (const [net, cumulative] of cases) {
    it(`net=${net}, cumulative=${cumulative} → valid severity`, () => {
      const result = cashflowPressureSeverity(net, cumulative)
      expect(['ok', 'warn', 'critical']).toContain(result)
    })
  }
})

describe('cashflowPressureSeverity — priority order is critical > warn > ok', () => {
  it('cumulative < 0 always beats net < 0 (critical over warn)', () => {
    // Both negative → critical wins because cumulative check runs first
    expect(cashflowPressureSeverity(-100, -50)).toBe('critical')
  })

  it('net < 0 beats net >= 0 (warn over ok)', () => {
    expect(cashflowPressureSeverity(-1, 100)).toBe('warn')
    expect(cashflowPressureSeverity(1, 100)).toBe('ok')
  })
})

// ── geciciDueDate ─────────────────────────────────────────────────────────────

describe('geciciDueDate — Turkish Geçici Vergi due dates', () => {
  // Q1 → May 17, Q2 → August 17, Q3 → November 17
  it('Q1 2025 → 2025-05-17', () => {
    expect(geciciDueDate(2025, 1)).toBe('2025-05-17')
  })

  it('Q2 2025 → 2025-08-17', () => {
    expect(geciciDueDate(2025, 2)).toBe('2025-08-17')
  })

  it('Q3 2025 → 2025-11-17', () => {
    expect(geciciDueDate(2025, 3)).toBe('2025-11-17')
  })

  it('Q1 2024 → 2024-05-17', () => {
    expect(geciciDueDate(2024, 1)).toBe('2024-05-17')
  })

  it('Q2 2030 → 2030-08-17', () => {
    expect(geciciDueDate(2030, 2)).toBe('2030-08-17')
  })

  it('day is always 17 for all quarters', () => {
    for (const q of [1, 2, 3] as const) {
      expect(geciciDueDate(2026, q)).toMatch(/-17$/)
    }
  })

  it('format is YYYY-MM-DD (10 chars)', () => {
    expect(geciciDueDate(2025, 1)).toHaveLength(10)
    expect(geciciDueDate(2025, 2)).toHaveLength(10)
    expect(geciciDueDate(2025, 3)).toHaveLength(10)
  })

  it('year is correctly embedded in output', () => {
    expect(geciciDueDate(2028, 3)).toContain('2028')
  })

  it('Q1 month is 05 (May)', () => {
    expect(geciciDueDate(2025, 1).slice(5, 7)).toBe('05')
  })

  it('Q2 month is 08 (August)', () => {
    expect(geciciDueDate(2025, 2).slice(5, 7)).toBe('08')
  })

  it('Q3 month is 11 (November)', () => {
    expect(geciciDueDate(2025, 3).slice(5, 7)).toBe('11')
  })

  it('result is parseable as a valid date', () => {
    const d = new Date(geciciDueDate(2025, 1))
    expect(isNaN(d.getTime())).toBe(false)
  })

  it('different years produce same month-day pattern', () => {
    expect(geciciDueDate(2020, 1).slice(5)).toBe(geciciDueDate(2025, 1).slice(5))
    expect(geciciDueDate(2020, 2).slice(5)).toBe(geciciDueDate(2025, 2).slice(5))
    expect(geciciDueDate(2020, 3).slice(5)).toBe(geciciDueDate(2025, 3).slice(5))
  })

  it('Q3 due date is before year end (Nov 17 < Dec 31)', () => {
    const q3 = geciciDueDate(2025, 3)
    expect(q3 < '2025-12-31').toBe(true)
  })
})

// ── quarterPeriod ─────────────────────────────────────────────────────────────

describe('quarterPeriod — quarter boundary dates', () => {
  // Q1: Jan 1 – Mar 31
  // Q2: Apr 1 – Jun 30
  // Q3: Jul 1 – Sep 30
  // Q4: Oct 1 – Dec 31

  it('Q1 2025 → Jan 1 to Mar 31', () => {
    const p = quarterPeriod(2025, 1)
    expect(p.from).toBe('2025-01-01')
    expect(p.to).toBe('2025-03-31')
  })

  it('Q2 2025 → Apr 1 to Jun 30', () => {
    const p = quarterPeriod(2025, 2)
    expect(p.from).toBe('2025-04-01')
    expect(p.to).toBe('2025-06-30')
  })

  it('Q3 2025 → Jul 1 to Sep 30', () => {
    const p = quarterPeriod(2025, 3)
    expect(p.from).toBe('2025-07-01')
    expect(p.to).toBe('2025-09-30')
  })

  it('Q4 2025 → Oct 1 to Dec 31', () => {
    const p = quarterPeriod(2025, 4)
    expect(p.from).toBe('2025-10-01')
    expect(p.to).toBe('2025-12-31')
  })

  it('all quarters start on day 01', () => {
    for (const q of [1, 2, 3, 4] as const) {
      expect(quarterPeriod(2025, q).from).toMatch(/-01$/)
    }
  })

  it('Q1/Q3/Q4 ends on 31, Q2 ends on 30', () => {
    expect(quarterPeriod(2025, 1).to).toMatch(/-31$/)
    expect(quarterPeriod(2025, 2).to).toMatch(/-30$/)
    expect(quarterPeriod(2025, 3).to).toMatch(/-30$/)
    expect(quarterPeriod(2025, 4).to).toMatch(/-31$/)
  })

  it('year is correctly embedded in both from and to', () => {
    const p = quarterPeriod(2030, 2)
    expect(p.from).toContain('2030')
    expect(p.to).toContain('2030')
  })

  it('each period covers exactly one quarter (from month = 3*(q-1)+1)', () => {
    const expected = [
      { q: 1 as const, fromMonth: '01', toMonth: '03' },
      { q: 2 as const, fromMonth: '04', toMonth: '06' },
      { q: 3 as const, fromMonth: '07', toMonth: '09' },
      { q: 4 as const, fromMonth: '10', toMonth: '12' },
    ]
    for (const { q, fromMonth, toMonth } of expected) {
      const p = quarterPeriod(2025, q)
      expect(p.from.slice(5, 7)).toBe(fromMonth)
      expect(p.to.slice(5, 7)).toBe(toMonth)
    }
  })

  it('Q4 2024 and Q1 2025 are contiguous (no gap)', () => {
    const q4 = quarterPeriod(2024, 4)
    const q1 = quarterPeriod(2025, 1)
    // Q4 ends Dec 31, Q1 starts Jan 1 — consecutive
    expect(q4.to).toBe('2024-12-31')
    expect(q1.from).toBe('2025-01-01')
  })

  it('Q1/Q2 transition within same year is contiguous', () => {
    const q1 = quarterPeriod(2025, 1)
    const q2 = quarterPeriod(2025, 2)
    expect(q1.to).toBe('2025-03-31')
    expect(q2.from).toBe('2025-04-01')
  })

  it('from is before to for all quarters', () => {
    for (const q of [1, 2, 3, 4] as const) {
      const p = quarterPeriod(2025, q)
      expect(p.from < p.to).toBe(true)
    }
  })

  it('from and to are 10 characters (YYYY-MM-DD)', () => {
    for (const q of [1, 2, 3, 4] as const) {
      const p = quarterPeriod(2025, q)
      expect(p.from).toHaveLength(10)
      expect(p.to).toHaveLength(10)
    }
  })

  it('handles year 2000 (leap year and Y2K boundary)', () => {
    const p = quarterPeriod(2000, 1)
    expect(p.from).toBe('2000-01-01')
    expect(p.to).toBe('2000-03-31')
  })

  it('handles year 2099 (far future)', () => {
    const p = quarterPeriod(2099, 4)
    expect(p.from).toBe('2099-10-01')
    expect(p.to).toBe('2099-12-31')
  })

  it('geciciDueDate for Q1 falls within Q2 period (May 17 is in Q2)', () => {
    const q2 = quarterPeriod(2025, 2)
    const q1Due = geciciDueDate(2025, 1)
    // May 17 should be within Apr 1 – Jun 30
    expect(q1Due >= q2.from).toBe(true)
    expect(q1Due <= q2.to).toBe(true)
  })

  it('geciciDueDate for Q2 falls within Q3 period (Aug 17 is in Q3)', () => {
    const q3 = quarterPeriod(2025, 3)
    const q2Due = geciciDueDate(2025, 2)
    expect(q2Due >= q3.from).toBe(true)
    expect(q2Due <= q3.to).toBe(true)
  })
})

// ── Cross-function: geciciDueDate + quarterPeriod coherence ───────────────────

describe('geciciDueDate + quarterPeriod coherence', () => {
  it('Q1 due date (May) is in Q2 period — filing happens next quarter', () => {
    const due  = geciciDueDate(2025, 1)
    const q2   = quarterPeriod(2025, 2)
    expect(due).toMatch(/^2025-05-17/)
    expect(due >= q2.from && due <= q2.to).toBe(true)
  })

  it('Q3 due date (Nov) is in Q4 period', () => {
    const due = geciciDueDate(2025, 3)
    const q4  = quarterPeriod(2025, 4)
    expect(due >= q4.from && due <= q4.to).toBe(true)
  })

  it('all 4 quarters cover a non-overlapping full year', () => {
    const quarters = ([1, 2, 3, 4] as const).map(q => quarterPeriod(2025, q))
    // No overlaps: each from > previous to
    for (let i = 1; i < 4; i++) {
      expect(quarters[i].from > quarters[i - 1].to).toBe(true)
    }
    // Full year coverage: Q1 starts Jan 1, Q4 ends Dec 31
    expect(quarters[0].from).toBe('2025-01-01')
    expect(quarters[3].to).toBe('2025-12-31')
  })
})

// ── geciciDueDate — multi-year and format coverage ────────────────────────────

describe('geciciDueDate — multi-year coverage', () => {
  it('Q1 2024 → 2024-05-17', () => {
    expect(geciciDueDate(2024, 1)).toBe('2024-05-17')
  })

  it('Q2 2024 → 2024-08-17', () => {
    expect(geciciDueDate(2024, 2)).toBe('2024-08-17')
  })

  it('Q3 2024 → 2024-11-17', () => {
    expect(geciciDueDate(2024, 3)).toBe('2024-11-17')
  })

  it('Q1 2026 → 2026-05-17', () => {
    expect(geciciDueDate(2026, 1)).toBe('2026-05-17')
  })

  it('Q2 2026 → 2026-08-17', () => {
    expect(geciciDueDate(2026, 2)).toBe('2026-08-17')
  })

  it('Q3 2026 → 2026-11-17', () => {
    expect(geciciDueDate(2026, 3)).toBe('2026-11-17')
  })

  it('day portion is always -17 for 2025', () => {
    expect(geciciDueDate(2025, 1).slice(-2)).toBe('17')
    expect(geciciDueDate(2025, 2).slice(-2)).toBe('17')
    expect(geciciDueDate(2025, 3).slice(-2)).toBe('17')
  })

  it('result format is always YYYY-MM-17 (last 3 chars are -17)', () => {
    const years = [2023, 2025, 2027, 2030]
    const quarters = [1, 2, 3] as const
    for (const year of years) {
      for (const q of quarters) {
        expect(geciciDueDate(year, q)).toMatch(/^\d{4}-\d{2}-17$/)
      }
    }
  })

  it('month mapping is correct for all 3 quarters', () => {
    // Q1→05, Q2→08, Q3→11
    const mapping: Array<[1|2|3, string]> = [[1, '05'], [2, '08'], [3, '11']]
    for (const [q, expectedMonth] of mapping) {
      expect(geciciDueDate(2026, q).slice(5, 7)).toBe(expectedMonth)
    }
  })

  it('year is embedded correctly for a past year (2020)', () => {
    expect(geciciDueDate(2020, 2)).toBe('2020-08-17')
  })

  it('year is embedded correctly for a future year (2035)', () => {
    expect(geciciDueDate(2035, 3)).toBe('2035-11-17')
  })
})

// ── quarterPeriod — multi-year boundary coverage ──────────────────────────────

describe('quarterPeriod — Q1-Q4 boundaries for years 2024 and 2026', () => {
  it('Q1 2024 → 2024-01-01 to 2024-03-31', () => {
    const p = quarterPeriod(2024, 1)
    expect(p.from).toBe('2024-01-01')
    expect(p.to).toBe('2024-03-31')
  })

  it('Q2 2024 → 2024-04-01 to 2024-06-30', () => {
    const p = quarterPeriod(2024, 2)
    expect(p.from).toBe('2024-04-01')
    expect(p.to).toBe('2024-06-30')
  })

  it('Q3 2024 → 2024-07-01 to 2024-09-30', () => {
    const p = quarterPeriod(2024, 3)
    expect(p.from).toBe('2024-07-01')
    expect(p.to).toBe('2024-09-30')
  })

  it('Q4 2024 → 2024-10-01 to 2024-12-31', () => {
    const p = quarterPeriod(2024, 4)
    expect(p.from).toBe('2024-10-01')
    expect(p.to).toBe('2024-12-31')
  })

  it('Q1 2026 → 2026-01-01 to 2026-03-31', () => {
    const p = quarterPeriod(2026, 1)
    expect(p.from).toBe('2026-01-01')
    expect(p.to).toBe('2026-03-31')
  })

  it('Q3 2026 → 2026-07-01 to 2026-09-30', () => {
    const p = quarterPeriod(2026, 3)
    expect(p.from).toBe('2026-07-01')
    expect(p.to).toBe('2026-09-30')
  })

  it('Q4 2026 → 2026-10-01 to 2026-12-31', () => {
    const p = quarterPeriod(2026, 4)
    expect(p.from).toBe('2026-10-01')
    expect(p.to).toBe('2026-12-31')
  })

  it('Q2-Q3 boundary: Q2 ends Jun 30, Q3 starts Jul 1 (no gap)', () => {
    const q2 = quarterPeriod(2025, 2)
    const q3 = quarterPeriod(2025, 3)
    expect(q2.to).toBe('2025-06-30')
    expect(q3.from).toBe('2025-07-01')
  })

  it('Q3-Q4 boundary: Q3 ends Sep 30, Q4 starts Oct 1 (no gap)', () => {
    const q3 = quarterPeriod(2025, 3)
    const q4 = quarterPeriod(2025, 4)
    expect(q3.to).toBe('2025-09-30')
    expect(q4.from).toBe('2025-10-01')
  })
})

// ── cashflowPressureSeverity — exhaustive sign combinations ───────────────────

describe('cashflowPressureSeverity — exhaustive net/cumulative sign grid', () => {
  it('net=0, cumulative=0 → ok (zero is not negative)', () => {
    expect(cashflowPressureSeverity(0, 0)).toBe('ok')
  })

  it('net=0, cumulative=1 → ok (positive cumulative, break-even month)', () => {
    expect(cashflowPressureSeverity(0, 1)).toBe('ok')
  })

  it('net=0, cumulative=-1 → critical (cumulative is negative)', () => {
    expect(cashflowPressureSeverity(0, -1)).toBe('critical')
  })

  it('net=1, cumulative=0 → ok (positive net, zero cumulative)', () => {
    expect(cashflowPressureSeverity(1, 0)).toBe('ok')
  })

  it('net=1, cumulative=1 → ok (both positive)', () => {
    expect(cashflowPressureSeverity(1, 1)).toBe('ok')
  })

  it('net=1, cumulative=-1 → critical (cumulative negative wins)', () => {
    expect(cashflowPressureSeverity(1, -1)).toBe('critical')
  })

  it('net=-1, cumulative=0 → warn (net negative, cumulative zero is not negative)', () => {
    expect(cashflowPressureSeverity(-1, 0)).toBe('warn')
  })

  it('net=-1, cumulative=1 → warn (net negative, cumulative still positive)', () => {
    expect(cashflowPressureSeverity(-1, 1)).toBe('warn')
  })

  it('net=-1, cumulative=-1 → critical (cumulative negative takes priority)', () => {
    expect(cashflowPressureSeverity(-1, -1)).toBe('critical')
  })

  it('large positive net and large negative cumulative → critical', () => {
    expect(cashflowPressureSeverity(1_000_000, -1)).toBe('critical')
  })

  it('tiny negative net and large positive cumulative → warn', () => {
    expect(cashflowPressureSeverity(-0.01, 1_000_000)).toBe('warn')
  })
})

// ── geciciDueDate — format validation for multiple years ──────────────────────

describe('geciciDueDate — format YYYY-MM-17 across years', () => {
  it('Q1 result always ends in -05-17 regardless of year', () => {
    for (const year of [2020, 2024, 2025, 2026, 2030]) {
      expect(geciciDueDate(year, 1)).toMatch(/^\d{4}-05-17$/)
    }
  })

  it('Q2 result always ends in -08-17 regardless of year', () => {
    for (const year of [2020, 2024, 2025, 2026, 2030]) {
      expect(geciciDueDate(year, 2)).toMatch(/^\d{4}-08-17$/)
    }
  })

  it('Q3 result always ends in -11-17 regardless of year', () => {
    for (const year of [2020, 2024, 2025, 2026, 2030]) {
      expect(geciciDueDate(year, 3)).toMatch(/^\d{4}-11-17$/)
    }
  })

  it('all due dates are valid ISO date strings (parseable)', () => {
    const quarters = [1, 2, 3] as const
    for (const q of quarters) {
      const dateStr = geciciDueDate(2025, q)
      expect(isNaN(new Date(dateStr).getTime())).toBe(false)
    }
  })

  it('due dates are ordered chronologically within a year', () => {
    const d1 = geciciDueDate(2025, 1)  // May 17
    const d2 = geciciDueDate(2025, 2)  // Aug 17
    const d3 = geciciDueDate(2025, 3)  // Nov 17
    expect(d1 < d2).toBe(true)
    expect(d2 < d3).toBe(true)
  })

  it('Q1 2026 due date (May 17) is later than Q3 2025 due date (Nov 17 previous year)', () => {
    expect(geciciDueDate(2026, 1) > geciciDueDate(2025, 3)).toBe(true)
  })
})

// ── quarterPeriod — year boundary and month mapping coverage ──────────────────

describe('quarterPeriod — year boundaries and month mappings', () => {
  it('from month for Q1 is "01" (January)', () => {
    expect(quarterPeriod(2025, 1).from.slice(5, 7)).toBe('01')
  })

  it('from month for Q2 is "04" (April)', () => {
    expect(quarterPeriod(2025, 2).from.slice(5, 7)).toBe('04')
  })

  it('from month for Q3 is "07" (July)', () => {
    expect(quarterPeriod(2025, 3).from.slice(5, 7)).toBe('07')
  })

  it('from month for Q4 is "10" (October)', () => {
    expect(quarterPeriod(2025, 4).from.slice(5, 7)).toBe('10')
  })

  it('to month for Q1 is "03" (March)', () => {
    expect(quarterPeriod(2025, 1).to.slice(5, 7)).toBe('03')
  })

  it('to month for Q2 is "06" (June)', () => {
    expect(quarterPeriod(2025, 2).to.slice(5, 7)).toBe('06')
  })

  it('to month for Q3 is "09" (September)', () => {
    expect(quarterPeriod(2025, 3).to.slice(5, 7)).toBe('09')
  })

  it('to month for Q4 is "12" (December)', () => {
    expect(quarterPeriod(2025, 4).to.slice(5, 7)).toBe('12')
  })

  it('Q1 ends on 31st (March has 31 days)', () => {
    expect(quarterPeriod(2025, 1).to.slice(-2)).toBe('31')
  })

  it('Q4 ends on 31st (December has 31 days)', () => {
    expect(quarterPeriod(2025, 4).to.slice(-2)).toBe('31')
  })

  it('Q2 ends on 30th (June has 30 days)', () => {
    expect(quarterPeriod(2025, 2).to.slice(-2)).toBe('30')
  })

  it('Q3 ends on 30th (September has 30 days)', () => {
    expect(quarterPeriod(2025, 3).to.slice(-2)).toBe('30')
  })

  it('Q1 2025 and Q1 2026 have same month pattern, different year', () => {
    const p25 = quarterPeriod(2025, 1)
    const p26 = quarterPeriod(2026, 1)
    expect(p25.from.slice(5)).toBe(p26.from.slice(5))
    expect(p25.to.slice(5)).toBe(p26.to.slice(5))
    expect(p25.from.slice(0, 4)).toBe('2025')
    expect(p26.from.slice(0, 4)).toBe('2026')
  })
})
