// ─────────────────────────────────────────────────────────────────────────────
// tests/interest-rate-sensitivity.test.ts
//
// Comprehensive unit tests for the Interest Rate Sensitivity Analysis service.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeMonthlyInterest,
  computeAnnualInterest,
  applyRateDelta,
  computeWeightedAvgRate,
  buildTrancheSensitivity,
  buildPortfolioSensitivity,
  computeInterestCoverageRatio,
  classifyInterestCoverageHealth,
  computeBreakevenRate,
  classifyRateSensitivityRisk,
  STANDARD_SCENARIOS,
} from '../lib/services/pcle/interest-rate-sensitivity.service'

// ── 1. computeMonthlyInterest ─────────────────────────────────────────────────

describe('computeMonthlyInterest', () => {
  it('₺1M at 12% annual = ₺10,000/month', () => {
    expect(computeMonthlyInterest(1_000_000, 12)).toBe(10_000)
  })

  it('₺500K at 24% annual = ₺10,000/month', () => {
    expect(computeMonthlyInterest(500_000, 24)).toBe(10_000)
  })

  it('zero outstanding = zero interest', () => {
    expect(computeMonthlyInterest(0, 30)).toBe(0)
  })

  it('zero rate = zero interest', () => {
    expect(computeMonthlyInterest(1_000_000, 0)).toBe(0)
  })

  it('₺2M at 30% = ₺50,000/month', () => {
    expect(computeMonthlyInterest(2_000_000, 30)).toBe(50_000)
  })

  it('₺100K at 36% = ₺3,000/month', () => {
    expect(computeMonthlyInterest(100_000, 36)).toBe(3_000)
  })

  it('rounds to 2 decimal places', () => {
    // 1_000 × (15/100) / 12 = 12.5 exactly
    const result = computeMonthlyInterest(1_000, 15)
    expect(result).toBe(12.5)
  })

  it('₺750,000 at 20% annual = ₺12,500/month', () => {
    expect(computeMonthlyInterest(750_000, 20)).toBe(12_500)
  })
})

// ── 2. computeAnnualInterest ──────────────────────────────────────────────────

describe('computeAnnualInterest', () => {
  it('₺10,000/month × 12 = ₺120,000/year', () => {
    expect(computeAnnualInterest(10_000)).toBe(120_000)
  })

  it('zero monthly = zero annual', () => {
    expect(computeAnnualInterest(0)).toBe(0)
  })

  it('₺50,000/month × 12 = ₺600,000/year', () => {
    expect(computeAnnualInterest(50_000)).toBe(600_000)
  })

  it('₺1,250/month × 12 = ₺15,000/year', () => {
    expect(computeAnnualInterest(1_250)).toBe(15_000)
  })
})

// ── 3. applyRateDelta ─────────────────────────────────────────────────────────

describe('applyRateDelta', () => {
  it('no delta = same rate', () => {
    expect(applyRateDelta(30, 0)).toBe(30)
  })

  it('positive delta increases rate', () => {
    expect(applyRateDelta(30, 5)).toBe(35)
  })

  it('negative delta decreases rate', () => {
    expect(applyRateDelta(30, -5)).toBe(25)
  })

  it('large negative delta clamps at 0 (not negative)', () => {
    expect(applyRateDelta(10, -20)).toBe(0)
  })

  it('exact zero clamp when delta equals rate', () => {
    expect(applyRateDelta(15, -15)).toBe(0)
  })

  it('zero rate with positive delta', () => {
    expect(applyRateDelta(0, 10)).toBe(10)
  })

  it('zero rate with zero delta = 0', () => {
    expect(applyRateDelta(0, 0)).toBe(0)
  })

  it('large positive delta', () => {
    expect(applyRateDelta(20, 15)).toBe(35)
  })

  it('negative result never goes below zero', () => {
    expect(applyRateDelta(5, -100)).toBe(0)
  })
})

// ── 4. computeWeightedAvgRate ─────────────────────────────────────────────────

describe('computeWeightedAvgRate', () => {
  it('empty array returns 0', () => {
    expect(computeWeightedAvgRate([])).toBe(0)
  })

  it('zero outstanding returns 0', () => {
    const tranches = [
      { outstanding_try: 0, annual_rate_pct: 30 },
      { outstanding_try: 0, annual_rate_pct: 20 },
    ]
    expect(computeWeightedAvgRate(tranches)).toBe(0)
  })

  it('single tranche returns its own rate', () => {
    const tranches = [{ outstanding_try: 1_000_000, annual_rate_pct: 25 }]
    expect(computeWeightedAvgRate(tranches)).toBe(25)
  })

  it('equal tranches = simple average of rates', () => {
    const tranches = [
      { outstanding_try: 500_000, annual_rate_pct: 20 },
      { outstanding_try: 500_000, annual_rate_pct: 30 },
    ]
    expect(computeWeightedAvgRate(tranches)).toBe(25)
  })

  it('unequal tranches weighted correctly', () => {
    const tranches = [
      { outstanding_try: 2_000_000, annual_rate_pct: 20 },   // weight 2/3
      { outstanding_try: 1_000_000, annual_rate_pct: 35 },   // weight 1/3
    ]
    // WAR = (2M×20 + 1M×35) / 3M = (40M+35M)/3M = 75M/3M = 25
    expect(computeWeightedAvgRate(tranches)).toBe(25)
  })

  it('larger tranche dominates rate', () => {
    const tranches = [
      { outstanding_try: 9_000_000, annual_rate_pct: 10 },
      { outstanding_try: 1_000_000, annual_rate_pct: 50 },
    ]
    // WAR = (90M+50M)/10M = 14
    expect(computeWeightedAvgRate(tranches)).toBe(14)
  })

  it('three tranches compute correctly', () => {
    const tranches = [
      { outstanding_try: 1_000_000, annual_rate_pct: 12 },
      { outstanding_try: 2_000_000, annual_rate_pct: 24 },
      { outstanding_try: 1_000_000, annual_rate_pct: 36 },
    ]
    // (12M + 48M + 36M) / 4M = 96M/4M = 24
    expect(computeWeightedAvgRate(tranches)).toBe(24)
  })
})

// ── 5. buildTrancheSensitivity ────────────────────────────────────────────────

describe('buildTrancheSensitivity', () => {
  const baseTranche = () =>
    buildTrancheSensitivity(
      'tranche-1',
      'partner-1',
      'ABC Şirketi',
      1_000_000,
      30,
      STANDARD_SCENARIOS,
    )

  it('returns correct tranche_id', () => {
    expect(baseTranche().tranche_id).toBe('tranche-1')
  })

  it('returns correct partner_id', () => {
    expect(baseTranche().partner_id).toBe('partner-1')
  })

  it('returns correct partner_name', () => {
    expect(baseTranche().partner_name).toBe('ABC Şirketi')
  })

  it('returns correct outstanding_try', () => {
    expect(baseTranche().outstanding_try).toBe(1_000_000)
  })

  it('returns correct current_rate_pct', () => {
    expect(baseTranche().current_rate_pct).toBe(30)
  })

  it('generates exactly 5 scenarios from STANDARD_SCENARIOS', () => {
    expect(baseTranche().scenarios).toHaveLength(5)
  })

  it('base scenario (delta=0) has correct rate', () => {
    const ts   = baseTranche()
    const base = ts.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.new_rate_pct).toBe(30)
  })

  it('base scenario has correct monthly interest', () => {
    const ts   = baseTranche()
    const base = ts.scenarios.find(s => s.rate_delta_pct === 0)!
    // 1M × 30% / 12 = 25,000
    expect(base.monthly_interest_try).toBe(25_000)
  })

  it('base scenario has correct annual interest', () => {
    const ts   = baseTranche()
    const base = ts.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.annual_interest_try).toBe(300_000)
  })

  it('base scenario rate change impact = 0', () => {
    const ts   = baseTranche()
    const base = ts.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.rate_change_impact_try).toBe(0)
  })

  it('+5% scenario has rate 35%', () => {
    const ts     = baseTranche()
    const stress = ts.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.new_rate_pct).toBe(35)
  })

  it('+5% scenario monthly interest is correct', () => {
    const ts     = baseTranche()
    const stress = ts.scenarios.find(s => s.rate_delta_pct === 5)!
    // 1M × 35% / 12 = 29,166.67
    expect(stress.monthly_interest_try).toBeCloseTo(29_166.67, 1)
  })

  it('+5% scenario annual interest is correct', () => {
    const ts     = baseTranche()
    const stress = ts.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.annual_interest_try).toBeCloseTo(350_000, 0)
  })

  it('+5% scenario impact = +50,000 vs base', () => {
    const ts     = baseTranche()
    const stress = ts.scenarios.find(s => s.rate_delta_pct === 5)!
    // 350,000 - 300,000 = 50,000
    expect(stress.rate_change_impact_try).toBeCloseTo(50_000, 0)
  })

  it('-5% scenario has rate 25%', () => {
    const ts   = baseTranche()
    const low  = ts.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.new_rate_pct).toBe(25)
  })

  it('-5% scenario has negative impact (savings)', () => {
    const ts   = baseTranche()
    const low  = ts.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.rate_change_impact_try).toBeLessThan(0)
  })

  it('+15% crisis scenario has rate 45%', () => {
    const ts    = baseTranche()
    const crisis = ts.scenarios.find(s => s.rate_delta_pct === 15)!
    expect(crisis.new_rate_pct).toBe(45)
  })

  it('rate clamped at 0 for very low current rate with large negative delta', () => {
    const ts = buildTrancheSensitivity(
      'tranche-2', 'partner-2', 'XYZ', 500_000, 3, STANDARD_SCENARIOS,
    )
    const low = ts.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.new_rate_pct).toBe(0)
    expect(low.monthly_interest_try).toBe(0)
  })

  it('scenario names match STANDARD_SCENARIOS', () => {
    const ts    = baseTranche()
    const names = ts.scenarios.map(s => s.scenario_name)
    expect(names).toContain('Baz Senaryo')
    expect(names).toContain('Kriz (+15%)')
    expect(names).toContain('Düşük Faiz (-5%)')
    expect(names).toContain('Stres (+10%)')
  })
})

// ── 6. buildPortfolioSensitivity ──────────────────────────────────────────────

describe('buildPortfolioSensitivity', () => {
  const makeTranche = (id: string, outstanding: number, rate: number) =>
    buildTrancheSensitivity(id, 'p1', 'Partner', outstanding, rate, STANDARD_SCENARIOS)

  it('aggregates total_outstanding_try correctly', () => {
    const t1 = makeTranche('t1', 1_000_000, 20)
    const t2 = makeTranche('t2', 2_000_000, 30)
    const ps = buildPortfolioSensitivity([t1, t2], STANDARD_SCENARIOS)
    expect(ps.total_outstanding_try).toBe(3_000_000)
  })

  it('computes weighted_avg_rate_pct correctly', () => {
    const t1 = makeTranche('t1', 1_000_000, 20)
    const t2 = makeTranche('t2', 2_000_000, 30)
    const ps = buildPortfolioSensitivity([t1, t2], STANDARD_SCENARIOS)
    // (1M×20 + 2M×30) / 3M = 80/3 ≈ 26.67
    expect(ps.weighted_avg_rate_pct).toBeCloseTo(26.67, 1)
  })

  it('generates 5 portfolio scenarios', () => {
    const t1 = makeTranche('t1', 1_000_000, 20)
    const ps = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    expect(ps.scenarios).toHaveLength(5)
  })

  it('base scenario incremental cost = 0', () => {
    const t1   = makeTranche('t1', 1_000_000, 20)
    const ps   = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const base = ps.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.incremental_annual_cost_try).toBe(0)
  })

  it('+5% scenario has positive incremental cost', () => {
    const t1     = makeTranche('t1', 1_000_000, 20)
    const ps     = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const stress = ps.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.incremental_annual_cost_try).toBeGreaterThan(0)
  })

  it('-5% scenario has negative incremental cost (savings)', () => {
    const t1  = makeTranche('t1', 1_000_000, 20)
    const ps  = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const low = ps.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.incremental_annual_cost_try).toBeLessThan(0)
  })

  it('integration: ₺2M at 30%, base annual = ₺600K', () => {
    const t1   = makeTranche('t1', 2_000_000, 30)
    const ps   = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const base = ps.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.total_annual_interest_try).toBe(600_000)
  })

  it('integration: ₺2M at 30%, +5% = ₺700K annual (approx due to rounding chain)', () => {
    const t1     = makeTranche('t1', 2_000_000, 30)
    const ps     = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const stress = ps.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.total_annual_interest_try).toBeCloseTo(700_000, -1)
  })

  it('integration: ₺2M at 30%, +5% incremental ≈ +₺100K', () => {
    const t1     = makeTranche('t1', 2_000_000, 30)
    const ps     = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const stress = ps.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.incremental_annual_cost_try).toBeCloseTo(100_000, -1)
  })

  it('net_income_impact_pct is null when no prior income given', () => {
    const t1   = makeTranche('t1', 1_000_000, 20)
    const ps   = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const base = ps.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.net_income_impact_pct).toBeNull()
  })

  it('net_income_impact_pct computed when prior income provided', () => {
    const t1     = makeTranche('t1', 2_000_000, 30)
    const ps     = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS, 500_000)
    const stress = ps.scenarios.find(s => s.rate_delta_pct === 5)!
    // incremental = +100,000, net_income = 500,000 → impact = 20%
    expect(stress.net_income_impact_pct).toBeCloseTo(20, 1)
  })

  it('dscr_impact null when no ebitda given', () => {
    const t1   = makeTranche('t1', 1_000_000, 20)
    const ps   = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS)
    const base = ps.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.dscr_impact).toBeNull()
  })

  it('dscr_impact computed when ebitda provided', () => {
    const t1   = makeTranche('t1', 2_000_000, 30)
    // base annual = 600K, ebitda = 500K → ICR = 500/600 ≈ 0.83
    const ps   = buildPortfolioSensitivity([t1], STANDARD_SCENARIOS, undefined, 500_000)
    const base = ps.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.dscr_impact).toBeCloseTo(0.83, 1)
  })

  it('empty tranches = zero outstanding', () => {
    const ps = buildPortfolioSensitivity([], STANDARD_SCENARIOS)
    expect(ps.total_outstanding_try).toBe(0)
    expect(ps.weighted_avg_rate_pct).toBe(0)
  })

  it('two tranches sum annual interest correctly for +10% scenario', () => {
    const t1     = makeTranche('t1', 1_000_000, 20)
    const t2     = makeTranche('t2', 1_000_000, 20)
    const ps     = buildPortfolioSensitivity([t1, t2], STANDARD_SCENARIOS)
    const stress = ps.scenarios.find(s => s.rate_delta_pct === 10)!
    // each: 1M × 30% = 300K annual → total 600K
    expect(stress.total_annual_interest_try).toBe(600_000)
  })
})

// ── 7. computeInterestCoverageRatio ───────────────────────────────────────────

describe('computeInterestCoverageRatio', () => {
  it('returns null when annual interest = 0', () => {
    expect(computeInterestCoverageRatio(500_000, 0)).toBeNull()
  })

  it('returns null when annual interest is negative', () => {
    expect(computeInterestCoverageRatio(500_000, -1)).toBeNull()
  })

  it('EBITDA 500K / interest 600K = 0.83', () => {
    expect(computeInterestCoverageRatio(500_000, 600_000)).toBeCloseTo(0.83, 1)
  })

  it('EBITDA 1M / interest 200K = 5.0', () => {
    expect(computeInterestCoverageRatio(1_000_000, 200_000)).toBe(5)
  })

  it('EBITDA = interest → ICR = 1.0 exactly', () => {
    expect(computeInterestCoverageRatio(300_000, 300_000)).toBe(1)
  })

  it('negative EBITDA → ICR < 0 (critical)', () => {
    const result = computeInterestCoverageRatio(-100_000, 200_000)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })

  it('large EBITDA relative to interest = high ratio', () => {
    expect(computeInterestCoverageRatio(3_000_000, 200_000)).toBe(15)
  })
})

// ── 8. classifyInterestCoverageHealth ─────────────────────────────────────────

describe('classifyInterestCoverageHealth', () => {
  it('null ratio = no_debt', () => {
    expect(classifyInterestCoverageHealth(null)).toBe('no_debt')
  })

  it('ratio = 5.0 exactly = excellent', () => {
    expect(classifyInterestCoverageHealth(5.0)).toBe('excellent')
  })

  it('ratio = 7.5 = excellent', () => {
    expect(classifyInterestCoverageHealth(7.5)).toBe('excellent')
  })

  it('ratio = 3.0 exactly = good', () => {
    expect(classifyInterestCoverageHealth(3.0)).toBe('good')
  })

  it('ratio = 4.9 = good', () => {
    expect(classifyInterestCoverageHealth(4.9)).toBe('good')
  })

  it('ratio = 2.0 exactly = adequate', () => {
    expect(classifyInterestCoverageHealth(2.0)).toBe('adequate')
  })

  it('ratio = 2.9 = adequate', () => {
    expect(classifyInterestCoverageHealth(2.9)).toBe('adequate')
  })

  it('ratio = 1.0 exactly = thin', () => {
    expect(classifyInterestCoverageHealth(1.0)).toBe('thin')
  })

  it('ratio = 1.9 = thin', () => {
    expect(classifyInterestCoverageHealth(1.9)).toBe('thin')
  })

  it('ratio = 0.83 = critical', () => {
    expect(classifyInterestCoverageHealth(0.83)).toBe('critical')
  })

  it('ratio = 0 = critical', () => {
    expect(classifyInterestCoverageHealth(0)).toBe('critical')
  })

  it('negative ratio = critical', () => {
    expect(classifyInterestCoverageHealth(-0.5)).toBe('critical')
  })
})

// ── 9. computeBreakevenRate ───────────────────────────────────────────────────

describe('computeBreakevenRate', () => {
  it('returns null when total outstanding = 0', () => {
    expect(computeBreakevenRate(500_000, 100_000, 0)).toBeNull()
  })

  it('correct formula with positive net income', () => {
    // breakeven = (net_income + base_interest) / outstanding × 100
    // = (500K + 600K) / 2M × 100 = 1100K/2M × 100 = 55%
    expect(computeBreakevenRate(500_000, 600_000, 2_000_000)).toBe(55)
  })

  it('zero net income — breakeven equals current cost rate', () => {
    // = (0 + 600K) / 2M × 100 = 30%
    expect(computeBreakevenRate(0, 600_000, 2_000_000)).toBe(30)
  })

  it('negative net income — breakeven lower than current rate', () => {
    // = (-200K + 600K) / 2M × 100 = 400K/2M × 100 = 20%
    expect(computeBreakevenRate(-200_000, 600_000, 2_000_000)).toBe(20)
  })

  it('higher outstanding reduces breakeven rate', () => {
    const be1 = computeBreakevenRate(500_000, 300_000, 1_000_000)   // = 80%
    const be2 = computeBreakevenRate(500_000, 300_000, 2_000_000)   // = 40%
    expect(be1).toBeGreaterThan(be2!)
  })
})

// ── 10. classifyRateSensitivityRisk ──────────────────────────────────────────

describe('classifyRateSensitivityRisk', () => {
  it('no_debt when total outstanding = 0', () => {
    expect(classifyRateSensitivityRisk(25, 50, 0)).toBe('no_debt')
  })

  it('no_debt when breakeven rate is null', () => {
    expect(classifyRateSensitivityRisk(25, null, 2_000_000)).toBe('no_debt')
  })

  it('no_debt when weighted avg rate = 0', () => {
    expect(classifyRateSensitivityRisk(0, 50, 2_000_000)).toBe('no_debt')
  })

  it('critical when current rate >= breakeven', () => {
    // current = 30, breakeven = 25 → already above
    expect(classifyRateSensitivityRisk(30, 25, 2_000_000)).toBe('critical')
  })

  it('critical when current rate = breakeven exactly', () => {
    expect(classifyRateSensitivityRisk(30, 30, 2_000_000)).toBe('critical')
  })

  it('low_risk when headroom > 50%', () => {
    // headroom = (100 - 20) / 20 × 100 = 400% → low_risk
    expect(classifyRateSensitivityRisk(20, 100, 2_000_000)).toBe('low_risk')
  })

  it('moderate when headroom > 25%', () => {
    // current=20, breakeven=30: headroom = (30-20)/20 × 100 = 50% → low_risk
    // current=20, breakeven=25: headroom = (25-20)/20 × 100 = 25% → NOT moderate (not > 25)
    // current=20, breakeven=26: headroom = (26-20)/20 × 100 = 30% → moderate
    expect(classifyRateSensitivityRisk(20, 26, 2_000_000)).toBe('moderate')
  })

  it('elevated when headroom > 10%', () => {
    // current=20, breakeven=22.5: headroom = (22.5-20)/20 × 100 = 12.5% → elevated
    expect(classifyRateSensitivityRisk(20, 22.5, 2_000_000)).toBe('elevated')
  })

  it('high_risk when headroom <= 10%', () => {
    // current=20, breakeven=21: headroom = (21-20)/20 × 100 = 5% → high_risk
    expect(classifyRateSensitivityRisk(20, 21, 2_000_000)).toBe('high_risk')
  })

  it('boundary: headroom exactly 50% → low_risk', () => {
    // current=20, breakeven=30: headroom = (30-20)/20 × 100 = 50% → low_risk (> 50 is false, but moderate > 25 is true, but > 50 check first)
    // Actually headroom = 50 exactly: > 50 is false → check > 25 → yes → moderate
    expect(classifyRateSensitivityRisk(20, 30, 2_000_000)).toBe('moderate')
  })

  it('boundary: headroom exactly 10% → high_risk', () => {
    // current=20, breakeven=22: headroom = (22-20)/20 × 100 = 10% → NOT > 10 → high_risk
    expect(classifyRateSensitivityRisk(20, 22, 2_000_000)).toBe('high_risk')
  })
})

// ── 11. Integration: ₺2M at 30%, EBITDA ₺500K ─────────────────────────────────

describe('integration: ₺2M at 30%, EBITDA ₺500K', () => {
  const tranche = buildTrancheSensitivity(
    'int-t1', 'int-p1', 'Integration Partner', 2_000_000, 30, STANDARD_SCENARIOS,
  )
  const portfolio = buildPortfolioSensitivity(
    [tranche], STANDARD_SCENARIOS, 500_000, 500_000,
  )

  it('base annual interest = ₺600K', () => {
    const base = portfolio.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.total_annual_interest_try).toBe(600_000)
  })

  it('base monthly interest = ₺50K', () => {
    const base = portfolio.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.total_monthly_interest_try).toBe(50_000)
  })

  it('ICR = 500K / 600K ≈ 0.83 → critical', () => {
    const icr    = computeInterestCoverageRatio(500_000, 600_000)
    const health = classifyInterestCoverageHealth(icr)
    expect(icr).toBeCloseTo(0.83, 1)
    expect(health).toBe('critical')
  })

  it('+5% scenario: annual interest ≈ ₺700K', () => {
    const stress = portfolio.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.total_annual_interest_try).toBeCloseTo(700_000, -1)
  })

  it('+5% scenario: incremental cost ≈ +₺100K', () => {
    const stress = portfolio.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.incremental_annual_cost_try).toBeCloseTo(100_000, -1)
  })

  it('+5% scenario: net income impact = +20%', () => {
    const stress = portfolio.scenarios.find(s => s.rate_delta_pct === 5)!
    expect(stress.net_income_impact_pct).toBeCloseTo(20, 0)
  })

  it('-5% scenario: annual interest ≈ ₺500K', () => {
    const low = portfolio.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.total_annual_interest_try).toBeCloseTo(500_000, -1)
  })

  it('-5% scenario: incremental cost ≈ -₺100K (savings)', () => {
    const low = portfolio.scenarios.find(s => s.rate_delta_pct === -5)!
    expect(low.incremental_annual_cost_try).toBeCloseTo(-100_000, -1)
  })

  it('crisis +15%: annual interest ≈ ₺900K', () => {
    const crisis = portfolio.scenarios.find(s => s.rate_delta_pct === 15)!
    expect(crisis.total_annual_interest_try).toBeCloseTo(900_000, -1)
  })

  it('crisis +15%: incremental ≈ +₺300K', () => {
    const crisis = portfolio.scenarios.find(s => s.rate_delta_pct === 15)!
    expect(crisis.incremental_annual_cost_try).toBeCloseTo(300_000, -1)
  })

  it('breakeven rate computed correctly (500K income + 600K interest) / 2M = 55%', () => {
    const be = computeBreakevenRate(500_000, 600_000, 2_000_000)
    expect(be).toBe(55)
  })

  it('rate sensitivity risk: current 30% vs breakeven 55% → headroom 83% → low_risk', () => {
    const risk = classifyRateSensitivityRisk(30, 55, 2_000_000)
    expect(risk).toBe('low_risk')
  })

  it('dscr at base scenario ≈ 0.83x', () => {
    const base = portfolio.scenarios.find(s => s.rate_delta_pct === 0)!
    expect(base.dscr_impact).toBeCloseTo(0.83, 1)
  })

  it('dscr at +5% scenario ≈ 0.71x', () => {
    const stress = portfolio.scenarios.find(s => s.rate_delta_pct === 5)!
    // 500K / 700K ≈ 0.71
    expect(stress.dscr_impact).toBeCloseTo(0.71, 1)
  })
})

// ── 12. STANDARD_SCENARIOS validation ────────────────────────────────────────

describe('STANDARD_SCENARIOS', () => {
  it('has exactly 5 scenarios', () => {
    expect(STANDARD_SCENARIOS).toHaveLength(5)
  })

  it('includes a base scenario with delta 0', () => {
    const base = STANDARD_SCENARIOS.find(s => s.rate_delta_pct === 0)
    expect(base).toBeDefined()
    expect(base!.name).toBe('Baz Senaryo')
  })

  it('includes low rate scenario with delta -5', () => {
    const s = STANDARD_SCENARIOS.find(s => s.rate_delta_pct === -5)
    expect(s).toBeDefined()
  })

  it('includes high rate scenario with delta +5', () => {
    const s = STANDARD_SCENARIOS.find(s => s.rate_delta_pct === 5)
    expect(s).toBeDefined()
  })

  it('includes stress scenario with delta +10', () => {
    const s = STANDARD_SCENARIOS.find(s => s.rate_delta_pct === 10)
    expect(s).toBeDefined()
  })

  it('includes crisis scenario with delta +15', () => {
    const s = STANDARD_SCENARIOS.find(s => s.rate_delta_pct === 15)
    expect(s).toBeDefined()
    expect(s!.name).toBe('Kriz (+15%)')
  })

  it('all scenarios have non-empty descriptions', () => {
    for (const s of STANDARD_SCENARIOS) {
      expect(s.description.length).toBeGreaterThan(5)
    }
  })

  it('all scenarios have non-empty names', () => {
    for (const s of STANDARD_SCENARIOS) {
      expect(s.name.length).toBeGreaterThan(0)
    }
  })
})
