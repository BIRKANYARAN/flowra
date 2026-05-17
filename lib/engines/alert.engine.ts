// Alert Engine — evaluates financial thresholds and produces Decision Alerts
// Reads default rules from static config; DB overrides applied on top.
// Output: DecisionAlert[] sorted by severity (critical first)

import { round2 } from '@/lib/calc'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface DecisionAlert {
  id:           string         // stable: rule_type + resource_id
  rule_type:    string
  severity:     AlertSeverity
  title:        string
  detail:       string
  actionLabel:  string
  actionHref:   string
  amount?:      number
  dueDate?:     string
}

export interface AlertInputs {
  // Receivables
  overdueCount30:       number
  overdueTotal30:       number
  overdueCount60:       number
  overdueTotal60:       number
  totalReceivables:     number

  // Cash
  cashRunwayDays:       number   // -1 if profitable / no burn
  monthlyNetIncome:     number

  // Partner
  maxBurdenScoreAbs:    number   // 0-1
  nextTrancheDueDays:   number   // days until next loan tranche is due (-1 if none)
  nextTrancheAmount:    number

  // Period
  openPeriodDaysOverdue:number   // days since period_end if still open; -1 if closed

  // Tax
  kdvPayable:           number
  taxDueDays:           number   // days until next tax due date (-1 if none)

  // Balance sheet
  bsImbalanceTry:       number   // 0 if balanced

  // Legal reserve
  legalReserveDeficit:  number   // 0 if adequate

  // Equity
  equityGapTry:         number   // 0 if fully paid
  equityCallOverdueDays:number   // -1 if no call

  // DSR
  debtServiceRatio:     number
  partnerLoanConcentration: number  // 0-1: largest single partner's share of total loan
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

export function evaluateAlerts(inputs: AlertInputs): DecisionAlert[] {
  const alerts: DecisionAlert[] = []

  // ── RECEIVABLE_30 ──────────────────────────────────────────────────────────
  if (inputs.overdueCount30 > 0 && inputs.overdueTotal30 > 500) {
    alerts.push({
      id:          `RECEIVABLE_30_all`,
      rule_type:   'RECEIVABLE_30',
      severity:    'warning',
      title:       `${inputs.overdueCount30} satış 30+ gün vadesi geçmiş`,
      detail:      `Toplam ${fmtK(inputs.overdueTotal30)} tahsil edilmemiş`,
      actionLabel: 'Tahsilat Sayfası',
      actionHref:  '/dashboard/commercial?tab=collections',
      amount:      inputs.overdueTotal30,
    })
  }

  // ── RECEIVABLE_60 ──────────────────────────────────────────────────────────
  if (inputs.overdueCount60 > 0 && inputs.overdueTotal60 > 500) {
    alerts.push({
      id:          `RECEIVABLE_60_all`,
      rule_type:   'RECEIVABLE_60',
      severity:    'critical',
      title:       `${inputs.overdueCount60} satış 60+ gün bekliyor`,
      detail:      `${fmtK(inputs.overdueTotal60)} kritik tahsilat riski`,
      actionLabel: 'Acil Tahsilat',
      actionHref:  '/dashboard/commercial?tab=collections',
      amount:      inputs.overdueTotal60,
    })
  }

  // ── CASH_RUNWAY_90 ─────────────────────────────────────────────────────────
  if (inputs.cashRunwayDays >= 0 && inputs.cashRunwayDays <= 90 && inputs.cashRunwayDays > 30) {
    alerts.push({
      id:          'CASH_RUNWAY_90',
      rule_type:   'CASH_RUNWAY_90',
      severity:    'warning',
      title:       `Nakit yaklaşık ${inputs.cashRunwayDays} gün yeter`,
      detail:      `Aylık zarar ${fmtK(Math.abs(inputs.monthlyNetIncome))} — gelir artırın veya gider kesin`,
      actionLabel: 'Simülasyon Yap',
      actionHref:  '/dashboard/planning?tab=cash-projection',
    })
  }

  // ── CASH_RUNWAY_30 ─────────────────────────────────────────────────────────
  if (inputs.cashRunwayDays >= 0 && inputs.cashRunwayDays <= 30) {
    alerts.push({
      id:          'CASH_RUNWAY_30',
      rule_type:   'CASH_RUNWAY_30',
      severity:    'critical',
      title:       `Kritik: nakit ${inputs.cashRunwayDays} günde tükeniyor`,
      detail:      `Aylık ${fmtK(Math.abs(inputs.monthlyNetIncome))} zarar — acil aksiyon gerekli`,
      actionLabel: 'Nakit Simülasyonu',
      actionHref:  '/dashboard/planning?tab=cash-projection',
    })
  }

  // ── PARTNER_BURDEN ─────────────────────────────────────────────────────────
  if (inputs.maxBurdenScoreAbs > 0.20) {
    alerts.push({
      id:          'PARTNER_BURDEN',
      rule_type:   'PARTNER_BURDEN',
      severity:    'warning',
      title:       'Ortak borç dengesi bozuk',
      detail:      `En yüksek sapma: %${round2(inputs.maxBurdenScoreAbs * 100)} — eşitleme önerilir`,
      actionLabel: 'Waterfall Simüle Et',
      actionHref:  '/dashboard/partners',
    })
  }

  // ── PARTNER_LOAN_DUE ───────────────────────────────────────────────────────
  if (inputs.nextTrancheDueDays >= 0 && inputs.nextTrancheDueDays <= 14) {
    alerts.push({
      id:          'PARTNER_LOAN_DUE',
      rule_type:   'PARTNER_LOAN_DUE',
      severity:    'critical',
      title:       `Ortak borç vadesi ${inputs.nextTrancheDueDays} gün içinde`,
      detail:      `${fmtK(inputs.nextTrancheAmount)} tranche vadesi yaklaşıyor`,
      actionLabel: 'Tranche Detayı',
      actionHref:  '/dashboard/partners',
      amount:      inputs.nextTrancheAmount,
      dueDate:     daysFromNow(inputs.nextTrancheDueDays),
    })
  }

  // ── PERIOD_NOT_CLOSED ──────────────────────────────────────────────────────
  if (inputs.openPeriodDaysOverdue > 10) {
    alerts.push({
      id:          'PERIOD_NOT_CLOSED',
      rule_type:   'PERIOD_NOT_CLOSED',
      severity:    'warning',
      title:       `Dönem kapanışı ${inputs.openPeriodDaysOverdue} gün bekliyor`,
      detail:      'Açık dönem finansal tablolarınızı kirletiyor',
      actionLabel: 'Dönemi Kapat',
      actionHref:  '/dashboard/cfo/period-close',
    })
  }

  // ── TAX_DUE_SOON ───────────────────────────────────────────────────────────
  if (inputs.taxDueDays >= 0 && inputs.taxDueDays <= 7 && inputs.kdvPayable > 50) {
    alerts.push({
      id:          'TAX_DUE_SOON',
      rule_type:   'TAX_DUE_SOON',
      severity:    'critical',
      title:       `KDV beyanı ${inputs.taxDueDays} gün kaldı`,
      detail:      `Ödenecek KDV: ${fmtK(inputs.kdvPayable)}`,
      actionLabel: 'KDV Raporu',
      actionHref:  '/dashboard/cfo',
      amount:      inputs.kdvPayable,
    })
  }

  // ── BS_IMBALANCED ──────────────────────────────────────────────────────────
  if (inputs.bsImbalanceTry > 100) {
    alerts.push({
      id:          'BS_IMBALANCED',
      rule_type:   'BS_IMBALANCED',
      severity:    'critical',
      title:       'Bilanço dengesi bozuk',
      detail:      `${fmtK(inputs.bsImbalanceTry)} fark — muhasebe kaydı kontrol edilmeli`,
      actionLabel: 'Mizan Görüntüle',
      actionHref:  '/dashboard/cfo/trial-balance',
      amount:      inputs.bsImbalanceTry,
    })
  }

  // ── LEGAL_RESERVE_LOW ─────────────────────────────────────────────────────
  if (inputs.legalReserveDeficit > 0) {
    alerts.push({
      id:          'LEGAL_RESERVE_LOW',
      rule_type:   'LEGAL_RESERVE_LOW',
      severity:    'warning',
      title:       'Yasal yedek eksik',
      detail:      `TTK 519: ${fmtK(inputs.legalReserveDeficit)} daha ayrılmalı`,
      actionLabel: 'Dönem Kapanış',
      actionHref:  '/dashboard/cfo/period-close',
      amount:      inputs.legalReserveDeficit,
    })
  }

  // ── EQUITY_GAP_OVERDUE ─────────────────────────────────────────────────────
  if (inputs.equityGapTry > 0 && inputs.equityCallOverdueDays > 0) {
    alerts.push({
      id:          'EQUITY_GAP_OVERDUE',
      rule_type:   'EQUITY_GAP_OVERDUE',
      severity:    'warning',
      title:       `Ödenmemiş sermaye ${inputs.equityCallOverdueDays} gün gecikti`,
      detail:      `${fmtK(inputs.equityGapTry)} taahhüt edilmemiş — TTK 588 faiz işler`,
      actionLabel: 'Ortak Sermaye',
      actionHref:  '/dashboard/partners',
      amount:      inputs.equityGapTry,
    })
  }

  // ── DSR_HIGH ───────────────────────────────────────────────────────────────
  if (inputs.debtServiceRatio > 0.70) {
    alerts.push({
      id:          'DSR_HIGH',
      rule_type:   'DSR_HIGH',
      severity:    'critical',
      title:       `Borç servis oranı kritik: %${round2(inputs.debtServiceRatio * 100)}`,
      detail:      'Gelirinizin %70+ borç servise gidiyor',
      actionLabel: 'Borç Baskısı',
      actionHref:  '/dashboard/partners',
    })
  }

  // ── CONCENTRATION ──────────────────────────────────────────────────────────
  if (inputs.partnerLoanConcentration > 0.80) {
    alerts.push({
      id:          'CONCENTRATION',
      rule_type:   'CONCENTRATION',
      severity:    'warning',
      title:       `Borç konsantrasyonu yüksek: %${round2(inputs.partnerLoanConcentration * 100)}`,
      detail:      'Tek ortak toplam borcun %80+\'ini taşıyor',
      actionLabel: 'Tranche Analizi',
      actionHref:  '/dashboard/partners',
    })
  }

  // Sort: critical first, then warning, then info; within same severity by amount desc
  return alerts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `₺${(abs / 1_000).toFixed(0)}K`
  return `₺${abs.toFixed(0)}`
}

function daysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}
