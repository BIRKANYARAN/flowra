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
