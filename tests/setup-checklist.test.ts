/**
 * Tests for lib/services/intelligence/setup-checklist.service.ts
 *
 * Tests cover pure helpers:
 *   - computeCompletionPct
 *   - assignOverallStatus
 *   - findNextAction
 *
 * Run with: npx vitest run tests/setup-checklist.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  computeCompletionPct,
  assignOverallStatus,
  findNextAction,
} from '../lib/services/intelligence/setup-checklist.service'
import type { ChecklistItem } from '../lib/services/intelligence/setup-checklist.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(
  key:         string,
  category:    ChecklistItem['category'],
  is_required: boolean,
  status:      ChecklistItem['status'],
): ChecklistItem {
  return {
    key,
    category,
    label:             key,
    description:       '',
    status,
    action_href:       `/dashboard/${key}`,
    is_required,
    completion_detail: null,
  }
}

// ── computeCompletionPct ──────────────────────────────────────────────────────

describe('computeCompletionPct', () => {

  it('returns 0 when 0 of 5 required items complete', () => {
    expect(computeCompletionPct(0, 5)).toBe(0)
  })

  it('returns 100 when all 5 of 5 required items complete', () => {
    expect(computeCompletionPct(5, 5)).toBe(100)
  })

  it('returns 60 when 3 of 5 required items complete', () => {
    expect(computeCompletionPct(3, 5)).toBe(60)
  })

  it('returns 100 when requiredTotal is 0 (nothing required = fully set up)', () => {
    expect(computeCompletionPct(0, 0)).toBe(100)
  })

  it('rounds to integer (2 of 3 = 67%)', () => {
    const result = computeCompletionPct(2, 3)
    expect(result).toBe(67)
  })

  it('returns 50 for half completion', () => {
    expect(computeCompletionPct(5, 10)).toBe(50)
  })

  it('returns 20 for 1 of 5 required', () => {
    expect(computeCompletionPct(1, 5)).toBe(20)
  })

  it('rounds down for 1 of 7 (14.28%)', () => {
    expect(computeCompletionPct(1, 7)).toBe(14)
  })

  it('rounds up for 5 of 6 (83.33%)', () => {
    expect(computeCompletionPct(5, 6)).toBe(83)
  })

  it('returns 100 for 1 of 1', () => {
    expect(computeCompletionPct(1, 1)).toBe(100)
  })

  it('handles large numbers correctly', () => {
    expect(computeCompletionPct(75, 100)).toBe(75)
    expect(computeCompletionPct(999, 1000)).toBe(100) // rounds to 100
  })

})

// ── assignOverallStatus ───────────────────────────────────────────────────────

describe('assignOverallStatus', () => {

  it('ready when completion is 100%', () => {
    expect(assignOverallStatus(100, 5)).toBe('ready')
  })

  it('ready when requiredTotal is 0', () => {
    // 0 required items → pct=100 via computeCompletionPct, but test assignOverallStatus directly
    expect(assignOverallStatus(100, 0)).toBe('ready')
  })

  it('almost_ready when completion is exactly 80%', () => {
    expect(assignOverallStatus(80, 5)).toBe('almost_ready')
  })

  it('almost_ready when completion is 85%', () => {
    expect(assignOverallStatus(85, 5)).toBe('almost_ready')
  })

  it('almost_ready when completion is 99%', () => {
    expect(assignOverallStatus(99, 5)).toBe('almost_ready')
  })

  it('needs_setup when completion is 50%', () => {
    expect(assignOverallStatus(50, 5)).toBe('needs_setup')
  })

  it('needs_setup at 1% (just above zero)', () => {
    expect(assignOverallStatus(1, 5)).toBe('needs_setup')
  })

  it('needs_setup at 79% (just below almost_ready threshold)', () => {
    expect(assignOverallStatus(79, 5)).toBe('needs_setup')
  })

  it('just_started when completion is 0%', () => {
    expect(assignOverallStatus(0, 5)).toBe('just_started')
  })

  it('just_started at exactly 0 with total > 0', () => {
    expect(assignOverallStatus(0, 10)).toBe('just_started')
  })

  it('returns ready when requiredTotal is 0 regardless of pct', () => {
    expect(assignOverallStatus(0, 0)).toBe('ready')
  })

  it('assignOverallStatus is consistent with computeCompletionPct', () => {
    // 4 of 5 complete → 80% → almost_ready
    const pct = computeCompletionPct(4, 5)
    expect(pct).toBe(80)
    expect(assignOverallStatus(pct, 5)).toBe('almost_ready')
  })

  it('covers the full status ladder', () => {
    const cases: Array<[number, number, ReturnType<typeof assignOverallStatus>]> = [
      [0,   5, 'just_started'],
      [25,  5, 'needs_setup'],
      [60,  5, 'needs_setup'],
      [80,  5, 'almost_ready'],
      [95,  5, 'almost_ready'],
      [100, 5, 'ready'],
    ]
    for (const [pct, total, expected] of cases) {
      expect(assignOverallStatus(pct, total)).toBe(expected)
    }
  })

})

// ── findNextAction ────────────────────────────────────────────────────────────

describe('findNextAction', () => {

  it('returns null for empty array', () => {
    expect(findNextAction([])).toBeNull()
  })

  it('returns null when all required items are complete', () => {
    const items: ChecklistItem[] = [
      makeItem('a', 'foundation', true,  'complete'),
      makeItem('b', 'partners',   true,  'complete'),
      makeItem('c', 'finance',    false, 'optional_incomplete'),
    ]
    expect(findNextAction(items)).toBeNull()
  })

  it('finds the first incomplete required item', () => {
    const items: ChecklistItem[] = [
      makeItem('a', 'foundation', true, 'complete'),
      makeItem('b', 'partners',   true, 'incomplete'),
      makeItem('c', 'products',   true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('b')
  })

  it('skips optional items — only returns required incomplete', () => {
    const items: ChecklistItem[] = [
      makeItem('opt1', 'foundation', false, 'optional_incomplete'),
      makeItem('req1', 'partners',   true,  'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('req1')
  })

  it('respects category order (foundation before finance)', () => {
    const items: ChecklistItem[] = [
      makeItem('finance-item', 'finance',    true, 'incomplete'),
      makeItem('found-item',   'foundation', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('found-item')
  })

  it('returns null when only optional incomplete items exist', () => {
    const items: ChecklistItem[] = [
      makeItem('opt1', 'operations', false, 'optional_incomplete'),
      makeItem('opt2', 'governance', false, 'optional_incomplete'),
    ]
    expect(findNextAction(items)).toBeNull()
  })

  it('respects category order: partners before products', () => {
    const items: ChecklistItem[] = [
      makeItem('products-item', 'products', true, 'incomplete'),
      makeItem('partners-item', 'partners', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('partners-item')
  })

  it('respects category order: all 6 categories in order', () => {
    // foundation < partners < products < finance < operations < governance
    const items: ChecklistItem[] = [
      makeItem('gov',  'governance', true, 'incomplete'),
      makeItem('ops',  'operations', true, 'incomplete'),
      makeItem('fin',  'finance',    true, 'incomplete'),
      makeItem('prod', 'products',   true, 'incomplete'),
      makeItem('par',  'partners',   true, 'incomplete'),
      makeItem('fnd',  'foundation', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('fnd')
  })

  it('skips optional_complete items', () => {
    const items: ChecklistItem[] = [
      makeItem('opt1', 'foundation', false, 'optional_complete'),
      makeItem('req1', 'finance',    true,  'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('req1')
  })

  it('returns the action_href on the returned item', () => {
    const items: ChecklistItem[] = [
      makeItem('my-item', 'foundation', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.action_href).toBe('/dashboard/my-item')
  })

  it('returns null when all required items are optional_complete', () => {
    // optional_complete is not the same as 'incomplete' — required items only checked for 'incomplete'
    const items: ChecklistItem[] = [
      makeItem('a', 'foundation', true, 'complete'),
      makeItem('b', 'partners',   true, 'complete'),
    ]
    expect(findNextAction(items)).toBeNull()
  })

  it('does not mutate the original array', () => {
    const items: ChecklistItem[] = [
      makeItem('b', 'finance',    true, 'incomplete'),
      makeItem('a', 'foundation', true, 'incomplete'),
    ]
    const originalOrder = items.map(i => i.key)
    findNextAction(items)
    expect(items.map(i => i.key)).toEqual(originalOrder)
  })

})

// ── computeCompletionPct — additional coverage ────────────────────────────────

describe('computeCompletionPct — additional edge cases', () => {
  it('returns 100 when all items complete — 1 of 1', () => {
    expect(computeCompletionPct(1, 1)).toBe(100)
  })

  it('returns 0 when no items complete — 0 of 10', () => {
    expect(computeCompletionPct(0, 10)).toBe(0)
  })

  it('returns 50 for exactly half — 5 of 10', () => {
    expect(computeCompletionPct(5, 10)).toBe(50)
  })

  it('handles mixed true/false state — 3 complete, 3 incomplete of 6 required', () => {
    // 3/6 = 50%
    expect(computeCompletionPct(3, 6)).toBe(50)
  })

  it('rounds correctly for 1 of 4 (25.0%)', () => {
    expect(computeCompletionPct(1, 4)).toBe(25)
  })

  it('rounds correctly for 3 of 4 (75.0%)', () => {
    expect(computeCompletionPct(3, 4)).toBe(75)
  })

  it('rounds correctly for 2 of 9 (22.22... → 22)', () => {
    expect(computeCompletionPct(2, 9)).toBe(22)
  })

  it('rounds correctly for 7 of 9 (77.77... → 78)', () => {
    expect(computeCompletionPct(7, 9)).toBe(78)
  })

  it('handles large total — 80 of 100 required', () => {
    expect(computeCompletionPct(80, 100)).toBe(80)
  })

  it('result is always an integer', () => {
    const result = computeCompletionPct(1, 3)
    expect(Number.isInteger(result)).toBe(true)
  })
})

// ── assignOverallStatus — additional threshold tests ─────────────────────────

describe('assignOverallStatus — threshold boundary precision', () => {
  it('exactly 100% → ready', () => {
    expect(assignOverallStatus(100, 5)).toBe('ready')
  })

  it('exactly 80% → almost_ready', () => {
    expect(assignOverallStatus(80, 5)).toBe('almost_ready')
  })

  it('79% → needs_setup (just below almost_ready threshold)', () => {
    expect(assignOverallStatus(79, 5)).toBe('needs_setup')
  })

  it('1% → needs_setup (just above just_started threshold)', () => {
    expect(assignOverallStatus(1, 5)).toBe('needs_setup')
  })

  it('0% → just_started', () => {
    expect(assignOverallStatus(0, 5)).toBe('just_started')
  })

  it('requiredTotal=0 always returns ready regardless of pct passed', () => {
    expect(assignOverallStatus(0, 0)).toBe('ready')
    expect(assignOverallStatus(50, 0)).toBe('ready')
  })

  it('98% → almost_ready (below 100 but above 80)', () => {
    expect(assignOverallStatus(98, 5)).toBe('almost_ready')
  })

  it('40% → needs_setup', () => {
    expect(assignOverallStatus(40, 5)).toBe('needs_setup')
  })

  it('result always in the 4 allowed values', () => {
    const allowed = ['ready', 'almost_ready', 'needs_setup', 'just_started']
    const tests = [0, 1, 20, 40, 60, 79, 80, 99, 100]
    for (const pct of tests) {
      expect(allowed).toContain(assignOverallStatus(pct, 5))
    }
  })
})

// ── findNextAction — additional items/states ──────────────────────────────────

describe('findNextAction — null status and optional items coexistence', () => {
  it('returns first incomplete required item when optional_incomplete items also exist', () => {
    const items: ChecklistItem[] = [
      makeItem('opt1', 'foundation', false, 'optional_incomplete'),
      makeItem('req1', 'foundation', true,  'incomplete'),
      makeItem('opt2', 'partners',   false, 'optional_incomplete'),
      makeItem('req2', 'partners',   true,  'complete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('req1')
  })

  it('with all items complete (required and optional), returns null', () => {
    const items: ChecklistItem[] = [
      makeItem('f1', 'foundation', true,  'complete'),
      makeItem('f2', 'foundation', false, 'optional_complete'),
      makeItem('p1', 'partners',   true,  'complete'),
      makeItem('p2', 'partners',   false, 'optional_incomplete'),
    ]
    expect(findNextAction(items)).toBeNull()
  })

  it('returns governance item when it is the only incomplete required item', () => {
    const items: ChecklistItem[] = [
      makeItem('f',   'foundation', true, 'complete'),
      makeItem('pa',  'partners',   true, 'complete'),
      makeItem('pr',  'products',   true, 'complete'),
      makeItem('fi',  'finance',    true, 'complete'),
      makeItem('op',  'operations', true, 'complete'),
      makeItem('gov', 'governance', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('gov')
  })

  it('returns operations item before governance item', () => {
    const items: ChecklistItem[] = [
      makeItem('gov', 'governance', true, 'incomplete'),
      makeItem('ops', 'operations', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.key).toBe('ops')
  })

  it('correctly handles a mix of all status types', () => {
    const items: ChecklistItem[] = [
      makeItem('r1',  'foundation', true,  'complete'),
      makeItem('r2',  'partners',   true,  'incomplete'),
      makeItem('opt', 'products',   false, 'optional_complete'),
      makeItem('r3',  'finance',    true,  'incomplete'),
    ]
    const result = findNextAction(items)
    // r2 in partners is first incomplete required (partners before finance)
    expect(result?.key).toBe('r2')
  })

  it('returns is_required=true on the returned item', () => {
    const items: ChecklistItem[] = [
      makeItem('req', 'foundation', true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.is_required).toBe(true)
  })

  it('the returned item status is always "incomplete"', () => {
    const items: ChecklistItem[] = [
      makeItem('req1', 'foundation', true, 'complete'),
      makeItem('req2', 'partners',   true, 'incomplete'),
    ]
    const result = findNextAction(items)
    expect(result?.status).toBe('incomplete')
  })
})

// ── computeCompletionPct — rounding edge cases ────────────────────────────────

describe('computeCompletionPct — rounding at Math.round boundary', () => {
  it('2 of 3 = 66.67 → rounds to 67', () => {
    expect(computeCompletionPct(2, 3)).toBe(67)
  })

  it('1 of 3 = 33.33 → rounds to 33', () => {
    expect(computeCompletionPct(1, 3)).toBe(33)
  })

  it('4 of 6 = 66.67 → rounds to 67', () => {
    expect(computeCompletionPct(4, 6)).toBe(67)
  })

  it('1 of 8 = 12.5 → rounds to 13', () => {
    expect(computeCompletionPct(1, 8)).toBe(13)
  })

  it('3 of 8 = 37.5 → rounds to 38', () => {
    expect(computeCompletionPct(3, 8)).toBe(38)
  })

  it('5 of 8 = 62.5 → rounds to 63', () => {
    expect(computeCompletionPct(5, 8)).toBe(63)
  })

  it('7 of 8 = 87.5 → rounds to 88', () => {
    expect(computeCompletionPct(7, 8)).toBe(88)
  })

  it('result is always between 0 and 100 inclusive', () => {
    const cases: Array<[number, number]> = [
      [0, 1], [1, 1], [0, 5], [5, 5], [3, 7], [0, 0],
    ]
    for (const [complete, total] of cases) {
      const result = computeCompletionPct(complete, total)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(100)
    }
  })
})

// ── assignOverallStatus — integration with computeCompletionPct ───────────────

describe('assignOverallStatus — integration with computeCompletionPct output', () => {
  it('0/5 → 0% → just_started', () => {
    const pct = computeCompletionPct(0, 5)
    expect(assignOverallStatus(pct, 5)).toBe('just_started')
  })

  it('1/5 → 20% → needs_setup', () => {
    const pct = computeCompletionPct(1, 5)
    expect(assignOverallStatus(pct, 5)).toBe('needs_setup')
  })

  it('2/5 → 40% → needs_setup', () => {
    const pct = computeCompletionPct(2, 5)
    expect(assignOverallStatus(pct, 5)).toBe('needs_setup')
  })

  it('3/5 → 60% → needs_setup', () => {
    const pct = computeCompletionPct(3, 5)
    expect(assignOverallStatus(pct, 5)).toBe('needs_setup')
  })

  it('4/5 → 80% → almost_ready', () => {
    const pct = computeCompletionPct(4, 5)
    expect(assignOverallStatus(pct, 5)).toBe('almost_ready')
  })

  it('5/5 → 100% → ready', () => {
    const pct = computeCompletionPct(5, 5)
    expect(assignOverallStatus(pct, 5)).toBe('ready')
  })

  it('0/0 → 100% (nothing required) → ready', () => {
    const pct = computeCompletionPct(0, 0)
    expect(assignOverallStatus(pct, 0)).toBe('ready')
  })
})

// ── findNextAction — category ordering for all 6 categories ──────────────────

describe('findNextAction — exhaustive category ordering', () => {
  it('foundation comes before partners in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('par', 'partners',   true, 'incomplete'),
      makeItem('fnd', 'foundation', true, 'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('fnd')
  })

  it('partners comes before products in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('prod', 'products', true, 'incomplete'),
      makeItem('par',  'partners', true, 'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('par')
  })

  it('products comes before finance in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('fin',  'finance',  true, 'incomplete'),
      makeItem('prod', 'products', true, 'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('prod')
  })

  it('finance comes before operations in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('ops', 'operations', true, 'incomplete'),
      makeItem('fin', 'finance',    true, 'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('fin')
  })

  it('operations comes before governance in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('gov', 'governance', true, 'incomplete'),
      makeItem('ops', 'operations', true, 'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('ops')
  })

  it('skips complete required items and returns first incomplete in category order', () => {
    const items: ChecklistItem[] = [
      makeItem('fnd-c',   'foundation', true, 'complete'),
      makeItem('par-c',   'partners',   true, 'complete'),
      makeItem('prod-inc','products',   true, 'incomplete'),
      makeItem('fin-inc', 'finance',    true, 'incomplete'),
    ]
    // products before finance in order
    expect(findNextAction(items)?.key).toBe('prod-inc')
  })

  it('single required item in governance with all others optional returns that item', () => {
    const items: ChecklistItem[] = [
      makeItem('opt-fnd', 'foundation', false, 'optional_incomplete'),
      makeItem('req-gov', 'governance', true,  'incomplete'),
    ]
    expect(findNextAction(items)?.key).toBe('req-gov')
  })
})
