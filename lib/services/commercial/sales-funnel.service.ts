// ── SalesFunnelService — Sales Funnel Conversion Analytics ───────────────────
// Tracks conversion rates and velocities across the proforma→sale→payment
// funnel stages for Turkish SME context.
//
// Funnel stages:
//   1. proforma    — Proforma/Teklif: proposal/quote
//   2. confirmed   — Onaylı Sipariş: confirmed order (sale created, unpaid)
//   3. partial     — Kısmi Tahsilat: partially paid
//   4. paid        — Tam Tahsilat: fully paid
//   5. overdue     — Vadesi Geçmiş: past due date, unpaid
//
// All pure functions exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Exported Types ─────────────────────────────────────────────────────────────

export interface FunnelStage {
  stage_id: string           // 'proforma' | 'confirmed' | 'partial' | 'paid' | 'overdue'
  stage_name: string         // Turkish name
  count: number
  value_try: number          // total value of sales at this stage
  avg_days_in_stage: number | null  // avg time spent in this stage before moving to next
}

export interface FunnelMetrics {
  proforma_to_sale_rate: number        // % of proformas that converted to sales
  sale_to_paid_rate: number            // % of confirmed sales that got paid (fully)
  sale_to_partial_rate: number         // % that became partial
  overall_conversion_rate: number      // proforma → paid

  avg_proforma_to_sale_days: number | null   // avg days from proforma to conversion
  avg_sale_to_payment_days: number | null    // avg days from sale to full payment (DSO)
  avg_total_cycle_days: number | null        // proforma to payment total
}

export interface SalesFunnelReport {
  analysis_period: string     // "last_30_days" or "last_90_days"

  stages: FunnelStage[]
  metrics: FunnelMetrics

  conversion_health: ReturnType<typeof classifyConversionRateHealth>
  deal_velocity: ReturnType<typeof classifyDealVelocity>
  bottleneck_stage: string | null

  open_pipeline_value_try: number         // proforma + confirmed (not yet paid)
  weighted_pipeline_value_try: number
  pipeline_30d_forecast_try: number | null

  monthly_flow: ReturnType<typeof computeMonthlyFunnelFlow>
  total_leakage_try: number              // total value not progressing
}

// ── Pure Functions (exported) ─────────────────────────────────────────────────

/**
 * Compute conversion rate between two stage counts.
 * Returns 0 if from_count = 0 (no NaN).
 */
export function computeConversionRate(from_count: number, to_count: number): number {
  if (from_count === 0) return 0
  return (to_count / from_count) * 100
}

/**
 * Compute average days in stage.
 * Returns null if no completed transitions (empty array).
 */
export function computeAvgDaysInStage(stageDurations: number[]): number | null {
  if (stageDurations.length === 0) return null
  const total = stageDurations.reduce((sum, d) => sum + d, 0)
  return total / stageDurations.length
}

/**
 * Classify conversion rate health.
 * excellent: >= 70%
 * good:      >= 50%
 * moderate:  >= 30%
 * low:       >= 15%
 * poor:      < 15%
 */
export function classifyConversionRateHealth(
  conversionRate: number,
): 'excellent' | 'good' | 'moderate' | 'low' | 'poor' {
  if (conversionRate >= 70) return 'excellent'
  if (conversionRate >= 50) return 'good'
  if (conversionRate >= 30) return 'moderate'
  if (conversionRate >= 15) return 'low'
  return 'poor'
}

/**
 * Compute funnel leakage (value lost at each stage).
 * = value entering stage - value advancing to next stage
 * Always >= 0.
 */
export function computeFunnelLeakage(
  enteringValue: number,
  advancingValue: number,
): number {
  const diff = enteringValue - advancingValue
  return diff > 0 ? diff : 0
}

/**
 * Compute funnel velocity (value × conversion rate = expected revenue output).
 * velocity = total_pipeline_value × overall_conversion_rate / 100
 */
export function computeFunnelVelocity(
  totalPipelineValue: number,
  overallConversionRate: number,
): number {
  return totalPipelineValue * (overallConversionRate / 100)
}

/**
 * Compute weighted pipeline value.
 * Weights: proforma=10%, confirmed=40%, partial=70%, overdue=20%
 */
export function computeWeightedPipelineValue(
  proformaValue: number,
  confirmedValue: number,
  partialValue: number,
  overdueValue: number,
): number {
  return (
    proformaValue * 0.10 +
    confirmedValue * 0.40 +
    partialValue * 0.70 +
    overdueValue * 0.20
  )
}

/**
 * Classify deal velocity based on avg cycle days.
 * fast:    <= 14 days total cycle
 * normal:  <= 30 days
 * slow:    <= 60 days
 * stalled: > 60 days or null
 */
export function classifyDealVelocity(
  avgTotalCycleDays: number | null,
): 'fast' | 'normal' | 'slow' | 'stalled' {
  if (avgTotalCycleDays === null) return 'stalled'
  if (avgTotalCycleDays <= 14) return 'fast'
  if (avgTotalCycleDays <= 30) return 'normal'
  if (avgTotalCycleDays <= 60) return 'slow'
  return 'stalled'
}

/**
 * Compute monthly funnel flow (how many new proformas vs closed this month).
 */
export function computeMonthlyFunnelFlow(
  newProformas: number,
  closedAsWon: number,
  closedAsLost: number,
): { won_rate: number; lost_rate: number; still_open: number } {
  const total = newProformas
  const decided = closedAsWon + closedAsLost

  if (total === 0) {
    return { won_rate: 0, lost_rate: 0, still_open: 0 }
  }

  // If no decided outcomes, all are still open
  if (decided === 0) {
    return {
      won_rate: 0,
      lost_rate: 0,
      still_open: newProformas,
    }
  }

  const won_rate = (closedAsWon / total) * 100
  const lost_rate = (closedAsLost / total) * 100
  const still_open = newProformas - closedAsWon - closedAsLost

  return { won_rate, lost_rate, still_open }
}

/**
 * Identify bottleneck stage (stage with highest value and lowest conversion to next).
 * Returns the stage_id with highest leakage.
 * Returns null if stages is empty or has fewer than 2 stages.
 */
export function identifyBottleneckStage(stages: FunnelStage[]): string | null {
  if (stages.length < 2) return null

  let maxLeakage = -Infinity
  let bottleneckId: string | null = null

  for (let i = 0; i < stages.length - 1; i++) {
    const current = stages[i]
    const next    = stages[i + 1]
    const leakage = computeFunnelLeakage(current.value_try, next.value_try)
    if (leakage > maxLeakage) {
      maxLeakage   = leakage
      bottleneckId = current.stage_id
    }
  }

  return bottleneckId
}

/**
 * Compute 30-day run rate for pipeline.
 * Returns null if avgCycleDays > 30 days (deals won't close within 30 days).
 * Returns null if avgCycleDays is null (no velocity data).
 */
export function computePipeline30DayForecast(
  openPipelineValue: number,
  historicalConversionRate: number,
  avgCycleDays: number | null,
): number | null {
  if (avgCycleDays === null) return null
  if (avgCycleDays > 30) return null

  // Expected revenue = pipeline value × conversion rate × (30 / cycle days)
  const cycleCount = 30 / avgCycleDays
  return openPipelineValue * (historicalConversionRate / 100) * cycleCount
}

// ── NEW: Conversion & Pipeline Metrics (Batch-36) ─────────────────────────────

/**
 * Compute proforma-to-sale conversion rate.
 * rate = convertedProformas / totalProformas * 100.
 * Returns null if totalProformas === 0.
 */
export function computeConversionRateV2(
  convertedProformas: number,
  totalProformas: number,
): number | null {
  if (totalProformas === 0) return null
  return (convertedProformas / totalProformas) * 100
}

/**
 * Compute average cycle time (days from proforma creation to sale conversion).
 * Returns null if no converted proformas (empty array).
 */
export function computeAvgCycleTime(cycleTimes: number[]): number | null {
  if (cycleTimes.length === 0) return null
  const sum = cycleTimes.reduce((acc, v) => acc + v, 0)
  return sum / cycleTimes.length
}

/**
 * Compute median cycle time.
 * Returns null if empty.
 */
export function computeMedianCycleTime(cycleTimes: number[]): number | null {
  if (cycleTimes.length === 0) return null
  const sorted = [...cycleTimes].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Classify cycle time efficiency.
 * 'excellent': <= 3 days
 * 'good': <= 7 days
 * 'moderate': <= 14 days
 * 'slow': <= 30 days
 * 'stalled': > 30 days
 * 'insufficient_data': null
 */
export function classifyCycleTimeEfficiency(
  avgDays: number | null,
): 'excellent' | 'good' | 'moderate' | 'slow' | 'stalled' | 'insufficient_data' {
  if (avgDays === null) return 'insufficient_data'
  if (avgDays <= 3)  return 'excellent'
  if (avgDays <= 7)  return 'good'
  if (avgDays <= 14) return 'moderate'
  if (avgDays <= 30) return 'slow'
  return 'stalled'
}

/**
 * Compute pipeline value: total outstanding proforma value (not yet converted).
 * Sum of total for pending proformas.
 */
export function computePipelineValue(
  pendingProformas: Array<{ total: number }>,
): number {
  return pendingProformas.reduce((acc, p) => acc + p.total, 0)
}

/**
 * Compute expected pipeline value: pipeline × (conversionRate / 100).
 * Returns null if conversionRate is null.
 */
export function computeExpectedPipelineValue(
  pipelineValue: number,
  conversionRatePct: number | null,
): number | null {
  if (conversionRatePct === null) return null
  return pipelineValue * (conversionRatePct / 100)
}

/**
 * Compute pipeline velocity: total pipeline value / avg days to convert.
 * Returns null if avgCycleTime is null or 0.
 */
export function computePipelineVelocity(
  pipelineValue: number,
  avgCycleTimeDays: number | null,
): number | null {
  if (avgCycleTimeDays === null || avgCycleTimeDays === 0) return null
  return pipelineValue / avgCycleTimeDays
}

/**
 * Compute average quote value: totalProformaValue / totalProformas.
 * Returns null if totalProformas === 0.
 */
export function computeAvgQuoteValue(
  totalProformaValue: number,
  totalProformas: number,
): number | null {
  if (totalProformas === 0) return null
  return totalProformaValue / totalProformas
}

/**
 * Compute quote-to-revenue ratio: totalConvertedValue / totalInvoicedRevenue * 100.
 * Returns null if totalInvoicedRevenue === 0.
 */
export function computeQuoteToRevenueRatio(
  totalConvertedValue: number,
  totalInvoicedRevenue: number,
): number | null {
  if (totalInvoicedRevenue === 0) return null
  return (totalConvertedValue / totalInvoicedRevenue) * 100
}

/**
 * Compute expired/lapsed rate: expiredProformas / totalProformas * 100.
 * Returns null if totalProformas === 0.
 */
export function computeExpirationRate(
  expiredProformas: number,
  totalProformas: number,
): number | null {
  if (totalProformas === 0) return null
  return (expiredProformas / totalProformas) * 100
}

/**
 * Compute funnel health score (0-100).
 * Components:
 * - Conversion rate: conversionRate * 0.50 (max 50 pts at 100% conversion)
 * - Cycle time: excellent=30/good=25/moderate=20/slow=10/stalled=5 pts
 * - Expiration rate: 20 - (expirationRate * 0.20) (penalty for high expiration), min 0
 * Returns null if all inputs are null.
 */
export function computeFunnelHealthScore(
  conversionRatePct: number | null,
  cycleTimeClassification: ReturnType<typeof classifyCycleTimeEfficiency>,
  expirationRatePct: number | null,
): number | null {
  // Return null only if all inputs are null
  if (conversionRatePct === null && cycleTimeClassification === 'insufficient_data' && expirationRatePct === null) {
    return null
  }

  // Conversion component (0-50 pts)
  const conversionPts = conversionRatePct !== null
    ? Math.min(conversionRatePct * 0.50, 50)
    : 0

  // Cycle time component
  const cycleTimePtsMap: Record<ReturnType<typeof classifyCycleTimeEfficiency>, number> = {
    excellent:        30,
    good:             25,
    moderate:         20,
    slow:             10,
    stalled:           5,
    insufficient_data: 0,
  }
  const cycleTimePts = cycleTimePtsMap[cycleTimeClassification]

  // Expiration penalty component (max 20 pts)
  const expirationPts = expirationRatePct !== null
    ? Math.max(0, 20 - expirationRatePct * 0.20)
    : 20  // no data → give benefit of doubt (full points)

  return conversionPts + cycleTimePts + expirationPts
}

/**
 * Classify funnel health.
 * 'excellent': >= 75
 * 'good': >= 55
 * 'moderate': >= 35
 * 'poor': < 35
 * 'insufficient_data': null
 */
export function classifyFunnelHealth(
  score: number | null,
): 'excellent' | 'good' | 'moderate' | 'poor' | 'insufficient_data' {
  if (score === null) return 'insufficient_data'
  if (score >= 75) return 'excellent'
  if (score >= 55) return 'good'
  if (score >= 35) return 'moderate'
  return 'poor'
}

/**
 * Compute win rate by customer: for each customer, what % of their quotes convert?
 * Returns sorted array (highest win rate first).
 */
export function computeCustomerWinRates(
  proformas: Array<{
    customer_id: string
    customer_name: string
    is_converted: boolean
  }>,
): Array<{ customer_id: string; customer_name: string; win_rate_pct: number; total_quotes: number }> {
  const map = new Map<string, { customer_name: string; total: number; converted: number }>()

  for (const p of proformas) {
    const existing = map.get(p.customer_id)
    if (existing) {
      existing.total++
      if (p.is_converted) existing.converted++
    } else {
      map.set(p.customer_id, {
        customer_name: p.customer_name,
        total: 1,
        converted: p.is_converted ? 1 : 0,
      })
    }
  }

  const result = Array.from(map.entries()).map(([customer_id, data]) => ({
    customer_id,
    customer_name: data.customer_name,
    win_rate_pct: (data.converted / data.total) * 100,
    total_quotes: data.total,
  }))

  return result.sort((a, b) => b.win_rate_pct - a.win_rate_pct)
}

/**
 * Generate Turkish sales funnel narrative.
 */
export function generateFunnelNarrative(
  health: ReturnType<typeof classifyFunnelHealth>,
  conversionRatePct: number | null,
  pipelineValue: number,
  avgCycleTime: number | null,
): string {
  const convStr = conversionRatePct !== null ? `%${conversionRatePct.toFixed(1)}` : 'bilinmiyor'
  const cycleStr = avgCycleTime !== null ? `${avgCycleTime.toFixed(1)} gün` : 'bilinmiyor'
  const pipelineStr = pipelineValue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })

  switch (health) {
    case 'excellent':
      return `Satış hunisi mükemmel durumda: dönüşüm oranı ${convStr}, ortalama çevrim süresi ${cycleStr}, boru hattı değeri ${pipelineStr} TL.`
    case 'good':
      return `Satış hunisi iyi durumda: dönüşüm oranı ${convStr}, çevrim süresi ${cycleStr}. Boru hattında ${pipelineStr} TL bulunuyor.`
    case 'moderate':
      return `Satış hunisi orta düzeyde: dönüşüm oranı ${convStr}, çevrim süresi ${cycleStr}. İyileştirme fırsatları mevcut.`
    case 'poor':
      return `Satış hunisi zayıf: dönüşüm oranı ${convStr}, çevrim süresi ${cycleStr}. Acil aksiyon alınması önerilir.`
    case 'insufficient_data':
    default:
      return `Satış hunisi analizi için yeterli veri bulunmuyor. Dönüşüm oranı: ${convStr}, boru hattı: ${pipelineStr} TL.`
  }
}

// ── NEW: SalesFunnelReport (v2) ───────────────────────────────────────────────

export interface SalesFunnelReportV2 {
  as_of_date: string
  period_months: number              // default 3

  // Volume counts
  total_proformas: number
  converted_proformas: number
  pending_proformas: number          // not yet converted, not expired
  expired_proformas: number

  // Conversion
  conversion_rate_pct: number | null
  expiration_rate_pct: number | null

  // Timing
  avg_cycle_time_days: number | null
  median_cycle_time_days: number | null
  cycle_time_efficiency: ReturnType<typeof classifyCycleTimeEfficiency>

  // Value
  total_proforma_value: number       // all proformas
  converted_value: number            // value of converted proformas
  pipeline_value: number             // value of pending proformas
  expected_pipeline_value: number | null
  avg_quote_value: number | null
  pipeline_velocity: number | null

  // Health
  funnel_health_score: number | null
  funnel_health: ReturnType<typeof classifyFunnelHealth>

  // Customer win rates (top 10 by total_quotes)
  customer_win_rates: ReturnType<typeof computeCustomerWinRates>

  narrative: string
}

// ── Internal DB Types ─────────────────────────────────────────────────────────

interface SaleRow {
  id:             string
  payment_status: string | null
  total:          number | null
  currency:       string | null
  fx_try:         number | null
  created_at:     string
  sale_date:      string | null
  due_date:       string | null
  paid_at:        string | null
  partially_paid_at?: string | null
}

interface ProformaRow {
  id:           string
  status:       string | null
  total:        number | null
  currency:     string | null
  fx_try:       number | null
  created_at:   string
  converted_at: string | null
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function toTRY(total: number | null, currency: string | null, fx_try: number | null): number {
  const t = Number(total ?? 0)
  if ((currency ?? 'TRY') === 'TRY') return t
  return t * (Number(fx_try) || 1)
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SalesFunnelService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<SalesFunnelReport> {
    const now    = new Date()
    const cutoff = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    // ── Fetch data ────────────────────────────────────────────────────────────
    const [proformasRes, salesRes] = await Promise.all([
      this.supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at, converted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', cutoff),

      this.supabase
        .from('sales')
        .select('id, payment_status, total, currency, fx_try, created_at, sale_date, due_date, paid_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', cutoff),
    ])

    if (proformasRes.error) throw new Error(`SalesFunnelService: ${proformasRes.error.message}`)
    if (salesRes.error)     throw new Error(`SalesFunnelService: ${salesRes.error.message}`)

    const proformas  = (proformasRes.data ?? []) as ProformaRow[]
    const salesRaw   = (salesRes.data   ?? []) as SaleRow[]

    const todayStr = now.toISOString().slice(0, 10)

    // ── Classify sales by payment_status ─────────────────────────────────────
    const confirmedSales: SaleRow[] = []
    const partialSales:   SaleRow[] = []
    const paidSales:      SaleRow[] = []
    const overdueSales:   SaleRow[] = []

    for (const s of salesRaw) {
      const ps = s.payment_status ?? 'unpaid'
      if (ps === 'paid') {
        paidSales.push(s)
      } else if (ps === 'partial') {
        partialSales.push(s)
      } else if (ps === 'overdue') {
        overdueSales.push(s)
      } else {
        // unpaid → check if overdue by due_date
        if (s.due_date && s.due_date < todayStr) {
          overdueSales.push(s)
        } else {
          confirmedSales.push(s)
        }
      }
    }

    // ── Stage values ──────────────────────────────────────────────────────────
    const proformaCount = proformas.length
    const proformaValue = proformas.reduce((s, p) => s + toTRY(p.total, p.currency, p.fx_try), 0)

    const confirmedCount = confirmedSales.length
    const confirmedValue = confirmedSales.reduce((s, r) => s + toTRY(r.total, r.currency, r.fx_try), 0)

    const partialCount = partialSales.length
    const partialValue = partialSales.reduce((s, r) => s + toTRY(r.total, r.currency, r.fx_try), 0)

    const paidCount = paidSales.length
    const paidValue = paidSales.reduce((s, r) => s + toTRY(r.total, r.currency, r.fx_try), 0)

    const overdueCount = overdueSales.length
    const overdueValue = overdueSales.reduce((s, r) => s + toTRY(r.total, r.currency, r.fx_try), 0)

    // ── Avg days in stage ─────────────────────────────────────────────────────
    // proforma stage: time from created_at to converted_at (or today if still open)
    const proformaDurations = proformas.map(p =>
      daysBetween(p.created_at, p.converted_at ?? todayStr),
    )
    const avgDaysProforma = computeAvgDaysInStage(proformaDurations)

    // confirmed → paid: sale_date to paid_at
    const paidDurations = paidSales
      .filter(s => s.paid_at)
      .map(s => daysBetween(s.sale_date ?? s.created_at, s.paid_at!))
    const avgDaysConfirmed = computeAvgDaysInStage(paidDurations)

    // ── Stages array ──────────────────────────────────────────────────────────
    const stages: FunnelStage[] = [
      {
        stage_id:         'proforma',
        stage_name:       'Proforma/Teklif',
        count:            proformaCount,
        value_try:        proformaValue,
        avg_days_in_stage: avgDaysProforma,
      },
      {
        stage_id:         'confirmed',
        stage_name:       'Onaylı Sipariş',
        count:            confirmedCount,
        value_try:        confirmedValue,
        avg_days_in_stage: null,
      },
      {
        stage_id:         'partial',
        stage_name:       'Kısmi Tahsilat',
        count:            partialCount,
        value_try:        partialValue,
        avg_days_in_stage: null,
      },
      {
        stage_id:         'paid',
        stage_name:       'Tam Tahsilat',
        count:            paidCount,
        value_try:        paidValue,
        avg_days_in_stage: avgDaysConfirmed,
      },
      {
        stage_id:         'overdue',
        stage_name:       'Vadesi Geçmiş',
        count:            overdueCount,
        value_try:        overdueValue,
        avg_days_in_stage: null,
      },
    ]

    // ── Metrics ───────────────────────────────────────────────────────────────
    const totalSales = confirmedCount + partialCount + paidCount + overdueCount

    const proformaToSaleRate   = computeConversionRate(proformaCount, totalSales)
    const saleToPaidRate       = computeConversionRate(totalSales, paidCount)
    const saleToPartialRate    = computeConversionRate(totalSales, partialCount)
    const overallConversionRate = computeConversionRate(proformaCount, paidCount)

    // avg cycle days: proforma creation to payment
    const avgProformaToSaleDays = computeAvgDaysInStage(
      proformas
        .filter(p => p.converted_at)
        .map(p => daysBetween(p.created_at, p.converted_at!)),
    )

    const avgSaleToPaymentDays = computeAvgDaysInStage(paidDurations)

    let avgTotalCycleDays: number | null = null
    if (avgProformaToSaleDays !== null && avgSaleToPaymentDays !== null) {
      avgTotalCycleDays = avgProformaToSaleDays + avgSaleToPaymentDays
    } else if (avgProformaToSaleDays !== null) {
      avgTotalCycleDays = avgProformaToSaleDays
    } else if (avgSaleToPaymentDays !== null) {
      avgTotalCycleDays = avgSaleToPaymentDays
    }

    const metrics: FunnelMetrics = {
      proforma_to_sale_rate:    proformaToSaleRate,
      sale_to_paid_rate:        saleToPaidRate,
      sale_to_partial_rate:     saleToPartialRate,
      overall_conversion_rate:  overallConversionRate,
      avg_proforma_to_sale_days: avgProformaToSaleDays,
      avg_sale_to_payment_days:  avgSaleToPaymentDays,
      avg_total_cycle_days:      avgTotalCycleDays,
    }

    // ── Derived values ────────────────────────────────────────────────────────
    const conversionHealth = classifyConversionRateHealth(overallConversionRate)
    const dealVelocity     = classifyDealVelocity(avgTotalCycleDays)
    const bottleneckStage  = identifyBottleneckStage(stages)

    const openPipelineValue    = proformaValue + confirmedValue
    const weightedPipelineValue = computeWeightedPipelineValue(
      proformaValue,
      confirmedValue,
      partialValue,
      overdueValue,
    )

    const pipeline30dForecast = computePipeline30DayForecast(
      openPipelineValue,
      overallConversionRate,
      avgTotalCycleDays,
    )

    // ── Monthly flow (this calendar month) ───────────────────────────────────
    const newProformasThisMonth  = proformas.filter(p => p.created_at >= monthStart).length
    const closedAsWonThisMonth   = paidSales.filter(s => (s.paid_at ?? s.sale_date ?? s.created_at) >= monthStart).length
    const closedAsLostThisMonth  = proformas.filter(
      p => ['rejected', 'expired', 'cancelled'].includes(p.status ?? '') && p.created_at >= monthStart,
    ).length

    const monthlyFlow = computeMonthlyFunnelFlow(
      newProformasThisMonth,
      closedAsWonThisMonth,
      closedAsLostThisMonth,
    )

    // ── Total leakage ─────────────────────────────────────────────────────────
    // Value that entered but did not reach paid stage
    const totalLeakage = computeFunnelLeakage(proformaValue, paidValue)

    return {
      analysis_period:            'last_90_days',
      stages,
      metrics,
      conversion_health:          conversionHealth,
      deal_velocity:              dealVelocity,
      bottleneck_stage:           bottleneckStage,
      open_pipeline_value_try:    openPipelineValue,
      weighted_pipeline_value_try: weightedPipelineValue,
      pipeline_30d_forecast_try:  pipeline30dForecast,
      monthly_flow:               monthlyFlow,
      total_leakage_try:          totalLeakage,
    }
  }

  // ── getReportV2: proforma-centric funnel analytics ──────────────────────────

  async getReportV2(companyId: string, periodMonths = 3): Promise<SalesFunnelReportV2> {
    const now     = new Date()
    const cutoff  = new Date(now.getTime() - periodMonths * 30 * 86_400_000)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const asOfDate  = now.toISOString().slice(0, 10)

    // ── Fetch proformas ────────────────────────────────────────────────────────
    const proformasRes = await this.supabase
      .from('proformas')
      .select('id, status, total, currency, fx_try, created_at, converted_at, customer_id, customer_name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', cutoffStr)

    if (proformasRes.error) throw new Error(`SalesFunnelService.getReportV2: ${proformasRes.error.message}`)

    const proformas = (proformasRes.data ?? []) as Array<{
      id: string
      status: string | null
      total: number | null
      currency: string | null
      fx_try: number | null
      created_at: string
      converted_at: string | null
      customer_id: string | null
      customer_name: string | null
    }>

    // ── Fetch converted sales (linked via proforma_id) ─────────────────────────
    const salesRes = await this.supabase
      .from('sales')
      .select('id, proforma_id, total, currency, fx_try, sale_date, created_at, customer_id, customer_name')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .not('proforma_id', 'is', null)
      .gte('created_at', cutoffStr)

    const salesRows = salesRes.error ? [] : (salesRes.data ?? []) as Array<{
      id: string
      proforma_id: string | null
      total: number | null
      currency: string | null
      fx_try: number | null
      sale_date: string | null
      created_at: string
      customer_id: string | null
      customer_name: string | null
    }>

    // Build lookup: proforma_id → sale row
    const proformaSaleMap = new Map(salesRows.filter(s => s.proforma_id).map(s => [s.proforma_id!, s]))

    // ── Classify proformas ─────────────────────────────────────────────────────
    const convertedStatus = new Set(['converted', 'approved'])
    const expiredStatus   = new Set(['expired', 'rejected', 'cancelled'])

    let totalProformaValue   = 0
    let convertedValue       = 0
    let pendingProformasArr: Array<{ total: number }> = []
    let expiredCount = 0
    let convertedCount = 0
    let pendingCount   = 0
    const cycleTimes: number[] = []

    const customerProformas: Array<{ customer_id: string; customer_name: string; is_converted: boolean }> = []

    for (const p of proformas) {
      const valueTRY = toTRY(p.total, p.currency, p.fx_try)
      totalProformaValue += valueTRY

      const status = p.status ?? ''
      const isConvertedByStatus = convertedStatus.has(status)
      const isConvertedBySale   = proformaSaleMap.has(p.id)
      const isConverted         = isConvertedByStatus || isConvertedBySale
      const isExpired           = expiredStatus.has(status) && !isConverted

      if (isConverted) {
        convertedCount++
        convertedValue += valueTRY
        // Cycle time: proforma created_at → converted_at or sale date
        const linkedSale = proformaSaleMap.get(p.id)
        const conversionDate = p.converted_at
          ?? linkedSale?.sale_date
          ?? linkedSale?.created_at
          ?? null
        if (conversionDate) {
          cycleTimes.push(daysBetween(p.created_at, conversionDate))
        }
      } else if (isExpired) {
        expiredCount++
      } else {
        // pending
        pendingCount++
        pendingProformasArr.push({ total: valueTRY })
      }

      // Customer data
      if (p.customer_id) {
        customerProformas.push({
          customer_id:   p.customer_id,
          customer_name: p.customer_name ?? 'Bilinmiyor',
          is_converted:  isConverted,
        })
      }
    }

    // ── Revenue for quote-to-revenue ratio ─────────────────────────────────────
    const allSalesRes = await this.supabase
      .from('sales')
      .select('total, currency, fx_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('created_at', cutoffStr)
      .eq('payment_status', 'paid')

    const totalInvoicedRevenue = allSalesRes.error
      ? 0
      : (allSalesRes.data ?? []).reduce(
          (s: number, r: { total: number | null; currency: string | null; fx_try: number | null }) =>
            s + toTRY(r.total, r.currency, r.fx_try),
          0,
        )

    // ── Compute metrics ────────────────────────────────────────────────────────
    const totalProformas   = proformas.length
    const conversionRate   = computeConversionRateV2(convertedCount, totalProformas)
    const expirationRate   = computeExpirationRate(expiredCount, totalProformas)
    const avgCycleTime     = computeAvgCycleTime(cycleTimes)
    const medianCycleTime  = computeMedianCycleTime(cycleTimes)
    const cycleEfficiency  = classifyCycleTimeEfficiency(avgCycleTime)
    const pipelineValue    = computePipelineValue(pendingProformasArr)
    const expectedPipeline = computeExpectedPipelineValue(pipelineValue, conversionRate)
    const avgQuoteValue    = computeAvgQuoteValue(totalProformaValue, totalProformas)
    const pipelineVelocity = computePipelineVelocity(pipelineValue, avgCycleTime)
    const healthScore      = computeFunnelHealthScore(conversionRate, cycleEfficiency, expirationRate)
    const health           = classifyFunnelHealth(healthScore)

    // Top 10 customers by total_quotes
    const allWinRates = computeCustomerWinRates(customerProformas)
    const topCustomerWinRates = [...allWinRates]
      .sort((a, b) => b.total_quotes - a.total_quotes)
      .slice(0, 10)

    const narrative = generateFunnelNarrative(health, conversionRate, pipelineValue, avgCycleTime)

    return {
      as_of_date:             asOfDate,
      period_months:          periodMonths,
      total_proformas:        totalProformas,
      converted_proformas:    convertedCount,
      pending_proformas:      pendingCount,
      expired_proformas:      expiredCount,
      conversion_rate_pct:    conversionRate,
      expiration_rate_pct:    expirationRate,
      avg_cycle_time_days:    avgCycleTime,
      median_cycle_time_days: medianCycleTime,
      cycle_time_efficiency:  cycleEfficiency,
      total_proforma_value:   totalProformaValue,
      converted_value:        convertedValue,
      pipeline_value:         pipelineValue,
      expected_pipeline_value: expectedPipeline,
      avg_quote_value:        avgQuoteValue,
      pipeline_velocity:      pipelineVelocity,
      funnel_health_score:    healthScore,
      funnel_health:          health,
      customer_win_rates:     topCustomerWinRates,
      narrative,
    }
  }
}
