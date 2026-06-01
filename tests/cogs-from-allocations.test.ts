// Node-env tests for computeCogsFromAllocations — the COGS aggregation kernel
// extracted from getCfoMetrics (financial-core). It was inline + untested; the
// cost-source precedence (denormalized allocation cost → joined lot cost → 0) is
// correctness-critical for YTD profit and tax figures.
import { describe, it, expect } from 'vitest'
import { computeCogsFromAllocations, allocationUnitCost } from '@/lib/finance/cogs'

describe('allocationUnitCost (shared cost-source decision)', () => {
  it('prefers the denormalized allocation cost, then the lot, then 0', () => {
    expect(allocationUnitCost({ cost_price_try: 10, stock_lots: { cost_price_try: 99 } })).toBe(10)
    expect(allocationUnitCost({ stock_lots: { cost_price_try: 5 } })).toBe(5)
    expect(allocationUnitCost({})).toBe(0)
  })
  it('honors a denormalized 0 and accepts the lot as a single-element array', () => {
    expect(allocationUnitCost({ cost_price_try: 0, stock_lots: { cost_price_try: 99 } })).toBe(0)
    expect(allocationUnitCost({ stock_lots: [{ cost_price_try: 7 }] })).toBe(7)
  })
})

describe('computeCogsFromAllocations', () => {
  it('uses the denormalized allocation.cost_price_try when present', () => {
    expect(computeCogsFromAllocations([{ qty_allocated: 2, cost_price_try: 10 }])).toBe(20)
  })

  it('falls back to the joined stock_lots.cost_price_try when the allocation cost is absent', () => {
    expect(computeCogsFromAllocations([{ qty_allocated: 3, stock_lots: { cost_price_try: 5 } }])).toBe(15)
  })

  it('prefers the allocation cost over the lot cost when both exist', () => {
    expect(computeCogsFromAllocations([{ qty_allocated: 2, cost_price_try: 10, stock_lots: { cost_price_try: 99 } }])).toBe(20)
  })

  it('honors a denormalized cost of exactly 0 (does NOT fall through to the lot)', () => {
    // ?? only coalesces null/undefined — a real 0 is an intentional value
    expect(computeCogsFromAllocations([{ qty_allocated: 2, cost_price_try: 0, stock_lots: { cost_price_try: 99 } }])).toBe(0)
  })

  it('accepts the joined lot as a single-element array (PostgREST embed shape)', () => {
    // PostgREST may surface the to-one stock_lots embed as [{...}] instead of {...}
    expect(computeCogsFromAllocations([{ qty_allocated: 3, stock_lots: [{ cost_price_try: 5 }] }])).toBe(15)
    expect(computeCogsFromAllocations([{ qty_allocated: 2, stock_lots: [] }])).toBe(0) // empty array → 0
  })

  it('is 0 when neither cost source is available', () => {
    expect(computeCogsFromAllocations([{ qty_allocated: 5 }])).toBe(0)
  })

  it('treats a null/absent qty_allocated as 0', () => {
    expect(computeCogsFromAllocations([{ cost_price_try: 10 }])).toBe(0)
    expect(computeCogsFromAllocations([{ qty_allocated: null, cost_price_try: 10 }])).toBe(0)
  })

  it('sums across multiple rows and returns 0 for an empty list', () => {
    expect(computeCogsFromAllocations([
      { qty_allocated: 2, cost_price_try: 10 },          // 20
      { qty_allocated: 3, stock_lots: { cost_price_try: 4 } }, // 12
    ])).toBe(32)
    expect(computeCogsFromAllocations([])).toBe(0)
  })
})
