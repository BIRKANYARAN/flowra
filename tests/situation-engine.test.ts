/**
 * Tests for lib/engines/situation.engine.ts — weighted composite financial health scoring
 * Run with: npx vitest run tests/situation-engine.test.ts
 */
import { describe, it, expect } from 'vitest'
import { computeSituation, type SituationInputs } from '../lib/engines/situation.engine'

// Weights: cash=0.30, profit=0.25, debt=0.20, receivables=0.15, partner=0.10

const IDEAL: SituationInputs = {
  isProfitable:      true,
  cashRunwayMonths:  0,       // irrelevant when profitable
  netMarginPct:      0.30,    // profitScore = 0.30*200+50 = 110 → clamped 100
  debtServiceRatio:  0,       // debtScore = 100
  overdueRatioPct:   0,       // receivablesScore = 100
  maxBurdenScoreAbs: 0,       // partnerScore = 100
}

describe('computeSituation — ideal healthy company', () => {
  const result = computeSituation(IDEAL)

  it('status is healthy', () => {
    expect(result.status).toBe('healthy')
  })

  it('composite is >= 80', () => {
    expect(result.composite).toBeGreaterThanOrEqual(80)
  })

  it('composite equals 100 for perfect inputs', () => {
    // All dimensions = 100 → 100*0.30 + 100*0.25 + 100*0.20 + 100*0.15 + 100*0.10 = 100
    expect(result.composite).toBe(100)
  })

  it('all dimension scores are 100', () => {
    expect(result.scores.cash).toBe(100)
    expect(result.scores.profit).toBe(100)
    expect(result.scores.debt).toBe(100)
    expect(result.scores.receivables).toBe(100)
    expect(result.scores.partner).toBe(100)
  })
})

describe('computeSituation — cash crisis (low runway)', () => {
  const inputs: SituationInputs = {
    ...IDEAL,
    isProfitable:     false,
    cashRunwayMonths: 1,      // cashScore = 1 * 10 = 10
  }
  const result = computeSituation(inputs)

  it('cash score is ~10', () => {
    expect(result.scores.cash).toBeCloseTo(10, 1)
  })

  it('composite is lower than healthy (100)', () => {
    expect(result.composite).toBeLessThan(100)
  })

  it('composite is significantly reduced by cash crisis', () => {
    // Cash weight 0.30: contribution drops from 30 to 3, delta = -27
    expect(result.composite).toBeLessThanOrEqual(73)
  })
})

describe('computeSituation — high debt service ratio', () => {
  const inputs: SituationInputs = {
    ...IDEAL,
    debtServiceRatio: 0.9,   // debtScore = 100 - 90 = 10
  }
  const result = computeSituation(inputs)

  it('debt score is near 0 (10 for DSR=0.9)', () => {
    expect(result.scores.debt).toBeCloseTo(10, 1)
  })

  it('composite is significantly reduced by high DSR', () => {
    // debtScore drops from 100 to 10; delta = -90 * 0.20 = -18 from ideal
    // composite = 100*0.30 + 100*0.25 + 10*0.20 + 100*0.15 + 100*0.10 = 82
    expect(result.composite).toBeLessThan(100)
    expect(result.composite).toBeCloseTo(82, 0)
  })
})

describe('computeSituation — poor receivables', () => {
  const inputs: SituationInputs = {
    ...IDEAL,
    overdueRatioPct: 80,     // receivablesScore = 100 - 80 = 20
  }
  const result = computeSituation(inputs)

  it('receivables score is near 0 (20 for 80% overdue)', () => {
    expect(result.scores.receivables).toBeCloseTo(20, 1)
  })

  it('composite is reduced by poor receivables', () => {
    // Delta from ideal: (100-20)*0.15 = 12 reduction
    expect(result.composite).toBeLessThan(100)
  })
})

describe('computeSituation — burden imbalance', () => {
  const inputs: SituationInputs = {
    ...IDEAL,
    maxBurdenScoreAbs: 0.5,   // partnerScore = 100 - 0.5*200 = 0
  }
  const result = computeSituation(inputs)

  it('partner score is near 0 (exactly 0 for burden=0.5)', () => {
    expect(result.scores.partner).toBeCloseTo(0, 1)
  })

  it('composite is reduced by partner imbalance', () => {
    expect(result.composite).toBeLessThan(100)
  })
})

describe('computeSituation — critical case (all bad)', () => {
  const inputs: SituationInputs = {
    isProfitable:      false,
    cashRunwayMonths:  0,       // cashScore = 0
    netMarginPct:      -0.30,   // profitScore = -0.30*200+50 = -10 → clamped 0
    debtServiceRatio:  1.0,     // debtScore = 0
    overdueRatioPct:   100,     // receivablesScore = 0
    maxBurdenScoreAbs: 1.0,     // partnerScore = 100 - 200 = -100 → clamped 0
  }
  const result = computeSituation(inputs)

  it('status is critical', () => {
    expect(result.status).toBe('critical')
  })

  it('composite is < 40', () => {
    expect(result.composite).toBeLessThan(40)
  })

  it('composite is 0 for all-zero scores', () => {
    expect(result.composite).toBe(0)
  })

  it('all dimension scores are 0', () => {
    expect(result.scores.cash).toBe(0)
    expect(result.scores.profit).toBe(0)
    expect(result.scores.debt).toBe(0)
    expect(result.scores.receivables).toBe(0)
    expect(result.scores.partner).toBe(0)
  })
})

describe('computeSituation — situationLine', () => {
  it('situationLine is a non-empty Turkish string', () => {
    const result = computeSituation(IDEAL)
    expect(typeof result.situationLine).toBe('string')
    expect(result.situationLine.length).toBeGreaterThan(0)
    // Should contain Turkish status label
    expect(result.situationLine).toContain('sağlıklı seyrediyor')
  })

  it('situationLine for critical case contains kritik', () => {
    const inputs: SituationInputs = {
      isProfitable:      false,
      cashRunwayMonths:  0,
      netMarginPct:      -0.30,
      debtServiceRatio:  1.0,
      overdueRatioPct:   100,
      maxBurdenScoreAbs: 1.0,
    }
    const result = computeSituation(inputs)
    expect(result.situationLine).toContain('kritik durumda')
  })
})

describe('computeSituation — scores structure', () => {
  it('scores object has exactly 5 keys', () => {
    const result = computeSituation(IDEAL)
    expect(Object.keys(result.scores)).toHaveLength(5)
    expect(Object.keys(result.scores)).toEqual(
      expect.arrayContaining(['cash', 'profit', 'debt', 'receivables', 'partner'])
    )
  })

  it('all score values are in range [0, 100]', () => {
    const inputs: SituationInputs = {
      isProfitable:      false,
      cashRunwayMonths:  5,
      netMarginPct:      0.10,
      debtServiceRatio:  0.5,
      overdueRatioPct:   30,
      maxBurdenScoreAbs: 0.2,
    }
    const result = computeSituation(inputs)
    for (const [key, val] of Object.entries(result.scores)) {
      expect(val, `${key} score out of range`).toBeGreaterThanOrEqual(0)
      expect(val, `${key} score out of range`).toBeLessThanOrEqual(100)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Alert Penalty Tests (T0.1 — Phase 0 implementation)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — alert penalty (T0.1)', () => {
  it('0 alerts: no penalty — perfect score stays 100', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 0, warning: 0, info: 0 },
    })
    expect(result.composite).toBe(100)
    expect(result.status).toBe('healthy')
  })

  it('1 critical alert: composite ≤ 74', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 1, warning: 0, info: 0 },
    })
    expect(result.composite).toBeLessThanOrEqual(74)
  })

  it('1 critical alert: status cannot be healthy', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 1, warning: 0, info: 0 },
    })
    expect(result.status).not.toBe('healthy')
  })

  it('1 critical alert on healthy company: status is caution', () => {
    // 100 - 15 = 85 → but capped at 74 → caution
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 1, warning: 0, info: 0 },
    })
    expect(result.composite).toBe(74)
    expect(result.status).toBe('caution')
  })

  it('3 critical alerts: composite ≤ 55 (100 - 45 = 55, capped at 74)', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 3, warning: 0, info: 0 },
    })
    // 100 - (3×15) = 55, already ≤ 74 so cap does not change it further
    // statusFromComposite: ≥80 healthy, ≥60 caution, ≥40 at-risk, <40 critical
    expect(result.composite).toBe(55)
    expect(result.status).toBe('at-risk')
  })

  it('warnings apply smaller penalty (3 pts each)', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 0, warning: 2, info: 0 },
    })
    expect(result.composite).toBe(94)   // 100 - 2×3 = 94
    expect(result.status).toBe('healthy')
  })

  it('mixed: 1 critical + 2 warnings', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 1, warning: 2, info: 0 },
    })
    // 100 - 15 - 6 = 79 → capped at 74
    expect(result.composite).toBe(74)
    expect(result.status).not.toBe('healthy')
  })

  it('situation line leads with Kritik when critical alert active', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 1, warning: 0, info: 0 },
    })
    expect(result.situationLine).toMatch(/^Kritik/)
  })

  it('situation line does NOT lead with Kritik when no critical alerts', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 0, warning: 1, info: 0 },
    })
    expect(result.situationLine).not.toMatch(/^Kritik/)
  })

  it('backward compat: missing activeAlertCounts → no penalty', () => {
    // Old callers that do not pass activeAlertCounts must still work
    const result = computeSituation(IDEAL)
    expect(result.composite).toBe(100)
    expect(result.status).toBe('healthy')
  })

  it('info alerts do not reduce composite', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 0, warning: 0, info: 10 },
    })
    expect(result.composite).toBe(100)
  })

  it('penalty floor is 0: many alerts cannot go below 0', () => {
    const result = computeSituation({
      ...IDEAL,
      activeAlertCounts: { critical: 20, warning: 20, info: 0 },
    })
    expect(result.composite).toBeGreaterThanOrEqual(0)
  })

  it('scores object is unaffected by alert penalty (penalty is composite-only)', () => {
    const withAlerts    = computeSituation({ ...IDEAL, activeAlertCounts: { critical: 2, warning: 0, info: 0 } })
    const withoutAlerts = computeSituation(IDEAL)
    // Individual dimension scores must be identical
    expect(withAlerts.scores).toEqual(withoutAlerts.scores)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Threshold boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — status boundary thresholds', () => {
  it('composite exactly 80 → healthy', () => {
    // Force composite = 80 by engineering inputs
    // profit=100(0.25)+debt=100(0.20)+recv=100(0.15)+partner=100(0.10)+cash=?
    // sum without cash = 70; need cash contrib = 10; cashScore = 10/0.30 ≈ 33.33
    // cashScore = runway * 10; runway = 3.333 months (unprofitable)
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  3.333,
      netMarginPct:      0.25,    // profitScore = 100
      debtServiceRatio:  0,
      overdueRatioPct:   0,
      maxBurdenScoreAbs: 0,
    })
    expect(result.composite).toBeGreaterThanOrEqual(80)
    expect(result.status).toBe('healthy')
  })

  it('composite just below 80 (79) → caution', () => {
    // cashRunwayMonths = 3 → cashScore = 30; composite = 30*0.30 + 100*0.25 + 100*0.20 + 100*0.15 + 100*0.10 = 79
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  3,
      netMarginPct:      0.25,
      debtServiceRatio:  0,
      overdueRatioPct:   0,
      maxBurdenScoreAbs: 0,
    })
    expect(result.composite).toBeCloseTo(79, 0)
    expect(result.status).toBe('caution')
  })

  it('composite exactly 60 → caution', () => {
    // cash=0, profit=100, debt=100, recv=100, partner=100
    // composite = 0*0.30 + 100*0.25 + 100*0.20 + 100*0.15 + 100*0.10 = 70
    // Need composite = 60 exactly: reduce profit as well
    // 0*0.30 + 60*0.25 + 100*0.20 + 100*0.15 + 100*0.10 = 0 + 15 + 20 + 15 + 10 = 60
    // profitScore = 60 → netMarginPct: 60 = m*200+50 → m = 0.05
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  0,
      netMarginPct:      0.05,
      debtServiceRatio:  0,
      overdueRatioPct:   0,
      maxBurdenScoreAbs: 0,
    })
    expect(result.composite).toBeCloseTo(60, 0)
    expect(result.status).toBe('caution')
  })

  it('composite just below 60 (59) → at-risk', () => {
    // cash=0(0.30)+profit=50*0.25+debt=100*0.20+recv=100*0.15+partner=100*0.10
    // = 0 + 12.5 + 20 + 15 + 10 = 57.5 → at-risk
    // profitScore=50 → netMarginPct: 50 = m*200+50 → m=0
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  0,
      netMarginPct:      0,
      debtServiceRatio:  0,
      overdueRatioPct:   0,
      maxBurdenScoreAbs: 0,
    })
    expect(result.composite).toBeLessThan(60)
    expect(result.status).toBe('at-risk')
  })

  it('composite just below 40 → critical', () => {
    // All zero → composite = 0 → critical
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  0,
      netMarginPct:      -0.25,
      debtServiceRatio:  1.0,
      overdueRatioPct:   100,
      maxBurdenScoreAbs: 0.5,
    })
    expect(result.composite).toBeLessThan(40)
    expect(result.status).toBe('critical')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Zero/negative/extreme input tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — zero, negative, large values', () => {
  it('cashScore is clamped at 0 for negative runway', () => {
    const result = computeSituation({
      ...IDEAL,
      isProfitable:     false,
      cashRunwayMonths: -5,   // negative runway → clamped to 0
    })
    expect(result.scores.cash).toBe(0)
  })

  it('cashScore is clamped at 100 for runway >= 10', () => {
    const result = computeSituation({
      ...IDEAL,
      isProfitable:     false,
      cashRunwayMonths: 15,   // 15 * 10 = 150 → clamped to 100
    })
    expect(result.scores.cash).toBe(100)
  })

  it('profitScore is clamped at 0 for very negative margin', () => {
    const result = computeSituation({
      ...IDEAL,
      netMarginPct: -1.0,   // -1.0*200+50 = -150 → clamped to 0
    })
    expect(result.scores.profit).toBe(0)
  })

  it('profitScore is clamped at 100 for very high margin', () => {
    const result = computeSituation({
      ...IDEAL,
      netMarginPct: 2.0,   // 2.0*200+50 = 450 → clamped to 100
    })
    expect(result.scores.profit).toBe(100)
  })

  it('debtScore is clamped at 0 for DSR > 1', () => {
    const result = computeSituation({
      ...IDEAL,
      debtServiceRatio: 1.5,   // 100 - 150 = -50 → clamped to 0
    })
    expect(result.scores.debt).toBe(0)
  })

  it('receivablesScore is clamped at 0 for overdueRatioPct > 100', () => {
    const result = computeSituation({
      ...IDEAL,
      overdueRatioPct: 150,   // 100 - 150 = -50 → clamped to 0
    })
    expect(result.scores.receivables).toBe(0)
  })

  it('partnerScore is clamped at 0 for maxBurdenScoreAbs >= 0.5', () => {
    const result = computeSituation({
      ...IDEAL,
      maxBurdenScoreAbs: 0.75,   // 100 - 0.75*200 = -50 → clamped to 0
    })
    expect(result.scores.partner).toBe(0)
  })

  it('partnerScore is 100 for maxBurdenScoreAbs = 0', () => {
    const result = computeSituation({ ...IDEAL, maxBurdenScoreAbs: 0 })
    expect(result.scores.partner).toBe(100)
  })

  it('zero netMarginPct: profitScore = 50', () => {
    const result = computeSituation({ ...IDEAL, netMarginPct: 0 })
    expect(result.scores.profit).toBe(50)
  })

  it('zero debtServiceRatio: debtScore = 100', () => {
    const result = computeSituation({ ...IDEAL, debtServiceRatio: 0 })
    expect(result.scores.debt).toBe(100)
  })

  it('profitScore is isProfitable-independent — only netMarginPct matters', () => {
    const profitable = computeSituation({ ...IDEAL, isProfitable: true,  netMarginPct: 0.10 })
    const lossy      = computeSituation({ ...IDEAL, isProfitable: false, netMarginPct: 0.10 })
    expect(profitable.scores.profit).toBe(lossy.scores.profit)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Monotonicity tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — monotonicity', () => {
  it('increasing cashRunwayMonths monotonically increases cashScore', () => {
    const run0  = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 0  }).scores.cash
    const run3  = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 3  }).scores.cash
    const run6  = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 6  }).scores.cash
    const run10 = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 10 }).scores.cash
    expect(run0).toBeLessThan(run3)
    expect(run3).toBeLessThan(run6)
    expect(run6).toBeLessThanOrEqual(run10)
  })

  it('increasing netMarginPct monotonically increases profitScore', () => {
    const m0  = computeSituation({ ...IDEAL, netMarginPct: -0.25 }).scores.profit
    const m10 = computeSituation({ ...IDEAL, netMarginPct:  0.00 }).scores.profit
    const m25 = computeSituation({ ...IDEAL, netMarginPct:  0.10 }).scores.profit
    expect(m0).toBeLessThan(m10)
    expect(m10).toBeLessThan(m25)
  })

  it('increasing debtServiceRatio monotonically decreases debtScore', () => {
    const d0  = computeSituation({ ...IDEAL, debtServiceRatio: 0.0 }).scores.debt
    const d05 = computeSituation({ ...IDEAL, debtServiceRatio: 0.5 }).scores.debt
    const d10 = computeSituation({ ...IDEAL, debtServiceRatio: 1.0 }).scores.debt
    expect(d0).toBeGreaterThan(d05)
    expect(d05).toBeGreaterThan(d10)
  })

  it('increasing overdueRatioPct monotonically decreases receivablesScore', () => {
    const o0   = computeSituation({ ...IDEAL, overdueRatioPct:   0 }).scores.receivables
    const o50  = computeSituation({ ...IDEAL, overdueRatioPct:  50 }).scores.receivables
    const o100 = computeSituation({ ...IDEAL, overdueRatioPct: 100 }).scores.receivables
    expect(o0).toBeGreaterThan(o50)
    expect(o50).toBeGreaterThan(o100)
  })

  it('increasing maxBurdenScoreAbs monotonically decreases partnerScore', () => {
    const b0  = computeSituation({ ...IDEAL, maxBurdenScoreAbs: 0.0 }).scores.partner
    const b25 = computeSituation({ ...IDEAL, maxBurdenScoreAbs: 0.25 }).scores.partner
    const b50 = computeSituation({ ...IDEAL, maxBurdenScoreAbs: 0.5 }).scores.partner
    expect(b0).toBeGreaterThan(b25)
    expect(b25).toBeGreaterThan(b50)
  })

  it('composite is monotonically non-decreasing as all scores improve', () => {
    const worst  = computeSituation({
      isProfitable: false, cashRunwayMonths: 0, netMarginPct: -0.25,
      debtServiceRatio: 1.0, overdueRatioPct: 100, maxBurdenScoreAbs: 0.5,
    })
    const medium = computeSituation({
      isProfitable: false, cashRunwayMonths: 5, netMarginPct: 0.05,
      debtServiceRatio: 0.3, overdueRatioPct: 30, maxBurdenScoreAbs: 0.1,
    })
    const best   = computeSituation(IDEAL)
    expect(worst.composite).toBeLessThanOrEqual(medium.composite)
    expect(medium.composite).toBeLessThanOrEqual(best.composite)
  })

  it('more critical alerts → lower or equal composite', () => {
    const r1 = computeSituation({ ...IDEAL, activeAlertCounts: { critical: 1, warning: 0, info: 0 } })
    const r3 = computeSituation({ ...IDEAL, activeAlertCounts: { critical: 3, warning: 0, info: 0 } })
    const r7 = computeSituation({ ...IDEAL, activeAlertCounts: { critical: 7, warning: 0, info: 0 } })
    expect(r1.composite).toBeGreaterThanOrEqual(r3.composite)
    expect(r3.composite).toBeGreaterThanOrEqual(r7.composite)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// criticalFactor field tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — criticalFactor', () => {
  it('returns growth message when all scores are high', () => {
    const result = computeSituation(IDEAL)
    expect(typeof result.criticalFactor).toBe('string')
    expect(result.criticalFactor.length).toBeGreaterThan(0)
    expect(result.criticalFactor).toContain('sağlıklı')
  })

  it('criticalFactor mentions nakit when cash is lowest', () => {
    const result = computeSituation({
      ...IDEAL,
      isProfitable:     false,
      cashRunwayMonths: 1,
    })
    expect(result.criticalFactor.toLowerCase()).toMatch(/nakit/)
  })

  it('criticalFactor mentions zarar when profit is negative', () => {
    const result = computeSituation({
      ...IDEAL,
      netMarginPct: -0.10,
    })
    expect(result.criticalFactor.toLowerCase()).toMatch(/zarar/)
  })

  it('criticalFactor mentions borç when debt is high', () => {
    const result = computeSituation({
      ...IDEAL,
      debtServiceRatio: 0.8,
    })
    expect(result.criticalFactor.toLowerCase()).toMatch(/borç/)
  })

  it('criticalFactor mentions alacak when receivables are overdue', () => {
    const result = computeSituation({
      ...IDEAL,
      overdueRatioPct: 70,
    })
    expect(result.criticalFactor.toLowerCase()).toMatch(/alacak/)
  })

  it('criticalFactor is a string for all-zero inputs', () => {
    const result = computeSituation({
      isProfitable:      false,
      cashRunwayMonths:  0,
      netMarginPct:      -0.3,
      debtServiceRatio:  1.0,
      overdueRatioPct:   100,
      maxBurdenScoreAbs: 0.5,
    })
    expect(typeof result.criticalFactor).toBe('string')
    expect(result.criticalFactor.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DSR half-point boundary tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — DSR boundary values', () => {
  it('debtServiceRatio=0.5 → debtScore=50', () => {
    const result = computeSituation({ ...IDEAL, debtServiceRatio: 0.5 })
    expect(result.scores.debt).toBeCloseTo(50, 1)
  })

  it('debtServiceRatio=0.25 → debtScore=75', () => {
    const result = computeSituation({ ...IDEAL, debtServiceRatio: 0.25 })
    expect(result.scores.debt).toBeCloseTo(75, 1)
  })

  it('debtServiceRatio=0.75 → debtScore=25', () => {
    const result = computeSituation({ ...IDEAL, debtServiceRatio: 0.75 })
    expect(result.scores.debt).toBeCloseTo(25, 1)
  })

  it('debtServiceRatio=1.0 → debtScore=0', () => {
    const result = computeSituation({ ...IDEAL, debtServiceRatio: 1.0 })
    expect(result.scores.debt).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Profitable vs unprofitable cash score
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — isProfitable cash override', () => {
  it('isProfitable=true → cashScore=100 regardless of cashRunwayMonths=0', () => {
    const result = computeSituation({ ...IDEAL, isProfitable: true, cashRunwayMonths: 0 })
    expect(result.scores.cash).toBe(100)
  })

  it('isProfitable=true overrides even zero runway', () => {
    const profitable = computeSituation({ ...IDEAL, isProfitable: true,  cashRunwayMonths: 0 })
    const lossy      = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 0 })
    expect(profitable.scores.cash).toBeGreaterThan(lossy.scores.cash)
  })

  it('isProfitable=true with high runway is still cashScore=100', () => {
    const result = computeSituation({ ...IDEAL, isProfitable: true, cashRunwayMonths: 24 })
    expect(result.scores.cash).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Weight proportionality tests
// ─────────────────────────────────────────────────────────────────────────────

describe('computeSituation — weight proportionality', () => {
  it('cash weight (0.30) has largest single impact on composite', () => {
    const dropCash   = computeSituation({ ...IDEAL, isProfitable: false, cashRunwayMonths: 0 })
    const dropProfit = computeSituation({ ...IDEAL, netMarginPct: -0.25 })
    // Cash drop is larger (30 points) vs profit drop ≤ 25 points
    expect(100 - dropCash.composite).toBeGreaterThanOrEqual(100 - dropProfit.composite)
  })

  it('partner weight (0.10) has smallest single impact', () => {
    const dropPartner = computeSituation({ ...IDEAL, maxBurdenScoreAbs: 0.5 })
    const dropDebt    = computeSituation({ ...IDEAL, debtServiceRatio: 1.0 })
    // Partner drop ≤ debt drop
    expect(100 - dropPartner.composite).toBeLessThanOrEqual(100 - dropDebt.composite)
  })
})
