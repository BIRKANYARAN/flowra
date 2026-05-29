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
