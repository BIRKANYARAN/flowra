/**
 * Tests for lib/services/ledger/gl-reconciliation.service.ts
 *
 * Only tests pure exported functions — no DB access.
 * Run with: npx vitest run tests/gl-reconciliation.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDiscrepancy,
  computeDiscrepancyPct,
  assignReconciliationStatus,
  buildStatusLabel,
} from '../lib/services/ledger/gl-reconciliation.service'
import type { ReconciliationStatus } from '../lib/services/ledger/gl-reconciliation.service'

// ── computeDiscrepancy ────────────────────────────────────────────────────────

describe('computeDiscrepancy', () => {
  it('returns gl - ops when both are numbers', () => {
    expect(computeDiscrepancy(100, 90)).toBe(10)
  })

  it('returns 0 when gl equals ops', () => {
    expect(computeDiscrepancy(500, 500)).toBe(0)
  })

  it('returns negative when ops > gl', () => {
    expect(computeDiscrepancy(80, 100)).toBe(-20)
  })

  it('returns null when gl is null', () => {
    expect(computeDiscrepancy(null, 90)).toBeNull()
  })

  it('returns null when ops is null', () => {
    expect(computeDiscrepancy(100, null)).toBeNull()
  })

  it('returns null when both are null', () => {
    expect(computeDiscrepancy(null, null)).toBeNull()
  })

  it('handles zero gl amount correctly', () => {
    expect(computeDiscrepancy(0, 50)).toBe(-50)
  })

  it('handles both zero', () => {
    expect(computeDiscrepancy(0, 0)).toBe(0)
  })
})

// ── computeDiscrepancyPct ─────────────────────────────────────────────────────

describe('computeDiscrepancyPct', () => {
  it('returns 10 when gl=110, ops=100', () => {
    expect(computeDiscrepancyPct(110, 100)).toBe(10)
  })

  it('returns null when ops is 0 (avoids division by zero)', () => {
    expect(computeDiscrepancyPct(110, 0)).toBeNull()
  })

  it('returns 0 when gl equals ops', () => {
    expect(computeDiscrepancyPct(200, 200)).toBe(0)
  })

  it('returns negative pct when gl < ops', () => {
    expect(computeDiscrepancyPct(90, 100)).toBeCloseTo(-10, 5)
  })

  it('returns -100 when gl is 0 and ops is non-zero', () => {
    expect(computeDiscrepancyPct(0, 100)).toBe(-100)
  })

  it('uses absolute value of ops in denominator (negative ops scenario)', () => {
    // ops is negative (e.g. contra account), pct = (gl - ops) / |ops| * 100 = (50 - (-100)) / 100 * 100 = 150
    const result = computeDiscrepancyPct(50, -100)
    expect(result).toBeCloseTo(150, 5)
  })
})

// ── assignReconciliationStatus ────────────────────────────────────────────────

describe('assignReconciliationStatus', () => {
  it("returns 'balanced' when discrepancy is within threshold", () => {
    expect(assignReconciliationStatus(5, 100)).toBe<ReconciliationStatus>('balanced')
  })

  it("returns 'balanced' when discrepancy equals threshold exactly", () => {
    expect(assignReconciliationStatus(100, 100)).toBe<ReconciliationStatus>('balanced')
  })

  it("returns 'discrepancy' when discrepancy exceeds threshold", () => {
    expect(assignReconciliationStatus(150, 100)).toBe<ReconciliationStatus>('discrepancy')
  })

  it("returns 'discrepancy' for negative discrepancy exceeding threshold", () => {
    expect(assignReconciliationStatus(-200, 100)).toBe<ReconciliationStatus>('discrepancy')
  })

  it("returns 'no_gl_data' when discrepancy is null", () => {
    expect(assignReconciliationStatus(null, 100)).toBe<ReconciliationStatus>('no_gl_data')
  })

  it("returns 'balanced' for zero discrepancy regardless of threshold", () => {
    expect(assignReconciliationStatus(0, 1)).toBe<ReconciliationStatus>('balanced')
  })

  it("returns 'discrepancy' for discrepancy just above threshold", () => {
    expect(assignReconciliationStatus(100.01, 100)).toBe<ReconciliationStatus>('discrepancy')
  })
})

// ── buildStatusLabel ──────────────────────────────────────────────────────────

describe('buildStatusLabel', () => {
  it("returns Turkish 'balanced' string when allBalanced is true", () => {
    const label = buildStatusLabel(true, 0)
    expect(label).toBe('Dengeli')
  })

  it("includes discrepancy count in Turkish when allBalanced is false", () => {
    const label = buildStatusLabel(false, 2)
    expect(label).toContain('2')
    expect(label).toContain('Uyuşmazlık')
  })

  it('handles single discrepancy', () => {
    const label = buildStatusLabel(false, 1)
    expect(label).toContain('1')
    expect(label).toContain('Uyuşmazlık')
  })

  it('handles many discrepancies', () => {
    const label = buildStatusLabel(false, 5)
    expect(label).toContain('5')
  })

  it('ignores discrepancy count when allBalanced is true', () => {
    // Even if count is non-zero (shouldn't happen, but guard against it)
    const label = buildStatusLabel(true, 99)
    expect(label).toBe('Dengeli')
  })
})

// ── Trial Balance invariant ───────────────────────────────────────────────────

describe('Trial balance isBalanced invariant', () => {
  function makeTrialBalance(debits: number, credits: number) {
    const imbalance = Math.abs(debits - credits)
    return {
      total_debits:  debits,
      total_credits: credits,
      imbalance,
      is_balanced:   imbalance < 1,
    }
  }

  it('is balanced when debits equal credits', () => {
    const tb = makeTrialBalance(10_000, 10_000)
    expect(tb.is_balanced).toBe(true)
    expect(tb.imbalance).toBe(0)
  })

  it('is balanced when imbalance is within rounding (< 1 TRY)', () => {
    const tb = makeTrialBalance(10_000.50, 10_000.00)
    expect(tb.is_balanced).toBe(true)
  })

  it('is NOT balanced when imbalance >= 1 TRY', () => {
    const tb = makeTrialBalance(10_001, 10_000)
    expect(tb.is_balanced).toBe(false)
    expect(tb.imbalance).toBe(1)
  })

  it('correctly computes imbalance amount', () => {
    const tb = makeTrialBalance(50_000, 48_000)
    expect(tb.imbalance).toBe(2000)
    expect(tb.is_balanced).toBe(false)
  })
})

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('computeDiscrepancy with very small floating point values', () => {
    const result = computeDiscrepancy(100.01, 100.00)
    expect(result).toBeCloseTo(0.01, 5)
  })

  it('assignReconciliationStatus handles threshold of 0', () => {
    expect(assignReconciliationStatus(0, 0)).toBe<ReconciliationStatus>('balanced')
    expect(assignReconciliationStatus(0.01, 0)).toBe<ReconciliationStatus>('discrepancy')
  })

  it('computeDiscrepancyPct returns negative for ops > gl', () => {
    const pct = computeDiscrepancyPct(50, 200)
    expect(pct).toBeCloseTo(-75, 5)
  })
})
