/**
 * Tests for:
 *   lib/normalize.ts    — safeNum, safeStr, safeArray, normalize* functions
 *   lib/validation.ts   — requireString, requirePositiveNumber, clampKdv, etc.
 *   lib/finance/cash.ts — computeCashPosition
 *
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/normalize-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  safeNum,
  safeStr,
  safeArray,
  normalizePnl,
  normalizeAnalytics,
  normalizeSaleRow,
  normalizeSaleDetail,
  normalizeSaleItem,
  normalizeProformaRow,
} from '../lib/normalize'
import {
  ValidationError,
  requireString,
  optionalString,
  requirePositiveNumber,
  requireNonNegativeNumber,
  requireUUID,
  optionalUUID,
  requireArray,
  clampKdv,
  clampDiscount,
  sanitizeCurrency,
  validateProformaLine,
} from '../lib/validation'
import { computeCashPosition } from '../lib/finance/cash'

// ═══════════════════════════════════════════════════════════════════════════
// safeNum
// ═══════════════════════════════════════════════════════════════════════════

describe('safeNum', () => {
  it('returns number for numeric input', () => {
    expect(safeNum(42)).toBe(42)
    expect(safeNum(3.14)).toBe(3.14)
    expect(safeNum(-100)).toBe(-100)
    expect(safeNum(0)).toBe(0)
  })

  it('coerces numeric strings', () => {
    expect(safeNum('123.45')).toBe(123.45)
    expect(safeNum('0')).toBe(0)
    expect(safeNum('-50')).toBe(-50)
  })

  it('returns fallback (0) for null, undefined', () => {
    expect(safeNum(null)).toBe(0)
    expect(safeNum(undefined)).toBe(0)
  })

  it('returns fallback for NaN and Infinity', () => {
    expect(safeNum(NaN)).toBe(0)
    expect(safeNum(Infinity)).toBe(0)
    expect(safeNum(-Infinity)).toBe(0)
  })

  it('returns fallback for non-numeric strings', () => {
    expect(safeNum('abc')).toBe(0)
    expect(safeNum('')).toBe(0)
  })

  it('uses custom fallback when provided', () => {
    expect(safeNum(null, -1)).toBe(-1)
    expect(safeNum('abc', 99)).toBe(99)
  })

  it('handles PostgreSQL numeric-as-string correctly', () => {
    // PostgREST sends numeric(14,4) as string
    expect(safeNum('12345.6789')).toBeCloseTo(12345.6789)
    expect(safeNum('0.0000')).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// safeStr
// ═══════════════════════════════════════════════════════════════════════════

describe('safeStr', () => {
  it('returns string for string input', () => {
    expect(safeStr('hello')).toBe('hello')
    expect(safeStr('  padded  ')).toBe('  padded  ')
  })

  it('coerces finite numbers to string', () => {
    expect(safeStr(42)).toBe('42')
    expect(safeStr(3.14)).toBe('3.14')
  })

  it('returns fallback for empty string', () => {
    expect(safeStr('')).toBe('')  // empty string → returns empty (it's a string!)
  })

  it('returns fallback for null, undefined', () => {
    expect(safeStr(null)).toBe('')
    expect(safeStr(undefined)).toBe('')
  })

  it('returns fallback for non-finite numbers (NaN, Infinity)', () => {
    expect(safeStr(NaN)).toBe('')
    expect(safeStr(Infinity)).toBe('')
  })

  it('uses custom fallback when provided', () => {
    expect(safeStr(null, '—')).toBe('—')
    expect(safeStr(undefined, 'N/A')).toBe('N/A')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// safeArray
// ═══════════════════════════════════════════════════════════════════════════

describe('safeArray', () => {
  it('returns array as-is', () => {
    expect(safeArray([1, 2, 3])).toEqual([1, 2, 3])
    expect(safeArray([])).toEqual([])
  })

  it('returns [] for null (jsonb_agg NULL)', () => {
    expect(safeArray(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(safeArray(undefined)).toEqual([])
  })

  it('returns [] for non-array values', () => {
    expect(safeArray(42)).toEqual([])
    expect(safeArray('string')).toEqual([])
    expect(safeArray({ length: 3 })).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// normalizePnl
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizePnl', () => {
  it('returns zero-filled object for null/undefined input', () => {
    const result = normalizePnl(null)
    expect(result.total_revenue_try).toBe(0)
    expect(result.net_profit).toBe(0)
  })

  it('coerces string numbers (PostgREST numeric)', () => {
    const raw = { total_revenue_try: '50000', net_profit: '12345.50', sale_count: '3' }
    const result = normalizePnl(raw)
    expect(result.total_revenue_try).toBe(50_000)
    expect(result.net_profit).toBeCloseTo(12345.5)
    expect(result.sale_count).toBe(3)
  })

  it('all 8 fields present in result', () => {
    const result = normalizePnl({})
    const keys = ['total_revenue_try', 'total_cost', 'nominal_profit', 'real_profit',
                  'total_expenses_try', 'net_profit', 'sale_count', 'expense_count']
    for (const k of keys) {
      expect(result).toHaveProperty(k)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// normalizeAnalytics
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizeAnalytics', () => {
  it('returns defaults for null input', () => {
    const result = normalizeAnalytics(null)
    expect(result.total_sales).toBe(0)
    expect(result.monthly_sales).toEqual([])
  })

  it('handles jsonb_agg NULL (monthly_sales = null)', () => {
    const raw = { total_sales: 5, monthly_sales: null }
    const result = normalizeAnalytics(raw)
    expect(result.total_sales).toBe(5)
    expect(result.monthly_sales).toEqual([])
  })

  it('normalizes monthly_sales array', () => {
    const raw = {
      total_sales: 2,
      monthly_sales: [
        { month: '2025-01', count: '3', revenue_try: '15000', profit: '5000' },
      ],
    }
    const result = normalizeAnalytics(raw)
    expect(result.monthly_sales).toHaveLength(1)
    expect(result.monthly_sales[0].revenue_try).toBe(15_000)
    expect(result.monthly_sales[0].month).toBe('2025-01')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// normalizeSaleRow
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizeSaleRow', () => {
  const validRaw = {
    id: 'abc123', customer_name: 'ACME', currency: 'USD',
    total: '1000', total_try: '36000', cogs: '500', holding_cost: '50',
    nominal_profit: '500', sale_date: '2025-03-15', created_at: '2025-03-15T10:00:00Z',
    payment_status: 'paid', shipment_status: null,
  }

  it('returns null for null input', () => {
    expect(normalizeSaleRow(null)).toBeNull()
  })

  it('returns null when id is missing', () => {
    expect(normalizeSaleRow({ customer_name: 'ACME' })).toBeNull()
  })

  it('normalizes a valid sale row', () => {
    const result = normalizeSaleRow(validRaw)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('abc123')
    expect(result!.total_try).toBe(36_000)
    expect(result!.currency).toBe('USD')
  })

  it('falls back to created_at when sale_date is missing', () => {
    const rawNoSaleDate = { ...validRaw, sale_date: undefined }
    const result = normalizeSaleRow(rawNoSaleDate)
    expect(result!.sale_date).toBe('2025-03-15')  // from created_at
  })

  it('defaults payment_status to "pending" when missing', () => {
    const rawNoStatus = { ...validRaw, payment_status: undefined }
    const result = normalizeSaleRow(rawNoStatus)
    expect(result!.payment_status).toBe('pending')
  })

  it('normalizes proformas join (object shape)', () => {
    const rawWithProforma = {
      ...validRaw,
      proforma_id: 'prf-001',
      proformas: { proforma_no: 'PRF-2025-001', deleted_at: null },
    }
    const result = normalizeSaleRow(rawWithProforma)
    expect(result!.proforma_no).toBe('PRF-2025-001')
    expect(result!.proforma_deleted).toBe(false)
  })

  it('marks proforma_deleted when proformas.deleted_at is set', () => {
    const rawDeleted = {
      ...validRaw,
      proforma_id: 'prf-001',
      proformas: { proforma_no: 'PRF-2025-001', deleted_at: '2025-02-01T00:00:00Z' },
    }
    const result = normalizeSaleRow(rawDeleted)
    expect(result!.proforma_deleted).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// normalizeSaleItem
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizeSaleItem', () => {
  it('returns null for null input', () => {
    expect(normalizeSaleItem(null)).toBeNull()
  })

  it('defaults quantity to 1 when missing or 0', () => {
    const result = normalizeSaleItem({ id: 'i1', quantity: 0 })
    expect(result!.quantity).toBe(1)
  })

  it('defaults unit to "adet"', () => {
    const result = normalizeSaleItem({ id: 'i1', quantity: 2 })
    expect(result!.unit).toBe('adet')
  })

  it('uses name_tr fallback for product_name', () => {
    const result = normalizeSaleItem({ id: 'i1', quantity: 1, name: 'Widget A' })
    expect(result!.product_name).toBe('Widget A')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// normalizeProformaRow
// ═══════════════════════════════════════════════════════════════════════════

describe('normalizeProformaRow', () => {
  it('returns null for null input', () => {
    expect(normalizeProformaRow(null)).toBeNull()
  })

  it('returns null when id is missing', () => {
    expect(normalizeProformaRow({ proforma_no: 'PRF-001' })).toBeNull()
  })

  it('uses grand_total if total is absent', () => {
    const result = normalizeProformaRow({ id: 'p1', grand_total: '5000', currency: 'TRY' })
    expect(result!.total).toBe(5_000)
  })

  it('generates proforma_no from id when missing', () => {
    const result = normalizeProformaRow({ id: 'abcdef12-3456-7890-abcd-ef1234567890' })
    expect(result!.proforma_no).toMatch(/PRF-/)
  })

  it('defaults currency to TRY', () => {
    const result = normalizeProformaRow({ id: 'p1' })
    expect(result!.currency).toBe('TRY')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ValidationError
// ═══════════════════════════════════════════════════════════════════════════

describe('ValidationError', () => {
  it('is instanceof Error', () => {
    const err = new ValidationError('field', 'message')
    expect(err instanceof Error).toBe(true)
  })

  it('has name "ValidationError"', () => {
    expect(new ValidationError('f', 'm').name).toBe('ValidationError')
  })

  it('exposes field property', () => {
    const err = new ValidationError('email', 'invalid')
    expect(err.field).toBe('email')
    expect(err.message).toBe('invalid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// requireString
// ═══════════════════════════════════════════════════════════════════════════

describe('requireString', () => {
  it('returns trimmed string for valid input', () => {
    expect(requireString('  hello  ', 'name')).toBe('hello')
  })

  it('throws for empty string', () => {
    expect(() => requireString('', 'name')).toThrow(ValidationError)
    expect(() => requireString('   ', 'name')).toThrow(ValidationError)
  })

  it('throws for null/undefined', () => {
    expect(() => requireString(null, 'name')).toThrow(ValidationError)
    expect(() => requireString(undefined, 'name')).toThrow(ValidationError)
  })

  it('throws when exceeds maxLen', () => {
    expect(() => requireString('abc', 'f', 2)).toThrow(ValidationError)
  })

  it('accepts string exactly at maxLen', () => {
    expect(() => requireString('ab', 'f', 2)).not.toThrow()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// optionalString
// ═══════════════════════════════════════════════════════════════════════════

describe('optionalString', () => {
  it('returns null for null, undefined, empty string', () => {
    expect(optionalString(null, 'f')).toBeNull()
    expect(optionalString(undefined, 'f')).toBeNull()
    expect(optionalString('', 'f')).toBeNull()
  })

  it('returns trimmed string for non-empty input', () => {
    expect(optionalString('  hello  ', 'f')).toBe('hello')
  })

  it('returns null for whitespace-only string', () => {
    expect(optionalString('   ', 'f')).toBeNull()
  })

  it('throws for non-string non-null value', () => {
    expect(() => optionalString(42, 'f')).toThrow(ValidationError)
  })

  it('throws when exceeds maxLen', () => {
    expect(() => optionalString('abcde', 'f', 3)).toThrow(ValidationError)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// requirePositiveNumber / requireNonNegativeNumber
// ═══════════════════════════════════════════════════════════════════════════

describe('requirePositiveNumber', () => {
  it('returns number for positive input', () => {
    expect(requirePositiveNumber(42, 'price')).toBe(42)
    expect(requirePositiveNumber('3.14', 'price')).toBeCloseTo(3.14)
  })

  it('throws for zero', () => {
    expect(() => requirePositiveNumber(0, 'price')).toThrow(ValidationError)
  })

  it('throws for negative', () => {
    expect(() => requirePositiveNumber(-1, 'price')).toThrow(ValidationError)
  })

  it('throws for NaN / non-numeric strings', () => {
    expect(() => requirePositiveNumber('abc', 'price')).toThrow(ValidationError)
    expect(() => requirePositiveNumber(NaN, 'price')).toThrow(ValidationError)
  })
})

describe('requireNonNegativeNumber', () => {
  it('returns 0 for zero', () => {
    expect(requireNonNegativeNumber(0, 'discount')).toBe(0)
  })

  it('returns number for positive input', () => {
    expect(requireNonNegativeNumber(100, 'discount')).toBe(100)
  })

  it('throws for negative', () => {
    expect(() => requireNonNegativeNumber(-0.01, 'discount')).toThrow(ValidationError)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// requireUUID / optionalUUID
// ═══════════════════════════════════════════════════════════════════════════

describe('requireUUID', () => {
  const VALID = '550e8400-e29b-41d4-a716-446655440000'

  it('returns valid UUID unchanged', () => {
    expect(requireUUID(VALID, 'id')).toBe(VALID)
  })

  it('throws for malformed UUID', () => {
    expect(() => requireUUID('not-a-uuid', 'id')).toThrow(ValidationError)
    expect(() => requireUUID('', 'id')).toThrow(ValidationError)
    expect(() => requireUUID(null, 'id')).toThrow(ValidationError)
  })
})

describe('optionalUUID', () => {
  const VALID = '550e8400-e29b-41d4-a716-446655440000'

  it('returns null for null, undefined, empty string', () => {
    expect(optionalUUID(null, 'id')).toBeNull()
    expect(optionalUUID(undefined, 'id')).toBeNull()
    expect(optionalUUID('', 'id')).toBeNull()
  })

  it('returns valid UUID unchanged', () => {
    expect(optionalUUID(VALID, 'id')).toBe(VALID)
  })

  it('throws for non-empty malformed UUID', () => {
    expect(() => optionalUUID('bad-uuid', 'id')).toThrow(ValidationError)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// requireArray
// ═══════════════════════════════════════════════════════════════════════════

describe('requireArray', () => {
  it('returns array for valid input', () => {
    expect(requireArray([1, 2, 3], 'items')).toEqual([1, 2, 3])
    expect(requireArray([], 'items')).toEqual([])
  })

  it('throws for non-array values', () => {
    expect(() => requireArray(null, 'items')).toThrow(ValidationError)
    expect(() => requireArray('string', 'items')).toThrow(ValidationError)
    expect(() => requireArray(42, 'items')).toThrow(ValidationError)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// clampKdv / clampDiscount
// ═══════════════════════════════════════════════════════════════════════════

describe('clampKdv', () => {
  it('clamps to [0, 100]', () => {
    expect(clampKdv(-10)).toBe(0)
    expect(clampKdv(0)).toBe(0)
    expect(clampKdv(20)).toBe(20)
    expect(clampKdv(100)).toBe(100)
    expect(clampKdv(150)).toBe(100)
  })

  it('returns 0 for non-finite values', () => {
    expect(clampKdv(NaN)).toBe(0)
    expect(clampKdv('abc')).toBe(0)
    expect(clampKdv(null)).toBe(0)
  })

  it('handles common Turkish KDV rates', () => {
    expect(clampKdv(0)).toBe(0)
    expect(clampKdv(10)).toBe(10)
    expect(clampKdv(20)).toBe(20)
  })
})

describe('clampDiscount', () => {
  it('clamps to [0, 100]', () => {
    expect(clampDiscount(-5)).toBe(0)
    expect(clampDiscount(0)).toBe(0)
    expect(clampDiscount(50)).toBe(50)
    expect(clampDiscount(100)).toBe(100)
    expect(clampDiscount(200)).toBe(100)
  })

  it('returns 0 for non-finite values', () => {
    expect(clampDiscount(NaN)).toBe(0)
    expect(clampDiscount(null)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// sanitizeCurrency
// ═══════════════════════════════════════════════════════════════════════════

describe('sanitizeCurrency', () => {
  it('returns valid currency uppercased', () => {
    expect(sanitizeCurrency('usd')).toBe('USD')
    expect(sanitizeCurrency('TRY')).toBe('TRY')
    expect(sanitizeCurrency('eur')).toBe('EUR')
    expect(sanitizeCurrency('GBP')).toBe('GBP')
    expect(sanitizeCurrency('chf')).toBe('CHF')
  })

  it('returns TRY for invalid currency', () => {
    expect(sanitizeCurrency('JPY')).toBe('TRY')
    expect(sanitizeCurrency('')).toBe('TRY')
    expect(sanitizeCurrency(null)).toBe('TRY')
    expect(sanitizeCurrency(undefined)).toBe('TRY')
    expect(sanitizeCurrency('INVALID')).toBe('TRY')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// validateProformaLine
// ═══════════════════════════════════════════════════════════════════════════

describe('validateProformaLine', () => {
  const validLine = {
    name: 'Widget A',
    price: 100,
    quantity: 5,
    unit_cost: 40,
    kdv: 20,
    discount_percent: 10,
    currency: 'USD',
    unit: 'adet',
    sort_order: 0,
  }

  it('returns validated line for valid input', () => {
    const result = validateProformaLine(validLine, 0)
    expect(result.name).toBe('Widget A')
    expect(result.price).toBe(100)
    expect(result.quantity).toBe(5)
    expect(result.currency).toBe('USD')
  })

  it('throws for null input', () => {
    expect(() => validateProformaLine(null, 0)).toThrow(ValidationError)
  })

  it('throws for missing required name', () => {
    expect(() => validateProformaLine({ ...validLine, name: '' }, 0)).toThrow(ValidationError)
  })

  it('throws for price = 0', () => {
    expect(() => validateProformaLine({ ...validLine, price: 0 }, 0)).toThrow(ValidationError)
  })

  it('throws for negative price', () => {
    expect(() => validateProformaLine({ ...validLine, price: -1 }, 0)).toThrow(ValidationError)
  })

  it('clamps KDV to [0, 100]', () => {
    const result = validateProformaLine({ ...validLine, kdv: 150 }, 0)
    expect(result.kdv).toBe(100)
  })

  it('clamps discount_percent to [0, 100]', () => {
    const result = validateProformaLine({ ...validLine, discount_percent: -10 }, 0)
    expect(result.discount_percent).toBe(0)
  })

  it('sanitizes invalid currency to TRY', () => {
    const result = validateProformaLine({ ...validLine, currency: 'JPY' }, 0)
    expect(result.currency).toBe('TRY')
  })

  it('defaults unit to "adet" when missing', () => {
    const result = validateProformaLine({ ...validLine, unit: undefined }, 0)
    expect(result.unit).toBe('adet')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// computeCashPosition (lib/finance/cash.ts)
// ═══════════════════════════════════════════════════════════════════════════

describe('computeCashPosition', () => {
  it('computes cash balance = received - paid', () => {
    const result = computeCashPosition({
      paymentsReceived: 100_000,
      paidExpenses:     40_000,
      unpaidExpenses:   15_000,
    })
    expect(result.cashBalance).toBe(60_000)
  })

  it('outstandingObligations = unpaidExpenses', () => {
    const result = computeCashPosition({
      paymentsReceived: 100_000,
      paidExpenses:     40_000,
      unpaidExpenses:   15_000,
    })
    expect(result.outstandingObligations).toBe(15_000)
  })

  it('cashDistributable = cashBalance - outstandingObligations (when positive)', () => {
    const result = computeCashPosition({
      paymentsReceived: 100_000,
      paidExpenses:     40_000,
      unpaidExpenses:   15_000,
    })
    expect(result.cashDistributable).toBe(45_000)
  })

  it('cashDistributable is 0 when cashBalance < unpaidExpenses', () => {
    const result = computeCashPosition({
      paymentsReceived: 30_000,
      paidExpenses:     20_000,
      unpaidExpenses:   50_000,
    })
    expect(result.cashBalance).toBe(10_000)
    expect(result.cashDistributable).toBe(0)  // max(0, 10000 - 50000) = 0
  })

  it('handles zero inputs', () => {
    const result = computeCashPosition({
      paymentsReceived: 0,
      paidExpenses:     0,
      unpaidExpenses:   0,
    })
    expect(result.cashBalance).toBe(0)
    expect(result.outstandingObligations).toBe(0)
    expect(result.cashDistributable).toBe(0)
  })

  it('handles negative cashBalance (overdraft) — distributable stays 0', () => {
    const result = computeCashPosition({
      paymentsReceived: 10_000,
      paidExpenses:     50_000,   // spent more than received
      unpaidExpenses:   5_000,
    })
    expect(result.cashBalance).toBe(-40_000)
    expect(result.cashDistributable).toBe(0)
  })

  it('handles fractional amounts with round2 precision', () => {
    const result = computeCashPosition({
      paymentsReceived: 33_333.33,
      paidExpenses:     11_111.11,
      unpaidExpenses:   5_555.55,
    })
    expect(result.cashBalance).toBeCloseTo(22_222.22, 2)
    expect(result.cashDistributable).toBeCloseTo(16_666.67, 2)
  })
})
