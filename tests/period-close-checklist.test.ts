/**
 * Tests for lib/services/ledger/period-close-checklist.service.ts
 *
 * Tests pure exported functions:
 *   allBlockingStepsPassed
 *   computeChecklistCompletion
 *   buildChecklistStep
 *   determineCloseReadiness
 *
 * Run with: npx vitest run tests/period-close-checklist.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  allBlockingStepsPassed,
  computeChecklistCompletion,
  buildChecklistStep,
  determineCloseReadiness,
} from '../lib/services/ledger/period-close-checklist.service'
import type { ChecklistStepStatus } from '../lib/services/ledger/period-close-checklist.service'

// ── Test data builders ────────────────────────────────────────────────────────

function step(
  status: ChecklistStepStatus,
  is_blocking: boolean,
): { status: ChecklistStepStatus; is_blocking: boolean } {
  return { status, is_blocking }
}

// ══════════════════════════════════════════════════════════════════════════════
// allBlockingStepsPassed
// ══════════════════════════════════════════════════════════════════════════════

describe('allBlockingStepsPassed', () => {
  it('returns true when all blocking steps have status pass', () => {
    const steps = [
      step('pass', true),
      step('pass', true),
      step('fail', false),  // non-blocking fail should not matter
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('returns false when one blocking step has status fail', () => {
    const steps = [
      step('pass', true),
      step('fail', true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(false)
  })

  it('returns true when there are no blocking steps at all', () => {
    const steps = [
      step('fail',    false),
      step('pending', false),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('returns true for an empty array', () => {
    expect(allBlockingStepsPassed([])).toBe(true)
  })

  it('returns true when blocking step is skipped (treated as pass)', () => {
    const steps = [
      step('skipped', true),
      step('pass',    true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('returns false when blocking step is pending (not yet resolved)', () => {
    const steps = [
      step('pending', true),
      step('pass',    true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeChecklistCompletion
// ══════════════════════════════════════════════════════════════════════════════

describe('computeChecklistCompletion', () => {
  it('returns 100 when all steps pass', () => {
    const steps = [
      { status: 'pass' as ChecklistStepStatus },
      { status: 'pass' as ChecklistStepStatus },
      { status: 'pass' as ChecklistStepStatus },
    ]
    expect(computeChecklistCompletion(steps)).toBe(100)
  })

  it('returns 0 when no steps pass', () => {
    const steps = [
      { status: 'fail'    as ChecklistStepStatus },
      { status: 'pending' as ChecklistStepStatus },
      { status: 'skipped' as ChecklistStepStatus },
    ]
    expect(computeChecklistCompletion(steps)).toBe(0)
  })

  it('returns 0 when array is empty', () => {
    expect(computeChecklistCompletion([])).toBe(0)
  })

  it('computes rounded integer percentage for mixed results', () => {
    // 7 out of 14 = 50%
    const steps = Array.from({ length: 14 }, (_, i) => ({
      status: (i < 7 ? 'pass' : 'fail') as ChecklistStepStatus,
    }))
    expect(computeChecklistCompletion(steps)).toBe(50)
  })

  it('rounds to nearest integer', () => {
    // 1 out of 3 = 33.33... → rounds to 33
    const steps = [
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'fail'    as ChecklistStepStatus },
      { status: 'pending' as ChecklistStepStatus },
    ]
    expect(computeChecklistCompletion(steps)).toBe(33)
  })

  it('only counts pass status — skipped/pending/fail are not counted', () => {
    const steps = [
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'skipped' as ChecklistStepStatus },
      { status: 'pending' as ChecklistStepStatus },
      { status: 'fail'    as ChecklistStepStatus },
    ]
    // 1/4 = 25
    expect(computeChecklistCompletion(steps)).toBe(25)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// buildChecklistStep
// ══════════════════════════════════════════════════════════════════════════════

describe('buildChecklistStep', () => {
  it('assembles correct fields from arguments', () => {
    const s = buildChecklistStep('all_sales_entered', 'Satışlar girildi', 'pass', true, 'Detay')
    expect(s.id).toBe('all_sales_entered')
    expect(s.label).toBe('Satışlar girildi')
    expect(s.status).toBe('pass')
    expect(s.is_blocking).toBe(true)
    expect(s.detail).toBe('Detay')
    expect(s.auto_checked).toBe(true)
    expect(s.checked_at).not.toBeNull()
  })

  it('sets detail to null when not provided', () => {
    const s = buildChecklistStep('no_negative_cash', 'Nakit pozitif', 'pass', false)
    expect(s.detail).toBeNull()
  })

  it('infers data_completeness category from id prefix all_sales', () => {
    const s = buildChecklistStep('all_sales_entered', 'Label', 'pass', true)
    expect(s.category).toBe('data_completeness')
  })

  it('infers data_completeness category from id prefix stock_', () => {
    const s = buildChecklistStep('stock_reconciled', 'Label', 'pass', true)
    expect(s.category).toBe('data_completeness')
  })

  it('infers accounting_accuracy category from id prefix trial_', () => {
    const s = buildChecklistStep('trial_balance_balanced', 'Label', 'pass', true)
    expect(s.category).toBe('accounting_accuracy')
  })

  it('infers accounting_accuracy category from id prefix no_negative', () => {
    const s = buildChecklistStep('no_negative_cash', 'Label', 'pass', false)
    expect(s.category).toBe('accounting_accuracy')
  })

  it('infers compliance category from id prefix kdv_', () => {
    const s = buildChecklistStep('kdv_period_computed', 'Label', 'pass', false)
    expect(s.category).toBe('compliance')
  })

  it('infers compliance category from id prefix legal_', () => {
    const s = buildChecklistStep('legal_reserve_computed', 'Label', 'pending', true)
    expect(s.category).toBe('compliance')
  })

  it('defaults to review category for unknown id prefix', () => {
    const s = buildChecklistStep('cfo_sign_off', 'CFO', 'pending', true)
    expect(s.category).toBe('review')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// determineCloseReadiness
// ══════════════════════════════════════════════════════════════════════════════

describe('determineCloseReadiness', () => {
  it('returns ready when all blocking steps pass and completion >= 80%', () => {
    // 12/14 = ~86% — above threshold; no blocking failures
    const steps = Array.from({ length: 14 }, (_, i) => ({
      status:      (i < 12 ? 'pass' : 'pending') as ChecklistStepStatus,
      is_blocking: i < 5,  // first 5 are blocking, all pass
    }))
    expect(determineCloseReadiness(steps)).toBe('ready')
  })

  it('returns blocked when any blocking step failed', () => {
    const steps = [
      step('pass', true),
      step('fail', true),   // blocking failure
      step('pass', false),
    ]
    expect(determineCloseReadiness(steps)).toBe('blocked')
  })

  it('returns incomplete when no blocking failures but completion < 80%', () => {
    // 5/14 = ~36% — below 80%; no blocking failures
    const steps = Array.from({ length: 14 }, (_, i) => ({
      status:      (i < 5 ? 'pass' : 'pending') as ChecklistStepStatus,
      is_blocking: false,
    }))
    expect(determineCloseReadiness(steps)).toBe('incomplete')
  })

  it('returns incomplete at exactly 79% (below threshold)', () => {
    // need floor(79/100 * n) pass out of n
    // 79 pass, 21 pending = 100 total
    const steps = Array.from({ length: 100 }, (_, i) => ({
      status:      (i < 79 ? 'pass' : 'pending') as ChecklistStepStatus,
      is_blocking: false,
    }))
    expect(determineCloseReadiness(steps)).toBe('incomplete')
  })

  it('returns ready at exactly 80% threshold', () => {
    // 8/10 = 80%
    const steps = Array.from({ length: 10 }, (_, i) => ({
      status:      (i < 8 ? 'pass' : 'pending') as ChecklistStepStatus,
      is_blocking: false,
    }))
    expect(determineCloseReadiness(steps)).toBe('ready')
  })

  it('blocked takes precedence over incomplete (both conditions true)', () => {
    // 1/10 pass = 10% (incomplete), but one blocking fail = blocked
    const steps = [
      step('pass', false),
      step('fail', true),   // this triggers blocked
      ...Array.from({ length: 8 }, () => step('pending', false)),
    ]
    expect(determineCloseReadiness(steps)).toBe('blocked')
  })

  it('returns ready when there are no steps (vacuously true with 0%... edge)', () => {
    // No steps → allBlockingStepsPassed is true, but computeChecklistCompletion = 0 < 80
    // So readiness should be incomplete
    expect(determineCloseReadiness([])).toBe('incomplete')
  })
})
