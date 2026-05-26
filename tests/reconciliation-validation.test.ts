/**
 * Tests for lib/engines/reconciliation.engine.ts
 * Pure functions: runValidation(), buildConfidenceV2()
 *
 * ReconciliationData is large — we use partial objects cast via `as unknown as`
 * to test specific validation dimensions.
 *
 * Run with: npx vitest run tests/reconciliation-validation.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  runValidation,
  buildConfidenceV2,
} from '../lib/engines/reconciliation.engine'
import type { ReconciliationData } from '../types/reconciliation'

// ── Minimal ReconciliationData builder ────────────────────────────────────────

function makeMinimal(overrides: Record<string, unknown> = {}): ReconciliationData {
  return {
    section1:  {},
    section2:  { bank_accounts: [], total_cash_try: 0 },
    section3:  { total_receivables_try: 0, aging: { bucket_90plus: 0 } },
    section4:  {},
    section5:  { top_items: [], total_inventory_try: 0 },
    section6:  {},
    section7:  {},
    section8:  { partner_loans: 0 },
    section9:  {},
    section10: { total_partner_receivables: 0 },
    section11: { total_partner_liabilities: 0 },
    section12: {},
    section13: { total_ytd_distributions: 0 },
    section14: { total_assets: 0, total_liabilities: 0, total_equity: 0 },
    section15: { revenue_try: 0, gross_profit_try: 0, net_income_try: 0 },
    section16: {},
    section17: {},
    section18: {},
    section19: {},
    confidence_score:   0,
    confidence_factors: [],
    computed_at:        new Date().toISOString(),
    data_hash:          '',
    ...overrides,
  } as unknown as ReconciliationData
}

// ── runValidation — Balance Sheet check ───────────────────────────────────────

describe('runValidation — balance_sheet_check', () => {
  it('PASS when assets = liabilities + equity (zero variance)', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 600_000, total_equity: 400_000 },
    })
    const v = runValidation(sections)
    expect(v.balance_sheet_check.result).toBe('PASS')
    expect(v.balance_sheet_check.variance).toBeLessThan(1)
  })

  it('WARNING when variance is between ₺100 and ₺10000', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 600_000, total_equity: 398_000 },
    })
    const v = runValidation(sections)
    // variance = |1_000_000 - (600_000 + 398_000)| = 2000
    expect(v.balance_sheet_check.result).toBe('WARNING')
    expect(v.balance_sheet_check.variance).toBeCloseTo(2000, 0)
  })

  it('FAIL when variance exceeds ₺10000', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 200_000, total_equity: 200_000 },
    })
    const v = runValidation(sections)
    // variance = |1_000_000 - 400_000| = 600_000
    expect(v.balance_sheet_check.result).toBe('FAIL')
    expect(v.balance_sheet_check.severity).toBe('critical')
  })

  it('PASS for empty company (all zeros)', () => {
    const sections = makeMinimal()
    const v = runValidation(sections)
    expect(v.balance_sheet_check.result).toBe('PASS')
  })
})

// ── runValidation — Treasury check ───────────────────────────────────────────

describe('runValidation — treasury_check', () => {
  it('PASS when bank sum = total_cash_try', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 300_000 }, { balance_try: 200_000 }],
        total_cash_try: 500_000,
      },
    })
    const v = runValidation(sections)
    expect(v.treasury_check.result).toBe('PASS')
  })

  it('WARNING when bank sum differs by ₺500 (≥ ₺1, < ₺1000)', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 500_500 }],
        total_cash_try: 500_000,
      },
    })
    const v = runValidation(sections)
    expect(v.treasury_check.result).toBe('WARNING')
    expect(v.treasury_check.variance).toBeCloseTo(500, 0)
  })

  it('FAIL when bank sum differs by > ₺1000', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 200_000 }],
        total_cash_try: 500_000,
      },
    })
    const v = runValidation(sections)
    expect(v.treasury_check.result).toBe('FAIL')
  })

  it('PASS when no bank accounts and total_cash is 0', () => {
    const sections = makeMinimal()
    const v = runValidation(sections)
    expect(v.treasury_check.result).toBe('PASS')
  })
})

// ── runValidation — Profit check ──────────────────────────────────────────────

describe('runValidation — profit_check', () => {
  it('PASS when gross_profit ≥ 0 and revenue > 0', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 1_000_000, gross_profit_try: 200_000, net_income_try: 100_000 },
    })
    const v = runValidation(sections)
    expect(v.profit_check.result).toBe('PASS')
  })

  it('FAIL when gross_profit < 0', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 1_000_000, gross_profit_try: -50_000, net_income_try: -50_000 },
    })
    const v = runValidation(sections)
    expect(v.profit_check.result).toBe('FAIL')
  })

  it('WARNING when revenue = 0', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 0, gross_profit_try: 0, net_income_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.profit_check.result).toBe('WARNING')
  })

  it('PASS at exact break-even (gross_profit = 0, revenue > 0)', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 500_000, gross_profit_try: 0, net_income_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.profit_check.result).toBe('PASS')
  })
})

// ── runValidation — overall_status ────────────────────────────────────────────

describe('runValidation — overall_status', () => {
  it('PASS when all major checks pass', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 600_000, total_equity: 400_000 },
      section2:  { bank_accounts: [{ balance_try: 500_000 }], total_cash_try: 500_000 },
      section15: { revenue_try: 2_000_000, gross_profit_try: 500_000, net_income_try: 200_000 },
      // inventory_check returns WARNING when top_items is empty; provide matching items to PASS
      section5:  { top_items: [{ total_value: 150_000 }], total_inventory_try: 150_000 },
    })
    const v = runValidation(sections)
    expect(v.overall_status).toBe('PASS')
  })

  it('FAIL when balance_sheet check FAIL', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 200_000, total_equity: 200_000 },
    })
    const v = runValidation(sections)
    expect(v.overall_status).toBe('FAIL')
  })

  it('checks_total equals the number of named checks', () => {
    const sections = makeMinimal()
    const v = runValidation(sections)
    // 6 named checks
    expect(v.checks_total).toBe(6)
  })

  it('checks_passed ≤ checks_total', () => {
    const sections = makeMinimal()
    const v = runValidation(sections)
    expect(v.checks_passed).toBeLessThanOrEqual(v.checks_total)
  })
})

// ── buildConfidenceV2 — scoring ───────────────────────────────────────────────

describe('buildConfidenceV2 — scoring mechanics', () => {
  it('total score is sum of breakdown scores', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const sumOfBreakdown = cs.breakdown.reduce((s, b) => s + b.score, 0)
    expect(cs.total).toBeCloseTo(sumOfBreakdown, 1)
  })

  it('score is non-negative', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(cs.total).toBeGreaterThanOrEqual(0)
  })

  it('score is at most 100', () => {
    const sections = makeMinimal({
      section14: { total_assets: 1_000_000, total_liabilities: 600_000, total_equity: 400_000 },
      section2:  { bank_accounts: [{ balance_try: 500_000 }], total_cash_try: 500_000 },
      section15: { revenue_try: 2_000_000, gross_profit_try: 500_000, net_income_try: 200_000 },
      section5: {
        top_items:           [],
        total_inventory_try: 0,
        last_count_date:     new Date().toISOString().slice(0, 10),
      },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(cs.total).toBeLessThanOrEqual(100)
  })

  it('breakdown array has items', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(cs.breakdown.length).toBeGreaterThan(0)
  })

  it('each breakdown item has weight, score ≤ max_score', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    for (const b of cs.breakdown) {
      expect(b.weight).toBeGreaterThan(0)
      expect(b.score).toBeGreaterThanOrEqual(0)
      expect(b.max_score).toBeGreaterThanOrEqual(b.score)
    }
  })

  it('bank reconciliation factor gets full score when treasury PASS', () => {
    const sections = makeMinimal({
      section2: { bank_accounts: [{ balance_try: 500_000 }], total_cash_try: 500_000 },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const bankFactor = cs.breakdown.find(b => b.factor === 'Banka Mutabakatı')!
    expect(bankFactor).toBeDefined()
    expect(bankFactor.score).toBe(bankFactor.max_score)
  })

  it('receivable quality factor has lower score when 90+ day overdue > 20%', () => {
    const sections = makeMinimal({
      section3: {
        total_receivables_try: 100_000,
        aging: { bucket_90plus: 50_000 },  // 50% overdue
      },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const recvFactor = cs.breakdown.find(b => b.factor === 'Alacak Kalitesi')!
    expect(recvFactor).toBeDefined()
    expect(recvFactor.score).toBeLessThan(recvFactor.max_score)
  })

  it('grade is one of A/B/C/D/F', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(['A', 'B', 'C', 'D', 'F']).toContain(cs.grade)
  })

  it('interpretation is a non-empty string', () => {
    const sections   = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(typeof cs.interpretation).toBe('string')
    expect(cs.interpretation.length).toBeGreaterThan(0)
  })
})
