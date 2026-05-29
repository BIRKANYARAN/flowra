import { describe, it, expect } from 'vitest'
import {
  computeScore,
  toGrade,
  categoryStats,
  findCriticalFailure,
  filterByCategory,
  countNeedsReview,
  gradeLabel,
} from '@/lib/services/governance/audit-readiness.service'
import type { AuditCheckItem, AuditReadinessReport } from '@/lib/services/governance/audit-readiness.service'

// ── Test helper ───────────────────────────────────────────────────────────────

function makeItem(
  overrides: Partial<AuditCheckItem> & { key: string; status: AuditCheckItem['status']; weight: number },
): AuditCheckItem {
  return {
    label:    overrides.key,
    category: 'accounting',
    type:     'computed',
    detail:   '',
    ...overrides,
  }
}

// ── computeScore ──────────────────────────────────────────────────────────────

describe('computeScore', () => {
  it('returns 100 for empty items array', () => {
    expect(computeScore([])).toBe(100)
  })

  it('returns 100 when all items pass', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 40 }),
      makeItem({ key: 'b', status: 'pass', weight: 60 }),
    ]
    expect(computeScore(items)).toBe(100)
  })

  it('returns 0 when all items fail', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'fail', weight: 10 }),
      makeItem({ key: 'b', status: 'fail', weight: 20 }),
    ]
    expect(computeScore(items)).toBe(0)
  })

  it('returns 0 when all items are needs_review', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'needs_review', weight: 5 }),
      makeItem({ key: 'b', status: 'needs_review', weight: 5 }),
    ]
    expect(computeScore(items)).toBe(0)
  })

  it('excludes skipped items from denominator', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass',  weight: 10 }),
      makeItem({ key: 'b', status: 'skip',  weight: 1000 }), // should not count
    ]
    expect(computeScore(items)).toBe(100)
  })

  it('gives warn items half weight credit', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'warn', weight: 50 }),
    ]
    // earned: 50 + 25 = 75, total: 100 → 75
    expect(computeScore(items)).toBe(75)
  })

  it('computes mixed pass/fail/warn correctly', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass',  weight: 10 }),
      makeItem({ key: 'b', status: 'fail',  weight: 10 }),
      makeItem({ key: 'c', status: 'warn',  weight: 10 }),
      makeItem({ key: 'd', status: 'skip',  weight: 100 }),
    ]
    // earned: 10 + 0 + 5 = 15, total: 30 → 50
    expect(computeScore(items)).toBe(50)
  })

  it('returns 100 when all non-skip items are a single pass', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'skip', weight: 50 }),
      makeItem({ key: 'b', status: 'pass', weight: 8 }),
    ]
    expect(computeScore(items)).toBe(100)
  })
})

// ── toGrade ───────────────────────────────────────────────────────────────────

describe('toGrade', () => {
  it('returns F for score 0', () => {
    expect(toGrade(0)).toBe('F')
  })

  it('returns F for score 39', () => {
    expect(toGrade(39)).toBe('F')
  })

  it('returns D for score 40', () => {
    expect(toGrade(40)).toBe('D')
  })

  it('returns D for score 59', () => {
    expect(toGrade(59)).toBe('D')
  })

  it('returns C for score 60', () => {
    expect(toGrade(60)).toBe('C')
  })

  it('returns C for score 74', () => {
    expect(toGrade(74)).toBe('C')
  })

  it('returns B for score 75', () => {
    expect(toGrade(75)).toBe('B')
  })

  it('returns B for score 89', () => {
    expect(toGrade(89)).toBe('B')
  })

  it('returns A for score 90', () => {
    expect(toGrade(90)).toBe('A')
  })

  it('returns A for score 100', () => {
    expect(toGrade(100)).toBe('A')
  })

  it('returns D for score 50 (within 40–59 range)', () => {
    expect(toGrade(50)).toBe('D')
  })
})

// ── findCriticalFailure ───────────────────────────────────────────────────────

describe('findCriticalFailure', () => {
  it('returns null for empty list', () => {
    expect(findCriticalFailure([])).toBeNull()
  })

  it('returns null when all items pass', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 10 }),
      makeItem({ key: 'b', status: 'pass', weight: 10 }),
    ]
    expect(findCriticalFailure(items)).toBeNull()
  })

  it('returns null when only skipped items', () => {
    const items = [
      makeItem({ key: 'a', status: 'skip', weight: 10 }),
    ]
    expect(findCriticalFailure(items)).toBeNull()
  })

  it('prefers fail over warn', () => {
    const warn = makeItem({ key: 'w', status: 'warn', weight: 10 })
    const fail = makeItem({ key: 'f', status: 'fail', weight: 10 })
    expect(findCriticalFailure([warn, fail])?.key).toBe('f')
  })

  it('prefers fail over needs_review', () => {
    const nr   = makeItem({ key: 'nr', status: 'needs_review', weight: 10 })
    const fail = makeItem({ key: 'f',  status: 'fail',         weight: 10 })
    expect(findCriticalFailure([nr, fail])?.key).toBe('f')
  })

  it('prefers warn over needs_review', () => {
    const nr   = makeItem({ key: 'nr', status: 'needs_review', weight: 10 })
    const warn = makeItem({ key: 'w',  status: 'warn',         weight: 10 })
    expect(findCriticalFailure([nr, warn])?.key).toBe('w')
  })

  it('returns the single failing item', () => {
    const items = [
      makeItem({ key: 'ok',   status: 'pass', weight: 10 }),
      makeItem({ key: 'bad',  status: 'fail', weight: 10 }),
      makeItem({ key: 'skip', status: 'skip', weight: 10 }),
    ]
    expect(findCriticalFailure(items)?.key).toBe('bad')
  })
})

// ── filterByCategory ──────────────────────────────────────────────────────────

describe('filterByCategory', () => {
  const items: AuditCheckItem[] = [
    makeItem({ key: 'acc1', status: 'pass',  weight: 5, category: 'accounting' }),
    makeItem({ key: 'acc2', status: 'fail',  weight: 5, category: 'accounting' }),
    makeItem({ key: 'par1', status: 'pass',  weight: 5, category: 'partner' }),
    makeItem({ key: 'gov1', status: 'warn',  weight: 5, category: 'governance' }),
    makeItem({ key: 'tax1', status: 'skip',  weight: 5, category: 'tax' }),
  ]

  it('returns only accounting items', () => {
    const result = filterByCategory(items, 'accounting')
    expect(result.map(i => i.key)).toEqual(['acc1', 'acc2'])
  })

  it('returns only partner items', () => {
    const result = filterByCategory(items, 'partner')
    expect(result).toHaveLength(1)
    expect(result[0].key).toBe('par1')
  })

  it('returns only governance items', () => {
    const result = filterByCategory(items, 'governance')
    expect(result[0].key).toBe('gov1')
  })

  it('returns only tax items', () => {
    const result = filterByCategory(items, 'tax')
    expect(result[0].key).toBe('tax1')
  })

  it('returns empty array when no items match', () => {
    const empty: AuditCheckItem[] = []
    expect(filterByCategory(empty, 'accounting')).toEqual([])
  })
})

// ── countNeedsReview ──────────────────────────────────────────────────────────

describe('countNeedsReview', () => {
  it('returns 0 for empty list', () => {
    expect(countNeedsReview([])).toBe(0)
  })

  it('returns 0 when no needs_review items', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 10 }),
      makeItem({ key: 'b', status: 'fail', weight: 10 }),
    ]
    expect(countNeedsReview(items)).toBe(0)
  })

  it('counts all needs_review items', () => {
    const items = [
      makeItem({ key: 'a', status: 'needs_review', weight: 5 }),
      makeItem({ key: 'b', status: 'needs_review', weight: 5 }),
      makeItem({ key: 'c', status: 'pass',         weight: 5 }),
    ]
    expect(countNeedsReview(items)).toBe(2)
  })

  it('returns correct count when all are needs_review', () => {
    const items = [
      makeItem({ key: 'a', status: 'needs_review', weight: 5 }),
      makeItem({ key: 'b', status: 'needs_review', weight: 5 }),
      makeItem({ key: 'c', status: 'needs_review', weight: 5 }),
    ]
    expect(countNeedsReview(items)).toBe(3)
  })
})

// ── gradeLabel ────────────────────────────────────────────────────────────────

describe('gradeLabel', () => {
  it('returns Turkish label for A', () => {
    expect(gradeLabel('A')).toBe('Denetim Hazır')
  })

  it('returns Turkish label for B', () => {
    expect(gradeLabel('B')).toBe('Büyük Ölçüde Hazır')
  })

  it('returns Turkish label for C', () => {
    expect(gradeLabel('C')).toBe('Kısmen Hazır')
  })

  it('returns Turkish label for D', () => {
    expect(gradeLabel('D')).toBe('Eksikler Var')
  })

  it('returns Turkish label for F', () => {
    expect(gradeLabel('F')).toBe('Denetim Hazır Değil')
  })
})
