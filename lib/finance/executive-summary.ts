// ═══════════════════════════════════════════════════════════════════════════════
// lib/finance/executive-summary.ts
//
// Canonical data aggregator for the Executive Command Center (dashboard).
//
// Design principles:
//   • Single async call → full ExecutiveSummary (no waterfall fetching)
//   • getCfoMetrics() is the authoritative source for all cash/burn/receivable data
//   • FinanceService.getFinancialSummary() provides accrual-basis P&L for the waterfall
//   • Decisions are pre-computed here — the page never derives business logic
//   • All errors degrade gracefully (sq wrapper) — never crash the dashboard
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient }            from '@/lib/supabase-server'
import { safeSystemQuery }         from '@/lib/admin-db'
import { getCfoMetrics }           from './financial-core'
import { FinanceService }          from '@/lib/services/finance.service'
import { PartnerService }          from '@/lib/services/partner.service'
import { fetchTcmbWithFallback }   from '@/lib/fx'
import { CORPORATE_TAX_RATE_TR }   from '@/lib/services/finance-rules'
import type { CfoMetrics }         from './cfo-metrics'
import type { FinancialSummary }   from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FxSnapshot {
  USD:        number
  EUR:        number
  source:     'tcmb_today' | 'tcmb_last_business_day' | 'db' | 'fallback'
  rate_date:  string | null
  fetched_at: string | null
}
export const EMPTY_FX: FxSnapshot = {
  USD: 0, EUR: 0, source: 'fallback', rate_date: null, fetched_at: null,
}

export type DecisionTier = 'critical' | 'attention' | 'opportunity' | 'info'

export interface Decision {
  tier:     DecisionTier
  icon:     string
  title:    string
  detail:   string
  guidance: string
  amount?:  number
  href:     string
}

export interface EqEntry {
  partner_id:          string
  partner_name:        string
  share_ratio:         number
  equalization_amount: number
  pro_rata_share:      number
  total_payout:        number
}
export interface EqResult {
  baseline_per_unit:  number
  total_equalization: number
  distributable:      number
  remaining_after_eq: number
  entries:            EqEntry[]
}
const ZERO_EQ: EqResult = {
  baseline_per_unit: 0, total_equalization: 0,
  distributable: 0, remaining_after_eq: 0, entries: [],
}

export interface TaskReminder {
  id: string; title: string; due_date: string
}

export interface ExecutiveSummary {
  period: { from: string; to: string; label: string }

  /** Core CFO metrics — cash, burn, receivables, tax, partner, stock */
  metrics: CfoMetrics

  /** Period P&L (accrual basis for waterfall display) */
  pnl: {
    revenue:           number
    grossProfit:       number
    grossMarginPct:    number
    netAfterTax:       number
    expensesTotal:     number
    vatNet:            number
    corporateTax:      number
    matrah:            number
    monthlyBurn:       number
    breakEvenRevenue:  number | null
    periodCollected:   number
    collectionRate:    number
  }

  equalization:  EqResult
  openProformas: { count: number; total: number }
  alertCount:    number
  taskReminders: TaskReminder[]
  decisions:     Decision[]
  fx:            FxSnapshot
}

// ── Formatting ────────────────────────────────────────────────────────────────

const TRY_FMT = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
function fmt(n: number): string {
  const abs = Math.abs(Number(n || 0))
  const s   = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${s}₺${(abs / 1_000_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}M`
  if (abs >= 10_000)    return `${s}₺${(abs / 1_000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`
  return `${s}₺${TRY_FMT.format(abs)}`
}

// ── Decision builder ──────────────────────────────────────────────────────────

function buildDecisions(
  metrics:       CfoMetrics,
  pnl:           ExecutiveSummary['pnl'],
  equalization:  EqResult,
  openProformas: { count: number; total: number },
  taskReminders: TaskReminder[],
): Decision[] {
  const d: Decision[] = []
  const today = new Date().toISOString().slice(0, 10)
  const overdueTaskCount = taskReminders.filter(t => t.due_date < today).length

  if (metrics.burn.runway_days !== null && metrics.burn.runway_days <= 30) {
    d.push({
      tier: 'critical', icon: '🔥',
      title: 'Nakit Tehlikede',
      detail: `Tahmini ${metrics.burn.runway_days} gün nakit kaldı — aylık ${fmt(metrics.burn.monthly_burn_rate)} burn`,
      guidance: 'Tahsilatları acilen hızlandırın veya giderleri kısın.',
      href: '/dashboard/operations?tab=expenses',
    })
  }

  if (metrics.receivables.overdue_60d > 5_000) {
    d.push({
      tier: 'critical', icon: '⚠',
      title: 'Kritik Gecikmiş Tahsilat',
      detail: `60+ gün gecikmiş: ${fmt(metrics.receivables.overdue_60d)}`,
      guidance: 'Hukuki takip veya müşteri ile acil iletişim gerekebilir.',
      amount: metrics.receivables.overdue_60d,
      href: '/dashboard/commercial?tab=collections',
    })
  }

  if (
    metrics.receivables.overdue_30d > 2_000 &&
    metrics.receivables.overdue_60d <= 5_000
  ) {
    d.push({
      tier: 'attention', icon: '📬',
      title: '30+ Gün Gecikmeli Tahsilat',
      detail: `${fmt(metrics.receivables.overdue_30d)} vadesi geçmiş`,
      guidance: 'Müşterilere hatırlatma gönderin.',
      amount: metrics.receivables.overdue_30d,
      href: '/dashboard/commercial?tab=collections',
    })
  }

  if (metrics.burn.runway_days !== null && metrics.burn.runway_days > 30 && metrics.burn.runway_days <= 90) {
    d.push({
      tier: 'attention', icon: '📉',
      title: `Runway ${metrics.burn.runway_days} Gün`,
      detail: `${fmt(metrics.burn.monthly_burn_rate)}/ay burn ile ${metrics.burn.runway_days} gün kaldı`,
      guidance: 'Giderleri veya fiyatlandırmayı simüle edin.',
      href: '/dashboard/planning?tab=cash-projection',
    })
  }

  if (metrics.tax.kdv_net > 1_000) {
    d.push({
      tier: 'attention', icon: '⬆',
      title: 'KDV Beyannamesi',
      detail: `Bu dönem ${fmt(metrics.tax.kdv_net)} KDV ödenecek`,
      guidance: 'Beyan tarihinden önce hazırlayın.',
      amount: metrics.tax.kdv_net,
      href: '/dashboard/finance?tab=tax',
    })
  }

  if (equalization.total_equalization > 5_000) {
    d.push({
      tier: 'attention', icon: '⚖',
      title: 'Ortak Dengesi Bozuk',
      detail: `${fmt(equalization.total_equalization)} eşitleme açığı — ${equalization.entries.length} ortak`,
      guidance: 'Dağıtımdan önce eşitleme yapın.',
      amount: equalization.total_equalization,
      href: '/dashboard/partners',
    })
  }

  if (openProformas.count > 0) {
    d.push({
      tier: 'opportunity', icon: '💰',
      title: 'Onay Bekleyen Proformalar',
      detail: `${openProformas.count} proforma · ${fmt(openProformas.total)} satışa dönüşebilir`,
      guidance: 'Müşteri onayını takip edin.',
      amount: openProformas.total,
      href: '/dashboard/commercial?tab=proformas',
    })
  }

  if (overdueTaskCount > 0) {
    d.push({
      tier: 'opportunity', icon: '📋',
      title: `${overdueTaskCount} Gecikmiş Görev`,
      detail: overdueTaskCount === 1 ? '1 görev bugün tamamlanmalı' : `${overdueTaskCount} görev bekliyor`,
      guidance: 'Görevleri önceliklendirin.',
      href: '/dashboard/planning?tab=tasks',
    })
  }

  const order: Record<DecisionTier, number> = { critical: 0, attention: 1, opportunity: 2, info: 3 }
  return d.sort((a, b) => order[a.tier] - order[b.tier]).slice(0, 5)
}

// ── Period helper ──────────────────────────────────────────────────────────────

function currentMonthPeriod() {
  const now   = new Date()
  const year  = now.getFullYear()
  const mon   = String(now.getMonth() + 1).padStart(2, '0')
  const from  = `${year}-${mon}-01`
  const to    = now.toISOString().slice(0, 10)
  const label = now.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

// ── FX loader ─────────────────────────────────────────────────────────────────

async function loadFx(): Promise<FxSnapshot> {
  try {
    const supabase = createClient()
    const today    = new Date().toISOString().slice(0, 10)
    const now      = new Date().toISOString()

    const { data: cached } = await supabase
      .from('fx_rates').select('currency, buying, fetched_at')
      .in('currency', ['USD', 'EUR']).eq('rate_date', today)

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
          if (error) console.error('[exec-summary/fx] upsert:', error.message)
        })
      } catch { /* service-role not available */ }
      return { USD: tcmb.usd, EUR: tcmb.eur, source: tcmb.source, rate_date: tcmb.date, fetched_at: now }
    }

    const { data: latest } = await supabase
      .from('fx_rates').select('currency, buying, rate_date, fetched_at')
      .in('currency', ['USD', 'EUR']).order('rate_date', { ascending: false }).limit(4)
    const lu = (latest ?? []).find(r => r.currency === 'USD')
    const le = (latest ?? []).find(r => r.currency === 'EUR')
    if (lu?.buying && le?.buying) {
      return {
        USD: Number(lu.buying), EUR: Number(le.buying), source: 'db',
        rate_date: (lu.rate_date as string | null) ?? null,
        fetched_at: (lu.fetched_at as string | null) ?? null,
      }
    }
    return EMPTY_FX
  } catch { return EMPTY_FX }
}

// ── Safe wrapper ───────────────────────────────────────────────────────────────

async function sq<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn() }
  catch (e) {
    console.error('[executive-summary]', e instanceof Error ? e.message : String(e))
    return fallback
  }
}

// ── Default CfoMetrics (zero state) ──────────────────────────────────────────

const ZERO_METRICS: CfoMetrics = {
  cash:        { true_cash_position: 0, operational_cash: 0, restricted_cash: 0, distributable_cash: 0 },
  burn:        { monthly_burn_rate: 0, runway_months: null, runway_days: null, cash_exhaustion_date: null },
  receivables: { total_outstanding: 0, overdue_30d: 0, overdue_60d: 0, overdue_90d: 0, collection_rate_pct: 100 },
  tax:         { kdv_net: 0, corporate_tax_estimate: 0, total_fiscal_obligation: 0 },
  partner:     { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 0 },
  stock:       { fifo_value: 0, coverage_months: null },
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function getExecutiveSummary(
  uid:       string,
  companyId: string,
): Promise<ExecutiveSummary> {
  const supabase          = createClient()
  const period            = currentMonthPeriod()
  const { from, to }      = period
  const daysInPeriod      = Math.max((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 + 1, 1)
  const monthsInPeriod    = daysInPeriod / 30.44

  const [
    rawMetrics,
    finRes,
    proformasData,
    alertCountData,
    taskRemindersData,
    fxData,
  ] = await Promise.all([

    sq(() => getCfoMetrics(companyId, { from, to }), null as CfoMetrics | null),

    sq(() => FinanceService.getFinancialSummary(
      uid, companyId, { from, to },
      { corporate_tax_rate: CORPORATE_TAX_RATE_TR },
    ), null as FinancialSummary | null),

    sq(async () => {
      const { data } = await supabase
        .from('proformas').select('total_try')
        .eq('company_id', companyId)
        .in('status', ['sent', 'accepted'])
        .is('deleted_at', null)
      return (data ?? []) as Array<{ total_try: number | null }>
    }, [] as Array<{ total_try: number | null }>),

    sq(async () => {
      const { count } = await supabase
        .from('alerts').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('is_read', false)
      return count ?? 0
    }, 0),

    sq(async () => {
      const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
      const { data } = await supabase
        .from('tasks').select('id, title, due_date')
        .eq('company_id', companyId)
        .eq('status', 'open').is('deleted_at', null)
        .not('due_date', 'is', null)
        .lte('due_date', in7days)
        .order('due_date', { ascending: true }).limit(5)
      return (data ?? []) as TaskReminder[]
    }, [] as TaskReminder[]),

    sq(() => loadFx(), EMPTY_FX),
  ])

  const metrics = rawMetrics ?? ZERO_METRICS

  const revenue          = Number(finRes?.revenue_try          ?? 0)
  const grossProfit      = Number(finRes?.gross_profit_try     ?? 0)
  const netAfterTax      = Number(finRes?.net_after_tax_try    ?? 0)
  const expensesTotal    = Number(finRes?.expenses_total_try   ?? 0)
  const vatNet           = Number(finRes?.net_vat_try          ?? 0)
  const corporateTax     = Number(finRes?.corporate_tax_try    ?? 0)
  const matrah           = Number(finRes?.matrah_try           ?? 0)
  const grossMarginPct   = revenue > 0 ? grossProfit / revenue : 0
  // Use 3-month trailing burn rate (stable) instead of current-period / partial-month
  // (dividing by 0.1 months on day 3 of month inflates burn 10×).
  // Fall back to period expense if trailing data isn't available yet.
  const trailingBurn     = metrics.burn.monthly_burn_rate > 0 ? metrics.burn.monthly_burn_rate : null
  const monthlyBurn      = trailingBurn ?? (monthsInPeriod >= 1 ? expensesTotal / monthsInPeriod : expensesTotal)
  const breakEvenRevenue = grossMarginPct > 0.001 ? monthlyBurn / grossMarginPct : null

  const pnl: ExecutiveSummary['pnl'] = {
    revenue, grossProfit, grossMarginPct, netAfterTax, expensesTotal,
    vatNet, corporateTax, matrah, monthlyBurn, breakEvenRevenue,
    periodCollected: metrics.cash.operational_cash,
    collectionRate:  metrics.receivables.collection_rate_pct,
  }

  const openProformas = {
    count: proformasData.length,
    total: proformasData.reduce((s, p) => s + Number(p.total_try ?? 0), 0),
  }

  let equalization: EqResult = ZERO_EQ
  try {
    const eqResult = await PartnerService.calculateEqualization(
      uid, companyId, metrics.cash.distributable_cash,
    )
    if (eqResult && Array.isArray(eqResult.entries)) {
      equalization = eqResult as EqResult
    }
  } catch { /* non-fatal */ }

  const decisions = buildDecisions(metrics, pnl, equalization, openProformas, taskRemindersData)

  return {
    period, metrics, pnl, equalization,
    openProformas,
    alertCount:    alertCountData,
    taskReminders: taskRemindersData,
    decisions,
    fx:            fxData,
  }
}
