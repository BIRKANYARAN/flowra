import { describe, it, expect } from 'vitest'
import { purchaseLineSum, purchaseTotalTry } from '../lib/finance/purchase-total'

// purchases has no total column — total_try = fx_rate × Σ(quantity × unit_price)

describe('purchaseLineSum', () => {
  it('sums quantity × unit_price across items', () => {
    expect(purchaseLineSum([
      { quantity: 10, unit_price: 15000 },
      { quantity: 2,  unit_price: 500 },
    ])).toBe(151_000)
  })

  it('returns 0 for empty / null items', () => {
    expect(purchaseLineSum([])).toBe(0)
    expect(purchaseLineSum(null)).toBe(0)
    expect(purchaseLineSum(undefined)).toBe(0)
  })

  it('treats null quantity / unit_price as 0', () => {
    expect(purchaseLineSum([
      { quantity: null, unit_price: 100 },
      { quantity: 3,    unit_price: null },
    ])).toBe(0)
  })
})

describe('purchaseTotalTry', () => {
  it('TRY purchase (fx_rate = 1): total = raw line sum', () => {
    expect(purchaseTotalTry({
      fx_rate: 1,
      purchase_items: [{ quantity: 10, unit_price: 15000 }],
    })).toBe(150_000)
  })

  it('foreign purchase: total = fx_rate × line sum', () => {
    expect(purchaseTotalTry({
      fx_rate: 35,
      purchase_items: [{ quantity: 4, unit_price: 100 }],   // 400 USD
    })).toBe(14_000)                                          // × 35 = 14 000 TRY
  })

  it('missing fx_rate defaults to 1', () => {
    expect(purchaseTotalTry({
      fx_rate: null,
      purchase_items: [{ quantity: 5, unit_price: 200 }],
    })).toBe(1_000)
  })

  it('zero fx_rate falls back to 1 (avoids zeroing the total)', () => {
    expect(purchaseTotalTry({
      fx_rate: 0,
      purchase_items: [{ quantity: 5, unit_price: 200 }],
    })).toBe(1_000)
  })

  it('no items → 0', () => {
    expect(purchaseTotalTry({ fx_rate: 1, purchase_items: [] })).toBe(0)
    expect(purchaseTotalTry({ fx_rate: 1, purchase_items: null })).toBe(0)
  })
})
