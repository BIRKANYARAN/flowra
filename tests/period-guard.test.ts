/**
 * Tests for lib/middleware/period-guard.ts — assertNotLocked helper
 * Run with: npx vitest run tests/period-guard.test.ts
 */
import { describe, it, expect } from 'vitest'
import { assertNotLocked, type PeriodGuardResult } from '../lib/middleware/period-guard'
import { AppError } from '../types/errors'

describe('assertNotLocked', () => {
  it('does not throw when result is not blocked', () => {
    const result: PeriodGuardResult = { blocked: false }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('throws AppError when result is blocked', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Bu dönem kilitlenmiş.',
      period_status: 'locked',
      period_id:     'period-abc',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('thrown AppError has code PERIOD_LOCKED', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Bu dönem kapalı.',
      period_status: 'closed',
      period_id:     'period-xyz',
    }
    try {
      assertNotLocked(result)
      // Should not reach here
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(AppError)
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('thrown AppError message uses provided reason', () => {
    const reason = 'Q4 2024 dönemi kilitlenmiş — sadece okuma izni.'
    const result: PeriodGuardResult = {
      blocked: true,
      reason,
    }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('does not throw for open period status', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      period_status: 'open',
      period_id:     'period-open',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('does not throw when blocked is explicitly false', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      period_status: 'pre_close',
      period_id:     'period-preclose',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })
})
