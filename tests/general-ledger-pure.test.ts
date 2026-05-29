/**
 * Tests for GeneralLedgerService.classBalance() — the one pure static method.
 *
 * classBalance(gl, cls) → sum of balance_try for all accounts in the given
 * AccountClass, filtered against the chart of accounts definition.
 *
 * Run with: npx vitest run tests/general-ledger-pure.test.ts
 */
import { describe, it, expect } from 'vitest'
import { GeneralLedgerService, type GLSnapshot, type GLAccountBalance } from '../lib/services/ledger/general-ledger.service'
import { CHART_OF_ACCOUNTS } from '../lib/accounting/chart-of-accounts'

// ── Helper ────────────────────────────────────────────────────────────────────

function mkGL(accounts: Partial<GLAccountBalance>[]): GLSnapshot {
  return {
    company_id:  'test-co',
    as_of:       '2025-12-31',
    computed_at: new Date().toISOString(),
    accounts:    accounts.map(a => ({
      account_code:    a.account_code   ?? '102',
      account_name:    a.account_name   ?? 'Test',
      account_name_tr: a.account_name_tr ?? 'Test TR',
      class:           a.class           ?? 'current_asset',
      debit_try:       a.debit_try       ?? 0,
      credit_try:      a.credit_try      ?? 0,
      balance_try:     a.balance_try     ?? 0,
      normal_balance:  a.normal_balance  ?? 'debit',
    })),
  }
}

// Find actual account codes by class from the chart for realistic fixtures
function codesForClass(cls: string): string[] {
  return CHART_OF_ACCOUNTS.filter(a => a.class === cls).map(a => a.code).slice(0, 3)
}

// ── Empty GL ───────────────────────────────────────────────────────────────────

describe('GeneralLedgerService.classBalance — empty GL', () => {
  it('returns 0 for empty accounts array', () => {
    const gl = mkGL([])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(0)
  })

  it('returns 0 when no accounts match the given class', () => {
    // GL has only non_current_asset accounts — current_asset query returns 0
    const gl = mkGL([{ account_code: '253', class: 'non_current_asset', balance_try: 50_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(0)
  })
})

// ── Single class, single account ──────────────────────────────────────────────

describe('GeneralLedgerService.classBalance — single account', () => {
  it('returns balance of a single current_asset account (102 — Bankalar)', () => {
    const gl = mkGL([{ account_code: '102', class: 'current_asset', balance_try: 200_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(200_000)
  })

  it('returns balance of a current_liability account (391 — KDV)', () => {
    const gl = mkGL([{ account_code: '391', class: 'current_liability', balance_try: 15_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'current_liability')).toBe(15_000)
  })

  it('returns balance of an equity account (500 — Sermaye)', () => {
    const gl = mkGL([{ account_code: '500', class: 'equity', balance_try: 500_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'equity')).toBe(500_000)
  })

  it('returns balance of a revenue account (600)', () => {
    const gl = mkGL([{ account_code: '600', class: 'revenue', balance_try: 1_200_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'revenue')).toBe(1_200_000)
  })

  it('returns balance of an operating_expense account (770)', () => {
    const gl = mkGL([{ account_code: '770', class: 'operating_expense', balance_try: 400_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'operating_expense')).toBe(400_000)
  })
})

// ── Multiple accounts in the same class ──────────────────────────────────────

describe('GeneralLedgerService.classBalance — sums multiple accounts in class', () => {
  it('sums two current_asset accounts', () => {
    const gl = mkGL([
      { account_code: '100', class: 'current_asset', balance_try: 10_000 },
      { account_code: '102', class: 'current_asset', balance_try: 90_000 },
    ])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(100_000)
  })

  it('sums three operating_expense accounts', () => {
    const gl = mkGL([
      { account_code: '760', class: 'operating_expense', balance_try: 30_000 },
      { account_code: '770', class: 'operating_expense', balance_try: 50_000 },
      { account_code: '771', class: 'operating_expense', balance_try: 20_000 },
    ])
    expect(GeneralLedgerService.classBalance(gl, 'operating_expense')).toBe(100_000)
  })

  it('excludes accounts belonging to a different class', () => {
    const gl = mkGL([
      { account_code: '102',  class: 'current_asset',     balance_try: 200_000 },
      { account_code: '500',  class: 'equity',            balance_try: 100_000 },
      { account_code: '320',  class: 'current_liability', balance_try:  30_000 },
    ])
    // Each class query should only sum its own accounts
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(200_000)
    expect(GeneralLedgerService.classBalance(gl, 'equity')).toBe(100_000)
    // Note: '320' class is 'current_liability' — not 'non_current_liability'
    expect(GeneralLedgerService.classBalance(gl, 'current_liability')).toBe(30_000)
    // Cross-class check: operating_expense query returns 0 from this GL
    expect(GeneralLedgerService.classBalance(gl, 'operating_expense')).toBe(0)
  })
})

// ── Balance values: zero, negative ───────────────────────────────────────────

describe('GeneralLedgerService.classBalance — balance edge values', () => {
  it('handles zero balance accounts', () => {
    const gl = mkGL([{ account_code: '102', class: 'current_asset', balance_try: 0 }])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(0)
  })

  it('handles negative balances (e.g. contra accounts)', () => {
    // e.g. accumulated depreciation is negative in balance
    const gl = mkGL([{ account_code: '257', class: 'non_current_asset', balance_try: -25_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'non_current_asset')).toBe(-25_000)
  })

  it('correctly sums mixed positive/negative balances', () => {
    const gl = mkGL([
      { account_code: '253', class: 'non_current_asset', balance_try:  100_000 },
      { account_code: '257', class: 'non_current_asset', balance_try:  -40_000 }, // depreciation contra
    ])
    expect(GeneralLedgerService.classBalance(gl, 'non_current_asset')).toBe(60_000)
  })
})

// ── Accounts not in chart definition are excluded ────────────────────────────

describe('GeneralLedgerService.classBalance — unknown account codes ignored', () => {
  it('ignores account codes not in chart of accounts', () => {
    // An account code we fabricate that is not in CHART_OF_ACCOUNTS
    const gl = mkGL([
      { account_code: '999', class: 'current_asset', balance_try: 500_000 }, // not in CoA
      { account_code: '102', class: 'current_asset', balance_try:  50_000 }, // valid
    ])
    // classBalance filters on accountsByClass(cls).map(a => a.code)
    // So '999' is excluded even though its class field says current_asset
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(50_000)
  })
})

// ── Result is rounded to 2 decimal places ────────────────────────────────────

describe('GeneralLedgerService.classBalance — rounding', () => {
  it('rounds result to 2 decimal places', () => {
    const gl = mkGL([
      { account_code: '102', class: 'current_asset', balance_try: 100.001 },
      { account_code: '120', class: 'current_asset', balance_try: 200.004 },
    ])
    const result = GeneralLedgerService.classBalance(gl, 'current_asset')
    // round2(300.005) = 300.01 (uses Number.EPSILON guard)
    expect(result).toBeCloseTo(300.01, 2)
  })
})

// ── All valid AccountClass values ─────────────────────────────────────────────

describe('GeneralLedgerService.classBalance — all account classes', () => {
  it('correctly totals cogs accounts (620)', () => {
    const gl = mkGL([{ account_code: '620', class: 'cogs', balance_try: 75_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'cogs')).toBe(75_000)
  })

  it('correctly totals non_current_liability accounts (421)', () => {
    const gl = mkGL([{ account_code: '421', class: 'non_current_liability', balance_try: 200_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'non_current_liability')).toBe(200_000)
  })

  it('correctly totals financing accounts (780)', () => {
    const gl = mkGL([{ account_code: '780', class: 'financing', balance_try: 12_500 }])
    expect(GeneralLedgerService.classBalance(gl, 'financing')).toBe(12_500)
  })

  it('returns 0 for a class with no matching accounts in GL', () => {
    const gl = mkGL([{ account_code: '100', class: 'current_asset', balance_try: 5_000 }])
    expect(GeneralLedgerService.classBalance(gl, 'revenue')).toBe(0)
  })
})

// ── Large GL with many accounts ───────────────────────────────────────────────

describe('GeneralLedgerService.classBalance — large GL fixture', () => {
  it('sums all operating_expense accounts correctly', () => {
    const gl = mkGL([
      { account_code: '760', class: 'operating_expense', balance_try:  40_000 },
      { account_code: '770', class: 'operating_expense', balance_try:  60_000 },
      { account_code: '771', class: 'operating_expense', balance_try:  80_000 },
      { account_code: '772', class: 'operating_expense', balance_try:  20_000 },
      { account_code: '773', class: 'operating_expense', balance_try:  10_000 },
    ])
    expect(GeneralLedgerService.classBalance(gl, 'operating_expense')).toBe(210_000)
  })

  it('sums all equity accounts correctly including contra', () => {
    const gl = mkGL([
      { account_code: '500', class: 'equity', balance_try:  500_000 },
      { account_code: '542', class: 'equity', balance_try:   50_000 },
      { account_code: '570', class: 'equity', balance_try:  100_000 },
      { account_code: '590', class: 'equity', balance_try:   25_000 },
      // contra: unpaid capital (debit normal => balance_try is negative)
      { account_code: '501', class: 'equity', balance_try: -100_000 },
    ])
    expect(GeneralLedgerService.classBalance(gl, 'equity')).toBe(575_000)
  })

  it('classBalance is independent across classes on the same GL snapshot', () => {
    const gl = mkGL([
      { account_code: '100', class: 'current_asset',     balance_try: 10_000 },
      { account_code: '102', class: 'current_asset',     balance_try: 90_000 },
      { account_code: '320', class: 'current_liability', balance_try: 30_000 },
      { account_code: '391', class: 'current_liability', balance_try: 15_000 },
      { account_code: '600', class: 'revenue',           balance_try: 500_000 },
      { account_code: '770', class: 'operating_expense', balance_try:  80_000 },
    ])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(100_000)
    expect(GeneralLedgerService.classBalance(gl, 'current_liability')).toBe(45_000)
    expect(GeneralLedgerService.classBalance(gl, 'revenue')).toBe(500_000)
    expect(GeneralLedgerService.classBalance(gl, 'operating_expense')).toBe(80_000)
    expect(GeneralLedgerService.classBalance(gl, 'cogs')).toBe(0)
  })
})

// ── Fractional balance aggregation ───────────────────────────────────────────

describe('GeneralLedgerService.classBalance — fractional balances', () => {
  it('sums fractional balances and rounds to 2dp', () => {
    const gl = mkGL([
      { account_code: '100', class: 'current_asset', balance_try: 0.1 },
      { account_code: '102', class: 'current_asset', balance_try: 0.2 },
    ])
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE; round2 should produce 0.3
    const result = GeneralLedgerService.classBalance(gl, 'current_asset')
    expect(result).toBeCloseTo(0.3, 2)
  })

  it('large fractional sum rounds correctly', () => {
    const gl = mkGL([
      { account_code: '770', class: 'operating_expense', balance_try: 333.333 },
      { account_code: '771', class: 'operating_expense', balance_try: 333.333 },
      { account_code: '772', class: 'operating_expense', balance_try: 333.334 },
    ])
    const result = GeneralLedgerService.classBalance(gl, 'operating_expense')
    expect(result).toBeCloseTo(1000, 1)
  })
})

// ── Multiple unknown codes mixed with known ───────────────────────────────────

describe('GeneralLedgerService.classBalance — multiple unknown codes', () => {
  it('ignores all unknown codes and only sums CoA-registered ones', () => {
    const gl = mkGL([
      { account_code: '997', class: 'current_asset', balance_try: 999_999 }, // unknown
      { account_code: '998', class: 'current_asset', balance_try: 888_888 }, // unknown
      { account_code: '100', class: 'current_asset', balance_try:   5_000 }, // valid
      { account_code: '102', class: 'current_asset', balance_try:  10_000 }, // valid
    ])
    expect(GeneralLedgerService.classBalance(gl, 'current_asset')).toBe(15_000)
  })

  it('unknown codes for an unrelated class do not contaminate the queried class', () => {
    const gl = mkGL([
      { account_code: '999', class: 'revenue', balance_try: 1_000_000 }, // unknown
      { account_code: '600', class: 'revenue', balance_try:   200_000 }, // valid
    ])
    expect(GeneralLedgerService.classBalance(gl, 'revenue')).toBe(200_000)
  })
})
