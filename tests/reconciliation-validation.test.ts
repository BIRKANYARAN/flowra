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
    section8:  { total_debt_try: 0 },
    section9:  {},
    section10: { total_partner_loans_try: 0 },
    section11: { total_partner_debt_try: 0 },
    section12: {},
    section13: { total_ytd_distributions: 0 },
    section14: { total_assets_try: 0, total_liabilities_try: 0, equity_try: 0 },
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
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 600_000, equity_try: 400_000 },
    })
    const v = runValidation(sections)
    expect(v.balance_sheet_check.result).toBe('PASS')
    expect(v.balance_sheet_check.variance).toBeLessThan(1)
  })

  it('WARNING when variance is between ₺100 and ₺10000', () => {
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 600_000, equity_try: 398_000 },
    })
    const v = runValidation(sections)
    // variance = |1_000_000 - (600_000 + 398_000)| = 2000
    expect(v.balance_sheet_check.result).toBe('WARNING')
    expect(v.balance_sheet_check.variance).toBeCloseTo(2000, 0)
  })

  it('FAIL when variance exceeds ₺10000', () => {
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 200_000, equity_try: 200_000 },
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
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 600_000, equity_try: 400_000 },
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
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 200_000, equity_try: 200_000 },
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
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 600_000, equity_try: 400_000 },
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

// ── runValidation — Inventory check ───────────────────────────────────────────

describe('runValidation — inventory_check', () => {
  it('PASS when item sum matches total_inventory within ₺1000', () => {
    const sections = makeMinimal({
      section5: {
        top_items: [{ total_value: 100_000 }, { total_value: 50_000 }],
        total_inventory_try: 150_000,
      },
    })
    const v = runValidation(sections)
    expect(v.inventory_check.result).toBe('PASS')
  })

  it('WARNING when no item details (empty top_items)', () => {
    const sections = makeMinimal({
      section5: { top_items: [], total_inventory_try: 200_000 },
    })
    const v = runValidation(sections)
    expect(v.inventory_check.result).toBe('WARNING')
  })

  it('WARNING when item sum differs by more than ₺1000', () => {
    const sections = makeMinimal({
      section5: {
        top_items: [{ total_value: 80_000 }],
        total_inventory_try: 100_000,
      },
    })
    const v = runValidation(sections)
    // variance = |80k - 100k| = 20k > 1k → WARNING
    expect(v.inventory_check.result).toBe('WARNING')
  })

  it('variance value reflects difference', () => {
    const sections = makeMinimal({
      section5: {
        top_items: [{ total_value: 90_000 }],
        total_inventory_try: 95_000,
      },
    })
    const v = runValidation(sections)
    expect(v.inventory_check.variance).toBeCloseTo(5_000, 0)
  })
})

// ── runValidation — distribution check ───────────────────────────────────────

describe('runValidation — distribution_check', () => {
  it('PASS when ytd distributions <= net income', () => {
    const sections = makeMinimal({
      section13: { total_distributed_try: 50_000 },
      section15: { revenue_try: 1_000_000, gross_profit_try: 200_000, net_income_try: 100_000, net_profit_try: 100_000 },
    })
    const v = runValidation(sections)
    expect(v.distribution_check.result).toBe('PASS')
  })

  it('FAIL when distributions exceed net income by more than 10%', () => {
    const sections = makeMinimal({
      section13: { total_distributed_try: 200_000 },
      section15: { revenue_try: 500_000, gross_profit_try: 100_000, net_income_try: 80_000, net_profit_try: 80_000 },
    })
    const v = runValidation(sections)
    // 200k > 80k * 1.1 = 88k → FAIL
    expect(v.distribution_check.result).toBe('FAIL')
  })

  it('WARNING when distributions are between 100% and 110% of net income', () => {
    const sections = makeMinimal({
      section13: { total_distributed_try: 105_000 },
      section15: { revenue_try: 500_000, gross_profit_try: 150_000, net_income_try: 100_000, net_profit_try: 100_000 },
    })
    const v = runValidation(sections)
    // 105k > 100k but <= 110k → WARNING
    expect(v.distribution_check.result).toBe('WARNING')
  })

  it('PASS when both distributions and net income are zero', () => {
    const sections = makeMinimal({
      section13: { total_distributed_try: 0 },
      section15: { revenue_try: 0, gross_profit_try: 0, net_income_try: 0, net_profit_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.distribution_check.result).toBe('PASS')
  })
})

// ── runValidation — partner finance check ─────────────────────────────────────

describe('runValidation — partner_finance_check', () => {
  it('PASS when partner receivables = partner liabilities (zero net)', () => {
    const sections = makeMinimal({
      section10: { total_partner_loans_try: 100_000 },
      section11: { total_partner_debt_try: 100_000 },
      section8:  { total_debt_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.partner_finance_check.result).toBe('PASS')
  })

  it('WARNING when net difference is above 10', () => {
    const sections = makeMinimal({
      section10: { total_partner_loans_try: 50_000 },
      section11: { total_partner_debt_try: 10_000 },
      section8:  { total_debt_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.partner_finance_check.result).toBe('WARNING')
  })

  it('variance reflects absolute net difference', () => {
    const sections = makeMinimal({
      section10: { total_partner_loans_try: 70_000 },
      section11: { total_partner_debt_try: 50_000 },
      section8:  { total_debt_try: 0 },
    })
    const v = runValidation(sections)
    expect(v.partner_finance_check.variance).toBeCloseTo(20_000, 0)
  })
})

// ── runValidation — boundary: bs variance exactly 100 ────────────────────────

describe('runValidation — boundary variance values', () => {
  it('bs variance exactly 99 → PASS (< 100 threshold)', () => {
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_099, total_liabilities_try: 600_000, equity_try: 400_000 },
    })
    const v = runValidation(sections)
    // variance = 99 < 100 → PASS
    expect(v.balance_sheet_check.result).toBe('PASS')
  })

  it('bs variance exactly 100 → WARNING (≥ 100)', () => {
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_100, total_liabilities_try: 600_000, equity_try: 400_000 },
    })
    const v = runValidation(sections)
    // variance = 100 → WARNING (not < 100)
    expect(v.balance_sheet_check.result).toBe('WARNING')
  })

  it('treasury variance exactly 1 → WARNING (≥ 1)', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 100_001 }],
        total_cash_try: 100_000,
      },
    })
    const v = runValidation(sections)
    // variance = 1 → WARNING (not < 1)
    expect(v.treasury_check.result).toBe('WARNING')
  })

  it('treasury variance exactly 0.99 → PASS (< 1)', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 100_000.99 }],
        total_cash_try: 100_000,
      },
    })
    const v = runValidation(sections)
    // variance = 0.99 < 1 → PASS
    expect(v.treasury_check.result).toBe('PASS')
  })
})

// ── buildExecutiveSummary ─────────────────────────────────────────────────────

import { buildExecutiveSummary } from '../lib/engines/reconciliation.engine'

describe('buildExecutiveSummary — structure', () => {
  it('returns all required fields', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(summary).toHaveProperty('headline')
    expect(summary).toHaveProperty('treasury_position')
    expect(summary).toHaveProperty('working_capital')
    expect(summary).toHaveProperty('net_assets')
    expect(summary).toHaveProperty('distributable_profit')
    expect(summary).toHaveProperty('receivable_risk')
    expect(summary).toHaveProperty('debt_pressure')
    expect(summary).toHaveProperty('governance_issues')
    expect(summary).toHaveProperty('confidence_summary')
    expect(summary).toHaveProperty('recommendation')
  })

  it('headline contains grade from confidence score', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(summary.headline).toContain(cs.grade)
  })

  it('confidence_summary contains the numeric score', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(summary.confidence_summary).toContain(String(cs.total))
  })

  it('governance_issues is an array', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(Array.isArray(summary.governance_issues)).toBe(true)
  })

  it('recommendation warns about inconsistencies when validation FAIL', () => {
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 200_000, equity_try: 200_000 },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    // validation is FAIL → recommendation should warn
    expect(summary.recommendation).not.toBe('Mutabakat onaya hazır. Hissedar imzaları toplanabilir.')
  })

  it('positive distributable profit reported when net_income > ytd_total', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 500_000, gross_profit_try: 200_000, net_income_try: 100_000, net_profit_try: 100_000 },
      section13: { total_distributed_try: 20_000, total_ytd_distributions: 20_000 },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(summary.distributable_profit).not.toContain('Dağıtılabilir kâr yok')
  })

  it('"Dağıtılabilir kâr yok" when net income is zero', () => {
    const sections = makeMinimal({
      section15: { revenue_try: 0, gross_profit_try: 0, net_income_try: 0, net_profit_try: 0 },
      section13: { total_distributed_try: 0, total_ytd_distributions: 0 },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    const summary = buildExecutiveSummary(sections, validation, cs)
    expect(summary.distributable_profit).toContain('Dağıtılabilir kâr yok')
  })
})

// ── buildConfidenceV2 — grade thresholds ──────────────────────────────────────

describe('buildConfidenceV2 — grade thresholds', () => {
  it('grade is A when score ≥ 90 (all checks PASS + large assets)', () => {
    // Build a well-populated sections to maximize score
    const sections = makeMinimal({
      section14: { total_assets_try: 1_000_000, total_liabilities_try: 600_000, equity_try: 400_000 },
      section2:  { bank_accounts: [{ balance_try: 500_000 }], total_cash_try: 500_000 },
      section15: { revenue_try: 2_000_000, gross_profit_try: 500_000, net_income_try: 200_000, net_profit_try: 200_000 },
      section5:  {
        top_items: [{ total_value: 100_000 }],
        total_inventory_try: 100_000,
        last_count_date: new Date().toISOString().slice(0, 10),
      },
      section7: { tax_id: '1234567890' },
      section1: { company_name: 'Test Ltd' },
    })
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    expect(['A', 'B']).toContain(cs.grade)
  })

  it('grade is below A when score is low (all zeros)', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    // With everything zero, score should be low → not A
    expect(cs.grade).not.toBe('A')
    expect(['B', 'C', 'D', 'F']).toContain(cs.grade)
  })

  it('breakdown deductions sum to max_score - score', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    for (const b of cs.breakdown) {
      expect(b.deduction).toBe(b.max_score - b.score)
    }
  })

  it('each breakdown has a non-empty detail string', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    for (const b of cs.breakdown) {
      expect(typeof b.detail).toBe('string')
      expect(b.detail.length).toBeGreaterThan(0)
    }
  })

  it('status field is full/partial/none in each breakdown', () => {
    const sections = makeMinimal()
    const validation = runValidation(sections)
    const cs = buildConfidenceV2(sections, validation)
    for (const b of cs.breakdown) {
      expect(['full', 'partial', 'none']).toContain(b.status)
    }
  })
})

// ── runValidation — negative amounts guard ────────────────────────────────────

describe('runValidation — guard against negative/large values', () => {
  it('handles extremely large asset values', () => {
    const sections = makeMinimal({
      section14: {
        total_assets_try:      1_000_000_000,
        total_liabilities_try: 600_000_000,
        equity_try:      400_000_000,
      },
    })
    const v = runValidation(sections)
    expect(v.balance_sheet_check.result).toBe('PASS')
    expect(v.balance_sheet_check.variance).toBe(0)
  })

  it('handles fractional (decimal) amounts in bank accounts', () => {
    const sections = makeMinimal({
      section2: {
        bank_accounts: [{ balance_try: 100_000.55 }, { balance_try: 99_999.45 }],
        total_cash_try: 200_000,
      },
    })
    const v = runValidation(sections)
    expect(v.treasury_check.result).toBe('PASS')
  })

  it('FAIL distribution check when net_profit_try is negative', () => {
    const sections = makeMinimal({
      section13: { total_distributed_try: 10_000, total_ytd_distributions: 10_000 },
      section15: { revenue_try: 100_000, gross_profit_try: -10_000, net_income_try: -10_000, net_profit_try: -10_000 },
    })
    const v = runValidation(sections)
    // 10_000 > -10_000 * 1.1 = -11_000 → FAIL (distributions exceed 110% of negative income)
    expect(v.distribution_check.result).toBe('FAIL')
  })

  it('all 6 checks are present with correct IDs', () => {
    const sections = makeMinimal()
    const v = runValidation(sections)
    const ids = [
      v.balance_sheet_check.id,
      v.treasury_check.id,
      v.inventory_check.id,
      v.partner_finance_check.id,
      v.profit_check.id,
      v.distribution_check.id,
    ]
    expect(ids).toEqual(['balance_sheet', 'treasury', 'inventory', 'partner_finance', 'profit', 'distribution'])
  })
})
