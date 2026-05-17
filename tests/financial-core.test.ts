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
})
