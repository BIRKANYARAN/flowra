/**
 * tax-hub-pure.test.ts
 *
 * Pure function tests for KDV (VAT) helper functions added to tax.service.ts:
 *   • computeKdvDeductionRate()
 *   • classifyKdvPosition()
 *   • computeKdvTrend()
 *   • formatKdvPeriod()
 *
 * Run: npx vitest run tests/tax-hub-pure.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeKdvDeductionRate,
  classifyKdvPosition,
  computeKdvTrend,
  formatKdvPeriod,
} from '../lib/services/tax.service'

// ─────────────────────────────────────────────────────────────────────────────
// computeKdvDeductionRate()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvDeductionRate()', () => {
  it('returns 0 when outputKdv is 0 (avoid division by zero)', () => {
    expect(computeKdvDeductionRate(0, 0)).toBe(0)
    expect(computeKdvDeductionRate(100, 0)).toBe(0)
    expect(computeKdvDeductionRate(500, 0)).toBe(0)
  })

  it('returns 100 when input equals output (fully offset)', () => {
    expect(computeKdvDeductionRate(1000, 1000)).toBe(100)
  })

  it('returns 0 when input is 0 but output > 0 (no deduction)', () => {
    expect(computeKdvDeductionRate(0, 1000)).toBe(0)
  })

  it('returns correct proportional rate for partial offset', () => {
    // 620 / 850 * 100 = 72.94...
    const rate = computeKdvDeductionRate(620, 850)
    expect(rate).toBeCloseTo(72.94, 1)
  })

  it('returns 50 when input is half of output', () => {
    expect(computeKdvDeductionRate(500, 1000)).toBe(50)
  })

  it('returns 25 for 250/1000 ratio', () => {
    expect(computeKdvDeductionRate(250, 1000)).toBe(25)
  })

  it('handles decimal inputs correctly', () => {
    const rate = computeKdvDeductionRate(100.5, 200.0)
    expect(rate).toBeCloseTo(50.25, 1)
  })

  it('returns value > 100 when input exceeds output (over-deduction scenario)', () => {
    const rate = computeKdvDeductionRate(1200, 1000)
    expect(rate).toBe(120)
  })

  it('handles very small values without error', () => {
    const rate = computeKdvDeductionRate(0.01, 0.02)
    expect(rate).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// classifyKdvPosition()
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyKdvPosition()', () => {
  it('returns "payable" for positive net KDV (owes to tax authority)', () => {
    expect(classifyKdvPosition(1)).toBe('payable')
    expect(classifyKdvPosition(230000)).toBe('payable')
    expect(classifyKdvPosition(0.01)).toBe('payable')
  })

  it('returns "credit" for negative net KDV (recoverable credit)', () => {
    expect(classifyKdvPosition(-1)).toBe('credit')
    expect(classifyKdvPosition(-50000)).toBe('credit')
    expect(classifyKdvPosition(-0.01)).toBe('credit')
  })

  it('returns "balanced" for exactly zero', () => {
    expect(classifyKdvPosition(0)).toBe('balanced')
  })

  it('payable vs credit boundary: 0.001 → payable', () => {
    expect(classifyKdvPosition(0.001)).toBe('payable')
  })

  it('credit boundary: -0.001 → credit', () => {
    expect(classifyKdvPosition(-0.001)).toBe('credit')
  })

  it('large positive → payable', () => {
    expect(classifyKdvPosition(9_999_999)).toBe('payable')
  })

  it('large negative → credit', () => {
    expect(classifyKdvPosition(-9_999_999)).toBe('credit')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeKdvTrend()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeKdvTrend()', () => {
  it('returns "stable" when fewer than 2 months are provided', () => {
    expect(computeKdvTrend([])).toBe('stable')
    expect(computeKdvTrend([{ output: 100, input: 50 }])).toBe('stable')
  })

  it('returns "increasing" when last net is > 110% of prior average', () => {
    // prior avg net = (100 + 100) / 2 = 100; last = 120 → 120% > 110%
    const months = [
      { output: 150, input: 50 },  // net 100
      { output: 160, input: 60 },  // net 100
      { output: 250, input: 130 }, // net 120 → 120% of avg(100) → increasing
    ]
    expect(computeKdvTrend(months)).toBe('increasing')
  })

  it('returns "decreasing" when last net is < 90% of prior average', () => {
    // prior avg net = (200 + 180) / 2 = 190; last net = 100 → 52% < 90%
    const months = [
      { output: 300, input: 100 }, // net 200
      { output: 280, input: 100 }, // net 180
      { output: 200, input: 100 }, // net 100 → 52% of avg(190) → decreasing
    ]
    expect(computeKdvTrend(months)).toBe('decreasing')
  })

  it('returns "stable" when last net is within ±10% of prior average', () => {
    // prior avg = 100; last = 105 → 105% — within [90%, 110%]
    const months = [
      { output: 200, input: 100 }, // net 100
      { output: 195, input: 95 },  // net 100
      { output: 205, input: 100 }, // net 105 → 105% → stable
    ]
    expect(computeKdvTrend(months)).toBe('stable')
  })

  it('returns "stable" for exactly equal consecutive months', () => {
    const months = [
      { output: 200, input: 100 },
      { output: 200, input: 100 },
      { output: 200, input: 100 },
    ]
    expect(computeKdvTrend(months)).toBe('stable')
  })

  it('works with exactly 2 months: increasing', () => {
    // prior avg = 100; last = 115 → 115% > 110%
    const months = [
      { output: 200, input: 100 }, // net 100
      { output: 250, input: 135 }, // net 115 → increasing
    ]
    expect(computeKdvTrend(months)).toBe('increasing')
  })

  it('works with exactly 2 months: decreasing', () => {
    // prior avg = 200; last = 170 → 85% < 90%
    const months = [
      { output: 300, input: 100 }, // net 200
      { output: 270, input: 100 }, // net 170 → decreasing
    ]
    expect(computeKdvTrend(months)).toBe('decreasing')
  })

  it('handles negative nets (credit periods) correctly — increasing trend', () => {
    // prior avg net = -100; last = -50 (less negative = "higher" = increasing)
    const months = [
      { output: 100, input: 200 }, // net -100
      { output: 150, input: 200 }, // net -50 → more than 110% of -100? no.
      // -50 > -100 * 1.1 = -110 → yes, -50 > -110 → increasing
    ]
    expect(computeKdvTrend(months)).toBe('increasing')
  })

  it('handles mixed positive/negative nets — stable', () => {
    const months = [
      { output: 200, input: 100 }, // net 100
      { output: 110, input: 100 }, // net 10
      { output: 160, input: 100 }, // net 60 — avg prior = 55, last = 60 → 109% → stable
    ]
    expect(computeKdvTrend(months)).toBe('stable')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// formatKdvPeriod()
// ─────────────────────────────────────────────────────────────────────────────

describe('formatKdvPeriod()', () => {
  it('formats January correctly', () => {
    expect(formatKdvPeriod(2025, 1)).toBe('Ocak 2025 KDV Dönemi')
  })

  it('formats April correctly', () => {
    expect(formatKdvPeriod(2025, 4)).toBe('Nisan 2025 KDV Dönemi')
  })

  it('formats May correctly', () => {
    expect(formatKdvPeriod(2025, 5)).toBe('Mayıs 2025 KDV Dönemi')
  })

  it('formats December correctly', () => {
    expect(formatKdvPeriod(2025, 12)).toBe('Aralık 2025 KDV Dönemi')
  })

  it('includes the correct year', () => {
    expect(formatKdvPeriod(2026, 3)).toBe('Mart 2026 KDV Dönemi')
    expect(formatKdvPeriod(2030, 6)).toBe('Haziran 2030 KDV Dönemi')
  })

  it('all 12 Turkish month names appear correctly', () => {
    const expected = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ]
    for (let m = 1; m <= 12; m++) {
      expect(formatKdvPeriod(2025, m)).toBe(`${expected[m - 1]} 2025 KDV Dönemi`)
    }
  })

  it('includes "KDV Dönemi" suffix', () => {
    const result = formatKdvPeriod(2025, 8)
    expect(result).toMatch(/KDV Dönemi$/)
  })

  it('produces correct format for August', () => {
    expect(formatKdvPeriod(2025, 8)).toBe('Ağustos 2025 KDV Dönemi')
  })
})
