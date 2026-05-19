export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// CEO Executive Cockpit (Faz 4)
//
// Intelligence layer:
//   SituationEngine → weighted composite health score + situation line
//   AlertEngine     → configurable threshold rules → top-5 Decision Alerts
//   ForecastEngine  → 12-month 3-scenario projection mini-view
//
// Preserved from prior version:
//   All data fetching (financial summary, tax, proformas, FX, expenses, etc.)
//   Cash Waterfall bridge panel + Tax metrics panel
//   CashflowChart + FxWidget
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient }              from '@/lib/supabase-server'
import { redirect }                  from 'next/navigation'
import Link                          from 'next/link'
import { CORPORATE_TAX_RATE_TR }     from '@/lib/services/finance-rules'
import { fetchTcmbWithFallback }     from '@/lib/fx'
import { computeCashPosition }       from '@/lib/finance/cash'
import { resolveCompanyId }          from '@/lib/resolve-company'
import { safeSystemQuery }           from '@/lib/admin-db'
import { computeSituation }          from '@/lib/engines/situation.engine'
import { evaluateAlerts }            from '@/lib/engines/alert.engine'
import { computeForecast }           from '@/lib/engines/forecast.engine'
import type { AlertInputs }          from '@/lib/engines/alert.engine'
import type { SituationStatus }      from '@/lib/engines/situation.engine'
import { FinanceService }            from '@/lib/services/finance.service'
import { PartnerService }            from '@/lib/services/partner.service'
import type { FinancialSummary, EqualizationResult } from '@/types'
import { fmtTRY as fmt, fmtPct, fmtKpi, fmtCompact } from '@/lib/format'
import { generateSituationSummary } from '@/lib/services/ai-summary.service'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FxData {
  USD:        number
  EUR:        number
  source:     'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  rate_date:  string | null
  fetched_at: string | null
}
const EMPTY_FX: FxData = { USD: 0, EUR: 0, source: 'fallback', rate_date: null, fetched_at: null }

const ZERO_EQ: EqualizationResult = { baseline_per_unit: 0, total_equalization: 0, distributable: 0, remaining_after_eq: 0, entries: [], total_net_loans_try: 0, max_partner_net_loan_try: 0 }

const ZERO_FS: FinancialSummary = {
  period: { from: '', to: '' },
  revenue_try: 0, cost_try: 0, gross_profit_try: 0, expenses_total_try: 0,
  deductible_expenses_try: 0, non_deductible_expenses_try: 0,
  matrah_try: 0, corporate_tax_rate: CORPORATE_TAX_RATE_TR, corporate_tax_try: 0, net_after_tax_try: 0,
  sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0, net_vat_try: 0,
}

const CASH_EXCLUDED_EXPENSE_TYPES = new Set(['loan_repayment','partner_financing','dividend','internal_transfer'])

// ── Situation status → color theme ────────────────────────────────────────────

const SITUATION_THEME: Record<SituationStatus, { bg: string; border: string; text: string; badge: string; icon: string }> = {
  healthy:  { bg: 'bg-pos-light',  border: 'border-pos-light', text: 'text-pos-text', badge: 'bg-pos-light text-pos-text', icon: '✓' },
  caution:  { bg: 'bg-warn-light',    border: 'border-warn-light',   text: 'text-warn-text',   badge: 'bg-warn-light text-warn-text',   icon: '⚠' },
  'at-risk':{ bg: 'bg-warn-light',   border: 'border-warn/20',  text: 'text-warn-text',  badge: 'bg-warn-light text-warn-text', icon: '!' },
  critical: { bg: 'bg-neg-light',      border: 'border-neg-light',     text: 'text-neg-text',     badge: 'bg-neg-light text-neg-text',       icon: '✗' },
}

const ALERT_SEVERITY_THEME: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-neg-light',     border: 'border-neg-light',    text: 'text-neg-text',    dot: 'bg-neg-light' },
  warning:  { bg: 'bg-warn-light',   border: 'border-warn-light',  text: 'text-warn-text',  dot: 'bg-warn-light' },
  info:     { bg: 'bg-info-light',    border: 'border-info-light',   text: 'text-info-text',   dot: 'bg-info' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() }
  catch (e) {
    console.error('[dashboard]', e instanceof Error ? e.message : String(e))
    return fallback
  }
}

async function loadFxDirect(): Promise<FxData> {
  try {
    const supabase = createClient()
    const today = new Date().toISOString().slice(0, 10)
    const now   = new Date().toISOString()
    const { data: cached } = await supabase.from('fx_rates').select('currency, buying, fetched_at').in('currency', ['USD','EUR']).eq('rate_date', today)
    const cu = (cached ?? []).find(r => r.currency === 'USD')
    const ce = (cached ?? []).find(r => r.currency === 'EUR')
    if (cu?.buying && ce?.buying) return { USD: Number(cu.buying), EUR: Number(ce.buying), source: 'db', rate_date: today, fetched_at: (cu.fetched_at as string | null) ?? today }
    const tcmb = await fetchTcmbWithFallback()
    if (tcmb) {
      try {
        safeSystemQuery('fx_rates').upsert([
          { rate_date: tcmb.date, currency: 'USD', buying: tcmb.usd, selling: Number((tcmb.usd * 1.005).toFixed(6)), source: tcmb.source, fetched_at: now },
          { rate_date: tcmb.date, currency: 'EUR', buying: tcmb.eur, selling: Number((tcmb.eur * 1.005).toFixed(6)), source: tcmb.source, fetched_at: now },
        ], { onConflict: 'rate_date,currency' }).then(({ error }) => { if (error) console.error('[dashboard/fx] upsert:', error.message) })
      } catch { /* service-role unavailable */ }
      return { USD: tcmb.usd, EUR: tcmb.eur, source: tcmb.source, rate_date: tcmb.date, fetched_at: now }
    }
    const { data: latest } = await supabase.from('fx_rates').select('currency, buying, fetched_at, rate_date').in('currency', ['USD','EUR']).order('rate_date', { ascending: false }).limit(4)
    const lu = (latest ?? []).find(r => r.currency === 'USD')
    const le = (latest ?? []).find(r => r.currency === 'EUR')
    if (lu?.buying && le?.buying) return { USD: Number(lu.buying), EUR: Number(le.buying), source: 'db', rate_date: (lu.rate_date as string) ?? null, fetched_at: (lu.fetched_at as string | null) ?? (lu.rate_date as string) }
    return EMPTY_FX
  } catch { return EMPTY_FX }
}

function currentMonthPeriod() {
  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  const from = `${year}-${mon}-01`
  const to   = now.toISOString().slice(0, 10)
  const label = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  return { from, to, label, year, month: now.getMonth() + 1 }
}

function pct(v: number): string { return fmtPct(v * 100) }

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {

  // ── Auth ──────────────────────────────────────────────────────────────────
  // layout.tsx is the single auth gate — it redirects unauthenticated users to
  // /auth before this page renders. We do NOT redirect here; that would create
  // an /auth ↔ /dashboard loop when getUser() fails transiently.
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    // Transient Supabase error — fall through to error UI below
  }
  if (!userId) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2 text-center px-4">
      <p className="text-xs text-[#64748b]">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard" className="text-xs text-brand-light font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const uid = userId
  const { from, to, label, year, month } = currentMonthPeriod()
  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-2 text-center px-4">
        <h2 className="text-base font-bold text-[#0f172a]">Şirket bilgisi yüklenemedi</h2>
        <p className="text-xs text-[#64748b] max-w-sm">
          Hesabınıza bağlı şirket bilgisi alınamadı. Lütfen sayfayı yenileyin veya destek ekibiyle iletişime geçin.
        </p>
        <a href="/dashboard" className="text-xs text-brand-light font-semibold hover:underline">
          Yeniden Dene
        </a>
      </div>
    )
  }

  // ── Parallel data fetching ─────────────────────────────────────────────────
  // Financial summary is fetched via direct service call (no HTTP round-trip).
  const [
    finSummary, openProfs, stockValue, fxData,
    uncollectedSalesData, taskReminders, collectedSalesData,
    paidExpensesData, unpaidExpensesData,
    // Faz 4: period status, next tranche, trailing 5-month actuals for forecast
    openPeriodData, nextTrancheData,
    // Faz 5: equity commitment gap (TTK 588 / AlertEngine EQUITY_GAP_OVERDUE rule)
    equityCommitments,
    trailing5,
  ] = await Promise.all([

    sq(() => FinanceService.getFinancialSummary(uid, companyId, { from, to }), ZERO_FS),

    sq(async () => {
      const { data } = await supabase.from('proformas').select('id, total_try').eq('company_id', companyId).in('status', ['sent','accepted']).is('deleted_at', null)
      return (data ?? []) as Array<{ id: string; total_try: number | null }>
    }, [] as Array<{ id: string; total_try: number | null }>),

    sq(async () => {
      const { data } = await supabase.from('stock_lots').select('qty_remaining, cost_price_try').eq('company_id', companyId).gt('qty_remaining', 0).is('deleted_at', null)
      return (data ?? []).reduce((sum, l) => sum + Number(l.qty_remaining) * Number((l as { cost_price_try?: number | null }).cost_price_try ?? 0), 0)
    }, 0),

    sq(() => loadFxDirect(), EMPTY_FX),

    sq(async () => {
      const { data } = await supabase.from('sales').select('id, total_try:total, amount_paid:paid_amount, payment_status, customer_name, sale_date, due_date').eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null).order('sale_date', { ascending: false }).limit(100)
      return (data ?? []) as Array<{ id: string; total_try: number; amount_paid: number | null; payment_status: string; customer_name: string; sale_date: string; due_date: string | null }>
    }, [] as Array<{ id: string; total_try: number; amount_paid: number | null; payment_status: string; customer_name: string; sale_date: string; due_date: string | null }>),

    sq(async () => {
      const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase.from('tasks').select('id, title, due_date, status').eq('company_id', companyId).eq('status', 'open').is('deleted_at', null).not('due_date', 'is', null).lte('due_date', in7days).order('due_date', { ascending: true }).limit(5)
      return (data ?? []) as Array<{ id: string; title: string; due_date: string; status: string }>
    }, [] as Array<{ id: string; title: string; due_date: string; status: string }>),

    sq(async () => {
      const { data } = await supabase.from('sales').select('total_try:total').eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null).not('paid_at', 'is', null).gte('paid_at', from + 'T00:00:00Z').lte('paid_at', to + 'T23:59:59Z')
      return (data ?? []) as Array<{ total_try: number }>
    }, [] as Array<{ total_try: number }>),

    sq(async () => {
      const { data } = await supabase.from('expenses').select('amount_try, expense_type').eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null).gte('expense_date', from).lte('expense_date', to)
      return (data ?? []) as Array<{ amount_try: number; expense_type: string | null }>
    }, [] as Array<{ amount_try: number; expense_type: string | null }>),

    sq(async () => {
      const { data } = await supabase.from('expenses').select('amount_try').eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null)
      return (data ?? []) as Array<{ amount_try: number }>
    }, [] as Array<{ amount_try: number }>),

    // Faz 4 additions — graceful on missing tables/columns
    sq(async () => {
      const { data } = await supabase.from('accounting_periods').select('id, period_end, status').eq('company_id', companyId).in('status', ['open','pre_close']).order('period_end', { ascending: false }).limit(1)
      return (data ?? []) as Array<{ id: string; period_end: string; status: string }>
    }, [] as Array<{ id: string; period_end: string; status: string }>),

    // All active tranches — used for both next-due display AND DSR calculation.
    // outstanding_try × annual_interest_rate / 12 = monthly interest service per tranche.
    sq(async () => {
      const { data } = await supabase.from('partner_loan_tranches')
        .select('due_date, amount_try, outstanding_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false })
      return (data ?? []) as Array<{ due_date: string | null; amount_try: number; outstanding_try: number; annual_interest_rate: number | null }>
    }, [] as Array<{ due_date: string | null; amount_try: number; outstanding_try: number; annual_interest_rate: number | null }>),

    // Equity commitment gap: TTK 588 — unpaid committed capital
    sq(async () => {
      const { data } = await supabase
        .from('partner_capital_commitments')
        .select('committed_try, paid_try, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
      return (data ?? []) as Array<{ committed_try: number; paid_try: number; due_date: string | null }>
    }, [] as Array<{ committed_try: number; paid_try: number; due_date: string | null }>),

    // Trailing months for forecast: last 5 complete months — 2 parallel range queries
    sq(async () => {
      const t5Start  = new Date(year, month - 1 - 5, 1)
      const t5From   = t5Start.toISOString().slice(0, 10)
      const t5To     = new Date(year, month - 1, 0).toISOString().slice(0, 10)
      const [saleRange, expRange] = await Promise.all([
        supabase.from('sales').select('total_try:total, sale_date').eq('company_id', companyId).is('deleted_at', null).gte('sale_date', t5From).lte('sale_date', t5To),
        supabase.from('expenses').select('amount_try, expense_date').eq('company_id', companyId).is('deleted_at', null).gte('expense_date', t5From).lte('expense_date', t5To),
      ])
      const revMap = new Map<string, number>()
      const expMap = new Map<string, number>()
      for (const r of (saleRange.data ?? [])) { const ym = (r.sale_date as string).slice(0, 7); revMap.set(ym, (revMap.get(ym) ?? 0) + Number(r.total_try ?? 0)) }
      for (const r of (expRange.data  ?? [])) { const ym = (r.expense_date as string).slice(0, 7); expMap.set(ym, (expMap.get(ym) ?? 0) + Number(r.amount_try ?? 0)) }
      const results: Array<{ revenue: number; expenses: number }> = []
      for (let i = 5; i >= 1; i--) {
        const d  = new Date(year, month - 1 - i, 1)
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        results.push({ revenue: revMap.get(ym) ?? 0, expenses: expMap.get(ym) ?? 0 })
      }
      return results
    }, [] as Array<{ revenue: number; expenses: number }>),
  ])

  // FinancialSummary already carries the canonical field names (revenue_try, cost_try, etc.)
  // No remapping needed — just use it directly via the ZERO_FS fallback.
  const fs = finSummary

  // ── Derived values ─────────────────────────────────────────────────────────
  const outstanding          = openProfs.reduce((s, p) => s + Number(p.total_try ?? 0), 0)
  // vatStatus removed — KDV card moved to Finance hub Tax tab
  const uncollectedSalesTotal = uncollectedSalesData.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
  const uncollectedSalesCount = uncollectedSalesData.length
  const actuallyCollected     = (collectedSalesData ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const actuallyCollectedPct  = fs.revenue_try > 0 ? Math.min(100, Math.round((actuallyCollected / fs.revenue_try) * 100)) : 100
  const paidExpenses          = (paidExpensesData ?? []).reduce((sum, row) => {
    if (row.expense_type && CASH_EXCLUDED_EXPENSE_TYPES.has(row.expense_type)) return sum
    return sum + Number(row.amount_try ?? 0)
  }, 0)
  const unpaidExpenses = (unpaidExpensesData ?? []).reduce((sum, row) => sum + Number(row.amount_try ?? 0), 0)
  const { cashBalance, outstandingObligations, cashDistributable } = computeCashPosition({ paymentsReceived: actuallyCollected, paidExpenses, unpaidExpenses })

  const daysInPeriod    = Math.max((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1, 1)
  const monthsInPeriod  = daysInPeriod / 30.44
  const grossMarginPct  = fs.revenue_try > 0 ? fs.gross_profit_try / fs.revenue_try : 0
  const monthlyExpenses = fs.expenses_total_try / monthsInPeriod
  const breakEvenRevenue = grossMarginPct > 0.001 ? monthlyExpenses / grossMarginPct : null
  const monthlyNet       = fs.net_after_tax_try / monthsInPeriod

  const todayISO         = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const sixtyDaysAgoISO  = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
  // Use sale_date (business invoice date) for aging — comparing date strings directly (YYYY-MM-DD < YYYY-MM-DD)
  const overdueSales30   = uncollectedSalesData.filter(s => s.sale_date < thirtyDaysAgoISO)
  const overdueSales60   = uncollectedSalesData.filter(s => s.sale_date < sixtyDaysAgoISO)
  const overdueTotal30   = overdueSales30.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
  const overdueTotal60   = overdueSales60.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
  // Runway: use cashDistributable (operational cash, unpaid obligations deducted) as the base,
  // and absolute monthlyNet loss as monthly burn. This aligns with getCfoMetrics().burn.runway_months.
  // Previously used `liquidProxy = outstanding + stockValue` (open proformas + inventory) which
  // overestimates available cash and is NOT cash on hand.
  const monthlyBurn      = monthlyNet < 0 ? Math.abs(monthlyNet) : 0
  const dailyBurn        = monthlyBurn / 30
  // Runway when LOSING money: cashDistributable / monthlyBurn
  // Runway when PROFITABLE: still show cash coverage in months (cashDistributable / monthly expenses)
  // so the CEO can see "7 months of expenses covered" even when P&L is positive.
  // runwayDays = -1 is ONLY used when cashDistributable < 0 (no distributable cash at all).
  const runwayDays = (() => {
    if (cashDistributable <= 0) return -1                          // no cash
    if (monthlyBurn > 0)        return Math.round((cashDistributable / monthlyBurn) * 30) // burning
    // Profitable: show cash-to-expenses coverage (how many months expenses are covered by cash)
    const mExp = monthlyExpenses > 0 ? monthlyExpenses : null
    return mExp ? Math.round((cashDistributable / mExp) * 30) : -1
  })()
  const runwayMonths     = runwayDays >= 0 ? runwayDays / 30 : 999

  // ── Partner equalization ───────────────────────────────────────────────────
  const distributableAmount = cashDistributable
  let equalization: EqualizationResult = ZERO_EQ
  try {
    equalization = await PartnerService.calculateEqualization(uid, companyId, distributableAmount)
  } catch { /* non-fatal: missing partners or DB error */ }

  // ── Period overdue check ───────────────────────────────────────────────────
  const openPeriod = openPeriodData[0] ?? null
  const openPeriodDaysOverdue = openPeriod
    ? Math.max(0, Math.round((Date.now() - new Date(openPeriod.period_end).getTime()) / 86_400_000))
    : -1

  // ── Next tranche due ───────────────────────────────────────────────────────
  // Next upcoming tranche: first active tranche with due_date >= today
  const nextTranche = nextTrancheData.find(t => t.due_date != null && t.due_date >= todayISO) ?? null
  const nextTrancheDueDays = nextTranche?.due_date
    ? Math.max(0, Math.round((new Date(nextTranche.due_date).getTime() - Date.now()) / 86_400_000))
    : -1

  // ── Situation Engine ───────────────────────────────────────────────────────
  const overdueRatioPct = uncollectedSalesTotal > 0
    ? Math.round((overdueTotal30 / uncollectedSalesTotal) * 100)
    : 0

  // DSR = monthly debt service / monthly net income.
  // Debt service: principal × annual_rate / 12 per active tranche.
  // For interest-free tranches (rate = 0 or null) use 1.5%/month conservative proxy
  // — same calculation as alerts/evaluate route for consistency.
  const monthlyDebtService = nextTrancheData.reduce((s, t) => {
    const principal = Number(t.outstanding_try ?? 0)
    const rate      = Number(t.annual_interest_rate ?? 0)
    return s + (rate > 0 ? principal * rate / 12 : principal * 0.015)
  }, 0)
  const debtServiceRatio = monthlyNet > 0 ? Math.min(1, monthlyDebtService / monthlyNet) : 0

  const situation = computeSituation({
    cashRunwayMonths:  runwayMonths,
    isProfitable:      monthlyNet >= 0,
    netMarginPct:      fs.revenue_try > 0 ? fs.net_after_tax_try / fs.revenue_try : 0,
    debtServiceRatio,
    overdueRatioPct,
    maxBurdenScoreAbs: equalization.total_equalization > 0
      ? Math.min(1, equalization.total_equalization / Math.max(distributableAmount, 1))
      : 0,
  })

  // ── Alert Engine ──────────────────────────────────────────────────────────
  const alertInputs: AlertInputs = {
    overdueCount30:          overdueSales30.length,
    overdueTotal30,
    overdueCount60:          overdueSales60.length,
    overdueTotal60,
    totalReceivables:        uncollectedSalesTotal,
    cashRunwayDays:          runwayDays,
    monthlyNetIncome:        monthlyNet,
    maxBurdenScoreAbs:       situation.scores.partner / 100,
    nextTrancheDueDays,
    nextTrancheAmount:       nextTranche ? Number(nextTranche.amount_try) : 0,
    openPeriodDaysOverdue,
    kdvPayable:              fs.net_vat_try,
    // KDV beyanı Türkiye'de takip eden ayın 24'üne kadardır.
    // Mevcut dönemin ayı (month) bilindiğinden due date hesaplanabilir.
    taxDueDays: fs.net_vat_try > 0 ? (() => {
      const dueMonth = month === 12 ? 1 : month + 1
      const dueYear  = month === 12 ? year + 1 : year
      const dueDate  = new Date(`${dueYear}-${String(dueMonth).padStart(2, '0')}-24`)
      return Math.round((dueDate.getTime() - Date.now()) / 86_400_000)
    })() : -1,
    bsImbalanceTry:          0,     // graceful: requires GL (shadow mode)
    legalReserveDeficit:     0,     // graceful: requires period close
    equityGapTry:            equityCommitments.reduce((s, c) => s + Math.max(0, Number(c.committed_try) - Number(c.paid_try)), 0),
    equityCallOverdueDays:   (() => {
      const overdue = equityCommitments
        .filter(c => Number(c.committed_try) > Number(c.paid_try) && c.due_date && c.due_date < todayISO)
      if (overdue.length === 0) return -1
      const oldest = overdue.reduce((min, c) => c.due_date! < min ? c.due_date! : min, overdue[0].due_date!)
      return Math.round((Date.now() - new Date(oldest).getTime()) / 86_400_000)
    })(),
    debtServiceRatio,
    partnerLoanConcentration: equalization.total_net_loans_try > 0
      ? equalization.max_partner_net_loan_try / equalization.total_net_loans_try
      : 0,
  }
  const decisionAlerts = evaluateAlerts(alertInputs)
  const topAlerts      = decisionAlerts.slice(0, 5)

  // ── AI Situation Summary ───────────────────────────────────────────────────
  // Rule-based fallback always fires when ANTHROPIC_API_KEY is absent.
  const aiSummary = await generateSituationSummary({
    situation,
    topAlerts,
    period:      label,
    revenue:     fs.revenue_try,
    netIncome:   fs.net_after_tax_try,
    cashBalance,
  })

  // ── Forecast Engine ───────────────────────────────────────────────────────
  const trailingData = trailing5.length > 0 ? trailing5 : [{ revenue: fs.revenue_try, expenses: fs.expenses_total_try }]
  const n = trailingData.length
  const avgRev = trailingData.reduce((s, m) => s + m.revenue, 0) / n
  const avgExp = trailingData.reduce((s, m) => s + m.expenses, 0) / n
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year

  const forecast = computeForecast({
    avgMonthlyRevenue:       avgRev > 0 ? avgRev : fs.revenue_try,
    avgMonthlyExpenses:      avgExp > 0 ? avgExp : fs.expenses_total_try,
    currentCash:             cashBalance,
    monthlyDebtService,
    optimisticGrowthFactor:  0.15,
    pessimisticStressFactor: 0.20,
    startYear:               nextYear,
    startMonth:              nextMonth,
  })

  // ── Render ────────────────────────────────────────────────────────────────
  const situTheme  = SITUATION_THEME[situation.status]

  // Alert groups for Decision Queue
  const critAlerts = topAlerts.filter(a => a.severity === 'critical')
  const warnAlerts = topAlerts.filter(a => a.severity === 'warning')
  const infoAlerts = topAlerts.filter(a => a.severity === 'info')

  // Temporal urgency labels — countdown over static date
  function daysLeft(days: number): string {
    if (days <= 0)  return 'bugün!'
    if (days === 1) return '1 gün kaldı'
    if (days < 8)   return `${days} gün kaldı`
    if (days < 31)  return `${days} gün kaldı`
    return `${Math.round(days / 30)} ay kaldı`
  }

  // Per-card size: dominant gets subtly larger — 26px vs 21px (calm differential, not violent jump).
  // No padding shift — layout never moves. Spatial stability = executive trust.
  function kpiValueSize(key: 'runway' | 'receivables' | 'net' | 'revenue'): string {
    if (dominantKpi === 'none') return 'text-[22px]'
    return key === dominantKpi ? 'text-[26px]' : 'text-[21px]'
  }

  // ── Adaptive pressure mode ─────────────────────────────────────────────────
  type PressureMode = 'cash_crisis' | 'collections' | 'tax' | 'healthy'
  const pressureMode: PressureMode =
    runwayDays >= 0 && runwayDays < 45 ? 'cash_crisis'
    : overdueTotal60 > 50_000 && overdueTotal60 > fs.revenue_try * 0.12 ? 'collections'
    : fs.net_vat_try > 100_000 && cashDistributable < fs.net_vat_try * 2 ? 'tax'
    : 'healthy'

  // ── Causal context chain — deterministic system intelligence ──────────────
  interface CtxNode  { label: string; severity: 'ok' | 'warn' | 'critical' }
  interface CtxChain { nodes: CtxNode[]; conclusion: string; href: string }
  let ctxChain: CtxChain | null = null

  if (uncollectedSalesTotal > 10_000 && runwayDays >= 0 && runwayDays < 150) {
    ctxChain = {
      nodes: [
        { label: `${fmt(uncollectedSalesTotal)} alacak bekleniyor`, severity: 'warn' },
        { label: runwayDays < 60 ? `nakit ömrü ${runwayDays}g (kritik)` : `runway ${runwayDays}g`, severity: runwayDays < 60 ? 'critical' : 'warn' },
        { label: 'dağıtım kapasitesi daralıyor', severity: 'warn' },
      ],
      conclusion: 'Tahsilat yapılırsa nakit ömrü uzar',
      href: '/dashboard/commercial?tab=collections',
    }
  } else if (fs.net_vat_try > 50_000 && cashDistributable < fs.net_vat_try * 2) {
    ctxChain = {
      nodes: [
        { label: `${fmt(fs.net_vat_try)} KDV borcu`, severity: 'warn' },
        { label: `${fmt(cashDistributable)} dağıtılabilir`, severity: cashDistributable < fs.net_vat_try ? 'critical' : 'ok' },
        { label: 'nakit rezervi azalıyor', severity: 'warn' },
      ],
      conclusion: 'KDV öncesi dağıtım yapma',
      href: '/dashboard/cfo/tax/kdv',
    }
  } else if (monthlyNet < 0 && runwayDays >= 0 && runwayDays < 180) {
    ctxChain = {
      nodes: [
        { label: `${fmt(Math.abs(monthlyNet))} aylık zarar`, severity: 'critical' },
        { label: `${fmt(monthlyExpenses)}/ay gider`, severity: 'warn' },
        { label: `${runwayDays}g kaldı`, severity: runwayDays < 90 ? 'critical' : 'warn' },
      ],
      conclusion: 'Gider optimizasyonu kritik',
      href: '/dashboard/operations?tab=expenses',
    }
  }

  // Delta: last month vs avg of trailing 5 for revenue indicator
  const lastMonthRev = trailing5.length > 0 ? trailing5[trailing5.length - 1]?.revenue ?? 0 : 0
  const prevMonthRev = trailing5.length > 1 ? trailing5[trailing5.length - 2]?.revenue ?? 0 : 0
  const revDeltaPct  = prevMonthRev > 0 ? ((lastMonthRev - prevMonthRev) / prevMonthRev) * 100 : null
  const lastMonthExp = trailing5.length > 0 ? trailing5[trailing5.length - 1]?.expenses ?? 0 : 0
  const prevMonthExp = trailing5.length > 1 ? trailing5[trailing5.length - 2]?.expenses ?? 0 : 0
  const expDeltaPct  = prevMonthExp > 0 ? ((lastMonthExp - prevMonthExp) / prevMonthExp) * 100 : null
  // Net income delta: (rev - exp) for last two complete trailing months
  const lastMonthNet_ = lastMonthRev - lastMonthExp
  const prevMonthNet_ = prevMonthRev - prevMonthExp
  const netDeltaPct   = prevMonthNet_ !== 0 ? ((lastMonthNet_ - prevMonthNet_) / Math.abs(prevMonthNet_)) * 100 : null

  // ── Behavioral dominance — only genuine crises earn visual priority ─────────
  // Fires on 2 conditions only: imminent cash crisis or severe receivable surge.
  // Net loss and revenue dip are communicated by color alone — they don't shift layout.
  const dominantKpi: 'runway' | 'receivables' | 'none' =
    runwayDays >= 0 && runwayDays < 30                                          ? 'runway'      :
    overdueTotal60 > 50_000 && overdueTotal60 > uncollectedSalesTotal * 0.5     ? 'receivables' :
    'none'

  // ── C10: TYPE C Cross-Domain Synthesis ──────────────────────────────────────
  // Composes intelligence from C3 (treasury), C9 (receivables), C4 (governance),
  // C7 (forecast) into a 4-cell executive pulse strip.
  type SynthSeverity = 'ok' | 'warn' | 'critical'
  const synthDomains: Array<{ label: string; text: string; severity: SynthSeverity; href: string }> = [

    // Treasury (C3) — DSR + annualized service pressure
    (() => {
      if (monthlyDebtService === 0) return { label: 'Hazine', text: 'Aktif borç servisi yok — finansman gideri oluşmuyor', severity: 'ok' as SynthSeverity, href: '/dashboard/planning?tab=debt-pressure' }
      const annual = monthlyDebtService * 12
      if (debtServiceRatio > 0.60) return { label: 'Hazine', text: `DSR %${(debtServiceRatio * 100).toFixed(0)} — borç servisi nakit üretiminin büyük bölümünü tüketiyor; acil yapılandırma değerlendirilebilir`, severity: 'critical' as SynthSeverity, href: '/dashboard/planning?tab=debt-pressure' }
      if (debtServiceRatio > 0.30) return { label: 'Hazine', text: `DSR %${(debtServiceRatio * 100).toFixed(0)} — aylık ${fmt(monthlyDebtService)} / yıllık ${fmtCompact(annual)} servis; büyüme ve temettü kapasitesi daralıyor`, severity: 'warn' as SynthSeverity, href: '/dashboard/planning?tab=debt-pressure' }
      return { label: 'Hazine', text: `DSR %${(debtServiceRatio * 100).toFixed(0)} — aylık ${fmt(monthlyDebtService)} borç servisi; sürdürülebilir düzeyde`, severity: 'ok' as SynthSeverity, href: '/dashboard/planning?tab=debt-pressure' }
    })(),

    // Receivables cascade (C9) — aging bucket forward pressure
    (() => {
      if (overdueTotal60 > 0) return { label: 'Alacak', text: `${fmt(overdueTotal60)} alacak 60 gün bandında — 30 gün içinde 90+ dilimine geçer; şüpheli alacak karşılığı gerekebilir`, severity: 'critical' as SynthSeverity, href: '/dashboard/finance?tab=risks' }
      if (overdueTotal30 > 0) return { label: 'Alacak', text: `${fmt(overdueTotal30)} alacak 30 gün bandında — tahsilat yapılmazsa bir ay içinde 60 gün dilimine geçer`, severity: 'warn' as SynthSeverity, href: '/dashboard/commercial?tab=collections' }
      if (uncollectedSalesTotal === 0) return { label: 'Alacak', text: 'Tüm alacaklar tahsil edildi — alacak baskısı yok', severity: 'ok' as SynthSeverity, href: '/dashboard/finance?tab=risks' }
      return { label: 'Alacak', text: `${fmt(uncollectedSalesTotal)} açık alacak — vadeler içinde; takip önerilir`, severity: 'ok' as SynthSeverity, href: '/dashboard/finance?tab=risks' }
    })(),

    // Governance (C4) — period close + accounting integrity
    (() => {
      if (openPeriodDaysOverdue > 30) return { label: 'Yönetişim', text: `Dönem ${openPeriodDaysOverdue} gündür açık — kapanış gecikmesi muhasebe doğruluğunu ve denetim zincirini zayıflatıyor`, severity: 'critical' as SynthSeverity, href: '/dashboard/cfo/period-close' }
      if (openPeriodDaysOverdue > 10) return { label: 'Yönetişim', text: `Dönem ${openPeriodDaysOverdue} gün gecikmiş — yakında kapatılmalı; gecikme denetim kalitesini düşürür`, severity: 'warn' as SynthSeverity, href: '/dashboard/cfo/period-close' }
      if (openPeriodDaysOverdue === 0) return { label: 'Yönetişim', text: 'Dönem aktif — kapanış zamanında; muhasebe bütünlüğü korunuyor', severity: 'ok' as SynthSeverity, href: '/dashboard/finance?tab=cfo' }
      return { label: 'Yönetişim', text: 'Dönem kapalı — muhasebe döngüsü tamamlandı', severity: 'ok' as SynthSeverity, href: '/dashboard/finance?tab=cfo' }
    })(),

    // Forecast (C7) — scenario spread driver
    (() => {
      const base = forecast.summary.base
      const spread = forecast.summary.optimistic.endCash - forecast.summary.pessimistic.endCash
      const spreadStr = spread > 0 ? fmtCompact(Math.abs(spread)) : fmt(0)
      if (base.runwayEndMonth) return { label: 'Projeksiyon', text: `Baz senaryoda nakit ${base.runwayEndMonth}'de tükeniyor — ${spreadStr} senaryo aralığı; gelir varsayımı kritik`, severity: 'critical' as SynthSeverity, href: '/dashboard/finance?tab=forecast' }
      if (base.totalNet < 0) return { label: 'Projeksiyon', text: `Baz senaryo 12 aylık zarar — ${fmtCompact(Math.abs(base.totalNet))} kümülatif; senaryo aralığı ${spreadStr}`, severity: 'warn' as SynthSeverity, href: '/dashboard/finance?tab=forecast' }
      return { label: 'Projeksiyon', text: `Baz senaryo 12 aylık +${fmtCompact(base.totalNet)} net — senaryo aralığı ${spreadStr}; gelir momentumu belirleyici`, severity: 'ok' as SynthSeverity, href: '/dashboard/finance?tab=forecast' }
    })(),
  ]

  return (
    <div className="flex flex-col gap-4">

      {/* ── PAGE HERO ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-base font-bold text-[#0f172a] leading-tight">CEO Komuta Merkezi</h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm text-[#94a3b8] tabular-nums">{label}</span>
          <span className="text-[#e2e8f0] text-sm">·</span>
          <Link href="/dashboard/commercial?tab=proformas"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#0f172a] text-white text-xs font-semibold hover:bg-[#334155] transition-colors">
            + Proforma
          </Link>
          <Link href="/dashboard/operations?tab=expenses"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#e2e8f0] text-[#334155] text-xs font-semibold hover:bg-[#f8fafc] transition-colors">
            + Gider
          </Link>
          <Link href="/dashboard/commercial?tab=collections"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-brand-light text-white text-xs font-semibold hover:bg-brand transition-colors">
            Tahsilat
          </Link>
        </div>
      </div>

      {/* ── ADAPTIVE PRESSURE BANNER — only renders when system detects crisis ── */}
      {pressureMode === 'cash_crisis' && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded border border-neg-light bg-neg-light">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-neg flex-shrink-0">NAKİT KRİZİ</span>
            <span className="text-xs text-neg-text font-medium truncate">
              {runwayDays}g nakit ömrü — acil eylem gerekiyor
            </span>
          </div>
          <Link href="/dashboard/planning?tab=cash-projection"
            className="flex-shrink-0 text-xs font-bold text-neg-text bg-neg-light hover:bg-neg-light px-3 py-1.5 rounded transition-colors whitespace-nowrap">
            Eylem Planı →
          </Link>
        </div>
      )}

      {/* ── CAUSAL CONTEXT CHAIN — system cross-center intelligence ──────────── */}
      {ctxChain && (
        <Link href={ctxChain.href}
          className="flex items-center gap-3 px-4 py-2.5 bg-white border border-[#e2e8f0] rounded shadow-sm hover:border-[#e2e8f0] transition-colors overflow-hidden group">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] flex-shrink-0">BAĞLAM</span>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {ctxChain.nodes.map((node, i) => (
              <span key={i} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <span className="text-[#cbd5e1] text-xs mx-0.5">→</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  node.severity === 'critical' ? 'bg-neg-light text-neg-text border border-neg-light' :
                  node.severity === 'warn'     ? 'bg-warn-light text-warn-text border border-warn-light' :
                  'bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]'
                }`}>
                  {node.label}
                </span>
              </span>
            ))}
            <span className="text-[#cbd5e1] text-xs mx-1 flex-shrink-0">→</span>
            <span className="text-[11px] text-[#64748b] italic flex-shrink-0">{ctxChain.conclusion}</span>
          </div>
          <span className="flex-shrink-0 text-[10px] font-semibold text-brand-light group-hover:text-brand whitespace-nowrap">
            Analiz →
          </span>
        </Link>
      )}

      {/* ── DÖNEM BRİEFİNG — executive treasury-style situational brief ──────── */}
      <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">Dönem Briefing</span>
          <span className="text-[9px] text-[#94a3b8] tabular-nums">{label}</span>
        </div>
        <p className="text-xs text-[#334155] leading-relaxed mb-2.5">{aiSummary.summary_tr}</p>
        <div className="space-y-0.5 mb-2.5">
          {aiSummary.key_factors.map((f, i) => (
            <div key={i} className="text-[11px] text-[#64748b] leading-snug">
              <span className="text-[#cbd5e1] mr-1.5">—</span>{f}
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-[#f1f5f9] flex items-start gap-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8] mt-0.5 flex-shrink-0">Eylem</span>
          <span className="text-[11px] text-[#334155] font-medium leading-snug">{aiSummary.recommendation}</span>
        </div>
      </div>

      {/* ── FINANCIAL INSTRUMENT STRIP ─────────────────────────────────────────── */}
      {/* One container border tint when a genuine crisis signal is active. No cell animations. */}
      {/* Size differential: dominant 26px vs 21px — felt, not shouted. Layout never shifts.  */}
      <div className={`bg-white rounded shadow-sm overflow-hidden border ${
        dominantKpi === 'runway'      ? 'border-neg-light'   :
        dominantKpi === 'receivables' ? 'border-warn-light' : 'border-[#e2e8f0]'
      }`}>
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[#e2e8f0]">

          {/* Ciro */}
          <Link href="/dashboard/commercial?tab=sales"
            className="px-4 py-3 hover:bg-[#f8fafc]/60 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest mb-1.5 text-[#94a3b8]">Ciro</div>
            <div className={`${kpiValueSize('revenue')} font-black tabular-nums leading-none text-[#0f172a]`}>
              <span className="text-[#cbd5e1] font-normal text-sm mr-0.5">₺</span>{fmtKpi(fs.revenue_try)}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">
              {fs.revenue_try > 0 ? `Brüt marj ${pct(grossMarginPct)}` : 'Satış yok'}
            </div>
            {revDeltaPct !== null && (
              <div className={`text-[10px] font-semibold mt-0.5 tabular-nums ${revDeltaPct >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {revDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(revDeltaPct).toFixed(1)}% geçen ay
              </div>
            )}
          </Link>

          {/* Aylık Net */}
          <Link href="/dashboard/finance?tab=pnl"
            className={`px-4 py-3 hover:bg-[#f8fafc]/60 transition-colors ${monthlyNet < 0 ? 'bg-neg-light/25' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest mb-1.5 text-[#94a3b8]">Aylık Net</div>
            <div className={`${kpiValueSize('net')} font-black tabular-nums leading-none ${monthlyNet >= 0 ? 'text-pos-text' : 'text-neg'}`}>
              <span className={`font-normal text-sm mr-0.5 ${monthlyNet >= 0 ? 'text-pos/70' : 'text-neg/70'}`}>₺</span>
              {fmtKpi(Math.abs(monthlyNet))}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">{monthlyNet >= 0 ? 'Kârlı dönem' : 'Zarar'}</div>
            {netDeltaPct !== null && (
              <div className={`text-[10px] font-semibold mt-0.5 tabular-nums ${netDeltaPct >= 0 ? 'text-pos-text' : 'text-neg'}`}>
                {netDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(netDeltaPct).toFixed(1)}% geçen ay
              </div>
            )}
            {breakEvenRevenue !== null && (
              <div className="text-[10px] text-[#94a3b8] mt-0.5">Başabaş: {fmt(breakEvenRevenue)}</div>
            )}
          </Link>

          {/* Bekleyen Tahsilat */}
          <Link href="/dashboard/commercial?tab=collections"
            className={`px-4 py-3 hover:bg-[#f8fafc]/60 transition-colors ${dominantKpi === 'receivables' ? 'bg-warn-light/40' : ''}`}>
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${dominantKpi === 'receivables' ? 'text-warn-text' : 'text-[#94a3b8]'}`}>
              Bekleyen
            </div>
            <div className={`${kpiValueSize('receivables')} font-black tabular-nums leading-none ${uncollectedSalesTotal > 0 ? 'text-warn-text' : 'text-pos-text'}`}>
              {uncollectedSalesTotal > 0
                ? <><span className="text-warn/70 font-normal text-sm mr-0.5">₺</span>{fmtKpi(uncollectedSalesTotal)}</>
                : <span className="text-lg">Temiz</span>}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">
              {uncollectedSalesTotal > 0 ? `${uncollectedSalesCount} satış · %${actuallyCollectedPct} tahsil` : 'Tümü tahsil edildi'}
            </div>
            {overdueTotal60 > 0 && (
              <div className="text-[10px] font-semibold tabular-nums text-neg">
                {fmt(overdueTotal60)} · 60+ gün
              </div>
            )}
          </Link>

          {/* Nakit Ömrü */}
          <Link href="/dashboard/planning?tab=cash-projection"
            className={`px-4 py-3 hover:bg-[#f8fafc]/60 transition-colors ${dominantKpi === 'runway' ? 'bg-neg-light/40' : ''}`}>
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${dominantKpi === 'runway' ? 'text-neg' : 'text-[#94a3b8]'}`}>
              Nakit Ömrü
            </div>
            <div className={`${kpiValueSize('runway')} font-black tabular-nums leading-none ${
              runwayDays < 0 ? 'text-[#94a3b8]' : runwayDays < 90 ? 'text-neg' : 'text-pos-text'
            }`}>
              {runwayDays < 0
                ? <span className="text-lg">—</span>
                : runwayDays >= 365
                  ? <>{Math.round(runwayMonths)}<span className="text-base font-semibold ml-0.5">ay</span></>
                  : <>{runwayDays}<span className="text-base font-semibold ml-0.5">g</span></>
              }
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">
              {runwayDays < 0  ? 'Banka bakiyesi girin'
               : runwayDays < 30 ? daysLeft(runwayDays)
               : runwayDays < 90 ? daysLeft(runwayDays)
               : monthlyBurn === 0 ? 'gider karşılığı' : 'Sağlıklı'}
            </div>
            {monthlyBurn > 0 && runwayDays >= 0 && runwayDays < 180 && (
              <div className="text-[10px] text-[#94a3b8] mt-0.5">{fmt(monthlyBurn)}/ay eriyor</div>
            )}
          </Link>

        </div>
      </div>

      {/* ── KARAR SIRASI — Operational Workflow Queue ─────────────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
          <div className="flex items-center gap-2.5">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Karar Sırası</span>
            {critAlerts.length > 0 && (
              <span className="inline-flex items-center text-[9px] font-black bg-neg-light text-white px-1.5 py-0.5 rounded leading-none">
                {critAlerts.length} ACİL
              </span>
            )}
          </div>
          <span className="text-[10px] text-[#94a3b8]">{topAlerts.length} öğe bekliyor</span>
        </div>

        {topAlerts.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-2 h-2 rounded-full bg-pos flex-shrink-0" />
            <span className="text-xs text-[#64748b]">Tüm sistemler normal · Bekleyen karar yok</span>
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">

            {/* ── ACIL ─────────────────────────────────────────────────────── */}
            {critAlerts.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-neg-light/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-neg">
                    ● Acil — {critAlerts.length} hareket gerekiyor
                  </span>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {critAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-4 py-3 border-l-[3px] border-neg hover:bg-neg-light/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-[#0f172a] leading-tight">{alert.title}</div>
                        <div className="text-[11px] text-[#64748b] mt-0.5">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-3 py-1.5 bg-neg text-white rounded group-hover:bg-neg transition-colors whitespace-nowrap">
                        {alert.actionLabel} →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── YAKLAŞIYOR ───────────────────────────────────────────────── */}
            {warnAlerts.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-warn-light/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-warn-text">
                    ◐ Yaklaşıyor — {warnAlerts.length} takip
                  </span>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {warnAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-4 py-3 border-l-[3px] border-warn hover:bg-warn-light/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-[#1e293b] leading-tight">{alert.title}</div>
                        <div className="text-[11px] text-[#64748b] mt-0.5 truncate">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 border border-[#e2e8f0] text-[#64748b] rounded group-hover:bg-[#f8fafc] transition-colors whitespace-nowrap">
                        {alert.actionLabel} →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* ── BİLGİ ────────────────────────────────────────────────────── */}
            {infoAlerts.length > 0 && (
              <div>
                <div className="px-4 py-1.5 bg-[#f8fafc]/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">
                    ○ Bilgi — {infoAlerts.length}
                  </span>
                </div>
                <div className="divide-y divide-[#f1f5f9]">
                  {infoAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-4 py-2.5 border-l-[3px] border-[#e2e8f0] hover:bg-[#f8fafc]/60 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[#64748b] leading-tight">{alert.title}</div>
                        <div className="text-[10px] text-[#94a3b8] mt-0.5 truncate">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-[10px] text-[#94a3b8] group-hover:text-[#64748b] transition-colors whitespace-nowrap">
                        {alert.actionLabel} →
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ── NAKIT KÖPRÜSÜ — compact horizontal rail ───────────────────────── */}
      <div className={`bg-white rounded shadow-sm border transition-colors duration-150 ${
        cashDistributable < 0 ? 'border-neg-light' : cashDistributable > 0 ? 'border-[#e2e8f0]' : 'border-[#e2e8f0]'
      }`}>
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
          <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Nakit Köprüsü</span>
          <Link href="/dashboard/finance?tab=cashflow" className="text-[10px] text-brand-light font-semibold hover:text-brand">Cashflow →</Link>
        </div>
        {/* Rail: first 3 items normal, "= Dağıtılabilir" is the decision node — always dominant */}
        <div className="px-4 py-2.5 grid grid-cols-4 divide-x divide-[#e2e8f0] items-end">
          {/* Input items — subordinate */}
          {[
            { label: '+ Tahsil Edilen',      value: actuallyCollected,       tone: 'text-pos-text', sub: `%${actuallyCollectedPct} tahsilat` },
            { label: '− Ödenen Giderler',    value: -paidExpenses,           tone: 'text-neg',    sub: `${fmt(unpaidExpenses)} bekliyor` },
            { label: '− Açık Yükümlülükler', value: -outstandingObligations, tone: 'text-warn-text',  sub: 'ödenmemiş' },
          ].map(c => (
            <div key={c.label} className="px-4 first:pl-0">
              <div className="text-[9px] font-bold uppercase tracking-widest text-[#94a3b8] mb-1">{c.label}</div>
              <div className={`text-base font-black tabular-nums leading-none ${c.tone}`}>{fmt(c.value)}</div>
              <div className="text-[9px] text-[#94a3b8] mt-0.5">{c.sub}</div>
            </div>
          ))}
          {/* Decision node — Dağıtılabilir always dominates visually */}
          <div className={`pl-4 pr-0 pb-1 border-l border-[#e2e8f0] ${cashDistributable < 0 ? 'bg-neg-light/40 -mx-0 rounded-br-xl' : ''}`}>
            <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${cashDistributable >= 0 ? 'text-[#64748b]' : 'text-neg'}`}>
              = Dağıtılabilir
            </div>
            <div className={`text-xl font-black tabular-nums leading-none ${cashDistributable >= 0 ? 'text-[#0f172a]' : 'text-neg-text'}`}>
              {fmt(cashDistributable)}
            </div>
            <div className="text-[9px] text-[#94a3b8] mt-0.5">bakiye {fmt(cashBalance)}</div>
          </div>
        </div>
        {stockValue > 0 && (
          <div className="px-4 pb-2 pt-2 border-t border-[#f1f5f9] flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#cbd5e1] flex-shrink-0">Stok</span>
            <span className="text-[10px] text-[#94a3b8] tabular-nums">{fmt(stockValue)} maliyet bedeliyle stokta bekliyor</span>
          </div>
        )}
        {cashDistributable > 0 && equalization.entries.length > 0 && (
          <div className={`px-4 pb-2 pt-2 flex items-center gap-2 overflow-hidden flex-wrap ${stockValue > 0 ? '' : 'border-t border-[#f1f5f9]'}`}>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#cbd5e1] flex-shrink-0">Paylaşım</span>
            {equalization.entries.slice(0, 4).map(e => (
              <div key={e.partner_id} className="flex items-center gap-1.5 bg-pos-light border border-pos-light rounded px-2.5 py-1 min-w-0">
                <span className="text-[10px] text-[#64748b] font-semibold truncate max-w-[72px]">{e.partner_name}</span>
                <span className="text-[11px] font-black tabular-nums text-pos-text flex-shrink-0">{fmt(e.total_payout)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SECONDARY ROW: Forecast + Giderler + Open Proformalar ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Runway summary — compressed single line */}
        <div className="lg:col-span-8 bg-white border border-[#e2e8f0] rounded shadow-sm">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f9]">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Nakit Pisti</span>
            <Link href="/dashboard/planning?tab=cash-projection" className="text-[10px] text-brand-light font-semibold hover:text-brand">Projeksiyon →</Link>
          </div>
          {/* Scenario strip: calm equal weight. Base gets slightly larger when in danger — no opacity tricks. */}
          {(() => {
            const baseDanger = !!forecast.summary.base.runwayEndMonth
            const scenarios = [
              { key: 'pessimistic' as const, label: 'Kötümser', summary: forecast.summary.pessimistic, tone: 'text-neg' },
              { key: 'base'        as const, label: 'Baz',      summary: forecast.summary.base,        tone: baseDanger ? 'text-neg-text' : 'text-[#1e293b]' },
              { key: 'optimistic'  as const, label: 'İyimser',  summary: forecast.summary.optimistic,  tone: 'text-pos-text' },
            ]
            return (
              <div className="px-4 py-2.5 grid grid-cols-3 gap-4 divide-x divide-[#e2e8f0] items-end">
                {scenarios.map(({ key, label, summary, tone }) => {
                  const isBase    = key === 'base'
                  const isDanger  = baseDanger && isBase
                  return (
                    <div key={key} className="pl-4 first:pl-0">
                      <div className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${isDanger ? 'text-neg' : 'text-[#94a3b8]'}`}>
                        {label}
                      </div>
                      <div className={`font-black tabular-nums leading-none ${isDanger ? 'text-[19px]' : 'text-base'} ${tone}`}>
                        {summary.runwayEndMonth
                          ? <span className="text-neg">{summary.runwayEndMonth}</span>
                          : fmt(summary.endCash)}
                      </div>
                      <div className="text-[9px] text-[#94a3b8] mt-0.5">
                        {summary.runwayEndMonth ? 'nakit biter' : summary.totalNet >= 0 ? `+${fmt(summary.totalNet)} net` : `${fmt(Math.abs(summary.totalNet))} zarar`}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* Right column: proformalar + dönem + giderler */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Giderler breakdown */}
          <div className="bg-white border border-[#e2e8f0] rounded px-4 py-3.5 shadow-sm">
            <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-3">Giderler</div>
            <div className="text-xl font-black tabular-nums text-[#0f172a] leading-none mb-1">
              <span className="text-[#cbd5e1] font-normal text-sm mr-0.5">₺</span>{fmtKpi(fs.expenses_total_try)}
            </div>
            <div className="text-[10px] text-[#94a3b8] mb-2">~{fmt(monthlyExpenses)}/ay</div>
            {expDeltaPct !== null && (
              <div className={`text-[11px] font-semibold tabular-nums ${expDeltaPct > 0 ? 'text-neg' : 'text-pos-text'}`}>
                {expDeltaPct > 0 ? '▲' : '▼'} {Math.abs(expDeltaPct).toFixed(1)}% <span className="text-[#94a3b8] font-normal">geçen ay</span>
              </div>
            )}
            <Link href="/dashboard/operations?tab=expenses" className="block mt-2 text-[10px] text-brand-light font-semibold hover:underline">
              Gider detayı →
            </Link>
          </div>

          {/* Açık proformalar */}
          {outstanding > 0 && (
            <Link href="/dashboard/commercial?tab=proformas"
              className="bg-white border border-[#e2e8f0] rounded px-4 py-3.5 shadow-sm hover:border-[#e2e8f0] transition-colors">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Açık Proformalar</div>
              <div className="text-xl font-black tabular-nums text-brand leading-none">
                <span className="text-brand-light font-normal text-sm mr-0.5">₺</span>{fmtKpi(outstanding)}
              </div>
              <div className="text-[10px] text-[#94a3b8] mt-1">{openProfs.length} adet onay bekliyor →</div>
            </Link>
          )}

          {/* Dönem kapanışı */}
          {openPeriodDaysOverdue > 10 && (
            <Link href="/dashboard/cfo/period-close"
              className="bg-warn-light border border-warn-light rounded px-4 py-3.5 hover:border-warn transition-colors">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-warn mb-1.5">Dönem Kapanışı</div>
              <div className="text-xs font-bold text-warn-text">{openPeriodDaysOverdue} gündür bekliyor</div>
              <div className="text-[10px] text-warn mt-1">CFO Cockpit'e git →</div>
            </Link>
          )}

          {/* Tasks reminder */}
          {taskReminders.length > 0 && (
            <Link href="/dashboard/planning?tab=tasks"
              className="bg-white border border-[#e2e8f0] rounded px-4 py-3.5 shadow-sm hover:border-[#e2e8f0] transition-colors">
              <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1.5">Yaklaşan Görevler</div>
              <div className="text-xl font-black text-brand">{taskReminders.length}</div>
              <div className="text-[10px] text-[#94a3b8] mt-1">
                {taskReminders.filter(t => t.due_date < todayISO).length > 0
                  ? `${taskReminders.filter(t => t.due_date < todayISO).length} gecikmiş`
                  : '7 gün içinde vadeli'
                }
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* ── RISK RADAR — cross-center intelligence surface ───────────────── */}
      <div className="bg-white border border-[#e2e8f0] rounded shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f1f5f9]">
          <div className="flex items-center gap-3">
            <span className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8]">Risk Radar</span>
            <span className={`text-[9px] font-black px-2 py-0.5 rounded ${situTheme.badge}`}>
              {situation.composite}/100
            </span>
          </div>
          <span className="text-[10px] text-[#94a3b8]">{situation.criticalFactor}</span>
        </div>
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-5 gap-4">
          {([
            {
              key:    'cash',
              label:  'Nakit / Ömür',
              score:  situation.scores.cash,
              href:   '/dashboard/finance?tab=cashflow',
              detail: runwayDays < 0 ? 'Nakit akışı sağlıklı' : `${runwayDays < 365 ? runwayDays + 'g' : Math.round(runwayMonths) + 'ay'} ömür`,
            },
            {
              key:    'profit',
              label:  'Kârlılık',
              score:  situation.scores.profit,
              href:   '/dashboard/finance?tab=pnl',
              detail: fs.revenue_try > 0
                ? `%${(fs.net_after_tax_try / fs.revenue_try * 100).toFixed(1)} net marj`
                : 'Satış yok',
            },
            {
              key:    'debt',
              label:  'Borç Servisi',
              score:  situation.scores.debt,
              href:   '/dashboard/partners?tab=tranches',
              detail: debtServiceRatio > 0 ? `%${(debtServiceRatio * 100).toFixed(0)} DSR` : 'Borç yok',
            },
            {
              key:    'receivables',
              label:  'Alacak Sağlığı',
              score:  situation.scores.receivables,
              href:   '/dashboard/commercial?tab=collections',
              detail: overdueTotal30 > 0 ? `${fmt(overdueTotal30)} gecikmiş` : 'Temiz',
            },
            {
              key:    'partner',
              label:  'Ortak Dengesi',
              score:  situation.scores.partner,
              href:   '/dashboard/partners',
              detail: equalization.total_equalization > 0 ? `${fmt(equalization.total_equalization)} eşitleme` : 'Dengeli',
            },
          ] as const).map(dim => {
            const scoreColor =
              dim.score >= 80 ? 'text-pos-text' :
              dim.score >= 60 ? 'text-warn-text'   :
              dim.score >= 40 ? 'text-warn'  :
              'text-neg'
            const barColor =
              dim.score >= 80 ? 'bg-pos' :
              dim.score >= 60 ? 'bg-warn'   :
              dim.score >= 40 ? 'bg-warn'  :
              'bg-neg'
            const statusLabel =
              dim.score >= 80 ? 'Sağlıklı' :
              dim.score >= 60 ? 'Dikkat'   :
              dim.score >= 40 ? 'Risk'     :
              'Kritik'
            return (
              <Link key={dim.key} href={dim.href}
                className="flex flex-col gap-2 group hover:bg-[#f8fafc]/60 rounded p-3 -m-1 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#94a3b8]">{dim.label}</span>
                  <span className={`text-[9px] font-bold ${scoreColor}`}>{statusLabel}</span>
                </div>
                {/* Score number */}
                <div className={`text-2xl font-black tabular-nums leading-none ${scoreColor}`}>
                  {dim.score}
                  <span className="text-sm font-semibold text-[#cbd5e1] ml-0.5">/100</span>
                </div>
                {/* Progress bar */}
                <div className="bg-[#f1f5f9] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`${barColor} h-full rounded-full transition-all`}
                    style={{ width: `${dim.score}%` }}
                  />
                </div>
                {/* Detail */}
                <div className={`text-[10px] tabular-nums ${scoreColor}`}>{dim.detail}</div>
              </Link>
            )
          })}
        </div>
      </div>


      {/* ── C10: CROSS-DOMAIN SYNTHESIS — autonomous TYPE C operating pulse ─── */}
      <div className="grid grid-cols-2 gap-3">
        {synthDomains.map(domain => {
          const borderClass =
            domain.severity === 'critical' ? 'border-neg-light' :
            domain.severity === 'warn'     ? 'border-warn-light' :
            'border-[#e2e8f0]'
          const labelClass =
            domain.severity === 'critical' ? 'text-neg'       :
            domain.severity === 'warn'     ? 'text-warn-text' :
            'text-[#94a3b8]'
          const dotClass =
            domain.severity === 'critical' ? 'bg-neg'   :
            domain.severity === 'warn'     ? 'bg-warn'  :
            'bg-pos'
          return (
            <Link key={domain.label} href={domain.href}
              className={`bg-white border rounded px-4 py-3 shadow-sm hover:bg-[#f8fafc]/60 transition-colors ${borderClass}`}>
              <div className={`flex items-center gap-1.5 mb-1.5`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
                <span className={`text-[0.65rem] font-black uppercase tracking-widest ${labelClass}`}>{domain.label}</span>
              </div>
              <p className="text-[11px] text-[#334155] leading-snug">{domain.text}</p>
            </Link>
          )
        })}
      </div>

      {/* ── QUICK REPORTS FOOTER ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1 pt-1">
        <div className="text-[10px] text-[#94a3b8]">
          Tüm finansal tablolar, PDF dışa aktarım ve CFO paketi için:
        </div>
        <Link
          href="/dashboard/reports"
          className="text-[11px] font-bold text-brand-light hover:text-brand underline underline-offset-2 whitespace-nowrap ml-4"
        >
          Raporlar →
        </Link>
      </div>

    </div>
  )
}


