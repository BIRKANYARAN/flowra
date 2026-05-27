/**
 * Financial Ratio Trends — unit tests
 *
 * Tests pure computation logic for financial ratio service helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeRatioDirection,
  computeAvg12m,
  buildRatioTrend,
  formatRatioValue,
} from '../lib/services/finance/financial-ratios.service'

// ── computeRatioDirection ─────────────────────────────────────────────────────

describe('computeRatioDirection', () => {

  // Test 1: insufficient when fewer than 3 valid points
  it('1. fewer than 3 valid points → insufficient', () => {
    expect(computeRatioDirection([50, null, null], true)).toBe('insufficient')
  })

  // Test 2: insufficient when exactly 2 valid points
  it('2. exactly 2 valid points → insufficient', () => {
    expect(computeRatioDirection([50, 60, null, null, null, null], true)).toBe('insufficient')
  })

  // Test 3: insufficient when fewer than 6 total valid (can't form both windows)
  it('3. only 5 valid points → insufficient (no prior 3-window)', () => {
    expect(computeRatioDirection([10, 20, 30, 40, 50], true)).toBe('insufficient')
  })

  // Test 4: improving — higher-is-better, recent avg > prior avg by >5%
  it('4. higher-is-better: recent avg significantly above prior → improving', () => {
    // prior: [30, 30, 30] avg=30; recent: [40, 40, 40] avg=40 → rel change = +33%
    const points = [30, 30, 30, 40, 40, 40]
    expect(computeRatioDirection(points, true)).toBe('improving')
  })

  // Test 5: deteriorating — higher-is-better, recent avg < prior avg by >5%
  it('5. higher-is-better: recent avg significantly below prior → deteriorating', () => {
    const points = [40, 40, 40, 30, 30, 30]
    expect(computeRatioDirection(points, true)).toBe('deteriorating')
  })

  // Test 6: improving — lower-is-better, recent avg < prior avg by >5%
  it('6. lower-is-better: recent avg significantly below prior → improving', () => {
    // dso: was 40 days, now 25 days — improving
    const points = [40, 40, 40, 25, 25, 25]
    expect(computeRatioDirection(points, false)).toBe('improving')
  })

  // Test 7: deteriorating — lower-is-better, recent avg > prior avg by >5%
  it('7. lower-is-better: recent avg significantly above prior → deteriorating', () => {
    const points = [25, 25, 25, 40, 40, 40]
    expect(computeRatioDirection(points, false)).toBe('deteriorating')
  })

  // Test 8: stable — change within ±5%
  it('8. change within 5% → stable', () => {
    // prior: 100, recent: 103 → rel change = 3% < 5%
    const points = [100, 100, 100, 103, 103, 103]
    expect(computeRatioDirection(points, true)).toBe('stable')
  })

  // Test 9: stable — exact 5% boundary → stable (not > 5%)
  it('9. exactly 5% change → stable (boundary)', () => {
    const points = [100, 100, 100, 105, 105, 105]
    expect(computeRatioDirection(points, true)).toBe('stable')
  })

  // Test 10: stable — prior avg is 0, can't compute relative change → stable
  it('10. prior avg is 0 → stable (no relative change possible)', () => {
    const points = [0, 0, 0, 10, 10, 10]
    expect(computeRatioDirection(points, true)).toBe('stable')
  })

  // Test 11: handles nulls in the array, uses only valid points
  it('11. array with nulls — only valid points counted, <6 valid → insufficient', () => {
    const points = [50, null, 50, null, null, 50]
    expect(computeRatioDirection(points, true)).toBe('insufficient')
  })

})

// ── computeAvg12m ─────────────────────────────────────────────────────────────

describe('computeAvg12m', () => {

  // Test 12: average of non-null values
  it('12. computes average of valid values', () => {
    expect(computeAvg12m([10, 20, 30])).toBe(20)
  })

  // Test 13: ignores null values
  it('13. ignores nulls in calculation', () => {
    expect(computeAvg12m([10, null, 30])).toBe(20)
  })

  // Test 14: all nulls → returns null
  it('14. all nulls → null', () => {
    expect(computeAvg12m([null, null, null])).toBeNull()
  })

  // Test 15: empty array → returns null
  it('15. empty array → null', () => {
    expect(computeAvg12m([])).toBeNull()
  })

  // Test 16: single value → returns that value
  it('16. single value returns that value', () => {
    expect(computeAvg12m([42])).toBe(42)
  })

  // Test 17: rounds to 2 decimal places
  it('17. rounds result to 2 decimal places', () => {
    expect(computeAvg12m([10, 20, 15])).toBe(15)
    expect(computeAvg12m([1, 2])).toBe(1.5)
  })

})

// ── formatRatioValue ─────────────────────────────────────────────────────────

describe('formatRatioValue', () => {

  // Test 18: 'x' unit → "2.3x"
  it('18. x unit formats as Nx', () => {
    expect(formatRatioValue(2.3, 'x')).toBe('2.3x')
  })

  // Test 19: '%' unit → "18.5%"
  it('19. % unit formats as N%', () => {
    expect(formatRatioValue(18.5, '%')).toBe('18.5%')
  })

  // Test 20: 'gün' unit → "24 gün"
  it('20. gün unit formats as "N gün" (rounded)', () => {
    expect(formatRatioValue(24.7, 'gün')).toBe('25 gün')
  })

  // Test 21: null value → "—"
  it('21. null value → —', () => {
    expect(formatRatioValue(null, '%')).toBe('—')
  })

  // Test 22: integer x value → "2.0x"
  it('22. integer x value shows one decimal', () => {
    expect(formatRatioValue(2, 'x')).toBe('2.0x')
  })

  // Test 23: zero % → "0.0%"
  it('23. zero pct value', () => {
    expect(formatRatioValue(0, '%')).toBe('0.0%')
  })

})

// ── buildRatioTrend ──────────────────────────────────────────────────────────

describe('buildRatioTrend', () => {
  const monthKeys = ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
                     '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

  // Test 24: direction_label is Turkish
  // prior 3-window = valid.slice(n-6, n-3) = indices 6,7,8 → months 7,8,9 (0-indexed)
  // recent 3-window = valid.slice(n-3) = indices 9,10,11 → months 10,11,12
  it('24. direction_label is correct Turkish for improving', () => {
    // set indices 6,7,8 to 30 and 9,10,11 to 45 → rel change = +50% > 5%
    const vals = new Map<string, number | null>(monthKeys.map((ym, i) => [ym, i < 6 ? 30 : i < 9 ? 30 : 45]))
    const trend = buildRatioTrend('gross_margin_pct', 'Brüt Marj', 'desc', '%', true, monthKeys, vals)
    expect(trend.direction).toBe('improving')
    expect(trend.direction_label).toBe('İyileşiyor')
  })

  // Test 25: benchmark is included when provided
  it('25. benchmark included when provided', () => {
    const vals = new Map<string, number | null>(monthKeys.map(ym => [ym, 50]))
    const trend = buildRatioTrend('gross_margin_pct', 'Brüt Marj', 'desc', '%', true, monthKeys, vals,
      { value: 40, label: 'Sağlıklı eşik' })
    expect(trend.benchmark).toBeDefined()
    expect(trend.benchmark?.value).toBe(40)
    expect(trend.benchmark?.label).toBe('Sağlıklı eşik')
  })

  // Test 26: benchmark absent when not provided
  it('26. benchmark absent when not provided', () => {
    const vals = new Map<string, number | null>(monthKeys.map(ym => [ym, 30]))
    const trend = buildRatioTrend('dpo_days', 'DPO', 'desc', 'gün', false, monthKeys, vals)
    expect(trend.benchmark).toBeUndefined()
  })

  // Test 27: direction_label is "Yetersiz Veri" for insufficient
  it('27. insufficient data → direction_label is Yetersiz Veri', () => {
    const vals = new Map<string, number | null>(monthKeys.map(ym => [ym, null]))
    const trend = buildRatioTrend('current_ratio', 'Cari Oran', 'desc', 'x', true, monthKeys, vals)
    expect(trend.direction).toBe('insufficient')
    expect(trend.direction_label).toBe('Yetersiz Veri')
  })

  // Test 28: current is the most recent non-null value
  it('28. current is most recent non-null value', () => {
    const vals = new Map<string, number | null>(monthKeys.map((ym, i) => [ym, i === 11 ? null : i * 5]))
    const trend = buildRatioTrend('net_margin_pct', 'Net Marj', 'desc', '%', true, monthKeys, vals)
    // index 10 (2026-04) = 10 * 5 = 50
    expect(trend.current).toBe(50)
  })

  // Test 29: deteriorating label is correct Turkish
  // prior 3 (indices 6-8) = 45, recent 3 (indices 9-11) = 20 → deteriorating for higher-is-better
  it('29. direction_label is Kötüleşiyor for deteriorating', () => {
    const vals = new Map<string, number | null>(monthKeys.map((ym, i) => [ym, i < 9 ? 45 : 20]))
    const trend = buildRatioTrend('gross_margin_pct', 'Brüt Marj', 'desc', '%', true, monthKeys, vals)
    expect(trend.direction).toBe('deteriorating')
    expect(trend.direction_label).toBe('Kötüleşiyor')
  })

  // Test 30: stable label is correct Turkish
  it('30. direction_label is Stabil for stable', () => {
    const vals = new Map<string, number | null>(monthKeys.map(ym => [ym, 42]))
    const trend = buildRatioTrend('expense_ratio_pct', 'Gider Oranı', 'desc', '%', false, monthKeys, vals)
    expect(trend.direction).toBe('stable')
    expect(trend.direction_label).toBe('Stabil')
  })

})
