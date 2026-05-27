// GL Reconciliation Service — compares GL journal entries with operational tables
// to detect any drift between the accounting truth layer and operational reality.
// This is a CFO audit tool designed for gl_mode = 'parallel' (both systems run simultaneously).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconciliationStatus = 'balanced' | 'discrepancy' | 'no_gl_data' | 'skipped'

export interface ReconciliationItem {
  label: string                      // Turkish label
  gl_amount: number | null
  ops_amount: number | null
  discrepancy: number | null         // gl - ops; null if either side missing
  discrepancy_pct: number | null
  status: ReconciliationStatus
  threshold_try: number              // acceptable tolerance
  notes?: string
}

export interface TrialBalanceCheck {
  total_debits: number
  total_credits: number
  imbalance: number                  // should be 0
  is_balanced: boolean               // |imbalance| < 1 TRY
  entry_count: number
  line_count: number
}

export interface GlReconciliationReport {
  company_id: string
  period_id: string | null           // null = all time / current period
  period_label: string
  // Items
  items: ReconciliationItem[]
  trial_balance: TrialBalanceCheck
  // Summary
  all_balanced: boolean              // all items with status='balanced'
  discrepancy_count: number
  total_discrepancy_try: number      // sum of |discrepancy| across all items
  gl_mode: string                    // 'parallel' | 'shadow' | 'primary'
  // Guidance
  status_label: string               // Turkish
  action_required: boolean
  computed_at: string
}

// ── Pure functions (exported for testing) ─────────────────────────────────────

/** GL minus Ops discrepancy. Returns null if either side is missing. */
export function computeDiscrepancy(gl: number | null, ops: number | null): number | null {
  if (gl === null || ops === null) return null
  return gl - ops
}

/** Percentage discrepancy relative to ops. Returns null when ops === 0. */
export function computeDiscrepancyPct(gl: number, ops: number): number | null {
  if (ops === 0) return null
  return ((gl - ops) / Math.abs(ops)) * 100
}

/** Assign reconciliation status based on discrepancy magnitude vs threshold. */
export function assignReconciliationStatus(
  discrepancy: number | null,
  threshold: number,
): ReconciliationStatus {
  if (discrepancy === null) return 'no_gl_data'
  if (Math.abs(discrepancy) <= threshold) return 'balanced'
  return 'discrepancy'
}

/** Turkish status label for the overall report. */
export function buildStatusLabel(allBalanced: boolean, discrepancyCount: number): string {
  if (allBalanced) return 'Dengeli'
  return `${discrepancyCount} Uyuşmazlık Tespit Edildi`
}

// ── Service ───────────────────────────────────────────────────────────────────

export class GlReconciliationService {
  /**
   * Compute a full GL reconciliation report comparing journal entry aggregates
   * against the operational tables (sales, expenses).
   */
  static async compute(
    companyId: string,
    supabase: AnySupabaseClient,
    options?: {
      periodId?: string | null
      fromDate?: string | null
      toDate?: string | null
    },
  ): Promise<GlReconciliationReport> {

    // ── 1. Detect gl_mode from companies table ────────────────────────────────
    const glMode = await GlReconciliationService.detectGlMode(companyId, supabase)

    // ── 2. Fetch all GL lines for this company/period ─────────────────────────
    const { glLines, entryCount, lineCount } = await GlReconciliationService.fetchGlLines(
      companyId, supabase, options,
    )

    const periodLabel = GlReconciliationService.buildPeriodLabel(options)

    // If no GL data at all — return a no_gl_data report
    if (glLines.length === 0) {
      const noDataItem = (label: string, threshold: number): ReconciliationItem => ({
        label,
        gl_amount: null,
        ops_amount: null,
        discrepancy: null,
        discrepancy_pct: null,
        status: 'no_gl_data',
        threshold_try: threshold,
        notes: 'Journal entry bulunamadı — GL henüz doldurulmamış olabilir.',
      })

      const trialBalance: TrialBalanceCheck = {
        total_debits: 0,
        total_credits: 0,
        imbalance: 0,
        is_balanced: true,
        entry_count: 0,
        line_count: 0,
      }

      return {
        company_id: companyId,
        period_id: options?.periodId ?? null,
        period_label: periodLabel,
        items: [
          noDataItem('Gelir (6xx)', 100),
          noDataItem('Giderler (7xx)', 100),
          noDataItem('Alacaklar (12x)', 100),
          noDataItem('Nakit (102)', 100),
        ],
        trial_balance: trialBalance,
        all_balanced: false,
        discrepancy_count: 0,
        total_discrepancy_try: 0,
        gl_mode: glMode,
        status_label: 'GL Verisi Yok',
        action_required: false,
        computed_at: new Date().toISOString(),
      }
    }

    // ── 3. Aggregate GL side ──────────────────────────────────────────────────
    // Revenue: account_code LIKE '6%' — credit-normal → net = credit - debit
    let glRevenue = 0
    // Expenses: account_code LIKE '7%' — debit-normal → net = debit - credit
    let glExpenses = 0
    // Receivables (12x): debit-normal → SUM(debit) - SUM(credit)
    let glReceivablesDebit = 0
    let glReceivablesCredit = 0
    // Cash (102): debit-normal → SUM(debit) - SUM(credit)
    let glCashDebit = 0
    let glCashCredit = 0
    // Trial balance
    let totalDebits = 0
    let totalCredits = 0

    for (const line of glLines) {
      const code = String(line.account_code ?? '')
      const debit = Number(line.debit_try ?? 0)
      const credit = Number(line.credit_try ?? 0)

      totalDebits += debit
      totalCredits += credit

      if (code.startsWith('6')) {
        // Revenue accounts are credit-normal
        glRevenue += credit - debit
      }
      if (code.startsWith('7')) {
        // Expense accounts are debit-normal
        glExpenses += debit - credit
      }
      if (code.startsWith('12')) {
        glReceivablesDebit += debit
        glReceivablesCredit += credit
      }
      if (code === '102') {
        glCashDebit += debit
        glCashCredit += credit
      }
    }

    const glReceivables = glReceivablesDebit - glReceivablesCredit
    const glCash = glCashDebit - glCashCredit

    const imbalance = Math.abs(totalDebits - totalCredits)
    const trialBalance: TrialBalanceCheck = {
      total_debits: round2(totalDebits),
      total_credits: round2(totalCredits),
      imbalance: round2(imbalance),
      is_balanced: imbalance < 1,
      entry_count: entryCount,
      line_count: lineCount,
    }

    // ── 4. Fetch operational side ─────────────────────────────────────────────
    const opsData = await GlReconciliationService.fetchOpsData(companyId, supabase, options)

    // ── 5. Build reconciliation items ─────────────────────────────────────────
    const REVENUE_THRESHOLD    = 100
    const EXPENSE_THRESHOLD    = 100
    const RECEIVABLE_THRESHOLD = 100
    const CASH_THRESHOLD       = 500  // Cash is approximate — wider tolerance

    const items: ReconciliationItem[] = []

    // Revenue
    const revDisc = computeDiscrepancy(round2(glRevenue), round2(opsData.totalRevenue))
    const revPct  = glRevenue !== null && opsData.totalRevenue !== null
      ? computeDiscrepancyPct(round2(glRevenue), round2(opsData.totalRevenue))
      : null
    items.push({
      label: 'Gelir Mutabakatı (6xx)',
      gl_amount: round2(glRevenue),
      ops_amount: round2(opsData.totalRevenue),
      discrepancy: revDisc,
      discrepancy_pct: revPct,
      status: assignReconciliationStatus(revDisc, REVENUE_THRESHOLD),
      threshold_try: REVENUE_THRESHOLD,
    })

    // Expenses
    const expDisc = computeDiscrepancy(round2(glExpenses), round2(opsData.totalExpenses))
    const expPct  = glExpenses !== null && opsData.totalExpenses !== null
      ? computeDiscrepancyPct(round2(glExpenses), round2(opsData.totalExpenses))
      : null
    items.push({
      label: 'Gider Mutabakatı (7xx)',
      gl_amount: round2(glExpenses),
      ops_amount: round2(opsData.totalExpenses),
      discrepancy: expDisc,
      discrepancy_pct: expPct,
      status: assignReconciliationStatus(expDisc, EXPENSE_THRESHOLD),
      threshold_try: EXPENSE_THRESHOLD,
    })

    // Receivables
    const recDisc = computeDiscrepancy(round2(glReceivables), round2(opsData.totalReceivables))
    const recPct  = glReceivables !== null && opsData.totalReceivables !== null
      ? computeDiscrepancyPct(round2(glReceivables), round2(opsData.totalReceivables))
      : null
    items.push({
      label: 'Alacak Mutabakatı (12x)',
      gl_amount: round2(glReceivables),
      ops_amount: round2(opsData.totalReceivables),
      discrepancy: recDisc,
      discrepancy_pct: recPct,
      status: assignReconciliationStatus(recDisc, RECEIVABLE_THRESHOLD),
      threshold_try: RECEIVABLE_THRESHOLD,
    })

    // Cash
    const cashDisc = computeDiscrepancy(round2(glCash), round2(opsData.approxCash))
    const cashPct  = glCash !== null && opsData.approxCash !== null
      ? computeDiscrepancyPct(round2(glCash), round2(opsData.approxCash))
      : null
    items.push({
      label: 'Nakit Mutabakatı (102)',
      gl_amount: round2(glCash),
      ops_amount: round2(opsData.approxCash),
      discrepancy: cashDisc,
      discrepancy_pct: cashPct,
      status: assignReconciliationStatus(cashDisc, CASH_THRESHOLD),
      threshold_try: CASH_THRESHOLD,
      notes: 'Operasyonel nakit tahminidir — banka ekstresini ayrıca kontrol edin.',
    })

    // ── 6. Summary ────────────────────────────────────────────────────────────
    const discrepancyItems = items.filter(i => i.status === 'discrepancy')
    const discrepancyCount = discrepancyItems.length
    const allBalanced = discrepancyCount === 0 && items.every(i => i.status !== 'no_gl_data')
    const totalDiscrepancyTry = items.reduce((s, i) =>
      s + (i.discrepancy !== null ? Math.abs(i.discrepancy) : 0), 0)
    const statusLabel = buildStatusLabel(allBalanced, discrepancyCount)

    return {
      company_id: companyId,
      period_id: options?.periodId ?? null,
      period_label: periodLabel,
      items,
      trial_balance: trialBalance,
      all_balanced: allBalanced,
      discrepancy_count: discrepancyCount,
      total_discrepancy_try: round2(totalDiscrepancyTry),
      gl_mode: glMode,
      status_label: statusLabel,
      action_required: discrepancyCount > 0 || !trialBalance.is_balanced,
      computed_at: new Date().toISOString(),
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static async detectGlMode(companyId: string, supabase: AnySupabaseClient): Promise<string> {
    try {
      const { data } = await supabase
        .from('companies')
        .select('gl_mode')
        .eq('id', companyId)
        .single()
      return (data?.gl_mode as string) ?? 'parallel'
    } catch {
      return 'parallel'
    }
  }

  private static async fetchGlLines(
    companyId: string,
    supabase: AnySupabaseClient,
    options?: { periodId?: string | null; fromDate?: string | null; toDate?: string | null },
  ): Promise<{ glLines: Array<{ account_code: string; debit_try: number; credit_try: number }>; entryCount: number; lineCount: number }> {
    let query = supabase
      .from('journal_entry_lines')
      .select(`
        account_code,
        debit_try,
        credit_try,
        journal_entries!inner (
          id,
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
    if (options?.fromDate) {
      query = query.gte('journal_entries.entry_date', options.fromDate)
    }
    if (options?.toDate) {
      query = query.lte('journal_entries.entry_date', options.toDate)
    }

    const { data, error } = await query
    if (error) throw error

    const glLines = (data ?? []) as Array<{ account_code: string; debit_try: number; credit_try: number }>
    const lineCount = glLines.length

    // Count unique entry IDs
    const entryIds = new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((l: any) => l.journal_entries?.id).filter(Boolean)
    )

    return { glLines, entryCount: entryIds.size, lineCount }
  }

  private static async fetchOpsData(
    companyId: string,
    supabase: AnySupabaseClient,
    options?: { periodId?: string | null; fromDate?: string | null; toDate?: string | null },
  ) {
    const [salesRes, expensesRes] = await Promise.all([
      (() => {
        let q = supabase
          .from('sales')
          .select('total_try:total, paid_amount, status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('status', ['confirmed', 'partial', 'paid', 'overdue'])
        if (options?.fromDate) q = q.gte('sale_date', options.fromDate)
        if (options?.toDate)   q = q.lte('sale_date', options.toDate)
        return q
      })(),
      (() => {
        let q = supabase
          .from('expenses')
          .select('amount_try, payment_status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('payment_status', ['approved', 'paid'])
        if (options?.fromDate) q = q.gte('expense_date', options.fromDate)
        if (options?.toDate)   q = q.lte('expense_date', options.toDate)
        return q
      })(),
    ])

    const sales    = (salesRes.data    ?? []) as Array<{ total_try: number; paid_amount: number | null; status: string }>
    const expenses = (expensesRes.data ?? []) as Array<{ amount_try: number; payment_status: string }>

    // Ops Revenue: SUM of total for confirmed/partial/paid/overdue
    const totalRevenue = sales.reduce((s, r) => s + (Number(r.total_try) || 0), 0)

    // Ops Expenses: SUM of amounts for approved + paid
    const totalExpenses = expenses.reduce((s, r) => s + (Number(r.amount_try) || 0), 0)

    // Ops Receivables: outstanding amount (total - paid) for unpaid/partial/overdue
    const totalReceivables = sales.reduce((s, r) => {
      if (r.status === 'paid') return s
      const total = Number(r.total_try) || 0
      const paid  = Number(r.paid_amount) || 0
      return s + Math.max(0, total - paid)
    }, 0)

    // Approx cash: paid sales - paid expenses
    const paidSales    = sales.filter(r => r.status === 'paid' || (r.paid_amount && r.paid_amount > 0))
                              .reduce((s, r) => s + (Number(r.paid_amount) || 0), 0)
    const paidExpenses = expenses.filter(r => r.payment_status === 'paid')
                                 .reduce((s, r) => s + (Number(r.amount_try) || 0), 0)
    const approxCash = paidSales - paidExpenses

    return {
      totalRevenue,
      totalExpenses,
      totalReceivables,
      approxCash,
    }
  }

  private static buildPeriodLabel(options?: {
    periodId?: string | null
    fromDate?: string | null
    toDate?: string | null
  }): string {
    if (options?.fromDate && options?.toDate) {
      return `${options.fromDate} – ${options.toDate}`
    }
    if (options?.fromDate) return `${options.fromDate} itibaren`
    if (options?.toDate)   return `${options.toDate} itibarıyla`
    return 'Tüm Dönemler'
  }
}

// ── Internal helper ────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
