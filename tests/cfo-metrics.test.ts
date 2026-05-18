// tests/cfo-metrics.test.ts
// Unit tests for lib/finance/cfo-metrics.ts — pure kernel functions

import { describe, it, expect } from 'vitest'
import {
  computeCashMetrics,
  computeBurnMetrics,
  computeReceivableMetrics,
  computeTaxMetrics,
  computePartnerMetrics,
  computeStockMetrics,
  computeRunwayForecast,
  type CashInputs,
  type ReceivableInputs,
  type TaxInputs,
  type PartnerInputs,
  type StockInputs,
  type MonthlyForecastInput,
} from '@/lib/finance/cfo-metrics'

// ─────────────────────────────────────────────────────────────────────────────
// computeCashMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeCashMetrics', () => {
  it('basic case: all-time received minus operational paid = true_cash', () => {
    const input: CashInputs = {
      allTimeReceived: 500_000,
      allTimePaidExpenses: [
        { amount_try: 100_000, expense_type: 'operational' },
        { amount_try:  50_000, expense_type: 'fixed' },
      ],
      unpaidExpenses: [],
      periodReceived: 100_000,
      periodPaidExpenses: [
        { amount_try: 30_000, expense_type: 'operational' },
      ],
      trailingBurnExpenses: [
        { amount_try: 30_000 },
        { amount_try: 30_000 },
        { amount_try: 30_000 },
      ],
      trailingMonths: 3,
    }
    const result = computeCashMetrics(input)
    // true_cash = 500_000 - (100_000 + 50_000) = 350_000
    expect(result.true_cash_position).toBe(350_000)
    // operational_cash = 100_000 - 30_000 = 70_000
    expect(result.operational_cash).toBe(70_000)
  })

  it('financing expense types are excluded from operational calculations', () => {
    const input: CashInputs = {
      allTimeReceived: 200_000,
      allTimePaidExpenses: [
        { amount_try: 50_000, expense_type: 'partner_financing' },
        { amount_try: 30_000, expense_type: 'loan_repayment' },
        { amount_try: 20_000, expense_type: 'dividend' },
        { amount_try: 10_000, expense_type: 'internal_transfer' },
        { amount_try: 40_000, expense_type: 'operational' }, // only this should count
      ],
      unpaidExpenses: [
        { amount_try: 5_000, expense_type: 'partner_financing' }, // should be excluded from restricted
        { amount_try: 8_000, expense_type: 'operational' },       // should be included in restricted
      ],
      periodReceived: 0,
      periodPaidExpenses: [],
      trailingBurnExpenses: [],
      trailingMonths: 3,
    }
    const result = computeCashMetrics(input)
    // true_cash = 200_000 - 40_000 = 160_000 (financing excluded)
    expect(result.true_cash_position).toBe(160_000)
    // restricted = 8_000 (partner_financing excluded from unpaid)
    expect(result.restricted_cash).toBe(8_000)
  })

  it('distributable = max(0, trueCash - restricted)', () => {
    const input: CashInputs = {
      allTimeReceived: 100_000,
      allTimePaidExpenses: [{ amount_try: 80_000, expense_type: 'operational' }],
      unpaidExpenses: [{ amount_try: 25_000, expense_type: 'fixed' }],
      periodReceived: 0,
      periodPaidExpenses: [],
      trailingBurnExpenses: [],
      trailingMonths: 3,
    }
    const result = computeCashMetrics(input)
    // true_cash = 100_000 - 80_000 = 20_000
    // restricted = 25_000
    // distributable = max(0, 20_000 - 25_000) = 0
    expect(result.distributable_cash).toBe(0)
  })

  it('distributable is positive when trueCash exceeds restricted', () => {
    const input: CashInputs = {
      allTimeReceived: 200_000,
      allTimePaidExpenses: [{ amount_try: 80_000, expense_type: 'operational' }],
      unpaidExpenses: [{ amount_try: 10_000, expense_type: 'fixed' }],
      periodReceived: 0,
      periodPaidExpenses: [],
      trailingBurnExpenses: [],
      trailingMonths: 3,
    }
    const result = computeCashMetrics(input)
    // true_cash = 200_000 - 80_000 = 120_000
    // distributable = max(0, 120_000 - 10_000) = 110_000
    expect(result.distributable_cash).toBe(110_000)
  })

  it('monthly burn rate = trailing expenses / months', () => {
    const input: CashInputs = {
      allTimeReceived: 0,
      allTimePaidExpenses: [],
      unpaidExpenses: [],
      periodReceived: 0,
      periodPaidExpenses: [],
      trailingBurnExpenses: [
        { amount_try: 20_000 },
        { amount_try: 20_000 },
        { amount_try: 20_000 },
      ],
      trailingMonths: 3,
    }
    const result = computeCashMetrics(input)
    expect(result.monthly_burn_rate).toBe(20_000)
  })

  it('zero denominator guard: trailingMonths = 0 → uses max(1)', () => {
    const input: CashInputs = {
      allTimeReceived: 0,
      allTimePaidExpenses: [],
      unpaidExpenses: [],
      periodReceived: 0,
      periodPaidExpenses: [],
      trailingBurnExpenses: [{ amount_try: 30_000 }],
      trailingMonths: 0, // zero denominator
    }
    const result = computeCashMetrics(input)
    // Should use max(0, 1) = 1 as denominator
    expect(result.monthly_burn_rate).toBe(30_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeBurnMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBurnMetrics', () => {
  const TODAY = '2026-01-01'

  it('monthlyBurn = 0 → returns null runway/days/date', () => {
    const result = computeBurnMetrics(100_000, 0, TODAY)
    expect(result.runway_months).toBeNull()
    expect(result.runway_days).toBeNull()
    expect(result.cash_exhaustion_date).toBeNull()
    expect(result.monthly_burn_rate).toBe(0)
  })

  it('distributable > 0: runway_months, runway_days, exhaustion_date computed correctly', () => {
    const result = computeBurnMetrics(60_000, 10_000, TODAY)
    // runway = 60_000 / 10_000 = 6 months
    expect(result.runway_months).toBe(6)
    // runway_days = round(6 * 30.44) = round(182.64) = 183
    expect(result.runway_days).toBe(183)
    // exhaustion_date = 2026-01-01 + 183 days = 2026-07-03
    expect(result.cash_exhaustion_date).toBe('2026-07-03')
  })

  it('distributable <= 0: exhaustion_date = today', () => {
    const result = computeBurnMetrics(0, 10_000, TODAY)
    expect(result.cash_exhaustion_date).toBe(TODAY)
  })

  it('distributable negative: exhaustion_date = today', () => {
    const result = computeBurnMetrics(-5_000, 10_000, TODAY)
    expect(result.cash_exhaustion_date).toBe(TODAY)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeReceivableMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeReceivableMetrics', () => {
  const TODAY = '2026-06-01'

  it('total_outstanding = sum of (amount_try - amount_paid), clamped at 0', () => {
    const input: ReceivableInputs = {
      periodInvoiced: 200_000,
      periodCollected: 100_000,
      outstanding: [
        { amount_try: 50_000, sale_date: '2026-05-01', amount_paid: 20_000 }, // net 30_000
        { amount_try: 30_000, sale_date: '2026-05-10', amount_paid: 35_000 }, // over-paid → 0
        { amount_try: 10_000, sale_date: '2026-05-15', amount_paid: 0 },       // net 10_000
      ],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.total_outstanding).toBe(40_000) // 30_000 + 0 + 10_000
  })

  it('30/60/90 aging buckets are cumulative', () => {
    // A sale with agingDate well before all buckets should count in all three
    const input: ReceivableInputs = {
      periodInvoiced: 0,
      periodCollected: 0,
      outstanding: [
        {
          amount_try: 10_000,
          sale_date: '2026-01-01', // 150+ days before today (2026-06-01) → over30, over60, over90
          amount_paid: 0,
        },
      ],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.overdue_30d).toBe(10_000)
    expect(result.overdue_60d).toBe(10_000)
    expect(result.overdue_90d).toBe(10_000)
  })

  it('sale within 30 days does not appear in any bucket', () => {
    const input: ReceivableInputs = {
      periodInvoiced: 0,
      periodCollected: 0,
      outstanding: [
        {
          amount_try: 5_000,
          sale_date: '2026-05-25', // 7 days before today — not overdue
          amount_paid: 0,
        },
      ],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.overdue_30d).toBe(0)
    expect(result.overdue_60d).toBe(0)
    expect(result.overdue_90d).toBe(0)
    expect(result.total_outstanding).toBe(5_000)
  })

  it('collection_rate = periodCollected / periodInvoiced * 100 (capped at 100)', () => {
    const input: ReceivableInputs = {
      periodInvoiced: 200_000,
      periodCollected: 150_000,
      outstanding: [],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.collection_rate_pct).toBe(75)
  })

  it('collection_rate capped at 100 when over-collected', () => {
    const input: ReceivableInputs = {
      periodInvoiced: 100_000,
      periodCollected: 120_000,
      outstanding: [],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.collection_rate_pct).toBe(100)
  })

  it('periodInvoiced = 0 → collection_rate = 100 (not NaN)', () => {
    const input: ReceivableInputs = {
      periodInvoiced: 0,
      periodCollected: 0,
      outstanding: [],
      today: TODAY,
    }
    const result = computeReceivableMetrics(input)
    expect(result.collection_rate_pct).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeTaxMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTaxMetrics', () => {
  it('positive kdvNet → kdv_payable shows in total_fiscal_obligation', () => {
    const input: TaxInputs = { kdvNet: 10_000, accountingProfit: 0, taxRate: 25 }
    const result = computeTaxMetrics(input)
    expect(result.kdv_net).toBe(10_000)
    // kdv_payable = 10_000, corpTax = 0 → total = 10_000
    expect(result.total_fiscal_obligation).toBe(10_000)
  })

  it('negative kdvNet (carry-forward) → kdv_payable = 0 (not negative)', () => {
    const input: TaxInputs = { kdvNet: -5_000, accountingProfit: 0, taxRate: 25 }
    const result = computeTaxMetrics(input)
    expect(result.kdv_net).toBe(-5_000)
    // kdv_payable = max(0, -5_000) = 0; total_fiscal_obligation should be 0
    expect(result.total_fiscal_obligation).toBe(0)
  })

  it('accountingProfit > 0 → corporate tax computed at taxRate%', () => {
    const input: TaxInputs = { kdvNet: 0, accountingProfit: 100_000, taxRate: 25 }
    const result = computeTaxMetrics(input)
    expect(result.corporate_tax_estimate).toBe(25_000)
    expect(result.total_fiscal_obligation).toBe(25_000)
  })

  it('accountingProfit <= 0 → corporate_tax_estimate = 0', () => {
    const input: TaxInputs = { kdvNet: 0, accountingProfit: -50_000, taxRate: 25 }
    const result = computeTaxMetrics(input)
    expect(result.corporate_tax_estimate).toBe(0)
  })

  it('both kdv and corporate tax combine correctly', () => {
    const input: TaxInputs = { kdvNet: 8_000, accountingProfit: 200_000, taxRate: 25 }
    const result = computeTaxMetrics(input)
    expect(result.corporate_tax_estimate).toBe(50_000)
    expect(result.total_fiscal_obligation).toBe(58_000) // 8_000 + 50_000
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computePartnerMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computePartnerMetrics', () => {
  it('capital_in, loan_to_company, and loan_repayment correctly aggregate', () => {
    const input: PartnerInputs = {
      transactions: [
        { tx_type: 'capital_in',      amount_try: 100_000 },
        { tx_type: 'loan_to_company', amount_try:  50_000 },
        { tx_type: 'loan_repayment',  amount_try:  20_000 },
      ],
    }
    const result = computePartnerMetrics(input)
    expect(result.total_equity).toBe(100_000)
    expect(result.total_loans).toBe(30_000)   // 50_000 - 20_000
  })

  it('legacy aliases: loan_in = loan_to_company, loan_out = loan_repayment', () => {
    const input: PartnerInputs = {
      transactions: [
        { tx_type: 'capital_in', amount_try: 80_000 },
        { tx_type: 'loan_in',    amount_try: 40_000 }, // legacy
        { tx_type: 'loan_out',   amount_try: 15_000 }, // legacy
      ],
    }
    const result = computePartnerMetrics(input)
    expect(result.total_equity).toBe(80_000)
    expect(result.total_loans).toBe(25_000) // 40_000 - 15_000
  })

  it('company_owes = equity + net_loans', () => {
    const input: PartnerInputs = {
      transactions: [
        { tx_type: 'capital_in',      amount_try: 100_000 },
        { tx_type: 'loan_to_company', amount_try:  30_000 },
        { tx_type: 'loan_repayment',  amount_try:  10_000 },
      ],
    }
    const result = computePartnerMetrics(input)
    // equity = 100_000, net_loans = 20_000
    expect(result.company_owes).toBe(120_000)
  })

  it('dividends are tracked separately', () => {
    const input: PartnerInputs = {
      transactions: [
        { tx_type: 'capital_in', amount_try: 200_000 },
        { tx_type: 'dividend',   amount_try:  50_000 },
      ],
    }
    const result = computePartnerMetrics(input)
    expect(result.total_dividends).toBe(50_000)
    expect(result.total_equity).toBe(200_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeStockMetrics
// ─────────────────────────────────────────────────────────────────────────────

describe('computeStockMetrics', () => {
  it('fifo_value = Σ (qty_remaining × cost_price_try)', () => {
    const input: StockInputs = {
      lots: [
        { qty_remaining: 100, cost_price_try: 50 },
        { qty_remaining:  50, cost_price_try: 80 },
      ],
      monthlyBurn: 10_000,
    }
    const result = computeStockMetrics(input)
    expect(result.fifo_value).toBe(9_000) // 100*50 + 50*80 = 5000 + 4000
  })

  it('coverage_months = fifo_value / monthlyBurn', () => {
    const input: StockInputs = {
      lots: [{ qty_remaining: 200, cost_price_try: 100 }],
      monthlyBurn: 5_000,
    }
    const result = computeStockMetrics(input)
    expect(result.fifo_value).toBe(20_000)
    expect(result.coverage_months).toBe(4) // 20_000 / 5_000
  })

  it('coverage_months = null if burn = 0', () => {
    const input: StockInputs = {
      lots: [{ qty_remaining: 100, cost_price_try: 50 }],
      monthlyBurn: 0,
    }
    const result = computeStockMetrics(input)
    expect(result.coverage_months).toBeNull()
  })

  it('empty lots → fifo_value = 0', () => {
    const input: StockInputs = { lots: [], monthlyBurn: 10_000 }
    const result = computeStockMetrics(input)
    expect(result.fifo_value).toBe(0)
    expect(result.coverage_months).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// computeRunwayForecast
// ─────────────────────────────────────────────────────────────────────────────

describe('computeRunwayForecast', () => {
  const START_DATE = new Date('2026-01-01T00:00:00Z')

  function makeInput(overrides: Partial<MonthlyForecastInput> = {}): MonthlyForecastInput {
    return {
      startingCash:            100_000,
      monthlyBurn:             30_000,
      outstandingReceivables:  20_000,
      collectionRatePct:       100,
      projectedMonthlyRevenue: 0,
      projectedCollectionRate: 100,
      taxObligation:           0,
      months:                  6,
      ...overrides,
    }
  }

  it('basic 3-month projection: cash decreases by burn each month (no revenue)', () => {
    const input = makeInput({ startingCash: 90_000, monthlyBurn: 30_000, outstandingReceivables: 0, months: 3 })
    const result = computeRunwayForecast(input, START_DATE)
    expect(result.months).toHaveLength(3)
    // Month 1: cash_out = 30_000, cash_in = 0 (no receivables), end = 90_000 - 30_000 = 60_000
    expect(result.months[0].end_cash).toBe(60_000)
    // Month 2: end = 60_000 - 30_000 = 30_000
    expect(result.months[1].end_cash).toBe(30_000)
    // Month 3: end = 30_000 - 30_000 = 0 → exhausted
    expect(result.months[2].end_cash).toBe(0)
  })

  it('month 1 includes receivables cash-in', () => {
    const input = makeInput({
      startingCash: 50_000,
      monthlyBurn: 20_000,
      outstandingReceivables: 30_000,
      collectionRatePct: 100,
      months: 2,
    })
    const result = computeRunwayForecast(input, START_DATE)
    // Month 1: cash_in = 30_000 (receivables), cash_out = 20_000 → end = 50_000 + 30_000 - 20_000 = 60_000
    expect(result.months[0].cash_in).toBe(30_000)
    expect(result.months[0].end_cash).toBe(60_000)
    // Month 2: no receivables cash-in
    expect(result.months[1].cash_in).toBe(0)
  })

  it('month 1 includes tax obligation hit', () => {
    const input = makeInput({
      startingCash: 100_000,
      monthlyBurn: 20_000,
      taxObligation: 15_000,
      outstandingReceivables: 0,
      months: 2,
    })
    const result = computeRunwayForecast(input, START_DATE)
    // Month 1: cash_out = 20_000 + 15_000 = 35_000
    expect(result.months[0].cash_out).toBe(35_000)
    // Month 2: cash_out = just burn
    expect(result.months[1].cash_out).toBe(20_000)
  })

  it('exhaustion_month set when end_cash <= 0', () => {
    const input = makeInput({
      startingCash: 50_000,
      monthlyBurn: 30_000,
      outstandingReceivables: 0,
      months: 4,
    })
    const result = computeRunwayForecast(input, START_DATE)
    // Month 1: 50_000 - 30_000 = 20_000
    // Month 2: 20_000 - 30_000 = -10_000 → exhausted at month 2
    expect(result.exhaustion_month).toBe(2)
    expect(result.months[1].is_exhausted).toBe(true)
  })

  it('safe_months = exhaustionMonth - 1', () => {
    const input = makeInput({
      startingCash: 50_000,
      monthlyBurn: 30_000,
      outstandingReceivables: 0,
      months: 4,
    })
    const result = computeRunwayForecast(input, START_DATE)
    // Exhaustion at month 2 → safe_months = 1
    expect(result.safe_months).toBe(1)
  })

  it('safe_months = input.months when cash never exhausted', () => {
    const input = makeInput({
      startingCash: 1_000_000,
      monthlyBurn: 10_000,
      outstandingReceivables: 0,
      months: 6,
    })
    const result = computeRunwayForecast(input, START_DATE)
    expect(result.exhaustion_month).toBeNull()
    expect(result.safe_months).toBe(6)
  })
})
