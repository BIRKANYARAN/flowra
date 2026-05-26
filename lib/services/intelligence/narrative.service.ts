// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/narrative.service.ts
//
// Financial Narrative Engine — rule-based Turkish financial summaries.
// No LLM/AI required. Pure template + grammar rules.
//
// Every narrative has:
//   1. headline     — most significant change in one sentence
//   2. performance  — P&L narrative with comparisons
//   3. liquidity    — cash position + runway
//   4. risk         — receivables, obligations, alerts
//   5. outlook      — forward-looking based on CCC + cash runway
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { fmtTRY, fmtMonth } from '@/lib/format'
import { FinanceService } from '@/lib/services/finance.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { WorkingCapitalService } from '@/lib/services/finance/working-capital.service'
import { computeSituation } from '@/lib/engines/situation.engine'
import type { SituationStatus } from '@/lib/engines/situation.engine'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface FinancialNarrative {
  generated_at:   string
  period_label:   string            // e.g. "Mayıs 2026"
  headline:       string            // most important single sentence
  sections: {
    performance:  string            // P&L narrative
    liquidity:    string            // cash & runway
    risk:         string            // receivables, obligations, alerts
    outlook:      string            // forward-looking
  }
  key_numbers: {
    revenue_try:         number
    revenue_change_pct:  number | null
    net_income_try:      number
    cash_try:            number
    runway_months:       number | null
    dso_days:            number | null
  }
  situation_status: SituationStatus
}

export interface NarrativeInputData {
  period:           { from: string; to: string }
  // Current period financial summary
  revenue_try:      number
  cost_try:         number
  gross_profit_try: number
  expenses_total_try: number
  net_income_try:   number
  // Prior period (optional — for change % calculations)
  prior_revenue_try?: number | null
  prior_net_income_try?: number | null
  // Cash
  cash_try:         number
  // Working capital
  ccc_days:         number | null
  dso_days:         number | null
  // Receivables breakdown
  total_receivables_try:  number
  overdue_receivables_try: number
  overdue_count:           number
  // Partner debt
  partner_loan_count:  number
  partner_loan_total:  number
  // Situation
  situation_status:    SituationStatus
  situation_line:      string
  // Runway
  runway_months:       number | null
  monthly_burn:        number
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmt(v: number): string {
  return fmtTRY(v, 0)
}

function pct(v: number, decimals = 1): string {
  return `%${v.toFixed(decimals).replace('.', ',')}`
}

function round1(v: number): number {
  return Math.round(v * 10) / 10
}

const STATUS_LABELS: Record<SituationStatus, string> = {
  healthy:   'sağlıklı',
  caution:   'dikkat gerektiriyor',
  'at-risk': 'risk altında',
  critical:  'kritik',
}

// ── Headline selector ─────────────────────────────────────────────────────────

function buildHeadline(data: NarrativeInputData, periodLabel: string): string {
  const revChange = data.prior_revenue_try != null && data.prior_revenue_try > 0
    ? ((data.revenue_try - data.prior_revenue_try) / data.prior_revenue_try) * 100
    : null

  // Priority 1: Critical runway
  if (data.runway_months != null && data.runway_months < 3 && data.cash_try > 0) {
    const months = Math.round(data.runway_months)
    return `Nakit baskısı — mevcut hızla ${months} aylık nakit kaldı.`
  }

  // Priority 2: Strong revenue growth
  if (revChange != null && revChange > 20) {
    return `Güçlü büyüme — gelir geçen aya kıyasla ${pct(round1(revChange))} arttı ve ${fmt(data.revenue_try)}'a ulaştı.`
  }

  // Priority 3: Revenue decline
  if (revChange != null && revChange < -20) {
    return `Gelir geriledi — geçen aya kıyasla ${pct(round1(Math.abs(revChange)))} düşüş, ${fmt(data.revenue_try)} olarak gerçekleşti.`
  }

  // Priority 4: Net loss
  if (data.net_income_try < 0) {
    return `${periodLabel} döneminde ${fmt(Math.abs(data.net_income_try))} net zarar kaydedildi.`
  }

  // Priority 5: Receivables risk (overdue > 50%)
  if (data.total_receivables_try > 0 && data.overdue_receivables_try > data.total_receivables_try * 0.5) {
    const overduePct = Math.round((data.overdue_receivables_try / data.total_receivables_try) * 100)
    return `Tahsilat riski — alacakların ${pct(overduePct, 0)}'i vadesi geçmiş durumda.`
  }

  // Default: healthy summary
  const statusLabel = STATUS_LABELS[data.situation_status]
  return `${periodLabel}: ${fmt(data.revenue_try)} gelir, ${fmt(data.net_income_try)} net kâr — ${statusLabel}.`
}

// ── Performance paragraph ─────────────────────────────────────────────────────

function buildPerformance(data: NarrativeInputData, periodLabel: string): string {
  const revChange = data.prior_revenue_try != null && data.prior_revenue_try > 0
    ? ((data.revenue_try - data.prior_revenue_try) / data.prior_revenue_try) * 100
    : null

  const revVsPrior = revChange != null
    ? ` (geçen aya göre ${pct(round1(Math.abs(revChange)))} ${revChange >= 0 ? 'artış' : 'düşüş'})`
    : ''

  const grossMarginPct = data.revenue_try > 0
    ? Math.round((data.gross_profit_try / data.revenue_try) * 100)
    : 0

  let netIncomeSentence: string
  if (data.net_income_try > 0) {
    netIncomeSentence = `Net kâr ${fmt(data.net_income_try)} olarak gerçekleşti`
  } else if (data.net_income_try < 0) {
    netIncomeSentence = `${fmt(Math.abs(data.net_income_try))} zarar kaydedildi`
  } else {
    netIncomeSentence = 'Başabaş nokta civarında seyredildi'
  }

  let expenseSentence: string
  const expenseRatio = data.revenue_try > 0 ? data.expenses_total_try / data.revenue_try : 0
  if (data.expenses_total_try > data.revenue_try && data.revenue_try > 0) {
    expenseSentence = 'Giderler gelirlerin üzerinde seyretmeye devam ediyor.'
  } else if (expenseRatio > 0.7 && data.revenue_try > 0) {
    expenseSentence = `Gider oranı ${pct(Math.round(expenseRatio * 100))} ile yüksek seyretti.`
  } else if (data.expenses_total_try > 0) {
    expenseSentence = `Gider kontrolü ${fmt(data.expenses_total_try)} ile dengeli kaldı.`
  } else {
    expenseSentence = 'Gider verisi bu dönem için henüz girilmemiş.'
  }

  return (
    `${periodLabel} döneminde ${fmt(data.revenue_try)} gelir elde edildi${revVsPrior}. ` +
    `Brüt kâr marjı ${pct(grossMarginPct, 0)} olarak gerçekleşti. ` +
    `${netIncomeSentence}. ` +
    expenseSentence
  )
}

// ── Liquidity paragraph ───────────────────────────────────────────────────────

function buildLiquidity(data: NarrativeInputData): string {
  const cashSentence = `Dönem sonunda nakit pozisyonu ${fmt(data.cash_try)}.`

  let runwaySentence: string
  if (data.runway_months == null) {
    runwaySentence = 'Nakit tüketimi hesaplanamadı — gider verisi yetersiz.'
  } else if (data.runway_months > 12) {
    runwaySentence = 'Mevcut hızda 1 yılın üzerinde nakit varlığı bulunuyor.'
  } else if (data.runway_months >= 6) {
    const months = Math.round(data.runway_months)
    runwaySentence = `${months} aylık nakit görünürlüğü mevcut.`
  } else if (data.runway_months >= 3) {
    const months = Math.round(data.runway_months)
    runwaySentence = `Dikkat: ${months} aylık nakit kaldı — büyüme yatırımları önce nakit sağlamaya bağlı.`
  } else {
    const months = Math.round(data.runway_months)
    runwaySentence = `Kritik: ${months} aylık nakit kaldı — acil nakit girişi planlanmalı.`
  }

  const burnSentence = data.monthly_burn > 0
    ? `Aylık ortalama gider yaklaşık ${fmt(data.monthly_burn)}.`
    : 'Aylık gider verisi henüz mevcut değil.'

  return `${cashSentence} ${runwaySentence} ${burnSentence}`
}

// ── Risk paragraph ────────────────────────────────────────────────────────────

function buildRisk(data: NarrativeInputData, situationLine: string): string {
  // Receivables sentence
  let receivableSentence: string
  if (data.overdue_receivables_try <= 0 || data.total_receivables_try <= 0) {
    receivableSentence = 'Tüm alacaklar güncel durumda.'
  } else {
    const overduePct = (data.overdue_receivables_try / data.total_receivables_try) * 100
    if (overduePct < 20) {
      receivableSentence = `${fmt(data.overdue_receivables_try)} tutarında alacak vadesi geçmiş (${data.overdue_count} adet).`
    } else {
      receivableSentence = `Alacak kalitesi zayıflıyor — ${fmt(data.overdue_receivables_try)} (${pct(round1(overduePct), 0)}) vadesi geçmiş.`
    }
  }

  // Partner debt sentence
  let partnerDebtSentence: string
  if (data.partner_loan_total <= 0) {
    partnerDebtSentence = 'Ortak borçlanması bulunmuyor.'
  } else {
    partnerDebtSentence = `${data.partner_loan_count} ortağa toplam ${fmt(data.partner_loan_total)} borç mevcut.`
  }

  // Top alert sentence from situation
  const alertSentence = situationLine || 'Genel durum değerlendirmesi mevcut.'

  return `${receivableSentence} ${partnerDebtSentence} ${alertSentence}`
}

// ── Outlook sentence ──────────────────────────────────────────────────────────

function buildOutlook(data: NarrativeInputData): string {
  let cccSentence: string
  if (data.ccc_days == null) {
    cccSentence = 'Nakit dönüşüm döngüsü hesaplanamadı — işlem verisi yetersiz.'
  } else if (data.ccc_days < 0) {
    cccSentence = 'Nakit dönüşüm döngüsü negatif — şirket tedarikçiden daha hızlı tahsilat yapıyor, sağlıklı bir gösterge.'
  } else if (data.ccc_days <= 30) {
    cccSentence = `Nakit dönüşüm döngüsü ${Math.round(data.ccc_days)} gün — sektör ortalamasında.`
  } else if (data.ccc_days <= 60) {
    cccSentence = `Nakit dönüşüm döngüsü ${Math.round(data.ccc_days)} gün — DSO'yu düşürmek nakit pozisyonunu iyileştirebilir.`
  } else {
    cccSentence = `Nakit dönüşüm döngüsü ${Math.round(data.ccc_days)} gün ile yüksek — çalışma sermayesi yönetimi önceliklendirilmeli.`
  }

  let trendSentence: string
  const runway = data.runway_months
  if ((runway == null || runway > 6) && data.net_income_try > 0) {
    trendSentence = `Şirket ${STATUS_LABELS[data.situation_status]} seyrini korumaktadır.`
  } else if ((runway != null && runway < 3) || data.net_income_try < 0) {
    trendSentence = 'Önümüzdeki dönemde likidite yönetimi ve gelir büyümesi öncelik taşımaktadır.'
  } else {
    trendSentence = 'Performans dengeli seyretmekte olup nakit yönetimine dikkat önerilir.'
  }

  return `${cccSentence} ${trendSentence}`
}

// ── Core pure-function generator ──────────────────────────────────────────────

export function generateFromData(params: NarrativeInputData): FinancialNarrative {
  const periodLabel = fmtMonth(params.period.from)

  const revChange = params.prior_revenue_try != null && params.prior_revenue_try > 0
    ? ((params.revenue_try - params.prior_revenue_try) / params.prior_revenue_try) * 100
    : null

  const headline    = buildHeadline(params, periodLabel)
  const performance = buildPerformance(params, periodLabel)
  const liquidity   = buildLiquidity(params)
  const risk        = buildRisk(params, params.situation_line)
  const outlook     = buildOutlook(params)

  return {
    generated_at:     new Date().toISOString(),
    period_label:     periodLabel,
    headline,
    sections: { performance, liquidity, risk, outlook },
    key_numbers: {
      revenue_try:        params.revenue_try,
      revenue_change_pct: revChange != null ? Math.round(revChange * 10) / 10 : null,
      net_income_try:     params.net_income_try,
      cash_try:           params.cash_try,
      runway_months:      params.runway_months,
      dso_days:           params.dso_days,
    },
    situation_status: params.situation_status,
  }
}

// ── DB-backed service class ───────────────────────────────────────────────────

export class NarrativeService {
  /**
   * Generate a financial narrative for a given period.
   * Fetches all required data in parallel and delegates to generateFromData().
   */
  static async generatePeriodNarrative(
    companyId: string,
    uid:       string,
    supabase:  AnyClient,
    period:    { from: string; to: string },
  ): Promise<FinancialNarrative> {

    // ── Prior period of same length ───────────────────────────────────────────
    const periodMs = new Date(period.to).getTime() - new Date(period.from).getTime()
    const priorToDate   = new Date(new Date(period.from).getTime() - 86_400_000)
    const priorFromDate = new Date(priorToDate.getTime() - periodMs)
    const priorPeriod = {
      from: priorFromDate.toISOString().slice(0, 10),
      to:   priorToDate.toISOString().slice(0, 10),
    }

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      currentSummaryResult,
      priorSummaryResult,
      balanceSheetResult,
      workingCapitalResult,
      overdueReceivablesResult,
      partnerLoanResult,
    ] = await Promise.allSettled([

      // 1. Current period financial summary
      FinanceService.getFinancialSummary(uid, companyId, period, undefined, undefined, supabase),

      // 2. Prior period financial summary (for comparison)
      FinanceService.getFinancialSummary(uid, companyId, priorPeriod, undefined, undefined, supabase),

      // 3. Balance sheet at end of period
      BalanceSheetService.compute(uid, companyId, period.to, supabase),

      // 4. Working capital metrics
      WorkingCapitalService.compute(companyId, uid, supabase, period),

      // 5. Overdue receivables
      (supabase as SupabaseClient)
        .from('sales')
        .select('total_try:total, paid_amount, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['overdue'])
        .lte('sale_date', period.to),

      // 6. Partner loan balances
      (supabase as SupabaseClient)
        .from('partner_loan_tranches')
        .select('outstanding_try, partner_id')
        .eq('company_id', companyId)
        .eq('status', 'active'),
    ])

    // ── Extract results (with fallbacks) ──────────────────────────────────────
    const currentSummary = currentSummaryResult.status === 'fulfilled'
      ? currentSummaryResult.value
      : null

    const priorSummary = priorSummaryResult.status === 'fulfilled'
      ? priorSummaryResult.value
      : null

    const balanceSheet = balanceSheetResult.status === 'fulfilled'
      ? balanceSheetResult.value
      : null

    const workingCapital = workingCapitalResult.status === 'fulfilled'
      ? workingCapitalResult.value
      : null

    const overdueRows = overdueReceivablesResult.status === 'fulfilled'
      ? ((overdueReceivablesResult.value as { data: Array<{ total_try: number }> | null }).data ?? [])
      : []

    const partnerLoanRows = partnerLoanResult.status === 'fulfilled'
      ? ((partnerLoanResult.value as { data: Array<{ outstanding_try: number; partner_id: string }> | null }).data ?? [])
      : []

    // ── Derive figures ────────────────────────────────────────────────────────
    const revenue_try       = currentSummary?.revenue_try ?? 0
    const cost_try          = currentSummary?.cost_try ?? 0
    const gross_profit_try  = currentSummary?.gross_profit_try ?? 0
    const expenses_total_try = currentSummary?.expenses_total_try ?? 0
    const net_income_try    = currentSummary?.net_after_tax_try ?? 0

    const prior_revenue_try   = priorSummary?.revenue_try ?? null
    const prior_net_income_try = priorSummary?.net_after_tax_try ?? null

    // Cash from balance sheet, fallback to 0
    const cash_try = balanceSheet?.assets?.cash_try ?? 0

    // Total receivables
    const total_receivables_try = workingCapital?.total_receivables_try ?? 0

    // Overdue receivables
    const overdue_receivables_try = overdueRows.reduce((s, r) => s + Number(r.total_try ?? 0), 0)
    const overdue_count = overdueRows.length

    // Partner loans
    const uniquePartners = new Set(partnerLoanRows.map(r => r.partner_id))
    const partner_loan_count = uniquePartners.size
    const partner_loan_total = partnerLoanRows.reduce((s, r) => s + Number(r.outstanding_try ?? 0), 0)

    // Runway
    const daysInPeriod = Math.max(
      (new Date(period.to).getTime() - new Date(period.from).getTime()) / 86_400_000 + 1,
      1
    )
    const monthsInPeriod   = daysInPeriod / 30.44
    const monthlyNet       = net_income_try / monthsInPeriod
    const monthly_burn     = monthlyNet < 0 ? Math.abs(monthlyNet) : expenses_total_try / monthsInPeriod
    const runway_months    = (monthly_burn > 0 && cash_try > 0)
      ? cash_try / monthly_burn
      : null

    // Situation
    const overdueRatioPct = total_receivables_try > 0
      ? (overdue_receivables_try / total_receivables_try) * 100
      : 0

    const netMarginPct = revenue_try > 0 ? net_income_try / revenue_try : 0
    const runwayMonths = runway_months ?? 999

    const situation = computeSituation({
      cashRunwayMonths:  runwayMonths,
      isProfitable:      monthlyNet >= 0,
      netMarginPct,
      debtServiceRatio:  0,
      overdueRatioPct,
      maxBurdenScoreAbs: 0,
    })

    // ── Build input object ────────────────────────────────────────────────────
    const inputData: NarrativeInputData = {
      period,
      revenue_try,
      cost_try,
      gross_profit_try,
      expenses_total_try,
      net_income_try,
      prior_revenue_try,
      prior_net_income_try,
      cash_try,
      ccc_days:               workingCapital?.ccc_days ?? null,
      dso_days:               workingCapital?.dso_days ?? workingCapital?.dso_formula_days ?? null,
      total_receivables_try,
      overdue_receivables_try,
      overdue_count,
      partner_loan_count,
      partner_loan_total,
      situation_status:       situation.status,
      situation_line:         situation.situationLine,
      runway_months,
      monthly_burn,
    }

    return generateFromData(inputData)
  }
}
