// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/gl-readiness
//
// Faz 9-C: Complete GL Primary Readiness endpoint — 10-step validation.
//
// Runs all checks needed to determine if gl_primary cutover is safe:
//   Step 1:  Shadow audit across available periods
//   Step 2:  Per-company divergence report
//   Step 3:  Mismatch source identification
//   Step 4:  Deterministic remediation plan
//   Step 5:  Trial balance integrity
//   Step 6:  Balance sheet equation integrity
//   Step 7:  Sales journal coverage
//   Step 8:  Expense journal coverage
//   Step 9:  Purchase journal coverage
//   Step 10: Final GO / NO_GO report
//
// Role guard: admin only.
//
// Query params:
//   from        (required)  YYYY-MM-DD  — start of audit window
//   to          (required)  YYYY-MM-DD  — end of audit window
//   period_id   (optional)  UUID of accounting period
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }              from 'next/server'
import { requireAdmin }                           from '@/lib/require-role'
import { AppError }                               from '@/types/errors'
import { resolveApiAuth }                         from '@/lib/api-auth'
import { getSystemAdminClient }                   from '@/lib/admin-db'
import { getGlMode }                              from '@/lib/middleware/period-guard'
import { FinanceService }                         from '@/lib/services/finance.service'
import { TaxService }                             from '@/lib/services/tax.service'
import { BalanceSheetService }                    from '@/lib/services/balance-sheet.service'
import { GLIncomeStatementService }               from '@/lib/services/ledger/gl-income-statement.service'
import { GLBalanceSheetService }                  from '@/lib/services/ledger/gl-balance-sheet.service'
import { TrialBalanceService }                    from '@/lib/services/ledger/trial-balance.service'
import { computeDivergence }                      from '@/lib/admin/gl-divergence'
import { computeShadowAudit }                     from '@/lib/admin/gl-shadow-audit'
import { computeCutoverReadiness }                from '@/lib/admin/gl-cutover-readiness'
import {
  computeCompanyDivergenceReport,
  identifyMismatches,
  buildRemediationPlan,
  buildCoverageChecks,
  classifyWarningImpact,
  buildProductionSteps,
  computeConfidenceScore,
  produceFinalRecommendation,
} from '@/lib/admin/gl-readiness-engine'
import type { OperationalRecord, JournaledRef }   from '@/lib/admin/gl-divergence'
import type {
  OperationalSummary,
  GLSummary,
  GLBalanceSheetSummary,
  OperationalBalanceSheetSummary,
} from '@/lib/admin/gl-shadow-audit'
import type { TrialBalanceSummary }               from '@/lib/admin/gl-cutover-readiness'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

// ── Data helpers ──────────────────────────────────────────────────────────────

async function fetchAllOperational(
  supabase:  AnySupabaseClient,
  companyId: string,
): Promise<{ sales: OperationalRecord[]; expenses: OperationalRecord[]; purchases: OperationalRecord[] }> {
  const [salesRes, expensesRes, purchasesRes] = await Promise.all([
    supabase.from('sales')    .select('id, total_try')   .eq('company_id', companyId).is('deleted_at', null),
    supabase.from('expenses') .select('id, amount_try')  .eq('company_id', companyId).is('deleted_at', null),
    supabase.from('purchases').select('id, total_try')   .eq('company_id', companyId).is('deleted_at', null),
  ])
  return {
    sales:     ((salesRes.data     ?? []) as Array<{ id: string; total_try: number | null }>).map(r => ({ id: r.id, amount_try: r.total_try ?? 0 })),
    expenses:  ((expensesRes.data  ?? []) as Array<{ id: string; amount_try: number | null }>).map(r => ({ id: r.id, amount_try: r.amount_try ?? 0 })),
    purchases: ((purchasesRes.data ?? []) as Array<{ id: string; total_try: number | null }>).map(r => ({ id: r.id, amount_try: r.total_try ?? 0 })),
  }
}

async function fetchJournaledIds(admin: AnySupabaseClient, companyId: string): Promise<JournaledRef[]> {
  const { data } = await admin.from('journal_entries').select('source_type, source_id').eq('company_id', companyId)
  return (data ?? []) as JournaledRef[]
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN')
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      throw e
    }

    const url      = new URL(req.url)
    const from     = url.searchParams.get('from')
    const to       = url.searchParams.get('to')
    const periodId = url.searchParams.get('period_id') || null

    if (!from || !to)
      return NextResponse.json({ error: 'Required: from (YYYY-MM-DD), to (YYYY-MM-DD)' }, { status: 400 })

    const period     = { from, to }
    const adminClient = getSystemAdminClient()

    // ────────────────────────────────────────────────────────────────────────────
    // PARALLEL FETCH — all data sources simultaneously
    // ────────────────────────────────────────────────────────────────────────────
    const [
      glMode,
      financialSummary,
      vatData,
      balanceSheet,
      glIS,
      glBS,
      trialBalanceReport,
      operational,
      journaledIds,
    ] = await Promise.all([
      getGlMode(companyId, supabase),
      FinanceService.getFinancialSummary(uid, companyId, period).catch(() => null),
      TaxService.getKdvNet(uid, companyId, period, undefined, supabase).catch(() => null),
      BalanceSheetService.compute(uid, companyId, to, supabase).catch(() => null),
      GLIncomeStatementService.compute(companyId, adminClient, { fromDate: from, toDate: to, periodId }).catch(() => null),
      GLBalanceSheetService.compute(companyId, adminClient, { asOf: to, periodId }).catch(() => null),
      TrialBalanceService.compute(companyId, adminClient, { periodId, asOf: to }).catch(() => null),
      fetchAllOperational(supabase, companyId),
      fetchJournaledIds(adminClient, companyId),
    ])

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 1: Shadow audit
    // ────────────────────────────────────────────────────────────────────────────
    const opSummary: OperationalSummary = {
      revenue_try:                 financialSummary?.revenue_try ?? 0,
      cost_try:                    financialSummary?.cost_try ?? 0,
      gross_profit_try:            financialSummary?.gross_profit_try ?? 0,
      deductible_expenses_try:     financialSummary?.deductible_expenses_try ?? 0,
      non_deductible_expenses_try: financialSummary?.non_deductible_expenses_try ?? 0,
      sales_vat_try:               vatData?.sales_vat_try ?? 0,
      purchase_vat_try:            vatData?.purchase_vat_try ?? 0,
      expense_vat_try:             vatData?.expense_vat_try ?? 0,
      net_vat_try:                 vatData?.net_vat_try ?? 0,
      matrah_try:                  financialSummary?.matrah_try ?? 0,
      corporate_tax_try:           financialSummary?.corporate_tax_try ?? 0,
      net_after_tax_try:           financialSummary?.net_after_tax_try ?? 0,
    }

    const glSummary: GLSummary | null = glIS ? {
      gross_revenue_try:   glIS.gross_revenue_try,
      cogs_try:            glIS.cogs_try,
      gross_profit_try:    glIS.gross_profit_try,
      total_opex_try:      glIS.total_opex_try,
      ebt_try:             glIS.ebt_try,
      net_income_try:      glIS.net_income_try,
    } : null

    const glBSSummary: GLBalanceSheetSummary | null = glBS ? {
      cash_try:              glBS.cash_try,
      trade_receivables_try: glBS.trade_receivables_try,
      inventory_try:         glBS.inventory_try,
      deductible_vat_try:    glBS.deductible_vat_try,
      output_vat_try:        glBS.output_vat_try,
      trade_payables_try:    glBS.trade_payables_try,
      is_balanced:           glBS.is_balanced,
      imbalance_try:         glBS.imbalance_try,
    } : null

    const opBSSummary: OperationalBalanceSheetSummary | null = balanceSheet ? {
      trade_receivables_try: balanceSheet.assets.receivables_try,
      inventory_try:         balanceSheet.assets.inventory_try,
      total_assets_try:      balanceSheet.assets.total_assets_try,
      total_liabilities_try: balanceSheet.liabilities.total_liabilities_try,
      total_equity_try:      balanceSheet.equity.total_equity_try,
      is_balanced:           balanceSheet.balanced,
    } : null

    const hasGLEntries = (trialBalanceReport?.trial_balance.accounts.length ?? 0) > 0

    const shadowAudit =
      glSummary && glBSSummary && opBSSummary && hasGLEntries
        ? computeShadowAudit(opSummary, glSummary, glBSSummary, opBSSummary)
        : null

    const periodAudit = [{
      period_label: `${from} to ${to}`,
      period_id:    periodId,
      from_date:    from,
      to_date:      to,
      audit:        shadowAudit,
      note:         !shadowAudit
        ? glMode === 'shadow'
          ? 'No journal entries exist (gl_mode = shadow). Backfill required before comparison is meaningful.'
          : 'GL income statement or balance sheet unavailable for this period.'
        : undefined,
    }]

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 2: Divergence report
    // ────────────────────────────────────────────────────────────────────────────
    const divergence = computeDivergence(operational, journaledIds)
    const companyReport = computeCompanyDivergenceReport(companyId, 'Current Company', divergence)

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 3: Mismatch identification
    // ────────────────────────────────────────────────────────────────────────────
    const mismatches = identifyMismatches(divergence)

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 4: Remediation plan
    // ────────────────────────────────────────────────────────────────────────────
    const remediation = buildRemediationPlan(mismatches, divergence)

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 5: Trial balance integrity
    // ────────────────────────────────────────────────────────────────────────────
    const tbSummary: TrialBalanceSummary = {
      is_balanced:      trialBalanceReport?.trial_balance.is_balanced ?? false,
      imbalance_try:    trialBalanceReport?.trial_balance.imbalance_try ?? 0,
      can_close_period: trialBalanceReport?.can_close_period ?? false,
      total_debit_try:  trialBalanceReport?.trial_balance.total_debit_try ?? 0,
      total_credit_try: trialBalanceReport?.trial_balance.total_credit_try ?? 0,
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 6: Balance sheet equation integrity
    // ────────────────────────────────────────────────────────────────────────────
    const bsIntegrity = {
      is_balanced:   glBS?.is_balanced ?? false,
      imbalance_try: glBS?.imbalance_try ?? 0,
    }

    // ────────────────────────────────────────────────────────────────────────────
    // STEPS 7-9: Coverage checks
    // ────────────────────────────────────────────────────────────────────────────
    const coverageChecks = buildCoverageChecks(divergence)

    // ────────────────────────────────────────────────────────────────────────────
    // Cutover readiness (existing check infrastructure)
    // ────────────────────────────────────────────────────────────────────────────
    const backfillStatus = {
      backfill_complete: divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing === 0,
      missing: {
        sales:     divergence.sales.missing,
        expenses:  divergence.expenses.missing,
        purchases: divergence.purchases.missing,
      },
      total_missing: divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing,
    }

    const cutoverChecklist = shadowAudit
      ? computeCutoverReadiness(divergence, backfillStatus, tbSummary, bsIntegrity, shadowAudit)
      : null

    // ────────────────────────────────────────────────────────────────────────────
    // Warning classification
    // ────────────────────────────────────────────────────────────────────────────
    const warningClassifications = shadowAudit ? classifyWarningImpact(shadowAudit) : []

    // ────────────────────────────────────────────────────────────────────────────
    // STEP 10: Final decision
    // ────────────────────────────────────────────────────────────────────────────
    const confidence = computeConfidenceScore(
      coverageChecks,
      shadowAudit,
      { is_balanced: tbSummary.is_balanced },
      bsIntegrity,
    )

    const anyBlocking = coverageChecks.some(c => c.is_blocking)
      || !tbSummary.is_balanced
      || !bsIntegrity.is_balanced
      || (shadowAudit?.counts.critical ?? 0) > 0
      || !hasGLEntries

    const hasWarnings = (shadowAudit?.counts.warn ?? 0) > 0

    const decision = anyBlocking ? 'NO_GO'
      : hasWarnings ? 'GO_WITH_WARNINGS'
      : 'GO'

    const recommendation = produceFinalRecommendation(
      decision,
      confidence,
      mismatches,
      coverageChecks,
      warningClassifications,
    )

    const productionSteps = buildProductionSteps(
      decision,
      companyId,
      backfillStatus.total_missing > 0,
    )

    // ────────────────────────────────────────────────────────────────────────────
    // Response
    // ────────────────────────────────────────────────────────────────────────────
    return NextResponse.json({
      // Context
      gl_mode:            glMode,
      company_id:         companyId,
      audit_window:       { from, to, period_id: periodId },
      computed_at:        new Date().toISOString(),

      // Step 1
      step_1_shadow_audit:       periodAudit,

      // Step 2
      step_2_divergence:         companyReport,

      // Step 3
      step_3_mismatches:         mismatches,

      // Step 4
      step_4_remediation:        remediation,

      // Step 5
      step_5_trial_balance:      tbSummary,

      // Step 6
      step_6_balance_sheet:      bsIntegrity,

      // Steps 7-9
      step_7_9_coverage:         coverageChecks,

      // Step 10
      step_10_final: {
        decision,
        confidence_score:          confidence,
        recommendation,
        warning_classifications:   warningClassifications,
        production_steps:          productionSteps,
        cutover_checklist:         cutoverChecklist,
      },
    })
  } catch (err) {
    console.error('[admin/gl-readiness GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
