import { describe, it, expect } from 'vitest'
import { isMissingSchemaError } from '../lib/db-errors'

describe('isMissingSchemaError — production schema-drift resilience', () => {
  it('detects undefined_table by Postgres code 42P01', () => {
    expect(isMissingSchemaError({ code: '42P01', message: 'relation "partner_compensation_payments" does not exist' })).toBe(true)
  })

  it('detects undefined_column by Postgres code 42703', () => {
    expect(isMissingSchemaError({ code: '42703', message: 'column "supplier_name" does not exist' })).toBe(true)
  })

  it('detects PostgREST schema-cache codes', () => {
    expect(isMissingSchemaError({ code: 'PGRST205', message: 'Could not find the table in the schema cache' })).toBe(true)
    expect(isMissingSchemaError({ code: 'PGRST204', message: 'x' })).toBe(true)
  })

  it('detects by message when code is absent (errors re-wrapped as Error lose the code)', () => {
    expect(isMissingSchemaError(new Error('getDuePayments/payments: relation "partner_compensation_payments" does not exist'))).toBe(true)
    expect(isMissingSchemaError(new Error('SupplierAnalyticsService.getReport: column "supplier_name" does not exist'))).toBe(true)
    expect(isMissingSchemaError('could not find the table in schema cache')).toBe(true)
  })

  it('does NOT classify genuine runtime/logic errors as schema gaps', () => {
    expect(isMissingSchemaError(new Error('permission denied for table sales'))).toBe(false)
    expect(isMissingSchemaError(new Error('JWT expired'))).toBe(false)
    expect(isMissingSchemaError(new Error('division by zero'))).toBe(false)
    expect(isMissingSchemaError({ code: '23505', message: 'duplicate key value' })).toBe(false)
  })

  it('handles null/undefined/empty safely', () => {
    expect(isMissingSchemaError(null)).toBe(false)
    expect(isMissingSchemaError(undefined)).toBe(false)
    expect(isMissingSchemaError({})).toBe(false)
  })
})
