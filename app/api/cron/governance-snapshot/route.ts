import { NextRequest, NextResponse } from 'next/server'
import { getSystemAdminClient }  from '@/lib/admin-db'
import { makeRequestContext }    from '@/lib/logger'
import { FinanceService }        from '@/lib/services/finance.service'
import { BalanceSheetService }   from '@/lib/services/balance-sheet.service'
import { computeSituation }      from '@/lib/engines/situation.engine'

export const dynamic = 'force-dynamic'

// POST /api/cron/governance-snapshot
//
// Invoked on the 1st of each month at 03:00 UTC by Vercel Cron.
// Automatically generates a governance_reports snapshot for the PREVIOUS month
// for every company that has at least one active partner.
//
// Idempotent: upsert on (company_id, period_start) — safe to retry.
// Runs as system (service-role) — company_id RLS is satisfied by explicit filter.

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  const { requestId: runId } = makeRequestContext()

  const authHeader = req.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSystemAdminClient()
  const now      = new Date()

  // Target: previous month (this cron runs on the 1st of the new month)
  const targetDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const year       = targetDate.getFullYear()
  const month      = targetDate.getMonth() + 1  // 1-12

  const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10)
  const periodEnd   = new Date(year, month, 0).toISOString().slice(0, 10)
  const periodLabel = targetDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })

  try {
    // Find all companies with active partners — governance only relevant when partners exist
    const { data: activeCompanies, error: coErr } = await supabase
      .from('partners')
      .select('company_id')
      .is('deleted_at', null)
      .eq('is_active', true)

    if (coErr) {
      console.error('[cron/governance-snapshot] partners query error:', coErr.message, { runId })
      return NextResponse.json({ error: coErr.message, code: 'DB_READ_FAILED', run_id: runId }, { status: 500 })
    }

    // Deduplicate company IDs
    const companyIds = [...new Set((activeCompanies ?? []).map(r => r.company_id as string))]

    if (!companyIds.length) {
      return NextResponse.json({ ok: true, processed: 0, skipped: 0, period: periodLabel, run_id: runId })
    }

    // For system-wide cron, we process each company with a synthetic uid
    // FinanceService/BalanceSheetService accept supabase client + companyId
    let processed = 0
    let failed    = 0
    const errors: string[] = []

    for (const companyId of companyIds) {
      try {
        const period = { from: periodStart, to: periodEnd }

        // Parallel data gather — same logic as POST /api/governance
        const [finSummary, bsData, partners, tranches] = await Promise.allSettled([
          FinanceService.getFinancialSummary('system', companyId, period, undefined, undefined, supabase),
          BalanceSheetService.compute('system', companyId, periodEnd, supabase),
          supabase.from('partners')
            .select('id, name, share_ratio, is_active')
            .eq('company_id', companyId)
            .is('deleted_at', null),
          supabase.from('partner_loan_tranches')
            // outstanding_try computed below (no such column): principal_try − total_repaid_try
            .select('partner_id, principal_try, total_repaid_try, annual_interest_rate, status')
            .eq('company_id', companyId)
            .neq('status', 'repaid'),
        ])

        const fs          = finSummary.status === 'fulfilled' ? finSummary.value     : null
        const bs          = bsData.status     === 'fulfilled' ? bsData.value         : null
        const partnerRows = partners.status   === 'fulfilled' ? (partners.value.data  ?? []) : []
        const trancheRows = (tranches.status   === 'fulfilled' ? (tranches.value.data  ?? []) : [])
          .map((t: { partner_id: string; principal_try: number; total_repaid_try: number; annual_interest_rate: number | null; status: string }) => ({
            ...t,
            outstanding_try: Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
          }))

        const revenueGross  = fs?.revenue_try ?? 0
        const cogsTotal     = fs?.cost_try ?? 0
        const expensesTotal = fs?.expenses_total_try ?? 0
        const netAfterTax   = fs?.net_after_tax_try ?? (revenueGross - cogsTotal - expensesTotal)
        const cashTry       = bs?.assets?.cash_try ?? 0
        const burnRate      = expensesTotal
        const runwayMonths  = burnRate > 0 ? cashTry / burnRate : 0

        const partnerBalances = partnerRows.map(p => ({
          partner_id:       p.id,
          partner_name:     p.name,
          share_ratio_pct:  Number(p.share_ratio) * 100,
          loan_balance_try: trancheRows
            .filter(t => t.partner_id === p.id)
            .reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0),
        }))

        const totalPartnerDebt = trancheRows.reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)

        const monthlyDebtService = trancheRows.reduce((s, t) => {
          const principal = Number(t.outstanding_try ?? 0)
          const rate      = Number(t.annual_interest_rate ?? 0)
          return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
        }, 0)
        const dsr = netAfterTax > 0
          ? Math.min(1, monthlyDebtService / netAfterTax)
          : (monthlyDebtService > 0 ? 1.0 : 0)

        const situation = computeSituation({
          cashRunwayMonths:  runwayMonths,
          isProfitable:      netAfterTax >= 0,
          netMarginPct:      revenueGross > 0 ? netAfterTax / revenueGross : 0,
          debtServiceRatio:  dsr,
          overdueRatioPct:   0,  // simplified for cron — no receivables query
          maxBurdenScoreAbs: 0,
        })

        const snapshot = {
          period_label:   periodLabel,
          period_start:   periodStart,
          period_end:     periodEnd,
          generated_at:   now.toISOString(),
          source:         'cron',
          revenue_try:          revenueGross,
          cogs_try:             cogsTotal,
          gross_profit_try:     revenueGross - cogsTotal,
          expenses_try:         expensesTotal,
          net_income_try:       netAfterTax,
          total_assets_try:     bs?.assets?.total_assets_try ?? 0,
          total_liabilities_try: bs?.liabilities?.total_liabilities_try ?? 0,
          total_equity_try:     bs?.equity?.total_equity_try ?? 0,
          cash_try:             cashTry,
          inventory_try:        bs?.assets?.inventory_try ?? 0,
          cash_runway_months:   Math.round(runwayMonths * 10) / 10,
          burn_rate_monthly_try: burnRate,
          total_partner_debt_try: totalPartnerDebt,
          partner_count:        partnerRows.filter(p => p.is_active).length,
          partner_balances:     partnerBalances,
          situation_status:     situation.status,
          composite_score:      situation.composite,
          data_quality: {
            approximated_inputs: ['balance_sheet_approximate_gl_shadow', 'overdue_receivables'],
            note: 'Otomatik aylık snapshot — GL gölge modda, alacak yaşlandırma hesaplanmadı.',
          },
        }

        const { error: upsertErr } = await supabase
          .from('governance_reports')
          .upsert({
            company_id:   companyId,
            period_label: periodLabel,
            period_start: periodStart,
            period_end:   periodEnd,
            snapshot,
            generated_at: now.toISOString(),
            is_finalized: false,
            notes:        'Otomatik aylık snapshot (cron)',
          }, { onConflict: 'company_id,period_start', ignoreDuplicates: true })
          // ignoreDuplicates: only insert if not exists — don't overwrite manually generated reports

        if (upsertErr) {
          console.error(`[cron/governance-snapshot] upsert failed for ${companyId}:`, upsertErr.message, { runId })
          errors.push(`${companyId}: ${upsertErr.message}`)
          failed++
        } else {
          processed++
        }
      } catch (companyErr) {
        const msg = companyErr instanceof Error ? companyErr.message : String(companyErr)
        console.error(`[cron/governance-snapshot] company ${companyId} error:`, msg, { runId })
        errors.push(`${companyId}: ${msg}`)
        failed++
      }
    }

    console.info('[cron/governance-snapshot]', { runId, processed, failed, period: periodLabel, total: companyIds.length })

    return NextResponse.json({
      ok:        true,
      processed,
      failed,
      period:    periodLabel,
      run_id:    runId,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (e) {
    console.error('[cron/governance-snapshot]', e, { runId })
    return NextResponse.json({ error: 'Internal error', code: 'SYSTEM_ERROR', run_id: runId }, { status: 500 })
  }
}

// Vercel Cron invokes scheduled jobs via GET (with the Authorization: Bearer
// CRON_SECRET header). Alias GET to the POST handler so the job actually runs —
// previously only POST existed, so every scheduled run returned 405 and never ran.
export const GET = POST
