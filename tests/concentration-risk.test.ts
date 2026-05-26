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

function makeMockSupabase(rows: MockSaleRow[]) {
  const queryObj = {
    _rows: rows,
    eq(_col: string, _val: unknown) { return this },
    is(_col: string, _val: unknown) { return this },
    gte(_col: string, _val: unknown) { return this },
    lte(_col: string, _val: unknown) { return this },
    then(resolve: (v: { data: MockSaleRow[]; error: null }) => unknown) {
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

// ── Pure function tests ───────────────────────────────────────────────────────

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
})

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
})

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
})

// ── Integration tests with mock DB ────────────────────────────────────────────

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
})
