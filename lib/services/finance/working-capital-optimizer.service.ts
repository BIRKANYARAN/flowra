// ═══════════════════════════════════════════════════════════════════════════════
// lib/services/finance/working-capital-optimizer.service.ts
//
// Working Capital Optimization — generates specific, actionable recommendations
// to shorten DSO, extend DPO, and reduce DIO with estimated cash impact in TRY.
//
// Industry benchmarks (Turkish SME context):
//   DSO: 30 days  (collect faster → free cash)
//   DPO: 45 days  (pay slower → extend float)
//   DIO: 30 days  (reduce inventory days → release cash)
//
// Cash impact formulas:
//   DSO impact = (annual_revenue / 365) × days_reduction
//   DPO impact = (annual_purchases / 365) × days_extension
//   DIO impact = (annual_cogs / 365) × days_reduction
// ═══════════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import { WorkingCapitalService } from './working-capital.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OptimizationRecommendation {
  id: string
  category: 'receivables' | 'payables' | 'inventory'
  title: string              // Turkish
  description: string        // Turkish detail
  current_days: number
  target_days: number
  days_improvement: number
  cash_impact_try: number    // estimated cash freed/created
  priority: 'high' | 'medium' | 'low'
  action_items: string[]     // Turkish bullet points
}

export interface WorkingCapitalOptimizationReport {
  current_ccc_days: number
  target_ccc_days: number
  ccc_improvement_days: number
  total_cash_impact_try: number
  current_working_capital_try: number
  recommendations: OptimizationRecommendation[]   // sorted by priority then cash_impact
  high_priority_count: number
  implementation_difficulty: 'easy' | 'moderate' | 'complex'   // based on count and types
  summary_narrative: string   // Turkish 2-sentence executive summary
}

// ── Industry benchmarks (Turkish SME) ─────────────────────────────────────────

const BENCHMARKS = {
  dso: 30,   // days — target for receivables
  dpo: 45,   // days — target for payables
  dio: 30,   // days — target for inventory
} as const

// ── Priority sort order ────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<'high' | 'medium' | 'low', number> = {
  high:   0,
  medium: 1,
  low:    2,
}

// ── Pure functions ─────────────────────────────────────────────────────────────

/**
 * Compute cash freed if DSO reduced by N days.
 * cash_impact = (annual_revenue / 365) × days_reduction
 */
export function computeDsoImpact(
  annualRevenueTry: number,
  daysReduction: number,
): number {
  if (annualRevenueTry <= 0 || daysReduction <= 0) return 0
  return Math.round((annualRevenueTry / 365) * daysReduction)
}

/**
 * Compute cash freed if DPO extended by N days.
 * cash_impact = (annual_purchases / 365) × days_extension
 */
export function computeDpoImpact(
  annualPurchasesTry: number,
  daysExtension: number,
): number {
  if (annualPurchasesTry <= 0 || daysExtension <= 0) return 0
  return Math.round((annualPurchasesTry / 365) * daysExtension)
}

/**
 * Compute cash freed if DIO reduced by N days.
 * cash_impact = (annual_cogs / 365) × days_reduction
 */
export function computeDioImpact(
  annualCogsTry: number,
  daysReduction: number,
): number {
  if (annualCogsTry <= 0 || daysReduction <= 0) return 0
  return Math.round((annualCogsTry / 365) * daysReduction)
}

/**
 * Compute total CCC improvement potential.
 * Sums DSO, DPO, and DIO cash impacts.
 */
export function computeCccImprovementPotential(
  dsoImpact: number,
  dpoImpact: number,
  dioImpact: number,
): number {
  return (dsoImpact || 0) + (dpoImpact || 0) + (dioImpact || 0)
}

/**
 * Classify recommendation priority.
 * high:   cash_impact > 100K TRY AND days_change > 10
 * medium: cash_impact > 20K TRY OR days_change > 5
 * low:    otherwise
 */
export function classifyOptimizationPriority(
  cashImpactTry: number,
  daysChange: number,
): 'high' | 'medium' | 'low' {
  if (cashImpactTry > 100_000 && daysChange > 10) return 'high'
  if (cashImpactTry > 20_000  || daysChange > 5)  return 'medium'
  return 'low'
}

// ── Implementation difficulty ──────────────────────────────────────────────────

function computeImplementationDifficulty(
  recommendations: OptimizationRecommendation[],
): 'easy' | 'moderate' | 'complex' {
  const highCount = recommendations.filter(r => r.priority === 'high').length
  const total     = recommendations.length
  if (total === 0)                          return 'easy'
  if (highCount >= 3 || total >= 3)         return 'complex'
  if (highCount >= 1 || total >= 2)         return 'moderate'
  return 'easy'
}

// ── Summary narrative ──────────────────────────────────────────────────────────

function buildSummaryNarrative(
  report: Omit<WorkingCapitalOptimizationReport, 'summary_narrative'>,
): string {
  const { total_cash_impact_try, ccc_improvement_days, recommendations, current_ccc_days } = report

  if (recommendations.length === 0) {
    return `İşletme sermayesi döngüsü (${current_ccc_days.toFixed(0)} gün) sektör kıyaslama değerleri dahilindedir. Mevcut alacak, borç ve stok yönetimi verimli görünmektedir.`
  }

  const topRec  = recommendations[0]
  const impactK = (total_cash_impact_try / 1000).toFixed(0)

  return `${recommendations.length} optimizasyon fırsatı tespit edildi; toplam tahmini nakit etkisi ₺${impactK}K ve CCC'de ${ccc_improvement_days.toFixed(0)} günlük iyileşme potansiyeli bulunmaktadır. En yüksek öncelikli aksiyon "${topRec.title}" (₺${Math.round(topRec.cash_impact_try / 1000)}K etki) ile başlanması önerilmektedir.`
}

// ── Service class ──────────────────────────────────────────────────────────────

export class WorkingCapitalOptimizerService {
  private supabase: AnyClient

  constructor(supabase: AnyClient) {
    this.supabase = supabase
  }

  async getReport(companyId: string): Promise<WorkingCapitalOptimizationReport> {
    // ── Fetch 12-month working capital data ───────────────────────────────────
    const wcReport = await WorkingCapitalService.getReport(companyId, this.supabase)

    // ── Derive current metrics from latest month ───────────────────────────────
    const latestMonth = wcReport.months[0]   // most recent month (newest first)

    const currentDso = latestMonth?.dso_days ?? 0
    const currentDpo = latestMonth?.dpo_days ?? 0
    const currentDio = latestMonth?.dio_days ?? 0

    // Derive annual revenue / cogs / purchases from 12-month window
    // Sum all months (oldest→newest) for annualized figures
    let annualRevenue   = 0
    let annualCogs      = 0

    // Fetch annual revenue directly from the service's underlying data
    // We approximate by querying the last 12 months via supabase
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const fromDate = twelveMonthsAgo.toISOString().slice(0, 10)
    const toDate   = new Date().toISOString().slice(0, 10)

    const [salesRes, expensesRes] = await Promise.all([
      this.supabase
        .from('sales')
        .select('total_try, cogs')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', fromDate)
        .lte('sale_date', toDate),

      this.supabase
        .from('expenses')
        .select('amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', fromDate)
        .lte('expense_date', toDate),
    ])

    const sales    = salesRes.data    ?? []
    const expenses = expensesRes.data ?? []

    for (const s of sales) {
      annualRevenue += Number(s.total_try) || 0
      annualCogs    += Number(s.cogs)      || 0
    }

    const annualPurchases = expenses.reduce(
      (sum: number, e: { amount_try: number }) => sum + (Number(e.amount_try) || 0),
      0,
    )

    // ── Current CCC ────────────────────────────────────────────────────────────
    const currentCcc = currentDso + (currentDio ?? 0) - currentDpo

    // ── Target CCC (using benchmarks) ─────────────────────────────────────────
    const targetDso  = Math.min(currentDso, BENCHMARKS.dso)
    const targetDpo  = Math.max(currentDpo, BENCHMARKS.dpo)
    const targetDio  = Math.min(currentDio ?? 0, BENCHMARKS.dio)
    const targetCcc  = targetDso + targetDio - targetDpo

    // ── Build recommendations ─────────────────────────────────────────────────
    const recommendations: OptimizationRecommendation[] = []

    // DSO recommendation (if current > benchmark)
    if (currentDso > BENCHMARKS.dso) {
      const daysReduction  = currentDso - BENCHMARKS.dso
      const cashImpact     = computeDsoImpact(annualRevenue, daysReduction)
      const priority       = classifyOptimizationPriority(cashImpact, daysReduction)

      recommendations.push({
        id:               'dso-improvement',
        category:         'receivables',
        title:            'Alacak Tahsilat Süresi İyileştirme',
        description:      `Mevcut ortalama tahsilat süresi ${currentDso.toFixed(0)} gün; sektör hedefi ${BENCHMARKS.dso} gün. ${daysReduction.toFixed(0)} günlük iyileştirme ile ₺${Math.round(cashImpact / 1000)}K nakit serbest bırakılabilir.`,
        current_days:     Math.round(currentDso),
        target_days:      BENCHMARKS.dso,
        days_improvement: Math.round(daysReduction),
        cash_impact_try:  cashImpact,
        priority,
        action_items: [
          'Erken ödeme iskontosu sunun (%2/10 net 30)',
          'Tahsilat takip sürecini otomatize edin',
          'Vadesi geçmiş alacaklar için haftalık takip kurun',
        ],
      })
    }

    // DPO recommendation (if current < benchmark)
    if (currentDpo < BENCHMARKS.dpo) {
      const daysExtension  = BENCHMARKS.dpo - currentDpo
      const cashImpact     = computeDpoImpact(annualPurchases, daysExtension)
      const priority       = classifyOptimizationPriority(cashImpact, daysExtension)

      recommendations.push({
        id:               'dpo-extension',
        category:         'payables',
        title:            'Tedarikçi Ödeme Vadesi Uzatma',
        description:      `Mevcut ortalama ödeme vadesi ${currentDpo.toFixed(0)} gün; sektör hedefi ${BENCHMARKS.dpo} gün. ${daysExtension.toFixed(0)} günlük uzatma ile ₺${Math.round(cashImpact / 1000)}K nakit tutulabilir.`,
        current_days:     Math.round(currentDpo),
        target_days:      BENCHMARKS.dpo,
        days_improvement: Math.round(daysExtension),
        cash_impact_try:  cashImpact,
        priority,
        action_items: [
          'Tedarikçilerle 45-60 gün vade müzakeresi yapın',
          'Büyük tedarikçilerle uzun vadeli sözleşme imzalayın',
        ],
      })
    }

    // DIO recommendation (if current > benchmark)
    if (currentDio !== null && currentDio > BENCHMARKS.dio) {
      const daysReduction  = currentDio - BENCHMARKS.dio
      const cashImpact     = computeDioImpact(annualCogs > 0 ? annualCogs : annualRevenue * 0.6, daysReduction)
      const priority       = classifyOptimizationPriority(cashImpact, daysReduction)

      recommendations.push({
        id:               'dio-reduction',
        category:         'inventory',
        title:            'Stok Devir Hızı Artırma',
        description:      `Mevcut stok tutma süresi ${currentDio.toFixed(0)} gün; sektör hedefi ${BENCHMARKS.dio} gün. ${daysReduction.toFixed(0)} günlük iyileştirme ile ₺${Math.round(cashImpact / 1000)}K nakit serbest bırakılabilir.`,
        current_days:     Math.round(currentDio),
        target_days:      BENCHMARKS.dio,
        days_improvement: Math.round(daysReduction),
        cash_impact_try:  cashImpact,
        priority,
        action_items: [
          'ABC analizi ile yavaş dönen ürünleri belirleyin',
          'Yeniden sipariş noktalarını optimize edin',
          'Ani talep dalgalanması için güvenlik stoğunu azaltın',
        ],
      })
    }

    // ── Sort recommendations: priority first, then cash impact desc ───────────
    recommendations.sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (pDiff !== 0) return pDiff
      return b.cash_impact_try - a.cash_impact_try
    })

    // ── Aggregate metrics ──────────────────────────────────────────────────────
    const dsoImpact  = recommendations.find(r => r.category === 'receivables')?.cash_impact_try ?? 0
    const dpoImpact  = recommendations.find(r => r.category === 'payables')?.cash_impact_try    ?? 0
    const dioImpact  = recommendations.find(r => r.category === 'inventory')?.cash_impact_try   ?? 0

    const totalCashImpact    = computeCccImprovementPotential(dsoImpact, dpoImpact, dioImpact)
    const cccImprovementDays = Math.max(0, currentCcc - targetCcc)
    const highPriorityCount  = recommendations.filter(r => r.priority === 'high').length
    const difficulty         = computeImplementationDifficulty(recommendations)

    const partialReport = {
      current_ccc_days:          Math.round(currentCcc),
      target_ccc_days:           Math.round(targetCcc),
      ccc_improvement_days:      Math.round(cccImprovementDays),
      total_cash_impact_try:     totalCashImpact,
      current_working_capital_try: wcReport.working_capital,
      recommendations,
      high_priority_count:       highPriorityCount,
      implementation_difficulty: difficulty,
    }

    const summary_narrative = buildSummaryNarrative(partialReport)

    return {
      ...partialReport,
      summary_narrative,
    }
  }
}
