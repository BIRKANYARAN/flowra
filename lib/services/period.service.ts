// ─────────────────────────────────────────────────────────────────────────────
// lib/services/period.service.ts — Accounting Period management
//
// Accounting periods represent closed financial intervals (month/quarter/year).
// A LOCKED period is immutable: no sales, expenses, or partner transactions
// may be created or modified within its date range.
//
// Period lifecycle:
//   open → closed → locked
//   open:   active, editable
//   closed: reviewed, still editable (for corrections)
//   locked: immutable — triggers middleware guard on write operations
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountingPeriod, PeriodStatus, PeriodCloseChecklist } from '@/types/dto'
import { BalanceSheetService } from './balance-sheet.service'
import { TaxService } from './tax.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export class PeriodService {
  /** List all accounting periods for a company, newest first */
  static async list(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<AccountingPeriod[]> {
    const { data, error } = await (supabase as SupabaseClient)
      .from('accounting_periods')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })

    if (error || !data) return []
    return data as AccountingPeriod[]
  }

  /** Get the current open period (if any) */
  static async getCurrent(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<AccountingPeriod | null> {
    const { data } = await (supabase as SupabaseClient)
      .from('accounting_periods')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'open')
      .order('period_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ?? null
  }

  /** Check whether a date falls within any locked period */
  static async isDateLocked(
    companyId: string,
    date:      string,   // YYYY-MM-DD
    supabase:  AnyClient,
  ): Promise<boolean> {
    const { data } = await (supabase as SupabaseClient)
      .from('accounting_periods')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'locked')
      .lte('period_start', date)
      .gte('period_end',   date)
      .limit(1)
      .maybeSingle()
    return !!data
  }

  /** Build the close checklist for a period */
  static async buildCloseChecklist(
    userId:    string,
    companyId: string,
    period:    AccountingPeriod,
    supabase:  AnyClient,
  ): Promise<PeriodCloseChecklist> {
    const { from, to } = { from: period.period_start, to: period.period_end }

    // Check: any unreconciled expenses (no payment_status set)?
    const { count: unpaidCount } = await (supabase as SupabaseClient)
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .is('payment_status', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    // Check: balance sheet balanced?
    let balance_sheet_balanced = false
    try {
      const bs = await BalanceSheetService.compute(userId, companyId, to, supabase)
      balance_sheet_balanced = bs.balanced
    } catch {}

    // Check: tax summary approved (proxy: no null expense_type in period)
    const { count: nullTypeCount } = await (supabase as SupabaseClient)
      .from('expenses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .is('expense_type', null)
      .gte('expense_date', from)
      .lte('expense_date', to)

    const checklist: PeriodCloseChecklist = {
      bank_reconciled:        true,                 // manual step — always shown as TODO
      expenses_complete:      (unpaidCount ?? 0) === 0,
      tax_summary_approved:   (nullTypeCount ?? 0) === 0,
      balance_sheet_balanced,
      ready_to_close:         false,
    }
    checklist.ready_to_close = (
      checklist.expenses_complete &&
      checklist.tax_summary_approved &&
      checklist.balance_sheet_balanced
    )
    return checklist
  }

  /** Transition a period's status */
  static async updateStatus(
    companyId:  string,
    periodId:   string,
    status:     PeriodStatus,
    userId:     string,
    supabase:   AnyClient,
  ): Promise<void> {
    const patch: Record<string, unknown> = { status }
    if (status === 'closed' || status === 'locked') {
      patch.closed_at = new Date().toISOString()
      patch.closed_by = userId
    }
    const { error } = await (supabase as SupabaseClient)
      .from('accounting_periods')
      .update(patch)
      .eq('id', periodId)
      .eq('company_id', companyId)
    if (error) throw new Error(`Period status update failed: ${error.message}`)
  }

  /** Open a new accounting period */
  static async openPeriod(
    companyId:    string,
    periodStart:  string,   // YYYY-MM-DD
    periodEnd:    string,   // YYYY-MM-DD
    openingCash:  number,
    retainedEarningsBF: number,
    supabase:     AnyClient,
  ): Promise<AccountingPeriod> {
    const { data, error } = await (supabase as SupabaseClient)
      .from('accounting_periods')
      .insert({
        company_id:                          companyId,
        period_start:                        periodStart,
        period_end:                          periodEnd,
        status:                              'open' as PeriodStatus,
        opening_cash_try:                    openingCash,
        closing_cash_try:                    openingCash,
        retained_earnings_brought_forward:   retainedEarningsBF,
        period_profit_try:                   0,
        retained_earnings_carried_forward:   retainedEarningsBF,
      })
      .select('*')
      .single()
    if (error) throw new Error(`Open period failed: ${error.message}`)
    return data as AccountingPeriod
  }
}
