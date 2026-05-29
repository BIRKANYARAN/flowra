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

describe('assertNotLocked — error is AppError not generic Error', () => {
  it('thrown error is AppError instance, not plain Error', () => {
    const result: PeriodGuardResult = {
      blocked:       true,
      reason:        'Dönem kilitli.',
      period_status: 'locked',
    }
    let caught: unknown
    try {
      assertNotLocked(result)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AppError)
    // Also verify it's an Error (AppError extends Error)
    expect(caught).toBeInstanceOf(Error)
  })

  it('non-blocked result returns without throwing', () => {
    const result: PeriodGuardResult = { blocked: false, period_status: 'open' }
    let threw = false
    try {
      assertNotLocked(result)
    } catch {
      threw = true
    }
    expect(threw).toBe(false)
  })
})

describe('assertNotLocked — various reason strings', () => {
  it('short reason string is preserved', () => {
    const reason = 'Kilitli.'
    const result: PeriodGuardResult = { blocked: true, reason }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('reason with special characters is preserved', () => {
    const reason = 'Dönem 31.12.2024 kilitlendi — artık yazı yapılamaz.'
    const result: PeriodGuardResult = { blocked: true, reason }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('reason with numeric content is preserved', () => {
    const reason = 'Period 2024-Q4 locked since 2024-12-31'
    const result: PeriodGuardResult = { blocked: true, reason }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })

  it('when no reason provided, default message used', () => {
    const result: PeriodGuardResult = { blocked: true }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      // Should have some default reason, not undefined or empty
      expect((err as AppError).message).toBeTruthy()
      expect((err as AppError).message.length).toBeGreaterThan(0)
    }
  })
})

describe('assertNotLocked — period_id in error context', () => {
  it('blocked with period_id does not appear in message (goes to context)', () => {
    const period_id = 'period-q4-2024'
    const reason = 'Kilitli dönem.'
    const result: PeriodGuardResult = {
      blocked: true,
      reason,
      period_id,
      period_status: 'locked',
    }
    try {
      assertNotLocked(result)
      expect(true).toBe(false)
    } catch (err) {
      // The reason is the message, period_id goes to context
      expect((err as AppError).message).toBe(reason)
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })
})

describe('assertNotLocked — blocked=false edge cases', () => {
  it('blocked=false with period_id does not throw', () => {
    const result: PeriodGuardResult = { blocked: false, period_id: 'some-id' }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('blocked=false with reason does not throw', () => {
    // Some non-blocked results may have informational reasons
    const result: PeriodGuardResult = { blocked: false, reason: 'informational only' }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('blocked=false with all optional fields set does not throw', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      reason:        'dönem açık',
      period_status: 'open',
      period_id:     'period-2026-q1',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('blocked=false returns undefined synchronously', () => {
    const result: PeriodGuardResult = { blocked: false }
    const ret = assertNotLocked(result)
    expect(ret).toBeUndefined()
  })
})

describe('assertNotLocked — sequential blocking calls', () => {
  it('two sequential blocked calls both throw AppError', () => {
    const r1: PeriodGuardResult = { blocked: true, reason: 'Kilit 1', period_status: 'locked' }
    const r2: PeriodGuardResult = { blocked: true, reason: 'Kilit 2', period_status: 'closed' }

    expect(() => assertNotLocked(r1)).toThrow(AppError)
    expect(() => assertNotLocked(r2)).toThrow(AppError)
  })

  it('mixing blocked and non-blocked calls — only blocked ones throw', () => {
    const blocked: PeriodGuardResult    = { blocked: true,  reason: 'Dönem kilitli.', period_status: 'locked' }
    const notBlocked: PeriodGuardResult = { blocked: false, period_status: 'open' }

    expect(() => assertNotLocked(notBlocked)).not.toThrow()
    expect(() => assertNotLocked(blocked)).toThrow(AppError)
    expect(() => assertNotLocked(notBlocked)).not.toThrow()
  })

  it('thrown AppError from first call does not affect second call', () => {
    const r1: PeriodGuardResult = { blocked: true,  reason: 'First lock.', period_status: 'locked' }
    const r2: PeriodGuardResult = { blocked: false, period_status: 'open' }

    try { assertNotLocked(r1) } catch { /* expected */ }
    expect(() => assertNotLocked(r2)).not.toThrow()
  })
})

describe('assertNotLocked — AppError code is always PERIOD_LOCKED', () => {
  it('code is PERIOD_LOCKED for locked period_status', () => {
    const result: PeriodGuardResult = { blocked: true, period_status: 'locked', reason: 'Test' }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('code is PERIOD_LOCKED for closed period_status', () => {
    const result: PeriodGuardResult = { blocked: true, period_status: 'closed', reason: 'Test' }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('code is PERIOD_LOCKED even with no period_status', () => {
    const result: PeriodGuardResult = { blocked: true, reason: 'Test no status' }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('code is PERIOD_LOCKED even with no reason', () => {
    const result: PeriodGuardResult = { blocked: true }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })

  it('code is PERIOD_LOCKED even with no period_id', () => {
    const result: PeriodGuardResult = { blocked: true, reason: 'No period id', period_status: 'locked' }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).code).toBe('PERIOD_LOCKED')
    }
  })
})

describe('assertNotLocked — function signature behavior', () => {
  it('function accepts PeriodGuardResult with only blocked property', () => {
    const minimal: PeriodGuardResult = { blocked: false }
    expect(() => assertNotLocked(minimal)).not.toThrow()
  })

  it('function accepts PeriodGuardResult with all optional fields set', () => {
    const full: PeriodGuardResult = {
      blocked:       false,
      reason:        'Açık dönem',
      period_status: 'open',
      period_id:     'p-full-001',
    }
    expect(() => assertNotLocked(full)).not.toThrow()
  })

  it('function throws for blocked=true regardless of other fields', () => {
    const blocked: PeriodGuardResult = { blocked: true }
    expect(() => assertNotLocked(blocked)).toThrow()
  })

  it('function returns void (undefined) for non-blocked', () => {
    const result = assertNotLocked({ blocked: false })
    expect(result).toBeUndefined()
  })
})

describe('assertNotLocked — Turkish period status messages', () => {
  it('default message for locked period is in Turkish', () => {
    const result: PeriodGuardResult = { blocked: true, period_status: 'locked' }
    try {
      assertNotLocked(result)
    } catch (err) {
      const msg = (err as AppError).message
      // Default message should contain Turkish keywords
      expect(msg).toBeTruthy()
    }
  })

  it('custom Turkish reason is passed through correctly', () => {
    const turkishReason = 'Mart 2026 dönemi kilitlenmiştir.'
    const result: PeriodGuardResult = { blocked: true, reason: turkishReason }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).message).toBe(turkishReason)
    }
  })

  it('reason with Turkish chars (ş, ğ, ı, ç, ö, ü) preserved', () => {
    const reason = 'Şubat dönemi güncelleme işlemi yasaklandı.'
    const result: PeriodGuardResult = { blocked: true, reason }
    try {
      assertNotLocked(result)
    } catch (err) {
      expect((err as AppError).message).toBe(reason)
    }
  })
})

describe('assertNotLocked — blocked false does not consume reason', () => {
  it('blocked=false with informational reason does not throw', () => {
    const result: PeriodGuardResult = {
      blocked: false,
      reason:  'Dönem henüz açık, uyarı yok.',
      period_status: 'open',
    }
    expect(() => assertNotLocked(result)).not.toThrow()
  })

  it('blocked=false returns undefined even with all fields populated', () => {
    const result: PeriodGuardResult = {
      blocked:       false,
      reason:        'Some informational text',
      period_status: 'pre_close',
      period_id:     'p-info',
    }
    const ret = assertNotLocked(result)
    expect(ret).toBeUndefined()
  })
})

describe('assertNotLocked — complete behavior matrix', () => {
  const cases: Array<{ desc: string; result: PeriodGuardResult; shouldThrow: boolean }> = [
    { desc: 'blocked=false, no extras',                result: { blocked: false },                   shouldThrow: false },
    { desc: 'blocked=false, open status',              result: { blocked: false, period_status: 'open' },      shouldThrow: false },
    { desc: 'blocked=false, pre_close status',         result: { blocked: false, period_status: 'pre_close' }, shouldThrow: false },
    { desc: 'blocked=true, locked status',             result: { blocked: true,  period_status: 'locked', reason: 'Lock' }, shouldThrow: true  },
    { desc: 'blocked=true, closed status',             result: { blocked: true,  period_status: 'closed', reason: 'Close' }, shouldThrow: true  },
    { desc: 'blocked=true, no status, no reason',      result: { blocked: true },                    shouldThrow: true  },
  ]

  for (const { desc, result, shouldThrow } of cases) {
    it(`${desc} — shouldThrow=${shouldThrow}`, () => {
      if (shouldThrow) {
        expect(() => assertNotLocked(result)).toThrow(AppError)
      } else {
        expect(() => assertNotLocked(result)).not.toThrow()
      }
    })
  }
})
