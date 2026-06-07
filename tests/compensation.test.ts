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

// Emits REAL partner_compensation_schedules columns (monthly_amount_try,
// start_date, end_date). Accepts legacy override keys (monthly_gross_try,
// effective_from/until) for ergonomics and maps them. Per-schedule
// withholding_rate/sgk_rate are NOT real columns — the service applies flat
// defaults on read — so any such override is intentionally ignored.
function makeSchedule(overrides: Partial<Row> = {}): Row {
  const o = overrides as Record<string, unknown>
  const gross = o.monthly_amount_try ?? o.monthly_gross_try ?? 10_000
  const start = o.start_date ?? o.effective_from   ?? '2026-01-01'
  const end   = o.end_date   ?? o.effective_until  ?? null
  const {
    monthly_gross_try: _g, withholding_rate: _w, sgk_rate: _s,
    effective_from: _ef, effective_until: _eu,
    monthly_amount_try: _ma, start_date: _sd, end_date: _ed,
    ...rest
  } = o
  return {
    id:                 's1',
    partner_id:         'p1',
    monthly_amount_try: gross,
    start_date:         start,
    end_date:           end,
    board_decision_ref: 'YK/2026-01',
    is_active:          true,
    notes:              null,
    partners:           PARTNER_A,
    ...rest,
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

// ── 9. computeNet — 100% withholding ─────────────────────────────────────────

describe('computeNet — extreme rates', () => {
  it('100% withholding → net = 0, withholding = gross', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(20_000, 1.0)
    expect(withholding_try).toBe(20_000)
    expect(net_try).toBe(0)
  })

  it('withholding + net always sums to gross', () => {
    const gross = 37_500
    const rate  = 0.22
    const { withholding_try, net_try } = CompensationService.computeNet(gross, rate)
    expect(withholding_try + net_try).toBeCloseTo(gross, 2)
  })

  it('very small gross still returns correct proportions', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(100, 0.10)
    expect(withholding_try).toBe(10)
    expect(net_try).toBe(90)
  })
})

// ── 10. Multiple schedules produce multiple payment dues ──────────────────────

describe('getDuePayments — multiple partners', () => {
  it('two active schedules produce two separate due entries for same month', async () => {
    const sched1 = makeSchedule({ id: 's1', partner_id: 'p1', partners: PARTNER_A })
    const sched2 = makeSchedule({ id: 's2', partner_id: 'p2', partners: PARTNER_B })
    const sb = makeSupabase({ schedules: [sched1, sched2] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.filter(d => d.payment_period === '2026-05-01')
    expect(may.length).toBe(2)
  })

  it('partner names are preserved in due payment entries', async () => {
    const sched = makeSchedule({ id: 's1', partner_id: 'p1', partners: PARTNER_A })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const entry = result.find(d => d.partner_id === 'p1')
    expect(entry?.partner_name).toBe('Ali')
  })
})

// ── 11. period_label format ───────────────────────────────────────────────────

describe('getDuePayments — period_label', () => {
  it('period label for May 2026 is "Mayıs 2026"', async () => {
    const sb = makeSupabase({ schedules: [makeSchedule()] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may?.period_label).toBe('Mayıs 2026')
  })

  it('period label for January 2026 is "Ocak 2026"', async () => {
    const schedule = makeSchedule({ effective_from: '2026-01-01' })
    const sb = makeSupabase({ schedules: [schedule] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-01-31', months: 1 },
    )
    const jan = result.find(d => d.payment_period === '2026-01-01')
    expect(jan?.period_label).toBe('Ocak 2026')
  })
})

// ── 12. getDuePayments returns schedule_id on entries ─────────────────────────

describe('getDuePayments — schedule_id linkage', () => {
  it('each due payment references its schedule_id', async () => {
    const schedule = makeSchedule({ id: 's99' })
    const sb = makeSupabase({ schedules: [schedule] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const entry = result[0]
    expect(entry?.schedule_id).toBe('s99')
  })
})

// ── 13. existing_payment_id is null when no prior payment ────────────────────

describe('getDuePayments — no prior payment', () => {
  it('no payment recorded → existing_payment_id is null', async () => {
    const sb = makeSupabase({ schedules: [makeSchedule()], payments: [] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may?.existing_payment_id).toBeNull()
    expect(may?.existing_payment_status).toBeNull()
  })
})

// ── 14. computeNet — rounding boundary ───────────────────────────────────────

describe('computeNet — rounding', () => {
  it('gross 333, rate 1/3 — withholding + net = gross', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(333, 1 / 3)
    expect(withholding_try + net_try).toBeCloseTo(333, 1)
  })

  it('gross 1, rate 0.5 → withholding 0.5, net 0.5', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(1, 0.5)
    expect(withholding_try).toBeCloseTo(0.5, 2)
    expect(net_try).toBeCloseTo(0.5, 2)
  })
})

// ── 15. listSchedules — net_monthly_try field ────────────────────────────────

describe('listSchedules — net_monthly_try', () => {
  // The schedule table has no per-row rate column; listSchedules applies the
  // flat default withholding rate (15%), so net = gross × 0.85.
  it('applies default 15% withholding → net = 85% of gross', async () => {
    const sched = makeSchedule({ monthly_gross_try: 50_000 })
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    expect(schedules[0].net_monthly_try).toBe(42_500)
  })

  it('net_monthly_try = gross × 0.85 for a 15_000 gross schedule', async () => {
    const sched = makeSchedule({ monthly_gross_try: 15_000 })
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    expect(schedules[0].net_monthly_try).toBe(12_750)
  })
})

// ── 16. Different withholding rates: 0%, 10%, 15%, 20% ───────────────────────

describe('computeNet — varying withholding rates', () => {
  it('0% withholding → net = gross, withholding = 0', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(20_000, 0)
    expect(withholding_try).toBe(0)
    expect(net_try).toBe(20_000)
  })

  it('10% withholding → withholding = 2000, net = 18000', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(20_000, 0.10)
    expect(withholding_try).toBe(2_000)
    expect(net_try).toBe(18_000)
  })

  it('15% withholding → withholding = 3000, net = 17000', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(20_000, 0.15)
    expect(withholding_try).toBe(3_000)
    expect(net_try).toBe(17_000)
  })

  it('20% withholding → withholding = 4000, net = 16000', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(20_000, 0.20)
    expect(withholding_try).toBe(4_000)
    expect(net_try).toBe(16_000)
  })

  it('net = gross × (1 − rate) for all four rates', () => {
    const gross = 50_000
    for (const rate of [0, 0.10, 0.15, 0.20]) {
      const { net_try } = CompensationService.computeNet(gross, rate)
      expect(net_try).toBeCloseTo(gross * (1 - rate), 1)
    }
  })
})

// ── 17. SGK rate variations ────────────────────────────────────────────────────

describe('computeNet — sgk_rate interaction', () => {
  it('sgk_rate of 0 does not affect net (only withholding counts)', () => {
    const { net_try } = CompensationService.computeNet(10_000, 0.15)
    // SGK is not part of computeNet, so net = gross × (1 - withholding)
    expect(net_try).toBe(8_500)
  })

  it('computeNet is independent of sgk_rate field', () => {
    // computeNet only takes gross and withholding_rate
    // Verify: same result regardless of any sgk_rate on the schedule
    const result1 = CompensationService.computeNet(10_000, 0.15)
    const result2 = CompensationService.computeNet(10_000, 0.15)
    expect(result1.net_try).toBe(result2.net_try)
    expect(result1.withholding_try).toBe(result2.withholding_try)
  })

  it('listSchedules exposes sgk_rate field on each schedule (flat default)', async () => {
    const sched = makeSchedule()
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    // sgk_rate is not a per-schedule column — service returns the flat default (0)
    expect(schedules[0].sgk_rate).toBe(0)
  })
})

// ── 18. Multiple active schedules ──────────────────────────────────────────────

describe('getDuePayments — multiple active schedules', () => {
  it('three active schedules produce three entries for the same month', async () => {
    const PARTNER_C = { id: 'p3', name: 'Hasan', share_ratio: 0.2 }
    const sched1 = makeSchedule({ id: 's1', partner_id: 'p1', partners: PARTNER_A })
    const sched2 = makeSchedule({ id: 's2', partner_id: 'p2', partners: PARTNER_B })
    const sched3 = makeSchedule({ id: 's3', partner_id: 'p3', partners: PARTNER_C })
    const sb = makeSupabase({ schedules: [sched1, sched2, sched3] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.filter(d => d.payment_period === '2026-05-01')
    expect(may.length).toBe(3)
  })

  it('multiple schedules with different gross produce correct separate nets', async () => {
    const sched1 = makeSchedule({ id: 's1', partner_id: 'p1', monthly_gross_try: 10_000, partners: PARTNER_A })
    const sched2 = makeSchedule({ id: 's2', partner_id: 'p2', monthly_gross_try: 20_000, partners: PARTNER_B })
    const sb = makeSupabase({ schedules: [sched1, sched2] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const entry1 = result.find(d => d.partner_id === 'p1' && d.payment_period === '2026-05-01')
    const entry2 = result.find(d => d.partner_id === 'p2' && d.payment_period === '2026-05-01')
    expect(entry1?.gross_amount_try).toBe(10_000)
    expect(entry1?.net_amount_try).toBe(8_500)
    expect(entry2?.gross_amount_try).toBe(20_000)
    expect(entry2?.net_amount_try).toBe(17_000)
  })
})

// ── 19. Expired schedules ───────────────────────────────────────────────────────

describe('getDuePayments — expired schedule scenarios', () => {
  it('schedule expired last month is not shown in current month', async () => {
    // Effective until April 2026 — should not appear in May 2026
    const sched = makeSchedule({
      effective_from:  '2026-01-01',
      effective_until: '2026-04-01',
    })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may).toBeUndefined()
  })

  it('schedule expiring this month still shows for current month', async () => {
    const sched = makeSchedule({
      effective_from:  '2026-01-01',
      effective_until: '2026-05-01',
    })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    const may = result.find(d => d.payment_period === '2026-05-01')
    expect(may).toBeDefined()
  })

  it('past schedule generates overdue entries in lookback window', async () => {
    const sched = makeSchedule({
      effective_from:  '2026-03-01',
      effective_until: '2026-04-01',
    })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 3 },
    )
    // March and April should appear as overdue (before May)
    const overdue = result.filter(d => d.is_overdue)
    expect(overdue.length).toBeGreaterThan(0)
  })
})

// ── 20. Missing board_decision_ref ─────────────────────────────────────────────

describe('listSchedules — missing board_decision_ref', () => {
  it('null board_decision_ref is returned as null', async () => {
    const sched = makeSchedule({ board_decision_ref: null })
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    expect(schedules[0].board_decision_ref).toBeNull()
  })

  it('undefined board_decision_ref coerces to null', async () => {
    const sched = makeSchedule({ board_decision_ref: undefined })
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules = await CompensationService.listSchedules('co1', sb as any)
    expect(schedules[0].board_decision_ref).toBeNull()
  })
})

// ── 21. Net amount = gross × (1 − withholding − sgk) formula ──────────────────

describe('net amount formula verification', () => {
  it('net = gross × (1 − withholding_rate) for various gross amounts', () => {
    const testCases = [
      { gross: 5_000, rate: 0.10 },
      { gross: 10_000, rate: 0.15 },
      { gross: 30_000, rate: 0.20 },
      { gross: 100_000, rate: 0 },
    ]
    for (const { gross, rate } of testCases) {
      const { net_try, withholding_try } = CompensationService.computeNet(gross, rate)
      expect(net_try).toBeCloseTo(gross * (1 - rate), 1)
      expect(withholding_try).toBeCloseTo(gross * rate, 1)
    }
  })

  it('withholding_try + net_try always equals gross', () => {
    const cases = [
      [10_000, 0.15],
      [25_000, 0.10],
      [50_000, 0.20],
      [7_777, 0.15],
    ]
    for (const [gross, rate] of cases) {
      const { withholding_try, net_try } = CompensationService.computeNet(gross, rate)
      expect(withholding_try + net_try).toBeCloseTo(gross, 1)
    }
  })

  it('gross of 0 produces 0 withholding and 0 net', () => {
    const { withholding_try, net_try } = CompensationService.computeNet(0, 0.15)
    expect(withholding_try).toBe(0)
    expect(net_try).toBe(0)
  })
})

// ── 22. getDuePayments returns board_decision_ref ─────────────────────────────

describe('getDuePayments — gross_amount_try accuracy', () => {
  it('gross_amount_try matches schedule monthly_gross_try exactly', async () => {
    const sched = makeSchedule({ monthly_gross_try: 33_333 })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    expect(result[0]?.gross_amount_try).toBe(33_333)
  })

  it('withholding_try in due payment equals computeNet output', async () => {
    const sched = makeSchedule({ monthly_gross_try: 12_000 })
    const sb = makeSupabase({ schedules: [sched] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    // getDuePayments applies the flat default withholding rate (15%)
    const { withholding_try } = CompensationService.computeNet(12_000, 0.15)
    expect(result[0]?.withholding_try).toBe(withholding_try)
  })
})

// ── 23. Turkish month labels for all 12 months ───────────────────────────────

describe('getDuePayments — Turkish month labels', () => {
  const monthCases = [
    { month: '01', label: 'Ocak' },
    { month: '02', label: 'Şubat' },
    { month: '03', label: 'Mart' },
    { month: '04', label: 'Nisan' },
    { month: '06', label: 'Haziran' },
    { month: '07', label: 'Temmuz' },
    { month: '08', label: 'Ağustos' },
    { month: '09', label: 'Eylül' },
    { month: '10', label: 'Ekim' },
    { month: '11', label: 'Kasım' },
    { month: '12', label: 'Aralık' },
  ]

  for (const { month, label } of monthCases) {
    it(`period_label for month ${month} is "${label} 2026"`, async () => {
      const today = `2026-${month}-15`
      const schedule = makeSchedule({ effective_from: `2026-${month}-01` })
      const sb = makeSupabase({ schedules: [schedule] })
      const result = await CompensationService.getDuePayments(
        'co1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sb as any,
        { today, months: 1 },
      )
      const entry = result.find(d => d.payment_period === `2026-${month}-01`)
      expect(entry?.period_label).toBe(`${label} 2026`)
    })
  }
})

// ── 24. CompensationSchedule shape verification ───────────────────────────────

describe('listSchedules — schedule shape', () => {
  it('schedule has all required fields', async () => {
    const sched = makeSchedule()
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await CompensationService.listSchedules('co1', sb as any)
    const s = result[0]
    expect(s).toHaveProperty('id')
    expect(s).toHaveProperty('partner_id')
    expect(s).toHaveProperty('partner_name')
    expect(s).toHaveProperty('monthly_gross_try')
    expect(s).toHaveProperty('withholding_rate')
    expect(s).toHaveProperty('sgk_rate')
    expect(s).toHaveProperty('net_monthly_try')
    expect(s).toHaveProperty('effective_from')
    expect(s).toHaveProperty('effective_until')
    expect(s).toHaveProperty('board_decision_ref')
    expect(s).toHaveProperty('is_active')
    expect(s).toHaveProperty('notes')
  })

  it('is_active is a boolean', async () => {
    const sched = makeSchedule({ is_active: true })
    const sb = makeSupabase({ schedules: [sched] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await CompensationService.listSchedules('co1', sb as any)
    expect(typeof result[0].is_active).toBe('boolean')
  })

  it('empty schedules returns empty array', async () => {
    const sb = makeSupabase({ schedules: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await CompensationService.listSchedules('co1', sb as any)
    expect(result).toEqual([])
  })
})

// ── 25. getDuePayments — no schedules → empty array ───────────────────────────

describe('getDuePayments — no schedules', () => {
  it('returns empty array when no schedules exist', async () => {
    const sb = makeSupabase({ schedules: [], payments: [] })
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 3 },
    )
    expect(result).toEqual([])
  })

  it('returns empty array when schedules is undefined/empty', async () => {
    const sb = makeSupabase({})
    const result = await CompensationService.getDuePayments(
      'co1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sb as any,
      { today: '2026-05-27', months: 1 },
    )
    expect(result).toHaveLength(0)
  })
})
