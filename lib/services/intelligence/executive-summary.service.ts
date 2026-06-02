// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/executive-summary.service.ts
//
// Executive Summary Report Aggregator — "One-Stop CEO Report"
//
// Collects key metrics from Finance, Commercial, Operations, and Partners and
// produces a unified ExecutiveSummaryReport. Designed for the CEO Cockpit and
// future PDF export.
//
// All pure functions are exported at the top for testability. The
// ExecutiveSummaryService class handles DB orchestration and delegates to
// existing services where possible.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { round2 }             from '@/lib/calc'
import { BurnRateService }    from '@/lib/services/finance/burn-rate.service'
import { computePartnerRiskReport } from '@/lib/services/pcle/partner-risk.service'
import type { PartnerRiskInput, PartnerRiskReportInput } from '@/lib/services/pcle/partner-risk.service'
import { computeSituation }  from '@/lib/engines/situation.engine'
import { evaluateAlerts }    from '@/lib/engines/alert.engine'
import type { AlertInputs }  from '@/lib/engines/alert.engine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface FinanceSummary {
  gross_margin_pct:    number | null
  net_margin_pct:      number | null
  cash_runway_months:  number | null
  revenue_ytd_try:     number
  expenses_ytd_try:    number
  net_income_ytd_try:  number
  finance_score:       number
}

export interface CommercialSummary {
  active_customers:       number
  revenue_mom_pct:        number | null
  win_rate_pct:           number | null
  overdue_receivables_try: number
  overdue_count:          number
  commercial_score:       number
}

export interface OperationsSummary {
  total_products:       number
  critical_stock_count: number
  pending_orders_count: number
  fill_rate_pct:        number
  operations_score:     number
}

export interface PartnerSummary {
  total_partners:        number
  total_loan_balance_try: number
  max_risk_grade:        string     // worst partner risk grade A-F
  equity_gap_try:        number
  partners_score:        number
}

export interface ExecutiveSummaryReport {
  company_id:   string
  generated_at: string
  period_key:   string

  overall_score:  number
  overall_health: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  status_line:    string

  finance:    FinanceSummary
  commercial: CommercialSummary
  operations: OperationsSummary
  partners:   PartnerSummary

  top_alerts: Array<{
    severity: 'critical' | 'warning'
    area:     'finance' | 'commercial' | 'operations' | 'partners'
    message:  string
  }>

  top_positives: Array<{
    area:    'finance' | 'commercial' | 'operations' | 'partners'
    message: string
  }>
}

// ── Pure Score Functions ───────────────────────────────────────────────────────

/**
 * Compute overall company health score as a weighted average of sub-scores.
 * Weights: finance=35%, commercial=25%, operations=20%, partners=20%
 */
export function computeOverallHealthScore(
  financeScore:     number,
  commercialScore:  number,
  operationsScore:  number,
  partnersScore:    number,
): number {
  return round2(
    financeScore     * 0.35 +
    commercialScore  * 0.25 +
    operationsScore  * 0.20 +
    partnersScore    * 0.20,
  )
}

/**
 * Classify overall health score into a health tier.
 * ≥80: excellent | 65-79: good | 50-64: fair | 35-49: poor | <35: critical
 */
export function classifyOverallHealth(
  score: number,
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (score >= 80) return 'excellent'
  if (score >= 65) return 'good'
  if (score >= 50) return 'fair'
  if (score >= 35) return 'poor'
  return 'critical'
}

/**
 * Compute finance sub-score from three normalized inputs.
 *
 * Normalization:
 *   grossMarginPct  → 0%=0, 30%=60, 50%=100 (linear from 0→0 to 30→60 to 50→100)
 *   cashRunwayMonths → 0=0, 3=30, 12=100 (capped at 12 months = 100)
 *   netMarginPct    → 0%=0, 10%=50, 20%=100 (linear)
 *
 * Returns simple average of three normalized scores (0-100).
 */
export function computeFinanceScore(
  grossMarginPct:    number,  // actual %
  cashRunwayMonths:  number,  // actual months
  netMarginPct:      number,  // actual %
): number {
  // Normalize gross margin: 0%→0, 30%→60, 50%→100
  // Two segments: [0,30] maps to [0,60], [30,50] maps to [60,100]
  let normGross: number
  if (grossMarginPct <= 0) {
    normGross = 0
  } else if (grossMarginPct <= 30) {
    normGross = (grossMarginPct / 30) * 60
  } else if (grossMarginPct <= 50) {
    normGross = 60 + ((grossMarginPct - 30) / 20) * 40
  } else {
    normGross = 100
  }

  // Normalize runway: 0→0, 3→30, 12→100 (capped at 12)
  const cappedRunway = Math.min(cashRunwayMonths, 12)
  let normRunway: number
  if (cappedRunway <= 0) {
    normRunway = 0
  } else if (cappedRunway <= 3) {
    normRunway = (cappedRunway / 3) * 30
  } else {
    normRunway = 30 + ((cappedRunway - 3) / 9) * 70
  }

  // Normalize net margin: 0%→0, 10%→50, 20%→100
  let normNet: number
  if (netMarginPct <= 0) {
    normNet = 0
  } else if (netMarginPct <= 10) {
    normNet = (netMarginPct / 10) * 50
  } else if (netMarginPct <= 20) {
    normNet = 50 + ((netMarginPct - 10) / 10) * 50
  } else {
    normNet = 100
  }

  return round2((normGross + normRunway + normNet) / 3)
}

/**
 * Build a single-sentence Turkish status line.
 *
 * Examples:
 *   "Şirket mükemmel durumda — nakit akışı güçlü, büyüme devam ediyor."
 *   "Şirket dikkat gerektiriyor — tahsilat süresi uzuyor, stok azalıyor."
 */
export function buildExecutiveStatusLine(
  health:      'excellent' | 'good' | 'fair' | 'poor' | 'critical',
  topConcern:  string | null,
  topPositive: string | null,
): string {
  const healthLabels: Record<typeof health, string> = {
    excellent: 'mükemmel durumda',
    good:      'iyi durumda',
    fair:      'orta düzeyde',
    poor:      'dikkat gerektiriyor',
    critical:  'kritik durumda',
  }

  const label = healthLabels[health]

  if (topConcern && topPositive) {
    return `Şirket ${label} — ${topPositive}, ${topConcern}.`
  }
  if (topConcern) {
    return `Şirket ${label} — ${topConcern}.`
  }
  if (topPositive) {
    return `Şirket ${label} — ${topPositive}.`
  }

  // Fallback generic lines per health level
  const fallbacks: Record<typeof health, string> = {
    excellent: 'Şirket mükemmel durumda — nakit akışı güçlü, büyüme devam ediyor.',
    good:      'Şirket iyi durumda — temel göstergeler olumlu seyrediyor.',
    fair:      'Şirket orta düzeyde — bazı alanlarda dikkat gerekiyor.',
    poor:      'Şirket dikkat gerektiriyor — birden fazla alanda zayıflık var.',
    critical:  'Şirket kritik durumda — acil aksiyon gerekiyor.',
  }
  return fallbacks[health]
}

// ── Grade helpers ─────────────────────────────────────────────────────────────

function gradeToScore(grade: string): number {
  switch (grade) {
    case 'A': return 100
    case 'B': return 80
    case 'C': return 60
    case 'D': return 40
    case 'F': return 20
    default:  return 50
  }
}

// Grade order for finding the worst (F is worst, A is best)
const GRADE_ORDER: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 }

function worstGrade(grades: string[]): string {
  if (grades.length === 0) return 'A'
  return grades.reduce((worst, g) =>
    (GRADE_ORDER[g] ?? 0) < (GRADE_ORDER[worst] ?? 0) ? g : worst,
  )
}

// ── Service ───────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// CEO Cockpit — Unified ExecutiveSummary (Situation Room interface)
//
// This is the NEW interface for the CEO Executive Cockpit (app/dashboard).
// It is distinct from ExecutiveSummaryReport (the old 4-domain report above).
// ExecutiveSummaryService.compute() is a static method that uses the
// SituationEngine + AlertEngine and direct DB queries.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExecutiveSummary {
  situation: {
    composite_score: number
    status: 'healthy' | 'caution' | 'at-risk' | 'critical'
    situation_line: string
    components: {
      cash_score:       number
      profit_score:     number
      debt_score:       number
      receivable_score: number
      partner_score:    number
    }
  }
  kpis: {
    revenue_mtd_try:         number
    net_income_mtd_try:      number
    cash_balance_try:        number
    runway_months:           number | null
    accounts_receivable_try: number
    overdue_receivable_try:  number
    active_alerts:           number
    pending_workflows:       number
  }
  top_alerts: Array<{
    id:           string
    severity:     'info' | 'warning' | 'critical'
    title:        string
    detail:       string
    action_label: string | null
    action_href:  string | null
    amount_try:   number | null
  }>
  partner_strip: Array<{
    partner_id:          string
    name:                string
    share_pct:           number
    loan_outstanding_try: number
    burden_score:        number
    health:              'healthy' | 'attention' | 'critical'
  }>
  period: {
    label:         string
    status:        string
    days_since_end: number | null
  } | null
  computed_at: string
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Classify partner health from burden score (0-1 abs) */
export function classifyPartnerHealth(
  burdenScoreAbs: number,
): 'healthy' | 'attention' | 'critical' {
  if (burdenScoreAbs < 0.15) return 'healthy'
  if (burdenScoreAbs < 0.35) return 'attention'
  return 'critical'
}

/** Map SituationStatus to Executive Summary partner health label */
export function situationStatusLabel(status: 'healthy' | 'caution' | 'at-risk' | 'critical'): string {
  switch (status) {
    case 'healthy':  return 'Sağlıklı'
    case 'caution':  return 'Dikkat'
    case 'at-risk':  return 'Risk'
    case 'critical': return 'Kritik'
  }
}

// ── Static compute ────────────────────────────────────────────────────────────

export class ExecutiveSummaryComputeService {
  static async compute(
    companyId: string,
    supabase:  AnyClient,
  ): Promise<ExecutiveSummary> {
    const now    = new Date()
    const today  = now.toISOString().slice(0, 10)
    const monthStart = today.slice(0, 7) + '-01'

    // ── Parallel DB queries ────────────────────────────────────────────────────
    const [
      salesMtd,
      expensesMtd,
      receivables,
      cashRow,
      partnersRow,
      loansRow,
      periodRow,
      workflowCount,
    ] = await Promise.allSettled([
      // MTD revenue
      supabase
        .from('sales')
        .select('total_try, cost_of_goods_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('payment_status', 'eq', 'cancelled')
        .gte('sale_date', monthStart)
        .lte('sale_date', today),

      // MTD expenses
      supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', monthStart)
        .lte('expense_date', today),

      // Receivables (all open)
      supabase
        .from('sales')
        .select('total_try, paid_amount, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue', 'unpaid']),

      // Cash balance from bank_transactions
      supabase
        .from('bank_transactions')
        .select('amount_try, type')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Partners
      supabase
        .from('partners')
        .select('id, name, share_ratio')
        .eq('company_id', companyId)
        .is('deleted_at', null),

      // Loans
      supabase
        .from('partner_loan_tranches')
        .select('partner_id, principal_try, total_repaid_try, status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('status', ['active', 'partially_repaid', 'overdue']),

      // Current period
      supabase
        .from('accounting_periods')
        .select('period_start, period_end, status, label')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .order('period_start', { ascending: false })
        .limit(1),

      // Pending workflows
      (supabase as SupabaseClient)
        .from('approval_workflows')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending'),
    ])

    // ── Derive KPIs ────────────────────────────────────────────────────────────
    const salesRows    = salesMtd.status === 'fulfilled' ? (salesMtd.value.data ?? []) : []
    const expenseRows  = expensesMtd.status === 'fulfilled' ? (expensesMtd.value.data ?? []) : []
    const recRows      = receivables.status === 'fulfilled' ? (receivables.value.data ?? []) : []
    const txRows       = cashRow.status === 'fulfilled' ? (cashRow.value.data ?? []) : []
    const partners     = partnersRow.status === 'fulfilled' ? (partnersRow.value.data ?? []) : []
    const loans        = loansRow.status === 'fulfilled' ? (loansRow.value.data ?? []) : []
    const periods      = periodRow.status === 'fulfilled' ? (periodRow.value.data ?? []) : []
    const pendingWf    = workflowCount.status === 'fulfilled'
      ? ((workflowCount.value as { count?: number | null }).count ?? 0)
      : 0

    type SaleRow = { total_try?: number | null; cost_of_goods_try?: number | null }
    type ExpRow  = { amount_try?: number | null }
    type RecRow  = { total_try?: number | null; paid_amount?: number | null; due_date?: string | null }
    type TxRow   = { amount_try?: number | null; type?: string | null }
    type PartnerRow = { id?: string | null; name?: string | null; share_ratio?: number | null }
    type LoanRow = { partner_id?: string | null; principal_try?: number | null; total_repaid_try?: number | null }
    type PeriodRow = { period_start?: string | null; period_end?: string | null; status?: string | null; label?: string | null }

    const revenueMtd  = (salesRows as SaleRow[]).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const cogsMtd     = (salesRows as SaleRow[]).reduce((s, r) => s + Number(r.cost_of_goods_try ?? 0), 0)
    const expMtd      = (expenseRows as ExpRow[]).reduce((s, r) => s + Number(r.amount_try ?? 0), 0)
    const netMtd      = revenueMtd - cogsMtd - expMtd

    // Cash balance: sum of inflow - outflow from bank transactions
    const cashBalance = (txRows as TxRow[]).reduce((s, r) => {
      const amt = Number(r.amount_try ?? 0)
      return r.type === 'credit' ? s + amt : s - amt
    }, 0)

    // Receivables
    const arTotal  = (recRows as RecRow[]).reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)
    const arOverdue = (recRows as RecRow[]).filter(r => r.due_date && r.due_date < today)
      .reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0)
    const overdueCount60 = (recRows as RecRow[]).filter(r => {
      if (!r.due_date) return false
      const daysDiff = (now.getTime() - new Date(r.due_date).getTime()) / 86_400_000
      return daysDiff >= 60
    }).length

    // Partner loans
    type PartnerLoanMap = Map<string, number>
    const loanByPartner: PartnerLoanMap = new Map()
    for (const l of (loans as LoanRow[])) {
      const pid = String(l.partner_id ?? '')
      if (!pid) continue
      const net = Math.max(0, Number(l.principal_try ?? 0) - Number(l.total_repaid_try ?? 0))
      loanByPartner.set(pid, (loanByPartner.get(pid) ?? 0) + net)
    }
    const totalLoanBalance = Array.from(loanByPartner.values()).reduce((s, v) => s + v, 0)

    // Burden scores per partner (normalized 0-1 abs)
    const totalPartners = (partners as PartnerRow[]).length
    const partnerStrip = (partners as PartnerRow[]).map(p => {
      const pid     = String(p.id ?? '')
      const sharePct = Number(p.share_ratio ?? 0) * 100
      const loan     = loanByPartner.get(pid) ?? 0
      // Burden = deviation from share-weighted loan allocation
      const expectedLoan = totalLoanBalance * (sharePct / 100)
      const burdenAbs    = totalLoanBalance > 0
        ? Math.abs(loan - expectedLoan) / totalLoanBalance
        : 0
      return {
        partner_id:           pid,
        name:                 String(p.name ?? pid),
        share_pct:            round2(sharePct),
        loan_outstanding_try: round2(loan),
        burden_score:         round2(burdenAbs),
        health:               classifyPartnerHealth(burdenAbs),
      }
    })

    const maxBurdenAbs = partnerStrip.reduce((m, p) => Math.max(m, p.burden_score), 0)

    // DSR: total monthly loan payment / monthly net income
    // Approximate monthly loan payment as 1.5% of outstanding balance
    const estMonthlyDebtSvc = totalLoanBalance * 0.015
    const debtServiceRatio  = netMtd > 0 ? estMonthlyDebtSvc / netMtd : (totalLoanBalance > 0 ? 1 : 0)

    // Net margin
    const netMarginPct = revenueMtd > 0 ? netMtd / revenueMtd : 0

    // Cash runway
    const monthlyBurn = expMtd + cogsMtd - revenueMtd  // positive = burning
    const runwayMonths: number | null = monthlyBurn > 0 && cashBalance > 0
      ? round2(cashBalance / monthlyBurn)
      : (revenueMtd >= expMtd + cogsMtd ? null : null)
    const isProfitable = netMtd >= 0

    // Overdue ratio
    const overdueRatioPct = arTotal > 0 ? round2((arOverdue / arTotal) * 100) : 0

    // ── Alert Evaluation ───────────────────────────────────────────────────────
    const alertInputs: AlertInputs = {
      overdueCount30:           (recRows as RecRow[]).filter(r => r.due_date && r.due_date < today).length,
      overdueTotal30:           arOverdue,
      overdueCount60,
      overdueTotal60:           (recRows as RecRow[]).filter(r => {
        if (!r.due_date) return false
        const d = (now.getTime() - new Date(r.due_date).getTime()) / 86_400_000
        return d >= 60
      }).reduce((s, r) => s + Math.max(0, Number((r as RecRow).total_try ?? 0) - Number((r as RecRow).paid_amount ?? 0)), 0),
      totalReceivables:         arTotal,
      cashRunwayDays:           runwayMonths !== null ? Math.round(runwayMonths * 30) : -1,
      monthlyNetIncome:         netMtd,
      maxBurdenScoreAbs:        maxBurdenAbs,
      nextTrancheDueDays:       -1,   // full tranche schedule not loaded in this query
      nextTrancheAmount:        0,
      openPeriodDaysOverdue:    -1,   // evaluated separately below
      kdvPayable:               0,    // not loaded in quick summary
      taxDueDays:               -1,
      bsImbalanceTry:           0,
      legalReserveDeficit:      0,
      equityGapTry:             0,
      equityCallOverdueDays:    -1,
      debtServiceRatio,
      partnerLoanConcentration: totalPartners > 1 && totalLoanBalance > 0
        ? Math.max(...Array.from(loanByPartner.values())) / totalLoanBalance
        : 0,
    }

    const allAlerts = evaluateAlerts(alertInputs)
    const activeAlertCounts = {
      critical: allAlerts.filter(a => a.severity === 'critical').length,
      warning:  allAlerts.filter(a => a.severity === 'warning').length,
      info:     allAlerts.filter(a => a.severity === 'info').length,
    }

    // ── Situation Engine ───────────────────────────────────────────────────────
    const situation = computeSituation({
      cashRunwayMonths: runwayMonths ?? (isProfitable ? 12 : 0),
      isProfitable,
      netMarginPct,
      debtServiceRatio,
      overdueRatioPct,
      maxBurdenScoreAbs: maxBurdenAbs,
      activeAlertCounts,
    })

    // ── Period ─────────────────────────────────────────────────────────────────
    let period: ExecutiveSummary['period'] = null
    if (periods.length > 0) {
      const p = periods[0] as PeriodRow
      const periodEnd  = p.period_end ?? null
      const daysSince  = periodEnd
        ? Math.floor((now.getTime() - new Date(periodEnd).getTime()) / 86_400_000)
        : null
      period = {
        label:          String(p.label ?? p.period_start ?? 'Dönem'),
        status:         String(p.status ?? 'open'),
        days_since_end: daysSince,
      }
    }

    // ── Assemble ───────────────────────────────────────────────────────────────
    const topAlerts = allAlerts.slice(0, 5).map(a => ({
      id:           a.id,
      severity:     a.severity,
      title:        a.title,
      detail:       a.detail,
      action_label: a.actionLabel ?? null,
      action_href:  a.actionHref  ?? null,
      amount_try:   a.amount      ?? null,
    }))

    return {
      situation: {
        composite_score: situation.composite,
        status:          situation.status,
        situation_line:  situation.situationLine,
        components: {
          cash_score:       situation.scores.cash,
          profit_score:     situation.scores.profit,
          debt_score:       situation.scores.debt,
          receivable_score: situation.scores.receivables,
          partner_score:    situation.scores.partner,
        },
      },
      kpis: {
        revenue_mtd_try:         round2(revenueMtd),
        net_income_mtd_try:      round2(netMtd),
        cash_balance_try:        round2(cashBalance),
        runway_months:           runwayMonths,
        accounts_receivable_try: round2(arTotal),
        overdue_receivable_try:  round2(arOverdue),
        active_alerts:           activeAlertCounts.critical + activeAlertCounts.warning,
        pending_workflows:       pendingWf,
      },
      top_alerts:   topAlerts,
      partner_strip: partnerStrip,
      period,
      computed_at:  now.toISOString(),
    }
  }
}
