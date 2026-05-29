// ── InventoryAgingService — Inventory Turnover & Aging Analysis ───────────────
// Computes inventory aging buckets, turnover metrics, obsolescence risk, and
// health scoring from stock_lots data.
//
// Pure helpers are exported for unit testing.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public types ──────────────────────────────────────────────────────────────

export interface StockLotInput {
  lot_id: string
  product_id: string
  product_name: string
  category: string | null
  quantity_remaining: number
  entry_cost_try: number  // per unit
  entry_date: string      // YYYY-MM-DD
  last_movement_date: string | null
}

export interface AgingBucket {
  label: string
  min_days: number
  max_days: number | null
  lot_count: number
  total_units: number
  total_value_try: number
  pct_of_total_value: number
}

export interface InventoryAgingReport {
  as_of_date: string
  total_inventory_value_try: number
  total_lots: number
  total_units: number
  aging_buckets: AgingBucket[]
  inventory_turnover: number | null
  days_inventory_outstanding: number | null
  turnover_health: string
  obsolescence_risk_pct: number
  obsolescence_risk_level: string
  slow_moving_value_try: number
  health_score: number
  inventory_health: string
  top_aging_lots: Array<{
    product_id: string
    product_name: string
    days_in_stock: number
    total_value_try: number
    aging_tier: string
  }>
  narrative: string
}

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

/**
 * Days between entryDate and asOfDate. Returns 0 if asOfDate < entryDate.
 */
export function computeDaysInStock(entryDate: string, asOfDate: string): number {
  const entry = new Date(entryDate).getTime()
  const asOf  = new Date(asOfDate).getTime()
  const diff  = Math.floor((asOf - entry) / (1000 * 60 * 60 * 24))
  return Math.max(0, diff)
}

/**
 * Total lot value = quantityRemaining × entryCostTry.
 */
export function computeLotValue(quantityRemaining: number, entryCostTry: number): number {
  return quantityRemaining * entryCostTry
}

/**
 * Classify a lot by how long it has been in stock.
 * fresh: 0-30d, normal: 31-90d, aging: 91-180d, slow_moving: 181-365d, obsolete: >365d
 */
export function classifyAgingTier(daysInStock: number): 'fresh' | 'normal' | 'aging' | 'slow_moving' | 'obsolete' {
  if (daysInStock <= 30)  return 'fresh'
  if (daysInStock <= 90)  return 'normal'
  if (daysInStock <= 180) return 'aging'
  if (daysInStock <= 365) return 'slow_moving'
  return 'obsolete'
}

/**
 * Inventory turnover = COGS last 12 months / average inventory value.
 * Returns null if avgInventoryValue is 0.
 */
export function computeInventoryTurnover(
  cogsLast12Months: number,
  avgInventoryValue: number,
): number | null {
  if (avgInventoryValue === 0) return null
  return cogsLast12Months / avgInventoryValue
}

/**
 * Days Inventory Outstanding = 365 / turnover.
 * Returns null if turnover is null or 0.
 */
export function computeDaysInventoryOutstanding(turnover: number | null): number | null {
  if (turnover === null || turnover === 0) return null
  return 365 / turnover
}

/**
 * Classify turnover health by DIO.
 */
export function classifyTurnoverHealth(
  dio: number | null,
): 'excellent' | 'good' | 'acceptable' | 'slow' | 'critical' | 'insufficient_data' {
  if (dio === null) return 'insufficient_data'
  if (dio <= 30)  return 'excellent'
  if (dio <= 60)  return 'good'
  if (dio <= 90)  return 'acceptable'
  if (dio <= 180) return 'slow'
  return 'critical'
}

/**
 * Build 5 aging buckets from lot data.
 */
export function buildAgingBuckets(
  lots: Array<{ days_in_stock: number; total_units: number; total_value_try: number }>,
  totalValue: number,
): AgingBucket[] {
  const BUCKETS: Array<{ label: string; min_days: number; max_days: number | null; tier: string }> = [
    { label: 'Taze (0-30 gün)',          min_days: 0,   max_days: 30,   tier: 'fresh'       },
    { label: 'Normal (31-90 gün)',        min_days: 31,  max_days: 90,   tier: 'normal'      },
    { label: 'Eskiyen (91-180 gün)',      min_days: 91,  max_days: 180,  tier: 'aging'       },
    { label: 'Yavaş Hareket (181-365 g)', min_days: 181, max_days: 365,  tier: 'slow_moving' },
    { label: 'Eskimiş (365+ gün)',        min_days: 366, max_days: null, tier: 'obsolete'    },
  ]

  return BUCKETS.map(bucket => {
    const matching = lots.filter(l => {
      const d = l.days_in_stock
      const inMin = d >= bucket.min_days
      const inMax = bucket.max_days === null ? true : d <= bucket.max_days
      return inMin && inMax
    })
    const lot_count      = matching.length
    const total_units    = matching.reduce((s, l) => s + l.total_units, 0)
    const total_value    = matching.reduce((s, l) => s + l.total_value_try, 0)
    const pct            = totalValue > 0 ? (total_value / totalValue) * 100 : 0
    return {
      label: bucket.label,
      min_days: bucket.min_days,
      max_days: bucket.max_days,
      lot_count,
      total_units,
      total_value_try: total_value,
      pct_of_total_value: pct,
    }
  })
}

/**
 * Obsolescence risk as a percentage.
 * Returns 0 if totalInventoryValue is 0.
 */
export function computeObsolescenceRisk(
  obsoleteValueTry: number,
  totalInventoryValue: number,
): number {
  if (totalInventoryValue === 0) return 0
  return (obsoleteValueTry / totalInventoryValue) * 100
}

/**
 * Classify obsolescence risk percentage.
 * low <5%, moderate <15%, high <30%, critical ≥30%
 */
export function classifyObsolescenceRisk(riskPct: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (riskPct < 5)  return 'low'
  if (riskPct < 15) return 'moderate'
  if (riskPct < 30) return 'high'
  return 'critical'
}

/**
 * Sum of value for slow_moving and obsolete lots.
 */
export function computeSlowMovingValue(
  lots: Array<{ aging_tier: string; total_value_try: number }>,
): number {
  return lots
    .filter(l => l.aging_tier === 'slow_moving' || l.aging_tier === 'obsolete')
    .reduce((s, l) => s + l.total_value_try, 0)
}

/**
 * Health score 0-100:
 *   Turnover  (50pts): excellent=50/good=40/acceptable=30/slow=15/critical=5/insufficient_data=25
 *   Obsolescence (30pts): low=30/moderate=20/high=10/critical=0
 *   Fresh pct (20pts): freshPct/100 × 20
 */
export function computeInventoryHealthScore(
  turnoverHealth: string,
  obsolescenceRisk: string,
  freshPct: number,
): number {
  const turnoverPts: Record<string, number> = {
    excellent: 50, good: 40, acceptable: 30, slow: 15, critical: 5, insufficient_data: 25,
  }
  const obsolescencePts: Record<string, number> = {
    low: 30, moderate: 20, high: 10, critical: 0,
  }
  const t = turnoverPts[turnoverHealth] ?? 25
  const o = obsolescencePts[obsolescenceRisk] ?? 0
  const f = (Math.min(100, Math.max(0, freshPct)) / 100) * 20
  return Math.round(t + o + f)
}

/**
 * Classify overall inventory health from score.
 * excellent ≥80, good ≥60, fair ≥40, poor ≥20, critical <20
 */
export function classifyInventoryHealth(
  score: number,
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  if (score >= 20) return 'poor'
  return 'critical'
}

/**
 * Turkish deterministic narrative based on inventory health metrics.
 */
export function generateInventoryNarrative(
  health: string,
  dio: number | null,
  obsolescencePct: number,
  slowMovingValue: number,
): string {
  const dioText = dio !== null ? `${Math.round(dio)} günlük stok devir süresi` : 'yetersiz devir verisi'
  const smText  = slowMovingValue > 0
    ? ` Yavaş hareket eden ve eskimiş stokların toplam değeri ₺${(slowMovingValue / 1000).toFixed(1)}K.`
    : ''
  const obsText = obsolescencePct > 0 ? ` Eskimiş stok riski %${obsolescencePct.toFixed(1)}.` : ''

  switch (health) {
    case 'excellent':
      return `Stok yönetimi mükemmel seviyede. ${dioText} ile stoklar hızla dönmektedir.${obsText}${smText} Mevcut performans sürdürülmelidir.`
    case 'good':
      return `Stok yönetimi iyi durumda. ${dioText} ile genel performans kabul edilebilir sınırların üzerindedir.${obsText}${smText} Küçük iyileştirmelerle mükemmel seviyeye çıkılabilir.`
    case 'fair':
      return `Stok yönetimi orta düzeyde. ${dioText} gözlemlenmiştir.${obsText}${smText} Yavaş hareket eden kalemlerin gözden geçirilmesi ve stok optimizasyonu önerilir.`
    case 'poor':
      return `Stok yönetimi zayıf. ${dioText} ile devir hızı düşük seyretmektedir.${obsText}${smText} Acil olarak stok azaltma ve tasfiye planı hazırlanmalıdır.`
    case 'critical':
      return `Stok yönetimi kritik seviyede. ${dioText} ile stoklar tehlikeli ölçüde yavaş dönmektedir.${obsText}${smText} Kapsamlı stok tasfiyesi ve tedarik zinciri revizyonu acil öncelik taşımaktadır.`
    default:
      return `Stok analizi tamamlandı. ${dioText}.${obsText}${smText}`
  }
}

/**
 * Find top aging lots sorted by days_in_stock descending.
 */
export function findTopAgingLots(
  lots: Array<StockLotInput & { days_in_stock: number; total_value_try: number; aging_tier: string }>,
  limit: number,
): Array<{ product_id: string; product_name: string; days_in_stock: number; total_value_try: number; aging_tier: string }> {
  return [...lots]
    .sort((a, b) => b.days_in_stock - a.days_in_stock)
    .slice(0, limit)
    .map(l => ({
      product_id:    l.product_id,
      product_name:  l.product_name,
      days_in_stock: l.days_in_stock,
      total_value_try: l.total_value_try,
      aging_tier:    l.aging_tier,
    }))
}

// ── Service class ─────────────────────────────────────────────────────────────

export class InventoryAgingService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<InventoryAgingReport> {
    const asOfDate = new Date().toISOString().slice(0, 10)

    // ── Fetch data in parallel ────────────────────────────────────────────────
    const [lotsResult, productsResult, cogsResult] = await Promise.allSettled([
      this.supabase
        .from('stock_lots')
        .select('id, product_id, qty_remaining, entry_cost_try, entry_date, source_type')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
        .is('deleted_at', null),

      this.supabase
        .from('products')
        .select('id, name, category')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      this._fetchCogs12Months(companyId),
    ])

    // ── Resolve results gracefully ────────────────────────────────────────────
    const rawLots: Array<{
      id: string
      product_id: string
      qty_remaining: number
      entry_cost_try: number | null
      entry_date: string
      source_type: string | null
    }> = lotsResult.status === 'fulfilled' && lotsResult.value.data
      ? (lotsResult.value.data as any[])
      : []

    const productMap = new Map<string, { name: string; category: string | null }>()
    if (productsResult.status === 'fulfilled' && productsResult.value.data) {
      for (const p of productsResult.value.data as any[]) {
        productMap.set(p.id, { name: p.name ?? 'Bilinmeyen Ürün', category: p.category ?? null })
      }
    }

    const cogsLast12 = cogsResult.status === 'fulfilled' ? cogsResult.value : 0

    // ── Enrich lots ───────────────────────────────────────────────────────────
    type EnrichedLot = StockLotInput & {
      days_in_stock: number
      total_value_try: number
      aging_tier: string
    }

    const enrichedLots: EnrichedLot[] = rawLots.map(lot => {
      const prod        = productMap.get(lot.product_id)
      const entryCost   = Number(lot.entry_cost_try ?? 0)
      const qty         = Number(lot.qty_remaining)
      const daysInStock = computeDaysInStock(lot.entry_date, asOfDate)
      const tier        = classifyAgingTier(daysInStock)
      return {
        lot_id:             lot.id,
        product_id:         lot.product_id,
        product_name:       prod?.name ?? 'Bilinmeyen Ürün',
        category:           prod?.category ?? null,
        quantity_remaining: qty,
        entry_cost_try:     entryCost,
        entry_date:         lot.entry_date,
        last_movement_date: null,
        days_in_stock:      daysInStock,
        total_value_try:    computeLotValue(qty, entryCost),
        aging_tier:         tier,
      }
    })

    // ── Aggregates ────────────────────────────────────────────────────────────
    const totalInventoryValue = enrichedLots.reduce((s, l) => s + l.total_value_try, 0)
    const totalUnits           = enrichedLots.reduce((s, l) => s + l.quantity_remaining, 0)

    // Aging buckets input
    const bucketInput = enrichedLots.map(l => ({
      days_in_stock:   l.days_in_stock,
      total_units:     l.quantity_remaining,
      total_value_try: l.total_value_try,
    }))
    const agingBuckets = buildAgingBuckets(bucketInput, totalInventoryValue)

    // Fresh percentage
    const freshBucket = agingBuckets.find(b => b.min_days === 0)
    const freshPct    = freshBucket ? freshBucket.pct_of_total_value : 0

    // Obsolete value
    const obsoleteBucket = agingBuckets.find(b => b.min_days === 366)
    const obsoleteValue  = obsoleteBucket ? obsoleteBucket.total_value_try : 0

    // Slow moving value
    const slowMovingVal = computeSlowMovingValue(
      enrichedLots.map(l => ({ aging_tier: l.aging_tier, total_value_try: l.total_value_try }))
    )

    // Turnover metrics
    const avgInventoryValue = totalInventoryValue  // single snapshot
    const turnover          = computeInventoryTurnover(cogsLast12, avgInventoryValue)
    const dio               = computeDaysInventoryOutstanding(turnover)
    const turnoverHealth    = classifyTurnoverHealth(dio)

    // Obsolescence
    const obsolescencePct   = computeObsolescenceRisk(obsoleteValue, totalInventoryValue)
    const obsolescenceLevel = classifyObsolescenceRisk(obsolescencePct)

    // Health score
    const healthScore = computeInventoryHealthScore(turnoverHealth, obsolescenceLevel, freshPct)
    const inventoryHealth = classifyInventoryHealth(healthScore)

    // Narrative
    const narrative = generateInventoryNarrative(inventoryHealth, dio, obsolescencePct, slowMovingVal)

    // Top aging lots
    const topAgingLots = findTopAgingLots(enrichedLots, 10)

    return {
      as_of_date:                  asOfDate,
      total_inventory_value_try:   totalInventoryValue,
      total_lots:                  enrichedLots.length,
      total_units:                 totalUnits,
      aging_buckets:               agingBuckets,
      inventory_turnover:          turnover,
      days_inventory_outstanding:  dio,
      turnover_health:             turnoverHealth,
      obsolescence_risk_pct:       obsolescencePct,
      obsolescence_risk_level:     obsolescenceLevel,
      slow_moving_value_try:       slowMovingVal,
      health_score:                healthScore,
      inventory_health:            inventoryHealth,
      top_aging_lots:              topAgingLots,
      narrative,
    }
  }

  /**
   * Fetch 12-month COGS from sale_item_allocations → stock_lots.
   * Falls back to sales.total_cost for legacy sales without allocations.
   */
  private async _fetchCogs12Months(companyId: string): Promise<number> {
    try {
      const cutoff = new Date()
      cutoff.setFullYear(cutoff.getFullYear() - 1)
      const cutoffStr = cutoff.toISOString()

      const { data: sales, error: sErr } = await this.supabase
        .from('sales')
        .select('id, total_cost')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', cutoffStr)

      if (sErr || !sales || sales.length === 0) return 0

      const saleIds = (sales as any[]).map((s: any) => String(s.id))

      const { data: allocs } = await this.supabase
        .from('sale_item_allocations')
        .select('sale_id, qty_allocated, stock_lots ( entry_cost_try, unit_cost, fx_rate_at_entry )')
        .in('sale_id', saleIds)

      let cogs = 0
      const salesWithAllocs = new Set<string>()

      for (const row of (allocs ?? []) as any[]) {
        const lot = Array.isArray(row.stock_lots) ? row.stock_lots[0] : row.stock_lots
        if (!lot) continue
        const perUnitTry =
          lot.entry_cost_try != null && lot.entry_cost_try !== ''
            ? Number(lot.entry_cost_try)
            : Number(lot.unit_cost) * Number(lot.fx_rate_at_entry ?? 1)
        cogs += Number(row.qty_allocated) * perUnitTry
        salesWithAllocs.add(String(row.sale_id))
      }

      // Fallback for sales without allocations
      for (const s of sales as any[]) {
        if (!salesWithAllocs.has(String(s.id))) {
          cogs += Number(s.total_cost ?? 0)
        }
      }

      return cogs
    } catch {
      return 0
    }
  }
}
