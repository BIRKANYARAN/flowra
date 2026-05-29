// ── RecurringRevenueService — MRR/ARR, NRR, GRR, Churn & Expansion ────────────
// Identifies recurring customers (Turkish SMEs transitioning to subscription-like
// revenue patterns) and computes key subscription metrics.
//
// Pure exported functions are fully testable without DB.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Identify customers considered "recurring" based on purchase patterns.
 * A customer is recurring if:
 *   purchase_count >= minMonthlyPurchases (min total purchases)
 *   AND months_with_purchases / total_months_active >= minRecurringRatio
 */
export function identifyRecurringCustomers(
  customers: Array<{
    customer_id: string
    purchase_count: number
    months_with_purchases: number
    total_months_active: number
  }>,
  minMonthlyPurchases = 2,
  minRecurringRatio = 0.5,
): string[] {
  return customers
    .filter(c => {
      if (c.purchase_count < minMonthlyPurchases) return false
      if (c.total_months_active === 0) return false
      const ratio = c.months_with_purchases / c.total_months_active
      return ratio >= minRecurringRatio
    })
    .map(c => c.customer_id)
}

/**
 * Compute MRR: sum of avg_monthly_revenue for all recurring customers.
 */
export function computeMrr(
  recurringCustomers: Array<{
    customer_id: string
    avg_monthly_revenue: number
  }>,
): number {
  return recurringCustomers.reduce((sum, c) => sum + c.avg_monthly_revenue, 0)
}

/**
 * Compute ARR: MRR × 12.
 */
export function computeArr(mrr: number): number {
  return mrr * 12
}

/**
 * Compute monthly churn rate as percentage.
 * Returns null if customersAtStartOfMonth === 0.
 */
export function computeChurnRate(
  customersLostThisMonth: number,
  customersAtStartOfMonth: number,
): number | null {
  if (customersAtStartOfMonth === 0) return null
  return (customersLostThisMonth / customersAtStartOfMonth) * 100
}

/**
 * Compute expansion revenue: sum of revenue increases for customers
 * whose current month revenue exceeds prior month.
 */
export function computeExpansionRevenue(
  customers: Array<{
    customer_id: string
    prior_month_revenue: number
    current_month_revenue: number
  }>,
): number {
  return customers.reduce((sum, c) => {
    if (c.current_month_revenue > c.prior_month_revenue) {
      return sum + (c.current_month_revenue - c.prior_month_revenue)
    }
    return sum
  }, 0)
}

/**
 * Compute contraction revenue: sum of absolute decreases for customers
 * whose current month revenue is less than prior month. Always positive.
 */
export function computeContractionRevenue(
  customers: Array<{
    customer_id: string
    prior_month_revenue: number
    current_month_revenue: number
  }>,
): number {
  return customers.reduce((sum, c) => {
    if (c.current_month_revenue < c.prior_month_revenue) {
      return sum + (c.prior_month_revenue - c.current_month_revenue)
    }
    return sum
  }, 0)
}

/**
 * Compute Net Revenue Retention (NRR).
 * NRR = (startingMrr + expansion - contraction - churned) / startingMrr × 100
 * > 100 = expanding (negative churn); < 100 = shrinking.
 * Returns null if startingMrr === 0.
 */
export function computeNetRevenueRetention(
  startingMrr: number,
  expansionRevenue: number,
  contractionRevenue: number,
  churnedRevenue: number,
): number | null {
  if (startingMrr === 0) return null
  return ((startingMrr + expansionRevenue - contractionRevenue - churnedRevenue) / startingMrr) * 100
}

/**
 * Compute Gross Revenue Retention (GRR).
 * GRR = (startingMrr - contraction - churned) / startingMrr × 100
 * Capped at 100% maximum.
 * Returns null if startingMrr === 0.
 */
export function computeGrossRevenueRetention(
  startingMrr: number,
  contractionRevenue: number,
  churnedRevenue: number,
): number | null {
  if (startingMrr === 0) return null
  const raw = ((startingMrr - contractionRevenue - churnedRevenue) / startingMrr) * 100
  return Math.min(100, raw)
}

/**
 * Classify NRR health.
 * insufficient_data: null
 * excellent: >= 120 (negative churn)
 * good: >= 100
 * neutral: >= 90
 * at_risk: >= 70
 * declining: < 70
 */
export function classifyNrrHealth(
  nrrPct: number | null,
): 'excellent' | 'good' | 'neutral' | 'at_risk' | 'declining' | 'insufficient_data' {
  if (nrrPct === null) return 'insufficient_data'
  if (nrrPct >= 120) return 'excellent'
  if (nrrPct >= 100) return 'good'
  if (nrrPct >= 90)  return 'neutral'
  if (nrrPct >= 70)  return 'at_risk'
  return 'declining'
}

/**
 * Compute recurring revenue ratio: what fraction of total monthly revenue
 * comes from recurring customers.
 * Returns null if totalMonthlyRevenue === 0.
 */
export function computeRecurringRevenueRatio(
  mrrTotal: number,
  totalMonthlyRevenue: number,
): number | null {
  if (totalMonthlyRevenue === 0) return null
  return (mrrTotal / totalMonthlyRevenue) * 100
}

// ── Internal types ────────────────────────────────────────────────────────────

interface RawSale {
  customer_id:   string | null
  customer_name: string | null
  sale_date:     string | null
  total:         number | null
}

/** Derive stable customer key */
function customerKey(row: RawSale): string | null {
  if (row.customer_id)   return `id:${row.customer_id}`
  if (row.customer_name) return `name:${row.customer_name}`
  return null
}

/** YYYY-MM-DD → YYYY-MM */
function toYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Offset a YYYY-MM by N months → YYYY-MM */
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Current YYYY-MM */
function currentYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ── Report shape ──────────────────────────────────────────────────────────────

export interface RecurringRevenueReport {
  mrr: number
  arr: number
  recurring_customer_count: number
  total_customer_count: number
  recurring_revenue_ratio_pct: number | null
  nrr_pct: number | null
  grr_pct: number | null
  nrr_health: ReturnType<typeof classifyNrrHealth>
  monthly_metrics: {
    expansion_revenue: number
    contraction_revenue: number
    churned_revenue: number
    new_mrr: number
  }
  top_recurring_customers: Array<{
    customer_id: string
    customer_name: string
    avg_monthly_revenue: number
    months_active: number
    is_expanding: boolean
  }>
}

// ── Service ───────────────────────────────────────────────────────────────────

export class RecurringRevenueService {
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<RecurringRevenueReport> {
    const todayYM    = currentYM()
    const cutoff6mYM = addMonths(todayYM, -6)
    const cutoffDate = `${cutoff6mYM}-01`

    // ── Fetch last 6 months of sales ──────────────────────────────────────
    const { data, error } = await this.supabase
      .from('sales')
      .select('customer_id, customer_name, sale_date, total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_proforma.is.null,is_proforma.eq.false')
      .gte('sale_date', cutoffDate)
      .order('sale_date', { ascending: true })

    if (error) throw new Error(`RecurringRevenueService.getReport: ${error.message}`)

    const rows = (data ?? []) as RawSale[]

    if (rows.length === 0) {
      return buildEmptyReport()
    }

    // ── Build per-customer month-revenue map ──────────────────────────────
    // monthRevMap[customerKey][YYYY-MM] = sum revenue
    const monthRevMap = new Map<string, Map<string, number>>()
    const nameMap     = new Map<string, string>() // key → display name
    const idMap       = new Map<string, string>() // key → customer_id

    for (const row of rows) {
      if (!row.sale_date) continue
      const key = customerKey(row)
      if (!key) continue

      const ym  = toYearMonth(row.sale_date)
      const amt = Number(row.total ?? 0)

      if (!monthRevMap.has(key)) {
        monthRevMap.set(key, new Map())
        nameMap.set(key, row.customer_name ?? row.customer_id ?? 'Bilinmiyor')
        if (row.customer_id) idMap.set(key, row.customer_id)
      }
      const mm = monthRevMap.get(key)!
      mm.set(ym, (mm.get(ym) ?? 0) + amt)
    }

    // ── Determine analysis window months (last 6 months including current) ─
    const allMonths: string[] = []
    for (let i = 5; i >= 0; i--) {
      allMonths.push(addMonths(todayYM, -i))
    }
    const currentMonth = allMonths[allMonths.length - 1]
    const priorMonth   = allMonths[allMonths.length - 2]

    // ── Per-customer stats ────────────────────────────────────────────────
    interface CustomerStats {
      key: string
      customer_id: string
      purchase_count: number        // total purchase events (months with purchase)
      months_with_purchases: number
      total_months_active: number   // months in analysis window with any purchase
      avg_monthly_revenue: number
      current_month_revenue: number
      prior_month_revenue: number
    }

    const statsList: CustomerStats[] = []

    for (const [key, mm] of monthRevMap) {
      const monthsWithPurchases = mm.size
      const purchaseCount       = mm.size  // each month = 1 purchase event for recurring check
      const totalMonthsActive   = allMonths.filter(m => mm.has(m)).length || mm.size

      const totalRevenue = Array.from(mm.values()).reduce((s, v) => s + v, 0)
      const avgMonthlyRev = totalMonthsActive > 0 ? totalRevenue / totalMonthsActive : 0

      statsList.push({
        key,
        customer_id:           key,
        purchase_count:        purchaseCount,
        months_with_purchases: monthsWithPurchases,
        total_months_active:   Math.max(1, totalMonthsActive),
        avg_monthly_revenue:   avgMonthlyRev,
        current_month_revenue: mm.get(currentMonth) ?? 0,
        prior_month_revenue:   mm.get(priorMonth)   ?? 0,
      })
    }

    // ── Identify recurring customers ──────────────────────────────────────
    const recurringKeys = new Set(
      identifyRecurringCustomers(
        statsList.map(s => ({
          customer_id:         s.key,
          purchase_count:      s.purchase_count,
          months_with_purchases: s.months_with_purchases,
          total_months_active: s.total_months_active,
        })),
      ),
    )

    const recurringStats = statsList.filter(s => recurringKeys.has(s.key))

    // ── MRR / ARR ─────────────────────────────────────────────────────────
    const mrr = computeMrr(
      recurringStats.map(s => ({ customer_id: s.key, avg_monthly_revenue: s.avg_monthly_revenue })),
    )
    const arr = computeArr(mrr)

    // ── Total monthly revenue (current month, all customers) ──────────────
    const totalCurrentMonthRevenue = statsList.reduce(
      (sum, s) => sum + s.current_month_revenue, 0,
    )

    // ── Recurring revenue ratio ───────────────────────────────────────────
    const recurringCurrentRev = recurringStats.reduce(
      (sum, s) => sum + s.current_month_revenue, 0,
    )
    const recurringRevenueRatioPct = computeRecurringRevenueRatio(
      recurringCurrentRev,
      totalCurrentMonthRevenue,
    )

    // ── Churn / expansion / contraction ──────────────────────────────────
    // Customers active in prior month
    const priorCustomers  = statsList.filter(s => s.prior_month_revenue > 0)
    const currentCustomers = statsList.filter(s => s.current_month_revenue > 0)

    const priorKeys   = new Set(priorCustomers.map(s => s.key))
    const currentKeys = new Set(currentCustomers.map(s => s.key))

    // Churned = had revenue in prior month, zero in current
    const churnedStats   = priorCustomers.filter(s => !currentKeys.has(s.key))
    const churnedRevenue = churnedStats.reduce((sum, s) => sum + s.prior_month_revenue, 0)

    // New = revenue in current month but no prior month revenue
    const newStats = currentCustomers.filter(s => !priorKeys.has(s.key))
    const newMrr   = newStats.reduce((sum, s) => sum + s.current_month_revenue, 0)

    // Existing = in both months
    const existingStats = statsList.filter(
      s => s.prior_month_revenue > 0 && s.current_month_revenue > 0,
    )

    const expansionRevenue   = computeExpansionRevenue(existingStats)
    const contractionRevenue = computeContractionRevenue(existingStats)

    // ── NRR / GRR ─────────────────────────────────────────────────────────
    const startingMrr = priorCustomers.reduce((sum, s) => sum + s.prior_month_revenue, 0)
    const nrrPct = computeNetRevenueRetention(startingMrr, expansionRevenue, contractionRevenue, churnedRevenue)
    const grrPct = computeGrossRevenueRetention(startingMrr, contractionRevenue, churnedRevenue)
    const nrrHealth = classifyNrrHealth(nrrPct)

    // ── Top recurring customers ───────────────────────────────────────────
    const topRecurring = recurringStats
      .sort((a, b) => b.avg_monthly_revenue - a.avg_monthly_revenue)
      .slice(0, 10)
      .map(s => ({
        customer_id:         idMap.get(s.key) ?? s.key,
        customer_name:       nameMap.get(s.key) ?? 'Bilinmiyor',
        avg_monthly_revenue: Math.round(s.avg_monthly_revenue),
        months_active:       s.months_with_purchases,
        is_expanding:        s.current_month_revenue > s.prior_month_revenue,
      }))

    return {
      mrr:                          Math.round(mrr),
      arr:                          Math.round(arr),
      recurring_customer_count:     recurringStats.length,
      total_customer_count:         statsList.length,
      recurring_revenue_ratio_pct:  recurringRevenueRatioPct,
      nrr_pct:                      nrrPct !== null ? Math.round(nrrPct * 10) / 10 : null,
      grr_pct:                      grrPct !== null ? Math.round(grrPct * 10) / 10 : null,
      nrr_health:                   nrrHealth,
      monthly_metrics: {
        expansion_revenue:   Math.round(expansionRevenue),
        contraction_revenue: Math.round(contractionRevenue),
        churned_revenue:     Math.round(churnedRevenue),
        new_mrr:             Math.round(newMrr),
      },
      top_recurring_customers: topRecurring,
    }
  }
}

// ── Empty report helper ───────────────────────────────────────────────────────

function buildEmptyReport(): RecurringRevenueReport {
  return {
    mrr:                         0,
    arr:                         0,
    recurring_customer_count:    0,
    total_customer_count:        0,
    recurring_revenue_ratio_pct: null,
    nrr_pct:                     null,
    grr_pct:                     null,
    nrr_health:                  'insufficient_data',
    monthly_metrics: {
      expansion_revenue:   0,
      contraction_revenue: 0,
      churned_revenue:     0,
      new_mrr:             0,
    },
    top_recurring_customers: [],
  }
}
