// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/reconciliation.service.ts
//
// Bank Statement Reconciliation Service
//
// Matches bank statement lines against Flowra sale payments and expense
// payments to identify discrepancies for Turkish SME accountants.
//
// Auto-matching confidence scoring:
//   amount match ±5%      → +0.5
//   date match ±3 days    → +0.3
//   name in description   → +0.2
//   Threshold ≥ 0.7 → auto-matched
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public Types ──────────────────────────────────────────────────────────────

export interface BankStatementLine {
  id: string
  company_id: string
  statement_date: string
  value_date: string | null
  description: string
  amount_try: number
  reference: string | null
  counterparty: string | null
  transaction_type: 'credit' | 'debit' | 'unknown'
  match_status: 'unmatched' | 'matched' | 'manual_match' | 'excluded'
  matched_resource_type: string | null
  matched_resource_id: string | null
  match_confidence: number | null
  period_from: string
  period_to: string
  created_at: string
}

export interface ReconciliationCandidate {
  resource_type: 'sale_payment' | 'expense_payment' | 'partner_loan'
  resource_id: string
  description: string
  amount_try: number
  date: string
  customer_or_supplier: string | null
  match_confidence: number
}

export interface ReconciliationReport {
  period_from: string
  period_to: string
  computed_at: string

  // Counts
  bank_lines_total: number
  bank_lines_matched: number
  bank_lines_unmatched: number
  bank_lines_excluded: number

  // Flowra records in this period
  flowra_inflows_total: number
  flowra_inflows_matched: number
  flowra_outflows_total: number
  flowra_outflows_matched: number

  // Amounts
  bank_credits_try: number
  bank_debits_try: number
  flowra_inflows_try: number
  flowra_outflows_try: number

  // Discrepancies
  unmatched_bank_lines: BankStatementLine[]
  unmatched_flowra_inflows: Array<{
    id: string
    date: string
    amount_try: number
    customer_name: string | null
    payment_status: string
  }>
  unmatched_flowra_outflows: Array<{
    id: string
    date: string
    amount_try: number
    expense_type: string
    payment_status: string
  }>

  // Status
  reconciliation_status: 'reconciled' | 'minor_discrepancies' | 'major_discrepancies' | 'not_started'
  discrepancy_amount_try: number
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Days between two YYYY-MM-DD strings */
function daysDiff(a: string, b: string): number {
  const msPerDay = 86_400_000
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / msPerDay
}

/** Amount match: within ±5% → +0.5 */
function amountScore(bankAmt: number, recordAmt: number): number {
  if (bankAmt === 0) return 0
  const pct = Math.abs(bankAmt - recordAmt) / Math.abs(bankAmt)
  return pct <= 0.05 ? 0.5 : 0
}

/** Date match: within ±3 days → +0.3 */
function dateScore(bankDate: string, recordDate: string): number {
  return daysDiff(bankDate, recordDate) <= 3 ? 0.3 : 0
}

/** Name in description → +0.2 */
function nameScore(description: string, name: string | null | undefined): number {
  if (!name) return 0
  const desc = description.toLowerCase()
  const nm   = name.toLowerCase()
  // Check each word of the name (≥4 chars) to avoid false positives on "Ltd"
  const words = nm.split(/\s+/).filter(w => w.length >= 4)
  if (words.length === 0) return desc.includes(nm) ? 0.2 : 0
  return words.some(w => desc.includes(w)) ? 0.2 : 0
}

/** Determine reconciliation status from discrepancy relative to total volume */
function computeStatus(
  bankLinesTotal: number,
  bankLinesMatched: number,
  discrepancyTry: number,
  bankCreditsTry: number,
  bankDebitsTry: number,
): 'reconciled' | 'minor_discrepancies' | 'major_discrepancies' | 'not_started' {
  if (bankLinesTotal === 0) return 'not_started'

  const totalVolume = bankCreditsTry + bankDebitsTry
  const unmatchedCount = bankLinesTotal - bankLinesMatched

  if (unmatchedCount === 0 && discrepancyTry < 1) return 'reconciled'

  if (totalVolume > 0) {
    const discrepancyPct = discrepancyTry / totalVolume
    if (discrepancyPct < 0.05) return 'minor_discrepancies'
  } else if (unmatchedCount === 0) {
    return 'reconciled'
  }

  return 'major_discrepancies'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BankReconciliationService {
  static readonly AUTO_MATCH_THRESHOLD = 0.7

  // ── getReport ───────────────────────────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    period: { from: string; to: string },
  ): Promise<ReconciliationReport> {
    const [bankRes, salesRes, expensesRes] = await Promise.all([
      supabase
        .from('bank_statement_lines')
        .select('*')
        .eq('company_id', companyId)
        .gte('statement_date', period.from)
        .lte('statement_date', period.to),
      supabase
        .from('sales')
        .select('id, sale_date, total, paid_amount, payment_status, customer_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['paid', 'partial'])
        .gte('sale_date', period.from)
        .lte('sale_date', period.to),
      supabase
        .from('expenses')
        // expenses has no supplier_name — `title` is the payee/expense name (aliased)
        .select('id, expense_date, amount_try, payment_status, expense_type, supplier_name:title')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),
    ])

    const bankLines: BankStatementLine[] = bankRes.data ?? []
    const sales     = salesRes.data    ?? []
    const expenses  = expensesRes.data ?? []

    // Collect matched sale/expense IDs from bank lines
    const matchedSaleIds = new Set(
      bankLines
        .filter(l => l.match_status !== 'unmatched' && l.matched_resource_type === 'sale_payment' && l.matched_resource_id)
        .map(l => l.matched_resource_id as string),
    )
    const matchedExpenseIds = new Set(
      bankLines
        .filter(l => l.match_status !== 'unmatched' && l.matched_resource_type === 'expense_payment' && l.matched_resource_id)
        .map(l => l.matched_resource_id as string),
    )

    // Bank line aggregates
    const matchedLines   = bankLines.filter(l => l.match_status === 'matched' || l.match_status === 'manual_match')
    const unmatchedLines = bankLines.filter(l => l.match_status === 'unmatched')
    const excludedLines  = bankLines.filter(l => l.match_status === 'excluded')

    const bankCreditsTry = bankLines
      .filter(l => Number(l.amount_try) > 0)
      .reduce((s, l) => s + Number(l.amount_try), 0)
    const bankDebitsTry  = bankLines
      .filter(l => Number(l.amount_try) < 0)
      .reduce((s, l) => s + Math.abs(Number(l.amount_try)), 0)

    // Flowra aggregates
    const flowraInflowsTry  = sales.reduce((s: number, r: { total: number }) => s + (Number(r.total) || 0), 0)
    const flowraOutflowsTry = expenses.reduce((s: number, r: { amount_try: number }) => s + (Number(r.amount_try) || 0), 0)

    const unmatchedFlowraInflows = sales
      .filter((s: { id: string }) => !matchedSaleIds.has(s.id))
      .map((s: { id: string; sale_date: string; total: number; payment_status: string }) => ({
        id:             s.id,
        date:           s.sale_date,
        amount_try:     Number(s.total) || 0,
        customer_name:  null as string | null,
        payment_status: s.payment_status,
      }))

    const unmatchedFlowraOutflows = expenses
      .filter((e: { id: string }) => !matchedExpenseIds.has(e.id))
      .map((e: { id: string; expense_date: string; amount_try: number; expense_type: string; payment_status: string }) => ({
        id:             e.id,
        date:           e.expense_date,
        amount_try:     Number(e.amount_try) || 0,
        expense_type:   e.expense_type ?? 'other',
        payment_status: e.payment_status,
      }))

    // Discrepancy: |bank_net - flowra_net|
    const bankNet    = bankCreditsTry - bankDebitsTry
    const flowraNet  = flowraInflowsTry - flowraOutflowsTry
    const discrepancy = Math.abs(bankNet - flowraNet)

    const status = computeStatus(
      bankLines.length,
      matchedLines.length,
      discrepancy,
      bankCreditsTry,
      bankDebitsTry,
    )

    return {
      period_from:  period.from,
      period_to:    period.to,
      computed_at:  new Date().toISOString(),

      bank_lines_total:    bankLines.length,
      bank_lines_matched:  matchedLines.length,
      bank_lines_unmatched: unmatchedLines.length,
      bank_lines_excluded: excludedLines.length,

      flowra_inflows_total:   sales.length,
      flowra_inflows_matched: matchedSaleIds.size,
      flowra_outflows_total:  expenses.length,
      flowra_outflows_matched: matchedExpenseIds.size,

      bank_credits_try:   bankCreditsTry,
      bank_debits_try:    bankDebitsTry,
      flowra_inflows_try: flowraInflowsTry,
      flowra_outflows_try: flowraOutflowsTry,

      unmatched_bank_lines:      unmatchedLines,
      unmatched_flowra_inflows:  unmatchedFlowraInflows,
      unmatched_flowra_outflows: unmatchedFlowraOutflows,

      reconciliation_status: status,
      discrepancy_amount_try: Math.round(discrepancy * 100) / 100,
    }
  }

  // ── importLines ─────────────────────────────────────────────────────────────

  static async importLines(
    companyId: string,
    userId: string,
    supabase: AnyClient,
    lines: Array<Omit<BankStatementLine, 'id' | 'company_id' | 'match_status' | 'matched_resource_type' | 'matched_resource_id' | 'matched_at' | 'matched_by' | 'match_confidence' | 'created_at'>>,
  ): Promise<{ imported: number; auto_matched: number }> {
    if (lines.length === 0) return { imported: 0, auto_matched: 0 }

    // Insert lines
    const toInsert = lines.map(l => ({
      ...l,
      company_id:   companyId,
      created_by:   userId,
      match_status: 'unmatched' as const,
    }))

    const { data: inserted, error } = await supabase
      .from('bank_statement_lines')
      .insert(toInsert)
      .select('id, statement_date, amount_try, description, counterparty, transaction_type, match_status')

    if (error) throw new Error(`Import failed: ${error.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertedLines: any[] = inserted ?? []
    let autoMatched = 0

    // Auto-match each line
    for (const line of insertedLines) {
      const candidates = await BankReconciliationService.autoMatchLine(
        line.id as string,
        companyId,
        supabase,
        line as Partial<BankStatementLine>,
      )
      if (candidates.length > 0 && candidates[0].match_confidence >= BankReconciliationService.AUTO_MATCH_THRESHOLD) {
        const best = candidates[0]
        await supabase
          .from('bank_statement_lines')
          .update({
            match_status:           'matched',
            matched_resource_type:  best.resource_type,
            matched_resource_id:    best.resource_id,
            matched_at:             new Date().toISOString(),
            matched_by:             userId,
            match_confidence:       best.match_confidence,
          })
          .eq('id', line.id)
          .eq('company_id', companyId)
        autoMatched++
      }
    }

    return { imported: insertedLines.length, auto_matched: autoMatched }
  }

  // ── autoMatchLine ────────────────────────────────────────────────────────────

  static async autoMatchLine(
    bankLineId: string,
    companyId: string,
    supabase: AnyClient,
    // Optional pre-loaded line to avoid an extra DB read
    preloadedLine?: Partial<BankStatementLine>,
  ): Promise<ReconciliationCandidate[]> {
    let line: BankStatementLine

    if (preloadedLine?.statement_date && preloadedLine.amount_try !== undefined) {
      line = preloadedLine as BankStatementLine
    } else {
      const { data, error } = await supabase
        .from('bank_statement_lines')
        .select('*')
        .eq('id', bankLineId)
        .eq('company_id', companyId)
        .single()
      if (error || !data) return []
      line = data as BankStatementLine
    }

    const bankDate = line.statement_date
    const bankAmt  = Number(line.amount_try)
    const isCredit = bankAmt > 0

    // Date window: ±7 days
    const windowFrom = new Date(new Date(bankDate).getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    const windowTo   = new Date(new Date(bankDate).getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

    const candidates: ReconciliationCandidate[] = []

    if (isCredit) {
      // Look in sales
      const { data: sales } = await supabase
        .from('sales')
        .select('id, sale_date, total, paid_amount, payment_status, customer_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['paid', 'partial'])
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo)

      for (const s of (sales ?? [])) {
        const amt     = Number(s.paid_amount ?? s.total) || 0
        const conf    = amountScore(bankAmt, amt)
                      + dateScore(bankDate, s.sale_date)
                      + nameScore(line.description, line.counterparty)
        candidates.push({
          resource_type:        'sale_payment',
          resource_id:          s.id,
          description:          `Satış #${s.id.slice(0, 8)}`,
          amount_try:           amt,
          date:                 s.sale_date,
          customer_or_supplier: null,
          match_confidence:     Math.round(conf * 100) / 100,
        })
      }
    } else {
      // Look in expenses (debit — outflow)
      const { data: expenses } = await supabase
        .from('expenses')
        // expenses has no supplier_name — `title` is the payee/expense name (aliased)
        .select('id, expense_date, amount_try, expense_type, supplier_name:title')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'paid')
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo)

      for (const e of (expenses ?? [])) {
        const amt  = Number(e.amount_try) || 0
        const conf = amountScore(Math.abs(bankAmt), amt)
                   + dateScore(bankDate, e.expense_date)
                   + nameScore(line.description, e.supplier_name ?? e.expense_type)
        candidates.push({
          resource_type:        'expense_payment',
          resource_id:          e.id,
          description:          e.expense_type ?? 'Gider',
          amount_try:           amt,
          date:                 e.expense_date,
          customer_or_supplier: e.supplier_name ?? null,
          match_confidence:     Math.round(conf * 100) / 100,
        })
      }
    }

    return candidates.sort((a, b) => b.match_confidence - a.match_confidence)
  }

  // ── confirmMatch ─────────────────────────────────────────────────────────────

  static async confirmMatch(
    bankLineId: string,
    companyId: string,
    userId: string,
    resourceType: string,
    resourceId: string,
    supabase: AnyClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('bank_statement_lines')
      .update({
        match_status:          'manual_match',
        matched_resource_type: resourceType,
        matched_resource_id:   resourceId,
        matched_at:            new Date().toISOString(),
        matched_by:            userId,
      })
      .eq('id', bankLineId)
      .eq('company_id', companyId)
    if (error) throw new Error(`confirmMatch failed: ${error.message}`)
  }

  // ── excludeLine ──────────────────────────────────────────────────────────────

  static async excludeLine(
    bankLineId: string,
    companyId: string,
    userId: string,
    supabase: AnyClient,
  ): Promise<void> {
    const { error } = await supabase
      .from('bank_statement_lines')
      .update({
        match_status: 'excluded',
        matched_by:   userId,
        matched_at:   new Date().toISOString(),
      })
      .eq('id', bankLineId)
      .eq('company_id', companyId)
    if (error) throw new Error(`excludeLine failed: ${error.message}`)
  }
}

// ── Pure computation helpers (exported for tests) ─────────────────────────────

export { computeStatus, amountScore, dateScore, nameScore, daysDiff }
