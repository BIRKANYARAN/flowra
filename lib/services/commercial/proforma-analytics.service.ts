// ── ProformaAnalyticsService — Proforma Win Rate & Conversion Funnel ──────────
// Tracks conversion rates, time-to-convert, deal sizes, and pipeline value.
// Proforma → Sale link: sales.proforma_id = proformas.id
// Statuses used: draft | sent | accepted | approved | rejected | converted | expired

import type { SupabaseClient } from '@supabase/supabase-js'

// ── New Analytics Report Types ────────────────────────────────────────────────

export interface SizeBucket {
  label:     string
  min:       number
  max:       number | null
  count:     number
  value_try: number
}

export interface ConversionTimeBucket {
  label: string   // '<7 gün', '7-14 gün', '14-30 gün', '30+ gün'
  count: number
  pct:   number
}

export interface ProformaProductStat {
  product_id:      string
  product_name:    string
  times_quoted:    number
  times_converted: number
  win_rate_pct:    number
}

export interface MonthlyProformaStat {
  month:        string        // 'YYYY-MM'
  label:        string        // 'Oca 2025'
  created:      number
  converted:    number
  expired:      number
  win_rate_pct: number | null
}

export interface ProformaAnalyticsReport {
  company_id:  string
  period_days: number          // 90
  // Win rate
  total_created:   number
  total_converted: number
  total_expired:   number
  total_pending:   number
  win_rate_pct:    number | null
  // Deal size
  avg_value_try:        number
  median_value_try:     number
  avg_converted_value:  number
  avg_expired_value:    number
  size_buckets:         SizeBucket[]
  // Time to conversion
  avg_days_to_convert:    number | null
  median_days_to_convert: number | null
  time_buckets:           ConversionTimeBucket[]
  // Products
  top_products: ProformaProductStat[]
  // Trend
  monthly_trend: MonthlyProformaStat[]
  computed_at: string
}

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

// ── Pure exported helpers (testable) ─────────────────────────────────────────

/**
 * Win rate = converted / (converted + expired) × 100
 * Returns null when converted + expired = 0 (no decided proformas).
 */
export function computeWinRate(converted: number, expired: number): number | null {
  const decided = converted + expired
  if (decided === 0) return null
  return Math.round((converted / decided) * 100 * 10) / 10
}

/**
 * Median of a numeric array.
 * Returns null for empty array.
 */
export function computeMedian(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

/** Returns the size bucket label for a TRY value. */
export function assignSizeBucket(value: number): string {
  if (value < 10_000)  return '<10K'
  if (value < 50_000)  return '10K-50K'
  if (value < 200_000) return '50K-200K'
  return '200K+'
}

/** Returns the time-to-conversion bucket label for a day count. */
export function assignTimeBucket(days: number): string {
  if (days < 7)  return '<7 gün'
  if (days < 14) return '7-14 gün'
  if (days <= 30) return '14-30 gün'
  return '30+ gün'
}

const TR_MONTHS = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara']

/**
 * Build monthly trend array for the last `monthCount` months ending at `endYearMonth`.
 * `endYearMonth` format: 'YYYY-MM'
 */
export function buildMonthlyTrend(
  proformas: Array<{ created_at: string; status: string | null; converted_at?: string | null }>,
  endYearMonth: string,
  monthCount = 6,
): MonthlyProformaStat[] {
  // Generate month keys from oldest → newest
  const [endY, endM] = endYearMonth.split('-').map(Number)
  const months: string[] = []
  for (let i = monthCount - 1; i >= 0; i--) {
    let m = endM - i
    let y = endY
    while (m <= 0) { m += 12; y-- }
    months.push(`${y}-${String(m).padStart(2, '0')}`)
  }

  const buckets = new Map<string, { created: number; converted: number; expired: number }>()
  for (const mo of months) {
    buckets.set(mo, { created: 0, converted: 0, expired: 0 })
  }

  for (const p of proformas) {
    const moKey = p.created_at.slice(0, 7)
    if (!buckets.has(moKey)) continue
    const b = buckets.get(moKey)!
    b.created++
    const s = p.status ?? 'draft'
    if (s === 'converted') b.converted++
    else if (s === 'expired') b.expired++
  }

  return months.map(mo => {
    const b  = buckets.get(mo)!
    const [y, m] = mo.split('-').map(Number)
    return {
      month:        mo,
      label:        `${TR_MONTHS[m - 1]} ${y}`,
      created:      b.created,
      converted:    b.converted,
      expired:      b.expired,
      win_rate_pct: computeWinRate(b.converted, b.expired),
    }
  })
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

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

function computeWinRateLegacy(converted: number, rejected: number, expired: number): number {
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

    const winRate = computeWinRateLegacy(convertedCount, rejectedCount, expiredCount)

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
      ? computeWinRateLegacy(priorConverted, priorRejected, priorExpired)
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

  // ── getReport — full 90-day analytics ────────────────────────────────────────

  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    opts?: { periodDays?: number; today?: string },
  ): Promise<ProformaAnalyticsReport> {
    const periodDays = opts?.periodDays ?? 90
    const todayDate  = opts?.today ? new Date(opts.today) : new Date()
    const toISO      = todayDate.toISOString().slice(0, 10)
    const fromDate   = new Date(todayDate.getTime() - (periodDays - 1) * 86_400_000)
    const fromISO    = fromDate.toISOString().slice(0, 10)

    // Current month key for trend
    const endYearMonth = toISO.slice(0, 7)

    // 1. Proformas in period
    const [proformasRes, salesRes, itemsRes] = await Promise.all([
      supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at, converted_at, valid_until')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', fromISO)
        .lte('created_at', toISO + 'T23:59:59'),

      supabase
        .from('sales')
        .select('proforma_id, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('proforma_id', 'is', null),

      supabase
        .from('proforma_items')
        .select('proforma_id, product_id, product_name')
        .eq('company_id', companyId),
    ])

    type FullProformaRow = ProformaRow & { valid_until?: string | null }
    const proformas = (proformasRes.data ?? []) as FullProformaRow[]
    const allSales  = (salesRes.data  ?? []) as Array<{ proforma_id: string | null; sale_date: string }>
    const allItems  = (itemsRes.data  ?? []) as Array<{ proforma_id: string; product_id: string | null; product_name: string }>

    // Lookup: proforma_id → sale
    const saleByProformaId = new Map<string, { sale_date: string }>()
    for (const s of allSales) {
      if (s.proforma_id) saleByProformaId.set(s.proforma_id, s)
    }

    // Classify proformas
    let totalConverted = 0
    let totalExpired   = 0
    let totalPending   = 0
    const allValues:       number[] = []
    const convertedValues: number[] = []
    const expiredValues:   number[] = []
    const conversionDays:  number[] = []

    for (const p of proformas) {
      const val    = toTRY(p)
      const status = p.status ?? 'draft'
      const linked = saleByProformaId.get(p.id)
      allValues.push(val)

      if (status === 'converted' || linked) {
        totalConverted++
        convertedValues.push(val)
        const convertDate = linked?.sale_date ?? p.converted_at ?? null
        if (convertDate) conversionDays.push(daysBetween(p.created_at, convertDate))
      } else if (status === 'expired') {
        totalExpired++
        expiredValues.push(val)
      } else {
        totalPending++
      }
    }

    // Win rate
    const winRatePct = computeWinRate(totalConverted, totalExpired)

    // Deal size
    const avgValue       = allValues.length > 0 ? allValues.reduce((s, v) => s + v, 0) / allValues.length : 0
    const medianValue    = computeMedian(allValues) ?? 0
    const avgConverted   = convertedValues.length > 0 ? convertedValues.reduce((s, v) => s + v, 0) / convertedValues.length : 0
    const avgExpired     = expiredValues.length   > 0 ? expiredValues.reduce((s, v) => s + v, 0)   / expiredValues.length   : 0

    // Size buckets
    const BUCKETS: SizeBucket[] = [
      { label: '<10K',     min: 0,       max: 10_000,  count: 0, value_try: 0 },
      { label: '10K-50K',  min: 10_000,  max: 50_000,  count: 0, value_try: 0 },
      { label: '50K-200K', min: 50_000,  max: 200_000, count: 0, value_try: 0 },
      { label: '200K+',    min: 200_000, max: null,     count: 0, value_try: 0 },
    ]
    for (const val of allValues) {
      const lbl = assignSizeBucket(val)
      const bkt = BUCKETS.find(b => b.label === lbl)
      if (bkt) { bkt.count++; bkt.value_try += val }
    }

    // Time buckets
    const TIME_LABELS = ['<7 gün', '7-14 gün', '14-30 gün', '30+ gün']
    const timeCounts  = new Map<string, number>()
    for (const lbl of TIME_LABELS) timeCounts.set(lbl, 0)
    for (const d of conversionDays) {
      const lbl = assignTimeBucket(d)
      timeCounts.set(lbl, (timeCounts.get(lbl) ?? 0) + 1)
    }
    const totalConvDays = conversionDays.length
    const time_buckets: ConversionTimeBucket[] = TIME_LABELS.map(lbl => {
      const count = timeCounts.get(lbl) ?? 0
      return { label: lbl, count, pct: totalConvDays > 0 ? Math.round((count / totalConvDays) * 100) : 0 }
    })

    // Avg & median conversion days
    const avgDaysToConvert    = conversionDays.length > 0
      ? Math.round(conversionDays.reduce((s, d) => s + d, 0) / conversionDays.length)
      : null
    const medianDaysToConvert = computeMedian(conversionDays)
      !== null ? Math.round(computeMedian(conversionDays)!) : null

    // Product stats — group items by product, track which proformas were converted
    const proformaIdSet = new Set(proformas.map(p => p.id))
    const convertedProformaIds = new Set(
      proformas
        .filter(p => p.status === 'converted' || saleByProformaId.has(p.id))
        .map(p => p.id)
    )

    type ProdAgg = { product_name: string; proformaIds: Set<string>; convertedIds: Set<string> }
    const prodMap = new Map<string, ProdAgg>()

    for (const item of allItems) {
      // Only count items belonging to proformas in this period
      if (!proformaIdSet.has(item.proforma_id)) continue
      const key = item.product_id ?? `__name__${item.product_name}`
      if (!prodMap.has(key)) {
        prodMap.set(key, { product_name: item.product_name, proformaIds: new Set(), convertedIds: new Set() })
      }
      const agg = prodMap.get(key)!
      agg.proformaIds.add(item.proforma_id)
      if (convertedProformaIds.has(item.proforma_id)) {
        agg.convertedIds.add(item.proforma_id)
      }
    }

    const top_products: ProformaProductStat[] = [...prodMap.entries()]
      .map(([key, agg]) => ({
        product_id:      key.startsWith('__name__') ? '' : key,
        product_name:    agg.product_name,
        times_quoted:    agg.proformaIds.size,
        times_converted: agg.convertedIds.size,
        win_rate_pct:    agg.proformaIds.size > 0
          ? Math.round((agg.convertedIds.size / agg.proformaIds.size) * 100)
          : 0,
      }))
      .sort((a, b) => b.times_quoted - a.times_quoted)
      .slice(0, 10)

    // Monthly trend (last 6 months)
    // Use all proformas (not just period) for trend — fetch broader range
    const monthly_trend = buildMonthlyTrend(
      proformas.map(p => ({ created_at: p.created_at, status: p.status, converted_at: p.converted_at })),
      endYearMonth,
      6,
    )

    return {
      company_id:   companyId,
      period_days:  periodDays,
      total_created:   proformas.length,
      total_converted: totalConverted,
      total_expired:   totalExpired,
      total_pending:   totalPending,
      win_rate_pct:    winRatePct,
      avg_value_try:        Math.round(avgValue),
      median_value_try:     Math.round(medianValue),
      avg_converted_value:  Math.round(avgConverted),
      avg_expired_value:    Math.round(avgExpired),
      size_buckets:         BUCKETS,
      avg_days_to_convert:    avgDaysToConvert,
      median_days_to_convert: medianDaysToConvert,
      time_buckets,
      top_products,
      monthly_trend,
      computed_at: new Date().toISOString(),
    }
  }
}
