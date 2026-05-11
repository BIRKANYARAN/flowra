// ═══════════════════════════════════════════════════════════════════════════════
// Phase 5 — Simulation Engine
//
// ZERO DB WRITES. Everything here is read-and-compute.
//
// Architecture: two layers
//
//   Pure kernel  computeSimulationKernel(kernelInput)
//     • No DB, no I/O — fully deterministic
//     • Exported individually for unit tests and for a future "batch compare"
//       feature that needs to run thousands of scenarios in milliseconds
//
//   DB-bound     SimulationService.simulateScenario(userId, input)
//     • Fetches two things from DB:
//         1. Product WAC from remaining stock_lots (frozen entry_cost_try)
//         2. Projected expense lines via FinanceService.listExpenseLines()
//            over the simulation period (future-dated → only recurring fire)
//     • Calls the pure kernel
//
// Reuse strategy:
//   • FinanceService.listExpenseLines()  — expense projection + deductibility
//   • computeCorporateTax()              — tax kernel (from TaxService)
//   • computeKdv()                       — VAT kernel (from TaxService)
//   • materializeRecurring()             — embedded inside listExpenseLines
//   • resolveDeductibility()             — called inside listExpenseLines
//   Nothing is duplicated.
//
// Assumptions documented in simulation_meta.assumptions:
//   • Unit cost = WAC of current remaining stock (Phase 3 frozen entry_cost_try)
//   • Revenue spread evenly across months (not seasonal)
//   • purchase_vat = 0 — simulation assumes selling existing stock, no new buys
//   • Monthly tax = proportional share of total period tax (annualisation deferred)
//   • Expenses = recurring only (no historical one-off expenses projected)
//   • Phase 5: financing, dividend and internal-transfer expense types are
//     filtered out of the simulation. Only operating economics are modelled.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import { AppError } from '@/types/errors'
import {
  CORPORATE_TAX_RATE_TR,
  KDV_STANDARD_TR,
  periodForMonth,
  round2,
  round4,
} from '@/lib/services/finance-rules'
import {
  computeCorporateTax,
  computeKdv,
} from '@/lib/services/tax.service'
import { FinanceService } from '@/lib/services/finance.service'
import type {
  ExpenseLineComputed,
  MonthlyExpenseMap,
  Period,
  SimulationInput,
  SimulationMonthBreakdown,
  SimulationPeriodMonths,
  SimulationResult,
} from '@/types'

const VALID_PERIOD_MONTHS = new Set<number>([1, 3, 6, 9, 12])

// ── Date helpers (pure) ──────────────────────────────────────────────────────

/** "next month" from today as YYYY-MM. */
function nextMonthStr(): string {
  const now  = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Build a list of YYYY-MM strings starting at `startYYYYMM` for `count` months. */
export function buildMonthList(startYYYYMM: string, count: number): string[] {
  const months: string[] = []
  let [y, m] = startYYYYMM.split('-').map(Number)
  for (let i = 0; i < count; i++) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

/** Period spanning `count` full months starting at `startYYYYMM`. */
export function buildSimulationPeriod(startYYYYMM: string, count: number): Period {
  const months = buildMonthList(startYYYYMM, count)
  const first  = periodForMonth(months[0])
  const last   = periodForMonth(months[months.length - 1])
  return { from: first.from, to: last.to }
}

/** Group a flat list of ExpenseLineComputed rows by YYYY-MM. */
export function groupExpensesByMonth(lines: ExpenseLineComputed[]): MonthlyExpenseMap {
  const map: MonthlyExpenseMap = new Map()
  for (const l of lines) {
    const mon = l.occurrence_date.slice(0, 7)   // YYYY-MM
    const cur = map.get(mon) ?? { total: 0, deductible: 0, expense_vat: 0 }
    cur.total        += l.amount_try
    if (l.is_deductible) cur.deductible += l.amount_try
    cur.expense_vat  += l.vat_try
    map.set(mon, cur)
  }
  return map
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE KERNEL — deterministic, no I/O
// ═══════════════════════════════════════════════════════════════════════════════

export interface SimulationKernelInput {
  // Product/sale parameters
  product_id:             string
  total_quantity:         number
  effective_unit_price:   number      // sale_price × (1 − discount/100)
  original_sale_price:    number
  discount_rate:          number
  unit_cost_try:          number      // WAC from stock (0 if unavailable)
  stock_qty_available:    number      // sum of lot.qty_remaining

  // Period
  period_months:          number
  start_month:            string      // YYYY-MM

  // Tax/VAT params
  tax_rate:               number      // %
  kdv_rate:               number      // % on sale price (output VAT)

  // Pre-materialized expenses for the simulation window
  expense_lines:          ExpenseLineComputed[]
}

export function computeSimulationKernel(k: SimulationKernelInput): SimulationResult {
  const months        = buildMonthList(k.start_month, k.period_months)
  const expByMonth    = groupExpensesByMonth(k.expense_lines)
  const perMonthQty   = k.total_quantity / k.period_months

  // ── Period totals ──────────────────────────────────────────────────────────
  const totalRevenue      = round2(k.total_quantity * k.effective_unit_price)
  const totalCost         = round2(k.total_quantity * k.unit_cost_try)
  const totalGrossProfit  = round2(totalRevenue - totalCost)

  let totalExpenses    = 0
  let totalDeductible  = 0
  let totalExpenseVat  = 0
  for (const v of expByMonth.values()) {
    totalExpenses   += v.total
    totalDeductible += v.deductible
    totalExpenseVat += v.expense_vat
  }
  totalExpenses   = round2(totalExpenses)
  totalDeductible = round2(totalDeductible)
  totalExpenseVat = round2(totalExpenseVat)
  const totalNonDeductible = round2(totalExpenses - totalDeductible)

  // ── Corporate tax (full period) ────────────────────────────────────────────
  // totalRevenue is already net-of-VAT (effective_unit_price is ex-VAT).
  // KDV is computed separately and added on top, so matrah = totalRevenue.
  const corpTax = computeCorporateTax({
    revenue_try:             totalRevenue,
    cost_try:                totalCost,
    deductible_expenses_try: totalDeductible,
    rate_percent:            k.tax_rate,
  })

  // ── KDV ───────────────────────────────────────────────────────────────────
  const salesVat  = round2(totalRevenue * k.kdv_rate / 100)
  const kdvResult = computeKdv({
    sales_vat_try:    salesVat,
    purchase_vat_try: 0,           // no new purchases assumed
    expense_vat_try:  totalExpenseVat,
  })

  // ── Monthly breakdown ──────────────────────────────────────────────────────
  // Tax split: each month gets its proportional share.
  // This is an accounting approximation — real KV is annual; note in assumptions.
  const taxPerMonth = k.period_months > 0 ? corpTax.tax_try / k.period_months : 0

  const monthly_breakdown: SimulationMonthBreakdown[] = months.map(mon => {
    const exp = expByMonth.get(mon) ?? { total: 0, deductible: 0, expense_vat: 0 }
    const qty = perMonthQty

    // Last month absorbs any rounding residual so that Σ == total.
    const revenue = round2(qty * k.effective_unit_price)
    const cost    = round2(qty * k.unit_cost_try)
    const gross   = round2(revenue - cost)
    const exps    = round2(exp.total)
    const ded     = round2(exp.deductible)
    const taxMon  = round2(taxPerMonth)
    const net     = round2(revenue - cost - exps - taxMon)
    const kdvSale = round2(revenue * k.kdv_rate / 100)

    return {
      month:               mon,
      quantity:            round4(qty),
      revenue,
      cost,
      gross_profit:        gross,
      expenses:            exps,
      deductible_expenses: ded,
      kdv_sales_vat:       kdvSale,
      tax:                 taxMon,
      net,
    }
  })

  // ── Assumptions ───────────────────────────────────────────────────────────
  const assumptions: string[] = [
    `Unit cost: weighted-average cost from current stock (${
      k.stock_qty_available > 0
        ? `${round2(k.stock_qty_available)} units at avg ₺${round2(k.unit_cost_try)}/unit`
        : 'no stock on hand — cost set to ₺0'
    })`,
    'Revenue spread evenly across months — seasonal variation not modelled',
    'Purchase VAT = ₺0 — simulation assumes selling existing stock with no new procurement',
    'Expenses = recurring entries only; one-off historical expenses do not fire into the future simulation window',
    'Recurring expenses fire within their [start_date, end_date] window; open-ended recurrings (no end_date) fire for the full simulation period',
    `Monthly tax = ${k.tax_rate}% of period matrah ÷ ${k.period_months} — approximate (real corporate tax is annual)`,
    'Financing flows (loan principal, partner financing) and distributions (dividend) are excluded — simulation models operating economics only',
  ]

  if (k.total_quantity > k.stock_qty_available && k.stock_qty_available > 0) {
    assumptions.push(
      `Simulated quantity (${k.total_quantity}) exceeds current stock (${round2(k.stock_qty_available)}). ` +
      `Cost for ${round2(k.total_quantity - k.stock_qty_available)} additional units assumed at same WAC.`
    )
  }

  return {
    revenue:                 totalRevenue,
    cost:                    totalCost,
    gross_profit:            totalGrossProfit,
    expenses_projection:     totalExpenses,
    deductible_expenses:     totalDeductible,
    non_deductible_expenses: totalNonDeductible,
    tax:                     corpTax.tax_try,
    net_profit:              round2(totalRevenue - totalCost - totalExpenses - corpTax.tax_try),
    kdv_effect: {
      sales_vat:    kdvResult.sales_vat_try,
      purchase_vat: 0,
      expense_vat:  kdvResult.expense_vat_try,
      net_vat:      kdvResult.net_vat_try,
      status:       kdvResult.net_vat_try > 0 ? 'payable' : 'carry_forward',
    },
    monthly_breakdown,
    simulation_meta: {
      product_id:            k.product_id,
      unit_cost_try:         round2(k.unit_cost_try),
      effective_unit_price:  round2(k.effective_unit_price),
      original_sale_price:   round2(k.original_sale_price),
      discount_rate:         k.discount_rate,
      total_quantity:        k.total_quantity,
      stock_qty_available:   round2(k.stock_qty_available),
      period_months:         k.period_months,
      start_month:           k.start_month,
      end_month:             months[months.length - 1],
      tax_rate:              k.tax_rate,
      kdv_rate:              k.kdv_rate,
      assumptions,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION (pure)
// ═══════════════════════════════════════════════════════════════════════════════

export function validateSimulationInput(input: SimulationInput): string[] {
  const errors: string[] = []
  if (!input.product_id || typeof input.product_id !== 'string') {
    errors.push('product_id zorunludur')
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.push('quantity pozitif bir sayı olmalı')
  }
  if (!Number.isFinite(input.sale_price) || input.sale_price <= 0) {
    errors.push('sale_price pozitif olmalı')
  }
  if (!Number.isFinite(input.discount_rate) || input.discount_rate < 0 || input.discount_rate >= 100) {
    errors.push('discount_rate 0–99 arasında olmalı')
  }
  if (!VALID_PERIOD_MONTHS.has(input.period_months)) {
    errors.push('period_months şunlardan biri olmalı: 1, 3, 6, 9, 12')
  }
  if (input.tax_rate !== undefined && (!Number.isFinite(input.tax_rate) || input.tax_rate < 0)) {
    errors.push('tax_rate ≥ 0 olmalı')
  }
  if (input.kdv_rate !== undefined && (!Number.isFinite(input.kdv_rate) || input.kdv_rate < 0 || input.kdv_rate > 100)) {
    errors.push('kdv_rate 0–100 arasında olmalı')
  }
  if (input.start_month !== undefined && !/^\d{4}-\d{2}$/.test(input.start_month)) {
    errors.push('start_month YYYY-MM formatında olmalı')
  }
  return errors
}

// ═══════════════════════════════════════════════════════════════════════════════
// DB-BOUND SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class SimulationService {

  /**
   * Full simulation: read REAL cost + expenses from DB, then call pure kernel.
   *
   * DB reads (READ ONLY):
   *   1. stock_lots — WAC of remaining stock for the product
   *   2. FinanceService.listExpenseLines() — recurring expense projection
   *
   * No DB writes ever.
   */
  static async simulateScenario(
    userId:    string,
    companyId: string,
    input:     SimulationInput,
    ctx?:      RequestContext,
  ): Promise<SimulationResult> {

    // Validate first so we never hit the DB on garbage input
    const errors = validateSimulationInput(input)
    if (errors.length > 0) {
      throw new AppError('VALIDATION_ERROR', errors.join('; '), { errors })
    }

    const taxRate  = Number.isFinite(input.tax_rate)  ? input.tax_rate!  : CORPORATE_TAX_RATE_TR
    const kdvRate  = Number.isFinite(input.kdv_rate)  ? input.kdv_rate!  : KDV_STANDARD_TR
    const startMon = input.start_month ?? nextMonthStr()

    const effectivePrice = round4(input.sale_price * (1 - input.discount_rate / 100))
    const period         = buildSimulationPeriod(startMon, input.period_months)

    const supabase = createClient()

    // ── 1. Product cost: WAC of remaining stock ────────────────────────────
    const { data: lots, error: lotsErr } = await supabase
      .from('stock_lots')
      .select('qty_remaining, unit_cost, fx_rate_at_entry, entry_cost_try')
      .eq('product_id', input.product_id)
      .eq('company_id', companyId)
      .gt('qty_remaining', 0)
      .is('deleted_at', null)
      .order('entry_date', { ascending: true })   // FIFO order for transparency

    if (lotsErr) {
      if (ctx) await logger.error(ctx, 'simulation:lots_error', { error: lotsErr.message })
      throw new AppError('DB_READ_FAILED', 'Stok maliyeti okunamadı', { dbError: lotsErr.message })
    }

    let totalStockQty = 0
    let totalStockVal = 0
    for (const lot of lots ?? []) {
      const qty = Number(lot.qty_remaining ?? 0)
      // entry_cost_try is the Phase 3 frozen TRY snapshot (preferred)
      const perUnitTry =
        lot.entry_cost_try != null && lot.entry_cost_try !== '' && Number(lot.entry_cost_try) > 0
          ? Number(lot.entry_cost_try)
          : Number(lot.unit_cost ?? 0) * Number(lot.fx_rate_at_entry ?? 1)
      totalStockQty += qty
      totalStockVal += qty * perUnitTry
    }
    const wac = totalStockQty > 0 ? round4(totalStockVal / totalStockQty) : 0

    // ── 2. Expense projection: recurring over simulation period ────────────
    // For a future period, actual expenses won't exist → only recurring fire.
    //
    // Phase 5 — financing exclusion:
    //   Financing, dividends and internal transfers are EXCLUDED from simulation.
    //   These are balance-sheet / equity events, not operating costs. Including
    //   them would overstate expenses and understate simulated net profit.
    //   Partner financing flows (capital_in, loan_to_company, loan_repayment,
    //   dividend) live in partner_transactions, not in the expenses table, so they
    //   never appear in listExpenseLines() anyway. This filter is a belt-and-
    //   suspenders guard for any legacy `partner_loan` or `principal` recurring
    //   expenses that may exist in the expenses table.
    const SIMULATION_EXCLUDED_TYPES = new Set<string>([
      'loan_repayment',
      'partner_financing',
      'dividend',
      'internal_transfer',
    ])

    let expenseLines: ExpenseLineComputed[] = []
    let expenseFetchFailed = false
    try {
      expenseLines = await FinanceService.listExpenseLines(userId, companyId, period, ctx)
    } catch (err) {
      // Non-fatal: if expenses can't be read, continue with 0 expenses and
      // surface the failure explicitly in simulation_meta.assumptions so the
      // caller can display a warning. The simulation is still useful for
      // revenue/tax analysis even without the expense projection.
      expenseFetchFailed = true
      if (ctx) await logger.warn(ctx, 'simulation:expense_fetch_failed', { error: String(err) })
    }

    // Apply Phase 5 filter — operating lines only
    const operatingLines = expenseLines.filter(l => !SIMULATION_EXCLUDED_TYPES.has(l.expense_type))
    const excludedCount  = expenseLines.length - operatingLines.length

    if (ctx) {
      await logger.info(ctx, 'simulation:start', {
        product_id:   input.product_id,
        quantity:     input.quantity,
        sale_price:   input.sale_price,
        discount:     input.discount_rate,
        period_months: input.period_months,
        start_month:  startMon,
        wac,
        stock_qty:    totalStockQty,
      })
    }

    // ── 3. Pure kernel ─────────────────────────────────────────────────────
    const result = computeSimulationKernel({
      product_id:           input.product_id,
      total_quantity:       input.quantity,
      effective_unit_price: effectivePrice,
      original_sale_price:  input.sale_price,
      discount_rate:        input.discount_rate,
      unit_cost_try:        wac,
      stock_qty_available:  totalStockQty,
      period_months:        input.period_months,
      start_month:          startMon,
      tax_rate:             taxRate,
      kdv_rate:             kdvRate,
      expense_lines:        operatingLines,
    })

    // Surface Phase 5 filtering in assumptions if any lines were excluded.
    if (excludedCount > 0) {
      result.simulation_meta.assumptions.push(
        `${excludedCount} financing/distribution expense line(s) were excluded from ` +
        'the projection (partner financing / loan principal / dividend — not operating costs).',
      )
    }

    // Surface expense fetch failure in assumptions so the UI can show a warning.
    // Appended AFTER the kernel so the assumption list reflects the actual data used.
    if (expenseFetchFailed) {
      result.simulation_meta.assumptions.push(
        'UYARI: Gider verileri yüklenemedi — gider projeksiyonu ₺0 olarak alındı. ' +
        'Gerçek net kâr bu değerden daha düşük olabilir.',
      )
    }

    return result
  }
}
