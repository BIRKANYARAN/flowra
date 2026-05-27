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

})
