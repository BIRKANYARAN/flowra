/**
 * tests/period-close-wizard-complete.test.ts
 *
 * Pure-function tests for the new helpers added to
 * lib/services/ledger/period-close-wizard.service.ts:
 *
 *   - allMandatoryPass
 *   - getBlockerMessage
 *   - countByStatus
 *   - estimateMinutesToClose
 *
 * Run: npx vitest run tests/period-close-wizard-complete.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  allMandatoryPass,
  getBlockerMessage,
  countByStatus,
  estimateMinutesToClose,
} from '../lib/services/ledger/period-close-wizard.service'
import type { WizardStep, StepStatus, WizardPhase } from '../lib/services/ledger/period-close-wizard.service'

// ── Test data builders ────────────────────────────────────────────────────────

function makeStep(overrides: Partial<WizardStep> = {}): WizardStep {
  return {
    id:           overrides.id          ?? 'test_step',
    phase:        (overrides.phase       ?? 1) as WizardPhase,
    label:        overrides.label        ?? 'Test Adımı',
    description:  overrides.description  ?? 'Test açıklaması.',
    status:       overrides.status       ?? 'pending',
    is_blocking:  overrides.is_blocking  ?? true,
    is_auto:      overrides.is_auto      ?? true,
    detail:       overrides.detail,
    action_label: overrides.action_label,
    action_href:  overrides.action_href,
  }
}

/** Build the 5 mandatory steps all passing */
function allMandatorySteps(statusOverride?: Partial<Record<string, StepStatus>>): WizardStep[] {
  const ids = [
    'sales_all_invoiced',
    'expenses_all_entered',
    'trial_balance_balanced',
    'journal_entries_paired',
    'partner_compensation_recorded',
  ]
  return ids.map(id =>
    makeStep({ id, status: statusOverride?.[id] ?? 'pass', is_blocking: true }),
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// allMandatoryPass
// ═══════════════════════════════════════════════════════════════════════════════

describe('allMandatoryPass', () => {

  it('returns true when all 5 mandatory steps have status=pass', () => {
    expect(allMandatoryPass(allMandatorySteps())).toBe(true)
  })

  it('returns false when sales_all_invoiced is fail', () => {
    expect(allMandatoryPass(allMandatorySteps({ sales_all_invoiced: 'fail' }))).toBe(false)
  })

  it('returns false when expenses_all_entered is fail', () => {
    expect(allMandatoryPass(allMandatorySteps({ expenses_all_entered: 'fail' }))).toBe(false)
  })

  it('returns false when trial_balance_balanced is fail', () => {
    expect(allMandatoryPass(allMandatorySteps({ trial_balance_balanced: 'fail' }))).toBe(false)
  })

  it('returns false when journal_entries_paired is fail', () => {
    expect(allMandatoryPass(allMandatorySteps({ journal_entries_paired: 'fail' }))).toBe(false)
  })

  it('returns false when partner_compensation_recorded is fail', () => {
    expect(allMandatoryPass(allMandatorySteps({ partner_compensation_recorded: 'fail' }))).toBe(false)
  })

  it('returns false when a mandatory step is pending', () => {
    expect(allMandatoryPass(allMandatorySteps({ sales_all_invoiced: 'pending' }))).toBe(false)
  })

  it('returns false when a mandatory step is skipped', () => {
    expect(allMandatoryPass(allMandatorySteps({ trial_balance_balanced: 'skipped' }))).toBe(false)
  })

  it('returns false when a mandatory step is manual', () => {
    expect(allMandatoryPass(allMandatorySteps({ journal_entries_paired: 'manual' }))).toBe(false)
  })

  it('returns false for empty step array (mandatory steps not present)', () => {
    expect(allMandatoryPass([])).toBe(false)
  })

  it('returns false when some mandatory steps are missing from the array', () => {
    const partial = [makeStep({ id: 'sales_all_invoiced', status: 'pass' })]
    expect(allMandatoryPass(partial)).toBe(false)
  })

  it('ignores non-mandatory step statuses — only mandatory IDs matter', () => {
    const steps = [
      ...allMandatorySteps(),
      makeStep({ id: 'bank_recon_complete', status: 'fail', is_blocking: true }),
    ]
    expect(allMandatoryPass(steps)).toBe(true)
  })

  it('returns false when all 5 mandatory steps are fail', () => {
    const steps = allMandatorySteps({
      sales_all_invoiced:            'fail',
      expenses_all_entered:          'fail',
      trial_balance_balanced:        'fail',
      journal_entries_paired:        'fail',
      partner_compensation_recorded: 'fail',
    })
    expect(allMandatoryPass(steps)).toBe(false)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// getBlockerMessage
// ═══════════════════════════════════════════════════════════════════════════════

describe('getBlockerMessage', () => {

  it('returns null when there are no steps', () => {
    expect(getBlockerMessage([])).toBeNull()
  })

  it('returns null when all blocking steps pass', () => {
    const steps = [
      makeStep({ id: 'a', status: 'pass', is_blocking: true }),
      makeStep({ id: 'b', status: 'pass', is_blocking: true }),
    ]
    expect(getBlockerMessage(steps)).toBeNull()
  })

  it('returns null when non-blocking steps fail', () => {
    const steps = [
      makeStep({ id: 'a', status: 'fail', is_blocking: false }),
      makeStep({ id: 'b', status: 'pending', is_blocking: false }),
    ]
    expect(getBlockerMessage(steps)).toBeNull()
  })

  it('returns null when all steps are skipped or manual', () => {
    const steps = [
      makeStep({ id: 'a', status: 'skipped', is_blocking: true }),
      makeStep({ id: 'b', status: 'manual',  is_blocking: false }),
    ]
    expect(getBlockerMessage(steps)).toBeNull()
  })

  it('returns a Turkish message when one blocking step is fail', () => {
    const steps = [
      makeStep({ id: 'a', label: 'Mizan dengesi', status: 'fail', is_blocking: true }),
    ]
    const msg = getBlockerMessage(steps)
    expect(msg).not.toBeNull()
    expect(msg).toContain('1 adım tamamlanmadan dönem kapatılamaz')
    expect(msg).toContain('Mizan dengesi')
  })

  it('returns a Turkish message when one blocking step is pending', () => {
    const steps = [
      makeStep({ id: 'a', label: 'KDV hesaplandı', status: 'pending', is_blocking: true }),
    ]
    const msg = getBlockerMessage(steps)
    expect(msg).not.toBeNull()
    expect(msg).toContain('1 adım')
    expect(msg).toContain('KDV hesaplandı')
  })

  it('counts correctly with multiple blocking failures', () => {
    const steps = [
      makeStep({ id: 'a', label: 'Adım A', status: 'fail',    is_blocking: true }),
      makeStep({ id: 'b', label: 'Adım B', status: 'pending', is_blocking: true }),
      makeStep({ id: 'c', label: 'Adım C', status: 'pass',    is_blocking: true }),
    ]
    const msg = getBlockerMessage(steps)
    expect(msg).toContain('2 adım')
    expect(msg).toContain('Adım A')
    expect(msg).toContain('Adım B')
    expect(msg).not.toContain('Adım C')
  })

  it('message format includes colon separator before step names', () => {
    const steps = [makeStep({ id: 'x', label: 'Test Adımı', status: 'fail', is_blocking: true })]
    const msg = getBlockerMessage(steps)!
    expect(msg).toMatch(/\d+ adım tamamlanmadan dönem kapatılamaz: .+/)
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// countByStatus
// ═══════════════════════════════════════════════════════════════════════════════

describe('countByStatus', () => {

  it('returns all-zero counts for empty array', () => {
    const counts = countByStatus([])
    expect(counts.pass).toBe(0)
    expect(counts.fail).toBe(0)
    expect(counts.pending).toBe(0)
    expect(counts.manual).toBe(0)
    expect(counts.skipped).toBe(0)
  })

  it('counts a single pass step correctly', () => {
    const counts = countByStatus([makeStep({ status: 'pass' })])
    expect(counts.pass).toBe(1)
    expect(counts.fail).toBe(0)
  })

  it('counts mixed statuses correctly', () => {
    const steps = [
      makeStep({ status: 'pass' }),
      makeStep({ status: 'pass' }),
      makeStep({ status: 'fail' }),
      makeStep({ status: 'pending' }),
      makeStep({ status: 'manual' }),
      makeStep({ status: 'skipped' }),
    ]
    const counts = countByStatus(steps)
    expect(counts.pass).toBe(2)
    expect(counts.fail).toBe(1)
    expect(counts.pending).toBe(1)
    expect(counts.manual).toBe(1)
    expect(counts.skipped).toBe(1)
  })

  it('counts multiple fail steps correctly', () => {
    const steps = [
      makeStep({ status: 'fail' }),
      makeStep({ status: 'fail' }),
      makeStep({ status: 'fail' }),
    ]
    const counts = countByStatus(steps)
    expect(counts.fail).toBe(3)
    expect(counts.pass).toBe(0)
  })

  it('counts multiple skipped steps correctly', () => {
    const steps = Array.from({ length: 4 }, () => makeStep({ status: 'skipped' }))
    const counts = countByStatus(steps)
    expect(counts.skipped).toBe(4)
  })

  it('sum of all counts equals total number of steps', () => {
    const steps = [
      makeStep({ status: 'pass' }),
      makeStep({ status: 'fail' }),
      makeStep({ status: 'pending' }),
      makeStep({ status: 'manual' }),
      makeStep({ status: 'skipped' }),
    ]
    const counts = countByStatus(steps)
    const total = counts.pass + counts.fail + counts.pending + counts.manual + counts.skipped
    expect(total).toBe(steps.length)
  })

  it('returns all 5 keys even when some are zero', () => {
    const counts = countByStatus([makeStep({ status: 'pass' })])
    expect(Object.keys(counts).sort()).toEqual(['fail', 'manual', 'pass', 'pending', 'skipped'])
  })

})

// ═══════════════════════════════════════════════════════════════════════════════
// estimateMinutesToClose
// ═══════════════════════════════════════════════════════════════════════════════

describe('estimateMinutesToClose', () => {

  it('returns 0 for empty step array', () => {
    expect(estimateMinutesToClose([])).toBe(0)
  })

  it('returns 0 when all steps are pass', () => {
    const steps = [
      makeStep({ status: 'pass' }),
      makeStep({ status: 'pass' }),
    ]
    expect(estimateMinutesToClose(steps)).toBe(0)
  })

  it('returns 0 when all steps are skipped', () => {
    const steps = [makeStep({ status: 'skipped' }), makeStep({ status: 'skipped' })]
    expect(estimateMinutesToClose(steps)).toBe(0)
  })

  it('returns 0 when all steps are manual', () => {
    const steps = [makeStep({ status: 'manual' }), makeStep({ status: 'manual' })]
    expect(estimateMinutesToClose(steps)).toBe(0)
  })

  it('returns 5 for a single fail step', () => {
    expect(estimateMinutesToClose([makeStep({ status: 'fail' })])).toBe(5)
  })

  it('returns 5 for a single pending step', () => {
    expect(estimateMinutesToClose([makeStep({ status: 'pending' })])).toBe(5)
  })

  it('returns 10 for two fail steps', () => {
    const steps = [makeStep({ status: 'fail' }), makeStep({ status: 'fail' })]
    expect(estimateMinutesToClose(steps)).toBe(10)
  })

  it('returns 15 for three pending steps', () => {
    const steps = Array.from({ length: 3 }, () => makeStep({ status: 'pending' }))
    expect(estimateMinutesToClose(steps)).toBe(15)
  })

  it('returns 10 for 1 fail + 1 pending', () => {
    const steps = [makeStep({ status: 'fail' }), makeStep({ status: 'pending' })]
    expect(estimateMinutesToClose(steps)).toBe(10)
  })

  it('ignores pass, manual, skipped statuses in calculation', () => {
    const steps = [
      makeStep({ status: 'fail' }),
      makeStep({ status: 'pass' }),
      makeStep({ status: 'manual' }),
      makeStep({ status: 'skipped' }),
      makeStep({ status: 'pending' }),
    ]
    // Only fail (1) + pending (1) = 2 × 5 = 10
    expect(estimateMinutesToClose(steps)).toBe(10)
  })

  it('returns 0 for all-done wizard (pass mix)', () => {
    const steps = allMandatorySteps()
    expect(estimateMinutesToClose(steps)).toBe(0)
  })

  it('scales linearly: 12 fail steps = 60 minutes', () => {
    const steps = Array.from({ length: 12 }, () => makeStep({ status: 'fail' }))
    expect(estimateMinutesToClose(steps)).toBe(60)
  })

})
