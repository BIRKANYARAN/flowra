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
  static async getSalesVat(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<number> {
    validatePeriod(period)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('sales')
      .select('kdv_total, fx_rate_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', startOfDayUTC(period.from))
      .lte('created_at', endOfDayUTC(period.to))

    if (error) {
      if (ctx) await logger.error(ctx, 'tax:sales_vat:db_error', { error: error.message })
      throw new AppError('DB_READ_FAILED', 'Satış KDV hesaplanamadı', { dbError: error.message })
    }

    let v = 0
    for (const r of data ?? []) {
      const fx = Number(r.fx_rate_try ?? 1) || 1
      v += Number(r.kdv_total ?? 0) * fx
    }
    return round2(v)
  }

  // ── Input VAT (purchase side) ──────────────────────────────────────────────
  // Only FINALIZED purchases count. Per-line VAT = qty × unit_price × kdv/100,
  // converted to TRY at the purchase's frozen fx_rate snapshot.
  //
  // Lines with kdv=0 (the default for legacy rows) contribute nothing — exactly
  // the right behaviour for backward compatibility.
  static async getPurchaseVat(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<number> {
    validatePeriod(period)
    const supabase = createClient()

    // Step 1 — finalized purchases in the window
    const { data: purchases, error: pErr } = await supabase
      .from('purchases')
      .select('id, fx_rate')
      .eq('company_id', companyId)
      .eq('status', 'finalized')
      .is('deleted_at', null)
      .gte('purchase_date', period.from)
      .lte('purchase_date', period.to)

    if (pErr) {
      if (ctx) await logger.error(ctx, 'tax:purchase_vat:purchases_error', { error: pErr.message })
      throw new AppError('DB_READ_FAILED', 'Satın alma KDV hesaplanamadı', { dbError: pErr.message })
    }

    const purchaseRows = purchases ?? []
    if (purchaseRows.length === 0) return 0

    // Step 2 — lines for those purchases (one round-trip)
    const ids   = purchaseRows.map(p => String(p.id))
    const fxMap = new Map<string, number>()
    for (const p of purchaseRows) fxMap.set(String(p.id), Number(p.fx_rate ?? 1) || 1)

    const { data: items, error: iErr } = await supabase
      .from('purchase_items')
      .select('purchase_id, quantity, unit_price, kdv')
      .in('purchase_id', ids)

    if (iErr) {
      if (ctx) await logger.error(ctx, 'tax:purchase_vat:items_error', { error: iErr.message })
      throw new AppError('DB_READ_FAILED', 'Satın alma satırları okunamadı', { dbError: iErr.message })
    }

    let v = 0
    for (const it of items ?? []) {
      const fx    = fxMap.get(String(it.purchase_id)) ?? 1
      const qty   = Number(it.quantity ?? 0)
      const price = Number(it.unit_price ?? 0)
      const rate  = Number(it.kdv ?? 0)
      v += qty * price * fx * rate / 100
    }
    return round2(v)
  }

  // ── Input VAT (expense side: actual + recurring occurrences) ──────────────
  static async getExpenseVat(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<number> {
    validatePeriod(period)
    const supabase = createClient()

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
  static async getKdvNet(userId: string, companyId: string, period: Period, ctx?: RequestContext): Promise<KdvResult> {
    const [sv, pv, ev] = await Promise.all([
      this.getSalesVat(userId, companyId, period, ctx),
      this.getPurchaseVat(userId, companyId, period, ctx),
      this.getExpenseVat(userId, companyId, period, ctx),
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
  ): Promise<CorporateTaxResult> {
    const { FinanceService } = await import('@/lib/services/finance.service')
    const [gross, exp] = await Promise.all([
      FinanceService.getGrossProfit(userId, companyId, period, ctx),
      FinanceService.getOperatingExpenses(userId, companyId, period, ctx),
    ])
    return computeCorporateTax({
      revenue_try:             gross.revenue_try,
      cost_try:                gross.cost_try,
      deductible_expenses_try: exp.deductible_try,
      rate_percent:            rate ?? CORPORATE_TAX_RATE_TR,
    })
  }
}
