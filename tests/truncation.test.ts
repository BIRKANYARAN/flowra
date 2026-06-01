// tests/truncation.test.ts
// Pure-function tests for the "no silent caps" truncation-warning helper.

import { describe, it, expect } from 'vitest'
import { aggregateTruncationWarning } from '../lib/finance/truncation'

describe('aggregateTruncationWarning', () => {
  it('returns null when every step is under its cap', () => {
    expect(aggregateTruncationWarning('x', [
      { name: 'a', count: 10, cap: 1000 },
      { name: 'b', count: 999, cap: 1000 },
    ])).toBeNull()
  })

  it('returns null for an empty step list', () => {
    expect(aggregateTruncationWarning('x', [])).toBeNull()
  })

  it('warns when a step exactly reaches its cap (>=, the truncation boundary)', () => {
    const w = aggregateTruncationWarning('receivables', [{ name: 'outstanding', count: 5000, cap: 5000 }])
    expect(w).not.toBeNull()
    expect(w).toContain('receivables')
    expect(w).toContain('outstanding=5000≥5000')
    expect(w).toContain('UNDERSTATED')
  })

  it('warns when a step exceeds its cap', () => {
    const w = aggregateTruncationWarning('aging', [{ name: 'rows', count: 6000, cap: 5000 }])
    expect(w).toContain('rows=6000≥5000')
  })

  it('lists ONLY the tripped steps, not the safe ones', () => {
    const w = aggregateTruncationWarning('mix', [
      { name: 'safe',    count: 5,    cap: 1000 },
      { name: 'tripped', count: 1000, cap: 1000 },
    ])!
    expect(w).toContain('tripped=1000≥1000')
    expect(w).not.toContain('safe=')
  })

  it('joins multiple tripped steps', () => {
    const w = aggregateTruncationWarning('multi', [
      { name: 'one', count: 100, cap: 100 },
      { name: 'two', count: 200, cap: 200 },
    ])!
    expect(w).toContain('one=100≥100')
    expect(w).toContain('two=200≥200')
  })

  it('embeds the label', () => {
    expect(aggregateTruncationWarning('my-label', [{ name: 'r', count: 9, cap: 9 }]))
      .toContain('[my-label]')
  })
})
