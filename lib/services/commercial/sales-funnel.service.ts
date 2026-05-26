// ── SalesFunnelService — Stage-by-Stage Pipeline Funnel Analytics ────────────
// Tracks proforma → sale → payment conversion at each stage.
// Data source: sales table with is_proforma flag + proformas table.
// Stages: proforma_created → sent → approved → sale_confirmed → sale_paid

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  stage: 'proforma_created' | 'proforma_sent' | 'proforma_approved' | 'sale_confirmed' | 'sale_paid'
  label: string               // Turkish label
  count: number
  total_value_try: number     // sum of values at this stage
  conversion_rate_pct: number | null  // this stage count / previous stage count × 100
  avg_days_in_stage: number | null    // average time spent in this stage
  drop_off_pct: number | null         // 100 - conversion_rate (lost at this stage)
}

export interface FunnelMetrics {
  overall_conversion_pct: number | null   // paid / total_created × 100
  avg_days_to_payment: number | null      // proforma_created to sale fully paid
  avg_deal_size_try: number | null        // avg total_try for confirmed sales
  total_pipeline_value_try: number        // value of proformas not yet converted
  total_closed_won_try: number           // value of paid sales this period
  velocity: number | null                // deals closed per month (last 3 months avg)
}

export interface SalesFunnelReport {
  stages: FunnelStage[]
  metrics: FunnelMetrics
  period_label: string    // 'Son 90 Gün'
  top_conversion_stage: string | null    // stage with worst conversion
  bottleneck_label: string | null        // Turkish: 'En büyük kayıp: Proforma → Satış aşamasında (%42)'
}

// ── Raw DB rows ────────────────────────────────────────────────────────────────

interface ProformaRow {
  id:         string
  status:     string | null
  total:      number | null
  currency:   string | null
  fx_try:     number | null
  created_at: string
}

interface SaleRow {
  id:             string
  is_proforma:    boolean | null
  status:         string | null
  payment_status: string | null
  total:          number | null
  fx_try:         number | null
  currency:       string | null
  created_at:     string
  sale_date:      string | null
  proforma_id:    string | null
}

// ── Pure Helpers (exported) ───────────────────────────────────────────────────

/**
 * Compute conversion rate: current / previous × 100.
 * Returns null if previous is 0 (cannot divide).
 */
export function computeConversionRate(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round((current / previous) * 100 * 10) / 10
}

/**
 * Compute drop-off percentage: 100 - conversionRate.
 * Returns null if conversionRate is null.
 */
export function computeDropOff(conversionRate: number | null): number | null {
  if (conversionRate === null) return null
  return Math.round((100 - conversionRate) * 10) / 10
}

/**
 * Find the bottleneck stage: the stage (excluding the first) with the
 * lowest non-null conversion_rate_pct. Returns null if no such stage.
 */
export function findBottleneckStage(stages: FunnelStage[]): FunnelStage | null {
  if (stages.length === 0) return null
  const candidates = stages.slice(1).filter(s => s.conversion_rate_pct !== null)
  if (candidates.length === 0) return null
  return candidates.reduce((worst, s) =>
    (s.conversion_rate_pct as number) < (worst.conversion_rate_pct as number) ? s : worst,
  )
}

/**
 * Build a Turkish bottleneck label from the worst stage.
 * Returns null if stage is null.
 */
export function buildBottleneckLabel(stage: FunnelStage | null): string | null {
  if (!stage) return null
  const pct = stage.conversion_rate_pct !== null
    ? `%${stage.conversion_rate_pct.toFixed(0)}`
    : '%?'
  return `En büyük kayıp: ${stage.label} aşamasında (${pct})`
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toTRY(total: number | null, currency: string | null, fx_try: number | null): number {
  const t = Number(total ?? 0)
  if ((currency ?? 'TRY') === 'TRY') return t
  return t * (Number(fx_try) || 1)
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SalesFunnelService {
  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    opts?: { days?: number },
  ): Promise<SalesFunnelReport> {
    const days = opts?.days ?? 90
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

    const [proformasRes, salesRes] = await Promise.allSettled([
      supabase
        .from('proformas')
        .select('id, status, total, currency, fx_try, created_at')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', cutoff),

      supabase
        .from('sales')
        .select('id, is_proforma, status, payment_status, total, fx_try, currency, created_at, sale_date, proforma_id')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', cutoff),
    ])

    const proformas: ProformaRow[] =
      proformasRes.status === 'fulfilled' ? ((proformasRes.value.data ?? []) as ProformaRow[]) : []
    const allSales: SaleRow[] =
      salesRes.status === 'fulfilled' ? ((salesRes.value.data ?? []) as SaleRow[]) : []

    // Split sales into proforma-type and actual-sale-type
    const salesProformas = allSales.filter(s => s.is_proforma === true)
    const actualSales    = allSales.filter(s => s.is_proforma === false || s.is_proforma === null)

    // ── Stage 1: proforma_created ─────────────────────────────────────────────
    // All proformas in the period (union of proformas table + sales with is_proforma=true)
    const allProformaRows: Array<{ id: string; status: string | null; valueTRY: number; created_at: string }> = [
      ...proformas.map(p => ({
        id: p.id,
        status: p.status,
        valueTRY: toTRY(p.total, p.currency, p.fx_try),
        created_at: p.created_at,
      })),
      ...salesProformas.map(s => ({
        id: s.id,
        status: s.status,
        valueTRY: toTRY(s.total, s.currency, s.fx_try),
        created_at: s.created_at,
      })),
    ]
    // De-duplicate by id
    const seenIds = new Set<string>()
    const uniqueProformas = allProformaRows.filter(p => {
      if (seenIds.has(p.id)) return false
      seenIds.add(p.id)
      return true
    })

    const createdCount    = uniqueProformas.length
    const createdValueTRY = uniqueProformas.reduce((s, p) => s + p.valueTRY, 0)

    // ── Stage 2: proforma_sent ────────────────────────────────────────────────
    // status = 'sent' | 'approved' | 'converted' (all downstream stages)
    const sentStatuses = new Set(['sent', 'approved', 'accepted', 'converted'])
    const sentProformas = uniqueProformas.filter(p => sentStatuses.has(p.status ?? ''))
    const sentCount    = sentProformas.length
    const sentValueTRY = sentProformas.reduce((s, p) => s + p.valueTRY, 0)

    // ── Stage 3: proforma_approved ────────────────────────────────────────────
    // status = 'approved' | 'accepted' | 'converted'
    const approvedStatuses = new Set(['approved', 'accepted', 'converted'])
    const approvedProformas = uniqueProformas.filter(p => approvedStatuses.has(p.status ?? ''))
    const approvedCount    = approvedProformas.length
    const approvedValueTRY = approvedProformas.reduce((s, p) => s + p.valueTRY, 0)

    // ── Stage 4: sale_confirmed ───────────────────────────────────────────────
    // Actual sales (is_proforma=false) with payment_status in pending|partial|paid|overdue
    const confirmedStatuses = new Set(['pending', 'partial', 'paid', 'overdue', 'confirmed'])
    const confirmedSales = actualSales.filter(
      s => confirmedStatuses.has(s.payment_status ?? '') || s.payment_status === null,
    )
    const confirmedCount    = confirmedSales.length
    const confirmedValueTRY = confirmedSales.reduce((s, sale) => s + toTRY(sale.total, sale.currency, sale.fx_try), 0)

    // ── Stage 5: sale_paid ────────────────────────────────────────────────────
    const paidSales = actualSales.filter(s => s.payment_status === 'paid')
    const paidCount    = paidSales.length
    const paidValueTRY = paidSales.reduce((s, sale) => s + toTRY(sale.total, sale.currency, sale.fx_try), 0)

    // ── Conversion rates ──────────────────────────────────────────────────────
    const cr12 = computeConversionRate(sentCount, createdCount)
    const cr23 = computeConversionRate(approvedCount, sentCount)
    const cr34 = computeConversionRate(confirmedCount, approvedCount)
    const cr45 = computeConversionRate(paidCount, confirmedCount)

    // ── Build stages ──────────────────────────────────────────────────────────
    const stages: FunnelStage[] = [
      {
        stage: 'proforma_created',
        label: 'Proforma Oluşturuldu',
        count: createdCount,
        total_value_try: createdValueTRY,
        conversion_rate_pct: null,
        avg_days_in_stage: null,
        drop_off_pct: null,
      },
      {
        stage: 'proforma_sent',
        label: 'Proforma Gönderildi',
        count: sentCount,
        total_value_try: sentValueTRY,
        conversion_rate_pct: cr12,
        avg_days_in_stage: null,
        drop_off_pct: computeDropOff(cr12),
      },
      {
        stage: 'proforma_approved',
        label: 'Proforma Onaylandı',
        count: approvedCount,
        total_value_try: approvedValueTRY,
        conversion_rate_pct: cr23,
        avg_days_in_stage: null,
        drop_off_pct: computeDropOff(cr23),
      },
      {
        stage: 'sale_confirmed',
        label: 'Satış Onaylandı',
        count: confirmedCount,
        total_value_try: confirmedValueTRY,
        conversion_rate_pct: cr34,
        avg_days_in_stage: null,
        drop_off_pct: computeDropOff(cr34),
      },
      {
        stage: 'sale_paid',
        label: 'Satış Ödendi',
        count: paidCount,
        total_value_try: paidValueTRY,
        conversion_rate_pct: cr45,
        avg_days_in_stage: null,
        drop_off_pct: computeDropOff(cr45),
      },
    ]

    // ── Metrics ───────────────────────────────────────────────────────────────
    const overallConversion = computeConversionRate(paidCount, createdCount)

    const avgDealSize = confirmedCount > 0
      ? Math.round(confirmedValueTRY / confirmedCount)
      : null

    // Pipeline value: proformas not yet converted
    const pipelineStatuses = new Set(['draft', 'sent', 'accepted', 'approved'])
    const pipelineValueTRY = uniqueProformas
      .filter(p => pipelineStatuses.has(p.status ?? 'draft'))
      .reduce((s, p) => s + p.valueTRY, 0)

    // Velocity: paidSales count / 3 months
    const threeMonthsAgo = new Date(Date.now() - 90 * 86_400_000).toISOString()
    const recentPaid = paidSales.filter(s => (s.sale_date ?? s.created_at) >= threeMonthsAgo.slice(0, 10))
    const velocity = recentPaid.length > 0 ? Math.round((recentPaid.length / 3) * 10) / 10 : null

    const metrics: FunnelMetrics = {
      overall_conversion_pct: overallConversion,
      avg_days_to_payment: null,  // requires timestamp data per row not available
      avg_deal_size_try: avgDealSize,
      total_pipeline_value_try: pipelineValueTRY,
      total_closed_won_try: paidValueTRY,
      velocity,
    }

    // ── Bottleneck ────────────────────────────────────────────────────────────
    const bottleneck = findBottleneckStage(stages)
    const bottleneckLabel = buildBottleneckLabel(bottleneck)

    return {
      stages,
      metrics,
      period_label: `Son ${days} Gün`,
      top_conversion_stage: bottleneck?.stage ?? null,
      bottleneck_label: bottleneckLabel,
    }
  }
}
