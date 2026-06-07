// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/working-capital-optimization.service.ts
//
// Working Capital Optimization — identifies cash release opportunities
// by analyzing receivables, inventory, and payables gaps vs Turkish SME benchmarks.
//
// Turkish SME benchmarks:
//   DSO = 30 days (Days Sales Outstanding)
//   DPO = 45 days (Days Payable Outstanding)
//   DIO = 30 days (Days Inventory Outstanding)
//   CCC = 15 days (Cash Conversion Cycle = DSO + DIO - DPO)
//
// Pure functions exported for testing:
//   computeCashConversionCycle
//   computeWorkingCapitalGap
//   computeCashReleasePotential
//   classifyGapPriority
//   generateReceivablesRecommendation
//   generateInventoryRecommendation
//   generatePayablesRecommendation
//   buildWorkingCapitalGaps
//   computeTotalCashReleasePotential
//   classifyWorkingCapitalEfficiency
//   computeWorkingCapitalRatio
//   computeNetWorkingCapital
//   identifyTopAction
//
// Class: WorkingCapitalOptimizationService
//   getReport(companyId) → WorkingCapitalOptimizationReport
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Benchmarks ────────────────────────────────────────────────────────────────

export const WC_BENCHMARKS = {
  dso: 30,
  dpo: 45,
  dio: 30,
  ccc: 15,
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkingCapitalGap {
  dimension: 'receivables' | 'inventory' | 'payables'
  label: string
  actual_days: number
  benchmark_days: number
  gap_days: number
  cash_impact_try: number
  priority: 'high' | 'medium' | 'low' | 'none'
  recommendation: string
}

export interface WorkingCapitalOptimizationReport {
  ccc_days: number
  efficiency: ReturnType<typeof classifyWorkingCapitalEfficiency>
  net_working_capital_try: number
  working_capital_ratio_pct: number | null
  total_cash_release_potential_try: number
  gaps: WorkingCapitalGap[]
  top_action: WorkingCapitalGap | null
  actuals: {
    dso_days: number
    dio_days: number
    dpo_days: number
    daily_revenue_try: number
    daily_cogs_try: number
  }
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute Cash Conversion Cycle.
 * CCC = DSO + DIO - DPO
 */
export function computeCashConversionCycle(dso: number, dio: number, dpo: number): number {
  return dso + dio - dpo
}

/**
 * Compute gap vs benchmark (always >= 0).
 * Positive gap = actual is worse than benchmark → opportunity exists.
 * For receivables/inventory: actual > benchmark → gap = actual - benchmark
 * For payables: actual < benchmark → gap = benchmark - actual (DPO shortfall)
 * Returns 0 if at or better than benchmark.
 */
export function computeWorkingCapitalGap(
  dimension: 'receivables' | 'inventory' | 'payables',
  actualDays: number,
  benchmarkDays: number,
): number {
  if (dimension === 'payables') {
    // Higher DPO is better; shortfall = how much below benchmark
    return Math.max(0, benchmarkDays - actualDays)
  }
  // Lower DSO / DIO is better; gap = excess above benchmark
  return Math.max(0, actualDays - benchmarkDays)
}

/**
 * Estimate cash release potential from closing the gap.
 * receivables/inventory: daily_revenue × gap_days
 * payables: daily_cogs × gap_days
 */
export function computeCashReleasePotential(
  dimension: 'receivables' | 'inventory' | 'payables',
  gapDays: number,
  dailyRevenueTry: number,
  dailyCogsTry: number,
): number {
  if (gapDays <= 0) return 0
  if (dimension === 'payables') {
    return dailyCogsTry * gapDays
  }
  return dailyRevenueTry * gapDays
}

/**
 * Classify gap priority.
 * high: gap > 15 days
 * medium: gap > 7 days
 * low: gap > 0 days (≤ 7)
 * none: gap = 0 (at or better than benchmark)
 */
export function classifyGapPriority(gapDays: number): 'high' | 'medium' | 'low' | 'none' {
  if (gapDays > 15) return 'high'
  if (gapDays > 7)  return 'medium'
  if (gapDays > 0)  return 'low'
  return 'none'
}

/**
 * Format TRY amount for Turkish recommendation text.
 */
function fmtTRY(amount: number): string {
  return `₺${Math.round(amount).toLocaleString('tr-TR')}`
}

/**
 * Generate Turkish recommendation for receivables gap.
 */
export function generateReceivablesRecommendation(
  actualDso: number,
  benchmarkDso: number,
  cashImpact: number,
): string {
  if (actualDso <= benchmarkDso) {
    return `Tahsilat süreniz ${Math.round(actualDso)} gün ile hedef ${benchmarkDso} günün altında. Mevcut tahsilat sürecinizi koruyun.`
  }
  return `Tahsilat sürenizi ${Math.round(actualDso)} günden ${benchmarkDso} güne indirerek ${fmtTRY(cashImpact)} nakit açığa çıkarabilirsiniz. Erken ödeme indirimi veya aktif takip önerilir.`
}

/**
 * Generate Turkish recommendation for inventory gap.
 */
export function generateInventoryRecommendation(
  actualDio: number,
  benchmarkDio: number,
  cashImpact: number,
): string {
  if (actualDio <= benchmarkDio) {
    return `Stok tutma süreniz ${Math.round(actualDio)} gün ile hedef ${benchmarkDio} günün altında. Stok yönetimi verimli seyrediyor.`
  }
  return `Stok tutma sürenizi ${Math.round(actualDio)}→${benchmarkDio} güne düşürerek ${fmtTRY(cashImpact)} sermaye serbest bırakılabilir. Sipariş sıklığı artırılması önerilir.`
}

/**
 * Generate Turkish recommendation for payables gap.
 */
export function generatePayablesRecommendation(
  actualDpo: number,
  benchmarkDpo: number,
  cashImpact: number,
): string {
  if (actualDpo >= benchmarkDpo) {
    return `Tedarikçi vade süreniz ${Math.round(actualDpo)} gün ile hedef ${benchmarkDpo} günün üzerinde. Mevcut ödeme vadelerinizi koruyun.`
  }
  return `Tedarikçi vade sürelerinizi ${Math.round(actualDpo)}→${benchmarkDpo} güne uzatarak ${fmtTRY(cashImpact)} nakit akışı iyileştirilebilir.`
}

/**
 * Build complete gap analysis for all 3 dimensions.
 * Always returns 3 gaps (even if gap = 0).
 */
export function buildWorkingCapitalGaps(
  dso: number,
  dio: number,
  dpo: number,
  dailyRevenueTry: number,
  dailyCogsTry: number,
): WorkingCapitalGap[] {
  // Receivables
  const receivablesGap = computeWorkingCapitalGap('receivables', dso, WC_BENCHMARKS.dso)
  const receivablesCash = computeCashReleasePotential('receivables', receivablesGap, dailyRevenueTry, dailyCogsTry)
  const receivablesPriority = classifyGapPriority(receivablesGap)

  // Inventory
  const inventoryGap = computeWorkingCapitalGap('inventory', dio, WC_BENCHMARKS.dio)
  const inventoryCash = computeCashReleasePotential('inventory', inventoryGap, dailyRevenueTry, dailyCogsTry)
  const inventoryPriority = classifyGapPriority(inventoryGap)

  // Payables
  const payablesGap = computeWorkingCapitalGap('payables', dpo, WC_BENCHMARKS.dpo)
  const payablesCash = computeCashReleasePotential('payables', payablesGap, dailyRevenueTry, dailyCogsTry)
  const payablesPriority = classifyGapPriority(payablesGap)

  return [
    {
      dimension: 'receivables',
      label: 'Alacak Tahsilat Süresi (DSO)',
      actual_days: dso,
      benchmark_days: WC_BENCHMARKS.dso,
      gap_days: receivablesGap,
      cash_impact_try: receivablesCash,
      priority: receivablesPriority,
      recommendation: generateReceivablesRecommendation(dso, WC_BENCHMARKS.dso, receivablesCash),
    },
    {
      dimension: 'inventory',
      label: 'Stok Tutma Süresi (DIO)',
      actual_days: dio,
      benchmark_days: WC_BENCHMARKS.dio,
      gap_days: inventoryGap,
      cash_impact_try: inventoryCash,
      priority: inventoryPriority,
      recommendation: generateInventoryRecommendation(dio, WC_BENCHMARKS.dio, inventoryCash),
    },
    {
      dimension: 'payables',
      label: 'Tedarikçi Ödeme Vadesi (DPO)',
      actual_days: dpo,
      benchmark_days: WC_BENCHMARKS.dpo,
      gap_days: payablesGap,
      cash_impact_try: payablesCash,
      priority: payablesPriority,
      recommendation: generatePayablesRecommendation(dpo, WC_BENCHMARKS.dpo, payablesCash),
    },
  ]
}

/**
 * Total cash release potential (sum of all gaps).
 */
export function computeTotalCashReleasePotential(gaps: WorkingCapitalGap[]): number {
  return gaps.reduce((sum, g) => sum + g.cash_impact_try, 0)
}

/**
 * Classify overall working capital efficiency by CCC.
 * excellent: CCC ≤ 0
 * good: CCC ≤ 15
 * adequate: CCC ≤ 30
 * poor: CCC ≤ 60
 * critical: CCC > 60
 */
export function classifyWorkingCapitalEfficiency(
  ccc: number,
): 'excellent' | 'good' | 'adequate' | 'poor' | 'critical' {
  if (ccc <= 0)  return 'excellent'
  if (ccc <= 15) return 'good'
  if (ccc <= 30) return 'adequate'
  if (ccc <= 60) return 'poor'
  return 'critical'
}

/**
 * Compute working capital as % of revenue.
 * working_capital = receivables + inventory - payables
 * Returns null if revenue = 0.
 */
export function computeWorkingCapitalRatio(
  receivablesTry: number,
  inventoryTry: number,
  payablesTry: number,
  monthlyRevenueTry: number,
): number | null {
  if (monthlyRevenueTry === 0) return null
  const workingCapital = receivablesTry + inventoryTry - payablesTry
  return (workingCapital / monthlyRevenueTry) * 100
}

/**
 * Compute Net Working Capital.
 * NWC = current assets - current liabilities
 */
export function computeNetWorkingCapital(
  currentAssets: number,
  currentLiabilities: number,
): number {
  return currentAssets - currentLiabilities
}

/**
 * Identify the single highest-priority optimization action.
 * Returns the gap with 'high' priority and highest cash_impact_try.
 * If no 'high' priority gaps, returns highest 'medium' gap.
 * Returns null if no gaps > 0.
 */
export function identifyTopAction(gaps: WorkingCapitalGap[]): WorkingCapitalGap | null {
  const activeGaps = gaps.filter(g => g.gap_days > 0)
  if (activeGaps.length === 0) return null

  // Try 'high' priority first
  const highGaps = activeGaps.filter(g => g.priority === 'high')
  if (highGaps.length > 0) {
    return highGaps.reduce((best, g) => g.cash_impact_try > best.cash_impact_try ? g : best)
  }

  // Fall back to 'medium', then 'low'
  const mediumGaps = activeGaps.filter(g => g.priority === 'medium')
  if (mediumGaps.length > 0) {
    return mediumGaps.reduce((best, g) => g.cash_impact_try > best.cash_impact_try ? g : best)
  }

  return activeGaps.reduce((best, g) => g.cash_impact_try > best.cash_impact_try ? g : best)
}

// ── Service class ──────────────────────────────────────────────────────────────

export class WorkingCapitalOptimizationService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<WorkingCapitalOptimizationReport> {
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const ninetyDaysAgo = new Date(today)
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
    const fromStr = ninetyDaysAgo.toISOString().slice(0, 10)

    // ── Parallel data fetch ────────────────────────────────────────────────────
    const [
      salesResult,
      unpaidSalesResult,
      expensesResult,
      unpaidExpensesResult,
      inventoryResult,
    ] = await Promise.all([
      // All sales in last 90 days for revenue
      this.supabase
        .from('sales')
        .select('total_try, sale_date, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', fromStr)
        .lte('sale_date', todayStr),

      // Unpaid/overdue/partial sales for DSO and receivables balance
      this.supabase
        .from('sales')
        .select('total_try, sale_date, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .gte('sale_date', fromStr)
        .lte('sale_date', todayStr),

      // All expenses in last 90 days
      this.supabase
        .from('expenses')
        .select('amount_try, expense_date, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', fromStr)
        .lte('expense_date', todayStr),

      // Unpaid expenses for DPO
      this.supabase
        .from('expenses')
        .select('amount_try, expense_date, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'pending')
        .gte('expense_date', fromStr)
        .lte('expense_date', todayStr),

      // Stock lots for inventory value
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),
    ])

    const sales           = salesResult.data           ?? []
    const unpaidSales     = unpaidSalesResult.data     ?? []
    const expenses        = expensesResult.data        ?? []
    const unpaidExpenses  = unpaidExpensesResult.data  ?? []
    const stockLots       = inventoryResult.data       ?? []

    // ── Revenue & COGS ─────────────────────────────────────────────────────────
    const totalRevenue90 = sales.reduce(
      (sum: number, s: { total_try: string | number }) => sum + (Number(s.total_try) || 0),
      0,
    )
    const dailyRevenueTry = totalRevenue90 / 90

    // ── Receivables balance and DSO ────────────────────────────────────────────
    const totalReceivables = unpaidSales.reduce(
      (sum: number, s: { total_try: string | number }) => sum + (Number(s.total_try) || 0),
      0,
    )

    // DSO: avg days from sale_date to today for unpaid sales in period
    let dso_days: number
    if (unpaidSales.length > 0) {
      const totalDays = unpaidSales.reduce(
        (sum: number, s: { sale_date: string }) => {
          if (!s.sale_date) return sum
          const saleDate = new Date(s.sale_date + 'T00:00:00Z').getTime()
          const nowMs    = today.getTime()
          const d        = Math.max(0, Math.round((nowMs - saleDate) / 86_400_000))
          return sum + d
        },
        0,
      )
      dso_days = Math.round(totalDays / unpaidSales.length)
    } else {
      // fallback: formula method (receivables / daily_revenue)
      dso_days = dailyRevenueTry > 0
        ? Math.round(totalReceivables / dailyRevenueTry)
        : WC_BENCHMARKS.dso
    }

    // ── Expenses & DPO ─────────────────────────────────────────────────────────
    const totalExpenses = expenses.reduce(
      (sum: number, e: { amount_try: string | number }) => sum + (Number(e.amount_try) || 0),
      0,
    )
    const totalPayables = unpaidExpenses.reduce(
      (sum: number, e: { amount_try: string | number }) => sum + (Number(e.amount_try) || 0),
      0,
    )

    // DPO: average days between expense_date and today for unpaid expenses
    let dpo_days: number
    if (unpaidExpenses.length > 0) {
      const totalDays = unpaidExpenses.reduce(
        (sum: number, e: { expense_date: string }) => {
          if (!e.expense_date) return sum
          const expDate = new Date(e.expense_date + 'T00:00:00Z').getTime()
          const nowMs   = today.getTime()
          const d       = Math.max(0, Math.round((nowMs - expDate) / 86_400_000))
          return sum + d
        },
        0,
      )
      dpo_days = Math.round(totalDays / unpaidExpenses.length)
    } else {
      // No payable data → at benchmark (no gap)
      dpo_days = WC_BENCHMARKS.dpo
    }

    // ── Inventory & DIO ────────────────────────────────────────────────────────
    const inventoryValue = stockLots.reduce(
      (sum: number, lot: { qty_remaining: number; cost_price_try: string | number }) =>
        sum + (Number(lot.qty_remaining) || 0) * (Number(lot.cost_price_try) || 0),
      0,
    )

    // COGS estimate: use actual total expense as proxy if available, else 40% of revenue
    const totalCogs90 = totalExpenses > 0 ? totalExpenses * 0.6 : totalRevenue90 * 0.40
    const dailyCogsTry = totalCogs90 / 90

    let dio_days: number
    if (inventoryValue > 0 && dailyCogsTry > 0) {
      // DIO = inventory / (COGS / 30) = inventory_value / daily_cogs
      dio_days = Math.round(inventoryValue / dailyCogsTry)
    } else {
      // No inventory data → use benchmark default
      dio_days = WC_BENCHMARKS.dio
    }

    // ── Build gaps and report ──────────────────────────────────────────────────
    const gaps = buildWorkingCapitalGaps(dso_days, dio_days, dpo_days, dailyRevenueTry, dailyCogsTry)
    const ccc_days = computeCashConversionCycle(dso_days, dio_days, dpo_days)
    const efficiency = classifyWorkingCapitalEfficiency(ccc_days)
    const total_cash_release = computeTotalCashReleasePotential(gaps)
    const top_action = identifyTopAction(gaps)

    // NWC: current assets = receivables + inventory; current liabilities = payables
    const net_working_capital_try = computeNetWorkingCapital(
      totalReceivables + inventoryValue,
      totalPayables,
    )

    // Monthly revenue for ratio (last 90 days / 3)
    const monthlyRevenue = totalRevenue90 / 3
    const working_capital_ratio_pct = computeWorkingCapitalRatio(
      totalReceivables,
      inventoryValue,
      totalPayables,
      monthlyRevenue,
    )

    return {
      ccc_days,
      efficiency,
      net_working_capital_try,
      working_capital_ratio_pct,
      total_cash_release_potential_try: total_cash_release,
      gaps,
      top_action,
      actuals: {
        dso_days,
        dio_days,
        dpo_days,
        daily_revenue_try: dailyRevenueTry,
        daily_cogs_try: dailyCogsTry,
      },
    }
  }
}
