/**
 * Tests for lib/services/commercial/receivables-aging-enhanced.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/receivables-aging-enhanced.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeRecoveryProbability,
  classifyCustomerRiskTier,
  computeCustomerDso,
  computePortfolioDso,
  computeCollectionEfficiency,
  computeBadDebtProvision,
  computeConcentrationRisk,
  classifyAgingHealth,
  computeWeightedAgeDays,
  estimateCollectionTimeline,
  generateAgingNarrative,
} from '../lib/services/commercial/receivables-aging-enhanced.service'

// ── computeRecoveryProbability ────────────────────────────────────────────────

describe('computeRecoveryProbability — age tiers (null history, 0 overdue ratio)', () => {
  it('returns 95 for <= 30 days (current)', () => {
    expect(computeRecoveryProbability(30, null, 0)).toBe(95)
  })

  it('returns 95 for 0 days', () => {
    expect(computeRecoveryProbability(0, null, 0)).toBe(95)
  })

  it('returns 85 for <= 60 days (31-60 range)', () => {
    expect(computeRecoveryProbability(45, null, 0)).toBe(85)
  })

  it('returns 85 at exactly 60 days', () => {
    expect(computeRecoveryProbability(60, null, 0)).toBe(85)
  })

  it('returns 70 for <= 90 days (61-90 range)', () => {
    expect(computeRecoveryProbability(75, null, 0)).toBe(70)
  })

  it('returns 70 at exactly 90 days', () => {
    expect(computeRecoveryProbability(90, null, 0)).toBe(70)
  })

  it('returns 50 for <= 180 days (91-180 range)', () => {
    expect(computeRecoveryProbability(120, null, 0)).toBe(50)
  })

  it('returns 50 at exactly 180 days', () => {
    expect(computeRecoveryProbability(180, null, 0)).toBe(50)
  })

  it('returns 30 for <= 365 days (181-365 range)', () => {
    expect(computeRecoveryProbability(270, null, 0)).toBe(30)
  })

  it('returns 30 at exactly 365 days', () => {
    expect(computeRecoveryProbability(365, null, 0)).toBe(30)
  })

  it('returns 10 for > 365 days', () => {
    expect(computeRecoveryProbability(400, null, 0)).toBe(10)
  })

  it('returns 10 for very old invoice (700 days)', () => {
    expect(computeRecoveryProbability(700, null, 0)).toBe(10)
  })
})

describe('computeRecoveryProbability — payment history adjustments', () => {
  // Base at 31 days = 85 (age 31-60)
  it('adds +5 for paymentHistoryScore >= 80', () => {
    expect(computeRecoveryProbability(31, 80, 0)).toBe(90)
  })

  it('adds +5 for paymentHistoryScore = 100', () => {
    expect(computeRecoveryProbability(31, 100, 0)).toBe(90)
  })

  it('adds 0 for paymentHistoryScore >= 60 (< 80)', () => {
    expect(computeRecoveryProbability(31, 60, 0)).toBe(85)
  })

  it('adds 0 for paymentHistoryScore = 70', () => {
    expect(computeRecoveryProbability(31, 70, 0)).toBe(85)
  })

  it('subtracts 5 for paymentHistoryScore >= 40 (< 60)', () => {
    expect(computeRecoveryProbability(31, 40, 0)).toBe(80)
  })

  it('subtracts 5 for paymentHistoryScore = 50', () => {
    expect(computeRecoveryProbability(31, 50, 0)).toBe(80)
  })

  it('subtracts 10 for paymentHistoryScore < 40', () => {
    expect(computeRecoveryProbability(31, 39, 0)).toBe(75)
  })

  it('subtracts 10 for paymentHistoryScore = 0', () => {
    expect(computeRecoveryProbability(31, 0, 0)).toBe(75)
  })

  it('no adjustment when paymentHistoryScore is null', () => {
    expect(computeRecoveryProbability(31, null, 0)).toBe(85)
  })
})

describe('computeRecoveryProbability — overdue ratio adjustments', () => {
  // Base at 0 days = 95 with null history
  it('adds 0 for overdueRatio <= 0.3', () => {
    expect(computeRecoveryProbability(0, null, 0.3)).toBe(95)
  })

  it('adds 0 for overdueRatio = 0', () => {
    expect(computeRecoveryProbability(0, null, 0)).toBe(95)
  })

  it('subtracts 5 for overdueRatio <= 0.6 (> 0.3)', () => {
    expect(computeRecoveryProbability(0, null, 0.5)).toBe(90)
  })

  it('subtracts 5 for overdueRatio = 0.6', () => {
    expect(computeRecoveryProbability(0, null, 0.6)).toBe(90)
  })

  it('subtracts 10 for overdueRatio > 0.6', () => {
    expect(computeRecoveryProbability(0, null, 0.7)).toBe(85)
  })

  it('subtracts 10 for overdueRatio = 1.0', () => {
    expect(computeRecoveryProbability(0, null, 1.0)).toBe(85)
  })
})

describe('computeRecoveryProbability — clamp', () => {
  it('clamps to minimum 5 when score would go below', () => {
    // 400 days (base=10) + score<40 (-10) + ratio>0.6 (-10) = -10 → clamped to 5
    expect(computeRecoveryProbability(400, 0, 1.0)).toBe(5)
  })

  it('clamps to maximum 100 when score would exceed', () => {
    // 0 days (base=95) + score>=80 (+5) + ratio<=0.3 (0) = 100 → clamped to 100
    expect(computeRecoveryProbability(0, 100, 0)).toBe(100)
  })

  it('does not clamp when value is within range', () => {
    expect(computeRecoveryProbability(90, 60, 0)).toBe(70)
  })
})

// ── classifyCustomerRiskTier ──────────────────────────────────────────────────

describe('classifyCustomerRiskTier', () => {
  it('returns critical when oldestInvoiceDays > 180', () => {
    expect(classifyCustomerRiskTier(181, 10000, 60)).toBe('critical')
  })

  it('returns critical when recoveryProbabilityPct < 40', () => {
    expect(classifyCustomerRiskTier(30, 10000, 39)).toBe('critical')
  })

  it('returns critical at exactly recoveryProbability = 39', () => {
    expect(classifyCustomerRiskTier(30, 5000, 39)).toBe('critical')
  })

  it('returns high when oldestInvoiceDays > 90 (not critical)', () => {
    expect(classifyCustomerRiskTier(91, 10000, 60)).toBe('high')
  })

  it('returns high when recoveryProbabilityPct < 60 (not critical)', () => {
    expect(classifyCustomerRiskTier(25, 10000, 55)).toBe('high')
  })

  it('returns medium when oldestInvoiceDays > 30 (not high/critical)', () => {
    expect(classifyCustomerRiskTier(31, 10000, 75)).toBe('medium')
  })

  it('returns medium when totalOutstanding > 50000 (not high/critical)', () => {
    expect(classifyCustomerRiskTier(20, 50001, 80)).toBe('medium')
  })

  it('returns low for recent small low-risk customer', () => {
    expect(classifyCustomerRiskTier(15, 10000, 90)).toBe('low')
  })

  it('returns low at exactly 30 days outstanding, small amount, high recovery', () => {
    expect(classifyCustomerRiskTier(30, 1000, 95)).toBe('low')
  })

  // Priority: critical checked before high
  it('critical takes priority over high when both conditions met', () => {
    // days=200 (>180, critical) AND days>90 (high) → critical wins
    expect(classifyCustomerRiskTier(200, 10000, 70)).toBe('critical')
  })

  // Priority: high checked before medium
  it('high takes priority over medium when both conditions met', () => {
    // days=91 (>90, high) AND totalOutstanding>50000 (medium) → high wins
    expect(classifyCustomerRiskTier(91, 60000, 65)).toBe('high')
  })
})

// ── computeCustomerDso ────────────────────────────────────────────────────────

describe('computeCustomerDso', () => {
  it('returns null when avgDailyRevenue is 0', () => {
    expect(computeCustomerDso(10000, 0)).toBeNull()
  })

  it('computes correctly: 30000 / 1000 = 30', () => {
    expect(computeCustomerDso(30000, 1000)).toBe(30)
  })

  it('computes correctly: 0 outstanding / any revenue = 0', () => {
    expect(computeCustomerDso(0, 500)).toBe(0)
  })

  it('handles fractional result', () => {
    expect(computeCustomerDso(1000, 300)).toBeCloseTo(3.333, 2)
  })
})

// ── computePortfolioDso ───────────────────────────────────────────────────────

describe('computePortfolioDso', () => {
  it('returns null when last30DayRevenue is 0', () => {
    expect(computePortfolioDso(50000, 0)).toBeNull()
  })

  it('computes correctly: 30000 / (30000/30) = 30 days', () => {
    expect(computePortfolioDso(30000, 30000)).toBe(30)
  })

  it('computes correctly: 60000 outstanding, 30000 revenue → 60 days', () => {
    expect(computePortfolioDso(60000, 30000)).toBe(60)
  })

  it('returns 0 when outstanding is 0', () => {
    expect(computePortfolioDso(0, 30000)).toBe(0)
  })
})

// ── computeCollectionEfficiency ───────────────────────────────────────────────

describe('computeCollectionEfficiency', () => {
  it('returns null when previousOutstanding is 0', () => {
    expect(computeCollectionEfficiency(5000, 0)).toBeNull()
  })

  it('computes 100% when collected equals previous outstanding', () => {
    expect(computeCollectionEfficiency(10000, 10000)).toBe(100)
  })

  it('computes 50% when collected is half of previous', () => {
    expect(computeCollectionEfficiency(5000, 10000)).toBe(50)
  })

  it('can exceed 100% when collected > previous', () => {
    expect(computeCollectionEfficiency(12000, 10000)).toBe(120)
  })

  it('returns 0 when nothing collected', () => {
    expect(computeCollectionEfficiency(0, 10000)).toBe(0)
  })
})

// ── computeBadDebtProvision ───────────────────────────────────────────────────

describe('computeBadDebtProvision', () => {
  const defaultRates = {
    current:       0.01,
    days_30_60:    0.05,
    days_60_90:    0.15,
    days_90_180:   0.30,
    days_180_plus: 0.60,
  }

  it('computes correctly with all buckets using default rates', () => {
    const buckets = {
      current:       10000,
      days_30_60:    5000,
      days_60_90:    3000,
      days_90_180:   2000,
      days_180_plus: 1000,
    }
    // 10000*0.01 + 5000*0.05 + 3000*0.15 + 2000*0.30 + 1000*0.60
    // = 100 + 250 + 450 + 600 + 600 = 2000
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(2000)
  })

  it('returns 0 when all buckets are 0', () => {
    const buckets = { current: 0, days_30_60: 0, days_60_90: 0, days_90_180: 0, days_180_plus: 0 }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(0)
  })

  it('handles custom provision rates', () => {
    const buckets = {
      current: 100000,
      days_30_60: 0,
      days_60_90: 0,
      days_90_180: 0,
      days_180_plus: 0,
    }
    const customRates = {
      current: 0.02,
      days_30_60: 0.10,
      days_60_90: 0.20,
      days_90_180: 0.40,
      days_180_plus: 0.80,
    }
    expect(computeBadDebtProvision(buckets, customRates)).toBe(2000)
  })

  it('correctly applies 60% rate to days_180_plus bucket', () => {
    const buckets = {
      current: 0,
      days_30_60: 0,
      days_60_90: 0,
      days_90_180: 0,
      days_180_plus: 50000,
    }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(30000)
  })
})

// ── computeConcentrationRisk ──────────────────────────────────────────────────

describe('computeConcentrationRisk', () => {
  it('returns 0 when totalOutstanding is 0', () => {
    const customers = [{ customer_id: '1', outstanding: 0 }]
    expect(computeConcentrationRisk(customers, 0)).toBe(0)
  })

  it('returns 1 when single customer holds 100%', () => {
    const customers = [{ customer_id: '1', outstanding: 10000 }]
    expect(computeConcentrationRisk(customers, 10000)).toBe(1)
  })

  it('returns 0.5 for two equal customers (HHI = 0.5)', () => {
    const customers = [
      { customer_id: '1', outstanding: 5000 },
      { customer_id: '2', outstanding: 5000 },
    ]
    // (0.5)^2 + (0.5)^2 = 0.25 + 0.25 = 0.5
    expect(computeConcentrationRisk(customers, 10000)).toBe(0.5)
  })

  it('computes correct HHI for unequal split (80/20)', () => {
    const customers = [
      { customer_id: '1', outstanding: 8000 },
      { customer_id: '2', outstanding: 2000 },
    ]
    // (0.8)^2 + (0.2)^2 = 0.64 + 0.04 = 0.68
    expect(computeConcentrationRisk(customers, 10000)).toBeCloseTo(0.68, 5)
  })

  it('returns 1/n for n equal customers', () => {
    const customers = Array.from({ length: 4 }, (_, i) => ({
      customer_id: `${i}`,
      outstanding: 2500,
    }))
    // 4 × (0.25)^2 = 4 × 0.0625 = 0.25
    expect(computeConcentrationRisk(customers, 10000)).toBeCloseTo(0.25, 5)
  })

  it('handles null customer_id', () => {
    const customers = [{ customer_id: null, outstanding: 10000 }]
    expect(computeConcentrationRisk(customers, 10000)).toBe(1)
  })
})

// ── classifyAgingHealth ───────────────────────────────────────────────────────

describe('classifyAgingHealth', () => {
  it('returns critical when 90-day ratio > 40', () => {
    expect(classifyAgingHealth(41, null, null)).toBe('critical')
  })

  it('returns critical when DSO > 120', () => {
    expect(classifyAgingHealth(5, 121, null)).toBe('critical')
  })

  it('returns critical at DSO exactly 121', () => {
    expect(classifyAgingHealth(0, 121, null)).toBe('critical')
  })

  it('returns concern when 90-day ratio > 20', () => {
    expect(classifyAgingHealth(21, null, null)).toBe('concern')
  })

  it('returns concern when DSO > 90', () => {
    expect(classifyAgingHealth(5, 91, null)).toBe('concern')
  })

  it('returns watch when 90-day ratio > 10', () => {
    expect(classifyAgingHealth(11, null, null)).toBe('watch')
  })

  it('returns watch when DSO > 60', () => {
    expect(classifyAgingHealth(5, 61, null)).toBe('watch')
  })

  it('returns healthy when ratio <= 10 and dso <= 60', () => {
    expect(classifyAgingHealth(5, 45, null)).toBe('healthy')
  })

  it('returns healthy when dso is null', () => {
    expect(classifyAgingHealth(5, null, null)).toBe('healthy')
  })

  it('returns healthy with all zeros', () => {
    expect(classifyAgingHealth(0, 0, 100)).toBe('healthy')
  })

  it('ignores collectionEfficiencyPct in classification', () => {
    // Low efficiency should not change health based on ratio/dso alone
    expect(classifyAgingHealth(5, 30, 10)).toBe('healthy')
  })

  it('critical takes priority — checks critical before concern', () => {
    // ratio=41 (>40, critical) even though dso=50 (would be healthy)
    expect(classifyAgingHealth(41, 50, null)).toBe('critical')
  })

  it('returns healthy at boundary: ratio=10, dso=60', () => {
    expect(classifyAgingHealth(10, 60, null)).toBe('healthy')
  })
})

// ── computeWeightedAgeDays ────────────────────────────────────────────────────

describe('computeWeightedAgeDays', () => {
  it('returns null when all amounts are 0', () => {
    const buckets = [
      { midpoint_days: 15, amount: 0 },
      { midpoint_days: 45, amount: 0 },
    ]
    expect(computeWeightedAgeDays(buckets)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(computeWeightedAgeDays([])).toBeNull()
  })

  it('returns midpoint when only one bucket has amount', () => {
    const buckets = [
      { midpoint_days: 15, amount: 1000 },
      { midpoint_days: 45, amount: 0 },
    ]
    expect(computeWeightedAgeDays(buckets)).toBe(15)
  })

  it('computes correct weighted average for two equal buckets', () => {
    const buckets = [
      { midpoint_days: 15, amount: 1000 },
      { midpoint_days: 45, amount: 1000 },
    ]
    // (15*1000 + 45*1000) / 2000 = 60000/2000 = 30
    expect(computeWeightedAgeDays(buckets)).toBe(30)
  })

  it('computes correct weighted average for unequal amounts', () => {
    const buckets = [
      { midpoint_days: 15, amount: 3000 },
      { midpoint_days: 75, amount: 1000 },
    ]
    // (15*3000 + 75*1000) / 4000 = (45000 + 75000) / 4000 = 120000/4000 = 30
    expect(computeWeightedAgeDays(buckets)).toBe(30)
  })

  it('uses correct midpoints per spec (15, 45, 75, 135, 270, 450)', () => {
    // Validate standard midpoints produce expected weighted avg
    const buckets = [
      { midpoint_days: 15,  amount: 1000 },
      { midpoint_days: 45,  amount: 1000 },
      { midpoint_days: 75,  amount: 1000 },
      { midpoint_days: 135, amount: 1000 },
      { midpoint_days: 270, amount: 1000 },
      { midpoint_days: 450, amount: 1000 },
    ]
    // (15+45+75+135+270+450)/6 = 990/6 = 165
    expect(computeWeightedAgeDays(buckets)).toBe(165)
  })
})

// ── estimateCollectionTimeline ────────────────────────────────────────────────

describe('estimateCollectionTimeline', () => {
  it('returns null when rate is 0', () => {
    expect(estimateCollectionTimeline(50000, 0)).toBeNull()
  })

  it('returns null when rate is negative', () => {
    expect(estimateCollectionTimeline(50000, -0.1)).toBeNull()
  })

  it('returns null when rate is exactly 1', () => {
    expect(estimateCollectionTimeline(50000, 1)).toBeNull()
  })

  it('returns null when rate exceeds 1', () => {
    expect(estimateCollectionTimeline(50000, 1.1)).toBeNull()
  })

  it('returns null when outstanding is 0', () => {
    expect(estimateCollectionTimeline(0, 0.3)).toBeNull()
  })

  it('returns null when outstanding is negative', () => {
    expect(estimateCollectionTimeline(-100, 0.3)).toBeNull()
  })

  it('returns months until outstanding drops below 1000', () => {
    // 10000 at 50% rate: 10000→5000→2500→1250→625 (<1000) in 4 months
    expect(estimateCollectionTimeline(10000, 0.5)).toBe(4)
  })

  it('returns 1 for small outstanding with very high rate', () => {
    // 1500 at 90%: 1500 → 150 (<1000) in 1 month
    expect(estimateCollectionTimeline(1500, 0.9)).toBe(1)
  })

  it('caps at 36 months for very low rate with large outstanding', () => {
    // 1,000,000 at 1% rate — very slow, should cap at 36
    expect(estimateCollectionTimeline(1_000_000, 0.01)).toBe(36)
  })

  it('returns a number > 0 for small rate', () => {
    const result = estimateCollectionTimeline(100000, 0.05)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0)
  })

  it('returns <= 36 always', () => {
    const result = estimateCollectionTimeline(999_999_999, 0.001)
    expect(result!).toBeLessThanOrEqual(36)
  })
})

// ── generateAgingNarrative ────────────────────────────────────────────────────

describe('generateAgingNarrative', () => {
  it('returns healthy Turkish string for healthy health', () => {
    const result = generateAgingNarrative('healthy', 30, 0, 0, 0)
    expect(result).toBe('Alacak tahsilat süreci sağlıklı — DSO hedef seviyelerde.')
  })

  it('includes DSO value in watch string', () => {
    const result = generateAgingNarrative('watch', 65, 5000, 500, 0)
    expect(result).toContain('65')
    expect(result).toContain('gün')
  })

  it('returns watch Turkish string for watch health', () => {
    const result = generateAgingNarrative('watch', 75, 20000, 1000, 0)
    expect(result).toContain('DSO')
    expect(result).toContain('takip gerektiren')
  })

  it('returns concern Turkish string with overdue amount', () => {
    const result = generateAgingNarrative('concern', 95, 45000, 6750, 1)
    expect(result).toContain('vadesi geçmiş')
    expect(result).toContain('aksiyona')
  })

  it('includes overdue amount in concern string', () => {
    const result = generateAgingNarrative('concern', 95, 45000, 6750, 1)
    expect(result).toContain('45.000')
  })

  it('returns critical Turkish string with critical customer count', () => {
    const result = generateAgingNarrative('critical', 150, 100000, 60000, 3)
    expect(result).toContain('Kritik')
    expect(result).toContain('3')
    expect(result).toContain('müşteride')
  })

  it('includes provision amount in critical string', () => {
    const result = generateAgingNarrative('critical', 150, 100000, 60000, 3)
    expect(result).toContain('60.000')
    expect(result).toContain('karşılık')
  })

  it('handles null DSO in watch string gracefully', () => {
    // Should not throw
    const result = generateAgingNarrative('watch', null, 5000, 500, 0)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('handles 0 critical customers in critical string', () => {
    const result = generateAgingNarrative('critical', 130, 100000, 50000, 0)
    expect(result).toContain('0')
  })
})
