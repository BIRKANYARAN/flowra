// Anomaly Engine — statistical pattern recognition (Phase A, no LLM)
//
// Detects:
//   1. Revenue anomaly  — current month vs 3-month trailing mean ± 2σ
//   2. Expense anomaly  — per-category vs 3-month trailing mean ± 1.5σ
//   3. Customer risk    — per-customer average payment lateness score
//
// All computations are pure; DB data is fetched in the API route.

import { round2 } from '@/lib/calc'

// ── Types ──────────────────────────────────────────────────────────────────

export type AnomalySeverity = 'low' | 'medium' | 'high'

export interface RevenueAnomaly {
  type:         'revenue'
  month:        string        // YYYY-MM
  actual:       number
  mean:         number
  stddev:       number
  deviation_pct:number        // (actual - mean) / mean × 100
  direction:    'spike' | 'drop'
  severity:     AnomalySeverity
  message:      string
}

export interface ExpenseAnomaly {
  type:         'expense'
  category:     string
  month:        string
  actual:       number
  mean:         number
  stddev:       number
  deviation_pct:number
  direction:    'spike' | 'drop'
  severity:     AnomalySeverity
  message:      string
}

export interface CustomerRisk {
  customer_name:   string
  avg_days_late:   number
  overdue_count:   number
  total_overdue:   number
  risk_score:      number    // 0–100
  risk_level:      'low' | 'medium' | 'high'
  message:         string
}

export type AnomalyResult =
  | RevenueAnomaly
  | ExpenseAnomaly

// ── Monthly time-series data shapes ───────────────────────────────────────

export interface MonthlyRevenue {
  month:   string   // YYYY-MM
  revenue: number
}

export interface MonthlyExpense {
  month:    string
  category: string
  amount:   number
}

export interface CustomerPayment {
  customer_name: string
  sale_date:     string    // YYYY-MM-DD
  paid_date:     string | null
  due_date:      string | null
  total_try:     number
  payment_status: string
}

// ── Statistical helpers ────────────────────────────────────────────────────

function mean(vals: number[]): number {
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function stddev(vals: number[], m?: number): number {
  if (vals.length < 2) return 0
  const mu = m ?? mean(vals)
  const variance = vals.reduce((a, v) => a + Math.pow(v - mu, 2), 0) / (vals.length - 1)
  return Math.sqrt(variance)
}

function severity(zScore: number): AnomalySeverity {
  const abs = Math.abs(zScore)
  if (abs >= 3) return 'high'
  if (abs >= 2) return 'medium'
  return 'low'
}

// ── 1. Revenue Anomaly Detection ──────────────────────────────────────────
//
// Input: monthly revenue for last N months (oldest first)
// Logic: use the trailing 3 months as baseline, check if latest month deviates > 2σ

export function detectRevenueAnomalies(
  monthly: MonthlyRevenue[],
  sigmaThreshold = 2,
): RevenueAnomaly[] {
  if (monthly.length < 4) return []  // need at least 3 baseline + 1 check months

  const anomalies: RevenueAnomaly[] = []
  const sorted = [...monthly].sort((a, b) => a.month.localeCompare(b.month))

  for (let i = 3; i < sorted.length; i++) {
    const baseline = sorted.slice(i - 3, i).map(m => m.revenue)
    const m        = mean(baseline)
    const s        = stddev(baseline, m)
    const current  = sorted[i]
    const z        = s > 0 ? (current.revenue - m) / s : 0
    const devPct   = m > 0 ? round2(((current.revenue - m) / m) * 100) : 0

    if (Math.abs(z) < sigmaThreshold) continue

    const direction = current.revenue > m ? 'spike' : 'drop'
    const sev       = severity(z)

    anomalies.push({
      type:         'revenue',
      month:        current.month,
      actual:       round2(current.revenue),
      mean:         round2(m),
      stddev:       round2(s),
      deviation_pct:devPct,
      direction,
      severity:     sev,
      message: direction === 'spike'
        ? `Gelir ${current.month} döneminde ortalamadan %${Math.abs(devPct)} yüksek — ${fmtK(current.revenue - m)} fazla`
        : `Gelir ${current.month} döneminde ortalamadan %${Math.abs(devPct)} düşük — ${fmtK(m - current.revenue)} eksik`,
    })
  }

  return anomalies
}

// ── 2. Expense Category Anomaly Detection ─────────────────────────────────

export function detectExpenseAnomalies(
  monthly: MonthlyExpense[],
  sigmaThreshold = 1.5,
): ExpenseAnomaly[] {
  if (!monthly.length) return []

  // Group by category
  const byCategory: Record<string, MonthlyExpense[]> = {}
  for (const m of monthly) {
    const k = m.category
    if (!byCategory[k]) byCategory[k] = []
    byCategory[k].push(m)
  }

  const anomalies: ExpenseAnomaly[] = []

  for (const [category, entries] of Object.entries(byCategory)) {
    const sorted = [...entries].sort((a, b) => a.month.localeCompare(b.month))
    if (sorted.length < 4) continue

    for (let i = 3; i < sorted.length; i++) {
      const baseline = sorted.slice(i - 3, i).map(e => e.amount)
      const m        = mean(baseline)
      const s        = stddev(baseline, m)
      const current  = sorted[i]
      const z        = s > 0 ? (current.amount - m) / s : 0
      const devPct   = m > 0 ? round2(((current.amount - m) / m) * 100) : 0

      if (Math.abs(z) < sigmaThreshold) continue

      const direction = current.amount > m ? 'spike' : 'drop'
      const sev       = severity(z)

      anomalies.push({
        type:         'expense',
        category,
        month:        current.month,
        actual:       round2(current.amount),
        mean:         round2(m),
        stddev:       round2(s),
        deviation_pct:devPct,
        direction,
        severity:     sev,
        message: direction === 'spike'
          ? `${category} gideri ${current.month} döneminde normalden %${Math.abs(devPct)} yüksek`
          : `${category} gideri ${current.month} döneminde normalden %${Math.abs(devPct)} düşük`,
      })
    }
  }

  return anomalies.sort((a, b) => Math.abs(b.deviation_pct) - Math.abs(a.deviation_pct))
}

// ── 3. Customer Payment Risk Scoring ──────────────────────────────────────

export function scoreCustomerRisk(payments: CustomerPayment[]): CustomerRisk[] {
  const byCustomer: Record<string, CustomerPayment[]> = {}
  for (const p of payments) {
    if (!byCustomer[p.customer_name]) byCustomer[p.customer_name] = []
    byCustomer[p.customer_name].push(p)
  }

  const risks: CustomerRisk[] = []

  for (const [customer, txns] of Object.entries(byCustomer)) {
    if (txns.length < 2) continue  // not enough history

    let totalLate   = 0
    let lateCount   = 0
    let overdueAmt  = 0
    let overdueCount= 0

    for (const t of txns) {
      if (t.payment_status === 'overdue' || t.payment_status === 'pending') {
        overdueCount++
        overdueAmt += t.total_try
      }

      if (t.paid_date && t.due_date) {
        const daysLate = Math.round(
          (new Date(t.paid_date).getTime() - new Date(t.due_date).getTime()) / 86_400_000
        )
        if (daysLate > 0) { totalLate += daysLate; lateCount++ }
      }
    }

    const avgDaysLate   = lateCount > 0 ? round2(totalLate / lateCount) : 0
    const overdueRatio  = txns.length > 0 ? overdueCount / txns.length : 0

    // Risk score: 0–100 (higher = riskier)
    // 50 pts max from overdue ratio, 50 pts from avg days late (capped at 90 days)
    const riskScore = Math.min(100, Math.round(
      (overdueRatio * 50) + (Math.min(avgDaysLate, 90) / 90 * 50)
    ))

    const riskLevel: CustomerRisk['risk_level'] =
      riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low'

    risks.push({
      customer_name:  customer,
      avg_days_late:  avgDaysLate,
      overdue_count:  overdueCount,
      total_overdue:  round2(overdueAmt),
      risk_score:     riskScore,
      risk_level:     riskLevel,
      message: riskLevel === 'high'
        ? `${customer}: Risk yüksek — %${Math.round(overdueRatio * 100)} gecikme oranı, ort. ${avgDaysLate} gün geç ödeme`
        : riskLevel === 'medium'
        ? `${customer}: Orta risk — ${overdueCount} gecikmiş işlem`
        : `${customer}: Düşük risk`,
    })
  }

  return risks.sort((a, b) => b.risk_score - a.risk_score)
}

// ── Formatting helper ──────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `₺${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `₺${(n / 1_000).toFixed(0)}K`
  return `₺${Math.round(n)}`
}
