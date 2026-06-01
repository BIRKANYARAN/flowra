// Node-env tests for buildShareholderPositions — the only pure exported function
// in reconciliation.engine.ts that lacked coverage. It computes each partner's
// net economic position for the institutional reconciliation; the math has
// several subtle invariants worth locking down.
import { describe, it, expect } from 'vitest'
import { buildShareholderPositions } from '@/lib/engines/reconciliation.engine'

// Minimal snapshot: 2 partners, 60/40 split. Net profit 100k, 20k already
// distributed YTD → 80k distributable. Partner A also has a 10k receivable
// (owes the company), a 5k liability, a 30k debt-tranche, and 8k accumulated dist.
const sections = {
  section9:  { total_equity: 250_000, partners: [
    { name: 'Ahmet', ownership_pct: 60, equity_value: 150_000 },
    { name: 'Mehmet', ownership_pct: 40, equity_value: 100_000 },
  ] },
  section10: { partner_receivables: [{ partner_name: 'ahmet', balance: 10_000 }] }, // lowercase — match is case-insensitive
  section11: { partner_liabilities: [{ partner_name: 'AHMET', balance: 5_000 }] },   // uppercase — still matches
  section12: { tranches: [{ partner_name: 'Ahmet', outstanding: 30_000 }] },
  section13: { ytd_total: 20_000, per_partner: [{ name: 'Ahmet', huzur_hakki: 3_000, temettu: 5_000 }] },
  section15: { net_profit_try: 100_000 },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('buildShareholderPositions (reconciliation engine)', () => {
  const out = buildShareholderPositions(sections, '2026-06-01')

  it('passes through summary totals and the as-of date', () => {
    expect(out.as_of_date).toBe('2026-06-01')
    expect(out.total_equity).toBe(250_000)
    expect(out.total_distributable).toBe(80_000) // 100k net − 20k already distributed
  })

  it('splits the distribution right by ownership percentage', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    const m = out.positions.find(p => p.partner_name === 'Mehmet')!
    expect(a.current_distribution_right).toBe(48_000) // 80k × 60%
    expect(m.current_distribution_right).toBe(32_000) // 80k × 40%
  })

  it('matches receivables/liabilities/distributions case-insensitively', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    expect(a.partner_receivables).toBe(10_000)
    expect(a.partner_liabilities).toBe(5_000)
    expect(a.accumulated_distributions).toBe(8_000) // 3k huzur + 5k temettü
  })

  it('reports debt-tranche exposure but does NOT net it into the economic position', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    expect(a.debt_tranche_exposure).toBe(30_000)
    // net = equity + recv − liab + distRight  (tranche intentionally excluded)
    expect(a.net_economic_position).toBe(150_000 + 10_000 - 5_000 + 48_000) // 203_000
  })

  it('floors distributable at zero when YTD distributions exceed net profit', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const over = { ...sections, section13: { ytd_total: 150_000, per_partner: [] }, section15: { net_profit_try: 100_000 } } as any
    const r = buildShareholderPositions(over, '2026-06-01')
    expect(r.total_distributable).toBe(0)
    expect(r.positions.every(p => p.current_distribution_right === 0)).toBe(true)
  })

  it('handles a partner with no receivable/liability/tranche/distribution rows', () => {
    const m = out.positions.find(p => p.partner_name === 'Mehmet')!
    expect(m.partner_receivables).toBe(0)
    expect(m.partner_liabilities).toBe(0)
    expect(m.debt_tranche_exposure).toBe(0)
    expect(m.accumulated_distributions).toBe(0)
    expect(m.net_economic_position).toBe(100_000 + 32_000) // equity + distRight only
  })
})
