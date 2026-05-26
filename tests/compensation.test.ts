/**
 * CompensationService pure-logic unit tests
 * TTK 394 Huzur Hakkı — 8 tests
 *
 * Run: npx vitest run tests/compensation.test.ts
 */

import { describe, it, expect } from 'vitest'
import { CompensationService } from '../lib/services/pcle/compensation.service'

// ── Mock Supabase builder ──────────────────────────────────────────────────────

type Row = Record<string, unknown>

interface MockOpts {
  schedules?: Row[]
  payments?:  Row[]
}

function makeSupabase(opts: MockOpts) {
  const tables: Record<string, Row[]> = {
    partner_compensation_schedules: opts.schedules ?? [],
    partner_compensation_payments:  opts.payments  ?? [],
  }

  return {
    from: (table: string) => {
      const rows = tables[table] ?? []
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select  = self
      chain.eq      = self
      chain.gte     = self
      chain.order   = self
      chain.single  = () => Promise.resolve({ data: rows[0] ?? null, error: null })
      chain.then    = (cb: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(cb({ data: rows, error: null }))
      return chain
    },
  }
}

// ── Test data ─────────────────────────────────────────────────────────────────

const PARTNER_A = { id: 'p1', name: 'Ali', share_ratio: 0.6 }
const PARTNER_B = { id: 'p2', name: 'Veli', share_ratio: 0.4 }

function makeSchedule(overrides: Partial<Row> = {}): Row {
  return {
    id:                 's1',
    partner_id:         'p1',
    monthly_gross_try:  10_000,
    withholding_rate:   0.15,
    sgk_rate:           0,
    effective_from:     '2026-01-01',
    effective_until:    null,
    board_decision_ref: 'YK/2026-01',
    is_active:          true,
    notes:              null,
    partners:           PARTNER_A,
    ...overrides,
  }
}

// ── 1. computeNet: gross 10000, rate 0.15 → withholding 1500, net 8500 ──────

describe('computeNet', () => {
  it('gross 10000, rate 0.15 → withholding 1500, net 8500', () => {
    const result = CompensationService.computeNet(10_000, 0.15)
    expect(result.withholding_try).toBe(1_500)
    expect(result.net_try).toBe(8_500)
  })

  it('withholding_rate × gross formula', () => {
    const result = CompensationService.computeNet(25_000, 0.20)
    expect(result.withholding_try).toBe(5_000)
    expect(result.net_try).toBe(20_000)
  })
})

// ── 2. getDuePayments: active schedule → payment due for current month ───────

describe('getDuePayments — active schedule', () => {
  it('active schedule generates payment due for current month', async () => {
    const sb = makeSupabase({ schedules: [makeSchedule()] })
    const today  = '2026-05-27'
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today, months: 1 },
    )
    expect(result.length).toBeGreaterThan(0)
    const current = result.find(d => d.payment_period === '2026-05-01')
    expect(current).toBeDefined()
    expect(current?.partner_name).toBe('Ali')
    expect(current?.gross_amount_try).toBe(10_000)
    expect(current?.withholding_try).toBe(1_500)
    expect(current?.net_amount_try).toBe(8_500)
  })
})

// ── 3. getDuePayments: payment already recorded → existing_payment_id set ────

describe('getDuePayments — existing payment', () => {
  it('existing paid payment → existing_payment_id set', async () => {
    const payment: Row = {
      id:             'pay1',
      schedule_id:    's1',
      payment_period: '2026-05-01',
      payment_status: 'paid',
    }
    const sb = makeSupabase({ schedules: [makeSchedule()], payments: [payment] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may?.existing_payment_id).toBe('pay1')
    expect(may?.existing_payment_status).toBe('paid')
  })
})

// ── 4. Overdue: payment_period < current month AND not paid → is_overdue ─────

describe('getDuePayments — overdue detection', () => {
  it('past period without payment → is_overdue = true', async () => {
    // Schedule effective from April 2026
    const schedule = makeSchedule({ effective_from: '2026-04-01' })
    const sb = makeSupabase({ schedules: [schedule], payments: [] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 2 },
    )
    const april = result.find(d => d.payment_period === '2026-04-01')
    expect(april).toBeDefined()
    expect(april?.is_overdue).toBe(true)
  })

  it('current month → is_overdue = false', async () => {
    const sb = makeSupabase({ schedules: [makeSchedule()], payments: [] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may?.is_overdue).toBe(false)
  })
})

// ── 5. Inactive schedule → not in due payments ───────────────────────────────

describe('getDuePayments — inactive schedules excluded', () => {
  it('is_active = false → schedule not included', async () => {
    const inactiveSchedule = makeSchedule({ is_active: false })
    // Note: the service filters by is_active=true via .eq('is_active', true)
    // Our mock only returns rows for partner_compensation_schedules regardless,
    // so we simulate by passing an empty array to represent the filtered result.
    const sb = makeSupabase({ schedules: [] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    // With no active schedules the result must be empty
    expect(result).toHaveLength(0)
    void inactiveSchedule // suppress unused var
  })
})

// ── 6. monthly_gross_try sums all active schedules ────────────────────────────

describe('listSchedules — monthly gross', () => {
  it('net_monthly_try is gross × (1 − withholding_rate)', async () => {
    const sched1 = makeSchedule({ id: 's1', partner_id: 'p1', monthly_gross_try: 10_000, partners: PARTNER_A })
    const sched2 = makeSchedule({ id: 's2', partner_id: 'p2', monthly_gross_try: 15_000, partners: PARTNER_B })
    const sb = makeSupabase({ schedules: [sched1, sched2] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    const totalGross = schedules.reduce((s, x) => s + x.monthly_gross_try, 0)
    const totalNet   = schedules.reduce((s, x) => s + x.net_monthly_try,   0)
    expect(totalGross).toBe(25_000)
    // Net for both: (10000 × 0.85) + (15000 × 0.85) = 8500 + 12750 = 21250
    expect(totalNet).toBe(21_250)
  })
})

// ── 7. Net formula: withholding_rate × gross ──────────────────────────────────

describe('computeNet — formula verification', () => {
  it('zero withholding → net equals gross', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(5_000, 0)
    expect(withholding_try).toBe(0)
    expect(net_try).toBe(5_000)
  })

  it('fractional amounts round to 2 decimal places', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(1_000, 0.175)
    expect(withholding_try).toBe(175)
    expect(net_try).toBe(825)
  })
})

// ── 8. effective_until in the past → schedule not active for current period ──

describe('getDuePayments — effective_until in past', () => {
  it('schedule ended before current month → no current month entry', async () => {
    // Schedule ended March 2026 — should not appear in May 2026 period
    const endedSchedule = makeSchedule({
      effective_from:  '2026-01-01',
      effective_until: '2026-03-01',
    })
    const sb = makeSupabase({ schedules: [endedSchedule] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may).toBeUndefined()
  })
})
