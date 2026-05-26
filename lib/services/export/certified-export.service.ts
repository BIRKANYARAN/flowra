// ─────────────────────────────────────────────────────────────────────────────
// lib/services/export/certified-export.service.ts
//
// Assembles a certified financial data export package for auditors and
// accountants. Includes a SHA-256 checksum for data integrity verification.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'
import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FinanceService } from '@/lib/services/finance.service'
import { BalanceSheetService } from '@/lib/services/balance-sheet.service'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any>

export interface CertifiedExportPackage {
  manifest: {
    export_id: string
    company_id: string
    company_name: string
    generated_by: string
    generated_at: string
    period_from: string
    period_to: string
    sections: string[]
    record_counts: Record<string, number>
    checksum: string
    flowra_version: string
    disclaimer: string
  }
  financial_summary: {
    period_label: string
    revenue_try: number
    cogs_try: number
    gross_profit_try: number
    expenses_try: number
    net_income_try: number
    cash_try: number
  }
  balance_sheet: object
  partner_summary: {
    partners: Array<{
      partner_id: string
      partner_name: string
      share_ratio_pct: number
      loan_outstanding_try: number
    }>
    total_partner_debt_try: number
    total_partners: number
    active_partners: number
  }
  receivables_summary: {
    total_receivables_try: number
    overdue_receivables_try: number
    receivables_by_status: Record<string, number>
  }
  corporate_actions_summary: {
    total_actions: number
    actions_by_type: Record<string, number>
    latest_action_date: string | null
  }
  governance_summary: {
    open_workflows: number
    pending_resolutions: number
    audit_readiness_score: number | null
  }
  raw_data: {
    sales: Array<{
      id: string
      sale_date: string
      total_try: number
      payment_status: string
      customer_name: string | null
    }>
    expenses: Array<{
      id: string
      expense_date: string
      amount_try: number
      payment_status: string
      expense_type: string
    }>
  }
}

export class CertifiedExportService {
  static async generate(
    userId: string,
    companyId: string,
    periodFrom: string,
    periodTo: string,
    supabase: AnyClient,
  ): Promise<CertifiedExportPackage> {
    const exportId = randomUUID()
    const generatedAt = new Date().toISOString()
    const period = { from: periodFrom, to: periodTo }

    // ── Fetch company name ────────────────────────────────────────────────────
    const { data: companyData } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .single()
    const companyName: string = companyData?.name ?? 'Şirket'

    // ── Parallel data fetches ─────────────────────────────────────────────────
    const [
      financialSummaryResult,
      balanceSheetResult,
      partnersResult,
      tranchesResult,
      salesResult,
      expensesResult,
      corporateActionsResult,
      workflowsResult,
      resolutionsResult,
    ] = await Promise.allSettled([
      FinanceService.getFinancialSummary(userId, companyId, period, undefined, undefined, supabase),
      BalanceSheetService.compute(userId, companyId, periodTo, supabase),
      supabase
        .from('partners')
        .select('id, name, share_ratio, is_active')
        .eq('company_id', companyId)
        .is('deleted_at', null),
      supabase
        .from('partner_loan_tranches')
        .select('partner_id, outstanding_try, status')
        .eq('company_id', companyId)
        .neq('status', 'repaid'),
      supabase
        .from('sales')
        .select('id, sale_date, total_try:total, payment_status, customer_name')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('sale_date', periodFrom)
        .lte('sale_date', periodTo)
        .order('sale_date', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, expense_date, amount_try, payment_status, expense_type, category')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('expense_date', periodFrom)
        .lte('expense_date', periodTo)
        .order('expense_date', { ascending: false }),
      supabase
        .from('corporate_actions')
        .select('id, action_type, action_date')
        .eq('company_id', companyId)
        .order('action_date', { ascending: false }),
      supabase
        .from('workflow_instances')
        .select('id, status')
        .eq('company_id', companyId)
        .in('status', ['pending', 'active', 'in_review']),
      supabase
        .from('governance_resolutions')
        .select('id, status')
        .eq('company_id', companyId)
        .in('status', ['draft']),
    ])

    const fs = financialSummaryResult.status === 'fulfilled' ? financialSummaryResult.value : null
    const bs = balanceSheetResult.status === 'fulfilled' ? balanceSheetResult.value : {}
    const partnerRows = partnersResult.status === 'fulfilled' ? (partnersResult.value.data ?? []) : []
    const trancheRows = tranchesResult.status === 'fulfilled' ? (tranchesResult.value.data ?? []) : []
    const salesRows = salesResult.status === 'fulfilled' ? (salesResult.value.data ?? []) : []
    const expenseRows = expensesResult.status === 'fulfilled' ? (expensesResult.value.data ?? []) : []
    const actionRows = corporateActionsResult.status === 'fulfilled' ? (corporateActionsResult.value.data ?? []) : []
    const workflowRows = workflowsResult.status === 'fulfilled' ? (workflowsResult.value.data ?? []) : []
    const resolutionRows = resolutionsResult.status === 'fulfilled' ? (resolutionsResult.value.data ?? []) : []

    // ── Build financial_summary ───────────────────────────────────────────────
    const cashTry = bs && 'assets' in bs ? (bs as { assets?: { cash_try?: number } }).assets?.cash_try ?? 0 : 0
    const financialSummary = {
      period_label: `${periodFrom} – ${periodTo}`,
      revenue_try: fs?.revenue_try ?? 0,
      cogs_try: fs?.cost_try ?? 0,
      gross_profit_try: fs?.gross_profit_try ?? 0,
      expenses_try: fs?.expenses_total_try ?? 0,
      net_income_try: fs?.net_after_tax_try ?? 0,
      cash_try: cashTry,
    }

    // ── Build partner_summary ─────────────────────────────────────────────────
    const partners = partnerRows.map((p: { id: string; name: string; share_ratio: number; is_active: boolean }) => {
      const loanOutstanding = trancheRows
        .filter((t: { partner_id: string; outstanding_try: number }) => t.partner_id === p.id)
        .reduce((sum: number, t: { outstanding_try: number }) => sum + Number(t.outstanding_try ?? 0), 0)
      return {
        partner_id: String(p.id),
        partner_name: String(p.name),
        share_ratio_pct: Number(p.share_ratio ?? 0) * 100,
        loan_outstanding_try: loanOutstanding,
      }
    })
    const totalPartnerDebt = trancheRows.reduce(
      (sum: number, t: { outstanding_try: number }) => sum + Number(t.outstanding_try ?? 0), 0
    )
    const partnerSummary = {
      partners,
      total_partner_debt_try: totalPartnerDebt,
      total_partners: partnerRows.length,
      active_partners: partnerRows.filter((p: { is_active: boolean }) => p.is_active).length,
    }

    // ── Build receivables_summary ─────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    const allSalesForReceivables = salesResult.status === 'fulfilled'
      ? (salesResult.value.data ?? [])
      : []

    // Fetch all open receivables (not limited to period)
    const { data: openSalesData } = await supabase
      .from('sales')
      .select('total_try:total, paid_amount, due_date, payment_status')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('payment_status', ['pending', 'partial', 'overdue'])

    const openSales = openSalesData ?? []
    const totalReceivables = openSales.reduce(
      (sum: number, r: { total_try: number; paid_amount: number }) =>
        sum + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0
    )
    const overdueReceivables = openSales
      .filter((r: { due_date: string | null; payment_status: string }) =>
        r.payment_status === 'overdue' || (r.due_date && String(r.due_date) < today)
      )
      .reduce(
        (sum: number, r: { total_try: number; paid_amount: number }) =>
          sum + Math.max(0, Number(r.total_try ?? 0) - Number(r.paid_amount ?? 0)), 0
      )

    const receivablesByStatus: Record<string, number> = {}
    for (const r of openSales) {
      const status = String(r.payment_status ?? 'unknown')
      receivablesByStatus[status] = (receivablesByStatus[status] ?? 0) + 1
    }
    const receivablesSummary = {
      total_receivables_try: totalReceivables,
      overdue_receivables_try: overdueReceivables,
      receivables_by_status: receivablesByStatus,
    }

    // ── Build corporate_actions_summary ───────────────────────────────────────
    const actionsByType: Record<string, number> = {}
    for (const a of actionRows) {
      const type = String(a.action_type ?? 'unknown')
      actionsByType[type] = (actionsByType[type] ?? 0) + 1
    }
    const corporateActionsSummary = {
      total_actions: actionRows.length,
      actions_by_type: actionsByType,
      latest_action_date: actionRows.length > 0 ? String(actionRows[0].action_date) : null,
    }

    // ── Build governance_summary ──────────────────────────────────────────────
    // Fetch audit readiness score
    const { data: auditData } = await supabase
      .from('audit_readiness_checks')
      .select('score')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const governanceSummary = {
      open_workflows: workflowRows.length,
      pending_resolutions: resolutionRows.length,
      audit_readiness_score: auditData?.score ?? null,
    }

    // ── Build raw_data ────────────────────────────────────────────────────────
    const rawSales = salesRows.map((s: {
      id: string
      sale_date: string
      total_try: number
      payment_status: string
      customer_name: string | null
    }) => ({
      id: String(s.id),
      sale_date: String(s.sale_date),
      total_try: Number(s.total_try ?? 0),
      payment_status: String(s.payment_status ?? ''),
      customer_name: s.customer_name ? String(s.customer_name) : null,
    }))

    const rawExpenses = expenseRows.map((e: {
      id: string
      expense_date: string
      amount_try: number
      payment_status: string
      expense_type: string | null
      category: string | null
    }) => ({
      id: String(e.id),
      expense_date: String(e.expense_date),
      amount_try: Number(e.amount_try ?? 0),
      payment_status: String(e.payment_status ?? ''),
      expense_type: String(e.expense_type ?? e.category ?? 'general'),
    }))

    const rawData = {
      sales: rawSales,
      expenses: rawExpenses,
    }

    // ── Build sections list ───────────────────────────────────────────────────
    const sections = [
      'financial_summary',
      'balance_sheet',
      'partner_summary',
      'receivables_summary',
      'corporate_actions_summary',
      'governance_summary',
      'raw_data',
    ]

    // ── Record counts ─────────────────────────────────────────────────────────
    const recordCounts: Record<string, number> = {
      sales: rawSales.length,
      expenses: rawExpenses.length,
      partners: partners.length,
      corporate_actions: actionRows.length,
      open_receivables: openSales.length,
    }

    // ── Checksum ──────────────────────────────────────────────────────────────
    const dataForChecksum = {
      financial_summary: financialSummary,
      balance_sheet: bs,
      partner_summary: partnerSummary,
      receivables_summary: receivablesSummary,
      corporate_actions_summary: corporateActionsSummary,
      governance_summary: governanceSummary,
      raw_data: rawData,
    }
    const checksum = createHash('sha256')
      .update(JSON.stringify(dataForChecksum))
      .digest('hex')

    // ── Disclaimer ────────────────────────────────────────────────────────────
    const formattedDate = new Date(generatedAt).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    const disclaimer = `Bu dışa aktarma, ${companyName} adına Flowra Finansal İşletim Sistemi tarafından ${formattedDate} tarihinde oluşturulmuştur. Veriler, belirtilen dönem için sistem kayıtlarını yansıtmaktadır. Bu dışa aktarma bağımsız bir denetim yerine geçmez.`

    // ── Assemble manifest ─────────────────────────────────────────────────────
    const manifest = {
      export_id: exportId,
      company_id: companyId,
      company_name: companyName,
      generated_by: userId,
      generated_at: generatedAt,
      period_from: periodFrom,
      period_to: periodTo,
      sections,
      record_counts: recordCounts,
      checksum,
      flowra_version: '1.0',
      disclaimer,
    }

    // Suppress unused variable warning
    void allSalesForReceivables

    return {
      manifest,
      financial_summary: financialSummary,
      balance_sheet: bs,
      partner_summary: partnerSummary,
      receivables_summary: receivablesSummary,
      corporate_actions_summary: corporateActionsSummary,
      governance_summary: governanceSummary,
      raw_data: rawData,
    }
  }

  /**
   * Compute checksum for a set of data sections (used for verification).
   * Deterministic: same input always produces same output.
   */
  static computeChecksum(data: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(data)).digest('hex')
  }
}
