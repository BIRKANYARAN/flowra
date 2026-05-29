// ─────────────────────────────────────────────────────────────────────────────
// tests/period-close-readiness.test.ts
//
// Unit tests for all pure functions in
// lib/services/finance/period-close-readiness.service.ts
//
// 36+ tests covering score computation, readiness classification,
// blocking issue counts, check summaries.
//
// Run with: npx vitest run tests/period-close-readiness.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, test, expect } from 'vitest'
import {
  computeCloseReadinessScore,
  isReadyToClose,
  computeBlockingIssueCount,
  classifyCloseReadiness,
  computeChecksPassed,
  buildCloseCheckSummary,
  type CloseCheck,
} from '../lib/services/finance/period-close-readiness.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCheck(
  overrides: Partial<CloseCheck> & Pick<CloseCheck, 'id' | 'status' | 'is_blocking'>,
): CloseCheck {
  return {
    label:       overrides.id,
    description: '',
    ...overrides,
  }
}

const allPassed: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'passed', is_blocking: true }),
  makeCheck({ id: 'c2', status: 'passed', is_blocking: false }),
  makeCheck({ id: 'c3', status: 'passed', is_blocking: true }),
]

const oneBlockingFail: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'failed', is_blocking: true }),
  makeCheck({ id: 'c2', status: 'passed', is_blocking: false }),
  makeCheck({ id: 'c3', status: 'passed', is_blocking: true }),
]

const twoBlockingFails: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'failed', is_blocking: true }),
  makeCheck({ id: 'c2', status: 'failed', is_blocking: true }),
  makeCheck({ id: 'c3', status: 'passed', is_blocking: false }),
]

const oneNonBlockingFail: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'passed', is_blocking: true }),
  makeCheck({ id: 'c2', status: 'failed', is_blocking: false }),
  makeCheck({ id: 'c3', status: 'passed', is_blocking: true }),
]

const mixedChecks: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'failed',  is_blocking: true }),   // -20
  makeCheck({ id: 'c2', status: 'failed',  is_blocking: false }),  // -8
  makeCheck({ id: 'c3', status: 'warning', is_blocking: false }),  // -3
  makeCheck({ id: 'c4', status: 'passed',  is_blocking: false }),  // 0
  makeCheck({ id: 'c5', status: 'skipped', is_blocking: false }),  // 0
]

const allWarnings: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'warning', is_blocking: false }),
  makeCheck({ id: 'c2', status: 'warning', is_blocking: false }),
  makeCheck({ id: 'c3', status: 'warning', is_blocking: false }),
]

const withSkipped: CloseCheck[] = [
  makeCheck({ id: 'c1', status: 'skipped', is_blocking: true }),
  makeCheck({ id: 'c2', status: 'skipped', is_blocking: false }),
  makeCheck({ id: 'c3', status: 'passed',  is_blocking: false }),
]

// ── computeCloseReadinessScore ────────────────────────────────────────────────

describe('computeCloseReadinessScore', () => {
  test('no failures returns 100', () => {
    expect(computeCloseReadinessScore(allPassed)).toBe(100)
  })

  test('one blocking failure deducts 20 → 80', () => {
    expect(computeCloseReadinessScore(oneBlockingFail)).toBe(80)
  })

  test('two blocking failures deduct 40 → 60', () => {
    expect(computeCloseReadinessScore(twoBlockingFails)).toBe(60)
  })

  test('one non-blocking failure deducts 8 → 92', () => {
    expect(computeCloseReadinessScore(oneNonBlockingFail)).toBe(92)
  })

  test('mixed: blocking(-20) + non-blocking(-8) + warning(-3) = 69', () => {
    expect(computeCloseReadinessScore(mixedChecks)).toBe(69)
  })

  test('skipped checks do not deduct points', () => {
    expect(computeCloseReadinessScore(withSkipped)).toBe(100)
  })

  test('all warnings: 3 × -3 = -9 → 91', () => {
    expect(computeCloseReadinessScore(allWarnings)).toBe(91)
  })

  test('empty check list returns 100', () => {
    expect(computeCloseReadinessScore([])).toBe(100)
  })

  test('floor clamped to 0 — many blocking fails cannot go below zero', () => {
    const manyFails = Array.from({ length: 10 }, (_, i) =>
      makeCheck({ id: `c${i}`, status: 'failed', is_blocking: true })
    )
    expect(computeCloseReadinessScore(manyFails)).toBe(0)
  })

  test('ceiling clamped to 100 — all passed stays at 100', () => {
    expect(computeCloseReadinessScore(allPassed)).toBeLessThanOrEqual(100)
    expect(computeCloseReadinessScore(allPassed)).toBeGreaterThanOrEqual(0)
  })
})

// ── isReadyToClose ─────────────────────────────────────────────────────────────

describe('isReadyToClose', () => {
  test('no checks → true', () => {
    expect(isReadyToClose([])).toBe(true)
  })

  test('all passed → true', () => {
    expect(isReadyToClose(allPassed)).toBe(true)
  })

  test('one blocking failed → false', () => {
    expect(isReadyToClose(oneBlockingFail)).toBe(false)
  })

  test('two blocking fails → false', () => {
    expect(isReadyToClose(twoBlockingFails)).toBe(false)
  })

  test('non-blocking fail only → true (does not block close)', () => {
    expect(isReadyToClose(oneNonBlockingFail)).toBe(true)
  })

  test('warnings only → true (warnings do not block close)', () => {
    expect(isReadyToClose(allWarnings)).toBe(true)
  })

  test('skipped blocking check → true (skipped does not block)', () => {
    const skippedBlocking: CloseCheck[] = [
      makeCheck({ id: 'c1', status: 'skipped', is_blocking: true }),
      makeCheck({ id: 'c2', status: 'passed',  is_blocking: false }),
    ]
    expect(isReadyToClose(skippedBlocking)).toBe(true)
  })

  test('mixed: one blocking fail + other passed → false', () => {
    expect(isReadyToClose(mixedChecks)).toBe(false)
  })
})

// ── computeBlockingIssueCount ──────────────────────────────────────────────────

describe('computeBlockingIssueCount', () => {
  test('no checks → 0', () => {
    expect(computeBlockingIssueCount([])).toBe(0)
  })

  test('all passed → 0', () => {
    expect(computeBlockingIssueCount(allPassed)).toBe(0)
  })

  test('one blocking failed → 1', () => {
    expect(computeBlockingIssueCount(oneBlockingFail)).toBe(1)
  })

  test('two blocking fails → 2', () => {
    expect(computeBlockingIssueCount(twoBlockingFails)).toBe(2)
  })

  test('non-blocking fail not counted', () => {
    expect(computeBlockingIssueCount(oneNonBlockingFail)).toBe(0)
  })

  test('mixed checks counts only blocking fails', () => {
    expect(computeBlockingIssueCount(mixedChecks)).toBe(1)
  })

  test('warnings not counted', () => {
    expect(computeBlockingIssueCount(allWarnings)).toBe(0)
  })

  test('skipped blocking not counted', () => {
    const skippedBlocking: CloseCheck[] = [
      makeCheck({ id: 'c1', status: 'skipped', is_blocking: true }),
      makeCheck({ id: 'c2', status: 'failed',  is_blocking: true }),
    ]
    expect(computeBlockingIssueCount(skippedBlocking)).toBe(1)
  })
})

// ── classifyCloseReadiness ─────────────────────────────────────────────────────

describe('classifyCloseReadiness', () => {
  test('score 100, no blocking fails → ready', () => {
    expect(classifyCloseReadiness(100, allPassed)).toBe('ready')
  })

  test('score 90, no blocking fails → ready', () => {
    expect(classifyCloseReadiness(90, allPassed)).toBe('ready')
  })

  test('score 90 WITH blocking fail → needs_work (override)', () => {
    expect(classifyCloseReadiness(90, oneBlockingFail)).toBe('needs_work')
  })

  test('score 80 → near_ready', () => {
    expect(classifyCloseReadiness(80)).toBe('near_ready')
  })

  test('score 70 → near_ready', () => {
    expect(classifyCloseReadiness(70)).toBe('near_ready')
  })

  test('score 69 → needs_work', () => {
    expect(classifyCloseReadiness(69)).toBe('needs_work')
  })

  test('score 50 → needs_work', () => {
    expect(classifyCloseReadiness(50)).toBe('needs_work')
  })

  test('score 49 → not_ready', () => {
    expect(classifyCloseReadiness(49)).toBe('not_ready')
  })

  test('score 0 → not_ready', () => {
    expect(classifyCloseReadiness(0)).toBe('not_ready')
  })

  test('score 91 without checks → ready', () => {
    expect(classifyCloseReadiness(91)).toBe('ready')
  })
})

// ── computeChecksPassed ────────────────────────────────────────────────────────

describe('computeChecksPassed', () => {
  test('empty array → all zeros but total 0', () => {
    const r = computeChecksPassed([])
    expect(r.passed).toBe(0)
    expect(r.failed).toBe(0)
    expect(r.warnings).toBe(0)
    expect(r.total).toBe(0)
  })

  test('all passed → passed = total', () => {
    const r = computeChecksPassed(allPassed)
    expect(r.passed).toBe(3)
    expect(r.failed).toBe(0)
    expect(r.warnings).toBe(0)
    expect(r.total).toBe(3)
  })

  test('mixed checks counts each status correctly', () => {
    const r = computeChecksPassed(mixedChecks)
    expect(r.passed).toBe(1)
    expect(r.failed).toBe(2)
    expect(r.warnings).toBe(1)
    expect(r.total).toBe(5)
  })

  test('skipped checks included in total but not in passed/failed/warnings', () => {
    const r = computeChecksPassed(withSkipped)
    expect(r.passed).toBe(1)
    expect(r.failed).toBe(0)
    expect(r.warnings).toBe(0)
    expect(r.total).toBe(3)
  })

  test('all warnings → warnings = total', () => {
    const r = computeChecksPassed(allWarnings)
    expect(r.warnings).toBe(3)
    expect(r.passed).toBe(0)
    expect(r.failed).toBe(0)
    expect(r.total).toBe(3)
  })
})

// ── buildCloseCheckSummary ─────────────────────────────────────────────────────

describe('buildCloseCheckSummary', () => {
  test('empty list → all buckets empty', () => {
    const s = buildCloseCheckSummary([])
    expect(s.blocking_failures.length).toBe(0)
    expect(s.non_blocking_failures.length).toBe(0)
    expect(s.warnings.length).toBe(0)
    expect(s.passed.length).toBe(0)
  })

  test('all passed → only passed bucket populated', () => {
    const s = buildCloseCheckSummary(allPassed)
    expect(s.passed.length).toBe(3)
    expect(s.blocking_failures.length).toBe(0)
    expect(s.non_blocking_failures.length).toBe(0)
    expect(s.warnings.length).toBe(0)
  })

  test('one blocking fail categorized in blocking_failures', () => {
    const s = buildCloseCheckSummary(oneBlockingFail)
    expect(s.blocking_failures.length).toBe(1)
    expect(s.blocking_failures[0].id).toBe('c1')
    expect(s.passed.length).toBe(2)
  })

  test('non-blocking fail goes to non_blocking_failures', () => {
    const s = buildCloseCheckSummary(oneNonBlockingFail)
    expect(s.non_blocking_failures.length).toBe(1)
    expect(s.non_blocking_failures[0].id).toBe('c2')
    expect(s.blocking_failures.length).toBe(0)
  })

  test('mixed checks distributed correctly to all 4 buckets', () => {
    const s = buildCloseCheckSummary(mixedChecks)
    expect(s.blocking_failures.length).toBe(1)
    expect(s.non_blocking_failures.length).toBe(1)
    expect(s.warnings.length).toBe(1)
    expect(s.passed.length).toBe(1)
    // skipped not in any bucket
    expect(
      s.blocking_failures.length +
      s.non_blocking_failures.length +
      s.warnings.length +
      s.passed.length
    ).toBe(4) // 5 checks minus 1 skipped
  })

  test('warnings land only in warnings bucket', () => {
    const s = buildCloseCheckSummary(allWarnings)
    expect(s.warnings.length).toBe(3)
    expect(s.blocking_failures.length).toBe(0)
    expect(s.non_blocking_failures.length).toBe(0)
    expect(s.passed.length).toBe(0)
  })

  test('blocking_failures only contains is_blocking=true items', () => {
    const s = buildCloseCheckSummary(mixedChecks)
    expect(s.blocking_failures.every(c => c.is_blocking)).toBe(true)
  })

  test('non_blocking_failures only contains is_blocking=false items', () => {
    const s = buildCloseCheckSummary(mixedChecks)
    expect(s.non_blocking_failures.every(c => !c.is_blocking)).toBe(true)
  })
})

// ── computeCloseReadinessScore — additional boundary tests ────────────────────

describe('computeCloseReadinessScore — scoring formula boundary', () => {
  test('one blocking + one non-blocking fail → 100 - 20 - 8 = 72', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'c1', status: 'failed', is_blocking: true }),
      makeCheck({ id: 'c2', status: 'failed', is_blocking: false }),
    ]
    expect(computeCloseReadinessScore(checks)).toBe(72)
  })

  test('five warnings → 100 - 15 = 85', () => {
    const checks = Array.from({ length: 5 }, (_, i) =>
      makeCheck({ id: `w${i}`, status: 'warning', is_blocking: false })
    )
    expect(computeCloseReadinessScore(checks)).toBe(85)
  })

  test('three blocking fails → 100 - 60 = 40', () => {
    const checks = Array.from({ length: 3 }, (_, i) =>
      makeCheck({ id: `bf${i}`, status: 'failed', is_blocking: true })
    )
    expect(computeCloseReadinessScore(checks)).toBe(40)
  })

  test('mix of skipped and passed → still 100', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 's1', status: 'skipped', is_blocking: true }),
      makeCheck({ id: 's2', status: 'skipped', is_blocking: false }),
      makeCheck({ id: 'p1', status: 'passed',  is_blocking: true }),
      makeCheck({ id: 'p2', status: 'passed',  is_blocking: false }),
    ]
    expect(computeCloseReadinessScore(checks)).toBe(100)
  })

  test('exactly 5 blocking fails → score floors to 0 (100 - 100 = 0)', () => {
    const checks = Array.from({ length: 5 }, (_, i) =>
      makeCheck({ id: `b${i}`, status: 'failed', is_blocking: true })
    )
    expect(computeCloseReadinessScore(checks)).toBe(0)
  })

  test('score is an integer (no floats)', () => {
    const score = computeCloseReadinessScore(mixedChecks)
    expect(Number.isInteger(score)).toBe(true)
  })

  test('single warning → 97', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'w1', status: 'warning', is_blocking: false }),
    ]
    expect(computeCloseReadinessScore(checks)).toBe(97)
  })

  test('single non-blocking fail → 92', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'f1', status: 'failed', is_blocking: false }),
    ]
    expect(computeCloseReadinessScore(checks)).toBe(92)
  })

  test('single blocking fail → 80', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'bf1', status: 'failed', is_blocking: true }),
    ]
    expect(computeCloseReadinessScore(checks)).toBe(80)
  })

  test('result is always between 0 and 100 inclusive', () => {
    const scores = [
      computeCloseReadinessScore([]),
      computeCloseReadinessScore(allPassed),
      computeCloseReadinessScore(mixedChecks),
      computeCloseReadinessScore(twoBlockingFails),
      computeCloseReadinessScore(allWarnings),
    ]
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(100)
    }
  })
})

// ── classifyCloseReadiness — boundary tests ────────────────────────────────────

describe('classifyCloseReadiness — boundary scores', () => {
  test('score 89 without blocking fails → near_ready', () => {
    expect(classifyCloseReadiness(89)).toBe('near_ready')
  })

  test('score 90 without checks → ready', () => {
    expect(classifyCloseReadiness(90)).toBe('ready')
  })

  test('score 90 with blocking fail → needs_work (override)', () => {
    const blockFail: CloseCheck[] = [
      makeCheck({ id: 'bf', status: 'failed', is_blocking: true }),
    ]
    expect(classifyCloseReadiness(90, blockFail)).toBe('needs_work')
  })

  test('score 100 with all passed → ready', () => {
    expect(classifyCloseReadiness(100, allPassed)).toBe('ready')
  })

  test('score 50 → needs_work (lower boundary)', () => {
    expect(classifyCloseReadiness(50)).toBe('needs_work')
  })

  test('score 70 → near_ready (lower boundary)', () => {
    expect(classifyCloseReadiness(70)).toBe('near_ready')
  })

  test('score 1 → not_ready', () => {
    expect(classifyCloseReadiness(1)).toBe('not_ready')
  })

  test('score 100 with blocking warning check → ready (warning does not block)', () => {
    const warningBlocking: CloseCheck[] = [
      makeCheck({ id: 'wbl', status: 'warning', is_blocking: true }),
    ]
    expect(classifyCloseReadiness(97, warningBlocking)).toBe('ready')
  })

  test('return type is one of four valid strings', () => {
    const validResults = ['ready', 'near_ready', 'needs_work', 'not_ready']
    for (const score of [0, 25, 50, 70, 80, 90, 100]) {
      expect(validResults).toContain(classifyCloseReadiness(score))
    }
  })
})

// ── isReadyToClose — thorough check ──────────────────────────────────────────

describe('isReadyToClose — thorough coverage', () => {
  test('many passed + one blocking failed → false', () => {
    const checks: CloseCheck[] = [
      ...allPassed,
      makeCheck({ id: 'extra-fail', status: 'failed', is_blocking: true }),
    ]
    expect(isReadyToClose(checks)).toBe(false)
  })

  test('only skipped blocking checks → true', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 's1', status: 'skipped', is_blocking: true }),
      makeCheck({ id: 's2', status: 'skipped', is_blocking: true }),
    ]
    expect(isReadyToClose(checks)).toBe(true)
  })

  test('failed but non-blocking only → true', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'nb1', status: 'failed', is_blocking: false }),
      makeCheck({ id: 'nb2', status: 'failed', is_blocking: false }),
      makeCheck({ id: 'nb3', status: 'failed', is_blocking: false }),
    ]
    expect(isReadyToClose(checks)).toBe(true)
  })

  test('returns boolean', () => {
    expect(typeof isReadyToClose(allPassed)).toBe('boolean')
    expect(typeof isReadyToClose(oneBlockingFail)).toBe('boolean')
  })
})

// ── computeChecksPassed — additional tests ────────────────────────────────────

describe('computeChecksPassed — additional coverage', () => {
  test('total equals checks.length always', () => {
    const lengths = [0, 1, 3, 5, 10]
    for (const len of lengths) {
      const checks = Array.from({ length: len }, (_, i) =>
        makeCheck({ id: `c${i}`, status: 'passed', is_blocking: false })
      )
      expect(computeChecksPassed(checks).total).toBe(len)
    }
  })

  test('passed + failed + warnings can be less than total (skipped not counted)', () => {
    const r = computeChecksPassed(withSkipped)
    expect(r.passed + r.failed + r.warnings).toBeLessThan(r.total)
  })

  test('single blocking failure counted in failed', () => {
    const r = computeChecksPassed(oneBlockingFail)
    expect(r.failed).toBe(1)
  })

  test('single non-blocking failure counted in failed too', () => {
    const r = computeChecksPassed(oneNonBlockingFail)
    expect(r.failed).toBe(1)
  })

  test('warnings field counts all warning-status checks regardless of blocking', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'w-block', status: 'warning', is_blocking: true }),
      makeCheck({ id: 'w-noblock', status: 'warning', is_blocking: false }),
    ]
    const r = computeChecksPassed(checks)
    expect(r.warnings).toBe(2)
  })
})

// ── buildCloseCheckSummary — additional coverage ──────────────────────────────

describe('buildCloseCheckSummary — additional coverage', () => {
  test('returns object with all 4 required keys', () => {
    const s = buildCloseCheckSummary([])
    expect(s).toHaveProperty('blocking_failures')
    expect(s).toHaveProperty('non_blocking_failures')
    expect(s).toHaveProperty('warnings')
    expect(s).toHaveProperty('passed')
  })

  test('skipped items are not in any bucket', () => {
    const s = buildCloseCheckSummary(withSkipped)
    const allBucket = [
      ...s.blocking_failures,
      ...s.non_blocking_failures,
      ...s.warnings,
      ...s.passed,
    ]
    expect(allBucket.some(c => c.status === 'skipped')).toBe(false)
  })

  test('id field preserved in blocking_failures bucket', () => {
    const s = buildCloseCheckSummary(twoBlockingFails)
    expect(s.blocking_failures.map(c => c.id).sort()).toEqual(['c1', 'c2'])
  })

  test('large list properly partitioned', () => {
    const checks: CloseCheck[] = [
      makeCheck({ id: 'bf1', status: 'failed',  is_blocking: true }),
      makeCheck({ id: 'bf2', status: 'failed',  is_blocking: true }),
      makeCheck({ id: 'nf1', status: 'failed',  is_blocking: false }),
      makeCheck({ id: 'w1',  status: 'warning', is_blocking: false }),
      makeCheck({ id: 'w2',  status: 'warning', is_blocking: false }),
      makeCheck({ id: 'p1',  status: 'passed',  is_blocking: false }),
      makeCheck({ id: 'p2',  status: 'passed',  is_blocking: true }),
      makeCheck({ id: 'sk1', status: 'skipped', is_blocking: false }),
    ]
    const s = buildCloseCheckSummary(checks)
    expect(s.blocking_failures).toHaveLength(2)
    expect(s.non_blocking_failures).toHaveLength(1)
    expect(s.warnings).toHaveLength(2)
    expect(s.passed).toHaveLength(2)
    // skipped excluded
    const total = s.blocking_failures.length + s.non_blocking_failures.length + s.warnings.length + s.passed.length
    expect(total).toBe(7) // 8 checks - 1 skipped
  })
})
