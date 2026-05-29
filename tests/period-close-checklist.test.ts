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

// ══════════════════════════════════════════════════════════════════════════════
// allBlockingStepsPassed — additional edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe('allBlockingStepsPassed — all status values', () => {

  it('returns false when blocking step is fail (regardless of non-blocking pass)', () => {
    const steps = [
      step('pass', false),
      step('pass', false),
      step('fail', true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(false)
  })

  it('returns true when only non-blocking steps fail', () => {
    const steps = [
      step('fail', false),
      step('fail', false),
      step('fail', false),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('returns true when all blocking steps are skipped', () => {
    const steps = [
      step('skipped', true),
      step('skipped', true),
      step('pending', false),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('mix of pass and skipped on blocking steps → true', () => {
    const steps = [
      step('pass',    true),
      step('skipped', true),
      step('pass',    true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(true)
  })

  it('even one pending blocking step returns false', () => {
    const steps = [
      step('pass',    true),
      step('skipped', true),
      step('pending', true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(false)
  })

  it('large step list with single blocking fail returns false', () => {
    const steps = [
      ...Array.from({ length: 20 }, () => step('pass', false)),
      step('fail', true),
    ]
    expect(allBlockingStepsPassed(steps)).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeChecklistCompletion — additional edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe('computeChecklistCompletion — rounding and edge cases', () => {

  it('2 out of 3 = 67 (rounds correctly)', () => {
    const steps = [
      { status: 'pass' as ChecklistStepStatus },
      { status: 'pass' as ChecklistStepStatus },
      { status: 'fail' as ChecklistStepStatus },
    ]
    expect(computeChecklistCompletion(steps)).toBe(67)
  })

  it('all skipped → 0 (skipped is not pass)', () => {
    const steps = Array.from({ length: 5 }, () => ({ status: 'skipped' as ChecklistStepStatus }))
    expect(computeChecklistCompletion(steps)).toBe(0)
  })

  it('all pending → 0', () => {
    const steps = Array.from({ length: 5 }, () => ({ status: 'pending' as ChecklistStepStatus }))
    expect(computeChecklistCompletion(steps)).toBe(0)
  })

  it('exactly 80% pass for 5-step list → 80', () => {
    const steps = [
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'pass'    as ChecklistStepStatus },
      { status: 'pending' as ChecklistStepStatus },
    ]
    expect(computeChecklistCompletion(steps)).toBe(80)
  })

  it('single pass step → 100%', () => {
    expect(computeChecklistCompletion([{ status: 'pass' as ChecklistStepStatus }])).toBe(100)
  })

  it('single fail step → 0%', () => {
    expect(computeChecklistCompletion([{ status: 'fail' as ChecklistStepStatus }])).toBe(0)
  })

  it('returns integer (no fractional result)', () => {
    const steps = Array.from({ length: 7 }, (_, i) => ({
      status: (i < 4 ? 'pass' : 'fail') as ChecklistStepStatus,
    }))
    const pct = computeChecklistCompletion(steps)
    expect(Number.isInteger(pct)).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// buildChecklistStep — additional category mapping
// ══════════════════════════════════════════════════════════════════════════════

describe('buildChecklistStep — additional category mappings and fields', () => {

  it('infers data_completeness for all_expenses_ prefix', () => {
    const s = buildChecklistStep('all_expenses_entered', 'Giderler', 'pass', false)
    expect(s.category).toBe('data_completeness')
  })

  it('infers data_completeness for purchase_ prefix', () => {
    const s = buildChecklistStep('purchase_finalized', 'Satın alma', 'pass', false)
    expect(s.category).toBe('data_completeness')
  })

  it('infers accounting_accuracy for receivables_ prefix', () => {
    const s = buildChecklistStep('receivables_consistent', 'Alacaklar', 'pass', false)
    expect(s.category).toBe('accounting_accuracy')
  })

  it('infers accounting_accuracy for cogs_ prefix', () => {
    const s = buildChecklistStep('cogs_allocated', 'COGS', 'pass', false)
    expect(s.category).toBe('accounting_accuracy')
  })

  it('infers compliance for compensation_ prefix', () => {
    const s = buildChecklistStep('compensation_processed', 'Huzur hakkı', 'pass', false)
    expect(s.category).toBe('compliance')
  })

  it('review category for balance_sheet_ prefix (unknown → review)', () => {
    const s = buildChecklistStep('balance_sheet_reviewed', 'Bilanço', 'pass', false)
    expect(s.category).toBe('review')
  })

  it('review category for cashflow_ prefix', () => {
    const s = buildChecklistStep('cashflow_reviewed', 'Nakit akışı', 'pass', false)
    expect(s.category).toBe('review')
  })

  it('auto_checked is always true', () => {
    const s = buildChecklistStep('any_id', 'Label', 'fail', false)
    expect(s.auto_checked).toBe(true)
  })

  it('checked_at is a valid ISO timestamp string', () => {
    const s = buildChecklistStep('any_id', 'Label', 'pass', false)
    expect(s.checked_at).not.toBeNull()
    expect(new Date(s.checked_at!).getFullYear()).toBeGreaterThan(2024)
  })

  it('is_blocking field is preserved correctly for true/false', () => {
    const blocking    = buildChecklistStep('id_a', 'A', 'pass', true)
    const nonBlocking = buildChecklistStep('id_b', 'B', 'fail', false)
    expect(blocking.is_blocking).toBe(true)
    expect(nonBlocking.is_blocking).toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// determineCloseReadiness — additional threshold edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe('determineCloseReadiness — all combinations', () => {

  it('all 10 steps pass, no blocking → ready', () => {
    const steps = Array.from({ length: 10 }, () => step('pass', false))
    expect(determineCloseReadiness(steps)).toBe('ready')
  })

  it('9/10 pass, no blocking → ready (90% >= 80%)', () => {
    const steps = [
      ...Array.from({ length: 9 }, () => step('pass', false)),
      step('pending', false),
    ]
    expect(determineCloseReadiness(steps)).toBe('ready')
  })

  it('7/10 pass, no blocking → incomplete (70% < 80%)', () => {
    const steps = [
      ...Array.from({ length: 7 }, () => step('pass', false)),
      ...Array.from({ length: 3 }, () => step('pending', false)),
    ]
    expect(determineCloseReadiness(steps)).toBe('incomplete')
  })

  it('pending blocking step does not cause blocked, but causes incomplete via allBlockingStepsPassed', () => {
    // pending blocking → allBlockingStepsPassed = false → incomplete (not blocked)
    const steps = [
      ...Array.from({ length: 9 }, () => step('pass', false)),
      step('pending', true),
    ]
    // determineCloseReadiness checks only 'fail' for blocked
    // pending → not blocked; completion = 9/10 = 90% but allBlockingStepsPassed = false → incomplete
    const result = determineCloseReadiness(steps)
    expect(result).toBe('incomplete')
  })

  it('blocked when exactly one blocking step fails among many passing', () => {
    const steps = [
      ...Array.from({ length: 13 }, () => step('pass', false)),
      step('fail', true),
    ]
    expect(determineCloseReadiness(steps)).toBe('blocked')
  })

  it('skipped blocking steps still allow ready state', () => {
    const steps = [
      ...Array.from({ length: 9 }, () => step('pass', false)),
      step('skipped', true),
    ]
    // 9/10 pass = 90%, skipped blocking → allBlockingStepsPassed true → ready
    expect(determineCloseReadiness(steps)).toBe('ready')
  })
})
