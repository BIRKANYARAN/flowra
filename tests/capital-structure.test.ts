/**
 * Capital Structure & Debt Capacity Analysis — unit tests
 *
 * Tests all pure computation functions exported from capital-structure.service.ts.
 * No DB or network calls — pure function tests only.
 *
 * Total: 50 tests
 */

import { describe, it, expect } from 'vitest'
import {
  computeDebtServiceCoverageRatio,
  classifyDscrHealth,
  computeDebtCapacity,
  computeHeadroomToMaxDebt,
  computeWeightedAverageCostOfDebt,
  computeWacc,
  computeLeverageCapacityScore,
  classifyCapitalStructureHealth,
  computePartnerLoanRiskPremium,
} from '../lib/services/finance/capital-structure.service'

// ── computeDebtServiceCoverageRatio ────────────────────────────────────────────

describe('computeDebtServiceCoverageRatio', () => {
  it('returns correct ratio for comfortable DSCR > 1.25', () => {
    // 2_000_000 / 1_000_000 = 2.0 → strong
    const dscr = computeDebtServiceCoverageRatio(2_000_000, 1_000_000)
    expect(dscr).toBeCloseTo(2.0, 5)
  })

  it('returns 1.0 exactly at break-even', () => {
    const dscr = computeDebtServiceCoverageRatio(500_000, 500_000)
    expect(dscr).toBeCloseTo(1.0, 5)
  })

  it('returns < 1.0 for distressed DSCR', () => {
    // 800_000 / 1_000_000 = 0.8
    const dscr = computeDebtServiceCoverageRatio(800_000, 1_000_000)
    expect(dscr).toBeCloseTo(0.8, 5)
    expect(dscr!).toBeLessThan(1.0)
  })

  it('returns null when annualDebtService is 0', () => {
    expect(computeDebtServiceCoverageRatio(1_000_000, 0)).toBeNull()
  })

  it('handles zero EBITDA (distressed)', () => {
    const dscr = computeDebtServiceCoverageRatio(0, 500_000)
    expect(dscr).toBe(0)
  })

  it('handles negative EBITDA (operating loss)', () => {
    const dscr = computeDebtServiceCoverageRatio(-200_000, 500_000)
    expect(dscr).toBeCloseTo(-0.4, 5)
  })

  it('returns 1.5 for DSCR between adequate thresholds', () => {
    const dscr = computeDebtServiceCoverageRatio(1_500_000, 1_000_000)
    expect(dscr).toBeCloseTo(1.5, 5)
  })
})

// ── classifyDscrHealth ─────────────────────────────────────────────────────────

describe('classifyDscrHealth', () => {
  it('returns insufficient_data for null dscr', () => {
    expect(classifyDscrHealth(null)).toBe('insufficient_data')
  })

  it('returns strong for dscr >= 2.0', () => {
    expect(classifyDscrHealth(2.0)).toBe('strong')
    expect(classifyDscrHealth(3.5)).toBe('strong')
    expect(classifyDscrHealth(10.0)).toBe('strong')
  })

  it('returns adequate for dscr >= 1.25 and < 2.0', () => {
    expect(classifyDscrHealth(1.25)).toBe('adequate')
    expect(classifyDscrHealth(1.5)).toBe('adequate')
    expect(classifyDscrHealth(1.99)).toBe('adequate')
  })

  it('returns tight for dscr >= 1.0 and < 1.25', () => {
    expect(classifyDscrHealth(1.0)).toBe('tight')
    expect(classifyDscrHealth(1.1)).toBe('tight')
    expect(classifyDscrHealth(1.249)).toBe('tight')
  })

  it('returns distressed for dscr < 1.0', () => {
    expect(classifyDscrHealth(0.99)).toBe('distressed')
    expect(classifyDscrHealth(0.5)).toBe('distressed')
    expect(classifyDscrHealth(0.0)).toBe('distressed')
    expect(classifyDscrHealth(-1.0)).toBe('distressed')
  })

  it('boundary 2.0 exactly is strong', () => {
    expect(classifyDscrHealth(2.0)).toBe('strong')
  })

  it('boundary 1.25 exactly is adequate', () => {
    expect(classifyDscrHealth(1.25)).toBe('adequate')
  })

  it('boundary 1.0 exactly is tight', () => {
    expect(classifyDscrHealth(1.0)).toBe('tight')
  })
})

// ── computeDebtCapacity ────────────────────────────────────────────────────────

describe('computeDebtCapacity', () => {
  it('returns correct multiples with defaults', () => {
    const result = computeDebtCapacity(1_000_000)
    expect(result.conservative).toBeCloseTo(2_000_000, 0)
    expect(result.optimal).toBeCloseTo(3_000_000, 0)
    expect(result.maximum).toBeCloseTo(4_000_000, 0)
  })

  it('conservative is always ebitda × 2.0', () => {
    const result = computeDebtCapacity(500_000)
    expect(result.conservative).toBeCloseTo(1_000_000, 0)
  })

  it('optimal uses custom targetDscrMultiple', () => {
    const result = computeDebtCapacity(1_000_000, 2.5)
    expect(result.optimal).toBeCloseTo(2_500_000, 0)
  })

  it('maximum uses custom maxLeverageRatio', () => {
    const result = computeDebtCapacity(1_000_000, 3.0, 5.0)
    expect(result.maximum).toBeCloseTo(5_000_000, 0)
  })

  it('all three values scale linearly with ebitda', () => {
    const r1 = computeDebtCapacity(1_000_000)
    const r2 = computeDebtCapacity(2_000_000)
    expect(r2.conservative).toBeCloseTo(r1.conservative * 2, 0)
    expect(r2.optimal).toBeCloseTo(r1.optimal * 2, 0)
    expect(r2.maximum).toBeCloseTo(r1.maximum * 2, 0)
  })

  it('handles zero ebitda (no debt capacity)', () => {
    const result = computeDebtCapacity(0)
    expect(result.conservative).toBe(0)
    expect(result.optimal).toBe(0)
    expect(result.maximum).toBe(0)
  })

  it('conservative < optimal < maximum with defaults', () => {
    const result = computeDebtCapacity(1_000_000)
    expect(result.conservative).toBeLessThan(result.optimal)
    expect(result.optimal).toBeLessThan(result.maximum)
  })
})

// ── computeHeadroomToMaxDebt ───────────────────────────────────────────────────

describe('computeHeadroomToMaxDebt', () => {
  it('returns positive headroom when under capacity', () => {
    const headroom = computeHeadroomToMaxDebt(1_000_000, 4_000_000)
    expect(headroom).toBeCloseTo(3_000_000, 0)
  })

  it('returns zero when exactly at max capacity', () => {
    expect(computeHeadroomToMaxDebt(4_000_000, 4_000_000)).toBe(0)
  })

  it('returns negative headroom when over-leveraged', () => {
    const headroom = computeHeadroomToMaxDebt(5_000_000, 4_000_000)
    expect(headroom).toBe(-1_000_000)
  })

  it('returns max capacity when no debt', () => {
    expect(computeHeadroomToMaxDebt(0, 4_000_000)).toBe(4_000_000)
  })
})

// ── computeWeightedAverageCostOfDebt ──────────────────────────────────────────

describe('computeWeightedAverageCostOfDebt', () => {
  it('returns null when total outstanding is 0', () => {
    expect(computeWeightedAverageCostOfDebt([])).toBeNull()
    expect(computeWeightedAverageCostOfDebt([{ outstanding: 0, annual_rate: 25 }])).toBeNull()
  })

  it('returns the rate directly for a single loan', () => {
    const wacd = computeWeightedAverageCostOfDebt([
      { outstanding: 1_000_000, annual_rate: 30 },
    ])
    expect(wacd).toBeCloseTo(30, 5)
  })

  it('computes correct weighted average for two equal-size loans', () => {
    // Equal outstanding → simple average
    const wacd = computeWeightedAverageCostOfDebt([
      { outstanding: 500_000, annual_rate: 20 },
      { outstanding: 500_000, annual_rate: 40 },
    ])
    expect(wacd).toBeCloseTo(30, 5)
  })

  it('weights larger loan more heavily', () => {
    // 3M at 20% + 1M at 40% → weighted avg = (60+40)/4 = 25
    const wacd = computeWeightedAverageCostOfDebt([
      { outstanding: 3_000_000, annual_rate: 20 },
      { outstanding: 1_000_000, annual_rate: 40 },
    ])
    expect(wacd).toBeCloseTo(25, 5)
  })

  it('handles multiple loans with different rates', () => {
    // 1M@10% + 1M@20% + 2M@30% = (10+20+60)/4 = 22.5
    const wacd = computeWeightedAverageCostOfDebt([
      { outstanding: 1_000_000, annual_rate: 10 },
      { outstanding: 1_000_000, annual_rate: 20 },
      { outstanding: 2_000_000, annual_rate: 30 },
    ])
    expect(wacd).toBeCloseTo(22.5, 5)
  })

  it('loans with zero outstanding do not contribute to average', () => {
    const wacd = computeWeightedAverageCostOfDebt([
      { outstanding: 1_000_000, annual_rate: 25 },
      { outstanding: 0,         annual_rate: 50 },
    ])
    expect(wacd).toBeCloseTo(25, 5)
  })
})

// ── computeWacc ────────────────────────────────────────────────────────────────

describe('computeWacc', () => {
  it('returns null when V (equity + debt) is 0', () => {
    expect(computeWacc(0, 0, 30, 25, 25)).toBeNull()
  })

  it('returns cost of equity when no debt', () => {
    // E=1M, D=0, Ke=30 → WACC = 30%
    const wacc = computeWacc(1_000_000, 0, 30, 25, 25)
    expect(wacc).toBeCloseTo(30, 5)
  })

  it('returns after-tax cost of debt when no equity', () => {
    // E=0, D=1M, Kd=25, T=25% → WACC = 25 × (1-0.25) = 18.75%
    const wacc = computeWacc(0, 1_000_000, 30, 25, 25)
    expect(wacc).toBeCloseTo(18.75, 5)
  })

  it('computes correct WACC for 50/50 equity/debt split', () => {
    // E=1M, D=1M, Ke=30, Kd=20, T=25
    // V=2M, E/V=0.5, D/V=0.5
    // WACC = 0.5×30 + 0.5×20×(1-0.25) = 15 + 7.5 = 22.5
    const wacc = computeWacc(1_000_000, 1_000_000, 30, 20, 25)
    expect(wacc).toBeCloseTo(22.5, 5)
  })

  it('uses default tax rate of 25% when not provided', () => {
    const waccDefault   = computeWacc(1_000_000, 1_000_000, 30, 20)
    const waccExplicit  = computeWacc(1_000_000, 1_000_000, 30, 20, 25)
    expect(waccDefault).toBeCloseTo(waccExplicit!, 5)
  })

  it('WACC is lower than cost of equity due to tax shield', () => {
    const wacc = computeWacc(2_000_000, 1_000_000, 30, 25, 25)
    // Should be less than 30% (cost of equity)
    expect(wacc!).toBeLessThan(30)
  })
})

// ── computeLeverageCapacityScore ──────────────────────────────────────────────

describe('computeLeverageCapacityScore', () => {
  it('returns 50 when all inputs are null', () => {
    const score = computeLeverageCapacityScore(null, null, null)
    // dscrRaw=50×0.40 + leverageRaw=50×0.35 + coverageRaw=50×0.25 = 50
    expect(score).toBeCloseTo(50, 1)
  })

  it('returns 100 for ideal ratios (DSCR=3, D/EBITDA=0, coverage=5)', () => {
    // dscr=3 → (3/3)×100=100×0.40=40
    // debtToEbitda=0 → (1-0/6)×100=100×0.35=35
    // interestCoverage=5 → (5/5)×100=100×0.25=25
    // total = 100
    const score = computeLeverageCapacityScore(3, 0, 5)
    expect(score).toBeCloseTo(100, 1)
  })

  it('clamps DSCR score at 100 for very high DSCR', () => {
    const score = computeLeverageCapacityScore(100, 0, 100)
    expect(score).toBeCloseTo(100, 1)
  })

  it('clamps DSCR score at 0 for zero DSCR', () => {
    // DSCR=0 → raw=0×0.40=0; others null → 50×0.35+50×0.25=30
    const score = computeLeverageCapacityScore(0, null, null)
    expect(score).toBeCloseTo(30, 1)
  })

  it('high debt/EBITDA reduces leverage score', () => {
    // debtToEbitda=6 → (1-6/6)×100=0; others ideal
    const score = computeLeverageCapacityScore(3, 6, 5)
    // 100×0.40 + 0×0.35 + 100×0.25 = 40+0+25 = 65
    expect(score).toBeCloseTo(65, 1)
  })

  it('rounds to 1 decimal', () => {
    const score = computeLeverageCapacityScore(1.5, 2, 2.5)
    const str = String(score)
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(1)
  })

  it('partial null inputs use 50 for missing dimension', () => {
    // DSCR=3, rest null
    // 100×0.40 + 50×0.35 + 50×0.25 = 40 + 17.5 + 12.5 = 70
    const score = computeLeverageCapacityScore(3, null, null)
    expect(score).toBeCloseTo(70, 1)
  })

  it('very high debtToEbitda clamps leverage component to 0', () => {
    const score = computeLeverageCapacityScore(null, 12, null)
    // debtToEbitda=12 → max(0, (1-12/6)×100)=max(0,-100)=0 → 0×0.35=0
    // others null → 50×0.40+50×0.25=32.5
    expect(score).toBeCloseTo(32.5, 1)
  })
})

// ── classifyCapitalStructureHealth ────────────────────────────────────────────

describe('classifyCapitalStructureHealth', () => {
  it('returns conservative for score >= 80', () => {
    expect(classifyCapitalStructureHealth(80)).toBe('conservative')
    expect(classifyCapitalStructureHealth(100)).toBe('conservative')
    expect(classifyCapitalStructureHealth(90)).toBe('conservative')
  })

  it('returns balanced for score >= 60 and < 80', () => {
    expect(classifyCapitalStructureHealth(60)).toBe('balanced')
    expect(classifyCapitalStructureHealth(79.9)).toBe('balanced')
    expect(classifyCapitalStructureHealth(70)).toBe('balanced')
  })

  it('returns leveraged for score >= 40 and < 60', () => {
    expect(classifyCapitalStructureHealth(40)).toBe('leveraged')
    expect(classifyCapitalStructureHealth(59.9)).toBe('leveraged')
    expect(classifyCapitalStructureHealth(50)).toBe('leveraged')
  })

  it('returns over_leveraged for score >= 20 and < 40', () => {
    expect(classifyCapitalStructureHealth(20)).toBe('over_leveraged')
    expect(classifyCapitalStructureHealth(39.9)).toBe('over_leveraged')
    expect(classifyCapitalStructureHealth(30)).toBe('over_leveraged')
  })

  it('returns critical for score < 20', () => {
    expect(classifyCapitalStructureHealth(19.9)).toBe('critical')
    expect(classifyCapitalStructureHealth(0)).toBe('critical')
    expect(classifyCapitalStructureHealth(10)).toBe('critical')
  })

  it('boundary 80 exactly is conservative', () => {
    expect(classifyCapitalStructureHealth(80)).toBe('conservative')
  })

  it('boundary 60 exactly is balanced', () => {
    expect(classifyCapitalStructureHealth(60)).toBe('balanced')
  })

  it('boundary 40 exactly is leveraged', () => {
    expect(classifyCapitalStructureHealth(40)).toBe('leveraged')
  })

  it('boundary 20 exactly is over_leveraged', () => {
    expect(classifyCapitalStructureHealth(20)).toBe('over_leveraged')
  })
})

// ── computePartnerLoanRiskPremium ─────────────────────────────────────────────

describe('computePartnerLoanRiskPremium', () => {
  it('returns null when totalDebt is 0', () => {
    expect(computePartnerLoanRiskPremium(0, 0, 25)).toBeNull()
    expect(computePartnerLoanRiskPremium(500_000, 0, 25)).toBeNull()
  })

  it('returns full rate when all debt is partner loans', () => {
    // 100% concentration × 25% rate = 25%
    const premium = computePartnerLoanRiskPremium(1_000_000, 1_000_000, 25)
    expect(premium).toBeCloseTo(25, 5)
  })

  it('returns half rate for 50% partner loan concentration', () => {
    // 50% × 30% = 15%
    const premium = computePartnerLoanRiskPremium(500_000, 1_000_000, 30)
    expect(premium).toBeCloseTo(15, 5)
  })

  it('returns 0 premium when no partner loans', () => {
    const premium = computePartnerLoanRiskPremium(0, 1_000_000, 25)
    expect(premium).toBeCloseTo(0, 5)
  })

  it('premium scales proportionally with concentration', () => {
    const p25 = computePartnerLoanRiskPremium(250_000, 1_000_000, 20)
    const p50 = computePartnerLoanRiskPremium(500_000, 1_000_000, 20)
    expect(p50!).toBeCloseTo(p25! * 2, 5)
  })

  it('premium scales proportionally with interest rate', () => {
    const p1 = computePartnerLoanRiskPremium(500_000, 1_000_000, 20)
    const p2 = computePartnerLoanRiskPremium(500_000, 1_000_000, 40)
    expect(p2!).toBeCloseTo(p1! * 2, 5)
  })
})
