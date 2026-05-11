/**
 * financial-core-utils — pure kernel tests for FAZ 1–4 helpers.
 *
 * Scope (deterministic, no DB):
 *   • geciciDueDate()            — Turkish Geçici Vergi due dates
 *   • quarterPeriod()            — quarter boundary dates
 *   • cashflowPressureSeverity() — pressure classification rule
 *
 * Run with: npx vitest run tests/financial-core-utils.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  geciciDueDate,
  quarterPeriod,
  cashflowPressureSeverity,
} from '../lib/finance/financial-core'

// ─────────────────────────────────────────────────────────────────────────────
// geciciDueDate() — Geçici Vergi due dates
//
// Turkish corporate provisional tax schedule:
//   Q1 (Jan–Mar)  → due May  17
//   Q2 (Apr–Jun)  → due Aug  17
//   Q3 (Jul–Sep)  → due Nov  17
//   Q4 has no Geçici — annual declaration instead.
// ─────────────────────────────────────────────────────────────────────────────

describe('geciciDueDate()', () => {
  it('Q1 2025 → May 17 2025', () => {
    expect(geciciDueDate(2025, 1)).toBe('2025-05-17')
  })

  it('Q2 2025 → August 17 2025', () => {
    expect(geciciDueDate(2025, 2)).toBe('2025-08-17')
  })

  it('Q3 2025 → November 17 2025', () => {
    expect(geciciDueDate(2025, 3)).toBe('2025-11-17')
  })

  it('returns YYYY-MM-DD format', () => {
    const d = geciciDueDate(2024, 1)
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('year rolls correctly — Q1 2026 is not 2025', () => {
    expect(geciciDueDate(2026, 1)).toBe('2026-05-17')
    expect(geciciDueDate(2026, 1)).not.toBe('2025-05-17')
  })

  it('all three quarters use day 17', () => {
    for (const q of [1, 2, 3] as const) {
      const d = geciciDueDate(2025, q)
      expect(d.slice(-2)).toBe('17')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// quarterPeriod() — quarter boundary dates
// ─────────────────────────────────────────────────────────────────────────────

describe('quarterPeriod()', () => {
  it('Q1: January 1 → March 31', () => {
    const p = quarterPeriod(2025, 1)
    expect(p.from).toBe('2025-01-01')
    expect(p.to).toBe('2025-03-31')
  })

  it('Q2: April 1 → June 30', () => {
    const p = quarterPeriod(2025, 2)
    expect(p.from).toBe('2025-04-01')
    expect(p.to).toBe('2025-06-30')
  })

  it('Q3: July 1 → September 30', () => {
    const p = quarterPeriod(2025, 3)
    expect(p.from).toBe('2025-07-01')
    expect(p.to).toBe('2025-09-30')
  })

  it('Q4: October 1 → December 31', () => {
    const p = quarterPeriod(2025, 4)
    expect(p.from).toBe('2025-10-01')
    expect(p.to).toBe('2025-12-31')
  })

  it('boundaries are contiguous — Q1 end + 1 day = Q2 start', () => {
    const q1 = quarterPeriod(2025, 1)
    const q2 = quarterPeriod(2025, 2)
    const q1End  = new Date(q1.to)
    q1End.setDate(q1End.getDate() + 1)
    const q2Start = new Date(q2.from)
    expect(q1End.toISOString().slice(0, 10)).toBe(q2Start.toISOString().slice(0, 10))
  })

  it('covers 365 days across all 4 quarters in a non-leap year', () => {
    const days = ([1, 2, 3, 4] as const).reduce((total, q) => {
      const p = quarterPeriod(2025, q)
      const from = new Date(p.from), to = new Date(p.to)
      return total + Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    }, 0)
    expect(days).toBe(365)
  })

  it('covers 366 days across all 4 quarters in a leap year (2024)', () => {
    const days = ([1, 2, 3, 4] as const).reduce((total, q) => {
      const p = quarterPeriod(2024, q)
      const from = new Date(p.from), to = new Date(p.to)
      return total + Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
    }, 0)
    expect(days).toBe(366)
  })

  it('returns YYYY-MM-DD strings in both fields', () => {
    const p = quarterPeriod(2025, 1)
    expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(p.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// cashflowPressureSeverity() — pressure classification
//
// Rule hierarchy:
//   1. cumulative < 0 → 'critical'  (total cash is negative — company insolvent)
//   2. net < 0        → 'warn'      (this month bleeds, but cumulative still ok)
//   3. otherwise      → 'ok'
// ─────────────────────────────────────────────────────────────────────────────

describe('cashflowPressureSeverity()', () => {
  it('positive net + positive cumulative → ok', () => {
    expect(cashflowPressureSeverity(10000, 50000)).toBe('ok')
  })

  it('zero net + positive cumulative → ok (break-even is healthy)', () => {
    expect(cashflowPressureSeverity(0, 5000)).toBe('ok')
  })

  it('negative net + positive cumulative → warn', () => {
    expect(cashflowPressureSeverity(-5000, 10000)).toBe('warn')
  })

  it('negative net + zero cumulative → critical (cumulative reaches 0)', () => {
    // cumulative = 0 is NOT < 0, so this should be 'warn' not 'critical'
    expect(cashflowPressureSeverity(-1000, 0)).toBe('warn')
  })

  it('negative cumulative → critical regardless of net sign', () => {
    // Even if a month has positive net, if cumulative is negative we're critical
    expect(cashflowPressureSeverity(5000, -1000)).toBe('critical')
    expect(cashflowPressureSeverity(-5000, -1000)).toBe('critical')
  })

  it('cumulative = -0.01 → critical (epsilon negative)', () => {
    expect(cashflowPressureSeverity(0, -0.01)).toBe('critical')
  })

  it('cumulative priority: -cumulative trumps positive net → critical', () => {
    // Hypothetical: collected more than spent this month, but prior losses dominate
    const result = cashflowPressureSeverity(100000, -50000)
    expect(result).toBe('critical')
  })

  it('net = -0.01 → warn (epsilon burn)', () => {
    expect(cashflowPressureSeverity(-0.01, 1000)).toBe('warn')
  })
})
