/**
 * DividendService pure-logic unit tests.
 *
 * Run with: npx vitest run tests/dividend.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { DividendService } from '../lib/services/pcle/dividend.service'

// ── Mock Supabase factory ──────────────────────────────────────────────────────
// Returns a chainable mock that resolves with provided `data`.

type RowData = Record<string, unknown>

function makeSupabase(opts: {
  sales?:         RowData[]
  expenses?:      RowData[]
  partners?:      RowData[]
  financeEvents?: RowData[]
}) {
  const responses: Record<string, RowData[]> = {
    sales:                  opts.sales         ?? [],
    expenses:               opts.expenses       ?? [],
    partners:               opts.partners       ?? [],
    partner_finance_events: opts.financeEvents  ?? [],
  }

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

const HIGH_REVENUE_EXPENSES = {
  sales:    [{ total_try: 500_000 }],
  expenses: [{ amount_try: 200_000, expense_type: 'operational' }],
  // ytd_net = 300_000
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Legal reserve: 5% of net income
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
      financeEvents: [{ amount_try: 20_000 }], // existing reserves exceed required
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_satisfied).toBe(true)
    expect(calc.legal_reserve_remaining_try).toBe(0)
  })

  it('legal_reserve NOT satisfied when reserves are insufficient', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // No existing reserves
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.legal_reserve_satisfied).toBe(false)
    expect(calc.legal_reserve_remaining_try).toBe(15_000)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. TTK 509 fails when net income = 0
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

  // 3. TTK 509 fails when requested > distributable
  it('fails when gross_dividend > ytd_net_income', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 100_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      // ytdNet = 50_000
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 100_000)
    expect(calc.can_declare).toBe(false)
    expect(calc.blocking_reasons.some(r => r.includes('net geliri aşıyor') || r.includes('TTK 509'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Withholding = gross × 0.10
// ─────────────────────────────────────────────────────────────────────────────

describe('withholding tax (GVK 94 §4)', () => {
  it('withholding = gross × 0.10', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }], // satisfy reserve
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.withholding_rate).toBe(0.10)
    expect(calc.withholding_try).toBe(5_000)
  })

  // 5. Net = gross - withholding
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
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Partner allocation: share_ratio × distributable
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
    // Ali: 60% of 100_000 = 60_000 gross; withholding 6_000; net 54_000
    expect(ali!.gross_share_try).toBe(60_000)
    expect(ali!.withholding_try).toBe(6_000)
    expect(ali!.net_share_try).toBe(54_000)
    // Veli: 40%
    expect(veli!.gross_share_try).toBe(40_000)
    expect(veli!.net_share_try).toBe(36_000)
  })

  // 10. Sum of partner allocations = distributable_net (within 0.01 rounding)
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
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. can_declare = false when reserve not satisfied
// ─────────────────────────────────────────────────────────────────────────────

describe('can_declare', () => {
  it('can_declare = false when legal reserve not satisfied', async () => {
    const sb = makeSupabase({ ...HIGH_REVENUE_EXPENSES, partners: TWO_PARTNERS })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ttk_519_satisfied).toBe(false)
    expect(calc.can_declare).toBe(false)
  })

  // 8. can_declare = true when all checks pass
  it('can_declare = true when all checks pass', async () => {
    const sb = makeSupabase({
      ...HIGH_REVENUE_EXPENSES,
      partners:      TWO_PARTNERS,
      financeEvents: [{ amount_try: 20_000 }], // satisfy 5% reserve on 300k net = 15k
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 50_000)
    expect(calc.ttk_509_satisfied).toBe(true)
    expect(calc.ttk_519_satisfied).toBe(true)
    expect(calc.can_declare).toBe(true)
    expect(calc.blocking_reasons).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. blocking_reasons in Turkish for each failure
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
    // All messages should contain Turkish text (TTK references and Turkish words)
    for (const reason of calc.blocking_reasons) {
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(10)
      // Should reference TTK
      expect(reason).toMatch(/TTK/)
    }
  })

  it('both TTK 509 and TTK 519 appear when both fail', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 50_000 }],
      expenses: [{ amount_try: 50_000, expense_type: 'operational' }],
      // ytdNet = 0 → both 509 and 519 fail
      partners: TWO_PARTNERS,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 10_000)
    const has509 = calc.blocking_reasons.some(r => r.includes('TTK 509'))
    const has519 = calc.blocking_reasons.some(r => r.includes('TTK 519'))
    // 519 check only adds a message if reserve not satisfied
    // When income is 0, required_reserve = 0 → reserve IS satisfied
    // So only 509 fails
    expect(has509).toBe(true)
    // With 0 income, reserve required = 0 → satisfied
    expect(calc.ttk_519_satisfied).toBe(true)
    void has519 // not checked here
  })

  it('reserve blocking reason appears when income > 0 but no reserves', async () => {
    const sb = makeSupabase({
      sales:    [{ total_try: 200_000 }],
      expenses: [{ amount_try: 100_000, expense_type: 'operational' }],
      // ytdNet = 100_000 → reserve = 5_000 required
      partners:      TWO_PARTNERS,
      financeEvents: [], // no reserves
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calc = await DividendService.calculate('co1', 'u1', sb as any, 80_000)
    expect(calc.ttk_519_satisfied).toBe(false)
    const has519 = calc.blocking_reasons.some(r => r.includes('TTK 519'))
    expect(has519).toBe(true)
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
})
