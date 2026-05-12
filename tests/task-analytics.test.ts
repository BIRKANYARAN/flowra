/**
 * FAZ 12 — Görev Yönetimi: business-logic unit tests
 *
 * Tests the pure analytics functions in tasks/page.tsx:
 *   1. overdueCount()     — open tasks where due_date < today
 *   2. dueThisWeek()      — open tasks due within 7 days (not overdue)
 *   3. completionRate()   — (done + cancelled) / total × 100
 *   4. tasksByStatus()    — counts per status key
 *
 * All functions are pure (no DB, no side effects).
 * Run with: npx vitest run tests/task-analytics.test.ts
 */

import { describe, it, expect } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mirror of analytics functions from tasks/page.tsx
// ─────────────────────────────────────────────────────────────────────────────

type TaskStatus = 'open' | 'done' | 'cancelled'
interface TaskStub { status: TaskStatus; due_date: string | null }

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + n))
  return date.toISOString().slice(0, 10)
}

function overdueCount(tasks: TaskStub[], today: string): number {
  return tasks.filter(t => t.status === 'open' && t.due_date != null && t.due_date < today).length
}

function dueThisWeek(tasks: TaskStub[], today: string): number {
  const weekOut = addDays(today, 7)
  return tasks.filter(t =>
    t.status === 'open' &&
    t.due_date != null &&
    t.due_date >= today &&
    t.due_date <= weekOut
  ).length
}

function completionRate(tasks: TaskStub[]): number {
  const closed = tasks.filter(t => t.status === 'done' || t.status === 'cancelled').length
  return tasks.length > 0 ? Math.round((closed / tasks.length) * 100) : 0
}

function tasksByStatus(tasks: TaskStub[]): Record<string, number> {
  const counts: Record<string, number> = { open: 0, done: 0, cancelled: 0 }
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1
  }
  return counts
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. overdueCount
// ─────────────────────────────────────────────────────────────────────────────

describe('overdueCount()', () => {
  const TODAY = '2024-06-15'

  it('returns 0 for empty tasks', () => {
    expect(overdueCount([], TODAY)).toBe(0)
  })

  it('counts open tasks with due_date before today', () => {
    const tasks = [
      { status: 'open' as const,      due_date: '2024-06-10' },  // overdue
      { status: 'open' as const,      due_date: '2024-06-14' },  // overdue (yesterday)
      { status: 'open' as const,      due_date: '2024-06-15' },  // today — NOT overdue
      { status: 'open' as const,      due_date: '2024-06-20' },  // future
      { status: 'done' as const,      due_date: '2024-06-10' },  // done — not counted
      { status: 'cancelled' as const, due_date: '2024-06-10' },  // cancelled — not counted
    ]
    expect(overdueCount(tasks, TODAY)).toBe(2)
  })

  it('excludes tasks with null due_date', () => {
    const tasks = [
      { status: 'open' as const, due_date: null },
      { status: 'open' as const, due_date: null },
    ]
    expect(overdueCount(tasks, TODAY)).toBe(0)
  })

  it('due today is NOT overdue (boundary: due_date < today, not <=)', () => {
    const tasks = [{ status: 'open' as const, due_date: TODAY }]
    expect(overdueCount(tasks, TODAY)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. dueThisWeek
// ─────────────────────────────────────────────────────────────────────────────

describe('dueThisWeek()', () => {
  const TODAY = '2024-06-15'

  it('returns 0 for empty tasks', () => {
    expect(dueThisWeek([], TODAY)).toBe(0)
  })

  it('counts open tasks due today through +7 days', () => {
    const tasks = [
      { status: 'open' as const, due_date: '2024-06-14' },  // yesterday — overdue, excluded
      { status: 'open' as const, due_date: '2024-06-15' },  // today ✓
      { status: 'open' as const, due_date: '2024-06-20' },  // +5 days ✓
      { status: 'open' as const, due_date: '2024-06-22' },  // +7 days ✓ (boundary inclusive)
      { status: 'open' as const, due_date: '2024-06-23' },  // +8 days — too far
    ]
    expect(dueThisWeek(tasks, TODAY)).toBe(3)
  })

  it('excludes done and cancelled tasks even if due this week', () => {
    const tasks = [
      { status: 'done' as const,      due_date: '2024-06-16' },
      { status: 'cancelled' as const, due_date: '2024-06-17' },
    ]
    expect(dueThisWeek(tasks, TODAY)).toBe(0)
  })

  it('excludes tasks with null due_date', () => {
    const tasks = [{ status: 'open' as const, due_date: null }]
    expect(dueThisWeek(tasks, TODAY)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. completionRate
// ─────────────────────────────────────────────────────────────────────────────

describe('completionRate()', () => {
  it('returns 0 for empty tasks', () => {
    expect(completionRate([])).toBe(0)
  })

  it('100% when all tasks are done', () => {
    const tasks = [
      { status: 'done' as const, due_date: null },
      { status: 'done' as const, due_date: null },
    ]
    expect(completionRate(tasks)).toBe(100)
  })

  it('0% when all tasks are open', () => {
    const tasks = [
      { status: 'open' as const, due_date: null },
      { status: 'open' as const, due_date: null },
    ]
    expect(completionRate(tasks)).toBe(0)
  })

  it('counts both done and cancelled as closed', () => {
    const tasks = [
      { status: 'open' as const,      due_date: null },
      { status: 'done' as const,      due_date: null },
      { status: 'cancelled' as const, due_date: null },
      { status: 'open' as const,      due_date: null },
    ]
    // 2 closed / 4 total = 50%
    expect(completionRate(tasks)).toBe(50)
  })

  it('rounds to nearest integer', () => {
    // 1 done / 3 total = 33.33% → 33
    const tasks = [
      { status: 'done' as const, due_date: null },
      { status: 'open' as const, due_date: null },
      { status: 'open' as const, due_date: null },
    ]
    expect(completionRate(tasks)).toBe(33)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. tasksByStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('tasksByStatus()', () => {
  it('returns zeroes for empty tasks', () => {
    const s = tasksByStatus([])
    expect(s.open).toBe(0)
    expect(s.done).toBe(0)
    expect(s.cancelled).toBe(0)
  })

  it('counts each status correctly', () => {
    const tasks = [
      { status: 'open' as const,      due_date: null },
      { status: 'open' as const,      due_date: null },
      { status: 'done' as const,      due_date: null },
      { status: 'cancelled' as const, due_date: null },
      { status: 'cancelled' as const, due_date: null },
      { status: 'cancelled' as const, due_date: null },
    ]
    const s = tasksByStatus(tasks)
    expect(s.open).toBe(2)
    expect(s.done).toBe(1)
    expect(s.cancelled).toBe(3)
  })

  it('all open — done and cancelled are zero', () => {
    const tasks = [
      { status: 'open' as const, due_date: null },
      { status: 'open' as const, due_date: null },
    ]
    const s = tasksByStatus(tasks)
    expect(s.open).toBe(2)
    expect(s.done).toBe(0)
    expect(s.cancelled).toBe(0)
  })
})
