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

  it('needs_setup when completion is 50%', () => {
    expect(assignOverallStatus(50, 5)).toBe('needs_setup')
  })

  it('needs_setup at 1% (just above zero)', () => {
    expect(assignOverallStatus(1, 5)).toBe('needs_setup')
  })

  it('just_started when completion is 0%', () => {
    expect(assignOverallStatus(0, 5)).toBe('just_started')
  })

  it('just_started at exactly 0 with total > 0', () => {
    expect(assignOverallStatus(0, 10)).toBe('just_started')
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

})
