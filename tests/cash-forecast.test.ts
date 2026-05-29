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

// ── computeWeeklyCollectionRate — additional tests ────────────────────────────

describe('computeWeeklyCollectionRate — additional', () => {
  it('DSO = 7 (exactly 1 week): avgMonthlySales * 7 / 7 = avgMonthlySales', () => {
    expect(computeWeeklyCollectionRate(50_000, 7)).toBe(50_000)
  })

  it('DSO = 14: 100_000 * 7 / 14 = 50_000', () => {
    expect(computeWeeklyCollectionRate(100_000, 14)).toBe(50_000)
  })

  it('DSO = 45: result is less than DSO=30 rate', () => {
    const r30 = computeWeeklyCollectionRate(100_000, 30)
    const r45 = computeWeeklyCollectionRate(100_000, 45)
    expect(r45).toBeLessThan(r30)
  })

  it('very large DSO (365): very low weekly rate', () => {
    const result = computeWeeklyCollectionRate(100_000, 365)
    expect(result).toBeCloseTo(100_000 * 7 / 365, 2)
  })

  it('high monthly sales with short DSO gives large weekly rate', () => {
    const result = computeWeeklyCollectionRate(1_000_000, 7)
    expect(result).toBe(1_000_000)
  })

  it('DSO and DPO both 0 → clamp to 1, no division error', () => {
    // max(0, 1) = 1
    expect(computeWeeklyCollectionRate(70_000, 0)).toBe(490_000)
  })
})

// ── computeWeeklyPaymentRate — additional tests ───────────────────────────────

describe('computeWeeklyPaymentRate — additional', () => {
  it('DPO = 7: monthlyExpenses * 7/7 = monthlyExpenses', () => {
    expect(computeWeeklyPaymentRate(40_000, 7)).toBe(40_000)
  })

  it('DPO = 14: 100_000 * 7/14 = 50_000', () => {
    expect(computeWeeklyPaymentRate(100_000, 14)).toBe(50_000)
  })

  it('DPO = 28 gives lower rate than DPO = 14', () => {
    const r14 = computeWeeklyPaymentRate(100_000, 14)
    const r28 = computeWeeklyPaymentRate(100_000, 28)
    expect(r28).toBeLessThan(r14)
  })

  it('large monthly expenses with DPO=1 → large weekly outflow', () => {
    const result = computeWeeklyPaymentRate(500_000, 1)
    expect(result).toBe(3_500_000)
  })

  it('returns 0 for 0 expenses regardless of DPO', () => {
    expect(computeWeeklyPaymentRate(0, 45)).toBe(0)
  })
})

// ── buildWeeklyForecast — additional tests ────────────────────────────────────

describe('buildWeeklyForecast — additional', () => {
  it('startCash = 0 with balanced inflow/outflow stays at 0', () => {
    const rows = buildWeeklyForecast(0, 10_000, 10_000, 3)
    rows.forEach(r => expect(r.closing_cash).toBe(0))
  })

  it('multiple obligations in same week are all reflected', () => {
    const obligations = [
      { week: 2, amount: -10_000, label: 'Kira' },
      { week: 2, amount: -5_000, label: 'Elektrik' },
    ]
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, obligations)
    // Week 2 outflow = 8_000 (base) + 10_000 + 5_000 = 23_000
    expect(rows[1].outflow).toBe(23_000)
    expect(rows[1].obligations).toHaveLength(2)
  })

  it('multiple positive obligations in same week sum correctly', () => {
    const obligations = [
      { week: 1, amount: 30_000, label: 'Tahsilat 1' },
      { week: 1, amount: 20_000, label: 'Tahsilat 2' },
    ]
    const rows = buildWeeklyForecast(100_000, 5_000, 3_000, 13, obligations)
    // inflow = 5_000 + 30_000 + 20_000 = 55_000
    expect(rows[0].inflow).toBe(55_000)
  })

  it('obligations only for week 13 do not affect weeks 1–12', () => {
    const obligations = [{ week: 13, amount: -100_000, label: 'Son ödeme' }]
    const rows = buildWeeklyForecast(200_000, 5_000, 3_000, 13, obligations)
    // Weeks 1–12 should not be affected by week 13 obligation
    for (let i = 0; i < 12; i++) {
      expect(rows[i].has_obligation).toBe(false)
    }
    expect(rows[12].has_obligation).toBe(true)
  })

  it('1-week forecast works correctly', () => {
    const rows = buildWeeklyForecast(50_000, 20_000, 10_000, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].week).toBe(1)
    expect(rows[0].net).toBe(10_000)
    expect(rows[0].closing_cash).toBe(60_000)
  })

  it('cumulative effect compounds across many weeks', () => {
    // net = 1000 per week, 13 weeks → total gain = 13_000
    const rows = buildWeeklyForecast(0, 11_000, 10_000, 13)
    expect(rows[12].closing_cash).toBe(13_000)
  })

  it('net = 0 each week keeps starting cash stable', () => {
    const rows = buildWeeklyForecast(75_000, 8_000, 8_000, 5)
    rows.forEach(r => expect(r.closing_cash).toBe(75_000))
  })

  it('obligation with amount = 0 has no cash effect but has_obligation = true', () => {
    const obligations = [{ week: 3, amount: 0, label: 'Sıfır' }]
    const rows = buildWeeklyForecast(100_000, 10_000, 8_000, 13, obligations)
    // Week 3 closing_cash should be same as without obligation
    const rowsNoObligation = buildWeeklyForecast(100_000, 10_000, 8_000, 13)
    expect(rows[2].closing_cash).toBe(rowsNoObligation[2].closing_cash)
    // But has_obligation should be true
    expect(rows[2].has_obligation).toBe(true)
  })
})

// ── computeMinimumCashBuffer — additional tests ────────────────────────────────

describe('computeMinimumCashBuffer — additional', () => {
  it('1 week buffer = weeklyOutflow', () => {
    expect(computeMinimumCashBuffer(15_000, 1)).toBe(15_000)
  })

  it('8 week buffer = 8× outflow', () => {
    expect(computeMinimumCashBuffer(10_000, 8)).toBe(80_000)
  })

  it('fractional outflow rounds correctly', () => {
    // 10_000.50 * 4 = 40_002.00
    expect(computeMinimumCashBuffer(10_000.50, 4)).toBe(40_002)
  })

  it('large outflow large buffer', () => {
    expect(computeMinimumCashBuffer(500_000, 4)).toBe(2_000_000)
  })
})

// ── classifyWeeklyCashHealth — additional boundary tests ─────────────────────

describe('classifyWeeklyCashHealth — additional', () => {
  it('closingCash = minimumBuffer * 2 → strong (boundary)', () => {
    expect(classifyWeeklyCashHealth(20_000, 10_000)).toBe('strong')
  })

  it('closingCash just below minimumBuffer * 2 → adequate', () => {
    expect(classifyWeeklyCashHealth(19_999, 10_000)).toBe('adequate')
  })

  it('closingCash exactly minimumBuffer → adequate', () => {
    expect(classifyWeeklyCashHealth(10_000, 10_000)).toBe('adequate')
  })

  it('closingCash = minimumBuffer * 0.5 → tight (boundary: not critical)', () => {
    expect(classifyWeeklyCashHealth(5_000, 10_000)).toBe('tight')
  })

  it('closingCash = minimumBuffer * 0.5 - 1 → critical', () => {
    expect(classifyWeeklyCashHealth(4_999, 10_000)).toBe('critical')
  })

  it('large buffer, small cash → critical', () => {
    expect(classifyWeeklyCashHealth(1_000, 1_000_000)).toBe('critical')
  })

  it('zero buffer and positive cash → strong (0 * 2 = 0, cash >= 0)', () => {
    expect(classifyWeeklyCashHealth(1, 0)).toBe('strong')
  })
})

// ── findCashCrisisWeek — additional tests ─────────────────────────────────────

describe('findCashCrisisWeek — additional', () => {
  it('crisis at week 13 (last week)', () => {
    const forecast = Array.from({ length: 13 }, (_, i) => ({
      week: i + 1,
      closing_cash: i < 12 ? 10_000 : -5_000,
    }))
    expect(findCashCrisisWeek(forecast)).toBe(13)
  })

  it('-0.01 closing cash triggers crisis', () => {
    const forecast = [
      { week: 1, closing_cash: 50_000 },
      { week: 2, closing_cash: -0.01 },
    ]
    expect(findCashCrisisWeek(forecast)).toBe(2)
  })

  it('0 closing cash does not trigger crisis', () => {
    const forecast = [{ week: 1, closing_cash: 0 }]
    expect(findCashCrisisWeek(forecast)).toBeNull()
  })

  it('multiple negative weeks → returns the earliest', () => {
    const forecast = [
      { week: 1, closing_cash: 5_000 },
      { week: 2, closing_cash: -1_000 },
      { week: 3, closing_cash: -2_000 },
      { week: 4, closing_cash: 10_000 },
      { week: 5, closing_cash: -500 },
    ]
    expect(findCashCrisisWeek(forecast)).toBe(2)
  })
})

// ── computeForecastConfidence — additional boundary tests ─────────────────────

describe('computeForecastConfidence — additional', () => {
  it('exactly 5 months, both DSO and DPO → medium (< 6 months)', () => {
    expect(computeForecastConfidence(5, true, true)).toBe('medium')
  })

  it('2 months with both DSO and DPO → medium (historicalMonths > 0 and has data)', () => {
    expect(computeForecastConfidence(2, true, true)).toBe('medium')
  })

  it('2 months no data → low', () => {
    expect(computeForecastConfidence(2, false, false)).toBe('low')
  })

  it('1 month with DSO data → medium', () => {
    expect(computeForecastConfidence(1, true, false)).toBe('medium')
  })

  it('1 month with DPO data → medium', () => {
    expect(computeForecastConfidence(1, false, true)).toBe('medium')
  })

  it('100 months with both → high', () => {
    expect(computeForecastConfidence(100, true, true)).toBe('high')
  })

  it('6 months with both → high', () => {
    expect(computeForecastConfidence(6, true, true)).toBe('high')
  })
})
