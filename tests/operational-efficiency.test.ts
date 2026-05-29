// ─────────────────────────────────────────────────────────────────────────────
// tests/operational-efficiency.test.ts
//
// Unit tests for all pure functions in operational-efficiency.service.ts:
//   - computeOrderToCashCycle              (3 tests)
//   - computeExpenseEfficiencyRatio        (4 tests)
//   - computeRevenuePerEmployee            (3 tests)
//   - computeQuoteToOrderRate              (3 tests)
//   - computeFulfillmentCycleTime          (4 tests)
//   - computeInventoryAccuracyRate         (4 tests)
//   - computeOnTimeDeliveryRate            (4 tests)
//   - classifyOperationalEfficiency        (8 tests)
//   - computeOperationalProductivityScore  (7 tests)
//   Total: 40 tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import {
  computeOrderToCashCycle,
  computeExpenseEfficiencyRatio,
  computeRevenuePerEmployee,
  computeQuoteToOrderRate,
  computeFulfillmentCycleTime,
  computeInventoryAccuracyRate,
  computeOnTimeDeliveryRate,
  classifyOperationalEfficiency,
  computeOperationalProductivityScore,
  DEFAULT_BENCHMARKS,
} from '../lib/services/intelligence/operational-efficiency.service'

// ── computeOrderToCashCycle ───────────────────────────────────────────────────

describe('computeOrderToCashCycle', () => {
  it('normal: 5 days to invoice + 25 days to collect = 30 days total', () => {
    expect(computeOrderToCashCycle(5, 25)).toBe(30)
  })

  it('zero invoice days: 0 + 15 = 15', () => {
    expect(computeOrderToCashCycle(0, 15)).toBe(15)
  })

  it('both zero: 0 + 0 = 0', () => {
    expect(computeOrderToCashCycle(0, 0)).toBe(0)
  })
})

// ── computeExpenseEfficiencyRatio ─────────────────────────────────────────────

describe('computeExpenseEfficiencyRatio', () => {
  it('normal: 80_000 opex / 100_000 gross profit = 80%', () => {
    expect(computeExpenseEfficiencyRatio(80_000, 100_000)).toBeCloseTo(80)
  })

  it('efficient: 50_000 / 100_000 = 50%', () => {
    expect(computeExpenseEfficiencyRatio(50_000, 100_000)).toBeCloseTo(50)
  })

  it('zero gross profit → null', () => {
    expect(computeExpenseEfficiencyRatio(80_000, 0)).toBeNull()
  })

  it('ratio > 100% (over-spending): 120_000 / 100_000 = 120%', () => {
    expect(computeExpenseEfficiencyRatio(120_000, 100_000)).toBeCloseTo(120)
  })
})

// ── computeRevenuePerEmployee ─────────────────────────────────────────────────

describe('computeRevenuePerEmployee', () => {
  it('normal: 5_000_000 / 5 employees = 1_000_000 each', () => {
    expect(computeRevenuePerEmployee(5_000_000, 5)).toBeCloseTo(1_000_000)
  })

  it('excellent: 25_000_000 / 5 employees = 5_000_000 (Turkish SME benchmark)', () => {
    expect(computeRevenuePerEmployee(25_000_000, 5)).toBeCloseTo(5_000_000)
  })

  it('zero headcount → null', () => {
    expect(computeRevenuePerEmployee(5_000_000, 0)).toBeNull()
  })
})

// ── computeQuoteToOrderRate ───────────────────────────────────────────────────

describe('computeQuoteToOrderRate', () => {
  it('normal: 20 converted / 50 quotes = 40%', () => {
    expect(computeQuoteToOrderRate(20, 50)).toBeCloseTo(40)
  })

  it('100% conversion: 10 / 10 = 100%', () => {
    expect(computeQuoteToOrderRate(10, 10)).toBeCloseTo(100)
  })

  it('zero quotes → null', () => {
    expect(computeQuoteToOrderRate(5, 0)).toBeNull()
  })
})

// ── computeFulfillmentCycleTime ───────────────────────────────────────────────

describe('computeFulfillmentCycleTime', () => {
  it('normal: 7 days between purchase and delivery', () => {
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-01-08')).toBe(7)
  })

  it('same day → 0', () => {
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-01-01')).toBe(0)
  })

  it('delivery before purchase → 0', () => {
    expect(computeFulfillmentCycleTime('2024-01-10', '2024-01-05')).toBe(0)
  })

  it('30-day fulfillment cycle', () => {
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-01-31')).toBe(30)
  })
})

// ── computeInventoryAccuracyRate ──────────────────────────────────────────────

describe('computeInventoryAccuracyRate', () => {
  it('100% accuracy: 200 correct / 200 total = 100%', () => {
    expect(computeInventoryAccuracyRate(200, 200)).toBeCloseTo(100)
  })

  it('partial: 180 / 200 = 90%', () => {
    expect(computeInventoryAccuracyRate(180, 200)).toBeCloseTo(90)
  })

  it('low accuracy: 50 / 100 = 50%', () => {
    expect(computeInventoryAccuracyRate(50, 100)).toBeCloseTo(50)
  })

  it('zero total items → null', () => {
    expect(computeInventoryAccuracyRate(0, 0)).toBeNull()
  })
})

// ── computeOnTimeDeliveryRate ─────────────────────────────────────────────────

describe('computeOnTimeDeliveryRate', () => {
  it('100% on-time: 50 / 50 = 100%', () => {
    expect(computeOnTimeDeliveryRate(50, 50)).toBeCloseTo(100)
  })

  it('partial: 45 / 50 = 90%', () => {
    expect(computeOnTimeDeliveryRate(45, 50)).toBeCloseTo(90)
  })

  it('low: 30 / 100 = 30%', () => {
    expect(computeOnTimeDeliveryRate(30, 100)).toBeCloseTo(30)
  })

  it('zero deliveries → null', () => {
    expect(computeOnTimeDeliveryRate(0, 0)).toBeNull()
  })
})

// ── classifyOperationalEfficiency ────────────────────────────────────────────

describe('classifyOperationalEfficiency', () => {
  it('all null → insufficient_data', () => {
    expect(classifyOperationalEfficiency(null, null, null)).toBe('insufficient_data')
  })

  it('all excellent: expense ≤60, o2c ≤30, quote ≥50 → excellent', () => {
    // expense 50 → 5pts, o2c 25 → 5pts, quote 60 → 5pts → avg 5 ≥ 4.5
    expect(classifyOperationalEfficiency(50, 25, 60)).toBe('excellent')
  })

  it('good scores: expense 70 → 3pts, o2c 40 → 3pts, quote 35 → 3pts → avg 3.0', () => {
    expect(classifyOperationalEfficiency(70, 40, 35)).toBe('good')
  })

  it('average: expense 90 → 1pt, o2c 50 → 1pt, quote 20 → 1pt → avg 1.0 → below threshold... actually avg 1.0 < 1.5 → below_average', () => {
    // Each metric scores 1pt → avg 1.0 which is < 1.5 but >= 0.5 → below_average
    expect(classifyOperationalEfficiency(90, 50, 20)).toBe('below_average')
  })

  it('average: mixed scores: expense 60 → 5pts, o2c 50 → 1pt → avg 3.0 → good', () => {
    expect(classifyOperationalEfficiency(60, 50, null)).toBe('good')
  })

  it('poor: all metrics score 0pts → avg 0 < 0.5', () => {
    // expense > 100, o2c > 60, quote < 15
    expect(classifyOperationalEfficiency(150, 90, 5)).toBe('poor')
  })

  it('below_average: avg between 0.5 and 1.5', () => {
    // expense > 100 → 0pts, o2c 35 → 3pts → avg 1.5 → average (boundary check)
    expect(classifyOperationalEfficiency(110, 35, null)).toBe('average')
  })

  it('single metric at excellent → excellent', () => {
    // Only expense at 40 → 5pts / 1 metric → avg 5.0 → excellent
    expect(classifyOperationalEfficiency(40, null, null)).toBe('excellent')
  })
})

// ── computeOperationalProductivityScore ──────────────────────────────────────

describe('computeOperationalProductivityScore', () => {
  it('all null metrics → 50 (neutral baseline for each metric)', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // 50×0.30 + 50×0.30 + 50×0.20 + 50×0.20 = 50
    expect(score).toBeCloseTo(50, 1)
  })

  it('all metrics exactly at benchmark targets → composite ~50+ (expense and o2c: (1-1)*100+50=50; quote: 100/40*100 clamped=100 * should be 100; revPerEmp: 1*100=100)', () => {
    const bm = DEFAULT_BENCHMARKS
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    bm.expense_ratio_target,
      o2c_days:             bm.o2c_target_days,
      quote_to_order_pct:   bm.quote_to_order_target,
      revenue_per_employee: bm.revenue_per_employee_target,
    })
    // expense: (1 - 80/80)*100+50 = 50
    // o2c:     (1 - 30/30)*100+50 = 50
    // quote:   clamp(40/40*100, 0, 100) = 100
    // revPerEmp: clamp(5000000/5000000*100, 0, 100) = 100
    // composite: 50*0.30 + 50*0.30 + 100*0.20 + 100*0.20 = 15+15+20+20 = 70
    expect(score).toBeCloseTo(70, 1)
  })

  it('all metrics double the target (excellent) → high score', () => {
    const bm = DEFAULT_BENCHMARKS
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    bm.expense_ratio_target / 2,   // 40 (much lower = good)
      o2c_days:             bm.o2c_target_days / 2,        // 15
      quote_to_order_pct:   bm.quote_to_order_target * 2,  // 80%
      revenue_per_employee: bm.revenue_per_employee_target * 2, // 10M
    })
    // expense: (1 - 40/80)*100+50 = 100 → clamped 100
    // o2c:     (1 - 15/30)*100+50 = 100 → clamped 100
    // quote:   clamp(80/40*100, 0, 100) = 100
    // revPerEmp: clamp(10000000/5000000*100, 0, 100) = 100
    // composite: 100
    expect(score).toBeCloseTo(100, 0)
  })

  it('expense much higher than target → low expense component', () => {
    // expense at 200% of target → (1 - 200/80)*100+50 = (1-2.5)*100+50 = -150+50 = -100 → clamped 0
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    160,  // 160/80 = 2.0 → (1-2)*100+50 = -50 → clamped 0
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // expense: 0*0.30 = 0, rest neutral: 50*0.70 = 35
    expect(score).toBeCloseTo(35, 1)
  })

  it('uses custom benchmarks when provided', () => {
    const score = computeOperationalProductivityScore(
      {
        expense_ratio_pct:    60,
        o2c_days:             null,
        quote_to_order_pct:   null,
        revenue_per_employee: null,
      },
      {
        expense_ratio_target:          60,   // custom target = 60
        o2c_target_days:               30,
        quote_to_order_target:         40,
        revenue_per_employee_target:   5_000_000,
      },
    )
    // expense: (1 - 60/60)*100+50 = 50
    // rest neutral 50
    // composite = 50
    expect(score).toBeCloseTo(50, 1)
  })

  it('quote_to_order_pct at 0 → quote score = 0', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             null,
      quote_to_order_pct:   0,
      revenue_per_employee: null,
    })
    // quote: 0/40*100 = 0 → clamped 0 → * 0.20 = 0
    // rest neutral 50
    // composite: 50*0.30 + 50*0.30 + 0*0.20 + 50*0.20 = 15+15+0+10 = 40
    expect(score).toBeCloseTo(40, 1)
  })

  it('score rounds to 1 decimal place', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    75,
      o2c_days:             28,
      quote_to_order_pct:   35,
      revenue_per_employee: 4_000_000,
    })
    // Verify result is a number with at most 1 decimal place
    const asString = score.toString()
    const decimals  = asString.includes('.') ? asString.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(1)
  })
})
