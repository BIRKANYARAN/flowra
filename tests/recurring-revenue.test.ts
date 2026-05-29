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

// ── identifyRecurringCustomers — extended ─────────────────────────────────────

describe('identifyRecurringCustomers — extended', () => {

  it('exact boundary: purchase_count = minMonthlyPurchases → included', () => {
    const customers = [
      { customer_id: 'c_exact', purchase_count: 2, months_with_purchases: 3, total_months_active: 6 },
    ]
    // ratio = 3/6 = 0.5 ≥ 0.5, count = 2 ≥ 2 → included
    expect(identifyRecurringCustomers(customers, 2, 0.5)).toContain('c_exact')
  })

  it('exact boundary: ratio exactly = minRecurringRatio → included', () => {
    const customers = [
      { customer_id: 'c_border', purchase_count: 4, months_with_purchases: 2, total_months_active: 4 },
    ]
    // ratio = 2/4 = 0.5, count=4 ≥ 2
    expect(identifyRecurringCustomers(customers, 2, 0.5)).toContain('c_border')
  })

  it('just below ratio threshold → excluded', () => {
    const customers = [
      { customer_id: 'c_below', purchase_count: 4, months_with_purchases: 2, total_months_active: 5 },
    ]
    // ratio = 2/5 = 0.4 < 0.5 → excluded
    expect(identifyRecurringCustomers(customers, 2, 0.5)).not.toContain('c_below')
  })

  it('returns ids in order matching filter result', () => {
    const customers = [
      { customer_id: 'r1', purchase_count: 5, months_with_purchases: 5, total_months_active: 6 },
      { customer_id: 'o1', purchase_count: 1, months_with_purchases: 1, total_months_active: 6 },
      { customer_id: 'r2', purchase_count: 4, months_with_purchases: 4, total_months_active: 6 },
    ]
    const result = identifyRecurringCustomers(customers)
    expect(result).toEqual(['r1', 'r2'])
  })

  it('high minRecurringRatio (0.9) excludes occasional buyers', () => {
    const customers = [
      { customer_id: 'c1', purchase_count: 5, months_with_purchases: 5, total_months_active: 6 },
    ]
    // ratio = 5/6 ≈ 0.833 < 0.9 → excluded
    expect(identifyRecurringCustomers(customers, 2, 0.9)).not.toContain('c1')
  })

  it('high minRecurringRatio (0.8) includes 5/6 ratio customer', () => {
    const customers = [
      { customer_id: 'c_hi', purchase_count: 5, months_with_purchases: 5, total_months_active: 6 },
    ]
    // ratio = 5/6 ≈ 0.833 ≥ 0.8 → included
    expect(identifyRecurringCustomers(customers, 2, 0.8)).toContain('c_hi')
  })

  it('customer with 100% ratio (every month active) → always included', () => {
    const customers = [
      { customer_id: 'perfect', purchase_count: 6, months_with_purchases: 6, total_months_active: 6 },
    ]
    expect(identifyRecurringCustomers(customers)).toContain('perfect')
  })

  it('large list — performance: 1000 customers, only high-ratio included', () => {
    const customers = Array.from({ length: 1000 }, (_, i) => ({
      customer_id:           `c${i}`,
      purchase_count:        i % 10 === 0 ? 5 : 1,
      months_with_purchases: i % 10 === 0 ? 5 : 1,
      total_months_active:   6,
    }))
    const result = identifyRecurringCustomers(customers)
    // Every 10th customer (100 customers) should be recurring
    expect(result).toHaveLength(100)
  })

  it('minMonthlyPurchases = 1 → any customer with 1+ purchase can qualify', () => {
    const customers = [
      { customer_id: 'single', purchase_count: 1, months_with_purchases: 1, total_months_active: 1 },
    ]
    // ratio = 1/1 = 1.0 ≥ 0.5, count ≥ 1
    expect(identifyRecurringCustomers(customers, 1, 0.5)).toContain('single')
  })

})

// ── computeMrr — extended ─────────────────────────────────────────────────────

describe('computeMrr — extended', () => {

  it('sums fractional revenue correctly', () => {
    const customers = [
      { customer_id: 'c1', avg_monthly_revenue: 1_000.50 },
      { customer_id: 'c2', avg_monthly_revenue: 999.50 },
    ]
    expect(computeMrr(customers)).toBeCloseTo(2_000)
  })

  it('10 equal customers → MRR = 10 × individual', () => {
    const customers = Array.from({ length: 10 }, (_, i) => ({
      customer_id:         `c${i}`,
      avg_monthly_revenue: 5_000,
    }))
    expect(computeMrr(customers)).toBe(50_000)
  })

  it('customer with 0 revenue → does not change MRR', () => {
    const customers = [
      { customer_id: 'c1', avg_monthly_revenue: 10_000 },
      { customer_id: 'c2', avg_monthly_revenue: 0 },
    ]
    expect(computeMrr(customers)).toBe(10_000)
  })

})

// ── computeArr — extended ─────────────────────────────────────────────────────

describe('computeArr — extended', () => {

  it('fractional MRR → ARR = mrr × 12', () => {
    expect(computeArr(1_500.75)).toBeCloseTo(18_009)
  })

  it('ARR is always 12× MRR', () => {
    const mrr = 37_500
    expect(computeArr(mrr)).toBe(mrr * 12)
  })

  it('large SME MRR → correct ARR', () => {
    expect(computeArr(500_000)).toBe(6_000_000)
  })

})

// ── computeChurnRate — extended ───────────────────────────────────────────────

describe('computeChurnRate — extended', () => {

  it('1 out of 20 → 5%', () => {
    expect(computeChurnRate(1, 20)).toBeCloseTo(5)
  })

  it('10 out of 100 → 10%', () => {
    expect(computeChurnRate(10, 100)).toBeCloseTo(10)
  })

  it('fractional inputs → result proportional', () => {
    expect(computeChurnRate(3, 60)).toBeCloseTo(5)
  })

  it('more churned than start → churn rate > 100', () => {
    // Unusual but mathematically valid
    expect(computeChurnRate(150, 100)).toBeCloseTo(150)
  })

})

// ── computeExpansionRevenue — extended ────────────────────────────────────────

describe('computeExpansionRevenue — extended', () => {

  it('multiple expanding customers with varying amounts', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 1_000, current_month_revenue: 5_000 },   // +4000
      { customer_id: 'c2', prior_month_revenue: 2_000, current_month_revenue: 2_001 },   // +1
      { customer_id: 'c3', prior_month_revenue: 0,     current_month_revenue: 3_000 },   // +3000 (new)
    ]
    expect(computeExpansionRevenue(customers)).toBe(7_001)
  })

  it('all flat → 0 expansion', () => {
    const customers = Array.from({ length: 5 }, (_, i) => ({
      customer_id: `c${i}`, prior_month_revenue: 1_000, current_month_revenue: 1_000,
    }))
    expect(computeExpansionRevenue(customers)).toBe(0)
  })

  it('large expansion from single customer', () => {
    const customers = [
      { customer_id: 'whale', prior_month_revenue: 1_000, current_month_revenue: 1_000_000 },
    ]
    expect(computeExpansionRevenue(customers)).toBe(999_000)
  })

})

// ── computeContractionRevenue — extended ──────────────────────────────────────

describe('computeContractionRevenue — extended', () => {

  it('single customer drops to 0 → full prior is contraction', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 5_000, current_month_revenue: 0 },
    ]
    expect(computeContractionRevenue(customers)).toBe(5_000)
  })

  it('multiple contracting customers summed', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 3_000, current_month_revenue: 1_000 },  // 2000
      { customer_id: 'c2', prior_month_revenue: 7_000, current_month_revenue: 5_000 },  // 2000
      { customer_id: 'c3', prior_month_revenue: 2_000, current_month_revenue: 4_000 },  // expanding: skip
    ]
    expect(computeContractionRevenue(customers)).toBe(4_000)
  })

  it('result is always non-negative', () => {
    const customers = [
      { customer_id: 'c1', prior_month_revenue: 10_000, current_month_revenue: 100 },
    ]
    expect(computeContractionRevenue(customers)).toBeGreaterThanOrEqual(0)
  })

})

// ── computeNetRevenueRetention — extended ─────────────────────────────────────

describe('computeNetRevenueRetention — extended', () => {

  it('NRR > 100 when expansion > churn + contraction', () => {
    const nrr = computeNetRevenueRetention(100_000, 20_000, 5_000, 5_000)
    expect(nrr).toBeGreaterThan(100)
  })

  it('NRR = 100 when expansion exactly offsets contraction + churn', () => {
    // 10000 + 2000 - 1000 - 1000 = 10000 → 100%
    const nrr = computeNetRevenueRetention(10_000, 2_000, 1_000, 1_000)
    expect(nrr).toBeCloseTo(100)
  })

  it('NRR < 100 when churn exceeds expansion', () => {
    const nrr = computeNetRevenueRetention(10_000, 0, 0, 1_000)
    expect(nrr).toBeLessThan(100)
  })

  it('large values: NRR computed accurately', () => {
    // 1M starting, 200k expansion, 0 contraction, 0 churn → NRR = 120%
    const nrr = computeNetRevenueRetention(1_000_000, 200_000, 0, 0)
    expect(nrr).toBeCloseTo(120)
  })

})

// ── computeGrossRevenueRetention — extended ───────────────────────────────────

describe('computeGrossRevenueRetention — extended', () => {

  it('GRR with churn only → below 100', () => {
    const grr = computeGrossRevenueRetention(10_000, 0, 2_000)
    expect(grr).toBe(80)
  })

  it('GRR with both churn and contraction → below 100', () => {
    const grr = computeGrossRevenueRetention(10_000, 2_000, 2_000)
    expect(grr).toBe(60)
  })

  it('GRR never exceeds 100 by design', () => {
    // Even with 0 churn and 0 contraction → exactly 100
    const grr = computeGrossRevenueRetention(50_000, 0, 0)
    expect(grr).toBe(100)
  })

  it('GRR: total churn + contraction = startingMrr → 0%', () => {
    const grr = computeGrossRevenueRetention(10_000, 5_000, 5_000)
    expect(grr).toBe(0)
  })

  it('large values → GRR proportional', () => {
    // 500k - 100k churn / 500k = 80%
    const grr = computeGrossRevenueRetention(500_000, 0, 100_000)
    expect(grr).toBe(80)
  })

})

// ── classifyNrrHealth — extended ──────────────────────────────────────────────

describe('classifyNrrHealth — extended', () => {

  it('120 is excellent, 119 is good', () => {
    expect(classifyNrrHealth(120)).toBe('excellent')
    expect(classifyNrrHealth(119)).toBe('good')
  })

  it('100 is good, 99 is neutral', () => {
    expect(classifyNrrHealth(100)).toBe('good')
    expect(classifyNrrHealth(99)).toBe('neutral')
  })

  it('90 is neutral, 89 is at_risk', () => {
    expect(classifyNrrHealth(90)).toBe('neutral')
    expect(classifyNrrHealth(89)).toBe('at_risk')
  })

  it('70 is at_risk, 69 is declining', () => {
    expect(classifyNrrHealth(70)).toBe('at_risk')
    expect(classifyNrrHealth(69)).toBe('declining')
  })

  it('negative NRR → declining', () => {
    expect(classifyNrrHealth(-50)).toBe('declining')
  })

  it('very high NRR (200) → excellent', () => {
    expect(classifyNrrHealth(200)).toBe('excellent')
  })

})

// ── computeRecurringRevenueRatio — extended ───────────────────────────────────

describe('computeRecurringRevenueRatio — extended', () => {

  it('25% ratio — MRR is a quarter of total', () => {
    expect(computeRecurringRevenueRatio(25_000, 100_000)).toBe(25)
  })

  it('75% ratio', () => {
    expect(computeRecurringRevenueRatio(75_000, 100_000)).toBe(75)
  })

  it('fractional: 1/3 → ~33.3%', () => {
    expect(computeRecurringRevenueRatio(1, 3)).toBeCloseTo(33.33, 1)
  })

  it('0% when mrr=0 and total>0', () => {
    expect(computeRecurringRevenueRatio(0, 100_000)).toBe(0)
  })

  it('can exceed 100% if MRR > total (unusual but no guard)', () => {
    // Function does not cap at 100
    const ratio = computeRecurringRevenueRatio(15_000, 10_000)
    expect(ratio).toBeCloseTo(150)
  })

})
