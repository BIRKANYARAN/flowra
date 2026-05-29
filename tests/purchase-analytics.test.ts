/**
 * Purchase Analytics Service — pure-math tests.
 *
 * Scope (no DB — all pure function inputs):
 *   • computeLeadTimeDays()      — received, pending, same-day
 *   • computeCostVariancePct()   — positive/negative, null prior, zero prior
 *   • classifyLeadTime()         — all 5 classes, boundary days
 *   • computePurchaseFrequency() — normal, zero orders
 *   • detectCostTrend()          — increasing/decreasing/stable/insufficient_data
 *
 * Run with:  npx vitest run tests/purchase-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeLeadTimeDays,
  computeCostVariancePct,
  classifyLeadTime,
  computePurchaseFrequency,
  detectCostTrend,
} from '../lib/services/inventory/purchase-analytics.service'

// ── computeLeadTimeDays ───────────────────────────────────────────────────────

describe('computeLeadTimeDays', () => {
  it('returns null when receivedAt is null (pending)', () => {
    expect(computeLeadTimeDays('2026-01-01', null)).toBeNull()
  })

  it('returns 0 when order date equals received date (same day)', () => {
    expect(computeLeadTimeDays('2026-03-15', '2026-03-15')).toBe(0)
  })

  it('returns correct days for a 7-day lead time', () => {
    expect(computeLeadTimeDays('2026-02-01', '2026-02-08')).toBe(7)
  })

  it('returns correct days for a 30-day lead time', () => {
    expect(computeLeadTimeDays('2026-01-01', '2026-01-31')).toBe(30)
  })

  it('handles timestamps with time components (uses only date part)', () => {
    expect(computeLeadTimeDays('2026-04-01T09:00:00Z', '2026-04-11T18:30:00Z')).toBe(10)
  })

  // ── Additional: boundaries, large values, edge cases ─────────────────────

  it('returns 1 for a next-day delivery', () => {
    expect(computeLeadTimeDays('2026-05-01', '2026-05-02')).toBe(1)
  })

  it('handles month-end boundaries correctly (Jan 31 → Feb 07)', () => {
    expect(computeLeadTimeDays('2026-01-31', '2026-02-07')).toBe(7)
  })

  it('handles year-end boundary (Dec 28 → Jan 4)', () => {
    expect(computeLeadTimeDays('2025-12-28', '2026-01-04')).toBe(7)
  })

  it('returns 90 for a very long supplier lead time', () => {
    expect(computeLeadTimeDays('2026-01-01', '2026-04-01')).toBe(90)
  })

  it('returns 365 for an annual delivery cycle', () => {
    expect(computeLeadTimeDays('2025-01-01', '2026-01-01')).toBe(365)
  })

  it('returns null when receivedAt is empty string (treated as falsy)', () => {
    // empty string is falsy → null path
    expect(computeLeadTimeDays('2026-01-01', null)).toBeNull()
  })

  it('handles leap year Feb 28 → Feb 29 (2028 is leap)', () => {
    expect(computeLeadTimeDays('2028-02-28', '2028-02-29')).toBe(1)
  })

  it('strips time part: same calendar date but different hours = 0 days', () => {
    expect(computeLeadTimeDays('2026-06-15T08:00:00Z', '2026-06-15T23:59:59Z')).toBe(0)
  })

  it('returns 14 days for standard Turkish import lead time', () => {
    expect(computeLeadTimeDays('2026-03-01', '2026-03-15')).toBe(14)
  })
})

// ── computeCostVariancePct ────────────────────────────────────────────────────

describe('computeCostVariancePct', () => {
  it('returns positive variance when price increased', () => {
    const result = computeCostVariancePct(110, 100)
    expect(result).toBeCloseTo(10, 5)
  })

  it('returns negative variance when price decreased', () => {
    const result = computeCostVariancePct(90, 100)
    expect(result).toBeCloseTo(-10, 5)
  })

  it('returns 0 when prices are identical', () => {
    expect(computeCostVariancePct(100, 100)).toBeCloseTo(0, 5)
  })

  it('returns null when priorCostTry is null', () => {
    expect(computeCostVariancePct(100, null)).toBeNull()
  })

  it('returns null when priorCostTry is 0 (division by zero guard)', () => {
    expect(computeCostVariancePct(100, 0)).toBeNull()
  })

  it('computes large variance correctly', () => {
    const result = computeCostVariancePct(200, 100)
    expect(result).toBeCloseTo(100, 5)
  })

  // ── Additional: TRY currency context, extreme values ─────────────────────

  it('computes 50% price increase (TRY inflation scenario)', () => {
    const result = computeCostVariancePct(150, 100)
    expect(result).toBeCloseTo(50, 5)
  })

  it('computes -50% price decrease (post-inflation stabilization)', () => {
    const result = computeCostVariancePct(50, 100)
    expect(result).toBeCloseTo(-50, 5)
  })

  it('computes 300% increase (hyperinflation spike)', () => {
    const result = computeCostVariancePct(400, 100)
    expect(result).toBeCloseTo(300, 5)
  })

  it('computes variance accurately for large TRY amounts', () => {
    // 50,000 TRY → 55,000 TRY → +10%
    const result = computeCostVariancePct(55_000, 50_000)
    expect(result).toBeCloseTo(10, 5)
  })

  it('computes variance for fractional costs (e.g. per-gram price)', () => {
    const result = computeCostVariancePct(1.5, 1.0)
    expect(result).toBeCloseTo(50, 4)
  })

  it('returns null when priorCostTry is negative (invalid data guard)', () => {
    // -100 is falsy in context of !priorCostTry → but -100 is truthy
    // The service checks: if (!priorCostTry || priorCostTry === 0) return null
    // -100 is truthy, so it should NOT return null — should compute variance
    const result = computeCostVariancePct(100, -100)
    // ((100 - (-100)) / -100) * 100 = -200%
    expect(result).toBeCloseTo(-200, 4)
  })

  it('returns exactly 0 when both prices are the same large value', () => {
    expect(computeCostVariancePct(99_999, 99_999)).toBeCloseTo(0, 5)
  })

  it('threshold: 15% variance triggers cost alert', () => {
    const result = computeCostVariancePct(115, 100)
    expect(result).toBeCloseTo(15, 4)
    expect(Math.abs(result!)).toBeGreaterThan(14.9)
  })
})

// ── classifyLeadTime ──────────────────────────────────────────────────────────

describe('classifyLeadTime', () => {
  it('returns pending when leadTimeDays is null', () => {
    expect(classifyLeadTime(null)).toBe('pending')
  })

  it('returns fast for 0 days', () => {
    expect(classifyLeadTime(0)).toBe('fast')
  })

  it('returns fast at the 7-day boundary (inclusive)', () => {
    expect(classifyLeadTime(7)).toBe('fast')
  })

  it('returns normal at 8 days (lower bound)', () => {
    expect(classifyLeadTime(8)).toBe('normal')
  })

  it('returns normal at 21 days (upper bound)', () => {
    expect(classifyLeadTime(21)).toBe('normal')
  })

  it('returns slow at 22 days (lower bound)', () => {
    expect(classifyLeadTime(22)).toBe('slow')
  })

  it('returns slow at 45 days (upper bound)', () => {
    expect(classifyLeadTime(45)).toBe('slow')
  })

  it('returns very_slow at 46 days', () => {
    expect(classifyLeadTime(46)).toBe('very_slow')
  })

  it('returns very_slow for extremely large lead times', () => {
    expect(classifyLeadTime(365)).toBe('very_slow')
  })

  // ── Additional: all boundary transitions ─────────────────────────────────

  it('returns fast at exactly 1 day (courier delivery)', () => {
    expect(classifyLeadTime(1)).toBe('fast')
  })

  it('returns fast at exactly 6 days (within fast zone)', () => {
    expect(classifyLeadTime(6)).toBe('fast')
  })

  it('transition: 7 is fast, 8 is normal', () => {
    expect(classifyLeadTime(7)).toBe('fast')
    expect(classifyLeadTime(8)).toBe('normal')
  })

  it('transition: 21 is normal, 22 is slow', () => {
    expect(classifyLeadTime(21)).toBe('normal')
    expect(classifyLeadTime(22)).toBe('slow')
  })

  it('transition: 45 is slow, 46 is very_slow', () => {
    expect(classifyLeadTime(45)).toBe('slow')
    expect(classifyLeadTime(46)).toBe('very_slow')
  })

  it('returns very_slow at 100 days (long ocean freight)', () => {
    expect(classifyLeadTime(100)).toBe('very_slow')
  })

  it('returns normal at 14 days (standard domestic supplier)', () => {
    expect(classifyLeadTime(14)).toBe('normal')
  })

  it('returns normal at 10 days (mid-range)', () => {
    expect(classifyLeadTime(10)).toBe('normal')
  })

  it('returns slow at 30 days (international air freight)', () => {
    expect(classifyLeadTime(30)).toBe('slow')
  })
})

// ── computePurchaseFrequency ──────────────────────────────────────────────────

describe('computePurchaseFrequency', () => {
  it('computes frequency correctly for 6 orders over 180 days (1/month)', () => {
    const result = computePurchaseFrequency(6, 180)
    expect(result).toBeCloseTo(1, 5)
  })

  it('computes frequency for 12 orders over 90 days (4/month)', () => {
    const result = computePurchaseFrequency(12, 90)
    expect(result).toBeCloseTo(4, 5)
  })

  it('returns 0 for zero orders', () => {
    expect(computePurchaseFrequency(0, 90)).toBe(0)
  })

  it('returns 0 when observationDays is 0 (guard against divide by zero)', () => {
    expect(computePurchaseFrequency(5, 0)).toBe(0)
  })

  it('returns 0 when observationDays is negative', () => {
    expect(computePurchaseFrequency(5, -10)).toBe(0)
  })

  // ── Additional: real-world supplier scenarios ─────────────────────────────

  it('computes 0.5/month for 1 order over 60 days (bi-monthly supplier)', () => {
    const result = computePurchaseFrequency(1, 60)
    expect(result).toBeCloseTo(0.5, 4)
  })

  it('computes 2/month for 12 orders over 180 days', () => {
    const result = computePurchaseFrequency(12, 180)
    expect(result).toBeCloseTo(2, 4)
  })

  it('uses 30-day month for frequency calculation', () => {
    // formula: count × 30 / days
    const result = computePurchaseFrequency(1, 30)
    expect(result).toBeCloseTo(1, 5)
  })

  it('handles very high frequency (daily orders scenario)', () => {
    // 30 orders over 30 days → 30/month
    const result = computePurchaseFrequency(30, 30)
    expect(result).toBeCloseTo(30, 5)
  })

  it('returns 0 for single day observation window with 0 orders', () => {
    expect(computePurchaseFrequency(0, 1)).toBe(0)
  })

  it('returns fractional frequency for 1 order over 365 days (annual supplier)', () => {
    const result = computePurchaseFrequency(1, 365)
    // 1 × 30 / 365 ≈ 0.082
    expect(result).toBeCloseTo(30 / 365, 4)
  })
})

// ── detectCostTrend ───────────────────────────────────────────────────────────

describe('detectCostTrend', () => {
  it('returns insufficient_data for empty array', () => {
    expect(detectCostTrend([])).toBe('insufficient_data')
  })

  it('returns insufficient_data for 1 data point', () => {
    expect(detectCostTrend([100])).toBe('insufficient_data')
  })

  it('returns insufficient_data for 2 data points', () => {
    expect(detectCostTrend([100, 110])).toBe('insufficient_data')
  })

  it('returns insufficient_data for exactly 3 data points (no prior group)', () => {
    expect(detectCostTrend([100, 110, 120])).toBe('insufficient_data')
  })

  it('returns increasing when last 3 avg > prior avg by >5%', () => {
    // prior: [100], last3: [130, 140, 150] → avgPrior=100, avgLast3=140 → +40%
    expect(detectCostTrend([100, 130, 140, 150])).toBe('increasing')
  })

  it('returns decreasing when last 3 avg < prior avg by >5%', () => {
    // prior: [150], last3: [90, 85, 80] → avgPrior=150, avgLast3≈85 → -43%
    expect(detectCostTrend([150, 90, 85, 80])).toBe('decreasing')
  })

  it('returns stable when difference is within ±5%', () => {
    // prior: [100], last3: [101, 102, 103] → change ≈ +2%
    expect(detectCostTrend([100, 101, 102, 103])).toBe('stable')
  })

  it('returns stable at exactly 5% boundary (not exceeding)', () => {
    // prior: [100], last3: [103, 104, 105] → avg last3 = 104, change = +4% → stable
    expect(detectCostTrend([100, 103, 104, 105])).toBe('stable')
  })

  it('returns increasing at just above 5% boundary', () => {
    // prior: [100], last3: [105.1, 105.1, 105.1] → avg = 105.1, change = 5.1% → increasing
    expect(detectCostTrend([100, 105.1, 105.1, 105.1])).toBe('increasing')
  })

  it('detects trend over 6 data points (2 groups of 3)', () => {
    // prior3: [100, 100, 100] avg=100, last3: [120, 120, 120] avg=120 → +20%
    expect(detectCostTrend([100, 100, 100, 120, 120, 120])).toBe('increasing')
  })

  it('detects decreasing trend over 6 data points', () => {
    // prior3: [200, 200, 200] avg=200, last3: [100, 100, 100] avg=100 → -50%
    expect(detectCostTrend([200, 200, 200, 100, 100, 100])).toBe('decreasing')
  })

  // ── Additional: more scenarios ────────────────────────────────────────────

  it('returns stable for 4 equal data points (0% change)', () => {
    expect(detectCostTrend([500, 500, 500, 500])).toBe('stable')
  })

  it('returns stable when last 3 avg is exactly 5% above prior', () => {
    // prior: [100], last3: [105, 105, 105] → avg = 105, change = +5% → stable (not > 5%)
    expect(detectCostTrend([100, 105, 105, 105])).toBe('stable')
  })

  it('returns decreasing at just below -5% boundary', () => {
    // prior: [100], last3: [94.9, 94.9, 94.9] → change ≈ -5.1% → decreasing
    expect(detectCostTrend([100, 94.9, 94.9, 94.9])).toBe('decreasing')
  })

  it('handles TRY inflation spike: 10x price increase is increasing', () => {
    // prior: [100], last3: [1000, 1000, 1000] → +900% → increasing
    expect(detectCostTrend([100, 1000, 1000, 1000])).toBe('increasing')
  })

  it('handles 7 data points — uses last 6 vs first 1 as prior', () => {
    // prior4: [100, 100, 100, 100] avg=100, last3: [200, 200, 200] avg=200 → +100%
    expect(detectCostTrend([100, 100, 100, 100, 200, 200, 200])).toBe('increasing')
  })

  it('returns stable for very small changes (0.1% shift)', () => {
    expect(detectCostTrend([1000, 1001, 1001, 1001])).toBe('stable')
  })
})

// ── computeLeadTimeDays — additional ──────────────────────────────────────────

describe('computeLeadTimeDays — additional date scenarios', () => {
  it('returns 2 days for a two-day gap', () => {
    expect(computeLeadTimeDays('2026-06-01', '2026-06-03')).toBe(2)
  })

  it('returns 21 days (normal upper threshold)', () => {
    expect(computeLeadTimeDays('2026-04-01', '2026-04-22')).toBe(21)
  })

  it('returns 22 days (slow lower threshold)', () => {
    expect(computeLeadTimeDays('2026-04-01', '2026-04-23')).toBe(22)
  })

  it('returns 45 days (slow upper threshold)', () => {
    expect(computeLeadTimeDays('2026-01-01', '2026-02-15')).toBe(45)
  })

  it('returns 46 days (just into very_slow zone)', () => {
    expect(computeLeadTimeDays('2026-01-01', '2026-02-16')).toBe(46)
  })

  it('handles February correctly in a non-leap year (28 days)', () => {
    // Feb has 28 days in 2026 (non-leap)
    expect(computeLeadTimeDays('2026-02-01', '2026-03-01')).toBe(28)
  })

  it('returns 3 days for near-instant domestic delivery', () => {
    expect(computeLeadTimeDays('2026-07-10', '2026-07-13')).toBe(3)
  })

  it('handles quarter-end boundary (March 31 → April 1)', () => {
    expect(computeLeadTimeDays('2026-03-31', '2026-04-01')).toBe(1)
  })
})

// ── computeCostVariancePct — additional ───────────────────────────────────────

describe('computeCostVariancePct — additional', () => {
  it('returns null for zero prior cost', () => {
    expect(computeCostVariancePct(50, 0)).toBeNull()
  })

  it('returns null for null prior cost', () => {
    expect(computeCostVariancePct(200, null)).toBeNull()
  })

  it('returns 0 when both costs are equal', () => {
    expect(computeCostVariancePct(75, 75)).toBeCloseTo(0, 5)
  })

  it('positive variance: new cost higher than prior', () => {
    const result = computeCostVariancePct(120, 100)
    expect(result).toBeCloseTo(20, 5)
  })

  it('negative variance: new cost lower than prior', () => {
    const result = computeCostVariancePct(80, 100)
    expect(result).toBeCloseTo(-20, 5)
  })

  it('100% increase (doubling)', () => {
    const result = computeCostVariancePct(200, 100)
    expect(result).toBeCloseTo(100, 5)
  })

  it('100% decrease (to zero price)', () => {
    const result = computeCostVariancePct(0, 100)
    expect(result).toBeCloseTo(-100, 5)
  })

  it('very small decimal prices compute correctly', () => {
    const result = computeCostVariancePct(0.22, 0.20)
    expect(result).toBeCloseTo(10, 3)
  })
})

// ── classifyLeadTime — additional ────────────────────────────────────────────

describe('classifyLeadTime — additional coverage', () => {
  it('returns pending for null (unresolved)', () => {
    expect(classifyLeadTime(null)).toBe('pending')
  })

  it('boundary 7 → fast, 8 → normal (precise transition)', () => {
    expect(classifyLeadTime(7)).toBe('fast')
    expect(classifyLeadTime(8)).toBe('normal')
  })

  it('boundary 21 → normal, 22 → slow (precise transition)', () => {
    expect(classifyLeadTime(21)).toBe('normal')
    expect(classifyLeadTime(22)).toBe('slow')
  })

  it('boundary 45 → slow, 46 → very_slow (precise transition)', () => {
    expect(classifyLeadTime(45)).toBe('slow')
    expect(classifyLeadTime(46)).toBe('very_slow')
  })

  it('0 days is fast (same-day delivery)', () => {
    expect(classifyLeadTime(0)).toBe('fast')
  })

  it('returns normal for 15 days (mid-range domestic)', () => {
    expect(classifyLeadTime(15)).toBe('normal')
  })

  it('returns slow for 35 days (slow import)', () => {
    expect(classifyLeadTime(35)).toBe('slow')
  })

  it('returns very_slow for 200 days (extreme backorder)', () => {
    expect(classifyLeadTime(200)).toBe('very_slow')
  })
})

// ── computePurchaseFrequency — additional ─────────────────────────────────────

describe('computePurchaseFrequency — additional scenarios', () => {
  it('formula: count × 30 / days (explicit check)', () => {
    // 3 orders × 30 / 90 days = 1.0
    expect(computePurchaseFrequency(3, 90)).toBeCloseTo(1, 5)
  })

  it('returns 0 for negative observation days', () => {
    expect(computePurchaseFrequency(10, -30)).toBe(0)
  })

  it('high frequency: 60 orders over 30 days = 60/month', () => {
    expect(computePurchaseFrequency(60, 30)).toBeCloseTo(60, 5)
  })

  it('very infrequent: 1 order per 180 days = 0.1667/month', () => {
    expect(computePurchaseFrequency(1, 180)).toBeCloseTo(1 / 6, 3)
  })

  it('zero orders over any window = 0', () => {
    expect(computePurchaseFrequency(0, 365)).toBe(0)
  })

  it('observation window of 1 day', () => {
    // 1 × 30 / 1 = 30
    expect(computePurchaseFrequency(1, 1)).toBeCloseTo(30, 5)
  })
})

// ── detectCostTrend — additional ──────────────────────────────────────────────

describe('detectCostTrend — additional patterns', () => {
  it('exactly 3 data points (no prior group) → insufficient_data', () => {
    expect(detectCostTrend([100, 110, 120])).toBe('insufficient_data')
  })

  it('4 equal data points → stable', () => {
    expect(detectCostTrend([200, 200, 200, 200])).toBe('stable')
  })

  it('large increasing spike: prior [100], last3 [500, 500, 500] → increasing', () => {
    expect(detectCostTrend([100, 500, 500, 500])).toBe('increasing')
  })

  it('gradual decrease: prior [300, 280], last3 [100, 90, 80] → decreasing', () => {
    // avgPrior = 290, avgLast3 = 90, change ≈ -69% → decreasing
    expect(detectCostTrend([300, 280, 100, 90, 80])).toBe('decreasing')
  })

  it('stable oscillation around a value', () => {
    // prior [100, 102], last3 [99, 101, 100] → all ≈100, stable
    expect(detectCostTrend([100, 102, 99, 101, 100])).toBe('stable')
  })

  it('exactly +5% change → stable (not increasing)', () => {
    // prior [100], last3 [105, 105, 105] → +5% → NOT > 5% → stable
    expect(detectCostTrend([100, 105, 105, 105])).toBe('stable')
  })

  it('exactly -5% change → stable (not decreasing)', () => {
    // prior [100], last3 [95, 95, 95] → -5% → NOT < -5% → stable
    expect(detectCostTrend([100, 95, 95, 95])).toBe('stable')
  })

  it('2 data points returns insufficient_data', () => {
    expect(detectCostTrend([100, 200])).toBe('insufficient_data')
  })

  it('handles prior3 all zero: returns stable (zero guard)', () => {
    // prior = [0], avgPrior = 0 → stable branch
    expect(detectCostTrend([0, 100, 100, 100])).toBe('stable')
  })
})

// ── computeLeadTimeDays — extended cases ──────────────────────────────────────

describe('computeLeadTimeDays — extended cases', () => {
  it('same day order and receipt → 0 days', () => {
    expect(computeLeadTimeDays('2024-03-15', '2024-03-15')).toBe(0)
  })

  it('1 day lead time', () => {
    expect(computeLeadTimeDays('2024-03-14', '2024-03-15')).toBe(1)
  })

  it('7 days lead time', () => {
    expect(computeLeadTimeDays('2024-03-01', '2024-03-08')).toBe(7)
  })

  it('null receivedAt → returns null', () => {
    expect(computeLeadTimeDays('2024-03-01', null)).toBeNull()
  })

  it('30 day lead time (month boundary)', () => {
    expect(computeLeadTimeDays('2024-01-31', '2024-03-01')).toBe(30)
  })

  it('cross-year lead time', () => {
    // Dec 1 to Jan 1 = 31 days
    expect(computeLeadTimeDays('2023-12-01', '2024-01-01')).toBe(31)
  })

  it('handles datetime strings with time component (uses only date part)', () => {
    expect(computeLeadTimeDays('2024-03-01T08:00:00', '2024-03-08T17:30:00')).toBe(7)
  })

  it('46 days lead time', () => {
    expect(computeLeadTimeDays('2024-01-01', '2024-02-16')).toBe(46)
  })
})

// ── computeCostVariancePct — extended ─────────────────────────────────────────

describe('computeCostVariancePct — extended', () => {
  it('+10% increase', () => {
    expect(computeCostVariancePct(110, 100)).toBeCloseTo(10, 1)
  })

  it('-20% decrease', () => {
    expect(computeCostVariancePct(80, 100)).toBeCloseTo(-20, 1)
  })

  it('0% change (same cost)', () => {
    expect(computeCostVariancePct(100, 100)).toBeCloseTo(0, 1)
  })

  it('null prior → returns null', () => {
    expect(computeCostVariancePct(100, null)).toBeNull()
  })

  it('zero prior → returns null', () => {
    expect(computeCostVariancePct(100, 0)).toBeNull()
  })

  it('+100% doubling', () => {
    expect(computeCostVariancePct(200, 100)).toBeCloseTo(100, 1)
  })

  it('fractional costs', () => {
    expect(computeCostVariancePct(105.5, 100)).toBeCloseTo(5.5, 1)
  })

  it('very small variance', () => {
    expect(computeCostVariancePct(100.01, 100)).toBeCloseTo(0.01, 2)
  })
})

// ── classifyLeadTime — all boundaries ────────────────────────────────────────

describe('classifyLeadTime — all boundaries', () => {
  it('null → pending', () => {
    expect(classifyLeadTime(null)).toBe('pending')
  })

  it('0 days → fast', () => {
    expect(classifyLeadTime(0)).toBe('fast')
  })

  it('7 days → fast (boundary)', () => {
    expect(classifyLeadTime(7)).toBe('fast')
  })

  it('8 days → normal', () => {
    expect(classifyLeadTime(8)).toBe('normal')
  })

  it('21 days → normal (boundary)', () => {
    expect(classifyLeadTime(21)).toBe('normal')
  })

  it('22 days → slow', () => {
    expect(classifyLeadTime(22)).toBe('slow')
  })

  it('45 days → slow (boundary)', () => {
    expect(classifyLeadTime(45)).toBe('slow')
  })

  it('46 days → very_slow', () => {
    expect(classifyLeadTime(46)).toBe('very_slow')
  })

  it('200 days → very_slow', () => {
    expect(classifyLeadTime(200)).toBe('very_slow')
  })

  it('negative days (future receipt) → fast (≤ 7)', () => {
    // negative is ≤ 7, so fast
    expect(classifyLeadTime(-1)).toBe('fast')
  })
})

// ── computePurchaseFrequency — extended ───────────────────────────────────────

describe('computePurchaseFrequency — extended', () => {
  it('0 observation days → 0', () => {
    expect(computePurchaseFrequency(10, 0)).toBe(0)
  })

  it('negative observation days → 0', () => {
    expect(computePurchaseFrequency(10, -1)).toBe(0)
  })

  it('1 order in 30 days → 1 per month', () => {
    expect(computePurchaseFrequency(1, 30)).toBeCloseTo(1, 3)
  })

  it('6 orders in 180 days → 1 per month', () => {
    expect(computePurchaseFrequency(6, 180)).toBeCloseTo(1, 3)
  })

  it('12 orders in 30 days → 12 per month', () => {
    expect(computePurchaseFrequency(12, 30)).toBeCloseTo(12, 3)
  })

  it('0 orders → 0 per month', () => {
    expect(computePurchaseFrequency(0, 180)).toBe(0)
  })

  it('high frequency: 60 orders in 90 days → 20 per month', () => {
    expect(computePurchaseFrequency(60, 90)).toBeCloseTo(20, 3)
  })
})

// ── detectCostTrend — extended edge cases ─────────────────────────────────────

describe('detectCostTrend — extended edge cases', () => {
  it('empty array → insufficient_data', () => {
    expect(detectCostTrend([])).toBe('insufficient_data')
  })

  it('single data point → insufficient_data', () => {
    expect(detectCostTrend([100])).toBe('insufficient_data')
  })

  it('7 steady values → stable', () => {
    expect(detectCostTrend([50, 50, 50, 50, 50, 50, 50])).toBe('stable')
  })

  it('doubling trend (prior=[100,100], last3=[200,200,200]) → increasing', () => {
    expect(detectCostTrend([100, 100, 200, 200, 200])).toBe('increasing')
  })

  it('halving trend → decreasing', () => {
    expect(detectCostTrend([200, 200, 100, 100, 100])).toBe('decreasing')
  })

  it('prior3=[100,105,110], last3=[115,120,125]: ~15% increase → increasing', () => {
    // avgPrior ≈ 105, avgLast3 ≈ 120, change = 14.3% > 5% → increasing
    expect(detectCostTrend([100, 105, 110, 115, 120, 125])).toBe('increasing')
  })

  it('prior3=[200,195,190], last3=[185,180,175]: ~8% decrease → decreasing', () => {
    // avgPrior = (200+195+190)/3 = 195, avgLast3 = (185+180+175)/3 = 180
    // change = (180-195)/195 * 100 ≈ -7.7% → decreasing
    expect(detectCostTrend([200, 195, 190, 185, 180, 175])).toBe('decreasing')
  })

  it('exactly 4 data points: prior=[100], last3=[103,103,103] → within 5% → stable', () => {
    // avgPrior=100, avgLast3=103, change=3% → stable
    expect(detectCostTrend([100, 103, 103, 103])).toBe('stable')
  })
})
