/**
 * Tests for lib/services/commercial/recurring-revenue.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/recurring-revenue.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  identifyRecurringCustomers,
  computeMrr,
  computeArr,
  computeChurnRate,
  computeExpansionRevenue,
  computeContractionRevenue,
  computeNetRevenueRetention,
  computeGrossRevenueRetention,
  classifyNrrHealth,
  computeRecurringRevenueRatio,
} from '../lib/services/commercial/recurring-revenue.service'

// ── identifyRecurringCustomers ────────────────────────────────────────────────

describe('identifyRecurringCustomers', () => {
  it('returns customer_id when meeting default thresholds', () => {
    const customers = [
      { customer_id: 'c1', purchase_count: 4, months_with_purchases: 4, total_months_active: 6 },
    ]
    expect(identifyRecurringCustomers(customers)).toContain('c1')
  })

  it('excludes customer with only 1 purchase (below min 2)', () => {
    const customers = [
      { customer_id: 'c2', purchase_count: 1, months_with_purchases: 1, total_months_active: 6 },
    ]
    expect(identifyRecurringCustomers(customers)).not.toContain('c2')
  })

  it('excludes customer with purchase_count below minMonthlyPurchases', () => {
    const customers = [
      { customer_id: 'c3', purchase_count: 1, months_with_purchases: 1, total_months_active: 3 },
    ]
    expect(identifyRecurringCustomers(customers, 2)).not.toContain('c3')
  })

  it('excludes customer with ratio below minRecurringRatio', () => {
    // 1 purchase in 6 months = 0.167 < 0.5
    const customers = [
      { customer_id: 'c4', purchase_count: 2, months_with_purchases: 1, total_months_active: 6 },
    ]
    expect(identifyRecurringCustomers(customers)).not.toContain('c4')
  })

  it('includes customer exactly at ratio threshold', () => {
    // 3 months_with_purchases / 6 total = 0.5 = threshold
    const customers = [
      { customer_id: 'c5', purchase_count: 3, months_with_purchases: 3, total_months_active: 6 },
    ]
    expect(identifyRecurringCustomers(customers)).toContain('c5')
  })

  it('returns empty array for empty input', () => {
    expect(identifyRecurringCustomers([])).toEqual([])
  })

  it('handles total_months_active === 0 safely (excludes)', () => {
    const customers = [
      { customer_id: 'c6', purchase_count: 5, months_with_purchases: 5, total_months_active: 0 },
    ]
    expect(identifyRecurringCustomers(customers)).not.toContain('c6')
  })

  it('respects custom thresholds', () => {
    const customers = [
      { customer_id: 'c7', purchase_count: 3, months_with_purchases: 2, total_months_active: 4 },
    ]
    // ratio = 2/4 = 0.5, purchase_count 3 >= 3
    expect(identifyRecurringCustomers(customers, 3, 0.5)).toContain('c7')
  })

  it('returns only recurring customers from a mixed list', () => {
    const customers = [
      { customer_id: 'recurring', purchase_count: 5, months_with_purchases: 5, total_months_active: 6 },
      { customer_id: 'one-time',  purchase_count: 1, months_with_purchases: 1, total_months_active: 6 },
    ]
    const result = identifyRecurringCustomers(customers)
    expect(result).toContain('recurring')
    expect(result).not.toContain('one-time')
  })
})

// ── computeMrr ────────────────────────────────────────────────────────────────

describe('computeMrr', () => {
  it('sums avg_monthly_revenue for all customers', () => {
    const customers = [
      { customer_id: 'c1', avg_monthly_revenue: 10_000 },
      { customer_id: 'c2', avg_monthly_revenue: 20_000 },
    ]
    expect(computeMrr(customers)).toBe(30_000)
  })

  it('returns 0 for empty list', () => {
    expect(computeMrr([])).toBe(0)
  })

  it('returns single customer revenue unchanged', () => {
    expect(computeMrr([{ customer_id: 'c1', avg_monthly_revenue: 5_000 }])).toBe(5_000)
  })
})

// ── computeArr ────────────────────────────────────────────────────────────────

describe('computeArr', () => {
  it('returns mrr × 12', () => {
    expect(computeArr(10_000)).toBe(120_000)
  })

  it('returns 0 for 0 mrr', () => {
    expect(computeArr(0)).toBe(0)
  })

  it('handles large values correctly', () => {
    expect(computeArr(1_000_000)).toBe(12_000_000)
  })
})

// ── computeChurnRate ──────────────────────────────────────────────────────────

describe('computeChurnRate', () => {
  it('computes churn rate correctly', () => {
    expect(computeChurnRate(5, 100)).toBe(5)
  })

  it('returns null when customersAtStartOfMonth is 0', () => {
    expect(computeChurnRate(5, 0)).toBeNull()
  })

  it('returns 0 when no customers churned', () => {
    expect(computeChurnRate(0, 50)).toBe(0)
  })

  it('returns 100 when all customers churned', () => {
    expect(computeChurnRate(50, 50)).toBe(100)
  })
})

// ── computeExpansionRevenue ───────────────────────────────────────────────────

describe('computeExpansionRevenue', () => {
  it('sums increases for expanding customers', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 1_000, current_month_revenue: 3_000 },
      { customer_id: 'c2', prior_month_revenue: 2_000, current_month_revenue: 5_000 },
    ]
    expect(computeExpansionRevenue(customers)).toBe(5_000) // 2000 + 3000
  })

  it('returns 0 for empty list', () => {
    expect(computeExpansionRevenue([])).toBe(0)
  })

  it('does not count contracting customers', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 5_000, current_month_revenue: 2_000 },
    ]
    expect(computeExpansionRevenue(customers)).toBe(0)
  })

  it('does not count customers with equal revenue', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 3_000, current_month_revenue: 3_000 },
    ]
    expect(computeExpansionRevenue(customers)).toBe(0)
  })

  it('handles mixed expansion and contraction', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 1_000, current_month_revenue: 4_000 }, // +3000
      { customer_id: 'c2', prior_month_revenue: 5_000, current_month_revenue: 2_000 }, // contraction, not counted
    ]
    expect(computeExpansionRevenue(customers)).toBe(3_000)
  })
})

// ── computeContractionRevenue ─────────────────────────────────────────────────

describe('computeContractionRevenue', () => {
  it('sums absolute decreases for contracting customers', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 5_000, current_month_revenue: 2_000 },
      { customer_id: 'c2', prior_month_revenue: 3_000, current_month_revenue: 1_000 },
    ]
    expect(computeContractionRevenue(customers)).toBe(5_000) // 3000 + 2000
  })

  it('returns 0 for empty list', () => {
    expect(computeContractionRevenue([])).toBe(0)
  })

  it('does not count expanding customers', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 1_000, current_month_revenue: 5_000 },
    ]
    expect(computeContractionRevenue(customers)).toBe(0)
  })

  it('always returns positive value', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 10_000, current_month_revenue: 1_000 },
    ]
    const result = computeContractionRevenue(customers)
    expect(result).toBeGreaterThan(0)
    expect(result).toBe(9_000)
  })

  it('does not count customers with equal revenue', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 4_000, current_month_revenue: 4_000 },
    ]
    expect(computeContractionRevenue(customers)).toBe(0)
  })
})

// ── computeNetRevenueRetention ────────────────────────────────────────────────

describe('computeNetRevenueRetention', () => {
  it('returns 100 for perfect retention with no churn/expansion/contraction', () => {
    expect(computeNetRevenueRetention(10_000, 0, 0, 0)).toBe(100)
  })

  it('returns >100 when expansion exceeds churn (negative churn)', () => {
    const nrr = computeNetRevenueRetention(10_000, 3_000, 0, 0)
    expect(nrr).toBeGreaterThan(100)
    expect(nrr).toBe(130)
  })

  it('returns <100 when there is churned revenue', () => {
    const nrr = computeNetRevenueRetention(10_000, 0, 0, 2_000)
    expect(nrr).toBe(80)
  })

  it('returns null when startingMrr is 0', () => {
    expect(computeNetRevenueRetention(0, 1_000, 0, 0)).toBeNull()
  })

  it('handles combined expansion and churn correctly', () => {
    // 10000 + 2000 expansion - 500 contraction - 1000 churn = 10500
    // NRR = 10500/10000 * 100 = 105
    const nrr = computeNetRevenueRetention(10_000, 2_000, 500, 1_000)
    expect(nrr).toBe(105)
  })

  it('can return negative NRR for massive churn', () => {
    const nrr = computeNetRevenueRetention(1_000, 0, 0, 2_000)
    expect(nrr).toBe(-100)
  })
})

// ── computeGrossRevenueRetention ──────────────────────────────────────────────

describe('computeGrossRevenueRetention', () => {
  it('returns 100 for perfect retention', () => {
    expect(computeGrossRevenueRetention(10_000, 0, 0)).toBe(100)
  })

  it('returns null when startingMrr is 0', () => {
    expect(computeGrossRevenueRetention(0, 500, 1_000)).toBeNull()
  })

  it('reduces with contraction revenue', () => {
    // (10000 - 2000 - 0) / 10000 * 100 = 80
    expect(computeGrossRevenueRetention(10_000, 2_000, 0)).toBe(80)
  })

  it('reduces with churn revenue', () => {
    // (10000 - 0 - 3000) / 10000 * 100 = 70
    expect(computeGrossRevenueRetention(10_000, 0, 3_000)).toBe(70)
  })

  it('is capped at 100% maximum', () => {
    // Would be > 100 if that were possible — ensure cap
    // startingMrr=10000, contraction=0, churn=0 → raw 100, capped 100
    expect(computeGrossRevenueRetention(10_000, 0, 0)).toBe(100)
  })

  it('cap applies even when formula would exceed 100', () => {
    // Passing negative contraction/churn is nonsensical, but the cap should hold
    const grr = computeGrossRevenueRetention(10_000, -2_000, 0) // raw = 120
    expect(grr).toBe(100)
  })
})

// ── classifyNrrHealth ─────────────────────────────────────────────────────────

describe('classifyNrrHealth', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyNrrHealth(null)).toBe('insufficient_data')
  })

  it('returns excellent for >= 120', () => {
    expect(classifyNrrHealth(120)).toBe('excellent')
    expect(classifyNrrHealth(150)).toBe('excellent')
  })

  it('returns good for >= 100 and < 120', () => {
    expect(classifyNrrHealth(100)).toBe('good')
    expect(classifyNrrHealth(119)).toBe('good')
  })

  it('returns neutral for >= 90 and < 100', () => {
    expect(classifyNrrHealth(90)).toBe('neutral')
    expect(classifyNrrHealth(99)).toBe('neutral')
  })

  it('returns at_risk for >= 70 and < 90', () => {
    expect(classifyNrrHealth(70)).toBe('at_risk')
    expect(classifyNrrHealth(89)).toBe('at_risk')
  })

  it('returns declining for < 70', () => {
    expect(classifyNrrHealth(69)).toBe('declining')
    expect(classifyNrrHealth(0)).toBe('declining')
    expect(classifyNrrHealth(-10)).toBe('declining')
  })

  it('boundary: exactly 120 is excellent', () => {
    expect(classifyNrrHealth(120)).toBe('excellent')
  })

  it('boundary: exactly 100 is good', () => {
    expect(classifyNrrHealth(100)).toBe('good')
  })

  it('boundary: exactly 90 is neutral', () => {
    expect(classifyNrrHealth(90)).toBe('neutral')
  })

  it('boundary: exactly 70 is at_risk', () => {
    expect(classifyNrrHealth(70)).toBe('at_risk')
  })
})

// ── computeRecurringRevenueRatio ──────────────────────────────────────────────

describe('computeRecurringRevenueRatio', () => {
  it('computes ratio correctly', () => {
    expect(computeRecurringRevenueRatio(5_000, 10_000)).toBe(50)
  })

  it('returns null when totalMonthlyRevenue is 0', () => {
    expect(computeRecurringRevenueRatio(1_000, 0)).toBeNull()
  })

  it('returns 100 when all revenue is recurring', () => {
    expect(computeRecurringRevenueRatio(10_000, 10_000)).toBe(100)
  })

  it('returns 0 when mrr is 0 but total is non-zero', () => {
    expect(computeRecurringRevenueRatio(0, 5_000)).toBe(0)
  })

  it('computes low ratio for mostly non-recurring business', () => {
    const ratio = computeRecurringRevenueRatio(1_000, 50_000)
    expect(ratio).toBe(2)
  })
})
