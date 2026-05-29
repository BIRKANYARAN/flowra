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

// ── Additional computeRatioDirection tests ─────────────────────────────────

describe('computeRatioDirection – edge cases', () => {

  it('31. exactly 6 valid points with >5% improvement → improving', () => {
    // prior: [20,20,20] avg=20; recent: [25,25,25] avg=25 → relChange=25%
    const pts = [20, 20, 20, 25, 25, 25]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

  it('32. exactly 6 valid, lower-is-better, recent < prior → improving', () => {
    const pts = [50, 50, 50, 30, 30, 30]
    expect(computeRatioDirection(pts, false)).toBe('improving')
  })

  it('33. exactly 6 valid, lower-is-better, recent > prior → deteriorating', () => {
    const pts = [30, 30, 30, 50, 50, 50]
    expect(computeRatioDirection(pts, false)).toBe('deteriorating')
  })

  it('34. 7 valid points — uses last 6 valid', () => {
    // valid: [10,20,20,20,30,30,30]; n=7; recent3=valid[4..6]=[30,30,30]; prior3=valid[1..3]=[20,20,20]
    // relChange = (30-20)/20 = 50% → improving (higherIsBetter=true)
    const pts = [10, 20, 20, 20, 30, 30, 30]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

  it('35. all equal → stable (0% change)', () => {
    const pts = [50, 50, 50, 50, 50, 50]
    expect(computeRatioDirection(pts, true)).toBe('stable')
  })

  it('36. change of exactly 5.001% → directional', () => {
    // prior: [100,100,100] avg=100; recent: [105.01,105.01,105.01] → relChange>5%
    const pts = [100, 100, 100, 105.1, 105.1, 105.1]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

  it('37. negative values in array — valid if not null and finite', () => {
    // prior: [-30,-30,-30] avg=-30; recent: [-20,-20,-20] avg=-20
    // higherIsBetter=true → recent(-20) > prior(-30) → rel change = (-20--30)/30 = 10/30 = 33% → improving
    const pts = [-30, -30, -30, -20, -20, -20]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

  it('38. Infinity values filtered out as non-finite → insufficient if <3 valid', () => {
    const pts = [Infinity, 50, Infinity, Infinity, 60, Infinity]
    expect(computeRatioDirection(pts, true)).toBe('insufficient')
  })

  it('39. NaN filtered as non-finite → insufficient', () => {
    const pts = [NaN, 50, NaN, NaN, 60, NaN]
    expect(computeRatioDirection(pts, true)).toBe('insufficient')
  })

  it('40. 8 valid points — prior3 from end-6 to end-3', () => {
    // valid: [10,10,10,10,20,20,20,20] n=8
    // recent3 = valid[5..7]=[20,20,20]; prior3 = valid[2..4]=[10,10,10]
    // relChange = (20-10)/10 = 100% → improving
    const pts = [10, 10, 10, 10, 20, 20, 20, 20]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

})

// ── Additional computeAvg12m tests ────────────────────────────────────────

describe('computeAvg12m – extended', () => {

  it('41. rounds to 2 decimal places (3-way split)', () => {
    // (1 + 2 + 3) / 3 = 2.0 exactly
    expect(computeAvg12m([1, 2, 3])).toBe(2)
  })

  it('42. single valid among many nulls', () => {
    expect(computeAvg12m([null, null, 42, null, null])).toBe(42)
  })

  it('43. negative values averaged correctly', () => {
    expect(computeAvg12m([-10, -20, -30])).toBe(-20)
  })

  it('44. large array of 12 values', () => {
    const vals = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]
    // sum = 780, avg = 65
    expect(computeAvg12m(vals)).toBe(65)
  })

  it('45. mixed null and valid — only counts non-null', () => {
    // valid: [10, 30] avg = 20
    expect(computeAvg12m([null, 10, null, 30, null])).toBe(20)
  })

  it('46. round-trip: avg of one zero is zero', () => {
    expect(computeAvg12m([0])).toBe(0)
  })

  it('47. floating point values rounded to 2dp', () => {
    // (1.001 + 1.002 + 1.003) / 3 = 1.002
    expect(computeAvg12m([1.001, 1.002, 1.003])).toBe(1.0)
  })

})

// ── Additional formatRatioValue tests ─────────────────────────────────────

describe('formatRatioValue – extended', () => {

  it('48. negative % value shows correctly', () => {
    expect(formatRatioValue(-5.5, '%')).toBe('-5.5%')
  })

  it('49. negative x value shows correctly', () => {
    expect(formatRatioValue(-1.2, 'x')).toBe('-1.2x')
  })

  it('50. gün value rounds down correctly', () => {
    expect(formatRatioValue(12.2, 'gün')).toBe('12 gün')
  })

  it('51. gün value rounds to nearest integer', () => {
    expect(formatRatioValue(12.5, 'gün')).toBe('13 gün') // Math.round(12.5) = 13
  })

  it('52. unknown unit falls back to string of rounded value', () => {
    const result = formatRatioValue(3.567, 'unknown')
    expect(result).toBe('3.6')
  })

  it('53. large x value renders correctly', () => {
    expect(formatRatioValue(100, 'x')).toBe('100.0x')
  })

  it('54. Infinity → —', () => {
    expect(formatRatioValue(Infinity, '%')).toBe('—')
  })

  it('55. -Infinity → —', () => {
    expect(formatRatioValue(-Infinity, 'x')).toBe('—')
  })

})

// ── Additional buildRatioTrend tests ──────────────────────────────────────

describe('buildRatioTrend – extended', () => {

  const mk = ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
              '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

  it('56. all null values → current is null', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, null]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.current).toBeNull()
  })

  it('57. all null → avg_12m is null', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, null]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.avg_12m).toBeNull()
  })

  it('58. points array length equals monthKeys length', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.points).toHaveLength(mk.length)
  })

  it('59. point labels use Turkish short months', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    // First point: 2025-06 → 'Haz 25'
    expect(trend.points[0].label).toBe('Haz 25')
  })

  it('60. each point has month key matching input', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 10]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', 'x', true, mk, vals)
    expect(trend.points[0].month).toBe('2025-06')
    expect(trend.points[11].month).toBe('2026-05')
  })

  it('61. key_metric and label properties preserved', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 30]))
    const trend = buildRatioTrend('gross_margin_pct', 'Brüt Marj', 'Açıklama', '%', true, mk, vals)
    expect(trend.key).toBe('gross_margin_pct')
    expect(trend.label).toBe('Brüt Marj')
    expect(trend.description).toBe('Açıklama')
    expect(trend.unit).toBe('%')
  })

  it('62. avg_12m equals average of all values when all non-null', () => {
    // 12 months all = 50 → avg = 50
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.avg_12m).toBe(50)
  })

  it('63. missing month key → value is null in that point', () => {
    // Only supply 6 of 12 months in the map
    const vals = new Map<string, number | null>(mk.slice(0, 6).map(ym => [ym, 20]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    // Month 7+ should be null (missing from map)
    expect(trend.points[6].value).toBeNull()
    expect(trend.points[11].value).toBeNull()
  })

  it('64. direction is computed from all point values', () => {
    // First 9 months = 40, last 3 = 60; higher-is-better → improving
    const vals = new Map<string, number | null>(mk.map((ym, i) => [ym, i < 9 ? 40 : 60]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.direction).toBe('improving')
  })

  it('65. lower-is-better DSO deteriorating (DSO increasing)', () => {
    // First 9 = 20 (low DSO), last 3 = 45 (high DSO) → deteriorating for lower-is-better
    const vals = new Map<string, number | null>(mk.map((ym, i) => [ym, i < 9 ? 20 : 45]))
    const trend = buildRatioTrend('dso_days', 'DSO', 'desc', 'gün', false, mk, vals)
    expect(trend.direction).toBe('deteriorating')
  })

  it('66. current is most recent non-null even if last entry is null', () => {
    const vals = new Map<string, number | null>(mk.map((ym, i) => [ym, i === 11 ? null : i === 10 ? 99 : 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.current).toBe(99)
  })

  it('67. single non-null point → current equals that value, direction insufficient', () => {
    const vals = new Map<string, number | null>(mk.map((ym, i) => [ym, i === 6 ? 77 : null]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', '%', true, mk, vals)
    expect(trend.current).toBe(77)
    expect(trend.direction).toBe('insufficient')
  })

  it('68. Turkish January label: 2026-01 → "Oca 26"', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', 'x', true, mk, vals)
    const janPoint = trend.points.find(p => p.month === '2026-01')
    expect(janPoint?.label).toBe('Oca 26')
  })

  it('69. Turkish December label: 2025-12 → "Ara 25"', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', 'x', true, mk, vals)
    const decPoint = trend.points.find(p => p.month === '2025-12')
    expect(decPoint?.label).toBe('Ara 25')
  })

  it('70. Turkish May label: 2026-05 → "May 26"', () => {
    const vals = new Map<string, number | null>(mk.map(ym => [ym, 50]))
    const trend = buildRatioTrend('key', 'lbl', 'desc', 'x', true, mk, vals)
    const mayPoint = trend.points.find(p => p.month === '2026-05')
    expect(mayPoint?.label).toBe('May 26')
  })

})

// ── New: computeRatioDirection — monotonic and single-value tests ──────────────

describe('computeRatioDirection — monotonic and single-value edge cases', () => {

  it('monotonically increasing (6 pts, higher-is-better) → improving', () => {
    // prior avg = (10+20+30)/3 = 20; recent avg = (40+50+60)/3 = 50 → +150% → improving
    const pts = [10, 20, 30, 40, 50, 60]
    expect(computeRatioDirection(pts, true)).toBe('improving')
  })

  it('monotonically decreasing (6 pts, higher-is-better) → deteriorating', () => {
    const pts = [60, 50, 40, 30, 20, 10]
    expect(computeRatioDirection(pts, true)).toBe('deteriorating')
  })

  it('monotonically increasing (6 pts, lower-is-better DSO) → deteriorating', () => {
    // DSO going up is bad
    const pts = [10, 20, 30, 40, 50, 60]
    expect(computeRatioDirection(pts, false)).toBe('deteriorating')
  })

  it('monotonically decreasing (6 pts, lower-is-better DSO) → improving', () => {
    const pts = [60, 50, 40, 30, 20, 10]
    expect(computeRatioDirection(pts, false)).toBe('improving')
  })

  it('flat array (all same) → stable', () => {
    const pts = [25, 25, 25, 25, 25, 25]
    expect(computeRatioDirection(pts, true)).toBe('stable')
  })

  it('single value → insufficient', () => {
    expect(computeRatioDirection([99], true)).toBe('insufficient')
  })

  it('two valid values → insufficient', () => {
    expect(computeRatioDirection([10, 20], false)).toBe('insufficient')
  })

  it('three valid values → insufficient (no 6-point window)', () => {
    expect(computeRatioDirection([10, 20, 30], true)).toBe('insufficient')
  })

})

// ── New: computeAvg12m — fewer / exactly 12 values tests ─────────────────────

describe('computeAvg12m — fewer vs exactly 12 values', () => {

  it('fewer than 12 values (3 values) → averages correctly', () => {
    // Only 3 values provided
    expect(computeAvg12m([10, 20, 30])).toBe(20)
  })

  it('exactly 12 values → average of all 12', () => {
    // 1..12 avg = 6.5
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    expect(computeAvg12m(vals)).toBeCloseTo(6.5, 1)
  })

  it('fewer than 12 with some nulls → only non-null contribute', () => {
    // [10, null, 30] → avg = 20
    expect(computeAvg12m([10, null, 30])).toBe(20)
  })

  it('12 values all same → returns that value', () => {
    const vals = Array(12).fill(42) as number[]
    expect(computeAvg12m(vals)).toBe(42)
  })

  it('1 value → returns that value directly', () => {
    expect(computeAvg12m([77])).toBe(77)
  })

})

// ── New: buildRatioTrend — structure validation ───────────────────────────────

describe('buildRatioTrend — structure validation', () => {

  const mk12 = ['2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11',
               '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05']

  it('result has direction field', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 50]))
    const trend = buildRatioTrend('k', 'l', 'd', '%', true, mk12, vals)
    expect(trend).toHaveProperty('direction')
  })

  it('result has avg_12m field', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 30]))
    const trend = buildRatioTrend('k', 'l', 'd', '%', true, mk12, vals)
    expect(trend).toHaveProperty('avg_12m')
    expect(trend.avg_12m).not.toBeNull()
  })

  it('result has current field', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 40]))
    const trend = buildRatioTrend('k', 'l', 'd', '%', true, mk12, vals)
    expect(trend).toHaveProperty('current')
  })

  it('result has points array', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 10]))
    const trend = buildRatioTrend('k', 'l', 'd', 'x', true, mk12, vals)
    expect(Array.isArray(trend.points)).toBe(true)
    expect(trend.points.length).toBe(12)
  })

  it('result has direction_label field', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 50]))
    const trend = buildRatioTrend('k', 'l', 'd', '%', true, mk12, vals)
    expect(trend).toHaveProperty('direction_label')
    expect(typeof trend.direction_label).toBe('string')
  })

  it('avg_12m matches manual average when all values equal', () => {
    const vals = new Map<string, number | null>(mk12.map(ym => [ym, 60]))
    const trend = buildRatioTrend('k', 'l', 'd', '%', true, mk12, vals)
    expect(trend.avg_12m).toBe(60)
  })

  it('formatRatioValue % type appends % sign', () => {
    expect(formatRatioValue(25, '%')).toContain('%')
    expect(formatRatioValue(25, '%')).toBe('25.0%')
  })

  it('formatRatioValue x type appends x', () => {
    expect(formatRatioValue(1.5, 'x')).toContain('x')
    expect(formatRatioValue(1.5, 'x')).toBe('1.5x')
  })

  it('formatRatioValue gün type appends gün', () => {
    expect(formatRatioValue(30, 'gün')).toContain('gün')
    expect(formatRatioValue(30, 'gün')).toBe('30 gün')
  })

})
