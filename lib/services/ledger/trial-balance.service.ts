// Trial Balance Service — invariant checks + formatted output for CFO

import { GeneralLedgerService, type TrialBalance } from './general-ledger.service'
import { round2 } from '@/lib/calc'

// ── Pure helpers — no DB, safe to unit-test ───────────────────────────────────

export interface TrialBalanceLine {
  account_code:   string
  account_name:   string
  debit_balance:  number
  credit_balance: number
  net_balance:    number    // debit - credit
  normal_balance: 'debit' | 'credit'
}

/**
 * Validates a trial balance: checks whether total debits equal total credits.
 * Returns totals, a balanced flag and the discrepancy (0 when balanced).
 */
export function validateTrialBalance(lines: TrialBalanceLine[]): {
  total_debits:  number
  total_credits: number
  balanced:      boolean   // |debits - credits| < 0.01
  discrepancy:   number
} {
  const total_debits  = round2(lines.reduce((s, l) => s + l.debit_balance,  0))
  const total_credits = round2(lines.reduce((s, l) => s + l.credit_balance, 0))
  const discrepancy   = round2(Math.abs(total_debits - total_credits))
  return { total_debits, total_credits, balanced: discrepancy < 0.01, discrepancy }
}

/**
 * Classifies a Turkish MSUGT account code into a category and normal balance.
 *
 * Turkish Uniform Chart of Accounts (MSUGT):
 *   1xx — Current assets       → debit normal
 *   2xx — Non-current assets   → debit normal   (257 Accumulated Depreciation → credit)
 *   3xx — Current liabilities  → credit normal
 *   4xx — Long-term liabilities → credit normal
 *   5xx — Equity               → credit normal
 *   60x — Revenue              → credit normal
 *   62x — Cost of goods sold   → debit normal
 *   6xx (other) — Revenue/COGS → credit normal (default)
 *   7xx — Expenses             → debit normal
 */
export function classifyAccount(code: string): {
  category:       'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  normal_balance: 'debit' | 'credit'
} {
  const prefix = parseInt(code.slice(0, 1), 10)
  const n3     = code.slice(0, 3)

  // Contra asset: accumulated depreciation 257 → credit normal
  if (n3 === '257') return { category: 'asset', normal_balance: 'credit' }

  if (prefix === 1 || prefix === 2) return { category: 'asset',     normal_balance: 'debit'  }
  if (prefix === 3 || prefix === 4) return { category: 'liability', normal_balance: 'credit' }
  if (prefix === 5)                 return { category: 'equity',    normal_balance: 'credit' }

  if (prefix === 6) {
    // 60x = revenue; 62x = COGS (expense); rest default to revenue
    const sub = parseInt(code.slice(0, 2), 10)
    if (sub === 62) return { category: 'expense', normal_balance: 'debit'  }
    return { category: 'revenue', normal_balance: 'credit' }
  }

  if (prefix === 7) return { category: 'expense', normal_balance: 'debit' }

  // Default fallback
  return { category: 'asset', normal_balance: 'debit' }
}

/**
 * Filters trial balance lines by account category (derived from account_code).
 */
export function filterTrialBalanceByCategory(
  lines:    TrialBalanceLine[],
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
): TrialBalanceLine[] {
  return lines.filter(l => classifyAccount(l.account_code).category === category)
}

/**
 * Computes a high-level summary from trial balance lines.
 * net_income = total_revenue - total_expenses
 */
export function computeTrialBalanceSummary(lines: TrialBalanceLine[]): {
  total_assets:      number
  total_liabilities: number
  total_equity:      number
  total_revenue:     number
  total_expenses:    number
  net_income:        number
} {
  const byCategory = (cat: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense') =>
    round2(
      filterTrialBalanceByCategory(lines, cat)
        .reduce((s, l) => s + Math.abs(l.net_balance), 0)
    )

  const total_assets      = byCategory('asset')
  const total_liabilities = byCategory('liability')
  const total_equity      = byCategory('equity')
  const total_revenue     = byCategory('revenue')
  const total_expenses    = byCategory('expense')
  const net_income        = round2(total_revenue - total_expenses)

  return { total_assets, total_liabilities, total_equity, total_revenue, total_expenses, net_income }
}

// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface TrialBalanceCheck {
  name:    string
  passed:  boolean
  detail?: string
  amount?: number
}

export interface TrialBalanceReport {
  trial_balance:    TrialBalance
  checks:           TrialBalanceCheck[]
  all_passed:       boolean
  can_close_period: boolean
  computed_at:      string
}

/**
 * Pure computation: given a TrialBalance snapshot, produce the check results
 * and the `can_close_period` decision. No DB access — safe to unit-test.
 *
 * Exported so it can be tested independently from the DB fetch path.
 */
export function computeTrialBalanceChecks(tb: TrialBalance): {
  checks:           TrialBalanceCheck[]
  all_passed:       boolean
  can_close_period: boolean
} {
  const checks: TrialBalanceCheck[] = []

  // Check 1: trial balance balanced
  checks.push({
    name:    'Mizan dengeli',
    passed:  tb.is_balanced,
    detail:  tb.is_balanced
      ? `Σ DR = Σ CR = ${tb.total_debit_try.toFixed(2)} TL`
      : `Fark: ${tb.imbalance_try.toFixed(2)} TL (DR=${tb.total_debit_try.toFixed(2)}, CR=${tb.total_credit_try.toFixed(2)})`,
    amount:  tb.is_balanced ? undefined : tb.imbalance_try,
  })

  // Check 2: no account has abnormal balance (e.g. 102 Bankalar going negative)
  const suspiciousAccounts = tb.accounts.filter(a => a.balance_try < -0.01)
  checks.push({
    name:   'Anormal bakiye yok',
    passed: suspiciousAccounts.length === 0,
    detail: suspiciousAccounts.length === 0
      ? 'Tüm hesaplarda normal bakiye'
      : `Negatif bakiye: ${suspiciousAccounts.map(a => `${a.account_code} (${a.balance_try.toFixed(2)} TL)`).join(', ')}`,
  })

  // Check 3: 590 (current period profit) = 600 (revenue) - 620 (COGS) - 7xx (expenses) - 780
  const revenue   = tb.accounts.find(a => a.account_code === '600')?.balance_try ?? 0
  const cogs      = tb.accounts.find(a => a.account_code === '620')?.balance_try ?? 0
  const expenses  = tb.accounts
    .filter(a => ['760','770','771','772','773','780'].includes(a.account_code))
    .reduce((s, a) => s + a.balance_try, 0)
  const computedProfit = round2(revenue - cogs - expenses)
  const ledgerProfit   = tb.accounts.find(a => a.account_code === '590')?.balance_try ?? 0
  const profitDiff     = round2(Math.abs(computedProfit - ledgerProfit))

  checks.push({
    name:    'Dönem kârı tutarlı',
    passed:  profitDiff < 1,
    detail:  profitDiff < 1
      ? `Hesaplanan: ${computedProfit.toFixed(2)} TL`
      : `Hesaplanan: ${computedProfit.toFixed(2)} TL vs Defterde: ${ledgerProfit.toFixed(2)} TL (fark: ${profitDiff.toFixed(2)} TL)`,
    amount:  profitDiff >= 1 ? profitDiff : undefined,
  })

  // Check 4: at least some entries exist
  const hasEntries = tb.accounts.some(a => a.debit_try > 0 || a.credit_try > 0)
  checks.push({
    name:   'Journal kayıt mevcut',
    passed: hasEntries,
    detail: hasEntries ? 'En az bir kayıt mevcut' : 'Dönem için hiç journal entry yok',
  })

  const allPassed = checks.every(c => c.passed)
  // canClosePeriod: requires balance + no abnormal balances + at least one entry
  // (empty trial balance is trivially balanced — must not allow phantom period close)
  const noAbnormalAccounts = suspiciousAccounts.length === 0
  const canClosePeriod     = tb.is_balanced && noAbnormalAccounts && hasEntries

  return { checks, all_passed: allPassed, can_close_period: canClosePeriod }
}

export class TrialBalanceService {
  static async compute(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  { periodId?: string | null; asOf?: string | null },
  ): Promise<TrialBalanceReport> {
    const tb = await GeneralLedgerService.trialBalance(companyId, supabase, options)
    const { checks, all_passed, can_close_period } = computeTrialBalanceChecks(tb)

    return {
      trial_balance:    tb,
      checks,
      all_passed,
      can_close_period,
      computed_at:      new Date().toISOString(),
    }
  }
}
