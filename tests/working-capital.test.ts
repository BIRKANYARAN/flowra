/**
 * Working Capital Intelligence — unit tests
 *
 * Tests the pure computation logic of WorkingCapitalService.
 * All tests use an in-memory mock supabase client — no DB or network calls.
 *
 * Run with:  npx vitest run tests/working-capital.test.ts
 */

import { describe, it, expect } from 'vitest'
import { WorkingCapitalService } from '../lib/services/finance/working-capital.service'

// ── Minimal mock supabase builder ─────────────────────────────────────────────
//
// makeSupabase(tables) builds a minimal chainable supabase mock where each
// table returns its pre-configured rows. Supports eq/is/in/gte/lte/lt/gt/neq
// as fluent no-ops and resolves via `.then()`.

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

function makeSupabase(tables: Tables) {
  function buildChain(rows: Row[]): unknown {
    const chain: Record<string, unknown> = {
      data:   rows,
      error:  null,
      then:   (resolve: (v: { data: Row[]; error: null }) => unknown) =>
                Promise.resolve(resolve({ data: rows, error: null })),
    }
    // All filter methods are no-ops that return the same chain
    for (const method of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single']) {
      chain[method] = () => chain
    }
    return chain
  }

  return {
    from: (table: string) => buildChain(tables[table] ?? []),
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const COMPANY_ID = 'test-company'
const USER_ID    = 'test-user'

const PERIOD_30 = { from: '2024-01-01', to: '2024-01-30' }  // 30-day period

// ── Test 1: Single paid sale, 30 days to pay → DSO = 30 ──────────────────────

describe('DSO — single sale paid in 30 days', () => {
  it('dso_days = 30 when one sale took 30 days to collect', async () => {
    const supabase = makeSupabase({
      sales: [],                 // no current-period sales (all were in prior)
      expenses: [],
      stock_lots: [],
    })

    // We need paid sales in the paid query to trigger actuals method.
    // Override: simulate one sale with sale_date = 2024-01-01, paid_at = 2024-01-31
    // For simplicity, use a supabase that returns the paid sale in paidSalesResult.
    // We build a targeted mock that tracks which query is made.

    let callCount = 0
    const targetedSupabase = {
      from: (table: string) => {
        if (table !== 'sales') return makeSupabase({ expenses: [], stock_lots: [] }).from(table)
        callCount++
        const baseSalesChain = buildSalesChain(callCount)
        return baseSalesChain
      },
    }

    function buildSalesChain(n: number) {
      // n=1: all sales in period (for revenue/receivables)
      // n=2: paid sales in period (for DSO actuals)
      // n=3: opening receivables (lt sale_date)
      // n=4,5,6: prior period queries

      const rows: Row[] = n === 2
        ? [{ sale_date: '2024-01-01', paid_at: '2024-01-31', total_try: 10000 }]
        : n === 1
          ? [{ total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2024-01-31', sale_date: '2024-01-01' }]
          : []

      return buildChain(rows)
    }

    function buildChain(rows: Row[]) {
      const chain: Record<string, unknown> = {
        data:  rows,
        error: null,
        then:  (resolve: (v: { data: Row[]; error: null }) => unknown) =>
                 Promise.resolve(resolve({ data: rows, error: null })),
      }
      for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order']) {
        chain[m] = () => chain
      }
      return chain
    }

    const metrics = await WorkingCapitalService.compute(
      COMPANY_ID,
      USER_ID,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targetedSupabase as any,
      PERIOD_30,
    )

    expect(metrics.dso_days).toBe(30)
  })
})

// ── From here, use simpler deterministic mocks ────────────────────────────────
// We test the computation logic directly by bypassing the DB layer.

// ── Helper: compute metrics with mock data ────────────────────────────────────

interface MockData {
  sales?:         Row[]  // for period revenue query
  paidSales?:     Row[]  // for DSO actuals
  openingRec?:    Row[]  // for opening receivables
  expenses?:      Row[]  // for DPO
  stockLots?:     Row[]  // for DIO
  // Prior period variants
  priorSales?:    Row[]
  priorPaid?:     Row[]
  priorExpenses?: Row[]
}

function makeMockSupabase(data: MockData) {
  // We use call-count ordering matching the Promise.all in computePeriod():
  //   [sales, paidSales, expenses, stockLots, openingRec]
  // For two periods (current + prior), calls are interleaved.
  const salesQueues = [
    data.sales        ?? [],
    data.paidSales    ?? [],
    data.expenses     ?? [],
    data.stockLots    ?? [],
    data.openingRec   ?? [],
    // Prior period (same order):
    data.priorSales   ?? [],
    data.priorPaid    ?? [],
    data.priorExpenses ?? [],
    data.stockLots    ?? [],  // stock lots same for prior
    [],                       // prior opening receivables
  ]

  let callIndex = 0

  function buildChain(rows: Row[]) {
    const chain: Record<string, unknown> = {
      data:  rows,
      error: null,
      then:  (resolve: (v: { data: Row[]; error: null }) => unknown) =>
               Promise.resolve(resolve({ data: rows, error: null })),
    }
    for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order']) {
      chain[m] = () => chain
    }
    return chain
  }

  return {
    from: (_table: string) => {
      const rows = salesQueues[callIndex] ?? []
      callIndex++
      return buildChain(rows)
    },
  }
}

// ── Test 2: Two paid sales, 20 and 40 days → DSO avg = 30 ────────────────────

describe('DSO — average of two sales', () => {
  it('dso_days = 30 when two sales took 20 and 40 days', async () => {
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 5000, cogs: 2000, payment_status: 'paid', paid_at: '2024-01-21', sale_date: '2024-01-01' },
        { total_try: 5000, cogs: 2000, payment_status: 'paid', paid_at: '2024-02-10', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-21', total_try: 5000 },   // 20 days
        { sale_date: '2024-01-01', paid_at: '2024-02-10', total_try: 5000 },   // 40 days
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dso_days).toBe(30)
  })
})

// ── Test 3: DPO formula method when no paid_at on expenses ───────────────────

describe('DPO — formula method', () => {
  it('dpo_formula_days = (unpaid/total) × days', async () => {
    // 3 expenses each 1000 TRY, 2 unpaid → unpaid/total = 2/3
    // period = 30 days → DPO = (2000/3000) × 30 = 20
    const supabase = makeMockSupabase({
      expenses: [
        { amount_try: 1000, payment_status: 'paid',    expense_date: '2024-01-05' },
        { amount_try: 1000, payment_status: 'pending', expense_date: '2024-01-10' },
        { amount_try: 1000, payment_status: 'pending', expense_date: '2024-01-15' },
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dpo_formula_days).toBeCloseTo(20, 1)
    expect(m.dpo_days).toBeCloseTo(20, 1)
  })
})

// ── Test 4: CCC = DSO - DPO (no DIO) ─────────────────────────────────────────

describe('CCC without DIO', () => {
  it('ccc_days = dso - dpo when no inventory', async () => {
    // DSO actuals = 20 days (one paid sale, 20 days)
    // DPO = (500/1000) × 30 = 15 days
    // CCC = 20 + 0 - 15 = 5
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2024-01-21', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-21', total_try: 10000 },  // 20 days
      ],
      expenses: [
        { amount_try: 500, payment_status: 'paid',    expense_date: '2024-01-05' },
        { amount_try: 500, payment_status: 'pending', expense_date: '2024-01-15' },
      ],
      stockLots: [],  // no inventory → DIO = null
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dso_days).toBe(20)
    expect(m.dpo_days).toBeCloseTo(15, 1)
    expect(m.dio_days).toBeNull()
    expect(m.ccc_days).toBeCloseTo(5, 1)
  })
})

// ── Test 5: CCC with DIO ──────────────────────────────────────────────────────

describe('CCC with DIO', () => {
  it('ccc_days = dso + dio - dpo when inventory exists', async () => {
    // DSO = 10 days (one paid sale 10 days)
    // expenses: all paid → DPO = 0
    // inventory = 6000 TRY, COGS = 6000 → DIO = (6000/6000) × 30 = 30
    // CCC = 10 + 30 - 0 = 40
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 6000, payment_status: 'paid', paid_at: '2024-01-11', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-11', total_try: 10000 },  // 10 days
      ],
      expenses: [
        { amount_try: 1000, payment_status: 'paid', expense_date: '2024-01-05' },
      ],
      stockLots: [
        { qty_remaining: 10, cost_price_try: 600 },  // 10 × 600 = 6000
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dso_days).toBe(10)
    expect(m.dio_days).toBeCloseTo(30, 1)
    // DPO formula = (0/1000) × 30 = 0
    expect(m.dpo_days).toBe(0)
    expect(m.ccc_days).toBeCloseTo(40, 1)
  })
})

// ── Test 6: Grade excellent when CCC < 0 ─────────────────────────────────────

describe('CCC grade — excellent', () => {
  it('grade = excellent when CCC < 0 (get paid before paying)', async () => {
    // DSO = 5 days, DPO = 20 days → CCC = 5 - 20 = -15
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2024-01-06', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-06', total_try: 10000 },  // 5 days
      ],
      expenses: [
        { amount_try: 500, payment_status: 'paid',    expense_date: '2024-01-05' },
        { amount_try: 1500, payment_status: 'pending', expense_date: '2024-01-15' },
      ],
      stockLots: [],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.ccc_days).toBeLessThan(0)
    expect(m.ccc_grade).toBe('excellent')
  })
})

// ── Test 7: Grade poor when CCC >= 60 ────────────────────────────────────────

describe('CCC grade — poor', () => {
  it('grade = poor when CCC >= 60', async () => {
    // DSO = 60 days, DPO = 0 → CCC = 60
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2024-03-01', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-03-01', total_try: 10000 },  // 60 days
      ],
      expenses: [
        { amount_try: 1000, payment_status: 'paid', expense_date: '2024-01-05' },
      ],
      stockLots: [],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.ccc_days).toBeGreaterThanOrEqual(60)
    expect(m.ccc_grade).toBe('poor')
  })
})

// ── Test 8: DSO improving when current < prior by > 5 ────────────────────────

describe('DSO trend — improving', () => {
  it('dso_trend = improving when current DSO < prior DSO by > 5 days', async () => {
    // Current DSO = 10, prior DSO = 20 → improving
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2024-01-11', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-11', total_try: 10000 },  // 10 days
      ],
      // Prior period (queues 5-9)
      priorSales: [
        { total_try: 10000, cogs: 5000, payment_status: 'paid', paid_at: '2023-12-21', sale_date: '2023-12-01' },
      ],
      priorPaid: [
        { sale_date: '2023-12-01', paid_at: '2023-12-21', total_try: 10000 },  // 20 days
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dso_trend).toBe('improving')
  })
})

// ── Test 9: DPO deteriorating when current DPO < prior (paying faster) ────────

describe('DPO trend — deteriorating', () => {
  it('dpo_trend = deteriorating when current DPO is lower than prior by > 5 days', async () => {
    // Current: 500/1000 × 30 = 15 days DPO
    // Prior:   900/1000 × 30 = 27 days DPO
    // Current < Prior → deteriorating (paying faster = worse for cash)
    const supabase = makeMockSupabase({
      expenses: [
        { amount_try: 500, payment_status: 'paid',    expense_date: '2024-01-05' },
        { amount_try: 500, payment_status: 'pending', expense_date: '2024-01-15' },
      ],
      priorExpenses: [
        { amount_try: 100, payment_status: 'paid',    expense_date: '2023-12-05' },
        { amount_try: 900, payment_status: 'pending', expense_date: '2023-12-15' },
      ],
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dpo_trend).toBe('deteriorating')
  })
})

// ── Test 10: Empty data → all null, no crash ──────────────────────────────────

describe('Empty data — graceful null handling', () => {
  it('all metrics are null and does not throw when no data exists', async () => {
    const supabase = makeMockSupabase({})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)

    expect(m.dso_days).toBeNull()
    expect(m.dpo_days).toBeNull()
    expect(m.dio_days).toBeNull()
    expect(m.ccc_days).toBeNull()
    expect(m.total_revenue_try).toBe(0)
    expect(m.total_cogs_try).toBe(0)
    expect(m.dso_trend).toBe('insufficient_data')
    expect(m.dpo_trend).toBe('insufficient_data')
    expect(m.ccc_grade).toBe('fair')  // null CCC defaults to fair
    expect(m.inventory_value_try).toBeNull()
  })
})
