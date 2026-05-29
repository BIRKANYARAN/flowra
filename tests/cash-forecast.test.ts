// ─────────────────────────────────────────────────────────────────────────────
// tests/cash-forecast.test.ts
//
// Unit tests for all pure functions in cash-forecast.service.ts
// 38+ tests covering normal cases, edge cases, and boundary conditions.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeWeeklyCollectionRate,
  computeWeeklyPaymentRate,
  buildWeeklyForecast,
  computeMinimumCashBuffer,
  classifyWeeklyCashHealth,
  findCashCrisisWeek,
  computeForecastConfidence,
} from '../lib/services/finance/cash-forecast.service'

// ── computeWeeklyCollectionRate ───────────────────────────────────────────────

describe('computeWeeklyCollectionRate', () => {
  it('returns weekly rate for normal inputs', () => {
    // avgMonthlySales=100_000, dso=30 → 100_000 * 7 / 30 ≈ 23_333.33
    const result = computeWeeklyCollectionRate(100_000, 30)
    expect(result).toBeCloseTo(23_333.33, 1)
  })

  it('returns 0 when avgMonthlySales is 0', () => {
    expect(computeWeeklyCollectionRate(0, 30)).toBe(0)
  })

  it('returns 0 when avgMonthlySales is 0 even with DSO>0', () => {
    expect(computeWeeklyCollectionRate(0, 45)).toBe(0)
  })

  it('handles DSO of 1 (max speed)', () => {
    // 50_000 * 7 / 1 = 350_000
    expect(computeWeeklyCollectionRate(50_000, 1)).toBe(350_000)
  })

  it('handles DSO of 0 by clamping to max(1) — avoids division by zero', () => {
    // DSO=0 → max(0,1)=1, result = avgMonthlySales * 7 / 1
    expect(computeWeeklyCollectionRate(10_000, 0)).toBe(70_000)
  })

  it('higher DSO produces lower weekly rate', () => {
    const rate30 = computeWeeklyCollectionRate(100_000, 30)
    const rate60 = computeWeeklyCollectionRate(100_000, 60)
    expect(rate60).toBeLessThan(rate30)
  })

  it('result scales linearly with avgMonthlySales', () => {
    const r1 = computeWeeklyCollectionRate(100_000, 30)
    const r2 = computeWeeklyCollectionRate(200_000, 30)
    expect(r2).toBeCloseTo(r1 * 2, 1)
  })
})

// ── computeWeeklyPaymentRate ──────────────────────────────────────────────────

describe('computeWeeklyPaymentRate', () => {
  it('returns weekly payment rate for normal inputs', () => {
    // avgMonthlyExpenses=60_000, dpo=30 → 60_000 * 7 / 30 = 14_000
    expect(computeWeeklyPaymentRate(60_000, 30)).toBeCloseTo(14_000, 1)
  })

  it('returns 0 when avgMonthlyExpenses is 0', () => {
    expect(computeWeeklyPaymentRate(0, 30)).toBe(0)
  })

  it('returns 0 when avgMonthlyExpenses is 0 regardless of DPO', () => {
    expect(computeWeeklyPaymentRate(0, 0)).toBe(0)
  })

  it('handles DPO of 0 by clamping to 1', () => {
    expect(computeWeeklyPaymentRate(10_000, 0)).toBe(70_000)
  })

  it('higher DPO produces lower weekly payment rate', () => {
    const rate30 = computeWeeklyPaymentRate(60_000, 30)
    const rate60 = computeWeeklyPaymentRate(60_000, 60)
    expect(rate60).toBeLessThan(rate30)
  })
})

// ── buildWeeklyForecast ───────────────────────────────────────────────────────

describe('buildWeeklyForecast', () => {
  it('returns exactly 13 rows by default', () => {
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000)
    expect(rows).toHaveLength(13)
  })

  it('week numbers are 1 through 13', () => {
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000)
    rows.forEach((row, idx) => expect(row.week).toBe(idx + 1))
  })

  it('returns custom number of weeks when specified', () => {
    const rows = buildWeeklyForecast(50_000, 5_000, 4_000, 6)
    expect(rows).toHaveLength(6)
  })

  it('closing cash accumulates correctly (net positive)', () => {
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 3)
    // week 1: 100_000 + 2_000 = 102_000
    expect(rows[0].closing_cash).toBe(102_000)
    // week 2: 102_000 + 2_000 = 104_000
    expect(rows[1].closing_cash).toBe(104_000)
    // week 3: 104_000 + 2_000 = 106_000
    expect(rows[2].closing_cash).toBe(106_000)
  })

  it('closing cash accumulates correctly (net negative)', () => {
    const rows = buildWeeklyForecast(100_000, 5_000, 10_000, 3)
    expect(rows[0].closing_cash).toBe(95_000)
    expect(rows[1].closing_cash).toBe(90_000)
    expect(rows[2].closing_cash).toBe(85_000)
  })

  it('closing cash can go negative', () => {
    const rows = buildWeeklyForecast(10_000, 0, 5_000, 4)
    expect(rows[3].closing_cash).toBe(-10_000)
  })

  it('handles startCash of 0', () => {
    const rows = buildWeeklyForecast(0, 10_000, 8_000, 1)
    expect(rows[0].closing_cash).toBe(2_000)
  })

  it('known obligations are applied to correct week', () => {
    const obligations = [{ week: 3, amount: -20_000, label: 'Kredi ödemesi' }]
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, obligations)
    // Week 3 should have extra 20_000 outflow
    expect(rows[2].outflow).toBe(28_000)
    expect(rows[2].has_obligation).toBe(true)
  })

  it('obligation labels are stored in row obligations array', () => {
    const obligations = [{ week: 2, amount: -15_000, label: 'Bono geri ödemesi' }]
    const rows = buildWeeklyForecast(50_000, 5_000, 4_000, 13, obligations)
    expect(rows[1].obligations).toHaveLength(1)
    expect(rows[1].obligations[0].label).toBe('Bono geri ödemesi')
  })

  it('positive obligations increase inflow for that week', () => {
    const obligations = [{ week: 1, amount: 50_000, label: 'Sermaye girişi' }]
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, obligations)
    expect(rows[0].inflow).toBe(60_000)
    expect(rows[0].has_obligation).toBe(true)
  })

  it('has_obligation is false for weeks without obligations', () => {
    const obligations = [{ week: 5, amount: -10_000, label: 'Ödeme' }]
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, obligations)
    expect(rows[0].has_obligation).toBe(false)
    expect(rows[4].has_obligation).toBe(true)
  })

  it('net = inflow - outflow', () => {
    const rows = buildWeeklyForecast(100_000, 12_000, 7_000, 1)
    expect(rows[0].net).toBe(5_000)
  })

  it('handles empty obligations array', () => {
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, [])
    expect(rows).toHaveLength(13)
    expect(rows.every(r => !r.has_obligation)).toBe(true)
  })
})

// ── computeMinimumCashBuffer ──────────────────────────────────────────────────

describe('computeMinimumCashBuffer', () => {
  it('returns 4 × weeklyOutflow by default', () => {
    expect(computeMinimumCashBuffer(10_000)).toBe(40_000)
  })

  it('uses custom buffer weeks', () => {
    expect(computeMinimumCashBuffer(10_000, 6)).toBe(60_000)
  })

  it('returns 0 for zero outflow', () => {
    expect(computeMinimumCashBuffer(0)).toBe(0)
  })

  it('returns 0 for zero outflow with custom weeks', () => {
    expect(computeMinimumCashBuffer(0, 8)).toBe(0)
  })

  it('never returns negative value', () => {
    // Edge case: negative outflow should not produce negative buffer
    expect(computeMinimumCashBuffer(-5_000)).toBeGreaterThanOrEqual(0)
  })
})

// ── classifyWeeklyCashHealth ──────────────────────────────────────────────────

describe('classifyWeeklyCashHealth', () => {
  it('returns "negative" when closingCash < 0', () => {
    expect(classifyWeeklyCashHealth(-1, 10_000)).toBe('negative')
  })

  it('returns "negative" for -100_000', () => {
    expect(classifyWeeklyCashHealth(-100_000, 10_000)).toBe('negative')
  })

  it('returns "critical" when closingCash < minimumBuffer * 0.5', () => {
    // buffer=10_000, critical threshold = 5_000
    expect(classifyWeeklyCashHealth(4_999, 10_000)).toBe('critical')
  })

  it('returns "critical" at exactly 0 with non-zero buffer', () => {
    expect(classifyWeeklyCashHealth(0, 10_000)).toBe('critical')
  })

  it('returns "tight" when closingCash < minimumBuffer', () => {
    // buffer=10_000: tight is [5_000, 10_000)
    expect(classifyWeeklyCashHealth(7_000, 10_000)).toBe('tight')
  })

  it('returns "tight" at exactly minimumBuffer * 0.5', () => {
    expect(classifyWeeklyCashHealth(5_000, 10_000)).toBe('tight')
  })

  it('returns "adequate" when closingCash < minimumBuffer * 2', () => {
    // buffer=10_000: adequate is [10_000, 20_000)
    expect(classifyWeeklyCashHealth(15_000, 10_000)).toBe('adequate')
  })

  it('returns "adequate" at exactly minimumBuffer', () => {
    expect(classifyWeeklyCashHealth(10_000, 10_000)).toBe('adequate')
  })

  it('returns "strong" when closingCash >= minimumBuffer * 2', () => {
    expect(classifyWeeklyCashHealth(20_000, 10_000)).toBe('strong')
  })

  it('returns "strong" well above threshold', () => {
    expect(classifyWeeklyCashHealth(500_000, 10_000)).toBe('strong')
  })

  it('returns "strong" when minimumBuffer is 0 and cash is 0', () => {
    // minimumBuffer=0: 0 >= 0*2 → strong
    expect(classifyWeeklyCashHealth(0, 0)).toBe('strong')
  })
})

// ── findCashCrisisWeek ────────────────────────────────────────────────────────

describe('findCashCrisisWeek', () => {
  it('returns null when no week has negative cash', () => {
    const forecast = Array.from({ length: 13 }, (_, i) => ({
      week: i + 1,
      closing_cash: 10_000 + i * 500,
    }))
    expect(findCashCrisisWeek(forecast)).toBeNull()
  })

  it('returns first week number with negative cash', () => {
    const forecast = [
      { week: 1, closing_cash: 5_000 },
      { week: 2, closing_cash: 2_000 },
      { week: 3, closing_cash: -1_000 },
      { week: 4, closing_cash: -5_000 },
    ]
    expect(findCashCrisisWeek(forecast)).toBe(3)
  })

  it('returns 1 when week 1 is already negative', () => {
    const forecast = [
      { week: 1, closing_cash: -500 },
      { week: 2, closing_cash: -1_000 },
    ]
    expect(findCashCrisisWeek(forecast)).toBe(1)
  })

  it('returns null for empty forecast', () => {
    expect(findCashCrisisWeek([])).toBeNull()
  })

  it('returns the FIRST negative week, not last', () => {
    const forecast = [
      { week: 1, closing_cash: 10_000 },
      { week: 2, closing_cash: -1_000 },
      { week: 3, closing_cash: 5_000 },  // back to positive
      { week: 4, closing_cash: -2_000 },
    ]
    expect(findCashCrisisWeek(forecast)).toBe(2)
  })
})

// ── computeForecastConfidence ─────────────────────────────────────────────────

describe('computeForecastConfidence', () => {
  it('returns "high" for >= 6 months with both DSO and DPO', () => {
    expect(computeForecastConfidence(6, true, true)).toBe('high')
  })

  it('returns "high" for > 6 months with both DSO and DPO', () => {
    expect(computeForecastConfidence(12, true, true)).toBe('high')
  })

  it('returns "medium" for 6 months but missing DPO', () => {
    expect(computeForecastConfidence(6, true, false)).toBe('medium')
  })

  it('returns "medium" for 6 months but missing DSO', () => {
    expect(computeForecastConfidence(6, false, true)).toBe('medium')
  })

  it('returns "medium" for exactly 3 months with both DSO and DPO', () => {
    expect(computeForecastConfidence(3, true, true)).toBe('medium')
  })

  it('returns "medium" for exactly 3 months with neither DSO nor DPO', () => {
    expect(computeForecastConfidence(3, false, false)).toBe('medium')
  })

  it('returns "medium" for < 6 months but has DSO data', () => {
    expect(computeForecastConfidence(4, true, false)).toBe('medium')
  })

  it('returns "medium" for < 6 months but has DPO data', () => {
    expect(computeForecastConfidence(5, false, true)).toBe('medium')
  })

  it('returns "low" for < 3 months with no DSO and no DPO', () => {
    expect(computeForecastConfidence(2, false, false)).toBe('low')
  })

  it('returns "low" for 0 months', () => {
    expect(computeForecastConfidence(0, false, false)).toBe('low')
  })

  it('returns "low" for 0 months even if DSO and DPO available', () => {
    expect(computeForecastConfidence(0, true, true)).toBe('low')
  })
})
