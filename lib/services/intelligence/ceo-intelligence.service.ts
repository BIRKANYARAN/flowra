// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/intelligence/ceo-intelligence.service.ts
//
// CEO Intelligence Panel — multi-signal aggregation with health scoring.
// Queries 8 signal sources in parallel (Promise.allSettled) and synthesizes
// a unified executive intelligence brief.
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { CashFlowPredictionService } from '@/lib/services/cashflow/cashflow-prediction.service'
import { WorkingCapitalService }     from '@/lib/services/finance/working-capital.service'
import { TaxCalendarService }        from '@/lib/services/tax/tax-calendar.service'
import { AuditReadinessService }     from '@/lib/services/governance/audit-readiness.service'
import { NarrativeService }          from '@/lib/services/intelligence/narrative.service'
import { CustomerIntelligenceService } from '@/lib/services/commercial/customer-intelligence.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface IntelligenceSignal {
  signal_id:     string
  source:        'cash_flow' | 'working_capital' | 'customer_risk' | 'governance' | 'tax' | 'partner_debt' | 'document_gaps'
  severity:      'critical' | 'warning' | 'info'
  headline:      string           // one sentence, Turkish
  detail:        string           // one paragraph, Turkish
  metric?:       string           // key number (e.g. "₺1.2M")
  metric_label?: string
  trend?:        'up' | 'down' | 'stable'
  action_label?: string
  action_url?:   string
  computed_at:   string
}

export interface CeoIntelligencePanel {
  signals:           IntelligenceSignal[]
  critical_count:    number
  warning_count:     number
  overall_health:    'excellent' | 'good' | 'attention' | 'critical'
  narrative_headline: string
  top_metric: {
    value:   string
    label:   string
    context: string
  }
  computed_at: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₺${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}₺${Math.round(abs / 1_000)}K`
  return `${sign}₺${Math.round(abs).toLocaleString('tr-TR')}`
}

function computeHealth(criticals: number, warnings: number): CeoIntelligencePanel['overall_health'] {
  if (criticals >= 2)                             return 'critical'
  if (criticals === 1)                            return 'attention'
  if (criticals === 0 && warnings > 2)            return 'attention'
  if (criticals === 0 && warnings <= 2 && warnings > 0) return 'good'
  return 'excellent'
}

function currentMonthPeriod(today: string): { from: string; to: string } {
  const from = today.slice(0, 7) + '-01'
  return { from, to: today }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CeoIntelligenceService {
  static async getPanel(
    companyId: string,
    uid:       string,
    supabase:  AnyClient,
    opts?:     { today?: string },
  ): Promise<CeoIntelligencePanel> {
    const today   = opts?.today ?? new Date().toISOString().slice(0, 10)
    const period  = currentMonthPeriod(today)
    const now     = new Date().toISOString()

    // ── Parallel signal fetches ────────────────────────────────────────────────
    const [
      cashFlowResult,
      customerRiskResult,
      workingCapitalResult,
      taxCalendarResult,
      auditResult,
      partnerDebtResult,
      pendingResolutionsResult,
      narrativeResult,
    ] = await Promise.allSettled([

      // 1. Cash flow prediction
      CashFlowPredictionService.predict(companyId, uid, supabase, { today }),

      // 2. Customer payment profiles
      CustomerIntelligenceService.getProfiles(companyId, supabase, { today }),

      // 3. Working capital metrics
      WorkingCapitalService.compute(companyId, uid, supabase, period),

      // 4. Tax calendar (3-month horizon)
      TaxCalendarService.getCalendar(companyId, uid, supabase, { today, horizon: 3 }),

      // 5. Audit readiness
      AuditReadinessService.compute(companyId, supabase),

      // 6. Partner loan tranches (DSR proxy)
      (supabase as SupabaseClient)
        .from('partner_loan_tranches')
        // outstanding_try computed (no such column): principal_try − total_repaid_try
        .select('principal_try, total_repaid_try, annual_interest_rate, expected_repayment_date')
        .eq('company_id', companyId)
        .eq('status', 'active'),

      // 7. Pending resolutions count (real table: governance_resolutions;
      // its status enum is draft|approved|rejected|implemented — 'draft' = not yet finalized)
      (supabase as SupabaseClient)
        .from('governance_resolutions')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['draft']),

      // 8. Financial narrative for current month
      NarrativeService.generatePeriodNarrative(companyId, uid, supabase, period),
    ])

    const signals: IntelligenceSignal[] = []

    // ── Signal 1: Cash flow prediction ────────────────────────────────────────
    if (cashFlowResult.status === 'fulfilled') {
      const cf = cashFlowResult.value
      const end30  = cf.periods.days_30.ending_cash_base_try
      const end60  = cf.periods.days_60.ending_cash_base_try

      if (end30 < 0) {
        signals.push({
          signal_id:    'cash_negative_30d',
          source:       'cash_flow',
          severity:     'critical',
          headline:     '30 gün içinde nakit pozisyonu negatife düşüyor.',
          detail:       `Baz senaryoya göre 30 günlük nakit tahmini: ${fmtCompact(end30)}. Acil nakit girişi veya gider kesintisi gerekiyor.`,
          metric:       fmtCompact(end30),
          metric_label: '30g sonu nakit',
          trend:        'down',
          action_label: 'Nakit Tahminini Gör',
          action_url:   '/dashboard/finance?tab=cashflow',
          computed_at:  now,
        })
      } else if (end60 < 0) {
        signals.push({
          signal_id:    'cash_negative_60d',
          source:       'cash_flow',
          severity:     'critical',
          headline:     '60 gün içinde nakit pozisyonu negatife düşüyor.',
          detail:       `30 günlük nakit pozitif (${fmtCompact(end30)}) ancak 60. gün sonu negatif (${fmtCompact(end60)}). Önlem alınmalı.`,
          metric:       fmtCompact(end60),
          metric_label: '60g sonu nakit',
          trend:        'down',
          action_label: 'Nakit Tahminini Gör',
          action_url:   '/dashboard/finance?tab=cashflow',
          computed_at:  now,
        })
      } else {
        // Check for pessimistic 30d negative
        const pessEnd30 = cf.scenarios.pessimistic.ending_cash_30_try
        if (pessEnd30 < 0) {
          signals.push({
            signal_id:    'cash_pess_warning_30d',
            source:       'cash_flow',
            severity:     'warning',
            headline:     'Kötümser senaryoda 30 günlük nakit riski var.',
            detail:       `Baz senaryo pozitif (${fmtCompact(cf.periods.days_30.ending_cash_base_try)}) ancak kötümser senaryo ${fmtCompact(pessEnd30)} ile negatife düşüyor.`,
            metric:       fmtCompact(cf.starting_cash_try),
            metric_label: 'Mevcut nakit',
            trend:        'stable',
            action_label: 'Nakit Tahminini Gör',
            action_url:   '/dashboard/finance?tab=cashflow',
            computed_at:  now,
          })
        }
      }
    }

    // ── Signal 2: Customer risk ────────────────────────────────────────────────
    if (customerRiskResult.status === 'fulfilled') {
      const profiles = customerRiskResult.value
      const totalOutstanding = profiles.reduce((s, p) => s + p.total_outstanding_try, 0)
      const criticalOutstanding = profiles
        .filter(p => p.risk_tier === 'critical')
        .reduce((s, p) => s + p.overdue_amount_try, 0)

      if (totalOutstanding > 0 && criticalOutstanding / totalOutstanding > 0.2) {
        const pct = Math.round((criticalOutstanding / totalOutstanding) * 100)
        signals.push({
          signal_id:    'customer_risk_critical',
          source:       'customer_risk',
          severity:     'warning',
          headline:     `Alacakların %${pct}'i kritik risk müşterilerinde takılı.`,
          detail:       `Toplam ${fmtCompact(totalOutstanding)} alacaktan ${fmtCompact(criticalOutstanding)} (%${pct}) kritik riskli müşterilerde — tahsilat takibi gerekiyor.`,
          metric:       fmtCompact(criticalOutstanding),
          metric_label: 'Riskli alacak',
          trend:        'down',
          action_label: 'Müşteri Riskini Gör',
          action_url:   '/dashboard/commercial/customers',
          computed_at:  now,
        })
      }
    }

    // ── Signal 3: Working capital (CCC) ───────────────────────────────────────
    if (workingCapitalResult.status === 'fulfilled') {
      const wc = workingCapitalResult.value
      const ccc = wc.ccc_days

      if (ccc !== null) {
        if (ccc > 90) {
          signals.push({
            signal_id:    'ccc_critical',
            source:       'working_capital',
            severity:     'critical',
            headline:     `Nakit dönüşüm döngüsü ${Math.round(ccc)} gün — kritik seviyede.`,
            detail:       `CCC ${Math.round(ccc)} gün ile kritik seviyede. DSO: ${wc.dso_days !== null ? Math.round(wc.dso_days) : 'N/A'} gün. Çalışma sermayesi yönetimi acilen önceliklendirilmeli.`,
            metric:       `${Math.round(ccc)} gün`,
            metric_label: 'CCC',
            trend:        'down',
            action_label: 'Çalışma Sermayesini Gör',
            action_url:   '/dashboard/finance?tab=working-capital',
            computed_at:  now,
          })
        } else if (ccc > 60) {
          signals.push({
            signal_id:    'ccc_warning',
            source:       'working_capital',
            severity:     'warning',
            headline:     `Nakit dönüşüm döngüsü ${Math.round(ccc)} gün — iyileştirme önerilir.`,
            detail:       `CCC ${Math.round(ccc)} gün. DSO düşürülürse nakit pozisyonu iyileşebilir.`,
            metric:       `${Math.round(ccc)} gün`,
            metric_label: 'CCC',
            trend:        wc.dso_trend === 'deteriorating' ? 'down' : 'stable',
            action_label: 'Çalışma Sermayesini Gör',
            action_url:   '/dashboard/finance?tab=working-capital',
            computed_at:  now,
          })
        }
      }
    }

    // ── Signal 4: Tax calendar ─────────────────────────────────────────────────
    if (taxCalendarResult.status === 'fulfilled') {
      const tc = taxCalendarResult.value
      const overdueObs = tc.obligations.filter(o => o.status === 'overdue')
      const dueSoonObs = tc.obligations.filter(o => o.days_remaining >= 0 && o.days_remaining <= 7)

      if (overdueObs.length > 0) {
        const total = overdueObs.reduce((s, o) => s + (o.estimated_amount_try ?? 0), 0)
        signals.push({
          signal_id:    'tax_overdue',
          source:       'tax',
          severity:     'critical',
          headline:     `${overdueObs.length} adet vergi yükümlülüğü vadesi geçmiş.`,
          detail:       `${overdueObs.map(o => o.label).join(', ')} vadesi geçmiş. Toplam tahmini tutar: ${fmtCompact(total)}. Gecikme cezası riski var.`,
          metric:       fmtCompact(total),
          metric_label: 'Tahmini vergi borcu',
          trend:        'down',
          action_label: 'Vergi Takvimini Gör',
          action_url:   '/dashboard/cfo/tax-calendar',
          computed_at:  now,
        })
      } else if (dueSoonObs.length > 0) {
        const minDays = Math.min(...dueSoonObs.map(o => o.days_remaining))
        signals.push({
          signal_id:    'tax_due_soon',
          source:       'tax',
          severity:     'warning',
          headline:     `${dueSoonObs.length} adet vergi yükümlülüğü ${minDays} gün içinde vadesi geliyor.`,
          detail:       `${dueSoonObs.map(o => `${o.label} (${o.days_remaining}g)`).join(', ')} yakında vadesi geliyor.`,
          metric:       `${minDays} gün`,
          metric_label: 'En yakın son gün',
          trend:        'stable',
          action_label: 'Vergi Takvimini Gör',
          action_url:   '/dashboard/cfo/tax-calendar',
          computed_at:  now,
        })
      }
    }

    // ── Signal 5: Governance (audit readiness + resolutions) ──────────────────
    if (auditResult.status === 'fulfilled') {
      const score = auditResult.value.score
      if (score < 60) {
        signals.push({
          signal_id:    'audit_score_low',
          source:       'governance',
          severity:     'warning',
          headline:     `Denetim hazırlık skoru ${score}/100 — iyileştirme gerekiyor.`,
          detail:       `Denetim hazırlık skoru ${score}/100. Minimum 60 puan önerilir. Eksik belgeler ve onaylanmamış kontroller var.`,
          metric:       `${score}/100`,
          metric_label: 'Denetim skoru',
          trend:        'down',
          action_label: 'Denetim Raporunu Gör',
          action_url:   '/dashboard/cfo/governance?tab=audit',
          computed_at:  now,
        })
      }
    }

    if (pendingResolutionsResult.status === 'fulfilled') {
      const count = (pendingResolutionsResult.value as { count: number | null }).count ?? 0
      if (count > 2) {
        signals.push({
          signal_id:    'pending_resolutions',
          source:       'governance',
          severity:     'info',
          headline:     `${count} adet bekleyen karar var.`,
          detail:       `${count} adet taslak/bekleyen kurul kararı mevcut. İmzalanmamış kararlar hukuki risk yaratabilir.`,
          metric:       String(count),
          metric_label: 'Bekleyen karar',
          trend:        'stable',
          action_label: 'Kararları Gör',
          action_url:   '/dashboard/cfo/governance?tab=resolutions',
          computed_at:  now,
        })
      }
    }

    // ── Signal 6: Partner debt (DSR) ──────────────────────────────────────────
    if (partnerDebtResult.status === 'fulfilled') {
      const rows = ((partnerDebtResult.value as { data: Array<{ principal_try: number; total_repaid_try: number; annual_interest_rate: number | null; expected_repayment_date: string | null }> | null }).data ?? [])
        .map(r => ({ ...r, outstanding_try: Math.max(0, Number(r.principal_try ?? 0) - Number(r.total_repaid_try ?? 0)) }))
      const totalDebt = rows.reduce((s, r) => s + Number(r.outstanding_try ?? 0), 0)

      // Check for overdue tranches
      const overdueRows = rows.filter(r => r.expected_repayment_date && r.expected_repayment_date < today)

      if (overdueRows.length > 0) {
        const overdueAmt = overdueRows.reduce((s, r) => s + Number(r.outstanding_try ?? 0), 0)
        signals.push({
          signal_id:    'partner_debt_overdue',
          source:       'partner_debt',
          severity:     'warning',
          headline:     `${overdueRows.length} adet ortak borç taksidi vadesi geçmiş.`,
          detail:       `Toplam ${fmtCompact(overdueAmt)} tutarında ortak borç taksidi vadesi geçmiş. Faiz tahakkukları artıyor.`,
          metric:       fmtCompact(overdueAmt),
          metric_label: 'Vadesi geçmiş ortak borcu',
          trend:        'down',
          action_label: 'Ortak Borçlarını Gör',
          action_url:   '/dashboard/partners?tab=loans',
          computed_at:  now,
        })
      } else if (totalDebt > 0) {
        // Compute rough DSR: monthly interest vs estimated monthly income
        const monthlyInterest = rows.reduce((s, r) => {
          const rate = Number(r.annual_interest_rate ?? 0)
          return s + (Number(r.outstanding_try) * (rate > 0 ? rate : 0.12) / 12)
        }, 0)
        // DSR > 0.7 is a warning (rough: if monthly interest > 70% of total debt / 12)
        const dsr = totalDebt > 0 ? monthlyInterest / (totalDebt / 12) : 0
        if (dsr > 0.7) {
          signals.push({
            signal_id:    'partner_dsr_high',
            source:       'partner_debt',
            severity:     'warning',
            headline:     'Ortak borç servis oranı yüksek.',
            detail:       `Ortak borçları toplamı ${fmtCompact(totalDebt)}. Aylık tahmini faiz yükü yüksek seyrediliyor.`,
            metric:       fmtCompact(totalDebt),
            metric_label: 'Toplam ortak borcu',
            trend:        'stable',
            action_label: 'Ortak Borçlarını Gör',
            action_url:   '/dashboard/partners?tab=loans',
            computed_at:  now,
          })
        }
      }
    }

    // ── Signal 7: Document gaps (audit readiness sub-check) ───────────────────
    if (auditResult.status === 'fulfilled') {
      const cats = auditResult.value.categories
      const accountingPct = cats.accounting.total > 0
        ? cats.accounting.passed / cats.accounting.total
        : 1
      if (accountingPct < 0.5) {
        signals.push({
          signal_id:    'document_gaps',
          source:       'document_gaps',
          severity:     'warning',
          headline:     'Muhasebe denetim kontrollerinin yarısından azı geçti.',
          detail:       `Muhasebe kategorisinde ${cats.accounting.passed}/${cats.accounting.total} kontrol geçti. Belge eksiklikleri denetim riskini artırıyor.`,
          metric:       `${cats.accounting.passed}/${cats.accounting.total}`,
          metric_label: 'Muhasebe kontrolü',
          trend:        'down',
          action_label: 'Denetim Hazırlığını Gör',
          action_url:   '/dashboard/cfo/governance?tab=audit',
          computed_at:  now,
        })
      }
    }

    // ── Sort signals: critical → warning → info ────────────────────────────────
    const severityOrder: Record<IntelligenceSignal['severity'], number> = {
      critical: 0,
      warning:  1,
      info:     2,
    }
    signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    const criticalCount = signals.filter(s => s.severity === 'critical').length
    const warningCount  = signals.filter(s => s.severity === 'warning').length

    // ── Narrative headline ─────────────────────────────────────────────────────
    let narrativeHeadline = 'Finansal durum değerlendirmesi hazırlanıyor.'
    if (narrativeResult.status === 'fulfilled') {
      narrativeHeadline = narrativeResult.value.headline
    }

    // ── Top metric: most severe signal's metric, or first cash figure ─────────
    const topSignal = signals.find(s => s.metric && s.metric_label)
    const topMetric: CeoIntelligencePanel['top_metric'] = topSignal
      ? {
          value:   topSignal.metric!,
          label:   topSignal.metric_label!,
          context: topSignal.headline,
        }
      : narrativeResult.status === 'fulfilled'
        ? {
            value:   `₺${(narrativeResult.value.key_numbers.revenue_try / 1_000_000).toFixed(1)}M`,
            label:   'Dönem Cirosu',
            context: narrativeResult.value.period_label,
          }
        : { value: '—', label: 'Veri yok', context: 'Veriler yükleniyor' }

    return {
      signals,
      critical_count:    criticalCount,
      warning_count:     warningCount,
      overall_health:    computeHealth(criticalCount, warningCount),
      narrative_headline: narrativeHeadline,
      top_metric:        topMetric,
      computed_at:       now,
    }
  }
}
