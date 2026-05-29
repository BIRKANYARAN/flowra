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

describe('assertNotLocked — all non-blocking statuses do not throw', () => {
  it('open status with blocked=false does not throw', () => {
    const result: PeriodGuardResult = { blocked: false, period_status: 'open' }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('pre_close status with blocked=false does not throw', () => {
    const result: PeriodGuardResult = { blocked: false, period_status: 'pre_close' }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('undefined period_status with blocked=false does not throw', () => {
    const result: PeriodGuardResult = { blocked: false }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('open status with period_id does not throw', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      period_status: 'open',
      period_id:     'p-open-001',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('pre_close with reason but blocked=false does not throw', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      period_status: 'pre_close',
      reason:        'kapanma öncesi dönem',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })
})

describe('assertNotLocked — all blocking statuses throw', () => {
  it('locked period with blocked=true throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Dönem kilitlenmiş.',
      period_status: 'locked',
      period_id:     'p-locked',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('closed period with blocked=true throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Dönem kapalı.',
      period_status: 'closed',
      period_id:     'p-closed',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('adjustment period with blocked=true throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Düzeltme dönemi.',
      period_status: 'locked',
      period_id:     'p-adj',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('blocked with no period_status still throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked: true,
      reason:  'Dönem kilidi.',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })
})

describe('assertNotLocked — AppError properties on locked period', () => {
  it('thrown error has code PERIOD_LOCKED for locked status', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Dönem kilitlenmiş.',
      period_status: 'locked',
      period_id:     'p-locked-2',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('thrown error message matches provided reason for closed status', () => {
    const reason = 'Ocak 2025 dönemi kapalı.'
    const result: PeriodGuardResult = {
      blocked:       true,
      reason,
      period_status: 'closed',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('thrown error is an instance of AppError', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Test kilitli dönem.',
      period_status: 'locked',
    }
    let caught: unknown
    try {
      assertNotLocked(result)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AppError)
  })

  it('thrown AppError code is always PERIOD_LOCKED regardless of period_status', () => {
    const statuses: Array<PeriodGuardResult['period_status']> = ['locked', 'closed']
    for (const status of statuses) {
      const result: PeriodGuardResult = {
        blocked:       true,
        reason:        'Test',
        period_status: status,
      }
      try {
        assertNotLocked(result)
        expect(true).toBe(false)
      } catch (err) {
        expect((err as AppError).code).toBe('PERIOD_LOCKED')
      }
    }
  })
})

describe('assertNotLocked — blocked without period_id still throws', () => {
  it('blocked=true, no period_id throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked: true,
      reason:  'Herhangi bir dönem kilidi.',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('blocked=true, no period_id, code still PERIOD_LOCKED', () => {
    const result: PeriodGuardResult = {
      blocked: true,
      reason:  'Dönem kilidi yok period_id.',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })
})

describe('assertNotLocked — blocked without period_status still throws', () => {
  it('blocked=true, no period_status throws AppError', () => {
    const result: PeriodGuardResult = {
      blocked:   true,
      reason:    'Durumsuz kilit.',
      period_id: 'p-no-status',
    }
    expect(() => assertNotLocked(result)).toThrow(AppError)
  })

  it('blocked=true, no period_status, code still PERIOD_LOCKED', () => {
    const result: PeriodGuardResult = {
      blocked:   true,
      period_id: 'p-no-status-2',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })
})

describe('assertNotLocked — reason appears in error message', () => {
  it('reason text is propagated to error message', () => {
    const reason = 'Q1 2025 dönemi kilitlendi — muhasebe onayı gerekli.'
    const result: PeriodGuardResult = {
      blocked:       true,
      reason,
      period_status: 'locked',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('long reason string propagates correctly', () => {
    const reason = 'Bu dönem 31 Aralık 2024 tarihinde kilitlenmiştir. Yeni kayıt yapılamaz, düzeltme için muhasebe müdürü onayı gereklidir.'
    const result: PeriodGuardResult = {
      blocked:       true,
      reason,
      period_status: 'locked',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('default reason used when no reason provided', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      period_status: 'locked',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBeTruthy()
    }
  })
})

describe('assertNotLocked — not AppError when not blocked', () => {
  it('returns undefined when not blocked', () => {
    const result: PeriodGuardResult = { blocked: false }
    const returnValue = assertNotLocked(result)
    expect(returnValue).toBeUndefined()
  })

  it('return value is undefined for open period', () => {
    const result: PeriodGuardResult = { blocked: false, period_status: 'open' }
    const returnValue = assertNotLocked(result)
    expect(returnValue).toBeUndefined()
  })
})

describe('assertNotLocked — multiple non-throwing calls', () => {
  it('3 different non-blocked results all pass without throwing', () => {
    const results: PeriodGuardResult[] = [
      { blocked: false, period_status: 'open', period_id: 'p1' },
      { blocked: false, period_status: 'pre_close', period_id: 'p2' },
      { blocked: false },
    ]
    for (const r of results) {
      expect(() => assertNotLocked(r)).not.toThrow()
    }
  })

  it('5 non-blocked calls all return undefined', () => {
    const results: PeriodGuardResult[] = [
      { blocked: false },
      { blocked: false, period_status: 'open' },
      { blocked: false, period_status: 'pre_close' },
      { blocked: false, period_id: 'any' },
      { blocked: false, reason: 'not blocked but has reason' },
    ]
    for (const r of results) {
      expect(assertNotLocked(r)).toBeUndefined()
    }
  })
})
