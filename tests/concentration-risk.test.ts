/**
 * Tests for lib/services/commercial/concentration-risk.service.ts
 *
 * All pure-function tests run without any DB calls.
 * The getReport integration test uses a mock Supabase client.
 *
 * Run with: npx vitest run tests/concentration-risk.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  ConcentrationRiskService,
} from '../lib/services/commercial/concentration-risk.service'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Mock Supabase helpers ─────────────────────────────────────────────────────

interface MockSaleRow {
  customer_name: string | null
  total_try: number | null
}

function makeMockSupabase(rows: MockSaleRow[], error?: string) {
  const queryObj = {
    _rows: rows,
    eq(_col: string, _val: unknown) { return this },
    is(_col: string, _val: unknown) { return this },
    gte(_col: string, _val: unknown) { return this },
    lte(_col: string, _val: unknown) { return this },
    then(resolve: (v: { data: MockSaleRow[] | null; error: { message: string } | null }) => unknown) {
      if (error) {
        return Promise.resolve({ data: null, error: { message: error } }).then(resolve)
      }
      return Promise.resolve({ data: this._rows, error: null }).then(resolve)
    },
  }
  return {
    from(_table: string) {
      return {
        select(_cols: string) { return queryObj },
      }
    },
  } as unknown as SupabaseClient
}

// ── computeHHI ────────────────────────────────────────────────────────────────

describe('ConcentrationRiskService.computeHHI', () => {
  it('perfect monopoly — one customer with 100% share = 1.0', () => {
    expect(ConcentrationRiskService.computeHHI([1.0])).toBeCloseTo(1.0)
  })

  it('duopoly — two equal customers each 50% = 0.50', () => {
    expect(ConcentrationRiskService.computeHHI([0.5, 0.5])).toBeCloseTo(0.5)
  })

  it('equal 4-way split — four customers at 25% each = 0.25', () => {
    expect(ConcentrationRiskService.computeHHI([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.25)
  })

  it('empty array → 0', () => {
    expect(ConcentrationRiskService.computeHHI([])).toBe(0)
  })

  it('single share of 0.5 → 0.25', () => {
    expect(ConcentrationRiskService.computeHHI([0.5])).toBeCloseTo(0.25)
  })

  it('three equal shares of 1/3 each → ~0.333', () => {
    const share = 1 / 3
    expect(ConcentrationRiskService.computeHHI([share, share, share])).toBeCloseTo(0.333, 2)
  })

  it('all zeros → 0', () => {
    expect(ConcentrationRiskService.computeHHI([0, 0, 0])).toBe(0)
  })

  it('skewed: one large + many small — HHI driven by large share', () => {
    // 0.9² + 0.1² = 0.81 + 0.01 = 0.82
    const hhi = ConcentrationRiskService.computeHHI([0.9, 0.1])
    expect(hhi).toBeCloseTo(0.82, 2)
  })

  it('five equal shares at 0.2 each → HHI = 0.2', () => {
    expect(ConcentrationRiskService.computeHHI([0.2, 0.2, 0.2, 0.2, 0.2])).toBeCloseTo(0.2)
  })

  it('single share 0 → 0', () => {
    expect(ConcentrationRiskService.computeHHI([0])).toBe(0)
  })

  it('returns a number between 0 and 1 for valid fractional shares', () => {
    const hhi = ConcentrationRiskService.computeHHI([0.6, 0.3, 0.1])
    expect(hhi).toBeGreaterThanOrEqual(0)
    expect(hhi).toBeLessThanOrEqual(1)
  })
})

// ── getHhhStatus ──────────────────────────────────────────────────────────────

describe('ConcentrationRiskService.getHhhStatus', () => {
  it('0.10 → low', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.10)).toBe('low')
  })

  it('0.20 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.20)).toBe('moderate')
  })

  it('0.30 → high', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.30)).toBe('high')
  })

  it('exact boundary 0.15 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.15)).toBe('moderate')
  })

  it('exact boundary 0.25 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.25)).toBe('moderate')
  })

  it('0 → low (empty market)', () => {
    expect(ConcentrationRiskService.getHhhStatus(0)).toBe('low')
  })

  it('1.0 → high (pure monopoly)', () => {
    expect(ConcentrationRiskService.getHhhStatus(1.0)).toBe('high')
  })

  it('0.1499 → low (just below moderate boundary)', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.1499)).toBe('low')
  })

  it('0.2501 → high (just above moderate upper boundary)', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.2501)).toBe('high')
  })

  it('0.14 → low', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.14)).toBe('low')
  })

  it('0.17 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.17)).toBe('moderate')
  })
})

// ── getRiskLabel ──────────────────────────────────────────────────────────────

describe('ConcentrationRiskService.getRiskLabel', () => {
  it('45% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(45)).toBe('dominant')
  })

  it('30% → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(30)).toBe('major')
  })

  it('15% → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(15)).toBe('significant')
  })

  it('5% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(5)).toBe('minor')
  })

  it('100% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(100)).toBe('dominant')
  })

  it('0% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(0)).toBe('minor')
  })

  it('exactly 40% → major (not dominant — must be >40)', () => {
    expect(ConcentrationRiskService.getRiskLabel(40)).toBe('major')
  })

  it('40.1% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(40.1)).toBe('dominant')
  })

  it('exactly 20% → significant (not major — must be >20)', () => {
    expect(ConcentrationRiskService.getRiskLabel(20)).toBe('significant')
  })

  it('20.1% → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(20.1)).toBe('major')
  })

  it('exactly 10% → minor (not significant — must be >10)', () => {
    expect(ConcentrationRiskService.getRiskLabel(10)).toBe('minor')
  })

  it('10.1% → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(10.1)).toBe('significant')
  })

  it('9.9% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(9.9)).toBe('minor')
  })
})

// ── getReport integration tests ───────────────────────────────────────────────

describe('ConcentrationRiskService.getReport', () => {
  const period = { from: '2025-01-01', to: '2025-12-31' }

  it('top_3_share_pct equals sum of top 3 customers revenue shares', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 400 }, // 40%
      { customer_name: 'B', total_try: 300 }, // 30%
      { customer_name: 'C', total_try: 200 }, // 20%
      { customer_name: 'D', total_try: 100 }, // 10%
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)

    // top 3 = A+B+C = 90%
    expect(report.top_3_share_pct).toBeCloseTo(90, 0)
    expect(report.customer_count).toBe(4)
    expect(report.total_revenue_try).toBe(1000)
  })

  it('customers sorted descending by revenue share', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'Small', total_try: 100 },
      { customer_name: 'Big',   total_try: 900 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.customers[0].customer_name).toBe('Big')
    expect(report.customers[1].customer_name).toBe('Small')
  })

  it('has_dominant_customer true when top customer > 40%', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'Dominant', total_try: 600 },
      { customer_name: 'Other',    total_try: 400 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.has_dominant_customer).toBe(true)
    expect(report.top_customer_name).toBe('Dominant')
  })

  it('has_dominant_customer false when top customer <= 40%', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 300 },
      { customer_name: 'B', total_try: 300 },
      { customer_name: 'C', total_try: 400 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.has_dominant_customer).toBe(false)
  })

  it('empty sales → zeroed report with null top customer', async () => {
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase([]), period)
    expect(report.customer_count).toBe(0)
    expect(report.total_revenue_try).toBe(0)
    expect(report.hhi).toBe(0)
    expect(report.top_customer_name).toBeNull()
    expect(report.has_dominant_customer).toBe(false)
  })

  it('single customer → HHI = 1.0 → high status', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'Solo', total_try: 1000 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.hhi_status).toBe('high')
    expect(report.customer_count).toBe(1)
    expect(report.top_customer_share_pct).toBeCloseTo(100)
    expect(report.has_dominant_customer).toBe(true)
  })

  it('two equal customers → hhi ~0.5 → high status', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 500 },
      { customer_name: 'B', total_try: 500 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.hhi).toBeCloseTo(0.5, 1)
    expect(report.hhi_status).toBe('high')
  })

  it('null customer_name rows grouped as Bilinmiyor', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: null, total_try: 200 },
      { customer_name: null, total_try: 300 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.customer_count).toBe(1)
    expect(report.customers[0].customer_name).toBe('Bilinmiyor')
    expect(report.customers[0].revenue_try).toBe(500)
  })

  it('null total_try rows treated as 0', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: null },
      { customer_name: 'B', total_try: 500 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.total_revenue_try).toBe(500)
  })

  it('revenue_share_pct for each customer sums to ~100', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 300 },
      { customer_name: 'B', total_try: 400 },
      { customer_name: 'C', total_try: 300 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    const total = report.customers.reduce((s, c) => s + c.revenue_share_pct, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('throws when supabase returns an error', async () => {
    await expect(
      ConcentrationRiskService.getReport('c1', makeMockSupabase([], 'DB error'), period)
    ).rejects.toThrow('ConcentrationRiskService')
  })

  it('top_customer_share_pct is 0 when no customers', async () => {
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase([]), period)
    expect(report.top_customer_share_pct).toBe(0)
  })

  it('hhi_contribution in customers equals revenue_share_pct² as fraction', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 600 },
      { customer_name: 'B', total_try: 400 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    const a = report.customers.find(c => c.customer_name === 'A')!
    const expectedHHI = (a.revenue_share_pct / 100) * (a.revenue_share_pct / 100)
    expect(a.hhi_contribution).toBeCloseTo(expectedHHI, 4)
  })

  it('period fields are returned correctly', async () => {
    const rows: MockSaleRow[] = [{ customer_name: 'X', total_try: 100 }]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.period_from).toBe('2025-01-01')
    expect(report.period_to).toBe('2025-12-31')
  })
})

// ── computeHHI — additional edge cases ───────────────────────────────────────

describe('ConcentrationRiskService.computeHHI — additional edge cases', () => {
  it('asymmetric split 0.7 + 0.3 → 0.49 + 0.09 = 0.58', () => {
    const hhi = ConcentrationRiskService.computeHHI([0.7, 0.3])
    expect(hhi).toBeCloseTo(0.58, 4)
  })

  it('ten customers at 10% each → HHI = 0.10', () => {
    const shares = Array(10).fill(0.1)
    expect(ConcentrationRiskService.computeHHI(shares)).toBeCloseTo(0.1, 4)
  })

  it('100 customers at 1% each → HHI = 0.01', () => {
    const shares = Array(100).fill(0.01)
    expect(ConcentrationRiskService.computeHHI(shares)).toBeCloseTo(0.01, 4)
  })

  it('HHI increases when distribution becomes more concentrated', () => {
    const equal4 = ConcentrationRiskService.computeHHI([0.25, 0.25, 0.25, 0.25])   // 0.25
    const skewed = ConcentrationRiskService.computeHHI([0.7, 0.1, 0.1, 0.1])       // 0.52
    expect(skewed).toBeGreaterThan(equal4)
  })

  it('HHI is always in [0, 1] range for valid shares', () => {
    const cases = [
      [1.0],
      [0.5, 0.5],
      [0.33, 0.33, 0.34],
      [0.1, 0.2, 0.3, 0.4],
    ]
    for (const shares of cases) {
      const hhi = ConcentrationRiskService.computeHHI(shares)
      expect(hhi).toBeGreaterThanOrEqual(0)
      expect(hhi).toBeLessThanOrEqual(1)
    }
  })

  it('HHI is the sum of squared shares', () => {
    const shares = [0.4, 0.35, 0.25]
    const expected = shares.reduce((sum, s) => sum + s * s, 0)
    expect(ConcentrationRiskService.computeHHI(shares)).toBeCloseTo(expected, 8)
  })

  it('single tiny share → near 0 HHI', () => {
    expect(ConcentrationRiskService.computeHHI([0.001])).toBeCloseTo(0.000001, 6)
  })

  it('HHI is symmetric — order of shares does not matter', () => {
    const hhi1 = ConcentrationRiskService.computeHHI([0.6, 0.3, 0.1])
    const hhi2 = ConcentrationRiskService.computeHHI([0.1, 0.3, 0.6])
    expect(hhi1).toBeCloseTo(hhi2, 8)
  })
})

// ── getHhhStatus — additional boundary tests ──────────────────────────────────

describe('ConcentrationRiskService.getHhhStatus — additional boundary tests', () => {
  it('threshold at exactly 0.15 is moderate (not low)', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.15)).toBe('moderate')
  })

  it('threshold at exactly 0.25 is moderate (not high)', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.25)).toBe('moderate')
  })

  it('0.149 → low', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.149)).toBe('low')
  })

  it('0.151 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.151)).toBe('moderate')
  })

  it('0.249 → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.249)).toBe('moderate')
  })

  it('0.251 → high', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.251)).toBe('high')
  })

  it('all common HHI from equal-split companies', () => {
    // 2 equal customers → HHI = 0.5 → high
    expect(ConcentrationRiskService.getHhhStatus(0.5)).toBe('high')
    // 10 equal customers → HHI = 0.1 → low
    expect(ConcentrationRiskService.getHhhStatus(0.1)).toBe('low')
    // 5 equal customers → HHI = 0.2 → moderate
    expect(ConcentrationRiskService.getHhhStatus(0.2)).toBe('moderate')
  })
})

// ── getRiskLabel — additional boundary tests ──────────────────────────────────

describe('ConcentrationRiskService.getRiskLabel — additional boundary tests', () => {
  it('negative share → minor (edge case)', () => {
    // Shares can't really be negative, but tests the lower bound behavior
    const result = ConcentrationRiskService.getRiskLabel(-10)
    expect(result).toBe('minor')
  })

  it('exactly 40 → major (not dominant, exclusive upper bound)', () => {
    expect(ConcentrationRiskService.getRiskLabel(40)).toBe('major')
  })

  it('exactly 41 → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(41)).toBe('dominant')
  })

  it('exactly 20 → significant (not major)', () => {
    expect(ConcentrationRiskService.getRiskLabel(20)).toBe('significant')
  })

  it('exactly 21 → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(21)).toBe('major')
  })

  it('exactly 10 → minor (not significant)', () => {
    expect(ConcentrationRiskService.getRiskLabel(10)).toBe('minor')
  })

  it('exactly 11 → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(11)).toBe('significant')
  })

  it('50% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(50)).toBe('dominant')
  })

  it('25% → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(25)).toBe('major')
  })

  it('14% → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(14)).toBe('significant')
  })

  it('7% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(7)).toBe('minor')
  })

  it('returns string type in all cases', () => {
    for (const pct of [0, 5, 10, 11, 15, 20, 21, 25, 30, 40, 41, 50, 100]) {
      expect(typeof ConcentrationRiskService.getRiskLabel(pct)).toBe('string')
    }
  })
})

// ── getReport — additional integration tests ──────────────────────────────────

describe('ConcentrationRiskService.getReport — additional integration tests', () => {
  const period = { from: '2025-01-01', to: '2025-12-31' }

  it('hhi is sum of squared fractional shares', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 600 },
      { customer_name: 'B', total_try: 400 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    const expected = (0.6 * 0.6) + (0.4 * 0.4)   // 0.36 + 0.16 = 0.52
    expect(report.hhi).toBeCloseTo(expected, 4)
  })

  it('top_3_share_pct is 100 when only 2 customers exist', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 700 },
      { customer_name: 'B', total_try: 300 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.top_3_share_pct).toBeCloseTo(100, 1)
  })

  it('computed_at is a valid ISO date string', async () => {
    const rows: MockSaleRow[] = [{ customer_name: 'A', total_try: 100 }]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(typeof report.computed_at).toBe('string')
    expect(report.computed_at.length).toBeGreaterThan(0)
  })

  it('all customer risk_labels are valid strings', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 500 },
      { customer_name: 'B', total_try: 300 },
      { customer_name: 'C', total_try: 200 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    const validLabels = ['dominant', 'major', 'significant', 'minor']
    for (const c of report.customers) {
      expect(validLabels).toContain(c.risk_label)
    }
  })

  it('three equal customers → none dominant', async () => {
    const rows: MockSaleRow[] = [
      { customer_name: 'A', total_try: 333 },
      { customer_name: 'B', total_try: 333 },
      { customer_name: 'C', total_try: 334 },
    ]
    const report = await ConcentrationRiskService.getReport('c1', makeMockSupabase(rows), period)
    expect(report.has_dominant_customer).toBe(false)
  })
})

// ── computeHHI — formula verification ────────────────────────────────────────

describe('ConcentrationRiskService.computeHHI — formula verification', () => {
  it('formula: HHI = Σ share² (0-1 fractions)', () => {
    const shares = [0.5, 0.3, 0.2]
    const expected = 0.5 * 0.5 + 0.3 * 0.3 + 0.2 * 0.2
    expect(ConcentrationRiskService.computeHHI(shares)).toBeCloseTo(expected, 8)
  })

  it('single customer 100% (as fraction 1.0) → 10000 on 0-1 scale = 1.0', () => {
    // On 0-1 scale: 1.0² = 1.0
    expect(ConcentrationRiskService.computeHHI([1.0])).toBeCloseTo(1.0)
  })

  it('two equal customers 50% each → HHI = 0.5² + 0.5² = 0.50', () => {
    expect(ConcentrationRiskService.computeHHI([0.5, 0.5])).toBeCloseTo(0.5, 4)
  })

  it('HHI increases monotonically as market concentrates', () => {
    // Uniform 5 → uniform 4 → uniform 3 → uniform 2 → monopoly
    const hhi5 = ConcentrationRiskService.computeHHI([0.2, 0.2, 0.2, 0.2, 0.2])
    const hhi4 = ConcentrationRiskService.computeHHI([0.25, 0.25, 0.25, 0.25])
    const hhi3 = ConcentrationRiskService.computeHHI([1/3, 1/3, 1/3])
    const hhi2 = ConcentrationRiskService.computeHHI([0.5, 0.5])
    const hhi1 = ConcentrationRiskService.computeHHI([1.0])
    expect(hhi5).toBeLessThan(hhi4)
    expect(hhi4).toBeLessThan(hhi3)
    expect(hhi3).toBeLessThan(hhi2)
    expect(hhi2).toBeLessThan(hhi1)
  })

  it('specific asymmetric: [0.6, 0.25, 0.15] → 0.36+0.0625+0.0225 = 0.445', () => {
    const expected = 0.6 * 0.6 + 0.25 * 0.25 + 0.15 * 0.15
    expect(ConcentrationRiskService.computeHHI([0.6, 0.25, 0.15])).toBeCloseTo(expected, 6)
  })

  it('result type is number for any non-empty array', () => {
    const cases = [[0.5, 0.5], [1.0], [0.2, 0.2, 0.2, 0.2, 0.2]]
    for (const shares of cases) {
      expect(typeof ConcentrationRiskService.computeHHI(shares)).toBe('number')
    }
  })
})

// ── getHhhStatus — all classification levels ──────────────────────────────────

describe('ConcentrationRiskService.getHhhStatus — all classification levels', () => {
  it('returns "low" for values strictly below 0.15', () => {
    for (const v of [0, 0.01, 0.05, 0.10, 0.14, 0.1499]) {
      expect(ConcentrationRiskService.getHhhStatus(v)).toBe('low')
    }
  })

  it('returns "moderate" for values in [0.15, 0.25]', () => {
    for (const v of [0.15, 0.16, 0.20, 0.24, 0.25]) {
      expect(ConcentrationRiskService.getHhhStatus(v)).toBe('moderate')
    }
  })

  it('returns "high" for values strictly above 0.25', () => {
    for (const v of [0.2501, 0.30, 0.40, 0.50, 0.75, 1.0]) {
      expect(ConcentrationRiskService.getHhhStatus(v)).toBe('high')
    }
  })

  it('boundary 0.15 inclusive → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.15)).toBe('moderate')
  })

  it('boundary 0.25 inclusive → moderate', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.25)).toBe('moderate')
  })

  it('just below moderate lower bound → low', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.14999)).toBe('low')
  })

  it('just above moderate upper bound → high', () => {
    expect(ConcentrationRiskService.getHhhStatus(0.25001)).toBe('high')
  })

  it('return type is always string', () => {
    for (const v of [0, 0.15, 0.25, 1.0]) {
      expect(typeof ConcentrationRiskService.getHhhStatus(v)).toBe('string')
    }
  })
})

// ── getRiskLabel — all boundaries ────────────────────────────────────────────

describe('ConcentrationRiskService.getRiskLabel — all share percentage boundaries', () => {
  it('0% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(0)).toBe('minor')
  })

  it('9.99% → minor', () => {
    expect(ConcentrationRiskService.getRiskLabel(9.99)).toBe('minor')
  })

  it('10% → minor (boundary: must be >10 for significant)', () => {
    expect(ConcentrationRiskService.getRiskLabel(10)).toBe('minor')
  })

  it('10.01% → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(10.01)).toBe('significant')
  })

  it('19.99% → significant', () => {
    expect(ConcentrationRiskService.getRiskLabel(19.99)).toBe('significant')
  })

  it('20% → significant (boundary: must be >20 for major)', () => {
    expect(ConcentrationRiskService.getRiskLabel(20)).toBe('significant')
  })

  it('20.01% → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(20.01)).toBe('major')
  })

  it('39.99% → major', () => {
    expect(ConcentrationRiskService.getRiskLabel(39.99)).toBe('major')
  })

  it('40% → major (boundary: must be >40 for dominant)', () => {
    expect(ConcentrationRiskService.getRiskLabel(40)).toBe('major')
  })

  it('40.01% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(40.01)).toBe('dominant')
  })

  it('100% → dominant', () => {
    expect(ConcentrationRiskService.getRiskLabel(100)).toBe('dominant')
  })

  it('all 4 labels are reachable', () => {
    const results = new Set([
      ConcentrationRiskService.getRiskLabel(5),
      ConcentrationRiskService.getRiskLabel(15),
      ConcentrationRiskService.getRiskLabel(25),
      ConcentrationRiskService.getRiskLabel(50),
    ])
    expect(results.has('minor')).toBe(true)
    expect(results.has('significant')).toBe(true)
    expect(results.has('major')).toBe(true)
    expect(results.has('dominant')).toBe(true)
  })
})
