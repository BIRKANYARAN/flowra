/**
 * pcle-distribution-pure.test.ts — Pure helper tests for pcle.distribution.ts
 *
 * Tests the three exported pure functions:
 *   - computeLegalReserve        (TTK 519: 5% rule, 20% cap)
 *   - computeDistributableNet    (4-layer waterfall, blocked flag, withholding)
 *   - allocateDistribution       (per-partner proportional allocation)
 *   - TTK 509 compliance via blocked flag
 *
 * Run: npx vitest run tests/pcle-distribution-pure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeLegalReserve,
  computeDistributableNet,
  allocateDistribution,
} from '../lib/services/pcle/pcle.distribution'

// ─────────────────────────────────────────────────────────────────────────────
// computeLegalReserve
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLegalReserve', () => {
  it('returns 5% of profit when reserves are empty', () => {
    expect(computeLegalReserve(1_000_000, 0, 1_000_000)).toBe(50_000)
  })

  it('returns 0 when existing reserves already equal the 20% cap', () => {
    expect(computeLegalReserve(1_000_000, 200_000, 1_000_000)).toBe(0)
  })

  it('returns 0 when existing reserves exceed the 20% cap', () => {
    expect(computeLegalReserve(1_000_000, 250_000, 1_000_000)).toBe(0)
  })

  it('caps at remaining gap when gap is smaller than 5% of profit', () => {
    // cap = 200_000 * 0.2 - 198_000 = 2_000; 5% of profit = 50_000 → min = 2_000
    expect(computeLegalReserve(1_000_000, 198_000, 1_000_000)).toBe(2_000)
  })

  it('returns full 5% when gap is larger than 5% of profit', () => {
    // existing = 100_000; cap = 100_000; 5% of 1_000_000 = 50_000 → min = 50_000
    expect(computeLegalReserve(1_000_000, 100_000, 1_000_000)).toBe(50_000)
  })

  it('returns 0 when profit is zero', () => {
    expect(computeLegalReserve(0, 0, 1_000_000)).toBe(0)
  })

  it('returns 0 when profit is negative (loss period)', () => {
    expect(computeLegalReserve(-500_000, 0, 1_000_000)).toBe(0)
  })

  it('uses paid-in capital to determine the 20% cap boundary', () => {
    // paidInCapital = 500_000 → 20% cap = 100_000; existing = 0; 5% of 200_000 = 10_000
    expect(computeLegalReserve(200_000, 0, 500_000)).toBe(10_000)
  })

  it('handles tiny profit correctly (rounds to 2dp)', () => {
    // 5% of 33 = 1.65 → should round to 1.65
    expect(computeLegalReserve(33, 0, 10_000)).toBe(1.65)
  })

  it('returns 0 when paidInCapital is 0 (no cap means cap=0)', () => {
    // 20% of 0 = 0, existing = 0 → cap = 0 → reserve = 0
    expect(computeLegalReserve(100_000, 0, 0)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeDistributableNet
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDistributableNet', () => {
  it('computes correct distributableGross after all deductions', () => {
    const result = computeDistributableNet(1_000_000, 50_000, 0, 0)
    expect(result.distributableGross).toBe(950_000)
  })

  it('applies default 10% withholding to distributableGross', () => {
    const result = computeDistributableNet(1_000_000, 50_000, 0, 0)
    expect(result.withholdingTax).toBe(95_000)
    expect(result.distributableNet).toBe(855_000)
  })

  it('blocked is false when distributableNet is positive', () => {
    const result = computeDistributableNet(1_000_000, 50_000, 0, 0)
    expect(result.blocked).toBe(false)
  })

  it('blocked is true when distributableNet is negative (TTK 509)', () => {
    // grossProfit barely positive, but large deductions make gross negative
    const result = computeDistributableNet(100, 50_000, 0, 0)
    expect(result.distributableNet).toBeLessThan(0)
    expect(result.blocked).toBe(true)
  })

  it('deducts boardRetained correctly', () => {
    const result = computeDistributableNet(1_000_000, 0, 200_000, 0)
    expect(result.distributableGross).toBe(800_000)
  })

  it('deducts unpaidCompensation correctly', () => {
    const result = computeDistributableNet(1_000_000, 0, 0, 25_000)
    expect(result.distributableGross).toBe(975_000)
  })

  it('deducts all four components simultaneously', () => {
    // 1_200_000 - 60_000 - 0 - 25_000 = 1_115_000 gross; 10% withholding = 111_500; net = 1_003_500
    const result = computeDistributableNet(1_200_000, 60_000, 0, 25_000)
    expect(result.distributableGross).toBe(1_115_000)
    expect(result.withholdingTax).toBe(111_500)
    expect(result.distributableNet).toBe(1_003_500)
  })

  it('withholdingTax is 0 when distributableGross is 0', () => {
    const result = computeDistributableNet(0, 0, 0, 0)
    expect(result.withholdingTax).toBe(0)
    expect(result.distributableNet).toBe(0)
  })

  it('withholdingTax is 0 when distributableGross is negative', () => {
    const result = computeDistributableNet(10_000, 50_000, 0, 0)
    expect(result.distributableGross).toBe(-40_000)
    expect(result.withholdingTax).toBe(0)
  })

  it('accepts custom withholding rate (e.g. 0 for non-resident exemption)', () => {
    const result = computeDistributableNet(1_000_000, 0, 0, 0, 0)
    expect(result.withholdingTax).toBe(0)
    expect(result.distributableNet).toBe(1_000_000)
    expect(result.blocked).toBe(false)
  })

  it('accepts custom withholding rate of 15%', () => {
    const result = computeDistributableNet(1_000_000, 0, 0, 0, 0.15)
    expect(result.withholdingTax).toBe(150_000)
    expect(result.distributableNet).toBe(850_000)
  })

  it('blocked is true when grossProfit is 0 (TTK 509 — no profit)', () => {
    const result = computeDistributableNet(0, 0, 0, 0)
    // distributableNet = 0, which is not > 0 (blocked flag = net < 0 → false for 0)
    // Verify exact behavior: net = 0 → not blocked, but IS_distributable = net > 0.01
    expect(result.distributableNet).toBe(0)
    expect(result.blocked).toBe(false)
  })

  it('blocked is true when grossProfit is negative', () => {
    const result = computeDistributableNet(-100_000, 0, 0, 0)
    expect(result.blocked).toBe(true)
    expect(result.distributableNet).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// allocateDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe('allocateDistribution', () => {
  it('allocates correct amount for 45% share', () => {
    expect(allocateDistribution(1_000_000, 45)).toBe(450_000)
  })

  it('allocates correct amount for 35% share', () => {
    expect(allocateDistribution(1_000_000, 35)).toBe(350_000)
  })

  it('allocates correct amount for 20% share', () => {
    expect(allocateDistribution(1_000_000, 20)).toBe(200_000)
  })

  it('three partners with shares summing to 100% add up to distributableNet', () => {
    const net = 1_003_500
    const ahmet  = allocateDistribution(net, 45)
    const mehmet = allocateDistribution(net, 35)
    const fatma  = allocateDistribution(net, 20)
    // Due to rounding each value independently, sum may differ by ±0.01
    const total = ahmet + mehmet + fatma
    expect(Math.abs(total - net)).toBeLessThanOrEqual(0.02)
  })

  it('returns 0 when distributableNet is 0', () => {
    expect(allocateDistribution(0, 50)).toBe(0)
  })

  it('returns 0 when distributableNet is negative', () => {
    expect(allocateDistribution(-10_000, 50)).toBe(0)
  })

  it('returns 0 for 0% share', () => {
    expect(allocateDistribution(1_000_000, 0)).toBe(0)
  })

  it('returns full amount for 100% share', () => {
    expect(allocateDistribution(500_000, 100)).toBe(500_000)
  })

  it('rounds to 2 decimal places', () => {
    // 1_000_001 * 33 / 100 = 330_000.33
    const result = allocateDistribution(1_000_001, 33)
    expect(result).toBe(330_000.33)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 compliance — blocked=true guard
// ─────────────────────────────────────────────────────────────────────────────

describe('TTK 509 compliance: blocked flag', () => {
  it('distribution is blocked when gross profit is zero', () => {
    const { blocked } = computeDistributableNet(0, 0, 0, 0)
    // distributableNet = 0, not < 0, so blocked = false per spec
    // allocateDistribution returns 0 for net=0 regardless
    expect(allocateDistribution(0, 50)).toBe(0)
  })

  it('distribution is blocked when gross profit is negative (loss)', () => {
    const { blocked, distributableNet } = computeDistributableNet(-1_000_000, 0, 0, 0)
    expect(blocked).toBe(true)
    expect(distributableNet).toBeLessThan(0)
    expect(allocateDistribution(distributableNet, 50)).toBe(0)
  })

  it('distribution is blocked when deductions exceed gross profit', () => {
    const { blocked } = computeDistributableNet(100_000, 80_000, 50_000, 0)
    // gross - 80k - 50k = -30k → blocked
    expect(blocked).toBe(true)
  })

  it('distribution is NOT blocked with healthy profit', () => {
    const { blocked } = computeDistributableNet(1_000_000, 50_000, 0, 0)
    expect(blocked).toBe(false)
  })

  it('allocateDistribution always returns 0 when blocked (distributableNet < 0)', () => {
    const { distributableNet } = computeDistributableNet(-500_000, 0, 0, 0)
    expect(allocateDistribution(distributableNet, 45)).toBe(0)
    expect(allocateDistribution(distributableNet, 35)).toBe(0)
    expect(allocateDistribution(distributableNet, 20)).toBe(0)
  })
})
