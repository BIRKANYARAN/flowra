// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/intelligence/situation
//
// CEO Situation Engine — composite financial health score + Turkish narrative.
// Auth: any authenticated company member.
// Cached: 5 minutes (revalidate: 300).
//
// Data sources:
//   cash_runway_months  — computed from BurnRateService.getReport()
//   net_margin_pct      — last 3-month avg: (revenue - cogs - expenses) / revenue × 100
//   dsr                 — partner_loan_tranches: monthly_payment / avg_monthly_revenue
//   overdue_ratio       — sales table: overdue total / total receivables
//   max_burden_score    — from PartnerService.calculateEqualization()
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic    = 'force-dynamic'
export const revalidate = 300

import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }            from '@/lib/api-auth'
import { reqCtx, apiError }          from '@/lib/api-utils'
import { BurnRateService }           from '@/lib/services/finance/burn-rate.service'
import { PartnerService }            from '@/lib/services/partner.service'
import { assembleSituationReport }   from '@/lib/services/intelligence/situation-engine.service'

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    // ── 1. Cash runway from BurnRateService ───────────────────────────────────
    let cashRunwayMonths: number | null = null
    try {
      const burnReport = await BurnRateService.getReport(companyId, supabase)
      cashRunwayMonths = burnReport.runway_estimate_months ?? null
    } catch { /* non-fatal */ }

    // ── 2. Net margin from last 3 months of revenue & expenses ───────────────
    let netMarginPct: number | null = null
    try {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const from3m = threeMonthsAgo.toISOString().slice(0, 10)
      const today  = new Date().toISOString().slice(0, 10)

      const [salesRes, expRes] = await Promise.all([
        supabase
          .from('sales')
          .select('total_try:total, cost_try:cost_of_goods_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('sale_date', from3m)
          .lte('sale_date', today),
        supabase
          .from('expenses')
          .select('amount_try')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', from3m)
          .lte('expense_date', today),
      ])

      const revenue  = (salesRes.data ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
      const cogs     = (salesRes.data ?? []).reduce((s, r) => s + Number((r as { cost_try?: number | null }).cost_try ?? 0), 0)
      const expenses = (expRes.data  ?? []).reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

      if (revenue > 0) {
        netMarginPct = ((revenue - cogs - expenses) / revenue) * 100
      }
    } catch { /* non-fatal */ }

    // ── 3. Debt Service Ratio from partner_loan_tranches ─────────────────────
    let dsr: number | null = null
    try {
      const { data: tranches } = await supabase
        .from('partner_loan_tranches')
        // outstanding_try computed (no such column): principal_try − total_repaid_try
        .select('principal_try, total_repaid_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .is('deleted_at', null)

      const monthlyDebtService = (tranches ?? []).reduce((s, t) => {
        const principal = Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0))
        const rate      = Number(t.annual_interest_rate ?? 0)
        return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
      }, 0)

      // We need avg monthly revenue for DSR denominator
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const { data: revenueData } = await supabase
        .from('sales')
        .select('total_try:total')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', threeMonthsAgo.toISOString().slice(0, 10))

      const totalRevenue3m = (revenueData ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
      const avgMonthlyRevenue = totalRevenue3m / 3

      if (avgMonthlyRevenue > 0 && monthlyDebtService > 0) {
        dsr = Math.min(1, monthlyDebtService / avgMonthlyRevenue)
      } else if (monthlyDebtService === 0) {
        dsr = 0
      }
    } catch { /* non-fatal */ }

    // ── 4. Overdue ratio from sales ───────────────────────────────────────────
    let overdueRatio: number | null = null
    try {
      const { data: receivables } = await supabase
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount, due_date')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null)

      const today = new Date().toISOString().slice(0, 10)
      const totalReceivables = (receivables ?? []).reduce(
        (s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)),
        0,
      )
      const overdueReceivables = (receivables ?? [])
        .filter(r => r.due_date && r.due_date < today)
        .reduce(
          (s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)),
          0,
        )

      if (totalReceivables > 0) {
        overdueRatio = overdueReceivables / totalReceivables
      } else {
        overdueRatio = 0
      }
    } catch { /* non-fatal */ }

    // ── 5. Max burden score from partner equalization ─────────────────────────
    let maxBurdenScore: number | null = null
    try {
      const distributable = 0 // informational call only
      const eq = await PartnerService.calculateEqualization(uid, companyId, distributable)
      if (eq.total_net_loans_try > 0) {
        // Burden as concentration ratio (same as dashboard)
        maxBurdenScore = Math.min(1, eq.total_equalization / Math.max(eq.distributable, 1))
      } else {
        maxBurdenScore = 0
      }
    } catch { /* non-fatal */ }

    // ── Assemble report ───────────────────────────────────────────────────────
    const report = assembleSituationReport(companyId, {
      cash_runway_months: cashRunwayMonths,
      net_margin_pct:     netMarginPct,
      dsr,
      overdue_ratio:      overdueRatio,
      max_burden_score:   maxBurdenScore,
    })

    return NextResponse.json(report)
  } catch (e) {
    console.error('[intelligence/situation]', e)
    return apiError(ctx, 'Durum raporu alınamadı', 500, 'DB_READ_FAILED')
  }
}
