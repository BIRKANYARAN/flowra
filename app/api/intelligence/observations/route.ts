// ─────────────────────────────────────────────────────────────────────────────
// GET /api/intelligence/observations?context=collections|partners|expenses|period-close|all
//
// Deterministic observation engine — no LLM, no external calls.
// Fetches operational data from Supabase, derives pattern signals.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse }        from 'next/server'
import { resolveApiAuth }                   from '@/lib/api-auth'
import { deriveObservations, ObservationInput } from '@/lib/intelligence/observations'
import { detectExpenseAnomalies }           from '@/lib/engines/anomaly.engine'
import type { MonthlyExpense }             from '@/lib/engines/anomaly.engine'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await resolveApiAuth(req)
  if (!auth.ok) return auth.response

  const { companyId, supabase } = auth
  const context = req.nextUrl.searchParams.get('context') ?? 'all'

  const wantCollections = context === 'all' || context === 'collections'
  const wantPartners    = context === 'all' || context === 'partners'
  const wantExpenses    = context === 'all' || context === 'expenses'
  const wantPeriod      = context === 'all' || context === 'period-close'
  const wantCashflow    = context === 'all' || context === 'cashflow'

  const observationInput: ObservationInput = {}

  // ── Collections ──────────────────────────────────────────────────────────
  if (wantCollections || wantCashflow) {
    const today = new Date().toISOString().slice(0, 10)

    const { data: salesRows } = await supabase
      .from('sales')
      .select('id, customer_name, total_try:total, sale_date, due_date, amount_paid:paid_amount, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])
      .order('sale_date', { ascending: false })
      .limit(200)

    const rows = (salesRows ?? []) as Array<{
      id: string
      customer_name: string
      total_try: number
      sale_date: string | null
      due_date: string | null
      amount_paid: number | null
      payment_status: string
    }>

    // Count invoices per customer for multi-overdue rule
    const invoiceCountByCustomer = new Map<string, number>()
    for (const r of rows) {
      invoiceCountByCustomer.set(r.customer_name, (invoiceCountByCustomer.get(r.customer_name) ?? 0) + 1)
    }

    if (wantCollections) {
      observationInput.collections = rows.map(r => {
        const refDate = r.due_date ?? r.sale_date ?? ''
        const daysOverdue = refDate
          ? Math.max(0, Math.round((new Date(today).getTime() - new Date(refDate.slice(0, 10)).getTime()) / 86_400_000))
          : 0
        return {
          id:             r.id,
          customer_name:  r.customer_name,
          days_overdue:   daysOverdue,
          total_try:      Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)),
          payment_status: r.payment_status,
          invoice_count:  invoiceCountByCustomer.get(r.customer_name) ?? 1,
        }
      })

      // Compute avg aging days
      if (rows.length > 0) {
        const totalAgeDays = rows.reduce((sum, r) => {
          const saleMs  = r.sale_date ? new Date(r.sale_date).getTime() : Date.now()
          const ageDays = Math.max(0, (Date.now() - saleMs) / 86_400_000)
          return sum + ageDays
        }, 0)
        observationInput.avgAgingDays = Math.round(totalAgeDays / rows.length)
      }
    }
  }

  // ── Partners ──────────────────────────────────────────────────────────────
  if (wantPartners) {
    const { data: partnerRows } = await supabase
      .from('partners')
      .select('id, name, share_ratio')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    const partners = (partnerRows ?? []) as Array<{ id: string; name: string; share_ratio: number }>

    // Fetch loan tranches outstanding per partner
    const { data: trancheRows } = await supabase
      .from('partner_loan_tranches')
      .select('partner_id, outstanding_try')
      .eq('company_id', companyId)
      .eq('status', 'active')

    const loanByPartner = new Map<string, number>()
    for (const t of (trancheRows ?? []) as Array<{ partner_id: string; outstanding_try: number }>) {
      loanByPartner.set(t.partner_id, (loanByPartner.get(t.partner_id) ?? 0) + Number(t.outstanding_try ?? 0))
    }

    const totalLoans = Array.from(loanByPartner.values()).reduce((s, v) => s + v, 0)

    observationInput.partnerLoans = partners.map(p => ({
      partner_name:   p.name,
      net_loan_try:   loanByPartner.get(p.id) ?? 0,
      total_loans_try: totalLoans,
      share_ratio:    Number(p.share_ratio ?? 0),
    }))
  }

  // ── Expenses ──────────────────────────────────────────────────────────────
  if (wantExpenses) {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const fromDate   = sixMonthsAgo.toISOString().slice(0, 10)
    const currentYM  = new Date().toISOString().slice(0, 7)

    const { data: expRows } = await supabase
      .from('expenses')
      .select('amount_try, category, expense_date')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', fromDate)

    const expenses = (expRows ?? []) as Array<{ amount_try: number; category: string | null; expense_date: string | null }>

    // Build monthly expense map for anomaly detection
    const monthlyExpenses: MonthlyExpense[] = []
    const expMap: Record<string, Record<string, number>> = {}
    for (const e of expenses) {
      const ym  = (e.expense_date ?? '').slice(0, 7)
      const cat = e.category ?? 'other'
      if (!ym) continue
      if (!expMap[cat]) expMap[cat] = {}
      expMap[cat][ym] = (expMap[cat][ym] ?? 0) + Number(e.amount_try)
    }
    for (const [category, byMonth] of Object.entries(expMap)) {
      for (const [month, amount] of Object.entries(byMonth)) {
        monthlyExpenses.push({ month, category, amount })
      }
    }

    const anomalies = detectExpenseAnomalies(monthlyExpenses).filter(a => a.severity === 'high')

    observationInput.expenseAnomalies = anomalies.map(a => ({
      category:      a.category,
      current_month: expMap[a.category]?.[currentYM] ?? 0,
      trailing_avg:  a.mean,
    }))
  }

  // ── Period close ──────────────────────────────────────────────────────────
  if (wantPeriod) {
    const { data: periodRows } = await supabase
      .from('accounting_periods')
      .select('id, period_end, status')
      .eq('company_id', companyId)
      .in('status', ['open', 'pre_close'])
      .order('period_end', { ascending: false })
      .limit(1)

    const openPeriod = ((periodRows ?? []) as Array<{ id: string; period_end: string; status: string }>)[0] ?? null
    if (openPeriod) {
      const daysSince = Math.max(0, Math.round(
        (Date.now() - new Date(openPeriod.period_end).getTime()) / 86_400_000,
      ))
      observationInput.periodEndDate      = openPeriod.period_end
      observationInput.daysSincePeriodEnd = daysSince
    }
  }

  // ── Cashflow ──────────────────────────────────────────────────────────────
  if (wantCashflow) {
    // Fetch tranche data for DSR approximation
    const { data: trancheRows } = await supabase
      .from('partner_loan_tranches')
      .select('outstanding_try, annual_interest_rate')
      .eq('company_id', companyId)
      .eq('status', 'active')

    const tranches = (trancheRows ?? []) as Array<{ outstanding_try: number; annual_interest_rate: number | null }>
    const monthlyDebtService = tranches.reduce((s, t) => {
      const principal = Number(t.outstanding_try ?? 0)
      const rate      = Number(t.annual_interest_rate ?? 0)
      return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
    }, 0)

    // Fetch current month net income as rough proxy
    const now         = new Date()
    const monthStart  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today       = now.toISOString().slice(0, 10)

    const [salesRes, expRes] = await Promise.all([
      supabase.from('sales').select('total_try:total').eq('company_id', companyId).is('deleted_at', null).eq('payment_status', 'paid').gte('paid_at', monthStart + 'T00:00:00Z').lte('paid_at', today + 'T23:59:59Z'),
      supabase.from('expenses').select('amount_try').eq('company_id', companyId).is('deleted_at', null).eq('payment_status', 'paid').gte('expense_date', monthStart).lte('expense_date', today),
    ])

    const monthlyRevenue  = ((salesRes.data ?? []) as Array<{ total_try: number }>).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const monthlyExpenses = ((expRes.data ?? []) as Array<{ amount_try: number }>).reduce((s, e) => s + Number(e.amount_try ?? 0), 0)
    const monthlyNet      = monthlyRevenue - monthlyExpenses

    // Cash balance from bank accounts or distributable cash
    const { data: bankRows } = await supabase
      .from('bank_accounts')
      .select('balance_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)

    const cashBalance = ((bankRows ?? []) as Array<{ balance_try: number }>).reduce((s, b) => s + Number(b.balance_try ?? 0), 0)

    // Runway: cash / monthly burn (if losing money)
    const monthlyBurn = monthlyNet < 0 ? Math.abs(monthlyNet) : (monthlyExpenses > 0 ? monthlyExpenses : 0)
    const runwayMonths = cashBalance > 0 && monthlyBurn > 0
      ? cashBalance / monthlyBurn
      : cashBalance > 0 ? 999 : -1

    if (runwayMonths >= 0) {
      observationInput.cashRunwayMonths = runwayMonths
    }

    // DSR
    const dsr = monthlyNet > 0 ? Math.min(1, monthlyDebtService / monthlyNet) : (monthlyDebtService > 0 ? 1 : 0)
    observationInput.dsr = dsr
  }

  const observations = deriveObservations(observationInput)

  // Filter by context if not 'all'
  const filtered = context === 'all'
    ? observations
    : observations.filter(o => o.context === context)

  return NextResponse.json({
    observations: filtered,
    computed_at:  new Date().toISOString(),
    context,
  })
}
