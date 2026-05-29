/**
 * Tests for lib/services/commercial/customer-ltv-enhanced.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/customer-ltv-enhanced.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeCustomerTenureYears,
  computeAvgOrderFrequency,
  computeHistoricalLtv,
  computeProjectedLtv,
  computeMarginAdjustedLtv,
  computeChurnProbability,
  computeExpectedRemainingValue,
  classifyLtvSegment,
  classifyClvTier,
  computePortfolioLtvStats,
  computeRetentionRateFromData,
  buildDefaultClvThresholds,
  generateLtvNarrative,
} from '../lib/services/commercial/customer-ltv-enhanced.service'
import type { LtvEstimate } from '../lib/services/commercial/customer-ltv-enhanced.service'

// ── Helper to build a minimal LtvEstimate ─────────────────────────────────────

function makeEstimate(overrides: Partial<LtvEstimate> = {}): LtvEstimate {
  return {
    customer_id: 'c1',
    historical_ltv: 10000,
    projected_ltv_3yr: 30000,
    projected_ltv_5yr: 50000,
    margin_adjusted_ltv: 25000,
    churn_probability: 0.1,
    expected_remaining_value: 45000,
    ltv_segment: 'loyal',
    clv_tier: 'silver',
    ...overrides,
  }
}

// ── computeCustomerTenureYears ────────────────────────────────────────────────

describe('computeCustomerTenureYears', () => {
  it('computes correct tenure for 1 year apart', () => {
    const result = computeCustomerTenureYears('2023-01-01', '2024-01-01')
    expect(result).toBeCloseTo(1.0, 1)
  })

  it('computes correct tenure for 2 years apart', () => {
    const result = computeCustomerTenureYears('2021-06-15', '2023-06-15')
    expect(result).toBeCloseTo(2.0, 1)
  })

  it('returns minimum 0.01 for same day (avoids division by zero)', () => {
    const result = computeCustomerTenureYears('2024-01-01', '2024-01-01')
    expect(result).toBe(0.01)
  })

  it('returns minimum 0.01 when asOfDate is before firstOrderDate', () => {
    const result = computeCustomerTenureYears('2024-06-01', '2024-01-01')
    expect(result).toBe(0.01)
  })

  it('computes 6-month tenure correctly', () => {
    const result = computeCustomerTenureYears('2024-01-01', '2024-07-01')
    expect(result).toBeGreaterThan(0.45)
    expect(result).toBeLessThan(0.55)
  })

  it('computes 3-month tenure correctly', () => {
    const result = computeCustomerTenureYears('2024-01-01', '2024-04-01')
    expect(result).toBeGreaterThan(0.2)
    expect(result).toBeLessThan(0.3)
  })

  it('handles leap year correctly', () => {
    const result = computeCustomerTenureYears('2020-01-01', '2021-01-01')
    // 366 days / 365.25 ≈ 1.002
    expect(result).toBeCloseTo(1.002, 2)
  })
})

// ── computeAvgOrderFrequency ──────────────────────────────────────────────────

describe('computeAvgOrderFrequency', () => {
  it('divides orders by tenure years', () => {
    expect(computeAvgOrderFrequency(12, 2)).toBe(6)
  })

  it('returns 0 if tenureYears is 0', () => {
    expect(computeAvgOrderFrequency(10, 0)).toBe(0)
  })

  it('handles single order over 1 year', () => {
    expect(computeAvgOrderFrequency(1, 1)).toBe(1)
  })

  it('handles fractional tenure', () => {
    expect(computeAvgOrderFrequency(6, 0.5)).toBe(12)
  })

  it('returns 0 orders for 0 total orders', () => {
    expect(computeAvgOrderFrequency(0, 2)).toBe(0)
  })
})

// ── computeHistoricalLtv ──────────────────────────────────────────────────────

describe('computeHistoricalLtv', () => {
  it('returns revenue unchanged', () => {
    expect(computeHistoricalLtv(99999)).toBe(99999)
  })

  it('returns 0 for 0 revenue', () => {
    expect(computeHistoricalLtv(0)).toBe(0)
  })

  it('handles large values', () => {
    expect(computeHistoricalLtv(5_000_000)).toBe(5_000_000)
  })
})

// ── computeProjectedLtv ───────────────────────────────────────────────────────

describe('computeProjectedLtv', () => {
  it('returns 0 for zero AOV', () => {
    expect(computeProjectedLtv(0, 4, 5, 0.85)).toBe(0)
  })

  it('returns 0 for zero frequency', () => {
    expect(computeProjectedLtv(10000, 0, 5, 0.85)).toBe(0)
  })

  it('uses linear formula when retention === 1', () => {
    // AOV × freq × years = 1000 × 4 × 3 = 12000
    expect(computeProjectedLtv(1000, 4, 3, 1)).toBe(12000)
  })

  it('uses linear formula when retention === 1 for 5 years', () => {
    expect(computeProjectedLtv(5000, 2, 5, 1)).toBe(50000)
  })

  it('geometric series for retention < 1', () => {
    // AOV=1000, freq=1, 1 year, retention=0.9
    // = 1000 × 1 × 0.9 × (1 - 0.9) / (1 - 0.9) = 1000 × 0.9 = 900
    const result = computeProjectedLtv(1000, 1, 1, 0.9)
    expect(result).toBeCloseTo(900, 0)
  })

  it('multi-year geometric series with retention=0.8', () => {
    // AOV=10000, freq=2, 3yr, retention=0.8
    // series = 0.8*(1-0.8^3)/(1-0.8) = 0.8*(1-0.512)/0.2 = 0.8*0.488/0.2 = 1.952
    // result = 10000 * 2 * 1.952 = 39040
    const result = computeProjectedLtv(10000, 2, 3, 0.8)
    expect(result).toBeCloseTo(39040, 0)
  })

  it('lower retention → lower projected LTV', () => {
    const high = computeProjectedLtv(5000, 3, 5, 0.95)
    const low  = computeProjectedLtv(5000, 3, 5, 0.60)
    expect(high).toBeGreaterThan(low)
  })

  it('5yr > 3yr for same inputs', () => {
    const yr3 = computeProjectedLtv(5000, 3, 3, 0.85)
    const yr5 = computeProjectedLtv(5000, 3, 5, 0.85)
    expect(yr5).toBeGreaterThan(yr3)
  })

  it('returns positive value for valid inputs', () => {
    expect(computeProjectedLtv(10000, 4, 5, 0.85)).toBeGreaterThan(0)
  })
})

// ── computeMarginAdjustedLtv ──────────────────────────────────────────────────

describe('computeMarginAdjustedLtv', () => {
  it('returns projectedLtv unchanged when grossMarginPct is null', () => {
    expect(computeMarginAdjustedLtv(100000, null)).toBe(100000)
  })

  it('applies 50% margin correctly', () => {
    expect(computeMarginAdjustedLtv(100000, 50)).toBe(50000)
  })

  it('applies 30% margin correctly', () => {
    expect(computeMarginAdjustedLtv(200000, 30)).toBe(60000)
  })

  it('applies 100% margin returns full value', () => {
    expect(computeMarginAdjustedLtv(80000, 100)).toBe(80000)
  })

  it('applies 0% margin returns 0', () => {
    expect(computeMarginAdjustedLtv(80000, 0)).toBe(0)
  })

  it('handles zero projected LTV with margin', () => {
    expect(computeMarginAdjustedLtv(0, 40)).toBe(0)
  })
})

// ── computeChurnProbability ───────────────────────────────────────────────────

describe('computeChurnProbability', () => {
  it('returns 0.5 when avgOrderIntervalDays is 0', () => {
    expect(computeChurnProbability(30, 0)).toBe(0.5)
  })

  it('ratio <= 1.0: returns 0.05 (active)', () => {
    // 30 days since, 30 day interval → ratio = 1.0
    expect(computeChurnProbability(30, 30)).toBe(0.05)
  })

  it('ratio exactly 1.0: returns 0.05', () => {
    expect(computeChurnProbability(60, 60)).toBe(0.05)
  })

  it('ratio 1.2 (between 1.0 and 1.5): returns 0.15', () => {
    // 36 days / 30 = 1.2
    expect(computeChurnProbability(36, 30)).toBe(0.15)
  })

  it('ratio exactly 1.5: returns 0.15', () => {
    expect(computeChurnProbability(45, 30)).toBe(0.15)
  })

  it('ratio 1.8 (between 1.5 and 2.0): returns 0.35', () => {
    expect(computeChurnProbability(54, 30)).toBe(0.35)
  })

  it('ratio exactly 2.0: returns 0.35', () => {
    expect(computeChurnProbability(60, 30)).toBe(0.35)
  })

  it('ratio 2.5 (between 2.0 and 3.0): returns 0.60', () => {
    expect(computeChurnProbability(75, 30)).toBe(0.60)
  })

  it('ratio exactly 3.0: returns 0.60', () => {
    expect(computeChurnProbability(90, 30)).toBe(0.60)
  })

  it('ratio 4.0 (between 3.0 and 5.0): returns 0.80', () => {
    expect(computeChurnProbability(120, 30)).toBe(0.80)
  })

  it('ratio exactly 5.0: returns 0.80', () => {
    expect(computeChurnProbability(150, 30)).toBe(0.80)
  })

  it('ratio > 5.0: returns 0.95', () => {
    expect(computeChurnProbability(200, 30)).toBe(0.95)
  })

  it('very low recency → low churn probability', () => {
    expect(computeChurnProbability(5, 30)).toBe(0.05)
  })
})

// ── computeExpectedRemainingValue ─────────────────────────────────────────────

describe('computeExpectedRemainingValue', () => {
  it('churn=0 returns full projected value', () => {
    expect(computeExpectedRemainingValue(100000, 0)).toBe(100000)
  })

  it('churn=1 returns 0', () => {
    expect(computeExpectedRemainingValue(100000, 1)).toBe(0)
  })

  it('churn=0.5 returns half', () => {
    expect(computeExpectedRemainingValue(80000, 0.5)).toBe(40000)
  })

  it('churn=0.2 → 80% of projected', () => {
    expect(computeExpectedRemainingValue(50000, 0.2)).toBe(40000)
  })

  it('churn=0.95 → 5% of projected', () => {
    expect(computeExpectedRemainingValue(100000, 0.95)).toBeCloseTo(5000, 0)
  })

  it('zero projected LTV → 0 regardless of churn', () => {
    expect(computeExpectedRemainingValue(0, 0.3)).toBe(0)
  })
})

// ── classifyLtvSegment ────────────────────────────────────────────────────────

describe('classifyLtvSegment', () => {
  it('classifies as lost when churnProbability >= 0.80', () => {
    expect(classifyLtvSegment(0.80, 10, 500000, 100000)).toBe('lost')
  })

  it('classifies as lost at 0.95', () => {
    expect(classifyLtvSegment(0.95, 10, 500000, 100000)).toBe('lost')
  })

  it('classifies as at_risk when churnProbability >= 0.50', () => {
    expect(classifyLtvSegment(0.60, 4, 200000, 100000)).toBe('at_risk')
  })

  it('at_risk takes priority over champion (churn=0.50, freq=5, high ltv)', () => {
    // Even with champion-level freq and LTV, churn >= 0.50 → at_risk
    expect(classifyLtvSegment(0.50, 5, 300000, 100000)).toBe('at_risk')
  })

  it('classifies as champion: freq >= 4 AND historicalLtv >= avg × 1.5', () => {
    // avg=100000, historicalLtv=150000, freq=4
    expect(classifyLtvSegment(0.05, 4, 150000, 100000)).toBe('champion')
  })

  it('not champion if freq < 4 even if ltv high', () => {
    expect(classifyLtvSegment(0.05, 3, 150000, 100000)).toBe('loyal')
  })

  it('not champion if ltv < avg × 1.5 even if freq >= 4', () => {
    // avg=100000, historicalLtv=140000 < 150000
    expect(classifyLtvSegment(0.05, 4, 140000, 100000)).toBe('loyal')
  })

  it('classifies as loyal when freq >= 2', () => {
    expect(classifyLtvSegment(0.05, 2, 5000, 100000)).toBe('loyal')
  })

  it('classifies as loyal when historicalLtv >= avgLtv', () => {
    // freq=1 but ltv >= avg
    expect(classifyLtvSegment(0.05, 1, 100000, 100000)).toBe('loyal')
  })

  it('classifies as potential otherwise', () => {
    // churn low, freq < 2, ltv < avg
    expect(classifyLtvSegment(0.05, 1, 50000, 100000)).toBe('potential')
  })

  it('lost priority over at_risk at exact 0.80', () => {
    // 0.80 is >= 0.80 → lost, not at_risk
    expect(classifyLtvSegment(0.80, 0, 0, 0)).toBe('lost')
  })

  it('at_risk at 0.79 is NOT lost', () => {
    expect(classifyLtvSegment(0.79, 0, 0, 0)).toBe('at_risk')
  })
})

// ── classifyClvTier ───────────────────────────────────────────────────────────

describe('classifyClvTier', () => {
  const thresholds = { platinum: 500000, gold: 150000, silver: 50000 }

  it('classifies as platinum at >= 500000', () => {
    expect(classifyClvTier(500000, thresholds)).toBe('platinum')
  })

  it('classifies as platinum above threshold', () => {
    expect(classifyClvTier(1000000, thresholds)).toBe('platinum')
  })

  it('classifies as gold at >= 150000 and < 500000', () => {
    expect(classifyClvTier(200000, thresholds)).toBe('gold')
  })

  it('classifies as gold at exactly 150000', () => {
    expect(classifyClvTier(150000, thresholds)).toBe('gold')
  })

  it('classifies as silver at >= 50000 and < 150000', () => {
    expect(classifyClvTier(80000, thresholds)).toBe('silver')
  })

  it('classifies as silver at exactly 50000', () => {
    expect(classifyClvTier(50000, thresholds)).toBe('silver')
  })

  it('classifies as bronze below 50000', () => {
    expect(classifyClvTier(10000, thresholds)).toBe('bronze')
  })

  it('classifies as bronze at 0', () => {
    expect(classifyClvTier(0, thresholds)).toBe('bronze')
  })

  it('platinum just below threshold is gold', () => {
    expect(classifyClvTier(499999, thresholds)).toBe('gold')
  })
})

// ── computePortfolioLtvStats ──────────────────────────────────────────────────

describe('computePortfolioLtvStats', () => {
  it('returns all zeros for empty array', () => {
    const stats = computePortfolioLtvStats([])
    expect(stats.total_projected_5yr).toBe(0)
    expect(stats.avg_projected_5yr).toBe(0)
    expect(stats.median_projected_5yr).toBe(0)
    expect(stats.total_expected_remaining).toBe(0)
    expect(stats.champion_count).toBe(0)
    expect(stats.at_risk_value).toBe(0)
  })

  it('single estimate: avg equals that value', () => {
    const est = [makeEstimate({ projected_ltv_5yr: 100000 })]
    const stats = computePortfolioLtvStats(est)
    expect(stats.avg_projected_5yr).toBe(100000)
    expect(stats.total_projected_5yr).toBe(100000)
  })

  it('computes total projected 5yr correctly', () => {
    const ests = [
      makeEstimate({ projected_ltv_5yr: 100000 }),
      makeEstimate({ customer_id: 'c2', projected_ltv_5yr: 200000 }),
    ]
    expect(computePortfolioLtvStats(ests).total_projected_5yr).toBe(300000)
  })

  it('computes avg projected 5yr correctly', () => {
    const ests = [
      makeEstimate({ projected_ltv_5yr: 100000 }),
      makeEstimate({ customer_id: 'c2', projected_ltv_5yr: 200000 }),
    ]
    expect(computePortfolioLtvStats(ests).avg_projected_5yr).toBe(150000)
  })

  it('median for even count is average of two middle values', () => {
    const ests = [
      makeEstimate({ customer_id: 'c1', projected_ltv_5yr: 10000 }),
      makeEstimate({ customer_id: 'c2', projected_ltv_5yr: 20000 }),
      makeEstimate({ customer_id: 'c3', projected_ltv_5yr: 30000 }),
      makeEstimate({ customer_id: 'c4', projected_ltv_5yr: 40000 }),
    ]
    expect(computePortfolioLtvStats(ests).median_projected_5yr).toBe(25000)
  })

  it('median for odd count is middle value', () => {
    const ests = [
      makeEstimate({ customer_id: 'c1', projected_ltv_5yr: 10000 }),
      makeEstimate({ customer_id: 'c2', projected_ltv_5yr: 20000 }),
      makeEstimate({ customer_id: 'c3', projected_ltv_5yr: 30000 }),
    ]
    expect(computePortfolioLtvStats(ests).median_projected_5yr).toBe(20000)
  })

  it('counts champion segments correctly', () => {
    const ests = [
      makeEstimate({ customer_id: 'c1', ltv_segment: 'champion' }),
      makeEstimate({ customer_id: 'c2', ltv_segment: 'champion' }),
      makeEstimate({ customer_id: 'c3', ltv_segment: 'loyal' }),
    ]
    expect(computePortfolioLtvStats(ests).champion_count).toBe(2)
  })

  it('at_risk_value sums expected_remaining for at_risk + lost', () => {
    const ests = [
      makeEstimate({ customer_id: 'c1', ltv_segment: 'at_risk',  expected_remaining_value: 10000 }),
      makeEstimate({ customer_id: 'c2', ltv_segment: 'lost',     expected_remaining_value: 5000  }),
      makeEstimate({ customer_id: 'c3', ltv_segment: 'champion', expected_remaining_value: 80000 }),
    ]
    expect(computePortfolioLtvStats(ests).at_risk_value).toBe(15000)
  })

  it('total_expected_remaining sums all customers', () => {
    const ests = [
      makeEstimate({ customer_id: 'c1', expected_remaining_value: 10000 }),
      makeEstimate({ customer_id: 'c2', expected_remaining_value: 20000 }),
    ]
    expect(computePortfolioLtvStats(ests).total_expected_remaining).toBe(30000)
  })
})

// ── computeRetentionRateFromData ──────────────────────────────────────────────

describe('computeRetentionRateFromData', () => {
  it('returns null when customersLastYear is 0', () => {
    expect(computeRetentionRateFromData(0, 5)).toBeNull()
  })

  it('computes 80% retention correctly', () => {
    expect(computeRetentionRateFromData(100, 80)).toBe(0.8)
  })

  it('computes 100% retention correctly', () => {
    expect(computeRetentionRateFromData(50, 50)).toBe(1.0)
  })

  it('computes 0% retention correctly', () => {
    expect(computeRetentionRateFromData(50, 0)).toBe(0)
  })

  it('clamps above 1 to 1 (impossible but safe)', () => {
    expect(computeRetentionRateFromData(50, 60)).toBe(1)
  })

  it('clamps below 0 to 0 (impossible but safe)', () => {
    expect(computeRetentionRateFromData(50, -5)).toBe(0)
  })

  it('returns 0.5 for half retention', () => {
    expect(computeRetentionRateFromData(200, 100)).toBe(0.5)
  })
})

// ── buildDefaultClvThresholds ─────────────────────────────────────────────────

describe('buildDefaultClvThresholds', () => {
  it('platinum = avg × 5', () => {
    const t = buildDefaultClvThresholds(100000)
    expect(t.platinum).toBe(500000)
  })

  it('gold = avg × 2', () => {
    const t = buildDefaultClvThresholds(100000)
    expect(t.gold).toBe(200000)
  })

  it('silver = avg × 0.5', () => {
    const t = buildDefaultClvThresholds(100000)
    expect(t.silver).toBe(50000)
  })

  it('all thresholds scale with avg', () => {
    const t = buildDefaultClvThresholds(200000)
    expect(t.platinum).toBe(1000000)
    expect(t.gold).toBe(400000)
    expect(t.silver).toBe(100000)
  })

  it('works with avg = 0', () => {
    const t = buildDefaultClvThresholds(0)
    expect(t.platinum).toBe(0)
    expect(t.gold).toBe(0)
    expect(t.silver).toBe(0)
  })

  it('thresholds maintain correct ordering: platinum > gold > silver', () => {
    const t = buildDefaultClvThresholds(50000)
    expect(t.platinum).toBeGreaterThan(t.gold)
    expect(t.gold).toBeGreaterThan(t.silver)
  })
})

// ── generateLtvNarrative ──────────────────────────────────────────────────────

describe('generateLtvNarrative', () => {
  function buildStats(overrides: Partial<ReturnType<typeof computePortfolioLtvStats>> = {}) {
    return {
      total_projected_5yr: 1_000_000,
      avg_projected_5yr: 50000,
      median_projected_5yr: 40000,
      total_expected_remaining: 800000,
      champion_count: 3,
      at_risk_value: 50000,
      ...overrides,
    }
  }

  it('returns a Turkish string', () => {
    const stats = buildStats()
    const result = generateLtvNarrative(stats, 3, 2, 20)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(20)
  })

  it('contains portfolio value in narrative', () => {
    const stats = buildStats({ total_projected_5yr: 5_000_000 })
    const result = generateLtvNarrative(stats, 3, 0, 20)
    // Should mention portfolio/total value
    expect(result).toMatch(/portföy|müşteri/i)
  })

  it('normal path: champion count mentioned when > 0', () => {
    const stats = buildStats()
    const result = generateLtvNarrative(stats, 5, 2, 20)
    expect(result).toContain('5 şampiyon')
  })

  it('no champion mention when champion count is 0', () => {
    const stats = buildStats()
    const result = generateLtvNarrative(stats, 0, 2, 20)
    expect(result).not.toContain('şampiyon')
  })

  it('high at-risk path: warns when atRisk > 30% of total', () => {
    const stats = buildStats()
    // 7 at-risk out of 20 = 35% > 30%
    const result = generateLtvNarrative(stats, 3, 7, 20)
    expect(result).toContain('risk')
    expect(result).toContain('7')
  })

  it('high at-risk path contains kayıp/risk language', () => {
    const stats = buildStats()
    const result = generateLtvNarrative(stats, 2, 8, 10)
    // 8 out of 10 = 80% > 30%
    expect(result.toLowerCase()).toMatch(/risk|kayıp/)
  })

  it('normal path: no at-risk warning when atRisk <= 30%', () => {
    const stats = buildStats()
    // 3 out of 20 = 15%
    const result = generateLtvNarrative(stats, 3, 3, 20)
    expect(result).not.toContain('risk altında')
  })

  it('narrative includes the 5yr total value', () => {
    const stats = buildStats({ total_projected_5yr: 2_500_000 })
    const result = generateLtvNarrative(stats, 2, 1, 10)
    // Should mention ₺2.5M or similar
    expect(result).toContain('₺')
  })

  it('handles zero total customers without crash', () => {
    const stats = buildStats({ total_projected_5yr: 0 })
    const result = generateLtvNarrative(stats, 0, 0, 0)
    expect(typeof result).toBe('string')
  })

  it('handles large champion count', () => {
    const stats = buildStats()
    const result = generateLtvNarrative(stats, 100, 5, 200)
    expect(result).toContain('100 şampiyon')
  })
})
