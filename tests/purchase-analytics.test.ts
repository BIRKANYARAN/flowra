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
})
