/**
 * CapitalCallService unit tests
 * TTK 588 Capital Call Tracker — comprehensive coverage
 *
 * Run: npx vitest run tests/capital-call.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  CapitalCallService,
  DEFAULT_TTK588_RATE,
} from '../lib/services/pcle/capital-call.service'

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

function makeSupabaseError(message: string) {
  return {
    from: (_table: string) => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = self
      chain.eq     = self
      chain.then   = (cb: (v: { data: null; error: { message: string } }) => unknown) =>
        Promise.resolve(cb({ data: null, error: { message } }))
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

// ── 1. DEFAULT_TTK588_RATE constant ───────────────────────────────────────────

describe('DEFAULT_TTK588_RATE', () => {
  it('default TTK 588 rate is 9% per annum', () => {
    expect(DEFAULT_TTK588_RATE).toBe(0.09)
  })

  it('is a positive number', () => {
    expect(DEFAULT_TTK588_RATE).toBeGreaterThan(0)
    expect(DEFAULT_TTK588_RATE).toBeLessThan(1)
  })
})

// ── 2. computeInterest: basic cases ──────────────────────────────────────────

describe('CapitalCallService.computeInterest — basic cases', () => {
  it('100000 × 0.09 × (90/365) ≈ 2219.18', () => {
    const interest = CapitalCallService.computeInterest(100_000, 90, 0.09)
    expect(interest).toBeCloseTo(2_219.18, 1)
  })

  it('zero gap → zero interest', () => {
    expect(CapitalCallService.computeInterest(0, 90, 0.09)).toBe(0)
  })

  it('zero days → zero interest', () => {
    expect(CapitalCallService.computeInterest(100_000, 0, 0.09)).toBe(0)
  })

  it('negative gap → zero interest', () => {
    expect(CapitalCallService.computeInterest(-100_000, 90, 0.09)).toBe(0)
  })

  it('negative days → zero interest', () => {
    expect(CapitalCallService.computeInterest(100_000, -30, 0.09)).toBe(0)
  })
})

// ── 3. computeInterest: precision and formula verification ───────────────────

describe('CapitalCallService.computeInterest — formula verification', () => {
  it('formula: equityGap × annualRate × (daysOverdue / 365)', () => {
    const gap      = 200_000
    const days     = 180
    const rate     = 0.12
    const expected = 200_000 * 0.12 * (180 / 365)  // ≈ 11_835.62
    expect(CapitalCallService.computeInterest(gap, days, rate)).toBeCloseTo(expected, 1)
  })

  it('result rounds to 2 decimal places', () => {
    const result = CapitalCallService.computeInterest(100_000, 1, 0.09)
    // 100000 × 0.09 × (1/365) = 24.657... → 24.66
    expect(result).toBe(24.66)
  })

  it('1-day overdue → small positive interest amount', () => {
    const result = CapitalCallService.computeInterest(1_000_000, 1, 0.09)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(300) // sanity check
  })

  it('365-day overdue → full year interest', () => {
    const gap    = 100_000
    const rate   = 0.09
    const result = CapitalCallService.computeInterest(gap, 365, rate)
    expect(result).toBeCloseTo(gap * rate, 1) // ≈ 9000
  })

  it('higher rate yields proportionally higher interest', () => {
    const low  = CapitalCallService.computeInterest(100_000, 90, 0.09)
    const high = CapitalCallService.computeInterest(100_000, 90, 0.18)
    expect(high).toBeCloseTo(low * 2, 1)
  })

  it('doubling the gap doubles the interest', () => {
    const base   = CapitalCallService.computeInterest(100_000, 90, 0.09)
    const double = CapitalCallService.computeInterest(200_000, 90, 0.09)
    expect(double).toBeCloseTo(base * 2, 1)
  })

  it('doubling the days doubles the interest', () => {
    const base   = CapitalCallService.computeInterest(100_000, 90, 0.09)
    const double = CapitalCallService.computeInterest(100_000, 180, 0.09)
    expect(double).toBeCloseTo(base * 2, 1)
  })

  it('custom rate 25% (high-inflation Turkish scenario)', () => {
    const result = CapitalCallService.computeInterest(500_000, 365, 0.25)
    expect(result).toBeCloseTo(125_000, 0)
  })

  it('custom rate 50% (TCMB crisis rate scenario)', () => {
    const result = CapitalCallService.computeInterest(1_000_000, 365, 0.50)
    expect(result).toBeCloseTo(500_000, 0)
  })
})

// ── 4. getReport: empty data ──────────────────────────────────────────────────

describe('CapitalCallService.getReport — empty data', () => {
  it('no commitments → empty report with all zeros', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase([]) as any)
    expect(report.partners).toHaveLength(0)
    expect(report.total_committed_try).toBe(0)
    expect(report.total_paid_try).toBe(0)
    expect(report.total_equity_gap_try).toBe(0)
    expect(report.total_ttk_588_interest_try).toBe(0)
    expect(report.overdue_partners).toBe(0)
  })

  it('empty report contains computed_at timestamp', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase([]) as any)
    expect(report.computed_at).toBeTruthy()
    expect(typeof report.computed_at).toBe('string')
  })
})

// ── 5. getReport: supabase error ──────────────────────────────────────────────

describe('CapitalCallService.getReport — error handling', () => {
  it('throws when supabase returns an error', async () => {
    await expect(
      CapitalCallService.getReport('co1', makeSupabaseError('DB connection failed') as any)
    ).rejects.toThrow('DB connection failed')
  })
})

// ── 6. Fully paid commitment ──────────────────────────────────────────────────

describe('fully paid commitment', () => {
  it('paid in full → equity_gap = 0, no TTK 588 interest', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners).toHaveLength(1)
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(0)
    expect(partner.ttk_588_applies).toBe(false)
    expect(partner.ttk_588_interest_try).toBe(0)
    expect(partner.status).toBe('paid')
  })

  it('fully paid → is_overdue = false regardless of call_date in past', async () => {
    const commitment = makeCommitment({ paid_amount_try: 100_000, call_date: '2026-01-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(false)
  })

  it('fully paid → days_overdue = null', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].days_overdue).toBeNull()
  })

  it('fully paid → overdue_partners count = 0', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.overdue_partners).toBe(0)
  })
})

// ── 7. Partial payment ────────────────────────────────────────────────────────

describe('partial payment', () => {
  it('partial payment → equity_gap = committed - paid', async () => {
    const commitment = makeCommitment({ paid_amount_try: 60_000 })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(40_000)
    expect(partner.total_paid_try).toBe(60_000)
    expect(partner.total_committed_try).toBe(100_000)
  })

  it('zero payment → equity_gap equals total committed', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(100_000)
  })

  it('1 TRY paid → equity_gap = committed - 1', async () => {
    const commitment = makeCommitment({ paid_amount_try: 1, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(99_999)
  })
})

// ── 8. Overdue detection ──────────────────────────────────────────────────────

describe('overdue detection', () => {
  it('call_date in past with unpaid gap → is_overdue = true', async () => {
    const commitment = makeCommitment({
      paid_amount_try: 0,
      call_date:       '2026-03-01',
    })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.is_overdue).toBe(true)
    expect(partner.days_overdue).toBeGreaterThan(0)
  })

  it('call_date = today → NOT overdue (boundary: today is not past)', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-05-27' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(false)
  })

  it('call_date = tomorrow → NOT overdue', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-05-28' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(false)
  })

  it('call_date = yesterday → overdue', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-05-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(true)
  })
})

// ── 9. days_overdue calculation ───────────────────────────────────────────────

describe('days_overdue calculation', () => {
  it('call_date 90 days ago → days_overdue = 90', async () => {
    // call_date = 2026-02-26 → 90 days before 2026-05-27
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-02-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.days_overdue).toBe(90)
  })

  it('days_overdue = null when not overdue', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2027-01-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].days_overdue).toBeNull()
  })

  it('1 day overdue → days_overdue = 1', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-05-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].days_overdue).toBe(1)
  })
})

// ── 10. TTK 588 applicability ─────────────────────────────────────────────────

describe('TTK 588 applicability', () => {
  it('gap > 0 but no call_date → TTK 588 does not apply', async () => {
    const commitment = makeCommitment({ paid_amount_try: 50_000, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.equity_gap_try).toBe(50_000)
    expect(partner.is_overdue).toBe(false)
    expect(partner.ttk_588_applies).toBe(false)
    expect(partner.ttk_588_interest_try).toBe(0)
  })

  it('call_date in future → TTK 588 does not apply', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2027-01-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.is_overdue).toBe(false)
    expect(partner.ttk_588_applies).toBe(false)
  })

  it('fully paid + past call_date → TTK 588 does not apply (gap = 0)', async () => {
    const commitment = makeCommitment({ paid_amount_try: 100_000, call_date: '2026-01-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].ttk_588_applies).toBe(false)
    expect(report.partners[0].ttk_588_interest_try).toBe(0)
  })

  it('overdue with gap > 0 AND days > 0 → TTK 588 applies', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-02-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].ttk_588_applies).toBe(true)
    expect(report.partners[0].ttk_588_interest_try).toBeGreaterThan(0)
  })

  it('TTK 588 interest uses default rate (9%) when not specified', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-02-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].ttk_588_interest_rate).toBe(DEFAULT_TTK588_RATE)
  })

  it('custom TTK 588 rate is applied when provided', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-02-26' })
    const defaultReport = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const customReport  = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27', ttk588Rate: 0.18 })
    expect(customReport.partners[0].ttk_588_interest_try).toBeGreaterThan(
      defaultReport.partners[0].ttk_588_interest_try
    )
  })
})

// ── 11. Status classification ─────────────────────────────────────────────────

describe('status classification', () => {
  it('overdue with gap → status overdue_with_interest', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('overdue_with_interest')
  })

  it('fully paid → status paid', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('paid')
  })

  it('equity_gap = 0 → partner.status = paid regardless of call_date', async () => {
    const commitment = makeCommitment({ paid_amount_try: 100_000, call_date: '2026-01-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(0)
    expect(report.partners[0].status).toBe('paid')
  })

  it('due within 30 days → status due_soon', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-06-10' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('due_soon')
  })

  it('due in 31 days → status current', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-06-27' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('current')
  })

  it('no call_date, gap > 0 → status current', async () => {
    const commitment = makeCommitment({ paid_amount_try: 50_000, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('current')
  })
})

// ── 12. Report totals ─────────────────────────────────────────────────────────

describe('report totals', () => {
  it('total_equity_gap_try = sum of per-partner gaps', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', committed_amount_try: 100_000, paid_amount_try: 60_000, partners: { name: 'Ali',  share_ratio: 0.6 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', committed_amount_try: 50_000, paid_amount_try: 20_000, call_date: null, partners: { name: 'Veli', share_ratio: 0.4 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.total_equity_gap_try).toBe(70_000)
    expect(report.total_committed_try).toBe(150_000)
    expect(report.total_paid_try).toBe(80_000)
  })

  it('total_committed_try sums across all partners', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', committed_amount_try: 200_000, paid_amount_try: 200_000, partners: { name: 'A', share_ratio: 0.5 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', committed_amount_try: 300_000, paid_amount_try: 300_000, call_date: null, partners: { name: 'B', share_ratio: 0.5 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.total_committed_try).toBe(500_000)
    expect(report.total_equity_gap_try).toBe(0)
  })

  it('total_ttk_588_interest_try sums overdue partner interests', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', committed_amount_try: 100_000, paid_amount_try: 0, call_date: '2026-02-26', partners: { name: 'A', share_ratio: 0.5 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', committed_amount_try: 100_000, paid_amount_try: 100_000, call_date: '2026-02-26', partners: { name: 'B', share_ratio: 0.5 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    // Only p1 should have interest (p2 is fully paid)
    expect(report.total_ttk_588_interest_try).toBeGreaterThan(0)
    const p1 = report.partners.find(p => p.partner_id === 'p1')
    expect(report.total_ttk_588_interest_try).toBeCloseTo(p1!.ttk_588_interest_try, 2)
  })

  it('overdue_partners count reflects only truly overdue partners', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', paid_amount_try: 0,       call_date: '2026-03-01', partners: { name: 'A', share_ratio: 0.4 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', paid_amount_try: 100_000, call_date: '2026-03-01', partners: { name: 'B', share_ratio: 0.3 } }),
      makeCommitment({ id: 'c3', partner_id: 'p3', paid_amount_try: 0,       call_date: '2027-01-01', partners: { name: 'C', share_ratio: 0.3 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.overdue_partners).toBe(1) // only p1
  })
})

// ── 13. Multi-commitment grouping by partner ──────────────────────────────────

describe('multi-commitment aggregation per partner', () => {
  it('two commitments for same partner → single summary with summed amounts', async () => {
    const rows = [
      makeCommitment({ id: 'c1', partner_id: 'p1', committed_amount_try: 50_000, paid_amount_try: 50_000, call_date: '2026-01-01', partners: { name: 'Ali', share_ratio: 0.6 } }),
      makeCommitment({ id: 'c2', partner_id: 'p1', committed_amount_try: 50_000, paid_amount_try: 30_000, call_date: '2026-03-01', partners: { name: 'Ali', share_ratio: 0.6 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.partners).toHaveLength(1)
    const partner = report.partners[0]
    expect(partner.total_committed_try).toBe(100_000)
    expect(partner.total_paid_try).toBe(80_000)
    expect(partner.equity_gap_try).toBe(20_000)
  })

  it('earliest unpaid call_date is used for overdue detection', async () => {
    const rows = [
      makeCommitment({ id: 'c1', partner_id: 'p1', committed_amount_try: 50_000, paid_amount_try: 0, call_date: '2026-06-01', partners: { name: 'Ali', share_ratio: 0.6 } }),
      makeCommitment({ id: 'c2', partner_id: 'p1', committed_amount_try: 50_000, paid_amount_try: 0, call_date: '2026-03-01', partners: { name: 'Ali', share_ratio: 0.6 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    // call_date used = 2026-03-01 (earliest) → overdue
    expect(report.partners[0].is_overdue).toBe(true)
    expect(report.partners[0].call_date).toBe('2026-03-01')
  })
})

// ── 14. Sort order ────────────────────────────────────────────────────────────

describe('partner sort order', () => {
  it('overdue partners appear before non-overdue', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', paid_amount_try: 0, call_date: '2027-01-01', partners: { name: 'Current', share_ratio: 0.5 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', paid_amount_try: 0, call_date: '2026-03-01', partners: { name: 'Overdue', share_ratio: 0.5 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(true)
    expect(report.partners[0].partner_name).toBe('Overdue')
  })

  it('among non-overdue, higher equity gap first', async () => {
    const rows = [
      makeCommitment({ partner_id: 'p1', committed_amount_try: 50_000, paid_amount_try: 0, call_date: null, partners: { name: 'Small', share_ratio: 0.3 } }),
      makeCommitment({ id: 'c2', partner_id: 'p2', committed_amount_try: 200_000, paid_amount_try: 0, call_date: null, partners: { name: 'Large', share_ratio: 0.7 } }),
    ]
    const report = await CapitalCallService.getReport('co1', makeSupabase(rows) as any, { today: '2026-05-27' })
    expect(report.partners[0].partner_name).toBe('Large')
  })
})

// ── 15. Share ratio computation ───────────────────────────────────────────────

describe('share ratio computation', () => {
  it('share_ratio 0.6 → share_ratio_pct = 60', async () => {
    const commitment = makeCommitment({ partners: { name: 'Ali', share_ratio: 0.6 } })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].share_ratio_pct).toBe(60)
  })

  it('share_ratio 1.0 → share_ratio_pct = 100', async () => {
    const commitment = makeCommitment({ partners: { name: 'Sole', share_ratio: 1.0 } })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].share_ratio_pct).toBe(100)
  })

  it('share_ratio 0 → share_ratio_pct = 0', async () => {
    const commitment = makeCommitment({ partners: { name: 'Zero', share_ratio: 0 } })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].share_ratio_pct).toBe(0)
  })
})

// ── 16. Turkish compliance scenarios ─────────────────────────────────────────

describe('Turkish TTK 588 compliance scenarios', () => {
  it('60-day overdue gap: interest accumulates at default 9% rate', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-28' }) // 60 days before 2026-05-27
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    const expected = CapitalCallService.computeInterest(100_000, 60, DEFAULT_TTK588_RATE)
    expect(partner.ttk_588_interest_try).toBeCloseTo(expected, 2)
  })

  it('1-year overdue gap: significant interest burden', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2025-05-27' }) // ~365 days
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner.ttk_588_interest_try).toBeGreaterThan(8_000) // ~9% of 100k
  })

  it('large gap (1M TRY) 90-day overdue: TTK 588 interest ≈ 22k', async () => {
    const commitment = makeCommitment({
      committed_amount_try: 1_000_000,
      paid_amount_try:      0,
      call_date:            '2026-02-26', // 90 days
    })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const expected = CapitalCallService.computeInterest(1_000_000, 90, DEFAULT_TTK588_RATE)
    expect(report.partners[0].ttk_588_interest_try).toBeCloseTo(expected, 1)
  })

  it('partner name defaults to "Bilinmeyen" when partners.name is missing', async () => {
    const commitment = makeCommitment({ partners: { name: undefined, share_ratio: 0.5 } })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].partner_name).toBe('Bilinmeyen')
  })
})

// ── 17. Boundary values ───────────────────────────────────────────────────────

describe('boundary values', () => {
  it('committed = 0.01 TRY (minimum monetary unit) → handled without error', async () => {
    const commitment = makeCommitment({ committed_amount_try: 0.01, paid_amount_try: 0, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBeCloseTo(0.01, 2)
  })

  it('very large commitment (100M TRY) → handled without overflow', async () => {
    const commitment = makeCommitment({ committed_amount_try: 100_000_000, paid_amount_try: 0, call_date: null })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(100_000_000)
  })

  it('paid > committed → equity gap is negative (overpayment: committed - paid < 0)', async () => {
    // The service computes round2(committed - paid) without clamping
    const commitment = makeCommitment({ committed_amount_try: 100_000, paid_amount_try: 120_000 })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].equity_gap_try).toBe(-20_000)
    // Despite negative gap, TTK 588 does not apply (computeInterest guards equity_gap <= 0)
    expect(report.partners[0].ttk_588_interest_try).toBe(0)
  })
})

// ── 18. computeInterest: extended formula accuracy ────────────────────────────

describe('computeInterest — extended accuracy tests', () => {
  it('30-day overdue at 9%: 100k × 0.09 × (30/365) ≈ 739.73', () => {
    const result = CapitalCallService.computeInterest(100_000, 30, 0.09)
    expect(result).toBeCloseTo(739.73, 1)
  })

  it('60-day overdue at 9%: 100k × 0.09 × (60/365) ≈ 1479.45', () => {
    const result = CapitalCallService.computeInterest(100_000, 60, 0.09)
    expect(result).toBeCloseTo(1_479.45, 1)
  })

  it('120-day overdue at 9%: 100k × 0.09 × (120/365) ≈ 2958.90', () => {
    const result = CapitalCallService.computeInterest(100_000, 120, 0.09)
    expect(result).toBeCloseTo(2_958.90, 1)
  })

  it('180-day overdue at 9%: 100k × 0.09 × (180/365) ≈ 4438.36', () => {
    const result = CapitalCallService.computeInterest(100_000, 180, 0.09)
    expect(result).toBeCloseTo(4_438.36, 1)
  })

  it('365-day overdue at 9%: 100k × 0.09 × 1 = 9000', () => {
    const result = CapitalCallService.computeInterest(100_000, 365, 0.09)
    expect(result).toBeCloseTo(9_000, 1)
  })

  it('730-day overdue at 9%: 100k × 0.09 × 2 = 18000', () => {
    const result = CapitalCallService.computeInterest(100_000, 730, 0.09)
    expect(result).toBeCloseTo(18_000, 1)
  })

  it('500k gap, 60 days, 12%: 500k × 0.12 × (60/365) ≈ 9863.01', () => {
    const result = CapitalCallService.computeInterest(500_000, 60, 0.12)
    expect(result).toBeCloseTo(9_863.01, 1)
  })

  it('1M gap, 90 days, 25% (high-inflation scenario): ≈ 61,643.84', () => {
    const result = CapitalCallService.computeInterest(1_000_000, 90, 0.25)
    expect(result).toBeCloseTo(61_643.84, 1)
  })

  it('result is always non-negative', () => {
    for (const [gap, days, rate] of [[0, 90, 0.09], [100_000, 0, 0.09], [100_000, 90, 0.09]]) {
      expect(CapitalCallService.computeInterest(gap as number, days as number, rate as number)).toBeGreaterThanOrEqual(0)
    }
  })

  it('interest linearly scales with rate', () => {
    const r1 = CapitalCallService.computeInterest(100_000, 90, 0.05)
    const r2 = CapitalCallService.computeInterest(100_000, 90, 0.10)
    const r3 = CapitalCallService.computeInterest(100_000, 90, 0.20)
    expect(r2 / r1).toBeCloseTo(2, 1)
    expect(r3 / r1).toBeCloseTo(4, 1)
  })
})

// ── 19. getReport: three-partner scenarios ────────────────────────────────────

describe('three-partner scenarios', () => {
  function makeThreePartnerRows() {
    return [
      makeCommitment({
        id: 'c1', partner_id: 'p1',
        committed_amount_try: 300_000, paid_amount_try: 300_000,
        call_date: '2026-01-01',
        partners: { name: 'Ahmet', share_ratio: 0.5 },
      }),
      makeCommitment({
        id: 'c2', partner_id: 'p2',
        committed_amount_try: 200_000, paid_amount_try: 100_000,
        call_date: '2026-04-01',
        partners: { name: 'Mehmet', share_ratio: 0.3 },
      }),
      makeCommitment({
        id: 'c3', partner_id: 'p3',
        committed_amount_try: 100_000, paid_amount_try: 0,
        call_date: '2027-01-01',
        partners: { name: 'Ayşe', share_ratio: 0.2 },
      }),
    ]
  }

  it('three partners → three summaries', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    expect(report.partners).toHaveLength(3)
  })

  it('fully paid partner has status paid', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    const ahmet = report.partners.find(p => p.partner_name === 'Ahmet')
    expect(ahmet?.status).toBe('paid')
  })

  it('overdue partner has status overdue_with_interest', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    const mehmet = report.partners.find(p => p.partner_name === 'Mehmet')
    expect(mehmet?.status).toBe('overdue_with_interest')
  })

  it('future call_date partner has status current', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    const ayse = report.partners.find(p => p.partner_name === 'Ayşe')
    expect(ayse?.status).toBe('current')
  })

  it('total_committed_try = 600k', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    expect(report.total_committed_try).toBe(600_000)
  })

  it('total_paid_try = 400k', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    expect(report.total_paid_try).toBe(400_000)
  })

  it('overdue_partners = 1 (only Mehmet)', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    expect(report.overdue_partners).toBe(1)
  })

  it('overdue partner is listed first in sorted output', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase(makeThreePartnerRows()) as any, { today: '2026-05-27' })
    expect(report.partners[0].is_overdue).toBe(true)
  })
})

// ── 20. getReport: today option ───────────────────────────────────────────────

describe('today option controls overdue detection', () => {
  it('future today date: call_date 2026-03-01 appears non-overdue if today = 2026-02-28', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-02-28' })
    expect(report.partners[0].is_overdue).toBe(false)
  })

  it('past today date: call_date 2026-03-01 overdue when today = 2026-04-01', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-04-01' })
    expect(report.partners[0].is_overdue).toBe(true)
    expect(report.partners[0].days_overdue).toBe(31)
  })
})

// ── 21. Status 'due_soon' boundary precision ──────────────────────────────────

describe('due_soon boundary precision', () => {
  it('call_date exactly 30 days away → due_soon', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-06-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('due_soon')
  })

  it('call_date 29 days away → due_soon', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-06-25' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('due_soon')
  })

  it('call_date 1 day away → due_soon', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-05-28' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('due_soon')
  })

  it('call_date 31 days away → current (not due_soon)', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-06-27' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('current')
  })

  it('call_date 60 days away → current', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-07-26' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners[0].status).toBe('current')
  })
})

// ── 22. computeInterest: all-statuses TTK 588 consistency ────────────────────

describe('TTK 588 interest calculation consistency', () => {
  it('interest increases monotonically with days overdue', () => {
    const results = [1, 10, 30, 90, 180, 365].map(days =>
      CapitalCallService.computeInterest(100_000, days, 0.09)
    )
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]).toBeLessThan(results[i + 1])
    }
  })

  it('interest increases monotonically with equity gap', () => {
    const results = [10_000, 50_000, 100_000, 500_000, 1_000_000].map(gap =>
      CapitalCallService.computeInterest(gap, 90, 0.09)
    )
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]).toBeLessThan(results[i + 1])
    }
  })

  it('interest increases monotonically with rate', () => {
    const results = [0.01, 0.05, 0.09, 0.15, 0.25, 0.50].map(rate =>
      CapitalCallService.computeInterest(100_000, 90, rate)
    )
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i]).toBeLessThan(results[i + 1])
    }
  })

  it('interest = 0 for all cases where gap <= 0', () => {
    expect(CapitalCallService.computeInterest(-1, 365, 0.09)).toBe(0)
    expect(CapitalCallService.computeInterest(0, 365, 0.09)).toBe(0)
  })

  it('interest = 0 for all cases where days <= 0', () => {
    expect(CapitalCallService.computeInterest(100_000, 0, 0.09)).toBe(0)
    expect(CapitalCallService.computeInterest(100_000, -1, 0.09)).toBe(0)
  })
})

// ── 23. getReport: computed_at and metadata ───────────────────────────────────

describe('getReport metadata', () => {
  it('computed_at is an ISO datetime string', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.computed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  })

  it('single partner report has correct count in partners array', async () => {
    const commitment = makeCommitment()
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    expect(report.partners.length).toBe(1)
  })

  it('partner summary includes all required fields', async () => {
    const commitment = makeCommitment({ paid_amount_try: 0, call_date: '2026-03-01' })
    const report = await CapitalCallService.getReport('co1', makeSupabase([commitment]) as any, { today: '2026-05-27' })
    const partner = report.partners[0]
    expect(partner).toHaveProperty('partner_id')
    expect(partner).toHaveProperty('partner_name')
    expect(partner).toHaveProperty('share_ratio_pct')
    expect(partner).toHaveProperty('total_committed_try')
    expect(partner).toHaveProperty('total_paid_try')
    expect(partner).toHaveProperty('equity_gap_try')
    expect(partner).toHaveProperty('call_date')
    expect(partner).toHaveProperty('is_overdue')
    expect(partner).toHaveProperty('days_overdue')
    expect(partner).toHaveProperty('ttk_588_applies')
    expect(partner).toHaveProperty('ttk_588_interest_rate')
    expect(partner).toHaveProperty('ttk_588_interest_try')
    expect(partner).toHaveProperty('status')
  })

  it('report includes all top-level fields', async () => {
    const report = await CapitalCallService.getReport('co1', makeSupabase([]) as any)
    expect(report).toHaveProperty('partners')
    expect(report).toHaveProperty('total_committed_try')
    expect(report).toHaveProperty('total_paid_try')
    expect(report).toHaveProperty('total_equity_gap_try')
    expect(report).toHaveProperty('total_ttk_588_interest_try')
    expect(report).toHaveProperty('overdue_partners')
    expect(report).toHaveProperty('computed_at')
  })
})

// ── 24. computeInterest: zero-rate and edge values ────────────────────────────

describe('computeInterest — zero-rate edge cases', () => {
  it('zero rate → zero interest regardless of days and gap', () => {
    expect(CapitalCallService.computeInterest(100_000, 365, 0)).toBe(0)
  })

  it('gap = 1 TRY, 1 day, 9% → very small but positive interest', () => {
    const result = CapitalCallService.computeInterest(1, 1, 0.09)
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('very large gap (10M TRY) 90 days 9%', () => {
    const result = CapitalCallService.computeInterest(10_000_000, 90, 0.09)
    expect(result).toBeCloseTo(221_917.81, 0)
  })

  it('result is a finite number', () => {
    const result = CapitalCallService.computeInterest(100_000, 90, 0.09)
    expect(isFinite(result)).toBe(true)
  })
})
