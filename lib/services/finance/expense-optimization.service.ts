// ─────────────────────────────────────────────────────────────────────────────
// lib/services/finance/expense-optimization.service.ts
//
// Expense Optimization Recommendations Service
//
// Analyzes expense patterns vs Turkish SME benchmarks and generates specific,
// actionable cost reduction recommendations with estimated savings.
//
// Algorithm:
//   1. Fetch current month expenses grouped by expense_type.
//   2. Fetch current month sales total for revenue baseline.
//   3. Map expense_type to OptimizationCategory.
//   4. Compare each category against EXPENSE_BENCHMARKS (% of revenue).
//   5. Generate per-category opportunities where actual > benchmark.
//   6. Rank by estimated annual saving (descending).
//   7. Return full ExpenseOptimizationReport.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ── Public types ───────────────────────────────────────────────────────────────

export type OptimizationCategory =
  | 'salary'
  | 'rent'
  | 'software'
  | 'marketing'
  | 'logistics'
  | 'general'
  | 'utilities'

export interface ExpenseOptimizationOpportunity {
  id: string
  category: OptimizationCategory
  title: string
  description: string
  current_monthly_try: number
  potential_saving_pct: number
  estimated_monthly_saving_try: number
  estimated_annual_saving_try: number
  effort: 'quick_win' | 'medium_term' | 'strategic'
  confidence: 'high' | 'medium' | 'low'
  action_items: string[]
}

export interface ExpenseOptimizationReport {
  period: string
  monthly_revenue_try: number
  total_monthly_expenses_try: number
  expense_ratio_pct: number
  optimization_score: number
  optimization_potential: ReturnType<typeof classifyOptimizationPotential>
  total_annual_saving_potential_try: number
  opportunities: ExpenseOptimizationOpportunity[]
  quick_wins: ExpenseOptimizationOpportunity[]
  expense_breakdown: Record<OptimizationCategory, number>
  benchmark_comparison: Record<OptimizationCategory, {
    actual_pct: number
    benchmark_pct: number
    is_over: boolean
  }>
}

// ── Turkish SME expense benchmarks as % of revenue ────────────────────────────

export const EXPENSE_BENCHMARKS: Record<OptimizationCategory, number> = {
  salary:    25,
  rent:       5,
  software:   2,
  marketing:  5,
  logistics:  4,
  general:    8,
  utilities:  2,
}

// ── Pure computation functions ─────────────────────────────────────────────────

/**
 * Compute expense as % of revenue.
 * Returns 0 if revenue is 0.
 */
export function computeExpenseRatioPct(expenseTry: number, revenueTry: number): number {
  if (revenueTry === 0) return 0
  return (expenseTry / revenueTry) * 100
}

/**
 * Compute overspend vs benchmark.
 * Returns 0 if at or below benchmark (clamped at 0).
 */
export function computeOverspendPct(
  actualRatioPct: number,
  benchmarkRatioPct: number,
): number {
  return Math.max(0, actualRatioPct - benchmarkRatioPct)
}

/**
 * Compute estimated saving from reducing ratio to benchmark.
 * Returns 0 if already at or below benchmark.
 */
export function computeSavingFromBenchmark(
  currentExpenseTry: number,
  currentRatioPct: number,
  benchmarkRatioPct: number,
  revenueTry: number,
): number {
  if (currentRatioPct <= benchmarkRatioPct) return 0
  const benchmarkExpense = (benchmarkRatioPct / 100) * revenueTry
  return Math.max(0, currentExpenseTry - benchmarkExpense)
}

// ── Category opportunity generators ───────────────────────────────────────────

/**
 * Generate salary optimization opportunity.
 * Triggers when: salary ratio > 25% of revenue.
 */
export function generateSalaryOpportunity(
  monthlyPayroll: number,
  monthlyRevenue: number,
): ExpenseOptimizationOpportunity | null {
  const benchmark = EXPENSE_BENCHMARKS.salary
  const actualRatio = computeExpenseRatioPct(monthlyPayroll, monthlyRevenue)
  const overspend = computeOverspendPct(actualRatio, benchmark)
  if (overspend === 0) return null

  const savingPct = actualRatio >= benchmark + 10 ? 15 : 10
  const estimatedMonthlySaving = monthlyPayroll * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'salary-optimization',
    category: 'salary',
    title: 'Personel Maliyeti Optimizasyonu',
    description: `Personel giderleri gelirin %${actualRatio.toFixed(1)}'ini oluşturuyor. Sektör ortalaması %${benchmark}. Verimlilik artışı ve görev yeniden dağılımıyla tasarruf sağlanabilir.`,
    current_monthly_try: monthlyPayroll,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'strategic',
    confidence: overspend >= 10 ? 'high' : 'medium',
    action_items: [
      'Çalışan başına gelir (verimlilik) analizini yapın',
      'Mesai ve fazla mesai maliyetlerini gözden geçirin',
      'Düşük verimli pozisyonlar için görev tanımlarını güncelleyin',
      'Freelance veya dış kaynak kullanımı olanaklarını değerlendirin',
      'Performans bazlı ücret sistemine geçişi planlayın',
    ],
  }
}

/**
 * Generate software/SaaS audit opportunity.
 * Triggers when: software spend > 2% of revenue OR > ₺10,000/month.
 */
export function generateSoftwareOpportunity(
  monthlySoftware: number,
  monthlyRevenue: number,
): ExpenseOptimizationOpportunity | null {
  const benchmark = EXPENSE_BENCHMARKS.software
  const actualRatio = computeExpenseRatioPct(monthlySoftware, monthlyRevenue)
  const aboveRatio = actualRatio > benchmark
  const aboveAmount = monthlySoftware > 10_000

  if (!aboveRatio && !aboveAmount) return null

  const savingPct = 25
  const estimatedMonthlySaving = monthlySoftware * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'software-audit',
    category: 'software',
    title: 'SaaS & Yazılım Abonelik Denetimi',
    description: `Aylık ${monthlySoftware.toLocaleString('tr-TR')} ₺ yazılım/abonelik gideri tespit edildi. Şirketlerin ortalama %20-30 aboneliği aktif kullanılmıyor.`,
    current_monthly_try: monthlySoftware,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'quick_win',
    confidence: aboveRatio ? 'high' : 'medium',
    action_items: [
      'Tüm aktif abonelikleri listeleyin (banka ekstreleri üzerinden)',
      'Son 30 gün içinde kullanılmayan abonelikleri tespit edin',
      'Benzer özelliklere sahip araçları konsolide edin',
      'Yıllık ödeme seçeneklerini değerlendirin (%20-40 indirim)',
      'Her abonelik için sorumlu kişi atayın',
    ],
  }
}

/**
 * Generate marketing ROI opportunity.
 * Triggers when: marketing > 5% of revenue AND revenue growth < 10% (weak ROI).
 */
export function generateMarketingOpportunity(
  monthlyMarketing: number,
  monthlyRevenue: number,
  revenueGrowthPct: number,
): ExpenseOptimizationOpportunity | null {
  const benchmark = EXPENSE_BENCHMARKS.marketing
  const actualRatio = computeExpenseRatioPct(monthlyMarketing, monthlyRevenue)

  if (actualRatio <= benchmark || revenueGrowthPct >= 10) return null

  const savingPct = 18
  const estimatedMonthlySaving = monthlyMarketing * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'marketing-roi',
    category: 'marketing',
    title: 'Pazarlama ROI Optimizasyonu',
    description: `Pazarlama giderleri gelirin %${actualRatio.toFixed(1)}'ine ulaşmış ancak gelir büyümesi %${revenueGrowthPct.toFixed(1)} ile düşük seyrediyor. Düşük verimli kanalları kısıp yüksek ROI'li kanallara kaydırılabilir.`,
    current_monthly_try: monthlyMarketing,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'medium_term',
    confidence: 'medium',
    action_items: [
      'Her pazarlama kanalı için müşteri edinim maliyeti (CAC) hesaplayın',
      'Dönüşüm oranı düşük kanalların bütçesini kesin',
      'Dijital reklam harcamalarını A/B test ile optimize edin',
      'Organik büyüme (SEO, içerik) yatırımını artırın',
      'Müşteri referans programı ile düşük maliyetli büyüme sağlayın',
    ],
  }
}

/**
 * Generate rent/space optimization opportunity.
 * Triggers when: rent > 5% of revenue.
 */
export function generateRentOpportunity(
  monthlyRent: number,
  monthlyRevenue: number,
): ExpenseOptimizationOpportunity | null {
  const benchmark = EXPENSE_BENCHMARKS.rent
  const actualRatio = computeExpenseRatioPct(monthlyRent, monthlyRevenue)
  const overspend = computeOverspendPct(actualRatio, benchmark)
  if (overspend === 0) return null

  const savingPct = 20
  const estimatedMonthlySaving = monthlyRent * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'rent-optimization',
    category: 'rent',
    title: 'Kira & Alan Optimizasyonu',
    description: `Kira giderleri gelirin %${actualRatio.toFixed(1)}'ini oluşturuyor. Benchmarkin (%${benchmark}) üzerinde. Hibrit çalışma veya alan azaltımı önemli tasarruf sağlayabilir.`,
    current_monthly_try: monthlyRent,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'strategic',
    confidence: overspend >= 5 ? 'high' : 'medium',
    action_items: [
      'Mevcut ofis kullanım oranını ölçün (kapasite vs fiili kullanım)',
      'Uzaktan/hibrit çalışma politikasını genişletin',
      'Alt kiralama imkânlarını araştırın',
      'Kira yenileme döneminde daha küçük alana taşınmayı değerlendirin',
      'Co-working alanlarla maliyet karşılaştırması yapın',
    ],
  }
}

/**
 * Generate logistics optimization opportunity.
 * Triggers when: logistics > 4% of revenue.
 */
export function generateLogisticsOpportunity(
  monthlyLogistics: number,
  monthlyRevenue: number,
): ExpenseOptimizationOpportunity | null {
  const benchmark = EXPENSE_BENCHMARKS.logistics
  const actualRatio = computeExpenseRatioPct(monthlyLogistics, monthlyRevenue)
  const overspend = computeOverspendPct(actualRatio, benchmark)
  if (overspend === 0) return null

  const savingPct = 15
  const estimatedMonthlySaving = monthlyLogistics * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'logistics-optimization',
    category: 'logistics',
    title: 'Lojistik & Kargo Maliyeti Optimizasyonu',
    description: `Lojistik giderleri gelirin %${actualRatio.toFixed(1)}'ini oluşturuyor (benchmark: %${benchmark}). Toplu anlaşma ve rota optimizasyonu ile tasarruf sağlanabilir.`,
    current_monthly_try: monthlyLogistics,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'medium_term',
    confidence: 'medium',
    action_items: [
      'Kargo firmalarıyla hacim bazlı toplu anlaşma müzakeresi yapın',
      'Teslimat konsolidasyonu ile sefer sayısını azaltın',
      'İade oranlarını analiz edin ve iade maliyetini düşürecek önlemler alın',
      'Depo yerleşimini müşteri yoğunluğuna göre optimize edin',
      'Çoklu kargo sağlayıcısı ile rekabetçi fiyat sağlayın',
    ],
  }
}

/**
 * Generate general/utility optimization opportunity (catch-all).
 * Triggers when: general + utilities > 10% of revenue.
 */
export function generateGeneralOpportunity(
  monthlyGeneral: number,
  monthlyUtilities: number,
  monthlyRevenue: number,
): ExpenseOptimizationOpportunity | null {
  const combined = monthlyGeneral + monthlyUtilities
  const benchmarkSum = EXPENSE_BENCHMARKS.general + EXPENSE_BENCHMARKS.utilities  // 10%
  const actualRatio = computeExpenseRatioPct(combined, monthlyRevenue)
  const overspend = computeOverspendPct(actualRatio, benchmarkSum)
  if (overspend === 0) return null

  const savingPct = 12
  const estimatedMonthlySaving = combined * savingPct / 100
  const estimatedAnnualSaving = estimatedMonthlySaving * 12

  return {
    id: 'general-utilities-optimization',
    category: 'general',
    title: 'Genel Gider & Enerji Optimizasyonu',
    description: `Genel gider ve enerji harcamaları gelirin %${actualRatio.toFixed(1)}'ini oluşturuyor (benchmark: %${benchmarkSum}). Tedarikçi müzakeresi ve enerji verimliliği önlemleri etkili olabilir.`,
    current_monthly_try: combined,
    potential_saving_pct: savingPct,
    estimated_monthly_saving_try: estimatedMonthlySaving,
    estimated_annual_saving_try: estimatedAnnualSaving,
    effort: 'medium_term',
    confidence: 'medium',
    action_items: [
      'Elektrik ve doğalgaz tarifelerini karşılaştırın, avantajlı tarifeye geçin',
      'Büro malzemeleri için toplu alım ve tedarikçi konsolidasyonu yapın',
      'Fatura ödeme süreçlerini otomatize ederek personel maliyetini azaltın',
      'Ofis enerji tüketimini izleyin, israfı tespit edin',
      'Seyahat harcamaları için şirket politikası oluşturun',
    ],
  }
}

// ── Aggregate builder ──────────────────────────────────────────────────────────

/**
 * Build all optimization opportunities from expense breakdown.
 */
export function buildOptimizationOpportunities(
  expenses: Record<OptimizationCategory, number>,
  monthlyRevenue: number,
  revenueGrowthPct = 0,
): ExpenseOptimizationOpportunity[] {
  const opportunities: ExpenseOptimizationOpportunity[] = []

  const salary = generateSalaryOpportunity(expenses.salary, monthlyRevenue)
  if (salary) opportunities.push(salary)

  const software = generateSoftwareOpportunity(expenses.software, monthlyRevenue)
  if (software) opportunities.push(software)

  const marketing = generateMarketingOpportunity(expenses.marketing, monthlyRevenue, revenueGrowthPct)
  if (marketing) opportunities.push(marketing)

  const rent = generateRentOpportunity(expenses.rent, monthlyRevenue)
  if (rent) opportunities.push(rent)

  const logistics = generateLogisticsOpportunity(expenses.logistics, monthlyRevenue)
  if (logistics) opportunities.push(logistics)

  const general = generateGeneralOpportunity(expenses.general, expenses.utilities, monthlyRevenue)
  if (general) opportunities.push(general)

  return opportunities
}

/**
 * Sort opportunities by estimated annual saving (descending).
 */
export function rankOpportunities(
  opportunities: ExpenseOptimizationOpportunity[],
): ExpenseOptimizationOpportunity[] {
  return [...opportunities].sort(
    (a, b) => b.estimated_annual_saving_try - a.estimated_annual_saving_try,
  )
}

/**
 * Compute total potential annual saving across all opportunities.
 */
export function computeTotalAnnualSavingPotential(
  opportunities: ExpenseOptimizationOpportunity[],
): number {
  return opportunities.reduce((sum, o) => sum + o.estimated_annual_saving_try, 0)
}

/**
 * Compute optimization score (0-100).
 * score = 100 - (total_actual_expense / (revenue × 0.51) × 100), clamped [0, 100].
 * Returns 100 if at or below benchmarks (or revenue = 0).
 */
export function computeOptimizationScore(
  totalActualExpenses: number,
  monthlyRevenue: number,
): number {
  if (monthlyRevenue === 0) return 100
  const optimalExpenses = monthlyRevenue * (51 / 100)  // sum of all benchmarks = 51%
  const score = 100 - (totalActualExpenses / optimalExpenses) * 100
  return Math.min(100, Math.max(0, score))
}

/**
 * Classify optimization potential based on annual saving identified.
 */
export function classifyOptimizationPotential(
  annualSavingPotential: number,
  monthlyRevenue: number,
): 'high' | 'medium' | 'low' | 'minimal' | 'no_revenue_data' {
  if (monthlyRevenue === 0) return 'no_revenue_data'
  if (annualSavingPotential > 50_000) return 'high'
  if (annualSavingPotential >= 20_000) return 'medium'
  if (annualSavingPotential >= 5_000) return 'low'
  return 'minimal'
}

// ── Helper: build benchmark comparison ────────────────────────────────────────

function buildBenchmarkComparison(
  expenses: Record<OptimizationCategory, number>,
  monthlyRevenue: number,
): Record<OptimizationCategory, { actual_pct: number; benchmark_pct: number; is_over: boolean }> {
  const categories: OptimizationCategory[] = ['salary', 'rent', 'software', 'marketing', 'logistics', 'general', 'utilities']
  const result = {} as Record<OptimizationCategory, { actual_pct: number; benchmark_pct: number; is_over: boolean }>
  for (const cat of categories) {
    const actual_pct = computeExpenseRatioPct(expenses[cat], monthlyRevenue)
    const benchmark_pct = EXPENSE_BENCHMARKS[cat]
    result[cat] = {
      actual_pct,
      benchmark_pct,
      is_over: actual_pct > benchmark_pct,
    }
  }
  return result
}

// ── Expense type → category mapping ───────────────────────────────────────────

const TYPE_TO_CATEGORY: Record<string, OptimizationCategory> = {
  // Salary / payroll
  salary:     'salary',
  payroll:    'salary',
  maas:       'salary',
  personel:   'salary',
  ikramiye:   'salary',
  // Rent
  rent:       'rent',
  kira:       'rent',
  // Software
  software:   'software',
  yazilim:    'software',
  abonelik:   'software',
  saas:       'software',
  // Marketing
  marketing:  'marketing',
  reklam:     'marketing',
  pazarlama:  'marketing',
  // Logistics
  logistics:  'logistics',
  kargo:      'logistics',
  nakliye:    'logistics',
  shipping:   'logistics',
  // Utilities
  utilities:  'utilities',
  elektrik:   'utilities',
  dogalgaz:   'utilities',
  internet:   'utilities',
  telefon:    'utilities',
  // General (catch-all)
  general:    'general',
  genel:      'general',
  ofis:       'general',
  seyahat:    'general',
  temsil:     'general',
}

function mapTypeToCategory(expenseType: string | null): OptimizationCategory {
  if (!expenseType) return 'general'
  return TYPE_TO_CATEGORY[expenseType.toLowerCase()] ?? 'general'
}

// ── Service class ──────────────────────────────────────────────────────────────

export class ExpenseOptimizationService {

  constructor(private readonly supabase: AnyClient) {}

  async getReport(companyId: string): Promise<ExpenseOptimizationReport> {
    const now = new Date()
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const periodStart = `${period}-01`
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const periodEnd = `${period}-${String(lastDay).padStart(2, '0')}`

    // ── Fetch current month expenses ─────────────────────────────────────────
    const { data: expenseRows } = await this.supabase
      .from('expenses')
      .select('amount_try, expense_type')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('expense_date', periodStart)
      .lte('expense_date', periodEnd)

    interface ExpenseRow {
      amount_try: number | string | null
      expense_type: string | null
    }

    const expenses = (expenseRows ?? []) as ExpenseRow[]

    // ── Fetch current month revenue ──────────────────────────────────────────
    const { data: salesRows } = await this.supabase
      .from('sales')
      .select('amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .gte('sale_date', periodStart)
      .lte('sale_date', periodEnd)

    interface SalesRow {
      amount_try: number | string | null
    }

    const sales = (salesRows ?? []) as SalesRow[]
    const monthlyRevenue = sales.reduce((s, r) => s + Number(r.amount_try ?? 0), 0)

    // ── Aggregate by category ────────────────────────────────────────────────
    const breakdown: Record<OptimizationCategory, number> = {
      salary: 0, rent: 0, software: 0, marketing: 0,
      logistics: 0, general: 0, utilities: 0,
    }
    for (const row of expenses) {
      const cat = mapTypeToCategory(row.expense_type)
      breakdown[cat] += Number(row.amount_try ?? 0)
    }

    // ── Build opportunities ──────────────────────────────────────────────────
    const rawOpportunities = buildOptimizationOpportunities(breakdown, monthlyRevenue)
    const opportunities = rankOpportunities(rawOpportunities)
    const quickWins = rankOpportunities(opportunities.filter(o => o.effort === 'quick_win'))

    const totalMonthlyExpenses = Object.values(breakdown).reduce((s, v) => s + v, 0)
    const expenseRatioPct = computeExpenseRatioPct(totalMonthlyExpenses, monthlyRevenue)
    const optimizationScore = computeOptimizationScore(totalMonthlyExpenses, monthlyRevenue)
    const annualSavingPotential = computeTotalAnnualSavingPotential(opportunities)
    const optimizationPotential = classifyOptimizationPotential(annualSavingPotential, monthlyRevenue)
    const benchmarkComparison = buildBenchmarkComparison(breakdown, monthlyRevenue)

    return {
      period,
      monthly_revenue_try: monthlyRevenue,
      total_monthly_expenses_try: totalMonthlyExpenses,
      expense_ratio_pct: expenseRatioPct,
      optimization_score: optimizationScore,
      optimization_potential: optimizationPotential,
      total_annual_saving_potential_try: annualSavingPotential,
      opportunities,
      quick_wins: quickWins,
      expense_breakdown: breakdown,
      benchmark_comparison: benchmarkComparison,
    }
  }
}
