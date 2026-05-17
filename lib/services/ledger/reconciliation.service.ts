// Reconciliation Service — compares GL-derived balances with operational tables
// Runs after backfill and before period close to validate GL integrity.

import { GeneralLedgerService } from './general-ledger.service'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface ReconciliationItem {
  name:         string
  gl_value:     number
  operational:  number
  diff:         number
  passed:       boolean
  severity:     'ok' | 'warning' | 'critical'
}

export interface ReconciliationReport {
  company_id:    string
  period_id?:    string | null
  items:         ReconciliationItem[]
  is_reconciled: boolean
  checked_at:    string
}

const WARN_THRESHOLD     = 1      // TRY
const CRITICAL_THRESHOLD = 100    // TRY

function classify(diff: number): 'ok' | 'warning' | 'critical' {
  if (diff < WARN_THRESHOLD)     return 'ok'
  if (diff < CRITICAL_THRESHOLD) return 'warning'
  return 'critical'
}

export class ReconciliationService {
  static async check(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  { periodId?: string | null; asOf?: string | null },
  ): Promise<ReconciliationReport> {
    const [glBalances, operationalData] = await Promise.all([
      GeneralLedgerService.accountBalance(
        companyId,
        ['102', '120', '320', '321', '391', '191', '600'],
        supabase,
        options,
      ),
      ReconciliationService.fetchOperationalTotals(companyId, supabase, options),
    ])

    const items: ReconciliationItem[] = []

    // 1. Receivables: GL 120 vs unpaid sales balance
    const gl120  = glBalances.get('120') ?? 0
    const opRec  = operationalData.unpaid_sales_try
    const diff1  = round2(Math.abs(gl120 - opRec))
    items.push({
      name:        '120 Alıcılar vs Açık Satış Bakiyesi',
      gl_value:    gl120,
      operational: opRec,
      diff:        diff1,
      passed:      diff1 < CRITICAL_THRESHOLD,
      severity:    classify(diff1),
    })

    // 2. Trade payables: GL 320 vs unpaid expense balance
    const gl320  = glBalances.get('320') ?? 0
    const opPay  = operationalData.unpaid_expenses_try
    const diff2  = round2(Math.abs(gl320 - opPay))
    items.push({
      name:        '320 Satıcılar vs Açık Masraf Bakiyesi',
      gl_value:    gl320,
      operational: opPay,
      diff:        diff2,
      passed:      diff2 < CRITICAL_THRESHOLD,
      severity:    classify(diff2),
    })

    // 3. Revenue: GL 600 vs total sales revenue
    const gl600  = glBalances.get('600') ?? 0
    const opRev  = operationalData.total_revenue_try
    const diff3  = round2(Math.abs(gl600 - opRev))
    items.push({
      name:        '600 Satışlar vs Operasyonel Gelir',
      gl_value:    gl600,
      operational: opRev,
      diff:        diff3,
      passed:      diff3 < CRITICAL_THRESHOLD,
      severity:    classify(diff3),
    })

    // 4. Output VAT: GL 391 vs sum of VAT on sales
    const gl391  = glBalances.get('391') ?? 0
    const opVat  = operationalData.total_output_vat_try
    const diff4  = round2(Math.abs(gl391 - opVat))
    items.push({
      name:        '391 Hesaplanan KDV vs Satış KDV Toplamı',
      gl_value:    gl391,
      operational: opVat,
      diff:        diff4,
      passed:      diff4 < CRITICAL_THRESHOLD,
      severity:    classify(diff4),
    })

    const isReconciled = items.every(i => i.severity !== 'critical')

    return {
      company_id:    companyId,
      period_id:     options?.periodId ?? null,
      items,
      is_reconciled: isReconciled,
      checked_at:    new Date().toISOString(),
    }
  }

  private static async fetchOperationalTotals(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  { periodId?: string | null; asOf?: string | null },
  ) {
    const asOf = options?.asOf ?? new Date().toISOString().slice(0, 10)

    const [salesRes, expensesRes] = await Promise.all([
      supabase
        .from('sales')
        // kdv_amount_try is already in TRY — no FX conversion needed
        .select('total_try, amount_paid, kdv_amount_try')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('sale_date', asOf),
      supabase
        .from('expenses')
        // expenses have no partial amount; use payment_status to determine unpaid
        .select('amount_try, payment_status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .lte('expense_date', asOf),
    ])

    const sales    = (salesRes.data    ?? []) as Array<{ total_try: number; amount_paid: number | null; kdv_amount_try: number }>
    const expenses = (expensesRes.data ?? []) as Array<{ amount_try: number; payment_status: string | null }>

    // revenue_try (net ex-KDV in TRY) = total_try − kdv_amount_try
    const totalRevenue   = round2(sales.reduce((s, r) =>
      s + Math.max(0, (Number(r.total_try) || 0) - (Number(r.kdv_amount_try) || 0)), 0))
    const totalOutputVat = round2(sales.reduce((s, r) =>
      s + (Number(r.kdv_amount_try) || 0), 0))
    const unpaidSales    = round2(sales.reduce((s, r) =>
      s + Math.max(0, (Number(r.total_try) || 0) - (Number(r.amount_paid) || 0)), 0))
    // expenses: unpaid = all non-paid entries (no partial tracking for expenses)
    const unpaidExpenses = round2(expenses.reduce((s, r) =>
      r.payment_status === 'paid' ? s : s + (Number(r.amount_try) || 0), 0))

    return {
      total_revenue_try:    totalRevenue,
      total_output_vat_try: totalOutputVat,
      unpaid_sales_try:     unpaidSales,
      unpaid_expenses_try:  unpaidExpenses,
    }
  }
}
