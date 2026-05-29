/**
 * Faz 9-C: GL Cutover Validation Suite
 *
 * Production validation tests for the GL cutover preparation package.
 * All tests are pure — no DB, no Supabase, no HTTP.
 *
 * Covers:
 *   - computeShadowAudit()     (lib/admin/gl-shadow-audit.ts)
 *   - computeCutoverReadiness() (lib/admin/gl-cutover-readiness.ts)
 *   - computeRollbackAssessment() (lib/admin/gl-rollback.ts)
 *   - computeDivergence()       (lib/admin/gl-divergence.ts)  [existing — regression]
 *   - computeBackfillStatus()   (lib/admin/journal-backfill.ts) [existing — regression]
 *
 * Run with: npx vitest run tests/gl-cutover-validation.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeShadowAudit,
  SHADOW_AUDIT_THRESHOLDS,
} from '../lib/admin/gl-shadow-audit'
import type {
  OperationalSummary,
  GLSummary,
  GLBalanceSheetSummary,
  OperationalBalanceSheetSummary,
} from '../lib/admin/gl-shadow-audit'
import {
  computeCutoverReadiness,
} from '../lib/admin/gl-cutover-readiness'
import type {
  TrialBalanceSummary,
} from '../lib/admin/gl-cutover-readiness'
import {
  computeRollbackAssessment,
  isForwardProgression,
  isRollback,
  modeLabel,
} from '../lib/admin/gl-rollback'
import { computeDivergence }     from '../lib/admin/gl-divergence'
import { computeBackfillStatus } from '../lib/admin/journal-backfill'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const COMPANY_ID = 'co-test-001'

const CLEAN_OP: OperationalSummary = {
  revenue_try:                 1_000_000,
  cost_try:                      400_000,
  gross_profit_try:              600_000,
  deductible_expenses_try:       150_000,
  non_deductible_expenses_try:    50_000,
  sales_vat_try:                 200_000,
  purchase_vat_try:               40_000,
  expense_vat_try:                30_000,
  net_vat_try:                   130_000,
  matrah_try:                    450_000,
  corporate_tax_try:             112_500,
  net_after_tax_try:             337_500,
}

const CLEAN_GL: GLSummary = {
  gross_revenue_try:   1_000_000,
  cogs_try:              400_000,
  gross_profit_try:      600_000,
  total_opex_try:        200_000,  // deductible + non-deductible
  ebt_try:               400_000,
  net_income_try:        337_500,
}

const CLEAN_GLBS: GLBalanceSheetSummary = {
  cash_try:              300_000,
  trade_receivables_try: 500_000,
  inventory_try:         200_000,
  deductible_vat_try:     30_000,
  output_vat_try:        200_000,
  trade_payables_try:    100_000,
  is_balanced:           true,
  imbalance_try:         0,
}

const CLEAN_OPBS: OperationalBalanceSheetSummary = {
  trade_receivables_try: 500_000,
  inventory_try:         200_000,
  total_assets_try:    1_030_000,
  total_liabilities_try: 300_000,
  total_equity_try:      730_000,
  is_balanced:           true,
}

const CLEAN_TB: TrialBalanceSummary = {
  is_balanced:      true,
  imbalance_try:    0,
  can_close_period: true,
  total_debit_try:  2_000_000,
  total_credit_try: 2_000_000,
}

const CLEAN_GLBS_INTEGRITY = { is_balanced: true,  imbalance_try: 0 }

const ZERO_DIVERGENCE = {
  sales:     { total: 100, with_entries: 100, missing: 0, missing_amount_try: 0 },
  expenses:  { total:  50, with_entries:  50, missing: 0, missing_amount_try: 0 },
  purchases: { total:  20, with_entries:  20, missing: 0, missing_amount_try: 0 },
}

const ZERO_BACKFILL = {
  backfill_complete: true,
  missing: { sales: 0, expenses: 0, purchases: 0 },
  total_missing: 0,
}

// ══════════════════════════════════════════════════════════════════════════════
// computeShadowAudit
// ══════════════════════════════════════════════════════════════════════════════

describe('computeShadowAudit', () => {
  it('returns ok severity when operational and GL match exactly', () => {
    const result = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
    expect(result.overall_severity).toBe('ok')
    expect(result.counts.critical).toBe(0)
    expect(result.counts.warn).toBe(0)
    expect(result.max_delta_pct).toBeCloseTo(0, 1)
  })

  it('produces a delta entry for each compared field', () => {
    const result = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
    // 9 fields: revenue, cogs, gross_profit, total_opex, net_income,
    //           output_vat, input_vat_ded, trade_receivables, inventory
    expect(result.deltas.length).toBe(9)
    const fields = result.deltas.map(d => d.field)
    expect(fields).toContain('revenue')
    expect(fields).toContain('cogs')
    expect(fields).toContain('net_income')
    expect(fields).toContain('output_vat')
    expect(fields).toContain('trade_receivables')
    expect(fields).toContain('inventory')
  })

  it('returns warn severity when a field diverges between 1% and 5%', () => {
    const degradedGL: GLSummary = {
      ...CLEAN_GL,
      gross_revenue_try: 980_000, // 2% divergence from 1_000_000
    }
    const result = computeShadowAudit(CLEAN_OP, degradedGL, CLEAN_GLBS, CLEAN_OPBS)
    const revenueDelta = result.deltas.find(d => d.field === 'revenue')!
    expect(revenueDelta.severity).toBe('warn')
    expect(result.overall_severity).toBe('warn')
    expect(result.counts.warn).toBeGreaterThanOrEqual(1)
  })

  it('returns critical severity when a field diverges more than 5%', () => {
    const degradedGL: GLSummary = {
      ...CLEAN_GL,
      gross_revenue_try: 900_000, // 10% divergence
    }
    const result = computeShadowAudit(CLEAN_OP, degradedGL, CLEAN_GLBS, CLEAN_OPBS)
    const revenueDelta = result.deltas.find(d => d.field === 'revenue')!
    expect(revenueDelta.severity).toBe('critical')
    expect(result.overall_severity).toBe('critical')
    expect(result.counts.critical).toBeGreaterThanOrEqual(1)
  })

  it('returns ok for tiny absolute differences (< 1 TRY epsilon)', () => {
    const tinyDeltaGL: GLSummary = {
      ...CLEAN_GL,
      gross_revenue_try: 1_000_000.005, // 0.005 TRY delta — within epsilon
    }
    const result = computeShadowAudit(CLEAN_OP, tinyDeltaGL, CLEAN_GLBS, CLEAN_OPBS)
    const revenueDelta = result.deltas.find(d => d.field === 'revenue')!
    expect(revenueDelta.severity).toBe('ok')
  })

  it('delta_try = operational - GL (positive means operational > GL)', () => {
    const gl: GLSummary = { ...CLEAN_GL, gross_revenue_try: 950_000 }
    const result = computeShadowAudit(CLEAN_OP, gl, CLEAN_GLBS, CLEAN_OPBS)
    const rev = result.deltas.find(d => d.field === 'revenue')!
    expect(rev.operational_try).toBe(1_000_000)
    expect(rev.gl_try).toBe(950_000)
    expect(rev.delta_try).toBe(50_000)
    expect(rev.delta_pct).toBeGreaterThan(0)
  })

  it('includes audited_at timestamp and summary string', () => {
    const result = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
    expect(result.audited_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(typeof result.summary).toBe('string')
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it('exports threshold constants that match documented values', () => {
    expect(SHADOW_AUDIT_THRESHOLDS.WARN_THRESHOLD_PCT).toBe(1.0)
    expect(SHADOW_AUDIT_THRESHOLDS.CRIT_THRESHOLD_PCT).toBe(5.0)
    expect(SHADOW_AUDIT_THRESHOLDS.ABS_EPSILON_TRY).toBe(1.0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeCutoverReadiness
// ══════════════════════════════════════════════════════════════════════════════

describe('computeCutoverReadiness', () => {
  const cleanAudit = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)

  it('GO when all checks pass', () => {
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE,
      ZERO_BACKFILL,
      CLEAN_TB,
      CLEAN_GLBS_INTEGRITY,
      cleanAudit,
    )
    expect(report.decision).toBe('GO')
    expect(report.blocking_count).toBe(0)
    expect(report.checks.every(c => c.status !== 'fail')).toBe(true)
  })

  it('NO_GO when backfill is incomplete (blocking)', () => {
    const incompleteDivergence = {
      ...ZERO_DIVERGENCE,
      sales: { total: 100, with_entries: 90, missing: 10, missing_amount_try: 150_000 },
    }
    const incompleteBackfill = {
      backfill_complete: false,
      missing: { sales: 10, expenses: 0, purchases: 0 },
      total_missing: 10,
    }
    const report = computeCutoverReadiness(
      incompleteDivergence,
      incompleteBackfill,
      CLEAN_TB,
      CLEAN_GLBS_INTEGRITY,
      cleanAudit,
    )
    expect(report.decision).toBe('NO_GO')
    expect(report.blocking_count).toBeGreaterThanOrEqual(1)
    const backfillCheck = report.checks.find(c => c.id === 'backfill_complete')!
    expect(backfillCheck.status).toBe('fail')
    expect(backfillCheck.blocking).toBe(true)
  })

  it('NO_GO when trial balance is not balanced (blocking)', () => {
    const imbalancedTB: TrialBalanceSummary = {
      ...CLEAN_TB,
      is_balanced:  false,
      imbalance_try: 500,
    }
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, imbalancedTB, CLEAN_GLBS_INTEGRITY, cleanAudit,
    )
    expect(report.decision).toBe('NO_GO')
    const tbCheck = report.checks.find(c => c.id === 'trial_balance_balanced')!
    expect(tbCheck.status).toBe('fail')
  })

  it('NO_GO when balance sheet equation does not hold (blocking)', () => {
    const imbalancedBS = { is_balanced: false, imbalance_try: 1_200 }
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, CLEAN_TB, imbalancedBS, cleanAudit,
    )
    expect(report.decision).toBe('NO_GO')
    const bsCheck = report.checks.find(c => c.id === 'balance_sheet_equation')!
    expect(bsCheck.status).toBe('fail')
  })

  it('NO_GO when shadow audit has critical divergence (blocking)', () => {
    const criticalAudit = computeShadowAudit(
      CLEAN_OP,
      { ...CLEAN_GL, gross_revenue_try: 500_000 },  // 50% divergence
      CLEAN_GLBS,
      CLEAN_OPBS,
    )
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, CLEAN_TB, CLEAN_GLBS_INTEGRITY, criticalAudit,
    )
    expect(report.decision).toBe('NO_GO')
    const auditCheck = report.checks.find(c => c.id === 'shadow_audit_no_critical')!
    expect(auditCheck.status).toBe('fail')
  })

  it('NO_GO when GL has no activity (blocking)', () => {
    const emptyTB: TrialBalanceSummary = {
      ...CLEAN_TB,
      total_debit_try:  0,
      total_credit_try: 0,
    }
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, emptyTB, CLEAN_GLBS_INTEGRITY, cleanAudit,
    )
    expect(report.decision).toBe('NO_GO')
    const activityCheck = report.checks.find(c => c.id === 'gl_has_activity')!
    expect(activityCheck.status).toBe('fail')
  })

  it('GO_WITH_WARNINGS when only non-blocking warnings exist', () => {
    const warnAudit = computeShadowAudit(
      CLEAN_OP,
      { ...CLEAN_GL, gross_revenue_try: 980_000 }, // 2% divergence → warn, not critical
      CLEAN_GLBS,
      CLEAN_OPBS,
    )
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, CLEAN_TB, CLEAN_GLBS_INTEGRITY, warnAudit,
    )
    // shadow_audit_no_warnings check → warn (non-blocking)
    expect(report.decision).not.toBe('NO_GO')
    // blocking checks all pass
    expect(report.blocking_count).toBe(0)
  })

  it('provides non-empty next_steps for every decision', () => {
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, CLEAN_TB, CLEAN_GLBS_INTEGRITY, cleanAudit,
    )
    expect(report.next_steps.length).toBeGreaterThan(0)
  })

  it('computed_at is a valid ISO timestamp', () => {
    const report = computeCutoverReadiness(
      ZERO_DIVERGENCE, ZERO_BACKFILL, CLEAN_TB, CLEAN_GLBS_INTEGRITY, cleanAudit,
    )
    expect(report.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeRollbackAssessment
// ══════════════════════════════════════════════════════════════════════════════

describe('computeRollbackAssessment', () => {
  it('no-op when fromMode === toMode', () => {
    const r = computeRollbackAssessment('shadow', 'shadow', 0, COMPANY_ID)
    expect(r.risk).toBe('none')
    expect(r.sql_commands.length).toBe(0)
  })

  it('returns is_reversible=true for all rollback scenarios', () => {
    expect(computeRollbackAssessment('parallel',   'shadow',   0, COMPANY_ID).is_reversible).toBe(true)
    expect(computeRollbackAssessment('gl_primary', 'parallel', 0, COMPANY_ID).is_reversible).toBe(true)
    expect(computeRollbackAssessment('gl_primary', 'shadow',   0, COMPANY_ID).is_reversible).toBe(true)
  })

  it('parallel → shadow with no entries: low risk', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 0, COMPANY_ID)
    expect(r.risk).toBe('low')
    expect(r.journal_entries_at_risk).toBe(0)
    expect(r.sql_commands.some(s => s.includes('shadow'))).toBe(true)
  })

  it('parallel → shadow with entries: medium risk', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 500, COMPANY_ID)
    expect(r.risk).toBe('medium')
    expect(r.journal_entries_at_risk).toBe(500)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('gl_primary → parallel: high risk when entries exist', () => {
    const r = computeRollbackAssessment('gl_primary', 'parallel', 200, COMPANY_ID)
    expect(r.risk).toBe('high')
    expect(r.instructions.length).toBeGreaterThan(0)
  })

  it('gl_primary → shadow: critical risk always', () => {
    const r = computeRollbackAssessment('gl_primary', 'shadow', 0, COMPANY_ID)
    expect(r.risk).toBe('critical')
    // Must warn about engineering sign-off
    expect(r.warnings.some(w => w.toLowerCase().includes('critical') || w.includes('CRITICAL'))).toBe(true)
  })

  it('forward progression returns no-op (not a rollback)', () => {
    const r = computeRollbackAssessment('shadow', 'parallel', 0, COMPANY_ID)
    expect(r.risk).toBe('none')
    expect(r.sql_commands.length).toBe(0)
  })

  it('includes company_id in SQL commands', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 0, COMPANY_ID)
    expect(r.sql_commands.some(s => s.includes(COMPANY_ID))).toBe(true)
  })

  describe('isForwardProgression', () => {
    it('shadow → parallel: true', ()   => expect(isForwardProgression('shadow',     'parallel')).toBe(true))
    it('parallel → gl_primary: true', () => expect(isForwardProgression('parallel', 'gl_primary')).toBe(true))
    it('shadow → gl_primary: true', ()  => expect(isForwardProgression('shadow',    'gl_primary')).toBe(true))
    it('parallel → shadow: false', ()   => expect(isForwardProgression('parallel',  'shadow')).toBe(false))
    it('same mode: false', ()           => expect(isForwardProgression('shadow',     'shadow')).toBe(false))
  })

  describe('isRollback', () => {
    it('gl_primary → shadow: true',   () => expect(isRollback('gl_primary', 'shadow')).toBe(true))
    it('parallel → shadow: true',     () => expect(isRollback('parallel',   'shadow')).toBe(true))
    it('shadow → parallel: false',    () => expect(isRollback('shadow',     'parallel')).toBe(false))
    it('same mode: false',            () => expect(isRollback('shadow',     'shadow')).toBe(false))
  })

  describe('modeLabel', () => {
    it('returns descriptive label for each mode', () => {
      expect(modeLabel('shadow').toLowerCase()).toContain('shadow')
      expect(modeLabel('parallel').toLowerCase()).toContain('parallel')
      expect(modeLabel('gl_primary').toLowerCase()).toContain('primary')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeDivergence — regression guard (existing function)
// ══════════════════════════════════════════════════════════════════════════════

describe('computeDivergence (regression)', () => {
  it('zero missing when all operational records have journal entries', () => {
    const operational = {
      sales:     [{ id: 's1', amount_try: 100 }, { id: 's2', amount_try: 200 }],
      expenses:  [{ id: 'e1', amount_try:  50 }],
      purchases: [{ id: 'p1', amount_try: 300 }],
    }
    const journaled = [
      { source_type: 'sale',     source_id: 's1' },
      { source_type: 'sale',     source_id: 's2' },
      { source_type: 'expense',  source_id: 'e1' },
      { source_type: 'purchase', source_id: 'p1' },
    ]
    const result = computeDivergence(operational, journaled)
    expect(result.sales.missing).toBe(0)
    expect(result.expenses.missing).toBe(0)
    expect(result.purchases.missing).toBe(0)
  })

  it('correctly identifies missing journal entries and sums amounts', () => {
    const operational = {
      sales:     [{ id: 's1', amount_try: 100 }, { id: 's2', amount_try: 200 }],
      expenses:  [{ id: 'e1', amount_try:  50 }],
      purchases: [],
    }
    const journaled = [
      { source_type: 'sale', source_id: 's1' }, // s2 is missing
    ]
    const result = computeDivergence(operational, journaled)
    expect(result.sales.missing).toBe(1)
    expect(result.sales.missing_amount_try).toBe(200)
    expect(result.expenses.missing).toBe(1)
    expect(result.expenses.missing_amount_try).toBe(50)
    expect(result.purchases.missing).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computeBackfillStatus — regression guard (existing function)
// ══════════════════════════════════════════════════════════════════════════════

describe('computeBackfillStatus (regression)', () => {
  it('backfill_complete when all counts match', () => {
    const status = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 20 },
      { sales: 100, expenses: 50, purchases: 20 },
    )
    expect(status.backfill_complete).toBe(true)
    expect(status.total_missing).toBe(0)
  })

  it('backfill incomplete when some counts differ', () => {
    const status = computeBackfillStatus(
      { sales: 100, expenses: 50, purchases: 20 },
      { sales:  90, expenses: 50, purchases: 18 },
    )
    expect(status.backfill_complete).toBe(false)
    expect(status.missing.sales).toBe(10)
    expect(status.missing.purchases).toBe(2)
    expect(status.total_missing).toBe(12)
  })

  it('never returns negative missing counts (journaled > operational is clamped to 0)', () => {
    const status = computeBackfillStatus(
      { sales: 10, expenses: 5, purchases: 0 },
      { sales: 15, expenses: 5, purchases: 0 }, // journaled > operational
    )
    expect(status.missing.sales).toBe(0)
    expect(status.backfill_complete).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// End-to-end cutover scenario
// ══════════════════════════════════════════════════════════════════════════════

describe('full cutover pipeline scenario', () => {
  it('demonstrates NO_GO → GO flow after backfill', () => {
    // Before backfill: 15 sales missing
    const beforeAudit = computeShadowAudit(
      CLEAN_OP,
      { ...CLEAN_GL, gross_revenue_try: 850_000 },  // critical divergence from missing entries
      CLEAN_GLBS,
      CLEAN_OPBS,
    )
    const beforeReadiness = computeCutoverReadiness(
      { ...ZERO_DIVERGENCE, sales: { total: 100, with_entries: 85, missing: 15, missing_amount_try: 150_000 } },
      { backfill_complete: false, missing: { sales: 15, expenses: 0, purchases: 0 }, total_missing: 15 },
      CLEAN_TB,
      CLEAN_GLBS_INTEGRITY,
      beforeAudit,
    )
    expect(beforeReadiness.decision).toBe('NO_GO')

    // After backfill: GL matches operational exactly
    const afterAudit = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
    const afterReadiness = computeCutoverReadiness(
      ZERO_DIVERGENCE,
      ZERO_BACKFILL,
      CLEAN_TB,
      CLEAN_GLBS_INTEGRITY,
      afterAudit,
    )
    expect(afterReadiness.decision).toBe('GO')

    // Rollback assessment if needed
    const rollback = computeRollbackAssessment('parallel', 'shadow', 850, COMPANY_ID)
    expect(rollback.risk).toBe('medium')
    expect(rollback.is_reversible).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isForwardProgression — all valid transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('isForwardProgression', () => {
  it('shadow → parallel is forward', () => {
    expect(isForwardProgression('shadow', 'parallel')).toBe(true)
  })

  it('parallel → gl_primary is forward', () => {
    expect(isForwardProgression('parallel', 'gl_primary')).toBe(true)
  })

  it('shadow → gl_primary is forward (skip)', () => {
    expect(isForwardProgression('shadow', 'gl_primary')).toBe(true)
  })

  it('shadow → shadow is NOT forward (same level)', () => {
    expect(isForwardProgression('shadow', 'shadow')).toBe(false)
  })

  it('parallel → parallel is NOT forward', () => {
    expect(isForwardProgression('parallel', 'parallel')).toBe(false)
  })

  it('gl_primary → parallel is NOT forward (rollback)', () => {
    expect(isForwardProgression('gl_primary', 'parallel')).toBe(false)
  })

  it('gl_primary → shadow is NOT forward (rollback)', () => {
    expect(isForwardProgression('gl_primary', 'shadow')).toBe(false)
  })

  it('parallel → shadow is NOT forward (rollback)', () => {
    expect(isForwardProgression('parallel', 'shadow')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// isRollback — reverse transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('isRollback', () => {
  it('parallel → shadow is rollback', () => {
    expect(isRollback('parallel', 'shadow')).toBe(true)
  })

  it('gl_primary → parallel is rollback', () => {
    expect(isRollback('gl_primary', 'parallel')).toBe(true)
  })

  it('gl_primary → shadow is rollback', () => {
    expect(isRollback('gl_primary', 'shadow')).toBe(true)
  })

  it('shadow → parallel is NOT rollback (forward)', () => {
    expect(isRollback('shadow', 'parallel')).toBe(false)
  })

  it('shadow → gl_primary is NOT rollback (forward)', () => {
    expect(isRollback('shadow', 'gl_primary')).toBe(false)
  })

  it('shadow → shadow is NOT rollback (same level)', () => {
    expect(isRollback('shadow', 'shadow')).toBe(false)
  })

  it('gl_primary → gl_primary is NOT rollback (same level)', () => {
    expect(isRollback('gl_primary', 'gl_primary')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// modeLabel — returns non-empty string for each mode
// ─────────────────────────────────────────────────────────────────────────────

describe('modeLabel', () => {
  it('returns non-empty string for "shadow"', () => {
    const label = modeLabel('shadow')
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
    expect(label).toContain('Shadow')
  })

  it('returns non-empty string for "parallel"', () => {
    const label = modeLabel('parallel')
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
    expect(label).toContain('Parallel')
  })

  it('returns non-empty string for "gl_primary"', () => {
    const label = modeLabel('gl_primary')
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
    expect(label).toContain('GL Primary')
  })

  it('each mode returns a distinct label', () => {
    const labels = new Set([modeLabel('shadow'), modeLabel('parallel'), modeLabel('gl_primary')])
    expect(labels.size).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SHADOW_AUDIT_THRESHOLDS — expected keys
// ─────────────────────────────────────────────────────────────────────────────

describe('SHADOW_AUDIT_THRESHOLDS', () => {
  it('has WARN_THRESHOLD_PCT key', () => {
    expect(SHADOW_AUDIT_THRESHOLDS).toHaveProperty('WARN_THRESHOLD_PCT')
  })

  it('has CRIT_THRESHOLD_PCT key', () => {
    expect(SHADOW_AUDIT_THRESHOLDS).toHaveProperty('CRIT_THRESHOLD_PCT')
  })

  it('has ABS_EPSILON_TRY key', () => {
    expect(SHADOW_AUDIT_THRESHOLDS).toHaveProperty('ABS_EPSILON_TRY')
  })

  it('WARN_THRESHOLD_PCT < CRIT_THRESHOLD_PCT', () => {
    expect(SHADOW_AUDIT_THRESHOLDS.WARN_THRESHOLD_PCT).toBeLessThan(SHADOW_AUDIT_THRESHOLDS.CRIT_THRESHOLD_PCT)
  })

  it('all thresholds are positive numbers', () => {
    expect(SHADOW_AUDIT_THRESHOLDS.WARN_THRESHOLD_PCT).toBeGreaterThan(0)
    expect(SHADOW_AUDIT_THRESHOLDS.CRIT_THRESHOLD_PCT).toBeGreaterThan(0)
    expect(SHADOW_AUDIT_THRESHOLDS.ABS_EPSILON_TRY).toBeGreaterThan(0)
  })

  it('WARN_THRESHOLD_PCT is 1.0', () => {
    expect(SHADOW_AUDIT_THRESHOLDS.WARN_THRESHOLD_PCT).toBe(1.0)
  })

  it('CRIT_THRESHOLD_PCT is 5.0', () => {
    expect(SHADOW_AUDIT_THRESHOLDS.CRIT_THRESHOLD_PCT).toBe(5.0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRollbackAssessment — structure validation
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRollbackAssessment — structure validation', () => {
  it('parallel → shadow: result has expected structure', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 100, COMPANY_ID)
    expect(r).toHaveProperty('from_mode')
    expect(r).toHaveProperty('to_mode')
    expect(r).toHaveProperty('risk')
    expect(r).toHaveProperty('is_reversible')
    expect(r).toHaveProperty('journal_entries_at_risk')
    expect(r).toHaveProperty('instructions')
    expect(r).toHaveProperty('warnings')
    expect(r).toHaveProperty('sql_commands')
  })

  it('parallel → shadow with entries: risk = medium', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 1, COMPANY_ID)
    expect(r.risk).toBe('medium')
    expect(r.is_reversible).toBe(true)
  })

  it('parallel → shadow with zero entries: risk = low', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 0, COMPANY_ID)
    expect(r.risk).toBe('low')
  })

  it('gl_primary → parallel with entries: risk = high', () => {
    const r = computeRollbackAssessment('gl_primary', 'parallel', 500, COMPANY_ID)
    expect(r.risk).toBe('high')
    expect(r.is_reversible).toBe(true)
  })

  it('gl_primary → shadow: risk = critical', () => {
    const r = computeRollbackAssessment('gl_primary', 'shadow', 200, COMPANY_ID)
    expect(r.risk).toBe('critical')
    expect(r.is_reversible).toBe(true)
  })

  it('same mode → same mode: risk = none, no-op', () => {
    const r = computeRollbackAssessment('parallel', 'parallel', 100, COMPANY_ID)
    expect(r.risk).toBe('none')
    expect(r.journal_entries_at_risk).toBe(0)
  })

  it('forward progression returns risk = none', () => {
    const r = computeRollbackAssessment('shadow', 'parallel', 0, COMPANY_ID)
    expect(r.risk).toBe('none')
    expect(r.from_mode).toBe('shadow')
    expect(r.to_mode).toBe('parallel')
  })

  it('sql_commands array contains companyId for real rollbacks', () => {
    const r = computeRollbackAssessment('parallel', 'shadow', 100, COMPANY_ID)
    const sqlJoined = r.sql_commands.join('\n')
    expect(sqlJoined).toContain(COMPANY_ID)
  })

  it('instructions array is non-empty for all rollback scenarios', () => {
    const scenarios: Array<[import('../lib/admin/gl-rollback').GlMode, import('../lib/admin/gl-rollback').GlMode]> = [
      ['parallel', 'shadow'],
      ['gl_primary', 'parallel'],
      ['gl_primary', 'shadow'],
    ]
    for (const [from, to] of scenarios) {
      const r = computeRollbackAssessment(from, to, 0, COMPANY_ID)
      expect(r.instructions.length).toBeGreaterThan(0)
    }
  })
})
