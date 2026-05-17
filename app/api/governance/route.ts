import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }       from '@/lib/api-auth'
import { FinanceService }       from '@/lib/services/finance.service'
import { BalanceSheetService }  from '@/lib/services/balance-sheet.service'
import { WaterfallService }     from '@/lib/services/waterfall.service'
import { computeSituation }     from '@/lib/engines/situation.engine'

export const dynamic = 'force-dynamic'

// ── Helpers ────────────────────────────────────────────────────────────────────

function periodRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end   = new Date(year, month, 0)  // last day of month
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  }
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long', year: 'numeric',
  })
}

// ── GET /api/governance — list governance reports ─────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { companyId, supabase } = auth

    const { data, error } = await supabase
      .from('governance_reports')
      .select(`
        id, period_label, period_start, period_end,
        is_finalized, finalized_at, generated_at, notes,
        governance_signoffs ( id, partner_name, signed_at, notes )
      `)
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })
      .limit(24)

    if (error) throw error

    return NextResponse.json({ reports: data ?? [] })
  } catch (e) {
    console.error('[governance GET]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ── POST /api/governance — generate a new governance report ──────────────────
// Body: { year: number, month: number, notes?: string }

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body  = await req.json().catch(() => ({}))
    const now   = new Date()
    const year  = Number(body.year  ?? now.getFullYear())
    const month = Number(body.month ?? now.getMonth() + 1)

    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Geçersiz dönem' }, { status: 400 })
    }

    const { start, end } = periodRange(year, month)
    const label = monthLabel(year, month)
    const period = { from: start, to: end }

    // ── Gather snapshot data in parallel ────────────────────────────────────

    const [finSummary, bsData, partners, tranches, openSales, openExpenses] =
      await Promise.allSettled([
        FinanceService.getFinancialSummary(uid, companyId, period, undefined, undefined, supabase),
        BalanceSheetService.compute(uid, companyId, end, supabase),
        supabase.from('partners')
          .select('id, name, share_ratio, is_active')
          .eq('company_id', companyId)
          .is('deleted_at', null),
        supabase.from('partner_loan_tranches')
          .select('partner_id, outstanding_try, annual_interest_rate, status')
          .eq('company_id', companyId)
          .neq('status', 'repaid'),
        supabase.from('sales')
          .select('total_try, amount_paid, due_date, payment_status')
          .eq('company_id', companyId)
          .in('payment_status', ['unpaid', 'partial', 'overdue']),
        supabase.from('expenses')
          .select('amount_try, expense_date, is_paid')
          .eq('company_id', companyId)
          .eq('is_paid', false)
          .gte('expense_date', start)
          .lte('expense_date', end),
      ])

    const fs = finSummary.status === 'fulfilled' ? finSummary.value : null
    const bs = bsData.status    === 'fulfilled' ? bsData.value    : null
    const partnerRows = partners.status === 'fulfilled' ? (partners.value.data ?? []) : []
    const trancheRows = tranches.status === 'fulfilled' ? (tranches.value.data ?? []) : []
    const salesRows   = openSales.status === 'fulfilled' ? (openSales.value.data ?? []) : []
    const expRows     = openExpenses.status === 'fulfilled' ? (openExpenses.value.data ?? []) : []

    // ── Partner balances ─────────────────────────────────────────────────────

    const partnerBalances = partnerRows.map(p => {
      const loans = trancheRows
        .filter(t => t.partner_id === p.id)
        .reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)
      return {
        partner_id:           p.id,
        partner_name:         p.name,
        share_ratio_pct:      Number(p.share_ratio) * 100,
        loan_balance_try:     loans,
      }
    })

    // ── Receivables ──────────────────────────────────────────────────────────

    const today = new Date().toISOString().slice(0, 10)
    const totalReceivables = salesRows.reduce((s, r) =>
      s + (Number(r.total_try) - Number(r.amount_paid ?? 0)), 0)
    const overdueReceivables = salesRows
      .filter(r => r.due_date && r.due_date < today)
      .reduce((s, r) => s + (Number(r.total_try) - Number(r.amount_paid ?? 0)), 0)

    // ── Unpaid expenses ──────────────────────────────────────────────────────

    const unpaidExpenses = expRows.reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

    // ── Cash & runway ────────────────────────────────────────────────────────

    const cashTry     = bs ? (bs.assets?.cash_try ?? 0) : 0
    const burnRate    = fs ? (fs.expenses_total_try / 30) * 30 : 0  // monthly
    const runwayMonths = burnRate > 0 ? cashTry / burnRate : 0

    // ── Debt summary ─────────────────────────────────────────────────────────

    const totalPartnerDebt = trancheRows.reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)

    // ── Situation score ──────────────────────────────────────────────────────

    const netMargin = fs && fs.revenue_try > 0
      ? (fs.revenue_try - fs.cost_try - fs.expenses_total_try) / fs.revenue_try
      : 0
    const dsr = fs && fs.revenue_try > 0
      ? trancheRows.reduce((s, t) => s + Number(t.outstanding_try ?? 0) * Number(t.annual_interest_rate ?? 0.015) / 12, 0) / Math.max(1, fs.revenue_try)
      : 0
    const overdueRatio = totalReceivables > 0 ? overdueReceivables / totalReceivables : 0

    const situation = computeSituation({
      cashRunwayMonths:  runwayMonths,
      isProfitable:      fs ? (fs.revenue_try - fs.cost_try - fs.expenses_total_try) > 0 : false,
      netMarginPct:      netMargin,
      debtServiceRatio:  dsr,
      overdueRatioPct:   overdueRatio * 100,
      maxBurdenScoreAbs: 0,  // simplified — no equalization data in governance
    })

    // ── Assemble snapshot ────────────────────────────────────────────────────

    const snapshot = {
      period_label:         label,
      period_start:         start,
      period_end:           end,
      generated_at:         new Date().toISOString(),

      // P&L
      revenue_try:          fs?.revenue_try ?? 0,
      cogs_try:             fs?.cost_try ?? 0,
      gross_profit_try:     (fs?.revenue_try ?? 0) - (fs?.cost_try ?? 0),
      expenses_try:         fs?.expenses_total_try ?? 0,
      net_income_try:       fs
        ? fs.revenue_try - fs.cost_try - fs.expenses_total_try
        : 0,

      // Balance sheet
      total_assets_try:     bs?.assets?.total_assets_try ?? 0,
      total_liabilities_try: bs?.liabilities?.total_liabilities_try ?? 0,
      total_equity_try:     bs?.equity?.total_equity_try ?? 0,
      cash_try:             cashTry,
      inventory_try:        bs?.assets?.inventory_try ?? 0,

      // Cash position
      cash_runway_months:   Math.round(runwayMonths * 10) / 10,
      burn_rate_monthly_try: burnRate,

      // Receivables
      total_receivables_try: totalReceivables,
      overdue_receivables_try: overdueReceivables,

      // Payables
      unpaid_expenses_try:  unpaidExpenses,

      // Partner debt
      total_partner_debt_try: totalPartnerDebt,
      partner_count:        partnerRows.filter(p => p.is_active).length,

      // Partner positions
      partner_balances:     partnerBalances,

      // Health
      situation_status:     situation.status,
      composite_score:      situation.composite,
      component_scores:     situation.scores,
    }

    // ── Upsert report (idempotent per period) ────────────────────────────────

    const { data: report, error: upsertErr } = await supabase
      .from('governance_reports')
      .upsert({
        company_id:   companyId,
        period_label: label,
        period_start: start,
        period_end:   end,
        snapshot,
        generated_by: uid,
        generated_at: new Date().toISOString(),
        notes:        body.notes ?? null,
        is_finalized: false,
      }, { onConflict: 'company_id,period_start' })
      .select()
      .single()

    if (upsertErr) {
      // Table might not exist yet — return snapshot without persisting
      console.warn('[governance POST] upsert failed (table may not exist):', upsertErr.message)
      return NextResponse.json({
        report: { id: 'preview', snapshot, is_finalized: false },
        warning: 'governance_reports table not yet created — run supabase/governance.sql',
      })
    }

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[governance POST]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
