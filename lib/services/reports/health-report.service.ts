// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/reports/health-report.service.ts
//
// Company Financial Health Report — comprehensive one-page printable summary.
//
// Pulls data from existing services (BalanceSheetService, FinanceService,
// PartnerService) using Promise.allSettled so a single service failure never
// blocks the full report.
//
// Scoring model (weighted average):
//   Liquidity          30%
//   Profitability      25%
//   Receivables        20%
//   Partner obligations 15%
//   Operational        10%
//
// Grade → score mapping: A=100, B=80, C=60, D=40, F=20
// Overall: ≥90=A, ≥75=B, ≥60=C, ≥45=D, <45=F
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { FinanceService }      from '@/lib/services/finance.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'
import { PartnerService }      from '@/lib/services/partner.service'
import { resolveCompanyId }    from '@/lib/resolve-company'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ──────────────────────────────────────────────────────────────

export interface HealthReportSection {
  title: string
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  score: number | null   // 0-100 (gradeToScore result or null if data missing)
  key_metrics: Array<{
    label:  string
    value:  string       // pre-formatted (fmtTRY, %, etc.)
    status: 'good' | 'warning' | 'critical' | 'neutral'
  }>
  insight: string        // Turkish one-sentence insight
}

export interface CompanyHealthReport {
  company_name:    string
  report_date:     string  // ISO date
  period_label:    string  // e.g. 'Mayıs 2026'
  overall_grade:   'A' | 'B' | 'C' | 'D' | 'F'
  overall_score:   number  // 0-100 weighted average
  sections: {
    liquidity:            HealthReportSection
    profitability:        HealthReportSection
    receivables:          HealthReportSection
    partner_obligations:  HealthReportSection
    operational:          HealthReportSection
  }
  executive_summary: string
  generated_by:      string
  disclaimer:        string
}

// ── Pure helpers (exported) ───────────────────────────────────────────────────

/** Map a grade letter to its numeric score. A=100 … F=20. */
export function gradeToScore(grade: 'A' | 'B' | 'C' | 'D' | 'F'): number {
  switch (grade) {
    case 'A': return 100
    case 'B': return 80
    case 'C': return 60
    case 'D': return 40
    case 'F': return 20
  }
}

/** Map a numeric score (0–100) to a grade letter. */
export function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 45) return 'D'
  return 'F'
}

/**
 * Compute the weighted average of section scores.
 * Null scores are skipped; their weight is redistributed among valid scores.
 * Returns 0 when every section score is null.
 */
export function computeWeightedScore(
  sections: Array<{ score: number | null; weight: number }>,
): number {
  let weightedSum  = 0
  let validWeight  = 0

  for (const s of sections) {
    if (s.score !== null) {
      weightedSum += s.score * s.weight
      validWeight += s.weight
    }
  }

  if (validWeight === 0) return 0
  return Math.round(weightedSum / validWeight)
}

/** Build a 2-3 sentence Turkish executive summary from the overall grade + sections. */
export function buildExecutiveSummary(
  overallGrade: string,
  sections: CompanyHealthReport['sections'],
): string {
  // Collect weak sections for negative detail
  const weaknesses: string[] = []
  if (sections.liquidity.grade === 'D' || sections.liquidity.grade === 'F')
    weaknesses.push('nakit akışı zayıf')
  if (sections.profitability.grade === 'D' || sections.profitability.grade === 'F')
    weaknesses.push('karlılık yetersiz')
  if (sections.receivables.grade === 'D' || sections.receivables.grade === 'F')
    weaknesses.push('alacak tahsilat sorunu var')
  if (sections.partner_obligations.grade === 'D' || sections.partner_obligations.grade === 'F')
    weaknesses.push('ortak borç yükü yüksek')
  if (sections.operational.grade === 'D' || sections.operational.grade === 'F')
    weaknesses.push('gider oranı kritik seviyede')

  const top2 = weaknesses.slice(0, 2)

  switch (overallGrade) {
    case 'A':
      return 'Şirket mali açıdan sağlıklı durumda. Nakit akışı güçlü ve alacaklar düzenli tahsil ediliyor. Mevcut performansın korunması ve büyüme fırsatlarının değerlendirilmesi önerilir.'
    case 'B':
      if (top2.length > 0)
        return `Genel mali durum iyi seviyede. ${cap(top2.join(' ve '))} konusunda iyileştirme yapılması halinde A seviyesine ulaşılabilir. Güçlü alanlar sürdürülmeli, zayıf noktalar takip edilmeli.`
      return 'Genel mali durum iyi seviyede. Temel finansal göstergeler sağlıklı seyrediyor. Sürekli izleme ile mevcut performans korunabilir.'
    case 'C':
      if (top2.length > 0)
        return `Mali performans orta düzeyde, dikkat gerektiren alanlar mevcut. Özellikle ${top2.join(' ve ')} konularında aksiyon alınması gerekiyor. Düzeltici önlemler alınmaz ise durum kötüleşebilir.`
      return 'Mali performans orta düzeyde. Finansal göstergeler izlenmeli ve iyileştirici adımlar atılmalı. Uzman finansal danışmanlık önerilir.'
    case 'D':
      if (top2.length > 0)
        return `Ciddi finansal baskı işaretleri var. ${cap(top2.join(' ve '))} acil müdahale gerektiriyor. Kısa vadeli nakit planlaması ve gider optimizasyonu önceliklendirilmeli.`
      return 'Ciddi finansal baskı işaretleri var. Acil nakit planlaması yapılmalı ve giderler kısılmalıdır. Uzman finansal destek alınması önerilir.'
    case 'F':
      if (top2.length > 0)
        return `Kritik finansal baskı altında. ${cap(top2.join(' ve '))} acilen ele alınmalı. Acil nakit yönetimi ve alacak tahsilat önceliklendirilmeli; gerekirse dış finansman aranmalıdır.`
      return 'Kritik finansal baskı altında. Acil nakit yönetimi ve alacak tahsilat önceliklendirilmeli. Gerekirse dış finansman aranmalı ve yapısal önlemler gündeme alınmalıdır.'
    default:
      return 'Mali durum değerlendirmesi tamamlandı. Ayrıntılar için rapor bölümlerini inceleyiniz.'
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function fmtNum(n: number, decimals = 2): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n)
}

function fmtTRY(n: number): string {
  return '₺' + fmtNum(n, 0)
}

function fmtPct(n: number): string {
  return fmtNum(n, 1) + '%'
}

function periodLabel(date: string): string {
  const MONTHS_TR = [
    'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
    'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık',
  ]
  const d = new Date(date)
  return `${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`
}

// ── HealthReportService ───────────────────────────────────────────────────────

export class HealthReportService {
  /**
   * Generate a CompanyHealthReport for the given company.
   *
   * All data fetches are wrapped with Promise.allSettled — a single service
   * failure produces null data for that section, not a thrown error.
   */
  static async generate(
    companyId: string,
    supabase:  AnyClient,
    userId?:   string,
  ): Promise<CompanyHealthReport> {
    const today    = new Date().toISOString().slice(0, 10)
    const yearStart = today.slice(0, 4) + '-01-01'

    // Resolve company name (best-effort)
    let companyName = 'Şirket'
    try {
      const { data } = await supabase
        .from('companies')
        .select('name')
        .eq('id', companyId)
        .single()
      if (data?.name) companyName = data.name
    } catch { /* silent */ }

    const resolvedUserId = userId ?? ''

    // ── Parallel data fetch ────────────────────────────────────────────────────
    const [
      fsResult,
      bsResult,
      receivablesResult,
      overdueResult,
      partnerBalancesResult,
      expensesResult,
    ] = await Promise.allSettled([
      // Financial summary for this year-to-date
      FinanceService.getFinancialSummary(
        resolvedUserId, companyId,
        { from: yearStart, to: today },
        undefined, undefined, supabase,
      ),

      // Balance sheet as of today
      BalanceSheetService.compute(resolvedUserId, companyId, today, supabase),

      // All outstanding receivables
      supabase
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount, sale_date, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .in('payment_status', ['pending', 'partial', 'overdue'])
        .lte('sale_date', today),

      // Overdue receivables (explicitly overdue status)
      supabase
        .from('sales')
        .select('total_try:total, amount_paid:paid_amount')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .eq('payment_status', 'overdue'),

      // Partner balances for obligation metrics
      PartnerService.getPartnerBalances(resolvedUserId, companyId),

      // Monthly expense total (last 3 months for burn estimate)
      supabase
        .from('expenses')
        .select('amount_try, expense_date')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', (() => {
          const d = new Date(); d.setMonth(d.getMonth() - 3)
          return d.toISOString().slice(0, 10)
        })())
        .lte('expense_date', today),
    ])

    // ── Unpack results ─────────────────────────────────────────────────────────
    const fs     = fsResult.status           === 'fulfilled' ? fsResult.value           : null
    const bs     = bsResult.status           === 'fulfilled' ? bsResult.value           : null
    const recRaw = receivablesResult.status  === 'fulfilled' ? receivablesResult.value  : null
    const ovdRaw = overdueResult.status      === 'fulfilled' ? overdueResult.value      : null
    const pBal   = partnerBalancesResult.status === 'fulfilled' ? partnerBalancesResult.value : null
    const expRaw = expensesResult.status     === 'fulfilled' ? expensesResult.value     : null

    // ── LIQUIDITY section ──────────────────────────────────────────────────────
    const cashTRY       = bs ? Math.max(0, bs.assets.cash_try) : null
    const expRows       = (expRaw?.data ?? []) as Array<{ amount_try: number; expense_date: string }>
    const monthlyBurn   = expRows.length > 0
      ? expRows.reduce((s, e) => s + (e.amount_try ?? 0), 0) / 3
      : null

    const runwayMonths  = cashTRY !== null && monthlyBurn !== null && monthlyBurn > 0
      ? cashTRY / monthlyBurn
      : cashTRY !== null && (monthlyBurn === null || monthlyBurn === 0)
        ? 999 // effectively unlimited — no burn
        : null

    let liqGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null = null
    if (runwayMonths !== null) {
      if      (runwayMonths > 6)  liqGrade = 'A'
      else if (runwayMonths >= 4) liqGrade = 'B'
      else if (runwayMonths >= 2) liqGrade = 'C'
      else if (runwayMonths >= 1) liqGrade = 'D'
      else                        liqGrade = 'F'
    }

    const liqScore  = liqGrade ? gradeToScore(liqGrade) : null
    const liqMetrics: HealthReportSection['key_metrics'] = [
      {
        label:  'Nakit Pozisyonu',
        value:  cashTRY !== null ? fmtTRY(cashTRY) : 'Veri yok',
        status: cashTRY === null ? 'neutral' : cashTRY > 0 ? 'good' : 'critical',
      },
      {
        label:  'Nakit Vadesi (ay)',
        value:  runwayMonths === null ? 'Hesaplanamadı'
              : runwayMonths >= 999   ? '∞'
              : fmtNum(Math.min(runwayMonths, 99), 1),
        status: runwayMonths === null ? 'neutral'
              : runwayMonths > 6     ? 'good'
              : runwayMonths >= 3    ? 'warning'
              : 'critical',
      },
      {
        label:  'Aylık Gider (ort.)',
        value:  monthlyBurn !== null ? fmtTRY(monthlyBurn) : 'Veri yok',
        status: 'neutral',
      },
    ]

    const liquidity: HealthReportSection = {
      title:       'Likidite',
      grade:       liqGrade,
      score:       liqScore,
      key_metrics: liqMetrics,
      insight:     liqGrade === 'A' ? 'Nakit pozisyonu güçlü, kısa vadeli yükümlülükler karşılanabilir.'
                 : liqGrade === 'B' ? 'Nakit akışı yeterli, ancak yakın dönem takip edilmeli.'
                 : liqGrade === 'C' ? 'Nakit vadesi kısıtlı; gider kontrolü ve tahsilat hızlandırılmalı.'
                 : liqGrade === 'D' ? 'Nakit riski var; acil nakit yönetimi planlanmalı.'
                 : liqGrade === 'F' ? 'Kritik nakit sıkışıklığı; acil finansman gerekebilir.'
                 : 'Likidite verisi yetersiz.',
    }

    // ── PROFITABILITY section ──────────────────────────────────────────────────
    const revenue     = fs?.revenue_try       ?? null
    const grossProfit = fs?.gross_profit_try  ?? null
    const netIncome   = fs?.net_after_tax_try ?? null
    const grossMargin = revenue && revenue > 0 && grossProfit !== null
      ? (grossProfit / revenue) * 100 : null
    const netMargin   = revenue && revenue > 0 && netIncome !== null
      ? (netIncome   / revenue) * 100 : null

    let profGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null = null
    if (netMargin !== null) {
      if      (netMargin > 20) profGrade = 'A'
      else if (netMargin > 10) profGrade = 'B'
      else if (netMargin > 5)  profGrade = 'C'
      else if (netMargin > 0)  profGrade = 'D'
      else                     profGrade = 'F'
    }

    const profScore = profGrade ? gradeToScore(profGrade) : null
    const profitability: HealthReportSection = {
      title: 'Karlılık',
      grade: profGrade,
      score: profScore,
      key_metrics: [
        {
          label:  'Net Marj',
          value:  netMargin !== null ? fmtPct(netMargin) : 'Veri yok',
          status: netMargin === null ? 'neutral'
                : netMargin > 10    ? 'good'
                : netMargin > 0     ? 'warning'
                : 'critical',
        },
        {
          label:  'Brüt Marj',
          value:  grossMargin !== null ? fmtPct(grossMargin) : 'Veri yok',
          status: grossMargin === null ? 'neutral'
                : grossMargin > 30    ? 'good'
                : grossMargin > 10    ? 'warning'
                : 'critical',
        },
        {
          label:  'Net Kâr (YTD)',
          value:  netIncome !== null ? fmtTRY(netIncome) : 'Veri yok',
          status: netIncome === null ? 'neutral' : netIncome >= 0 ? 'good' : 'critical',
        },
      ],
      insight: profGrade === 'A' ? 'Karlılık güçlü; şirket değeri yaratmaya devam ediyor.'
             : profGrade === 'B' ? 'Karlılık iyi seviyede, optimize etme fırsatları değerlendirilebilir.'
             : profGrade === 'C' ? 'Marjlar dar; fiyatlama ve maliyet yapısı gözden geçirilmeli.'
             : profGrade === 'D' ? 'Çok düşük karlılık; sürdürülebilirlik riski bulunuyor.'
             : profGrade === 'F' ? 'Zarar ediliyor; iş modeli acilen gözden geçirilmeli.'
             : 'Karlılık verisi yetersiz.',
    }

    // ── RECEIVABLES section ────────────────────────────────────────────────────
    type SaleRow = { total_try: number; amount_paid: number; sale_date?: string; payment_status?: string }
    const recRows  = (recRaw?.data ?? [])  as SaleRow[]
    const ovdRows  = (ovdRaw?.data ?? [])  as SaleRow[]

    const totalRec = recRows.reduce((s, r) =>
      s + Math.max(0, (r.total_try ?? 0) - (r.amount_paid ?? 0)), 0)
    const overdueAmt = ovdRows.reduce((s, r) =>
      s + Math.max(0, (r.total_try ?? 0) - (r.amount_paid ?? 0)), 0)
    const overdueRatePct = totalRec > 0 ? (overdueAmt / totalRec) * 100 : 0

    // DSO: approximate. If we have revenue, DSO = (receivables / daily_revenue).
    const dailyRevenue = revenue && revenue > 0
      ? revenue / (new Date().getFullYear() % 4 === 0 ? 366 : 365) : null
    const dso = dailyRevenue && totalRec > 0 ? totalRec / dailyRevenue : null

    let recGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null = null
    if (recRows.length > 0 || overdueAmt === 0) {
      if      (overdueRatePct < 10) recGrade = 'A'
      else if (overdueRatePct < 25) recGrade = 'B'
      else if (overdueRatePct < 40) recGrade = 'C'
      else if (overdueRatePct < 60) recGrade = 'D'
      else                          recGrade = 'F'
    }

    const recScore = recGrade ? gradeToScore(recGrade) : null
    const receivables: HealthReportSection = {
      title: 'Alacaklar',
      grade: recGrade,
      score: recScore,
      key_metrics: [
        {
          label:  'Toplam Alacak',
          value:  fmtTRY(totalRec),
          status: totalRec === 0 ? 'good' : 'neutral',
        },
        {
          label:  'Gecikmiş Oran',
          value:  fmtPct(overdueRatePct),
          status: overdueRatePct < 10 ? 'good'
                : overdueRatePct < 40 ? 'warning'
                : 'critical',
        },
        {
          label:  'Ortalama Tahsilat Süresi (gün)',
          value:  dso !== null ? fmtNum(dso, 0) + ' gün' : 'Hesaplanamadı',
          status: dso === null ? 'neutral' : dso < 30 ? 'good' : dso < 60 ? 'warning' : 'critical',
        },
      ],
      insight: recGrade === 'A' ? 'Alacaklar düzenli tahsil ediliyor, gecikme oranı düşük.'
             : recGrade === 'B' ? 'Alacak kalitesi iyi, küçük gecikme takibi yapılmalı.'
             : recGrade === 'C' ? 'Gecikmiş alacaklar artıyor; tahsilat süreçleri güçlendirilmeli.'
             : recGrade === 'D' ? 'Yüksek gecikme oranı; tahsilat önceliklendirilmeli.'
             : recGrade === 'F' ? 'Kritik alacak sorunu; yasal takip veya yapılandırma değerlendirilmeli.'
             : 'Alacak verisi yetersiz.',
    }

    // ── PARTNER OBLIGATIONS section ────────────────────────────────────────────
    type PartnerBal = { net_loan_try: number; share_ratio: number }
    const pRows         = (pBal ?? []) as PartnerBal[]
    const totalPartnerDebt = pRows.reduce((s, b) => s + Math.max(0, b.net_loan_try ?? 0), 0)

    // DSR: Debt Service Ratio = partner_debt / total_assets
    const totalAssets = bs?.assets.total_assets_try ?? null
    const dsr         = totalAssets && totalAssets > 0 ? totalPartnerDebt / totalAssets : null

    let partGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null = null
    if (dsr !== null) {
      if      (dsr < 0.2)  partGrade = 'A'
      else if (dsr < 0.35) partGrade = 'B'
      else if (dsr < 0.5)  partGrade = 'C'
      else if (dsr < 0.7)  partGrade = 'D'
      else                 partGrade = 'F'
    } else {
      // No assets data — fallback based on absolute debt amount
      partGrade = totalPartnerDebt === 0 ? 'A' : null
    }

    const partScore = partGrade ? gradeToScore(partGrade) : null
    const partnerObligations: HealthReportSection = {
      title: 'Ortak Yükümlülükleri',
      grade: partGrade,
      score: partScore,
      key_metrics: [
        {
          label:  'Toplam Ortak Borcu',
          value:  fmtTRY(totalPartnerDebt),
          status: totalPartnerDebt === 0 ? 'good'
                : totalPartnerDebt < 100_000 ? 'warning'
                : 'critical',
        },
        {
          label:  'Borç/Varlık Oranı',
          value:  dsr !== null ? fmtNum(dsr * 100, 1) + '%' : 'Hesaplanamadı',
          status: dsr === null ? 'neutral' : dsr < 0.35 ? 'good' : dsr < 0.7 ? 'warning' : 'critical',
        },
        {
          label:  'Ortak Sayısı',
          value:  String(pRows.length),
          status: 'neutral',
        },
      ],
      insight: partGrade === 'A' ? 'Ortak yükümlülükleri yönetilebilir düzeyde.'
             : partGrade === 'B' ? 'Ortak borçları makul; geri ödeme planına uyum kontrol edilmeli.'
             : partGrade === 'C' ? 'Ortak borç yükü belirgin; geri ödeme takvimi gözden geçirilmeli.'
             : partGrade === 'D' ? 'Yüksek ortak borç yükü; nakit çıkışı baskı yaratıyor.'
             : partGrade === 'F' ? 'Ortak borcu kritik seviyede; finansal yeniden yapılanma değerlendirilmeli.'
             : 'Ortak yükümlülük verisi yetersiz.',
    }

    // ── OPERATIONAL section ────────────────────────────────────────────────────
    const totalExpenses = fs?.expenses_total_try ?? null
    const expRatio      = revenue && revenue > 0 && totalExpenses !== null
      ? (totalExpenses / revenue) * 100 : null

    let opGrade: 'A' | 'B' | 'C' | 'D' | 'F' | null = null
    if (expRatio !== null) {
      if      (expRatio < 60) opGrade = 'A'
      else if (expRatio < 70) opGrade = 'B'
      else if (expRatio < 80) opGrade = 'C'
      else if (expRatio < 90) opGrade = 'D'
      else                    opGrade = 'F'
    }

    const opScore = opGrade ? gradeToScore(opGrade) : null
    const operational: HealthReportSection = {
      title: 'Operasyonel Verimlilik',
      grade: opGrade,
      score: opScore,
      key_metrics: [
        {
          label:  'Gider Oranı',
          value:  expRatio !== null ? fmtPct(expRatio) : 'Veri yok',
          status: expRatio === null ? 'neutral'
                : expRatio < 60    ? 'good'
                : expRatio < 80    ? 'warning'
                : 'critical',
        },
        {
          label:  'Toplam Gider (YTD)',
          value:  totalExpenses !== null ? fmtTRY(totalExpenses) : 'Veri yok',
          status: 'neutral',
        },
        {
          label:  'Ciro (YTD)',
          value:  revenue !== null ? fmtTRY(revenue) : 'Veri yok',
          status: revenue === null ? 'neutral' : revenue > 0 ? 'good' : 'warning',
        },
      ],
      insight: opGrade === 'A' ? 'Gider oranı verimli; operasyonel kaldıraç güçlü.'
             : opGrade === 'B' ? 'Gider kontrolü iyi seviyede, küçük tasarruflar mümkün.'
             : opGrade === 'C' ? 'Gider oranı yüksek; maliyet optimizasyonu gerekiyor.'
             : opGrade === 'D' ? 'Giderler ciroyu aşmak üzere; acil gider kısıntısı şart.'
             : opGrade === 'F' ? 'Giderler ciroyu büyük ölçüde aşıyor; iş modeli sürdürülemez.'
             : 'Operasyonel veri yetersiz.',
    }

    // ── WEIGHTED OVERALL SCORE ─────────────────────────────────────────────────
    const overallScore = computeWeightedScore([
      { score: liqScore,  weight: 30 },
      { score: profScore, weight: 25 },
      { score: recScore,  weight: 20 },
      { score: partScore, weight: 15 },
      { score: opScore,   weight: 10 },
    ])

    const overallGrade = scoreToGrade(overallScore)

    const sections = { liquidity, profitability, receivables, partner_obligations: partnerObligations, operational }

    return {
      company_name:      companyName,
      report_date:       today,
      period_label:      periodLabel(today),
      overall_grade:     overallGrade,
      overall_score:     overallScore,
      sections,
      executive_summary: buildExecutiveSummary(overallGrade, sections),
      generated_by:      'Flowra Finansal İşletim Sistemi',
      disclaimer:        'Bu rapor bilgi amaçlıdır ve resmi muhasebe belgesi olarak kullanılamaz. Tüm veriler Flowra sistemindeki kayıtlara dayanmaktadır.',
    }
  }
}
