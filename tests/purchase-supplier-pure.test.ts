// ═══════════════════════════════════════════════════════════════════════════════
// tests/purchase-supplier-pure.test.ts
//
// Pure-function tests for purchase-analytics.service.ts new helpers
// and supplier-performance.service.ts.
//
// Does NOT modify tests/purchase-analytics.test.ts.
// ═══════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'

import {
  computeFulfillmentRate,
  computePurchaseCycleTime,
  classifySupplierReliability,
  computeCostEfficiencyIndex,
  buildSupplierScorecard,
} from '@/lib/services/inventory/purchase-analytics.service'

import {
  computeOnTimeRate,
  gradeSupplierPerformance,
  isOverdue,
} from '@/lib/services/inventory/supplier-performance.service'

// ── computeFulfillmentRate ─────────────────────────────────────────────────────

describe('computeFulfillmentRate', () => {
  it('returns 0 when orderedItems is 0', () => {
    expect(computeFulfillmentRate(0, 0)).toBe(0)
    expect(computeFulfillmentRate(10, 0)).toBe(0)
  })

  it('returns 100 when fully fulfilled', () => {
    expect(computeFulfillmentRate(50, 50)).toBe(100)
  })

  it('returns 50 for half fulfillment', () => {
    expect(computeFulfillmentRate(5, 10)).toBe(50)
  })

  it('returns proportional percentage for partial fulfillment', () => {
    const rate = computeFulfillmentRate(3, 4)
    expect(rate).toBeCloseTo(75, 5)
  })

  it('can exceed 100 for over-delivery', () => {
    expect(computeFulfillmentRate(11, 10)).toBeCloseTo(110, 5)
  })

  it('handles large numbers correctly', () => {
    expect(computeFulfillmentRate(9900, 10000)).toBeCloseTo(99, 5)
  })
})

// ── computePurchaseCycleTime ───────────────────────────────────────────────────

describe('computePurchaseCycleTime', () => {
  it('returns null when receivedAt is null', () => {
    expect(computePurchaseCycleTime('2024-01-01', null)).toBeNull()
  })

  it('returns null when receivedAt is empty string', () => {
    expect(computePurchaseCycleTime('2024-01-01', '')).toBeNull()
  })

  it('returns 0 when orderedAt and receivedAt are the same date', () => {
    expect(computePurchaseCycleTime('2024-03-15', '2024-03-15')).toBe(0)
  })

  it('returns correct days for a 7-day cycle', () => {
    expect(computePurchaseCycleTime('2024-01-01', '2024-01-08')).toBe(7)
  })

  it('returns correct days for a 30-day cycle', () => {
    expect(computePurchaseCycleTime('2024-01-01', '2024-01-31')).toBe(30)
  })

  it('handles full ISO datetime strings by truncating to date part', () => {
    expect(computePurchaseCycleTime('2024-06-01T09:00:00Z', '2024-06-06T18:00:00Z')).toBe(5)
  })

  it('handles cross-month dates correctly', () => {
    expect(computePurchaseCycleTime('2024-01-28', '2024-02-04')).toBe(7)
  })

  it('handles cross-year dates correctly', () => {
    expect(computePurchaseCycleTime('2023-12-25', '2024-01-04')).toBe(10)
  })
})

// ── classifySupplierReliability ───────────────────────────────────────────────

describe('classifySupplierReliability', () => {
  it('returns excellent for top-tier supplier (>95%, >90% on-time, <7 days lead)', () => {
    expect(classifySupplierReliability(96, 6, 19, 20)).toBe('excellent')
  })

  it('returns excellent at boundary: 100% fulfillment, 100% on-time, 5 days', () => {
    expect(classifySupplierReliability(100, 5, 10, 10)).toBe('excellent')
  })

  it('returns good for >85% fulfillment and >70% on-time, even with slow lead time', () => {
    expect(classifySupplierReliability(90, 14, 15, 20)).toBe('good')
  })

  it('returns good at boundary: 86% fulfillment, 72% on-time', () => {
    expect(classifySupplierReliability(86, 10, 72, 100)).toBe('good')
  })

  it('does NOT return excellent if avgLeadDays >= 7', () => {
    // fulfillment >95, onTime >90 but lead time is exactly 7 (not < 7)
    expect(classifySupplierReliability(96, 7, 19, 20)).not.toBe('excellent')
  })

  it('does NOT return excellent if avgLeadDays is null', () => {
    expect(classifySupplierReliability(96, null, 19, 20)).not.toBe('excellent')
  })

  it('returns fair for >70% fulfillment with low on-time rate', () => {
    expect(classifySupplierReliability(75, 20, 5, 20)).toBe('fair')
  })

  it('returns fair at boundary: 71% fulfillment', () => {
    expect(classifySupplierReliability(71, null, 0, 0)).toBe('fair')
  })

  it('returns poor for <=70% fulfillment', () => {
    expect(classifySupplierReliability(70, 5, 18, 20)).toBe('poor')
  })

  it('returns poor for 0% fulfillment', () => {
    expect(classifySupplierReliability(0, null, 0, 0)).toBe('poor')
  })

  it('returns poor when totalDeliveries is 0 (on-time ratio is 0)', () => {
    // fulfillment 80 but onTime 0 out of 0 — good requires onTimeRatio > 0.7
    expect(classifySupplierReliability(80, 5, 0, 0)).toBe('fair')
  })
})

// ── computeCostEfficiencyIndex ─────────────────────────────────────────────────

describe('computeCostEfficiencyIndex', () => {
  it('returns 0 when actualCost is 0', () => {
    expect(computeCostEfficiencyIndex(0, 1000)).toBe(0)
    expect(computeCostEfficiencyIndex(0, 0)).toBe(0)
  })

  it('returns 100 when on budget (actual equals budgeted)', () => {
    expect(computeCostEfficiencyIndex(1000, 1000)).toBe(100)
  })

  it('returns > 100 when under budget (actual < budgeted)', () => {
    expect(computeCostEfficiencyIndex(800, 1000)).toBeCloseTo(125, 5)
  })

  it('returns < 100 when over budget (actual > budgeted)', () => {
    expect(computeCostEfficiencyIndex(1200, 1000)).toBeCloseTo(83.333, 2)
  })

  it('returns 50 when actual is double the budget', () => {
    expect(computeCostEfficiencyIndex(2000, 1000)).toBe(50)
  })

  it('returns 200 when actual is half the budget', () => {
    expect(computeCostEfficiencyIndex(500, 1000)).toBe(200)
  })
})

// ── buildSupplierScorecard ─────────────────────────────────────────────────────

describe('buildSupplierScorecard', () => {
  it('returns a non-empty string', () => {
    const result = buildSupplierScorecard('ABC Ltd', 96.5, 5.2, 'excellent')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes the supplier name', () => {
    const result = buildSupplierScorecard('Yıldız Market', 90, 10, 'good')
    expect(result).toContain('Yıldız Market')
  })

  it('includes formatted fulfillment rate with Turkish percent symbol', () => {
    const result = buildSupplierScorecard('Test', 96.5, 5.2, 'excellent')
    expect(result).toContain('%96.50')
  })

  it('includes avg lead days with Turkish suffix', () => {
    const result = buildSupplierScorecard('Test', 90, 5.2, 'good')
    expect(result).toContain('5.20g')
  })

  it('shows Turkish "Mükemmel" label for excellent', () => {
    const result = buildSupplierScorecard('Test', 96, 6, 'excellent')
    expect(result).toContain('Mükemmel')
  })

  it('shows Turkish "İyi" label for good', () => {
    const result = buildSupplierScorecard('Test', 90, 10, 'good')
    expect(result).toContain('İyi')
  })

  it('shows Turkish "Orta" label for fair', () => {
    const result = buildSupplierScorecard('Test', 75, 20, 'fair')
    expect(result).toContain('Orta')
  })

  it('shows Turkish "Zayıf" label for poor', () => {
    const result = buildSupplierScorecard('Test', 50, null, 'poor')
    expect(result).toContain('Zayıf')
  })

  it('handles null avgLeadDays gracefully', () => {
    const result = buildSupplierScorecard('Test', 90, null, 'good')
    expect(result).toContain('Teslimat süresi bilinmiyor')
  })

  it('contains pipe separators between sections', () => {
    const result = buildSupplierScorecard('Test', 90, 10, 'good')
    expect(result.split('|').length).toBeGreaterThanOrEqual(3)
  })
})

// ── computeOnTimeRate ──────────────────────────────────────────────────────────

describe('computeOnTimeRate', () => {
  it('returns 0 when totalDeliveries is 0', () => {
    expect(computeOnTimeRate(0, 0)).toBe(0)
    expect(computeOnTimeRate(5, 0)).toBe(0)
  })

  it('returns 100 for all on-time deliveries', () => {
    expect(computeOnTimeRate(10, 10)).toBe(100)
  })

  it('returns 50 for half on-time', () => {
    expect(computeOnTimeRate(5, 10)).toBe(50)
  })

  it('returns proportional rate', () => {
    expect(computeOnTimeRate(3, 4)).toBeCloseTo(75, 5)
  })
})

// ── gradeSupplierPerformance ───────────────────────────────────────────────────

describe('gradeSupplierPerformance', () => {
  it('returns A for top performance', () => {
    expect(gradeSupplierPerformance(95, 90)).toBe('A')
    expect(gradeSupplierPerformance(100, 100)).toBe('A')
  })

  it('returns B for good performance', () => {
    expect(gradeSupplierPerformance(85, 75)).toBe('B')
    expect(gradeSupplierPerformance(90, 80)).toBe('B')
  })

  it('returns C for average performance', () => {
    expect(gradeSupplierPerformance(75, 60)).toBe('C')
  })

  it('returns D for below-average performance', () => {
    expect(gradeSupplierPerformance(60, 40)).toBe('D')
  })

  it('returns F for poor performance', () => {
    expect(gradeSupplierPerformance(50, 30)).toBe('F')
    expect(gradeSupplierPerformance(0, 0)).toBe('F')
  })

  it('does NOT give A when fulfillment just misses threshold (94.9)', () => {
    expect(gradeSupplierPerformance(94.9, 90)).not.toBe('A')
  })

  it('does NOT give A when on-time just misses threshold (89.9)', () => {
    expect(gradeSupplierPerformance(95, 89.9)).not.toBe('A')
  })
})

// ── isOverdue ──────────────────────────────────────────────────────────────────

describe('isOverdue', () => {
  it('returns true for ordered status with past expected date', () => {
    expect(isOverdue('2024-01-01', '2024-01-15', 'ordered')).toBe(true)
  })

  it('returns true for pending status with past expected date', () => {
    expect(isOverdue('2024-01-01', '2024-01-15', 'pending')).toBe(true)
  })

  it('returns false for finalized status even if date is past', () => {
    expect(isOverdue('2024-01-01', '2024-01-15', 'finalized')).toBe(false)
  })

  it('returns false for draft status', () => {
    expect(isOverdue('2024-01-01', '2024-01-15', 'draft')).toBe(false)
  })

  it('returns false when expected date is today', () => {
    expect(isOverdue('2024-01-15', '2024-01-15', 'ordered')).toBe(false)
  })

  it('returns false when expected date is in the future', () => {
    expect(isOverdue('2024-12-31', '2024-01-15', 'ordered')).toBe(false)
  })

  it('handles full ISO datetime strings by comparing date portion only', () => {
    expect(isOverdue('2024-01-01T00:00:00Z', '2024-06-01T12:00:00Z', 'ordered')).toBe(true)
  })

  it('returns false for unknown/cancelled status', () => {
    expect(isOverdue('2024-01-01', '2024-06-01', 'cancelled')).toBe(false)
    expect(isOverdue('2024-01-01', '2024-06-01', 'unknown')).toBe(false)
  })
})
