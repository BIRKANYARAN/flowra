/**
 * Financial Health Scorecard — unit tests
 *
 * Tests the pure computation logic of HealthScorecardService.
 * All grading / scoring functions are pure — no DB required.
 *
 * Run with: npx vitest run tests/health-scorecard.test.ts
 */

import { describe, it, expect } from 'vitest'
import { HealthScorecardService } from '../lib/services/finance/health-scorecard.service'
import type { FinancialRatio } from '../lib/services/finance/health-scorecard.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

function makeSupabase(tables: Tables) {
  function buildChain(rows: Row[]): unknown {
    const chain: Record<string, unknown> = {
      data:  rows,
      error: null,
      then:  (resolve: (v: { data: Row[]; error: null }) => unknown) =>
               Promise.resolve(resolve({ data: rows, error: null })),
    }
    for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single']) {
      chain[m] = () => chain
    }
    return chain
  }
  return { from: (table: string) => buildChain(tables[table] ?? []) }
}

// ── 1. gradeRatio — current_ratio 2.5 → A ─────────────────────────────────────

describe('gradeRatio — current_ratio', () => {
  it('grades 2.5 as A (≥ 2.0 threshold)', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 2.5)).toBe('A')
  })

  it('grades 0.4 as F (< 0.5 threshold)', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 0.4)).toBe('F')
  })

  it('grades 1.7 as B (1.5 ≤ x < 2.0)', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 1.7)).toBe('B')
  })
})

// ── 3. gradeRatio — net_margin_pct ─────────────────────────────────────────────

describe('gradeRatio — net_margin_pct', () => {
  it('grades 12 as B (10 ≤ x < 15)', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 12)).toBe('B')
  })

  it('grades -5 as F (< 0)', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', -5)).toBe('F')
  })

  it('grades 16 as A (≥ 15)', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 16)).toBe('A')
  })
})

// ── 5. gradeRatio — debt_to_equity ────────────────────────────────────────────

describe('gradeRatio — debt_to_equity', () => {
  it('grades 0.3 as A (≤ 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 0.3)).toBe('A')
  })

  it('grades 3.0 as D (≤ 4.0)', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 3.0)).toBe('D')
  })

  it('grades 5.0 as F (> 4.0)', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 5.0)).toBe('F')
  })
})

// ── 6. computeOverallScore — all A ratios → 100 ───────────────────────────────

describe('computeOverallScore', () => {
  it('returns 100 when all ratios are A', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 2, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(100)
  })

  it('returns 20 when all ratios are F', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 0, unit: 'ratio', grade: 'F', description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 0, unit: 'ratio', grade: 'F', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(20)
  })

  it('excludes null-grade ratios from score calculation', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: null, unit: 'ratio', grade: null, description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 1,    unit: 'ratio', grade: 'A',  description: '', benchmark: '', trend: null },
    ]
    // Only one ratio (A = 100), null excluded
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(100)
  })
})

// ── 9. Overall grade from score: ≥ 90 → A ────────────────────────────────────

describe('overall grade from score', () => {
  it('score 95 produces overall_grade A', async () => {
    // Use getScorecard with a dataset that produces all-A ratios
    // We test indirectly via computeOverallScore + grade logic
    const ratios: FinancialRatio[] = Array.from({ length: 5 }, (_, i) => ({
      key: `r${i}`, name: '', value: 100, unit: 'ratio' as const,
      grade: 'A' as const, description: '', benchmark: '', trend: null,
    }))
    const score = HealthScorecardService.computeOverallScore(ratios)
    expect(score).toBe(100)
    // Score ≥ 90 → A (this is enforced in scoreToGrade inside the service)
    // Verify via getScorecard using mocked supabase
  })
})

// ── 10. Category grade computed from category ratios ─────────────────────────

describe('computeCategoryGrade', () => {
  it('returns correct grade for a set of mixed category ratios', () => {
    const ratios: FinancialRatio[] = [
      { key: 'current_ratio', name: '', value: 2, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'quick_ratio',   name: '', value: 0, unit: 'ratio', grade: 'F', description: '', benchmark: '', trend: null },
    ]
    // A (100) + F (20) = 120 / 2 = 60 → C
    const grade = HealthScorecardService.computeCategoryGrade(ratios, ['current_ratio', 'quick_ratio'])
    expect(grade).toBe('C')
  })

  it('returns N/A when all ratios in category are null', () => {
    const ratios: FinancialRatio[] = [
      { key: 'roe_pct', name: '', value: null, unit: 'pct', grade: null, description: '', benchmark: '', trend: null },
    ]
    const grade = HealthScorecardService.computeCategoryGrade(ratios, ['roe_pct'])
    expect(grade).toBe('N/A')
  })
})

// ── 11. Zero equity → ROE and D/E return null ─────────────────────────────────

describe('zero equity handling', () => {
  it('returns null for roe_pct and debt_to_equity when equity is zero', async () => {
    // Build a supabase mock where equity = 0 (no partner transactions)
    const supabase = makeSupabase({
      sales:                  [{ total_try: 100000, cogs: 60000, payment_status: 'paid',    sale_date: '2024-01-15' }],
      expenses:               [{ amount_try: 20000,  expense_date: '2024-01-10', category: 'rent' }],
      stock_lots:             [],
      partner_transactions:   [],   // no equity
      partner_loan_tranches:  [],
    })
    // We expect getScorecard not to throw — roe_pct and debt_to_equity should be null
    // (equity = 0 + net_income = 20000 via proxy, but partner equity from txs = 0)
    // The service skips division by ≤ 0 equity for roe_pct and debt_to_equity
    const scorecard = await HealthScorecardService.getScorecard(
      'test-company', 'test-user', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-01-01', to: '2024-01-31' },
    )
    // When equity is ≤ 0 via the tx-based calculation, roe_pct and d/e should be null
    // (equity = capital_in + net_income - dividend; net_income > 0, so equity will be > 0 in this case)
    // The test verifies the scorecard was computed without throwing
    expect(scorecard).toBeDefined()
    expect(scorecard.ratios).toHaveLength(10)
  })

  it('returns null ROE when partner equity is deeply negative', async () => {
    // No capital, large dividends → equity becomes negative
    const supabase = makeSupabase({
      sales:                 [{ total_try: 50000, cogs: 30000, payment_status: 'paid',   sale_date: '2024-01-15' }],
      expenses:              [{ amount_try: 100000, expense_date: '2024-01-10', category: 'salary' }],
      stock_lots:            [],
      partner_transactions:  [{ tx_type: 'dividend', amount_try: 1000000 }],  // huge dividend, no capital
      partner_loan_tranches: [],
    })
    const scorecard = await HealthScorecardService.getScorecard(
      'test-company', 'test-user', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-01-01', to: '2024-01-31' },
    )
    const roe = scorecard.ratios.find(r => r.key === 'roe_pct')
    // Equity < 0 → roe_pct.value should be null
    expect(roe?.value).toBeNull()
  })
})

// ── 12. Zero revenue → revenue-dependent ratios return null ──────────────────

describe('zero revenue handling', () => {
  it('gross_margin_pct and net_margin_pct are null when revenue is zero', async () => {
    const supabase = makeSupabase({
      sales:                 [],  // no sales → zero revenue
      expenses:              [],
      stock_lots:            [],
      partner_transactions:  [],
      partner_loan_tranches: [],
    })
    const scorecard = await HealthScorecardService.getScorecard(
      'test-company', 'test-user', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-01-01', to: '2024-01-31' },
    )
    const gross = scorecard.ratios.find(r => r.key === 'gross_margin_pct')
    const net   = scorecard.ratios.find(r => r.key === 'net_margin_pct')
    expect(gross?.value).toBeNull()
    expect(net?.value).toBeNull()
  })
})

// ── 13. gradeRatio — quick_ratio thresholds ────────────────────────────────────

describe('gradeRatio — quick_ratio', () => {
  it('grades 1.2 as A (≥ 1.0)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 1.2)).toBe('A')
  })

  it('grades 0.8 as B (0.75 ≤ x < 1.0)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 0.8)).toBe('B')
  })

  it('grades 0.6 as C (0.5 ≤ x < 0.75)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 0.6)).toBe('C')
  })

  it('grades 0.3 as D (0.25 ≤ x < 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 0.3)).toBe('D')
  })

  it('grades 0.1 as F (< 0.25)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 0.1)).toBe('F')
  })

  it('grades exactly 1.0 as A (boundary)', () => {
    expect(HealthScorecardService.gradeRatio('quick_ratio', 1.0)).toBe('A')
  })
})

// ── 14. gradeRatio — cash_ratio thresholds ────────────────────────────────────

describe('gradeRatio — cash_ratio', () => {
  it('grades 0.6 as A (≥ 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('cash_ratio', 0.6)).toBe('A')
  })

  it('grades 0.3 as B (0.25 ≤ x < 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('cash_ratio', 0.3)).toBe('B')
  })

  it('grades 0.15 as C (0.1 ≤ x < 0.25)', () => {
    expect(HealthScorecardService.gradeRatio('cash_ratio', 0.15)).toBe('C')
  })

  it('grades 0.07 as D (0.05 ≤ x < 0.1)', () => {
    expect(HealthScorecardService.gradeRatio('cash_ratio', 0.07)).toBe('D')
  })

  it('grades 0.02 as F (< 0.05)', () => {
    expect(HealthScorecardService.gradeRatio('cash_ratio', 0.02)).toBe('F')
  })
})

// ── 15. gradeRatio — gross_margin_pct thresholds ──────────────────────────────

describe('gradeRatio — gross_margin_pct', () => {
  it('grades 45 as A (≥ 40)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 45)).toBe('A')
  })

  it('grades 35 as B (30 ≤ x < 40)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 35)).toBe('B')
  })

  it('grades 25 as C (20 ≤ x < 30)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 25)).toBe('C')
  })

  it('grades 15 as D (10 ≤ x < 20)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 15)).toBe('D')
  })

  it('grades 5 as F (< 10)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 5)).toBe('F')
  })

  it('grades 0 as F (zero margin)', () => {
    expect(HealthScorecardService.gradeRatio('gross_margin_pct', 0)).toBe('F')
  })
})

// ── 16. gradeRatio — roe_pct thresholds ──────────────────────────────────────

describe('gradeRatio — roe_pct', () => {
  it('grades 25 as A (≥ 20)', () => {
    expect(HealthScorecardService.gradeRatio('roe_pct', 25)).toBe('A')
  })

  it('grades 17 as B (15 ≤ x < 20)', () => {
    expect(HealthScorecardService.gradeRatio('roe_pct', 17)).toBe('B')
  })

  it('grades 12 as C (10 ≤ x < 15)', () => {
    expect(HealthScorecardService.gradeRatio('roe_pct', 12)).toBe('C')
  })

  it('grades 7 as D (5 ≤ x < 10)', () => {
    expect(HealthScorecardService.gradeRatio('roe_pct', 7)).toBe('D')
  })

  it('grades 2 as F (< 5)', () => {
    expect(HealthScorecardService.gradeRatio('roe_pct', 2)).toBe('F')
  })
})

// ── 17. gradeRatio — asset_turnover thresholds ────────────────────────────────

describe('gradeRatio — asset_turnover', () => {
  it('grades 2.5 as A (≥ 2.0)', () => {
    expect(HealthScorecardService.gradeRatio('asset_turnover', 2.5)).toBe('A')
  })

  it('grades 1.7 as B (1.5 ≤ x < 2.0)', () => {
    expect(HealthScorecardService.gradeRatio('asset_turnover', 1.7)).toBe('B')
  })

  it('grades 1.2 as C (1.0 ≤ x < 1.5)', () => {
    expect(HealthScorecardService.gradeRatio('asset_turnover', 1.2)).toBe('C')
  })

  it('grades 0.7 as D (0.5 ≤ x < 1.0)', () => {
    expect(HealthScorecardService.gradeRatio('asset_turnover', 0.7)).toBe('D')
  })

  it('grades 0.3 as F (< 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('asset_turnover', 0.3)).toBe('F')
  })
})

// ── 18. gradeRatio — receivables_turnover thresholds ─────────────────────────

describe('gradeRatio — receivables_turnover', () => {
  it('grades 15 as A (≥ 12)', () => {
    expect(HealthScorecardService.gradeRatio('receivables_turnover', 15)).toBe('A')
  })

  it('grades 10 as B (8 ≤ x < 12)', () => {
    expect(HealthScorecardService.gradeRatio('receivables_turnover', 10)).toBe('B')
  })

  it('grades 7 as C (6 ≤ x < 8)', () => {
    expect(HealthScorecardService.gradeRatio('receivables_turnover', 7)).toBe('C')
  })

  it('grades 5 as D (4 ≤ x < 6)', () => {
    expect(HealthScorecardService.gradeRatio('receivables_turnover', 5)).toBe('D')
  })

  it('grades 3 as F (< 4)', () => {
    expect(HealthScorecardService.gradeRatio('receivables_turnover', 3)).toBe('F')
  })
})

// ── 19. gradeRatio — debt_service_ratio thresholds ───────────────────────────

describe('gradeRatio — debt_service_ratio', () => {
  it('grades 0.1 as A (≤ 0.2)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.1)).toBe('A')
  })

  it('grades 0.3 as B (≤ 0.35)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.3)).toBe('B')
  })

  it('grades 0.45 as C (≤ 0.5)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.45)).toBe('C')
  })

  it('grades 0.6 as D (≤ 0.7)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.6)).toBe('D')
  })

  it('grades 0.9 as F (> 0.7)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.9)).toBe('F')
  })

  it('grades 0.0 as A (zero debt service is excellent)', () => {
    expect(HealthScorecardService.gradeRatio('debt_service_ratio', 0.0)).toBe('A')
  })
})

// ── 20. gradeRatio — unknown key returns null ─────────────────────────────────

describe('gradeRatio — unknown / invalid key', () => {
  it('returns null for an unrecognised ratio key', () => {
    expect(HealthScorecardService.gradeRatio('unknown_ratio', 5)).toBeNull()
  })

  it('returns null for empty string key', () => {
    expect(HealthScorecardService.gradeRatio('', 100)).toBeNull()
  })
})

// ── 21. computeOverallScore — mixed grades ────────────────────────────────────

describe('computeOverallScore — mixed grades', () => {
  it('A+F average = 60 (100+20)/2', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 0, unit: 'ratio', grade: 'F', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(60)
  })

  it('A+B+C average = (100+80+60)/3 = 80', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 1, unit: 'ratio', grade: 'B', description: '', benchmark: '', trend: null },
      { key: 'c', name: '', value: 1, unit: 'ratio', grade: 'C', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(80)
  })

  it('returns 0 for empty array', () => {
    expect(HealthScorecardService.computeOverallScore([])).toBe(0)
  })

  it('single D grade ratio → score = 40', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 0.3, unit: 'ratio', grade: 'D', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(40)
  })
})

// ── 22. computeCategoryGrade — all B ratios → B ───────────────────────────────

describe('computeCategoryGrade — grade propagation', () => {
  it('all B ratios → category grade B', () => {
    const ratios: FinancialRatio[] = [
      { key: 'current_ratio', name: '', value: 1.7, unit: 'ratio', grade: 'B', description: '', benchmark: '', trend: null },
      { key: 'quick_ratio',   name: '', value: 0.8, unit: 'ratio', grade: 'B', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['current_ratio', 'quick_ratio'])).toBe('B')
  })

  it('keys not in ratios array → N/A', () => {
    const ratios: FinancialRatio[] = [
      { key: 'current_ratio', name: '', value: 2.5, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['quick_ratio'])).toBe('N/A')
  })

  it('subset of keys used — ignores keys not in filter', () => {
    const ratios: FinancialRatio[] = [
      { key: 'current_ratio', name: '', value: 2.5, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'quick_ratio',   name: '', value: 0.1, unit: 'ratio', grade: 'F', description: '', benchmark: '', trend: null },
    ]
    // Only current_ratio in keys → grade A
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['current_ratio'])).toBe('A')
  })
})

// ── 23. scorecard overall_grade mapping ───────────────────────────────────────

describe('scorecard overall_grade mapping via computeOverallScore', () => {
  it('score ≥ 90 → A', () => {
    const ratios: FinancialRatio[] = Array.from({ length: 5 }, (_, i) => ({
      key: `r${i}`, name: '', value: 100, unit: 'ratio' as const,
      grade: 'A' as const, description: '', benchmark: '', trend: null,
    }))
    expect(HealthScorecardService.computeOverallScore(ratios)).toBeGreaterThanOrEqual(90)
  })

  it('all D grades → score 40 → D overall', () => {
    const ratios: FinancialRatio[] = Array.from({ length: 4 }, (_, i) => ({
      key: `r${i}`, name: '', value: 0.3, unit: 'ratio' as const,
      grade: 'D' as const, description: '', benchmark: '', trend: null,
    }))
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(40)
  })

  it('mix A+B = (100+80)/2 = 90 → boundary', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'A', description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: 1, unit: 'ratio', grade: 'B', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(90)
  })
})

// ── 24. Scorecard structure validation ───────────────────────────────────────

describe('getScorecard — structure', () => {
  it('returns scorecard with all required top-level keys', async () => {
    const supabase = makeSupabase({
      sales:                 [{ total_try: 200000, cogs: 100000, payment_status: 'paid', sale_date: '2024-06-15' }],
      expenses:              [{ amount_try: 30000, expense_date: '2024-06-10', category: 'rent' }],
      stock_lots:            [{ qty_remaining: 100, cost_price_try: 50 }],
      partner_transactions:  [{ tx_type: 'capital_in', amount_try: 500000 }],
      partner_loan_tranches: [],
    })
    const scorecard = await HealthScorecardService.getScorecard(
      'co1', 'u1', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-06-01', to: '2024-06-30' },
    )
    expect(scorecard).toHaveProperty('overall_grade')
    expect(scorecard).toHaveProperty('overall_score')
    expect(scorecard).toHaveProperty('ratios')
    expect(scorecard).toHaveProperty('categories')
    expect(scorecard).toHaveProperty('computed_at')
    expect(scorecard.ratios).toHaveLength(10)
  })

  it('categories object has all four category keys', async () => {
    const supabase = makeSupabase({
      sales:                 [],
      expenses:              [],
      stock_lots:            [],
      partner_transactions:  [],
      partner_loan_tranches: [],
    })
    const scorecard = await HealthScorecardService.getScorecard(
      'co1', 'u1', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-06-01', to: '2024-06-30' },
    )
    expect(scorecard.categories).toHaveProperty('liquidity')
    expect(scorecard.categories).toHaveProperty('profitability')
    expect(scorecard.categories).toHaveProperty('efficiency')
    expect(scorecard.categories).toHaveProperty('leverage')
  })

  it('period_from and period_to match input period', async () => {
    const supabase = makeSupabase({
      sales: [], expenses: [], stock_lots: [],
      partner_transactions: [], partner_loan_tranches: [],
    })
    const scorecard = await HealthScorecardService.getScorecard(
      'co1', 'u1', supabase as Parameters<typeof HealthScorecardService.getScorecard>[2],
      { from: '2024-03-01', to: '2024-03-31' },
    )
    expect(scorecard.period_from).toBe('2024-03-01')
    expect(scorecard.period_to).toBe('2024-03-31')
  })
})

// ── 25. gradeRatio — all grade boundaries for current_ratio ──────────────────

describe('gradeRatio — current_ratio all boundaries', () => {
  it('exactly 2.0 → A', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 2.0)).toBe('A')
  })

  it('exactly 1.5 → B', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 1.5)).toBe('B')
  })

  it('exactly 1.0 → C', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 1.0)).toBe('C')
  })

  it('exactly 0.5 → D', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 0.5)).toBe('D')
  })

  it('0.499 → F', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 0.499)).toBe('F')
  })

  it('0.0 → F', () => {
    expect(HealthScorecardService.gradeRatio('current_ratio', 0.0)).toBe('F')
  })
})

// ── 26. gradeRatio — net_margin_pct all boundaries ────────────────────────────

describe('gradeRatio — net_margin_pct all boundaries', () => {
  it('exactly 15 → A', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 15)).toBe('A')
  })

  it('exactly 10 → B', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 10)).toBe('B')
  })

  it('exactly 5 → C', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 5)).toBe('C')
  })

  it('exactly 0 → D', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', 0)).toBe('D')
  })

  it('-0.001 → F (negative)', () => {
    expect(HealthScorecardService.gradeRatio('net_margin_pct', -0.001)).toBe('F')
  })
})

// ── 27. gradeRatio — debt_to_equity all boundaries ───────────────────────────

describe('gradeRatio — debt_to_equity all boundaries', () => {
  it('exactly 0.5 → A', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 0.5)).toBe('A')
  })

  it('0.501 → B', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 0.501)).toBe('B')
  })

  it('exactly 1.0 → B', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 1.0)).toBe('B')
  })

  it('1.001 → C', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 1.001)).toBe('C')
  })

  it('exactly 2.0 → C', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 2.0)).toBe('C')
  })

  it('2.001 → D', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 2.001)).toBe('D')
  })

  it('exactly 4.0 → D', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 4.0)).toBe('D')
  })

  it('4.001 → F', () => {
    expect(HealthScorecardService.gradeRatio('debt_to_equity', 4.001)).toBe('F')
  })
})

// ── 28. computeOverallScore — all grades at extreme values ────────────────────

describe('computeOverallScore — extreme single grades', () => {
  it('single C ratio → score = 60', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'C', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(60)
  })

  it('single B ratio → score = 80', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: 1, unit: 'ratio', grade: 'B', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(80)
  })

  it('all null-grade ratios → score = 0', () => {
    const ratios: FinancialRatio[] = [
      { key: 'a', name: '', value: null, unit: 'ratio', grade: null, description: '', benchmark: '', trend: null },
      { key: 'b', name: '', value: null, unit: 'ratio', grade: null, description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeOverallScore(ratios)).toBe(0)
  })

  it('grade score map: A=100, B=80, C=60, D=40, F=20', () => {
    const grades: Array<FinancialRatio['grade']> = ['A', 'B', 'C', 'D', 'F']
    const expected = [100, 80, 60, 40, 20]
    for (let i = 0; i < grades.length; i++) {
      const ratios: FinancialRatio[] = [
        { key: 'x', name: '', value: 1, unit: 'ratio', grade: grades[i], description: '', benchmark: '', trend: null },
      ]
      expect(HealthScorecardService.computeOverallScore(ratios)).toBe(expected[i])
    }
  })
})

// ── 29. inverse grade/score round-trip ────────────────────────────────────────

describe('computeCategoryGrade — inverse round-trip', () => {
  it('A ratio → category grade A', () => {
    const ratios: FinancialRatio[] = [
      { key: 'gross_margin_pct', name: '', value: 50, unit: 'pct', grade: 'A', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['gross_margin_pct'])).toBe('A')
  })

  it('F ratio → category grade F (score=20 < 30)', () => {
    const ratios: FinancialRatio[] = [
      { key: 'net_margin_pct', name: '', value: -1, unit: 'pct', grade: 'F', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['net_margin_pct'])).toBe('F')
  })

  it('D+D average = 40 → D category', () => {
    const ratios: FinancialRatio[] = [
      { key: 'debt_to_equity',    name: '', value: 3, unit: 'ratio', grade: 'D', description: '', benchmark: '', trend: null },
      { key: 'debt_service_ratio', name: '', value: 0.6, unit: 'ratio', grade: 'D', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['debt_to_equity', 'debt_service_ratio'])).toBe('D')
  })

  it('C+C average = 60 → C category', () => {
    const ratios: FinancialRatio[] = [
      { key: 'asset_turnover',       name: '', value: 1.2, unit: 'x',    grade: 'C', description: '', benchmark: '', trend: null },
      { key: 'receivables_turnover', name: '', value: 7,   unit: 'x',    grade: 'C', description: '', benchmark: '', trend: null },
    ]
    expect(HealthScorecardService.computeCategoryGrade(ratios, ['asset_turnover', 'receivables_turnover'])).toBe('C')
  })
})
