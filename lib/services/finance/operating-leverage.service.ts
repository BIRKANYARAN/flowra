// ── OperatingLeverageService — Operating Leverage & Cost Structure Analytics ──
//
// Provides degree of operating leverage (DOL), cost structure decomposition
// (fixed / variable / semi-variable), contribution margin analysis, break-even
// revenue, and margin of safety for Turkish SME companies.
//
// Pure functions are exported for unit-testing; the OperatingLeverageService
// class wraps Supabase queries and returns an OperatingLeverageReport.

import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

// ══ Pure Functions ═════════════════════════════════════════════════════════════

/**
 * Compute Degree of Operating Leverage (DOL).
 *
 * DOL = (%ΔEBIT) / (%ΔRevenue)
 *     = (ebitChange / priorEbit) / (revenueChange / priorRevenue)
 *
 * Returns null if priorEbit === 0 or revenueChange === 0.
 */
export function computeDol(
  revenueChange: number,
  ebitChange: number,
  priorRevenue: number,
  priorEbit: number,
): number | null {
  if (priorEbit === 0 || revenueChange === 0) return null
  const pctRevenue = revenueChange / priorRevenue
  const pctEbit    = ebitChange    / priorEbit
  return pctEbit / pctRevenue
}

/**
 * Classify DOL level by magnitude.
 *
 * low:            |dol| <= 1.5
 * moderate:       |dol| <= 2.5
 * high:           |dol| <= 4.0
 * very_high:      |dol| <= 7.0
 * extreme:        |dol|  > 7.0
 * insufficient_data: null
 */
export function classifyDolLevel(
  dol: number | null,
): 'low' | 'moderate' | 'high' | 'very_high' | 'extreme' | 'insufficient_data' {
  if (dol === null) return 'insufficient_data'
  const abs = Math.abs(dol)
  if (abs <= 1.5) return 'low'
  if (abs <= 2.5) return 'moderate'
  if (abs <= 4.0) return 'high'
  if (abs <= 7.0) return 'very_high'
  return 'extreme'
}

/**
 * Compute fixed cost ratio: fixedCosts / totalCosts.
 * Returns null if totalCosts === 0. Result is fraction 0–1.
 */
export function computeFixedCostRatio(
  fixedCosts: number,
  totalCosts: number,
): number | null {
  if (totalCosts === 0) return null
  return fixedCosts / totalCosts
}

/**
 * Classify cost profile by fixed cost ratio (fraction).
 *
 * variable_heavy:  ratio <  0.20
 * balanced:        ratio <  0.40
 * fixed_heavy:     ratio <  0.65
 * highly_fixed:    ratio >= 0.65
 * insufficient_data: null
 */
export function classifyFixedCostProfile(
  ratio: number | null,
): 'variable_heavy' | 'balanced' | 'fixed_heavy' | 'highly_fixed' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio < 0.20) return 'variable_heavy'
  if (ratio < 0.40) return 'balanced'
  if (ratio < 0.65) return 'fixed_heavy'
  return 'highly_fixed'
}

/**
 * Compute contribution margin: revenue - variableCosts.
 */
export function computeContributionMargin(
  revenue: number,
  variableCosts: number,
): number {
  return revenue - variableCosts
}

/**
 * Compute contribution margin ratio (CMR): (revenue - variableCosts) / revenue.
 * Returns null if revenue === 0. Result is fraction 0–1 (can exceed 1 or be negative).
 */
export function computeContributionMarginRatio(
  revenue: number,
  variableCosts: number,
): number | null {
  if (revenue === 0) return null
  return (revenue - variableCosts) / revenue
}

/**
 * Compute break-even revenue: fixedCosts / CMR.
 * Returns null if cmr is null or cmr <= 0.
 */
export function computeBreakEvenRevenue(
  fixedCosts: number,
  cmr: number | null,
): number | null {
  if (cmr === null || cmr <= 0) return null
  return fixedCosts / cmr
}

/**
 * Compute margin of safety: (revenue - breakEvenRevenue) / revenue.
 * Returns null if breakEvenRevenue is null or revenue === 0.
 * Result is fraction (can be negative = below break-even).
 */
export function computeMarginOfSafety(
  revenue: number,
  breakEvenRevenue: number | null,
): number | null {
  if (breakEvenRevenue === null || revenue === 0) return null
  return (revenue - breakEvenRevenue) / revenue
}

/**
 * Classify margin of safety level.
 *
 * very_safe:        ratio >= 0.40
 * safe:             ratio >= 0.25
 * moderate:         ratio >= 0.15
 * thin:             ratio >= 0.05
 * at_risk:          ratio >= 0.0 (at or above break-even, but very tight)
 * below_breakeven:  ratio <  0.0
 * insufficient_data: null
 */
export function classifyMarginOfSafety(
  ratio: number | null,
): 'very_safe' | 'safe' | 'moderate' | 'thin' | 'at_risk' | 'below_breakeven' | 'insufficient_data' {
  if (ratio === null) return 'insufficient_data'
  if (ratio >= 0.40) return 'very_safe'
  if (ratio >= 0.25) return 'safe'
  if (ratio >= 0.15) return 'moderate'
  if (ratio >= 0.05) return 'thin'
  if (ratio >= 0.0)  return 'at_risk'
  return 'below_breakeven'
}

/**
 * Compute operating leverage ratio: fixedCosts / (fixedCosts + variableCosts).
 * Returns null if total === 0.
 */
export function computeOperatingLeverageRatio(
  fixedCosts: number,
  variableCosts: number,
): number | null {
  const total = fixedCosts + variableCosts
  if (total === 0) return null
  return fixedCosts / total
}

/**
 * Compute variable cost rate: variableCosts / revenue.
 * Returns null if revenue === 0. Result is fraction 0–1.
 */
export function computeVariableCostRate(
  variableCosts: number,
  revenue: number,
): number | null {
  if (revenue === 0) return null
  return variableCosts / revenue
}

/**
 * Compute fixed cost rate: fixedCosts / revenue.
 * Returns null if revenue === 0. Result is fraction 0–1.
 */
export function computeFixedCostRate(
  fixedCosts: number,
  revenue: number,
): number | null {
  if (revenue === 0) return null
  return fixedCosts / revenue
}

/**
 * Estimate cost sensitivity: how much does total cost change (as %) per
 * revenueChangePct revenue change.
 *
 * result = variableCostRate × revenueChangePct × 100  (in %)
 *
 * Default revenueChangePct = 0.01 (1%).
 * Returns null if variableCostRate is null.
 */
export function computeCostSensitivity(
  variableCostRate: number | null,
  revenueChangePct = 0.01,
): number | null {
  if (variableCostRate === null) return null
  return variableCostRate * revenueChangePct * 100
}

// ══ Expense Nature Classification ═════════════════════════════════════════════

const FIXED_LABELS = new Set([
  'rent', 'salary', 'insurance', 'subscription', 'software',
  'lease', 'depreciation',
])

const VARIABLE_LABELS = new Set([
  'logistics', 'shipping', 'marketing', 'sales', 'cogs',
  'materials', 'packaging', 'commission',
])

/**
 * Classify expense by nature based on the expense_type label.
 *
 * fixed:        rent, salary, insurance, subscription, software, lease, depreciation
 * variable:     logistics, shipping, marketing, sales, cogs, materials, packaging, commission
 * semi_variable: everything else
 */
export function classifyExpenseNatureByLabel(
  expenseType: string,
): 'fixed' | 'variable' | 'semi_variable' {
  const t = expenseType.toLowerCase().trim()
  if (FIXED_LABELS.has(t))    return 'fixed'
  if (VARIABLE_LABELS.has(t)) return 'variable'
  return 'semi_variable'
}

// ══ Narrative ════════════════════════════════════════════════════════════════

/**
 * Generate Turkish operating leverage narrative.
 */
export function generateOperatingLeverageNarrative(params: {
  dol: number | null
  dolLevel: ReturnType<typeof classifyDolLevel>
  fixedCostRatio: number | null
  breakEvenRevenue: number | null
  marginOfSafety: number | null
  currentRevenue: number
}): string {
  const { dol, dolLevel, fixedCostRatio, breakEvenRevenue, marginOfSafety, currentRevenue } = params

  const dolStr = dol !== null
    ? `Operasyonel kaldıraç ${dol.toFixed(2)}x — her %1 gelir artışı FVÖK'ü yaklaşık %${Math.abs(dol).toFixed(1)} değiştiriyor.`
    : 'Operasyonel kaldıraç hesaplanamadı (önceki dönem verisi yetersiz).'

  const levelMap: Record<ReturnType<typeof classifyDolLevel>, string> = {
    low:               'Kaldıraç düzeyi düşük, maliyet yapısı esneklik sağlıyor.',
    moderate:          'Kaldıraç düzeyi orta, dengeli bir maliyet yapısı mevcut.',
    high:              'Kaldıraç düzeyi yüksek, gelir dalgalanmaları kâra belirgin yansıyor.',
    very_high:         'Kaldıraç düzeyi çok yüksek, gelir değişimlerine karşı hassasiyet kritik.',
    extreme:           'Kaldıraç düzeyi aşırı, küçük gelir düşüşleri bile büyük zarar yaratabilir.',
    insufficient_data: '',
  }

  const fixedStr = fixedCostRatio !== null
    ? ` Sabit gider oranı %${(fixedCostRatio * 100).toFixed(1)}.`
    : ''

  const beStr = breakEvenRevenue !== null
    ? ` Başabaş noktası ₺${breakEvenRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}.`
    : ''

  const mosStr = marginOfSafety !== null
    ? ` Mevcut marj güvenliği %${(marginOfSafety * 100).toFixed(1)}${marginOfSafety < 0 ? ' (başabaşın altında!)' : ''}.`
    : ''

  const levelNote = levelMap[dolLevel] ? ` ${levelMap[dolLevel]}` : ''

  return `${dolStr}${levelNote}${fixedStr}${beStr}${mosStr}`.trim()
}

// ══ Report Interface ══════════════════════════════════════════════════════════

export interface OperatingLeverageReport {
  // DOL
  dol: number | null
  dol_level: ReturnType<typeof classifyDolLevel>
  // Cost structure
  fixed_costs_try: number
  variable_costs_try: number
  semi_variable_costs_try: number
  total_costs_try: number
  fixed_cost_ratio: number | null
  cost_profile: ReturnType<typeof classifyFixedCostProfile>
  // Contribution analysis
  revenue_try: number
  contribution_margin_try: number
  contribution_margin_ratio: number | null
  // Break-even
  break_even_revenue_try: number | null
  margin_of_safety: number | null
  margin_of_safety_health: ReturnType<typeof classifyMarginOfSafety>
  // Period comparison
  prior_revenue_try: number | null
  prior_ebit_try: number | null
  current_ebit_try: number
  // Sensitivity
  variable_cost_rate: number | null
  fixed_cost_rate: number | null
  cost_sensitivity_pct: number | null
  narrative: string
  period_months: number
}

// ══ Internal DB Row Types ══════════════════════════════════════════════════════

interface ExpenseRow {
  amount:       number | null
  expense_type: string | null
}

interface SaleRow {
  total: number | null
}

// ══ Service Class ═════════════════════════════════════════════════════════════

export class OperatingLeverageService {

  constructor(private readonly supabase: AnyClient) {}

  async getReport(
    companyId: string,
    periodMonths = 3,
  ): Promise<OperatingLeverageReport> {
    const today    = new Date()
    const asOfDate = today.toISOString().slice(0, 10)

    // Current period: last `periodMonths` months
    const currentStart = new Date(today)
    currentStart.setMonth(currentStart.getMonth() - periodMonths)
    const currentStartStr = currentStart.toISOString().slice(0, 10)

    // Prior period: same length, ending just before current period starts
    const priorEnd   = new Date(currentStart)
    priorEnd.setDate(priorEnd.getDate() - 1)
    const priorStart = new Date(priorEnd)
    priorStart.setMonth(priorStart.getMonth() - periodMonths)
    const priorStartStr = priorStart.toISOString().slice(0, 10)
    const priorEndStr   = priorEnd.toISOString().slice(0, 10)

    // Fetch all four in parallel; use allSettled for graceful degradation
    const [currentExpRes, priorExpRes, currentSalesRes, priorSalesRes] =
      await Promise.allSettled([
        this.supabase
          .from('expenses')
          .select('amount, expense_type')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', currentStartStr)
          .lte('expense_date', asOfDate),

        this.supabase
          .from('expenses')
          .select('amount, expense_type')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .gte('expense_date', priorStartStr)
          .lte('expense_date', priorEndStr),

        this.supabase
          .from('sales')
          .select('total')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('proforma', true)
          .gte('created_at', currentStartStr)
          .lte('created_at', asOfDate),

        this.supabase
          .from('sales')
          .select('total')
          .eq('company_id', companyId)
          .is('deleted_at', null)
          .neq('proforma', true)
          .gte('created_at', priorStartStr)
          .lte('created_at', priorEndStr),
      ])

    // Extract data safely
    const currentExpenses: ExpenseRow[] =
      currentExpRes.status === 'fulfilled' ? ((currentExpRes.value.data ?? []) as ExpenseRow[]) : []

    const priorExpenses: ExpenseRow[] =
      priorExpRes.status === 'fulfilled' ? ((priorExpRes.value.data ?? []) as ExpenseRow[]) : []

    const currentSales: SaleRow[] =
      currentSalesRes.status === 'fulfilled' ? ((currentSalesRes.value.data ?? []) as SaleRow[]) : []

    const priorSales: SaleRow[] =
      priorSalesRes.status === 'fulfilled' ? ((priorSalesRes.value.data ?? []) as SaleRow[]) : []

    // ── Revenue ──────────────────────────────────────────────────────────────
    const revenue      = currentSales.reduce((s, r) => s + Number(r.total ?? 0), 0)
    const priorRevenue = priorSales.reduce((s, r) => s + Number(r.total ?? 0), 0)

    // ── Cost classification ───────────────────────────────────────────────────
    let fixedCosts       = 0
    let variableCosts    = 0
    let semiVariableCosts = 0

    for (const row of currentExpenses) {
      const amount = Number(row.amount ?? 0)
      const nature = classifyExpenseNatureByLabel(row.expense_type ?? 'other')
      if (nature === 'fixed')         fixedCosts        += amount
      else if (nature === 'variable') variableCosts     += amount
      else                            semiVariableCosts += amount
    }

    let priorFixedCosts       = 0
    let priorVariableCosts    = 0
    let priorSemiVariableCosts = 0

    for (const row of priorExpenses) {
      const amount = Number(row.amount ?? 0)
      const nature = classifyExpenseNatureByLabel(row.expense_type ?? 'other')
      if (nature === 'fixed')         priorFixedCosts        += amount
      else if (nature === 'variable') priorVariableCosts     += amount
      else                            priorSemiVariableCosts += amount
    }

    const totalCosts      = fixedCosts + variableCosts + semiVariableCosts
    const priorTotalCosts = priorFixedCosts + priorVariableCosts + priorSemiVariableCosts

    // ── EBIT (simplified: revenue - total costs) ─────────────────────────────
    const currentEbit = revenue - totalCosts
    const priorEbit   = priorRevenue - priorTotalCosts

    // ── DOL ──────────────────────────────────────────────────────────────────
    const revenueChange = revenue - priorRevenue
    const ebitChange    = currentEbit - priorEbit

    const dol      = computeDol(revenueChange, ebitChange, priorRevenue, priorEbit)
    const dolLevel = classifyDolLevel(dol)

    // ── Cost structure ratios ─────────────────────────────────────────────────
    const fixedCostRatio = computeFixedCostRatio(fixedCosts, totalCosts)
    const costProfile    = classifyFixedCostProfile(fixedCostRatio)

    // ── Contribution margin (fixed + variable only; semi-variable treated as variable) ──
    const effectiveVariable  = variableCosts + semiVariableCosts
    const contributionMargin = computeContributionMargin(revenue, effectiveVariable)
    const cmr                = computeContributionMarginRatio(revenue, effectiveVariable)

    // ── Break-even ────────────────────────────────────────────────────────────
    const breakEvenRevenue = computeBreakEvenRevenue(fixedCosts, cmr)
    const marginOfSafety   = computeMarginOfSafety(revenue, breakEvenRevenue)
    const mosHealth        = classifyMarginOfSafety(marginOfSafety)

    // ── Rate metrics ──────────────────────────────────────────────────────────
    const variableCostRate  = computeVariableCostRate(effectiveVariable, revenue)
    const fixedCostRate     = computeFixedCostRate(fixedCosts, revenue)
    const costSensitivity   = computeCostSensitivity(variableCostRate)

    // ── Narrative ─────────────────────────────────────────────────────────────
    const narrative = generateOperatingLeverageNarrative({
      dol,
      dolLevel,
      fixedCostRatio,
      breakEvenRevenue,
      marginOfSafety,
      currentRevenue: revenue,
    })

    return {
      dol,
      dol_level: dolLevel,
      fixed_costs_try:         fixedCosts,
      variable_costs_try:      variableCosts,
      semi_variable_costs_try: semiVariableCosts,
      total_costs_try:         totalCosts,
      fixed_cost_ratio:        fixedCostRatio,
      cost_profile:            costProfile,
      revenue_try:             revenue,
      contribution_margin_try: contributionMargin,
      contribution_margin_ratio: cmr,
      break_even_revenue_try:  breakEvenRevenue,
      margin_of_safety:        marginOfSafety,
      margin_of_safety_health: mosHealth,
      prior_revenue_try:       priorRevenue > 0 ? priorRevenue : null,
      prior_ebit_try:          priorRevenue > 0 ? priorEbit    : null,
      current_ebit_try:        currentEbit,
      variable_cost_rate:      variableCostRate,
      fixed_cost_rate:         fixedCostRate,
      cost_sensitivity_pct:    costSensitivity,
      narrative,
      period_months: periodMonths,
    }
  }
}
