/**
 * Comprehensive tests for the Commitment Ledger pure helpers
 * lib/services/governance/commitments.service.ts
 *
 * Covers:
 *   - daysBetween
 *   - toObligationStatus
 *   - computeTotalExposure
 *   - filterObligationsByStatus
 *   - sortByUrgency
 *   - buildLedgerSummary
 *
 * Run with: npx vitest run tests/commitment-ledger-complete.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  daysBetween,
  toObligationStatus,
  computeTotalExposure,
  filterObligationsByStatus,
  sortByUrgency,
  buildLedgerSummary,
} from '../lib/services/governance/commitments.service'
import type { ForwardObligation } from '../lib/services/governance/commitments.service'

// ── Fixture helpers ────────────────────────────────────────────────────────────

function makeObligation(
  overrides: Partial<ForwardObligation> & { id: string; due_date: string; status: ForwardObligation['status'] },
): ForwardObligation {
  return {
    source:          'declared_commitment',
    title:           overrides.title ?? 'Test Obligation',
    amount_try:      overrides.amount_try !== undefined ? overrides.amount_try : 1000,
    commitment_type: overrides.commitment_type ?? 'other',
    counterparty:    overrides.counterparty ?? null,
    is_computed:     overrides.is_computed ?? false,
    recurrence:      overrides.recurrence ?? null,
    description:     overrides.description ?? null,
    ...overrides,
  }
}

// ── daysBetween ────────────────────────────────────────────────────────────────

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-06-01', '2026-06-01')).toBe(0)
  })

  it('returns 1 for consecutive days', () => {
    expect(daysBetween('2026-06-01', '2026-06-02')).toBe(1)
  })

  it('returns 7 for a week apart', () => {
    expect(daysBetween('2026-06-01', '2026-06-08')).toBe(7)
  })

  it('returns 14 for exactly two weeks', () => {
    expect(daysBetween('2026-06-01', '2026-06-15')).toBe(14)
  })

  it('returns 30 for roughly a month', () => {
    expect(daysBetween('2026-06-01', '2026-07-01')).toBe(30)
  })

  it('returns 365 for a year', () => {
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })

  it('returns a negative number when "to" is before "from"', () => {
    expect(daysBetween('2026-06-10', '2026-06-01')).toBe(-9)
  })

  it('returns -1 for yesterday', () => {
    expect(daysBetween('2026-06-02', '2026-06-01')).toBe(-1)
  })

  it('handles month boundary correctly', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
  })

  it('handles year boundary correctly', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
  })
})

// ── toObligationStatus ─────────────────────────────────────────────────────────

describe('toObligationStatus', () => {
  it('returns "overdue" for negative days', () => {
    expect(toObligationStatus(-1)).toBe('overdue')
  })

  it('returns "overdue" for very negative days', () => {
    expect(toObligationStatus(-100)).toBe('overdue')
  })

  it('returns "due_soon" for 0 days (today)', () => {
    expect(toObligationStatus(0)).toBe('due_soon')
  })

  it('returns "due_soon" for 1 day', () => {
    expect(toObligationStatus(1)).toBe('due_soon')
  })

  it('returns "due_soon" for exactly 14 days', () => {
    expect(toObligationStatus(14)).toBe('due_soon')
  })

  it('returns "upcoming" for 15 days', () => {
    expect(toObligationStatus(15)).toBe('upcoming')
  })

  it('returns "upcoming" for 30 days', () => {
    expect(toObligationStatus(30)).toBe('upcoming')
  })

  it('returns "upcoming" for 365 days', () => {
    expect(toObligationStatus(365)).toBe('upcoming')
  })

  it('boundary: 13 days is due_soon not upcoming', () => {
    expect(toObligationStatus(13)).toBe('due_soon')
  })

  it('boundary: 16 days is upcoming not due_soon', () => {
    expect(toObligationStatus(16)).toBe('upcoming')
  })
})

// ── computeTotalExposure ───────────────────────────────────────────────────────

describe('computeTotalExposure', () => {
  it('returns 0 for empty array', () => {
    expect(computeTotalExposure([])).toBe(0)
  })

  it('returns the single amount when one obligation with amount', () => {
    const obs = [makeObligation({ id: 'a', due_date: '2026-07-01', status: 'upcoming', amount_try: 5000 })]
    expect(computeTotalExposure(obs)).toBe(5000)
  })

  it('sums all amount_try values', () => {
    const obs = [
      makeObligation({ id: 'a', due_date: '2026-07-01', status: 'upcoming', amount_try: 1000 }),
      makeObligation({ id: 'b', due_date: '2026-08-01', status: 'upcoming', amount_try: 2500 }),
      makeObligation({ id: 'c', due_date: '2026-09-01', status: 'upcoming', amount_try: 750 }),
    ]
    expect(computeTotalExposure(obs)).toBe(4250)
  })

  it('treats null amount_try as 0', () => {
    const obs = [
      makeObligation({ id: 'a', due_date: '2026-07-01', status: 'upcoming', amount_try: 3000 }),
      makeObligation({ id: 'b', due_date: '2026-08-01', status: 'upcoming', amount_try: null }),
    ]
    expect(computeTotalExposure(obs)).toBe(3000)
  })

  it('returns 0 when all amounts are null', () => {
    const obs = [
      makeObligation({ id: 'a', due_date: '2026-07-01', status: 'upcoming', amount_try: null }),
      makeObligation({ id: 'b', due_date: '2026-08-01', status: 'upcoming', amount_try: null }),
    ]
    expect(computeTotalExposure(obs)).toBe(0)
  })

  it('handles decimal amounts correctly', () => {
    const obs = [
      makeObligation({ id: 'a', due_date: '2026-07-01', status: 'upcoming', amount_try: 100.50 }),
      makeObligation({ id: 'b', due_date: '2026-07-02', status: 'upcoming', amount_try: 200.75 }),
    ]
    expect(computeTotalExposure(obs)).toBeCloseTo(301.25)
  })

  it('sums across overdue, due_soon, and upcoming statuses', () => {
    const obs = [
      makeObligation({ id: 'a', due_date: '2026-01-01', status: 'overdue',   amount_try: 1000 }),
      makeObligation({ id: 'b', due_date: '2026-06-10', status: 'due_soon',  amount_try: 500 }),
      makeObligation({ id: 'c', due_date: '2026-07-01', status: 'upcoming',  amount_try: 2000 }),
    ]
    expect(computeTotalExposure(obs)).toBe(3500)
  })
})

// ── filterObligationsByStatus ─────────────────────────────────────────────────

describe('filterObligationsByStatus', () => {
  const obligations: ForwardObligation[] = [
    makeObligation({ id: 'o1', due_date: '2026-01-01', status: 'overdue'  }),
    makeObligation({ id: 'o2', due_date: '2026-02-01', status: 'overdue'  }),
    makeObligation({ id: 'd1', due_date: '2026-06-10', status: 'due_soon' }),
    makeObligation({ id: 'u1', due_date: '2026-07-01', status: 'upcoming' }),
    makeObligation({ id: 'u2', due_date: '2026-08-01', status: 'upcoming' }),
    makeObligation({ id: 'u3', due_date: '2026-09-01', status: 'upcoming' }),
  ]

  it('filters to overdue only', () => {
    const result = filterObligationsByStatus(obligations, 'overdue')
    expect(result).toHaveLength(2)
    expect(result.every(o => o.status === 'overdue')).toBe(true)
  })

  it('filters to due_soon only', () => {
    const result = filterObligationsByStatus(obligations, 'due_soon')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('d1')
  })

  it('filters to upcoming only', () => {
    const result = filterObligationsByStatus(obligations, 'upcoming')
    expect(result).toHaveLength(3)
    expect(result.every(o => o.status === 'upcoming')).toBe(true)
  })

  it('returns empty array for unknown status', () => {
    const result = filterObligationsByStatus(obligations, 'unknown')
    expect(result).toHaveLength(0)
  })

  it('returns empty array when input is empty', () => {
    expect(filterObligationsByStatus([], 'overdue')).toHaveLength(0)
  })

  it('does not mutate the original array', () => {
    const original = [...obligations]
    filterObligationsByStatus(obligations, 'overdue')
    expect(obligations).toHaveLength(original.length)
  })
})

// ── sortByUrgency ──────────────────────────────────────────────────────────────

describe('sortByUrgency', () => {
  it('returns empty array for empty input', () => {
    expect(sortByUrgency([])).toHaveLength(0)
  })

  it('places overdue obligations before due_soon', () => {
    const obs = [
      makeObligation({ id: 'd', due_date: '2026-06-10', status: 'due_soon' }),
      makeObligation({ id: 'o', due_date: '2026-01-01', status: 'overdue'  }),
    ]
    const result = sortByUrgency(obs)
    expect(result[0].status).toBe('overdue')
    expect(result[1].status).toBe('due_soon')
  })

  it('places due_soon before upcoming', () => {
    const obs = [
      makeObligation({ id: 'u', due_date: '2026-08-01', status: 'upcoming' }),
      makeObligation({ id: 'd', due_date: '2026-06-10', status: 'due_soon' }),
    ]
    const result = sortByUrgency(obs)
    expect(result[0].status).toBe('due_soon')
    expect(result[1].status).toBe('upcoming')
  })

  it('sorts overdue → due_soon → upcoming in full mixed list', () => {
    const obs = [
      makeObligation({ id: 'u1', due_date: '2026-08-01', status: 'upcoming' }),
      makeObligation({ id: 'o1', due_date: '2026-01-15', status: 'overdue'  }),
      makeObligation({ id: 'd1', due_date: '2026-06-12', status: 'due_soon' }),
      makeObligation({ id: 'o2', due_date: '2026-02-01', status: 'overdue'  }),
      makeObligation({ id: 'u2', due_date: '2026-09-01', status: 'upcoming' }),
    ]
    const result = sortByUrgency(obs)
    expect(result[0].status).toBe('overdue')
    expect(result[1].status).toBe('overdue')
    expect(result[2].status).toBe('due_soon')
    expect(result[3].status).toBe('upcoming')
    expect(result[4].status).toBe('upcoming')
  })

  it('within same status group, sorts by due_date ascending', () => {
    const obs = [
      makeObligation({ id: 'o2', due_date: '2026-02-10', status: 'overdue' }),
      makeObligation({ id: 'o1', due_date: '2026-01-05', status: 'overdue' }),
      makeObligation({ id: 'o3', due_date: '2026-03-01', status: 'overdue' }),
    ]
    const result = sortByUrgency(obs)
    expect(result[0].due_date).toBe('2026-01-05')
    expect(result[1].due_date).toBe('2026-02-10')
    expect(result[2].due_date).toBe('2026-03-01')
  })

  it('does not mutate the original array', () => {
    const obs = [
      makeObligation({ id: 'u', due_date: '2026-08-01', status: 'upcoming' }),
      makeObligation({ id: 'o', due_date: '2026-01-01', status: 'overdue'  }),
    ]
    const originalOrder = obs.map(o => o.id)
    sortByUrgency(obs)
    expect(obs.map(o => o.id)).toEqual(originalOrder)
  })

  it('returns a new array, not the same reference', () => {
    const obs = [makeObligation({ id: 'a', due_date: '2026-08-01', status: 'upcoming' })]
    const result = sortByUrgency(obs)
    expect(result).not.toBe(obs)
  })
})

// ── buildLedgerSummary ─────────────────────────────────────────────────────────

describe('buildLedgerSummary', () => {
  it('returns correct summary for empty list', () => {
    expect(buildLedgerSummary([])).toBe('0 vadesi geçmiş, 0 yaklaşan, 0 toplam')
  })

  it('returns correct summary with only overdue', () => {
    const obs = [
      makeObligation({ id: 'o1', due_date: '2026-01-01', status: 'overdue' }),
      makeObligation({ id: 'o2', due_date: '2026-02-01', status: 'overdue' }),
    ]
    expect(buildLedgerSummary(obs)).toBe('2 vadesi geçmiş, 0 yaklaşan, 2 toplam')
  })

  it('returns correct summary with only due_soon', () => {
    const obs = [
      makeObligation({ id: 'd1', due_date: '2026-06-10', status: 'due_soon' }),
    ]
    expect(buildLedgerSummary(obs)).toBe('0 vadesi geçmiş, 1 yaklaşan, 1 toplam')
  })

  it('returns correct summary with only upcoming', () => {
    const obs = [
      makeObligation({ id: 'u1', due_date: '2026-07-01', status: 'upcoming' }),
      makeObligation({ id: 'u2', due_date: '2026-08-01', status: 'upcoming' }),
      makeObligation({ id: 'u3', due_date: '2026-09-01', status: 'upcoming' }),
    ]
    expect(buildLedgerSummary(obs)).toBe('0 vadesi geçmiş, 0 yaklaşan, 3 toplam')
  })

  it('counts due_soon as "yaklaşan" (not overdue)', () => {
    const obs = [
      makeObligation({ id: 'd1', due_date: '2026-06-10', status: 'due_soon' }),
      makeObligation({ id: 'd2', due_date: '2026-06-12', status: 'due_soon' }),
    ]
    const summary = buildLedgerSummary(obs)
    expect(summary).toContain('0 vadesi geçmiş')
    expect(summary).toContain('2 yaklaşan')
    expect(summary).toContain('2 toplam')
  })

  it('returns correct mixed summary', () => {
    const obs = [
      makeObligation({ id: 'o1', due_date: '2026-01-01', status: 'overdue'  }),
      makeObligation({ id: 'o2', due_date: '2026-02-01', status: 'overdue'  }),
      makeObligation({ id: 'd1', due_date: '2026-06-10', status: 'due_soon' }),
      makeObligation({ id: 'u1', due_date: '2026-07-01', status: 'upcoming' }),
      makeObligation({ id: 'u2', due_date: '2026-08-01', status: 'upcoming' }),
    ]
    expect(buildLedgerSummary(obs)).toBe('2 vadesi geçmiş, 1 yaklaşan, 5 toplam')
  })

  it('total count equals overdue + due_soon + upcoming', () => {
    const obs = [
      makeObligation({ id: 'o', due_date: '2026-01-01', status: 'overdue'  }),
      makeObligation({ id: 'd', due_date: '2026-06-10', status: 'due_soon' }),
      makeObligation({ id: 'u', due_date: '2026-07-01', status: 'upcoming' }),
    ]
    const summary = buildLedgerSummary(obs)
    expect(summary).toBe('1 vadesi geçmiş, 1 yaklaşan, 3 toplam')
  })

  it('uses Turkish number format (plain digits, no commas)', () => {
    const obs = Array.from({ length: 10 }, (_, i) =>
      makeObligation({ id: `u${i}`, due_date: '2026-07-01', status: 'upcoming' }),
    )
    const summary = buildLedgerSummary(obs)
    expect(summary).toBe('0 vadesi geçmiş, 0 yaklaşan, 10 toplam')
  })
})
