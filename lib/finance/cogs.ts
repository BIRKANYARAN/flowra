// ─────────────────────────────────────────────────────────────────────────────
// lib/finance/cogs.ts
//
// Single source of truth for COGS aggregation from sale_item_allocation rows.
// Pure, ZERO imports — safe to import from both server services and any module
// reachable from a client bundle (kept out of cfo-metrics.ts, which is
// server-tainted via tax.service → supabase-server).
// ─────────────────────────────────────────────────────────────────────────────

/** The joined stock lot — PostgREST may surface a to-one embed as an object OR a
 *  single-element array depending on the generated types, so accept both. */
type EmbeddedLot = { cost_price_try?: number | null }

/** A sale_item_allocation row as fetched for COGS (with optional joined lot). */
export interface CogsAllocationRow {
  qty_allocated?:  number | null
  cost_price_try?: number | null
  stock_lots?:     EmbeddedLot | EmbeddedLot[] | null
}

/**
 * Sum COGS (TRY) from sale_item_allocation rows. Single source of truth used by
 * getCfoMetrics + the income-statement / margin-trend / EBITDA-bridge services.
 *
 * Cost-per-unit precedence:
 *   1. the denormalized allocation.cost_price_try (accounting_truth_v1 migration)
 *   2. the joined stock_lots.cost_price_try (pre-migration fallback)
 *   3. 0
 * Unrounded, matching the YTD revenue/expense sums it is combined with.
 */
export function computeCogsFromAllocations(rows: CogsAllocationRow[]): number {
  return rows.reduce((s, r) => {
    const lot = Array.isArray(r.stock_lots) ? r.stock_lots[0] : r.stock_lots
    const costPerUnit = Number(r.cost_price_try ?? lot?.cost_price_try ?? 0)
    return s + Number(r.qty_allocated ?? 0) * costPerUnit
  }, 0)
}
