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

})
