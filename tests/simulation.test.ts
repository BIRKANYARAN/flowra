/**
 * Phase 5 — Simulation Engine pure-math tests.
 *
 * Scope (no DB — all inputs are provided directly):
 *   • computeSimulationKernel()  — core arithmetic for all three scenarios
 *   • buildMonthList()           — month sequence generator
 *   • buildSimulationPeriod()    — period from start + count
 *   • groupExpensesByMonth()     — expense-line bucketing
 *   • validateSimulationInput()  — validation guardrails
 *   • Three named business scenarios:
 *       1. High-price / low-volume (premium positioning)
 *       2. Low-price / high-volume (market penetration)
 *       3. Discount impact (same product, discounted)
 *   • Edge cases: zero stock, loss period, zero expenses, max discount guard
 *
 * Run with:  npx vitest run tests/simulation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  buildMonthList,
  buildSimulationPeriod,
  computeSimulationKernel,
  groupExpensesByMonth,
  validateSimulationInput,
  type SimulationKernelInput,
} from '../lib/services/simulation.service'
import type { ExpenseLineComputed } from '../types'

// ── Helper factories ─────────────────────────────────────────────────────────

function noExpenses(): ExpenseLineComputed[] { return [] }

function makeExpenseLine(
  month:        string,
  amount_try:   number,
  is_deductible = true,
  kdv           = 0,
): ExpenseLineComputed {
  return {
    source:          'recurring',
    source_id:       'test',
    occurrence_date: `${month}-01`,
    category:        'rent',
    expense_type:    'operating',
    is_deductible,
    amount_try,
    kdv,
    vat_try:         amount_try * kdv / 100,
  }
}

const BASE_KERNEL: Omit<SimulationKernelInput, 'total_quantity' | 'effective_unit_price' | 'original_sale_price' | 'unit_cost_try'> = {
  product_id:           'prod-1',
  discount_rate:        0,
  stock_qty_available:  500,
  period_months:        3,
  start_month:          '2026-01',
  tax_rate:             25,
  kdv_rate:             20,
  expense_lines:        [],
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMonthList()
// ─────────────────────────────────────────────────────────────────────────────
describe('buildMonthList()', () => {
  it('1 month', () => expect(buildMonthList('2026-01', 1)).toEqual(['2026-01']))
  it('3 months without rollover', () => {
    expect(buildMonthList('2026-01', 3)).toEqual(['2026-01', '2026-02', '2026-03'])
  })
  it('rolls Dec → Jan across year boundary', () => {
    expect(buildMonthList('2025-11', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })
  it('12 months ending Dec same year', () => {
    const list = buildMonthList('2026-01', 12)
    expect(list[0]).toBe('2026-01')
    expect(list[11]).toBe('2026-12')
    expect(list).toHaveLength(12)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// buildSimulationPeriod()
// ─────────────────────────────────────────────────────────────────────────────
describe('buildSimulationPeriod()', () => {
  it('1 month → single month range', () => {
    const p = buildSimulationPeriod('2026-03', 1)
    expect(p.from).toBe('2026-03-01')
    expect(p.to).toBe('2026-03-31')
  })
  it('3 months → quarter range', () => {
    const p = buildSimulationPeriod('2026-01', 3)
    expect(p.from).toBe('2026-01-01')
    expect(p.to).toBe('2026-03-31')
  })
  it('12 months → full year', () => {
    const p = buildSimulationPeriod('2026-01', 12)
    expect(p.from).toBe('2026-01-01')
    expect(p.to).toBe('2026-12-31')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// groupExpensesByMonth()
// ─────────────────────────────────────────────────────────────────────────────
describe('groupExpensesByMonth()', () => {
  it('groups multiple lines into the same month', () => {
    const lines: ExpenseLineComputed[] = [
      makeExpenseLine('2026-01', 5000, true),
      makeExpenseLine('2026-01', 2000, false),
      makeExpenseLine('2026-02', 3000, true, 20),
    ]
    const map = groupExpensesByMonth(lines)
    expect(map.get('2026-01')?.total).toBe(7000)
    expect(map.get('2026-01')?.deductible).toBe(5000)
    expect(map.get('2026-02')?.total).toBe(3000)
    expect(map.get('2026-02')?.expense_vat).toBe(600)   // 3000 × 20%
  })

  it('empty lines → empty map', () => {
    expect(groupExpensesByMonth([]).size).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — HIGH PRICE / LOW VOLUME (premium positioning)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 1: High price / low volume', () => {
  /**
   * Product: luxury item, unit cost ₺1,000
   * Selling 30 units over 3 months at ₺5,000/unit (no discount)
   * Expenses: ₺3,000/month rent (deductible, kdv 20%)
   *
   * Expected totals:
   *   Revenue          = 30 × 5000 = ₺150,000
   *   Cost             = 30 × 1000 = ₺30,000
   *   Gross profit     = ₺120,000
   *   Expenses total   = 3 × 3000 = ₺9,000
   *   Deductible       = ₺9,000
   *   Expense VAT      = 9000 × 20% = ₺1,800
   *   Matrah           = 120,000 - 9,000 = ₺111,000
   *   Tax (25%)        = ₺27,750
   *   Net profit       = 150,000 - 30,000 - 9,000 - 27,750 = ₺83,250
   *   Sales VAT        = 150,000 × 20% = ₺30,000
   *   KDV net          = 30,000 - 0 - 1,800 = ₺28,200 (payable)
   */
  const kernel: SimulationKernelInput = {
    ...BASE_KERNEL,
    total_quantity:        30,
    effective_unit_price:  5000,
    original_sale_price:   5000,
    unit_cost_try:         1000,
    expense_lines: [
      makeExpenseLine('2026-01', 3000, true, 20),
      makeExpenseLine('2026-02', 3000, true, 20),
      makeExpenseLine('2026-03', 3000, true, 20),
    ],
  }

  it('computes correct revenue + cost + gross profit', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.revenue).toBe(150000)
    expect(r.cost).toBe(30000)
    expect(r.gross_profit).toBe(120000)
  })

  it('computes correct expenses', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.expenses_projection).toBe(9000)
    expect(r.deductible_expenses).toBe(9000)
    expect(r.non_deductible_expenses).toBe(0)
  })

  it('computes correct tax and net profit', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.tax).toBe(27750)
    expect(r.net_profit).toBe(83250)
  })

  it('computes correct KDV effect (payable)', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.kdv_effect.sales_vat).toBe(30000)
    expect(r.kdv_effect.purchase_vat).toBe(0)
    expect(r.kdv_effect.expense_vat).toBe(1800)
    expect(r.kdv_effect.net_vat).toBe(28200)
    expect(r.kdv_effect.status).toBe('payable')
  })

  it('has 3 monthly rows each with ~1/3 revenue', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.monthly_breakdown).toHaveLength(3)
    for (const m of r.monthly_breakdown) {
      expect(m.revenue).toBeCloseTo(50000, 0)
      expect(m.cost).toBeCloseTo(10000, 0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — LOW PRICE / HIGH VOLUME (market penetration)
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 2: Low price / high volume', () => {
  /**
   * Same product, cost ₺1,000. Price halved to ₺2,500/unit, volume 10×.
   * 300 units / 3 months. Expenses same ₺9,000 total.
   *
   *   Revenue   = 300 × 2500 = ₺750,000
   *   Cost      = 300 × 1000 = ₺300,000
   *   Gross     = ₺450,000
   *   Expenses  = ₺9,000
   *   Matrah    = 450,000 - 9,000 = ₺441,000
   *   Tax (25%) = ₺110,250
   *   Net       = 750,000 - 300,000 - 9,000 - 110,250 = ₺330,750
   */
  const kernel: SimulationKernelInput = {
    ...BASE_KERNEL,
    total_quantity:        300,
    effective_unit_price:  2500,
    original_sale_price:   2500,
    unit_cost_try:         1000,
    expense_lines: [
      makeExpenseLine('2026-01', 3000, true, 20),
      makeExpenseLine('2026-02', 3000, true, 20),
      makeExpenseLine('2026-03', 3000, true, 20),
    ],
  }

  it('high volume drives higher absolute profit despite lower margin', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.revenue).toBe(750000)
    expect(r.cost).toBe(300000)
    expect(r.net_profit).toBe(330750)
  })

  it('net profit is higher in scenario 2 vs scenario 1 (83250)', () => {
    const r = computeSimulationKernel(kernel)
    expect(r.net_profit).toBeGreaterThan(83250)
  })

  it('gross margin % is 60% for scenario 2 vs 80% for scenario 1', () => {
    const r = computeSimulationKernel(kernel)
    const margin = (r.gross_profit / r.revenue) * 100
    expect(margin).toBeCloseTo(60, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — DISCOUNT IMPACT
// ─────────────────────────────────────────────────────────────────────────────
describe('Scenario 3: Discount impact', () => {
  /**
   * Same 100 units, cost ₺1,000.
   * Undiscounted:  price ₺2,000, 0% discount → revenue ₺200,000
   * Discounted:    price ₺2,000, 25% discount → effective ₺1,500, revenue ₺150,000
   * No expenses.
   */
  const baseKernel: SimulationKernelInput = {
    ...BASE_KERNEL,
    total_quantity:        100,
    original_sale_price:   2000,
    unit_cost_try:         1000,
    expense_lines:         [],
    period_months:         1,
    start_month:           '2026-01',
  }

  it('0% discount — full revenue and gross margin', () => {
    const r = computeSimulationKernel({ ...baseKernel, effective_unit_price: 2000, discount_rate: 0 })
    expect(r.revenue).toBe(200000)
    expect(r.gross_profit).toBe(100000)
    // Tax: matrah = 100000, tax = 25000
    expect(r.tax).toBe(25000)
    expect(r.net_profit).toBe(75000)
  })

  it('25% discount — revenue drops by 25%, profit drops more than proportionally', () => {
    const r = computeSimulationKernel({ ...baseKernel, effective_unit_price: 1500, discount_rate: 25 })
    expect(r.revenue).toBe(150000)        // −25% vs undiscounted
    expect(r.gross_profit).toBe(50000)    // −50%! cost is fixed
    // Matrah = 50000; tax = 12500
    expect(r.tax).toBe(12500)
    expect(r.net_profit).toBe(37500)      // −50% net profit for −25% price
  })

  it('50% discount — selling at cost, zero gross profit → no tax', () => {
    const r = computeSimulationKernel({ ...baseKernel, effective_unit_price: 1000, discount_rate: 50 })
    expect(r.revenue).toBe(100000)
    expect(r.cost).toBe(100000)
    expect(r.gross_profit).toBe(0)
    expect(r.tax).toBe(0)
    expect(r.net_profit).toBe(0)
  })

  it('discount below cost — loss period, zero tax, negative net profit', () => {
    // effective_price 800 < unit_cost 1000
    const r = computeSimulationKernel({ ...baseKernel, effective_unit_price: 800, discount_rate: 60 })
    expect(r.gross_profit).toBeLessThan(0)
    expect(r.tax).toBe(0)                 // no tax on losses
    expect(r.net_profit).toBeLessThan(0)
  })

  it('meta carries the discount rate correctly', () => {
    const r = computeSimulationKernel({ ...baseKernel, effective_unit_price: 1500, discount_rate: 25 })
    expect(r.simulation_meta.discount_rate).toBe(25)
    expect(r.simulation_meta.original_sale_price).toBe(2000)
    expect(r.simulation_meta.effective_unit_price).toBe(1500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('Edge cases', () => {
  const baseKernel: SimulationKernelInput = {
    ...BASE_KERNEL,
    total_quantity:        100,
    effective_unit_price:  2000,
    original_sale_price:   2000,
    unit_cost_try:         1000,
    expense_lines:         [],
  }

  it('zero stock → unit_cost = 0, revenue and profit are from sales only', () => {
    const r = computeSimulationKernel({ ...baseKernel, unit_cost_try: 0, stock_qty_available: 0 })
    expect(r.cost).toBe(0)
    expect(r.gross_profit).toBe(r.revenue)
    expect(r.simulation_meta.assumptions.some(a => /no stock/i.test(a))).toBe(true)
  })

  it('zero expenses → matrah = gross_profit', () => {
    const r = computeSimulationKernel(baseKernel)
    const matrahExpected = r.gross_profit   // no deductible expenses
    expect(r.simulation_meta).toBeDefined()
    // matrah = revenue - cost - deductible_expenses = 200000 - 100000 - 0 = 100000
    expect(r.tax).toBe(25000)  // 100000 × 25%
  })

  it('non-deductible expenses do NOT reduce tax', () => {
    const withNonDed: ExpenseLineComputed[] = [
      makeExpenseLine('2026-01', 20000, false),  // dividend — non-deductible
      makeExpenseLine('2026-02', 20000, false),
      makeExpenseLine('2026-03', 20000, false),
    ]
    const r = computeSimulationKernel({ ...baseKernel, expense_lines: withNonDed })
    // Gross profit = 100,000; deductible = 0 → matrah = 100,000 → tax = 25,000
    // (same as zero-expense case: non-ded doesn't help tax)
    expect(r.tax).toBe(25000)
    expect(r.deductible_expenses).toBe(0)
    expect(r.non_deductible_expenses).toBe(60000)
    // Net = revenue - cost - all_expenses - tax = 200000-100000-60000-25000 = 15000
    expect(r.net_profit).toBe(15000)
  })

  it('monthly_breakdown length matches period_months', () => {
    for (const months of [1, 3, 6, 9, 12] as const) {
      const r = computeSimulationKernel({ ...baseKernel, period_months: months })
      expect(r.monthly_breakdown).toHaveLength(months)
    }
  })

  it('monthly revenue sums to total revenue (within rounding tolerance)', () => {
    const r = computeSimulationKernel({ ...baseKernel, period_months: 3 })
    const monthlySum = r.monthly_breakdown.reduce((s, m) => s + m.revenue, 0)
    expect(Math.abs(monthlySum - r.revenue)).toBeLessThanOrEqual(0.05)
  })

  it('carry_forward status when no sales VAT (kdv_rate = 0)', () => {
    const r = computeSimulationKernel({ ...baseKernel, kdv_rate: 0 })
    // No output VAT, no input VAT → 0 net
    expect(r.kdv_effect.net_vat).toBe(0)
    expect(r.kdv_effect.status).toBe('carry_forward')  // net_vat ≤ 0
  })

  it('carry_forward when expense VAT > sales VAT', () => {
    // Very low revenue, high expense VAT
    const bigExpVat = [
      makeExpenseLine('2026-01', 50000, true, 20),   // VAT = 10000
      makeExpenseLine('2026-02', 50000, true, 20),   // VAT = 10000
      makeExpenseLine('2026-03', 50000, true, 20),   // VAT = 10000
    ]
    // revenue 1000 × kdv 20% = 200 sales VAT; expense VAT = 30000 → net = -29800
    const r = computeSimulationKernel({
      ...baseKernel,
      total_quantity:       1,
      effective_unit_price: 1000,
      original_sale_price:  1000,
      unit_cost_try:        500,
      expense_lines:        bigExpVat,
    })
    expect(r.kdv_effect.net_vat).toBeLessThan(0)
    expect(r.kdv_effect.status).toBe('carry_forward')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// validateSimulationInput()
// ─────────────────────────────────────────────────────────────────────────────
describe('validateSimulationInput()', () => {
  const validInput = {
    product_id:   'some-uuid',
    quantity:     100,
    sale_price:   250,
    discount_rate: 10,
    period_months: 3 as const,
  }

  it('valid input → no errors', () => {
    expect(validateSimulationInput(validInput)).toHaveLength(0)
  })
  it('missing product_id → error', () => {
    expect(validateSimulationInput({ ...validInput, product_id: '' }).length).toBeGreaterThan(0)
  })
  it('quantity = 0 → error', () => {
    expect(validateSimulationInput({ ...validInput, quantity: 0 }).length).toBeGreaterThan(0)
  })
  it('negative quantity → error', () => {
    expect(validateSimulationInput({ ...validInput, quantity: -5 }).length).toBeGreaterThan(0)
  })
  it('sale_price = 0 → error', () => {
    expect(validateSimulationInput({ ...validInput, sale_price: 0 }).length).toBeGreaterThan(0)
  })
  it('discount_rate = 100 → error (would give ₺0 revenue)', () => {
    expect(validateSimulationInput({ ...validInput, discount_rate: 100 }).length).toBeGreaterThan(0)
  })
  it('discount_rate = -1 → error', () => {
    expect(validateSimulationInput({ ...validInput, discount_rate: -1 }).length).toBeGreaterThan(0)
  })
  it('period_months = 4 (not in allowed set) → error', () => {
    expect(validateSimulationInput({ ...validInput, period_months: 4 as any }).length).toBeGreaterThan(0)
  })
  it('invalid start_month format → error', () => {
    expect(validateSimulationInput({ ...validInput, start_month: '2026/01' }).length).toBeGreaterThan(0)
    expect(validateSimulationInput({ ...validInput, start_month: '2026-1' }).length).toBeGreaterThan(0)
  })
  it('valid start_month → no error', () => {
    expect(validateSimulationInput({ ...validInput, start_month: '2026-06' })).toHaveLength(0)
  })
  it('negative tax_rate → error', () => {
    expect(validateSimulationInput({ ...validInput, tax_rate: -1 }).length).toBeGreaterThan(0)
  })
  it('tax_rate = 0 → valid (special economic zones)', () => {
    expect(validateSimulationInput({ ...validInput, tax_rate: 0 })).toHaveLength(0)
  })
})
