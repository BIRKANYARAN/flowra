// General Ledger Service — account balance projection from journal_entries
// All financial statements derive from here in GL-primary mode.

import { round2 } from '@/lib/calc'
import {
  CHART_OF_ACCOUNTS,
  accountsByClass,
  type AccountClass,
  type AccountDefinition,
} from '@/lib/accounting/chart-of-accounts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface GLAccountBalance {
  account_code:   string
  account_name:   string
  account_name_tr: string
  class:          AccountClass
  debit_try:      number
  credit_try:     number
  balance_try:    number  // debit_normal: debit-credit; credit_normal: credit-debit
  normal_balance: 'debit' | 'credit'
}

export interface GLSnapshot {
  company_id:    string
  as_of:         string | null    // null = all time
  period_id?:    string | null
  accounts:      GLAccountBalance[]
  computed_at:   string
}

export interface TrialBalance {
  company_id:       string
  period_id?:       string | null
  accounts:         GLAccountBalance[]
  total_debit_try:  number
  total_credit_try: number
  is_balanced:      boolean
  imbalance_try:    number
}

export class GeneralLedgerService {
  // Compute GL account balances for a company, optionally filtered by period
  static async compute(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?: {
      periodId?:  string | null
      asOf?:      string | null   // YYYY-MM-DD: include only entries up to this date
      fromDate?:  string | null
    },
  ): Promise<GLSnapshot> {
    let query = supabase
      .from('journal_entry_lines')
      .select(`
        account_code,
        account_name,
        debit_try,
        credit_try,
        journal_entries!inner (
          company_id,
          period_id,
          entry_date,
          is_voided
        )
      `)
      .eq('journal_entries.company_id', companyId)
      .eq('journal_entries.is_voided', false)

    if (options?.periodId) {
      query = query.eq('journal_entries.period_id', options.periodId)
    }
    if (options?.asOf) {
      query = query.lte('journal_entries.entry_date', options.asOf)
    }
    if (options?.fromDate) {
      query = query.gte('journal_entries.entry_date', options.fromDate)
    }

    const { data, error } = await query
    if (error) throw new Error(`GL compute error: ${error.message}`)

    const rows = (data ?? []) as Array<{
      account_code: string
      account_name: string
      debit_try:    number
      credit_try:   number
    }>

    // Aggregate by account_code
    const aggregated = new Map<string, { dr: number; cr: number; name: string }>()
    for (const row of rows) {
      const existing = aggregated.get(row.account_code) ?? { dr: 0, cr: 0, name: row.account_name }
      existing.dr += Number(row.debit_try)  || 0
      existing.cr += Number(row.credit_try) || 0
      aggregated.set(row.account_code, existing)
    }

    // Build full account list (include zero-balance accounts from CoA)
    const accountMap = new Map(CHART_OF_ACCOUNTS.map(a => [a.code, a]))

    // Merge: CoA accounts + any accounts in journal entries not in CoA
    const allCodes = new Set([...accountMap.keys(), ...aggregated.keys()])
    const accounts: GLAccountBalance[] = []

    for (const code of allCodes) {
      const definition: AccountDefinition | undefined = accountMap.get(code)
      const agg = aggregated.get(code) ?? { dr: 0, cr: 0, name: '' }
      const dr  = round2(agg.dr)
      const cr  = round2(agg.cr)
      const normalBalance = definition?.normal_balance ?? 'debit'
      const balance = normalBalance === 'debit' ? round2(dr - cr) : round2(cr - dr)

      accounts.push({
        account_code:    code,
        account_name:    definition?.name    ?? agg.name,
        account_name_tr: definition?.name_tr ?? agg.name,
        class:           definition?.class   ?? 'operating_expense',
        debit_try:       dr,
        credit_try:      cr,
        balance_try:     balance,
        normal_balance:  normalBalance,
      })
    }

    // Sort by account code
    accounts.sort((a, b) => a.account_code.localeCompare(b.account_code))

    return {
      company_id:  companyId,
      as_of:       options?.asOf ?? null,
      period_id:   options?.periodId ?? null,
      accounts,
      computed_at: new Date().toISOString(),
    }
  }

  // Trial balance: same as GL but with balance check
  static async trialBalance(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?: { periodId?: string | null; asOf?: string | null },
  ): Promise<TrialBalance> {
    const gl = await GeneralLedgerService.compute(companyId, supabase, options)

    const totalDr = round2(gl.accounts.reduce((s, a) => s + a.debit_try,  0))
    const totalCr = round2(gl.accounts.reduce((s, a) => s + a.credit_try, 0))
    const imbalance = round2(Math.abs(totalDr - totalCr))

    return {
      company_id:       companyId,
      period_id:        options?.periodId ?? null,
      accounts:         gl.accounts,
      total_debit_try:  totalDr,
      total_credit_try: totalCr,
      is_balanced:      imbalance < 0.01,
      imbalance_try:    imbalance,
    }
  }

  // Convenience: get balance of specific account codes
  static async accountBalance(
    companyId:    string,
    accountCodes: string[],
    supabase:     AnySupabaseClient,
    options?:     { periodId?: string | null; asOf?: string | null },
  ): Promise<Map<string, number>> {
    const gl      = await GeneralLedgerService.compute(companyId, supabase, options)
    const result  = new Map<string, number>()
    for (const acc of gl.accounts) {
      if (accountCodes.includes(acc.account_code)) {
        result.set(acc.account_code, acc.balance_try)
      }
    }
    return result
  }

  // Aggregate balance by account class
  static classBalance(gl: GLSnapshot, cls: AccountClass): number {
    const defs = accountsByClass(cls).map(a => a.code)
    return round2(
      gl.accounts
        .filter(a => defs.includes(a.account_code))
        .reduce((s, a) => s + a.balance_try, 0)
    )
  }
}
