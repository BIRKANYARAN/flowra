// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/treasury-position.service.ts
//
// Treasury Cash Position Service — multi-period cash view, cash velocity,
// liquidity ratios, and short-term cash planning for Turkish SMEs.
//
// Pure exported functions + TreasuryPositionService class.
// No external dependencies beyond @supabase/supabase-js.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ═══════════════════════════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

export interface CashPosition {
  as_of_date: string                     // YYYY-MM-DD
  cash_on_hand_try: number               // account 100 (Kasa)
  bank_deposits_try: number              // account 102 (Bankalar)
  total_cash_try: number                 // cash_on_hand + bank_deposits
  short_term_receivables_try: number     // account 120 (Alıcılar — due in < 30 days)
  total_liquid_try: number               // cash + short_term_receivables
  short_term_payables_try: number        // account 320 (Satıcılar — due in < 30 days)
  net_liquidity_try: number              // total_liquid - short_term_payables
}

export interface CashFlowProjection {
  week: number                           // 1-based (1=this week, 2=next week, etc.)
  week_label: string                     // "Bu hafta", "Gelecek hafta", "2. hafta", etc.
  projected_inflows_try: number          // expected receivables + recurring income
  projected_outflows_try: number         // expected payables + recurring expenses
  net_cash_flow_try: number              // inflows - outflows
  cumulative_cash_try: number            // starting cash + cumulative net
  is_negative: boolean
}

export interface TreasuryPositionReport {
  as_of_date: string
  cash_position: CashPosition

  ratios: {
    current_ratio: number | null
    quick_ratio: number | null
    cash_ratio: number | null
    cash_velocity: number | null
    days_cash_on_hand: number | null
    working_capital_turnover: number | null
  }

  liquidity_classification: ReturnType<typeof classifyLiquidityPosition>
  days_cash_health: ReturnType<typeof classifyDaysCashOnHand>
  treasury_health_score: number

  monthly_burn_rate: number              // positive = burning
  runway_months: number | null

  cash_flow_projection: CashFlowProjection[]  // 4 weeks

  alerts: string[]                       // Turkish alert messages
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute current ratio = currentAssets / currentLiabilities.
 * Returns null if currentLiabilities === 0.
 */
export function computeCurrentRatio(
  currentAssets: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return currentAssets / currentLiabilities
}

/**
 * Compute quick ratio = (currentAssets - inventory) / currentLiabilities.
 * Returns null if currentLiabilities === 0.
 */
export function computeQuickRatio(
  currentAssets: number,
  inventory: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return (currentAssets - inventory) / currentLiabilities
}

/**
 * Compute cash ratio = totalCash / currentLiabilities.
 * Most conservative liquidity measure.
 * Returns null if currentLiabilities === 0.
 */
export function computeCashRatio(
  totalCash: number,
  currentLiabilities: number,
): number | null {
  if (currentLiabilities === 0) return null
  return totalCash / currentLiabilities
}

/**
 * Classify liquidity position:
 *   strong:    current_ratio >= 2.0
 *   adequate:  current_ratio >= 1.5
 *   tight:     current_ratio >= 1.0
 *   critical:  current_ratio < 1.0
 *   insolvent: net_liquidity < 0 (cash can't cover short-term payables)
 */
export function classifyLiquidityPosition(
  currentRatio: number | null,
  netLiquidity: number,
): 'strong' | 'adequate' | 'tight' | 'critical' | 'insolvent' {
  if (netLiquidity < 0) return 'insolvent'
  if (currentRatio === null) return 'critical'
  if (currentRatio >= 2.0) return 'strong'
  if (currentRatio >= 1.5) return 'adequate'
  if (currentRatio >= 1.0) return 'tight'
  return 'critical'
}

/**
 * Compute cash velocity = monthlyRevenue / totalCash.
 * How many times cash "turns" per month.
 * Returns null if totalCash === 0.
 */
export function computeCashVelocity(
  monthlyRevenue: number,
  totalCash: number,
): number | null {
  if (totalCash === 0) return null
  return monthlyRevenue / totalCash
}

/**
 * Compute days cash on hand = totalCash / (monthlyOperatingExpenses / 30).
 * Returns null if monthlyOperatingExpenses === 0.
 */
export function computeDaysCashOnHand(
  totalCash: number,
  monthlyOperatingExpenses: number,
): number | null {
  if (monthlyOperatingExpenses === 0) return null
  return totalCash / (monthlyOperatingExpenses / 30)
}

/**
 * Classify days cash on hand health:
 *   excellent: >= 90 days
 *   good:      >= 60 days
 *   adequate:  >= 30 days
 *   low:       >= 14 days
 *   critical:  < 14 days
 *   unknown:   null input
 */
export function classifyDaysCashOnHand(
  days: number | null,
): 'excellent' | 'good' | 'adequate' | 'low' | 'critical' | 'unknown' {
  if (days === null) return 'unknown'
  if (days >= 90) return 'excellent'
  if (days >= 60) return 'good'
  if (days >= 30) return 'adequate'
  if (days >= 14) return 'low'
  return 'critical'
}

/**
 * Compute cash burn rate per month.
 * burn = monthlyExpenses - monthlyRevenue
 * Positive = burning cash, negative = generating cash.
 */
export function computeCashBurnRate(
  monthlyRevenue: number,
  monthlyExpenses: number,
): number {
  return monthlyExpenses - monthlyRevenue
}

/**
 * Estimate runway from current cash position.
 * runway = totalCash / monthlyBurn (only if burning, i.e., burn > 0).
 * Returns null if not burning (revenue >= expenses).
 */
export function estimateRunwayFromCash(
  totalCash: number,
  monthlyBurn: number,
): number | null {
  if (monthlyBurn <= 0) return null
  return totalCash / monthlyBurn
}

/**
 * Build 4-week cash flow projection.
 * Week labels: "Bu hafta", "Gelecek hafta", "2. hafta", "3. hafta"
 */
export function buildCashFlowProjection(
  startingCash: number,
  weeklyInflows: number,
  weeklyOutflows: number,
): CashFlowProjection[] {
  const weekLabels = ['Bu hafta', 'Gelecek hafta', '2. hafta', '3. hafta']
  const projections: CashFlowProjection[] = []
  let cumulative = startingCash

  for (let i = 0; i < 4; i++) {
    const netCashFlow = weeklyInflows - weeklyOutflows
    cumulative = cumulative + netCashFlow

    projections.push({
      week: i + 1,
      week_label: weekLabels[i],
      projected_inflows_try: weeklyInflows,
      projected_outflows_try: weeklyOutflows,
      net_cash_flow_try: netCashFlow,
      cumulative_cash_try: cumulative,
      is_negative: cumulative < 0,
    })
  }

  return projections
}

/**
 * Compute cash concentration risk.
 * risk_pct = largest_single_balance / total_cash × 100
 * Returns 0 if single account, empty, or total is 0.
 */
export function computeCashConcentrationRisk(
  cashBalances: number[],
): number {
  if (cashBalances.length <= 1) return 0
  const total = cashBalances.reduce((s, b) => s + b, 0)
  if (total === 0) return 0
  const largest = Math.max(...cashBalances)
  return (largest / total) * 100
}

/**
 * Compute working capital turnover = revenue / net_working_capital.
 * net_working_capital = currentAssets - currentLiabilities.
 * Returns null if net_working_capital <= 0.
 */
export function computeWorkingCapitalTurnover(
  annualRevenue: number,
  currentAssets: number,
  currentLiabilities: number,
): number | null {
  const nwc = currentAssets - currentLiabilities
  if (nwc <= 0) return null
  return annualRevenue / nwc
}

/**
 * Compute treasury health score (0-100).
 *
 * Weights:
 *   days_cash (40%):         null→40; <14→0; <30→25; <60→50; <90→75; ≥90→100
 *   current_ratio (35%):     null→35; <1→0; <1.5→50; <2→75; ≥2→100
 *   net_liquidity (25%):     based on net_liquidity / totalCash ratio
 */
export function computeTreasuryHealthScore(
  daysCashOnHand: number | null,
  currentRatio: number | null,
  netLiquidity: number,
  totalCash: number,
): number {
  // Days cash component (40%)
  let daysCashRaw: number
  if (daysCashOnHand === null) {
    daysCashRaw = 40
  } else if (daysCashOnHand >= 90) {
    daysCashRaw = 100
  } else if (daysCashOnHand >= 60) {
    daysCashRaw = 75
  } else if (daysCashOnHand >= 30) {
    daysCashRaw = 50
  } else if (daysCashOnHand >= 14) {
    daysCashRaw = 25
  } else {
    daysCashRaw = 0
  }
  const daysCashComponent = daysCashRaw * 0.40

  // Current ratio component (35%)
  let ratioRaw: number
  if (currentRatio === null) {
    ratioRaw = 35
  } else if (currentRatio >= 2.0) {
    ratioRaw = 100
  } else if (currentRatio >= 1.5) {
    ratioRaw = 75
  } else if (currentRatio >= 1.0) {
    ratioRaw = 50
  } else {
    ratioRaw = 0
  }
  const ratioComponent = ratioRaw * 0.35

  // Net liquidity component (25%)
  let liquidityRaw: number
  if (netLiquidity < 0) {
    liquidityRaw = 0
  } else if (totalCash === 0) {
    liquidityRaw = netLiquidity > 0 ? 50 : 0
  } else {
    // Net liquidity as % of total cash — capped at 100
    const ratio = netLiquidity / totalCash
    liquidityRaw = Math.min(100, Math.max(0, ratio * 50))
  }
  const liquidityComponent = liquidityRaw * 0.25

  const total = daysCashComponent + ratioComponent + liquidityComponent
  return Math.min(100, Math.max(0, Math.round(total * 10) / 10))
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function formatTRY(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

function buildAlerts(
  report: Omit<TreasuryPositionReport, 'alerts'>,
): string[] {
  const alerts: string[] = []

  const { cash_position, ratios, liquidity_classification, days_cash_health, monthly_burn_rate, runway_months } = report

  if (liquidity_classification === 'insolvent') {
    alerts.push('KRİTİK: Net likidite negatif — nakit, kısa vadeli yükümlülükleri karşılamıyor. Acil finansman değerlendirmesi gerekli.')
  } else if (liquidity_classification === 'critical') {
    alerts.push('UYARI: Cari oran 1.0\'ın altında — dönen varlıklar kısa vadeli borçları karşılamıyor.')
  }

  if (days_cash_health === 'critical') {
    alerts.push(`KRİTİK: Elinizdeki nakit yalnızca ${ratios.days_cash_on_hand?.toFixed(0) ?? '<14'} günlük gideri karşılıyor. Hemen tahsilat artırın veya giderleri kısın.`)
  } else if (days_cash_health === 'low') {
    alerts.push(`UYARI: ${ratios.days_cash_on_hand?.toFixed(0) ?? '—'} günlük nakit rezervi mevcut. Kısa vadeli likidite planı gözden geçirilmeli.`)
  }

  if (runway_months !== null && runway_months <= 2) {
    alerts.push(`KRİTİK: Mevcut yakma hızıyla nakit rezervi yalnızca ${runway_months.toFixed(1)} ay yetecek.`)
  } else if (runway_months !== null && runway_months <= 4) {
    alerts.push(`UYARI: ${runway_months.toFixed(1)} aylık nakit pisti mevcut. Tahsilat hızlandırılmalı veya kredi limiti artırılmalıdır.`)
  }

  if (monthly_burn_rate > 0 && cash_position.total_cash_try > 0) {
    alerts.push(`Aylık ${formatTRY(monthly_burn_rate)} TL nakit yakılıyor. Gelir — gider dengesini iyileştirmek için aksiyon alın.`)
  }

  if (ratios.current_ratio !== null && ratios.current_ratio < 1.0) {
    alerts.push('Cari oran kritik seviyede: Kısa vadeli borçlar dönen varlıkları aşıyor.')
  }

  return alerts
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class TreasuryPositionService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<TreasuryPositionReport> {
    const now     = new Date()
    const today   = now.toISOString().slice(0, 10)
    const yearStart = `${now.getFullYear()}-01-01`

    // Date 30 days ago (for short-term receivables/payables)
    const days30ago = new Date(now)
    days30ago.setDate(days30ago.getDate() - 30)
    const from30 = days30ago.toISOString().slice(0, 10)

    // Date 30 days ahead (upcoming payables)
    const days30ahead = new Date(now)
    days30ahead.setDate(days30ahead.getDate() + 30)
    const to30ahead = days30ahead.toISOString().slice(0, 10)

    // Current month range
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [
      balanceSheetRes,
      salesMonthRes,
      expensesMonthRes,
      salesAllRes,
      expensesAllRes,
      receivablesRes,
      payablesRes,
      stockLotsRes,
    ] = await Promise.allSettled([
      // Latest balance sheet snapshot
      this.supabase
        .from('balance_sheet_snapshots')
        .select('snapshot_date, total_assets_try, total_liabilities_try, current_assets_try, current_liabilities_try, retained_earnings_try')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // Current month sales (for monthly revenue)
      this.supabase
        .from('sales')
        .select('total_try, amount_paid, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', monthStart)
        .lte('sale_date', today),

      // Current month expenses (for monthly expenses)
      this.supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', monthStart)
        .lte('expense_date', today),

      // All-time paid sales (for total cash fallback)
      this.supabase
        .from('sales')
        .select('total_try, amount_paid, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('sale_date', today),

      // All-time expenses (for total cash fallback)
      this.supabase
        .from('expenses')
        .select('amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('expense_date', today),

      // Short-term receivables: unpaid sales due in < 30 days
      this.supabase
        .from('sales')
        .select('total_try, amount_paid')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'unpaid', 'overdue'])
        .gte('sale_date', from30)
        .lte('sale_date', today),

      // Short-term payables: unpaid expenses due in < 30 days
      this.supabase
        .from('expenses')
        .select('amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'unpaid'])
        .gte('expense_date', today)
        .lte('expense_date', to30ahead),

      // Inventory
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, cost_price_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gt('qty_remaining', 0),
    ])

    // ── Parse balance sheet snapshot ──────────────────────────────────────────
    type BSRow = {
      snapshot_date?: string | null
      total_assets_try?: number | null
      total_liabilities_try?: number | null
      current_assets_try?: number | null
      current_liabilities_try?: number | null
    }
    const bsRow: BSRow | null =
      balanceSheetRes.status === 'fulfilled' ? (balanceSheetRes.value.data as BSRow | null) : null

    // ── Parse sales ───────────────────────────────────────────────────────────
    type SaleRow = { total_try?: number | null; amount_paid?: number | null; payment_status?: string | null }

    const salesMonth: SaleRow[] =
      salesMonthRes.status === 'fulfilled' ? (salesMonthRes.value.data ?? []) : []
    const salesAll: SaleRow[] =
      salesAllRes.status === 'fulfilled' ? (salesAllRes.value.data ?? []) : []

    // ── Parse expenses ────────────────────────────────────────────────────────
    type ExpRow = { amount_try?: number | null; payment_status?: string | null; expense_type?: string | null }

    const NON_OPEX = new Set([
      'partner_financing', 'loan_repayment', 'dividend',
      'internal_transfer', 'partner_loan_interest', 'tax',
    ])

    const expensesMonth: ExpRow[] =
      expensesMonthRes.status === 'fulfilled' ? (expensesMonthRes.value.data ?? []) : []
    const expensesAll: ExpRow[] =
      expensesAllRes.status === 'fulfilled' ? (expensesAllRes.value.data ?? []) : []

    // ── Monthly revenue & expenses ────────────────────────────────────────────
    const monthlyRevenue = salesMonth.reduce((s, r) => {
      const amt = r.payment_status === 'paid'
        ? Number(r.total_try ?? 0)
        : r.payment_status === 'partial'
          ? Number(r.amount_paid ?? 0)
          : Number(r.total_try ?? 0) // accrue unpaid
      return s + amt
    }, 0)

    const monthlyExpenses = expensesMonth.reduce((s, e) => {
      const etype = String(e.expense_type ?? '')
      if (NON_OPEX.has(etype)) return s
      return s + Number(e.amount_try ?? 0)
    }, 0)

    // ── Total cash (from snapshot or fallback) ────────────────────────────────
    let totalCashOnHand = 0
    let bankDeposits = 0
    let currentAssets = 0
    let currentLiabilities = 0

    if (bsRow && bsRow.total_assets_try != null) {
      // Use balance sheet snapshot: split roughly as 30% on-hand, 70% bank
      const bsCurrentAssets = Number(bsRow.current_assets_try ?? 0)
      const bsCurrentLiab   = Number(bsRow.current_liabilities_try ?? 0)

      // Estimate cash components from current assets
      const estimatedCash = bsCurrentAssets * 0.4  // rough estimate
      totalCashOnHand = estimatedCash * 0.3
      bankDeposits    = estimatedCash * 0.7
      currentAssets   = bsCurrentAssets
      currentLiabilities = bsCurrentLiab
    } else {
      // Fallback: derive total cash from cumulative collections - paid expenses
      let totalCollected = 0
      let totalPaid = 0

      for (const s of salesAll) {
        const paid = s.payment_status === 'paid'
          ? Number(s.total_try ?? 0)
          : s.payment_status === 'partial'
            ? Number(s.amount_paid ?? 0)
            : 0
        totalCollected += paid
      }

      for (const e of expensesAll) {
        const ps = e.payment_status
        if (ps === 'paid' || ps === 'partial' || ps == null) {
          totalPaid += Number(e.amount_try ?? 0)
        }
      }

      const derived = Math.max(0, totalCollected - totalPaid)
      totalCashOnHand = derived * 0.3
      bankDeposits    = derived * 0.7

      // Estimate current assets/liabilities from transactional data
      const receivables_all: SaleRow[] =
        receivablesRes.status === 'fulfilled' ? (receivablesRes.value.data ?? []) : []
      const receivablesVal = receivables_all.reduce((s, r) =>
        s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

      type StockRow = { qty_remaining?: number | null; cost_price_try?: number | null }
      const stockRows: StockRow[] =
        stockLotsRes.status === 'fulfilled' ? (stockLotsRes.value.data ?? []) : []
      const inventoryVal = stockRows.reduce((s, r) =>
        s + Number(r.qty_remaining ?? 0) * Number(r.cost_price_try ?? 0), 0)

      currentAssets = derived + receivablesVal + inventoryVal
      currentLiabilities = 0  // no snapshot available
    }

    const totalCash = totalCashOnHand + bankDeposits

    // ── Short-term receivables & payables ─────────────────────────────────────
    type RecRow = { total_try?: number | null; amount_paid?: number | null }
    const recRows: RecRow[] =
      receivablesRes.status === 'fulfilled' ? (receivablesRes.value.data ?? []) : []
    const shortTermReceivables = recRows.reduce((s, r) =>
      s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

    type PayRow = { amount_try?: number | null; payment_status?: string | null }
    const payRows: PayRow[] =
      payablesRes.status === 'fulfilled' ? (payablesRes.value.data ?? []) : []
    const shortTermPayables = payRows.reduce((s, e) =>
      s + Number(e.amount_try ?? 0), 0)

    const totalLiquid = totalCash + shortTermReceivables
    const netLiquidity = totalLiquid - shortTermPayables

    // ── Inventory ─────────────────────────────────────────────────────────────
    type StockRow2 = { qty_remaining?: number | null; cost_price_try?: number | null }
    const stockRows2: StockRow2[] =
      stockLotsRes.status === 'fulfilled' ? (stockLotsRes.value.data ?? []) : []
    const inventoryValue = stockRows2.reduce((s, r) =>
      s + Number(r.qty_remaining ?? 0) * Number(r.cost_price_try ?? 0), 0)

    // ── Build cash position ───────────────────────────────────────────────────
    const cashPosition: CashPosition = {
      as_of_date:                today,
      cash_on_hand_try:          totalCashOnHand,
      bank_deposits_try:         bankDeposits,
      total_cash_try:            totalCash,
      short_term_receivables_try: shortTermReceivables,
      total_liquid_try:          totalLiquid,
      short_term_payables_try:   shortTermPayables,
      net_liquidity_try:         netLiquidity,
    }

    // ── Compute ratios ────────────────────────────────────────────────────────
    const currentRatio          = computeCurrentRatio(currentAssets, currentLiabilities)
    const quickRatio            = computeQuickRatio(currentAssets, inventoryValue, currentLiabilities)
    const cashRatio             = computeCashRatio(totalCash, currentLiabilities)
    const cashVelocity          = computeCashVelocity(monthlyRevenue, totalCash)
    const daysCashOnHand        = computeDaysCashOnHand(totalCash, monthlyExpenses)
    const annualRevenue         = monthlyRevenue * 12
    const wcTurnover            = computeWorkingCapitalTurnover(annualRevenue, currentAssets, currentLiabilities)

    const liquidityClassification = classifyLiquidityPosition(currentRatio, netLiquidity)
    const daysCashHealth          = classifyDaysCashOnHand(daysCashOnHand)
    const healthScore             = computeTreasuryHealthScore(daysCashOnHand, currentRatio, netLiquidity, totalCash)

    // ── Burn rate & runway ────────────────────────────────────────────────────
    const burnRate     = computeCashBurnRate(monthlyRevenue, monthlyExpenses)
    const runwayMonths = estimateRunwayFromCash(totalCash, burnRate)

    // ── 4-week projection ─────────────────────────────────────────────────────
    const weeklyInflows  = monthlyRevenue / 4.33
    const weeklyOutflows = monthlyExpenses / 4.33
    const cashFlowProjection = buildCashFlowProjection(totalCash, weeklyInflows, weeklyOutflows)

    // ── Assemble partial report for alerts ────────────────────────────────────
    const partialReport: Omit<TreasuryPositionReport, 'alerts'> = {
      as_of_date: today,
      cash_position: cashPosition,
      ratios: {
        current_ratio:           currentRatio,
        quick_ratio:             quickRatio,
        cash_ratio:              cashRatio,
        cash_velocity:           cashVelocity,
        days_cash_on_hand:       daysCashOnHand,
        working_capital_turnover: wcTurnover,
      },
      liquidity_classification: liquidityClassification,
      days_cash_health:         daysCashHealth,
      treasury_health_score:    healthScore,
      monthly_burn_rate:        burnRate,
      runway_months:            runwayMonths,
      cash_flow_projection:     cashFlowProjection,
    }

    const alerts = buildAlerts(partialReport)

    return { ...partialReport, alerts }
  }
}
