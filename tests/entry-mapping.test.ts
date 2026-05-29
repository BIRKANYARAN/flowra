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

  it('total count is exactly 15', () => {
    expect(ENTRY_MAPPINGS).toHaveLength(15)
  })

  it('all entry_type values are unique', () => {
    const types = ENTRY_MAPPINGS.map(m => m.entry_type)
    const unique = new Set(types)
    expect(unique.size).toBe(types.length)
  })

  it('all mappings have a non-empty description', () => {
    for (const mapping of ENTRY_MAPPINGS) {
      expect(
        mapping.description.length,
        `${mapping.entry_type} must have a description`,
      ).toBeGreaterThan(0)
    }
  })

  it('all source_type values are valid enum members', () => {
    const VALID_SOURCE_TYPES = new Set(['sale', 'expense', 'purchase', 'partner_tx', 'period_close'])
    for (const mapping of ENTRY_MAPPINGS) {
      expect(
        VALID_SOURCE_TYPES.has(mapping.source_type),
        `${mapping.entry_type} has invalid source_type: ${mapping.source_type}`,
      ).toBe(true)
    }
  })

  it('all account codes are numeric strings', () => {
    for (const mapping of ENTRY_MAPPINGS) {
      for (const code of [...mapping.debit_accounts, ...mapping.credit_accounts]) {
        expect(
          /^\d+$/.test(code),
          `${mapping.entry_type} has non-numeric account code: ${code}`,
        ).toBe(true)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// getMappingForSourceType — per-entry coverage
// ─────────────────────────────────────────────────────────────────────────────

describe('getMappingForSourceType — sale entries', () => {
  it('SALE_PAYMENT has debit 102 and credit 120', () => {
    const m = getMappingForSourceType('SALE_PAYMENT')
    expect(m).toBeDefined()
    expect(m!.debit_accounts).toContain('102')
    expect(m!.credit_accounts).toContain('120')
  })

  it('INTEREST_INCOME has debit 102 and credit 642', () => {
    const m = getMappingForSourceType('INTEREST_INCOME')
    expect(m).toBeDefined()
    expect(m!.debit_accounts).toContain('102')
    expect(m!.credit_accounts).toContain('642')
  })
})

describe('getMappingForSourceType — expense entries', () => {
  it('EXPENSE_ACCRUAL has source_type expense', () => {
    const m = getMappingForSourceType('EXPENSE_ACCRUAL')
    expect(m).toBeDefined()
    expect(m!.source_type).toBe('expense')
    expect(m!.debit_accounts).toContain('770')
    expect(m!.credit_accounts).toContain('320')
  })

  it('EXPENSE_PAYMENT has debit 320 and credit 102', () => {
    const m = getMappingForSourceType('EXPENSE_PAYMENT')
    expect(m).toBeDefined()
    expect(m!.debit_accounts).toContain('320')
    expect(m!.credit_accounts).toContain('102')
  })
})

describe('getMappingForSourceType — purchase entries', () => {
  it('PURCHASE_FINALIZE has source_type purchase', () => {
    const m = getMappingForSourceType('PURCHASE_FINALIZE')
    expect(m).toBeDefined()
    expect(m!.source_type).toBe('purchase')
  })

  it('PURCHASE_FINALIZE has debit 153', () => {
    const m = getMappingForSourceType('PURCHASE_FINALIZE')
    expect(m!.debit_accounts).toContain('153')
  })
})

describe('getMappingForSourceType — partner_tx entries', () => {
  it('PARTNER_LOAN_IN has debit 102 and credit 321', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_IN')
    expect(m).toBeDefined()
    expect(m!.debit_accounts).toContain('102')
    expect(m!.credit_accounts).toContain('321')
  })

  it('PARTNER_LOAN_REPAYMENT is the reverse of PARTNER_LOAN_IN', () => {
    const loanIn = getMappingForSourceType('PARTNER_LOAN_IN')
    const repayment = getMappingForSourceType('PARTNER_LOAN_REPAYMENT')
    // Debit of repayment should be credit of loanIn and vice versa
    expect(repayment!.debit_accounts).toContain('321')
    expect(repayment!.credit_accounts).toContain('102')
  })

  it('PARTNER_EQUITY_IN credits account 500 (Sermaye)', () => {
    const m = getMappingForSourceType('PARTNER_EQUITY_IN')
    expect(m!.credit_accounts).toContain('500')
  })

  it('DIVIDEND_DECLARED has debit 590 (Dönem Net Kârı)', () => {
    const m = getMappingForSourceType('DIVIDEND_DECLARED')
    expect(m).toBeDefined()
    expect(m!.debit_accounts).toContain('590')
  })

  it('DIVIDEND_PAID credits 102 (Bankalar)', () => {
    const m = getMappingForSourceType('DIVIDEND_PAID')
    expect(m!.credit_accounts).toContain('102')
  })

  it('INTEREST_EXPENSE has debit 780 (Finansman Giderleri)', () => {
    const m = getMappingForSourceType('INTEREST_EXPENSE')
    expect(m!.debit_accounts).toContain('780')
  })

  it('COMPENSATION has debit 770', () => {
    const m = getMappingForSourceType('COMPENSATION')
    expect(m!.debit_accounts).toContain('770')
  })
})

describe('getMappingForSourceType — case sensitivity', () => {
  it('lowercase "sale_accrual" returns undefined (exact match required)', () => {
    expect(getMappingForSourceType('sale_accrual')).toBeUndefined()
  })

  it('mixed case "Sale_Accrual" returns undefined', () => {
    expect(getMappingForSourceType('Sale_Accrual')).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Structural invariants — account code relationships between mappings
// ─────────────────────────────────────────────────────────────────────────────

describe('ENTRY_MAPPINGS — structural invariants', () => {
  it('sale-sourced entries include SALE_ACCRUAL and SALE_PAYMENT', () => {
    const salesEntries = ENTRY_MAPPINGS.filter(m => m.source_type === 'sale')
    const types = salesEntries.map(m => m.entry_type)
    expect(types).toContain('SALE_ACCRUAL')
    expect(types).toContain('SALE_PAYMENT')
  })

  it('expense-sourced entries include EXPENSE_ACCRUAL and EXPENSE_PAYMENT', () => {
    const expenseEntries = ENTRY_MAPPINGS.filter(m => m.source_type === 'expense')
    const types = expenseEntries.map(m => m.entry_type)
    expect(types).toContain('EXPENSE_ACCRUAL')
    expect(types).toContain('EXPENSE_PAYMENT')
  })

  it('purchase-sourced entries include PURCHASE_FINALIZE and COGS', () => {
    const purchaseEntries = ENTRY_MAPPINGS.filter(m => m.source_type === 'purchase')
    const types = purchaseEntries.map(m => m.entry_type)
    expect(types).toContain('PURCHASE_FINALIZE')
    expect(types).toContain('COGS')
  })

  it('period_close-sourced entries include PERIOD_CLOSE_PROFIT', () => {
    const periodEntries = ENTRY_MAPPINGS.filter(m => m.source_type === 'period_close')
    expect(periodEntries.length).toBeGreaterThanOrEqual(1)
    expect(periodEntries.map(m => m.entry_type)).toContain('PERIOD_CLOSE_PROFIT')
  })

  it('partner_tx entries include all loan and equity types', () => {
    const partnerEntries = ENTRY_MAPPINGS.filter(m => m.source_type === 'partner_tx')
    const types = partnerEntries.map(m => m.entry_type)
    expect(types).toContain('PARTNER_LOAN_IN')
    expect(types).toContain('PARTNER_LOAN_REPAYMENT')
    expect(types).toContain('PARTNER_EQUITY_IN')
    expect(types).toContain('COMPENSATION')
    expect(types).toContain('DIVIDEND_DECLARED')
    expect(types).toContain('DIVIDEND_PAID')
  })

  it('SALE_ACCRUAL and COGS both affect GL accounts for a complete sale cycle', () => {
    // A complete sale should: record receivable (SALE_ACCRUAL) then COGS for inventory out
    const accrual = getMappingForSourceType('SALE_ACCRUAL')
    const cogs    = getMappingForSourceType('COGS')
    expect(accrual!.debit_accounts).toContain('120')  // receivable created
    expect(cogs!.debit_accounts).toContain('620')     // cost recognized
    expect(cogs!.credit_accounts).toContain('153')    // inventory reduced
  })

  it('no account code appears more than once within a single mapping debit list', () => {
    for (const mapping of ENTRY_MAPPINGS) {
      const unique = new Set(mapping.debit_accounts)
      expect(
        unique.size,
        `${mapping.entry_type} has duplicate debit account codes`,
      ).toBe(mapping.debit_accounts.length)
    }
  })

  it('no account code appears more than once within a single mapping credit list', () => {
    for (const mapping of ENTRY_MAPPINGS) {
      const unique = new Set(mapping.credit_accounts)
      expect(
        unique.size,
        `${mapping.entry_type} has duplicate credit account codes`,
      ).toBe(mapping.credit_accounts.length)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Per-entry-type debit/credit account code verification
// Validates each of the 15 entry types against MSUGT Turkish chart of accounts
// ─────────────────────────────────────────────────────────────────────────────

describe('ENTRY_MAPPINGS — SALE_ACCRUAL account codes', () => {
  it('SALE_ACCRUAL source_type is sale', () => {
    const m = getMappingForSourceType('SALE_ACCRUAL')!
    expect(m.source_type).toBe('sale')
  })

  it('SALE_ACCRUAL debit 120 (Alıcılar — trade receivable)', () => {
    const m = getMappingForSourceType('SALE_ACCRUAL')!
    expect(m.debit_accounts).toContain('120')
  })

  it('SALE_ACCRUAL credit 600 (Yurt İçi Satışlar) and 391 (Hesaplanan KDV)', () => {
    const m = getMappingForSourceType('SALE_ACCRUAL')!
    expect(m.credit_accounts).toContain('600')
    expect(m.credit_accounts).toContain('391')
  })

  it('SALE_ACCRUAL has a non-empty description', () => {
    const m = getMappingForSourceType('SALE_ACCRUAL')!
    expect(m.description.length).toBeGreaterThan(0)
  })
})

describe('ENTRY_MAPPINGS — SALE_PAYMENT account codes', () => {
  it('SALE_PAYMENT source_type is sale', () => {
    const m = getMappingForSourceType('SALE_PAYMENT')!
    expect(m.source_type).toBe('sale')
  })

  it('SALE_PAYMENT debit 102 (Bankalar — cash in)', () => {
    const m = getMappingForSourceType('SALE_PAYMENT')!
    expect(m.debit_accounts).toContain('102')
  })

  it('SALE_PAYMENT credit 120 (Alıcılar — closes receivable)', () => {
    const m = getMappingForSourceType('SALE_PAYMENT')!
    expect(m.credit_accounts).toContain('120')
  })

  it('SALE_PAYMENT has conditions field describing partial scenario', () => {
    const m = getMappingForSourceType('SALE_PAYMENT')!
    expect(m.conditions).toBeDefined()
    expect(m.conditions!.length).toBeGreaterThan(0)
  })
})

describe('ENTRY_MAPPINGS — EXPENSE_ACCRUAL account codes', () => {
  it('EXPENSE_ACCRUAL source_type is expense', () => {
    const m = getMappingForSourceType('EXPENSE_ACCRUAL')!
    expect(m.source_type).toBe('expense')
  })

  it('EXPENSE_ACCRUAL debit 770 (gider) and 191 (İndirilecek KDV)', () => {
    const m = getMappingForSourceType('EXPENSE_ACCRUAL')!
    expect(m.debit_accounts).toContain('770')
    expect(m.debit_accounts).toContain('191')
  })

  it('EXPENSE_ACCRUAL credit 320 (Satıcılar) and 102 (Bankalar)', () => {
    const m = getMappingForSourceType('EXPENSE_ACCRUAL')!
    expect(m.credit_accounts).toContain('320')
    expect(m.credit_accounts).toContain('102')
  })
})

describe('ENTRY_MAPPINGS — EXPENSE_PAYMENT account codes', () => {
  it('EXPENSE_PAYMENT source_type is expense', () => {
    const m = getMappingForSourceType('EXPENSE_PAYMENT')!
    expect(m.source_type).toBe('expense')
  })

  it('EXPENSE_PAYMENT debit 320 (Satıcılar — clears liability)', () => {
    const m = getMappingForSourceType('EXPENSE_PAYMENT')!
    expect(m.debit_accounts).toContain('320')
  })

  it('EXPENSE_PAYMENT credit 102 (Bankalar — cash out)', () => {
    const m = getMappingForSourceType('EXPENSE_PAYMENT')!
    expect(m.credit_accounts).toContain('102')
  })
})

describe('ENTRY_MAPPINGS — PURCHASE_FINALIZE account codes', () => {
  it('PURCHASE_FINALIZE source_type is purchase', () => {
    const m = getMappingForSourceType('PURCHASE_FINALIZE')!
    expect(m.source_type).toBe('purchase')
  })

  it('PURCHASE_FINALIZE debit 153 (Ticari Mallar — inventory)', () => {
    const m = getMappingForSourceType('PURCHASE_FINALIZE')!
    expect(m.debit_accounts).toContain('153')
  })

  it('PURCHASE_FINALIZE credit 102 (Bankalar) and 320 (Satıcılar)', () => {
    const m = getMappingForSourceType('PURCHASE_FINALIZE')!
    expect(m.credit_accounts).toContain('102')
    expect(m.credit_accounts).toContain('320')
  })
})

describe('ENTRY_MAPPINGS — COGS account codes', () => {
  it('COGS source_type is purchase', () => {
    const m = getMappingForSourceType('COGS')!
    expect(m.source_type).toBe('purchase')
  })

  it('COGS debit 620 (Satılan Malın Maliyeti)', () => {
    const m = getMappingForSourceType('COGS')!
    expect(m.debit_accounts).toContain('620')
  })

  it('COGS credit 153 (Ticari Mallar — stock decreases)', () => {
    const m = getMappingForSourceType('COGS')!
    expect(m.credit_accounts).toContain('153')
  })
})

describe('ENTRY_MAPPINGS — PARTNER_LOAN_IN account codes', () => {
  it('PARTNER_LOAN_IN source_type is partner_tx', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_IN')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('PARTNER_LOAN_IN debit 102 (cash enters bank)', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_IN')!
    expect(m.debit_accounts).toContain('102')
  })

  it('PARTNER_LOAN_IN credit 321 (Ortaklara Borçlar KV — short-term liability)', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_IN')!
    expect(m.credit_accounts).toContain('321')
  })
})

describe('ENTRY_MAPPINGS — PARTNER_LOAN_REPAYMENT account codes', () => {
  it('PARTNER_LOAN_REPAYMENT source_type is partner_tx', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_REPAYMENT')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('PARTNER_LOAN_REPAYMENT debit 321 (clears short-term partner liability)', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_REPAYMENT')!
    expect(m.debit_accounts).toContain('321')
  })

  it('PARTNER_LOAN_REPAYMENT credit 102 (Bankalar — cash leaves)', () => {
    const m = getMappingForSourceType('PARTNER_LOAN_REPAYMENT')!
    expect(m.credit_accounts).toContain('102')
  })

  it('PARTNER_LOAN_REPAYMENT is mirror image of PARTNER_LOAN_IN', () => {
    const loanIn  = getMappingForSourceType('PARTNER_LOAN_IN')!
    const loanOut = getMappingForSourceType('PARTNER_LOAN_REPAYMENT')!
    // debit/credit sides are swapped
    expect(loanOut.debit_accounts).toEqual(loanIn.credit_accounts)
    expect(loanOut.credit_accounts).toEqual(loanIn.debit_accounts)
  })
})

describe('ENTRY_MAPPINGS — PARTNER_EQUITY_IN account codes', () => {
  it('PARTNER_EQUITY_IN source_type is partner_tx', () => {
    const m = getMappingForSourceType('PARTNER_EQUITY_IN')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('PARTNER_EQUITY_IN debit 102 (Bankalar)', () => {
    const m = getMappingForSourceType('PARTNER_EQUITY_IN')!
    expect(m.debit_accounts).toContain('102')
  })

  it('PARTNER_EQUITY_IN credit 500 (Sermaye — equity capital)', () => {
    const m = getMappingForSourceType('PARTNER_EQUITY_IN')!
    expect(m.credit_accounts).toContain('500')
  })
})

describe('ENTRY_MAPPINGS — COMPENSATION account codes', () => {
  it('COMPENSATION source_type is partner_tx', () => {
    const m = getMappingForSourceType('COMPENSATION')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('COMPENSATION debit 770 (Genel Yönetim Giderleri — expense)', () => {
    const m = getMappingForSourceType('COMPENSATION')!
    expect(m.debit_accounts).toContain('770')
  })

  it('COMPENSATION credit 102 (Bankalar) and 335 (Personele Borçlar)', () => {
    const m = getMappingForSourceType('COMPENSATION')!
    expect(m.credit_accounts).toContain('102')
    expect(m.credit_accounts).toContain('335')
  })
})

describe('ENTRY_MAPPINGS — DIVIDEND_DECLARED account codes', () => {
  it('DIVIDEND_DECLARED source_type is partner_tx', () => {
    const m = getMappingForSourceType('DIVIDEND_DECLARED')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('DIVIDEND_DECLARED debit 590 (Dönem Net Kârı — reduces current profit)', () => {
    const m = getMappingForSourceType('DIVIDEND_DECLARED')!
    expect(m.debit_accounts).toContain('590')
  })

  it('DIVIDEND_DECLARED credit 360 (Ödenecek Vergi — withholding tax) and 335 (net dividend)', () => {
    const m = getMappingForSourceType('DIVIDEND_DECLARED')!
    expect(m.credit_accounts).toContain('360')
    expect(m.credit_accounts).toContain('335')
  })
})

describe('ENTRY_MAPPINGS — DIVIDEND_PAID account codes', () => {
  it('DIVIDEND_PAID source_type is partner_tx', () => {
    const m = getMappingForSourceType('DIVIDEND_PAID')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('DIVIDEND_PAID debit 335 (Personele Borçlar — clears net dividend liability)', () => {
    const m = getMappingForSourceType('DIVIDEND_PAID')!
    expect(m.debit_accounts).toContain('335')
  })

  it('DIVIDEND_PAID credit 102 (Bankalar — cash out)', () => {
    const m = getMappingForSourceType('DIVIDEND_PAID')!
    expect(m.credit_accounts).toContain('102')
  })
})

describe('ENTRY_MAPPINGS — PERIOD_CLOSE_PROFIT account codes', () => {
  it('PERIOD_CLOSE_PROFIT source_type is period_close', () => {
    const m = getMappingForSourceType('PERIOD_CLOSE_PROFIT')!
    expect(m.source_type).toBe('period_close')
  })

  it('PERIOD_CLOSE_PROFIT debit 590 (Dönem Net Kârı)', () => {
    const m = getMappingForSourceType('PERIOD_CLOSE_PROFIT')!
    expect(m.debit_accounts).toContain('590')
  })

  it('PERIOD_CLOSE_PROFIT credit 570 (Geçmiş Yıllar Kârları) and 542 (Yasal Yedekler)', () => {
    const m = getMappingForSourceType('PERIOD_CLOSE_PROFIT')!
    expect(m.credit_accounts).toContain('570')
    expect(m.credit_accounts).toContain('542')
  })
})

describe('ENTRY_MAPPINGS — INTEREST_EXPENSE account codes', () => {
  it('INTEREST_EXPENSE source_type is partner_tx', () => {
    const m = getMappingForSourceType('INTEREST_EXPENSE')!
    expect(m.source_type).toBe('partner_tx')
  })

  it('INTEREST_EXPENSE debit 780 (Finansman Giderleri)', () => {
    const m = getMappingForSourceType('INTEREST_EXPENSE')!
    expect(m.debit_accounts).toContain('780')
  })

  it('INTEREST_EXPENSE credit 321 (Ortaklara Borçlar KV — accrued interest)', () => {
    const m = getMappingForSourceType('INTEREST_EXPENSE')!
    expect(m.credit_accounts).toContain('321')
  })
})

describe('ENTRY_MAPPINGS — INTEREST_INCOME account codes', () => {
  it('INTEREST_INCOME source_type is sale', () => {
    const m = getMappingForSourceType('INTEREST_INCOME')!
    expect(m.source_type).toBe('sale')
  })

  it('INTEREST_INCOME debit 102 (Bankalar — bank interest received)', () => {
    const m = getMappingForSourceType('INTEREST_INCOME')!
    expect(m.debit_accounts).toContain('102')
  })

  it('INTEREST_INCOME credit 642 (Faiz Gelirleri — interest income account)', () => {
    const m = getMappingForSourceType('INTEREST_INCOME')!
    expect(m.credit_accounts).toContain('642')
  })
})

describe('ENTRY_MAPPINGS — required fields across all 15 entries', () => {
  it('all mappings have entry_type field', () => {
    for (const m of ENTRY_MAPPINGS) {
      expect(typeof m.entry_type).toBe('string')
      expect(m.entry_type.length).toBeGreaterThan(0)
    }
  })

  it('all mappings have source_type field', () => {
    for (const m of ENTRY_MAPPINGS) {
      expect(typeof m.source_type).toBe('string')
      expect(m.source_type.length).toBeGreaterThan(0)
    }
  })

  it('all mappings have description field', () => {
    for (const m of ENTRY_MAPPINGS) {
      expect(typeof m.description).toBe('string')
      expect(m.description.length).toBeGreaterThan(0)
    }
  })

  it('all mappings have debit_accounts as non-empty array', () => {
    for (const m of ENTRY_MAPPINGS) {
      expect(Array.isArray(m.debit_accounts)).toBe(true)
      expect(m.debit_accounts.length).toBeGreaterThan(0)
    }
  })

  it('all mappings have credit_accounts as non-empty array', () => {
    for (const m of ENTRY_MAPPINGS) {
      expect(Array.isArray(m.credit_accounts)).toBe(true)
      expect(m.credit_accounts.length).toBeGreaterThan(0)
    }
  })

  it('ENTRY_MAPPINGS array length is exactly 15', () => {
    expect(ENTRY_MAPPINGS).toHaveLength(15)
  })

  it('getMappingForSourceType returns undefined for empty string', () => {
    expect(getMappingForSourceType('')).toBeUndefined()
  })

  it('getMappingForSourceType returns undefined for whitespace-only string', () => {
    expect(getMappingForSourceType('   ')).toBeUndefined()
  })

  it('getMappingForSourceType returns undefined for numeric string', () => {
    expect(getMappingForSourceType('120')).toBeUndefined()
  })

  it('SALE_ACCRUAL and SALE_PAYMENT together form a complete receivable cycle', () => {
    const accrual = getMappingForSourceType('SALE_ACCRUAL')!
    const payment = getMappingForSourceType('SALE_PAYMENT')!
    // Accrual creates receivable (DR 120), payment closes it (CR 120)
    expect(accrual.debit_accounts).toContain('120')
    expect(payment.credit_accounts).toContain('120')
  })

  it('EXPENSE_ACCRUAL and EXPENSE_PAYMENT together form a complete payable cycle', () => {
    const accrual = getMappingForSourceType('EXPENSE_ACCRUAL')!
    const payment = getMappingForSourceType('EXPENSE_PAYMENT')!
    // Accrual creates payable (CR 320), payment closes it (DR 320)
    expect(accrual.credit_accounts).toContain('320')
    expect(payment.debit_accounts).toContain('320')
  })

  it('DIVIDEND_DECLARED and DIVIDEND_PAID together form a complete dividend cycle', () => {
    const declared = getMappingForSourceType('DIVIDEND_DECLARED')!
    const paid     = getMappingForSourceType('DIVIDEND_PAID')!
    // Declared creates net dividend liability (CR 335), paid closes it (DR 335)
    expect(declared.credit_accounts).toContain('335')
    expect(paid.debit_accounts).toContain('335')
  })
})
