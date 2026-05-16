// Trial Balance Service — invariant checks + formatted output for CFO

import { GeneralLedgerService, type TrialBalance } from './general-ledger.service'
import { round2 } from '@/lib/calc'

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

export class TrialBalanceService {
  static async compute(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  { periodId?: string | null; asOf?: string | null },
  ): Promise<TrialBalanceReport> {
    const tb = await GeneralLedgerService.trialBalance(companyId, supabase, options)

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

    const allPassed      = checks.every(c => c.passed)
    const canClosePeriod = tb.is_balanced && checks[1].passed  // balance + no abnormal

    return {
      trial_balance:    tb,
      checks,
      all_passed:       allPassed,
      can_close_period: canClosePeriod,
      computed_at:      new Date().toISOString(),
    }
  }
}
