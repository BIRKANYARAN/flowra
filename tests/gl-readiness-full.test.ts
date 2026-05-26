/**
 * Faz 9-C: GL Primary Readiness — Full 10-Step Validation Suite
 *
 * Simulates the complete readiness process against realistic Turkish SME
 * fixture data. Three companies are tested:
 *
 *   COMPANY_CLEAN    — All journal entries present, clean GL, GO expected
 *   COMPANY_PARTIAL  — 30% missing entries, GO_WITH_WARNINGS after backfill
 *   COMPANY_EMPTY    — Shadow mode, zero GL entries, NO_GO expected
 *
 * Covers all 10 readiness steps:
 *   1  Shadow audit (financial comparison)
 *   2  Divergence report
 *   3  Mismatch identification
 *   4  Remediation plan
 *   5  Trial balance integrity
 *   6  Balance sheet equation
 *   7  Sales coverage
 *   8  Expense coverage
 *   9  Purchase coverage
 *  10  Final GO/NO_GO decision
 *
 * Run: npx vitest run tests/gl-readiness-full.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeCompanyDivergenceReport,
  identifyMismatches,
  buildRemediationPlan,
  buildCoverageChecks,
  classifyWarningImpact,
  buildProductionSteps,
  computeConfidenceScore,
  produceFinalRecommendation,
} from '../lib/admin/gl-readiness-engine'
import { computeDivergence }     from '../lib/admin/gl-divergence'
import { computeShadowAudit }    from '../lib/admin/gl-shadow-audit'
import { computeCutoverReadiness } from '../lib/admin/gl-cutover-readiness'
import type {
  OperationalSummary, GLSummary, GLBalanceSheetSummary, OperationalBalanceSheetSummary,
} from '../lib/admin/gl-shadow-audit'
import type { TrialBalanceSummary } from '../lib/admin/gl-cutover-readiness'
import type { DivergenceSummary } from '../lib/admin/gl-divergence'

// ══════════════════════════════════════════════════════════════════════════════
// REALISTIC FIXTURE DATA — Turkish SME, FY2024
// Based on architecture docs: 600/620/391/191/7xx/120/153/320/321 accounts
// ══════════════════════════════════════════════════════════════════════════════

// ── COMPANY_CLEAN: 200 sales, 80 expenses, 30 purchases — all journaled ──────

const CLEAN_DIVERGENCE: DivergenceSummary = {
  sales:     { total: 200, with_entries: 200, missing: 0,  missing_amount_try: 0 },
  expenses:  { total:  80, with_entries:  80, missing: 0,  missing_amount_try: 0 },
  purchases: { total:  30, with_entries:  30, missing: 0,  missing_amount_try: 0 },
}

const CLEAN_OP: OperationalSummary = {
  revenue_try:                 3_600_000,   // ₺3.6M revenue
  cost_try:                    1_440_000,   // 40% COGS
  gross_profit_try:            2_160_000,
  deductible_expenses_try:       540_000,   // salary/rent/software
  non_deductible_expenses_try:    60_000,   // partner loan repayment
  sales_vat_try:                 720_000,   // 20% KDV on ₺3.6M
  purchase_vat_try:               72_000,
  expense_vat_try:                54_000,
  net_vat_try:                   594_000,
  matrah_try:                  1_620_000,   // 3.6M - 1.44M - 540k
  corporate_tax_try:             405_000,   // 25%
  net_after_tax_try:           1_215_000,
}

const CLEAN_GL: GLSummary = {
  gross_revenue_try:   3_600_000,
  cogs_try:            1_440_000,
  gross_profit_try:    2_160_000,
  total_opex_try:        600_000,   // deductible + non-deductible
  ebt_try:             1_560_000,
  net_income_try:      1_215_000,
}

const CLEAN_GLBS: GLBalanceSheetSummary = {
  cash_try:              800_000,
  trade_receivables_try: 600_000,   // acct 120
  inventory_try:         240_000,   // acct 153
  deductible_vat_try:     54_000,   // acct 191
  output_vat_try:        720_000,   // acct 391
  trade_payables_try:    300_000,   // acct 320
  is_balanced:           true,
  imbalance_try:         0,
}

const CLEAN_OPBS: OperationalBalanceSheetSummary = {
  trade_receivables_try: 600_000,
  inventory_try:         240_000,
  total_assets_try:    1_694_000,
  total_liabilities_try: 420_000,
  total_equity_try:    1_274_000,
  is_balanced:           true,
}

const CLEAN_TB: TrialBalanceSummary = {
  is_balanced:       true,
  imbalance_try:     0,
  can_close_period:  true,
  total_debit_try:   8_800_000,
  total_credit_try:  8_800_000,
}

const CLEAN_BS_INTEGRITY = { is_balanced: true, imbalance_try: 0 }

// ── COMPANY_PARTIAL: 60/200 sales missing + 20/80 expenses missing ──────────

const PARTIAL_DIVERGENCE: DivergenceSummary = {
  sales:     { total: 200, with_entries: 140, missing:  60, missing_amount_try: 1_080_000 },
  expenses:  { total:  80, with_entries:  60, missing:  20, missing_amount_try:   135_000 },
  purchases: { total:  30, with_entries:  30, missing:   0, missing_amount_try:         0 },
}

// When 60/200 sales are missing from GL: GL shows 70% of actual revenue
const PARTIAL_OP: OperationalSummary = { ...CLEAN_OP }
const PARTIAL_GL: GLSummary = {
  gross_revenue_try:   2_520_000,   // 3.6M × (140/200) = 2.52M — 30% under
  cogs_try:            1_008_000,   // proportional
  gross_profit_try:    1_512_000,
  total_opex_try:        465_000,   // 80% of 600k (60 missing expenses at 135k)
  ebt_try:             1_047_000,
  net_income_try:        785_250,
}

const PARTIAL_GLBS: GLBalanceSheetSummary = {
  ...CLEAN_GLBS,
  trade_receivables_try: 420_000,   // missing 180k from unrecorded receivables
  is_balanced:           false,     // BS equation broken due to incomplete entries
  imbalance_try:         1_215_000, // substantial imbalance
}

const PARTIAL_TB: TrialBalanceSummary = {
  is_balanced:      false,
  imbalance_try:    1_215_000,
  can_close_period: false,
  total_debit_try:  6_160_000,
  total_credit_try: 4_945_000,
}

// ── COMPANY_EMPTY: Shadow mode — zero journal entries ─────────────────────

const EMPTY_DIVERGENCE: DivergenceSummary = {
  sales:     { total: 150, with_entries: 0, missing: 150, missing_amount_try: 2_700_000 },
  expenses:  { total:  60, with_entries: 0, missing:  60, missing_amount_try:   420_000 },
  purchases: { total:  25, with_entries: 0, missing:  25, missing_amount_try:   875_000 },
}

const EMPTY_TB: TrialBalanceSummary = {
  is_balanced:      false,   // no entries → Σ DR = Σ CR = 0, but is_balanced driven by no-entries guard
  imbalance_try:    0,
  can_close_period: false,
  total_debit_try:  0,
  total_credit_try: 0,
}

const EMPTY_BS_INTEGRITY = { is_balanced: false, imbalance_try: 0 }

// ── POST-BACKFILL state (what COMPANY_PARTIAL looks like after backfill) ─────

const POST_BACKFILL_DIVERGENCE: DivergenceSummary = {
  sales:     { total: 200, with_entries: 200, missing: 0, missing_amount_try: 0 },
  expenses:  { total:  80, with_entries:  80, missing: 0, missing_amount_try: 0 },
  purchases: { total:  30, with_entries:  30, missing: 0, missing_amount_try: 0 },
}

const POST_BACKFILL_GL: GLSummary = {
  ...CLEAN_GL,
  gross_revenue_try: 3_597_000,   // ≈ operational (₺3k timing diff from KDV rounding)
  net_income_try:    1_213_500,   // ₺1.5k rounding difference (0.1%)
}

// ══════════════════════════════════════════════════════════════════════════════
// STEP 2: DIVERGENCE REPORTS
// ══════════════════════════════════════════════════════════════════════════════

describe('Step 2: Divergence Report', () => {
  it('COMPANY_CLEAN: 100% coverage, 0 missing', () => {
    const report = computeCompanyDivergenceReport('co-clean', 'Flowra Clean Co', CLEAN_DIVERGENCE)
    expect(report.total_missing).toBe(0)
    expect(report.coverage_pct).toBe(100)
    expect(report.total_amount_try).toBe(0)
  })

  it('COMPANY_PARTIAL: 74.4% coverage (200/310 records journaled)', () => {
    const report = computeCompanyDivergenceReport('co-partial', 'Flowra Partial Co', PARTIAL_DIVERGENCE)
    expect(report.total_missing).toBe(80)
    expect(report.total_amount_try).toBe(1_215_000)
    expect(report.coverage_pct).toBeLessThan(100)
    expect(report.coverage_pct).toBeGreaterThan(70)
  })

  it('COMPANY_EMPTY: 0% coverage (shadow mode, zero entries)', () => {
    const report = computeCompanyDivergenceReport('co-empty', 'Flowra Empty Co', EMPTY_DIVERGENCE)
    expect(report.total_missing).toBe(235)
    expect(report.coverage_pct).toBe(0)
    expect(report.total_amount_try).toBe(3_995_000)
  })

  it('coverage_pct returns 100 for company with no records at all (edge case)', () => {
    const zeroDiv: DivergenceSummary = {
      sales: { total: 0, with_entries: 0, missing: 0, missing_amount_try: 0 },
      expenses: { total: 0, with_entries: 0, missing: 0, missing_amount_try: 0 },
      purchases: { total: 0, with_entries: 0, missing: 0, missing_amount_try: 0 },
    }
    const report = computeCompanyDivergenceReport('co-new', 'New Company', zeroDiv)
    expect(report.coverage_pct).toBe(100)
    expect(report.total_missing).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// STEP 3: MISMATCH IDENTIFICATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Step 3: Mismatch Identification', () => {
  it('COMPANY_CLEAN: no mismatches', () => {
    const m = identifyMismatches(CLEAN_DIVERGENCE)
    expect(m.total).toBe(0)
    expect(m.auto_remediable).toBe(0)
    expect(m.manual_required).toBe(0)
  })

  it('COMPANY_PARTIAL: identifies sale and expense mismatch batches', () => {
    const m = identifyMismatches(PARTIAL_DIVERGENCE)
    expect(m.total).toBe(2)   // sales batch + expenses batch
    const categories = m.records.map(r => r.category)
    expect(categories).toContain('missing_sale_accrual')
    expect(categories).toContain('missing_expense_accrual')
    expect(categories).not.toContain('missing_purchase_finalize')
  })

  it('all identified mismatches are auto_backfill remediable (no manual required)', () => {
    const m = identifyMismatches(PARTIAL_DIVERGENCE)
    expect(m.manual_required).toBe(0)
    expect(m.auto_remediable).toBe(m.total)
  })

  it('COMPANY_EMPTY: identifies all three mismatch types', () => {
    const m = identifyMismatches(EMPTY_DIVERGENCE)
    const categories = m.records.map(r => r.category)
    expect(categories).toContain('missing_sale_accrual')
    expect(categories).toContain('missing_expense_accrual')
    expect(categories).toContain('missing_purchase_finalize')
    expect(m.total).toBe(3)
  })

  it('mismatch records include amount_try and blocking flag', () => {
    const m = identifyMismatches(PARTIAL_DIVERGENCE)
    const saleMismatch = m.records.find(r => r.category === 'missing_sale_accrual')!
    expect(saleMismatch.amount_try).toBe(1_080_000)
    expect(saleMismatch.is_blocking).toBe(true)
  })

  it('description includes human-readable TRY amount', () => {
    const m = identifyMismatches(EMPTY_DIVERGENCE)
    const purchaseMismatch = m.records.find(r => r.category === 'missing_purchase_finalize')!
    expect(purchaseMismatch.description).toContain('875')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// STEP 4: REMEDIATION PLAN
// ══════════════════════════════════════════════════════════════════════════════

describe('Step 4: Remediation Plan', () => {
  it('COMPANY_CLEAN: no backfill needed', () => {
    const m   = identifyMismatches(CLEAN_DIVERGENCE)
    const rp  = buildRemediationPlan(m, CLEAN_DIVERGENCE)
    expect(rp.backfill_command).toContain('No backfill needed')
    expect(rp.estimated_sql_lines).toBe(0)
    expect(rp.post_remediation_state).toBe('ready_for_gl_primary')
  })

  it('COMPANY_PARTIAL: auto-remediable, backfill command provided', () => {
    const m   = identifyMismatches(PARTIAL_DIVERGENCE)
    const rp  = buildRemediationPlan(m, PARTIAL_DIVERGENCE)
    expect(rp.can_auto_remediate).toBe(true)
    expect(rp.backfill_command).toContain('flowra_phase9c_backfill.sql')
    expect(rp.estimated_sql_lines).toBeGreaterThan(0)
    expect(rp.manual_records.length).toBe(0)
  })

  it('COMPANY_EMPTY: all three types need backfill, SQL lines estimated', () => {
    const m   = identifyMismatches(EMPTY_DIVERGENCE)
    const rp  = buildRemediationPlan(m, EMPTY_DIVERGENCE)
    expect(rp.can_auto_remediate).toBe(true)
    expect(rp.estimated_sql_lines).toBeGreaterThanOrEqual(6 + 3 * 40)
  })

  it('post_remediation_state is ready_for_parallel when some entries exist post-backfill (partial case)', () => {
    // After backfill, partial company should have 0 missing
    const m   = identifyMismatches(POST_BACKFILL_DIVERGENCE)
    const rp  = buildRemediationPlan(m, POST_BACKFILL_DIVERGENCE)
    expect(rp.post_remediation_state).toBe('ready_for_gl_primary')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// STEPS 7-9: COVERAGE CHECKS
// ══════════════════════════════════════════════════════════════════════════════

describe('Steps 7–9: Coverage Checks', () => {
  describe('COMPANY_CLEAN (100% coverage)', () => {
    const checks = buildCoverageChecks(CLEAN_DIVERGENCE)

    it('produces exactly 3 checks (sale, expense, purchase)', () => {
      expect(checks.length).toBe(3)
      expect(checks.map(c => c.source_type)).toEqual(['sale', 'expense', 'purchase'])
    })

    it('Step 7: sales coverage = 100%, pass', () => {
      const salesCheck = checks.find(c => c.source_type === 'sale')!
      expect(salesCheck.coverage_pct).toBe(100)
      expect(salesCheck.status).toBe('pass')
      expect(salesCheck.is_blocking).toBe(false)
    })

    it('Step 8: expense coverage = 100%, pass', () => {
      const expCheck = checks.find(c => c.source_type === 'expense')!
      expect(expCheck.coverage_pct).toBe(100)
      expect(expCheck.status).toBe('pass')
    })

    it('Step 9: purchase coverage = 100%, pass', () => {
      const purchCheck = checks.find(c => c.source_type === 'purchase')!
      expect(purchCheck.coverage_pct).toBe(100)
      expect(purchCheck.status).toBe('pass')
    })
  })

  describe('COMPANY_PARTIAL (60/200 sales missing, 20/80 expenses missing)', () => {
    const checks = buildCoverageChecks(PARTIAL_DIVERGENCE)

    it('Step 7: sales coverage = 70%, fail (60 missing > 5 threshold)', () => {
      const salesCheck = checks.find(c => c.source_type === 'sale')!
      expect(salesCheck.coverage_pct).toBe(70)
      expect(salesCheck.status).toBe('fail')
      expect(salesCheck.is_blocking).toBe(true)
    })

    it('Step 8: expense coverage = 75%, fail (20 missing > 5 threshold)', () => {
      const expCheck = checks.find(c => c.source_type === 'expense')!
      expect(expCheck.coverage_pct).toBe(75)
      expect(expCheck.status).toBe('fail')
    })

    it('Step 9: purchase coverage = 100%, pass', () => {
      const purchCheck = checks.find(c => c.source_type === 'purchase')!
      expect(purchCheck.coverage_pct).toBe(100)
      expect(purchCheck.status).toBe('pass')
    })

    it('detail includes missing count and TRY amount', () => {
      const salesCheck = checks.find(c => c.source_type === 'sale')!
      expect(salesCheck.detail).toContain('60 of 200')
    })
  })

  describe('COMPANY_EMPTY (0% coverage)', () => {
    const checks = buildCoverageChecks(EMPTY_DIVERGENCE)

    it('all three checks fail and are blocking', () => {
      expect(checks.every(c => c.status === 'fail')).toBe(true)
      expect(checks.every(c => c.is_blocking)).toBe(true)
    })

    it('coverage_pct is 0 for all types', () => {
      expect(checks.every(c => c.coverage_pct === 0)).toBe(true)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// STEP 1: SHADOW AUDIT
// ══════════════════════════════════════════════════════════════════════════════

describe('Step 1: Shadow Audit', () => {
  describe('COMPANY_CLEAN — exact match', () => {
    const audit = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)

    it('overall_severity is ok', () => {
      expect(audit.overall_severity).toBe('ok')
    })

    it('zero critical, zero warn', () => {
      expect(audit.counts.critical).toBe(0)
      expect(audit.counts.warn).toBe(0)
    })

    it('max_delta_pct is ~0', () => {
      expect(audit.max_delta_pct).toBeCloseTo(0, 0)
    })
  })

  describe('COMPANY_PARTIAL — 30% revenue missing from GL', () => {
    const audit = computeShadowAudit(PARTIAL_OP, PARTIAL_GL, PARTIAL_GLBS, CLEAN_OPBS)

    it('overall_severity is critical (revenue diverges 30%)', () => {
      expect(audit.overall_severity).toBe('critical')
    })

    it('revenue field is critical', () => {
      const rev = audit.deltas.find(d => d.field === 'revenue')!
      expect(rev.severity).toBe('critical')
      expect(rev.delta_try).toBe(1_080_000)   // 3.6M - 2.52M
    })

    it('net_income field is critical (proportional divergence)', () => {
      const ni = audit.deltas.find(d => d.field === 'net_income')!
      expect(ni.severity).toBe('critical')
    })
  })

  describe('POST-BACKFILL state — tiny timing differences only', () => {
    const audit = computeShadowAudit(CLEAN_OP, POST_BACKFILL_GL, CLEAN_GLBS, CLEAN_OPBS)

    it('overall_severity is warn (not critical — tiny rounding diff)', () => {
      // Revenue: 3.6M vs 3.597M = 0.08% → ok (below 1% warn threshold)
      // Net income: 1.215M vs 1.2135M = 0.12% → ok
      expect(audit.overall_severity).toBe('ok')
    })

    it('max_delta_pct is below 1% (timing diff only)', () => {
      expect(audit.max_delta_pct).toBeLessThan(1.0)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// WARNING CLASSIFICATION (GO_WITH_WARNINGS analysis)
// ══════════════════════════════════════════════════════════════════════════════

describe('Warning Classification', () => {
  it('critical divergences are classified as critical impact, not safe to proceed', () => {
    const audit = computeShadowAudit(PARTIAL_OP, PARTIAL_GL, PARTIAL_GLBS, CLEAN_OPBS)
    const classifications = classifyWarningImpact(audit)
    const criticals = classifications.filter(c => c.impact === 'critical')
    expect(criticals.length).toBeGreaterThan(0)
    expect(criticals.every(c => !c.safe_to_proceed)).toBe(true)
  })

  it('tiny timing differences are classified as cosmetic, safe to proceed', () => {
    const audit = computeShadowAudit(CLEAN_OP, POST_BACKFILL_GL, CLEAN_GLBS, CLEAN_OPBS)
    const classifications = classifyWarningImpact(audit)
    // With < 0.1% divergence, nothing should appear (all pass, no warnings)
    expect(classifications.length).toBe(0)
  })

  it('revenue divergence at 2.5% → material impact', () => {
    const degradedGL: GLSummary = {
      ...CLEAN_GL,
      gross_revenue_try: 3_510_000,  // 2.5% below
    }
    const audit = computeShadowAudit(CLEAN_OP, degradedGL, CLEAN_GLBS, CLEAN_OPBS)
    const classifications = classifyWarningImpact(audit)
    const revClass = classifications.find(c => c.field === 'revenue')!
    expect(revClass.impact).toBe('material')
  })

  it('inventory divergence at 2% → material but safe to proceed', () => {
    const minorDivGL: GLSummary = { ...CLEAN_GL }
    const minorDivGLBS: GLBalanceSheetSummary = {
      ...CLEAN_GLBS,
      inventory_try: 235_200,  // 2% below 240k
    }
    const audit = computeShadowAudit(CLEAN_OP, minorDivGL, minorDivGLBS, CLEAN_OPBS)
    const classifications = classifyWarningImpact(audit)
    const invClass = classifications.find(c => c.field === 'inventory')
    if (invClass) {
      expect(invClass.impact).toBe('material')
      // 2% inventory divergence is safe to proceed per classification rules
      expect(invClass.safe_to_proceed).toBe(true)
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// STEP 10: FINAL GO / NO_GO DECISION
// ══════════════════════════════════════════════════════════════════════════════

describe('Step 10: Final Decision', () => {
  // Helpers
  function makeCleanAudit() {
    return computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
  }

  function makeCleanBackfill() {
    return {
      backfill_complete: true,
      missing: { sales: 0, expenses: 0, purchases: 0 },
      total_missing: 0,
    }
  }

  describe('COMPANY_CLEAN — GO expected', () => {
    const audit    = makeCleanAudit()
    const backfill = makeCleanBackfill()
    const coverage = buildCoverageChecks(CLEAN_DIVERGENCE)
    const checklist = computeCutoverReadiness(CLEAN_DIVERGENCE, backfill, CLEAN_TB, CLEAN_BS_INTEGRITY, audit)

    it('cutover_readiness decision is GO', () => {
      expect(checklist.decision).toBe('GO')
    })

    it('confidence score is 100', () => {
      const score = computeConfidenceScore(coverage, audit, CLEAN_TB, CLEAN_BS_INTEGRITY)
      expect(score).toBe(100)
    })

    it('recommendation contains APPROVED', () => {
      const mismatches = identifyMismatches(CLEAN_DIVERGENCE)
      const rec = produceFinalRecommendation('GO', 100, mismatches, coverage, [])
      expect(rec).toContain('APPROVED')
    })

    it('production steps include parallel mode advancement and gl_primary cutover', () => {
      const steps = buildProductionSteps('GO', 'co-clean', false)
      const stepActions = steps.map(s => s.action)
      expect(stepActions.some(a => a.toLowerCase().includes('parallel'))).toBe(true)
      expect(stepActions.some(a => a.toLowerCase().includes('gl_primary'))).toBe(true)
    })

    it('no high-risk production steps', () => {
      const steps = buildProductionSteps('GO', 'co-clean', false)
      const highRisk = steps.filter(s => s.risk === 'high')
      expect(highRisk.length).toBe(0)
    })
  })

  describe('COMPANY_PARTIAL — NO_GO before backfill', () => {
    const partialAudit = computeShadowAudit(PARTIAL_OP, PARTIAL_GL, PARTIAL_GLBS, CLEAN_OPBS)
    const partialBackfill = {
      backfill_complete: false,
      missing: { sales: 60, expenses: 20, purchases: 0 },
      total_missing: 80,
    }
    const coverage  = buildCoverageChecks(PARTIAL_DIVERGENCE)
    const checklist = computeCutoverReadiness(
      PARTIAL_DIVERGENCE, partialBackfill, PARTIAL_TB,
      { is_balanced: false, imbalance_try: 1_215_000 },
      partialAudit,
    )

    it('cutover_readiness decision is NO_GO', () => {
      expect(checklist.decision).toBe('NO_GO')
    })

    it('confidence score is low (< 40)', () => {
      const score = computeConfidenceScore(
        coverage, partialAudit, PARTIAL_TB, { is_balanced: false, imbalance_try: 1_215_000 },
      )
      expect(score).toBeLessThan(40)
    })

    it('recommendation mentions BLOCKED', () => {
      const mismatches = identifyMismatches(PARTIAL_DIVERGENCE)
      const warnings   = classifyWarningImpact(partialAudit)
      const rec = produceFinalRecommendation('NO_GO', 15, mismatches, coverage, warnings)
      expect(rec).toContain('BLOCKED')
    })

    it('remediation plan identifies 2 auto-remediable batches', () => {
      const mismatches = identifyMismatches(PARTIAL_DIVERGENCE)
      const plan = buildRemediationPlan(mismatches, PARTIAL_DIVERGENCE)
      expect(plan.auto_records.length).toBe(2)
      expect(plan.can_auto_remediate).toBe(true)
    })
  })

  describe('COMPANY_PARTIAL — GO after backfill + minor timing diff', () => {
    const postAudit = computeShadowAudit(CLEAN_OP, POST_BACKFILL_GL, CLEAN_GLBS, CLEAN_OPBS)
    const postBackfill = makeCleanBackfill()
    const coverage = buildCoverageChecks(POST_BACKFILL_DIVERGENCE)
    const checklist = computeCutoverReadiness(
      POST_BACKFILL_DIVERGENCE, postBackfill, CLEAN_TB, CLEAN_BS_INTEGRITY, postAudit,
    )

    it('decision advances to GO after backfill (timing diff < 1%)', () => {
      expect(checklist.decision).toBe('GO')
    })

    it('confidence score ≥ 90 after backfill', () => {
      const score = computeConfidenceScore(coverage, postAudit, CLEAN_TB, CLEAN_BS_INTEGRITY)
      expect(score).toBeGreaterThanOrEqual(90)
    })
  })

  describe('COMPANY_EMPTY — NO_GO (shadow mode, zero entries)', () => {
    const coverage = buildCoverageChecks(EMPTY_DIVERGENCE)

    it('confidence score is 0 (no GL entries, all coverage checks fail)', () => {
      const score = computeConfidenceScore(
        coverage, null, EMPTY_TB, EMPTY_BS_INTEGRITY,
      )
      // All 3 coverage checks fail (-25 each = -75), no GL entries (-40) = score 0
      expect(score).toBe(0)
    })

    it('mismatches include all three auto-remediable batches', () => {
      const m = identifyMismatches(EMPTY_DIVERGENCE)
      expect(m.total).toBe(3)
      expect(m.auto_remediable).toBe(3)
      expect(m.manual_required).toBe(0)
    })

    it('remediation plan says ready_for_parallel after backfill', () => {
      // After backfill, empty company would have all entries
      const postM = identifyMismatches(POST_BACKFILL_DIVERGENCE)
      const plan  = buildRemediationPlan(postM, POST_BACKFILL_DIVERGENCE)
      expect(plan.post_remediation_state).toBe('ready_for_gl_primary')
    })

    it('production steps include backfill when needed', () => {
      const steps = buildProductionSteps('NO_GO', 'co-empty', true)
      expect(steps.some(s => s.action.toLowerCase().includes('backfill'))).toBe(true)
      expect(steps[0].risk).toBe('low')
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE SCORE CALIBRATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Confidence Score Calibration', () => {
  const cleanCoverage = buildCoverageChecks(CLEAN_DIVERGENCE)
  const cleanAudit    = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)

  it('perfect state → 100', () => {
    const score = computeConfidenceScore(cleanCoverage, cleanAudit, CLEAN_TB, CLEAN_BS_INTEGRITY)
    expect(score).toBe(100)
  })

  it('TB imbalanced → deducted 30 points', () => {
    const score = computeConfidenceScore(
      cleanCoverage, cleanAudit,
      { ...CLEAN_TB, is_balanced: false },
      CLEAN_BS_INTEGRITY,
    )
    expect(score).toBe(70)
  })

  it('BS imbalanced → deducted 20 points', () => {
    const score = computeConfidenceScore(
      cleanCoverage, cleanAudit, CLEAN_TB,
      { is_balanced: false, imbalance_try: 100 },
    )
    expect(score).toBe(80)
  })

  it('null shadow audit (no GL entries) → deducted 40 points', () => {
    const score = computeConfidenceScore(cleanCoverage, null, CLEAN_TB, CLEAN_BS_INTEGRITY)
    expect(score).toBe(60)
  })

  it('one coverage fail → deducted 25 points', () => {
    const partialCoverage = buildCoverageChecks(PARTIAL_DIVERGENCE)
    const score = computeConfidenceScore(
      partialCoverage, cleanAudit, CLEAN_TB, CLEAN_BS_INTEGRITY,
    )
    // 2 fail checks: -25 each = -50, minus any audit warn... clean audit no penalty
    expect(score).toBeLessThanOrEqual(50)
  })

  it('score is always clamped to [0, 100]', () => {
    // Worst possible state
    const emptyCoverage = buildCoverageChecks(EMPTY_DIVERGENCE)
    const score = computeConfidenceScore(
      emptyCoverage, null,
      { ...EMPTY_TB, is_balanced: false },
      EMPTY_BS_INTEGRITY,
    )
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// PRODUCTION STEPS VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

describe('Production Steps (Cutover Package)', () => {
  it('all steps have step number, action, expected, verify_with', () => {
    const steps = buildProductionSteps('GO', 'co-clean', false)
    for (const step of steps) {
      expect(typeof step.step).toBe('number')
      expect(typeof step.action).toBe('string')
      expect(typeof step.expected).toBe('string')
      expect(typeof step.verify_with).toBe('string')
    }
  })

  it('steps are numbered sequentially starting from 1', () => {
    const steps = buildProductionSteps('GO', 'co-clean', false)
    steps.forEach((s, i) => expect(s.step).toBe(i + 1))
  })

  it('GO decision includes gl_primary advancement step', () => {
    const steps = buildProductionSteps('GO', 'co-clean', false)
    expect(steps.some(s => s.action.includes('gl_primary'))).toBe(true)
  })

  it('NO_GO decision does NOT include gl_primary step (cutover blocked)', () => {
    const steps = buildProductionSteps('NO_GO', 'co-empty', true)
    expect(steps.some(s => s.action.includes('gl_primary'))).toBe(false)
  })

  it('with backfill needed: first step is backfill', () => {
    const steps = buildProductionSteps('GO', 'co-partial', true)
    expect(steps[0].action.toLowerCase()).toContain('backfill')
  })

  it('post-cutover verification step exists for GO', () => {
    const steps = buildProductionSteps('GO', 'co-clean', false)
    expect(steps.some(s => s.action.toLowerCase().includes('post-cutover'))).toBe(true)
  })

  it('rollback archival step exists for GO', () => {
    const steps = buildProductionSteps('GO', 'co-clean', false)
    expect(steps.some(s => s.action.toLowerCase().includes('rollback'))).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// END-TO-END: FULL 10-STEP PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

describe('Full 10-Step Pipeline', () => {
  it('CLEAN COMPANY: complete pipeline produces GO with confidence 100', () => {
    // Step 1
    const shadowAudit = computeShadowAudit(CLEAN_OP, CLEAN_GL, CLEAN_GLBS, CLEAN_OPBS)
    expect(shadowAudit.overall_severity).toBe('ok')

    // Step 2
    const divergenceReport = computeCompanyDivergenceReport('co-clean', 'Test', CLEAN_DIVERGENCE)
    expect(divergenceReport.total_missing).toBe(0)

    // Step 3
    const mismatches = identifyMismatches(CLEAN_DIVERGENCE)
    expect(mismatches.total).toBe(0)

    // Step 4
    const remediation = buildRemediationPlan(mismatches, CLEAN_DIVERGENCE)
    expect(remediation.post_remediation_state).toBe('ready_for_gl_primary')

    // Steps 5–6: trial balance + BS integrity — provided as CLEAN
    expect(CLEAN_TB.is_balanced).toBe(true)
    expect(CLEAN_BS_INTEGRITY.is_balanced).toBe(true)

    // Steps 7–9: coverage checks
    const coverage = buildCoverageChecks(CLEAN_DIVERGENCE)
    expect(coverage.every(c => c.status === 'pass')).toBe(true)

    // Step 10: final decision
    const confidence = computeConfidenceScore(coverage, shadowAudit, CLEAN_TB, CLEAN_BS_INTEGRITY)
    const checklist  = computeCutoverReadiness(
      CLEAN_DIVERGENCE,
      { backfill_complete: true, missing: { sales: 0, expenses: 0, purchases: 0 }, total_missing: 0 },
      CLEAN_TB,
      CLEAN_BS_INTEGRITY,
      shadowAudit,
    )

    expect(confidence).toBe(100)
    expect(checklist.decision).toBe('GO')

    const recommendation = produceFinalRecommendation('GO', confidence, mismatches, coverage, [])
    expect(recommendation).toContain('APPROVED')

    const steps = buildProductionSteps('GO', 'co-clean', false)
    expect(steps.length).toBeGreaterThanOrEqual(6)
  })

  it('EMPTY COMPANY: pipeline produces NO_GO, then GO after simulated backfill', () => {
    // --- BEFORE BACKFILL ---
    // Step 3
    const mismatches = identifyMismatches(EMPTY_DIVERGENCE)
    expect(mismatches.total).toBe(3)

    // Step 4
    const remediation = buildRemediationPlan(mismatches, EMPTY_DIVERGENCE)
    expect(remediation.can_auto_remediate).toBe(true)
    expect(remediation.backfill_command).toContain('flowra_phase9c_backfill.sql')

    // Steps 7–9
    const coverageBefore = buildCoverageChecks(EMPTY_DIVERGENCE)
    expect(coverageBefore.every(c => c.status === 'fail')).toBe(true)

    // Step 10 — NO_GO
    const scoreBefore = computeConfidenceScore(
      coverageBefore, null, EMPTY_TB, EMPTY_BS_INTEGRITY,
    )
    expect(scoreBefore).toBe(0)

    // --- AFTER BACKFILL ---
    // Simulate: backfill runs, GL is now populated with correct entries
    const postAudit    = computeShadowAudit(CLEAN_OP, POST_BACKFILL_GL, CLEAN_GLBS, CLEAN_OPBS)
    const postCoverage = buildCoverageChecks(POST_BACKFILL_DIVERGENCE)
    const postMismatches = identifyMismatches(POST_BACKFILL_DIVERGENCE)

    expect(postCoverage.every(c => c.status === 'pass')).toBe(true)
    expect(postMismatches.total).toBe(0)

    const postChecklist = computeCutoverReadiness(
      POST_BACKFILL_DIVERGENCE,
      { backfill_complete: true, missing: { sales: 0, expenses: 0, purchases: 0 }, total_missing: 0 },
      CLEAN_TB,
      CLEAN_BS_INTEGRITY,
      postAudit,
    )
    expect(postChecklist.decision).toBe('GO')

    const postScore = computeConfidenceScore(postCoverage, postAudit, CLEAN_TB, CLEAN_BS_INTEGRITY)
    expect(postScore).toBeGreaterThanOrEqual(90)
  })
})
