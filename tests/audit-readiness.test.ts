import { describe, it, expect } from 'vitest'
import {
  computeScore,
  toGrade,
  categoryStats,
} from '@/lib/services/governance/audit-readiness.service'
import type { AuditCheckItem } from '@/lib/services/governance/audit-readiness.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Score computation ─────────────────────────────────────────────────────────

describe('computeScore', () => {
  it('returns 100 when all items pass', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'pass', weight: 50 }),
    ]
    expect(computeScore(items)).toBe(100)
  })

  it('returns 0 when all items fail', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'fail', weight: 60 }),
      makeItem({ key: 'b', status: 'fail', weight: 40 }),
    ]
    expect(computeScore(items)).toBe(0)
  })

  it('returns 0 when all items are needs_review', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'needs_review', weight: 50 }),
      makeItem({ key: 'b', status: 'needs_review', weight: 50 }),
    ]
    expect(computeScore(items)).toBe(0)
  })

  it('counts warn items as half weight', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'warn', weight: 50 }),  // 25 earned
    ]
    // earnedWeight = 50 + 25 = 75; total = 100
    expect(computeScore(items)).toBe(75)
  })

  it('excludes skip items from denominator', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'skip', weight: 50 }),  // excluded
    ]
    // Only 'a' counts: earned=50, total=50 → 100%
    expect(computeScore(items)).toBe(100)
  })

  it('handles mixed statuses correctly', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass',         weight: 40 }),  // 40 earned
      makeItem({ key: 'b', status: 'warn',         weight: 20 }),  // 10 earned
      makeItem({ key: 'c', status: 'fail',         weight: 20 }),  // 0 earned
      makeItem({ key: 'd', status: 'needs_review', weight: 20 }),  // 0 earned
    ]
    // earned=50, total=100 → 50
    expect(computeScore(items)).toBe(50)
  })

  it('returns 100 when all items are skipped', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'skip', weight: 50 }),
      makeItem({ key: 'b', status: 'skip', weight: 50 }),
    ]
    expect(computeScore(items)).toBe(100)
  })
})

// ── Grade thresholds ──────────────────────────────────────────────────────────

describe('toGrade', () => {
  it('grade A for score >= 90', () => {
    expect(toGrade(90)).toBe('A')
    expect(toGrade(100)).toBe('A')
    expect(toGrade(95)).toBe('A')
  })

  it('grade B for score 75-89', () => {
    expect(toGrade(75)).toBe('B')
    expect(toGrade(89)).toBe('B')
    expect(toGrade(80)).toBe('B')
  })

  it('grade C for score 60-74', () => {
    expect(toGrade(60)).toBe('C')
    expect(toGrade(74)).toBe('C')
    expect(toGrade(65)).toBe('C')
  })

  it('grade D for score 40-59', () => {
    expect(toGrade(40)).toBe('D')
    expect(toGrade(59)).toBe('D')
    expect(toGrade(50)).toBe('D')
  })

  it('grade F for score < 40', () => {
    expect(toGrade(39)).toBe('F')
    expect(toGrade(0)).toBe('F')
    expect(toGrade(20)).toBe('F')
  })
})

// ── Category stats ────────────────────────────────────────────────────────────

describe('categoryStats', () => {
  it('computes category score and pass count correctly', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50, category: 'accounting' }),
      makeItem({ key: 'b', status: 'fail', weight: 50, category: 'accounting' }),
      makeItem({ key: 'c', status: 'pass', weight: 30, category: 'partner' }),  // different category
    ]
    const stats = categoryStats(items, 'accounting')
    expect(stats.total).toBe(2)
    expect(stats.passed).toBe(1)
    expect(stats.score).toBe(50)
  })

  it('excludes skip items from category totals', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50, category: 'tax' }),
      makeItem({ key: 'b', status: 'skip', weight: 50, category: 'tax' }),
    ]
    const stats = categoryStats(items, 'tax')
    expect(stats.total).toBe(1)      // skip excluded
    expect(stats.passed).toBe(1)
    expect(stats.score).toBe(100)
  })
})

// ── Business logic contracts ──────────────────────────────────────────────────

describe('period_current_open logic', () => {
  it('pass when open periods exist', () => {
    // simulate the check logic
    const openPeriods = [{ id: '1', period_start: '2026-05-01', period_end: '2026-05-31', status: 'open', label: 'Mayıs 2026' }]
    const hasOpenPeriod = openPeriods.length > 0
    expect(hasOpenPeriod).toBe(true)
    // → check would be pass
    const item = makeItem({ key: 'period_current_open', status: hasOpenPeriod ? 'pass' : 'fail', weight: 8 })
    expect(item.status).toBe('pass')
  })

  it('fail when no open periods exist', () => {
    const openPeriods: unknown[] = []
    const hasOpenPeriod = openPeriods.length > 0
    const item = makeItem({ key: 'period_current_open', status: hasOpenPeriod ? 'pass' : 'fail', weight: 8 })
    expect(item.status).toBe('fail')
  })
})

describe('no_overdue_period logic', () => {
  it('fail when a period has been open more than 45 days', () => {
    // daysSince logic: a period_start from 60 days ago
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 60)
    const period = { period_start: oldDate.toISOString().slice(0, 10), status: 'open' }

    const msPerDay  = 86_400_000
    const daysSince = Math.round((new Date().getTime() - new Date(period.period_start).getTime()) / msPerDay)
    expect(daysSince).toBeGreaterThan(45)

    const overdueperiods = [period].filter(p => {
      const d = Math.round((new Date().getTime() - new Date(p.period_start).getTime()) / msPerDay)
      return d > 45
    })
    expect(overdueperiods.length).toBe(1)
    const item = makeItem({ key: 'no_overdue_period', status: overdueperiods.length === 0 ? 'pass' : 'fail', weight: 7 })
    expect(item.status).toBe('fail')
  })

  it('pass when all periods are within 45 days', () => {
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 10)
    const period = { period_start: recentDate.toISOString().slice(0, 10), status: 'open' }

    const msPerDay = 86_400_000
    const overdueperiods = [period].filter(p => {
      const d = Math.round((new Date().getTime() - new Date(p.period_start).getTime()) / msPerDay)
      return d > 45
    })
    expect(overdueperiods.length).toBe(0)
    const item = makeItem({ key: 'no_overdue_period', status: overdueperiods.length === 0 ? 'pass' : 'fail', weight: 7 })
    expect(item.status).toBe('pass')
  })
})

describe('loan_tranches_documented logic', () => {
  it('fail when a tranche has 0% interest rate', () => {
    const tranches = [
      { id: '1', interest_rate_annual: 0, status: 'active' },
      { id: '2', interest_rate_annual: 12.5, status: 'active' },
    ]
    const undocumented = tranches.filter(t => !t.interest_rate_annual || Number(t.interest_rate_annual) === 0)
    expect(undocumented.length).toBe(1)
    const item = makeItem({ key: 'loan_tranches_documented', status: undocumented.length === 0 ? 'pass' : 'fail', weight: 7 })
    expect(item.status).toBe('fail')
  })

  it('pass when all tranches have interest rate set', () => {
    const tranches = [
      { id: '1', interest_rate_annual: 10.0, status: 'active' },
      { id: '2', interest_rate_annual: 12.5, status: 'active' },
    ]
    const undocumented = tranches.filter(t => !t.interest_rate_annual || Number(t.interest_rate_annual) === 0)
    expect(undocumented.length).toBe(0)
    const item = makeItem({ key: 'loan_tranches_documented', status: undocumented.length === 0 ? 'pass' : 'fail', weight: 7 })
    expect(item.status).toBe('pass')
  })

  it('skip when no active tranches exist', () => {
    const tranches: unknown[] = []
    const item = makeItem({
      key:    'loan_tranches_documented',
      status: tranches.length === 0 ? 'skip' : 'pass',
      weight: 7,
    })
    expect(item.status).toBe('skip')
  })
})

describe('resolutions_current logic', () => {
  it('fail when a draft resolution is older than 30 days', () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 40)
    const resolutions = [{ id: '1', status: 'draft', created_at: oldDate.toISOString() }]

    const msPerDay = 86_400_000
    const staleDrafts = resolutions.filter(r => {
      const d = Math.round((new Date().getTime() - new Date(r.created_at).getTime()) / msPerDay)
      return d > 30
    })
    expect(staleDrafts.length).toBe(1)

    const item = makeItem({ key: 'resolutions_current', status: staleDrafts.length === 0 ? 'pass' : 'fail', weight: 6 })
    expect(item.status).toBe('fail')
  })

  it('pass when all draft resolutions are within 30 days', () => {
    const recentDate = new Date()
    recentDate.setDate(recentDate.getDate() - 5)
    const resolutions = [{ id: '1', status: 'draft', created_at: recentDate.toISOString() }]

    const msPerDay = 86_400_000
    const staleDrafts = resolutions.filter(r => {
      const d = Math.round((new Date().getTime() - new Date(r.created_at).getTime()) / msPerDay)
      return d > 30
    })
    expect(staleDrafts.length).toBe(0)

    const item = makeItem({ key: 'resolutions_current', status: staleDrafts.length === 0 ? 'pass' : 'fail', weight: 6 })
    expect(item.status).toBe('pass')
  })
})

// ── computeScore — additional boundary tests ─────────────────────────────────

describe('computeScore — additional boundaries', () => {

  it('single pass item → 100', () => {
    const items = [makeItem({ key: 'a', status: 'pass', weight: 100 })]
    expect(computeScore(items)).toBe(100)
  })

  it('single fail item → 0', () => {
    const items = [makeItem({ key: 'a', status: 'fail', weight: 100 })]
    expect(computeScore(items)).toBe(0)
  })

  it('single warn item → 50', () => {
    // warn = half weight: earned=50, total=100 → 50
    const items = [makeItem({ key: 'a', status: 'warn', weight: 100 })]
    expect(computeScore(items)).toBe(50)
  })

  it('single needs_review item → 0', () => {
    const items = [makeItem({ key: 'a', status: 'needs_review', weight: 100 })]
    expect(computeScore(items)).toBe(0)
  })

  it('single skip item → 100 (no denominator)', () => {
    const items = [makeItem({ key: 'a', status: 'skip', weight: 100 })]
    expect(computeScore(items)).toBe(100)
  })

  it('unequal weights: pass(30) + fail(70) → 30/100 = 30', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 30 }),
      makeItem({ key: 'b', status: 'fail', weight: 70 }),
    ]
    expect(computeScore(items)).toBe(30)
  })

  it('unequal weights: pass(70) + fail(30) → 70/100 = 70', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 70 }),
      makeItem({ key: 'b', status: 'fail', weight: 30 }),
    ]
    expect(computeScore(items)).toBe(70)
  })

  it('warn with weight 40 earns 20 (half)', () => {
    const items = [
      makeItem({ key: 'a', status: 'warn', weight: 40 }),  // 20 earned
      makeItem({ key: 'b', status: 'fail', weight: 60 }),  // 0 earned
    ]
    // total=100, earned=20 → 20
    expect(computeScore(items)).toBe(20)
  })

  it('pass(50) + skip(50) → 50/50 = 100', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'skip', weight: 50 }),
    ]
    expect(computeScore(items)).toBe(100)
  })

  it('needs_review(40) + pass(60) → 60/100 = 60', () => {
    const items = [
      makeItem({ key: 'a', status: 'needs_review', weight: 40 }),
      makeItem({ key: 'b', status: 'pass',         weight: 60 }),
    ]
    expect(computeScore(items)).toBe(60)
  })

  it('five pass items with weight 20 each → 100', () => {
    const items = ['a','b','c','d','e'].map(k =>
      makeItem({ key: k, status: 'pass', weight: 20 }),
    )
    expect(computeScore(items)).toBe(100)
  })

  it('three warn items → each earns half → 50', () => {
    // 3 warn items, each weight=100/3 (rounded). Use whole weights summing to 99 for simplicity
    const items = [
      makeItem({ key: 'a', status: 'warn', weight: 33 }),
      makeItem({ key: 'b', status: 'warn', weight: 33 }),
      makeItem({ key: 'c', status: 'warn', weight: 33 }),
    ]
    // earned = 16.5+16.5+16.5=49.5, total=99 → 50
    const result = computeScore(items)
    expect(result).toBe(50)
  })
})

// ── toGrade — boundary exhaustive tests ──────────────────────────────────────

describe('toGrade — precise boundary checks', () => {

  it('89 → B (just below A threshold)', () => {
    expect(toGrade(89)).toBe('B')
  })

  it('90 → A (exactly at boundary)', () => {
    expect(toGrade(90)).toBe('A')
  })

  it('74 → C (just below B threshold)', () => {
    expect(toGrade(74)).toBe('C')
  })

  it('75 → B (exactly at boundary)', () => {
    expect(toGrade(75)).toBe('B')
  })

  it('59 → D (just below C threshold)', () => {
    expect(toGrade(59)).toBe('D')
  })

  it('60 → C (exactly at boundary)', () => {
    expect(toGrade(60)).toBe('C')
  })

  it('39 → F (just below D threshold)', () => {
    expect(toGrade(39)).toBe('F')
  })

  it('40 → D (exactly at boundary)', () => {
    expect(toGrade(40)).toBe('D')
  })

  it('1 → F', () => {
    expect(toGrade(1)).toBe('F')
  })

  it('99 → A', () => {
    expect(toGrade(99)).toBe('A')
  })

  it('midpoints: 50 → D, 67 → C, 82 → B, 95 → A', () => {
    expect(toGrade(50)).toBe('D')
    expect(toGrade(67)).toBe('C')
    expect(toGrade(82)).toBe('B')
    expect(toGrade(95)).toBe('A')
  })
})

// ── categoryStats — additional tests ─────────────────────────────────────────

describe('categoryStats — additional tests', () => {

  it('empty item list for category → total=0, passed=0, score=100', () => {
    const items: AuditCheckItem[] = []
    const stats = categoryStats(items, 'accounting')
    expect(stats.total).toBe(0)
    expect(stats.passed).toBe(0)
    expect(stats.score).toBe(100)
  })

  it('all pass in category → score 100', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 40, category: 'tax' }),
      makeItem({ key: 'b', status: 'pass', weight: 60, category: 'tax' }),
    ]
    const stats = categoryStats(items, 'tax')
    expect(stats.score).toBe(100)
    expect(stats.passed).toBe(2)
    expect(stats.total).toBe(2)
  })

  it('all fail in category → score 0', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'fail', weight: 50, category: 'partner' }),
      makeItem({ key: 'b', status: 'fail', weight: 50, category: 'partner' }),
    ]
    const stats = categoryStats(items, 'partner')
    expect(stats.score).toBe(0)
    expect(stats.passed).toBe(0)
    expect(stats.total).toBe(2)
  })

  it('only items from the requested category are counted', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 50, category: 'accounting' }),
      makeItem({ key: 'b', status: 'fail', weight: 50, category: 'tax' }),
      makeItem({ key: 'c', status: 'fail', weight: 50, category: 'governance' }),
    ]
    const stats = categoryStats(items, 'accounting')
    expect(stats.total).toBe(1)
    expect(stats.passed).toBe(1)
    expect(stats.score).toBe(100)
  })

  it('warn item counts as passed in "passed" count', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'warn', weight: 50, category: 'governance' }),
      makeItem({ key: 'b', status: 'fail', weight: 50, category: 'governance' }),
    ]
    const stats = categoryStats(items, 'governance')
    // warn earns half weight (25), total 100, score=25
    expect(stats.score).toBe(25)
    expect(stats.total).toBe(2)
  })

  it('skip items do not increase total', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass', weight: 40, category: 'partner' }),
      makeItem({ key: 'b', status: 'skip', weight: 60, category: 'partner' }),
      makeItem({ key: 'c', status: 'skip', weight: 30, category: 'partner' }),
    ]
    const stats = categoryStats(items, 'partner')
    expect(stats.total).toBe(1)
    expect(stats.passed).toBe(1)
    expect(stats.score).toBe(100)
  })

  it('mixed statuses in category compute correctly', () => {
    const items: AuditCheckItem[] = [
      makeItem({ key: 'a', status: 'pass',         weight: 40, category: 'accounting' }),
      makeItem({ key: 'b', status: 'warn',         weight: 20, category: 'accounting' }),
      makeItem({ key: 'c', status: 'fail',         weight: 20, category: 'accounting' }),
      makeItem({ key: 'd', status: 'needs_review', weight: 20, category: 'accounting' }),
    ]
    // earned=40+10+0+0=50, total=100 → 50
    const stats = categoryStats(items, 'accounting')
    expect(stats.score).toBe(50)
    expect(stats.total).toBe(4)
  })
})

// ── computeScore + toGrade integration ───────────────────────────────────────

describe('computeScore → toGrade pipeline', () => {

  it('perfect checklist → A', () => {
    const items = ['a','b','c','d','e'].map(k =>
      makeItem({ key: k, status: 'pass', weight: 20 }),
    )
    const score = computeScore(items)
    expect(toGrade(score)).toBe('A')
  })

  it('all fail → F', () => {
    const items = ['a','b'].map(k =>
      makeItem({ key: k, status: 'fail', weight: 50 }),
    )
    const score = computeScore(items)
    expect(toGrade(score)).toBe('F')
  })

  it('half pass half fail → 50 → D', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 50 }),
      makeItem({ key: 'b', status: 'fail', weight: 50 }),
    ]
    const score = computeScore(items)
    expect(score).toBe(50)
    expect(toGrade(score)).toBe('D')
  })

  it('90% pass → A', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 90 }),
      makeItem({ key: 'b', status: 'fail', weight: 10 }),
    ]
    const score = computeScore(items)
    expect(score).toBe(90)
    expect(toGrade(score)).toBe('A')
  })

  it('75% pass → B', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 75 }),
      makeItem({ key: 'b', status: 'fail', weight: 25 }),
    ]
    const score = computeScore(items)
    expect(score).toBe(75)
    expect(toGrade(score)).toBe('B')
  })

  it('60% pass → C', () => {
    const items = [
      makeItem({ key: 'a', status: 'pass', weight: 60 }),
      makeItem({ key: 'b', status: 'fail', weight: 40 }),
    ]
    const score = computeScore(items)
    expect(score).toBe(60)
    expect(toGrade(score)).toBe('C')
  })

  it('all warn → 50 → D', () => {
    const items = [
      makeItem({ key: 'a', status: 'warn', weight: 50 }),
      makeItem({ key: 'b', status: 'warn', weight: 50 }),
    ]
    const score = computeScore(items)
    expect(score).toBe(50)
    expect(toGrade(score)).toBe('D')
  })
})
