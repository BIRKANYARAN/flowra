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
import { FxWidget }                  from '@/components/layout/FxWidget'
import { CORPORATE_TAX_RATE_TR }     from '@/lib/services/finance-rules'
import { fetchTcmbWithFallback }     from '@/lib/fx'
import { computeCashPosition }       from '@/lib/finance/cash'
import { FlowraKpiCard }             from '@/components/ui-kit/FlowraKpiCard'
import { CashflowChart }             from '@/components/dashboard/CashflowChart'
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
import { fmtTRY as fmt } from '@/lib/format'

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
  healthy:  { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', icon: '✓' },
  caution:  { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700',   icon: '⚠' },
  'at-risk':{ bg: 'bg-orange-50',   border: 'border-orange-200',  text: 'text-orange-800',  badge: 'bg-orange-100 text-orange-700', icon: '!' },
  critical: { bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-800',     badge: 'bg-red-100 text-red-700',       icon: '✗' },
}

const ALERT_SEVERITY_THEME: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  critical: { bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',    dot: 'bg-red-500' },
  warning:  { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  info:     { bg: 'bg-blue-50',    border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-400' },
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

const TRY_FULL_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function fmtFull(n: number): string { const raw = Number(n || 0); return (raw < 0 ? '−' : '') + TRY_FULL_FMT.format(Math.abs(raw)) + ' TL' }
function pct(v: number): string { return `${(v * 100).toFixed(1).replace('.', ',')}%` }

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
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      <div className="text-3xl">⚠️</div>
      <p className="text-sm text-gray-500">Oturum bilgisi alınamadı. Lütfen sayfayı yenileyin.</p>
      <a href="/dashboard" className="text-sm text-violet-600 font-semibold hover:underline">Yeniden Dene</a>
    </div>
  )

  const uid = userId
  const { from, to, label, year, month } = currentMonthPeriod()
  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-gray-900">Şirket bilgisi yüklenemedi</h2>
        <p className="text-sm text-gray-500 max-w-sm">
          Hesabınıza bağlı şirket bilgisi alınamadı. Lütfen sayfayı yenileyin veya destek ekibiyle iletişime geçin.
        </p>
        <a href="/dashboard" className="text-sm text-violet-600 font-semibold hover:underline">
          Yeniden Dene
        </a>
      </div>
    )
  }

  // ── Parallel data fetching ─────────────────────────────────────────────────
  // Financial summary is fetched via direct service call (no HTTP round-trip).
  const [
    finSummary, openProfs, stockValue, alertCount, fxData,
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

    sq(async () => {
      const { count } = await supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('actor_user_id', uid).eq('is_read', false)
      return count ?? 0
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

    // Trailing months for forecast: last 5 complete months revenue + expenses
    sq(async () => {
      const results: Array<{ revenue: number; expenses: number }> = []
      for (let i = 1; i <= 5; i++) {
        const d = new Date(year, month - 1 - i, 1)
        const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
        const mFrom = `${y}-${m}-01`
        const mTo   = new Date(y, d.getMonth() + 1, 0).toISOString().slice(0, 10)
        const [saleData, expData] = await Promise.all([
          supabase.from('sales').select('total_try:total').eq('company_id', companyId).is('deleted_at', null).gte('sale_date', mFrom).lte('sale_date', mTo),
          supabase.from('expenses').select('amount_try').eq('company_id', companyId).is('deleted_at', null).gte('expense_date', mFrom).lte('expense_date', mTo),
        ])
        const rev = (saleData.data ?? []).reduce((s, r) => s + Number(r.total_try), 0)
        const exp = (expData.data ?? []).reduce((s, r) => s + Number(r.amount_try), 0)
        results.push({ revenue: rev, expenses: exp })
      }
      return results
    }, [] as Array<{ revenue: number; expenses: number }>),
  ])

  // FinancialSummary already carries the canonical field names (revenue_try, cost_try, etc.)
  // No remapping needed — just use it directly via the ZERO_FS fallback.
  const fs = finSummary

  // ── Derived values ─────────────────────────────────────────────────────────
  const outstanding          = openProfs.reduce((s, p) => s + Number(p.total_try ?? 0), 0)
  const vatStatus            = fs.net_vat_try > 0 ? 'payable' : 'carry_forward'
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
  const runwayDays       = monthlyBurn > 0 ? Math.round((cashDistributable / monthlyBurn) * 30) : -1
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
      conclusion: 'Tahsil → runway uzar',
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

  return (
    <div className="flex flex-col gap-5 max-w-5xl">

      {/* ── PAGE HERO ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-gray-900 leading-tight">CEO Komuta Merkezi</h1>
          <div className="flex items-center gap-2.5 mt-1.5 flex-wrap">
            <span className="text-sm text-gray-400">{label}</span>
            <span className="text-gray-200">·</span>
            <div className={`flex items-center gap-1.5 text-sm font-semibold ${situTheme.text}`}>
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black ${situTheme.badge}`}>
                {situTheme.icon}
              </span>
              <span className="truncate max-w-xs">{situation.situationLine}</span>
            </div>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full cursor-help ${situTheme.badge}`}
              title="Durum skoru: 80+ sağlıklı · 60–79 dikkat · 40–59 risk · 40 altı kritik">
              {situation.composite}/100
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          <Link href="/dashboard/commercial?tab=proformas"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors">
            + Proforma
          </Link>
          <Link href="/dashboard/operations?tab=expenses"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors">
            + Gider
          </Link>
          <Link href="/dashboard/commercial?tab=collections"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
            Tahsilat
          </Link>
        </div>
      </div>

      {/* ── ADAPTIVE PRESSURE BANNER — only renders when system detects crisis ── */}
      {pressureMode === 'cash_crisis' && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-red-600 flex-shrink-0">⚠ NAKİT KRİZİ</span>
            <span className="text-sm text-red-700 font-medium truncate">
              {runwayDays}g nakit ömrü — acil eylem gerekiyor
            </span>
          </div>
          <Link href="/dashboard/planning?tab=cash-projection"
            className="flex-shrink-0 text-xs font-bold text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            Eylem Planı →
          </Link>
        </div>
      )}
      {pressureMode === 'collections' && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 flex-shrink-0">TAHSİLAT BASKI</span>
            <span className="text-sm text-amber-800 font-medium truncate">
              {fmt(overdueTotal60)} 60+ gün gecikmiş — nakit dönüşü yavaş
            </span>
          </div>
          <Link href="/dashboard/commercial?tab=collections"
            className="flex-shrink-0 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            Tahsilatı Hızlandır →
          </Link>
        </div>
      )}
      {pressureMode === 'tax' && (
        <div className="flex items-center justify-between gap-3 px-5 py-3 rounded-xl border border-orange-200 bg-orange-50">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 flex-shrink-0">VERGİ YÜKÜMLÜLÜĞÜ</span>
            <span className="text-sm text-orange-800 font-medium truncate">
              {fmt(fs.net_vat_try)} KDV ödenecek — dağıtım öncesi rezerv ayır
            </span>
          </div>
          <Link href="/dashboard/cfo/tax/kdv"
            className="flex-shrink-0 text-xs font-bold text-orange-800 bg-orange-100 hover:bg-orange-200 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap">
            Vergi Planla →
          </Link>
        </div>
      )}

      {/* ── CAUSAL CONTEXT CHAIN — system cross-center intelligence ──────────── */}
      {ctxChain && (
        <Link href={ctxChain.href}
          className="flex items-center gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:border-gray-200 transition-all overflow-hidden group">
          <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex-shrink-0">BAĞLAM</span>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {ctxChain.nodes.map((node, i) => (
              <span key={i} className="flex items-center gap-1 flex-shrink-0">
                {i > 0 && <span className="text-gray-300 text-xs mx-0.5">→</span>}
                <span className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                  node.severity === 'critical' ? 'bg-red-50 text-red-700 border border-red-100' :
                  node.severity === 'warn'     ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                  'bg-gray-50 text-gray-600 border border-gray-100'
                }`}>
                  {node.label}
                </span>
              </span>
            ))}
            <span className="text-gray-300 text-xs mx-1 flex-shrink-0">→</span>
            <span className="text-[11px] text-gray-500 italic flex-shrink-0">{ctxChain.conclusion}</span>
          </div>
          <span className="flex-shrink-0 text-[10px] font-semibold text-primary-600 group-hover:text-primary-700 whitespace-nowrap">
            Analiz →
          </span>
        </Link>
      )}

      {/* ── FINANCIAL INSTRUMENT STRIP — unified state panel ─────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-gray-100">

          {/* Ciro */}
          <Link href="/dashboard/commercial?tab=sales" className="px-5 py-4 hover:bg-gray-50/70 transition-colors">
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Ciro</div>
            <div className="text-[22px] font-black tabular-nums leading-none text-gray-900">
              <span className="text-gray-300 font-normal text-sm mr-0.5">₺</span>{formatKpi(fs.revenue_try)}
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">
              {fs.revenue_try > 0 ? `Brüt marj ${pct(grossMarginPct)}` : 'Satış yok'}
            </div>
            {revDeltaPct !== null && (
              <div className={`text-[10px] font-semibold mt-0.5 tabular-nums ${revDeltaPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {revDeltaPct >= 0 ? '▲' : '▼'} {Math.abs(revDeltaPct).toFixed(1)}% geçen ay
              </div>
            )}
          </Link>

          {/* Aylık Net */}
          <Link href="/dashboard/finance?tab=pnl" className={`px-5 py-4 hover:opacity-90 transition-opacity ${monthlyNet < 0 ? 'bg-red-50' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Aylık Net</div>
            <div className={`text-[22px] font-black tabular-nums leading-none ${monthlyNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              <span className={`font-normal text-sm mr-0.5 ${monthlyNet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>₺</span>
              {formatKpi(Math.abs(monthlyNet))}
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">{monthlyNet >= 0 ? 'Kârlı dönem' : 'Zarar'}</div>
            {breakEvenRevenue !== null && (
              <div className="text-[10px] text-gray-400 mt-0.5">Başabaş: {fmt(breakEvenRevenue)}</div>
            )}
          </Link>

          {/* Bekleyen Tahsilat */}
          <Link href="/dashboard/commercial?tab=collections" className={`px-5 py-4 hover:opacity-90 transition-opacity ${uncollectedSalesTotal > 0 ? 'bg-amber-50' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Bekleyen</div>
            <div className={`text-[22px] font-black tabular-nums leading-none ${uncollectedSalesTotal > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {uncollectedSalesTotal > 0
                ? <><span className="text-amber-300 font-normal text-sm mr-0.5">₺</span>{formatKpi(uncollectedSalesTotal)}</>
                : <span className="text-lg">Temiz</span>}
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">
              {uncollectedSalesTotal > 0 ? `${uncollectedSalesCount} satış · %${actuallyCollectedPct} tahsil` : 'Tümü tahsil edildi'}
            </div>
            {overdueTotal60 > 0 && (
              <div className="text-[10px] font-semibold text-red-500 tabular-nums">{fmt(overdueTotal60)} 60+ gün</div>
            )}
          </Link>

          {/* Nakit Ömrü */}
          <Link href="/dashboard/planning?tab=cash-projection" className={`px-5 py-4 hover:opacity-90 transition-opacity ${runwayDays >= 0 && runwayDays < 90 ? 'bg-orange-50' : ''}`}>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Nakit Ömrü</div>
            <div className={`text-[22px] font-black tabular-nums leading-none ${runwayDays < 0 ? 'text-gray-400' : runwayDays < 90 ? 'text-red-600' : 'text-emerald-700'}`}>
              {runwayDays < 0
                ? <span className="text-lg">—</span>
                : runwayDays >= 365
                  ? <>{Math.round(runwayMonths)}<span className="text-base font-semibold ml-0.5">ay</span></>
                  : <>{runwayDays}<span className="text-base font-semibold ml-0.5">g</span></>
              }
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">
              {runwayDays < 0 ? 'Veri yok' : runwayDays < 30 ? '⚠ Kritik eşik' : runwayDays < 90 ? 'Baskı altında' : 'Sağlıklı'}
            </div>
            {cashDistributable > 0 && (
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">{fmt(cashDistributable)} dağıtılabilir</div>
            )}
          </Link>

        </div>
      </div>

      {/* ── KARAR SIRASI — Operational Workflow Queue ─────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Karar Sırası</span>
            {critAlerts.length > 0 && (
              <span className="inline-flex items-center text-[9px] font-black bg-red-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                {critAlerts.length} ACİL
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-400">{topAlerts.length} öğe bekliyor</span>
        </div>

        {topAlerts.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <span className="text-sm text-gray-500">Tüm sistemler normal · Bekleyen karar yok</span>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">

            {/* ── ACIL ─────────────────────────────────────────────────────── */}
            {critAlerts.length > 0 && (
              <div>
                <div className="px-5 py-1.5 bg-red-50/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-red-500">
                    ● Acil — {critAlerts.length} hareket gerekiyor
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {critAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-5 py-3.5 border-l-[3px] border-red-400 hover:bg-red-50/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 leading-tight">{alert.title}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold px-3 py-1.5 bg-red-600 text-white rounded-lg group-hover:bg-red-700 transition-colors whitespace-nowrap">
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
                <div className="px-5 py-1.5 bg-amber-50/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-600">
                    ◐ Yaklaşıyor — {warnAlerts.length} takip
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {warnAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-5 py-3.5 border-l-[3px] border-amber-300 hover:bg-amber-50/30 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 leading-tight">{alert.title}</div>
                        <div className="text-[11px] text-gray-500 mt-0.5 truncate">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg group-hover:bg-gray-50 transition-colors whitespace-nowrap">
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
                <div className="px-5 py-1.5 bg-gray-50/60">
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">
                    ○ Bilgi — {infoAlerts.length}
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {infoAlerts.map(alert => (
                    <Link key={alert.id} href={alert.actionHref}
                      className="flex items-center gap-4 px-5 py-3.5 border-l-[3px] border-gray-200 hover:bg-gray-50/60 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-600 leading-tight">{alert.title}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate">{alert.detail}</div>
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400 group-hover:text-gray-600 transition-colors whitespace-nowrap">
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

      {/* ── FINANCIAL DETAIL GRID ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* NAKİT KÖPRÜSÜ */}
        <div className="lg:col-span-7 bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nakit Köprüsü</span>
            <Link href="/dashboard/insights" className="text-[10px] text-primary-600 font-semibold hover:text-primary-700">Analiz →</Link>
          </div>
          <div className="px-5 py-3.5 space-y-2">
            <WRow label="+ Tahsil Edilen" value={actuallyCollected} sub={`${fmt(fs.revenue_try)} fatura · %${actuallyCollectedPct}`} />
            <WRow label="− Ödenmiş Giderler" value={-paidExpenses} sub="ödenen" />
            <WRow label="− Açık Yükümlülükler" value={-outstandingObligations} sub={`${fmt(unpaidExpenses)} ödenmemiş`} />
            <div className="border-t border-dashed border-gray-200 pt-2">
              <WRow label="= Dağıtılabilir" value={cashDistributable} sub={`Nakit bakiye ${fmt(cashBalance)}`} isTotal />
            </div>
          </div>
          {cashDistributable === 0 ? (
            <div className="mx-5 mb-4 text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Dağıtılacak nakit yok{uncollectedSalesTotal > 0 ? ` — ${fmt(uncollectedSalesTotal)} tahsilat bekliyor` : ''}
            </div>
          ) : equalization.entries.length > 0 ? (
            <div className="px-5 pb-4 pt-2 border-t border-gray-50 flex items-center gap-2 overflow-hidden flex-wrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 flex-shrink-0">Paylaşım</span>
              {equalization.entries.slice(0, 4).map(e => (
                <div key={e.partner_id} className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1 min-w-0">
                  <span className="text-[10px] text-gray-600 font-semibold truncate max-w-[72px]">{e.partner_name}</span>
                  <span className="text-[11px] font-black tabular-nums text-emerald-700 flex-shrink-0">{fmt(e.total_payout)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* TAX + METRICS */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* KDV */}
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">KDV (Net)</div>
                <div className={`text-xl font-black tabular-nums leading-none ${fs.net_vat_try > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                  <span className={`font-normal text-sm mr-0.5 ${fs.net_vat_try > 0 ? 'text-orange-300' : 'text-emerald-300'}`}>₺</span>
                  {formatKpi(Math.abs(fs.net_vat_try))}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">Sat: {fmt(fs.sales_vat_try)} · Alış: {fmt(fs.purchase_vat_try + fs.expense_vat_try)}</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 ${vatStatus === 'payable' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {vatStatus === 'payable' ? 'Ödenecek' : 'Devir'}
              </span>
            </div>
          </div>
          {/* Kurumlar Vergisi */}
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Kurumlar Vergisi</div>
                <div className={`text-xl font-black tabular-nums leading-none ${fs.corporate_tax_try > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                  <span className="text-gray-300 font-normal text-sm mr-0.5">₺</span>{formatKpi(fs.corporate_tax_try)}
                </div>
                <div className="text-[10px] text-gray-400 mt-1">Matrah: {fmt(fs.matrah_try)}</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-1 bg-gray-100 text-gray-500 rounded-lg flex-shrink-0">
                %{fs.corporate_tax_rate}
              </span>
            </div>
          </div>
          {/* FX */}
          <FxWidget initialFx={{ USD: fxData.USD, EUR: fxData.EUR, source: fxData.source, rate_date: fxData.rate_date, fetched_at: fxData.fetched_at }} />
        </div>
      </div>

      {/* ── SECONDARY ROW: Forecast + Giderler + Open Proformalar ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* 12-Month Forecast */}
        <div className="lg:col-span-8 bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">12 Aylık Nakit Tahmini</span>
            <Link href="/dashboard/planning?tab=simulation" className="text-[10px] text-primary-600 font-semibold hover:text-primary-700">Simülasyon →</Link>
          </div>
          <div className="px-5 py-4 grid grid-cols-3 gap-4">
            {([
              { label: 'Kötümser', data: forecast.pessimistic, summary: forecast.summary.pessimistic, color: 'text-red-600', barColor: 'bg-red-200', barActive: 'bg-red-400' },
              { label: 'Baz',      data: forecast.base,        summary: forecast.summary.base,        color: 'text-gray-700', barColor: 'bg-gray-100', barActive: 'bg-gray-400' },
              { label: 'İyimser',  data: forecast.optimistic,  summary: forecast.summary.optimistic,  color: 'text-emerald-700', barColor: 'bg-emerald-100', barActive: 'bg-emerald-400' },
            ] as const).map(({ label, data, summary, color, barColor, barActive }) => (
              <div key={label} className="flex flex-col gap-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</div>
                <div className="flex items-end gap-0.5 h-10">
                  {data.slice(0, 12).map((m, i) => {
                    const maxCash = Math.max(...data.map(x => Math.abs(x.cash)), 1)
                    const height  = Math.max(3, Math.round((Math.abs(m.cash) / maxCash) * 40))
                    return (
                      <div key={i} title={`${m.label}: ${fmt(m.cash)}`}
                        className={`flex-1 rounded-sm transition-colors ${m.cash >= 0 ? barActive : 'bg-red-300'}`}
                        style={{ height: `${height}px` }}
                      />
                    )
                  })}
                </div>
                <div className={`text-sm font-black tabular-nums ${color}`}>
                  <span className="text-gray-300 font-normal text-xs mr-0.5">₺</span>{formatKpi(Math.abs(summary.endCash))}
                </div>
                <div className="text-[10px] text-gray-400 leading-snug">
                  {summary.runwayEndMonth
                    ? <span className="text-red-500 font-semibold">{summary.runwayEndMonth}&apos;da nakit biter</span>
                    : <span>{summary.totalNet >= 0 ? `+${fmt(summary.totalNet)} net` : `${fmt(summary.totalNet)} zarar`}</span>
                  }
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column: proformalar + dönem + giderler */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Giderler breakdown */}
          <div className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Giderler</div>
            <div className="text-xl font-black tabular-nums text-gray-900 leading-none mb-1">
              <span className="text-gray-300 font-normal text-sm mr-0.5">₺</span>{formatKpi(fs.expenses_total_try)}
            </div>
            <div className="text-[10px] text-gray-400 mb-2">~{fmt(monthlyExpenses)}/ay</div>
            {expDeltaPct !== null && (
              <div className={`text-[11px] font-semibold tabular-nums ${expDeltaPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {expDeltaPct > 0 ? '▲' : '▼'} {Math.abs(expDeltaPct).toFixed(1)}% <span className="text-gray-400 font-normal">geçen ay</span>
              </div>
            )}
            <Link href="/dashboard/operations?tab=expenses" className="block mt-2 text-[10px] text-primary-600 font-semibold hover:underline">
              Gider detayı →
            </Link>
          </div>

          {/* Açık proformalar */}
          {outstanding > 0 && (
            <Link href="/dashboard/commercial?tab=proformas"
              className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:border-gray-200 hover:shadow-[0_2px_6px_rgba(17,24,39,0.07)] transition-all">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Açık Proformalar</div>
              <div className="text-xl font-black tabular-nums text-primary-700 leading-none">
                <span className="text-primary-300 font-normal text-sm mr-0.5">₺</span>{formatKpi(outstanding)}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{openProfs.length} adet onay bekliyor →</div>
            </Link>
          )}

          {/* Dönem kapanışı */}
          {openPeriodDaysOverdue > 10 && (
            <Link href="/dashboard/cfo/period-close"
              className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 hover:border-amber-300 hover:shadow-sm transition-all">
              <div className="text-[10px] font-black uppercase tracking-widest text-amber-500 mb-1.5">Dönem Kapanışı</div>
              <div className="text-sm font-bold text-amber-700">{openPeriodDaysOverdue} gündür bekliyor</div>
              <div className="text-[10px] text-amber-500 mt-1">CFO Cockpit'e git →</div>
            </Link>
          )}

          {/* Tasks reminder */}
          {taskReminders.length > 0 && (
            <Link href="/dashboard/planning?tab=tasks"
              className="bg-white border border-gray-100 rounded-xl px-4 py-3.5 shadow-[0_1px_2px_rgba(17,24,39,0.04)] hover:border-gray-200 transition-colors">
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Yaklaşan Görevler</div>
              <div className="text-xl font-black text-primary-700">{taskReminders.length}</div>
              <div className="text-[10px] text-gray-400 mt-1">
                {taskReminders.filter(t => t.due_date < todayISO).length > 0
                  ? `${taskReminders.filter(t => t.due_date < todayISO).length} gecikmiş`
                  : '7 gün içinde vadeli'
                }
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* ── CASHFLOW CHART ────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-100 rounded-xl shadow-[0_1px_2px_rgba(17,24,39,0.04)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nakit Akışı</span>
        </div>
        <div className="p-4">
          <CashflowChart className="w-full" />
        </div>
      </div>

    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const KPI_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const KPI_FMT_K = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

function formatKpi(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return KPI_FMT_K.format(n / 1_000_000) + 'M'
  if (abs >= 10_000)    return KPI_FMT_K.format(n / 1_000) + 'K'
  return KPI_FMT.format(n)
}

// ── Inline waterfall row ───────────────────────────────────────────────────────

function WRow({ label, value, sub, isTotal = false }: { label: string; value: number; sub?: string; isTotal?: boolean }) {
  const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const fmtV = (n: number) => (n < 0 ? '−' : '') + '₺' + TRY_FMT.format(Math.abs(n))
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className={`text-sm ${isTotal ? 'font-bold text-gray-900' : 'font-medium text-gray-500'}`}>{label}</span>
        {sub && <span className="text-[10px] text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span className={`tabular-nums shrink-0 font-black ${isTotal ? `text-base ${value >= 0 ? 'text-emerald-700' : 'text-red-600'}` : `text-sm ${value >= 0 ? 'text-gray-700' : 'text-red-600'}`}`}>
        {fmtV(value)}
      </span>
    </div>
  )
}
