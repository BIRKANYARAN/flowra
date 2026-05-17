import { NextRequest, NextResponse } from 'next/server'
import { resolveCompanyId }          from '@/lib/resolve-company'
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
    const { uid, companyId, supabase, ctx } = auth

    const today   = new Date()
    const from    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
    const to      = today.toISOString().slice(0, 10)
    const nowMs   = today.getTime()

    const [pnlRes, overdueRes, periodRes, trancheRes, rulesRes] = await Promise.allSettled([
      FinanceService.getFinancialSummary(uid, companyId, { from, to }),
      supabase.from('sales')
        .select('total_try, amount_paid, created_at')
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
        .select('outstanding_try, due_date, partner_id')
        .eq('company_id', companyId)
        .eq('status', 'active'),
      supabase.from('alert_rules')
        .select('rule_type, threshold_value, is_active')
        .eq('company_id', companyId),
    ])

    const pnl     = pnlRes.status    === 'fulfilled' ? pnlRes.value    : null
    const overdue = overdueRes.status === 'fulfilled' ? (overdueRes.value.data ?? []) : []
    const period  = periodRes.status  === 'fulfilled' ? periodRes.value.data : null
    const tranches= trancheRes.status === 'fulfilled' ? (trancheRes.value.data ?? []) : []
    const rules   = rulesRes.status   === 'fulfilled' ? (rulesRes.value.data ?? []) : []

    // DB threshold overrides: rule_type → numeric threshold
    const thresh: Record<string, number> = {}
    for (const r of rules) {
      if (r.is_active && r.threshold_value != null) thresh[r.rule_type] = Number(r.threshold_value)
    }

    // Overdue aging buckets (30d, 60d)
    let oc30 = 0, ot30 = 0, oc60 = 0, ot60 = 0
    for (const s of overdue) {
      const age  = Math.round((nowMs - new Date(s.created_at as string).getTime()) / 86_400_000)
      const owed = Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0)
      if (age > 60) { oc60++; ot60 += owed }
      else if (age > (thresh['RECEIVABLE_30'] ?? 30)) { oc30++; ot30 += owed }
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

    // DSR estimate
    const monthlyDebtService = tranches.reduce((s, t) => s + Number(t.outstanding_try ?? 0) * 0.015, 0)
    const monthlyNet         = pnl?.net_after_tax_try ?? 0
    const dsr                = monthlyNet > 0 ? monthlyDebtService / monthlyNet : 0

    // Cash runway
    const monthlyCost = pnl?.expenses_total_try ?? 0
    const runwayDays  = monthlyCost > 0 && monthlyNet < 0 ? Math.round((0 / monthlyCost) * 30) : -1

    const inputs: AlertInputs = {
      overdueCount30:           oc30,
      overdueTotal30:           ot30,
      overdueCount60:           oc60,
      overdueTotal60:           ot60,
      totalReceivables:         ot30 + ot60,
      cashRunwayDays:           runwayDays,
      monthlyNetIncome:         monthlyNet,
      maxBurdenScoreAbs:        0,
      nextTrancheDueDays:       nextDueDays,
      nextTrancheAmount:        nextAmt,
      openPeriodDaysOverdue:    periodOverdue,
      kdvPayable:               0,
      taxDueDays:               -1,
      bsImbalanceTry:           0,
      legalReserveDeficit:      0,
      equityGapTry:             0,
      equityCallOverdueDays:    -1,
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
