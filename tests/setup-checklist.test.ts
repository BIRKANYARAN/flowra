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
