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

  it('handles very large amounts', () => {
    expect(computeDiscrepancy(10_000_000, 9_999_000)).toBe(1000)
  })

  it('returns exact negative when gl is zero and ops positive', () => {
    expect(computeDiscrepancy(0, 1000)).toBe(-1000)
  })

  it('returns positive when gl large and ops small', () => {
    expect(computeDiscrepancy(5000, 0)).toBe(5000)
  })

  it('handles negative gl value (contra accounts)', () => {
    expect(computeDiscrepancy(-100, 50)).toBe(-150)
  })

  it('handles negative ops value', () => {
    expect(computeDiscrepancy(100, -50)).toBe(150)
  })

  it('floating point: 100.01 - 100.00 ≈ 0.01', () => {
    const result = computeDiscrepancy(100.01, 100.00)
    expect(result).toBeCloseTo(0.01, 5)
  })

  it('commutative test: computeDiscrepancy(a, b) = -computeDiscrepancy(b, a)', () => {
    const ab = computeDiscrepancy(300, 200)
    const ba = computeDiscrepancy(200, 300)
    expect(ab).toBe(100)
    expect(ba).toBe(-100)
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

  it('returns -75 when gl=50 and ops=200', () => {
    const pct = computeDiscrepancyPct(50, 200)
    expect(pct).toBeCloseTo(-75, 5)
  })

  it('very large pct when ops is tiny', () => {
    // gl=100, ops=1 → pct = (100-1)/1×100 = 9900
    const pct = computeDiscrepancyPct(100, 1)
    expect(pct).toBeCloseTo(9900)
  })

  it('result is in percentage points (not fraction)', () => {
    const pct = computeDiscrepancyPct(110, 100)
    expect(pct).toBeCloseTo(10)   // 10% not 0.1
  })

  it('handles floating-point ops', () => {
    // (0.11 - 0.10) / 0.10 × 100 = 10%
    const pct = computeDiscrepancyPct(0.11, 0.10)
    expect(pct).toBeCloseTo(10, 3)
  })

  it('exactly +200% when gl = 3 × ops', () => {
    // (300 - 100) / 100 × 100 = 200
    expect(computeDiscrepancyPct(300, 100)).toBeCloseTo(200)
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
    expect(assignReconciliationStatus(0, 0)).toBe<ReconciliationStatus>('balanced')
    expect(assignReconciliationStatus(0, 1000)).toBe<ReconciliationStatus>('balanced')
  })

  it("returns 'discrepancy' for discrepancy just above threshold", () => {
    expect(assignReconciliationStatus(100.01, 100)).toBe<ReconciliationStatus>('discrepancy')
  })

  it("returns 'balanced' for discrepancy just below threshold", () => {
    expect(assignReconciliationStatus(99.99, 100)).toBe<ReconciliationStatus>('balanced')
  })

  it("uses absolute value: -threshold equals threshold boundary", () => {
    expect(assignReconciliationStatus(-100, 100)).toBe<ReconciliationStatus>('balanced')
  })

  it("just outside negative boundary: -100.01 with threshold 100 → discrepancy", () => {
    expect(assignReconciliationStatus(-100.01, 100)).toBe<ReconciliationStatus>('discrepancy')
  })

  it("zero threshold: any non-zero discrepancy is a discrepancy", () => {
    expect(assignReconciliationStatus(0.01, 0)).toBe<ReconciliationStatus>('discrepancy')
    expect(assignReconciliationStatus(-0.01, 0)).toBe<ReconciliationStatus>('discrepancy')
  })

  it('produces one of 3 valid status values (not skipped from pure fn)', () => {
    const validValues: ReconciliationStatus[] = ['balanced', 'discrepancy', 'no_gl_data']
    expect(validValues).toContain(assignReconciliationStatus(50, 100))
    expect(validValues).toContain(assignReconciliationStatus(200, 100))
    expect(validValues).toContain(assignReconciliationStatus(null, 100))
  })

  it('handles very large discrepancy and threshold', () => {
    expect(assignReconciliationStatus(999_999, 1_000_000)).toBe<ReconciliationStatus>('balanced')
    expect(assignReconciliationStatus(1_000_001, 1_000_000)).toBe<ReconciliationStatus>('discrepancy')
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

  it('0 discrepancies with allBalanced=false → still shows 0', () => {
    const label = buildStatusLabel(false, 0)
    expect(label).toContain('0')
  })

  it('label is non-empty string for both branches', () => {
    expect(buildStatusLabel(true, 0).length).toBeGreaterThan(0)
    expect(buildStatusLabel(false, 3).length).toBeGreaterThan(0)
  })

  it('balanced label does not contain "Uyuşmazlık"', () => {
    const label = buildStatusLabel(true, 0)
    expect(label).not.toContain('Uyuşmazlık')
  })

  it('discrepancy label contains count at start', () => {
    const label = buildStatusLabel(false, 4)
    expect(label.startsWith('4')).toBe(true)
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

  it('imbalance of exactly 1 TRY is NOT balanced (< 1, not <= 1)', () => {
    const tb = makeTrialBalance(10_001, 10_000)
    expect(tb.is_balanced).toBe(false)
  })

  it('imbalance of 0.99 TRY IS balanced (< 1)', () => {
    const tb = makeTrialBalance(10_000.99, 10_000)
    expect(tb.is_balanced).toBe(true)
  })

  it('large equal amounts are balanced', () => {
    const tb = makeTrialBalance(1_000_000, 1_000_000)
    expect(tb.is_balanced).toBe(true)
    expect(tb.imbalance).toBe(0)
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

  it('null discrepancy propagates correctly through status chain', () => {
    const disc = computeDiscrepancy(null, 100)
    const status = assignReconciliationStatus(disc, 100)
    expect(disc).toBeNull()
    expect(status).toBe('no_gl_data')
  })

  it('balanced when both gl and ops are large equal values', () => {
    const disc = computeDiscrepancy(999_999, 999_999)
    const status = assignReconciliationStatus(disc, 100)
    expect(disc).toBe(0)
    expect(status).toBe('balanced')
  })

  it('discrepancy pct with null ops returns null', () => {
    expect(computeDiscrepancyPct(100, 0)).toBeNull()
  })

  it('buildStatusLabel with large discrepancy count', () => {
    const label = buildStatusLabel(false, 100)
    expect(label).toContain('100')
  })

  it('computeDiscrepancy handles decimal rounding edge', () => {
    // JavaScript floating point: 0.1 + 0.2 = 0.30000000000000004
    const result = computeDiscrepancy(0.3, 0.1 + 0.2)
    // Should be extremely close to 0 (floating point rounding)
    expect(Math.abs(result!)).toBeLessThan(1e-10)
  })
})

// ── Integration-style: chaining pure functions ────────────────────────────────

describe('Chaining pure functions for a full reconciliation item', () => {
  function buildReconciliationItem(
    glAmount: number | null,
    opsAmount: number | null,
    threshold: number,
  ) {
    const disc    = computeDiscrepancy(glAmount, opsAmount)
    const discPct = glAmount !== null && opsAmount !== null && opsAmount !== 0
      ? computeDiscrepancyPct(glAmount, opsAmount)
      : null
    const status  = assignReconciliationStatus(disc, threshold)
    return { discrepancy: disc, discrepancy_pct: discPct, status }
  }

  it('balanced item: gl ≈ ops within threshold', () => {
    const item = buildReconciliationItem(1000, 990, 100)
    expect(item.status).toBe('balanced')
    expect(item.discrepancy).toBe(10)
    expect(item.discrepancy_pct).toBeCloseTo(1.01, 1)
  })

  it('discrepancy item: gl differs from ops by > threshold', () => {
    const item = buildReconciliationItem(1500, 1000, 100)
    expect(item.status).toBe('discrepancy')
    expect(item.discrepancy).toBe(500)
    expect(item.discrepancy_pct).toBe(50)
  })

  it('no_gl_data item: gl is null', () => {
    const item = buildReconciliationItem(null, 1000, 100)
    expect(item.status).toBe('no_gl_data')
    expect(item.discrepancy).toBeNull()
    expect(item.discrepancy_pct).toBeNull()
  })

  it('summary label reflects discrepancy count correctly', () => {
    const items = [
      buildReconciliationItem(1000, 990, 100),   // balanced
      buildReconciliationItem(2000, 1000, 100),  // discrepancy
      buildReconciliationItem(null, 500, 100),   // no_gl_data
    ]
    const discCount = items.filter(i => i.status === 'discrepancy').length
    const allBalanced = items.every(i => i.status === 'balanced')
    const label = buildStatusLabel(allBalanced, discCount)
    expect(discCount).toBe(1)
    expect(allBalanced).toBe(false)
    expect(label).toContain('1')
  })
})

// ── computeDiscrepancy — null input handling ───────────────────────────────────

describe('computeDiscrepancy — null input handling', () => {
  it('null gl returns null', () => {
    expect(computeDiscrepancy(null, 500)).toBeNull()
  })

  it('null ops returns null', () => {
    expect(computeDiscrepancy(200, null)).toBeNull()
  })

  it('both null returns null', () => {
    expect(computeDiscrepancy(null, null)).toBeNull()
  })

  it('zero discrepancy when both equal', () => {
    expect(computeDiscrepancy(1000, 1000)).toBe(0)
  })

  it('large positive discrepancy when gl >> ops', () => {
    expect(computeDiscrepancy(1_000_000, 100)).toBe(999_900)
  })

  it('large negative discrepancy when ops >> gl', () => {
    expect(computeDiscrepancy(0, 1_000_000)).toBe(-1_000_000)
  })

  it('fractional values handled correctly', () => {
    expect(computeDiscrepancy(100.5, 100.0)).toBeCloseTo(0.5, 5)
  })

  it('negative gl and positive ops', () => {
    expect(computeDiscrepancy(-500, 500)).toBe(-1000)
  })
})

// ── computeDiscrepancyPct — formula verification ───────────────────────────────

describe('computeDiscrepancyPct — formula (gl - ops) / |ops| × 100', () => {
  it('returns null when ops is 0', () => {
    expect(computeDiscrepancyPct(100, 0)).toBeNull()
  })

  it('returns 0 when gl === ops', () => {
    expect(computeDiscrepancyPct(500, 500)).toBe(0)
  })

  it('+10% when gl is 110% of ops', () => {
    expect(computeDiscrepancyPct(110, 100)).toBeCloseTo(10, 5)
  })

  it('-10% when gl is 90% of ops', () => {
    expect(computeDiscrepancyPct(90, 100)).toBeCloseTo(-10, 5)
  })

  it('+100% when gl is twice ops', () => {
    expect(computeDiscrepancyPct(200, 100)).toBeCloseTo(100, 5)
  })

  it('-100% when gl is 0 and ops is positive', () => {
    expect(computeDiscrepancyPct(0, 100)).toBeCloseTo(-100, 5)
  })

  it('uses absolute value of ops for negative ops', () => {
    // (100 - (-100)) / 100 × 100 = 200
    expect(computeDiscrepancyPct(100, -100)).toBeCloseTo(200, 5)
  })

  it('very small ops causes very large pct', () => {
    const pct = computeDiscrepancyPct(1000, 1)
    expect(pct).toBeCloseTo(99900, 0)
  })

  it('result is in percentage units not fraction', () => {
    const pct = computeDiscrepancyPct(105, 100)
    expect(pct).toBeCloseTo(5, 1)
    expect(pct!).toBeGreaterThan(1)  // definitely not 0.05
  })

  it('symmetric: pct(gl, ops) = -pct(ops, gl) when magnitudes equal', () => {
    const pct1 = computeDiscrepancyPct(120, 100)
    const pct2 = computeDiscrepancyPct(100, 120)
    expect(pct1).toBeCloseTo(20, 5)
    expect(pct2).toBeCloseTo(-100 * 20 / 120, 5)
  })
})

// ── assignReconciliationStatus — threshold levels ─────────────────────────────

describe('assignReconciliationStatus — all threshold levels', () => {
  it('null discrepancy → no_gl_data', () => {
    expect(assignReconciliationStatus(null, 100)).toBe('no_gl_data')
  })

  it('discrepancy of 0 → balanced (regardless of threshold)', () => {
    expect(assignReconciliationStatus(0, 100)).toBe('balanced')
    expect(assignReconciliationStatus(0, 0)).toBe('balanced')
  })

  it('discrepancy exactly at threshold → balanced (≤ threshold)', () => {
    expect(assignReconciliationStatus(100, 100)).toBe('balanced')
    expect(assignReconciliationStatus(-100, 100)).toBe('balanced')
  })

  it('discrepancy one unit above threshold → discrepancy', () => {
    expect(assignReconciliationStatus(101, 100)).toBe('discrepancy')
    expect(assignReconciliationStatus(-101, 100)).toBe('discrepancy')
  })

  it('very large threshold: even large discrepancy is balanced', () => {
    expect(assignReconciliationStatus(999_998, 1_000_000)).toBe('balanced')
  })

  it('very large discrepancy beyond very large threshold → discrepancy', () => {
    expect(assignReconciliationStatus(1_000_001, 1_000_000)).toBe('discrepancy')
  })

  it('threshold 500 (cash threshold): 499 → balanced, 501 → discrepancy', () => {
    expect(assignReconciliationStatus(499, 500)).toBe('balanced')
    expect(assignReconciliationStatus(501, 500)).toBe('discrepancy')
  })

  it('never returns "skipped" from pure function call', () => {
    const result = assignReconciliationStatus(50, 100)
    expect(result).not.toBe('skipped')
  })
})

// ── buildStatusLabel — all combinations ──────────────────────────────────────

describe('buildStatusLabel — all combinations of allBalanced + discrepancyCount', () => {
  it('allBalanced=true, count=0 → "Dengeli"', () => {
    expect(buildStatusLabel(true, 0)).toBe('Dengeli')
  })

  it('allBalanced=true, count=1 → "Dengeli" (count ignored when balanced)', () => {
    expect(buildStatusLabel(true, 1)).toBe('Dengeli')
  })

  it('allBalanced=true, count=99 → "Dengeli" (count ignored)', () => {
    expect(buildStatusLabel(true, 99)).toBe('Dengeli')
  })

  it('allBalanced=false, count=0 → contains "0 Uyuşmazlık"', () => {
    const label = buildStatusLabel(false, 0)
    expect(label).toContain('0')
    expect(label).toContain('Uyuşmazlık')
  })

  it('allBalanced=false, count=1 → contains "1 Uyuşmazlık"', () => {
    const label = buildStatusLabel(false, 1)
    expect(label).toContain('1')
    expect(label).toContain('Uyuşmazlık')
  })

  it('allBalanced=false, count=2 → contains "2 Uyuşmazlık"', () => {
    const label = buildStatusLabel(false, 2)
    expect(label).toContain('2')
    expect(label).toContain('Uyuşmazlık')
  })

  it('allBalanced=false, count=4 → contains "4 Uyuşmazlık"', () => {
    const label = buildStatusLabel(false, 4)
    expect(label).toContain('4')
  })

  it('"Dengeli" label does not mention Uyuşmazlık', () => {
    const label = buildStatusLabel(true, 0)
    expect(label).not.toContain('Uyuşmazlık')
  })

  it('discrepancy label is non-empty string', () => {
    expect(buildStatusLabel(false, 3).length).toBeGreaterThan(0)
  })

  it('balanced label is non-empty string', () => {
    expect(buildStatusLabel(true, 0).length).toBeGreaterThan(0)
  })
})
