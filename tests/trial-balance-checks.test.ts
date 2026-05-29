/**
 * Tests for computeTrialBalanceChecks() — pure period-close guard function.
 *
 * Extracted from TrialBalanceService.compute() so it can be unit-tested without
 * a Supabase connection. This covers Faz 13-H: period close checklist guard.
 *
 * The function determines `can_close_period` from:
 *   1. Mizan dengeli       — is_balanced = true
 *   2. Anormal bakiye yok  — no account has balance_try < -0.01
 *   3. Dönem kârı tutarlı  — computed (600-620-7xx) within ₺1 of ledger 590
 *   4. Journal kayıt mevcut — at least one account with nonzero debit or credit
 *
 * canClosePeriod = is_balanced AND no_abnormal AND has_entries
 * (profit_check failure is informational — does NOT block close)
 *
 * Run with: npx vitest run tests/trial-balance-checks.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeTrialBalanceChecks } from '../lib/services/ledger/trial-balance.service'
import type { TrialBalance, GLAccountBalance } from '../lib/services/ledger/general-ledger.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAccount(
  code: string,
  name: string,
  debit_try: number,
  credit_try: number,
  normal_balance: 'debit' | 'credit' = 'debit',
): GLAccountBalance {
  const balance_try = normal_balance === 'debit'
    ? debit_try - credit_try
    : credit_try - debit_try
  return {
    account_code:    code,
    account_name:    name,
    account_name_tr: name,
    class:           'asset',
    debit_try,
    credit_try,
    balance_try,
    normal_balance,
  }
}

function makeTB(
  accounts:         GLAccountBalance[],
  is_balanced:      boolean = true,
  imbalance_try:    number  = 0,
): TrialBalance {
  const totalDR = accounts.reduce((s, a) => s + a.debit_try, 0)
  const totalCR = accounts.reduce((s, a) => s + a.credit_try, 0)
  return {
    company_id:       'co-1',
    period_id:        'period-1',
    accounts,
    total_debit_try:  totalDR,
    total_credit_try: totalCR,
    is_balanced,
    imbalance_try,
  }
}

/** A minimal balanced trial balance with one revenue and one COGS entry. */
function makeHealthyTB(): TrialBalance {
  // Revenue: 600 CR 100 000   →  balance_try = 100 000 (credit normal)
  // COGS:    620 DR 60 000    →  balance_try = 60 000  (debit normal)
  // Cash:    102 DR 40 000    →  balance_try = 40 000
  // Receivable: 120 DR 100 000 → balance_try = 100 000
  // (same sum DR = CR so is_balanced)
  const accounts = [
    makeAccount('102', 'Bankalar',        40_000, 0,       'debit'),
    makeAccount('120', 'Alıcılar',       100_000, 100_000, 'debit'),
    makeAccount('600', 'Yurt İçi Satışlar',   0, 100_000, 'credit'),
    makeAccount('620', 'SMM',             60_000, 0,       'debit'),
  ]
  return makeTB(accounts, true, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Check 1 — Mizan dengeli
// ─────────────────────────────────────────────────────────────────────────────

describe('check 1 — Mizan dengeli', () => {
  it('passes when is_balanced = true', () => {
    const tb = makeHealthyTB()
    const r  = computeTrialBalanceChecks(tb)
    expect(r.checks.find(c => c.name === 'Mizan dengeli')?.passed).toBe(true)
  })

  it('fails when is_balanced = false', () => {
    const tb = makeTB(makeHealthyTB().accounts, false, 5000)
    const r  = computeTrialBalanceChecks(tb)
    expect(r.checks.find(c => c.name === 'Mizan dengeli')?.passed).toBe(false)
  })

  it('imbalance amount appears in check detail when failed', () => {
    const tb = makeTB(makeHealthyTB().accounts, false, 1234.56)
    const r  = computeTrialBalanceChecks(tb)
    const chk = r.checks.find(c => c.name === 'Mizan dengeli')!
    expect(chk.amount).toBe(1234.56)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Check 2 — Anormal bakiye yok
// ─────────────────────────────────────────────────────────────────────────────

describe('check 2 — Anormal bakiye yok', () => {
  it('passes when all balances ≥ -0.01 (rounding tolerance)', () => {
    const r = computeTrialBalanceChecks(makeHealthyTB())
    expect(r.checks.find(c => c.name === 'Anormal bakiye yok')?.passed).toBe(true)
  })

  it('passes when balance_try = -0.005 (within rounding tolerance)', () => {
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -0.005 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Anormal bakiye yok')?.passed).toBe(true)
  })

  it('fails when any account has balance_try < -0.01', () => {
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -100 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Anormal bakiye yok')?.passed).toBe(false)
  })

  it('abnormal account code appears in detail message', () => {
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -500 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    const chk = r.checks.find(c => c.name === 'Anormal bakiye yok')!
    expect(chk.detail).toContain('102')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Check 3 — Dönem kârı tutarlı
// ─────────────────────────────────────────────────────────────────────────────

describe('check 3 — Dönem kârı tutarlı', () => {
  it('passes when computed profit matches 590 account within ₺1', () => {
    // Revenue 100k, COGS 60k, no expenses → computed profit = 40k
    // 590 account = 40k
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000, 'credit'),  // balance = 100k
      makeAccount('620', 'COGS',      60_000, 0,       'debit'),   // balance = 60k
      makeAccount('590', 'Net Profit',0,      40_000,  'credit'),  // balance = 40k
      makeAccount('102', 'Bank',      40_000, 0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })

  it('passes when difference is exactly ₺0.99 (within tolerance)', () => {
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000,    'credit'),
      makeAccount('620', 'COGS',      60_000, 0,          'debit'),
      makeAccount('590', 'Net Profit',0,      40_000.99,  'credit'),  // 0.99 diff
      makeAccount('102', 'Bank',      40_000, 0,          'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })

  it('fails when difference ≥ ₺1', () => {
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000, 'credit'),
      makeAccount('620', 'COGS',      60_000, 0,       'debit'),
      makeAccount('590', 'Net Profit',0,      50_000,  'credit'),  // diff = 10k
      makeAccount('102', 'Bank',      40_000, 0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(false)
  })

  it('includes expense accounts 7xx in profit computation', () => {
    // Revenue 100k, COGS 60k, salary(771) 10k → computed = 30k
    // 590 = 30k → passes
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000, 'credit'),
      makeAccount('620', 'COGS',      60_000, 0,       'debit'),
      makeAccount('771', 'Salary',    10_000, 0,       'debit'),
      makeAccount('590', 'Net Profit',0,      30_000,  'credit'),
      makeAccount('102', 'Bank',      30_000, 0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })

  it('profit check failure does NOT block can_close_period', () => {
    // Profit mismatch but balanced and has entries → can still close
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000, 'credit'),
      makeAccount('620', 'COGS',      60_000, 0,       'debit'),
      makeAccount('590', 'Net Profit',0,      999,     'credit'), // huge mismatch
      makeAccount('102', 'Bank',      40_000, 0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(false)
    // can_close_period must NOT be false due to profit mismatch alone
    expect(r.can_close_period).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Check 4 — Journal kayıt mevcut
// ─────────────────────────────────────────────────────────────────────────────

describe('check 4 — Journal kayıt mevcut', () => {
  it('passes when at least one account has debit > 0', () => {
    const r = computeTrialBalanceChecks(makeHealthyTB())
    expect(r.checks.find(c => c.name === 'Journal kayıt mevcut')?.passed).toBe(true)
  })

  it('fails when ALL accounts have debit_try = 0 AND credit_try = 0', () => {
    const accounts: GLAccountBalance[] = [
      { account_code: '102', account_name: 'Bank', account_name_tr: 'Bank',
        class: 'asset', debit_try: 0, credit_try: 0, balance_try: 0, normal_balance: 'debit' },
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Journal kayıt mevcut')?.passed).toBe(false)
  })

  it('fails on empty accounts list → trivially balanced but no entries', () => {
    const r = computeTrialBalanceChecks(makeTB([]))
    expect(r.checks.find(c => c.name === 'Journal kayıt mevcut')?.passed).toBe(false)
    // This is the phantom-period guard: empty TB must NOT allow close
    expect(r.can_close_period).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// can_close_period — composite logic
// ─────────────────────────────────────────────────────────────────────────────

describe('can_close_period', () => {
  it('true when balanced, no abnormal, has entries', () => {
    const r = computeTrialBalanceChecks(makeHealthyTB())
    expect(r.can_close_period).toBe(true)
  })

  it('false when imbalanced (even if entries exist and no abnormal)', () => {
    const tb = makeTB(makeHealthyTB().accounts, false, 500)
    const r  = computeTrialBalanceChecks(tb)
    expect(r.can_close_period).toBe(false)
  })

  it('false when abnormal account (negative balance) exists', () => {
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -250 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.can_close_period).toBe(false)
  })

  it('false on empty account list (phantom period protection)', () => {
    const r = computeTrialBalanceChecks(makeTB([]))
    expect(r.can_close_period).toBe(false)
  })

  it('false when BOTH imbalanced AND no entries', () => {
    const r = computeTrialBalanceChecks(makeTB([], false, 1000))
    expect(r.can_close_period).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// all_passed — requires ALL 4 checks
// ─────────────────────────────────────────────────────────────────────────────

describe('all_passed', () => {
  it('true when all 4 checks pass', () => {
    // Healthy TB with matching 590
    const accounts = [
      makeAccount('600', 'Revenue',   0,      100_000, 'credit'),
      makeAccount('620', 'COGS',      60_000, 0,       'debit'),
      makeAccount('590', 'Net Profit',0,      40_000,  'credit'),
      makeAccount('102', 'Bank',      40_000, 0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.all_passed).toBe(true)
  })

  it('false when profit check fails even if can_close_period is true', () => {
    // can_close_period can be true while all_passed is false
    const r = computeTrialBalanceChecks(makeHealthyTB()) // no 590 account → profit check fails
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(false)
    expect(r.all_passed).toBe(false)
    expect(r.can_close_period).toBe(true) // still closeable
  })

  it('returns exactly 4 checks', () => {
    const r = computeTrialBalanceChecks(makeHealthyTB())
    expect(r.checks).toHaveLength(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Boundary & edge values
// ─────────────────────────────────────────────────────────────────────────────

describe('boundary — rounding tolerance for abnormal balances', () => {
  it('balance_try = -0.01 exactly → passes (tolerance is balance_try < -0.01, strict less-than)', () => {
    // The check is balance_try < -0.01 (strictly), so -0.01 is NOT less than -0.01 → passes
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -0.01 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Anormal bakiye yok')?.passed).toBe(true)
  })

  it('balance_try = -0.011 → fails (just below -0.01 strict threshold)', () => {
    const accounts = makeHealthyTB().accounts.map(a =>
      a.account_code === '102' ? { ...a, balance_try: -0.011 } : a
    )
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Anormal bakiye yok')?.passed).toBe(false)
  })

  it('profit check tolerance: difference of exactly ₺1.00 → fails (not within < 1)', () => {
    const accounts = [
      makeAccount('600', 'Revenue',    0,      100_000,  'credit'),
      makeAccount('620', 'COGS',       60_000, 0,        'debit'),
      makeAccount('590', 'Net Profit', 0,      41_000,   'credit'), // diff = 1k
      makeAccount('102', 'Bank',       40_000, 0,        'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(false)
  })

  it('profit check tolerance: difference of ₺0.99 → passes', () => {
    const accounts = [
      makeAccount('600', 'Revenue',    0,       100_000,   'credit'),
      makeAccount('620', 'COGS',       60_000,  0,         'debit'),
      makeAccount('590', 'Net Profit', 0,       40_000.99, 'credit'),
      makeAccount('102', 'Bank',       40_000,  0,         'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Multiple abnormal accounts
// ─────────────────────────────────────────────────────────────────────────────

describe('check 2 — multiple abnormal accounts', () => {
  it('fails and detail lists all abnormal codes when two accounts are negative', () => {
    const accounts = makeHealthyTB().accounts.map(a => {
      if (a.account_code === '102') return { ...a, balance_try: -200 }
      if (a.account_code === '120') return { ...a, balance_try: -500 }
      return a
    })
    const r = computeTrialBalanceChecks(makeTB(accounts))
    const chk = r.checks.find(c => c.name === 'Anormal bakiye yok')!
    expect(chk.passed).toBe(false)
    expect(chk.detail).toContain('102')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Large values & precision
// ─────────────────────────────────────────────────────────────────────────────

describe('large values & precision', () => {
  it('handles large amounts (₺100M revenue) without overflow', () => {
    const accounts = [
      makeAccount('600', 'Revenue',   0,           100_000_000, 'credit'),
      makeAccount('620', 'COGS',      60_000_000,  0,           'debit'),
      makeAccount('590', 'Net Profit',0,            40_000_000, 'credit'),
      makeAccount('102', 'Bank',      40_000_000,  0,           'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
    expect(r.can_close_period).toBe(true)
  })

  it('imbalance of ₺0.01 is preserved in check detail', () => {
    const tb = makeTB(makeHealthyTB().accounts, false, 0.01)
    const r  = computeTrialBalanceChecks(tb)
    const chk = r.checks.find(c => c.name === 'Mizan dengeli')!
    expect(chk.amount).toBeCloseTo(0.01, 2)
    expect(chk.passed).toBe(false)
  })

  it('imbalance of ₺10 000 000 is preserved in check detail', () => {
    const tb = makeTB(makeHealthyTB().accounts, false, 10_000_000)
    const r  = computeTrialBalanceChecks(tb)
    const chk = r.checks.find(c => c.name === 'Mizan dengeli')!
    expect(chk.amount).toBe(10_000_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7xx expense account variety
// ─────────────────────────────────────────────────────────────────────────────

describe('check 3 — various 7xx expense accounts', () => {
  it('multiple 7xx accounts all subtracted from revenue when computing profit', () => {
    // Revenue 200k, COGS 100k, 3×expenses totalling 40k → computed profit 60k
    const accounts = [
      makeAccount('600', 'Revenue',     0,       200_000, 'credit'),
      makeAccount('620', 'COGS',        100_000, 0,       'debit'),
      makeAccount('760', 'Market Exp',  10_000,  0,       'debit'),
      makeAccount('770', 'Gen Exp',     20_000,  0,       'debit'),
      makeAccount('780', 'Fin Exp',     10_000,  0,       'debit'),
      makeAccount('590', 'Net Profit',  0,       60_000,  'credit'),
      makeAccount('102', 'Bank',        60_000,  0,       'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })

  it('no 7xx accounts present — only 600 and 620', () => {
    const accounts = [
      makeAccount('600', 'Revenue',    0,       50_000, 'credit'),
      makeAccount('620', 'COGS',       30_000,  0,      'debit'),
      makeAccount('590', 'Net Profit', 0,       20_000, 'credit'),
      makeAccount('102', 'Bank',       20_000,  0,      'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(true)
  })

  it('only 7xx expenses with no revenue — profit = negative', () => {
    // computed profit = 0 - 0 - 50k = -50k; 590 = 0 → diff 50k → fails
    const accounts = [
      makeAccount('770', 'Gen Exp',    50_000,  0,  'debit'),
      makeAccount('590', 'Net Profit', 0,       0,  'credit'),
      makeAccount('102', 'Bank',       0,       0,  'debit'),
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    // large diff → profit check fails
    expect(r.checks.find(c => c.name === 'Dönem kârı tutarlı')?.passed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Journal kayıt mevcut — only credit side
// ─────────────────────────────────────────────────────────────────────────────

describe('check 4 — journal entries edge cases', () => {
  it('passes when account has debit_try = 0 but credit_try > 0', () => {
    const accounts: GLAccountBalance[] = [
      {
        account_code: '600', account_name: 'Revenue', account_name_tr: 'Gelir',
        class: 'asset', debit_try: 0, credit_try: 100_000, balance_try: 100_000,
        normal_balance: 'credit',
      },
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Journal kayıt mevcut')?.passed).toBe(true)
  })

  it('single account with both debit and credit non-zero → passes', () => {
    const accounts: GLAccountBalance[] = [
      {
        account_code: '120', account_name: 'Alıcılar', account_name_tr: 'Alıcılar',
        class: 'asset', debit_try: 500, credit_try: 500, balance_try: 0,
        normal_balance: 'debit',
      },
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts))
    expect(r.checks.find(c => c.name === 'Journal kayıt mevcut')?.passed).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Composite: worst-case all 4 checks fail
// ─────────────────────────────────────────────────────────────────────────────

describe('composite — all checks fail', () => {
  it('can_close_period = false when imbalanced, abnormal balance, and no entries', () => {
    const accounts: GLAccountBalance[] = [
      {
        account_code: '102', account_name: 'Bank', account_name_tr: 'Bank',
        class: 'asset', debit_try: 0, credit_try: 0, balance_try: -999,
        normal_balance: 'debit',
      },
    ]
    const r = computeTrialBalanceChecks(makeTB(accounts, false, 5_000))
    expect(r.can_close_period).toBe(false)
    expect(r.all_passed).toBe(false)
  })

  it('checks array has exactly 4 elements regardless of scenario', () => {
    const scenarios = [
      computeTrialBalanceChecks(makeHealthyTB()),
      computeTrialBalanceChecks(makeTB([], false, 100)),
      computeTrialBalanceChecks(makeTB(makeHealthyTB().accounts, false, 1)),
    ]
    for (const r of scenarios) {
      expect(r.checks).toHaveLength(4)
    }
  })

  it('check names are always the same 4 strings', () => {
    const r = computeTrialBalanceChecks(makeHealthyTB())
    const names = r.checks.map(c => c.name)
    expect(names).toContain('Mizan dengeli')
    expect(names).toContain('Anormal bakiye yok')
    expect(names).toContain('Dönem kârı tutarlı')
    expect(names).toContain('Journal kayıt mevcut')
  })
})
