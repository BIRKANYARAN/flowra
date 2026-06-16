// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/insight-engine.service.ts
//
// Rule-Based Insight Summary Engine — Phase A AI layer.
// Deterministic, no LLM, fully auditable.
// Produces Turkish business intelligence summaries.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightCategory = 'revenue' | 'expenses' | 'cash' | 'receivables' | 'partners' | 'general'
export type InsightSeverity = 'info' | 'warning' | 'critical' | 'positive'

export interface BusinessInsight {
  id: string               // stable: category_key
  category: InsightCategory
  severity: InsightSeverity
  title: string            // short Turkish title
  narrative: string        // full Turkish narrative (1-2 sentences)
  metric_value?: number    // the key number
  metric_label?: string    // what the number represents
  action_label?: string    // Turkish CTA
  action_href?: string
}

export interface InsightReport {
  company_id: string
  insights: BusinessInsight[]    // sorted: critical first, then warning, then positive, then info
  critical_count: number
  warning_count: number
  positive_count: number
  computed_at: string
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtTRY(value: number): string {
  if (value >= 1_000_000) return `₺${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000)     return `₺${(value / 1_000).toFixed(0)}B`
  return `₺${value.toFixed(0)}`
}

function fmtPct(value: number): string {
  return `%${value.toFixed(1)}`
}

// ── Revenue Insights ──────────────────────────────────────────────────────────

export interface RevenueInsightParams {
  trend_slope: number | null          // monthly slope from linear regression (TRY)
  trend_r_squared: number | null      // R² quality of fit
  current_month_revenue: number
  prior_month_revenue: number
  yoy_change_pct: number | null       // year-over-year change in percent (positive = growth)
}

export function generateRevenueInsights(params: RevenueInsightParams): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const {
    trend_slope,
    trend_r_squared,
    current_month_revenue,
    prior_month_revenue,
    yoy_change_pct,
  } = params

  // Positive trend: stable upward slope with good R²
  if (
    trend_slope !== null &&
    trend_r_squared !== null &&
    trend_slope > 0 &&
    trend_r_squared > 0.6
  ) {
    insights.push({
      id: 'revenue_positive_trend',
      category: 'revenue',
      severity: 'positive',
      title: 'Gelir Artış Eğilimi',
      narrative: `Gelir son aylarda istikrarlı artış eğiliminde — aylık ortalama ${fmtTRY(trend_slope)} büyüme.`,
      metric_value: trend_slope,
      metric_label: 'Aylık büyüme',
      action_label: 'Trend Raporu',
      action_href: '/dashboard/finance?tab=pnl',
    })
  }

  // Month-over-month spike: current > prior by more than 20%
  if (prior_month_revenue > 0) {
    const momChangePct = ((current_month_revenue - prior_month_revenue) / prior_month_revenue) * 100
    if (momChangePct > 20) {
      const diff = current_month_revenue - prior_month_revenue
      insights.push({
        id: 'revenue_mom_spike',
        category: 'revenue',
        severity: 'positive',
        title: 'Yüksek Aylık Büyüme',
        narrative: `Bu ay geçen aya göre ${fmtTRY(diff)} artış — en yüksek aylık büyüme son 6 ayda.`,
        metric_value: diff,
        metric_label: 'Aylık artış',
        action_label: 'Detay',
        action_href: '/dashboard/finance?tab=pnl',
      })
    }
  }

  // Year-over-year decline: current < last year by more than 10%
  if (yoy_change_pct !== null && yoy_change_pct < -10) {
    const absDiff = Math.abs(yoy_change_pct)
    insights.push({
      id: 'revenue_declining_yoy',
      category: 'revenue',
      severity: 'warning',
      title: 'Yıllık Gelir Geriledi',
      narrative: `Yılbaşından bu yana gelir geçen yılın gerisinde — ${fmtPct(absDiff)} fark.`,
      metric_value: absDiff,
      metric_label: 'YoY düşüş',
      action_label: 'Analiz Et',
      action_href: '/dashboard/finance?tab=pnl',
    })
  }

  return insights
}

// ── Expense Insights ──────────────────────────────────────────────────────────

export interface ExpenseInsightParams {
  expense_ratio_pct: number | null       // expenses / revenue * 100
  anomaly_count: number
  anomaly_total_try: number
  top_category: string | null
  top_category_pct: number | null
}

export function generateExpenseInsights(params: ExpenseInsightParams): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const {
    expense_ratio_pct,
    anomaly_count,
    anomaly_total_try,
    top_category,
    top_category_pct,
  } = params

  // Anomaly detected
  if (anomaly_count > 0) {
    insights.push({
      id: 'expenses_anomaly_detected',
      category: 'expenses',
      severity: 'warning',
      title: 'Şüpheli Masraf Tespit Edildi',
      narrative: `Bu ay ${anomaly_count} şüpheli masraf tespit edildi — toplam ${fmtTRY(anomaly_total_try)}.`,
      metric_value: anomaly_count,
      metric_label: 'Anomali sayısı',
      action_label: 'İncele',
      action_href: '/dashboard/operations?tab=expenses',
    })
  }

  // Critical expense ratio
  if (expense_ratio_pct !== null && expense_ratio_pct > 80) {
    const severity: InsightSeverity = expense_ratio_pct > 95 ? 'critical' : 'warning'
    insights.push({
      id: 'expenses_high_ratio',
      category: 'expenses',
      severity,
      title: 'Gider Oranı Kritik',
      narrative: `Gider oranı kritik seviyede: ${fmtPct(expense_ratio_pct)} — her ₺100 gelire karşı ₺${expense_ratio_pct.toFixed(0)} harcama.`,
      metric_value: expense_ratio_pct,
      metric_label: 'Gider oranı',
      action_label: 'Giderleri Gözden Geçir',
      action_href: '/dashboard/operations?tab=expenses',
    })
  }

  // Top category concentration
  if (top_category !== null && top_category_pct !== null && top_category_pct > 40) {
    insights.push({
      id: 'expenses_category_concentration',
      category: 'expenses',
      severity: 'info',
      title: 'Gider Konsantrasyonu',
      narrative: `${top_category} giderler toplam harcamanın ${fmtPct(top_category_pct)}'ini oluşturuyor.`,
      metric_value: top_category_pct,
      metric_label: top_category,
      action_label: 'Detay',
      action_href: '/dashboard/operations?tab=expenses',
    })
  }

  return insights
}

// ── Cash Insights ─────────────────────────────────────────────────────────────

export interface CashInsightParams {
  runway_months: number | null
  cash_trend: string | null  // 'accelerating' | 'decelerating' | 'stable'
}

export function generateCashInsights(params: CashInsightParams): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const { runway_months, cash_trend } = params

  if (runway_months === null) return insights

  const months = Math.round(runway_months * 10) / 10

  if (months < 3) {
    insights.push({
      id: 'cash_low_runway',
      category: 'cash',
      severity: 'critical',
      title: 'Nakit Kritik Seviyede',
      narrative: `⚠ Nakit kritik: ${months.toFixed(1)} ay runway — acil nakit planlaması gerekiyor.`,
      metric_value: months,
      metric_label: 'Runway (ay)',
      action_label: 'Nakit Planı',
      action_href: '/dashboard/finance?tab=cashflow',
    })
  } else if (months <= 6) {
    insights.push({
      id: 'cash_moderate_runway',
      category: 'cash',
      severity: 'warning',
      title: 'Nakit Yeterli',
      narrative: `Nakit yeterli: ${months.toFixed(1)} ay runway. Büyüme harcamaları kontrollü yapılmalı.`,
      metric_value: months,
      metric_label: 'Runway (ay)',
      action_label: 'Nakit Akışı',
      action_href: '/dashboard/finance?tab=cashflow',
    })
  } else if (months > 12) {
    insights.push({
      id: 'cash_healthy_runway',
      category: 'cash',
      severity: 'positive',
      title: 'Nakit Sağlıklı',
      narrative: `Nakit sağlıklı: ${Math.floor(months)}+ ay runway — yatırım fırsatı değerlendirilebilir.`,
      metric_value: months,
      metric_label: 'Runway (ay)',
      action_label: 'Fırsatları İncele',
      action_href: '/dashboard/planning',
    })
  }

  // Burn trend signal
  if (cash_trend === 'accelerating') {
    insights.push({
      id: 'cash_accelerating_burn',
      category: 'cash',
      severity: 'warning',
      title: 'Nakit Yakımı Hızlanıyor',
      narrative: 'Nakit yakımı son 3 ayda hızlandı — gider kontrolü önerilir.',
      action_label: 'Burn Rate',
      action_href: '/dashboard/finance?tab=cashflow',
    })
  }

  return insights
}

// ── Receivables Insights ──────────────────────────────────────────────────────

export interface ReceivablesInsightParams {
  overdue_pct: number | null       // overdue / total receivables * 100
  dso_days: number | null          // days sales outstanding
}

export function generateReceivablesInsights(params: ReceivablesInsightParams): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const { overdue_pct, dso_days } = params

  if (overdue_pct !== null && overdue_pct > 30) {
    insights.push({
      id: 'receivables_high_overdue',
      category: 'receivables',
      severity: 'warning',
      title: 'Vadesi Geçmiş Alacaklar Yüksek',
      narrative: `Vadesi geçmiş alacaklar toplam alacakların ${fmtPct(overdue_pct)}'i — tahsilat önceliklendirilmeli.`,
      metric_value: overdue_pct,
      metric_label: 'Gecikmiş oran',
      action_label: 'Alacakları İncele',
      action_href: '/dashboard/commercial?tab=collections',
    })
  }

  if (dso_days !== null && dso_days > 45) {
    insights.push({
      id: 'receivables_high_dso',
      category: 'receivables',
      severity: 'warning',
      title: 'Tahsilat Süresi Uzun',
      narrative: `Ortalama tahsilat süresi ${Math.round(dso_days)} gün — sektör standardının üzerinde.`,
      metric_value: dso_days,
      metric_label: 'Tahsilat süresi (gün)',
      action_label: 'DSO Analizi',
      action_href: '/dashboard/commercial?tab=collections',
    })
  }

  return insights
}

// ── Partner Insights ──────────────────────────────────────────────────────────

export interface PartnerInsightParams {
  partners: Array<{
    name: string
    grade: string | null   // 'A' | 'B' | 'C' | 'D' | 'F'
    debt_concentration_pct: number | null
  }>
}

export function generatePartnerInsights(params: PartnerInsightParams): BusinessInsight[] {
  const insights: BusinessInsight[] = []
  const { partners } = params

  for (const partner of partners) {
    if (partner.grade === 'D' || partner.grade === 'F') {
      insights.push({
        id: `partners_risk_${partner.name.replace(/\s+/g, '_').toLowerCase()}`,
        category: 'partners',
        severity: 'warning',
        title: 'Ortak Risk Uyarısı',
        narrative: `Ortak risk uyarısı: ${partner.name} risk skoru ${partner.grade} — inceleme önerilir.`,
        metric_label: partner.name,
        action_label: 'Ortaklar',
        action_href: '/dashboard/partners',
      })
    }

    if (partner.debt_concentration_pct !== null && partner.debt_concentration_pct > 60) {
      insights.push({
        id: `partners_concentration_${partner.name.replace(/\s+/g, '_').toLowerCase()}`,
        category: 'partners',
        severity: 'warning',
        title: 'Borç Konsantrasyonu',
        narrative: `${partner.name} toplam borcun ${fmtPct(partner.debt_concentration_pct)}'ini taşıyor — refinansman riski.`,
        metric_value: partner.debt_concentration_pct,
        metric_label: 'Borç oranı',
        action_label: 'Ortaklar',
        action_href: '/dashboard/partners',
      })
    }
  }

  return insights
}

// ── Sort ──────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning:  1,
  positive: 2,
  info:     3,
}

export function sortInsightsBySeverity(insights: BusinessInsight[]): BusinessInsight[] {
  return [...insights].sort((a, b) => {
    const orderDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (orderDiff !== 0) return orderDiff
    return a.id.localeCompare(b.id)
  })
}

// ── Full Report Builder ────────────────────────────────────────────────────────

export interface InsightEngineParams {
  revenue: RevenueInsightParams
  expenses: ExpenseInsightParams
  cash: CashInsightParams
  receivables: ReceivablesInsightParams
  partners: PartnerInsightParams
}

export function buildInsightReport(
  company_id: string,
  params: InsightEngineParams,
): InsightReport {
  const allInsights = [
    ...generateRevenueInsights(params.revenue),
    ...generateExpenseInsights(params.expenses),
    ...generateCashInsights(params.cash),
    ...generateReceivablesInsights(params.receivables),
    ...generatePartnerInsights(params.partners),
  ]

  const sorted = sortInsightsBySeverity(allInsights)

  return {
    company_id,
    insights: sorted,
    critical_count: sorted.filter(i => i.severity === 'critical').length,
    warning_count:  sorted.filter(i => i.severity === 'warning').length,
    positive_count: sorted.filter(i => i.severity === 'positive').length,
    computed_at: new Date().toISOString(),
  }
}
