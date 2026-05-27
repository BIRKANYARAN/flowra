// ─────────────────────────────────────────────────────────────────────────────
// lib/services/ledger/bank-reconciliation.service.ts
//
// Bank Reconciliation — compares the system's computed cash position
// (from sales collections + expense payments) against reported bank balances,
// and flags unreconciled items.
//
// No bank_accounts / bank_balances table exists in the current schema.
// When it's absent, the service creates a single synthetic "Genel Kasa" line
// using book balance as both book and bank (discrepancy = 0).
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ── Types ──────────────────────────────────────────────────────────────────────

export type DiscrepancySeverity = 'clean' | 'minor' | 'moderate' | 'material'

export interface ReconciliationLine {
  account_name: string
  book_balance_try: number        // computed from system data
  bank_balance_try: number        // reported / input balance
  discrepancy_try: number
  discrepancy_severity: DiscrepancySeverity
  reconciliation_pct: number
  is_reconciled: boolean          // discrepancy_severity === 'clean'
}

export interface BankReconciliationReport {
  as_of_date: string
  total_book_balance_try: number
  total_bank_balance_try: number
  total_discrepancy_try: number
  overall_severity: DiscrepancySeverity
  overall_reconciliation_pct: number
  lines: ReconciliationLine[]
  unreconciled_count: number
  last_reconciled_at: string | null
  /** True when no bank_accounts table exists and bank data is absent. */
  book_only_mode: boolean
}

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Compute discrepancy: book_balance - bank_balance.
 * Positive → more cash recorded in books than bank reports.
 * Negative → bank has more than books.
 */
export function computeReconciliationDiscrepancy(
  bookBalanceTry: number,
  bankBalanceTry: number,
): number {
  return round2(bookBalanceTry - bankBalanceTry)
}

/**
 * Classify discrepancy severity by absolute magnitude:
 *   |discrepancy| < 100      → 'clean'
 *   100 – 1 000              → 'minor'
 *   1 001 – 10 000           → 'moderate'
 *   > 10 000                 → 'material'
 */
export function classifyDiscrepancy(discrepancyTry: number): DiscrepancySeverity {
  const abs = Math.abs(discrepancyTry)
  if (abs < 100)    return 'clean'
  if (abs <= 1000)  return 'minor'
  if (abs <= 10000) return 'moderate'
  return 'material'
}

/**
 * Compute reconciliation percentage:
 *   (1 - |discrepancy| / max(book, bank)) × 100
 * Special case: if both are 0 → 100 (perfectly reconciled).
 */
export function computeReconciliationPct(
  bookBalanceTry: number,
  bankBalanceTry: number,
): number {
  const denominator = Math.max(Math.abs(bookBalanceTry), Math.abs(bankBalanceTry))
  if (denominator === 0) return 100
  const discrepancy = Math.abs(computeReconciliationDiscrepancy(bookBalanceTry, bankBalanceTry))
  return round2(Math.max(0, (1 - discrepancy / denominator) * 100))
}

/**
 * Build a single reconciliation line from the given inputs.
 */
export function buildReconciliationLine(
  accountName: string,
  bookBalanceTry: number,
  bankBalanceTry: number,
): ReconciliationLine {
  const discrepancy_try      = computeReconciliationDiscrepancy(bookBalanceTry, bankBalanceTry)
  const discrepancy_severity = classifyDiscrepancy(discrepancy_try)
  const reconciliation_pct   = computeReconciliationPct(bookBalanceTry, bankBalanceTry)

  return {
    account_name:      accountName,
    book_balance_try:  round2(bookBalanceTry),
    bank_balance_try:  round2(bankBalanceTry),
    discrepancy_try,
    discrepancy_severity,
    reconciliation_pct,
    is_reconciled: discrepancy_severity === 'clean',
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BankReconciliationService {
  constructor(private readonly supabase: AnySupabaseClient) {}

  /**
   * Build a BankReconciliationReport.
   *
   * - Computes book balance from: Σ paid sales − Σ paid expenses − Σ finalized purchases
   * - Attempts to join against a bank_accounts / bank_balances table;
   *   falls back to book-only mode ("Genel Kasa") when those tables don't exist.
   */
  async getReport(
    companyId: string,
    asOfDate?: string,
  ): Promise<BankReconciliationReport> {
    const today = asOfDate ?? new Date().toISOString().slice(0, 10)

    // ── 1. Compute book balance from operational tables ─────────────────────

    const [salesRes, expensesRes, purchasesRes] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('amount_paid_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('sale_date', today),

      this.supabase
        .from('expenses')
        .select('amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('expense_date', today),

      this.supabase
        .from('purchases')
        .select('total_try, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('purchase_date', today),
    ])

    const sales    = salesRes.status    === 'fulfilled' ? (salesRes.value.data    ?? []) : []
    const expenses = expensesRes.status === 'fulfilled' ? (expensesRes.value.data ?? []) : []
    const purchases = purchasesRes.status === 'fulfilled' ? (purchasesRes.value.data ?? []) : []

    // Σ paid sales — prefer amount_paid_try; fall back to 0 for unpaid
    const totalPaidSales = (sales as Array<{ amount_paid_try: number | null; payment_status: string }>)
      .reduce((s, r) => {
        const paid = Number(r.amount_paid_try) || 0
        return s + paid
      }, 0)

    // Σ paid expenses (payment_status = 'paid' | 'partial' | null treated as paid)
    const totalPaidExpenses = (expenses as Array<{ amount_try: number; payment_status: string | null }>)
      .filter(e => e.payment_status === 'paid' || e.payment_status === 'partial' || e.payment_status == null)
      .reduce((s, e) => s + (Number(e.amount_try) || 0), 0)

    // Σ finalized purchases (status = 'received' | 'finalized' | 'completed')
    const totalPaidPurchases = (purchases as Array<{ total_try: number; status: string | null }>)
      .filter(p => ['received', 'finalized', 'completed'].includes(p.status ?? ''))
      .reduce((s, p) => s + (Number(p.total_try) || 0), 0)

    const bookBalance = round2(totalPaidSales - totalPaidExpenses - totalPaidPurchases)

    // ── 2. Try to load bank accounts ────────────────────────────────────────

    const { data: bankAccounts, error: bankError } = await this.supabase
      .from('bank_accounts')
      .select('id, account_name, balance_try, last_reconciled_at')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('account_name')

    const hasBankTable = !bankError
    const bankRows = (bankAccounts ?? []) as Array<{
      id: string
      account_name: string
      balance_try: number
      last_reconciled_at: string | null
    }>

    // ── 3. Build reconciliation lines ───────────────────────────────────────

    let lines: ReconciliationLine[]
    let lastReconciledAt: string | null = null
    let bookOnlyMode = false

    if (hasBankTable && bankRows.length > 0) {
      // Join mode: one line per bank account, proportional book split not possible
      // without per-account mapping — use each account's reported balance vs total book.
      // For the single total line, bank = sum of all bank account balances.
      const totalBankBalance = bankRows.reduce((s, a) => s + (Number(a.balance_try) || 0), 0)

      // Find the most recent last_reconciled_at across all accounts
      const reconDates = bankRows
        .map(a => a.last_reconciled_at)
        .filter(Boolean) as string[]
      if (reconDates.length > 0) {
        lastReconciledAt = reconDates.sort().reverse()[0]
      }

      if (bankRows.length === 1) {
        // One account — direct comparison
        lines = [
          buildReconciliationLine(
            bankRows[0].account_name,
            bookBalance,
            round2(totalBankBalance),
          ),
        ]
      } else {
        // Multiple accounts: show individual lines using each account's bank balance,
        // and distribute book balance proportionally
        const totalBankForProration = totalBankBalance > 0 ? totalBankBalance : 1
        lines = bankRows.map(account => {
          const bankBal  = round2(Number(account.balance_try) || 0)
          const bookProp = round2(bookBalance * (bankBal / totalBankForProration))
          return buildReconciliationLine(account.account_name, bookProp, bankBal)
        })

        // Append a summary total line
        lines.push(buildReconciliationLine('TOPLAM', bookBalance, round2(totalBankBalance)))
      }
    } else {
      // Fallback: book-only mode — no bank_accounts table or no accounts
      bookOnlyMode = true
      lines = [
        buildReconciliationLine('Genel Kasa', bookBalance, bookBalance),
      ]
    }

    // ── 4. Aggregate totals ─────────────────────────────────────────────────

    // Exclude the synthetic TOPLAM line from aggregate (avoid double-counting)
    const dataLines = lines.filter(l => l.account_name !== 'TOPLAM')

    const totalBookBalance = round2(dataLines.reduce((s, l) => s + l.book_balance_try, 0))
    const totalBankBalance = round2(dataLines.reduce((s, l) => s + l.bank_balance_try, 0))
    const totalDiscrepancy = computeReconciliationDiscrepancy(totalBookBalance, totalBankBalance)
    const overallSeverity  = classifyDiscrepancy(totalDiscrepancy)
    const overallPct       = computeReconciliationPct(totalBookBalance, totalBankBalance)
    const unreconciledCount = dataLines.filter(l => !l.is_reconciled).length

    return {
      as_of_date:                today,
      total_book_balance_try:    totalBookBalance,
      total_bank_balance_try:    totalBankBalance,
      total_discrepancy_try:     totalDiscrepancy,
      overall_severity:          overallSeverity,
      overall_reconciliation_pct: overallPct,
      lines,
      unreconciled_count:        unreconciledCount,
      last_reconciled_at:        lastReconciledAt,
      book_only_mode:            bookOnlyMode,
    }
  }
}
