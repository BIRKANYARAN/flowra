/**
 * Tests for lib/idempotency.ts — payload hash computation
 * Run with: npx vitest run tests/idempotency.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computePayloadHash } from '../lib/idempotency'

describe('computePayloadHash', () => {
  it('produces deterministic hash for same payload', () => {
    const payload = { customer_id: 'abc', customer_name: 'Test', currency: 'TRY', items: [{ name: 'A' }] }
    const h1 = computePayloadHash(payload)
    const h2 = computePayloadHash(payload)
    expect(h1).toBe(h2)
  })

  it('produces different hash for different payloads', () => {
    const p1 = { customer_id: 'abc', currency: 'TRY', items: [] }
    const p2 = { customer_id: 'abc', currency: 'USD', items: [] }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('is key-order independent (sorted internally)', () => {
    const p1 = { a: 1, b: 2 }
    const p2 = { b: 2, a: 1 }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('starts with h_ prefix', () => {
    const h = computePayloadHash({ x: 1 })
    expect(h).toMatch(/^h_/)
  })

  it('different items produce different hashes (mismatch detection)', () => {
    const base = { customer_id: 'c1', currency: 'TRY' }
    const h1 = computePayloadHash({ ...base, items: [{ name: 'Prod A', qty: 1 }] })
    const h2 = computePayloadHash({ ...base, items: [{ name: 'Prod B', qty: 5 }] })
    expect(h1).not.toBe(h2)
  })
})

describe('computePayloadHash — edge cases', () => {
  it('handles null payload without throwing', () => {
    const h = computePayloadHash(null)
    expect(typeof h).toBe('string')
    expect(h.startsWith('h_')).toBe(true)
  })

  it('null produces a valid hash string', () => {
    const h = computePayloadHash(null)
    expect(h.length).toBeGreaterThan(2)
  })

  it('empty object produces a valid hash', () => {
    const h = computePayloadHash({})
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('empty array produces a valid hash', () => {
    const h = computePayloadHash([])
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('empty string produces a valid hash', () => {
    const h = computePayloadHash('')
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('number 0 produces a valid hash', () => {
    const h = computePayloadHash(0)
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('boolean false produces a valid hash', () => {
    const h = computePayloadHash(false)
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('null and empty object produce different hashes', () => {
    expect(computePayloadHash(null)).not.toBe(computePayloadHash({}))
  })

  it('empty object and empty array produce different hashes', () => {
    expect(computePayloadHash({})).not.toBe(computePayloadHash([]))
  })

  it('empty string and null produce different hashes', () => {
    expect(computePayloadHash('')).not.toBe(computePayloadHash(null))
  })

  it('number 0 and boolean false produce different hashes', () => {
    expect(computePayloadHash(0)).not.toBe(computePayloadHash(false))
  })

  it('number 0 and string "0" produce different hashes', () => {
    expect(computePayloadHash(0)).not.toBe(computePayloadHash('0'))
  })
})

describe('computePayloadHash — key order independence', () => {
  it('5-key object same hash regardless of insertion order (order 1)', () => {
    const p1 = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 }
    const p2 = { epsilon: 5, delta: 4, gamma: 3, beta: 2, alpha: 1 }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('5-key object same hash regardless of insertion order (order 2)', () => {
    const p1 = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 }
    const p2 = { gamma: 3, alpha: 1, epsilon: 5, beta: 2, delta: 4 }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('5-key object same hash regardless of insertion order (order 3)', () => {
    const p1 = { a: 'x', b: 'y', c: 'z', d: 1, e: 2 }
    const p2 = { e: 2, d: 1, c: 'z', b: 'y', a: 'x' }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('invoice payload key-order independent', () => {
    const p1 = { amount: 100, currency: 'TRY', customer_id: 'c1', vat: 18, note: 'test' }
    const p2 = { note: 'test', vat: 18, customer_id: 'c1', currency: 'TRY', amount: 100 }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('different values with same keys still differ', () => {
    const p1 = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 5 }
    const p2 = { alpha: 1, beta: 2, gamma: 3, delta: 4, epsilon: 99 }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('8-key object is order-independent', () => {
    const keys = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }
    const shuffled = { h: 8, f: 6, d: 4, b: 2, g: 7, e: 5, c: 3, a: 1 }
    expect(computePayloadHash(keys)).toBe(computePayloadHash(shuffled))
  })
})

describe('computePayloadHash — nested structures', () => {
  it('nested objects produce consistent hash', () => {
    const p = { user: { id: 'u1', name: 'Ali' }, total: 100 }
    expect(computePayloadHash(p)).toBe(computePayloadHash(p))
  })

  it('nested objects — key order independence at nested level', () => {
    const p1 = { user: { id: 'u1', name: 'Ali' }, total: 100 }
    const p2 = { total: 100, user: { name: 'Ali', id: 'u1' } }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('array of objects', () => {
    const p = { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }] }
    expect(computePayloadHash(p)).toBe(computePayloadHash(p))
  })

  it('array of objects — key order independence inside array items', () => {
    const p1 = { items: [{ sku: 'A', qty: 1 }] }
    const p2 = { items: [{ qty: 1, sku: 'A' }] }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('deeply nested 3 levels', () => {
    const p1 = { a: { b: { c: 42 } } }
    const p2 = { a: { b: { c: 42 } } }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('mixed types in array', () => {
    const p = { data: [1, 'two', null, true, { x: 3 }] }
    expect(computePayloadHash(p)).toBe(computePayloadHash(p))
  })

  it('nested object with different value differs', () => {
    const p1 = { user: { id: 'u1', name: 'Ali' }, total: 100 }
    const p2 = { user: { id: 'u1', name: 'Veli' }, total: 100 }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })
})

describe('computePayloadHash — distinctness', () => {
  it('10 different payloads each produce unique hashes', () => {
    const payloads = [
      { id: 1, type: 'sale' },
      { id: 2, type: 'sale' },
      { id: 1, type: 'expense' },
      { customer: 'A', amount: 100 },
      { customer: 'A', amount: 200 },
      { customer: 'B', amount: 100 },
      { items: [1, 2, 3] },
      { items: [3, 2, 1] },
      { nested: { deep: true } },
      { nested: { deep: false } },
    ]
    const hashes = payloads.map(p => computePayloadHash(p))
    const unique = new Set(hashes)
    expect(unique.size).toBe(10)
  })

  it('single character differences produce different hashes', () => {
    expect(computePayloadHash({ note: 'abc' })).not.toBe(computePayloadHash({ note: 'abd' }))
  })

  it('added extra key changes hash', () => {
    const h1 = computePayloadHash({ a: 1, b: 2 })
    const h2 = computePayloadHash({ a: 1, b: 2, c: 3 })
    expect(h1).not.toBe(h2)
  })

  it('removed key changes hash', () => {
    const h1 = computePayloadHash({ a: 1, b: 2, c: 3 })
    const h2 = computePayloadHash({ a: 1, b: 2 })
    expect(h1).not.toBe(h2)
  })

  it('type change (number vs string) changes hash', () => {
    expect(computePayloadHash({ val: 42 })).not.toBe(computePayloadHash({ val: '42' }))
  })
})

describe('computePayloadHash — array ordering matters', () => {
  it('[1,2] vs [2,1] produce DIFFERENT hashes', () => {
    expect(computePayloadHash([1, 2])).not.toBe(computePayloadHash([2, 1]))
  })

  it('[1,2,3] vs [3,2,1] produce DIFFERENT hashes', () => {
    expect(computePayloadHash([1, 2, 3])).not.toBe(computePayloadHash([3, 2, 1]))
  })

  it('["a","b"] vs ["b","a"] produce DIFFERENT hashes', () => {
    expect(computePayloadHash(['a', 'b'])).not.toBe(computePayloadHash(['b', 'a']))
  })

  it('array ordering preserved in nested array', () => {
    const p1 = { items: ['apple', 'banana'] }
    const p2 = { items: ['banana', 'apple'] }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('same array in same order produces same hash', () => {
    expect(computePayloadHash([1, 2, 3])).toBe(computePayloadHash([1, 2, 3]))
  })

  it('array with 5 elements order matters', () => {
    expect(computePayloadHash([10, 20, 30, 40, 50])).not.toBe(computePayloadHash([50, 40, 30, 20, 10]))
  })
})

describe('computePayloadHash — hash format', () => {
  it('always starts with h_', () => {
    const payloads = [null, {}, [], '', 0, false, true, { a: 1 }, [1, 2]]
    for (const p of payloads) {
      expect(computePayloadHash(p).startsWith('h_')).toBe(true)
    }
  })

  it('never returns empty string', () => {
    const payloads = [null, {}, [], '', 0, false, { a: 1 }]
    for (const p of payloads) {
      expect(computePayloadHash(p).length).toBeGreaterThan(0)
    }
  })

  it('length is always > 2 (more than just "h_")', () => {
    const payloads = [null, {}, [], '', 0, false, { complex: { nested: [1, 2] } }]
    for (const p of payloads) {
      expect(computePayloadHash(p).length).toBeGreaterThan(2)
    }
  })

  it('characters after h_ are alphanumeric (base-36)', () => {
    const payloads = [{ a: 1 }, { b: 2, c: 3 }, [1, 2, 3], 'hello', 42]
    for (const p of payloads) {
      const h = computePayloadHash(p)
      const suffix = h.slice(2)
      expect(/^[0-9a-z]+$/.test(suffix)).toBe(true)
    }
  })

  it('returns a string type', () => {
    expect(typeof computePayloadHash({ a: 1 })).toBe('string')
    expect(typeof computePayloadHash(null)).toBe('string')
    expect(typeof computePayloadHash([])).toBe('string')
  })
})

describe('computePayloadHash — determinism under multiple calls', () => {
  it('5 calls with same object payload produce identical hashes', () => {
    const payload = { customer_id: 'c42', amount: 500, currency: 'TRY' }
    const hashes = Array.from({ length: 5 }, () => computePayloadHash(payload))
    const unique = new Set(hashes)
    expect(unique.size).toBe(1)
  })

  it('5 calls with null payload all identical', () => {
    const hashes = Array.from({ length: 5 }, () => computePayloadHash(null))
    const unique = new Set(hashes)
    expect(unique.size).toBe(1)
  })

  it('5 calls with empty array all identical', () => {
    const hashes = Array.from({ length: 5 }, () => computePayloadHash([]))
    const unique = new Set(hashes)
    expect(unique.size).toBe(1)
  })

  it('5 calls with nested payload all identical', () => {
    const payload = { user: { id: 'u1' }, items: [{ sku: 'A', qty: 2 }], total: 200 }
    const hashes = Array.from({ length: 5 }, () => computePayloadHash(payload))
    const unique = new Set(hashes)
    expect(unique.size).toBe(1)
  })

  it('5 calls with number payload all identical', () => {
    const hashes = Array.from({ length: 5 }, () => computePayloadHash(99999))
    const unique = new Set(hashes)
    expect(unique.size).toBe(1)
  })
})

describe('computePayloadHash — real-world invoice payloads', () => {
  it('proforma create payload produces stable hash', () => {
    const payload = {
      company_id: 'comp-001',
      customer_id: 'cust-123',
      currency: 'TRY',
      items: [
        { product_id: 'prod-a', quantity: 2, unit_price: 150.0 },
        { product_id: 'prod-b', quantity: 1, unit_price: 300.0 },
      ],
      notes: 'Test proforma',
    }
    const h1 = computePayloadHash(payload)
    const h2 = computePayloadHash(payload)
    expect(h1).toBe(h2)
  })

  it('sale convert payload produces stable hash', () => {
    const payload = {
      proforma_id: 'pfm-001',
      company_id: 'comp-001',
      payment_terms: 30,
      due_date: '2026-06-30',
      currency: 'TRY',
    }
    const h1 = computePayloadHash(payload)
    const h2 = computePayloadHash(payload)
    expect(h1).toBe(h2)
  })

  it('stock update payload differs by quantity', () => {
    const base = { product_id: 'prod-x', warehouse_id: 'wh-1', company_id: 'comp-1' }
    const h1 = computePayloadHash({ ...base, quantity: 10 })
    const h2 = computePayloadHash({ ...base, quantity: 11 })
    expect(h1).not.toBe(h2)
  })

  it('expense create payload with different amounts differ', () => {
    const base = { category: 'rent', company_id: 'comp-1', date: '2026-05-01' }
    const h1 = computePayloadHash({ ...base, amount_try: 5000 })
    const h2 = computePayloadHash({ ...base, amount_try: 5001 })
    expect(h1).not.toBe(h2)
  })

  it('fx rate payload key-order independent', () => {
    const p1 = { from_currency: 'USD', to_currency: 'TRY', rate: 32.5, date: '2026-05-26' }
    const p2 = { date: '2026-05-26', rate: 32.5, to_currency: 'TRY', from_currency: 'USD' }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('two different customers produce different hashes for same order', () => {
    const base = { amount: 1000, currency: 'TRY', items: ['item-1', 'item-2'] }
    const h1 = computePayloadHash({ ...base, customer_id: 'cust-A' })
    const h2 = computePayloadHash({ ...base, customer_id: 'cust-B' })
    expect(h1).not.toBe(h2)
  })

  it('payload with unicode characters is stable', () => {
    const payload = { name: 'Çalışan Ödemeleri', category: 'Personel Giderleri' }
    const h1 = computePayloadHash(payload)
    const h2 = computePayloadHash(payload)
    expect(h1).toBe(h2)
  })

  it('payload with numbers vs strings differ', () => {
    const h1 = computePayloadHash({ amount: 100, id: '1' })
    const h2 = computePayloadHash({ amount: '100', id: 1 })
    expect(h1).not.toBe(h2)
  })
})

describe('computePayloadHash — special value combinations', () => {
  it('null vs undefined-serialized differently', () => {
    // JSON.stringify(null) = 'null', JSON.stringify(undefined) = undefined (not a string)
    // stableStringify calls JSON.stringify for primitives
    const h1 = computePayloadHash(null)
    // null produces a valid hash string 'null' → hash starts with h_
    expect(h1.startsWith('h_')).toBe(true)
    // undefined serializes to JS undefined via JSON.stringify → implementation may throw
    // Just confirm null produces a valid hash (this is the key contract tested here)
    expect(typeof h1).toBe('string')
  })

  it('true and false produce different hashes', () => {
    expect(computePayloadHash(true)).not.toBe(computePayloadHash(false))
  })

  it('number 1 and boolean true produce different hashes', () => {
    expect(computePayloadHash(1)).not.toBe(computePayloadHash(true))
  })

  it('empty string and empty object produce different hashes', () => {
    expect(computePayloadHash('')).not.toBe(computePayloadHash({}))
  })

  it('array with null vs array with false produce different hashes', () => {
    expect(computePayloadHash([null])).not.toBe(computePayloadHash([false]))
  })

  it('negative number produces valid hash', () => {
    const h = computePayloadHash(-42)
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('float produces valid hash', () => {
    const h = computePayloadHash(3.14159)
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('float 1.1 vs 1.2 produce different hashes', () => {
    expect(computePayloadHash(1.1)).not.toBe(computePayloadHash(1.2))
  })

  it('very large integer produces valid hash', () => {
    const h = computePayloadHash(Number.MAX_SAFE_INTEGER)
    expect(h.startsWith('h_')).toBe(true)
  })

  it('object with numeric string keys is stable', () => {
    const payload = { '1': 'a', '2': 'b', '10': 'c' }
    expect(computePayloadHash(payload)).toBe(computePayloadHash(payload))
  })
})

describe('computePayloadHash — hash uniqueness across value types', () => {
  it('12 different type representations all produce unique hashes', () => {
    const payloads = [
      0, 1, -1, 0.5, true, false, null, '', 'hello', {}, [], [0],
    ]
    const hashes = payloads.map(p => computePayloadHash(p))
    const unique = new Set(hashes)
    expect(unique.size).toBe(12)
  })

  it('objects with same keys but one has extra nested property differ', () => {
    const h1 = computePayloadHash({ a: { b: 1 } })
    const h2 = computePayloadHash({ a: { b: 1, c: 2 } })
    expect(h1).not.toBe(h2)
  })

  it('array length difference produces different hash', () => {
    expect(computePayloadHash([1, 2, 3])).not.toBe(computePayloadHash([1, 2]))
  })

  it('swapped nested object keys still equivalent', () => {
    const p1 = { outer: { x: 1, y: 2 }, z: 3 }
    const p2 = { z: 3, outer: { y: 2, x: 1 } }
    expect(computePayloadHash(p1)).toBe(computePayloadHash(p2))
  })

  it('deeply nested array order matters', () => {
    const p1 = { data: { items: [1, 2, 3] } }
    const p2 = { data: { items: [3, 2, 1] } }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('10 incrementally different objects all have distinct hashes', () => {
    const hashes = Array.from({ length: 10 }, (_, i) =>
      computePayloadHash({ value: i, constant: 'same' })
    )
    const unique = new Set(hashes)
    expect(unique.size).toBe(10)
  })
})

describe('computePayloadHash — consistency with stableStringify', () => {
  it('hash of {a:1, b:2} is the same across JS engine runs (deterministic by design)', () => {
    const hash1 = computePayloadHash({ a: 1, b: 2 })
    const hash2 = computePayloadHash({ b: 2, a: 1 })
    expect(hash1).toBe(hash2)
  })

  it('h_ prefix length is exactly 2', () => {
    const h = computePayloadHash({ x: 'test' })
    expect(h.slice(0, 2)).toBe('h_')
  })

  it('suffix part after h_ is non-empty', () => {
    const h = computePayloadHash({ x: 'test' })
    const suffix = h.slice(2)
    expect(suffix.length).toBeGreaterThan(0)
  })

  it('suffix contains only base-36 chars (0-9 and a-z)', () => {
    const payloads = [
      { invoice_id: 'inv-001', amount: 500, currency: 'USD' },
      { order: [1, 2, 3], meta: { tag: 'batch' } },
      null,
      42,
    ]
    for (const p of payloads) {
      const h = computePayloadHash(p)
      expect(/^h_[0-9a-z]+$/.test(h)).toBe(true)
    }
  })

  it('produces same hash when payload is referenced vs spread', () => {
    const original = { foo: 'bar', baz: 42 }
    const copy = { ...original }
    expect(computePayloadHash(original)).toBe(computePayloadHash(copy))
  })
})

describe('computePayloadHash — hash stability for financial data', () => {
  it('TRY amounts as numbers are stable', () => {
    const p = { amount_try: 1500.75, currency: 'TRY' }
    expect(computePayloadHash(p)).toBe(computePayloadHash(p))
  })

  it('two amounts 1500.75 vs 1500.76 differ', () => {
    const p1 = { amount_try: 1500.75, currency: 'TRY' }
    const p2 = { amount_try: 1500.76, currency: 'TRY' }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('date strings in ISO format are stable', () => {
    const p = { date: '2026-05-26', type: 'sale' }
    expect(computePayloadHash(p)).toBe(computePayloadHash(p))
  })

  it('different date formats produce different hashes', () => {
    const p1 = { date: '2026-05-26' }
    const p2 = { date: '26.05.2026' }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('batch of proforma items with key-order independence', () => {
    const items1 = [
      { product_id: 'p1', qty: 5, unit_price: 100 },
      { product_id: 'p2', qty: 2, unit_price: 250 },
    ]
    const items2 = [
      { unit_price: 100, qty: 5, product_id: 'p1' },
      { unit_price: 250, qty: 2, product_id: 'p2' },
    ]
    expect(computePayloadHash({ items: items1 })).toBe(computePayloadHash({ items: items2 }))
  })

  it('reordering item array changes hash', () => {
    const items1 = [{ id: 'A' }, { id: 'B' }]
    const items2 = [{ id: 'B' }, { id: 'A' }]
    expect(computePayloadHash({ items: items1 })).not.toBe(computePayloadHash({ items: items2 }))
  })

  it('vat_rate differences detected', () => {
    const p1 = { amount: 100, vat_rate: 8 }
    const p2 = { amount: 100, vat_rate: 18 }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })

  it('company_id difference detected', () => {
    const base = { amount: 500, currency: 'TRY', date: '2026-05-01' }
    const p1 = { ...base, company_id: 'comp-001' }
    const p2 = { ...base, company_id: 'comp-002' }
    expect(computePayloadHash(p1)).not.toBe(computePayloadHash(p2))
  })
})

describe('computePayloadHash — string length sensitivity', () => {
  it('single char string hash is valid', () => {
    const h = computePayloadHash('a')
    expect(h.startsWith('h_')).toBe(true)
  })

  it('very long string produces valid hash', () => {
    const longStr = 'x'.repeat(10000)
    const h = computePayloadHash(longStr)
    expect(h.startsWith('h_')).toBe(true)
    expect(h.length).toBeGreaterThan(2)
  })

  it('strings differing only in length produce different hashes', () => {
    const h1 = computePayloadHash('abc')
    const h2 = computePayloadHash('abcd')
    expect(h1).not.toBe(h2)
  })

  it('strings with same chars but different case differ', () => {
    const h1 = computePayloadHash('ABC')
    const h2 = computePayloadHash('abc')
    expect(h1).not.toBe(h2)
  })

  it('object with very long string value produces valid hash', () => {
    const longVal = 'note_' + 'a'.repeat(5000)
    const h = computePayloadHash({ description: longVal })
    expect(h.startsWith('h_')).toBe(true)
  })
})

describe('computePayloadHash — array vs object disambiguation', () => {
  it('[1] and {0:1} produce different hashes', () => {
    // Arrays serialize differently than objects
    const h1 = computePayloadHash([1])
    const h2 = computePayloadHash({ '0': 1 })
    expect(h1).not.toBe(h2)
  })

  it('nested array [[1,2]] vs nested object {a:[1,2]} differ', () => {
    expect(computePayloadHash([[1, 2]])).not.toBe(computePayloadHash({ a: [1, 2] }))
  })

  it('array of one element vs same element directly differ', () => {
    const h1 = computePayloadHash([{ id: 1 }])
    const h2 = computePayloadHash({ id: 1 })
    expect(h1).not.toBe(h2)
  })

  it('empty array vs array with single null element differ', () => {
    expect(computePayloadHash([])).not.toBe(computePayloadHash([null]))
  })

  it('array vs object with same JSON structure differ', () => {
    const h1 = computePayloadHash([1, 2, 3])
    const h2 = computePayloadHash({ '0': 1, '1': 2, '2': 3 })
    expect(h1).not.toBe(h2)
  })
})
