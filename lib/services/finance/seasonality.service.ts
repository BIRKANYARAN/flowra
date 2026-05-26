// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/seasonality.service.ts
//
// Revenue Seasonality Analysis — calendar-month patterns across years.
//
// Queries confirmed sales (not proformas, not deleted) for the last 24 months
// (2 years), groups by year-month, averages each calendar month across years,
// then computes a seasonal index relative to the overall monthly average.
//
// Seasonal index = (month_avg_revenue / overall_monthly_avg) × 100
//   100 = exactly average, 150 = 50% above average, 50 = half of average
//
// Strength = max_index - min_index:
//   strong (> 50), moderate (20-50), weak (0-20), insufficient_data (< 2 years)
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export interface MonthlySeasonalityData {
  month_number: number          // 1-12
  month_name: string            // 'Ocak', 'Şubat', etc. (Turkish)
  avg_revenue_try: number       // average revenue for this calendar month across all years
  avg_expense_try: number
  avg_net_try: number
  seasonal_index: number        // avg_revenue / overall_monthly_avg × 100 (100 = average)
  data_points: number           // how many years of data
  peak_year: number | null      // year with highest revenue for this month
  peak_revenue_try: number | null
}

export interface SeasonalityReport {
  monthly_data: MonthlySeasonalityData[]   // all 12 months
  peak_month_number: number | null         // month with highest seasonal_index
  peak_month_name: string | null
  trough_month_number: number | null       // month with lowest seasonal_index
  trough_month_name: string | null
  seasonality_strength: 'strong' | 'moderate' | 'weak' | 'insufficient_data'
  years_analyzed: number
  overall_monthly_avg_try: number          // global avg monthly revenue across all data
  recommendation: string                   // Turkish insight about seasonality
}

// ── Pure helpers ───────────────────────────────────────────────────────────────

/** Turkish month names (1-indexed: index 0 = 'Ocak', index 11 = 'Aralık') */
export const TURKISH_MONTHS: string[] = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/**
 * Compute seasonal index for a calendar month.
 * Returns 100 when overallAvg = 0 (neutral — no data).
 */
export function computeSeasonalIndex(monthAvg: number, overallAvg: number): number {
  if (overallAvg === 0) return 100
  return round2((monthAvg / overallAvg) * 100)
}

/**
 * Classify seasonality strength from an array of seasonal indices.
 * Uses max - min spread:
 *   > 50 → strong
 *   20-50 → moderate
 *   0-20 → weak
 * Returns 'insufficient_data' if the indices array has fewer than 2 elements with
 * data_points >= 1. Caller should pass only indices for months that have data.
 */
export function computeSeasonalityStrength(
  indices: number[],
): SeasonalityReport['seasonality_strength'] {
  if (indices.length < 2) return 'insufficient_data'
  const max = Math.max(...indices)
  const min = Math.min(...indices)
  const spread = max - min
  if (spread > 50) return 'strong'
  if (spread >= 20) return 'moderate'
  return 'weak'
}

/**
 * Generate a Turkish-language seasonality recommendation.
 */
export function buildSeasonalityRecommendation(
  peak: number | null,
  trough: number | null,
  strength: SeasonalityReport['seasonality_strength'],
): string {
  if (strength === 'insufficient_data') {
    return 'Mevsimsellik analizi için en az 12 aylık veri gerekiyor.'
  }

  if (strength === 'weak') {
    return 'Geliriniz yıl boyunca istikrarlı seyrediyor. Mevsimsel etki minimal.'
  }

  // Determine season groups
  const summerMonths = [6, 7, 8]        // Haz, Tem, Ağu
  const winterMonths = [12, 1, 2]       // Ara, Oca, Şub
  const springMonths = [3, 4, 5]        // Mar, Nis, May
  const autumnMonths = [9, 10, 11]      // Eyl, Eki, Kas

  function seasonLabel(month: number | null): string | null {
    if (month === null) return null
    if (summerMonths.includes(month)) return 'Yaz (Haz-Ağu)'
    if (winterMonths.includes(month)) return 'Kış (Ara-Şub)'
    if (springMonths.includes(month)) return 'İlkbahar (Mar-May)'
    if (autumnMonths.includes(month)) return 'Sonbahar (Eyl-Kas)'
    return null
  }

  const peakSeason   = seasonLabel(peak)
  const troughSeason = seasonLabel(trough)
  const peakName   = peak   !== null ? TURKISH_MONTHS[peak - 1]   : null
  const troughName = trough !== null ? TURKISH_MONTHS[trough - 1] : null

  const strengthLabel = strength === 'strong' ? 'güçlü' : 'orta düzey'

  if (peak !== null && summerMonths.includes(peak)) {
    return `Yaz ayları (Haz-Ağu) işletmenin pik dönemi. Bu aylarda nakit ve stok hazırlığı kritik.`
  }

  if (trough !== null && winterMonths.includes(trough)) {
    return `Kış aylarında gelir önemli ölçüde düşüyor. Ocak-Şubat için nakit rezerv tutulması önerilir.`
  }

  if (peak !== null && peakSeason !== null) {
    const troughHint = troughName ? ` En düşük dönem: ${troughName}.` : ''
    return `${peakSeason} dönemi en yüksek gelir dönemine karşılık geliyor (${strengthLabel} mevsimsellik). Bu dönemde kapasite ve stok planlaması yapılmalı.${troughHint}`
  }

  if (trough !== null && troughSeason !== null) {
    const peakHint = peakName ? ` Pik ay: ${peakName}.` : ''
    return `${troughSeason} döneminde gelir düşüşü gözlemleniyor. Bu dönem için nakit tampon oluşturulması önerilir.${peakHint}`
  }

  return `İşletmede ${strengthLabel} mevsimsellik tespit edildi. Pik ve dip dönemlere göre stok ve nakit planlaması yapılması önerilir.`
}

// ── Service ────────────────────────────────────────────────────────────────────

export class SeasonalityService {

  /**
   * Build a full SeasonalityReport for the given company using up to 24 months of data.
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    now: Date = new Date(),
  ): Promise<SeasonalityReport> {
    // ── Date window: 24 months back from start of current month ───────────────
    const windowEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0)  // last day of current month
    const windowStart = new Date(now.getFullYear() - 2, now.getMonth(), 1)  // same month 2 years ago

    const windowFrom = windowStart.toISOString().slice(0, 10)
    const windowTo   = windowEnd.toISOString().slice(0, 10)

    // ── Fetch sales and expenses in parallel ────────────────────────────────────
    const [salesResult, expenseResult] = await Promise.allSettled([
      supabase
        .from('sales')
        .select('sale_date, total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', windowFrom)
        .lte('sale_date', windowTo)
        .order('sale_date', { ascending: true }),

      supabase
        .from('expenses')
        .select('expense_date, amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', windowFrom)
        .lte('expense_date', windowTo),
    ])

    // ── Aggregate into year+month buckets ───────────────────────────────────────
    // Key: 'YYYY-M' (year + 1-indexed month)
    const revByYearMonth:     Record<string, number> = {}
    const expenseByYearMonth: Record<string, number> = {}

    if (salesResult.status === 'fulfilled' && salesResult.value?.data) {
      for (const row of salesResult.value.data) {
        if (!row.sale_date) continue
        const [y, m] = (row.sale_date as string).split('-')
        const key = `${y}-${parseInt(m, 10)}`
        revByYearMonth[key] = round2((revByYearMonth[key] ?? 0) + (Number(row.total_try) || 0))
      }
    }

    if (expenseResult.status === 'fulfilled' && expenseResult.value?.data) {
      for (const row of expenseResult.value.data) {
        if (!row.expense_date) continue
        const [y, m] = (row.expense_date as string).split('-')
        const key = `${y}-${parseInt(m, 10)}`
        expenseByYearMonth[key] = round2((expenseByYearMonth[key] ?? 0) + (Number(row.amount_try) || 0))
      }
    }

    // ── Determine distinct years in the data ────────────────────────────────────
    const allKeys = new Set([
      ...Object.keys(revByYearMonth),
      ...Object.keys(expenseByYearMonth),
    ])
    const yearsSet = new Set<number>()
    for (const key of allKeys) {
      const year = parseInt(key.split('-')[0], 10)
      if (!isNaN(year)) yearsSet.add(year)
    }
    const years = Array.from(yearsSet).sort()
    const years_analyzed = years.length

    // ── Build per-calendar-month averages (1–12) ────────────────────────────────
    // For each month number, collect values across all years that have data
    const monthlyRevByCalMonth:     Record<number, number[]> = {}
    const monthlyExpByCalMonth:     Record<number, number[]> = {}
    const monthlyRevByYearForMonth: Record<number, Record<number, number>> = {}

    for (let m = 1; m <= 12; m++) {
      monthlyRevByCalMonth[m]     = []
      monthlyExpByCalMonth[m]     = []
      monthlyRevByYearForMonth[m] = {}
    }

    for (const year of years) {
      for (let m = 1; m <= 12; m++) {
        const key = `${year}-${m}`
        if (key in revByYearMonth || key in expenseByYearMonth) {
          const rev = revByYearMonth[key] ?? 0
          const exp = expenseByYearMonth[key] ?? 0
          monthlyRevByCalMonth[m].push(rev)
          monthlyExpByCalMonth[m].push(exp)
          monthlyRevByYearForMonth[m][year] = rev
        }
      }
    }

    // ── Overall monthly average revenue (across all year-month data points) ─────
    const allRevValues: number[] = []
    for (let m = 1; m <= 12; m++) {
      allRevValues.push(...monthlyRevByCalMonth[m])
    }
    const overall_monthly_avg_try = allRevValues.length > 0
      ? round2(allRevValues.reduce((s, v) => s + v, 0) / allRevValues.length)
      : 0

    // ── Build MonthlySeasonalityData for each calendar month ───────────────────
    const monthly_data: MonthlySeasonalityData[] = []

    for (let m = 1; m <= 12; m++) {
      const revVals = monthlyRevByCalMonth[m]
      const expVals = monthlyExpByCalMonth[m]
      const data_points = revVals.length

      const avg_revenue_try = data_points > 0
        ? round2(revVals.reduce((s, v) => s + v, 0) / data_points)
        : 0
      const avg_expense_try = expVals.length > 0
        ? round2(expVals.reduce((s, v) => s + v, 0) / expVals.length)
        : 0
      const avg_net_try = round2(avg_revenue_try - avg_expense_try)

      const seasonal_index = computeSeasonalIndex(avg_revenue_try, overall_monthly_avg_try)

      // Peak year for this month
      const revByYear = monthlyRevByYearForMonth[m]
      let peak_year: number | null = null
      let peak_revenue_try: number | null = null
      for (const [yearStr, rev] of Object.entries(revByYear)) {
        if (peak_revenue_try === null || rev > peak_revenue_try) {
          peak_revenue_try = rev
          peak_year = parseInt(yearStr, 10)
        }
      }

      monthly_data.push({
        month_number: m,
        month_name:   TURKISH_MONTHS[m - 1],
        avg_revenue_try,
        avg_expense_try,
        avg_net_try,
        seasonal_index,
        data_points,
        peak_year,
        peak_revenue_try,
      })
    }

    // ── Peak & trough ───────────────────────────────────────────────────────────
    // Only consider months that actually have data (data_points > 0)
    const activeMonths = monthly_data.filter(d => d.data_points > 0)

    let peakMonthData:   MonthlySeasonalityData | null = null
    let troughMonthData: MonthlySeasonalityData | null = null

    for (const md of activeMonths) {
      if (peakMonthData === null || md.seasonal_index > peakMonthData.seasonal_index) {
        peakMonthData = md
      }
      if (troughMonthData === null || md.seasonal_index < troughMonthData.seasonal_index) {
        troughMonthData = md
      }
    }

    const peak_month_number = peakMonthData?.month_number   ?? null
    const peak_month_name   = peakMonthData?.month_name     ?? null
    const trough_month_number = troughMonthData?.month_number ?? null
    const trough_month_name   = troughMonthData?.month_name   ?? null

    // ── Strength ────────────────────────────────────────────────────────────────
    // Need at least 2 years of data to compute meaningful strength
    const activeIndices = activeMonths.map(d => d.seasonal_index)
    let seasonality_strength: SeasonalityReport['seasonality_strength']

    if (years_analyzed < 2) {
      seasonality_strength = 'insufficient_data'
    } else {
      seasonality_strength = computeSeasonalityStrength(activeIndices)
    }

    // ── Recommendation ──────────────────────────────────────────────────────────
    const recommendation = buildSeasonalityRecommendation(
      peak_month_number,
      trough_month_number,
      seasonality_strength,
    )

    return {
      monthly_data,
      peak_month_number,
      peak_month_name,
      trough_month_number,
      trough_month_name,
      seasonality_strength,
      years_analyzed,
      overall_monthly_avg_try,
      recommendation,
    }
  }
}
