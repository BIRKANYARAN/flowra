import { NextRequest, NextResponse } from 'next/server'
import { FinanceService }            from '@/lib/services/finance.service'
import { evaluateAlerts }            from '@/lib/engines/alert.engine'
import type { AlertInputs }          from '@/lib/engines/alert.engine'
import { resolveApiAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET /api/alerts/evaluate
//
// Evaluates the AlertEngine with live financial data.
// DB alert_rules table supplies threshold overrides where present.
// Returns { alerts: DecisionAlert[], count: number }

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const today   = new Date()
    const from    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const to      = today.toISOString().slice(0, 10)
    const nowMs   = today.getTime()

    const todayISO = today.toISOString().slice(0, 10)

    const [pnlRes, overdueRes, periodRes, trancheRes, rulesRes, commitRes, cashRes] = await Promise.allSettled([
      FinanceService.getFinancialSummary(uid, companyId, { from, to }, undefined, undefined, supabase),
      supabase.from('sales')
        .select('total_try:total, amount_paid:paid_amount, sale_date')
        .eq('company_id', companyId)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .is('deleted_at', null),
      supabase.from('accounting_periods')
        .select('status, period_end')
        .eq('company_id', companyId)
        .eq('status', 'open')
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('partner_loan_tranches')
        .select('outstanding_try, due_date, partner_id, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active'),
      supabase.from('alert_rules')
        .select('rule_type, threshold_value, is_active')
        .eq('company_id', companyId),
      supabase.from('partner_capital_commitments')
        .select('committed_try, paid_try, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      // Cash proxy: payments received this month minus paid expenses
      supabase.from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', to + 'T23:59:59Z'),
    ])

    const pnl      = pnlRes.status     === 'fulfilled' ? pnlRes.value         : null
    const overdue  = overdueRes.status  === 'fulfilled' ? (overdueRes.value.data  ?? []) : []
    const period   = periodRes.status   === 'fulfilled' ? periodRes.value.data  : null
    const tranches = trancheRes.status  === 'fulfilled' ? (trancheRes.value.data  ?? []) : []
    const rules    = rulesRes.status    === 'fulfilled' ? (rulesRes.value.data    ?? []) : []
    const commits  = commitRes.status   === 'fulfilled' ? (commitRes.value.data   ?? []) : []
    const cashPaid = cashRes.status     === 'fulfilled' ? (cashRes.value.data     ?? []) : []

    // DB threshold overrides: rule_type → numeric threshold
    const thresh: Record<string, number> = {}
    for (const r of rules) {
      if (r.is_active && r.threshold_value != null) thresh[r.rule_type] = Number(r.threshold_value)
    }

    // Overdue aging buckets (30d, 60d)
    let oc30 = 0, ot30 = 0, oc60 = 0, ot60 = 0, allReceivables = 0
    for (const s of overdue) {
      if (!s.sale_date) continue
      const age  = Math.round((nowMs - new Date((s.sale_date as string) + 'T00:00:00Z').getTime()) / 86_400_000)
      const owed = Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
      allReceivables += owed
      if (age > 60) { oc60++; ot60 += owed }
      else if (age > (thresh['RECEIVABLE_30'] ?? 30)) { oc30++; ot30 += owed }
      // age 0-30: counted in allReceivables but not in aging buckets
    }

    // Tranche analysis
    let nextDueDays = -1, nextAmt = 0, totalLoans = 0
    const byPartner: Record<string, number> = {}
    for (const t of tranches) {
      const amt = Number(t.outstanding_try ?? 0)
      totalLoans += amt
      byPartner[t.partner_id as string] = (byPartner[t.partner_id as string] ?? 0) + amt
      if (t.due_date) {
        const days = Math.round((new Date(t.due_date as string).getTime() - nowMs) / 86_400_000)
        if (nextDueDays < 0 || days < nextDueDays) { nextDueDays = days; nextAmt = amt }
      }
    }
    const maxPartner   = Math.max(0, ...Object.values(byPartner))
    const concentration = totalLoans > 0 ? maxPartner / totalLoans : 0

    // Period overdue (days past period_end)
    let periodOverdue = -1
    if (period?.period_end) {
      const d = Math.round((nowMs - new Date(period.period_end as string).getTime()) / 86_400_000)
      if (d > 0) periodOverdue = d
    }

    // DSR: use actual annual_interest_rate per tranche (decimal, 0.15=15%); fall back
    // to 1.5%/month proxy only for interest-free (null/0 rate) tranches.
    const monthlyDebtService = tranches.reduce((s, t) => {
      const principal = Number(t.outstanding_try ?? 0)
      const rate      = Number(t.annual_interest_rate ?? 0)
      // If no rate recorded, use 1.5%/month conservative proxy
      return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
    }, 0)
    const monthlyNet = pnl?.net_after_tax_try ?? 0
    const dsr        = monthlyNet > 0
      ? Math.min(1, monthlyDebtService / monthlyNet)
      : (monthlyDebtService > 0 ? 1.0 : 0)

    // Cash runway: use cash received this month as proxy for operating cash
    const cashReceivedMTD = cashPaid.reduce((s, r) => s + Number((r as { total_try: number }).total_try ?? 0), 0)
    const monthlyCost     = pnl?.expenses_total_try ?? 0
    const runwayDays      = monthlyCost > 0 && monthlyNet < 0
      ? Math.round((cashReceivedMTD / (monthlyCost / 30)))
      : -1

    // KDV: due on the 24th of the following month (KDVK)
    const kdvPayable = pnl?.net_vat_try ?? 0
    const taxDueDays = kdvPayable > 0 ? (() => {
      const curMonth = today.getMonth() + 1  // 1-12
      const curYear  = today.getFullYear()
      const dueMonth = curMonth === 12 ? 1   : curMonth + 1
      const dueYear  = curMonth === 12 ? curYear + 1 : curYear
      const dueDate  = new Date(`${dueYear}-${String(dueMonth).padStart(2, '0')}-24`)
      return Math.round((dueDate.getTime() - nowMs) / 86_400_000)
    })() : -1

    // Equity commitment gap (TTK 588)
    const equityGapTry = commits.reduce((s, c) => {
      return s + Math.max(0, Number((c as { committed_try: number; paid_try: number }).committed_try) - Number((c as { committed_try: number; paid_try: number }).paid_try))
    }, 0)
    const overdueCommits = commits.filter(c => {
      const com = c as { committed_try: number; paid_try: number; due_date: string | null }
      return Number(com.committed_try) > Number(com.paid_try) && com.due_date && com.due_date < todayISO
    })
    const equityCallOverdueDays = overdueCommits.length > 0 ? (() => {
      const oldest = overdueCommits.reduce((min, c) => {
        const com = c as { due_date: string }
        return com.due_date < min ? com.due_date : min
      }, (overdueCommits[0] as { due_date: string }).due_date)
      return Math.round((nowMs - new Date(oldest).getTime()) / 86_400_000)
    })() : -1

    const inputs: AlertInputs = {
      overdueCount30:           oc30,
      overdueTotal30:           ot30,
      overdueCount60:           oc60,
      overdueTotal60:           ot60,
      totalReceivables:         allReceivables,   // all outstanding, not just 30+ days aged
      cashRunwayDays:           runwayDays,
      monthlyNetIncome:         monthlyNet,
      maxBurdenScoreAbs:        0,
      nextTrancheDueDays:       nextDueDays,
      nextTrancheAmount:        nextAmt,
      openPeriodDaysOverdue:    periodOverdue,
      kdvPayable,
      taxDueDays,
      bsImbalanceTry:           0,     // graceful: requires GL (shadow mode)
      legalReserveDeficit:      0,     // graceful: requires period close
      equityGapTry,
      equityCallOverdueDays,
      debtServiceRatio:         dsr,
      partnerLoanConcentration: concentration,
    }

    const alerts = evaluateAlerts(inputs)
    return NextResponse.json({ alerts, count: alerts.length })
  } catch (e) {
    console.error('[alerts/evaluate]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
