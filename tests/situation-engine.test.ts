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
