// ── ReceivablesAgingEnhancedService — Extended Receivables Aging Analysis ──────
// Extends the basic collections-aging service with:
//   - Customer-level aging detail with 5 buckets (current/30-60/60-90/90+)
//   - DSO portfolio + 6-month trend
//   - Collection efficiency tracking
//   - Recovery probability scoring (age + history + overdue ratio)
//   - Bad debt provision (IFRS-style tiered provisioning)
//   - Concentration risk (HHI) and weighted age
//   - Turkish narrative summary
//
// All pure helpers are exported for unit testing.

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Public interfaces ─────────────────────────────────────────────────────────

export interface CustomerAgingDetail {
  customer_id: string | null
  customer_name: string
  total_outstanding: number
  current_outstanding: number     // 0-30 days
  days_30_60: number
  days_60_90: number
  days_90_plus: number
  oldest_invoice_days: number
  invoice_count: number
  avg_days_outstanding: number
  recovery_probability_pct: number  // estimated % likely to collect
  risk_tier: 'low' | 'medium' | 'high' | 'critical'
}

export interface DSOTrend {
  year_month: string
  dso_days: number | null
  revenue: number
  collected: number
  collection_rate_pct: number | null
}

export interface ReceivablesAgingEnhancedReport {
  as_of_date: string
  total_outstanding: number
  current_outstanding: number      // 0-30 days
  overdue_total: number            // 30+ days
  days_90_plus: number
  customer_details: CustomerAgingDetail[]
  dso_portfolio: number | null
  dso_trend: DSOTrend[]           // last 6 months
  collection_efficiency_pct: number | null
  bad_debt_provision: number
  concentration_hhi: number
  aging_health: ReturnType<typeof classifyAgingHealth>
  weighted_age_days: number | null
  critical_customer_count: number
  narrative: string
}

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute recovery probability (0-100) based on:
 *   1. Age of oldest invoice (base rate)
 *   2. Payment history score 0-100 (null = no adjustment)
 *   3. Overdue ratio 0-1 (fraction of customer AR that is overdue)
 *
 * Base rates:
 *   <= 30d: 95%  <= 60d: 85%  <= 90d: 70%
 *   <= 180d: 50%  <= 365d: 30%  > 365d: 10%
 *
 * History adjustments:
 *   >= 80: +5pp  >= 60: 0pp  >= 40: -5pp  < 40: -10pp
 *
 * Overdue ratio adjustments:
 *   <= 0.3: 0pp  <= 0.6: -5pp  > 0.6: -10pp
 *
 * Final: clamp [5, 100]
 */
export function computeRecoveryProbability(
  oldestInvoiceDays: number,
  paymentHistoryScore: number | null,  // 0-100, null if no history
  overdueRatio: number,                // 0-1
): number {
  // Base rate from age
  let base: number
  if (oldestInvoiceDays <= 30)  base = 95
  else if (oldestInvoiceDays <= 60)  base = 85
  else if (oldestInvoiceDays <= 90)  base = 70
  else if (oldestInvoiceDays <= 180) base = 50
  else if (oldestInvoiceDays <= 365) base = 30
  else                               base = 10

  // Payment history adjustment
  let historyAdj = 0
  if (paymentHistoryScore !== null) {
    if (paymentHistoryScore >= 80)      historyAdj =  5
    else if (paymentHistoryScore >= 60) historyAdj =  0
    else if (paymentHistoryScore >= 40) historyAdj = -5
    else                                historyAdj = -10
  }

  // Overdue ratio adjustment
  let ratioAdj = 0
  if (overdueRatio <= 0.3)       ratioAdj =   0
  else if (overdueRatio <= 0.6)  ratioAdj =  -5
  else                           ratioAdj = -10

  const raw = base + historyAdj + ratioAdj
  return Math.min(100, Math.max(5, Math.round(raw)))
}

/**
 * Classify a customer into a risk tier.
 *
 * Priority (checked in order):
 *   critical: oldestInvoiceDays > 180 OR recoveryProbabilityPct < 40
 *   high:     oldestInvoiceDays > 90  OR recoveryProbabilityPct < 60
 *   medium:   oldestInvoiceDays > 30  OR totalOutstanding > 50000
 *   low:      otherwise
 */
export function classifyCustomerRiskTier(
  oldestInvoiceDays: number,
  totalOutstanding: number,
  recoveryProbabilityPct: number,
): 'low' | 'medium' | 'high' | 'critical' {
  if (oldestInvoiceDays > 180 || recoveryProbabilityPct < 40) return 'critical'
  if (oldestInvoiceDays > 90  || recoveryProbabilityPct < 60) return 'high'
  if (oldestInvoiceDays > 30  || totalOutstanding > 50_000)   return 'medium'
  return 'low'
}

/**
 * Compute customer-level DSO.
 * = totalOutstanding / avgDailyRevenue
 * Returns null if avgDailyRevenue === 0.
 */
export function computeCustomerDso(
  totalOutstanding: number,
  avgDailyRevenue: number,  // revenue / 30
): number | null {
  if (avgDailyRevenue === 0) return null
  return totalOutstanding / avgDailyRevenue
}

/**
 * Compute portfolio-level DSO.
 * = totalOutstanding / (last30DayRevenue / 30)
 * Returns null if last30DayRevenue === 0.
 */
export function computePortfolioDso(
  totalOutstanding: number,
  last30DayRevenue: number,
): number | null {
  if (last30DayRevenue === 0) return null
  return totalOutstanding / (last30DayRevenue / 30)
}

/**
 * Compute collection efficiency as a percentage.
 * = (collected / previousOutstanding) × 100
 * Returns null if previousOutstanding === 0.
 */
export function computeCollectionEfficiency(
  collected: number,
  previousOutstanding: number,
): number | null {
  if (previousOutstanding === 0) return null
  return (collected / previousOutstanding) * 100
}

/**
 * Compute bad debt provision using tiered provision rates.
 * = Σ(bucket × rate)
 */
export function computeBadDebtProvision(
  agingBuckets: {
    current: number      // 0-30 days outstanding
    days_30_60: number
    days_60_90: number
    days_90_180: number
    days_180_plus: number
  },
  provisionRates: {
    current: number       // default 0.01 (1%)
    days_30_60: number    // default 0.05 (5%)
    days_60_90: number    // default 0.15 (15%)
    days_90_180: number   // default 0.30 (30%)
    days_180_plus: number // default 0.60 (60%)
  },
): number {
  return (
    agingBuckets.current      * provisionRates.current      +
    agingBuckets.days_30_60   * provisionRates.days_30_60   +
    agingBuckets.days_60_90   * provisionRates.days_60_90   +
    agingBuckets.days_90_180  * provisionRates.days_90_180  +
    agingBuckets.days_180_plus * provisionRates.days_180_plus
  )
}

/**
 * Compute Herfindahl-Hirschman Index of receivables concentration.
 * HHI = Σ(outstanding_i / total)²
 * Returns 0 if total === 0.
 */
export function computeConcentrationRisk(
  customerOutstandings: Array<{ customer_id: string | null; outstanding: number }>,
  totalOutstanding: number,
): number {
  if (totalOutstanding === 0) return 0
  return customerOutstandings.reduce((sum, c) => {
    const share = c.outstanding / totalOutstanding
    return sum + share * share
  }, 0)
}

/**
 * Classify aging portfolio health.
 *
 * Priority (checked in order):
 *   critical: current90DayRatio > 40 OR dso > 120
 *   concern:  current90DayRatio > 20 OR dso > 90
 *   watch:    current90DayRatio > 10 OR dso > 60
 *   healthy:  otherwise (including null dso)
 */
export function classifyAgingHealth(
  current90DayRatio: number,  // (days_90_plus / total) × 100
  dso: number | null,
  collectionEfficiencyPct: number | null,
): 'healthy' | 'watch' | 'concern' | 'critical' {
  if (current90DayRatio > 40 || (dso !== null && dso > 120)) return 'critical'
  if (current90DayRatio > 20 || (dso !== null && dso > 90))  return 'concern'
  if (current90DayRatio > 10 || (dso !== null && dso > 60))  return 'watch'
  return 'healthy'
}

/**
 * Compute weighted average age of receivables.
 * = Σ(midpoint × amount) / Σ(amount)
 * Returns null if total amount = 0.
 *
 * Standard midpoints:
 *   current=15, 30-60=45, 60-90=75, 90-180=135, 180-365=270, 365+=450
 */
export function computeWeightedAgeDays(
  buckets: Array<{ midpoint_days: number; amount: number }>,
): number | null {
  const totalAmount = buckets.reduce((s, b) => s + b.amount, 0)
  if (totalAmount === 0) return null
  const weightedSum = buckets.reduce((s, b) => s + b.midpoint_days * b.amount, 0)
  return weightedSum / totalAmount
}

/**
 * Estimate months to collect outstanding balance.
 * Simulates month-by-month reduction until outstanding < 1000 or 36 months.
 * Returns null if rate <= 0, rate >= 1, or outstanding <= 0.
 * Capped at 36 months.
 */
export function estimateCollectionTimeline(
  outstanding: number,
  avgMonthlyCollectionRate: number,  // 0-1, fraction collected per month
): number | null {
  if (avgMonthlyCollectionRate <= 0 || avgMonthlyCollectionRate >= 1 || outstanding <= 0) {
    return null
  }

  let remaining = outstanding
  let months = 0

  while (remaining >= 1000 && months < 36) {
    remaining = remaining * (1 - avgMonthlyCollectionRate)
    months++
  }

  return months
}

/**
 * Generate a Turkish narrative summary of the aging portfolio health.
 */
export function generateAgingNarrative(
  health: ReturnType<typeof classifyAgingHealth>,
  dso: number | null,
  overdueAmount: number,
  badDebtProvision: number,
  criticalCustomerCount: number,
): string {
  const provision = Math.round(badDebtProvision).toLocaleString('tr-TR')
  const overdue   = Math.round(overdueAmount).toLocaleString('tr-TR')

  switch (health) {
    case 'healthy':
      return 'Alacak tahsilat süreci sağlıklı — DSO hedef seviyelerde.'
    case 'watch':
      return `DSO ${dso} gün — takip gerektiren alacaklar mevcut.`
    case 'concern':
      return `₺${overdue}₺ tutarında vadesi geçmiş alacak — aksiyona geçilmeli.`
    case 'critical':
      return `Kritik: ${criticalCustomerCount} müşteride tahsilat riski — ₺${provision}₺ karşılık önerilir.`
  }
}

// ── Internal raw row types ────────────────────────────────────────────────────

interface RawOutstandingSale {
  customer_id:   string | null
  customer_name: string | null
  total:         number | null
  paid_amount:   number | null
  sale_date:     string | null
  due_date:      string | null
}

interface RawMonthlySale {
  year_month: string
  revenue: number
  collected: number
}

// ── Service class ─────────────────────────────────────────────────────────────

export class ReceivablesAgingEnhancedService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async getReport(companyId: string): Promise<ReceivablesAgingEnhancedReport> {
    const today    = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const todayMs  = today.getTime()

    // ── Date range helpers ───────────────────────────────────────────────────
    const cutoff30d = new Date(today)
    cutoff30d.setDate(cutoff30d.getDate() - 30)
    const cutoff30dStr = cutoff30d.toISOString().slice(0, 10)

    const cutoff6m = new Date(today)
    cutoff6m.setMonth(cutoff6m.getMonth() - 6)
    const cutoff6mStr = cutoff6m.toISOString().slice(0, 10)

    // Prior month range (for collection efficiency denominator)
    const priorMonthStart = new Date(today)
    priorMonthStart.setMonth(priorMonthStart.getMonth() - 2)
    priorMonthStart.setDate(1)
    const priorMonthEnd = new Date(today)
    priorMonthEnd.setDate(0) // last day of prior month
    const priorMonthStartStr = priorMonthStart.toISOString().slice(0, 10)
    const priorMonthEndStr   = priorMonthEnd.toISOString().slice(0, 10)

    // ── Fetch data concurrently ──────────────────────────────────────────────

    const [
      outstandingResult,
      last30dRevenueResult,
      monthlyResult,
      priorOutstandingResult,
    ] = await Promise.allSettled([
      // 1. Outstanding receivables (unpaid / partial / overdue)
      this.supabase
        .from('sales')
        .select('customer_id, customer_name, total, paid_amount, sale_date, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'paid')
        .order('sale_date', { ascending: true })
        .limit(5000),

      // 2. Last 30-day revenue (all sales) for DSO denominator
      this.supabase
        .from('sales')
        .select('total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', cutoff30dStr)
        .limit(5000),

      // 3. Last 6 months of sales grouped by month (for DSO trend)
      this.supabase
        .from('sales')
        .select('sale_date, total, paid_amount, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', cutoff6mStr)
        .order('sale_date', { ascending: true })
        .limit(10000),

      // 4. Prior month outstanding (for collection efficiency)
      this.supabase
        .from('sales')
        .select('total, paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'paid')
        .gte('sale_date', priorMonthStartStr)
        .lte('sale_date', priorMonthEndStr)
        .limit(5000),
    ])

    // ── Extract data with fallbacks ──────────────────────────────────────────

    const outstandingRows: RawOutstandingSale[] =
      outstandingResult.status === 'fulfilled'
        ? ((outstandingResult.value.data ?? []) as RawOutstandingSale[])
        : []

    const last30dRevenue: number =
      last30dRevenueResult.status === 'fulfilled'
        ? ((last30dRevenueResult.value.data ?? []) as Array<{ total: number | null }>)
            .reduce((s, r) => s + Number(r.total ?? 0), 0)
        : 0

    const monthlyRawRows: Array<{
      sale_date: string | null
      total: number | null
      paid_amount: number | null
      payment_status: string | null
    }> =
      monthlyResult.status === 'fulfilled'
        ? ((monthlyResult.value.data ?? []) as Array<{
            sale_date: string | null
            total: number | null
            paid_amount: number | null
            payment_status: string | null
          }>)
        : []

    const priorOutstandingAmount: number =
      priorOutstandingResult.status === 'fulfilled'
        ? ((priorOutstandingResult.value.data ?? []) as Array<{
            total: number | null
            paid_amount: number | null
          }>)
            .reduce((s, r) => {
              const t = Number(r.total ?? 0)
              const p = Number(r.paid_amount ?? 0)
              return s + Math.max(0, t - p)
            }, 0)
        : 0

    // ── Build customer-level aging aggregation ────────────────────────────────

    interface CustomerAgg {
      customer_id:   string | null
      customer_name: string
      invoices: Array<{ outstanding: number; daysOld: number }>
    }

    const customerMap = new Map<string, CustomerAgg>()

    for (const row of outstandingRows) {
      const name = (row.customer_name ?? 'Bilinmiyor').trim()
      const key  = (row.customer_id ?? name).toLowerCase()

      const total       = Number(row.total ?? 0)
      const paid        = Number(row.paid_amount ?? 0)
      const outstanding = Math.max(0, total - paid)
      if (outstanding <= 0) continue

      // Days since invoice / due date
      let daysOld: number
      if (row.due_date) {
        const dueMs = new Date(row.due_date.slice(0, 10)).getTime()
        daysOld     = Math.round((todayMs - dueMs) / 86_400_000)
      } else if (row.sale_date) {
        const saleDueMs = new Date(row.sale_date.slice(0, 10)).getTime() + 30 * 86_400_000
        daysOld         = Math.round((todayMs - saleDueMs) / 86_400_000)
      } else {
        daysOld = 0
      }
      if (daysOld < 0) daysOld = 0

      if (!customerMap.has(key)) {
        customerMap.set(key, {
          customer_id:   row.customer_id ?? null,
          customer_name: name,
          invoices:      [],
        })
      }
      customerMap.get(key)!.invoices.push({ outstanding, daysOld })
    }

    // ── Compute customer details ──────────────────────────────────────────────

    const customerDetails: CustomerAgingDetail[] = []

    let portfolioCurrent    = 0
    let portfolio30_60      = 0
    let portfolio60_90      = 0
    let portfolio90_180     = 0
    let portfolio180_plus   = 0

    for (const [, agg] of customerMap) {
      const { invoices } = agg

      let current    = 0
      let d30_60     = 0
      let d60_90     = 0
      let d90_plus   = 0
      let totalDays  = 0

      for (const inv of invoices) {
        if      (inv.daysOld <= 30) { current  += inv.outstanding }
        else if (inv.daysOld <= 60) { d30_60   += inv.outstanding }
        else if (inv.daysOld <= 90) { d60_90   += inv.outstanding }
        else                        { d90_plus += inv.outstanding }
        totalDays += inv.daysOld
      }

      const totalOutstanding  = current + d30_60 + d60_90 + d90_plus
      const oldestDays        = invoices.reduce((mx, i) => Math.max(mx, i.daysOld), 0)
      const avgDays           = invoices.length > 0 ? totalDays / invoices.length : 0
      const overdueAmount     = d30_60 + d60_90 + d90_plus
      const overdueRatio      = totalOutstanding > 0 ? overdueAmount / totalOutstanding : 0

      // Recovery probability (null history = neutral)
      const recoveryPct = computeRecoveryProbability(oldestDays, null, overdueRatio)
      const riskTier    = classifyCustomerRiskTier(oldestDays, totalOutstanding, recoveryPct)

      customerDetails.push({
        customer_id:            agg.customer_id,
        customer_name:          agg.customer_name,
        total_outstanding:      Math.round(totalOutstanding * 100) / 100,
        current_outstanding:    Math.round(current          * 100) / 100,
        days_30_60:             Math.round(d30_60           * 100) / 100,
        days_60_90:             Math.round(d60_90           * 100) / 100,
        days_90_plus:           Math.round(d90_plus         * 100) / 100,
        oldest_invoice_days:    oldestDays,
        invoice_count:          invoices.length,
        avg_days_outstanding:   Math.round(avgDays * 10) / 10,
        recovery_probability_pct: recoveryPct,
        risk_tier:              riskTier,
      })

      // Accumulate portfolio buckets (split 90+ into 90-180 and 180+ by oldest proxy)
      portfolioCurrent  += current
      portfolio30_60    += d30_60
      portfolio60_90    += d60_90
      if (oldestDays <= 180) {
        portfolio90_180 += d90_plus
      } else {
        portfolio180_plus += d90_plus
      }
    }

    // Sort by total_outstanding descending
    customerDetails.sort((a, b) => b.total_outstanding - a.total_outstanding)

    // ── Portfolio totals ──────────────────────────────────────────────────────

    const totalOutstanding  = portfolioCurrent + portfolio30_60 + portfolio60_90 + portfolio90_180 + portfolio180_plus
    const overdueTotal      = portfolio30_60 + portfolio60_90 + portfolio90_180 + portfolio180_plus
    const days90Plus        = portfolio90_180 + portfolio180_plus

    const ratio90 = totalOutstanding > 0 ? (days90Plus / totalOutstanding) * 100 : 0

    // ── DSO ───────────────────────────────────────────────────────────────────

    const dsoPf = computePortfolioDso(totalOutstanding, last30dRevenue)

    // ── DSO trend (last 6 months) ─────────────────────────────────────────────

    const monthlyMap = new Map<string, { revenue: number; collected: number; outstanding: number }>()

    for (const row of monthlyRawRows) {
      if (!row.sale_date) continue
      const ym  = row.sale_date.slice(0, 7)  // YYYY-MM
      const rev = Number(row.total ?? 0)
      const paid = Number(row.paid_amount ?? 0)
      const collected = row.payment_status === 'paid' ? rev : paid

      if (!monthlyMap.has(ym)) monthlyMap.set(ym, { revenue: 0, collected: 0, outstanding: 0 })
      const m = monthlyMap.get(ym)!
      m.revenue    += rev
      m.collected  += collected
    }

    const dsoTrend: DSOTrend[] = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([ym, m]) => {
        const avgDaily = m.revenue / 30
        const dso      = avgDaily > 0 ? totalOutstanding / avgDaily : null
        const collRate = m.revenue > 0 ? (m.collected / m.revenue) * 100 : null
        return {
          year_month:          ym,
          dso_days:            dso !== null ? Math.round(dso * 10) / 10 : null,
          revenue:             Math.round(m.revenue   * 100) / 100,
          collected:           Math.round(m.collected * 100) / 100,
          collection_rate_pct: collRate !== null ? Math.round(collRate * 10) / 10 : null,
        }
      })

    // ── Collection efficiency ─────────────────────────────────────────────────

    const totalCollectedLast30d = last30dRevenue  // approximate collected
    const collEfficiency = computeCollectionEfficiency(totalCollectedLast30d, priorOutstandingAmount)

    // ── Bad debt provision ────────────────────────────────────────────────────

    const badDebtProvision = computeBadDebtProvision(
      {
        current:       portfolioCurrent,
        days_30_60:    portfolio30_60,
        days_60_90:    portfolio60_90,
        days_90_180:   portfolio90_180,
        days_180_plus: portfolio180_plus,
      },
      {
        current:       0.01,
        days_30_60:    0.05,
        days_60_90:    0.15,
        days_90_180:   0.30,
        days_180_plus: 0.60,
      },
    )

    // ── Concentration HHI ─────────────────────────────────────────────────────

    const concentrationHhi = computeConcentrationRisk(
      customerDetails.map(c => ({ customer_id: c.customer_id, outstanding: c.total_outstanding })),
      totalOutstanding,
    )

    // ── Aging health ──────────────────────────────────────────────────────────

    const agingHealth = classifyAgingHealth(ratio90, dsoPf, collEfficiency)

    // ── Weighted age ──────────────────────────────────────────────────────────

    const weightedAge = computeWeightedAgeDays([
      { midpoint_days: 15,  amount: portfolioCurrent  },
      { midpoint_days: 45,  amount: portfolio30_60    },
      { midpoint_days: 75,  amount: portfolio60_90    },
      { midpoint_days: 135, amount: portfolio90_180   },
      { midpoint_days: 270, amount: portfolio180_plus },
    ])

    // ── Critical customer count ───────────────────────────────────────────────

    const criticalCustomerCount = customerDetails.filter(c => c.risk_tier === 'critical').length

    // ── Narrative ─────────────────────────────────────────────────────────────

    const narrative = generateAgingNarrative(
      agingHealth,
      dsoPf,
      overdueTotal,
      badDebtProvision,
      criticalCustomerCount,
    )

    return {
      as_of_date:               todayStr,
      total_outstanding:        Math.round(totalOutstanding  * 100) / 100,
      current_outstanding:      Math.round(portfolioCurrent  * 100) / 100,
      overdue_total:            Math.round(overdueTotal      * 100) / 100,
      days_90_plus:             Math.round(days90Plus        * 100) / 100,
      customer_details:         customerDetails,
      dso_portfolio:            dsoPf !== null ? Math.round(dsoPf * 10) / 10 : null,
      dso_trend:                dsoTrend,
      collection_efficiency_pct: collEfficiency !== null
        ? Math.round(collEfficiency * 10) / 10
        : null,
      bad_debt_provision:       Math.round(badDebtProvision  * 100) / 100,
      concentration_hhi:        Math.round(concentrationHhi * 10000) / 10000,
      aging_health:             agingHealth,
      weighted_age_days:        weightedAge !== null ? Math.round(weightedAge * 10) / 10 : null,
      critical_customer_count:  criticalCustomerCount,
      narrative,
    }
  }
}
