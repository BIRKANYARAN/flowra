/**
 * Multi-Period P&L Comparison — unit tests for pure helpers
 *
 * Tests: computePeriodKey, computePeriodLabel, computeChangePct, buildPnlStructure
 * No DB or network calls — all pure function tests.
 */

import { describe, it, expect } from 'vitest'
import {
  computePeriodKey,
  computePeriodLabel,
  computeChangePct,
  buildPnlStructure,
} from '../lib/services/finance/multi-period-pnl.service'

// ── computePeriodKey ──────────────────────────────────────────────────────────

describe('computePeriodKey — pure', () => {

  it('1. month provided → YYYY-MM', () => {
    expect(computePeriodKey(2026, 5)).toBe('2026-05')
  })

  it('2. month provided — pads single digit month', () => {
    expect(computePeriodKey(2025, 1)).toBe('2025-01')
  })

  it('3. month omitted → YYYY only', () => {
    expect(computePeriodKey(2024)).toBe('2024')
  })

  it('4. month = 12 → correct padding', () => {
    expect(computePeriodKey(2026, 12)).toBe('2026-12')
  })
})

// ── computePeriodLabel ────────────────────────────────────────────────────────

describe('computePeriodLabel — pure', () => {

  it('5. month provided → Turkish month + year', () => {
    const label = computePeriodLabel(2026, 5)
    // Should contain both 'Mayıs' and '2026'
    expect(label).toContain('2026')
    expect(label.toLowerCase()).toContain('mayıs')
  })

  it('6. January in Turkish', () => {
    const label = computePeriodLabel(2026, 1)
    expect(label.toLowerCase()).toContain('ocak')
    expect(label).toContain('2026')
  })

  it('7. month omitted → year only as string', () => {
    expect(computePeriodLabel(2024)).toBe('2024')
  })

  it('8. month omitted → no month name in label', () => {
    const label = computePeriodLabel(2025)
    expect(label).toBe('2025')
    // Should NOT contain any month name
    expect(label.toLowerCase()).not.toContain('ocak')
  })
})

// ── computeChangePct ──────────────────────────────────────────────────────────

describe('computeChangePct — pure', () => {

  it('9. normal positive growth', () => {
    // (115 - 100) / 100 * 100 = 15
    expect(computeChangePct(115, 100)).toBeCloseTo(15)
  })

  it('10. negative change (decline)', () => {
    // (80 - 100) / 100 * 100 = -20
    expect(computeChangePct(80, 100)).toBeCloseTo(-20)
  })

  it('11. prior = 0 → null', () => {
    expect(computeChangePct(500, 0)).toBeNull()
  })

  it('12. prior = undefined → null', () => {
    expect(computeChangePct(500, undefined)).toBeNull()
  })

  it('13. both zero → null (prior = 0)', () => {
    expect(computeChangePct(0, 0)).toBeNull()
  })

  it('14. prior = undefined even with current = 0 → null', () => {
    expect(computeChangePct(0, undefined)).toBeNull()
  })
})

// ── buildPnlStructure ─────────────────────────────────────────────────────────

describe('buildPnlStructure — pure', () => {

  it('15. always includes required subtotal keys', () => {
    const struct = buildPnlStructure([])
    const keys = struct.map(s => s.key)
    expect(keys).toContain('gross_profit')
    expect(keys).toContain('total_opex')
    expect(keys).toContain('ebit')
    expect(keys).toContain('net_income')
  })

  it('16. gross_profit is marked is_subtotal', () => {
    const struct = buildPnlStructure([])
    const gp = struct.find(s => s.key === 'gross_profit')
    expect(gp?.is_subtotal).toBe(true)
  })

  it('17. revenue is NOT a subtotal and NOT inverted', () => {
    const struct = buildPnlStructure([])
    const rev = struct.find(s => s.key === 'revenue')
    expect(rev?.is_subtotal).toBe(false)
    expect(rev?.is_inverted).toBe(false)
  })

  it('18. cogs is inverted (expense), indent_level=1', () => {
    const struct = buildPnlStructure([])
    const cogs = struct.find(s => s.key === 'cogs')
    expect(cogs?.is_inverted).toBe(true)
    expect(cogs?.indent_level).toBe(1)
  })

  it('19. total_opex is subtotal and inverted', () => {
    const struct = buildPnlStructure([])
    const to = struct.find(s => s.key === 'total_opex')
    expect(to?.is_subtotal).toBe(true)
    expect(to?.is_inverted).toBe(true)
  })

  it('20. category rows injected with opex_ prefix and indent_level=1', () => {
    const struct = buildPnlStructure(['rent', 'salary'])
    const rent   = struct.find(s => s.key === 'opex_rent')
    const salary = struct.find(s => s.key === 'opex_salary')
    expect(rent).toBeDefined()
    expect(salary).toBeDefined()
    expect(rent?.indent_level).toBe(1)
    expect(salary?.indent_level).toBe(1)
    expect(rent?.is_subtotal).toBe(false)
    expect(rent?.is_inverted).toBe(true)
  })

  it('21. no categories → no opex_ rows', () => {
    const struct = buildPnlStructure([])
    const opexCats = struct.filter(s => s.key.startsWith('opex_') && s.key !== 'opex_header')
    expect(opexCats).toHaveLength(0)
  })

  it('22. ebit and net_income are both subtotals and not inverted', () => {
    const struct = buildPnlStructure([])
    const ebit   = struct.find(s => s.key === 'ebit')
    const net    = struct.find(s => s.key === 'net_income')
    expect(ebit?.is_subtotal).toBe(true)
    expect(ebit?.is_inverted).toBe(false)
    expect(net?.is_subtotal).toBe(true)
    expect(net?.is_inverted).toBe(false)
  })
})
