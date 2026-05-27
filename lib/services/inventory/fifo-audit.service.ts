// ─────────────────────────────────────────────────────────────────────────────
// lib/services/inventory/fifo-audit.service.ts
//
// FIFO Lot Integrity Audit Service
//
// Detects:
//   • over-consumed lots  — qty_allocated > qty_available
//   • orphaned lots       — purchase_item_id is null or purchase_item not found
//   • cost drift          — |drift_pct| > 20% vs latest purchase_item unit_cost_try
//
// Rules:
//   • entry_cost_try is frozen on the lot at creation (FIFO immutability rule)
//   • qty_available = stock_lots.qty_initial (total received quantity per lot)
//   • qty_allocated = SUM(sale_item_allocations.qty) per lot
//   • qty_remaining = qty_available − qty_allocated (may differ from lot's own field)
//   • is_orphaned: lot.purchase_item_id is null OR no matching purchase_items row
//   • cost_drift: compare entry_cost_try to latest purchase_item.unit_price × fx_rate
//                 for the same product. If unavailable → drift = null
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Output interfaces ─────────────────────────────────────────────────────────

export interface LotAuditEntry {
  lot_id:             string
  product_id:         string
  product_name:       string
  entry_date:         string
  qty_available:      number
  qty_allocated:      number
  qty_remaining:      number
  entry_cost_try:     number
  current_cost_try:   number      // same as entry_cost_try (FIFO is immutable) — for drift comparison use purchase_items current data
  consumed_pct:       number
  cost_drift_pct:     number | null
  health:             'clean' | 'over_consumed' | 'orphaned' | 'cost_drift'
  is_orphaned:        boolean
  purchase_item_id:   string | null
}

export interface FifoAuditSummary {
  integrity_score:          number
  grade:                    'A' | 'B' | 'C' | 'D' | 'F'
  total_lots:               number
  clean_lots:               number
  over_consumed_lots:       number
  orphaned_lots:            number
  cost_drift_lots:          number
  total_inventory_value_try: number   // Σ (qty_remaining × entry_cost_try)
  lots:                     LotAuditEntry[]
  audited_at:               string    // ISO timestamp
}

// ── Pure functions (exported for testing) ─────────────────────────────────────

/**
 * Returns true if qty_allocated > qty_available (over-consumed lot).
 */
export function isOverConsumed(qtyAvailable: number, qtyAllocated: number): boolean {
  return qtyAllocated > qtyAvailable
}

/**
 * Percentage consumed: qtyAllocated / qtyAvailable × 100, capped at 100.
 * Returns 0 when qtyAvailable is 0 (avoids divide-by-zero).
 */
export function computeConsumedPct(qtyAvailable: number, qtyAllocated: number): number {
  if (qtyAvailable <= 0) return 0
  const pct = (qtyAllocated / qtyAvailable) * 100
  return Math.min(100, pct)
}

/**
 * Cost drift: (current_cost - entry_cost) / entry_cost × 100.
 * Returns null if entry_cost is 0 (cannot divide).
 */
export function computeCostDrift(entryCostTry: number, currentCostTry: number): number | null {
  if (entryCostTry === 0) return null
  return ((currentCostTry - entryCostTry) / entryCostTry) * 100
}

/**
 * Classify lot health.
 * Priority: over_consumed > orphaned > cost_drift > clean
 *
 * orphaned:      lot has allocations but parent purchase_item is missing
 * cost_drift:    |drift_pct| > 20
 * over_consumed: qty_allocated > qty_available
 */
export function classifyLotHealth(
  overConsumed: boolean,
  isOrphaned:   boolean,
  driftPct:     number | null,
): 'clean' | 'over_consumed' | 'orphaned' | 'cost_drift' {
  if (overConsumed) return 'over_consumed'
  if (isOrphaned)   return 'orphaned'
  if (driftPct !== null && Math.abs(driftPct) > 20) return 'cost_drift'
  return 'clean'
}

/**
 * Compute FIFO integrity score 0–100.
 * Start at 100, deduct: over_consumed × 20, orphaned × 10, cost_drift × 5.
 * Clamp to [0, 100].
 */
export function computeIntegrityScore(
  totalLots:        number,
  overConsumedCount: number,
  orphanedCount:    number,
  costDriftCount:   number,
): number {
  if (totalLots === 0) return 100
  const raw = 100 - (overConsumedCount * 20) - (orphanedCount * 10) - (costDriftCount * 5)
  return Math.max(0, Math.min(100, raw))
}

/**
 * Grade: A (≥90), B (80–89), C (70–79), D (60–69), F (<60)
 */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 80) return 'B'
  if (score >= 70) return 'C'
  if (score >= 60) return 'D'
  return 'F'
}

// ── Service class ─────────────────────────────────────────────────────────────

export class FifoAuditService {
  constructor(private readonly supabase: AnyClient) {}

  async getAudit(companyId: string): Promise<FifoAuditSummary> {
    const auditedAt = new Date().toISOString()

    // ── 1. Fetch all stock lots for the company (including depleted) ──────────
    const { data: rawLots, error: lotsErr } = await this.supabase
      .from('stock_lots')
      .select('id, product_id, qty_initial, qty_remaining, cost_price, cost_currency, cost_fx_rate, cost_price_try, received_at, created_at, purchase_item_id')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('received_at', { ascending: true })

    if (lotsErr) throw new Error(`stock_lots fetch failed: ${lotsErr.message}`)

    const lots = (rawLots ?? []) as Array<{
      id:               string
      product_id:       string
      qty_initial:      number | null
      qty_remaining:    number
      cost_price:       number
      cost_currency:    string
      cost_fx_rate:     number | null
      cost_price_try:   number | null
      received_at:      string | null
      created_at:       string
      purchase_item_id: string | null
    }>

    if (lots.length === 0) {
      return {
        integrity_score:           100,
        grade:                     'A',
        total_lots:                0,
        clean_lots:                0,
        over_consumed_lots:        0,
        orphaned_lots:             0,
        cost_drift_lots:           0,
        total_inventory_value_try: 0,
        lots:                      [],
        audited_at:                auditedAt,
      }
    }

    const lotIds = lots.map(l => l.id)

    // ── 2. Fetch products for names ───────────────────────────────────────────
    const productIds = [...new Set(lots.map(l => l.product_id))]

    const { data: rawProducts } = await this.supabase
      .from('products')
      .select('id, name')
      .in('id', productIds)
      .is('deleted_at', null)

    const productNameMap = new Map<string, string>(
      ((rawProducts ?? []) as Array<{ id: string; name: string }>)
        .map(p => [p.id, p.name]),
    )

    // ── 3. Fetch allocation totals per lot ────────────────────────────────────
    // sale_item_allocations.stock_lot_id → GROUP BY → SUM(qty)
    const { data: rawAllocations } = await this.supabase
      .from('sale_item_allocations')
      .select('stock_lot_id, qty')
      .in('stock_lot_id', lotIds)

    // Aggregate qty by lot
    const allocByLot = new Map<string, number>()
    for (const row of (rawAllocations ?? []) as Array<{ stock_lot_id: string; qty: number }>) {
      const prev = allocByLot.get(row.stock_lot_id) ?? 0
      allocByLot.set(row.stock_lot_id, prev + Number(row.qty ?? 0))
    }

    // ── 4. Validate purchase_item_ids ─────────────────────────────────────────
    // Collect non-null purchase_item_ids and check they exist in purchase_items
    const purchaseItemIds = lots
      .map(l => l.purchase_item_id)
      .filter((id): id is string => id !== null && id !== undefined)

    const existingPurchaseItemIds = new Set<string>()
    if (purchaseItemIds.length > 0) {
      const { data: rawPurchaseItems } = await this.supabase
        .from('purchase_items')
        .select('id, product_id, unit_price, purchase_id')
        .in('id', purchaseItemIds)

      for (const pi of (rawPurchaseItems ?? []) as Array<{ id: string }>) {
        existingPurchaseItemIds.add(pi.id)
      }
    }

    // ── 5. Fetch latest unit_cost_try per product for drift detection ─────────
    // Use the latest finalized purchase_item for each product to get current cost
    // Join with purchases for fx_rate (to compute unit_cost in TRY)
    const { data: rawLatestCosts } = await this.supabase
      .from('purchase_items')
      .select('product_id, unit_price, purchases!inner(fx_rate, status, purchase_date)')
      .in('product_id', productIds)
      .eq('purchases.status', 'finalized')
      .order('purchases.purchase_date', { ascending: false })

    // Build latest_cost_try per product (use first = most recent due to ordering)
    const latestCostByProduct = new Map<string, number>()
    for (const row of (rawLatestCosts ?? []) as Array<{
      product_id: string
      unit_price: number
      purchases: { fx_rate: number; status: string } | Array<{ fx_rate: number; status: string }>
    }>) {
      if (!latestCostByProduct.has(row.product_id)) {
        // Supabase may return purchases as an array (from join) or single object
        const purchasesData = Array.isArray(row.purchases) ? row.purchases[0] : row.purchases
        const fxRate = Number(purchasesData?.fx_rate ?? 1)
        latestCostByProduct.set(row.product_id, Number(row.unit_price ?? 0) * fxRate)
      }
    }

    // ── 6. Build LotAuditEntry for each lot ───────────────────────────────────
    const auditEntries: LotAuditEntry[] = []

    for (const lot of lots) {
      // Resolve entry cost in TRY (frozen snapshot preferred)
      const entryCostTry =
        lot.cost_price_try != null && lot.cost_price_try > 0
          ? lot.cost_price_try
          : Number(lot.cost_price ?? 0) * (Number(lot.cost_fx_rate ?? 1) || 1)

      // qty_initial is the total received qty; fallback to qty_remaining if not set
      const qtyAvailable = Number(lot.qty_initial ?? lot.qty_remaining ?? 0)
      const qtyAllocated = allocByLot.get(lot.id) ?? 0
      const qtyRemaining = Math.max(0, qtyAvailable - qtyAllocated)

      const entryDate = (lot.received_at ?? lot.created_at).slice(0, 10)

      // Orphan check: purchase_item_id missing OR not in purchase_items table
      const purchaseItemId = lot.purchase_item_id ?? null
      const orphaned = purchaseItemId === null || !existingPurchaseItemIds.has(purchaseItemId)

      // Cost drift: compare frozen entry cost to latest purchase cost for same product
      const latestCost    = latestCostByProduct.get(lot.product_id) ?? null
      const costDriftPct  = latestCost !== null
        ? computeCostDrift(entryCostTry, latestCost)
        : null

      const overConsumed  = isOverConsumed(qtyAvailable, qtyAllocated)
      const consumedPct   = computeConsumedPct(qtyAvailable, qtyAllocated)
      const health        = classifyLotHealth(overConsumed, orphaned, costDriftPct)

      auditEntries.push({
        lot_id:           lot.id,
        product_id:       lot.product_id,
        product_name:     productNameMap.get(lot.product_id) ?? lot.product_id,
        entry_date:       entryDate,
        qty_available:    qtyAvailable,
        qty_allocated:    qtyAllocated,
        qty_remaining:    qtyRemaining,
        entry_cost_try:   entryCostTry,
        current_cost_try: entryCostTry,   // FIFO: immutable; current comparison via latestCost above
        consumed_pct:     consumedPct,
        cost_drift_pct:   costDriftPct,
        health,
        is_orphaned:      orphaned,
        purchase_item_id: purchaseItemId,
      })
    }

    // ── 7. Compute summary stats ──────────────────────────────────────────────
    const overConsumedLots = auditEntries.filter(e => e.health === 'over_consumed').length
    const orphanedLots     = auditEntries.filter(e => e.health === 'orphaned').length
    const costDriftLots    = auditEntries.filter(e => e.health === 'cost_drift').length
    const cleanLots        = auditEntries.filter(e => e.health === 'clean').length

    const integrityScore = computeIntegrityScore(
      auditEntries.length,
      overConsumedLots,
      orphanedLots,
      costDriftLots,
    )
    const grade = scoreToGrade(integrityScore)

    // Total inventory value = Σ (qty_remaining × entry_cost_try)
    const totalInventoryValueTry = auditEntries.reduce(
      (sum, e) => sum + e.qty_remaining * e.entry_cost_try,
      0,
    )

    // ── 8. Sort: over_consumed first, orphaned, cost_drift, then clean ────────
    const HEALTH_ORDER: Record<string, number> = {
      over_consumed: 0,
      orphaned:      1,
      cost_drift:    2,
      clean:         3,
    }
    auditEntries.sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health])

    return {
      integrity_score:           integrityScore,
      grade,
      total_lots:                auditEntries.length,
      clean_lots:                cleanLots,
      over_consumed_lots:        overConsumedLots,
      orphaned_lots:             orphanedLots,
      cost_drift_lots:           costDriftLots,
      total_inventory_value_try: totalInventoryValueTry,
      lots:                      auditEntries,
      audited_at:                auditedAt,
    }
  }
}
