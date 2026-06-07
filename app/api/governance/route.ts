import { NextRequest, NextResponse } from 'next/server'
import { resolveApiAuth }       from '@/lib/api-auth'
import { reqCtx, apiError }     from '@/lib/api-utils'
import { FinanceService }       from '@/lib/services/finance.service'
import { BalanceSheetService }  from '@/lib/services/balance-sheet.service'
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
  const ctx = reqCtx(req)
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
    return apiError(ctx, 'Yönetim raporları alınamadı', 500, 'DB_READ_FAILED')
  }
}

// ── POST /api/governance — generate a new governance report ──────────────────
// Body: { year: number, month: number, notes?: string }

export async function POST(req: NextRequest) {
  const ctx = reqCtx(req)
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    const body  = await req.json().catch(() => ({}))
    const now   = new Date()
    const year  = Number(body.year  ?? now.getFullYear())
    const month = Number(body.month ?? now.getMonth() + 1)

    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return apiError(ctx, 'Geçersiz dönem', 400, 'INVALID_PERIOD')
    }

    const { start, end } = periodRange(year, month)
    const label = monthLabel(year, month)
    const period = { from: start, to: end }

    // ── Gather snapshot data in parallel ─────────────────────────────────────
    // All queries wrapped in Promise.allSettled — no single failure blocks report

    const [finSummary, bsData, partners, tranches, openSales, unpaidExpenses] =
      await Promise.allSettled([
        FinanceService.getFinancialSummary(uid, companyId, period, undefined, undefined, supabase),
        BalanceSheetService.compute(uid, companyId, end, supabase),
        supabase.from('partners')
          .select('id, name, share_ratio, is_active')
          .eq('company_id', companyId)
          .is('deleted_at', null),
        supabase.from('partner_loan_tranches')
          // outstanding_try computed below (no such column): principal_try − total_repaid_try
          .select('partner_id, principal_try, total_repaid_try, annual_interest_rate, status')
          .eq('company_id', companyId)
          .neq('status', 'repaid'),
        // Outstanding receivables (unpaid/partial/overdue) — use sale_date for period attribution
        supabase.from('sales')
          .select('total_try, amount_paid:paid_amount, due_date, payment_status, sale_date')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .in('payment_status', ['pending', 'partial', 'overdue']),
        // Unpaid period expenses — payment_status is the correct column (not is_paid)
        supabase.from('expenses')
          .select('amount_try, expense_date, payment_status')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('payment_status', 'paid')
          .gte('expense_date', start)
          .lte('expense_date', end),
      ])

    const fs          = finSummary.status   === 'fulfilled' ? finSummary.value     : null
    const bs          = bsData.status       === 'fulfilled' ? bsData.value         : null
    const partnerRows = partners.status     === 'fulfilled' ? (partners.value.data  ?? []) : []
    const trancheRows = (tranches.status     === 'fulfilled' ? (tranches.value.data  ?? []) : [])
      .map((t: { partner_id: string; principal_try: number; total_repaid_try: number; annual_interest_rate: number | null; status: string }) => ({
        ...t,
        outstanding_try: Math.max(0, Number(t.principal_try ?? 0) - Number(t.total_repaid_try ?? 0)),
      }))
    const salesRows   = openSales.status    === 'fulfilled' ? (openSales.value.data ?? []) : []
    const expRows     = unpaidExpenses.status === 'fulfilled' ? (unpaidExpenses.value.data ?? []) : []

    // Track data quality — any failed query degrades the snapshot
    const failedInputs: string[] = []
    if (finSummary.status !== 'fulfilled')   failedInputs.push('financial_summary')
    if (bsData.status !== 'fulfilled')       failedInputs.push('balance_sheet')
    if (partners.status !== 'fulfilled')     failedInputs.push('partner_positions')
    if (tranches.status !== 'fulfilled')     failedInputs.push('loan_tranches')
    if (openSales.status !== 'fulfilled')    failedInputs.push('receivables')
    if (unpaidExpenses.status !== 'fulfilled') failedInputs.push('unpaid_expenses')
    // Balance sheet is always approximate in gl_mode='shadow'
    if (!failedInputs.includes('balance_sheet')) failedInputs.push('balance_sheet_approximate_gl_shadow')

    // ── Partner loan balances ─────────────────────────────────────────────────

    const partnerBalances = partnerRows.map(p => {
      const loans = trancheRows
        .filter(t => t.partner_id === p.id)
        .reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)
      return {
        partner_id:       p.id,
        partner_name:     p.name,
        share_ratio_pct:  Number(p.share_ratio) * 100,
        loan_balance_try: loans,
      }
    })

    // ── Receivables ──────────────────────────────────────────────────────────

    const today = now.toISOString().slice(0, 10)
    const totalReceivables = salesRows.reduce((s, r) =>
      s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
    const overdueReceivables = salesRows
      .filter(r => r.due_date && String(r.due_date) < today)
      .reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

    // ── Unpaid expenses in period ────────────────────────────────────────────

    const unpaidExpensesTotal = expRows.reduce((s, e) => s + Number(e.amount_try ?? 0), 0)

    // ── Cash & burn ──────────────────────────────────────────────────────────

    const cashTry     = bs ? (bs.assets?.cash_try ?? 0) : 0
    const burnRate    = fs ? (fs.expenses_total_try ?? 0) : 0  // monthly total
    const runwayMonths = burnRate > 0 ? cashTry / burnRate : 0

    // ── Debt summary ─────────────────────────────────────────────────────────

    const totalPartnerDebt = trancheRows.reduce((s, t) => s + Number(t.outstanding_try ?? 0), 0)

    // ── Net income — use net_after_tax_try from FinanceService (canonical) ──

    const revenueGross  = fs?.revenue_try ?? 0
    const cogsTotal     = fs?.cost_try ?? 0
    const expensesTotal = fs?.expenses_total_try ?? 0
    const netAfterTax   = fs?.net_after_tax_try ?? (revenueGross - cogsTotal - expensesTotal)

    // ── Situation assessment ─────────────────────────────────────────────────

    const monthlyNet    = netAfterTax
    const monthlyDebtService = trancheRows.reduce((s, t) => {
      const principal = Number(t.outstanding_try ?? 0)
      const rate      = Number(t.annual_interest_rate ?? 0)
      return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
    }, 0)
    const dsr = monthlyNet > 0
      ? Math.min(1, monthlyDebtService / monthlyNet)
      : (monthlyDebtService > 0 ? 1.0 : 0)
    const overdueRatio = totalReceivables > 0 ? overdueReceivables / totalReceivables : 0

    const situation = computeSituation({
      cashRunwayMonths:  runwayMonths,
      isProfitable:      netAfterTax >= 0,
      netMarginPct:      revenueGross > 0 ? netAfterTax / revenueGross : 0,
      debtServiceRatio:  dsr,
      overdueRatioPct:   overdueRatio * 100,
      maxBurdenScoreAbs: 0,  // waterfall-level equalization not computed here
    })

    // ── Assemble snapshot ────────────────────────────────────────────────────

    const snapshot = {
      period_label:   label,
      period_start:   start,
      period_end:     end,
      generated_at:   now.toISOString(),

      // P&L
      revenue_try:          revenueGross,
      cogs_try:             cogsTotal,
      gross_profit_try:     revenueGross - cogsTotal,
      expenses_try:         expensesTotal,
      net_income_try:       netAfterTax,

      // Balance sheet (approximate — gl_mode=shadow)
      total_assets_try:      bs?.assets?.total_assets_try     ?? 0,
      total_liabilities_try: bs?.liabilities?.total_liabilities_try ?? 0,
      total_equity_try:      bs?.equity?.total_equity_try     ?? 0,
      cash_try:              cashTry,
      inventory_try:         bs?.assets?.inventory_try        ?? 0,

      // Cash position
      cash_runway_months:    Math.round(runwayMonths * 10) / 10,
      burn_rate_monthly_try: burnRate,

      // Receivables
      total_receivables_try:   totalReceivables,
      overdue_receivables_try: overdueReceivables,

      // Payables
      unpaid_expenses_try:   unpaidExpensesTotal,

      // Partner debt
      total_partner_debt_try: totalPartnerDebt,
      partner_count:          partnerRows.filter(p => p.is_active).length,
      partner_balances:       partnerBalances,

      // Health
      situation_status:  situation.status,
      composite_score:   situation.composite,
      component_scores:  situation.scores,

      // Data quality — E9 pattern
      data_quality: {
        failed_inputs:        failedInputs.filter(x => !x.includes('approximate')),
        approximated_inputs:  failedInputs.filter(x => x.includes('approximate')),
        note: failedInputs.some(x => !x.includes('approximate'))
          ? `${failedInputs.filter(x => !x.includes('approximate')).length} veri kaynağı yüklenemedi — bazı değerler 0 gösterebilir.`
          : 'GL gölge modda — bilanço verileri yaklaşık değerlerdir.',
      },
    }

    // ── Upsert report (idempotent per period — on conflict update snapshot) ──

    const { data: report, error: upsertErr } = await supabase
      .from('governance_reports')
      .upsert({
        company_id:   companyId,
        period_label: label,
        period_start: start,
        period_end:   end,
        snapshot,
        generated_by: uid,
        generated_at: now.toISOString(),
        notes:        body.notes ?? null,
        is_finalized: false,
      }, { onConflict: 'company_id,period_start' })
      .select()
      .single()

    if (upsertErr) {
      console.error('[governance POST] upsert failed:', upsertErr.message)
      // Degrade gracefully — return snapshot preview without persisting
      return NextResponse.json({
        report: { id: 'preview', snapshot, is_finalized: false },
        data_quality: {
          note: 'governance_reports tablosu henüz oluşturulmamış — supabase/phase9_workflow_governance_patch.sql çalıştırın.',
          failed_inputs: ['persistence'],
        },
      }, { status: 202 })
    }

    return NextResponse.json({ report })
  } catch (e) {
    console.error('[governance POST]', e)
    return apiError(ctx, 'Yönetim raporu oluşturulamadı', 500, 'DB_WRITE_FAILED')
  }
}
