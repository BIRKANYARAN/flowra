// Node-env tests for buildShareholderPositions — computes each partner's net
// economic position for the institutional reconciliation. It is production-wired
// (app/api/reconciliation/snapshots/route.ts).
//
// NOTE: this test was REWRITTEN to the REAL section contract emitted by the
// buildSectionN functions (types/reconciliation.ts). It previously encoded a
// fictional contract (section9.partners[].equity_value, section10.partner_receivables
// [].balance, section13.ytd_total/per_partner) that did not match what the engine
// emits — which masked the fact that the function read all-undefined → 0.
import { describe, it, expect } from 'vitest'
import { buildShareholderPositions } from '@/lib/engines/reconciliation.engine'

// Real shapes: section9.shareholders[{name,ownership_pct,paid_capital_try,equity_value_try}],
// section10/11.partners[{partner_name,outstanding_try}], section12.tranches[{partner_name,remaining_try}],
// section13.total_distributed_try, section15.net_profit_try, section9.total_capital_try.
const sections = {
  section9:  {
    total_capital_try: 250_000,
    shareholders: [
      { name: 'Ahmet',  ownership_pct: 60, paid_capital_try: 150_000, equity_value_try: 150_000 },
      { name: 'Mehmet', ownership_pct: 40, paid_capital_try: 100_000, equity_value_try: 100_000 },
    ],
  },
  section10: { partners: [{ partner_name: 'ahmet', outstanding_try: 10_000 }] }, // case-insensitive match
  section11: { partners: [{ partner_name: 'AHMET', outstanding_try: 5_000 }] },
  section12: { tranches: [{ partner_name: 'Ahmet', remaining_try: 30_000 }] },
  section13: { total_distributed_try: 20_000 },
  section15: { net_profit_try: 100_000 },
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('buildShareholderPositions (reconciliation engine — real contract)', () => {
  const out = buildShareholderPositions(sections, '2026-06-01')

  it('passes through total capital + as-of date, distributable = net − distributed', () => {
    expect(out.as_of_date).toBe('2026-06-01')
    expect(out.total_equity).toBe(250_000)          // section9.total_capital_try
    expect(out.total_distributable).toBe(80_000)    // 100k net − 20k distributed
  })

  it('splits the distribution right by ownership percentage', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    const m = out.positions.find(p => p.partner_name === 'Mehmet')!
    expect(a.current_distribution_right).toBe(48_000) // 80k × 60%
    expect(m.current_distribution_right).toBe(32_000) // 80k × 40%
  })

  it('matches partner receivables/liabilities case-insensitively via outstanding_try', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    expect(a.partner_receivables).toBe(10_000)   // section10.partners[].outstanding_try
    expect(a.partner_liabilities).toBe(5_000)    // section11.partners[].outstanding_try
  })

  it('reports tranche exposure from remaining_try but does NOT net it into the position', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    expect(a.debt_tranche_exposure).toBe(30_000)
    // net = equity_value_try + recv − liab + distRight (tranche intentionally excluded)
    expect(a.net_economic_position).toBe(150_000 + 10_000 - 5_000 + 48_000) // 203_000
  })

  it('uses paid_capital_try for paid_capital', () => {
    const a = out.positions.find(p => p.partner_name === 'Ahmet')!
    expect(a.paid_capital).toBe(150_000)
  })

  it('leaves accumulated_distributions at 0 (snapshot carries no per-partner split)', () => {
    expect(out.positions.every(p => p.accumulated_distributions === 0)).toBe(true)
  })

  it('floors distributable at zero when distributions exceed net profit', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const over = { ...sections, section13: { total_distributed_try: 150_000 }, section15: { net_profit_try: 100_000 } } as any
    const r = buildShareholderPositions(over, '2026-06-01')
    expect(r.total_distributable).toBe(0)
    expect(r.positions.every(p => p.current_distribution_right === 0)).toBe(true)
  })

  it('resolves every component to 0 for a shareholder with no receivable/liability/tranche', () => {
    const m = out.positions.find(p => p.partner_name === 'Mehmet')!
    expect(m.partner_receivables).toBe(0)
    expect(m.partner_liabilities).toBe(0)
    expect(m.debt_tranche_exposure).toBe(0)
    expect(m.net_economic_position).toBe(100_000 + 32_000) // equity + distRight only
  })
})
