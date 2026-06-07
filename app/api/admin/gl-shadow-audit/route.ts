// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/admin/gl-shadow-audit
//
// Faz 9-C shadow validation audit endpoint.
//
// Fetches both operational-table financials and GL-account financials for the
// same period, then delegates to computeShadowAudit() for a pure field-level
// comparison. Also runs computeCutoverReadiness() and computeDivergence()
// to produce a unified cutover package response.
//
// Role guard: admin only.
//
// Query params:
//   from    (required) YYYY-MM-DD
//   to      (required) YYYY-MM-DD
//   period_id (optional) — accounting period UUID for GL queries
// ═══════════════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse }              from 'next/server'
import { requireAdmin }                           from '@/lib/require-role'
import { AppError }                               from '@/types/errors'
import { resolveApiAuth }                         from '@/lib/api-auth'
import { getSystemAdminClient }                   from '@/lib/admin-db'
import { getGlMode }                              from '@/lib/middleware/period-guard'
import { FinanceService }                         from '@/lib/services/finance.service'
import { purchaseTotalTry }                        from '@/lib/finance/purchase-total'
import { TaxService }                             from '@/lib/services/tax.service'
import { BalanceSheetService }                    from '@/lib/services/balance-sheet.service'
import { GLIncomeStatementService }               from '@/lib/services/ledger/gl-income-statement.service'
import { GLBalanceSheetService }                  from '@/lib/services/ledger/gl-balance-sheet.service'
import { TrialBalanceService }                    from '@/lib/services/ledger/trial-balance.service'
import { computeDivergence }                      from '@/lib/admin/gl-divergence'
import { computeShadowAudit }                     from '@/lib/admin/gl-shadow-audit'
import { computeCutoverReadiness }                from '@/lib/admin/gl-cutover-readiness'
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

// ── Data-fetch helpers ────────────────────────────────────────────────────────

async function fetchOperationalRecords(
  supabase:  AnySupabaseClient,
  companyId: string,
): Promise<{ sales: OperationalRecord[]; expenses: OperationalRecord[]; purchases: OperationalRecord[] }> {
  const [salesRes, expensesRes, purchasesRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total_try')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('expenses')
      .select('id, amount_try')
      .eq('company_id', companyId)
      .is('deleted_at', null),
    supabase
      .from('purchases')
      // no total column — compute from line items (fx_rate × Σ qty × unit_price)
      .select('id, fx_rate, purchase_items(quantity, unit_price)')
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  return {
    sales:     ((salesRes.data ?? []) as Array<{ id: string; total_try: number | null }>)
                 .map(r => ({ id: r.id, amount_try: r.total_try ?? 0 })),
    expenses:  ((expensesRes.data ?? []) as Array<{ id: string; amount_try: number | null }>)
                 .map(r => ({ id: r.id, amount_try: r.amount_try ?? 0 })),
    purchases: ((purchasesRes.data ?? []) as Array<{ id: string; fx_rate: number | null; purchase_items: Array<{ quantity: number | null; unit_price: number | null }> | null }>)
                 .map(r => ({ id: r.id, amount_try: purchaseTotalTry(r) })),
  }
}

async function fetchJournaledIds(
  adminClient: AnySupabaseClient,
  companyId:   string,
): Promise<JournaledRef[]> {
  const { data } = await adminClient
    .from('journal_entries')
    .select('source_type, source_id')
    .eq('company_id', companyId)
  return (data ?? []) as JournaledRef[]
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveApiAuth(req)
    if (!auth.ok) return auth.response
    const { uid, companyId, supabase } = auth

    try { await requireAdmin(uid, companyId, supabase) }
    catch (e) {
      if (e instanceof AppError && e.code === 'FORBIDDEN') {
        return NextResponse.json({ error: e.message, code: 'FORBIDDEN' }, { status: 403 })
      }
      throw e
    }

    const url      = new URL(req.url)
    const from     = url.searchParams.get('from')
    const to       = url.searchParams.get('to')
    const periodId = url.searchParams.get('period_id') || null

    if (!from || !to) {
      return NextResponse.json(
        { error: 'Required query params: from (YYYY-MM-DD), to (YYYY-MM-DD)' },
        { status: 400 },
      )
    }

    const period = { from, to }
    const adminClient = getSystemAdminClient()

    // ── Parallel data fetch ───────────────────────────────────────────────────
    const [
      glMode,
      financialSummary,
      vatData,
      balanceSheet,
      glIS,
      glBS,
      trialBalance,
      operationalRecords,
      journaledIds,
    ] = await Promise.all([
      getGlMode(companyId, supabase),
      FinanceService.getFinancialSummary(uid, companyId, period).catch(() => null),
      TaxService.getKdvNet(uid, companyId, period, undefined, supabase).catch(() => null),
      BalanceSheetService.compute(uid, companyId, to, supabase).catch(() => null),
      GLIncomeStatementService.compute(companyId, adminClient, { fromDate: from, toDate: to, periodId }).catch(() => null),
      GLBalanceSheetService.compute(companyId, adminClient, { asOf: to, periodId }).catch(() => null),
      TrialBalanceService.compute(companyId, adminClient, { periodId, asOf: to }).catch(() => null),
      fetchOperationalRecords(supabase, companyId),
      fetchJournaledIds(adminClient, companyId),
    ])

    // ── Build shadow audit inputs ─────────────────────────────────────────────

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

    // ── Divergence summary ────────────────────────────────────────────────────
    const divergence = computeDivergence(operationalRecords, journaledIds)

    // ── Shadow audit (only meaningful when GL has entries) ────────────────────
    const shadowAudit =
      glSummary && glBSSummary && opBSSummary && (trialBalance?.trial_balance.accounts.length ?? 0) > 0
        ? computeShadowAudit(opSummary, glSummary, glBSSummary, opBSSummary)
        : null

    // ── Trial balance summary ─────────────────────────────────────────────────
    const tbSummary: TrialBalanceSummary = {
      is_balanced:      trialBalance?.trial_balance.is_balanced ?? false,
      imbalance_try:    trialBalance?.trial_balance.imbalance_try ?? 0,
      can_close_period: trialBalance?.can_close_period ?? false,
      total_debit_try:  trialBalance?.trial_balance.total_debit_try ?? 0,
      total_credit_try: trialBalance?.trial_balance.total_credit_try ?? 0,
    }

    // ── Cutover readiness ─────────────────────────────────────────────────────
    const readiness = shadowAudit
      ? computeCutoverReadiness(
          divergence,
          {
            backfill_complete: divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing === 0,
            missing: {
              sales:     divergence.sales.missing,
              expenses:  divergence.expenses.missing,
              purchases: divergence.purchases.missing,
            },
            total_missing: divergence.sales.missing + divergence.expenses.missing + divergence.purchases.missing,
          },
          tbSummary,
          { is_balanced: glBSSummary?.is_balanced ?? false, imbalance_try: glBSSummary?.imbalance_try ?? 0 },
          shadowAudit,
        )
      : null

    return NextResponse.json({
      gl_mode:        glMode,
      period:         { from, to, period_id: periodId },
      divergence,
      shadow_audit:   shadowAudit,
      trial_balance:  tbSummary,
      cutover_readiness: readiness,
      computed_at:    new Date().toISOString(),
      note: !glSummary
        ? 'GL income statement unavailable — possibly no journal entries exist yet (gl_mode = shadow). Advance to parallel mode and re-run.'
        : undefined,
    })
  } catch (err) {
    console.error('[admin/gl-shadow-audit GET]', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'Sunucu hatası' }, { status: 500 })
  }
}
