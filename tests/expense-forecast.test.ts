/**
 * Expense Forecast — unit tests
 *
 * Tests pure computation logic of expense-forecast.service.ts helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeCategoryTrend,
  detectRecurring,
  buildCategoryForecast,
  buildSummaryLine,
  CATEGORY_LABELS,
} from '../lib/services/finance/expense-forecast.service'

// ── computeCategoryTrend ──────────────────────────────────────────────────────

describe('computeCategoryTrend', () => {

  // Test 1: growing when trend_pct > 5
  it('1. trendPct = 10 → growing', () => {
    expect(computeCategoryTrend(10)).toBe('growing')
  })

  // Test 2: growing at exact boundary +5.1
  it('2. trendPct = 5.1 → growing', () => {
    expect(computeCategoryTrend(5.1)).toBe('growing')
  })

  // Test 3: stable exactly at +5 (not growing)
  it('3. trendPct = 5 → stable', () => {
    expect(computeCategoryTrend(5)).toBe('stable')
  })

  // Test 4: stable at 0
  it('4. trendPct = 0 → stable', () => {
    expect(computeCategoryTrend(0)).toBe('stable')
  })

  // Test 5: stable at exactly -5
  it('5. trendPct = -5 → stable', () => {
    expect(computeCategoryTrend(-5)).toBe('stable')
  })

  // Test 6: declining at -5.1
  it('6. trendPct = -5.1 → declining', () => {
    expect(computeCategoryTrend(-5.1)).toBe('declining')
  })

  // Test 7: declining at -30
  it('7. trendPct = -30 → declining', () => {
    expect(computeCategoryTrend(-30)).toBe('declining')
  })

})

// ── detectRecurring ───────────────────────────────────────────────────────────

describe('detectRecurring', () => {

  const VENDOR = 'Acme Corp'

  // Test 8: true when ≥4 months present and very stable amounts (CV near 0)
  it('8. 6 months with same amount → recurring', () => {
    const amounts: (number | null)[] = [1000, 1000, 1000, 1000, 1000, 1000]
    expect(detectRecurring(amounts, VENDOR)).toBe(true)
  })

  // Test 9: true with exactly 4 months and very low variance
  it('9. 4 months present (2 null) with zero variance → recurring', () => {
    const amounts: (number | null)[] = [null, null, 500, 500, 500, 500]
    expect(detectRecurring(amounts, VENDOR)).toBe(true)
  })

  // Test 10: false when only 3 months present (below threshold)
  it('10. only 3 months present → not recurring', () => {
    const amounts: (number | null)[] = [null, null, null, 800, 800, 800]
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  // Test 11: false when all null
  it('11. all null → not recurring', () => {
    const amounts: (number | null)[] = [null, null, null, null, null, null]
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  // Test 12: false when 4+ months present but high variance (CV ≥ 10%)
  it('12. 6 months present but high variance → not recurring', () => {
    // CV: mean ~1000, values span 100-1900 → high stddev
    const amounts: (number | null)[] = [100, 1900, 100, 1900, 100, 1900]
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  // Test 13: true with exactly 10% variance (boundary — just under threshold)
  it('13. 4 months with CV ~9% → recurring', () => {
    // mean = 1000, values ±9% range → CV < 10%
    const amounts: (number | null)[] = [null, null, 1000, 1040, 960, 1000]
    const result = detectRecurring(amounts, VENDOR)
    // CV is low (within 10%), should be recurring
    expect(result).toBe(true)
  })

})

// ── buildCategoryForecast ─────────────────────────────────────────────────────

describe('buildCategoryForecast', () => {

  // Test 14: basic forecast with damping applied
  it('14. stable trend → forecast ≈ last_3m_avg', () => {
    // 6 months all 1000 → trend_pct=0, forecast=1000
    const totals = [1000, 1000, 1000, 1000, 1000, 1000]
    const result = buildCategoryForecast('salary', totals, 1000, 0)
    expect(result.forecast_next_month).toBe(1000)
    expect(result.trend).toBe('stable')
    expect(result.trend_pct).toBe(0)
  })

  // Test 15: growing trend applies 30% damping
  it('15. 20% growing trend → forecast = last_3m_avg × (1 + 20×0.3/100)', () => {
    // prior3: 1000 each → avg=1000; last3: 1200 each → avg=1200
    // trend_pct = (1200-1000)/1000 × 100 = 20
    // forecast = 1200 × (1 + 20×0.3/100) = 1200 × 1.06 = 1272
    const totals = [1000, 1000, 1000, 1200, 1200, 1200]
    const result = buildCategoryForecast('marketing', totals, 1100, 0)
    expect(result.trend).toBe('growing')
    expect(result.trend_pct).toBe(20)
    expect(result.forecast_next_month).toBe(1272)
    expect(result.last_3m_avg).toBe(1200)
  })

  // Test 16: anomaly_flag when forecast > 30% above 6m avg
  it('16. forecast much higher than 6m avg → anomaly_flag = true', () => {
    // last 3 months spike: 2000, prior 3: 100 → large trend
    const totals = [100, 100, 100, 2000, 2000, 2000]
    const avg6m = (100 * 3 + 2000 * 3) / 6  // 1050
    const result = buildCategoryForecast('general', totals, avg6m, 0)
    expect(result.anomaly_flag).toBe(true)
  })

  // Test 17: no anomaly when forecast within 30% of 6m avg
  it('17. stable expense → anomaly_flag = false', () => {
    const totals = [1000, 1000, 1000, 1000, 1000, 1000]
    const result = buildCategoryForecast('rent', totals, 1000, 0)
    expect(result.anomaly_flag).toBe(false)
  })

  // Test 18: single month data (all zeros except last) — edge case
  it('18. only last month has data → prior3Avg=0, trendPct=0', () => {
    const totals = [0, 0, 0, 0, 0, 5000]
    const result = buildCategoryForecast('software', totals, 0, 0)
    expect(result.trend_pct).toBe(0)
    expect(result.forecast_next_month).toBeGreaterThanOrEqual(0)
  })

  // Test 19: variable_amount = forecast - recurring (clamped to 0)
  it('19. recurring_amount subtracted from forecast to give variable', () => {
    const totals = [1000, 1000, 1000, 1000, 1000, 1000]
    const result = buildCategoryForecast('utilities', totals, 1000, 700)
    expect(result.recurring_amount).toBe(700)
    expect(result.variable_amount).toBe(300)
  })

  // Test 20: high confidence for very stable data (CV < 15%)
  it('20. perfectly stable data → confidence = high', () => {
    const totals = [1000, 1000, 1000, 1000, 1000, 1000]
    const result = buildCategoryForecast('rent', totals, 1000, 0)
    expect(result.confidence).toBe('high')
  })

  // Test 21: low confidence for highly volatile data (CV ≥ 35%)
  it('21. highly volatile data → confidence = low', () => {
    const totals = [100, 5000, 100, 5000, 100, 5000]
    const avg = (100 * 3 + 5000 * 3) / 6
    const result = buildCategoryForecast('general', totals, avg, 0)
    expect(result.confidence).toBe('low')
  })

  // Test 22: declining trend
  it('22. declining trend → forecast < last_3m_avg', () => {
    // prior3: 2000 each, last3: 1500 each → trendPct = -25
    // forecast = 1500 × (1 + (-25 × 0.3/100)) = 1500 × (1 - 0.075) = 1387.5
    const totals = [2000, 2000, 2000, 1500, 1500, 1500]
    const result = buildCategoryForecast('logistics', totals, 1750, 0)
    expect(result.trend).toBe('declining')
    expect(result.forecast_next_month).toBeLessThan(1500)
  })

})

// ── buildSummaryLine ──────────────────────────────────────────────────────────

describe('buildSummaryLine', () => {

  // Test 23: returns a non-empty string containing the month label
  it('23. returns non-empty string with month label', () => {
    const line = buildSummaryLine('Haziran 2026', 500_000, 450_000)
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
    expect(line).toContain('Haziran 2026')
  })

  // Test 24: contains the formatted amount
  it('24. contains ₺ symbol', () => {
    const line = buildSummaryLine('Temmuz 2026', 200_000, 180_000)
    expect(line).toContain('₺')
  })

  // Test 25: when prior avg is 0, fallback message works
  it('25. zero prior avg → returns a valid string without division error', () => {
    const line = buildSummaryLine('Ocak 2027', 100_000, 0)
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
  })

})

// ── CATEGORY_LABELS ───────────────────────────────────────────────────────────

describe('CATEGORY_LABELS', () => {

  it('26. has key: salary', () => {
    expect(CATEGORY_LABELS.salary).toBeDefined()
    expect(typeof CATEGORY_LABELS.salary).toBe('string')
  })

  it('27. has key: rent', () => {
    expect(CATEGORY_LABELS.rent).toBeDefined()
  })

  it('28. has key: software', () => {
    expect(CATEGORY_LABELS.software).toBeDefined()
  })

  it('29. has key: tax', () => {
    expect(CATEGORY_LABELS.tax).toBeDefined()
  })

  it('30. has key: marketing', () => {
    expect(CATEGORY_LABELS.marketing).toBeDefined()
  })

  it('31. has key: logistics', () => {
    expect(CATEGORY_LABELS.logistics).toBeDefined()
  })

  it('32. has key: utilities', () => {
    expect(CATEGORY_LABELS.utilities).toBeDefined()
  })

  it('33. has key: general', () => {
    expect(CATEGORY_LABELS.general).toBeDefined()
  })

  it('34. has key: operational', () => {
    expect(CATEGORY_LABELS.operational).toBeDefined()
  })

  it('35. salary label is Turkish string', () => {
    expect(CATEGORY_LABELS.salary).toBe('Maaşlar')
  })

  it('36. unknown key returns undefined', () => {
    expect((CATEGORY_LABELS as Record<string, string>)['nonexistent']).toBeUndefined()
  })

})

// ── computeCategoryTrend — boundary tests ─────────────────────────────────────

describe('computeCategoryTrend boundaries', () => {

  it('37. trendPct = 0.001 → stable (not growing)', () => {
    expect(computeCategoryTrend(0.001)).toBe('stable')
  })

  it('38. trendPct = 100 → growing', () => {
    expect(computeCategoryTrend(100)).toBe('growing')
  })

  it('39. trendPct = -100 → declining', () => {
    expect(computeCategoryTrend(-100)).toBe('declining')
  })

  it('40. trendPct = 4.999 → stable', () => {
    expect(computeCategoryTrend(4.999)).toBe('stable')
  })

  it('41. trendPct = -4.999 → stable', () => {
    expect(computeCategoryTrend(-4.999)).toBe('stable')
  })

  it('42. trendPct = 5.001 → growing', () => {
    expect(computeCategoryTrend(5.001)).toBe('growing')
  })

  it('43. trendPct = -5.001 → declining', () => {
    expect(computeCategoryTrend(-5.001)).toBe('declining')
  })

})

// ── detectRecurring — more cases ──────────────────────────────────────────────

describe('detectRecurring additional', () => {

  const VENDOR = 'Recurring Vendor'

  it('44. exactly 4 months present with moderate but low CV → recurring', () => {
    // 4 months: 990, 1000, 1010, 1000 → mean=1000, CV very low
    const amounts: (number | null)[] = [990, 1000, 1010, 1000, null, null]
    expect(detectRecurring(amounts, VENDOR)).toBe(true)
  })

  it('45. 5 months present but CV just above 10% → not recurring', () => {
    // values with high spread; mean=1000, strong variance
    const amounts: (number | null)[] = [500, 800, 1000, 1200, 1500, null]
    // CV: mean=1000, stddev~378 → CV~37.8% > 10% → not recurring
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  it('46. all zeros are not recurring (filter out 0)', () => {
    // 0 values are filtered out (v > 0 check)
    const amounts: (number | null)[] = [0, 0, 0, 0, 0, 0]
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  it('47. mixed null and zero still counts nulls correctly', () => {
    // Only 2 truly positive: not enough
    const amounts: (number | null)[] = [null, 0, null, 1000, null, 1000]
    expect(detectRecurring(amounts, VENDOR)).toBe(false)
  })

  it('48. vendor name unused — different names same pattern still recurring', () => {
    const amounts: (number | null)[] = [500, 500, 500, 500, 500, 500]
    expect(detectRecurring(amounts, 'Any Vendor')).toBe(true)
  })

})

// ── buildCategoryForecast — more edge cases ───────────────────────────────────

describe('buildCategoryForecast additional', () => {

  it('49. category_label set from CATEGORY_LABELS', () => {
    const result = buildCategoryForecast('salary', [1000, 1000, 1000, 1000, 1000, 1000], 1000, 0)
    expect(result.category_label).toBe('Maaşlar')
  })

  it('50. unknown category uses the category key as label', () => {
    const result = buildCategoryForecast('custom_cat', [100, 100, 100, 100, 100, 100], 100, 0)
    expect(result.category_label).toBe('custom_cat')
  })

  it('51. variable_amount clamped to 0 when recurring > forecast', () => {
    const totals = [1000, 1000, 1000, 1000, 1000, 1000]
    const result = buildCategoryForecast('utilities', totals, 1000, 2000)  // recurring > forecast
    expect(result.variable_amount).toBe(0)
  })

  it('52. prior3Avg > 0, last3Avg > prior3Avg → positive trendPct', () => {
    const totals = [500, 500, 500, 1000, 1000, 1000]
    const result = buildCategoryForecast('marketing', totals, 750, 0)
    // trendPct = (1000-500)/500 * 100 = 100
    expect(result.trend_pct).toBeCloseTo(100)
    expect(result.trend).toBe('growing')
  })

  it('53. prior3Avg > 0, last3Avg < prior3Avg → negative trendPct', () => {
    const totals = [1000, 1000, 1000, 500, 500, 500]
    const result = buildCategoryForecast('general', totals, 750, 0)
    // trendPct = (500-1000)/1000 * 100 = -50
    expect(result.trend_pct).toBeCloseTo(-50)
    expect(result.trend).toBe('declining')
  })

  it('54. medium confidence when CV 15-35%', () => {
    // moderately volatile: 700, 1000, 700, 1000, 700, 1000 → CV ~18%
    const totals = [700, 1000, 700, 1000, 700, 1000]
    const avg6m = (700 * 3 + 1000 * 3) / 6
    const result = buildCategoryForecast('logistics', totals, avg6m, 0)
    expect(result.confidence).toBe('medium')
  })

  it('55. forecast = last3avg when trend_pct = 0', () => {
    const totals = [100, 100, 100, 200, 200, 200]
    // prior=100, last=200, trendPct=(200-100)/100*100=100? No wait, that's 100%
    // We want 0 trend: all same
    const flatTotals = [200, 200, 200, 200, 200, 200]
    const result = buildCategoryForecast('rent', flatTotals, 200, 0)
    expect(result.forecast_next_month).toBe(200)
  })

  it('56. six element totals where only last 6 are used even if more passed', () => {
    // passing 8 elements — slice(0,6) takes first 6
    const totals = [100, 200, 300, 400, 500, 600, 700, 800]
    const result = buildCategoryForecast('salary', totals, 350, 0)
    // last3 = [4,5,6] = 400,500,600 → last3Avg=500; prior3=[1,2,3]=100,200,300→200
    expect(result.last_3m_avg).toBe(500)
  })

  it('57. anomaly_flag false when avg6m = 0', () => {
    const totals = [0, 0, 0, 0, 0, 0]
    const result = buildCategoryForecast('salary', totals, 0, 0)
    expect(result.anomaly_flag).toBe(false)
  })

  it('58. recurring_amount stored correctly', () => {
    const totals = [2000, 2000, 2000, 2000, 2000, 2000]
    const result = buildCategoryForecast('utilities', totals, 2000, 1500)
    expect(result.recurring_amount).toBe(1500)
  })

  it('59. variable_amount = forecast - recurring when forecast > recurring', () => {
    const totals = [2000, 2000, 2000, 2000, 2000, 2000]
    const result = buildCategoryForecast('utilities', totals, 2000, 800)
    // forecast=2000, recurring=800 → variable=1200
    expect(result.variable_amount).toBeCloseTo(1200, 1)
  })

  it('60. totals shorter than 6 — padded with zeros at start', () => {
    const totals = [1000, 1000, 1000]  // 3 elements → padded to [0,0,0,1000,1000,1000]
    const result = buildCategoryForecast('marketing', totals, 500, 0)
    // prior3 = [0,0,0] → avg=0; last3 = [1000,1000,1000] → avg=1000
    // trendPct = 0 (prior3Avg=0 → trendPct=0)
    expect(result.last_3m_avg).toBe(1000)
    expect(result.trend_pct).toBe(0)
  })

})

// ── buildSummaryLine — additional ─────────────────────────────────────────────

describe('buildSummaryLine additional', () => {

  it('61. amount in millions formatted with M suffix', () => {
    const line = buildSummaryLine('Temmuz 2026', 2_500_000, 2_000_000)
    expect(line).toContain('M')
  })

  it('62. amount in thousands formatted with K suffix', () => {
    const line = buildSummaryLine('Ağustos 2026', 150_000, 140_000)
    expect(line).toContain('K')
  })

  it('63. small amount (< 1000) formatted with no K/M suffix', () => {
    const line = buildSummaryLine('Ocak 2027', 500, 400)
    // 500 < 1000 → format as ₺500
    expect(line).toContain('₺500')
  })

  it('64. forecast below avg produces "düşük" direction', () => {
    const line = buildSummaryLine('Haziran 2026', 90_000, 100_000)
    expect(line).toContain('düşük')
  })

  it('65. forecast above avg produces "yüksek" direction', () => {
    const line = buildSummaryLine('Haziran 2026', 110_000, 100_000)
    expect(line).toContain('yüksek')
  })

  it('66. zero forecast with non-zero avg works without NaN', () => {
    const line = buildSummaryLine('Ocak 2027', 0, 100_000)
    expect(line).not.toContain('NaN')
    expect(typeof line).toBe('string')
  })

  it('67. both zero → no crash, returns valid string', () => {
    const line = buildSummaryLine('Ocak 2027', 0, 0)
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
  })

  it('68. exact amounts — 3m avg equals forecast produces 0% diff', () => {
    const line = buildSummaryLine('Şubat 2027', 100_000, 100_000)
    // diff = 0, direction = 'düşük' (diff <= 0 → düşük), 0% düşük
    expect(line).toContain('%0')
  })

  it('69. returns string containing "için"', () => {
    const line = buildSummaryLine('Mart 2027', 500_000, 450_000)
    expect(line).toContain('için')
  })

  it('70. returns string containing "gider"', () => {
    const line = buildSummaryLine('Nisan 2027', 300_000, 280_000)
    expect(line).toContain('gider')
  })

  it('71. positive and negative percent computed correctly with known values', () => {
    // forecast=110k, avg=100k → diff=10% yüksek
    const line = buildSummaryLine('Mayıs 2027', 110_000, 100_000)
    expect(line).toContain('10')
    expect(line).toContain('yüksek')
  })

  it('72. 1_999_999 is below 2M threshold → K format', () => {
    const line = buildSummaryLine('Haziran 2027', 999_999, 900_000)
    // 999_999 >= 1000 → K format
    expect(line).toContain('K')
  })

  it('73. exactly 1_000_000 → M format', () => {
    const line = buildSummaryLine('Temmuz 2027', 1_000_000, 900_000)
    expect(line).toContain('M')
  })

  it('74. fractional thousands rounded correctly', () => {
    const line = buildSummaryLine('Ağustos 2027', 1_500, 1_000)
    // ₺1500 → rounds to ₺2K
    expect(line).toContain('₺')
  })

})

// ── detectRecurring — exact CV boundary ───────────────────────────────────────

describe('detectRecurring boundary', () => {

  it('75. exactly 4 identical values present → CV=0 < 10% → recurring', () => {
    const amounts: (number | null)[] = [null, null, 1000, 1000, 1000, 1000]
    expect(detectRecurring(amounts, 'V')).toBe(true)
  })

  it('76. 4 values with CV just above 10% → not recurring', () => {
    // mean=100, need stddev > 10 → 77, 100, 100, 123 → mean=100, var~277 → stddev~16.6 → CV~16.6%
    const amounts: (number | null)[] = [null, null, 77, 100, 100, 123]
    expect(detectRecurring(amounts, 'V')).toBe(false)
  })

})

// ── buildCategoryForecast — confidence CV boundaries ─────────────────────────

describe('buildCategoryForecast confidence CV', () => {

  it('77. CV just below 15% → high confidence', () => {
    // 6 months of slightly varying values around 1000 with ~14% CV
    // mean=1000, stddev=140 → CV=14%
    const totals = [860, 920, 980, 1020, 1080, 1140]
    const result = buildCategoryForecast('rent', totals, 1000, 0)
    expect(result.confidence).toBe('high')
  })

  it('78. CV just above 35% → low confidence', () => {
    // mean=500, stddev>175 → CV>35%
    // [100, 200, 300, 600, 700, 1000] → mean=483, large spread
    const totals = [100, 200, 300, 600, 700, 1000]
    const avg6m = totals.reduce((s, v) => s + v, 0) / 6
    const result = buildCategoryForecast('general', totals, avg6m, 0)
    expect(result.confidence).toBe('low')
  })

  it('79. forecast correct for strong declining trend', () => {
    // prior3=[2000,2000,2000] avg=2000; last3=[1000,1000,1000] avg=1000
    // trendPct=-50; forecast=1000*(1+(-50*0.3/100))=1000*(1-0.15)=850
    const totals = [2000, 2000, 2000, 1000, 1000, 1000]
    const result = buildCategoryForecast('logistics', totals, 1500, 0)
    expect(result.forecast_next_month).toBe(850)
  })

  it('80. category key is stored in result', () => {
    const result = buildCategoryForecast('marketing', [500, 500, 500, 500, 500, 500], 500, 0)
    expect(result.category).toBe('marketing')
  })

})

// ── CATEGORY_LABELS — additional keys ────────────────────────────────────────

describe('CATEGORY_LABELS — additional keys', () => {

  it('81. rent label is Turkish', () => {
    expect(CATEGORY_LABELS.rent).toBe('Kira')
  })

  it('82. software label is Turkish', () => {
    expect(CATEGORY_LABELS.software).toBe('Yazılım & Abonelik')
  })

  it('83. marketing label is Turkish', () => {
    expect(CATEGORY_LABELS.marketing).toBe('Pazarlama')
  })

  it('84. logistics label is Turkish', () => {
    expect(CATEGORY_LABELS.logistics).toBe('Lojistik')
  })

  it('85. utilities label is Turkish', () => {
    expect(CATEGORY_LABELS.utilities).toBe('Faturalar')
  })

  it('86. operational label is Turkish', () => {
    expect(CATEGORY_LABELS.operational).toBe('Operasyonel')
  })

  it('87. general label is Turkish', () => {
    expect(CATEGORY_LABELS.general).toBe('Genel Gider')
  })

  it('88. tax label is Turkish', () => {
    expect(CATEGORY_LABELS.tax).toBe('Vergi')
  })

  it('89. partner_loan_interest label is Turkish', () => {
    expect(CATEGORY_LABELS.partner_loan_interest).toBe('Ortak Faizi')
  })

  it('90. has exactly 10 entries', () => {
    expect(Object.keys(CATEGORY_LABELS).length).toBe(10)
  })

  it('91. all values are non-empty strings', () => {
    for (const [, label] of Object.entries(CATEGORY_LABELS)) {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    }
  })

})

// ── computeCategoryTrend — all 3 levels at exact thresholds ─────────────────

describe('computeCategoryTrend — exact threshold tests', () => {

  it('92. 5.0 → stable (not > 5)', () => {
    expect(computeCategoryTrend(5.0)).toBe('stable')
  })

  it('93. 5.0000001 → growing', () => {
    expect(computeCategoryTrend(5.0000001)).toBe('growing')
  })

  it('94. -5.0 → stable (not < -5)', () => {
    expect(computeCategoryTrend(-5.0)).toBe('stable')
  })

  it('95. -5.0000001 → declining', () => {
    expect(computeCategoryTrend(-5.0000001)).toBe('declining')
  })

  it('96. very large positive → growing', () => {
    expect(computeCategoryTrend(9999)).toBe('growing')
  })

  it('97. very large negative → declining', () => {
    expect(computeCategoryTrend(-9999)).toBe('declining')
  })

})

// ── detectRecurring — consistent monthly amounts → true ─────────────────────

describe('detectRecurring — consistent amounts', () => {

  it('98. 6 months all 750 → CV=0 → recurring', () => {
    const amounts: (number | null)[] = [750, 750, 750, 750, 750, 750]
    expect(detectRecurring(amounts, 'Vendor')).toBe(true)
  })

  it('99. 4 months with tiny variation (~1%) → CV < 10% → recurring', () => {
    const amounts: (number | null)[] = [null, null, 1000, 1005, 995, 1000]
    expect(detectRecurring(amounts, 'Vendor')).toBe(true)
  })

  it('100. 3 months present (threshold is 4) → not recurring', () => {
    const amounts: (number | null)[] = [null, null, null, 500, 500, 500]
    expect(detectRecurring(amounts, 'Vendor')).toBe(false)
  })

  it('101. irregular amounts (high CV) → not recurring even with 6 months', () => {
    const amounts: (number | null)[] = [50, 500, 50, 500, 50, 500]
    expect(detectRecurring(amounts, 'Vendor')).toBe(false)
  })

})

// ── buildSummaryLine — structure verification ─────────────────────────────

describe('buildSummaryLine — structure verification', () => {

  it('102. contains forecastMonthLabel in output', () => {
    const line = buildSummaryLine('Ekim 2026', 300_000, 280_000)
    expect(line).toContain('Ekim 2026')
  })

  it('103. non-empty string for any valid inputs', () => {
    const line = buildSummaryLine('Kasım 2026', 500_000, 500_000)
    expect(typeof line).toBe('string')
    expect(line.length).toBeGreaterThan(0)
  })

  it('104. contains "gider" in all cases', () => {
    const line = buildSummaryLine('Aralık 2026', 1_200_000, 1_000_000)
    expect(line).toContain('gider')
  })

  it('105. format large number with M suffix', () => {
    const line = buildSummaryLine('Ocak 2027', 5_000_000, 4_000_000)
    expect(line).toContain('M')
  })

  it('106. zero avg → no percent line suffix', () => {
    const line = buildSummaryLine('Şubat 2027', 100_000, 0)
    // When last3mAvgTotal=0 → returns simplified message without "ortalamadan"
    expect(line).toContain('için')
  })

})
