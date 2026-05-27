/**
 * Product Profitability Waterfall — unit tests
 *
 * Tests pure computation logic of ProductProfitabilityService helper functions.
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computeAttributedOpex,
  computeContributionMargin,
  classifyProfitabilityTier,
  computeBreakevenUnits,
} from '../lib/services/commercial/product-profitability.service'

// ── computeAttributedOpex ─────────────────────────────────────────────────────

describe('computeAttributedOpex — pure', () => {

  it('1. 30% revenue share → 30 000 of 100 000 opex', () => {
    expect(computeAttributedOpex(0.3, 100_000)).toBe(30_000)
  })

  it('2. 0% revenue share → 0 attributed opex', () => {
    expect(computeAttributedOpex(0, 100_000)).toBe(0)
  })

  it('3. 100% revenue share → full opex attributed', () => {
    expect(computeAttributedOpex(1, 100_000)).toBe(100_000)
  })

  it('4. fractional share with zero opex → 0', () => {
    expect(computeAttributedOpex(0.5, 0)).toBe(0)
  })

  it('5. 50% share → half of opex', () => {
    expect(computeAttributedOpex(0.5, 80_000)).toBe(40_000)
  })

})

// ── computeContributionMargin ──────────────────────────────────────────────────

describe('computeContributionMargin — pure', () => {

  it('6. gross profit 50 000, opex 30 000 → contribution 20 000', () => {
    expect(computeContributionMargin(50_000, 30_000)).toBe(20_000)
  })

  it('7. gross profit 20 000, opex 30 000 → contribution -10 000 (loss maker)', () => {
    expect(computeContributionMargin(20_000, 30_000)).toBe(-10_000)
  })

  it('8. gross profit equals opex → 0 contribution margin', () => {
    expect(computeContributionMargin(15_000, 15_000)).toBe(0)
  })

  it('9. zero opex → contribution equals gross profit', () => {
    expect(computeContributionMargin(45_000, 0)).toBe(45_000)
  })

})

// ── classifyProfitabilityTier ─────────────────────────────────────────────────

describe('classifyProfitabilityTier — pure', () => {

  it('10. 35% → star', () => {
    expect(classifyProfitabilityTier(35)).toBe('star')
  })

  it('11. 20% → profitable', () => {
    expect(classifyProfitabilityTier(20)).toBe('profitable')
  })

  it('12. 10% → marginal', () => {
    expect(classifyProfitabilityTier(10)).toBe('marginal')
  })

  it('13. -5% → loss_maker', () => {
    expect(classifyProfitabilityTier(-5)).toBe('loss_maker')
  })

  it('14. exactly 0% → marginal', () => {
    expect(classifyProfitabilityTier(0)).toBe('marginal')
  })

  it('15. null (no data) → marginal', () => {
    expect(classifyProfitabilityTier(null)).toBe('marginal')
  })

  it('16. exactly 30% → star (boundary)', () => {
    expect(classifyProfitabilityTier(30)).toBe('star')
  })

  it('17. exactly 15% → profitable (boundary)', () => {
    expect(classifyProfitabilityTier(15)).toBe('profitable')
  })

})

// ── computeBreakevenUnits ─────────────────────────────────────────────────────

describe('computeBreakevenUnits — pure', () => {

  it('18. 10 000 opex, price 100, cost 60 → 250 units (10000/40)', () => {
    expect(computeBreakevenUnits(10_000, 100, 60)).toBe(250)
  })

  it('19. price < cost → null (no positive unit contribution)', () => {
    expect(computeBreakevenUnits(10_000, 60, 100)).toBeNull()
  })

  it('20. cost unknown (null) → null', () => {
    expect(computeBreakevenUnits(10_000, 100, null)).toBeNull()
  })

  it('21. zero attributed opex → 0 breakeven units', () => {
    expect(computeBreakevenUnits(0, 100, 60)).toBe(0)
  })

  it('22. price equals cost → null (zero unit contribution)', () => {
    expect(computeBreakevenUnits(5_000, 80, 80)).toBeNull()
  })

  it('23. large opex with wide margin → correct units', () => {
    // 500 000 / (200 - 50) = 3333.33...
    expect(computeBreakevenUnits(500_000, 200, 50)).toBeCloseTo(3333.33, 1)
  })

})
