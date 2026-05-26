// ── RevenueAttributionService — What and who is driving revenue ────────────────
// Answers: which customers and products are generating revenue,
// and how concentrated / exposed are we to a few sources.
//
// Pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevenueContributor {
  name: string
  total_try: number
  pct_of_total: number      // × 100
  transaction_count: number
  avg_transaction_try: number | null
  trend: 'growing' | 'stable' | 'declining' | 'new'
    // compare last 30d vs prior 30d: growing>10%, declining<-10%, new=no prior, stable otherwise
  rank: number
}

export interface RevenueAttributionReport {
  period_days: number           // 90
  total_revenue_try: number

  by_customer: RevenueContributor[]      // top 10
  by_product: RevenueContributor[]       // top 10
  by_expense_type: Array<{              // expense breakdown (not revenue, but for context)
    expense_type: string
    label: string
    total_try: number
    pct_of_revenue: number
  }>

  // Concentration metrics
  top3_customer_pct: number | null      // top 3 customers as % of total revenue
  top3_product_pct: number | null       // top 3 products as % of total revenue
  new_customer_revenue_try: number      // revenue from customers new in the period
  returning_customer_revenue_try: number

  as_of_date: string
}

// ── Raw DB rows ────────────────────────────────────────────────────────────────

interface SaleRow {
  customer_name: string | null
  total:         number | null
  sale_date:     string | null
}

interface SaleItemRow {
  product_name: string | null
  total_try:    number | null
  sale_id:      string | null
}

interface SaleItemWithDate extends SaleItemRow {
  sale_date: string | null
}

interface ExpenseRow {
  expense_type: string | null
  total_try:    number | null
}

// ── Expense type label map ─────────────────────────────────────────────────────

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  rent:          'Kira',
  salary:        'Maaş',
  utilities:     'Faturalar',
  marketing:     'Pazarlama',
  office:        'Ofis',
  travel:        'Seyahat',
  software:      'Yazılım',
  insurance:     'Sigorta',
  tax:           'Vergi',
  maintenance:   'Bakım',
  supplies:      'Malzeme',
  professional:  'Profesyonel Hizmet',
  other:         'Diğer',
}

function expenseLabel(type: string): string {
  return EXPENSE_TYPE_LABELS[type] ?? type
}

// ── Pure helpers (exported for testing) ──────────────────────────────────────

/**
 * computeTrend
 * Compares current 30-day revenue vs prior 30-day revenue.
 * - new:      prior30d === 0 AND current30d > 0
 * - growing:  change > +10%
 * - declining: change < -10%
 * - stable:   otherwise
 */
export function computeTrend(
  current30d: number,
  prior30d: number,
): RevenueContributor['trend'] {
  if (prior30d === 0 && current30d > 0) return 'new'
  if (prior30d === 0) return 'stable'
  const changePct = ((current30d - prior30d) / prior30d) * 100
  if (changePct > 10)  return 'growing'
  if (changePct < -10) return 'declining'
  return 'stable'
}

/**
 * computeConcentrationPct
 * Returns the combined pct_of_total of the top 3 contributors.
 * Returns null if the array is empty.
 */
export function computeConcentrationPct(top3: RevenueContributor[]): number | null {
  if (top3.length === 0) return null
  const slice = top3.slice(0, 3)
  return slice.reduce((sum, c) => sum + c.pct_of_total, 0)
}

/**
 * rankAndSort
 * Sorts contributors descending by total_try and assigns rank 1, 2, 3…
 */
export function rankAndSort(
  contributors: Omit<RevenueContributor, 'rank'>[],
): RevenueContributor[] {
  return [...contributors]
    .sort((a, b) => b.total_try - a.total_try)
    .map((c, idx) => ({ ...c, rank: idx + 1 }))
}

// ── Internal aggregation helpers ──────────────────────────────────────────────

function isoDateOffset(today: string, daysBack: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

// ── Service ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any>

export class RevenueAttributionService {
  static async getReport(
    companyId: string,
    supabase: AnySupabase,
    opts?: { today?: string },
  ): Promise<RevenueAttributionReport> {
    const today   = opts?.today ?? new Date().toISOString().slice(0, 10)
    const from90  = isoDateOffset(today, 90)
    const from60  = isoDateOffset(today, 60)   // prior 30d window start
    const from30  = isoDateOffset(today, 30)   // current 30d window start

    // ── 1. Sales (90d) ────────────────────────────────────────────────────────
    const { data: salesData, error: salesErr } = await supabase
      .from('sales')
      .select('customer_name, total:total, sale_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or('is_proforma.is.null,is_proforma.eq.false')
      .gte('sale_date', from90)
      .lte('sale_date', today)

    if (salesErr) throw new Error(`RevenueAttributionService: ${salesErr.message}`)

    const sales = (salesData ?? []) as SaleRow[]

    // ── 2. Sale items joined with sale dates (for product attribution) ────────
    // We join sale_items → sales to get sale_date for window slicing.
    // If this fails (table missing / RLS), we gracefully use empty array.
    let saleItemsWithDates: SaleItemWithDate[] = []
    try {
      const { data: itemsData, error: itemsErr } = await supabase
        .from('sale_items')
        .select('product_name, line_total, sale_id, sales!inner(sale_date, deleted_at, is_proforma, company_id)')
        .eq('sales.company_id', companyId)
        .is('sales.deleted_at', null)
        .or('sales.is_proforma.is.null,sales.is_proforma.eq.false')
        .gte('sales.sale_date', from90)
        .lte('sales.sale_date', today)

      if (!itemsErr && itemsData) {
        saleItemsWithDates = (itemsData as Array<{
          product_name: string | null
          line_total:   number | null
          sale_id:      string | null
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sales:        any
        }>).map(r => ({
          product_name: r.product_name,
          total_try:    r.line_total,
          sale_id:      r.sale_id,
          sale_date:    r.sales?.sale_date ?? null,
        }))
      }
    } catch {
      // Graceful fallback — product attribution unavailable
      saleItemsWithDates = []
    }

    // ── 3. Expenses (90d) ─────────────────────────────────────────────────────
    let expenseRows: ExpenseRow[] = []
    try {
      const { data: expData, error: expErr } = await supabase
        .from('expenses')
        .select('expense_type, total_try:amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', from90)
        .lte('expense_date', today)

      if (!expErr && expData) {
        expenseRows = expData as ExpenseRow[]
      }
    } catch {
      expenseRows = []
    }

    // ── 4. Aggregate customers ────────────────────────────────────────────────
    // Maps: name → { total90d, count90d, total30d (last), total30d_prior }
    const custMap = new Map<string, {
      total90d:  number
      count90d:  number
      total30d:  number   // last 30 days (current window)
      prior30d:  number   // days 31-60 (prior window)
    }>()

    for (const row of sales) {
      const name = row.customer_name?.trim() || 'Bilinmeyen Müşteri'
      const val  = Number(row.total ?? 0)
      const date = row.sale_date ?? ''

      if (!custMap.has(name)) {
        custMap.set(name, { total90d: 0, count90d: 0, total30d: 0, prior30d: 0 })
      }
      const entry = custMap.get(name)!
      entry.total90d += val
      entry.count90d += 1
      if (date >= from30)  entry.total30d  += val
      else if (date >= from60) entry.prior30d += val
    }

    const totalRevenue = Array.from(custMap.values()).reduce((s, v) => s + v.total90d, 0)

    const custContributorsRaw: Omit<RevenueContributor, 'rank'>[] = Array.from(custMap.entries()).map(
      ([name, v]) => ({
        name,
        total_try:           v.total90d,
        pct_of_total:        totalRevenue > 0 ? (v.total90d / totalRevenue) * 100 : 0,
        transaction_count:   v.count90d,
        avg_transaction_try: v.count90d > 0 ? v.total90d / v.count90d : null,
        trend:               computeTrend(v.total30d, v.prior30d),
      }),
    )

    const by_customer = rankAndSort(custContributorsRaw).slice(0, 10)

    // ── 5. Aggregate products ─────────────────────────────────────────────────
    let by_product: RevenueContributor[] = []

    if (saleItemsWithDates.length > 0) {
      const prodMap = new Map<string, {
        total90d: number
        count90d: number
        total30d: number
        prior30d: number
      }>()

      for (const item of saleItemsWithDates) {
        const name = item.product_name?.trim() || 'Bilinmeyen Ürün'
        const val  = Number(item.total_try ?? 0)
        const date = item.sale_date ?? ''

        if (!prodMap.has(name)) {
          prodMap.set(name, { total90d: 0, count90d: 0, total30d: 0, prior30d: 0 })
        }
        const entry = prodMap.get(name)!
        entry.total90d += val
        entry.count90d += 1
        if (date >= from30)      entry.total30d  += val
        else if (date >= from60) entry.prior30d  += val
      }

      const prodTotal = Array.from(prodMap.values()).reduce((s, v) => s + v.total90d, 0)

      const prodRaw: Omit<RevenueContributor, 'rank'>[] = Array.from(prodMap.entries()).map(
        ([name, v]) => ({
          name,
          total_try:           v.total90d,
          pct_of_total:        prodTotal > 0 ? (v.total90d / prodTotal) * 100 : 0,
          transaction_count:   v.count90d,
          avg_transaction_try: v.count90d > 0 ? v.total90d / v.count90d : null,
          trend:               computeTrend(v.total30d, v.prior30d),
        }),
      )

      by_product = rankAndSort(prodRaw).slice(0, 10)
    }

    // ── 6. Aggregate expenses ─────────────────────────────────────────────────
    const expMap = new Map<string, number>()
    for (const row of expenseRows) {
      const t = row.expense_type?.trim() || 'other'
      expMap.set(t, (expMap.get(t) ?? 0) + Number(row.total_try ?? 0))
    }

    const by_expense_type = Array.from(expMap.entries())
      .map(([expense_type, total_try]) => ({
        expense_type,
        label:          expenseLabel(expense_type),
        total_try,
        pct_of_revenue: totalRevenue > 0 ? (total_try / totalRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.total_try - a.total_try)

    // ── 7. Concentration metrics ──────────────────────────────────────────────
    const top3_customer_pct = computeConcentrationPct(by_customer)
    const top3_product_pct  = computeConcentrationPct(by_product)

    // ── 8. New vs returning customers ─────────────────────────────────────────
    // A customer is "new" if their first-ever sale falls within the 90d window.
    // We check this by looking at ALL historical sales (not just 90d).
    // For efficiency: first_seen = earliest sale_date in our 90d data per customer.
    // If we detect they have sales before from90 → returning.
    // This is approximate (bounded by our 90d window), so we also query pre-90d.

    // Determine which customers in our window had any sales before from90
    const custNamesInPeriod = Array.from(custMap.keys())
    let returningCustomerNames = new Set<string>()

    if (custNamesInPeriod.length > 0) {
      try {
        const { data: preData } = await supabase
          .from('sales')
          .select('customer_name')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .or('is_proforma.is.null,is_proforma.eq.false')
          .lt('sale_date', from90)
          .in('customer_name', custNamesInPeriod)

        for (const row of (preData ?? []) as Array<{ customer_name: string | null }>) {
          const name = row.customer_name?.trim() || 'Bilinmeyen Müşteri'
          returningCustomerNames.add(name)
        }
      } catch {
        // If query fails, treat all as returning (safe fallback)
        returningCustomerNames = new Set(custNamesInPeriod)
      }
    }

    let new_customer_revenue_try       = 0
    let returning_customer_revenue_try = 0
    for (const [name, v] of custMap.entries()) {
      if (returningCustomerNames.has(name)) {
        returning_customer_revenue_try += v.total90d
      } else {
        new_customer_revenue_try += v.total90d
      }
    }

    return {
      period_days:    90,
      total_revenue_try: totalRevenue,

      by_customer,
      by_product,
      by_expense_type,

      top3_customer_pct,
      top3_product_pct,
      new_customer_revenue_try,
      returning_customer_revenue_try,

      as_of_date: today,
    }
  }
}
