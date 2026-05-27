/**
 * Working Capital Intelligence — unit tests
 *
 * Tests both the pure computation functions (new) and the
 * WorkingCapitalService.compute() integration (existing).
 *
 * Run with:  npx vitest run tests/working-capital.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDIO,
  computeDSO,
  computeDPO,
  computeCCC,
  computeWorkingCapital,
  computeCurrentRatio,
  computeQuickRatio,
  classifyCCCTrend,
  WorkingCapitalService,
} from '../lib/services/finance/working-capital.service'

// ─────────────────────────────────────────────────────────────────────────────
// PURE FUNCTION TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('computeDSO', () => {
  it('returns correct value: (500 / 10000) × 30 = 1.5', () => {
    expect(computeDSO(500, 10000)).toBeCloseTo(1.5, 1)
  })

  it('returns null when revenue = 0', () => {
    expect(computeDSO(1000, 0)).toBeNull()
  })

  it('returns 30 when avg_receivables equals revenue', () => {
    expect(computeDSO(5000, 5000)).toBe(30)
  })
})

describe('computeDIO', () => {
  it('returns correct value: (6000 / 6000) × 30 = 30', () => {
    expect(computeDIO(6000, 6000)).toBe(30)
  })

  it('returns null when cogs = 0', () => {
    expect(computeDIO(5000, 0)).toBeNull()
  })

  it('handles zero inventory (DIO = 0)', () => {
    expect(computeDIO(0, 5000)).toBe(0)
  })
})

describe('computeDPO', () => {
  it('returns correct value: (3000 / 9000) × 30 = 10', () => {
    expect(computeDPO(3000, 9000)).toBeCloseTo(10, 1)
  })

  it('returns 0 when cogs = 0 (no COGS means no payables context)', () => {
    expect(computeDPO(1000, 0)).toBe(0)
  })

  it('returns 0 when payables = 0', () => {
    expect(computeDPO(0, 5000)).toBe(0)
  })
})

describe('computeCCC', () => {
  it('CCC = DIO + DSO - DPO: 30 + 20 - 10 = 40', () => {
    expect(computeCCC(30, 20, 10)).toBe(40)
  })

  it('treats null DIO as 0: null + 20 - 10 = 10', () => {
    expect(computeCCC(null, 20, 10)).toBe(10)
  })

  it('returns null when DSO is null', () => {
    expect(computeCCC(10, null, 5)).toBeNull()
  })

  it('returns null when DPO is null', () => {
    expect(computeCCC(10, 20, null)).toBeNull()
  })

  it('negative CCC (excellent): 5 + 10 - 25 = -10', () => {
    expect(computeCCC(5, 10, 25)).toBe(-10)
  })
})

describe('computeWorkingCapital', () => {
  it('positive working capital', () => {
    expect(computeWorkingCapital(100_000, 60_000)).toBeCloseTo(40_000)
  })

  it('negative working capital', () => {
    expect(computeWorkingCapital(50_000, 80_000)).toBeCloseTo(-30_000)
  })

  it('zero when equal', () => {
    expect(computeWorkingCapital(50_000, 50_000)).toBe(0)
  })
})

describe('computeCurrentRatio', () => {
  it('returns correct ratio: 150_000 / 100_000 = 1.5', () => {
    expect(computeCurrentRatio(150_000, 100_000)).toBeCloseTo(1.5, 2)
  })

  it('returns null when liabilities = 0', () => {
    expect(computeCurrentRatio(100_000, 0)).toBeNull()
  })

  it('returns ratio < 1 when assets < liabilities', () => {
    const ratio = computeCurrentRatio(80_000, 100_000)
    expect(ratio).not.toBeNull()
    expect(ratio!).toBeLessThan(1)
  })
})

describe('computeQuickRatio', () => {
  it('correct: (cash + receivables) / liabilities = (20k + 30k) / 50k = 1.0', () => {
    expect(computeQuickRatio(20_000, 30_000, 50_000)).toBeCloseTo(1.0, 2)
  })

  it('returns null when liabilities = 0', () => {
    expect(computeQuickRatio(10_000, 5_000, 0)).toBeNull()
  })

  it('excludes inventory from numerator (different from current ratio)', () => {
    const cr = computeCurrentRatio(100_000, 50_000)  // includes inventory
    const qr = computeQuickRatio(30_000, 20_000, 50_000)  // cash+rec only
    expect(qr).toBeLessThan(cr!)
  })
})

describe('classifyCCCTrend', () => {
  it('returns insufficient when fewer than 6 valid months', () => {
    const months = [
      { ccc_days: 40 },
      { ccc_days: 42 },
      { ccc_days: null },
    ]
    expect(classifyCCCTrend(months)).toBe('insufficient')
  })

  it('returns improving when recent avg < prior avg by > 3 days', () => {
    // months[0..2] = recent (lower CCC = better)
    // months[3..5] = prior (higher CCC)
    const months = [
      { ccc_days: 30 },  // recent
      { ccc_days: 32 },
      { ccc_days: 31 },
      { ccc_days: 45 },  // prior
      { ccc_days: 47 },
      { ccc_days: 46 },
    ]
    expect(classifyCCCTrend(months)).toBe('improving')
  })

  it('returns deteriorating when recent avg > prior avg by > 3 days', () => {
    const months = [
      { ccc_days: 55 },  // recent (worse)
      { ccc_days: 57 },
      { ccc_days: 56 },
      { ccc_days: 40 },  // prior (better)
      { ccc_days: 42 },
      { ccc_days: 41 },
    ]
    expect(classifyCCCTrend(months)).toBe('deteriorating')
  })

  it('returns stable when difference is within ±3 days', () => {
    const months = [
      { ccc_days: 40 },
      { ccc_days: 41 },
      { ccc_days: 40 },
      { ccc_days: 42 },
      { ccc_days: 40 },
      { ccc_days: 41 },
    ]
    expect(classifyCCCTrend(months)).toBe('stable')
  })

  it('skips null entries when counting valid months', () => {
    // Only 3 valid, rest null → insufficient
    const months = [
      { ccc_days: 30 },
      { ccc_days: null },
      { ccc_days: 35 },
      { ccc_days: null },
      { ccc_days: 40 },
      { ccc_days: null },
      { ccc_days: null },
    ]
    expect(classifyCCCTrend(months)).toBe('insufficient')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — WorkingCapitalService.compute() with mock supabase
// ─────────────────────────────────────────────────────────────────────────────

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
    for (const method of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single']) {
      chain[method] = () => chain
    }
    return chain
  }

  return {
    from: (table: string) => buildChain(tables[table] ?? []),
  }
}

const COMPANY_ID = 'test-company'
const USER_ID    = 'test-user'
const PERIOD_30  = { from: '2024-01-01', to: '2024-01-30' }

// Helper for call-order-based mocking
interface MockData {
  sales?:         Row[]
  paidSales?:     Row[]
  openingRec?:    Row[]
  expenses?:      Row[]
  stockLots?:     Row[]
  priorSales?:    Row[]
  priorPaid?:     Row[]
  priorExpenses?: Row[]
}

function makeMockSupabase(data: MockData) {
  const queues = [
    data.sales        ?? [],
    data.paidSales    ?? [],
    data.expenses     ?? [],
    data.stockLots    ?? [],
    data.openingRec   ?? [],
    data.priorSales   ?? [],
    data.priorPaid    ?? [],
    data.priorExpenses ?? [],
    data.stockLots    ?? [],
    [],
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
      const rows = queues[callIndex] ?? []
      callIndex++
      return buildChain(rows)
    },
  }
}

describe('WorkingCapitalService.compute — empty data', () => {
  it('all metrics null, no crash', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, makeMockSupabase({}) as any, PERIOD_30)
    expect(m.dso_days).toBeNull()
    expect(m.dpo_days).toBeNull()
    expect(m.dio_days).toBeNull()
    expect(m.ccc_days).toBeNull()
    expect(m.total_revenue_try).toBe(0)
    expect(m.ccc_grade).toBe('fair')
  })
})

describe('WorkingCapitalService.compute — CCC with DIO', () => {
  it('ccc = dso + dio - dpo', async () => {
    const supabase = makeMockSupabase({
      sales: [
        { total_try: 10000, cogs: 6000, payment_status: 'paid', paid_at: '2024-01-11', sale_date: '2024-01-01' },
      ],
      paidSales: [
        { sale_date: '2024-01-01', paid_at: '2024-01-11', total_try: 10000 },
      ],
      expenses: [
        { amount_try: 1000, payment_status: 'paid', expense_date: '2024-01-05' },
      ],
      stockLots: [
        { qty_remaining: 10, cost_price_try: 600 },
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await WorkingCapitalService.compute(COMPANY_ID, USER_ID, supabase as any, PERIOD_30)
    expect(m.dso_days).toBe(10)
    expect(m.dio_days).toBeCloseTo(30, 1)
    expect(m.dpo_days).toBe(0)
    expect(m.ccc_days).toBeCloseTo(40, 1)
  })
})
