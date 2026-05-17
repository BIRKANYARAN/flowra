import { NextRequest, NextResponse }           from 'next/server'
import { FinanceService }                       from '@/lib/services/finance.service'
import { computeSituation }                     from '@/lib/engines/situation.engine'
import { evaluateAlerts }                       from '@/lib/engines/alert.engine'
import { generateSituationSummary }             from '@/lib/services/ai-summary.service'
import type { SituationInputs }                 from '@/lib/engines/situation.engine'
import type { AlertInputs }                     from '@/lib/engines/alert.engine'
import { resolveApiAuth }                       from '@/lib/api-auth'
import { getCfoMetrics }                        from '@/lib/finance/financial-core'

export const dynamic = 'force-dynamic'

// GET /api/insights/situation-summary
//
// Returns an AI-generated (or rule-based) Turkish narrative situation summary.
// Financial data is computed by rule-based engines; AI only writes the narrative.

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const now     = new Date()
    const from    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const to      = now.toISOString().slice(0, 10)
    const period  = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

    // Parallel data fetches
    const [pnlRes, overdueRes, trancheRes, cfoRes] = await Promise.allSettled([
      FinanceService.getFinancialSummary(uid, companyId, { from, to }),
      supabase.from('sales')
        .select('total_try:total, amount_paid:paid_amount, sale_date')
        .eq('company_id', companyId)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .is('deleted_at', null),
      supabase.from('partner_loan_tranches')
        .select('outstanding_try, due_date, partner_id, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active'),
      getCfoMetrics(companyId, { from, to }),
    ])

    const pnl     = pnlRes.status    === 'fulfilled' ? pnlRes.value : null
    const overdue = overdueRes.status === 'fulfilled' ? (overdueRes.value.data ?? []) : []
    const tranches= trancheRes.status === 'fulfilled' ? (trancheRes.value.data ?? []) : []
    const cfo     = cfoRes.status     === 'fulfilled' ? cfoRes.value : null

    // Compute situation inputs
    const nowMs = Date.now()
    let ot30 = 0, ot60 = 0, allOutstanding = 0
    for (const s of overdue) {
      if (!s.sale_date) continue
      const age  = Math.round((nowMs - new Date((s.sale_date as string) + 'T00:00:00Z').getTime()) / 86_400_000)
      const owed = Math.max(0, Number(s.total_try ?? 0) - Number(s.amount_paid ?? 0))
      allOutstanding += owed
      if (age > 60) ot60 += owed; else if (age > 30) ot30 += owed
      // age 0-30: counted in allOutstanding but not in ot30/ot60 buckets
    }
    const totalOverdue = ot30 + ot60  // aged receivables (30+ days)
    const totalRevenue = pnl?.revenue_try ?? 0
    const overdueRatio = totalRevenue > 0 ? totalOverdue / totalRevenue : 0

    const totalLoans = tranches.reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)
    // Use actual annual_interest_rate per tranche (decimal, 0.15=15%); proxy 1.5%/month for rate-free
    const monthlyDebtService = tranches.reduce((s, t) => {
      const principal = Number(t.outstanding_try ?? 0)
      const rate      = Number(t.annual_interest_rate ?? 0)
      return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
    }, 0)
    const monthlyNet  = pnl?.net_after_tax_try ?? 0
    const monthlyRevM = pnl?.revenue_try ?? 0
    const dsr = monthlyNet > 0 ? monthlyDebtService / monthlyNet : 0

    // Partner loan concentration: max single-partner outstanding / total outstanding
    const loanByPartner = tranches.reduce((acc: Record<string, number>, t) => {
      const pid = String(t.partner_id ?? 'unknown')
      acc[pid] = (acc[pid] ?? 0) + Number(t.outstanding_try ?? 0)
      return acc
    }, {})
    const maxPartnerLoan = totalLoans > 0
      ? Math.max(0, ...Object.values(loanByPartner))
      : 0
    const loanConcentration = totalLoans > 0 ? maxPartnerLoan / totalLoans : 0

    const situationInputs: SituationInputs = {
      cashRunwayMonths:   cfo?.burn.runway_months ?? 0,
      isProfitable:       monthlyNet >= 0,
      netMarginPct:       monthlyRevM > 0 ? (monthlyNet / monthlyRevM) : 0,  // 0-1 scale, not %
      debtServiceRatio:   dsr,
      overdueRatioPct:    overdueRatio * 100,
      maxBurdenScoreAbs:  0,
    }

    const situation = computeSituation(situationInputs)

    // Alert inputs
    const alertInputs: AlertInputs = {
      overdueCount30: overdue.filter(s => {
        const age = Math.round((nowMs - new Date(((s.sale_date as string) || '1970-01-01') + 'T00:00:00Z').getTime()) / 86_400_000)
        return age > 30 && age <= 60
      }).length,
      overdueTotal30:           ot30,
      overdueCount60:           overdue.filter(s => {
        const age = Math.round((nowMs - new Date(((s.sale_date as string) || '1970-01-01') + 'T00:00:00Z').getTime()) / 86_400_000)
        return age > 60
      }).length,
      overdueTotal60:           ot60,
      totalReceivables:         allOutstanding,  // all outstanding including < 30 days
      cashRunwayDays:           -1,
      monthlyNetIncome:         monthlyNet,
      maxBurdenScoreAbs:        0,
      nextTrancheDueDays:       -1,
      nextTrancheAmount:        0,
      openPeriodDaysOverdue:    -1,
      kdvPayable:               0,
      taxDueDays:               -1,
      bsImbalanceTry:           0,
      legalReserveDeficit:      0,
      equityGapTry:             0,
      equityCallOverdueDays:    -1,
      debtServiceRatio:         dsr,
      partnerLoanConcentration: loanConcentration,
    }

    const alerts  = evaluateAlerts(alertInputs)
    const summary = await generateSituationSummary({
      situation,
      topAlerts:   alerts.slice(0, 3),
      period,
      revenue:     pnl?.revenue_try ?? 0,
      netIncome:   pnl?.net_after_tax_try ?? 0,
      cashBalance: 0,
    })

    return NextResponse.json({
      situation,
      alerts: alerts.slice(0, 5),
      summary,
      computed_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error('[insights/situation-summary]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
