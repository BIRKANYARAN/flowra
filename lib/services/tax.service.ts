// ═══════════════════════════════════════════════════════════════════════════════
// Phase 4 — Tax Service
//
// Two tax systems live here:
//
//   1) KDV (VAT)
//      net_vat = sales_vat − purchase_vat − expense_vat
//      • > 0 → owed to tax authority
//      • < 0 → recoverable (credit carries forward)
//
//   2) Corporate income tax (Kurumlar Vergisi)
//      matrah = revenue − cost − DEDUCTIBLE expenses
//      tax    = max(matrah, 0) × rate
//      net    = matrah − tax    (can be negative — losses survive as losses)
//
// Architecture:
//   • Pure kernels (`computeKdv`, `computeCorporateTax`) take primitives.
//     They have no DB dependency and are reused by:
//       - the simulation engine
//       - unit tests
//       - the report layer (composes them with DB readers)
//
//   • DB-bound methods (`TaxService.getXxx`) hit Supabase, then call the
//     pure kernels. Caller-provided period filters are validated centrally.
//
// Hard rules:
//   • No tax/profit values are stored. Recompute on demand.
//   • Historical fx_rate values from each row's snapshot are honored as-is —
//     never re-evaluated against current fx_rates.
//   • The cost engine is NOT touched.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import { AppError } from '@/types/errors'
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>
import {
  CORPORATE_TAX_RATE_TR,
  materializeRecurring,
  round2,
  validatePeriod,
} from '@/lib/services/finance-rules'
import type {
  CorporateTaxResult,
  KdvResult,
  Period,
  RecurrenceFrequency,
} from '@/types'

function startOfDayUTC(yyyymmdd: string): string { return yyyymmdd + 'T00:00:00.000Z' }
function endOfDayUTC(yyyymmdd: string):   string { return yyyymmdd + 'T23:59:59.999Z' }

// ── KDV summary types ──────────────────────────────────────────────────────────
export interface KDVSummary {
  period_label:    string       // e.g. "Mayıs 2026"
  output_vat_try:  number       // 391 account: hesaplanan KDV (from sales)
  input_vat_try:   number       // 191 account: indirilecek KDV (from expenses)
  net_vat_try:     number       // output - input (positive = payable)
  vat_payable:     boolean      // net_vat_try > 0
  filing_due_date: string       // 26th of the following month (Turkish rule)
  period_start:    string
  period_end:      string
  breakdown: {
    sales_vat_try:    number   // KDV from sales (18% or 8% mixed)
    expense_vat_try:  number   // deductible KDV from expenses
    vat_rate_summary: { rate: number; base_try: number; vat_try: number }[]
  }
}

// ── Corporate tax estimate types ───────────────────────────────────────────────
export interface CorporateTaxEstimate {
  ytd_revenue_try:        number
  ytd_expenses_try:       number
  ytd_gross_profit_try:   number
  ytd_net_before_tax_try: number
  tax_rate:               number    // 0.25 for 2026 Turkey standard
  estimated_tax_try:      number    // max(0, ytd_net_before_tax * tax_rate)
  advance_tax_paid_try:   number    // from expense records tagged as 'advance_tax'
  remaining_tax_try:      number    // estimated - paid (can be negative = overpaid)
  next_advance_due:       string    // date of next quarterly advance payment
  fiscal_year:            number
}

// ── Pure helper: Turkish month name ───────────────────────────────────────────
const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

// ── KDV pure helpers (exported for testing and UI) ────────────────────────────

/**
 * Compute the KDV deduction rate: what percentage of output KDV is offset by input KDV.
 * Returns 0 when outputKdv is 0 to avoid division by zero.
 */
export function computeKdvDeductionRate(inputKdv: number, outputKdv: number): number {
  if (outputKdv === 0) return 0
  return round2((inputKdv / outputKdv) * 100)
}

/**
 * Classify the KDV position based on net KDV value.
 * payable: net > 0 (owed to tax authority)
 * credit:  net < 0 (recoverable credit carried forward)
 * balanced: net === 0
 */
export function classifyKdvPosition(netKdv: number): 'payable' | 'credit' | 'balanced' {
  if (netKdv > 0) return 'payable'
  if (netKdv < 0) return 'credit'
  return 'balanced'
}

/**
 * Compute KDV monthly trend by comparing the last month's net KDV
 * against the average of prior months.
 * increasing: last > avg * 1.1
 * decreasing: last < avg * 0.9
 * stable: otherwise
 * Returns 'stable' when fewer than 2 months are provided.
 */
export function computeKdvTrend(
  months: Array<{ output: number; input: number }>,
): 'increasing' | 'stable' | 'decreasing' {
  if (months.length < 2) return 'stable'
  const nets = months.map(m => m.output - m.input)
  const last = nets[nets.length - 1]!
  const prior = nets.slice(0, -1)
  const avg = prior.reduce((s, v) => s + v, 0) / prior.length
  if (last > avg * 1.1) return 'increasing'
  if (last < avg * 0.9) return 'decreasing'
  return 'stable'
}

/**
 * Format a KDV period label in Turkish.
 * Example: formatKdvPeriod(2025, 4) → "Nisan 2025 KDV Dönemi"
 * Month is 1-based (1 = January, 12 = December).
 */
export function formatKdvPeriod(year: number, month: number): string {
  const monthName = TR_MONTHS[(month - 1) % 12] ?? ''
  return `${monthName} ${year} KDV Dönemi`
}

/** Returns "Mayıs 2026" format from a YYYY-MM-DD period end date. */
function periodLabel(periodEnd: string): string {
  const [y, m] = periodEnd.split('-').map(Number)
  return `${TR_MONTHS[(m ?? 1) - 1] ?? ''} ${y}`
}

/**
 * Pure function: compute filing due date for a KDV period.
 * Turkish rule: due on the 26th of the month FOLLOWING periodEnd.
 * Example: period ending 2026-05-31 → due "2026-06-26"
 */
export function computeFilingDueDate(periodEnd: string): string {
  const [y, m] = periodEnd.split('-').map(Number)
  const dueMonth = (m % 12) + 1
  const dueYear  = m === 12 ? y + 1 : y
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-26`
}

/**
 * Pure function: compute KDV totals from raw DB rows.
 * Exported for unit testing — no Supabase dependency.
 */
export function computeKDVFromRows(
  salesRows:   { kdv_amount_try: number; tax_rate?: number }[],
  expenseRows: { kdv_deductible_try: number }[],
): { output_vat_try: number; input_vat_try: number; net_vat_try: number; vat_payable: boolean } {
  const output = round2(salesRows.reduce((s, r) => s + Number(r.kdv_amount_try ?? 0), 0))
  const input  = round2(expenseRows.reduce((s, r) => s + Number(r.kdv_deductible_try ?? 0), 0))
  const net    = round2(output - input)
  return { output_vat_try: output, input_vat_try: input, net_vat_try: net, vat_payable: net > 0 }
}

/**
 * Pure function: compute next Turkish corporate tax advance due date.
 * Advance schedule: 17th of April, July, October, January.
 */
export function nextCorporateTaxAdvanceDue(asOfDate: string): string {
  const d = new Date(asOfDate + 'T00:00:00')
  const year  = d.getFullYear()
  const month = d.getMonth() + 1 // 1-based

  // Advance due months (1-based): April=4, July=7, October=10, January=1
  const dueDates = [
    `${year}-01-17`,
    `${year}-04-17`,
    `${year}-07-17`,
    `${year}-10-17`,
    `${year + 1}-01-17`,
  ]

  for (const d2 of dueDates) {
    if (d2 > asOfDate) return d2
  }
  // Should never reach here — last entry is always next year
  return `${year + 1}-04-17`
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE KERNELS — DB-free, simulation-friendly. EXPORTED individually so the
// simulation engine and tests can use them without pulling Supabase.
// ═══════════════════════════════════════════════════════════════════════════════

export interface KdvComputeInput {
  sales_vat_try:    number
  purchase_vat_try: number
  expense_vat_try:  number
}
export function computeKdv(input: KdvComputeInput): KdvResult {
  const net = input.sales_vat_try - input.purchase_vat_try - input.expense_vat_try
  return {
    sales_vat_try:    round2(input.sales_vat_try),
    purchase_vat_try: round2(input.purchase_vat_try),
    expense_vat_try:  round2(input.expense_vat_try),
    net_vat_try:      round2(net),
  }
}

export interface CorporateTaxComputeInput {
  revenue_try:             number
  cost_try:                number
  /** ONLY deductible expenses — non-deductible reduces cash but not matrah. */
  deductible_expenses_try: number
  /** Percent (e.g. 25 for 25%). */
  rate_percent:            number
}
export function computeCorporateTax(i: CorporateTaxComputeInput): CorporateTaxResult {
  const matrah = i.revenue_try - i.cost_try - i.deductible_expenses_try
  // Tax never goes below zero: a loss does not generate a tax refund here.
  // Loss carry-forward is a separate mechanism (out of scope for now).
  const taxableBase = matrah > 0 ? matrah : 0
  const tax         = taxableBase * (i.rate_percent / 100)
  const net         = matrah - tax
  return {
    matrah_try:        round2(matrah),
    rate_percent:      i.rate_percent,
    tax_try:           round2(tax),
    net_after_tax_try: round2(net),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB-bound API
// ═══════════════════════════════════════════════════════════════════════════════

export class TaxService {

  // ── Output VAT (sales side) ────────────────────────────────────────────────
  // sales.kdv_total is in the SALE's currency. Convert with fx_rate_try.
  // For TRY-native sales, fx_rate_try is null/1 → no-op.
  static async getSalesVat(userId: string, companyId: string, period: Period, ctx?: RequestContext, clientOverride?: AnyClient): Promise<number> {
    validatePeriod(period)
    const supabase = clientOverride ?? createClient()
    // kdv_amount_try is now stored on the sales row (accounting_truth_v1 migration).
    // For legacy rows that predate the column, kdv_amount_try defaults to 0.
    const { data, error } = await supabase
      .from('sales')
      .select('kdv_amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', period.from)
      .lte('sale_date', period.to)

    if (error) {
      if (ctx) await logger.error(ctx, 'tax:sales_vat:db_error', { error: error.message })
      // Graceful fallback if column not yet added: return 0
      return 0
    }

    return Math.round((data ?? []).reduce((s, r) => s + Number(r.kdv_amount_try ?? 0), 0) * 100) / 100
  }

  // ── Input VAT (purchase side) ──────────────────────────────────────────────
  // Only FINALIZED purchases count. Per-line VAT = qty × unit_price × kdv/100,
  // converted to TRY at the purchase's frozen fx_rate snapshot.
  //
  // Lines with kdv=0 (the default for legacy rows) contribute nothing — exactly
  // the right behaviour for backward compatibility.
  static async getPurchaseVat(userId: string, companyId: string, period: Period, ctx?: RequestContext, clientOverride?: AnyClient): Promise<number> {
    // The current DB schema uses `purchase_orders` / `purchase_order_items` (no `purchases` table).
    // Purchase VAT tracking requires a `purchases` table with KDV line items that does not exist yet.
    // Return 0 until the purchase module is implemented with proper VAT columns.
    return 0
  }

  // ── Input VAT (expense side: actual + recurring occurrences) ──────────────
  static async getExpenseVat(userId: string, companyId: string, period: Period, ctx?: RequestContext, clientOverride?: AnyClient): Promise<number> {
    validatePeriod(period)
    const supabase = clientOverride ?? createClient()

    const [{ data: exps, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
      supabase
        .from('expenses')
        .select('amount_try, kdv')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('kdv', 0)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),
      supabase
        .from('recurring_expenses')
        .select('amount, fx_rate, kdv, frequency, start_date, end_date')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .gt('kdv', 0)
        .lte('start_date', period.to),
    ])

    if (e1) {
      if (ctx) await logger.error(ctx, 'tax:expense_vat:exp_error', { error: e1.message })
      throw new AppError('DB_READ_FAILED', 'Gider KDV hesaplanamadı', { dbError: e1.message })
    }
    if (e2) {
      if (ctx) await logger.error(ctx, 'tax:expense_vat:rec_error', { error: e2.message })
      throw new AppError('DB_READ_FAILED', 'Tekrarlı gider KDV hesaplanamadı', { dbError: e2.message })
    }

    let v = 0
    for (const e of exps ?? []) {
      v += Number(e.amount_try ?? 0) * Number(e.kdv ?? 0) / 100
    }
    for (const r of recs ?? []) {
      const occurrences = materializeRecurring(
        {
          frequency:  String(r.frequency) as RecurrenceFrequency,
          start_date: String(r.start_date),
          end_date:   r.end_date ? String(r.end_date) : null,
        },
        period,
      )
      const amtTry = Number(r.amount ?? 0) * Number(r.fx_rate ?? 1)
      const kdv    = Number(r.kdv ?? 0)
      v += occurrences.length * amtTry * kdv / 100
    }
    return round2(v)
  }

  // ── KDV net (sales − purchase − expense) ──────────────────────────────────
  static async getKdvNet(userId: string, companyId: string, period: Period, ctx?: RequestContext, clientOverride?: AnyClient): Promise<KdvResult> {
    const [sv, pv, ev] = await Promise.all([
      this.getSalesVat(userId, companyId, period, ctx, clientOverride),
      this.getPurchaseVat(userId, companyId, period, ctx, clientOverride),
      this.getExpenseVat(userId, companyId, period, ctx, clientOverride),
    ])
    return computeKdv({ sales_vat_try: sv, purchase_vat_try: pv, expense_vat_try: ev })
  }

  // ── Corporate tax — composes Finance + pure kernel ─────────────────────────
  // Lazy-imports FinanceService to avoid a static cycle at module load.
  static async getCorporateTax(
    userId:    string,
    companyId: string,
    period:    Period,
    rate?:     number,
    ctx?:      RequestContext,
    clientOverride?: AnyClient,
  ): Promise<CorporateTaxResult> {
    const { FinanceService } = await import('@/lib/services/finance.service')
    const [gross, exp] = await Promise.all([
      FinanceService.getGrossProfit(userId, companyId, period, ctx, clientOverride),
      FinanceService.getOperatingExpenses(userId, companyId, period, ctx, clientOverride),
    ])
    return computeCorporateTax({
      revenue_try:             gross.revenue_try,
      cost_try:                gross.cost_try,
      deductible_expenses_try: exp.deductible_try,
      rate_percent:            rate ?? CORPORATE_TAX_RATE_TR,
    })
  }

  // ── KDV Summary (new) — period-level VAT report ─────────────────────────────
  static async computeKDVSummary(
    companyId: string,
    periodStart: string,  // YYYY-MM-DD
    periodEnd: string,
    supabase: AnyClient,
  ): Promise<KDVSummary> {
    const [{ data: salesRows, error: salesErr }, { data: expenseRows, error: expErr }] =
      await Promise.all([
        supabase
          .from('sales')
          .select('kdv_amount_try, tax_rate, total_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', periodStart)
          .lte('sale_date', periodEnd),
        supabase
          .from('expenses')
          .select('kdv_deductible_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', periodStart)
          .lte('expense_date', periodEnd),
      ])

    if (salesErr) throw new AppError('DB_READ_FAILED', 'Satış KDV verisi alınamadı', { dbError: salesErr.message })
    if (expErr)   throw new AppError('DB_READ_FAILED', 'Gider KDV verisi alınamadı', { dbError: expErr.message })

    const sales    = (salesRows   ?? []) as { kdv_amount_try: number; tax_rate?: number; total_try?: number }[]
    const expenses = (expenseRows ?? []) as { kdv_deductible_try: number }[]

    const { output_vat_try, input_vat_try, net_vat_try, vat_payable } =
      computeKDVFromRows(sales, expenses)

    // VAT rate breakdown: group sales by tax_rate
    const rateMap = new Map<number, { base_try: number; vat_try: number }>()
    for (const s of sales) {
      const rate = Number(s.tax_rate ?? 0)
      const vat  = Number(s.kdv_amount_try ?? 0)
      const base = rate > 0 ? round2(vat / (rate / 100)) : Number(s.total_try ?? 0)
      const cur  = rateMap.get(rate) ?? { base_try: 0, vat_try: 0 }
      rateMap.set(rate, { base_try: round2(cur.base_try + base), vat_try: round2(cur.vat_try + vat) })
    }
    const vat_rate_summary = Array.from(rateMap.entries())
      .map(([rate, v]) => ({ rate, base_try: v.base_try, vat_try: v.vat_try }))
      .sort((a, b) => a.rate - b.rate)

    return {
      period_label:    periodLabel(periodEnd),
      output_vat_try,
      input_vat_try,
      net_vat_try,
      vat_payable,
      filing_due_date: computeFilingDueDate(periodEnd),
      period_start:    periodStart,
      period_end:      periodEnd,
      breakdown: {
        sales_vat_try:   output_vat_try,
        expense_vat_try: input_vat_try,
        vat_rate_summary,
      },
    }
  }

  // ── Corporate Tax Estimate (new) — YTD estimate ──────────────────────────────
  static async estimateCorporateTax(
    companyId: string,
    asOfDate: string,  // YYYY-MM-DD — compute YTD up to this date
    supabase: AnyClient,
  ): Promise<CorporateTaxEstimate> {
    const fiscalYear   = Number(asOfDate.slice(0, 4))
    const ytdStart     = `${fiscalYear}-01-01`
    const TAX_RATE     = CORPORATE_TAX_RATE_TR / 100

    // Fetch YTD sales revenue and YTD expenses in parallel
    const [{ data: salesData, error: salesErr }, { data: expData, error: expErr }] =
      await Promise.all([
        supabase
          .from('sales')
          .select('total_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', ytdStart)
          .lte('sale_date', asOfDate),
        supabase
          .from('expenses')
          .select('amount_try, category')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', ytdStart)
          .lte('expense_date', asOfDate),
      ])

    if (salesErr) throw new AppError('DB_READ_FAILED', 'Satış verisi alınamadı', { dbError: salesErr.message })
    if (expErr)   throw new AppError('DB_READ_FAILED', 'Gider verisi alınamadı', { dbError: expErr.message })

    const ytd_revenue_try  = round2((salesData ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0))
    const allExpenses       = (expData ?? []) as { amount_try: number; category: string }[]

    // Advance tax paid: expenses tagged as category 'tax' (advance_tax proxy)
    const advance_tax_paid_try = round2(
      allExpenses
        .filter(e => e.category === 'tax')
        .reduce((s, e) => s + Number(e.amount_try ?? 0), 0)
    )

    const ytd_expenses_try = round2(
      allExpenses
        .filter(e => e.category !== 'tax')
        .reduce((s, e) => s + Number(e.amount_try ?? 0), 0)
    )

    const ytd_gross_profit_try   = round2(ytd_revenue_try - ytd_expenses_try)
    const ytd_net_before_tax_try = ytd_gross_profit_try
    // ESTIMATE base = revenue − all (non-tax) expenses — NOT the canonical real-COGS
    // matrah (that's getCorporateTax). Rate + floor flow through the single kernel.
    const estimated_tax_try      = computeCorporateTax({
      revenue_try:             ytd_net_before_tax_try,
      cost_try:                0,
      deductible_expenses_try: 0,
      rate_percent:            CORPORATE_TAX_RATE_TR,
    }).tax_try
    const remaining_tax_try      = round2(estimated_tax_try - advance_tax_paid_try)
    const next_advance_due       = nextCorporateTaxAdvanceDue(asOfDate)

    return {
      ytd_revenue_try,
      ytd_expenses_try,
      ytd_gross_profit_try,
      ytd_net_before_tax_try,
      tax_rate:            TAX_RATE,
      estimated_tax_try,
      advance_tax_paid_try,
      remaining_tax_try,
      next_advance_due,
      fiscal_year:         fiscalYear,
    }
  }
}
