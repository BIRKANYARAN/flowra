/**
 * FX Exposure Service — pure function tests.
 *
 * Tests all exported pure helpers:
 *   computeFxGainLoss
 *   computeFxExposureRatio
 *   classifyFxExposureRisk
 *   computeNaturalHedgeRatio
 *   computeNetFxExposure
 *
 * Run with:  npx vitest run tests/fx-exposure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeFxGainLoss,
  computeFxExposureRatio,
  classifyFxExposureRisk,
  computeNaturalHedgeRatio,
  computeNetFxExposure,
} from '../lib/services/finance/fx-exposure.service'

// ── computeFxGainLoss ─────────────────────────────────────────────────────────

describe('computeFxGainLoss', () => {

  it('gain: TRY weakened (current > entry) → positive result', () => {
    // 1000 USD at entry ₺32, current ₺38 → gain 6000
    const result = computeFxGainLoss(1000, 32, 38)
    expect(result).toBe(6000)
  })

  it('loss: TRY strengthened (current < entry) → negative result', () => {
    // 500 USD at entry ₺38, current ₺32 → loss -3000
    const result = computeFxGainLoss(500, 38, 32)
    expect(result).toBe(-3000)
  })

  it('zero change: same entry and current rate → zero gain/loss', () => {
    const result = computeFxGainLoss(1000, 35, 35)
    expect(result).toBe(0)
  })

  it('zero amount: no exposure → zero regardless of rates', () => {
    const result = computeFxGainLoss(0, 30, 40)
    expect(result).toBe(0)
  })

  it('EUR: gain when rate moves from 35 to 42 on 200 units', () => {
    // (42 - 35) × 200 = 1400
    const result = computeFxGainLoss(200, 35, 42)
    expect(result).toBe(1400)
  })

  it('GBP: fractional amounts compute correctly', () => {
    // 100 GBP, entry 45.50, current 47.25 → (47.25-45.50)×100 = 175
    const result = computeFxGainLoss(100, 45.5, 47.25)
    expect(result).toBe(175)
  })

})

// ── computeFxExposureRatio ────────────────────────────────────────────────────

describe('computeFxExposureRatio', () => {

  it('normal case: 30000 foreign out of 100000 total → 30%', () => {
    const result = computeFxExposureRatio(30000, 100000)
    expect(result).toBe(30)
  })

  it('100% foreign exposure → 100', () => {
    const result = computeFxExposureRatio(50000, 50000)
    expect(result).toBe(100)
  })

  it('zero total revenue → returns 0 (no division by zero)', () => {
    const result = computeFxExposureRatio(5000, 0)
    expect(result).toBe(0)
  })

  it('zero foreign revenue → returns 0', () => {
    const result = computeFxExposureRatio(0, 80000)
    expect(result).toBe(0)
  })

  it('small ratio rounds to 2 decimals', () => {
    const result = computeFxExposureRatio(1, 3)
    expect(result).toBe(33.33)
  })

})

// ── classifyFxExposureRisk ────────────────────────────────────────────────────

describe('classifyFxExposureRisk', () => {

  it('0% → minimal', () => {
    expect(classifyFxExposureRisk(0)).toBe('minimal')
  })

  it('9.99% → minimal (just below threshold)', () => {
    expect(classifyFxExposureRisk(9.99)).toBe('minimal')
  })

  it('10% → moderate (boundary — exactly at threshold)', () => {
    expect(classifyFxExposureRisk(10)).toBe('moderate')
  })

  it('20% → moderate', () => {
    expect(classifyFxExposureRisk(20)).toBe('moderate')
  })

  it('29.99% → moderate (just below elevated threshold)', () => {
    expect(classifyFxExposureRisk(29.99)).toBe('moderate')
  })

  it('30% → elevated (boundary)', () => {
    expect(classifyFxExposureRisk(30)).toBe('elevated')
  })

  it('45% → elevated', () => {
    expect(classifyFxExposureRisk(45)).toBe('elevated')
  })

  it('60% → elevated (boundary — exactly at upper threshold)', () => {
    expect(classifyFxExposureRisk(60)).toBe('elevated')
  })

  it('60.01% → high (just above elevated threshold)', () => {
    expect(classifyFxExposureRisk(60.01)).toBe('high')
  })

  it('80% → high', () => {
    expect(classifyFxExposureRisk(80)).toBe('high')
  })

  it('100% → high', () => {
    expect(classifyFxExposureRisk(100)).toBe('high')
  })

})

// ── computeNaturalHedgeRatio ──────────────────────────────────────────────────

describe('computeNaturalHedgeRatio', () => {

  it('perfectly hedged: expenses equal revenue → 100%', () => {
    const result = computeNaturalHedgeRatio(50000, 50000)
    expect(result).toBe(100)
  })

  it('50% hedged: expenses half of revenue → 50%', () => {
    const result = computeNaturalHedgeRatio(25000, 50000)
    expect(result).toBe(50)
  })

  it('no expenses → 0%', () => {
    const result = computeNaturalHedgeRatio(0, 40000)
    expect(result).toBe(0)
  })

  it('zero revenue → null (cannot compute ratio)', () => {
    const result = computeNaturalHedgeRatio(5000, 0)
    expect(result).toBeNull()
  })

  it('over-hedged: expenses > revenue → ratio > 100', () => {
    // 120 000 expenses vs 100 000 revenue → 120%
    const result = computeNaturalHedgeRatio(120000, 100000)
    expect(result).toBe(120)
  })

  it('fractional result rounds to 2 decimals', () => {
    const result = computeNaturalHedgeRatio(10, 30)
    expect(result).toBe(33.33)
  })

})

// ── computeNetFxExposure ──────────────────────────────────────────────────────

describe('computeNetFxExposure', () => {

  it('net long: revenue > expenses → positive exposure', () => {
    const result = computeNetFxExposure(80000, 20000)
    expect(result).toBe(60000)
  })

  it('net short: expenses > revenue → negative exposure', () => {
    const result = computeNetFxExposure(20000, 80000)
    expect(result).toBe(-60000)
  })

  it('balanced: revenue equals expenses → zero exposure', () => {
    const result = computeNetFxExposure(50000, 50000)
    expect(result).toBe(0)
  })

  it('no expenses → net exposure equals full foreign revenue', () => {
    const result = computeNetFxExposure(45000, 0)
    expect(result).toBe(45000)
  })

  it('no revenue → net exposure is negative of expenses', () => {
    const result = computeNetFxExposure(0, 30000)
    expect(result).toBe(-30000)
  })

})
