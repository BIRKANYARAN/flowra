// ── ExpenseAnomalyService — Statistical Expense Anomaly Detection ─────────────
// Detects unusual expenses by comparing recent 30 days against a 60-day
// rolling baseline (days 31-90). Four anomaly types:
//   spike            — amount significantly above category average
//   new_vendor       — supplier not seen in last 90 days
//   unusual_category — expense_type not seen in days 31-90
//   duplicate_suspect— same supplier + type + amount (±5%) within 7 days

import type { SupabaseClient } from '@supabase/supabase-js'
import { EXPENSE_TYPE_LABELS } from './expense-intelligence.service'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnomalySeverity = 'high' | 'medium' | 'low'

export interface ExpenseAnomaly {
  expense_id: string
  expense_date: string
  supplier_name: string | null
  expense_type: string
  amount_try: number
  category_avg_try: number
  category_stddev_try: number | null
  zscore: number | null
  deviation_pct: number
  severity: AnomalySeverity
  anomaly_type: 'spike' | 'new_vendor' | 'unusual_category' | 'duplicate_suspect'
  description: string
}

export interface ExpenseAnomalyReport {
  anomalies: ExpenseAnomaly[]
  high_count: number
  medium_count: number
  low_count: number
  total_anomaly_amount_try: number
  analysis_window_days: number
  as_of_date: string
}

// ── Raw DB row ─────────────────────────────────────────────────────────────────

interface ExpenseRow {
  id: string
  expense_date: string | null
  supplier_name: string | null
  expense_type: string | null
  amount_try: number | null
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Compute population standard deviation.
 * Returns null if fewer than 2 values.
 * Returns 0 if all values are identical.
 */
export function computePopulationStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Compute z-score: (value - mean) / stddev.
 * Returns null if stddev is 0 or null.
 */
export function computeZScore(value: number, mean: number, stddev: number): number | null {
  if (stddev === 0) return null
  return (value - mean) / stddev
}

/**
 * Compute deviation percentage: (value - baseline) / baseline × 100.
 * Returns 0 if baseline is 0.
 */
export function computeDeviationPct(value: number, baseline: number): number {
  if (baseline === 0) return 0
  return ((value - baseline) / baseline) * 100
}

/**
 * Classify anomaly severity based on z-score and deviation percent.
 * Returns null if below threshold (deviationPct < 25% AND no significant z-score).
 *
 * high:   |zscore| > 2  OR deviationPct > 100
 * medium: |zscore| > 1.5 OR deviationPct > 50
 * low:    threshold met but not high/medium
 * null:   below threshold
 */
export function classifyAnomaly(
  zScore: number | null,
  deviationPct: number,
): AnomalySeverity | null {
  const absZ = zScore !== null ? Math.abs(zScore) : null

  // Check if below threshold
  if (deviationPct < 25 && (absZ === null || absZ < 1.5)) return null

  // High severity
  if ((absZ !== null && absZ > 2) || deviationPct > 100) return 'high'

  // Medium severity
  if ((absZ !== null && absZ > 1.5) || deviationPct > 50) return 'medium'

  // Low severity (threshold met but not high/medium)
  return 'low'
}

/**
 * Build Turkish description for an anomaly.
 */
export function buildAnomalyDescription(
  expenseType: string,
  deviationPct: number,
  anomalyType: ExpenseAnomaly['anomaly_type'],
): string {
  const label = EXPENSE_TYPE_LABELS[expenseType] ?? expenseType
  const absDev = Math.abs(Math.round(deviationPct))

  switch (anomalyType) {
    case 'spike':
      if (deviationPct > 0) {
        return `${label} gideri aylık ortalamanın %${absDev} üzerinde`
      }
      return `${label} gideri aylık ortalamanın %${absDev} altında`
    case 'new_vendor':
      return `${label} kategorisinde son 90 günde görülmeyen yeni tedarikçi`
    case 'unusual_category':
      return `${label} kategorisi son 90 günde görülmemişti`
    case 'duplicate_suspect':
      return `${label} giderinde 7 gün içinde aynı tutarda olası kopya tespit edildi`
  }
}

// ── Severity sort order ───────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<AnomalySeverity, number> = { high: 0, medium: 1, low: 2 }

// ── Service ───────────────────────────────────────────────────────────────────

export class ExpenseAnomalyService {
  static async getReport(
    companyId: string,
    supabase: SupabaseClient,
    asOfDate: Date = new Date(),
  ): Promise<ExpenseAnomalyReport> {
    const today = asOfDate.toISOString().slice(0, 10)

    // Window: last 90 days
    const window90Start = new Date(asOfDate.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    // Baseline: days 31-90 (prior 60 days)
    const baselineStart = new Date(asOfDate.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    const baselineEnd   = new Date(asOfDate.getTime() - 31 * 86_400_000).toISOString().slice(0, 10)
    // Recent: last 30 days
    const recentStart   = new Date(asOfDate.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

    // Fetch all expenses in the 90-day window
    const { data: allRows } = await supabase
      .from('expenses')
      .select('id, expense_date, supplier_name, expense_type, amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', window90Start)
      .lte('expense_date', today)
      .order('expense_date', { ascending: false })

    const expenses = (allRows ?? []) as ExpenseRow[]

    // Split into baseline (days 31-90) and recent (last 30 days)
    const baselineRows = expenses.filter(
      e => e.expense_date && e.expense_date >= baselineStart && e.expense_date <= baselineEnd,
    )
    const recentRows = expenses.filter(
      e => e.expense_date && e.expense_date >= recentStart && e.expense_date <= today,
    )

    // ── Build category baselines ──────────────────────────────────────────────
    // For each expense_type in baseline: collect amounts, compute avg + stddev
    const categoryAmounts = new Map<string, number[]>()
    for (const row of baselineRows) {
      const type = row.expense_type ?? 'other'
      const amt  = Number(row.amount_try ?? 0)
      if (!categoryAmounts.has(type)) categoryAmounts.set(type, [])
      categoryAmounts.get(type)!.push(amt)
    }

    interface CategoryBaseline {
      avg: number
      stddev: number | null
    }
    const categoryBaseline = new Map<string, CategoryBaseline>()
    for (const [type, amounts] of categoryAmounts.entries()) {
      const avg    = amounts.reduce((s, v) => s + v, 0) / amounts.length
      const stddev = computePopulationStdDev(amounts)
      categoryBaseline.set(type, { avg, stddev })
    }

    // ── Build baseline lookup sets ────────────────────────────────────────────
    const baselineSuppliers = new Set<string>()
    const baselineCategories = new Set<string>()
    for (const row of baselineRows) {
      if (row.supplier_name) baselineSuppliers.add(row.supplier_name)
      if (row.expense_type)  baselineCategories.add(row.expense_type)
    }

    // ── Detect duplicate suspects in recent rows ──────────────────────────────
    // Same supplier_name + expense_type + amount (±5%) within 7 days
    const duplicateSuspectIds = new Set<string>()
    for (let i = 0; i < recentRows.length; i++) {
      const a = recentRows[i]
      if (!a.expense_date || !a.supplier_name || !a.expense_type) continue
      const aAmt  = Number(a.amount_try ?? 0)
      const aDate = new Date(a.expense_date).getTime()

      for (let j = i + 1; j < recentRows.length; j++) {
        const b = recentRows[j]
        if (!b.expense_date || !b.supplier_name || !b.expense_type) continue
        if (b.supplier_name !== a.supplier_name) continue
        if (b.expense_type  !== a.expense_type)  continue

        const bAmt  = Number(b.amount_try ?? 0)
        const bDate = new Date(b.expense_date).getTime()

        // Amount within ±5%
        const amtDiff = Math.abs(aAmt - bAmt) / Math.max(aAmt, bAmt, 1)
        if (amtDiff > 0.05) continue

        // Within 7 days
        const dayDiff = Math.abs(aDate - bDate) / 86_400_000
        if (dayDiff > 7) continue

        duplicateSuspectIds.add(a.id)
        duplicateSuspectIds.add(b.id)
      }
    }

    // ── Classify each recent expense ──────────────────────────────────────────
    const anomalies: ExpenseAnomaly[] = []

    for (const row of recentRows) {
      const type        = row.expense_type ?? 'other'
      const amount      = Number(row.amount_try ?? 0)
      const baseline    = categoryBaseline.get(type)
      const categoryAvg = baseline?.avg ?? 0
      const stddev      = baseline?.stddev ?? null

      const deviationPct = computeDeviationPct(amount, categoryAvg)
      const zscore       = stddev !== null && stddev > 0
        ? computeZScore(amount, categoryAvg, stddev)
        : null

      // ── Determine anomaly type (priority: duplicate > spike > new_vendor > unusual_category) ──
      let anomalyType: ExpenseAnomaly['anomaly_type'] | null = null
      let severity: AnomalySeverity | null = null

      // 1. Duplicate suspect
      if (duplicateSuspectIds.has(row.id)) {
        anomalyType = 'duplicate_suspect'
        severity    = 'high'
      }

      // 2. Spike: amount > avg + 1.5×stddev, or deviation > 25% with baseline
      if (!anomalyType) {
        const hasBaseline = baseline != null && baseline.avg > 0
        const isSpike = hasBaseline && (
          (stddev !== null && stddev > 0 && zscore !== null && zscore > 1.5)
          || deviationPct > 25
        )

        if (isSpike) {
          const classified = classifyAnomaly(zscore, deviationPct)
          if (classified) {
            anomalyType = 'spike'
            severity    = classified
          }
        }
      }

      // 3. New vendor
      if (!anomalyType && row.supplier_name && !baselineSuppliers.has(row.supplier_name)) {
        anomalyType = 'new_vendor'
        severity    = 'low'
      }

      // 4. Unusual category
      if (!anomalyType && !baselineCategories.has(type)) {
        anomalyType = 'unusual_category'
        severity    = 'low'
      }

      if (!anomalyType || !severity) continue

      anomalies.push({
        expense_id:          row.id,
        expense_date:        row.expense_date ?? today,
        supplier_name:       row.supplier_name ?? null,
        expense_type:        type,
        amount_try:          amount,
        category_avg_try:    categoryAvg,
        category_stddev_try: stddev,
        zscore,
        deviation_pct:       Math.round(deviationPct * 10) / 10,
        severity,
        anomaly_type:        anomalyType,
        description:         buildAnomalyDescription(type, deviationPct, anomalyType),
      })
    }

    // ── Sort: severity (high first), then date (newest first) ────────────────
    anomalies.sort((a, b) => {
      const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sev !== 0) return sev
      return b.expense_date.localeCompare(a.expense_date)
    })

    const high_count   = anomalies.filter(a => a.severity === 'high').length
    const medium_count = anomalies.filter(a => a.severity === 'medium').length
    const low_count    = anomalies.filter(a => a.severity === 'low').length
    const total_anomaly_amount_try = anomalies.reduce((s, a) => s + a.amount_try, 0)

    return {
      anomalies,
      high_count,
      medium_count,
      low_count,
      total_anomaly_amount_try,
      analysis_window_days: 90,
      as_of_date: today,
    }
  }
}
