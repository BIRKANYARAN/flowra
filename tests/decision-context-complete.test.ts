// tests/decision-context-complete.test.ts
//
// Tests for the pure helper functions in decision-context.service.ts
// Does NOT modify tests/decision-context.test.ts
//
import { describe, it, expect } from 'vitest'
import {
  classifySnapshotAge,
  buildAnnotationTag,
  computeSnapshotDrift,
  summarizeChanges,
} from '../lib/services/decision-context/decision-context.service'
import type { ContextSnapshot } from '../lib/services/decision-context/decision-context.service'

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<{
  cash_try:                number
  cash_runway_months:      number
  net_income_try:          number
  revenue_trend:           'up' | 'down' | 'stable'
  situation_status:        'healthy' | 'caution' | 'at-risk' | 'critical'
  composite_score:         number
  total_partner_debt_try:  number
  active_partners:         number
  overfinanced_partners:   number
  total_receivables_try:   number
  overdue_receivables_try: number
  overdue_ratio:           number
  open_period_days:        number
  pending_workflows:       number
  recent_resolutions:      number
  computed_at:             string
}> = {}): ContextSnapshot {
  return {
    financial_state: {
      cash_try:            overrides.cash_try            ?? 100_000,
      cash_runway_months:  overrides.cash_runway_months  ?? 6,
      net_income_try:      overrides.net_income_try      ?? 20_000,
      revenue_trend:       overrides.revenue_trend       ?? 'stable',
      situation_status:    overrides.situation_status    ?? 'healthy',
      composite_score:     overrides.composite_score     ?? 70,
    },
    partner_state: {
      total_partner_debt_try:  overrides.total_partner_debt_try  ?? 50_000,
      active_partners:         overrides.active_partners         ?? 3,
      overfinanced_partners:   overrides.overfinanced_partners   ?? 0,
    },
    receivables_state: {
      total_receivables_try:   overrides.total_receivables_try   ?? 80_000,
      overdue_receivables_try: overrides.overdue_receivables_try ?? 10_000,
      overdue_ratio:           overrides.overdue_ratio           ?? 12.5,
    },
    governance_state: {
      open_period_days:    overrides.open_period_days    ?? 30,
      pending_workflows:   overrides.pending_workflows   ?? 2,
      recent_resolutions:  overrides.recent_resolutions  ?? 5,
    },
    computed_at: overrides.computed_at ?? new Date().toISOString(),
  }
}

// ── classifySnapshotAge ───────────────────────────────────────────────────────

describe('classifySnapshotAge', () => {
  it('returns fresh for a snapshot captured 1 hour ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('fresh')
  })

  it('returns fresh for a snapshot captured 23 hours ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('fresh')
  })

  it('returns stale for a snapshot captured exactly 24 hours ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('stale')
  })

  it('returns stale for a snapshot captured 3 days ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('stale')
  })

  it('returns stale for a snapshot captured 6 days 23 hours ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - (7 * 24 - 1) * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('stale')
  })

  it('returns outdated for a snapshot captured exactly 7 days ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('outdated')
  })

  it('returns outdated for a snapshot captured 8 days ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('outdated')
  })

  it('returns outdated for a snapshot captured 30 days ago', () => {
    const now = new Date('2024-06-15T12:00:00.000Z')
    const capturedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    expect(classifySnapshotAge(capturedAt, now.toISOString())).toBe('outdated')
  })
})

// ── buildAnnotationTag ────────────────────────────────────────────────────────

describe('buildAnnotationTag', () => {
  it('joins tags with comma and space', () => {
    expect(buildAnnotationTag(['alpha', 'beta', 'gamma'])).toBe('alpha, beta, gamma')
  })

  it('deduplicates identical tags', () => {
    expect(buildAnnotationTag(['foo', 'foo', 'bar'])).toBe('foo, bar')
  })

  it('trims whitespace from each tag', () => {
    expect(buildAnnotationTag(['  tag1  ', ' tag2 '])).toBe('tag1, tag2')
  })

  it('ignores empty or whitespace-only strings', () => {
    expect(buildAnnotationTag(['', '  ', 'real'])).toBe('real')
  })

  it('returns empty string for empty array', () => {
    expect(buildAnnotationTag([])).toBe('')
  })

  it('returns empty string for all-empty tags', () => {
    expect(buildAnnotationTag(['', '   ', ''])).toBe('')
  })

  it('caps output at 5 tags', () => {
    const result = buildAnnotationTag(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(result.split(', ')).toHaveLength(5)
    expect(result).toBe('a, b, c, d, e')
  })

  it('deduplication counts toward the 5-tag limit correctly', () => {
    // 'a' appears 3 times but counts as 1; should return a,b,c,d,e
    const result = buildAnnotationTag(['a', 'a', 'a', 'b', 'c', 'd', 'e', 'f'])
    const parts = result.split(', ')
    expect(parts).toHaveLength(5)
    expect(parts[0]).toBe('a')
  })

  it('handles a single tag', () => {
    expect(buildAnnotationTag(['solo'])).toBe('solo')
  })

  it('preserves case', () => {
    expect(buildAnnotationTag(['Alpha', 'BETA'])).toBe('Alpha, BETA')
  })
})

// ── computeSnapshotDrift ──────────────────────────────────────────────────────

describe('computeSnapshotDrift', () => {
  it('returns 0 for identical snapshots', () => {
    const snap = makeSnapshot()
    expect(computeSnapshotDrift(snap, snap)).toBe(0)
  })

  it('returns 0 for two independently-created equal snapshots', () => {
    const s1 = makeSnapshot()
    const s2 = makeSnapshot()
    expect(computeSnapshotDrift(s1, s2)).toBe(0)
  })

  it('returns a positive value when cash_try differs significantly', () => {
    const prev = makeSnapshot({ cash_try: 100_000 })
    const curr = makeSnapshot({ cash_try: 500_000 })
    expect(computeSnapshotDrift(prev, curr)).toBeGreaterThan(0)
  })

  it('returns a value between 0 and 100 inclusive', () => {
    const prev = makeSnapshot({ cash_try: 0 })
    const curr = makeSnapshot({ cash_try: 10_000_000, composite_score: 100, overdue_ratio: 100 })
    const drift = computeSnapshotDrift(prev, curr)
    expect(drift).toBeGreaterThanOrEqual(0)
    expect(drift).toBeLessThanOrEqual(100)
  })

  it('larger differences produce higher drift than smaller differences', () => {
    const base  = makeSnapshot()
    const small = makeSnapshot({ cash_try: 110_000 })   // +10k from 100k
    const large = makeSnapshot({ cash_try: 900_000 })   // +800k from 100k
    expect(computeSnapshotDrift(base, large)).toBeGreaterThan(computeSnapshotDrift(base, small))
  })

  it('drift is symmetric (order does not matter)', () => {
    const s1 = makeSnapshot({ cash_try: 100_000 })
    const s2 = makeSnapshot({ cash_try: 300_000 })
    expect(computeSnapshotDrift(s1, s2)).toBe(computeSnapshotDrift(s2, s1))
  })

  it('changes in multiple fields produce higher drift than a single-field change', () => {
    const base     = makeSnapshot()
    const oneField = makeSnapshot({ cash_try: 200_000 })
    const multi    = makeSnapshot({ cash_try: 200_000, composite_score: 30, overdue_ratio: 50 })
    expect(computeSnapshotDrift(base, multi)).toBeGreaterThan(computeSnapshotDrift(base, oneField))
  })
})

// ── summarizeChanges ──────────────────────────────────────────────────────────

describe('summarizeChanges', () => {
  it('returns a non-empty string for any two valid snapshots', () => {
    const s1 = makeSnapshot()
    const s2 = makeSnapshot({ cash_try: 200_000 })
    const result = summarizeChanges(s1, s2)
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a non-empty string for identical snapshots', () => {
    const snap = makeSnapshot()
    const result = summarizeChanges(snap, snap)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('mentions the leading changed field when cash changes drastically', () => {
    const prev = makeSnapshot({ cash_try: 10_000 })
    const curr = makeSnapshot({ cash_try: 900_000 })
    const result = summarizeChanges(prev, curr)
    expect(result).toContain('nakit')
  })

  it('mentions status change when situation_status changes', () => {
    const prev = makeSnapshot({ situation_status: 'healthy' })
    const curr = makeSnapshot({ situation_status: 'critical' })
    const result = summarizeChanges(prev, curr)
    expect(result).toContain('healthy')
    expect(result).toContain('critical')
  })

  it('mentions revenue trend change when it changes', () => {
    const prev = makeSnapshot({ revenue_trend: 'up' })
    const curr = makeSnapshot({ revenue_trend: 'down' })
    const result = summarizeChanges(prev, curr)
    expect(result).toContain('up')
    expect(result).toContain('down')
  })

  it('returns a string ending with a period', () => {
    const s1 = makeSnapshot()
    const s2 = makeSnapshot({ cash_try: 500_000 })
    const result = summarizeChanges(s1, s2)
    expect(result.endsWith('.')).toBe(true)
  })

  it('handles all-zero prev snapshot gracefully', () => {
    const prev = makeSnapshot({
      cash_try: 0, cash_runway_months: 0, net_income_try: 0,
      composite_score: 0, total_partner_debt_try: 0,
      active_partners: 0, overfinanced_partners: 0,
      total_receivables_try: 0, overdue_receivables_try: 0,
      overdue_ratio: 0, open_period_days: 0, pending_workflows: 0,
      recent_resolutions: 0,
    })
    const curr = makeSnapshot()
    expect(() => summarizeChanges(prev, curr)).not.toThrow()
    expect(summarizeChanges(prev, curr).length).toBeGreaterThan(0)
  })

  it('does not throw when both snapshots have all zero numeric fields', () => {
    const zeroSnap = makeSnapshot({
      cash_try: 0, cash_runway_months: 0, net_income_try: 0,
      composite_score: 0, total_partner_debt_try: 0,
      active_partners: 0, overfinanced_partners: 0,
      total_receivables_try: 0, overdue_receivables_try: 0,
      overdue_ratio: 0, open_period_days: 0, pending_workflows: 0,
      recent_resolutions: 0,
    })
    expect(() => summarizeChanges(zeroSnap, zeroSnap)).not.toThrow()
  })
})
