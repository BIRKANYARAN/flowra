// ── PipelineVelocityService — Sales Pipeline Velocity & Conversion Analysis ───
// Analyzes proforma-to-sale conversion rates, deal velocity (time to close),
// and pipeline health for Turkish B2B SMEs.
//
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Conversion rate: (converted / total) × 100.
 * Returns null if total === 0.
 */
export function computeConversionRate(
  converted: number,
  total: number,
): number | null {
  if (total === 0) return null
  return (converted / total) * 100
}

/**
 * Average days to close: mean of (closed_at - created_at) in days.
 * Returns null if array is empty.
 * Each deal: days = (closed_at - created_at) in ms / 86_400_000.
 */
export function computeAvgDaysToClose(
  closedDeals: Array<{
    created_at: string  // 'YYYY-MM-DD' or ISO datetime
    closed_at: string   // when converted or closed-lost
  }>,
): number | null {
  if (closedDeals.length === 0) return null
  const totalDays = closedDeals.reduce((sum, deal) => {
    const created = new Date(deal.created_at).getTime()
    const closed  = new Date(deal.closed_at).getTime()
    return sum + (closed - created) / 86_400_000
  }, 0)
  return totalDays / closedDeals.length
}

/**
 * Pipeline Velocity = (dealCount × avgDealValue × winRate/100) / avgDaysToClose.
 * Represents revenue generated per day in pipeline.
 * Returns null if avgDaysToClose is null or 0.
 */
export function computePipelineVelocity(
  dealCount: number,
  avgDealValue: number,
  winRate: number,          // 0-100 percentage
  avgDaysToClose: number | null,
): number | null {
  if (avgDaysToClose === null || avgDaysToClose === 0) return null
  return (dealCount * avgDealValue * (winRate / 100)) / avgDaysToClose
}

/**
 * Win/Loss ratio: won / lost.
 * Returns null if lost === 0.
 * Returns 0 if won === 0 (with lost > 0 this is handled, but won=0/lost>0 → 0).
 */
export function computeWinLossRatio(
  won: number,
  lost: number,
): number | null {
  if (lost === 0) return null
  return won / lost
}

/**
 * Classify pipeline health based on conversion rate and days-to-close.
 * insufficient_data: both null
 * excellent: conversion >= 60% AND daysToClose <= benchmark × 0.75
 * good: conversion >= 40% AND daysToClose <= benchmark × 1.25
 * average: conversion >= 20% OR daysToClose <= benchmark × 2
 * underperforming: else
 */
export function classifyPipelineHealth(
  conversionRatePct: number | null,
  avgDaysToClose: number | null,
  industryBenchmarkDays = 14,  // default for Turkish SME (proforma to sale)
): 'excellent' | 'good' | 'average' | 'underperforming' | 'insufficient_data' {
  if (conversionRatePct === null && avgDaysToClose === null) return 'insufficient_data'

  const conv = conversionRatePct
  const days = avgDaysToClose

  if (
    conv !== null && conv >= 60 &&
    days !== null && days <= industryBenchmarkDays * 0.75
  ) return 'excellent'

  if (
    conv !== null && conv >= 40 &&
    days !== null && days <= industryBenchmarkDays * 1.25
  ) return 'good'

  if (
    (conv !== null && conv >= 20) ||
    (days !== null && days <= industryBenchmarkDays * 2)
  ) return 'average'

  return 'underperforming'
}

/**
 * Sales cycle efficiency: (benchmarkDays / actualDaysToClose) × 100.
 * > 100 = faster than benchmark; < 100 = slower.
 * Returns null if actualDaysToClose is null or 0.
 */
export function computeSalesCycleEfficiency(
  actualDaysToClose: number | null,
  benchmarkDays = 14,
): number | null {
  if (actualDaysToClose === null || actualDaysToClose === 0) return null
  return (benchmarkDays / actualDaysToClose) * 100
}

/**
 * Stuck deal rate: deals that haven't moved for stuckThresholdDays or more.
 * stuck_rate_pct = stuck_count / total × 100; null if total = 0.
 */
export function computeStuckDealRate(
  openDeals: Array<{
    created_at: string
    value: number
  }>,
  stuckThresholdDays = 30,
): {
  stuck_count: number
  stuck_value: number
  stuck_rate_pct: number | null
} {
  const total = openDeals.length
  if (total === 0) return { stuck_count: 0, stuck_value: 0, stuck_rate_pct: null }

  const now = Date.now()
  const thresholdMs = stuckThresholdDays * 86_400_000

  let stuckCount = 0
  let stuckValue = 0

  for (const deal of openDeals) {
    const createdMs = new Date(deal.created_at).getTime()
    if (now - createdMs >= thresholdMs) {
      stuckCount++
      stuckValue += deal.value
    }
  }

  return {
    stuck_count: stuckCount,
    stuck_value: stuckValue,
    stuck_rate_pct: (stuckCount / total) * 100,
  }
}

/**
 * Monthly pipeline flow with running pending total.
 * pending = cumulative: prev_pending + created - converted - lost (starting at 0).
 * conversion_rate per month: converted / (converted + lost) × 100, or null if denominator = 0.
 */
export function computeMonthlyPipelineFlow(
  months: Array<{
    month: string       // 'YYYY-MM'
    created: number     // new deals/proformas
    converted: number
    lost: number
  }>,
): Array<{
  month: string
  created: number
  converted: number
  lost: number
  pending: number
  conversion_rate: number | null
}> {
  let runningPending = 0
  return months.map(m => {
    runningPending = runningPending + m.created - m.converted - m.lost
    const denominator = m.converted + m.lost
    return {
      month: m.month,
      created: m.created,
      converted: m.converted,
      lost: m.lost,
      pending: runningPending,
      conversion_rate: denominator > 0 ? (m.converted / denominator) * 100 : null,
    }
  })
}

// ── Internal types ────────────────────────────────────────────────────────────

interface ProformaRow {
  id:           string
  status:       string | null
  total:        number | null
  currency:     string | null
  fx_try:       number | null
  created_at:   string
  converted_at: string | null
}

interface SaleRow {
  proforma_id: string | null
  sale_date:   string | null
  total_try:   number | null
}

function toTRY(p: ProformaRow): number {
  const total = Number(p.total ?? 0)
  if ((p.currency ?? 'TRY') === 'TRY') return total
  return total * (Number(p.fx_try) || 1)
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
}

// ── Service ───────────────────────────────────────────────────────────────────

export class PipelineVelocityService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<{
    current: {
      open_deal_count: number
      open_pipeline_value: number
      conversion_rate_pct: number | null
      avg_days_to_close: number | null
      pipeline_velocity: number | null
      pipeline_health: ReturnType<typeof classifyPipelineHealth>
      win_loss_ratio: number | null
      sales_cycle_efficiency: number | null
    }
    stuck_deals: ReturnType<typeof computeStuckDealRate>
    monthly_flow: ReturnType<typeof computeMonthlyPipelineFlow>
    summary: {
      total_deals_ytd: number
      total_converted_ytd: number
      total_revenue_from_pipeline: number
      best_conversion_month: string | null
      worst_conversion_month: string | null
    }
  }> {
    const now = new Date()
    const ytdStart = `${now.getFullYear()}-01-01`

    // ── Fetch all proformas (no date filter for open/pipeline) ────────────────
    const [proformasRes, salesRes] = await Promise.all([
      this.supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at, converted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),

      this.supabase
        .from('sales')
        .select('proforma_id, sale_date, total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('proforma_id', 'is', null),
    ])

    if (proformasRes.error) throw new Error(`PipelineVelocityService: ${proformasRes.error.message}`)

    const proformas = (proformasRes.data ?? []) as ProformaRow[]
    const allSales  = (salesRes.data  ?? []) as SaleRow[]

    // Build lookup: proforma_id → sale
    const saleByProformaId = new Map<string, SaleRow>()
    for (const s of allSales) {
      if (s.proforma_id) saleByProformaId.set(s.proforma_id, s)
    }

    // ── Classify all proformas ────────────────────────────────────────────────
    let convertedCount = 0
    let rejectedCount  = 0
    let openCount      = 0
    let openValue      = 0
    let totalCount     = 0
    let convertedRevenue = 0

    const closedDeals: Array<{ created_at: string; closed_at: string }> = []
    const openDealsForStuck: Array<{ created_at: string; value: number }> = []

    // YTD counters
    let ytdTotal     = 0
    let ytdConverted = 0

    for (const p of proformas) {
      const status    = p.status ?? 'draft'
      const valueTRY  = toTRY(p)
      const linkedSale = saleByProformaId.get(p.id)
      totalCount++

      // YTD
      if (p.created_at >= ytdStart) {
        ytdTotal++
      }

      if (status === 'converted' || linkedSale) {
        convertedCount++
        convertedRevenue += valueTRY
        if (p.created_at >= ytdStart) ytdConverted++

        const closeDate = linkedSale?.sale_date ?? p.converted_at
        if (closeDate) {
          closedDeals.push({ created_at: p.created_at, closed_at: closeDate })
        }
      } else if (status === 'rejected' || status === 'expired') {
        rejectedCount++
        // Also count as a "loss" for avg days tracking if rejected
        const closeDate = p.converted_at // may be null; skip if null
        if (closeDate) {
          closedDeals.push({ created_at: p.created_at, closed_at: closeDate })
        }
      } else {
        // draft | sent | accepted | approved → open/pipeline
        openCount++
        openValue += valueTRY
        openDealsForStuck.push({ created_at: p.created_at, value: valueTRY })
      }
    }

    // ── Core metrics ──────────────────────────────────────────────────────────
    const conversionRatePct = computeConversionRate(convertedCount, totalCount)
    const avgDaysToClose    = computeAvgDaysToClose(closedDeals)

    // avg deal value across all proformas
    const avgDealValue = totalCount > 0
      ? proformas.reduce((s, p) => s + toTRY(p), 0) / totalCount
      : 0

    const winRate = conversionRatePct ?? 0
    const pipelineVelocity = computePipelineVelocity(
      openCount,
      avgDealValue,
      winRate,
      avgDaysToClose,
    )

    const pipelineHealth = classifyPipelineHealth(conversionRatePct, avgDaysToClose)
    const winLossRatio   = computeWinLossRatio(convertedCount, rejectedCount)
    const salesCycleEff  = computeSalesCycleEfficiency(avgDaysToClose)

    // ── Stuck deals ───────────────────────────────────────────────────────────
    const stuckDeals = computeStuckDealRate(openDealsForStuck)

    // ── Monthly flow (last 6 months) ─────────────────────────────────────────
    const sixMonthsAgo = new Date(now)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5) // inclusive: 6 months
    const sixMonthsAgoStr = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`

    // Build month buckets
    const monthBuckets = new Map<string, { created: number; converted: number; lost: number }>()

    // Initialize 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now)
      d.setMonth(d.getMonth() - i)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthBuckets.set(ym, { created: 0, converted: 0, lost: 0 })
    }

    for (const p of proformas) {
      const ym = p.created_at.slice(0, 7)
      if (ym < sixMonthsAgoStr) continue

      const bucket = monthBuckets.get(ym)
      if (!bucket) continue

      const status     = p.status ?? 'draft'
      const linkedSale = saleByProformaId.get(p.id)

      bucket.created++
      if (status === 'converted' || linkedSale) {
        bucket.converted++
      } else if (status === 'rejected' || status === 'expired') {
        bucket.lost++
      }
    }

    const monthlyInput = Array.from(monthBuckets.entries()).map(([month, b]) => ({
      month,
      created:   b.created,
      converted: b.converted,
      lost:      b.lost,
    }))

    const monthlyFlow = computeMonthlyPipelineFlow(monthlyInput)

    // ── Summary best/worst month ──────────────────────────────────────────────
    const monthsWithDecided = monthlyFlow.filter(
      m => m.conversion_rate !== null && (m.converted + m.lost) > 0,
    )

    let bestConversionMonth: string | null = null
    let worstConversionMonth: string | null = null

    if (monthsWithDecided.length > 0) {
      const sorted = [...monthsWithDecided].sort(
        (a, b) => (b.conversion_rate ?? 0) - (a.conversion_rate ?? 0),
      )
      bestConversionMonth  = sorted[0]?.month ?? null
      worstConversionMonth = sorted[sorted.length - 1]?.month ?? null
      if (bestConversionMonth === worstConversionMonth) worstConversionMonth = null
    }

    return {
      current: {
        open_deal_count:        openCount,
        open_pipeline_value:    openValue,
        conversion_rate_pct:    conversionRatePct,
        avg_days_to_close:      avgDaysToClose,
        pipeline_velocity:      pipelineVelocity,
        pipeline_health:        pipelineHealth,
        win_loss_ratio:         winLossRatio,
        sales_cycle_efficiency: salesCycleEff,
      },
      stuck_deals: stuckDeals,
      monthly_flow: monthlyFlow,
      summary: {
        total_deals_ytd:           ytdTotal,
        total_converted_ytd:       ytdConverted,
        total_revenue_from_pipeline: convertedRevenue,
        best_conversion_month:     bestConversionMonth,
        worst_conversion_month:    worstConversionMonth,
      },
    }
  }
}
