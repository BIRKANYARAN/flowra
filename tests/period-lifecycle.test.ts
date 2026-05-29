/**
 * Tests for lib/services/period.service.ts — pure helper functions
 * Run with: npx vitest run tests/period-lifecycle.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  isPeriodLocked,
  isPeriodOpen,
  daysSincePeriodEnd,
  formatPeriodStatus,
  canClosePeriod,
  canLockPeriod,
} from '../lib/services/period.service'

// ── isPeriodLocked ────────────────────────────────────────────────────────────

describe('isPeriodLocked', () => {
  it('returns true for "locked"', () => {
    expect(isPeriodLocked('locked')).toBe(true)
  })

  it('returns false for "open"', () => {
    expect(isPeriodLocked('open')).toBe(false)
  })

  it('returns false for "closed"', () => {
    expect(isPeriodLocked('closed')).toBe(false)
  })

  it('returns false for "pre_close"', () => {
    expect(isPeriodLocked('pre_close')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPeriodLocked('')).toBe(false)
  })

  it('returns false for unknown status', () => {
    expect(isPeriodLocked('archived')).toBe(false)
  })
})

// ── isPeriodOpen ──────────────────────────────────────────────────────────────

describe('isPeriodOpen', () => {
  it('returns true for "open"', () => {
    expect(isPeriodOpen('open')).toBe(true)
  })

  it('returns false for "closed"', () => {
    expect(isPeriodOpen('closed')).toBe(false)
  })

  it('returns false for "locked"', () => {
    expect(isPeriodOpen('locked')).toBe(false)
  })

  it('returns false for "pre_close"', () => {
    expect(isPeriodOpen('pre_close')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPeriodOpen('')).toBe(false)
  })

  it('returns false for unknown status', () => {
    expect(isPeriodOpen('draft')).toBe(false)
  })
})

// ── daysSincePeriodEnd ────────────────────────────────────────────────────────

describe('daysSincePeriodEnd', () => {
  it('returns 0 when periodEnd equals today', () => {
    expect(daysSincePeriodEnd('2024-03-31', '2024-03-31')).toBe(0)
  })

  it('returns 1 when period ended yesterday', () => {
    expect(daysSincePeriodEnd('2024-03-30', '2024-03-31')).toBe(1)
  })

  it('returns 30 for a month ago', () => {
    expect(daysSincePeriodEnd('2024-03-01', '2024-03-31')).toBe(30)
  })

  it('returns 365 for a year ago', () => {
    expect(daysSincePeriodEnd('2023-03-31', '2024-03-31')).toBe(366) // 2024 is leap year
  })

  it('returns negative when periodEnd is in the future', () => {
    expect(daysSincePeriodEnd('2024-04-30', '2024-03-31')).toBe(-30)
  })

  it('returns positive integer for past dates', () => {
    const result = daysSincePeriodEnd('2024-01-01', '2024-12-31')
    expect(result).toBeGreaterThan(0)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('handles end-of-year boundary', () => {
    expect(daysSincePeriodEnd('2023-12-31', '2024-01-01')).toBe(1)
  })
})

// ── formatPeriodStatus ────────────────────────────────────────────────────────

describe('formatPeriodStatus', () => {
  it('returns "Açık" for "open"', () => {
    expect(formatPeriodStatus('open')).toBe('Açık')
  })

  it('returns "Ön Kapanış" for "pre_close"', () => {
    expect(formatPeriodStatus('pre_close')).toBe('Ön Kapanış')
  })

  it('returns "Kapalı" for "closed"', () => {
    expect(formatPeriodStatus('closed')).toBe('Kapalı')
  })

  it('returns "Kilitli" for "locked"', () => {
    expect(formatPeriodStatus('locked')).toBe('Kilitli')
  })

  it('falls back to the raw status for unknown values', () => {
    expect(formatPeriodStatus('unknown_status')).toBe('unknown_status')
  })

  it('falls back to empty string when given empty string', () => {
    expect(formatPeriodStatus('')).toBe('')
  })
})

// ── canClosePeriod ────────────────────────────────────────────────────────────

describe('canClosePeriod', () => {
  it('returns true when status is "open" and checklist is complete', () => {
    expect(canClosePeriod('open', true)).toBe(true)
  })

  it('returns true when status is "pre_close" and checklist is complete', () => {
    expect(canClosePeriod('pre_close', true)).toBe(true)
  })

  it('returns false when status is "open" but checklist is incomplete', () => {
    expect(canClosePeriod('open', false)).toBe(false)
  })

  it('returns false when status is "pre_close" but checklist is incomplete', () => {
    expect(canClosePeriod('pre_close', false)).toBe(false)
  })

  it('returns false when status is "closed" even with complete checklist', () => {
    expect(canClosePeriod('closed', true)).toBe(false)
  })

  it('returns false when status is "locked" even with complete checklist', () => {
    expect(canClosePeriod('locked', true)).toBe(false)
  })

  it('returns false when status is "locked" and checklist is incomplete', () => {
    expect(canClosePeriod('locked', false)).toBe(false)
  })

  it('returns false for unknown status even with complete checklist', () => {
    expect(canClosePeriod('archived', true)).toBe(false)
  })
})

// ── canLockPeriod ─────────────────────────────────────────────────────────────

describe('canLockPeriod', () => {
  it('returns true for "closed"', () => {
    expect(canLockPeriod('closed')).toBe(true)
  })

  it('returns false for "open"', () => {
    expect(canLockPeriod('open')).toBe(false)
  })

  it('returns false for "locked" (already locked)', () => {
    expect(canLockPeriod('locked')).toBe(false)
  })

  it('returns false for "pre_close"', () => {
    expect(canLockPeriod('pre_close')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(canLockPeriod('')).toBe(false)
  })

  it('returns false for unknown status', () => {
    expect(canLockPeriod('pending')).toBe(false)
  })
})
