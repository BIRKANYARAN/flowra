import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  toStatus,
  toSeverity,
} from '@/lib/services/governance/clock.service'

// ── daysBetween ───────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('same date returns 0', () => {
    expect(daysBetween('2024-06-15', '2024-06-15')).toBe(0)
  })

  it('one day ahead returns 1', () => {
    expect(daysBetween('2024-06-15', '2024-06-16')).toBe(1)
  })

  it('one day behind returns -1', () => {
    expect(daysBetween('2024-06-16', '2024-06-15')).toBe(-1)
  })

  it('7 days ahead returns 7', () => {
    expect(daysBetween('2024-01-01', '2024-01-08')).toBe(7)
  })

  it('14 days ahead returns 14', () => {
    expect(daysBetween('2024-01-01', '2024-01-15')).toBe(14)
  })

  it('30 days ahead returns 30', () => {
    expect(daysBetween('2024-01-01', '2024-01-31')).toBe(30)
  })

  it('91 days ahead returns 91 (2024 leap year Jan-Apr)', () => {
    expect(daysBetween('2024-01-01', '2024-04-01')).toBe(91)
  })

  it('crosses month boundary correctly', () => {
    expect(daysBetween('2024-01-31', '2024-02-01')).toBe(1)
  })

  it('crosses year boundary correctly', () => {
    expect(daysBetween('2023-12-31', '2024-01-01')).toBe(1)
  })

  it('large negative difference', () => {
    expect(daysBetween('2024-06-15', '2024-01-01')).toBe(-166)
  })
})

// ── toStatus ──────────────────────────────────────────────────────────────────

describe('toStatus', () => {
  it('negative daysUntil returns overdue', () => {
    expect(toStatus(-1)).toBe('overdue')
  })

  it('very negative daysUntil returns overdue', () => {
    expect(toStatus(-100)).toBe('overdue')
  })

  it('zero daysUntil returns due_today', () => {
    expect(toStatus(0)).toBe('due_today')
  })

  it('positive daysUntil returns upcoming', () => {
    expect(toStatus(1)).toBe('upcoming')
  })

  it('7 daysUntil returns upcoming', () => {
    expect(toStatus(7)).toBe('upcoming')
  })

  it('large positive daysUntil returns upcoming', () => {
    expect(toStatus(90)).toBe('upcoming')
  })
})

// ── toSeverity ────────────────────────────────────────────────────────────────

describe('toSeverity', () => {
  // statutory_ref always returns info regardless of daysUntil
  it('statutory_ref with positive days returns info', () => {
    expect(toSeverity(30, 'statutory_ref')).toBe('info')
  })

  it('statutory_ref with zero days returns info', () => {
    expect(toSeverity(0, 'statutory_ref')).toBe('info')
  })

  it('statutory_ref with negative days returns info', () => {
    expect(toSeverity(-5, 'statutory_ref')).toBe('info')
  })

  it('statutory_ref with very negative days returns info', () => {
    expect(toSeverity(-100, 'statutory_ref')).toBe('info')
  })

  // overdue (negative daysUntil) for non-statutory sources
  it('period_close overdue returns critical', () => {
    expect(toSeverity(-1, 'period_close')).toBe('critical')
  })

  it('user_declared overdue returns critical', () => {
    expect(toSeverity(-30, 'user_declared')).toBe('critical')
  })

  it('pcle_repayment overdue returns critical', () => {
    expect(toSeverity(-5, 'pcle_repayment')).toBe('critical')
  })

  it('workflow_pending overdue returns critical', () => {
    expect(toSeverity(-1, 'workflow_pending')).toBe('critical')
  })

  // <= 7 days (not overdue) returns critical
  it('1 day remaining period_close returns critical', () => {
    expect(toSeverity(1, 'period_close')).toBe('critical')
  })

  it('7 days remaining period_close returns critical', () => {
    expect(toSeverity(7, 'period_close')).toBe('critical')
  })

  it('7 days remaining user_declared returns critical', () => {
    expect(toSeverity(7, 'user_declared')).toBe('critical')
  })

  // <= 14 days (but > 7) returns warning
  it('8 days remaining period_close returns warning', () => {
    expect(toSeverity(8, 'period_close')).toBe('warning')
  })

  it('14 days remaining period_close returns warning', () => {
    expect(toSeverity(14, 'period_close')).toBe('warning')
  })

  it('14 days remaining user_declared returns warning', () => {
    expect(toSeverity(14, 'user_declared')).toBe('warning')
  })

  it('10 days remaining pcle_repayment returns warning', () => {
    expect(toSeverity(10, 'pcle_repayment')).toBe('warning')
  })

  // > 14 days returns info
  it('15 days remaining period_close returns info', () => {
    expect(toSeverity(15, 'period_close')).toBe('info')
  })

  it('30 days remaining user_declared returns info', () => {
    expect(toSeverity(30, 'user_declared')).toBe('info')
  })

  it('90 days remaining workflow_pending returns info', () => {
    expect(toSeverity(90, 'workflow_pending')).toBe('info')
  })

  // 0 days (due today) - boundary case
  it('0 days remaining period_close returns critical', () => {
    expect(toSeverity(0, 'period_close')).toBe('critical')
  })

  it('0 days remaining user_declared returns critical', () => {
    expect(toSeverity(0, 'user_declared')).toBe('critical')
  })
})
