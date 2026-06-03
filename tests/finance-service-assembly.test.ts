/**
 * Tests for FinanceService.getFinancialSummary() assembly logic.
 *
 * Faz 13-A: finance.service.ts unit tests.
 *
 * Strategy: spy on the three async sub-calls (getGrossProfit, getOperatingExpenses,
 * TaxService.getKdvNet) so no real DB is needed. Tests verify that the assembly
 * logic correctly maps sub-results into the FinancialSummary shape, and that the
 * corporate tax computation receives the right inputs.
 *
 * Run with: npx vitest run tests/finance-service-assembly.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FinanceService } from '../lib/services/finance.service'
import type { FinancialSummary } from '../lib/services/finance.service'

// ── Shared fixtures ────────────────────────────────────────────────────────────

const PERIOD = { from: '2025-01-01', to: '2025-03-31' }
const USER   = 'user-1'
const CO     = 'co-1'

const GROSS_STUB = {
  revenue_try:      500_000,
  cost_try:         200_000,
  gross_profit_try: 300_000,
}

const EXPENSES_STUB = {
  total_try:       120_000,  // incl. non-deductible
  deductible_try:   80_000,  // salary + rent + interest
  non_deductible_try: 40_000, // dividend + principal
}

const VAT_STUB = {
  sales_vat_try:    100_000,
  purchase_vat_try:  20_000,
  expense_vat_try:    4_000,
  net_vat_try:       76_000,  // 100k - 20k - 4k
}

// Expected tax calc:
//   matrah = revenue(500k) - cost(200k) - deductible_exp(80k) = 220k
//   tax    = 220k × 25% = 55k
//   net    = 220k - 55k = 165k

describe('FinanceService.getFinancialSummary — assembly', () => {
  let grossSpy:    ReturnType<typeof vi.spyOn>
  let expensesSpy: ReturnType<typeof vi.spyOn>

  // We must also mock TaxService since it's dynamically imported
  beforeEach(async () => {
    grossSpy = vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    expensesSpy = vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('revenue, cost, and gross_profit come from getGrossProfit', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary: FinancialSummary = await FinanceService.getFinancialSummary(
      USER, CO, PERIOD,
    )

    expect(summary.revenue_try).toBe(500_000)
    expect(summary.cost_try).toBe(200_000)
    expect(summary.gross_profit_try).toBe(300_000)
  })

  it('expense totals come from getOperatingExpenses', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.expenses_total_try).toBe(120_000)
    expect(summary.deductible_expenses_try).toBe(80_000)
    expect(summary.non_deductible_expenses_try).toBe(40_000)
  })

  it('VAT fields come from TaxService.getKdvNet', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.sales_vat_try).toBe(100_000)
    expect(summary.purchase_vat_try).toBe(20_000)
    expect(summary.expense_vat_try).toBe(4_000)
    expect(summary.net_vat_try).toBe(76_000)
  })

  it('corporate tax is computed from revenue - cost - deductible_only', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    // matrah = 500k - 200k - 80k = 220k  (non-deductible 40k excluded)
    expect(summary.matrah_try).toBe(220_000)
    expect(summary.corporate_tax_try).toBe(55_000)  // 220k matrah × 25% (unchanged)
    // DP-2: net_after_tax is now TRUE net income = EBT(180k) − tax(55k) = 125k.
    // EBT = revenue 500k − COGS 200k − ALL expenses 120k. (Was 165k = matrah−tax,
    // which wrongly omitted the 40k non-deductible expenses.)
    expect(summary.net_after_tax_try).toBe(125_000)
    expect(summary.corporate_tax_rate).toBe(25)
  })

  it('non-deductible expenses do NOT reduce matrah', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    // If non-deductible (40k) were included: matrah = 500k-200k-120k = 180k → tax = 45k
    // Correct: matrah = 500k-200k-80k = 220k → tax = 55k
    expect(summary.corporate_tax_try).toBe(55_000) // NOT 45_000
    expect(summary.matrah_try).toBe(220_000)        // NOT 180_000
  })

  it('custom tax rate override is respected', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(
      USER, CO, PERIOD,
      { corporate_tax_rate: 20 }, // override to 20%
    )

    // matrah = 220k, tax at 20% = 44k; DP-2 net = EBT(180k) − 44k = 136k
    expect(summary.corporate_tax_rate).toBe(20)
    expect(summary.corporate_tax_try).toBe(44_000)
    expect(summary.net_after_tax_try).toBe(136_000)
  })

  it('period is passed through to the summary', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.period).toEqual(PERIOD)
  })

  it('calls getGrossProfit with correct userId, companyId, period', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(grossSpy).toHaveBeenCalledWith(USER, CO, PERIOD, undefined, undefined)
  })

  it('calls getOperatingExpenses with correct userId, companyId, period', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(expensesSpy).toHaveBeenCalledWith(USER, CO, PERIOD, undefined, undefined)
  })

  it('gross_profit_try = revenue_try - cost_try', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // From stub: 500k - 200k = 300k
    expect(summary.gross_profit_try).toBe(summary.revenue_try - summary.cost_try)
  })

  it('net_after_tax_try = EBT − corporate_tax (true net income, DP-2)', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // EBT = gross_profit − ALL expenses; net income = EBT − corporate tax.
    const ebt = summary.gross_profit_try - summary.expenses_total_try
    expect(summary.net_after_tax_try).toBe(ebt - summary.corporate_tax_try)
  })

  it('zero-revenue scenario: matrah and tax are clamped at 0', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 0,
      cost_try: 0,
      gross_profit_try: 0,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 50_000,
      deductible_try: 50_000,
      non_deductible_try: 0,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0, net_vat_try: 0,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 0 - 0 - 50k = -50k → clamped to 0, tax = 0
    expect(summary.corporate_tax_try).toBeGreaterThanOrEqual(0)
    expect(summary.net_after_tax_try).toBeGreaterThanOrEqual(-Infinity) // at most matrah
  })

  it('10% corporate tax rate: 220k matrah → 22k tax', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(
      USER, CO, PERIOD,
      { corporate_tax_rate: 10 },
    )

    expect(summary.corporate_tax_rate).toBe(10)
    expect(summary.corporate_tax_try).toBe(22_000)  // 220k matrah × 10%
    expect(summary.net_after_tax_try).toBe(158_000) // DP-2: EBT(180k) − 22k
  })

  it('30% corporate tax rate: 220k matrah → 66k tax', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(
      USER, CO, PERIOD,
      { corporate_tax_rate: 30 },
    )

    expect(summary.corporate_tax_rate).toBe(30)
    expect(summary.corporate_tax_try).toBe(66_000)  // 220k matrah × 30%
    expect(summary.net_after_tax_try).toBe(114_000) // DP-2: EBT(180k) − 66k
  })

  it('deductible_expenses_try + non_deductible_expenses_try = expenses_total_try', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.deductible_expenses_try + summary.non_deductible_expenses_try)
      .toBe(summary.expenses_total_try)
  })

  it('VAT net = sales_vat - purchase_vat - expense_vat', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    // 100k - 20k - 4k = 76k
    expect(summary.net_vat_try)
      .toBe(summary.sales_vat_try - summary.purchase_vat_try - summary.expense_vat_try)
  })

  it('different period from and to are reflected in summary.period', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)
    const customPeriod = { from: '2025-07-01', to: '2025-09-30' }

    const summary = await FinanceService.getFinancialSummary(USER, CO, customPeriod)

    expect(summary.period.from).toBe('2025-07-01')
    expect(summary.period.to).toBe('2025-09-30')
  })

  it('getGrossProfit is called exactly once per summary call', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(grossSpy).toHaveBeenCalledTimes(1)
  })

  it('getOperatingExpenses is called exactly once per summary call', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(expensesSpy).toHaveBeenCalledTimes(1)
  })

  it('summary has all required fields at top level', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary).toHaveProperty('revenue_try')
    expect(summary).toHaveProperty('cost_try')
    expect(summary).toHaveProperty('gross_profit_try')
    expect(summary).toHaveProperty('expenses_total_try')
    expect(summary).toHaveProperty('deductible_expenses_try')
    expect(summary).toHaveProperty('non_deductible_expenses_try')
    expect(summary).toHaveProperty('matrah_try')
    expect(summary).toHaveProperty('corporate_tax_try')
    expect(summary).toHaveProperty('corporate_tax_rate')
    expect(summary).toHaveProperty('net_after_tax_try')
    expect(summary).toHaveProperty('sales_vat_try')
    expect(summary).toHaveProperty('purchase_vat_try')
    expect(summary).toHaveProperty('expense_vat_try')
    expect(summary).toHaveProperty('net_vat_try')
    expect(summary).toHaveProperty('period')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — corporate tax rate field
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — corporate tax rate field', () => {
  beforeEach(() => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('corporate_tax_rate is 25 (default) when matrah_try > 0', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // Default rate should be 25, and matrah = 220k > 0
    expect(summary.corporate_tax_rate).toBe(25)
    expect(summary.matrah_try).toBeGreaterThan(0)
  })

  it('corporate_tax_rate is 0.22 when overridden to 22', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD, { corporate_tax_rate: 22 })
    expect(summary.corporate_tax_rate).toBe(22)
  })

  it('corporate_tax_try is rate × matrah / 100', async () => {
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 220k, rate = 25 → tax = 55k
    expect(summary.corporate_tax_try).toBeCloseTo(summary.matrah_try * summary.corporate_tax_rate / 100, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — zero revenue scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — zero revenue scenario', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('all revenue = 0 → gross_profit = 0', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 0, cost_try: 0, gross_profit_try: 0,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 0, deductible_try: 0, non_deductible_try: 0,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0, net_vat_try: 0,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.revenue_try).toBe(0)
    expect(summary.gross_profit_try).toBe(0)
  })

  it('all revenue = 0 → corporate_tax_try >= 0', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 0, cost_try: 0, gross_profit_try: 0,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 0, deductible_try: 0, non_deductible_try: 0,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 0, purchase_vat_try: 0, expense_vat_try: 0, net_vat_try: 0,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    expect(summary.corporate_tax_try).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — zero expenses scenario
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — zero expenses scenario', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('expenses = 0 → gross_profit = revenue', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 500_000, cost_try: 0, gross_profit_try: 500_000,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 0, deductible_try: 0, non_deductible_try: 0,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.gross_profit_try).toBe(500_000)
    expect(summary.expenses_total_try).toBe(0)
  })

  it('zero deductible expenses → matrah = revenue - cost', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 400_000, cost_try: 100_000, gross_profit_try: 300_000,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 0, deductible_try: 0, non_deductible_try: 0,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 400k - 100k - 0 = 300k
    expect(summary.matrah_try).toBe(300_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — high deductible vs non-deductible split
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — high deductible vs non-deductible split', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('deductible + non_deductible = total for 80/20 split', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 200_000, deductible_try: 160_000, non_deductible_try: 40_000,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    expect(summary.deductible_expenses_try + summary.non_deductible_expenses_try)
      .toBe(summary.expenses_total_try)
  })

  it('all expenses non-deductible → matrah not reduced by them', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 500_000, cost_try: 200_000, gross_profit_try: 300_000,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 100_000, deductible_try: 0, non_deductible_try: 100_000,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 500k - 200k - 0 = 300k (non-deductible not subtracted)
    expect(summary.matrah_try).toBe(300_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — net_vat_try calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — net_vat_try calculation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('net_vat = sales_vat - purchase_vat - expense_vat', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 80_000, purchase_vat_try: 30_000, expense_vat_try: 10_000, net_vat_try: 40_000,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    expect(summary.net_vat_try).toBe(40_000)
    expect(summary.net_vat_try).toBe(summary.sales_vat_try - summary.purchase_vat_try - summary.expense_vat_try)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — period fields preserved
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — period fields preserved', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('period.from and period.to match input period', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)
    const customPeriod = { from: '2025-04-01', to: '2025-06-30' }

    const summary = await FinanceService.getFinancialSummary(USER, CO, customPeriod)

    expect(summary.period.from).toBe('2025-04-01')
    expect(summary.period.to).toBe('2025-06-30')
  })

  it('period object reference is preserved in summary', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.period).toBeDefined()
    expect(summary.period.from).toBe(PERIOD.from)
    expect(summary.period.to).toBe(PERIOD.to)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — large numbers
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — large numbers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('revenue 10M, expenses 3M — gross profit = 7M', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 10_000_000, cost_try: 3_000_000, gross_profit_try: 7_000_000,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 1_000_000, deductible_try: 800_000, non_deductible_try: 200_000,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 1_800_000, purchase_vat_try: 540_000, expense_vat_try: 180_000, net_vat_try: 1_080_000,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)

    expect(summary.gross_profit_try).toBe(7_000_000)
    expect(summary.expenses_total_try).toBe(1_000_000)
  })

  it('revenue 10M, cost 3M, deductible 800k → matrah = 6.2M', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue({
      revenue_try: 10_000_000, cost_try: 3_000_000, gross_profit_try: 7_000_000,
    } as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue({
      total_try: 1_000_000, deductible_try: 800_000, non_deductible_try: 200_000,
    } as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue({
      sales_vat_try: 1_800_000, purchase_vat_try: 540_000, expense_vat_try: 180_000, net_vat_try: 1_080_000,
    } as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 10M - 3M - 0.8M = 6.2M
    expect(summary.matrah_try).toBe(6_200_000)
    // tax = 6.2M × 25% = 1.55M
    expect(summary.corporate_tax_try).toBe(1_550_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// FinancialSummary — additional field verification
// ─────────────────────────────────────────────────────────────────────────────

describe('FinancialSummary — additional field verification', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('matrah_try = revenue - cost - deductible_expenses', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    // matrah = 500k - 200k - 80k = 220k
    expect(summary.matrah_try).toBe(220_000)
  })

  it('corporate_tax_rate field is a number', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    expect(typeof summary.corporate_tax_rate).toBe('number')
  })

  it('all monetary fields are numbers', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    expect(typeof summary.revenue_try).toBe('number')
    expect(typeof summary.cost_try).toBe('number')
    expect(typeof summary.gross_profit_try).toBe('number')
    expect(typeof summary.matrah_try).toBe('number')
    expect(typeof summary.corporate_tax_try).toBe('number')
    expect(typeof summary.net_after_tax_try).toBe('number')
  })

  it('calling with different userId does not break assembly', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary('other-user', CO, PERIOD)
    expect(summary.revenue_try).toBe(500_000)
  })

  it('calling with different companyId does not break assembly', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, 'different-co', PERIOD)
    expect(summary.expenses_total_try).toBe(120_000)
  })

  it('net_after_tax_try equals EBT minus tax (true net income, DP-2)', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD)
    const ebt = summary.gross_profit_try - summary.expenses_total_try
    expect(summary.net_after_tax_try).toBe(ebt - summary.corporate_tax_try)
  })

  it('40% tax rate: 220k matrah → 88k tax; DP-2 net = EBT(180k) − 88k = 92k', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD, { corporate_tax_rate: 40 })
    expect(summary.corporate_tax_try).toBe(88_000)
    expect(summary.net_after_tax_try).toBe(92_000)
  })

  it('5% tax rate: 220k matrah → 11k tax; DP-2 net = EBT(180k) − 11k = 169k', async () => {
    vi.spyOn(FinanceService, 'getGrossProfit').mockResolvedValue(GROSS_STUB as never)
    vi.spyOn(FinanceService, 'getOperatingExpenses').mockResolvedValue(EXPENSES_STUB as never)
    const taxMod = await import('../lib/services/tax.service')
    vi.spyOn(taxMod.TaxService, 'getKdvNet').mockResolvedValue(VAT_STUB as never)

    const summary = await FinanceService.getFinancialSummary(USER, CO, PERIOD, { corporate_tax_rate: 5 })
    expect(summary.corporate_tax_try).toBe(11_000)
    expect(summary.net_after_tax_try).toBe(169_000)
  })
})
