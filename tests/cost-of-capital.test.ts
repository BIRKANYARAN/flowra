/**
 * Partner Loan Cost of Capital — unit tests
 *
 * Tests pure computation logic of CostOfCapitalService.
 * All tests use in-memory mock supabase — no DB or network calls.
 */

import { describe, it, expect } from 'vitest'
import { CostOfCapitalService } from '../lib/services/pcle/cost-of-capital.service'

// ── Minimal mock supabase builder ─────────────────────────────────────────────

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
    for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single', 'not']) {
      chain[m] = () => chain
    }
    return chain
  }
  return { from: (table: string) => buildChain(tables[table] ?? []) }
}

const CID = 'test-company'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CostOfCapitalService.computeWACD — pure', () => {

  // Test 1: Equal weights → simple average
  it('1. equal outstanding loans: WACD = simple average of rates', () => {
    const wacd = CostOfCapitalService.computeWACD([
      { outstanding_try: 100, annual_interest_rate: 0.10 },
      { outstanding_try: 100, annual_interest_rate: 0.20 },
    ])
    expect(wacd).toBeCloseTo(0.15, 4)
  })

  // Test 2: Unequal weights
  it('2. larger loan has more influence on WACD', () => {
    const wacd = CostOfCapitalService.computeWACD([
      { outstanding_try: 900, annual_interest_rate: 0.10 },
      { outstanding_try: 100, annual_interest_rate: 0.20 },
    ])
    // WACD = (900×0.10 + 100×0.20) / 1000 = 110/1000 = 0.11
    expect(wacd).toBeCloseTo(0.11, 4)
    expect(wacd).toBeLessThan(0.15)  // closer to 0.10 (the larger loan)
  })

  // Test 3: annual_interest_try = outstanding × rate
  it('3. annual_interest_try = outstanding × annual_interest_rate', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 100_000, annual_interest_rate: 0.12 },
      ],
      partners: [{ id: 'p1', name: 'Ortak A' }],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never, { today: '2025-06-15' })
    const p = report.partners.find(x => x.partner_id === 'p1')
    expect(p).toBeDefined()
    expect(p!.annual_interest_try).toBeCloseTo(100_000 * 0.12, 2)
  })

  // Test 4: monthly_interest_try = annual / 12
  it('4. monthly_interest_try = annual_interest_try / 12', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 120_000, annual_interest_rate: 0.18 },
      ],
      partners: [{ id: 'p1', name: 'Ortak A' }],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never, { today: '2025-06-15' })
    const p = report.partners[0]
    expect(p.monthly_interest_try).toBeCloseTo(p.annual_interest_try / 12, 2)
  })

  // Test 5: Zero rate loan → is_zero_rate = true
  it('5. 0% rate loan → is_zero_rate = true', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 50_000, annual_interest_rate: 0 },
      ],
      partners: [{ id: 'p1', name: 'Ortak A' }],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never)
    expect(report.partners[0].is_zero_rate).toBe(true)
    expect(report.zero_rate_loan_count).toBe(1)
    expect(report.zero_rate_amount_try).toBeCloseTo(50_000, 2)
  })

  // Test 6: Rate > 0.20 → is_high_rate = true
  it('6. rate > 0.20 → is_high_rate = true', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 75_000, annual_interest_rate: 0.25 },
      ],
      partners: [{ id: 'p1', name: 'Ortak A' }],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never)
    expect(report.partners[0].is_high_rate).toBe(true)
  })

  // Test 7: WACD = 0 when all rates are 0
  it('7. wacd_pct = 0 when all loans have 0% rate', () => {
    const wacd = CostOfCapitalService.computeWACD([
      { outstanding_try: 100_000, annual_interest_rate: 0 },
      { outstanding_try: 200_000, annual_interest_rate: 0 },
    ])
    expect(wacd).toBe(0)
  })

  // Test 8: total_annual_interest_try = sum of partner annual interest
  it('8. total_annual_interest_try = sum of all partner annual_interest_try', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 100_000, annual_interest_rate: 0.10 },
        { partner_id: 'p2', outstanding_try: 200_000, annual_interest_rate: 0.15 },
      ],
      partners: [
        { id: 'p1', name: 'Ortak A' },
        { id: 'p2', name: 'Ortak B' },
      ],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never, { today: '2025-06-15' })
    const expectedTotal = report.partners.reduce((s, p) => s + p.annual_interest_try, 0)
    expect(report.total_annual_interest_try).toBeCloseTo(expectedTotal, 2)
    // 100k×0.10 + 200k×0.15 = 10_000 + 30_000 = 40_000
    expect(report.total_annual_interest_try).toBeCloseTo(40_000, 2)
  })

  // Test 9: WACD with empty loans → 0
  it('9. computeWACD with empty array → 0', () => {
    expect(CostOfCapitalService.computeWACD([])).toBe(0)
  })

  // Test 10: share_of_total_debt_pct sums to 100
  it('10. share_of_total_debt_pct across partners sums to 100', async () => {
    const supabase = makeSupabase({
      partner_loan_tranches: [
        { partner_id: 'p1', outstanding_try: 300_000, annual_interest_rate: 0.12 },
        { partner_id: 'p2', outstanding_try: 700_000, annual_interest_rate: 0.15 },
      ],
      partners: [
        { id: 'p1', name: 'Ortak A' },
        { id: 'p2', name: 'Ortak B' },
      ],
    })

    const report = await CostOfCapitalService.getReport(CID, supabase as never)
    const totalShare = report.partners.reduce((s, p) => s + p.share_of_total_debt_pct, 0)
    expect(totalShare).toBeCloseTo(100, 1)
  })
})
