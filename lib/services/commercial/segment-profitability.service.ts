// ── SegmentProfitabilityService — Profitability by product category ───────────
//
// Segments sales by product category (product_categories) and computes:
//   Revenue → COGS → Gross Profit → Gross Margin % per segment
//
// "Uncategorized" segment collects items whose products have no category.
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SegmentPerformance = 'star' | 'profitable' | 'marginal' | 'loss_leader'

export interface SegmentData {
  segment_key: string          // category_id or 'uncategorized'
  segment_name: string         // category name or "Kategori Yok"
  dimension: 'category'        // could expand later

  revenue_try: number
  cogs_try: number
  gross_profit_try: number
  gross_margin_pct: number
  performance: SegmentPerformance

  orders_count: number
  unique_customers: number
  avg_order_value_try: number

  revenue_share_pct: number
  revenue_growth_pct: number | null   // vs prior period

  prior_revenue_try: number | null
}

export interface SegmentProfitabilityReport {
  period_key: string
  period_label: string
  total_revenue_try: number
  total_cogs_try: number
  overall_margin_pct: number
  segments: SegmentData[]         // sorted by revenue_try desc
  pareto_80_count: number         // how many segments = 80% of revenue
  star_segments: string[]         // names of star segments
  loss_leader_segments: string[]  // names of loss leaders
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

/**
 * computeSegmentMargin
 * Computes gross margin percentage: (revenue - cogs) / revenue × 100.
 * Returns 0 when revenue is 0 or negative.
 */
export function computeSegmentMargin(revenueTry: number, cogsTry: number): number {
  if (revenueTry <= 0) return 0
  return ((revenueTry - cogsTry) / revenueTry) * 100
}

/**
 * classifySegmentPerformance
 * margin ≥ 40%  → 'star'
 * 25-39%        → 'profitable'
 * 10-24%        → 'marginal'
 * <10%          → 'loss_leader'
 */
export function classifySegmentPerformance(
  marginPct: number,
): SegmentPerformance {
  if (marginPct >= 40) return 'star'
  if (marginPct >= 25) return 'profitable'
  if (marginPct >= 10) return 'marginal'
  return 'loss_leader'
}

/**
 * computeSegmentShare
 * Returns the segment's share of total company revenue as a percentage.
 * Returns 0 when totalRevenue is 0.
 */
export function computeSegmentShare(segmentRevenue: number, totalRevenue: number): number {
  if (totalRevenue <= 0) return 0
  return (segmentRevenue / totalRevenue) * 100
}

/**
 * computeSegmentGrowth
 * Computes revenue growth between two periods as a percentage.
 * Returns null when priorRevenue is 0 (no base to compare).
 */
export function computeSegmentGrowth(
  currentRevenue: number,
  priorRevenue: number,
): number | null {
  if (priorRevenue === 0) return null
  return ((currentRevenue - priorRevenue) / Math.abs(priorRevenue)) * 100
}

/**
 * computePareto80Segments
 * Returns the count of segments needed to reach 80% of total revenue.
 * Assumes segments are already sorted by revenue descending.
 * If no segments, returns 0.
 */
export function computePareto80Segments(
  segments: Array<{ revenue_try: number }>,
): number {
  if (segments.length === 0) return 0

  const total = segments.reduce((s, seg) => s + seg.revenue_try, 0)
  if (total <= 0) return 0

  const target = total * 0.8
  let cumulative = 0

  for (let i = 0; i < segments.length; i++) {
    cumulative += segments[i].revenue_try
    if (cumulative >= target) return i + 1
  }

  return segments.length
}

// ── Internal types ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

interface RawSaleItemRow {
  sale_id:      string | null
  total_try:    number | null
  qty:          number | null
  product_id:   string | null
  sale_date:    string | null
  customer_id:  string | null
  customer_name: string | null
  // joined
  products: {
    category_id: string | null
    product_categories: { id: string; name: string } | null
  } | null
}

interface AllocationRow {
  sale_id:        string | null
  product_id:     string | null
  qty_allocated:  number | null
  cost_price_try: number | null
}

interface SegmentAccum {
  segment_key:  string
  segment_name: string
  revenue:      number
  cogs:         number
  sale_ids:     Set<string>
  customer_ids: Set<string>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns YYYY-MM string for the previous month from a given YYYY-MM key. */
function priorPeriodKey(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returns { from, to } ISO date strings for a given YYYY-MM period key. */
function periodBounds(periodKey: string): { from: string; to: string } {
  const [y, m] = periodKey.split('-').map(Number)
  const from = `${periodKey}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const to = `${periodKey}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

/** Formats a YYYY-MM key into Turkish label e.g. "Ocak 2025" */
function periodLabel(periodKey: string): string {
  const [y, m] = periodKey.split('-').map(Number)
  const monthNames = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
  ]
  return `${monthNames[m - 1]} ${y}`
}

// ── Core data-fetching helper ─────────────────────────────────────────────────

async function fetchSegmentData(
  companyId: string,
  supabase: AnySupabase,
  from: string,
  to: string,
): Promise<{ items: RawSaleItemRow[]; allocations: AllocationRow[] }> {
  let items: RawSaleItemRow[] = []
  let allocations: AllocationRow[] = []

  try {
    const { data, error } = await supabase
      .from('sale_items')
      .select(`
        sale_id,
        total_try,
        qty,
        product_id,
        products(
          category_id,
          product_categories(id, name)
        ),
        sales!inner(
          sale_date,
          deleted_at,
          is_proforma,
          company_id,
          customer_id,
          customer_name
        )
      `)
      .eq('sales.company_id', companyId)
      .is('sales.deleted_at', null)
      .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
      .gte('sales.sale_date', from)
      .lte('sales.sale_date', to)

    if (!error && data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items = (data as Array<Record<string, any>>).map(r => ({
        sale_id:       r.sale_id   as string | null,
        total_try:     Number(r.total_try ?? 0),
        qty:           Number(r.qty ?? 1),
        product_id:    r.product_id as string | null,
        sale_date:     (r.sales as Record<string, unknown>)?.sale_date as string | null,
        customer_id:   (r.sales as Record<string, unknown>)?.customer_id as string | null,
        customer_name: (r.sales as Record<string, unknown>)?.customer_name as string | null,
        products:      r.products as RawSaleItemRow['products'],
      }))
    }
  } catch {
    items = []
  }

  try {
    const { data, error } = await supabase
      .from('sale_item_allocations')
      .select('sale_id, product_id, qty_allocated, cost_price_try')
      .eq('company_id', companyId)

    if (!error && data) {
      allocations = data as AllocationRow[]
    }
  } catch {
    allocations = []
  }

  return { items, allocations }
}

/** Aggregate items into segment map. Returns map keyed by segment_key. */
function aggregateSegments(
  items: RawSaleItemRow[],
  allocMap: Map<string, number>,
): Map<string, SegmentAccum> {
  const segMap = new Map<string, SegmentAccum>()

  for (const item of items) {
    // Resolve segment key + name
    let segKey  = 'uncategorized'
    let segName = 'Kategori Yok'

    if (item.products) {
      const catId   = item.products.category_id
      const catData = item.products.product_categories
      if (catId && catData) {
        segKey  = catId
        segName = catData.name ?? 'Bilinmeyen Kategori'
      } else if (catId) {
        segKey  = catId
        segName = 'Kategori ' + catId.slice(0, 8)
      }
    }

    const revenue = Number(item.total_try ?? 0)

    // COGS from allocation
    const allocKey = `${item.sale_id}__${item.product_id}`
    const cogs     = item.sale_id && item.product_id ? (allocMap.get(allocKey) ?? 0) : 0

    const saleId    = item.sale_id ?? ''
    const custKey   = item.customer_id ?? item.customer_name ?? 'unknown'

    if (!segMap.has(segKey)) {
      segMap.set(segKey, {
        segment_key:  segKey,
        segment_name: segName,
        revenue:      0,
        cogs:         0,
        sale_ids:     new Set(),
        customer_ids: new Set(),
      })
    }

    const acc = segMap.get(segKey)!
    acc.revenue += revenue
    acc.cogs    += cogs
    if (saleId) acc.sale_ids.add(saleId)
    if (custKey) acc.customer_ids.add(custKey)
  }

  return segMap
}

/** Build allocation lookup map: sale_id__product_id → COGS */
function buildAllocMap(allocations: AllocationRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const a of allocations) {
    if (!a.sale_id || !a.product_id) continue
    const key  = `${a.sale_id}__${a.product_id}`
    const prev = map.get(key) ?? 0
    map.set(key, prev + Number(a.qty_allocated ?? 0) * Number(a.cost_price_try ?? 0))
  }
  return map
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SegmentProfitabilityService {
  constructor(private supabase: AnySupabase) {}

  async getReport(
    companyId: string,
    periodKey?: string,
    includePrior = false,
  ): Promise<SegmentProfitabilityReport> {
    // Default to current month
    const now  = new Date()
    const key  = periodKey ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const { from, to } = periodBounds(key)

    // ── Fetch current period ──────────────────────────────────────────────────
    const { items, allocations } = await fetchSegmentData(companyId, this.supabase, from, to)
    const allocMap = buildAllocMap(allocations)
    const segMap   = aggregateSegments(items, allocMap)

    // ── Optionally fetch prior period ─────────────────────────────────────────
    let priorSegMap: Map<string, SegmentAccum> | null = null
    if (includePrior) {
      const priorKey = priorPeriodKey(key)
      const { from: pFrom, to: pTo } = periodBounds(priorKey)
      const { items: pItems, allocations: pAlloc } = await fetchSegmentData(
        companyId, this.supabase, pFrom, pTo,
      )
      const pAllocMap = buildAllocMap(pAlloc)
      priorSegMap = aggregateSegments(pItems, pAllocMap)
    }

    // ── Compute totals ────────────────────────────────────────────────────────
    const totalRevenue  = Array.from(segMap.values()).reduce((s, seg) => s + seg.revenue, 0)
    const totalCogs     = Array.from(segMap.values()).reduce((s, seg) => s + seg.cogs,    0)
    const overallMargin = computeSegmentMargin(totalRevenue, totalCogs)

    // ── Build SegmentData array ───────────────────────────────────────────────
    const segments: SegmentData[] = Array.from(segMap.values()).map(acc => {
      const grossProfit = acc.revenue - acc.cogs
      const marginPct   = computeSegmentMargin(acc.revenue, acc.cogs)
      const performance = classifySegmentPerformance(marginPct)
      const sharePct    = computeSegmentShare(acc.revenue, totalRevenue)
      const ordersCount = acc.sale_ids.size
      const uniqueCust  = acc.customer_ids.size
      const avgOrderVal = ordersCount > 0 ? acc.revenue / ordersCount : 0

      const priorRevenue = priorSegMap
        ? (priorSegMap.get(acc.segment_key)?.revenue ?? 0)
        : null
      const growthPct    = priorRevenue !== null
        ? computeSegmentGrowth(acc.revenue, priorRevenue)
        : null

      return {
        segment_key:         acc.segment_key,
        segment_name:        acc.segment_name,
        dimension:           'category',
        revenue_try:         acc.revenue,
        cogs_try:            acc.cogs,
        gross_profit_try:    grossProfit,
        gross_margin_pct:    marginPct,
        performance,
        orders_count:        ordersCount,
        unique_customers:    uniqueCust,
        avg_order_value_try: avgOrderVal,
        revenue_share_pct:   sharePct,
        revenue_growth_pct:  growthPct,
        prior_revenue_try:   priorRevenue,
      }
    })

    // Sort by revenue descending
    segments.sort((a, b) => b.revenue_try - a.revenue_try)

    const pareto80Count      = computePareto80Segments(segments)
    const starSegments       = segments.filter(s => s.performance === 'star').map(s => s.segment_name)
    const lossLeaderSegments = segments.filter(s => s.performance === 'loss_leader').map(s => s.segment_name)

    return {
      period_key:           key,
      period_label:         periodLabel(key),
      total_revenue_try:    totalRevenue,
      total_cogs_try:       totalCogs,
      overall_margin_pct:   overallMargin,
      segments,
      pareto_80_count:      pareto80Count,
      star_segments:        starSegments,
      loss_leader_segments: lossLeaderSegments,
    }
  }
}
