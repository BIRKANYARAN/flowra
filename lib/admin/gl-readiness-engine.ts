// ─────────────────────────────────────────────────────────────────────────────
// lib/admin/gl-readiness-engine.ts
//
// Faz 9-C: Complete GL Primary Readiness Engine
//
// Orchestrates all 10 validation steps for gl_primary cutover readiness.
// Pure computation — no DB calls. All inputs pre-fetched by the route layer.
//
// Steps:
//   1. Shadow audit (per-period financial comparison)
//   2. Divergence report (per-company operational vs journaled counts)
//   3. Mismatch source identification (which record types cause gaps)
//   4. Deterministic remediation analysis (can mismatches be auto-resolved?)
//   5. Trial balance integrity (Σ DR = Σ CR, within ₺0.01)
//   6. Balance sheet equation (Assets = L+E, within ₺0.01)
//   7. Sales journal coverage (every sale has SALE_ACCRUAL entry)
//   8. Expense journal coverage (every expense has EXPENSE_ACCRUAL entry)
//   9. Purchase journal coverage (every purchase has PURCHASE_FINALIZE entry)
//  10. Final GO / NO_GO report
// ─────────────────────────────────────────────────────────────────────────────

import { round2 } from '@/lib/calc'
import type { DivergenceSummary, SourceCounts } from './gl-divergence'
import type { ShadowAuditResult }               from './gl-shadow-audit'
import type { CutoverReadinessReport, CheckStatus, TrialBalanceSummary } from './gl-cutover-readiness'

// ── Shared types ──────────────────────────────────────────────────────────────

export type MismatchCategory =
  | 'missing_sale_accrual'
  | 'missing_expense_accrual'
  | 'missing_purchase_finalize'
  | 'orphaned_entry_line'        // entry line without a parent entry
  | 'imbalanced_entry'           // individual entry where Σ DR ≠ Σ CR
  | 'phantom_account'            // account code not in chart of accounts
  | 'negative_balance_asset'     // asset account with negative balance (impossible in reality)

export type RemediationStrategy = 'auto_backfill' | 'manual_review' | 'accept_as_is' | 'impossible'

export interface MismatchRecord {
  source_type:   'sale' | 'expense' | 'purchase' | 'journal_entry' | 'account'
  source_id:     string
  category:      MismatchCategory
  amount_try:    number
  description:   string
  remediation:   RemediationStrategy
  is_blocking:   boolean
}

// ── Step 1: Period Shadow Audit ───────────────────────────────────────────────

export interface PeriodShadowComparison {
  period_label:    string            // 'YYYY-MM' or 'all-time'
  period_id?:      string | null
  from_date:       string
  to_date:         string
  audit:           ShadowAuditResult | null
  note?:           string            // reason if audit is null
}

// ── Step 2: Per-company divergence ───────────────────────────────────────────

export interface CompanyDivergenceReport {
  company_id:      string
  company_name:    string
  divergence:      DivergenceSummary
  total_missing:   number
  total_amount_try: number
  coverage_pct:    number   // (total_with_entries / total_records) × 100
}

// ── Step 3: Mismatch sources ──────────────────────────────────────────────────

export interface MismatchSummary {
  records:          MismatchRecord[]
  by_category:      Record<MismatchCategory, number>
  auto_remediable:  number
  manual_required:  number
  total:            number
}

// ── Step 4: Remediation plan ──────────────────────────────────────────────────

export interface RemediationPlan {
  can_auto_remediate:   boolean
  auto_records:         MismatchRecord[]
  manual_records:       MismatchRecord[]
  estimated_sql_lines:  number
  backfill_command:     string
  post_remediation_state: 'ready_for_parallel' | 'ready_for_gl_primary' | 'still_blocked'
}

// ── Step 5-9: Coverage checks ─────────────────────────────────────────────────

export interface CoverageCheck {
  check_name:        string
  source_type:       'sale' | 'expense' | 'purchase' | 'trial_balance' | 'balance_sheet'
  total_records:     number
  journaled_records: number
  missing_records:   number
  coverage_pct:      number
  missing_amount_try: number
  status:            CheckStatus
  detail:            string
  is_blocking:       boolean
}

// ── Step 10: Final report ─────────────────────────────────────────────────────

export type CutoverDecision = 'GO' | 'GO_WITH_WARNINGS' | 'NO_GO'

export interface BusinessImpactClassification {
  warning_id:    string
  field:         string
  delta_pct:     number
  impact:        'cosmetic' | 'material' | 'critical'
  description:   string
  safe_to_proceed: boolean
}

export interface FinalReadinessReport {
  computed_at:             string
  decision:                CutoverDecision
  confidence_score:        number   // 0-100
  checks_passed:           number
  checks_warned:           number
  checks_failed:           number

  // Per-step results
  period_audits:           PeriodShadowComparison[]
  company_divergence:      CompanyDivergenceReport[]
  mismatches:              MismatchSummary
  remediation_plan:        RemediationPlan
  coverage_checks:         CoverageCheck[]
  trial_balance:           TrialBalanceSummary
  balance_sheet_integrity: { is_balanced: boolean; imbalance_try: number }
  cutover_checklist:       CutoverReadinessReport

  // Warning analysis (for GO_WITH_WARNINGS)
  warning_classifications: BusinessImpactClassification[]

  // Final output
  recommendation:          string
  production_steps:        ProductionStep[]
  rollback_trigger:        string
}

export interface ProductionStep {
  step:        number
  action:      string
  command?:    string
  expected:    string
  verify_with: string
  risk:        'none' | 'low' | 'medium' | 'high'
}

// ── Pure computation functions ────────────────────────────────────────────────

/**
 * Compute per-company divergence report from raw operational and journaled counts.
 */
export function computeCompanyDivergenceReport(
  companyId:   string,
  companyName: string,
  divergence:  DivergenceSummary,
): CompanyDivergenceReport {
  const totalRecords =
    divergence.sales.total + divergence.expenses.total + divergence.purchases.total
  const totalWithEntries =
    divergence.sales.with_entries + divergence.expenses.with_entries + divergence.purchases.with_entries
  const totalMissing =
    divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing
  const totalAmount =
    divergence.sales.missing_amount_try + divergence.expenses.missing_amount_try + divergence.purchases.missing_amount_try

  return {
    company_id:       companyId,
    company_name:     companyName,
    divergence,
    total_missing:    totalMissing,
    total_amount_try: totalAmount,
    coverage_pct:     totalRecords > 0 ? round2((totalWithEntries / totalRecords) * 100) : 100,
  }
}

/**
 * Classify operational records into mismatch categories.
 * Returns structured records with remediation strategies.
 */
export function identifyMismatches(divergence: DivergenceSummary): MismatchSummary {
  const records: MismatchRecord[] = []

  // Sales without SALE_ACCRUAL entries
  if (divergence.sales.missing > 0) {
    records.push({
      source_type: 'sale',
      source_id:   'batch',
      category:    'missing_sale_accrual',
      amount_try:  divergence.sales.missing_amount_try,
      description: `${divergence.sales.missing} sales lack SALE_ACCRUAL journal entries (₺${divergence.sales.missing_amount_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY revenue unrecognised in GL)`,
      remediation: 'auto_backfill',
      is_blocking: true,
    })
  }

  // Expenses without EXPENSE_ACCRUAL entries
  if (divergence.expenses.missing > 0) {
    records.push({
      source_type: 'expense',
      source_id:   'batch',
      category:    'missing_expense_accrual',
      amount_try:  divergence.expenses.missing_amount_try,
      description: `${divergence.expenses.missing} expenses lack EXPENSE_ACCRUAL journal entries (₺${divergence.expenses.missing_amount_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY opex unrecognised in GL)`,
      remediation: 'auto_backfill',
      is_blocking: true,
    })
  }

  // Purchases without PURCHASE_FINALIZE entries
  if (divergence.purchases.missing > 0) {
    records.push({
      source_type: 'purchase',
      source_id:   'batch',
      category:    'missing_purchase_finalize',
      amount_try:  divergence.purchases.missing_amount_try,
      description: `${divergence.purchases.missing} purchases lack PURCHASE_FINALIZE journal entries (₺${divergence.purchases.missing_amount_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY inventory unrecognised in GL)`,
      remediation: 'auto_backfill',
      is_blocking: true,
    })
  }

  // Build by_category tally
  const by_category = {} as Record<MismatchCategory, number>
  for (const rec of records) {
    by_category[rec.category] = (by_category[rec.category] ?? 0) + 1
  }

  const autoRemediable = records.filter(r => r.remediation === 'auto_backfill').length
  const manualRequired = records.filter(r => r.remediation === 'manual_review').length

  return { records, by_category, auto_remediable: autoRemediable, manual_required: manualRequired, total: records.length }
}

/**
 * Build remediation plan for all identified mismatches.
 */
export function buildRemediationPlan(
  mismatches: MismatchSummary,
  divergence:  DivergenceSummary,
): RemediationPlan {
  const autoRecords   = mismatches.records.filter(r => r.remediation === 'auto_backfill')
  const manualRecords = mismatches.records.filter(r => r.remediation === 'manual_review')

  // Estimate SQL lines: header (6) + per-type block (~40 lines each)
  const sqlLinesPerType = 40
  const typesNeeded =
    (divergence.sales.missing     > 0 ? 1 : 0) +
    (divergence.expenses.missing  > 0 ? 1 : 0) +
    (divergence.purchases.missing > 0 ? 1 : 0)

  const estimatedLines = typesNeeded > 0 ? 6 + typesNeeded * sqlLinesPerType : 0

  const totalMissing = divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing

  let postState: RemediationPlan['post_remediation_state']
  if (manualRecords.length > 0) {
    postState = 'still_blocked'
  } else if (totalMissing === 0) {
    postState = 'ready_for_gl_primary'
  } else {
    postState = 'ready_for_parallel'
  }

  return {
    can_auto_remediate:    autoRecords.length > 0 && manualRecords.length === 0,
    auto_records:          autoRecords,
    manual_records:        manualRecords,
    estimated_sql_lines:   estimatedLines,
    backfill_command:      totalMissing > 0
      ? 'psql $DATABASE_URL < supabase/flowra_phase9c_backfill.sql'
      : 'No backfill needed.',
    post_remediation_state: postState,
  }
}

/**
 * Build per-source-type coverage checks (steps 7-9).
 */
export function buildCoverageChecks(divergence: DivergenceSummary): CoverageCheck[] {
  function makeCheck(
    name:       string,
    sourceType: CoverageCheck['source_type'],
    counts:     SourceCounts,
  ): CoverageCheck {
    const coveragePct = counts.total > 0
      ? round2((counts.with_entries / counts.total) * 100)
      : 100

    const status: CheckStatus =
      counts.missing === 0  ? 'pass'
      : counts.missing > 5  ? 'fail' : 'warn'

    return {
      check_name:          name,
      source_type:         sourceType,
      total_records:       counts.total,
      journaled_records:   counts.with_entries,
      missing_records:     counts.missing,
      coverage_pct:        coveragePct,
      missing_amount_try:  counts.missing_amount_try,
      status,
      detail: counts.missing === 0
        ? `${counts.total} records, 100% covered (${counts.with_entries} journal entries).`
        : `${counts.missing} of ${counts.total} records lack journal entries (₺${counts.missing_amount_try.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY). Coverage: ${coveragePct}%.`,
      is_blocking: counts.missing > 0,
    }
  }

  return [
    makeCheck('Sales Journal Coverage',    'sale',     divergence.sales),
    makeCheck('Expense Journal Coverage',  'expense',  divergence.expenses),
    makeCheck('Purchase Journal Coverage', 'purchase', divergence.purchases),
  ]
}

/**
 * Classify business impact of shadow audit warnings.
 */
export function classifyWarningImpact(audit: ShadowAuditResult): BusinessImpactClassification[] {
  return audit.deltas
    .filter(d => d.severity !== 'ok')
    .map(d => {
      const absPct = Math.abs(d.delta_pct)

      // Classify impact based on field and magnitude
      let impact: BusinessImpactClassification['impact']
      let description: string
      let safeToProceed: boolean

      if (d.severity === 'critical') {
        impact       = 'critical'
        description  = `${d.field}: ${absPct.toFixed(2)}% divergence between operational and GL. GL reports will show materially different numbers. BACKFILL REQUIRED.`
        safeToProceed = false
      } else if (d.field === 'revenue' || d.field === 'net_income') {
        // Revenue/profit warnings are material even at 1-5%
        impact       = 'material'
        description  = `${d.field}: ${absPct.toFixed(2)}% divergence (₺${Math.abs(d.delta_try).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY). P&L will differ between GL and operational reports. Review before gl_primary.`
        safeToProceed = absPct < 2.0   // only safe if <2%
      } else if (d.field === 'trade_receivables' || d.field === 'inventory') {
        // Balance sheet items: warn but may be timing differences
        impact       = 'material'
        description  = `${d.field}: ${absPct.toFixed(2)}% divergence (₺${Math.abs(d.delta_try).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY). May be timing difference (accrual vs cash). Verify against specific records.`
        safeToProceed = absPct < 3.0
      } else {
        // VAT, COGS, opex — lower business impact for small divergences
        impact       = 'cosmetic'
        description  = `${d.field}: ${absPct.toFixed(2)}% divergence (₺${Math.abs(d.delta_try).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TRY). Minor rounding or timing difference. Acceptable for gl_primary cutover.`
        safeToProceed = true
      }

      return {
        warning_id:       `warn_${d.field}`,
        field:            d.field,
        delta_pct:        d.delta_pct,
        impact,
        description,
        safe_to_proceed:  safeToProceed,
      }
    })
}

/**
 * Build the production cutover steps for GO decision.
 */
export function buildProductionSteps(
  decision:   CutoverDecision,
  companyId:  string,
  needsBackfill: boolean,
): ProductionStep[] {
  const steps: ProductionStep[] = []
  let n = 1

  if (needsBackfill) {
    steps.push({
      step:        n++,
      action:      'Run journal entry backfill',
      command:     'psql $DATABASE_URL < supabase/flowra_phase9c_backfill.sql',
      expected:    'NOTICE: Backfill complete: 0 missing entries across all operational record types.',
      verify_with: 'GET /api/admin/gl-divergence → total_missing should be 0',
      risk:        'low',
    })
  }

  steps.push({
    step:        n++,
    action:      'Verify shadow audit clears all critical divergences',
    command:     `curl "$BASE_URL/api/admin/gl-shadow-audit?from=2024-01-01&to=$(date +%Y-%m-%d)"`,
    expected:    'overall_severity: "ok" or "warn" (no "critical")',
    verify_with: 'GET /api/admin/gl-shadow-audit → counts.critical === 0',
    risk:        'none',
  })

  steps.push({
    step:        n++,
    action:      'Verify trial balance is balanced',
    command:     `curl "$BASE_URL/api/cfo/trial-balance"`,
    expected:    'is_balanced: true, imbalance_try < 0.01',
    verify_with: 'GET /api/admin/gl-shadow-audit → trial_balance.is_balanced === true',
    risk:        'none',
  })

  steps.push({
    step:        n++,
    action:      'Advance gl_mode to parallel',
    command:     `curl -X PATCH "$BASE_URL/api/admin/gl-mode" -d '{"gl_mode":"parallel"}'`,
    expected:    '{ "gl_mode": "parallel", "updated": true }',
    verify_with: 'GET /api/admin/gl-mode → gl_mode should be "parallel"',
    risk:        'low',
  })

  steps.push({
    step:        n++,
    action:      'Monitor dual-write for 24 hours (parallel mode observation)',
    command:     'Watch server logs for [dual-write] warnings. Check /api/admin/gl-divergence daily.',
    expected:    'Zero new divergences introduced by live traffic',
    verify_with: 'GET /api/admin/gl-shadow-audit after 24h → same or better severity',
    risk:        'low',
  })

  steps.push({
    step:        n++,
    action:      'Re-run shadow audit in parallel mode',
    command:     `curl "$BASE_URL/api/admin/gl-shadow-audit?from=2024-01-01&to=$(date +%Y-%m-%d)"`,
    expected:    'decision: "GO" from cutover_readiness',
    verify_with: 'cutover_readiness.decision === "GO"',
    risk:        'none',
  })

  if (decision === 'GO' || decision === 'GO_WITH_WARNINGS') {
    steps.push({
      step:        n++,
      action:      'Advance gl_mode to gl_primary — FINAL CUTOVER',
      command:     `curl -X PATCH "$BASE_URL/api/admin/gl-mode" -d '{"gl_mode":"gl_primary"}'`,
      expected:    '{ "gl_mode": "gl_primary", "updated": true }',
      verify_with: 'GET /api/financial-statements/balance-sheet → source: "gl" in response',
      risk:        'medium',
    })

    steps.push({
      step:        n++,
      action:      'Post-cutover verification: financial statements serve GL data',
      command:     `curl "$BASE_URL/api/financial-statements/balance-sheet?as_of=$(date +%Y-%m-%d)"`,
      expected:    'Response includes source: "gl", is_balanced: true',
      verify_with: 'Balance sheet from GL matches operational balance sheet within ₺0.01',
      risk:        'none',
    })

    steps.push({
      step:        n++,
      action:      'Archive rollback package (keep 30 days)',
      command:     `cp supabase/flowra_phase9c_rollback.sql "backups/rollback_gl_primary_$(date +%Y%m%d).sql"`,
      expected:    'Rollback SQL archived with date stamp',
      verify_with: 'File exists in backups/ directory',
      risk:        'none',
    })
  }

  return steps
}

/**
 * Compute a 0-100 confidence score for the cutover decision.
 * Based on: coverage pct, divergence magnitude, trial balance, backfill state.
 */
export function computeConfidenceScore(
  coverageChecks:  CoverageCheck[],
  shadowAudit:     ShadowAuditResult | null,
  tbIntegrity:     { is_balanced: boolean },
  bsIntegrity:     { is_balanced: boolean },
): number {
  let score = 100

  // Coverage penalties
  for (const check of coverageChecks) {
    if (check.status === 'fail') score -= 25
    else if (check.status === 'warn') score -= 8
  }

  // Shadow audit penalties
  if (shadowAudit) {
    score -= shadowAudit.counts.critical * 20
    score -= shadowAudit.counts.warn * 5
  } else {
    // No shadow audit = no GL entries at all
    score -= 40
  }

  // Integrity penalties
  if (!tbIntegrity.is_balanced) score -= 30
  if (!bsIntegrity.is_balanced) score -= 20

  return Math.max(0, Math.min(100, score))
}

/**
 * Produce the final GO/NO_GO recommendation text.
 */
export function produceFinalRecommendation(
  decision:     CutoverDecision,
  confidence:   number,
  mismatches:   MismatchSummary,
  coverageChecks: CoverageCheck[],
  warningClassifications: BusinessImpactClassification[],
): string {
  if (decision === 'GO') {
    return (
      `GL Primary cutover is APPROVED (confidence: ${confidence}/100). ` +
      `All ${coverageChecks.length} coverage checks pass, trial balance is balanced, ` +
      `balance sheet equation holds, and no critical shadow audit divergences detected. ` +
      `Proceed with the production cutover steps in order.`
    )
  }

  if (decision === 'GO_WITH_WARNINGS') {
    const materialWarnings = warningClassifications.filter(w => w.impact === 'material')
    const safeWarnings     = warningClassifications.filter(w => w.safe_to_proceed)
    const unsafeWarnings   = warningClassifications.filter(w => !w.safe_to_proceed)

    if (unsafeWarnings.length > 0) {
      return (
        `GL Primary cutover has ${unsafeWarnings.length} material warning(s) that are NOT safe to ignore ` +
        `(confidence: ${confidence}/100). Address these divergences before advancing to gl_primary. ` +
        `Parallel mode is safe to enable now. Monitor for 24h then re-evaluate.`
      )
    }

    return (
      `GL Primary cutover can proceed with caution (confidence: ${confidence}/100). ` +
      `${safeWarnings.length} warning(s) classified as cosmetic or timing differences ` +
      `(${materialWarnings.length} material, all below 2% threshold). ` +
      `Business impact is LOW. Safe to advance to gl_primary after parallel mode observation.`
    )
  }

  // NO_GO
  const blockingCount = coverageChecks.filter(c => c.is_blocking).length +
    (mismatches.records.filter(r => r.is_blocking).length > 0 ? 1 : 0)

  return (
    `GL Primary cutover is BLOCKED (confidence: ${confidence}/100). ` +
    `${blockingCount} blocking condition(s) must be resolved. ` +
    `Run backfill SQL to journal ${mismatches.records.reduce((s, r) => s + (r.is_blocking ? 1 : 0), 0)} missing entry batch(es), ` +
    `then re-run this readiness process. Estimated remediation: deterministic, 0 manual interventions required.`
  )
}
