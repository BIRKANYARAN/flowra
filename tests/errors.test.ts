/**
 * Tests for types/errors.ts — error code registry and HTTP mapping
 * Run with: npx vitest run tests/errors.test.ts
 */
import { describe, it, expect } from 'vitest'
import { ERROR_CODES, AppError, toErrorResponse, isAppError } from '../types/errors'

describe('ERROR_CODES', () => {
  it('IDEMPOTENCY_MISMATCH returns 409', () => {
    expect(ERROR_CODES.IDEMPOTENCY_MISMATCH.httpStatus).toBe(409)
    expect(ERROR_CODES.IDEMPOTENCY_MISMATCH.type).toBe('BUSINESS')
  })

  it('IDEMPOTENCY_PENDING returns 409', () => {
    expect(ERROR_CODES.IDEMPOTENCY_PENDING.httpStatus).toBe(409)
  })

  it('ZERO_COST_LOT returns 422', () => {
    expect(ERROR_CODES.ZERO_COST_LOT.httpStatus).toBe(422)
    expect(ERROR_CODES.ZERO_COST_LOT.type).toBe('BUSINESS')
  })

  it('FX_UNAVAILABLE returns 503', () => {
    expect(ERROR_CODES.FX_UNAVAILABLE.httpStatus).toBe(503)
    expect(ERROR_CODES.FX_UNAVAILABLE.type).toBe('SYSTEM')
  })

  it('FX_RATE_NOT_FOUND returns 422 as BUSINESS error', () => {
    expect(ERROR_CODES.FX_RATE_NOT_FOUND.httpStatus).toBe(422)
    expect(ERROR_CODES.FX_RATE_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('INSUFFICIENT_STOCK returns 409', () => {
    expect(ERROR_CODES.INSUFFICIENT_STOCK.httpStatus).toBe(409)
  })
})

describe('AppError', () => {
  it('constructs with correct fields', () => {
    const err = new AppError('IDEMPOTENCY_MISMATCH', 'Test message', { key: 'abc' })
    expect(err.code).toBe('IDEMPOTENCY_MISMATCH')
    expect(err.type).toBe('BUSINESS')
    expect(err.httpStatus).toBe(409)
    expect(err.message).toBe('Test message')
    expect(err.details).toEqual({ key: 'abc' })
  })

  it('toClientJSON never includes details', () => {
    const err = new AppError('ZERO_COST_LOT', 'msg', { internal: 'secret' })
    const json = err.toClientJSON()
    expect(json).not.toHaveProperty('details')
    expect(json.code).toBe('ZERO_COST_LOT')
  })
})

describe('toErrorResponse', () => {
  it('maps AppError to correct status', () => {
    const err = new AppError('IDEMPOTENCY_MISMATCH', 'dup')
    const { body, status } = toErrorResponse(err)
    expect(status).toBe(409)
    expect((body as any).code).toBe('IDEMPOTENCY_MISMATCH')
  })

  it('maps unknown errors to 500', () => {
    const { body, status } = toErrorResponse(new Error('random'))
    expect(status).toBe(500)
    expect((body as any).code).toBe('SYSTEM_ERROR')
  })
})

describe('isAppError', () => {
  it('returns true for AppError instances', () => {
    expect(isAppError(new AppError('NO_ITEMS', 'x'))).toBe(true)
  })
  it('returns false for plain errors', () => {
    expect(isAppError(new Error('x'))).toBe(false)
  })
  it('returns false for null', () => {
    expect(isAppError(null)).toBe(false)
  })
  it('returns false for plain objects', () => {
    expect(isAppError({ code: 'SOME_CODE', message: 'oops' })).toBe(false)
  })
  it('returns false for strings', () => {
    expect(isAppError('IDEMPOTENCY_MISMATCH')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ERROR_CODES — extended coverage for all groups
// ─────────────────────────────────────────────────────────────────────────────

describe('ERROR_CODES — proforma group', () => {
  it('PROFORMA_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.PROFORMA_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PROFORMA_NOT_FOUND.type).toBe('BUSINESS')
  })
  it('PROFORMA_NOT_DRAFT returns 409', () => {
    expect(ERROR_CODES.PROFORMA_NOT_DRAFT.httpStatus).toBe(409)
  })
  it('PROFORMA_ALREADY_DELETED returns 409', () => {
    expect(ERROR_CODES.PROFORMA_ALREADY_DELETED.httpStatus).toBe(409)
  })
  it('PROFORMA_INVALID_STATUS returns 409', () => {
    expect(ERROR_CODES.PROFORMA_INVALID_STATUS.httpStatus).toBe(409)
  })
})

describe('ERROR_CODES — sale / conversion group', () => {
  it('ALREADY_CONVERTED returns 409', () => {
    expect(ERROR_CODES.ALREADY_CONVERTED.httpStatus).toBe(409)
    expect(ERROR_CODES.ALREADY_CONVERTED.type).toBe('BUSINESS')
  })
  it('NO_ITEMS returns 422', () => {
    expect(ERROR_CODES.NO_ITEMS.httpStatus).toBe(422)
  })
  it('INVALID_QUANTITY returns 422', () => {
    expect(ERROR_CODES.INVALID_QUANTITY.httpStatus).toBe(422)
  })
  it('INVALID_PRICE returns 422', () => {
    expect(ERROR_CODES.INVALID_PRICE.httpStatus).toBe(422)
  })
})

describe('ERROR_CODES — stock group', () => {
  it('PRODUCT_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.PRODUCT_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PRODUCT_NOT_FOUND.type).toBe('BUSINESS')
  })
  it('NEGATIVE_STOCK returns 409', () => {
    expect(ERROR_CODES.NEGATIVE_STOCK.httpStatus).toBe(409)
  })
  it('ZERO_COST_LOT type is BUSINESS', () => {
    expect(ERROR_CODES.ZERO_COST_LOT.type).toBe('BUSINESS')
  })
})

describe('ERROR_CODES — security group', () => {
  it('UNAUTHORIZED returns 401 as SECURITY', () => {
    expect(ERROR_CODES.UNAUTHORIZED.httpStatus).toBe(401)
    expect(ERROR_CODES.UNAUTHORIZED.type).toBe('SECURITY')
  })
  it('FORBIDDEN returns 403 as SECURITY', () => {
    expect(ERROR_CODES.FORBIDDEN.httpStatus).toBe(403)
    expect(ERROR_CODES.FORBIDDEN.type).toBe('SECURITY')
  })
  it('RATE_LIMITED returns 429 as SECURITY', () => {
    expect(ERROR_CODES.RATE_LIMITED.httpStatus).toBe(429)
    expect(ERROR_CODES.RATE_LIMITED.type).toBe('SECURITY')
  })
  it('AUDIT_FORBIDDEN returns 403', () => {
    expect(ERROR_CODES.AUDIT_FORBIDDEN.httpStatus).toBe(403)
    expect(ERROR_CODES.AUDIT_FORBIDDEN.type).toBe('SECURITY')
  })
})

describe('ERROR_CODES — system group', () => {
  it('DB_INSERT_FAILED returns 500 as SYSTEM', () => {
    expect(ERROR_CODES.DB_INSERT_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_INSERT_FAILED.type).toBe('SYSTEM')
  })
  it('DB_UPDATE_FAILED returns 500', () => {
    expect(ERROR_CODES.DB_UPDATE_FAILED.httpStatus).toBe(500)
  })
  it('DB_READ_FAILED returns 500', () => {
    expect(ERROR_CODES.DB_READ_FAILED.httpStatus).toBe(500)
  })
  it('RPC_FAILED returns 500', () => {
    expect(ERROR_CODES.RPC_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.RPC_FAILED.type).toBe('SYSTEM')
  })
  it('COMPANY_NOT_RESOLVED returns 500', () => {
    expect(ERROR_CODES.COMPANY_NOT_RESOLVED.httpStatus).toBe(500)
    expect(ERROR_CODES.COMPANY_NOT_RESOLVED.type).toBe('SYSTEM')
  })
})

describe('ERROR_CODES — partner group', () => {
  it('PARTNER_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.PARTNER_NOT_FOUND.httpStatus).toBe(404)
  })
  it('PARTNER_SHARE_RATIO_INVALID returns 422', () => {
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_INVALID.httpStatus).toBe(422)
  })
  it('PARTNER_TX_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.PARTNER_TX_NOT_FOUND.httpStatus).toBe(404)
  })
  it('PARTNER_SHARE_RATIO_SUM returns 422', () => {
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_SUM.httpStatus).toBe(422)
  })
})

describe('AppError — extended', () => {
  it('name is "AppError"', () => {
    const err = new AppError('UNAUTHORIZED', 'Not allowed')
    expect(err.name).toBe('AppError')
  })

  it('is instanceof Error', () => {
    expect(new AppError('DB_INSERT_FAILED', 'insert error')).toBeInstanceOf(Error)
  })

  it('toClientJSON returns correct structure', () => {
    const err = new AppError('PROFORMA_NOT_FOUND', 'bulunamadı')
    const json = err.toClientJSON()
    expect(json.error).toBe('bulunamadı')
    expect(json.code).toBe('PROFORMA_NOT_FOUND')
    expect(json.type).toBe('BUSINESS')
  })

  it('toLogContext includes details', () => {
    const err = new AppError('INSUFFICIENT_STOCK', 'stok yetersiz', { productId: 'p1' })
    const ctx = err.toLogContext()
    expect(ctx.error_code).toBe('INSUFFICIENT_STOCK')
    expect((ctx.details as any).productId).toBe('p1')
    expect(ctx.error_type).toBe('BUSINESS')
  })

  it('AppError with SECURITY code has 401 status', () => {
    const err = new AppError('UNAUTHORIZED', 'yetkisiz erişim')
    expect(err.httpStatus).toBe(401)
    expect(err.type).toBe('SECURITY')
  })

  it('details can be undefined', () => {
    const err = new AppError('VALIDATION_ERROR', 'hatalı giriş')
    expect(err.details).toBeUndefined()
  })

  it('has a stack trace', () => {
    const err = new AppError('DB_READ_FAILED', 'okuma hatası')
    expect(err.stack).toBeDefined()
  })
})

describe('toErrorResponse — extended', () => {
  it('SYSTEM error returns 500', () => {
    const err = new AppError('DB_INSERT_FAILED', 'insert failed')
    const { status, body } = toErrorResponse(err)
    expect(status).toBe(500)
    expect((body as any).type).toBe('SYSTEM')
  })

  it('SECURITY error returns 401', () => {
    const err = new AppError('UNAUTHORIZED', 'no access')
    const { status } = toErrorResponse(err)
    expect(status).toBe(401)
  })

  it('null input returns 500', () => {
    const { status } = toErrorResponse(null)
    expect(status).toBe(500)
  })

  it('string error returns 500', () => {
    const { status, body } = toErrorResponse('something broke')
    expect(status).toBe(500)
    expect((body as any).code).toBe('SYSTEM_ERROR')
  })

  it('unknown error body does not leak internal message', () => {
    const { body } = toErrorResponse(new Error('internal secret'))
    expect(JSON.stringify(body)).not.toContain('internal secret')
  })
})

// ── ERROR_CODES — validation / expense group ──────────────────────────────────

describe('ERROR_CODES — validation group', () => {
  it('VALIDATION_ERROR returns 422 as BUSINESS', () => {
    expect(ERROR_CODES.VALIDATION_ERROR.httpStatus).toBe(422)
    expect(ERROR_CODES.VALIDATION_ERROR.type).toBe('BUSINESS')
  })

  it('MISSING_REQUIRED_FIELD returns 422', () => {
    expect(ERROR_CODES.MISSING_REQUIRED_FIELD.httpStatus).toBe(422)
  })

  it('INVALID_INPUT returns 422', () => {
    expect(ERROR_CODES.INVALID_INPUT.httpStatus).toBe(422)
  })

  it('IDEMPOTENCY_KEY_MISSING returns 422', () => {
    expect(ERROR_CODES.IDEMPOTENCY_KEY_MISSING.httpStatus).toBe(422)
  })
})

describe('ERROR_CODES — expense group', () => {
  it('EXPENSE_NOT_FOUND returns 404 as BUSINESS', () => {
    expect(ERROR_CODES.EXPENSE_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.EXPENSE_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('INVALID_AMOUNT returns 422', () => {
    expect(ERROR_CODES.INVALID_AMOUNT.httpStatus).toBe(422)
  })
})

describe('ERROR_CODES — purchase group', () => {
  it('PURCHASE_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.PURCHASE_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PURCHASE_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('PURCHASE_NOT_DRAFT returns 409', () => {
    expect(ERROR_CODES.PURCHASE_NOT_DRAFT.httpStatus).toBe(409)
  })

  it('PURCHASE_NO_LINES returns 422', () => {
    expect(ERROR_CODES.PURCHASE_NO_LINES.httpStatus).toBe(422)
  })

  it('PURCHASE_ALLOC_FAILED returns 422', () => {
    expect(ERROR_CODES.PURCHASE_ALLOC_FAILED.httpStatus).toBe(422)
  })
})

describe('ERROR_CODES — period / audit group', () => {
  it('PERIOD_LOCKED returns 409 as BUSINESS', () => {
    expect(ERROR_CODES.PERIOD_LOCKED.httpStatus).toBe(409)
    expect(ERROR_CODES.PERIOD_LOCKED.type).toBe('BUSINESS')
  })

  it('ROLLBACK_NOT_SUPPORTED returns 422', () => {
    expect(ERROR_CODES.ROLLBACK_NOT_SUPPORTED.httpStatus).toBe(422)
  })

  it('ROLLBACK_ENTITY_NOT_FOUND returns 404', () => {
    expect(ERROR_CODES.ROLLBACK_ENTITY_NOT_FOUND.httpStatus).toBe(404)
  })
})

describe('ERROR_CODES — FX group', () => {
  it('FX_UNAVAILABLE is SYSTEM error', () => {
    expect(ERROR_CODES.FX_UNAVAILABLE.type).toBe('SYSTEM')
    expect(ERROR_CODES.FX_UNAVAILABLE.httpStatus).toBe(503)
  })

  it('FX_RATE_NOT_FOUND is BUSINESS error', () => {
    expect(ERROR_CODES.FX_RATE_NOT_FOUND.type).toBe('BUSINESS')
    expect(ERROR_CODES.FX_RATE_NOT_FOUND.httpStatus).toBe(422)
  })
})

describe('ERROR_CODES — system group (extended)', () => {
  it('DB_QUERY_FAILED returns 500 as SYSTEM', () => {
    expect(ERROR_CODES.DB_QUERY_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_QUERY_FAILED.type).toBe('SYSTEM')
  })

  it('STORAGE_UPLOAD_FAILED returns 500 as SYSTEM', () => {
    expect(ERROR_CODES.STORAGE_UPLOAD_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.STORAGE_UPLOAD_FAILED.type).toBe('SYSTEM')
  })
})

// ── AppError — toLogContext detailed tests ─────────────────────────────────────

describe('AppError — toLogContext', () => {
  it('includes all four required log keys', () => {
    const err = new AppError('DB_INSERT_FAILED', 'insert error', { table: 'sales' })
    const ctx = err.toLogContext()
    expect(ctx).toHaveProperty('error_type')
    expect(ctx).toHaveProperty('error_code')
    expect(ctx).toHaveProperty('error_msg')
    expect(ctx).toHaveProperty('details')
  })

  it('error_msg matches the message passed to constructor', () => {
    const err = new AppError('VALIDATION_ERROR', 'hatalı giriş')
    expect(err.toLogContext().error_msg).toBe('hatalı giriş')
  })

  it('details is undefined when no details passed', () => {
    const err = new AppError('NO_ITEMS', 'no items')
    expect(err.toLogContext().details).toBeUndefined()
  })

  it('details carries full object reference', () => {
    const detail = { product: 'p1', qty: -5 }
    const err = new AppError('NEGATIVE_STOCK', 'stok negatif', detail)
    expect(err.toLogContext().details).toEqual(detail)
  })
})

// ── AppError — constructor and type derivation ────────────────────────────────

describe('AppError — type derivation from code', () => {
  it('SYSTEM code → type is SYSTEM', () => {
    expect(new AppError('DB_READ_FAILED', 'err').type).toBe('SYSTEM')
  })

  it('SECURITY code → type is SECURITY', () => {
    expect(new AppError('FORBIDDEN', 'forbidden').type).toBe('SECURITY')
  })

  it('BUSINESS code → type is BUSINESS', () => {
    expect(new AppError('NO_ITEMS', 'no items').type).toBe('BUSINESS')
  })

  it('httpStatus derived from ERROR_CODES registry', () => {
    const err = new AppError('RATE_LIMITED', 'too many requests')
    expect(err.httpStatus).toBe(429)
  })

  it('two AppErrors with different codes are independent', () => {
    const e1 = new AppError('UNAUTHORIZED', 'unauth')
    const e2 = new AppError('FORBIDDEN', 'forbidden')
    expect(e1.httpStatus).not.toBe(e2.httpStatus)
    expect(e1.type).toBe(e2.type) // both SECURITY
  })
})

// ── isAppError — comprehensive type guard tests ───────────────────────────────

describe('isAppError — comprehensive', () => {
  it('returns true for any AppError code', () => {
    const codes: Array<keyof typeof ERROR_CODES> = [
      'UNAUTHORIZED', 'DB_INSERT_FAILED', 'PROFORMA_NOT_FOUND', 'VALIDATION_ERROR',
    ]
    for (const code of codes) {
      expect(isAppError(new AppError(code, 'msg'))).toBe(true)
    }
  })

  it('returns false for undefined', () => {
    expect(isAppError(undefined)).toBe(false)
  })

  it('returns false for numbers', () => {
    expect(isAppError(404)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isAppError([])).toBe(false)
  })

  it('returns false for Error subclasses that are not AppError', () => {
    class CustomError extends Error {}
    expect(isAppError(new CustomError('custom'))).toBe(false)
  })
})

// ── toErrorResponse — edge cases ──────────────────────────────────────────────

describe('toErrorResponse — additional edge cases', () => {
  it('body always has code property', () => {
    const { body } = toErrorResponse(new AppError('VALIDATION_ERROR', 'bad input'))
    expect(body).toHaveProperty('code')
  })

  it('body always has error property', () => {
    const { body } = toErrorResponse(new AppError('VALIDATION_ERROR', 'bad input'))
    expect(body).toHaveProperty('error')
  })

  it('status is always a number', () => {
    expect(typeof toErrorResponse(new AppError('FORBIDDEN', 'no')).status).toBe('number')
    expect(typeof toErrorResponse(new Error('unknown')).status).toBe('number')
  })

  it('FORBIDDEN AppError → 403 status', () => {
    const { status } = toErrorResponse(new AppError('FORBIDDEN', 'no access'))
    expect(status).toBe(403)
  })

  it('RATE_LIMITED AppError → 429 status', () => {
    const { status } = toErrorResponse(new AppError('RATE_LIMITED', 'slow down'))
    expect(status).toBe(429)
  })

  it('object with no code → 500 fallback', () => {
    const { status } = toErrorResponse({ message: 'some message' })
    expect(status).toBe(500)
  })
})

// ── ERROR_CODES — structural invariants ───────────────────────────────────────

describe('ERROR_CODES — structural invariants', () => {
  it('every entry has a type property', () => {
    for (const [key, entry] of Object.entries(ERROR_CODES)) {
      expect(typeof entry.type).toBe('string'), `${key} missing type`
    }
  })

  it('every entry has an httpStatus property', () => {
    for (const [key, entry] of Object.entries(ERROR_CODES)) {
      expect(typeof entry.httpStatus).toBe('number'), `${key} missing httpStatus`
    }
  })

  it('all SYSTEM errors return 5xx status', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      if (entry.type === 'SYSTEM') {
        expect(entry.httpStatus).toBeGreaterThanOrEqual(500)
        expect(entry.httpStatus).toBeLessThan(600)
      }
    }
  })

  it('all SECURITY errors return 4xx status', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      if (entry.type === 'SECURITY') {
        expect(entry.httpStatus).toBeGreaterThanOrEqual(400)
        expect(entry.httpStatus).toBeLessThan(500)
      }
    }
  })

  it('all BUSINESS errors return 4xx status', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      if (entry.type === 'BUSINESS') {
        expect(entry.httpStatus).toBeGreaterThanOrEqual(400)
        expect(entry.httpStatus).toBeLessThan(500)
      }
    }
  })

  it('error code count is > 30 (registry is sufficiently populated)', () => {
    expect(Object.keys(ERROR_CODES).length).toBeGreaterThan(30)
  })

  it('no httpStatus is 0 or negative', () => {
    for (const entry of Object.values(ERROR_CODES)) {
      expect(entry.httpStatus).toBeGreaterThan(0)
    }
  })

  it('IDEMPOTENCY codes share the same httpStatus', () => {
    expect(ERROR_CODES.IDEMPOTENCY_MISMATCH.httpStatus).toBe(
      ERROR_CODES.IDEMPOTENCY_PENDING.httpStatus
    )
  })
})

// ── AppError — message immutability ───────────────────────────────────────────

describe('AppError — message and immutability', () => {
  it('message is accessible via .message', () => {
    const err = new AppError('VALIDATION_ERROR', 'test message')
    expect(err.message).toBe('test message')
  })

  it('code is accessible via .code', () => {
    const err = new AppError('NO_ITEMS', 'no items')
    expect(err.code).toBe('NO_ITEMS')
  })

  it('can be thrown and caught as Error', () => {
    expect(() => {
      throw new AppError('UNAUTHORIZED', 'no access')
    }).toThrowError('no access')
  })

  it('caught AppError is recognized by isAppError', () => {
    let caught: unknown
    try {
      throw new AppError('FORBIDDEN', 'forbidden')
    } catch (e) {
      caught = e
    }
    expect(isAppError(caught)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AppError — toClientJSON and toLogContext
// ─────────────────────────────────────────────────────────────────────────────

describe('AppError.toClientJSON()', () => {
  it('returns error, code, type fields', () => {
    const err = new AppError('UNAUTHORIZED', 'Yetki yok')
    const json = err.toClientJSON()
    expect(json.error).toBe('Yetki yok')
    expect(json.code).toBe('UNAUTHORIZED')
    expect(json.type).toBe('SECURITY')
  })

  it('never leaks details field', () => {
    const err = new AppError('DB_INSERT_FAILED', 'kayıt hatası', { sql: 'SELECT *' })
    const json = err.toClientJSON()
    expect(json).not.toHaveProperty('details')
    expect(json).not.toHaveProperty('httpStatus')
  })

  it('toClientJSON returns plain object with exactly 3 keys', () => {
    const err = new AppError('FORBIDDEN', 'Erişim engellendi')
    const json = err.toClientJSON()
    expect(Object.keys(json).sort()).toEqual(['code', 'error', 'type'])
  })

  it('toClientJSON.type reflects BUSINESS for a business error', () => {
    const err = new AppError('NO_ITEMS', 'Kalem yok')
    expect(err.toClientJSON().type).toBe('BUSINESS')
  })

  it('toClientJSON.type reflects SYSTEM for a system error', () => {
    const err = new AppError('DB_QUERY_FAILED', 'Sorgu hatası')
    expect(err.toClientJSON().type).toBe('SYSTEM')
  })
})

describe('AppError.toLogContext()', () => {
  it('returns error_type, error_code, error_msg, details', () => {
    const err = new AppError('STORAGE_UPLOAD_FAILED', 'Yükleme başarısız', { file: 'x.pdf' })
    const ctx = err.toLogContext()
    expect(ctx.error_type).toBe('SYSTEM')
    expect(ctx.error_code).toBe('STORAGE_UPLOAD_FAILED')
    expect(ctx.error_msg).toBe('Yükleme başarısız')
    expect(ctx.details).toEqual({ file: 'x.pdf' })
  })

  it('details is undefined when no details provided', () => {
    const err = new AppError('INVALID_INPUT', 'Geçersiz giriş')
    const ctx = err.toLogContext()
    expect(ctx.details).toBeUndefined()
  })

  it('toLogContext includes all 4 keys', () => {
    const err = new AppError('RPC_FAILED', 'RPC hatası')
    const ctx = err.toLogContext()
    expect(Object.keys(ctx).sort()).toEqual(['details', 'error_code', 'error_msg', 'error_type'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ERROR_CODES — exhaustive type/status checks for remaining codes
// ─────────────────────────────────────────────────────────────────────────────

describe('ERROR_CODES — purchase/partner codes', () => {
  it('PURCHASE_NOT_FOUND is 404 BUSINESS', () => {
    expect(ERROR_CODES.PURCHASE_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PURCHASE_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('PURCHASE_NOT_DRAFT is 409 BUSINESS', () => {
    expect(ERROR_CODES.PURCHASE_NOT_DRAFT.httpStatus).toBe(409)
    expect(ERROR_CODES.PURCHASE_NOT_DRAFT.type).toBe('BUSINESS')
  })

  it('PURCHASE_NO_LINES is 422 BUSINESS', () => {
    expect(ERROR_CODES.PURCHASE_NO_LINES.httpStatus).toBe(422)
    expect(ERROR_CODES.PURCHASE_NO_LINES.type).toBe('BUSINESS')
  })

  it('PURCHASE_ALLOC_FAILED is 422 BUSINESS', () => {
    expect(ERROR_CODES.PURCHASE_ALLOC_FAILED.httpStatus).toBe(422)
    expect(ERROR_CODES.PURCHASE_ALLOC_FAILED.type).toBe('BUSINESS')
  })

  it('PARTNER_NOT_FOUND is 404 BUSINESS', () => {
    expect(ERROR_CODES.PARTNER_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PARTNER_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('PARTNER_SHARE_RATIO_INVALID is 422 BUSINESS', () => {
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_INVALID.httpStatus).toBe(422)
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_INVALID.type).toBe('BUSINESS')
  })

  it('PARTNER_TX_NOT_FOUND is 404 BUSINESS', () => {
    expect(ERROR_CODES.PARTNER_TX_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.PARTNER_TX_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('PARTNER_SHARE_RATIO_SUM is 422 BUSINESS', () => {
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_SUM.httpStatus).toBe(422)
    expect(ERROR_CODES.PARTNER_SHARE_RATIO_SUM.type).toBe('BUSINESS')
  })
})

describe('ERROR_CODES — audit/rollback codes', () => {
  it('AUDIT_FORBIDDEN is 403 SECURITY', () => {
    expect(ERROR_CODES.AUDIT_FORBIDDEN.httpStatus).toBe(403)
    expect(ERROR_CODES.AUDIT_FORBIDDEN.type).toBe('SECURITY')
  })

  it('ROLLBACK_NOT_SUPPORTED is 422 BUSINESS', () => {
    expect(ERROR_CODES.ROLLBACK_NOT_SUPPORTED.httpStatus).toBe(422)
    expect(ERROR_CODES.ROLLBACK_NOT_SUPPORTED.type).toBe('BUSINESS')
  })

  it('ROLLBACK_ENTITY_NOT_FOUND is 404 BUSINESS', () => {
    expect(ERROR_CODES.ROLLBACK_ENTITY_NOT_FOUND.httpStatus).toBe(404)
    expect(ERROR_CODES.ROLLBACK_ENTITY_NOT_FOUND.type).toBe('BUSINESS')
  })

  it('PERIOD_LOCKED is 409 BUSINESS', () => {
    expect(ERROR_CODES.PERIOD_LOCKED.httpStatus).toBe(409)
    expect(ERROR_CODES.PERIOD_LOCKED.type).toBe('BUSINESS')
  })

  it('COMPANY_NOT_RESOLVED is 500 SYSTEM', () => {
    expect(ERROR_CODES.COMPANY_NOT_RESOLVED.httpStatus).toBe(500)
    expect(ERROR_CODES.COMPANY_NOT_RESOLVED.type).toBe('SYSTEM')
  })
})

describe('ERROR_CODES — security codes', () => {
  it('UNAUTHORIZED is 401 SECURITY', () => {
    expect(ERROR_CODES.UNAUTHORIZED.httpStatus).toBe(401)
    expect(ERROR_CODES.UNAUTHORIZED.type).toBe('SECURITY')
  })

  it('FORBIDDEN is 403 SECURITY', () => {
    expect(ERROR_CODES.FORBIDDEN.httpStatus).toBe(403)
    expect(ERROR_CODES.FORBIDDEN.type).toBe('SECURITY')
  })

  it('RATE_LIMITED is 429 SECURITY', () => {
    expect(ERROR_CODES.RATE_LIMITED.httpStatus).toBe(429)
    expect(ERROR_CODES.RATE_LIMITED.type).toBe('SECURITY')
  })
})

describe('ERROR_CODES — system DB codes', () => {
  it('DB_INSERT_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.DB_INSERT_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_INSERT_FAILED.type).toBe('SYSTEM')
  })

  it('DB_UPDATE_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.DB_UPDATE_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_UPDATE_FAILED.type).toBe('SYSTEM')
  })

  it('DB_READ_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.DB_READ_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_READ_FAILED.type).toBe('SYSTEM')
  })

  it('DB_QUERY_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.DB_QUERY_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.DB_QUERY_FAILED.type).toBe('SYSTEM')
  })

  it('STORAGE_UPLOAD_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.STORAGE_UPLOAD_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.STORAGE_UPLOAD_FAILED.type).toBe('SYSTEM')
  })

  it('RPC_FAILED is 500 SYSTEM', () => {
    expect(ERROR_CODES.RPC_FAILED.httpStatus).toBe(500)
    expect(ERROR_CODES.RPC_FAILED.type).toBe('SYSTEM')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// toErrorResponse — additional coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('toErrorResponse() — additional edge cases', () => {
  it('AppError RATE_LIMITED → 429 status', () => {
    const err = new AppError('RATE_LIMITED', 'Çok fazla istek')
    const { status } = toErrorResponse(err)
    expect(status).toBe(429)
  })

  it('AppError UNAUTHORIZED → 401 status', () => {
    const err = new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli')
    const { status } = toErrorResponse(err)
    expect(status).toBe(401)
  })

  it('AppError FX_UNAVAILABLE → 503 status', () => {
    const err = new AppError('FX_UNAVAILABLE', 'Kur servisi erişilemiyor')
    const { status } = toErrorResponse(err)
    expect(status).toBe(503)
  })

  it('unknown Error → 500 status with safe body', () => {
    const err = new Error('Disk full')
    const { status, body } = toErrorResponse(err)
    expect(status).toBe(500)
    expect(body).toHaveProperty('error')
    expect(body).not.toHaveProperty('stack')
  })

  it('null → 500 status', () => {
    const { status } = toErrorResponse(null)
    expect(status).toBe(500)
  })

  it('plain string → 500 status', () => {
    const { status } = toErrorResponse('something went wrong')
    expect(status).toBe(500)
  })

  it('AppError body contains code field', () => {
    const err = new AppError('PRODUCT_NOT_FOUND', 'Ürün bulunamadı')
    const { body } = toErrorResponse(err)
    expect(body).toHaveProperty('code', 'PRODUCT_NOT_FOUND')
  })

  it('AppError body contains type field', () => {
    const err = new AppError('EXPENSE_NOT_FOUND', 'Masraf yok')
    const { body } = toErrorResponse(err)
    expect(body).toHaveProperty('type', 'BUSINESS')
  })

  it('system error body code is SYSTEM_ERROR', () => {
    const { body } = toErrorResponse(undefined)
    expect((body as Record<string, unknown>).code).toBe('SYSTEM_ERROR')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isAppError — additional guards
// ─────────────────────────────────────────────────────────────────────────────

describe('isAppError() — additional edge cases', () => {
  it('plain Error is NOT AppError', () => {
    expect(isAppError(new Error('plain'))).toBe(false)
  })

  it('null is NOT AppError', () => {
    expect(isAppError(null)).toBe(false)
  })

  it('undefined is NOT AppError', () => {
    expect(isAppError(undefined)).toBe(false)
  })

  it('plain object is NOT AppError', () => {
    expect(isAppError({ code: 'UNAUTHORIZED', message: 'x' })).toBe(false)
  })

  it('string is NOT AppError', () => {
    expect(isAppError('UNAUTHORIZED')).toBe(false)
  })

  it('AppError with SYSTEM type is AppError', () => {
    const err = new AppError('DB_INSERT_FAILED', 'hata')
    expect(isAppError(err)).toBe(true)
  })

  it('AppError with SECURITY type is AppError', () => {
    const err = new AppError('FORBIDDEN', 'yasak')
    expect(isAppError(err)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// AppError — httpStatus derived from code, not type
// ─────────────────────────────────────────────────────────────────────────────

describe('AppError — httpStatus comes from ERROR_CODES, not ErrorType default', () => {
  it('PROFORMA_NOT_FOUND is 404 even though type is BUSINESS (default 422)', () => {
    const err = new AppError('PROFORMA_NOT_FOUND', 'bulunamadı')
    expect(err.httpStatus).toBe(404)
    expect(err.type).toBe('BUSINESS')
  })

  it('ALREADY_CONVERTED is 409 even though type is BUSINESS (default 422)', () => {
    const err = new AppError('ALREADY_CONVERTED', 'zaten dönüştürüldü')
    expect(err.httpStatus).toBe(409)
  })

  it('PERIOD_LOCKED is 409 not 422', () => {
    const err = new AppError('PERIOD_LOCKED', 'dönem kilitli')
    expect(err.httpStatus).toBe(409)
    expect(err.type).toBe('BUSINESS')
  })

  it('INSUFFICIENT_STOCK is 409 not 422', () => {
    const err = new AppError('INSUFFICIENT_STOCK', 'yetersiz stok')
    expect(err.httpStatus).toBe(409)
  })

  it('NEGATIVE_STOCK is 409 not 422', () => {
    const err = new AppError('NEGATIVE_STOCK', 'negatif stok')
    expect(err.httpStatus).toBe(409)
  })
})
