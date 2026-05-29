/**
 * Tests for lib/calc.ts — central calculation engine
 * Run with: npx vitest run tests/calc.test.ts
 */
import { describe, it, expect } from 'vitest'
import { round2, n, calculateLine, calculateTotals, type LineInput } from '../lib/calc'

// ── round2 ────────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(1.004)).toBe(1.0)
    expect(round2(99.999)).toBe(100.0)
    expect(round2(0)).toBe(0)
  })

  it('handles negative values', () => {
    expect(round2(-1.005)).toBe(-1.0)
    expect(round2(-1.004)).toBe(-1.0)
    expect(round2(-99.999)).toBe(-100.0)
  })

  it('handles already-rounded values unchanged', () => {
    expect(round2(1.00)).toBe(1.00)
    expect(round2(42.50)).toBe(42.50)
    expect(round2(0.01)).toBe(0.01)
  })

  it('handles very small numbers close to zero', () => {
    expect(round2(0.001)).toBe(0.00)
    expect(round2(0.004)).toBe(0.00)
    expect(round2(0.005)).toBe(0.01)
  })

  it('handles large numbers', () => {
    expect(round2(1_000_000.999)).toBe(1_000_001.00)
    expect(round2(9_999_999.994)).toBe(9_999_999.99)
  })

  it('handles integer inputs without change', () => {
    expect(round2(0)).toBe(0)
    expect(round2(100)).toBe(100)
    expect(round2(-50)).toBe(-50)
  })

  it('handles floating point precision edge cases', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    expect(round2(0.1 + 0.2)).toBe(0.30)
  })
})

// ── n (coerce) ────────────────────────────────────────────────────────────────

describe('n (coerce)', () => {
  it('handles null/undefined/NaN', () => {
    expect(n(null)).toBe(0)
    expect(n(undefined)).toBe(0)
    expect(n(NaN)).toBe(0)
    expect(n('abc')).toBe(0)
  })

  it('handles string numbers (PostgREST)', () => {
    expect(n('42.50')).toBe(42.5)
    expect(n('0')).toBe(0)
  })

  it('handles numeric inputs directly', () => {
    expect(n(0)).toBe(0)
    expect(n(42)).toBe(42)
    expect(n(-10)).toBe(-10)
    expect(n(3.14)).toBe(3.14)
  })

  it('handles string edge cases', () => {
    expect(n('')).toBe(0)
    expect(n('  ')).toBe(0)
    expect(n('Infinity')).toBe(0)    // Infinity is not finite
    expect(n('-Infinity')).toBe(0)
  })

  it('handles boolean-ish inputs', () => {
    expect(n(true)).toBe(1)    // Number(true) = 1
    expect(n(false)).toBe(0)   // Number(false) = 0
  })

  it('handles negative string numbers', () => {
    expect(n('-15.50')).toBe(-15.5)
    expect(n('-0')).toBe(-0)
  })

  it('handles scientific notation strings', () => {
    expect(n('1e3')).toBe(1000)
    expect(n('2.5e2')).toBe(250)
  })

  it('handles objects/arrays as invalid', () => {
    expect(n({})).toBe(0)
    expect(n([])).toBe(0)   // Number([]) = 0, which is finite
  })
})

// ── calculateLine ─────────────────────────────────────────────────────────────

describe('calculateLine', () => {
  it('computes line total with KDV', () => {
    const line = calculateLine({ price: 100, quantity: 2, discount_percent: 0, kdv: 20 })
    expect(line.line_total).toBe(240) // 100*2 * 1.20
    expect(line.line_subtotal).toBe(200)
    expect(line.line_vat).toBe(40)
  })

  it('applies percent discount', () => {
    const line = calculateLine({ price: 100, quantity: 1, discount_percent: 10, kdv: 20 })
    expect(line.discounted_unit_price).toBe(90)
    expect(line.line_subtotal).toBe(90)
    expect(line.line_vat).toBe(18)
    expect(line.line_total).toBe(108)
  })

  it('clamps discount to [0, 100]', () => {
    const line = calculateLine({ price: 100, quantity: 1, discount_percent: 150, kdv: 0 })
    expect(line.discount_percent).toBe(100)
    expect(line.line_total).toBe(0)
  })

  it('clamps negative discount to 0', () => {
    const line = calculateLine({ price: 100, quantity: 1, discount_percent: -20, kdv: 0 })
    expect(line.discount_percent).toBe(0)
    expect(line.line_subtotal).toBe(100)
  })

  it('handles string inputs (PostgREST coercion)', () => {
    const line = calculateLine({ price: '50.00', quantity: '3', discount_percent: '0', kdv: '18' } as any)
    expect(line.line_subtotal).toBe(150)
    expect(line.line_total).toBe(177)
  })

  it('handles zero price', () => {
    const line = calculateLine({ price: 0, quantity: 5, discount_percent: 0, kdv: 18 })
    expect(line.line_subtotal).toBe(0)
    expect(line.line_vat).toBe(0)
    expect(line.line_total).toBe(0)
  })

  it('handles zero KDV (no tax)', () => {
    const line = calculateLine({ price: 100, quantity: 3, discount_percent: 0, kdv: 0 })
    expect(line.line_vat).toBe(0)
    expect(line.line_total).toBe(line.line_subtotal)
    expect(line.line_total).toBe(300)
  })

  it('handles null quantity (defaults to 1)', () => {
    const line = calculateLine({ price: 100, quantity: null, discount_percent: 0, kdv: 0 } as any)
    expect(line.quantity).toBe(1)
    expect(line.line_subtotal).toBe(100)
  })

  it('returns correct fields for full 100% discount', () => {
    const line = calculateLine({ price: 200, quantity: 5, discount_percent: 100, kdv: 18 })
    expect(line.discounted_unit_price).toBe(0)
    expect(line.line_subtotal).toBe(0)
    expect(line.line_vat).toBe(0)
    expect(line.line_total).toBe(0)
  })

  it('handles large numbers without overflow', () => {
    const line = calculateLine({ price: 9_999_999, quantity: 100, discount_percent: 0, kdv: 20 })
    expect(line.line_subtotal).toBe(999_999_900)
    expect(line.line_vat).toBe(round2(999_999_900 * 0.20))
    expect(line.line_total).toBe(round2(999_999_900 * 1.20))
  })

  it('has line_total === line_subtotal + line_vat invariant', () => {
    const testCases = [
      { price: 33.33, quantity: 3, discount_percent: 5, kdv: 18 },
      { price: 1.99, quantity: 7, discount_percent: 12.5, kdv: 8 },
      { price: 500, quantity: 1, discount_percent: 0, kdv: 20 },
    ]
    for (const inputs of testCases) {
      const line = calculateLine(inputs)
      expect(line.line_total).toBe(round2(line.line_subtotal + line.line_vat))
    }
  })

  it('produces rounded discounted_unit_price independently from line_subtotal', () => {
    // Unit price should be rounded separately from the subtotal computation
    const line = calculateLine({ price: 33.33, quantity: 3, discount_percent: 0, kdv: 0 })
    expect(line.discounted_unit_price).toBe(33.33)
    expect(line.line_subtotal).toBe(round2(33.33 * 3))
  })

  it('handles fractional KDV rates', () => {
    const line = calculateLine({ price: 100, quantity: 1, discount_percent: 0, kdv: 8 })
    expect(line.line_vat).toBe(8)
    expect(line.line_total).toBe(108)
  })
})

// ── calculateTotals ───────────────────────────────────────────────────────────

describe('calculateTotals', () => {
  it('sums line totals correctly (rounding invariant)', () => {
    const items: LineInput[] = [
      { price: 33.33, quantity: 3, discount_percent: 0, kdv: 20 },
      { price: 16.67, quantity: 2, discount_percent: 0, kdv: 18 },
    ]
    const t = calculateTotals(items)
    // grand_total = sum(line_total), NOT subtotal + kdv_total
    const sumOfLines = items.reduce((s, i) => s + calculateLine(i).line_total, 0)
    expect(t.grand_total).toBe(round2(sumOfLines))
  })

  it('computes discount total', () => {
    const items: LineInput[] = [
      { price: 100, quantity: 1, discount_percent: 10, kdv: 0 },
      { price: 200, quantity: 1, discount_percent: 25, kdv: 0 },
    ]
    const t = calculateTotals(items)
    expect(t.total_discount).toBe(60) // 10 + 50
  })

  it('handles empty array', () => {
    const t = calculateTotals([])
    expect(t.grand_total).toBe(0)
    expect(t.subtotal).toBe(0)
    expect(t.kdv_total).toBe(0)
  })

  it('includes computed lines in result', () => {
    const items: LineInput[] = [
      { price: 100, quantity: 2, discount_percent: 0, kdv: 18 },
    ]
    const t = calculateTotals(items)
    expect(t.lines).toHaveLength(1)
    expect(t.lines[0].line_subtotal).toBe(200)
  })

  it('groups KDV breakdown by rate', () => {
    const items: LineInput[] = [
      { price: 100, quantity: 1, discount_percent: 0, kdv: 18 },
      { price: 100, quantity: 1, discount_percent: 0, kdv: 8 },
      { price: 100, quantity: 1, discount_percent: 0, kdv: 18 }, // second 18% item
    ]
    const t = calculateTotals(items)
    expect(t.kdv_breakdown['18']).toBe(round2(18 + 18))  // 36
    expect(t.kdv_breakdown['8']).toBe(8)
  })

  it('subtotal equals sum of line subtotals', () => {
    const items: LineInput[] = [
      { price: 50, quantity: 4, discount_percent: 10, kdv: 20 },
      { price: 75, quantity: 2, discount_percent: 0,  kdv: 18 },
    ]
    const t = calculateTotals(items)
    const expectedSubtotal = round2(
      items.reduce((s, i) => s + calculateLine(i).line_subtotal, 0)
    )
    expect(t.subtotal).toBe(expectedSubtotal)
  })

  it('kdv_total equals sum of line VATs', () => {
    const items: LineInput[] = [
      { price: 100, quantity: 1, discount_percent: 0, kdv: 20 },
      { price: 200, quantity: 2, discount_percent: 5, kdv: 8 },
    ]
    const t = calculateTotals(items)
    const expectedKdv = round2(
      items.reduce((s, i) => s + calculateLine(i).line_vat, 0)
    )
    expect(t.kdv_total).toBe(expectedKdv)
  })

  it('total_discount is 0 when no discounts', () => {
    const items: LineInput[] = [
      { price: 100, quantity: 2, discount_percent: 0, kdv: 18 },
      { price: 200, quantity: 1, discount_percent: 0, kdv: 20 },
    ]
    const t = calculateTotals(items)
    expect(t.total_discount).toBe(0)
  })

  it('handles single-item array', () => {
    const items: LineInput[] = [
      { price: 250, quantity: 1, discount_percent: 20, kdv: 18 },
    ]
    const t = calculateTotals(items)
    const line = calculateLine(items[0])
    expect(t.grand_total).toBe(line.line_total)
    expect(t.subtotal).toBe(line.line_subtotal)
    expect(t.kdv_total).toBe(line.line_vat)
  })

  it('handles large number of items without precision loss', () => {
    const items: LineInput[] = Array.from({ length: 50 }, (_, i) => ({
      price: 9.99,
      quantity: i + 1,
      discount_percent: 0,
      kdv: 18,
    }))
    const t = calculateTotals(items)
    const sumOfLines = items.reduce((s, i) => s + calculateLine(i).line_total, 0)
    expect(t.grand_total).toBe(round2(sumOfLines))
  })
})
