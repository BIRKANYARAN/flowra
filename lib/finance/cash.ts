// ------------------------------------------------------------
// lib/finance/cash.ts
//
// Cash-basis financial formulas used by dashboard and /api/cash-distributable.
// No COGS proxy is used here. Cash is based only on received payments minus
// expenses whose own payment_status says they were actually paid.
// ------------------------------------------------------------

import { round2 } from '@/lib/calc'

export interface CashPositionInput {
  paymentsReceived: number
  paidExpenses:     number
  unpaidExpenses:   number
}

export interface CashPositionResult {
  cashBalance:            number
  outstandingObligations: number
  cashDistributable:      number
}

export function computeCashPosition(input: CashPositionInput): CashPositionResult {
  const cashBalance = round2(input.paymentsReceived - input.paidExpenses)
  const outstandingObligations = round2(input.unpaidExpenses)
  const cashDistributable = round2(Math.max(0, cashBalance - outstandingObligations))

  return {
    cashBalance,
    outstandingObligations,
    cashDistributable,
  }
}
