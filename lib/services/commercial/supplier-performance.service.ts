// ── SupplierPerformanceService — PO-based supplier performance analytics ──────
// Analyses purchase_orders to compute fulfillment rates, lead times, on-time
// delivery and assigns performance grades. Pure computation — no side effects
// beyond the DB query.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SupplierPerformanceProfile {
  supplier_name: string
  total_po_count: number
  total_po_value_try: number
  received_count: number
  cancelled_count: number
  pending_count: number
  fulfillment_rate_pct: number
  avg_lead_time_days: number | null
  on_time_rate_pct: number | null
  avg_po_value_try: number | null
  last_order_date: string | null
  performance_grade: 'excellent' | 'good' | 'fair' | 'poor' | 'insufficient_data'
}

export interface PurchaseOrderSummary {
  total_pos: number
  total_value_try: number
  pending_pos: number
  pending_value_try: number
  overdue_pos: number
  overdue_value_try: number
  received_this_month: number
  received_value_this_month_try: number
}

export interface SupplierPerformanceReport {
  suppliers: SupplierPerformanceProfile[]
  summary: PurchaseOrderSummary
  top_supplier_by_value: string | null
  top_supplier_by_fulfillment: string | null
  avg_portfolio_fulfillment_pct: number | null
  as_of_date: string
}

// ── Raw PO row from DB ─────────────────────────────────────────────────────────

interface PORow {
  supplier_name?: string | null
  po_date?: string | null
  order_date?: string | null        // fallback field name
  expected_delivery_date?: string | null
  expected_date?: string | null     // fallback field name
  received_at?: string | null
  status?: string | null
  total_try?: number | null
}

// ── Pure exported helpers ─────────────────────────────────────────────────────

/**
 * Compute fulfillment rate: received / (total - cancelled) × 100.
 * Returns 0 if non-cancelled count is 0.
 */
export function computeFulfillmentRate(
  receivedCount: number,
  totalCount: number,
  cancelledCount: number,
): number {
  const nonCancelled = totalCount - cancelledCount
  if (nonCancelled <= 0) return 0
  return Math.round((receivedCount / nonCancelled) * 10000) / 100
}

/**
 * Compute on-time rate: onTimeCount / receivedCount × 100.
 * Returns null if receivedCount is 0.
 */
export function computeOnTimeRate(
  onTimeCount: number,
  receivedCount: number,
): number | null {
  if (receivedCount <= 0) return null
  return Math.round((onTimeCount / receivedCount) * 10000) / 100
}

/**
 * Determine if a PO is overdue: pending status and past expected_date.
 */
export function isOverdue(
  expectedDate: string | null,
  status: string,
  today: string,
): boolean {
  if (!expectedDate) return false
  const isPending = status === 'draft' || status === 'ordered' || status === 'partially_received'
  if (!isPending) return false
  return expectedDate < today
}

/**
 * Grade a supplier based on fulfillment rate, on-time rate, and PO count.
 *
 * excellent: fulfillment≥95% AND (on_time≥90% OR on_time null)
 * good:      fulfillment≥85% AND (on_time≥75% OR on_time null)
 * fair:      fulfillment≥70%
 * poor:      fulfillment<70%
 * insufficient_data: total_po_count < 3
 */
export function gradeSupplierPerformance(
  fulfillmentPct: number,
  onTimePct: number | null,
  poCount: number,
): SupplierPerformanceProfile['performance_grade'] {
  if (poCount < 3) return 'insufficient_data'

  const onTimeOk = onTimePct === null || onTimePct >= 90
  const onTimeMedium = onTimePct === null || onTimePct >= 75

  if (fulfillmentPct >= 95 && onTimeOk) return 'excellent'
  if (fulfillmentPct >= 85 && onTimeMedium) return 'good'
  if (fulfillmentPct >= 70) return 'fair'
  return 'poor'
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
  )
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
}

function emptyReport(today: string): SupplierPerformanceReport {
  return {
    suppliers: [],
    summary: {
      total_pos: 0,
      total_value_try: 0,
      pending_pos: 0,
      pending_value_try: 0,
      overdue_pos: 0,
      overdue_value_try: 0,
      received_this_month: 0,
      received_value_this_month_try: 0,
    },
    top_supplier_by_value: null,
    top_supplier_by_fulfillment: null,
    avg_portfolio_fulfillment_pct: null,
    as_of_date: today,
  }
}

// ── Service class ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class SupplierPerformanceService {
  static async getReport(
    companyId: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<SupplierPerformanceReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    const twelveMonthsAgo = new Date(new Date(today).getTime() - 365 * 86_400_000)
      .toISOString().slice(0, 10)

    // Attempt to query purchase_orders — gracefully handle table not found
    let rows: PORow[] = []
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(
          'supplier_name, po_date, order_date, expected_delivery_date, expected_date, received_at, status, total_try',
        )
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('po_date', twelveMonthsAgo)
        .order('po_date', { ascending: false })

      if (error) {
        // Table not found or other DB error — return empty report
        const msg = error.message ?? ''
        if (
          msg.includes('does not exist') ||
          msg.includes('relation') ||
          msg.includes('42P01')
        ) {
          return emptyReport(today)
        }
        throw new Error(`SupplierPerformanceService.getReport: ${error.message}`)
      }

      rows = (data ?? []) as PORow[]
    } catch (err) {
      // Swallow table-not-found errors
      const msg = err instanceof Error ? err.message : String(err)
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        msg.includes('42P01') ||
        msg.includes('purchase_orders')
      ) {
        return emptyReport(today)
      }
      throw err
    }

    // ── Build summary ──────────────────────────────────────────────────────────

    const thisMonthPrefix = today.slice(0, 7) // YYYY-MM
    let totalPos = rows.length
    let totalValueTry = 0
    let pendingPos = 0
    let pendingValueTry = 0
    let overduePos = 0
    let overdueValueTry = 0
    let receivedThisMonth = 0
    let receivedValueThisMonth = 0

    for (const row of rows) {
      const value = Number(row.total_try ?? 0)
      const status = (row.status ?? 'ordered').toLowerCase()
      const expectedDate = row.expected_delivery_date ?? row.expected_date ?? null

      totalValueTry += value

      const isPending = status === 'draft' || status === 'ordered' || status === 'partially_received'
      if (isPending) {
        pendingPos++
        pendingValueTry += value
        if (isOverdue(expectedDate, status, today)) {
          overduePos++
          overdueValueTry += value
        }
      }

      if (status === 'received' && row.received_at) {
        const receivedMonth = row.received_at.slice(0, 7)
        if (receivedMonth === thisMonthPrefix) {
          receivedThisMonth++
          receivedValueThisMonth += value
        }
      }
    }

    // ── Group rows by supplier ─────────────────────────────────────────────────

    const bySupplier = new Map<string, PORow[]>()
    for (const row of rows) {
      const key = (row.supplier_name ?? '').trim() || 'Tedarikçi Belirtilmemiş'
      if (!bySupplier.has(key)) bySupplier.set(key, [])
      bySupplier.get(key)!.push(row)
    }

    // ── Build supplier profiles ────────────────────────────────────────────────

    const suppliers: SupplierPerformanceProfile[] = []

    for (const [name, poRows] of bySupplier.entries()) {
      let totalPoCount = poRows.length
      let totalPoValue = 0
      let receivedCount = 0
      let cancelledCount = 0
      let pendingCount = 0
      let onTimeCount = 0
      let lastOrderDate: string | null = null
      const leadTimes: number[] = []

      for (const po of poRows) {
        const value = Number(po.total_try ?? 0)
        const status = (po.status ?? 'ordered').toLowerCase()
        const poDate = po.po_date ?? po.order_date ?? null
        const expectedDate = po.expected_delivery_date ?? po.expected_date ?? null
        const receivedAt = po.received_at ?? null

        totalPoValue += value

        if (poDate && (!lastOrderDate || poDate > lastOrderDate)) {
          lastOrderDate = poDate
        }

        if (status === 'received') {
          receivedCount++
          // Lead time: po_date → received_at
          if (poDate && receivedAt) {
            const days = daysBetween(poDate, receivedAt)
            if (days >= 0) leadTimes.push(days)
          }
          // On-time: received_at <= expected_delivery_date
          if (receivedAt && expectedDate && receivedAt <= expectedDate) {
            onTimeCount++
          }
        } else if (status === 'cancelled') {
          cancelledCount++
        } else {
          // draft, ordered, partially_received
          pendingCount++
        }
      }

      const fulfillmentRatePct = computeFulfillmentRate(receivedCount, totalPoCount, cancelledCount)
      const onTimePct = computeOnTimeRate(onTimeCount, receivedCount)
      const avgLeadTimeDays = avg(leadTimes)
      const avgPoValueTry = totalPoCount > 0 ? Math.round((totalPoValue / totalPoCount) * 100) / 100 : null
      const grade = gradeSupplierPerformance(fulfillmentRatePct, onTimePct, totalPoCount)

      suppliers.push({
        supplier_name: name,
        total_po_count: totalPoCount,
        total_po_value_try: totalPoValue,
        received_count: receivedCount,
        cancelled_count: cancelledCount,
        pending_count: pendingCount,
        fulfillment_rate_pct: fulfillmentRatePct,
        avg_lead_time_days: avgLeadTimeDays,
        on_time_rate_pct: onTimePct,
        avg_po_value_try: avgPoValueTry,
        last_order_date: lastOrderDate,
        performance_grade: grade,
      })
    }

    // Sort by total value descending
    suppliers.sort((a, b) => b.total_po_value_try - a.total_po_value_try)

    // ── Portfolio-level metrics ────────────────────────────────────────────────

    const topByValue = suppliers.length > 0 ? suppliers[0].supplier_name : null

    const qualifiedSuppliers = suppliers.filter(s => s.total_po_count >= 3)
    const topByFulfillment = qualifiedSuppliers.length > 0
      ? qualifiedSuppliers.reduce((best, s) =>
          s.fulfillment_rate_pct > best.fulfillment_rate_pct ? s : best
        ).supplier_name
      : null

    const avgPortfolioFulfillment = qualifiedSuppliers.length > 0
      ? Math.round(
          (qualifiedSuppliers.reduce((s, sup) => s + sup.fulfillment_rate_pct, 0) / qualifiedSuppliers.length) * 100,
        ) / 100
      : null

    return {
      suppliers,
      summary: {
        total_pos: totalPos,
        total_value_try: totalValueTry,
        pending_pos: pendingPos,
        pending_value_try: pendingValueTry,
        overdue_pos: overduePos,
        overdue_value_try: overdueValueTry,
        received_this_month: receivedThisMonth,
        received_value_this_month_try: receivedValueThisMonth,
      },
      top_supplier_by_value: topByValue,
      top_supplier_by_fulfillment: topByFulfillment,
      avg_portfolio_fulfillment_pct: avgPortfolioFulfillment,
      as_of_date: today,
    }
  }
}
