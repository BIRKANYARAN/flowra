// tests/proforma-pipeline-pure.test.ts
//
// Pure function tests for the proforma pipeline helpers added to
// lib/services/finance/pricing-intelligence.service.ts
//
//   computeConversionRate
//   computeAvgDealSize
//   classifyPipelineHealth
//   computePortfolioDiscountPressure

import { describe, it, expect } from 'vitest'
import {
  computeConversionRate,
  computeAvgDealSize,
  classifyPipelineHealth,
  computePortfolioDiscountPressure,
} from '../lib/services/finance/pricing-intelligence.service'

// ── computeConversionRate ─────────────────────────────────────────────────────

describe('computeConversionRate', () => {
  it('returns 0 when total is 0', () => {
    expect(computeConversionRate(0, 0)).toBe(0)
  })

  it('returns 0 when converted is 0 but total > 0', () => {
    expect(computeConversionRate(0, 10)).toBe(0)
  })

  it('returns 100 when all proformas are converted', () => {
    expect(computeConversionRate(10, 10)).toBe(100)
  })

  it('computes 50% for half converted', () => {
    expect(computeConversionRate(5, 10)).toBe(50)
  })

  it('computes 25% correctly', () => {
    expect(computeConversionRate(1, 4)).toBe(25)
  })

  it('computes fractional rates correctly', () => {
    expect(computeConversionRate(1, 3)).toBeCloseTo(33.333, 2)
  })

  it('never returns negative value', () => {
    // converted = 0 always yields >= 0
    expect(computeConversionRate(0, 100)).toBeGreaterThanOrEqual(0)
  })

  it('handles large numbers without overflow', () => {
    expect(computeConversionRate(1_000_000, 5_000_000)).toBe(20)
  })

  it('returns proportional value for 1 out of 8', () => {
    expect(computeConversionRate(1, 8)).toBeCloseTo(12.5, 5)
  })
})

// ── computeAvgDealSize ────────────────────────────────────────────────────────

describe('computeAvgDealSize', () => {
  it('returns 0 when dealCount is 0', () => {
    expect(computeAvgDealSize(1_000_000, 0)).toBe(0)
  })

  it('returns 0 when both args are 0', () => {
    expect(computeAvgDealSize(0, 0)).toBe(0)
  })

  it('computes correct average for equal deals', () => {
    expect(computeAvgDealSize(300_000, 3)).toBe(100_000)
  })

  it('computes fractional deal size', () => {
    expect(computeAvgDealSize(100, 3)).toBeCloseTo(33.333, 2)
  })

  it('handles single deal', () => {
    expect(computeAvgDealSize(85_000, 1)).toBe(85_000)
  })

  it('handles large deal portfolio', () => {
    expect(computeAvgDealSize(1_200_000, 8)).toBe(150_000)
  })

  it('returns positive when revenue > 0 and count > 0', () => {
    expect(computeAvgDealSize(500, 7)).toBeGreaterThan(0)
  })

  it('result * dealCount approximates totalRevenue', () => {
    const total = 750_000
    const count = 12
    const avg = computeAvgDealSize(total, count)
    expect(avg * count).toBeCloseTo(total, 5)
  })
})

// ── classifyPipelineHealth ────────────────────────────────────────────────────

describe('classifyPipelineHealth', () => {
  // strong: conversion > 40 AND cycle < 14
  it('classifies as strong when conversion > 40 and cycle < 14', () => {
    expect(classifyPipelineHealth(41, 13)).toBe('strong')
  })

  it('classifies as strong at exact boundaries (just over 40, just under 14)', () => {
    expect(classifyPipelineHealth(41, 13)).toBe('strong')
  })

  it('does NOT classify as strong when conversion = 40', () => {
    // boundary: must be strictly > 40
    const result = classifyPipelineHealth(40, 10)
    expect(result).not.toBe('strong')
  })

  it('does NOT classify as strong when cycle = 14', () => {
    // boundary: must be strictly < 14
    const result = classifyPipelineHealth(50, 14)
    expect(result).not.toBe('strong')
  })

  // healthy: conversion > 25 AND cycle < 30
  it('classifies as healthy when conversion > 25 and cycle < 30 (not strong)', () => {
    expect(classifyPipelineHealth(30, 20)).toBe('healthy')
  })

  it('classifies as healthy at exact lower-bound edge', () => {
    expect(classifyPipelineHealth(26, 29)).toBe('healthy')
  })

  it('does NOT classify as healthy when conversion = 25', () => {
    // 25 is not strictly > 25
    const result = classifyPipelineHealth(25, 20)
    expect(result).not.toBe('healthy')
  })

  // stalled: conversion < 15 OR cycle > 60
  it('classifies as stalled when conversion < 15', () => {
    expect(classifyPipelineHealth(10, 20)).toBe('stalled')
  })

  it('classifies as stalled when cycle > 60', () => {
    expect(classifyPipelineHealth(30, 61)).toBe('stalled')
  })

  it('classifies as stalled when both conditions are true', () => {
    expect(classifyPipelineHealth(5, 90)).toBe('stalled')
  })

  it('does NOT classify as stalled when conversion = 15 and cycle = 60', () => {
    // 15 is not < 15; 60 is not > 60 → should be weak
    const result = classifyPipelineHealth(15, 60)
    expect(result).not.toBe('stalled')
  })

  // weak: everything else
  it('classifies as weak for mid-range values', () => {
    expect(classifyPipelineHealth(20, 40)).toBe('weak')
  })

  it('classifies as weak at conversion=25 cycle=60', () => {
    expect(classifyPipelineHealth(25, 60)).toBe('weak')
  })
})

// ── computePortfolioDiscountPressure ──────────────────────────────────────────

describe('computePortfolioDiscountPressure', () => {
  it('returns 0 for empty array', () => {
    expect(computePortfolioDiscountPressure([])).toBe(0)
  })

  it('returns 0 when all list_prices are 0', () => {
    const items = [
      { list_price: 0, effective_price: 0 },
      { list_price: 0, effective_price: 0 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBe(0)
  })

  it('returns 0 when no discount is applied (effective = list)', () => {
    const items = [
      { list_price: 100, effective_price: 100 },
      { list_price: 200, effective_price: 200 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBe(0)
  })

  it('returns 100 when effective_price is 0 for all items', () => {
    const items = [
      { list_price: 100, effective_price: 0 },
      { list_price: 200, effective_price: 0 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBe(100)
  })

  it('computes uniform 10% discount correctly', () => {
    const items = [
      { list_price: 100, effective_price: 90 },
      { list_price: 200, effective_price: 180 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBeCloseTo(10, 5)
  })

  it('computes weighted average when items have different list prices', () => {
    // item1: list=100, eff=80 → discount=20
    // item2: list=400, eff=400 → discount=0
    // weighted: 20/500 * 100 = 4%
    const items = [
      { list_price: 100, effective_price: 80 },
      { list_price: 400, effective_price: 400 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBeCloseTo(4, 5)
  })

  it('weights larger deals more heavily', () => {
    // small deal: 50% off a 100 item
    // large deal: 5% off a 1000 item
    // weighted: (50 + 50) / 1100 * 100 = 9.09%
    const items = [
      { list_price: 100,  effective_price: 50 },
      { list_price: 1000, effective_price: 950 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBeCloseTo(9.09, 1)
  })

  it('treats effective_price > list_price as 0 discount (no negative pressure)', () => {
    const items = [
      { list_price: 100, effective_price: 120 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBe(0)
  })

  it('handles single item with exact 25% discount', () => {
    const items = [
      { list_price: 200, effective_price: 150 },
    ]
    expect(computePortfolioDiscountPressure(items)).toBeCloseTo(25, 5)
  })

  it('result is always in range [0, 100]', () => {
    const items = [
      { list_price: 500, effective_price: 0 },
      { list_price: 300, effective_price: 300 },
    ]
    const result = computePortfolioDiscountPressure(items)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(100)
  })
})
