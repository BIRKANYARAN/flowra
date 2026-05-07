export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard — single-screen command centre
//
// Zones (top → bottom, no scroll):
//   1  Page header     — period label, alert badge, task reminder pill
//   1b Task reminders  — open tasks due ≤7 days (Phase 7)
//   1c Critical alerts — max 2 financial/operational alerts
//   2  KPI strip       — Revenue, Collected, Outstanding, Expenses, Stock Value
//   3  Net status      — Gross profit / Tax / Net after tax (hero panel) + tax cards
//   4  Cashflow chart
//   5  FX strip        — USD/TRY, EUR/TRY with live refresh (inline Yenile button)
//
// Data sources:
//   • FinanceService.getFinancialSummary → /api/financial-summary + /api/tax-summary
//       returns: revenue, cost, gross_profit, expenses, matrah, tax, net_after_tax,
//                sales_vat, purchase_vat, expense_vat, net_vat  (VAT included)
//   • Supabase direct                    → open proformas, stock value, alert count
//   • loadFxDirect()                     → TCMB rates (no HTTP self-call)
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient }              from '@/lib/supabase-server'
import { redirect }                  from 'next/navigation'
import Link                          from 'next/link'
import { cookies, headers }          from 'next/headers'
import { FxWidget }                  from '@/components/layout/FxWidget'
import { CORPORATE_TAX_RATE_TR }     from '@/lib/services/finance-rules'
import { fetchTcmbWithFallback }     from '@/lib/fx'
import { computeCashPosition }       from '@/lib/finance/cash'
import { FlowraKpiCard }             from '@/components/ui-kit/FlowraKpiCard'
import { FlowraAlert }               from '@/components/ui-kit/FlowraAlert'
import { Label }                     from '@/components/ui'
import { CashflowChart }             from '@/components/dashboard/CashflowChart'
import { resolveCompanyId }          from '@/lib/resolve-company'
import { safeSystemQuery }           from '@/lib/admin-db'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FxData {
  USD:        number
  EUR:        number
  source:     'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  rate_date:  string | null
  fetched_at: string | null
}

const EMPTY_FX: FxData = {
  USD: 0, EUR: 0, source: 'fallback', rate_date: null, fetched_at: null,
}

// ── Equalization types (mirrors /api/partners/equalization response) ──────────

interface EqEntry {
  partner_id:            string
  partner_name:          string
  share_ratio:           number
  equalization_amount:   number
  pro_rata_share:        number
  total_payout:          number
}
interface EqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            EqEntry[]
}
const ZERO_EQ: EqResult = {
  baseline_per_unit: 0, total_equalization: 0, distributable: 0,
  remaining_after_eq: 0, entries: [],
}

const CASH_EXCLUDED_EXPENSE_TYPES = new Set([
  'loan_repayment',
  'partner_financing',
  'dividend',
  'internal_transfer',
])

// ── API response shapes ────────────────────────────────────────────────────────
// /api/financial-summary flat response (field names differ from FinancialSummary)
interface FinApiRes {
  revenue:                 number
  cost:                    number
  gross_profit:            number
  expenses_total:          number
  deductible_expenses:     number
  non_deductible_expenses: number
  matrah:                  number
  tax_rate:                number
  tax:                     number
  net_after_tax:           number
}
// /api/tax-summary nested response
interface TaxApiRes {
  vat: {
    sales_vat:    number
    purchase_vat: number
    expense_vat:  number
    net_vat:      number
  }
}

// ── Safe wrapper ───────────────────────────────────────────────────────────────

async function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() }
  catch (e) {
    console.error('[dashboard]', e instanceof Error ? e.message : String(e))
    return fallback
  }
}

// ── FX loader (no HTTP self-call — direct DB + TCMB) ──────────────────────────

async function loadFxDirect(): Promise<FxData> {
  try {
    const supabase = createClient()
    const today    = new Date().toISOString().slice(0, 10)
    const now      = new Date().toISOString()

    const { data: cached } = await supabase
      .from('fx_rates')
      .select('currency, buying, fetched_at')
      .in('currency', ['USD', 'EUR'])
      .eq('rate_date', today)

    const cu = (cached ?? []).find(r => r.currency === 'USD')
    const ce = (cached ?? []).find(r => r.currency === 'EUR')
    if (cu?.buying && ce?.buying) {
      return {
        USD: Number(cu.buying), EUR: Number(ce.buying), source: 'db',
        rate_date: today, fetched_at: (cu.fetched_at as string | null) ?? today,
      }
    }

    const tcmb = await fetchTcmbWithFallback()
    if (tcmb) {
      try {
        safeSystemQuery('fx_rates').upsert([
          { rate_date: tcmb.date, currency: 'USD', buying: tcmb.usd, selling: Number((tcmb.usd * 1.005).toFixed(6)), source: tcmb.source, fetched_at: now },
          { rate_date: tcmb.date, currency: 'EUR', buying: tcmb.eur, selling: Number((tcmb.eur * 1.005).toFixed(6)), source: tcmb.source, fetched_at: now },
        ], { onConflict: 'rate_date,currency' }).then(({ error }) => {
          if (error) console.error('[dashboard/fx] upsert:', error.message)
        })
      } catch (e) {
        console.error('[dashboard/fx] service-role upsert unavailable:', e instanceof Error ? e.message : String(e))
      }
      return { USD: tcmb.usd, EUR: tcmb.eur, source: tcmb.source, rate_date: tcmb.date, fetched_at: now }
    }

    const { data: latest } = await supabase
      .from('fx_rates').select('currency, buying, fetched_at, rate_date')
      .in('currency', ['USD', 'EUR']).order('rate_date', { ascending: false }).limit(4)

    const lu = (latest ?? []).find(r => r.currency === 'USD')
    const le = (latest ?? []).find(r => r.currency === 'EUR')
    if (lu?.buying && le?.buying) {
      return {
        USD: Number(lu.buying), EUR: Number(le.buying), source: 'db',
        rate_date: (lu.rate_date as string) ?? null,
        fetched_at: (lu.fetched_at as string | null) ?? (lu.rate_date as string),
      }
    }

    return EMPTY_FX
  } catch (e) {
    console.error('[dashboard/fx]', e instanceof Error ? e.message : e)
    return EMPTY_FX
  }
}

// ── Period helpers ────────────────────────────────────────────────────────────

function currentMonthPeriod() {
  const now  = new Date()
  const year = now.getFullYear()
  const mon  = String(now.getMonth() + 1).padStart(2, '0')
  const from = `${year}-${mon}-01`
  const to   = now.toISOString().slice(0, 10)
  const label = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

// ── Number formatting ─────────────────────────────────────────────────────────

/** Abbreviated: ₺1.2M, ₺123.4K, ₺890 */
function fmt(n: number): string {
  const raw = Number(n || 0)
  const abs  = Math.abs(raw)
  const sign = raw < 0 ? '−' : ''
  if (abs >= 1_000_000)
    return `${sign}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)
    return `${sign}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${sign}₺${abs.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const TRY_FULL_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Full precision for panel values: 12345.67 → "12.345,67 TL" */
function fmtFull(n: number): string {
  const raw = Number(n || 0)
  return (raw < 0 ? '−' : '') + TRY_FULL_FMT.format(Math.abs(raw)) + ' TL'
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1).replace('.', ',')}%`
}

// ── Inline UI components ──────────────────────────────────────────────────────
// KpiCard replaced by FlowraKpiCard (imported above).
// rawValue prop preserves the abbreviated fmt() strings computed in data section.

// ── WaterfallRow — used in cash breakdown panel ────────────────────────────────

function WaterfallRow({
  label, value, sub, isTotal = false,
}: {
  label: string; value: number; sub?: string; isTotal?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span className={`text-xs ${isTotal ? 'font-bold text-gray-900' : 'font-semibold text-gray-500'}`}>
          {label}
        </span>
        {sub && <span className="text-[10px] text-gray-400 ml-1.5">{sub}</span>}
      </div>
      <span className={`tabular-nums shrink-0 font-black ${
        isTotal
          ? `text-base ${value >= 0 ? 'text-emerald-700' : 'text-red-600'}`
          : `text-sm ${value >= 0 ? 'text-gray-700' : 'text-red-600'}`
      }`}>
        {fmtFull(value)}
      </span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) redirect('/auth')
    userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
    redirect('/auth')
  }
  if (!userId) redirect('/auth')

  const uid                 = userId
  const { from, to, label } = currentMonthPeriod()
  let companyId: string
  try { companyId = await resolveCompanyId(uid, supabase) }
  catch {
    redirect('/auth')
  }

  // ── Internal API helper — forwards session cookies so Supabase auth works ────
  const cookieHeader = cookies().getAll().map(c => `${c.name}=${c.value}`).join('; ')
  const reqHeaders   = headers()
  const host         = reqHeaders.get('x-forwarded-host') ?? reqHeaders.get('host') ?? 'localhost:3000'
  const proto        = reqHeaders.get('x-forwarded-proto') ?? 'http'
  const base         = `${proto}://${host}`
  const apiFetch     = (path: string) =>
    fetch(`${base}${path}`, { headers: { Cookie: cookieHeader }, cache: 'no-store' })

  // ── Parallel data fetching ────────────────────────────────────────────────────
  const [
    finRes,              // /api/financial-summary — P&L
    taxRes,              // /api/tax-summary       — VAT + corporate tax
    openProfs,           // outstanding proformas (sent/accepted, not yet converted)
    stockValue,          // stock inventory value at FIFO cost
    alertCount,          // unread system alerts count
    fxData,              // exchange rates (USD/EUR)
    uncollectedSalesData,// sales with payment_status != paid (for display / alerts)
    taskReminders,       // Phase 7 — open tasks due soon (≤7 days) for top-of-page reminders
    collectedSalesData,  // PART 1 — paid sales where paid_at in current period (CASH BASIS)
    paidExpensesData,    // paid expenses in current period, excluding financing flows in reducer
    unpaidExpensesData,  // all unpaid expenses for outstanding obligations
  ] = await Promise.all([

    sq(async (): Promise<FinApiRes | null> => {
      const r = await apiFetch(`/api/financial-summary?from=${from}&to=${to}`)
      if (!r.ok) throw new Error(`financial-summary ${r.status}`)
      const d: unknown = await r.json()
      if (!d || typeof d !== 'object') throw new Error('Invalid financial-summary response')
      return d as FinApiRes
    }, null),

    sq(async (): Promise<TaxApiRes | null> => {
      const r = await apiFetch(`/api/tax-summary?from=${from}&to=${to}`)
      if (!r.ok) throw new Error(`tax-summary ${r.status}`)
      const d: unknown = await r.json()
      if (!d || typeof d !== 'object' || !('vat' in (d as object))) throw new Error('Invalid tax-summary response')
      return d as TaxApiRes
    }, null),

    sq(async () => {
      const { data } = await supabase
        .from('proformas')
        .select('id, total_try')
        .eq('company_id', companyId)
        .in('status', ['sent', 'accepted'])
        .is('deleted_at', null)
      return (data ?? []) as Array<{ id: string; total_try: number | null }>
    }, [] as Array<{ id: string; total_try: number | null }>),

    sq(async () => {
      const { data } = await supabase
        .from('stock_lots')
        .select('qty_remaining, entry_cost_try')
        .eq('company_id', companyId)
        .gt('qty_remaining', 0)
      return (data ?? []).reduce(
        (sum, l) => sum + Number(l.qty_remaining) * Number(l.entry_cost_try),
        0,
      )
    }, 0),

    sq(async () => {
      const { count } = await supabase
        .from('alerts')
        .select('id', { count: 'exact', head: true })
        .eq('actor_user_id', uid)
        .eq('is_read', false)
      return count ?? 0
    }, 0),

    sq(() => loadFxDirect(), EMPTY_FX),

    sq(async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, total_try, payment_status, customer_name, created_at')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
      return (data ?? []) as Array<{ id: string; total_try: number; payment_status: string; customer_name: string; created_at: string }>
    }, [] as Array<{ id: string; total_try: number; payment_status: string; customer_name: string; created_at: string }>),

    // Phase 7 — task reminders: open tasks due within 7 days (including overdue).
    // RLS scopes results to the user's company automatically.
    sq(async () => {
      const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_date, status')
        .eq('status', 'open')
        .is('deleted_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', in7days)
        .order('due_date', { ascending: true })
        .limit(5)
      return (data ?? []) as Array<{ id: string; title: string; due_date: string; status: string }>
    }, [] as Array<{ id: string; title: string; due_date: string; status: string }>),

    // PART 1 — collected cash: paid sales where paid_at falls in the current period.
    // CASH BASIS: uses paid_at, not created_at. Replaces the incorrect
    // "invoiced − all-time-uncollected" approximation.
    sq(async () => {
      const { data } = await supabase
        .from('sales')
        .select('total_try')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .not('paid_at', 'is', null)
        .gte('paid_at', from + 'T00:00:00Z')
        .lte('paid_at', to + 'T23:59:59Z')
      return (data ?? []) as Array<{ total_try: number }>
    }, [] as Array<{ total_try: number }>),

    sq(async () => {
      const { data } = await supabase
        .from('expenses')
        .select('amount_try, expense_type')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .is('deleted_at', null)
        .gte('expense_date', from)
        .lte('expense_date', to)
      return (data ?? []) as Array<{ amount_try: number; expense_type: string | null }>
    }, [] as Array<{ amount_try: number; expense_type: string | null }>),

    sq(async () => {
      const { data } = await supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .neq('payment_status', 'paid')
        .is('deleted_at', null)
      return (data ?? []) as Array<{ amount_try: number }>
    }, [] as Array<{ amount_try: number }>),
  ])

  // ── Map API responses → local fs shape (keeps all JSX references unchanged) ──
  const fs = {
    revenue_try:                 Number(finRes?.revenue                 ?? 0),
    cost_try:                    Number(finRes?.cost                    ?? 0),
    gross_profit_try:            Number(finRes?.gross_profit            ?? 0),
    expenses_total_try:          Number(finRes?.expenses_total          ?? 0),
    deductible_expenses_try:     Number(finRes?.deductible_expenses     ?? 0),
    non_deductible_expenses_try: Number(finRes?.non_deductible_expenses ?? 0),
    matrah_try:                  Number(finRes?.matrah                  ?? 0),
    corporate_tax_rate:          Number(finRes?.tax_rate                ?? CORPORATE_TAX_RATE_TR),
    corporate_tax_try:           Number(finRes?.tax                     ?? 0),
    net_after_tax_try:           Number(finRes?.net_after_tax           ?? 0),
    sales_vat_try:               Number(taxRes?.vat?.sales_vat          ?? 0),
    purchase_vat_try:            Number(taxRes?.vat?.purchase_vat       ?? 0),
    expense_vat_try:             Number(taxRes?.vat?.expense_vat        ?? 0),
    net_vat_try:                 Number(taxRes?.vat?.net_vat            ?? 0),
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const outstanding = openProfs.reduce((s, p) => s + Number(p.total_try ?? 0), 0)
  const vatStatus   = fs.net_vat_try > 0 ? 'payable' : 'carry_forward'

  const uncollectedSalesTotal = uncollectedSalesData.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const uncollectedSalesCount = uncollectedSalesData.length
  const invoicedTotal         = fs.revenue_try
  const actuallyCollected     = (collectedSalesData ?? []).reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const actuallyCollectedPct  = invoicedTotal > 0
    ? Math.min(100, Math.round((actuallyCollected / invoicedTotal) * 100))
    : 100
  const paidExpenses = (paidExpensesData ?? []).reduce((sum, row) => {
    if (row.expense_type && CASH_EXCLUDED_EXPENSE_TYPES.has(row.expense_type)) return sum
    return sum + Number(row.amount_try ?? 0)
  }, 0)
  const unpaidExpenses = (unpaidExpensesData ?? []).reduce((sum, row) => sum + Number(row.amount_try ?? 0), 0)
  const {
    cashBalance,
    outstandingObligations,
    cashDistributable,
  } = computeCashPosition({
    paymentsReceived: actuallyCollected,
    paidExpenses,
    unpaidExpenses,
  })

  // ── Partner equalization (uses cash-based distributable, not accounting profit) ──
  const distributableAmount = cashDistributable
  let equalization: EqResult = ZERO_EQ
  try {
    const eqRes = await apiFetch(`/api/partners/equalization?distributable=${distributableAmount}`)
    if (eqRes.ok) {
      const eqData: unknown = await eqRes.json()
      if (eqData && typeof eqData === 'object' && Array.isArray((eqData as Record<string, unknown>).entries)) {
        equalization = eqData as EqResult
      }
    }
  } catch {
    // non-fatal — equalization defaults to ZERO_EQ
  }

  const daysInPeriod   = Math.max(
    (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1,
    1,
  )
  const monthsInPeriod = daysInPeriod / 30.44

  const grossMarginPct  = fs.revenue_try > 0 ? fs.gross_profit_try / fs.revenue_try : 0
  const monthlyExpenses = fs.expenses_total_try / monthsInPeriod
  const breakEvenRevenue = grossMarginPct > 0.001
    ? monthlyExpenses / grossMarginPct
    : null
  const monthlyNet = fs.net_after_tax_try / monthsInPeriod

  // ── Actionable alerts ─────────────────────────────────────────────────────────
  // Runway proxy: liquid assets (outstanding receivables + stock) / daily burn
  const dailyBurn   = monthlyNet < 0 ? Math.abs(monthlyNet) / 30 : 0
  const liquidProxy = outstanding + stockValue
  const runwayDays  = dailyBurn > 0 ? Math.round(liquidProxy / dailyBurn) : null

  // Overdue receivables: uncollected sales older than 30 days
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const overdueSales     = uncollectedSalesData.filter(s => s.created_at < thirtyDaysAgoISO)
  const overdueTotal     = overdueSales.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
  const overdueCount     = overdueSales.length

  const alerts: Array<{
    icon: string; text: string; sub: string
    colorBg: string; colorText: string; href: string
  }> = []

  // 1. Overdue receivables warning (highest priority — cash risk)
  if (overdueCount > 0 && overdueTotal > 500) {
    alerts.push({
      icon: '⚠',
      text: `${overdueCount} satış 30+ gün vadesi geçmiş: ${fmt(overdueTotal)}`,
      sub: 'Kritik tahsilat riski — müşterilerle iletişime geçin',
      colorBg:   'bg-red-50 border-red-200',
      colorText: 'text-red-700',
      href: '/dashboard/collections',
    })
  }

  if (vatStatus === 'payable' && fs.net_vat_try > 50) {
    alerts.push({
      icon: '⬆',
      text: `KDV ödemesi: ${fmtFull(fs.net_vat_try)}`,
      sub: 'Beyan döneminde ödenecek',
      colorBg:   'bg-orange-50 border-orange-200',
      colorText: 'text-orange-700',
      href: '/dashboard/analytics',
    })
  }
  if (runwayDays !== null && runwayDays <= 45) {
    alerts.push({
      icon: '🔥',
      text: `Nakit ~${runwayDays} günde tükenebilir`,
      sub: `Aylık ${fmt(Math.abs(monthlyNet))} zarar, likit varlık ${fmt(liquidProxy)}`,
      colorBg:   'bg-red-50 border-red-200',
      colorText: 'text-red-700',
      href: '/dashboard/expenses',
    })
  } else if (monthlyNet < 0) {
    alerts.push({
      icon: '📉',
      text: `Zarar döngüsü: aylık ${fmt(Math.abs(monthlyNet))} eksi`,
      sub: 'Gider veya fiyatlandırmayı gözden geçirin',
      colorBg:   'bg-red-50 border-red-200',
      colorText: 'text-red-700',
      href: '/dashboard/simulation',
    })
  }
  if (equalization.total_equalization > 100) {
    alerts.push({
      icon: '⚖',
      text: 'Ortak dengesi bozuk',
      sub: `${fmt(equalization.total_equalization)} eşitleme açığı var`,
      colorBg:   'bg-amber-50 border-amber-200',
      colorText: 'text-amber-700',
      href: '/dashboard/partners',
    })
  }
  if (uncollectedSalesTotal > 500) {
    alerts.push({
      icon: '💰',
      text: `${uncollectedSalesCount} satış tahsilat bekliyor: ${fmt(uncollectedSalesTotal)}`,
      sub: 'Tahsilat sayfasından ödeme durumunu güncelleyin',
      colorBg:   'bg-blue-50 border-blue-200',
      colorText: 'text-blue-700',
      href: '/dashboard/collections',
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-2 max-w-5xl">

      {/* Row 1 — Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-lg font-black text-gray-900 tracking-tight">Genel Bakış</h1>

        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-semibold capitalize">
          {label}
        </span>

        {alertCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block" />
            {alertCount} uyarı
          </span>
        )}
        {vatStatus === 'payable' && fs.net_vat_try > 0 && (
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">
            ⬆ KDV {fmtFull(fs.net_vat_try)}
          </span>
        )}
        {taskReminders.length > 0 && (
          <Link
            href="/dashboard/tasks"
            className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold hover:bg-violet-200 transition-colors"
          >
            🗓 {taskReminders.length} görev yaklaşıyor
          </Link>
        )}
      </div>

      {/* Row 1b — Task reminders (Phase 7) — open tasks due within 7 days */}
      {taskReminders.length > 0 && (
        <div className="flex flex-col gap-1">
          {taskReminders.slice(0, 3).map(t => {
            const today   = new Date().toISOString().slice(0, 10)
            const overdue = t.due_date < today
            const dueLabel = (() => {
              try {
                const d = new Date(t.due_date + 'T00:00:00Z')
                return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
              } catch { return t.due_date }
            })()
            return (
              <Link
                key={t.id}
                href="/dashboard/tasks"
                className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-xs font-medium transition-colors hover:opacity-80 ${
                  overdue
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-violet-50 border-violet-200 text-violet-800'
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span>{overdue ? '🔴' : '🟣'}</span>
                  <span className="truncate">{t.title}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {overdue ? `⚠ Gecikmiş` : `Son: ${dueLabel}`}
                </span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Row 1c — Critical alerts (max 2) using FlowraAlert */}
      {alerts.slice(0, 2).length > 0 && (
        <div className="flex flex-col gap-1">
          {alerts.slice(0, 2).map((a, i) => {
            const tone = a.colorBg.includes('orange') ? 'orange'
              : a.colorBg.includes('red')    ? 'danger'
              : a.colorBg.includes('amber')  ? 'warning'
              : 'info'
            return (
              <FlowraAlert
                key={i}
                tone={tone as 'orange' | 'danger' | 'warning' | 'info'}
                icon={a.icon}
                text={a.text}
                sub={a.sub}
                href={a.href}
              />
            )
          })}
        </div>
      )}

      {/* Row 2 — KPI strip (5 cards) using FlowraKpiCard */}
      <div className="grid grid-cols-5 gap-2">
        <FlowraKpiCard
          label="Ciro"
          value={fs.revenue_try}
          rawValue={fmt(fs.revenue_try)}
          sub={fs.revenue_try > 0 ? `Brüt marj ${pct(grossMarginPct)}` : 'Satış yok'}
          href="/dashboard/sales"
        />
        <FlowraKpiCard
          label="Dağıtılabilir"
          value={cashDistributable}
          rawValue={cashDistributable > 0 ? fmt(cashDistributable) : '—'}
          sub={cashDistributable > 0 ? 'Nakit bazlı' : 'Dağıtılacak yok'}
          tone={cashDistributable > 0 ? 'positive' : 'neutral'}
          href="/dashboard/partners"
        />
        <FlowraKpiCard
          label="Bekleyen Tahsilat"
          value={uncollectedSalesTotal}
          rawValue={uncollectedSalesTotal > 0 ? fmt(uncollectedSalesTotal) : '—'}
          sub={uncollectedSalesTotal > 0 ? `${uncollectedSalesCount} satış bekliyor` : 'Tümü tahsil ✓'}
          tone={uncollectedSalesTotal > 0 ? 'negative' : 'neutral'}
          href="/dashboard/collections"
        />
        <FlowraKpiCard
          label="Giderler"
          value={fs.expenses_total_try}
          rawValue={fmt(fs.expenses_total_try)}
          sub={`~${fmt(monthlyExpenses)}/ay`}
          href="/dashboard/expenses"
        />
        <FlowraKpiCard
          label="Stok Değeri"
          value={stockValue}
          rawValue={fmt(stockValue)}
          sub="FIFO maliyet"
          href="/dashboard/stocks"
        />
      </div>

      {/* Row 3 — Main panel: waterfall (left 3/5) + tax/metrics (right 2/5) */}
      <div className="grid grid-cols-5 gap-2">

        {/* Waterfall panel */}
        <div className="col-span-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <Label>Nakit Akışı — Tahsil Edilenden Dağıtılabilire</Label>
            <Link href="/dashboard/analytics" className="text-xs text-primary-600 font-semibold hover:text-primary-700">
              Detaylı analiz →
            </Link>
          </div>

          <div className="space-y-1.5">
            <WaterfallRow
              label="+ Tahsil Edilen"
              value={actuallyCollected}
              sub={`${fmt(fs.revenue_try)} fatura · %${actuallyCollectedPct} tahsil edildi`}
            />
            <WaterfallRow
              label="− Ödenmiş Giderler"
              value={-paidExpenses}
              sub="gerçek ödeme durumu"
            />
            <WaterfallRow
              label="− Açık Yükümlülükler"
              value={-outstandingObligations}
              sub={`${fmt(unpaidExpenses)} ödenmemiş gider`}
            />
            <div className="border-t-2 border-gray-200 pt-2">
              <WaterfallRow label="= Dağıtılabilir Nakit" value={cashDistributable} sub={`${fmt(cashBalance)} nakit bakiyesi`} isTotal />
            </div>
          </div>

          {/* Per-partner distribution */}
          {equalization.entries.length > 0 && cashDistributable > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Label className="mb-2">Ortaklara Dağılım ({fmt(cashDistributable)} dağıtılıyor)</Label>
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${Math.min(equalization.entries.length, 4)}, 1fr)` }}
              >
                {equalization.entries.slice(0, 4).map(e => (
                  <div key={e.partner_id} className="bg-emerald-50 rounded-xl px-3 py-2 text-center">
                    <div className="text-[10px] text-gray-500 font-semibold truncate">{e.partner_name}</div>
                    <div className="text-sm font-black tabular-nums text-emerald-700 mt-0.5">
                      {fmt(e.total_payout)}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      %{(e.share_ratio * 100).toFixed(0)} pay
                      {e.equalization_amount > 0.01 && <span className="ml-1 text-amber-500">+eş.</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No distributable cash */}
          {cashDistributable === 0 && (
            <div className="mt-3 text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              ⚠ Dağıtılacak nakit yok
              {uncollectedSalesTotal > 0
                ? ` — ${fmt(uncollectedSalesTotal)} tahsilat bekliyor`
                : ` — aylık ${fmt(monthlyExpenses)} gider eşiğini geçemiyor`}
            </div>
          )}
        </div>

        {/* Right column — KDV + KV + Aylık Net */}
        <div className="col-span-2 space-y-2">

          {/* KDV card */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <Label>KDV (Net)</Label>
              <div className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                vatStatus === 'payable' ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {vatStatus === 'payable' ? '⬆ Ödenecek' : '⬇ Devredilecek'}
              </div>
            </div>
            <div className={`text-xl font-black tabular-nums leading-none ${
              fs.net_vat_try > 0 ? 'text-orange-600' : 'text-emerald-600'
            }`}>
              {fmtFull(Math.abs(fs.net_vat_try))}
            </div>
            <div className="text-[10px] text-gray-400 mt-1 space-x-1.5">
              <span>Satış: {fmtFull(fs.sales_vat_try)}</span>
              <span>·</span>
              <span>Alış: {fmtFull(fs.purchase_vat_try + fs.expense_vat_try)}</span>
            </div>
          </div>

          {/* Kurumlar Vergisi */}
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <Label>Kurumlar Vergisi Est.</Label>
              <div className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-lg">
                %{fs.corporate_tax_rate} KV
              </div>
            </div>
            <div className={`text-xl font-black tabular-nums leading-none ${
              fs.corporate_tax_try > 0 ? 'text-gray-900' : 'text-gray-400'
            }`}>
              {fmtFull(fs.corporate_tax_try)}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">
              Matrah: {fmtFull(fs.matrah_try)}
            </div>
          </div>

          {/* Aylık Net */}
          <div className={`rounded-xl px-4 py-3 border ${
            monthlyNet >= 0 ? 'bg-white border-gray-200' : 'bg-red-50 border-red-200'
          }`}>
            <Label className="mb-1">Aylık Net</Label>
            <div className={`text-xl font-black tabular-nums leading-none ${
              monthlyNet >= 0 ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {fmt(monthlyNet)}
            </div>
            {breakEvenRevenue !== null && (
              <div className="text-[10px] text-gray-400 mt-1">
                Başabaş: {fmt(breakEvenRevenue)}/ay
              </div>
            )}
            {monthlyNet < 0 && (
              <div className="text-[10px] text-red-600 font-semibold mt-0.5">
                🔥 {fmt(Math.abs(monthlyNet))}/ay yakılıyor
              </div>
            )}
          </div>

        </div>
      </div>{/* end grid grid-cols-5 */}

      {/* Row 4 — Cashflow chart */}
      <CashflowChart className="w-full" />

      {/* Row 5 — FX rates + quick actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <FxWidget
            initialFx={{
              USD:        fxData.USD,
              EUR:        fxData.EUR,
              source:     fxData.source,
              rate_date:  fxData.rate_date,
              fetched_at: fxData.fetched_at,
            }}
          />
        </div>
        <Link href="/dashboard/sales"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors">
          + Satış
        </Link>
        <Link href="/dashboard/collections"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-colors">
          + Tahsilat
        </Link>
        <Link href="/dashboard/expenses"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-xs font-semibold hover:bg-orange-600 transition-colors">
          + Gider
        </Link>
      </div>

    </div>
  )
}
