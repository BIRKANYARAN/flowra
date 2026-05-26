/**
 * Product Margin Analysis — unit tests
 *
 * Tests the pure computation logic of ProductMarginService.
 *
 * Run with: npx vitest run tests/product-margin.test.ts
 */

import { describe, it, expect } from 'vitest'
import { ProductMarginService } from '../lib/services/inventory/product-margin.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    for (const m of ['eq', 'neq', 'is', 'in', 'gte', 'lte', 'lt', 'gt', 'select', 'order', 'limit', 'single']) {
      chain[m] = () => chain
    }
    return chain
  }
  return { from: (table: string) => buildChain(tables[table] ?? []) }
}

const PERIOD = { from: '2024-01-01', to: '2024-01-31' }
const COMPANY = 'test-company'

// ── 1–4. getMarginGrade ────────────────────────────────────────────────────────

describe('getMarginGrade', () => {
  it('grades 45% as excellent (> 40%)', () => {
    expect(ProductMarginService.getMarginGrade(45)).toBe('excellent')
  })

  it('grades 25% as good (20-40%)', () => {
    expect(ProductMarginService.getMarginGrade(25)).toBe('good')
  })

  it('grades 15% as fair (10-20%)', () => {
    expect(ProductMarginService.getMarginGrade(15)).toBe('fair')
  })

  it('grades 5% as poor (< 10%)', () => {
    expect(ProductMarginService.getMarginGrade(5)).toBe('poor')
  })

  it('grades exactly 40% as good (not excellent)', () => {
    expect(ProductMarginService.getMarginGrade(40)).toBe('good')
  })

  it('grades exactly 10% as poor (not fair)', () => {
    expect(ProductMarginService.getMarginGrade(10)).toBe('poor')
  })
})

// ── 5. gross_margin_try = revenue - cogs ──────────────────────────────────────

describe('gross margin computation', () => {
  it('gross_margin_try = revenue - cogs', async () => {
    // Product A: 10 units sold at 100 each = 1000 revenue, avg FIFO cost 60 = 600 COGS
    const supabase = makeSupabase({
      sale_items: [
        { product_id: 'p1', product_name: 'Widget', quantity: 10, price: 100, line_total_try: 1000,
          sales: { sale_date: '2024-01-15', company_id: COMPANY } },
      ],
      stock_lots: [
        { product_id: 'p1', qty_remaining: 5, cost_price_try: 60 },
      ],
      products: [
        { id: 'p1', name: 'Widget', category: 'Electronics' },
      ],
    })

    const report = await ProductMarginService.getReport(
      COMPANY,
      supabase as Parameters<typeof ProductMarginService.getReport>[1],
      PERIOD,
    )

    expect(report.products).toHaveLength(1)
    const p = report.products[0]
    // COGS = avg_cost × units_sold = 60 × 10 = 600
    expect(p.total_cogs_try).toBe(600)
    // Gross margin = 1000 - 600 = 400
    expect(p.gross_margin_try).toBe(400)
  })

  it('gross_margin_pct = (gross_margin / revenue) × 100', async () => {
    // Revenue 1000, COGS 600 → margin = 400/1000 = 40%
    const supabase = makeSupabase({
      sale_items: [
        { product_id: 'p2', product_name: 'Gadget', quantity: 10, price: 100, line_total_try: 1000,
          sales: { sale_date: '2024-01-15', company_id: COMPANY } },
      ],
      stock_lots: [
        { product_id: 'p2', qty_remaining: 5, cost_price_try: 60 },
      ],
      products: [
        { id: 'p2', name: 'Gadget', category: null },
      ],
    })

    const report = await ProductMarginService.getReport(
      COMPANY,
      supabase as Parameters<typeof ProductMarginService.getReport>[1],
      PERIOD,
    )

    const p = report.products[0]
    expect(p.gross_margin_pct).toBeCloseTo(40, 1)
  })
})

// ── 7. Zero revenue → margin = 0, no crash ───────────────────────────────────

describe('zero revenue handling', () => {
  it('returns empty products array and 0 margin when no sales exist', async () => {
    const supabase = makeSupabase({
      sale_items: [],
      stock_lots: [{ product_id: 'p1', qty_remaining: 10, cost_price_try: 50 }],
      products:   [{ id: 'p1', name: 'Widget', category: null }],
    })

    const report = await ProductMarginService.getReport(
      COMPANY,
      supabase as Parameters<typeof ProductMarginService.getReport>[1],
      PERIOD,
    )

    expect(report.products).toHaveLength(0)
    expect(report.total_revenue_try).toBe(0)
    expect(report.overall_gross_margin_pct).toBe(0)
  })
})

// ── 8. products_below_threshold_count counts products with margin < 10% ──────

describe('below-threshold count', () => {
  it('counts products with gross_margin_pct < 10%', async () => {
    // Product A: margin 5% (below threshold)
    // Product B: margin 30% (above threshold)
    const supabase = makeSupabase({
      sale_items: [
        { product_id: 'pA', product_name: 'Low',  quantity: 10, price: 100, line_total_try: 1000,
          sales: { sale_date: '2024-01-15', company_id: COMPANY } },
        { product_id: 'pB', product_name: 'High', quantity: 10, price: 200, line_total_try: 2000,
          sales: { sale_date: '2024-01-20', company_id: COMPANY } },
      ],
      stock_lots: [
        { product_id: 'pA', qty_remaining: 5, cost_price_try: 95 },   // 95% cost → ~5% margin
        { product_id: 'pB', qty_remaining: 5, cost_price_try: 140 },  // 70% cost → 30% margin
      ],
      products: [
        { id: 'pA', name: 'Low',  category: null },
        { id: 'pB', name: 'High', category: null },
      ],
    })

    const report = await ProductMarginService.getReport(
      COMPANY,
      supabase as Parameters<typeof ProductMarginService.getReport>[1],
      PERIOD,
    )

    expect(report.products_below_threshold_count).toBe(1)
  })
})
