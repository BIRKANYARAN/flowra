// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION — ENHANCED PURE HELPERS
//
// Client-safe: no auth/Supabase/next/headers imports. Extracted from
// simulation.service.ts so 'use client' components (e.g. MultiScenarioTab) can
// import these without dragging the server-only service chain into the bundle.
// simulation.service.ts re-exports everything here for backward compatibility.
// ═══════════════════════════════════════════════════════════════════════════════

import { round2, round4 } from '@/lib/services/finance-rules'

/**
 * Distribute total annual revenue across 12 months using the provided weights.
 * Weights are normalised to sum=1 internally — caller need not pre-normalise.
 */
export function distributeRevenue(
  annualRevenue: number,
  weights: number[],   // 12 values; must all be >= 0
): number[] {
  if (weights.length !== 12) {
    throw new Error('weights must have exactly 12 elements')
  }
  const total = weights.reduce((s, w) => s + w, 0)
  if (total <= 0) {
    throw new Error('weights must sum to a positive number')
  }
  const result = weights.map(w => round2(annualRevenue * (w / total)))
  // Absorb rounding error into last month so Σ == annualRevenue exactly
  const allocated = result.reduce((s, v) => s + v, 0)
  result[11] = round2(result[11] + (annualRevenue - allocated))
  return result
}

/** Standard seasonal weight presets (12 elements each). */
export const SEASONAL_PRESETS: Record<string, number[]> = {
  uniform:     Array(12).fill(1),
  q4_heavy:    [6, 6, 8, 8, 8, 8, 8, 8, 8, 10, 11, 11],   // retail-style
  summer_peak: [6, 6, 8, 10, 11, 12, 12, 11, 10, 8, 8, 8], // tourism/construction
  jan_reset:   [12, 10, 9, 8, 8, 8, 8, 8, 8, 7, 7, 7],     // B2B software
}

/**
 * Compute the Debt Service Ratio for a single month.
 * DSR = (interestExpense + principalRepayment) / max(1, netIncome), capped at 2.0
 */
export function computeMonthlyDSR(
  netIncome: number,
  interestExpense: number,
  principalRepayment: number,
): number {
  const debtService = interestExpense + principalRepayment
  const denominator = Math.max(1, netIncome)
  return Math.min(2.0, round4(debtService / denominator))
}

/**
 * Classify a DSR value into a stress level.
 *   healthy   < 0.3
 *   strained  < 0.7
 *   critical  < 1.0
 *   insolvent >= 1.0
 */
export function classifyDSR(dsr: number): 'healthy' | 'strained' | 'critical' | 'insolvent' {
  if (dsr < 0.3) return 'healthy'
  if (dsr < 0.7) return 'strained'
  if (dsr < 1.0) return 'critical'
  return 'insolvent'
}

/**
 * Given an array of scenario summaries, return the id of the recommended one.
 *
 * Recommended = highest net_income_total WHERE runway_end_month > 6 AND max_dsr < 0.7.
 * Fallback: highest net_income_total if no scenario meets all criteria.
 */
export function recommendScenario(
  scenarios: Array<{
    id: string
    net_income_total: number
    runway_end_month: number | null
    max_dsr: number
  }>,
): string {
  if (scenarios.length === 0) throw new Error('scenarios array must not be empty')

  const qualified = scenarios.filter(
    s => (s.runway_end_month === null || s.runway_end_month > 6) && s.max_dsr < 0.7,
  )

  const pool = qualified.length > 0 ? qualified : scenarios
  return pool.reduce((best, s) =>
    s.net_income_total > best.net_income_total ? s : best,
  ).id
}

/**
 * Find the first month index (0-based) at which cumulative profit turns positive.
 * Returns null if the array never goes positive.
 */
export function findBreakEvenMonth(monthlyNetIncome: number[]): number | null {
  let cumulative = 0
  for (let i = 0; i < monthlyNetIncome.length; i++) {
    cumulative += monthlyNetIncome[i]
    if (cumulative > 0) return i
  }
  return null
}

/**
 * Find the first month index (0-based) at which cumulative cash turns negative (runway end).
 * Returns null if cash never goes negative in the array.
 */
export function findRunwayEnd(monthlyCash: number[]): number | null {
  let cumulative = 0
  for (let i = 0; i < monthlyCash.length; i++) {
    cumulative += monthlyCash[i]
    if (cumulative < 0) return i
  }
  return null
}
