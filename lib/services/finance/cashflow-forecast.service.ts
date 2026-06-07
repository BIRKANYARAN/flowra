// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/cashflow-forecast.service.ts
//
// Cash Flow Forecasting Service — monthly multi-scenario forecast with
// exponential smoothing, debt service, runway analysis, and Turkish narrative.
//
// Pure helpers are exported for unit testing (no DB required).
// CashFlowForecastService class handles DB-connected report generation.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface MonthlyForecastPoint {
  month: string                     // 'YYYY-MM'
  revenue_forecast_try: number
  expense_forecast_try: number
  net_cash_flow_try: number
  cumulative_position_try: number
  debt_service_try: number
  adjusted_net_try: number
}

export interface ScenarioForecast {
  monthly: MonthlyForecastPoint[]
  runway_months: number | null
  runway_status: 'critical' | 'at_risk' | 'caution' | 'healthy'
  break_even_month: number | null
  final_cash_position_try: number
}

export interface CashFlowForecastReport {
  company_id: string
  generated_at: string
  forecast_months: number
  starting_cash_try: number
  historical_months_used: number
  baseline: ScenarioForecast
  worst_case: ScenarioForecast
  best_case: ScenarioForecast
  avg_monthly_burn_try: number | null
  cash_flow_trend: 'improving' | 'stable' | 'deteriorating' | 'insufficient_data'
  narrative: string
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Forecast next N months of revenue using exponential smoothing (alpha=0.3 default).
 * S_t = alpha * x_t + (1-alpha) * S_{t-1}
 * Forecast value = last smoothed value.
 * Returns array of forecastMonths zeros if historicalRevenue is empty.
 */
export function computeMonthlyRevenueForecast(
  historicalRevenue: number[],
  forecastMonths: number,
  alpha = 0.3,
): number[] {
  if (historicalRevenue.length === 0) {
    return Array(forecastMonths).fill(0)
  }

  // Apply exponential smoothing over historical data
  let smoothed = historicalRevenue[0]
  for (let i = 1; i < historicalRevenue.length; i++) {
    smoothed = alpha * historicalRevenue[i] + (1 - alpha) * smoothed
  }

  // Compute growth factor from first to last smoothed estimate
  // Use simple flat forecast: last smoothed value repeated
  return Array(forecastMonths).fill(smoothed)
}

/**
 * Forecast next N months of expenses using trend analysis.
 * Uses last 3 months avg + linear trend.
 * If fewer than 3 months available, uses available data.
 */
export function computeMonthlyExpenseForecast(
  historicalExpenses: number[],
  forecastMonths: number,
): number[] {
  if (historicalExpenses.length === 0) {
    return Array(forecastMonths).fill(0)
  }

  const n = historicalExpenses.length

  // Use last 3 (or fewer) months for recent avg
  const recentCount = Math.min(3, n)
  const recentSlice = historicalExpenses.slice(n - recentCount)
  const recentAvg = recentSlice.reduce((s, v) => s + v, 0) / recentCount

  // Linear trend: compare last half vs first half
  let trend = 0
  if (n >= 3) {
    const half = Math.floor(n / 2)
    const firstHalf = historicalExpenses.slice(0, half)
    const secondHalf = historicalExpenses.slice(n - half)
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
    // Monthly trend rate
    trend = (secondAvg - firstAvg) / Math.max(half, 1)
  }

  return Array.from({ length: forecastMonths }, (_, i) =>
    Math.max(0, recentAvg + trend * (i + 1)),
  )
}

/**
 * Compute net cash flow per month: revenue - expenses.
 * Arrays must be same length.
 */
export function computeNetCashFlowForecast(
  revenueForecast: number[],
  expenseForecast: number[],
): number[] {
  const len = Math.min(revenueForecast.length, expenseForecast.length)
  return Array.from({ length: len }, (_, i) => revenueForecast[i] - expenseForecast[i])
}

/**
 * Compute cumulative cash positions.
 * startingCash + cumulative sum of net cash flows.
 * Returns array of length = netCashFlows.length.
 */
export function computeCumulativeCashPosition(
  startingCash: number,
  netCashFlows: number[],
): number[] {
  let running = startingCash
  return netCashFlows.map(flow => {
    running += flow
    return running
  })
}

/**
 * How many months until cash < 0?
 * Returns null if never goes negative within the forecast.
 * Returns 0 if cashPositions[0] <= 0 (already negative on first position check,
 * meaning starting cash was already < 0 before any flows).
 *
 * Note: cashPositions are the cumulative positions AFTER each month's flows.
 * We check if starting cash (implied as cashPositions context) is already negative.
 * For this function: returns 0 if the very first position is negative,
 * otherwise returns the 1-indexed month where cash first goes < 0, or null.
 */
export function computeRunwayMonths(
  cashPositions: number[],
): number | null {
  if (cashPositions.length === 0) return null

  // If first position is negative, already in trouble
  if (cashPositions[0] < 0) return 0

  for (let i = 0; i < cashPositions.length; i++) {
    if (cashPositions[i] < 0) return i  // i months until negative (0-indexed means after i months)
  }

  return null  // never goes negative
}

/**
 * Classify runway status.
 * null (never runs out) → 'healthy'
 * >= 12 months → 'healthy'
 * >= 6 months → 'caution'
 * >= 3 months → 'at_risk'
 * < 3 months (including 0) → 'critical'
 */
export function classifyRunwayStatus(
  runwayMonths: number | null,
): 'critical' | 'at_risk' | 'caution' | 'healthy' {
  if (runwayMonths === null) return 'healthy'
  if (runwayMonths >= 12) return 'healthy'
  if (runwayMonths >= 6) return 'caution'
  if (runwayMonths >= 3) return 'at_risk'
  return 'critical'
}

/**
 * Worst-case scenario: reduce revenue by stressFactor (default 20%).
 * Returns revenueForecast with each value multiplied by (1 - stressFactor).
 */
export function computeWorstCaseAdjustment(
  revenueForecast: number[],
  stressFactor = 0.20,
): number[] {
  return revenueForecast.map(v => v * (1 - stressFactor))
}

/**
 * Best-case scenario: increase revenue by upsideFactor (default 15%).
 * Returns revenueForecast with each value multiplied by (1 + upsideFactor).
 */
export function computeBestCaseAdjustment(
  revenueForecast: number[],
  upsideFactor = 0.15,
): number[] {
  return revenueForecast.map(v => v * (1 + upsideFactor))
}

/**
 * Compute monthly debt service obligations from loan tranches.
 * Each tranche: { principal_try, annual_interest_rate, months_remaining }
 * For each forecast month m (1-indexed), sum over all tranches:
 *   if tranche.months_remaining >= m:
 *     monthly_payment = principal / months_remaining (principal portion)
 *                     + principal * (annual_interest_rate/100) / 12 (interest)
 *   else: 0
 */
export function computeDebtServiceSchedule(
  tranches: Array<{ principal_try: number; annual_interest_rate: number; months_remaining: number }>,
  forecastMonths: number,
): number[] {
  return Array.from({ length: forecastMonths }, (_, idx) => {
    const month = idx + 1  // 1-indexed
    let total = 0
    for (const tranche of tranches) {
      if (tranche.months_remaining <= 0) continue
      if (month > tranche.months_remaining) continue

      const monthlyPrincipal = tranche.principal_try / tranche.months_remaining
      const monthlyInterest = tranche.principal_try * (tranche.annual_interest_rate / 100) / 12
      total += monthlyPrincipal + monthlyInterest
    }
    return total
  })
}

/**
 * Compute adjusted cash flow after debt service obligations.
 * adjusted = netCashFlow - debtService for each month.
 */
export function computeAdjustedCashFlow(
  netCashFlows: number[],
  debtServiceSchedule: number[],
): number[] {
  const len = Math.min(netCashFlows.length, debtServiceSchedule.length)
  return Array.from({ length: len }, (_, i) => netCashFlows[i] - debtServiceSchedule[i])
}

/**
 * Compute average monthly cash burn.
 * Only months where net flow is negative count as "burn".
 * Returns null if no burn months exist.
 * Uses absolute value of negative months, averages them.
 */
export function computeAvgMonthlyCashBurn(
  netCashFlows: number[],
): number | null {
  const burnMonths = netCashFlows.filter(v => v < 0)
  if (burnMonths.length === 0) return null
  const totalBurn = burnMonths.reduce((s, v) => s + Math.abs(v), 0)
  return totalBurn / burnMonths.length
}

/**
 * Which forecast month (1-indexed) does cumulative cash position first turn positive?
 * Returns null if never breaks even within forecast period.
 * If cumulativeCashPositions[0] > 0, returns 1.
 */
export function computeBreakEvenMonth(
  cumulativeCashPositions: number[],
): number | null {
  for (let i = 0; i < cumulativeCashPositions.length; i++) {
    if (cumulativeCashPositions[i] > 0) return i + 1
  }
  return null
}

/**
 * Classify cash flow trend.
 * Compares average of first 3 months vs last 3 months of net cash flows.
 * 'improving': last 3 avg > first 3 avg by > 10%
 * 'stable': within 10% change
 * 'deteriorating': last 3 avg < first 3 avg by > 10%
 * 'insufficient_data': fewer than 6 months
 */
export function classifyCashFlowTrend(
  netCashFlows: number[],
): 'improving' | 'stable' | 'deteriorating' | 'insufficient_data' {
  if (netCashFlows.length < 6) return 'insufficient_data'

  const first3 = netCashFlows.slice(0, 3)
  const last3 = netCashFlows.slice(-3)

  const first3Avg = first3.reduce((s, v) => s + v, 0) / 3
  const last3Avg = last3.reduce((s, v) => s + v, 0) / 3

  // If first3Avg is near zero, use absolute comparison to avoid division issues
  if (Math.abs(first3Avg) < 1) {
    // Near-zero base: use absolute threshold of 10 units
    if (last3Avg > first3Avg + 10) return 'improving'
    if (last3Avg < first3Avg - 10) return 'deteriorating'
    return 'stable'
  }

  const changePct = ((last3Avg - first3Avg) / Math.abs(first3Avg)) * 100

  if (changePct > 10) return 'improving'
  if (changePct < -10) return 'deteriorating'
  return 'stable'
}

/**
 * Generate Turkish narrative summarizing the forecast.
 */
export function generateCashFlowForecastNarrative(
  runwayMonths: number | null,
  runwayStatus: ReturnType<typeof classifyRunwayStatus>,
  trend: ReturnType<typeof classifyCashFlowTrend>,
  startingCash: number,
  breakEvenMonth: number | null,
): string {
  const parts: string[] = []

  // Starting cash context
  const cashFormatted = startingCash.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  parts.push(`Mevcut nakit pozisyonu ₺${cashFormatted}.`)

  // Runway narrative
  switch (runwayStatus) {
    case 'healthy':
      if (runwayMonths === null) {
        parts.push('Projeksiyon döneminde nakit açığı öngörülmemektedir.')
      } else {
        parts.push(`Nakit görünümü sağlıklı — tahmini runway ${runwayMonths} ay.`)
      }
      break
    case 'caution':
      parts.push(`Dikkat: Nakit ${runwayMonths} ay içinde kritik seviyeye ulaşabilir.`)
      break
    case 'at_risk':
      parts.push(`Risk uyarısı: ${runwayMonths} ay içinde nakit yetersizliği bekleniyor.`)
      break
    case 'critical':
      if (runwayMonths === 0) {
        parts.push('Kritik: Şirket şu anda nakit açığındadır.')
      } else {
        parts.push(`Kritik durum: ${runwayMonths} ay içinde nakit tükenebilir.`)
      }
      break
  }

  // Trend narrative
  switch (trend) {
    case 'improving':
      parts.push('Nakit akışı trendi iyileşme göstermektedir.')
      break
    case 'stable':
      parts.push('Nakit akışı trendi istikrarlı seyretmektedir.')
      break
    case 'deteriorating':
      parts.push('Nakit akışı trendi bozulmaktadır — maliyet optimizasyonu önerilir.')
      break
    case 'insufficient_data':
      parts.push('Trend analizi için yeterli veri bulunmamaktadır.')
      break
  }

  // Break-even narrative
  if (breakEvenMonth !== null) {
    parts.push(`Kümülatif nakit akışının pozitife dönmesi ${breakEvenMonth}. ayda beklenmektedir.`)
  } else {
    parts.push('Projeksiyon döneminde kümülatif başabaş noktasına ulaşılamamaktadır.')
  }

  return parts.join(' ')
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Format YYYY-MM string from year + month number */
function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Get YYYY-MM key for date offset by deltaMonths from now */
function monthKeyOffset(baseYear: number, baseMonth: number, delta: number): string {
  const date = new Date(baseYear, baseMonth - 1 + delta, 1)
  return formatMonthKey(date.getFullYear(), date.getMonth() + 1)
}

/** Build an ordered array of YYYY-MM keys, oldest first */
function buildMonthKeys(startYear: number, startMonth: number, count: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < count; i++) {
    keys.push(monthKeyOffset(startYear, startMonth, i))
  }
  return keys
}

/** Build a scenario forecast object from provided components */
function buildScenarioForecast(
  startingCash: number,
  revenueForecast: number[],
  expenseForecast: number[],
  debtServiceSchedule: number[],
  forecastMonths: number,
  startYear: number,
  startMonth: number,
): ScenarioForecast {
  const netCashFlows = computeNetCashFlowForecast(revenueForecast, expenseForecast)
  const adjustedFlows = computeAdjustedCashFlow(netCashFlows, debtServiceSchedule)
  const cumulativePositions = computeCumulativeCashPosition(startingCash, adjustedFlows)

  const monthKeys = buildMonthKeys(startYear, startMonth, forecastMonths)

  const monthly: MonthlyForecastPoint[] = monthKeys.map((month, i) => ({
    month,
    revenue_forecast_try: revenueForecast[i] ?? 0,
    expense_forecast_try: expenseForecast[i] ?? 0,
    net_cash_flow_try: netCashFlows[i] ?? 0,
    cumulative_position_try: cumulativePositions[i] ?? startingCash,
    debt_service_try: debtServiceSchedule[i] ?? 0,
    adjusted_net_try: adjustedFlows[i] ?? 0,
  }))

  const runwayMonths = computeRunwayMonths(cumulativePositions)
  const runwayStatus = classifyRunwayStatus(runwayMonths)
  const breakEvenMonth = computeBreakEvenMonth(cumulativePositions)
  const finalCash = cumulativePositions[cumulativePositions.length - 1] ?? startingCash

  return {
    monthly,
    runway_months: runwayMonths,
    runway_status: runwayStatus,
    break_even_month: breakEvenMonth,
    final_cash_position_try: finalCash,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CashFlowForecastService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    forecastMonths = 12,
  ): Promise<CashFlowForecastReport | null> {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    // Build date range: last 24 months
    const historicalStart = monthKeyOffset(currentYear, currentMonth, -24)
    const historicalStartDate = `${historicalStart}-01`
    const lastDayOfCurrentMonth = new Date(currentYear, currentMonth, 0).getDate()
    const historicalEndDate = `${formatMonthKey(currentYear, currentMonth)}-${String(lastDayOfCurrentMonth).padStart(2, '0')}`

    // ── Parallel DB queries ──────────────────────────────────────────────────
    const [salesResult, expensesResult, loanResult] = await Promise.allSettled([
      // 1. Sales last 24 months
      this.supabase
        .from('sales')
        .select('sale_date, total_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', historicalStartDate)
        .lte('sale_date', historicalEndDate),

      // 2. Expenses last 24 months
      this.supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', historicalStartDate)
        .lte('expense_date', historicalEndDate),

      // 3. Active loan tranches (try/catch — table may not exist)
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, annual_interest_rate, expected_repayment_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('principal_try', 'is', null),
    ])

    // ── Aggregate sales by month ─────────────────────────────────────────────
    const revenueByMonth: Record<string, number> = {}
    let totalPaidSales = 0
    let totalAllSales = 0

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const period = (row.sale_date as string).substring(0, 7)
        const amount = Number(row.total_try) || 0
        revenueByMonth[period] = (revenueByMonth[period] ?? 0) + amount
        totalAllSales += amount
        if (row.payment_status === 'paid') {
          totalPaidSales += amount
        }
      }
    }

    // ── Aggregate expenses by month ──────────────────────────────────────────
    const expensesByMonth: Record<string, number> = {}

    if (expensesResult.status === 'fulfilled' && expensesResult.value?.data) {
      for (const row of expensesResult.value.data) {
        if (!row.expense_date) continue
        const period = (row.expense_date as string).substring(0, 7)
        const amount = Number(row.amount_try) || 0
        expensesByMonth[period] = (expensesByMonth[period] ?? 0) + amount
      }
    }

    // ── Starting cash (simplified: paid sales - all expenses) ───────────────
    let totalExpensesAll = 0
    for (const v of Object.values(expensesByMonth)) {
      totalExpensesAll += v
    }
    const startingCash = totalPaidSales - totalExpensesAll

    // ── Build historical arrays (last 24 months, oldest first) ──────────────
    const historicalMonthKeys: string[] = []
    for (let i = 23; i >= 0; i--) {
      historicalMonthKeys.push(monthKeyOffset(currentYear, currentMonth, -i))
    }

    const historicalRevenue = historicalMonthKeys.map(k => revenueByMonth[k] ?? 0)
    const historicalExpenses = historicalMonthKeys.map(k => expensesByMonth[k] ?? 0)

    // Count how many historical months have non-zero data
    const historicalMonthsUsed = historicalRevenue.filter(v => v > 0).length

    // ── Process loan tranches ────────────────────────────────────────────────
    interface TrancheSummary {
      principal_try: number
      annual_interest_rate: number
      months_remaining: number
    }
    let trancheData: TrancheSummary[] = []

    try {
      if (loanResult.status === 'fulfilled' && loanResult.value?.data) {
        trancheData = loanResult.value.data
          .map((row: { principal_try: unknown; annual_interest_rate: unknown; expected_repayment_date: unknown }) => {
            const principal = Number(row.principal_try) || 0
            const rate = Number(row.annual_interest_rate) || 0
            let monthsRemaining = 12 // default
            if (row.expected_repayment_date) {
              const endDate = new Date(row.expected_repayment_date as string)
              const diffMs = endDate.getTime() - now.getTime()
              const diffMonths = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30))
              monthsRemaining = Math.max(0, diffMonths)
            }
            return { principal_try: principal, annual_interest_rate: rate, months_remaining: monthsRemaining }
          })
          .filter((t: TrancheSummary) => t.principal_try > 0 && t.months_remaining > 0)
      }
    } catch {
      // Table may not exist — use empty array
      trancheData = []
    }

    // ── Forecast start: next month after current ──────────────────────────────
    const forecastStartDate = new Date(currentYear, currentMonth, 1) // first of next month
    const forecastYear = forecastStartDate.getFullYear()
    const forecastMonth = forecastStartDate.getMonth() + 1

    // ── Compute forecasts ────────────────────────────────────────────────────
    const baselineRevenue = computeMonthlyRevenueForecast(historicalRevenue, forecastMonths)
    const baselineExpenses = computeMonthlyExpenseForecast(historicalExpenses, forecastMonths)
    const debtService = computeDebtServiceSchedule(trancheData, forecastMonths)

    const worstRevenue = computeWorstCaseAdjustment(baselineRevenue)
    const bestRevenue = computeBestCaseAdjustment(baselineRevenue)

    // ── Build three scenarios ────────────────────────────────────────────────
    const baseline = buildScenarioForecast(
      startingCash, baselineRevenue, baselineExpenses, debtService,
      forecastMonths, forecastYear, forecastMonth,
    )
    const worstCase = buildScenarioForecast(
      startingCash, worstRevenue, baselineExpenses, debtService,
      forecastMonths, forecastYear, forecastMonth,
    )
    const bestCase = buildScenarioForecast(
      startingCash, bestRevenue, baselineExpenses, debtService,
      forecastMonths, forecastYear, forecastMonth,
    )

    // ── Metrics ──────────────────────────────────────────────────────────────
    const baselineNet = computeNetCashFlowForecast(baselineRevenue, baselineExpenses)
    const avgBurn = computeAvgMonthlyCashBurn(baselineNet)
    const cashFlowTrend = classifyCashFlowTrend(baselineNet)

    const narrative = generateCashFlowForecastNarrative(
      baseline.runway_months,
      baseline.runway_status,
      cashFlowTrend,
      startingCash,
      baseline.break_even_month,
    )

    return {
      company_id: companyId,
      generated_at: now.toISOString(),
      forecast_months: forecastMonths,
      starting_cash_try: startingCash,
      historical_months_used: historicalMonthsUsed,
      baseline,
      worst_case: worstCase,
      best_case: bestCase,
      avg_monthly_burn_try: avgBurn,
      cash_flow_trend: cashFlowTrend,
      narrative,
    }
  }
}
