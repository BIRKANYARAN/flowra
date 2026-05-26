import { NextRequest, NextResponse }           from 'next/server'
import { FinanceService }                       from '@/lib/services/finance.service'
import { computeSituation }                     from '@/lib/engines/situation.engine'
import { evaluateAlerts }                       from '@/lib/engines/alert.engine'
import { generateSituationSummary }             from '@/lib/services/ai-summary.service'
import type { SituationInputs }                 from '@/lib/engines/situation.engine'
import type { AlertInputs }                     from '@/lib/engines/alert.engine'
import { resolveApiAuth }                       from '@/lib/api-auth'
import { getCfoMetrics }                        from '@/lib/finance/financial-core'
import { reqCtx, apiError }                     from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// GET /api/insights/situation-summary
//
// Returns an AI-generated (or rule-based) Turkish narrative situation summary.
// Financial data is computed by rule-based engines; AI only writes the narrative.

export async function GET(req: NextRequest) {
  const ctx = reqCtx(req)
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
      FinanceService.getFinancialSummary(uid, companyId, { from, to }, undefined, undefined, supabase),
      supabase.from('sales')
        .select('total_try:total, amount_paid:paid_amount, sale_date')
        .eq('company_id', companyId)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .is('deleted_at', null),
      supabase.from('partner_loan_tranches')
        .select('outstanding_try, due_date, partner_id, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active'),
      getCfoMetrics(companyId, { from, to }, supabase),
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
    // When company is unprofitable, DSR is treated as max-stress (1.0) if there's
    // any debt service obligation, rather than 0 (which would incorrectly signal "no stress").
    const dsr = monthlyNet > 0
      ? Math.min(1, monthlyDebtService / monthlyNet)
      : (monthlyDebtService > 0 ? 1.0 : 0)

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

    // ── Compute tranche-based inputs (same as alerts/evaluate) ──────────────────
    let nextDueDays = -1, nextAmt = 0
    for (const t of tranches) {
      if (t.due_date) {
        const days = Math.round((new Date(t.due_date as string).getTime() - nowMs) / 86_400_000)
        if (nextDueDays < 0 || days < nextDueDays) {
          nextDueDays = days
          nextAmt = Number(t.outstanding_try ?? 0)
        }
      }
    }

    // ── KDV from PnL (available) + tax due date ──────────────────────────────
    const kdvPayable = pnl?.net_vat_try ?? 0
    const taxDueDays = kdvPayable > 0 ? (() => {
      const curMonth = now.getMonth() + 1
      const curYear  = now.getFullYear()
      const dueMonth = curMonth === 12 ? 1 : curMonth + 1
      const dueYear  = curMonth === 12 ? curYear + 1 : curYear
      const dueDate  = new Date(`${dueYear}-${String(dueMonth).padStart(2, '0')}-24`)
      return Math.round((dueDate.getTime() - nowMs) / 86_400_000)
    })() : -1

    // ── Cash runway from cfo metrics (available) ────────────────────────────
    const cashRunwayDays = cfo?.burn.runway_days ?? -1

    // ── Data quality: explicitly label which inputs are approximations ───────
    // In shadow GL mode, balance sheet imbalance and legal reserve cannot be
    // computed from operational tables alone — we don't have GL account balances.
    // These are labeled as approximated so the consumer can show a caveat banner.
    const approximatedInputs: string[] = ['bsImbalanceTry', 'legalReserveDeficit', 'maxBurdenScoreAbs', 'equityGapTry', 'openPeriodDaysOverdue']

    // Alert inputs — populated from actual data where available
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
      totalReceivables:         allOutstanding,
      cashRunwayDays,                       // from cfo metrics
      monthlyNetIncome:         monthlyNet,
      maxBurdenScoreAbs:        0,          // requires waterfall — unavailable
      nextTrancheDueDays:       nextDueDays, // computed from tranches
      nextTrancheAmount:        nextAmt,
      openPeriodDaysOverdue:    -1,          // not queried here — unavailable
      kdvPayable,                            // from PnL net_vat_try
      taxDueDays,                            // computed from kdvPayable
      bsImbalanceTry:           0,           // requires GL — unavailable in shadow mode
      legalReserveDeficit:      0,           // requires period close — unavailable
      equityGapTry:             0,           // not queried here — unavailable
      equityCallOverdueDays:    -1,
      debtServiceRatio:         dsr,
      partnerLoanConcentration: loanConcentration,
    }

    const alerts = evaluateAlerts(alertInputs)
    // Re-compute situation with alert penalty applied
    const situationFinal = computeSituation({
      ...situationInputs,
      activeAlertCounts: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning:  alerts.filter(a => a.severity === 'warning').length,
        info:     alerts.filter(a => a.severity === 'info').length,
      },
    })
    const summary = await generateSituationSummary({
      situation: situationFinal,
      topAlerts:   alerts.slice(0, 3),
      period,
      revenue:     pnl?.revenue_try ?? 0,
      netIncome:   pnl?.net_after_tax_try ?? 0,
      cashBalance: 0,
    })

    return NextResponse.json({
      situation: situationFinal,
      alerts: alerts.slice(0, 5),
      summary,
      computed_at: new Date().toISOString(),
      // E9: explicit data quality signal — consumers should show a caveat banner
      // when approximated_inputs is non-empty (GL shadow mode limitation)
      data_quality: {
        approximated_inputs: approximatedInputs,
        note: approximatedInputs.length > 0
          ? 'GL gölge modda — bilanço dengesi, yasal yedek ve ortak yük skoru hesaplanamıyor. Bu alanlar için bazı alertler üretilmiyor olabilir.'
          : null,
      },
    })
  } catch (e) {
    console.error('[insights/situation-summary]', e)
    return apiError(ctx, 'Durum özeti hesaplanamadı', 500, 'DB_READ_FAILED')
  }
}
