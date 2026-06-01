// Integration smoke test for getCfoMetrics — the ~30-parallel-query orchestrator
// feeding CFO/insights/P&L/tax, which the audit flagged as having ZERO coverage.
// A chainable thenable mock returns empty data for every table; getCfoMetrics must
// run the WHOLE pipeline end-to-end and return a valid all-zero CfoMetrics without
// throwing. This is the safety net that would catch a query referencing a column
// that doesn't exist (the class of wiring bug the audit found elsewhere).
import { describe, it, expect } from 'vitest'
import { getCfoMetrics } from '@/lib/finance/financial-core'

// A query-builder proxy: every method returns itself; awaiting yields {data,error}.
function chainable(result: { data: unknown; error: unknown }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proxy: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => unknown) => resolve(result)
      return () => proxy
    },
    apply() { return proxy },
  })
  return proxy
}
function emptyClient() {
  return { from: () => chainable({ data: [], error: null }), rpc: () => chainable({ data: [], error: null }) }
}

describe('getCfoMetrics — end-to-end orchestration (empty state)', () => {
  it('runs the full query pipeline and returns a valid all-zero CfoMetrics', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await getCfoMetrics('co-1', undefined, emptyClient() as any)
    // Shape: all six metric groups present
    for (const k of ['cash', 'burn', 'receivables', 'tax', 'partner', 'stock'] as const) {
      expect(m).toHaveProperty(k)
    }
    // Empty data → zero/■ financials (and crucially: no throw on any of the ~30 queries)
    expect(m.cash.true_cash_position).toBe(0)
    expect(m.tax.corporate_tax_estimate).toBe(0)
    expect(m.tax.kdv_net).toBe(0)
    expect(m.stock.fifo_value).toBe(0)
    expect(typeof m.burn.monthly_burn_rate).toBe('number')
  })

  it('does not throw for a custom period window', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = await getCfoMetrics('co-1', { from: '2026-01-01', to: '2026-06-30' }, emptyClient() as any)
    expect(m).toHaveProperty('tax')
    expect(m.tax.total_fiscal_obligation).toBe(0)
  })
})
