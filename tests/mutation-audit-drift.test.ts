// Node-env test for detectAmountDrift (lib/db/mutation-audit.ts) — the helper
// that flags amount changes beyond a tolerance during financial mutations.
import { describe, it, expect } from 'vitest'
import { detectAmountDrift } from '@/lib/db/mutation-audit'

describe('detectAmountDrift', () => {
  it('returns null when the change is within tolerance (default 0.01)', () => {
    expect(detectAmountDrift('total_try', { total_try: 100 }, { total_try: 100.005 })).toBeNull()
  })
  it('flags a drift beyond tolerance with old/new/delta', () => {
    const d = detectAmountDrift('total_try', { total_try: 100 }, { total_try: 105 })
    expect(d).not.toBeNull()
    expect(d).toMatchObject({ field: 'total_try', oldValue: 100, newValue: 105, delta: 5 })
    expect(d!.message).toContain('100.00 → 105.00')
  })
  it('treats a missing field as 0 on either side', () => {
    expect(detectAmountDrift('amt', {}, { amt: 50 })).toMatchObject({ oldValue: 0, newValue: 50, delta: 50 })
    expect(detectAmountDrift('amt', { amt: 50 }, {})).toMatchObject({ oldValue: 50, newValue: 0, delta: 50 })
  })
  it('respects a custom tolerance', () => {
    expect(detectAmountDrift('amt', { amt: 100 }, { amt: 104 }, 5)).toBeNull()   // 4 < 5
    expect(detectAmountDrift('amt', { amt: 100 }, { amt: 106 }, 5)).not.toBeNull() // 6 > 5
  })
})
