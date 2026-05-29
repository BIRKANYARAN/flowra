/**
 * Inventory Aging Service — pure-math tests.
 *
 * Scope (no DB — all pure function inputs):
 *   • computeDaysInStock()
 *   • computeLotValue()
 *   • classifyAgingTier()
 *   • computeInventoryTurnover()
 *   • computeDaysInventoryOutstanding()
 *   • classifyTurnoverHealth()
 *   • buildAgingBuckets()
 *   • computeObsolescenceRisk()
 *   • classifyObsolescenceRisk()
 *   • computeSlowMovingValue()
 *   • computeInventoryHealthScore()
 *   • classifyInventoryHealth()
 *   • generateInventoryNarrative()
 *   • findTopAgingLots()
 *
 * Run with:  npx vitest run tests/inventory-aging.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDaysInStock,
  computeLotValue,
  classifyAgingTier,
  computeInventoryTurnover,
  computeDaysInventoryOutstanding,
  classifyTurnoverHealth,
  buildAgingBuckets,
  computeObsolescenceRisk,
  classifyObsolescenceRisk,
  computeSlowMovingValue,
  computeInventoryHealthScore,
  classifyInventoryHealth,
  generateInventoryNarrative,
  findTopAgingLots,
  type StockLotInput,
} from '../lib/services/commercial/inventory-aging.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeDaysInStock
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDaysInStock', () => {
  it('returns 0 for same date', () => {
    expect(computeDaysInStock('2024-01-01', '2024-01-01')).toBe(0)
  })

  it('returns 1 for next day', () => {
    expect(computeDaysInStock('2024-01-01', '2024-01-02')).toBe(1)
  })

  it('returns 30 for exactly 30 days', () => {
    expect(computeDaysInStock('2024-01-01', '2024-01-31')).toBe(30)
  })

  it('returns 365 for one year', () => {
    expect(computeDaysInStock('2024-01-01', '2025-01-01')).toBe(366) // 2024 is leap year
  })

  it('returns 365 for non-leap year', () => {
    expect(computeDaysInStock('2023-01-01', '2024-01-01')).toBe(365)
  })

  it('returns 0 when asOfDate is before entryDate (min 0)', () => {
    expect(computeDaysInStock('2024-06-01', '2024-01-01')).toBe(0)
  })

  it('handles large gaps', () => {
    expect(computeDaysInStock('2020-01-01', '2024-01-01')).toBeGreaterThan(1000)
  })

  it('handles end of month correctly', () => {
    expect(computeDaysInStock('2024-01-31', '2024-02-29')).toBe(29)
  })

  it('handles year boundary', () => {
    expect(computeDaysInStock('2023-12-31', '2024-01-01')).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeLotValue
// ─────────────────────────────────────────────────────────────────────────────
describe('computeLotValue', () => {
  it('multiplies quantity by cost', () => {
    expect(computeLotValue(100, 50)).toBe(5000)
  })

  it('returns 0 for zero quantity', () => {
    expect(computeLotValue(0, 100)).toBe(0)
  })

  it('returns 0 for zero cost', () => {
    expect(computeLotValue(100, 0)).toBe(0)
  })

  it('handles fractional values', () => {
    expect(computeLotValue(1.5, 10.5)).toBeCloseTo(15.75)
  })

  it('handles large values', () => {
    expect(computeLotValue(10000, 999.99)).toBeCloseTo(9_999_900)
  })

  it('handles both fractional', () => {
    expect(computeLotValue(2.5, 4.0)).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyAgingTier
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyAgingTier', () => {
  it('classifies 0 days as fresh', () => {
    expect(classifyAgingTier(0)).toBe('fresh')
  })

  it('classifies 30 days as fresh (boundary)', () => {
    expect(classifyAgingTier(30)).toBe('fresh')
  })

  it('classifies 31 days as normal', () => {
    expect(classifyAgingTier(31)).toBe('normal')
  })

  it('classifies 90 days as normal (boundary)', () => {
    expect(classifyAgingTier(90)).toBe('normal')
  })

  it('classifies 91 days as aging', () => {
    expect(classifyAgingTier(91)).toBe('aging')
  })

  it('classifies 180 days as aging (boundary)', () => {
    expect(classifyAgingTier(180)).toBe('aging')
  })

  it('classifies 181 days as slow_moving', () => {
    expect(classifyAgingTier(181)).toBe('slow_moving')
  })

  it('classifies 365 days as slow_moving (boundary)', () => {
    expect(classifyAgingTier(365)).toBe('slow_moving')
  })

  it('classifies 366 days as obsolete', () => {
    expect(classifyAgingTier(366)).toBe('obsolete')
  })

  it('classifies 730 days as obsolete', () => {
    expect(classifyAgingTier(730)).toBe('obsolete')
  })

  it('classifies 1 day as fresh', () => {
    expect(classifyAgingTier(1)).toBe('fresh')
  })

  it('classifies 60 days as normal', () => {
    expect(classifyAgingTier(60)).toBe('normal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeInventoryTurnover
// ─────────────────────────────────────────────────────────────────────────────
describe('computeInventoryTurnover', () => {
  it('computes turnover correctly', () => {
    expect(computeInventoryTurnover(100_000, 50_000)).toBe(2)
  })

  it('returns null when avgInventoryValue is 0', () => {
    expect(computeInventoryTurnover(100_000, 0)).toBeNull()
  })

  it('handles COGS of 0', () => {
    expect(computeInventoryTurnover(0, 50_000)).toBe(0)
  })

  it('computes fractional turnover', () => {
    expect(computeInventoryTurnover(1_000, 3_000)).toBeCloseTo(0.333, 2)
  })

  it('high turnover scenario', () => {
    expect(computeInventoryTurnover(1_200_000, 100_000)).toBe(12)
  })

  it('returns null for zero cogs and zero inventory', () => {
    expect(computeInventoryTurnover(0, 0)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDaysInventoryOutstanding
// ─────────────────────────────────────────────────────────────────────────────
describe('computeDaysInventoryOutstanding', () => {
  it('returns null for null turnover', () => {
    expect(computeDaysInventoryOutstanding(null)).toBeNull()
  })

  it('returns null for zero turnover', () => {
    expect(computeDaysInventoryOutstanding(0)).toBeNull()
  })

  it('computes DIO for turnover 1', () => {
    expect(computeDaysInventoryOutstanding(1)).toBe(365)
  })

  it('computes DIO for turnover 2', () => {
    expect(computeDaysInventoryOutstanding(2)).toBe(182.5)
  })

  it('computes DIO for turnover 12', () => {
    expect(computeDaysInventoryOutstanding(12)).toBeCloseTo(30.42, 1)
  })

  it('computes DIO for high turnover', () => {
    expect(computeDaysInventoryOutstanding(52)).toBeCloseTo(7.02, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyTurnoverHealth
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyTurnoverHealth', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyTurnoverHealth(null)).toBe('insufficient_data')
  })

  it('classifies 0 days as excellent', () => {
    expect(classifyTurnoverHealth(0)).toBe('excellent')
  })

  it('classifies 30 days as excellent (boundary)', () => {
    expect(classifyTurnoverHealth(30)).toBe('excellent')
  })

  it('classifies 31 days as good', () => {
    expect(classifyTurnoverHealth(31)).toBe('good')
  })

  it('classifies 60 days as good (boundary)', () => {
    expect(classifyTurnoverHealth(60)).toBe('good')
  })

  it('classifies 61 days as acceptable', () => {
    expect(classifyTurnoverHealth(61)).toBe('acceptable')
  })

  it('classifies 90 days as acceptable (boundary)', () => {
    expect(classifyTurnoverHealth(90)).toBe('acceptable')
  })

  it('classifies 91 days as slow', () => {
    expect(classifyTurnoverHealth(91)).toBe('slow')
  })

  it('classifies 180 days as slow (boundary)', () => {
    expect(classifyTurnoverHealth(180)).toBe('slow')
  })

  it('classifies 181 days as critical', () => {
    expect(classifyTurnoverHealth(181)).toBe('critical')
  })

  it('classifies 500 days as critical', () => {
    expect(classifyTurnoverHealth(500)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildAgingBuckets
// ─────────────────────────────────────────────────────────────────────────────
describe('buildAgingBuckets', () => {
  it('returns 5 buckets', () => {
    const buckets = buildAgingBuckets([], 0)
    expect(buckets).toHaveLength(5)
  })

  it('allocates lots to correct bucket — fresh', () => {
    const lots = [{ days_in_stock: 15, total_units: 10, total_value_try: 1000 }]
    const buckets = buildAgingBuckets(lots, 1000)
    const fresh = buckets.find(b => b.min_days === 0)!
    expect(fresh.lot_count).toBe(1)
    expect(fresh.total_value_try).toBe(1000)
  })

  it('allocates lots to correct bucket — normal', () => {
    const lots = [{ days_in_stock: 60, total_units: 5, total_value_try: 500 }]
    const buckets = buildAgingBuckets(lots, 500)
    const normal = buckets.find(b => b.min_days === 31)!
    expect(normal.lot_count).toBe(1)
  })

  it('allocates lots to correct bucket — aging', () => {
    const lots = [{ days_in_stock: 120, total_units: 3, total_value_try: 300 }]
    const buckets = buildAgingBuckets(lots, 300)
    const aging = buckets.find(b => b.min_days === 91)!
    expect(aging.lot_count).toBe(1)
  })

  it('allocates lots to correct bucket — slow_moving', () => {
    const lots = [{ days_in_stock: 200, total_units: 2, total_value_try: 200 }]
    const buckets = buildAgingBuckets(lots, 200)
    const slow = buckets.find(b => b.min_days === 181)!
    expect(slow.lot_count).toBe(1)
  })

  it('allocates lots to correct bucket — obsolete', () => {
    const lots = [{ days_in_stock: 400, total_units: 1, total_value_try: 100 }]
    const buckets = buildAgingBuckets(lots, 100)
    const obs = buckets.find(b => b.min_days === 366)!
    expect(obs.lot_count).toBe(1)
    expect(obs.total_value_try).toBe(100)
  })

  it('computes pct_of_total_value correctly', () => {
    const lots = [
      { days_in_stock: 10, total_units: 10, total_value_try: 400 },
      { days_in_stock: 400, total_units: 5, total_value_try: 100 },
    ]
    const buckets = buildAgingBuckets(lots, 500)
    const fresh = buckets.find(b => b.min_days === 0)!
    expect(fresh.pct_of_total_value).toBeCloseTo(80)
    const obs = buckets.find(b => b.min_days === 366)!
    expect(obs.pct_of_total_value).toBeCloseTo(20)
  })

  it('returns 0 pct for empty lots with 0 totalValue', () => {
    const buckets = buildAgingBuckets([], 0)
    expect(buckets.every(b => b.pct_of_total_value === 0)).toBe(true)
  })

  it('boundary: 30 days goes to fresh bucket', () => {
    const lots = [{ days_in_stock: 30, total_units: 1, total_value_try: 100 }]
    const buckets = buildAgingBuckets(lots, 100)
    const fresh = buckets.find(b => b.min_days === 0)!
    expect(fresh.lot_count).toBe(1)
  })

  it('boundary: 365 days goes to slow_moving bucket', () => {
    const lots = [{ days_in_stock: 365, total_units: 1, total_value_try: 100 }]
    const buckets = buildAgingBuckets(lots, 100)
    const slow = buckets.find(b => b.min_days === 181)!
    expect(slow.lot_count).toBe(1)
  })

  it('sums multiple lots in same bucket', () => {
    const lots = [
      { days_in_stock: 5, total_units: 10, total_value_try: 100 },
      { days_in_stock: 20, total_units: 5, total_value_try: 50 },
    ]
    const buckets = buildAgingBuckets(lots, 150)
    const fresh = buckets.find(b => b.min_days === 0)!
    expect(fresh.lot_count).toBe(2)
    expect(fresh.total_units).toBe(15)
    expect(fresh.total_value_try).toBe(150)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeObsolescenceRisk
// ─────────────────────────────────────────────────────────────────────────────
describe('computeObsolescenceRisk', () => {
  it('returns 0 when totalInventoryValue is 0', () => {
    expect(computeObsolescenceRisk(100, 0)).toBe(0)
  })

  it('returns 0 when obsoleteValue is 0', () => {
    expect(computeObsolescenceRisk(0, 1000)).toBe(0)
  })

  it('computes percentage correctly', () => {
    expect(computeObsolescenceRisk(200, 1000)).toBe(20)
  })

  it('returns 100 when all inventory is obsolete', () => {
    expect(computeObsolescenceRisk(1000, 1000)).toBe(100)
  })

  it('handles small fractions', () => {
    expect(computeObsolescenceRisk(1, 1000)).toBeCloseTo(0.1, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyObsolescenceRisk
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyObsolescenceRisk', () => {
  it('classifies 0% as low', () => {
    expect(classifyObsolescenceRisk(0)).toBe('low')
  })

  it('classifies 4.9% as low (just under boundary)', () => {
    expect(classifyObsolescenceRisk(4.9)).toBe('low')
  })

  it('classifies 5% as moderate', () => {
    expect(classifyObsolescenceRisk(5)).toBe('moderate')
  })

  it('classifies 14.9% as moderate (just under boundary)', () => {
    expect(classifyObsolescenceRisk(14.9)).toBe('moderate')
  })

  it('classifies 15% as high', () => {
    expect(classifyObsolescenceRisk(15)).toBe('high')
  })

  it('classifies 29.9% as high (just under boundary)', () => {
    expect(classifyObsolescenceRisk(29.9)).toBe('high')
  })

  it('classifies 30% as critical (boundary)', () => {
    expect(classifyObsolescenceRisk(30)).toBe('critical')
  })

  it('classifies 50% as critical', () => {
    expect(classifyObsolescenceRisk(50)).toBe('critical')
  })

  it('classifies 100% as critical', () => {
    expect(classifyObsolescenceRisk(100)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeSlowMovingValue
// ─────────────────────────────────────────────────────────────────────────────
describe('computeSlowMovingValue', () => {
  it('returns 0 for empty array', () => {
    expect(computeSlowMovingValue([])).toBe(0)
  })

  it('sums slow_moving lots', () => {
    const lots = [
      { aging_tier: 'slow_moving', total_value_try: 500 },
      { aging_tier: 'fresh', total_value_try: 1000 },
    ]
    expect(computeSlowMovingValue(lots)).toBe(500)
  })

  it('sums obsolete lots', () => {
    const lots = [
      { aging_tier: 'obsolete', total_value_try: 300 },
      { aging_tier: 'fresh', total_value_try: 200 },
    ]
    expect(computeSlowMovingValue(lots)).toBe(300)
  })

  it('sums both slow_moving and obsolete', () => {
    const lots = [
      { aging_tier: 'slow_moving', total_value_try: 500 },
      { aging_tier: 'obsolete', total_value_try: 300 },
      { aging_tier: 'normal', total_value_try: 200 },
    ]
    expect(computeSlowMovingValue(lots)).toBe(800)
  })

  it('excludes fresh, normal, aging tiers', () => {
    const lots = [
      { aging_tier: 'fresh', total_value_try: 1000 },
      { aging_tier: 'normal', total_value_try: 800 },
      { aging_tier: 'aging', total_value_try: 600 },
    ]
    expect(computeSlowMovingValue(lots)).toBe(0)
  })

  it('handles multiple slow_moving lots', () => {
    const lots = [
      { aging_tier: 'slow_moving', total_value_try: 100 },
      { aging_tier: 'slow_moving', total_value_try: 200 },
      { aging_tier: 'obsolete', total_value_try: 50 },
    ]
    expect(computeSlowMovingValue(lots)).toBe(350)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeInventoryHealthScore
// ─────────────────────────────────────────────────────────────────────────────
describe('computeInventoryHealthScore', () => {
  it('max score: excellent + low + 100% fresh', () => {
    const score = computeInventoryHealthScore('excellent', 'low', 100)
    expect(score).toBe(100) // 50 + 30 + 20
  })

  it('min meaningful score: critical + critical + 0% fresh', () => {
    const score = computeInventoryHealthScore('critical', 'critical', 0)
    expect(score).toBe(5) // 5 + 0 + 0
  })

  it('uses correct points for turnover excellent', () => {
    expect(computeInventoryHealthScore('excellent', 'low', 0)).toBe(80) // 50+30+0
  })

  it('uses correct points for turnover good', () => {
    expect(computeInventoryHealthScore('good', 'low', 0)).toBe(70) // 40+30+0
  })

  it('uses correct points for turnover acceptable', () => {
    expect(computeInventoryHealthScore('acceptable', 'low', 0)).toBe(60) // 30+30+0
  })

  it('uses correct points for turnover slow', () => {
    expect(computeInventoryHealthScore('slow', 'low', 0)).toBe(45) // 15+30+0
  })

  it('uses correct points for turnover critical', () => {
    expect(computeInventoryHealthScore('critical', 'low', 0)).toBe(35) // 5+30+0
  })

  it('uses correct points for insufficient_data', () => {
    expect(computeInventoryHealthScore('insufficient_data', 'low', 0)).toBe(55) // 25+30+0
  })

  it('uses correct points for obsolescence moderate', () => {
    expect(computeInventoryHealthScore('excellent', 'moderate', 0)).toBe(70) // 50+20+0
  })

  it('uses correct points for obsolescence high', () => {
    expect(computeInventoryHealthScore('excellent', 'high', 0)).toBe(60) // 50+10+0
  })

  it('uses correct points for obsolescence critical', () => {
    expect(computeInventoryHealthScore('excellent', 'critical', 0)).toBe(50) // 50+0+0
  })

  it('computes fresh percentage contribution correctly at 50%', () => {
    const score = computeInventoryHealthScore('excellent', 'low', 50)
    expect(score).toBe(90) // 50+30+10
  })

  it('caps freshPct at 100', () => {
    const score = computeInventoryHealthScore('excellent', 'low', 150)
    expect(score).toBe(100) // capped
  })

  it('floors freshPct at 0', () => {
    const score = computeInventoryHealthScore('excellent', 'low', -10)
    expect(score).toBe(80) // 0 fresh contribution
  })

  it('returns integer (rounded)', () => {
    const score = computeInventoryHealthScore('excellent', 'low', 33.3)
    expect(Number.isInteger(score)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyInventoryHealth
// ─────────────────────────────────────────────────────────────────────────────
describe('classifyInventoryHealth', () => {
  it('classifies 100 as excellent', () => {
    expect(classifyInventoryHealth(100)).toBe('excellent')
  })

  it('classifies 80 as excellent (boundary)', () => {
    expect(classifyInventoryHealth(80)).toBe('excellent')
  })

  it('classifies 79 as good', () => {
    expect(classifyInventoryHealth(79)).toBe('good')
  })

  it('classifies 60 as good (boundary)', () => {
    expect(classifyInventoryHealth(60)).toBe('good')
  })

  it('classifies 59 as fair', () => {
    expect(classifyInventoryHealth(59)).toBe('fair')
  })

  it('classifies 40 as fair (boundary)', () => {
    expect(classifyInventoryHealth(40)).toBe('fair')
  })

  it('classifies 39 as poor', () => {
    expect(classifyInventoryHealth(39)).toBe('poor')
  })

  it('classifies 20 as poor (boundary)', () => {
    expect(classifyInventoryHealth(20)).toBe('poor')
  })

  it('classifies 19 as critical', () => {
    expect(classifyInventoryHealth(19)).toBe('critical')
  })

  it('classifies 0 as critical', () => {
    expect(classifyInventoryHealth(0)).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// generateInventoryNarrative
// ─────────────────────────────────────────────────────────────────────────────
describe('generateInventoryNarrative', () => {
  it('generates narrative for excellent health', () => {
    const text = generateInventoryNarrative('excellent', 20, 1, 0)
    expect(text).toContain('mükemmel')
    expect(text).toContain('20 günlük')
  })

  it('generates narrative for good health', () => {
    const text = generateInventoryNarrative('good', 45, 3, 0)
    expect(text).toContain('iyi')
    expect(text).toContain('45 günlük')
  })

  it('generates narrative for fair health', () => {
    const text = generateInventoryNarrative('fair', 80, 8, 5000)
    expect(text).toContain('orta')
  })

  it('generates narrative for poor health', () => {
    const text = generateInventoryNarrative('poor', 150, 20, 50000)
    expect(text).toContain('zayıf')
  })

  it('generates narrative for critical health', () => {
    const text = generateInventoryNarrative('critical', 300, 35, 200000)
    expect(text).toContain('kritik')
  })

  it('includes DIO when provided', () => {
    const text = generateInventoryNarrative('good', 55, 2, 0)
    expect(text).toContain('55 günlük')
  })

  it('handles null DIO gracefully', () => {
    const text = generateInventoryNarrative('fair', null, 5, 0)
    expect(text).toContain('yetersiz devir verisi')
  })

  it('includes obsolescence percentage when > 0', () => {
    const text = generateInventoryNarrative('poor', 200, 25.5, 0)
    expect(text).toContain('25.5')
  })

  it('includes slow moving value when > 0', () => {
    const text = generateInventoryNarrative('poor', 200, 5, 12345)
    expect(text).toContain('12.3K')
  })

  it('omits slow moving text when value is 0', () => {
    const text = generateInventoryNarrative('good', 45, 0, 0)
    expect(text).not.toContain('Yavaş hareket')
  })

  it('returns non-empty string for unknown health level', () => {
    const text = generateInventoryNarrative('unknown_level', 60, 5, 0)
    expect(text.length).toBeGreaterThan(0)
  })

  it('all health levels produce Turkish text (non-empty)', () => {
    const levels = ['excellent', 'good', 'fair', 'poor', 'critical']
    for (const health of levels) {
      const text = generateInventoryNarrative(health, 30, 5, 10000)
      expect(text.length).toBeGreaterThan(20)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// findTopAgingLots
// ─────────────────────────────────────────────────────────────────────────────
describe('findTopAgingLots', () => {
  function makeLot(overrides: Partial<StockLotInput & { days_in_stock: number; total_value_try: number; aging_tier: string }> = {}) {
    return {
      lot_id:             overrides.lot_id           ?? 'lot-1',
      product_id:         overrides.product_id       ?? 'prod-1',
      product_name:       overrides.product_name     ?? 'Test Ürün',
      category:           overrides.category         ?? null,
      quantity_remaining: overrides.quantity_remaining ?? 10,
      entry_cost_try:     overrides.entry_cost_try   ?? 100,
      entry_date:         overrides.entry_date       ?? '2023-01-01',
      last_movement_date: overrides.last_movement_date ?? null,
      days_in_stock:      overrides.days_in_stock    ?? 100,
      total_value_try:    overrides.total_value_try  ?? 1000,
      aging_tier:         overrides.aging_tier       ?? 'aging',
    }
  }

  it('returns empty array for empty input', () => {
    expect(findTopAgingLots([], 10)).toEqual([])
  })

  it('sorts by days_in_stock descending', () => {
    const lots = [
      makeLot({ lot_id: 'a', days_in_stock: 100 }),
      makeLot({ lot_id: 'b', days_in_stock: 500 }),
      makeLot({ lot_id: 'c', days_in_stock: 200 }),
    ]
    const result = findTopAgingLots(lots, 3)
    expect(result[0].days_in_stock).toBe(500)
    expect(result[1].days_in_stock).toBe(200)
    expect(result[2].days_in_stock).toBe(100)
  })

  it('limits to requested count', () => {
    const lots = Array.from({ length: 20 }, (_, i) =>
      makeLot({ lot_id: `lot-${i}`, days_in_stock: i * 10 })
    )
    const result = findTopAgingLots(lots, 5)
    expect(result).toHaveLength(5)
  })

  it('returns all when limit > array length', () => {
    const lots = [
      makeLot({ lot_id: 'a', days_in_stock: 100 }),
      makeLot({ lot_id: 'b', days_in_stock: 200 }),
    ]
    const result = findTopAgingLots(lots, 10)
    expect(result).toHaveLength(2)
  })

  it('returns correct fields', () => {
    const lots = [makeLot({
      product_id:    'prod-abc',
      product_name:  'Ürün ABC',
      days_in_stock: 300,
      total_value_try: 5000,
      aging_tier:    'slow_moving',
    })]
    const result = findTopAgingLots(lots, 1)
    expect(result[0]).toMatchObject({
      product_id:    'prod-abc',
      product_name:  'Ürün ABC',
      days_in_stock: 300,
      total_value_try: 5000,
      aging_tier:    'slow_moving',
    })
  })

  it('does not mutate original array', () => {
    const lots = [
      makeLot({ lot_id: 'a', days_in_stock: 100 }),
      makeLot({ lot_id: 'b', days_in_stock: 500 }),
    ]
    const original = lots.map(l => l.days_in_stock)
    findTopAgingLots(lots, 2)
    expect(lots.map(l => l.days_in_stock)).toEqual(original)
  })

  it('handles limit of 0', () => {
    const lots = [makeLot({ days_in_stock: 100 })]
    expect(findTopAgingLots(lots, 0)).toEqual([])
  })

  it('handles lots with equal days_in_stock', () => {
    const lots = [
      makeLot({ lot_id: 'a', days_in_stock: 200 }),
      makeLot({ lot_id: 'b', days_in_stock: 200 }),
    ]
    const result = findTopAgingLots(lots, 2)
    expect(result).toHaveLength(2)
    expect(result[0].days_in_stock).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Integration-style: full pipeline simulation
// ─────────────────────────────────────────────────────────────────────────────
describe('full pipeline simulation', () => {
  it('computes a consistent health score for a healthy inventory', () => {
    // Setup: mostly fresh inventory, low obsolescence
    const dio = computeDaysInventoryOutstanding(
      computeInventoryTurnover(500_000, 100_000)
    )
    const turnoverHealth    = classifyTurnoverHealth(dio)
    const obsolescenceRisk  = classifyObsolescenceRisk(2) // 2%
    const score             = computeInventoryHealthScore(turnoverHealth, obsolescenceRisk, 80)
    const health            = classifyInventoryHealth(score)
    expect(['excellent', 'good']).toContain(health)
  })

  it('computes a consistent health score for an unhealthy inventory', () => {
    const dio = computeDaysInventoryOutstanding(
      computeInventoryTurnover(100_000, 500_000)
    )
    const turnoverHealth    = classifyTurnoverHealth(dio)
    const obsolescenceRisk  = classifyObsolescenceRisk(40) // 40%
    const score             = computeInventoryHealthScore(turnoverHealth, obsolescenceRisk, 5)
    const health            = classifyInventoryHealth(score)
    expect(['poor', 'critical']).toContain(health)
  })

  it('buildAgingBuckets pct sums to ≤100 for mixed lots', () => {
    const lots = [
      { days_in_stock: 10,  total_units: 100, total_value_try: 1000 },
      { days_in_stock: 60,  total_units: 80,  total_value_try: 800  },
      { days_in_stock: 130, total_units: 50,  total_value_try: 500  },
      { days_in_stock: 250, total_units: 30,  total_value_try: 300  },
      { days_in_stock: 400, total_units: 10,  total_value_try: 100  },
    ]
    const total   = lots.reduce((s, l) => s + l.total_value_try, 0)
    const buckets = buildAgingBuckets(lots, total)
    const sum     = buckets.reduce((s, b) => s + b.pct_of_total_value, 0)
    expect(sum).toBeCloseTo(100, 1)
  })

  it('obsolete lots drive up obsolescence risk', () => {
    const lots = [
      { aging_tier: 'fresh',    total_value_try: 400 },
      { aging_tier: 'obsolete', total_value_try: 600 },
    ]
    const slowVal = computeSlowMovingValue(lots)
    const riskPct = computeObsolescenceRisk(600, 1000)
    expect(riskPct).toBe(60)
    expect(slowVal).toBe(600)
    expect(classifyObsolescenceRisk(riskPct)).toBe('critical')
  })

  it('roundtrip: all aging tiers correctly classified by day ranges', () => {
    const testCases = [
      [0, 'fresh'], [15, 'fresh'], [30, 'fresh'],
      [31, 'normal'], [60, 'normal'], [90, 'normal'],
      [91, 'aging'], [135, 'aging'], [180, 'aging'],
      [181, 'slow_moving'], [270, 'slow_moving'], [365, 'slow_moving'],
      [366, 'obsolete'], [500, 'obsolete'], [1000, 'obsolete'],
    ] as const
    for (const [days, expected] of testCases) {
      expect(classifyAgingTier(days)).toBe(expected)
    }
  })
})
