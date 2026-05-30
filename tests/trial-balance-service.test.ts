/**
 * Tests for lib/services/ledger/trial-balance.service.ts
 * Pure-function helpers: validateTrialBalance, classifyAccount,
 * filterTrialBalanceByCategory, computeTrialBalanceSummary
 *
 * Run with: npx vitest run tests/trial-balance-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  validateTrialBalance,
  classifyAccount,
  filterTrialBalanceByCategory,
  computeTrialBalanceSummary,
  type TrialBalanceLine,
} from '../lib/services/ledger/trial-balance.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLine(
  account_code:   string,
  debit_balance:  number,
  credit_balance: number,
  account_name = 'Test Hesap',
): TrialBalanceLine {
  const net_balance = debit_balance - credit_balance
  const { normal_balance } = classifyAccount(account_code)
  return { account_code, account_name, debit_balance, credit_balance, net_balance, normal_balance }
}

// Balanced set: 1 asset, 1 liability, 1 equity, 1 revenue, 1 expense
const BALANCED_LINES: TrialBalanceLine[] = [
  makeLine('100', 50_000, 10_000),   // asset:     net +40 000
  makeLine('320',  5_000, 30_000),   // liability: net -25 000
  makeLine('500',      0, 20_000),   // equity:    net -20 000
  makeLine('600',      0, 30_000),   // revenue:   net -30 000
  makeLine('770', 60_000,      0),   // expense:   net +60 000
  // totals: DR = 50000+5000+60000 = 115000 / CR = 10000+30000+20000+30000 = 90000 — NOT balanced
  // adjust: add a balancing credit entry
]

// Truly balanced: DR total = CR total
const TRULY_BALANCED: TrialBalanceLine[] = [
  makeLine('102', 100_000,  40_000),  // DR=100k CR=40k
  makeLine('320',  10_000,  50_000),  // DR=10k  CR=50k
  makeLine('500',       0,  20_000),  // DR=0    CR=20k
  // totals: DR=110 000, CR=110 000 → balanced
]

// Unbalanced by 0.50
const UNBALANCED_LINES: TrialBalanceLine[] = [
  makeLine('102', 100.00,   0),
  makeLine('320',   0,     99.50),
]

// Lines for category filtering
const ALL_CATEGORY_LINES: TrialBalanceLine[] = [
  makeLine('100',  5_000,      0),   // asset
  makeLine('253', 20_000,      0),   // asset (non-current)
  makeLine('257',      0, 10_000),   // asset (contra — credit normal)
  makeLine('320',  1_000, 15_000),   // liability
  makeLine('360',      0, 12_000),   // liability
  makeLine('500',      0, 30_000),   // equity
  makeLine('570',      0,  8_000),   // equity
  makeLine('600',      0, 40_000),   // revenue
  makeLine('620', 22_000,      0),   // expense (COGS)
  makeLine('770', 18_000,      0),   // expense
]

// ── validateTrialBalance ──────────────────────────────────────────────────────

describe('validateTrialBalance', () => {
  it('returns balanced=true when debits === credits', () => {
    const result = validateTrialBalance(TRULY_BALANCED)
    expect(result.balanced).toBe(true)
    expect(result.discrepancy).toBe(0)
  })

  it('total_debits sums correctly', () => {
    const result = validateTrialBalance(TRULY_BALANCED)
    expect(result.total_debits).toBe(110_000)
  })

  it('total_credits sums correctly', () => {
    const result = validateTrialBalance(TRULY_BALANCED)
    expect(result.total_credits).toBe(110_000)
  })

  it('returns balanced=false when debits !== credits', () => {
    const result = validateTrialBalance(UNBALANCED_LINES)
    expect(result.balanced).toBe(false)
  })

  it('discrepancy is Math.abs(debits - credits)', () => {
    const result = validateTrialBalance(UNBALANCED_LINES)
    expect(result.discrepancy).toBeCloseTo(0.5, 5)
  })

  it('returns balanced=true when discrepancy rounds to 0.00 (float rounding)', () => {
    // 100.004 rounds to 100.00, 100.003 rounds to 100.00 → discrepancy = 0
    const lines: TrialBalanceLine[] = [
      { account_code: '100', account_name: 'A', debit_balance: 100.004, credit_balance: 0, net_balance: 100.004, normal_balance: 'debit' },
      { account_code: '320', account_name: 'B', debit_balance: 0, credit_balance: 100.003, net_balance: -100.003, normal_balance: 'credit' },
    ]
    const result = validateTrialBalance(lines)
    // Both round to 100.00, so discrepancy = 0, balanced = true
    expect(result.balanced).toBe(true)
  })

  it('handles empty lines — balanced with zero totals', () => {
    const result = validateTrialBalance([])
    expect(result.balanced).toBe(true)
    expect(result.total_debits).toBe(0)
    expect(result.total_credits).toBe(0)
    expect(result.discrepancy).toBe(0)
  })

  it('single debit-only line is unbalanced', () => {
    const lines = [makeLine('100', 5_000, 0)]
    const result = validateTrialBalance(lines)
    expect(result.balanced).toBe(false)
    expect(result.discrepancy).toBe(5_000)
  })

  it('rounds totals to 2 decimal places', () => {
    const lines: TrialBalanceLine[] = [
      { account_code: '100', account_name: 'A', debit_balance: 1.005, credit_balance: 0, net_balance: 1.005, normal_balance: 'debit' },
      { account_code: '320', account_name: 'B', debit_balance: 0, credit_balance: 1.005, net_balance: -1.005, normal_balance: 'credit' },
    ]
    const result = validateTrialBalance(lines)
    expect(result.total_debits.toString()).not.toMatch(/\d{4,}/)  // no more than 2 decimals accumulated
    expect(result.balanced).toBe(true)
  })
})

// ── classifyAccount ───────────────────────────────────────────────────────────

describe('classifyAccount', () => {
  it('100 — Kasa → asset, debit', () => {
    const r = classifyAccount('100')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('debit')
  })

  it('102 — Bankalar → asset, debit', () => {
    const r = classifyAccount('102')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('debit')
  })

  it('120 — Alıcılar → asset, debit', () => {
    const r = classifyAccount('120')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('debit')
  })

  it('153 — Ticari Mallar → asset, debit', () => {
    const r = classifyAccount('153')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('debit')
  })

  it('257 — Birikmiş Amortismanlar → asset (contra), credit', () => {
    const r = classifyAccount('257')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('credit')
  })

  it('320 — Satıcılar → liability, credit', () => {
    const r = classifyAccount('320')
    expect(r.category).toBe('liability')
    expect(r.normal_balance).toBe('credit')
  })

  it('500 — Sermaye → equity, credit', () => {
    const r = classifyAccount('500')
    expect(r.category).toBe('equity')
    expect(r.normal_balance).toBe('credit')
  })

  it('570 — Geçmiş Yıllar Karları → equity, credit', () => {
    const r = classifyAccount('570')
    expect(r.category).toBe('equity')
    expect(r.normal_balance).toBe('credit')
  })

  it('600 — Yurt İçi Satışlar → revenue, credit', () => {
    const r = classifyAccount('600')
    expect(r.category).toBe('revenue')
    expect(r.normal_balance).toBe('credit')
  })

  it('620 — Satılan Mal Maliyeti → expense, debit', () => {
    const r = classifyAccount('620')
    expect(r.category).toBe('expense')
    expect(r.normal_balance).toBe('debit')
  })

  it('770 — Genel Yönetim Giderleri → expense, debit', () => {
    const r = classifyAccount('770')
    expect(r.category).toBe('expense')
    expect(r.normal_balance).toBe('debit')
  })

  it('4xx — long-term liability → liability, credit', () => {
    const r = classifyAccount('400')
    expect(r.category).toBe('liability')
    expect(r.normal_balance).toBe('credit')
  })

  it('253 — Tesis Makine → asset (non-contra 2xx), debit', () => {
    const r = classifyAccount('253')
    expect(r.category).toBe('asset')
    expect(r.normal_balance).toBe('debit')
  })

  it('605 — other 6xx (not 62x) → revenue, credit', () => {
    const r = classifyAccount('605')
    expect(r.category).toBe('revenue')
    expect(r.normal_balance).toBe('credit')
  })
})

// ── filterTrialBalanceByCategory ─────────────────────────────────────────────

describe('filterTrialBalanceByCategory', () => {
  it('filters to assets only', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'asset')
    const codes  = result.map(l => l.account_code)
    expect(codes).toContain('100')
    expect(codes).toContain('253')
    expect(codes).toContain('257')
    expect(codes).not.toContain('320')
    expect(codes).not.toContain('600')
  })

  it('filters to liabilities only', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'liability')
    const codes  = result.map(l => l.account_code)
    expect(codes).toContain('320')
    expect(codes).toContain('360')
    expect(codes).not.toContain('100')
    expect(codes).not.toContain('500')
  })

  it('filters to equity only', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'equity')
    const codes  = result.map(l => l.account_code)
    expect(codes).toContain('500')
    expect(codes).toContain('570')
    expect(codes).not.toContain('100')
  })

  it('filters to revenue only', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'revenue')
    const codes  = result.map(l => l.account_code)
    expect(codes).toContain('600')
    expect(codes).not.toContain('620')  // 620 is expense
    expect(codes).not.toContain('770')
  })

  it('filters to expense only (includes COGS 62x + 7xx)', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'expense')
    const codes  = result.map(l => l.account_code)
    expect(codes).toContain('620')
    expect(codes).toContain('770')
    expect(codes).not.toContain('600')
  })

  it('returns empty array when no lines match category', () => {
    const assetOnly = [makeLine('100', 1_000, 0)]
    const result = filterTrialBalanceByCategory(assetOnly, 'revenue')
    expect(result).toHaveLength(0)
  })

  it('returns empty array for empty input', () => {
    expect(filterTrialBalanceByCategory([], 'asset')).toHaveLength(0)
  })

  it('result lines all belong to requested category', () => {
    const result = filterTrialBalanceByCategory(ALL_CATEGORY_LINES, 'expense')
    for (const line of result) {
      const { category } = classifyAccount(line.account_code)
      expect(category).toBe('expense')
    }
  })
})

// ── computeTrialBalanceSummary ────────────────────────────────────────────────

describe('computeTrialBalanceSummary', () => {
  const SUMMARY_LINES: TrialBalanceLine[] = [
    makeLine('100', 80_000,  20_000),   // asset net  +60 000
    makeLine('253', 50_000,       0),   // asset net  +50 000 → total_assets = 110 000
    makeLine('320',  5_000,  35_000),   // liability net  -30 000
    makeLine('500',      0,  40_000),   // equity net -40 000
    makeLine('600',      0,  90_000),   // revenue net -90 000 → total_revenue = 90 000
    makeLine('770', 35_000,       0),   // expense net +35 000
    makeLine('620', 20_000,       0),   // expense net +20 000 → total_expenses = 55 000
  ]

  it('total_assets is sum of absolute net balances for assets', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.total_assets).toBe(110_000)
  })

  it('total_liabilities is sum of absolute net balances for liabilities', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.total_liabilities).toBe(30_000)
  })

  it('total_equity is sum of absolute net balances for equity', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.total_equity).toBe(40_000)
  })

  it('total_revenue is sum of absolute net balances for revenue', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.total_revenue).toBe(90_000)
  })

  it('total_expenses is sum of absolute net balances for expenses (COGS + opex)', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.total_expenses).toBe(55_000)
  })

  it('net_income = total_revenue - total_expenses', () => {
    const s = computeTrialBalanceSummary(SUMMARY_LINES)
    expect(s.net_income).toBe(35_000)   // 90 000 - 55 000
  })

  it('net_income is negative when expenses exceed revenue', () => {
    const lossLines: TrialBalanceLine[] = [
      makeLine('600',      0, 20_000),  // revenue  20 000
      makeLine('770', 50_000,      0),  // expense  50 000
    ]
    const s = computeTrialBalanceSummary(lossLines)
    expect(s.net_income).toBe(-30_000)
  })

  it('all values are zero for empty input', () => {
    const s = computeTrialBalanceSummary([])
    expect(s.total_assets).toBe(0)
    expect(s.total_liabilities).toBe(0)
    expect(s.total_equity).toBe(0)
    expect(s.total_revenue).toBe(0)
    expect(s.total_expenses).toBe(0)
    expect(s.net_income).toBe(0)
  })

  it('net_income = 0 when revenue === expenses', () => {
    const lines: TrialBalanceLine[] = [
      makeLine('600',      0, 10_000),
      makeLine('770', 10_000,      0),
    ]
    const s = computeTrialBalanceSummary(lines)
    expect(s.net_income).toBe(0)
  })
})
