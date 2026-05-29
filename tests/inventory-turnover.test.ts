// ─────────────────────────────────────────────────────────────────────────────
// tests/inventory-turnover.test.ts
//
// Unit tests for pure helper functions in inventory-turnover.service.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeInventoryTurnover,
  computeDio,
  classifyTurnoverHealth,
  computeWeightedAvgInventoryAge,
  identifySlowMovingItems,
  classifySlowMovingSeverity,
  computeDeadStockValue,
  computeCarryingCostEstimate,
  computeInventoryToRevenueRatio,
  classifyInventoryToRevenueRatio,
  computeStockCoverageDays,
  computeReorderUrgency,
  generateInventoryNarrative,
  computeInventoryConcentration,
} from '../lib/services/commercial/inventory-turnover.service'

// ── Helper: create an ISO date N days ago ─────────────────────────────────────
function daysAgoISO(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ══════════════════════════════════════════════════════════════════════════════
// computeInventoryTurnover
// ══════════════════════════════════════════════════════════════════════════════

describe('computeInventoryTurnover', () => {
  it('returns null when avgInventoryValue is 0', () => {
    expect(computeInventoryTurnover(100_000, 0)).toBeNull()
  })

  it('returns null when avgInventoryValue is negative', () => {
    expect(computeInventoryTurnover(100_000, -1)).toBeNull()
  })

  it('computes correct ratio for normal values', () => {
    expect(computeInventoryTurnover(120_000, 10_000)).toBeCloseTo(12)
  })

  it('returns correct ratio: 6x', () => {
    expect(computeInventoryTurnover(60_000, 10_000)).toBeCloseTo(6)
  })

  it('returns correct ratio: less than 1x', () => {
    expect(computeInventoryTurnover(5_000, 10_000)).toBeCloseTo(0.5)
  })

  it('returns correct ratio: exactly 3x', () => {
    expect(computeInventoryTurnover(30_000, 10_000)).toBeCloseTo(3)
  })

  it('returns 0 when COGS is 0', () => {
    expect(computeInventoryTurnover(0, 10_000)).toBeCloseTo(0)
  })

  it('handles large values without overflow', () => {
    const result = computeInventoryTurnover(1_000_000_000, 100_000_000)
    expect(result).toBeCloseTo(10)
  })

  it('returns fractional result correctly', () => {
    expect(computeInventoryTurnover(100, 300)).toBeCloseTo(1 / 3, 5)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeDio
// ══════════════════════════════════════════════════════════════════════════════

describe('computeDio', () => {
  it('returns null for null turnover', () => {
    expect(computeDio(null)).toBeNull()
  })

  it('returns null for zero turnover', () => {
    expect(computeDio(0)).toBeNull()
  })

  it('returns null for negative turnover', () => {
    expect(computeDio(-1)).toBeNull()
  })

  it('returns 365 for 1x turnover', () => {
    expect(computeDio(1)).toBeCloseTo(365)
  })

  it('returns ~30.4 days for 12x turnover', () => {
    expect(computeDio(12)).toBeCloseTo(365 / 12)
  })

  it('returns ~60.8 for 6x turnover', () => {
    expect(computeDio(6)).toBeCloseTo(365 / 6)
  })

  it('returns ~121.7 for 3x turnover', () => {
    expect(computeDio(3)).toBeCloseTo(365 / 3)
  })

  it('returns > 365 for < 1x turnover', () => {
    expect(computeDio(0.5)).toBeCloseTo(730)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// classifyTurnoverHealth
// ══════════════════════════════════════════════════════════════════════════════

describe('classifyTurnoverHealth', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyTurnoverHealth(null)).toBe('insufficient_data')
  })

  it('returns excellent for >= 12', () => {
    expect(classifyTurnoverHealth(12)).toBe('excellent')
    expect(classifyTurnoverHealth(24)).toBe('excellent')
    expect(classifyTurnoverHealth(100)).toBe('excellent')
  })

  it('returns good for >= 6 and < 12', () => {
    expect(classifyTurnoverHealth(6)).toBe('good')
    expect(classifyTurnoverHealth(11.9)).toBe('good')
    expect(classifyTurnoverHealth(9)).toBe('good')
  })

  it('returns moderate for >= 3 and < 6', () => {
    expect(classifyTurnoverHealth(3)).toBe('moderate')
    expect(classifyTurnoverHealth(5.99)).toBe('moderate')
    expect(classifyTurnoverHealth(4)).toBe('moderate')
  })

  it('returns slow for >= 1 and < 3', () => {
    expect(classifyTurnoverHealth(1)).toBe('slow')
    expect(classifyTurnoverHealth(2.99)).toBe('slow')
  })

  it('returns very_slow for < 1', () => {
    expect(classifyTurnoverHealth(0.99)).toBe('very_slow')
    expect(classifyTurnoverHealth(0)).toBe('very_slow')
    expect(classifyTurnoverHealth(0.1)).toBe('very_slow')
  })

  it('boundary: 11.999 → good, not excellent', () => {
    expect(classifyTurnoverHealth(11.999)).toBe('good')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeWeightedAvgInventoryAge
// ══════════════════════════════════════════════════════════════════════════════

describe('computeWeightedAvgInventoryAge', () => {
  it('returns null for empty array', () => {
    expect(computeWeightedAvgInventoryAge([])).toBeNull()
  })

  it('returns null when all weights are zero', () => {
    const lots = [
      { qty_remaining: 0, entry_date: daysAgoISO(30), entry_cost_try: 100 },
      { qty_remaining: 10, entry_date: daysAgoISO(30), entry_cost_try: 0 },
    ]
    expect(computeWeightedAvgInventoryAge(lots)).toBeNull()
  })

  it('returns approximately correct age for a single lot', () => {
    const lots = [
      { qty_remaining: 10, entry_date: daysAgoISO(60), entry_cost_try: 100 },
    ]
    const result = computeWeightedAvgInventoryAge(lots)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(60, 0)
  })

  it('weights correctly — expensive lots pull age toward their date', () => {
    // Lot A: 100 days old, weight = 1 × 1000 = 1000
    // Lot B: 10 days old,  weight = 1 × 100  = 100
    // Weighted avg = (100×1000 + 10×100) / (1000+100) = 101000/1100 ≈ 91.8
    const lots = [
      { qty_remaining: 1, entry_date: daysAgoISO(100), entry_cost_try: 1000 },
      { qty_remaining: 1, entry_date: daysAgoISO(10),  entry_cost_try: 100  },
    ]
    const result = computeWeightedAvgInventoryAge(lots)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo((100 * 1000 + 10 * 100) / (1000 + 100), 0)
  })

  it('equal weight lots average their ages', () => {
    const lots = [
      { qty_remaining: 1, entry_date: daysAgoISO(40), entry_cost_try: 100 },
      { qty_remaining: 1, entry_date: daysAgoISO(60), entry_cost_try: 100 },
    ]
    const result = computeWeightedAvgInventoryAge(lots)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(50, 0)
  })

  it('ignores lots with zero qty and nonzero cost', () => {
    const lots = [
      { qty_remaining: 0, entry_date: daysAgoISO(200), entry_cost_try: 5000 },
      { qty_remaining: 5, entry_date: daysAgoISO(30),  entry_cost_try: 100 },
    ]
    const result = computeWeightedAvgInventoryAge(lots)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(30, 0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// identifySlowMovingItems
// ══════════════════════════════════════════════════════════════════════════════

describe('identifySlowMovingItems', () => {
  const makeItem = (id: string, daysSince: number | null) => ({
    product_id:         id,
    product_name:       `Product ${id}`,
    qty_in_stock:       10,
    stock_value_try:    1000,
    last_movement_date: daysSince !== null ? daysAgoISO(daysSince) : null,
  })

  it('returns items with null last_movement_date', () => {
    const items = [makeItem('a', null), makeItem('b', 30)]
    const result = identifySlowMovingItems(items)
    expect(result.map(i => i.product_id)).toContain('a')
    expect(result.map(i => i.product_id)).not.toContain('b')
  })

  it('returns items at exactly 90 days (default threshold)', () => {
    const items = [makeItem('a', 90), makeItem('b', 89)]
    const result = identifySlowMovingItems(items)
    expect(result.map(i => i.product_id)).toContain('a')
    expect(result.map(i => i.product_id)).not.toContain('b')
  })

  it('returns nothing for all recent items', () => {
    const items = [makeItem('a', 5), makeItem('b', 20), makeItem('c', 89)]
    expect(identifySlowMovingItems(items)).toHaveLength(0)
  })

  it('returns all items when all are old', () => {
    const items = [makeItem('a', 100), makeItem('b', 200), makeItem('c', 91)]
    expect(identifySlowMovingItems(items)).toHaveLength(3)
  })

  it('respects custom threshold', () => {
    const items = [makeItem('a', 60), makeItem('b', 59)]
    const result = identifySlowMovingItems(items, 60)
    expect(result.map(i => i.product_id)).toContain('a')
    expect(result.map(i => i.product_id)).not.toContain('b')
  })

  it('returns empty for empty input', () => {
    expect(identifySlowMovingItems([])).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// classifySlowMovingSeverity
// ══════════════════════════════════════════════════════════════════════════════

describe('classifySlowMovingSeverity', () => {
  it('returns dead_stock for null', () => {
    expect(classifySlowMovingSeverity(null)).toBe('dead_stock')
  })

  it('returns active for < 30 days', () => {
    expect(classifySlowMovingSeverity(0)).toBe('active')
    expect(classifySlowMovingSeverity(29)).toBe('active')
    expect(classifySlowMovingSeverity(1)).toBe('active')
  })

  it('returns watch for >= 30 and < 60', () => {
    expect(classifySlowMovingSeverity(30)).toBe('watch')
    expect(classifySlowMovingSeverity(59)).toBe('watch')
  })

  it('returns slow for >= 60 and < 90', () => {
    expect(classifySlowMovingSeverity(60)).toBe('slow')
    expect(classifySlowMovingSeverity(89)).toBe('slow')
  })

  it('returns very_slow for >= 90 and < 180', () => {
    expect(classifySlowMovingSeverity(90)).toBe('very_slow')
    expect(classifySlowMovingSeverity(179)).toBe('very_slow')
  })

  it('returns dead_stock for >= 180', () => {
    expect(classifySlowMovingSeverity(180)).toBe('dead_stock')
    expect(classifySlowMovingSeverity(365)).toBe('dead_stock')
    expect(classifySlowMovingSeverity(1000)).toBe('dead_stock')
  })

  it('boundary: exactly 30 is watch, not active', () => {
    expect(classifySlowMovingSeverity(30)).toBe('watch')
  })

  it('boundary: exactly 180 is dead_stock, not very_slow', () => {
    expect(classifySlowMovingSeverity(180)).toBe('dead_stock')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeDeadStockValue
// ══════════════════════════════════════════════════════════════════════════════

describe('computeDeadStockValue', () => {
  it('returns 0 for empty array', () => {
    expect(computeDeadStockValue([])).toBe(0)
  })

  it('counts items with null last_movement_date', () => {
    const items = [
      { qty_in_stock: 5, stock_value_try: 500, last_movement_date: null },
    ]
    expect(computeDeadStockValue(items)).toBe(500)
  })

  it('counts items with >= 180 days no movement', () => {
    const items = [
      { qty_in_stock: 5, stock_value_try: 1000, last_movement_date: daysAgoISO(180) },
      { qty_in_stock: 3, stock_value_try: 600,  last_movement_date: daysAgoISO(200) },
    ]
    expect(computeDeadStockValue(items)).toBeCloseTo(1600)
  })

  it('does not count items with < 180 days', () => {
    const items = [
      { qty_in_stock: 5, stock_value_try: 1000, last_movement_date: daysAgoISO(179) },
      { qty_in_stock: 3, stock_value_try: 600,  last_movement_date: daysAgoISO(10) },
    ]
    expect(computeDeadStockValue(items)).toBe(0)
  })

  it('handles mixed old and recent items', () => {
    const items = [
      { qty_in_stock: 5, stock_value_try: 1000, last_movement_date: daysAgoISO(200) }, // dead
      { qty_in_stock: 5, stock_value_try: 500,  last_movement_date: daysAgoISO(30) },  // active
      { qty_in_stock: 5, stock_value_try: 750,  last_movement_date: null },             // dead
    ]
    expect(computeDeadStockValue(items)).toBeCloseTo(1750)
  })

  it('boundary: exactly 180 days counts as dead stock', () => {
    const items = [
      { qty_in_stock: 1, stock_value_try: 999, last_movement_date: daysAgoISO(180) },
    ]
    expect(computeDeadStockValue(items)).toBeCloseTo(999)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeCarryingCostEstimate
// ══════════════════════════════════════════════════════════════════════════════

describe('computeCarryingCostEstimate', () => {
  it('uses default 25% rate', () => {
    expect(computeCarryingCostEstimate(100_000)).toBeCloseTo(25_000)
  })

  it('uses custom rate', () => {
    expect(computeCarryingCostEstimate(200_000, 30)).toBeCloseTo(60_000)
  })

  it('returns 0 for zero inventory', () => {
    expect(computeCarryingCostEstimate(0)).toBe(0)
  })

  it('uses 10% rate correctly', () => {
    expect(computeCarryingCostEstimate(50_000, 10)).toBeCloseTo(5_000)
  })

  it('handles fractional rate', () => {
    expect(computeCarryingCostEstimate(100_000, 12.5)).toBeCloseTo(12_500)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeInventoryToRevenueRatio
// ══════════════════════════════════════════════════════════════════════════════

describe('computeInventoryToRevenueRatio', () => {
  it('returns null when monthlyRevenue is 0', () => {
    expect(computeInventoryToRevenueRatio(100_000, 0)).toBeNull()
  })

  it('returns null when monthlyRevenue is negative', () => {
    expect(computeInventoryToRevenueRatio(100_000, -1)).toBeNull()
  })

  it('returns 1 when inventory equals monthly revenue', () => {
    expect(computeInventoryToRevenueRatio(50_000, 50_000)).toBeCloseTo(1)
  })

  it('returns 0.5 when inventory is half monthly revenue', () => {
    expect(computeInventoryToRevenueRatio(25_000, 50_000)).toBeCloseTo(0.5)
  })

  it('returns 3.0 for overstocked scenario', () => {
    expect(computeInventoryToRevenueRatio(300_000, 100_000)).toBeCloseTo(3.0)
  })

  it('returns fractional months correctly', () => {
    expect(computeInventoryToRevenueRatio(15_000, 100_000)).toBeCloseTo(0.15)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// classifyInventoryToRevenueRatio
// ══════════════════════════════════════════════════════════════════════════════

describe('classifyInventoryToRevenueRatio', () => {
  it('returns insufficient_data for null', () => {
    expect(classifyInventoryToRevenueRatio(null)).toBe('insufficient_data')
  })

  it('returns lean for < 0.5', () => {
    expect(classifyInventoryToRevenueRatio(0)).toBe('lean')
    expect(classifyInventoryToRevenueRatio(0.49)).toBe('lean')
  })

  it('returns normal for >= 0.5 and < 1.5', () => {
    expect(classifyInventoryToRevenueRatio(0.5)).toBe('normal')
    expect(classifyInventoryToRevenueRatio(1.0)).toBe('normal')
    expect(classifyInventoryToRevenueRatio(1.49)).toBe('normal')
  })

  it('returns heavy for >= 1.5 and < 3.0', () => {
    expect(classifyInventoryToRevenueRatio(1.5)).toBe('heavy')
    expect(classifyInventoryToRevenueRatio(2.99)).toBe('heavy')
  })

  it('returns overstocked for >= 3.0', () => {
    expect(classifyInventoryToRevenueRatio(3.0)).toBe('overstocked')
    expect(classifyInventoryToRevenueRatio(10)).toBe('overstocked')
  })

  it('boundary: 0.5 is normal not lean', () => {
    expect(classifyInventoryToRevenueRatio(0.5)).toBe('normal')
  })

  it('boundary: 1.5 is heavy not normal', () => {
    expect(classifyInventoryToRevenueRatio(1.5)).toBe('heavy')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeStockCoverageDays
// ══════════════════════════════════════════════════════════════════════════════

describe('computeStockCoverageDays', () => {
  it('returns null when avgDailySales is 0', () => {
    expect(computeStockCoverageDays(100, 0)).toBeNull()
  })

  it('returns null when avgDailySales is negative', () => {
    expect(computeStockCoverageDays(100, -1)).toBeNull()
  })

  it('computes correct coverage days', () => {
    expect(computeStockCoverageDays(90, 3)).toBeCloseTo(30)
  })

  it('caps at 365 days', () => {
    expect(computeStockCoverageDays(1000, 0.1)).toBe(365)
  })

  it('returns exactly 365 when calculation is exactly 365', () => {
    expect(computeStockCoverageDays(365, 1)).toBe(365)
  })

  it('returns value just below 365 for borderline case', () => {
    expect(computeStockCoverageDays(364.9, 1)).toBeCloseTo(364.9)
  })

  it('handles fractional daily sales', () => {
    expect(computeStockCoverageDays(15, 0.5)).toBeCloseTo(30)
  })

  it('returns 0 when qty is 0', () => {
    expect(computeStockCoverageDays(0, 5)).toBeCloseTo(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeReorderUrgency
// ══════════════════════════════════════════════════════════════════════════════

describe('computeReorderUrgency', () => {
  it('returns 100 for null coverage', () => {
    expect(computeReorderUrgency(null)).toBe(100)
  })

  it('returns 100 for 0 days coverage', () => {
    expect(computeReorderUrgency(0)).toBe(100)
  })

  it('returns 90 for exactly 7 days', () => {
    expect(computeReorderUrgency(7)).toBe(90)
  })

  it('returns 90 for 1 day coverage', () => {
    expect(computeReorderUrgency(1)).toBe(90)
  })

  it('returns 70 for exactly 14 days', () => {
    expect(computeReorderUrgency(14)).toBe(70)
  })

  it('returns 70 for 8 days', () => {
    expect(computeReorderUrgency(8)).toBe(70)
  })

  it('returns 50 for exactly 30 days', () => {
    expect(computeReorderUrgency(30)).toBe(50)
  })

  it('returns 50 for 15 days', () => {
    expect(computeReorderUrgency(15)).toBe(50)
  })

  it('returns 30 for exactly 60 days', () => {
    expect(computeReorderUrgency(60)).toBe(30)
  })

  it('returns 30 for 31 days', () => {
    expect(computeReorderUrgency(31)).toBe(30)
  })

  it('returns 15 for exactly 90 days', () => {
    expect(computeReorderUrgency(90)).toBe(15)
  })

  it('returns 15 for 61 days', () => {
    expect(computeReorderUrgency(61)).toBe(15)
  })

  it('returns 5 for 91 days', () => {
    expect(computeReorderUrgency(91)).toBe(5)
  })

  it('returns 5 for 365 days', () => {
    expect(computeReorderUrgency(365)).toBe(5)
  })

  it('returns 5 for any value > 90', () => {
    expect(computeReorderUrgency(200)).toBe(5)
    expect(computeReorderUrgency(100)).toBe(5)
  })

  it('boundary: 7 → 90, 8 → 70', () => {
    expect(computeReorderUrgency(7)).toBe(90)
    expect(computeReorderUrgency(8)).toBe(70)
  })

  it('boundary: 14 → 70, 15 → 50', () => {
    expect(computeReorderUrgency(14)).toBe(70)
    expect(computeReorderUrgency(15)).toBe(50)
  })

  it('boundary: 30 → 50, 31 → 30', () => {
    expect(computeReorderUrgency(30)).toBe(50)
    expect(computeReorderUrgency(31)).toBe(30)
  })

  it('boundary: 60 → 30, 61 → 15', () => {
    expect(computeReorderUrgency(60)).toBe(30)
    expect(computeReorderUrgency(61)).toBe(15)
  })

  it('boundary: 90 → 15, 91 → 5', () => {
    expect(computeReorderUrgency(90)).toBe(15)
    expect(computeReorderUrgency(91)).toBe(5)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeInventoryConcentration
// ══════════════════════════════════════════════════════════════════════════════

describe('computeInventoryConcentration', () => {
  it('returns null for empty array', () => {
    expect(computeInventoryConcentration([])).toBeNull()
  })

  it('returns null when total is 0', () => {
    const items = [{ stock_value_try: 0 }, { stock_value_try: 0 }]
    expect(computeInventoryConcentration(items)).toBeNull()
  })

  it('returns 100 when there is only 1 item', () => {
    const items = [{ stock_value_try: 5000 }]
    expect(computeInventoryConcentration(items)).toBeCloseTo(100)
  })

  it('top 5 default: correctly concentrates top 5', () => {
    const items = [
      { stock_value_try: 1000 },
      { stock_value_try: 900 },
      { stock_value_try: 800 },
      { stock_value_try: 700 },
      { stock_value_try: 600 },
      { stock_value_try: 100 },
      { stock_value_try: 50 },
    ]
    const total    = 4150
    const top5     = 1000 + 900 + 800 + 700 + 600
    const expected = (top5 / total) * 100
    expect(computeInventoryConcentration(items)).toBeCloseTo(expected)
  })

  it('custom topN = 3', () => {
    const items = [
      { stock_value_try: 300 },
      { stock_value_try: 200 },
      { stock_value_try: 100 },
      { stock_value_try: 50 },
      { stock_value_try: 50 },
    ]
    const total    = 700
    const top3     = 300 + 200 + 100
    const expected = (top3 / total) * 100
    expect(computeInventoryConcentration(items, 3)).toBeCloseTo(expected)
  })

  it('topN = 1 returns share of most valuable product', () => {
    const items = [
      { stock_value_try: 600 },
      { stock_value_try: 400 },
    ]
    expect(computeInventoryConcentration(items, 1)).toBeCloseTo(60)
  })

  it('all equal items: top 5 of 10 is 50%', () => {
    const items = Array.from({ length: 10 }, () => ({ stock_value_try: 100 }))
    expect(computeInventoryConcentration(items)).toBeCloseTo(50)
  })

  it('topN greater than array length returns 100', () => {
    const items = [{ stock_value_try: 500 }, { stock_value_try: 500 }]
    expect(computeInventoryConcentration(items, 10)).toBeCloseTo(100)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// generateInventoryNarrative
// ══════════════════════════════════════════════════════════════════════════════

describe('generateInventoryNarrative', () => {
  it('returns a non-empty string', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    6,
      diodays:          60.8,
      deadStockValue:   5000,
      slowMovingCount:  3,
      totalStockValue:  100_000,
    })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('includes turnover ratio in output', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    8.5,
      diodays:          43,
      deadStockValue:   0,
      slowMovingCount:  0,
      totalStockValue:  50_000,
    })
    expect(result).toContain('8.5')
  })

  it('handles null turnoverRatio gracefully', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    null,
      diodays:          null,
      deadStockValue:   0,
      slowMovingCount:  0,
      totalStockValue:  10_000,
    })
    expect(result).toBeTruthy()
    expect(result).toContain('hesaplanamadı')
  })

  it('includes slow-moving count when > 0', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    3,
      diodays:          121,
      deadStockValue:   12_000,
      slowMovingCount:  5,
      totalStockValue:  80_000,
    })
    expect(result).toContain('5')
  })

  it('mentions no slow stock when count is 0', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    12,
      diodays:          30,
      deadStockValue:   0,
      slowMovingCount:  0,
      totalStockValue:  200_000,
    })
    expect(result).toContain('tespit edilmedi')
  })

  it('contains Turkish text', () => {
    const result = generateInventoryNarrative({
      turnoverRatio:    4,
      diodays:          91,
      deadStockValue:   8000,
      slowMovingCount:  2,
      totalStockValue:  60_000,
    })
    expect(result).toMatch(/stok/i)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Edge / integration-style cross-function tests
// ══════════════════════════════════════════════════════════════════════════════

describe('cross-function edge cases', () => {
  it('full pipeline: zero inventory leads to null turnover and DIO', () => {
    const turnover = computeInventoryTurnover(50_000, 0)
    expect(turnover).toBeNull()
    const dio = computeDio(turnover)
    expect(dio).toBeNull()
    expect(classifyTurnoverHealth(turnover)).toBe('insufficient_data')
  })

  it('reorderUrgency is 100 when stockCoverage is null', () => {
    const coverage = computeStockCoverageDays(100, 0)
    expect(coverage).toBeNull()
    expect(computeReorderUrgency(coverage)).toBe(100)
  })

  it('a product sold daily has high coverage and low urgency', () => {
    const coverage = computeStockCoverageDays(200, 2) // 100 days
    expect(coverage).not.toBeNull()
    expect(coverage!).toBeCloseTo(100)
    expect(computeReorderUrgency(coverage)).toBe(5)
  })

  it('dead stock severity + dead stock value both agree', () => {
    const items = [
      { qty_in_stock: 10, stock_value_try: 2000, last_movement_date: daysAgoISO(200) },
    ]
    const deadVal = computeDeadStockValue(items)
    expect(deadVal).toBeCloseTo(2000)
    const severity = classifySlowMovingSeverity(200)
    expect(severity).toBe('dead_stock')
  })

  it('carrying cost scales linearly with inventory value', () => {
    const c1 = computeCarryingCostEstimate(100_000)
    const c2 = computeCarryingCostEstimate(200_000)
    expect(c2).toBeCloseTo(c1 * 2)
  })

  it('inventory-to-revenue classification aligns with ratio value', () => {
    expect(classifyInventoryToRevenueRatio(computeInventoryToRevenueRatio(40_000, 100_000))).toBe('lean')
    expect(classifyInventoryToRevenueRatio(computeInventoryToRevenueRatio(100_000, 100_000))).toBe('normal')
    expect(classifyInventoryToRevenueRatio(computeInventoryToRevenueRatio(200_000, 100_000))).toBe('heavy')
    expect(classifyInventoryToRevenueRatio(computeInventoryToRevenueRatio(400_000, 100_000))).toBe('overstocked')
  })
})
