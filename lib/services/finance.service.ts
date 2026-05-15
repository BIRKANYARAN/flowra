// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Finance Service
//
// DERIVED-ONLY computations for revenue, cost, gross profit, expenses
// (one-off + recurring), and the full financial summary.
//
// Hard rules:
//   • NEVER store profit / tax / summary values. Everything is read-time.
//   • NEVER recompute historical costs. COGS reads frozen `entry_cost_try`
//     from stock_lots — Phase 3's whole point was to freeze that snapshot.
//   • NEVER touch stock_movements / stock_lots writes. We only READ them.
//
// Source-of-truth mapping:
//   revenue            ← sales.total_try (already TRY)
//   sales VAT          ← sales.kdv_total × coalesce(sales.fx_rate_try, 1)
//   COGS               ← Σ sale_item_allocations.qty × stock_lots.entry_cost_try
//                        (legacy fallback: sales.total_cost when a sale has
//                         no allocations — keeps pre-FIFO sales reportable)
//   expenses           ← expenses (period-filtered) + recurring_expenses
//                        (occurrences materialized in-process)
//   matrah             ← revenue − COGS − DEDUCTIBLE expenses only
//   tax                ← matrah × rate (clamped at 0 for losses)
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import { AppError } from '@/types/errors'
import {
  CORPORATE_TAX_RATE_TR,
  materializeRecurring,
  resolveDeductibility,
  resolveExpenseType,
  round2,
  round4,
  validatePeriod,
} from '@/lib/services/finance-rules'
import type {
  CostResult,
  ExpenseCategory,
  ExpenseLineComputed,
  ExpenseType,
  FinancialSummary,
  OperatingExpenseResult,
  Period,
  RecurrenceFrequency,
  RevenueResult,
} from '@/types'

// Cap one day of timestamps inside a date-only period. Using "T23:59:59.999Z"
// inclusive avoids missing rows created at the very end of the day.
function endOfDayUTC(yyyymmdd: string): string { return yyyymmdd + 'T23:59:59.999Z' }
function startOfDayUTC(yyyymmdd: string): string { return yyyymmdd + 'T00:00:00.000Z' }

export class FinanceService {

  // ── Revenue ────────────────────────────────────────────────────────────────
  //
  // sales.total_try is already the TRY-converted sale total at sale time
  // (frozen on the row). We sum it directly; we do NOT re-multiply by
  // current fx_rates — that would silently rewrite history.
  //
  // sales.kdv_total is in the SALE's currency. Convert to TRY using the
  // sale's frozen fx_rate_try (defaults to 1 for TRY-native sales).
  static async getRevenue(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<RevenueResult> {
    validatePeriod(period)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('sales')
      .select('total_try, kdv_total, fx_rate_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', startOfDayUTC(period.from))
      .lte('created_at', endOfDayUTC(period.to))

    if (error) {
      if (ctx) await logger.error(ctx, 'finance:revenue:db_error', { error: error.message })
      throw new AppError('DB_READ_FAILED', 'Ciro hesaplanamadı', { dbError: error.message })
    }

    let total = 0
    let vat   = 0
    for (const r of data ?? []) {
      total += Number(r.total_try ?? 0)
      const fx = Number(r.fx_rate_try ?? 1) || 1
      vat += Number(r.kdv_total ?? 0) * fx
    }

    return {
      total_try:     round2(total),
      sale_count:    (data ?? []).length,
      sales_vat_try: round2(vat),
    }
  }

  // ── Cost (COGS) ────────────────────────────────────────────────────────────
  //
  // Authoritative path: walk sale_item_allocations → stock_lots and use the
  // FROZEN entry_cost_try as per-unit TRY cost. This matches Phase 3's
  // historical-correctness invariant exactly.
  //
  // Fallback path: sales without allocations (legacy or non-FIFO) read
  // sales.total_cost — already in TRY, frozen at sale time.
  //
  // We deliberately do NOT trust sales.cogs / sales.total_cost when
  // allocations exist, because those legacy fields can disagree with the
  // FIFO consumption (especially after stock corrections).
  static async getCost(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<CostResult> {
    validatePeriod(period)
    const supabase = createClient()

    // Fetch the sale set first — we'll filter allocations to just these IDs.
    const { data: sales, error: sErr } = await supabase
      .from('sales')
      .select('id, total_cost')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', startOfDayUTC(period.from))
      .lte('created_at', endOfDayUTC(period.to))

    if (sErr) {
      if (ctx) await logger.error(ctx, 'finance:cost:sales_error', { error: sErr.message })
      throw new AppError('DB_READ_FAILED', 'Maliyet hesaplanamadı', { dbError: sErr.message })
    }

    const saleRows = sales ?? []
    if (saleRows.length === 0) {
      return { cogs_try: 0, allocation_count: 0, fallback_legacy_count: 0 }
    }

    const saleIds = saleRows.map(s => String(s.id))

    const { data: allocs, error: aErr } = await supabase
      .from('sale_item_allocations')
      .select(`
        sale_id, qty_allocated, unit_cost,
        stock_lots ( entry_cost_try, unit_cost, fx_rate_at_entry )
      `)
      .in('sale_id', saleIds)

    if (aErr) {
      if (ctx) await logger.error(ctx, 'finance:cost:alloc_error', { error: aErr.message })
      throw new AppError('DB_READ_FAILED', 'Maliyet allocation okunamadı', { dbError: aErr.message })
    }

    let cogs = 0
    const salesWithAllocs = new Set<string>()
    type AllocRow = {
      sale_id:       string | number
      qty_allocated: number | string   // canonical column (was 'qty')
      unit_cost:     number | string
      stock_lots:
        | { entry_cost_try: number | string | null; unit_cost: number | string; fx_rate_at_entry: number | string | null }
        | { entry_cost_try: number | string | null; unit_cost: number | string; fx_rate_at_entry: number | string | null }[]
        | null
    }
    for (const row of (allocs ?? []) as unknown as AllocRow[]) {
      const lot = Array.isArray(row.stock_lots) ? row.stock_lots[0] : row.stock_lots
      if (!lot) continue
      const perUnitTry =
        lot.entry_cost_try != null && lot.entry_cost_try !== ''
          ? Number(lot.entry_cost_try)
          : Number(lot.unit_cost) * Number(lot.fx_rate_at_entry ?? 1)
      cogs += Number(row.qty_allocated) * perUnitTry
      salesWithAllocs.add(String(row.sale_id))
    }

    let fallback = 0
    for (const s of saleRows) {
      if (!salesWithAllocs.has(String(s.id))) {
        cogs += Number(s.total_cost ?? 0)
        fallback++
      }
    }

    return {
      cogs_try:              round2(cogs),
      allocation_count:      (allocs ?? []).length,
      fallback_legacy_count: fallback,
    }
  }

  // ── Gross profit (Revenue - COGS) ─────────────────────────────────────────
  static async getGrossProfit(userId: string, companyId: string, period: Period, ctx?: RequestContext) {
    const [rev, cost] = await Promise.all([
      this.getRevenue(userId, companyId, period, ctx),
      this.getCost(userId, companyId, period, ctx),
    ])
    return {
      revenue_try:      rev.total_try,
      cost_try:         cost.cogs_try,
      gross_profit_try: round2(rev.total_try - cost.cogs_try),
    }
  }

  // ── Expense lines (one-off + recurring, materialized) ─────────────────────
  //
  // Returns a flat list. Each row carries category, expense_type, deductibility,
  // amount_try, and per-row VAT. The CALLER decides how to bucket.
  //
  // Recurring rows are NEVER persisted into the expenses table here — the
  // template is the source of truth. If the user wants real expense rows
  // (e.g. for invoice tracking), they create them via the regular expenses API.
  static async listExpenseLines(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<ExpenseLineComputed[]> {
    validatePeriod(period)
    const supabase = createClient()

    const [{ data: exps, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, category, expense_type, amount_try, kdv, is_deductible, expense_date, recurring_expense_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),
      supabase
        .from('recurring_expenses')
        .select('id, category, expense_type, amount, fx_rate, kdv, is_deductible, frequency, start_date, end_date')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .lte('start_date', period.to),
    ])

    if (e1) {
      if (ctx) await logger.error(ctx, 'finance:expenses:db_error', { error: e1.message })
      throw new AppError('DB_READ_FAILED', 'Giderler okunamadı', { dbError: e1.message })
    }
    if (e2) {
      if (ctx) await logger.error(ctx, 'finance:recurring:db_error', { error: e2.message })
      throw new AppError('DB_READ_FAILED', 'Tekrarlı giderler okunamadı', { dbError: e2.message })
    }

    const lines: ExpenseLineComputed[] = []

    // Build dedup set: recurring template occurrences already recorded as real expense rows.
    // Key: `${recurring_expense_id}::${expense_date}` — skip these in the recurring loop below.
    const realizedRecurring = new Set<string>()
    for (const e of exps ?? []) {
      const rid = (e as { recurring_expense_id?: string | null }).recurring_expense_id
      if (rid) realizedRecurring.add(`${rid}::${String(e.expense_date)}`)
    }

    for (const e of exps ?? []) {
      const cat       = String(e.category ?? 'general') as ExpenseCategory
      const amount    = Number(e.amount_try ?? 0)
      const kdv       = Number(e.kdv ?? 0)
      const deductive = resolveDeductibility(cat, e.is_deductible as boolean | null)
      const expenseType = e.expense_type
        ? String(e.expense_type) as ExpenseType
        : resolveExpenseType(cat)
      lines.push({
        source:          'expense',
        source_id:       String(e.id),
        occurrence_date: String(e.expense_date),
        category:        cat,
        expense_type:    expenseType,
        is_deductible:   deductive,
        amount_try:      round4(amount),
        kdv,
        vat_try:         round4(amount * kdv / 100),   // VAT on top of net
      })
    }

    for (const r of recs ?? []) {
      const cat       = String(r.category ?? 'general') as ExpenseCategory
      const amountTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
      const kdv       = Number(r.kdv ?? 0)
      const deductive = resolveDeductibility(cat, r.is_deductible as boolean | null)
      const expenseType = r.expense_type
        ? String(r.expense_type) as ExpenseType
        : resolveExpenseType(cat)
      const occurrences = materializeRecurring(
        {
          frequency:  String(r.frequency) as RecurrenceFrequency,
          start_date: String(r.start_date),
          end_date:   r.end_date ? String(r.end_date) : null,
        },
        period,
      )
      for (const date of occurrences) {
        // Skip if a real expense row already exists for this template + date
        if (realizedRecurring.has(`${r.id}::${date}`)) continue
        lines.push({
          source:          'recurring',
          source_id:       String(r.id),
          occurrence_date: date,
          category:        cat,
          expense_type:    expenseType,
          is_deductible:   deductive,
          amount_try:      round4(amountTry),
          kdv,
          vat_try:         round4(amountTry * kdv / 100),
        })
      }
    }

    return lines
  }

  static async getOperatingExpenses(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<OperatingExpenseResult> {
    const lines = await this.listExpenseLines(userId, companyId, period, ctx)
    let total = 0, deductible = 0, nonDeductible = 0
    for (const l of lines) {
      total += l.amount_try
      if (l.is_deductible) deductible += l.amount_try
      else nonDeductible += l.amount_try
    }
    return {
      total_try:          round2(total),
      deductible_try:     round2(deductible),
      non_deductible_try: round2(nonDeductible),
      lines,
    }
  }

  /**
   * Net profit = Gross profit - ALL expenses (including non-deductible ones,
   * because cash is cash). Different from `matrah` which only subtracts
   * deductible expenses.
   *
   *   net_profit  = revenue - cost - all_expenses     (cash-basis-ish view)
   *   matrah      = revenue - cost - deductible_only  (tax base)
   */
  static async getNetProfit(userId: string, companyId: string, period: Period, ctx?: RequestContext) {
    const [gross, exp] = await Promise.all([
      this.getGrossProfit(userId, companyId, period, ctx),
      this.getOperatingExpenses(userId, companyId, period, ctx),
    ])
    return {
      revenue_try:                 gross.revenue_try,
      cost_try:                    gross.cost_try,
      gross_profit_try:            gross.gross_profit_try,
      expenses_total_try:          exp.total_try,
      deductible_expenses_try:     exp.deductible_try,
      non_deductible_expenses_try: exp.non_deductible_try,
      net_profit_try:              round2(gross.gross_profit_try - exp.total_try),
    }
  }

  /**
   * Full financial snapshot — the canonical "company truth" for `period`.
   * Everything below is computed; nothing here is read from a stored summary.
   */
  static async getFinancialSummary(
    userId:    string,
    companyId: string,
    period:    Period,
    options?: { corporate_tax_rate?: number },
    ctx?:    RequestContext,
  ): Promise<FinancialSummary> {
    // Lazy import breaks the static cycle FinanceService ↔ TaxService.
    const { TaxService, computeCorporateTax } = await import('@/lib/services/tax.service')

    const [gross, expenses, vat] = await Promise.all([
      this.getGrossProfit(userId, companyId, period, ctx),
      this.getOperatingExpenses(userId, companyId, period, ctx),
      TaxService.getKdvNet(userId, companyId, period, ctx),
    ])

    const rate   = options?.corporate_tax_rate ?? CORPORATE_TAX_RATE_TR
    // KDV (VAT) is a pass-through liability — excluded from matrah (corporate tax base).
    // gross.revenue_try is the VAT-inclusive grand total; subtract sales VAT to get net.
    const netRevenue = round2(gross.revenue_try - vat.sales_vat_try)
    const corpTx = computeCorporateTax({
      revenue_try:             netRevenue,
      cost_try:                gross.cost_try,
      deductible_expenses_try: expenses.deductible_try,
      rate_percent:            rate,
    })

    return {
      period,
      revenue_try:                 gross.revenue_try,
      cost_try:                    gross.cost_try,
      gross_profit_try:            gross.gross_profit_try,
      expenses_total_try:          expenses.total_try,
      deductible_expenses_try:     expenses.deductible_try,
      non_deductible_expenses_try: expenses.non_deductible_try,
      matrah_try:                  corpTx.matrah_try,
      corporate_tax_rate:          corpTx.rate_percent,
      corporate_tax_try:           corpTx.tax_try,
      net_after_tax_try:           corpTx.net_after_tax_try,
      sales_vat_try:               vat.sales_vat_try,
      purchase_vat_try:            vat.purchase_vat_try,
      expense_vat_try:             vat.expense_vat_try,
      net_vat_try:                 vat.net_vat_try,
    }
  }
}
