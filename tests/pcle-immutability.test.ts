/**
 * Tests for lib/services/pcle/pcle.immutability.ts
 * Run with: npx vitest run tests/pcle-immutability.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  validateImmutability,
  validateJournalOperation,
} from '../lib/services/pcle/pcle.immutability'

describe('validateImmutability', () => {
  it('audit_logs delete → not allowed', () => {
    const result = validateImmutability('audit_logs', 'delete')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('audit_logs update → not allowed', () => {
    const result = validateImmutability('audit_logs', 'update')
    expect(result.allowed).toBe(false)
  })

  it('partner_finance_events delete → not allowed', () => {
    const result = validateImmutability('partner_finance_events', 'delete')
    expect(result.allowed).toBe(false)
  })

  it('non-immutable table delete → allowed', () => {
    const result = validateImmutability('products', 'delete')
    expect(result.allowed).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('non-immutable table update → allowed', () => {
    const result = validateImmutability('companies', 'update')
    expect(result.allowed).toBe(true)
  })

  it('journal_entry_lines delete → not allowed', () => {
    const result = validateImmutability('journal_entry_lines', 'delete')
    expect(result.allowed).toBe(false)
  })

  it('balance_sheet_snapshots update → not allowed', () => {
    const result = validateImmutability('balance_sheet_snapshots', 'update')
    expect(result.allowed).toBe(false)
  })
})

describe('validateJournalOperation', () => {
  it('void → allowed', () => {
    const result = validateJournalOperation('void')
    expect(result.allowed).toBe(true)
  })

  it('delete → not allowed', () => {
    const result = validateJournalOperation('delete')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('update_amount → not allowed', () => {
    const result = validateJournalOperation('update_amount')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  it('update_description → allowed', () => {
    const result = validateJournalOperation('update_description')
    expect(result.allowed).toBe(true)
  })
})
