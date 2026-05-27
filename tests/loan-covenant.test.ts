/**
 * Loan Covenant Service — pure-logic unit tests
 *
 * Tests for computeDsr, computeInterestCoverage, classifyDsrStatus,
 * classifyIcrStatus, and computeCovenantRiskScore.
 *
 * Run: npx vitest run tests/loan-covenant.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  computeDsr,
  computeInterestCoverage,
  classifyDsrStatus,
  classifyIcrStatus,
  computeCovenantRiskScore,
} from '../lib/services/pcle/loan-covenant.service'

// ── computeDsr ────────────────────────────────────────────────────────────────

describe('computeDsr', () => {
  it('normal case: returns ratio of debt service to net income', () => {
    // 100_000 / 500_000 = 0.20
    const result = computeDsr(100_000, 500_000)
    expect(result).toBeCloseTo(0.2, 4)
  })

  it('returns null when net_income is zero', () => {
    expect(computeDsr(100_000, 0)).toBeNull()
  })

  it('high DSR case: 400_000 / 500_000 = 0.80', () => {
    expect(computeDsr(400_000, 500_000)).toBeCloseTo(0.8, 4)
  })

  it('low DSR case: small debt service relative to income', () => {
    // 10_000 / 1_000_000 = 0.01
    expect(computeDsr(10_000, 1_000_000)).toBeCloseTo(0.01, 4)
  })
})

// ── computeInterestCoverage ───────────────────────────────────────────────────

describe('computeInterestCoverage', () => {
  it('normal case: ebitda 3x interest gives ICR = 3.0', () => {
    expect(computeInterestCoverage(300_000, 100_000)).toBeCloseTo(3.0, 4)
  })

  it('returns null when interest_expense is zero', () => {
    expect(computeInterestCoverage(500_000, 0)).toBeNull()
  })

  it('ICR below 1: ebitda < interest expense', () => {
    // 80_000 / 100_000 = 0.80
    expect(computeInterestCoverage(80_000, 100_000)).toBeCloseTo(0.8, 4)
  })

  it('strong ICR: 10x ratio', () => {
    expect(computeInterestCoverage(1_000_000, 100_000)).toBeCloseTo(10.0, 4)
  })
})

// ── classifyDsrStatus ─────────────────────────────────────────────────────────

describe('classifyDsrStatus', () => {
  it('null → unknown', () => {
    expect(classifyDsrStatus(null)).toBe('unknown')
  })

  it('0.0 → healthy', () => {
    expect(classifyDsrStatus(0.0)).toBe('healthy')
  })

  it('0.20 → healthy (below 0.30)', () => {
    expect(classifyDsrStatus(0.20)).toBe('healthy')
  })

  it('boundary 0.30 → elevated (not healthy)', () => {
    expect(classifyDsrStatus(0.30)).toBe('elevated')
  })

  it('0.40 → elevated', () => {
    expect(classifyDsrStatus(0.40)).toBe('elevated')
  })

  it('boundary 0.50 → high (not elevated)', () => {
    expect(classifyDsrStatus(0.50)).toBe('high')
  })

  it('0.60 → high', () => {
    expect(classifyDsrStatus(0.60)).toBe('high')
  })

  it('boundary 0.70 → critical (not high)', () => {
    expect(classifyDsrStatus(0.70)).toBe('critical')
  })

  it('0.90 → critical', () => {
    expect(classifyDsrStatus(0.90)).toBe('critical')
  })
})

// ── classifyIcrStatus ─────────────────────────────────────────────────────────

describe('classifyIcrStatus', () => {
  it('null → unknown', () => {
    expect(classifyIcrStatus(null)).toBe('unknown')
  })

  it('0.5 → breached (below 1.0)', () => {
    expect(classifyIcrStatus(0.5)).toBe('breached')
  })

  it('boundary 1.0 → thin (not breached)', () => {
    expect(classifyIcrStatus(1.0)).toBe('thin')
  })

  it('1.5 → thin', () => {
    expect(classifyIcrStatus(1.5)).toBe('thin')
  })

  it('boundary 2.0 → adequate (not thin)', () => {
    expect(classifyIcrStatus(2.0)).toBe('adequate')
  })

  it('2.5 → adequate', () => {
    expect(classifyIcrStatus(2.5)).toBe('adequate')
  })

  it('boundary 3.0 → adequate (not strong; > 3.0 is strong)', () => {
    expect(classifyIcrStatus(3.0)).toBe('adequate')
  })

  it('3.01 → strong', () => {
    expect(classifyIcrStatus(3.01)).toBe('strong')
  })

  it('5.0 → strong', () => {
    expect(classifyIcrStatus(5.0)).toBe('strong')
  })
})

// ── computeCovenantRiskScore ──────────────────────────────────────────────────

describe('computeCovenantRiskScore', () => {
  it('best case: healthy DSR + strong ICR → 0 risk', () => {
    expect(computeCovenantRiskScore('healthy', 'strong')).toBe(0)
  })

  it('worst case: critical DSR + breached ICR → 100 risk', () => {
    expect(computeCovenantRiskScore('critical', 'breached')).toBe(100)
  })

  it('elevated DSR + adequate ICR → 50% × 25 + 50% × 20 = 22.5', () => {
    expect(computeCovenantRiskScore('elevated', 'adequate')).toBeCloseTo(22.5, 2)
  })

  it('high DSR + thin ICR → 50% × 65 + 50% × 60 = 62.5', () => {
    expect(computeCovenantRiskScore('high', 'thin')).toBeCloseTo(62.5, 2)
  })

  it('unknown DSR + unknown ICR → 50% × 50 + 50% × 50 = 50', () => {
    expect(computeCovenantRiskScore('unknown', 'unknown')).toBeCloseTo(50, 2)
  })

  it('healthy DSR + breached ICR → 50% × 0 + 50% × 100 = 50', () => {
    expect(computeCovenantRiskScore('healthy', 'breached')).toBeCloseTo(50, 2)
  })

  it('critical DSR + strong ICR → 50% × 100 + 50% × 0 = 50', () => {
    expect(computeCovenantRiskScore('critical', 'strong')).toBeCloseTo(50, 2)
  })

  it('elevated DSR + strong ICR → 50% × 25 + 50% × 0 = 12.5', () => {
    expect(computeCovenantRiskScore('elevated', 'strong')).toBeCloseTo(12.5, 2)
  })

  it('healthy DSR + thin ICR → 50% × 0 + 50% × 60 = 30', () => {
    expect(computeCovenantRiskScore('healthy', 'thin')).toBeCloseTo(30, 2)
  })

  it('unknown DSR + breached ICR → 50% × 50 + 50% × 100 = 75', () => {
    expect(computeCovenantRiskScore('unknown', 'breached')).toBeCloseTo(75, 2)
  })
})
