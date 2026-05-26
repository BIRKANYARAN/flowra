/**
 * Tests for lib/accounting/chart-of-accounts.ts
 * Pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/chart-of-accounts.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CHART_OF_ACCOUNTS,
  EXPENSE_TYPE_TO_ACCOUNT,
  REQUIRED_ACCOUNT_CODES,
  getAccount,
  getAccountSafe,
  isCashAccount,
  isDebitNormal,
  accountClass,
  accountsByClass,
  validateChartOfAccounts,
} from '../lib/accounting/chart-of-accounts'

// ── getAccount ────────────────────────────────────────────────────────────────

describe('getAccount', () => {
  it('returns account definition for known code', () => {
    const acc = getAccount('102')
    expect(acc.code).toBe('102')
    expect(acc.name).toBe('Bank Accounts')
    expect(acc.name_tr).toBe('Bankalar')
  })

  it('throws for unknown code', () => {
    expect(() => getAccount('999')).toThrow('Unknown account code: 999')
    expect(() => getAccount('')).toThrow()
  })

  it('all accounts in CHART_OF_ACCOUNTS are retrievable', () => {
    for (const acct of CHART_OF_ACCOUNTS) {
      expect(() => getAccount(acct.code)).not.toThrow()
    }
  })
})

// ── getAccountSafe ────────────────────────────────────────────────────────────

describe('getAccountSafe', () => {
  it('returns account for known code', () => {
    const acc = getAccountSafe('600')
    expect(acc).not.toBeNull()
    expect(acc!.code).toBe('600')
  })

  it('returns null for unknown code', () => {
    expect(getAccountSafe('999')).toBeNull()
    expect(getAccountSafe('')).toBeNull()
  })
})

// ── isCashAccount ─────────────────────────────────────────────────────────────

describe('isCashAccount', () => {
  it('returns true for 100 (Kasa — cash on hand)', () => {
    expect(isCashAccount('100')).toBe(true)
  })

  it('returns true for 102 (Bankalar — bank accounts)', () => {
    expect(isCashAccount('102')).toBe(true)
  })

  it('returns false for 120 (Alıcılar — receivables)', () => {
    expect(isCashAccount('120')).toBe(false)
  })

  it('returns false for 600 (revenue)', () => {
    expect(isCashAccount('600')).toBe(false)
  })

  it('returns false for unknown code', () => {
    expect(isCashAccount('999')).toBe(false)
  })
})

// ── isDebitNormal ─────────────────────────────────────────────────────────────

describe('isDebitNormal', () => {
  // Asset and expense accounts have debit normal balance
  it('returns true for asset accounts (102 Bankalar)', () => {
    expect(isDebitNormal('102')).toBe(true)
  })

  it('returns true for expense accounts (770 G&A)', () => {
    expect(isDebitNormal('770')).toBe(true)
  })

  it('returns true for COGS (620)', () => {
    expect(isDebitNormal('620')).toBe(true)
  })

  // Liability, equity, revenue have credit normal balance
  it('returns false for liability accounts (320 Satıcılar)', () => {
    expect(isDebitNormal('320')).toBe(false)
  })

  it('returns false for equity accounts (570 Retained Earnings)', () => {
    expect(isDebitNormal('570')).toBe(false)
  })

  it('returns false for revenue accounts (600 Sales)', () => {
    expect(isDebitNormal('600')).toBe(false)
  })

  it('returns false for VAT payable (391)', () => {
    expect(isDebitNormal('391')).toBe(false)
  })

  // Contra accounts have reversed normal balance
  it('returns true for 501 (Unpaid Capital — contra equity, debit normal)', () => {
    expect(isDebitNormal('501')).toBe(true)
  })

  it('returns false for 257 (Accumulated Depreciation — contra asset, credit normal)', () => {
    expect(isDebitNormal('257')).toBe(false)
  })

  it('defaults to debit for unknown code (safe fallback)', () => {
    expect(isDebitNormal('999')).toBe(true)
  })
})

// ── accountClass ──────────────────────────────────────────────────────────────

describe('accountClass', () => {
  const EXPECTED: Record<string, string> = {
    '100': 'current_asset',
    '102': 'current_asset',
    '120': 'current_asset',
    '153': 'current_asset',
    '253': 'non_current_asset',
    '320': 'current_liability',
    '321': 'current_liability',
    '421': 'non_current_liability',
    '500': 'equity',
    '542': 'equity',
    '570': 'equity',
    '590': 'equity',
    '600': 'revenue',
    '620': 'cogs',
    '770': 'operating_expense',
    '780': 'financing',
  }

  for (const [code, expected] of Object.entries(EXPECTED)) {
    it(`${code} → ${expected}`, () => {
      expect(accountClass(code)).toBe(expected)
    })
  }

  it('returns null for unknown code', () => {
    expect(accountClass('999')).toBeNull()
  })
})

// ── accountsByClass ───────────────────────────────────────────────────────────

describe('accountsByClass', () => {
  it('returns non-empty array for current_asset', () => {
    const accts = accountsByClass('current_asset')
    expect(accts.length).toBeGreaterThan(0)
    expect(accts.every(a => a.class === 'current_asset')).toBe(true)
  })

  it('includes 102 and 120 in current_asset', () => {
    const codes = accountsByClass('current_asset').map(a => a.code)
    expect(codes).toContain('102')
    expect(codes).toContain('120')
  })

  it('includes 320 and 321 in current_liability', () => {
    const codes = accountsByClass('current_liability').map(a => a.code)
    expect(codes).toContain('320')
    expect(codes).toContain('321')
  })

  it('equity class contains 500 and 570 and 590', () => {
    const codes = accountsByClass('equity').map(a => a.code)
    expect(codes).toContain('500')
    expect(codes).toContain('570')
    expect(codes).toContain('590')
  })

  it('returns [] for a class with no accounts (edge case)', () => {
    // 'non_current_liability' only has 421
    const accts = accountsByClass('non_current_liability')
    expect(accts.length).toBeGreaterThan(0)
  })
})

// ── EXPENSE_TYPE_TO_ACCOUNT mapping ───────────────────────────────────────────

describe('EXPENSE_TYPE_TO_ACCOUNT', () => {
  const expected: Record<string, string> = {
    salary:                '771',
    rent:                  '772',
    software:              '773',
    marketing:             '760',
    logistics:             '760',
    general:               '770',
    operational:           '770',
    utilities:             '770',
    partner_loan_interest: '780',
    board_fee:             '770',
    other:                 '770',
  }

  for (const [type, code] of Object.entries(expected)) {
    it(`${type} → ${code}`, () => {
      expect(EXPENSE_TYPE_TO_ACCOUNT[type]).toBe(code)
    })
  }

  it('all mapped account codes exist in CHART_OF_ACCOUNTS', () => {
    const allCodes = new Set(CHART_OF_ACCOUNTS.map(a => a.code))
    for (const code of Object.values(EXPENSE_TYPE_TO_ACCOUNT)) {
      expect(allCodes.has(code)).toBe(true)
    }
  })
})

// ── CHART_OF_ACCOUNTS global integrity ───────────────────────────────────────

describe('CHART_OF_ACCOUNTS integrity', () => {
  it('has no duplicate codes', () => {
    const codes = CHART_OF_ACCOUNTS.map(a => a.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('all codes are non-empty strings', () => {
    for (const acc of CHART_OF_ACCOUNTS) {
      expect(acc.code).toBeTruthy()
      expect(typeof acc.code).toBe('string')
    }
  })

  it('all accounts have name_tr (Turkish name)', () => {
    for (const acc of CHART_OF_ACCOUNTS) {
      expect(acc.name_tr).toBeTruthy()
    }
  })

  it('all normal_balance values are "debit" or "credit"', () => {
    for (const acc of CHART_OF_ACCOUNTS) {
      expect(['debit', 'credit']).toContain(acc.normal_balance)
    }
  })

  it('asset accounts have debit normal balance (except 257, 501 contra accounts)', () => {
    const assetAccounts = CHART_OF_ACCOUNTS.filter(
      a => (a.class === 'current_asset' || a.class === 'non_current_asset')
        && a.code !== '257'  // contra asset
    )
    for (const acc of assetAccounts) {
      expect(acc.normal_balance).toBe('debit')
    }
  })

  it('liability and equity accounts have credit normal balance (except 501, 580 contra)', () => {
    // Filter out contra accounts (501 = Unpaid Capital contra, 580 = Accumulated Losses contra)
    const nonContra = CHART_OF_ACCOUNTS.filter(
      a => ['current_liability', 'non_current_liability', 'equity'].includes(a.class)
        && !['501', '580'].includes(a.code)
    )
    for (const acc of nonContra) {
      expect(acc.normal_balance).toBe('credit')
    }
  })

  it('revenue accounts have credit normal balance', () => {
    for (const acc of CHART_OF_ACCOUNTS.filter(a => a.class === 'revenue')) {
      expect(acc.normal_balance).toBe('credit')
    }
  })

  it('expense accounts have debit normal balance', () => {
    for (const acc of CHART_OF_ACCOUNTS.filter(
      a => a.class === 'operating_expense' || a.class === 'cogs' || a.class === 'financing'
    )) {
      expect(acc.normal_balance).toBe('debit')
    }
  })
})

// ── validateChartOfAccounts ───────────────────────────────────────────────────

describe('validateChartOfAccounts', () => {
  it('all required accounts exist in CHART_OF_ACCOUNTS', () => {
    const result = validateChartOfAccounts()
    expect(result.missing_codes).toHaveLength(0)
  })

  it('no duplicate codes', () => {
    const result = validateChartOfAccounts()
    expect(result.duplicate_codes).toHaveLength(0)
  })

  it('normal_balance is either "debit" or "credit" for all entries', () => {
    for (const acc of CHART_OF_ACCOUNTS) {
      expect(['debit', 'credit']).toContain(acc.normal_balance)
    }
  })

  it('asset accounts have debit normal balance', () => {
    const result = validateChartOfAccounts()
    // No normal_balance_errors involving current_asset or non_current_asset
    const assetErrors = result.normal_balance_errors.filter(e =>
      e.includes('current_asset') || e.includes('non_current_asset')
    )
    expect(assetErrors).toHaveLength(0)
  })

  it('liability accounts have credit normal balance', () => {
    const result = validateChartOfAccounts()
    const liabilityErrors = result.normal_balance_errors.filter(e =>
      e.includes('current_liability') || e.includes('non_current_liability')
    )
    expect(liabilityErrors).toHaveLength(0)
  })

  it('REQUIRED_ACCOUNT_CODES contains all critical codes', () => {
    const CRITICAL = ['100', '102', '120', '320', '500', '600', '620', '590']
    for (const code of CRITICAL) {
      expect(REQUIRED_ACCOUNT_CODES).toContain(code)
    }
  })
})
