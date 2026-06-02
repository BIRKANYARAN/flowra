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

/**
 * Compute Cash Conversion Cycle.
 * CCC = DSO - DPO + DIO
 */
export function computeCCC(dso: number, dpo: number, dio: number): number {
  return dso - dpo + dio
}

/**
 * Classify working capital efficiency based on CCC.
 * excellent: ccc < 0  (negative CCC = cash collected before paying suppliers)
 * good:      0 <= ccc <= 30
 * fair:      30 < ccc <= 60
 * poor:      ccc > 60
 */
export function classifyWCEfficiency(
  ccc: number,
): 'excellent' | 'good' | 'fair' | 'poor' {
  if (ccc < 0)   return 'excellent'
  if (ccc <= 30) return 'good'
  if (ccc <= 60) return 'fair'
  return 'poor'
}

/**
 * Compute optimal reorder point and whether to order now.
 * reorderPoint = (dailyUsage * leadTimeDays) + (dailyUsage * safetyStockDays)
 * orderNow     = currentQty <= reorderPoint
 */
export function computeReorderTiming(
  currentQty: number,
  dailyUsage: number,
  leadTimeDays: number,
  safetyStockDays: number,
): { reorderPoint: number; orderNow: boolean } {
  const reorderPoint = (dailyUsage * leadTimeDays) + (dailyUsage * safetyStockDays)
  return {
    reorderPoint,
    orderNow: currentQty <= reorderPoint,
  }
}
