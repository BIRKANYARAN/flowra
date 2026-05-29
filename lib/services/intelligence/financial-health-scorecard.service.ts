// ─────────────────────────────────────────────────────────────────────────────
// lib/services/intelligence/financial-health-scorecard.service.ts
//
// Financial Health Scorecard — 6-Dimension Composite Health Score
//
// Aggregates 6 financial dimensions into a single 0-100 composite score:
//   Liquidity (25%) · Profitability (20%) · Receivables (20%)
//   Efficiency (15%) · Debt Burden (10%) · Growth (10%)
//
// All pure functions are exported for testability.
// FinancialHealthScorecardService class handles DB orchestration.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DimensionScore {
  dimension:        string
  score:            number   // 0-100
  weight:           number   // 0-1
  weighted_score:   number   // score × weight
  status:           'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  key_metric:       string   // e.g. "12.5 ay"
  key_metric_label: string   // e.g. "Nakit Akış Süresi"
}

export interface ScorecardDimension {
  id:       string
  name_tr:  string
  weight:   number
}

// ── Dimension Weights ─────────────────────────────────────────────────────────

export const SCORECARD_WEIGHTS = {
  liquidity:     0.25,
  profitability: 0.20,
  receivables:   0.20,
  efficiency:    0.15,
  debt_burden:   0.10,
  growth:        0.10,
} as const

// ── Dimension Metadata ────────────────────────────────────────────────────────

const DIMENSION_META: Record<keyof typeof SCORECARD_WEIGHTS, ScorecardDimension> = {
  liquidity:     { id: 'liquidity',     name_tr: 'Likidite',           weight: 0.25 },
  profitability: { id: 'profitability', name_tr: 'Kârlılık',           weight: 0.20 },
  receivables:   { id: 'receivables',   name_tr: 'Alacak Yönetimi',    weight: 0.20 },
  efficiency:    { id: 'efficiency',    name_tr: 'Verimlilik',          weight: 0.15 },
  debt_burden:   { id: 'debt_burden',   name_tr: 'Borç Yükü',          weight: 0.10 },
  growth:        { id: 'growth',        name_tr: 'Büyüme',             weight: 0.10 },
}

// ── Pure Score Computation Functions ─────────────────────────────────────────

/**
 * Liquidity score (0-100)
 * runway (50pts): null→25, >=12→50, >=6→40, >=3→30, >=1→15, <1→0
 * currentRatio (50pts): null→25, >=2→50, >=1.5→40, >=1.0→30, >=0.5→15, <0.5→0
 */
export function computeLiquidityScore(
  cashRunwayMonths: number | null,
  currentRatio:     number | null,
): number {
  let runwayPts: number
  if (cashRunwayMonths === null) {
    runwayPts = 25
  } else if (cashRunwayMonths >= 12) {
    runwayPts = 50
  } else if (cashRunwayMonths >= 6) {
    runwayPts = 40
  } else if (cashRunwayMonths >= 3) {
    runwayPts = 30
  } else if (cashRunwayMonths >= 1) {
    runwayPts = 15
  } else {
    runwayPts = 0
  }

  let ratioPts: number
  if (currentRatio === null) {
    ratioPts = 25
  } else if (currentRatio >= 2) {
    ratioPts = 50
  } else if (currentRatio >= 1.5) {
    ratioPts = 40
  } else if (currentRatio >= 1.0) {
    ratioPts = 30
  } else if (currentRatio >= 0.5) {
    ratioPts = 15
  } else {
    ratioPts = 0
  }

  return runwayPts + ratioPts
}

/**
 * Profitability score (0-100)
 * grossMargin (60pts): null→30, >=50→60, >=35→48, >=20→36, >=10→20, <10→5
 * netMargin (40pts): null→20, >=15→40, >=8→32, >=3→20, >=0→10, <0→0
 */
export function computeProfitabilityScore(
  grossMarginPct: number | null,
  netMarginPct:   number | null,
): number {
  let gmPts: number
  if (grossMarginPct === null) {
    gmPts = 30
  } else if (grossMarginPct >= 50) {
    gmPts = 60
  } else if (grossMarginPct >= 35) {
    gmPts = 48
  } else if (grossMarginPct >= 20) {
    gmPts = 36
  } else if (grossMarginPct >= 10) {
    gmPts = 20
  } else {
    gmPts = 5
  }

  let nmPts: number
  if (netMarginPct === null) {
    nmPts = 20
  } else if (netMarginPct >= 15) {
    nmPts = 40
  } else if (netMarginPct >= 8) {
    nmPts = 32
  } else if (netMarginPct >= 3) {
    nmPts = 20
  } else if (netMarginPct >= 0) {
    nmPts = 10
  } else {
    nmPts = 0
  }

  return gmPts + nmPts
}

/**
 * Receivables score (0-100)
 * DSO (60pts): null→30, <=30→60, <=60→45, <=90→30, <=120→15, >120→0
 * overdue% (40pts): null→20, <=5→40, <=15→32, <=30→20, <=50→10, >50→0
 */
export function computeReceivablesScore(
  dsoDays:           number | null,
  overdueRevenuePct: number | null,
): number {
  let dsoPts: number
  if (dsoDays === null) {
    dsoPts = 30
  } else if (dsoDays <= 30) {
    dsoPts = 60
  } else if (dsoDays <= 60) {
    dsoPts = 45
  } else if (dsoDays <= 90) {
    dsoPts = 30
  } else if (dsoDays <= 120) {
    dsoPts = 15
  } else {
    dsoPts = 0
  }

  let overduePts: number
  if (overdueRevenuePct === null) {
    overduePts = 20
  } else if (overdueRevenuePct <= 5) {
    overduePts = 40
  } else if (overdueRevenuePct <= 15) {
    overduePts = 32
  } else if (overdueRevenuePct <= 30) {
    overduePts = 20
  } else if (overdueRevenuePct <= 50) {
    overduePts = 10
  } else {
    overduePts = 0
  }

  return dsoPts + overduePts
}

/**
 * Working capital efficiency score (0-100)
 * CCC: null→50, <=0→100, <=15→85, <=30→70, <=60→50, <=90→30, >90→10
 */
export function computeEfficiencyScore(
  cashConversionCycleDays: number | null,
): number {
  if (cashConversionCycleDays === null) return 50
  if (cashConversionCycleDays <= 0)    return 100
  if (cashConversionCycleDays <= 15)   return 85
  if (cashConversionCycleDays <= 30)   return 70
  if (cashConversionCycleDays <= 60)   return 50
  if (cashConversionCycleDays <= 90)   return 30
  return 10
}

/**
 * Debt burden score (0-100)
 * DSR (60pts): null→30, <=0.1→60, <=0.2→48, <=0.3→36, <=0.5→20, >0.5→5
 * loanToRev (40pts): null→20, <=50→40, <=100→32, <=200→20, <=400→10, >400→0
 */
export function computeDebtBurdenScore(
  debtServiceRatio:          number | null,
  partnerLoanToRevenuePct:   number | null,
): number {
  let dsrPts: number
  if (debtServiceRatio === null) {
    dsrPts = 30
  } else if (debtServiceRatio <= 0.1) {
    dsrPts = 60
  } else if (debtServiceRatio <= 0.2) {
    dsrPts = 48
  } else if (debtServiceRatio <= 0.3) {
    dsrPts = 36
  } else if (debtServiceRatio <= 0.5) {
    dsrPts = 20
  } else {
    dsrPts = 5
  }

  let loanPts: number
  if (partnerLoanToRevenuePct === null) {
    loanPts = 20
  } else if (partnerLoanToRevenuePct <= 50) {
    loanPts = 40
  } else if (partnerLoanToRevenuePct <= 100) {
    loanPts = 32
  } else if (partnerLoanToRevenuePct <= 200) {
    loanPts = 20
  } else if (partnerLoanToRevenuePct <= 400) {
    loanPts = 10
  } else {
    loanPts = 0
  }

  return dsrPts + loanPts
}

/**
 * Growth score (0-100)
 * MoM (50pts): null→25, >=10→50, >=5→40, >=0→30, >=-5→15, <-5→0
 * YoY (50pts): null→25, >=30→50, >=15→40, >=5→30, >=0→15, <0→0
 */
export function computeGrowthScore(
  momRevGrowthPct: number | null,
  yoyRevGrowthPct: number | null,
): number {
  let momPts: number
  if (momRevGrowthPct === null) {
    momPts = 25
  } else if (momRevGrowthPct >= 10) {
    momPts = 50
  } else if (momRevGrowthPct >= 5) {
    momPts = 40
  } else if (momRevGrowthPct >= 0) {
    momPts = 30
  } else if (momRevGrowthPct >= -5) {
    momPts = 15
  } else {
    momPts = 0
  }

  let yoyPts: number
  if (yoyRevGrowthPct === null) {
    yoyPts = 25
  } else if (yoyRevGrowthPct >= 30) {
    yoyPts = 50
  } else if (yoyRevGrowthPct >= 15) {
    yoyPts = 40
  } else if (yoyRevGrowthPct >= 5) {
    yoyPts = 30
  } else if (yoyRevGrowthPct >= 0) {
    yoyPts = 15
  } else {
    yoyPts = 0
  }

  return momPts + yoyPts
}

// ── Classification Helpers ────────────────────────────────────────────────────

export function classifyDimensionStatus(score: number): DimensionScore['status'] {
  if (score >= 80) return 'excellent'
  if (score >= 65) return 'good'
  if (score >= 45) return 'fair'
  if (score >= 25) return 'poor'
  return 'critical'
}

export function classifyOverallHealth(
  compositeScore: number,
): 'excellent' | 'good' | 'fair' | 'poor' | 'critical' {
  if (compositeScore >= 80) return 'excellent'
  if (compositeScore >= 65) return 'good'
  if (compositeScore >= 45) return 'fair'
  if (compositeScore >= 25) return 'poor'
  return 'critical'
}

// ── Composite Score ───────────────────────────────────────────────────────────

export function computeCompositeScore(dimensionScores: DimensionScore[]): number {
  if (dimensionScores.length === 0) return 0
  const total = dimensionScores.reduce((sum, d) => sum + d.weighted_score, 0)
  return Math.round(total * 10) / 10
}

// ── Weakest / Strongest ───────────────────────────────────────────────────────

export function identifyWeakestDimension(
  dimensionScores: DimensionScore[],
): DimensionScore | null {
  if (dimensionScores.length === 0) return null
  return dimensionScores.reduce((min, d) => (d.score < min.score ? d : min))
}

export function identifyStrongestDimension(
  dimensionScores: DimensionScore[],
): DimensionScore | null {
  if (dimensionScores.length === 0) return null
  return dimensionScores.reduce((max, d) => (d.score > max.score ? d : max))
}

// ── Score Trend ───────────────────────────────────────────────────────────────

export function computeScoreTrend(
  currentScore: number,
  priorScore:   number | null,
): 'improving' | 'stable' | 'declining' | 'insufficient_data' {
  if (priorScore === null) return 'insufficient_data'
  const delta = currentScore - priorScore
  if (delta > 3)  return 'improving'
  if (delta < -3) return 'declining'
  return 'stable'
}

// ── Narrative Generator ───────────────────────────────────────────────────────

export function generateScorecardNarrative(
  overallHealth:    ReturnType<typeof classifyOverallHealth>,
  compositeScore:   number,
  weakestDimension: DimensionScore | null,
  trend:            ReturnType<typeof computeScoreTrend>,
): string {
  const weakestName = weakestDimension
    ? DIMENSION_META[weakestDimension.dimension as keyof typeof DIMENSION_META]?.name_tr
      ?? weakestDimension.dimension
    : null

  let base: string
  switch (overallHealth) {
    case 'excellent':
      base = 'Şirket finansal açıdan mükemmel durumda — tüm boyutlar hedeflerin üzerinde.'
      break
    case 'good':
      base = weakestName
        ? `Finansal sağlık iyi seviyede — ${weakestName} alanında iyileştirme fırsatı var.`
        : 'Finansal sağlık iyi seviyede.'
      break
    case 'fair':
      base = weakestName
        ? `Finansal sağlık orta düzeyde — ${weakestName} öncelikli odak alanı.`
        : 'Finansal sağlık orta düzeyde.'
      break
    case 'poor':
      base = weakestName
        ? `Dikkat: Finansal göstergeler zayıf — ${weakestName} kritik.`
        : 'Dikkat: Finansal göstergeler zayıf.'
      break
    case 'critical':
      base = weakestName
        ? `Kritik: Acil finansal müdahale gerekiyor — ${weakestName} çöküş noktasında.`
        : 'Kritik: Acil finansal müdahale gerekiyor.'
      break
  }

  let trendNote: string
  switch (trend) {
    case 'improving':
      trendNote = ` Skor ${compositeScore.toFixed(1)} ile yükseliş trendinde.`
      break
    case 'declining':
      trendNote = ` Skor ${compositeScore.toFixed(1)} ile düşüş trendinde, dikkat gerekiyor.`
      break
    case 'stable':
      trendNote = ` Skor ${compositeScore.toFixed(1)} seviyesinde stabil.`
      break
    case 'insufficient_data':
      trendNote = ''
      break
  }

  return base + trendNote
}

// ── Build All 6 DimensionScores ───────────────────────────────────────────────

export function buildDimensionScores(params: {
  liquidity:     { cashRunwayMonths: number | null; currentRatio: number | null }
  profitability: { grossMarginPct: number | null; netMarginPct: number | null }
  receivables:   { dsoDays: number | null; overdueRevenuePct: number | null }
  efficiency:    { cashConversionCycleDays: number | null }
  debt_burden:   { debtServiceRatio: number | null; partnerLoanToRevenuePct: number | null }
  growth:        { momRevGrowthPct: number | null; yoyRevGrowthPct: number | null }
}): DimensionScore[] {
  const { liquidity, profitability, receivables, efficiency, debt_burden, growth } = params

  const makeScore = (
    dimension: keyof typeof SCORECARD_WEIGHTS,
    score: number,
    key_metric: string,
    key_metric_label: string,
  ): DimensionScore => {
    const weight = SCORECARD_WEIGHTS[dimension]
    return {
      dimension,
      score,
      weight,
      weighted_score: Math.round(score * weight * 10) / 10,
      status: classifyDimensionStatus(score),
      key_metric,
      key_metric_label,
    }
  }

  const liquidityScore = computeLiquidityScore(
    liquidity.cashRunwayMonths,
    liquidity.currentRatio,
  )
  const profitabilityScore = computeProfitabilityScore(
    profitability.grossMarginPct,
    profitability.netMarginPct,
  )
  const receivablesScore = computeReceivablesScore(
    receivables.dsoDays,
    receivables.overdueRevenuePct,
  )
  const efficiencyScore = computeEfficiencyScore(efficiency.cashConversionCycleDays)
  const debtBurdenScore = computeDebtBurdenScore(
    debt_burden.debtServiceRatio,
    debt_burden.partnerLoanToRevenuePct,
  )
  const growthScore = computeGrowthScore(growth.momRevGrowthPct, growth.yoyRevGrowthPct)

  return [
    makeScore(
      'liquidity',
      liquidityScore,
      liquidity.cashRunwayMonths !== null
        ? `${liquidity.cashRunwayMonths.toFixed(1)} ay`
        : '—',
      'Nakit Akış Süresi',
    ),
    makeScore(
      'profitability',
      profitabilityScore,
      profitability.grossMarginPct !== null
        ? `%${profitability.grossMarginPct.toFixed(1)} brüt marj`
        : '—',
      'Brüt Marj',
    ),
    makeScore(
      'receivables',
      receivablesScore,
      receivables.dsoDays !== null
        ? `DSO: ${Math.round(receivables.dsoDays)} gün`
        : '—',
      'Ortalama Tahsilat Süresi',
    ),
    makeScore(
      'efficiency',
      efficiencyScore,
      efficiency.cashConversionCycleDays !== null
        ? `NÇD: ${Math.round(efficiency.cashConversionCycleDays)} gün`
        : '—',
      'Nakit Çevirme Döngüsü',
    ),
    makeScore(
      'debt_burden',
      debtBurdenScore,
      debt_burden.debtServiceRatio !== null
        ? `DSR: ${(debt_burden.debtServiceRatio * 100).toFixed(1)}%`
        : '—',
      'Borç Servis Oranı',
    ),
    makeScore(
      'growth',
      growthScore,
      growth.momRevGrowthPct !== null
        ? `MoM: %${growth.momRevGrowthPct.toFixed(1)}`
        : '—',
      'Aylık Gelir Büyümesi',
    ),
  ]
}

// ── Report Interface ──────────────────────────────────────────────────────────

export interface FinancialHealthScorecardReport {
  composite_score:         number
  overall_health:          ReturnType<typeof classifyOverallHealth>
  dimension_scores:        DimensionScore[]
  weakest_dimension:       DimensionScore | null
  strongest_dimension:     DimensionScore | null
  score_trend:             ReturnType<typeof computeScoreTrend>
  prior_composite_score:   number | null
  narrative:               string
  computed_at:             string
}

// ── Service Class ─────────────────────────────────────────────────────────────

export class FinancialHealthScorecardService {
  constructor(private readonly supabase: AnyClient) {}

  async getScorecard(companyId: string): Promise<FinancialHealthScorecardReport> {
    const now    = new Date()
    const y      = now.getFullYear()
    const m      = now.getMonth() + 1

    // Build ISO period strings for last 3 months
    const months: string[] = []
    for (let i = 0; i < 3; i++) {
      const d  = new Date(y, now.getMonth() - i, 1)
      const my = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      months.push(`${my}-${mm}`)
    }
    const currentPeriod  = months[0]
    const previousPeriod = months[1]

    // ── Parallel data fetches ───────────────────────────────────────────────────

    const [
      balanceResult,
      salesResult,
      partnerLoanResult,
      expenseResult,
    ] = await Promise.allSettled([
      // 1. Latest balance sheet snapshot
      this.supabase
        .from('balance_sheet_snapshots')
        .select('cash_and_equivalents, current_assets, current_liabilities, total_assets, total_liabilities')
        .eq('company_id', companyId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),

      // 2. Sales — last 3 months
      this.supabase
        .from('sales')
        .select('amount, due_date, paid_at, status, period')
        .eq('company_id', companyId)
        .in('period', months),

      // 3. Partner loan tranches — outstanding
      this.supabase
        .from('partner_loan_tranches')
        .select('remaining_balance, monthly_payment')
        .eq('company_id', companyId)
        .eq('status', 'active'),

      // 4. Monthly expense totals — last 3 months
      this.supabase
        .from('cost_entries')
        .select('amount, period')
        .eq('company_id', companyId)
        .in('period', months),
    ])

    // ── Extract data gracefully ───────────────────────────────────────────────

    const balance = balanceResult.status === 'fulfilled' ? balanceResult.value.data : null
    const sales   = salesResult.status   === 'fulfilled' ? (salesResult.value.data ?? []) : []
    const loans   = partnerLoanResult.status === 'fulfilled' ? (partnerLoanResult.value.data ?? []) : []
    const expenses = expenseResult.status === 'fulfilled' ? (expenseResult.value.data ?? []) : []

    // ── Derive dimension inputs ───────────────────────────────────────────────

    // Liquidity
    const cashBalance: number | null = balance?.cash_and_equivalents ?? null
    const currentAssets: number | null    = balance?.current_assets      ?? null
    const currentLiabilities: number | null = balance?.current_liabilities  ?? null

    // Monthly burn: average monthly expense
    const currentMonthExpenses = expenses
      .filter((e: { period: string; amount: number }) => e.period === currentPeriod)
      .reduce((s: number, e: { amount: number }) => s + (e.amount ?? 0), 0)
    const avgMonthlyExpense = currentMonthExpenses > 0 ? currentMonthExpenses : null

    const cashRunwayMonths: number | null =
      cashBalance !== null && avgMonthlyExpense !== null && avgMonthlyExpense > 0
        ? cashBalance / avgMonthlyExpense
        : null

    const currentRatio: number | null =
      currentAssets !== null && currentLiabilities !== null && currentLiabilities > 0
        ? currentAssets / currentLiabilities
        : null

    // Revenue per period
    const revenueByPeriod: Record<string, number> = {}
    for (const s of sales as Array<{ period: string; amount: number; status: string }>) {
      revenueByPeriod[s.period] = (revenueByPeriod[s.period] ?? 0) + (s.amount ?? 0)
    }
    const currentRevenue  = revenueByPeriod[months[0]] ?? 0
    const prevRevenue     = revenueByPeriod[months[1]] ?? 0
    const prevYearPeriod  = `${y - 1}-${String(m).padStart(2, '0')}`
    const yoyRevenue      = revenueByPeriod[prevYearPeriod] ?? null

    // Profitability
    const totalRevenue   = currentRevenue
    const totalExpense   = currentMonthExpenses
    const grossMarginPct: number | null = totalRevenue > 0
      ? ((totalRevenue - totalExpense * 0.6) / totalRevenue) * 100
      : null
    const netMarginPct: number | null = totalRevenue > 0
      ? ((totalRevenue - totalExpense) / totalRevenue) * 100
      : null

    // Receivables — DSO
    const invoicedSales = (sales as Array<{ period: string; amount: number; status: string; paid_at: string | null; due_date: string | null }>)
      .filter(s => s.period === currentPeriod)
    const totalInvoiced = invoicedSales.reduce((s, inv) => s + (inv.amount ?? 0), 0)
    const overdueSales  = invoicedSales.filter(s => {
      if (s.status === 'paid') return false
      if (!s.due_date) return false
      return new Date(s.due_date) < now
    })
    const overdueAmount = overdueSales.reduce((s, inv) => s + (inv.amount ?? 0), 0)
    const overdueRevenuePct: number | null = totalInvoiced > 0
      ? (overdueAmount / totalInvoiced) * 100
      : null

    // Simple DSO: (AR / monthly revenue) × 30
    const arBalance = overdueAmount + invoicedSales
      .filter(s => s.status !== 'paid')
      .reduce((s, inv) => s + (inv.amount ?? 0), 0)
    const dsoDays: number | null = currentRevenue > 0
      ? (arBalance / currentRevenue) * 30
      : null

    // Efficiency — approximate CCC
    // CCC ≈ DSO + DIO - DPO; use DSO as proxy when inventory not available
    const cashConversionCycleDays: number | null = dsoDays !== null ? dsoDays : null

    // Debt burden
    const totalLoanBalance  = loans.reduce(
      (s: number, l: { remaining_balance: number }) => s + (l.remaining_balance ?? 0), 0,
    )
    const monthlyDebtService = loans.reduce(
      (s: number, l: { monthly_payment: number }) => s + (l.monthly_payment ?? 0), 0,
    )
    const debtServiceRatio: number | null = currentRevenue > 0
      ? monthlyDebtService / currentRevenue
      : null
    const partnerLoanToRevenuePct: number | null = currentRevenue > 0
      ? (totalLoanBalance / currentRevenue) * 100
      : null

    // Growth
    const momRevGrowthPct: number | null = prevRevenue > 0
      ? ((currentRevenue - prevRevenue) / prevRevenue) * 100
      : null
    const yoyRevGrowthPct: number | null = yoyRevenue !== null && yoyRevenue > 0
      ? ((currentRevenue - yoyRevenue) / yoyRevenue) * 100
      : null

    // ── Build scorecard ───────────────────────────────────────────────────────

    const dimensionScores = buildDimensionScores({
      liquidity:     { cashRunwayMonths, currentRatio },
      profitability: { grossMarginPct, netMarginPct },
      receivables:   { dsoDays, overdueRevenuePct },
      efficiency:    { cashConversionCycleDays },
      debt_burden:   { debtServiceRatio, partnerLoanToRevenuePct },
      growth:        { momRevGrowthPct, yoyRevGrowthPct },
    })

    const compositeScore     = computeCompositeScore(dimensionScores)
    const overallHealth      = classifyOverallHealth(compositeScore)
    const weakestDimension   = identifyWeakestDimension(dimensionScores)
    const strongestDimension = identifyStrongestDimension(dimensionScores)

    // Prior composite score (not stored, so we derive from prior period indirectly)
    const priorCompositeScore: number | null = null

    const trend    = computeScoreTrend(compositeScore, priorCompositeScore)
    const narrative = generateScorecardNarrative(
      overallHealth,
      compositeScore,
      weakestDimension,
      trend,
    )

    return {
      composite_score:       compositeScore,
      overall_health:        overallHealth,
      dimension_scores:      dimensionScores,
      weakest_dimension:     weakestDimension,
      strongest_dimension:   strongestDimension,
      score_trend:           trend,
      prior_composite_score: priorCompositeScore,
      narrative,
      computed_at:           now.toISOString(),
    }
  }
}
