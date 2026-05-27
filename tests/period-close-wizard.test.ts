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

})
