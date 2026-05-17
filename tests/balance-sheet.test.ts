/**
 * Tests for:
 *   lib/finance/cash.ts          — computeCashPosition()
 *   lib/finance/balance-sheet.ts — computeBalanceSheet(), balanceSheetRows()
 *
 * Both modules are pure — no DB, no I/O.
 * Run with: npx vitest run tests/balance-sheet.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeCashPosition } from '../lib/finance/cash'
import { computeBalanceSheet, balanceSheetRows } from '../lib/finance/balance-sheet'
import type { CfoMetrics } from '../lib/finance/cfo-metrics'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal CfoMetrics fixture for balance sheet tests */
function mkMetrics(overrides: {
  cash?:        Partial<CfoMetrics['cash']>
  receivables?: Partial<CfoMetrics['receivables']>
  stock?:       Partial<CfoMetrics['stock']>
  tax?:         Partial<CfoMetrics['tax']>
  partner?:     Partial<CfoMetrics['partner']>
  burn?:        Partial<CfoMetrics['burn']>
} = {}): CfoMetrics {
  return {
    cash: {
      true_cash_position:  200_000,
      operational_cash:    100_000,
      restricted_cash:      20_000,
      distributable_cash:  180_000,
      ...overrides.cash,
    },
    receivables: {
      total_outstanding:   50_000,
      overdue_30d:         10_000,
      overdue_60d:          5_000,
      overdue_90d:          2_000,
      collection_rate_pct: 80,
      ...overrides.receivables,
    },
    stock: {
      fifo_value:      30_000,
      coverage_months: 3,
      ...overrides.stock,
    },
    tax: {
      kdv_net:                15_000,
      corporate_tax_estimate: 25_000,
      total_fiscal_obligation: 40_000,
      ...overrides.tax,
    },
    partner: {
      total_equity:    100_000,
      total_loans:      40_000,
      total_dividends:  10_000,
      company_owes:    140_000,
      ...overrides.partner,
    },
    burn: {
      monthly_burn_rate:    30_000,
      runway_months:        6,
      runway_days:          183,
      cash_exhaustion_date: '2026-07-03',
      ...overrides.burn,
    },
  }
}

// ── computeCashPosition ───────────────────────────────────────────────────────

describe('computeCashPosition', () => {
  it('cashBalance = paymentsReceived - paidExpenses', () => {
    const result = computeCashPosition({ paymentsReceived: 300_000, paidExpenses: 180_000, unpaidExpenses: 0 })
    expect(result.cashBalance).toBe(120_000)
  })

  it('outstandingObligations = unpaidExpenses', () => {
    const result = computeCashPosition({ paymentsReceived: 0, paidExpenses: 0, unpaidExpenses: 45_000 })
    expect(result.outstandingObligations).toBe(45_000)
  })

  it('cashDistributable = max(0, cashBalance - outstanding)', () => {
    const result = computeCashPosition({
      paymentsReceived: 200_000,
      paidExpenses:     100_000,
      unpaidExpenses:    40_000,
    })
    // cashBalance = 100_000, distributable = 100_000 - 40_000 = 60_000
    expect(result.cashDistributable).toBe(60_000)
  })

  it('cashDistributable clamped at 0 when obligations exceed cash balance', () => {
    const result = computeCashPosition({
      paymentsReceived:  50_000,
      paidExpenses:      40_000,
      unpaidExpenses:    20_000,   // 10_000 balance - 20_000 obligations = negative
    })
    expect(result.cashDistributable).toBe(0)
  })

  it('all zeros → all zeros', () => {
    const result = computeCashPosition({ paymentsReceived: 0, paidExpenses: 0, unpaidExpenses: 0 })
    expect(result.cashBalance).toBe(0)
    expect(result.outstandingObligations).toBe(0)
    expect(result.cashDistributable).toBe(0)
  })

  it('negative cashBalance (more paid than received) → distributable = 0', () => {
    const result = computeCashPosition({
      paymentsReceived:  10_000,
      paidExpenses:      50_000,
      unpaidExpenses:         0,
    })
    expect(result.cashBalance).toBe(-40_000)
    expect(result.cashDistributable).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    const result = computeCashPosition({
      paymentsReceived: 1.005,
      paidExpenses:     0,
      unpaidExpenses:   0,
    })
    // round2(1.005) = 1.01 (banker's rounding via Number.EPSILON guard)
    expect(result.cashBalance).toBeCloseTo(1.01, 2)
  })
})

// ── computeBalanceSheet ───────────────────────────────────────────────────────

describe('computeBalanceSheet — assets', () => {
  it('currentAssets.cash = metrics.cash.true_cash_position', () => {
    const bs = computeBalanceSheet(mkMetrics({ cash: { true_cash_position: 150_000 } }))
    expect(bs.currentAssets.cash).toBe(150_000)
  })

  it('currentAssets.receivables = metrics.receivables.total_outstanding', () => {
    const bs = computeBalanceSheet(mkMetrics({ receivables: { total_outstanding: 75_000 } }))
    expect(bs.currentAssets.receivables).toBe(75_000)
  })

  it('currentAssets.inventory = metrics.stock.fifo_value', () => {
    const bs = computeBalanceSheet(mkMetrics({ stock: { fifo_value: 40_000 } }))
    expect(bs.currentAssets.inventory).toBe(40_000)
  })

  it('currentAssets.total = cash + receivables + inventory', () => {
    const bs = computeBalanceSheet(mkMetrics({
      cash:        { true_cash_position: 100_000 },
      receivables: { total_outstanding:  50_000 },
      stock:       { fifo_value:         20_000 },
    }))
    expect(bs.currentAssets.total).toBe(170_000)
  })

  it('nonCurrentAssets.total is always 0 (not yet tracked)', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.nonCurrentAssets.total).toBe(0)
  })

  it('totalAssets = currentAssets.total + 0', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.totalAssets).toBe(bs.currentAssets.total)
  })
})

describe('computeBalanceSheet — liabilities', () => {
  it('vatPayable = max(0, kdv_net) — positive kdv_net flows through', () => {
    const bs = computeBalanceSheet(mkMetrics({ tax: { kdv_net: 12_000, corporate_tax_estimate: 0, total_fiscal_obligation: 12_000 } }))
    expect(bs.currentLiabilities.vatPayable).toBe(12_000)
  })

  it('vatPayable = 0 when kdv_net is negative (carry-forward)', () => {
    const bs = computeBalanceSheet(mkMetrics({ tax: { kdv_net: -5_000, corporate_tax_estimate: 0, total_fiscal_obligation: 0 } }))
    expect(bs.currentLiabilities.vatPayable).toBe(0)
  })

  it('corporateTax = metrics.tax.corporate_tax_estimate', () => {
    const bs = computeBalanceSheet(mkMetrics({ tax: { kdv_net: 0, corporate_tax_estimate: 30_000, total_fiscal_obligation: 30_000 } }))
    expect(bs.currentLiabilities.corporateTax).toBe(30_000)
  })

  it('partnerPayable = metrics.partner.company_owes', () => {
    const bs = computeBalanceSheet(mkMetrics({ partner: { total_equity: 80_000, total_loans: 20_000, total_dividends: 0, company_owes: 100_000 } }))
    expect(bs.currentLiabilities.partnerPayable).toBe(100_000)
  })

  it('currentLiabilities.total = vat + tax + partnerPayable', () => {
    const bs = computeBalanceSheet(mkMetrics({
      tax:     { kdv_net: 10_000, corporate_tax_estimate: 20_000, total_fiscal_obligation: 30_000 },
      partner: { total_equity: 0, total_loans: 0, total_dividends: 0, company_owes: 50_000 },
    }))
    expect(bs.currentLiabilities.total).toBe(80_000) // 10+20+50
  })

  it('totalLiabilities = currentLiabilities.total (non-current = 0)', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.totalLiabilities).toBe(bs.currentLiabilities.total)
  })
})

describe('computeBalanceSheet — equity', () => {
  it('paidInCapital = partner.total_equity', () => {
    const bs = computeBalanceSheet(mkMetrics({ partner: { total_equity: 120_000, total_loans: 0, total_dividends: 0, company_owes: 120_000 } }))
    expect(bs.equity.paidInCapital).toBe(120_000)
  })

  it('retainedEarnings = totalAssets - totalLiabilities - paidInCapital', () => {
    const bs = computeBalanceSheet(mkMetrics())
    const expected = bs.totalAssets - bs.totalLiabilities - bs.equity.paidInCapital
    expect(bs.equity.retainedEarnings).toBeCloseTo(expected, 2)
  })

  it('equity.total = paidInCapital + retainedEarnings', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.equity.total).toBeCloseTo(bs.equity.paidInCapital + bs.equity.retainedEarnings, 2)
  })
})

describe('computeBalanceSheet — accounting identity', () => {
  it('totalLiabilitiesAndEquity = totalLiabilities + equity.total', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.totalLiabilitiesAndEquity).toBeCloseTo(bs.totalLiabilities + bs.equity.total, 2)
  })

  it('isBalanced = true (assets = liabilities + equity by construction)', () => {
    // The function computes retained earnings as the residual, so it's always balanced
    const bs = computeBalanceSheet(mkMetrics())
    expect(bs.isBalanced).toBe(true)
  })

  it('isBalanced is always true regardless of input values', () => {
    const scenarios = [
      mkMetrics({ cash: { true_cash_position: 0 } }),
      mkMetrics({ partner: { total_equity: 1_000_000, total_loans: 0, total_dividends: 0, company_owes: 1_000_000 } }),
      mkMetrics({ tax: { kdv_net: -50_000, corporate_tax_estimate: 0, total_fiscal_obligation: 0 } }),
    ]
    for (const m of scenarios) {
      const bs = computeBalanceSheet(m)
      expect(bs.isBalanced).toBe(true)
    }
  })

  it('totalAssets === totalLiabilitiesAndEquity (within 1 unit)', () => {
    const bs = computeBalanceSheet(mkMetrics())
    expect(Math.abs(bs.totalAssets - bs.totalLiabilitiesAndEquity)).toBeLessThan(1)
  })
})

// ── balanceSheetRows ──────────────────────────────────────────────────────────

describe('balanceSheetRows — asset rows', () => {
  it('returns assets array with expected labels', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const labels = rows.assets.map(r => r.label)
    expect(labels).toContain('Nakit ve Nakit Benzerleri')
    expect(labels).toContain('Ticari Alacaklar')
    expect(labels).toContain('Stok (FIFO)')
    expect(labels).toContain('TOPLAM VARLIKLAR')
  })

  it('total assets row amount matches computeBalanceSheet.totalAssets', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const totalRow = rows.assets.find(r => r.label === 'TOPLAM VARLIKLAR')
    expect(totalRow?.amount).toBe(bs.totalAssets)
  })

  it('cash row uses correct amount', () => {
    const bs   = computeBalanceSheet(mkMetrics({ cash: { true_cash_position: 99_000 } }))
    const rows = balanceSheetRows(bs)
    const cashRow = rows.assets.find(r => r.label === 'Nakit ve Nakit Benzerleri')
    expect(cashRow?.amount).toBe(99_000)
  })
})

describe('balanceSheetRows — liabilities + equity rows', () => {
  it('returns liabilitiesAndEquity array with expected labels', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const labels = rows.liabilitiesAndEquity.map(r => r.label)
    expect(labels).toContain('KDV Yükümlülüğü')
    expect(labels).toContain('Kurumlar Vergisi Tahmini')
    expect(labels).toContain('Ortaklara Borç')
    expect(labels).toContain('Ödenmiş Sermaye (Ortak Katkısı)')
    expect(labels).toContain('Dağıtılmamış Kâr / Zarar')
    expect(labels).toContain('TOPLAM KAYNAKLAR')
  })

  it('TOPLAM KAYNAKLAR row amount matches totalLiabilitiesAndEquity', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const totalRow = rows.liabilitiesAndEquity.find(r => r.label === 'TOPLAM KAYNAKLAR')
    expect(totalRow?.amount).toBe(bs.totalLiabilitiesAndEquity)
  })

  it('retained earnings row uses correct amount', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const retainedRow = rows.liabilitiesAndEquity.find(r => r.label === 'Dağıtılmamış Kâr / Zarar')
    expect(retainedRow?.amount).toBe(bs.equity.retainedEarnings)
  })

  it('isTotal flags are set on total rows', () => {
    const bs   = computeBalanceSheet(mkMetrics())
    const rows = balanceSheetRows(bs)
    const totalAssetRow = rows.assets.find(r => r.label === 'TOPLAM VARLIKLAR')
    const totalSourceRow = rows.liabilitiesAndEquity.find(r => r.label === 'TOPLAM KAYNAKLAR')
    expect(totalAssetRow?.isTotal).toBe(true)
    expect(totalSourceRow?.isTotal).toBe(true)
  })
})
