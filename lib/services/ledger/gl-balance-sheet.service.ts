// GL-based Balance Sheet — Assets = Liabilities + Equity
// Active in gl_primary mode. Invariant: |imbalance| < 0.01 TRY.

import { GeneralLedgerService } from './general-ledger.service'
import { round2 } from '@/lib/calc'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

export interface GLBalanceSheet {
  company_id:  string
  as_of:       string | null

  // Assets
  cash_try:                  number   // 100 + 102
  trade_receivables_try:     number   // 120
  inventory_try:             number   // 153
  deductible_vat_try:        number   // 191
  equipment_net_try:         number   // 253 - 257
  total_assets_try:          number

  // Liabilities
  trade_payables_try:        number   // 320
  partner_loans_st_try:      number   // 321
  payroll_payables_try:      number   // 335
  tax_payable_try:           number   // 360
  output_vat_try:            number   // 391
  partner_loans_lt_try:      number   // 421
  total_liabilities_try:     number

  // Equity
  paid_in_capital_try:       number   // 500 - 501
  legal_reserves_try:        number   // 542
  retained_earnings_try:     number   // 570
  accumulated_losses_try:    number   // 580
  current_period_profit_try: number   // 590
  total_equity_try:          number

  total_liabilities_equity_try: number

  // Integrity
  is_balanced:    boolean
  imbalance_try:  number
  computed_at:    string
  source:         'gl'
}

export class GLBalanceSheetService {
  static async compute(
    companyId: string,
    supabase:  AnySupabaseClient,
    options?:  { asOf?: string | null; periodId?: string | null },
  ): Promise<GLBalanceSheet> {
    const allCodes = [
      '100','102','120','153','191','253','257',
      '320','321','335','360','391','421',
      '500','501','542','570','580','590',
    ]

    const balances = await GeneralLedgerService.accountBalance(
      companyId, allCodes, supabase,
      { asOf: options?.asOf, periodId: options?.periodId },
    )

    const g = (code: string) => balances.get(code) ?? 0

    // Assets
    const cash           = round2(g('100') + g('102'))
    const receivables    = round2(g('120'))
    const inventory      = round2(g('153'))
    const dedVat         = round2(g('191'))
    const equipmentNet   = round2(g('253') - g('257'))
    const totalAssets    = round2(cash + receivables + inventory + dedVat + Math.max(0, equipmentNet))

    // Liabilities
    const tradePayables  = round2(g('320'))
    const partnerLoansST = round2(g('321'))
    const payrollPay     = round2(g('335'))
    const taxPay         = round2(g('360'))
    const outputVat      = round2(g('391'))
    const partnerLoansLT = round2(g('421'))
    const totalLiab      = round2(tradePayables + partnerLoansST + payrollPay + taxPay + outputVat + partnerLoansLT)

    // Equity
    const paidInCapital  = round2(g('500') - g('501'))
    const legalReserves  = round2(g('542'))
    const retained       = round2(g('570'))
    const accLosses      = round2(g('580'))
    const currentProfit  = round2(g('590'))
    const totalEquity    = round2(paidInCapital + legalReserves + retained - accLosses + currentProfit)

    const totalLiabEquity = round2(totalLiab + totalEquity)
    const imbalance       = round2(Math.abs(totalAssets - totalLiabEquity))

    return {
      company_id:                  companyId,
      as_of:                       options?.asOf ?? null,
      cash_try:                    cash,
      trade_receivables_try:       receivables,
      inventory_try:               inventory,
      deductible_vat_try:          dedVat,
      equipment_net_try:           equipmentNet,
      total_assets_try:            totalAssets,
      trade_payables_try:          tradePayables,
      partner_loans_st_try:        partnerLoansST,
      payroll_payables_try:        payrollPay,
      tax_payable_try:             taxPay,
      output_vat_try:              outputVat,
      partner_loans_lt_try:        partnerLoansLT,
      total_liabilities_try:       totalLiab,
      paid_in_capital_try:         paidInCapital,
      legal_reserves_try:          legalReserves,
      retained_earnings_try:       retained,
      accumulated_losses_try:      accLosses,
      current_period_profit_try:   currentProfit,
      total_equity_try:            totalEquity,
      total_liabilities_equity_try: totalLiabEquity,
      is_balanced:                 imbalance < 0.01,
      imbalance_try:               imbalance,
      computed_at:                 new Date().toISOString(),
      source:                      'gl',
    }
  }
}
