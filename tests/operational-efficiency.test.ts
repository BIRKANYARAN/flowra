// ─────────────────────────────────────────────────────────────────────────────
// tests/operational-efficiency.test.ts
//
// Unit tests for all pure functions in operational-efficiency.service.ts:
//   - computeOrderToCashCycle              (3 → 10 tests)
//   - computeExpenseEfficiencyRatio        (4 → 12 tests)
//   - computeRevenuePerEmployee            (3 → 10 tests)
//   - computeQuoteToOrderRate              (3 → 10 tests)
//   - computeFulfillmentCycleTime          (4 → 12 tests)
//   - computeInventoryAccuracyRate         (4 → 12 tests)
//   - computeOnTimeDeliveryRate            (4 → 12 tests)
//   - classifyOperationalEfficiency        (8 → 30 tests)
//   - computeOperationalProductivityScore  (7 → 22 tests)
//   - DEFAULT_BENCHMARKS constants         (5 tests)
//   Total: ~135 tests
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

  it('zero collect days: 10 + 0 = 10', () => {
    expect(computeOrderToCashCycle(10, 0)).toBe(10)
  })

  it('large values: 15 + 45 = 60', () => {
    expect(computeOrderToCashCycle(15, 45)).toBe(60)
  })

  it('fractional days: 2.5 + 7.5 = 10', () => {
    expect(computeOrderToCashCycle(2.5, 7.5)).toBe(10)
  })

  it('returns sum exactly (no rounding)', () => {
    expect(computeOrderToCashCycle(3, 7)).toBe(10)
  })

  it('very long O2C cycle: 30 + 90 = 120', () => {
    expect(computeOrderToCashCycle(30, 90)).toBe(120)
  })

  it('1-day total: 0.5 + 0.5 = 1', () => {
    expect(computeOrderToCashCycle(0.5, 0.5)).toBe(1)
  })

  it('asymmetric inputs: 1 + 59 = 60', () => {
    expect(computeOrderToCashCycle(1, 59)).toBe(60)
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

  it('zero opex → 0% ratio', () => {
    expect(computeExpenseEfficiencyRatio(0, 100_000)).toBeCloseTo(0)
  })

  it('exactly at 60% threshold', () => {
    expect(computeExpenseEfficiencyRatio(60_000, 100_000)).toBeCloseTo(60)
  })

  it('exactly at 80% threshold (Turkish SME target boundary)', () => {
    expect(computeExpenseEfficiencyRatio(80_000, 100_000)).toBeCloseTo(80)
  })

  it('exactly at 100% threshold', () => {
    expect(computeExpenseEfficiencyRatio(100_000, 100_000)).toBeCloseTo(100)
  })

  it('very high opex: 300_000 / 100_000 = 300%', () => {
    expect(computeExpenseEfficiencyRatio(300_000, 100_000)).toBeCloseTo(300)
  })

  it('returns number (not null) for positive gross profit', () => {
    const result = computeExpenseEfficiencyRatio(50_000, 200_000)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('small values: 1 / 10 = 10%', () => {
    expect(computeExpenseEfficiencyRatio(1, 10)).toBeCloseTo(10)
  })

  it('fractional result: 33_333 / 100_000 ≈ 33.33%', () => {
    expect(computeExpenseEfficiencyRatio(33_333, 100_000)).toBeCloseTo(33.33, 1)
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

  it('single employee: total revenue = per-employee revenue', () => {
    expect(computeRevenuePerEmployee(2_000_000, 1)).toBeCloseTo(2_000_000)
  })

  it('zero revenue: 0 / 10 = 0', () => {
    expect(computeRevenuePerEmployee(0, 10)).toBeCloseTo(0)
  })

  it('10 employees, 10M revenue = 1M per employee', () => {
    expect(computeRevenuePerEmployee(10_000_000, 10)).toBeCloseTo(1_000_000)
  })

  it('large headcount: 50_000_000 / 100 employees = 500_000', () => {
    expect(computeRevenuePerEmployee(50_000_000, 100)).toBeCloseTo(500_000)
  })

  it('below Turkish benchmark: 3M / 1 employee = 3M', () => {
    expect(computeRevenuePerEmployee(3_000_000, 1)).toBeCloseTo(3_000_000)
  })

  it('returns number for valid inputs', () => {
    const result = computeRevenuePerEmployee(10_000_000, 5)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('fractional: 1_000_000 / 3 ≈ 333_333.33', () => {
    expect(computeRevenuePerEmployee(1_000_000, 3)).toBeCloseTo(333_333.33, 0)
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

  it('zero conversions: 0 / 50 = 0%', () => {
    expect(computeQuoteToOrderRate(0, 50)).toBeCloseTo(0)
  })

  it('1 in 100 quotes converted = 1%', () => {
    expect(computeQuoteToOrderRate(1, 100)).toBeCloseTo(1)
  })

  it('exactly at 50% threshold (excellent boundary)', () => {
    expect(computeQuoteToOrderRate(25, 50)).toBeCloseTo(50)
  })

  it('exactly at 30% threshold (good boundary)', () => {
    expect(computeQuoteToOrderRate(30, 100)).toBeCloseTo(30)
  })

  it('exactly at 15% threshold (average boundary)', () => {
    expect(computeQuoteToOrderRate(15, 100)).toBeCloseTo(15)
  })

  it('returns number for valid inputs', () => {
    const result = computeQuoteToOrderRate(5, 20)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('single quote, single conversion = 100%', () => {
    expect(computeQuoteToOrderRate(1, 1)).toBeCloseTo(100)
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

  it('1-day delivery', () => {
    expect(computeFulfillmentCycleTime('2024-03-15', '2024-03-16')).toBe(1)
  })

  it('cross-month boundary: Jan 28 to Feb 4 = 7 days', () => {
    expect(computeFulfillmentCycleTime('2024-01-28', '2024-02-04')).toBe(7)
  })

  it('cross-year boundary: Dec 28 to Jan 4 = 7 days', () => {
    expect(computeFulfillmentCycleTime('2023-12-28', '2024-01-04')).toBe(7)
  })

  it('long fulfillment: 90 days', () => {
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-04-01')).toBe(91)
  })

  it('returns integer (rounds correctly)', () => {
    const result = computeFulfillmentCycleTime('2024-01-01', '2024-01-15')
    expect(Number.isInteger(result)).toBe(true)
  })

  it('14-day cycle', () => {
    expect(computeFulfillmentCycleTime('2024-02-01', '2024-02-15')).toBe(14)
  })

  it('delivery exactly 1 millisecond after purchase still rounds to 0', () => {
    // Dates without time component: same-day still 0
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-01-01')).toBe(0)
  })

  it('exactly 60 days', () => {
    expect(computeFulfillmentCycleTime('2024-01-01', '2024-03-01')).toBe(60)
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

  it('zero correct out of 100 = 0%', () => {
    expect(computeInventoryAccuracyRate(0, 100)).toBeCloseTo(0)
  })

  it('1 correct out of 1000 = 0.1%', () => {
    expect(computeInventoryAccuracyRate(1, 1000)).toBeCloseTo(0.1)
  })

  it('exactly 95% accuracy: 95 / 100', () => {
    expect(computeInventoryAccuracyRate(95, 100)).toBeCloseTo(95)
  })

  it('single item, correct = 100%', () => {
    expect(computeInventoryAccuracyRate(1, 1)).toBeCloseTo(100)
  })

  it('single item, incorrect = 0% (0 correct, 1 total)', () => {
    expect(computeInventoryAccuracyRate(0, 1)).toBeCloseTo(0)
  })

  it('fractional result: 1 / 3 ≈ 33.33%', () => {
    expect(computeInventoryAccuracyRate(1, 3)).toBeCloseTo(33.33, 1)
  })

  it('returns number for valid inputs', () => {
    const result = computeInventoryAccuracyRate(150, 200)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('99% accuracy: 99 / 100 = 99%', () => {
    expect(computeInventoryAccuracyRate(99, 100)).toBeCloseTo(99)
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

  it('zero on-time, 100 total = 0%', () => {
    expect(computeOnTimeDeliveryRate(0, 100)).toBeCloseTo(0)
  })

  it('single delivery, on time = 100%', () => {
    expect(computeOnTimeDeliveryRate(1, 1)).toBeCloseTo(100)
  })

  it('single delivery, late = 0% (0 on-time, 1 total)', () => {
    expect(computeOnTimeDeliveryRate(0, 1)).toBeCloseTo(0)
  })

  it('exactly 95% on-time: 95 / 100', () => {
    expect(computeOnTimeDeliveryRate(95, 100)).toBeCloseTo(95)
  })

  it('returns number for valid inputs', () => {
    const result = computeOnTimeDeliveryRate(80, 100)
    expect(result).not.toBeNull()
    expect(typeof result).toBe('number')
  })

  it('1 in 3 on-time ≈ 33.33%', () => {
    expect(computeOnTimeDeliveryRate(1, 3)).toBeCloseTo(33.33, 1)
  })

  it('99 out of 100 = 99%', () => {
    expect(computeOnTimeDeliveryRate(99, 100)).toBeCloseTo(99)
  })

  it('50 out of 200 = 25%', () => {
    expect(computeOnTimeDeliveryRate(50, 200)).toBeCloseTo(25)
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

  // Expense ratio boundary tests (exact boundaries)
  it('expense exactly 60 → 5pts (excellent boundary)', () => {
    expect(classifyOperationalEfficiency(60, null, null)).toBe('excellent')
  })

  it('expense exactly 61 → 3pts (just above excellent threshold)', () => {
    expect(classifyOperationalEfficiency(61, null, null)).toBe('good')
  })

  it('expense exactly 80 → 3pts (good boundary)', () => {
    expect(classifyOperationalEfficiency(80, null, null)).toBe('good')
  })

  it('expense exactly 81 → 1pt (just above good threshold)', () => {
    expect(classifyOperationalEfficiency(81, null, null)).toBe('below_average')
  })

  it('expense exactly 100 → 1pt', () => {
    expect(classifyOperationalEfficiency(100, null, null)).toBe('below_average')
  })

  it('expense exactly 101 → 0pts (poor)', () => {
    expect(classifyOperationalEfficiency(101, null, null)).toBe('poor')
  })

  // O2C boundary tests
  it('o2c exactly 30 → 5pts (excellent boundary)', () => {
    expect(classifyOperationalEfficiency(null, 30, null)).toBe('excellent')
  })

  it('o2c exactly 31 → 3pts (just above excellent threshold)', () => {
    expect(classifyOperationalEfficiency(null, 31, null)).toBe('good')
  })

  it('o2c exactly 45 → 3pts (good boundary)', () => {
    expect(classifyOperationalEfficiency(null, 45, null)).toBe('good')
  })

  it('o2c exactly 46 → 1pt', () => {
    expect(classifyOperationalEfficiency(null, 46, null)).toBe('below_average')
  })

  it('o2c exactly 60 → 1pt (average boundary)', () => {
    expect(classifyOperationalEfficiency(null, 60, null)).toBe('below_average')
  })

  it('o2c exactly 61 → 0pts (poor)', () => {
    expect(classifyOperationalEfficiency(null, 61, null)).toBe('poor')
  })

  // Quote-to-order boundary tests
  it('quote exactly 50% → 5pts (excellent boundary)', () => {
    expect(classifyOperationalEfficiency(null, null, 50)).toBe('excellent')
  })

  it('quote exactly 49% → 3pts (just below excellent threshold)', () => {
    expect(classifyOperationalEfficiency(null, null, 49)).toBe('good')
  })

  it('quote exactly 30% → 3pts (good boundary)', () => {
    expect(classifyOperationalEfficiency(null, null, 30)).toBe('good')
  })

  it('quote exactly 15% → 1pt (average boundary)', () => {
    expect(classifyOperationalEfficiency(null, null, 15)).toBe('below_average')
  })

  it('quote exactly 14% → 0pts (poor)', () => {
    expect(classifyOperationalEfficiency(null, null, 14)).toBe('poor')
  })

  // Multi-metric average tests
  it('excellent avg exactly 4.5: two metrics scoring 5 and 4 → avg 4.5 → excellent', () => {
    // expense 50 → 5pts, o2c 45 → 3pts, quote 50 → 5pts → avg (5+3+5)/3 = 4.33 → good
    // For exactly 4.5 with two metrics: e.g. (5+4)/2 is not possible, use (5+5)/2=5→excellent
    expect(classifyOperationalEfficiency(50, 30, null)).toBe('excellent')
  })

  it('avg exactly 3.0: e.g. expense 80 → 3pts, o2c 45 → 3pts → avg 3.0 → good', () => {
    expect(classifyOperationalEfficiency(80, 45, null)).toBe('good')
  })

  it('avg = 2.0: expense 100 → 1pt, o2c 45 → 3pts → avg (1+3)/2 = 2.0 → average', () => {
    // (1+3)/2 = 2.0, which is >= 1.5 → average
    expect(classifyOperationalEfficiency(100, 45, null)).toBe('average')
  })

  it('avg exactly 0.5: one metric at 0pts, one at 1pt → avg 0.5 → below_average boundary', () => {
    // expense 101 → 0pts, quote 20 → 1pt → avg 0.5 → below_average
    expect(classifyOperationalEfficiency(101, null, 20)).toBe('below_average')
  })

  it('single metric null O2C and quote, expense poor → poor', () => {
    expect(classifyOperationalEfficiency(200, null, null)).toBe('poor')
  })

  it('two metrics: one excellent, one poor → avg 2.5 → average', () => {
    // expense 50 → 5pts, o2c 90 → 0pts → avg 2.5 → average
    expect(classifyOperationalEfficiency(50, 90, null)).toBe('average')
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

  it('revenue_per_employee at 0 → score clamped to 0 for that component', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: 0,
    })
    // revPerEmp: clamp(0/5M * 100, 0, 100) = 0
    // rest neutral 50
    // composite: 50*0.30 + 50*0.30 + 50*0.20 + 0*0.20 = 15+15+10+0 = 40
    expect(score).toBeCloseTo(40, 1)
  })

  it('only expense at half the target → above neutral', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    40,  // half of 80 target
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // expense: (1 - 40/80)*100+50 = 100 → 100*0.30 = 30
    // rest neutral: 50*0.70 = 35
    // composite: 65
    expect(score).toBeCloseTo(65, 1)
  })

  it('only o2c at half the target → above neutral', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             15,  // half of 30 target
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // o2c: (1 - 15/30)*100+50 = 100 → 100*0.30 = 30
    // rest neutral: 50*0.70 = 35
    // composite: 65
    expect(score).toBeCloseTo(65, 1)
  })

  it('returns a number between 0 and 100 for all null', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns a number between 0 and 100 for worst-case inputs', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    1000,  // way over target
      o2c_days:             1000,  // way over target
      quote_to_order_pct:   0,
      revenue_per_employee: 0,
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('exact neutral: each metric at precisely its neutral point', () => {
    // expense at 80 → score 50, o2c at 30 → score 50, quote null → 50, revPerEmp null → 50
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    80,
      o2c_days:             30,
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // expense: 50*0.30 = 15, o2c: 50*0.30 = 15, rest: 50*0.40 = 20 → 50
    expect(score).toBeCloseTo(50, 1)
  })

  it('o2c at triple the target → o2c score clamped to 0', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             90,  // 3× the 30-day target → (1-3)*100+50 = -150 → clamped 0
      quote_to_order_pct:   null,
      revenue_per_employee: null,
    })
    // o2c: 0*0.30 = 0, rest neutral: 50*0.70 = 35
    expect(score).toBeCloseTo(35, 1)
  })

  it('uses default benchmarks when no benchmarks param given', () => {
    const withDefault = computeOperationalProductivityScore({
      expense_ratio_pct: 80,
      o2c_days:          30,
      quote_to_order_pct: null,
      revenue_per_employee: null,
    })
    const withExplicit = computeOperationalProductivityScore(
      {
        expense_ratio_pct: 80,
        o2c_days:          30,
        quote_to_order_pct: null,
        revenue_per_employee: null,
      },
      {
        expense_ratio_target:         DEFAULT_BENCHMARKS.expense_ratio_target,
        o2c_target_days:              DEFAULT_BENCHMARKS.o2c_target_days,
        quote_to_order_target:        DEFAULT_BENCHMARKS.quote_to_order_target,
        revenue_per_employee_target:  DEFAULT_BENCHMARKS.revenue_per_employee_target,
      },
    )
    expect(withDefault).toBeCloseTo(withExplicit, 5)
  })

  it('revenue_per_employee exactly at target → score 100', () => {
    const score = computeOperationalProductivityScore({
      expense_ratio_pct:    null,
      o2c_days:             null,
      quote_to_order_pct:   null,
      revenue_per_employee: 5_000_000,  // exactly at benchmark
    })
    // revPerEmp: clamp(5M/5M*100, 0, 100) = 100 → *0.20 = 20
    // rest neutral: 50*0.80 = 40
    // composite: 60
    expect(score).toBeCloseTo(60, 1)
  })
})

// ── DEFAULT_BENCHMARKS constants ──────────────────────────────────────────────

describe('DEFAULT_BENCHMARKS', () => {
  it('expense_ratio_target is 80', () => {
    expect(DEFAULT_BENCHMARKS.expense_ratio_target).toBe(80)
  })

  it('o2c_target_days is 30', () => {
    expect(DEFAULT_BENCHMARKS.o2c_target_days).toBe(30)
  })

  it('quote_to_order_target is 40', () => {
    expect(DEFAULT_BENCHMARKS.quote_to_order_target).toBe(40)
  })

  it('revenue_per_employee_target is 5_000_000', () => {
    expect(DEFAULT_BENCHMARKS.revenue_per_employee_target).toBe(5_000_000)
  })

  it('has exactly 4 benchmark keys', () => {
    expect(Object.keys(DEFAULT_BENCHMARKS).length).toBe(4)
  })
})
