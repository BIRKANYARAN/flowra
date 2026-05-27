// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/expense-anomaly.service.ts
//
// Statistical Expense Anomaly Detection
//
// Algorithm:
//   1. Fetch all expenses in the analysis window (default 90 days).
//   2. Group by expense_type; compute mean + stdDev per category (min 3 rows).
//   3. For each expense compute z-score vs its category baseline.
//   4. Run IQR bounds per category for a second detection signal.
//   5. Run duplicate detection: same supplier + same amount ±1 TRY within 7 days.
//   6. Classify severity and build the report.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { CATEGORY_LABELS } from './expense-forecast.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export interface ExpenseAnomaly {
  expense_id: string
  supplier_name: string | null
  amount_try: number
  expense_type: string
  expense_label: string        // Turkish label from CATEGORY_LABELS
  created_at: string
  z_score: number | null
  category_mean_try: number
  category_std_dev_try: number
  severity: 'high' | 'medium' | 'low' | 'none'
  anomaly_reasons: string[]    // e.g. ["Z-skoru 3.2 — kategorinin 3× üzerinde", "Muhtemel kopya fatura"]
  is_potential_duplicate: boolean
}

export interface ExpenseAnomalyReport {
  analysis_window_days: number
  total_expenses_analyzed: number
  anomalies_found: number
  high_severity_count: number
  duplicate_suspects: number
  anomalies: ExpenseAnomaly[]        // severity !== 'none' OR is_potential_duplicate, sorted by severity then amount
  total_anomalous_amount_try: number
  categories_with_anomalies: string[]
}

// ── IQR bounds result ──────────────────────────────────────────────────────────

export interface IQRBounds {
  q1: number
  q3: number
  iqr: number
  lower_bound: number
  upper_bound: number
}

// ── Pure computation functions ─────────────────────────────────────────────────

/**
 * Compute mean of an array of numbers.
 * Returns 0 for empty array.
 */
export function computeMean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((s, v) => s + v, 0) / values.length
}

/**
 * Compute population standard deviation.
 * Returns 0 for empty or single-element array.
 */
export function computeStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/**
 * Compute z-score: (value - mean) / stdDev.
 * Returns null if stdDev is 0.
 */
export function computeZScore(value: number, mean: number, stdDev: number): number | null {
  if (stdDev === 0) return null
  return (value - mean) / stdDev
}

/**
 * Compute IQR bounds from a pre-sorted ascending array.
 * Returns null if fewer than 4 values.
 *
 * lower_bound = Q1 - 1.5 × IQR
 * upper_bound = Q3 + 1.5 × IQR
 */
export function computeIQRBounds(sortedValues: number[]): IQRBounds | null {
  if (sortedValues.length < 4) return null

  const n = sortedValues.length

  // Interpolated quartiles (exclusive method)
  const q1Index = (n - 1) * 0.25
  const q3Index = (n - 1) * 0.75

  const q1Lower = Math.floor(q1Index)
  const q1Upper = Math.ceil(q1Index)
  const q3Lower = Math.floor(q3Index)
  const q3Upper = Math.ceil(q3Index)

  const q1 = q1Lower === q1Upper
    ? sortedValues[q1Lower]
    : sortedValues[q1Lower] + (q1Index - q1Lower) * (sortedValues[q1Upper] - sortedValues[q1Lower])

  const q3 = q3Lower === q3Upper
    ? sortedValues[q3Lower]
    : sortedValues[q3Lower] + (q3Index - q3Lower) * (sortedValues[q3Upper] - sortedValues[q3Lower])

  const iqr = q3 - q1
  const lower_bound = q1 - 1.5 * iqr
  const upper_bound = q3 + 1.5 * iqr

  return { q1, q3, iqr, lower_bound, upper_bound }
}

/**
 * Classify anomaly severity using z-score and IQR bounds.
 *
 * Rules:
 *   |z_score| > 3 OR value > upper_bound × 1.5  → 'high'
 *   |z_score| 2-3 OR value > upper_bound         → 'medium'
 *   |z_score| 1.5-2                              → 'low'
 *   else                                          → 'none'
 *
 * If z_score is null: use IQR bounds only.
 */
export function classifyAnomalySeverity(
  zScore: number | null,
  value: number,
  iqrBounds: { lower_bound: number; upper_bound: number } | null,
): 'high' | 'medium' | 'low' | 'none' {
  const absZ = zScore !== null ? Math.abs(zScore) : null

  // High: extreme z-score OR far above IQR upper bound
  if (absZ !== null && absZ > 3) return 'high'
  if (iqrBounds !== null && value > iqrBounds.upper_bound * 1.5) return 'high'

  // Medium: high z-score OR above IQR upper bound
  if (absZ !== null && absZ > 2) return 'medium'
  if (iqrBounds !== null && value > iqrBounds.upper_bound) return 'medium'

  // Low: moderate z-score
  if (absZ !== null && absZ > 1.5) return 'low'

  return 'none'
}

/**
 * Detect whether an expense is a potential duplicate of another in the same collection.
 * Criteria: same supplier_name (case-insensitive) + same amount (±1 TRY) within windowDays.
 */
export function isPotentialDuplicate(
  expense: { supplier_name: string | null; amount_try: number; created_at: string },
  others: Array<{ supplier_name: string | null; amount_try: number; created_at: string }>,
  windowDays = 7,
): boolean {
  if (!expense.supplier_name) return false

  const expDate   = new Date(expense.created_at).getTime()
  const expAmt    = expense.amount_try
  const expSupply = expense.supplier_name.toLowerCase().trim()
  const windowMs  = windowDays * 86_400_000

  for (const other of others) {
    if (!other.supplier_name) continue
    if (other.supplier_name.toLowerCase().trim() !== expSupply) continue

    const otherAmt  = other.amount_try
    if (Math.abs(expAmt - otherAmt) > 1) continue

    const otherDate = new Date(other.created_at).getTime()
    if (Math.abs(expDate - otherDate) > windowMs) continue

    return true
  }

  return false
}

// ── Severity sort order ────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<'high' | 'medium' | 'low' | 'none', number> = {
  high: 0, medium: 1, low: 2, none: 3,
}

// ── Service class ──────────────────────────────────────────────────────────────

export class ExpenseAnomalyService {

  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  async getReport(
    companyId: string,
    windowDays = 90,
  ): Promise<ExpenseAnomalyReport> {
    const today = new Date()
    const windowStart = new Date(today.getTime() - windowDays * 86_400_000)
      .toISOString()
      .slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)

    // ── Fetch expenses in window ──────────────────────────────────────────────
    const { data: rows } = await this.supabase
      .from('expenses')
      .select('id, supplier_name, amount_try, expense_type, created_at, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', windowStart)
      .lte('expense_date', todayStr)
      .order('expense_date', { ascending: false })

    interface ExpenseRow {
      id: string
      supplier_name: string | null
      amount_try: number | string | null
      expense_type: string | null
      created_at: string
      expense_date: string | null
    }

    const expenses = (rows ?? []) as ExpenseRow[]

    // ── Group amounts by expense_type ─────────────────────────────────────────
    const categoryAmountMap = new Map<string, number[]>()
    for (const row of expenses) {
      const type = row.expense_type ?? 'other'
      const amt  = Number(row.amount_try ?? 0)
      if (!categoryAmountMap.has(type)) categoryAmountMap.set(type, [])
      categoryAmountMap.get(type)!.push(amt)
    }

    // ── Compute stats per category (min 3 expenses) ───────────────────────────
    interface CategoryStats {
      mean: number
      stdDev: number
      iqrBounds: IQRBounds | null
    }
    const categoryStats = new Map<string, CategoryStats>()
    for (const [type, amounts] of categoryAmountMap.entries()) {
      if (amounts.length < 3) continue
      const mean   = computeMean(amounts)
      const stdDev = computeStdDev(amounts, mean)
      const sorted = [...amounts].sort((a, b) => a - b)
      const iqrBounds = computeIQRBounds(sorted)
      categoryStats.set(type, { mean, stdDev, iqrBounds })
    }

    // ── Build anomaly list ────────────────────────────────────────────────────
    const anomalies: ExpenseAnomaly[] = []

    for (const row of expenses) {
      const type   = row.expense_type ?? 'other'
      const amount = Number(row.amount_try ?? 0)
      const stats  = categoryStats.get(type)

      const zScore     = stats ? computeZScore(amount, stats.mean, stats.stdDev) : null
      const iqrBounds  = stats?.iqrBounds ?? null
      const mean       = stats?.mean ?? 0
      const stdDev     = stats?.stdDev ?? 0

      // Duplicate check: compare against all other rows (same id excluded)
      const others = expenses.filter(e => e.id !== row.id).map(e => ({
        supplier_name: e.supplier_name,
        amount_try:    Number(e.amount_try ?? 0),
        created_at:    e.created_at,
      }))
      const isDuplicate = isPotentialDuplicate(
        {
          supplier_name: row.supplier_name,
          amount_try:    amount,
          created_at:    row.created_at,
        },
        others,
        7,
      )

      const severity = classifyAnomalySeverity(zScore, amount, iqrBounds)

      // Include if anomalous OR duplicate suspect
      if (severity === 'none' && !isDuplicate) continue

      // Build reasons
      const reasons: string[] = []
      if (zScore !== null && Math.abs(zScore) > 1.5) {
        const multiplier = mean > 0 ? (amount / mean).toFixed(1) : '?'
        reasons.push(`Z-skoru ${zScore.toFixed(1)} — kategorinin ${multiplier}× üzerinde`)
      }
      if (iqrBounds !== null && amount > iqrBounds.upper_bound) {
        reasons.push(`IQR üst sınırını (${Math.round(iqrBounds.upper_bound).toLocaleString('tr-TR')} ₺) aşıyor`)
      }
      if (isDuplicate) {
        reasons.push('Muhtemel kopya fatura')
      }

      const label = CATEGORY_LABELS[type] ?? type

      anomalies.push({
        expense_id:          row.id,
        supplier_name:       row.supplier_name ?? null,
        amount_try:          amount,
        expense_type:        type,
        expense_label:       label,
        created_at:          row.created_at,
        z_score:             zScore,
        category_mean_try:   mean,
        category_std_dev_try: stdDev,
        severity,
        anomaly_reasons:     reasons,
        is_potential_duplicate: isDuplicate,
      })
    }

    // ── Sort: severity asc, then amount desc ──────────────────────────────────
    anomalies.sort((a, b) => {
      const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
      if (sevDiff !== 0) return sevDiff
      return b.amount_try - a.amount_try
    })

    const highSeverityCount   = anomalies.filter(a => a.severity === 'high').length
    const duplicateSuspects   = anomalies.filter(a => a.is_potential_duplicate).length
    const anomalousAmount     = anomalies.reduce((s, a) => s + a.amount_try, 0)
    const categoriesWithAnomalies = [...new Set(anomalies.map(a => a.expense_label))]

    return {
      analysis_window_days:     windowDays,
      total_expenses_analyzed:  expenses.length,
      anomalies_found:          anomalies.length,
      high_severity_count:      highSeverityCount,
      duplicate_suspects:       duplicateSuspects,
      anomalies,
      total_anomalous_amount_try: anomalousAmount,
      categories_with_anomalies:  categoriesWithAnomalies,
    }
  }
}
