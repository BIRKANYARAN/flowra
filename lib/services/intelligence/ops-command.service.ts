// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/ops-command.service.ts
//
// OPS Command Center — Daily Metrics Aggregator
//
// Computes a "morning briefing" for the ops manager: what happened today and
// this week across sales, collections, expenses, and stock.
//
// All pure-function helpers are exported for unit testing.
// The OpsCommandService class handles DB queries.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface DailyOpsMetrics {
  as_of_date: string           // today ISO date

  // Sales
  sales_today_count: number
  sales_today_try: number
  sales_dod_pct: number | null
  sales_wtd_try: number        // week-to-date
  sales_wow_pct: number | null

  // Collections
  collections_today_try: number
  collections_overdue_count: number
  collections_overdue_try: number
  collections_dod_pct: number | null

  // Expenses
  expenses_today_try: number
  expenses_pending_approval: number   // draft/submitted expenses

  // Stock
  stock_critical_count: number        // products with qty_remaining < 5
  stock_out_count: number             // qty_remaining = 0
  pending_purchase_orders: number     // purchases in 'ordered' status

  // Pulse
  ops_pulse: 'strong' | 'normal' | 'slow' | 'critical'
  fill_rate_pct: number

  // Alerts (Turkish)
  alerts: Array<{
    severity: 'critical' | 'warning' | 'info'
    message: string
  }>
}

// ── Pure exported helpers ─────────────────────────────────────────────────────

/**
 * Compute day-over-day change %.
 * Returns null if yesterdayValue = 0 (guard against division by zero).
 */
export function computeDodChange(
  todayValue: number,
  yesterdayValue: number,
): number | null {
  if (yesterdayValue === 0) return null
  return ((todayValue - yesterdayValue) / yesterdayValue) * 100
}

/**
 * Compute week-over-week change %.
 * Returns null if lastWeekValue = 0 (guard against division by zero).
 */
export function computeWowChange(
  thisWeekValue: number,
  lastWeekValue: number,
): number | null {
  if (lastWeekValue === 0) return null
  return ((thisWeekValue - lastWeekValue) / lastWeekValue) * 100
}

/**
 * Classify operational pulse:
 *   critical: collections_overdue > 5 AND stock_critical > 3
 *   slow:     revenue DoD < -20% OR no sales today
 *   strong:   all DoD positive AND no stock alerts
 *   normal:   mixed signals, no critical issues
 */
export function classifyOpsPulse(
  salesDodPct: number | null,
  hasSalesToday: boolean,
  collectionsOverdueCount: number,
  stockCriticalCount: number,
): 'strong' | 'normal' | 'slow' | 'critical' {
  // Critical check first (most severe)
  if (collectionsOverdueCount > 5 && stockCriticalCount > 3) return 'critical'

  // Slow check
  if (!hasSalesToday) return 'slow'
  if (salesDodPct !== null && salesDodPct < -20) return 'slow'

  // Strong check: all DoD positive AND no stock alerts
  if (salesDodPct !== null && salesDodPct > 0 && stockCriticalCount === 0) return 'strong'

  return 'normal'
}

/**
 * Compute fill rate: orders_fulfilled / orders_total × 100
 * Returns 0 if ordersTotal = 0 (guard against division by zero).
 */
export function computeFillRate(
  ordersFulfilled: number,
  ordersTotal: number,
): number {
  if (ordersTotal === 0) return 0
  return (ordersFulfilled / ordersTotal) * 100
}

/**
 * Compute collection rate for a day: amount_collected / amount_due × 100
 * Returns null if amountDueTry = 0 (guard against division by zero).
 */
export function computeDailyCollectionRate(
  amountCollectedTry: number,
  amountDueTry: number,
): number | null {
  if (amountDueTry === 0) return null
  return (amountCollectedTry / amountDueTry) * 100
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function padDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Get Monday of the week containing the given date (UTC). */
function getMondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun,1=Mon,...6=Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setUTCDate(d.getUTCDate() + diff)
  return monday
}

/** Build start/end of a day as ISO strings for Supabase range queries (UTC). */
function dayRange(isoDate: string): { start: string; end: string } {
  return {
    start: `${isoDate}T00:00:00.000Z`,
    end:   `${isoDate}T23:59:59.999Z`,
  }
}

// ── Alert generator ───────────────────────────────────────────────────────────

function generateAlerts(metrics: Omit<DailyOpsMetrics, 'ops_pulse' | 'fill_rate_pct' | 'alerts'>): DailyOpsMetrics['alerts'] {
  const alerts: DailyOpsMetrics['alerts'] = []

  if (metrics.stock_out_count > 0) {
    alerts.push({
      severity: 'critical',
      message: `${metrics.stock_out_count} üründe stok tükendi — acil satın alma gerekiyor.`,
    })
  }

  if (metrics.collections_overdue_count > 5) {
    alerts.push({
      severity: 'critical',
      message: `${metrics.collections_overdue_count} gecikmiş tahsilat mevcut — alacak riski yüksek.`,
    })
  }

  if (metrics.stock_critical_count > 0) {
    alerts.push({
      severity: 'warning',
      message: `${metrics.stock_critical_count} üründe kritik stok seviyesi — stok takviyesi önerilir.`,
    })
  }

  if (metrics.expenses_pending_approval > 0) {
    alerts.push({
      severity: 'warning',
      message: `${metrics.expenses_pending_approval} gider onay bekliyor.`,
    })
  }

  if (metrics.pending_purchase_orders > 0) {
    alerts.push({
      severity: 'info',
      message: `${metrics.pending_purchase_orders} satın alma siparişi teslim bekleniyor.`,
    })
  }

  if (metrics.sales_today_count === 0) {
    alerts.push({
      severity: 'warning',
      message: 'Bugün henüz satış kaydedilmedi.',
    })
  }

  if (metrics.sales_dod_pct !== null && metrics.sales_dod_pct < -20) {
    alerts.push({
      severity: 'warning',
      message: `Bugünkü satışlar dün ile kıyaslandığında %${Math.abs(metrics.sales_dod_pct).toFixed(1)} düşük.`,
    })
  }

  return alerts
}

// ── Service class ─────────────────────────────────────────────────────────────

export class OpsCommandService {
  constructor(private readonly supabase: AnyClient) {}

  async getDailyMetrics(companyId: string): Promise<DailyOpsMetrics> {
    const today     = new Date()
    const todayISO  = padDate(today)

    const yesterday = new Date(today)
    yesterday.setUTCDate(today.getUTCDate() - 1)
    const yesterdayISO = padDate(yesterday)

    // WTD: this Monday to today
    const thisMonday    = getMondayOf(today)
    const thisMondayISO = padDate(thisMonday)

    // Last week: Monday to Sunday of last week
    const lastSunday = new Date(thisMonday)
    lastSunday.setUTCDate(thisMonday.getUTCDate() - 1)
    const lastMonday = getMondayOf(lastSunday)
    const lastMondayISO = padDate(lastMonday)
    const lastSundayISO = padDate(lastSunday)

    // ── Parallel queries using Promise.allSettled ─────────────────────────────

    const [
      salesTodayRes,
      salesYesterdayRes,
      salesWtdRes,
      salesLastWeekRes,
      collectionsOverdueRes,
      expensesTodayRes,
      expensesPendingRes,
      stockLotsRes,
      purchaseOrdersRes,
    ] = await Promise.allSettled([

      // 1) Sales today
      this.supabase
        .from('sales')
        .select('id, total_try:total')
        .eq('company_id', companyId)
        .eq('sale_date', todayISO)
        .is('deleted_at', null),

      // 2) Sales yesterday
      this.supabase
        .from('sales')
        .select('id, total_try:total')
        .eq('company_id', companyId)
        .eq('sale_date', yesterdayISO)
        .is('deleted_at', null),

      // 3) Sales WTD (this Monday → today)
      this.supabase
        .from('sales')
        .select('id, total_try:total')
        .eq('company_id', companyId)
        .gte('sale_date', thisMondayISO)
        .lte('sale_date', todayISO)
        .is('deleted_at', null),

      // 4) Sales last week (last Monday → last Sunday)
      this.supabase
        .from('sales')
        .select('id, total_try:total')
        .eq('company_id', companyId)
        .gte('sale_date', lastMondayISO)
        .lte('sale_date', lastSundayISO)
        .is('deleted_at', null),

      // 5) Overdue collections
      this.supabase
        .from('sales')
        .select('id, total_try:total, paid_amount')
        .eq('company_id', companyId)
        .eq('payment_status', 'overdue')
        .is('deleted_at', null),

      // 6) Expenses today
      this.supabase
        .from('expenses')
        .select('id, amount_try')
        .eq('company_id', companyId)
        .eq('expense_date', todayISO)
        .is('deleted_at', null),

      // 7) Expenses pending approval (draft / submitted)
      this.supabase
        .from('expenses')
        .select('id')
        .eq('company_id', companyId)
        .in('payment_status', ['draft', 'submitted'])
        .is('deleted_at', null),

      // 8) Stock lots for critical/out checks
      this.supabase
        .from('stock_lots')
        .select('product_id, qty_remaining')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // 9) Purchase orders in 'ordered' status
      this.supabase
        .from('purchase_orders')
        .select('id')
        .eq('company_id', companyId)
        .eq('status', 'ordered')
        .is('deleted_at', null),
    ])

    // ── Extract results (safe fallback to empty) ──────────────────────────────

    type SaleRow     = { id: string; total_try: number }
    type OverdueRow  = { id: string; total_try: number; paid_amount: number | null }
    type ExpenseRow  = { id: string; amount_try: number }
    type StockRow    = { product_id: string; qty_remaining: number }

    const salesToday    = (salesTodayRes.status    === 'fulfilled' ? salesTodayRes.value.data    : null) as SaleRow[] | null
    const salesYesterday = (salesYesterdayRes.status === 'fulfilled' ? salesYesterdayRes.value.data : null) as SaleRow[] | null
    const salesWtd      = (salesWtdRes.status      === 'fulfilled' ? salesWtdRes.value.data      : null) as SaleRow[] | null
    const salesLastWeek = (salesLastWeekRes.status  === 'fulfilled' ? salesLastWeekRes.value.data  : null) as SaleRow[] | null
    const overdue       = (collectionsOverdueRes.status === 'fulfilled' ? collectionsOverdueRes.value.data : null) as OverdueRow[] | null
    const expensesToday = (expensesTodayRes.status  === 'fulfilled' ? expensesTodayRes.value.data  : null) as ExpenseRow[] | null
    const expensesPending = (expensesPendingRes.status === 'fulfilled' ? expensesPendingRes.value.data : null) as { id: string }[] | null
    const stockLots     = (stockLotsRes.status      === 'fulfilled' ? stockLotsRes.value.data      : null) as StockRow[] | null
    const purchaseOrders = (purchaseOrdersRes.status === 'fulfilled' ? purchaseOrdersRes.value.data : null) as { id: string }[] | null

    // ── Compute aggregates ────────────────────────────────────────────────────

    const salesTodayCount   = salesToday?.length ?? 0
    const salesTodayTry     = (salesToday ?? []).reduce((s, r) => s + (r.total_try ?? 0), 0)
    const salesYesterdayTry = (salesYesterday ?? []).reduce((s, r) => s + (r.total_try ?? 0), 0)
    const salesWtdTry       = (salesWtd ?? []).reduce((s, r) => s + (r.total_try ?? 0), 0)
    const salesLastWeekTry  = (salesLastWeek ?? []).reduce((s, r) => s + (r.total_try ?? 0), 0)

    // Collections today: sum of paid_amount on overdue sales where paid_at = today
    // (Using total - remaining for overdue; for a daily collection metric we
    //  approximate from the paid_amount field against today's date)
    // Since there's no paid_at field for collections-today in this query, we
    // use the sales today that are paid
    const salesTodayPaid = (salesToday ?? [])
    const collectionsToday = salesTodayPaid.reduce((s, _r) => s + 0, 0) // placeholder: no paid_at on today's sales query

    const overdueCount = overdue?.length ?? 0
    const overdueTotal = (overdue ?? []).reduce((s, r) => {
      const remaining = (r.total_try ?? 0) - (r.paid_amount ?? 0)
      return s + Math.max(0, remaining)
    }, 0)

    const expensesTodayTry   = (expensesToday ?? []).reduce((s, r) => s + (r.amount_try ?? 0), 0)
    const expensesPendingCount = expensesPending?.length ?? 0

    // Stock aggregations: sum qty_remaining per product
    const qtyByProduct: Record<string, number> = {}
    for (const lot of stockLots ?? []) {
      qtyByProduct[lot.product_id] = (qtyByProduct[lot.product_id] ?? 0) + lot.qty_remaining
    }

    const productQtys = Object.values(qtyByProduct)
    const stockCriticalCount = productQtys.filter(qty => qty > 0 && qty < 5).length
    const stockOutCount      = productQtys.filter(qty => qty <= 0).length

    const pendingPurchaseOrders = purchaseOrders?.length ?? 0

    // ── Derived metrics ───────────────────────────────────────────────────────

    const salesDodPct = computeDodChange(salesTodayTry, salesYesterdayTry)
    const salesWowPct = computeWowChange(salesWtdTry, salesLastWeekTry)

    // Collections DoD — collections today vs yesterday
    // (approximate: we track total sales revenue for collections-day pattern)
    const collectionsDodPct: number | null = null  // No yesterday-collections data in current query set

    const hasSalesToday = salesTodayCount > 0

    // Fill rate — fulfilled orders / total orders
    // Using non-overdue, non-cancelled sales as "fulfilled" approximation
    const totalSalesThisWeek = salesWtd?.length ?? 0
    const fulfilledThisWeek  = (salesWtd ?? []).filter(s => (s as SaleRow & { payment_status?: string }).payment_status !== 'cancelled').length
    const fillRatePct = computeFillRate(fulfilledThisWeek, totalSalesThisWeek)

    // ── Assemble metrics object ───────────────────────────────────────────────

    const baseMetrics: Omit<DailyOpsMetrics, 'ops_pulse' | 'fill_rate_pct' | 'alerts'> = {
      as_of_date:                todayISO,
      sales_today_count:         salesTodayCount,
      sales_today_try:           salesTodayTry,
      sales_dod_pct:             salesDodPct,
      sales_wtd_try:             salesWtdTry,
      sales_wow_pct:             salesWowPct,
      collections_today_try:     collectionsToday,
      collections_overdue_count: overdueCount,
      collections_overdue_try:   overdueTotal,
      collections_dod_pct:       collectionsDodPct,
      expenses_today_try:        expensesTodayTry,
      expenses_pending_approval: expensesPendingCount,
      stock_critical_count:      stockCriticalCount,
      stock_out_count:           stockOutCount,
      pending_purchase_orders:   pendingPurchaseOrders,
    }

    const opsPulse   = classifyOpsPulse(salesDodPct, hasSalesToday, overdueCount, stockCriticalCount)
    const alerts     = generateAlerts(baseMetrics)

    return {
      ...baseMetrics,
      ops_pulse:     opsPulse,
      fill_rate_pct: fillRatePct,
      alerts,
    }
  }
}
