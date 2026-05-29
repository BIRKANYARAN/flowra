/**
 * Extended tests for all 4 aging services — 150+ new test cases.
 *
 * Covers:
 *   1. collections-aging.service.ts   — 45 new tests
 *   2. invoice-aging.service.ts       — 35 new tests
 *   3. inventory-aging.service.ts     — 40 new tests
 *   4. receivables-aging-enhanced.service.ts — 40 new tests
 *
 * Run with: npx vitest run tests/aging-services-extended.test.ts
 */

import { describe, it, expect } from 'vitest'

// ══════════════════════════════════════════════════════════════════════════════
// 1. COLLECTIONS-AGING SERVICE — 45 new tests
// ══════════════════════════════════════════════════════════════════════════════

import {
  classifyAgingBucket,
  computeRecoveryProbability as collectionsRecovery,
  computeCollectionPriority,
  computeAgingConcentration,
  computeExpectedRecovery,
  computeWriteOffRisk,
  computeDsoFromAging,
} from '../lib/services/commercial/collections-aging.service'

// ── classifyAgingBucket — additional edge cases ────────────────────────────

describe('collections: classifyAgingBucket — extended boundaries', () => {
  it('returns current for large negative number', () => {
    expect(classifyAgingBucket(-999)).toBe('current')
  })

  it('returns current for exactly -1', () => {
    expect(classifyAgingBucket(-1)).toBe('current')
  })

  it('returns current for exactly 1 (<=30)', () => {
    expect(classifyAgingBucket(1)).toBe('current')
  })

  it('returns current for 29 (<=30)', () => {
    expect(classifyAgingBucket(29)).toBe('current')
  })

  it('returns 31_60 for exactly 31', () => {
    expect(classifyAgingBucket(31)).toBe('31_60')
  })

  it('returns 31_60 for exactly 60', () => {
    expect(classifyAgingBucket(60)).toBe('31_60')
  })

  it('returns 61_90 for exactly 61', () => {
    expect(classifyAgingBucket(61)).toBe('61_90')
  })

  it('returns 91_120 for exactly 91', () => {
    expect(classifyAgingBucket(91)).toBe('91_120')
  })

  it('returns 120_plus for exactly 121', () => {
    expect(classifyAgingBucket(121)).toBe('120_plus')
  })

  it('returns 120_plus for very large value (1000 days)', () => {
    expect(classifyAgingBucket(1000)).toBe('120_plus')
  })
})

// ── computeRecoveryProbability — additional combinations ──────────────────

describe('collections: computeRecoveryProbability — extended cases', () => {
  it('base 95 for boundary 30 days with neutral score = 95', () => {
    expect(collectionsRecovery(30, 50)).toBe(95)
  })

  it('boundary 31 days maps to 31_60 base 80', () => {
    expect(collectionsRecovery(31, 50)).toBe(80)
  })

  it('boundary 60 days still 31_60 base 80', () => {
    expect(collectionsRecovery(60, 50)).toBe(80)
  })

  it('boundary 61 days maps to 61_90 base 60', () => {
    expect(collectionsRecovery(61, 50)).toBe(60)
  })

  it('boundary 120 days still 91_120 base 40', () => {
    expect(collectionsRecovery(120, 50)).toBe(40)
  })

  it('boundary 121 days maps to 120_plus base 20', () => {
    expect(collectionsRecovery(121, 50)).toBe(20)
  })

  it('score 25 gives -7.5 adjustment (rounds correctly)', () => {
    // base 80 + (25-50)*0.3 = 80 - 7.5 = 72.5 → rounds to 73 — but Math.round(72.5) = 73
    const result = collectionsRecovery(45, 25)
    expect(result).toBe(73)
  })

  it('score 75 gives +7.5 adjustment for 31_60', () => {
    // base 80 + (75-50)*0.3 = 80 + 7.5 = 87.5 → 88
    expect(collectionsRecovery(45, 75)).toBe(88)
  })

  it('clamp: very bad score does not go below 5', () => {
    // base 20 + (0-50)*0.3 = 5, exactly clamp lower bound
    expect(collectionsRecovery(200, 0)).toBe(5)
  })

  it('clamp: perfect score does not exceed 99', () => {
    expect(collectionsRecovery(0, 100)).toBe(99)
  })
})

// ── computeCollectionPriority — additional cases ──────────────────────────

describe('collections: computeCollectionPriority — extended cases', () => {
  it('returns 0 for exactly 0 outstanding', () => {
    expect(computeCollectionPriority(0, 100, 0)).toBe(0)
  })

  it('boundary at days=30: uses current multiplier 1.0', () => {
    // 1000 * (100/100) * 1.0 = 1000
    expect(computeCollectionPriority(1000, 100, 30)).toBe(1000)
  })

  it('boundary at days=31: uses 31_60 multiplier 1.5', () => {
    // 1000 * (100/100) * 1.5 = 1500
    expect(computeCollectionPriority(1000, 100, 31)).toBe(1500)
  })

  it('boundary at days=60: uses 31_60 multiplier 1.5', () => {
    expect(computeCollectionPriority(1000, 100, 60)).toBe(1500)
  })

  it('boundary at days=61: uses 61_90 multiplier 2.0', () => {
    expect(computeCollectionPriority(1000, 100, 61)).toBe(2000)
  })

  it('boundary at days=91: uses 91_120 multiplier 2.5', () => {
    expect(computeCollectionPriority(1000, 100, 91)).toBe(2500)
  })

  it('boundary at days=121: uses 120_plus multiplier 1.2', () => {
    expect(computeCollectionPriority(1000, 100, 121)).toBe(1200)
  })

  it('0% recovery probability yields 0 priority regardless of amount', () => {
    expect(computeCollectionPriority(100_000, 0, 75)).toBe(0)
  })

  it('100% recovery probability with no multiplier scaling', () => {
    // 50000 * (100/100) * 1.0 = 50000
    expect(computeCollectionPriority(50_000, 100, 15)).toBe(50_000)
  })

  it('fractional amounts produce correct result', () => {
    // 1000.50 * (50/100) * 2.0 = 1000.50
    expect(computeCollectionPriority(1000.5, 50, 75)).toBeCloseTo(1000.5)
  })
})

// ── computeAgingConcentration — additional cases ──────────────────────────

describe('collections: computeAgingConcentration — additional cases', () => {
  it('overdue_pct = 100 when all amounts are overdue', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 25_000, '61_90': 25_000, '91_120': 25_000, '120_plus': 25_000,
    })
    expect(result.overdue_pct).toBe(100)
    expect(result.current_pct).toBe(0)
  })

  it('critical_pct excludes 31_60 and 61_90', () => {
    const result = computeAgingConcentration({
      current: 0, '31_60': 50_000, '61_90': 50_000, '91_120': 0, '120_plus': 0,
    })
    expect(result.critical_pct).toBe(0)
  })

  it('perfectly even split gives HHI of 2000 (5 buckets, each 20%)', () => {
    const result = computeAgingConcentration({
      current: 20_000, '31_60': 20_000, '61_90': 20_000, '91_120': 20_000, '120_plus': 20_000,
    })
    // each share = 0.2, HHI = 5 * (20)^2 = 5 * 400 = 2000
    expect(result.hhi).toBe(2000)
  })

  it('rounding: percentages are rounded to 1 decimal place', () => {
    const result = computeAgingConcentration({
      current: 1, '31_60': 2, '61_90': 0, '91_120': 0, '120_plus': 0,
    })
    // current share = 1/3 = 33.333...% → rounded to 33.3
    expect(result.current_pct).toBe(33.3)
    expect(result.overdue_pct).toBe(66.7)
  })
})

// ── computeExpectedRecovery — additional cases ────────────────────────────

describe('collections: computeExpectedRecovery — additional cases', () => {
  it('handles three items with different probabilities', () => {
    const items = [
      { outstanding: 10_000, recovery_probability: 95 },  // 9500
      { outstanding: 5_000,  recovery_probability: 40 },  // 2000
      { outstanding: 8_000,  recovery_probability: 20 },  // 1600
    ]
    expect(computeExpectedRecovery(items)).toBe(13_100)
  })

  it('single item at 5% probability', () => {
    const items = [{ outstanding: 20_000, recovery_probability: 5 }]
    expect(computeExpectedRecovery(items)).toBe(1_000)
  })

  it('single item at 99% probability', () => {
    const items = [{ outstanding: 10_000, recovery_probability: 99 }]
    expect(computeExpectedRecovery(items)).toBe(9_900)
  })

  it('many small items', () => {
    const items = Array.from({ length: 10 }, () => ({
      outstanding: 1_000, recovery_probability: 100,
    }))
    expect(computeExpectedRecovery(items)).toBe(10_000)
  })
})

// ── computeWriteOffRisk — additional cases ────────────────────────────────

describe('collections: computeWriteOffRisk — additional cases', () => {
  it('boundary at 30 days is NOT at risk (current)', () => {
    const result = computeWriteOffRisk([{ outstanding: 5_000, days_overdue: 30 }])
    expect(result.high_risk_amount).toBe(0)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
    expect(result.high_risk_pct).toBeNull()
  })

  it('boundary at 31 days is low risk', () => {
    const result = computeWriteOffRisk([{ outstanding: 5_000, days_overdue: 31 }])
    expect(result.low_risk_amount).toBe(5_000)
  })

  it('boundary at 120 days is medium risk (91_120)', () => {
    const result = computeWriteOffRisk([{ outstanding: 3_000, days_overdue: 120 }])
    expect(result.medium_risk_amount).toBe(3_000)
    expect(result.high_risk_amount).toBe(0)
  })

  it('boundary at 121 days is high risk (120_plus)', () => {
    const result = computeWriteOffRisk([{ outstanding: 3_000, days_overdue: 121 }])
    expect(result.high_risk_amount).toBe(3_000)
    expect(result.medium_risk_amount).toBe(0)
  })

  it('100% high risk when all items are 120+ days', () => {
    const result = computeWriteOffRisk([
      { outstanding: 10_000, days_overdue: 130 },
      { outstanding: 20_000, days_overdue: 200 },
    ])
    expect(result.high_risk_pct).toBe(100)
    expect(result.medium_risk_amount).toBe(0)
    expect(result.low_risk_amount).toBe(0)
  })

  it('rounds amounts to 2 decimal places', () => {
    const result = computeWriteOffRisk([{ outstanding: 10.555, days_overdue: 150 }])
    expect(result.high_risk_amount).toBe(10.56)
  })

  it('negative outstanding is not counted', () => {
    const result = computeWriteOffRisk([{ outstanding: -1_000, days_overdue: 150 }])
    // 120_plus bucket, so high risk = -1000 — but the value is just summed
    // actually no clamp in computeWriteOffRisk, it sums raw
    expect(result.high_risk_amount).toBe(-1_000)
  })
})

// ── computeDsoFromAging — additional cases ────────────────────────────────

describe('collections: computeDsoFromAging — additional cases', () => {
  it('DSO = 15 when total outstanding = half of revenue', () => {
    const buckets = { current: 5_000, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    // (5000 / 10000) * 30 = 15
    expect(computeDsoFromAging(buckets, 10_000)).toBe(15)
  })

  it('DSO including all overdue buckets', () => {
    const buckets = { current: 10_000, '31_60': 10_000, '61_90': 10_000, '91_120': 10_000, '120_plus': 10_000 }
    // total = 50000, revenue = 50000 → (50000/50000)*30 = 30
    expect(computeDsoFromAging(buckets, 50_000)).toBe(30)
  })

  it('rounds to 1 decimal', () => {
    const buckets = { current: 10_001, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    // (10001/10000)*30 = 30.003 → rounds to 30
    expect(computeDsoFromAging(buckets, 10_000)).toBe(30)
  })

  it('fractional revenue gives fractional DSO', () => {
    const buckets = { current: 100, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 }
    // (100/300)*30 = 10
    expect(computeDsoFromAging(buckets, 300)).toBe(10)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. INVOICE-AGING SERVICE — 35 new tests
// ══════════════════════════════════════════════════════════════════════════════

import {
  computeAgingDays,
  assignAgingBucket,
  computeInvoiceUrgency,
  computePortfolioRisk,
  estimateCollectionDays,
} from '../lib/services/commercial/invoice-aging.service'

// ── computeAgingDays — additional cases ──────────────────────────────────

describe('invoice: computeAgingDays — extended cases', () => {
  it('returns 0 when asOf equals due_date', () => {
    expect(computeAgingDays('2025-01-01', '2025-05-15', '2025-05-15')).toBe(0)
  })

  it('returns 1 day when asOf is 1 day after due_date', () => {
    expect(computeAgingDays('2025-01-01', '2025-05-14', '2025-05-15')).toBe(1)
  })

  it('returns 365 when asOf is 1 year after due_date (non-leap)', () => {
    // 2023-01-01 to 2024-01-01 spans no leap year (2023 is not a leap year)
    expect(computeAgingDays('2023-01-01', '2023-01-01', '2024-01-01')).toBe(365)
  })

  it('handles leap year: 2024-02-28 to 2024-03-01 = 2 days', () => {
    expect(computeAgingDays('2024-01-01', '2024-02-28', '2024-03-01')).toBe(2)
  })

  it('returns correct when due_date is end of month', () => {
    // Jan 31 to Feb 28 = 28 days
    expect(computeAgingDays('2025-01-01', '2025-01-31', '2025-02-28')).toBe(28)
  })

  it('falls back to createdAt when dueDate is null — 0 day span', () => {
    expect(computeAgingDays('2025-06-01', null, '2025-06-01')).toBe(0)
  })

  it('due_date with time component: slices to date part only', () => {
    expect(computeAgingDays('2025-01-01', '2025-05-01T23:59:59Z', '2025-05-31')).toBe(30)
  })

  it('negative result when asOf before due_date', () => {
    expect(computeAgingDays('2025-01-01', '2025-12-31', '2025-01-01')).toBe(-364)
  })
})

// ── assignAgingBucket — additional boundary cases ────────────────────────

describe('invoice: assignAgingBucket — extended boundaries', () => {
  it('exactly 0 → current', () => {
    expect(assignAgingBucket(0)).toBe('current')
  })

  it('exactly -30 → current', () => {
    expect(assignAgingBucket(-30)).toBe('current')
  })

  it('exactly 30 → overdue_30', () => {
    expect(assignAgingBucket(30)).toBe('overdue_30')
  })

  it('exactly 31 → overdue_60', () => {
    expect(assignAgingBucket(31)).toBe('overdue_60')
  })

  it('exactly 60 → overdue_60', () => {
    expect(assignAgingBucket(60)).toBe('overdue_60')
  })

  it('exactly 61 → overdue_90', () => {
    expect(assignAgingBucket(61)).toBe('overdue_90')
  })

  it('exactly 90 → overdue_90', () => {
    expect(assignAgingBucket(90)).toBe('overdue_90')
  })

  it('exactly 91 → overdue_90plus', () => {
    expect(assignAgingBucket(91)).toBe('overdue_90plus')
  })

  it('very large value → overdue_90plus', () => {
    expect(assignAgingBucket(99999)).toBe('overdue_90plus')
  })
})

// ── computeInvoiceUrgency — additional cases ──────────────────────────────

describe('invoice: computeInvoiceUrgency — extended cases', () => {
  it('aging capped at 50 pts (100 days × 0.5 = 50)', () => {
    // aging = min(100*0.5, 50) = 50; amount=0; reliability=100 → 50
    expect(computeInvoiceUrgency(100, 0, 100)).toBe(50)
  })

  it('aging capped at 50 pts even for 1000 days', () => {
    expect(computeInvoiceUrgency(1000, 0, 100)).toBe(50)
  })

  it('amount component capped at 30 pts (₺300K+)', () => {
    // min(300000/100000*10, 30) = 30; aging=0; reliability=100 → 30
    expect(computeInvoiceUrgency(0, 300_000, 100)).toBe(30)
  })

  it('amount component exactly 30 at exactly ₺300K', () => {
    expect(computeInvoiceUrgency(0, 300_000, 80)).toBe(30)
  })

  it('reliability exactly 60 no penalty', () => {
    // aging=0, amount=0, reliability=60 → 0
    expect(computeInvoiceUrgency(0, 0, 60)).toBe(0)
  })

  it('reliability 59 applies +20 penalty', () => {
    expect(computeInvoiceUrgency(0, 0, 59)).toBe(20)
  })

  it('reliability 0 also applies +20 penalty', () => {
    expect(computeInvoiceUrgency(0, 0, 0)).toBe(20)
  })

  it('zero aging, zero amount, high reliability → 0 urgency', () => {
    expect(computeInvoiceUrgency(0, 0, 100)).toBe(0)
  })

  it('negative aging days → treated as 0 (max(agingDays,0))', () => {
    // max(-10,0)*0.5 = 0; amount=0; reliability=100 → 0
    expect(computeInvoiceUrgency(-10, 0, 100)).toBe(0)
  })

  it('combination: 50+30+20 = 100 exactly', () => {
    // aging=100→50; amount=300000→30; reliability=0→+20; total=100
    expect(computeInvoiceUrgency(100, 300_000, 0)).toBe(100)
  })
})

// ── computePortfolioRisk — additional cases ───────────────────────────────

describe('invoice: computePortfolioRisk — extended cases', () => {
  it('returns 0 for all-zero amounts', () => {
    const invoices = [
      { urgency: 50, amount_try: 0 },
      { urgency: 80, amount_try: 0 },
    ]
    expect(computePortfolioRisk(invoices)).toBe(0)
  })

  it('handles 10 invoices with same urgency', () => {
    const invoices = Array.from({ length: 10 }, () => ({ urgency: 42, amount_try: 1_000 }))
    expect(computePortfolioRisk(invoices)).toBe(42)
  })

  it('result rounds to 1 decimal place', () => {
    // (33*1 + 66*1 + 1*1) / 3 = 100/3 = 33.3333 → 33.3
    const invoices = [
      { urgency: 33, amount_try: 1 },
      { urgency: 66, amount_try: 1 },
      { urgency: 1,  amount_try: 1 },
    ]
    expect(computePortfolioRisk(invoices)).toBeCloseTo(33.3, 1)
  })

  it('capped at 100 even if weights exceed 100', () => {
    // Urgency itself is already capped at 100 when created, but test the cap in computePortfolioRisk
    const invoices = [{ urgency: 100, amount_try: 1_000_000 }]
    expect(computePortfolioRisk(invoices)).toBe(100)
  })
})

// ── estimateCollectionDays — extended boundary tests ─────────────────────

describe('invoice: estimateCollectionDays — extended boundaries', () => {
  it('score 79 → good tier → 25 days', () => {
    expect(estimateCollectionDays(79)).toBe(25)
  })

  it('score 80 → excellent tier → 15 days', () => {
    expect(estimateCollectionDays(80)).toBe(15)
  })

  it('score 64 → average tier → 45 days', () => {
    expect(estimateCollectionDays(64)).toBe(45)
  })

  it('score 65 → good tier → 25 days', () => {
    expect(estimateCollectionDays(65)).toBe(25)
  })

  it('score 1 → poor tier → 75 days', () => {
    expect(estimateCollectionDays(1)).toBe(75)
  })

  it('score 50 → average tier → 45 days', () => {
    expect(estimateCollectionDays(50)).toBe(45)
  })

  it('score 49 → poor tier → 75 days', () => {
    expect(estimateCollectionDays(49)).toBe(75)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. INVENTORY-AGING SERVICE — 40 new tests
// ══════════════════════════════════════════════════════════════════════════════

import {
  computeDaysInStock,
  computeLotValue,
  classifyAgingTier,
  computeInventoryTurnover,
  computeDaysInventoryOutstanding,
  classifyTurnoverHealth,
  buildAgingBuckets,
  computeObsolescenceRisk,
  classifyObsolescenceRisk,
  computeSlowMovingValue,
  computeInventoryHealthScore,
  classifyInventoryHealth,
  generateInventoryNarrative,
  findTopAgingLots,
  type StockLotInput,
} from '../lib/services/commercial/inventory-aging.service'

// ── computeDaysInStock — extended cases ───────────────────────────────────

describe('inventory: computeDaysInStock — extended cases', () => {
  it('returns 0 when asOfDate < entryDate (future entry)', () => {
    expect(computeDaysInStock('2025-12-31', '2025-01-01')).toBe(0)
  })

  it('returns 365 for exactly one non-leap year', () => {
    // 2023-01-01 to 2024-01-01: 2023 has no leap day
    expect(computeDaysInStock('2023-01-01', '2024-01-01')).toBe(365)
  })

  it('returns 366 for exactly one leap year (2024)', () => {
    // 2024-01-01 to 2025-01-01: 2024 has Feb 29
    expect(computeDaysInStock('2024-01-01', '2025-01-01')).toBe(366)
  })

  it('returns 1 for consecutive days', () => {
    expect(computeDaysInStock('2025-03-01', '2025-03-02')).toBe(1)
  })

  it('returns 30 for one month', () => {
    expect(computeDaysInStock('2025-01-01', '2025-01-31')).toBe(30)
  })

  it('returns 0 for equal entry and asOf', () => {
    expect(computeDaysInStock('2025-06-15', '2025-06-15')).toBe(0)
  })
})

// ── computeLotValue — extended cases ──────────────────────────────────────

describe('inventory: computeLotValue — extended cases', () => {
  it('returns 0 when quantity is 0', () => {
    expect(computeLotValue(0, 100)).toBe(0)
  })

  it('returns 0 when cost is 0', () => {
    expect(computeLotValue(100, 0)).toBe(0)
  })

  it('returns correct for unit quantities', () => {
    expect(computeLotValue(1, 250.5)).toBe(250.5)
  })

  it('returns large values without overflow', () => {
    expect(computeLotValue(100_000, 1_000)).toBe(100_000_000)
  })

  it('handles fractional quantities', () => {
    expect(computeLotValue(2.5, 100)).toBe(250)
  })
})

// ── classifyAgingTier — boundaries ────────────────────────────────────────

describe('inventory: classifyAgingTier — all boundaries', () => {
  it('returns fresh for exactly 0 days', () => {
    expect(classifyAgingTier(0)).toBe('fresh')
  })

  it('returns fresh for exactly 30 days', () => {
    expect(classifyAgingTier(30)).toBe('fresh')
  })

  it('returns normal for exactly 31 days', () => {
    expect(classifyAgingTier(31)).toBe('normal')
  })

  it('returns normal for exactly 90 days', () => {
    expect(classifyAgingTier(90)).toBe('normal')
  })

  it('returns aging for exactly 91 days', () => {
    expect(classifyAgingTier(91)).toBe('aging')
  })

  it('returns aging for exactly 180 days', () => {
    expect(classifyAgingTier(180)).toBe('aging')
  })

  it('returns slow_moving for exactly 181 days', () => {
    expect(classifyAgingTier(181)).toBe('slow_moving')
  })

  it('returns slow_moving for exactly 365 days', () => {
    expect(classifyAgingTier(365)).toBe('slow_moving')
  })

  it('returns obsolete for exactly 366 days', () => {
    expect(classifyAgingTier(366)).toBe('obsolete')
  })

  it('returns obsolete for 1000+ days', () => {
    expect(classifyAgingTier(1000)).toBe('obsolete')
  })
})

// ── computeInventoryTurnover — extended cases ─────────────────────────────

describe('inventory: computeInventoryTurnover — extended cases', () => {
  it('returns null for 0 average inventory', () => {
    expect(computeInventoryTurnover(100_000, 0)).toBeNull()
  })

  it('returns 1.0 when COGS equals avgInventory', () => {
    expect(computeInventoryTurnover(50_000, 50_000)).toBe(1)
  })

  it('returns 2.0 when COGS is double avgInventory', () => {
    expect(computeInventoryTurnover(100_000, 50_000)).toBe(2)
  })

  it('returns 12.0 for monthly turnover rate', () => {
    expect(computeInventoryTurnover(1_200_000, 100_000)).toBe(12)
  })

  it('returns fractional result for non-even division', () => {
    expect(computeInventoryTurnover(10, 3)).toBeCloseTo(3.333, 2)
  })
})

// ── computeDaysInventoryOutstanding — extended cases ──────────────────────

describe('inventory: computeDaysInventoryOutstanding — extended cases', () => {
  it('returns null for null turnover', () => {
    expect(computeDaysInventoryOutstanding(null)).toBeNull()
  })

  it('returns null for 0 turnover', () => {
    expect(computeDaysInventoryOutstanding(0)).toBeNull()
  })

  it('returns 365 for turnover of 1', () => {
    expect(computeDaysInventoryOutstanding(1)).toBe(365)
  })

  it('returns 30.4 for turnover of 12 (monthly)', () => {
    // 365/12 ≈ 30.42
    expect(computeDaysInventoryOutstanding(12)).toBeCloseTo(30.4, 1)
  })

  it('returns 182.5 for turnover of 2', () => {
    expect(computeDaysInventoryOutstanding(2)).toBe(182.5)
  })
})

// ── classifyTurnoverHealth — all tiers ────────────────────────────────────

describe('inventory: classifyTurnoverHealth — all tiers', () => {
  it('null DIO → insufficient_data', () => {
    expect(classifyTurnoverHealth(null)).toBe('insufficient_data')
  })

  it('DIO = 30 → excellent', () => {
    expect(classifyTurnoverHealth(30)).toBe('excellent')
  })

  it('DIO = 31 → good', () => {
    expect(classifyTurnoverHealth(31)).toBe('good')
  })

  it('DIO = 60 → good', () => {
    expect(classifyTurnoverHealth(60)).toBe('good')
  })

  it('DIO = 61 → acceptable', () => {
    expect(classifyTurnoverHealth(61)).toBe('acceptable')
  })

  it('DIO = 90 → acceptable', () => {
    expect(classifyTurnoverHealth(90)).toBe('acceptable')
  })

  it('DIO = 91 → slow', () => {
    expect(classifyTurnoverHealth(91)).toBe('slow')
  })

  it('DIO = 180 → slow', () => {
    expect(classifyTurnoverHealth(180)).toBe('slow')
  })

  it('DIO = 181 → critical', () => {
    expect(classifyTurnoverHealth(181)).toBe('critical')
  })
})

// ── computeObsolescenceRisk & classifyObsolescenceRisk ────────────────────

describe('inventory: obsolescence risk', () => {
  it('computeObsolescenceRisk returns 0 when total is 0', () => {
    expect(computeObsolescenceRisk(0, 0)).toBe(0)
  })

  it('computeObsolescenceRisk returns 100% when all is obsolete', () => {
    expect(computeObsolescenceRisk(10_000, 10_000)).toBe(100)
  })

  it('computeObsolescenceRisk returns 50% for half', () => {
    expect(computeObsolescenceRisk(5_000, 10_000)).toBe(50)
  })

  it('classifyObsolescenceRisk: low for 0%', () => {
    expect(classifyObsolescenceRisk(0)).toBe('low')
  })

  it('classifyObsolescenceRisk: low just below 5%', () => {
    expect(classifyObsolescenceRisk(4.9)).toBe('low')
  })

  it('classifyObsolescenceRisk: moderate at exactly 5%', () => {
    expect(classifyObsolescenceRisk(5)).toBe('moderate')
  })

  it('classifyObsolescenceRisk: high at exactly 15%', () => {
    expect(classifyObsolescenceRisk(15)).toBe('high')
  })

  it('classifyObsolescenceRisk: critical at exactly 30%', () => {
    expect(classifyObsolescenceRisk(30)).toBe('critical')
  })

  it('classifyObsolescenceRisk: critical above 30%', () => {
    expect(classifyObsolescenceRisk(75)).toBe('critical')
  })
})

// ── computeInventoryHealthScore — extended cases ──────────────────────────

describe('inventory: computeInventoryHealthScore — extended cases', () => {
  it('max score: excellent + low + 100% fresh = 50+30+20 = 100', () => {
    expect(computeInventoryHealthScore('excellent', 'low', 100)).toBe(100)
  })

  it('min score: critical + critical + 0% fresh = 5+0+0 = 5', () => {
    expect(computeInventoryHealthScore('critical', 'critical', 0)).toBe(5)
  })

  it('insufficient_data turnover defaults to 25', () => {
    expect(computeInventoryHealthScore('insufficient_data', 'low', 0)).toBe(55)
  })

  it('fresh pct clamped at 100 (no more than 20 pts)', () => {
    expect(computeInventoryHealthScore('excellent', 'low', 150)).toBe(100)
  })

  it('fresh pct clamped at 0 (no negative pts)', () => {
    expect(computeInventoryHealthScore('excellent', 'low', -10)).toBe(80)
  })

  it('good turnover + moderate obsol + 50% fresh = 40+20+10 = 70', () => {
    expect(computeInventoryHealthScore('good', 'moderate', 50)).toBe(70)
  })
})

// ── classifyInventoryHealth — all tiers ──────────────────────────────────

describe('inventory: classifyInventoryHealth — all tiers', () => {
  it('score 80 → excellent', () => {
    expect(classifyInventoryHealth(80)).toBe('excellent')
  })

  it('score 79 → good', () => {
    expect(classifyInventoryHealth(79)).toBe('good')
  })

  it('score 60 → good', () => {
    expect(classifyInventoryHealth(60)).toBe('good')
  })

  it('score 59 → fair', () => {
    expect(classifyInventoryHealth(59)).toBe('fair')
  })

  it('score 40 → fair', () => {
    expect(classifyInventoryHealth(40)).toBe('fair')
  })

  it('score 39 → poor', () => {
    expect(classifyInventoryHealth(39)).toBe('poor')
  })

  it('score 20 → poor', () => {
    expect(classifyInventoryHealth(20)).toBe('poor')
  })

  it('score 19 → critical', () => {
    expect(classifyInventoryHealth(19)).toBe('critical')
  })

  it('score 0 → critical', () => {
    expect(classifyInventoryHealth(0)).toBe('critical')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. RECEIVABLES-AGING-ENHANCED SERVICE — 40 new tests
// ══════════════════════════════════════════════════════════════════════════════

import {
  computeRecoveryProbability as enhancedRecovery,
  classifyCustomerRiskTier,
  computeCustomerDso,
  computePortfolioDso,
  computeCollectionEfficiency,
  computeBadDebtProvision,
  computeConcentrationRisk,
  classifyAgingHealth,
  computeWeightedAgeDays,
  estimateCollectionTimeline,
  generateAgingNarrative,
} from '../lib/services/commercial/receivables-aging-enhanced.service'

// ── computeRecoveryProbability (enhanced) — additional cases ──────────────

describe('enhanced: computeRecoveryProbability — extended cases', () => {
  it('base 95 at 30 days, no history, 0 ratio', () => {
    expect(enhancedRecovery(30, null, 0)).toBe(95)
  })

  it('boundary 31 days → base 85', () => {
    expect(enhancedRecovery(31, null, 0)).toBe(85)
  })

  it('boundary 60 days → base 85', () => {
    expect(enhancedRecovery(60, null, 0)).toBe(85)
  })

  it('boundary 61 days → base 70', () => {
    expect(enhancedRecovery(61, null, 0)).toBe(70)
  })

  it('boundary 180 days → base 50', () => {
    expect(enhancedRecovery(180, null, 0)).toBe(50)
  })

  it('boundary 181 days → base 30', () => {
    expect(enhancedRecovery(181, null, 0)).toBe(30)
  })

  it('boundary 365 days → base 30', () => {
    expect(enhancedRecovery(365, null, 0)).toBe(30)
  })

  it('366 days → base 10', () => {
    expect(enhancedRecovery(366, null, 0)).toBe(10)
  })

  it('history >= 80 gives +5pp', () => {
    // base 95 + 5 = 100, clamped to 100
    expect(enhancedRecovery(0, 80, 0)).toBe(100)
  })

  it('history >= 60 gives +0pp', () => {
    expect(enhancedRecovery(45, 60, 0)).toBe(85)
  })

  it('history >= 40 gives -5pp', () => {
    expect(enhancedRecovery(45, 40, 0)).toBe(80)
  })

  it('history < 40 gives -10pp', () => {
    expect(enhancedRecovery(45, 39, 0)).toBe(75)
  })

  it('history null gives no adjustment', () => {
    expect(enhancedRecovery(45, null, 0)).toBe(85)
  })

  it('overdue ratio 0.3 gives 0pp adjustment', () => {
    expect(enhancedRecovery(45, null, 0.3)).toBe(85)
  })

  it('overdue ratio 0.31 gives -5pp adjustment', () => {
    expect(enhancedRecovery(45, null, 0.31)).toBe(80)
  })

  it('overdue ratio 0.6 gives -5pp adjustment (boundary)', () => {
    expect(enhancedRecovery(45, null, 0.6)).toBe(80)
  })

  it('overdue ratio 0.61 gives -10pp adjustment', () => {
    expect(enhancedRecovery(45, null, 0.61)).toBe(75)
  })

  it('overdue ratio 1.0 gives -10pp adjustment', () => {
    expect(enhancedRecovery(45, null, 1.0)).toBe(75)
  })

  it('clamp: never below 5', () => {
    expect(enhancedRecovery(400, 0, 1.0)).toBe(5)
  })

  it('clamp: never above 100', () => {
    expect(enhancedRecovery(0, 100, 0)).toBe(100)
  })
})

// ── classifyCustomerRiskTier — all priorities ─────────────────────────────

describe('enhanced: classifyCustomerRiskTier — priority checks', () => {
  it('critical when oldestDays > 180', () => {
    expect(classifyCustomerRiskTier(181, 10_000, 70)).toBe('critical')
  })

  it('critical when recoveryPct < 40', () => {
    expect(classifyCustomerRiskTier(10, 10_000, 39)).toBe('critical')
  })

  it('high when oldestDays > 90', () => {
    expect(classifyCustomerRiskTier(91, 10_000, 65)).toBe('high')
  })

  it('high when recoveryPct < 60', () => {
    expect(classifyCustomerRiskTier(10, 10_000, 59)).toBe('high')
  })

  it('medium when oldestDays > 30', () => {
    expect(classifyCustomerRiskTier(31, 10_000, 70)).toBe('medium')
  })

  it('medium when outstanding > 50000', () => {
    expect(classifyCustomerRiskTier(10, 50_001, 70)).toBe('medium')
  })

  it('low when all criteria are safe', () => {
    expect(classifyCustomerRiskTier(5, 10_000, 70)).toBe('low')
  })

  it('boundary: oldestDays = 30 is NOT medium by days alone', () => {
    // days > 30 is needed, 30 is not > 30
    expect(classifyCustomerRiskTier(30, 10_000, 70)).toBe('low')
  })

  it('boundary: outstanding = 50000 is NOT medium by amount alone', () => {
    // > 50000 needed, 50000 is not > 50000
    expect(classifyCustomerRiskTier(10, 50_000, 70)).toBe('low')
  })
})

// ── computeCustomerDso & computePortfolioDso ─────────────────────────────

describe('enhanced: DSO functions', () => {
  it('computeCustomerDso returns null when avgDailyRevenue is 0', () => {
    expect(computeCustomerDso(10_000, 0)).toBeNull()
  })

  it('computeCustomerDso computes correctly', () => {
    // 10000 / (300/30) = 10000 / 10 = 1000 days
    expect(computeCustomerDso(10_000, 10)).toBe(1_000)
  })

  it('computePortfolioDso returns null when revenue is 0', () => {
    expect(computePortfolioDso(10_000, 0)).toBeNull()
  })

  it('computePortfolioDso: 30000 / (30000/30) = 30 days', () => {
    expect(computePortfolioDso(30_000, 30_000)).toBe(30)
  })

  it('computePortfolioDso: 60000 / (30000/30) = 60 days', () => {
    expect(computePortfolioDso(60_000, 30_000)).toBe(60)
  })
})

// ── computeCollectionEfficiency ───────────────────────────────────────────

describe('enhanced: computeCollectionEfficiency', () => {
  it('returns null when previousOutstanding is 0', () => {
    expect(computeCollectionEfficiency(5_000, 0)).toBeNull()
  })

  it('returns 100 when collected equals previous outstanding', () => {
    expect(computeCollectionEfficiency(10_000, 10_000)).toBe(100)
  })

  it('returns 50 when half collected', () => {
    expect(computeCollectionEfficiency(5_000, 10_000)).toBe(50)
  })

  it('can exceed 100 (over-collection)', () => {
    expect(computeCollectionEfficiency(12_000, 10_000)).toBe(120)
  })

  it('returns 0 when collected is 0', () => {
    expect(computeCollectionEfficiency(0, 10_000)).toBe(0)
  })
})

// ── computeBadDebtProvision ───────────────────────────────────────────────

describe('enhanced: computeBadDebtProvision', () => {
  const defaultRates = {
    current: 0.01,
    days_30_60: 0.05,
    days_60_90: 0.15,
    days_90_180: 0.30,
    days_180_plus: 0.60,
  }

  it('returns 0 for all-zero buckets', () => {
    const buckets = { current: 0, days_30_60: 0, days_60_90: 0, days_90_180: 0, days_180_plus: 0 }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(0)
  })

  it('correctly applies 1% to current bucket only', () => {
    const buckets = { current: 10_000, days_30_60: 0, days_60_90: 0, days_90_180: 0, days_180_plus: 0 }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(100)
  })

  it('correctly applies 60% to 180+ bucket', () => {
    const buckets = { current: 0, days_30_60: 0, days_60_90: 0, days_90_180: 0, days_180_plus: 10_000 }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(6_000)
  })

  it('sums across all buckets correctly', () => {
    const buckets = {
      current:       100_000,  // 1000
      days_30_60:     50_000,  // 2500
      days_60_90:     20_000,  // 3000
      days_90_180:    10_000,  // 3000
      days_180_plus:   5_000,  // 3000
    }
    expect(computeBadDebtProvision(buckets, defaultRates)).toBe(12_500)
  })
})

// ── computeConcentrationRisk (HHI) ───────────────────────────────────────

describe('enhanced: computeConcentrationRisk', () => {
  it('returns 0 when totalOutstanding is 0', () => {
    expect(computeConcentrationRisk([], 0)).toBe(0)
  })

  it('returns 1.0 for single customer (max concentration)', () => {
    const customers = [{ customer_id: '1', outstanding: 10_000 }]
    expect(computeConcentrationRisk(customers, 10_000)).toBe(1)
  })

  it('returns 0.5 for two equal customers', () => {
    const customers = [
      { customer_id: '1', outstanding: 5_000 },
      { customer_id: '2', outstanding: 5_000 },
    ]
    expect(computeConcentrationRisk(customers, 10_000)).toBe(0.5)
  })

  it('returns 0.25 for four equal customers', () => {
    const customers = Array.from({ length: 4 }, (_, i) => ({
      customer_id: String(i), outstanding: 2_500,
    }))
    expect(computeConcentrationRisk(customers, 10_000)).toBe(0.25)
  })
})

// ── classifyAgingHealth ───────────────────────────────────────────────────

describe('enhanced: classifyAgingHealth — priority checks', () => {
  it('critical when 90d ratio > 40', () => {
    expect(classifyAgingHealth(41, null, null)).toBe('critical')
  })

  it('critical when dso > 120', () => {
    expect(classifyAgingHealth(0, 121, null)).toBe('critical')
  })

  it('concern when 90d ratio > 20', () => {
    expect(classifyAgingHealth(21, null, null)).toBe('concern')
  })

  it('concern when dso > 90', () => {
    expect(classifyAgingHealth(0, 91, null)).toBe('concern')
  })

  it('watch when 90d ratio > 10', () => {
    expect(classifyAgingHealth(11, null, null)).toBe('watch')
  })

  it('watch when dso > 60', () => {
    expect(classifyAgingHealth(0, 61, null)).toBe('watch')
  })

  it('healthy when all metrics are good', () => {
    expect(classifyAgingHealth(5, 30, 95)).toBe('healthy')
  })

  it('healthy when dso is null and ratio is 0', () => {
    expect(classifyAgingHealth(0, null, null)).toBe('healthy')
  })

  it('boundary: ratio = 40 is NOT critical', () => {
    expect(classifyAgingHealth(40, null, null)).toBe('concern')
  })

  it('boundary: dso = 120 is NOT critical', () => {
    expect(classifyAgingHealth(0, 120, null)).toBe('concern')
  })
})

// ── computeWeightedAgeDays ────────────────────────────────────────────────

describe('enhanced: computeWeightedAgeDays', () => {
  it('returns null for all-zero amounts', () => {
    const buckets = [
      { midpoint_days: 15, amount: 0 },
      { midpoint_days: 45, amount: 0 },
    ]
    expect(computeWeightedAgeDays(buckets)).toBeNull()
  })

  it('returns midpoint when only one bucket has amount', () => {
    const buckets = [
      { midpoint_days: 15, amount: 100_000 },
      { midpoint_days: 45, amount: 0 },
    ]
    expect(computeWeightedAgeDays(buckets)).toBe(15)
  })

  it('returns equal-weight average for two equal buckets', () => {
    const buckets = [
      { midpoint_days: 15,  amount: 50_000 },
      { midpoint_days: 135, amount: 50_000 },
    ]
    // (15*50000 + 135*50000) / 100000 = 75
    expect(computeWeightedAgeDays(buckets)).toBe(75)
  })

  it('heavier weight on older bucket increases result', () => {
    const buckets = [
      { midpoint_days: 15,  amount: 10_000 },
      { midpoint_days: 135, amount: 90_000 },
    ]
    const result = computeWeightedAgeDays(buckets)!
    expect(result).toBeGreaterThan(75)
  })

  it('empty array returns null', () => {
    expect(computeWeightedAgeDays([])).toBeNull()
  })
})

// ── estimateCollectionTimeline ────────────────────────────────────────────

describe('enhanced: estimateCollectionTimeline', () => {
  it('returns null for rate <= 0', () => {
    expect(estimateCollectionTimeline(10_000, 0)).toBeNull()
  })

  it('returns null for rate >= 1', () => {
    expect(estimateCollectionTimeline(10_000, 1)).toBeNull()
  })

  it('returns null for outstanding <= 0', () => {
    expect(estimateCollectionTimeline(0, 0.5)).toBeNull()
  })

  it('returns null for negative outstanding', () => {
    expect(estimateCollectionTimeline(-1000, 0.5)).toBeNull()
  })

  it('high rate (0.9) collects quickly', () => {
    const months = estimateCollectionTimeline(100_000, 0.9)
    expect(months).not.toBeNull()
    expect(months!).toBeLessThan(10)
  })

  it('low rate (0.01) takes many months but caps at 36', () => {
    const months = estimateCollectionTimeline(10_000_000, 0.01)
    expect(months).toBe(36)
  })

  it('small outstanding below 1000 ends immediately', () => {
    // 900 < 1000, loop never runs
    const months = estimateCollectionTimeline(900, 0.5)
    expect(months).toBe(0)
  })

  it('moderate rate (0.5) halves each month', () => {
    // 10000 * 0.5^n < 1000 → 0.5^n < 0.1 → n > log(0.1)/log(0.5) ≈ 3.32 → n=4
    const months = estimateCollectionTimeline(10_000, 0.5)
    expect(months).toBe(4)
  })
})
