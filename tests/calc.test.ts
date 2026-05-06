/**
 * Tests for lib/calc.ts — central calculation engine
 * Run with: npx vitest run tests/calc.test.ts
 */
import { describe, it, expect } from 'vitest'
import { round2, n, calculateLine, calculateTotals, type LineInput } from '../lib/calc'

describe('round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(1.004)).toBe(1.0)
    expect(round2(99.999)).toBe(100.0)
    expect(round2(0)).toBe(0)
  })
})

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
})

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

  it('handles string inputs (PostgREST coercion)', () => {
    const line = calculateLine({ price: '50.00', quantity: '3', discount_percent: '0', kdv: '18' } as any)
    expect(line.line_subtotal).toBe(150)
    expect(line.line_total).toBe(177)
  })
})

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
})
