/**
 * Tests for lib/services/ops/ops-pulse.service.ts
 * Run with: npx vitest run tests/ops-pulse-service.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeFillRate,
  classifyOpsPulse,
  buildPulseSummary,
  type OpsPulseMetrics,
} from '../lib/services/ops/ops-pulse.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<OpsPulseMetrics> = {}): OpsPulseMetrics {
  return {
    today_sales_count:    10,
    today_sales_try:      200_000,
    overdue_collections:  0,
    overdue_try:          0,
    critical_stock_items: 0,
    pending_purchases:    0,
    open_tasks:           0,
    fill_rate_pct:        100,
    ...overrides,
  }
}

// ── computeFillRate ───────────────────────────────────────────────────────────

describe('computeFillRate', () => {
  it('returns 0 when totalOrders is 0', () => {
    expect(computeFillRate(0, 0)).toBe(0)
  })

  it('returns 0 when fullyShipped is 0 but totalOrders > 0', () => {
    expect(computeFillRate(0, 10)).toBe(0)
  })

  it('returns 100 when all orders are shipped', () => {
    expect(computeFillRate(10, 10)).toBe(100)
  })

  it('returns 50 when half the orders are shipped', () => {
    expect(computeFillRate(5, 10)).toBe(50)
  })

  it('returns 80 for 4 of 5 shipped', () => {
    expect(computeFillRate(4, 5)).toBe(80)
  })

  it('returns proportional value for arbitrary inputs', () => {
    const result = computeFillRate(3, 7)
    expect(result).toBeCloseTo((3 / 7) * 100, 5)
  })

  it('handles single order fully shipped', () => {
    expect(computeFillRate(1, 1)).toBe(100)
  })

  it('handles large numbers correctly', () => {
    expect(computeFillRate(9500, 10000)).toBe(95)
  })

  it('handles fractional result near boundary (95%)', () => {
    const rate = computeFillRate(95, 100)
    expect(rate).toBe(95)
  })

  it('does not divide by zero when totalOrders is 0, regardless of fullyShipped', () => {
    expect(computeFillRate(5, 0)).toBe(0)
  })
})

// ── classifyOpsPulse ──────────────────────────────────────────────────────────

describe('classifyOpsPulse', () => {
  // ── GREEN cases ──

  it('returns green when everything is healthy', () => {
    expect(classifyOpsPulse(makeMetrics({ fill_rate_pct: 96 }))).toBe('green')
  })

  it('returns green with fill_rate exactly 96', () => {
    expect(classifyOpsPulse(makeMetrics({
      overdue_collections: 0,
      critical_stock_items: 0,
      fill_rate_pct: 96,
    }))).toBe('green')
  })

  it('does NOT return green when fill_rate is exactly 95 (not strictly > 95)', () => {
    const result = classifyOpsPulse(makeMetrics({
      overdue_collections: 0,
      critical_stock_items: 0,
      fill_rate_pct: 95,
    }))
    expect(result).not.toBe('green')
  })

  it('does NOT return green when overdue_collections > 0', () => {
    const result = classifyOpsPulse(makeMetrics({
      overdue_collections: 1,
      critical_stock_items: 0,
      fill_rate_pct: 99,
    }))
    expect(result).not.toBe('green')
  })

  it('does NOT return green when critical_stock_items > 0', () => {
    const result = classifyOpsPulse(makeMetrics({
      overdue_collections: 0,
      critical_stock_items: 1,
      fill_rate_pct: 99,
    }))
    expect(result).not.toBe('green')
  })

  // ── RED cases ──

  it('returns red when overdue_try > 500_000', () => {
    expect(classifyOpsPulse(makeMetrics({ overdue_try: 500_001 }))).toBe('red')
  })

  it('returns red when overdue_try is exactly 500_001', () => {
    expect(classifyOpsPulse(makeMetrics({ overdue_try: 500_001, fill_rate_pct: 90 }))).toBe('red')
  })

  it('does NOT return red when overdue_try is exactly 500_000 (boundary)', () => {
    const result = classifyOpsPulse(makeMetrics({
      overdue_try: 500_000,
      critical_stock_items: 0,
      fill_rate_pct: 85,
    }))
    expect(result).not.toBe('red')
  })

  it('returns red when critical_stock_items > 3', () => {
    expect(classifyOpsPulse(makeMetrics({ critical_stock_items: 4 }))).toBe('red')
  })

  it('does NOT return red when critical_stock_items is exactly 3 (boundary)', () => {
    const result = classifyOpsPulse(makeMetrics({
      critical_stock_items: 3,
      overdue_try: 0,
      fill_rate_pct: 85,
    }))
    expect(result).not.toBe('red')
  })

  it('returns red when fill_rate_pct < 80', () => {
    expect(classifyOpsPulse(makeMetrics({ fill_rate_pct: 79.9 }))).toBe('red')
  })

  it('does NOT return red when fill_rate is exactly 80 (boundary)', () => {
    const result = classifyOpsPulse(makeMetrics({
      fill_rate_pct: 80,
      overdue_try: 0,
      critical_stock_items: 0,
    }))
    expect(result).not.toBe('red')
  })

  // ── YELLOW cases ──

  it('returns yellow when some overdue but not red-level', () => {
    expect(classifyOpsPulse(makeMetrics({
      overdue_collections: 3,
      overdue_try: 100_000,
      fill_rate_pct: 85,
    }))).toBe('yellow')
  })

  it('returns yellow when fill_rate is 80 (boundary — red requires < 80)', () => {
    expect(classifyOpsPulse(makeMetrics({
      fill_rate_pct: 80,
      overdue_try: 0,
      critical_stock_items: 0,
    }))).toBe('yellow')
  })

  it('returns yellow when fill_rate is 95 (boundary — green requires > 95)', () => {
    expect(classifyOpsPulse(makeMetrics({
      fill_rate_pct: 95,
      overdue_collections: 0,
      critical_stock_items: 0,
    }))).toBe('yellow')
  })

  it('returns yellow with critical_stock_items = 3 and no other flags', () => {
    expect(classifyOpsPulse(makeMetrics({
      critical_stock_items: 3,
      overdue_try: 0,
      fill_rate_pct: 88,
    }))).toBe('yellow')
  })
})

// ── buildPulseSummary ─────────────────────────────────────────────────────────

describe('buildPulseSummary', () => {
  it('returns a non-empty string', () => {
    const summary = buildPulseSummary(makeMetrics())
    expect(summary.length).toBeGreaterThan(0)
  })

  it('includes today sales count', () => {
    const summary = buildPulseSummary(makeMetrics({ today_sales_count: 14 }))
    expect(summary).toContain('14')
  })

  it('includes TRY sales amount in compact form', () => {
    const summary = buildPulseSummary(makeMetrics({ today_sales_try: 523_000 }))
    expect(summary).toContain('₺523K')
  })

  it('includes critical stock count when > 0', () => {
    const summary = buildPulseSummary(makeMetrics({ critical_stock_items: 3 }))
    expect(summary).toContain('3 kritik stok')
  })

  it('does not mention critical stok when 0', () => {
    const summary = buildPulseSummary(makeMetrics({ critical_stock_items: 0 }))
    expect(summary).not.toContain('kritik stok')
  })

  it('includes overdue TRY amount when > 0', () => {
    const summary = buildPulseSummary(makeMetrics({
      overdue_collections: 5,
      overdue_try: 180_000,
    }))
    expect(summary).toContain('₺180K')
  })

  it('includes overdue collections count when > 0', () => {
    const summary = buildPulseSummary(makeMetrics({
      overdue_collections: 8,
      overdue_try: 100_000,
    }))
    expect(summary).toContain('8')
  })

  it('does not mention geciken when overdue_collections = 0', () => {
    const summary = buildPulseSummary(makeMetrics({ overdue_collections: 0, overdue_try: 0 }))
    expect(summary).not.toContain('geciken')
  })

  it('starts with Bugün', () => {
    const summary = buildPulseSummary(makeMetrics())
    expect(summary.startsWith('Bugün')).toBe(true)
  })

  it('includes fill rate when below 95', () => {
    const summary = buildPulseSummary(makeMetrics({ fill_rate_pct: 88.5 }))
    expect(summary).toContain('%88.5')
  })

  it('omits fill rate when >= 95', () => {
    const summary = buildPulseSummary(makeMetrics({ fill_rate_pct: 97 }))
    expect(summary).not.toContain('doluluk')
  })

  it('includes open tasks when > 0', () => {
    const summary = buildPulseSummary(makeMetrics({ open_tasks: 7 }))
    expect(summary).toContain('7 açık görev')
  })

  it('formats million TRY compactly', () => {
    const summary = buildPulseSummary(makeMetrics({ today_sales_try: 1_200_000 }))
    expect(summary).toContain('₺1.2M')
  })

  it('formats exact million TRY without decimal', () => {
    const summary = buildPulseSummary(makeMetrics({ today_sales_try: 2_000_000 }))
    expect(summary).toContain('₺2M')
  })

  it('uses middle dot separator between parts', () => {
    const summary = buildPulseSummary(makeMetrics({
      critical_stock_items: 1,
      overdue_collections: 1,
      overdue_try: 50_000,
    }))
    expect(summary).toContain(' · ')
  })

  it('returns Turkish text (contains Turkish characters or words)', () => {
    const summary = buildPulseSummary(makeMetrics())
    expect(summary).toMatch(/Bugün|satış|stok|görev|doluluk|geciken|sipariş/i)
  })

  it('handles zero sales gracefully', () => {
    const summary = buildPulseSummary(makeMetrics({
      today_sales_count: 0,
      today_sales_try: 0,
    }))
    expect(summary).toContain('0 satış')
  })
})
