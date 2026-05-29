/**
 * Tests for lib/services/ledger/period-close-wizard.service.ts
 *
 * Tests pure helper functions: computePhaseCompletion, computeOverallPct,
 * determineCurrentPhase — plus WizardStep shape validation.
 *
 * Run with: npx vitest run tests/period-close-wizard.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computePhaseCompletion,
  computeOverallPct,
  determineCurrentPhase,
} from '../lib/services/ledger/period-close-wizard.service'
import type {
  WizardStep,
  WizardPhaseResult,
  WizardPhase,
} from '../lib/services/ledger/period-close-wizard.service'

// ── Test data builders ────────────────────────────────────────────────────────

function makeStep(overrides: Partial<WizardStep> = {}): WizardStep {
  return {
    id:          overrides.id          ?? 'test_step',
    phase:       overrides.phase       ?? 1,
    label:       overrides.label       ?? 'Test Adımı',
    description: overrides.description ?? 'Test adımı açıklaması.',
    status:      overrides.status      ?? 'pending',
    is_blocking: overrides.is_blocking ?? true,
    is_auto:     overrides.is_auto     ?? true,
    detail:      overrides.detail,
    action_label: overrides.action_label,
    action_href:  overrides.action_href,
  }
}

function makePhase(
  phase: WizardPhase,
  steps: WizardStep[],
  label = 'Test Aşaması',
): WizardPhaseResult {
  const is_complete        = computePhaseCompletion(steps)
  const blocking_failures  = steps.filter(s => s.is_blocking && s.status === 'fail').length
  const total_steps        = steps.length
  const passed_steps       = steps.filter(s => s.status === 'pass').length
  return { phase, label, steps, is_complete, blocking_failures, total_steps, passed_steps }
}

// ═══════════════════════════════════════════════════════════════════════════════
// computePhaseCompletion
// ═══════════════════════════════════════════════════════════════════════════════

describe('computePhaseCompletion', () => {

  it('returns true for empty step array', () => {
    expect(computePhaseCompletion([])).toBe(true)
  })

  it('returns true when all blocking steps have status=pass', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true,  status: 'pass' }),
      makeStep({ id: 'b', is_blocking: true,  status: 'pass' }),
      makeStep({ id: 'c', is_blocking: false, status: 'fail' }), // non-blocking fail — should not block
    ]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('returns false when one blocking step has status=fail', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true, status: 'pass' }),
      makeStep({ id: 'b', is_blocking: true, status: 'fail' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('returns false when one blocking step has status=pending', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true, status: 'pass' }),
      makeStep({ id: 'b', is_blocking: true, status: 'pending' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('returns true when non-blocking step fails but all blocking steps pass', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true,  status: 'pass' }),
      makeStep({ id: 'b', is_blocking: false, status: 'fail' }),
      makeStep({ id: 'c', is_blocking: false, status: 'pending' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('returns true when there are only non-blocking steps all passing', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: false, status: 'pass' }),
      makeStep({ id: 'b', is_blocking: false, status: 'pass' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('returns true when all steps are skipped and non-blocking', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: false, status: 'skipped' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('returns false when a blocking step is manual (not yet confirmed)', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true, status: 'pass' }),
      makeStep({ id: 'b', is_blocking: true, status: 'manual' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('returns false when a single blocking step is skipped', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true, status: 'skipped' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('returns false for blocking step with status=pending even when all non-blocking pass', () => {
    const steps = [
      makeStep({ id: 'a', is_blocking: true,  status: 'pending' }),
      makeStep({ id: 'b', is_blocking: false, status: 'pass' }),
      makeStep({ id: 'c', is_blocking: false, status: 'pass' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('returns true when there is only 1 blocking step and it passes', () => {
    const steps = [makeStep({ id: 'x', is_blocking: true, status: 'pass' })]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('returns false when there is only 1 blocking step and it fails', () => {
    const steps = [makeStep({ id: 'x', is_blocking: true, status: 'fail' })]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('multiple blocking steps — all must pass, any failure blocks', () => {
    const statuses = ['pass', 'pass', 'fail', 'pass'] as const
    const steps = statuses.map((s, i) => makeStep({ id: `s${i}`, is_blocking: true, status: s }))
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('multiple blocking steps — all pass when statuses are all pass', () => {
    const steps = ['a', 'b', 'c', 'd'].map(id =>
      makeStep({ id, is_blocking: true, status: 'pass' })
    )
    expect(computePhaseCompletion(steps)).toBe(true)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// computeOverallPct
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeOverallPct', () => {

  it('returns 0 when there are no phases', () => {
    expect(computeOverallPct([])).toBe(0)
  })

  it('returns 0 when all phases have no steps', () => {
    const phases = [
      makePhase(1, []),
      makePhase(2, []),
    ]
    expect(computeOverallPct(phases)).toBe(0)
  })

  it('returns 100 when all steps pass', () => {
    const steps = [
      makeStep({ id: 'a', status: 'pass' }),
      makeStep({ id: 'b', status: 'pass' }),
    ]
    const phases = [makePhase(1, steps)]
    expect(computeOverallPct(phases)).toBe(100)
  })

  it('returns 50 when half of steps pass', () => {
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a', status: 'pass' }),
        makeStep({ id: 'b', status: 'fail' }),
      ]),
    ]
    expect(computeOverallPct(phases)).toBe(50)
  })

  it('aggregates passed_steps across multiple phases correctly', () => {
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a', status: 'pass' }),
        makeStep({ id: 'b', status: 'pass' }),
        makeStep({ id: 'c', status: 'fail' }),
      ]),
      makePhase(2, [
        makeStep({ id: 'd', status: 'pass' }),
        makeStep({ id: 'e', status: 'pending' }),
      ]),
    ]
    // 3 passed out of 5 total = 60%
    expect(computeOverallPct(phases)).toBe(60)
  })

  it('returns 0 when no steps pass', () => {
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a', status: 'fail' }),
        makeStep({ id: 'b', status: 'pending' }),
      ]),
    ]
    expect(computeOverallPct(phases)).toBe(0)
  })

  it('result is always an integer (Math.round applied)', () => {
    // 1 passed out of 3 → 33.33% → rounds to 33
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a', status: 'pass' }),
        makeStep({ id: 'b', status: 'fail' }),
        makeStep({ id: 'c', status: 'fail' }),
      ]),
    ]
    const result = computeOverallPct(phases)
    expect(Number.isInteger(result)).toBe(true)
    expect(result).toBe(33)
  })

  it('result is always in range [0, 100]', () => {
    const allPass = [
      makePhase(1, [makeStep({ id: 'a', status: 'pass' })]),
      makePhase(2, [makeStep({ id: 'b', status: 'pass' })]),
    ]
    const allFail = [
      makePhase(1, [makeStep({ id: 'c', status: 'fail' })]),
    ]
    expect(computeOverallPct(allPass)).toBe(100)
    expect(computeOverallPct(allFail)).toBe(0)
  })

  it('4-phase scenario: 7/10 passed = 70%', () => {
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a1', status: 'pass' }),
        makeStep({ id: 'a2', status: 'pass' }),
        makeStep({ id: 'a3', status: 'pass' }),
      ]),
      makePhase(2, [
        makeStep({ id: 'b1', status: 'pass' }),
        makeStep({ id: 'b2', status: 'pass' }),
        makeStep({ id: 'b3', status: 'fail' }),
      ]),
      makePhase(3, [
        makeStep({ id: 'c1', status: 'pass' }),
        makeStep({ id: 'c2', status: 'fail' }),
      ]),
      makePhase(4, [
        makeStep({ id: 'd1', status: 'pass' }),
        makeStep({ id: 'd2', status: 'pending' }),
      ]),
    ]
    // 3 + 2 + 1 + 1 = 7 passed; total = 10; 70%
    expect(computeOverallPct(phases)).toBe(70)
  })

  it('one empty phase + one full phase: counts only non-empty phase steps', () => {
    const phases = [
      makePhase(1, []),
      makePhase(2, [
        makeStep({ id: 'a', status: 'pass' }),
        makeStep({ id: 'b', status: 'pass' }),
      ]),
    ]
    expect(computeOverallPct(phases)).toBe(100)
  })

  it('skipped steps do not count as passed', () => {
    const phases = [
      makePhase(1, [
        makeStep({ id: 'a', status: 'skipped' }),
        makeStep({ id: 'b', status: 'pass' }),
      ]),
    ]
    // 1 passed out of 2 = 50%
    expect(computeOverallPct(phases)).toBe(50)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// determineCurrentPhase
// ═══════════════════════════════════════════════════════════════════════════════

describe('determineCurrentPhase', () => {

  it('returns phase 1 when phase 1 is not complete', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'fail' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'pass' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(1)
  })

  it('returns phase 3 when phases 1 and 2 are complete but 3 is not', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'pass' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'pass' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pending' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(3)
  })

  it('returns 4 when all phases are complete', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'pass' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'pass' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(4)
  })

  it('returns 4 when all phases have no steps (all empty = complete)', () => {
    const phases = [
      makePhase(1, []),
      makePhase(2, []),
      makePhase(3, []),
      makePhase(4, []),
    ]
    expect(determineCurrentPhase(phases)).toBe(4)
  })

  it('returns phase 2 when phase 1 is complete but phase 2 has a blocking fail', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'pass' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'fail' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(2)
  })

  it('returns phase 4 when only phase 4 is incomplete', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'pass' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'pass' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'fail' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(4)
  })

  it('does not skip phases — returns earliest incomplete phase', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'fail' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'fail' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
    ]
    expect(determineCurrentPhase(phases)).toBe(1)
  })

  it('phase with only non-blocking fail is considered complete', () => {
    const phases = [
      makePhase(1, [makeStep({ id: 'a', is_blocking: false, status: 'fail' })]),
      makePhase(2, [makeStep({ id: 'b', is_blocking: true,  status: 'fail' })]),
      makePhase(3, [makeStep({ id: 'c', is_blocking: true,  status: 'pass' })]),
      makePhase(4, [makeStep({ id: 'd', is_blocking: true,  status: 'pass' })]),
    ]
    // Phase 1 is complete (no blocking fails), phase 2 is not
    expect(determineCurrentPhase(phases)).toBe(2)
  })

  it('returns a valid WizardPhase (1,2,3,4) in all cases', () => {
    const phaseSets = [
      [makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'fail' })])],
      [
        makePhase(1, [makeStep({ id: 'a', is_blocking: true, status: 'pass' })]),
        makePhase(2, [makeStep({ id: 'b', is_blocking: true, status: 'pass' })]),
        makePhase(3, [makeStep({ id: 'c', is_blocking: true, status: 'pass' })]),
        makePhase(4, [makeStep({ id: 'd', is_blocking: true, status: 'pass' })]),
      ],
    ]
    for (const phases of phaseSets) {
      const current = determineCurrentPhase(phases)
      expect([1, 2, 3, 4]).toContain(current)
    }
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// WizardStep shape validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('WizardStep shape validation', () => {

  it('a valid WizardStep has all required fields', () => {
    const step = makeStep({
      id:          'sales_all_invoiced',
      phase:       1,
      label:       'Tüm satışlar faturalandı',
      description: 'Bu dönemdeki taslak satış faturası sayısı sıfır olmalı.',
      status:      'pass',
      is_blocking: true,
      is_auto:     true,
    })

    // Required fields exist
    expect(step).toHaveProperty('id')
    expect(step).toHaveProperty('phase')
    expect(step).toHaveProperty('label')
    expect(step).toHaveProperty('description')
    expect(step).toHaveProperty('status')
    expect(step).toHaveProperty('is_blocking')
    expect(step).toHaveProperty('is_auto')

    // Type checks
    expect(typeof step.id).toBe('string')
    expect(typeof step.phase).toBe('number')
    expect(typeof step.label).toBe('string')
    expect(typeof step.description).toBe('string')
    expect(['pass', 'fail', 'pending', 'manual', 'skipped']).toContain(step.status)
    expect(typeof step.is_blocking).toBe('boolean')
    expect(typeof step.is_auto).toBe('boolean')
  })

  it('optional fields can be undefined', () => {
    const step = makeStep({ id: 'minimal' })
    // Optional fields should be undefined when not set
    expect(step.detail).toBeUndefined()
    expect(step.action_label).toBeUndefined()
    expect(step.action_href).toBeUndefined()
  })

  it('all valid StepStatus values are accepted', () => {
    const statuses: Array<WizardStep['status']> = ['pass', 'fail', 'pending', 'manual', 'skipped']
    for (const status of statuses) {
      const step = makeStep({ status })
      expect(step.status).toBe(status)
    }
  })

  it('phase must be 1, 2, 3, or 4', () => {
    const validPhases: WizardPhase[] = [1, 2, 3, 4]
    for (const phase of validPhases) {
      const step = makeStep({ phase })
      expect([1, 2, 3, 4]).toContain(step.phase)
    }
  })

  it('is_blocking can be both true and false', () => {
    const blocking    = makeStep({ is_blocking: true })
    const nonBlocking = makeStep({ is_blocking: false })
    expect(blocking.is_blocking).toBe(true)
    expect(nonBlocking.is_blocking).toBe(false)
  })

  it('is_auto can be both true and false', () => {
    const auto   = makeStep({ is_auto: true })
    const manual = makeStep({ is_auto: false })
    expect(auto.is_auto).toBe(true)
    expect(manual.is_auto).toBe(false)
  })

  it('action_href is set when provided', () => {
    const step = makeStep({ action_href: '/dashboard/finance' })
    expect(step.action_href).toBe('/dashboard/finance')
  })

  it('action_label is set when provided', () => {
    const step = makeStep({ action_label: 'Git' })
    expect(step.action_label).toBe('Git')
  })

  it('detail is set when provided', () => {
    const step = makeStep({ detail: 'Detay metni.' })
    expect(step.detail).toBe('Detay metni.')
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// computeOverallPct monotonicity
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeOverallPct — monotonicity', () => {

  it('adding a passing step increases pct', () => {
    const base = [makePhase(1, [makeStep({ id: 'a', status: 'pass' })])]
    const more = [makePhase(1, [
      makeStep({ id: 'a', status: 'pass' }),
      makeStep({ id: 'b', status: 'pass' }),
    ])]
    expect(computeOverallPct(base)).toBe(computeOverallPct(more))  // 100% in both
  })

  it('adding a failing step decreases pct', () => {
    const pass2 = [makePhase(1, [
      makeStep({ id: 'a', status: 'pass' }),
      makeStep({ id: 'b', status: 'pass' }),
    ])]
    const pass2fail1 = [makePhase(1, [
      makeStep({ id: 'a', status: 'pass' }),
      makeStep({ id: 'b', status: 'pass' }),
      makeStep({ id: 'c', status: 'fail' }),
    ])]
    expect(computeOverallPct(pass2fail1)).toBeLessThan(computeOverallPct(pass2))
  })

  it('pct is never negative', () => {
    const allFail = [makePhase(1, [
      makeStep({ id: 'a', status: 'fail' }),
      makeStep({ id: 'b', status: 'fail' }),
    ])]
    expect(computeOverallPct(allFail)).toBeGreaterThanOrEqual(0)
  })

  it('pct is never above 100', () => {
    const allPass = [makePhase(1, [
      makeStep({ id: 'a', status: 'pass' }),
      makeStep({ id: 'b', status: 'pass' }),
      makeStep({ id: 'c', status: 'pass' }),
    ])]
    expect(computeOverallPct(allPass)).toBeLessThanOrEqual(100)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// computePhaseCompletion — edge cases with mixed statuses
// ═══════════════════════════════════════════════════════════════════════════════

describe('computePhaseCompletion — null/zero equivalents', () => {

  it('10 blocking steps all passing → complete', () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({ id: `s${i}`, is_blocking: true, status: 'pass' })
    )
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('10 blocking steps — last one fails → incomplete', () => {
    const steps = Array.from({ length: 10 }, (_, i) =>
      makeStep({ id: `s${i}`, is_blocking: true, status: i === 9 ? 'fail' : 'pass' })
    )
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('mixed: 5 blocking pass + 5 non-blocking fail → complete', () => {
    const blocking    = Array.from({ length: 5 }, (_, i) =>
      makeStep({ id: `b${i}`, is_blocking: true,  status: 'pass' })
    )
    const nonBlocking = Array.from({ length: 5 }, (_, i) =>
      makeStep({ id: `n${i}`, is_blocking: false, status: 'fail' })
    )
    expect(computePhaseCompletion([...blocking, ...nonBlocking])).toBe(true)
  })

})

// ─────────────────────────────────────────────────────────────────────────────
// computePhaseCompletion — skipped steps
// ─────────────────────────────────────────────────────────────────────────────

describe('computePhaseCompletion() — skipped step handling', () => {
  it('blocking step with status=skipped → NOT counted as pass → incomplete', () => {
    const steps = [
      makeStep({ id: 's1', is_blocking: true, status: 'skipped' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('blocking step pass + blocking step skipped → incomplete', () => {
    const steps = [
      makeStep({ id: 's1', is_blocking: true, status: 'pass' }),
      makeStep({ id: 's2', is_blocking: true, status: 'skipped' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('non-blocking step skipped does not affect completion', () => {
    const steps = [
      makeStep({ id: 's1', is_blocking: true,  status: 'pass' }),
      makeStep({ id: 's2', is_blocking: false, status: 'skipped' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(true)
  })

  it('blocking step with status=pending → incomplete', () => {
    const steps = [
      makeStep({ id: 's1', is_blocking: true, status: 'pending' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })

  it('blocking step with status=manual → incomplete', () => {
    const steps = [
      makeStep({ id: 's1', is_blocking: true, status: 'manual' }),
    ]
    expect(computePhaseCompletion(steps)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeOverallPct — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('computeOverallPct() — additional cases', () => {
  it('single phase with 0 total_steps → 0', () => {
    const phase = makePhase(1, [])
    expect(computeOverallPct([phase])).toBe(0)
  })

  it('all steps passed → 100', () => {
    const steps = [
      makeStep({ status: 'pass' }),
      makeStep({ id: 's2', status: 'pass' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(100)
  })

  it('no steps passed → 0', () => {
    const steps = [
      makeStep({ status: 'fail' }),
      makeStep({ id: 's2', status: 'pending' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(0)
  })

  it('50% passed across single phase → 50', () => {
    const steps = [
      makeStep({ id: 's1', status: 'pass' }),
      makeStep({ id: 's2', status: 'fail' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(50)
  })

  it('75% passed → 75', () => {
    const steps = [
      makeStep({ id: 's1', status: 'pass' }),
      makeStep({ id: 's2', status: 'pass' }),
      makeStep({ id: 's3', status: 'pass' }),
      makeStep({ id: 's4', status: 'fail' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(75)
  })

  it('4 phases: 2 fully passed, 2 fully failed → 50', () => {
    const passStep = (id: string) => makeStep({ id, status: 'pass', is_blocking: true })
    const failStep = (id: string) => makeStep({ id, status: 'fail', is_blocking: true })
    const p1 = makePhase(1, [passStep('a'), passStep('b')])
    const p2 = makePhase(2, [passStep('c'), passStep('d')])
    const p3 = makePhase(3, [failStep('e'), failStep('f')])
    const p4 = makePhase(4, [failStep('g'), failStep('h')])
    expect(computeOverallPct([p1, p2, p3, p4])).toBe(50)
  })

  it('uses Math.round — 1 of 3 passed → 33', () => {
    const steps = [
      makeStep({ id: 's1', status: 'pass' }),
      makeStep({ id: 's2', status: 'fail' }),
      makeStep({ id: 's3', status: 'fail' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(33)
  })

  it('2 of 3 passed → 67 (rounded)', () => {
    const steps = [
      makeStep({ id: 's1', status: 'pass' }),
      makeStep({ id: 's2', status: 'pass' }),
      makeStep({ id: 's3', status: 'fail' }),
    ]
    const phase = makePhase(1, steps)
    expect(computeOverallPct([phase])).toBe(67)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// determineCurrentPhase() — additional cases
// ─────────────────────────────────────────────────────────────────────────────

describe('determineCurrentPhase() — additional cases', () => {
  it('phase 1 incomplete → returns 1', () => {
    const p1 = makePhase(1, [makeStep({ status: 'fail', is_blocking: true })])
    const p2 = makePhase(2, [makeStep({ id: 's2', status: 'pass', is_blocking: true })])
    const p3 = makePhase(3, [makeStep({ id: 's3', status: 'pass', is_blocking: true })])
    const p4 = makePhase(4, [makeStep({ id: 's4', status: 'pass', is_blocking: true })])
    expect(determineCurrentPhase([p1, p2, p3, p4])).toBe(1)
  })

  it('phase 1 complete, phase 2 incomplete → returns 2', () => {
    const p1 = makePhase(1, [makeStep({ status: 'pass', is_blocking: true })])
    const p2 = makePhase(2, [makeStep({ id: 's2', status: 'fail', is_blocking: true })])
    const p3 = makePhase(3, [makeStep({ id: 's3', status: 'pass', is_blocking: true })])
    const p4 = makePhase(4, [makeStep({ id: 's4', status: 'pass', is_blocking: true })])
    expect(determineCurrentPhase([p1, p2, p3, p4])).toBe(2)
  })

  it('phases 1-3 complete, phase 4 incomplete → returns 4', () => {
    const p1 = makePhase(1, [makeStep({ status: 'pass', is_blocking: true })])
    const p2 = makePhase(2, [makeStep({ id: 's2', status: 'pass', is_blocking: true })])
    const p3 = makePhase(3, [makeStep({ id: 's3', status: 'pass', is_blocking: true })])
    const p4 = makePhase(4, [makeStep({ id: 's4', status: 'fail', is_blocking: true })])
    expect(determineCurrentPhase([p1, p2, p3, p4])).toBe(4)
  })

  it('all phases complete → returns 4', () => {
    const p1 = makePhase(1, [makeStep({ status: 'pass', is_blocking: true })])
    const p2 = makePhase(2, [makeStep({ id: 's2', status: 'pass', is_blocking: true })])
    const p3 = makePhase(3, [makeStep({ id: 's3', status: 'pass', is_blocking: true })])
    const p4 = makePhase(4, [makeStep({ id: 's4', status: 'pass', is_blocking: true })])
    expect(determineCurrentPhase([p1, p2, p3, p4])).toBe(4)
  })

  it('empty phase array → returns 4 (loop exits without finding incomplete)', () => {
    expect(determineCurrentPhase([])).toBe(4)
  })

  it('only phase 3 incomplete → returns 3', () => {
    const p1 = makePhase(1, [makeStep({ status: 'pass', is_blocking: true })])
    const p2 = makePhase(2, [makeStep({ id: 's2', status: 'pass', is_blocking: true })])
    const p3 = makePhase(3, [makeStep({ id: 's3', status: 'pending', is_blocking: true })])
    const p4 = makePhase(4, [makeStep({ id: 's4', status: 'pass', is_blocking: true })])
    expect(determineCurrentPhase([p1, p2, p3, p4])).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// WizardStep shape — field defaults and validation
// ─────────────────────────────────────────────────────────────────────────────

describe('WizardStep — shape tests', () => {
  it('makeStep with no overrides has expected defaults', () => {
    const step = makeStep()
    expect(step.id).toBe('test_step')
    expect(step.phase).toBe(1)
    expect(step.status).toBe('pending')
    expect(step.is_blocking).toBe(true)
    expect(step.is_auto).toBe(true)
  })

  it('optional detail field is undefined when not provided', () => {
    const step = makeStep()
    expect(step.detail).toBeUndefined()
  })

  it('optional action_label is undefined when not provided', () => {
    const step = makeStep()
    expect(step.action_label).toBeUndefined()
  })

  it('optional action_href is undefined when not provided', () => {
    const step = makeStep()
    expect(step.action_href).toBeUndefined()
  })

  it('overrides are applied correctly', () => {
    const step = makeStep({
      id: 'custom_step',
      phase: 3,
      status: 'pass',
      is_blocking: false,
      detail: 'Detail text',
      action_label: 'Fix it',
      action_href: '/path/to/fix',
    })
    expect(step.id).toBe('custom_step')
    expect(step.phase).toBe(3)
    expect(step.status).toBe('pass')
    expect(step.is_blocking).toBe(false)
    expect(step.detail).toBe('Detail text')
    expect(step.action_label).toBe('Fix it')
    expect(step.action_href).toBe('/path/to/fix')
  })

  it('all 5 StepStatus values are valid for WizardStep', () => {
    const statuses: Array<WizardStep['status']> = ['pass', 'fail', 'pending', 'manual', 'skipped']
    for (const status of statuses) {
      const step = makeStep({ status })
      expect(step.status).toBe(status)
    }
  })
})
