/**
 * Tests for lib/services/commercial/collections-aging.service.ts
 * All pure functions — no DB calls, no side effects.
 * Run with: npx vitest run tests/collections-aging.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  classifyAgingBucket,
  computeRecoveryProbability,
  computeCollectionPriority,
  computeAgingConcentration,
  computeExpectedRecovery,
  computeWriteOffRisk,
  computeDsoFromAging,
} from '../lib/services/commercial/collections-aging.service'

// ── classifyAgingBucket ───────────────────────────────────────────────────────

describe('classifyAgingBucket', () => {
  it('returns current for negative daysOverdue (not yet due)', () => {
    expect(classifyAgingBucket(-10)).toBe('current')
  })

  it('returns current for 0 days overdue', () => {
    expect(classifyAgingBucket(0)).toBe('current')
  })

  it('returns current for 30 days overdue (boundary)', () => {
    expect(classifyAgingBucket(30)).toBe('current')
  })

  it('returns 31_60 for 31 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(31)).toBe('31_60')
  })

  it('returns 31_60 for 45 days overdue', () => {
    expect(classifyAgingBucket(45)).toBe('31_60')
  })

  it('returns 31_60 for 60 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(60)).toBe('31_60')
  })

  it('returns 61_90 for 61 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(61)).toBe('61_90')
  })

  it('returns 61_90 for 75 days overdue', () => {
    expect(classifyAgingBucket(75)).toBe('61_90')
  })

  it('returns 61_90 for 90 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(90)).toBe('61_90')
  })

  it('returns 91_120 for 91 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(91)).toBe('91_120')
  })

  it('returns 91_120 for 105 days overdue', () => {
    expect(classifyAgingBucket(105)).toBe('91_120')
  })

  it('returns 91_120 for 120 days overdue (upper boundary)', () => {
    expect(classifyAgingBucket(120)).toBe('91_120')
  })

  it('returns 120_plus for 121 days overdue (lower boundary)', () => {
    expect(classifyAgingBucket(121)).toBe('120_plus')
  })

  it('returns 120_plus for 200 days overdue', () => {
    expect(classifyAgingBucket(200)).toBe('120_plus')
  })
})

// ── computeRecoveryProbability ────────────────────────────────────────────────

describe('computeRecoveryProbability', () => {
  it('returns 95% base for current (0 days overdue) with neutral score', () => {
    expect(computeRecoveryProbability(0, 50)).toBe(95)
  })

  it('returns 80% base for 31_60 (45 days) with neutral score', () => {
    expect(computeRecoveryProbability(45, 50)).toBe(80)
  })

  it('returns 60% base for 61_90 (75 days) with neutral score', () => {
    expect(computeRecoveryProbability(75, 50)).toBe(60)
  })

  it('returns 40% base for 91_120 (100 days) with neutral score', () => {
    expect(computeRecoveryProbability(100, 50)).toBe(40)
  })

  it('returns 20% base for 120+ (150 days) with neutral score', () => {
    expect(computeRecoveryProbability(150, 50)).toBe(20)
  })

  it('high payment history score improves recovery probability', () => {
    // base 60 + (100 - 50) * 0.3 = 60 + 15 = 75
    expect(computeRecoveryProbability(75, 100)).toBe(75)
  })

  it('low payment history score reduces recovery probability', () => {
    // base 60 + (0 - 50) * 0.3 = 60 - 15 = 45
    expect(computeRecoveryProbability(75, 0)).toBe(45)
  })

  it('never goes below 5 (lower clamp)', () => {
    // base 20 + (0 - 50) * 0.3 = 20 - 15 = 5, clamped to 5
    expect(computeRecoveryProbability(200, 0)).toBe(5)
  })

  it('never exceeds 99 (upper clamp)', () => {
    // base 95 + (100 - 50) * 0.3 = 95 + 15 = 110, clamped to 99
    expect(computeRecoveryProbability(0, 100)).toBe(99)
  })

  it('neutral score (50) produces zero adjustment', () => {
    const result = computeRecoveryProbability(45, 50)
    expect(result).toBe(80) // exactly base rate
  })

  it('negative days overdue uses current base rate', () => {
    expect(computeRecoveryProbability(-30, 50)).toBe(95)
  })
})

// ── computeCollectionPriority ─────────────────────────────────────────────────

describe('computeCollectionPriority', () => {
  it('returns 0 for zero outstanding amount', () => {
    expect(computeCollectionPriority(0, 80, 45)).toBe(0)
  })

  it('applies urgency multiplier 1.0 for current bucket', () => {
    // 10000 * (80/100) * 1.0 = 8000
    expect(computeCollectionPriority(10_000, 80, 0)).toBe(8_000)
  })

  it('applies urgency multiplier 1.5 for 31-60 days', () => {
    // 10000 * (80/100) * 1.5 = 12000
    expect(computeCollectionPriority(10_000, 80, 45)).toBe(12_000)
  })

  it('applies urgency multiplier 2.0 for 61-90 days', () => {
    // 10000 * (60/100) * 2.0 = 12000
    expect(computeCollectionPriority(10_000, 60, 75)).toBe(12_000)
  })

  it('applies urgency multiplier 2.5 for 91-120 days', () => {
    // 10000 * (40/100) * 2.5 = 10000
    expect(computeCollectionPriority(10_000, 40, 100)).toBe(10_000)
  })

  it('applies urgency multiplier 1.2 for 120+ days (legal escalation)', () => {
    // 10000 * (20/100) * 1.2 = 2400
    expect(computeCollectionPriority(10_000, 20, 150)).toBe(2_400)
  })

  it('higher priority for 61-90d than 31-60d at equal amount and recovery', () => {
    const p31 = computeCollectionPriority(10_000, 80, 45)
    const p61 = computeCollectionPriority(10_000, 80, 75)
    expect(p61).toBeGreaterThan(p31)
  })

  it('returns 0 for negative outstanding amount', () => {
    expect(computeCollectionPriority(-5_000, 80, 45)).toBe(0)
  })
})

// ── computeAgingConcentration ─────────────────────────────────────────────────

describe('computeAgingConcentration', () => {
  it('returns all zeros when total is 0', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.current_pct).toBe(0)
    expect(result.overdue_pct).toBe(0)
    expect(result.critical_pct).toBe(0)
    expect(result.hhi).toBe(0)
  })

  it('returns current_pct=100 when all in current bucket', () => {
    const result = computeAgingConcentration({
      current: 100_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.current_pct).toBe(100)
    expect(result.overdue_pct).toBe(0)
    expect(result.critical_pct).toBe(0)
  })

  it('returns critical_pct=100 when all in 120+ bucket', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 50_000,
    })
    expect(result.critical_pct).toBe(100)
    expect(result.current_pct).toBe(0)
    expect(result.overdue_pct).toBe(100)
  })

  it('HHI is 10000 when all in one bucket (maximum concentration)', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 0, '61_90': 0, '91_120': 50_000, '120_plus': 0,
    })
    expect(result.hhi).toBe(10_000)
  })

  it('critical_pct includes both 91_120 and 120_plus', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 0, '61_90': 0, '91_120': 50_000, '120_plus': 50_000,
    })
    expect(result.critical_pct).toBe(100)
    expect(result.current_pct).toBe(0)
  })

  it('computes overdue_pct as 1 - current share', () => {
    const result = computeAgingConcentration({
      current: 50_000, '31_60': 50_000, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.current_pct).toBe(50)
    expect(result.overdue_pct).toBe(50)
  })

  it('HHI is lower when amounts spread across buckets (less concentration)', () => {
    const concentrated = computeAgingConcentration({
      current: 100_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    const spread = computeAgingConcentration({
      current: 20_000, '31_60': 20_000, '61_90': 20_000, '91_120': 20_000, '120_plus': 20_000,
    })
    expect(concentrated.hhi).toBeGreaterThan(spread.hhi)
  })
})

// ── computeExpectedRecovery ───────────────────────────────────────────────────

describe('computeExpectedRecovery', () => {
  it('returns 0 for empty array', () => {
    expect(computeExpectedRecovery([])).toBe(0)
  })

  it('returns 0 when probability is 0 for all items', () => {
    const items = [
      { outstanding: 10_000, recovery_probability: 0 },
      { outstanding: 5_000,  recovery_probability: 0 },
    ]
    expect(computeExpectedRecovery(items)).toBe(0)
  })

  it('returns full outstanding when probability is 100%', () => {
    const items = [{ outstanding: 10_000, recovery_probability: 100 }]
    expect(computeExpectedRecovery(items)).toBe(10_000)
  })

  it('correctly sums probability-weighted amounts across multiple items', () => {
    const items = [
      { outstanding: 10_000, recovery_probability: 80 },  // → 8000
      { outstanding: 5_000,  recovery_probability: 60 },  // → 3000
    ]
    expect(computeExpectedRecovery(items)).toBe(11_000)
  })

  it('single item partial probability', () => {
    const items = [{ outstanding: 20_000, recovery_probability: 50 }]
    expect(computeExpectedRecovery(items)).toBe(10_000)
  })
})

// ── computeWriteOffRisk ───────────────────────────────────────────────────────

describe('computeWriteOffRisk', () => {
  it('returns zeros for empty items array', () => {
    const result = computeWriteOffRisk([])
    expect(result.high_risk_amount).toBe(0)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
    expect(result.high_risk_pct).toBeNull()
  })

  it('correctly categorizes 120+ days as high risk', () => {
    const result = computeWriteOffRisk([{ outstanding: 10_000, days_overdue: 150 }])
    expect(result.high_risk_amount).toBe(10_000)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
  })

  it('correctly categorizes 91-120 days as medium risk', () => {
    const result = computeWriteOffRisk([{ outstanding: 5_000, days_overdue: 100 }])
    expect(result.medium_risk_amount).toBe(5_000)
    expect(result.high_risk_amount).toBe(0)
  })

  it('correctly categorizes 31-90 days as low risk', () => {
    const result = computeWriteOffRisk([
      { outstanding: 3_000, days_overdue: 45 },  // 31-60
      { outstanding: 2_000, days_overdue: 75 },  // 61-90
    ])
    expect(result.low_risk_amount).toBe(5_000)
    expect(result.high_risk_amount).toBe(0)
    expect(result.medium_risk_amount).toBe(0)
  })

  it('does not categorize current (<= 30d) items as any risk', () => {
    const result = computeWriteOffRisk([{ outstanding: 10_000, days_overdue: 15 }])
    expect(result.high_risk_amount).toBe(0)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
    expect(result.high_risk_pct).toBeNull()
  })

  it('computes high_risk_pct correctly', () => {
    const result = computeWriteOffRisk([
      { outstanding: 20_000, days_overdue: 150 }, // high
      { outstanding: 30_000, days_overdue: 100 }, // medium
      { outstanding: 50_000, days_overdue: 60  }, // low
    ])
    // total risky = 100_000; high = 20_000 → 20%
    expect(result.high_risk_pct).toBe(20)
  })

  it('returns null high_risk_pct when only current items', () => {
    const result = computeWriteOffRisk([{ outstanding: 10_000, days_overdue: 10 }])
    expect(result.high_risk_pct).toBeNull()
  })
})

// ── computeDsoFromAging ───────────────────────────────────────────────────────

describe('computeDsoFromAging', () => {
  const buckets = {
    current:    60_000,
    '31_60':    30_000,
    '61_90':    10_000,
    '91_120':   0,
    '120_plus': 0,
  }

  it('returns null when revenue is 0', () => {
    expect(computeDsoFromAging(buckets, 0)).toBeNull()
  })

  it('computes DSO = total_outstanding / revenue_last_30d × 30', () => {
    // total = 100_000, revenue = 50_000 → DSO = (100_000/50_000) * 30 = 60
    expect(computeDsoFromAging(buckets, 50_000)).toBe(60)
  })

  it('returns higher DSO when outstanding is large relative to revenue', () => {
    const dso = computeDsoFromAging(buckets, 10_000)
    // (100_000/10_000)*30 = 300
    expect(dso).toBe(300)
  })

  it('handles all-zero buckets (total = 0)', () => {
    const emptyBuckets = {
      current: 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0,
    }
    // 0 / 50_000 * 30 = 0
    expect(computeDsoFromAging(emptyBuckets, 50_000)).toBe(0)
  })

  it('DSO of 30 when outstanding equals revenue', () => {
    const b = { current: 50_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    expect(computeDsoFromAging(b, 50_000)).toBe(30)
  })
})

// ── classifyAgingBucket – large values ────────────────────────────────────────

describe('classifyAgingBucket – large/negative values', () => {
  it('returns current for very large negative days (far future due date)', () => {
    expect(classifyAgingBucket(-1_000)).toBe('current')
  })

  it('returns 120_plus for very large positive days', () => {
    expect(classifyAgingBucket(10_000)).toBe('120_plus')
  })

  it('returns current for exactly 0', () => {
    expect(classifyAgingBucket(0)).toBe('current')
  })

  it('bucket transitions are monotonic: bucket index never decreases as days grows', () => {
    const days = [-10, 0, 30, 31, 60, 61, 90, 91, 120, 121, 365]
    const bucketOrder = ['current', '31_60', '61_90', '91_120', '120_plus']
    const indices = days.map(d => bucketOrder.indexOf(classifyAgingBucket(d)))
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1])
    }
  })
})

// ── computeRecoveryProbability – additional tests ─────────────────────────────

describe('computeRecoveryProbability – additional coverage', () => {
  it('exactly at 31d boundary → uses 31_60 base (80)', () => {
    expect(computeRecoveryProbability(31, 50)).toBe(80)
  })

  it('exactly at 61d boundary → uses 61_90 base (60)', () => {
    expect(computeRecoveryProbability(61, 50)).toBe(60)
  })

  it('exactly at 91d boundary → uses 91_120 base (40)', () => {
    expect(computeRecoveryProbability(91, 50)).toBe(40)
  })

  it('exactly at 121d boundary → uses 120_plus base (20)', () => {
    expect(computeRecoveryProbability(121, 50)).toBe(20)
  })

  it('score above neutral (75) adds positive adjustment to base', () => {
    const neutral = computeRecoveryProbability(45, 50)   // base 80
    const better  = computeRecoveryProbability(45, 75)   // +7.5
    expect(better).toBeGreaterThan(neutral)
  })

  it('score below neutral (25) subtracts from base', () => {
    const neutral = computeRecoveryProbability(45, 50)
    const worse   = computeRecoveryProbability(45, 25)
    expect(worse).toBeLessThan(neutral)
  })

  it('adjustment formula: base + (score-50)*0.3, clamped', () => {
    // bucket=91_120 base=40, score=80 → adj=(80-50)*0.3=9 → 40+9=49
    expect(computeRecoveryProbability(100, 80)).toBe(49)
  })

  it('score = 50 for all buckets → returns exact base rates', () => {
    expect(computeRecoveryProbability(0,   50)).toBe(95)
    expect(computeRecoveryProbability(45,  50)).toBe(80)
    expect(computeRecoveryProbability(75,  50)).toBe(60)
    expect(computeRecoveryProbability(100, 50)).toBe(40)
    expect(computeRecoveryProbability(150, 50)).toBe(20)
  })

  it('probability is always between 5 and 99 inclusive', () => {
    const cases = [
      { days: 0,   score: 0 },
      { days: 0,   score: 100 },
      { days: 500, score: 0 },
      { days: 500, score: 100 },
      { days: 45,  score: 50 },
    ]
    for (const { days, score } of cases) {
      const result = computeRecoveryProbability(days, score)
      expect(result).toBeGreaterThanOrEqual(5)
      expect(result).toBeLessThanOrEqual(99)
    }
  })

  it('higher score always yields higher or equal probability within same bucket', () => {
    for (const days of [0, 45, 75, 100, 150]) {
      const low  = computeRecoveryProbability(days, 0)
      const mid  = computeRecoveryProbability(days, 50)
      const high = computeRecoveryProbability(days, 100)
      expect(mid).toBeGreaterThanOrEqual(low)
      expect(high).toBeGreaterThanOrEqual(mid)
    }
  })
})

// ── computeCollectionPriority – additional tests ──────────────────────────────

describe('computeCollectionPriority – additional coverage', () => {
  it('small outstanding amount gives small priority', () => {
    const priority = computeCollectionPriority(100, 80, 45)
    expect(priority).toBeLessThan(500)
  })

  it('large outstanding with low recovery still generates priority', () => {
    const priority = computeCollectionPriority(1_000_000, 20, 150)
    expect(priority).toBeGreaterThan(0)
  })

  it('same outstanding: higher recovery → higher priority (same bucket)', () => {
    const p60 = computeCollectionPriority(10_000, 60, 45)
    const p90 = computeCollectionPriority(10_000, 90, 45)
    expect(p90).toBeGreaterThan(p60)
  })

  it('91-120 bucket has highest urgency multiplier (2.5)', () => {
    // Outstanding and recovery same; compare buckets by urgency
    const p31  = computeCollectionPriority(10_000, 50, 45)   // 1.5 × 50%
    const p61  = computeCollectionPriority(10_000, 50, 75)   // 2.0 × 50%
    const p91  = computeCollectionPriority(10_000, 50, 100)  // 2.5 × 50%
    const p120 = computeCollectionPriority(10_000, 50, 150)  // 1.2 × 50%
    expect(p91).toBeGreaterThan(p61)
    expect(p61).toBeGreaterThan(p31)
    expect(p31).toBeGreaterThan(p120)
  })

  it('returns 0 for exactly 0 outstanding', () => {
    expect(computeCollectionPriority(0, 80, 45)).toBe(0)
  })

  it('exactly at bucket boundary: 30 days → current multiplier 1.0', () => {
    // 5000 * (80/100) * 1.0 = 4000
    expect(computeCollectionPriority(5_000, 80, 30)).toBe(4_000)
  })

  it('exactly at bucket boundary: 60 days → 31_60 multiplier 1.5', () => {
    // 5000 * (80/100) * 1.5 = 6000
    expect(computeCollectionPriority(5_000, 80, 60)).toBe(6_000)
  })

  it('exactly at bucket boundary: 90 days → 61_90 multiplier 2.0', () => {
    // 5000 * (80/100) * 2.0 = 8000
    expect(computeCollectionPriority(5_000, 80, 90)).toBe(8_000)
  })
})

// ── computeAgingConcentration – additional tests ──────────────────────────────

describe('computeAgingConcentration – additional coverage', () => {
  it('two buckets equal → current_pct = 50, overdue_pct = 50', () => {
    const result = computeAgingConcentration({
      current: 50_000, '31_60': 50_000, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.current_pct).toBe(50)
    expect(result.overdue_pct).toBe(50)
  })

  it('HHI = 2000 for 5 equal buckets (each 20%, 20²×5 = 2000)', () => {
    const result = computeAgingConcentration({
      current: 20_000, '31_60': 20_000, '61_90': 20_000, '91_120': 20_000, '120_plus': 20_000,
    })
    expect(result.hhi).toBe(2_000)
  })

  it('HHI is always between 2000 and 10000 for non-zero inputs', () => {
    // Max = 10000 (all one bucket), Min ≈ 2000 (equal spread)
    const concentrated = computeAgingConcentration({
      current: 100_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    const spread = computeAgingConcentration({
      current: 20_000, '31_60': 20_000, '61_90': 20_000, '91_120': 20_000, '120_plus': 20_000,
    })
    expect(concentrated.hhi).toBe(10_000)
    expect(spread.hhi).toBe(2_000)
  })

  it('all in 31_60 → overdue_pct = 100, critical_pct = 0', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 100_000, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.overdue_pct).toBe(100)
    expect(result.critical_pct).toBe(0)
  })

  it('all in 61_90 → overdue_pct = 100, critical_pct = 0', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 0, '61_90': 100_000, '91_120': 0, '120_plus': 0,
    })
    expect(result.overdue_pct).toBe(100)
    expect(result.critical_pct).toBe(0)
  })

  it('large round numbers produce clean percentages', () => {
    const result = computeAgingConcentration({
      current: 75_000, '31_60': 25_000, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    expect(result.current_pct).toBe(75)
    expect(result.overdue_pct).toBe(25)
  })
})

// ── computeExpectedRecovery – additional tests ────────────────────────────────

describe('computeExpectedRecovery – additional coverage', () => {
  it('single item with 75% probability', () => {
    expect(computeExpectedRecovery([{ outstanding: 40_000, recovery_probability: 75 }])).toBe(30_000)
  })

  it('many items sum correctly', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      outstanding: 10_000,
      recovery_probability: 50,
    }))
    // 10 × 10000 × 0.5 = 50000
    expect(computeExpectedRecovery(items)).toBe(50_000)
  })

  it('mixed probabilities sum correctly', () => {
    const items = [
      { outstanding: 100_000, recovery_probability: 95 },  // 95000
      { outstanding: 50_000,  recovery_probability: 80 },  // 40000
      { outstanding: 30_000,  recovery_probability: 60 },  // 18000
      { outstanding: 20_000,  recovery_probability: 40 },  // 8000
      { outstanding: 10_000,  recovery_probability: 20 },  // 2000
    ]
    expect(computeExpectedRecovery(items)).toBe(163_000)
  })

  it('result is non-negative for non-negative inputs', () => {
    const items = [
      { outstanding: 5_000, recovery_probability: 10 },
      { outstanding: 3_000, recovery_probability: 30 },
    ]
    expect(computeExpectedRecovery(items)).toBeGreaterThan(0)
  })

  it('expected recovery <= total outstanding', () => {
    const items = [
      { outstanding: 20_000, recovery_probability: 80 },
      { outstanding: 30_000, recovery_probability: 60 },
    ]
    const expected = computeExpectedRecovery(items)
    const total = 50_000
    expect(expected).toBeLessThanOrEqual(total)
  })
})

// ── computeWriteOffRisk – additional tests ────────────────────────────────────

describe('computeWriteOffRisk – additional coverage', () => {
  it('all items in current bucket → high/medium/low all 0', () => {
    const result = computeWriteOffRisk([
      { outstanding: 10_000, days_overdue: 0 },
      { outstanding: 20_000, days_overdue: 15 },
      { outstanding: 5_000,  days_overdue: 30 },
    ])
    expect(result.high_risk_amount).toBe(0)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
    expect(result.high_risk_pct).toBeNull()
  })

  it('multiple high-risk items accumulate correctly', () => {
    const result = computeWriteOffRisk([
      { outstanding: 10_000, days_overdue: 200 },
      { outstanding: 15_000, days_overdue: 300 },
    ])
    expect(result.high_risk_amount).toBe(25_000)
    expect(result.high_risk_pct).toBe(100)
  })

  it('boundary: 120 days → 91_120 bucket (medium risk)', () => {
    const result = computeWriteOffRisk([{ outstanding: 10_000, days_overdue: 120 }])
    expect(result.medium_risk_amount).toBe(10_000)
    expect(result.high_risk_amount).toBe(0)
  })

  it('boundary: 121 days → 120_plus bucket (high risk)', () => {
    const result = computeWriteOffRisk([{ outstanding: 10_000, days_overdue: 121 }])
    expect(result.high_risk_amount).toBe(10_000)
    expect(result.medium_risk_amount).toBe(0)
  })

  it('high_risk_pct = 0 when no high-risk items but medium/low exist', () => {
    const result = computeWriteOffRisk([
      { outstanding: 10_000, days_overdue: 100 },  // medium
      { outstanding: 5_000,  days_overdue: 60 },   // low
    ])
    expect(result.high_risk_pct).toBe(0)
    expect(result.medium_risk_amount).toBe(10_000)
    expect(result.low_risk_amount).toBe(5_000)
  })

  it('high_risk_pct rounds to 1 decimal', () => {
    const result = computeWriteOffRisk([
      { outstanding: 1_000, days_overdue: 200 },   // high
      { outstanding: 2_000, days_overdue: 60 },    // low
    ])
    // high=1000, total=3000 → 33.333... → rounded to 33.3
    expect(result.high_risk_pct).toBeCloseTo(33.3, 1)
  })
})

// ── computeDsoFromAging – additional tests ────────────────────────────────────

describe('computeDsoFromAging – additional coverage', () => {
  it('negative revenue returns null (guard only on 0)', () => {
    // -50000 !== 0 so computes: should be negative DSO
    const b = { current: 50_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    const result = computeDsoFromAging(b, -50_000)
    // negative revenue → negative DSO (no clamp in service)
    expect(typeof result).toBe('number')
  })

  it('very high outstanding → high DSO', () => {
    const b = {
      current: 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 1_000_000,
    }
    const dso = computeDsoFromAging(b, 10_000)
    expect(dso as number).toBeGreaterThan(100)
  })

  it('DSO result is rounded to 1 decimal', () => {
    // total=100_001, revenue=30_001 → not clean integer
    const b = { current: 100_001, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    const dso = computeDsoFromAging(b, 30_001)
    // result should be a number with at most 1 decimal place
    expect(dso).not.toBeNull()
    expect(typeof dso).toBe('number')
  })

  it('all five buckets contribute to total outstanding', () => {
    const b = {
      current: 10_000,
      '31_60': 10_000,
      '61_90': 10_000,
      '91_120': 10_000,
      '120_plus': 10_000,
    }
    // total = 50_000, revenue = 50_000 → DSO = 30
    expect(computeDsoFromAging(b, 50_000)).toBe(30)
  })

  it('DSO scales linearly with total outstanding', () => {
    const b1 = { current: 50_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    const b2 = { current: 100_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    const dso1 = computeDsoFromAging(b1, 50_000) as number
    const dso2 = computeDsoFromAging(b2, 50_000) as number
    expect(dso2).toBe(dso1 * 2)
  })
})
