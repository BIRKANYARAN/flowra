/**
 * CapitalCallService unit tests
 * TTK 588 Capital Call Tracker — 10 tests
 *
 * Run: npx vitest run tests/capital-call.test.ts
 */

import { describe, it, expect } from 'vitest'
import { CapitalCallService } from '../lib/services/pcle/capital-call.service'

// ── Mock Supabase builder ──────────────────────────────────────────────────────

type Row = Record<string, unknown>

function makeSupabase(rows: Row[]) {
  return {
    from: (_table: string) => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = self
      chain.eq     = self
      chain.then   = (cb: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve(cb({ data: rows, error: null }))
      return chain
    },
  }
}

// ── Test data factories ───────────────────────────────────────────────────────

function makeCommitment(overrides: Partial<Row> = {}): Row {
  return {
    id:                   'c1',
    partner_id:           'p1',
    committed_amount_try: 100_000,
    paid_amount_try:      100_000,
    commitment_date:      '2026-01-01',
    call_date:            '2026-02-01',
    payment_status:       'paid',
    partners: { name: 'Ali', share_ratio: 0.6 },
    ...overrides,
  }
}

// ── 1. No commitments → empty report, all zeros ───────────────────────────────

describe('CapitalCallService.getReport', () => {
  it('no commitments → empty report with all zeros', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([]) as any)
    expect(report.partners).toHaveLength(0)
    expect(report.total_committed_try).toBe(0)
    expect(report.total_paid_try).toBe(0)
    expect(report.total_equity_gap_try).toBe(0)
    expect(report.total_ttk_588_interest_try).toBe(0)
    expect(report.overdue_partners).toBe(0)
  })
})

// ── 2. Fully paid commitment → equity_gap = 0, no interest ───────────────────

describe('fully paid commitment', () => {
  it('paid in full → equity_gap = 0, no TTK 588 interest', async () => {
    const commitment = makeCommitment()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners).toHaveLength(1)
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(0)
    expect(partner.ttk_588_applies).toBe(false)
    expect(partner.ttk_588_interest_try).toBe(0)
    expect(partner.status).toBe('paid')
  })
})

// ── 3. Partial payment → equity_gap = committed - paid ───────────────────────

describe('partial payment', () => {
  it('partial payment → equity_gap = committed - paid', async () => {
    const commitment = makeCommitment({ paid_amount_try: 60_000 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(40_000)
    expect(partner.total_paid_try).toBe(60_000)
    expect(partner.total_committed_try).toBe(100_000)
  })
})

// ── 4. Overdue: call_date in past → is_overdue = true ────────────────────────

describe('overdue detection', () => {
  it('call_date in past with unpaid gap → is_overdue = true', async () => {
    const commitment = makeCommitment({
      paid_amount_try: 0,
      call_date:       '2026-03-01',
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.is_overdue).toBe(true)
    expect(partner.days_overdue).toBeGreaterThan(0)
  })
})

// ── 5. computeInterest: 100000 gap, 90 days, 9% → ≈ 2219 ────────────────────

describe('computeInterest', () => {
  it('100000 × 0.09 × (90/365) ≈ 2219.18', () => {
    const interest = CapitalCallService.computeInterest(100_000, 90, 0.09)
    // 100000 × 0.09 × 90 / 365 = 8100 / 365 ≈ 2219.18
    expect(interest).toBeCloseTo(2_219.18, 1)
  })

  it('zero gap → zero interest', () => {
    expect(CapitalCallService.computeInterest(0, 90, 0.09)).toBe(0)
  })

  it('zero days → zero interest', () => {
    expect(CapitalCallService.computeInterest(100_000, 0, 0.09)).toBe(0)
  })
})

// ── 6. TTK 588 not applicable if not overdue (no call_date) ──────────────────

describe('TTK 588 applicability', () => {
  it('gap > 0 but no call_date → TTK 588 does not apply', async () => {
    const commitment = makeCommitment({ paid_amount_try: 50_000, call_date: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(50_000)
    expect(partner.is_overdue).toBe(false)
    expect(partner.ttk_588_applies).toBe(false)
    expect(partner.ttk_588_interest_try).toBe(0)
  })

  it('call_date in future → TTK 588 does not apply', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2027-01-01' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.is_overdue).toBe(false)
    expect(partner.ttk_588_applies).toBe(false)
  })
})

// ── 7. days_overdue = today - call_date ───────────────────────────────────────

describe('days_overdue calculation', () => {
  it('call_date 90 days ago → days_overdue = 90', async () => {
    // call_date = 2026-02-26 → 90 days before 2026-05-27
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-02-26' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.days_overdue).toBe(90)
  })
})

// ── 8. Status 'overdue_with_interest' when overdue AND days > 0 AND gap > 0 ──

describe('status classification', () => {
  it('overdue with gap → status overdue_with_interest', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-01' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('overdue_with_interest')
  })

  it('fully paid → status paid', async () => {
    const commitment = makeCommitment()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('paid')
  })
})

// ── 9. Status 'paid' when equity_gap = 0 ─────────────────────────────────────

describe('status paid', () => {
  it('equity_gap = 0 → partner.status = paid regardless of call_date', async () => {
    const commitment = makeCommitment({ paid_amount_try: 100_000, call_date: '2026-01-01' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(0)
    expect(report.partners[0].status).toBe('paid')
  })
})

// ── 10. Sum of total_equity_gap_try across partners ───────────────────────────

describe('report totals', () => {
  it('total_equity_gap_try = sum of per-partner gaps', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', committed_amount_try: 100_000, paid_amount_try: 60_000, partners: { name: 'Ali',  share_ratio: 0.6 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', committed_amount_try: 50_000, paid_amount_try: 20_000, call_date: null, partners: { name: 'Veli', share_ratio: 0.4 } }),
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    // p1 gap = 40_000, p2 gap = 30_000 → total = 70_000
    expect(report.total_equity_gap_try).toBe(70_000)
    expect(report.total_committed_try).toBe(150_000)
    expect(report.total_paid_try).toBe(80_000)
  })
})
