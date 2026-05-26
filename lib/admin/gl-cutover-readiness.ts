// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/gl-cutover-readiness.ts
//
// Faz 9-C: GL Cutover Readiness Report — pure pass/fail evaluation.
//
// Aggregates signals from divergence audit, backfill status, trial balance,
// and shadow audit into a single actionable readiness report.
// No DB calls. All inputs pre-fetched by the caller.
// ─────────────────────────────────────────────────────────────────────────────

import type { DivergenceSummary } from './gl-divergence'
import type { BackfillStatus } from './journal-backfill'
import type { ShadowAuditResult } from './gl-shadow-audit'

// ── Input types ───────────────────────────────────────────────────────────────

export interface TrialBalanceSummary {
  is_balanced:         boolean
  imbalance_try:       number
  can_close_period:    boolean
  total_debit_try:     number
  total_credit_try:    number
}

export interface GLBalanceSheetIntegrity {
  is_balanced:   boolean
  imbalance_try: number
}

// ── Output types ──────────────────────────────────────────────────────────────

export type CheckStatus = 'pass' | 'fail' | 'warn'

export interface ReadinessCheck {
  id:          string
  name:        string
  description: string
  status:      CheckStatus
  detail:      string
  blocking:    boolean   // if true, cutover must NOT proceed
}

export type CutoverGo = 'GO' | 'NO_GO' | 'GO_WITH_WARNINGS'

export interface CutoverReadinessReport {
  computed_at:     string
  decision:        CutoverGo
  checks:          ReadinessCheck[]
  blocking_count:  number
  warning_count:   number
  pass_count:      number
  recommendation:  string
  next_steps:      string[]
}

// ── Evaluation ────────────────────────────────────────────────────────────────

/**
 * Evaluate whether the GL system is ready for cutover to parallel or gl_primary mode.
 *
 * Cutover is GO only when all blocking checks pass.
 * Warnings are acceptable for parallel mode but must clear before gl_primary.
 */
export function computeCutoverReadiness(
  divergence:    DivergenceSummary,
  backfill:      BackfillStatus,
  trialBalance:  TrialBalanceSummary,
  glBS:          GLBalanceSheetIntegrity,
  shadowAudit:   ShadowAuditResult,
): CutoverReadinessReport {
  const checks: ReadinessCheck[] = []

  // ── Check 1: Journal entry backfill complete ──────────────────────────────
  const totalMissing = divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing
  checks.push({
    id:          'backfill_complete',
    name:        'Journal Entry Backfill Complete',
    description: 'All operational records (sales, expenses, purchases) must have corresponding journal entries.',
    status:      totalMissing === 0 ? 'pass' : 'fail',
    detail:      totalMissing === 0
      ? 'All operational records have journal entries.'
      : `Missing: ${divergence.sales.missing} sales, ${divergence.expenses.missing} expenses, ${divergence.purchases.missing} purchases (total ₺${(divergence.sales.missing_amount_try + divergence.expenses.missing_amount_try + divergence.purchases.missing_amount_try).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY).`,
    blocking:    true,
  })

  // ── Check 2: Trial balance balanced ──────────────────────────────────────
  checks.push({
    id:          'trial_balance_balanced',
    name:        'Trial Balance Balanced',
    description: 'Sum of all debit balances must equal sum of all credit balances (invariant: Σ DR = Σ CR).',
    status:      trialBalance.is_balanced ? 'pass' : 'fail',
    detail:      trialBalance.is_balanced
      ? `Balanced. Total DR: ₺${trialBalance.total_debit_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} = Total CR: ₺${trialBalance.total_credit_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}.`
      : `IMBALANCE ₺${trialBalance.imbalance_try.toFixed(2)} TRY. Journal entry integrity violation.`,
    blocking:    true,
  })

  // ── Check 3: Balance sheet equation holds ────────────────────────────────
  checks.push({
    id:          'balance_sheet_equation',
    name:        'Balance Sheet Equation (Assets = L + E)',
    description: 'GL-derived balance sheet must satisfy Assets = Liabilities + Equity within ₺0.01 TRY.',
    status:      glBS.is_balanced ? 'pass' : 'fail',
    detail:      glBS.is_balanced
      ? `Balanced. Imbalance: ₺${glBS.imbalance_try.toFixed(4)} TRY (within ₺0.01 tolerance).`
      : `IMBALANCE ₺${glBS.imbalance_try.toFixed(4)} TRY. Missing journal entry(ies) affecting balance.`,
    blocking:    true,
  })

  // ── Check 4: Shadow audit — no critical divergences ───────────────────────
  checks.push({
    id:          'shadow_audit_no_critical',
    name:        'Shadow Audit: No Critical Divergences',
    description: `No financial field may diverge more than ${5}% between operational tables and GL accounts.`,
    status:      shadowAudit.counts.critical === 0 ? 'pass' : 'fail',
    detail:      shadowAudit.counts.critical === 0
      ? `All fields within 5% tolerance. Max divergence: ${shadowAudit.max_delta_pct.toFixed(2)}%.`
      : `${shadowAudit.counts.critical} field(s) exceed 5% divergence. Run backfill and re-audit.`,
    blocking:    true,
  })

  // ── Check 5: Shadow audit — no warnings ──────────────────────────────────
  checks.push({
    id:          'shadow_audit_no_warnings',
    name:        'Shadow Audit: No Warnings (1–5% divergence)',
    description: 'For gl_primary mode, all fields should be within 1% of operational values.',
    status:      shadowAudit.counts.warn === 0 ? 'pass' : 'warn',
    detail:      shadowAudit.counts.warn === 0
      ? 'No fields in warning range.'
      : `${shadowAudit.counts.warn} field(s) between 1–5% divergence. Acceptable for parallel mode; review before gl_primary.`,
    blocking:    false,
  })

  // ── Check 6: Period has entries (not phantom) ─────────────────────────────
  const hasGLActivity = trialBalance.total_debit_try > 0
  checks.push({
    id:          'gl_has_activity',
    name:        'GL Has Journal Entries',
    description: 'The GL must contain at least some journal entries before cutover.',
    status:      hasGLActivity ? 'pass' : 'fail',
    detail:      hasGLActivity
      ? `GL total debits: ₺${trialBalance.total_debit_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY.`
      : 'No journal entries exist in GL. Dual-write may not have been enabled.',
    blocking:    true,
  })

  // ── Check 7: No missing sales entries specifically ────────────────────────
  const missingSalesAmt = divergence.sales.missing_amount_try
  checks.push({
    id:          'sales_fully_journaled',
    name:        'Revenue: All Sales Journaled',
    description: 'Critical: revenue recognition requires every sale to have a SALE_ACCRUAL entry.',
    status:      divergence.sales.missing === 0 ? 'pass'
               : missingSalesAmt > 100_000    ? 'fail' : 'warn',
    detail:      divergence.sales.missing === 0
      ? `All ${divergence.sales.total} sales have journal entries.`
      : `${divergence.sales.missing} of ${divergence.sales.total} sales missing entries (₺${missingSalesAmt.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY).`,
    blocking:    divergence.sales.missing > 0 && missingSalesAmt > 100_000,
  })

  // ── Tally results ─────────────────────────────────────────────────────────
  const blockingFails = checks.filter(c => c.blocking && c.status === 'fail').length
  const warnings      = checks.filter(c => !c.blocking && c.status !== 'pass' || c.status === 'warn').length
  const passes        = checks.filter(c => c.status === 'pass').length

  let decision: CutoverGo
  let recommendation: string
  const nextSteps: string[] = []

  if (blockingFails > 0) {
    decision = 'NO_GO'
    recommendation = `${blockingFails} blocking check(s) failed. Cutover must not proceed.`
    if (totalMissing > 0) nextSteps.push(`Run backfill SQL (supabase/flowra_phase9c_backfill.sql) to journal ${totalMissing} missing records.`)
    if (!trialBalance.is_balanced) nextSteps.push('Investigate trial balance imbalance — a journal entry line is missing its counterpart.')
    if (!glBS.is_balanced) nextSteps.push('Fix GL balance sheet equation — check for unpaired DR/CR lines in journal_entry_lines.')
    if (shadowAudit.counts.critical > 0) nextSteps.push('Re-run shadow audit after backfill to verify critical divergences clear.')
    if (!hasGLActivity) nextSteps.push('Enable dual-write (set gl_mode = parallel) and re-run to generate journal entries.')
  } else if (warnings > 0) {
    decision = 'GO_WITH_WARNINGS'
    recommendation = 'Blocking checks pass. Safe to advance to parallel mode. Review warnings before advancing to gl_primary.'
    nextSteps.push('Set gl_mode = parallel via PATCH /api/admin/gl-mode.')
    nextSteps.push('Monitor shadow audit for 1 full business day in parallel mode.')
    nextSteps.push('Clear warnings before advancing to gl_primary mode.')
  } else {
    decision = 'GO'
    recommendation = 'All checks pass. Safe to advance to gl_primary mode.'
    nextSteps.push('Set gl_mode = gl_primary via PATCH /api/admin/gl-mode.')
    nextSteps.push('Verify /api/financial-statements/* routes return GL-sourced data.')
    nextSteps.push('Archive rollback package (supabase/flowra_phase9c_rollback.sql) in case reversion needed.')
  }

  return {
    computed_at:    new Date().toISOString(),
    decision,
    checks,
    blocking_count: blockingFails,
    warning_count:  warnings,
    pass_count:     passes,
    recommendation,
    next_steps:     nextSteps,
  }
}
