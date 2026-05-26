/**
 * Tests for lib/services/commercial/proforma-analytics.service.ts
 *
 * All tests use mock Supabase clients — no real DB calls.
 *
 * Run with: npx vitest run tests/proforma-analytics.test.ts
 */
import { describe, it, expect } from 'vitest'
import { ProformaAnalyticsService } from '../lib/services/commercial/proforma-analytics.service'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface MockProformaRow {
  id:           string
  status:       string | null
  total:        number | null
  currency:     string | null
  fx_try:       number | null
  created_at:   string
  converted_at: string | null
}

interface MockSaleRow {
  proforma_id: string | null
  sale_date:   string
  total_try:   number | null
}

// ── Mock factory ──────────────────────────────────────────────────────────────

// The service makes 4 DB calls: current proformas, all sales, prior proformas, all sales again
function makeMockSupabase(
  proformas: MockProformaRow[],
  sales: MockSaleRow[],
  priorProformas: MockProformaRow[],
) {
  let callCount = 0
  // Calls order: [currentProformas, currentSales, priorProformas, priorSales]
  const dataSets = [proformas, sales, priorProformas, sales]

  return {
    from(_table: string) {
      const dataIndex = callCount++
      const rows = dataSets[dataIndex] ?? []
      const queryObj = {
        _rows: rows,
        select(_: string)              { return this },
        eq(_: string, __: unknown)     { return this },
        is(_: string, __: unknown)     { return this },
        not(_: string, __: string, ___: unknown) { return this },
        gte(_: string, __: unknown)    { return this },
        lte(_: string, __: unknown)    { return this },
        then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: this._rows, error: null }).then(resolve)
        },
      }
      return queryObj
    },
  } as unknown as SupabaseClient
}

function makeProforma(overrides: Partial<MockProformaRow> = {}): MockProformaRow {
  return {
    id:           overrides.id           ?? 'p1',
    status:       overrides.status       ?? 'sent',
    total:        overrides.total        ?? 1000,
    currency:     overrides.currency     ?? 'TRY',
    fx_try:       overrides.fx_try       ?? 1,
    created_at:   overrides.created_at   ?? '2025-01-10',
    converted_at: overrides.converted_at ?? null,
  }
}

function makeSale(proformaId: string, saleDate: string, totalTry = 1000): MockSaleRow {
  return { proforma_id: proformaId, sale_date: saleDate, total_try: totalTry }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const period = { from: '2025-01-01', to: '2025-12-31' }

describe('ProformaAnalyticsService.getMetrics — edge cases', () => {
  it('no proformas → all zeros, win_rate = 0', async () => {
    const supabase = makeMockSupabase([], [], [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.total_proformas).toBe(0)
    expect(m.win_rate_pct).toBe(0)
    expect(m.conversion_rate_pct).toBe(0)
    expect(m.pipeline_value_try).toBe(0)
    expect(m.avg_deal_size_try).toBeNull()
  })

  it('all proformas converted via linked sale → win_rate = 100', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'converted' }),
      makeProforma({ id: 'p2', status: 'converted' }),
    ]
    const sales = [
      makeSale('p1', '2025-02-01'),
      makeSale('p2', '2025-03-01'),
    ]
    const supabase = makeMockSupabase(proformas, sales, [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.win_rate_pct).toBe(100)
    expect(m.converted_count).toBe(2)
  })

  it('all rejected, none converted → win_rate = 0', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'rejected' }),
      makeProforma({ id: 'p2', status: 'rejected' }),
    ]
    const supabase = makeMockSupabase(proformas, [], [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.win_rate_pct).toBe(0)
    expect(m.rejected_count).toBe(2)
    expect(m.converted_count).toBe(0)
  })

  it('pending proformas excluded from win_rate denominator', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'converted' }),
      makeProforma({ id: 'p2', status: 'rejected'  }),
      makeProforma({ id: 'p3', status: 'sent'      }), // pending — should NOT count
    ]
    const sales = [makeSale('p1', '2025-02-01')]
    const supabase = makeMockSupabase(proformas, sales, [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    // win_rate = 1 / (1 + 1 + 0) = 50%  (pending excluded)
    expect(m.win_rate_pct).toBe(50)
    expect(m.pending_count).toBe(1)
  })

  it('avg_days_to_convert computed from created_at to sale_date', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'converted', created_at: '2025-01-01' }),
      makeProforma({ id: 'p2', status: 'converted', created_at: '2025-01-01' }),
    ]
    const sales = [
      makeSale('p1', '2025-01-11'), // 10 days
      makeSale('p2', '2025-01-21'), // 20 days
    ]
    const supabase = makeMockSupabase(proformas, sales, [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.avg_days_to_convert).toBe(15) // (10+20)/2
    expect(m.fastest_conversion_days).toBe(10)
  })

  it('conversion_value_rate_pct = converted_value / total_value', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'converted', total: 800, currency: 'TRY', fx_try: 1 }),
      makeProforma({ id: 'p2', status: 'rejected',  total: 200, currency: 'TRY', fx_try: 1 }),
    ]
    const sales = [makeSale('p1', '2025-02-01', 800)]
    const supabase = makeMockSupabase(proformas, sales, [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.total_proforma_value_try).toBe(1000)
    expect(m.converted_value_try).toBe(800)
    expect(m.conversion_value_rate_pct).toBe(80)
  })

  it('pipeline_value_try = sum of pending (sent/accepted) proformas', async () => {
    const proformas = [
      makeProforma({ id: 'p1', status: 'sent',      total: 500, currency: 'TRY', fx_try: 1 }),
      makeProforma({ id: 'p2', status: 'accepted',  total: 300, currency: 'TRY', fx_try: 1 }),
      makeProforma({ id: 'p3', status: 'converted', total: 200, currency: 'TRY', fx_try: 1 }),
    ]
    const sales = [makeSale('p3', '2025-02-01')]
    const supabase = makeMockSupabase(proformas, sales, [])
    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)

    expect(m.pipeline_value_try).toBe(800)
    expect(m.pipeline_count).toBe(2)
  })

  it('win_rate_trend improving when current win_rate > prior by > 5%', async () => {
    // current: 1 converted, 0 rejected → win_rate = 100%
    const currentProformas = [
      makeProforma({ id: 'p1', status: 'converted' }),
    ]
    const currentSales = [makeSale('p1', '2025-02-01')]

    // prior: 1 rejected, 1 converted → win_rate = 50%
    const priorProformas = [
      makeProforma({ id: 'p2', status: 'converted', created_at: '2024-01-15' }),
      makeProforma({ id: 'p3', status: 'rejected',  created_at: '2024-01-15' }),
    ]

    // For prior period: p2 linked to sale
    const allSales = [makeSale('p1', '2025-02-01'), makeSale('p2', '2024-02-15')]

    let callCount = 0
    const dataSets = [currentProformas, allSales, priorProformas, allSales]
    const supabase = {
      from(_table: string) {
        const idx = callCount++
        const rows = dataSets[idx] ?? []
        const q = {
          _rows: rows,
          select(_: string) { return this },
          eq(_: string, __: unknown) { return this },
          is(_: string, __: unknown) { return this },
          not(_: string, __: string, ___: unknown) { return this },
          gte(_: string, __: unknown) { return this },
          lte(_: string, __: unknown) { return this },
          then(resolve: (v: { data: unknown[]; error: null }) => unknown) {
            return Promise.resolve({ data: this._rows, error: null }).then(resolve)
          },
        }
        return q
      },
    } as unknown as SupabaseClient

    const m = await ProformaAnalyticsService.getMetrics('c1', supabase, period)
    // current win_rate = 100%, prior win_rate = 50% → improving
    expect(m.win_rate_trend).toBe('improving')
  })
})
