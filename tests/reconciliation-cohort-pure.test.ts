/**
 * Pure function tests for:
 *   - lib/engines/reconciliation.engine.ts  (computeMatchRate, classifyReconciliationQuality,
 *                                             buildReconciliationStatus, classifyDiscrepancyType)
 *   - lib/services/commercial/cohort-analysis.service.ts  (buildCohortLabel,
 *                                                           extractRetentionDiagonal,
 *                                                           classifyCohortHealth)
 *
 * Run with: npx vitest run tests/reconciliation-cohort-pure.test.ts
 */

import { describe, it, expect } from 'vitest'

import {
  computeMatchRate,
  classifyReconciliationQuality,
  buildReconciliationStatus,
  classifyDiscrepancyType,
} from '../lib/engines/reconciliation.engine'

import {
  buildCohortLabel,
  extractRetentionDiagonal,
  classifyCohortHealth,
} from '../lib/services/commercial/cohort-analysis.service'

// ── computeMatchRate ──────────────────────────────────────────────────────────

describe('computeMatchRate', () => {
  it('returns 0 when total is 0', () => {
    expect(computeMatchRate(0, 0)).toBe(0)
  })

  it('returns 0 when matched is 0 and total > 0', () => {
    expect(computeMatchRate(0, 100)).toBe(0)
  })

  it('returns 100 when all matched', () => {
    expect(computeMatchRate(50, 50)).toBe(100)
  })

  it('returns 50 for half-matched', () => {
    expect(computeMatchRate(5, 10)).toBe(50)
  })

  it('returns a proportional value for arbitrary inputs', () => {
    expect(computeMatchRate(3, 4)).toBeCloseTo(75, 5)
  })

  it('handles non-integer match count', () => {
    expect(computeMatchRate(1, 3)).toBeCloseTo(33.333, 2)
  })

  it('ignores matched > total (no clamping)', () => {
    // The function is purely mathematical; clamping is caller responsibility
    expect(computeMatchRate(110, 100)).toBeCloseTo(110, 5)
  })
})

// ── classifyReconciliationQuality ─────────────────────────────────────────────

describe('classifyReconciliationQuality', () => {
  it('returns "complete" for 100', () => {
    expect(classifyReconciliationQuality(100)).toBe('complete')
  })

  it('returns "complete" for exactly 99', () => {
    expect(classifyReconciliationQuality(99)).toBe('complete')
  })

  it('returns "good" just below 99', () => {
    expect(classifyReconciliationQuality(98.9)).toBe('good')
  })

  it('returns "good" for exactly 95', () => {
    expect(classifyReconciliationQuality(95)).toBe('good')
  })

  it('returns "partial" just below 95', () => {
    expect(classifyReconciliationQuality(94.9)).toBe('partial')
  })

  it('returns "partial" for exactly 80', () => {
    expect(classifyReconciliationQuality(80)).toBe('partial')
  })

  it('returns "poor" just below 80', () => {
    expect(classifyReconciliationQuality(79.9)).toBe('poor')
  })

  it('returns "poor" for 0', () => {
    expect(classifyReconciliationQuality(0)).toBe('poor')
  })

  it('returns "poor" for 50', () => {
    expect(classifyReconciliationQuality(50)).toBe('poor')
  })
})

// ── buildReconciliationStatus ─────────────────────────────────────────────────

describe('buildReconciliationStatus', () => {
  it('formats a message with Turkish month name and integer rate', () => {
    const msg = buildReconciliationStatus(98, 3, '2025-04')
    expect(msg).toContain('Nisan')
    expect(msg).toContain('2025')
    expect(msg).toContain('%98')
    expect(msg).toContain('3 eşleşmeyen kayıt')
  })

  it('uses decimal with comma for fractional rate', () => {
    const msg = buildReconciliationStatus(98.5, 3, '2025-04')
    expect(msg).toMatch(/%98[,.]5/)
  })

  it('formats January correctly', () => {
    const msg = buildReconciliationStatus(100, 0, '2024-01')
    expect(msg).toContain('Ocak')
    expect(msg).toContain('2024')
  })

  it('formats December correctly', () => {
    const msg = buildReconciliationStatus(80, 10, '2023-12')
    expect(msg).toContain('Aralık')
    expect(msg).toContain('2023')
  })

  it('includes unmatched count of zero', () => {
    const msg = buildReconciliationStatus(100, 0, '2025-06')
    expect(msg).toContain('0 eşleşmeyen kayıt')
  })

  it('format includes the period label at start', () => {
    const msg = buildReconciliationStatus(95, 5, '2025-09')
    expect(msg.startsWith('Eylül 2025')).toBe(true)
  })
})

// ── classifyDiscrepancyType ───────────────────────────────────────────────────

describe('classifyDiscrepancyType', () => {
  it('returns "matched" when amounts are identical', () => {
    expect(classifyDiscrepancyType(1000, 1000)).toBe('matched')
  })

  it('returns "matched" when difference is less than 1', () => {
    expect(classifyDiscrepancyType(1000, 1000.5)).toBe('matched')
  })

  it('returns "timing" for small differences (100 TRY)', () => {
    expect(classifyDiscrepancyType(1000, 1100)).toBe('timing')
  })

  it('returns "timing" just below 5000 boundary', () => {
    expect(classifyDiscrepancyType(0, 4999)).toBe('timing')
  })

  it('returns "error" at exactly 5000', () => {
    expect(classifyDiscrepancyType(0, 5000)).toBe('error')
  })

  it('returns "error" for mid-range difference (20000)', () => {
    expect(classifyDiscrepancyType(100000, 120000)).toBe('error')
  })

  it('returns "error" just below 50000 boundary', () => {
    expect(classifyDiscrepancyType(0, 49999)).toBe('error')
  })

  it('returns "fraud_flag" at exactly 50000', () => {
    expect(classifyDiscrepancyType(0, 50000)).toBe('fraud_flag')
  })

  it('returns "fraud_flag" for very large difference', () => {
    expect(classifyDiscrepancyType(0, 1_000_000)).toBe('fraud_flag')
  })

  it('uses absolute value — negative direction also classified', () => {
    expect(classifyDiscrepancyType(5001, 1)).toBe('error')
  })
})

// ── buildCohortLabel ──────────────────────────────────────────────────────────

describe('buildCohortLabel', () => {
  it('formats January correctly', () => {
    expect(buildCohortLabel('2025-01')).toBe('Oca 2025 Kohortu')
  })

  it('formats April correctly', () => {
    expect(buildCohortLabel('2025-04')).toBe('Nis 2025 Kohortu')
  })

  it('formats December correctly', () => {
    expect(buildCohortLabel('2024-12')).toBe('Ara 2024 Kohortu')
  })

  it('includes "Kohortu" suffix', () => {
    const label = buildCohortLabel('2025-06')
    expect(label.endsWith('Kohortu')).toBe(true)
  })

  it('formats August correctly', () => {
    expect(buildCohortLabel('2023-08')).toBe('Ağu 2023 Kohortu')
  })
})

// ── extractRetentionDiagonal ──────────────────────────────────────────────────

describe('extractRetentionDiagonal', () => {
  it('returns last element of each cohort row', () => {
    const matrix = [[100, 80, 60], [100, 70], [100]]
    expect(extractRetentionDiagonal(matrix)).toEqual([60, 70, 100])
  })

  it('returns 0 for empty rows', () => {
    expect(extractRetentionDiagonal([[]])).toEqual([0])
  })

  it('handles mixed empty and non-empty rows', () => {
    const matrix = [[], [100, 50], [100]]
    expect(extractRetentionDiagonal(matrix)).toEqual([0, 50, 100])
  })

  it('returns empty array for empty matrix', () => {
    expect(extractRetentionDiagonal([])).toEqual([])
  })

  it('handles single-element rows', () => {
    expect(extractRetentionDiagonal([[42], [37]])).toEqual([42, 37])
  })
})

// ── classifyCohortHealth ──────────────────────────────────────────────────────

describe('classifyCohortHealth', () => {
  it('returns "strong" when avg > 60 and slope > 0', () => {
    expect(classifyCohortHealth(70, 1)).toBe('strong')
  })

  it('returns "strong" at avg=61 and positive slope', () => {
    expect(classifyCohortHealth(61, 0.1)).toBe('strong')
  })

  it('returns "stable" when avg > 60 but slope <= 0 (not strong)', () => {
    expect(classifyCohortHealth(65, 0)).toBe('stable')
  })

  it('returns "stable" when avg > 40 (mid range)', () => {
    expect(classifyCohortHealth(50, -1)).toBe('stable')
  })

  it('returns "stable" at exactly 41', () => {
    expect(classifyCohortHealth(41, 0)).toBe('stable')
  })

  it('returns "declining" when avg > 20 and slope < 0', () => {
    expect(classifyCohortHealth(30, -0.5)).toBe('declining')
  })

  it('returns "critical" when avg <= 20', () => {
    expect(classifyCohortHealth(20, -1)).toBe('critical')
  })

  it('returns "critical" when avg is 0', () => {
    expect(classifyCohortHealth(0, 0)).toBe('critical')
  })

  it('returns "critical" at exactly 20 regardless of slope', () => {
    expect(classifyCohortHealth(20, 5)).toBe('critical')
  })

  it('returns "critical" when avg is 21-40 and slope >= 0 (not strong/stable/declining)', () => {
    // avg=25 is not >40, slope=0 is not <0, avg is >20 but doesn't satisfy declining (needs slope<0)
    // => falls to critical
    expect(classifyCohortHealth(25, 0)).toBe('critical')
  })
})
