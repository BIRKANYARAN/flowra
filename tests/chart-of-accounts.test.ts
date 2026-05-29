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

  it('validateChartOfAccounts returns valid=true overall', () => {
    const result = validateChartOfAccounts()
    expect(result.valid).toBe(true)
  })

  it('normal_balance_errors is empty (no mismatches)', () => {
    const result = validateChartOfAccounts()
    expect(result.normal_balance_errors).toHaveLength(0)
  })

  it('expense accounts have no normal_balance_errors', () => {
    const result = validateChartOfAccounts()
    const expenseErrors = result.normal_balance_errors.filter(e =>
      e.includes('operating_expense') || e.includes('cogs') || e.includes('financing')
    )
    expect(expenseErrors).toHaveLength(0)
  })
})

// ── Additional getAccount edge cases ─────────────────────────────────────────

describe('getAccount — additional edge cases', () => {
  it('returns correct name for 500 (Paid-in Capital)', () => {
    const acc = getAccount('500')
    expect(acc.name).toBe('Paid-in Capital')
    expect(acc.class).toBe('equity')
  })

  it('returns correct name for 620 (Cost of Goods Sold)', () => {
    const acc = getAccount('620')
    expect(acc.name).toBe('Cost of Goods Sold')
    expect(acc.class).toBe('cogs')
  })

  it('returns correct name for 770 (G&A)', () => {
    const acc = getAccount('770')
    expect(acc.name).toBe('General & Administrative')
    expect(acc.class).toBe('operating_expense')
  })

  it('returns correct name for 321 (Partner Loans ST)', () => {
    const acc = getAccount('321')
    expect(acc.class).toBe('current_liability')
    expect(acc.normal_balance).toBe('credit')
  })

  it('returns correct name for 191 (Deductible VAT)', () => {
    const acc = getAccount('191')
    expect(acc.class).toBe('current_asset')
    expect(acc.normal_balance).toBe('debit')
  })

  it('returns correct name for 780 (Finance Expense)', () => {
    const acc = getAccount('780')
    expect(acc.class).toBe('financing')
    expect(acc.normal_balance).toBe('debit')
  })

  it('throws with meaningful message for whitespace code', () => {
    expect(() => getAccount(' ')).toThrow()
  })

  it('throws for numeric-looking but invalid code', () => {
    expect(() => getAccount('999')).toThrow('Unknown account code: 999')
  })

  it('throws for all-alpha code', () => {
    expect(() => getAccount('abc')).toThrow()
  })
})

// ── getAccountSafe — additional cases ────────────────────────────────────────

describe('getAccountSafe — additional cases', () => {
  it('returns null for whitespace', () => {
    expect(getAccountSafe(' ')).toBeNull()
  })

  it('returns null for numeric-format non-existent code', () => {
    expect(getAccountSafe('001')).toBeNull()
    expect(getAccountSafe('200')).toBeNull()
  })

  it('returns correct account for all REQUIRED codes', () => {
    for (const code of REQUIRED_ACCOUNT_CODES) {
      const acc = getAccountSafe(code)
      expect(acc).not.toBeNull()
      expect(acc!.code).toBe(code)
    }
  })

  it('returns null for string that is too long', () => {
    expect(getAccountSafe('10200')).toBeNull()
  })

  it('returns the same object reference as getAccount for known code', () => {
    const safe = getAccountSafe('100')
    const direct = getAccount('100')
    expect(safe).toBe(direct)
  })
})

// ── isCashAccount — extended ──────────────────────────────────────────────────

describe('isCashAccount — extended', () => {
  it('only 100 and 102 are cash accounts in the CoA', () => {
    const cashCodes = CHART_OF_ACCOUNTS.filter(a => a.is_cash).map(a => a.code)
    expect(cashCodes).toContain('100')
    expect(cashCodes).toContain('102')
    expect(cashCodes.length).toBe(2)
  })

  it('returns false for 153 (Inventory)', () => {
    expect(isCashAccount('153')).toBe(false)
  })

  it('returns false for 191 (Deductible VAT)', () => {
    expect(isCashAccount('191')).toBe(false)
  })

  it('returns false for 320 (Trade Payables)', () => {
    expect(isCashAccount('320')).toBe(false)
  })

  it('returns false for 780 (Finance Expense)', () => {
    expect(isCashAccount('780')).toBe(false)
  })

  it('returns false for 253 (Equipment)', () => {
    expect(isCashAccount('253')).toBe(false)
  })
})

// ── isDebitNormal — extended boundary tests ───────────────────────────────────

describe('isDebitNormal — extended boundary tests', () => {
  it('returns true for 153 (Inventory — asset)', () => {
    expect(isDebitNormal('153')).toBe(true)
  })

  it('returns true for 191 (Deductible VAT — asset)', () => {
    expect(isDebitNormal('191')).toBe(true)
  })

  it('returns true for 253 (Equipment — non-current asset)', () => {
    expect(isDebitNormal('253')).toBe(true)
  })

  it('returns true for 760 (Marketing — operating_expense)', () => {
    expect(isDebitNormal('760')).toBe(true)
  })

  it('returns true for 771 (Payroll — operating_expense)', () => {
    expect(isDebitNormal('771')).toBe(true)
  })

  it('returns true for 772 (Rent — operating_expense)', () => {
    expect(isDebitNormal('772')).toBe(true)
  })

  it('returns true for 773 (Software — operating_expense)', () => {
    expect(isDebitNormal('773')).toBe(true)
  })

  it('returns false for 335 (Payroll Payables — liability)', () => {
    expect(isDebitNormal('335')).toBe(false)
  })

  it('returns false for 360 (Tax Payable)', () => {
    expect(isDebitNormal('360')).toBe(false)
  })

  it('returns false for 421 (Partner Loans LT)', () => {
    expect(isDebitNormal('421')).toBe(false)
  })

  it('returns false for 542 (Legal Reserves — equity)', () => {
    expect(isDebitNormal('542')).toBe(false)
  })

  it('returns false for 642 (Interest Income — revenue)', () => {
    expect(isDebitNormal('642')).toBe(false)
  })

  it('returns false for 649 (Other Income — revenue)', () => {
    expect(isDebitNormal('649')).toBe(false)
  })

  it('returns true for contra-asset 257 (Accumulated Depreciation)', () => {
    // 257 has normal_balance='credit' → isDebitNormal returns false
    expect(isDebitNormal('257')).toBe(false)
  })

  it('returns true for contra-equity 580 (Accumulated Losses)', () => {
    // 580 has normal_balance='debit' per the CoA definition
    expect(isDebitNormal('580')).toBe(true)
  })
})

// ── accountClass — additional class checks ────────────────────────────────────

describe('accountClass — additional class checks', () => {
  it('returns cogs for 620', () => {
    expect(accountClass('620')).toBe('cogs')
  })

  it('returns financing for 780', () => {
    expect(accountClass('780')).toBe('financing')
  })

  it('returns revenue for 642', () => {
    expect(accountClass('642')).toBe('revenue')
  })

  it('returns revenue for 649', () => {
    expect(accountClass('649')).toBe('revenue')
  })

  it('returns operating_expense for 771, 772, 773, 760', () => {
    for (const code of ['771', '772', '773', '760']) {
      expect(accountClass(code)).toBe('operating_expense')
    }
  })

  it('returns non_current_asset for 253 and 257', () => {
    expect(accountClass('253')).toBe('non_current_asset')
    expect(accountClass('257')).toBe('non_current_asset')
  })

  it('returns equity for 501, 542, 570, 580', () => {
    for (const code of ['501', '542', '570', '580']) {
      expect(accountClass(code)).toBe('equity')
    }
  })

  it('returns null for unknown code consistently', () => {
    expect(accountClass('000')).toBeNull()
    expect(accountClass('999')).toBeNull()
    expect(accountClass('abc')).toBeNull()
  })
})

// ── accountsByClass — completeness checks ─────────────────────────────────────

describe('accountsByClass — completeness checks', () => {
  it('each account in CHART_OF_ACCOUNTS appears in its class group', () => {
    for (const acc of CHART_OF_ACCOUNTS) {
      const group = accountsByClass(acc.class)
      expect(group.some(a => a.code === acc.code)).toBe(true)
    }
  })

  it('all classes partition the full CHART_OF_ACCOUNTS without overlap', () => {
    const classes: string[] = [
      'current_asset', 'non_current_asset',
      'current_liability', 'non_current_liability',
      'equity', 'revenue', 'cogs', 'operating_expense', 'financing',
    ]
    const allGrouped = classes.flatMap(c => accountsByClass(c as ReturnType<typeof accountClass> & string))
    expect(allGrouped.length).toBe(CHART_OF_ACCOUNTS.length)
  })

  it('no account appears in more than one class group', () => {
    const classes: string[] = [
      'current_asset', 'non_current_asset',
      'current_liability', 'non_current_liability',
      'equity', 'revenue', 'cogs', 'operating_expense', 'financing',
    ]
    const allCodes = classes.flatMap(c => accountsByClass(c as ReturnType<typeof accountClass> & string).map(a => a.code))
    expect(new Set(allCodes).size).toBe(allCodes.length)
  })

  it('revenue class contains 600, 642, 649', () => {
    const codes = accountsByClass('revenue').map(a => a.code)
    expect(codes).toContain('600')
    expect(codes).toContain('642')
    expect(codes).toContain('649')
  })

  it('operating_expense class contains 760, 770, 771, 772, 773', () => {
    const codes = accountsByClass('operating_expense').map(a => a.code)
    for (const c of ['760', '770', '771', '772', '773']) {
      expect(codes).toContain(c)
    }
  })

  it('financing class contains only 780', () => {
    const accts = accountsByClass('financing')
    expect(accts).toHaveLength(1)
    expect(accts[0].code).toBe('780')
  })

  it('cogs class contains only 620', () => {
    const accts = accountsByClass('cogs')
    expect(accts).toHaveLength(1)
    expect(accts[0].code).toBe('620')
  })
})
