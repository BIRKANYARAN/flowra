// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/kpi-threshold.service.ts
//
// KPI Alert Thresholds Configuration Service
//
// Manages configurable KPI thresholds and evaluates them against current
// metrics to fire alerts. Pure functions are exported for unit testing.
// KpiThresholdService class handles DB orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

export type ThresholdDirection = 'above' | 'below' | 'between' | 'outside'
export type ThresholdSeverity  = 'info' | 'warning' | 'critical'
export type KpiCategory        = 'financial' | 'commercial' | 'operational' | 'partner'

export interface KpiThreshold {
  kpi_key: string
  kpi_label_tr: string
  category: KpiCategory
  direction: ThresholdDirection
  warning_threshold: number | null
  critical_threshold: number | null
  unit: string
  is_higher_better: boolean
}

export interface ThresholdEvaluation {
  kpi_key: string
  kpi_label_tr: string
  current_value: number | null
  warning_threshold: number | null
  critical_threshold: number | null
  triggered: boolean
  severity: ThresholdSeverity | null
  message_tr: string
}

// ── Default Thresholds ─────────────────────────────────────────────────────────

export const DEFAULT_KPI_THRESHOLDS: KpiThreshold[] = [
  // Financial
  { kpi_key: 'gross_margin_pct',         kpi_label_tr: 'Brüt Kar Marjı',              category: 'financial',   direction: 'below', warning_threshold: 20,   critical_threshold: 10,   unit: '%',    is_higher_better: true  },
  { kpi_key: 'net_margin_pct',           kpi_label_tr: 'Net Kar Marjı',               category: 'financial',   direction: 'below', warning_threshold: 5,    critical_threshold: 0,    unit: '%',    is_higher_better: true  },
  { kpi_key: 'cash_runway_months',       kpi_label_tr: 'Nakit Pisti',                 category: 'financial',   direction: 'below', warning_threshold: 6,    critical_threshold: 3,    unit: ' ay',  is_higher_better: true  },
  { kpi_key: 'expense_ratio_pct',        kpi_label_tr: 'Gider Oranı',                 category: 'financial',   direction: 'above', warning_threshold: 70,   critical_threshold: 90,   unit: '%',    is_higher_better: false },
  { kpi_key: 'burn_efficiency_ratio',    kpi_label_tr: 'Yakma Verimliliği',            category: 'financial',   direction: 'below', warning_threshold: 0.75, critical_threshold: 0.5,  unit: 'x',   is_higher_better: true  },
  // Commercial
  { kpi_key: 'dso_days',                 kpi_label_tr: 'Ortalama Tahsilat Süresi',    category: 'commercial',  direction: 'above', warning_threshold: 60,   critical_threshold: 90,   unit: ' gün', is_higher_better: false },
  { kpi_key: 'overdue_receivables_pct',  kpi_label_tr: 'Vadesi Geçmiş Alacak',        category: 'commercial',  direction: 'above', warning_threshold: 15,   critical_threshold: 30,   unit: '%',    is_higher_better: false },
  { kpi_key: 'customer_churn_risk_pct',  kpi_label_tr: 'Müşteri Kayıp Riski',         category: 'commercial',  direction: 'above', warning_threshold: 20,   critical_threshold: 40,   unit: '%',    is_higher_better: false },
  { kpi_key: 'revenue_concentration_hhi', kpi_label_tr: 'Gelir Konsantrasyonu (HHI)', category: 'commercial',  direction: 'above', warning_threshold: 0.25, critical_threshold: 0.50, unit: '',     is_higher_better: false },
  // Operational
  { kpi_key: 'inventory_days_outstanding', kpi_label_tr: 'Stok Devir Süresi',         category: 'operational', direction: 'above', warning_threshold: 90,   critical_threshold: 180,  unit: ' gün', is_higher_better: false },
  { kpi_key: 'cash_conversion_cycle_days', kpi_label_tr: 'Nakit Dönüşüm Döngüsü',    category: 'operational', direction: 'above', warning_threshold: 60,   critical_threshold: 120,  unit: ' gün', is_higher_better: false },
  // Partner
  { kpi_key: 'partner_loan_to_equity_pct', kpi_label_tr: 'Ortak Borç/Özkaynak',      category: 'partner',     direction: 'above', warning_threshold: 100,  critical_threshold: 200,  unit: '%',    is_higher_better: false },
  { kpi_key: 'capital_fulfillment_pct',  kpi_label_tr: 'Sermaye Taahhüt Karşılama',  category: 'partner',     direction: 'below', warning_threshold: 75,   critical_threshold: 50,   unit: '%',    is_higher_better: true  },
]

// ── Pure Functions ─────────────────────────────────────────────────────────────

/**
 * Format a numeric value with unit for Turkish messages.
 */
function formatValue(value: number, unit: string): string {
  // For percentage-style units, format nicely
  const formatted = Number.isInteger(value)
    ? value.toLocaleString('tr-TR')
    : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  return `${formatted}${unit}`
}

/**
 * Evaluate a single KPI threshold against a current value.
 * Returns a ThresholdEvaluation with triggered status, severity, and Turkish message.
 */
export function evaluateThreshold(
  threshold: KpiThreshold,
  currentValue: number | null,
): ThresholdEvaluation {
  const base: Omit<ThresholdEvaluation, 'triggered' | 'severity' | 'message_tr'> = {
    kpi_key:            threshold.kpi_key,
    kpi_label_tr:       threshold.kpi_label_tr,
    current_value:      currentValue,
    warning_threshold:  threshold.warning_threshold,
    critical_threshold: threshold.critical_threshold,
  }

  // No data available
  if (currentValue === null || currentValue === undefined) {
    return {
      ...base,
      triggered:  false,
      severity:   null,
      message_tr: 'Veri mevcut değil',
    }
  }

  const { direction, warning_threshold, critical_threshold, kpi_label_tr, unit } = threshold
  const w = warning_threshold
  const c = critical_threshold

  let triggered = false
  let severity: ThresholdSeverity | null = null

  switch (direction) {
    case 'below': {
      // Triggered if value <= critical → 'critical'; value < warning → 'warning'
      // critical takes precedence (check first)
      if (c !== null && currentValue <= c) {
        triggered = true
        severity  = 'critical'
      } else if (w !== null && currentValue < w) {
        triggered = true
        severity  = 'warning'
      }
      break
    }
    case 'above': {
      // Triggered if value >= critical → 'critical'; value > warning → 'warning'
      if (c !== null && currentValue >= c) {
        triggered = true
        severity  = 'critical'
      } else if (w !== null && currentValue > w) {
        triggered = true
        severity  = 'warning'
      }
      break
    }
    case 'between': {
      // Triggered if value is NOT between warning and critical
      // i.e. value < warning OR value > critical
      if (w !== null && c !== null) {
        if (currentValue < w) {
          triggered = true
          severity  = 'warning'
        } else if (currentValue > c) {
          triggered = true
          severity  = 'critical'
        }
      }
      break
    }
    case 'outside': {
      // Triggered if value IS between warning and critical
      if (w !== null && c !== null && currentValue >= w && currentValue <= c) {
        triggered = true
        severity  = 'warning'
      }
      break
    }
  }

  if (!triggered) {
    return {
      ...base,
      triggered:  false,
      severity:   null,
      message_tr: `${kpi_label_tr} ${formatValue(currentValue, unit)} — hedef seviyede.`,
    }
  }

  // Build Turkish alert message
  const directionLabel =
    direction === 'below'   ? 'uyarı eşiğinin altında' :
    direction === 'above'   ? 'uyarı eşiğinin üzerinde' :
    direction === 'between' ? 'beklenen aralık dışında' :
    'beklenen aralık içinde'

  const thresholdRef = severity === 'critical' && c !== null ? c : (w ?? c)
  const thresholdDisplay = thresholdRef !== null ? ` (${formatValue(thresholdRef, unit)})` : ''

  const severityLabel = severity === 'critical' ? 'kritik eşiğin' : 'uyarı eşiğinin'
  const thresholdDirectionLabel =
    direction === 'below' ? `${severityLabel} altında` :
    direction === 'above' ? `${severityLabel} üzerinde` :
    directionLabel

  const message_tr = `${kpi_label_tr} ${formatValue(currentValue, unit)} — ${thresholdDirectionLabel}${thresholdDisplay}.`

  return {
    ...base,
    triggered,
    severity,
    message_tr,
  }
}

/**
 * Evaluate all thresholds against a map of current KPI values.
 * Missing keys in kpiValues are treated as null.
 */
export function evaluateAllThresholds(
  thresholds: KpiThreshold[],
  kpiValues: Record<string, number | null>,
): ThresholdEvaluation[] {
  return thresholds.map(t => evaluateThreshold(t, kpiValues[t.kpi_key] ?? null))
}

/**
 * Filter to only triggered evaluations.
 */
export function filterTriggeredAlerts(evaluations: ThresholdEvaluation[]): ThresholdEvaluation[] {
  return evaluations.filter(e => e.triggered === true)
}

/**
 * Sort evaluations: critical first, then warning, then info.
 * Stable within each tier.
 */
export function prioritizeAlertsBySeverity(evaluations: ThresholdEvaluation[]): ThresholdEvaluation[] {
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  return [...evaluations].sort((a, b) => {
    const aOrder = a.severity !== null ? (order[a.severity] ?? 3) : 3
    const bOrder = b.severity !== null ? (order[b.severity] ?? 3) : 3
    return aOrder - bOrder
  })
}

/**
 * Count alerts by severity level.
 */
export function countAlertsBySeverity(evaluations: ThresholdEvaluation[]): {
  critical: number
  warning: number
  info: number
  total: number
} {
  let critical = 0
  let warning  = 0
  let info     = 0

  for (const e of evaluations) {
    if (e.severity === 'critical') critical++
    else if (e.severity === 'warning') warning++
    else if (e.severity === 'info') info++
  }

  return { critical, warning, info, total: critical + warning + info }
}

/**
 * Compute health score 0-100.
 * Start at 100, deduct: critical -20, warning -10.
 * Floor at 0.
 */
export function computeAlertHealthScore(evaluations: ThresholdEvaluation[]): number {
  let score = 100
  for (const e of evaluations) {
    if (!e.triggered) continue
    if (e.severity === 'critical') score -= 20
    else if (e.severity === 'warning') score -= 10
  }
  return Math.max(0, score)
}

/**
 * Classify health score into a level.
 */
export function classifyAlertHealthLevel(
  score: number,
): 'healthy' | 'watch' | 'concern' | 'critical' {
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'watch'
  if (score >= 40) return 'concern'
  return 'critical'
}

/**
 * Merge default thresholds with custom overrides.
 * Custom values override defaults for matching kpi_key.
 * Custom entries with new kpi_key are appended.
 */
export function mergeWithCustomThresholds(
  defaults: KpiThreshold[],
  custom: Array<Partial<KpiThreshold> & { kpi_key: string }>,
): KpiThreshold[] {
  const result: KpiThreshold[] = defaults.map(def => {
    const override = custom.find(c => c.kpi_key === def.kpi_key)
    if (!override) return def
    return { ...def, ...override } as KpiThreshold
  })

  // Append custom entries that don't exist in defaults
  for (const c of custom) {
    const existsInDefaults = defaults.some(d => d.kpi_key === c.kpi_key)
    if (!existsInDefaults) {
      result.push(c as KpiThreshold)
    }
  }

  return result
}

/**
 * Generate a Turkish narrative summary of the alert state.
 */
export function generateAlertSummaryNarrative(
  criticalCount: number,
  warningCount: number,
  healthLevel: ReturnType<typeof classifyAlertHealthLevel>,
): string {
  if (healthLevel === 'healthy') {
    return "Tüm KPI'lar hedef seviyelerde — sistemde aktif uyarı bulunmuyor."
  }
  if (healthLevel === 'watch') {
    return `${warningCount} uyarı seviyesinde KPI var — yakın takip önerilir.`
  }
  if (healthLevel === 'concern') {
    return `${criticalCount} kritik, ${warningCount} uyarı seviyesinde KPI — aksiyona geçilmeli.`
  }
  // critical
  return `KRİTİK: ${criticalCount} KPI kritik seviyede — acil müdahale gerekiyor.`
}

// ── Report Interface ───────────────────────────────────────────────────────────

export interface KpiThresholdEvaluationReport {
  evaluations: ThresholdEvaluation[]
  triggered_alerts: ThresholdEvaluation[]
  alert_counts: ReturnType<typeof countAlertsBySeverity>
  health_score: number
  health_level: ReturnType<typeof classifyAlertHealthLevel>
  alerts_by_category: Record<KpiCategory, ThresholdEvaluation[]>
  narrative: string
  thresholds_used: KpiThreshold[]
}

// ── Service Class ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class KpiThresholdService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly supabase: SupabaseClient<any>) {}

  async evaluate(companyId: string): Promise<KpiThresholdEvaluationReport> {
    const now         = new Date()
    const today       = now.toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    // ── Parallel data fetch ─────────────────────────────────────────────────
    const [
      salesResult,
      expensesResult,
      balanceSheetResult,
      partnerLoansResult,
      capitalCommitmentsResult,
    ] = await Promise.allSettled([

      // Sales for gross_margin, DSO, overdue_receivables
      this.supabase
        .from('sales')
        .select('total_try, paid_amount, due_date, cost_try, payment_status, sale_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', thirtyDaysAgo)
        .lte('sale_date', today),

      // Expenses for expense_ratio
      this.supabase
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', thirtyDaysAgo)
        .lte('expense_date', today),

      // Balance sheet snapshots for cash_runway
      this.supabase
        .from('balance_sheet_snapshots')
        .select('cash_balance_try, monthly_burn_try, snapshot_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Partner loan tranches for loan_to_equity
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, total_repaid_try, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // Capital commitments for fulfillment pct
      this.supabase
        .from('partner_capital_commitments')
        .select('committed_try, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ])

    // ── Extract data safely ─────────────────────────────────────────────────
    const salesRows = salesResult.status === 'fulfilled'
      ? (salesResult.value.data ?? [])
      : []
    const expenseRows = expensesResult.status === 'fulfilled'
      ? (expensesResult.value.data ?? [])
      : []
    const balanceRows = balanceSheetResult.status === 'fulfilled'
      ? (balanceSheetResult.value.data ?? [])
      : []
    const loanRows = partnerLoansResult.status === 'fulfilled'
      ? (partnerLoansResult.value.data ?? [])
      : []
    const capitalRows = capitalCommitmentsResult.status === 'fulfilled'
      ? (capitalCommitmentsResult.value.data ?? [])
      : []

    // ── Compute KPI values ──────────────────────────────────────────────────
    const kpiValues: Record<string, number | null> = {}

    // gross_margin_pct: (revenue - cogs) / revenue * 100
    const totalRevenue = salesRows.reduce((s: number, r: { total_try?: number | null }) => s + Number(r.total_try ?? 0), 0)
    const totalCogs    = salesRows.reduce((s: number, r: { cost_try?: number | null }) => s + Number(r.cost_try ?? 0), 0)
    kpiValues['gross_margin_pct'] = totalRevenue > 0
      ? ((totalRevenue - totalCogs) / totalRevenue) * 100
      : null

    // expense_ratio_pct: total_expenses / total_revenue * 100
    const totalExpenses = expenseRows.reduce((s: number, r: { amount_try?: number | null }) => s + Number(r.amount_try ?? 0), 0)
    kpiValues['expense_ratio_pct'] = totalRevenue > 0
      ? (totalExpenses / totalRevenue) * 100
      : null

    // net_margin_pct: (revenue - cogs - expenses) / revenue * 100
    kpiValues['net_margin_pct'] = totalRevenue > 0
      ? ((totalRevenue - totalCogs - totalExpenses) / totalRevenue) * 100
      : null

    // cash_runway_months: cash_balance / monthly_burn
    if (balanceRows.length > 0) {
      const snap = balanceRows[0] as { cash_balance_try?: number | null; monthly_burn_try?: number | null }
      const cash = Number(snap.cash_balance_try ?? 0)
      const burn = Number(snap.monthly_burn_try ?? 0)
      kpiValues['cash_runway_months'] = burn > 0 ? cash / burn : null
    } else {
      kpiValues['cash_runway_months'] = null
    }

    // dso_days: avg days between sale_date and collection for paid invoices (30-day window)
    const paidSales = salesRows.filter((r: { payment_status?: string | null }) =>
      r.payment_status === 'paid' || r.payment_status === 'partial')
    if (paidSales.length > 0) {
      const totalDays = paidSales.reduce((s: number, r: { sale_date?: string | null; due_date?: string | null }) => {
        if (!r.sale_date || !r.due_date) return s
        const saleDt = new Date(r.sale_date + 'T00:00:00Z').getTime()
        const dueDt  = new Date(r.due_date  + 'T00:00:00Z').getTime()
        return s + Math.max(0, (dueDt - saleDt) / 86_400_000)
      }, 0)
      kpiValues['dso_days'] = totalDays / paidSales.length
    } else {
      kpiValues['dso_days'] = null
    }

    // overdue_receivables_pct: overdue amount / total receivables * 100
    const allReceivables = salesRows.filter((r: { payment_status?: string | null }) =>
      ['pending', 'partial', 'overdue', 'unpaid', 'paid'].includes(r.payment_status ?? ''))
    const overdueRows = salesRows.filter((r: { payment_status?: string | null; due_date?: string | null }) => {
      if (!r.due_date) return false
      return (r.payment_status === 'pending' || r.payment_status === 'partial' || r.payment_status === 'overdue' || r.payment_status === 'unpaid')
        && r.due_date < today
    })
    const totalReceivableAmt = allReceivables.reduce((s: number, r: { total_try?: number | null; paid_amount?: number | null }) =>
      s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)
    const overdueAmt = overdueRows.reduce((s: number, r: { total_try?: number | null; paid_amount?: number | null }) =>
      s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)
    kpiValues['overdue_receivables_pct'] = totalReceivableAmt > 0
      ? (overdueAmt / totalReceivableAmt) * 100
      : null

    // partner_loan_to_equity_pct
    const totalLoanBalance = loanRows.reduce((s: number, r: { principal_try?: number | null; total_repaid_try?: number | null }) =>
      s + Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)), 0)
    const totalCommitted   = capitalRows.reduce((s: number, r: { committed_try?: number | null }) => s + Number(r.committed_try ?? 0), 0)
    const totalPaidCapital = capitalRows.reduce((s: number, r: { paid_try?: number | null }) => s + Number(r.paid_try ?? 0), 0)
    kpiValues['partner_loan_to_equity_pct'] = totalPaidCapital > 0
      ? (totalLoanBalance / totalPaidCapital) * 100
      : null

    // capital_fulfillment_pct
    kpiValues['capital_fulfillment_pct'] = totalCommitted > 0
      ? (totalPaidCapital / totalCommitted) * 100
      : null

    // Remaining KPIs are not directly computable from these tables — leave as null
    // (burn_efficiency_ratio, customer_churn_risk_pct, revenue_concentration_hhi,
    //  inventory_days_outstanding, cash_conversion_cycle_days)
    kpiValues['burn_efficiency_ratio']       = null
    kpiValues['customer_churn_risk_pct']     = null
    kpiValues['revenue_concentration_hhi']   = null
    kpiValues['inventory_days_outstanding']  = null
    kpiValues['cash_conversion_cycle_days']  = null

    // ── Evaluate ──────────────────────────────────────────────────────────────
    const evaluations     = evaluateAllThresholds(DEFAULT_KPI_THRESHOLDS, kpiValues)
    const triggered_alerts = prioritizeAlertsBySeverity(filterTriggeredAlerts(evaluations))
    const alert_counts    = countAlertsBySeverity(triggered_alerts)
    const health_score    = computeAlertHealthScore(triggered_alerts)
    const health_level    = classifyAlertHealthLevel(health_score)
    const narrative       = generateAlertSummaryNarrative(alert_counts.critical, alert_counts.warning, health_level)

    // Group triggered alerts by category
    const alerts_by_category: Record<KpiCategory, ThresholdEvaluation[]> = {
      financial:   [],
      commercial:  [],
      operational: [],
      partner:     [],
    }
    for (const ev of triggered_alerts) {
      const threshold = DEFAULT_KPI_THRESHOLDS.find(t => t.kpi_key === ev.kpi_key)
      if (threshold) {
        alerts_by_category[threshold.category].push(ev)
      }
    }

    return {
      evaluations,
      triggered_alerts,
      alert_counts,
      health_score,
      health_level,
      alerts_by_category,
      narrative,
      thresholds_used: DEFAULT_KPI_THRESHOLDS,
    }
  }
}
