/**
 * Tests for lib/services/ledger/entry-mapping.service.ts
 * Pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/entry-mapping.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  ENTRY_MAPPINGS,
  getMappingForSourceType,
} from '../lib/services/ledger/entry-mapping.service'

describe('getMappingForSourceType', () => {
  it('returns correct mapping for known entry type SALE_ACCRUAL', () => {
    const mapping = getMappingForSourceType('SALE_ACCRUAL')
    expect(mapping).toBeDefined()
    expect(mapping!.entry_type).toBe('SALE_ACCRUAL')
  })

  it('returns undefined for unknown entry type', () => {
    expect(getMappingForSourceType('UNKNOWN_TYPE')).toBeUndefined()
    expect(getMappingForSourceType('')).toBeUndefined()
    expect(getMappingForSourceType('sale')).toBeUndefined()
  })

  it('SALE_ACCRUAL has debit 120 and credits include 600 and 391', () => {
    const mapping = getMappingForSourceType('SALE_ACCRUAL')
    expect(mapping).toBeDefined()
    expect(mapping!.debit_accounts).toContain('120')
    expect(mapping!.credit_accounts).toContain('600')
    expect(mapping!.credit_accounts).toContain('391')
  })

  it('COGS has debit 620 and credit 153', () => {
    const mapping = getMappingForSourceType('COGS')
    expect(mapping).toBeDefined()
    expect(mapping!.debit_accounts).toContain('620')
    expect(mapping!.credit_accounts).toContain('153')
  })

  it('PERIOD_CLOSE_PROFIT mapping exists', () => {
    const mapping = getMappingForSourceType('PERIOD_CLOSE_PROFIT')
    expect(mapping).toBeDefined()
    expect(mapping!.entry_type).toBe('PERIOD_CLOSE_PROFIT')
    expect(mapping!.source_type).toBe('period_close')
  })
})

describe('ENTRY_MAPPINGS integrity', () => {
  it('all mappings have non-empty debit_accounts and credit_accounts', () => {
    for (const mapping of ENTRY_MAPPINGS) {
      expect(
        mapping.debit_accounts.length,
        `${mapping.entry_type} must have at least one debit account`,
      ).toBeGreaterThan(0)
      expect(
        mapping.credit_accounts.length,
        `${mapping.entry_type} must have at least one credit account`,
      ).toBeGreaterThan(0)
    }
  })

  it('all 15 entry types are present', () => {
    const EXPECTED_TYPES = [
      'SALE_ACCRUAL',
      'SALE_PAYMENT',
      'EXPENSE_ACCRUAL',
      'EXPENSE_PAYMENT',
      'PURCHASE_FINALIZE',
      'COGS',
      'PARTNER_LOAN_IN',
      'PARTNER_LOAN_REPAYMENT',
      'PARTNER_EQUITY_IN',
      'COMPENSATION',
      'DIVIDEND_DECLARED',
      'DIVIDEND_PAID',
      'PERIOD_CLOSE_PROFIT',
      'INTEREST_EXPENSE',
      'INTEREST_INCOME',
    ]
    const mappedTypes = ENTRY_MAPPINGS.map(m => m.entry_type)
    for (const type of EXPECTED_TYPES) {
      expect(mappedTypes, `${type} must be in ENTRY_MAPPINGS`).toContain(type)
    }
  })
})
