// ── tests/customer-ltv-enhanced.test.ts ──────────────────────────────────────
// Unit tests for lib/services/commercial/customer-ltv-enhanced.service.ts
// All pure functions — no DB calls, no side effects.
// Run with: npx vitest run tests/customer-ltv-enhanced.test.ts

import { describe, it, expect } from 'vitest'
import {
  computeAvgOrderValue,
  computePurchaseFrequency,
  computeSimpleLtv,
  computeMarginAdjustedLtv,
  computeLtvCacRatio,
  classifyLtvCacHealth,
  classifyLtvTier,
  computePaybackPeriod,
  classifyPaybackPeriod,
  computeRevenueConcentrationHhi,
  classifyRevenueConcentration,
  computeNetRevenueRetentionRate,
  generateLtvNarrative,
} from '../lib/services/commercial/customer-ltv-enhanced.service'

// ── computeAvgOrderValue ──────────────────────────────────────────────────────

describe('computeAvgOrderValue', () => {
  it('returns null when orderCount is 0', () => {
    expect(computeAvgOrderValue(10000, 0)).toBeNull()
  })

  it('returns null when orderCount is 0 even with non-zero revenue', () => {
    expect(computeAvgOrderValue(50000, 0)).toBeNull()
  })

  it('computes correctly for 1 order', () => {
    expect(computeAvgOrderValue(5000, 1)).toBe(5000)
  })

  it('computes average correctly for multiple orders', () => {
    expect(computeAvgOrderValue(12000, 4)).toBe(3000)
  })

  it('handles 10 orders with 100000 total', () => {
    expect(computeAvgOrderValue(100000, 10)).toBe(10000)
  })

  it('handles fractional result', () => {
    expect(computeAvgOrderValue(10000, 3)).toBeCloseTo(3333.33, 1)
  })

  it('returns 0 when total revenue is 0 and orderCount > 0', () => {
    expect(computeAvgOrderValue(0, 5)).toBe(0)
  })
})

// ── computePurchaseFrequency ──────────────────────────────────────────────────

describe('computePurchaseFrequency', () => {
  it('returns null when activeMonths is 0', () => {
    expect(computePurchaseFrequency(12, 0)).toBeNull()
  })

  it('returns null when activeMonths is 0 even with orders', () => {
    expect(computePurchaseFrequency(100, 0)).toBeNull()
  })

  it('computes 1 order per month correctly', () => {
    expect(computePurchaseFrequency(12, 12)).toBe(1)
  })

  it('computes 2 orders per month correctly', () => {
    expect(computePurchaseFrequency(24, 12)).toBe(2)
  })

  it('computes fractional frequency correctly', () => {
    expect(computePurchaseFrequency(3, 6)).toBe(0.5)
  })

  it('computes for single active month', () => {
    expect(computePurchaseFrequency(5, 1)).toBe(5)
  })

  it('computes correctly for large values', () => {
    expect(computePurchaseFrequency(120, 24)).toBe(5)
  })

  it('returns 0 when orderCount is 0', () => {
    expect(computePurchaseFrequency(0, 12)).toBe(0)
  })
})

// ── computeSimpleLtv ──────────────────────────────────────────────────────────

describe('computeSimpleLtv', () => {
  it('returns null when avgOrderValue is null', () => {
    expect(computeSimpleLtv(null, 2, 12)).toBeNull()
  })

  it('returns null when monthlyFrequency is null', () => {
    expect(computeSimpleLtv(1000, null, 12)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(computeSimpleLtv(null, null, 12)).toBeNull()
  })

  it('computes formula correctly: 1000 × 2 × 12 = 24000', () => {
    expect(computeSimpleLtv(1000, 2, 12)).toBe(24000)
  })

  it('computes formula correctly: 500 × 1 × 24 = 12000', () => {
    expect(computeSimpleLtv(500, 1, 24)).toBe(12000)
  })

  it('handles lifespan of 1 month', () => {
    expect(computeSimpleLtv(2000, 3, 1)).toBe(6000)
  })

  it('handles fractional frequency', () => {
    expect(computeSimpleLtv(4000, 0.5, 12)).toBe(24000)
  })

  it('returns 0 when avgOrderValue is 0', () => {
    expect(computeSimpleLtv(0, 2, 12)).toBe(0)
  })
})

// ── computeMarginAdjustedLtv ──────────────────────────────────────────────────

describe('computeMarginAdjustedLtv', () => {
  it('returns null when simpleLtv is null', () => {
    expect(computeMarginAdjustedLtv(null, 30)).toBeNull()
  })

  it('returns null when simpleLtv is null with any margin', () => {
    expect(computeMarginAdjustedLtv(null, 0)).toBeNull()
  })

  it('returns 0 when grossMarginPct is 0', () => {
    expect(computeMarginAdjustedLtv(100000, 0)).toBe(0)
  })

  it('applies 30% margin correctly: 100000 × 30/100 = 30000', () => {
    expect(computeMarginAdjustedLtv(100000, 30)).toBe(30000)
  })

  it('applies 50% margin correctly', () => {
    expect(computeMarginAdjustedLtv(80000, 50)).toBe(40000)
  })

  it('applies 100% margin returns full value', () => {
    expect(computeMarginAdjustedLtv(50000, 100)).toBe(50000)
  })

  it('applies 25% margin correctly', () => {
    expect(computeMarginAdjustedLtv(200000, 25)).toBe(50000)
  })

  it('handles zero simpleLtv', () => {
    expect(computeMarginAdjustedLtv(0, 30)).toBe(0)
  })
})

// ── computeLtvCacRatio ────────────────────────────────────────────────────────

describe('computeLtvCacRatio', () => {
  it('returns null when ltv is null', () => {
    expect(computeLtvCacRatio(null, 500)).toBeNull()
  })

  it('returns null when cac is 0', () => {
    expect(computeLtvCacRatio(10000, 0)).toBeNull()
  })

  it('returns null when cac is negative', () => {
    expect(computeLtvCacRatio(10000, -100)).toBeNull()
  })

  it('returns null when both ltv is null and cac is 0', () => {
    expect(computeLtvCacRatio(null, 0)).toBeNull()
  })

  it('computes 10000 / 1000 = 10', () => {
    expect(computeLtvCacRatio(10000, 1000)).toBe(10)
  })

  it('computes 5000 / 2500 = 2', () => {
    expect(computeLtvCacRatio(5000, 2500)).toBe(2)
  })

  it('computes fractional ratio correctly', () => {
    expect(computeLtvCacRatio(1500, 1000)).toBe(1.5)
  })

  it('computes ratio < 1 (losing money on acquisition)', () => {
    expect(computeLtvCacRatio(500, 1000)).toBe(0.5)
  })
})

// ── classifyLtvCacHealth ──────────────────────────────────────────────────────

describe('classifyLtvCacHealth', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyLtvCacHealth(null)).toBe('insufficient_data')
  })

  it('returns excellent at exactly 5.0', () => {
    expect(classifyLtvCacHealth(5.0)).toBe('excellent')
  })

  it('returns excellent above 5.0', () => {
    expect(classifyLtvCacHealth(7.5)).toBe('excellent')
  })

  it('returns good at exactly 3.0', () => {
    expect(classifyLtvCacHealth(3.0)).toBe('good')
  })

  it('returns good between 3.0 and 4.9', () => {
    expect(classifyLtvCacHealth(4.0)).toBe('good')
  })

  it('returns acceptable at exactly 1.5', () => {
    expect(classifyLtvCacHealth(1.5)).toBe('acceptable')
  })

  it('returns acceptable between 1.5 and 2.9', () => {
    expect(classifyLtvCacHealth(2.0)).toBe('acceptable')
  })

  it('returns poor at exactly 1.0', () => {
    expect(classifyLtvCacHealth(1.0)).toBe('poor')
  })

  it('returns poor between 1.0 and 1.4', () => {
    expect(classifyLtvCacHealth(1.2)).toBe('poor')
  })

  it('returns critical below 1.0', () => {
    expect(classifyLtvCacHealth(0.9)).toBe('critical')
  })

  it('returns critical at 0', () => {
    expect(classifyLtvCacHealth(0)).toBe('critical')
  })

  it('just below excellent threshold returns good', () => {
    expect(classifyLtvCacHealth(4.99)).toBe('good')
  })

  it('just below good threshold returns acceptable', () => {
    expect(classifyLtvCacHealth(2.99)).toBe('acceptable')
  })
})

// ── classifyLtvTier ───────────────────────────────────────────────────────────

describe('classifyLtvTier', () => {
  it('returns insufficient_data for null ltv', () => {
    expect(classifyLtvTier(null, 10000, 2000)).toBe('insufficient_data')
  })

  it('returns champion when ltv >= p75 × 1.5', () => {
    // p75=10000, champion threshold = 15000; ltv=15000
    expect(classifyLtvTier(15000, 10000, 2000)).toBe('champion')
  })

  it('returns champion well above threshold', () => {
    expect(classifyLtvTier(25000, 10000, 2000)).toBe('champion')
  })

  it('returns high_value when ltv >= p75 but < p75 × 1.5', () => {
    // p75=10000, ltv=12000 < 15000 → high_value
    expect(classifyLtvTier(12000, 10000, 2000)).toBe('high_value')
  })

  it('returns high_value at exactly p75', () => {
    expect(classifyLtvTier(10000, 10000, 2000)).toBe('high_value')
  })

  it('returns mid_value when ltv >= p25 but < p75', () => {
    expect(classifyLtvTier(5000, 10000, 2000)).toBe('mid_value')
  })

  it('returns mid_value at exactly p25', () => {
    expect(classifyLtvTier(2000, 10000, 2000)).toBe('mid_value')
  })

  it('returns low_value when ltv < p25', () => {
    expect(classifyLtvTier(1000, 10000, 2000)).toBe('low_value')
  })

  it('returns low_value at 0 ltv', () => {
    expect(classifyLtvTier(0, 10000, 2000)).toBe('low_value')
  })

  it('champion boundary: exactly p75 × 1.5', () => {
    // p75=20000, champion = 30000
    expect(classifyLtvTier(30000, 20000, 5000)).toBe('champion')
  })

  it('one below champion boundary is high_value', () => {
    expect(classifyLtvTier(29999, 20000, 5000)).toBe('high_value')
  })
})

// ── computePaybackPeriod ──────────────────────────────────────────────────────

describe('computePaybackPeriod', () => {
  it('returns null when avgOrderValue is null', () => {
    expect(computePaybackPeriod(1000, null, 2, 30)).toBeNull()
  })

  it('returns null when monthlyFrequency is null', () => {
    expect(computePaybackPeriod(1000, 500, null, 30)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(computePaybackPeriod(1000, null, null, 30)).toBeNull()
  })

  it('returns null when grossMarginPct is 0 (contribution = 0)', () => {
    expect(computePaybackPeriod(1000, 500, 2, 0)).toBeNull()
  })

  it('returns null when contribution is 0 (avgOrderValue = 0)', () => {
    expect(computePaybackPeriod(1000, 0, 2, 30)).toBeNull()
  })

  it('computes payback correctly: cac=1200, aov=500, freq=2, margin=30%', () => {
    // monthlyMargin = 500 × 2 × 30/100 = 300
    // payback = 1200/300 = 4
    expect(computePaybackPeriod(1200, 500, 2, 30)).toBe(4)
  })

  it('computes payback for fast payback scenario', () => {
    // cac=300, aov=1000, freq=1, margin=30%
    // monthlyMargin = 1000 × 1 × 0.3 = 300
    // payback = 300/300 = 1
    expect(computePaybackPeriod(300, 1000, 1, 30)).toBe(1)
  })

  it('payback increases with lower margin', () => {
    const high = computePaybackPeriod(1000, 500, 2, 50)
    const low  = computePaybackPeriod(1000, 500, 2, 20)
    expect(low!).toBeGreaterThan(high!)
  })

  it('computes fractional payback months', () => {
    // cac=500, aov=1000, freq=1, margin=30%
    // monthlyMargin=300; payback=500/300 ≈ 1.667
    expect(computePaybackPeriod(500, 1000, 1, 30)).toBeCloseTo(1.667, 1)
  })
})

// ── classifyPaybackPeriod ─────────────────────────────────────────────────────

describe('classifyPaybackPeriod', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyPaybackPeriod(null)).toBe('insufficient_data')
  })

  it('returns immediate at exactly 3 months', () => {
    expect(classifyPaybackPeriod(3)).toBe('immediate')
  })

  it('returns immediate below 3 months', () => {
    expect(classifyPaybackPeriod(1)).toBe('immediate')
  })

  it('returns fast at exactly 6 months', () => {
    expect(classifyPaybackPeriod(6)).toBe('fast')
  })

  it('returns fast between 3 and 6', () => {
    expect(classifyPaybackPeriod(4.5)).toBe('fast')
  })

  it('returns moderate at exactly 12 months', () => {
    expect(classifyPaybackPeriod(12)).toBe('moderate')
  })

  it('returns moderate between 6 and 12', () => {
    expect(classifyPaybackPeriod(9)).toBe('moderate')
  })

  it('returns slow at exactly 24 months', () => {
    expect(classifyPaybackPeriod(24)).toBe('slow')
  })

  it('returns slow between 12 and 24', () => {
    expect(classifyPaybackPeriod(18)).toBe('slow')
  })

  it('returns very_slow above 24 months', () => {
    expect(classifyPaybackPeriod(36)).toBe('very_slow')
  })

  it('returns very_slow at 25 months', () => {
    expect(classifyPaybackPeriod(25)).toBe('very_slow')
  })

  it('returns immediate at 0.5 months', () => {
    expect(classifyPaybackPeriod(0.5)).toBe('immediate')
  })

  it('just above 3 is fast, not immediate', () => {
    expect(classifyPaybackPeriod(3.01)).toBe('fast')
  })
})

// ── computeRevenueConcentrationHhi ────────────────────────────────────────────

describe('computeRevenueConcentrationHhi', () => {
  it('returns null when total revenue is 0 (empty array)', () => {
    expect(computeRevenueConcentrationHhi([])).toBeNull()
  })

  it('returns null when all customers have 0 revenue', () => {
    expect(computeRevenueConcentrationHhi([{ revenue: 0 }, { revenue: 0 }])).toBeNull()
  })

  it('returns 1.0 for single customer (monopoly)', () => {
    expect(computeRevenueConcentrationHhi([{ revenue: 100000 }])).toBe(1.0)
  })

  it('returns 0.5 for two equal customers: 0.5² + 0.5² = 0.5', () => {
    expect(computeRevenueConcentrationHhi([
      { revenue: 50000 },
      { revenue: 50000 },
    ])).toBe(0.5)
  })

  it('returns 0.25 for four equal customers: 4 × (0.25)² = 0.25', () => {
    expect(computeRevenueConcentrationHhi([
      { revenue: 25000 },
      { revenue: 25000 },
      { revenue: 25000 },
      { revenue: 25000 },
    ])).toBeCloseTo(0.25, 5)
  })

  it('approaches 0 for many equal customers (10 customers: HHI=0.1)', () => {
    const customers = Array.from({ length: 10 }, () => ({ revenue: 10000 }))
    expect(computeRevenueConcentrationHhi(customers)).toBeCloseTo(0.1, 5)
  })

  it('computes correctly for unequal split: 80/20 = (0.8)² + (0.2)² = 0.68', () => {
    expect(computeRevenueConcentrationHhi([
      { revenue: 80000 },
      { revenue: 20000 },
    ])).toBeCloseTo(0.68, 5)
  })

  it('concentrated portfolio has higher HHI than diversified', () => {
    const concentrated = computeRevenueConcentrationHhi([
      { revenue: 90000 }, { revenue: 10000 },
    ])
    const diversified = computeRevenueConcentrationHhi([
      { revenue: 50000 }, { revenue: 50000 },
    ])
    expect(concentrated!).toBeGreaterThan(diversified!)
  })
})

// ── classifyRevenueConcentration ──────────────────────────────────────────────

describe('classifyRevenueConcentration', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyRevenueConcentration(null)).toBe('insufficient_data')
  })

  it('returns diversified below 0.10', () => {
    expect(classifyRevenueConcentration(0.05)).toBe('diversified')
  })

  it('returns diversified at 0 (perfectly even)', () => {
    expect(classifyRevenueConcentration(0.0)).toBe('diversified')
  })

  it('returns moderate at exactly 0.10', () => {
    expect(classifyRevenueConcentration(0.10)).toBe('moderate')
  })

  it('returns moderate between 0.10 and 0.24', () => {
    expect(classifyRevenueConcentration(0.15)).toBe('moderate')
  })

  it('returns concentrated at exactly 0.25', () => {
    expect(classifyRevenueConcentration(0.25)).toBe('concentrated')
  })

  it('returns concentrated between 0.25 and 0.49', () => {
    expect(classifyRevenueConcentration(0.40)).toBe('concentrated')
  })

  it('returns highly_concentrated at exactly 0.50', () => {
    expect(classifyRevenueConcentration(0.50)).toBe('highly_concentrated')
  })

  it('returns highly_concentrated between 0.50 and 0.89', () => {
    expect(classifyRevenueConcentration(0.70)).toBe('highly_concentrated')
  })

  it('returns monopoly at exactly 0.90', () => {
    expect(classifyRevenueConcentration(0.90)).toBe('monopoly')
  })

  it('returns monopoly above 0.90', () => {
    expect(classifyRevenueConcentration(1.0)).toBe('monopoly')
  })

  it('just below 0.25 is moderate, not concentrated', () => {
    expect(classifyRevenueConcentration(0.2499)).toBe('moderate')
  })
})

// ── computeNetRevenueRetentionRate ────────────────────────────────────────────

describe('computeNetRevenueRetentionRate', () => {
  it('returns null when priorMonthRevenue is 0', () => {
    expect(computeNetRevenueRetentionRate(0, 50000)).toBeNull()
  })

  it('returns null when prior is 0 even if current is 0', () => {
    expect(computeNetRevenueRetentionRate(0, 0)).toBeNull()
  })

  it('returns 100 when revenue is equal (perfect retention)', () => {
    expect(computeNetRevenueRetentionRate(50000, 50000)).toBe(100)
  })

  it('returns 50 when current is half of prior (churn)', () => {
    expect(computeNetRevenueRetentionRate(100000, 50000)).toBe(50)
  })

  it('returns > 100 when current exceeds prior (expansion)', () => {
    expect(computeNetRevenueRetentionRate(100000, 120000)).toBe(120)
  })

  it('returns 0 when all customers churned', () => {
    expect(computeNetRevenueRetentionRate(100000, 0)).toBe(0)
  })

  it('returns 150 for 50% expansion', () => {
    expect(computeNetRevenueRetentionRate(100000, 150000)).toBe(150)
  })

  it('computes fractional percentage correctly', () => {
    expect(computeNetRevenueRetentionRate(300000, 100000)).toBeCloseTo(33.33, 1)
  })
})

// ── generateLtvNarrative ──────────────────────────────────────────────────────

describe('generateLtvNarrative', () => {
  it('returns a non-empty Turkish string for valid inputs', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 20,
      ltvCacRatio: 4.0,
      portfolioHealth: 'good',
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('returns Turkish message when avgLtv is null', () => {
    const result = generateLtvNarrative({
      avgLtv: null,
      topCustomerPct: 0,
      ltvCacRatio: null,
      portfolioHealth: 'insufficient_data',
    })
    expect(result).toContain('veri')
  })

  it('includes avg LTV value in the narrative', () => {
    const result = generateLtvNarrative({
      avgLtv: 75000,
      topCustomerPct: 10,
      ltvCacRatio: 3.0,
      portfolioHealth: 'good',
    })
    expect(result).toMatch(/TRY/)
  })

  it('includes LTV:CAC ratio in narrative when available', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 15,
      ltvCacRatio: 3.5,
      portfolioHealth: 'good',
    })
    expect(result).toContain('3.5x')
  })

  it('does not include ratio number when ltvCacRatio is null', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 15,
      ltvCacRatio: null,
      portfolioHealth: 'insufficient_data',
    })
    // No numeric ratio (e.g. "3.5x") should appear when ratio is null
    expect(result).not.toMatch(/\d+\.\dx/)
  })

  it('adds concentration warning when topCustomerPct >= 50', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 60,
      ltvCacRatio: 3.0,
      portfolioHealth: 'good',
    })
    expect(result).toContain('Uyarı')
  })

  it('adds diversification suggestion when topCustomerPct is between 25 and 49', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 35,
      ltvCacRatio: 2.0,
      portfolioHealth: 'acceptable',
    })
    expect(result).toContain('çeşitlendirme')
  })

  it('no concentration warning when topCustomerPct < 25', () => {
    const result = generateLtvNarrative({
      avgLtv: 50000,
      topCustomerPct: 10,
      ltvCacRatio: 4.0,
      portfolioHealth: 'good',
    })
    expect(result).not.toContain('Uyarı')
    expect(result).not.toContain('çeşitlendirme')
  })

  it('mentions critical health state in Turkish', () => {
    const result = generateLtvNarrative({
      avgLtv: 10000,
      topCustomerPct: 20,
      ltvCacRatio: 0.5,
      portfolioHealth: 'critical',
    })
    expect(result.toLowerCase()).toMatch(/kritik|önlem/)
  })

  it('mentions excellent health state', () => {
    const result = generateLtvNarrative({
      avgLtv: 200000,
      topCustomerPct: 10,
      ltvCacRatio: 8.0,
      portfolioHealth: 'excellent',
    })
    expect(result.toLowerCase()).toMatch(/mükemmel|karlılık/)
  })

  it('result is non-empty for all health states', () => {
    const healthStates = ['excellent', 'good', 'acceptable', 'poor', 'critical', 'insufficient_data'] as const
    for (const state of healthStates) {
      const result = generateLtvNarrative({
        avgLtv: 50000,
        topCustomerPct: 20,
        ltvCacRatio: 2.0,
        portfolioHealth: state,
      })
      expect(result.length).toBeGreaterThan(0)
    }
  })
})
