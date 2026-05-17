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

// ── Types ─────────────────────────────────────────────────────────────────────

interface FxData {
  USD:        number
  EUR:        number
  source:     'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  rate_date:  string | null
  fetched_at: string | null
}
const EMPTY_FX: FxData = { USD: 0, EUR: 0, source: 'fallback', rate_date: null, fetched_at: null }

const ZERO_EQ: EqualizationResult = { baseline_per_unit: 0, total_equalization: 0, distributable: 0, remaining_after_eq: 0, entries: [] }

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

function fmt(n: number): string {
  const raw = Number(n || 0); const abs = Math.abs(raw); const sign = raw < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${abs.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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
    openPeriodData, nextTrancheData, trailing5,
  ] = await Promise.all([

    sq(() => FinanceService.getFinancialSummary(uid, companyId, { from, to }), ZERO_FS),

    sq(async () => {
      const { data } = await supabase.from('proformas').select('id, total_try').eq('company_id', companyId).in('status', ['sent','accepted']).is('deleted_at', null)
      return (data ?? []) as Array<{ id: string; total_try: number | null }>
    }, [] as Array<{ id: string; total_try: number | null }>),

    sq(async () => {
      const { data } = await supabase.from('stock_lots').select('qty_remaining, entry_cost_try').eq('company_id', companyId).gt('qty_remaining', 0)
      return (data ?? []).reduce((sum, l) => sum + Number(l.qty_remaining) * Number(l.entry_cost_try), 0)
    }, 0),

    sq(async () => {
      const { count } = await supabase.from('alerts').select('id', { count: 'exact', head: true }).eq('actor_user_id', uid).eq('is_read', false)
      return count ?? 0
    }, 0),

    sq(() => loadFxDirect(), EMPTY_FX),

    sq(async () => {
      const { data } = await supabase.from('sales').select('id, total_try, payment_status, customer_name, created_at, due_date').eq('company_id', companyId).neq('payment_status', 'paid').is('deleted_at', null).order('created_at', { ascending: false }).limit(100)
      return (data ?? []) as Array<{ id: string; total_try: number; payment_status: string; customer_name: string; created_at: string; due_date: string | null }>
    }, [] as Array<{ id: string; total_try: number; payment_status: string; customer_name: string; created_at: string; due_date: string | null }>),

    sq(async () => {
      const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase.from('tasks').select('id, title, due_date, status').eq('status', 'open').is('deleted_at', null).not('due_date', 'is', null).lte('due_date', in7days).order('due_date', { ascending: true }).limit(5)
      return (data ?? []) as Array<{ id: string; title: string; due_date: string; status: string }>
    }, [] as Array<{ id: string; title: string; due_date: string; status: string }>),

    sq(async () => {
      const { data } = await supabase.from('sales').select('total_try').eq('company_id', companyId).eq('payment_status', 'paid').is('deleted_at', null).not('paid_at', 'is', null).gte('paid_at', from + 'T00:00:00Z').lte('paid_at', to + 'T23:59:59Z')
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

    sq(async () => {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase.from('partner_loan_tranches').select('due_date, amount_try').eq('company_id', companyId).eq('status', 'active').not('due_date', 'is', null).gte('due_date', today).order('due_date', { ascending: true }).limit(1)
      return (data ?? []) as Array<{ due_date: string; amount_try: number }>
    }, [] as Array<{ due_date: string; amount_try: number }>),

    // Trailing months for forecast: last 5 complete months revenue + expenses
    sq(async () => {
      const results: Array<{ revenue: number; expenses: number }> = []
      for (let i = 1; i <= 5; i++) {
        const d = new Date(year, month - 1 - i, 1)
        const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0')
        const mFrom = `${y}-${m}-01`
        const mTo   = new Date(y, d.getMonth() + 1, 0).toISOString().slice(0, 10)
        const [saleData, expData] = await Promise.all([
          supabase.from('sales').select('total_try').eq('company_id', companyId).is('deleted_at', null).gte('created_at', mFrom).lte('created_at', mTo + 'T23:59:59Z'),
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
  const uncollectedSalesTotal = uncollectedSalesData.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
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
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const sixtyDaysAgoISO  = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const overdueSales30   = uncollectedSalesData.filter(s => s.created_at < thirtyDaysAgoISO)
  const overdueSales60   = uncollectedSalesData.filter(s => s.created_at < sixtyDaysAgoISO)
  const overdueTotal30   = overdueSales30.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const overdueTotal60   = overdueSales60.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
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
  const nextTranche = nextTrancheData[0] ?? null
  const nextTrancheDueDays = nextTranche
    ? Math.max(0, Math.round((new Date(nextTranche.due_date).getTime() - Date.now()) / 86_400_000))
    : -1

  // ── Situation Engine ───────────────────────────────────────────────────────
  const overdueRatioPct = uncollectedSalesTotal > 0
    ? Math.round((overdueTotal30 / uncollectedSalesTotal) * 100)
    : 0

  const situation = computeSituation({
    cashRunwayMonths:  runwayMonths,
    isProfitable:      monthlyNet >= 0,
    netMarginPct:      fs.revenue_try > 0 ? fs.net_after_tax_try / fs.revenue_try : 0,
    debtServiceRatio:  0,   // simplified: no partner loan data in this pass
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
    taxDueDays:              -1,    // not computed in this pass
    bsImbalanceTry:          0,     // graceful: requires GL (shadow mode)
    legalReserveDeficit:     0,     // graceful: requires period close
    equityGapTry:            0,     // graceful
    equityCallOverdueDays:   -1,
    debtServiceRatio:        0,
    partnerLoanConcentration:0,
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
    monthlyDebtService:      0,
    optimisticGrowthFactor:  0.15,
    pessimisticStressFactor: 0.20,
    startYear:               nextYear,
    startMonth:              nextMonth,
  })

  // ── Render ────────────────────────────────────────────────────────────────
  const situTheme  = SITUATION_THEME[situation.status]

  return (
    <div className="flex flex-col gap-1.5 max-w-6xl">

      {/* ── Situation Band ────────────────────────────────────────────────── */}
      <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${situTheme.bg} ${situTheme.border}`}>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${situTheme.badge}`}>
          {situTheme.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold leading-tight truncate ${situTheme.text}`}>
            {situation.situationLine}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className={`text-[10px] font-black px-2 py-0.5 rounded-full cursor-help ${situTheme.badge}`}
            title="Durum skoru: 80+ sağlıklı · 60–79 dikkat · 40–59 risk · 40 altı kritik"
          >
            {situation.composite} / 100
          </div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${situTheme.text} opacity-60`}>
            {label}
          </span>
        </div>
      </div>

      {/* ── Command Bar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-black text-gray-900 tracking-tight uppercase">CEO Cockpit</h1>
          {alertCount > 0 && (
            <Link href="/dashboard/alerts" className="inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold hover:bg-red-200 transition-colors">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
              {alertCount} uyarı
            </Link>
          )}
          {vatStatus === 'payable' && fs.net_vat_try > 50 && (
            <Link href="/dashboard/cfo" className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold hover:bg-orange-200 transition-colors">
              KDV {fmt(fs.net_vat_try)}
            </Link>
          )}
          {taskReminders.length > 0 && (
            <Link href="/dashboard/tasks" className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold hover:bg-violet-200 transition-colors">
              {taskReminders.filter(t => t.due_date < todayISO).length > 0 && '⚠ '}
              {taskReminders.length} görev
            </Link>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <Link href="/dashboard/commercial?tab=proformas" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-700 transition-colors">+ Proforma</Link>
          <Link href="/dashboard/commercial?tab=sales"     className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">Satışlar</Link>
          <Link href="/dashboard/commercial?tab=collections" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">Tahsilat</Link>
          <Link href="/dashboard/operations?tab=expenses"  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">+ Gider</Link>
        </div>
      </div>

      {/* ── Decision Alerts (top 3, compact) ─────────────────────────────── */}
      {topAlerts.length === 0 ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-emerald-700">Aktif uyarı yok — tüm eşikler normal</span>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {topAlerts.slice(0, 3).map(alert => {
            const theme = ALERT_SEVERITY_THEME[alert.severity] ?? ALERT_SEVERITY_THEME.info
            return (
              <Link
                key={alert.id}
                href={alert.actionHref}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:opacity-90 ${theme.bg} ${theme.border} ${theme.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${theme.dot}`} />
                <span className="font-bold truncate flex-1">{alert.title}</span>
                <span className="text-[10px] font-normal opacity-70 truncate hidden sm:block">{alert.detail}</span>
                <span className="ml-auto flex-shrink-0 text-[10px] font-bold opacity-80 hover:opacity-100">{alert.actionLabel} →</span>
              </Link>
            )
          })}
          {topAlerts.length > 3 && (
            <Link href="/dashboard/commercial?tab=collections" className="text-[10px] text-amber-600 font-semibold px-1 hover:underline">
              +{topAlerts.length - 3} daha fazla uyarı var →
            </Link>
          )}
        </div>
      )}

      {/* ── KPI Strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-1.5">
        <FlowraKpiCard label="Ciro" value={fs.revenue_try} rawValue={fmt(fs.revenue_try)} sub={fs.revenue_try > 0 ? `Brüt marj ${pct(grossMarginPct)}` : 'Satış yok'} href="/dashboard/commercial?tab=sales" />
        <FlowraKpiCard label="Tahsil Edilen" value={actuallyCollected} rawValue={fmt(actuallyCollected)} sub={`%${actuallyCollectedPct} oran`} tone={actuallyCollectedPct >= 80 ? 'positive' : actuallyCollectedPct >= 50 ? 'neutral' : 'negative'} href="/dashboard/commercial?tab=collections" />
        <FlowraKpiCard label="Dağıtılabilir" value={cashDistributable} rawValue={cashDistributable > 0 ? fmt(cashDistributable) : '—'} sub={cashDistributable > 0 ? 'Nakit bazlı' : 'Yok'} tone={cashDistributable > 0 ? 'positive' : 'neutral'} href="/dashboard/partners" />
        <FlowraKpiCard label="Bekleyen" value={uncollectedSalesTotal} rawValue={uncollectedSalesTotal > 0 ? fmt(uncollectedSalesTotal) : '—'} sub={uncollectedSalesTotal > 0 ? `${uncollectedSalesCount} satış` : 'Tümü tahsil ✓'} tone={uncollectedSalesTotal > 0 ? 'negative' : 'neutral'} href="/dashboard/commercial?tab=collections" />
        <FlowraKpiCard label="Giderler" value={fs.expenses_total_try} rawValue={fmt(fs.expenses_total_try)} sub={`~${fmt(monthlyExpenses)}/ay`} href="/dashboard/operations?tab=expenses" />
        <FlowraKpiCard label="Stok" value={stockValue} rawValue={fmt(stockValue)} sub="FIFO maliyet" href="/dashboard/stocks" />
      </div>

      {/* ── Main Grid: Waterfall 7/12 | Tax/Net 5/12 ─────────────────────── */}
      <div className="grid grid-cols-12 gap-1.5">

        {/* Cash Waterfall */}
        <div className="col-span-7 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Nakit Köprüsü</span>
            <Link href="/dashboard/analytics" className="text-[10px] text-primary-600 font-semibold hover:text-primary-700">Analiz →</Link>
          </div>
          <div className="space-y-1">
            <WRow label="+ Tahsil Edilen" value={actuallyCollected} sub={`${fmt(fs.revenue_try)} fatura · %${actuallyCollectedPct}`} />
            <WRow label="− Ödenmiş Giderler" value={-paidExpenses} sub="ödenen" />
            <WRow label="− Açık Yükümlülükler" value={-outstandingObligations} sub={`${fmt(unpaidExpenses)} ödenmemiş`} />
            <div className="border-t border-dashed border-gray-200 pt-1.5">
              <WRow label="= Dağıtılabilir" value={cashDistributable} sub={`Nakit bakiye ${fmt(cashBalance)}`} isTotal />
            </div>
          </div>

          {cashDistributable === 0 ? (
            <div className="mt-2 text-[10px] text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              ⚠ Dağıtılacak nakit yok{uncollectedSalesTotal > 0 ? ` — ${fmt(uncollectedSalesTotal)} tahsilat bekliyor` : ''}
            </div>
          ) : equalization.entries.length > 0 ? (
            <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2 overflow-hidden">
              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-300 flex-shrink-0">Ortak</span>
              {equalization.entries.slice(0, 4).map(e => (
                <div key={e.partner_id} className="flex items-center gap-1.5 bg-emerald-50 rounded-lg px-2 py-1 min-w-0">
                  <span className="text-[10px] text-gray-500 font-semibold truncate max-w-[60px]">{e.partner_name}</span>
                  <span className="text-[11px] font-black tabular-nums text-emerald-700 flex-shrink-0">{fmt(e.total_payout)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Tax + Net — 3 rows */}
        <div className="col-span-5 grid grid-rows-3 gap-1.5">
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">KDV (Net)</div>
              <div className={`text-base font-black tabular-nums leading-tight mt-0.5 ${fs.net_vat_try > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
                {fmtFull(Math.abs(fs.net_vat_try))}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">Sat: {fmt(fs.sales_vat_try)} · Alış: {fmt(fs.purchase_vat_try + fs.expense_vat_try)}</div>
            </div>
            <div className={`text-[10px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 ${vatStatus === 'payable' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {vatStatus === 'payable' ? '⬆ Ödenecek' : '⬇ Devir'}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 flex items-center justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Kurumlar Vergisi</div>
              <div className={`text-base font-black tabular-nums leading-tight mt-0.5 ${fs.corporate_tax_try > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                {fmtFull(fs.corporate_tax_try)}
              </div>
              <div className="text-[9px] text-gray-400 mt-0.5">Matrah: {fmt(fs.matrah_try)}</div>
            </div>
            <div className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg flex-shrink-0">
              %{fs.corporate_tax_rate}
            </div>
          </div>

          <div className={`rounded-xl px-3 py-2 border flex items-center justify-between ${monthlyNet >= 0 ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'}`}>
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Aylık Net</div>
              <div className={`text-base font-black tabular-nums leading-tight mt-0.5 ${monthlyNet >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(monthlyNet)}
              </div>
              {breakEvenRevenue !== null && (
                <div className="text-[9px] text-gray-400 mt-0.5">Başabaş: {fmt(breakEvenRevenue)}/ay</div>
              )}
            </div>
            {monthlyNet < 0 && (
              <div className="text-[10px] text-white font-bold px-2 py-0.5 bg-red-600 rounded-lg flex-shrink-0">Zarar</div>
            )}
          </div>
        </div>
      </div>

      {/* ── 12-Month Forecast Strip ───────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">12 Aylık Tahmin</span>
          <Link href="/dashboard/simulation" className="text-[10px] text-primary-600 font-semibold hover:text-primary-700">Simülasyon →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([
            { label: 'Kötümser', data: forecast.pessimistic, summary: forecast.summary.pessimistic, color: 'text-red-600', dotColor: 'bg-red-400' },
            { label: 'Baz',      data: forecast.base,        summary: forecast.summary.base,        color: 'text-gray-700', dotColor: 'bg-gray-400' },
            { label: 'İyimser',  data: forecast.optimistic,  summary: forecast.summary.optimistic,  color: 'text-emerald-700', dotColor: 'bg-emerald-400' },
          ] as const).map(({ label, data, summary, color, dotColor }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
              </div>
              {/* Mini sparkline — cash positions as horizontal bar chart */}
              <div className="flex items-end gap-0.5 h-6">
                {data.slice(0, 12).map((m, i) => {
                  const maxCash = Math.max(...data.map(x => Math.abs(x.cash)), 1)
                  const height  = Math.max(2, Math.round((Math.abs(m.cash) / maxCash) * 24))
                  return (
                    <div key={i} title={`${m.label}: ${fmt(m.cash)}`}
                      className={`flex-1 rounded-sm ${m.cash >= 0 ? 'bg-emerald-200' : 'bg-red-200'}`}
                      style={{ height: `${height}px` }}
                    />
                  )
                })}
              </div>
              <div className={`text-xs font-black tabular-nums ${color}`}>{fmt(summary.endCash)}</div>
              <div className="text-[10px] text-gray-400 leading-tight">
                {summary.runwayEndMonth
                  ? <span className="text-red-500 font-semibold">{summary.runwayEndMonth}&apos;da nakit biter</span>
                  : <span>{summary.totalNet >= 0 ? `+${fmt(summary.totalNet)} net` : `${fmt(summary.totalNet)} zarar`}</span>
                }
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom Row: Chart + FX + Proforma ────────────────────────────── */}
      <div className="grid grid-cols-12 gap-1.5">
        <div className="col-span-8">
          <CashflowChart className="w-full" />
        </div>
        <div className="col-span-4 flex flex-col gap-1.5">
          <FxWidget initialFx={{ USD: fxData.USD, EUR: fxData.EUR, source: fxData.source, rate_date: fxData.rate_date, fetched_at: fxData.fetched_at }} />
          {outstanding > 0 && (
            <Link href="/dashboard/proformas" className="bg-white border border-gray-200 rounded-xl px-3 py-2 hover:border-gray-300 transition-colors">
              <div className="text-[9px] font-black uppercase tracking-widest text-gray-400">Açık Proformalar</div>
              <div className="text-sm font-black tabular-nums text-primary-700 mt-0.5">{fmt(outstanding)}</div>
              <div className="text-[9px] text-gray-400">{openProfs.length} adet bekliyor</div>
            </Link>
          )}
          {/* CFO shortcut if period overdue */}
          {openPeriodDaysOverdue > 10 && (
            <Link href="/dashboard/cfo/period-close" className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hover:border-amber-300 transition-colors">
              <div className="text-[9px] font-black uppercase tracking-widest text-amber-600">Dönem Kapanışı</div>
              <div className="text-xs font-bold text-amber-700 mt-0.5">{openPeriodDaysOverdue} gün bekliyor</div>
              <div className="text-[9px] text-amber-500">CFO Cockpit →</div>
            </Link>
          )}
        </div>
      </div>

    </div>
  )
}

// ── Inline waterfall row ───────────────────────────────────────────────────────

function WRow({ label, value, sub, isTotal = false }: { label: string; value: number; sub?: string; isTotal?: boolean }) {
  const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtV = (n: number) => (n < 0 ? '−' : '') + TRY_FMT.format(Math.abs(n)) + ' TL'
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className={`text-xs ${isTotal ? 'font-bold text-gray-900' : 'font-semibold text-gray-500'}`}>{label}</span>
        {sub && <span className="text-[10px] text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span className={`tabular-nums shrink-0 font-black ${isTotal ? `text-base ${value >= 0 ? 'text-emerald-700' : 'text-red-600'}` : `text-sm ${value >= 0 ? 'text-gray-700' : 'text-red-600'}`}`}>
        {fmtV(value)}
      </span>
    </div>
  )
}
