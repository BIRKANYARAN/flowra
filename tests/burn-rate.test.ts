/**
 * Cash Burn Rate Monitor — unit tests
 *
 * Tests pure computation logic of BurnRateService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeBurnTrend,
  computeRunway,
  findPeakBurnMonth,
} from '../lib/services/finance/burn-rate.service'
import type { MonthlyBurnData } from '../lib/services/finance/burn-rate.service'

// ── computeBurnTrend ──────────────────────────────────────────────────────────

describe('computeBurnTrend — pure', () => {

  // Test 1: insufficient_data when monthCount < 3
  it('1. monthCount < 3 → insufficient_data', () => {
    expect(computeBurnTrend(10_000, 9_000, 2)).toBe('insufficient_data')
  })

  // Test 2: insufficient_data when monthCount = 0
  it('2. monthCount = 0 → insufficient_data', () => {
    expect(computeBurnTrend(0, 0, 0)).toBe('insufficient_data')
  })

  // Test 3: accelerating when current > avg by >10%
  it('3. current 20% above avg → accelerating', () => {
    // current = 12_000, avg = 10_000 → ratio = 1.2 > 1.1
    expect(computeBurnTrend(12_000, 10_000, 3)).toBe('accelerating')
  })

  // Test 4: accelerating edge: exactly 11% above
  it('4. current exactly 11% above avg → accelerating', () => {
    expect(computeBurnTrend(11_100, 10_000, 3)).toBe('accelerating')
  })

  // Test 5: decelerating when current < avg by >10%
  it('5. current 20% below avg → decelerating', () => {
    // current = 8_000, avg = 10_000 → ratio = 0.8 < 0.9
    expect(computeBurnTrend(8_000, 10_000, 3)).toBe('decelerating')
  })

  // Test 6: decelerating edge: exactly 11% below
  it('6. current exactly 11% below avg → decelerating', () => {
    expect(computeBurnTrend(8_900, 10_000, 3)).toBe('decelerating')
  })

  // Test 7: stable when within ±10%
  it('7. current exactly equal to avg → stable', () => {
    expect(computeBurnTrend(10_000, 10_000, 3)).toBe('stable')
  })

  // Test 8: stable when current = avg * 1.10 (boundary — NOT accelerating, borderline stable)
  it('8. current exactly 10% above avg → stable (boundary, not >10%)', () => {
    // ratio = 1.1 — NOT > 1.1, so stable
    expect(computeBurnTrend(11_000, 10_000, 3)).toBe('stable')
  })

  // Test 9: insufficient_data when avgBurn = 0 (even if monthCount >= 3)
  it('9. avgBurn = 0 → insufficient_data (avoid division by zero)', () => {
    expect(computeBurnTrend(5_000, 0, 3)).toBe('insufficient_data')
  })

  // Test 10: stable with monthCount = 6 (large enough)
  it('10. monthCount = 6, within ±10% → stable', () => {
    expect(computeBurnTrend(10_500, 10_000, 6)).toBe('stable')
  })
})

// ── computeRunway ─────────────────────────────────────────────────────────────

describe('computeRunway — pure', () => {

  // Test 11: null when cashBalance is null
  it('11. cashBalance = null → null', () => {
    expect(computeRunway(null, 5_000)).toBeNull()
  })

  // Test 12: null when cashBalance = 0
  it('12. cashBalance = 0 → null', () => {
    expect(computeRunway(0, 5_000)).toBeNull()
  })

  // Test 13: null when avgNetBurn ≤ 0 (company is cash-flow positive)
  it('13. avgNetBurn = 0 → null (company not burning)', () => {
    expect(computeRunway(100_000, 0)).toBeNull()
  })

  // Test 14: null when avgNetBurn < 0 (company generating cash)
  it('14. avgNetBurn = -5000 → null (company generating cash)', () => {
    expect(computeRunway(100_000, -5_000)).toBeNull()
  })

  // Test 15: positive result: 100_000 cash / 10_000 burn = 10 months
  it('15. cashBalance=100_000, avgNetBurn=10_000 → 10 months', () => {
    expect(computeRunway(100_000, 10_000)).toBeCloseTo(10, 2)
  })

  // Test 16: fractional months: 150_000 / 40_000 = 3.75
  it('16. cashBalance=150_000, avgNetBurn=40_000 → 3.75 months', () => {
    expect(computeRunway(150_000, 40_000)).toBeCloseTo(3.75, 2)
  })
})

// ── findPeakBurnMonth ─────────────────────────────────────────────────────────

describe('findPeakBurnMonth — pure', () => {

  // Test 17: empty array → { month: null, try: null }
  it('17. empty array → { month: null, try: null }', () => {
    const result = findPeakBurnMonth([])
    expect(result.month).toBeNull()
    expect(result.try).toBeNull()
  })

  // Test 18: single month → that month is the peak
  it('18. single month → that month is peak', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026', gross_burn_try: 15_000, revenue_try: 10_000, net_burn_try: 5_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(15_000)
  })

  // Test 19: array with clear peak in the middle
  it('19. peak in the middle of array', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 10_000, revenue_try: 8_000, net_burn_try: 2_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 25_000, revenue_try: 8_000, net_burn_try: 17_000, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',   gross_burn_try: 12_000, revenue_try: 8_000, net_burn_try: 4_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(25_000)
  })

  // Test 20: array with all equal burns → first element is returned
  it('20. all equal burns → first month returned (first wins in stable)', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 10_000, revenue_try: 5_000, net_burn_try: 5_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 10_000, revenue_try: 5_000, net_burn_try: 5_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    // When equal, first element stays as peak
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(10_000)
  })

  // Test 21: peak is the last element
  it('21. peak at end of array', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 5_000, revenue_try: 3_000, net_burn_try: 2_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 8_000, revenue_try: 3_000, net_burn_try: 5_000, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',  gross_burn_try: 50_000, revenue_try: 3_000, net_burn_try: 47_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Kasım 2025')
    expect(result.try).toBe(50_000)
  })
})

// ── computeBurnTrend — extended ───────────────────────────────────────────────

describe('computeBurnTrend — extended boundary tests', () => {

  // Test 22: ratio exactly at 0.9 (boundary for decelerating)
  it('22. current exactly 10% below avg → stable (not decelerating, ratio = 0.9 not < 0.9)', () => {
    // current=9000, avg=10000 → ratio=0.9, NOT < 0.9 → stable
    expect(computeBurnTrend(9_000, 10_000, 3)).toBe('stable')
  })

  // Test 23: ratio just under 0.9 → decelerating
  it('23. ratio 0.899 (just below 0.9) → decelerating', () => {
    expect(computeBurnTrend(8_990, 10_000, 3)).toBe('decelerating')
  })

  // Test 24: ratio just above 1.1 → accelerating
  it('24. ratio 1.101 (just above 1.1) → accelerating', () => {
    expect(computeBurnTrend(11_010, 10_000, 3)).toBe('accelerating')
  })

  // Test 25: monthCount exactly 3 (minimum for non-insufficient)
  it('25. monthCount = 3 and stable → stable', () => {
    expect(computeBurnTrend(10_000, 10_000, 3)).toBe('stable')
  })

  // Test 26: monthCount = 1 → insufficient
  it('26. monthCount = 1 → insufficient_data', () => {
    expect(computeBurnTrend(10_000, 10_000, 1)).toBe('insufficient_data')
  })

  // Test 27: very high burn vs avg → accelerating
  it('27. current 3× avg → accelerating', () => {
    expect(computeBurnTrend(30_000, 10_000, 4)).toBe('accelerating')
  })

  // Test 28: near zero current vs avg → decelerating
  it('28. current near zero vs high avg → decelerating', () => {
    expect(computeBurnTrend(100, 10_000, 3)).toBe('decelerating')
  })

  // Test 29: negative avgBurn → insufficient
  it('29. negative avgBurn → insufficient_data', () => {
    expect(computeBurnTrend(10_000, -5_000, 3)).toBe('insufficient_data')
  })

  // Test 30: large month count, within ±10% → stable
  it('30. monthCount = 12, within ±5% → stable', () => {
    expect(computeBurnTrend(10_300, 10_000, 12)).toBe('stable')
  })

})

// ── computeRunway — extended ──────────────────────────────────────────────────

describe('computeRunway — extended boundary tests', () => {

  // Test 31: exactly 1 month runway
  it('31. cash = burn → 1 month runway', () => {
    expect(computeRunway(50_000, 50_000)).toBeCloseTo(1, 2)
  })

  // Test 32: large runway
  it('32. cashBalance=1_200_000, avgNetBurn=10_000 → 120 months', () => {
    expect(computeRunway(1_200_000, 10_000)).toBeCloseTo(120, 2)
  })

  // Test 33: fractional months 2.5
  it('33. cashBalance=250_000, avgNetBurn=100_000 → 2.5 months', () => {
    expect(computeRunway(250_000, 100_000)).toBeCloseTo(2.5, 2)
  })

  // Test 34: very small burn → very long runway
  it('34. burn=1 TRY/month, balance=12 → 12 months', () => {
    expect(computeRunway(12, 1)).toBeCloseTo(12, 2)
  })

  // Test 35: null cashBalance explicitly
  it('35. cashBalance=null, burn=20_000 → null', () => {
    expect(computeRunway(null, 20_000)).toBeNull()
  })

  // Test 36: cashBalance negative → null
  it('36. cashBalance=-5_000 → null', () => {
    expect(computeRunway(-5_000, 10_000)).toBeNull()
  })

  // Test 37: burn exactly = 0 → null
  it('37. avgNetBurn=0 → null', () => {
    expect(computeRunway(500_000, 0)).toBeNull()
  })

  // Test 38: very fractional result
  it('38. cashBalance=75_000, avgNetBurn=100_000 → 0.75 months', () => {
    expect(computeRunway(75_000, 100_000)).toBeCloseTo(0.75, 2)
  })

})

// ── findPeakBurnMonth — extended ──────────────────────────────────────────────

describe('findPeakBurnMonth — extended', () => {

  // Test 39: peak first element
  it('39. peak at beginning of array', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-03', label: 'Mart 2026',   gross_burn_try: 100_000, revenue_try: 50_000, net_burn_try: 50_000, cash_balance_try: null },
      { month: '2026-02', label: 'Şubat 2026',  gross_burn_try: 40_000,  revenue_try: 30_000, net_burn_try: 10_000, cash_balance_try: null },
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 60_000,  revenue_try: 40_000, net_burn_try: 20_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Mart 2026')
    expect(result.try).toBe(100_000)
  })

  // Test 40: two items, second wins
  it('40. two items, second has higher burn → second is peak', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-02', label: 'Şubat 2026', gross_burn_try: 10_000, revenue_try: 5_000, net_burn_try: 5_000, cash_balance_try: null },
      { month: '2026-01', label: 'Ocak 2026',  gross_burn_try: 20_000, revenue_try: 5_000, net_burn_try: 15_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(20_000)
  })

  // Test 41: six months of data
  it('41. six months data — finds correct peak', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 10_000, revenue_try: 8_000, net_burn_try: 2_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 30_000, revenue_try: 8_000, net_burn_try: 22_000, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',   gross_burn_try: 20_000, revenue_try: 8_000, net_burn_try: 12_000, cash_balance_try: null },
      { month: '2025-10', label: 'Ekim 2025',    gross_burn_try: 15_000, revenue_try: 8_000, net_burn_try: 7_000, cash_balance_try: null },
      { month: '2025-09', label: 'Eylül 2025',   gross_burn_try: 25_000, revenue_try: 8_000, net_burn_try: 17_000, cash_balance_try: null },
      { month: '2025-08', label: 'Ağustos 2025', gross_burn_try: 18_000, revenue_try: 8_000, net_burn_try: 10_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(30_000)
  })

  // Test 42: zero gross burn everywhere
  it('42. all zero burns → first element returned', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 0, revenue_try: 5_000, net_burn_try: -5_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 0, revenue_try: 5_000, net_burn_try: -5_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.try).toBe(0)
    expect(result.month).toBe('Ocak 2026')
  })

  // Test 43: large differences in gross burn
  it('43. wildly different burns — identifies extreme peak', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 1_000, revenue_try: 0, net_burn_try: 1_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 999_999, revenue_try: 0, net_burn_try: 999_999, cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',   gross_burn_try: 500_000, revenue_try: 0, net_burn_try: 500_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(999_999)
  })

  // Test 44: cash_balance_try can be non-null — findPeakBurnMonth uses gross_burn_try
  it('44. cash_balance_try values do not affect peak detection (uses gross_burn_try)', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 5_000, revenue_try: 3_000, net_burn_try: 2_000, cash_balance_try: 1_000_000 },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 15_000, revenue_try: 3_000, net_burn_try: 12_000, cash_balance_try: 500 },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
  })

  // Test 45: net_burn_try higher for first item, but gross is lower — still picks by gross
  it('45. peak by gross burn not by net burn', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 20_000, revenue_try: 5_000, net_burn_try: 15_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 10_000, revenue_try: 1_000, net_burn_try: 9_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Ocak 2026')
    expect(result.try).toBe(20_000)
  })

})

// ── Integration: BurnRateService pure helpers ────────────────────────────────

describe('Integration: burn trend + runway + peak combination', () => {

  const months: MonthlyBurnData[] = [
    { month: '2026-01', label: 'Ocak 2026',    gross_burn_try: 55_000, revenue_try: 40_000, net_burn_try: 15_000, cash_balance_try: 200_000 },
    { month: '2025-12', label: 'Aralık 2025',  gross_burn_try: 45_000, revenue_try: 40_000, net_burn_try: 5_000, cash_balance_try: null },
    { month: '2025-11', label: 'Kasım 2025',   gross_burn_try: 40_000, revenue_try: 40_000, net_burn_try: 0, cash_balance_try: null },
    { month: '2025-10', label: 'Ekim 2025',    gross_burn_try: 38_000, revenue_try: 35_000, net_burn_try: 3_000, cash_balance_try: null },
    { month: '2025-09', label: 'Eylül 2025',   gross_burn_try: 30_000, revenue_try: 38_000, net_burn_try: -8_000, cash_balance_try: null },
    { month: '2025-08', label: 'Ağustos 2025', gross_burn_try: 28_000, revenue_try: 35_000, net_burn_try: -7_000, cash_balance_try: null },
  ]

  it('46. peak burn is January at 55_000', () => {
    const peak = findPeakBurnMonth(months)
    expect(peak.month).toBe('Ocak 2026')
    expect(peak.try).toBe(55_000)
  })

  it('47. burn trend — current 55K vs 3-month avg = (55+45+40)/3 = 46.67K → ratio ≈1.18 → accelerating', () => {
    const avg3mo = (55_000 + 45_000 + 40_000) / 3
    const trend = computeBurnTrend(55_000, avg3mo, 3)
    expect(trend).toBe('accelerating')
  })

  it('48. runway from cash balance 200K and net burn 15K → ~13.3 months', () => {
    const result = computeRunway(200_000, 15_000)
    expect(result).not.toBeNull()
    if (result !== null) {
      expect(result).toBeCloseTo(13.33, 1)
    }
  })

  it('49. when net burn is 0, runway is null', () => {
    expect(computeRunway(200_000, 0)).toBeNull()
  })

  it('50. when net burn is negative (cash generating), runway is null', () => {
    expect(computeRunway(200_000, -5_000)).toBeNull()
  })

})

// ── computeBurnTrend — isCostMetric-independent, parameter sweep ──────────────

describe('computeBurnTrend — parameter sweep', () => {
  it('monthCount=2 → insufficient_data', () => {
    expect(computeBurnTrend(10_000, 9_000, 2)).toBe('insufficient_data')
  })

  it('monthCount=3 with avgBurn=0 → insufficient_data', () => {
    expect(computeBurnTrend(0, 0, 3)).toBe('insufficient_data')
  })

  it('current > avg by exactly 10% (ratio=1.1) → stable (boundary not crossed)', () => {
    expect(computeBurnTrend(11_000, 10_000, 3)).toBe('stable')
  })

  it('current > avg by 10.01% → accelerating', () => {
    expect(computeBurnTrend(11_001, 10_000, 3)).toBe('accelerating')
  })

  it('current < avg by exactly 10% (ratio=0.9) → stable (boundary not crossed)', () => {
    expect(computeBurnTrend(9_000, 10_000, 3)).toBe('stable')
  })

  it('current < avg by 10.01% → decelerating', () => {
    expect(computeBurnTrend(8_999, 10_000, 3)).toBe('decelerating')
  })

  it('current = 0, avgBurn > 0 → decelerating (ratio = 0)', () => {
    expect(computeBurnTrend(0, 10_000, 3)).toBe('decelerating')
  })

  it('very large current burn vs small avg → accelerating', () => {
    expect(computeBurnTrend(1_000_000, 10_000, 3)).toBe('accelerating')
  })

  it('monthCount=10, ratio=0.85 → decelerating', () => {
    expect(computeBurnTrend(8_500, 10_000, 10)).toBe('decelerating')
  })

  it('monthCount=10, ratio=1.15 → accelerating', () => {
    expect(computeBurnTrend(11_500, 10_000, 10)).toBe('accelerating')
  })
})

// ── computeRunway — additional parameter sweep ────────────────────────────────

describe('computeRunway — additional parameter sweep', () => {
  it('cashBalance=1, avgNetBurn=1 → 1 month', () => {
    expect(computeRunway(1, 1)).toBeCloseTo(1, 2)
  })

  it('cashBalance=1_000_000, avgNetBurn=1 → 1_000_000 months', () => {
    expect(computeRunway(1_000_000, 1)).toBeCloseTo(1_000_000, 0)
  })

  it('cashBalance=0 → null', () => {
    expect(computeRunway(0, 5_000)).toBeNull()
  })

  it('cashBalance=null → null', () => {
    expect(computeRunway(null, 5_000)).toBeNull()
  })

  it('avgNetBurn=0.01 → very long runway', () => {
    const result = computeRunway(100, 0.01)
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(10_000, 0)
  })

  it('cashBalance=10, avgNetBurn=100 → 0.1 months', () => {
    expect(computeRunway(10, 100)).toBeCloseTo(0.1, 2)
  })

  it('negative avgNetBurn (profit > burn) → null', () => {
    expect(computeRunway(500_000, -20_000)).toBeNull()
  })

  it('round2 applied: 100_000 / 30_000 = 3.3333... → 3.33', () => {
    const result = computeRunway(100_000, 30_000)
    expect(result).toBeCloseTo(3.33, 1)
  })
})

// ── findPeakBurnMonth — additional ───────────────────────────────────────────

describe('findPeakBurnMonth — additional edge cases', () => {
  it('single month returns its label and gross_burn_try', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-05', label: 'Mayıs 2026', gross_burn_try: 77_000, revenue_try: 50_000, net_burn_try: 27_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Mayıs 2026')
    expect(result.try).toBe(77_000)
  })

  it('uses gross_burn_try not net_burn_try for peak', () => {
    // Month A has lower gross but higher net; Month B should win on gross
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 30_000, revenue_try: 1_000,  net_burn_try: 29_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 50_000, revenue_try: 40_000, net_burn_try: 10_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(50_000)
  })

  it('three equal burns → first month label returned', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-03', label: 'Mart 2026',   gross_burn_try: 20_000, revenue_try: 0, net_burn_try: 20_000, cash_balance_try: null },
      { month: '2026-02', label: 'Şubat 2026',  gross_burn_try: 20_000, revenue_try: 0, net_burn_try: 20_000, cash_balance_try: null },
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 20_000, revenue_try: 0, net_burn_try: 20_000, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Mart 2026')
  })

  it('empty array returns null for both fields', () => {
    const result = findPeakBurnMonth([])
    expect(result.month).toBeNull()
    expect(result.try).toBeNull()
  })

  it('peak with 0 gross_burn in some months', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 0,      revenue_try: 100, net_burn_try: -100, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 1_000,  revenue_try: 500, net_burn_try: 500,  cash_balance_try: null },
      { month: '2025-11', label: 'Kasım 2025',  gross_burn_try: 0,      revenue_try: 200, net_burn_try: -200, cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Aralık 2025')
    expect(result.try).toBe(1_000)
  })

  it('two months — earlier higher burn wins', () => {
    const months: MonthlyBurnData[] = [
      { month: '2026-01', label: 'Ocak 2026',   gross_burn_try: 40_000, revenue_try: 20_000, net_burn_try: 20_000, cash_balance_try: null },
      { month: '2025-12', label: 'Aralık 2025', gross_burn_try: 20_000, revenue_try: 20_000, net_burn_try: 0,      cash_balance_try: null },
    ]
    const result = findPeakBurnMonth(months)
    expect(result.month).toBe('Ocak 2026')
  })
})
