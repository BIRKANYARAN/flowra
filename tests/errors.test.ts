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
})
