// GL-based Income Statement — derived from General Ledger account balances
// Source of truth in gl_primary mode; preview in parallel mode.

import { GeneralLedgerService } from './general-ledger.service'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface GLIncomeStatement {
  company_id:          string
  period_id?:          string | null
  from_date?:          string | null
  to_date?:            string | null

  // Revenue
  gross_revenue_try:   number
  cogs_try:            number
  gross_profit_try:    number
  gross_margin_pct:    number

  // Operating expenses
  payroll_try:         number
  rent_try:            number
  software_try:        number
  marketing_try:       number
  general_admin_try:   number
  total_opex_try:      number

  // EBITDA
  ebitda_try:          number
  ebitda_margin_pct:   number

  // Below EBITDA
  finance_expense_try: number
  other_income_try:    number
  ebt_try:             number

  // Tax (not in GL if KV not booked yet — best-effort)
  tax_try:             number
  net_income_try:      number
  net_margin_pct:      number

  computed_at:         string
  source:              'gl'
}

export class GLIncomeStatementService {
  static async compute(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  {
      periodId?:  string | null
      fromDate?:  string | null
      toDate?:    string | null
    },
  ): Promise<GLIncomeStatement> {
    const balances = await GeneralLedgerService.accountBalance(
      companyId,
      ['600', '620', '642', '649', '760', '770', '771', '772', '773', '780', '360', '590'],
      supabase,
      { periodId: options?.periodId, asOf: options?.toDate },
    )

    const revenue      = round2(balances.get('600') ?? 0)
    const cogs         = round2(balances.get('620') ?? 0)
    const grossProfit  = round2(revenue - cogs)

    const payroll      = round2(balances.get('771') ?? 0)
    const rent         = round2(balances.get('772') ?? 0)
    const software     = round2(balances.get('773') ?? 0)
    const marketing    = round2(balances.get('760') ?? 0)
    const generalAdmin = round2(balances.get('770') ?? 0)
    const totalOpex    = round2(payroll + rent + software + marketing + generalAdmin)

    const ebitda       = round2(grossProfit - totalOpex)
    const financeExp   = round2(balances.get('780') ?? 0)
    const otherIncome  = round2((balances.get('642') ?? 0) + (balances.get('649') ?? 0))
    const ebt          = round2(ebitda - financeExp + otherIncome)

    // Tax payable from 360 account (if booked)
    const taxBooked    = round2(balances.get('360') ?? 0)
    const netIncome    = round2(ebt - taxBooked)

    return {
      company_id:          companyId,
      period_id:           options?.periodId ?? null,
      from_date:           options?.fromDate ?? null,
      to_date:             options?.toDate   ?? null,
      gross_revenue_try:   revenue,
      cogs_try:            cogs,
      gross_profit_try:    grossProfit,
      gross_margin_pct:    revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
      payroll_try:         payroll,
      rent_try:            rent,
      software_try:        software,
      marketing_try:       marketing,
      general_admin_try:   generalAdmin,
      total_opex_try:      totalOpex,
      ebitda_try:          ebitda,
      ebitda_margin_pct:   revenue > 0 ? round2((ebitda / revenue) * 100) : 0,
      finance_expense_try: financeExp,
      other_income_try:    otherIncome,
      ebt_try:             ebt,
      tax_try:             taxBooked,
      net_income_try:      netIncome,
      net_margin_pct:      revenue > 0 ? round2((netIncome / revenue) * 100) : 0,
      computed_at:         new Date().toISOString(),
      source:              'gl',
    }
  }
}
