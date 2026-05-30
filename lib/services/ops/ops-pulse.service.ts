// ── lib/services/ops/ops-pulse.service.ts ─────────────────────────────────────
//
// OPS Daily Pulse — computes and classifies the operations health signal.
// All functions are pure; no I/O performed here.

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpsPulseMetrics {
  today_sales_count:    number
  today_sales_try:      number
  overdue_collections:  number   // count of overdue invoices
  overdue_try:          number   // total TRY amount overdue
  critical_stock_items: number   // items at or below critical threshold
  pending_purchases:    number   // open purchase orders count
  open_tasks:           number   // open workflow tasks / approvals
  fill_rate_pct:        number   // orders fully shipped / total orders × 100
}

export type PulseColor = 'green' | 'yellow' | 'red'

// ── Pure Helpers ──────────────────────────────────────────────────────────────

/**
 * Compute fill rate percentage.
 * Returns 0 when totalOrders is 0 (no division by zero).
 */
export function computeFillRate(fullyShipped: number, totalOrders: number): number {
  if (totalOrders === 0) return 0
  return (fullyShipped / totalOrders) * 100
}

/**
 * Classify operations pulse into a traffic-light signal.
 *
 * green  — overdue_collections = 0 AND critical_stock_items = 0 AND fill_rate > 95
 * red    — overdue_try > 500_000 OR critical_stock_items > 3 OR fill_rate < 80
 * yellow — everything else
 */
export function classifyOpsPulse(metrics: OpsPulseMetrics): PulseColor {
  const { overdue_collections, overdue_try, critical_stock_items, fill_rate_pct } = metrics

  // Red: any critical threshold breached (checked before green so overdue_try > 500K is caught)
  if (overdue_try > 500_000 || critical_stock_items > 3 || fill_rate_pct < 80) {
    return 'red'
  }

  // Green: everything is healthy
  if (overdue_collections === 0 && critical_stock_items === 0 && fill_rate_pct > 95) {
    return 'green'
  }

  // Yellow: watch state
  return 'yellow'
}

/**
 * Build a one-line Turkish summary string for the pulse banner.
 * Example: "Bugün 12 satış ₺450K · 3 kritik stok · 8 geciken tahsilat"
 */
export function buildPulseSummary(metrics: OpsPulseMetrics): string {
  const {
    today_sales_count,
    today_sales_try,
    critical_stock_items,
    overdue_collections,
    overdue_try,
    open_tasks,
    fill_rate_pct,
    pending_purchases,
  } = metrics

  const parts: string[] = []

  // Today's sales
  const salesTRY = formatTRYCompact(today_sales_try)
  parts.push(`Bugün ${today_sales_count} satış ${salesTRY}`)

  // Critical stock
  if (critical_stock_items > 0) {
    parts.push(`${critical_stock_items} kritik stok`)
  }

  // Overdue collections
  if (overdue_collections > 0) {
    const overdueTRY = formatTRYCompact(overdue_try)
    parts.push(`${overdueTRY} geciken tahsilat (${overdue_collections} müşteri)`)
  }

  // Fill rate when below 95
  if (fill_rate_pct < 95) {
    parts.push(`%${fill_rate_pct.toFixed(1)} doluluk`)
  }

  // Open tasks
  if (open_tasks > 0) {
    parts.push(`${open_tasks} açık görev`)
  }

  // Pending purchases
  if (pending_purchases > 0) {
    parts.push(`${pending_purchases} bekleyen sipariş`)
  }

  return parts.join(' · ')
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Format a TRY amount compactly: 523_000 → "₺523K", 1_200_000 → "₺1.2M" */
function formatTRYCompact(amount: number): string {
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000
    return `₺${m % 1 === 0 ? m : m.toFixed(1)}M`
  }
  if (amount >= 1_000) {
    const k = amount / 1_000
    return `₺${k % 1 === 0 ? k : k.toFixed(1)}K`
  }
  return `₺${amount}`
}
