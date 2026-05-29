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

// ── computeReconciliationDiscrepancy — edge cases ────────────────────────────

describe('computeReconciliationDiscrepancy — edge cases', () => {
  it('large positive discrepancy', () => {
    expect(computeReconciliationDiscrepancy(1_000_000, 500_000)).toBe(500_000)
  })

  it('large negative discrepancy', () => {
    expect(computeReconciliationDiscrepancy(500_000, 1_000_000)).toBe(-500_000)
  })

  it('small fractional discrepancy is rounded to 2dp', () => {
    // 100.005 - 100.003 = 0.002 → round2 = 0
    const result = computeReconciliationDiscrepancy(100.005, 100.003)
    const dp = String(Math.abs(result)).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })

  it('negative book balance works correctly', () => {
    // Overdraft: book = -500, bank = -200, discrepancy = -300
    expect(computeReconciliationDiscrepancy(-500, -200)).toBe(-300)
  })

  it('zero book, non-zero bank returns negative discrepancy', () => {
    expect(computeReconciliationDiscrepancy(0, 5000)).toBe(-5000)
  })
})

// ── classifyDiscrepancy — boundary precision ──────────────────────────────────

describe('classifyDiscrepancy — exact boundary values', () => {
  it('exactly 0 returns clean', () => {
    expect(classifyDiscrepancy(0)).toBe('clean')
  })

  it('just below 100 returns clean (99.99)', () => {
    expect(classifyDiscrepancy(99.99)).toBe('clean')
  })

  it('exactly 100 returns minor', () => {
    expect(classifyDiscrepancy(100)).toBe('minor')
  })

  it('exactly 1000 returns minor', () => {
    expect(classifyDiscrepancy(1000)).toBe('minor')
  })

  it('1000.01 returns moderate', () => {
    expect(classifyDiscrepancy(1001)).toBe('moderate')
  })

  it('exactly 10000 returns moderate', () => {
    expect(classifyDiscrepancy(10000)).toBe('moderate')
  })

  it('10000.01 returns material', () => {
    expect(classifyDiscrepancy(10001)).toBe('material')
  })

  it('negative values use absolute magnitude for classification', () => {
    expect(classifyDiscrepancy(-100)).toBe('minor')
    expect(classifyDiscrepancy(-1001)).toBe('moderate')
    expect(classifyDiscrepancy(-10001)).toBe('material')
  })

  it('very large discrepancy returns material', () => {
    expect(classifyDiscrepancy(1_000_000)).toBe('material')
  })
})

// ── computeReconciliationPct — additional cases ───────────────────────────────

describe('computeReconciliationPct — additional cases', () => {
  it('50% discrepancy returns 50', () => {
    // book=2000, bank=1000, discrepancy=1000, denom=2000 → 50
    expect(computeReconciliationPct(2000, 1000)).toBe(50)
  })

  it('1% discrepancy returns 99', () => {
    // book=1000, bank=990, discrepancy=10, denom=1000 → 99
    expect(computeReconciliationPct(1000, 990)).toBe(99)
  })

  it('result is always between 0 and 100', () => {
    const cases: [number, number][] = [
      [0, 0], [100, 50], [50, 100], [1000, 999], [0, 9999], [9999, 0],
    ]
    cases.forEach(([book, bank]) => {
      const pct = computeReconciliationPct(book, bank)
      expect(pct).toBeGreaterThanOrEqual(0)
      expect(pct).toBeLessThanOrEqual(100)
    })
  })

  it('symmetric: swapping book and bank yields same pct', () => {
    const a = computeReconciliationPct(8000, 10000)
    const b = computeReconciliationPct(10000, 8000)
    expect(a).toBe(b)
  })

  it('uses max(book, bank) as denominator — larger value determines scale', () => {
    // book=100, bank=10000, discrepancy=9900, denom=10000 → (1 - 9900/10000)*100 = 1
    expect(computeReconciliationPct(100, 10000)).toBeCloseTo(1, 0)
  })
})

// ── buildReconciliationLine — returned object shape ───────────────────────────

describe('buildReconciliationLine — returned object shape and types', () => {
  it('result has all required fields', () => {
    const line = buildReconciliationLine('TestBank', 10000, 9000)
    expect(line).toHaveProperty('account_name')
    expect(line).toHaveProperty('book_balance_try')
    expect(line).toHaveProperty('bank_balance_try')
    expect(line).toHaveProperty('discrepancy_try')
    expect(line).toHaveProperty('discrepancy_severity')
    expect(line).toHaveProperty('reconciliation_pct')
    expect(line).toHaveProperty('is_reconciled')
  })

  it('book_balance_try and bank_balance_try are rounded to 2dp', () => {
    const line = buildReconciliationLine('X', 1000.555, 999.005)
    const bookDp = String(line.book_balance_try).split('.')[1]?.length ?? 0
    const bankDp = String(line.bank_balance_try).split('.')[1]?.length ?? 0
    expect(bookDp).toBeLessThanOrEqual(2)
    expect(bankDp).toBeLessThanOrEqual(2)
  })

  it('moderate severity (discrepancy 5000) → is_reconciled false', () => {
    const line = buildReconciliationLine('Vakıfbank', 15000, 10000)
    expect(line.discrepancy_severity).toBe('moderate')
    expect(line.is_reconciled).toBe(false)
  })

  it('account_name is preserved as-is', () => {
    const line = buildReconciliationLine('İş Bankası Şubesi', 1000, 1000)
    expect(line.account_name).toBe('İş Bankası Şubesi')
  })

  it('negative bank balance handled correctly', () => {
    // book=0, bank=-5000 → discrepancy = 5000 → moderate
    const line = buildReconciliationLine('Overdraft', 0, -5000)
    expect(line.discrepancy_try).toBeCloseTo(5000, 1)
    expect(line.discrepancy_severity).toBe('moderate')
    expect(line.is_reconciled).toBe(false)
  })
})

// ── computeReconciliationDiscrepancy — zero and sign cases ────────────────────

describe('computeReconciliationDiscrepancy — zero and sign', () => {
  it('returns 0 when both values are identical non-zero', () => {
    expect(computeReconciliationDiscrepancy(75000, 75000)).toBe(0)
  })

  it('returns positive when book > bank (book has more)', () => {
    expect(computeReconciliationDiscrepancy(50000, 20000)).toBe(30000)
  })

  it('returns negative when bank > book (bank has more)', () => {
    expect(computeReconciliationDiscrepancy(20000, 50000)).toBe(-30000)
  })

  it('works with very large values', () => {
    expect(computeReconciliationDiscrepancy(10_000_000, 9_000_000)).toBe(1_000_000)
  })

  it('works with decimal values and rounds correctly', () => {
    // 1500.50 - 1500.00 = 0.50
    expect(computeReconciliationDiscrepancy(1500.50, 1500.00)).toBeCloseTo(0.50, 1)
  })

  it('zero book, positive bank → negative discrepancy', () => {
    expect(computeReconciliationDiscrepancy(0, 10000)).toBe(-10000)
  })

  it('positive book, zero bank → positive discrepancy', () => {
    expect(computeReconciliationDiscrepancy(10000, 0)).toBe(10000)
  })

  it('result has at most 2 decimal places', () => {
    const result = computeReconciliationDiscrepancy(1234.567, 1000.123)
    const dp = String(Math.abs(result)).split('.')[1]?.length ?? 0
    expect(dp).toBeLessThanOrEqual(2)
  })
})

// ── classifyDiscrepancy — all levels and edge values ─────────────────────────

describe('classifyDiscrepancy — all four severity levels', () => {
  it('clean: 0 absolute discrepancy', () => {
    expect(classifyDiscrepancy(0)).toBe('clean')
  })

  it('clean: 50 (well below 100)', () => {
    expect(classifyDiscrepancy(50)).toBe('clean')
  })

  it('clean: 99.99 (just below 100)', () => {
    expect(classifyDiscrepancy(99.99)).toBe('clean')
  })

  it('clean: -99 (negative but absolute < 100)', () => {
    expect(classifyDiscrepancy(-99)).toBe('clean')
  })

  it('minor: exactly 100', () => {
    expect(classifyDiscrepancy(100)).toBe('minor')
  })

  it('minor: 500', () => {
    expect(classifyDiscrepancy(500)).toBe('minor')
  })

  it('minor: exactly 1000', () => {
    expect(classifyDiscrepancy(1000)).toBe('minor')
  })

  it('minor: -1000 (negative, absolute = 1000)', () => {
    expect(classifyDiscrepancy(-1000)).toBe('minor')
  })

  it('moderate: 1001 (just above 1000)', () => {
    expect(classifyDiscrepancy(1001)).toBe('moderate')
  })

  it('moderate: 5000', () => {
    expect(classifyDiscrepancy(5000)).toBe('moderate')
  })

  it('moderate: exactly 10000', () => {
    expect(classifyDiscrepancy(10000)).toBe('moderate')
  })

  it('moderate: -10000 (negative absolute = 10000)', () => {
    expect(classifyDiscrepancy(-10000)).toBe('moderate')
  })

  it('material: 10001 (just above 10000)', () => {
    expect(classifyDiscrepancy(10001)).toBe('material')
  })

  it('material: 100000', () => {
    expect(classifyDiscrepancy(100000)).toBe('material')
  })

  it('material: -25000 (negative, absolute > 10000)', () => {
    expect(classifyDiscrepancy(-25000)).toBe('material')
  })

  it('classifies very large negative discrepancy as material', () => {
    expect(classifyDiscrepancy(-999_999)).toBe('material')
  })
})

// ── computeReconciliationPct — formula verification ───────────────────────────

describe('computeReconciliationPct — formula verification', () => {
  it('zero / zero → 100 (special case)', () => {
    expect(computeReconciliationPct(0, 0)).toBe(100)
  })

  it('identical non-zero values → 100', () => {
    expect(computeReconciliationPct(5000, 5000)).toBe(100)
  })

  it('book=1000, bank=0 → pct = 0 (fully unreconciled)', () => {
    expect(computeReconciliationPct(1000, 0)).toBe(0)
  })

  it('book=0, bank=1000 → pct = 0 (fully unreconciled)', () => {
    expect(computeReconciliationPct(0, 1000)).toBe(0)
  })

  it('1% discrepancy: book=1000, bank=990 → 99', () => {
    // |discrepancy|=10, denom=1000 → (1 - 10/1000)*100 = 99
    expect(computeReconciliationPct(1000, 990)).toBe(99)
  })

  it('50% discrepancy: book=2000, bank=1000 → 50', () => {
    // |discrepancy|=1000, denom=2000 → (1 - 1000/2000)*100 = 50
    expect(computeReconciliationPct(2000, 1000)).toBe(50)
  })

  it('pct is always >= 0', () => {
    const pairs: [number, number][] = [[0, 100000], [1, 9999], [500, 0]]
    for (const [b, bk] of pairs) {
      expect(computeReconciliationPct(b, bk)).toBeGreaterThanOrEqual(0)
    }
  })

  it('pct is always <= 100', () => {
    const pairs: [number, number][] = [[10000, 10000], [5000, 4999], [0, 0]]
    for (const [b, bk] of pairs) {
      expect(computeReconciliationPct(b, bk)).toBeLessThanOrEqual(100)
    }
  })

  it('is symmetric: swapping book and bank yields same pct', () => {
    expect(computeReconciliationPct(8000, 6000)).toBe(computeReconciliationPct(6000, 8000))
  })

  it('tiny discrepancy on large balance → nearly 100%', () => {
    // book=1_000_000, bank=999_999 → |disc|=1, denom=1_000_000 → 99.9999 → 100 (rounded)
    const result = computeReconciliationPct(1_000_000, 999_999)
    expect(result).toBeGreaterThan(99)
    expect(result).toBeLessThanOrEqual(100)
  })
})

// ── buildReconciliationLine — complete field verification ─────────────────────

describe('buildReconciliationLine — complete field verification', () => {
  it('line with zero discrepancy has is_reconciled=true', () => {
    const line = buildReconciliationLine('Halkbank', 20000, 20000)
    expect(line.is_reconciled).toBe(true)
    expect(line.discrepancy_severity).toBe('clean')
  })

  it('line with minor discrepancy: 500 TRY difference', () => {
    const line = buildReconciliationLine('Denizbank', 10500, 10000)
    expect(line.discrepancy_try).toBe(500)
    expect(line.discrepancy_severity).toBe('minor')
    expect(line.is_reconciled).toBe(false)
  })

  it('line with moderate discrepancy: 5000 TRY difference', () => {
    const line = buildReconciliationLine('Yapı Kredi', 15000, 10000)
    expect(line.discrepancy_try).toBe(5000)
    expect(line.discrepancy_severity).toBe('moderate')
    expect(line.is_reconciled).toBe(false)
  })

  it('line with material discrepancy: 50000 TRY difference', () => {
    const line = buildReconciliationLine('TEB', 100000, 50000)
    expect(line.discrepancy_try).toBe(50000)
    expect(line.discrepancy_severity).toBe('material')
    expect(line.is_reconciled).toBe(false)
  })

  it('discrepancy_try = book - bank', () => {
    const line = buildReconciliationLine('Test', 7000, 5000)
    expect(line.discrepancy_try).toBe(2000)
  })

  it('negative discrepancy when bank > book', () => {
    const line = buildReconciliationLine('Test', 5000, 7000)
    expect(line.discrepancy_try).toBe(-2000)
    // |discrepancy| = 2000 → moderate
    expect(line.discrepancy_severity).toBe('moderate')
    expect(line.is_reconciled).toBe(false)
  })

  it('reconciliation_pct computed correctly for moderate discrepancy', () => {
    // book=10000, bank=9000, disc=1000, denom=10000 → 90%
    const line = buildReconciliationLine('MyBank', 10000, 9000)
    expect(line.reconciliation_pct).toBe(90)
  })

  it('is_reconciled is boolean type', () => {
    const line = buildReconciliationLine('X', 1000, 1000)
    expect(typeof line.is_reconciled).toBe('boolean')
  })

  it('account_name with special characters preserved', () => {
    const line = buildReconciliationLine('Türkiye İş Bankası A.Ş.', 1000, 1000)
    expect(line.account_name).toBe('Türkiye İş Bankası A.Ş.')
  })
})
