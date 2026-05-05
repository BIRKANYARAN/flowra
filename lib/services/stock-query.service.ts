// ═══════════════════════════════════════════════════════════════════════════════
// Stock Query Service — movement-derived READ side (Phase 2 / 2.5 hardened)
//
// Purpose:
//   Compute current stock, history, and valuation from `stock_movements` —
//   WITHOUT relying on `products.stock_qty`. This is the read side of the
//   movement-based stock engine.
//
// Contract with the rest of the system:
//   • Read-only. Never writes. Never mutates state.
//   • Never throws for empty data — returns deterministic "zero" results.
//   • Never reads from `product.stock_qty` except in `checkConsistency`,
//     which compares the two sources deliberately.
//   • Every query is scoped to `.eq('company_id', companyId)` (Phase 4.3.1).
//
// HARDENING RULES (Phase 2.5):
//   1. qty_change is the ONLY source of truth for direction.
//      movement_type is metadata/filter; it is NEVER multiplied or re-applied
//      into arithmetic. Direction = sign(qty_change). Period.
//
//        qty       ≡ Σ qty_change
//        total_in  ≡ Σ qty_change   where qty_change > 0
//        total_out ≡ Σ -qty_change  where qty_change < 0
//
//   2. Valuation prefers `stock_lots` (lot-based, currency-aware) and falls
//      back to movements only when no active lots exist for the product.
//
//   3. Any row where movement_type disagrees with sign(qty_change) is logged
//      as an anomaly (soft guardrail — does not change results).
//
// What this service does NOT touch:
//   • stock_lots writes         — FIFO write path stays in StockService
//   • sale_item_allocations     — sale-conversion flow
//   • product.stock_qty writes  — legacy write path owns this column
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@/lib/supabase-server'
import { logger, type RequestContext } from '@/lib/logger'
import { AppError } from '@/types/errors'
import { round2 } from '@/lib/calc'
import { deriveMovementType } from '@/lib/services/stock.service'
import type {
  StockSnapshot,
  StockHistoryEntry,
  StockValuation,
  StockConsistencyReport,
  MovementType,
  ReferenceType,
} from '@/types'

// ── Constants ────────────────────────────────────────────────────────────────

/** Consistency tolerance — below this, drift is considered floating-point noise. */
const CONSISTENCY_EPSILON = 0.0001

/** Max history rows per call — prevents unbounded responses. */
const DEFAULT_HISTORY_LIMIT = 100
const MAX_HISTORY_LIMIT     = 500

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Display-time direction for a row — used for history/UI only.
 * Aggregations MUST NOT use this; they use qty_change sign directly.
 *
 * Legacy rows may still have movement_type = null until the backfill runs —
 * in that case we fall back to sign(qty_change) for rendering.
 */
function displayDirection(row: {
  movement_type: string | null
  qty_change:    number
}): MovementType {
  const mt = row.movement_type
  if (mt === 'in' || mt === 'out' || mt === 'adjustment') return mt
  return deriveMovementType(row.qty_change)
}

/**
 * Detect a row whose stored movement_type disagrees with the sign of
 * qty_change. Returns a short reason, or null if the row is consistent.
 * Used as a soft guardrail — we log these but still return results.
 */
function findRowAnomaly(row: {
  movement_type: string | null
  qty_change:    number
}): string | null {
  const mt  = row.movement_type
  const qty = row.qty_change
  if (mt === 'in'  && !(qty > 0)) return `movement_type=in but qty_change=${qty}`
  if (mt === 'out' && !(qty < 0)) return `movement_type=out but qty_change=${qty}`
  if ((mt === 'in' || mt === 'out') && qty === 0) return `movement_type=${mt} with qty_change=0`
  return null
}

/** Shape of a row returned by the stock_movements select used below. */
type MovementRow = {
  id:             string
  product_id:     string
  reference_type: string
  movement_type:  string | null
  reference_id:   string | null
  qty_change:     number | string   // numeric columns can come back as strings
  qty_before:     number | string
  qty_after:      number | string
  unit_cost:      number | string
  notes:          string | null
  entry_date:     string | null
  created_at:     string
}

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

// ── Service ──────────────────────────────────────────────────────────────────

export class StockQueryService {

  /**
   * Current stock for one product, computed from movements.
   *
   * HARDENING: direction comes from sign(qty_change) alone.
   *   qty        = Σ qty_change
   *   total_in   = Σ qty_change   where qty_change > 0
   *   total_out  = Σ -qty_change  where qty_change < 0
   *
   * movement_type is NOT used in arithmetic — only in the anomaly log.
   */
  static async getCurrentStock(
    userId:    string,
    companyId: string,
    productId: string,
    ctx?:      RequestContext
  ): Promise<StockSnapshot> {
    if (!userId || !productId) {
      throw new AppError('INVALID_INPUT', 'userId ve productId zorunludur')
    }

    const supabase = createClient()
    const { data, error } = await supabase
      .from('stock_movements')
      .select('qty_change, movement_type, created_at')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .order('created_at', { ascending: true })

    if (error) {
      if (ctx) await logger.error(ctx, 'stock_query:current_stock_error', { error: error.message })
      throw new AppError('DB_QUERY_FAILED', 'Stok sorgulanamadı', { dbError: error.message })
    }

    const rows = (data ?? []) as Array<Pick<MovementRow, 'qty_change' | 'movement_type' | 'created_at'>>
    let qty = 0, totalIn = 0, totalOut = 0
    let lastAt: string | null = null
    let anomalyCount = 0

    for (const r of rows) {
      const delta = num(r.qty_change)

      // ── The ONLY arithmetic rule ────────────────────────────────────────
      qty += delta
      if (delta > 0) totalIn  += delta
      if (delta < 0) totalOut += -delta

      lastAt = r.created_at

      // Soft guardrail — count (don't alter results)
      if (findRowAnomaly({ movement_type: r.movement_type, qty_change: delta })) {
        anomalyCount += 1
      }
    }

    if (anomalyCount > 0 && ctx) {
      await logger.warn(ctx, 'stock_query:movement_type_anomalies', {
        product_id: productId,
        count:      anomalyCount,
        note:       'rows where movement_type disagrees with sign(qty_change) — arithmetic unaffected',
      })
    }

    return {
      product_id:       productId,
      qty:              round2(qty),
      total_in:         round2(totalIn),
      total_out:        round2(totalOut),
      movement_count:   rows.length,
      last_movement_at: lastAt,
    }
  }

  /**
   * Movement history for a product — newest first, paginated.
   *
   * Returned rows include `movement_type`, `quantity` (= qty_change), and
   * `source_id` (= reference_id) so the UI can render a timeline without
   * having to know legacy field names.
   */
  static async getStockHistory(
    userId:    string,
    companyId: string,
    productId: string,
    opts:      { limit?: number; offset?: number } = {},
    ctx?:      RequestContext
  ): Promise<StockHistoryEntry[]> {
    if (!userId || !productId) {
      throw new AppError('INVALID_INPUT', 'userId ve productId zorunludur')
    }

    const limit  = Math.min(Math.max(1, opts.limit  ?? DEFAULT_HISTORY_LIMIT), MAX_HISTORY_LIMIT)
    const offset = Math.max(0, opts.offset ?? 0)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('stock_movements')
      .select(
        'id, product_id, reference_type, movement_type, reference_id, ' +
        'qty_change, qty_before, qty_after, unit_cost, notes, entry_date, created_at'
      )
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      if (ctx) await logger.error(ctx, 'stock_query:history_error', { error: error.message })
      throw new AppError('DB_QUERY_FAILED', 'Stok geçmişi sorgulanamadı', { dbError: error.message })
    }

    const rows = (data ?? []) as unknown as MovementRow[]
    return rows.map((r): StockHistoryEntry => {
      const qtyChange = num(r.qty_change)
      return {
        id:             r.id,
        product_id:     r.product_id,
        // History is a UI concern — display-direction is metadata.
        // The source of truth for stock math remains `quantity` (qty_change).
        movement_type:  displayDirection({ movement_type: r.movement_type, qty_change: qtyChange }),
        reference_type: r.reference_type as ReferenceType,
        source_id:      r.reference_id,
        quantity:       qtyChange,
        qty_before:     num(r.qty_before),
        qty_after:      num(r.qty_after),
        unit_cost:      num(r.unit_cost),
        notes:          r.notes,
        entry_date:     r.entry_date,
        created_at:     r.created_at,
      }
    })
  }

  /**
   * Stock valuation — prefers `stock_lots` (currency-aware, lot-exact),
   * falls back to movement-weighted-average if no active lots exist.
   *
   * Order of precedence (HARDENING rule 2):
   *   1. Lot-based   — Σ(qty_remaining × unit_cost) over active lots.
   *                    Uses `entry_cost_try` when available so the total is
   *                    in TRY regardless of the lot's original currency.
   *   2. Movement WAC — Σ(qty_in × unit_cost) / Σ(qty_in), using sign(qty_change)
   *                    to classify incoming rows. No reliance on movement_type.
   *                    Rows with unit_cost = 0 or negative are excluded from
   *                    the basis (they contribute no cost information).
   *
   * Why prefer lots?
   *   • Lots carry the original currency + frozen FX → cross-currency safe.
   *   • Lots track consumption (qty_remaining), so valuation reflects actual
   *     on-hand stock, not cumulative purchases.
   *   • Movements are the ledger, not the inventory state.
   *
   * The return type carries `method` so the caller (and ops dashboards) can
   * see which path ran. If you need both in one call, run both methods and
   * compare — that's exactly what `checkConsistency` does for qty.
   */
  static async calculateStockValue(
    userId:    string,
    companyId: string,
    productId: string,
    ctx?:      RequestContext
  ): Promise<StockValuation> {
    if (!userId || !productId) {
      throw new AppError('INVALID_INPUT', 'userId ve productId zorunludur')
    }

    const supabase = createClient()

    // ── Path 1: lot-based valuation (preferred) ─────────────────────────────
    const { data: lots, error: lotErr } = await supabase
      .from('stock_lots')
      .select('qty_remaining, unit_cost, cost_currency, fx_rate_at_entry, entry_cost_try')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .gt('qty_remaining', 0)
      .is('deleted_at', null)

    if (lotErr) {
      if (ctx) await logger.error(ctx, 'stock_query:value_lot_error', { error: lotErr.message })
      // Don't fail — fall through to movement-based WAC.
    }

    if (lots && lots.length > 0) {
      let qtyOnHand = 0
      let totalValueTry = 0
      const currencies = new Set<string>()

      for (const lot of lots) {
        const qtyRem  = num((lot as { qty_remaining: number | string }).qty_remaining)
        const cost    = num((lot as { unit_cost:     number | string }).unit_cost)
        const fx      = num((lot as { fx_rate_at_entry: number | string }).fx_rate_at_entry) || 1
        const entryTry = num((lot as { entry_cost_try: number | string | null }).entry_cost_try)
        const cur     = String((lot as { cost_currency: string | null }).cost_currency || 'TRY')

        if (qtyRem <= 0) continue
        qtyOnHand += qtyRem
        currencies.add(cur)

        // Prefer the frozen per-unit TRY snapshot; fall back to unit_cost × FX
        // for lots created before that column existed.
        const perUnitTry = entryTry > 0 ? entryTry : round2(cost * fx)
        totalValueTry += qtyRem * perUnitTry
      }

      if (qtyOnHand > 0) {
        const wac = totalValueTry / qtyOnHand
        return {
          product_id:         productId,
          qty_on_hand:        round2(qtyOnHand),
          weighted_unit_cost: round2(wac),
          total_value:        round2(totalValueTry),
          method:             'lot_based',
          currency_note:      currencies.size > 1
            ? `lot_try_mixed(${Array.from(currencies).sort().join(',')})`
            : 'lot_try',
        }
      }
    }

    // ── Path 2: movement-based weighted average (fallback) ─────────────────
    const { data, error } = await supabase
      .from('stock_movements')
      .select('qty_change, unit_cost, movement_type')
      .eq('company_id', companyId)
      .eq('product_id', productId)

    if (error) {
      if (ctx) await logger.error(ctx, 'stock_query:value_error', { error: error.message })
      throw new AppError('DB_QUERY_FAILED', 'Stok değeri hesaplanamadı', { dbError: error.message })
    }

    const rows = (data ?? []) as Array<Pick<MovementRow, 'qty_change' | 'unit_cost' | 'movement_type'>>

    let qtyOnHand    = 0
    let weightedQty  = 0   // Σ qty_in for cost-bearing rows
    let weightedCost = 0   // Σ qty_in × unit_cost
    let anomalyCount = 0

    for (const r of rows) {
      const delta = num(r.qty_change)
      const cost  = num(r.unit_cost)

      qtyOnHand += delta

      // HARDENING: direction comes from sign(qty_change) ONLY.
      // Anything with a positive delta and a real unit_cost is a cost-bearing
      // incoming row, regardless of reference_type or movement_type.
      if (delta > 0 && cost > 0) {
        weightedQty  += delta
        weightedCost += delta * cost
      }

      if (findRowAnomaly({ movement_type: r.movement_type, qty_change: delta })) {
        anomalyCount += 1
      }
    }

    if (anomalyCount > 0 && ctx) {
      await logger.warn(ctx, 'stock_query:value_type_anomalies', {
        product_id: productId, count: anomalyCount,
      })
    }

    if (qtyOnHand <= 0 || weightedQty <= 0) {
      return {
        product_id:         productId,
        qty_on_hand:        round2(qtyOnHand),
        weighted_unit_cost: 0,
        total_value:        0,
        method:             'no_stock',
        currency_note:      'n/a',
      }
    }

    const wac = weightedCost / weightedQty
    return {
      product_id:         productId,
      qty_on_hand:        round2(qtyOnHand),
      weighted_unit_cost: round2(wac),
      total_value:        round2(qtyOnHand * wac),
      method:             'weighted_average',
      // Movements don't carry currency at this layer — if the product has
      // mixed-currency stock-ins, this number is in mixed units. Prefer
      // the lot path (above) for cross-currency correctness.
      currency_note:      'movement_unit_cost',
    }
  }

  /**
   * Compare movement-derived stock to legacy `product.stock_qty`.
   *
   * Used by:
   *   • admin / ops to detect drift
   *   • background health-check cron
   *   • UI toggle to warn users before the migration is completed
   *
   * A non-zero drift is usually one of:
   *   • Pre-ledger seed rows that wrote stock_qty without a movement.
   *   • Direct SQL updates that bypassed StockService.
   *   • Historic bug that wrote a movement but skipped the product update
   *     (or vice-versa).
   */
  static async checkConsistency(
    userId:    string,
    companyId: string,
    productId: string,
    ctx?:      RequestContext
  ): Promise<StockConsistencyReport> {
    if (!userId || !productId) {
      throw new AppError('INVALID_INPUT', 'userId ve productId zorunludur')
    }

    const supabase = createClient()

    const [mvRes, prodRes] = await Promise.all([
      supabase
        .from('stock_movements')
        .select('qty_change')
        .eq('company_id', companyId)
        .eq('product_id', productId),
      supabase
        .from('products')
        .select('stock_qty')
        .eq('id',         productId)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle(),
    ])

    if (mvRes.error) {
      if (ctx) await logger.error(ctx, 'stock_query:consistency_mv_error', { error: mvRes.error.message })
      throw new AppError('DB_QUERY_FAILED', 'Tutarlılık kontrolü başarısız', { dbError: mvRes.error.message })
    }
    if (prodRes.error) {
      if (ctx) await logger.error(ctx, 'stock_query:consistency_prod_error', { error: prodRes.error.message })
      throw new AppError('DB_QUERY_FAILED', 'Ürün okunamadı', { dbError: prodRes.error.message })
    }

    const computed = round2(
      (mvRes.data ?? []).reduce((s, r) => s + num((r as { qty_change: number | string }).qty_change), 0)
    )
    const legacy = round2(num(prodRes.data?.stock_qty))
    const drift  = round2(computed - legacy)
    const ok     = Math.abs(drift) < CONSISTENCY_EPSILON

    return {
      product_id:    productId,
      computed_qty:  computed,
      legacy_qty:    legacy,
      drift,
      is_consistent: ok,
      warning: ok ? null :
        `Stok tutarsızlığı: hareket toplamı (${computed}) ile ürün tablosu (${legacy}) arasında ${drift} fark var.`,
    }
  }

  /**
   * Bulk version of checkConsistency — scans all active products for the user
   * and returns only the ones with drift. Keep batch size sane; RLS + index
   * on (user_id, product_id) keep this O(N rows) for one user.
   */
  static async listInconsistentProducts(
    userId:    string,
    companyId: string,
    ctx?:      RequestContext
  ): Promise<StockConsistencyReport[]> {
    if (!userId) throw new AppError('INVALID_INPUT', 'userId zorunludur')

    const supabase = createClient()
    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select('id, stock_qty')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (prodErr) {
      if (ctx) await logger.error(ctx, 'stock_query:list_inconsistent_error', { error: prodErr.message })
      throw new AppError('DB_QUERY_FAILED', 'Ürünler okunamadı', { dbError: prodErr.message })
    }

    const { data: movements, error: mvErr } = await supabase
      .from('stock_movements')
      .select('product_id, qty_change')
      .eq('company_id', companyId)

    if (mvErr) {
      if (ctx) await logger.error(ctx, 'stock_query:list_inconsistent_mv_error', { error: mvErr.message })
      throw new AppError('DB_QUERY_FAILED', 'Hareketler okunamadı', { dbError: mvErr.message })
    }

    // Aggregate qty_change per product in JS (one pass, no N+1).
    const sumByProduct = new Map<string, number>()
    for (const m of (movements ?? [])) {
      const row = m as { product_id: string; qty_change: number | string }
      sumByProduct.set(row.product_id, (sumByProduct.get(row.product_id) ?? 0) + num(row.qty_change))
    }

    const reports: StockConsistencyReport[] = []
    for (const p of (products ?? [])) {
      const row = p as { id: string; stock_qty: number | string }
      const computed = round2(sumByProduct.get(row.id) ?? 0)
      const legacy   = round2(num(row.stock_qty))
      const drift    = round2(computed - legacy)
      if (Math.abs(drift) >= CONSISTENCY_EPSILON) {
        reports.push({
          product_id:    row.id,
          computed_qty:  computed,
          legacy_qty:    legacy,
          drift,
          is_consistent: false,
          warning:
            `Stok tutarsızlığı: hareket toplamı (${computed}) ile ürün tablosu (${legacy}) arasında ${drift} fark var.`,
        })
      }
    }
    return reports
  }
}
