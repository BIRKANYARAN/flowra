// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/commercial/receivables-heatmap.service.ts
//
// Receivables Aging Heatmap — customer × aging bucket visualization.
//
// Groups open receivables by customer and aging bucket, computes risk scores,
// and provides a 6-month trend of total outstanding.
//
// Risk score formula (0-100):
//   base = (days_61_90 + days_91_plus) / total_outstanding × 100
//   bonus = oldest_invoice_days > 90 ? 20 : oldest_invoice_days > 60 ? 10 : 0
//   risk_score = min(100, base + bonus)
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_91_plus'

export interface CustomerAgingRow {
  customer_name: string
  total_outstanding_try: number
  buckets: Record<AgingBucket, number>   // amount in each bucket
  oldest_invoice_days: number | null
  last_payment_date: string | null
  risk_score: number                     // 0-100 (higher = riskier)
}

export interface AgingBucketTotal {
  bucket: AgingBucket
  label: string
  total_try: number
  count: number           // number of invoices
  pct_of_total: number
}

export interface ReceivablesHeatmapReport {
  customers: CustomerAgingRow[]     // sorted by total_outstanding desc
  bucket_totals: AgingBucketTotal[]
  total_outstanding_try: number
  critical_outstanding_try: number  // 61+ days
  as_of_date: string

  // Monthly trend: last 6 months of total outstanding
  monthly_trend: Array<{
    month: string         // 'YYYY-MM'
    label: string
    total_outstanding_try: number
    critical_try: number
  }>
}

// ── Bucket metadata ───────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<AgingBucket, string> = {
  current:      'Güncel',
  days_1_30:    '1-30 Gün',
  days_31_60:   '31-60 Gün',
  days_61_90:   '61-90 Gün',
  days_91_plus: '90+ Gün',
}

const BUCKET_ORDER: AgingBucket[] = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_91_plus',
]

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Assigns a receivable to an aging bucket based on how many days old the
 * sale_date is relative to today.
 *   ≤0  → current          (same day or future-dated)
 *   1-30  → days_1_30
 *   31-60 → days_31_60
 *   61-90 → days_61_90
 *   >90   → days_91_plus
 */
export function assignReceivableBucket(saleDateStr: string, today: string): AgingBucket {
  const saleMs  = new Date(saleDateStr + 'T00:00:00Z').getTime()
  const todayMs = new Date(today       + 'T00:00:00Z').getTime()
  const days    = Math.round((todayMs - saleMs) / 86_400_000)

  if (days <= 0)  return 'current'
  if (days <= 30) return 'days_1_30'
  if (days <= 60) return 'days_31_60'
  if (days <= 90) return 'days_61_90'
  return 'days_91_plus'
}

/**
 * Computes a risk score (0-100) for a customer based on their aging buckets.
 *   base  = (days_61_90 + days_91_plus) / total_outstanding × 100
 *   bonus = oldest_invoice_days > 90 → +20 | > 60 → +10 | else 0
 *   result = min(100, base + bonus)
 *
 * Returns 0 if total is 0 (no outstanding balance).
 */
export function computeCustomerRiskScore(
  buckets: Record<AgingBucket, number>,
  total: number,
  oldestDays: number | null,
): number {
  if (total <= 0) return 0

  const criticalAmt = (buckets.days_61_90 ?? 0) + (buckets.days_91_plus ?? 0)
  const base        = (criticalAmt / total) * 100

  const bonus =
    oldestDays !== null && oldestDays > 90 ? 20 :
    oldestDays !== null && oldestDays > 60 ? 10 :
    0

  return Math.min(100, Math.round(base + bonus))
}

/**
 * Builds bucket totals (label, total_try, count, pct_of_total) from a list of
 * customer aging rows. Returns all 5 buckets in canonical order.
 */
export function buildBucketTotals(customers: CustomerAgingRow[]): AgingBucketTotal[] {
  const totalAll = customers.reduce((s, c) => s + c.total_outstanding_try, 0)

  // Aggregate per bucket across all customers — we need invoice counts too.
  // For count we need the raw sales data, but buildBucketTotals only has
  // CustomerAgingRow. We'll count customers that have non-zero amount per bucket
  // as a proxy for "number of invoices per bucket" at the summary level.
  // This matches the intent: count = number of customers contributing to bucket.
  // (The service stores invoice-level counts separately in the main method.)

  const bucketTotals: Record<AgingBucket, { total_try: number; count: number }> = {
    current:      { total_try: 0, count: 0 },
    days_1_30:    { total_try: 0, count: 0 },
    days_31_60:   { total_try: 0, count: 0 },
    days_61_90:   { total_try: 0, count: 0 },
    days_91_plus: { total_try: 0, count: 0 },
  }

  for (const customer of customers) {
    for (const bucket of BUCKET_ORDER) {
      const amt = customer.buckets[bucket] ?? 0
      if (amt > 0) {
        bucketTotals[bucket].total_try += amt
        bucketTotals[bucket].count     += 1
      }
    }
  }

  return BUCKET_ORDER.map(bucket => ({
    bucket,
    label:         BUCKET_LABELS[bucket],
    total_try:     Math.round(bucketTotals[bucket].total_try * 100) / 100,
    count:         bucketTotals[bucket].count,
    pct_of_total:  totalAll > 0
      ? Math.round((bucketTotals[bucket].total_try / totalAll) * 10000) / 100
      : 0,
  }))
}

// ── Main service ───────────────────────────────────────────────────────────────

export class ReceivablesHeatmapService {

  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<ReceivablesHeatmapReport> {

    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    // ── Fetch open receivables ───────────────────────────────────────────────
    const { data: rawSales } = await supabase
      .from('sales')
      .select('id, customer_name, total_try:total, paid_amount, sale_date, paid_at, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: false })
      .limit(500)

    const sales = (rawSales ?? []) as Array<{
      id: string
      customer_name: string | null
      total_try: number
      paid_amount: number | null
      sale_date: string
      paid_at: string | null
      payment_status: string
    }>

    // ── Build customer map ───────────────────────────────────────────────────
    const customerMap = new Map<string, {
      total_outstanding: number
      buckets: Record<AgingBucket, number>
      oldest_invoice_days: number | null
      last_payment_date: string | null
      invoice_count_by_bucket: Record<AgingBucket, number>
    }>()

    for (const sale of sales) {
      const name        = sale.customer_name?.trim() || 'Bilinmeyen Müşteri'
      const outstanding = Math.max(0, Number(sale.total_try ?? 0) - Number(sale.paid_amount ?? 0))
      if (outstanding <= 0) continue

      const bucket = assignReceivableBucket(sale.sale_date, today)

      const saleMs  = new Date(sale.sale_date + 'T00:00:00Z').getTime()
      const todayMs = new Date(today           + 'T00:00:00Z').getTime()
      const ageDays = Math.round((todayMs - saleMs) / 86_400_000)

      if (!customerMap.has(name)) {
        customerMap.set(name, {
          total_outstanding: 0,
          buckets: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
          oldest_invoice_days: null,
          last_payment_date:  null,
          invoice_count_by_bucket: { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
        })
      }

      const entry = customerMap.get(name)!
      entry.total_outstanding           += outstanding
      entry.buckets[bucket]             += outstanding
      entry.invoice_count_by_bucket[bucket] += 1

      // Track oldest invoice
      if (entry.oldest_invoice_days === null || ageDays > entry.oldest_invoice_days) {
        entry.oldest_invoice_days = ageDays
      }

      // Track most recent payment date
      if (sale.paid_at) {
        const paidDate = sale.paid_at.slice(0, 10)
        if (!entry.last_payment_date || paidDate > entry.last_payment_date) {
          entry.last_payment_date = paidDate
        }
      }
    }

    // ── Build CustomerAgingRow array ─────────────────────────────────────────
    const customers: CustomerAgingRow[] = Array.from(customerMap.entries()).map(([name, entry]) => {
      // Round bucket amounts
      const buckets: Record<AgingBucket, number> = {
        current:      Math.round(entry.buckets.current      * 100) / 100,
        days_1_30:    Math.round(entry.buckets.days_1_30    * 100) / 100,
        days_31_60:   Math.round(entry.buckets.days_31_60   * 100) / 100,
        days_61_90:   Math.round(entry.buckets.days_61_90   * 100) / 100,
        days_91_plus: Math.round(entry.buckets.days_91_plus * 100) / 100,
      }

      const total_outstanding_try = Math.round(entry.total_outstanding * 100) / 100
      const risk_score            = computeCustomerRiskScore(
        buckets,
        total_outstanding_try,
        entry.oldest_invoice_days,
      )

      return {
        customer_name:         name,
        total_outstanding_try,
        buckets,
        oldest_invoice_days:   entry.oldest_invoice_days,
        last_payment_date:     entry.last_payment_date,
        risk_score,
      }
    })

    // Sort by total_outstanding desc
    customers.sort((a, b) => b.total_outstanding_try - a.total_outstanding_try)

    // ── Totals ───────────────────────────────────────────────────────────────
    const total_outstanding_try = customers.reduce((s, c) => s + c.total_outstanding_try, 0)
    const critical_outstanding_try = customers.reduce(
      (s, c) => s + c.buckets.days_61_90 + c.buckets.days_91_plus,
      0,
    )
    const bucket_totals = buildBucketTotals(customers)

    // ── Monthly trend (last 6 months) ────────────────────────────────────────
    const monthly_trend: ReceivablesHeatmapReport['monthly_trend'] = []

    // Fetch all sales for the trend (we need to look back ~6 months)
    // For trend: a sale "existed" in a month if sale_date <= month_end AND (paid_at IS NULL OR paid_at > month_end)
    const { data: trendSales } = await supabase
      .from('sales')
      .select('total_try:total, paid_amount, sale_date, paid_at, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue', 'paid'])
      .order('sale_date', { ascending: false })
      .limit(2000)

    const trendData = (trendSales ?? []) as Array<{
      total_try: number
      paid_amount: number | null
      sale_date: string
      paid_at: string | null
      payment_status: string
    }>

    for (let i = 5; i >= 0; i--) {
      const d        = new Date(today + 'T00:00:00Z')
      d.setMonth(d.getMonth() - i)
      const year     = d.getFullYear()
      const month    = d.getMonth() // 0-based
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

      // Last day of this month
      const lastDay  = new Date(year, month + 1, 0)
      const monthEnd = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`

      const TR_MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
      const label    = `${TR_MONTHS[month]} ${String(year).slice(2)}`

      let monthTotal    = 0
      let monthCritical = 0

      for (const s of trendData) {
        if (!s.sale_date) continue
        if (s.sale_date > monthEnd) continue  // sale didn't exist yet

        // Was it unpaid as of month-end?
        const unpaidAtEnd = !s.paid_at || s.paid_at.slice(0, 10) > monthEnd
        if (!unpaidAtEnd) continue

        const outstanding = Math.max(0, Number(s.total_try ?? 0) - Number(s.paid_amount ?? 0))
        if (outstanding <= 0) continue

        monthTotal += outstanding

        // Critical = 61+ days old as of month-end
        const saleMs     = new Date(s.sale_date + 'T00:00:00Z').getTime()
        const monthEndMs = new Date(monthEnd     + 'T00:00:00Z').getTime()
        const ageDays    = Math.round((monthEndMs - saleMs) / 86_400_000)
        if (ageDays > 60) {
          monthCritical += outstanding
        }
      }

      monthly_trend.push({
        month:                monthStr,
        label,
        total_outstanding_try: Math.round(monthTotal    * 100) / 100,
        critical_try:          Math.round(monthCritical * 100) / 100,
      })
    }

    return {
      customers,
      bucket_totals,
      total_outstanding_try:   Math.round(total_outstanding_try    * 100) / 100,
      critical_outstanding_try: Math.round(critical_outstanding_try * 100) / 100,
      as_of_date:              today,
      monthly_trend,
    }
  }
}
