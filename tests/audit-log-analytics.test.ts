/**
 * FAZ 13 — Denetim Kaydı Yükseltmesi: business-logic unit tests
 *
 * Tests the pure analytics functions in admin/audit/page.tsx:
 *   1. actionDistribution()  — counts per action key (create/update/delete)
 *   2. entityTypeSummary()   — [{type, count}] sorted desc by count
 *   3. thisMonthCount()      — logs matching a given YYYY-MM
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/audit-log-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from admin/audit/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

type AuditAction = 'create' | 'update' | 'delete'

interface LogStub {
  action:      AuditAction
  entity_type: string
  created_at:  string
}

function actionDistribution(logs: LogStub[]): Record<string, number> {
  const counts: Record<string, number> = { create: 0, update: 0, delete: 0 }
  for (const log of logs) {
    counts[log.action] = (counts[log.action] ?? 0) + 1
  }
  return counts
}

function entityTypeSummary(logs: LogStub[]): { type: string; count: number }[] {
  const map = new Map<string, number>()
  for (const log of logs) {
    map.set(log.entity_type, (map.get(log.entity_type) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}

function thisMonthCount(logs: LogStub[], ym: string): number {
  return logs.filter(log => log.created_at.slice(0, 7) === ym).length
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<LogStub> = {}): LogStub {
  return {
    action:      'create',
    entity_type: 'sale',
    created_at:  '2024-06-15T10:00:00Z',
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. actionDistribution
// ─────────────────────────────────────────────────────────────────────────────

describe('actionDistribution()', () => {
  it('returns all zeroes for empty logs', () => {
    const d = actionDistribution([])
    expect(d.create).toBe(0)
    expect(d.update).toBe(0)
    expect(d.delete).toBe(0)
  })

  it('counts each action type correctly', () => {
    const logs = [
      makeLog({ action: 'create' }),
      makeLog({ action: 'create' }),
      makeLog({ action: 'create' }),
      makeLog({ action: 'update' }),
      makeLog({ action: 'update' }),
      makeLog({ action: 'delete' }),
    ]
    const d = actionDistribution(logs)
    expect(d.create).toBe(3)
    expect(d.update).toBe(2)
    expect(d.delete).toBe(1)
  })

  it('all creates — update and delete stay zero', () => {
    const logs = [
      makeLog({ action: 'create' }),
      makeLog({ action: 'create' }),
    ]
    const d = actionDistribution(logs)
    expect(d.create).toBe(2)
    expect(d.update).toBe(0)
    expect(d.delete).toBe(0)
  })

  it('single delete entry', () => {
    const logs = [makeLog({ action: 'delete' })]
    const d = actionDistribution(logs)
    expect(d.create).toBe(0)
    expect(d.update).toBe(0)
    expect(d.delete).toBe(1)
  })

  it('preserves unknown action keys as well', () => {
    // In practice only create/update/delete exist, but the function
    // must not crash on unexpected action values
    const logs = [
      makeLog({ action: 'create' }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'restore' as any, entity_type: 'sale', created_at: '2024-01-01T00:00:00Z' },
    ]
    const d = actionDistribution(logs)
    expect(d.create).toBe(1)
    expect(d['restore']).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. entityTypeSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('entityTypeSummary()', () => {
  it('returns empty array for empty logs', () => {
    expect(entityTypeSummary([])).toEqual([])
  })

  it('counts each entity_type and sorts descending', () => {
    const logs = [
      makeLog({ entity_type: 'sale'     }),
      makeLog({ entity_type: 'sale'     }),
      makeLog({ entity_type: 'sale'     }),
      makeLog({ entity_type: 'expense'  }),
      makeLog({ entity_type: 'expense'  }),
      makeLog({ entity_type: 'purchase' }),
    ]
    const result = entityTypeSummary(logs)
    expect(result[0]).toEqual({ type: 'sale',     count: 3 })
    expect(result[1]).toEqual({ type: 'expense',  count: 2 })
    expect(result[2]).toEqual({ type: 'purchase', count: 1 })
  })

  it('returns one entry when all logs have the same entity_type', () => {
    const logs = [
      makeLog({ entity_type: 'stock_movement' }),
      makeLog({ entity_type: 'stock_movement' }),
    ]
    const result = entityTypeSummary(logs)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'stock_movement', count: 2 })
  })

  it('handles a single log', () => {
    const logs = [makeLog({ entity_type: 'partner' })]
    const result = entityTypeSummary(logs)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'partner', count: 1 })
  })

  it('highest count is always first', () => {
    const logs = [
      makeLog({ entity_type: 'purchase' }),
      makeLog({ entity_type: 'sale'     }),
      makeLog({ entity_type: 'sale'     }),
      makeLog({ entity_type: 'expense'  }),
      makeLog({ entity_type: 'expense'  }),
      makeLog({ entity_type: 'expense'  }),
    ]
    const result = entityTypeSummary(logs)
    expect(result[0].type).toBe('expense')
    expect(result[0].count).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. thisMonthCount
// ─────────────────────────────────────────────────────────────────────────────

describe('thisMonthCount()', () => {
  it('returns 0 for empty logs', () => {
    expect(thisMonthCount([], '2024-06')).toBe(0)
  })

  it('counts logs matching the given YYYY-MM', () => {
    const logs = [
      makeLog({ created_at: '2024-06-01T00:00:00Z' }),
      makeLog({ created_at: '2024-06-15T12:00:00Z' }),
      makeLog({ created_at: '2024-06-30T23:59:59Z' }),
      makeLog({ created_at: '2024-05-31T23:59:59Z' }),  // previous month
      makeLog({ created_at: '2024-07-01T00:00:00Z' }),  // next month
    ]
    expect(thisMonthCount(logs, '2024-06')).toBe(3)
  })

  it('returns 0 when no logs fall in the given month', () => {
    const logs = [
      makeLog({ created_at: '2024-01-10T00:00:00Z' }),
      makeLog({ created_at: '2024-03-20T00:00:00Z' }),
    ]
    expect(thisMonthCount(logs, '2024-06')).toBe(0)
  })

  it('returns total when all logs are in the given month', () => {
    const logs = [
      makeLog({ created_at: '2024-06-05T00:00:00Z' }),
      makeLog({ created_at: '2024-06-06T00:00:00Z' }),
    ]
    expect(thisMonthCount(logs, '2024-06')).toBe(2)
  })

  it('uses ISO prefix comparison (not locale-dependent)', () => {
    // The function slices [0,7] from the ISO string — must match 'YYYY-MM'
    const logs = [
      makeLog({ created_at: '2025-12-31T23:59:59Z' }),
    ]
    expect(thisMonthCount(logs, '2025-12')).toBe(1)
    expect(thisMonthCount(logs, '2025-11')).toBe(0)
  })
})
