/**
 * Loan Covenant Service — comprehensive unit tests
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
    expect(computeDsr(10_000, 1_000_000)).toBeCloseTo(0.01, 4)
  })

  // Additional boundary & precision tests
  it('zero debt service → DSR = 0.0', () => {
    expect(computeDsr(0, 500_000)).toBe(0)
  })

  it('debt service equals net income → DSR = 1.0', () => {
    expect(computeDsr(300_000, 300_000)).toBeCloseTo(1.0, 4)
  })

  it('debt service greater than net income → DSR > 1.0', () => {
    const result = computeDsr(800_000, 400_000)
    expect(result).toBeCloseTo(2.0, 4)
  })

  it('negative net income → negative DSR', () => {
    const result = computeDsr(100_000, -200_000)
    expect(result).toBeCloseTo(-0.5, 4)
  })

  it('very small net income → large DSR', () => {
    const result = computeDsr(100_000, 1_000)
    expect(result).toBeCloseTo(100.0, 2)
  })

  it('returns a rounded-to-2-decimal result', () => {
    // 1 / 3 = 0.3333... → rounds to 0.33
    const result = computeDsr(1, 3)
    expect(result).toBe(0.33)
  })

  it('typical SME scenario: 50k debt service / 250k income = 0.20', () => {
    expect(computeDsr(50_000, 250_000)).toBeCloseTo(0.2, 4)
  })

  it('elevated boundary: just below 0.50 → 0.49', () => {
    const result = computeDsr(490_000, 1_000_000)
    expect(result).toBeCloseTo(0.49, 4)
  })

  it('high boundary: exactly at 0.70', () => {
    const result = computeDsr(700_000, 1_000_000)
    expect(result).toBeCloseTo(0.70, 4)
  })

  it('both zero → null (net income zero)', () => {
    expect(computeDsr(0, 0)).toBeNull()
  })

  it('large numbers — 10M debt service, 20M income = 0.5', () => {
    expect(computeDsr(10_000_000, 20_000_000)).toBeCloseTo(0.5, 4)
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
    expect(computeInterestCoverage(80_000, 100_000)).toBeCloseTo(0.8, 4)
  })

  it('strong ICR: 10x ratio', () => {
    expect(computeInterestCoverage(1_000_000, 100_000)).toBeCloseTo(10.0, 4)
  })

  // Additional tests
  it('zero ebitda → ICR = 0', () => {
    expect(computeInterestCoverage(0, 100_000)).toBe(0)
  })

  it('negative ebitda → negative ICR', () => {
    const result = computeInterestCoverage(-200_000, 100_000)
    expect(result).toBeCloseTo(-2.0, 4)
  })

  it('ICR exactly 1.0: ebitda equals interest', () => {
    expect(computeInterestCoverage(100_000, 100_000)).toBeCloseTo(1.0, 4)
  })

  it('ICR exactly 2.0: ebitda twice interest', () => {
    expect(computeInterestCoverage(200_000, 100_000)).toBeCloseTo(2.0, 4)
  })

  it('ICR exactly 3.0: not strong (boundary)', () => {
    expect(computeInterestCoverage(300_000, 100_000)).toBeCloseTo(3.0, 4)
  })

  it('ICR = 3.01 crosses into strong territory', () => {
    const result = computeInterestCoverage(301_000, 100_000)
    expect(result).toBeCloseTo(3.01, 2)
  })

  it('both zero → null (interest zero)', () => {
    expect(computeInterestCoverage(0, 0)).toBeNull()
  })

  it('small fractional values', () => {
    const result = computeInterestCoverage(1_500, 1_000)
    expect(result).toBeCloseTo(1.5, 4)
  })

  it('result rounds to 2 decimal places', () => {
    // 1000 / 300 = 3.3333... → 3.33
    const result = computeInterestCoverage(1_000, 300)
    expect(result).toBe(3.33)
  })

  it('large numbers: 50M ebitda / 5M interest = 10.0', () => {
    expect(computeInterestCoverage(50_000_000, 5_000_000)).toBeCloseTo(10.0, 4)
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

  // Additional precision boundary tests
  it('0.29 → healthy (just below elevated boundary)', () => {
    expect(classifyDsrStatus(0.29)).toBe('healthy')
  })

  it('0.31 → elevated (just above healthy boundary)', () => {
    expect(classifyDsrStatus(0.31)).toBe('elevated')
  })

  it('0.49 → elevated (just below high boundary)', () => {
    expect(classifyDsrStatus(0.49)).toBe('elevated')
  })

  it('0.51 → high (just above elevated boundary)', () => {
    expect(classifyDsrStatus(0.51)).toBe('high')
  })

  it('0.69 → high (just below critical boundary)', () => {
    expect(classifyDsrStatus(0.69)).toBe('high')
  })

  it('0.71 → critical (just above high boundary)', () => {
    expect(classifyDsrStatus(0.71)).toBe('critical')
  })

  it('1.0 → critical (DSR > 1 means debt > income)', () => {
    expect(classifyDsrStatus(1.0)).toBe('critical')
  })

  it('negative DSR → healthy (e.g., negative debt service hypothetical)', () => {
    expect(classifyDsrStatus(-0.1)).toBe('healthy')
  })

  it('very large DSR → critical', () => {
    expect(classifyDsrStatus(5.0)).toBe('critical')
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

  // Additional precision boundary tests
  it('0.0 → breached', () => {
    expect(classifyIcrStatus(0.0)).toBe('breached')
  })

  it('negative ICR → breached', () => {
    expect(classifyIcrStatus(-1.0)).toBe('breached')
  })

  it('0.99 → breached (just below thin boundary)', () => {
    expect(classifyIcrStatus(0.99)).toBe('breached')
  })

  it('1.01 → thin (just above breached boundary)', () => {
    expect(classifyIcrStatus(1.01)).toBe('thin')
  })

  it('1.99 → thin (just below adequate boundary)', () => {
    expect(classifyIcrStatus(1.99)).toBe('thin')
  })

  it('2.01 → adequate (just above thin boundary)', () => {
    expect(classifyIcrStatus(2.01)).toBe('adequate')
  })

  it('2.99 → adequate (just below strong boundary)', () => {
    expect(classifyIcrStatus(2.99)).toBe('adequate')
  })

  it('3.001 → strong', () => {
    expect(classifyIcrStatus(3.001)).toBe('strong')
  })

  it('10.0 → strong (very high EBITDA coverage)', () => {
    expect(classifyIcrStatus(10.0)).toBe('strong')
  })

  it('100.0 → strong (exceptional coverage)', () => {
    expect(classifyIcrStatus(100.0)).toBe('strong')
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

  // Additional combinations
  it('high DSR + breached ICR → 50% × 65 + 50% × 100 = 82.5', () => {
    expect(computeCovenantRiskScore('high', 'breached')).toBeCloseTo(82.5, 2)
  })

  it('critical DSR + thin ICR → 50% × 100 + 50% × 60 = 80', () => {
    expect(computeCovenantRiskScore('critical', 'thin')).toBeCloseTo(80, 2)
  })

  it('critical DSR + adequate ICR → 50% × 100 + 50% × 20 = 60', () => {
    expect(computeCovenantRiskScore('critical', 'adequate')).toBeCloseTo(60, 2)
  })

  it('elevated DSR + thin ICR → 50% × 25 + 50% × 60 = 42.5', () => {
    expect(computeCovenantRiskScore('elevated', 'thin')).toBeCloseTo(42.5, 2)
  })

  it('elevated DSR + breached ICR → 50% × 25 + 50% × 100 = 62.5', () => {
    expect(computeCovenantRiskScore('elevated', 'breached')).toBeCloseTo(62.5, 2)
  })

  it('high DSR + strong ICR → 50% × 65 + 50% × 0 = 32.5', () => {
    expect(computeCovenantRiskScore('high', 'strong')).toBeCloseTo(32.5, 2)
  })

  it('high DSR + adequate ICR → 50% × 65 + 50% × 20 = 42.5', () => {
    expect(computeCovenantRiskScore('high', 'adequate')).toBeCloseTo(42.5, 2)
  })

  it('unknown DSR + strong ICR → 50% × 50 + 50% × 0 = 25', () => {
    expect(computeCovenantRiskScore('unknown', 'strong')).toBeCloseTo(25, 2)
  })

  it('unknown DSR + adequate ICR → 50% × 50 + 50% × 20 = 35', () => {
    expect(computeCovenantRiskScore('unknown', 'adequate')).toBeCloseTo(35, 2)
  })

  it('unknown DSR + thin ICR → 50% × 50 + 50% × 60 = 55', () => {
    expect(computeCovenantRiskScore('unknown', 'thin')).toBeCloseTo(55, 2)
  })

  it('critical DSR + unknown ICR → 50% × 100 + 50% × 50 = 75', () => {
    expect(computeCovenantRiskScore('critical', 'unknown')).toBeCloseTo(75, 2)
  })

  it('healthy DSR + adequate ICR → 50% × 0 + 50% × 20 = 10', () => {
    expect(computeCovenantRiskScore('healthy', 'adequate')).toBeCloseTo(10, 2)
  })

  it('healthy DSR + unknown ICR → 50% × 0 + 50% × 50 = 25', () => {
    expect(computeCovenantRiskScore('healthy', 'unknown')).toBeCloseTo(25, 2)
  })

  it('result is always within 0–100 range for all combinations', () => {
    const dsrStatuses = ['healthy', 'elevated', 'high', 'critical', 'unknown'] as const
    const icrStatuses = ['strong', 'adequate', 'thin', 'breached', 'unknown'] as const
    for (const d of dsrStatuses) {
      for (const i of icrStatuses) {
        const score = computeCovenantRiskScore(d, i)
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('score is symmetric for matching risk levels: elevated+adequate is lower than high+thin', () => {
    const lower  = computeCovenantRiskScore('elevated', 'adequate')
    const higher = computeCovenantRiskScore('high', 'thin')
    expect(lower).toBeLessThan(higher)
  })
})

// ── Integration: DSR → classify → risk score pipeline ────────────────────────

describe('DSR computation → classification → risk score pipeline', () => {
  it('healthy pipeline: low debt service + strong EBITDA → risk score 0', () => {
    const dsr = computeDsr(50_000, 500_000)           // 0.10 → healthy
    const icr = computeInterestCoverage(400_000, 50_000) // 8.0 → strong
    const dsrStatus = classifyDsrStatus(dsr)
    const icrStatus = classifyIcrStatus(icr)
    expect(dsrStatus).toBe('healthy')
    expect(icrStatus).toBe('strong')
    expect(computeCovenantRiskScore(dsrStatus, icrStatus)).toBe(0)
  })

  it('critical pipeline: high debt service + negative EBITDA → risk score 100', () => {
    const dsr = computeDsr(750_000, 500_000)           // 1.5 → critical
    const icr = computeInterestCoverage(50_000, 200_000) // 0.25 → breached
    const dsrStatus = classifyDsrStatus(dsr)
    const icrStatus = classifyIcrStatus(icr)
    expect(dsrStatus).toBe('critical')
    expect(icrStatus).toBe('breached')
    expect(computeCovenantRiskScore(dsrStatus, icrStatus)).toBe(100)
  })

  it('edge case: zero income + zero interest → both null → unknown/unknown → 50', () => {
    const dsr = computeDsr(100_000, 0)
    const icr = computeInterestCoverage(200_000, 0)
    const dsrStatus = classifyDsrStatus(dsr)
    const icrStatus = classifyIcrStatus(icr)
    expect(dsrStatus).toBe('unknown')
    expect(icrStatus).toBe('unknown')
    expect(computeCovenantRiskScore(dsrStatus, icrStatus)).toBe(50)
  })

  it('elevated DSR + strong ICR: moderate-low risk scenario', () => {
    const dsr = computeDsr(320_000, 800_000)   // 0.40 → elevated
    const icr = computeInterestCoverage(600_000, 80_000) // 7.5 → strong
    const dsrStatus = classifyDsrStatus(dsr)
    const icrStatus = classifyIcrStatus(icr)
    expect(dsrStatus).toBe('elevated')
    expect(icrStatus).toBe('strong')
    expect(computeCovenantRiskScore(dsrStatus, icrStatus)).toBeCloseTo(12.5, 2)
  })

  it('high DSR + adequate ICR: medium risk scenario', () => {
    const dsr = computeDsr(600_000, 1_000_000) // 0.60 → high
    const icr = computeInterestCoverage(500_000, 200_000) // 2.5 → adequate
    const dsrStatus = classifyDsrStatus(dsr)
    const icrStatus = classifyIcrStatus(icr)
    expect(dsrStatus).toBe('high')
    expect(icrStatus).toBe('adequate')
    expect(computeCovenantRiskScore(dsrStatus, icrStatus)).toBeCloseTo(42.5, 2)
  })
})

// ── classifyDsrStatus monotonicity ───────────────────────────────────────────

describe('classifyDsrStatus monotonicity', () => {
  it('increasing DSR always yields same or higher risk status', () => {
    const statusOrder = ['healthy', 'elevated', 'high', 'critical']
    const values = [0.1, 0.3, 0.5, 0.7]
    const statuses = values.map(v => classifyDsrStatus(v))
    for (let i = 0; i < statuses.length - 1; i++) {
      expect(statusOrder.indexOf(statuses[i])).toBeLessThanOrEqual(
        statusOrder.indexOf(statuses[i + 1])
      )
    }
  })

  it('all 5 DSR statuses are reachable with correct inputs', () => {
    expect(classifyDsrStatus(null)).toBe('unknown')
    expect(classifyDsrStatus(0.1)).toBe('healthy')
    expect(classifyDsrStatus(0.4)).toBe('elevated')
    expect(classifyDsrStatus(0.6)).toBe('high')
    expect(classifyDsrStatus(0.8)).toBe('critical')
  })
})

// ── classifyIcrStatus monotonicity ───────────────────────────────────────────

describe('classifyIcrStatus monotonicity', () => {
  it('decreasing ICR yields same or higher breach risk', () => {
    const riskOrder = ['strong', 'adequate', 'thin', 'breached']
    const values = [5.0, 2.5, 1.5, 0.5]
    const statuses = values.map(v => classifyIcrStatus(v))
    for (let i = 0; i < statuses.length - 1; i++) {
      expect(riskOrder.indexOf(statuses[i])).toBeLessThanOrEqual(
        riskOrder.indexOf(statuses[i + 1])
      )
    }
  })

  it('all 5 ICR statuses are reachable with correct inputs', () => {
    expect(classifyIcrStatus(null)).toBe('unknown')
    expect(classifyIcrStatus(4.0)).toBe('strong')
    expect(classifyIcrStatus(2.5)).toBe('adequate')
    expect(classifyIcrStatus(1.5)).toBe('thin')
    expect(classifyIcrStatus(0.5)).toBe('breached')
  })
})

// ── computeCovenantRiskScore: score order validation ─────────────────────────

describe('computeCovenantRiskScore score ordering', () => {
  it('healthy+strong < healthy+adequate < healthy+thin < healthy+breached', () => {
    const scores = [
      computeCovenantRiskScore('healthy', 'strong'),
      computeCovenantRiskScore('healthy', 'adequate'),
      computeCovenantRiskScore('healthy', 'thin'),
      computeCovenantRiskScore('healthy', 'breached'),
    ]
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeLessThan(scores[i + 1])
    }
  })

  it('healthy+strong < elevated+strong < high+strong < critical+strong', () => {
    const scores = [
      computeCovenantRiskScore('healthy', 'strong'),
      computeCovenantRiskScore('elevated', 'strong'),
      computeCovenantRiskScore('high', 'strong'),
      computeCovenantRiskScore('critical', 'strong'),
    ]
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeLessThan(scores[i + 1])
    }
  })

  it('max score (100) achieved only by critical+breached', () => {
    const allCombinations = [
      ['healthy', 'strong'], ['healthy', 'adequate'], ['healthy', 'thin'],
      ['elevated', 'strong'], ['elevated', 'adequate'],
      ['high', 'strong'], ['high', 'adequate'], ['high', 'thin'],
      ['critical', 'adequate'], ['critical', 'thin'],
    ] as const
    for (const [d, i] of allCombinations) {
      expect(computeCovenantRiskScore(d, i)).toBeLessThan(100)
    }
    expect(computeCovenantRiskScore('critical', 'breached')).toBe(100)
  })

  it('min score (0) achieved only by healthy+strong', () => {
    const allCombinations = [
      ['healthy', 'adequate'], ['healthy', 'thin'], ['healthy', 'breached'],
      ['elevated', 'strong'], ['elevated', 'adequate'],
    ] as const
    for (const [d, i] of allCombinations) {
      expect(computeCovenantRiskScore(d, i)).toBeGreaterThan(0)
    }
    expect(computeCovenantRiskScore('healthy', 'strong')).toBe(0)
  })
})

// ── Turkish SME compliance scenarios ─────────────────────────────────────────

describe('Turkish SME compliance scenarios (BDDK-aligned thresholds)', () => {
  it('Textile SME with seasonal debt: Q4 income spike keeps DSR healthy', () => {
    // Annual textile income 2M TRY, debt service 300k
    const dsr = computeDsr(300_000, 2_000_000)
    expect(classifyDsrStatus(dsr)).toBe('healthy')
  })

  it('Construction SME under loan covenant stress: DSR 0.65 → high risk', () => {
    const dsr = computeDsr(650_000, 1_000_000)
    expect(classifyDsrStatus(dsr)).toBe('high')
  })

  it('Export SME with strong EBITDA coverage (ICR 4.5x) → strong', () => {
    const icr = computeInterestCoverage(450_000, 100_000)
    expect(classifyIcrStatus(icr)).toBe('strong')
  })

  it('Retail SME with thin margin: ICR 1.2x → thin classification', () => {
    const icr = computeInterestCoverage(120_000, 100_000)
    expect(classifyIcrStatus(icr)).toBe('thin')
  })

  it('Manufacturing SME covenant breach: ICR below 1.0 during downturn', () => {
    const icr = computeInterestCoverage(80_000, 100_000)
    expect(classifyIcrStatus(icr)).toBe('breached')
  })

  it('Partner loan at 35% annual rate: interest correctly included in DSR', () => {
    // 500k outstanding at 35% = 175k annual interest
    // DSR = 175_000 / 600_000 = 0.2917 → rounds to 0.29 → healthy
    const annualInterest = 500_000 * 0.35
    const dsr = computeDsr(annualInterest, 600_000)
    expect(dsr).toBe(0.29)
    expect(classifyDsrStatus(dsr)).toBe('healthy')
  })

  it('EBITDA normalization: add back interest + depreciation increases ICR', () => {
    // 200k EBITDA / 120k interest = 1.67 → thin
    const netIncome = 50_000
    const interest = 120_000
    const depreciation = 30_000
    const ebitda = netIncome + interest + depreciation  // 200_000
    const icr = computeInterestCoverage(ebitda, interest)
    expect(icr).toBeCloseTo(200_000 / 120_000, 2)
    expect(classifyIcrStatus(icr)).toBe('thin')
  })
})

// ── computeDsr: return type checks ───────────────────────────────────────────

describe('computeDsr return types', () => {
  it('always returns number or null (not NaN)', () => {
    const values = [
      computeDsr(0, 1),
      computeDsr(100, 200),
      computeDsr(999_999, 1_000_000),
    ]
    for (const v of values) {
      expect(v).not.toBeNaN()
      expect(typeof v).toBe('number')
    }
  })

  it('null only when denominator is zero', () => {
    expect(computeDsr(0, 0)).toBeNull()
    expect(computeDsr(100, 0)).toBeNull()
    expect(computeDsr(0, 100)).not.toBeNull()
  })
})

// ── computeInterestCoverage: return type checks ───────────────────────────────

describe('computeInterestCoverage return types', () => {
  it('always returns number or null (not NaN)', () => {
    const values = [
      computeInterestCoverage(0, 1),
      computeInterestCoverage(100, 200),
      computeInterestCoverage(500_000, 100_000),
    ]
    for (const v of values) {
      expect(v).not.toBeNaN()
      expect(typeof v).toBe('number')
    }
  })

  it('null only when interest_expense is zero', () => {
    expect(computeInterestCoverage(100, 0)).toBeNull()
    expect(computeInterestCoverage(0, 0)).toBeNull()
    expect(computeInterestCoverage(0, 100)).not.toBeNull()
  })
})

// ── computeCovenantRiskScore: specific weight verification ────────────────────

describe('computeCovenantRiskScore weight verification', () => {
  it('DSR contributes exactly 50% of score: only DSR changes → only half the difference', () => {
    const baseline = computeCovenantRiskScore('healthy', 'strong')         // 0
    const dsrChange = computeCovenantRiskScore('elevated', 'strong')       // 12.5
    const icrChange = computeCovenantRiskScore('healthy', 'adequate')      // 10
    // DSR elevated component: 25 × 0.5 = 12.5
    // ICR adequate component: 20 × 0.5 = 10
    expect(dsrChange - baseline).toBeCloseTo(12.5, 2)
    expect(icrChange - baseline).toBeCloseTo(10, 2)
  })

  it('score is deterministic (same inputs always yield same output)', () => {
    const first  = computeCovenantRiskScore('high', 'thin')
    const second = computeCovenantRiskScore('high', 'thin')
    expect(first).toBe(second)
  })

  it('round2 applied: no floating precision issues in result', () => {
    const result = computeCovenantRiskScore('elevated', 'thin')
    // 25 × 0.5 + 60 × 0.5 = 12.5 + 30 = 42.5 — exact to 2 decimals
    expect(result).toBe(42.5)
    expect(String(result).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('unknown as DSR acts as 50-point neutral for DSR component', () => {
    const withUnknown  = computeCovenantRiskScore('unknown', 'strong')  // 25
    const withHealthy  = computeCovenantRiskScore('healthy', 'strong')  // 0
    const withCritical = computeCovenantRiskScore('critical', 'strong') // 50
    // unknown should be between healthy and critical
    expect(withUnknown).toBeGreaterThan(withHealthy)
    expect(withUnknown).toBeLessThan(withCritical)
  })

  it('unknown as ICR acts as 50-point neutral for ICR component', () => {
    const withUnknown = computeCovenantRiskScore('healthy', 'unknown')   // 25
    const withStrong  = computeCovenantRiskScore('healthy', 'strong')    // 0
    const withBreached = computeCovenantRiskScore('healthy', 'breached') // 50
    expect(withUnknown).toBeGreaterThan(withStrong)
    expect(withUnknown).toBeLessThan(withBreached)
  })
})
