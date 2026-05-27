/**
 * Tests for lib/services/ledger/bank-reconciliation.service.ts
 *
 * Only tests pure exported functions — no DB access.
 * Run with: npx vitest run tests/bank-reconciliation.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeReconciliationDiscrepancy,
  classifyDiscrepancy,
  computeReconciliationPct,
  buildReconciliationLine,
} from '../lib/services/ledger/bank-reconciliation.service'

// ── computeReconciliationDiscrepancy ─────────────────────────────────────────

describe('computeReconciliationDiscrepancy', () => {
  it('returns positive when book > bank', () => {
    expect(computeReconciliationDiscrepancy(10000, 8000)).toBe(2000)
  })

  it('returns negative when bank > book', () => {
    expect(computeReconciliationDiscrepancy(8000, 10000)).toBe(-2000)
  })

  it('returns zero when book equals bank', () => {
    expect(computeReconciliationDiscrepancy(5000, 5000)).toBe(0)
  })

  it('handles both zero', () => {
    expect(computeReconciliationDiscrepancy(0, 0)).toBe(0)
  })

  it('handles decimal values and rounds to 2 dp', () => {
    // 1000.007 - 999.005 = 1.002 → round2 = 1
    expect(computeReconciliationDiscrepancy(1000.007, 999.005)).toBeCloseTo(1.00, 1)
  })
})

// ── classifyDiscrepancy ───────────────────────────────────────────────────────

describe('classifyDiscrepancy', () => {
  it('returns clean for |discrepancy| = 0', () => {
    expect(classifyDiscrepancy(0)).toBe('clean')
  })

  it('returns clean for |discrepancy| < 100', () => {
    expect(classifyDiscrepancy(99.99)).toBe('clean')
    expect(classifyDiscrepancy(-50)).toBe('clean')
  })

  it('returns minor at boundary 100', () => {
    expect(classifyDiscrepancy(100)).toBe('minor')
    expect(classifyDiscrepancy(-100)).toBe('minor')
  })

  it('returns minor between 100 and 1000', () => {
    expect(classifyDiscrepancy(500)).toBe('minor')
    expect(classifyDiscrepancy(1000)).toBe('minor')
  })

  it('returns moderate at boundary 1001', () => {
    expect(classifyDiscrepancy(1001)).toBe('moderate')
    expect(classifyDiscrepancy(-1001)).toBe('moderate')
  })

  it('returns moderate between 1001 and 10000', () => {
    expect(classifyDiscrepancy(5000)).toBe('moderate')
    expect(classifyDiscrepancy(10000)).toBe('moderate')
  })

  it('returns material above 10000', () => {
    expect(classifyDiscrepancy(10001)).toBe('material')
    expect(classifyDiscrepancy(-50000)).toBe('material')
  })
})

// ── computeReconciliationPct ──────────────────────────────────────────────────

describe('computeReconciliationPct', () => {
  it('returns 100 when both are 0 (perfectly reconciled)', () => {
    expect(computeReconciliationPct(0, 0)).toBe(100)
  })

  it('returns 100 when book equals bank', () => {
    expect(computeReconciliationPct(10000, 10000)).toBe(100)
  })

  it('computes correct pct for a 10% discrepancy', () => {
    // book=1000, bank=900, discrepancy=100, denom=1000 → (1 - 100/1000)*100 = 90
    expect(computeReconciliationPct(1000, 900)).toBe(90)
  })

  it('uses larger of the two as denominator', () => {
    // book=900, bank=1000, discrepancy=100, denom=1000 → 90
    expect(computeReconciliationPct(900, 1000)).toBe(90)
  })

  it('returns 0 when discrepancy equals the larger value', () => {
    // book=1000, bank=0, discrepancy=1000, denom=1000 → 0
    expect(computeReconciliationPct(1000, 0)).toBe(0)
  })

  it('returns near 100 for a tiny discrepancy', () => {
    // book=10000, bank=9999, discrepancy=1, denom=10000 → 99.99
    expect(computeReconciliationPct(10000, 9999)).toBe(99.99)
  })

  it('never returns below 0', () => {
    expect(computeReconciliationPct(0, 10000)).toBeGreaterThanOrEqual(0)
  })
})

// ── buildReconciliationLine ───────────────────────────────────────────────────

describe('buildReconciliationLine', () => {
  it('builds a correct line when book equals bank (is_reconciled = true)', () => {
    const line = buildReconciliationLine('Akbank', 50000, 50000)
    expect(line.account_name).toBe('Akbank')
    expect(line.book_balance_try).toBe(50000)
    expect(line.bank_balance_try).toBe(50000)
    expect(line.discrepancy_try).toBe(0)
    expect(line.discrepancy_severity).toBe('clean')
    expect(line.reconciliation_pct).toBe(100)
    expect(line.is_reconciled).toBe(true)
  })

  it('sets is_reconciled = false when discrepancy is material', () => {
    const line = buildReconciliationLine('Garanti', 100000, 50000)
    expect(line.discrepancy_try).toBe(50000)
    expect(line.discrepancy_severity).toBe('material')
    expect(line.is_reconciled).toBe(false)
  })

  it('sets is_reconciled = false for minor discrepancy', () => {
    const line = buildReconciliationLine('Ziraat', 10000, 9500)
    expect(line.discrepancy_severity).toBe('minor')
    expect(line.is_reconciled).toBe(false)
  })

  it('populates reconciliation_pct correctly', () => {
    // book=10000, bank=9000, discrepancy=1000, denom=10000 → 90
    const line = buildReconciliationLine('İşbank', 10000, 9000)
    expect(line.reconciliation_pct).toBe(90)
  })

  it('handles zero balances — perfectly reconciled', () => {
    const line = buildReconciliationLine('Genel Kasa', 0, 0)
    expect(line.is_reconciled).toBe(true)
    expect(line.reconciliation_pct).toBe(100)
    expect(line.discrepancy_try).toBe(0)
  })
})
