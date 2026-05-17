// ─────────────────────────────────────────────────────────────────────────────
// lib/finance/cfo-metrics.ts
//
// Pure kernel for CFO-grade financial metrics.
// No DB access, no I/O — all inputs are pre-fetched by the API route.
//
// Core financial separation principle:
//   OPERATIONAL  — salaries, huzur hakkı, rent, utilities, logistics, tax,
//                  software, marketing, supplier costs, interest
//   FINANCING    — partner loans, capital injections, internal transfers
//   EQUITY       — capital contributions, dividend distributions
//
// These MUST NEVER mix when computing cash burn or profitability metrics.
// ─────────────────────────────────────────────────────────────────────────────

export const OPERATIONAL_EXPENSE_TYPES = new Set([
  'operational',
  'fixed',
  'variable',
  'tax',
  'financial',    // interest — is a real operational cost (not financing inflow)
  'capital',      // capex — cash outflow; excluded from burn but counted as cash out
  'other',
])

export const FINANCING_EXPENSE_TYPES = new Set([
  'partner_financing',
  'loan_repayment',
  'dividend',
  'internal_transfer',
])

// Burn = only pure operational recurring costs; capex excluded from monthly avg
export const BURN_EXPENSE_TYPES = new Set(['operational', 'fixed', 'variable', 'tax', 'financial'])

import { round2 } from '@/lib/calc'
import { computeCorporateTax } from '@/lib/services/tax.service'

// ─────────────────────────────────────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────────────────────────────────────

export interface CashInputs {
  allTimeReceived:       number   // Σ paid sales amount_try (all time)
  allTimePaidExpenses:   Array<{ amount_try: number; expense_type: string | null }>
  unpaidExpenses:        Array<{ amount_try: number; expense_type?: string | null }>
  periodReceived:        number   // Σ paid sales in current period
  periodPaidExpenses:    Array<{ amount_try: number; expense_type: string | null }>
  trailingBurnExpenses:  Array<{ amount_try: number }>  // 3-month trailing paid burn expenses
  trailingMonths:        number   // denominator for avg (default 3)
}

export interface ReceivableInputs {
  periodInvoiced:  number
  periodCollected: number
  outstanding:     Array<{ amount_try: number; sale_date: string; due_date?: string | null; amount_paid?: number | null }>
  today:           string  // ISO YYYY-MM-DD
}

export interface TaxInputs {
  kdvNet:               number   // net VAT (sales - purchase - expense)
  accountingProfit:     number   // revenue - FIFO_cogs - operational_expenses
  taxRate:              number   // e.g. 25
}

export interface PartnerInputs {
  transactions: Array<{ tx_type: string; amount_try: number }>
}

export interface StockInputs {
  lots: Array<{ qty_remaining: number; entry_cost_try: number }>
  monthlyBurn: number  // for coverage ratio
}

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface CfoMetrics {
  cash: {
    true_cash_position:    number   // all-time received - all-time paid (operational)
    operational_cash:      number   // period received - period paid (operational)
    restricted_cash:       number   // unpaid expense obligations (non-financing)
    distributable_cash:    number   // max(0, true_cash - restricted)
  }
  burn: {
    monthly_burn_rate:     number   // trailing avg operational burn
    runway_months:         number | null
    runway_days:           number | null
    cash_exhaustion_date:  string | null  // ISO date or null if runway is infinite
  }
  receivables: {
    total_outstanding:    number
    overdue_30d:          number
    overdue_60d:          number
    overdue_90d:          number
    collection_rate_pct:  number   // 0–100
  }
  tax: {
    kdv_net:                   number   // > 0 = payable; < 0 = carry forward
    corporate_tax_estimate:    number   // YTD estimate
    total_fiscal_obligation:   number   // kdv_payable + tax_estimate
  }
  partner: {
    total_equity:        number   // Σ capital_in
    total_loans:         number   // Σ net loans (loan_in - repaid)
    total_dividends:     number   // Σ dividends distributed
    company_owes:        number   // equity + net_loans (what company owes partners)
  }
  stock: {
    fifo_value:        number
    coverage_months:   number | null   // fifo_value / monthly_burn
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kernel functions
// ─────────────────────────────────────────────────────────────────────────────

export function computeCashMetrics(i: CashInputs): CfoMetrics['cash'] & { monthly_burn_rate: number } {
  const allTimePaidOp = i.allTimePaidExpenses.reduce((s, e) => {
    if (!FINANCING_EXPENSE_TYPES.has(e.expense_type ?? '')) s += Number(e.amount_try)
    return s
  }, 0)

  const periodPaidOp = i.periodPaidExpenses.reduce((s, e) => {
    if (!FINANCING_EXPENSE_TYPES.has(e.expense_type ?? '')) s += Number(e.amount_try)
    return s
  }, 0)

  const restrictedCash = i.unpaidExpenses.reduce((s, e) => {
    if (!FINANCING_EXPENSE_TYPES.has(e.expense_type ?? '')) s += Number(e.amount_try)
    return s
  }, 0)

  const trueCash       = round2(i.allTimeReceived - allTimePaidOp)
  const operationalCash = round2(i.periodReceived - periodPaidOp)
  const restricted      = round2(restrictedCash)
  const distributable   = round2(Math.max(0, trueCash - restricted))

  const trailingBurn  = i.trailingBurnExpenses.reduce((s, e) => s + Number(e.amount_try), 0)
  const monthlyBurn   = round2(trailingBurn / Math.max(i.trailingMonths, 1))

  return {
    true_cash_position:  trueCash,
    operational_cash:    operationalCash,
    restricted_cash:     restricted,
    distributable_cash:  distributable,
    monthly_burn_rate:   monthlyBurn,
  }
}

export function computeBurnMetrics(
  distributableCash: number,
  monthlyBurn: number,
  today: string,
): CfoMetrics['burn'] {
  if (monthlyBurn <= 0) {
    return {
      monthly_burn_rate:    0,
      runway_months:        null,
      runway_days:          null,
      cash_exhaustion_date: null,
    }
  }

  const runwayMonths = round2(distributableCash / monthlyBurn)
  const runwayDays   = Math.round(runwayMonths * 30.44)

  let exhaustionDate: string | null = null
  if (distributableCash > 0 && monthlyBurn > 0) {
    const ex = new Date(today + 'T00:00:00Z')
    ex.setUTCDate(ex.getUTCDate() + runwayDays)
    exhaustionDate = ex.toISOString().slice(0, 10)
  } else if (distributableCash <= 0) {
    exhaustionDate = today
  }

  return {
    monthly_burn_rate:    monthlyBurn,
    runway_months:        runwayMonths,
    runway_days:          runwayDays,
    cash_exhaustion_date: exhaustionDate,
  }
}

export function computeReceivableMetrics(i: ReceivableInputs): CfoMetrics['receivables'] {
  const d30 = new Date(i.today + 'T00:00:00Z')
  d30.setUTCDate(d30.getUTCDate() - 30)
  const d60 = new Date(i.today + 'T00:00:00Z')
  d60.setUTCDate(d60.getUTCDate() - 60)
  const d90 = new Date(i.today + 'T00:00:00Z')
  d90.setUTCDate(d90.getUTCDate() - 90)

  const iso30 = d30.toISOString().slice(0, 10)
  const iso60 = d60.toISOString().slice(0, 10)
  const iso90 = d90.toISOString().slice(0, 10)

  let total = 0, over30 = 0, over60 = 0, over90 = 0
  for (const r of i.outstanding) {
    // Net outstanding per row — subtract any partial payment
    const amt = round2(Math.max(0, Number(r.amount_try) - Number(r.amount_paid ?? 0)))
    if (amt <= 0) continue
    total += amt
    // Use due_date for aging if set; fall back to sale_date (business invoice date)
    const agingDate = (r.due_date ? String(r.due_date) : String(r.sale_date)).slice(0, 10)
    if (agingDate < iso30) over30 += amt
    if (agingDate < iso60) over60 += amt
    if (agingDate < iso90) over90 += amt
  }

  const collectionRate =
    i.periodInvoiced > 0
      ? Math.min(100, round2((i.periodCollected / i.periodInvoiced) * 100))
      : 100

  return {
    total_outstanding:   round2(total),
    overdue_30d:         round2(over30),
    overdue_60d:         round2(over60),
    overdue_90d:         round2(over90),
    collection_rate_pct: collectionRate,
  }
}

export function computeTaxMetrics(i: TaxInputs): CfoMetrics['tax'] {
  // Delegate to the canonical engine — single code path for corporate tax.
  // accountingProfit is already (revenue - costs); we pass it as revenue
  // with cost=0 so computeCorporateTax computes the same matrah.
  const corpTax = computeCorporateTax({
    revenue_try:             Math.max(0, i.accountingProfit),
    cost_try:                0,
    deductible_expenses_try: 0,
    rate_percent:            i.taxRate,
  })
  const kdvPayable = round2(Math.max(0, i.kdvNet))

  return {
    kdv_net:                 round2(i.kdvNet),
    corporate_tax_estimate:  corpTax.tax_try,
    total_fiscal_obligation: round2(kdvPayable + corpTax.tax_try),
  }
}

export function computePartnerMetrics(i: PartnerInputs): CfoMetrics['partner'] {
  let equity = 0, loaned = 0, repaid = 0, dividends = 0

  for (const tx of i.transactions) {
    const amt = Number(tx.amount_try)
    switch (tx.tx_type) {
      case 'capital_in':      equity   += amt; break
      case 'loan_to_company': loaned   += amt; break
      case 'loan_in':         loaned   += amt; break   // legacy alias
      case 'loan_repayment':  repaid   += amt; break
      case 'loan_out':        repaid   += amt; break   // legacy alias
      case 'dividend':        dividends += amt; break
    }
  }

  const netLoans   = round2(loaned - repaid)
  const companyOwes = round2(equity + netLoans)

  return {
    total_equity:   round2(equity),
    total_loans:    netLoans,
    total_dividends: round2(dividends),
    company_owes:   companyOwes,
  }
}

export function computeStockMetrics(i: StockInputs): CfoMetrics['stock'] {
  const fifoValue = i.lots.reduce(
    (s, l) => s + Number(l.qty_remaining) * Number(l.entry_cost_try), 0
  )
  const coverage = i.monthlyBurn > 0
    ? round2(fifoValue / i.monthlyBurn)
    : null

  return {
    fifo_value:      round2(fifoValue),
    coverage_months: coverage,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly projection — runway forecast
// ─────────────────────────────────────────────────────────────────────────────

export interface MonthlyForecastInput {
  startingCash:            number    // distributable_cash today
  monthlyBurn:             number    // operational burn per month
  outstandingReceivables:  number    // expected cash-in from collections
  collectionRatePct:       number    // what % of outstanding we expect to collect
  projectedMonthlyRevenue: number    // expected new revenue per month (optional)
  projectedCollectionRate: number    // expected collection rate on new revenue
  taxObligation:           number    // one-time tax payment expected
  months:                  number    // projection horizon (1–24)
}

export interface MonthlyForecastEntry {
  month:          number   // 1-indexed
  month_label:    string   // e.g. "Haz 2026"
  cash_in:        number
  cash_out:       number
  end_cash:       number   // cash at end of month
  is_exhausted:   boolean  // end_cash <= 0
}

export interface RunwayForecast {
  months:               MonthlyForecastEntry[]
  exhaustion_month:     number | null   // 1-indexed month when cash < 0, null if never
  exhaustion_date:      string | null   // ISO date
  safe_months:          number          // months before exhaustion
}

export function computeRunwayForecast(
  input: MonthlyForecastInput,
  startDate: Date,
): RunwayForecast {
  const entries: MonthlyForecastEntry[] = []
  let cash = input.startingCash
  let exhaustionMonth: number | null = null
  let exhaustionDate: string | null = null

  // One-time: collect % of outstanding receivables in month 1
  const receivablesCashIn = round2(input.outstandingReceivables * (input.collectionRatePct / 100))

  const TURKISH_MONTHS = [
    'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
    'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
  ]

  for (let m = 1; m <= input.months; m++) {
    const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + m, 1))
    const label = `${TURKISH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`

    const cashIn  = round2(
      (m === 1 ? receivablesCashIn : 0) +
      input.projectedMonthlyRevenue * (input.projectedCollectionRate / 100)
    )
    // Tax obligation hits in month 1 (conservative assumption)
    const cashOut = round2(input.monthlyBurn + (m === 1 ? input.taxObligation : 0))
    cash = round2(cash + cashIn - cashOut)

    const exhausted = cash <= 0
    if (exhausted && exhaustionMonth === null) {
      exhaustionMonth = m
      exhaustionDate  = d.toISOString().slice(0, 10)
    }

    entries.push({ month: m, month_label: label, cash_in: cashIn, cash_out: cashOut, end_cash: cash, is_exhausted: exhausted })
  }

  return {
    months:           entries,
    exhaustion_month: exhaustionMonth,
    exhaustion_date:  exhaustionDate,
    safe_months:      exhaustionMonth !== null ? exhaustionMonth - 1 : input.months,
  }
}
