// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/ap-aging.service.ts
//
// Accounts Payable (AP) Aging Report — dedicated service.
//
// Mirrors the AR aging pattern on the receivables side but for payables:
//   - Queries expenses with payment_status IN ('pending', 'partial')
//   - Buckets each entry by days outstanding since expense_date
//   - Aggregates bucket summaries with % of total
//   - Exposes pure helpers for testing
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface APAgingEntry {
  id: string
  supplier_name: string
  expense_type: string
  amount_try: number
  expense_date: string
  days_outstanding: number
  bucket: 'current' | 'days_1_30' | 'days_31_60' | 'days_61_90' | 'days_91_plus'
  payment_status: string
  description: string | null
  category: string | null
}

export interface APAgingBucketSummary {
  bucket: APAgingEntry['bucket']
  label: string
  total_try: number
  count: number
  pct_of_total: number
}

export interface APAgingReport {
  entries: APAgingEntry[]
  buckets: APAgingBucketSummary[]
  total_outstanding_try: number
  total_count: number
  critical_try: number        // 31+ days (days_31_60 + days_61_90 + days_91_plus)
  critical_count: number
  avg_days_outstanding: number | null
  oldest_entry_days: number | null
  as_of_date: string          // ISO date YYYY-MM-DD
}

// ── Bucket metadata (ordered) ─────────────────────────────────────────────────

const BUCKET_LABELS: Record<APAgingEntry['bucket'], string> = {
  current:      'Güncel',
  days_1_30:    '1-30 Gün',
  days_31_60:   '31-60 Gün',
  days_61_90:   '61-90 Gün',
  days_91_plus: '90+ Gün',
}

const BUCKET_ORDER: APAgingEntry['bucket'][] = [
  'current',
  'days_1_30',
  'days_31_60',
  'days_61_90',
  'days_91_plus',
]

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * Assigns a bucket based on days outstanding.
 *   ≤0  → current          (future-dated or same day)
 *   1-30  → days_1_30
 *   31-60 → days_31_60
 *   61-90 → days_61_90
 *   >90   → days_91_plus
 */
export function assignAPBucket(daysOutstanding: number): APAgingEntry['bucket'] {
  if (daysOutstanding <= 0)  return 'current'
  if (daysOutstanding <= 30) return 'days_1_30'
  if (daysOutstanding <= 60) return 'days_31_60'
  if (daysOutstanding <= 90) return 'days_61_90'
  return 'days_91_plus'
}

/**
 * Builds the 5-bucket summary array from a list of entries.
 * Handles zero-total safely (pct_of_total = 0 when total = 0).
 */
export function buildBucketSummaries(
  entries: APAgingEntry[],
  totalOutstanding: number,
): APAgingBucketSummary[] {
  const map = new Map<APAgingEntry['bucket'], { total: number; count: number }>()

  // Initialise all buckets at 0 so we always return all 5 buckets
  for (const b of BUCKET_ORDER) {
    map.set(b, { total: 0, count: 0 })
  }

  for (const e of entries) {
    const agg = map.get(e.bucket)!
    agg.total += e.amount_try
    agg.count += 1
  }

  return BUCKET_ORDER.map(bucket => {
    const agg = map.get(bucket)!
    const pct = totalOutstanding > 0 ? (agg.total / totalOutstanding) * 100 : 0
    return {
      bucket,
      label:        BUCKET_LABELS[bucket],
      total_try:    round2(agg.total),
      count:        agg.count,
      pct_of_total: round2(pct),
    }
  })
}

/**
 * Computes the average days outstanding across all entries.
 * Returns null for an empty array.
 */
export function computeAvgDaysOutstanding(entries: APAgingEntry[]): number | null {
  if (entries.length === 0) return null
  const sum = entries.reduce((acc, e) => acc + e.days_outstanding, 0)
  return round2(sum / entries.length)
}

// ── Private helpers ───────────────────────────────────────────────────────────

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to   + 'T00:00:00Z').getTime()
  return Math.round((b - a) / msPerDay)
}

// ── Service class ─────────────────────────────────────────────────────────────

export class APAgingService {
  /**
   * Builds a full AP aging report as of today.
   *
   * @param companyId  - company UUID
   * @param supabase   - authenticated Supabase client
   * @param opts.today - override today's date (YYYY-MM-DD) for testing
   */
  static async getReport(
    companyId: string,
    supabase: AnyClient,
    opts?: { today?: string },
  ): Promise<APAgingReport> {
    const today = opts?.today ?? new Date().toISOString().slice(0, 10)

    // Fetch unpaid/partially-paid expenses
    const { data, error } = await supabase
      .from('expenses')
      .select('id, vendor_name, expense_type, amount_try, expense_date, payment_status, description, category')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial'])
      .order('expense_date', { ascending: true })

    if (error) {
      throw new Error(`AP Aging: Supabase query failed — ${error.message}`)
    }

    const rows = data ?? []

    // Map to APAgingEntry
    const entries: APAgingEntry[] = rows.map(row => {
      const days = daysBetween(row.expense_date, today)
      return {
        id:               row.id,
        supplier_name:    row.vendor_name ?? 'Bilinmeyen Tedarikçi',
        expense_type:     row.expense_type ?? 'other',
        amount_try:       round2(Number(row.amount_try) || 0),
        expense_date:     row.expense_date,
        days_outstanding: days,
        bucket:           assignAPBucket(days),
        payment_status:   row.payment_status,
        description:      row.description ?? null,
        category:         row.category ?? null,
      }
    })

    // Totals
    const total_outstanding_try = round2(entries.reduce((s, e) => s + e.amount_try, 0))
    const total_count = entries.length

    // Bucket summaries
    const buckets = buildBucketSummaries(entries, total_outstanding_try)

    // Critical: days_31_60 + days_61_90 + days_91_plus
    const criticalBuckets = new Set<APAgingEntry['bucket']>(['days_31_60', 'days_61_90', 'days_91_plus'])
    const criticalEntries = entries.filter(e => criticalBuckets.has(e.bucket))
    const critical_try    = round2(criticalEntries.reduce((s, e) => s + e.amount_try, 0))
    const critical_count  = criticalEntries.length

    // Avg days & oldest
    const avg_days_outstanding = computeAvgDaysOutstanding(entries)
    const oldest_entry_days    = entries.length > 0
      ? Math.max(...entries.map(e => e.days_outstanding))
      : null

    return {
      entries,
      buckets,
      total_outstanding_try,
      total_count,
      critical_try,
      critical_count,
      avg_days_outstanding,
      oldest_entry_days,
      as_of_date: today,
    }
  }
}
