// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/insights
//
// Rule-based Insight Engine — deterministic Turkish BI summaries.
// Auth: any authenticated company member.
// Cached: 300s (revalidate: 300) — insights change with data.
//
// Orchestrates parallel fetch of:
//   - revenue trend (last 12 months linear regression)
//   - expense ratio + anomaly data
//   - burn rate / runway
//   - receivables overdue + DSO
//   - partner risk grades
//
// Returns: InsightReport
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import {
  buildInsightReport,
  type RevenueInsightParams,
  type ExpenseInsightParams,
  type CashInsightParams,
  type ReceivablesInsightParams,
  type PartnerInsightParams,
} from '@/lib/services/intelligence/insight-engine.service'
import { BurnRateService }           from '@/lib/services/finance/burn-rate.service'
import { ExpenseAnomalyService }     from '@/lib/services/finance/expense-anomaly.service'
import type { SupabaseClient }       from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Helpers ────────────────────────────────────────────────────────────────────

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() } catch { return fallback }
}

/** Simple linear regression for slope and R².
 *  xs, ys must be same length. Returns null if < 2 points. */
function linearRegression(ys: number[]): { slope: number; r_squared: number } | null {
  const n = ys.length
  if (n < 2) return null
  const xs = Array.from({ length: n }, (_, i) => i)
  const xMean = (n - 1) / 2
  const yMean = ys.reduce((s, v) => s + v, 0) / n
  let ssxy = 0; let ssxx = 0; let ssyy = 0
  for (let i = 0; i < n; i++) {
    ssxy += (xs[i] - xMean) * (ys[i] - yMean)
    ssxx += (xs[i] - xMean) ** 2
    ssyy += (ys[i] - yMean) ** 2
  }
  if (ssxx === 0) return null
  const slope = ssxy / ssxx
  const r_squared = ssyy === 0 ? 1 : (ssxy ** 2) / (ssxx * ssyy)
  return { slope, r_squared }
}

/** Fetch monthly revenue for last 12 months (oldest first). */
async function fetchRevenueParams(
  companyId: string,
  supabase: AnyClient,
): Promise<RevenueInsightParams> {
  const now = new Date()
  const months: Array<{ from: string; to: string }> = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year  = d.getFullYear()
    const month = d.getMonth() + 1
    const from  = `${year}-${String(month).padStart(2,'0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to    = `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    months.push({ from, to })
  }

  const window_from = months[0].from
  const window_to   = months[months.length - 1].to

  const [salesRes, yoyRes] = await Promise.allSettled([
    supabase
      .from('sales')
      .select('sale_date, total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', window_from)
      .lte('sale_date', window_to),

    // Same 12-month window 1 year ago for YoY
    supabase
      .from('sales')
      .select('sale_date, total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', new Date(new Date(window_from).setFullYear(new Date(window_from).getFullYear() - 1)).toISOString().slice(0,10))
      .lte('sale_date', new Date(new Date(window_to).setFullYear(new Date(window_to).getFullYear() - 1)).toISOString().slice(0,10)),
  ])

  const revByMonth = new Map<string, number>()
  if (salesRes.status === 'fulfilled' && salesRes.value?.data) {
    for (const row of salesRes.value.data) {
      const key = (row.sale_date as string).slice(0, 7)
      revByMonth.set(key, (revByMonth.get(key) ?? 0) + Number(row.total_try ?? 0))
    }
  }

  const monthKeys = months.map(m => m.from.slice(0, 7))
  const revenuePoints = monthKeys.map(k => revByMonth.get(k) ?? 0)
  const currentMonthRevenue = revenuePoints[revenuePoints.length - 1] ?? 0
  const priorMonthRevenue   = revenuePoints[revenuePoints.length - 2] ?? 0

  const reg = linearRegression(revenuePoints.filter(v => v > 0))
  const trend_slope     = reg?.slope ?? null
  const trend_r_squared = reg?.r_squared ?? null

  // YoY: sum of last 12 months vs same period last year
  const currentTotal = revenuePoints.reduce((s, v) => s + v, 0)
  let yoy_change_pct: number | null = null
  if (yoyRes.status === 'fulfilled' && yoyRes.value?.data) {
    const yoyTotal = yoyRes.value.data.reduce((s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0)
    if (yoyTotal > 0) {
      yoy_change_pct = ((currentTotal - yoyTotal) / yoyTotal) * 100
    }
  }

  return {
    trend_slope,
    trend_r_squared,
    current_month_revenue: currentMonthRevenue,
    prior_month_revenue:   priorMonthRevenue,
    yoy_change_pct,
  }
}

/** Fetch expense ratio + anomaly data. */
async function fetchExpenseParams(
  companyId: string,
  supabase: AnyClient,
): Promise<ExpenseInsightParams> {
  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const from  = `${year}-${String(month).padStart(2,'0')}-01`
  const to    = now.toISOString().slice(0, 10)

  const [expRes, salesRes, anomalyReport] = await Promise.allSettled([
    supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', from)
      .lte('expense_date', to),

    supabase
      .from('sales')
      .select('total_try:total')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', from)
      .lte('sale_date', to),

    new ExpenseAnomalyService(supabase).getReport(companyId),
  ])

  const expenses = expRes.status === 'fulfilled' ? (expRes.value?.data ?? []) : []
  const totalExpenses = expenses.reduce((s: number, r: { amount_try: number }) => s + Number(r.amount_try ?? 0), 0)

  const revenue = salesRes.status === 'fulfilled'
    ? (salesRes.value?.data ?? []).reduce((s: number, r: { total_try: number }) => s + Number(r.total_try ?? 0), 0)
    : 0

  const expense_ratio_pct = revenue > 0 ? (totalExpenses / revenue) * 100 : null

  // Top category
  const catMap = new Map<string, number>()
  for (const r of expenses as Array<{ amount_try: number; expense_type: string | null }>) {
    const cat = r.expense_type ?? 'other'
    catMap.set(cat, (catMap.get(cat) ?? 0) + Number(r.amount_try ?? 0))
  }
  let top_category: string | null = null
  let top_category_pct: number | null = null
  if (totalExpenses > 0 && catMap.size > 0) {
    let maxAmt = 0
    for (const [cat, amt] of catMap.entries()) {
      if (amt > maxAmt) { maxAmt = amt; top_category = cat }
    }
    top_category_pct = top_category ? (maxAmt / totalExpenses) * 100 : null
  }

  const anomaly = anomalyReport.status === 'fulfilled' ? anomalyReport.value : null

  return {
    expense_ratio_pct,
    anomaly_count:     anomaly?.anomalies?.length ?? 0,
    anomaly_total_try: anomaly?.total_anomalous_amount_try ?? 0,
    top_category,
    top_category_pct,
  }
}

/** Fetch cash/burn data. */
async function fetchCashParams(
  companyId: string,
  supabase: AnyClient,
): Promise<CashInsightParams> {
  const burnReport = await BurnRateService.getReport(companyId, supabase)

  // Derive cash balance from balance_sheet_snapshots if available
  const cashRes = await supabase
    .from('balance_sheet_snapshots')
    .select('cash_and_equivalents_try')
    .eq('company_id', companyId)
    .order('snapshot_date', { ascending: false })
    .limit(1)

  const cashBalance = cashRes?.data?.[0]?.cash_and_equivalents_try ?? null
  const avg_net_burn = burnReport.avg_net_burn_try

  let runway_months: number | null = null
  if (cashBalance !== null && cashBalance > 0 && avg_net_burn > 0) {
    runway_months = Math.round((cashBalance / avg_net_burn) * 10) / 10
  } else if (burnReport.runway_estimate_months !== null) {
    runway_months = burnReport.runway_estimate_months
  }

  return {
    runway_months,
    cash_trend: burnReport.burn_trend === 'insufficient_data' ? null : burnReport.burn_trend,
  }
}

/** Fetch receivables data. */
async function fetchReceivablesParams(
  companyId: string,
  supabase: AnyClient,
): Promise<ReceivablesInsightParams> {
  const today = new Date().toISOString().slice(0, 10)

  const salesRes = await supabase
    .from('sales')
    .select('total_try:total, amount_paid:paid_amount, sale_date, due_date')
    .eq('company_id', companyId)
    .neq('payment_status', 'paid')
    .is('deleted_at', null)

  const rows = salesRes?.data ?? []
  if (rows.length === 0) return { overdue_pct: null, dso_days: null }

  const totalReceivables = rows.reduce((s: number, r: { total_try: number; amount_paid: number | null }) =>
    s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

  const overdueRows = rows.filter((r: { due_date: string | null; sale_date: string }) => {
    const due = r.due_date ?? r.sale_date
    return due < today
  })
  const overdueTotal = overdueRows.reduce((s: number, r: { total_try: number; amount_paid: number | null }) =>
    s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

  const overdue_pct = totalReceivables > 0 ? (overdueTotal / totalReceivables) * 100 : null

  // DSO: average days between sale_date and today for uncollected
  const totalAgeDays = rows.reduce((s: number, r: { sale_date: string }) =>
    s + Math.max(0, (Date.now() - new Date(r.sale_date).getTime()) / 86_400_000), 0)
  const dso_days = rows.length > 0 ? totalAgeDays / rows.length : null

  return { overdue_pct, dso_days }
}

/** Fetch partner risk params. */
async function fetchPartnerParams(
  companyId: string,
  supabase: AnyClient,
): Promise<PartnerInsightParams> {
  // Try partner risk table or fall back to empty
  const riskRes = await supabase
    .from('partners')
    .select('id, name')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  const partnerRows = riskRes?.data ?? []
  if (partnerRows.length === 0) return { partners: [] }

  // Total outstanding loans for concentration calc
  const loanRes = await supabase
    .from('partner_loan_tranches')
    .select('partner_id, outstanding_try')
    .eq('company_id', companyId)
    .eq('status', 'active')

  const loanRows = loanRes?.data ?? []
  const totalLoans = loanRows.reduce((s: number, r: { outstanding_try: number }) => s + Number(r.outstanding_try ?? 0), 0)

  const loanByPartner = new Map<string, number>()
  for (const r of loanRows as Array<{ partner_id: string; outstanding_try: number }>) {
    loanByPartner.set(r.partner_id, (loanByPartner.get(r.partner_id) ?? 0) + Number(r.outstanding_try ?? 0))
  }

  const partners = partnerRows.map((p: { id: string; name: string }) => {
    const partnerLoan = loanByPartner.get(p.id) ?? 0
    const debt_concentration_pct = totalLoans > 0 ? (partnerLoan / totalLoans) * 100 : null
    return {
      name: p.name,
      grade: null,  // grade would come from partner-risk analysis if available
      debt_concentration_pct,
    }
  })

  return { partners }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid: _uid, companyId, supabase } = auth

    const [revenueParams, expenseParams, cashParams, receivablesParams, partnerParams] =
      await Promise.all([
        safe(() => fetchRevenueParams(companyId, supabase),     { trend_slope: null, trend_r_squared: null, current_month_revenue: 0, prior_month_revenue: 0, yoy_change_pct: null }),
        safe(() => fetchExpenseParams(companyId, supabase),     { expense_ratio_pct: null, anomaly_count: 0, anomaly_total_try: 0, top_category: null, top_category_pct: null }),
        safe(() => fetchCashParams(companyId, supabase),        { runway_months: null, cash_trend: null }),
        safe(() => fetchReceivablesParams(companyId, supabase), { overdue_pct: null, dso_days: null }),
        safe(() => fetchPartnerParams(companyId, supabase),     { partners: [] }),
      ])

    const report = buildInsightReport(companyId, {
      revenue:     revenueParams,
      expenses:    expenseParams,
      cash:        cashParams,
      receivables: receivablesParams,
      partners:    partnerParams,
    })

    return NextResponse.json(report)
  } catch (e) {
    console.error('[intelligence/insights]', e)
    return apiError(ctx, 'İçgörü raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
