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
})
