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
