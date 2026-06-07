// ── CollectionsAgingService — Receivables Aging Analysis ──────────────────────
// Aging bucket classification, recovery probability scoring, and collection
// priority ranking for Turkish SME collections teams.
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateTruncationWarning } from '@/lib/finance/truncation'

// ── Public types ──────────────────────────────────────────────────────────────

export type AgingBucket = 'current' | '31_60' | '61_90' | '91_120' | '120_plus'

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Classify days overdue into an aging bucket.
 * Negative daysOverdue = not yet due → current.
 * current: <= 30, 31_60: 31-60, 61_90: 61-90, 91_120: 91-120, 120_plus: > 120
 */
export function classifyAgingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 30)  return 'current'
  if (daysOverdue <= 60)  return '31_60'
  if (daysOverdue <= 90)  return '61_90'
  if (daysOverdue <= 120) return '91_120'
  return '120_plus'
}

/**
 * Compute recovery probability (0-100) based on days overdue and customer
 * payment history score (0-100 from customer-credit service, neutral = 50).
 *
 * Base recovery rates:
 *   current (<=30): 95%
 *   31_60:          80%
 *   61_90:          60%
 *   91_120:         40%
 *   120_plus:       20%
 *
 * Adjustment: + (paymentHistoryScore - 50) * 0.3   → ±15% max
 * Final: clamp to [5, 99]
 */
export function computeRecoveryProbability(
  daysOverdue: number,
  customerPaymentHistoryScore: number,
): number {
  const bucket = classifyAgingBucket(daysOverdue)

  const baseRates: Record<AgingBucket, number> = {
    current:  95,
    '31_60':  80,
    '61_90':  60,
    '91_120': 40,
    '120_plus': 20,
  }

  const base       = baseRates[bucket]
  const adjustment = (customerPaymentHistoryScore - 50) * 0.3
  const raw        = base + adjustment

  return Math.min(99, Math.max(5, Math.round(raw)))
}

/**
 * Compute collection priority score.
 * priority = outstandingAmount × (recoveryProbability/100) × urgencyMultiplier
 *
 * urgencyMultiplier:
 *   <= 30d:  1.0
 *   31-60d:  1.5
 *   61-90d:  2.0
 *   91-120d: 2.5
 *   > 120d:  1.2  (lower urgency — likely needs legal)
 *
 * Higher score = higher priority to collect.
 */
export function computeCollectionPriority(
  outstandingAmount: number,
  recoveryProbability: number,
  daysOverdue: number,
): number {
  if (outstandingAmount <= 0) return 0

  const bucket = classifyAgingBucket(daysOverdue)

  const urgencyMultipliers: Record<AgingBucket, number> = {
    current:    1.0,
    '31_60':    1.5,
    '61_90':    2.0,
    '91_120':   2.5,
    '120_plus': 1.2,
  }

  const urgency = urgencyMultipliers[bucket]
  return outstandingAmount * (recoveryProbability / 100) * urgency
}

/**
 * Compute aging concentration metrics.
 *
 * Returns:
 *  current_pct:  % of total outstanding that is current (<=30d)
 *  overdue_pct:  % that is overdue (any bucket > current)
 *  critical_pct: % that is critical (91_120 + 120_plus)
 *  hhi:          Herfindahl-Hirschman index (0-10000); sum of squared bucket shares
 *
 * All pcts and hhi are 0 when total is 0.
 */
export function computeAgingConcentration(
  buckets: Record<AgingBucket, number>,
): {
  current_pct: number
  overdue_pct: number
  critical_pct: number
  hhi: number
} {
  const total =
    (buckets.current     ?? 0) +
    (buckets['31_60']    ?? 0) +
    (buckets['61_90']    ?? 0) +
    (buckets['91_120']   ?? 0) +
    (buckets['120_plus'] ?? 0)

  if (total === 0) {
    return { current_pct: 0, overdue_pct: 0, critical_pct: 0, hhi: 0 }
  }

  const shares: Record<AgingBucket, number> = {
    current:    (buckets.current     ?? 0) / total,
    '31_60':    (buckets['31_60']    ?? 0) / total,
    '61_90':    (buckets['61_90']    ?? 0) / total,
    '91_120':   (buckets['91_120']   ?? 0) / total,
    '120_plus': (buckets['120_plus'] ?? 0) / total,
  }

  const current_pct  = shares.current * 100
  const overdue_pct  = (1 - shares.current) * 100
  const critical_pct = (shares['91_120'] + shares['120_plus']) * 100
  const hhi          = Object.values(shares).reduce((sum, s) => sum + (s * 100) ** 2, 0)

  return {
    current_pct:  Math.round(current_pct  * 10) / 10,
    overdue_pct:  Math.round(overdue_pct  * 10) / 10,
    critical_pct: Math.round(critical_pct * 10) / 10,
    hhi:          Math.round(hhi          * 10) / 10,
  }
}

/**
 * Compute expected recovery amount (probability-weighted sum).
 * = Σ (outstanding × probability / 100)
 */
export function computeExpectedRecovery(
  items: Array<{ outstanding: number; recovery_probability: number }>,
): number {
  return items.reduce((sum, item) => {
    return sum + item.outstanding * (item.recovery_probability / 100)
  }, 0)
}

/**
 * Classify write-off risk into high/medium/low buckets.
 *
 * high_risk:   120+ days outstanding
 * medium_risk: 91-120 days outstanding
 * low_risk:    31-90 days outstanding (31_60 + 61_90)
 * high_risk_pct: high_risk / (high + medium + low) × 100, null if total = 0
 */
export function computeWriteOffRisk(
  items: Array<{ outstanding: number; days_overdue: number }>,
): {
  high_risk_amount: number
  medium_risk_amount: number
  low_risk_amount: number
  high_risk_pct: number | null
} {
  let high   = 0
  let medium = 0
  let low    = 0

  for (const item of items) {
    const bucket = classifyAgingBucket(item.days_overdue)
    if (bucket === '120_plus') {
      high += item.outstanding
    } else if (bucket === '91_120') {
      medium += item.outstanding
    } else if (bucket === '31_60' || bucket === '61_90') {
      low += item.outstanding
    }
    // current → not at risk
  }

  const total = high + medium + low
  const high_risk_pct = total > 0 ? (high / total) * 100 : null

  return {
    high_risk_amount:   Math.round(high   * 100) / 100,
    medium_risk_amount: Math.round(medium * 100) / 100,
    low_risk_amount:    Math.round(low    * 100) / 100,
    high_risk_pct:      high_risk_pct !== null ? Math.round(high_risk_pct * 10) / 10 : null,
  }
}

/**
 * Compute Days Sales Outstanding (DSO) from aging buckets.
 * DSO = (total_outstanding / revenue_last_30d) × 30
 * Returns null if totalRevenueLast30Days === 0.
 */
export function computeDsoFromAging(
  agingBuckets: Record<AgingBucket, number>,
  totalRevenueLast30Days: number,
): number | null {
  if (totalRevenueLast30Days === 0) return null

  const total =
    (agingBuckets.current     ?? 0) +
    (agingBuckets['31_60']    ?? 0) +
    (agingBuckets['61_90']    ?? 0) +
    (agingBuckets['91_120']   ?? 0) +
    (agingBuckets['120_plus'] ?? 0)

  return Math.round((total / totalRevenueLast30Days) * 30 * 10) / 10
}

// ── Turkish action strings ────────────────────────────────────────────────────

const TURKISH_ACTIONS: Record<AgingBucket, string> = {
  current:    'Hatırlatma SMS/e-posta gönderin',
  '31_60':    'Telefon ile irtibata geçin',
  '61_90':    'Yazılı ihtar mektubu hazırlayın',
  '91_120':   'Hukuki süreç için ön hazırlık yapın',
  '120_plus': 'Avukata devredin veya tahkim başlatın',
}

// ── Internal raw row ──────────────────────────────────────────────────────────

interface RawOutstandingSale {
  customer_name: string | null
  total:         number | null
  paid_amount:   number | null
  sale_date:     string | null
  due_date:      string | null
}

// ── Service class ─────────────────────────────────────────────────────────────

export class CollectionsAgingService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<{
    aging_summary: {
      total_outstanding: number
      current: number
      overdue_31_60: number
      overdue_61_90: number
      overdue_91_120: number
      overdue_120_plus: number
      concentration: ReturnType<typeof computeAgingConcentration>
    }
    customer_aging: Array<{
      customer_name: string
      total_outstanding: number
      oldest_invoice_days: number
      bucket: AgingBucket
      recovery_probability: number
      priority_score: number
      invoice_count: number
    }>
    expected_recovery: number
    write_off_risk: ReturnType<typeof computeWriteOffRisk>
    dso: number | null
    top_priority_actions: Array<{
      customer_name: string
      amount: number
      days_overdue: number
      recommended_action: string
    }>
  }> {
    const today   = new Date()
    const todayMs = today.getTime()

    // ── Fetch outstanding sales ──────────────────────────────────────────────
    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_name, total, paid_amount, sale_date, due_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: true })
      .limit(3000)

    if (error) throw new Error(`CollectionsAgingService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawOutstandingSale[]

    // ── Fetch revenue last 30d (for DSO) ─────────────────────────────────────
    const cutoff30d = new Date(today)
    cutoff30d.setDate(cutoff30d.getDate() - 30)
    const cutoff30dStr = cutoff30d.toISOString().slice(0, 10)

    const { data: revenueData } = await this.supabase
      .from('sales')
      .select('total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .eq('payment_status', 'paid')
      .gte('sale_date', cutoff30dStr)
      .limit(5000)

    const revenueLast30d = ((revenueData ?? []) as Array<{ total: number | null }>)
      .reduce((s, r) => s + Number(r.total ?? 0), 0)

    // No-silent-truncation: warn if either capped query hit its row cap (the
    // outstanding aging totals / DSO denominator would then be understated).
    const truncWarn = aggregateTruncationWarning('collections-aging', [
      { name: 'outstanding_sales', count: rows.length,                cap: 3000 },
      { name: 'revenue_30d',       count: (revenueData ?? []).length, cap: 5000 },
    ])
    if (truncWarn) console.warn(truncWarn)

    // ── Per-sale aging computation ────────────────────────────────────────────

    interface SaleAged {
      outstanding:  number
      days_overdue: number
    }

    // Per-customer aggregation
    interface CustomerAgg {
      customer_name:    string
      invoices:         SaleAged[]
    }

    const customerMap = new Map<string, CustomerAgg>()

    for (const row of rows) {
      const name = (row.customer_name ?? 'Bilinmiyor').trim()
      const key  = name.toLowerCase()

      const total      = Number(row.total      ?? 0)
      const paid       = Number(row.paid_amount ?? 0)
      const outstanding = Math.max(0, total - paid)

      if (outstanding <= 0) continue

      // Compute days overdue
      let daysOverdue: number
      if (row.due_date) {
        const dueMs  = new Date(row.due_date.slice(0, 10)).getTime()
        daysOverdue  = Math.round((todayMs - dueMs) / 86_400_000)
      } else if (row.sale_date) {
        // Fallback: sale_date + 30d as implied due date
        const saleDueMs = new Date(row.sale_date.slice(0, 10)).getTime() + 30 * 86_400_000
        daysOverdue     = Math.round((todayMs - saleDueMs) / 86_400_000)
      } else {
        daysOverdue = 0
      }

      if (!customerMap.has(key)) {
        customerMap.set(key, { customer_name: name, invoices: [] })
      }
      customerMap.get(key)!.invoices.push({ outstanding, days_overdue: daysOverdue })
    }

    // ── Build customer-level aging items ──────────────────────────────────────

    const customerAging: Array<{
      customer_name:        string
      total_outstanding:    number
      oldest_invoice_days:  number
      bucket:               AgingBucket
      recovery_probability: number
      priority_score:       number
      invoice_count:        number
    }> = []

    const allSaleItems: SaleAged[] = []

    for (const [, agg] of customerMap) {
      const { invoices } = agg

      const total_outstanding = invoices.reduce((s, i) => s + i.outstanding, 0)
      const oldest_invoice_days = invoices.reduce((max, i) => Math.max(max, i.days_overdue), 0)

      const bucket = classifyAgingBucket(oldest_invoice_days)

      // Default payment history score = 50 (neutral)
      const recoveryProbability = computeRecoveryProbability(oldest_invoice_days, 50)

      const priorityScore = computeCollectionPriority(
        total_outstanding,
        recoveryProbability,
        oldest_invoice_days,
      )

      customerAging.push({
        customer_name:        agg.customer_name,
        total_outstanding:    Math.round(total_outstanding    * 100) / 100,
        oldest_invoice_days,
        bucket,
        recovery_probability: recoveryProbability,
        priority_score:       Math.round(priorityScore       * 100) / 100,
        invoice_count:        invoices.length,
      })

      for (const inv of invoices) {
        allSaleItems.push(inv)
      }
    }

    // Sort by priority_score descending
    customerAging.sort((a, b) => b.priority_score - a.priority_score)

    // ── Aging summary buckets ─────────────────────────────────────────────────

    const bucketAmounts: Record<AgingBucket, number> = {
      current:    0,
      '31_60':    0,
      '61_90':    0,
      '91_120':   0,
      '120_plus': 0,
    }

    for (const item of allSaleItems) {
      const b = classifyAgingBucket(item.days_overdue)
      bucketAmounts[b] += item.outstanding
    }

    const total_outstanding =
      bucketAmounts.current    +
      bucketAmounts['31_60']   +
      bucketAmounts['61_90']   +
      bucketAmounts['91_120']  +
      bucketAmounts['120_plus']

    const concentration = computeAgingConcentration(bucketAmounts)

    // ── Expected recovery ─────────────────────────────────────────────────────

    const expectedRecoveryItems = customerAging.map(c => ({
      outstanding:          c.total_outstanding,
      recovery_probability: c.recovery_probability,
    }))

    const expected_recovery = computeExpectedRecovery(expectedRecoveryItems)

    // ── Write-off risk ────────────────────────────────────────────────────────

    const writeOffItems = allSaleItems.map(i => ({
      outstanding:  i.outstanding,
      days_overdue: i.days_overdue,
    }))

    const write_off_risk = computeWriteOffRisk(writeOffItems)

    // ── DSO ───────────────────────────────────────────────────────────────────

    const dso = computeDsoFromAging(bucketAmounts, revenueLast30d)

    // ── Top priority actions (top 5) ──────────────────────────────────────────

    const top_priority_actions = customerAging.slice(0, 5).map(c => ({
      customer_name:      c.customer_name,
      amount:             c.total_outstanding,
      days_overdue:       c.oldest_invoice_days,
      recommended_action: TURKISH_ACTIONS[c.bucket],
    }))

    return {
      aging_summary: {
        total_outstanding:  Math.round(total_outstanding   * 100) / 100,
        current:            Math.round(bucketAmounts.current    * 100) / 100,
        overdue_31_60:      Math.round(bucketAmounts['31_60']   * 100) / 100,
        overdue_61_90:      Math.round(bucketAmounts['61_90']   * 100) / 100,
        overdue_91_120:     Math.round(bucketAmounts['91_120']  * 100) / 100,
        overdue_120_plus:   Math.round(bucketAmounts['120_plus']* 100) / 100,
        concentration,
      },
      customer_aging: customerAging,
      expected_recovery: Math.round(expected_recovery * 100) / 100,
      write_off_risk,
      dso,
      top_priority_actions,
    }
  }
}
