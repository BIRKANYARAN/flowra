/**
 * DividendService pure-logic unit tests.
 *
 * Run with: npx vitest run tests/dividend.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { DividendService } from '../lib/services/pcle/dividend.service'
import { FinanceService } from '../lib/services/finance.service'

// ── Mock Supabase factory ──────────────────────────────────────────────────────

type RowData = Record<string, unknown>

function makeSupabase(opts: {
  sales?:         RowData[]
  expenses?:      RowData[]
  partners?:      RowData[]
  financeEvents?: RowData[]
  commitments?:   RowData[]
}) {
  const responses: Record<string, RowData[]> = {
    sales:                  opts.sales         ?? [],
    expenses:               opts.expenses       ?? [],
    partners:               opts.partners       ?? [],
    partner_finance_events: opts.financeEvents  ?? [],
    // Large default paid-in capital so the TTK 519 20%-of-capital reserve cap does
    // not bind (keeps reserve = 5% of net for these unit tests unless overridden).
    partner_capital_commitments: opts.commitments ?? [{ paid_try: 100_000_000 }],
  }

  // DP-3: net income is now the canonical figure from FinanceService. Spy it to the
  // fixture's revenue − (non-financing) expenses, preserving each test's net basis;
  // the precise COGS/tax pipeline is covered by FinanceService's own tests.
  const FINANCING = new Set(['partner_financing', 'loan_repayment', 'dividend', 'internal_transfer', 'principal', 'partner_loan'])
  const rev = (opts.sales ?? []).reduce((s, r) => s + Number((r as RowData).total_try ?? 0), 0)
  const exp = (opts.expenses ?? []).reduce((s, r) => {
    const t = (r as RowData).expense_type as string | undefined
    return t && FINANCING.has(t) ? s : s + Number((r as RowData).amount_try ?? 0)
  }, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(FinanceService, 'getFinancialSummary').mockResolvedValue({ net_after_tax_try: Math.round((rev - exp) * 100) / 100 } as any)

  return {
    from: (table: string) => {
      const rows = responses[table] ?? []
      const chain = {
        select: () => chain,
        eq:     () => chain,
        is:     () => chain,
        gt:     () => chain,
        gte:    () => chain,
        lte:    () => chain,
        in:     () => chain,
        order:  () => chain,
        neq:    () => chain,
        then:   (cb: (v: { data: RowData[]; error: null }) => unknown) =>
          Promise.resolve(cb({ data: rows, error: null })),
      }
      return chain
    },
  }
}

// ── Test data ──────────────────────────────────────────────────────────────────

const TWO_PARTNERS = [
  { id: 'p1', name: 'Ali', share_ratio: 0.6 },
  { id: 'p2', name: 'Veli', share_ratio: 0.4 },
]

const THREE_PARTNERS = [
  { id: 'p1', name: 'Ahmet', share_ratio: 0.5 },
  { id: 'p2', name: 'Mehmet', share_ratio: 0.3 },
  { id: 'p3', name: 'Ayşe', share_ratio: 0.2 },
]

const HIGH_REVENUE_EXPENSES = {
  sales:    [{ total_try: 500_000 }],
  expenses: [{ amount_try: 200_000, expense_type: 'operational' }],
  // ytd_net = 300_000
}

const PROFITABLE = {
  sales:    [{ total_try: 1_000_000 }],
  expenses: [{ amount_try: 400_000, expense_type: 'operational' }],
  // ytd_net = 600_000
}

// ─────────────────────────────────────────────────────────────────────────────
// Legal reserve: TTK 519 — 5% of net income
// ─────────────────────────────────────────────────────────────────────────────

describe('legal reserve (TTK 519)', () => {
  it('required_legal_reserve = 5% of YTD net income', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // ytdNet = 300_000 → reserve = 15_000
    expect(calc.required_legal_reserve_try).toBe(15_000)
  })

  it('legal_reserve_satisfied when reserves already funded', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_satisfied).toBe(true)
    expect(calc.legal_reserve_remaining_try).toBe(0)
  })

  it('legal_reserve NOT satisfied when reserves are insufficient', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_satisfied).toBe(false)
    expect(calc.legal_reserve_remaining_try).toBe(15_000)
  })

  it('required_legal_reserve = 0 when income is 0', async () => {
    const sb = makeSupabase({
      sales: [], expenses: [], partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 0)
    expect(calc.required_legal_reserve_try).toBe(0)
  })

  it('required_legal_reserve = 0 when income is negative', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 50_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.required_legal_reserve_try).toBe(0)
  })

  it('legal_reserve_satisfied when net = 0 (reserve = 0 required)', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    // ytdNet = 0 → required = 0 → satisfied
    expect(calc.legal_reserve_satisfied).toBe(true)
  })

  it('reserve remaining = required when no existing reserves', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // ytdNet = 600_000 → required = 30_000; remaining = 30_000 - 0 = 30_000
    expect(calc.required_legal_reserve_try).toBe(30_000)
    expect(calc.legal_reserve_remaining_try).toBe(30_000)
  })

  it('partially funded reserve correctly reduces remaining', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 10_000 }], // partial reserve
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // required = 30_000; existing = 10_000; remaining = 20_000
    expect(calc.legal_reserve_remaining_try).toBe(20_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 509 — distribution only from distributable profit
// ─────────────────────────────────────────────────────────────────────────────

describe('TTK 509', () => {
  it('fails when YTD net income is zero', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 100_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.ttk_509_satisfied).toBe(false)
    expect(calc.can_declare).toBe(false)
    expect(calc.blocking_reasons.some(r => r.includes('TTK 509'))).toBe(true)
  })

  it('fails when YTD net income is negative', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 50_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.ttk_509_satisfied).toBe(false)
    expect(calc.blocking_reasons.some(r => r.includes('TTK 509'))).toBe(true)
  })

  it('fails when gross_dividend > ytd_net_income', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 100_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.can_declare).toBe(false)
    expect(calc.blocking_reasons.some(r => r.includes('TTK 509'))).toBe(true)
  })

  it('satisfies TTK 509 when income > 0 and gross <= ytd', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }], // satisfy reserve
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.ttk_509_satisfied).toBe(true)
  })

  it('ytd_net_income is included in the result', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ytd_net_income_try).toBe(300_000)
  })

  it('multiple sales rows are summed', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }, { total_try: 200_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 100_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.ytd_net_income_try).toBe(250_000) // 300_000 - 50_000
  })

  it('financing expenses are excluded from YTD expense total', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 500_000 }],
      expenses: [
        { amount_try: 100_000, expense_type: 'operational' },
        { amount_try: 50_000, expense_type: 'partner_loan' }, // financing → excluded
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // ytdNet = 500_000 - 100_000 = 400_000 (partner_loan excluded)
    expect(calc.ytd_net_income_try).toBe(400_000)
  })

  it('dividend expense type is excluded from expenses', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 200_000 }],
      expenses: [
        { amount_try: 50_000, expense_type: 'operational' },
        { amount_try: 30_000, expense_type: 'dividend' }, // excluded
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    // ytdNet = 200_000 - 50_000 = 150_000
    expect(calc.ytd_net_income_try).toBe(150_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Withholding tax (GVK 94 §4)
// ─────────────────────────────────────────────────────────────────────────────

describe('withholding tax (GVK 94 §4)', () => {
  it('withholding = gross × 0.10', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.withholding_rate).toBe(0.10)
    expect(calc.withholding_try).toBe(5_000)
  })

  it('distributable_net = gross - withholding', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.distributable_net_try).toBe(calc.gross_dividend_try - calc.withholding_try)
    expect(calc.distributable_net_try).toBe(45_000)
  })

  it('withholding_rate is always 0.10', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.withholding_rate).toBe(0.10)
  })

  it('gross_dividend_try preserved in output', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 75_000)
    expect(calc.gross_dividend_try).toBe(75_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Per-partner allocation
// ─────────────────────────────────────────────────────────────────────────────

describe('per-partner allocation', () => {
  it('allocates gross proportionally by share_ratio', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    const ali  = calc.partner_allocations.find(p => p.partner_id === 'p1')
    const veli = calc.partner_allocations.find(p => p.partner_id === 'p2')

    expect(ali).toBeDefined()
    expect(veli).toBeDefined()
    expect(ali!.gross_share_try).toBe(60_000)
    expect(ali!.withholding_try).toBe(6_000)
    expect(ali!.net_share_try).toBe(54_000)
    expect(veli!.gross_share_try).toBe(40_000)
    expect(veli!.net_share_try).toBe(36_000)
  })

  it('sum of partner net allocations ≈ distributable_net (within 0.01)', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    const sumNet = calc.partner_allocations.reduce((s, p) => s + p.net_share_try, 0)
    expect(Math.abs(sumNet - calc.distributable_net_try)).toBeLessThanOrEqual(0.01)
  })

  it('three partners: allocations are proportional', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: THREE_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    const ahmet = calc.partner_allocations.find(p => p.partner_id === 'p1')!
    const mehmet = calc.partner_allocations.find(p => p.partner_id === 'p2')!
    const ayse = calc.partner_allocations.find(p => p.partner_id === 'p3')!
    // Ratios 0.5, 0.3, 0.2 — normalized to 1.0
    expect(ahmet.gross_share_try).toBeCloseTo(50_000, 1)
    expect(mehmet.gross_share_try).toBeCloseTo(30_000, 1)
    expect(ayse.gross_share_try).toBeCloseTo(20_000, 1)
  })

  it('partner_id and partner_name are preserved in allocations', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    const ali = calc.partner_allocations.find(p => p.partner_id === 'p1')!
    expect(ali.partner_name).toBe('Ali')
  })

  it('share_ratio_pct is percentage (0-100)', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    for (const alloc of calc.partner_allocations) {
      expect(alloc.share_ratio_pct).toBeGreaterThan(0)
      expect(alloc.share_ratio_pct).toBeLessThanOrEqual(100)
    }
  })

  it('net_share = gross_share × 0.9 for each partner', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    for (const alloc of calc.partner_allocations) {
      expect(alloc.net_share_try).toBeCloseTo(alloc.gross_share_try * 0.9, 2)
    }
  })

  it('withholding per partner = gross × 0.10', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    for (const alloc of calc.partner_allocations) {
      expect(alloc.withholding_try).toBeCloseTo(alloc.gross_share_try * 0.1, 2)
    }
  })

  it('empty partners list → empty allocations', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: [], financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.partner_allocations).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// can_declare
// ─────────────────────────────────────────────────────────────────────────────

describe('can_declare', () => {
  it('can_declare = false when legal reserve not satisfied', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ttk_519_satisfied).toBe(false)
    expect(calc.can_declare).toBe(false)
  })

  it('can_declare = true when all checks pass', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ttk_509_satisfied).toBe(true)
    expect(calc.ttk_519_satisfied).toBe(true)
    expect(calc.can_declare).toBe(true)
    expect(calc.blocking_reasons).toHaveLength(0)
  })

  it('can_declare = false when 509 fails despite 519 pass', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 0 }],
      expenses: [],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.ttk_509_satisfied).toBe(false)
    expect(calc.can_declare).toBe(false)
  })

  it('can_declare = false when 519 fails despite 509 pass', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [], // no reserves → 519 fails
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ttk_519_satisfied).toBe(false)
    expect(calc.can_declare).toBe(false)
  })

  it('can_declare is boolean', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(typeof calc.can_declare).toBe('boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// blocking_reasons
// ─────────────────────────────────────────────────────────────────────────────

describe('blocking_reasons', () => {
  it('all blocking reasons are in Turkish', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 50_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.blocking_reasons.length).toBeGreaterThan(0)
    for (const reason of calc.blocking_reasons) {
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(10)
      expect(reason).toMatch(/TTK/)
    }
  })

  it('blocking_reasons is empty array when can_declare=true', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.blocking_reasons).toHaveLength(0)
  })

  it('reserve blocking reason appears when income > 0 but no reserves', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 200_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners:      TWO_PARTNERS,
      financeEvents: [],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 80_000)
    expect(calc.ttk_519_satisfied).toBe(false)
    expect(calc.blocking_reasons.some(r => r.includes('TTK 519'))).toBe(true)
  })

  it('TTK 509 message mentions YTD when income <= 0', async () => {
    const sb = makeSupabase({
      sales: [], expenses: [], partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    const msg509 = calc.blocking_reasons.find(r => r.includes('TTK 509'))
    expect(msg509).toBeTruthy()
  })

  it('blocking_reasons is an array', async () => {
    const sb = makeSupabase({ sales: [], expenses: [], partners: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 1_000)
    expect(Array.isArray(calc.blocking_reasons)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Output structure correctness
// ─────────────────────────────────────────────────────────────────────────────

describe('output structure', () => {
  it('result has all required fields', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 20_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc).toHaveProperty('gross_dividend_try')
    expect(calc).toHaveProperty('required_legal_reserve_try')
    expect(calc).toHaveProperty('legal_reserve_remaining_try')
    expect(calc).toHaveProperty('legal_reserve_satisfied')
    expect(calc).toHaveProperty('distributable_gross_try')
    expect(calc).toHaveProperty('withholding_rate')
    expect(calc).toHaveProperty('withholding_try')
    expect(calc).toHaveProperty('distributable_net_try')
    expect(calc).toHaveProperty('partner_allocations')
    expect(calc).toHaveProperty('ttk_509_satisfied')
    expect(calc).toHaveProperty('ttk_519_satisfied')
    expect(calc).toHaveProperty('can_declare')
    expect(calc).toHaveProperty('blocking_reasons')
    expect(calc).toHaveProperty('ytd_net_income_try')
  })

  it('distributable_gross_try = gross_dividend_try', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 75_000)
    expect(calc.distributable_gross_try).toBe(calc.gross_dividend_try)
  })

  it('partner_allocations count matches partners count', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: THREE_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.partner_allocations).toHaveLength(3)
  })

  it('legal_reserve_remaining_try is non-negative', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_remaining_try).toBeGreaterThanOrEqual(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DividendService.initiateDeclaration — guard test
// ─────────────────────────────────────────────────────────────────────────────

describe('initiateDeclaration', () => {
  it('throws when can_declare = false', async () => {
    const calc = {
      can_declare: false,
      blocking_reasons: ['TTK 509: test'],
      gross_dividend_try: 10_000,
      withholding_try: 1_000,
      distributable_net_try: 9_000,
      withholding_rate: 0.10,
      ytd_net_income_try: 0,
      required_legal_reserve_try: 0,
      legal_reserve_remaining_try: 0,
      legal_reserve_satisfied: true,
      distributable_gross_try: 10_000,
      partner_allocations: [],
      ttk_509_satisfied: false,
      ttk_519_satisfied: true,
    }

    const mockSb = {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(DividendService.initiateDeclaration('co1', 'u1', mockSb as any, calc))
      .rejects.toThrow('engellenmiş')
  })

  it('throws with specific blocking reason in message', async () => {
    const calc = {
      can_declare: false,
      blocking_reasons: ['TTK 519: Yasal yedek karşılanmadı'],
      gross_dividend_try: 50_000,
      withholding_try: 5_000,
      distributable_net_try: 45_000,
      withholding_rate: 0.10,
      ytd_net_income_try: 100_000,
      required_legal_reserve_try: 5_000,
      legal_reserve_remaining_try: 5_000,
      legal_reserve_satisfied: false,
      distributable_gross_try: 50_000,
      partner_allocations: [],
      ttk_509_satisfied: true,
      ttk_519_satisfied: false,
    }

    const mockSb = { from: vi.fn().mockReturnThis() }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(DividendService.initiateDeclaration('co1', 'u1', mockSb as any, calc))
      .rejects.toThrow('TTK 519')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases: data anomalies
// ─────────────────────────────────────────────────────────────────────────────

describe('data anomalies / edge cases', () => {
  it('handles no sales rows — ytd net = 0', async () => {
    const sb = makeSupabase({ sales: [], expenses: [], partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.ytd_net_income_try).toBe(0)
  })

  it('handles null/undefined expense_type (included in expenses)', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 200_000 }],
      expenses: [
        { amount_try: 50_000 },           // no expense_type → included
        { amount_try: 20_000, expense_type: null }, // null → included
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    // ytdNet = 200_000 - 70_000 = 130_000
    expect(calc.ytd_net_income_try).toBe(130_000)
  })

  it('handles loan_repayment expense type (excluded)', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 300_000 }],
      expenses: [
        { amount_try: 50_000, expense_type: 'operational' },
        { amount_try: 100_000, expense_type: 'loan_repayment' }, // excluded
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 20_000)
    // ytdNet = 300_000 - 50_000 = 250_000
    expect(calc.ytd_net_income_try).toBe(250_000)
  })

  it('handles internal_transfer expense type (excluded)', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 200_000 }],
      expenses: [
        { amount_try: 30_000, expense_type: 'internal_transfer' }, // excluded
        { amount_try: 20_000, expense_type: 'operational' },
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    // ytdNet = 200_000 - 20_000 = 180_000
    expect(calc.ytd_net_income_try).toBe(180_000)
  })

  it('handles principal expense type (excluded)', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [
        { amount_try: 10_000, expense_type: 'principal' }, // excluded
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 5_000)
    expect(calc.ytd_net_income_try).toBe(100_000)
  })

  it('multiple finance event rows sum for existing reserves', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [
        { amount_try: 5_000 },
        { amount_try: 6_000 },
        { amount_try: 7_000 }, // total = 18_000 > required 15_000
      ],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_satisfied).toBe(true)
    expect(calc.legal_reserve_remaining_try).toBe(0)
  })

  it('single sales row and single expense row', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 150_000 }],
      expenses: [{ amount_try: 75_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 10_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ytd_net_income_try).toBe(75_000)
    // required = 75_000 * 0.05 = 3_750; existing = 10_000 > 3_750 → satisfied
    expect(calc.legal_reserve_satisfied).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency and determinism
// ─────────────────────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('same inputs produce same results on two calls', async () => {
    const makeS = () => makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c1 = await DividendService.calculate('co1', 'u1', makeS() as any, 50_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c2 = await DividendService.calculate('co1', 'u1', makeS() as any, 50_000)
    expect(c1.distributable_net_try).toBe(c2.distributable_net_try)
    expect(c1.can_declare).toBe(c2.can_declare)
    expect(c1.ytd_net_income_try).toBe(c2.ytd_net_income_try)
  })

  it('different gross dividend amounts produce proportional withholding', async () => {
    const makeS = () => makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c1 = await DividendService.calculate('co1', 'u1', makeS() as any, 50_000)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c2 = await DividendService.calculate('co1', 'u1', makeS() as any, 100_000)
    // withholding should scale proportionally (c2 is 2× c1)
    expect(c2.withholding_try).toBeCloseTo(c1.withholding_try * 2, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('boundary values', () => {
  it('gross_dividend = 1 TRY — minimal case', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 1)
    expect(calc.gross_dividend_try).toBe(1)
    expect(calc.withholding_try).toBeCloseTo(0.1, 2)
    expect(calc.distributable_net_try).toBeCloseTo(0.9, 2)
  })

  it('gross_dividend = 0 — no distribution possible', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 0)
    expect(calc.gross_dividend_try).toBe(0)
    expect(calc.can_declare).toBe(false)
  })

  it('very large gross dividend: blocks if > ytd net', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 1_000 }],
      expenses: [{ amount_try: 0, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 1_000_000_000)
    expect(calc.can_declare).toBe(false)
  })

  it('required_legal_reserve is non-negative for any income', async () => {
    const amounts = [-100_000, 0, 1_000, 100_000, 1_000_000]
    for (const salesAmt of amounts) {
      const sb = makeSupabase({
        sales: salesAmt > 0 ? [{ total_try: salesAmt }] : [],
        expenses: [],
        partners: TWO_PARTNERS,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calc = await DividendService.calculate('co1', 'u1', sb as any, 1_000)
      expect(calc.required_legal_reserve_try).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive: varying dividend amounts with same company state
// ─────────────────────────────────────────────────────────────────────────────

describe('varying gross_dividend amounts', () => {
  it('withheld amount is always 10% of gross dividend', async () => {
    const grossAmounts = [10_000, 50_000, 100_000, 250_000]
    for (const gross of grossAmounts) {
      const sb = makeSupabase({
        ...PROFITABLE,
        partners: TWO_PARTNERS,
        financeEvents: [{ amount_try: 100_000 }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calc = await DividendService.calculate('co1', 'u1', sb as any, gross)
      expect(calc.withholding_try).toBeCloseTo(gross * 0.1, 2)
    }
  })

  it('distributable_net is always 90% of gross dividend', async () => {
    const grossAmounts = [10_000, 50_000, 100_000]
    for (const gross of grossAmounts) {
      const sb = makeSupabase({
        ...PROFITABLE,
        partners: TWO_PARTNERS,
        financeEvents: [{ amount_try: 100_000 }],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calc = await DividendService.calculate('co1', 'u1', sb as any, gross)
      expect(calc.distributable_net_try).toBeCloseTo(gross * 0.9, 2)
    }
  })

  it('can_declare=true for gross <= ytd with satisfied reserve', async () => {
    const grossAmounts = [10_000, 50_000, 100_000, 200_000]
    for (const gross of grossAmounts) {
      const sb = makeSupabase({
        ...PROFITABLE, // ytdNet = 600_000
        partners: TWO_PARTNERS,
        financeEvents: [{ amount_try: 100_000 }], // satisfy reserve (5% of 600k = 30k < 100k)
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calc = await DividendService.calculate('co1', 'u1', sb as any, gross)
      expect(calc.can_declare).toBe(true)
    }
  })

  it('can_declare=false for gross > ytd', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      // ytdNet = 50_000
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 5_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.can_declare).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Share ratio normalization
// ─────────────────────────────────────────────────────────────────────────────

describe('share ratio normalization', () => {
  it('normalizes share ratios when they sum to != 1', async () => {
    // Partners with share ratios not summing to 1 → should normalize
    const oddPartners = [
      { id: 'p1', name: 'A', share_ratio: 0.3 },
      { id: 'p2', name: 'B', share_ratio: 0.3 },
    ] // sum = 0.6

    const sb = makeSupabase({
      ...PROFITABLE,
      partners: oddPartners,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    // Total ratio = 0.6; normalized: each gets 0.3/0.6 = 0.5
    const a = calc.partner_allocations.find(p => p.partner_id === 'p1')!
    const b = calc.partner_allocations.find(p => p.partner_id === 'p2')!
    expect(a.gross_share_try).toBeCloseTo(50_000, 1)
    expect(b.gross_share_try).toBeCloseTo(50_000, 1)
  })

  it('sum of share_ratio_pct from allocations equals 100 when ratios normalized', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS, // sum = 1.0
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    const totalPct = calc.partner_allocations.reduce((s, a) => s + a.share_ratio_pct, 0)
    expect(totalPct).toBeCloseTo(100, 1)
  })

  it('single partner with ratio 0.4 gets 100% after normalization', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: [{ id: 'p1', name: 'Solo', share_ratio: 0.4 }],
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.partner_allocations[0].share_ratio_pct).toBeCloseTo(100, 1)
    expect(calc.partner_allocations[0].gross_share_try).toBeCloseTo(100_000, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Consistency checks across multiple fields
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-field consistency', () => {
  it('blocking_reasons.length > 0 when can_declare = false', async () => {
    const sb = makeSupabase({ sales: [], expenses: [], partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    if (!calc.can_declare) {
      expect(calc.blocking_reasons.length).toBeGreaterThan(0)
    }
  })

  it('blocking_reasons.length = 0 when can_declare = true', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    if (calc.can_declare) {
      expect(calc.blocking_reasons).toHaveLength(0)
    }
  })

  it('ttk_509_satisfied and ttk_519_satisfied both true when can_declare = true', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    if (calc.can_declare) {
      expect(calc.ttk_509_satisfied).toBe(true)
      expect(calc.ttk_519_satisfied).toBe(true)
    }
  })

  it('distributable_net = distributable_gross * 0.9 when gross > 0', async () => {
    const sb = makeSupabase({
      ...PROFITABLE,
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 50_000 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.distributable_net_try).toBeCloseTo(calc.distributable_gross_try * 0.9, 2)
  })

  it('legal_reserve_remaining = max(0, required - existing)', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES, // ytdNet = 300_000 → required = 15_000
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 8_000 }], // partial
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_remaining_try).toBeCloseTo(15_000 - 8_000, 2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TTK 519: reserve threshold checks with varying incomes
// ─────────────────────────────────────────────────────────────────────────────

describe('TTK 519 reserve threshold', () => {
  it('exactly sufficient reserves → satisfied', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 5_000 }], // exactly 5% of 100_000
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.legal_reserve_satisfied).toBe(true)
    expect(calc.legal_reserve_remaining_try).toBe(0)
  })

  it('one TRY below threshold → NOT satisfied', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 4_999 }], // 1 TRY below 5_000
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    // legal_reserve_remaining = 5_000 - 4_999 = 1 > 0.01 → NOT satisfied
    expect(calc.legal_reserve_satisfied).toBe(false)
  })

  it('slightly over threshold (0.01 TRY tolerance) → satisfied', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 100_000 }],
      expenses: [],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 5_000.01 }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.legal_reserve_satisfied).toBe(true)
  })

  it('required_legal_reserve is exactly 5% of positive ytd net income', async () => {
    const scenarios = [
      { revenue: 200_000, expected: 10_000 },
      { revenue: 50_000, expected: 2_500 },
      { revenue: 1_000_000, expected: 50_000 },
    ]
    for (const { revenue, expected } of scenarios) {
      const sb = makeSupabase({ sales: [{ total_try: revenue }], expenses: [], partners: TWO_PARTNERS })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calc = await DividendService.calculate('co1', 'u1', sb as any, 1_000)
      expect(calc.required_legal_reserve_try).toBeCloseTo(expected, 2)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Partner allocation edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('partner allocation edge cases', () => {
  it('five partners with unequal shares', async () => {
    const fivePartners = [
      { id: 'p1', name: 'A', share_ratio: 0.4 },
      { id: 'p2', name: 'B', share_ratio: 0.25 },
      { id: 'p3', name: 'C', share_ratio: 0.15 },
      { id: 'p4', name: 'D', share_ratio: 0.12 },
      { id: 'p5', name: 'E', share_ratio: 0.08 },
    ] // sums to 1.0

    const sb = makeSupabase({ ...PROFITABLE, partners: fivePartners, financeEvents: [{ amount_try: 100_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.partner_allocations).toHaveLength(5)

    const sumNet = calc.partner_allocations.reduce((s, a) => s + a.net_share_try, 0)
    expect(sumNet).toBeCloseTo(calc.distributable_net_try, 0)
  })

  it('partner with share_ratio = 0 gets 0 allocation', async () => {
    const partnersWithZero = [
      { id: 'p1', name: 'A', share_ratio: 1.0 },
      { id: 'p2', name: 'B', share_ratio: 0.0 },
    ]
    const sb = makeSupabase({ ...PROFITABLE, partners: partnersWithZero, financeEvents: [{ amount_try: 100_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    const b = calc.partner_allocations.find(a => a.partner_id === 'p2')!
    expect(b.gross_share_try).toBe(0)
    expect(b.net_share_try).toBe(0)
  })

  it('gross_share + withholding = net_share + 2×withholding is wrong — actual: gross = net + withholding', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: TWO_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    for (const alloc of calc.partner_allocations) {
      expect(alloc.gross_share_try).toBeCloseTo(alloc.net_share_try + alloc.withholding_try, 2)
    }
  })

  it('allocation ordered: all allocations have non-negative gross', async () => {
    const sb = makeSupabase({ ...PROFITABLE, partners: THREE_PARTNERS, financeEvents: [{ amount_try: 50_000 }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    for (const alloc of calc.partner_allocations) {
      expect(alloc.gross_share_try).toBeGreaterThanOrEqual(0)
      expect(alloc.net_share_try).toBeGreaterThanOrEqual(0)
      expect(alloc.withholding_try).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Miscellaneous additional tests
// ─────────────────────────────────────────────────────────────────────────────

describe('misc additional', () => {
  it('ytd_net_income_try is positive when revenue > expenses', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 500_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ytd_net_income_try).toBeGreaterThan(0)
  })

  it('multiple expense rows of same type sum correctly', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 600_000 }],
      expenses: [
        { amount_try: 100_000, expense_type: 'operational' },
        { amount_try: 50_000, expense_type: 'operational' },
        { amount_try: 50_000, expense_type: 'operational' },
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // ytdNet = 600_000 - 200_000 = 400_000
    expect(calc.ytd_net_income_try).toBe(400_000)
  })

  it('legal_reserve_remaining is 0 when existing reserves exceed required', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 200_000 }],
      expenses: [],
      partners: TWO_PARTNERS,
      financeEvents: [{ amount_try: 100_000 }], // way more than 5% of 200k = 10k
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    expect(calc.legal_reserve_remaining_try).toBe(0)
    expect(calc.legal_reserve_satisfied).toBe(true)
  })

  it('partner_financing expense type is excluded', async () => {
    const sb = makeSupabase({
      sales: [{ total_try: 300_000 }],
      expenses: [
        { amount_try: 50_000, expense_type: 'operational' },
        { amount_try: 200_000, expense_type: 'partner_financing' }, // excluded
      ],
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    // ytdNet = 300_000 - 50_000 = 250_000
    expect(calc.ytd_net_income_try).toBe(250_000)
  })
})
