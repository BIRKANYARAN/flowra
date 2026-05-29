// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/revenue-recognition.service.ts
//
// Revenue Recognition & Accrual Tracking
//
// Tracks when revenue is earned vs. when cash is received.
// Supports both cash-basis and accrual-basis reporting with deferred revenue.
//
// Pure exported functions (testable without DB):
//   computeEarnedRevenue           — accrual: total; cash: paid
//   computeUnearnedRevenue         — accrual: 0; cash: total - paid
//   classifyRecognitionStatus      — fully_recognized / partially_recognized / unrecognized / deferred
//   computeRecognitionGap          — accrual - cash
//   computeCumulativeReceivables   — running AR balance floored at 0
//   computeRevenueRecognitionRate  — earned / total × 100, null guard
//   computeDeferredRevenueBalance  — Σ over-payments (paid > total)
//   computeAccrualCashDelta        — absolute delta, monthly avg, ratio
//   buildMonthlyRecognition        — monthly accrual/cash/gap/AR array
//   classifyRevenueQualityFromRecognition — 5-tier quality
//   computeAvgCollectionLag        — avg days sale_date → payment_date
//   generateRecognitionNarrative   — Turkish quality narrative
//
// Class: RevenueRecognitionService
//   getReport(companyId, method?) → RevenueRecognitionReport
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Core types ────────────────────────────────────────────────────────────────

export type RecognitionMethod = 'cash_basis' | 'accrual_basis'

export interface SaleRecognition {
  sale_id: string
  sale_date: string
  customer_name: string | null
  total_try: number
  paid_amount_try: number
  earned_revenue: number
  unearned_revenue: number
  deferred_revenue: number
  recognition_status: 'fully_recognized' | 'partially_recognized' | 'unrecognized' | 'deferred'
}

export interface MonthlyRecognition {
  year_month: string
  earned_revenue_accrual: number
  earned_revenue_cash: number
  cash_received: number
  recognition_gap: number
  cumulative_receivables: number
}

// ── Pure exported functions ───────────────────────────────────────────────────

/**
 * Compute earned revenue for a sale.
 * accrual: totalTry (fully recognized when sale is made)
 * cash: paidAmountTry (only recognized when received)
 */
export function computeEarnedRevenue(
  totalTry: number,
  paidAmountTry: number,
  method: RecognitionMethod,
): number {
  if (method === 'accrual_basis') return totalTry
  return paidAmountTry
}

/**
 * Compute unearned revenue for a sale.
 * accrual: 0 (full revenue already recognized)
 * cash: max(0, totalTry - paidAmountTry)
 */
export function computeUnearnedRevenue(
  totalTry: number,
  paidAmountTry: number,
  method: RecognitionMethod,
): number {
  if (method === 'accrual_basis') return 0
  return Math.max(0, totalTry - paidAmountTry)
}

/**
 * Classify recognition status for a sale.
 * fully_recognized: paidAmountTry >= totalTry OR method=accrual
 * partially_recognized: method=cash AND 0 < paidAmountTry < totalTry
 * unrecognized: method=cash AND paidAmountTry === 0
 * deferred: paidAmountTry > totalTry (over-paid / prepayment)
 */
export function classifyRecognitionStatus(
  totalTry: number,
  paidAmountTry: number,
  method: RecognitionMethod,
): SaleRecognition['recognition_status'] {
  if (paidAmountTry > totalTry) return 'deferred'
  if (method === 'accrual_basis') return 'fully_recognized'
  if (paidAmountTry >= totalTry) return 'fully_recognized'
  if (paidAmountTry > 0) return 'partially_recognized'
  return 'unrecognized'
}

/**
 * Compute recognition gap: accrualRevenue - cashRevenue.
 * Positive = more earned than received; negative = cash > accrual.
 */
export function computeRecognitionGap(
  accrualRevenue: number,
  cashRevenue: number,
): number {
  return accrualRevenue - cashRevenue
}

/**
 * Compute running AR balance for each month.
 * cumulative[i] = Σ(sales[0..i]) - Σ(cash[0..i]), floored at 0.
 * Returns same-length array as input.
 */
export function computeCumulativeReceivables(
  monthlySales: number[],
  monthlyCashReceived: number[],
): number[] {
  let cumSales = 0
  let cumCash  = 0
  return monthlySales.map((sale, i) => {
    cumSales += sale
    cumCash  += monthlyCashReceived[i] ?? 0
    return Math.max(0, cumSales - cumCash)
  })
}

/**
 * Compute revenue recognition rate: earnedRevenue / totalRevenue × 100.
 * Returns null if totalRevenue === 0 (division-by-zero guard).
 */
export function computeRevenueRecognitionRate(
  earnedRevenue: number,
  totalRevenue: number,
): number | null {
  if (totalRevenue === 0) return null
  return (earnedRevenue / totalRevenue) * 100
}

/**
 * Compute deferred revenue balance.
 * Sum of (paid - total) for sales where paid > total (over-payments / prepayments).
 */
export function computeDeferredRevenueBalance(
  sales: Array<{ total_try: number; paid_amount_try: number }>,
): number {
  return sales.reduce((sum, s) => {
    const overpaid = s.paid_amount_try - s.total_try
    return sum + (overpaid > 0 ? overpaid : 0)
  }, 0)
}

/**
 * Compute accrual-to-cash delta over a multi-month period.
 */
export function computeAccrualCashDelta(
  accrualRevenue: number,
  cashRevenue: number,
  periodMonths: number,
): {
  absolute_delta: number
  avg_monthly_delta: number
  delta_ratio_pct: number | null
} {
  const absolute_delta   = accrualRevenue - cashRevenue
  const avg_monthly_delta = periodMonths > 0 ? absolute_delta / periodMonths : 0
  const delta_ratio_pct  = accrualRevenue !== 0
    ? (absolute_delta / accrualRevenue) * 100
    : null

  return { absolute_delta, avg_monthly_delta, delta_ratio_pct }
}

/**
 * Build monthly recognition array from aggregated month data.
 * Missing months default to 0. Includes cumulative receivables.
 */
export function buildMonthlyRecognition(
  salesByMonth: Map<string, { total_try: number; paid_amount_try: number }>,
  paymentsByMonth: Map<string, number>,
  months: string[],
): MonthlyRecognition[] {
  const monthlySalesArr  = months.map(m => salesByMonth.get(m)?.total_try ?? 0)
  const monthlyCashArr   = months.map(m => paymentsByMonth.get(m) ?? 0)
  const cumulativeAR     = computeCumulativeReceivables(monthlySalesArr, monthlyCashArr)

  return months.map((year_month, i) => {
    const entry          = salesByMonth.get(year_month)
    const accrual        = entry?.total_try ?? 0
    const cashPaid       = entry?.paid_amount_try ?? 0
    const cashReceived   = paymentsByMonth.get(year_month) ?? 0

    return {
      year_month,
      earned_revenue_accrual: accrual,
      earned_revenue_cash:    cashPaid,
      cash_received:          cashReceived,
      recognition_gap:        computeRecognitionGap(accrual, cashPaid),
      cumulative_receivables: cumulativeAR[i],
    }
  })
}

/**
 * Classify revenue quality from recognition rate and gap.
 * high_quality:      recognitionRate >= 90%
 * good_quality:      recognitionRate >= 70%
 * mixed:             recognitionRate >= 50%
 * poor_quality:      recognitionRate >= 30%
 * uncollectable_risk: recognitionRate < 30% OR null
 */
export function classifyRevenueQualityFromRecognition(
  recognitionRate: number | null,
  _recognitionGap: number,
  _accrualRevenue: number,
): 'high_quality' | 'good_quality' | 'mixed' | 'poor_quality' | 'uncollectable_risk' {
  if (recognitionRate === null || recognitionRate < 30) return 'uncollectable_risk'
  if (recognitionRate >= 90) return 'high_quality'
  if (recognitionRate >= 70) return 'good_quality'
  if (recognitionRate >= 50) return 'mixed'
  return 'poor_quality'
}

/**
 * Compute average collection lag in days.
 * Average days from sale_date to payment_date for paid sales.
 * Returns null if no paid sales.
 */
export function computeAvgCollectionLag(
  sales: Array<{ sale_date: string; payment_date: string | null }>,
): number | null {
  const paid = sales.filter(s => s.payment_date !== null)
  if (paid.length === 0) return null

  const totalDays = paid.reduce((sum, s) => {
    const saleMs    = new Date(s.sale_date).getTime()
    const paymentMs = new Date(s.payment_date!).getTime()
    const days      = Math.max(0, (paymentMs - saleMs) / (1000 * 60 * 60 * 24))
    return sum + days
  }, 0)

  return totalDays / paid.length
}

/**
 * Generate Turkish narrative for revenue recognition quality.
 */
export function generateRecognitionNarrative(
  quality: ReturnType<typeof classifyRevenueQualityFromRecognition>,
  recognitionRate: number | null,
  gap: number,
  deferredBalance: number,
): string {
  const rate = recognitionRate !== null ? recognitionRate.toFixed(0) : null

  switch (quality) {
    case 'high_quality':
      return 'Gelir tahsilatı mükemmel — nakit ve tahakkuk gelirleri örtüşüyor.'
    case 'good_quality':
      return 'Gelir kalitesi iyi — tahsilatlar büyük ölçüde gerçekleşiyor.'
    case 'mixed':
      return `Karma tablo — fatura edilen gelirlerin %${rate} tahsil edildi.`
    case 'poor_quality':
      return 'Dikkat: Tahakkuk gelirlerin büyük bölümü nakit dönmüyor.'
    case 'uncollectable_risk':
      return `Kritik: Tahsilat riski yüksek — ₺${gap}₺ tahakkuk-nakit farkı.`
  }

  // Suppress unused variable warning
  void deferredBalance
}

// ── Report types ──────────────────────────────────────────────────────────────

export interface RevenueRecognitionReport {
  period_label: string
  method: RecognitionMethod
  total_accrual_revenue: number
  total_cash_revenue: number
  recognition_rate_pct: number | null
  recognition_gap: number
  deferred_revenue_balance: number
  monthly_recognition: MonthlyRecognition[]
  recognition_quality: ReturnType<typeof classifyRevenueQualityFromRecognition>
  avg_collection_lag_days: number | null
  accrual_cash_delta: ReturnType<typeof computeAccrualCashDelta>
  narrative: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function priorMonthKey(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/** Build last-N month keys ending at `endMonth`, oldest first */
function lastNMonths(n: number, endMonth: string): string[] {
  const keys: string[] = []
  let cur = endMonth
  for (let i = 0; i < n; i++) {
    keys.unshift(cur)
    cur = priorMonthKey(cur)
  }
  return keys
}

// ── Service class ─────────────────────────────────────────────────────────────

export class RevenueRecognitionService {
  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    method: RecognitionMethod = 'accrual_basis',
  ): Promise<RevenueRecognitionReport> {
    const endMonth = currentMonthKey()
    const months   = lastNMonths(6, endMonth)

    const sixMonthsAgo = months[0] + '-01'
    const endDate      = endMonth + '-31'

    // ── Fetch sales (last 6 months) ─────────────────────────────────────────
    const [salesResult] = await Promise.allSettled([
      this.supabase
        .from('sales')
        .select('id, sale_date, customer_name, total_try, amount_paid, payment_status, paid_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', sixMonthsAgo)
        .lte('sale_date', endDate)
        .order('sale_date', { ascending: true })
        .limit(5000),
    ])

    type SaleRow = {
      id: string
      sale_date: string
      customer_name: string | null
      total_try: number | null
      amount_paid: number | null
      payment_status: string | null
      paid_at: string | null
    }

    const salesRows: SaleRow[] = salesResult.status === 'fulfilled'
      ? ((salesResult.value.data ?? []) as SaleRow[])
      : []

    // ── Aggregate by month ──────────────────────────────────────────────────
    const salesByMonth   = new Map<string, { total_try: number; paid_amount_try: number }>()
    const paymentsByMonth = new Map<string, number>()

    // Collection lag data (sale_date → paid_at)
    const lagSales: Array<{ sale_date: string; payment_date: string | null }> = []

    // Deferred balance input
    const allSalesForDeferred: Array<{ total_try: number; paid_amount_try: number }> = []

    let totalAccrual = 0
    let totalCash    = 0

    for (const row of salesRows) {
      const total  = Number(row.total_try ?? 0)
      const paid   = Number(row.amount_paid ?? 0)
      const mk     = row.sale_date.slice(0, 7)  // YYYY-MM

      // Accumulate monthly accrual (total) and cash (paid)
      const existing = salesByMonth.get(mk) ?? { total_try: 0, paid_amount_try: 0 }
      salesByMonth.set(mk, {
        total_try:      existing.total_try + total,
        paid_amount_try: existing.paid_amount_try + paid,
      })

      // Cash received in month (payment date approximation: paid_at ?? sale_date for paid status)
      const status = row.payment_status ?? ''
      if (status === 'paid' && row.paid_at) {
        const payMonth = row.paid_at.slice(0, 7)
        paymentsByMonth.set(payMonth, (paymentsByMonth.get(payMonth) ?? 0) + (paid > 0 ? paid : total))
      } else if (status === 'paid') {
        // No paid_at — approximate: use sale_date month
        paymentsByMonth.set(mk, (paymentsByMonth.get(mk) ?? 0) + (paid > 0 ? paid : total))
      } else if (status === 'partial' && paid > 0) {
        paymentsByMonth.set(mk, (paymentsByMonth.get(mk) ?? 0) + paid)
      }

      // Collection lag
      lagSales.push({
        sale_date:    row.sale_date,
        payment_date: row.paid_at,
      })

      // Deferred balance
      allSalesForDeferred.push({ total_try: total, paid_amount_try: paid })

      // Totals
      totalAccrual += total
      totalCash    += paid
    }

    // ── Compute derived metrics ─────────────────────────────────────────────
    const recognitionRate   = computeRevenueRecognitionRate(totalCash, totalAccrual)
    const recognitionGap    = computeRecognitionGap(totalAccrual, totalCash)
    const deferredBalance   = computeDeferredRevenueBalance(allSalesForDeferred)
    const quality           = classifyRevenueQualityFromRecognition(
      recognitionRate, recognitionGap, totalAccrual,
    )
    const avgLag            = computeAvgCollectionLag(lagSales)
    const delta             = computeAccrualCashDelta(totalAccrual, totalCash, months.length)
    const monthlyRecognition = buildMonthlyRecognition(salesByMonth, paymentsByMonth, months)
    const narrative          = generateRecognitionNarrative(
      quality, recognitionRate, recognitionGap, deferredBalance,
    )

    return {
      period_label:            'Son 6 Ay',
      method,
      total_accrual_revenue:   totalAccrual,
      total_cash_revenue:      totalCash,
      recognition_rate_pct:    recognitionRate,
      recognition_gap:         recognitionGap,
      deferred_revenue_balance: deferredBalance,
      monthly_recognition:     monthlyRecognition,
      recognition_quality:     quality,
      avg_collection_lag_days: avgLag,
      accrual_cash_delta:      delta,
      narrative,
    }
  }
}
