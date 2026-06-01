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
 * The cost-per-unit for a single allocation row — the canonical, correctness-
 * critical cost-source decision shared by every COGS computation:
 *   1. the denormalized allocation.cost_price_try (accounting_truth_v1 migration)
 *   2. the joined stock_lots.cost_price_try (pre-migration fallback)
 *   3. 0
 * A denormalized 0 is honored (?? coalesces only null/undefined). Accepts the
 * joined lot as an object or a single-element array (PostgREST embed shape).
 */
export function allocationUnitCost(r: CogsAllocationRow): number {
  const lot = Array.isArray(r.stock_lots) ? r.stock_lots[0] : r.stock_lots
  return Number(r.cost_price_try ?? lot?.cost_price_try ?? 0)
}

/**
 * Sum COGS (TRY) from sale_item_allocation rows. Single source of truth used by
 * getCfoMetrics + the income-statement / margin-trend / EBITDA-bridge services.
 * Unrounded, matching the YTD revenue/expense sums it is combined with.
 */
export function computeCogsFromAllocations(rows: CogsAllocationRow[]): number {
  return rows.reduce((s, r) => s + Number(r.qty_allocated ?? 0) * allocationUnitCost(r), 0)
}

/**
 * The COGS pipeline collects sales → sale_items → allocations, each step bounded
 * by a `.limit()`. When a step returns rows up to its cap, COGS is SILENTLY
 * UNDERSTATED (→ overstated profit/margin/tax). This returns a human-readable
 * warning string naming the tripped step(s), or null when nothing was truncated,
 * so callers can log it instead of failing silently. (The proper fix — DB-side
 * join aggregation so no cap is needed — is credential-gated.)
 */
export function cogsTruncationWarning(
  label: string,
  steps: Array<{ name: string; count: number; cap: number }>,
): string | null {
  const tripped = steps.filter(s => s.count >= s.cap)
  if (tripped.length === 0) return null
  return `[${label}] COGS likely UNDERSTATED — row cap hit: ` +
    tripped.map(s => `${s.name}=${s.count}≥${s.cap}`).join(', ') +
    `. Profit/margin/tax figures derived from this COGS are affected.`
}
