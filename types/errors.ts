// ── Flowra structured error system ───────────────────────────────────────────
//
// Three orthogonal dimensions:
//
//   ErrorType  — WHO caused it?
//     BUSINESS   = caller violated a business rule (4xx)
//     SYSTEM     = infrastructure/DB failure (5xx)
//     SECURITY   = auth/permission violation (401/403)
//
//   code       — WHAT happened? (machine-readable, snake_case)
//   message    — WHY? (human-readable, Turkish for user-facing)
//   details    — EXTRA context (for logs, never shown to end-users)
//
// Usage:
//   throw new AppError('BUSINESS', 'PROFORMA_NOT_FOUND', 'Proforma bulunamadı', { id })
//   throw new AppError('SYSTEM',   'DB_INSERT_FAILED',   'Kayıt hatası',         { error })
//   throw new AppError('SECURITY', 'UNAUTHORIZED',       'Yetki yok')

export type ErrorType = 'BUSINESS' | 'SYSTEM' | 'SECURITY'

// ── HTTP status codes mapped from ErrorType ────────────────────────────────────
export const ERROR_TYPE_STATUS: Record<ErrorType, number> = {
  BUSINESS:  422,   // override per-code when needed (404, 409, etc.)
  SYSTEM:    500,
  SECURITY:  401,
}

// ── Well-known error codes ────────────────────────────────────────────────────
// Exhaustive list: add new codes here, never inline string literals in services.

export const ERROR_CODES = {
  // Business — Proforma
  PROFORMA_NOT_FOUND:       { type: 'BUSINESS' as ErrorType, httpStatus: 404 },
  PROFORMA_NOT_DRAFT:       { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  PROFORMA_ALREADY_DELETED: { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  PROFORMA_INVALID_STATUS:  { type: 'BUSINESS' as ErrorType, httpStatus: 409 },

  // Business — Sale / Conversion
  ALREADY_CONVERTED:        { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  NO_ITEMS:                 { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  INVALID_QUANTITY:         { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  INVALID_PRICE:            { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Stock
  INSUFFICIENT_STOCK:       { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  NEGATIVE_STOCK:           { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  ZERO_COST_LOT:            { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  PRODUCT_NOT_FOUND:        { type: 'BUSINESS' as ErrorType, httpStatus: 404 },

  // Business — FX
  FX_RATE_NOT_FOUND:        { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Idempotency
  IDEMPOTENCY_PENDING:      { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  IDEMPOTENCY_MISMATCH:     { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  IDEMPOTENCY_KEY_MISSING:  { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Validation
  VALIDATION_ERROR:         { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  MISSING_REQUIRED_FIELD:   { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  INVALID_INPUT:            { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Expenses
  EXPENSE_NOT_FOUND:        { type: 'BUSINESS' as ErrorType, httpStatus: 404 },
  INVALID_AMOUNT:           { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Purchases (Phase 3 cost engine)
  PURCHASE_NOT_FOUND:       { type: 'BUSINESS' as ErrorType, httpStatus: 404 },
  PURCHASE_NOT_DRAFT:       { type: 'BUSINESS' as ErrorType, httpStatus: 409 },
  PURCHASE_NO_LINES:        { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  PURCHASE_ALLOC_FAILED:    { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // Business — Partners (Phase 6)
  PARTNER_NOT_FOUND:            { type: 'BUSINESS' as ErrorType, httpStatus: 404 },
  PARTNER_SHARE_RATIO_INVALID:  { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  PARTNER_TX_NOT_FOUND:         { type: 'BUSINESS' as ErrorType, httpStatus: 404 },
  PARTNER_SHARE_RATIO_SUM:      { type: 'BUSINESS' as ErrorType, httpStatus: 422 },

  // System — Company resolution
  COMPANY_NOT_RESOLVED:     { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },

  // Business — Period guard
  PERIOD_LOCKED:            { type: 'BUSINESS' as ErrorType, httpStatus: 409 },

  // Business — Audit (Phase 7)
  AUDIT_FORBIDDEN:          { type: 'SECURITY' as ErrorType, httpStatus: 403 },
  ROLLBACK_NOT_SUPPORTED:   { type: 'BUSINESS' as ErrorType, httpStatus: 422 },
  ROLLBACK_ENTITY_NOT_FOUND:{ type: 'BUSINESS' as ErrorType, httpStatus: 404 },

  // System
  DB_INSERT_FAILED:         { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  DB_UPDATE_FAILED:         { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  DB_READ_FAILED:           { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  DB_QUERY_FAILED:          { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  STORAGE_UPLOAD_FAILED:    { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  RPC_FAILED:               { type: 'SYSTEM' as ErrorType,   httpStatus: 500 },
  FX_UNAVAILABLE:           { type: 'SYSTEM' as ErrorType,   httpStatus: 503 },

  // Security
  UNAUTHORIZED:             { type: 'SECURITY' as ErrorType, httpStatus: 401 },
  FORBIDDEN:                { type: 'SECURITY' as ErrorType, httpStatus: 403 },
  RATE_LIMITED:             { type: 'SECURITY' as ErrorType, httpStatus: 429 },
} as const

export type ErrorCode = keyof typeof ERROR_CODES

// ── AppError class ────────────────────────────────────────────────────────────

export class AppError extends Error {
  readonly type:       ErrorType
  readonly code:       ErrorCode
  readonly httpStatus: number
  readonly details?:   unknown

  constructor(
    code:     ErrorCode,
    message:  string,
    details?: unknown
  ) {
    super(message)
    this.name       = 'AppError'
    this.code       = code
    this.type       = ERROR_CODES[code].type
    this.httpStatus = ERROR_CODES[code].httpStatus
    this.details    = details
    // Maintain stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError)
    }
  }

  /** Serialize to a safe client-facing object (never includes internal details) */
  toClientJSON(): { error: string; code: string; type: ErrorType } {
    return { error: this.message, code: this.code, type: this.type }
  }

  /** Serialize to a full log object (includes details) */
  toLogContext(): Record<string, unknown> {
    return {
      error_type: this.type,
      error_code: this.code,
      error_msg:  this.message,
      details:    this.details,
    }
  }
}

/** Type guard */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

/**
 * Convert any caught value into a client-safe response body and HTTP status.
 * Routes use this to avoid repeating the same error-mapping logic.
 */
export function toErrorResponse(err: unknown): { body: object; status: number } {
  if (isAppError(err)) {
    return { body: err.toClientJSON(), status: err.httpStatus }
  }
  // Unknown/unstructured errors — do NOT leak internals
  return {
    body:   { error: 'Sunucu hatası', code: 'SYSTEM_ERROR', type: 'SYSTEM' },
    status: 500,
  }
}
