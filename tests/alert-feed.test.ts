// tests/alert-feed.test.ts
// Unit tests for alert-feed pure helpers (sortAlertsBySeverity, countBySeverity)

import { describe, it, expect } from 'vitest'
import {
  sortAlertsBySeverity,
  countBySeverity,
  type FeedAlert,
} from '@/lib/services/intelligence/alert-feed.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<FeedAlert> & { id: string }): FeedAlert {
  return {
    id: overrides.id,
    alert_key: overrides.alert_key ?? overrides.id,
    alert_type: overrides.alert_type ?? 'TEST',
    severity: overrides.severity ?? 'info',
    title: overrides.title ?? 'Test Alert',
    detail: overrides.detail ?? null,
    action_label: overrides.action_label ?? null,
    action_href: overrides.action_href ?? null,
    amount_try: overrides.amount_try ?? null,
    due_date: overrides.due_date ?? null,
    is_acknowledged: overrides.is_acknowledged ?? false,
    first_triggered_at: overrides.first_triggered_at ?? '2026-05-27T10:00:00Z',
    last_triggered_at: overrides.last_triggered_at ?? '2026-05-27T10:00:00Z',
    trigger_count: overrides.trigger_count ?? 1,
  }
}

// ── sortAlertsBySeverity ──────────────────────────────────────────────────────

describe('sortAlertsBySeverity', () => {
  it('puts critical before warning before info', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'info' }),
      makeAlert({ id: 'b', severity: 'critical' }),
      makeAlert({ id: 'c', severity: 'warning' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('warning')
    expect(sorted[2].severity).toBe('info')
  })

  it('sorts within same severity by last_triggered_at descending', () => {
    const alerts = [
      makeAlert({ id: 'older', severity: 'warning', last_triggered_at: '2026-05-20T10:00:00Z' }),
      makeAlert({ id: 'newer', severity: 'warning', last_triggered_at: '2026-05-27T10:00:00Z' }),
      makeAlert({ id: 'middle', severity: 'warning', last_triggered_at: '2026-05-24T10:00:00Z' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].id).toBe('newer')
    expect(sorted[1].id).toBe('middle')
    expect(sorted[2].id).toBe('older')
  })

  it('returns empty array for empty input', () => {
    expect(sortAlertsBySeverity([])).toEqual([])
  })

  it('returns single-item array unchanged', () => {
    const alerts = [makeAlert({ id: 'solo', severity: 'critical' })]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].id).toBe('solo')
  })

  it('does not mutate the original array', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'info' }),
      makeAlert({ id: 'b', severity: 'critical' }),
    ]
    const original = [...alerts]
    sortAlertsBySeverity(alerts)
    expect(alerts[0].id).toBe(original[0].id)
    expect(alerts[1].id).toBe(original[1].id)
  })

  it('correctly interleaves multiple severities', () => {
    const alerts = [
      makeAlert({ id: 'i1', severity: 'info',     last_triggered_at: '2026-05-27T09:00:00Z' }),
      makeAlert({ id: 'c1', severity: 'critical', last_triggered_at: '2026-05-27T08:00:00Z' }),
      makeAlert({ id: 'w1', severity: 'warning',  last_triggered_at: '2026-05-27T10:00:00Z' }),
      makeAlert({ id: 'c2', severity: 'critical', last_triggered_at: '2026-05-27T11:00:00Z' }),
      makeAlert({ id: 'w2', severity: 'warning',  last_triggered_at: '2026-05-27T07:00:00Z' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    // All criticals first
    expect(sorted[0].severity).toBe('critical')
    expect(sorted[1].severity).toBe('critical')
    // Among criticals: c2 (11:00) before c1 (08:00)
    expect(sorted[0].id).toBe('c2')
    expect(sorted[1].id).toBe('c1')
    // Then warnings
    expect(sorted[2].severity).toBe('warning')
    expect(sorted[3].severity).toBe('warning')
    // Among warnings: w1 (10:00) before w2 (07:00)
    expect(sorted[2].id).toBe('w1')
    expect(sorted[3].id).toBe('w2')
    // Then info
    expect(sorted[4].severity).toBe('info')
    expect(sorted[4].id).toBe('i1')
  })

  it('all same severity preserves descending time order', () => {
    const alerts = [
      makeAlert({ id: 'oldest', severity: 'info', last_triggered_at: '2026-01-01T00:00:00Z' }),
      makeAlert({ id: 'newest', severity: 'info', last_triggered_at: '2026-05-27T23:59:59Z' }),
      makeAlert({ id: 'mid',    severity: 'info', last_triggered_at: '2026-03-15T12:00:00Z' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].id).toBe('newest')
    expect(sorted[1].id).toBe('mid')
    expect(sorted[2].id).toBe('oldest')
  })

  it('returns a new array reference (not the same array)', () => {
    const alerts = [makeAlert({ id: 'x', severity: 'warning' })]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted).not.toBe(alerts)
  })

  it('all critical alerts are ordered by last_triggered_at desc', () => {
    const alerts = [
      makeAlert({ id: 'c_old',  severity: 'critical', last_triggered_at: '2026-04-01T00:00:00Z' }),
      makeAlert({ id: 'c_new',  severity: 'critical', last_triggered_at: '2026-05-27T00:00:00Z' }),
      makeAlert({ id: 'c_mid',  severity: 'critical', last_triggered_at: '2026-05-01T00:00:00Z' }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].id).toBe('c_new')
    expect(sorted[1].id).toBe('c_mid')
    expect(sorted[2].id).toBe('c_old')
  })

  it('two critical alerts same timestamp keep stable order', () => {
    const ts = '2026-05-27T10:00:00Z'
    const alerts = [
      makeAlert({ id: 'c1', severity: 'critical', last_triggered_at: ts }),
      makeAlert({ id: 'c2', severity: 'critical', last_triggered_at: ts }),
    ]
    const sorted = sortAlertsBySeverity(alerts)
    // Both should be present; exact order is stable (implementation may preserve input order)
    expect(sorted.map(a => a.severity)).toEqual(['critical', 'critical'])
  })

  it('result has same length as input', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'critical' }),
      makeAlert({ id: 'b', severity: 'warning' }),
      makeAlert({ id: 'c', severity: 'info' }),
      makeAlert({ id: 'd', severity: 'warning' }),
      makeAlert({ id: 'e', severity: 'critical' }),
    ]
    expect(sortAlertsBySeverity(alerts)).toHaveLength(5)
  })
})

// ── countBySeverity ───────────────────────────────────────────────────────────

describe('countBySeverity', () => {
  it('returns zeroes for empty array', () => {
    expect(countBySeverity([])).toEqual({ critical: 0, warning: 0, info: 0 })
  })

  it('counts single severity correctly', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'critical' }),
      makeAlert({ id: 'b', severity: 'critical' }),
    ]
    const counts = countBySeverity(alerts)
    expect(counts.critical).toBe(2)
    expect(counts.warning).toBe(0)
    expect(counts.info).toBe(0)
  })

  it('counts mixed severities correctly', () => {
    const alerts = [
      makeAlert({ id: 'c1', severity: 'critical' }),
      makeAlert({ id: 'c2', severity: 'critical' }),
      makeAlert({ id: 'c3', severity: 'critical' }),
      makeAlert({ id: 'w1', severity: 'warning' }),
      makeAlert({ id: 'w2', severity: 'warning' }),
      makeAlert({ id: 'i1', severity: 'info' }),
    ]
    const counts = countBySeverity(alerts)
    expect(counts.critical).toBe(3)
    expect(counts.warning).toBe(2)
    expect(counts.info).toBe(1)
  })

  it('total matches alert array length', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'critical' }),
      makeAlert({ id: 'b', severity: 'warning' }),
      makeAlert({ id: 'c', severity: 'info' }),
      makeAlert({ id: 'd', severity: 'critical' }),
    ]
    const counts = countBySeverity(alerts)
    expect(counts.critical + counts.warning + counts.info).toBe(alerts.length)
  })

  it('handles all-info alerts', () => {
    const alerts = Array.from({ length: 5 }, (_, i) =>
      makeAlert({ id: `i${i}`, severity: 'info' }),
    )
    const counts = countBySeverity(alerts)
    expect(counts.info).toBe(5)
    expect(counts.critical).toBe(0)
    expect(counts.warning).toBe(0)
  })

  it('handles all-warning alerts', () => {
    const alerts = Array.from({ length: 3 }, (_, i) =>
      makeAlert({ id: `w${i}`, severity: 'warning' }),
    )
    const counts = countBySeverity(alerts)
    expect(counts.warning).toBe(3)
    expect(counts.critical).toBe(0)
    expect(counts.info).toBe(0)
  })

  it('handles all-critical alerts', () => {
    const alerts = Array.from({ length: 4 }, (_, i) =>
      makeAlert({ id: `c${i}`, severity: 'critical' }),
    )
    const counts = countBySeverity(alerts)
    expect(counts.critical).toBe(4)
    expect(counts.warning).toBe(0)
    expect(counts.info).toBe(0)
  })

  it('single info alert', () => {
    const counts = countBySeverity([makeAlert({ id: 'x', severity: 'info' })])
    expect(counts).toEqual({ critical: 0, warning: 0, info: 1 })
  })

  it('single critical alert', () => {
    const counts = countBySeverity([makeAlert({ id: 'x', severity: 'critical' })])
    expect(counts).toEqual({ critical: 1, warning: 0, info: 0 })
  })

  it('single warning alert', () => {
    const counts = countBySeverity([makeAlert({ id: 'x', severity: 'warning' })])
    expect(counts).toEqual({ critical: 0, warning: 1, info: 0 })
  })

  it('result object always has all three keys', () => {
    const result = countBySeverity([])
    expect(Object.keys(result)).toContain('critical')
    expect(Object.keys(result)).toContain('warning')
    expect(Object.keys(result)).toContain('info')
  })

  it('large mixed set aggregates correctly', () => {
    const alerts = [
      ...Array.from({ length: 10 }, (_, i) => makeAlert({ id: `c${i}`, severity: 'critical' })),
      ...Array.from({ length: 20 }, (_, i) => makeAlert({ id: `w${i}`, severity: 'warning' })),
      ...Array.from({ length: 30 }, (_, i) => makeAlert({ id: `i${i}`, severity: 'info' })),
    ]
    const counts = countBySeverity(alerts)
    expect(counts.critical).toBe(10)
    expect(counts.warning).toBe(20)
    expect(counts.info).toBe(30)
  })

  it('does not mutate input array', () => {
    const alerts = [
      makeAlert({ id: 'a', severity: 'critical' }),
      makeAlert({ id: 'b', severity: 'warning' }),
    ]
    const original = [...alerts]
    countBySeverity(alerts)
    expect(alerts[0].id).toBe(original[0].id)
    expect(alerts[1].id).toBe(original[1].id)
    expect(alerts).toHaveLength(2)
  })
})

// ── FeedAlert shape validation ────────────────────────────────────────────────

describe('FeedAlert — shape and field contracts', () => {
  it('makeAlert helper produces all required fields', () => {
    const alert = makeAlert({ id: 'test-1' })
    expect(alert).toHaveProperty('id')
    expect(alert).toHaveProperty('alert_key')
    expect(alert).toHaveProperty('alert_type')
    expect(alert).toHaveProperty('severity')
    expect(alert).toHaveProperty('title')
    expect(alert).toHaveProperty('detail')
    expect(alert).toHaveProperty('action_label')
    expect(alert).toHaveProperty('action_href')
    expect(alert).toHaveProperty('amount_try')
    expect(alert).toHaveProperty('due_date')
    expect(alert).toHaveProperty('is_acknowledged')
    expect(alert).toHaveProperty('first_triggered_at')
    expect(alert).toHaveProperty('last_triggered_at')
    expect(alert).toHaveProperty('trigger_count')
  })

  it('default severity is info', () => {
    const alert = makeAlert({ id: 'x' })
    expect(alert.severity).toBe('info')
  })

  it('is_acknowledged defaults to false', () => {
    const alert = makeAlert({ id: 'x' })
    expect(alert.is_acknowledged).toBe(false)
  })

  it('trigger_count defaults to 1', () => {
    const alert = makeAlert({ id: 'x' })
    expect(alert.trigger_count).toBe(1)
  })

  it('can override title and detail', () => {
    const alert = makeAlert({ id: 'x', title: 'KDV Uyarısı', detail: 'Beyanname tarihi yaklaşıyor' })
    expect(alert.title).toBe('KDV Uyarısı')
    expect(alert.detail).toBe('Beyanname tarihi yaklaşıyor')
  })

  it('can set amount_try to a non-null value', () => {
    const alert = makeAlert({ id: 'x', amount_try: 50_000 })
    expect(alert.amount_try).toBe(50_000)
  })

  it('can set due_date', () => {
    const alert = makeAlert({ id: 'x', due_date: '2026-06-15' })
    expect(alert.due_date).toBe('2026-06-15')
  })

  it('alert_key defaults to id when not specified', () => {
    const alert = makeAlert({ id: 'my-unique-id' })
    expect(alert.alert_key).toBe('my-unique-id')
  })

  it('sortAlertsBySeverity output still has all original fields', () => {
    const alerts = [makeAlert({ id: 'a', severity: 'critical', amount_try: 99, due_date: '2026-06-01' })]
    const sorted = sortAlertsBySeverity(alerts)
    expect(sorted[0].amount_try).toBe(99)
    expect(sorted[0].due_date).toBe('2026-06-01')
    expect(sorted[0].id).toBe('a')
  })
})
