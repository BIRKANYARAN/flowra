/**
 * Budget vs Actuals — unit tests for pure helper functions
 *
 * Tests computeVariancePct, computeRevenueStatus, computeExpenseStatus,
 * and computeOverallStatus. No DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import {
  computeVariancePct,
  computeRevenueStatus,
  computeExpenseStatus,
  computeOverallStatus,
} from '../lib/services/finance/budget-variance.service'
import type { MonthlyVariance } from '../lib/services/finance/budget-variance.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMonth(
  overrides: Partial<MonthlyVariance> = {},
): MonthlyVariance {
  return {
    year: 2026,
    month: 1,
    label: 'Ocak 2026',
    actual_revenue_try: 100_000,
    actual_expense_try: 80_000,
    actual_gross_profit_try: 20_000,
    budget_revenue_try: 100_000,
    budget_expense_try: 80_000,
    budget_gross_profit_try: 20_000,
    revenue_variance_try: 0,
    expense_variance_try: 0,
    gross_profit_variance_try: 0,
    revenue_variance_pct: 0,
    expense_variance_pct: 0,
    gross_profit_variance_pct: 0,
    revenue_status: 'on_track',
    expense_status: 'on_budget',
    ...overrides,
  }
}

// ── computeVariancePct ────────────────────────────────────────────────────────

describe('computeVariancePct', () => {
  it('returns null when budget is null', () => {
    expect(computeVariancePct(100_000, null)).toBeNull()
  })

  it('returns null when budget is zero (avoid division by zero)', () => {
    expect(computeVariancePct(50_000, 0)).toBeNull()
  })

  it('returns 0 when actual equals budget', () => {
    expect(computeVariancePct(100_000, 100_000)).toBe(0)
  })

  it('returns positive % when actual exceeds budget', () => {
    // (110_000 - 100_000) / 100_000 × 100 = 10%
    expect(computeVariancePct(110_000, 100_000)).toBe(10)
  })

  it('returns negative % when actual is below budget', () => {
    // (90_000 - 100_000) / 100_000 × 100 = -10%
    expect(computeVariancePct(90_000, 100_000)).toBe(-10)
  })

  it('rounds to 2 decimal places', () => {
    // (103_333 - 100_000) / 100_000 × 100 = 3.333 → 3.33
    expect(computeVariancePct(103_333, 100_000)).toBe(3.33)
  })

  it('handles zero actual with non-zero budget', () => {
    // (0 - 100_000) / 100_000 × 100 = -100%
    expect(computeVariancePct(0, 100_000)).toBe(-100)
  })
})

// ── computeRevenueStatus ──────────────────────────────────────────────────────

describe('computeRevenueStatus', () => {
  it('returns no_budget when budget is null', () => {
    expect(computeRevenueStatus(100_000, null)).toBe('no_budget')
  })

  it('returns above when actual > budget × 1.05', () => {
    // budget=100_000, above threshold=105_000
    expect(computeRevenueStatus(106_000, 100_000)).toBe('above')
    expect(computeRevenueStatus(105_001, 100_000)).toBe('above')
  })

  it('returns below when actual < budget × 0.95', () => {
    // budget=100_000, below threshold=95_000
    expect(computeRevenueStatus(94_000, 100_000)).toBe('below')
    expect(computeRevenueStatus(94_999, 100_000)).toBe('below')
  })

  it('returns on_track when actual is within ±5% of budget', () => {
    expect(computeRevenueStatus(100_000, 100_000)).toBe('on_track')
    expect(computeRevenueStatus(105_000, 100_000)).toBe('on_track') // exactly at threshold = on_track
    expect(computeRevenueStatus(95_000,  100_000)).toBe('on_track') // exactly at threshold = on_track
    expect(computeRevenueStatus(97_000,  100_000)).toBe('on_track')
  })
})

// ── computeExpenseStatus ──────────────────────────────────────────────────────

describe('computeExpenseStatus', () => {
  it('returns no_budget when budget is null', () => {
    expect(computeExpenseStatus(80_000, null)).toBe('no_budget')
  })

  it('returns over_budget when actual > budget × 1.1', () => {
    // budget=80_000, over threshold=88_000
    expect(computeExpenseStatus(89_000, 80_000)).toBe('over_budget')
    expect(computeExpenseStatus(88_001, 80_000)).toBe('over_budget')
  })

  it('returns under_budget when actual < budget × 0.9', () => {
    // budget=80_000, under threshold=72_000
    expect(computeExpenseStatus(71_000, 80_000)).toBe('under_budget')
    expect(computeExpenseStatus(71_999, 80_000)).toBe('under_budget')
  })

  it('returns on_budget when actual is within ±10% of budget', () => {
    expect(computeExpenseStatus(80_000, 80_000)).toBe('on_budget')
    expect(computeExpenseStatus(88_000, 80_000)).toBe('on_budget') // exactly at threshold = on_budget
    expect(computeExpenseStatus(72_000, 80_000)).toBe('on_budget') // exactly at threshold = on_budget
    expect(computeExpenseStatus(75_000, 80_000)).toBe('on_budget')
  })
})

// ── computeOverallStatus ──────────────────────────────────────────────────────

describe('computeOverallStatus', () => {
  it('returns no_budget for empty months array', () => {
    expect(computeOverallStatus([])).toBe('no_budget')
  })

  it('returns no_budget when all months have null budgets', () => {
    const months = [
      makeMonth({ budget_revenue_try: null, budget_expense_try: null }),
      makeMonth({ budget_revenue_try: null, budget_expense_try: null }),
    ]
    expect(computeOverallStatus(months)).toBe('no_budget')
  })

  it('returns on_track when all months are within acceptable range', () => {
    const months = [
      makeMonth({
        actual_revenue_try: 100_000,
        budget_revenue_try: 100_000,
        revenue_status: 'on_track',
        actual_expense_try: 80_000,
        budget_expense_try: 80_000,
        expense_status: 'on_budget',
      }),
      makeMonth({
        actual_revenue_try: 102_000,
        budget_revenue_try: 100_000,
        revenue_status: 'on_track',
        actual_expense_try: 81_000,
        budget_expense_try: 82_000,
        expense_status: 'on_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('on_track')
  })

  it('returns over_budget when any month has expense > budget × 1.15', () => {
    const months = [
      makeMonth({
        actual_expense_try: 93_000,  // 93_000 > 80_000 × 1.15 = 92_000
        budget_expense_try: 80_000,
        expense_status: 'over_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('over_budget')
  })

  it('returns over_budget before at_risk (over_budget is checked first)', () => {
    // Month has both expense > 1.15 and revenue < 0.95
    const months = [
      makeMonth({
        actual_revenue_try: 90_000,   // < 100_000 × 0.95 = 95_000
        budget_revenue_try: 100_000,
        actual_expense_try: 95_000,   // > 80_000 × 1.15 = 92_000
        budget_expense_try: 80_000,
        revenue_status: 'below',
        expense_status: 'over_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('over_budget')
  })

  it('returns at_risk when revenue is below 95% of budget', () => {
    const months = [
      makeMonth({
        actual_revenue_try: 90_000,   // < 100_000 × 0.95 = 95_000
        budget_revenue_try: 100_000,
        actual_expense_try: 80_000,   // within range
        budget_expense_try: 80_000,
        revenue_status: 'below',
        expense_status: 'on_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('at_risk')
  })

  it('returns at_risk when expense exceeds 105% of budget but not 115%', () => {
    const months = [
      makeMonth({
        actual_revenue_try: 100_000,
        budget_revenue_try: 100_000,
        actual_expense_try: 87_000,   // > 80_000 × 1.05 = 84_000, < 80_000 × 1.15 = 92_000
        budget_expense_try: 80_000,
        revenue_status: 'on_track',
        expense_status: 'over_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('at_risk')
  })

  it('ignores months with null budget when computing status', () => {
    // One month has budget (on_track), one has no budget
    const months = [
      makeMonth({
        actual_revenue_try: 100_000,
        budget_revenue_try: 100_000,
        actual_expense_try: 80_000,
        budget_expense_try: 80_000,
        revenue_status: 'on_track',
        expense_status: 'on_budget',
      }),
      makeMonth({
        budget_revenue_try: null,
        budget_expense_try: null,
        revenue_status: 'no_budget',
        expense_status: 'no_budget',
      }),
    ]
    expect(computeOverallStatus(months)).toBe('on_track')
  })
})
