// ── ProformaAnalyticsService — Proforma Win Rate & Conversion Funnel ──────────
// Tracks conversion rates, time-to-convert, deal sizes, and pipeline value.
// Proforma → Sale link: sales.proforma_id = proformas.id
// Statuses used: draft | sent | accepted | approved | rejected | converted

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProformaConversionMetrics {
  period_from: string
  period_to:   string

  // Volume
  total_proformas:  number
  converted_count:  number
  rejected_count:   number   // status = 'rejected'
  expired_count:    number   // status = 'expired' (or old proformas without linked sale)
  pending_count:    number   // still open (sent / accepted / approved / draft)

  // Rates
  win_rate_pct:        number  // converted / (converted + rejected + expired) × 100
  conversion_rate_pct: number  // converted / total × 100

  // Timing
  avg_days_to_convert:      number | null  // proforma created_at → sale_date
  fastest_conversion_days:  number | null

  // Value
  total_proforma_value_try:  number
  converted_value_try:       number
  conversion_value_rate_pct: number    // converted value / total proforma value
  avg_deal_size_try:         number | null

  // Pipeline (open proformas)
  pipeline_value_try: number
  pipeline_count:     number

  // Trend vs prior period
  prior_win_rate_pct: number | null
  win_rate_trend: 'improving' | 'stable' | 'declining' | 'insufficient_data'

  computed_at: string
}

// ── Raw DB rows ────────────────────────────────────────────────────────────────

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
  sale_date:   string
  total_try:   number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTRY(row: ProformaRow): number {
  const total = Number(row.total ?? 0)
  if ((row.currency ?? 'TRY') === 'TRY') return total
  return total * (Number(row.fx_try) || 1)
}

function daysBetween(a: string, b: string): number {
  const msA = new Date(a).getTime()
  const msB = new Date(b).getTime()
  return Math.max(0, Math.round(Math.abs(msB - msA) / 86_400_000))
}

function computeWinRate(converted: number, rejected: number, expired: number): number {
  const decided = converted + rejected + expired
  if (decided === 0) return 0
  return Math.round((converted / decided) * 100 * 10) / 10
}

function winRateTrend(
  current: number,
  prior: number | null,
): ProformaConversionMetrics['win_rate_trend'] {
  if (prior === null) return 'insufficient_data'
  const diff = current - prior
  if (diff > 5)  return 'improving'
  if (diff < -5) return 'declining'
  return 'stable'
}

// ── Service ───────────────────────────────────────────────────────────────────

export class ProformaAnalyticsService {
  static async getMetrics(
    companyId: string,
    supabase: SupabaseClient,
    period: { from: string; to: string },
    opts?: { today?: string },
  ): Promise<ProformaConversionMetrics> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    // Prior period: same duration shifted back
    const fromDate    = new Date(period.from)
    const toDate      = new Date(period.to)
    const daysSpan    = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1
    const priorToDate = new Date(fromDate.getTime() - 86_400_000)
    const priorFromDate = new Date(priorToDate.getTime() - (daysSpan - 1) * 86_400_000)
    const priorFrom   = priorFromDate.toISOString().slice(0, 10)
    const priorTo     = priorToDate.toISOString().slice(0, 10)

    const [proformasRes, salesRes, priorProformasRes, priorSalesRes] = await Promise.all([
      supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at, converted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', period.from)
        .lte('created_at', period.to + 'T23:59:59'),

      supabase
        .from('sales')
        .select('proforma_id, sale_date, total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('proforma_id', 'is', null),

      supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at, converted_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', priorFrom)
        .lte('created_at', priorTo + 'T23:59:59'),

      supabase
        .from('sales')
        .select('proforma_id, sale_date, total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('proforma_id', 'is', null),
    ])

    const proformas     = (proformasRes.data     ?? []) as ProformaRow[]
    const allSales      = (salesRes.data          ?? []) as SaleRow[]
    const priorProformas = (priorProformasRes.data ?? []) as ProformaRow[]

    // Build lookup: proforma_id → sale
    const saleByProformaId = new Map<string, SaleRow>()
    for (const s of allSales) {
      if (s.proforma_id) saleByProformaId.set(s.proforma_id, s)
    }

    // ── Classify current period ───────────────────────────────────────────────

    let convertedCount  = 0
    let rejectedCount   = 0
    let expiredCount    = 0
    let pendingCount    = 0
    let totalValueTRY   = 0
    let convertedValueTRY = 0
    let pipelineValueTRY  = 0
    let pipelineCount     = 0
    const conversionDays: number[] = []

    for (const p of proformas) {
      const valueTRY = toTRY(p)
      totalValueTRY += valueTRY

      const status = p.status ?? 'draft'
      const linkedSale = saleByProformaId.get(p.id)

      if (status === 'converted' || linkedSale) {
        convertedCount++
        convertedValueTRY += valueTRY
        // Days to convert: proforma created_at → sale_date (or converted_at)
        const convertDate = linkedSale?.sale_date ?? p.converted_at ?? null
        if (convertDate) {
          conversionDays.push(daysBetween(p.created_at, convertDate))
        }
      } else if (status === 'rejected') {
        rejectedCount++
      } else if (status === 'expired') {
        expiredCount++
      } else {
        // draft | sent | accepted | approved → pending/pipeline
        pendingCount++
        pipelineValueTRY += valueTRY
        pipelineCount++
      }
    }

    const winRate = computeWinRate(convertedCount, rejectedCount, expiredCount)

    const avgDaysToConvert = conversionDays.length > 0
      ? Math.round(conversionDays.reduce((s, d) => s + d, 0) / conversionDays.length)
      : null
    const fastestConversionDays = conversionDays.length > 0
      ? Math.min(...conversionDays)
      : null
    const avgDealSize = convertedCount > 0
      ? Math.round(convertedValueTRY / convertedCount)
      : null

    const conversionValueRate = totalValueTRY > 0
      ? Math.round((convertedValueTRY / totalValueTRY) * 100 * 10) / 10
      : 0

    // ── Prior period win rate ─────────────────────────────────────────────────

    let priorConverted = 0
    let priorRejected  = 0
    let priorExpired   = 0

    for (const p of priorProformas) {
      const status = p.status ?? 'draft'
      const linkedSale = saleByProformaId.get(p.id)
      if (status === 'converted' || linkedSale) {
        priorConverted++
      } else if (status === 'rejected') {
        priorRejected++
      } else if (status === 'expired') {
        priorExpired++
      }
    }

    const priorDecided = priorConverted + priorRejected + priorExpired
    const priorWinRate = priorDecided > 0
      ? computeWinRate(priorConverted, priorRejected, priorExpired)
      : null

    return {
      period_from: period.from,
      period_to:   period.to,

      total_proformas:  proformas.length,
      converted_count:  convertedCount,
      rejected_count:   rejectedCount,
      expired_count:    expiredCount,
      pending_count:    pendingCount,

      win_rate_pct:        winRate,
      conversion_rate_pct: proformas.length > 0
        ? Math.round((convertedCount / proformas.length) * 100 * 10) / 10
        : 0,

      avg_days_to_convert:     avgDaysToConvert,
      fastest_conversion_days: fastestConversionDays,

      total_proforma_value_try:  totalValueTRY,
      converted_value_try:       convertedValueTRY,
      conversion_value_rate_pct: conversionValueRate,
      avg_deal_size_try:         avgDealSize,

      pipeline_value_try: pipelineValueTRY,
      pipeline_count:     pipelineCount,

      prior_win_rate_pct: priorWinRate,
      win_rate_trend:     winRateTrend(winRate, priorWinRate),

      computed_at: new Date().toISOString(),
    }
  }
}
