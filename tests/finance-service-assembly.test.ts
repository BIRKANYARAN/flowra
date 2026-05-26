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
    expect(summary.corporate_tax_try).toBe(55_000)  // 220k × 25%
    expect(summary.net_after_tax_try).toBe(165_000) // 220k - 55k
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

    // matrah = 220k, tax at 20% = 44k, net = 176k
    expect(summary.corporate_tax_rate).toBe(20)
    expect(summary.corporate_tax_try).toBe(44_000)
    expect(summary.net_after_tax_try).toBe(176_000)
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
})
