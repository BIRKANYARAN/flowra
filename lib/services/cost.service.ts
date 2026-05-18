// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3 — Cost Engine
//
// Pure allocation math + read-side cost-history queries. NO writes to
// stock_lots / stock_movements happen here — finalization is owned by
// PurchaseService, which uses StockService.adjust() so the FIFO ledger keeps
// a single insertion path.
//
// Single source of truth for: "given a finalized purchase, what is the true
// per-unit landed cost (in TRY) of every line?"
//
// Inputs:
//   • purchases.fx_rate           — purchase-day FX snapshot, frozen
//   • purchase_items.unit_price   — in purchase.currency
//   • purchase_items.quantity     — qty bought
//   • purchase_costs.amount_try   — overhead in TRY (already converted)
//   • purchase_costs.allocation_method — by_quantity | by_value
//
// Outputs:
//   • final_unit_cost_try per line  → goes into stock_lots.unit_cost
//   • allocated_cost_try per line   → goes into stock_lots.allocated_cost_try
//
// Rounding strategy:
//   We do all interim math at full float precision and round ONLY the final
//   per-line numbers (4dp matches stock_lots.unit_cost / amount_try precision).
//   The last line absorbs the rounding residual so Σ allocated_cost_try
//   exactly equals Σ purchase_costs.amount_try — financial reconciliation
//   must be penny-perfect.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { AppError } from '@/types/errors'
import type {
  CostAllocationMethod,
  Purchase,
  PurchaseAllocationResult,
  PurchaseCost,
  PurchaseItem,
  PurchaseLineAllocation,
  ProductCostBreakdownEntry,
} from '@/types'

// ── Rounding helpers ─────────────────────────────────────────────────────────
// Round to 4dp matches the numeric(14,4) used across stock/cost columns.
function round4(v: number): number {
  return Math.round((v + Number.EPSILON) * 10000) / 10000
}

// ── Pure allocation math (DB-free; tested in isolation) ─────────────────────

export interface AllocInputLine {
  /** Stable identity used in the result. */
  id:          string
  product_id:  string
  quantity:    number
  /** Unit price IN PURCHASE CURRENCY (not TRY). */
  unit_price:  number
}

export interface AllocInputCost {
  /** Already converted to TRY at cost.fx_rate. Must be ≥ 0. */
  amount_try:        number
  allocation_method: CostAllocationMethod
}

/**
 * Pure allocation kernel — no DB. Given lines + their purchase fx_rate plus
 * a list of overhead costs, compute per-line landed cost in TRY.
 *
 * Strategy:
 *   1. Compute base_total_try per line: qty × unit_price × purchase_fx_rate.
 *   2. For each cost, allocate into a per-line accumulator using its method:
 *      • by_quantity → weight_i = qty_i / Σ qty
 *      • by_value    → weight_i = base_total_try_i / Σ base_total_try
 *      Edge case: if Σ qty (or Σ value) is zero, fall back to equal split.
 *   3. Round per-line to 4dp; push the residual onto the last line so the
 *      sum is penny-exact against Σ amount_try.
 */
export function allocate(
  purchaseFxRate: number,
  lines:          AllocInputLine[],
  costs:          AllocInputCost[],
): {
  total_base_try:     number
  total_overhead_try: number
  per_line_alloc_try: number[]   // index-aligned with `lines`
  per_line_base_try:  number[]   // index-aligned with `lines`
} {
  if (lines.length === 0) {
    throw new AppError('PURCHASE_NO_LINES', 'Satın alma satırı yok')
  }
  if (!isFinite(purchaseFxRate) || purchaseFxRate <= 0) {
    throw new AppError('PURCHASE_ALLOC_FAILED', 'Geçersiz fx_rate')
  }

  const n = lines.length
  const baseTryPerLine = lines.map(l => l.quantity * l.unit_price * purchaseFxRate)
  const totalBaseTry   = baseTryPerLine.reduce((a, b) => a + b, 0)
  const totalQty       = lines.reduce((a, b) => a + b.quantity, 0)

  // Per-line accumulator at full precision (rounded only at the end).
  const allocAcc = new Array<number>(n).fill(0)

  for (const cost of costs) {
    if (!isFinite(cost.amount_try) || cost.amount_try < 0) {
      throw new AppError('PURCHASE_ALLOC_FAILED', 'Geçersiz maliyet tutarı')
    }
    if (cost.amount_try === 0) continue

    if (cost.allocation_method === 'by_quantity') {
      // Equal split per qty unit. If Σ qty = 0 (impossible given CHECK qty>0
      // but we keep the guard for the pure kernel), fall back to equal split.
      if (totalQty > 0) {
        for (let i = 0; i < n; i++) {
          allocAcc[i] += cost.amount_try * (lines[i].quantity / totalQty)
        }
      } else {
        for (let i = 0; i < n; i++) allocAcc[i] += cost.amount_try / n
      }
    } else {
      // by_value — weight by line value in TRY. Falls back to equal split when
      // every line has zero value (e.g. free goods); this preserves Σ alloc.
      if (totalBaseTry > 0) {
        for (let i = 0; i < n; i++) {
          allocAcc[i] += cost.amount_try * (baseTryPerLine[i] / totalBaseTry)
        }
      } else {
        for (let i = 0; i < n; i++) allocAcc[i] += cost.amount_try / n
      }
    }
  }

  // Round per-line to 4dp; the LAST line carries the residual so Σ matches
  // Σ amount_try exactly. This is the reconciliation invariant.
  const totalOverheadTry = costs.reduce((a, c) => a + (c.amount_try > 0 ? c.amount_try : 0), 0)
  const rounded: number[] = new Array(n)
  let runningSum = 0
  for (let i = 0; i < n - 1; i++) {
    rounded[i]  = round4(allocAcc[i])
    runningSum += rounded[i]
  }
  rounded[n - 1] = round4(totalOverheadTry - runningSum)

  return {
    total_base_try:     round4(totalBaseTry),
    total_overhead_try: round4(totalOverheadTry),
    per_line_alloc_try: rounded,
    per_line_base_try:  baseTryPerLine.map(round4),
  }
}

/**
 * Build the full allocation result for a draft purchase WITHOUT writing
 * anything. Used by:
 *   • the UI cost-preview card on the purchase form
 *   • PurchaseService.finalize() — to determine lot.unit_cost values
 *   • allocateCosts() public API — same data path, different framing
 *
 * Reads via the request-scoped Supabase client so RLS is enforced.
 * Pass `clientOverride` when calling from a Bearer-token context (API routes
 * that use resolveApiAuth) so the same authenticated client is reused — the
 * default createClient() uses cookies and will be unauthenticated in those paths.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function calculateUnitCost(purchaseId: string, clientOverride?: any): Promise<PurchaseAllocationResult> {
  const supabase = clientOverride ?? createClient()

  const { data: purchase, error: pErr } = await supabase
    .from('purchases')
    .select('id, currency, fx_rate, status')
    .eq('id', purchaseId)
    .is('deleted_at', null)
    .maybeSingle()

  if (pErr || !purchase) {
    throw new AppError('PURCHASE_NOT_FOUND', 'Satın alma bulunamadı', { id: purchaseId, dbError: pErr?.message })
  }

  const [{ data: rawItems, error: iErr }, { data: rawCosts, error: cErr }] = await Promise.all([
    supabase
      .from('purchase_items')
      .select('id, product_id, quantity, unit_price, sort_order')
      .eq('purchase_id', purchaseId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('purchase_costs')
      .select('id, amount_try, allocation_method')
      .eq('purchase_id', purchaseId),
  ])

  if (iErr) throw new AppError('DB_READ_FAILED', 'Satırlar okunamadı', { dbError: iErr.message })
  if (cErr) throw new AppError('DB_READ_FAILED', 'Maliyetler okunamadı', { dbError: cErr.message })

  const items = (rawItems ?? []) as Array<Pick<PurchaseItem, 'id' | 'product_id' | 'quantity' | 'unit_price' | 'sort_order'>>
  const costs = (rawCosts ?? []) as Array<Pick<PurchaseCost, 'amount_try' | 'allocation_method'>>

  if (items.length === 0) {
    throw new AppError('PURCHASE_NO_LINES', 'Satın almada satır yok', { id: purchaseId })
  }

  const fxRate = Number(purchase.fx_rate)
  const alloc = allocate(
    fxRate,
    items.map(it => ({
      id:         it.id,
      product_id: it.product_id,
      quantity:   Number(it.quantity),
      unit_price: Number(it.unit_price),
    })),
    costs.map(c => ({
      amount_try:        Number(c.amount_try),
      allocation_method: c.allocation_method as CostAllocationMethod,
    })),
  )

  const lines: PurchaseLineAllocation[] = items.map((it, i) => {
    const qty            = Number(it.quantity)
    const baseUnit       = Number(it.unit_price)
    const baseTotalTry   = alloc.per_line_base_try[i]
    const allocatedTry   = alloc.per_line_alloc_try[i]
    const finalTotalTry  = round4(baseTotalTry + allocatedTry)
    // Guard qty>0 already enforced by CHECK; defensive against future kernel
    // changes that might allow a zero-qty preview.
    const finalUnitTry   = qty > 0 ? round4(finalTotalTry / qty) : 0
    return {
      purchase_item_id:    it.id,
      product_id:          it.product_id,
      quantity:            qty,
      base_unit_price:     baseUnit,
      base_total_try:      baseTotalTry,
      allocated_cost_try:  allocatedTry,
      final_total_try:     finalTotalTry,
      final_unit_cost_try: finalUnitTry,
    }
  })

  return {
    purchase_id:        purchaseId,
    currency:           String(purchase.currency),
    purchase_fx_rate:   fxRate,
    total_base_try:     alloc.total_base_try,
    total_overhead_try: alloc.total_overhead_try,
    grand_total_try:    round4(alloc.total_base_try + alloc.total_overhead_try),
    lines,
  }
}

/**
 * Public API alias — same computation as calculateUnitCost(). Named for the
 * caller-intent ("allocate the costs of this purchase") rather than the
 * computed quantity. Kept as a separate symbol so the call sites read well.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function allocateCosts(purchaseId: string, clientOverride?: any): Promise<PurchaseAllocationResult> {
  return calculateUnitCost(purchaseId, clientOverride)
}

/**
 * Cost-history breakdown for a single product.
 *
 * Source: stock_lots filtered to those with a `purchase_item_id` (i.e.
 * created via the Phase 3 finalization path). Lots created through the
 * legacy direct-adjust path show up under getStockHistory() but not here —
 * that's by design: this view answers "where did the cost come from?",
 * which only has an answer when there's a purchase header.
 *
 * The numbers are the FROZEN snapshot stored at finalization. We never
 * recompute against current fx_rates; that would silently rewrite history.
 */
export async function getCostBreakdown(productId: string, companyId?: string): Promise<ProductCostBreakdownEntry[]> {
  const supabase = createClient()

  // Fetch lots created via Phase 3. We pull purchase fields via a join so a
  // single round-trip suffices.
  // companyId filter provides defense-in-depth alongside Supabase RLS.
  let query = supabase
    .from('stock_lots')
    .select(`
      qty_initial,
      unit_cost,
      allocated_cost_try,
      entry_cost_try,
      fx_rate_at_entry,
      purchase_item_id,
      purchase_items!inner (
        id,
        purchase_id,
        unit_price,
        purchases!inner (
          purchase_date,
          supplier_name,
          currency,
          fx_rate
        )
      )
    `)
    .eq('product_id', productId)
    .not('purchase_item_id', 'is', null)
    .is('deleted_at', null)
    .order('entry_date', { ascending: false })

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data: rows, error } = await query

  if (error) {
    throw new AppError('DB_READ_FAILED', 'Maliyet geçmişi okunamadı', { dbError: error.message })
  }

  type Row = {
    qty_initial:         number | string
    unit_cost:           number | string
    allocated_cost_try:  number | string | null
    entry_cost_try:      number | string | null
    fx_rate_at_entry:    number | string | null
    purchase_item_id:    string
    // Supabase typed-builder collapses nested embeds; we treat as unknown then narrow.
    purchase_items: {
      id:           string
      purchase_id:  string
      unit_price:   number | string
      purchases: {
        purchase_date: string
        supplier_name: string
        currency:      string
        fx_rate:       number | string
      } | { purchase_date: string; supplier_name: string; currency: string; fx_rate: number | string }[]
    }
  }

  const out: ProductCostBreakdownEntry[] = []
  for (const r of (rows ?? []) as unknown as Row[]) {
    const itemId    = r.purchase_items.id
    const purchases = Array.isArray(r.purchase_items.purchases)
      ? r.purchase_items.purchases[0]
      : r.purchase_items.purchases
    if (!purchases) continue

    const baseUnitPrice  = Number(r.purchase_items.unit_price)
    const baseFx         = Number(purchases.fx_rate)
    const baseUnitCostTry = round4(baseUnitPrice * baseFx)
    const qty            = Number(r.qty_initial)
    // allocated_cost_try is the per-LINE total. Per-unit allocated portion =
    // (final unit cost − base unit cost in TRY). We expose both forms in the
    // breakdown so the UI can show "₺X base + ₺Y landed = ₺Z final per unit".
    const finalUnitTry   = Number(
      r.entry_cost_try ?? Number(r.unit_cost) * Number(r.fx_rate_at_entry ?? 1)
    )
    const allocatedTotal = r.allocated_cost_try == null ? 0 : Number(r.allocated_cost_try)

    out.push({
      purchase_id:         purchases ? (r.purchase_items.purchase_id) : '',
      purchase_item_id:    itemId,
      purchase_date:       purchases.purchase_date,
      supplier_name:       purchases.supplier_name ?? '',
      quantity:            qty,
      base_unit_price:     baseUnitPrice,
      base_currency:       purchases.currency,
      base_unit_cost_try:  baseUnitCostTry,
      allocated_cost_try:  round4(allocatedTotal),
      final_unit_cost_try: round4(finalUnitTry),
    })
  }
  return out
}

/**
 * Public namespace — keeps imports tidy and discoverable.
 */
export const CostService = {
  allocate,            // pure kernel (no DB)
  calculateUnitCost,
  allocateCosts,
  getCostBreakdown,
} as const

// Convenience re-exports for tests that want pure-math access.
export { round4 as _round4 }
export type { Purchase, PurchaseItem, PurchaseCost }
