/**
 * Tests for lib/services/finance/expense-intelligence.service.ts
 *
 * All pure-function tests run without any DB calls.
 * Integration tests use a mock Supabase client.
 *
 * Run with: npx vitest run tests/expense-intelligence.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  ExpenseIntelligenceService,
} from '../lib/services/finance/expense-intelligence.service'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Mock Supabase helpers ─────────────────────────────────────────────────────

interface MockExpenseRow {
  amount_try:   number | null
  expense_type: string | null
  expense_date: string | null
}

type QueryCallback = (data: MockExpenseRow[]) => { data: MockExpenseRow[]; error: null }

// Mock that supports multiple sequential .from() calls with different data sets
function makeMockSupabaseMulti(dataSets: MockExpenseRow[][]) {
  let callCount = 0
  return {
    from(_table: string) {
      const dataIndex = callCount++
      const rows = dataSets[dataIndex] ?? []
      const queryObj = {
        _rows: rows,
        select(_: string) { return this },
        eq(_: string, __: unknown) { return this },
        is(_: string, __: unknown) { return this },
        gte(_: string, __: unknown) { return this },
        lte(_: string, __: unknown) { return this },
        then(resolve: (v: { data: MockExpenseRow[]; error: null }) => unknown) {
          return Promise.resolve({ data: this._rows, error: null }).then(resolve)
        },
      }
      return queryObj
    },
  } as unknown as SupabaseClient
}

// ── Pure function tests ───────────────────────────────────────────────────────

describe('ExpenseIntelligenceService.computeTrend', () => {
  it('25% increase → up', () => {
    expect(ExpenseIntelligenceService.computeTrend(100, 80)).toBe('up')
  })

  it('decrease from 100 to 80 → down', () => {
    expect(ExpenseIntelligenceService.computeTrend(80, 100)).toBe('down')
  })

  it('same amount → stable', () => {
    expect(ExpenseIntelligenceService.computeTrend(100, 100)).toBe('stable')
  })

  it('prior = 0, current > 0 → new', () => {
    expect(ExpenseIntelligenceService.computeTrend(100, 0)).toBe('new')
  })

  it('within 5% change → stable', () => {
    expect(ExpenseIntelligenceService.computeTrend(103, 100)).toBe('stable')
  })

  it('both zero → stable', () => {
    expect(ExpenseIntelligenceService.computeTrend(0, 0)).toBe('stable')
  })
})

// ── Integration tests with mock DB ────────────────────────────────────────────

describe('ExpenseIntelligenceService.getReport', () => {
  const period = { from: '2025-05-01', to: '2025-05-31' }

  it('current_pct_of_total sums to ~100% across all categories', async () => {
    const currentRows: MockExpenseRow[] = [
      { amount_try: 400, expense_type: 'salary',    expense_date: '2025-05-15' },
      { amount_try: 300, expense_type: 'rent',      expense_date: '2025-05-10' },
      { amount_try: 200, expense_type: 'utilities', expense_date: '2025-05-20' },
      { amount_try: 100, expense_type: 'software',  expense_date: '2025-05-05' },
    ]
    // prior, rolling — empty
    const supabase = makeMockSupabaseMulti([currentRows, [], []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    const totalPct = report.categories.reduce((s, c) => s + c.current_pct_of_total, 0)
    expect(totalPct).toBeCloseTo(100, 0)
  })

  it('fastest_growing is the category with highest positive change_pct', async () => {
    const currentRows: MockExpenseRow[] = [
      { amount_try: 1000, expense_type: 'marketing', expense_date: '2025-05-15' },
      { amount_try: 500,  expense_type: 'salary',    expense_date: '2025-05-15' },
    ]
    const priorRows: MockExpenseRow[] = [
      { amount_try: 200,  expense_type: 'marketing', expense_date: '2025-04-15' }, // +400%
      { amount_try: 450,  expense_type: 'salary',    expense_date: '2025-04-15' }, // +11%
    ]
    const supabase = makeMockSupabaseMulti([currentRows, priorRows, []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    expect(report.fastest_growing).toBe('marketing')
    expect(report.fastest_growing_pct).not.toBeNull()
    expect(report.fastest_growing_pct!).toBeGreaterThan(100)
  })

  it('largest_category is the one with highest current_try', async () => {
    const currentRows: MockExpenseRow[] = [
      { amount_try: 300, expense_type: 'rent',    expense_date: '2025-05-10' },
      { amount_try: 700, expense_type: 'salary',  expense_date: '2025-05-15' },
      { amount_try: 200, expense_type: 'software', expense_date: '2025-05-05' },
    ]
    const supabase = makeMockSupabaseMulti([currentRows, [], []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    expect(report.largest_category).toBe('salary')
    expect(report.largest_category_pct).toBeCloseTo(58.3, 0)
  })

  it('no expenses → empty report, all zeros', async () => {
    const supabase = makeMockSupabaseMulti([[], [], []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    expect(report.total_expenses_try).toBe(0)
    expect(report.prior_total_try).toBe(0)
    expect(report.total_change_pct).toBeNull()
    expect(report.categories).toHaveLength(0)
    expect(report.fastest_growing).toBeNull()
    expect(report.largest_category).toBe('')
  })

  it('trend new for category present in current but not prior', async () => {
    const currentRows: MockExpenseRow[] = [
      { amount_try: 500, expense_type: 'logistics', expense_date: '2025-05-15' },
    ]
    const priorRows: MockExpenseRow[] = [] // logistics not in prior
    const supabase = makeMockSupabaseMulti([currentRows, priorRows, []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    const cat = report.categories.find(c => c.expense_type === 'logistics')
    expect(cat?.trend).toBe('new')
    expect(cat?.change_pct).toBeNull()
  })

  it('categories sorted by current_try descending', async () => {
    const currentRows: MockExpenseRow[] = [
      { amount_try: 100,  expense_type: 'software',  expense_date: '2025-05-15' },
      { amount_try: 1000, expense_type: 'salary',    expense_date: '2025-05-15' },
      { amount_try: 500,  expense_type: 'rent',      expense_date: '2025-05-15' },
    ]
    const supabase = makeMockSupabaseMulti([currentRows, [], []])
    const report = await ExpenseIntelligenceService.getReport('c1', supabase, period)

    expect(report.categories[0].expense_type).toBe('salary')
    expect(report.categories[1].expense_type).toBe('rent')
    expect(report.categories[2].expense_type).toBe('software')
  })
})
