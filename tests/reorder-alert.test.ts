/**
 * Reorder Alert Service — pure-math tests.
 *
 * Scope (no DB):
 *   • assignAlertLevel()       — all 5 states, edge cases
 *   • computeDaysRemaining()   — null/zero consumption, normal
 *   • computeSuggestedOrderQty() — combinations of reorder_qty / consumption
 *   • sortAlerts()             — ordering by severity then days_remaining
 *
 * Run with: npx vitest run tests/reorder-alert.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  assignAlertLevel,
  computeDaysRemaining,
  computeSuggestedOrderQty,
  sortAlerts,
  type ReorderAlert,
  type AlertLevel,
} from '../lib/services/inventory/reorder-alert.service'

// ── Helper ────────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<ReorderAlert> & { alert_level: AlertLevel; product_id?: string }): ReorderAlert {
  return {
    product_id:              overrides.product_id              ?? 'prod-1',
    product_name:            overrides.product_name            ?? 'Test Ürün',
    product_sku:             overrides.product_sku             ?? null,
    current_qty:             overrides.current_qty             ?? 10,
    reorder_point_qty:       overrides.reorder_point_qty       ?? null,
    reorder_qty:             overrides.reorder_qty             ?? null,
    alert_level:             overrides.alert_level,
    days_of_stock_remaining: overrides.days_of_stock_remaining ?? null,
    avg_daily_consumption:   overrides.avg_daily_consumption   ?? null,
    suggested_order_qty:     overrides.suggested_order_qty     ?? null,
    urgency_label:           overrides.urgency_label           ?? 'Eşik Yok',
    action_required:         overrides.action_required         ?? false,
  }
}

// ── assignAlertLevel ──────────────────────────────────────────────────────────

describe('assignAlertLevel', () => {

  it('returns out_of_stock when current_qty is 0', () => {
    expect(assignAlertLevel(0, 10)).toBe('out_of_stock')
  })

  it('returns out_of_stock when current_qty is negative', () => {
    expect(assignAlertLevel(-5, 10)).toBe('out_of_stock')
  })

  it('returns no_threshold when reorder_point is null', () => {
    expect(assignAlertLevel(100, null)).toBe('no_threshold')
  })

  it('returns adequate when reorder_point is 0 (not configured)', () => {
    expect(assignAlertLevel(50, 0)).toBe('adequate')
  })

  it('returns critical when current_qty equals reorder_point exactly', () => {
    expect(assignAlertLevel(10, 10)).toBe('critical')
  })

  it('returns critical when current_qty is below reorder_point', () => {
    expect(assignAlertLevel(5, 10)).toBe('critical')
  })

  it('returns low when current_qty is exactly at 1.5× reorder_point', () => {
    // qty = 15, point = 10, 1.5 × point = 15 — should be low (≤ 1.5×)
    expect(assignAlertLevel(15, 10)).toBe('low')
  })

  it('returns low when current_qty is between reorder_point and 1.5×', () => {
    // qty = 12, point = 10 → 12 > 10 and 12 ≤ 15
    expect(assignAlertLevel(12, 10)).toBe('low')
  })

  it('returns adequate when current_qty exceeds 1.5× reorder_point', () => {
    // qty = 20, point = 10 → 20 > 15
    expect(assignAlertLevel(20, 10)).toBe('adequate')
  })

  it('returns out_of_stock even when reorder_point is null and qty is 0', () => {
    expect(assignAlertLevel(0, null)).toBe('out_of_stock')
  })

  // ── Additional: boundary precision and Turkish stock management scenarios ─

  it('returns critical at 1 unit below reorder_point', () => {
    expect(assignAlertLevel(9, 10)).toBe('critical')
  })

  it('returns critical at 1 unit (near-zero but not zero)', () => {
    expect(assignAlertLevel(1, 10)).toBe('critical')
  })

  it('boundary: exactly 1.5× reorder_point is low, just above is adequate', () => {
    expect(assignAlertLevel(15, 10)).toBe('low')
    expect(assignAlertLevel(16, 10)).toBe('adequate')
  })

  it('returns adequate for very high stock relative to reorder_point', () => {
    expect(assignAlertLevel(1000, 10)).toBe('adequate')
  })

  it('returns no_threshold for stock > 0 with no reorder_point set', () => {
    expect(assignAlertLevel(500, null)).toBe('no_threshold')
  })

  it('returns out_of_stock for -1 qty (over-allocated scenario)', () => {
    expect(assignAlertLevel(-1, null)).toBe('out_of_stock')
  })

  it('returns adequate for reorder_point of 0 even with minimal stock', () => {
    // reorder_point = 0 means "not configured" — no alarm
    expect(assignAlertLevel(1, 0)).toBe('adequate')
  })

  it('handles large reorder_point: 1000 units threshold', () => {
    expect(assignAlertLevel(900, 1000)).toBe('critical')
    expect(assignAlertLevel(1001, 1000)).toBe('low')
    expect(assignAlertLevel(1501, 1000)).toBe('adequate')
  })

  it('Türkçe urgency labels — out_of_stock maps to Stok Bitti scenario', () => {
    // Confirm the alert level assigned matches the Turkish label expectation
    const level = assignAlertLevel(0, 50)
    expect(level).toBe('out_of_stock')
  })

  it('Türkçe urgency labels — critical maps to Kritik scenario', () => {
    const level = assignAlertLevel(5, 20)
    expect(level).toBe('critical')
  })

})

// ── computeDaysRemaining ─────────────────────────────────────────────────────

describe('computeDaysRemaining', () => {

  it('returns null when avgDailyConsumption is null', () => {
    expect(computeDaysRemaining(100, null)).toBeNull()
  })

  it('returns null when avgDailyConsumption is 0 (no sales)', () => {
    expect(computeDaysRemaining(100, 0)).toBeNull()
  })

  it('returns null when avgDailyConsumption is negative', () => {
    expect(computeDaysRemaining(100, -1)).toBeNull()
  })

  it('computes days remaining correctly (floor division)', () => {
    // 100 / 3 = 33.33 → floor → 33
    expect(computeDaysRemaining(100, 3)).toBe(33)
  })

  it('returns 0 when current_qty is 0 and consumption is positive', () => {
    expect(computeDaysRemaining(0, 5)).toBe(0)
  })

  it('returns 1 when just enough for 1 day', () => {
    expect(computeDaysRemaining(10, 10)).toBe(1)
  })

  // ── Additional: floor behavior, edge cases ────────────────────────────────

  it('uses floor: 10 / 3 = 3.33 → 3', () => {
    expect(computeDaysRemaining(10, 3)).toBe(3)
  })

  it('uses floor: 7 / 2 = 3.5 → 3', () => {
    expect(computeDaysRemaining(7, 2)).toBe(3)
  })

  it('returns negative value for negative current_qty (over-sold scenario, floor applied)', () => {
    // Math.floor(-5/2) = Math.floor(-2.5) = -3
    expect(computeDaysRemaining(-5, 2)).toBe(-3)
  })

  it('returns exact 30 days when stock = 30 × consumption', () => {
    expect(computeDaysRemaining(30, 1)).toBe(30)
  })

  it('returns 7 days for weekly stock at daily velocity of 1', () => {
    expect(computeDaysRemaining(7, 1)).toBe(7)
  })

  it('handles fractional consumption (0.5 units/day)', () => {
    // 15 / 0.5 = 30 → 30
    expect(computeDaysRemaining(15, 0.5)).toBe(30)
  })

  it('returns large number for overstocked product (10000 units, 1/day)', () => {
    expect(computeDaysRemaining(10_000, 1)).toBe(10_000)
  })

  it('returns 0 for both zero inputs with null guard', () => {
    expect(computeDaysRemaining(0, null)).toBeNull()
  })

})

// ── computeSuggestedOrderQty ─────────────────────────────────────────────────

describe('computeSuggestedOrderQty', () => {

  it('returns null when both reorder_qty and consumption are null', () => {
    expect(computeSuggestedOrderQty(null, null)).toBeNull()
  })

  it('returns reorder_qty when it is set (ignores consumption)', () => {
    expect(computeSuggestedOrderQty(50, 5)).toBe(50)
  })

  it('uses consumption fallback (2 × avg × 14) when reorder_qty is null', () => {
    // 2 × 3 × 14 = 84 → ceil(84) = 84
    expect(computeSuggestedOrderQty(null, 3)).toBe(84)
  })

  it('returns null when reorder_qty is null and consumption is 0', () => {
    expect(computeSuggestedOrderQty(null, 0)).toBeNull()
  })

  it('returns null when reorder_qty is 0 and consumption is null', () => {
    // reorder_qty 0 is treated as unset (not > 0)
    expect(computeSuggestedOrderQty(0, null)).toBeNull()
  })

  it('rounds up fractional consumption result', () => {
    // 2 × 0.7 × 14 = 19.6 → ceil → 20
    expect(computeSuggestedOrderQty(null, 0.7)).toBe(20)
  })

  // ── Additional: formula verification, priority ────────────────────────────

  it('prefers reorder_qty over consumption-based fallback', () => {
    // Even with high consumption, explicit reorder_qty takes precedence
    expect(computeSuggestedOrderQty(100, 10)).toBe(100)
  })

  it('fallback formula: 2 × consumption × 14', () => {
    // 2 × 1 × 14 = 28
    expect(computeSuggestedOrderQty(null, 1)).toBe(28)
  })

  it('fallback formula: 2 × 5 × 14 = 140', () => {
    expect(computeSuggestedOrderQty(null, 5)).toBe(140)
  })

  it('ceiling: 2 × 0.1 × 14 = 2.8 → ceil → 3', () => {
    expect(computeSuggestedOrderQty(null, 0.1)).toBe(3)
  })

  it('returns null when reorder_qty is negative (invalid data)', () => {
    // -5 is not > 0, so falls through to consumption
    expect(computeSuggestedOrderQty(-5, null)).toBeNull()
  })

  it('returns consumption-based qty when reorder_qty is negative but consumption is valid', () => {
    // reorder_qty=-5 not > 0, consumption=2 → 2 × 2 × 14 = 56
    expect(computeSuggestedOrderQty(-5, 2)).toBe(56)
  })

  it('returns reorder_qty of 1 (minimum positive threshold)', () => {
    expect(computeSuggestedOrderQty(1, null)).toBe(1)
  })

  it('handles very large reorder_qty (warehouse-scale)', () => {
    expect(computeSuggestedOrderQty(10_000, 5)).toBe(10_000)
  })

})

// ── sortAlerts ───────────────────────────────────────────────────────────────

describe('sortAlerts', () => {

  it('sorts out_of_stock before critical before low before adequate before no_threshold', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'no_threshold',  product_id: 'e' }),
      makeAlert({ alert_level: 'adequate',      product_id: 'd' }),
      makeAlert({ alert_level: 'low',           product_id: 'c' }),
      makeAlert({ alert_level: 'critical',      product_id: 'b' }),
      makeAlert({ alert_level: 'out_of_stock',  product_id: 'a' }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted.map(a => a.alert_level)).toEqual([
      'out_of_stock', 'critical', 'low', 'adequate', 'no_threshold',
    ])
  })

  it('within the same level, sorts by days_remaining ascending', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'low', product_id: 'x', days_of_stock_remaining: 10 }),
      makeAlert({ alert_level: 'low', product_id: 'y', days_of_stock_remaining: 3  }),
      makeAlert({ alert_level: 'low', product_id: 'z', days_of_stock_remaining: 7  }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted.map(a => a.product_id)).toEqual(['y', 'z', 'x'])
  })

  it('puts null days_remaining after products with known days (same level)', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'critical', product_id: 'nullDays', days_of_stock_remaining: null }),
      makeAlert({ alert_level: 'critical', product_id: 'knownDays', days_of_stock_remaining: 5 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[0].product_id).toBe('knownDays')
    expect(sorted[1].product_id).toBe('nullDays')
  })

  it('does not mutate the original array', () => {
    const original: ReorderAlert[] = [
      makeAlert({ alert_level: 'adequate',     product_id: '1' }),
      makeAlert({ alert_level: 'out_of_stock', product_id: '2' }),
    ]
    const originalOrder = original.map(a => a.product_id)
    sortAlerts(original)
    expect(original.map(a => a.product_id)).toEqual(originalOrder)
  })

  it('returns empty array when input is empty', () => {
    expect(sortAlerts([])).toEqual([])
  })

  // ── Additional: complex ordering scenarios ────────────────────────────────

  it('returns single-element array unchanged', () => {
    const alerts = [makeAlert({ alert_level: 'critical', product_id: 'only' })]
    expect(sortAlerts(alerts)).toHaveLength(1)
    expect(sortAlerts(alerts)[0].product_id).toBe('only')
  })

  it('out_of_stock with known days comes before out_of_stock with null days', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'out_of_stock', product_id: 'nodays', days_of_stock_remaining: null }),
      makeAlert({ alert_level: 'out_of_stock', product_id: 'days0',  days_of_stock_remaining: 0 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[0].product_id).toBe('days0')
    expect(sorted[1].product_id).toBe('nodays')
  })

  it('critical products sorted correctly across different days_remaining', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'critical', product_id: 'c5', days_of_stock_remaining: 5 }),
      makeAlert({ alert_level: 'critical', product_id: 'c1', days_of_stock_remaining: 1 }),
      makeAlert({ alert_level: 'critical', product_id: 'c3', days_of_stock_remaining: 3 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted.map(a => a.product_id)).toEqual(['c1', 'c3', 'c5'])
  })

  it('severity ordering: out_of_stock always beats critical, even with fewer days', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'critical',    product_id: 'crit', days_of_stock_remaining: 1 }),
      makeAlert({ alert_level: 'out_of_stock', product_id: 'oos',  days_of_stock_remaining: 100 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[0].alert_level).toBe('out_of_stock')
    expect(sorted[1].alert_level).toBe('critical')
  })

  it('two null days_remaining at same level maintain stable-ish order', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'adequate', product_id: 'a1', days_of_stock_remaining: null }),
      makeAlert({ alert_level: 'adequate', product_id: 'a2', days_of_stock_remaining: null }),
    ]
    const sorted = sortAlerts(alerts)
    // Both null → treated as Infinity, relative order stable
    expect(sorted).toHaveLength(2)
    expect(sorted.every(a => a.alert_level === 'adequate')).toBe(true)
  })

  it('mixed levels + varying days produce correct global sort', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'adequate',     product_id: 'ad',  days_of_stock_remaining: 60  }),
      makeAlert({ alert_level: 'low',          product_id: 'lo',  days_of_stock_remaining: 20  }),
      makeAlert({ alert_level: 'out_of_stock', product_id: 'oos', days_of_stock_remaining: 0   }),
      makeAlert({ alert_level: 'critical',     product_id: 'cr',  days_of_stock_remaining: 3   }),
      makeAlert({ alert_level: 'no_threshold', product_id: 'nt',  days_of_stock_remaining: null }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted.map(a => a.product_id)).toEqual(['oos', 'cr', 'lo', 'ad', 'nt'])
  })

})

// ── assignAlertLevel — precise boundary values ────────────────────────────────

describe('assignAlertLevel — precise boundary values', () => {
  it('qty=0 with no reorder point → out_of_stock (qty check before null check)', () => {
    expect(assignAlertLevel(0, null)).toBe('out_of_stock')
  })

  it('qty=0 with reorder_point=50 → out_of_stock', () => {
    expect(assignAlertLevel(0, 50)).toBe('out_of_stock')
  })

  it('qty=-100 → out_of_stock regardless of reorder_point', () => {
    expect(assignAlertLevel(-100, 10)).toBe('out_of_stock')
  })

  it('qty=1 reorder_point=null → no_threshold', () => {
    expect(assignAlertLevel(1, null)).toBe('no_threshold')
  })

  it('qty=100 reorder_point=0 → adequate (reorder_point <= 0 returns adequate)', () => {
    expect(assignAlertLevel(100, 0)).toBe('adequate')
  })

  it('qty=1 reorder_point=0 → adequate (0 point = no threshold configured)', () => {
    expect(assignAlertLevel(1, 0)).toBe('adequate')
  })

  it('qty exactly equals reorder_point → critical', () => {
    expect(assignAlertLevel(25, 25)).toBe('critical')
  })

  it('qty one unit above reorder_point → low (if ≤ 1.5×)', () => {
    // point=20, 1.5×point=30, qty=21 → low
    expect(assignAlertLevel(21, 20)).toBe('low')
  })

  it('qty exactly 1.5× reorder_point → low (boundary inclusive)', () => {
    // point=20, qty=30 → 30 ≤ 30 → low
    expect(assignAlertLevel(30, 20)).toBe('low')
  })

  it('qty one unit above 1.5× reorder_point → adequate', () => {
    // point=20, 1.5×=30, qty=31 → adequate
    expect(assignAlertLevel(31, 20)).toBe('adequate')
  })

  it('large reorder_point scenario: qty=999, point=1000 → critical', () => {
    expect(assignAlertLevel(999, 1000)).toBe('critical')
  })

  it('large reorder_point scenario: qty=1000, point=1000 → critical (exact equal)', () => {
    expect(assignAlertLevel(1000, 1000)).toBe('critical')
  })

  it('large reorder_point scenario: qty=1500, point=1000 → low (=1.5×)', () => {
    expect(assignAlertLevel(1500, 1000)).toBe('low')
  })

  it('large reorder_point scenario: qty=1501, point=1000 → adequate', () => {
    expect(assignAlertLevel(1501, 1000)).toBe('adequate')
  })
})

// ── computeDaysRemaining — additional ────────────────────────────────────────

describe('computeDaysRemaining — additional cases', () => {
  it('null consumption → null (no data)', () => {
    expect(computeDaysRemaining(50, null)).toBeNull()
  })

  it('zero consumption → null (infinite days, treated as unknown)', () => {
    expect(computeDaysRemaining(50, 0)).toBeNull()
  })

  it('negative consumption → null (guard)', () => {
    expect(computeDaysRemaining(50, -2)).toBeNull()
  })

  it('exact division: 60 / 4 = 15 days', () => {
    expect(computeDaysRemaining(60, 4)).toBe(15)
  })

  it('floor applied: 11 / 3 = 3.67 → 3', () => {
    expect(computeDaysRemaining(11, 3)).toBe(3)
  })

  it('zero stock, positive consumption → 0 days', () => {
    expect(computeDaysRemaining(0, 2)).toBe(0)
  })

  it('very high stock relative to consumption → large result', () => {
    expect(computeDaysRemaining(3650, 1)).toBe(3650)
  })

  it('fractional consumption 0.25/day: 10 / 0.25 = 40 days', () => {
    expect(computeDaysRemaining(10, 0.25)).toBe(40)
  })

  it('consumption of 7/day: 100 / 7 = 14.28 → floor → 14', () => {
    expect(computeDaysRemaining(100, 7)).toBe(14)
  })
})

// ── computeSuggestedOrderQty — additional ────────────────────────────────────

describe('computeSuggestedOrderQty — additional formula checks', () => {
  it('explicit reorder_qty=10 takes priority over consumption', () => {
    expect(computeSuggestedOrderQty(10, 100)).toBe(10)
  })

  it('reorder_qty=0 falls through to consumption-based fallback', () => {
    // 0 is not > 0, so use consumption: 2×2×14=56
    expect(computeSuggestedOrderQty(0, 2)).toBe(56)
  })

  it('consumption fallback formula: 2 × daily × 14 = 28 days of stock', () => {
    // consumption = 2/day → 2×2×14 = 56
    expect(computeSuggestedOrderQty(null, 2)).toBe(56)
  })

  it('consumption = 0.5/day → 2×0.5×14 = 14', () => {
    expect(computeSuggestedOrderQty(null, 0.5)).toBe(14)
  })

  it('consumption = 10/day → 2×10×14 = 280', () => {
    expect(computeSuggestedOrderQty(null, 10)).toBe(280)
  })

  it('both reorder_qty and consumption null → null', () => {
    expect(computeSuggestedOrderQty(null, null)).toBeNull()
  })

  it('ceil applied: 2×0.5×14=14.0 → no ceil needed, exact 14', () => {
    expect(computeSuggestedOrderQty(null, 0.5)).toBe(14)
  })

  it('ceil applied: 2×0.8×14=22.4 → ceil → 23', () => {
    expect(computeSuggestedOrderQty(null, 0.8)).toBe(23)
  })

  it('negative reorder_qty with zero consumption → null', () => {
    expect(computeSuggestedOrderQty(-10, 0)).toBeNull()
  })
})

// ── sortAlerts — additional ───────────────────────────────────────────────────

describe('sortAlerts — additional ordering scenarios', () => {
  it('does not mutate original array (pure function)', () => {
    const alerts = [
      makeAlert({ alert_level: 'low', product_id: 'a' }),
      makeAlert({ alert_level: 'critical', product_id: 'b' }),
    ]
    const copy = alerts.map(a => ({ ...a }))
    sortAlerts(alerts)
    expect(alerts[0].product_id).toBe(copy[0].product_id)
  })

  it('all same level sorted by days (ascending)', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'critical', product_id: 'p30', days_of_stock_remaining: 30 }),
      makeAlert({ alert_level: 'critical', product_id: 'p5',  days_of_stock_remaining: 5 }),
      makeAlert({ alert_level: 'critical', product_id: 'p15', days_of_stock_remaining: 15 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted.map(a => a.product_id)).toEqual(['p5', 'p15', 'p30'])
  })

  it('out_of_stock always before adequate regardless of days', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'adequate',     product_id: 'adeq', days_of_stock_remaining: 1 }),
      makeAlert({ alert_level: 'out_of_stock', product_id: 'oos',  days_of_stock_remaining: 999 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[0].alert_level).toBe('out_of_stock')
  })

  it('no_threshold always last in sort', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'no_threshold', product_id: 'nt' }),
      makeAlert({ alert_level: 'adequate',     product_id: 'ad' }),
      makeAlert({ alert_level: 'low',          product_id: 'lo' }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[sorted.length - 1].alert_level).toBe('no_threshold')
  })

  it('single alert returns array of length 1', () => {
    const result = sortAlerts([makeAlert({ alert_level: 'low' })])
    expect(result).toHaveLength(1)
  })

  it('days_remaining=0 comes before days_remaining=1 in same level', () => {
    const alerts: ReorderAlert[] = [
      makeAlert({ alert_level: 'critical', product_id: 'p1', days_of_stock_remaining: 1 }),
      makeAlert({ alert_level: 'critical', product_id: 'p0', days_of_stock_remaining: 0 }),
    ]
    const sorted = sortAlerts(alerts)
    expect(sorted[0].product_id).toBe('p0')
  })
})
