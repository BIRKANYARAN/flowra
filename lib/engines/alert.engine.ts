// Alert Engine — evaluates financial thresholds and produces Decision Alerts
// Reads default rules from static config; DB overrides applied on top.
// Output: DecisionAlert[] sorted by severity (critical first)

import { round2 } from '@/lib/calc'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface DecisionAlert {
  id:            string         // stable: rule_type + resource_id (or companyId)
  rule_type:     string
  severity:      AlertSeverity
  title:         string
  detail:        string
  actionLabel:   string
  actionHref:    string
  amount?:       number
  dueDate?:      string
  triggeredAt:   string         // ISO timestamp — set at generation time
  resolvedWhen?: string         // human description of auto-resolution condition
}

// ── CFO Accounting Accuracy inputs ────────────────────────────────────────────
export interface CFOAccuracyInputs {
  trialBalanceImbalance: number    // TRY — from trial balance service
  cashBookBalance: number          // GL 102 account balance
  bankStatementBalance?: number    // from bank reconciliation (optional)
  fifoIntegrityIssues: number      // count of negative stock lots
  legalReserveShortfall: number    // TRY — how much reserve is missing (0 = ok)
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

  // Receivable concentration
  maxCustomerReceivableShare?: number  // 0-1: largest single customer's share of total receivables
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/** Build a stable alert ID: `${rule_type}_${resourceId ?? companyId}` */
function stableId(ruleType: string, resourceId?: string | null, companyId?: string): string {
  return `${ruleType}_${resourceId ?? companyId ?? 'all'}`
}

export function evaluateAlerts(inputs: AlertInputs): DecisionAlert[] {
  const alerts: DecisionAlert[] = []
  const now = new Date().toISOString()

  // ── RECEIVABLE_30 ──────────────────────────────────────────────────────────
  if (inputs.overdueCount30 > 0 && inputs.overdueTotal30 > 500) {
    alerts.push({
      id:           `RECEIVABLE_30_all`,
      rule_type:    'RECEIVABLE_30',
      severity:     'warning',
      title:        `${inputs.overdueCount30} satış 30+ gün vadesi geçmiş`,
      detail:       `Toplam ${fmtK(inputs.overdueTotal30)} tahsil edilmemiş`,
      actionLabel:  'Tahsilat Sayfası',
      actionHref:   '/dashboard/commercial?tab=collections',
      amount:       inputs.overdueTotal30,
      triggeredAt:  now,
      resolvedWhen: 'Tüm vadesi geçmiş alacaklar tahsil edildiğinde',
    })
  }

  // ── RECEIVABLE_60 ──────────────────────────────────────────────────────────
  if (inputs.overdueCount60 > 0 && inputs.overdueTotal60 > 500) {
    alerts.push({
      id:           `RECEIVABLE_60_all`,
      rule_type:    'RECEIVABLE_60',
      severity:     'critical',
      title:        `${inputs.overdueCount60} satış 60+ gün bekliyor`,
      detail:       `${fmtK(inputs.overdueTotal60)} kritik tahsilat riski`,
      actionLabel:  'Acil Tahsilat',
      actionHref:   '/dashboard/commercial?tab=collections',
      amount:       inputs.overdueTotal60,
      triggeredAt:  now,
      resolvedWhen: '60+ gün vadesi geçmiş alacaklar tahsil edildiğinde',
    })
  }

  // ── CASH_RUNWAY_90 ─────────────────────────────────────────────────────────
  if (inputs.cashRunwayDays >= 0 && inputs.cashRunwayDays <= 90 && inputs.cashRunwayDays > 30) {
    // Only describe as "loss" when monthly income is actually negative;
    // profitable companies with declining cash have a different root cause.
    const runwayDetail = inputs.monthlyNetIncome < 0
      ? `Aylık zarar ${fmtK(Math.abs(inputs.monthlyNetIncome))} — gelir artırın veya gider kesin`
      : `Nakit azalıyor — tahsilat hızlandırın veya borç baskısını değerlendirin`
    alerts.push({
      id:           'CASH_RUNWAY_90',
      rule_type:    'CASH_RUNWAY_90',
      severity:     'warning',
      title:        `Nakit yaklaşık ${inputs.cashRunwayDays} gün yeter`,
      detail:       runwayDetail,
      actionLabel:  'Simülasyon Yap',
      actionHref:   '/dashboard/planning?tab=cash-projection',
      triggeredAt:  now,
      resolvedWhen: 'Nakit rezervi 90 günü aştığında',
    })
  }

  // ── CASH_RUNWAY_30 ─────────────────────────────────────────────────────────
  if (inputs.cashRunwayDays >= 0 && inputs.cashRunwayDays <= 30) {
    const runwayDetail30 = inputs.monthlyNetIncome < 0
      ? `Aylık ${fmtK(Math.abs(inputs.monthlyNetIncome))} zarar — acil aksiyon gerekli`
      : `Nakit kritik seviyed — acil tahsilat veya finansman gerekli`
    alerts.push({
      id:           'CASH_RUNWAY_30',
      rule_type:    'CASH_RUNWAY_30',
      severity:     'critical',
      title:        `Kritik: nakit ${inputs.cashRunwayDays} günde tükeniyor`,
      detail:       runwayDetail30,
      actionLabel:  'Nakit Simülasyonu',
      actionHref:   '/dashboard/planning?tab=cash-projection',
      triggeredAt:  now,
      resolvedWhen: 'Nakit rezervi 30 günü aştığında',
    })
  }

  // ── PARTNER_BURDEN ─────────────────────────────────────────────────────────
  if (inputs.maxBurdenScoreAbs > 0.20) {
    alerts.push({
      id:           'PARTNER_BURDEN',
      rule_type:    'PARTNER_BURDEN',
      severity:     'warning',
      title:        'Ortak borç dengesi bozuk',
      detail:       `En yüksek sapma: %${round2(inputs.maxBurdenScoreAbs * 100)} — eşitleme önerilir`,
      actionLabel:  'Waterfall Simüle Et',
      actionHref:   '/dashboard/partners',
      triggeredAt:  now,
      resolvedWhen: 'Ortak borç yükleri dengelendiğinde',
    })
  }

  // ── PARTNER_LOAN_DUE ───────────────────────────────────────────────────────
  if (inputs.nextTrancheDueDays >= 0 && inputs.nextTrancheDueDays <= 14) {
    alerts.push({
      id:           'PARTNER_LOAN_DUE',
      rule_type:    'PARTNER_LOAN_DUE',
      severity:     'critical',
      title:        `Ortak borç vadesi ${inputs.nextTrancheDueDays} gün içinde`,
      detail:       `${fmtK(inputs.nextTrancheAmount)} tranche vadesi yaklaşıyor`,
      actionLabel:  'Tranche Detayı',
      actionHref:   '/dashboard/partners',
      amount:       inputs.nextTrancheAmount,
      dueDate:      daysFromNow(inputs.nextTrancheDueDays),
      triggeredAt:  now,
      resolvedWhen: 'Tranche ödemesi yapıldığında veya vade geçtiğinde',
    })
  }

  // ── PERIOD_NOT_CLOSED ──────────────────────────────────────────────────────
  if (inputs.openPeriodDaysOverdue > 10) {
    alerts.push({
      id:           'PERIOD_NOT_CLOSED',
      rule_type:    'PERIOD_NOT_CLOSED',
      severity:     'warning',
      title:        `Dönem kapanışı ${inputs.openPeriodDaysOverdue} gün bekliyor`,
      detail:       'Açık dönem finansal tablolarınızı kirletiyor',
      actionLabel:  'Dönemi Kapat',
      actionHref:   '/dashboard/cfo/period-close',
      triggeredAt:  now,
      resolvedWhen: 'Muhasebe dönemi kapatıldığında',
    })
  }

  // ── TAX_DUE_SOON ───────────────────────────────────────────────────────────
  if (inputs.taxDueDays >= 0 && inputs.taxDueDays <= 7 && inputs.kdvPayable > 50) {
    alerts.push({
      id:           'TAX_DUE_SOON',
      rule_type:    'TAX_DUE_SOON',
      severity:     'critical',
      title:        `KDV beyanı ${inputs.taxDueDays} gün kaldı`,
      detail:       `Ödenecek KDV: ${fmtK(inputs.kdvPayable)}`,
      actionLabel:  'KDV Raporu',
      actionHref:   '/dashboard/cfo/tax/kdv',
      amount:       inputs.kdvPayable,
      triggeredAt:  now,
      resolvedWhen: 'KDV beyanı tamamlandığında',
    })
  }

  // ── KDV_LARGE ─────────────────────────────────────────────────────────────
  // Large accumulated KDV payable even when the declaration deadline is not yet
  // imminent. A company with ₺340K in undeclared KDV should see this in treasury —
  // that cash is not freely deployable even if the due date is 3 weeks away.
  // Only fires when TAX_DUE_SOON is NOT active (taxDueDays > 7 or -1)
  // to avoid duplicating the same KDV concern with different severity.
  const taxDueNotImminent = inputs.taxDueDays < 0 || inputs.taxDueDays > 7
  if (taxDueNotImminent && inputs.kdvPayable >= 50_000) {
    alerts.push({
      id:           'KDV_LARGE',
      rule_type:    'KDV_LARGE',
      severity:     'warning',
      title:        `${fmtK(inputs.kdvPayable)} KDV birikmekte`,
      detail:       'Bu tutar şirkete ait değil — beyan tarihi yaklaştığında nakit baskısı oluşabilir',
      actionLabel:  'KDV Raporu',
      actionHref:   '/dashboard/cfo/tax/kdv',
      amount:       inputs.kdvPayable,
      triggeredAt:  now,
      resolvedWhen: 'KDV beyan ve ödeme tamamlandığında',
    })
  }

  // ── BS_IMBALANCED ──────────────────────────────────────────────────────────
  if (inputs.bsImbalanceTry > 100) {
    alerts.push({
      id:           'BS_IMBALANCED',
      rule_type:    'BS_IMBALANCED',
      severity:     'critical',
      title:        'Bilanço dengesi bozuk',
      detail:       `${fmtK(inputs.bsImbalanceTry)} fark — muhasebe kaydı kontrol edilmeli`,
      actionLabel:  'Mizan Görüntüle',
      actionHref:   '/dashboard/cfo/trial-balance',
      amount:       inputs.bsImbalanceTry,
      triggeredAt:  now,
      resolvedWhen: 'Mizan dengelendiğinde',
    })
  }

  // ── LEGAL_RESERVE_LOW ─────────────────────────────────────────────────────
  if (inputs.legalReserveDeficit > 0) {
    alerts.push({
      id:           'LEGAL_RESERVE_LOW',
      rule_type:    'LEGAL_RESERVE_LOW',
      severity:     'warning',
      title:        'Yasal yedek eksik',
      detail:       `TTK 519: ${fmtK(inputs.legalReserveDeficit)} daha ayrılmalı`,
      actionLabel:  'Dönem Kapanış',
      actionHref:   '/dashboard/cfo/period-close',
      amount:       inputs.legalReserveDeficit,
      triggeredAt:  now,
      resolvedWhen: 'Yasal yedek yeterli seviyeye ulaştığında',
    })
  }

  // ── EQUITY_GAP_OVERDUE ─────────────────────────────────────────────────────
  if (inputs.equityGapTry > 0 && inputs.equityCallOverdueDays > 0) {
    alerts.push({
      id:           'EQUITY_GAP_OVERDUE',
      rule_type:    'EQUITY_GAP_OVERDUE',
      severity:     'warning',
      title:        `Ödenmemiş sermaye ${inputs.equityCallOverdueDays} gün gecikti`,
      detail:       `${fmtK(inputs.equityGapTry)} taahhüt edilmemiş — TTK 588 faiz işler`,
      actionLabel:  'Ortak Sermaye',
      actionHref:   '/dashboard/partners',
      amount:       inputs.equityGapTry,
      triggeredAt:  now,
      resolvedWhen: 'Sermaye taahhüdü ödeme tamamen yapıldığında',
    })
  }

  // ── DSR_STRAINED ──────────────────────────────────────────────────────────
  // DSR > 0.50 but ≤ 0.70 is "strained" — company is spending more than half its
  // income on debt service. This is a clear warning sign even if not yet critical.
  // Fires independently from DSR_HIGH so companies don't miss the strained zone.
  if (inputs.debtServiceRatio > 0.50 && inputs.debtServiceRatio <= 0.70) {
    alerts.push({
      id:           'DSR_STRAINED',
      rule_type:    'DSR_STRAINED',
      severity:     'warning',
      title:        `Borç servis oranı yüksek: %${round2(inputs.debtServiceRatio * 100)}`,
      detail:       `Gelirinizin %${round2(inputs.debtServiceRatio * 100)} borç servise gidiyor — borç yeniden yapılandırmasını değerlendirin`,
      actionLabel:  'Waterfall Simülasyonu',
      actionHref:   '/dashboard/partners',
      triggeredAt:  now,
      resolvedWhen: 'Borç servis oranı %50\'nin altına düştüğünde',
    })
  }

  // ── DSR_HIGH ───────────────────────────────────────────────────────────────
  if (inputs.debtServiceRatio > 0.70) {
    alerts.push({
      id:           'DSR_HIGH',
      rule_type:    'DSR_HIGH',
      severity:     'critical',
      title:        `Borç servis oranı kritik: %${round2(inputs.debtServiceRatio * 100)}`,
      detail:       'Gelirinizin %70+ borç servise gidiyor',
      actionLabel:  'Borç Baskısı',
      actionHref:   '/dashboard/partners',
      triggeredAt:  now,
      resolvedWhen: 'Borç servis oranı %70\'in altına düştüğünde',
    })
  }

  // ── RECEIVABLE_CONCENTRATION ──────────────────────────────────────────────
  // Single customer holds >40% of total receivables — concentration risk
  if ((inputs.maxCustomerReceivableShare ?? 0) > 0.40 && inputs.totalReceivables > 0) {
    const pct = round2((inputs.maxCustomerReceivableShare ?? 0) * 100)
    alerts.push({
      id:           'RECEIVABLE_CONCENTRATION',
      rule_type:    'RECEIVABLE_CONCENTRATION',
      severity:     'warning',
      title:        `Alacak konsantrasyonu yüksek: %${pct}`,
      detail:       'Tek müşteri toplam alacakların %40+\'ını oluşturuyor — tahsilat riski',
      actionLabel:  'Tahsilat Sayfası',
      actionHref:   '/dashboard/commercial?tab=collections',
      amount:       round2((inputs.maxCustomerReceivableShare ?? 0) * inputs.totalReceivables),
      triggeredAt:  now,
      resolvedWhen: 'Alacak konsantrasyonu %40\'ın altına düştüğünde',
    })
  }

  // ── CONCENTRATION ──────────────────────────────────────────────────────────
  if (inputs.partnerLoanConcentration > 0.80) {
    alerts.push({
      id:           'CONCENTRATION',
      rule_type:    'CONCENTRATION',
      severity:     'warning',
      title:        `Borç konsantrasyonu yüksek: %${round2(inputs.partnerLoanConcentration * 100)}`,
      detail:       'Tek ortak toplam borcun %80+\'ini taşıyor',
      actionLabel:  'Tranche Analizi',
      actionHref:   '/dashboard/partners',
      triggeredAt:  now,
      resolvedWhen: 'Borç dağılımı %80\'in altına düştüğünde',
    })
  }

  // Sort: critical first, then warning, then info; within same severity by amount desc
  return alerts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

// ── CFO Accounting Accuracy Alerts ────────────────────────────────────────────

export function evaluateCFOAlerts(inputs: CFOAccuracyInputs, companyId: string): DecisionAlert[] {
  const alerts: DecisionAlert[] = []
  const now = new Date().toISOString()

  // ── BS_IMBALANCED (critical ≥ 1 TRY) ────────────────────────────────────
  if (inputs.trialBalanceImbalance >= 1.00) {
    alerts.push({
      id:           stableId('BS_IMBALANCED', null, companyId),
      rule_type:    'BS_IMBALANCED',
      severity:     'critical',
      title:        'Mizan dengeli değil — muhasebe hatası',
      detail:       `Mizan dengeli değil — muhasebe hatası (₺${inputs.trialBalanceImbalance.toFixed(2)})`,
      actionLabel:  'Mizan Görüntüle',
      actionHref:   '/dashboard/cfo/trial-balance',
      amount:       inputs.trialBalanceImbalance,
      triggeredAt:  now,
      resolvedWhen: 'Mizan dengeli olduğunda',
    })
  }

  // ── BS_ROUNDING (warning 0.01–0.99) ──────────────────────────────────────
  if (inputs.trialBalanceImbalance >= 0.01 && inputs.trialBalanceImbalance < 1.00) {
    alerts.push({
      id:           stableId('BS_ROUNDING', null, companyId),
      rule_type:    'BS_ROUNDING',
      severity:     'warning',
      title:        'Mizan\'da yuvarlama farkı',
      detail:       `Mizan'da yuvarlama farkı (₺${inputs.trialBalanceImbalance.toFixed(2)})`,
      actionLabel:  'Mizan Görüntüle',
      actionHref:   '/dashboard/cfo/trial-balance',
      amount:       inputs.trialBalanceImbalance,
      triggeredAt:  now,
      resolvedWhen: 'Yuvarlama farkı giderildiğinde',
    })
  }

  // ── BANK_RECONCILIATION_GAP ───────────────────────────────────────────────
  if (
    inputs.bankStatementBalance !== undefined &&
    Math.abs(inputs.cashBookBalance - inputs.bankStatementBalance) > 100
  ) {
    const gap = Math.abs(inputs.cashBookBalance - inputs.bankStatementBalance)
    alerts.push({
      id:           stableId('BANK_RECONCILIATION_GAP', null, companyId),
      rule_type:    'BANK_RECONCILIATION_GAP',
      severity:     'warning',
      title:        'Banka mutabakat farkı',
      detail:       `Kasa defteri ile banka ekstresi arasında ₺${gap.toFixed(2)} fark var`,
      actionLabel:  'Mutabakat',
      actionHref:   '/dashboard/cfo/reconciliation',
      amount:       gap,
      triggeredAt:  now,
      resolvedWhen: 'Banka mutabakatı tamamlandığında',
    })
  }

  // ── FIFO_INTEGRITY ────────────────────────────────────────────────────────
  if (inputs.fifoIntegrityIssues > 0) {
    alerts.push({
      id:           stableId('FIFO_INTEGRITY', null, companyId),
      rule_type:    'FIFO_INTEGRITY',
      severity:     'critical',
      title:        'Negatif stok lot tespit edildi',
      detail:       `Negatif stok lot tespit edildi (${inputs.fifoIntegrityIssues} adet)`,
      actionLabel:  'Stok Raporu',
      actionHref:   '/dashboard/inventory',
      amount:       inputs.fifoIntegrityIssues,
      triggeredAt:  now,
      resolvedWhen: 'Tüm negatif stok lotları düzeltildiğinde',
    })
  }

  // ── LEGAL_RESERVE_SHORTFALL ───────────────────────────────────────────────
  if (inputs.legalReserveShortfall > 0) {
    alerts.push({
      id:           stableId('LEGAL_RESERVE_SHORTFALL', null, companyId),
      rule_type:    'LEGAL_RESERVE_SHORTFALL',
      severity:     'warning',
      title:        'Yasal yedek eksik',
      detail:       `Yasal yedek eksik (₺${inputs.legalReserveShortfall.toFixed(2)})`,
      actionLabel:  'Dönem Kapanış',
      actionHref:   '/dashboard/cfo/period-close',
      amount:       inputs.legalReserveShortfall,
      triggeredAt:  now,
      resolvedWhen: 'Yasal yedek yeterli seviyeye ayrıldığında',
    })
  }

  return alerts.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

// ── Exported Pure Helpers ─────────────────────────────────────────────────

/**
 * Classify alert severity based on days overdue and amount.
 * - critical: daysOverdue > 60 and amount > 500, OR daysOverdue > 30 and amount > 10_000
 * - warning:  daysOverdue > 0 and amount > 0
 * - info:     everything else (including 0/negative inputs)
 */
export function classifyAlertSeverity(daysOverdue: number, amount: number): 'info' | 'warning' | 'critical' {
  if (daysOverdue <= 0 || amount <= 0) return 'info'
  if (daysOverdue > 60 && amount > 500) return 'critical'
  if (daysOverdue > 30 && amount > 10_000) return 'critical'
  return 'warning'
}

/**
 * Build a stable alert ID: `${type}_${resourceId}`.
 * Spaces in either argument are replaced with underscores.
 */
export function buildAlertId(type: string, resourceId: string): string {
  const safeType = type.replace(/\s+/g, '_')
  const safeId   = resourceId.replace(/\s+/g, '_')
  return `${safeType}_${safeId}`
}

/**
 * Sort alerts: critical first, then warning, then info.
 * Within the same severity, sort by amount descending (undefined amount = 0).
 * Returns a new array; does not mutate the input.
 */
export function sortAlertsByPriority(alerts: DecisionAlert[]): DecisionAlert[] {
  return [...alerts].sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sevDiff !== 0) return sevDiff
    return (b.amount ?? 0) - (a.amount ?? 0)
  })
}

// ── Private Helpers ────────────────────────────────────────────────────────

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
