// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/kpi-tracker.service.ts
//
// Executive KPI Tracker — computes progress against company-set targets.
// Fetches live values from the DB and compares against kpi_targets rows.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── KPI catalogue ─────────────────────────────────────────────────────────────

export const KPI_DEFINITIONS = {
  monthly_revenue:          { label: 'Aylık Ciro',         unit: 'try',    format: 'currency' as const },
  gross_margin_pct:         { label: 'Brüt Kâr Marjı',     unit: 'pct',    format: 'percent'  as const },
  net_margin_pct:           { label: 'Net Kâr Marjı',       unit: 'pct',    format: 'percent'  as const },
  cash_runway_months:       { label: 'Nakit Yeterliliği',   unit: 'months', format: 'months'   as const },
  receivables_overdue_pct:  { label: 'Gecikmiş Alacak %',   unit: 'pct',    format: 'percent'  as const },
  monthly_expense:          { label: 'Aylık Gider',         unit: 'try',    format: 'currency' as const },
  partner_debt_total:       { label: 'Toplam Ortak Borcu',  unit: 'try',    format: 'currency' as const },
  dsr:                      { label: 'Borç Servis Oranı',   unit: 'ratio',  format: 'decimal'  as const },
} as const

export type KpiKey = keyof typeof KPI_DEFINITIONS

// KPIs where lower = better (target is the ceiling you want to stay under)
const INVERSE_KPIS = new Set<KpiKey>([
  'monthly_expense',
  'partner_debt_total',
  'receivables_overdue_pct',
  'dsr',
])

// ── Public types ──────────────────────────────────────────────────────────────

export interface KpiStatus {
  kpi_key:         KpiKey
  label:           string
  current_value:   number | null
  target_value:    number | null
  progress_pct:    number | null
  status:          'achieved' | 'on_track' | 'at_risk' | 'off_track' | 'no_target'
  is_inverse:      boolean
  trend_direction: 'up' | 'down' | 'flat' | null
  format:          'currency' | 'percent' | 'months' | 'decimal'
}

export interface KpiDashboardReport {
  kpis:           KpiStatus[]
  achieved_count: number
  on_track_count: number
  at_risk_count:  number
  off_track_count: number
  no_target_count: number
  overall_score:  number
  period_label:   string
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/**
 * Compute progress percentage.
 *
 * For non-inverse KPIs: progress = current / target × 100
 * For inverse KPIs:     progress = target  / current × 100
 *                       (target is the max you want to stay under)
 *
 * Returns null when target is 0 or current is 0 (inverse).
 */
export function computeProgress(
  current:   number,
  target:    number,
  isInverse: boolean,
): number | null {
  if (target === 0) return null
  if (isInverse) {
    if (current === 0) return null          // avoid division by zero
    return (target / current) * 100
  }
  return (current / target) * 100
}

/**
 * Assign a KPI status label based on progress percentage.
 */
export function assignKpiStatus(
  progress:  number | null,
  hasTarget: boolean,
): KpiStatus['status'] {
  if (!hasTarget || progress === null) return 'no_target'
  if (progress >= 100) return 'achieved'
  if (progress >= 80)  return 'on_track'
  if (progress >= 60)  return 'at_risk'
  return 'off_track'
}

/**
 * Compute an overall health score (0–100) across all KPIs that have a target.
 *
 * Score = (achieved×4 + on_track×3 + at_risk×2 + off_track×1) /
 *         (kpis_with_target × 4) × 100
 */
export function computeOverallScore(kpis: KpiStatus[]): number {
  const withTarget = kpis.filter(k => k.status !== 'no_target')
  if (withTarget.length === 0) return 0

  const scoreMap: Record<KpiStatus['status'], number> = {
    achieved:   4,
    on_track:   3,
    at_risk:    2,
    off_track:  1,
    no_target:  0,
  }

  const earned = withTarget.reduce((s, k) => s + scoreMap[k.status], 0)
  const max    = withTarget.length * 4
  return Math.round((earned / max) * 100)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function currentMonthBounds(today: string): { from: string; to: string } {
  const from = today.slice(0, 7) + '-01'
  return { from, to: today }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class KpiTrackerService {
  /**
   * Build the full KPI dashboard report for the given company.
   *
   * 1. Fetches kpi_targets rows from DB.
   * 2. Fetches live metric values in parallel (Promise.allSettled).
   * 3. Builds KpiStatus for every KPI_DEFINITIONS key.
   */
  static async getReport(
    companyId: string,
    supabase:  AnyClient,
    opts?:     { today?: string },
  ): Promise<KpiDashboardReport> {
    const today  = opts?.today ?? new Date().toISOString().slice(0, 10)
    const period = currentMonthBounds(today)

    // ── 1. Fetch targets ─────────────────────────────────────────────────────
    const { data: targetRows } = await supabase
      .from('kpi_targets')
      .select('kpi_key, target_value, target_label, period_type')
      .eq('company_id', companyId)
      .eq('is_active', true)

    const targetMap = new Map<string, number>()
    for (const row of (targetRows ?? [])) {
      targetMap.set(row.kpi_key as string, Number(row.target_value))
    }

    // ── 2. Fetch live values in parallel ─────────────────────────────────────
    const [
      salesResult,
      expensesResult,
      partnerDebtResult,
      receivablesResult,
    ] = await Promise.allSettled([

      // Monthly sales (revenue + cost)
      supabase
        .from('sales')
        .select('total_try:total, cost_try:cost')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', period.from)
        .lte('sale_date', period.to),

      // Monthly expenses
      supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', period.from)
        .lte('expense_date', period.to),

      // Active partner loan tranches (outstanding_try + monthly interest for DSR)
      supabase
        .from('partner_loan_tranches')
        // outstanding_try computed (no such column): principal_try − total_repaid_try
        .select('principal_try, total_repaid_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active'),

      // Receivables for overdue ratio
      supabase
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount, payment_status, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .neq('payment_status', 'paid'),
    ])

    // ── 3. Derive metric values ───────────────────────────────────────────────

    // Revenue + COGS
    let revenue   = 0
    let cogs      = 0
    if (salesResult.status === 'fulfilled') {
      for (const row of (salesResult.value.data ?? [])) {
        revenue += Number(row.total_try ?? 0)
        cogs    += Number((row as { cost_try?: number | null }).cost_try ?? 0)
      }
    }

    // Expenses
    let totalExpenses = 0
    if (expensesResult.status === 'fulfilled') {
      for (const row of (expensesResult.value.data ?? [])) {
        totalExpenses += Number(row.amount_try ?? 0)
      }
    }

    // Partner debt + DSR
    let partnerDebtTotal    = 0
    let monthlyDebtService  = 0
    if (partnerDebtResult.status === 'fulfilled') {
      for (const row of (partnerDebtResult.value.data ?? [])) {
        const outstanding = Math.max(0, Number(row.principal_try ?? 0) - Number(row.total_repaid_try ?? 0))
        const rate        = Number(row.annual_interest_rate ?? 0)
        partnerDebtTotal    += outstanding
        monthlyDebtService  += rate > 0
          ? outstanding * rate / 12
          : outstanding * 0.015
      }
    }

    // Receivables overdue %
    let totalReceivables  = 0
    let overdueReceivables = 0
    const thirtyDaysAgo   = new Date(new Date(today).getTime() - 30 * 86_400_000)
      .toISOString().slice(0, 10)
    if (receivablesResult.status === 'fulfilled') {
      for (const row of (receivablesResult.value.data ?? [])) {
        const outstanding = Math.max(0, Number(row.total_try ?? 0) - Number((row as { amount_paid?: number | null }).amount_paid ?? 0))
        totalReceivables += outstanding
        if ((row.sale_date as string) < thirtyDaysAgo) {
          overdueReceivables += outstanding
        }
      }
    }

    // Derived KPI values
    const grossProfit      = revenue - cogs
    const grossMarginPct   = revenue > 0 ? (grossProfit / revenue) * 100 : null
    const netIncome        = revenue - cogs - totalExpenses
    const netMarginPct     = revenue > 0 ? (netIncome / revenue) * 100 : null
    const monthlyBurn      = netIncome < 0 ? Math.abs(netIncome) : totalExpenses
    // cash_runway_months: simplified — assume cash ≈ distributable, proxy is runway calculation
    // We don't have the balance sheet here, so we leave as null if no direct data
    // (in a real implementation, you'd wire up the cash service)
    const cashRunwayMonths: number | null = null   // requires balance-sheet cash — caller can extend
    const receivablesOverduePct = totalReceivables > 0
      ? (overdueReceivables / totalReceivables) * 100
      : null
    const dsrValue = netIncome > 0
      ? monthlyDebtService / netIncome
      : null

    const liveValues: Record<KpiKey, number | null> = {
      monthly_revenue:         revenue > 0 ? revenue : null,
      gross_margin_pct:        grossMarginPct,
      net_margin_pct:          netMarginPct,
      cash_runway_months:      cashRunwayMonths,
      receivables_overdue_pct: receivablesOverduePct,
      monthly_expense:         totalExpenses > 0 ? totalExpenses : null,
      partner_debt_total:      partnerDebtTotal > 0 ? partnerDebtTotal : null,
      dsr:                     dsrValue,
    }

    // ── 4. Build KpiStatus array ──────────────────────────────────────────────
    const kpis: KpiStatus[] = (Object.keys(KPI_DEFINITIONS) as KpiKey[]).map(key => {
      const def          = KPI_DEFINITIONS[key]
      const currentValue = liveValues[key]
      const targetValue  = targetMap.has(key) ? targetMap.get(key)! : null
      const isInverse    = INVERSE_KPIS.has(key)
      const hasTarget    = targetValue !== null

      const progressPct = (hasTarget && currentValue !== null)
        ? computeProgress(currentValue, targetValue!, isInverse)
        : null

      const status = assignKpiStatus(progressPct, hasTarget)

      return {
        kpi_key:         key,
        label:           def.label,
        current_value:   currentValue,
        target_value:    targetValue,
        progress_pct:    progressPct !== null ? Math.round(progressPct * 100) / 100 : null,
        status,
        is_inverse:      isInverse,
        trend_direction: null,   // trend requires prior-period data — can be wired in later
        format:          def.format,
      }
    })

    // ── 5. Aggregate counts ───────────────────────────────────────────────────
    const achieved_count  = kpis.filter(k => k.status === 'achieved').length
    const on_track_count  = kpis.filter(k => k.status === 'on_track').length
    const at_risk_count   = kpis.filter(k => k.status === 'at_risk').length
    const off_track_count = kpis.filter(k => k.status === 'off_track').length
    const no_target_count = kpis.filter(k => k.status === 'no_target').length

    const overall_score = computeOverallScore(kpis)

    const periodLabel = new Date(today).toLocaleDateString('tr-TR', {
      month: 'long',
      year:  'numeric',
    })

    return {
      kpis,
      achieved_count,
      on_track_count,
      at_risk_count,
      off_track_count,
      no_target_count,
      overall_score,
      period_label: periodLabel,
    }
  }
}
