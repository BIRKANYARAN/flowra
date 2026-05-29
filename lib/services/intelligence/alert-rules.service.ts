// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/alert-rules.service.ts
//
// Configurable Alert Rules Engine
//
// Evaluates all financial/operational KPIs against configurable thresholds
// and generates prioritized alerts. This is the central alert hub.
//
// Pure functions are exported for unit testing.
// AlertRulesService class handles DB orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { BurnRateService }    from '@/lib/services/finance/burn-rate.service'
import { ExpenseAnomalyService } from '@/lib/services/finance/expense-anomaly.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ──────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'info' | 'warning' | 'critical'

export type AlertCategory =
  | 'cash'
  | 'receivables'
  | 'inventory'
  | 'partners'
  | 'compliance'
  | 'revenue'
  | 'expenses'
  | 'performance'

export interface Alert {
  id: string              // stable ID: category + rule_id
  severity: AlertSeverity
  category: AlertCategory
  title: string           // Turkish
  detail: string          // Turkish detail
  action_label: string    // Turkish CTA
  action_href: string     // internal route
  amount?: number         // relevant amount
  days?: number           // relevant days
  triggered_at: string    // ISO date
}

export interface AlertRule {
  id: string
  category: AlertCategory
  description: string
  default_threshold: number
  severity: AlertSeverity
  is_blocking: boolean
}

// ── Alert Rules Catalogue ─────────────────────────────────────────────────────

export const ALERT_RULES: AlertRule[] = [
  { id: 'cash_runway_30',     category: 'cash',        description: 'Nakit pisti 30 günün altında',               default_threshold: 30,  severity: 'critical', is_blocking: true  },
  { id: 'cash_runway_90',     category: 'cash',        description: 'Nakit pisti 90 günün altında',               default_threshold: 90,  severity: 'warning',  is_blocking: false },
  { id: 'overdue_60',         category: 'receivables', description: '60+ gün gecikmiş alacak',                    default_threshold: 60,  severity: 'critical', is_blocking: false },
  { id: 'overdue_30',         category: 'receivables', description: '30+ gün gecikmiş alacak',                    default_threshold: 30,  severity: 'warning',  is_blocking: false },
  { id: 'stock_critical',     category: 'inventory',   description: 'Kritik stok seviyesi',                       default_threshold: 0,   severity: 'critical', is_blocking: false },
  { id: 'stock_reorder',      category: 'inventory',   description: 'Sipariş noktasına yakın stok',               default_threshold: 0,   severity: 'warning',  is_blocking: false },
  { id: 'partner_loan_due',   category: 'partners',    description: 'Yaklaşan ortak borç vadesi (14 gün)',         default_threshold: 14,  severity: 'critical', is_blocking: false },
  { id: 'equity_gap',         category: 'partners',    description: 'Karşılanmamış sermaye taahhüdü',             default_threshold: 0,   severity: 'warning',  is_blocking: false },
  { id: 'kdv_due_soon',       category: 'compliance',  description: 'KDV beyannamesi yaklaşıyor (7 gün)',         default_threshold: 7,   severity: 'warning',  is_blocking: false },
  { id: 'period_not_closed',  category: 'compliance',  description: 'Dönem kapanışı 10+ gün gecikiyor',           default_threshold: 10,  severity: 'warning',  is_blocking: false },
  { id: 'revenue_decline_20', category: 'revenue',     description: 'Gelir %20 düştü (aylık)',                    default_threshold: 20,  severity: 'warning',  is_blocking: false },
  { id: 'expense_spike',      category: 'expenses',    description: 'Gider anormalliği tespit edildi',             default_threshold: 0,   severity: 'warning',  is_blocking: false },
  { id: 'dscr_below_1',       category: 'partners',    description: 'Borç karşılama oranı 1.0 altında',           default_threshold: 1.0, severity: 'critical', is_blocking: false },
]

// ── Category priority for sorting ────────────────────────────────────────────

const CATEGORY_PRIORITY: Record<AlertCategory, number> = {
  cash:        0,
  receivables: 1,
  compliance:  2,
  partners:    3,
  inventory:   4,
  revenue:     5,
  expenses:    6,
  performance: 7,
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 0,
  warning:  1,
  info:     2,
}

// ── Pure Functions ────────────────────────────────────────────────────────────

/**
 * Creates an Alert from a rule in ALERT_RULES.
 * Finds the rule by id, uses its severity and category.
 * If rule not found: severity='info', category='performance'.
 */
export function createAlert(
  ruleId: string,
  title: string,
  detail: string,
  overrides?: Partial<Alert>,
): Alert {
  const rule = ALERT_RULES.find(r => r.id === ruleId)

  const severity: AlertSeverity = rule?.severity ?? 'info'
  const category: AlertCategory = rule?.category ?? 'performance'

  return {
    id:           `${category}_${ruleId}`,
    severity,
    category,
    title,
    detail,
    action_label: 'İncele',
    action_href:  '/dashboard',
    triggered_at: new Date().toISOString().slice(0, 10),
    ...overrides,
  }
}

/**
 * Sort: critical first, then warning, then info.
 * Within same severity: sort by category priority:
 *   cash > receivables > compliance > partners > inventory > revenue > expenses > performance
 */
export function prioritizeAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return (CATEGORY_PRIORITY[a.category] ?? 7) - (CATEGORY_PRIORITY[b.category] ?? 7)
  })
}

/**
 * Remove alerts with duplicate id (keep first occurrence).
 */
export function deduplicateAlerts(alerts: Alert[]): Alert[] {
  const seen = new Set<string>()
  return alerts.filter(a => {
    if (seen.has(a.id)) return false
    seen.add(a.id)
    return true
  })
}

/**
 * Compute summary counts by severity and category.
 */
export function computeAlertSummary(alerts: Alert[]): {
  total: number
  critical: number
  warning: number
  info: number
  by_category: Record<AlertCategory, number>
} {
  const by_category: Record<AlertCategory, number> = {
    cash:        0,
    receivables: 0,
    inventory:   0,
    partners:    0,
    compliance:  0,
    revenue:     0,
    expenses:    0,
    performance: 0,
  }

  let critical = 0
  let warning  = 0
  let info     = 0

  for (const a of alerts) {
    if (a.severity === 'critical') critical++
    else if (a.severity === 'warning') warning++
    else info++
    by_category[a.category] = (by_category[a.category] ?? 0) + 1
  }

  return {
    total: alerts.length,
    critical,
    warning,
    info,
    by_category,
  }
}

/**
 * Returns only alerts with category in the provided array.
 */
export function filterAlertsByCategory(
  alerts: Alert[],
  categories: AlertCategory[],
): Alert[] {
  const set = new Set(categories)
  return alerts.filter(a => set.has(a.category))
}

/**
 * Returns false if alert.id is in acknowledgedIds.
 */
export function isAlertActive(
  alert: Alert,
  acknowledgedIds: Set<string>,
): boolean {
  return !acknowledgedIds.has(alert.id)
}

/**
 * Score 0-100 based on active alerts:
 *   Start with 100
 *   Each critical: -15
 *   Each warning: -5
 *   Each info: -1
 * Clamp to [0, 100].
 */
export function computeAlertHealthScore(alerts: Alert[]): number {
  let score = 100
  for (const a of alerts) {
    if (a.severity === 'critical') score -= 15
    else if (a.severity === 'warning') score -= 5
    else score -= 1
  }
  return Math.max(0, Math.min(100, score))
}

// ── Service Class ──────────────────────────────────────────────────────────────

export class AlertRulesService {
  constructor(private readonly supabase: AnyClient) {}

  async getAlerts(companyId: string): Promise<{
    alerts: Alert[]
    summary: ReturnType<typeof computeAlertSummary>
    health_score: number
    last_evaluated: string
  }> {
    const now       = new Date()
    const today     = now.toISOString().slice(0, 10)
    const alerts: Alert[] = []

    // ── Date helpers ────────────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
    const sixtyDaysAgo  = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
    const in14Days      = new Date(now.getTime() + 14 * 86_400_000).toISOString().slice(0, 10)

    // Current month / last month for revenue comparison
    const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastMonthDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10)

    // ── Run all queries in parallel ──────────────────────────────────────────
    const [
      burnResult,
      overdue30Result,
      overdue60Result,
      stockResult,
      loanDueResult,
      equityGapResult,
      periodResult,
      revenueThisMonthResult,
      revenueLastMonthResult,
      loansForDscrResult,
      salesForDscrResult,
    ] = await Promise.allSettled([

      // 1. Cash runway (burn rate)
      BurnRateService.getReport(companyId, this.supabase, now),

      // 2. Overdue 30 days
      this.supabase
        .from('sales')
        .select('id, total_try, paid_amount, due_date, customer_name')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue', 'unpaid'])
        .not('due_date', 'is', null)
        .lt('due_date', thirtyDaysAgo),

      // 3. Overdue 60 days
      this.supabase
        .from('sales')
        .select('id, total_try, paid_amount, due_date, customer_name')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue', 'unpaid'])
        .not('due_date', 'is', null)
        .lt('due_date', sixtyDaysAgo),

      // 4. Stock lots (critical/reorder)
      this.supabase
        .from('stock_lots')
        .select('qty_remaining, products(id, name, stock_alert_qty)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('qty_remaining', 0),

      // 5. Partner loans due in 14 days
      this.supabase
        .from('partner_loan_tranches')
        .select('id, partner_id, principal_try, total_repaid_try, expected_repayment_date, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid'])
        .not('expected_repayment_date', 'is', null)
        .lte('expected_repayment_date', in14Days)
        .gte('expected_repayment_date', today),

      // 6. Equity gaps (committed > paid)
      this.supabase
        .from('partner_capital_commitments')
        .select('partner_id, committed_try, paid_try')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // 7. Open accounting periods (not closed, end_date + 10 < today)
      this.supabase
        .from('accounting_periods')
        .select('id, period_end, status')
        .eq('company_id', companyId)
        .in('status', ['open', 'pre_close'])
        .lt('period_end', thirtyDaysAgo),   // at least 10 days overdue — use 30d ago query; we check days below

      // 8. This month revenue
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', thisMonthStart)
        .lte('sale_date', today),

      // 9. Last month revenue
      this.supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', lastMonthStart)
        .lte('sale_date', lastMonthEnd),

      // 10. Active partner loans (for DSCR)
      this.supabase
        .from('partner_loan_tranches')
        .select('principal_try, total_repaid_try, interest_rate_annual_pct, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // 11. This month sales for DSCR (monthly net income approximation)
      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', thisMonthStart)
        .lte('expense_date', today),
    ])

    // ── 1. Cash runway alerts ─────────────────────────────────────────────────
    if (burnResult.status === 'fulfilled') {
      const burn = burnResult.value
      const runwayDays = (burn.runway_estimate_months ?? 999) * 30

      if (runwayDays < 30) {
        alerts.push(createAlert(
          'cash_runway_30',
          'Kritik Nakit Pisti',
          `Nakit pisti ${Math.round(runwayDays)} gün — acil aksiyon gerekiyor.`,
          {
            action_href:  '/dashboard/finance?tab=cashflow',
            action_label: 'Nakit Akışını Gör',
            days:         Math.round(runwayDays),
          },
        ))
      } else if (runwayDays < 90) {
        alerts.push(createAlert(
          'cash_runway_90',
          'Nakit Pisti Uyarısı',
          `Nakit pisti ${Math.round(runwayDays)} gün — finansal tampon azalıyor.`,
          {
            action_href:  '/dashboard/finance?tab=cashflow',
            action_label: 'Nakit Akışını Gör',
            days:         Math.round(runwayDays),
          },
        ))
      }
    }

    // ── 2. Overdue 60 days ────────────────────────────────────────────────────
    const overdue60Rows = overdue60Result.status === 'fulfilled'
      ? (overdue60Result.value.data ?? [])
      : []

    if (overdue60Rows.length > 0) {
      const totalAmt = overdue60Rows.reduce((s: number, r: { total_try?: number | null; paid_amount?: number | null }) =>
        s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)

      alerts.push(createAlert(
        'overdue_60',
        '60+ Gün Gecikmiş Alacak',
        `${overdue60Rows.length} fatura 60 günü aşkın gecikmiş — toplam ₺${Math.round(totalAmt).toLocaleString('tr-TR')}.`,
        {
          action_href:  '/dashboard/commercial',
          action_label: 'Alacakları Gör',
          amount:       totalAmt,
          days:         60,
        },
      ))
    }

    // ── 3. Overdue 30 days ────────────────────────────────────────────────────
    const overdue30Rows = overdue30Result.status === 'fulfilled'
      ? (overdue30Result.value.data ?? [])
      : []

    // Only emit overdue_30 if it's additional invoices not already in overdue_60
    const overdue30Only = overdue30Rows.length - overdue60Rows.length
    if (overdue30Only > 0) {
      const totalAmt30 = overdue30Rows
        .slice(0, overdue30Only)
        .reduce((s: number, r: { total_try?: number | null; paid_amount?: number | null }) =>
          s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)

      alerts.push(createAlert(
        'overdue_30',
        '30+ Gün Gecikmiş Alacak',
        `${overdue30Only} fatura 30 günü aşkın gecikmiş — toplam ₺${Math.round(totalAmt30).toLocaleString('tr-TR')}.`,
        {
          action_href:  '/dashboard/commercial',
          action_label: 'Alacakları Gör',
          amount:       totalAmt30,
          days:         30,
        },
      ))
    }

    // ── 4. Stock alerts ────────────────────────────────────────────────────────
    const stockRows = stockResult.status === 'fulfilled'
      ? (stockResult.value.data ?? [])
      : []

    // Aggregate qty by product
    const qtyByProduct = new Map<string, { qty: number; alert_qty: number; name: string }>()
    for (const row of stockRows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = (row as any).products
      const productId = String(product?.id ?? 'unknown')
      const alertQty  = Number(product?.stock_alert_qty ?? 0)
      const name      = String(product?.name ?? productId)
      const qty       = Number(row.qty_remaining ?? 0)
      const prev      = qtyByProduct.get(productId)
      if (prev) {
        qtyByProduct.set(productId, { qty: prev.qty + qty, alert_qty: alertQty, name })
      } else {
        qtyByProduct.set(productId, { qty, alert_qty: alertQty, name })
      }
    }

    let criticalCount = 0
    let reorderCount  = 0
    for (const { qty, alert_qty } of qtyByProduct.values()) {
      if (qty === 0) criticalCount++
      else if (alert_qty > 0 && qty <= alert_qty) criticalCount++
      else if (alert_qty > 0 && qty <= alert_qty * 2) reorderCount++
    }

    if (criticalCount > 0) {
      alerts.push(createAlert(
        'stock_critical',
        'Kritik Stok Seviyesi',
        `${criticalCount} üründe stok kritik seviyede veya tükenmiş.`,
        {
          action_href:  '/dashboard/inventory',
          action_label: 'Stok Durumunu Gör',
        },
      ))
    }

    if (reorderCount > 0) {
      alerts.push(createAlert(
        'stock_reorder',
        'Stok Sipariş Noktası',
        `${reorderCount} üründe sipariş noktasına yakın stok seviyesi.`,
        {
          action_href:  '/dashboard/inventory',
          action_label: 'Stok Durumunu Gör',
        },
      ))
    }

    // ── 5. Partner loan due in 14 days ────────────────────────────────────────
    const loanDueRows = loanDueResult.status === 'fulfilled'
      ? (loanDueResult.value.data ?? [])
      : []

    if (loanDueRows.length > 0) {
      const totalDue = loanDueRows.reduce((s: number, r: { principal_try?: number | null; total_repaid_try?: number | null }) =>
        s + Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)), 0)

      // Find soonest due date
      const soonestDate = loanDueRows
        .map((r: { expected_repayment_date?: string | null }) => r.expected_repayment_date)
        .filter(Boolean)
        .sort()[0]
      const daysLeft = soonestDate
        ? Math.max(0, Math.round((new Date(soonestDate).getTime() - now.getTime()) / 86_400_000))
        : 14

      alerts.push(createAlert(
        'partner_loan_due',
        'Yaklaşan Ortak Borç Vadesi',
        `${loanDueRows.length} ortak borç taksidi 14 gün içinde vadeli — toplam ₺${Math.round(totalDue).toLocaleString('tr-TR')}.`,
        {
          action_href:  '/dashboard/partners',
          action_label: 'Borç Takibini Gör',
          amount:       totalDue,
          days:         daysLeft,
        },
      ))
    }

    // ── 6. Equity gap ──────────────────────────────────────────────────────────
    const equityGapRows = equityGapResult.status === 'fulfilled'
      ? (equityGapResult.value.data ?? [])
      : []

    const totalGap = equityGapRows.reduce((s: number, r: { committed_try?: number | null; paid_try?: number | null }) =>
      s + Math.max(0, Number(r.committed_try ?? 0) - Number(r.paid_try ?? 0)), 0)

    if (totalGap > 0) {
      alerts.push(createAlert(
        'equity_gap',
        'Karşılanmamış Sermaye Taahhüdü',
        `₺${Math.round(totalGap).toLocaleString('tr-TR')} tutarında ödenmemiş sermaye taahhüdü mevcut.`,
        {
          action_href:  '/dashboard/partners',
          action_label: 'Sermaye Taahhütlerini Gör',
          amount:       totalGap,
        },
      ))
    }

    // ── 7. KDV due soon (7 days) ──────────────────────────────────────────────
    // KDV for current month is due on 24th of next month
    const kvdDueMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2  // next month (1-indexed)
    const kdvDueYear  = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
    const kdvDueDate  = new Date(kdvDueYear, kvdDueMonth - 1, 24)
    const kdvDaysLeft = Math.round((kdvDueDate.getTime() - now.getTime()) / 86_400_000)

    if (kdvDaysLeft >= 0 && kdvDaysLeft <= 7) {
      alerts.push(createAlert(
        'kdv_due_soon',
        'KDV Beyannamesi Yaklaşıyor',
        `KDV beyannamesi son tarihi ${kdvDaysLeft} gün içinde — ${kdvDueDate.toLocaleDateString('tr-TR')}.`,
        {
          action_href:  '/dashboard/cfo?tab=tax',
          action_label: 'Vergi Tablosunu Gör',
          days:         kdvDaysLeft,
        },
      ))
    }

    // ── 8. Period not closed ──────────────────────────────────────────────────
    const periodRows = periodResult.status === 'fulfilled'
      ? (periodResult.value.data ?? [])
      : []

    for (const period of periodRows) {
      const periodEnd    = new Date(period.period_end + 'T00:00:00Z')
      const daysOverdue  = Math.round((now.getTime() - periodEnd.getTime()) / 86_400_000)
      if (daysOverdue >= 10) {
        alerts.push(createAlert(
          'period_not_closed',
          'Dönem Kapanışı Gecikiyor',
          `${period.period_end} dönemi ${daysOverdue} gündür kapanmadı.`,
          {
            action_href:  '/dashboard/cfo?tab=period',
            action_label: 'Dönem Kapat',
            days:         daysOverdue,
          },
        ))
        break  // one alert is enough
      }
    }

    // ── 9. Revenue decline 20% ────────────────────────────────────────────────
    const thisMonthRevRows  = revenueThisMonthResult.status === 'fulfilled'
      ? (revenueThisMonthResult.value.data ?? [])
      : []
    const lastMonthRevRows  = revenueLastMonthResult.status === 'fulfilled'
      ? (revenueLastMonthResult.value.data ?? [])
      : []

    const thisMonthRev = thisMonthRevRows.reduce((s: number, r: { total_try?: number | null }) => s + Number(r.total_try ?? 0), 0)
    const lastMonthRev = lastMonthRevRows.reduce((s: number, r: { total_try?: number | null }) => s + Number(r.total_try ?? 0), 0)

    if (lastMonthRev > 0 && thisMonthRev > 0) {
      const declinePct = ((lastMonthRev - thisMonthRev) / lastMonthRev) * 100
      if (declinePct >= 20) {
        alerts.push(createAlert(
          'revenue_decline_20',
          'Gelir Düşüşü',
          `Bu ay gelir geçen aya kıyasla %${declinePct.toFixed(1)} düştü.`,
          {
            action_href:  '/dashboard/finance?tab=pnl',
            action_label: 'Gelir Raporunu Gör',
          },
        ))
      }
    }

    // ── 10. Expense spike ─────────────────────────────────────────────────────
    try {
      const anomalyService = new ExpenseAnomalyService(this.supabase)
      const anomalyReport  = await anomalyService.getReport(companyId)
      if (anomalyReport.high_severity_count > 0) {
        alerts.push(createAlert(
          'expense_spike',
          'Gider Anormalliği Tespit Edildi',
          `${anomalyReport.high_severity_count} yüksek seviyeli gider anormalliği bulundu.`,
          {
            action_href:  '/dashboard/finance?tab=expenses',
            action_label: 'Gider Analizini Gör',
          },
        ))
      }
    } catch {
      /* non-fatal — anomaly service optional */
    }

    // ── 11. DSCR below 1.0 ───────────────────────────────────────────────────
    const loansForDscr  = loansForDscrResult.status === 'fulfilled'
      ? (loansForDscrResult.value.data ?? [])
      : []
    const expensesForDscr = salesForDscrResult.status === 'fulfilled'
      ? (salesForDscrResult.value.data ?? [])
      : []

    // Estimate monthly debt service
    const monthlyDebtService = loansForDscr.reduce((s: number, r: { principal_try?: number | null; total_repaid_try?: number | null; interest_rate_annual_pct?: number | null }) => {
      const netLoan  = Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0))
      const rate     = Number(r.interest_rate_annual_pct ?? 0)
      return s + (rate > 0 ? netLoan * rate / 100 / 12 : netLoan * 0.015)
    }, 0)

    if (monthlyDebtService > 0) {
      const monthlyExpensesTotal = expensesForDscr.reduce((s: number, r: { amount_try?: number | null }) => s + Number(r.amount_try ?? 0), 0)
      const monthlyNetIncome     = thisMonthRev - monthlyExpensesTotal
      const dscr = monthlyNetIncome > 0 ? monthlyNetIncome / monthlyDebtService : 0

      if (dscr < 1.0 && dscr >= 0) {
        alerts.push(createAlert(
          'dscr_below_1',
          'Borç Karşılama Oranı Kritik',
          `DSCR ${dscr.toFixed(2)} — aylık gelir borç servisini karşılayamıyor.`,
          {
            action_href:  '/dashboard/partners',
            action_label: 'Borç Analizini Gör',
          },
        ))
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────────────
    const deduplicated  = deduplicateAlerts(alerts)
    const prioritized   = prioritizeAlerts(deduplicated)
    const summary       = computeAlertSummary(prioritized)
    const health_score  = computeAlertHealthScore(prioritized)

    return {
      alerts:         prioritized,
      summary,
      health_score,
      last_evaluated: now.toISOString(),
    }
  }
}
