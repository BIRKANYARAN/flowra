export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// Situation Room — Flowra Executive Homescreen (Faz 5 Sprint 1)
//
// Layout:
//   SituationBrief     — single deterministic sentence + 3 pressure signals
//   TreasuryBlotter    — 5-row institutional ledger (dark)
//   DecisionQueue      — top 7 framed decisions from AlertEngine
//   TemporalPressureRail — 90-day timeline (client-side fetch)
//
// All data fetching is preserved from Faz 4 CEO Cockpit.
// Only the UI layer has been transformed.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient }              from '@/lib/supabase-server'
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
import { FinanceService }            from '@/lib/services/finance.service'
import { PartnerService }            from '@/lib/services/partner.service'
import type { FinancialSummary, EqualizationResult } from '@/types'
import { fmtTRY as fmt, fmtPct, fmtCompact }        from '@/lib/format'
import { generateSituationSummary } from '@/lib/services/ai-summary.service'

// Situation Room components
import { SituationBrief }        from './_shared/SituationBrief'
import { TreasuryBlotter }       from './_shared/TreasuryBlotter'
import { DecisionQueue }         from './_shared/DecisionQueue'
import { TemporalPressureRail }  from './_shared/TemporalPressureRail'
import { ObservationRail }       from './_shared/ObservationRail'
import { SituationLine }         from '@/components/dashboard/SituationLine'
import { SituationScoreCard }    from '@/components/dashboard/SituationScoreCard'
import { PeriodSummaryWidget }   from './_shared/PeriodSummaryWidget'
import { CeoIntelligencePanel }  from './_shared/CeoIntelligencePanel'
import { InsightPanel }          from '@/components/dashboard/InsightPanel'
import { KpiTargetPanel }        from './_shared/KpiTargetPanel'
import { AlertFeedPanel }        from './_shared/AlertFeedPanel'

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = createClient()
  let userId: string | null = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!error && data?.user) userId = data.user.id
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e) throw e
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
  const [
    finSummary, openProfs, stockValue, fxData,
    uncollectedSalesData, taskReminders, collectedSalesData,
    paidExpensesData, unpaidExpensesData,
    openPeriodData, nextTrancheData,
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

    sq(async () => {
      const { data } = await supabase.from('accounting_periods').select('id, period_end, status').eq('company_id', companyId).in('status', ['open','pre_close']).order('period_end', { ascending: false }).limit(1)
      return (data ?? []) as Array<{ id: string; period_end: string; status: string }>
    }, [] as Array<{ id: string; period_end: string; status: string }>),

    sq(async () => {
      const { data } = await supabase.from('partner_loan_tranches')
        .select('due_date, amount_try, outstanding_try, annual_interest_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('due_date', { ascending: true, nullsFirst: false })
      return (data ?? []) as Array<{ due_date: string | null; amount_try: number; outstanding_try: number; annual_interest_rate: number | null }>
    }, [] as Array<{ due_date: string | null; amount_try: number; outstanding_try: number; annual_interest_rate: number | null }>),

    sq(async () => {
      const { data } = await supabase
        .from('partner_capital_commitments')
        .select('committed_try, paid_try, due_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
      return (data ?? []) as Array<{ committed_try: number; paid_try: number; due_date: string | null }>
    }, [] as Array<{ committed_try: number; paid_try: number; due_date: string | null }>),

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

  const fs = finSummary

  // ── Derived values ─────────────────────────────────────────────────────────
  const uncollectedSalesTotal = uncollectedSalesData.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
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
  const monthlyNet      = fs.net_after_tax_try / monthsInPeriod

  const todayISO         = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const sixtyDaysAgoISO  = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
  const overdueSales30   = uncollectedSalesData.filter(s => s.sale_date < thirtyDaysAgoISO)
  const overdueSales60   = uncollectedSalesData.filter(s => s.sale_date < sixtyDaysAgoISO)
  const overdueTotal30   = overdueSales30.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)
  const overdueTotal60   = overdueSales60.reduce((s, r) => s + Math.max(0, Number(r.total_try ?? 0) - Number(r.amount_paid ?? 0)), 0)

  const monthlyBurn = monthlyNet < 0 ? Math.abs(monthlyNet) : 0
  const runwayDays  = (() => {
    if (cashDistributable <= 0) return -1
    if (monthlyBurn > 0)        return Math.round((cashDistributable / monthlyBurn) * 30)
    const mExp = monthlyExpenses > 0 ? monthlyExpenses : null
    return mExp ? Math.round((cashDistributable / mExp) * 30) : -1
  })()
  const runwayMonths = runwayDays >= 0 ? runwayDays / 30 : 999

  // ── Partner equalization ───────────────────────────────────────────────────
  const distributableAmount = cashDistributable
  let equalization: EqualizationResult = ZERO_EQ
  try {
    equalization = await PartnerService.calculateEqualization(uid, companyId, distributableAmount)
  } catch { /* non-fatal */ }

  // ── Period overdue check ───────────────────────────────────────────────────
  const openPeriod = openPeriodData[0] ?? null
  const openPeriodDaysOverdue = openPeriod
    ? Math.max(0, Math.round((Date.now() - new Date(openPeriod.period_end).getTime()) / 86_400_000))
    : -1

  // ── Next tranche due ───────────────────────────────────────────────────────
  const nextTranche = nextTrancheData.find(t => t.due_date != null && t.due_date >= todayISO) ?? null
  const nextTrancheDueDays = nextTranche?.due_date
    ? Math.max(0, Math.round((new Date(nextTranche.due_date).getTime() - Date.now()) / 86_400_000))
    : -1

  // ── Situation Engine ───────────────────────────────────────────────────────
  const overdueRatioPct = uncollectedSalesTotal > 0
    ? Math.round((overdueTotal30 / uncollectedSalesTotal) * 100)
    : 0

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
    taxDueDays: fs.net_vat_try > 0 ? (() => {
      const dueMonth = month === 12 ? 1 : month + 1
      const dueYear  = month === 12 ? year + 1 : year
      const dueDate  = new Date(`${dueYear}-${String(dueMonth).padStart(2, '0')}-24`)
      return Math.round((dueDate.getTime() - Date.now()) / 86_400_000)
    })() : -1,
    bsImbalanceTry:          0,
    legalReserveDeficit:     0,
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

  // ── Re-apply situation with alert penalty now that we have alert counts ───
  // First pass (situation above) was needed to feed partner score into alertInputs.
  // This second pass applies the alert penalty so the composite cannot contradict
  // visible critical alerts.
  const alertCounts = {
    critical: decisionAlerts.filter(a => a.severity === 'critical').length,
    warning:  decisionAlerts.filter(a => a.severity === 'warning').length,
    info:     decisionAlerts.filter(a => a.severity === 'info').length,
  }
  const situationFinal = computeSituation({
    cashRunwayMonths:  runwayMonths,
    isProfitable:      monthlyNet >= 0,
    netMarginPct:      fs.revenue_try > 0 ? fs.net_after_tax_try / fs.revenue_try : 0,
    debtServiceRatio,
    overdueRatioPct,
    maxBurdenScoreAbs: equalization.total_equalization > 0
      ? Math.min(1, equalization.total_equalization / Math.max(distributableAmount, 1))
      : 0,
    activeAlertCounts: alertCounts,
  })

  // ── AI Situation Summary ───────────────────────────────────────────────────
  const aiSummary = await generateSituationSummary({
    situation: situationFinal,
    topAlerts:  decisionAlerts.slice(0, 5),
    period:     label,
    revenue:    fs.revenue_try,
    netIncome:  fs.net_after_tax_try,
    cashBalance,
  })

  // ── Forecast Engine (for future use) ──────────────────────────────────────
  const trailingData = trailing5.length > 0 ? trailing5 : [{ revenue: fs.revenue_try, expenses: fs.expenses_total_try }]
  const n     = trailingData.length
  const avgRev = trailingData.reduce((s, m) => s + m.revenue, 0) / n
  const avgExp = trailingData.reduce((s, m) => s + m.expenses, 0) / n
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear  = month === 12 ? year + 1 : year
  const _forecast = computeForecast({
    avgMonthlyRevenue:       avgRev > 0 ? avgRev : fs.revenue_try,
    avgMonthlyExpenses:      avgExp > 0 ? avgExp : fs.expenses_total_try,
    currentCash:             cashBalance,
    monthlyDebtService,
    optimisticGrowthFactor:  0.15,
    pessimisticStressFactor: 0.20,
    startYear:               nextYear,
    startMonth:              nextMonth,
  })
  void _forecast // available for future panels

  // ── Treasury Blotter data derivations ────────────────────────────────────
  // Average aging days for receivables
  const avgAgingDays = (() => {
    if (uncollectedSalesData.length === 0) return 0
    const totalAgeDays = uncollectedSalesData.reduce((sum, s) => {
      const saleMs = new Date(s.sale_date).getTime()
      const ageDays = Math.max(0, (Date.now() - saleMs) / 86_400_000)
      return sum + ageDays
    }, 0)
    return Math.round(totalAgeDays / uncollectedSalesData.length)
  })()

  // Receivables delta: difference between what's outstanding vs what was 30d ago
  const receivablesDelta = overdueTotal30 > 0 ? overdueTotal30 : 0

  // Cash delta: we don't have prior-period cash balance — show 0 (blank)
  // rather than mislead with monthly P&L (which can exceed current cash balance)
  const cashDelta = 0

  // Payables due in 30 days: unpaid expenses (all due — approximated)
  const payablesDue30 = unpaidExpenses

  // Total active partner debt
  const partnerDebt = nextTrancheData.reduce((s, t) => s + Number(t.outstanding_try ?? t.amount_try ?? 0), 0)

  // ── Render ────────────────────────────────────────────────────────────────

  // ── Dönem Durumu ──────────────────────────────────────────────────────────
  const currentAccountingPeriod = openPeriodData[0] ?? null
  const periodStatusLabel: Record<string, string> = {
    open:       'Açık',
    pre_close:  'Ön Kapanış',
    closed:     'Kapalı',
    locked:     'Kilitli',
  }
  const periodStatusColor: Record<string, string> = {
    open:       'text-pos-text',
    pre_close:  'text-warn-text',
    closed:     'text-[#64748b]',
    locked:     'text-neg-text',
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── SITUATION SCORE CARD — CEO hero element (computed client-side) ── */}
      <SituationScoreCard />

      {/* ── DATE CONTEXT ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#94a3b8] tabular-nums">{label}</span>
        <Link href="/dashboard/reports"
          className="text-[10px] text-brand-light font-semibold hover:text-brand">
          Raporlar →
        </Link>
      </div>

      {/* ── SITUATION LINE — prominent full-width status banner ─────────── */}
      <SituationLine
        status={situationFinal.status}
        composite={situationFinal.composite}
        situationLine={aiSummary.summary_tr}
        criticalCount={alertCounts.critical}
        warningCount={alertCounts.warning}
      />

      {/* ── 4 STRATEGIC KPI CARDS ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Revenue */}
        <Link href="/dashboard/finance?tab=pnl"
          className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Ciro (Dönem)</div>
          <div className="text-xl font-black tabular-nums text-[#0f172a]">{fmt(fs.revenue_try)}</div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">{label}</div>
        </Link>
        {/* Net Income */}
        <Link href="/dashboard/finance?tab=pnl"
          className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Net Gelir</div>
          <div className={`text-xl font-black tabular-nums ${fs.net_after_tax_try >= 0 ? 'text-pos-text' : 'text-neg'}`}>
            {fmt(fs.net_after_tax_try)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {fs.revenue_try > 0 ? `Marj: %${((fs.net_after_tax_try / fs.revenue_try) * 100).toFixed(1)}` : 'Veri yok'}
          </div>
        </Link>
        {/* Cash Position */}
        <Link href="/dashboard/finance?tab=cashflow"
          className="bg-white border border-[#e2e8f0] rounded px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Nakit Pozisyonu</div>
          <div className={`text-xl font-black tabular-nums ${cashBalance >= 0 ? 'text-[#0f172a]' : 'text-neg'}`}>
            {fmt(cashBalance)}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-0.5">
            {runwayMonths < 999 ? `Runway: ${runwayMonths.toFixed(1)} ay` : 'Runway: ∞'}
          </div>
        </Link>
        {/* Dönem Durumu */}
        <Link href="/dashboard/cfo?tab=period"
          className={`rounded px-4 py-3 border shadow-sm hover:shadow-md transition-shadow ${
            currentAccountingPeriod?.status === 'locked'    ? 'bg-neg-light border-neg-light' :
            currentAccountingPeriod?.status === 'pre_close' ? 'bg-warn-light border-warn-light' :
            currentAccountingPeriod?.status === 'open'      ? 'bg-pos-light border-pos-light' :
            'bg-white border-[#e2e8f0]'
          }`}>
          <div className="text-[0.65rem] font-black uppercase tracking-widest text-[#94a3b8] mb-1">Dönem Durumu</div>
          <div className={`text-xl font-black leading-none ${
            currentAccountingPeriod ? (periodStatusColor[currentAccountingPeriod.status] ?? 'text-[#64748b]') : 'text-[#94a3b8]'
          }`}>
            {currentAccountingPeriod
              ? (periodStatusLabel[currentAccountingPeriod.status] ?? currentAccountingPeriod.status)
              : 'Dönem Yok'}
          </div>
          {currentAccountingPeriod && (
            <div className="text-[10px] text-[#94a3b8] mt-0.5">
              {new Date(currentAccountingPeriod.period_end + 'T00:00:00Z').toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}
            </div>
          )}
        </Link>
      </div>

      {/* ── SITUATION BRIEF ─────────────────────────────────────────────── */}
      <SituationBrief
        situationLine={aiSummary.summary_tr}
        situationStatus={situationFinal.status}
        compositeScore={situationFinal.composite}
        cashRunwayDays={runwayDays}
        receivablesTotal={uncollectedSalesTotal}
        overdueTotal60={overdueTotal60}
        debtServiceRatio={debtServiceRatio}
      />

      {/* ── PERIOD SUMMARY — CFO-to-CEO financial brief ─────────────────── */}
      <PeriodSummaryWidget from={from} to={to} />

      {/* ── CEO INTELLIGENCE PANEL — multi-signal health brief ───────────── */}
      <CeoIntelligencePanel />

      {/* ── İŞ ZEKÂSİ — rule-based deterministic BI insights ────────────── */}
      <InsightPanel />

      {/* ── KPI TARGET PANEL — Hedef Takibi ─────────────────────────────── */}
      <KpiTargetPanel />

      {/* ── ALERT FEED — Uyarı Akışı (persistent notification center) ──── */}
      <AlertFeedPanel />

      {/* ── INTELLIGENCE SIGNALS — cross-context pattern observations ───── */}
      <ObservationRail context="all" maxItems={4} />

      {/* ── TREASURY BLOTTER + DECISION QUEUE (side by side on lg+) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Treasury Blotter (dark ledger) */}
        <TreasuryBlotter
          cash={cashBalance}
          cashDelta={cashDelta}
          cashRunwayMonths={runwayMonths}

          receivables={uncollectedSalesTotal}
          receivablesDelta={receivablesDelta}
          avgAgingDays={avgAgingDays}

          payables={unpaidExpenses}
          payablesDue30={payablesDue30}

          partnerDebt={partnerDebt}
          nextTrancheDays={nextTrancheDueDays >= 0 ? nextTrancheDueDays : null}
          nextTrancheAmt={nextTranche ? Number(nextTranche.amount_try) : 0}

          periodPnl={fs.net_after_tax_try}
          ytdPnl={fs.net_after_tax_try}
          periodLabel={label}
        />

        {/* Decision Queue */}
        <DecisionQueue alerts={decisionAlerts} />
      </div>

      {/* ── TEMPORAL PRESSURE RAIL ───────────────────────────────────────── */}
      <TemporalPressureRail days={90} />

      {/* ── FOOTER: quick nav to detailed hubs ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-1 border-t border-[#f1f5f9]">
        <span className="text-[10px] text-[#94a3b8]">Detay:</span>
        {[
          { href: '/dashboard/finance',    label: 'Finans' },
          { href: '/dashboard/commercial', label: 'Ticaret' },
          { href: '/dashboard/partners',   label: 'Ortaklar' },
          { href: '/dashboard/planning',   label: 'Planlama' },
          { href: '/dashboard/cfo',        label: 'CFO' },
          { href: '/dashboard/reports',    label: 'Raporlar' },
        ].map(({ href, label: lbl }) => (
          <Link key={href} href={href}
            className="text-[10px] text-brand-light font-semibold hover:text-brand whitespace-nowrap">
            {lbl} →
          </Link>
        ))}
      </div>

    </div>
  )
}
